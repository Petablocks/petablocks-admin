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
  ShieldCheck,
  Wrench,
  MoreHorizontal,
  ChevronRight,
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

  // Live query for registered users count
  const { data: usersOverview } = useQuery<{ totalUsers?: number }>({
    queryKey: ['users-count-badge'],
    queryFn: async () => {
      const res = await fetch('/api/users/overview')
      if (!res.ok) return { totalUsers: 0 }
      return res.json()
    },
    refetchInterval: 30000,
  })

  const hasActiveMaintenance = Array.isArray(activeMaintenance) && activeMaintenance.some((w) => w.status === 'in_progress')
  const hasScheduledMaintenance = Array.isArray(activeMaintenance) && activeMaintenance.some((w) => w.status === 'scheduled')
  const totalPlayersOnline = telemetryData?.totalOnline ?? 0
  const totalRegisteredUsers = usersOverview?.totalUsers ?? 0

  // Resolve current active page title for mobile top breadcrumbs
  const getPageTitle = (pathname: string) => {
    if (pathname === '/dashboard') return 'Dashboard'
    if (pathname.startsWith('/servers')) return 'Server Fleet'
    if (pathname.startsWith('/minecraft')) return 'Live Telemetry'
    if (pathname === '/analytics') return 'Player Analytics'
    if (pathname === '/users') return 'Registered Users'
    if (pathname === '/maintenance') return 'Maintenance Hub'
    if (pathname === '/backups') return 'World Backups'
    if (pathname === '/nodes') return 'VM Nodes'
    if (pathname === '/containers') return 'Containers'
    if (pathname === '/monitoring') return 'System Vitals'
    if (pathname === '/databases') return 'Databases'
    if (pathname === '/files') return 'File Manager'
    if (pathname === '/settings') return 'Settings'
    return 'Admin Panel'
  }

  const currentTitle = getPageTitle(location.pathname)

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
          to: '/users',
          icon: ShieldCheck,
          label: 'Registered Users',
          badge: () =>
            totalRegisteredUsers > 0 ? (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                {totalRegisteredUsers}
              </span>
            ) : null,
        },
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
        <div className={cn(
          "font-bold text-muted-foreground/60 uppercase tracking-widest select-none",
          isMobile ? "px-4 pt-4 pb-1.5 text-[11px]" : "px-3 pt-3 pb-1 text-[10px]"
        )}>
          {section.title}
        </div>
      )}
      <div className={cn(isMobile ? "space-y-1" : "space-y-0.5")}>
        {section.items.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => isMobile && setMobileMenuOpen(false)}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center transition-all duration-150',
                isMobile
                  ? 'gap-3 px-4 py-3 rounded-xl text-sm font-semibold'
                  : 'gap-2.5 px-3 py-2 rounded-lg text-xs font-medium',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:bg-accent/80'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className={cn(
                    "absolute left-0 w-1 rounded-r-full bg-primary",
                    isMobile ? "top-2 bottom-2" : "top-1.5 bottom-1.5"
                  )} />
                )}
                <Icon
                  className={cn(
                    'shrink-0 transition-transform duration-150 group-hover:scale-105',
                    isMobile ? 'h-5 w-5' : 'h-4 w-4',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span className="truncate">{label}</span>
                {badge && badge()}
                {isMobile && !badge && (
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/80 transition-colors" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row h-screen h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* ──────────────── MOBILE TOP APP BAR ──────────────── */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur-md shrink-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
            <Zap className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs tracking-tight text-foreground">PETABLOCKS</span>
              <span className="text-muted-foreground/40 text-xs">/</span>
              <span className="text-xs font-semibold text-primary truncate max-w-[150px] sm:max-w-[220px]">
                {currentTitle}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 leading-none mt-0.5">Admin &amp; Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {totalPlayersOnline > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {totalPlayersOnline}
            </span>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
            PROD
          </span>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              mobileMenuOpen
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/60 hover:bg-muted text-foreground border-border"
            )}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ──────────────── MOBILE SLIDE-OVER DRAWER SHEET ──────────────── */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          />

          {/* Drawer content sheet */}
          <div className="relative w-[85%] max-w-sm bg-card border-r border-border h-full flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="flex flex-col h-full min-h-0">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-foreground leading-none">PETABLOCKS Suite</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Control Center Navigation</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  aria-label="Close navigation drawer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Links */}
              <nav className="flex-1 p-3.5 space-y-3 overflow-y-auto overscroll-contain">
                {navSections.map((section) => renderNavSection(section, true))}
              </nav>

              {/* Drawer Footer info */}
              <div className="p-4 border-t border-border bg-card/60 shrink-0 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground text-[11px]">
                    v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.9.0'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    ONLINE • FEA
                  </span>
                </div>

                <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-2 border-t border-border/40">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Server className="h-3.5 w-3.5 text-primary" /> MDRCloud Node
                  </span>
                  <a
                    href="https://mdrcloud.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
                  >
                    MDRCloud <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
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
            <p className="text-[11px] text-muted-foreground mt-0.5">Admin &amp; Operations</p>
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
              v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.9.0'}
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
      {/* Adds padding-bottom on mobile to clear the fixed bottom navigation bar */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden touch-scroll pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* ──────────────── MOBILE STICKY BOTTOM NAVIGATION BAR ──────────────── */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border shadow-lg px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-5 items-center gap-1">
          {/* 1. Dashboard */}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors relative',
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "p-1 rounded-lg transition-colors",
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}>
                  <LayoutDashboard className="h-4 w-4" />
                </div>
                <span className="truncate mt-0.5">Home</span>
              </>
            )}
          </NavLink>

          {/* 2. Live Telemetry */}
          <NavLink
            to="/minecraft"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors relative',
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "p-1 rounded-lg transition-colors relative",
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}>
                  <Gamepad2 className="h-4 w-4" />
                  {totalPlayersOnline > 0 && (
                    <span className="absolute -top-1 -right-1.5 px-1 py-0.2 rounded-full text-[8px] font-mono font-bold bg-emerald-500 text-black leading-none">
                      {totalPlayersOnline}
                    </span>
                  )}
                </div>
                <span className="truncate mt-0.5">Telemetry</span>
              </>
            )}
          </NavLink>

          {/* 3. Server Fleet */}
          <NavLink
            to="/servers"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors relative',
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "p-1 rounded-lg transition-colors",
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}>
                  <Server className="h-4 w-4" />
                </div>
                <span className="truncate mt-0.5">Fleet</span>
              </>
            )}
          </NavLink>

          {/* 4. Maintenance Hub */}
          <NavLink
            to="/maintenance"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors relative',
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "p-1 rounded-lg transition-colors relative",
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}>
                  <Wrench className="h-4 w-4" />
                  {hasActiveMaintenance && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                  )}
                </div>
                <span className="truncate mt-0.5">Maint</span>
              </>
            )}
          </NavLink>

          {/* 5. More / Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors relative',
              mobileMenuOpen
                ? 'text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground active:scale-95'
            )}
            aria-label="Open More Operations Menu"
          >
            <div className={cn(
              "p-1 rounded-lg transition-colors",
              mobileMenuOpen ? "bg-primary/15 text-primary" : "text-muted-foreground"
            )}>
              <MoreHorizontal className="h-4 w-4" />
            </div>
            <span className="truncate mt-0.5">More</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
