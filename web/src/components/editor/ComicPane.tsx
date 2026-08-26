// 漫画板块 Pane
//
// v1.2 决策第 1 项：漫画板块为六大板块之三
// 范围：自动排版 / 模板库 / 文字气泡 / 字体库 / 图层编辑 / 多页管理 /
//      角色 LoRA 一致性 / 多角色追踪 / 批量生成 / 智能裁剪 / 蒙版对齐 /
//      漫画→动态漫 / 视频导出 / KDP 出版尺寸 / 一键导出 / 商用授权证书 /
//      版权水印 / 区块链存证 / 漫画广场
// 当前实现：完整排版（Phase 1+2）+ Konva Transformer + 多页管理 + PNG 导出
// 待 API 接入：LoRA 一致性 / 批量生成 / 动态漫 / KDP 出口尺寸 / 区块链存证

import { useEffect, useState } from 'react'
import { Send, BookOpen, Image as ImageIcon } from 'lucide-react'
import LayoutModeView from '../studio/LayoutModeView'
import { useLayoutStore, LAYOUT_PRESETS } from '../../store/useLayoutStore'
import { useScriptStore } from '../../store/useScriptStore'
import { useStudioStore } from '../../store/useStudioStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useModelStore } from '../../store/useModelStore'

type JumpTarget = 'writing' | 'image' | 'comic' | 'audio' | 'video' | 'community'

interface Props {
  onJumpTo: (target: JumpTarget) => void
}

export default function ComicPane({ onJumpTo }: Props) {
  const layout = useLayoutStore()
  const script = useScriptStore()
  const studio = useStudioStore()
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const { getModelsByType, fetchModels } = useModelStore()
  const [activeModel, setActiveModel] = useState<string>('')

  // 自动初始化：如果漫画板块没有页面，但有脚本，自动从脚本送入排版
  useEffect(() => {
    const state = useLayoutStore.getState()
    const scriptState = useScriptStore.getState()
    if (state.pages.length === 0 && scriptState.script) {
      scriptState.sendToLayout()
    } else if (state.pages.length === 0) {
      state.addPage('strip3')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchModels('comic') }, [fetchModels])

  const onSendFromScript = () => {
    if (!script.script) {
      // 没有脚本 → 跳转到写作板块
      onJumpTo('writing')
      return
    }
    script.sendToLayout()
  }

  const onFillFromImage = () => {
    const latestTask = studio.history[0]
    if (!latestTask) {
      onJumpTo('image')
      return
    }
    // 把图像板块的图 src 填到漫画板块当前页的图像层（按 sceneId 或顺序匹配）
    const doneUrls = latestTask.results.filter((r) => r.status === 'done').map((r) => r.url)
    const page = layout.activePage()
    if (!page) return
    const imageLayers = page.layers.filter((l) => l.type === 'image')
    imageLayers.forEach((layer, i) => {
      if (doneUrls[i]) {
        layout.fillImage(layer.id, doneUrls[i])
      }
    })
  }

  const onPublishToCommunity = () => {
    // 把漫画项目数据写入 payload，并跳转到社区板块
    if (activeProjectId) {
      useProjectStore.getState().updatePayload(activeProjectId, { pages: layout.pages })
    }
    onJumpTo('community')
  }

  const activePage = layout.activePage()
  const scriptReady = !!script.script
  const imageReady = studio.history.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 工具栏：跨板块连贯接口 */}
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
          跨板块流转
        </span>
        <button
          onClick={onSendFromScript}
          className={scriptReady ? 'btn-outline !px-2.5 !py-1 text-[11px]' : 'btn-ghost !px-2.5 !py-1 text-[11px] opacity-60'}
          title={scriptReady ? '从写作板块拉取脚本+对白送入排版' : '尚无脚本，点击跳转到写作板块'}
        >
          <BookOpen className="h-3 w-3" /> {scriptReady ? '从脚本送入' : '去写作板块'}
        </button>
        <button
          onClick={onFillFromImage}
          className={imageReady ? 'btn-outline !px-2.5 !py-1 text-[11px]' : 'btn-ghost !px-2.5 !py-1 text-[11px] opacity-60'}
          title={imageReady ? '从图像板块拉取生成图填充到图层' : '尚无图像，点击跳转到图像板块'}
        >
          <ImageIcon className="h-3 w-3" /> {imageReady ? '从图像填充' : '去图像板块'}
        </button>
        <button
          onClick={() => onJumpTo('video')}
          className="btn-ghost !px-2.5 !py-1 text-[11px]"
          title="把漫画转为动态漫（视频板块）"
        >
          <Send className="h-3 w-3" /> 转动态漫
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-ink-500">
          {getModelsByType('comic').length > 0 && (
            <select
              value={activeModel}
              onChange={(e) => setActiveModel(e.target.value)}
              className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs text-violet-700 focus:border-violet-400"
            >
              {getModelsByType('comic').map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {activePage && (
            <>
              <span className="font-medium text-ink-700">{LAYOUT_PRESETS[activePage.layout].label}</span>
              <span>·</span>
              <span>{activePage.width}×{activePage.height}</span>
              <span>·</span>
              <span>{activePage.layers.length} 图层</span>
              <span>·</span>
              <span>{layout.pages.length} 页</span>
            </>
          )}
        </div>

        <button
          onClick={onPublishToCommunity}
          className="btn-primary !px-2.5 !py-1 text-[11px]"
        >
          <Send className="h-3 w-3" /> 发布到广场
        </button>
      </div>

      {/* 排版编辑器（复用 Phase 1+2 实现） */}
      <div className="flex-1 overflow-hidden">
        <LayoutModeView />
      </div>
    </div>
  )
}