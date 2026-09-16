import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  MessageSquare,
  History,
  Megaphone,
  Search,
  RefreshCw,
  AlertTriangle,
  UserX,
  VolumeX,
  CheckCircle2,
  X,
  Send,
  Radio,
  Crown,
  Ban,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
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

interface Infraction {
  id: number
  server_id: string
  player_uuid: string | null
  player_name: string
  type: 'warn' | 'mute' | 'kick' | 'ban' | 'note'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  reason: string
  staff_name: string
  staff_id: string | null
  active: number
  expires_at: string | null
  created_at: string
}

interface ChatLogMessage {
  id: string
  serverId: string
  time: string
  timestamp: string
  source: string
  level: string
  rawMessage: string
  username?: string | null
  text: string
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  info: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  low: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
}

const ACTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ban: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  kick: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  warn: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  mute: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  unmute: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  pardon: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  whitelist_add: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  whitelist_remove: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  broadcast: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

const PRESET_REASONS = [
  'Griefing / Unauthorized Block Destruction',
  'Hate Speech / Harassment in Chat',
  'AFK Exploit / Automated Farming Violation',
  'Duping / Illegal Item Generation',
  'Inappropriate Build, Sign or Skin',
  'Spamming / Advertising Other Networks',
  'First Warning / Rule Alignment Notice',
]

