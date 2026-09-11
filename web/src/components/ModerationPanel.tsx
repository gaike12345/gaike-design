// 内容审核监控面板（管理后台）
// 双审核违规记录 + 风险用户管理 + 风险操作 + 审核配置
// 数据来自 /api/admin/moderation/*

import { useState, useEffect, useCallback, type ComponentType, type SVGProps } from 'react'
import {
  Shield, AlertTriangle, ShieldAlert, ShieldCheck, Users,
  FileWarning, Activity, Filter, ChevronLeft, ChevronRight,
  CheckCircle2, Ban, Unlock, Loader2, X,
  Settings, Server,
} from 'lucide-react'
import { getToken } from '../services/api'
import logger from '../utils/logger'
import { cn } from '../lib/utils'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

interface ModerationLog {
  id: string
  userId: string
  stage: string
  endpoint: string
  content: string
  result: string
  riskLevel: string
  reason: string | null
  categories: string | null
  provider: string
  placeholder: boolean
  handled: boolean
  createdAt: string
  user?: {
    id: string
    email: string
    nickname: string
    avatar: string | null
    role: string
    riskLevel: number
    violationCount: number
  }
}

interface RiskUser {
  id: string
  email: string
  nickname: string
  avatar: string | null
  role: string
  riskLevel: number
  violationCount: number
  riskUpdatedAt: string | null
  riskNote: string | null
  enabled: boolean
  createdAt: string
}

interface ModConfig {
  enabled: boolean
  mode: 'demo' | 'provider'  // demo=未配置服务商API；provider=服务商API已接入
  provider: string
  hasApiKey: boolean
}

interface Stats {
  total: number
  today: number
  unhandled: number
  riskUsers: number
  blockedUsers: number
  byLevel: { high: number; medium: number; low: number }
  byStage: { input: number; output: number }
}

const RISK_LABELS = ['正常', '警告', '限制', '封禁']
const RISK_COLORS = ['text-emerald-600', 'text-amber-600', 'text-orange-600', 'text-red-600']
const RISK_BG = ['bg-emerald-50', 'bg-amber-50', 'bg-orange-50', 'bg-red-50']

async function apiGet<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  return res.json()
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  return res.json()
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) })
  return res.json()
}

