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
  Globe,
  Download,
  MapPin,
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
  geoDistribution?: Array<{
    country: string
    countryCode: string
    count: number
  }>
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
  country?: string
  countryCode?: string
  city?: string
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
  country?: string
  countryCode?: string
  city?: string
  lastIp?: string
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
    country?: string
    countryCode?: string
    city?: string
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

interface DownloadAnalyticsData {
  success: boolean
  totalDownloads: number
  byFile: Array<{
    file_id: string
    file_name: string
    downloads: number
    last_downloaded: string
  }>
  byCountry: Array<{
    country: string
    country_code: string
    downloads: number
  }>
  byDevice: Array<{
    device_type: string
    device_model: string
    os_name: string
    browser_name: string
    downloads: number
  }>
  recent: Array<{
    id: number
    file_id: string
    file_name: string
    country: string
    country_code: string
    region?: string
    city: string
    device_type: string
    device_model: string
    os_name: string
    browser_name: string
    created_at: string
  }>
}

const SERVER_NAMES: Record<string, string> = {
  'lobby-main': 'Central Lobby Hub',
  'velocity-proxy': 'Velocity Gateway',
  'create-2': 'Create 2 SMP',
  'create-patreon': 'Patreon Creative',
  'patreon-creative': 'Patreon Creative',
  'fabric-main': 'Official Modpack (Season 1)',
}

function CountryFlagBadge({ code, country, city }: { code?: string; country?: string; city?: string }) {
  const cleanCode = (code || 'XX').toUpperCase()
  const hasValidFlag = cleanCode !== 'XX' && cleanCode !== 'LAN' && cleanCode.length === 2

  return (
    <div className="inline-flex items-center gap-1.5" title={`${city && city !== 'Unknown' ? `${city}, ` : ''}${country || 'Unknown'}`}>
      {hasValidFlag ? (
        <img
          src={`https://flagcdn.com/20x15/${cleanCode.toLowerCase()}.png`}
          alt={cleanCode}
          className="w-4 h-3 rounded-sm object-cover shadow-sm shrink-0 border border-border/40"
          onError={(e) => {
            ;(e.target as HTMLElement).style.display = 'none'
          }}
        />
      ) : (
        <span className="text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono">
          {cleanCode === 'LAN' ? 'LAN' : '🌐'}
        </span>
      )}
      <span className="text-muted-foreground text-xs font-medium truncate max-w-[110px]">
        {country && country !== 'Unknown' ? country : 'Global'}
      </span>
    </div>
  )
}

