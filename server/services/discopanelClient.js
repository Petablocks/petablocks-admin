/**
 * PETABLOCKS Multi-Node DiscoPanel ConnectRPC Gateway Client
 *
 * Communicates with the `petablocks-discopanel` node agents running across:
 *   - PETABLOCKS-MCS1 (10.20.110.118:8080)
 *   - PETABLOCKS-MCS2 (10.20.110.119:8080)
 *   - PETABLOCKS-MCS3 (10.20.110.120:8080)
 *
 * Uses ConnectRPC JSON protocol (`POST /discopanel.v1.<Service>/<Method>`)
 * authenticated with `Authorization: Bearer <DISCOPANEL_INTERNAL_API_TOKEN || API_SECRET_TOKEN>`.
 */

const http = require('http');
const https = require('https');

const DISCOPANEL_PORT = parseInt(process.env.DISCOPANEL_PORT || '8080', 10);

function getInternalToken() {
  return process.env.DISCOPANEL_INTERNAL_API_TOKEN || process.env.API_SECRET_TOKEN || '';
}

function getNodeBaseUrl(nodeConfig) {
  if (!nodeConfig) throw new Error('Node configuration is required');
  if (nodeConfig.discopanelUrl) return nodeConfig.discopanelUrl.replace(/\/$/, '');
  const port = nodeConfig.discopanelPort || DISCOPANEL_PORT;
  return `http://${nodeConfig.host}:${port}`;
}

/**
 * Low-level HTTP JSON helper for ConnectRPC and custom PETABLOCKS endpoints
 */
