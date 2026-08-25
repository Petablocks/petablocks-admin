# petablocks-admin

Admin Panel + Monitoring Dashboard + File Manager for the PETABLOCKS Network.

Built with **Vite + React + TypeScript + Tailwind CSS + shadcn/ui** (frontend) and **Node.js + Express** (backend).

Served at [admin.petablocks.com](https://admin.petablocks.com) — protected by Cloudflare Access.

## Features

| Page | Description |
|---|---|
| **Dashboard** | Overview: container count, CPU, memory, DB status |
| **Containers** | Start, stop, restart Docker containers on FEA VM |
| **Monitoring** | Real-time CPU & memory charts (updates every 5s) |
| **Databases** | MariaDB connection status and per-database sizes |
| **File Manager** | Upload, browse, delete files in MinIO. Copy public URLs. |
| **Settings** | Admin configuration |

## Architecture

```
┌─────────────────────────────────────┐
│           Vite React Frontend        │
│   Dashboard / Containers / Monitor   │
│   Databases / File Manager           │
└──────────────┬──────────────────────┘
               │ /api/*
┌──────────────▼──────────────────────┐
│         Node.js Express Backend      │
│  /api/containers → Dockerode         │
│  /api/metrics    → Docker stats      │
│  /api/databases  → mysql2            │
│  /api/files      → @aws-sdk/client-s3│
└─────────────────────────────────────┘
```

## Development

```bash
# Frontend
npm install
cp .env.example .env
npm run dev   # Vite dev server at :5173, proxies /api to :3001

# Backend (separate terminal)
cd server && npm install
node index.js  # Express at :3001 (for dev proxy)
```

## Deployment

Automatically deployed to `PETABLOCKS-FEA (10.20.110.116)` via GitHub Actions on every push to `main`.

Requires:
- `DISCORD_WEBHOOK` secret in GitHub repo settings
- Self-hosted runner with SSH access to 10.20.110.116
