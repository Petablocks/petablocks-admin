import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Server,
  X,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  Package,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreateServerModalProps {
  isOpen: boolean
  onClose: () => void
  nodes: Array<{ id: string; name: string; host: string; online: boolean }>
}

const LOADERS = [
  { id: 'NEOFORGE', label: 'NeoForge', desc: 'Modern Minecraft 1.20.4+ modding platform', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  { id: 'FABRIC', label: 'Fabric', desc: 'Lightweight, ultra-fast modular mod loader', color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10' },
  { id: 'FORGE', label: 'Forge', desc: 'Classic mod loader for 1.12 to 1.20.1', color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10' },
  { id: 'PAPER', label: 'Paper / Purpur', desc: 'High-performance plugin server (Bukkit/Spigot)', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  { id: 'VANILLA', label: 'Vanilla', desc: 'Official unmodified Mojang server jar', color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
]

const MC_VERSIONS = ['1.21.4', '1.21.1', '1.21.0', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5']
const RAM_OPTIONS = ['4G', '6G', '8G', '12G', '16G', '24G', '32G']

interface ModpackSearchResult {
  id: string
  indexerId: string
  indexer: string
  name: string
  slug: string
  summary: string
  logoUrl: string
  downloads: number
  gameVersions?: string[]
  modLoaders?: string[]
}

export default function CreateServerModal({ isOpen, onClose, nodes }: CreateServerModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [serverId, setServerId] = useState('')
  const [nodeId, setNodeId] = useState(nodes[0]?.id || 'mcs-01')
  const [loader, setLoader] = useState('NEOFORGE')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [memory, setMemory] = useState('8G')
  const [gamePort, setGamePort] = useState(11700)
  const [motd, setMotd] = useState('§8[§bPETABLOCKS§8] §aNew Server §8- §7Join Now!')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // DiscoPanel Modpack Provisioning state
  const [provisionMode, setProvisionMode] = useState<'standard' | 'modpack'>('standard')
  const [modpackQuery, setModpackQuery] = useState('')
  const [modpackIndexer, setModpackIndexer] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [selectedModpack, setSelectedModpack] = useState<ModpackSearchResult | null>(null)
  const [selectedModpackVersion, setSelectedModpackVersion] = useState('')

  // Search Modpacks query
  const { data: modpacksData, isFetching: isSearchingModpacks, refetch: searchModpacks } = useQuery<{ modpacks: ModpackSearchResult[] }>({
    queryKey: ['create-modal-modpacks', nodeId, modpackQuery, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/search?nodeId=${encodeURIComponent(nodeId)}&query=${encodeURIComponent(modpackQuery)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: isOpen && provisionMode === 'modpack',
  })

  // Fetch versions for selected modpack
  const { data: versionsData, isFetching: isLoadingVersions } = useQuery<{ versions: Array<{ id: string; displayName: string; versionNumber: string; gameVersions: string[]; modLoader: string }> }>({
    queryKey: ['create-modal-modpack-versions', nodeId, selectedModpack?.id, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/${encodeURIComponent(selectedModpack!.id)}/versions?nodeId=${encodeURIComponent(nodeId)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: Boolean(isOpen && provisionMode === 'modpack' && selectedModpack?.id),
  })

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val)
    if (!serverId || serverId === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setServerId(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 32))
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      const res = await fetch('/api/server-manager/servers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          serverId,
          nodeId,
          loader,
          mcVersion,
          memory,
          gamePort,
          motd,
          ...(provisionMode === 'modpack' && selectedModpack
            ? {
                modpackId: selectedModpack.id,
                modpackVersionId: selectedModpackVersion,
                indexer: modpackIndexer,
              }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || `Server creation failed (${res.status})`)
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['managed-servers'] })
      onClose()
      if (data.server?.id) {
        navigate(`/servers/${nodeId}/${data.server.id}`)
      }
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Failed to provision Minecraft server container.')
    },
  })

  if (!isOpen) return null

  const selectedNode = nodes.find(n => n.id === nodeId)
  const selectedLoaderObj = LOADERS.find(l => l.id === loader) || LOADERS[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-bold text-base text-foreground flex items-center gap-2">
                Create Minecraft Server
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                  DiscoPanel Engine
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">Provision a managed Docker container with automatic PETABLOCKS Telemetry on any node</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold">Server Provisioning Failed</p>
              <p className="text-[11px] opacity-90 break-words mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* Provision Mode Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/40 border border-border">
            <button
              type="button"
              onClick={() => setProvisionMode('standard')}
              className={cn(
                'py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all',
                provisionMode === 'standard'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers className="h-3.5 w-3.5" /> Standard Loader (Fabric / NeoForge / Paper)
            </button>
            <button
              type="button"
              onClick={() => setProvisionMode('modpack')}
              className={cn(
                'py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all',
                provisionMode === 'modpack'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Package className="h-3.5 w-3.5" /> Deploy from Modpack (Modrinth / CurseForge)
            </button>
          </div>

          {/* Section 1: Server Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Server Name</label>
              <input
                type="text"
                placeholder="e.g. PETABLOCKS Create 3 SMP"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Server ID (Directory & Slug)</label>
              <input
                type="text"
                placeholder="e.g. create-3-smp"
                value={serverId}
                onChange={(e) => setServerId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Section 2: Target VM Node */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Target VM Node</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {nodes.map(node => (
                <button
                  key={node.id}
                  onClick={() => setNodeId(node.id)}
                  type="button"
                  className={cn(
                    'flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all',
                    nodeId === node.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                  )}
                >
                  <Server className={cn('h-4 w-4 shrink-0', nodeId === node.id ? 'text-primary' : '')} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{node.name}</p>
                    <p className="text-[10px] font-mono opacity-80">{node.host} {node.online ? '• Online' : '• Offline'}</p>
                  </div>
                  {nodeId === node.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3A: Modpack Browser (when provisionMode === 'modpack') */}
          {provisionMode === 'modpack' && (
            <div className="space-y-2.5 p-3.5 rounded-xl bg-muted/20 border border-border">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex rounded-xl bg-muted/50 border border-border p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setModpackIndexer('modrinth'); setSelectedModpack(null) }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors',
                      modpackIndexer === 'modrinth' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-muted-foreground'
                    )}
                  >
                    Modrinth
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModpackIndexer('curseforge'); setSelectedModpack(null) }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors',
                      modpackIndexer === 'curseforge' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-muted-foreground'
                    )}
                  >
                    CurseForge
                  </button>
                </div>
                <div className="relative flex-1 flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={`Search ${modpackIndexer === 'modrinth' ? 'Modrinth' : 'CurseForge'} modpacks (e.g. Create, Cobblemon, All the Mods)...`}
                      value={modpackQuery}
                      onChange={(e) => setModpackQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchModpacks())}
                      className="w-full bg-background/60 border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => searchModpacks()}
                    className="px-3 py-1.5 rounded-xl bg-primary/15 text-primary border border-primary/30 font-bold text-xs"
                  >
                    Search
                  </button>
                </div>
              </div>

              {/* Modpack Search Results */}
              {isSearchingModpacks ? (
                <div className="py-6 text-center text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Searching modpacks…
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {(modpacksData?.modpacks || []).map((mp) => {
                    const isSelected = selectedModpack?.id === mp.id
                    return (
                      <button
                        key={mp.id}
                        type="button"
                        onClick={() => {
                          setSelectedModpack(mp)
                          setSelectedModpackVersion('')
                          if (!name) handleNameChange(mp.name)
                          if (mp.gameVersions?.[0]) setMcVersion(mp.gameVersions[0])
                          if (mp.modLoaders?.[0]) {
                            const l = mp.modLoaders[0].toUpperCase()
                            if (LOADERS.some(item => item.id === l)) setLoader(l)
                          }
                        }}
                        className={cn(
                          'w-full p-2 rounded-xl border text-left flex items-center gap-2.5 transition-all',
                          isSelected ? 'border-primary bg-primary/10' : 'border-border/60 bg-card/60 hover:bg-muted/40'
                        )}
                      >
                        {mp.logoUrl ? (
                          <img src={mp.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-muted" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground truncate">{mp.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {(mp.downloads || 0).toLocaleString()} dl
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{mp.summary}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Version selector if modpack selected */}
              {selectedModpack && (
                <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-[11px] font-bold text-primary shrink-0">
                    Selected: {selectedModpack.name}
                  </span>
                  <select
                    value={selectedModpackVersion}
                    onChange={(e) => setSelectedModpackVersion(e.target.value)}
                    className="flex-1 bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground font-mono"
                  >
                    <option value="">Latest Recommended Release</option>
                    {isLoadingVersions ? (
                      <option disabled>Loading versions...</option>
                    ) : (
                      (versionsData?.versions || []).map(v => (
                        <option key={v.id} value={v.id}>
                          {v.displayName || v.versionNumber} ({(v.gameVersions || []).slice(0, 2).join(', ')})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Section 3B: Mod Loader Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Mod Loader / Server Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LOADERS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setLoader(item.id)}
                  type="button"
                  className={cn(
                    'p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1',
                    loader === item.id ? `${item.border} ${item.bg}` : 'border-border bg-muted/20 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('font-bold text-xs', loader === item.id ? item.color : 'text-foreground')}>{item.label}</span>
                    {loader === item.id && <CheckCircle2 className={cn('h-3.5 w-3.5', item.color)} />}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Version & Memory */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Minecraft Version</label>
              <select
                value={mcVersion}
                onChange={(e) => setMcVersion(e.target.value)}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary text-xs"
              >
                {MC_VERSIONS.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">RAM Memory Limit</label>
              <select
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono focus:outline-none focus:border-primary text-xs"
              >
                {RAM_OPTIONS.map(m => (
                  <option key={m} value={m}>{m} RAM</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Game Port (TCP/UDP)</label>
              <input
                type="number"
                value={gamePort}
                onChange={(e) => setGamePort(parseInt(e.target.value, 10))}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Section 5: MOTD */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Server MOTD (Formatting codes supported)</label>
            <input
              type="text"
              value={motd}
              onChange={(e) => setMotd(e.target.value)}
              className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
            />
          </div>

          {/* Summary Box */}
          <div className="bg-muted/30 rounded-xl p-3 border border-border text-[11px] text-muted-foreground space-y-1">
            <p><span className="text-foreground font-bold">Node Host:</span> {selectedNode?.name} ({selectedNode?.host})</p>
            <p>
              <span className="text-foreground font-bold">Runtime:</span> {selectedLoaderObj.label} {mcVersion} · {memory} RAM allocation
              {provisionMode === 'modpack' && selectedModpack && ` · Modpack: ${selectedModpack.name}`}
            </p>
            <p><span className="text-foreground font-bold">Port Binding:</span> {gamePort} (Game) · {gamePort + 10} (Internal RCON)</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || !serverId}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Provisioning Container…</>
            ) : (
              <><Play className="h-4 w-4" /> Create & Launch Server</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
