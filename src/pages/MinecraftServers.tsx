import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2,
  Terminal,
  Activity,
  Users,
  Send,
  RefreshCw,
  Shield,
  Circle,
  Database,
  Radio,
  Search,
  UserX,
  Volume2,
  Trash2,
  Pause,
  Play,
  Download,
  ScrollText,
  Gavel,
  AlertTriangle,
  FileText,
  UserCheck,
  Key,
  Copy,
  Check,
} from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

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
  } | null
  dimensions?: Array<{
    id: string
    loadedChunks: number
    entityCount: number
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
      gameMode?: string
    }>
  }
  motd?: string
}

interface LogEntry {
  id: string
  serverId: string
  timestamp: string
  time: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'CHAT' | 'COMMAND'
  message: string
  source: string
}

interface ModerationAuditLog {
  id: number
  server_id: string
  action: string
  target: string
  executor: string
  reason: string
  created_at: string
}

const QUICK_MACROS = [
  { label: '/tps', cmd: 'tps' },
  { label: '/list', cmd: 'list' },
  { label: '/whitelist list', cmd: 'whitelist list' },
  { label: '/save-all', cmd: 'save-all' },
  { label: '/seed', cmd: 'seed' },
]

export function MinecraftServersPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'moderation'>('overview')
  const [showBridgeModal, setShowBridgeModal] = useState<boolean>(false)
  const [copiedToken, setCopiedToken] = useState<boolean>(false)
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false)

  // Overview / RCON State
  const [selectedServer, setSelectedServer] = useState<string>('fabric-main')
  const [rconCommand, setRconCommand] = useState<string>('')
  const [rconHistory, setRconHistory] = useState<Array<{ serverId: string; time: string; type: 'cmd' | 'res' | 'err'; text: string }>>([
    { serverId: 'system', time: new Date().toLocaleTimeString(), type: 'res', text: 'PETABLOCKS Web RCON terminal initialized. Select a server and enter Minecraft commands.' },
  ])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Broadcast State
  const [broadcastMsg, setBroadcastMsg] = useState<string>('')
  const [broadcastType, setBroadcastType] = useState<'chat' | 'title'>('chat')
  const [broadcastTarget, setBroadcastTarget] = useState<string>('all')

  // Live Console Logs State
  const [logFilterServer, setLogFilterServer] = useState<string>('all')
  const [logSearch, setLogSearch] = useState<string>('')
  const [logSeverity, setLogSeverity] = useState<string>('ALL')
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])
  const [isLogPaused, setIsLogPaused] = useState<boolean>(false)
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true)
  const [sseConnected, setSseConnected] = useState<boolean>(false)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Moderation State
  const [modServer, setModServer] = useState<string>('fabric-main')
  const [modAction, setModAction] = useState<string>('ban')
  const [modTarget, setModTarget] = useState<string>('')
  const [modReason, setModReason] = useState<string>('')

  // 1. Fetch Server SLP Telemetry
  const { data: telemetry, isLoading, refetch } = useQuery({
    queryKey: ['minecraft-servers'],
    queryFn: async () => {
      const res = await fetch('/api/minecraft/servers')
      if (!res.ok) throw new Error('Failed to fetch server telemetry')
      return res.json()
    },
    refetchInterval: 15000,
  })

  // 2. Fetch Plan & LuckPerms DB Analytics
  const { data: analytics } = useQuery({
    queryKey: ['minecraft-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/minecraft/analytics')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
    refetchInterval: 30000,
  })

  // 3. Fetch Active Bans & Whitelist
  const { data: bansData, refetch: refetchBans } = useQuery({
    queryKey: ['minecraft-bans', modServer],
    queryFn: async () => {
      const res = await fetch(`/api/minecraft/moderation/bans?serverId=${modServer}`)
      if (!res.ok) return { bans: [], whitelist: [] }
      return res.json()
    },
    refetchInterval: activeTab === 'moderation' ? 15000 : false,
  })

  // 4. Fetch Moderation Audit Logs
  const { data: auditData, refetch: refetchAudit } = useQuery({
    queryKey: ['minecraft-audit'],
    queryFn: async () => {
      const res = await fetch('/api/minecraft/moderation/audit')
      if (!res.ok) return { logs: [] }
      return res.json()
    },
    refetchInterval: activeTab === 'moderation' ? 15000 : false,
  })

  // 5. Connect to SSE Live Log Stream
  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource(`/api/minecraft/logs/stream?serverId=${logFilterServer}`)

      eventSource.onopen = () => {
        setSseConnected(true)
      }

      eventSource.onmessage = (event) => {
        if (isLogPaused) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'initial' && Array.isArray(data.logs)) {
            setLiveLogs(data.logs)
          } else if (data.id) {
            setLiveLogs((prev) => [...prev.slice(-499), data])
          }
        } catch {
          // Heartbeat or malformed
        }
      }

      eventSource.onerror = () => {
        setSseConnected(false)
      }
    } catch {
      setSseConnected(false)
    }

    return () => {
      if (eventSource) {
        eventSource.close()
        setSseConnected(false)
      }
    }
  }, [logFilterServer, isLogPaused])

  // Auto-scroll logs
  useEffect(() => {
    if (autoScrollLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [liveLogs, autoScrollLogs])

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
      setRconHistory((prev) => [
        ...prev,
        {
          serverId: data.serverId,
          time: new Date().toLocaleTimeString(),
          type: data.success ? 'res' : 'err',
          text: data.output,
        },
      ])
      setTimeout(() => terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    },
  })

  // Broadcast Mutation
  const broadcastMutation = useMutation({
    mutationFn: async ({ serverId, message, type }: { serverId: string; message: string; type: string }) => {
      const res = await fetch('/api/minecraft/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, message, type }),
      })
      return res.json()
    },
    onSuccess: () => {
      setBroadcastMsg('')
      queryClient.invalidateQueries({ queryKey: ['minecraft-servers'] })
    },
  })

  // Moderation Action Mutation
  const modActionMutation = useMutation({
    mutationFn: async ({ serverId, action, target, reason }: { serverId: string; action: string; target: string; reason: string }) => {
      const res = await fetch('/api/minecraft/moderation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action, target, reason, executor: 'Admin Portal' }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      setModTarget('')
      setModReason('')
      refetchBans()
      refetchAudit()
      setRconHistory((prev) => [
        ...prev,
        {
          serverId: data.serverId,
          time: new Date().toLocaleTimeString(),
          type: data.success ? 'res' : 'err',
          text: `[MODERATION] ${data.command}: ${data.output}`,
        },
      ])
    },
  })

  const handleSendRcon = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!rconCommand.trim()) return

    const cmd = rconCommand.trim()
    setRconHistory((prev) => [
      ...prev,
      {
        serverId: selectedServer,
        time: new Date().toLocaleTimeString(),
        type: 'cmd',
        text: `> /${cmd}`,
      },
    ])
    rconMutation.mutate({ serverId: selectedServer, command: cmd })
    setRconCommand('')
  }

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMsg.trim()) return
    broadcastMutation.mutate({
      serverId: broadcastTarget,
      message: broadcastMsg.trim(),
      type: broadcastType,
    })
  }

  const handleModActionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!modTarget.trim()) return
    modActionMutation.mutate({
      serverId: modServer,
      action: modAction,
      target: modTarget.trim(),
      reason: modReason.trim() || 'Moderation action from Admin Portal',
    })
  }

  const handleQuickKick = (serverId: string, username: string) => {
    if (!confirm(`Kick player '${username}' from ${serverId}?`)) return
    modActionMutation.mutate({
      serverId,
      action: 'kick',
      target: username,
      reason: 'Kicked by administrator',
    })
  }

  const handleQuickPardon = (username: string) => {
    if (!confirm(`Pardon (unban) '${username}' on ${modServer}?`)) return
    modActionMutation.mutate({
      serverId: modServer,
      action: 'pardon',
      target: username,
      reason: 'Pardoned from Admin Portal',
    })
  }

  const handleDownloadLogs = () => {
    const text = liveLogs.map((l) => `[${l.time}] [${l.source}/${l.level}]: ${l.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `minecraft-console-${logFilterServer}-${new Date().toISOString().slice(0, 10)}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const servers: ServerData[] = telemetry?.servers || []
  const totalOnline: number = telemetry?.totalOnline || 0

  // Filtered live console logs
  const filteredLogs = useMemo(() => {
    return liveLogs.filter((log) => {
      if (logFilterServer !== 'all' && log.serverId !== logFilterServer) return false
      if (logSeverity !== 'ALL' && log.level !== logSeverity) return false
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase()
        return log.message.toLowerCase().includes(q) || log.source.toLowerCase().includes(q)
      }
      return true
    })
  }, [liveLogs, logFilterServer, logSeverity, logSearch])

  // Latency Chart Data
  const latencyChartData = servers.map((s) => ({
    name: s.name.replace('PETABLOCKS ', ''),
    latency: s.online ? s.latency : 0,
    online: s.online,
  }))

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Gamepad2 className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
            Minecraft Server Operations
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            Real-time telemetry, console log streaming, Web RCON, and player moderation
          </p>
        </div>

        {/* Action Controls & Global Badge */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowBridgeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold transition-colors"
            title="View & Copy Telemetry Bridge API Key"
          >
            <Key className="h-3.5 w-3.5" />
            Bridge API Key
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-mono">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total Online:</span>
            <span className="font-bold text-foreground">{totalOnline}</span>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-accent transition-colors"
            title="Refresh Telemetry"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Telemetry Bridge Modal */}
      {showBridgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm sm:text-base font-bold text-foreground">PETABLOCKS Telemetry Bridge Credentials</h3>
              </div>
              <button
                onClick={() => setShowBridgeModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs font-mono px-2 py-1 rounded-md hover:bg-muted"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Configure your Minecraft servers by placing these credentials in <code className="text-foreground font-mono">config/petablocks-telemetry.json</code>:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
                  Gateway WebSocket URL (Production WSS)
                </label>
                <div className="flex gap-2">
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
                    className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center gap-1.5"
                  >
                    {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
                  Internal LAN Gateway (Fallback)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value="ws://10.20.110.116:3000/ws/servers/bridge"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("ws://10.20.110.116:3000/ws/servers/bridge")
                    }}
                    className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground font-mono text-xs rounded-lg border border-border transition-colors flex items-center gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="text-muted-foreground block text-[10px] uppercase font-bold mb-1">
                  API Secret Token (Bearer Auth Key)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
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
                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedToken ? 'Copied Key' : 'Copy Key'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowBridgeModal(false)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex border-b border-border gap-1 sm:gap-2 overflow-x-auto no-scrollbar pb-1 text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all',
            activeTab === 'overview'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Telemetry & Web RCON
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all',
            activeTab === 'logs'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <ScrollText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Live Console Logs
          {sseConnected && (
            <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('moderation')}
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all',
            activeTab === 'moderation'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Gavel className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Player Moderation & Bans
        </button>
      </div>

      {/* ──────────────── TAB 1: OVERVIEW & RCON ──────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
                        {srv.hasModBridge ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Mod Bridge Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            SLP Ping
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                          {srv.version}
                        </span>
                      </div>
                      <h3 className="font-bold text-base mt-1 text-foreground">{srv.name}</h3>
                    </div>
                  </div>

                  <div className="text-xs font-mono text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-md border border-border/50 flex items-center justify-between">
                    <span className="font-bold text-foreground">{srv.displayHost || srv.host}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {srv.resolvedTarget ? `(SRV ${srv.resolvedTarget})` : `(:${srv.port})`}
                    </span>
                  </div>

                  {srv.motd && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-1 italic">
                      "{srv.motd}"
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/60 text-xs font-mono">
                  <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">Tick Performance</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        "text-sm font-bold block",
                        (srv.tps ?? 20) >= 19.5 ? "text-emerald-400" : (srv.tps ?? 20) >= 15 ? "text-amber-400" : "text-rose-400"
                      )}>
                        {srv.tps !== undefined ? `${srv.tps.toFixed(1)} TPS` : '20.0 TPS'}
                      </span>
                      {srv.mspt !== undefined && (
                        <span className="text-[10px] text-muted-foreground">
                          ({srv.mspt.toFixed(1)}ms)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">Players</span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">
                      {srv.players.online} / {srv.players.max}
                    </span>
                  </div>

                  <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">
                      {srv.memory ? 'JVM Heap RAM' : 'SLP Latency'}
                    </span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">
                      {srv.memory
                        ? `${(srv.memory.usedMb / 1024).toFixed(1)} / ${(srv.memory.maxMb / 1024).toFixed(1)} GB`
                        : (srv.online ? `${srv.latency} ms` : '—')}
                    </span>
                  </div>

                  <div className="bg-background/60 p-2.5 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block">World Chunks</span>
                    <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                      {srv.dimensions && srv.dimensions.length > 0
                        ? `${srv.dimensions.reduce((acc, d) => acc + d.loadedChunks, 0)} Chunks`
                        : (srv.online ? 'Loaded' : '—')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Latency Graph & In-Game Broadcast Tool */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Server Latency Chart */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Live Server Latency (ms)
                </h2>
                <span className="text-xs text-muted-foreground font-mono">TCP SLP Ping</span>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={latencyChartData}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} unit="ms" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#090d16', borderColor: '#1f293d', borderRadius: '8px' }}
                    />
                    <Area type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} fill="url(#latencyGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* In-Game Broadcast Tool */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 flex flex-col justify-between">
              <div>
                <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
                  <Radio className="h-4 w-4 text-amber-400" />
                  In-Game Network Broadcast System
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Send global chat announcements or big screen alert titles directly into Minecraft.
                </p>
              </div>

              <form onSubmit={handleSendBroadcast} className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Target Realm</label>
                    <select
                      value={broadcastTarget}
                      onChange={(e) => setBroadcastTarget(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="all">All Servers (Network Broadcast)</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Display Type</label>
                    <select
                      value={broadcastType}
                      onChange={(e) => setBroadcastType(e.target.value as 'chat' | 'title')}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="chat">Chat Announcement (/tellraw)</option>
                      <option value="title">Screen Title Overlay (/title)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="e.g. Scheduled server maintenance in 15 minutes..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!broadcastMsg.trim() || broadcastMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {broadcastMutation.isPending ? 'Broadcasting...' : 'Broadcast'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Interactive Web RCON Terminal Console */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-bold text-sm flex items-center gap-2 text-foreground font-mono">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Interactive Web RCON Console
              </h2>

              <div className="flex items-center gap-2">
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.displayHost || s.host}:{s.rconPort})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setRconHistory([])}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
                  title="Clear Terminal Output"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Macro Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Quick Macros:</span>
              {QUICK_MACROS.map((macro) => (
                <button
                  key={macro.cmd}
                  onClick={() => {
                    setRconHistory((prev) => [
                      ...prev,
                      {
                        serverId: selectedServer,
                        time: new Date().toLocaleTimeString(),
                        type: 'cmd',
                        text: `> /${macro.cmd}`,
                      },
                    ])
                    rconMutation.mutate({ serverId: selectedServer, command: macro.cmd })
                  }}
                  className="px-2.5 py-1 rounded-md bg-muted/60 hover:bg-muted text-foreground border border-border/60 text-xs font-mono transition-colors"
                >
                  {macro.label}
                </button>
              ))}
            </div>

            {/* Terminal Window */}
            <div className="bg-black/90 rounded-xl p-4 border border-border/80 font-mono text-xs text-emerald-400 h-64 overflow-y-auto space-y-1.5 shadow-inner">
              {rconHistory.map((h, i) => (
                <div key={i} className="leading-relaxed break-words">
                  <span className="text-muted-foreground/60 select-none mr-2">[{h.time}]</span>
                  <span className="text-muted-foreground select-none mr-2">@{h.serverId}</span>
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
            <form onSubmit={handleSendRcon} className="flex gap-2">
              <input
                type="text"
                value={rconCommand}
                onChange={(e) => setRconCommand(e.target.value)}
                placeholder="Enter command (e.g. say Hello World, kick player, tps, whitelist)..."
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!rconCommand.trim() || rconMutation.isPending}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Execute
              </button>
            </form>
          </div>

          {/* Active Connected Players & DB Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Connected Player List */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Live Connected Players ({totalOnline})
              </h2>

              {servers.every((s) => (s.players.sample?.length || 0) === 0) ? (
                <div className="py-8 text-center text-muted-foreground text-xs font-mono">
                  No players currently online across network realms.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {servers.map((s) =>
                    (s.players.sample || []).map((p) => (
                      <div
                        key={`${s.id}-${p.name}`}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-background/60 border border-border/50"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={`https://mc-heads.net/avatar/${p.name}/64`}
                            alt={p.name}
                            className="w-8 h-8 rounded-lg bg-black/40 border border-border"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-foreground font-mono">{p.name}</span>
                              {p.ping !== undefined && (
                                <span className="text-[10px] font-mono text-emerald-400">
                                  {p.ping}ms
                                </span>
                              )}
                              {p.dimension && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                                  {p.dimension.replace('minecraft:', '')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                              <span>{s.name}</span>
                              {p.pos && (
                                <span>[{Math.round(p.pos[0])}, {Math.round(p.pos[1])}, {Math.round(p.pos[2])}]</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQuickKick(s.id, p.name)}
                            className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold transition-colors flex items-center gap-1"
                          >
                            <UserX className="h-3 w-3" /> Kick
                          </button>
                          <a
                            href={`https://petablocks.com/stats`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground text-[10px] font-mono transition-colors"
                          >
                            Profile
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Plan / LuckPerms DB Analytics */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
                  <Database className="h-4 w-4 text-cyan-400" />
                  MariaDB Database Analytics (:3307)
                </h2>
                <span className="text-[10px] text-muted-foreground font-mono">Plan & LuckPerms</span>
              </div>

              {analytics?.configured ? (
                <div className="space-y-4 text-xs font-mono">
                  {/* LuckPerms Group Badges */}
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block mb-2">
                      LuckPerms Rank Distribution
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(analytics.rankDistribution || []).map((rank: { group: string; count: number }) => (
                        <span
                          key={rank.group}
                          className="px-2.5 py-1 rounded-lg bg-background border border-border text-foreground font-mono text-xs flex items-center gap-1.5"
                        >
                          <Shield className="h-3 w-3 text-yellow-400" />
                          <span className="capitalize">{rank.group}:</span>
                          <span className="font-bold text-primary">{rank.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top Playtime Leaders */}
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block mb-2">
                      Top Playtime Leaders (Plan DB)
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {(analytics.topPlayers || []).slice(0, 5).map((p: any, idx: number) => (
                        <div
                          key={p.uuid || p.name}
                          className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/40 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-yellow-400 font-bold text-[11px]">#{idx + 1}</span>
                            <span className="font-bold text-foreground">{p.name}</span>
                          </div>
                          <span className="text-emerald-400 font-bold">
                            {Math.floor(p.playtimeSeconds / 3600)}h {Math.floor((p.playtimeSeconds % 3600) / 60)}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-xs font-mono">
                  Database analytics active on port :3307. Querying Plan & LuckPerms tables...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 2: LIVE CONSOLE LOG STREAM ──────────────── */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Left Filter Group */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={logFilterServer}
                onChange={(e) => setLogFilterServer(e.target.value)}
                className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">All Servers (Aggregated)</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {/* Severity Pill Selector */}
              <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border font-mono">
                {['ALL', 'INFO', 'WARN', 'ERROR', 'CHAT', 'COMMAND'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogSeverity(lvl)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors',
                      logSeverity === lvl
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter logs..."
                  className="bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono w-40"
                />
              </div>
            </div>

            {/* Right Action Group */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsLogPaused(!isLogPaused)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-xs transition-colors',
                  isLogPaused
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-muted border-border text-foreground hover:bg-accent'
                )}
              >
                {isLogPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {isLogPaused ? 'Resume Stream' : 'Pause'}
              </button>

              <button
                onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors',
                  autoScrollLogs
                    ? 'bg-primary/10 border-primary/30 text-primary font-bold'
                    : 'bg-muted border-border text-muted-foreground'
                )}
              >
                Auto-Scroll: {autoScrollLogs ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={handleDownloadLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground hover:bg-accent text-xs font-medium"
                title="Download Log File"
              >
                <Download className="h-3 w-3" />
                Export Log
              </button>

              <button
                onClick={() => setLiveLogs([])}
                className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
                title="Clear Logs Buffer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Console Log Terminal Window */}
          <div
            ref={logContainerRef}
            className="bg-black/95 rounded-2xl p-5 border border-border font-mono text-xs h-[520px] overflow-y-auto space-y-1 shadow-2xl"
          >
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground/60 text-xs">
                No log entries match your current filter.
              </div>
            ) : (
              filteredLogs.map((log) => {
                let badgeColor = 'text-muted-foreground bg-muted/40 border-border/50'
                let textColor = 'text-foreground'

                if (log.level === 'WARN') {
                  badgeColor = 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                  textColor = 'text-amber-300'
                } else if (log.level === 'ERROR' || log.level === 'FATAL') {
                  badgeColor = 'text-rose-400 bg-rose-400/10 border-rose-400/30'
                  textColor = 'text-rose-300'
                } else if (log.level === 'CHAT') {
                  badgeColor = 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30'
                  textColor = 'text-cyan-200'
                } else if (log.level === 'COMMAND') {
                  badgeColor = 'text-primary bg-primary/10 border-primary/30'
                  textColor = 'text-emerald-300'
                }

                return (
                  <div key={log.id} className="flex items-start gap-2 hover:bg-white/5 py-0.5 px-1 rounded transition-colors leading-relaxed">
                    <span className="text-muted-foreground/50 select-none shrink-0 font-mono">[{log.time}]</span>
                    <span className={cn('text-[10px] font-bold px-1 rounded border uppercase shrink-0', badgeColor)}>
                      {log.level}
                    </span>
                    <span className="text-muted-foreground/80 shrink-0">[{log.source}]:</span>
                    <span className={cn('whitespace-pre-wrap break-all', textColor)}>
                      {log.message}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ──────────────── TAB 3: MODERATION & BANS ──────────────── */}
      {activeTab === 'moderation' && (
        <div className="space-y-6">
          {/* Top Quick Moderation Form */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2 text-foreground">
                <Gavel className="h-5 w-5 text-rose-400" />
                Player Moderation & Punishment Controls
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Execute server actions (Ban, Kick, Pardon, Whitelist, OP) with automated audit logging to MariaDB.
              </p>
            </div>

            <form onSubmit={handleModActionSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Target Realm</label>
                <select
                  value={modServer}
                  onChange={(e) => setModServer(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Action Type</label>
                <select
                  value={modAction}
                  onChange={(e) => setModAction(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="ban">🔨 Ban Player (/ban)</option>
                  <option value="pardon">🕊️ Pardon / Unban (/pardon)</option>
                  <option value="kick">👢 Kick Player (/kick)</option>
                  <option value="whitelist_add">📝 Add to Whitelist (/whitelist add)</option>
                  <option value="whitelist_remove">❌ Remove from Whitelist (/whitelist remove)</option>
                  <option value="op">⭐ Make Operator (/op)</option>
                  <option value="deop">🚫 Remove Operator (/deop)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Player Username</label>
                <input
                  type="text"
                  value={modTarget}
                  onChange={(e) => setModTarget(e.target.value)}
                  placeholder="e.g. Steve..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Reason (Recorded to Audit Log)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modReason}
                    onChange={(e) => setModReason(e.target.value)}
                    placeholder="e.g. Griefing, rule violation..."
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={!modTarget.trim() || modActionMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-colors shrink-0 disabled:opacity-50"
                  >
                    {modActionMutation.isPending ? 'Executing...' : 'Apply'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Active Bans & Whitelist Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Banned Players List */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  Active Banned Players ({bansData?.bans?.length || 0})
                </h3>
                <span className="text-xs text-muted-foreground font-mono">{modServer}</span>
              </div>

              {(bansData?.bans || []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs font-mono">
                  No active bans recorded on this server realm.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {bansData.bans.map((b: { name: string; reason: string }) => (
                    <div
                      key={b.name}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-background/60 border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://mc-heads.net/avatar/${b.name}/64`}
                          alt={b.name}
                          className="w-7 h-7 rounded bg-black/40 grayscale"
                        />
                        <div>
                          <span className="font-bold text-xs text-rose-400 font-mono block">{b.name}</span>
                          <span className="text-[10px] text-muted-foreground block">{b.reason}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleQuickPardon(b.name)}
                        className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold transition-colors"
                      >
                        Pardon
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Whitelisted Players */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                  Whitelisted Players ({bansData?.whitelist?.length || 0})
                </h3>
                <span className="text-xs text-muted-foreground font-mono">{modServer}</span>
              </div>

              {(bansData?.whitelist || []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs font-mono">
                  No whitelist restrictions configured on this server realm.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1">
                  {bansData.whitelist.map((name: string) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs font-mono"
                    >
                      <img
                        src={`https://mc-heads.net/avatar/${name}/64`}
                        alt={name}
                        className="w-4 h-4 rounded"
                      />
                      <span className="font-bold text-foreground">{name}</span>
                      <button
                        onClick={() => {
                          if (confirm(`Remove '${name}' from whitelist?`)) {
                            modActionMutation.mutate({
                              serverId: modServer,
                              action: 'whitelist_remove',
                              target: name,
                              reason: 'Removed from Admin Portal',
                            })
                          }
                        }}
                        className="text-muted-foreground hover:text-rose-400 transition-colors ml-1"
                        title="Remove from Whitelist"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Staff Moderation Audit Log Table */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                Staff Moderation Audit History (MariaDB)
              </h3>
              <button
                onClick={() => refetchAudit()}
                className="text-xs text-muted-foreground hover:text-foreground font-mono flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Refresh Log
              </button>
            </div>

            {(auditData?.logs || []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs font-mono">
                No moderation audit events recorded yet. Actions taken will appear here.
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-x-auto touch-scroll">
                <table className="w-full text-left text-xs font-mono min-w-[600px]">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Realm</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Target</th>
                      <th className="p-3">Executor</th>
                      <th className="p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {auditData.logs.map((log: ModerationAuditLog) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('en-GB')}
                        </td>
                        <td className="p-3 text-foreground font-bold">{log.server_id}</td>
                        <td className="p-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                            log.action === 'ban' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                            log.action === 'kick' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                            'bg-primary/10 text-primary border border-primary/30'
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-foreground">{log.target}</td>
                        <td className="p-3 text-muted-foreground">{log.executor}</td>
                        <td className="p-3 text-muted-foreground italic truncate max-w-xs">{log.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MinecraftServersPage;
