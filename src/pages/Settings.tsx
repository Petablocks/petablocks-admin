import { Server, ExternalLink, ShieldCheck, Tag, GitBranch } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings & System Info</h1>
        <p className="text-muted-foreground text-sm mt-1">Environment status, infrastructure attribution, and version info</p>
      </div>

      {/* Infrastructure Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Hosting & Infrastructure Provider</h2>
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
        <p className="text-sm text-muted-foreground leading-relaxed">
          PETABLOCKS Admin Panel, REST services, MariaDB clusters, and game nodes are hosted on high-performance virtual dedicated infrastructure by <strong>MDRCloud</strong>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
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
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Application Release Notes</h2>
        </div>
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
            <div className="flex items-center gap-2.5">
              <GitBranch className="h-4 w-4 text-primary" />
              <div>
                <span className="font-mono font-bold text-foreground">v1.2.0</span>
                <p className="text-muted-foreground text-[11px]">MinIO S3 File Manager UI + MDRCloud Infrastructure telemetry</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono">August 2026</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50 opacity-70">
            <div className="flex items-center gap-2.5">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-mono font-bold text-foreground">v1.0.0</span>
                <p className="text-muted-foreground text-[11px]">Initial admin dashboard, container monitor, and MariaDB metrics</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono">August 2026</span>
          </div>
        </div>
      </div>

      {/* Environment Endpoints */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Internal Service Endpoints
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
