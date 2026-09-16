import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrainTrack,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Volume2,
  ExternalLink,
  Compass,
  Trash2,
  RefreshCw,
  Search,
  Radio,
  Navigation,
  Pencil,
} from 'lucide-react'

interface RailwayLine {
  id: number
  server_id: string
  code: string
  name: string
  color: string
  description: string
}

interface RailwaySection {
  id: number
  server_id: string
  line_id: number | null
  line_code?: string
  line_name?: string
  line_color?: string
  name: string
  ref_start_station: string | null
  ref_end_station: string | null
  dimension: string
  coord_x1: number | null
  coord_y1: number | null
  coord_z1: number | null
  coord_x2: number | null
  coord_y2: number | null
  coord_z2: number | null
  radius_blocks: number
  description: string
}

interface RailwayMaintenance {
  id: number
  server_id: string
  line_id: number | null
  line_code?: string
  line_name?: string
  line_color?: string
  section_id: number | null
  section_name?: string
  ref_start_station?: string
  ref_end_station?: string
  title: string
  status: 'scheduled' | 'active' | 'cleared' | 'cancelled'
  severity: 'closed' | 'caution' | 'info'
  reason: string
  speed_limit: string
  staff_name: string
  announced: number
  broadcast_interval_minutes: number
  last_broadcast_at: string | null
  starts_at: string
  eta_completion: string | null
  cleared_at: string | null
  created_at: string
}

interface Station {
  id: string
  name: string
  dimension: string
  location?: { x: number; y: number; z: number }
}

