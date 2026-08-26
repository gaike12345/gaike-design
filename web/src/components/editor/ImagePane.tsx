// 图像板块 Pane
//
// v1.2 决策第 1 项：图像板块为六大板块之二
// 范围：文生图 / 图生图 / 局部重绘 / 外扩 / 角色 LoRA / 画风 LoRA / 多参考图一致性 /
//      批量生成 / 多模型切换 / 多比例 / 中英文双语 Prompt / 参考图上传 / ControlNet /
//      负面词 / 种子复现 / 模板库 / 面部修复 / 超清放大 / 线稿上色 / 去水印 / 老照片修复 / LoRA 训练
// 当前实现：完整文生图（Pollinations provider）+ 参数面板 + 批量 + 自动重试
// 待 API 接入：图生图 / 局部重绘 / ControlNet / LoRA 训练 / 多参考图一致性

import { useState, useEffect } from 'react'
import { useModelStore, type AIModel } from '../../store/useModelStore'
import {
  Loader2, Dices, RotateCcw, Settings2, ChevronDown, Plus, Search,
  Upload, Send, Wand2,
} from 'lucide-react'
import { useStudioStore } from '../../store/useStudioStore'
import { useProjectStore } from '../../store/useProjectStore'
import { cn } from '../../lib/utils'
import {
  RATIOS, MODELS, TEMPLATES, PRESETS, CONTROLNET_TYPES,
  Field, EmptyState, ResultCard,
} from '../image'

type JumpTarget = 'image' | 'comic' | 'audio' | 'video' | 'community'

interface Props {
  onJumpTo: (target: JumpTarget) => void
}

