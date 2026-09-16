import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LifeBuoy,
  Bug,
  Lightbulb,
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  User,
  Server,
  ThumbsUp,
  X,
  Flame,
  Radio
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SupportTicket {
  id: number
  ticket_code: string
  ticket_type: 'support' | 'bug' | 'report' | 'suggestion'
  source: 'in_game' | 'discord' | 'website'
  server_id: string
  location?: string | null
  player_uuid?: string | null
  minecraft_username?: string | null
  discord_user_id?: string | null
  discord_username?: string | null
  subject: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assigned_to?: string | null
  staff_notes?: string | null
  created_at: string
  updated_at: string
}

interface CommunitySuggestion {
  id: string
  author_id: string
  author_name: string
  author_avatar?: string | null
  title: string
  description: string
  category: string
  status: 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined'
  upvotes_count: number
  downvotes_count: number
  staff_notes?: string | null
  created_at: string
}

const SERVER_OPTIONS = [
  { id: 'all', name: 'All Servers' },
  { id: 'create-2', name: 'Create 2 SMP' },
  { id: 'fabric-main', name: 'Fabric Main' },
  { id: 'patreon-creative', name: 'Patreon Creative' },
  { id: 'general', name: 'General / Web' },
]

export default function SupportDeskPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'tickets' | 'suggestions'>('tickets')

  // Ticket Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [serverFilter, setServerFilter] = useState('all')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)

  // Suggestion Filters
  const [suggestionStatusFilter, setSuggestionStatusFilter] = useState('all')
  const [suggestionSearch, setSuggestionSearch] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] = useState<CommunitySuggestion | null>(null)

  // In-Game Tellraw reply state
  const [tellrawMsg, setTellrawMsg] = useState('')
  const [tellrawSuccess, setTellrawSuccess] = useState('')
  const [tellrawError, setTellrawError] = useState('')

  // Edit ticket state
  const [editStatus, setEditStatus] = useState<'open' | 'in_progress' | 'resolved' | 'closed'>('open')
  const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [editAssigned, setEditAssigned] = useState('')
  const [editStaffNotes, setEditStaffNotes] = useState('')
  const [ticketSaveSuccess, setTicketSaveSuccess] = useState(false)

  // Edit suggestion state
  const [editSuggStatus, setEditSuggStatus] = useState<CommunitySuggestion['status']>('under_review')
  const [editSuggNotes, setEditSuggNotes] = useState('')
  const [suggSaveSuccess, setSuggSaveSuccess] = useState(false)

  // Queries
  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery<{ success: boolean; tickets: SupportTicket[] }>({
    queryKey: ['support-tickets', statusFilter, typeFilter, serverFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (serverFilter !== 'all') params.set('serverId', serverFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      const res = await fetch(`/api/support/tickets?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch tickets')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: suggestionsData, isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery<{ success: boolean; suggestions: CommunitySuggestion[] }>({
    queryKey: ['support-suggestions', suggestionStatusFilter, suggestionSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (suggestionStatusFilter !== 'all') params.set('status', suggestionStatusFilter)
      if (suggestionSearch.trim()) params.set('search', suggestionSearch.trim())
      const res = await fetch(`/api/support/suggestions?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      return res.json()
    },
    refetchInterval: 12000,
  })

  const tickets = ticketsData?.tickets || []
  const suggestions = suggestionsData?.suggestions || []

  // Stats
  const openTicketsCount = useMemo(() => tickets.filter(t => t.status === 'open').length, [tickets])
  const bugTicketsCount = useMemo(() => tickets.filter(t => t.ticket_type === 'bug' && t.status !== 'closed').length, [tickets])
  const pendingSuggestionsCount = useMemo(() => suggestions.filter(s => s.status === 'under_review').length, [suggestions])

  // Select ticket handler
  const handleSelectTicket = (t: SupportTicket) => {
    setSelectedTicket(t)
    setEditStatus(t.status)
    setEditPriority(t.priority)
    setEditAssigned(t.assigned_to || '')
    setEditStaffNotes(t.staff_notes || '')
    setTellrawMsg('')
    setTellrawSuccess('')
    setTellrawError('')
    setTicketSaveSuccess(false)
  }

  // Select suggestion handler
  const handleSelectSuggestion = (s: CommunitySuggestion) => {
    setSelectedSuggestion(s)
    setEditSuggStatus(s.status)
    setEditSuggNotes(s.staff_notes || '')
    setSuggSaveSuccess(false)
  }

  // Ticket update mutation
  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update ticket')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      setTicketSaveSuccess(true)
      setTimeout(() => setTicketSaveSuccess(false), 3000)
    }
  })

  // In-Game tellraw mutation
  const tellrawReplyMutation = useMutation({
    mutationFn: async ({ id, message, serverId }: { id: number; message: string; serverId: string }) => {
      const res = await fetch(`/api/support/tickets/${id}/reply-tellraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, serverId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send tellraw')
      return json
    },
    onSuccess: () => {
      setTellrawSuccess(`Dispatched to ${selectedTicket?.minecraft_username}!`)
      setTellrawError('')
      setTellrawMsg('')
    },
    onError: (err: any) => {
      setTellrawError(err.message)
      setTellrawSuccess('')
    }
  })

  // Suggestion update mutation
  const updateSuggestionMutation = useMutation({
    mutationFn: async ({ id, status, staff_notes }: { id: string; status: string; staff_notes: string }) => {
      const res = await fetch(`/api/support/suggestions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, staff_notes }),
      })
      if (!res.ok) throw new Error('Failed to update suggestion')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-suggestions'] })
      setSuggSaveSuccess(true)
      setTimeout(() => setSuggSaveSuccess(false), 3000)
    }
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30"><Clock className="w-3 h-3" /> Open</span>
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30"><RefreshCw className="w-3 h-3" /> In Progress</span>
      case 'resolved':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3 h-3" /> Resolved</span>
      case 'closed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-zinc-700/50 text-zinc-400 border border-zinc-600/40"><XCircle className="w-3 h-3" /> Closed</span>
      default:
        return <span className="text-xs text-zinc-400">{status}</span>
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'bug':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30"><Bug className="w-3 h-3" /> BUG</span>
      case 'report':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><ShieldAlert className="w-3 h-3" /> REPORT</span>
      case 'suggestion':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30"><Lightbulb className="w-3 h-3" /> SUGGESTION</span>
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"><LifeBuoy className="w-3 h-3" /> SUPPORT</span>
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'in_game':
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">In-Game</span>
      case 'discord':
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">Discord</span>
      default:
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">Web</span>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1"><Flame className="w-3 h-3 text-rose-500 animate-pulse" /> Urgent</span>
      case 'high':
        return <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">High</span>
      case 'normal':
        return <span className="text-[11px] text-zinc-300">Normal</span>
      default:
        return <span className="text-[11px] text-zinc-500">Low</span>
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-sm">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Support Desk & Issue Tracker
              </h1>
              <p className="text-sm text-zinc-400">
                Unified triage pipeline across In-Game (<code className="text-cyan-400">/report</code>, <code className="text-rose-400">/bug</code>), Discord, and Website
              </p>
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeTab === 'tickets') refetchTickets()
              else refetchSuggestions()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700/60 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Open Tickets</div>
            <div className="text-2xl font-black text-sky-400 mt-1">{openTicketsCount}</div>
          </div>
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Active Bug Reports</div>
            <div className="text-2xl font-black text-rose-400 mt-1">{bugTicketsCount}</div>
          </div>
          <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Bug className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Suggestions in Review</div>
            <div className="text-2xl font-black text-purple-400 mt-1">{pendingSuggestionsCount}</div>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Lightbulb className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Total Tracked Items</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{tickets.length + suggestions.length}</div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-zinc-800 space-x-6">
        <button
          onClick={() => setActiveTab('tickets')}
          className={cn(
            'pb-3 text-sm font-semibold transition-all relative flex items-center gap-2',
            activeTab === 'tickets' ? 'text-cyan-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <LifeBuoy className="w-4 h-4" />
          Support & Bug Tickets
          {openTicketsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {openTicketsCount}
            </span>
          )}
          {activeTab === 'tickets' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('suggestions')}
          className={cn(
            'pb-3 text-sm font-semibold transition-all relative flex items-center gap-2',
            activeTab === 'suggestions' ? 'text-purple-400' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <Lightbulb className="w-4 h-4" />
          Community Suggestions
          {pendingSuggestionsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
              {pendingSuggestionsCount}
            </span>
          )}
          {activeTab === 'suggestions' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
          )}
        </button>
      </div>

      {/* TAB 1: TICKETS & BUGS */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search subject, player, or code (e.g. BUG-A12B)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-950/70 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">All Types</option>
              <option value="bug">🐛 Bug Reports</option>
              <option value="report">⚠️ Player Reports</option>
              <option value="suggestion">💡 Suggestions</option>
              <option value="support">🎫 General Support</option>
            </select>

            {/* Server Filter */}
            <select
              value={serverFilter}
              onChange={(e) => setServerFilter(e.target.value)}
              className="bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              {SERVER_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Tickets Table */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden shadow-sm">
            {ticketsLoading ? (
              <div className="p-12 text-center text-zinc-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
                Loading tickets...
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                <LifeBuoy className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                <p className="text-sm">No tickets found matching your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-950/70 text-zinc-400 font-semibold border-b border-zinc-800">
                    <tr>
                      <th className="py-3 px-4">Ticket</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Reporter</th>
                      <th className="py-3 px-4">Subject & Server</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Submitted</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {tickets.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => handleSelectTicket(t)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400 group-hover:underline">
                          {t.ticket_code}
                        </td>
                        <td className="py-3 px-4">{getTypeBadge(t.ticket_type)}</td>
                        <td className="py-3 px-4">{getSourceBadge(t.source)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {t.minecraft_username ? (
                              <img
                                src={`https://mc-heads.net/avatar/${t.minecraft_username}/20`}
                                alt={t.minecraft_username}
                                className="w-5 h-5 rounded"
                              />
                            ) : (
                              <User className="w-4 h-4 text-zinc-500" />
                            )}
                            <span className="font-medium text-white truncate max-w-[120px]">
                              {t.minecraft_username || t.discord_username || 'Anonymous'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-white truncate max-w-[280px]">{t.subject}</div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Server className="w-3 h-3 text-zinc-600" />
                            <span>{t.server_id}</span>
                            {t.location && (
                              <>
                                <span className="text-zinc-700">•</span>
                                <span className="font-mono text-zinc-400">{t.location}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">{getPriorityBadge(t.priority)}</td>
                        <td className="py-3 px-4">{getStatusBadge(t.status)}</td>
                        <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectTicket(t)
                            }}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition-colors"
                          >
                            Triage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMMUNITY SUGGESTIONS */}
      {activeTab === 'suggestions' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search suggestions or submitters..."
                value={suggestionSearch}
                onChange={(e) => setSuggestionSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-950/70 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <select
              value={suggestionStatusFilter}
              onChange={(e) => setSuggestionStatusFilter(e.target.value)}
              className="bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-300 focus:outline-none focus:border-purple-500/50"
            >
              <option value="all">All Statuses</option>
              <option value="under_review">Under Review</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestionsLoading ? (
              <div className="col-span-2 p-12 text-center text-zinc-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-purple-500" />
                Loading suggestions...
              </div>
            ) : suggestions.length === 0 ? (
              <div className="col-span-2 p-12 text-center text-zinc-500">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                <p className="text-sm">No community suggestions found.</p>
              </div>
            ) : (
              suggestions.map((s) => {
                const score = s.upvotes_count - s.downvotes_count
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSuggestion(s)}
                    className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-purple-500/40 hover:bg-zinc-900/80 transition-all cursor-pointer space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {s.category}
                        </span>
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                          s.status === 'completed' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                          s.status === 'planned' && 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
                          s.status === 'in_progress' && 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                          s.status === 'declined' && 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                          s.status === 'under_review' && 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        )}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950/60 border border-zinc-800 font-mono text-xs font-bold text-zinc-300">
                        <ThumbsUp className="w-3 h-3 text-emerald-400" />
                        <span>+{score}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white line-clamp-1">{s.title}</h3>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{s.description}</p>
                    </div>

                    {s.staff_notes && (
                      <div className="p-2 rounded bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200">
                        <span className="font-semibold text-purple-300">Staff Response: </span>
                        {s.staff_notes}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                      <span>Submitted by <strong className="text-zinc-300">{s.author_name}</strong></span>
                      <span>{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* TICKET DETAIL / TRIAGE MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                  {selectedTicket.ticket_type === 'bug' ? (
                    <Bug className="w-5 h-5 text-rose-400" />
                  ) : (
                    <LifeBuoy className="w-5 h-5 text-cyan-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-cyan-400">{selectedTicket.ticket_code}</span>
                    {getTypeBadge(selectedTicket.ticket_type)}
                    {getSourceBadge(selectedTicket.source)}
                  </div>
                  <h2 className="text-base font-bold text-white mt-0.5">{selectedTicket.subject}</h2>
                </div>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Reporter Info Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
                <div>
                  <div className="text-zinc-500 font-medium">Reporter</div>
                  <div className="flex items-center gap-1.5 mt-1 text-white font-semibold">
                    {selectedTicket.minecraft_username && (
                      <img
                        src={`https://mc-heads.net/avatar/${selectedTicket.minecraft_username}/16`}
                        alt=""
                        className="w-4 h-4 rounded"
                      />
                    )}
                    <span>{selectedTicket.minecraft_username || selectedTicket.discord_username || 'Anonymous'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 font-medium">Server</div>
                  <div className="mt-1 text-zinc-200 font-mono">{selectedTicket.server_id}</div>
                </div>
                <div>
                  <div className="text-zinc-500 font-medium">Coordinates</div>
                  <div className="mt-1 text-zinc-200 font-mono">{selectedTicket.location || 'None'}</div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Report Description
                </label>
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.description}
                </div>
              </div>

              {/* Quick In-Game Tellraw Reply */}
              {selectedTicket.minecraft_username && (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                      In-Game Tellraw Reply to {selectedTicket.minecraft_username}
                    </div>
                    <span className="text-[11px] text-zinc-400">Direct RCON broadcast</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Thanks for the report! We fixed the rail switch at your coords."
                      value={tellrawMsg}
                      onChange={(e) => setTellrawMsg(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && tellrawMsg.trim()) {
                          tellrawReplyMutation.mutate({
                            id: selectedTicket.id,
                            message: tellrawMsg,
                            serverId: selectedTicket.server_id || 'create-2',
                          })
                        }
                      }}
                      className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                    />
                    <button
                      disabled={!tellrawMsg.trim() || tellrawReplyMutation.isPending}
                      onClick={() => {
                        tellrawReplyMutation.mutate({
                          id: selectedTicket.id,
                          message: tellrawMsg,
                          serverId: selectedTicket.server_id || 'create-2',
                        })
                      }}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send Tellraw
                    </button>
                  </div>

                  {tellrawSuccess && <p className="text-xs text-emerald-400 font-medium">✓ {tellrawSuccess}</p>}
                  {tellrawError && <p className="text-xs text-rose-400 font-medium">✕ {tellrawError}</p>}
                </div>
              )}

              {/* Triage & Status Update Form */}
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as any)}
                      className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Assigned Staff</label>
                    <input
                      type="text"
                      placeholder="e.g. michael"
                      value={editAssigned}
                      onChange={(e) => setEditAssigned(e.target.value)}
                      className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1">Internal Staff Notes / Resolution Details</label>
                  <textarea
                    rows={3}
                    placeholder="Notes visible to staff triage..."
                    value={editStaffNotes}
                    onChange={(e) => setEditStaffNotes(e.target.value)}
                    className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    {ticketSaveSuccess && (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Ticket updated successfully!
                      </span>
                    )}
                  </div>
                  <button
                    disabled={updateTicketMutation.isPending}
                    onClick={() => {
                      updateTicketMutation.mutate({
                        id: selectedTicket.id,
                        data: {
                          status: editStatus,
                          priority: editPriority,
                          assigned_to: editAssigned,
                          staff_notes: editStaffNotes,
                        },
                      })
                    }}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm"
                  >
                    {updateTicketMutation.isPending ? 'Saving...' : 'Save Triage Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUGGESTION DETAIL / STATUS MODAL */}
      {selectedSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">Manage Suggestion</h2>
              </div>
              <button
                onClick={() => setSelectedSuggestion(null)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                {selectedSuggestion.category}
              </span>
              <h3 className="text-base font-bold text-white mt-2">{selectedSuggestion.title}</h3>
              <p className="text-xs text-zinc-300 mt-1 whitespace-pre-wrap">{selectedSuggestion.description}</p>
              <div className="text-xs text-zinc-500 mt-2">
                Proposed by <strong className="text-zinc-400">{selectedSuggestion.author_name}</strong> • Net Score: <strong>+{selectedSuggestion.upvotes_count - selectedSuggestion.downvotes_count}</strong>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-zinc-800">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Status</label>
                <select
                  value={editSuggStatus}
                  onChange={(e) => setEditSuggStatus(e.target.value as any)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs py-2 px-3 text-zinc-200 focus:outline-none focus:border-purple-500/50"
                >
                  <option value="under_review">Under Review</option>
                  <option value="planned">Planned (Roadmap)</option>
                  <option value="in_progress">In Progress (Active Dev)</option>
                  <option value="completed">Completed (Implemented)</option>
                  <option value="declined">Declined</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Staff Response / Public Notes</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Great idea! Scheduled for next Friday maintenance."
                  value={editSuggNotes}
                  onChange={(e) => setEditSuggNotes(e.target.value)}
                  className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg text-xs p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  {suggSaveSuccess && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Updated!
                    </span>
                  )}
                </div>
                <button
                  disabled={updateSuggestionMutation.isPending}
                  onClick={() => {
                    updateSuggestionMutation.mutate({
                      id: selectedSuggestion.id,
                      status: editSuggStatus,
                      staff_notes: editSuggNotes,
                    })
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm"
                >
                  {updateSuggestionMutation.isPending ? 'Saving...' : 'Update Suggestion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
