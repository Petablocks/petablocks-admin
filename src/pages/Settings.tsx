export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure PETABLOCKS Admin Panel environment & endpoints</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold">Environment Configuration</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-muted-foreground block text-xs mb-1">Docker Socket</label>
            <input
              type="text"
              readOnly
              value="/var/run/docker.sock"
              className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-muted-foreground block text-xs mb-1">MinIO Internal Endpoint</label>
            <input
              type="text"
              readOnly
              value="http://minio:9000"
              className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-muted-foreground block text-xs mb-1">Database Endpoint (FEA / MC)</label>
            <input
              type="text"
              readOnly
              value="10.20.110.117:3306 / 3307"
              className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
