import { useQuery } from '@tanstack/react-query'
import { Database, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DbStatus {
  name: string
  host: string
  port: number
  connected: boolean
  databases: { name: string; sizeMb: number; tables: number }[]
}

export default function DatabasesPage() {
  const { data: dbs = [] } = useQuery<DbStatus[]>({
    queryKey: ['databases'],
    queryFn: () => fetch('/api/databases').then(r => r.json()),
  })

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          Databases
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">
          Status of MariaDB instances running on PETABLOCKS-DB (10.20.110.117)
        </p>
      </div>

      <div className="grid gap-4">
        {dbs.map((db) => (
          <div key={db.name} className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="font-bold text-sm sm:text-base">{db.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{db.host}:{db.port}</p>
                </div>
              </div>
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold',
                db.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              )}>
                <Circle className="h-1.5 w-1.5 sm:h-2 sm:w-2 fill-current" />
                {db.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {db.databases && db.databases.length > 0 ? (
              <div className="overflow-x-auto touch-scroll border border-border/60 rounded-lg">
                <table className="w-full text-xs sm:text-sm min-w-[320px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                      <th className="text-left p-2.5 sm:px-4 sm:py-3 font-medium">Database</th>
                      <th className="text-left p-2.5 sm:px-4 sm:py-3 font-medium">Tables</th>
                      <th className="text-right p-2.5 sm:px-4 sm:py-3 font-medium">Data Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.databases.map((d) => {
                      const mb = typeof d.sizeMb === 'number' ? d.sizeMb : parseFloat(String(d.sizeMb)) || 0
                      return (
                        <tr key={d.name} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                          <td className="p-2.5 sm:px-4 sm:py-3 font-mono text-xs font-bold text-foreground">{d.name}</td>
                          <td className="p-2.5 sm:px-4 sm:py-3 text-muted-foreground font-mono text-xs">{d.tables}</td>
                          <td className="p-2.5 sm:px-4 sm:py-3 text-right text-muted-foreground font-mono text-xs">{mb.toFixed(1)} MB</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-mono py-2">No user database schema detected or service unreachable.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
