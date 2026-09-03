import { Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import DashboardPage from './pages/Dashboard'
import MinecraftServersPage from './pages/MinecraftServers'
import MinecraftServerDetailPage from './pages/MinecraftServerDetail'
import ServerFleetPage from './pages/ServerFleet'
import ServerDashboardPage from './pages/ServerDashboard'
import NodesPage from './pages/Nodes'
import ContainersPage from './pages/Containers'
import MonitoringPage from './pages/Monitoring'
import DatabasesPage from './pages/Databases'
import FileManagerPage from './pages/FileManager'
import BackupsPage from './pages/Backups'
import SettingsPage from './pages/Settings'
import PlayerAnalyticsPage from './pages/PlayerAnalytics'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10000,
      staleTime: 5000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="servers" element={<ServerFleetPage />} />
          <Route path="servers/:nodeId/:serverId" element={<ServerDashboardPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="minecraft" element={<MinecraftServersPage />} />
          <Route path="minecraft/:id" element={<MinecraftServerDetailPage />} />
          <Route path="analytics" element={<PlayerAnalyticsPage />} />
          <Route path="containers" element={<ContainersPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="databases" element={<DatabasesPage />} />
          <Route path="files" element={<FileManagerPage />} />
          <Route path="backups" element={<BackupsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  )
}
