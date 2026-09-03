// 模型管理模块 — 从 AdminPage.tsx 抽取
//
// 包含：
//   - ModelRow: 模型行组件（板块分组视图/供应商分组视图 共用）
//   - useProviders: 供应商列表 hook
//   - useModels: 模型列表 hook
//   - ModelsTab: 完整模型管理 Tab（按板块/供应商分组视图）
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
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import type { Provider, Model } from './types'
import {
  Field,
  Modal,
  MODEL_SECTION_OPTIONS,
  PROVIDER_TYPE_OPTIONS,
} from './common'
import { api } from '../../services/api'

// ===== 模型行（板块分组视图/供应商分组视图 共用），用于去冗余渲染 =====
export function ModelRow({
  model,
  providerLabel,
  costEdits,
  setCostEdits,
  costSaving,
  costToast,
  deletingModelId,
  onSaveCost,
  onDelete,
}: {
  model: Model
  providerLabel: string
  costEdits: Record<string, number>
  setCostEdits: Dispatch<SetStateAction<Record<string, number>>>
  costSaving: string | null
  costToast: { id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null
  deletingModelId: string | null
  onSaveCost: (m: Model) => void
  onDelete: (id: string, name: string) => void
}) {
  const editVal = costEdits[model.id]
  const displayVal = editVal !== undefined ? editVal : (model.costTokens ?? 1000)
  const dirty = editVal !== undefined && editVal !== (model.costTokens ?? 1000)
  const saving = costSaving === model.id
  const toast = costToast && costToast.id === model.id ? costToast : null
  const sectionInfo = MODEL_SECTION_OPTIONS.find((s) => s.key === model.type as 'novel' | 'image' | 'audio' | 'video')
  return (
    <li className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-3">
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
          </div>
          {model.desc && <div className="truncate text-xs text-neutral-400">{model.desc}</div>}
        </div>
      </div>
      {/* 积分消耗内联编辑 + 同步全局按钮 */}
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
          onClick={() => onDelete(model.id, model.name)}
          disabled={deletingModelId === model.id}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          {deletingModelId === model.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          删除
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

// ===== 模型列表 hook（带 loading 状态 + reload）=====
export function useModels(onError: (e: string) => void) {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)
  const loadModels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ models: Model[] }>('/api/models')
      setModels(res.models ?? [])
    } catch (e) {
      onError((e as Error).message)
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [onError])
  useEffect(() => { loadModels() }, [loadModels])
  return { models, setModels, loading, reload: loadModels }
}

// ===== 完整模型管理 Tab（按板块/供应商分组视图）=====
export function ModelsTab({ onError, typeFilter }: { onError: (e: string) => void; typeFilter?: string[] }) {
  const { providers, reloadProviders } = useProviders(onError)
  const { models, setModels, loading, reload } = useModels(onError)
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)
  // 板块过滤 + 视图切换（按板块分组 vs 按供应商分组）
  const [sectionFilter, setSectionFilter] = useState<'' | 'novel' | 'image' | 'audio' | 'video'>('')
  const [groupBy, setGroupBy] = useState<'section' | 'provider'>('section')
  // 新增/删除模型需要密码确认
  const [passwordPrompt, setPasswordPrompt] = useState<{
    type: 'create' | 'delete'
    modelId?: string
    modelName?: string
  } | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 供应商表单
  const [pName, setPName] = useState('')
  const [pDisplayName, setPDisplayName] = useState('')
  const [pType, setPType] = useState('')
  const [pBaseUrl, setPBaseUrl] = useState('')
  const [pApiKeyEnv, setPApiKeyEnv] = useState('')
  const [submittingProvider, setSubmittingProvider] = useState(false)

  // 模型表单
  const [mName, setMName] = useState('')
  const [mDisplayName, setMDisplayName] = useState('')
  const [mType, setMType] = useState('')
  const [mProviderId, setMProviderId] = useState('')
  const [mTag, setMTag] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mCostTokens, setMCostTokens] = useState<number>(1000)

  // 积分制度：按模型内联编辑 costTokens + 保存时同步全局
  const [costEdits, setCostEdits] = useState<Record<string, number>>({})
  const [costSaving, setCostSaving] = useState<string | null>(null) // 正在保存的 model id
  const [costToast, setCostToast] = useState<{ id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null>(null)

  // 模型按板块 / 供应商分组并按 sort / name 排序
  const sectionMeta = new Map(MODEL_SECTION_OPTIONS.map((o) => [o.key, o]))
  const filteredModels = useMemo(() => {
    // typeFilter 优先（从板块功能子导航传入，固定模型类型）
    if (typeFilter && typeFilter.length > 0) {
      return models.filter((m) => typeFilter.includes(m.type))
    }
    if (!sectionFilter) return models
    return models.filter((m) => m.type === sectionFilter)
  }, [models, sectionFilter, typeFilter])
  const modelsBySection = useMemo(() => {
    const map = new Map<string, Model[]>()
    for (const m of filteredModels) {
      const t = m.type || 'uncategorized'
      const arr = map.get(t) ?? []
      arr.push(m)
      map.set(t, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    return map
  }, [filteredModels])
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, Model[]>()
    for (const m of filteredModels) {
      const arr = map.get(m.providerId) ?? []
      arr.push(m)
      map.set(m.providerId, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    }
    return map
  }, [filteredModels])

  const resetProviderForm = () => {
    setPName('')
    setPDisplayName('')
    setPType('')
    setPBaseUrl('')
    setPApiKeyEnv('')
  }

  const resetModelForm = () => {
    setMName('')
    setMDisplayName('')
    setMType('')
    setMProviderId('')
    setMTag('')
    setMDesc('')
    setMCostTokens(1000)
  }

  // 根据模型类型给出建议的积分默认值（与后端 seed 规则一致）
  const suggestedCostForType = (t: string): number => {
    switch (t) {
      case 'novel': return 500
      case 'audio': return 800
      case 'image': return 1000
      case 'video': return 5000
      default: return 1000
    }
  }

  // 模型表单：切换 type 时自动建议默认积分
  useEffect(() => {
    if (mType) setMCostTokens(suggestedCostForType(mType))
  }, [mType])

  // 积分制度：按模型单独 PATCH costTokens 并触发全局 invalidate
  const handleSaveCost = async (model: Model) => {
    const nextVal = Number(costEdits[model.id] ?? model.costTokens ?? 1000)
    if (!Number.isFinite(nextVal) || nextVal < 0) return
    setCostSaving(model.id)
    try {
      const res = await api.patch<{
        model: Model
        changed?: { from: number; to: number }
        unchanged?: boolean
        cacheInvalidated?: boolean
      }>(`/api/models/${model.id}/cost`, { costTokens: nextVal })
      setCostToast({
        id: model.id,
        from: model.costTokens ?? 0,
        to: nextVal,
        changed: !res.unchanged,
        unchanged: res.unchanged,
      })
      setTimeout(() => setCostToast((cur) => (cur && cur.id === model.id ? null : cur)), 3500)
      // 刷新本地 models 缓存为新值
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, costTokens: nextVal } : m)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCostSaving(null)
    }
  }

  const handleCreateProvider = async () => {
    if (!pName.trim()) return
    setSubmittingProvider(true)
    try {
      await api.post('/api/providers', {
        name: pName.trim(),
        displayName: pDisplayName.trim() || undefined,
        type: pType.trim() || undefined,
        baseUrl: pBaseUrl.trim() || undefined,
        apiKeyEnv: pApiKeyEnv.trim() || undefined,
      })
      setProviderModalOpen(false)
      resetProviderForm()
      await reloadProviders()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmittingProvider(false)
    }
  }

  // 新增模型 — 先弹密码确认
  const handleCreateModel = async () => {
    if (!mName.trim() || !mProviderId) return
    setPasswordPrompt({ type: 'create' })
    setConfirmPassword('')
  }

  // 删除模型 — 先弹密码确认
  const handleDeleteModel = async (modelId: string, modelName: string) => {
    setPasswordPrompt({ type: 'delete', modelId, modelName })
    setConfirmPassword('')
  }

  // 密码确认后执行实际操作
  const handlePasswordConfirm = async () => {
    if (!passwordPrompt || !confirmPassword) return
    setPasswordSubmitting(true)
    try {
      if (passwordPrompt.type === 'create') {
        await api.post('/api/models', {
          name: mName.trim(),
          displayName: mDisplayName.trim() || undefined,
          type: mType.trim() || undefined,
          providerId: mProviderId,
          tag: mTag.trim() || undefined,
          desc: mDesc.trim() || undefined,
          costTokens: Number.isFinite(mCostTokens) && mCostTokens >= 0 ? mCostTokens : suggestedCostForType(mType),
          password: confirmPassword,
        })
        setModelModalOpen(false)
        resetModelForm()
        await reload()
      } else if (passwordPrompt.type === 'delete' && passwordPrompt.modelId) {
        setDeletingModelId(passwordPrompt.modelId)
        await api.delWithBody(`/api/models/${passwordPrompt.modelId}`, { password: confirmPassword })
        setModels((prev) => prev.filter((m) => m.id !== passwordPrompt.modelId))
      }
      setPasswordPrompt(null)
      setConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setPasswordSubmitting(false)
      setDeletingModelId(null)
    }
  }

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setProviderModalOpen(true)} className="btn-primary !px-3 !py-1.5 text-sm">
          <Plus className="h-4 w-4" />
          新建供应商
        </button>
        <button
          onClick={() => {
            setMProviderId(providers[0]?.id ?? '')
            setModelModalOpen(true)
          }}
          disabled={providers.length === 0}
          className="btn-outline !px-3 !py-1.5 text-sm"
          title={providers.length === 0 ? '请先创建供应商' : undefined}
        >
          <Plus className="h-4 w-4" />
          新建模型
        </button>
        <button onClick={() => { reload(); reloadProviders() }} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        {/* 板块过滤 chip（typeFilter 模式下隐藏，因为已按板块固定）*/}
        {!typeFilter && (
        <div className="ml-2 flex flex-wrap items-center gap-1 border-l border-neutral-200 pl-2">
          <button
            onClick={() => setSectionFilter('')}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              sectionFilter === ''
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            全部板块
          </button>
          {MODEL_SECTION_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSectionFilter(s.key)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                sectionFilter === s.key
                  ? `border ${s.accent} shadow-sm font-medium`
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
              title={`按板块「${s.label}」过滤模型`}
            >
              {s.label.split(' ')[0]} {s.label.split(' ')[1] ?? ''}
            </button>
          ))}
        </div>
        )}
        {/* 分组切换（typeFilter 模式下隐藏）*/}
        {!typeFilter && (
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setGroupBy('section')}
            className={`px-2.5 py-1 transition ${
              groupBy === 'section' ? 'bg-neutral-900 text-white rounded-md' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            按板块分组
          </button>
          <button
            onClick={() => setGroupBy('provider')}
            className={`px-2.5 py-1 transition ${
              groupBy === 'provider' ? 'bg-neutral-900 text-white rounded-md' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            按供应商分组
          </button>
        </div>
        )}
      </div>
      <div className="mb-4 text-xs text-neutral-400">
        共 {providers.length} 个供应商 · {typeFilter ? '当前板块' : '已按板块过滤后'} {filteredModels.length} / 总 {models.length} 模型
      </div>

      {/* 供应商卡片列表 / 板块分组视图 */}
      {loading && providers.length === 0 && models.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-16 text-neutral-400">
          <Server className="h-8 w-8" />
          <p className="mt-3 text-sm">还没有供应商，先创建第一个吧</p>
        </div>
      ) : groupBy === 'section' ? (
        // ===== 视图 A：按板块分组（默认） =====
        <div className="space-y-5">
          {MODEL_SECTION_OPTIONS.map((section) => {
            const list = modelsBySection.get(section.key) ?? []
            return (
              <section key={section.key} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                <header className={`flex items-center justify-between rounded-t-xl border-b border-neutral-100 px-4 py-3 ${section.accent}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{section.label}</span>
                  </div>
                  <span className="chip border bg-white/70 text-neutral-600">{list.length} 模型</span>
                </header>
                <div className="px-4 py-3">
                  {list.length === 0 ? (
                    <p className="py-2 text-xs text-neutral-400">该板块暂无模型，可在右上「新建模型」中指定板块类型 = {section.key}</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {list.map((m) => (
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
                          costSaving={costSaving}
                          costToast={costToast}
                          deletingModelId={deletingModelId}
                          onSaveCost={handleSaveCost}
                          onDelete={handleDeleteModel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        // ===== 视图 B：按供应商分组 =====
        <div className="space-y-4">
          {providers.map((p) => {
            const pModels = modelsByProvider.get(p.id) ?? []
            return (
              <div key={p.id} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                {/* 供应商头部 */}
                <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <Server className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-neutral-900">{p.displayName || p.name}</span>
                        <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                        <span>{p.type || '—'}</span>
                        {p.baseUrl && (
                          <span className="truncate" title={p.baseUrl}>
                            · {p.baseUrl}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`chip ${
                        p.status === 'active'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      {p.status === 'active' ? '启用' : p.status || '—'}
                    </span>
                    <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500">
                      {pModels.length} / {p._count?.models ?? 0} 模型
                    </span>
                  </div>
                </div>
                {/* 模型列表 */}
                <div className="px-4 py-3">
                  {pModels.length === 0 ? (
                    <p className="py-2 text-xs text-neutral-400">
                      {sectionFilter ? '该供应商下在选中板块内暂无模型（切换板块过滤可查看更多）' : '该供应商下暂无模型'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {pModels.map((m) => (
                        <ModelRow
                          key={m.id}
                          model={m}
                          providerLabel={p.displayName || p.name}
                          costEdits={costEdits}
                          setCostEdits={setCostEdits}
                          costSaving={costSaving}
                          costToast={costToast}
                          deletingModelId={deletingModelId}
                          onSaveCost={handleSaveCost}
                          onDelete={handleDeleteModel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新建供应商弹窗 */}
      {providerModalOpen && (
        <Modal
          title="新建供应商"
          onClose={() => setProviderModalOpen(false)}
          footer={
            <>
              <button
                onClick={() => setProviderModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateProvider}
                disabled={submittingProvider || !pName.trim()}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {submittingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </button>
            </>
          }
        >
          <Field label="名称（name）" required>
            <input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="如 openai"
              className="input"
            />
          </Field>
          <Field label="显示名称（displayName）">
            <input
              value={pDisplayName}
              onChange={(e) => setPDisplayName(e.target.value)}
              placeholder="如 OpenAI"
              className="input"
            />
          </Field>
          <Field label="类型（type）" hint="对应后端 PROVIDER_TYPES 枚举：llm / image / audio / video / multimodal" required>
            <select
              value={pType}
              onChange={(e) => setPType(e.target.value)}
              className="input"
            >
              <option value="">— 请选择供应商类型 —</option>
              {PROVIDER_TYPE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Base URL">
            <input
              value={pBaseUrl}
              onChange={(e) => setPBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="input"
            />
          </Field>
          <Field label="API Key 环境变量名（apiKeyEnv）">
            <input
              value={pApiKeyEnv}
              onChange={(e) => setPApiKeyEnv(e.target.value)}
              placeholder="OPENAI_API_KEY"
              className="input"
            />
          </Field>
        </Modal>
      )}

      {/* 新建模型弹窗 */}
      {modelModalOpen && (
        <Modal
          title="新建模型"
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
            <select
              value={mProviderId}
              onChange={(e) => setMProviderId(e.target.value)}
              className="input"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName || p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名称（name）" required>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="如 gpt-4o"
              className="input"
            />
          </Field>
          <Field label="显示名称（displayName）">
            <input
              value={mDisplayName}
              onChange={(e) => setMDisplayName(e.target.value)}
              placeholder="如 GPT-4o"
              className="input"
            />
          </Field>
          <Field label="所属板块（type）" hint="对应后端 MODEL_TYPES：novel / image / comic / audio / video；决定模型出现在哪个板块" required>
            <select
              value={mType}
              onChange={(e) => setMType(e.target.value)}
              className="input"
            >
              <option value="">— 请选择所属板块 —</option>
              {MODEL_SECTION_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="标签（tag）">
            <input
              value={mTag}
              onChange={(e) => setMTag(e.target.value)}
              placeholder="如 推荐 / 旗舰"
              className="input"
            />
          </Field>
          <Field
            label="积分调用量（costTokens）"
            hint={`新建模型后，后台可随时调整，下一次用户请求立即全局生效。已按类型建议默认值 ${suggestedCostForType(mType) || 1000}。`}
          >
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
            <p className="mt-1 text-xs text-neutral-400">
              提示：image ≈ 1000、video ≈ 5000、audio ≈ 800、novel ≈ 500
            </p>
          </Field>
          <Field label="描述（desc）">
            <textarea
              value={mDesc}
              onChange={(e) => setMDesc(e.target.value)}
              rows={3}
              placeholder="模型能力 / 适用场景"
              className="input resize-none"
            />
          </Field>
        </Modal>
      )}

      {/* 密码确认弹窗（新增/删除模型） */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !passwordSubmitting && setPasswordPrompt(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-bold text-neutral-900">
                {passwordPrompt.type === 'create' ? '确认新增模型' : '确认删除模型'}
              </h3>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {passwordPrompt.type === 'create'
                ? '为安全起见，新增模型需要输入您的登录密码以确认操作。'
                : `即将删除模型「${passwordPrompt.modelName ?? ''}」，此操作不可撤销。请输入您的登录密码以确认。`}
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
              <button
                onClick={() => setPasswordPrompt(null)}
                disabled={passwordSubmitting}
                className="btn-outline !px-4 !py-2 text-sm"
              >
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

// ===== 简化版模型管理：按固定 typeFilter 只显示对应类型的模型列表（板块功能子导航内嵌）=====
export function ModelsByType({ onError, typeFilter }: { onError: (e: string) => void; typeFilter: string[] }) {
  const { providers } = useProviders(onError)
  const { models, setModels, loading, reload } = useModels(onError)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<{
    type: 'create' | 'delete'
    modelId?: string
    modelName?: string
  } | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 模型表单
  const [mName, setMName] = useState('')
  const [mDisplayName, setMDisplayName] = useState('')
  const [mProviderId, setMProviderId] = useState('')
  const [mTag, setMTag] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mCostTokens, setMCostTokens] = useState<number>(1000)
  // typeFilter 对应的类型标签（用于锁定 type 选择）
  const typeLabel = typeFilter.map(t => MODEL_SECTION_OPTIONS.find(o => o.key === t)?.label.split(' ')[1]?.replace(/[()]/g, '') ?? t).join(' / ')

  // 积分内联编辑
  const [costEdits, setCostEdits] = useState<Record<string, number>>({})
  const [costSaving, setCostSaving] = useState<string | null>(null)
  const [costToast, setCostToast] = useState<{ id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null>(null)

  const filteredModels = useMemo(() => {
    return models.filter((m) => typeFilter.includes(m.type))
  }, [models, typeFilter])

  const suggestedCostForType = (t: string): number => {
    switch (t) {
      case 'novel': return 500
      case 'audio': return 800
      case 'image': return 1000
      case 'video': return 5000
      default: return 1000
    }
  }

  // typeFilter 只有一个类型时，新建模型自动建议默认积分
  useEffect(() => {
    if (typeFilter.length === 1) setMCostTokens(suggestedCostForType(typeFilter[0]))
  }, [typeFilter])

  const resetModelForm = () => {
    setMName('')
    setMDisplayName('')
    setMProviderId('')
    setMTag('')
    setMDesc('')
    setMCostTokens(typeFilter.length === 1 ? suggestedCostForType(typeFilter[0]) : 1000)
  }

  const handleSaveCost = async (model: Model) => {
    const nextVal = Number(costEdits[model.id] ?? model.costTokens ?? 1000)
    if (!Number.isFinite(nextVal) || nextVal < 0) return
    setCostSaving(model.id)
    try {
      const res = await api.patch<{
        model: Model
        changed?: { from: number; to: number }
        unchanged?: boolean
        cacheInvalidated?: boolean
      }>(`/api/models/${model.id}/cost`, { costTokens: nextVal })
      setCostToast({
        id: model.id,
        from: model.costTokens ?? 0,
        to: nextVal,
        changed: !res.unchanged,
        unchanged: res.unchanged,
      })
      setTimeout(() => setCostToast((cur) => (cur && cur.id === model.id ? null : cur)), 3500)
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, costTokens: nextVal } : m)))
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

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    setPasswordPrompt({ type: 'delete', modelId, modelName })
    setConfirmPassword('')
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
          password: confirmPassword,
        })
        setModelModalOpen(false)
        resetModelForm()
        await reload()
      } else if (passwordPrompt.type === 'delete' && passwordPrompt.modelId) {
        setDeletingModelId(passwordPrompt.modelId)
        await api.delWithBody(`/api/models/${passwordPrompt.modelId}`, { password: confirmPassword })
        setModels((prev) => prev.filter((m) => m.id !== passwordPrompt.modelId))
      }
      setPasswordPrompt(null)
      setConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setPasswordSubmitting(false)
      setDeletingModelId(null)
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
        <span className="ml-auto text-xs text-neutral-400">
          {filteredModels.length} 个模型 · 类型：{typeLabel}
        </span>
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
                costSaving={costSaving}
                costToast={costToast}
                deletingModelId={deletingModelId}
                onSaveCost={handleSaveCost}
                onDelete={handleDeleteModel}
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
        </Modal>
      )}

      {/* 密码确认弹窗 */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !passwordSubmitting && setPasswordPrompt(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-bold text-neutral-900">
                {passwordPrompt.type === 'create' ? '确认新增模型' : '确认删除模型'}
              </h3>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {passwordPrompt.type === 'create'
                ? '为安全起见，新增模型需要输入您的登录密码以确认操作。'
                : `即将删除模型「${passwordPrompt.modelName ?? ''}」，此操作不可撤销。请输入您的登录密码以确认。`}
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
