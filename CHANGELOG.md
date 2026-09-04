# 📝 PETABLOCKS Admin Portal — Changelog

All notable changes to the PETABLOCKS Admin & Operations Portal will be documented in this file.

## [1.7.1] - 2026-09-04
### Fixed
- **Database Routing Mismatch**: Updated `maintenanceService.js` and `playerAnalyticsService.js` to automatically target the `petablocks` database when `MC_DATABASE_URL` specifies port `3307`, preventing split-database state where maintenance windows created in `petablocks` were invisible to the admin runner.
- **Missing Module Import**: Added missing `const fs = require('fs');` import in `server/routes/serverManager.js` required for SSH key file checks.

## [1.7.0] - 2026-09-03
### Added
- **🤖 Autonomous Maintenance Execution Engine (`maintenanceRunner.js`)**:
  - Continuous background evaluation of scheduled maintenance windows with zero human intervention required.
  - Advance in-game countdown warnings at 15m, 5m, and 1m via `/tellraw` broadcasts.
  - Automatic transition to `in_progress`, locking the companion mod gateway and kicking non-whitelisted players.
  - Safe world data flush via `/save-all flush` before initiating container reboots.
  - Automated Docker container restarts across target VM nodes via SSH to apply staged mod jars.
  - Continuous TCP port and WebSocket telemetry health polling before auto-completing windows.
  - Automatic unlock of in-game gateway, Discord notification update, and website banner clearance.
  - Added `POST /api/maintenance/:id/trigger-pipeline` for on-demand pipeline execution.
- **🎨 Categorized Navigation Sidebar Redesign (`Layout.tsx`)**:
  - Reorganized flat 12-item list into semantic domains: `OVERVIEW`, `GAME OPERATIONS`, `INFRASTRUCTURE`, and `SYSTEM`.
  - Added subtle uppercase section headers and active page left accent indicators.
  - Live dynamic badges: real-time fleet player count pill (`online`) on Live Telemetry, and maintenance state badges (`ACTIVE` / `SCHED`) on Maintenance Hub.
- **📜 Standard Operating Procedures (`STANDARD_PROCEDURES.md`)**:
  - Authoritative operational guide for AI coding agents on SemVer versioning, changelog maintenance, pre-commit build checks, and public repo safety.

### Security
- **🛡️ Public Repository Security Sanitization**:
  - Removed all hardcoded SSH private keys, MariaDB credentials, RCON passwords, and Discord webhook tokens from source code.
  - Fully transitioned to environment variables (`process.env.*`) with safe generic local fallbacks.
  - Added `.env.example` template documenting all configuration keys.

---

## [1.6.0] - 2026-09-02
### Added
- **🎮 Native Minecraft Server Management Platform (`/servers`)**:
  - Ground-up Discopanel replacement managing Docker containers across dedicated VM nodes via pure JS `ssh2`.
  - **Server Fleet Overview**: Live server cards with running/stopped status, CPU %, RAM allocation vs. usage, and quick power controls (Start, Stop with 30s graceful world save, Restart).
  - **Interactive Real-Time Terminal (`/servers/:nodeId/:serverId`)**: Color-coded Docker logs with severity filtering, auto-scroll toggle, and live command execution prompt via RCON/stdin.
  - **In-Browser File Manager & Code Editor**: Full directory tree navigation, file upload (up to 500 MB), file deletion, and built-in editor for `server.properties`, JSON configs, TOML files, and KubeJS scripts with safe base64 encoding.
  - **Mod Manager**: Scans `mods/` directory with live search, file sizes, modification timestamps, and 1-click toggle enable/disable switches (`.jar` $\leftrightarrow$ `.jar.disabled`).
  - **Player & Access Management**: In-browser inspection and management of Server Operators (`ops.json`), Whitelist (`whitelist.json`), and Banned Players (`banned-players.json`).
  - **✨ Server Creation Wizard (`CreateServerModal`)**: Multi-step wizard supporting Mod Loaders (`NeoForge`, `Fabric`, `Forge`, `Vanilla`, `Paper/Purpur`), Minecraft version selection, RAM allocation (`4G` to `32G`), target VM node selection, and automatic port binding.
- **🌐 VM Cluster & Node Infrastructure Manager (`/nodes`)**:
  - Live health monitoring of dedicated server host VMs (`PETABLOCKS-MCS`, `PETABLOCKS-FEA`) with real-time CPU core counts, RAM utilization gauges, NVMe disk headroom, and SSH latency.
  - **1-Line VM Provisioning Script**: Automated bootstrap command to connect new dedicated Minecraft VMs to the cluster with zero manual configuration.

---

## [1.5.0] - 2026-09-02
### Added
- **🗃️ World & Full Server Backup System (`/backups`)**:
  - Pure JavaScript `ssh2` streaming engine: connects directly to `PETABLOCKS-MCS` (`10.20.110.115`) and streams remote `tar` archives directly into MinIO S3 (`world-backups` bucket) with zero external binary or Alpine package dependencies.
  - **Full Server Backups for Discopanel Migration**: Archives all server files (mods, configs, KubeJS scripts, world dimensions, ops/whitelist, schematics) while excluding re-downloadable libraries, debug logs, and map tiles.
  - **World-Only Snapshots**: Lightweight archives targeting all active world dimensions (`world/`, `world_Creative/`, `world_PBC2/`).
  - **Zero-DB Resilience**: Uses MinIO S3 as the direct source of truth for stored backups with in-memory tracking for active running jobs and live byte transfer counters.
  - **Robust Error Handling & Polling**: Displays clear failure diagnostics in-modal, auto-polls every 3 seconds during active streams, and generates 24-hour presigned download links.
