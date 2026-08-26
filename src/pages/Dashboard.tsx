import { useQuery } from '@tanstack/react-query'
import { Activity, Box, HardDrive, Gamepad2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ContainerSummary {
  total: number
  running: number
  stopped: number
}

interface SystemHealth {
  containers: ContainerSummary
  uptime: string
  cpuPercent: number
  memUsedGb: number
  memTotalGb: number
}

interface MinecraftTelemetry {
  totalOnline: number
  totalMax: number
  servers: Array<{ id: string; name: string; online: boolean; latency: number; players: { online: number } }>
}

export default function DashboardPage() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(r => r.json()),
  })

  const { data: mc } = useQuery<MinecraftTelemetry>({
    queryKey: ['mc-summary'],
    queryFn: () => fetch('/api/minecraft/servers').then(r => r.json()),
    refetchInterval: 15000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading system overview...</p>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Minecraft Players',
      value: `${mc?.totalOnline ?? 0} Online`,
      icon: Gamepad2,
      sub: `${mc?.servers?.filter(s => s.online).length ?? 3} / 3 Realms Online`,
      href: '/minecraft',
    },
    {
      label: 'Running Containers',
      value: health?.containers.running ?? '0',
      icon: Box,
      sub: `${health?.containers.total ?? 0} configured total`,
      href: '/containers',
    },
    {
      label: 'CPU Usage',
      value: health ? `${health.cpuPercent.toFixed(1)}%` : '0%',
      icon: Activity,
      sub: 'FEA Host & Containers',
      href: '/monitoring',
    },
    {
      label: 'Memory Used',
      value: health ? `${health.memUsedGb.toFixed(1)} GB` : '0 GB',
      icon: HardDrive,
      sub: `of ${health?.memTotalGb.toFixed(0) ?? 8} GB total`,
      href: '/monitoring',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of PETABLOCKS Minecraft Network, FEA Containers, and DB Services
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, sub, href }) => (
          <Link
            key={label}
            to={href}
            className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>{sub}</span>
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
            </div>
          </Link>
        ))}
      </div>

      {/* Minecraft Realms Quick Status */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Minecraft Game Realms</h2>
          </div>
          <Link to="/minecraft" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Open Server Manager <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(mc?.servers || [
            { id: 'fabric-main', name: 'PETABLOCKS Modpack Server', online: true, latency: 25, players: { online: 0 } },
            { id: 'create-2', name: 'PETABLOCKS Create 2', online: true, latency: 30, players: { online: 0 } },
            { id: 'create-patreon', name: 'PETABLOCKS Patreon Server', online: true, latency: 28, players: { online: 0 } },
          ]).map((srv) => (
            <div key={srv.id} className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm text-foreground">{srv.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{srv.online ? `${srv.latency}ms ping` : 'Offline'}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${srv.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {srv.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-2 border-t border-border/50">
                <span>Players:</span>
                <span className="font-bold text-foreground">{srv.players.online} active</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Core Infrastructure Services */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-bold">Core Infrastructure Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border bg-background/50">
            <p className="font-medium text-sm">Website & Wiki</p>
            <p className="text-xs text-muted-foreground mt-1">petablocks.com & wiki.petablocks.com</p>
            <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 font-medium">
              Active
            </span>
          </div>
          <div className="p-4 rounded-xl border border-border bg-background/50">
            <p className="font-medium text-sm">MinIO File Storage</p>
            <p className="text-xs text-muted-foreground mt-1">files.petablocks.com (S3 API Headless)</p>
            <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 font-medium">
              Active
            </span>
          </div>
          <div className="p-4 rounded-xl border border-border bg-background/50">
            <p className="font-medium text-sm">Player Stats API</p>
            <p className="text-xs text-muted-foreground mt-1">stats.petablocks.com</p>
            <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 font-medium">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
