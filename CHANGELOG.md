# 📝 PETABLOCKS Admin Portal — Changelog

All notable changes to the PETABLOCKS Admin & Operations Portal will be documented in this file.

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
  - **Live Player Roster**: Connected players with 3D avatar head renders (via Crafatar) and direct kick actions.
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
