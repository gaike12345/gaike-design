import { useEffect } from 'react'
import { useFeatureStore, type ModuleFeature } from '../../store/useFeatureStore'
import { useModelStore } from '../../store/useModelStore'

// 动态功能渲染器 — 根据后端 ModuleFeature 配置动态渲染 UI 控件
// 父组件传入 module + values + onChange，本组件渲染所有已启用的功能控件

interface Props {
  module: string  // novel | image | comic | audio | video
  values: Record<string, any>
  onChange: (key: string, value: any) => void
  // modelKey: 如果功能 featureKey === 'model_selector'，则渲染动态模型下拉
  showModelSelector?: boolean
  modelType?: string  // 传入 useModelStore 的 type 参数
  modelValue?: string
  onModelChange?: (modelId: string) => void
}

export default function DynamicFeatureRenderer({
  module, values, onChange,
  showModelSelector = true,
  modelType, modelValue, onModelChange,
}: Props) {
  const { featuresByModule, fetchFeatures } = useFeatureStore()
  const { getModelsByType, fetchModels } = useModelStore()

  useEffect(() => {
    fetchFeatures(module)
    if (modelType) fetchModels(modelType)
  }, [module, modelType, fetchFeatures, fetchModels])

  const features = featuresByModule[module] || []
  const models = modelType ? getModelsByType(modelType) : []

  // 按 sort 排序，跳过 custom 类型（父组件自行处理）
  const renderableFeatures = features
    .filter((f: ModuleFeature) => f.type !== 'custom')
    .sort((a: ModuleFeature, b: ModuleFeature) => a.sort - b.sort)

  const renderControl = (f: ModuleFeature) => {
    const val = values[f.featureKey] ?? f.config?.default ?? ''
    const cfg = f.config || {}

    switch (f.type) {
      case 'input':
        return (
          <input
            type="text"
            value={val}
            placeholder={cfg.placeholder || ''}
            onChange={(e) => onChange(f.featureKey, e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        )

      case 'textarea':
        return (
          <textarea
            value={val}
            rows={cfg.rows || 3}
            placeholder={cfg.placeholder || ''}
            onChange={(e) => onChange(f.featureKey, e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none"
          />
        )

      case 'slider':
        return (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={cfg.min ?? 0}
              max={cfg.max ?? 100}
              step={cfg.step ?? 1}
              value={Number(val)}
              onChange={(e) => onChange(f.featureKey, Number(e.target.value))}
              className="flex-1 accent-brand-600"
            />
            <span className="w-12 text-right text-sm tabular-nums text-slate-700">{val}</span>
          </div>
        )

      case 'select':
        // model_selector 特殊处理 — 使用动态模型列表
        if (f.featureKey === 'model_selector' && showModelSelector && models.length > 0) {
          return (
            <select
              value={modelValue || ''}
              onChange={(e) => onModelChange?.(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {models.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )
        }
        // 普通静态选项
        const options = cfg.options || []
        const isDynamic = options === 'dynamic'
        if (isDynamic) return null
        return (
          <select
            value={val}
            onChange={(e) => onChange(f.featureKey, e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="">请选择</option>
            {Array.isArray(options) && options.map((o: string) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )

      case 'toggle':
        return (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!val}
              onChange={(e) => onChange(f.featureKey, e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-600">{cfg.desc || ''}</span>
          </label>
        )

      case 'upload':
        return (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
            点击或拖拽上传（最多 {cfg.maxFiles || 1} 个文件）
          </div>
        )

      case 'color':
        return (
          <input
            type="color"
            value={val || '#000000'}
            onChange={(e) => onChange(f.featureKey, e.target.value)}
            className="h-9 w-12 rounded border border-slate-300"
          />
        )

      default:
        return null
    }
  }

  if (features.length === 0) return null

  return (
    <div className="space-y-3">
      {renderableFeatures.map((f: ModuleFeature) => (
        <div key={f.id} className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">
            {f.displayName}
          </label>
          {renderControl(f)}
        </div>
      ))}
    </div>
  )
}
