import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Gamepad2,
  Box,
  Activity,
  Database,
  FolderOpen,
  Settings,
  Zap,
  Server,
  ExternalLink,
  Menu,
  X,
  ArchiveRestore,
  Layers,
  Users,
  Wrench,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: () => React.ReactNode
}

interface NavSection {
  title?: string
  items: NavItem[]
}

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen])

  // Live query for maintenance badge
  const { data: activeMaintenance } = useQuery<any[]>({
    queryKey: ['maintenance-active-badge'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance/active')
      if (!res.ok) return []
      return res.json()
    },
    refetchInterval: 10000,
  })

  // Live query for fleet player count badge
  const { data: telemetryData } = useQuery<{ totalOnline?: number }>({
    queryKey: ['fleet-telemetry-badge'],
    queryFn: async () => {
      const res = await fetch('/api/minecraft/servers')
      if (!res.ok) return { totalOnline: 0 }
      return res.json()
    },
    refetchInterval: 12000,
  })

  const hasActiveMaintenance = Array.isArray(activeMaintenance) && activeMaintenance.some((w) => w.status === 'in_progress')
  const hasScheduledMaintenance = Array.isArray(activeMaintenance) && activeMaintenance.some((w) => w.status === 'scheduled')
  const totalPlayersOnline = telemetryData?.totalOnline ?? 0

  const navSections: NavSection[] = [
    {
      items: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      ],
    },
    {
      title: 'Game Operations',
      items: [
        { to: '/servers', icon: Server, label: 'Server Fleet' },
        {
          to: '/minecraft',
          icon: Gamepad2,
          label: 'Live Telemetry',
          badge: () =>
            totalPlayersOnline > 0 ? (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-in fade-in">
                {totalPlayersOnline} online
              </span>
            ) : null,
        },
        { to: '/analytics', icon: Users, label: 'Player Analytics' },
        {
          to: '/maintenance',
          icon: Wrench,
          label: 'Maintenance Hub',
          badge: () => {
            if (hasActiveMaintenance) {
              return (
                <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  ACTIVE
                </span>
              )
            }
            if (hasScheduledMaintenance) {
              return (
                <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  SCHED
                </span>
              )
            }
            return null
          },
        },
        { to: '/backups', icon: ArchiveRestore, label: 'World Backups' },
      ],
    },
    {
      title: 'Infrastructure',
      items: [
        {
          to: '/nodes',
          icon: Layers,
          label: 'VM Nodes',
          badge: () => (
            <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted/60 border border-border/40">
              4
            </span>
          ),
        },
        { to: '/containers', icon: Box, label: 'Containers' },
        { to: '/monitoring', icon: Activity, label: 'System Vitals' },
        { to: '/databases', icon: Database, label: 'Databases' },
        { to: '/files', icon: FolderOpen, label: 'File Manager' },
      ],
    },
    {
      title: 'System',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
      ],
    },
  ]

  const renderNavSection = (section: NavSection, isMobile = false) => (
    <div key={section.title || 'main'} className="space-y-0.5">
      {section.title && (
        <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest select-none">
          {section.title}
        </div>
      )}
      <div className="space-y-0.5">
        {section.items.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => isMobile && setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
                )}
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span className="truncate">{label}</span>
                {badge && badge()}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row h-screen h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* ──────────────── MOBILE TOP HEADER ──────────────── */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-md shrink-0 z-30">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <div>
            <p className="font-bold text-sm leading-none text-foreground">PETABLOCKS</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Admin & Ops</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
            PROD
          </span>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* ──────────────── MOBILE SLIDE-OVER DRAWER ──────────────── */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          />

          {/* Drawer content */}
          <div className="relative w-4/5 max-w-xs bg-card border-r border-border h-full flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200 pb-6">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm">Navigation</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Links */}
              <nav className="p-3 space-y-3 overflow-y-auto max-h-[calc(100dvh-180px)]">
                {navSections.map((section) => renderNavSection(section, true))}
              </nav>
            </div>

            {/* Drawer Footer info */}
            <div className="px-5 py-3 border-t border-border space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span className="flex items-center gap-1 font-mono">
                  <Server className="h-3 w-3 text-primary" /> MDRCloud
                </span>
                <span className="font-mono text-[10px]">FEA: 10.20.110.116</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── DESKTOP SIDEBAR ──────────────── */}
      <aside className="hidden lg:flex w-64 border-r border-border flex-col shrink-0 bg-card/40">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-card/60">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-sm leading-none tracking-tight">PETABLOCKS</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Admin & Operations</p>
          </div>
        </div>

        {/* Categorized Nav */}
        <nav className="flex-1 px-3 py-3 space-y-2.5 overflow-y-auto">
          {navSections.map((section) => renderNavSection(section, false))}
        </nav>

        {/* Footer info & MDRCloud attribution */}
        <div className="px-5 py-3.5 border-t border-border bg-card/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground text-[11px]">
              v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.6.1'}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              PROD
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/50">
            <span className="flex items-center gap-1">
              <Server className="h-3 w-3 text-primary" /> Host:
            </span>
            <a
              href="https://mdrcloud.com"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
            >
              MDRCloud <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="text-[10px] text-muted-foreground/80 font-mono space-y-0.5">
            <div className="flex justify-between">
              <span>MCS1-3:</span>
              <span>10.20.110.118-120</span>
            </div>
            <div className="flex justify-between">
              <span>FEA:</span>
              <span>10.20.110.116</span>
            </div>
            <div className="flex justify-between">
              <span>DB:</span>
              <span>10.20.110.117</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ──────────────── MAIN CONTENT AREA ──────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden touch-scroll">
        <Outlet />
      </main>
    </div>
  )
}
