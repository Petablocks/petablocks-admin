const fs = require('fs');
const path = require('path');

// Reference path to bundled release JARs
const RELEASES_DIR = path.join(__dirname, '../data/telemetry-releases');
const MANIFEST_PATH = path.join(RELEASES_DIR, 'manifest.json');

function getInstallerSecretToken() {
  const token = process.env.API_SECRET_TOKEN;
  if (!token) throw new Error('API_SECRET_TOKEN is not configured; refusing to install telemetry without a secret');
  return token;
}

function getManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[TELEMETRY-INSTALLER] Failed to read manifest:', err.message);
  }
  return {
    latestVersion: '1.4.0',
    releaseDate: '2026-09-29',
    artifacts: {
      neoforge: { filename: 'PetablocksTelemetry-NeoForge-1.21.1-1.4.0.jar', targetDir: 'mods', configPath: 'config/petablocks-telemetry.json' },
      fabric: { filename: 'PetablocksTelemetry-Fabric-1.20.1-1.4.0.jar', targetDir: 'mods', configPath: 'config/petablocks-telemetry.json' },
      paper: { filename: 'PetablocksTelemetry-Paper-1.21.4-1.4.0.jar', targetDir: 'plugins', configPath: 'plugins/PetablocksTelemetry/config.json' },
      velocity: { filename: 'PetablocksTelemetry-Velocity-1.4.0.jar', targetDir: 'plugins', configPath: 'plugins/petablocks_telemetry/config.json' }
    }
  };
}

function resolvePlatform(serverType) {
  const t = (serverType || '').toLowerCase();
  if (t.includes('velocity')) return 'velocity';
  if (t.includes('paper') || t.includes('spigot') || t.includes('purpur')) return 'paper';
  if (t.includes('neoforge')) return 'neoforge';
  if (t.includes('fabric')) return 'fabric';
  return 'neoforge';
}

/**
 * Inspect server filesystem and active bridge state to determine installed telemetry version
 */
async function getTelemetryStatus(server, node, runSshCommand, modConnectedSockets = new Map()) {
  const manifest = getManifest();
  const platform = resolvePlatform(server.type);
  const artifactConfig = manifest.artifacts[platform] || manifest.artifacts.neoforge;

  const targetDir = path.posix.join(server.dataPath, artifactConfig.targetDir);
  const configPath = path.posix.join(server.dataPath, artifactConfig.configPath);

  const isConnected = modConnectedSockets.has(server.id);

  // Command to inspect files in targetDir and check config existence
  const scanCmd = `python3 -c "
import os, json, re

target_dir = '${targetDir}'
config_path = '${configPath}'

installed_jar = None
enabled = False
version = None

if os.path.exists(target_dir):
    for f in os.scandir(target_dir):
        if 'telemetry' in f.name.lower() and (f.name.endswith('.jar') or f.name.endswith('.jar.disabled')):
            installed_jar = f.name
            enabled = f.name.endswith('.jar')
            m = re.search(r'([0-9]+\\.[0-9]+\\.[0-9]+)', f.name)
            if m:
                version = m.group(1)
            break

config_exists = os.path.exists(config_path)

print(json.dumps({
    'installedJar': installed_jar,
    'enabled': enabled,
    'installedVersion': version,
    'configExists': config_exists
}))
" 2>/dev/null || echo '{"installedJar":null,"enabled":false,"installedVersion":null,"configExists":false}'`;

  try {
    const { stdout } = await runSshCommand(node, scanCmd, 8000);
    const parsed = JSON.parse(stdout || '{}');

    let status = 'not_installed';
    if (parsed.installedJar) {
      if (!parsed.enabled) {
        status = 'disabled';
      } else if (parsed.installedVersion === manifest.latestVersion) {
        status = 'up_to_date';
      } else {
        status = 'update_available';
      }
    }

    return {
      serverId: server.id,
      serverName: server.name,
      platform,
      targetDir,
      configPath,
      installed: !!parsed.installedJar,
      installedJar: parsed.installedJar,
      enabled: parsed.enabled,
      installedVersion: parsed.installedVersion,
      latestVersion: manifest.latestVersion,
      status, // 'up_to_date' | 'update_available' | 'disabled' | 'not_installed'
      configExists: parsed.configExists,
      connected: isConnected,
      releaseDate: manifest.releaseDate
    };
  } catch (err) {
    return {
      serverId: server.id,
      serverName: server.name,
      platform,
      installed: false,
      installedJar: null,
      enabled: false,
      installedVersion: null,
      latestVersion: manifest.latestVersion,
      status: 'unknown',
      error: err.message,
      connected: isConnected
    };
  }
}

/**
 * Install or update telemetry mod/plugin onto the target server
 */
