import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Server,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  Package,
  Layers,
  ArrowLeft,
  Cpu,
  Radio,
  Sliders,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const LOADERS = [
  { id: 'NEOFORGE', label: 'NeoForge', desc: 'Modern Minecraft 1.20.4+ modding platform with cutting-edge mod support', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  { id: 'FABRIC', label: 'Fabric', desc: 'Lightweight, ultra-fast modular mod loader optimized for speed and tickrate', color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10' },
  { id: 'FORGE', label: 'Forge', desc: 'Classic mod loader framework for Minecraft 1.12 up to 1.20.1', color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10' },
  { id: 'PAPER', label: 'Paper / Purpur', desc: 'High-performance plugin server (Bukkit/Spigot API) for multiplayer networks', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  { id: 'VANILLA', label: 'Vanilla', desc: 'Official unmodified Mojang server jar without mod/plugin hooks', color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
]

const MC_VERSIONS = ['1.21.4', '1.21.1', '1.21.0', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5']
const RAM_OPTIONS = ['4G', '6G', '8G', '12G', '16G', '24G', '32G']

interface NodeInfo {
  id: string
  name: string
  host: string
  online: boolean
  discoPanelOnline?: boolean
  pingMs: number
  cpuCores: number
  memory: { totalGb: string; usedGb: string; percent: number }
  disk: { total: string; used: string; avail: string; percent: number }
}

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
  websiteUrl?: string
}

export default function CreateServerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Fetch nodes
  const { data: nodesData } = useQuery<{ nodes: NodeInfo[] }>({
    queryKey: ['nodes'],
    queryFn: () => fetch('/api/server-manager/nodes').then(r => r.json()),
  })
  const nodes = nodesData?.nodes || [
    { id: 'mcs-01', name: 'PETABLOCKS-MCS1', host: '10.20.110.118', online: true, pingMs: 12, cpuCores: 12, memory: { totalGb: '64', usedGb: '20', percent: 31 }, disk: { total: '1.8TB', used: '180GB', avail: '1.6TB', percent: 10 } },
    { id: 'mcs-02', name: 'PETABLOCKS-MCS2', host: '10.20.110.119', online: true, pingMs: 14, cpuCores: 12, memory: { totalGb: '64', usedGb: '24', percent: 37 }, disk: { total: '1.8TB', used: '210GB', avail: '1.5TB', percent: 12 } },
    { id: 'mcs-03', name: 'PETABLOCKS-MCS3', host: '10.20.110.120', online: true, pingMs: 15, cpuCores: 12, memory: { totalGb: '64', usedGb: '18', percent: 28 }, disk: { total: '1.8TB', used: '140GB', avail: '1.6TB', percent: 8 } },
  ]

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
    queryKey: ['create-page-modpacks', nodeId, modpackQuery, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/search?nodeId=${encodeURIComponent(nodeId)}&query=${encodeURIComponent(modpackQuery)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: provisionMode === 'modpack',
  })

  // Fetch versions for selected modpack
  const { data: versionsData, isFetching: isLoadingVersions } = useQuery<{
    versions: Array<{ id: string; displayName: string; versionNumber: string; gameVersions: string[]; modLoader: string }>
  }>({
    queryKey: ['create-page-modpack-versions', nodeId, selectedModpack?.id, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/${encodeURIComponent(selectedModpack!.id)}/versions?nodeId=${encodeURIComponent(nodeId)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: Boolean(provisionMode === 'modpack' && selectedModpack?.id),
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
      if (data.server?.id) {
        navigate(`/servers/${nodeId}/${data.server.id}`)
      } else {
        navigate('/servers')
      }
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Failed to provision Minecraft server container.')
    },
  })

  const selectedNode = nodes.find(n => n.id === nodeId) || nodes[0]
  const selectedLoaderObj = LOADERS.find(l => l.id === loader) || LOADERS[0]

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <Link to="/servers" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Server Fleet
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <Sparkles className="h-7 w-7 text-primary" />
              Provision Minecraft Server
            </h1>
            <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
              DiscoPanel Orchestration
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Deploy an isolated Minecraft container with automated port mapping, telemetry synchronization, and instant modpack hydration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/servers"
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl border border-border transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || !serverId}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-primary/20 transition-all disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Provisioning Server…</>
            ) : (
              <><Play className="h-4 w-4" /> Deploy &amp; Launch Server</>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-3 shadow-lg">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Server Provisioning Failed</p>
            <p className="text-xs opacity-90 break-words mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Main Grid: Options on Left, Live Spec Summary on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Forms (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Mode Selector Tabs */}
          <div className="bg-card rounded-2xl border border-border p-1.5 shadow-sm grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setProvisionMode('standard')}
              className={cn(
                'py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all',
                provisionMode === 'standard'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Layers className="h-4 w-4" /> Standard Mod Loader (Fabric / NeoForge / Paper)
            </button>
            <button
              type="button"
              onClick={() => setProvisionMode('modpack')}
              className={cn(
                'py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all',
                provisionMode === 'modpack'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Package className="h-4 w-4" /> Deploy From Modpack (Modrinth / CurseForge)
            </button>
          </div>

          {/* Section 1: Server Identity */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
            <div className="border-b border-border pb-2.5">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" /> Server Identity &amp; Slug
              </h2>
              <p className="text-[11px] text-muted-foreground">The display name in the Admin panel and directory identifier on the host VM</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Server Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. PETABLOCKS Create 3 SMP"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Server ID (Directory &amp; Slug)</label>
                <input
                  type="text"
                  placeholder="e.g. create-3-smp"
                  value={serverId}
                  onChange={(e) => setServerId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Server MOTD (Supports formatting codes)</label>
              <input
                type="text"
                value={motd}
                onChange={(e) => setMotd(e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Section 2: Target Cluster Node */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
            <div className="border-b border-border pb-2.5">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" /> Target Cluster Game Node
              </h2>
              <p className="text-[11px] text-muted-foreground">Select the dedicated host VM where the Docker container will be provisioned</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {nodes.map(node => (
                <button
                  key={node.id}
                  onClick={() => setNodeId(node.id)}
                  type="button"
                  className={cn(
                    'p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5',
                    nodeId === node.id
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                      : 'border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground truncate">{node.name}</span>
                    {nodeId === node.id ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <div className="space-y-1 text-[11px] font-mono">
                    <p className="opacity-80">{node.host}</p>
                    <p className="text-[10px] text-muted-foreground">
                      RAM: {node.memory?.usedGb || '18'} / {node.memory?.totalGb || '64'} GB
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Modpack Selection (when modpack mode is active) */}
          {provisionMode === 'modpack' && (
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-2.5">
                <div>
                  <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-400" /> Modpack Catalog Search
                  </h2>
                  <p className="text-[11px] text-muted-foreground">Search and hydrate directly from Modrinth or CurseForge</p>
                </div>
                <div className="flex rounded-xl bg-muted/50 border border-border p-0.5 shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => { setModpackIndexer('modrinth'); setSelectedModpack(null) }}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                      modpackIndexer === 'modrinth' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-muted-foreground'
                    )}
                  >
                    Modrinth
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModpackIndexer('curseforge'); setSelectedModpack(null) }}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                      modpackIndexer === 'curseforge' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-muted-foreground'
                    )}
                  >
                    CurseForge
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={`Search ${modpackIndexer === 'modrinth' ? 'Modrinth' : 'CurseForge'} modpacks (e.g. Create, Cobblemon, All the Mods)...`}
                    value={modpackQuery}
                    onChange={(e) => setModpackQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchModpacks())}
                    className="w-full bg-muted/30 border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => searchModpacks()}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                >
                  Search
                </button>
              </div>

              {/* Results Grid */}
              {isSearchingModpacks ? (
                <div className="py-12 text-center text-muted-foreground flex items-center justify-center gap-2 text-xs">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Querying {modpackIndexer} modpack registry…
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {(modpacksData?.modpacks || []).map((mp) => {
                    const isSelected = selectedModpack?.id === mp.id
                    return (
                      <div
                        key={mp.id}
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
                          'p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all text-xs',
                          isSelected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                        )}
                      >
                        {mp.logoUrl ? (
                          <img src={mp.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 bg-muted" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground text-sm truncate">{mp.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {(mp.downloads || 0).toLocaleString()} dl
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate leading-relaxed">{mp.summary}</p>
                          <div className="flex items-center gap-1.5 pt-1">
                            {(mp.modLoaders || []).slice(0, 3).map(l => (
                              <span key={l} className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary">
                                {l}
                              </span>
                            ))}
                            {(mp.gameVersions || []).slice(0, 2).map(v => (
                              <span key={v} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Version Selector for Selected Modpack */}
              {selectedModpack && (
                <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-primary block">Selected: {selectedModpack.name}</span>
                    <span className="text-[11px] text-muted-foreground">Choose the specific modpack build release to install</span>
                  </div>
                  <select
                    value={selectedModpackVersion}
                    onChange={(e) => setSelectedModpackVersion(e.target.value)}
                    className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
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

          {/* Section 4: Mod Loader Selection */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
            <div className="border-b border-border pb-2.5">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Mod Loader &amp; Server Type
              </h2>
              <p className="text-[11px] text-muted-foreground">Select the Minecraft modding platform or standalone server runtime</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {LOADERS.map(item => (
                <button
                  key={item.id}
                  onClick={() => setLoader(item.id)}
                  type="button"
                  className={cn(
                    'p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5',
                    loader === item.id ? `${item.border} ${item.bg} ring-1 ring-primary/40` : 'border-border bg-muted/20 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('font-bold text-xs', loader === item.id ? item.color : 'text-foreground')}>{item.label}</span>
                    {loader === item.id && <CheckCircle2 className={cn('h-4 w-4', item.color)} />}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: Hardware & Port Allocation */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
            <div className="border-b border-border pb-2.5">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Version, RAM &amp; Port Binding
              </h2>
              <p className="text-[11px] text-muted-foreground">Specify Minecraft release version, JVM memory limit, and networking port</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Minecraft Version</label>
                <select
                  value={mcVersion}
                  onChange={(e) => setMcVersion(e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:border-primary text-xs"
                >
                  {MC_VERSIONS.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">RAM Memory Allocation</label>
                <select
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-foreground font-mono focus:outline-none focus:border-primary text-xs"
                >
                  {RAM_OPTIONS.map(m => (
                    <option key={m} value={m}>{m} RAM</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Game Port (TCP/UDP)</label>
                <input
                  type="number"
                  value={gamePort}
                  onChange={(e) => setGamePort(parseInt(e.target.value, 10))}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Spec Card & Deployment Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm sticky top-6">
            <div className="border-b border-border pb-3">
              <span className="text-[10px] font-mono uppercase font-bold text-primary tracking-wider">Deployment Specification</span>
              <h3 className="font-bold text-base text-foreground mt-0.5">Summary</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Target Host:</span>
                  <span className="font-bold text-foreground">{selectedNode?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Internal IP:</span>
                  <span className="font-mono text-foreground">{selectedNode?.host}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Runtime:</span>
                  <span className="font-bold text-primary">{selectedLoaderObj.label} {mcVersion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Allocated RAM:</span>
                  <span className="font-mono text-foreground font-semibold">{memory}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Game Port:</span>
                  <span className="font-mono text-foreground">{gamePort}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Internal RCON:</span>
                  <span className="font-mono text-foreground">{gamePort + 10}</span>
                </div>
              </div>

              {provisionMode === 'modpack' && selectedModpack && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Selected Modpack</span>
                  <p className="font-bold text-foreground">{selectedModpack.name}</p>
                  <p className="text-[10px] font-mono opacity-80">{selectedModpackIndexer(modpackIndexer)} • {selectedModpackVersion || 'Latest Release'}</p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] space-y-1">
                <span className="font-bold block">✨ Automated PETABLOCKS Telemetry</span>
                <p className="opacity-90">
                  The PETABLOCKS Telemetry Companion will be automatically injected into <code>config/petablocks-telemetry.json</code> upon server creation.
                </p>
              </div>
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !name || !serverId}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Deploying Container…</>
              ) : (
                <><Play className="h-4 w-4" /> Deploy &amp; Launch Server</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function selectedModpackIndexer(indexer: string) {
  return indexer === 'modrinth' ? 'Modrinth API' : 'CurseForge API'
}
