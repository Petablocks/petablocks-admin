import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RotateCcw, Circle } from 'lucide-react'
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
        <p className="text-muted-foreground">Loading container instances...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Containers</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage Docker containers running on PETABLOCKS-FEA</p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
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
                <td className="px-4 py-3 text-muted-foreground">{c.cpuPercent.toFixed(1)}%</td>
                <td className="px-4 py-3 text-muted-foreground">{c.memMb.toFixed(0)} MB</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => mutate.mutate({ id: c.id, action: 'start' })}
                      disabled={c.state === 'running'}
                      className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Start Container"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => mutate.mutate({ id: c.id, action: 'stop' })}
                      disabled={c.state !== 'running'}
                      className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Stop Container"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => mutate.mutate({ id: c.id, action: 'restart' })}
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
  )
}
