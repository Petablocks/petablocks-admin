import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2,
  Users,
  Activity,
  Terminal,
  Send,
  RefreshCw,
  Megaphone,
  Check,
  Shield,
  Clock,
  Circle,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface ServerData {
  id: string
  name: string
  host: string
  port: number
  displayHost?: string
  rconPort: number
  hasRcon: boolean
  type: string
  version: string
  description: string
  online: boolean
  latency: number
  players: {
    online: number
    max: number
    sample?: Array<{ name: string; id: string }>
  }
  motd?: string
}

interface ServersResponse {
  timestamp: string
  totalOnline: number
  totalMax: number
  servers: ServerData[]
}

interface AnalyticsResponse {
  configured: boolean
  topPlayers: Array<{ name: string; uuid: string; firstJoined: string; playtimeSeconds: number }>
  rankDistribution: Array<{ group: string; count: number }>
}

interface ConsoleLog {
  id: string
  timestamp: string
  serverName: string
  command: string
  output: string
  isError?: boolean
}

export default function MinecraftServersPage() {
  const qc = useQueryClient()
  const [selectedServer, setSelectedServer] = useState<string>('fabric-main')
  const [commandInput, setCommandInput] = useState<string>('')
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      serverName: 'System',
      command: 'rcon init',
      output: 'PETABLOCKS Web RCON terminal initialized. Select a server and enter Minecraft commands.',
    },
  ])

  const [broadcastMessage, setBroadcastMessage] = useState<string>('')
  const [broadcastType, setBroadcastType] = useState<'chat' | 'title'>('chat')
  const [broadcastServer, setBroadcastServer] = useState<string>('all')
  const [broadcastSuccess, setBroadcastSuccess] = useState<boolean>(false)

  const consoleEndRef = useRef<HTMLDivElement>(null)

  // Fetch live server telemetry
  const { data: telemetry, isLoading, refetch } = useQuery<ServersResponse>({
    queryKey: ['mc-servers'],
    queryFn: () => fetch('/api/minecraft/servers').then(r => r.json()),
    refetchInterval: 15000,
  })

  // Fetch Plan & LuckPerms DB Analytics
  const { data: analytics } = useQuery<AnalyticsResponse>({
    queryKey: ['mc-analytics'],
    queryFn: () => fetch('/api/minecraft/analytics').then(r => r.json()),
  })

  // RCON Command Mutation
  const rconMutation = useMutation({
    mutationFn: async ({ serverId, command }: { serverId: string; command: string }) => {
      const res = await fetch('/api/minecraft/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, command }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      setConsoleLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          timestamp: new Date().toLocaleTimeString(),
          serverName: data.serverName || selectedServer,
          command: data.command,
          output: data.output || (data.success ? 'Success' : 'No response'),
          isError: !data.success,
        },
      ])
      setCommandInput('')
    },
    onError: (err) => {
      setConsoleLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          timestamp: new Date().toLocaleTimeString(),
          serverName: selectedServer,
          command: commandInput,
          output: String(err),
          isError: true,
        },
      ])
    },
  })

  // Broadcast Mutation
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/minecraft/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: broadcastServer,
          message: broadcastMessage,
          type: broadcastType,
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      setBroadcastSuccess(true)
      setBroadcastMessage('')
      setTimeout(() => setBroadcastSuccess(false), 3000)
      qc.invalidateQueries({ queryKey: ['mc-servers'] })
    },
  })

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commandInput.trim()) return
    rconMutation.mutate({ serverId: selectedServer, command: commandInput })
  }

  const handleMacroCommand = (cmd: string) => {
    rconMutation.mutate({ serverId: selectedServer, command: cmd })
  }

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [consoleLogs])

  const servers = telemetry?.servers || []

  // Sample latency comparison data for charts
  const latencyChartData = servers.map((s) => ({
    name: s.name.replace('PETABLOCKS ', ''),
    latency: s.online ? s.latency : 0,
    players: s.players.online,
  }))

  const allConnectedPlayers: Array<{ name: string; id: string; serverName: string }> = []
  servers.forEach((s) => {
    if (s.players.sample && s.players.sample.length > 0) {
      s.players.sample.forEach((p) => {
        allConnectedPlayers.push({ ...p, serverName: s.name })
      })
    }
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Minecraft Server Management</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time telemetry, live player sessions, and Web RCON terminal controls
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span>Total Online: <strong className="text-foreground font-mono">{telemetry?.totalOnline ?? 0}</strong></span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-accent transition-colors"
            title="Refresh Telemetry"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Server Telemetry Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {servers.map((srv) => (
          <div
            key={srv.id}
            className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider',
                      srv.online ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      <Circle className="h-2.5 w-2.5 fill-current" />
                      {srv.online ? 'Online' : 'Offline'}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      {srv.version}
                    </span>
                  </div>
                  <h3 className="font-bold text-base mt-1 text-foreground">{srv.name}</h3>
                </div>
              </div>

              <div className="text-xs font-mono text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-md border border-border/50 flex items-center justify-between">
                <span className="font-bold text-foreground">{srv.displayHost || srv.host}</span>
                <span className="text-[11px] text-muted-foreground">({srv.host}:{srv.port})</span>
              </div>

              {srv.motd && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-1 italic">
                  "{srv.motd}"
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/60 text-xs font-mono">
              <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">Players</span>
                <span className="text-sm font-bold text-foreground mt-0.5 block">
                  {srv.players.online} / {srv.players.max}
                </span>
              </div>

              <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">SLP Ping</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                  {srv.online ? `${srv.latency}ms` : '—'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Concurrency & Latency Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Latency Comparison */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Server Latency (ms)</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">Live SLP</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(222 84% 7%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="latency" stroke="#10b981" fill="#10b98120" strokeWidth={2} name="Ping (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Broadcast System Card */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="h-4 w-4 text-yellow-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider">In-Game Broadcast System</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Send global chat announcements or big screen alert titles directly into Minecraft.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
              <div>
                <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Target Realm</label>
                <select
                  value={broadcastServer}
                  onChange={(e) => setBroadcastServer(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="all">All Servers (Network Broadcast)</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Display Type</label>
                <select
                  value={broadcastType}
                  onChange={(e) => setBroadcastType(e.target.value as 'chat' | 'title')}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="chat">Chat Announcement (/tellraw)</option>
                  <option value="title">Screen Title Overlay (/title)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">Announcement Message</label>
              <input
                type="text"
                placeholder="e.g. Scheduled server maintenance in 15 minutes..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <span className="text-[11px] text-muted-foreground">
              {broadcastSuccess && <span className="text-emerald-400 font-bold flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Broadcast Sent!</span>}
            </span>
            <button
              onClick={() => broadcastMutation.mutate()}
              disabled={!broadcastMessage.trim() || broadcastMutation.isPending}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-xs transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {broadcastMutation.isPending ? 'Sending...' : 'Broadcast'}
            </button>
          </div>
        </div>
      </div>

      {/* Web RCON Terminal Console */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Interactive Web RCON Console</h2>
          </div>

          {/* Server Switcher & Clear */}
          <div className="flex items-center gap-2">
            <select
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-mono"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.host}:{s.rconPort || 25575})</option>
              ))}
            </select>

            <button
              onClick={() => setConsoleLogs([])}
              className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Clear Console"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Command Macro Quick Buttons */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground text-[10px] uppercase font-bold self-center mr-1">Quick Macros:</span>
          {['/tps', '/list', '/whitelist list', '/save-all', '/seed'].map((macro) => (
            <button
              key={macro}
              onClick={() => handleMacroCommand(macro)}
              className="px-2.5 py-1 rounded-md bg-muted/40 hover:bg-primary/20 hover:text-primary border border-border font-mono text-[11px] transition-colors"
            >
              {macro}
            </button>
          ))}
        </div>

        {/* Terminal Screen */}
        <div className="bg-black/90 rounded-xl border border-border p-4 h-72 overflow-y-auto font-mono text-xs space-y-2">
          {consoleLogs.map((log) => (
            <div key={log.id} className="space-y-0.5">
              <div className="text-muted-foreground/60 text-[10px] flex items-center gap-2">
                <span>[{log.timestamp}]</span>
                <span className="text-primary font-bold">@{log.serverName}</span>
                <span className="text-gray-300 font-bold">&gt; {log.command}</span>
              </div>
              <pre className={cn(
                'whitespace-pre-wrap pl-2 leading-relaxed',
                log.isError ? 'text-rose-400' : 'text-emerald-400'
              )}>
                {log.output}
              </pre>
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendCommand} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-muted-foreground font-mono text-xs">&gt;</span>
            <input
              type="text"
              placeholder="Enter command (e.g. say Hello PETABLOCKS, whitelist add username, kick player)..."
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              className="w-full bg-background border border-border rounded-xl pl-7 pr-3 py-2 text-xs font-mono focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={!commandInput.trim() || rconMutation.isPending}
            className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            {rconMutation.isPending ? 'Running...' : 'Execute'}
          </button>
        </form>
      </div>

      {/* Online Players Roster & Plan Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Players Roster */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Live Player Roster</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{allConnectedPlayers.length} online</span>
          </div>

          {allConnectedPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs rounded-xl border border-border/50 bg-background/50">
              <Users className="h-8 w-8 mb-2 opacity-30" />
              <p>No players actively connected right now.</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Player sessions update every 15s via SLP.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allConnectedPlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-2.5 rounded-xl bg-background/60 border border-border">
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://crafatar.com/avatars/${player.id}?size=32&overlay`}
                      alt={player.name}
                      className="w-7 h-7 rounded-md bg-black/40"
                    />
                    <div>
                      <span className="font-bold text-xs text-foreground block">{player.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{player.serverName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMacroCommand(`kick ${player.name} Kicked by staff`)}
                      className="px-2 py-1 rounded bg-destructive/10 text-destructive text-[10px] font-bold hover:bg-destructive/20 transition-colors"
                    >
                      Kick
                    </button>
                    <a
                      href={`https://petablocks.com/stats`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 rounded text-muted-foreground hover:text-foreground"
                      title="Inspect on Stats Page"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan / LuckPerms Database Analytics */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Plan & LuckPerms DB Analytics</h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">10.20.110.117:3307</span>
          </div>

          {analytics?.rankDistribution && analytics.rankDistribution.length > 0 && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-2">Rank Breakdown</span>
              <div className="flex flex-wrap gap-2">
                {analytics.rankDistribution.map((rank) => (
                  <span
                    key={rank.group}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary font-mono"
                  >
                    <span>{rank.group}:</span>
                    <strong className="text-foreground">{rank.count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {analytics?.topPlayers && analytics.topPlayers.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">Top Playtime Leaders</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                {analytics.topPlayers.slice(0, 5).map((p, idx) => (
                  <div key={p.uuid || idx} className="flex items-center justify-between p-2 rounded-lg bg-background/40 border border-border/50">
                    <span className="font-bold text-foreground">#{idx + 1} {p.name}</span>
                    <span className="font-mono text-muted-foreground flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3 text-primary" />
                      {Math.floor(p.playtimeSeconds / 3600)}h {Math.floor((p.playtimeSeconds % 3600) / 60)}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-background/40 border border-border/50 text-xs text-muted-foreground text-center">
              Plan MariaDB analytics connected. Playtime data accumulates as players join.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
