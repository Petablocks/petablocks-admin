import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  ShieldCheck,
  Globe,
  Search,
  RefreshCw,
  ExternalLink,
  Crown,
  Shield,
  UserX,
  X,
  CheckCircle2,
  AlertCircle,
  Gamepad2,
  Flame,
  Check,
  Calendar,
  Key,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface OverviewData {
  totalUsers: number
  linkedUsers: number
  unlinkedUsers: number
  linkedPercentage: number
  activeSessions: number
  providerCounts: {
    discord: number
    microsoft: number
  }
  roles: Record<string, number>
}

interface UserSummary {
  id: number
  username: string
  email: string | null
  avatar_url: string | null
  minecraft_uuid: string | null
  minecraft_username: string | null
  primary_provider: string
  discord_id: string | null
  discord_username: string | null
  discord_in_guild: number | boolean
  microsoft_id: string | null
  microsoft_email: string | null
  role: string
  created_at: string
  updated_at: string
  active_sessions_count: number
  playtime_ms: number
  playtime_hours: number
  is_online: boolean
}

interface UserDetail extends UserSummary {
  bio: string | null
  custom_status: string | null
  playstyle_tags: string[] | string | null
  youtube_url: string | null
  founder_broadcast: string | null
  sessions: Array<{
    id: string
    ip_address: string | null
    user_agent: string | null
    created_at: string
    expires_at: string
    is_valid: boolean
  }>
  analytics: {
    playtime_ms: number
    playtime_hours: number
    playtime_formatted: string
    sessions: number
    deaths: number
    advancements: number
    first_seen: number | null
    last_seen: number | null
    is_online: boolean
    current_server: string | null
  } | null
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  admin: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  moderator: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  builder: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  player: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
}

