// 用户管理模块 — 用户列表 / 编辑用户弹窗 / 用户详情抽屉
//
// 数据来源：
//   GET  /api/admin/users             用户列表（支持 ?role= 过滤 & keyword= 搜索）
//   PUT  /api/admin/users/:id/role     修改用户角色
//   PUT  /api/admin/users/:id/enabled  启用/关闭用户
//   PUT  /api/admin/users/:id          编辑用户信息（昵称/邮箱/简介）
//   DELETE /api/admin/users/:id        删除账号（需密码二次确认）
//   GET  /api/admin/users/:id          用户详情（抽屉）
//   POST /api/admin/users/:id/recharge 充值积分
//   PUT  /api/admin/users/:id/plan     修改套餐/额度

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserX,
  Users,
  X,
  Zap,
} from 'lucide-react'
import type { Role, AdminUser, UserDetail } from './types'
import { UNIQUE_SUPERADMIN_EMAIL, ROLE_LABELS, ROLE_ASSIGNABLE_OPTIONS } from './types'
import {
  formatDateTime,
  formatNumber,
  UserAvatar,
  Modal,
  Drawer,
  ProgressBar,
  ROLE_FILTER_OPTIONS,
  WORK_TYPE_LABELS,
  isStrictlyAbove,
} from './common'
import { api } from '../../services/api'

// ===== 套餐选项（用户详情抽屉使用）=====
const PLAN_OPTIONS: { id: string; label: string }[] = [
  { id: 'free', label: 'Free 免费版' },
  { id: 'pro', label: 'Pro 专业版' },
  { id: 'business', label: 'Business 企业版' },
  { id: 'enterprise', label: 'Enterprise 旗舰版' },
]
const QUICK_RECHARGE = [10_000, 50_000, 100_000, 500_000, 1_000_000]

