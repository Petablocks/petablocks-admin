# Standard Operating Procedures (SOP) — PETABLOCKS Admin Portal

> **Target Audience**: AI Coding Assistants, Automation Agents, and Human Engineers.
> **Repository Status**: PUBLIC on GitHub (`Petablocks/petablocks-admin`).
> **Strict Enforcement**: All rules documented here are mandatory. Zero exceptions.

---

## 1. Security & Sensitive Data Protection (MANDATORY)

Because this repository is **PUBLIC**, sensitive internal infrastructure data must never be committed to source control:

1. **Zero Secrets in Git**:
   * **NEVER** commit SSH private keys (`BEGIN OPENSSH PRIVATE KEY`), passwords, MariaDB/MySQL credentials, Discord webhook tokens, or API secrets.
   * **NEVER** hardcode default credentials as fallbacks in production code (e.g. `const DB = process.env.DB || 'mysql://user:realpassword@...'`).
2. **Environment Variables Only**:
   * All credentials, host addresses, and tokens must be loaded exclusively via `process.env.*`.
   * Use clean, generic fallback strings for local development (e.g. `mysql://user:password@127.0.0.1:3306/petablocks`).
3. **Updating Configs**:
   * Whenever adding a new environment variable, immediately update `.env.example` with dummy values and documentation.
   * Never commit `.env`, `.env.local`, or any runtime credential files. Verify they match patterns in `.gitignore`.

---

## 2. Version Numbering Standards

This project adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/):

$$\text{MAJOR}.\text{MINOR}.\text{PATCH}$$

* **PATCH ($1.7.\mathbf{X}$)**: Bug fixes, UI alignment tweaks, error handling improvements, non-breaking refactors.
* **MINOR ($1.\mathbf{X}.0$)**: New operational pages, new API routes, major UI redesigns, automated scheduler features.
* **MAJOR ($\mathbf{X}.0.0$)**: Breaking database schema overhauls, protocol changes to WebSocket bridge, complete architectural rewrites.

### Mandatory Version Update Locations:
When bumping the version, you MUST update:
1. `package.json` (`"version": "x.y.z"`)
2. `CHANGELOG.md` (Add new release header `## [x.y.z] - YYYY-MM-DD`)
3. `src/components/Layout.tsx` footer fallback (if hardcoded fallback exists)

---

## 3. CHANGELOG Standards

Every pull request or commit that modifies behavior or adds features MUST update `CHANGELOG.md` using the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standard:

```markdown
## [1.7.0] - 2026-09-03
### Added
- Feature details...

### Changed
- Refactored components...

### Fixed
- Bug fixes...

### Security
- Sanitized credentials...
```

---

## 4. Pre-Commit Quality Assurance & Build Checks

Before pushing any changes to Git:
1. **Local Build Verification**:
   ```bash
   npm run build
   ```
   * Must compile both TypeScript (`tsc -b`) and Vite assets with **ZERO errors**.
   * Never push broken code to `main`.
2. **Lint Checks**:
   * Check for unused imports or variables that would cause `tsc` failure (e.g. `TS6133`).

---

## 5. Deployment Pipeline & Infrastructure

Code flows through an automated Continuous Deployment pipeline:

```mermaid
graph LR
    Dev[AI Agent / Dev Commit] --> Git[Push to GitHub: main]
    Git --> GHA[GitHub Actions: Deploy Admin Portal]
    GHA --> FEA["PETABLOCKS-FEA (10.20.110.116)"]
    FEA --> Dokploy["Dokploy Container Build & Caddy Proxy"]
    Dokploy --> Live["admin.petablocks.com (Port 3000)"]
```

* **Production VM**: `PETABLOCKS-FEA` (`10.20.110.116`).
* **Container Manager**: Dokploy / Docker Compose.
* **Reverse Proxy**: Caddy with automated HTTPS (`admin.petablocks.com`).
* **Database**: Dedicated MariaDB node at `10.20.110.117:3307` (`petablocks` database).
* **Game Nodes**:
  * `PETABLOCKS-MCS1` (`10.20.110.118`) — Fabric 1.20.1 Modpack
  * `PETABLOCKS-MCS2` (`10.20.110.119`) — NeoForge 1.21.1 Create 2 SMP
  * `PETABLOCKS-MCS3` (`10.20.110.120`) — NeoForge 1.21.1 Patreon Creative

---

## 6. Minecraft Fleet & Autonomous Maintenance Safety

When interacting with game servers or modifying `maintenanceRunner.js` / `maintenanceService.js`:
1. **Never Disrupt Online Players Unannounced**:
   * Always broadcast advance warnings ($T-15\text{m}$, $T-5\text{m}$, $T-1\text{m}$) via `/tellraw` before restarting containers.
2. **World State Integrity**:
   * Always issue `/save-all flush` before initiating a container reboot to prevent chunk rollbacks or inventory corruption.
3. **Health Verification**:
   * Never mark a maintenance window as `completed` until TCP ports and WebSocket telemetry verify the server is healthy and responsive ($TPS \ge 19$).
