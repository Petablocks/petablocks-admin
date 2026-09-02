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
  Globe,
  Package,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface BackupRecord {
  id: string | number
  server_id: string
  server_name: string
  world_name: string
  backup_type: 'world' | 'full'
  size_bytes: number
  minio_key: string
  status: 'running' | 'completed' | 'failed'
  error_message: string | null
  started_at: string
  completed_at: string | null
  created_by: string
}

const SERVERS = [
  {
    id: 'patreon-creative',
    name: 'PETABLOCKS Patreon Creative',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    worldSize: '~3.6 GB',
    fullSize: '~4+ GB',
  },
  {
    id: 'create-2',
    name: 'Just Create SMP 2',
    color: 'text-sky-400',
    border: 'border-sky-500/30',
    worldSize: '~33 GB',
    fullSize: '~35+ GB',
  },
  {
    id: 'fabric-main',
    name: 'PETABLOCKS Official Modpack',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    worldSize: '~? GB',
    fullSize: '~? GB',
  },
]

const BACKUP_TYPES = [
  {
    id: 'world' as const,
    label: 'World Only',
    icon: Globe,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    description: 'Archives all world dimension folders only (world/, world_Creative/, world_PBC2/). Fast and lightweight — ideal for regular snapshots.',
  },
  {
    id: 'full' as const,
    label: 'Full Server',
    icon: Package,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    description: 'Archives the entire server directory: worlds, mods, configs, KubeJS scripts, ops/whitelist, schematics, and more. Excludes re-downloadable libraries, logs, and map tiles. Ideal for server migration.',
  },
]

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 MB'
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
  if (!end) return 'In progress…'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function StatusBadge({ status, sizeBytes }: { status: BackupRecord['status']; sizeBytes?: number }) {
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
        <Loader2 className="h-3 w-3 animate-spin" /> Running… {sizeBytes && sizeBytes > 0 ? `(${formatBytes(sizeBytes)})` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold">
      <AlertTriangle className="h-3 w-3" /> Failed
    </span>
  )
}

function TypeBadge({ type }: { type: 'world' | 'full' }) {
  if (type === 'full') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
        <Package className="h-2.5 w-2.5" /> Full
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-bold uppercase tracking-wider">
      <Globe className="h-2.5 w-2.5" /> World
    </span>
  )
}

