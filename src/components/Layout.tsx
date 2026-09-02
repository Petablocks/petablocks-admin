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
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/servers', icon: Server, label: 'Server Fleet' },
  { to: '/nodes', icon: Layers, label: 'VM Nodes' },
  { to: '/backups', icon: ArchiveRestore, label: 'World Backups' },
  { to: '/minecraft', icon: Gamepad2, label: 'Live Telemetry' },
  { to: '/containers', icon: Box, label: 'Containers' },
  { to: '/monitoring', icon: Activity, label: 'System Vitals' },
  { to: '/databases', icon: Database, label: 'Databases' },
  { to: '/files', icon: FolderOpen, label: 'File Manager' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

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
              <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100dvh-180px)]">
                {navItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
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
      <aside className="hidden lg:flex w-64 border-r border-border flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <p className="font-bold text-sm leading-none">PETABLOCKS</p>
            <p className="text-xs text-muted-foreground mt-0.5">Admin & Monitoring</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer info & MDRCloud attribution */}
        <div className="px-6 py-4 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground text-[11px]">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.6.0'}</span>
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