export default function RegisteredUsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [linkedFilter, setLinkedFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [newRole, setNewRole] = useState<string>('')
  const [roleUpdateSuccess, setRoleUpdateSuccess] = useState(false)

  // Overview metrics
  const { data: overview, isLoading: loadingOverview, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ['users-overview'],
    queryFn: () => fetch('/api/users/overview').then((r) => r.json()),
    refetchInterval: 30000,
  })

  // Users list
  const {
    data: usersData,
    isLoading: loadingUsers,
    isFetching: fetchingUsers,
    refetch: refetchUsers,
  } = useQuery<{ total: number; users: UserSummary[] }>({
    queryKey: ['users-list', search, providerFilter, linkedFilter, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        search,
        provider: providerFilter,
        linked: linkedFilter,
        role: roleFilter,
        limit: '50',
      })
      return fetch('/api/users?' + params.toString()).then((r) => r.json())
    },
    refetchInterval: 15000,
  })

  // User detail for inspection
  const { data: userDetail, isLoading: loadingDetail } = useQuery<UserDetail>({
    queryKey: ['user-detail', selectedUserId],
    queryFn: () => fetch('/api/users/' + selectedUserId).then((r) => r.json()),
    enabled: Boolean(selectedUserId),
  })

  // Role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await fetch('/api/users/' + userId + '/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update role')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] })
      queryClient.invalidateQueries({ queryKey: ['users-overview'] })
      queryClient.invalidateQueries({ queryKey: ['user-detail', selectedUserId] })
      setRoleUpdateSuccess(true)
      setTimeout(() => setRoleUpdateSuccess(false), 3000)
    },
  })

  const handleRefreshAll = () => {
    refetchOverview()
    refetchUsers()
  }

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-emerald-500" />
            Registered Users & Central Auth
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Monitor player registrations, Discord/Microsoft OAuth identity, Minecraft verification, and manage staff roles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshAll}
            disabled={fetchingUsers}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', fetchingUsers && 'animate-spin text-emerald-400')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Users */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Users</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-white">
              {loadingOverview ? '...' : overview?.totalUsers || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Central registered accounts</p>
          </div>
        </div>

        {/* Minecraft Linked */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">MC Linked</span>
            <Gamepad2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-white">
              {loadingOverview ? '...' : overview?.linkedUsers || 0}
              <span className="text-xs font-medium text-sky-400 ml-1.5">
                ({overview?.linkedPercentage || 0}%)
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Verified Minecraft UUIDs</p>
          </div>
        </div>

        {/* Unlinked Users */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Unlinked</span>
            <UserX className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-white">
              {loadingOverview ? '...' : overview?.unlinkedUsers || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Pending Minecraft link code</p>
          </div>
        </div>

        {/* Providers */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Providers</span>
            <Globe className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <span className="text-xs text-indigo-400 font-medium">Discord:</span>{' '}
              <span className="text-base font-bold text-white">
                {loadingOverview ? '...' : overview?.providerCounts?.discord || 0}
              </span>
            </div>
            <div>
              <span className="text-xs text-cyan-400 font-medium">MS:</span>{' '}
              <span className="text-base font-bold text-white">
                {loadingOverview ? '...' : overview?.providerCounts?.microsoft || 0}
              </span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">OAuth login sources</p>
        </div>

        {/* Active Sessions */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Sessions</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-emerald-400">
              {loadingOverview ? '...' : overview?.activeSessions || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Current valid bearer tokens</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by username, Minecraft username, email, or Discord tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Provider Filter */}
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Providers</option>
            <option value="discord">Discord</option>
            <option value="microsoft">Microsoft 365</option>
          </select>

          {/* Link Status Filter */}
          <select
            value={linkedFilter}
            onChange={(e) => setLinkedFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Link Status</option>
            <option value="linked">Minecraft Linked</option>
            <option value="unlinked">Unlinked Only</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
            <option value="builder">Builder</option>
            <option value="player">Player</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">User Account</th>
                <th className="py-3.5 px-4">Auth Provider</th>
                <th className="py-3.5 px-4">Minecraft Account</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Playtime / Status</th>
                <th className="py-3.5 px-4">Registered</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loadingUsers ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    Loading registered users...
                  </td>
                </tr>
              ) : !usersData?.users || usersData.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    No registered users match the search criteria.
                  </td>
                </tr>
              ) : (
                usersData.users.map((u) => {
                  const roleStyle = ROLE_COLORS[u.role] || ROLE_COLORS.player
                  return (
                    <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                      {/* User Account */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                            alt={u.username}
                            className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLElement).setAttribute(
                                'src',
                                `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`
                              )
                            }}
                          />
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              {u.username}
                              {u.role === 'owner' && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                            </div>
                            <div className="text-xs text-zinc-400">{u.email || 'No email stored'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Auth Provider */}
                      <td className="py-3 px-4">
                        {u.primary_provider === 'discord' ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs">
                            <span className="font-medium">Discord</span>
                            {u.discord_username && <span className="text-zinc-400">({u.discord_username})</span>}
                          </div>
                        ) : u.primary_provider === 'microsoft' ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs">
                            <span className="font-medium">Microsoft 365</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs">
                            {u.primary_provider}
                          </div>
                        )}
                      </td>

                      {/* Minecraft Account */}
                      <td className="py-3 px-4">
                        {u.minecraft_uuid ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={`https://crafatar.com/avatars/${u.minecraft_uuid}?size=24&overlay`}
                              alt={u.minecraft_username || 'Player'}
                              className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700"
                              onError={(e) => {
                                ;(e.target as HTMLElement).setAttribute(
                                  'src',
                                  'https://crafatar.com/avatars/8667ba71b85a4004af54457a9734eed7?size=24&overlay'
                                )
                              }}
                            />
                            <div>
                              <div className="font-medium text-emerald-400 text-xs">
                                {u.minecraft_username}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono">
                                {u.minecraft_uuid.substring(0, 8)}...
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                            <AlertCircle className="w-3 h-3" />
                            <span>Unlinked</span>
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wider',
                            roleStyle.bg,
                            roleStyle.text,
                            roleStyle.border
                          )}
                        >
                          {u.role}
                        </span>
                      </td>

                      {/* Playtime / Status */}
                      <td className="py-3 px-4">
                        <div className="text-xs">
                          {u.is_online ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              Online
                            </span>
                          ) : (
                            <span className="text-zinc-400">
                              {u.playtime_hours > 0 ? `${u.playtime_hours} hrs played` : 'No playtime'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 text-xs text-zinc-400">
                        {formatTimeAgo(u.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedUserId(u.id)
                            setNewRole(u.role)
                          }}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-emerald-600/20 hover:text-emerald-400 hover:border-emerald-500/30 border border-zinc-700 text-xs font-medium text-zinc-300 transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-zinc-950 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
          <span>Showing {usersData?.users?.length || 0} registered user(s)</span>
          <span>Auto-refreshes every 15 seconds</span>
        </div>
      </div>

      {/* User Detail Slide-over / Modal */}
      {selectedUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => setSelectedUserId(null)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {loadingDetail || !userDetail ? (
              <div className="py-16 text-center text-zinc-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                Loading user details...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Modal Header */}
                <div className="flex items-start gap-4 pb-4 border-b border-zinc-800">
                  <img
                    src={userDetail.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userDetail.username}`}
                    alt={userDetail.username}
                    className="w-16 h-16 rounded-xl border border-zinc-700 object-cover bg-zinc-800 shadow-md"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-white">{userDetail.username}</h2>
                      <span className="text-xs font-mono text-zinc-500">ID #{userDetail.id}</span>
                      {userDetail.role === 'owner' && <Crown className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-sm text-zinc-400">{userDetail.email || 'No primary email'}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Registered {new Date(userDetail.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Active {formatTimeAgo(userDetail.updated_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Role Management Card */}
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      Assign Security Role
                    </div>
                    {roleUpdateSuccess && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <Check className="w-3.5 h-3.5" /> Role Saved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="owner">Owner (Full Server & Portal Rights)</option>
                      <option value="admin">Admin (Operational Control)</option>
                      <option value="moderator">Moderator (Community Governance)</option>
                      <option value="builder">Builder (Creative & World Access)</option>
                      <option value="player">Player (Standard Member)</option>
                    </select>
                    <button
                      onClick={() => updateRoleMutation.mutate({ userId: userDetail.id, role: newRole })}
                      disabled={updateRoleMutation.isPending || newRole === userDetail.role}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none rounded-lg text-sm font-medium text-white transition-colors"
                    >
                      {updateRoleMutation.isPending ? 'Saving...' : 'Update Role'}
                    </button>
                  </div>
                </div>

                {/* Grid: Minecraft Link & OAuth Provider Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Minecraft Link Box */}
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4 text-emerald-400" />
                      Minecraft Identity
                    </div>
                    {userDetail.minecraft_uuid ? (
                      <div className="flex items-start gap-3">
                        <img
                          src={`https://crafatar.com/avatars/${userDetail.minecraft_uuid}?size=40&overlay`}
                          alt="MC Avatar"
                          className="w-10 h-10 rounded bg-zinc-800 border border-zinc-700"
                        />
                        <div className="space-y-1">
                          <div className="font-semibold text-white text-sm">
                            {userDetail.minecraft_username}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono break-all">
                            {userDetail.minecraft_uuid}
                          </div>
                          <div className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium pt-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cryptographically Linked
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <AlertCircle className="w-8 h-8 text-amber-400/80 mx-auto mb-2" />
                        <div className="text-sm font-medium text-zinc-300">No Minecraft Account Linked</div>
                        <p className="text-xs text-zinc-500 mt-1">
                          The player has not yet completed `/link` in-game on the server.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Provider Details */}
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-purple-400" />
                      OAuth Provider Details
                    </div>
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-zinc-500 block">Primary Provider</span>
                        <span className="font-semibold text-zinc-200 capitalize">
                          {userDetail.primary_provider}
                        </span>
                      </div>
                      {userDetail.discord_id && (
                        <div>
                          <span className="text-zinc-500 block">Discord Snowflake ID</span>
                          <span className="font-mono text-zinc-300">{userDetail.discord_id}</span>
                          {userDetail.discord_username && (
                            <span className="text-zinc-400 ml-1.5">(@{userDetail.discord_username})</span>
                          )}
                        </div>
                      )}
                      {userDetail.microsoft_id && (
                        <div>
                          <span className="text-zinc-500 block">Microsoft 365 ID</span>
                          <span className="font-mono text-zinc-300">{userDetail.microsoft_id}</span>
                          {userDetail.microsoft_email && (
                            <div className="text-zinc-400">{userDetail.microsoft_email}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* In-Game Analytics Telemetry (if linked) */}
                {userDetail.analytics && (
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-orange-400" />
                      In-Game Analytics Telemetry
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-2.5">
                        <span className="text-[11px] text-zinc-500 block">Total Playtime</span>
                        <span className="text-base font-bold text-white">
                          {userDetail.analytics.playtime_formatted}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-2.5">
                        <span className="text-[11px] text-zinc-500 block">Sessions Count</span>
                        <span className="text-base font-bold text-white">
                          {userDetail.analytics.sessions}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-2.5">
                        <span className="text-[11px] text-zinc-500 block">Total Deaths</span>
                        <span className="text-base font-bold text-white">
                          {userDetail.analytics.deaths}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-2.5">
                        <span className="text-[11px] text-zinc-500 block">Current Status</span>
                        <span
                          className={cn(
                            'text-xs font-bold block mt-1',
                            userDetail.analytics.is_online ? 'text-emerald-400' : 'text-zinc-400'
                          )}
                        >
                          {userDetail.analytics.is_online
                            ? `Online on ${userDetail.analytics.current_server || 'Main'}`
                            : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profile Customization */}
                {(userDetail.bio || userDetail.custom_status || userDetail.youtube_url) && (
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Profile Showcase
                    </div>
                    {userDetail.custom_status && (
                      <div className="text-sm font-medium text-emerald-300">
                        "{userDetail.custom_status}"
                      </div>
                    )}
                    {userDetail.bio && (
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap">{userDetail.bio}</p>
                    )}
                    {userDetail.youtube_url && (
                      <a
                        href={userDetail.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> YouTube Channel
                      </a>
                    )}
                  </div>
                )}

                {/* Active Sessions Token Table */}
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-amber-400" />
                      Active Auth Sessions ({userDetail.sessions?.length || 0})
                    </div>
                  </div>
                  {userDetail.sessions && userDetail.sessions.length > 0 ? (
                    <div className="space-y-2">
                      {userDetail.sessions.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs"
                        >
                          <div>
                            <div className="font-mono text-zinc-300">{s.ip_address || 'Unknown IP'}</div>
                            <div className="text-zinc-500 text-[11px] truncate max-w-sm">
                              {s.user_agent || 'Unknown Client'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-400 font-medium">Valid</span>
                            <div className="text-[10px] text-zinc-500">
                              Expires {new Date(s.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 text-center py-2">No active sessions.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