export default function RailwayDispatchPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'maintenance' | 'sections' | 'lines'>('maintenance')
  const [searchQuery, setSearchQuery] = useState('')

  // Edit Target States
  const [editingMaintenance, setEditingMaintenance] = useState<RailwayMaintenance | null>(null)
  const [editingSection, setEditingSection] = useState<RailwaySection | null>(null)
  const [editingLine, setEditingLine] = useState<RailwayLine | null>(null)

  // Modal Visibility States
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false)
  const [sectionModalOpen, setSectionModalOpen] = useState(false)
  const [lineModalOpen, setLineModalOpen] = useState(false)

  // Maintenance Form State
  const [mTitle, setMTitle] = useState('')
  const [mLineId, setMLineId] = useState<string>('')
  const [mSectionId, setMSectionId] = useState<string>('')
  const [mSeverity, setMSeverity] = useState<'closed' | 'caution' | 'info'>('caution')
  const [mStatus, setMStatus] = useState<'active' | 'scheduled' | 'cleared' | 'cancelled'>('active')
  const [mReason, setMReason] = useState('')
  const [mSpeedLimit, setMSpeedLimit] = useState('15 m/s')
  const [mEtaMinutes, setMEtaMinutes] = useState('60')
  const [mBroadcast, setMBroadcast] = useState(true)

  // Section Form State
  const [secName, setSecName] = useState('')
  const [secLineId, setSecLineId] = useState<string>('')
  const [secStartStation, setSecStartStation] = useState('')
  const [secEndStation, setSecEndStation] = useState('')
  const [secX1, setSecX1] = useState('')
  const [secY1, setSecY1] = useState('')
  const [secZ1, setSecZ1] = useState('')
  const [secX2, setSecX2] = useState('')
  const [secY2, setSecY2] = useState('')
  const [secZ2, setSecZ2] = useState('')
  const [secRadius, setSecRadius] = useState('50')
  const [secDesc, setSecDesc] = useState('')

  // Line Form State
  const [lineCode, setLineCode] = useState('')
  const [lineName, setLineName] = useState('')
  const [lineColor, setLineColor] = useState('#3b82f6')
  const [lineDesc, setLineDesc] = useState('')

  // Live Queries
  const { data: networkData } = useQuery<{ stations: Station[]; tracks: any[] }>({
    queryKey: ['railway-network'],
    queryFn: async () => {
      const res = await fetch('/api/railway/network')
      if (!res.ok) return { stations: [], tracks: [] }
      return res.json()
    },
    staleTime: 30000,
  })

  const { data: trainsData } = useQuery<any[]>({
    queryKey: ['railway-trains'],
    queryFn: async () => {
      const res = await fetch('/api/railway/trains')
      if (!res.ok) return []
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: lines = [] } = useQuery<RailwayLine[]>({
    queryKey: ['railway-lines'],
    queryFn: async () => {
      const res = await fetch('/api/railway/lines')
      return res.ok ? res.json() : []
    },
  })

  const { data: sections = [] } = useQuery<RailwaySection[]>({
    queryKey: ['railway-sections'],
    queryFn: async () => {
      const res = await fetch('/api/railway/sections')
      return res.ok ? res.json() : []
    },
  })

  const { data: maintenanceNotices = [], isLoading: isLoadingMaintenance } = useQuery<RailwayMaintenance[]>({
    queryKey: ['railway-maintenance'],
    queryFn: async () => {
      const res = await fetch('/api/railway/maintenance')
      return res.ok ? res.json() : []
    },
    refetchInterval: 10000,
  })

  // Maintenance Mutations
  const createMaintenanceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/railway/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-maintenance'] })
      setMaintenanceModalOpen(false)
      resetMaintenanceForm()
    },
  })

  const updateMaintenanceMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`/api/railway/maintenance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-maintenance'] })
      setMaintenanceModalOpen(false)
      setEditingMaintenance(null)
      resetMaintenanceForm()
    },
  })

  const deleteMaintenanceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/railway/maintenance/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete maintenance notice')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-maintenance'] })
    },
  })

  const clearMaintenanceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/railway/maintenance/${id}/clear`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed to clear maintenance')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-maintenance'] })
    },
  })

  const announceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/railway/maintenance/${id}/announce`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to announce')
      return res.json()
    },
  })

  // Section Mutations
  const createSectionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/railway/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create section')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-sections'] })
      setSectionModalOpen(false)
      resetSectionForm()
    },
  })

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`/api/railway/sections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update section')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-sections'] })
      setSectionModalOpen(false)
      setEditingSection(null)
      resetSectionForm()
    },
  })

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/railway/sections/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete section')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-sections'] })
    },
  })

  // Line Mutations
  const createLineMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/railway/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create line')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-lines'] })
      setLineModalOpen(false)
      resetLineForm()
    },
  })

  const updateLineMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`/api/railway/lines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update line')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-lines'] })
      setLineModalOpen(false)
      setEditingLine(null)
      resetLineForm()
    },
  })

  const deleteLineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/railway/lines/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete line')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['railway-lines'] })
    },
  })

  // Form Resets
  const resetMaintenanceForm = () => {
    setMTitle('')
    setMReason('')
    setMSectionId('')
    setMLineId('')
    setMSeverity('caution')
    setMStatus('active')
    setMSpeedLimit('15 m/s')
    setMEtaMinutes('60')
    setMBroadcast(true)
    setEditingMaintenance(null)
  }

  const resetSectionForm = () => {
    setSecName('')
    setSecDesc('')
    setSecLineId('')
    setSecStartStation('')
    setSecEndStation('')
    setSecX1('')
    setSecY1('')
    setSecZ1('')
    setSecX2('')
    setSecY2('')
    setSecZ2('')
    setSecRadius('50')
    setEditingSection(null)
  }

  const resetLineForm = () => {
    setLineCode('')
    setLineName('')
    setLineColor('#3b82f6')
    setLineDesc('')
    setEditingLine(null)
  }

  // Open Edit Modals
  const openEditMaintenance = (m: RailwayMaintenance) => {
    setEditingMaintenance(m)
    setMTitle(m.title)
    setMReason(m.reason)
    setMSectionId(m.section_id ? String(m.section_id) : '')
    setMLineId(m.line_id ? String(m.line_id) : '')
    setMSeverity(m.severity)
    setMStatus(m.status)
    setMSpeedLimit(m.speed_limit || '15 m/s')
    setMBroadcast(false)
    setMaintenanceModalOpen(true)
  }

  const openEditSection = (s: RailwaySection) => {
    setEditingSection(s)
    setSecName(s.name)
    setSecLineId(s.line_id ? String(s.line_id) : '')
    setSecStartStation(s.ref_start_station || '')
    setSecEndStation(s.ref_end_station || '')
    setSecX1(s.coord_x1 !== null ? String(s.coord_x1) : '')
    setSecY1(s.coord_y1 !== null ? String(s.coord_y1) : '')
    setSecZ1(s.coord_z1 !== null ? String(s.coord_z1) : '')
    setSecX2(s.coord_x2 !== null ? String(s.coord_x2) : '')
    setSecY2(s.coord_y2 !== null ? String(s.coord_y2) : '')
    setSecZ2(s.coord_z2 !== null ? String(s.coord_z2) : '')
    setSecRadius(String(s.radius_blocks || 50))
    setSecDesc(s.description || '')
    setSectionModalOpen(true)
  }

  const openEditLine = (l: RailwayLine) => {
    setEditingLine(l)
    setLineCode(l.code)
    setLineName(l.name)
    setLineColor(l.color || '#3b82f6')
    setLineDesc(l.description || '')
    setLineModalOpen(true)
  }

  const openMaintenanceForSection = (section: RailwaySection) => {
    resetMaintenanceForm()
    setMTitle(`Trackwork: ${section.name}`)
    setMSectionId(String(section.id))
    if (section.line_id) setMLineId(String(section.line_id))
    setMReason('Scheduled line inspection and track bed re-alignment')
    setMaintenanceModalOpen(true)
  }

  const handleMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const startsAt = editingMaintenance ? new Date(editingMaintenance.starts_at) : new Date()
    const etaMs = parseInt(mEtaMinutes || '60') * 60 * 1000
    const etaCompletion = new Date(startsAt.getTime() + etaMs)

    const payload = {
      title: mTitle,
      line_id: mLineId || null,
      section_id: mSectionId || null,
      severity: mSeverity,
      status: mStatus,
      reason: mReason,
      speed_limit: mSpeedLimit,
      announced: mBroadcast,
      starts_at: startsAt.toISOString(),
      eta_completion: etaCompletion.toISOString(),
    }

    if (editingMaintenance) {
      updateMaintenanceMutation.mutate({ id: editingMaintenance.id, payload })
    } else {
      createMaintenanceMutation.mutate(payload)
    }
  }

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: secName,
      line_id: secLineId || null,
      ref_start_station: secStartStation || null,
      ref_end_station: secEndStation || null,
      coord_x1: secX1,
      coord_y1: secY1,
      coord_z1: secZ1,
      coord_x2: secX2,
      coord_y2: secY2,
      coord_z2: secZ2,
      radius_blocks: secRadius,
      description: secDesc,
    }

    if (editingSection) {
      updateSectionMutation.mutate({ id: editingSection.id, payload })
    } else {
      createSectionMutation.mutate(payload)
    }
  }

  const handleLineSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      code: lineCode,
      name: lineName,
      color: lineColor,
      description: lineDesc,
    }

    if (editingLine) {
      updateLineMutation.mutate({ id: editingLine.id, payload })
    } else {
      createLineMutation.mutate(payload)
    }
  }

  const totalStations = networkData?.stations?.length || 0
  const totalTrains = trainsData?.length || 0
  const activeCount = maintenanceNotices.filter((m) => m.status === 'active').length

  const filteredNotices = maintenanceNotices.filter((m) => {
    const q = searchQuery.toLowerCase()
    return (
      m.title.toLowerCase().includes(q) ||
      m.reason.toLowerCase().includes(q) ||
      (m.section_name && m.section_name.toLowerCase().includes(q)) ||
      (m.line_name && m.line_name.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/30 text-amber-400 shadow-inner">
              <TrainTrack className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">Create 2 Railway Dispatch</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
                  Live Dispatch Active
                </span>
                {activeCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                    {activeCount} Active Work Zones
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Label intermediate track corridors, manage maintenance schedules, edit work zones, and broadcast automated in-game passenger advisories.
              </p>
            </div>
          </div>

          {/* Quick Metrics & Links */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://create2-trains.petablocks.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-all hover:text-white"
            >
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>Live Train Map</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <a
              href="https://create2-map.petablocks.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-all hover:text-white"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>3D World Map</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <button
              onClick={() => {
                resetMaintenanceForm()
                setMaintenanceModalOpen(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Announce Maintenance</span>
            </button>
          </div>
        </div>

        {/* Live Network Bar */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-500">Live Network:</span>
            <span className="ml-2 font-semibold text-slate-200">Just Create SMP 2</span>
          </div>
          <div>
            <span className="text-slate-500">Track Stations:</span>
            <span className="ml-2 font-semibold text-cyan-400">{totalStations} Registered</span>
          </div>
          <div>
            <span className="text-slate-500">Active Trains:</span>
            <span className="ml-2 font-semibold text-emerald-400">{totalTrains} Rolling</span>
          </div>
          <div>
            <span className="text-slate-500">Labeled Sections:</span>
            <span className="ml-2 font-semibold text-amber-400">{sections.length} Corridors</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('maintenance')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'maintenance'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Maintenance Notices ({maintenanceNotices.length})
          </button>
          <button
            onClick={() => setActiveTab('sections')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'sections'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Track Sections & Landmarks ({sections.length})
          </button>
          <button
            onClick={() => setActiveTab('lines')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'lines'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Transit Lines ({lines.length})
          </button>
        </div>

        {activeTab === 'maintenance' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search work notices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        )}

        {activeTab === 'sections' && (
          <button
            onClick={() => {
              resetSectionForm()
              setSectionModalOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Labeled Section</span>
          </button>
        )}

        {activeTab === 'lines' && (
          <button
            onClick={() => {
              resetLineForm()
              setLineModalOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Create Transit Line</span>
          </button>
        )}
      </div>

      {/* TAB 1: MAINTENANCE NOTICES */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          {isLoadingMaintenance ? (
            <div className="p-12 text-center text-sm text-slate-500 font-mono">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400 opacity-60" />
              Querying live railway maintenance registry...
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400/50" />
              <p className="text-sm font-medium text-slate-300">No active track maintenance notices found</p>
              <p className="text-xs mt-1">All Create 2 railway lines are operating normally without restrictions.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredNotices.map((notice) => {
                const isActive = notice.status === 'active'
                const isClosed = notice.severity === 'closed'
                return (
                  <div
                    key={notice.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isActive
                        ? isClosed
                          ? 'border-rose-500/40 bg-rose-950/10 shadow-lg shadow-rose-950/20'
                          : 'border-amber-500/40 bg-amber-950/10 shadow-lg shadow-amber-950/20'
                        : 'border-slate-800/80 bg-slate-900/40 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              notice.status === 'active'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : notice.status === 'cleared'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : notice.status === 'scheduled'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {notice.status}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              notice.severity === 'closed'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : notice.severity === 'caution'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            }`}
                          >
                            {notice.severity === 'closed' ? '⛔ Track Closed' : notice.severity === 'caution' ? '⚠️ Caution' : 'ℹ️ Advisory'}
                          </span>
                          {notice.line_name && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ backgroundColor: `${notice.line_color}20`, color: notice.line_color }}
                            >
                              {notice.line_code || notice.line_name}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 text-base font-bold text-white tracking-tight">{notice.title}</h3>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditMaintenance(notice)}
                          title="Edit Maintenance Notice"
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-300" />
                        </button>
                        {isActive && (
                          <>
                            <button
                              onClick={() => announceMutation.mutate(notice.id)}
                              title="Re-broadcast announcement in-game"
                              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
                            >
                              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                            <button
                              onClick={() => clearMaintenanceMutation.mutate(notice.id)}
                              title="Clear maintenance and reopen track"
                              className="px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-all"
                            >
                              Clear Track
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteMaintenanceMutation.mutate(notice.id)}
                          title="Delete Notice"
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-slate-300 leading-relaxed">{notice.reason}</p>

                    {/* Spatial & Corridor Context */}
                    <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-500">Track Target:</span>
                        <span className="ml-1 text-slate-200 font-sans font-medium">
                          {notice.section_name || 'General Route'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Speed Limit:</span>
                        <span className="ml-1 text-amber-400 font-semibold">{notice.speed_limit}</span>
                      </div>
                      {notice.ref_start_station && notice.ref_end_station && (
                        <div className="col-span-2 text-[11px] text-slate-400">
                          <span className="text-slate-500">Between:</span> {notice.ref_start_station} ➔ {notice.ref_end_station}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Staff: {notice.staff_name}</span>
                      <span>Started: {new Date(notice.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {notice.eta_completion && (
                        <span>ETA: {new Date(notice.eta_completion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LABELED TRACK SECTIONS */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-3">
            <Compass className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Labeled Track Sections</span> allow you to identify specific bridges, viaducts, tunnels, and track junctions along a route even if they do not have stations directly at both ends. When trains approach these sections, passenger advisories will be triggered automatically.
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-500">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No labeled track sections registered yet</p>
              <p className="text-xs mt-1">Click "Add Labeled Section" to label your first bridge, tunnel, or junction.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-400" />
                        <h4 className="font-bold text-sm text-white">{section.name}</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {section.line_name && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ backgroundColor: `${section.line_color}20`, color: section.line_color }}
                          >
                            {section.line_code || section.line_name}
                          </span>
                        )}
                        <button
                          onClick={() => openEditSection(section)}
                          title="Edit Section"
                          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {section.description && (
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">{section.description}</p>
                    )}

                    <div className="mt-3 space-y-1 text-xs font-mono text-slate-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
                      {section.ref_start_station && section.ref_end_station ? (
                        <div>
                          <span className="text-slate-500">Corridor:</span> {section.ref_start_station} ➔ {section.ref_end_station}
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-500">Location:</span> Open Route
                        </div>
                      )}
                      {section.coord_x1 !== null && section.coord_z1 !== null && (
                        <div>
                          <span className="text-slate-500">Start:</span> X: {Math.round(section.coord_x1)} Z: {Math.round(section.coord_z1!)}
                          {section.coord_x2 !== null && (
                            <span> ➔ End: X: {Math.round(section.coord_x2!)} Z: {Math.round(section.coord_z2!)}</span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500">Buffer Radius:</span> {section.radius_blocks}m
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => openMaintenanceForSection(section)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition-all"
                    >
                      Schedule Trackwork
                    </button>
                    <button
                      onClick={() => deleteSectionMutation.mutate(section.id)}
                      title="Delete Section"
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRANSIT LINES */}
      {activeTab === 'lines' && (
        <div className="space-y-4">
          {lines.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-500">
              <TrainTrack className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No transit lines registered</p>
              <p className="text-xs mt-1">Create named lines (e.g. Line 1, Central Loop, Freight Corridor) to group sections.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="p-4 rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-10 rounded-full" style={{ backgroundColor: line.color }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white px-1.5 py-0.5 rounded bg-slate-800">
                          {line.code}
                        </span>
                        <h4 className="font-bold text-sm text-slate-200">{line.name}</h4>
                      </div>
                      {line.description && <p className="text-xs text-slate-400 mt-1">{line.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditLine(line)}
                      title="Edit Line"
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteLineMutation.mutate(line.id)}
                      title="Delete Line"
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT MAINTENANCE NOTICE */}
      {maintenanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">
                  {editingMaintenance ? 'Edit Maintenance Notice' : 'Create Railway Maintenance Notice'}
                </h3>
              </div>
              <button
                onClick={() => setMaintenanceModalOpen(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMaintenanceSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Notice Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gorge Viaduct Track Realignment"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Severity *</label>
                  <select
                    value={mSeverity}
                    onChange={(e) => setMSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="caution">⚠️ Caution</option>
                    <option value="closed">⛔ Closed</option>
                    <option value="info">ℹ️ Advisory</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Status *</label>
                  <select
                    value={mStatus}
                    onChange={(e) => setMStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="active">Active</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="cleared">Cleared</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Speed Limit *</label>
                  <input
                    type="text"
                    value={mSpeedLimit}
                    onChange={(e) => setMSpeedLimit(e.target.value)}
                    placeholder="e.g. 15 m/s"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Target Section (Optional)</label>
                  <select
                    value={mSectionId}
                    onChange={(e) => setMSectionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Labeled Section --</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Transit Line (Optional)</label>
                  <select
                    value={mLineId}
                    onChange={(e) => setMLineId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Transit Line --</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} - {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Maintenance Reason & Warning *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why tracks are restricted"
                  value={mReason}
                  onChange={(e) => setMReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Duration ETA (Minutes)</label>
                  <input
                    type="number"
                    min="5"
                    value={mEtaMinutes}
                    onChange={(e) => setMEtaMinutes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={mBroadcast}
                      onChange={(e) => setMBroadcast(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                    />
                    <span>{editingMaintenance ? 'Re-broadcast In-Game' : 'Broadcast In-Game Immediately'}</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMaintenanceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMaintenanceMutation.isPending || updateMaintenanceMutation.isPending}
                  className="px-5 py-2 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-md shadow-orange-500/20"
                >
                  {editingMaintenance ? 'Save Changes' : 'Publish & Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT LABELED TRACK SECTION */}
      {sectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">
                  {editingSection ? 'Edit Labeled Track Section' : 'Add Labeled Track Section'}
                </h3>
              </div>
              <button
                onClick={() => setSectionModalOpen(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSectionSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Section Name / Landmark *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gorge Viaduct, Redwood Spiral, Junction 4"
                  value={secName}
                  onChange={(e) => setSecName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Parent Line (Optional)</label>
                <select
                  value={secLineId}
                  onChange={(e) => setSecLineId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Standalone Route --</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} - {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Stations Autocomplete */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Flanking Station A (Optional)</label>
                  <select
                    value={secStartStation}
                    onChange={(e) => setSecStartStation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Nearby Station --</option>
                    {networkData?.stations?.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Flanking Station B (Optional)</label>
                  <select
                    value={secEndStation}
                    onChange={(e) => setSecEndStation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Nearby Station --</option>
                    {networkData?.stations?.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Coordinate Bounds */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                <span className="block font-semibold text-slate-300">Spatial Coordinates (Optional)</span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Start X"
                    value={secX1}
                    onChange={(e) => setSecX1(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                  <input
                    type="number"
                    placeholder="Start Y"
                    value={secY1}
                    onChange={(e) => setSecY1(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                  <input
                    type="number"
                    placeholder="Start Z"
                    value={secZ1}
                    onChange={(e) => setSecZ1(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="End X"
                    value={secX2}
                    onChange={(e) => setSecX2(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                  <input
                    type="number"
                    placeholder="End Y"
                    value={secY2}
                    onChange={(e) => setSecY2(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                  <input
                    type="number"
                    placeholder="End Z"
                    value={secZ2}
                    onChange={(e) => setSecZ2(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] mt-1">Corridor Width / Proximity Buffer (blocks)</label>
                  <input
                    type="number"
                    value={secRadius}
                    onChange={(e) => setSecRadius(e.target.value)}
                    className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description / Landmarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 400-block sea bridge crossing the eastern bay with double girder spans"
                  value={secDesc}
                  onChange={(e) => setSecDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSectionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSectionMutation.isPending || updateSectionMutation.isPending}
                  className="px-5 py-2 rounded-xl font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-900/20"
                >
                  {editingSection ? 'Save Changes' : 'Save Labeled Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD / EDIT TRANSIT LINE */}
      {lineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <TrainTrack className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">
                  {editingLine ? 'Edit Transit Line' : 'Create Transit Line'}
                </h3>
              </div>
              <button
                onClick={() => setLineModalOpen(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLineSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="LINE-1"
                    value={lineCode}
                    onChange={(e) => setLineCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white uppercase focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1">Line Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Northern Continental Trunk"
                    value={lineName}
                    onChange={(e) => setLineName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Map Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={lineColor}
                    onChange={(e) => setLineColor(e.target.value)}
                    className="w-9 h-9 rounded-xl border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={lineColor}
                    onChange={(e) => setLineColor(e.target.value)}
                    className="w-32 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Main high-speed passenger rail linking Spawn Central with the North Coast"
                  value={lineDesc}
                  onChange={(e) => setLineDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:border-blue-500"
                />
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setLineModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLineMutation.isPending || updateLineMutation.isPending}
                  className="px-5 py-2 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-500"
                >
                  {editingLine ? 'Save Changes' : 'Save Transit Line'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