// ===== 用户列表 Tab =====
export function UsersTab({ currentUserId, role, onError }: { currentUserId: string; role?: Role; onError: (e: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<'' | Role>('')
  const [keyword, setKeyword] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [togglingEnabledId, setTogglingEnabledId] = useState<string | null>(null)
  // 编辑下级用户信息
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  // 超级管理员删除账号 —— 行级垃圾桶按钮触发的密码二次确认弹窗
  const [deleteUserPrompt, setDeleteUserPrompt] = useState<AdminUser | null>(null)
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const canDeleteAccounts = role === 'superadmin'
  // 密码框 ref —— 用 useEffect 显式聚焦，比 autoFocus 可靠（避免点击删除按钮后键入字符
  // 仍落入搜索框触发 keyword 防抖搜索"邮箱"的问题）
  const deletePasswordRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (deleteUserPrompt) {
      // 模态挂载后下一帧聚焦，确保 DOM 已就绪
      const t = setTimeout(() => {
        deletePasswordRef.current?.focus()
        deletePasswordRef.current?.select?.()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [deleteUserPrompt])

  const loadUsers = useCallback(
    async (role: '' | Role, kw = '') => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (role) params.set('role', role)
        if (kw.trim()) params.set('keyword', kw.trim())
        const qs = params.toString()
        const url = `/api/admin/users${qs ? `?${qs}` : ''}`
        const res = await api.get<{ users: AdminUser[] }>(url)
        setUsers(res.users ?? [])
      } catch (e) {
        onError((e as Error).message)
        setUsers([])
      } finally {
        setLoading(false)
      }
    },
    [onError],
  )

  // 保存编辑的下级用户信息
  const handleSaveEdit = async (data: { nickname: string; email: string; bio: string }) => {
    if (!editingUser) return
    setUpdatingId(editingUser.id)
    try {
      const updated = await api.put<AdminUser>(`/api/admin/users/${editingUser.id}`, data)
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...updated } : u)))
      setEditingUser(null)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setUpdatingId(null)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => loadUsers(roleFilter, keyword), 300)
    return () => clearTimeout(t)
  }, [roleFilter, keyword, loadUsers])

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdatingId(userId)
    try {
      await api.put(`/api/admin/users/${userId}/role`, { role: newRole })
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleToggleEnabled = async (u: AdminUser) => {
    if (u.role === 'superadmin') {
      onError('不能操作超级管理员账号')
      return
    }
    if (u.id === currentUserId) {
      onError('不能操作自己的账号')
      return
    }
    const newVal = u.enabled === false
    if (!window.confirm(newVal ? `确认关闭 ${u.nickname}？关闭后该用户无法登录。` : `确认启用 ${u.nickname}？`)) return
    setTogglingEnabledId(u.id)
    try {
      await api.put(`/api/admin/users/${u.id}/enabled`, { enabled: newVal })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, enabled: newVal } : x)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setTogglingEnabledId(null)
    }
  }

  // 超级管理员删除账号
  // 显示条件：superadmin && 严格高于目标角色 && 目标不是自己
  const handleClickDeleteUser = (u: AdminUser) => {
    if (!canDeleteAccounts) return
    if (u.id === currentUserId) {
      onError('不能删除自己的账号')
      return
    }
    if (!isStrictlyAbove(role, u.role)) {
      onError('无权删除同级或更高级别的用户')
      return
    }
    setDeleteConfirmPassword('')
    setDeleteUserPrompt(u)
  }

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserPrompt) return
    const pwd = deleteConfirmPassword
    if (!pwd) {
      onError('请输入登录密码确认')
      return
    }
    setDeletingUserId(deleteUserPrompt.id)
    try {
      await api.delWithBody(`/api/admin/users/${deleteUserPrompt.id}`, { password: pwd })
      // 乐观更新：从列表移除
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserPrompt.id))
      if (detailUserId === deleteUserPrompt.id) setDetailUserId(null)
      setDeleteUserPrompt(null)
      setDeleteConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div>
      {/* 工具栏：搜索 + 过滤 + 刷新；删除弹窗打开时禁用搜索框，防止 autoFocus 不可靠时键入字符泄漏到 keyword 触发搜索 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索邮箱 / 昵称"
            className="input !w-64 !pl-8 !py-1.5 text-sm"
            disabled={!!deleteUserPrompt}
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">角色筛选</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as '' | Role)}
            className="input !w-auto !py-1.5 text-sm"
          >
            {ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => loadUsers(roleFilter, keyword)} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {users.length} 位用户</span>
      </div>

      {/* 表格：border + divide-y 风格 */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Users className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无用户数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 whitespace-nowrap">昵称</th>
                  <th className="px-4 py-3 whitespace-nowrap">邮箱</th>
                  <th className="px-4 py-3 whitespace-nowrap">角色</th>
                  <th className="px-4 py-3 whitespace-nowrap">状态</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">作品</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">评论</th>
                  <th className="px-4 py-3 whitespace-nowrap">注册时间</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId
                  // 层级校验 — admin 可操作 user，superadmin 可操作 admin+user
                  const canManage = isStrictlyAbove(role, u.role)
                  const disabled = isSelf || !canManage || togglingEnabledId === u.id
                  // 唯一超级管理员账号（UNIQUE_SUPERADMIN_EMAIL）不能在 UI 里切换角色或关闭/删除
                  const isUniqueSuperadmin = u.email === UNIQUE_SUPERADMIN_EMAIL
                  // 角色下拉候选：若目标已是唯一 superadmin，只能显示一个 locked 选项；否则给 assignable 列表
                  const dropdownRoles: Role[] = isUniqueSuperadmin
                    ? ['superadmin']
                    : ROLE_ASSIGNABLE_OPTIONS.includes(u.role)
                      ? ROLE_ASSIGNABLE_OPTIONS
                      : ROLE_ASSIGNABLE_OPTIONS
                  return (
                    <tr key={u.id} className={`hover:bg-neutral-50/60 ${u.enabled === false ? 'bg-rose-50/30' : ''} ${isUniqueSuperadmin ? 'bg-gradient-to-r from-amber-50/70 via-amber-50/20 to-transparent' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[200px] items-center gap-2">
                          <UserAvatar user={u} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-neutral-900">{u.nickname || '—'}</span>
                              {isUniqueSuperadmin && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <Lock className="h-3 w-3" />
                                  系统保留（唯一超管）
                                </span>
                              )}
                            </div>
                            {u.bio && <div className="truncate text-xs text-neutral-400">{u.bio}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        <div className="min-w-[180px] truncate" title={u.email}>{u.email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                            disabled={disabled || isUniqueSuperadmin || updatingId === u.id || role !== 'superadmin'}
                            className={`rounded-md border bg-white px-2 py-1 text-xs font-medium outline-none transition disabled:cursor-not-allowed disabled:bg-neutral-50 ${
                              isSelf || role !== 'superadmin' || isUniqueSuperadmin
                                ? 'border-neutral-200 text-neutral-400'
                                : 'border-neutral-200 text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
                            }`}
                            title={
                              isUniqueSuperadmin
                                ? `系统已启用唯一超级管理员约束：${UNIQUE_SUPERADMIN_EMAIL}，角色不可变更`
                                : isSelf
                                  ? '不能修改自己的角色'
                                  : role !== 'superadmin'
                                    ? '仅超级管理员可修改角色'
                                    : undefined
                            }
                          >
                            {dropdownRoles.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                                {isUniqueSuperadmin && r === 'superadmin' ? '（锁死）' : ''}
                              </option>
                            ))}
                          </select>
                          {isSelf && <span className="text-xs text-neutral-400">（你）</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`chip text-[10px] ${
                              u.enabled === false
                                ? 'border-rose-200 bg-rose-50 text-rose-600'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {u.enabled === false ? (
                              <>
                                <UserX className="mr-0.5 inline h-3 w-3" /> 已关闭
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="mr-0.5 inline h-3 w-3" /> 正常
                              </>
                            )}
                          </span>
                          <button
                            onClick={() => handleToggleEnabled(u)}
                            disabled={disabled || isUniqueSuperadmin}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              u.enabled === false
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            }`}
                            title={
                              isUniqueSuperadmin
                                ? `系统保留超级管理员 ${UNIQUE_SUPERADMIN_EMAIL} 不可启用/关闭`
                                : !canManage
                                  ? '不能操作同级或更高级别的用户'
                                  : isSelf
                                    ? '不能操作自己'
                                    : u.enabled === false
                                      ? '启用账号'
                                      : '关闭账号'
                            }
                          >
                            {togglingEnabledId === u.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : u.enabled === false ? '启用' : '关闭'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{u._count?.works ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{u._count?.comments ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(u.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 仅对下级用户显示编辑按钮；唯一超级管理员不可编辑 */}
                          {canManage && !isSelf && !isUniqueSuperadmin && (
                            <button
                              onClick={() => setEditingUser(u)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-600 transition hover:bg-indigo-50"
                              title="编辑用户信息"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              编辑
                            </button>
                          )}
                          <button
                            onClick={() => setDetailUserId(u.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-600 transition hover:bg-violet-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            详情
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          {/* 超级管理员删除账号 — 垃圾桶按钮，仅 superadmin 可见，且只显示在可操作的下级用户；唯一超级管理员不可删除 */}
                          {canDeleteAccounts && canManage && !isSelf && !isUniqueSuperadmin && (
                            <button
                              onClick={() => handleClickDeleteUser(u)}
                              disabled={deletingUserId === u.id}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              title="永久删除账号及其关联数据（作品/评论/点赞/项目/订单/订阅/额度）"
                            >
                              {deletingUserId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 用户详情抽屉 */}
      {detailUserId && (
        <UserDetailDrawer
          userId={detailUserId}
          currentUserId={currentUserId}
          role={role}
          onClose={() => setDetailUserId(null)}
          onError={onError}
        />
      )}

      {/* 编辑下级用户信息弹窗 */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          saving={updatingId === editingUser.id}
          onSave={handleSaveEdit}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* 超级管理员删除账号 — 密码二次确认弹窗 */}
      {deleteUserPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !deletingUserId && setDeleteUserPrompt(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldX className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-neutral-900">确认永久删除账号</h3>
                <p className="mt-1 text-xs text-neutral-500">此操作不可撤销，请谨慎操作</p>
              </div>
              <button
                type="button"
                onClick={() => !deletingUserId && setDeleteUserPrompt(null)}
                disabled={!!deletingUserId}
                className="ml-auto rounded-md p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold">目标账号：</span>
                <span className="truncate">{deleteUserPrompt.nickname || '未命名用户'}</span>
                <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                  {ROLE_LABELS[deleteUserPrompt.role] ?? deleteUserPrompt.role}
                </span>
              </div>
              <div className="truncate">
                <span className="font-semibold">邮箱：</span>
                <span className="font-mono">{deleteUserPrompt.email}</span>
              </div>
              <div className="mt-3 border-t border-rose-200/70 pt-2 text-xs leading-relaxed text-rose-800">
                <div className="mb-1 font-semibold">将同时清除以下关联数据：</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>全部作品（{deleteUserPrompt._count?.works ?? 0}）及其下评论 / 点赞</li>
                  <li>全部评论（{deleteUserPrompt._count?.comments ?? 0}）与全部点赞</li>
                  <li>全部项目（分镜 / 章节）、生成记录、任务、订阅</li>
                  <li>用户额度、充值订单、全部个人资料</li>
                </ul>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                请输入您的登录密码以确认删除
              </label>
              <input
                ref={deletePasswordRef}
                type="password"
                value={deleteConfirmPassword}
                onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmDeleteUser()
                }}
                placeholder="您当前账号的登录密码"
                disabled={!!deletingUserId}
                className="input"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteUserPrompt(null)}
                disabled={!!deletingUserId}
                className="btn-outline !px-3 !py-2 text-sm disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteUser()}
                disabled={!!deletingUserId || !deleteConfirmPassword}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingUserId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                永久删除该账号
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 编辑下级用户信息弹窗 =====
export function EditUserDialog({
  user,
  saving,
  onSave,
  onClose,
}: {
  user: AdminUser
  saving: boolean
  onSave: (data: { nickname: string; email: string; bio: string }) => void
  onClose: () => void
}) {
  const [nickname, setNickname] = useState(user.nickname || '')
  const [email, setEmail] = useState(user.email || '')
  const [bio, setBio] = useState(user.bio || '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-neutral-900">编辑用户信息</h3>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="input"
              placeholder="用户昵称"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="用户邮箱"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input min-h-[80px] resize-y"
              placeholder="用户简介（可选）"
              rows={3}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn-outline !px-4 !py-2 text-sm">
            取消
          </button>
          <button
            onClick={() => onSave({ nickname, email, bio })}
            disabled={saving}
            className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 用户详情抽屉 =====
export function UserDetailDrawer({
  userId,
  currentUserId,
  role,
  onClose,
  onError,
}: {
  userId: string
  currentUserId: string
  role?: Role
  onClose: () => void
  onError: (e: string) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 启用/关闭账号
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  // 充值弹窗
  const [showRecharge, setShowRecharge] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState('10000')
  const [recharging, setRecharging] = useState(false)
  // 修改套餐/额度（superadmin）
  const [editingPlan, setEditingPlan] = useState(false)
  const [planDraftId, setPlanDraftId] = useState('')
  const [planDraftTokens, setPlanDraftTokens] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)

  const reload = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<{ detail: UserDetail } | UserDetail>(`/api/admin/users/${userId}`)
      .then((res) => {
        if (cancelled) return
        const d = (res as { detail?: UserDetail }).detail ?? (res as UserDetail)
        setDetail(d)
      })
      .catch((e) => {
        if (cancelled) return
        setError((e as Error).message)
        onError((e as Error).message)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [userId, onError])

  useEffect(() => {
    reload()
  }, [reload])

  const handleToggleEnabled = async () => {
    if (!detail) return
    if (detail.user.id === currentUserId) { onError('不能操作自己的账号'); return }
    if (detail.user.role === 'superadmin') { onError('不能操作超级管理员'); return }
    const newVal = !detail.user.enabled
    if (!window.confirm(newVal ? `确认关闭 ${detail.user.nickname}？关闭后无法登录。` : `确认启用 ${detail.user.nickname}？`)) return
    setTogglingEnabled(true)
    try {
      await api.put(`/api/admin/users/${userId}/enabled`, { enabled: newVal })
      setDetail((prev) => prev ? { ...prev, user: { ...prev.user, enabled: newVal } } : prev)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setTogglingEnabled(false)
    }
  }

  const handleRecharge = async () => {
    const amount = parseInt(rechargeAmount, 10)
    if (!amount || amount <= 0) { onError('请输入有效的充值金额'); return }
    setRecharging(true)
    try {
      await api.post(`/api/admin/users/${userId}/recharge`, { amount })
      setShowRecharge(false)
      reload()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setRecharging(false)
    }
  }

  const openPlanEditor = () => {
    if (!detail) return
    setPlanDraftId(detail?.quota?.planId || 'free')
    setPlanDraftTokens(String(detail?.quota?.totalTokens ?? 0))
    setEditingPlan(true)
  }

  const handleSavePlan = async () => {
    if (!detail) return
    const totalTokens = parseInt(planDraftTokens, 10)
    if (!planDraftId) { onError('请选择套餐'); return }
    if (!totalTokens || totalTokens < 0) { onError('请输入有效的额度'); return }
    setSavingPlan(true)
    try {
      await api.put(`/api/admin/users/${userId}/plan`, { planId: planDraftId, totalTokens })
      setEditingPlan(false)
      reload()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSavingPlan(false)
    }
  }

  // 权限判定
  const canManageEnabled = detail ? detail.user.role !== 'superadmin' && detail.user.id !== currentUserId : false
  const canModifyPlan = role === 'superadmin' && detail?.user.id !== currentUserId
  const canRecharge = role === 'superadmin'

  // quota 空值安全访问（后端保证有，前端做 defense-in-depth）
  const q = detail?.quota ?? { totalTokens: 0, usedTokens: 0, remainingTokens: 0, planId: null }

  return (
    <Drawer title="用户详情" onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : !detail ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <Users className="h-8 w-8" />
          <p className="mt-3 text-sm">未找到用户信息</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 基本信息 */}
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-4">
              <UserAvatar user={detail.user} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-neutral-900">{detail.user.nickname || '—'}</h3>
                  <span
                    className={`chip ${
                      detail.user.role === 'superadmin'
                        ? 'border-violet-200 bg-violet-50 text-violet-600'
                        : detail.user.role === 'admin'
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                    }`}
                  >
                    {ROLE_LABELS[detail.user.role] ?? detail.user.role}
                  </span>
                  <span
                    className={`chip text-[10px] ${
                      !detail.user.enabled
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {!detail.user.enabled ? (
                      <><UserX className="mr-0.5 inline h-3 w-3" /> 账号已关闭</>
                    ) : (
                      <><ShieldCheck className="mr-0.5 inline h-3 w-3" /> 账号正常</>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-500">{detail.user.email}</div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  注册于 {formatDateTime(detail.user.createdAt)} · 更新于 {formatDateTime(detail.user.updatedAt)}
                </div>
                {detail.user.bio && (
                  <p className="mt-2 text-sm text-neutral-600">{detail.user.bio}</p>
                )}
              </div>
            </div>

            {/* 管理操作按钮组 */}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
              {canRecharge && (
                <button
                  onClick={() => setShowRecharge(true)}
                  className="btn-outline !px-3 !py-1.5 text-sm"
                >
                  <Zap className="h-4 w-4 text-violet-600" />
                  充值积分
                </button>
              )}
              {canModifyPlan && !editingPlan && (
                <button onClick={openPlanEditor} className="btn-outline !px-3 !py-1.5 text-sm">
                  <Settings2 className="h-4 w-4 text-violet-600" />
                  修改套餐/额度
                </button>
              )}
              <button
                onClick={handleToggleEnabled}
                disabled={!canManageEnabled || togglingEnabled}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  !detail.user.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
                title={
                  !canManageEnabled
                    ? detail.user.role === 'superadmin'
                      ? '不能操作超级管理员'
                      : '不能操作自己的账号'
                    : undefined
                }
              >
                {togglingEnabled ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !detail.user.enabled ? (
                  <><ShieldCheck className="h-4 w-4" /> 启用账号</>
                ) : (
                  <><AlertTriangle className="h-4 w-4" /> 关闭账号</>
                )}
              </button>
            </div>
          </section>

          {/* 修改套餐/额度表单（superadmin） */}
          {editingPlan && canModifyPlan && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-violet-800">
                <Settings2 className="h-4 w-4" />
                修改套餐 / 总额度
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-violet-700">订阅套餐</label>
                  <select
                    value={planDraftId}
                    onChange={(e) => setPlanDraftId(e.target.value)}
                    className="input !py-1.5 text-sm"
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-violet-700">
                    总额度（积分）<span className="ml-1 text-[10px] text-violet-500">将按增量自动调整剩余额度</span>
                  </label>
                  <input
                    type="number"
                    value={planDraftTokens}
                    onChange={(e) => setPlanDraftTokens(e.target.value)}
                    className="input !py-1.5 text-sm"
                    min={0}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditingPlan(false)}
                    className="btn-outline !px-3 !py-1.5 text-sm"
                  >取消</button>
                  <button
                    onClick={handleSavePlan}
                    disabled={savingPlan}
                    className="btn-primary !px-3 !py-1.5 text-sm"
                  >
                    {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />}
                    保存修改
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 积分额度卡片 */}
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <Zap className="h-4 w-4 text-violet-600" />
              积分额度
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-neutral-50 p-2">
                <div className="text-xs text-neutral-500">总额度</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {formatNumber(q.totalTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 p-2">
                <div className="text-xs text-amber-600">已用</div>
                <div className="mt-1 text-sm font-semibold text-amber-700">
                  {formatNumber(q.usedTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <div className="text-xs text-emerald-600">剩余</div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  {formatNumber(q.remainingTokens)}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <ProgressBar
                value={q.usedTokens}
                max={q.totalTokens || 1}
                color="bg-amber-400"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
                <span>套餐：{PLAN_OPTIONS.find(p => p.id === q.planId)?.label ?? q.planId ?? '无'}</span>
                <span>已使用 {q.totalTokens ? Math.round((q.usedTokens / q.totalTokens) * 100) : 0}%</span>
              </div>
            </div>
          </section>

          {/* 数据统计卡片 */}
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <BarChart3 className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {detail.usageStats.totalGenerations ?? 0}
              </div>
              <div className="text-[11px] text-neutral-500">生成次数</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <Zap className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {formatNumber(detail.usageStats.totalTokensUsed)}
              </div>
              <div className="text-[11px] text-neutral-500">积分消耗</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <Heart className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {detail.user._count?.likes ?? 0}
              </div>
              <div className="text-[11px] text-neutral-500">获赞数</div>
            </div>
          </section>

          {/* 作品 / 评论 统计 */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <span className="text-neutral-500">作品数</span>
              <span className="ml-2 font-semibold text-neutral-900">{detail.user._count?.works ?? 0}</span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <span className="text-neutral-500">评论数</span>
              <span className="ml-2 font-semibold text-neutral-900">{detail.user._count?.comments ?? 0}</span>
            </div>
          </section>

          {/* 最近 20 条生成记录 */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <Activity className="h-4 w-4 text-violet-600" />
              最近生成记录
            </h4>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              {detail.recentGenerations?.length ? (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50/80">
                    <tr className="text-left font-medium uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-2">类型</th>
                      <th className="px-3 py-2">模型</th>
                      <th className="px-3 py-2 text-right">积分</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {detail.recentGenerations.map((g) => (
                      <tr key={g.id} className="hover:bg-neutral-50/60">
                        <td className="px-3 py-2 text-neutral-700">
                          {WORK_TYPE_LABELS[g.type] ?? g.type}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{g.modelId || '—'}</td>
                        <td className="px-3 py-2 text-right text-neutral-700">
                          {formatNumber(g.tokensUsed)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`chip text-[10px] ${
                              g.status === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : g.status === 'failed'
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-neutral-500">{formatDateTime(g.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                  <Activity className="h-6 w-6" />
                  <p className="mt-2 text-xs">暂无生成记录</p>
                </div>
              )}
            </div>
          </section>

          {/* 充值弹窗 */}
          {showRecharge && (
            <Modal
              title={`为 ${detail.user.nickname} 充值积分`}
              onClose={() => !recharging && setShowRecharge(false)}
              footer={
                <>
                  <button
                    onClick={() => setShowRecharge(false)}
                    disabled={recharging}
                    className="btn-outline !px-3 !py-1.5 text-sm"
                  >取消</button>
                  <button
                    onClick={handleRecharge}
                    disabled={recharging}
                    className="btn-primary !px-3 !py-1.5 text-sm"
                  >
                    {recharging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    确认充值
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">当前剩余</span>
                    <span className="font-semibold text-emerald-600">{formatNumber(q.remainingTokens)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-neutral-500">充值后预计剩余</span>
                    <span className="font-semibold text-violet-600">
                      {formatNumber(q.remainingTokens + (parseInt(rechargeAmount, 10) || 0))}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">充值数量（积分）</label>
                  <input
                    type="number"
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    className="input"
                    min={1}
                    step={1000}
                    autoFocus
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-neutral-500">快捷充值</div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_RECHARGE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRechargeAmount(String(v))}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      >
                        +{formatNumber(v)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </Drawer>
  )
}
