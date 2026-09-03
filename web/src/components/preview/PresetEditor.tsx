import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react'
import { api } from '../../services/api'
import {
  useSiteConfig,
  putSiteBatch,
  type AccentColors,
} from '../../hooks/useSiteConfig'

// ==================== 板块预设编辑器（直接渲染在 Landing 预览区内） ====================
// 设计契约：
// 1) 每个板块对应一组 siteconfig 键：`preset.${section}.${field}`
// 2) 模型下拉：调用公开 GET /api/models?type=section 实时读取后端已生效模型（含新增/删除）
// 3) 保存：调用 putSiteBatch() → Provider.reload() → 前台所有 useSiteConfig 消费者 15s 内更新
// 4) 未登录/非 SA：保存会返回 401/403 并静默降级为"仅本地预览"，真实用户在后台才能写入

export type SectionKey = 'novel' | 'audio' | 'canvas'

interface PresetField {
  key: string
  label: string
  hint?: string
  type: 'textarea' | 'text' | 'select' | 'slider' | 'number'
  rows?: number
  placeholder?: string
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: string | number }>
}

const FIELD_DEFS: Record<SectionKey, PresetField[]> = {
  novel: [
    { key: 'genre', label: '题材', type: 'select', options: [
      { label: '玄幻', value: '玄幻' }, { label: '都市', value: '都市' },
      { label: '科幻', value: '科幻' }, { label: '历史', value: '历史' },
      { label: '言情', value: '言情' }, { label: '悬疑', value: '悬疑' },
      { label: '武侠', value: '武侠' }, { label: '末世', value: '末世' },
    ] },
    { key: 'audience', label: '目标读者', type: 'select', options: [
      { label: '男性向', value: '男性向' }, { label: '女性向', value: '女性向' },
      { label: '全年龄', value: '全年龄' }, { label: '青少年', value: '青少年' },
    ] },
    { key: 'pov', label: '作品视角', type: 'select', options: [
      { label: '第一人称', value: '第一人称' },
      { label: '第三人称限制', value: '第三人称限制' },
      { label: '第三人称全知', value: '第三人称全知' },
      { label: '多人视角', value: '多人视角' },
    ] },
    { key: 'length', label: '篇幅', type: 'select', options: [
      { label: '短篇', value: '短篇' }, { label: '中篇', value: '中篇' },
      { label: '长篇', value: '长篇' }, { label: '连载', value: '连载' },
    ] },
    { key: 'prompt', label: '创作提示词', type: 'textarea', rows: 3,
      placeholder: '描述你想写的故事，包括主角、时代背景、核心冲突…' },
  ],
  audio: [
    { key: 'voice', label: '音色', type: 'select', options: [
      { label: '温柔女声', value: '温柔女声' }, { label: '沉稳男声', value: '沉稳男声' },
      { label: '活泼少女', value: '活泼少女' }, { label: '磁性男声', value: '磁性男声' },
      { label: '知性女声', value: '知性女声' },
    ] },
    { key: 'mood', label: 'BGM 情绪', type: 'select', options: [
      { label: '欢快', value: '欢快' }, { label: '悲伤', value: '悲伤' },
      { label: '紧张', value: '紧张' }, { label: '舒缓', value: '舒缓' },
      { label: '激昂', value: '激昂' }, { label: '神秘', value: '神秘' },
    ] },
    { key: 'duration', label: 'BGM 时长(秒)', type: 'slider', min: 10, max: 180, step: 5 },
    { key: 'text', label: '朗读文本示例', type: 'textarea', rows: 3,
      placeholder: '输入要朗读的文本示例，保存后工作区会默认带上这段内容。' },
  ],
  canvas: [
    { key: 'ratio', label: '出图比例', type: 'select', options: [
      { label: '1:1 方形', value: '1:1' }, { label: '3:4 竖图', value: '3:4' },
      { label: '4:3 横图', value: '4:3' }, { label: '16:9 宽屏', value: '16:9' },
      { label: '9:16 手机', value: '9:16' }, { label: '21:9 电影', value: '21:9' },
    ] },
    { key: 'steps', label: '采样步数', type: 'slider', min: 10, max: 50, step: 1 },
    { key: 'cfg', label: 'CFG 强度', type: 'slider', min: 1, max: 20, step: 0.5 },
    { key: 'batch', label: '默认批量', type: 'slider', min: 1, max: 4, step: 1 },
    { key: 'prompt', label: '正向提示词（默认）', type: 'textarea', rows: 2,
      placeholder: '正向提示词默认模板，可包含质量词、风格词等…' },
    { key: 'negative', label: '负向提示词（默认）', type: 'textarea', rows: 2,
      placeholder: '负向提示词默认模板（如水印、低质量、模糊等）…' },
  ],
}