export default function ModerationPanel() {
  const [tab, setTab] = useState<'logs' | 'users' | 'config'>('logs')
  const [stats, setStats] = useState<Stats | null>(null)
  const [logs, setLogs] = useState<{ items: ModerationLog[]; total: number }>({ items: [], total: 0 })
  const [users, setUsers] = useState<{ items: RiskUser[]; total: number }>({ items: [], total: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ result: '', riskLevel: '', stage: '' })
  const [riskModal, setRiskModal] = useState<RiskUser | null>(null)
  const [riskForm, setRiskForm] = useState({ riskLevel: 1, note: '' })
  const [operating, setOperating] = useState(false)
  const [modConfig, setModConfig] = useState<ModConfig | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [confirmModal, setConfirmModal] = useState<null | { value: boolean; label: string }>(null)

  const pageSize = 20

  const loadStats = useCallback(async () => {
    try {
      const r = await apiGet<{ ok: boolean; stats: Stats }>('/api/admin/moderation/stats')
      if (r.ok && r.stats) setStats(r.stats)
    } catch (e) {
      logger.error('Moderation', '加载统计失败:', e)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (filter.result) params.set('result', filter.result)
      if (filter.riskLevel) params.set('riskLevel', filter.riskLevel)
      if (filter.stage) params.set('stage', filter.stage)
      const r = await apiGet<{ ok: boolean; items: ModerationLog[]; total: number }>(
        `/api/admin/moderation/logs?${params}`,
      )
      if (r.ok) setLogs({ items: r.items || [], total: r.total || 0 })
    } catch (e) {
      logger.error('Moderation', '加载违规记录失败:', e)
    } finally { setLoading(false) }
  }, [page, filter])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const r = await apiGet<{ ok: boolean; items: RiskUser[]; total: number }>(
        `/api/admin/moderation/risk-users?${params}`,
      )
      if (r.ok) setUsers({ items: r.items || [], total: r.total || 0 })
    } catch (e) {
      logger.error('Moderation', '加载风险用户失败:', e)
    } finally { setLoading(false) }
  }, [page])

  const loadConfig = useCallback(async () => {
    try {
      const r = await apiGet<{ ok: boolean; config: ModConfig }>('/api/admin/moderation/config')
      if (r.ok && r.config) {
        setModConfig(r.config)
      }
    } catch (e) {
      logger.error('Moderation', '加载审核配置失败:', e)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => {
    if (tab === 'logs') loadLogs()
    else if (tab === 'users') loadUsers()
    else loadConfig()
  }, [tab, loadLogs, loadUsers, loadConfig])

  const requestToggleEnabled = () => {
    if (!modConfig) return
    const next = !modConfig.enabled
    setConfirmModal({ value: next, label: `${next ? '开启' : '关闭'}内容审核总开关` })
  }

  const confirmChange = async () => {
    if (!confirmModal) return
    setSavingCfg(true)
    try {
      await apiPut<{ ok: boolean }>('/api/admin/moderation/config', { enabled: confirmModal.value })
      setConfirmModal(null)
      await loadConfig()
    } catch (e) {
      logger.error('Moderation', '保存配置失败:', e)
    } finally { setSavingCfg(false) }
  }

  const openRiskModal = (u: RiskUser) => {
    setRiskModal(u)
    setRiskForm({ riskLevel: u.riskLevel, note: u.riskNote || '' })
  }

  const submitRisk = async () => {
    if (!riskModal) return
    setOperating(true)
    try {
      await apiPost(`/api/admin/moderation/users/${riskModal.id}/risk`, riskForm)
      setRiskModal(null)
      loadUsers()
      loadStats()
    } catch (e) {
      logger.error('Moderation', '风险操作失败:', e)
    } finally { setOperating(false) }
  }

  const markHandled = async (id: string) => {
    try {
      await apiPost(`/api/admin/moderation/logs/${id}/handle`, {})
      loadLogs()
    } catch (e) {
      logger.error('Moderation', '标记已处理失败:', e)
    }
  }

  const totalPages = Math.ceil((tab === 'logs' ? logs.total : users.total) / pageSize)

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={FileWarning} label="违规总数" value={stats?.total ?? 0} sub={`今日 ${stats?.today ?? 0}`} color="rose" />
        <StatCard icon={AlertTriangle} label="待处理" value={stats?.unhandled ?? 0} color="amber" />
        <StatCard icon={Users} label="风险用户" value={stats?.riskUsers ?? 0} color="orange" />
        <StatCard icon={Ban} label="已封禁" value={stats?.blockedUsers ?? 0} color="red" />
      </div>

      {/* 分阶段统计 */}
      <div className="card flex items-center gap-4 px-4 py-3 text-xs">
        <Activity className="h-4 w-4 text-ink-400" />
        <span className="text-ink-500">输入审核拦截：<b className="text-rose-600">{stats?.byStage.input ?? 0}</b></span>
        <span className="text-ink-500">输出审核拦截：<b className="text-rose-600">{stats?.byStage.output ?? 0}</b></span>
        <span className="ml-auto text-ink-400">
          高危 <b className="text-red-600">{stats?.byLevel.high ?? 0}</b> ·
          中危 <b className="text-orange-600">{stats?.byLevel.medium ?? 0}</b> ·
          低危 <b className="text-amber-600">{stats?.byLevel.low ?? 0}</b>
        </span>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-ink-200">
        <TabBtn active={tab === 'logs'} onClick={() => { setTab('logs'); setPage(1) }} icon={FileWarning} label="违规记录" count={logs.total} />
        <TabBtn active={tab === 'users'} onClick={() => { setTab('users'); setPage(1) }} icon={Users} label="风险用户" count={users.total} />
        <TabBtn active={tab === 'config'} onClick={() => setTab('config')} icon={Settings} label="审核配置" />
      </div>

      {/* 违规记录列表 */}
      {tab === 'logs' && (
        <div className="space-y-3">
          {/* 筛选 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="h-3 w-3 text-ink-400" />
            <select value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })} className="input !w-auto !py-1">
              <option value="">全部结果</option>
              <option value="block">拦截</option>
              <option value="pass">通过</option>
            </select>
            <select value={filter.riskLevel} onChange={(e) => setFilter({ ...filter, riskLevel: e.target.value })} className="input !w-auto !py-1">
              <option value="">全部等级</option>
              <option value="high">高危</option>
              <option value="medium">中危</option>
              <option value="low">低危</option>
            </select>
            <select value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} className="input !w-auto !py-1">
              <option value="">全部阶段</option>
              <option value="input">输入审核</option>
              <option value="output">输出审核</option>
            </select>
            <button onClick={loadLogs} className="btn-ghost !px-2 !py-1">刷新</button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>
          ) : logs.items.length === 0 ? (
            <div className="card py-12 text-center text-sm text-ink-400">暂无违规记录</div>
          ) : (
            <div className="space-y-2">
              {logs.items.map((log) => (
                <div key={log.id} className="card flex items-start gap-3 px-3 py-2.5 text-xs">
                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    log.riskLevel === 'high' ? 'bg-red-50' : log.riskLevel === 'medium' ? 'bg-orange-50' : 'bg-amber-50')}>
                    {log.stage === 'input' ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : <ShieldAlert className="h-3.5 w-3.5 text-orange-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-semibold', log.riskLevel === 'high' ? 'text-red-600' : log.riskLevel === 'medium' ? 'text-orange-600' : 'text-amber-600')}>
                        {log.stage === 'input' ? '输入审核' : '输出审核'} · {log.riskLevel === 'high' ? '高危' : log.riskLevel === 'medium' ? '中危' : '低危'}
                      </span>
                      <span className="text-ink-400">{new Date(log.createdAt).toLocaleString('zh-CN')}</span>
                      {log.placeholder && <span className="chip bg-amber-50 text-amber-700">demo</span>}
                      {log.handled && <span className="chip bg-emerald-50 text-emerald-700">已处理</span>}
                    </div>
                    <div className="mt-1 text-ink-600">
                      <span className="text-ink-400">用户：</span>{log.user?.nickname || log.user?.email || log.userId}
                      <span className="mx-1 text-ink-300">|</span>
                      <span className="text-ink-400">接口：</span>{log.endpoint}
                    </div>
                    <div className="mt-0.5 text-ink-700">原因：{log.reason}</div>
                    <div className="mt-0.5 truncate text-ink-400">内容：{log.content}</div>
                  </div>
                  {!log.handled && (
                    <button onClick={() => markHandled(log.id)} className="shrink-0 rounded px-2 py-1 text-ink-500 hover:bg-ink-50">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 风险用户列表 */}
      {tab === 'users' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>
          ) : users.items.length === 0 ? (
            <div className="card py-12 text-center text-sm text-ink-400">暂无风险用户</div>
          ) : (
            users.items.map((u) => (
              <div key={u.id} className="card flex items-center gap-3 px-3 py-2.5 text-xs">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-white',
                  u.riskLevel >= 3 ? 'bg-red-500' : u.riskLevel === 2 ? 'bg-orange-500' : 'bg-amber-500')}>
                  {u.riskLevel >= 3 ? <Ban className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-800">{u.nickname}</span>
                    <span className={cn('chip', RISK_BG[u.riskLevel], RISK_COLORS[u.riskLevel])}>风险{u.riskLevel}·{RISK_LABELS[u.riskLevel]}</span>
                    <span className="text-ink-400">违规 {u.violationCount} 次</span>
                    {!u.enabled && <span className="chip bg-red-50 text-red-700">已停用</span>}
                  </div>
                  <div className="mt-0.5 text-ink-400">{u.email} · {u.riskUpdatedAt ? `更新于 ${new Date(u.riskUpdatedAt).toLocaleString('zh-CN')}` : '无记录'}</div>
                  {u.riskNote && <div className="mt-0.5 text-ink-500">备注：{u.riskNote}</div>}
                </div>
                <button onClick={() => openRiskModal(u)} className="shrink-0 rounded border border-ink-200 px-2 py-1 text-ink-600 hover:bg-ink-50">
                  风险操作
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-ink-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 风险操作弹窗 */}
      {riskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRiskModal(null)}>
          <div className="w-96 rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <span className="font-semibold text-ink-800">风险操作 - {riskModal.nickname}</span>
              <button onClick={() => setRiskModal(null)} className="ml-auto text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-3 text-xs text-ink-500">
              当前：风险{riskModal.riskLevel}（{RISK_LABELS[riskModal.riskLevel]}） · 违规 {riskModal.violationCount} 次
            </div>
            <div className="mb-3 space-y-1.5">
              {[
                { v: 0, label: '正常（重置）', icon: Unlock, color: 'text-emerald-600' },
                { v: 1, label: '警告', icon: AlertTriangle, color: 'text-amber-600' },
                { v: 2, label: '限制（AI生成需复核）', icon: ShieldCheck, color: 'text-orange-600' },
                { v: 3, label: '封禁 AI 生成', icon: Ban, color: 'text-red-600' },
              ].map(({ v, label, icon: Icon, color }) => (
                <button key={v} onClick={() => setRiskForm({ ...riskForm, riskLevel: v })}
                  className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                    riskForm.riskLevel === v ? 'border-rose-300 bg-rose-50' : 'border-ink-200 hover:bg-ink-50')}>
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                  <span className="text-ink-700">{label}</span>
                </button>
              ))}
            </div>
            <textarea
              value={riskForm.note}
              onChange={(e) => setRiskForm({ ...riskForm, note: e.target.value })}
              placeholder="操作备注（可选）"
              className="input mb-3 h-16 resize-none text-xs"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRiskModal(null)} className="btn-ghost !px-3 !py-1.5 text-xs">取消</button>
              <button onClick={submitRisk} disabled={operating}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700 disabled:opacity-50">
                {operating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '确认操作'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 审核配置 */}
      {tab === 'config' && modConfig && (
        <div className="space-y-4">
          {/* 模式状态 */}
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-semibold text-ink-800">审核模式</span>
              <span className={cn('chip', modConfig.mode === 'demo' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                {modConfig.mode === 'demo' ? 'Demo 模式（未配置服务商API）' : `服务商模式（${modConfig.provider}）`}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              {modConfig.mode === 'demo'
                ? '当前未配置审核服务商 API Key，所有 AI 生成内容将跳过审核。配置 MODERATION_API_KEY 环境变量后可接入阿里云/智谱等内容安全服务商进行输入+输出双审核。'
                : `已接入服务商 ${modConfig.provider}，输入+输出双审核已启用。`}
            </p>
          </div>

          {/* 总开关 */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-semibold text-ink-800">内容审核总开关</span>
              </div>
              <button onClick={requestToggleEnabled}
                className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', modConfig.enabled ? 'bg-rose-500' : 'bg-ink-300')}>
                <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white transition-transform', modConfig.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>
            {!modConfig.enabled && (
              <p className="text-xs text-red-600">审核已关闭，所有 AI 生成接口将跳过输入/输出审核。仅审核服务故障时应急使用，请尽快重新开启。</p>
            )}
          </div>
        </div>
      )}

      {/* 配置变更二次确认弹窗 */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card w-full max-w-md p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-semibold text-ink-800">配置变更确认</span>
            </div>
            <p className="text-sm text-ink-700">{confirmModal.label}</p>
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              {confirmModal.value === false
                ? '关闭审核后，所有 AI 生成接口将跳过输入/输出审核，违规内容将不再被拦截。请仅在审核服务故障时使用，并尽快重新开启。'
                : '配置变更将立即生效。'}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmModal(null)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50">取消</button>
              <button onClick={confirmChange} disabled={savingCfg}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700 disabled:opacity-50">
                {savingCfg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '确认变更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: IconComponent; label: string; value: number; sub?: string; color: string }) {
  const bg = { rose: 'bg-rose-50', amber: 'bg-amber-50', orange: 'bg-orange-50', red: 'bg-red-50' }[color] || 'bg-ink-50'
  const text = { rose: 'text-rose-600', amber: 'text-amber-600', orange: 'text-orange-600', red: 'text-red-600' }[color] || 'text-ink-600'
  return (
    <div className="card flex items-center gap-3 px-3 py-2.5">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', bg)}>
        <Icon className={cn('h-4 w-4', text)} />
      </div>
      <div>
        <div className="text-lg font-bold text-ink-800">{value}</div>
        <div className="text-[10px] text-ink-500">{label}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: IconComponent; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px',
      active ? 'border-rose-500 text-rose-600' : 'border-transparent text-ink-500 hover:text-ink-700')}>
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count !== undefined && <span className="chip bg-ink-100 text-ink-600">{count}</span>}
    </button>
  )
}
