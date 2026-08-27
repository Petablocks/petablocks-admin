# 🛡️ PETABLOCKS Admin Portal (`petablocks-admin`)

> Comprehensive administration, container operations, object storage, live console streaming, and Minecraft server telemetry dashboard for the PETABLOCKS ecosystem.
>
> 🚀 **Hosted & Powered by [MDRCloud](https://mdrcloud.co.uk)** • **Version**: `v1.3.0` • **Endpoint**: `https://admin.petablocks.com`

---

## 🌟 Modules & Features

### 1. 🎮 Minecraft Server Management (`/minecraft`)
* **Live Server List Ping (SLP)**: DNS SRV resolution with real-time latency tracking, player counts vs. limits, protocol versions, and MOTDs for all realms.
* **🔴 Live Console Log Streaming**: Real-time Server-Sent Events (SSE) log terminal with pause/resume, search filter, severity level pills (`ALL`, `INFO`, `WARN`, `ERROR`, `CHAT`, `COMMAND`), auto-scroll toggle, and `.log` file export.
* **⚖️ Player Moderation & Ban Management**: Active banlist and whitelist explorer, quick action form (`/ban`, `/pardon`, `/kick`, `/whitelist`, `/op`), and MariaDB staff audit log history.
* **Interactive Web RCON Console**: Run server commands directly from the browser with timestamped terminal logs and quick macros.
* **In-Game Broadcast Tool**: Send `/tellraw` chat announcements or `/title` alerts across all servers simultaneously.
* **Live Player Roster & Kick Control**: Active session viewer with 3D avatar head icons.
* **Plan & LuckPerms Database Analytics**: Queries MariaDB port `:3307` for group rankings and lifetime playtime stats.

### 2. 🗄️ MinIO S3 File Manager (`/files`)
* S3 object storage explorer (`http://minio:9000`).
* Drag-and-drop file upload, folder creation, presigned downloads, delete controls, and media lightboxes.

### 3. 📦 Docker Container Operations (`/containers`)
* Real-time Docker container statuses, memory/CPU usage, container restart, stop, and start triggers via `/var/run/docker.sock`.

### 4. 🗄️ Database Health (`/databases`)
* Health and schema telemetry for `pb-mariadb-fea` (:3306) and `pb-mariadb-mc` (:3307).

---

## 🛠️ Tech Stack

* **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + Recharts
* **Backend**: Express + Node.js (SSE Log Stream, SLP, RCON, Docker Engine, MySQL, MinIO S3 SDK)
* **Auth**: Cloudflare Zero Trust Access
* **Deployment**: Docker container (`pb-admin`) on `PETABLOCKS-FEA` (`10.20.110.116`)