async function installOrUpdateTelemetry(server, node, options = {}, runSshCommand) {
  const manifest = getManifest();
  const platform = resolvePlatform(server.type);
  const artifactConfig = manifest.artifacts[platform] || manifest.artifacts.neoforge;

  const releaseJarPath = path.join(RELEASES_DIR, `v${manifest.latestVersion}`, artifactConfig.filename);
  if (!fs.existsSync(releaseJarPath)) {
    throw new Error(`Release artifact not found on admin server: ${releaseJarPath}`);
  }

  const jarBuffer = fs.readFileSync(releaseJarPath);
  const base64Jar = jarBuffer.toString('base64');

  const targetDir = path.posix.join(server.dataPath, artifactConfig.targetDir);
  const finalJarName = artifactConfig.filename;
  const tempJarPath = path.posix.join(targetDir, `${finalJarName}.tmp`);
  const finalJarPath = path.posix.join(targetDir, finalJarName);

  const configPath = path.posix.join(server.dataPath, artifactConfig.configPath);
  const configDir = path.posix.dirname(configPath);

  // Default configuration payload
  const defaultConf = {
    gatewayUrl: process.env.TELEMETRY_INTERNAL_WS_URL || 'ws://10.20.110.116:3000/ws/servers/bridge',
    serverId: server.id,
    apiSecretToken: getInstallerSecretToken(),
    telemetryIntervalSeconds: 5,
    idleIntervalSeconds: 15,
    enableChatLogging: true,
    enableModSpecificMetrics: true,
    reconnectBackoffInitialSeconds: 3,
    reconnectBackoffMaxSeconds: 60,
    afkThresholdSeconds: 300,
    lagSpikeThresholdMs: 100
  };
  const base64Config = Buffer.from(JSON.stringify(defaultConf, null, 2)).toString('base64');

  // Atomic deployment script
  const deployScript = `
mkdir -p '${targetDir}'
echo '${base64Jar}' | base64 -d > '${tempJarPath}'
rm -f '${targetDir}'/*PetablocksTelemetry*.jar '${targetDir}'/*PetablocksTelemetry*.jar.disabled '${targetDir}'/*petablocks-telemetry*.jar*
mv '${tempJarPath}' '${finalJarPath}'

if [ ! -f '${configPath}' ]; then
  mkdir -p '${configDir}'
  echo '${base64Config}' | base64 -d > '${configPath}'
fi
`;

  const { code, stderr } = await runSshCommand(node, deployScript, 30000);
  if (code !== 0) {
    throw new Error(stderr || 'Failed to deploy telemetry JAR over SSH');
  }

  let restartTriggered = false;
  if (options.restartImmediately) {
    try {
      // Send warning announcement first
      const warnCmd = `docker exec ${server.containerName} rcon-cli "say [PETABLOCKS] Server restarting to apply Telemetry v${manifest.latestVersion} update..." 2>/dev/null || true`;
      await runSshCommand(node, warnCmd, 5000);
      
      // Trigger container restart
      const restartCmd = `docker restart ${server.containerName}`;
      await runSshCommand(node, restartCmd, 20000);
      restartTriggered = true;
    } catch (rErr) {
      console.warn(`[TELEMETRY-INSTALLER] Warning restarting container ${server.containerName}:`, rErr.message);
    }
  }

  return {
    success: true,
    serverId: server.id,
    installedVersion: manifest.latestVersion,
    filename: finalJarName,
    restartRequired: true,
    restartTriggered,
    message: restartTriggered
      ? `Installed ${finalJarName} and restarted container successfully.`
      : `Installed ${finalJarName}. Restart server to activate.`
  };
}

/**
 * Read current configuration file for a server
 */
async function getTelemetryConfig(server, node, runSshCommand) {
  const manifest = getManifest();
  const platform = resolvePlatform(server.type);
  const artifactConfig = manifest.artifacts[platform] || manifest.artifacts.neoforge;
  const configPath = path.posix.join(server.dataPath, artifactConfig.configPath);

  const cmd = `cat '${configPath}' 2>/dev/null || echo '{}'`;
  const { stdout } = await runSshCommand(node, cmd, 5000);
  try {
    return JSON.parse(stdout);
  } catch (_) {
    return {};
  }
}

/**
 * Save updated configuration for a server
 */
async function saveTelemetryConfig(server, node, configObj, runSshCommand) {
  const manifest = getManifest();
  const platform = resolvePlatform(server.type);
  const artifactConfig = manifest.artifacts[platform] || manifest.artifacts.neoforge;
  const configPath = path.posix.join(server.dataPath, artifactConfig.configPath);
  const configDir = path.posix.dirname(configPath);

  const base64 = Buffer.from(JSON.stringify(configObj, null, 2)).toString('base64');
  const cmd = `mkdir -p '${configDir}' && echo '${base64}' | base64 -d > '${configPath}'`;
  const { code, stderr } = await runSshCommand(node, cmd, 8000);
  if (code !== 0) throw new Error(stderr || 'Failed to save config');
  return { success: true };
}

module.exports = {
  getManifest,
  getTelemetryStatus,
  installOrUpdateTelemetry,
  getTelemetryConfig,
  saveTelemetryConfig,
};