export default function ImagePane({ onJumpTo }: Props) {
  const s = useStudioStore()
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const [activeModel, setActiveModel] = useState(MODELS[0].id)
  const [leftTab, setLeftTab] = useState<'models' | 'templates'>('models')
  const [refImages, setRefImages] = useState<string[]>([])
  const [activeControlNet, setActiveControlNet] = useState<string | null>(null)
  const { models: aiModels, fetchModels } = useModelStore()

  // 从后端拉取 image 类型模型
  useEffect(() => { fetchModels('image') }, [fetchModels])

  // 动态模型列表：后端数据优先，无后端时 fallback 到硬编码
  const modelList = aiModels.length > 0
    ? aiModels.map((m: AIModel) => ({ id: m.name, name: m.displayName, tag: m.tag || '通用', desc: m.desc || '' }))
    : MODELS

  const isBusy = s.status === 'queued' || s.status === 'running'
  const hasResults = s.history.length > 0

  // 桥接：把最新生成图 src 列表写入项目 payload，并跳转到漫画板块
  const sendToComic = () => {
    const latestTask = s.history[0]
    if (!latestTask) return
    const srcs = latestTask.results
      .filter((r) => r.status === 'done')
      .map((r) => r.url)
    if (activeProjectId) {
      useProjectStore.getState().updatePayload(activeProjectId, { images: srcs })
    }
    onJumpTo('comic')
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧栏：模型 / 模板 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex border-b border-ink-200">
          <button
            onClick={() => setLeftTab('models')}
            className={cn('flex-1 py-2.5 text-xs font-medium transition-colors',
              leftTab === 'models' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-ink-500')}
          >
            模型
          </button>
          <button
            onClick={() => setLeftTab('templates')}
            className={cn('flex-1 py-2.5 text-xs font-medium transition-colors',
              leftTab === 'templates' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-ink-500')}
          >
            提示词
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-ink-200 p-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input className="input !py-1.5 !pl-8 text-xs" placeholder="搜索模型 / 模板" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {leftTab === 'models' ? (
            <div className="space-y-2">
              {modelList.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveModel(m.id)}
                  className={cn(
                    'w-full rounded-lg border p-2.5 text-left transition-all',
                    activeModel === m.id
                      ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                      : 'border-ink-200 hover:border-ink-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-900">{m.name}</span>
                    <span className="chip bg-ink-100 text-ink-600">{m.tag}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-500">{m.desc}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => s.setPrompt(t)}
                  className="w-full rounded-lg border border-ink-200 p-2.5 text-left text-[11px] leading-relaxed text-ink-600 transition-all hover:border-brand-300 hover:bg-brand-50"
                >
                  {t.length > 38 ? t.slice(0, 38) + '…' : t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-ink-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="flex flex-col items-center gap-1 rounded-lg border border-ink-200 py-2 text-[10px] text-ink-600 hover:border-brand-300 hover:text-brand-700"
              >
                <p.icon className="h-3.5 w-3.5" />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* 中部：画布区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-ink-500">
            <span className="font-medium text-ink-700">{modelList.find(m => m.id === activeModel)?.name}</span>
            <span>·</span><span>{s.ratio}</span>
            <span>·</span><span>{s.steps} steps</span>
            <span>·</span><span>CFG {s.cfg}</span>
            <span>·</span><span>{s.batch} 张</span>
          </div>
          <div className="flex items-center gap-1">
            {s.history.length > 0 && (
              <button
                onClick={sendToComic}
                className="btn-primary !px-2.5 !py-1 text-xs"
                title="把当前生成图送入漫画板块填充图层"
              >
                <Send className="h-3 w-3" /> 送入漫画
              </button>
            )}
            <button className="btn-ghost !px-2 !py-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> 新建
            </button>
            <button className="btn-ghost !px-2 !py-1 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!hasResults ? (
            <EmptyState onUseTemplate={s.setPrompt} />
          ) : (
            <div className="space-y-6">
              {s.history.map((task) => (
                <div key={task.id} className="animate-fade-up">
                  <div className="mb-2 flex items-center gap-2 text-xs text-ink-500">
                    <span className="font-mono">{new Date(task.createdAt).toLocaleTimeString()}</span>
                    <span>·</span>
                    <span className="truncate">{task.prompt}</span>
                    {task.status === 'running' && (
                      <span className="chip bg-brand-50 text-brand-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> 生成中
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {task.results.map((img) => (
                      <ResultCard key={img.id} img={img} taskId={task.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 右侧参数面板 */}
      <aside className="hidden w-80 shrink-0 flex-col border-l border-ink-200 bg-white xl:flex">
        <div className="border-b border-ink-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">参数面板</h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          <Field label="正向提示词">
            <textarea
              value={s.prompt}
              onChange={(e) => s.setPrompt(e.target.value)}
              rows={4}
              placeholder="描述你想生成的画面，例如：赛博朋克少女机甲特写，霓虹灯，雨夜"
              className="input resize-none text-xs leading-relaxed"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-400">
              <span>支持中英文双语</span>
              <span>{s.prompt.length} 字</span>
            </div>
          </Field>

          <Field label="负向提示词">
            <textarea
              value={s.negativePrompt}
              onChange={(e) => s.setNegativePrompt(e.target.value)}
              rows={2}
              placeholder="lowres, bad anatomy, blurry, watermark"
              className="input resize-none text-xs"
            />
          </Field>

          <Field label="画面比例">
            <div className="grid grid-cols-5 gap-1.5">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => s.setRatio(r.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border py-2 transition-all',
                    s.ratio === r.value
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300'
                  )}
                >
                  <span className="block rounded-sm border border-current" style={{ width: r.w / 2, height: r.h / 2 }} />
                  <span className="text-[10px] font-medium">{r.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label={`采样步数 · ${s.steps}`}>
            <input type="range" min={10} max={50} value={s.steps}
              onChange={(e) => s.setSteps(Number(e.target.value))}
              className="w-full accent-brand-600" />
            <div className="flex justify-between text-[10px] text-ink-400"><span>10</span><span>50</span></div>
          </Field>

          <Field label={`引导系数 CFG · ${s.cfg}`}>
            <input type="range" min={1} max={20} step={0.5} value={s.cfg}
              onChange={(e) => s.setCfg(Number(e.target.value))}
              className="w-full accent-brand-600" />
            <div className="flex justify-between text-[10px] text-ink-400"><span>1</span><span>20</span></div>
          </Field>

          <Field label={`生成数量 · ${s.batch} 张`}>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 4].map((n) => (
                <button key={n} onClick={() => s.setBatch(n)}
                  className={cn('rounded-lg border py-1.5 text-xs font-medium transition-all',
                    s.batch === n ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-ink-300')}>
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-ink-400">数量越多越易触发限流，推荐 2 张</p>
          </Field>

          <Field label="随机种子">
            <div className="flex gap-1.5">
              <input type="number" value={s.seed ?? ''}
                onChange={(e) => s.setSeed(e.target.value ? Number(e.target.value) : null)}
                placeholder="留空随机" className="input !py-1.5 text-xs" />
              <button onClick={() => s.setSeed(null)} className="btn-outline !px-2" title="随机">
                <Dices className="h-3.5 w-3.5" />
              </button>
            </div>
          </Field>

          {/* 参考图上传（图生图 / 垫图 / ControlNet 输入） */}
          <Field label="参考图上传">
            <div className="flex flex-wrap gap-2">
              {refImages.map((src, i) => (
                <div key={i} className="relative h-14 w-14 overflow-hidden rounded border border-ink-200">
                  <img src={src} alt={`参考 ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setRefImages(refImages.filter((_, j) => j !== i))}
                    className="absolute right-0 top-0 rounded-bl bg-black/50 px-1 text-[9px] text-white hover:bg-black/70"
                  >×</button>
                </div>
              ))}
              <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-ink-300 text-ink-400 hover:border-brand-300 hover:text-brand-500">
                <Upload className="h-4 w-4" />
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    files.forEach((f) => {
                      const reader = new FileReader()
                      reader.onload = () => setRefImages((prev) => [...prev, reader.result as string])
                      reader.readAsDataURL(f)
                    })
                  }} />
              </label>
            </div>
            <p className="mt-1 text-[10px] text-ink-400">支持多张参考图（图生图 / 风格迁移 / ControlNet）</p>
          </Field>

          {/* ControlNet 占位 */}
          <Field label="ControlNet">
            <div className="grid grid-cols-3 gap-1.5">
              {CONTROLNET_TYPES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveControlNet(activeControlNet === c.id ? null : c.id)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[10px] transition-all',
                    activeControlNet === c.id
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300'
                  )}
                  title={c.desc}
                >
                  <span className="font-medium">{c.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-ink-400">线稿 / 深度 / 姿态等空间约束（待 API 接入）</p>
          </Field>

          {/* 高级 */}
          <details className="group rounded-lg border border-ink-200 p-2.5">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-ink-700">
              高级选项
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2 text-[11px] text-ink-500">
              <label className="flex items-center justify-between">
                <span>面部修复</span>
                <input type="checkbox" className="accent-brand-600" />
              </label>
              <label className="flex items-center justify-between">
                <span>超清放大 4x</span>
                <input type="checkbox" className="accent-brand-600" />
              </label>
              <label className="flex items-center justify-between">
                <span>线稿上色</span>
                <input type="checkbox" className="accent-brand-600" />
              </label>
              <label className="flex items-center justify-between">
                <span>去水印 / 去噪</span>
                <input type="checkbox" className="accent-brand-600" />
              </label>
            </div>
          </details>
        </div>

        {/* 生成按钮 */}
        <div className="border-t border-ink-200 p-3">
          <button
            onClick={s.generate}
            disabled={!s.prompt.trim() || isBusy}
            className="btn-primary w-full py-2.5 text-sm"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {s.status === 'queued' ? '排队中…' : '生成中…'}
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                生成图片（{s.batch} 张）
              </>
            )}
          </button>
          <button onClick={s.reset} className="btn-ghost mt-2 w-full text-xs">
            <RotateCcw className="h-3 w-3" /> 重置参数
          </button>
        </div>
      </aside>
    </div>
  )
}