// 模型类型 → GET /api/models?type=X
const SECTION_MODEL_TYPES: Record<SectionKey, { label: string; apiType: string; keySuffix: string }[]> = {
  novel:  [{ label: '写作模型',   apiType: 'novel',  keySuffix: 'model_novel' }],
  audio:  [{ label: '音频模型',   apiType: 'audio',  keySuffix: 'model_audio' }],
  canvas: [
    { label: '默认图片模型', apiType: 'image', keySuffix: 'model_image' },
    { label: '默认视频模型', apiType: 'video', keySuffix: 'model_video' },
  ],
}

interface ModelOption { id: string; name: string; displayName: string | null }

function presetKey(section: SectionKey, field: string) {
  return `preset.${section}.${field}`
}

export function PresetEditor({ section, accent }: { section: SectionKey; accent: AccentColors }) {
  const { get, reload } = useSiteConfig()
  const fields = FIELD_DEFS[section]
  const modelSlots = SECTION_MODEL_TYPES[section]
  const [modelsBySlot, setModelsBySlot] = useState<Record<string, ModelOption[]>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState<'' | 'ok' | 'warn' | 'err'>('')
  const [savedMsg, setSavedMsg] = useState('')

  // 当前编辑态（全部键值）
  const [form, setForm] = useState<Record<string, any>>({})

  // 1) 首次：从 SiteConfig 载入当前值 + 拉取模型列表
  useEffect(() => {
    const base: Record<string, any> = {}
    for (const f of fields) base[f.key] = get(presetKey(section, f.key), defaultFor(f))
    for (const s of modelSlots) base[s.keySuffix] = get(presetKey(section, s.keySuffix), '')
    setForm(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, get])

  useEffect(() => {
    let alive = true
    setModelsLoading(true)
    Promise.all(
      modelSlots.map(async (s) => {
        try {
          const r = await api.get<{ models: ModelOption[] }>(`/api/models?type=${encodeURIComponent(s.apiType)}`)
          return { slot: s.keySuffix, list: r.models ?? [] }
        } catch {
          return { slot: s.keySuffix, list: [] }
        }
      }),
    ).then((res) => {
      if (!alive) return
      const map: Record<string, ModelOption[]> = {}
      for (const r of res) map[r.slot] = r.list
      setModelsBySlot(map)
      setModelsLoading(false)
    })
    return () => { alive = false }
  }, [section, modelSlots])

  const setField = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }))

  // 保存：批量写入 siteconfig
  const handleSave = async () => {
    setSaving(true); setSavedOk(''); setSavedMsg('')
    try {
      const items = [
        ...fields.map((f) => ({ group: `preset.${section}`, key: f.key, value: form[f.key] ?? null })),
        ...modelSlots.map((s) => ({ group: `preset.${section}`, key: s.keySuffix, value: form[s.keySuffix] ?? null })),
      ]
      const r = await putSiteBatch(items)
      await reload()
      setSavedOk(r.ok ? 'ok' : 'warn')
      setSavedMsg(r.ok ? `已保存 ${r.updated ?? items.length} 项预设；下次请求立即生效。` : '保存未生效，请稍后重试。')
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status ?? 0
      if (status === 401 || status === 403) {
        setSavedOk('warn')
        setSavedMsg('当前账号没有预设保存权限。内容已在本地预览，超级管理员登录后可写入全站预设。')
      } else {
        setSavedOk('err')
        setSavedMsg('保存失败：' + (e?.message || '未知错误'))
      }
    } finally {
      setSaving(false)
      setTimeout(() => { if (savedOk === 'ok') setSavedOk('') }, 4000)
    }
  }

  // 重置：恢复为初始 siteconfig 值
  const handleReset = () => {
    const base: Record<string, any> = {}
    for (const f of fields) base[f.key] = get(presetKey(section, f.key), defaultFor(f))
    for (const s of modelSlots) base[s.keySuffix] = get(presetKey(section, s.keySuffix), '')
    setForm(base); setSavedOk(''); setSavedMsg('')
  }

  const sectionTitle = useMemo(() => ({
    novel: '🎩 写作预设',
    audio: '🎙 音频预设',
    canvas: '🎬 画布预设（图片/视频）',
  })[section], [section])

  return (
    <div className="h-full w-full overflow-y-auto rounded-xl p-3 text-[13px] text-neutral-200"
      style={{
        background: `linear-gradient(160deg, ${accent.bg50} 0%, #0b0b12 100%)`,
        border: `1px solid ${accent.bg200}`,
      }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles style={{ color: accent.main }} className="h-4 w-4" />
          <span className="text-sm font-semibold" style={{ color: accent.light }}>{sectionTitle}</span>
          <span className="text-[10px] text-neutral-400">保存即全站生效 · 刷新后保持</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-600/50 bg-white/5 px-2 py-1 text-[11px] text-neutral-300 transition hover:bg-white/10"
            title="恢复站点当前值"
          >
            <RotateCcw className="h-3 w-3" /> 重置
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-60"
            style={{ background: accent.main }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存预设
          </button>
        </div>
      </div>

      {savedOk && (
        <div className={`mb-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${
          savedOk === 'ok'   ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
          savedOk === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' :
                               'border-rose-500/40 bg-rose-500/10 text-rose-200'
        }`}>
          {savedOk === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          <span>{savedMsg}</span>
        </div>
      )}

      {/* 模型下拉区（按板块的 slot） */}
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {modelSlots.map((s) => (
          <ModelSelectRow
            key={s.keySuffix}
            label={s.label}
            accent={accent}
            loading={modelsLoading}
            options={modelsBySlot[s.keySuffix] ?? []}
            value={form[s.keySuffix] ?? ''}
            onChange={(v) => setField(s.keySuffix, v)}
          />
        ))}
      </div>

      {/* 参数字段区 */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {fields.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            accent={accent}
            value={form[f.key]}
            onChange={(v) => setField(f.key, v)}
            wide={f.type === 'textarea'}
          />
        ))}
      </div>

      <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-neutral-500">
        💡 提示：保存后，用户在「{sectionTitle}」板块创建新作品时会自动带入这些预设值；同时 Landing 顶部的标题、强调色在站点配置里独立配置。
      </div>
    </div>
  )
}

// ============ 子组件 ============
function defaultFor(f: PresetField): any {
  if (f.type === 'slider' || f.type === 'number') {
    if (f.min !== undefined && f.max !== undefined) return Math.round((f.min + f.max) / 2)
    if (f.key === 'steps') return 30
    if (f.key === 'cfg') return 7
    if (f.key === 'batch') return 1
    if (f.key === 'duration') return 30
    return f.min ?? 0
  }
  if (f.type === 'select' && f.options?.length) return f.options[0].value
  return ''
}

function ModelSelectRow({
  label, accent, loading, options, value, onChange,
}: {
  label: string
  accent: AccentColors
  loading: boolean
  options: ModelOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 p-2">
      <span className="text-[11px] text-neutral-400 flex items-center gap-1">
        <span style={{ color: accent.light }}>●</span> {label}
      </span>
      {loading ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 py-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> 加载模型列表…
        </span>
      ) : options.length === 0 ? (
        <span className="text-[11px] text-amber-300 py-1.5">暂无可用模型（请在后台「模型管理」添加）</span>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-[#14141c] px-2 py-1.5 text-[12px] text-neutral-200 focus:outline-none"
          style={{ boxShadow: value ? `inset 0 0 0 1px ${accent.main}` : undefined }}
        >
          <option value="">— 请选择默认模型 —</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.name}  <span className="text-neutral-500">({m.name})</span>
            </option>
          ))}
        </select>
      )}
    </label>
  )
}