- **🔔 Discord Webhook Notifications & Test Ping (`/settings`)**:
  - Integrated webhook manager with live test ping button and environment configuration snippets.

---

## [1.4.0] - 2026-08-28
### Added
- **🖥️ Dedicated Server Detail Operations Pages (`/minecraft/:id`)**:
  - Full-page server deep-dive dashboard with dedicated URL routing for each realm (`/minecraft/fabric-main`, `/minecraft/create-2`, `/minecraft/patreon-creative`).
  - **Core Performance Vitals**: Live TPS gauge with 50ms tick load progress bar, MSPT, and tick headroom calculations.
  - **JVM Heap Memory & GC Tracking**: Heap utilization (`Used / Max GB`), Allocated RAM, and last-minute GC pause durations.
  - **Multi-Dimension World Simulation Breakdown**: Real-time loaded chunks, active entity counts, and tile/block entities across Overworld, Nether, The End, and modded dimensions.
  - **Live Connected Player Roster**: Player head skin avatars, Ping latency (ms), Dimension location, exact coordinates $[X, Y, Z]$, Health ♥ bar, and 1-click Kick moderation.
  - **Dedicated Web RCON Console**: Realm-scoped interactive console with timestamped execution history and diagnostic macro pills.
- **🎨 Authentic In-Game Minecraft MOTD Renderer (`<MinecraftMotd />`)**:
  - Full parser supporting Minecraft formatting codes (`§0` - `§f`, `§l` bold, `§o` italic, `§n` underline, `§m` strikethrough, `§r` reset), hex colors (`§x`), and multi-line breaks (`\n`).
  - Rendered with authentic Minecraft monospace font, text drop shadow, and dark multiplayer banner styling.
- **📱 iOS & Mobile Responsive Overhaul**:
  - Slide-over navigation drawer with backdrop blur, auto-closing links, and animated hamburger toggle.
  - Injected `viewport-fit=cover`, dynamic viewport heights (`100dvh`), and safe-area insets (`env(safe-area-inset-*)`) for iPhone notch and home indicator bar.
  - Touch-optimized container action cards on mobile with real-time CPU/RAM stats.
- **🚀 Automated CI/CD Deployment Pipeline (`.github/workflows/deploy.yml`)**:
  - Automated deployment workflow triggering on every push to `main` via MDRCloud self-hosted runner pool.
  - Syncs to `/opt/petablocks/admin/` on `PETABLOCKS-FEA` (`10.20.110.116`), rebuilds `pb-admin` container, and dispatches Discord receipts.

---

## [1.3.0] - 2026-08-27
### Added
- **🔴 Live Console Log Streaming (`latest.log`)**:
  - Real-time Server-Sent Events (SSE) log stream (`GET /api/minecraft/logs/stream`) with auto-reconnect and keepalive heartbeats.
  - Severity level filtering (`ALL`, `INFO`, `WARN`, `ERROR`, `CHAT`, `COMMAND`) with color-coded syntax formatting.
  - Live log text search filter.
  - Pause / Resume stream controls and auto-scroll toggle.
  - Direct log file export / download (`.log`).
- **⚖️ Player Moderation & Ban Management**:
  - Dedicated moderation panel with active banlist viewer (`/banlist players`) and whitelist viewer (`/whitelist list`).
  - Action execution form supporting **Ban**, **Pardon / Unban**, **Kick**, **Add/Remove Whitelist**, and **OP/DEOP**.
  - **Audit Logging**: Persists all staff moderation actions to MariaDB `petablocks_admin.moderation_logs`.
- **DNS SRV & SLP VarInt Protocol Resolution**:
  - Automatic DNS SRV record lookup (`_minecraft._tcp.<domain>`) resolving realm game ports (`11691`, `11681`, `11651`).
  - Strict VarInt length and protocol state byte packing for zero false-offline status pings.

---

## [1.2.0] - 2026-08-26
### Added
- **Minecraft Server Management & Deep Telemetry**:
  - Live TCP Server List Ping (SLP) telemetry with real-time ping latency, online player counts vs. max limit, and MOTDs across all realms.
  - Interactive **Web RCON Terminal** with multi-server targeting, command history log, and quick macros (`/tps`, `/list`, `/whitelist list`, `/save-all`, `/seed`).
  - **In-Game Network Broadcast System** (`/tellraw` chat announcements and `/title` full-screen alerts).
  - **Live Player Roster**: Connected players with 3D avatar head renders and direct kick actions.
  - **Plan & LuckPerms DB Analytics**: Rank distribution breakdown and top playtime leaderboard queried from MariaDB `:3307`.
- **MinIO S3 File Manager**:
  - Direct file browser for object storage with bucket management, drag-and-drop file uploads, folder creation, delete actions, and image lightboxes.
- **MDRCloud Infrastructure Footer**: Host attribution and live IP addresses (`FEA: 10.20.110.116`, `DB: 10.20.110.117`).

---

## [1.1.0] - 2026-08-25
### Added
- **Docker Container Management**: Live Docker container listing, CPU/Memory telemetry gauges, and restart/stop controls.
- **Database Metrics & Explorer**: Query monitors for `pb-mariadb-fea` (:3306) and `pb-mariadb-mc` (:3307).

---

## [1.0.0] - 2026-08-20
### Added
- Initial Admin Portal release with Cloudflare Zero Trust Access authentication at `admin.petablocks.com`.
