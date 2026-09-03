import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Clock,
  Trophy,
  Skull,
  Search,
  Activity,
  Server,
  X,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface OverviewData {
  totalPlayers: number
  totalPlaytimeMs: number
  totalPlaytimeHours: number
  totalPlaytimeFormatted: string
  totalSessions: number
  totalDeaths: number
  totalAdvancements: number
  currentlyOnline: number
  serverDistribution: Array<{
    serverId: string
    uniquePlayers: number
    playtimeMs: number
    playtimeFormatted: string
    sessions: number
  }>
}

interface LeaderboardPlayer {
  rank: number
  uuid: string
  username: string
  avatarUrl: string
  isOnline: boolean
  lastServerId?: string
  playtimeMs: number
  playtimeFormatted: string
  sessions: number
  deaths?: number
  advancements?: number
  firstSeen: number
  lastSeen: number
}

interface PlayerProfile {
  uuid: string
  username: string
  avatarUrl: string
  bodyUrl: string
  isOnline: boolean
  lastServerId?: string
  firstSeen: number
  lastSeen: number
  totalPlaytimeMs: number
  totalPlaytimeFormatted: string
  totalSessions: number
  totalDeaths: number
  totalAdvancements: number
  servers: Array<{
    serverId: string
    playtimeMs: number
    playtimeFormatted: string
    sessions: number
  }>
  recentSessions: Array<{
    id: number
    serverId: string
    start: number
    end: number | null
    durationMs: number
    durationFormatted: string
    dimension?: string
    isActive: boolean
  }>
  recentEvents: Array<{
    id: number
    serverId: string
    type: string
    detail: string
    timestamp: number
  }>
}

const SERVER_NAMES: Record<string, string> = {
  'fabric-main': 'Official Modpack',
  'create-2': 'Create 2 SMP',
  'create-patreon': 'Patreon Creative',
}