function FieldInput({
  field, accent, value, onChange, wide,
}: {
  field: PresetField
  accent: AccentColors
  value: any
  onChange: (v: any) => void
  wide?: boolean
}) {
  const baseInp =
    'w-full rounded-md border border-white/10 bg-[#14141c] px-2.5 py-1.5 text-[12px] text-neutral-200 focus:outline-none placeholder:text-neutral-500'
  const shell =
    `flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 p-2 ${wide ? 'md:col-span-2' : ''}`
  const label = (
    <span className="text-[11px] text-neutral-400 flex items-center gap-1">
      <span style={{ color: accent.light }}>●</span> {field.label}
    </span>
  )
  if (field.type === 'textarea') {
    return (
      <label className={shell}>
        {label}
        <textarea
          rows={field.rows ?? 3}
          value={value ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={baseInp + ' resize-y'}
        />
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <label className={shell}>
        {label}
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInp}
          style={{ boxShadow: value ? `inset 0 0 0 1px ${accent.main}` : undefined }}
        >
          {!field.options?.length && <option value="">（无选项）</option>}
          {field.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'slider') {
    const min = field.min ?? 0, max = field.max ?? 100, step = field.step ?? 1
    return (
      <label className={shell}>
        {label}
        <div className="flex items-center gap-2 px-1">
          <input
            type="range"
            min={min} max={max} step={step}
            value={Number(value ?? min)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-current h-1.5"
            style={{ accentColor: accent.main }}
          />
          <input
            type="number"
            min={min} max={max} step={step}
            value={Number(value ?? min)}
            onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
            className={baseInp + ' !w-20 tabular-nums'}
          />
        </div>
        {field.hint && <span className="text-[10px] text-neutral-500">{field.hint}</span>}
      </label>
    )
  }
  // text / number
  return (
    <label className={shell}>
      {label}
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        className={baseInp}
      />
    </label>
  )
}

export default PresetEditor