export default function ModerationPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'players' | 'chat' | 'infractions' | 'audit' | 'broadcast'>('players')

  // Search & Filter state
  const [playerSearch, setPlayerSearch] = useState('')
  const [serverFilter, setServerFilter] = useState('all')

  // Chat stream state
  const [chatMessages, setChatMessages] = useState<ChatLogMessage[]>([])
  const [chatFilter, setChatFilter] = useState<'all' | 'chat' | 'broadcast' | 'game'>('all')
  const [chatSearch, setChatSearch] = useState('')
  const [quickBroadcastText, setQuickBroadcastText] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Infractions state
  const [infractionTypeFilter, setInfractionTypeFilter] = useState('all')
  const [infractionStatusFilter, setInfractionStatusFilter] = useState('active')
  const [infractionSearch, setInfractionSearch] = useState('')

  // Action Modal State
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<{
    username: string
    serverId: string
    uuid?: string
  } | null>(null)
  const [actionType, setActionType] = useState<string>('warn')
  const [actionReason, setActionReason] = useState('')
  const [actionSeverity, setActionSeverity] = useState<'info' | 'low' | 'medium' | 'high' | 'critical'>('medium')
  const [actionDestination, setActionDestination] = useState('')

  // Broadcast Tab State
  const [broadcastTarget, setBroadcastTarget] = useState('all')
  const [broadcastType, setBroadcastType] = useState<'chat' | 'title' | 'actionbar'>('chat')
  const [broadcastColor, setBroadcastColor] = useState('gold')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastSuccessNotice, setBroadcastSuccessNotice] = useState<string | null>(null)

  // Fetch Current SSO Authenticated User
  const { data: authSession } = useQuery<{ authenticated: boolean; user?: any }>({
    queryKey: ['admin-auth-session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) return { authenticated: false }
      return res.json()
    },
    staleTime: 60000,
  })

  const staffDisplayName =
    authSession?.user?.minecraft?.username ||
    authSession?.user?.username ||
    authSession?.user?.name ||
    'Staff Member'

  // Fetch Overview Stats
  const { data: overview, refetch: refetchOverview } = useQuery<ModerationOverview>({
    queryKey: ['moderation-overview'],
    queryFn: async () => {
      const res = await fetch('/api/moderation/overview')
      if (!res.ok) throw new Error('Failed to fetch moderation overview')
      return res.json()
    },
    refetchInterval: 10000,
  })

  // Fetch Live Players Roster
  const { data: playersData, isLoading: playersLoading, refetch: refetchPlayers } = useQuery<{
    total: number
    players: OnlinePlayer[]
  }>({
    queryKey: ['moderation-players'],
    queryFn: async () => {
      const res = await fetch('/api/moderation/players')
      if (!res.ok) throw new Error('Failed to fetch player roster')
      return res.json()
    },
    refetchInterval: 6000,
  })

  // Fetch Infractions
  const { data: infractionsData, refetch: refetchInfractions } = useQuery<{
    total: number
    infractions: Infraction[]
  }>({
    queryKey: ['moderation-infractions', infractionTypeFilter, infractionStatusFilter, infractionSearch, serverFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (infractionTypeFilter !== 'all') params.set('type', infractionTypeFilter)
      if (infractionStatusFilter === 'active') params.set('active', '1')
      if (infractionStatusFilter === 'pardoned') params.set('active', '0')
      if (infractionSearch.trim()) params.set('player', infractionSearch.trim())
      if (serverFilter !== 'all') params.set('server_id', serverFilter)
      params.set('limit', '50')

      const res = await fetch(`/api/moderation/infractions?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch infractions')
      return res.json()
    },
    refetchInterval: 15000,
  })

  // Fetch Bans & Whitelist
  const { data: bansData, refetch: refetchBans } = useQuery<{
    bans: Array<{ name: string; reason: string; source: string }>
    whitelist: string[]
  }>({
    queryKey: ['moderation-bans', serverFilter],
    queryFn: async () => {
      const srv = serverFilter === 'all' ? 'fabric-main' : serverFilter
      const res = await fetch(`/api/moderation/bans?serverId=${srv}`)
      if (!res.ok) return { bans: [], whitelist: [] }
      return res.json()
    },
    refetchInterval: 15000,
  })

  // SSE Live Chat Stream Listener
  useEffect(() => {
    let eventSource: EventSource | null = null

    const connectSSE = () => {
      eventSource = new EventSource('/api/moderation/chat/stream?serverId=all')

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'initial' && Array.isArray(data.messages)) {
            setChatMessages(data.messages)
          } else if (data.id) {
            setChatMessages((prev) => {
              const updated = [...prev, data]
              return updated.slice(-150)
            })
          }
        } catch (_) {}
      }

      eventSource.onerror = () => {
        eventSource?.close()
        // Retry connection after 5 seconds
        setTimeout(connectSSE, 5000)
      }
    }

    connectSSE()

    return () => {
      eventSource?.close()
    }
  }, [])

  // Auto-scroll chat feed to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  // Execute Moderation Action Mutation
  const executeActionMutation = useMutation({
    mutationFn: async (payload: {
      serverId: string
      action: string
      target: string
      reason: string
      severity?: string
      destination?: string
    }) => {
      const res = await fetch('/api/moderation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Execution failed')
      }
      return res.json()
    },
    onSuccess: () => {
      setActionModalOpen(false)
      setActionReason('')
      refetchPlayers()
      refetchInfractions()
      refetchOverview()
      refetchBans()
      queryClient.invalidateQueries({ queryKey: ['moderation-audit'] })
    },
  })

  // Pardon Infraction Mutation
  const pardonMutation = useMutation({
    mutationFn: async (infractionId: number) => {
      const res = await fetch(`/api/moderation/infractions/${infractionId}/pardon`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error('Failed to pardon infraction')
      return res.json()
    },
    onSuccess: () => {
      refetchInfractions()
      refetchOverview()
    },
  })

  // Broadcast Mutation
  const broadcastMutation = useMutation({
    mutationFn: async (payload: {
      serverId: string
      message: string
      type: string
      color: string
    }) => {
      const res = await fetch('/api/moderation/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Broadcast failed')
      return res.json()
    },
    onSuccess: (data) => {
      setBroadcastSuccessNotice(`Broadcast dispatched to ${data.targeted} server(s)!`)
      setBroadcastMessage('')
      setQuickBroadcastText('')
      setTimeout(() => setBroadcastSuccessNotice(null), 5000)
      refetchOverview()
    },
  })

  // Quick action opener
  const handleOpenActionModal = (player: { username: string; serverId: string; uuid?: string }, defaultAction = 'warn') => {
    setSelectedPlayer(player)
    setActionType(defaultAction)
    setActionReason('')
    setActionModalOpen(true)
  }

  // Filtered players
  const filteredPlayers = useMemo(() => {
    const list = playersData?.players || []
    return list.filter((p) => {
      const matchSearch =
        p.username.toLowerCase().includes(playerSearch.toLowerCase()) ||
        p.uuid.toLowerCase().includes(playerSearch.toLowerCase())
      const matchServer = serverFilter === 'all' || p.serverId === serverFilter
      return matchSearch && matchServer
    })
  }, [playersData, playerSearch, serverFilter])

  // Filtered chat messages
  const filteredChat = useMemo(() => {
    return chatMessages.filter((msg) => {
      const matchServer = serverFilter === 'all' || msg.serverId === serverFilter
      const matchSearch =
        !chatSearch.trim() ||
        (msg.username && msg.username.toLowerCase().includes(chatSearch.toLowerCase())) ||
        msg.text.toLowerCase().includes(chatSearch.toLowerCase()) ||
        msg.rawMessage.toLowerCase().includes(chatSearch.toLowerCase())

      let matchType = true
      if (chatFilter === 'chat') matchType = msg.source === 'Chat' || Boolean(msg.username)
      if (chatFilter === 'broadcast') matchType = msg.source === 'Broadcast' || msg.source === 'Moderation'
      if (chatFilter === 'game') matchType = msg.source === 'Game'

      return matchServer && matchSearch && matchType
    })
  }, [chatMessages, serverFilter, chatSearch, chatFilter])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* Top Header & SSO Verification Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/25">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                Staff Operations & Moderation Hub
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  LIVE FLEET
                </span>
              </h1>
              <p className="text-xs lg:text-sm text-slate-400">
                Cross-node sanctions, real-time player telemetries, chat monitoring & audit trail
              </p>
            </div>
          </div>
        </div>

        {/* Authenticated Staff Identity Badge */}
        <div className="flex items-center gap-3 bg-slate-950/70 px-4 py-2.5 rounded-xl border border-slate-800/80 text-xs">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center border border-slate-700">
            <img
              src={`https://mc-heads.net/avatar/${staffDisplayName}/32`}
              alt={staffDisplayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Authenticated Staff</div>
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              {staffDisplayName}
            </div>
          </div>
          <span className="ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        </div>
      </div>

      {/* KPI Stats Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Online Players</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-400 font-mono">
            {overview?.fleet?.totalOnlinePlayers ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Across 3 production nodes
          </div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Active Sanctions</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-400 font-mono">
            {overview?.infractions?.totalActive ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {overview?.infractions?.activeWarns ?? 0} warns, {overview?.infractions?.activeBans ?? 0} bans
          </div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Staff Actions (24h)</span>
            <History className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-sky-400 font-mono">
            {overview?.activity?.actionsPast24h ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Attributed with SSO audit trail</div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Fleet Chat Stream</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-purple-400 font-mono">
            {chatMessages.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> Live WebSocket & RCON SSE
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1 overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('players')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
              activeTab === 'players'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            <Users className="w-4 h-4" />
            Live Players ({playersData?.total || 0})
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
              activeTab === 'chat'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Live Chat Feed
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          <button
            onClick={() => setActiveTab('infractions')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
              activeTab === 'infractions'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            <Shield className="w-4 h-4" />
            Sanctions & Warnings
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
              activeTab === 'audit'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            <History className="w-4 h-4" />
            Staff Audit Trail
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
              activeTab === 'broadcast'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            <Megaphone className="w-4 h-4" />
            Broadcast Dispatcher
          </button>
        </div>

        {/* Global Server Scope Filter */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Server Scope:</label>
          <select
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500"
          >
            <option value="all">All Servers</option>
            <option value="fabric-main">Modpack Main (play.petablocks.com)</option>
            <option value="create-2">Create 2 SMP (create2.petablocks.com)</option>
            <option value="create-patreon">Patreon Server (createcreative.petablocks.com)</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE PLAYERS ROSTER & QUICK MODERATION */}
      {/* ========================================================================= */}
      {activeTab === 'players' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search online players by username or UUID..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => refetchPlayers()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', playersLoading && 'animate-spin')} />
                Refresh Roster
              </button>

              <button
                onClick={() => handleOpenActionModal({ username: '', serverId: serverFilter === 'all' ? 'fabric-main' : serverFilter }, 'warn')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Direct Sanction (Offline)
              </button>
            </div>
          </div>

          {/* Players Grid */}
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-slate-800/60">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No players found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {playersData?.players?.length === 0
                  ? 'No players are currently connected to the monitored production servers.'
                  : 'No players match your search filter.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredPlayers.map((player) => {
                const dimensionColors: Record<string, string> = {
                  overworld: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
                  the_nether: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
                  the_end: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
                }
                const dimClass = dimensionColors[player.dimension?.toLowerCase()] || dimensionColors.overworld

                return (
                  <div
                    key={`${player.serverId}-${player.username}`}
                    className="bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition flex flex-col justify-between gap-4"
                  >
                    <div>
                      {/* Player Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md">
                            <img
                              src={player.avatar}
                              alt={player.username}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                          </div>
                          <div>
                            <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                              {player.username}
                              {player.activeInfractions > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  {player.activeInfractions} warns
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate max-w-[170px]">
                              {player.uuid || 'Offline UUID'}
                            </div>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800/80 text-slate-300 border border-slate-700">
                          {player.serverId}
                        </span>
                      </div>

                      {/* Coordinates & Dimension Metadata */}
                      <div className="mt-3.5 pt-3 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Dimension</span>
                          <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border inline-block mt-0.5 capitalize', dimClass)}>
                            {player.dimension?.replace('minecraft:', '').replace('the_', '') || 'Overworld'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">Coordinates</span>
                          <span className="font-mono text-slate-300 mt-0.5 block">
                            {player.coordinates
                              ? `${player.coordinates.x}, ${player.coordinates.y}, ${player.coordinates.z}`
                              : 'Live GPS Idle'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Moderation Actions Grid */}
                    <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenActionModal(player, 'warn')}
                          title="Issue Staff Warning"
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 transition"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenActionModal(player, 'mute')}
                          title="Mute Player"
                          className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/25 transition"
                        >
                          <VolumeX className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenActionModal(player, 'kick')}
                          title="Kick Player from Server"
                          className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/25 transition"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenActionModal(player, 'ban')}
                          title="Ban Player from Fleet"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleOpenActionModal(player, 'warn')}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        Action...
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE MULTI-SERVER CHAT STREAM & QUICK MODERATION */}
      {/* ========================================================================= */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          {/* Chat Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Filter Type:</span>
              <button
                onClick={() => setChatFilter('all')}
                className={cn('px-2.5 py-1 rounded-md transition', chatFilter === 'all' ? 'bg-slate-800 text-slate-100 font-bold' : 'text-slate-400')}
              >
                All
              </button>
              <button
                onClick={() => setChatFilter('chat')}
                className={cn('px-2.5 py-1 rounded-md transition', chatFilter === 'chat' ? 'bg-slate-800 text-slate-100 font-bold' : 'text-slate-400')}
              >
                Chat Only
              </button>
              <button
                onClick={() => setChatFilter('broadcast')}
                className={cn('px-2.5 py-1 rounded-md transition', chatFilter === 'broadcast' ? 'bg-slate-800 text-slate-100 font-bold' : 'text-slate-400')}
              >
                Alerts & Staff
              </button>
              <button
                onClick={() => setChatFilter('game')}
                className={cn('px-2.5 py-1 rounded-md transition', chatFilter === 'game' ? 'bg-slate-800 text-slate-100 font-bold' : 'text-slate-400')}
              >
                Game Events
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
              <input
                type="text"
                placeholder="Search live chat lines..."
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Terminal Chat Box */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-slate-400 font-semibold">PETABLOCKS Multi-Server Live Chat Stream</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                SSE Stream Active
              </div>
            </div>

            <div ref={chatScrollRef} className="h-[480px] overflow-y-auto p-4 font-mono text-xs space-y-2 select-text">
              {filteredChat.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Listening for real-time player chat events across servers...
                </div>
              ) : (
                filteredChat.map((msg, index) => {
                  const isBroadcast = msg.source === 'Broadcast' || msg.source === 'Moderation'
                  const isGameEvent = msg.source === 'Game'

                  return (
                    <div
                      key={`${msg.id || index}-${msg.timestamp}`}
                      className={cn(
                        'py-1 px-2 rounded-lg flex items-start gap-2.5 transition',
                        isBroadcast ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20' : 'hover:bg-slate-900/60'
                      )}
                    >
                      <span className="text-slate-500 select-none text-[11px]">{msg.time}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-800 text-slate-400 border border-slate-700 select-none">
                        {msg.serverId}
                      </span>

                      {msg.username ? (
                        <div className="flex items-baseline gap-1.5 flex-1">
                          <button
                            onClick={() => handleOpenActionModal({ username: msg.username!, serverId: msg.serverId }, 'warn')}
                            className="text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                            title={`Moderate ${msg.username}`}
                          >
                            &lt;{msg.username}&gt;
                          </button>
                          <span className="text-slate-200">{msg.text}</span>
                        </div>
                      ) : (
                        <span className={cn('flex-1', isBroadcast ? 'text-amber-300 font-semibold' : isGameEvent ? 'text-cyan-400' : 'text-slate-300')}>
                          {msg.rawMessage}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Quick Broadcast Console Input */}
            <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder="Send quick announcement to all online players in chat... (Press Enter to dispatch)"
                value={quickBroadcastText}
                onChange={(e) => setQuickBroadcastText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickBroadcastText.trim()) {
                    broadcastMutation.mutate({
                      serverId: serverFilter,
                      message: quickBroadcastText.trim(),
                      type: 'chat',
                      color: 'gold',
                    })
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={() => {
                  if (quickBroadcastText.trim()) {
                    broadcastMutation.mutate({
                      serverId: serverFilter,
                      message: quickBroadcastText.trim(),
                      type: 'chat',
                      color: 'gold',
                    })
                  }
                }}
                disabled={broadcastMutation.isPending || !quickBroadcastText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 transition"
              >
                <Send className="w-3.5 h-3.5" />
                Broadcast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SANCTIONS & INFRACTIONS HUB */}
      {/* ========================================================================= */}
      {activeTab === 'infractions' && (
        <div className="space-y-6">
          {/* Active Bans & Whitelist Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bans Table */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-slate-200">Active Server Bans</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">{bansData?.bans?.length || 0} banned</span>
              </div>

              {bansData?.bans?.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No players currently banned on this node.</div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {bansData?.bans?.map((b) => (
                    <div
                      key={b.name}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-bold text-rose-400">{b.name}</span>
                        <div className="text-[10px] text-slate-500">{b.reason}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Unban player ${b.name}?`)) {
                            executeActionMutation.mutate({
                              serverId: serverFilter === 'all' ? 'fabric-main' : serverFilter,
                              action: 'pardon',
                              target: b.name,
                              reason: 'Unbanned via staff panel',
                            })
                          }
                        }}
                        className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-semibold transition"
                      >
                        Unban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Whitelist Table */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-bold text-slate-200">Enforced Whitelist</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">{bansData?.whitelist?.length || 0} whitelisted</span>
              </div>

              {bansData?.whitelist?.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">Whitelist is empty or not enforced.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {bansData?.whitelist?.map((name) => (
                    <span
                      key={name}
                      className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5"
                    >
                      {name}
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${name} from whitelist?`)) {
                            executeActionMutation.mutate({
                              serverId: serverFilter === 'all' ? 'fabric-main' : serverFilter,
                              action: 'whitelist_remove',
                              target: name,
                              reason: 'Removed via staff panel',
                            })
                          }
                        }}
                        className="text-slate-500 hover:text-rose-400"
                        title="Remove from whitelist"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Infractions Master List */}
          <div className="bg-slate-900/40 rounded-xl border border-slate-800/80 overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-medium">Status:</span>
                <select
                  value={infractionStatusFilter}
                  onChange={(e) => setInfractionStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">All Sanctions</option>
                  <option value="active">Active Only</option>
                  <option value="pardoned">Pardoned Only</option>
                </select>

                <span className="text-slate-400 font-medium ml-2">Type:</span>
                <select
                  value={infractionTypeFilter}
                  onChange={(e) => setInfractionTypeFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="warn">Warnings</option>
                  <option value="mute">Mutes</option>
                  <option value="kick">Kicks</option>
                  <option value="ban">Bans</option>
                  <option value="note">Staff Notes</option>
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by player name..."
                  value={infractionSearch}
                  onChange={(e) => setInfractionSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Infractions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Sanction</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Staff Issuer</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {infractionsData?.infractions?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500">
                        No sanctions found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    infractionsData?.infractions?.map((inf) => {
                      const sevClass = SEVERITY_COLORS[inf.severity] || SEVERITY_COLORS.medium
                      const actClass = ACTION_COLORS[inf.type] || ACTION_COLORS.warn

                      return (
                        <tr key={inf.id} className="hover:bg-slate-900/50 transition">
                          <td className="px-4 py-3 font-semibold text-slate-100 flex items-center gap-2">
                            <img
                              src={`https://mc-heads.net/avatar/${inf.player_name}/24`}
                              alt={inf.player_name}
                              className="w-5 h-5 rounded"
                              onError={(e) => {
                                ;(e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                            {inf.player_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase border', actClass.bg, actClass.text, actClass.border)}>
                              {inf.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold uppercase border', sevClass.bg, sevClass.text, sevClass.border)}>
                              {inf.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate text-slate-300">{inf.reason}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{inf.staff_name}</td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">
                            {new Date(inf.created_at).toLocaleDateString()} {new Date(inf.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {inf.active === 1 ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Pardon sanction #${inf.id} for ${inf.player_name}?`)) {
                                    pardonMutation.mutate(inf.id)
                                  }
                                }}
                                className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-semibold transition"
                              >
                                Pardon
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-mono">Pardoned</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STAFF AUDIT TRAIL */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
              <History className="w-4 h-4 text-sky-400" />
              Central Staff Audit Trail
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Immutable chronological record of all administrative commands and player sanctions executed across the PETABLOCKS fleet.
            </p>

            <div className="space-y-2.5">
              {overview?.activity?.recentActions?.map((log) => {
                const actColor = ACTION_COLORS[log.action] || ACTION_COLORS.warn
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700/80 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start md:items-center gap-3">
                      <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase font-mono border', actColor.bg, actColor.text, actColor.border)}>
                        {log.action}
                      </span>
                      <div>
                        <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                          Target: <span className="text-rose-400">{log.target}</span>
                          <span className="text-slate-500 text-[11px]">on {log.server_id}</span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{log.reason || 'No reason provided'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right text-[11px]">
                      <div>
                        <div className="text-slate-300 font-mono font-medium">By: {log.executor}</div>
                        <div className="text-slate-500">{new Date(log.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FLEET BROADCAST DISPATCHER */}
      {/* ========================================================================= */}
      {activeTab === 'broadcast' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/80 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-rose-400" />
                Fleet Announcement Dispatcher
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Dispatch formatted announcements to players in-game. Select target servers, alert format, and preview live.
              </p>
            </div>

            {broadcastSuccessNotice && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {broadcastSuccessNotice}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1.5">Target Destination</label>
                <select
                  value={broadcastTarget}
                  onChange={(e) => setBroadcastTarget(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="all">Network-Wide (All 3 Servers)</option>
                  <option value="fabric-main">play.petablocks.com (Main Modpack)</option>
                  <option value="create-2">create2.petablocks.com (Create 2 SMP)</option>
                  <option value="create-patreon">createcreative.petablocks.com (Patreon)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1.5">Display Mode</label>
                <select
                  value={broadcastType}
                  onChange={(e) => setBroadcastType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="chat">In-Game Chat Announcement (/tellraw)</option>
                  <option value="title">On-Screen Title Alert (/title)</option>
                  <option value="actionbar">Action Bar Alert (/title actionbar)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5 text-xs">Highlight Color</label>
              <div className="flex items-center gap-2">
                {['gold', 'aqua', 'red', 'green', 'yellow', 'light_purple'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setBroadcastColor(c)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition',
                      broadcastColor === c ? 'bg-slate-800 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1.5 text-xs">Announcement Message</label>
              <textarea
                rows={3}
                placeholder="Type your network announcement here..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* In-Game Preview Box */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-2">Live In-Game Preview</span>
              <div className="font-mono text-sm py-2 px-3 bg-black/60 rounded-lg border border-slate-800">
                {broadcastType === 'chat' && (
                  <div>
                    <span className="text-cyan-400 font-bold">[PETABLOCKS - {staffDisplayName}] </span>
                    <span className={`text-${broadcastColor}-400`}>{broadcastMessage || 'Your announcement message will appear here...'}</span>
                  </div>
                )}
                {broadcastType === 'title' && (
                  <div className="text-center py-4">
                    <div className="text-rose-500 font-black text-lg tracking-widest">[ALERT]</div>
                    <div className="text-amber-300 font-bold text-base mt-1">
                      {broadcastMessage || 'Screen Title Message Preview'}
                    </div>
                  </div>
                )}
                {broadcastType === 'actionbar' && (
                  <div className="text-center text-amber-300 font-semibold py-1">
                    {broadcastMessage || 'Action bar message preview'}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (broadcastMessage.trim()) {
                  broadcastMutation.mutate({
                    serverId: broadcastTarget,
                    message: broadcastMessage.trim(),
                    type: broadcastType,
                    color: broadcastColor,
                  })
                }
              }}
              disabled={broadcastMutation.isPending || !broadcastMessage.trim()}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/40 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {broadcastMutation.isPending ? 'Dispatching Broadcast...' : 'Broadcast Fleet Announcement'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MODERATION ACTION DISPATCHER */}
      {/* ========================================================================= */}
      {actionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/25">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Execute Sanction / Moderation</h3>
                  <div className="text-[11px] text-slate-400">
                    Executing as <span className="text-amber-400 font-semibold">{staffDisplayName}</span> (Verified SSO)
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActionModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Target Player Field */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Target Player</label>
                <input
                  type="text"
                  value={selectedPlayer?.username || ''}
                  onChange={(e) => setSelectedPlayer({ username: e.target.value, serverId: selectedPlayer?.serverId || 'fabric-main' })}
                  placeholder="Minecraft Player Username"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Action Selector */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Moderation Action</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-rose-500 capitalize"
                >
                  <option value="warn">⚠️ Issue Warning (/tellraw + /title)</option>
                  <option value="mute">🔇 Mute Player</option>
                  <option value="unmute">🔊 Unmute Player</option>
                  <option value="kick">⚡ Kick Player from Server</option>
                  <option value="ban">🔨 Ban Player from Network</option>
                  <option value="pardon">🟢 Pardon / Unban Player</option>
                  <option value="whitelist_add">🛡️ Add to Server Whitelist</option>
                  <option value="whitelist_remove">❌ Remove from Whitelist</option>
                  <option value="teleport">📍 Teleport Player</option>
                  <option value="clear_inventory">🧹 Clear Inventory</option>
                  <option value="direct_message">✉️ Direct Staff Message</option>
                  <option value="op">👑 Grant Operator (/op)</option>
                  <option value="deop">🚫 Revoke Operator (/deop)</option>
                </select>
              </div>

              {/* Teleport Destination */}
              {actionType === 'teleport' && (
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Destination (Player or X Y Z)</label>
                  <input
                    type="text"
                    value={actionDestination}
                    onChange={(e) => setActionDestination(e.target.value)}
                    placeholder="e.g. 0 80 0 or PlayerName"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              {/* Preset Reasons */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Preset Reason Templates</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setActionReason(r)}
                      className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 transition text-left"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Reason Field */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Official Reason & In-Game Notice</label>
                <textarea
                  rows={2}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide detailed justification for the audit trail..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Severity Selector */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Sanction Severity</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['info', 'low', 'medium', 'high', 'critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setActionSeverity(sev)}
                      className={cn(
                        'py-1.5 rounded-lg text-center font-semibold uppercase text-[10px] border transition',
                        actionSeverity === sev
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      )}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActionModalOpen(false)}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={executeActionMutation.isPending || !selectedPlayer?.username}
                onClick={() => {
                  if (selectedPlayer?.username) {
                    executeActionMutation.mutate({
                      serverId: selectedPlayer.serverId || 'fabric-main',
                      action: actionType,
                      target: selectedPlayer.username,
                      reason: actionReason || 'Action issued by staff',
                      severity: actionSeverity,
                      destination: actionDestination,
                    })
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold disabled:opacity-50 shadow-lg shadow-rose-950/40 transition flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {executeActionMutation.isPending ? 'Executing Action...' : `Confirm ${actionType.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
