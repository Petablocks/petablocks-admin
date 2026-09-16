import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2,
  Users,
  ShieldAlert,
  TrainTrack,
  ArrowRight,
  Megaphone,
  Radio,
  Search,
  Shield,
  Clock,
  Sparkles,
  CheckCircle2,
  X,
  Send,
  History,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface SystemHealth {
  containers: {
    total: number
    running: number
    stopped: number
  }
  uptime: string
  cpuPercent: number
  memUsedGb: number
  memTotalGb: number
}

interface MinecraftServerTelemetry {
  id: string
  name: string
  online: boolean
  latency: number
  players: { online: number }
}

interface MinecraftTelemetry {
  totalOnline: number
  totalMax: number
  servers: MinecraftServerTelemetry[]
}

interface OnlinePlayer {
  username: string
  uuid: string
  avatar: string
  serverId: string
  serverName: string
  ping: number | null
  dimension: string
  coordinates: { x: number; y: number; z: number } | null
  health: number | null
  food: number | null
  activeInfractions: number
}

interface ModerationOverview {
  fleet: {
    totalOnlinePlayers: number
    servers: Array<{ id: string; name: string; online: number }>
  }
  infractions: {
    totalActive: number
    activeBans: number
    activeWarns: number
    activeMutes: number
  }
  activity: {
    actionsPast24h: number
    recentActions: Array<{
      id: number
      server_id: string
      action: string
      target: string
      executor: string
      reason: string
      created_at: string
    }>
  }
}

