import { Server, ExternalLink, ShieldCheck, Tag, GitBranch, Copy, Check, Bell } from 'lucide-react'
import { useState } from 'react'

export default function SettingsPage() {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedLan, setCopiedLan] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [discordPlayerWebhook, setDiscordPlayerWebhook] = useState('')
  const [testPingStatus, setTestPingStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function sendTestPing() {
    const url = discordWebhook.trim()
    if (!url) return
    setTestPingStatus('sending')
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'PETABLOCKS Network',
          avatar_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
          embeds: [{
            title: '🔔 Test Notification',
            description: 'Discord webhook is correctly configured for **PETABLOCKS Admin Portal** telemetry alerts.',
            color: 0x5865F2,
            fields: [
              { name: 'Sent From', value: 'PETABLOCKS Admin Portal', inline: true },
              { name: 'Status', value: '✅ Connected', inline: true },
            ],
            footer: { text: 'PETABLOCKS Network Telemetry' },
            timestamp: new Date().toISOString(),
          }],
        }),
      })
      setTestPingStatus('sent')
      setTimeout(() => setTestPingStatus('idle'), 3000)
    } catch {
      setTestPingStatus('error')
      setTimeout(() => setTestPingStatus('idle'), 3000)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Settings &amp; System Info</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">Environment status, infrastructure attribution, and telemetry credentials</p>
      </div>

      {/* Infrastructure Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">Hosting &amp; Infrastructure Provider</h2>
          </div>
          <a href="https://mdrcloud.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
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
                <span className="font-mono font-bold text-foreground">v1.5.0</span>
                <p className="text-muted-foreground text-[11px]">Live status page telemetry + Discord webhook notifications + World backup manager</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono text-[11px] shrink-0">September 2026</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50 opacity-70">
            <div className="flex items-center gap-2.5">
              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono font-bold text-foreground">v1.4.0</span>
                <p className="text-muted-foreground text-[11px]">Dedicated server operations pages + Authentic in-game Minecraft MOTD parser</p>
              </div>
            </div>
            <span className="text-muted-foreground font-mono text-[11px] shrink-0">August 2026</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50 opacity-60">
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

      {/* Discord Webhook Notifications */}
      <div className="rounded-2xl border border-[#5865F2]/30 bg-[#5865F2]/5 p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#5865F2] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">Discord Webhook Notifications</h2>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20">
            Server Gateway
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure Discord webhook URLs on the <strong>website backend</strong> server (<code className="text-foreground">petablocks-api</code>) via environment variables. Set them in your <code className="text-foreground">.env</code> file and restart the container. Use the fields below to test connectivity.
        </p>

        <div className="space-y-4 text-xs">
          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
              Server Alerts Webhook URL <span className="text-[#5865F2]">(DISCORD_WEBHOOK_URL)</span>
            </label>
            <p className="text-[10px] text-muted-foreground mb-2">Receives: Server Online/Offline, Low TPS alerts (&le;15.0 TPS for 3+ consecutive samples)</p>
            <input
              type="text"
              value={discordWebhook}
              onChange={e => setDiscordWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#5865F2]/60"
            />
          </div>

          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
              Player Activity Webhook URL <span className="text-[#5865F2]">(DISCORD_PLAYER_WEBHOOK_URL)</span>
            </label>
            <p className="text-[10px] text-muted-foreground mb-2">Receives: Player Join / Leave events (rate-limited to 1 per 30s per player)</p>
            <input
              type="text"
              value={discordPlayerWebhook}
              onChange={e => setDiscordPlayerWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/... (leave blank to use Alerts webhook)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#5865F2]/60"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[10px] text-muted-foreground">
              Set these as environment variables on the <code className="text-foreground">petablocks-api</code> Docker container, then restart.
            </p>
            <button
              onClick={sendTestPing}
              disabled={!discordWebhook.trim() || testPingStatus === 'sending'}
              className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shrink-0 ${
                testPingStatus === 'sent'
                  ? 'bg-emerald-500 text-white'
                  : testPingStatus === 'error'
                  ? 'bg-rose-500 text-white'
                  : 'bg-[#5865F2] hover:bg-[#4752C4] text-white disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {testPingStatus === 'sending' ? (
                <><span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Sending…</>
              ) : testPingStatus === 'sent' ? (
                <><Check className="h-3.5 w-3.5" /> Sent!</>
              ) : testPingStatus === 'error' ? (
                '✗ Failed'
              ) : (
                <><Bell className="h-3.5 w-3.5" /> Send Test Ping</>
              )}
            </button>
          </div>

          <div className="bg-black/60 border border-border rounded-xl p-3 font-mono text-[10px] text-emerald-400 space-y-0.5">
            <p className="text-muted-foreground text-[9px] uppercase font-bold mb-1.5">Add to petablocks-api .env</p>
            <p>DISCORD_WEBHOOK_URL=<span className="text-amber-300">{discordWebhook || 'https://discord.com/api/webhooks/...'}</span></p>
            <p>DISCORD_PLAYER_WEBHOOK_URL=<span className="text-amber-300">{discordPlayerWebhook || discordWebhook || 'https://discord.com/api/webhooks/...'}</span></p>
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
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Gateway WebSocket URL (Production WSS)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" readOnly value="wss://admin.petablocks.com/ws/servers/bridge" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none" />
              <button
                onClick={() => { navigator.clipboard.writeText("wss://admin.petablocks.com/ws/servers/bridge"); setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000) }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Internal LAN Gateway (Fallback)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" readOnly value="ws://10.20.110.116:3000/ws/servers/bridge" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none" />
              <button
                onClick={() => { navigator.clipboard.writeText("ws://10.20.110.116:3000/ws/servers/bridge"); setCopiedLan(true); setTimeout(() => setCopiedLan(false), 2000) }}
                className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {copiedLan ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLan ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">API Secret Token (Bearer Auth Key)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="password" readOnly value="07f01fcbb74c9a64af468294770302ad2ce8f68fc1ddcc21b363505adac1a162" className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none select-all" />
              <button
                onClick={() => { navigator.clipboard.writeText("07f01fcbb74c9a64af468294770302ad2ce8f68fc1ddcc21b363505adac1a162"); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000) }}
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
            <input type="text" readOnly value="/var/run/docker.sock" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono" />
          </div>
          <div>
            <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">MinIO Internal S3</label>
            <input type="text" readOnly value="http://minio:9000" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono" />
          </div>
        </div>
      </div>
    </div>
  )
}
