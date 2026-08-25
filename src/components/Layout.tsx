import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Box,
  Activity,
  Database,
  FolderOpen,
  Settings,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/containers', icon: Box, label: 'Containers' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring' },
  { to: '/databases', icon: Database, label: 'Databases' },
  { to: '/files', icon: FolderOpen, label: 'File Manager' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col shrink-0">
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
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer info */}
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>PETABLOCKS-FEA</span>
            <span className="font-mono">10.20.110.116</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>PETABLOCKS-DB</span>
            <span className="font-mono">10.20.110.117</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
