import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveRestore,
  RefreshCw,
  Trash2,
  Download,
  Play,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Clock,
  Server,
  Plus,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface BackupRecord {
  id: number
  server_id: string
  server_name: string
  world_name: string
  size_bytes: number
  minio_key: string
  status: 'running' | 'completed' | 'failed'
  error_message: string | null
  started_at: string
  completed_at: string | null
  created_by: string
}

const SERVERS = [
  { id: 'fabric-main', name: 'PETABLOCKS Official Modpack', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  { id: 'patreon-creative', name: 'PETABLOCKS Patreon Creative', color: 'text-purple-400', border: 'border-purple-500/30' },
  { id: 'create-2', name: 'Just Create SMP 2', color: 'text-sky-400', border: 'border-sky-500/30' },
]

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '—'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(1)} MB`
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function StatusBadge({ status }: { status: BackupRecord['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
        <Loader2 className="h-3 w-3 animate-spin" /> Running…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold">
      <AlertTriangle className="h-3 w-3" /> Failed
    </span>
  )
}

export default function BackupsPage() {
  const queryClient = useQueryClient()
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedServer, setSelectedServer] = useState<string>('fabric-main')
  const [pollingIds, setPollingIds] = useState<Set<number>>(new Set())

  const { data, isLoading, refetch } = useQuery<{ backups: BackupRecord[] }>({
    queryKey: ['backups'],
    queryFn: () => fetch('/api/backups').then(r => r.json()),
    refetchInterval: pollingIds.size > 0 ? 5000 : 30000,
  })

  const backups = data?.backups ?? []

  // Track running backups for polling
  useEffect(() => {
    const running = new Set(backups.filter(b => b.status === 'running').map(b => b.id))
    setPollingIds(running)
  }, [backups])

  const triggerMutation = useMutation({
    mutationFn: (serverId: string) =>
      fetch('/api/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      setShowNewModal(false)
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      if (data.backupId) {
        setPollingIds(prev => new Set([...prev, data.backupId]))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/backups/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })

  async function handleDownload(id: number, filename: string) {
    try {
      const res = await fetch(`/api/backups/${id}/download-url`).then(r => r.json())
      if (res.url) {
        const a = document.createElement('a')
        a.href = res.url
        a.download = filename
        a.click()
      }
    } catch (e) {
      console.error('Download failed', e)
    }
  }

  const totalSizeBytes = backups.filter(b => b.status === 'completed').reduce((s, b) => s + (b.size_bytes || 0), 0)
  const completedCount = backups.filter(b => b.status === 'completed').length
  const runningCount = backups.filter(b => b.status === 'running').length

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <ArchiveRestore className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
            World Backups
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            On-demand and scheduled world archive backups streamed to MinIO S3
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-mono rounded-xl border border-border flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Backup
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" /> Total Backup Storage
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{formatBytes(totalSizeBytes)}</p>
          <p className="text-[11px] text-muted-foreground">{completedCount} completed archive{completedCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" /> Servers Covered
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            {new Set(backups.map(b => b.server_id)).size}
          </p>
          <p className="text-[11px] text-muted-foreground">of {SERVERS.length} configured</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Running Now
          </span>
          <p className={cn('text-2xl font-bold font-mono', runningCount > 0 ? 'text-amber-400' : 'text-foreground')}>{runningCount}</p>
          <p className="text-[11px] text-muted-foreground">{runningCount > 0 ? 'Polling every 5s…' : 'All jobs idle'}</p>
        </div>
      </div>

      {/* Backup List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
            <ArchiveRestore className="h-4 w-4 text-primary" /> Backup Archive ({backups.length})
          </h2>
          <span className="text-[11px] font-mono text-muted-foreground">Stored in MinIO · world-backups/</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading backups…
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ArchiveRestore className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No backups yet</p>
            <p className="text-xs text-center max-w-xs">Click "New Backup" to create your first world archive. Backups are streamed directly to MinIO S3.</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Create First Backup
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Server</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Size</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Duration</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Started</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">MinIO Key</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {backups.map((backup) => {
                  const srv = SERVERS.find(s => s.id === backup.server_id)
                  return (
                    <tr key={backup.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Server className={cn('h-3.5 w-3.5 shrink-0', srv?.color ?? 'text-muted-foreground')} />
                          <div>
                            <p className={cn('font-bold', srv?.color ?? 'text-foreground')}>{backup.server_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{backup.server_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={backup.status} />
                        {backup.error_message && (
                          <p className="text-[10px] text-rose-400 font-mono mt-1 max-w-[180px] truncate" title={backup.error_message}>
                            {backup.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground font-bold">
                        {formatBytes(backup.size_bytes)}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {formatDuration(backup.started_at, backup.completed_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p>{formatAge(backup.started_at)}</p>
                        <p className="text-[10px] font-mono">{new Date(backup.started_at).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]" title={backup.minio_key}>
                          {backup.minio_key}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {backup.status === 'completed' && (
                            <button
                              onClick={() => handleDownload(backup.id, backup.minio_key.split('/').pop()!)}
                              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors"
                              title="Download (24h presigned link)"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete backup "${backup.minio_key.split('/').pop()}"? This cannot be undone.`)) {
                                deleteMutation.mutate(backup.id)
                              }
                            }}
                            disabled={backup.status === 'running' || deleteMutation.isPending}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Delete backup"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info card about SSH approach */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-400" /> Backup Infrastructure Notes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="bg-muted/30 rounded-xl p-3 border border-border/50 space-y-1.5">
            <p className="font-bold text-foreground">Current Method: SSH → tar → MinIO</p>
            <p>RCON <code className="text-foreground">save-all</code> is sent first, then the admin host SSHes into the MC server host (<code className="text-foreground">MC_SSH_HOST</code>) and pipes a <code>tar.gz</code> archive directly into the <code className="text-foreground">world-backups</code> bucket.</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-3 border border-border/50 space-y-1.5">
            <p className="font-bold text-foreground">Required Environment Variables</p>
            <div className="font-mono text-[10px] space-y-0.5">
              <p><span className="text-primary">MC_SSH_HOST</span>=10.20.110.127</p>
              <p><span className="text-primary">MC_SSH_USER</span>=mdrcloud</p>
              <p><span className="text-primary">MC_SSH_KEY_PATH</span>=/root/.ssh/id_rsa</p>
              <p><span className="text-primary">MC_WORLD_BASE_PATH</span>=/opt/petablocks/servers</p>
              <p><span className="text-primary">MINIO_ENDPOINT</span>=http://minio:9000</p>
            </div>
          </div>
        </div>
      </div>

      {/* New Backup Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Create World Backup
              </h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              The server will receive a <code className="text-foreground">save-all</code> command via RCON, then the world directory will be archived and streamed directly to MinIO S3.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground block">Select Server</label>
              <div className="space-y-2">
                {SERVERS.map(srv => (
                  <button
                    key={srv.id}
                    onClick={() => setSelectedServer(srv.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      selectedServer === srv.id
                        ? `${srv.border} bg-primary/5 border-primary/40`
                        : 'border-border bg-muted/20 hover:bg-muted/40'
                    )}
                  >
                    <Server className={cn('h-4 w-4 shrink-0', srv.color)} />
                    <div>
                      <p className={cn('text-xs font-bold', srv.color)}>{srv.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{srv.id}</p>
                    </div>
                    {selectedServer === srv.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => triggerMutation.mutate(selectedServer)}
                disabled={triggerMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {triggerMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…</>
                ) : (
                  <><Play className="h-3.5 w-3.5" /> Start Backup</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
