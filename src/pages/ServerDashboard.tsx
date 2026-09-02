import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Terminal,
  FolderOpen,
  Package,
  Users,
  ArchiveRestore,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Send,
  Save,
  Upload,
  Trash2,
  FileText,
  Folder,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search,
  Check,
  ToggleLeft,
  ToggleRight,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileItem {
  name: string
  isDir: boolean
  size: number
  modified: number
}

interface ModItem {
  filename: string
  enabled: boolean
  size: number
  modified: number
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export default function ServerDashboardPage() {
  const { nodeId = 'mcs-01', serverId } = useParams<{ nodeId: string; serverId: string }>()
  const [activeTab, setActiveTab] = useState<'console' | 'files' | 'mods' | 'players' | 'backups'>('console')

  // Console state
  const [commandInput, setCommandInput] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const consoleBottomRef = useRef<HTMLDivElement>(null)

  // Files state
  const [currentPath, setCurrentPath] = useState('')
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [fileSaveSuccess, setFileSaveSuccess] = useState(false)
  const fileUploadInputRef = useRef<HTMLInputElement>(null)

  // Mods state
  const [modSearch, setModSearch] = useState('')
  const modUploadInputRef = useRef<HTMLInputElement>(null)

  // 1. Fetch Server Details
  const { data: serverData, isLoading: isServerLoading, refetch: refetchServer } = useQuery({
    queryKey: ['server-detail', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}`).then(r => r.json()),
    refetchInterval: 5000,
  })

  // 2. Fetch Live Console Logs
  const { data: logsData, refetch: refetchLogs } = useQuery<{ logs: string }>({
    queryKey: ['server-logs', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/logs?lines=300`).then(r => r.json()),
    refetchInterval: activeTab === 'console' ? 2500 : false,
  })

