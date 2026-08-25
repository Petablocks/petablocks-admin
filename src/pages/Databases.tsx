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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Databases</h1>
        <p className="text-muted-foreground text-sm mt-1">Status of MariaDB instances running on PETABLOCKS-DB (10.20.110.117)</p>
      </div>

      <div className="grid gap-4">
        {dbs.map((db) => (
          <div key={db.name} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">{db.name}</p>
                  <p className="text-xs text-muted-foreground">{db.host}:{db.port}</p>
                </div>
              </div>
              <span className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium',
                db.connected ? 'text-emerald-400' : 'text-rose-400'
              )}>
                <Circle className="h-2 w-2 fill-current" />
                {db.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {db.databases && db.databases.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 font-medium">Database</th>
                    <th className="text-left py-2 font-medium">Tables</th>
                    <th className="text-right py-2 font-medium">Data Size</th>
                  </tr>
                </thead>
                <tbody>
                  {db.databases.map((d) => (
                    <tr key={d.name} className="border-b border-border last:border-0">
                      <td className="py-2 font-mono text-xs">{d.name}</td>
                      <td className="py-2 text-muted-foreground">{d.tables}</td>
                      <td className="py-2 text-right text-muted-foreground">{d.sizeMb.toFixed(1)} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">No user database schema detected or service unreachable.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
