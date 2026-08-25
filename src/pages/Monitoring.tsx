import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time resource usage across all containers</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* CPU Chart */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-semibold mb-4">Total CPU Usage (%)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(222 84% 7%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '6px' }}
                  labelStyle={{ color: 'hsl(210 40% 98%)' }}
                />
                <Area type="monotone" dataKey="cpu" stroke="hsl(142 76% 36%)" fill="url(#cpuGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Chart */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-semibold mb-4">Total Memory Usage (GB)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 65%)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(222 84% 7%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '6px' }}
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
