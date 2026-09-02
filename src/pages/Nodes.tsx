import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Layers,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Plus,
  Terminal,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeInfo {
  id: string
  name: string
  host: string
  port: number
  user: string
  baseDataDir: string
  description: string
  online: boolean
  pingMs: number
  cpuCores: number
  memory: { totalGb: string; usedGb: string; percent: number }
  disk: { total: string; used: string; avail: string; percent: number }
  docker: { running: number; total: number }
  error?: string
}

export default function NodesPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)

  const { data, isLoading, refetch } = useQuery<{ nodes: NodeInfo[] }>({
    queryKey: ['nodes'],
    queryFn: () => fetch('/api/server-manager/nodes').then(r => r.json()),
    refetchInterval: 15000,
  })

  const nodes = data?.nodes || []

  const sshPublicKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIrkH3Wg+FzvhDcB0zCYuksbqFdV8R425Dklm/LPed1W petablocks-mcs-access`
  const bootstrapScript = `curl -fsSL https://get.docker.com | sh && mkdir -p ~/.ssh /home/user/data/servers && echo "${sshPublicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`

  const handleCopyKey = () => {
    navigator.clipboard.writeText(sshPublicKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleCopyScript = () => {
    navigator.clipboard.writeText(bootstrapScript)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Layers className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
            Infrastructure & VM Nodes
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            Monitor and scale dedicated Minecraft server host VMs across the PETABLOCKS cluster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-mono rounded-xl border border-border flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh Nodes
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add / Provision VM
          </button>
        </div>
      </div>

      {/* Nodes Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Connecting to host nodes…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={cn(
                'bg-card rounded-2xl border p-6 space-y-5 transition-all shadow-sm',
                node.online ? 'border-border/80' : 'border-rose-500/30 bg-rose-500/5'
              )}
            >
              {/* Node Top Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Server className={cn('h-5 w-5', node.online ? 'text-primary' : 'text-rose-400')} />
                    <h2 className="font-bold text-base text-foreground">{node.name}</h2>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    Host: {node.host}:{node.port} • User: {node.user}
                  </p>
                  <p className="text-xs text-muted-foreground">{node.description}</p>
                </div>

                {/* Status Badge */}
                {node.online ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Online ({node.pingMs}ms)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" /> Unreachable
                  </span>
                )}
              </div>

              {/* Hardware Vitals */}
              {node.online ? (
                <div className="grid grid-cols-3 gap-3">
                  {/* Memory */}
                  <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1 text-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> Memory (RAM)
                    </span>
                    <p className="font-bold text-foreground font-mono text-sm">
                      {node.memory.usedGb} / {node.memory.totalGb} GB
                    </p>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mt-1">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          node.memory.percent > 85 ? 'bg-rose-500' : node.memory.percent > 70 ? 'bg-amber-500' : 'bg-primary'
                        )}
                        style={{ width: `${node.memory.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{node.memory.percent}% utilized</p>
                  </div>

                  {/* CPU */}
                  <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1 text-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> Processors
                    </span>
                    <p className="font-bold text-foreground font-mono text-sm">{node.cpuCores} vCPU Cores</p>
                    <p className="text-[10px] text-emerald-400 font-mono mt-2">Hardware ready</p>
                  </div>

                  {/* Disk */}
                  <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1 text-xs">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> NVMe Disk
                    </span>
                    <p className="font-bold text-foreground font-mono text-sm">
                      {node.disk.used} / {node.disk.total}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">{node.disk.avail} available</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 text-xs">
                  Error connecting over SSH: {node.error}
                </div>
              )}

              {/* Node Details Footer */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono text-[11px]">Storage root: {node.baseDataDir}</span>
                <span className="font-mono text-[11px] text-foreground font-bold">
                  {node.docker.running} Docker containers running
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision VM Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Provision a New Minecraft Host VM</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                To attach a new dedicated Linux VM to the PETABLOCKS cluster (e.g. <span className="font-mono text-foreground font-bold">PETABLOCKS-MCS-02</span>), run this one-line setup command as <span className="font-mono text-foreground font-bold">root</span> on the new VM:
              </p>

              {/* Bootstrap Command Box */}
              <div className="relative bg-[#0c1017] p-3.5 rounded-xl border border-border font-mono text-zinc-200 text-[11px] select-all break-all">
                {bootstrapScript}
                <button
                  onClick={handleCopyScript}
                  className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                  title="Copy command"
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="bg-muted/20 p-4 rounded-xl border border-border space-y-2">
                <h4 className="font-bold text-foreground text-xs">What this script does:</h4>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Installs the official Docker CE runtime and systemd service</li>
                  <li>Creates the server data directory <span className="font-mono text-foreground">/home/user/data/servers</span></li>
                  <li>Adds the PETABLOCKS cluster ed25519 public key to <span className="font-mono text-foreground">~/.ssh/authorized_keys</span></li>
                </ul>
              </div>

              {/* Public Key Display */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Cluster Public Key:</span>
                <div className="relative bg-muted/30 p-2.5 rounded-xl border border-border font-mono text-[10px] text-foreground break-all select-all">
                  {sshPublicKey}
                  <button
                    onClick={handleCopyKey}
                    className="absolute right-2 top-2 p-1 rounded bg-muted hover:bg-muted/80 text-foreground"
                  >
                    {copiedKey ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