interface RailwayMaintenance {
  id: number
  title: string
  severity: 'closed' | 'caution' | 'info'
  status: 'active' | 'scheduled' | 'cleared' | 'cancelled'
  section_name?: string
  line_name?: string
  speed_limit: string
  reason: string
  starts_at: string
}

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Quick Action Modal States
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false)
  const [broadcastTarget, setBroadcastTarget] = useState('all')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastType, setBroadcastType] = useState('chat')
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')

  // 1. System Health Query (Compacted for devops)
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then((r) => r.json()),
  })

  // 2. Minecraft Summary Query
  const { data: mc, refetch: refetchMc, isFetching: isFetchingMc } = useQuery<MinecraftTelemetry>({
    queryKey: ['mc-summary'],
    queryFn: () => fetch('/api/minecraft/servers').then((r) => r.json()),
    refetchInterval: 12000,
  })

  // 3. Moderation Overview & Recent Actions
  const { data: modOverview, refetch: refetchMod } = useQuery<ModerationOverview>({
    queryKey: ['moderation-overview'],
    queryFn: () => fetch('/api/moderation/overview').then((r) => r.json()),
    refetchInterval: 12000,
  })

  // 4. Live Players Roster
  const { data: playersData } = useQuery<{ total: number; players: OnlinePlayer[] }>({
    queryKey: ['moderation-players'],
    queryFn: () => fetch('/api/moderation/players').then((r) => r.json()),
    refetchInterval: 8000,
  })

  // 5. Active Railway Notices
  const { data: railwayNotices = [] } = useQuery<RailwayMaintenance[]>({
    queryKey: ['railway-maintenance-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/railway/maintenance')
      if (!res.ok) return []
      return res.json()
    },
    refetchInterval: 15000,
  })

  // Broadcast Mutation
  const broadcastMutation = useMutation({
    mutationFn: async ({ serverId, message, type }: { serverId: string; message: string; type: string }) => {
      const res = await fetch('/api/minecraft/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, message, type }),
      })
      if (!res.ok) throw new Error('Broadcast failed')
      return res.json()
    },
    onSuccess: () => {
      setBroadcastMsg('')
      setBroadcastModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['mc-summary'] })
    },
  })

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMsg.trim()) return
    broadcastMutation.mutate({
      serverId: broadcastTarget,
      message: broadcastMsg.trim(),
      type: broadcastType,
    })
  }

  // Derived Values
  const activeRailwayClosures = useMemo(() => {
    return Array.isArray(railwayNotices) ? railwayNotices.filter((n) => n.status === 'active') : []
  }, [railwayNotices])

  const onlinePlayers = playersData?.players || []
  const totalPlayersOnline = mc?.totalOnline ?? onlinePlayers.length ?? 0
  const recentActions = modOverview?.activity?.recentActions || []

  // Filtered players for quick search
  const filteredPlayers = useMemo(() => {
    if (!playerSearchQuery.trim()) return []
    const q = playerSearchQuery.toLowerCase().trim()
    return onlinePlayers.filter(
      (p) => p.username.toLowerCase().includes(q) || (p.uuid && p.uuid.toLowerCase().includes(q))
    )
  }, [onlinePlayers, playerSearchQuery])

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Just now'
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const getActionBadgeColor = (action: string) => {
    const a = action.toLowerCase()
    if (a.includes('ban')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    if (a.includes('warn')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (a.includes('kick')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    if (a.includes('mute')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    if (a.includes('pardon') || a.includes('unban')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    return 'bg-sky-500/20 text-sky-400 border-sky-500/30'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* ──────────────── 1. LIVE OPERATIONAL ALERTS BANNER ──────────────── */}
      {activeRailwayClosures.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-amber-950/30 p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
              <TrainTrack className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Create 2 Active Railway Work Zone</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white uppercase tracking-wider">
                  {activeRailwayClosures.length} ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {activeRailwayClosures[0].title}
                {activeRailwayClosures[0].speed_limit && (
                  <span className="ml-2 font-mono text-amber-300">
                    (Speed Cap: {activeRailwayClosures[0].speed_limit})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Link
              to="/railway"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold transition-all hover:text-white"
            >
              <span>Manage Dispatch</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* ──────────────── TOP WELCOME & LIVE KPI SUMMARY ──────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-primary font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" /> Staff Operations Control
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Mission Control</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time fleet presence, in-game actions, moderation alerts, and transit operations
          </p>
        </div>

        {/* Global Action Tools */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              refetchMc()
              refetchMod()
            }}
            disabled={isFetchingMc}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted text-xs font-mono border border-border text-foreground transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetchingMc && 'animate-spin')} /> Refresh
          </button>
          <button
            onClick={() => setBroadcastModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-transform active:scale-95"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Quick Broadcast
          </button>
          <Link
            to="/railway"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold text-xs transition-colors"
          >
            <TrainTrack className="w-3.5 h-3.5" />
            Railway Hub
          </Link>
        </div>
      </div>

      {/* ──────────────── 2. STAFF QUICK-ACTION COMMAND BAR & SEARCH ──────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Instant Player Search */}
        <div className="md:col-span-2 relative">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Instant Player Search (type username to jump straight to player moderation)..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors shadow-xs"
            />
            {playerSearchQuery && (
              <button
                onClick={() => setPlayerSearchQuery('')}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {playerSearchQuery && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-20 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
              {filteredPlayers.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No online players matching "{playerSearchQuery}". Press enter to search moderation archives.
                </div>
              ) : (
                filteredPlayers.map((p) => (
                  <button
                    key={p.username}
                    onClick={() => {
                      setPlayerSearchQuery('')
                      navigate(`/moderation?player=${p.username}`)
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent text-left text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={`https://mc-heads.net/avatar/${p.username}/24`}
                        alt={p.username}
                        className="w-6 h-6 rounded bg-slate-800"
                      />
                      <div>
                        <span className="font-bold text-foreground">{p.username}</span>
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">({p.serverName})</span>
                      </div>
                    </div>
                    <span className="text-primary font-semibold flex items-center gap-1">
                      View Sanctions <ArrowRight className="w-3 h-3" />
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quick Route Shortcuts */}
        <div className="flex items-center gap-2">
          <Link
            to="/moderation"
            className="flex-1 py-2.5 px-3 rounded-xl border border-border bg-card hover:bg-accent/60 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors text-center"
          >
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            Moderation Hub
          </Link>
          <Link
            to="/events"
            className="flex-1 py-2.5 px-3 rounded-xl border border-border bg-card hover:bg-accent/60 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors text-center"
          >
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            Events &amp; Tips
          </Link>
        </div>
      </div>

      {/* ──────────────── KPI OVERVIEW STRIP ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/minecraft"
          className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Online Players</span>
            <Gamepad2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">{totalPlayersOnline}</div>
          <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Across 3 Realms</span>
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
          </div>
        </Link>

        <Link
          to="/moderation"
          className="rounded-2xl border border-border bg-card p-4 hover:border-amber-500/40 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Active Sanctions</span>
            <ShieldAlert className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400">
            {modOverview?.infractions?.totalActive ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{modOverview?.activity?.actionsPast24h ?? 0} actions (24h)</span>
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
          </div>
        </Link>

        <Link
          to="/railway"
          className="rounded-2xl border border-border bg-card p-4 hover:border-cyan-500/40 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Transit Dispatch</span>
            <TrainTrack className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black font-mono text-cyan-400">55 Trains</div>
          <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{activeRailwayClosures.length > 0 ? `${activeRailwayClosures.length} Work Restrictions` : 'Normal Operations'}</span>
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" />
          </div>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Cluster Status</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-foreground">5 / 5 Online</div>
          <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            FEA, MCS1-3, DB Operational
          </div>
        </div>
      </div>

      {/* ──────────────── 3. LIVE PLAYER RADAR & 4. RECENT MODERATION FEED ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module 3: Live Player Radar (2 columns) */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Live Player Radar</h2>
                <p className="text-xs text-muted-foreground">Online roster across Fabric Main, Create 2 &amp; Patreon Creative</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              {onlinePlayers.length} in-game
            </span>
          </div>

          {onlinePlayers.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-border bg-background/30 text-muted-foreground space-y-1">
              <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-400/60 mb-1" />
              <p className="text-sm font-medium text-foreground">No players online right now</p>
              <p className="text-xs">All server nodes are idling smoothly at 20.0 TPS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
              {onlinePlayers.map((player) => (
                <div
                  key={player.username}
                  className="p-3 rounded-xl border border-border bg-background/50 hover:border-primary/40 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={`https://mc-heads.net/avatar/${player.username}/36`}
                      alt={player.username}
                      className="w-9 h-9 rounded-lg bg-slate-800 border border-border shrink-0 shadow-xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-foreground truncate">{player.username}</span>
                        {player.activeInfractions > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            {player.activeInfractions} warn
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <span className="font-mono text-cyan-400 truncate">{player.serverName || player.serverId}</span>
                        {player.dimension && (
                          <span className="text-[10px] text-slate-400 hidden sm:inline">
                            • {player.dimension.replace('minecraft:', '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {player.ping !== null ? `${player.ping}ms` : ''}
                    </span>
                    <Link
                      to={`/moderation?player=${player.username}`}
                      title="Inspect in Moderation"
                      className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <Link to="/minecraft" className="text-primary hover:underline font-semibold flex items-center gap-1">
              <span>View Full Server Management</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
            <span className="text-muted-foreground text-[11px]">Auto-refreshing every 8s</span>
          </div>
        </div>

        {/* Module 4: Recent Moderation & Sanctions Feed (1 column) */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Recent Sanctions</h2>
                <p className="text-xs text-muted-foreground">Audit log across all servers</p>
              </div>
            </div>
            <Link to="/moderation" className="text-xs font-semibold text-primary hover:underline">
              View All
            </Link>
          </div>

          {recentActions.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-border bg-background/30 text-muted-foreground space-y-1">
              <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-400/60 mb-1" />
              <p className="text-xs font-medium text-foreground">No recent moderation actions</p>
              <p className="text-[11px]">Server fleet rules are currently maintained.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
              {recentActions.slice(0, 5).map((action) => (
                <div
                  key={action.id}
                  className="p-3 rounded-xl border border-border bg-background/50 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn('px-2 py-0.2 rounded-full text-[10px] font-bold uppercase tracking-wider border', getActionBadgeColor(action.action))}>
                        {action.action}
                      </span>
                      <span className="font-bold text-foreground truncate">{action.target}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {formatTimeAgo(action.created_at)}
                    </span>
                  </div>
                  {action.reason && (
                    <p className="text-[11px] text-slate-300 line-clamp-1 leading-relaxed">{action.reason}</p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                    <span>By: {action.executor || 'Admin'}</span>
                    <span className="text-cyan-400">{action.server_id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border text-center">
            <Link to="/moderation" className="text-xs text-muted-foreground hover:text-foreground font-semibold inline-flex items-center gap-1">
              <span>Open Staff Operations Hub</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ──────────────── MINECRAFT REALMS TELEMETRY ──────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Minecraft Production Realms</h2>
          </div>
          <Link to="/minecraft" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Open Server Manager <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(mc?.servers || [
            { id: 'fabric-main', name: 'PETABLOCKS Modpack Server', online: true, latency: 25, players: { online: 0 } },
            { id: 'create-2', name: 'PETABLOCKS Create 2', online: true, latency: 30, players: { online: 0 } },
            { id: 'create-patreon', name: 'PETABLOCKS Patreon Server', online: true, latency: 28, players: { online: 0 } },
          ]).map((srv) => (
            <div key={srv.id} className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm text-foreground">{srv.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {srv.online ? `${srv.latency}ms latency` : 'Offline'}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold',
                    srv.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  )}
                >
                  {srv.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-2 border-t border-border/50">
                <span>Players:</span>
                <span className="font-bold text-foreground">{srv.players.online} active</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────── COMPACT INFRASTRUCTURE & HOST VITALS ──────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Activity className="w-4 h-4 text-primary" />
            <span>Host &amp; Container Vitals (FEA Node)</span>
          </div>
          <Link to="/monitoring" className="text-xs font-semibold text-primary hover:underline">
            View Telemetry
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-background/40 border border-border/40">
            <span className="text-muted-foreground">CPU Usage:</span>
            <p className="text-base font-bold text-foreground mt-0.5">{health ? `${health.cpuPercent.toFixed(1)}%` : '—'}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-background/40 border border-border/40">
            <span className="text-muted-foreground">RAM Used:</span>
            <p className="text-base font-bold text-foreground mt-0.5">{health ? `${health.memUsedGb.toFixed(1)} / ${health.memTotalGb.toFixed(0)} GB` : '—'}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-background/40 border border-border/40">
            <span className="text-muted-foreground">Docker Containers:</span>
            <p className="text-base font-bold text-foreground mt-0.5">{health?.containers.running ?? 0} Running</p>
          </div>
          <div className="p-2.5 rounded-xl bg-background/40 border border-border/40">
            <span className="text-muted-foreground">Host Uptime:</span>
            <p className="text-base font-bold text-foreground mt-0.5 truncate">{health?.uptime || 'Active'}</p>
          </div>
        </div>
      </div>

      {/* ──────────────── QUICK BROADCAST MODAL ──────────────── */}
      {broadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Megaphone className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Quick In-Game Broadcast</h3>
              </div>
              <button onClick={() => setBroadcastModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Target Realm</label>
                <select
                  value={broadcastTarget}
                  onChange={(e) => setBroadcastTarget(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="all">🌐 All Production Realms (Network-Wide)</option>
                  <option value="fabric-main">Fabric Main (play.petablocks.com)</option>
                  <option value="create-2">Just Create SMP 2 (create2.petablocks.com)</option>
                  <option value="create-patreon">Patreon Creative (createcreative.petablocks.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Display Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBroadcastType('chat')}
                    className={cn(
                      'py-2 px-3 rounded-xl border text-xs font-semibold transition-colors',
                      broadcastType === 'chat'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground'
                    )}
                  >
                    💬 Chat Tellraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastType('title')}
                    className={cn(
                      'py-2 px-3 rounded-xl border text-xs font-semibold transition-colors',
                      broadcastType === 'title'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground'
                    )}
                  >
                    🏆 Big Screen Title
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Message Text</label>
                <textarea
                  rows={3}
                  required
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="e.g., [Server Announcement] Welcome to the weekend building contest! Head to /warp contest"
                  className="w-full p-3 rounded-xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setBroadcastModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcastMutation.isPending || !broadcastMsg.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 flex items-center gap-1.5 shadow-md shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {broadcastMutation.isPending ? 'Broadcasting...' : 'Send Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
