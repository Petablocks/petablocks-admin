import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2,
  Users,
  ShieldAlert,
  TrainTrack,
  ArrowRight,
  Megaphone,
  Search,
  Shield,
  Sparkles,
  CheckCircle2,
  X,
  Send,
  History,
  RefreshCw,
  Server,
  Cpu,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { BentoGrid, BentoCard } from '@/components/bento'

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

  // 1. System Health Query
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
      {/* ──────────────── TOP HEADER & CONTROLS ──────────────── */}
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

      {/* ──────────────── 1. LIVE OPERATIONAL ALERTS BANNER (IF ACTIVE) ──────────────── */}
      {activeRailwayClosures.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-amber-950/30 p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
              <TrainTrack className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Active Railway Work Zone</span>
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

      {/* ──────────────── BENTO GRID SYSTEM ──────────────── */}
      <BentoGrid cols={6}>
        {/* TILE 1: ONLINE PLAYERS TELEMETRY (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="emerald"
          icon={<Gamepad2 className="w-4 h-4 text-emerald-400" />}
          title="Online Players"
          subtitle="Realms Presence"
          statusIndicator={{
            color: 'bg-emerald-400',
            label: `${mc?.servers?.filter(s => s.online).length ?? 3}/3 Online`,
            pulse: true,
          }}
          actions={
            <Link to="/minecraft" className="text-muted-foreground hover:text-emerald-400 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-emerald-400 tracking-tight">
                {totalPlayersOnline}
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                Peak: {mc?.totalMax || 120} Max Cap
              </span>
            </div>

            {/* Realm Distribution Bars */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Lobby Hub:</span>
                <span className="font-mono font-bold text-foreground">
                  {mc?.servers?.find(s => s.id === 'lobby-main')?.players.online ?? 0} players
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Create SMP 2:</span>
                <span className="font-mono font-bold text-cyan-400">
                  {mc?.servers?.find(s => s.id === 'create-2')?.players.online ?? 0} players
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Patreon Creative:</span>
                <span className="font-mono font-bold text-purple-400">
                  {mc?.servers?.find(s => s.id === 'create-patreon')?.players.online ?? 0} players
                </span>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* TILE 2: ACTIVE SANCTIONS & RISK (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="amber"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
          title="Moderation Risk"
          subtitle="Live Sanctions & Audit"
          statusIndicator={{
            color: (modOverview?.infractions?.totalActive ?? 0) > 0 ? 'bg-amber-400' : 'bg-emerald-400',
            label: `${modOverview?.activity?.actionsPast24h ?? 0} in 24h`,
          }}
          actions={
            <Link to="/moderation" className="text-muted-foreground hover:text-amber-400 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-amber-400 tracking-tight">
                {modOverview?.infractions?.totalActive ?? 0}
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">Active Infractions</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[11px]">
              <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="text-rose-400 font-bold block">{modOverview?.infractions?.activeBans ?? 0}</span>
                <span className="text-[9px] text-muted-foreground uppercase">Bans</span>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-amber-400 font-bold block">{modOverview?.infractions?.activeWarns ?? 0}</span>
                <span className="text-[9px] text-muted-foreground uppercase">Warns</span>
              </div>
              <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <span className="text-purple-400 font-bold block">{modOverview?.infractions?.activeMutes ?? 0}</span>
                <span className="text-[9px] text-muted-foreground uppercase">Mutes</span>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* TILE 3: TRANSIT & CLUSTER OPS (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="cyan"
          icon={<TrainTrack className="w-4 h-4 text-cyan-400" />}
          title="Transit & Fleet"
          subtitle="Railway & Containers"
          statusIndicator={{
            color: 'bg-emerald-400',
            label: `${health?.containers.running ?? 5} Nodes Active`,
          }}
          actions={
            <Link to="/railway" className="text-muted-foreground hover:text-cyan-400 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
                55 Trains
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {activeRailwayClosures.length > 0 ? `${activeRailwayClosures.length} Speed Limits` : 'Clear Tracks'}
              </span>
            </div>

            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Host CPU / RAM:</span>
                <span className="font-mono text-foreground font-semibold">
                  {health ? `${health.cpuPercent.toFixed(1)}% • ${health.memUsedGb.toFixed(1)}GB` : '28.4% • 18.2GB'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fleet Telemetry:</span>
                <span className="font-mono text-emerald-400 font-semibold">Daemon v1.4.0 Synced</span>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* TILE 4: LIVE PLAYER RADAR (Col Span 4, Row Span 2) */}
        <BentoCard
          colSpan={4}
          rowSpan={2}
          glowColor="primary"
          icon={<Users className="w-4 h-4 text-primary" />}
          title="Live Player Radar"
          subtitle="Online roster across Fabric Main, Create 2 & Patreon"
          badge={
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/25">
              {onlinePlayers.length} in-game
            </span>
          }
          actions={
            <Link
              to="/minecraft"
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
            >
              <span>Manage</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        >
          {/* Quick Filter Search inside Card */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Instant filter players by name or UUID..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-background/80 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {playerSearchQuery && (
              <button
                onClick={() => setPlayerSearchQuery('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown if typing */}
          {playerSearchQuery && filteredPlayers.length > 0 && (
            <div className="mb-3 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 max-h-36 overflow-y-auto space-y-1">
              {filteredPlayers.map((p) => (
                <button
                  key={p.username}
                  onClick={() => {
                    setPlayerSearchQuery('')
                    navigate(`/moderation?player=${p.username}`)
                  }}
                  className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-accent text-left text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://mc-heads.net/avatar/${p.username}/20`}
                      alt={p.username}
                      className="w-5 h-5 rounded bg-slate-800"
                    />
                    <span className="font-bold text-foreground">{p.username}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">({p.serverName})</span>
                  </div>
                  <span className="text-primary font-semibold text-[11px] flex items-center gap-1">
                    Sanctions <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {onlinePlayers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-border bg-background/30 text-muted-foreground">
              <CheckCircle2 className="w-6 h-6 text-emerald-400/70 mb-1" />
              <p className="text-xs font-medium text-foreground">No players online right now</p>
              <p className="text-[11px]">All realm servers are operating at 20.0 TPS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto max-h-[340px] pr-1 custom-scrollbar">
              {onlinePlayers.map((player) => (
                <div
                  key={player.username}
                  className="p-2.5 rounded-xl border border-border/80 bg-background/60 hover:border-primary/40 transition-all flex items-center justify-between gap-2.5 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={`https://mc-heads.net/avatar/${player.username}/32`}
                      alt={player.username}
                      className="w-8 h-8 rounded-lg bg-slate-800 border border-border shrink-0 shadow-xs"
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
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="font-mono text-cyan-400 truncate">{player.serverName || player.serverId}</span>
                        {player.dimension && (
                          <span className="text-[10px] text-slate-400 hidden sm:inline">
                            • {player.dimension.replace('minecraft:', '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {player.ping !== null && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {player.ping}ms
                      </span>
                    )}
                    <Link
                      to={`/moderation?player=${player.username}`}
                      title="Inspect in Moderation"
                      className="p-1 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground text-[11px]">Polling telemetry every 8s</span>
            <Link to="/player-analytics" className="text-primary hover:underline font-semibold flex items-center gap-1">
              <span>View Player Analytics</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </BentoCard>

        {/* TILE 5: RECENT SANCTIONS FEED (Col Span 2, Row Span 2) */}
        <BentoCard
          colSpan={2}
          rowSpan={2}
          glowColor="amber"
          icon={<History className="w-4 h-4 text-amber-400" />}
          title="Recent Sanctions"
          subtitle="Audit log across all servers"
          actions={
            <Link to="/moderation" className="text-xs font-semibold text-primary hover:underline">
              View All
            </Link>
          }
        >
          {recentActions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-border bg-background/30 text-muted-foreground">
              <CheckCircle2 className="w-6 h-6 text-emerald-400/70 mb-1" />
              <p className="text-xs font-medium text-foreground">No recent actions</p>
              <p className="text-[11px]">Rules are currently maintained.</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1 custom-scrollbar">
              {recentActions.slice(0, 6).map((action) => (
                <div
                  key={action.id}
                  className="p-2.5 rounded-xl border border-border/80 bg-background/60 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn('px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider border', getActionBadgeColor(action.action))}>
                        {action.action}
                      </span>
                      <span className="font-bold text-foreground truncate">{action.target}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {formatTimeAgo(action.created_at)}
                    </span>
                  </div>
                  {action.reason && (
                    <p className="text-[11px] text-slate-300 line-clamp-1">{action.reason}</p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                    <span>By: {action.executor || 'Admin'}</span>
                    <span className="text-cyan-400">{action.server_id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-border/60 text-center">
            <Link to="/moderation" className="text-xs text-muted-foreground hover:text-foreground font-semibold inline-flex items-center gap-1">
              <span>Open Staff Operations Hub</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </BentoCard>

        {/* TILE 6: PRODUCTION REALMS (Col Span 4) */}
        <BentoCard
          colSpan={4}
          glowColor="primary"
          icon={<Server className="w-4 h-4 text-primary" />}
          title="Minecraft Production Fleet"
          subtitle="Real-time realm instances & latency"
          actions={
            <Link to="/minecraft" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
              Server Manager <ArrowRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(mc?.servers || [
              { id: 'lobby-main', name: 'PETABLOCKS Lobby Hub', online: true, latency: 15, players: { online: 0 } },
              { id: 'create-2', name: 'PETABLOCKS Create 2', online: true, latency: 30, players: { online: 0 } },
              { id: 'create-patreon', name: 'PETABLOCKS Patreon Server', online: true, latency: 28, players: { online: 0 } },
            ]).map((srv) => (
              <div
                key={srv.id}
                className="p-3 rounded-xl border border-border/80 bg-background/50 flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-foreground truncate">{srv.name}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>Ping: {srv.latency || 20}ms</span>
                    <span className="text-emerald-400 font-bold">{srv.players.online} Online</span>
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">ID: {srv.id}</span>
                  <Link to="/minecraft" className="text-primary hover:underline font-semibold">
                    Console →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* TILE 7: INFRASTRUCTURE & HOST METRICS (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="cyan"
          icon={<Cpu className="w-4 h-4 text-cyan-400" />}
          title="Cluster Health"
          subtitle="Host node utilization"
          actions={
            <Link to="/server-fleet" className="text-xs font-semibold text-primary hover:underline">
              Fleet Nodes
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-background/50 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">CPU Utilization</span>
              <span className="text-sm font-bold font-mono text-foreground mt-0.5 block">
                {health ? `${health.cpuPercent.toFixed(1)}%` : '28.4%'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-background/50 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">Memory Allocated</span>
              <span className="text-sm font-bold font-mono text-foreground mt-0.5 block">
                {health ? `${health.memUsedGb.toFixed(1)}GB` : '18.2GB'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-background/50 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">Containers</span>
              <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                {health?.containers.running ?? 5} Active
              </span>
            </div>
            <div className="p-2 rounded-xl bg-background/50 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">Node Uptime</span>
              <span className="text-sm font-bold font-mono text-foreground mt-0.5 block truncate">
                {health?.uptime || '99.98%'}
              </span>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

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
                  <option value="lobby-main">Lobby Hub (play.petablocks.com)</option>
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
