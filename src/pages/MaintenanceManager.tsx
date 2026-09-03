import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Radio,
  Server,
  Settings2,
  Trash2,
  Play,
  Check,
  Bot,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MaintenanceWindow {
  id: number
  title: string
  description: string
  server_ids: string[]
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  start_time: number
  estimated_duration_min: number
  end_time: number | null
  notify_discord: boolean
  notify_ingame: boolean
  auto_execute?: boolean
  pipeline_config?: {
    saveAll?: boolean
    restartContainers?: boolean
    waitForHealth?: boolean
    autoComplete?: boolean
    healthTimeoutSec?: number
  } | null
  last_warning_min?: number | null
  pipeline_state?: string
  pipeline_logs?: Array<{ time: number; step: string; details: string }>
  created_by: string
  created_at: string
}

interface MaintenanceConfig {
  announcementWebhookUrl: string
  pingRole: string
  enabled: boolean
}

const SERVER_OPTIONS = [
  { id: 'all', label: 'All Servers (Entire Fleet)' },
  { id: 'create-2', label: 'Just Create SMP 2 (NeoForge 1.21.1)' },
  { id: 'fabric-main', label: 'Official Modpack (Fabric 1.20.1)' },
  { id: 'patreon-creative', label: 'Patreon Creative Server' },
]

