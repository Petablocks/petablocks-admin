import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RotateCcw, Circle, Box, Cpu, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Container {
  id: string
  name: string
  image: string
  status: string
  state: 'running' | 'exited' | 'paused'
  cpuPercent: number
  memMb: number
}

const actionFetch = (id: string, action: string) =>
  fetch(`/api/containers/${id}/${action}`, { method: 'POST' }).then(r => r.json())

export default function ContainersPage() {
  const qc = useQueryClient()
  const { data: containers = [], isLoading } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: () => fetch('/api/containers').then(r => r.json()),
  })

  const mutate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      actionFetch(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Loading container instances...</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Box className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          Containers
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">
          Manage Docker containers running on PETABLOCKS-FEA
        </p>
      </div>

      {/* Mobile Card View (sm:hidden) */}
      <div className="sm:hidden space-y-3">
        {containers.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">{c.name.replace(/^\//, '')}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">{c.image}</p>
              </div>
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold',
                c.state === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              )}>
                <Circle className="h-1.5 w-1.5 fill-current" />
                {c.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span>CPU: {c.cpuPercent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                <span>RAM: {c.memMb.toFixed(0)} MB</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                onClick={() => mutate.mutate({ id: c.id, action: 'start' })}
                disabled={c.state === 'running' || mutate.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-accent disabled:opacity-30"
              >
                <Play className="h-3 w-3" /> Start
              </button>
              <button
                onClick={() => mutate.mutate({ id: c.id, action: 'stop' })}
                disabled={c.state !== 'running' || mutate.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-accent disabled:opacity-30 text-rose-400"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
              <button
                onClick={() => mutate.mutate({ id: c.id, action: 'restart' })}
                disabled={mutate.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary/20"
              >
                <RotateCcw className="h-3 w-3" /> Restart
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View (hidden sm:block) */}
      <div className="hidden sm:block rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Image</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPU</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Memory</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium">{c.name.replace(/^\//, '')}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.image}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium',
                      c.state === 'running' ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      <Circle className="h-2 w-2 fill-current" />
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.cpuPercent.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.memMb.toFixed(0)} MB</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => mutate.mutate({ id: c.id, action: 'start' })}
                        disabled={c.state === 'running' || mutate.isPending}
                        className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Start Container"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => mutate.mutate({ id: c.id, action: 'stop' })}
                        disabled={c.state !== 'running' || mutate.isPending}
                        className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Stop Container"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => mutate.mutate({ id: c.id, action: 'restart' })}
                        disabled={mutate.isPending}
                        className="p-1.5 rounded hover:bg-accent"
                        title="Restart Container"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
