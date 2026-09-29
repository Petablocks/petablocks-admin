import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone,
  Send,
  Radio,
  Clock,
  Sparkles,
  Settings,
  X,
  ExternalLink,
  Check,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Announcement {
  id: number
  title: string
  description: string
  category: 'update' | 'maintenance' | 'downtime' | 'event' | 'general'
  pingRole: string
  url?: string | null
  imageUrl?: string | null
  targetServers: string[]
  sendDiscord: boolean
  sendIngame: boolean
  discordSent: boolean
  ingameSent: boolean
  createdBy: string
  createdAt: string
}

interface AnnouncementConfig {
  announcementWebhookUrl: string
  announcementChannelId: string
  defaultPingRole: string
  enabled: boolean
}

const TEMPLATES = [
  {
    name: 'Modrinth Server Release',
    category: 'update' as const,
    title: 'PETABLOCKS: Create 2 is Now on Modrinth! ⚙️',
    description:
      'Getting into Just Create SMP 2 just got 10x faster! We are now officially listed on Modrinth with automatic 1-click modpack downloading.\n\nPlay directly from the Modrinth App or Prism Launcher and join the rails!',
    url: 'https://modrinth.com/server/petablocks-create-2',
    imageUrl: 'https://cdn.modrinth.com/data/t3dTlg2d/images/318213ad3a9a4485857aa92e85bcdda1da55bd2f.png',
    pingRole: '@everyone',
    targetServers: ['all'],
  },
  {
    name: 'Unplanned Downtime / Incident',
    category: 'downtime' as const,
    title: '🚨 Emergency Service Interruption',
    description:
      'We are currently investigating unexpected connection timeouts affecting player sessions. Our infrastructure engineers are actively working to restore services.',
    url: 'https://status.petablocks.com',
    imageUrl: '',
    pingRole: '@everyone',
    targetServers: ['all'],
  },
  {
    name: 'Scheduled Maintenance Notice',
    category: 'maintenance' as const,
    title: '🛠️ Scheduled Fleet Maintenance & Engine Upgrade',
    description:
      'Routine maintenance is scheduled to deploy performance hotfixes and backup world saves. Downtime is expected to be under 30 minutes.',
    url: '',
    imageUrl: '',
    pingRole: '@here',
    targetServers: ['create-2', 'lobby-main'],
  },
  {
    name: 'Community Event Announcement',
    category: 'event' as const,
    title: '🎉 High-Speed Train Grand Prix & Community Gathering',
    description:
      'All engineers to stations! We are hosting a community train race showcase on Create 2. Bring your best rolling stock contraptions!',
    url: 'https://map.petablocks.com',
    imageUrl: '',
    pingRole: '@everyone',
    targetServers: ['create-2'],
  },
]

const SERVER_OPTIONS = [
  { id: 'all', label: 'All Fleet Realms' },
  { id: 'create-2', label: 'Just Create SMP 2' },
  { id: 'lobby-main', label: 'Central Hub Lobby' },
  { id: 'patreon-creative', label: 'Patreon Creative' },
]