  // 3. Fetch Files when on files tab
  const { data: filesData, isLoading: isFilesLoading, refetch: refetchFiles } = useQuery<{ path: string; items: FileItem[] }>({
    queryKey: ['server-files', serverId, currentPath],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/files?path=${encodeURIComponent(currentPath)}`).then(r => r.json()),
    enabled: activeTab === 'files',
  })

  // 4. Fetch Mods when on mods tab
  const { data: modsData, isLoading: isModsLoading, refetch: refetchMods } = useQuery<{ mods: ModItem[] }>({
    queryKey: ['server-mods', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/mods`).then(r => r.json()),
    enabled: activeTab === 'mods',
  })

  // 5. Fetch Players when on players tab
  const { data: playersData, refetch: refetchPlayers } = useQuery({
    queryKey: ['server-players', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/players`).then(r => r.json()),
    enabled: activeTab === 'players',
  })

  // Auto-scroll console
  useEffect(() => {
    if (autoScroll && activeTab === 'console') {
      consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logsData?.logs, autoScroll, activeTab])

  // Mutations
  const powerMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop' | 'restart') => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      return res.json()
    },
    onSuccess: () => {
      setTimeout(() => {
        refetchServer()
        refetchLogs()
      }, 2000)
    },
  })

  const commandMutation = useMutation({
    mutationFn: async (cmd: string) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })
      return res.json()
    },
    onSuccess: () => {
      setCommandInput('')
      refetchLogs()
    },
  })

  const saveFileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: editingFile, content: fileContent }),
      })
      return res.json()
    },
    onSuccess: () => {
      setFileSaveSuccess(true)
      setTimeout(() => setFileSaveSuccess(false), 2000)
    },
  })

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', currentPath)
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/upload`, {
        method: 'POST',
        body: formData,
      })
      return res.json()
    },
    onSuccess: () => refetchFiles(),
  })

  const uploadModMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', 'mods')
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/upload`, {
        method: 'POST',
        body: formData,
      })
      return res.json()
    },
    onSuccess: () => refetchMods(),
  })

  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/files?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      })
      return res.json()
    },
    onSuccess: () => refetchFiles(),
  })

  const toggleModMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/mods/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      return res.json()
    },
    onSuccess: () => refetchMods(),
  })

  async function openFileForEdit(filePath: string) {
    try {
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/content?file=${encodeURIComponent(filePath)}`).then(r => r.json())
      if (res.content !== undefined) {
        setEditingFile(filePath)
        setFileContent(res.content)
      } else {
        alert(res.error || 'Cannot open binary or unreadable file')
      }
    } catch (e: any) {
      alert(`Error reading file: ${e.message}`)
    }
  }

  const server = serverData?.server
  const node = serverData?.node
  const container = serverData?.container
  const isOnline = container?.State?.Running || false

  if (isServerLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Connecting to server node…
      </div>
    )
  }

  if (!server) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Link to="/servers" className="text-xs text-primary flex items-center gap-1 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Fleet
        </Link>
        <div className="p-6 bg-card border border-border rounded-2xl text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
          <h2 className="font-bold text-lg">Server Not Found</h2>
          <p className="text-xs text-muted-foreground">The server &apos;{serverId}&apos; is not registered on node &apos;{nodeId}&apos;.</p>
        </div>
      </div>
    )
  }

  const filteredMods = (modsData?.mods || []).filter(m =>
    m.filename.toLowerCase().includes(modSearch.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Top Bar: Back, Name, Status & Power Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <Link to="/servers" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Fleet Overview
          </Link>
          <div className="flex items-center gap-3">
            <h1 className={cn('text-xl sm:text-2xl font-bold tracking-tight', server.color || 'text-foreground')}>
              {server.name}
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
              {server.type} {server.version}
            </span>
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" /> Running
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-xs font-bold">
                <Square className="h-3.5 w-3.5" /> Offline
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            Node: {node?.name} • Game Port: {server.gamePort} • RCON: {server.rconHostPort}
          </p>
        </div>

        {/* Quick Power Controls */}
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <button
                onClick={() => powerMutation.mutate('restart')}
                disabled={powerMutation.isPending}
                className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCw className={cn('h-3.5 w-3.5', powerMutation.isPending && 'animate-spin')} /> Restart
              </button>
              <button
                onClick={() => powerMutation.mutate('stop')}
                disabled={powerMutation.isPending}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            </>
          ) : (
            <button
              onClick={() => powerMutation.mutate('start')}
              disabled={powerMutation.isPending}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" /> Start Server
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => { setActiveTab('console'); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all',
            activeTab === 'console' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Terminal className="h-4 w-4" /> Live Console
        </button>
        <button
          onClick={() => { setActiveTab('files'); refetchFiles() }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all',
            activeTab === 'files' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <FolderOpen className="h-4 w-4" /> File Manager
        </button>
        <button
          onClick={() => { setActiveTab('mods'); refetchMods(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all',
            activeTab === 'mods' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Package className="h-4 w-4" /> Mods ({modsData?.mods?.length || 0})
        </button>
        <button
          onClick={() => { setActiveTab('players'); refetchPlayers(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all',
            activeTab === 'players' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" /> Players & Access
        </button>
        <Link
          to="/backups"
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all ml-auto"
        >
          <ArchiveRestore className="h-4 w-4 text-sky-400" /> Server Backups &rarr;
        </Link>
      </div>

      {/* TAB 1: LIVE CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-3">
          <div className="bg-[#0c1017] rounded-2xl border border-border/80 overflow-hidden font-mono text-xs flex flex-col h-[520px] shadow-2xl">
            {/* Terminal Header */}
            <div className="bg-muted/30 px-4 py-2.5 border-b border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-bold text-foreground">console@{server.id}</span>
                <span>({server.containerName})</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Auto-scroll</span>
                </label>
                <button onClick={() => refetchLogs()} className="hover:text-foreground">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Log Output Stream */}
            <div className="flex-1 p-4 overflow-y-auto space-y-0.5 text-zinc-300 leading-relaxed font-mono select-text">
              {logsData?.logs ? (
                logsData.logs.split('\n').map((line, idx) => {
                  let color = 'text-zinc-300'
                  if (line.includes('WARN')) color = 'text-amber-400'
                  else if (line.includes('ERROR') || line.includes('Exception') || line.includes('Fatal')) color = 'text-rose-400 font-bold'
                  else if (line.includes('joined the game') || line.includes('Done (')) color = 'text-emerald-400 font-bold'
                  else if (line.includes('RCON')) color = 'text-sky-400'

                  return (
                    <div key={idx} className={cn('whitespace-pre-wrap break-all', color)}>
                      {line}
                    </div>
                  )
                })
              ) : (
                <div className="text-muted-foreground italic">No console logs available.</div>
              )}
              <div ref={consoleBottomRef} />
            </div>

            {/* Command Prompt Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (commandInput.trim()) commandMutation.mutate(commandInput)
              }}
              className="p-2.5 bg-muted/20 border-t border-border/60 flex items-center gap-2"
            >
              <span className="text-primary font-bold pl-2">&gt;</span>
              <input
                type="text"
                placeholder={isOnline ? "Enter Minecraft command (e.g. say Hello, op player, time set day)..." : "Server is offline. Start server to execute commands."}
                disabled={!isOnline || commandMutation.isPending}
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                className="flex-1 bg-transparent border-none text-foreground focus:outline-none font-mono text-xs placeholder:text-muted-foreground/60"
              />
              <button
                type="submit"
                disabled={!isOnline || !commandInput.trim() || commandMutation.isPending}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center gap-1 text-xs disabled:opacity-40 transition-colors"
              >
                {commandMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: FILE MANAGER & CODE EDITOR */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          {editingFile ? (
            /* In-Browser File Editor */
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-bold text-sm text-foreground font-mono">{editingFile}</h3>
                    <p className="text-[11px] text-muted-foreground">In-browser file editor</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingFile(null)}
                    className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => saveFileMutation.mutate()}
                    disabled={saveFileMutation.isPending}
                    className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {saveFileMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                    ) : fileSaveSuccess ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-300" /> Saved!</>
                    ) : (
                      <><Save className="h-3.5 w-3.5" /> Save File</>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-[450px] bg-[#0c1017] text-zinc-200 font-mono text-xs p-4 rounded-xl border border-border focus:outline-none focus:border-primary leading-relaxed"
                spellCheck={false}
              />
            </div>
          ) : (
            /* File Directory Browser */
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
              {/* Path Breadcrumbs & Actions */}
              <div className="p-3.5 bg-muted/20 border-b border-border flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 font-mono text-xs overflow-x-auto">
                  <button
                    onClick={() => setCurrentPath('')}
                    className="text-primary font-bold hover:underline"
                  >
                    /data
                  </button>
                  {currentPath.split('/').filter(Boolean).map((segment, idx, arr) => {
                    const subpath = arr.slice(0, idx + 1).join('/')
                    return (
                      <span key={idx} className="flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <button
                          onClick={() => setCurrentPath(subpath)}
                          className="hover:text-primary"
                        >
                          {segment}
                        </button>
                      </span>
                    )
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileUploadInputRef.current?.click()}
                    disabled={uploadFileMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload File
                  </button>
                  <input
                    ref={fileUploadInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) uploadFileMutation.mutate(e.target.files[0])
                    }}
                  />
                  <button onClick={() => refetchFiles()} className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground">
                    <RefreshCw className={cn('h-3.5 w-3.5', isFilesLoading && 'animate-spin')} />
                  </button>
                </div>
              </div>

              {/* Files Table */}
              {isFilesLoading ? (
                <div className="p-12 text-center text-muted-foreground flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading directory…
                </div>
              ) : (filesData?.items || []).length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">This folder is empty.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/10 text-muted-foreground text-[10px] uppercase font-bold">
                        <th className="text-left px-4 py-2.5">Name</th>
                        <th className="text-left px-4 py-2.5">Size</th>
                        <th className="text-left px-4 py-2.5">Modified</th>
                        <th className="text-right px-4 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filesData?.items.map((item) => {
                        const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name

                        return (
                          <tr key={item.name} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5">
                              {item.isDir ? (
                                <button
                                  onClick={() => setCurrentPath(itemPath)}
                                  className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors text-left"
                                >
                                  <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                                  <span>{item.name}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => openFileForEdit(itemPath)}
                                  className="flex items-center gap-2 font-mono text-zinc-300 hover:text-primary transition-colors text-left"
                                >
                                  <FileText className="h-4 w-4 text-sky-400 shrink-0" />
                                  <span>{item.name}</span>
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">
                              {item.isDir ? '—' : formatBytes(item.size)}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-[11px]">
                              {item.modified ? new Date(item.modified * 1000).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1.5">
                                {!item.isDir && (
                                  <button
                                    onClick={() => openFileForEdit(itemPath)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Edit file"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (confirm(`Delete ${item.name}? This cannot be undone.`)) {
                                      deleteFileMutation.mutate(itemPath)
                                    }
                                  }}
                                  className="p-1 rounded hover:bg-rose-500/20 text-rose-400"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MODS MANAGER */}
      {activeTab === 'mods' && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" /> Installed Mods ({modsData?.mods?.length || 0})
              </h3>
              <p className="text-xs text-muted-foreground">Enable, disable, or upload mod JAR files to the server</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search mods..."
                  value={modSearch}
                  onChange={(e) => setModSearch(e.target.value)}
                  className="bg-muted/40 border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={() => modUploadInputRef.current?.click()}
                disabled={uploadModMutation.isPending}
                className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Mod (.jar)
              </button>
              <input
                ref={modUploadInputRef}
                type="file"
                accept=".jar"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadModMutation.mutate(e.target.files[0])
                }}
              />
            </div>
          </div>

          {isModsLoading ? (
            <div className="p-12 text-center text-muted-foreground flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Scanning mods folder…
            </div>
          ) : filteredMods.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No matching mods found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMods.map((mod) => (
                <div
                  key={mod.filename}
                  className={cn(
                    'p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all',
                    mod.enabled ? 'bg-muted/20 border-border' : 'bg-muted/5 border-border/40 opacity-60'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground font-mono truncate" title={mod.filename}>
                      {mod.filename.replace('.disabled', '')}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {formatBytes(mod.size)} • {mod.enabled ? <span className="text-emerald-400 font-bold">Enabled</span> : <span className="text-amber-400 font-bold">Disabled (.disabled)</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleModMutation.mutate(mod.filename)}
                      disabled={toggleModMutation.isPending}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1',
                        mod.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400'
                          : 'bg-muted border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400'
                      )}
                      title={mod.enabled ? "Click to disable mod" : "Click to enable mod"}
                    >
                      {mod.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      {mod.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete mod ${mod.filename}?`)) {
                          deleteFileMutation.mutate(`mods/${mod.filename}`)
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PLAYERS & ACCESS */}
      {activeTab === 'players' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Server Operators (Ops) */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2 border-b border-border pb-2">
              <Shield className="h-4 w-4 text-amber-400" /> Server Operators (Ops)
            </h3>
            {((playersData as { ops?: Array<{ name: string; level: number }> } | undefined)?.ops?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4">No ops configured in ops.json</p>
            ) : (
              <div className="space-y-2">
                {((playersData as { ops?: Array<{ name: string; level: number }> } | undefined)?.ops || []).map((op, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border text-xs">
                    <span className="font-bold font-mono text-foreground">{op.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">Level {op.level}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Whitelist */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2 border-b border-border pb-2">
              <Users className="h-4 w-4 text-emerald-400" /> Whitelisted Players
            </h3>
            {((playersData as { whitelist?: Array<{ name: string }> } | undefined)?.whitelist?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4">Whitelist is empty or disabled</p>
            ) : (
              <div className="space-y-2">
                {((playersData as { whitelist?: Array<{ name: string }> } | undefined)?.whitelist || []).map((p, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border text-xs">
                    <span className="font-bold font-mono text-foreground">{p.name}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
