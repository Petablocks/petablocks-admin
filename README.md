# 🛡️ PETABLOCKS Admin Portal (`petablocks-admin`)

> Comprehensive administration, container operations, object storage, live console streaming, and Minecraft server telemetry dashboard for the PETABLOCKS ecosystem.
>
> 🚀 **Hosted & Powered by [MDRCloud](https://mdrcloud.com)** • **Version**: `v1.4.0` • **Endpoint**: `https://admin.petablocks.com`

---

## 🌟 Modules & Features

### 1. 🎮 Minecraft Server Operations (`/minecraft`)
* **Live Server List Ping (SLP)**: DNS SRV resolution with real-time latency tracking, player counts vs. limits, protocol versions, and authentic in-game formatted MOTDs (`<MinecraftMotd />`) across all realms.
* **🖥️ Dedicated Server Operations Pages (`/minecraft/:id`)**: Full-screen server deep-dive dashboard featuring:
  * **Tick Health & Headroom**: Live TPS gauge with 50ms tick load bar, MSPT, and tick overhead stats.
  * **JVM Heap & Garbage Collection**: Heap utilization (`Used / Max GB`), Allocated RAM, and last-minute GC pause durations.
  * **Multi-Dimension Simulation Breakdown**: Loaded chunks, active entities, and block entities per dimension (Overworld, Nether, The End, modded worlds).
  * **Live Connected Player Roster**: Player head skins, Ping latency, Dimension, coordinates $[X, Y, Z]$, Health ♥, and 1-click Kick moderation.
  * **Dedicated Web RCON Console**: Realm-scoped interactive console with timestamped execution history and diagnostic macro pills.
* **🔴 Live Console Log Streaming**: Real-time Server-Sent Events (SSE) log terminal with pause/resume, search filter, severity level pills (`ALL`, `INFO`, `WARN`, `ERROR`, `CHAT`, `COMMAND`), auto-scroll toggle, and `.log` file export.
* **⚖️ Player Moderation & Ban Management**: Active banlist and whitelist explorer, quick action form (`/ban`, `/pardon`, `/kick`, `/whitelist`, `/op`), and MariaDB staff audit log history.
* **In-Game Broadcast Tool**: Send `/tellraw` chat announcements or `/title` alerts across all servers simultaneously.
* **Plan & LuckPerms Database Analytics**: Queries MariaDB port `:3307` for group rankings and lifetime playtime stats.

### 2. 📱 iOS & Mobile First Experience
* Responsive top navigation with slide-over drawer navigation and animated hamburger menu.
* Safe-area insets (`viewport-fit=cover`), touch momentum scrolling, and responsive container cards.

### 3. 🗄️ MinIO S3 File Manager (`/files`)
* S3 object storage explorer (`http://minio:9000`).
* Drag-and-drop file upload, folder creation, presigned downloads, delete controls, and media lightboxes.

### 4. 📦 Docker Container Operations (`/containers`)
* Real-time Docker container statuses, memory/CPU usage, container restart, stop, and start triggers via `/var/run/docker.sock`.

### 5. 🗄️ Database Health (`/databases`)
* Health and schema telemetry for `pb-mariadb-fea` (:3306) and `pb-mariadb-mc` (:3307).

---

## 🛠️ Tech Stack

* **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + Recharts
* **Backend**: Express + Node.js (SSE Log Stream, SLP, RCON, Docker Engine, MySQL, MinIO S3 SDK, WebSocket Gateway)
* **Auth**: Cloudflare Zero Trust Access
* **Deployment**: Automated CI/CD GitHub Actions pipeline deploying to `PETABLOCKS-FEA` (`10.20.110.116`) via `pb-admin` container.
