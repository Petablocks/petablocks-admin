import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Server,
  Play,
  Square,
  RotateCw,
  Plus,
  RefreshCw,
  Cpu,
  HardDrive,
  Radio,
  Layers,
  CheckCircle2,
  Loader2,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import CreateServerModal from '@/components/CreateServerModal'

interface ManagedServer {
  id: string
  nodeId: string
  name: string
  containerName: string
  dataPath: string
  gamePort: number
  type: string
  version: string
  memory: string
  online: boolean
  status: string
  cpuUsage: string
  memUsage: string
  nodeName: string
  nodeHost: string
  color: string
  border: string
  error?: string
}

interface NodeInfo {
  id: string
  name: string
  host: string
  online: boolean
  pingMs: number
  cpuCores: number
  memory: { totalGb: string; usedGb: string; percent: number }
  disk: { total: string; used: string; avail: string; percent: number }
}

export default function ServerFleetPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Fetch servers
  const { data: serversData, isLoading: isServersLoading, refetch: refetchServers } = useQuery<{ servers: ManagedServer[] }>({
    queryKey: ['managed-servers'],
    queryFn: () => fetch('/api/server-manager/servers').then(r => r.json()),
    refetchInterval: 10000,
  })

  // Fetch nodes
  const { data: nodesData } = useQuery<{ nodes: NodeInfo[] }>({
    queryKey: ['nodes'],
    queryFn: () => fetch('/api/server-manager/nodes').then(r => r.json()),
    refetchInterval: 30000,
  })

  const servers = serversData?.servers || []
  const nodes = nodesData?.nodes || []

  // Power action mutation
  const powerMutation = useMutation({
    mutationFn: async ({ serverId, action }: { serverId: string; action: 'start' | 'stop' | 'restart' }) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action} server`)
      return data
    },
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['managed-servers'] }), 2000)
    },
  })

  const onlineServers = servers.filter(s => s.online).length
  const totalServers = servers.length

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Server className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
            Server Fleet Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            Native Docker container management, live console, and file control across PETABLOCKS nodes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchServers()}
            disabled={isServersLoading}
            className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-mono rounded-xl border border-border flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isServersLoading && 'animate-spin')} /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Server
          </button>
        </div>
      </div>

      {/* Cluster Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Fleet Status
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            <span className="text-emerald-400">{onlineServers}</span> / {totalServers}
          </p>
          <p className="text-[11px] text-muted-foreground">servers running</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> VM Nodes
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{nodes.length}</p>
          <p className="text-[11px] text-muted-foreground">{nodes.filter(n => n.online).length} online</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" /> Primary Host
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            {nodes[0]?.memory?.usedGb || '0'} / {nodes[0]?.memory?.totalGb || '0'} GB
          </p>
          <p className="text-[11px] text-muted-foreground">MCS RAM utilized</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> MCS Cores
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-400">
            {nodes[0]?.cpuCores || 12} vCPU
          </p>
          <p className="text-[11px] text-muted-foreground">{nodes[0]?.pingMs || 0}ms SSH latency</p>
        </div>
      </div>

      {/* Server Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" /> Active Minecraft Servers ({servers.length})
          </h2>
        </div>

        {isServersLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Polling server cluster…
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <Server className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No servers registered in fleet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Create First Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {servers.map((server) => {
              const isPowerPending = powerMutation.isPending && powerMutation.variables?.serverId === server.id

              return (
                <div
                  key={server.id}
                  className={cn(
                    'bg-card rounded-2xl border p-5 flex flex-col justify-between gap-5 transition-all shadow-sm hover:shadow-md',
                    server.online ? 'border-border/80' : 'border-border/40 opacity-80'
                  )}
                >
                  {/* Top: Name, ID, Node, Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className={cn('font-bold text-base', server.color || 'text-foreground')}>
                          {server.name}
                        </h3>
                        <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
                          {server.type} {server.version}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {server.nodeName} • Port {server.gamePort}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {server.online ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                          <CheckCircle2 className="h-3 w-3 animate-pulse" /> Running
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border text-[11px] font-bold">
                          <Square className="h-3 w-3" /> Offline
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Live Stats */}
                  <div className="grid grid-cols-3 gap-2 bg-muted/20 border border-border/50 rounded-xl p-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">CPU Usage</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">{server.cpuUsage}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Memory / Limit</span>
                      <p className="font-mono font-bold text-foreground mt-0.5 truncate" title={server.memUsage}>
                        {server.memUsage.split('/')[0]?.trim() || '0B'} ({server.memory})
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Container</span>
                      <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate" title={server.containerName}>
                        {server.containerName}
                      </p>
                    </div>
                  </div>

                  {/* Bottom: Quick Power Controls + Link to Dashboard */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      {server.online ? (
                        <>
                          <button
                            onClick={() => powerMutation.mutate({ serverId: server.id, action: 'restart' })}
                            disabled={isPowerPending}
                            className="px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-bold border border-border flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Restart Server"
                          >
                            <RotateCw className={cn('h-3.5 w-3.5 text-amber-400', isPowerPending && 'animate-spin')} /> Restart
                          </button>
                          <button
                            onClick={() => powerMutation.mutate({ serverId: server.id, action: 'stop' })}
                            disabled={isPowerPending}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Stop Server"
                          >
                            <Square className="h-3.5 w-3.5" /> Stop
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => powerMutation.mutate({ serverId: server.id, action: 'start' })}
                          disabled={isPowerPending}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" /> Start
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        to={`/servers/${server.nodeId}/${server.id}`}
                        className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Terminal className="h-3.5 w-3.5" /> Manage Server &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Creation Wizard Modal */}
      <CreateServerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        nodes={nodes}
      />
    </div>
  )
}
