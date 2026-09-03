# 🛡️ PETABLOCKS Admin Portal (`petablocks-admin`)

> Comprehensive administration, container operations, object storage, live console streaming, autonomous maintenance pipelines, and Minecraft server telemetry platform for the PETABLOCKS ecosystem.
>
> 🚀 **Hosted & Powered by [MDRCloud](https://mdrcloud.com)** • **Version**: `v1.7.0` • **Endpoint**: `https://admin.petablocks.com`

---

## 🌟 Modules & Core Features

### 1. 🤖 Autonomous Maintenance Hub (`/maintenance`)
* **Automated Maintenance Execution Engine**: Background runner that executes scheduled updates with zero human intervention.
* **Advance In-Game Warnings**: Automated countdown warnings ($T-15\text{m}$, $T-5\text{m}$, $T-1\text{m}$) broadcasted via `/tellraw`.
* **Zero-Downtime Pipeline**: Automated world save (`/save-all flush`), container restart via SSH, TCP port & WebSocket health verification, and gateway unlock.
* **Multi-Channel Synchronous Broadcasts**: Real-time Discord announcements with status transitions and live website banner updates.

### 2. 🎮 Minecraft Server Operations (`/servers` & `/minecraft`)
* **Native Server Management**: Pure JavaScript SSH/Docker bridge to dedicated game nodes (`mcs-01`, `mcs-02`, `mcs-03`).
* **Live Server List Ping (SLP)**: DNS SRV resolution with real-time latency tracking, player limits, and authentic in-game formatted MOTD rendering.
* **Live Telemetry & Diagnostics**: Real-time TPS gauge, MSPT, JVM Heap & GC pause tracking, entity counts, loaded chunks per dimension, and mini-spark lag spike alerts.
* **Server File Manager & Config Editor**: In-browser directory navigation, upload, deletion, and safe editing for configs and KubeJS scripts.
* **Mod Manager**: Scans `mods/` directory with live search, timestamps, and 1-click toggle switches (`.jar` $\leftrightarrow$ `.jar.disabled`).
* **Connected Player Roster**: Player avatars, ping, dimension coordinates, health status, and moderation controls.

### 3. 👥 Player Analytics & Retention (`/analytics`)
* **Session Tracking**: Real-time tracking of active sessions, total play hours, AFK detection, and retention metrics.
* **Player Activity History**: Movement and rotation tracking synced from the companion telemetry mod.

### 4. 🗃️ World & Fleet Backup System (`/backups`)
* **Direct S3 Streaming**: Pure JavaScript SSH streaming engine archiving remote server files and world dimensions directly into MinIO S3.
* **Full Server & World-Only Snapshots**: Granular backup options with live byte transfer progress and 24-hour presigned download links.

### 5. 🌐 Infrastructure & VM Nodes (`/nodes`, `/containers`, `/databases`)
* **Cluster VM Health**: Real-time CPU, RAM, and NVMe disk headroom monitoring across `PETABLOCKS-MCS1`, `MCS2`, `MCS3`, and `FEA`.
* **Docker Containers**: Container logs, power actions, and metrics via `/var/run/docker.sock`.
* **Database Telemetry**: MariaDB cluster metrics and table health.

---

## 🧭 Navigation & UX
* **Categorized Navigation**: Logically organized into `OVERVIEW`, `GAME OPERATIONS`, `INFRASTRUCTURE`, and `SYSTEM` domains.
* **Live Status Badges**: Dynamic indicators showing live online players and maintenance state (`ACTIVE` / `SCHED`).
* **Mobile Ready**: Slide-over drawer with backdrop blur, touch momentum scrolling, and safe-area insets.

---

## 🔒 Security & Standard Operating Procedures

This repository is **PUBLIC**. All contributors and AI agents MUST follow the security and operational policies documented in **[`STANDARD_PROCEDURES.md`](./STANDARD_PROCEDURES.md)**:
* **Zero Secrets in Git**: No SSH private keys, RCON passwords, database credentials, or Discord webhook tokens may ever be committed.
* **Environment Configuration**: Copy `.env.example` to `.env` and provide your secrets securely.

---

## 🛠️ Tech Stack

* **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + Lucide Icons + Recharts
* **Backend**: Express + Node.js (SSH2, WebSocket Gateway, MySQL2, MinIO S3 SDK, Discord Webhook Service)
* **Auth**: Cloudflare Zero Trust Access
* **Deployment**: Automated CI/CD GitHub Actions pipeline deploying to `PETABLOCKS-FEA` (`10.20.110.116`).
