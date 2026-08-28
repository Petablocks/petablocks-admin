import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Activity,
  Users,
  Send,
  RefreshCw,
  Circle,
  Trash2,
  HardDrive,
  Globe,
  Layers,
  Gauge,
  Terminal,
  Copy,
  Check,
  Gamepad2,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import MinecraftMotd from '@/components/MinecraftMotd'

interface ServerData {
  id: string
  name: string
  host: string
  port: number
  displayHost?: string
  resolvedTarget?: string
  rconPort: number
  hasRcon: boolean
  hasModBridge?: boolean
  type: string
  version: string
  description: string
  online: boolean
  latency: number
  tps?: number
  mspt?: number
  cpuUsagePercent?: number
  memory?: {
    usedMb: number
    allocatedMb: number
    maxMb: number
    gcPauseDurationMsLastMinute?: number
    gcCollectionCount?: number
  } | null
  dimensions?: Array<{
    id: string
    loadedChunks: number
    entityCount: number
    blockEntityCount?: number
  }>
  players: {
    online: number
    max: number
    sample?: Array<{
      name: string
      id?: string
      uuid?: string
      ping?: number
      dimension?: string
      pos?: [number, number, number]
      health?: number
      food?: number
      gameMode?: string
    }>
  }
  motd?: string
}

