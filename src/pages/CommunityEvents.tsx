import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Sparkles,
  Megaphone,
  Plus,
  Radio,
  Trophy,
  CheckCircle2,
  Clock,
  X,
  Trash2,
  Layers,
} from 'lucide-react'

interface CommunityEvent {
  id: number
  event_code: string
  title: string
  description: string
  server_id: string
  event_type: string
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  starts_at: string
  ends_at: string | null
  created_by: string
  prizes: string | null
  in_game_announcement_sent: boolean
  created_at: string
}

interface BroadcastMessage {
  id: number
  server_id: string
  message: string
  is_active: boolean
  interval_minutes: number
  last_broadcast_at: string | null
  created_at: string
}

export default function CommunityEventsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'events' | 'broadcasts'>('events')
  const [showEventModal, setShowEventModal] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // New Event Form State
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newServerId, setNewServerId] = useState('ALL')
  const [newEventType, setNewEventType] = useState('COMMUNITY_GATHERING')
  const [newStartsAt, setNewStartsAt] = useState('')
  const [newEndsAt, setNewEndsAt] = useState('')
  const [newPrizes, setNewPrizes] = useState('')

  // New Broadcast Form State
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastServer, setBroadcastServer] = useState('ALL')
  const [broadcastInterval, setBroadcastInterval] = useState(30)

  // 1. Fetch Events
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ success: boolean; events: CommunityEvent[] }>({
    queryKey: ['community-events'],
    queryFn: async () => {
      const res = await fetch('/api/server-manager/events')
      if (!res.ok) throw new Error('Failed to load events')
      return res.json()
    },
    refetchInterval: 15000,
  })

  // 2. Fetch Broadcasts
  const { data: broadcastsData, isLoading: broadcastsLoading } = useQuery<{ success: boolean; broadcasts: BroadcastMessage[] }>({
    queryKey: ['auto-broadcasts'],
    queryFn: async () => {
      const res = await fetch('/api/server-manager/broadcasts')
      if (!res.ok) throw new Error('Failed to load broadcasts')
      return res.json()
    },
    refetchInterval: 15000,
  })

  // Mutations
  const createEventMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/server-manager/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to schedule event')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-events'] })
      setShowEventModal(false)
      resetEventForm()
      showNotice('Event scheduled successfully!')
    },
  })

  const announceEventMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/server-manager/events/${id}/announce`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to announce event')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['community-events'] })
      showNotice(data.message || 'Event announced in-game & on Discord!')
    },
  })

  const updateEventStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/server-manager/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update event')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-events'] })
      showNotice('Event status updated!')
    },
  })

  const addBroadcastMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/server-manager/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to add broadcast')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-broadcasts'] })
      setShowBroadcastModal(false)
      setBroadcastMsg('')
      showNotice('In-game broadcast tip created!')
    },
  })

  const toggleBroadcastMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const res = await fetch(`/api/server-manager/broadcasts/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      })
      if (!res.ok) throw new Error('Failed to toggle broadcast')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-broadcasts'] })
    },
  })

  const deleteBroadcastMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/server-manager/broadcasts/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete broadcast')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-broadcasts'] })
      showNotice('Broadcast message deleted!')
    },
  })

  const showNotice = (msg: string) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(null), 3500)
  }

  const resetEventForm = () => {
    setNewTitle('')
    setNewDescription('')
    setNewServerId('ALL')
    setNewEventType('COMMUNITY_GATHERING')
    setNewStartsAt('')
    setNewEndsAt('')
    setNewPrizes('')
  }

  const handleCreateEventSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newStartsAt) return
    createEventMutation.mutate({
      title: newTitle,
      description: newDescription,
      server_id: newServerId,
      event_type: newEventType,
      starts_at: newStartsAt,
      ends_at: newEndsAt || null,
      prizes: newPrizes || null,
    })
  }

  const handleAddBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMsg) return
    addBroadcastMutation.mutate({
      message: broadcastMsg,
      server_id: broadcastServer,
      interval_minutes: Number(broadcastInterval),
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
      case 'SCHEDULED':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/30'
      case 'COMPLETED':
        return 'bg-muted text-muted-foreground border-border'
      default:
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    }
  }

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'BUILDING_CONTEST':
        return '🏗️ Building Contest'
      case 'BOSS_RAID':
        return '⚔️ Boss Raid'
      case 'TRAIN_RACE':
        return '🚂 Train Race'
      case 'MAINTENANCE':
        return '🛠️ Scheduled Downtime'
      default:
        return '🎪 Community Gathering'
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-2">
            <Sparkles size={14} /> Automation & Engagement
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Community Events & Broadcaster
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage synchronized server events, in-game title & sound broadcasts, and automated periodic tips.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'events' ? (
            <button
              type="button"
              onClick={() => setShowEventModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <Plus size={14} />
              <span>Schedule Event</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowBroadcastModal(true)}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-sky-500/20"
            >
              <Plus size={14} />
              <span>Add Tip Broadcast</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
            activeTab === 'events'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
              : 'bg-transparent text-muted-foreground border-transparent hover:text-white'
          }`}
        >
          <Calendar size={14} />
          <span>Scheduled Events</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/40 text-gray-300">
            {eventsData?.events?.length || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('broadcasts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
            activeTab === 'broadcasts'
              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
              : 'bg-transparent text-muted-foreground border-transparent hover:text-white'
          }`}
        >
          <Radio size={14} />
          <span>In-Game Tip Broadcaster</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/40 text-gray-300">
            {broadcastsData?.broadcasts?.length || 0}
          </span>
        </button>
      </div>

      {/* TAB 1: COMMUNITY EVENTS */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          {eventsLoading ? (
            <div className="p-12 text-center text-muted-foreground text-xs font-mono">
              Loading community events...
            </div>
          ) : !eventsData?.events || eventsData.events.length === 0 ? (
            <div className="p-12 rounded-2xl bg-card border border-border text-center space-y-3">
              <Calendar size={36} className="mx-auto text-muted-foreground/60" />
              <h3 className="text-sm font-bold text-white">No Community Events Scheduled</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Schedule a building contest, raid night, or train race to automatically notify players in-game and on Discord.
              </p>
              <button
                type="button"
                onClick={() => setShowEventModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-500 text-black font-extrabold text-xs"
              >
                Create First Event
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventsData.events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-5 rounded-2xl bg-card border border-border/80 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition-all relative overflow-hidden group shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase font-bold text-muted-foreground">
                        {ev.event_code}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full border ${getStatusBadge(
                          ev.status
                        )}`}
                      >
                        {ev.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-white group-hover:text-amber-300 transition-colors">
                        {ev.title}
                      </h3>
                      <span className="text-[11px] font-semibold text-sky-400 block mt-0.5">
                        {getEventTypeLabel(ev.event_type)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                      {ev.description || 'No description provided.'}
                    </p>

                    {/* Metadata & Prizes */}
                    <div className="space-y-1.5 pt-2 border-t border-border/40 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Starts:
                        </span>
                        <span className="font-mono text-white text-[11px]">
                          {new Date(ev.starts_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Layers size={12} /> Target Realm:
                        </span>
                        <span className="font-mono text-white text-[11px] uppercase">
                          {ev.server_id}
                        </span>
                      </div>

                      {ev.prizes && (
                        <div className="flex items-center justify-between text-amber-400">
                          <span className="flex items-center gap-1 font-bold">
                            <Trophy size={12} /> Rewards:
                          </span>
                          <span className="font-semibold text-amber-300 text-[11px] truncate max-w-[150px]">
                            {ev.prizes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Strip */}
                  <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => announceEventMutation.mutate(ev.id)}
                      disabled={announceEventMutation.isPending}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Megaphone size={12} />
                      <span>{ev.in_game_announcement_sent ? 'Re-Announce' : 'Announce Now'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {ev.status !== 'COMPLETED' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateEventStatusMutation.mutate({ id: ev.id, status: 'COMPLETED' })
                          }
                          className="px-2.5 py-1 rounded-lg bg-card hover:bg-muted text-gray-300 hover:text-white text-[11px] font-bold border border-border"
                        >
                          Finish
                        </button>
                      )}
                      {ev.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateEventStatusMutation.mutate({ id: ev.id, status: 'CANCELLED' })
                          }
                          className="px-2 py-1 rounded-lg bg-card hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 text-[11px] font-bold border border-border"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IN-GAME BROADCASTS */}
      {activeTab === 'broadcasts' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border/80 flex items-start gap-3">
            <Radio size={20} className="text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-white">Automated Tips Daemon:</strong> Rotates helpful player tips, discord invite links, and server advice directly in-game via RCON. Runs every 30 minutes across all cluster game realms with zero client performance impact.
            </div>
          </div>

          {broadcastsLoading ? (
            <div className="p-12 text-center text-muted-foreground text-xs font-mono">
              Loading broadcast messages...
            </div>
          ) : (
            <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
              <div className="divide-y divide-border">
                {broadcastsData?.broadcasts?.map((bc) => (
                  <div
                    key={bc.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] uppercase font-black px-2 py-0.2 rounded-full border ${
                            bc.is_active
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-muted text-gray-500 border-border'
                          }`}
                        >
                          {bc.is_active ? 'Broadcasting' : 'Paused'}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Target: <strong className="text-white uppercase">{bc.server_id}</strong>
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          • Every {bc.interval_minutes}m
                        </span>
                      </div>

                      <p className="text-xs font-mono text-yellow-300 font-semibold pt-1">
                        [PETABLOCKS] {bc.message}
                      </p>

                      <span className="text-[10px] text-gray-500 font-mono block">
                        Last broadcast: {bc.last_broadcast_at ? new Date(bc.last_broadcast_at).toLocaleString() : 'Never'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          toggleBroadcastMutation.mutate({ id: bc.id, is_active: !bc.is_active })
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          bc.is_active
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {bc.is_active ? 'Pause' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteBroadcastMutation.mutate(bc.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCHEDULE EVENT MODAL */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="text-amber-400" size={18} />
                <h3 className="text-base font-black text-white">Schedule Community Event</h3>
              </div>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateEventSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Grand Railway Race 2026"
                  className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Event Type</label>
                  <select
                    value={newEventType}
                    onChange={(e) => setNewEventType(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  >
                    <option value="COMMUNITY_GATHERING">🎪 Community Gathering</option>
                    <option value="BUILDING_CONTEST">🏗️ Building Contest</option>
                    <option value="BOSS_RAID">⚔️ Boss Raid</option>
                    <option value="TRAIN_RACE">🚂 Train Race</option>
                    <option value="MAINTENANCE">🛠️ Scheduled Downtime</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">Target Realm</label>
                  <select
                    value={newServerId}
                    onChange={(e) => setNewServerId(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  >
                    <option value="ALL">🌐 All Realms</option>
                    <option value="fabric-main">Fabric Main (play.petablocks.com)</option>
                    <option value="create-2">Create 2 SMP</option>
                    <option value="patreon-creative">Patreon Creative</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Starts At</label>
                  <input
                    type="datetime-local"
                    required
                    value={newStartsAt}
                    onChange={(e) => setNewStartsAt(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Ends At (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newEndsAt}
                    onChange={(e) => setNewEndsAt(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Prizes & Rewards (Optional)</label>
                <input
                  type="text"
                  value={newPrizes}
                  onChange={(e) => setNewPrizes(e.target.value)}
                  placeholder="e.g. 1st Place: 10,000 Brass Ingots + Discord Champion Role"
                  className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Event Description & Rules</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Details on coordinates, start conditions, and gameplay rules..."
                  className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-xl bg-muted text-gray-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEventMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider"
                >
                  {createEventMutation.isPending ? 'Scheduling...' : 'Save & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD BROADCAST MODAL */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Radio className="text-sky-400" size={18} />
                <h3 className="text-base font-black text-white">Add In-Game Broadcast Tip</h3>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddBroadcastSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Tip Message Content</label>
                <textarea
                  rows={3}
                  required
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="e.g. Type /link in-game to sync your Discord roles and unlock web profile badges!"
                  className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Server Realm</label>
                  <select
                    value={broadcastServer}
                    onChange={(e) => setBroadcastServer(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  >
                    <option value="ALL">All Realms</option>
                    <option value="fabric-main">Fabric Main</option>
                    <option value="create-2">Create 2 SMP</option>
                    <option value="patreon-creative">Patreon Creative</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">Interval</label>
                  <select
                    value={broadcastInterval}
                    onChange={(e) => setBroadcastInterval(Number(e.target.value))}
                    className="w-full py-2 px-3 rounded-xl bg-background border border-border text-white text-xs focus:outline-none"
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={120}>Every 2 hours</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-4 py-2 rounded-xl bg-muted text-gray-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBroadcastMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider"
                >
                  {addBroadcastMutation.isPending ? 'Adding...' : 'Add Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
