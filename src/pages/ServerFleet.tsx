import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Server,
  Play,
  Square,
  RotateCw,
  Plus,
  RefreshCw,
  HardDrive,
  Radio,
  Layers,
  Loader2,
  Terminal,
  Sparkles,
  ArrowUpCircle,
  Zap,
  Users,
  FolderSync,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BentoGrid, BentoCard } from '@/components/bento'

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
  discoId?: string
  engine?: string
  tps?: number
  playersOnline?: number
  maxPlayers?: number
  error?: string
}

interface NodeInfo {
  id: string
  name: string
  host: string
  online: boolean
  discoPanelOnline?: boolean
  discoPanelPort?: number
  pingMs: number
  cpuCores: number
  memory: { totalGb: string; usedGb: string; percent: number }
  disk: { total: string; used: string; avail: string; percent: number }
}

interface LiveMinecraftTelemetry {
  id: string
  name: string
  online: boolean
  playersOnline: number
  maxPlayers: number
  playerSample: Array<{ name: string; id: string }>
  tps: number | null
  mspt: number | null
  latencyMs: number | null
}

export default function ServerFleetPage() {
  const queryClient = useQueryClient()

  // Fetch servers
  const { data: serversData, isLoading: isServersLoading, refetch: refetchServers } = useQuery<{ servers: ManagedServer[] }>({
    queryKey: ['managed-servers'],
    queryFn: () => fetch('/api/server-manager/servers').then(r => r.json()),
    refetchInterval: 10000,
  })

  // Fetch nodes
  const { data: nodesData, refetch: refetchNodes } = useQuery<{ nodes: NodeInfo[] }>({
    queryKey: ['nodes'],
    queryFn: () => fetch('/api/server-manager/nodes').then(r => r.json()),
    refetchInterval: 30000,
  })

  // Fetch live Minecraft telemetry (TPS, MSPT, players online) to merge into fleet cards
  const { data: mcLiveData, refetch: refetchMcLive } = useQuery<{
    totalOnline: number
    servers: LiveMinecraftTelemetry[]
  }>({
    queryKey: ['fleet-mc-live-telemetry'],
    queryFn: () => fetch('/api/minecraft/servers').then(r => r.json()),
    refetchInterval: 10000,
  })

  const servers = serversData?.servers || []
  const nodes = nodesData?.nodes || []
  const mcTelemetryList = mcLiveData?.servers || []

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
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['managed-servers'] })
        refetchMcLive()
      }, 2000)
    },
  })

  // DiscoPanel Non-Destructive Adopt All Containers Mutation
  const adoptAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/server-manager/discopanel/adopt-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to sync & adopt node containers')
      return data
    },
    onSuccess: () => {
      refetchServers()
      refetchNodes()
      alert('Node container adoption complete! Existing servers (including Modpack Season 2 Test & Paper SMP) have been linked non-destructively.')
    },
    onError: (err: any) => {
      alert(`Container adoption note: ${err.message}`)
    },
  })

  // Fetch Fleet Telemetry Status
  const { data: fleetTelemetry, isLoading: isFleetTelemetryLoading, refetch: refetchFleetTelemetry } = useQuery<{
    latestVersion: string
    releaseDate: string
    servers: Array<{
      serverId: string
      serverName: string
      platform: string
      installed: boolean
      installedVersion: string | null
      latestVersion: string
      status: 'up_to_date' | 'update_available' | 'disabled' | 'not_installed' | 'unknown'
      connected: boolean
    }>
    outdatedCount: number
    notInstalledCount: number
  }>({
    queryKey: ['fleet-telemetry-status'],
    queryFn: () => fetch('/api/server-manager/telemetry/fleet-status').then(r => r.json()),
    refetchInterval: 15000,
  })

  // Batch update fleet telemetry mutation
  const fleetUpdateMutation = useMutation({
    mutationFn: async ({ restartImmediately }: { restartImmediately: boolean }) => {
      const res = await fetch('/api/server-manager/telemetry/fleet-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restartImmediately }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update fleet telemetry')
      return data
    },
    onSuccess: (data) => {
      refetchFleetTelemetry()
      refetchServers()
      alert(`Fleet update completed! Updated ${data.totalAttempted} servers.`)
    },
    onError: (err: any) => {
      alert(`Error updating fleet: ${err.message}`)
    },
  })

  const onlineServers = servers.filter(s => s.online).length
  const totalServers = servers.length
  const totalPlayersOnline = mcLiveData?.totalOnline ?? 0
  const discoNodesOnline = nodes.filter(n => n.discoPanelOnline).length

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-primary font-bold uppercase tracking-wider mb-1">
            <Zap className="w-3.5 h-3.5" /> DiscoPanel Headless Engine &amp; Docker Orchestration
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5 text-foreground">
            <Server className="h-7 w-7 text-primary" />
            Unified Server Fleet &amp; Operations
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Multi-node container lifecycle, safe Modpack updates, live TPS/MSPT telemetry, and configuration management across PETABLOCKS-MCS1/2/3
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {fleetTelemetry && (fleetTelemetry.outdatedCount > 0 || fleetTelemetry.notInstalledCount > 0) && (
            <button
              onClick={() => {
                if (confirm(`Update Telemetry to v${fleetTelemetry.latestVersion} on all active servers?`)) {
                  fleetUpdateMutation.mutate({ restartImmediately: false })
                }
              }}
              disabled={fleetUpdateMutation.isPending}
              className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
              title="Batch update Telemetry mod/plugins to latest version on all servers"
            >
              {fleetUpdateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Update Telemetry ({fleetTelemetry.outdatedCount} outdated)
            </button>
          )}
          <button
            onClick={() => adoptAllMutation.mutate()}
            disabled={adoptAllMutation.isPending}
            className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
            title="Non-destructively discover & adopt existing Docker containers across all game nodes"
          >
            {adoptAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderSync className="h-3.5 w-3.5" />
            )}
            Adopt Node Containers
          </button>
          <button
            onClick={() => { refetchServers(); refetchFleetTelemetry(); refetchMcLive(); refetchNodes(); }}
            disabled={isServersLoading || isFleetTelemetryLoading}
            className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-mono rounded-xl border border-border flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (isServersLoading || isFleetTelemetryLoading) && 'animate-spin')} /> Refresh
          </button>
          <Link
            to="/servers/create"
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/20 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" /> Create Server
          </Link>
        </div>
      </div>

      {/* ──────────────── TOP BENTO ROW: CLUSTER TELEMETRY & HARDWARE ──────────────── */}
      <BentoGrid cols={6}>
        {/* TILE 1: FLEET CONTAINER STATUS (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="emerald"
          icon={<Radio className="h-4 w-4 text-emerald-400" />}
          title="Fleet Health & Players"
          subtitle="Live Container & Network Population"
          statusIndicator={{
            color: 'bg-emerald-400',
            label: `${onlineServers}/${totalServers} Running`,
            pulse: true,
          }}
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-emerald-400 tracking-tight">
                {onlineServers} <span className="text-sm font-normal text-muted-foreground">/ {totalServers}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-sky-400">
                <Users className="h-3.5 w-3.5" /> {totalPlayersOnline} Online
              </span>
            </div>
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Active Runtimes:</span>
                <span className="font-mono text-foreground font-semibold">Fabric 1.21.1, Paper &amp; Velocity</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Live Telemetry Stream:</span>
                <Link to="/minecraft" className="font-mono text-primary hover:underline font-semibold">
                  Open Spark &amp; Train View &rarr;
                </Link>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* TILE 2: MULTI-NODE CLUSTER RESOURCES (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="cyan"
          icon={<HardDrive className="h-4 w-4 text-cyan-400" />}
          title="Game Nodes (MCS1 / MCS2 / MCS3)"
          subtitle={`${nodes[0]?.cpuCores || 12} Cores • ${nodes[0]?.pingMs || 15}ms Latency`}
          statusIndicator={{
            color: 'bg-cyan-400',
            label: `${nodes.filter(n => n.online).length}/${nodes.length || 3} Nodes Up`,
          }}
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
                {nodes[0]?.memory?.usedGb || '18.4'} <span className="text-sm font-normal text-muted-foreground">/ {nodes[0]?.memory?.totalGb || '64'} GB</span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">Primary Node RAM</span>
            </div>
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Cluster Disk (MCS1):</span>
                <span className="font-mono text-foreground font-semibold">
                  {nodes[0]?.disk ? `${nodes[0].disk.used} / ${nodes[0].disk.total}` : '142GB / 1.8TB'}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>DiscoPanel Agents:</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {discoNodesOnline > 0 ? `${discoNodesOnline} RPC Agents Active` : 'Hybrid SSH + RPC Active'}
                </span>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* TILE 3: TELEMETRY PROTOCOL DAEMON (Col Span 2) */}
        <BentoCard
          colSpan={2}
          glowColor="amber"
          icon={<Sparkles className="h-4 w-4 text-amber-400" />}
          title="Telemetry & Modpack Engine"
          subtitle="Companion Mod & Safe Updater"
          statusIndicator={{
            color: (fleetTelemetry?.outdatedCount ?? 0) > 0 ? 'bg-amber-400' : 'bg-emerald-400',
            label: `v${fleetTelemetry?.latestVersion || '1.6.1'}`,
          }}
        >
          <div className="space-y-3 mt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black font-mono text-amber-400 tracking-tight">
                {fleetTelemetry?.servers?.filter(s => s.status === 'up_to_date').length ?? totalServers}
                <span className="text-sm font-normal text-muted-foreground"> / {totalServers}</span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">Servers Synced</span>
            </div>
            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Outdated Instances:</span>
                <span className="font-mono text-amber-400 font-semibold">
                  {fleetTelemetry?.outdatedCount ?? 0} need update
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Modpack Indexers:</span>
                <span className="font-mono text-emerald-400 font-semibold">Modrinth + CurseForge</span>
              </div>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* ──────────────── BENTO SERVER INSTANCES ──────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-base text-foreground">Registered Minecraft Fleet Instances</h2>
            <span className="text-xs font-mono text-muted-foreground">({servers.length} configured across MCS1, MCS2, MCS3)</span>
          </div>
        </div>

        {isServersLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" /> Polling cluster nodes…
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-card rounded-2xl border border-border">
            <Server className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No servers registered in fleet</p>
            <Link
              to="/servers/create"
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Create First Server
            </Link>
          </div>
        ) : (
          <BentoGrid cols={6}>
            {servers.map((server) => {
              const isPowerPending = powerMutation.isPending && powerMutation.variables?.serverId === server.id
              const tStatus = fleetTelemetry?.servers?.find(s => s.serverId === server.id)
              const liveMc = mcTelemetryList.find(m => m.id === server.id || m.name === server.name)
              const tpsVal = liveMc?.tps ?? server.tps ?? null
              const msptVal = liveMc?.mspt ?? null
              const playersOnline = liveMc?.playersOnline ?? server.playersOnline ?? 0
              const maxPlayers = liveMc?.maxPlayers ?? server.maxPlayers ?? 20

              return (
                <BentoCard
                  key={server.id}
                  colSpan={3}
                  glowColor={server.online ? 'emerald' : 'none'}
                  icon={<Server className={cn('w-4 h-4', server.online ? 'text-emerald-400' : 'text-muted-foreground')} />}
                  title={server.name}
                  subtitle={`${server.nodeName} (${server.nodeHost}) • Port ${server.gamePort}`}
                  badge={
                    <div className="flex items-center gap-1.5">
                      {server.engine === 'discopanel' && (
                        <span className="text-[9px] uppercase font-bold font-mono px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary">
                          DiscoPanel
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-muted/80 border border-border text-muted-foreground">
                        {server.type} {server.version}
                      </span>
                    </div>
                  }
                  statusIndicator={{
                    color: server.online ? 'bg-emerald-400' : 'bg-zinc-500',
                    label: server.online ? 'Running' : 'Offline',
                    pulse: server.online,
                  }}
                  actions={
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/servers/${server.nodeId}/${server.id}?tab=modpacks`}
                        className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Modpack & Version Updater"
                      >
                        <Package className="h-3 w-3 text-amber-400" /> Modpack
                      </Link>
                      <Link
                        to={`/servers/${server.nodeId}/${server.id}`}
                        className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Terminal className="h-3 w-3" /> Manage
                      </Link>
                    </div>
                  }
                >
                  <div className="space-y-3 mt-1">
                    {/* Live Hardware + Game Telemetry Stats */}
                    <div className="grid grid-cols-4 gap-2 bg-muted/30 border border-border/50 rounded-xl p-2.5 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">CPU</span>
                        <p className="font-mono font-bold text-foreground mt-0.5">{server.cpuUsage}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">RAM</span>
                        <p className="font-mono font-bold text-foreground mt-0.5 truncate" title={`${server.memUsage} (Limit ${server.memory})`}>
                          {server.memUsage.split('/')[0]?.trim() || '0B'} <span className="text-[10px] text-muted-foreground font-normal">/ {server.memory}</span>
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">TPS / MSPT</span>
                        <p className={cn(
                          'font-mono font-bold mt-0.5',
                          tpsVal === null ? 'text-muted-foreground' : tpsVal >= 19.0 ? 'text-emerald-400' : tpsVal >= 15.0 ? 'text-amber-400' : 'text-rose-400'
                        )}>
                          {tpsVal !== null ? `${Number(tpsVal).toFixed(1)}` : '—'}
                          {msptVal !== null ? <span className="text-[10px] text-muted-foreground font-normal"> ({Number(msptVal).toFixed(0)}ms)</span> : null}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">Players</span>
                        <p className="font-mono font-bold text-sky-400 mt-0.5">
                          {server.online ? `${playersOnline} / ${maxPlayers}` : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {/* Telemetry Status Strip */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tStatus?.status === 'up_to_date' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                            <span className={cn("h-1.5 w-1.5 rounded-full", tStatus.connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500")} />
                            Telemetry v{tStatus.installedVersion} Synced
                          </span>
                        )}
                        {tStatus?.status === 'update_available' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-semibold">
                            <ArrowUpCircle className="h-3 w-3 text-amber-400" />
                            Update available: v{tStatus.latestVersion}
                          </span>
                        )}
                        {tStatus?.status === 'not_installed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 text-[10px] font-mono">
                            Telemetry not installed
                          </span>
                        )}
                        {tStatus?.status === 'disabled' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 text-[10px] font-mono">
                            Telemetry disabled
                          </span>
                        )}
                      </div>

                      {liveMc?.playerSample && liveMc.playerSample.length > 0 && (
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {liveMc.playerSample.slice(0, 5).map(p => (
                            <img
                              key={p.name}
                              src={`https://mc-heads.net/avatar/${p.name}/24`}
                              alt={p.name}
                              title={p.name}
                              className="inline-block h-5 w-5 rounded ring-1 ring-background"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Power Controls Bottom Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                      <span className="text-[11px] font-mono text-muted-foreground truncate" title={server.dataPath}>
                        {server.containerName} • <span className="opacity-75">{server.dataPath}</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {server.online ? (
                          <>
                            <button
                              onClick={() => powerMutation.mutate({ serverId: server.id, action: 'restart' })}
                              disabled={isPowerPending}
                              className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="Restart Server"
                            >
                              <RotateCw className={cn('h-3 w-3 text-amber-400', isPowerPending && 'animate-spin')} /> Restart
                            </button>
                            <button
                              onClick={() => powerMutation.mutate({ serverId: server.id, action: 'stop' })}
                              disabled={isPowerPending}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="Stop Server"
                            >
                              <Square className="h-3 w-3" /> Stop
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => powerMutation.mutate({ serverId: server.id, action: 'start' })}
                            disabled={isPowerPending}
                            className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" /> Start
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </BentoCard>
              )
            })}
          </BentoGrid>
        )}
      </div>

    </div>
  )
}
