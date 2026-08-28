import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity, Cpu, HardDrive } from 'lucide-react'

interface MetricPoint {
  time: string
  cpu: number
  mem: number
}

export default function MonitoringPage() {
  const { data: metrics = [] } = useQuery<MetricPoint[]>({
    queryKey: ['metrics'],
    queryFn: () => fetch('/api/metrics').then(r => r.json()),
    refetchInterval: 5000,
  })

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          System Monitoring
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">
          Real-time resource telemetry across PETABLOCKS-FEA host & containers
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* CPU Chart */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm sm:text-base flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400" />
              Total CPU Usage (%)
            </p>
            <span className="text-[10px] sm:text-xs font-mono text-emerald-400 font-bold">
              {metrics.length > 0 ? `${metrics[metrics.length - 1].cpu.toFixed(1)}%` : '0%'}
            </span>
          </div>
          <div className="h-52 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(222 84% 7%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }}
                  labelStyle={{ color: 'hsl(210 40% 98%)' }}
                />
                <Area type="monotone" dataKey="cpu" stroke="hsl(142 76% 36%)" fill="url(#cpuGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Chart */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm sm:text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-sky-400" />
              Total Memory Usage (GB)
            </p>
            <span className="text-[10px] sm:text-xs font-mono text-sky-400 font-bold">
              {metrics.length > 0 ? `${metrics[metrics.length - 1].mem.toFixed(1)} GB` : '0 GB'}
            </span>
          </div>
          <div className="h-52 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(222 84% 7%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', fontSize: '11px' }}
                  labelStyle={{ color: 'hsl(210 40% 98%)' }}
                />
                <Area type="monotone" dataKey="mem" stroke="hsl(217 91% 60%)" fill="url(#memGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
