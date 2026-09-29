import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import Layout from './components/Layout'

// Lazy-loaded routes for code splitting
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const MinecraftServersPage = lazy(() => import('./pages/MinecraftServers'))
const MinecraftServerDetailPage = lazy(() => import('./pages/MinecraftServerDetail'))
const ServerFleetPage = lazy(() => import('./pages/ServerFleet'))
const ServerDashboardPage = lazy(() => import('./pages/ServerDashboard'))
const NodesPage = lazy(() => import('./pages/Nodes'))
const ContainersPage = lazy(() => import('./pages/Containers'))
const MonitoringPage = lazy(() => import('./pages/Monitoring'))
const DatabasesPage = lazy(() => import('./pages/Databases'))
const FileManagerPage = lazy(() => import('./pages/FileManager'))
const BackupsPage = lazy(() => import('./pages/Backups'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const PlayerAnalyticsPage = lazy(() => import('./pages/PlayerAnalytics'))
const MaintenanceManagerPage = lazy(() => import('./pages/MaintenanceManager'))
const RegisteredUsersPage = lazy(() => import('./pages/RegisteredUsers'))
const RoleMappingsPage = lazy(() => import('./pages/RoleMappings'))
const FleetLogsPage = lazy(() => import('./pages/FleetLogs'))
const CommunityEventsPage = lazy(() => import('./pages/CommunityEvents'))
const ModerationPage = lazy(() => import('./pages/Moderation'))
const RailwayDispatchPage = lazy(() => import('./pages/RailwayDispatch'))
const SupportDeskPage = lazy(() => import('./pages/SupportDesk'))
const AnnouncementsPage = lazy(() => import('./pages/Announcements'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10000,
      staleTime: 5000,
    },
  },
})

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <span className="text-xs text-muted-foreground font-mono animate-pulse">Loading module...</span>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="servers" element={<ServerFleetPage />} />
            <Route path="servers/:nodeId/:serverId" element={<ServerDashboardPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="minecraft" element={<MinecraftServersPage />} />
            <Route path="minecraft/:id" element={<MinecraftServerDetailPage />} />
            <Route path="fleet-logs" element={<FleetLogsPage />} />
            <Route path="events" element={<CommunityEventsPage />} />
            <Route path="analytics" element={<PlayerAnalyticsPage />} />
            <Route path="moderation" element={<ModerationPage />} />
            <Route path="railway" element={<RailwayDispatchPage />} />
            <Route path="support" element={<SupportDeskPage />} />
            <Route path="users" element={<RegisteredUsersPage />} />
            <Route path="role-mappings" element={<RoleMappingsPage />} />
            <Route path="maintenance" element={<MaintenanceManagerPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="containers" element={<ContainersPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="databases" element={<DatabasesPage />} />
            <Route path="files" element={<FileManagerPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </QueryClientProvider>
  )
}