export default function PlayerAnalyticsPage() {
  const [selectedServer, setSelectedServer] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('playtime')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedPlayerUuid, setSelectedPlayerUuid] = useState<string | null>(null)

  // 1. Fetch Network Overview
  const { data: overview, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ['player-analytics-overview'],
    queryFn: () => fetch('/api/player-stats/overview').then((r) => r.json()),
    refetchInterval: 15000,
  })

  // 2. Fetch Leaderboard
  const { data: leaderboardData, isLoading: loadingLeaderboard, refetch: refetchLeaderboard } = useQuery<{
    leaderboard: LeaderboardPlayer[]
  }>({
    queryKey: ['player-analytics-leaderboard', selectedServer, sortBy],
    queryFn: () =>
      fetch(`/api/player-stats/leaderboard?serverId=${selectedServer}&sortBy=${sortBy}&limit=50`).then((r) => r.json()),
    refetchInterval: 15000,
  })

  // 3. Fetch Player Details when clicked
  const { data: playerProfile, isLoading: loadingProfile } = useQuery<PlayerProfile>({
    queryKey: ['player-profile', selectedPlayerUuid],
    queryFn: () => fetch(`/api/player-stats/player/${selectedPlayerUuid}`).then((r) => r.json()),
    enabled: Boolean(selectedPlayerUuid),
  })

  const leaderboard = leaderboardData?.leaderboard || []

  // Filter leaderboard by instant search query if present
  const filteredPlayers = leaderboard.filter((p) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return p.username.toLowerCase().includes(q) || p.uuid.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ──────────────── HEADER ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Player Analytics
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Real-time cross-server player tracking, playtime leaderboards, and session telemetry.
          </p>
        </div>
        <button
          onClick={() => {
            refetchOverview()
            refetchLeaderboard()
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium self-start sm:self-auto transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* ──────────────── KPI CARDS ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Total Playtime</p>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-emerald-400">
            {overview ? `${overview.totalPlaytimeHours.toLocaleString()}h` : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across all servers & modpacks
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Total Players</p>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-sky-400">
            {overview ? overview.totalPlayers.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {overview?.currentlyOnline || 0} currently online
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Recorded Sessions</p>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-amber-400">
            {overview ? overview.totalSessions.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Individual game sessions
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Advancements</p>
            <Trophy className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-purple-400">
            {overview ? overview.totalAdvancements.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {overview?.totalDeaths.toLocaleString() || 0} total deaths
          </p>
        </div>
      </div>

      {/* ──────────────── CONTROLS: SERVER TABS & SEARCH ──────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
        {/* Server Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border overflow-x-auto text-xs">
          <button
            onClick={() => setSelectedServer('all')}
            className={cn(
              'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
              selectedServer === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All Servers
          </button>
          <button
            onClick={() => setSelectedServer('fabric-main')}
            className={cn(
              'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
              selectedServer === 'fabric-main'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Official Modpack
          </button>
          <button
            onClick={() => setSelectedServer('create-2')}
            className={cn(
              'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
              selectedServer === 'create-2'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Create 2 SMP
          </button>
          <button
            onClick={() => setSelectedServer('create-patreon')}
            className={cn(
              'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
              selectedServer === 'create-patreon'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Patreon Creative
          </button>
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search player or UUID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="playtime">Top Playtime</option>
            <option value="sessions">Most Sessions</option>
            <option value="deaths">Most Deaths</option>
            <option value="advancements">Advancements</option>
          </select>
        </div>
      </div>

      {/* ──────────────── LEADERBOARD TABLE ──────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-center p-3 w-12 font-semibold">#</th>
                <th className="text-left p-3 font-semibold">Player</th>
                <th className="text-left p-3 font-semibold">Last Server</th>
                <th className="text-right p-3 font-semibold">Playtime</th>
                <th className="text-right p-3 font-semibold">Sessions</th>
                <th className="text-right p-3 font-semibold">Deaths</th>
                <th className="text-right p-3 font-semibold">Last Seen</th>
                <th className="text-center p-3 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingLeaderboard ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Loading player analytics...
                  </td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No players found matching this criteria.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr
                    key={player.uuid}
                    onClick={() => setSelectedPlayerUuid(player.uuid)}
                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                  >
                    <td className="p-3 text-center font-mono font-bold text-muted-foreground">
                      {player.rank <= 3 ? (
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                            player.rank === 1 && 'bg-amber-400/20 text-amber-400 border border-amber-400/40',
                            player.rank === 2 && 'bg-slate-300/20 text-slate-300 border border-slate-300/40',
                            player.rank === 3 && 'bg-amber-600/20 text-amber-500 border border-amber-600/40'
                          )}
                        >
                          {player.rank}
                        </span>
                      ) : (
                        player.rank
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={player.avatarUrl}
                          alt={player.username}
                          className="w-8 h-8 rounded-md bg-muted/60 border border-border shrink-0 shadow-sm"
                          loading="lazy"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{player.username}</span>
                            {player.isOnline && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                ONLINE
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[140px] sm:max-w-[200px]">
                            {player.uuid}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
                        <Server className="h-3 w-3" />
                        {player.lastServerId ? (SERVER_NAMES[player.lastServerId] || player.lastServerId) : 'Network'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground text-xs sm:text-sm">
                      {player.playtimeFormatted}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {player.sessions}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {player.deaths ?? 0}
                    </td>
                    <td className="p-3 text-right text-muted-foreground font-mono text-[11px]">
                      {new Date(player.lastSeen).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedPlayerUuid(player.uuid)
                        }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────── PLAYER PROFILE MODAL ──────────────── */}
      {selectedPlayerUuid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <img
                  src={`https://mc-heads.net/avatar/${selectedPlayerUuid}/64`}
                  alt="Player"
                  className="w-10 h-10 rounded-lg border border-border bg-background"
                />
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-foreground flex items-center gap-2">
                    {playerProfile?.username || 'Loading Player...'}
                    {playerProfile?.isOnline && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ONLINE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">{selectedPlayerUuid}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayerUuid(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              {loadingProfile || !playerProfile ? (
                <div className="p-12 text-center text-muted-foreground">Loading player profile...</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Total Playtime</p>
                      <p className="text-base font-bold font-mono text-emerald-400 mt-1">
                        {playerProfile.totalPlaytimeFormatted}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Sessions</p>
                      <p className="text-base font-bold font-mono text-sky-400 mt-1">
                        {playerProfile.totalSessions}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Deaths</p>
                      <p className="text-base font-bold font-mono text-rose-400 mt-1">
                        {playerProfile.totalDeaths}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Advancements</p>
                      <p className="text-base font-bold font-mono text-purple-400 mt-1">
                        {playerProfile.totalAdvancements}
                      </p>
                    </div>
                  </div>

                  {/* Server Playtime Breakdown */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Server className="h-3.5 w-3.5" />
                      Playtime by Server
                    </h4>
                    <div className="space-y-2.5">
                      {playerProfile.servers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No server breakdown data recorded.</p>
                      ) : (
                        playerProfile.servers.map((srv) => {
                          const pct =
                            playerProfile.totalPlaytimeMs > 0
                              ? Math.round((srv.playtimeMs / playerProfile.totalPlaytimeMs) * 100)
                              : 0
                          return (
                            <div key={srv.serverId} className="p-2.5 rounded-lg border border-border/60 bg-card">
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="font-bold text-foreground">
                                  {SERVER_NAMES[srv.serverId] || srv.serverId}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {srv.playtimeFormatted} ({pct}%)
                                </span>
                              </div>
                              <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Recent Sessions */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      Recent Sessions
                    </h4>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/20 text-muted-foreground text-[11px]">
                            <th className="text-left p-2.5">Server</th>
                            <th className="text-left p-2.5">Date</th>
                            <th className="text-right p-2.5">Duration</th>
                            <th className="text-right p-2.5">Dimension</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerProfile.recentSessions.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                No sessions recorded yet.
                              </td>
                            </tr>
                          ) : (
                            playerProfile.recentSessions.map((s) => (
                              <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                                <td className="p-2.5 font-medium text-foreground">
                                  {SERVER_NAMES[s.serverId] || s.serverId}
                                </td>
                                <td className="p-2.5 text-muted-foreground font-mono text-[11px]">
                                  {new Date(s.start).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-foreground">
                                  {s.isActive ? (
                                    <span className="text-emerald-400">ACTIVE</span>
                                  ) : (
                                    s.durationFormatted
                                  )}
                                </td>
                                <td className="p-2.5 text-right text-muted-foreground font-mono text-[11px]">
                                  {s.dimension || 'overworld'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recent Events */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5" />
                      Recent Activity
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {playerProfile.recentEvents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No recent events logged.</p>
                      ) : (
                        playerProfile.recentEvents.map((e) => (
                          <div
                            key={e.id}
                            className="p-2 rounded-md bg-muted/20 border border-border/40 text-xs flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {e.type === 'death' && <Skull className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                              {e.type === 'advancement' && <Trophy className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                              {e.type === 'join' && <span className="text-emerald-400 text-sm">📥</span>}
                              {e.type === 'leave' && <span className="text-sky-400 text-sm">📤</span>}
                              <span className="truncate text-foreground font-medium">{e.detail}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-2">
                              {new Date(e.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