export default function PlayerAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'downloads'>('leaderboard')
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

  // 4. Fetch Download Analytics
  const { data: downloadAnalytics, isLoading: loadingDownloads, refetch: refetchDownloads } = useQuery<DownloadAnalyticsData>({
    queryKey: ['player-analytics-downloads'],
    queryFn: () => fetch('/api/player-stats/downloads').then((r) => r.json()),
    refetchInterval: 30000,
  })

  const leaderboard = Array.isArray(leaderboardData?.leaderboard) ? leaderboardData.leaderboard : []

  const totalPlaytimeHours = typeof overview?.totalPlaytimeHours === 'number' ? overview.totalPlaytimeHours : 0
  const totalPlayers = typeof overview?.totalPlayers === 'number' ? overview.totalPlayers : 0
  const totalSessions = typeof overview?.totalSessions === 'number' ? overview.totalSessions : 0
  const totalAdvancements = typeof overview?.totalAdvancements === 'number' ? overview.totalAdvancements : 0
  const totalDeaths = typeof overview?.totalDeaths === 'number' ? overview.totalDeaths : 0
  const currentlyOnline = typeof overview?.currentlyOnline === 'number' ? overview.currentlyOnline : 0
  const apiError = (overview as any)?.error || (leaderboardData as any)?.error

  // Filter leaderboard by instant search query if present
  const filteredPlayers = leaderboard.filter((p) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.username?.toLowerCase().includes(q) ||
      p.uuid?.toLowerCase().includes(q) ||
      p.country?.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ──────────────── HEADER ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Player Analytics &amp; Telemetry
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Real-time cross-server player tracking, GeoIP distribution, playtime leaderboards, and modpack download telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Main View Mode Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border">
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5',
                activeTab === 'leaderboard'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Players &amp; Leaderboard
            </button>
            <button
              onClick={() => setActiveTab('downloads')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5',
                activeTab === 'downloads'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Downloads &amp; Files
              {downloadAnalytics?.totalDownloads ? (
                <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px]">
                  {downloadAnalytics.totalDownloads}
                </span>
              ) : null}
            </button>
          </div>

          <button
            onClick={() => {
              refetchOverview()
              refetchLeaderboard()
              refetchDownloads()
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Alert if any API failed */}
      {apiError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <span>⚠️ {apiError}</span>
          <button
            onClick={() => {
              refetchOverview()
              refetchLeaderboard()
            }}
            className="underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* ──────────────── KPI CARDS ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Total Playtime</p>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-emerald-400">
            {overview && !apiError ? `${totalPlaytimeHours.toLocaleString()}h` : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Across all servers &amp; modpacks</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Total Players</p>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-sky-400">
            {overview && !apiError ? totalPlayers.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">{currentlyOnline} currently online</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Recorded Sessions</p>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-amber-400">
            {overview && !apiError ? totalSessions.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Individual game sessions</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Advancements &amp; Deaths</p>
            <Trophy className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold mt-2 font-mono text-purple-400">
            {overview && !apiError ? totalAdvancements.toLocaleString() : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">{totalDeaths.toLocaleString()} total deaths</p>
        </div>
      </div>

      {/* ──────────────── GEOGRAPHIC PLAYER DISTRIBUTION ──────────────── */}
      {overview?.geoDistribution && overview.geoDistribution.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Top Player Geographic Regions</h3>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              {overview.geoDistribution.length} Countries Identified
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {overview.geoDistribution.map((geo) => (
              <div
                key={geo.countryCode + geo.country}
                className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border/60 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  {geo.countryCode !== 'XX' && geo.countryCode !== 'LAN' ? (
                    <img
                      src={`https://flagcdn.com/20x15/${geo.countryCode.toLowerCase()}.png`}
                      alt={geo.countryCode}
                      className="w-4 h-3 rounded-sm object-cover shrink-0"
                    />
                  ) : (
                    <span className="text-xs">🌐</span>
                  )}
                  <span className="font-medium text-foreground truncate">{geo.country}</span>
                </div>
                <span className="font-mono font-bold text-primary ml-1.5 shrink-0">{geo.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────── TAB 1: PLAYERS & LEADERBOARD ──────────────── */}
      {activeTab === 'leaderboard' && (
        <>
          {/* Controls: Server Filter & Search */}
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
                onClick={() => setSelectedServer('lobby-main')}
                className={cn(
                  'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
                  selectedServer === 'lobby-main'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Lobby Hub
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
              <button
                onClick={() => setSelectedServer('fabric-main')}
                className={cn(
                  'px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
                  selectedServer === 'fabric-main'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Season 1 (Archived)
              </button>
            </div>

            {/* Search & Sort */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search player, UUID, or country..."
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

          {/* Leaderboard Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-center p-3 w-12 font-semibold">#</th>
                    <th className="text-left p-3 font-semibold">Player</th>
                    <th className="text-left p-3 font-semibold">Region / GeoIP</th>
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
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        Loading player analytics...
                      </td>
                    </tr>
                  ) : filteredPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
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
                          <CountryFlagBadge
                            code={player.countryCode}
                            country={player.country}
                            city={player.city}
                          />
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
                            <Server className="h-3 w-3" />
                            {player.lastServerId ? SERVER_NAMES[player.lastServerId] || player.lastServerId : 'Network'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-foreground text-xs sm:text-sm">
                          {player.playtimeFormatted}
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{player.sessions}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{player.deaths ?? 0}</td>
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
        </>
      )}

      {/* ──────────────── TAB 2: DOWNLOADS & FILE TELEMETRY ──────────────── */}
      {activeTab === 'downloads' && (
        <div className="space-y-6">
          {/* File Downloads Summary Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase">Total Modpack Downloads</span>
                <Download className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-2">
                {downloadAnalytics?.totalDownloads ? downloadAnalytics.totalDownloads.toLocaleString() : 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Tracked via client ZIP redirect gateway</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase">Active File Targets</span>
                <Server className="h-4 w-4 text-sky-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-sky-400 mt-2">
                {downloadAnalytics?.byFile?.length || 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Create 2 SMP &amp; Creative Sandbox</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase">Countries Reached</span>
                <Globe className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">
                {downloadAnalytics?.byCountry?.length || 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Global player modpack distribution</p>
            </div>
          </div>

          {/* Breakdown Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By File */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                Downloads by Modpack Client
              </h3>
              <div className="space-y-3">
                {downloadAnalytics?.byFile?.map((f) => {
                  const pct =
                    downloadAnalytics.totalDownloads > 0
                      ? Math.round((f.downloads / downloadAnalytics.totalDownloads) * 100)
                      : 0
                  return (
                    <div key={f.file_id} className="p-3 rounded-lg bg-muted/20 border border-border/50">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-foreground">{f.file_name}</span>
                        <span className="font-mono text-muted-foreground">
                          {f.downloads} downloads ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono block mt-1">
                        Last downloaded: {new Date(f.last_downloaded).toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* By Country */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                Downloads by Player Country
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {downloadAnalytics?.byCountry?.map((c) => (
                  <div
                    key={c.country_code + c.country}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {c.country_code && c.country_code !== 'XX' ? (
                        <img
                          src={`https://flagcdn.com/20x15/${c.country_code.toLowerCase()}.png`}
                          alt={c.country_code}
                          className="w-4 h-3 rounded-sm object-cover shrink-0"
                        />
                      ) : (
                        <span>🌐</span>
                      )}
                      <span className="font-medium text-foreground truncate">{c.country}</span>
                    </div>
                    <span className="font-mono font-bold text-primary shrink-0">{c.downloads}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Downloads Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent File Download Telemetry
              </h3>
              <span className="text-xs text-muted-foreground font-mono">
                Showing last {downloadAnalytics?.recent?.length || 0} events
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left p-3">Modpack File</th>
                    <th className="text-left p-3">Location (GeoIP)</th>
                    <th className="text-left p-3">Device &amp; OS</th>
                    <th className="text-left p-3">Browser / Client</th>
                    <th className="text-right p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDownloads ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        Loading download telemetry...
                      </td>
                    </tr>
                  ) : !downloadAnalytics?.recent?.length ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No downloads recorded yet.
                      </td>
                    </tr>
                  ) : (
                    downloadAnalytics.recent.map((d) => (
                      <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-3 font-medium text-foreground">{d.file_name}</td>
                        <td className="p-3">
                          <CountryFlagBadge code={d.country_code} country={d.country} city={d.city} />
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <span className="font-medium text-foreground">{d.os_name}</span>{' '}
                          <span className="text-[11px] opacity-75">({d.device_model})</span>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-[11px]">{d.browser_name}</td>
                        <td className="p-3 text-right text-muted-foreground font-mono text-[11px]">
                          {new Date(d.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground font-mono">{selectedPlayerUuid}</p>
                    {playerProfile?.country && playerProfile.country !== 'Unknown' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                        <MapPin className="h-3 w-3 text-primary" />
                        {playerProfile.city !== 'Unknown' ? `${playerProfile.city}, ` : ''}
                        {playerProfile.country}
                      </span>
                    )}
                  </div>
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
                      Recent Sessions &amp; Region
                    </h4>
                    <div className="border border-border/60 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/20 text-muted-foreground text-[11px]">
                            <th className="text-left p-2.5">Server</th>
                            <th className="text-left p-2.5">Date</th>
                            <th className="text-left p-2.5">Location</th>
                            <th className="text-right p-2.5">Duration</th>
                            <th className="text-right p-2.5">Dimension</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerProfile.recentSessions.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-muted-foreground">
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
                                <td className="p-2.5 text-muted-foreground">
                                  <CountryFlagBadge code={s.countryCode} country={s.country} city={s.city} />
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-foreground">
                                  {s.isActive ? <span className="text-emerald-400">ACTIVE</span> : s.durationFormatted}
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