function requestJson(baseUrl, rpcPath, payload = {}, timeoutMs = 12000, method = 'POST') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(rpcPath, baseUrl);
    const isHttps = urlObj.protocol === 'https:';
    const transport = isHttps ? https : http;
    const token = getInternalToken();

    const bodyStr = method === 'GET' ? '' : JSON.stringify(payload || {});
    const headers = {
      Accept: 'application/json',
      'Connect-Protocol-Version': '1',
    };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = transport.request(
      urlObj,
      {
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (_) {
            parsed = { raw };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const msg = parsed?.message || parsed?.error || `DiscoPanel HTTP ${res.statusCode}`;
            const err = new Error(msg);
            err.statusCode = res.statusCode;
            err.code = parsed?.code;
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`DiscoPanel RPC timed out after ${timeoutMs}ms (${rpcPath})`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (method !== 'GET' && bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Call any ConnectRPC method on a target node's DiscoPanel agent
 */
async function callRpc(nodeConfig, serviceName, methodName, payload = {}, timeoutMs = 12000) {
  const baseUrl = getNodeBaseUrl(nodeConfig);
  const rpcPath = `/discopanel.v1.${serviceName}/${methodName}`;
  return requestJson(baseUrl, rpcPath, payload, timeoutMs, 'POST');
}

/**
 * Check if DiscoPanel agent is reachable on a node
 */
async function checkAgentHealth(nodeConfig, timeoutMs = 2500) {
  try {
    const start = Date.now();
    await callRpc(nodeConfig, 'AuthService', 'GetAuthStatus', {}, timeoutMs);
    return { available: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Trigger PETABLOCKS non-destructive container discovery & adoption on a node
 */
async function adoptNodeContainers(nodeConfig, timeoutMs = 15000) {
  const baseUrl = getNodeBaseUrl(nodeConfig);
  return requestJson(baseUrl, '/api/v1/petablocks/adopt', {}, timeoutMs, 'POST');
}

// ── ServerService Wrappers ─────────────────────────────────────────

async function listServers(nodeConfig, fullStats = true) {
  const res = await callRpc(nodeConfig, 'ServerService', 'ListServers', { fullStats }, 8000);
  return res.servers || [];
}

async function getServer(nodeConfig, serverId) {
  const res = await callRpc(nodeConfig, 'ServerService', 'GetServer', { id: serverId }, 8000);
  return res.server || null;
}

async function getServerLogs(nodeConfig, serverId, tail = 250) {
  const res = await callRpc(nodeConfig, 'ServerService', 'GetServerLogs', { id: serverId, tail }, 8000);
  return res.logs || [];
}

async function clearServerLogs(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'ClearServerLogs', { id: serverId }, 8000);
}

async function createServer(nodeConfig, createPayload) {
  const res = await callRpc(nodeConfig, 'ServerService', 'CreateServer', createPayload, 30000);
  return res.server;
}

async function updateServer(nodeConfig, updatePayload) {
  const res = await callRpc(nodeConfig, 'ServerService', 'UpdateServer', updatePayload, 20000);
  return res.server;
}

async function deleteServer(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'DeleteServer', { id: serverId }, 20000);
}

async function startServer(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'StartServer', { id: serverId }, 25000);
}

async function stopServer(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'StopServer', { id: serverId }, 35000);
}

async function restartServer(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'RestartServer', { id: serverId }, 40000);
}

async function recreateServer(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'RecreateServer', { id: serverId }, 60000);
}

async function sendCommand(nodeConfig, serverId, command, silent = false) {
  return callRpc(nodeConfig, 'ServerService', 'SendCommand', { id: serverId, command, silent }, 10000);
}

async function uploadToMCLogs(nodeConfig, serverId) {
  return callRpc(nodeConfig, 'ServerService', 'UploadToMCLogs', { id: serverId }, 15000);
}

// ── ConfigService Wrappers ─────────────────────────────────────────

async function getServerConfig(nodeConfig, serverId) {
  const res = await callRpc(nodeConfig, 'ConfigService', 'GetServerConfig', { serverId }, 8000);
  return res.categories || [];
}

async function updateServerConfig(nodeConfig, serverId, updates) {
  const res = await callRpc(nodeConfig, 'ConfigService', 'UpdateServerConfig', { serverId, updates }, 12000);
  return res.categories || [];
}

// ── ModpackService Wrappers (Modrinth & CurseForge) ────────────────

async function searchModpacks(nodeConfig, { query = '', gameVersion = '', modLoader = '', indexer = 'modrinth', page = 1, pageSize = 20 }) {
  return callRpc(
    nodeConfig,
    'ModpackService',
    'SearchModpacks',
    { query, gameVersion, modLoader, indexer, page, pageSize },
    15000
  );
}

async function syncModpacks(nodeConfig, { query = '', gameVersion = '', modLoader = '', indexer = 'modrinth' }) {
  return callRpc(
    nodeConfig,
    'ModpackService',
    'SyncModpacks',
    { query, gameVersion, modLoader, indexer },
    25000
  );
}

async function getModpack(nodeConfig, modpackId) {
  const res = await callRpc(nodeConfig, 'ModpackService', 'GetModpack', { id: modpackId }, 10000);
  return res.modpack;
}

async function getModpackVersions(nodeConfig, { id, gameVersion = '', modLoader = '' }) {
  await callRpc(nodeConfig, 'ModpackService', 'SyncModpackFiles', { id }, 20000).catch(() => {});
  const res = await callRpc(
    nodeConfig,
    'ModpackService',
    'GetModpackVersions',
    { id, gameVersion, modLoader },
    12000
  );
  return res.versions || [];
}

async function getModpackFiles(nodeConfig, modpackId) {
  await callRpc(nodeConfig, 'ModpackService', 'SyncModpackFiles', { id: modpackId }, 20000).catch(() => {});
  const res = await callRpc(nodeConfig, 'ModpackService', 'GetModpackFiles', { id: modpackId }, 12000);
  return res.files || [];
}

// ── ModService Wrappers ────────────────────────────────────────────

async function listMods(nodeConfig, serverId) {
  const res = await callRpc(nodeConfig, 'ModService', 'ListMods', { serverId }, 10000);
  return res.mods || [];
}

async function updateMod(nodeConfig, { serverId, modId, displayName, description, enabled }) {
  const payload = { serverId, modId };
  if (displayName !== undefined) payload.displayName = displayName;
  if (description !== undefined) payload.description = description;
  if (enabled !== undefined) payload.enabled = enabled;
  return callRpc(nodeConfig, 'ModService', 'UpdateMod', payload, 10000);
}

async function deleteMod(nodeConfig, serverId, modId) {
  return callRpc(nodeConfig, 'ModService', 'DeleteMod', { serverId, modId }, 10000);
}

// ── FileService Wrappers ───────────────────────────────────────────

async function listFiles(nodeConfig, serverId, subPath = '', tree = false) {
  const res = await callRpc(nodeConfig, 'FileService', 'ListFiles', { serverId, path: subPath, tree }, 10000);
  return res.files || [];
}

async function getFile(nodeConfig, serverId, filePath) {
  const res = await callRpc(nodeConfig, 'FileService', 'GetFile', { serverId, path: filePath }, 12000);
  // ConnectRPC encodes bytes as base64 in JSON
  const content = res.content ? Buffer.from(res.content, 'base64').toString('utf8') : '';
  return { content, mimeType: res.mimeType || 'text/plain' };
}

async function updateFile(nodeConfig, serverId, filePath, contentString) {
  const base64Content = Buffer.from(contentString, 'utf8').toString('base64');
  return callRpc(nodeConfig, 'FileService', 'UpdateFile', {
    serverId,
    path: filePath,
    content: base64Content,
  }, 15000);
}

async function deleteFile(nodeConfig, serverId, filePath) {
  return callRpc(nodeConfig, 'FileService', 'DeleteFile', { serverId, path: filePath }, 12000);
}

async function createFolder(nodeConfig, serverId, folderPath) {
  return callRpc(nodeConfig, 'FileService', 'CreateFolder', { serverId, path: folderPath }, 10000);
}

async function renameFile(nodeConfig, serverId, oldPath, newName) {
  return callRpc(nodeConfig, 'FileService', 'RenameFile', { serverId, path: oldPath, newName }, 10000);
}

async function extractArchive(nodeConfig, serverId, archivePath) {
  return callRpc(nodeConfig, 'FileService', 'ExtractArchive', { serverId, path: archivePath }, 30000);
}

async function createArchive(nodeConfig, serverId, paths, archiveName) {
  return callRpc(nodeConfig, 'FileService', 'CreateArchive', { serverId, paths, archiveName }, 30000);
}

// ── ModuleService Wrappers (Sidecars: BlueMap, Voice Chat, etc.) ───

async function listModuleTemplates(nodeConfig) {
  const res = await callRpc(nodeConfig, 'ModuleService', 'ListModuleTemplates', {}, 10000);
  return res.templates || [];
}

async function listModules(nodeConfig, serverId = '') {
  const res = await callRpc(nodeConfig, 'ModuleService', 'ListModules', { serverId }, 10000);
  return res.modules || [];
}

async function createModule(nodeConfig, createPayload) {
  return callRpc(nodeConfig, 'ModuleService', 'CreateModule', createPayload, 25000);
}

async function startModule(nodeConfig, moduleId) {
  return callRpc(nodeConfig, 'ModuleService', 'StartModule', { id: moduleId }, 20000);
}

async function stopModule(nodeConfig, moduleId) {
  return callRpc(nodeConfig, 'ModuleService', 'StopModule', { id: moduleId }, 20000);
}

async function restartModule(nodeConfig, moduleId) {
  return callRpc(nodeConfig, 'ModuleService', 'RestartModule', { id: moduleId }, 25000);
}

async function deleteModule(nodeConfig, moduleId) {
  return callRpc(nodeConfig, 'ModuleService', 'DeleteModule', { id: moduleId }, 20000);
}

async function getModuleLogs(nodeConfig, moduleId, tail = 150) {
  const res = await callRpc(nodeConfig, 'ModuleService', 'GetModuleLogs', { id: moduleId, tail }, 10000);
  return res.logs || [];
}

/**
 * Maps DiscoPanel protobuf ModLoader enum or string to human-readable PETABLOCKS loader label
 */
function formatProtoLoader(modLoader) {
  const raw = String(modLoader || '').replace('MOD_LOADER_', '').toUpperCase();
  const map = {
    NEOFORGE: 'NeoForge',
    FABRIC: 'Fabric',
    FORGE: 'Forge',
    PAPER: 'Paper',
    PURPUR: 'Purpur',
    SPIGOT: 'Spigot',
    BUKKIT: 'Bukkit',
    MODRINTH: 'Modrinth',
    AUTO_CURSEFORGE: 'CurseForge',
    CURSEFORGE: 'CurseForge',
    VANILLA: 'Vanilla',
    CUSTOM: 'Custom',
  };
  return map[raw] || raw || 'Vanilla';
}

/**
 * Maps PETABLOCKS loader string to DiscoPanel proto ModLoader enum string
 */
function toProtoLoaderEnum(loader) {
  const raw = String(loader || 'VANILLA').toUpperCase().replace(/[^A-Z_]/g, '');
  const map = {
    NEOFORGE: 'MOD_LOADER_NEOFORGE',
    FABRIC: 'MOD_LOADER_FABRIC',
    FORGE: 'MOD_LOADER_FORGE',
    PAPER: 'MOD_LOADER_PAPER',
    PURPUR: 'MOD_LOADER_PURPUR',
    SPIGOT: 'MOD_LOADER_SPIGOT',
    MODRINTH: 'MOD_LOADER_MODRINTH',
    CURSEFORGE: 'MOD_LOADER_AUTO_CURSEFORGE',
    AUTO_CURSEFORGE: 'MOD_LOADER_AUTO_CURSEFORGE',
    VANILLA: 'MOD_LOADER_VANILLA',
    CUSTOM: 'MOD_LOADER_CUSTOM',
  };
  return map[raw] || 'MOD_LOADER_NEOFORGE';
}

module.exports = {
  callRpc,
  checkAgentHealth,
  adoptNodeContainers,
  listServers,
  getServer,
  getServerLogs,
  clearServerLogs,
  createServer,
  updateServer,
  deleteServer,
  startServer,
  stopServer,
  restartServer,
  recreateServer,
  sendCommand,
  uploadToMCLogs,
  getServerConfig,
  updateServerConfig,
  searchModpacks,
  syncModpacks,
  getModpack,
  getModpackVersions,
  getModpackFiles,
  listMods,
  updateMod,
  deleteMod,
  listFiles,
  getFile,
  updateFile,
  deleteFile,
  createFolder,
  renameFile,
  extractArchive,
  createArchive,
  listModuleTemplates,
  listModules,
  createModule,
  startModule,
  stopModule,
  restartModule,
  deleteModule,
  getModuleLogs,
  formatProtoLoader,
  toProtoLoaderEnum,
};