export default function MaintenanceManagerPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming')
  const [isImmediateModalOpen, setIsImmediateModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)

  // Form states
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedServers, setSelectedServers] = useState<string[]>(['create-2'])
  const [durationMin, setDurationMin] = useState(30)
  const [scheduledDateTime, setScheduledDateTime] = useState('')
  const [notifyDiscord, setNotifyDiscord] = useState(true)
  const [notifyIngame, setNotifyIngame] = useState(true)

  // Pipeline Form States
  const [autoExecute, setAutoExecute] = useState(true)
  const [saveAll, setSaveAll] = useState(true)
  const [restartContainers, setRestartContainers] = useState(true)
  const [waitForHealth, setWaitForHealth] = useState(true)
  const [autoComplete, setAutoComplete] = useState(true)

  // Config states
  const [webhookUrl, setWebhookUrl] = useState('')
  const [pingRole, setPingRole] = useState('@everyone')
  const [webhookEnabled, setWebhookEnabled] = useState(true)

  // Fetch windows
  const { data: windowsData } = useQuery<{ success: boolean; windows: MaintenanceWindow[] }>({
    queryKey: ['maintenance-windows'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance')
      if (!res.ok) throw new Error('Failed to load maintenance windows')
      return res.json()
    },
    refetchInterval: 5000,
  })

  // Fetch config
  useQuery<MaintenanceConfig>({
    queryKey: ['maintenance-config'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance/config')
      if (!res.ok) throw new Error('Failed to load config')
      const d = await res.json()
      setWebhookUrl(d.announcementWebhookUrl || '')
      setPingRole(d.pingRole || '@everyone')
      setWebhookEnabled(d.enabled ?? true)
      return d
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create maintenance window')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] })
      setIsImmediateModalOpen(false)
      setIsScheduleModalOpen(false)
      resetForm()
    },
  })

  // Update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update maintenance window')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] })
    },
  })

  // Trigger pipeline mutation
  const triggerPipelineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/maintenance/${id}/trigger-pipeline`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to trigger pipeline')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/maintenance/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete maintenance window')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] })
    },
  })

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (payload: Partial<MaintenanceConfig>) => {
      const res = await fetch('/api/maintenance/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save config')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-config'] })
      setIsConfigModalOpen(false)
    },
  })

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setSelectedServers(['create-2'])
    setDurationMin(30)
    setScheduledDateTime('')
    setNotifyDiscord(true)
    setNotifyIngame(true)
    setAutoExecute(true)
    setSaveAll(true)
    setRestartContainers(true)
    setWaitForHealth(true)
    setAutoComplete(true)
  }

  const handleToggleServer = (serverId: string) => {
    if (serverId === 'all') {
      setSelectedServers(['all'])
      return
    }
    const filtered = selectedServers.filter((s) => s !== 'all')
    if (filtered.includes(serverId)) {
      const res = filtered.filter((s) => s !== serverId)
      setSelectedServers(res.length === 0 ? ['all'] : res)
    } else {
      setSelectedServers([...filtered, serverId])
    }
  }

  const handleTriggerImmediate = () => {
    if (!title.trim()) return
    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      serverIds: selectedServers,
      status: 'in_progress',
      startTime: Date.now(),
      estimatedDurationMin: durationMin,
      notifyDiscord,
      notifyIngame,
      autoExecute: false,
    })
  }

  const handleScheduleWindow = () => {
    if (!title.trim() || !scheduledDateTime) return
    const startTs = new Date(scheduledDateTime).getTime()
    if (isNaN(startTs)) return

    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      serverIds: selectedServers,
      status: 'scheduled',
      startTime: startTs,
      estimatedDurationMin: durationMin,
      notifyDiscord,
      notifyIngame,
      autoExecute,
      pipelineConfig: autoExecute
        ? {
            saveAll,
            restartContainers,
            waitForHealth,
            autoComplete,
            healthTimeoutSec: 300,
          }
        : null,
    })
  }

  const windows = windowsData?.windows || []
  const activeWindows = windows.filter((w) => w.status === 'in_progress')
  const scheduledWindows = windows.filter((w) => w.status === 'scheduled')
  const pastWindows = windows.filter((w) => w.status === 'completed' || w.status === 'cancelled')

  const getPipelineStateLabel = (state?: string) => {
    switch (state) {
      case 'starting':
        return '🚀 Starting'
      case 'saving':
        return '💾 Saving World'
      case 'restarting':
        return '🔄 Rebooting Containers'
      case 'verifying':
        return '🩺 Verifying Health'
      case 'completed':
        return '✅ Auto-Completed'
      case 'health_timeout':
        return '⚠️ Health Timeout'
      case 'failed':
        return '❌ Pipeline Failed'
      default:
        return '🤖 Auto-Scheduled'
    }
  }

  return (
    <div className="space-y-6">
      {/* ──────────────── HEADER ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Maintenance & Upgrade Hub</h1>
              <p className="text-xs text-muted-foreground">
                Autonomous server update scheduling, automated Docker restarts, Discord announcements & live website banners.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="px-3 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Settings2 className="h-4 w-4" />
            Discord Webhook
          </button>

          <button
            onClick={() => {
              resetForm()
              setTitle('Server Maintenance & Hotfix')
              setDescription('Addressing server optimizations and gameplay fixes.')
              setIsImmediateModalOpen(true)
            }}
            className="px-3.5 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Radio className="h-4 w-4 animate-pulse" />
            Trigger Immediate Maintenance
          </button>

          <button
            onClick={() => {
              resetForm()
              setTitle('Scheduled Fleet Maintenance & Mod Update')
              setIsScheduleModalOpen(true)
            }}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Schedule Window
          </button>
        </div>
      </div>

      {/* ──────────────── ACTIVE MAINTENANCE ALERT BANNER ──────────────── */}
      {activeWindows.length > 0 && (
        <div className="space-y-3">
          {activeWindows.map((win) => (
            <div
              key={win.id}
              className="p-4 sm:p-5 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-card to-card relative overflow-hidden shadow-lg shadow-rose-950/20"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-rose-500/20 border border-rose-500/30 text-rose-400">
                      ACTIVE MAINTENANCE IN PROGRESS
                    </span>
                    {win.auto_execute && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-primary/20 border border-primary/30 text-primary flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {getPipelineStateLabel(win.pipeline_state)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">
                      Started: {new Date(win.start_time).toLocaleTimeString()}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground">{win.title}</h3>
                  <p className="text-xs text-muted-foreground max-w-2xl">{win.description}</p>

                  <div className="flex items-center gap-3 pt-1 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                      <Server className="h-3.5 w-3.5 text-primary" />
                      <span>{win.server_ids.join(', ')}</span>
                    </div>
                    <span className="text-border">•</span>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>Est. Duration: ~{win.estimated_duration_min}m</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center shrink-0 flex-wrap">
                  {win.auto_execute && (
                    <button
                      disabled={triggerPipelineMutation.isPending}
                      onClick={() => triggerPipelineMutation.mutate(win.id)}
                      className="px-3 py-2 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Run the automated restart & health check pipeline now"
                    >
                      <Zap className="h-4 w-4" />
                      {triggerPipelineMutation.isPending ? 'Executing...' : 'Run Pipeline'}
                    </button>
                  )}

                  <button
                    disabled={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate({ id: win.id, status: 'completed' })}
                    className="px-3.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Completed
                  </button>

                  <button
                    disabled={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate({ id: win.id, status: 'cancelled' })}
                    className="px-3 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground hover:text-rose-400 transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ──────────────── TAB SWITCHER ──────────────── */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={cn(
            'px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2',
            activeTab === 'upcoming'
              ? 'bg-card text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Calendar className="h-3.5 w-3.5 text-amber-400" />
          Scheduled & Active ({activeWindows.length + scheduledWindows.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2',
            activeTab === 'history'
              ? 'bg-card text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          Past Windows ({pastWindows.length})
        </button>
      </div>

      {/* ──────────────── TAB CONTENT: UPCOMING & ACTIVE ──────────────── */}
      {activeTab === 'upcoming' && (
        <div className="space-y-4">
          {scheduledWindows.length === 0 && activeWindows.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-border/80 bg-card/40 space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">No Maintenance Scheduled</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  All servers are operational. You can schedule future windows or trigger an immediate active notice at any time.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledWindows.map((win) => (
                <div
                  key={win.id}
                  className="p-4 rounded-xl border border-border bg-card space-y-3 flex flex-col justify-between hover:border-amber-500/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          SCHEDULED
                        </span>
                        {win.auto_execute && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/15 border border-primary/30 text-primary flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            AUTO
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {new Date(win.start_time).toLocaleString()}
                      </span>
                    </div>

                    <h4 className="font-bold text-foreground text-sm">{win.title}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">{win.description}</p>

                    <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground font-mono flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/40">
                        {win.server_ids.join(', ')}
                      </span>
                      <span>•</span>
                      <span>~{win.estimated_duration_min} mins</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/40 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: win.id, status: 'in_progress' })}
                        className="px-3 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Start Now
                      </button>

                      {win.auto_execute && (
                        <button
                          disabled={triggerPipelineMutation.isPending}
                          onClick={() => triggerPipelineMutation.mutate(win.id)}
                          className="px-2.5 py-1.5 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-medium flex items-center gap-1.5 transition-colors"
                          title="Immediately trigger automated save, restart, and health check"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Run Pipeline
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: win.id, status: 'cancelled' })}
                        className="px-2.5 py-1.5 rounded-md hover:bg-muted/40 text-xs text-muted-foreground hover:text-rose-400 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(win.id)}
                        className="p-1.5 rounded-md hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── TAB CONTENT: PAST WINDOWS ──────────────── */}
      {activeTab === 'history' && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground text-[11px]">
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Servers</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pastWindows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No past maintenance history recorded yet.
                    </td>
                  </tr>
                ) : (
                  pastWindows.map((win) => (
                    <tr key={win.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-foreground">{win.title}</div>
                        <div className="text-[11px] text-muted-foreground">{win.description || 'No description'}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                            win.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-muted text-muted-foreground border border-border'
                          )}
                        >
                          {win.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {win.auto_execute ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary flex items-center gap-1 w-fit">
                            <Bot className="h-3 w-3" />
                            Autonomous
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Manual</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground">
                        {win.server_ids.join(', ')}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(win.start_time).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteMutation.mutate(win.id)}
                          className="p-1.5 rounded-md hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: IMMEDIATE MAINTENANCE ──────────────── */}
      {isImmediateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="rounded-xl border border-rose-500/40 bg-card p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <Radio className="h-5 w-5 animate-pulse" />
                <h3>Trigger Immediate Unscheduled Maintenance</h3>
              </div>
              <button onClick={() => setIsImmediateModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Reason / Operation Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Emergency Core Optimization & Memory Cleanup"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Details & Player Notice</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what is being worked on."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1.5">Target Servers</label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVER_OPTIONS.map((srv) => (
                    <button
                      type="button"
                      key={srv.id}
                      onClick={() => handleToggleServer(srv.id)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2',
                        selectedServers.includes(srv.id)
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-300 font-semibold'
                          : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          selectedServers.includes(srv.id) ? 'bg-rose-400' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span className="truncate">{srv.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">Estimated Duration</label>
                  <select
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours</option>
                  </select>
                </div>

                <div className="space-y-1.5 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={notifyDiscord}
                      onChange={(e) => setNotifyDiscord(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span>Post to Discord ({pingRole})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={notifyIngame}
                      onChange={(e) => setNotifyIngame(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span>Broadcast In-Game (/tellraw)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => setIsImmediateModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={handleTriggerImmediate}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-950/40"
              >
                <Radio className="h-4 w-4" />
                {createMutation.isPending ? 'Broadcasting...' : 'Broadcast & Start Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: SCHEDULE MAINTENANCE ──────────────── */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-primary font-bold">
                <Calendar className="h-5 w-5 text-amber-400" />
                <h3>Schedule Maintenance & Update Window</h3>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Maintenance Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled Mod Upgrade & Server Restart"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Details for players regarding downtime, features, or fixes."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1.5">Affected Servers</label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVER_OPTIONS.map((srv) => (
                    <button
                      type="button"
                      key={srv.id}
                      onClick={() => handleToggleServer(srv.id)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg border text-left text-xs transition-colors flex items-center gap-2',
                        selectedServers.includes(srv.id)
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 font-semibold'
                          : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          selectedServers.includes(srv.id) ? 'bg-amber-400' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span className="truncate">{srv.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">Scheduled Start (Local Time)</label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">Estimated Duration</label>
                  <select
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={120}>2 Hours</option>
                  </select>
                </div>
              </div>

              {/* ──────────────── AUTONOMOUS PIPELINE SECTION ──────────────── */}
              <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/5 space-y-2.5 mt-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground text-xs">🤖 Autonomous Execution Pipeline</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoExecute}
                    onChange={(e) => setAutoExecute(e.target.checked)}
                    className="rounded border-border h-4 w-4 text-primary"
                  />
                </label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The background engine will execute advance countdowns, lock the gateway, restart target containers, and verify health automatically.
                </p>

                {autoExecute && (
                  <div className="pt-2 border-t border-primary/20 space-y-1.5 text-[11px]">
                    <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={saveAll}
                        onChange={(e) => setSaveAll(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>💾 Flush world save (<code className="text-primary font-mono">/save-all flush</code>) before reboot</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={restartContainers}
                        onChange={(e) => setRestartContainers(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>🔄 Reboot target Docker containers to apply staged mod updates</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={waitForHealth}
                        onChange={(e) => setWaitForHealth(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>🩺 Poll TCP ports until servers are healthy & online</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={autoComplete}
                        onChange={(e) => setAutoComplete(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>✅ Auto-complete maintenance and unlock gateway once healthy</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={notifyDiscord}
                    onChange={(e) => setNotifyDiscord(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Discord Announcement</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={notifyIngame}
                    onChange={(e) => setNotifyIngame(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>In-Game Warnings (15m, 5m, 1m)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createMutation.isPending || !title.trim() || !scheduledDateTime}
                onClick={handleScheduleWindow}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" />
                {createMutation.isPending ? 'Scheduling...' : 'Schedule Maintenance Window'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: CONFIGURE DISCORD ──────────────── */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-primary font-bold">
                <Settings2 className="h-5 w-5" />
                <h3>Discord Announcement Webhook</h3>
              </div>
              <button onClick={() => setIsConfigModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Webhook URL</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Role / User to Ping</label>
                <input
                  type="text"
                  value={pingRole}
                  onChange={(e) => setPingRole(e.target.value)}
                  placeholder="@everyone or <@&ROLE_ID>"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={webhookEnabled}
                    onChange={(e) => setWebhookEnabled(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Enable Discord announcements</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveConfigMutation.isPending}
                onClick={() =>
                  saveConfigMutation.mutate({
                    announcementWebhookUrl: webhookUrl.trim(),
                    pingRole: pingRole.trim(),
                    enabled: webhookEnabled,
                  })
                }
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