export default function BackupsPage() {
  const queryClient = useQueryClient()
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedServer, setSelectedServer] = useState<string>('patreon-creative')
  const [selectedType, setSelectedType] = useState<'world' | 'full'>('world')
  const [triggerError, setTriggerError] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery<{ backups: BackupRecord[] }>({
    queryKey: ['backups'],
    queryFn: async () => {
      const res = await fetch('/api/backups')
      if (!res.ok) {
        throw new Error(`Failed to load backups (${res.status})`)
      }
      return res.json()
    },
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.backups?.some(b => b.status === 'running')
      return hasRunning ? 3000 : 20000
    },
  })

  const backups = data?.backups ?? []

  const triggerMutation = useMutation({
    mutationFn: async ({ serverId, backupType }: { serverId: string; backupType: 'world' | 'full' }) => {
      setTriggerError(null)
      const res = await fetch('/api/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, backupType }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        throw new Error(body.error || body.details || `Failed to trigger backup (HTTP ${res.status})`)
      }
      return body
    },
    onSuccess: () => {
      setShowNewModal(false)
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (err: Error) => {
      setTriggerError(err.message || 'An unexpected error occurred while starting backup.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (minioKey: string) => {
      const res = await fetch(`/api/backups/${encodeURIComponent(minioKey)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Delete failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  })

  async function handleDownload(minioKey: string, filename: string) {
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(minioKey)}/download-url`).then(r => r.json())
      if (res.url) {
        const a = document.createElement('a')
        a.href = res.url
        a.download = filename
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        alert(res.error || 'Failed to generate download URL')
      }
    } catch (e: any) {
      alert(`Download failed: ${e.message}`)
    }
  }

  const totalSizeBytes = backups
    .filter(b => b.status === 'completed')
    .reduce((s, b) => s + (b.size_bytes || 0), 0)
  const completedCount = backups.filter(b => b.status === 'completed').length
  const runningCount = backups.filter(b => b.status === 'running').length
  const fullBackupCount = backups.filter(b => b.backup_type === 'full' && b.status === 'completed').length

  const selectedSrv = SERVERS.find(s => s.id === selectedServer)
  const selectedBkType = BACKUP_TYPES.find(t => t.id === selectedType)!

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
            On-demand world snapshots and full server archives streamed directly to MinIO S3
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
            onClick={() => {
              setTriggerError(null)
              setShowNewModal(true)
            }}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Backup
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" /> Total Storage
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{formatBytes(totalSizeBytes)}</p>
          <p className="text-[11px] text-muted-foreground">{completedCount} archive{completedCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" /> Full Backups
          </span>
          <p className="text-2xl font-bold font-mono text-amber-400">{fullBackupCount}</p>
          <p className="text-[11px] text-muted-foreground">migration-ready</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" /> Servers
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
          <p className="text-[11px] text-muted-foreground">{runningCount > 0 ? 'Live streaming…' : 'All jobs idle'}</p>
        </div>
      </div>

      {/* Backup List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2 text-foreground">
            <ArchiveRestore className="h-4 w-4 text-primary" /> Backup Archive ({backups.length})
          </h2>
          <span className="text-[11px] font-mono text-muted-foreground">MinIO · world-backups/</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading backups…
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ArchiveRestore className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No backups yet</p>
            <p className="text-xs text-center max-w-xs">Create a world snapshot or full server archive. Full backups include mods, configs, and KubeJS scripts — ideal for migrating off Discopanel.</p>
            <button
              onClick={() => {
                setTriggerError(null)
                setShowNewModal(true)
              }}
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
                  <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Type</th>
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
                        <TypeBadge type={backup.backup_type ?? 'world'} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={backup.status} sizeBytes={backup.size_bytes} />
                        {backup.error_message && (
                          <p className="text-[10px] text-rose-400 font-mono mt-1 max-w-[200px] truncate" title={backup.error_message}>
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
                        <p className="text-[10px] font-mono">{new Date(backup.started_at).toLocaleTimeString()}</p>
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
                              onClick={() => handleDownload(backup.minio_key, backup.minio_key.split('/').pop()!)}
                              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors"
                              title="Download (24h presigned link)"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete backup "${backup.minio_key.split('/').pop()}" from MinIO?`)) {
                                deleteMutation.mutate(backup.minio_key)
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

      {/* New Backup Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Create Backup
              </h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Banner */}
            {triggerError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">Backup Failed to Start</p>
                  <p className="text-[11px] opacity-90 break-words mt-0.5">{triggerError}</p>
                </div>
              </div>
            )}

            {/* Backup Type */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground block">Backup Type</label>
              <div className="grid grid-cols-2 gap-2">
                {BACKUP_TYPES.map(btype => {
                  const Icon = btype.icon
                  const active = selectedType === btype.id
                  return (
                    <button
                      key={btype.id}
                      onClick={() => {
                        setTriggerError(null)
                        setSelectedType(btype.id)
                      }}
                      className={cn(
                        'flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all',
                        active ? `${btype.border} ${btype.bg}` : 'border-border bg-muted/20 hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <Icon className={cn('h-4 w-4 shrink-0', active ? btype.color : 'text-muted-foreground')} />
                        <span className={cn('text-xs font-bold', active ? btype.color : 'text-foreground')}>{btype.label}</span>
                        {active && <CheckCircle2 className={cn('h-3.5 w-3.5 ml-auto', btype.color)} />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className={cn('p-3 rounded-xl border text-[11px] text-muted-foreground leading-relaxed', selectedBkType.border, selectedBkType.bg)}>
                {selectedBkType.description}
                {selectedType === 'full' && (
                  <p className="mt-1.5 font-bold text-foreground">
                    Excludes: <span className="font-normal text-muted-foreground">libraries/ · logs/ · crash-reports/ · debug/ · bluemap/</span>
                  </p>
                )}
              </div>
            </div>

            {/* Server Selection */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-foreground block">Select Server</label>
              <div className="space-y-2">
                {SERVERS.map(srv => (
                  <button
                    key={srv.id}
                    onClick={() => {
                      setTriggerError(null)
                      setSelectedServer(srv.id)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      selectedServer === srv.id
                        ? `${srv.border} bg-primary/5`
                        : 'border-border bg-muted/20 hover:bg-muted/40'
                    )}
                  >
                    <Server className={cn('h-4 w-4 shrink-0', srv.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-bold', srv.color)}>{srv.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {srv.id} · {selectedType === 'full' ? srv.fullSize : srv.worldSize} est.
                      </p>
                    </div>
                    {selectedServer === srv.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/30 rounded-xl p-3 text-[11px] text-muted-foreground border border-border space-y-1">
              <p><span className="text-foreground font-bold">Server:</span> {selectedSrv?.name}</p>
              <p><span className="text-foreground font-bold">Type:</span> {selectedType === 'full' ? 'Full Server (mods + configs + worlds)' : 'World Only (dimension folders)'}</p>
              <p><span className="text-foreground font-bold">Target Bucket:</span> <span className="font-mono">world-backups/{selectedServer}/{selectedType}/</span></p>
              <p><span className="text-foreground font-bold">Pipeline:</span> Pure SSH2 &rarr; tar | MinIO S3 stream</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => triggerMutation.mutate({ serverId: selectedServer, backupType: selectedType })}
                disabled={triggerMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {triggerMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…</>
                ) : (
                  <><Play className="h-3.5 w-3.5" /> Start {selectedType === 'full' ? 'Full' : 'World'} Backup</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
