import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  Check,
  Copy,
  Terminal,
  Zap,
  Layers,
  ChevronDown,
} from 'lucide-react'

interface LogEntry {
  id: string
  timeStr: string
  thread: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'DEBUG'
  logger: string
  message: string
  raw: string
  serverId: string
  serverName: string
}

interface FleetLogsResponse {
  success: boolean
  summary: {
    totalFound: number
    countsByServer: Record<string, number>
    countsBySeverity: Record<string, number>
    incidents: {
      lag: number
      train: number
      crashes: number
      disconnects: number
      memory: number
    }
    scannedServers: Array<{ id: string; name: string; node: string }>
  }
  logs: LogEntry[]
}

const SERVER_OPTIONS = [
  { id: 'fabric-main', name: 'Fabric Main', node: 'MCS-01', color: 'emerald' },
  { id: 'create-2', name: 'Create 2 SMP', node: 'MCS-02', color: 'sky' },
  { id: 'patreon-creative', name: 'Patreon Creative', node: 'MCS-03', color: 'purple' },
]

export default function FleetLogsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [selectedServers, setSelectedServers] = useState<string[]>([
    'fabric-main',
    'create-2',
    'patreon-creative',
  ])
  const [severity, setSeverity] = useState<string>('ALL')
  const [limit, setLimit] = useState<number>(150)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Query fleet logs
  const { data, isLoading, refetch, isFetching } = useQuery<FleetLogsResponse>({
    queryKey: ['fleet-logs', debouncedQuery, isRegex, selectedServers, severity, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        query: debouncedQuery,
        isRegex: String(isRegex),
        servers: selectedServers.join(','),
        severity,
        limit: String(limit),
      })
      const res = await fetch(`/api/server-manager/logs/fleet-search?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to query fleet logs')
      return res.json()
    },
    refetchInterval: autoRefresh ? 8000 : false,
  })

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setDebouncedQuery(searchQuery)
  }

  const handleIncidentChip = (pattern: string, regexMode: boolean = false) => {
    setSearchQuery(pattern)
    setIsRegex(regexMode)
    setDebouncedQuery(pattern)
  }

  const toggleServer = (serverId: string) => {
    if (selectedServers.includes(serverId)) {
      if (selectedServers.length === 1) return // Keep at least one
      setSelectedServers(selectedServers.filter((s) => s !== serverId))
    } else {
      setSelectedServers([...selectedServers, serverId])
    }
  }

  const copyLogLine = (raw: string, id: string) => {
    navigator.clipboard.writeText(raw)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const exportLogs = (format: 'json' | 'csv') => {
    if (!data?.logs) return
    let content = ''
    let mimeType = ''
    let filename = `petablocks-fleet-logs-${Date.now()}`

    if (format === 'json') {
      content = JSON.stringify(data.logs, null, 2)
      mimeType = 'application/json'
      filename += '.json'
    } else {
      const headers = ['Timestamp', 'Server', 'Level', 'Thread', 'Message']
      const rows = data.logs.map((l) => [
        `"${l.timeStr}"`,
        `"${l.serverName}"`,
        `"${l.level}"`,
        `"${l.thread}"`,
        `"${l.message.replace(/"/g, '""')}"`,
      ])
      content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      mimeType = 'text/csv'
      filename += '.csv'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      case 'WARN':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      case 'DEBUG':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      default:
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    }
  }

  const getServerBadge = (serverId: string) => {
    switch (serverId) {
      case 'fabric-main':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'create-2':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
      case 'patreon-creative':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30 mb-2">
            <Terminal size={14} /> Multi-Node Diagnostics
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Fleet Log Search & Incident Inspector
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time cross-cluster log analysis across MCS-01, MCS-02, and MCS-03 nodes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
              autoRefresh
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                : 'bg-card text-muted-foreground border-border hover:text-white'
            }`}
          >
            <RefreshCw size={13} className={autoRefresh ? 'animate-spin' : ''} />
            <span>{autoRefresh ? 'Live Polling (8s)' : 'Auto-Refresh Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="px-3.5 py-2 rounded-xl bg-card hover:bg-muted border border-border text-white text-xs font-bold transition-all flex items-center gap-2"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-sky-400' : ''} />
            <span>Refresh</span>
          </button>

          <div className="relative group">
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-black transition-all flex items-center gap-1.5"
            >
              <Download size={13} />
              <span>Export</span>
              <ChevronDown size={12} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-xl shadow-xl overflow-hidden hidden group-hover:block z-20">
              <button
                type="button"
                onClick={() => exportLogs('json')}
                className="w-full text-left px-3.5 py-2 text-xs text-white hover:bg-muted font-mono"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => exportLogs('csv')}
                className="w-full text-left px-3.5 py-2 text-xs text-white hover:bg-muted font-mono"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Matches Found</span>
            <span className="text-xl font-black text-white font-mono">{data.summary.totalFound}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Errors & Fatal</span>
            <span className="text-xl font-black text-rose-400 font-mono">
              {(data.summary.countsBySeverity.ERROR || 0) + (data.summary.countsBySeverity.FATAL || 0)}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Warnings</span>
            <span className="text-xl font-black text-amber-400 font-mono">
              {data.summary.countsBySeverity.WARN || 0}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Lag / Overload</span>
            <span className="text-xl font-black text-yellow-300 font-mono">
              {data.summary.incidents.lag}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Train Events</span>
            <span className="text-xl font-black text-sky-400 font-mono">
              {data.summary.incidents.train}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-card border border-border/60">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Disconnects</span>
            <span className="text-xl font-black text-purple-400 font-mono">
              {data.summary.incidents.disconnects}
            </span>
          </div>
        </div>
      )}

      {/* Query Bar & Controls */}
      <div className="p-5 rounded-2xl bg-card border border-border/80 space-y-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fleet logs (e.g. player name, 'Can\'t keep up', 'NullPointerException', mod ID)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border/80 text-white text-xs placeholder:text-muted-foreground focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs uppercase tracking-wider transition-all shrink-0"
          >
            Search Logs
          </button>
        </form>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
          {/* Server Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground mr-1 flex items-center gap-1">
              <Layers size={13} /> Servers:
            </span>
            {SERVER_OPTIONS.map((srv) => {
              const isSelected = selectedServers.includes(srv.id)
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => toggleServer(srv.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                      : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-white'
                  }`}
                >
                  <span>{srv.name}</span>
                  <span className="text-[9px] font-mono px-1 rounded bg-black/40 text-gray-400">
                    {srv.node}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Severity & Regex Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 bg-background border border-border/60 rounded-xl p-0.5">
              {['ALL', 'INFO', 'WARN', 'ERROR'].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSeverity(lvl)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                    severity === lvl
                      ? 'bg-muted text-white shadow-sm'
                      : 'text-muted-foreground hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Regex Switch */}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-muted-foreground hover:text-white select-none">
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setIsRegex(e.target.checked)}
                className="rounded border-border bg-background text-sky-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>Regex Mode</span>
            </label>

            {/* Lines Limit */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Limit:</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="bg-background border border-border/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value={50}>50</option>
                <option value={150}>150</option>
                <option value={300}>300</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Incident Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1 flex items-center gap-1">
            <Zap size={11} /> Quick Incident Chips:
          </span>
          <button
            type="button"
            onClick={() => handleIncidentChip("Can't keep up|Overloaded|ms behind|tick took", true)}
            className="px-2.5 py-0.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[11px] font-bold transition-all"
          >
            ⏱️ Lag & Tick Spikes
          </button>
          <button
            type="button"
            onClick={() => handleIncidentChip('train|carriage|track|derail|signal|station', true)}
            className="px-2.5 py-0.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-bold transition-all"
          >
            🚂 Train & Track Events
          </button>
          <button
            type="button"
            onClick={() => handleIncidentChip('Exception|CrashReport|FATAL|NullPointerException', true)}
            className="px-2.5 py-0.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-all"
          >
            💥 Crashes & Exceptions
          </button>
          <button
            type="button"
            onClick={() => handleIncidentChip('lost connection|timed out|disconnect|kicked', true)}
            className="px-2.5 py-0.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition-all"
          >
            🔌 Player Disconnects
          </button>
          <button
            type="button"
            onClick={() => handleIncidentChip('memory|OutOfMemory|garbage collector|GC|heap', true)}
            className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all"
          >
            🧠 Memory & GC Pressure
          </button>
        </div>
      </div>

      {/* Log Output Stream */}
      <div className="rounded-2xl bg-black/90 border border-border/80 overflow-hidden shadow-2xl">
        <div className="px-4 py-3 bg-neutral-900/90 border-b border-border/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-mono text-gray-300">
            <Terminal size={14} className="text-sky-400" />
            <span>Multi-Node Log Stream</span>
            {isFetching && <span className="text-sky-400 animate-pulse text-[11px]">(Fetching...)</span>}
          </div>
          <span className="font-mono text-[11px] text-gray-400">
            {data?.logs ? `${data.logs.length} lines rendered` : 'Idle'}
          </span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs font-mono">
            <RefreshCw className="animate-spin text-sky-400" size={24} />
            <span>Scanning Minecraft logs across cluster nodes...</span>
          </div>
        ) : !data?.logs || data.logs.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs font-mono">
            <FileText size={28} className="text-gray-600" />
            <span>No log entries matched your filter parameters.</span>
          </div>
        ) : (
          <div className="divide-y divide-white/5 font-mono text-[11px] max-h-[680px] overflow-y-auto">
            {data.logs.map((log) => (
              <div
                key={log.id}
                className="group px-4 py-2 hover:bg-white/[0.04] transition-colors flex items-start gap-3 relative"
              >
                {/* Time */}
                <span className="text-gray-500 shrink-0 select-none pt-0.5 w-16">
                  {log.timeStr}
                </span>

                {/* Server Badge */}
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 border select-none ${getServerBadge(
                    log.serverId
                  )}`}
                >
                  {log.serverName.replace('PETABLOCKS ', '')}
                </span>

                {/* Level Badge */}
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 border select-none ${getLevelBadge(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>

                {/* Thread & Message */}
                <div className="min-w-0 flex-1 break-words">
                  {log.thread !== 'System' && (
                    <span className="text-gray-500 mr-2 select-none">[{log.thread}]</span>
                  )}
                  <span
                    className={
                      log.level === 'ERROR' || log.level === 'FATAL'
                        ? 'text-rose-300 font-semibold'
                        : log.level === 'WARN'
                        ? 'text-amber-200'
                        : 'text-gray-200'
                    }
                  >
                    {log.message}
                  </span>
                </div>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={() => copyLogLine(log.raw, log.id)}
                  title="Copy log line"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white shrink-0"
                >
                  {copiedId === log.id ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