export default function MinecraftServerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copiedHost, setCopiedHost] = useState(false)
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<Array<{ time: string; type: 'cmd' | 'res' | 'err'; text: string }>>([
    { time: new Date().toLocaleTimeString(), type: 'res', text: 'Server terminal session initialized.' },
  ])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, refetch } = useQuery<{ servers: ServerData[] }>({
    queryKey: ['minecraft-servers'],
    queryFn: () => fetch('/api/minecraft/servers').then((r) => r.json()),
    refetchInterval: 5000,
  })

  const server = data?.servers?.find((s) => s.id === id)

  const rconMutation = useMutation({
    mutationFn: ({ cmd }: { cmd: string }) =>
      fetch('/api/minecraft/rcon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: id, command: cmd }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      setHistory((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          type: res.error ? 'err' : 'res',
          text: res.output || res.error || 'Command executed (no output).',
        },
      ])
    },
    onError: (err: any) => {
      setHistory((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), type: 'err', text: err.message },
      ])
    },
  })

  const kickMutation = useMutation({
    mutationFn: (player: string) =>
      fetch('/api/minecraft/moderation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: id,
          action: 'kick',
          target: player,
          reason: 'Kicked by Administrator from Server Detail Portal',
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['minecraft-servers'] })
    },
  })

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || rconMutation.isPending) return
    const cmd = command.trim()
    setHistory((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), type: 'cmd', text: `> /${cmd}` },
    ])
    setCommand('')
    rconMutation.mutate({ cmd })
  }

  const handleQuickMacro = (cmd: string) => {
    setHistory((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), type: 'cmd', text: `> /${cmd}` },
    ])
    rconMutation.mutate({ cmd })
  }

  if (isLoading && !server) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50dvh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 text-primary animate-spin" />
          <p className="text-sm font-mono text-muted-foreground">Connecting to server telemetry...</p>
        </div>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Link
          to="/minecraft"
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Server Operations
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
          <Gamepad2 className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
          <h2 className="text-lg font-bold text-foreground">Server Not Found</h2>
          <p className="text-xs text-muted-foreground">The server identifier "{id}" does not exist in the configured fleet.</p>
          <button
            onClick={() => navigate('/minecraft')}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl"
          >
            Return to Operations
          </button>
        </div>
      </div>
    )
  }

  const hostAddress = server.displayHost || server.host
  const tps = server.tps ?? 20.0
  const mspt = server.mspt ?? 15.0
  const tickLoad = Math.min(100, (mspt / 50.0) * 100)

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/minecraft"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to All Servers
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium bg-card hover:bg-accent transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Main Server Banner Header */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider',
                  server.online ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                )}
              >
                <Circle className="h-2 w-2 fill-current" />
                {server.online ? 'Online' : 'Offline'}
              </span>

              {server.hasModBridge ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Mod Bridge WebSocket Active
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  TCP SLP Ping Only
                </span>
              )}

              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {server.type.toUpperCase()} {server.version}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{server.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{server.description}</p>
          </div>

          {/* Connection Host Pill */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-background/80 p-2.5 rounded-xl border border-border/80 text-xs font-mono">
            <div className="px-2">
              <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">Connection Address</span>
              <span className="font-bold text-foreground">{hostAddress}</span>
              <span className="text-[11px] text-muted-foreground ml-1">
                {server.resolvedTarget ? `(SRV ${server.resolvedTarget})` : `(:${server.port})`}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(hostAddress)
                setCopiedHost(true)
                setTimeout(() => setCopiedHost(false), 2000)
              }}
              className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg border border-border/60 transition-colors flex items-center justify-center gap-1.5 shrink-0"
              title="Copy server IP"
            >
              {copiedHost ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedHost ? 'Copied' : 'Copy IP'}
            </button>
          </div>
        </div>

        {/* Formatted Minecraft Server MOTD */}
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block mb-1.5">
            In-Game Server MOTD (Multiplayer Ping Banner)
          </span>
          <MinecraftMotd motd={server.motd} />
        </div>
      </div>

      {/* 4-Stat Core Vitals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Tick Performance */}
        <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-emerald-400" />
              Tick Rate (TPS)
            </span>
            <span className="text-[10px] font-mono">Target: 20.0</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-3xl font-bold font-mono',
                tps >= 19.5 ? 'text-emerald-400' : tps >= 15 ? 'text-amber-400' : 'text-rose-400'
              )}
            >
              {tps.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">TPS</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
              <span>MSPT: {mspt.toFixed(1)}ms</span>
              <span>Load: {tickLoad.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  mspt <= 35 ? 'bg-emerald-400' : mspt <= 45 ? 'bg-amber-400' : 'bg-rose-400'
                )}
                style={{ width: `${tickLoad}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground pt-0.5 flex justify-between">
              <span>Headroom:</span>
              <span className="text-emerald-400 font-bold">{Math.max(0, 50 - mspt).toFixed(1)}ms</span>
            </div>
          </div>
        </div>

        {/* Stat 2: JVM Heap RAM */}
        <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-sky-400" />
              JVM Heap Memory
            </span>
            <span className="text-[10px] font-mono">
              {server.memory ? `${((server.memory.usedMb / server.memory.maxMb) * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono text-foreground">
              {server.memory ? (server.memory.usedMb / 1024).toFixed(1) : '—'}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              / {server.memory ? (server.memory.maxMb / 1024).toFixed(1) : '—'} GB
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 rounded-full transition-all"
                style={{
                  width: `${server.memory ? Math.min(100, (server.memory.usedMb / server.memory.maxMb) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground pt-0.5">
              <span>Alloc: {server.memory ? `${(server.memory.allocatedMb / 1024).toFixed(1)} GB` : '—'}</span>
              <span>GC: {server.memory?.gcPauseDurationMsLastMinute ?? 0}ms</span>
            </div>
          </div>
        </div>

        {/* Stat 3: World & Simulation */}
        <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-cyan-400" />
              World Simulation
            </span>
            <span className="text-[10px] font-mono">{server.dimensions?.length || 1} Dims</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono text-cyan-400">
              {server.dimensions?.reduce((acc, d) => acc + d.loadedChunks, 0) || (server.online ? 'Loaded' : '0')}
            </span>
            <span className="text-xs text-muted-foreground font-mono">Chunks</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground space-y-1 pt-0.5">
            <div className="flex justify-between">
              <span>Active Entities:</span>
              <span className="font-bold text-foreground">
                {server.dimensions?.reduce((acc, d) => acc + d.entityCount, 0) || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Tile / Block Entities:</span>
              <span className="font-bold text-foreground">
                {server.dimensions?.reduce((acc, d) => acc + (d.blockEntityCount || 0), 0) || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Stat 4: Network & Latency */}
        <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border space-y-3">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              Network Latency
            </span>
            <span className="text-[10px] font-mono">TCP SLP Ping</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono text-emerald-400">
              {server.online ? server.latency : 0}
            </span>
            <span className="text-xs text-muted-foreground font-mono">ms</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground space-y-1 pt-0.5">
            <div className="flex justify-between">
              <span>Players Online:</span>
              <span className="font-bold text-foreground">
                {server.players.online} / {server.players.max}
              </span>
            </div>
            <div className="flex justify-between">
              <span>RCON Interface:</span>
              <span className={server.hasRcon ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>
                {server.hasRcon ? `Active (: ${server.rconPort})` : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* World & Dimension Simulation Breakdown */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Dimension Simulation Breakdown
        </h2>

        {server.dimensions && server.dimensions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {server.dimensions.map((dim) => {
              const cleanDimName = dim.id.replace('minecraft:', '').replace('_', ' ')
              return (
                <div key={dim.id} className="bg-background/80 p-4 rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs font-mono capitalize text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      {cleanDimName}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground">{dim.id}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono text-center">
                    <div className="bg-card p-2 rounded-lg border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase font-sans">Chunks</span>
                      <span className="font-bold text-foreground mt-0.5 block">{dim.loadedChunks}</span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase font-sans">Entities</span>
                      <span className="font-bold text-emerald-400 mt-0.5 block">{dim.entityCount}</span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border/40">
                      <span className="text-[9px] text-muted-foreground block uppercase font-sans">Tiles</span>
                      <span className="font-bold text-cyan-400 mt-0.5 block">{dim.blockEntityCount ?? 0}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs font-mono text-muted-foreground py-2">
            Detailed dimension simulation will stream in real-time as the companion mod reports telemetry.
          </p>
        )}
      </div>

      {/* Live Connected Players in this Realm */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Live Connected Players ({server.players.sample?.length || 0})
          </h2>
        </div>

        {(server.players.sample || []).length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs font-mono">
            No players currently online in {server.name}.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {server.players.sample!.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between p-3 rounded-xl bg-background/80 border border-border"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={`https://mc-heads.net/avatar/${p.name}/64`}
                    alt={p.name}
                    className="w-9 h-9 rounded-lg bg-black/40 border border-border shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-foreground font-mono">{p.name}</span>
                      {p.ping !== undefined && (
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">{p.ping}ms</span>
                      )}
                      {p.dimension && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                          {p.dimension.replace('minecraft:', '')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 mt-0.5">
                      {p.pos && (
                        <span>
                          Pos: [{Math.round(p.pos[0])}, {Math.round(p.pos[1])}, {Math.round(p.pos[2])}]
                        </span>
                      )}
                      {p.health !== undefined && (
                        <span className="text-rose-400 font-bold">♥ {p.health.toFixed(0)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (confirm(`Kick ${p.name} from ${server.name}?`)) {
                        kickMutation.mutate(p.name)
                      }
                    }}
                    disabled={kickMutation.isPending}
                    className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    Kick
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Realm Web RCON Terminal */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2 text-foreground font-mono">
            <Terminal className="h-4 w-4 text-emerald-400" />
            Dedicated Web RCON Console ({server.name})
          </h2>

          <button
            onClick={() => setHistory([])}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
            title="Clear Console Output"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick Macros */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Diagnostic Macros:</span>
          {['tps', 'spark health', 'whitelist list', 'save-all', 'time query daytime'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleQuickMacro(cmd)}
              disabled={rconMutation.isPending}
              className="px-2.5 py-1 rounded-md bg-muted/60 hover:bg-muted text-foreground border border-border text-xs font-mono transition-colors disabled:opacity-50"
            >
              /{cmd}
            </button>
          ))}
        </div>

        {/* Terminal Window */}
        <div className="bg-black/90 rounded-xl p-4 border border-border font-mono text-xs text-emerald-400 h-64 overflow-y-auto space-y-1.5 shadow-inner">
          {history.map((h, i) => (
            <div key={i} className="leading-relaxed break-words">
              <span className="text-muted-foreground/60 select-none mr-2">[{h.time}]</span>
              {h.type === 'cmd' ? (
                <span className="text-primary font-bold">{h.text}</span>
              ) : h.type === 'err' ? (
                <span className="text-rose-400">{h.text}</span>
              ) : (
                <span className="text-emerald-300 whitespace-pre-wrap">{h.text}</span>
              )}
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        {/* RCON Input */}
        <form onSubmit={handleSendCommand} className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={`Execute command on ${server.name} (e.g. say Hello, kick, whitelist)...`}
            className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!command.trim() || rconMutation.isPending}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {rconMutation.isPending ? 'Sending...' : 'Execute'}
          </button>
        </form>
      </div>
    </div>
  )
}
