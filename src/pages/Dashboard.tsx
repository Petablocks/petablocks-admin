import { useQuery } from '@tanstack/react-query'
import { Activity, Box, Database, HardDrive } from 'lucide-react'

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

export default function DashboardPage() {
  const { data, isLoading } = useQuery<SystemHealth>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(r => r.json()),
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
      label: 'Running Containers',
      value: data?.containers.running ?? '0',
      icon: Box,
      sub: `${data?.containers.total ?? 0} configured total`,
    },
    {
      label: 'CPU Usage',
      value: data ? `${data.cpuPercent.toFixed(1)}%` : '0%',
      icon: Activity,
      sub: 'FEA Host & Containers',
    },
    {
      label: 'Memory Used',
      value: data ? `${data.memUsedGb.toFixed(1)} GB` : '0 GB',
      icon: HardDrive,
      sub: `of ${data?.memTotalGb.toFixed(0) ?? 8} GB total`,
    },
    {
      label: 'Databases',
      value: '3 Online',
      icon: Database,
      sub: 'MariaDB FEA, MC & Redis',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of PETABLOCKS-FEA and connected PETABLOCKS-DB services
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, sub }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Services Overview */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">Core Infrastructure Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-md border border-border bg-background/50">
            <p className="font-medium text-sm">Website & Wiki</p>
            <p className="text-xs text-muted-foreground mt-1">petablocks.com & wiki.petablocks.com</p>
            <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 font-medium">
              Active
            </span>
          </div>
          <div className="p-4 rounded-md border border-border bg-background/50">
            <p className="font-medium text-sm">MinIO File Storage</p>
            <p className="text-xs text-muted-foreground mt-1">files.petablocks.com (S3 API Headless)</p>
            <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 font-medium">
              Active
            </span>
          </div>
          <div className="p-4 rounded-md border border-border bg-background/50">
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
