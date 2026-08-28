import { Server, ExternalLink, ShieldCheck, Tag, GitBranch, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function SettingsPage() {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedLan, setCopiedLan] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Settings & System Info</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">Environment status, infrastructure attribution, and telemetry credentials</p>
      </div>

      {/* Infrastructure Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">Hosting & Infrastructure Provider</h2>
          </div>
          <a
            href="https://mdrcloud.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            mdrcloud.com <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          PETABLOCKS Admin Panel, REST services, MariaDB clusters, and game nodes are hosted on high-performance virtual dedicated infrastructure by <strong>MDRCloud</strong>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-2 text-xs">
          <div className="bg-background/80 p-3 rounded-xl border border-border">
            <span className="text-muted-foreground text-[10px] uppercase font-bold block">FEA Host</span>
            <span className="font-mono font-bold mt-0.5 block">10.20.110.116</span>
          </div>
          <div className="bg-background/80 p-3 rounded-xl border border-border">
            <span className="text-muted-foreground text-[10px] uppercase font-bold block">DB Host</span>
            <span className="font-mono font-bold mt-0.5 block">10.20.110.117</span>
          </div>
          <div className="bg-background/80 p-3 rounded-xl border border-border">
            <span className="text-muted-foreground text-[10px] uppercase font-bold block">CI/CD Runner Pool</span>
            <span className="font-mono font-bold text-primary mt-0.5 block">5 Parallel Instances</span>
          </div>
        </div>
      </div>

      {/* Version & Release Info */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-bold">Application Release Notes</h2>
        </div>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
            <div className="flex items-center gap-2.5">
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <div>
                <span className="font-mono font-bold text-foreground">v1.3.0</span>
                <p className="text-muted-foreground text-[11px]">Mobile responsive iOS UI + PETABLOCKS Telemetry WebSocket bridge</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono text-[11px] shrink-0">August 2026</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50 opacity-70">
            <div className="flex items-center gap-2.5">
              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono font-bold text-foreground">v1.2.0</span>
                <p className="text-muted-foreground text-[11px]">MinIO S3 File Manager UI + MDRCloud Infrastructure telemetry</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono text-[11px] shrink-0">August 2026</span>
          </div>
        </div>
      </div>

      {/* Minecraft Telemetry Bridge Credentials */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">Minecraft Telemetry Mod Bridge Credentials</h2>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            WSS v1.0
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Use these credentials in <code className="text-foreground">config/petablocks-telemetry.json</code> on all Minecraft servers to report live metrics and enable remote command execution.
        </p>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
              Gateway WebSocket URL (Production WSS)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value="wss://admin.petablocks.com/ws/servers/bridge"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText("wss://admin.petablocks.com/ws/servers/bridge")
                  setCopiedUrl(true)
                  setTimeout(() => setCopiedUrl(false), 2000)
                }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
              Internal LAN Gateway (Fallback)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value="ws://10.20.110.116:3000/ws/servers/bridge"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText("ws://10.20.110.116:3000/ws/servers/bridge")
                  setCopiedLan(true)
                  setTimeout(() => setCopiedLan(false), 2000)
                }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {copiedLan ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLan ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
              API Secret Token (Bearer Auth Key)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                readOnly
                value="845e2b760f51a817c654b03e44c77428bac53c6059129049388d8017f2abf728"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText("845e2b760f51a817c654b03e44c77428bac53c6059129049388d8017f2abf728")
                  setCopiedToken(true)
                  setTimeout(() => setCopiedToken(false), 2000)
                }}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedToken ? 'Copied Key' : 'Copy API Secret Key'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Endpoints */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-3 sm:space-y-4">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" /> Internal Service Endpoints
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Docker Engine</label>
            <input
              type="text"
              readOnly
              value="/var/run/docker.sock"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">MinIO Internal S3</label>
            <input
              type="text"
              readOnly
              value="http://minio:9000"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
