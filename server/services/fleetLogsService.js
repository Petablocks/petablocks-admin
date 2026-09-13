/**
 * PETABLOCKS Fleet Log Search & Diagnostics Service
 *
 * Provides real-time cross-cluster log aggregation, full-text & regex querying,
 * severity filtering, and incident pattern matching across MCS-01, MCS-02, and MCS-03.
 */

const { NODES, SERVERS_REGISTRY, runSshCommand } = require('../routes/serverManager');

const LOG_LINE_REGEX = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^/\]]+)\/([A-Z]+)\](?:\s+\[([^\]]+)\])?:\s*(.*)$/;

/**
 * Clean & sanitize search pattern for shell execution
 */
function sanitizePattern(str) {
  if (!str) return '';
  // Remove dangerous shell control characters
  return str.replace(/[`$\\!;|&]/g, '').trim();
}

/**
 * Parse raw Minecraft log string into structured entry
 */
function parseLogLine(rawLine, serverId, serverName, index) {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const match = trimmed.match(LOG_LINE_REGEX);
  if (match) {
    const [, timeStr, thread, rawLevel, logger, message] = match;
    const level = rawLevel.toUpperCase();
    return {
      id: `${serverId}-${Date.now()}-${index}`,
      timeStr,
      thread: thread.trim(),
      level: ['INFO', 'WARN', 'ERROR', 'FATAL', 'DEBUG'].includes(level) ? level : 'INFO',
      logger: logger ? logger.trim() : '',
      message: message || '',
      raw: trimmed,
      serverId,
      serverName,
    };
  }

  // Fallback for stack traces, multiline exceptions or unformatted output
  let level = 'INFO';
  if (/error|exception|fatal|caused by/i.test(trimmed)) {
    level = 'ERROR';
  } else if (/warn|warning/i.test(trimmed)) {
    level = 'WARN';
  }

  return {
    id: `${serverId}-${Date.now()}-${index}`,
    timeStr: '—',
    thread: 'System',
    level,
    logger: '',
    message: trimmed,
    raw: trimmed,
    serverId,
    serverName,
  };
}

/**
 * Execute search query across cluster nodes
 */
async function searchFleetLogs(options = {}) {
  const {
    query = '',
    isRegex = false,
    servers = ['fabric-main', 'create-2', 'patreon-creative'],
    severity = 'ALL',
    limit = 150,
    tailLines = 1500,
  } = options;

  const targetServers = SERVERS_REGISTRY.filter((s) => servers.includes(s.id));
  const cleanQuery = sanitizePattern(query);

  const serverResults = await Promise.allSettled(
    targetServers.map(async (server) => {
      const node = NODES[server.nodeId];
      if (!node) throw new Error(`Node ${server.nodeId} not registered`);

      const logPath = `${server.dataPath}/logs/latest.log`;
      let command = '';

      if (cleanQuery) {
        if (isRegex) {
          command = `if [ -f "${logPath}" ]; then tail -n ${tailLines} "${logPath}" | grep -E -i "${cleanQuery}" | tail -n ${limit}; else docker logs --tail ${tailLines} "${server.containerName}" 2>&1 | grep -E -i "${cleanQuery}" | tail -n ${limit}; fi`;
        } else {
          command = `if [ -f "${logPath}" ]; then tail -n ${tailLines} "${logPath}" | grep -F -i "${cleanQuery}" | tail -n ${limit}; else docker logs --tail ${tailLines} "${server.containerName}" 2>&1 | grep -F -i "${cleanQuery}" | tail -n ${limit}; fi`;
        }
      } else {
        command = `if [ -f "${logPath}" ]; then tail -n ${limit} "${logPath}"; else docker logs --tail ${limit} "${server.containerName}" 2>&1; fi`;
      }

      try {
        const { stdout } = await runSshCommand(node, command, 10000);
        const lines = (stdout || '').split('\n').filter(Boolean);
        return {
          serverId: server.id,
          serverName: server.name,
          lines,
          error: null,
        };
      } catch (err) {
        // Fallback: query docker logs
        try {
          const fallbackCmd = `docker logs --tail ${limit} "${server.containerName}" 2>&1`;
          const { stdout } = await runSshCommand(node, fallbackCmd, 6000);
          const lines = (stdout || '').split('\n').filter(Boolean);
          return {
            serverId: server.id,
            serverName: server.name,
            lines,
            error: null,
          };
        } catch (innerErr) {
          return {
            serverId: server.id,
            serverName: server.name,
            lines: [],
            error: err.message,
          };
        }
      }
    })
  );

  let combinedLogs = [];
  const countsByServer = {};
  const countsBySeverity = { INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
  const incidents = {
    lag: 0,
    train: 0,
    crashes: 0,
    disconnects: 0,
    memory: 0,
  };

  serverResults.forEach((res) => {
    if (res.status !== 'fulfilled') return;
    const { serverId, serverName, lines } = res.value;
    countsByServer[serverId] = 0;

    lines.forEach((line, idx) => {
      const parsed = parseLogLine(line, serverId, serverName, idx);
      if (!parsed) return;

      // Incident pattern counters
      const lower = parsed.raw.toLowerCase();
      if (/can't keep up|overloaded|behind|tick took/i.test(lower)) incidents.lag++;
      if (/train|carriage|derail|signal|station/i.test(lower)) incidents.train++;
      if (/exception|crashreport|fatal|nullpointerexception/i.test(lower)) incidents.crashes++;
      if (/lost connection|timed out|disconnect|kicked/i.test(lower)) incidents.disconnects++;
      if (/outofmemory|gc|heap|garbage collector/i.test(lower)) incidents.memory++;

      // Filter by severity if requested
      if (severity !== 'ALL' && parsed.level !== severity) {
        return;
      }

      countsBySeverity[parsed.level] = (countsBySeverity[parsed.level] || 0) + 1;
      countsByServer[serverId]++;
      combinedLogs.push(parsed);
    });
  });

  // Sort by timeStr if available or maintain order
  combinedLogs.sort((a, b) => {
    if (a.timeStr !== '—' && b.timeStr !== '—') {
      return b.timeStr.localeCompare(a.timeStr);
    }
    return 0;
  });

  return {
    success: true,
    summary: {
      totalFound: combinedLogs.length,
      countsByServer,
      countsBySeverity,
      incidents,
      scannedServers: targetServers.map((s) => ({ id: s.id, name: s.name, node: s.nodeId })),
    },
    logs: combinedLogs.slice(0, limit),
  };
}

module.exports = {
  searchFleetLogs,
  parseLogLine,
};
