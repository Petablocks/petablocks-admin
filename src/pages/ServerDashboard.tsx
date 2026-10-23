import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
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
  MessageSquare,
  Sparkles,
  Settings,
  ArrowUpCircle,
  ExternalLink,
  FolderPlus,
  Archive,
  Sliders,
  Box,
  Layers,
  Plus,
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
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as any) || 'console'
  const [activeTab, setActiveTab] = useState<'console' | 'files' | 'mods' | 'modpacks' | 'config' | 'modules' | 'players' | 'discord' | 'backups'>(initialTab)

  // Console state
  const [commandInput, setCommandInput] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [mclogsUrl, setMclogsUrl] = useState<string | null>(null)
  const consoleBottomRef = useRef<HTMLDivElement>(null)

  // Files state
  const [currentPath, setCurrentPath] = useState('')
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [fileSaveSuccess, setFileSaveSuccess] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const fileUploadInputRef = useRef<HTMLInputElement>(null)

  // Mods state
  const [modSearch, setModSearch] = useState('')
  const modUploadInputRef = useRef<HTMLInputElement>(null)

  // DiscoPanel Modpack & Safe Update state
  const [modpackQuery, setModpackQuery] = useState('')
  const [modpackIndexer, setModpackIndexer] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [selectedModpack, setSelectedModpack] = useState<ModpackSearchResult | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [targetMcVersion, setTargetMcVersion] = useState('1.21.1')
  const [targetModLoader, setTargetModLoader] = useState('FABRIC')
  const [createBackupFirst, setCreateBackupFirst] = useState(true)
  const [announceInGame, setAnnounceInGame] = useState(true)
  const [recreateContainer, setRecreateContainer] = useState(true)
  const [updateStepsLog, setUpdateStepsLog] = useState<string[]>([])

  // DiscoPanel Config state
  const [configEdits, setConfigEdits] = useState<Record<string, Record<string, any>>>({})
  const [recreateOnSave, setRecreateOnSave] = useState(true)

  // DiscoPanel Sidecar Modules state
  const [newModuleName, setNewModuleName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // Telemetry installer state
  const [restartAfterInstall, setRestartAfterInstall] = useState(true)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configForm, setConfigForm] = useState({
    gatewayUrl: 'wss://admin.petablocks.com/api/minecraft/mod-bridge',
    apiSecretToken: '',
    telemetryIntervalSeconds: 10,
    enableDetailedPlayerMetrics: true,
    enableCreateTrainMetrics: true,
  })

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

  // 6. Fetch Telemetry Status
  const { data: telemetryData, refetch: refetchTelemetry } = useQuery<{
    serverId: string
    serverName: string
    platform: string
    containerName: string
    targetDir: string
    installed: boolean
    installedVersion: string | null
    installedFile: string | null
    latestVersion: string
    status: 'up_to_date' | 'update_available' | 'disabled' | 'not_installed' | 'unknown'
    connected: boolean
    latestRelease: any
    config: any
  }>({
    queryKey: ['server-telemetry', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/telemetry`).then(r => r.json()),
    refetchInterval: 10000,
  })

  // 7. Fetch Modpacks when on modpacks tab
  const { data: modpacksData, isFetching: isSearchingModpacks, refetch: searchModpacks } = useQuery<{ modpacks: ModpackSearchResult[] }>({
    queryKey: ['server-modpacks-search', nodeId, modpackQuery, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/search?nodeId=${encodeURIComponent(nodeId)}&query=${encodeURIComponent(modpackQuery)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: activeTab === 'modpacks',
  })

  const { data: modpackVersionsData, isFetching: isLoadingVersions } = useQuery<{
    versions: Array<{ id: string; displayName: string; versionNumber: string; gameVersions: string[]; modLoader: string; releaseType: string }>
  }>({
    queryKey: ['server-modpack-versions', nodeId, selectedModpack?.id, modpackIndexer],
    queryFn: () =>
      fetch(`/api/server-manager/modpacks/${encodeURIComponent(selectedModpack!.id)}/versions?nodeId=${encodeURIComponent(nodeId)}&indexer=${modpackIndexer}`)
        .then(r => r.json()),
    enabled: Boolean(activeTab === 'modpacks' && selectedModpack?.id),
  })

  // 8. Fetch Server Config (itzg / DiscoPanel ConfigService) when on config tab
  const { data: serverConfigData, isLoading: isConfigLoading, refetch: refetchServerConfig } = useQuery<{
    engine: string
    categories: Array<{
      name: string
      fields: Array<{ key: string; label?: string; value: any; defaultValue?: any; description?: string; type?: string }>
    }>
  }>({
    queryKey: ['server-disco-config', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/config`).then(r => r.json()),
    enabled: activeTab === 'config',
  })

  // 9. Fetch Sidecar Modules when on modules tab
  const { data: modulesData, isLoading: isModulesLoading, refetch: refetchModules } = useQuery<{
    engine: string
    modules: Array<{ id: string; name: string; status: string; templateName?: string; port?: number }>
    templates: Array<{ id: string; name: string; description?: string; image?: string }>
  }>({
    queryKey: ['server-disco-modules', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/modules`).then(r => r.json()),
    enabled: activeTab === 'modules',
  })

  // Sync server defaults into Modpack updater fields
  useEffect(() => {
    if (serverData?.server) {
      setTargetMcVersion(serverData.server.version || '1.21.1')
      setTargetModLoader(serverData.server.type || 'FABRIC')
    }
  }, [serverData?.server])

  // Sync config form state when telemetry data arrives
  useEffect(() => {
    if (telemetryData?.config) {
      setConfigForm({
        gatewayUrl: telemetryData.config.gatewayUrl || telemetryData.config.gateway_url || 'wss://admin.petablocks.com/api/minecraft/mod-bridge',
        apiSecretToken: telemetryData.config.apiSecretToken || telemetryData.config.api_secret_token || '',
        telemetryIntervalSeconds: telemetryData.config.telemetryIntervalSeconds ?? telemetryData.config.telemetry_interval_seconds ?? 10,
        enableDetailedPlayerMetrics: telemetryData.config.enableDetailedPlayerMetrics ?? telemetryData.config.enable_detailed_player_metrics ?? true,
        enableCreateTrainMetrics: telemetryData.config.enableCreateTrainMetrics ?? telemetryData.config.enable_create_train_metrics ?? true,
      })
    }
  }, [telemetryData?.config])

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

  const uploadLogsMclogsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/logs/upload`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to upload logs to mclo.gs')
      return data
    },
    onSuccess: (data) => {
      if (data.url) setMclogsUrl(data.url)
    },
    onError: (err: any) => {
      alert(`mclo.gs upload failed: ${err.message}`)
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

  const createFolderMutation = useMutation({
    mutationFn: async (folderName: string) => {
      const targetPath = currentPath ? `${currentPath}/${folderName}` : folderName
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      })
      return res.json()
    },
    onSuccess: () => {
      setNewFolderName('')
      setShowNewFolderInput(false)
      refetchFiles()
    },
  })

  const extractArchiveMutation = useMutation({
    mutationFn: async (archivePath: string) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/files/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: archivePath }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed')
      return data
    },
    onSuccess: () => {
      refetchFiles()
      alert('Archive extracted successfully!')
    },
    onError: (err: any) => {
      alert(`Extraction failed: ${err.message}`)
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

  // Safe Modpack & Version Update Mutation
  const safeModpackUpdateMutation = useMutation({
    mutationFn: async () => {
      setUpdateStepsLog(['Initiating PETABLOCKS Safe Modpack Update pipeline...'])
      const res = await fetch(`/api/server-manager/servers/${serverId}/modpack-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modpackId: selectedModpack?.id,
          versionId: selectedVersionId,
          indexer: modpackIndexer,
          mcVersion: targetMcVersion,
          modLoader: targetModLoader,
          createBackupFirst,
          announceInGame,
          recreateContainer,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Safe Modpack Update failed')
      return data
    },
    onSuccess: (data) => {
      setUpdateStepsLog(data.steps || ['Update completed!'])
      refetchServer()
      refetchTelemetry()
    },
    onError: (err: any) => {
      setUpdateStepsLog(prev => [...prev, `ERROR: ${err.message}`])
    },
  })

  // Save Server Config Mutation
  const saveServerConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: configEdits,
          recreate: recreateOnSave,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to update server configuration')
      return data
    },
    onSuccess: () => {
      refetchServerConfig()
      refetchServer()
      alert('Server configuration updated!')
    },
    onError: (err: any) => {
      alert(`Config update error: ${err.message}`)
    },
  })

  // Sidecar Module Mutations
  const createModuleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newModuleName,
          templateId: selectedTemplateId,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create sidecar module')
      return data
    },
    onSuccess: () => {
      setNewModuleName('')
      refetchModules()
    },
    onError: (err: any) => {
      alert(`Module error: ${err.message}`)
    },
  })

  const modulePowerMutation = useMutation({
    mutationFn: async ({ moduleId, action }: { moduleId: string; action: 'start' | 'stop' | 'restart' | 'delete' }) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/modules/${moduleId}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Module action failed')
      return data
    },
    onSuccess: () => refetchModules(),
  })

  const installTelemetryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/telemetry/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restartImmediately: restartAfterInstall }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to install/update telemetry')
      return data
    },
    onSuccess: (data) => {
      refetchTelemetry()
      refetchMods()
      if (restartAfterInstall) {
        setTimeout(() => refetchServer(), 3000)
      }
      alert(`PETABLOCKS Telemetry companion successfully deployed (v${data.installedVersion})!`)
    },
    onError: (err: any) => {
      alert(`Installation error: ${err.message}`)
    },
  })

  const saveTelemetryConfigMutation = useMutation({
    mutationFn: async (cfg: typeof configForm) => {
      const res = await fetch(`/api/server-manager/servers/${serverId}/telemetry/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update telemetry config')
      return data
    },
    onSuccess: () => {
      refetchTelemetry()
      setShowConfigModal(false)
      alert('Telemetry companion configuration saved!')
    },
    onError: (err: any) => {
      alert(`Config error: ${err.message}`)
    },
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

  // Discord Webhooks query & mutations
  const { data: discordData, refetch: refetchDiscord } = useQuery({
    queryKey: ['server-discord', serverId],
    queryFn: () => fetch(`/api/server-manager/servers/${serverId}/discord`).then(r => r.json()),
    enabled: activeTab === 'discord',
  })

  const [chatWebhookUrl, setChatWebhookUrl] = useState('')
  const [chatEnabled, setChatEnabled] = useState(false)
  const [consoleWebhookUrl, setConsoleWebhookUrl] = useState('')
  const [consoleEnabled, setConsoleEnabled] = useState(false)
  const [trainWebhookUrl, setTrainWebhookUrl] = useState('')
  const [trainEnabled, setTrainEnabled] = useState(false)
  const [discordSaveSuccess, setDiscordSaveSuccess] = useState(false)
  const [testStatus, setTestStatus] = useState<{ channel?: string; success?: boolean; message?: string } | null>(null)

  useEffect(() => {
    if (discordData?.config) {
      setChatWebhookUrl(discordData.config.chatWebhookUrl || '')
      setChatEnabled(discordData.config.chatEnabled || false)
      setConsoleWebhookUrl(discordData.config.consoleWebhookUrl || '')
      setConsoleEnabled(discordData.config.consoleEnabled || false)
      setTrainWebhookUrl(discordData.config.trainWebhookUrl || '')
      setTrainEnabled(discordData.config.trainEnabled || false)
    }
  }, [discordData])

  const saveDiscordMutation = useMutation({
    mutationFn: async () => {
      setDiscordSaveSuccess(false)
      const res = await fetch(`/api/server-manager/servers/${serverId}/discord`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatWebhookUrl,
          chatEnabled,
          consoleWebhookUrl,
          consoleEnabled,
          trainWebhookUrl,
          trainEnabled,
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      setDiscordSaveSuccess(true)
      refetchDiscord()
      setTimeout(() => setDiscordSaveSuccess(false), 3000)
    },
  })

  const testDiscordMutation = useMutation({
    mutationFn: async (channelType: 'chat' | 'console' | 'train') => {
      setTestStatus(null)
      const res = await fetch(`/api/server-manager/servers/${serverId}/discord/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send test message')
      return { channelType, ...data }
    },
    onSuccess: (res) => {
      setTestStatus({ channel: res.channelType, success: true, message: res.message })
      setTimeout(() => setTestStatus(null), 5000)
    },
    onError: (err: any) => {
      setTestStatus({ success: false, message: err.message })
      setTimeout(() => setTestStatus(null), 6000)
    },
  })

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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className={cn('text-xl sm:text-2xl font-bold tracking-tight', server.color || 'text-foreground')}>
              {server.name}
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
              {server.type} {server.version}
            </span>
            {serverData?.engine === 'discopanel' && (
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                DiscoPanel RPC
              </span>
            )}
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
            Node: {node?.name} ({node?.host}) • Game Port: {server.gamePort} • Container: {server.containerName}
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
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'console' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Terminal className="h-4 w-4" /> Console
        </button>
        <button
          onClick={() => { setActiveTab('modpacks'); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'modpacks' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Layers className="h-4 w-4 text-amber-400" /> Modpacks &amp; Updates
        </button>
        <button
          onClick={() => { setActiveTab('mods'); refetchMods(); refetchTelemetry(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all relative shrink-0',
            activeTab === 'mods' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Package className="h-4 w-4" /> Mods &amp; Plugins ({modsData?.mods?.length || 0})
          {telemetryData?.status === 'update_available' && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" title="Telemetry update available" />
          )}
        </button>
        <button
          onClick={() => { setActiveTab('files'); refetchFiles() }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'files' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <FolderOpen className="h-4 w-4" /> Files &amp; Archives
        </button>
        <button
          onClick={() => { setActiveTab('config'); refetchServerConfig(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'config' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Sliders className="h-4 w-4 text-cyan-400" /> Server Config
        </button>
        <button
          onClick={() => { setActiveTab('modules'); refetchModules(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'modules' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Box className="h-4 w-4 text-emerald-400" /> Sidecar Modules
        </button>
        <button
          onClick={() => { setActiveTab('players'); refetchPlayers(); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'players' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" /> Players
        </button>
        <button
          onClick={() => { setActiveTab('discord'); setEditingFile(null) }}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all shrink-0',
            activeTab === 'discord' ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <MessageSquare className="h-4 w-4 text-indigo-400" /> Discord
        </button>
        <Link
          to="/backups"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all ml-auto shrink-0"
        >
          <ArchiveRestore className="h-4 w-4 text-sky-400" /> Backups &rarr;
        </Link>
      </div>

      {/* TAB 1: LIVE CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-3">
          {mclogsUrl && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-400">
              <span>Logs uploaded to mclo.gs for crash analysis: <strong className="font-mono">{mclogsUrl}</strong></span>
              <a
                href={mclogsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 font-bold flex items-center gap-1"
              >
                Open Link <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

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
                <button
                  onClick={() => uploadLogsMclogsMutation.mutate()}
                  disabled={uploadLogsMclogsMutation.isPending}
                  className="px-2 py-0.5 rounded bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-[10px] font-bold flex items-center gap-1"
                  title="Share sanitized console log via mclo.gs"
                >
                  {uploadLogsMclogsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                  Share to mclo.gs
                </button>
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

      {/* TAB 2: DISCOPANEL MODPACKS & SAFE VERSION UPDATER */}
      {activeTab === 'modpacks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Modpack Browser (7 cols) */}
          <div className="lg:col-span-7 bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  <Layers className="h-5 w-5 text-amber-400" /> Modpack Browser (Modrinth &amp; CurseForge)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Browse modpacks or select a new version to deploy onto <strong className="text-foreground">{server.name}</strong>
                </p>
              </div>
              <div className="flex rounded-xl bg-muted/50 border border-border p-0.5 self-start">
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
                  placeholder={`Search ${modpackIndexer === 'modrinth' ? 'Modrinth' : 'CurseForge'} modpacks (e.g. Create, Cobblemon, Prominence)...`}
                  value={modpackQuery}
                  onChange={(e) => setModpackQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchModpacks()}
                  className="w-full bg-muted/40 border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={() => searchModpacks()}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              >
                Search
              </button>
            </div>

            {/* Results List */}
            {isSearchingModpacks ? (
              <div className="py-12 text-center text-muted-foreground flex items-center justify-center gap-2 text-xs">
                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Querying {modpackIndexer} indexer…
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {(modpacksData?.modpacks || []).map((mp) => {
                  const isSelected = selectedModpack?.id === mp.id
                  return (
                    <div
                      key={mp.id}
                      onClick={() => {
                        setSelectedModpack(mp)
                        setSelectedVersionId('')
                        if (mp.gameVersions?.[0]) setTargetMcVersion(mp.gameVersions[0])
                        if (mp.modLoaders?.[0]) setTargetModLoader(mp.modLoaders[0].toUpperCase())
                      }}
                      className={cn(
                        'p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all text-xs',
                        isSelected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-muted/15 hover:bg-muted/30'
                      )}
                    >
                      {mp.logoUrl ? (
                        <img src={mp.logoUrl} alt={mp.name} className="w-11 h-11 rounded-xl object-cover shrink-0 bg-muted" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{mp.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                            {(mp.downloads || 0).toLocaleString()} downloads
                          </span>
                        </div>
                        <p className="text-muted-foreground line-clamp-2 leading-relaxed">{mp.summary}</p>
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {(mp.modLoaders || []).slice(0, 3).map(l => (
                            <span key={l} className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                              {l}
                            </span>
                          ))}
                          {(mp.gameVersions || []).slice(0, 3).map(v => (
                            <span key={v} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Safe Modpack & Version Update Pipeline (5 cols) */}
          <div className="lg:col-span-5 bg-card rounded-2xl border border-border p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-border pb-3">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                  <Shield className="h-4 w-4" /> Safe Update Pipeline
                </div>
                <h3 className="font-bold text-base text-foreground mt-0.5">
                  Modpack &amp; Runtime Version Updater
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Performs a pre-update MinIO S3 world snapshot, flushes chunks, updates the DiscoPanel container spec, and verifies the PETABLOCKS Telemetry Companion.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {selectedModpack ? (
                  <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">Target Modpack: {selectedModpack.name}</span>
                      <button
                        onClick={() => setSelectedModpack(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Modpack Release Version</label>
                      <select
                        value={selectedVersionId}
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground"
                      >
                        <option value="">Latest Recommended Release</option>
                        {isLoadingVersions ? (
                          <option disabled>Loading versions...</option>
                        ) : (
                          (modpackVersionsData?.versions || []).map(v => (
                            <option key={v.id} value={v.id}>
                              {v.displayName || v.versionNumber} ({(v.gameVersions || []).slice(0, 2).join(', ')})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-muted/30 border border-border text-muted-foreground text-xs">
                    Select a modpack on the left to switch/upgrade modpack releases, or update the Minecraft version &amp; mod loader directly below.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Minecraft Version</label>
                    <input
                      type="text"
                      value={targetMcVersion}
                      onChange={(e) => setTargetMcVersion(e.target.value)}
                      className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground"
                      placeholder="1.21.1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Mod Loader</label>
                    <select
                      value={targetModLoader}
                      onChange={(e) => setTargetModLoader(e.target.value)}
                      className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground"
                    >
                      <option value="FABRIC">FABRIC</option>
                      <option value="NEOFORGE">NEOFORGE</option>
                      <option value="FORGE">FORGE</option>
                      <option value="PAPER">PAPER</option>
                      <option value="VANILLA">VANILLA</option>
                    </select>
                  </div>
                </div>

                {/* Safety Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createBackupFirst}
                      onChange={(e) => setCreateBackupFirst(e.target.checked)}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-foreground font-medium">Take pre-update MinIO S3 world backup first (Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={announceInGame}
                      onChange={(e) => setAnnounceInGame(e.target.checked)}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-foreground font-medium">Broadcast in-game `/tellraw` notice &amp; `/save-all flush`</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={recreateContainer}
                      onChange={(e) => setRecreateContainer(e.target.checked)}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-foreground font-medium">Recreate &amp; restart Docker container immediately</span>
                  </label>
                </div>

                {/* Execution Step Log */}
                {updateStepsLog.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#0c1017] border border-border font-mono text-[11px] space-y-1 text-emerald-400">
                    {updateStepsLog.map((step, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span>&rarr;</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm(`Run Safe Update on ${server.name}? ${createBackupFirst ? 'A full MinIO S3 backup will be created before applying changes.' : ''}`)) {
                  safeModpackUpdateMutation.mutate()
                }
              }}
              disabled={safeModpackUpdateMutation.isPending}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              {safeModpackUpdateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running Safe Update Pipeline…</>
              ) : (
                <><ArrowUpCircle className="h-4 w-4" /> Execute Safe Modpack &amp; Version Update</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: FILE MANAGER & ARCHIVES */}
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
              <div className="p-3.5 bg-muted/20 border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs">
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
                  {showNewFolderInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Folder name..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-mono"
                      />
                      <button
                        onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black font-bold text-xs"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setShowNewFolderInput(false)}
                        className="px-2 py-1 rounded-lg bg-muted text-muted-foreground text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewFolderInput(true)}
                      className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <FolderPlus className="h-3.5 w-3.5 text-amber-400" /> New Folder
                    </button>
                  )}

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
                        const isArchive = !item.isDir && (item.name.endsWith('.zip') || item.name.endsWith('.tar.gz') || item.name.endsWith('.tgz'))

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
                                {isArchive && (
                                  <button
                                    onClick={() => extractArchiveMutation.mutate(itemPath)}
                                    disabled={extractArchiveMutation.isPending}
                                    className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1"
                                    title="Extract Archive Here"
                                  >
                                    <Archive className="h-3 w-3" /> Extract
                                  </button>
                                )}
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

      {/* TAB 4: MODS & PLUGINS MANAGER */}
      {activeTab === 'mods' && (
        <div className="space-y-4">
          {/* PETABLOCKS Telemetry Companion Hero Card */}
          <div className="bg-gradient-to-r from-primary/10 via-card to-card border border-primary/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="p-2 rounded-xl bg-primary/20 text-primary border border-primary/30">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                      PETABLOCKS Telemetry Companion
                      <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-md bg-primary/20 border border-primary/30 text-primary">
                        {telemetryData?.platform?.toUpperCase() || 'MOD'}
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      High-throughput live metrics bridge (TPS, MSPT, RAM, Entities, Create Trains &amp; Discord Chat)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1 flex-wrap text-xs">
                  {telemetryData?.status === 'up_to_date' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold font-mono">
                      <CheckCircle2 className="h-3.5 w-3.5" /> v{telemetryData.installedVersion} (Latest)
                    </span>
                  )}
                  {telemetryData?.status === 'update_available' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold font-mono animate-pulse">
                      <ArrowUpCircle className="h-3.5 w-3.5" /> Update: v{telemetryData.installedVersion} &rarr; v{telemetryData.latestVersion}
                    </span>
                  )}
                  {telemetryData?.status === 'not_installed' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 font-bold font-mono">
                      Not Installed (Latest: v{telemetryData?.latestVersion || '1.6.1'})
                    </span>
                  )}
                  {telemetryData?.status === 'disabled' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold font-mono">
                      Disabled ({telemetryData.installedFile})
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border font-mono text-[11px]">
                    <span className={cn("h-2 w-2 rounded-full", telemetryData?.connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500")} />
                    Bridge: {telemetryData?.connected ? <span className="text-emerald-400 font-bold">Connected</span> : 'Disconnected'}
                  </span>

                  {telemetryData?.installedFile && (
                    <span className="text-muted-foreground font-mono text-[11px] truncate max-w-[240px]" title={telemetryData.installedFile}>
                      File: {telemetryData.installedFile}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none bg-muted/30 px-3 py-2 rounded-xl border border-border/60">
                  <input
                    type="checkbox"
                    checked={restartAfterInstall}
                    onChange={(e) => setRestartAfterInstall(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-0"
                  />
                  <span>Restart server on install</span>
                </label>

                <button
                  onClick={() => setShowConfigModal(true)}
                  className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl border border-border flex items-center justify-center gap-1.5 transition-colors"
                  title="Edit Telemetry Configuration (Gateway URL, Secret, Interval)"
                >
                  <Settings className="h-3.5 w-3.5" /> Config
                </button>

                <button
                  onClick={() => installTelemetryMutation.mutate()}
                  disabled={installTelemetryMutation.isPending}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md",
                    telemetryData?.status === 'update_available'
                      ? "bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20"
                  )}
                >
                  {installTelemetryMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Deploying...
                    </>
                  ) : telemetryData?.status === 'update_available' ? (
                    <>
                      <ArrowUpCircle className="h-4 w-4" />
                      1-Click Update to v{telemetryData.latestVersion}
                    </>
                  ) : telemetryData?.status === 'not_installed' ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Install Companion v{telemetryData?.latestVersion || '1.6.1'}
                    </>
                  ) : (
                    <>
                      <RotateCw className="h-3.5 w-3.5" />
                      Re-deploy v{telemetryData?.latestVersion || '1.6.1'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Regular Installed Mods List */}
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
        </div>
      )}

      {/* TAB 5: SERVER CONFIG (ITZG / DISCOPANEL CONFIGSERVICE) */}
      {activeTab === 'config' && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Sliders className="h-5 w-5 text-cyan-400" /> Container &amp; `itzg/minecraft-server` Configuration
              </h3>
              <p className="text-xs text-muted-foreground">
                Inspect and edit Docker environment variables and server runtime properties managed by DiscoPanel
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={recreateOnSave}
                  onChange={(e) => setRecreateOnSave(e.target.checked)}
                  className="rounded border-border text-primary"
                />
                <span>Recreate container on save</span>
              </label>
              <button
                onClick={() => saveServerConfigMutation.mutate()}
                disabled={saveServerConfigMutation.isPending}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5"
              >
                {saveServerConfigMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save &amp; Apply Config
              </button>
            </div>
          </div>

          {isConfigLoading ? (
            <div className="p-12 text-center text-muted-foreground flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading container configuration…
            </div>
          ) : (
            <div className="space-y-6">
              {(serverConfigData?.categories || []).map((cat) => (
                <div key={cat.name} className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary font-mono border-b border-border/60 pb-1.5">
                    {cat.name}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cat.fields.map((field) => {
                      const currentVal = configEdits[cat.name]?.[field.key] !== undefined
                        ? configEdits[cat.name][field.key]
                        : field.value
                      return (
                        <div key={field.key} className="p-3 rounded-xl bg-muted/20 border border-border space-y-1 text-xs">
                          <label className="font-mono font-bold text-foreground block">{field.label || field.key}</label>
                          {field.description && (
                            <p className="text-[10px] text-muted-foreground">{field.description}</p>
                          )}
                          <input
                            type="text"
                            value={String(currentVal ?? '')}
                            onChange={(e) =>
                              setConfigEdits(prev => ({
                                ...prev,
                                [cat.name]: { ...(prev[cat.name] || {}), [field.key]: e.target.value },
                              }))
                            }
                            className="w-full bg-background/80 border border-border rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SIDECAR MODULES (DISCOPANEL MODULESERVICE) */}
      {activeTab === 'modules' && (
        <div className="space-y-5">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  <Box className="h-5 w-5 text-emerald-400" /> Sidecar Container Modules
                </h3>
                <p className="text-xs text-muted-foreground">
                  Attach companion sidecar services (BlueMap, Geyser, Voice Chat, RCON web) to <strong className="text-foreground">{server.name}</strong> via DiscoPanel ModuleService
                </p>
              </div>
            </div>

            {/* Create Module Bar */}
            {(modulesData?.templates || []).length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl bg-muted/20 border border-border text-xs">
                <input
                  type="text"
                  placeholder="Module name (e.g. BlueMap 3D Map)..."
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground"
                />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground font-mono"
                >
                  <option value="">Select Module Template...</option>
                  {(modulesData?.templates || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => createModuleMutation.mutate()}
                  disabled={!newModuleName || !selectedTemplateId || createModuleMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Deploy Sidecar
                </button>
              </div>
            )}

            {isModulesLoading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center text-xs">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Querying sidecar modules…
              </div>
            ) : (modulesData?.modules || []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs space-y-1">
                <p className="font-semibold text-foreground">No sidecar modules attached to this server yet.</p>
                <p>When the DiscoPanel agent is active on {node?.name}, you can deploy BlueMap, Geyser, or custom companion containers in 1 click.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(modulesData?.modules || []).map(mod => (
                  <div key={mod.id} className="p-3.5 rounded-xl bg-muted/20 border border-border flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-foreground">{mod.name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">Status: {mod.status}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => modulePowerMutation.mutate({ moduleId: mod.id, action: 'restart' })}
                        className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-semibold border border-border"
                      >
                        Restart
                      </button>
                      <button
                        onClick={() => modulePowerMutation.mutate({ moduleId: mod.id, action: 'stop' })}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/30"
                      >
                        Stop
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: PLAYERS & ACCESS */}
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

      {/* TAB 8: DISCORD WEBHOOKS */}
      {activeTab === 'discord' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-base text-foreground flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-400" /> Discord Fleet Integration
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Configure dedicated webhooks for in-game chat broadcasts and server console/lifecycle alerts for <strong className="text-foreground">{server.name}</strong>.
              </p>
            </div>
            <button
              onClick={() => saveDiscordMutation.mutate()}
              disabled={saveDiscordMutation.isPending}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto disabled:opacity-50"
            >
              {saveDiscordMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : discordSaveSuccess ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {discordSaveSuccess ? 'Saved Successfully!' : 'Save Webhooks'}
            </button>
          </div>

          {/* Test Status Alert */}
          {testStatus && (
            <div
              className={cn(
                'p-3.5 rounded-xl border text-xs flex items-center gap-2 font-mono transition-all',
                testStatus.success
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              )}
            >
              {testStatus.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{testStatus.message}</span>
            </div>
          )}

          {/* Webhook Configuration Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: In-Game Chat Channel */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                    <h3 className="font-bold text-sm text-foreground">In-Game Server Chat</h3>
                  </div>
                  <button
                    onClick={() => setChatEnabled(!chatEnabled)}
                    className="flex items-center gap-1.5 text-xs font-medium"
                  >
                    {chatEnabled ? (
                      <ToggleRight className="h-6 w-6 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className={cn('text-[11px] font-mono', chatEnabled ? 'text-emerald-400' : 'text-muted-foreground')}>
                      {chatEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Broadcasts player chat messages with custom player avatar heads, join and leave announcements, and death events into your Discord chat channel.
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Discord Webhook URL
                  </label>
                  <input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={chatWebhookUrl}
                    onChange={(e) => setChatWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border text-xs font-mono text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => testDiscordMutation.mutate('chat')}
                  disabled={!chatWebhookUrl || testDiscordMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send Test Chat
                </button>
                <span className="text-[10px] text-muted-foreground font-mono">1-way broadcast</span>
              </div>
            </div>

            {/* Card 2: Server Console & Lifecycle Alerts */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                    <h3 className="font-bold text-sm text-foreground">Console &amp; Lifecycle Alerts</h3>
                  </div>
                  <button
                    onClick={() => setConsoleEnabled(!consoleEnabled)}
                    className="flex items-center gap-1.5 text-xs font-medium"
                  >
                    {consoleEnabled ? (
                      <ToggleRight className="h-6 w-6 text-indigo-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className={cn('text-[11px] font-mono', consoleEnabled ? 'text-indigo-400' : 'text-muted-foreground')}>
                      {consoleEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sends rich embeds for server lifecycle events (starting, ready, stopping, restarts), crash alerts, and executed admin RCON commands to your private console channel.
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Discord Webhook URL
                  </label>
                  <input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={consoleWebhookUrl}
                    onChange={(e) => setConsoleWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border text-xs font-mono text-foreground focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => testDiscordMutation.mutate('console')}
                  disabled={!consoleWebhookUrl || testDiscordMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold border border-indigo-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send Test Alert
                </button>
                <span className="text-[10px] text-muted-foreground font-mono">Lifecycle &amp; Admin</span>
              </div>
            </div>

            {/* Card 3: Create Train & Railway Dispatch */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4 flex flex-col justify-between md:col-span-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
                    <h3 className="font-bold text-sm text-foreground">🚂 Create Train &amp; Railway Dispatch</h3>
                  </div>
                  <button
                    onClick={() => setTrainEnabled(!trainEnabled)}
                    className="flex items-center gap-1.5 text-xs font-medium"
                  >
                    {trainEnabled ? (
                      <ToggleRight className="h-6 w-6 text-purple-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    )}
                    <span className={cn('text-[11px] font-mono', trainEnabled ? 'text-purple-400' : 'text-muted-foreground')}>
                      {trainEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pipes Create mod railway telemetry: train assemblies, station arrivals &amp; schedule stops, signal deadlocks, collisions, and derailment crash alerts into your community train dispatch channel.
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Discord Webhook URL
                  </label>
                  <input
                    type="password"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={trainWebhookUrl}
                    onChange={(e) => setTrainWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border text-xs font-mono text-foreground focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => testDiscordMutation.mutate('train')}
                  disabled={!trainWebhookUrl || testDiscordMutation.isPending}
                  className="px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold border border-purple-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send Test Train Dispatch
                </button>
                <span className="text-[10px] text-muted-foreground font-mono">Create: Steam &apos;n Rails</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">Telemetry Companion Config</h3>
                  <p className="text-[11px] text-muted-foreground">{server.name} ({telemetryData?.platform?.toUpperCase()})</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold p-1.5 rounded-lg hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-foreground block mb-1">Gateway WebSocket URL</label>
                <input
                  type="text"
                  value={configForm.gatewayUrl}
                  onChange={(e) => setConfigForm({ ...configForm, gatewayUrl: e.target.value })}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                  placeholder="wss://admin.petablocks.com/api/minecraft/mod-bridge"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Endpoint where live TPS, RAM, entity counts and chat packets are sent.</p>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">API Secret Token</label>
                <input
                  type="password"
                  value={configForm.apiSecretToken}
                  onChange={(e) => setConfigForm({ ...configForm, apiSecretToken: e.target.value })}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                  placeholder="Secret token matching TELEMETRY_API_SECRET"
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Telemetry Broadcast Interval (Seconds)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={configForm.telemetryIntervalSeconds}
                  onChange={(e) => setConfigForm({ ...configForm, telemetryIntervalSeconds: parseInt(e.target.value) || 10 })}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-2 space-y-2 border-t border-border/50">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={configForm.enableDetailedPlayerMetrics}
                    onChange={(e) => setConfigForm({ ...configForm, enableDetailedPlayerMetrics: e.target.checked })}
                    className="rounded border-border text-primary"
                  />
                  <span className="font-medium text-foreground">Detailed Player Metrics (IP GeoIP forwarding &amp; ping)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={configForm.enableCreateTrainMetrics}
                    onChange={(e) => setConfigForm({ ...configForm, enableCreateTrainMetrics: e.target.checked })}
                    className="rounded border-border text-primary"
                  />
                  <span className="font-medium text-foreground">Create Train Metrics (Create Mod Railway telemetry)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => saveTelemetryConfigMutation.mutate(configForm)}
                disabled={saveTelemetryConfigMutation.isPending}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saveTelemetryConfigMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
