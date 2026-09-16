import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Crown,
  Shield,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Key,
  Flame,
  X,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface RoleMapping {
  id: number
  discord_role_id: string
  discord_role_name: string | null
  luckperms_group: string
  website_role: string
  priority: number
  created_at: string
  updated_at: string
}

const AVAILABLE_WEBSITE_ROLES = [
  'Owner & Founder',
  'Admin',
  'Staff',
  'Moderator',
  'VIP',
  'Player',
]

export default function RoleMappings() {
  const queryClient = useQueryClient()
  const [showAddModal, setShowAddModal] = useState(false)
  const [discordRoleId, setDiscordRoleId] = useState('')
  const [discordRoleName, setDiscordRoleName] = useState('')
  const [luckpermsGroup, setLuckpermsGroup] = useState('default')
  const [websiteRole, setWebsiteRole] = useState('Player')
  const [priority, setPriority] = useState(10)
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null)
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null)

  // Query role mappings
  const { data: mappingsData, isLoading } = useQuery<{ ok: boolean; mappings: RoleMapping[] }>({
    queryKey: ['role-mappings'],
    queryFn: async () => {
      const res = await fetch('/api/users/role-mappings')
      if (!res.ok) throw new Error('Failed to fetch mappings')
      return res.json()
    },
  })

  // Save mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: async (payload: {
      discord_role_id: string
      discord_role_name: string
      luckperms_group: string
      website_role: string
      priority: number
    }) => {
      const res = await fetch('/api/users/role-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-mappings'] })
      setShowAddModal(false)
      setDiscordRoleId('')
      setDiscordRoleName('')
      setLuckpermsGroup('default')
      setWebsiteRole('Player')
      setPriority(10)
      setSyncFeedback('Role mapping saved successfully.')
      setTimeout(() => setSyncFeedback(null), 4000)
    },
    onError: (err: Error) => {
      setErrorFeedback(err.message)
      setTimeout(() => setErrorFeedback(null), 5000)
    },
  })

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/role-mappings/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete mapping')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-mappings'] })
      setSyncFeedback('Mapping deleted.')
      setTimeout(() => setSyncFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setErrorFeedback(err.message)
      setTimeout(() => setErrorFeedback(null), 5000)
    },
  })

  // Bulk sync mutation
  const bulkSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/users/role-mappings/sync', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Bulk sync failed')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['role-mappings'] })
      setSyncFeedback(`Successfully synchronised ${data.synced ?? 0} player roles across Discord & LuckPerms!`)
      setTimeout(() => setSyncFeedback(null), 6000)
    },
    onError: (err: Error) => {
      setErrorFeedback(err.message)
      setTimeout(() => setErrorFeedback(null), 5000)
    },
  })

  const mappings = mappingsData?.mappings || []

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
            <Crown className="w-3.5 h-3.5" />
            <span>CENTRAL IDENTITY & PERMISSIONS</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Discord & LuckPerms Role Mappings</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure how Discord server roles map to website ranks and in-game LuckPerms permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => bulkSyncMutation.mutate()}
            disabled={bulkSyncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', bulkSyncMutation.isPending && 'animate-spin')} />
            <span>{bulkSyncMutation.isPending ? 'Syncing...' : 'Sync All Roles'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Role Mapping</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {syncFeedback && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {errorFeedback && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorFeedback}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Configured Mappings</span>
            <Key className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">{mappings.length}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Discord to Minecraft rank translations</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Discord Guild</span>
            <Flame className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xs font-mono text-zinc-200 mt-2 truncate">1381339079387643975</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Bot Connected (/link, /profile, /rolesync)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Role Authority</span>
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xs font-bold text-white mt-2">Discord First</div>
          <div className="text-[11px] text-zinc-500 mt-1">Discord roles automatically set game ranks</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 overflow-hidden">
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Active Mapping Rules</h2>
          </div>
          <span className="text-xs font-mono text-zinc-500">{mappings.length} rules</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading mappings...</div>
        ) : mappings.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Key className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-zinc-300">No role mappings configured yet</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Add your first mapping to automatically give players LuckPerms ranks when they hold a Discord role.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Initial Mapping</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                <tr>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Discord Role</th>
                  <th className="py-3 px-4">Website Role</th>
                  <th className="py-3 px-4">LuckPerms Group</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                      {m.priority}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{m.discord_role_name || 'Unnamed Role'}</div>
                      <div className="font-mono text-[10px] text-zinc-500">{m.discord_role_id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-zinc-800 text-zinc-200 border border-zinc-700">
                        {m.website_role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <code className="px-2 py-0.5 rounded bg-black/40 text-emerald-400 font-mono text-xs border border-zinc-800">
                        {m.luckperms_group}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-mono text-[10px]">
                      {new Date(m.updated_at || m.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => deleteMappingMutation.mutate(m.id)}
                        disabled={deleteMappingMutation.isPending}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Mapping"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-cyan-400" />
                <span>Add Role Mapping</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!discordRoleId.trim()) return
                saveMappingMutation.mutate({
                  discord_role_id: discordRoleId.trim(),
                  discord_role_name: discordRoleName.trim() || 'Role',
                  luckperms_group: luckpermsGroup.trim(),
                  website_role: websiteRole,
                  priority: Number(priority) || 10,
                })
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Discord Role ID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={discordRoleId}
                  onChange={(e) => setDiscordRoleId(e.target.value)}
                  placeholder="e.g. 1381339079387643975"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Enable Discord Developer Mode, right-click the role in Server Settings, and click "Copy Role ID".
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Discord Role Name (Display Label)
                </label>
                <input
                  type="text"
                  value={discordRoleName}
                  onChange={(e) => setDiscordRoleName(e.target.value)}
                  placeholder="e.g. Founder, Patreon, Booster"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Website Role</label>
                  <select
                    value={websiteRole}
                    onChange={(e) => setWebsiteRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-cyan-500"
                  >
                    {AVAILABLE_WEBSITE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">LuckPerms Group</label>
                  <input
                    type="text"
                    required
                    value={luckpermsGroup}
                    onChange={(e) => setLuckpermsGroup(e.target.value)}
                    placeholder="e.g. owner, vip, default"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Priority (Higher wins)</label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Example: Founder=100, Admin=80, VIP=50, Member=10
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMappingMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all disabled:opacity-50"
                >
                  {saveMappingMutation.isPending ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
