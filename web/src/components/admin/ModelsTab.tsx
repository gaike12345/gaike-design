// 模型管理模块 — 从 AdminPage.tsx 抽取
//
// 包含：
//   - ModelRow: 模型行组件（板块分组视图/供应商分组视图 共用）
//   - useProviders: 供应商列表 hook
//   - useModels: 模型列表 hook
//   - ModelsByType: 简化版模型管理（按固定 typeFilter 显示对应类型模型）
//
// 数据来源：
//   GET  /api/providers               供应商列表
//   GET  /api/models                  模型列表
//   POST /api/providers               创建供应商
//   POST /api/models                  创建模型
//   DELETE /api/models/:id            删除模型
//   PATCH  /api/models/:id/cost       更新模型积分并同步全局缓存

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Box,
  Check,
  Coins,
  Cpu,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import type { Provider, Model } from './types'
import {
  Field,
  Modal,
  MODEL_SECTION_OPTIONS,
} from './common'
import { api } from '../../services/api'
import { refreshImageModels } from '../../config/imageModels'

// ===== 模型行（板块分组视图/供应商分组视图 共用），用于去冗余渲染 =====
export function ModelRow({
  model,
  providerLabel,
  costEdits,
  setCostEdits,
  marginEdits,
  setMarginEdits,
  costSaving,
  costToast,
  statusUpdating,
  onSaveCost,
  onToggleStatus,
}: {
  model: Model
  providerLabel: string
  costEdits: Record<string, number>
  setCostEdits: Dispatch<SetStateAction<Record<string, number>>>
  marginEdits: Record<string, number>
  setMarginEdits: Dispatch<SetStateAction<Record<string, number>>>
  costSaving: string | null
  costToast: { id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null
  statusUpdating: string | null
  onSaveCost: (m: Model) => void
  onToggleStatus: (m: Model) => void
}) {
  const editVal = costEdits[model.id]
  const displayVal = editVal !== undefined ? editVal : (model.costTokens ?? 1000)
  const marginVal = marginEdits[model.id]
  const displayMargin = marginVal !== undefined ? marginVal : (model.margin ?? 0)
  const costDirty = editVal !== undefined && editVal !== (model.costTokens ?? 1000)
  const marginDirty = marginVal !== undefined && marginVal !== (model.margin ?? 0)
  const dirty = costDirty || marginDirty
  const saving = costSaving === model.id
  const statusBusy = statusUpdating === model.id
  const isActive = (model.status ?? 'active') === 'active'
  // margin 语义已改为"毛利率百分比"，直接存储 0/50/100 等值，无需转换
  const toast = costToast && costToast.id === model.id ? costToast : null
  const sectionInfo = MODEL_SECTION_OPTIONS.find((s) => s.key === model.type as 'novel' | 'image' | 'audio' | 'video')
  return (
    <li className={`flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-3 ${isActive ? '' : 'opacity-60'}`}>
      <div className="flex min-w-0 items-start gap-2 md:items-center">
        <Box className="h-4 w-4 shrink-0 text-neutral-400 mt-0.5 md:mt-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-neutral-800">
              {model.displayName || model.name}
            </span>
            {sectionInfo && (
              <span className={`chip border text-[10px] ${sectionInfo.accent}`}>
                {sectionInfo.label.split(' ')[1] ?? sectionInfo.key}
              </span>
            )}
            {!sectionInfo && model.type && (
              <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500 text-[10px]">
                {model.type}
              </span>
            )}
            {model.tag && (
              <span className="chip border border-violet-200 bg-violet-50 text-violet-600 text-[10px]">
                {model.tag}
              </span>
            )}
            <span className="text-[10px] text-neutral-400 truncate">供应商：{providerLabel}</span>
            {!isActive && (
              <span className="chip border border-neutral-300 bg-neutral-100 text-neutral-500 text-[10px]">
                已禁用
              </span>
            )}
          </div>
          {model.desc && <div className="truncate text-xs text-neutral-400">{model.desc}</div>}
        </div>
      </div>
      {/* 积分消耗 + 毛利率内联编辑 + 同步全局按钮 + 启用开关 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <input
            type="number"
            min={0}
            step={50}
            value={displayVal}
            onChange={(e) =>
              setCostEdits((prev) => ({ ...prev, [model.id]: Math.max(0, Number(e.target.value) || 0) }))
            }
            className="w-24 border-0 bg-transparent p-0 text-xs font-medium tabular-nums text-neutral-800 focus:outline-none focus:ring-0"
            aria-label={`${model.displayName || model.name} 积分调用量`}
          />
          <span className="shrink-0 text-[11px] text-neutral-500">积分/次</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
          <Percent className="h-3.5 w-3.5 text-violet-500" />
          <input
            type="number"
            min={0}
            max={99}
            step={1}
            value={displayMargin}
            onChange={(e) =>
              setMarginEdits((prev) => ({ ...prev, [model.id]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) }))
            }
            className="w-16 border-0 bg-transparent p-0 text-xs font-medium tabular-nums text-neutral-800 focus:outline focus:ring-0"
            aria-label={`${model.displayName || model.name} 毛利率`}
          />
          <span className="shrink-0 text-[11px] text-neutral-500">毛利率%</span>
        </div>
        <button
          onClick={() => onSaveCost(model)}
          disabled={saving || !dirty}
          title={dirty ? '保存并同步全局缓存' : saving ? '保存中…' : '修改后点击保存'}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:bg-white disabled:hover:text-neutral-700"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : dirty ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5 text-neutral-300" />
          )}
          {dirty ? '保存·同步全局' : saving ? '保存中' : '已同步'}
        </button>
        {toast && (
          <span className={`chip border ${toast.changed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-neutral-200 bg-neutral-50 text-neutral-500'}`}>
            {toast.changed
              ? `✓ 已同步全局：${toast.from} → ${toast.to}（缓存已失效，下一次请求立即生效）`
              : `值未变化（${toast.to}），无需刷新缓存`}
          </span>
        )}
        <button
          onClick={() => onToggleStatus(model)}
          disabled={statusBusy}
          title={isActive ? '点击禁用该模型（画布将不再展示）' : '点击重新启用该模型'}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
            isActive
              ? 'text-emerald-600 hover:bg-emerald-50'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
          }`}
        >
          {statusBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isActive ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {isActive ? '启用中' : '已禁用'}
        </button>
      </div>
    </li>
  )
}

// ===== 供应商列表 hook（多实例共享，每次 ModelsTab 挂载独立加载）=====
export function useProviders(onError: (e: string) => void) {
  const [providers, setProviders] = useState<Provider[]>([])
  const loadProviders = useCallback(async () => {
    try {
      const res = await api.get<{ providers: Provider[] }>('/api/providers')
      setProviders(res.providers ?? [])
    } catch (e) {
      onError((e as Error).message)
      setProviders([])
    }
  }, [onError])
  useEffect(() => { loadProviders() }, [loadProviders])
  return { providers, reloadProviders: loadProviders }
}

// ===== 模型列表 hook（带 loading 状态 + reload，管理后台需要看禁用模型）=====
export function useModels(onError: (e: string) => void) {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)
  const loadModels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ models: Model[] }>('/api/models?includeInactive=true')
      setModels(res.models ?? [])
    } catch (e) {
      onError((e as Error).message)
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [onError])
  useEffect(() => { loadModels() }, [loadModels])
  // 监听全局批量更新事件（如 PollinationsSyncPanel 批量设置毛利率后），自动刷新模型列表
  useEffect(() => {
    const handler = () => { void loadModels() }
    window.addEventListener('models-batch-updated', handler)
    return () => window.removeEventListener('models-batch-updated', handler)
  }, [loadModels])
  return { models, setModels, loading, reload: loadModels }
}

// ===== 简化版模型管理：按固定 typeFilter 只显示对应类型的模型列表（板块功能子导航内嵌）=====
export function ModelsByType({ onError, typeFilter }: { onError: (e: string) => void; typeFilter: string[] }) {
  const { providers } = useProviders(onError)
  const { models, setModels, loading, reload } = useModels(onError)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<{ type: 'create' } | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 模型表单
  const [mName, setMName] = useState('')
  const [mDisplayName, setMDisplayName] = useState('')
  const [mProviderId, setMProviderId] = useState('')
  const [mTag, setMTag] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mCostTokens, setMCostTokens] = useState<number>(1000)
  const [mConfig, setMConfig] = useState('')
  const [mConfigError, setMConfigError] = useState('')
  // typeFilter 对应的类型标签（用于锁定 type 选择）
  const typeLabel = typeFilter.map(t => MODEL_SECTION_OPTIONS.find(o => o.key === t)?.label.split(' ')[1]?.replace(/[()]/g, '') ?? t).join(' / ')

  // 积分内联编辑
  // 积分 + 毛利率内联编辑
  const [costEdits, setCostEdits] = useState<Record<string, number>>({})
  const [marginEdits, setMarginEdits] = useState<Record<string, number>>({})
  const [costSaving, setCostSaving] = useState<string | null>(null)
  const [costToast, setCostToast] = useState<{ id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null>(null)
  // 模型列表排序方式：默认 / 积分高→低 / 积分低→高 / 首字母 A→Z
  const [sortBy, setSortBy] = useState<'default' | 'cost-desc' | 'cost-asc' | 'name-asc'>('default')

  const filteredModels = useMemo(() => {
    const list = models.filter((m) => typeFilter.includes(m.type))
    const sorted = [...list]
    switch (sortBy) {
      case 'cost-desc':
        // 积分高 → 低（缺省值视为 0，放末尾）
        sorted.sort((a, b) => (b.costTokens ?? 0) - (a.costTokens ?? 0))
        break
      case 'cost-asc':
        // 积分低 → 高
        sorted.sort((a, b) => (a.costTokens ?? 0) - (b.costTokens ?? 0))
        break
      case 'name-asc':
        // 首字母 A→Z（中文按拼音首字母，英文按字母序；displayName 优先，回退 name）
        sorted.sort((a, b) => {
          const aName = (a.displayName || a.name || '').toLowerCase()
          const bName = (b.displayName || b.name || '').toLowerCase()
          return aName.localeCompare(bName, 'zh-Hans-CN')
        })
        break
      default:
        // 默认：保持后端返回顺序（通常按创建时间）
        break
    }
    return sorted
  }, [models, typeFilter, sortBy])

  const suggestedCostForType = (t: string): number => {
    switch (t) {
      case 'novel': return 500
      case 'audio': return 800
      case 'image': return 1000
      case 'video': return 5000
      default: return 1000
    }
  }

  // typeFilter 只有一个类型时，新建模型自动建议默认积分 + 对应配置模板
  useEffect(() => {
    if (typeFilter.length === 1) {
      const t = typeFilter[0]
      setMCostTokens(suggestedCostForType(t))
      if (t === 'image') {
        setMConfig(JSON.stringify({
          ratios: [
            { id: '1:1', label: '1:1', w: 1024, h: 1024 },
            { id: '3:4', label: '3:4', w: 832, h: 1104 },
            { id: '4:3', label: '4:3', w: 1104, h: 832 },
            { id: '16:9', label: '16:9', w: 1280, h: 720 },
            { id: '9:16', label: '9:16', w: 720, h: 1280 },
          ],
          resolutions: [
            { id: '1k', label: '1K', quality: '1024px', desc: '标准清晰度', multiplier: 1.0 },
            { id: '2k', label: '2K', quality: '2048px', desc: '高清细节', multiplier: 2.0 },
            { id: '4k', label: '4K', quality: '4096px', desc: '极致超清', multiplier: 4.0 },
          ],
          defaultRatio: '1:1',
          defaultResolution: '1k',
          maxBatch: 4,
          widthMultiple: 8,
          features: { negativePrompt: true, seed: true, enhance: false },
        }, null, 2))
      } else if (t === 'video') {
        setMConfig(JSON.stringify({
          durations: [5, 10, 15, 30],
          defaultDuration: 5,
          ratios: ['16:9', '9:16', '1:1'],
          defaultRatio: '16:9',
          qualities: ['480p', '720p', '1080p'],
          defaultQuality: '720p',
          supportsImg2Video: true,
        }, null, 2))
      } else {
        setMConfig('')
      }
    }
  }, [typeFilter])

  // 批量设置毛利率后清空本地未保存的内联编辑（避免覆盖新值）
  useEffect(() => {
    const handler = () => { setCostEdits({}); setMarginEdits({}) }
    window.addEventListener('models-batch-updated', handler)
    return () => window.removeEventListener('models-batch-updated', handler)
  }, [])

  const resetModelForm = () => {
    setMName('')
    setMDisplayName('')
    setMProviderId('')
    setMTag('')
    setMDesc('')
    setMCostTokens(typeFilter.length === 1 ? suggestedCostForType(typeFilter[0]) : 1000)
    setMConfigError('')
    // 重置时保留对应类型的配置模板
    if (typeFilter.length === 1) {
      const t = typeFilter[0]
      if (t === 'image') {
        setMConfig(JSON.stringify({
          ratios: [
            { id: '1:1', label: '1:1', w: 1024, h: 1024 },
            { id: '16:9', label: '16:9', w: 1280, h: 720 },
            { id: '9:16', label: '9:16', w: 720, h: 1280 },
          ],
          resolutions: [
            { id: '1k', label: '1K', quality: '1024px', desc: '标准清晰度', multiplier: 1.0 },
            { id: '2k', label: '2K', quality: '2048px', desc: '高清细节', multiplier: 2.0 },
          ],
          defaultRatio: '1:1',
          defaultResolution: '1k',
          maxBatch: 4,
          widthMultiple: 8,
          features: { negativePrompt: true, seed: true, enhance: false },
        }, null, 2))
      } else if (t === 'video') {
        setMConfig(JSON.stringify({
          durations: [5, 10, 15, 30],
          defaultDuration: 5,
          ratios: ['16:9', '9:16', '1:1'],
          defaultRatio: '16:9',
          qualities: ['480p', '720p', '1080p'],
          defaultQuality: '720p',
          supportsImg2Video: true,
        }, null, 2))
      } else {
        setMConfig('')
      }
    } else {
      setMConfig('')
    }
  }

  // 积分制度：按模型单独 PATCH costTokens + margin 并触发全局 invalidate
  // 关键:只传用户实际修改的字段,后端按需联动
  //   - 只改 margin:后端反推 baseTokens 并按新 margin 联动 costTokens
  //   - 只改 costTokens:后端直接设
  //   - 两个都改:costTokens 优先级最高
  const handleSaveCost = async (model: Model) => {
    const costEdited = costEdits[model.id] !== undefined
    const marginEdited = marginEdits[model.id] !== undefined
    if (!costEdited && !marginEdited) return // 两个字段都没改,不发请求
    const payload: { costTokens?: number; margin?: number } = {}
    if (costEdited) {
      const nextVal = Number(costEdits[model.id])
      if (!Number.isFinite(nextVal) || nextVal < 0) return
      payload.costTokens = nextVal
    }
    if (marginEdited) {
      const nextMargin = Number(marginEdits[model.id])
      if (!Number.isFinite(nextMargin) || nextMargin < 0) return
      payload.margin = nextMargin
    }
    setCostSaving(model.id)
    try {
      const res = await api.patch<{
        model: Model
        changed?: { from: number; to: number }
        unchanged?: boolean
        cacheInvalidated?: boolean
      }>(`/api/models/${model.id}/cost`, payload)
      // 用后端返回的最终值更新本地缓存(可能含 margin 联动后的 costTokens)
      const newCost = res.model.costTokens ?? model.costTokens
      const newMargin = res.model.margin ?? model.margin
      setCostToast({
        id: model.id,
        from: model.costTokens ?? 0,
        to: newCost ?? 0,
        changed: !res.unchanged,
        unchanged: res.unchanged,
      })
      setTimeout(() => setCostToast((cur) => (cur && cur.id === model.id ? null : cur)), 3500)
      // 刷新本地 models 缓存为后端返回的最终值
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, costTokens: newCost, margin: newMargin } : m)))
      // 清除编辑态,显示后端最终值
      setCostEdits((prev) => { const n = { ...prev }; delete n[model.id]; return n })
      setMarginEdits((prev) => { const n = { ...prev }; delete n[model.id]; return n })
      // 同步刷新图片模型前端缓存
      if (model.type === 'image') void refreshImageModels()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCostSaving(null)
    }
  }

  const handleCreateModel = async () => {
    if (!mName.trim() || !mProviderId) return
    setPasswordPrompt({ type: 'create' })
    setConfirmPassword('')
  }

  // 启用/禁用模型 — 无需密码,直接调用 PATCH /status
  const handleToggleStatus = async (model: Model) => {
    const nextStatus = (model.status ?? 'active') === 'active' ? 'disabled' : 'active'
    setStatusUpdating(model.id)
    try {
      await api.patch(`/api/models/${model.id}/status`, { status: nextStatus })
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, status: nextStatus } : m)))
      if (model.type === 'image') void refreshImageModels()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setStatusUpdating(null)
    }
  }

  const handlePasswordConfirm = async () => {
    if (!passwordPrompt || !confirmPassword) return
    setPasswordSubmitting(true)
    try {
      if (passwordPrompt.type === 'create') {
        // typeFilter 只有一个类型时锁定，多个时取第一个
        const modelType = typeFilter[0]
        await api.post('/api/models', {
          name: mName.trim(),
          displayName: mDisplayName.trim() || undefined,
          type: modelType,
          providerId: mProviderId,
          tag: mTag.trim() || undefined,
          desc: mDesc.trim() || undefined,
          costTokens: Number.isFinite(mCostTokens) && mCostTokens >= 0 ? mCostTokens : suggestedCostForType(modelType),
          config: mConfig.trim() ? JSON.parse(mConfig) : undefined,
          password: confirmPassword,
        })
        setModelModalOpen(false)
        resetModelForm()
        await reload()
        // 新增的若是图片模型，刷新前端图片模型缓存
        if (modelType === 'image') void refreshImageModels()
      }
      setPasswordPrompt(null)
      setConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <div>
      {/* 简化工具栏：仅新建模型 + 刷新 */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => {
            setMProviderId(providers[0]?.id ?? '')
            setModelModalOpen(true)
          }}
          disabled={providers.length === 0}
          className="btn-outline !px-3 !py-1.5 text-sm"
          title={providers.length === 0 ? '请先在系统设置中创建供应商' : undefined}
        >
          <Plus className="h-4 w-4" />
          新建模型
        </button>
        <button onClick={reload} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <div className="ml-auto flex items-center gap-3">
          {/* 排序方式选择器：积分高/低/首字母 */}
          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="hidden sm:inline">排序</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 transition hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              <option value="default">默认</option>
              <option value="cost-desc">积分 高 → 低</option>
              <option value="cost-asc">积分 低 → 高</option>
              <option value="name-asc">首字母 A → Z</option>
            </select>
          </label>
          <span className="text-xs text-neutral-400">
            {filteredModels.length} 个模型 · 类型：{typeLabel}
          </span>
        </div>
      </div>

      {/* 模型列表（平铺，不分组） */}
      {loading && models.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-12 text-neutral-400">
          <Server className="h-8 w-8" />
          <p className="mt-2 text-sm">还没有供应商，无法创建模型</p>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-12 text-neutral-400">
          <Cpu className="h-8 w-8" />
          <p className="mt-2 text-sm">暂无 {typeLabel} 类型的模型</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {filteredModels.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                providerLabel={
                  providers.find((p) => p.id === m.providerId)?.displayName ||
                  providers.find((p) => p.id === m.providerId)?.name ||
                  m.providerId
                }
                costEdits={costEdits}
                setCostEdits={setCostEdits}
                marginEdits={marginEdits}
                setMarginEdits={setMarginEdits}
                costSaving={costSaving}
          costToast={costToast}
          statusUpdating={statusUpdating}
          onSaveCost={handleSaveCost}
          onToggleStatus={handleToggleStatus}
        />
            ))}
          </ul>
        </div>
      )}

      {/* 新建模型弹窗（type 锁定为 typeFilter） */}
      {modelModalOpen && (
        <Modal
          title={`新建模型 · ${typeLabel}`}
          onClose={() => setModelModalOpen(false)}
          footer={
            <>
              <button
                onClick={() => setModelModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateModel}
                disabled={passwordSubmitting || !mName.trim() || !mProviderId}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </button>
            </>
          }
        >
          <Field label="所属供应商" required>
            <select value={mProviderId} onChange={(e) => setMProviderId(e.target.value)} className="input">
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName || p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="名称（name）" required>
            <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="如 gpt-4o" className="input" />
          </Field>
          <Field label="显示名称（displayName）">
            <input value={mDisplayName} onChange={(e) => setMDisplayName(e.target.value)} placeholder="如 GPT-4o" className="input" />
          </Field>
          <Field label="所属板块（type）" hint={`已锁定为当前板块：${typeLabel}`}>
            <input value={typeLabel} disabled className="input cursor-not-allowed bg-neutral-50" />
          </Field>
          <Field label="标签（tag）">
            <input value={mTag} onChange={(e) => setMTag(e.target.value)} placeholder="如 推荐 / 旗舰" className="input" />
          </Field>
          <Field label="积分调用量（costTokens）" hint={`建议默认值 ${mCostTokens}`}>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 shrink-0 text-amber-500" />
              <input
                type="number"
                min={0}
                step={50}
                value={mCostTokens}
                onChange={(e) => setMCostTokens(Math.max(0, Number(e.target.value) || 0))}
                className="input"
              />
              <span className="shrink-0 text-xs text-neutral-500">积分/次</span>
            </div>
          </Field>
          <Field label="描述（desc）">
            <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={2} placeholder="模型能力 / 适用场景" className="input resize-none" />
          </Field>

          {/* 高级配置 JSON（image / video 类型显示） */}
          {(typeFilter.includes('image') || typeFilter.includes('video')) && (
            <Field
              label="高级配置（config JSON）"
              hint={typeFilter.includes('image')
                ? '图片模型：ratios / resolutions / defaultRatio / defaultResolution / maxBatch / features'
                : '视频模型：durations / defaultDuration / ratios / qualities / supportsImg2Video'}
            >
              <textarea
                value={mConfig}
                onChange={(e) => {
                  setMConfig(e.target.value)
                  try {
                    if (e.target.value.trim()) JSON.parse(e.target.value)
                    setMConfigError('')
                  } catch {
                    setMConfigError('JSON 格式错误')
                  }
                }}
                rows={10}
                className="input font-mono text-xs"
                spellCheck={false}
              />
              {mConfigError && (
                <p className="mt-1 text-xs text-rose-500">{mConfigError}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(mConfig)
                      setMConfig(JSON.stringify(parsed, null, 2))
                      setMConfigError('')
                    } catch {
                      setMConfigError('JSON 格式错误，无法格式化')
                    }
                  }}
                  className="btn-ghost !py-1 !px-2.5 text-xs"
                >
                  格式化
                </button>
              </div>
            </Field>
          )}
        </Modal>
      )}

      {/* 密码确认弹窗 */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !passwordSubmitting && setPasswordPrompt(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-bold text-neutral-900">确认新增模型</h3>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              为安全起见，新增模型需要输入您的登录密码以确认操作。
            </p>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmPassword && !passwordSubmitting) handlePasswordConfirm()
              }}
              className="input"
              placeholder="请输入登录密码"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setPasswordPrompt(null)} disabled={passwordSubmitting} className="btn-outline !px-4 !py-2 text-sm">
                取消
              </button>
              <button
                onClick={handlePasswordConfirm}
                disabled={passwordSubmitting || !confirmPassword}
                className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