export default function AnnouncementsPage() {
  const queryClient = useQueryClient()

  // Form State
  const [title, setTitle] = useState('PETABLOCKS: Create 2 is Now on Modrinth! ⚙️')
  const [description, setDescription] = useState(
    'Getting into Just Create SMP 2 just got 10x faster! We are now officially listed on Modrinth with automatic 1-click modpack downloading.\n\nPlay directly from the Modrinth App or Prism Launcher and join the rails!'
  )
  const [category, setCategory] = useState<'update' | 'maintenance' | 'downtime' | 'event' | 'general'>('update')
  const [pingRole, setPingRole] = useState('@everyone')
  const [url, setUrl] = useState('https://modrinth.com/server/petablocks-create-2')
  const [imageUrl, setImageUrl] = useState('https://cdn.modrinth.com/data/t3dTlg2d/images/318213ad3a9a4485857aa92e85bcdda1da55bd2f.png')
  const [targetServers, setTargetServers] = useState<string[]>(['all'])
  const [sendDiscord, setSendDiscord] = useState(true)
  const [sendIngame, setSendIngame] = useState(true)

  // Config modal
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [cfgWebhook, setCfgWebhook] = useState('')
  const [cfgChannelId, setCfgChannelId] = useState('')
  const [cfgPingRole, setCfgPingRole] = useState('none')
  const [cfgEnabled, setCfgEnabled] = useState(true)

  const [notice, setNotice] = useState<string | null>(null)

  // 1. Fetch History
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{
    success: boolean
    history: Announcement[]
  }>({
    queryKey: ['announcements-history'],
    queryFn: async () => {
      const res = await fetch('/api/announcements/history?limit=30')
      if (!res.ok) throw new Error('Failed to load history')
      return res.json()
    },
    refetchInterval: 10000,
  })

  // 2. Fetch Config
  useQuery<{ success: boolean; config: AnnouncementConfig }>({
    queryKey: ['announcements-config'],
    queryFn: async () => {
      const res = await fetch('/api/announcements/config')
      if (!res.ok) return { success: false, config: {} as any }
      const data = await res.json()
      if (data.config) {
        setCfgWebhook(data.config.announcementWebhookUrl || '')
        setCfgChannelId(data.config.announcementChannelId || '1381339080130039962')
        setCfgPingRole(data.config.defaultPingRole || 'none')
        setCfgEnabled(data.config.enabled ?? true)
      }
      return data
    },
  })

  // Mutations
  const broadcastMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/announcements/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to broadcast announcement')
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['announcements-history'] })
      const res = data.announcement
      if (!res.discordSent && variables.sendDiscord) {
        setNotice(`⚠️ Broadcast sent to in-game, but Discord failed: ${res.discordError || 'Check Discord Target Settings (webhook URL / channel ID)'}`)
      } else {
        const channels = []
        if (res.discordSent) channels.push('Discord')
        if (res.ingameSent) channels.push('Minecraft Fleet')
        setNotice(`✅ Broadcasted successfully to: ${channels.join(' & ') || 'Configured targets'}`)
      }
      setTimeout(() => setNotice(null), 8000)
    },
    onError: (err: any) => {
      setNotice(`❌ Broadcast failed: ${err.message}`)
      setTimeout(() => setNotice(null), 6000)
    },
  })

  const saveConfigMutation = useMutation({
    mutationFn: async (payload: Partial<AnnouncementConfig>) => {
      const res = await fetch('/api/announcements/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save config')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements-config'] })
      setIsConfigOpen(false)
      setNotice('Configuration updated successfully')
      setTimeout(() => setNotice(null), 4000)
    },
  })

  const handleSend = () => {
    if (!title.trim() || !description.trim()) return
    broadcastMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      pingRole,
      url: url.trim() || null,
      imageUrl: imageUrl.trim() || null,
      targetServers,
      sendDiscord,
      sendIngame,
    })
  }

  const applyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    setTitle(tmpl.title)
    setDescription(tmpl.description)
    setCategory(tmpl.category)
    setPingRole(tmpl.pingRole)
    setUrl(tmpl.url)
    setImageUrl(tmpl.imageUrl)
    setTargetServers(tmpl.targetServers)
  }

  const toggleServer = (id: string) => {
    if (id === 'all') {
      setTargetServers(['all'])
      return
    }
    const filtered = targetServers.filter((s) => s !== 'all')
    if (filtered.includes(id)) {
      const next = filtered.filter((s) => s !== id)
      setTargetServers(next.length === 0 ? ['all'] : next)
    } else {
      setTargetServers([...filtered, id])
    }
  }

  const getCategoryTheme = (cat: string) => {
    switch (cat) {
      case 'update':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          border: 'border-l-blue-500',
          hex: '#3b82f6',
          label: '🚀 Update & Release',
        }
      case 'downtime':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          border: 'border-l-rose-500',
          hex: '#ef4444',
          label: '🚨 Outage & Downtime',
        }
      case 'maintenance':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          border: 'border-l-amber-500',
          hex: '#f59e0b',
          label: '🛠️ Maintenance',
        }
      case 'event':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          border: 'border-l-emerald-500',
          hex: '#10b981',
          label: '🎉 Community Event',
        }
      default:
        return {
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          border: 'border-l-purple-500',
          hex: '#8b5cf6',
          label: '📢 Announcement',
        }
    }
  }

  const currentTheme = getCategoryTheme(category)
  const historyList = historyData?.history || []

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto pb-16">
      {/* ──────────────── HEADER ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Announcements & Fleet Dispatch</h1>
              <p className="text-xs text-muted-foreground">
                Broadcast official updates, maintenance notices, outages, and releases to Discord and Minecraft players.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="px-3 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Discord Target Settings
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-card border border-border text-foreground text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ──────────────── QUICK TEMPLATES ──────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          Quick Load Preset Templates
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((tmpl, idx) => {
            const tTheme = getCategoryTheme(tmpl.category)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => applyTemplate(tmpl)}
                className="text-left p-3 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-all hover:shadow-md flex flex-col justify-between group"
              >
                <div>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase border', tTheme.bg)}>
                    {tTheme.label}
                  </span>
                  <h4 className="text-xs font-bold text-foreground mt-2 group-hover:text-primary transition-colors">
                    {tmpl.name}
                  </h4>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{tmpl.title}</p>
                </div>
                <span className="text-[10px] text-primary/80 font-semibold mt-3 flex items-center gap-1">
                  Load Preset →
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ──────────────── MAIN COMPOSER & PREVIEW GRID ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Composer Form (7 Cols) */}
        <div className="lg:col-span-7 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary animate-pulse" />
              <h3 className="text-sm font-bold text-foreground">Compose Broadcast</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono">Channel Target:</span>
              <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                #📢-announcements
              </span>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Category Selector */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1.5">Announcement Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['update', 'downtime', 'maintenance', 'event', 'general'] as const).map((cat) => {
                  const style = getCategoryTheme(cat)
                  const isSelected = category === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg text-[11px] font-bold border transition-all text-center capitalize',
                        isSelected ? style.bg : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Headline / Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. PETABLOCKS: Create 2 is Now on Modrinth!"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-medium text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Content / Markdown */}
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Announcement Content / Details <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write your announcement details here. Supports Discord markdown (bold, links, bullet points)..."
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            {/* URL & Image */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Action Link / URL (Optional)</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://modrinth.com/..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Banner Image URL (Optional)</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://cdn.modrinth.com/...png"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Ping Options & In-Game Target */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/40">
              <div>
                <label className="block text-muted-foreground font-medium mb-1.5">Discord Mention / Ping</label>
                <div className="flex items-center gap-2">
                  {(['none', '@everyone', '@here'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPingRole(p)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-[11px] font-bold border transition-colors',
                        pingRole === p
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {p === 'none' ? 'No Ping' : p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1.5">Minecraft Broadcast Servers</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SERVER_OPTIONS.map((srv) => {
                    const isSelected = targetServers.includes(srv.id)
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => toggleServer(srv.id)}
                        className={cn(
                          'px-2.5 py-1 rounded text-[11px] font-mono border transition-colors',
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {srv.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Output Destination Switches */}
            <div className="flex items-center gap-6 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendDiscord}
                  onChange={(e) => setSendDiscord(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="font-semibold text-foreground">Post to Discord</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendIngame}
                  onChange={(e) => setSendIngame(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="font-semibold text-foreground">Broadcast In-Game (RCON)</span>
              </label>
            </div>

            {/* Submit Action */}
            <div className="pt-3">
              <button
                type="button"
                disabled={broadcastMutation.isPending || !title.trim() || !description.trim()}
                onClick={handleSend}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>
                  {broadcastMutation.isPending ? 'Broadcasting Announcement...' : 'Broadcast Announcement Now'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Preview Column (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Discord Live Embed Preview
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">Simulated</span>
            </div>

            {/* Discord Mock Card */}
            <div className="p-4 rounded-xl bg-[#2b2d31] text-[#dbdee1] font-sans text-xs space-y-2 border border-[#1e1f22]">
              {pingRole !== 'none' && (
                <div className="text-[#5865f2] font-semibold text-[11px] bg-[#5865f2]/10 px-1.5 py-0.5 rounded w-fit">
                  {pingRole}
                </div>
              )}

              <div
                className={cn('p-3.5 rounded-lg bg-[#232428] border-l-4 space-y-2.5')}
                style={{ borderLeftColor: currentTheme.hex }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: currentTheme.hex }}>
                    {currentTheme.label}
                  </span>
                  <span className="text-[10px] text-[#949ba4]">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div className="font-bold text-sm text-[#f2f3f5] hover:underline cursor-pointer">
                  {title || 'Announcement Title'}
                </div>

                <div className="text-xs text-[#dbdee1] whitespace-pre-wrap leading-relaxed">
                  {description || 'Your announcement details will appear here...'}
                </div>

                {url && (
                  <div className="pt-1">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#00a8fc] hover:underline font-mono"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {url.length > 40 ? `${url.substring(0, 40)}...` : url}
                    </a>
                  </div>
                )}

                {imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-border/30 mt-2 max-h-48 bg-black/40">
                    <img
                      src={imageUrl}
                      alt="Banner"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-[#313338] flex items-center justify-between text-[10px] text-[#949ba4]">
                  <span>PETABLOCKS Network Operations</span>
                  <span className="font-mono">petablocks.com</span>
                </div>
              </div>
            </div>

            {/* In-Game Preview Mock */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Minecraft In-Game Chat / Title Preview
              </span>
              <div className="p-3 rounded-xl bg-black text-white font-mono text-[11px] border border-border/60 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-yellow-400 font-bold">[PETABLOCKS]</span>
                  <span className="text-cyan-300 font-bold">{title}</span>
                </div>
                <div className="text-gray-400 text-[10px] pl-3">
                  ➤ {description.substring(0, 60)}...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── BROADCAST HISTORY ──────────────── */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Recent Announcements History</h3>
          </div>
          <button
            onClick={() => refetchHistory()}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Refresh history"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading announcement records...</div>
        ) : historyList.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-border/80 bg-card/40 space-y-2">
            <Megaphone className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="text-xs text-muted-foreground">No announcements logged yet. Send your first broadcast above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {historyList.map((item) => {
              const hTheme = getCategoryTheme(item.category)
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-border bg-card space-y-2 flex flex-col justify-between hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className={cn('px-2 py-0.5 rounded text-[9px] font-bold uppercase border', hTheme.bg)}>
                        {item.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(item.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <h4 className="font-bold text-foreground text-xs line-clamp-1">{item.title}</h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {item.discordSent && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 font-mono">Discord</span>
                      )}
                      {item.ingameSent && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-mono">In-Game</span>
                      )}
                    </div>
                    <span className="font-mono text-muted-foreground/80">by {item.createdBy}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ──────────────── MODAL: DISCORD TARGET CONFIG ──────────────── */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-primary font-bold">
                <Settings className="h-5 w-5" />
                <h3>Discord Announcement Configuration</h3>
              </div>
              <button onClick={() => setIsConfigOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Discord Channel ID (Dispatched via pb-bot)
                </label>
                <input
                  type="text"
                  value={cfgChannelId}
                  onChange={(e) => setCfgChannelId(e.target.value)}
                  placeholder="1381339080130039962"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Target Discord channel ID for pb-bot to post official embeds.
                </p>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Fallback Webhook URL (If pb-bot offline)
                </label>
                <input
                  type="text"
                  value={cfgWebhook}
                  onChange={(e) => setCfgWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Default Ping Role</label>
                <input
                  type="text"
                  value={cfgPingRole}
                  onChange={(e) => setCfgPingRole(e.target.value)}
                  placeholder="@everyone, @here, or none"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={cfgEnabled}
                    onChange={(e) => setCfgEnabled(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Enable Announcement Dispatches</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-border hover:bg-muted/40 text-xs font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveConfigMutation.isPending}
                onClick={() =>
                  saveConfigMutation.mutate({
                    announcementChannelId: cfgChannelId.trim(),
                    announcementWebhookUrl: cfgWebhook.trim(),
                    defaultPingRole: cfgPingRole.trim(),
                    enabled: cfgEnabled,
                  })
                }
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
