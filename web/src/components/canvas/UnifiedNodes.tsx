// 统一节点组件 - 图像+视频合并画布的所有节点类型 + 基类
//
// 对标 LibTV 画布：5 大基础节点(text/script/image/video/audio) + 辅助节点(negative/params/output)
// UBaseNode: 节点容器(header + 端口 + 内容 + 删除)
// 具体节点: TextNode / ScriptNode / ImageNode / VideoNode / AudioNode / UNegativeNode / UParamsNode

import { useRef, useState, useCallback, useEffect, memo, type ReactNode, type MouseEvent, type ComponentType, type SVGProps } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Dices, Loader2, Wand2, RotateCcw, Play, Pause, Minus, Plus,
  Type, Ban, Sliders, Image as ImageIcon, Film, Music, FileText, Cpu, GalleryHorizontalEnd, AlertCircle, Send, Volume2,
  Search, Heart, Clock, Building2, Store, Sparkles, Layers, Palette, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ArrowUpAZ, ImagePlus, Upload,
  Settings, Eye, EyeOff, SlidersHorizontal, Grid3x3, Crop, RefreshCw, Eraser, Droplets, PenLine, Gauge, Ruler, Bot,
  Maximize2, Minimize2, Languages, Globe, Download, FlipHorizontal, Trash2,
} from 'lucide-react'
import {
  useUnifiedCanvasStore, UNODE_PORTS, UNODE_SIZE, IMAGE_MODELS, IMAGE_RESOLUTIONS, IMAGE_RATIOS, AUDIO_VOICES,
  VIDEO_MODELS, VIDEO_RESOLUTIONS, VIDEO_DURATIONS,
  type UCanvasNode, type UnifiedNodeType, type UnifiedPortType, type UPort,
} from '../../store/useUnifiedCanvasStore'
import { RATIOS, RATIO_CLASS } from '../image/constants'
import type { AspectRatio } from '../../store/useStudioStore'
import { useProjectStore } from '../../store/useProjectStore'
import { cn } from '../../lib/utils'
import { useCostEstimate, formatTokensCompact } from '../../hooks/useCostEstimate'
import { CostBadge } from '../ui/CostBadge'
import { useQuotaModalStore } from '../../store/useQuotaModalStore'

// 免费翻译函数 —— 使用 MyMemory Translation API（无需 API Key）
// 中→英 方向；自动检测是否包含中文，不包含时原样返回
async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return text
  // 无中文字符 → 视为已是英文，直接返回
  if (!/[\u4e00-\u9fa5]/.test(trimmed)) return text
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=zh-CN|en`
    const res = await fetch(url)
    if (!res.ok) throw new Error('translate failed')
    const data = await res.json()
    const translated = data?.responseData?.translatedText
    return translated || text
  } catch {
    return text // 网络失败时原样返回，不报错
  }
}

export const HEADER_HEIGHT = 8
export const PORT_GAP = 26
// 端口圆心相对"所在行"的Y偏移（端口容器 top: y，translate -1/2 -1/2，+14用来把圆心定位到行中心）
// 此常量必须与 UnifiedCanvas.tsx 的 getPortPos 完全一致，确保连线端点与±号锚点视觉重合
export const PORT_Y_OFFSET = 14

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

// 获取连接到指定输入端口的源节点完整引用信息
export function getSourceRefs(nodeId: string, portId: string): Array<{ connId: string; srcLabel: string; srcType: UnifiedNodeType; srcImage?: string }> {
  const { connections, nodes } = useUnifiedCanvasStore.getState()
  if (!connections || !nodes) return []
  return connections
    .filter((c) => c.target.nodeId === nodeId && c.target.portId === portId)
    .map((conn) => {
      const srcNode = nodes.find((n) => n.id === conn.source.nodeId)
      if (!srcNode) return null
      const meta = UNODE_META[srcNode.type]
      if (!meta) return null
      const label = srcNode.data.__label || meta.label
      let srcImage: string | undefined
      if (srcNode.type === 'image') {
        const imgs = (srcNode.data.imageResults ?? []).filter((r) => r.status === 'done')
        srcImage = imgs[0]?.url
      } else if (srcNode.type === 'video') {
        srcImage = srcNode.data.videoResult?.thumbnail
      } else if (srcNode.type === 'audio') {
        srcImage = srcNode.data.audioResult?.url
      }
      return { connId: conn.id, srcLabel: label, srcType: srcNode.type, srcImage }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

// 移除指定连接
export function removeConnection(connId: string) {
  useUnifiedCanvasStore.getState().removeConnection(connId)
}

// 引用小图标组件（带 hover 预览 —— 使用 state 控制 + fixed 定位避免父容器裁剪）
const RefIcon = memo(function RefIcon({
  refData,
  accentColor,
  onPreview,
}: {
  refData: { connId: string; srcLabel: string; srcType: UnifiedNodeType; srcImage?: string }
  accentColor: string
  onPreview: (img: string) => void
}) {
  const meta = UNODE_META[refData.srcType]
  const [hovered, setHovered] = useState(false)
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null)
  const [popupHeight, setPopupHeight] = useState(0)
  const iconRef = useRef<HTMLDivElement>(null)
  const hoverIdRef = useRef<string | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  // 清除隐藏计时器
  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  // 显示预览弹窗 —— 使用 fixed 定位，避免被任何父容器的 overflow 裁剪
  const handleEnter = useCallback(() => {
    clearHideTimer()
    hoverIdRef.current = refData.connId

    const rect = iconRef.current?.getBoundingClientRect()
    if (rect) {
      // 弹窗尺寸：内容 128×72 + padding 4px
      const POPUP_W = 132
      const POPUP_H = 76
      // 弹窗显示在图标上方，居中对齐
      let x = rect.left + rect.width / 2 - POPUP_W / 2
      let y = rect.top - 88 // 向上偏移 88px

      // 边界检测：确保弹窗在视口内
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (x < 8) x = 8
      if (x + POPUP_W > vw - 8) x = vw - 8 - POPUP_W
      if (y - POPUP_H < 8) {
        // 上方空间不足时，显示在下方
        y = rect.bottom + 8
      }
      setPopupHeight(POPUP_H)
      setPopupPos({ x, y })
    }
    setHovered(true)
  }, [refData.connId, refData.srcImage])

  // 隐藏预览弹窗 —— 延迟隐藏，避免快速切换闪烁
  const handleLeave = useCallback(() => {
    // 仅当当前 hoverId 仍是自己时才隐藏（防止快速切换时旧 leave 覆盖新 enter）
    if (hoverIdRef.current === refData.connId) {
      // 延迟 150ms 隐藏，给用户足够时间移动鼠标
      hideTimerRef.current = window.setTimeout(() => {
        hoverIdRef.current = null
        setHovered(false)
        setPopupPos(null)
        setPopupHeight(0)
      }, 150)
    }
  }, [refData.connId])

  return (
    <>
      <div
        ref={iconRef}
        className="relative inline-block"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {refData.srcImage ? (
          <button
            onDoubleClick={(e) => { e.stopPropagation(); onPreview(refData.srcImage!) }}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex h-6 w-6 items-center overflow-hidden rounded border transition-transform duration-150 hover:scale-110"
            style={{ borderColor: accentColor + '40' }}
            title={refData.srcLabel}
          >
            <img src={refData.srcImage} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div
            className="flex h-6 w-6 items-center justify-center rounded border"
            style={{ background: meta!.color + '20', borderColor: meta!.color + '40' }}
          >
            <ImageIcon className="h-3 w-3" style={{ color: meta!.color }} />
          </div>
        )}
        {/* 移除按钮 —— hover 时显示 */}
        <button
          onClick={(e) => { e.stopPropagation(); removeConnection(refData.connId) }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500/80 text-white transition-opacity ${
            hovered ? 'opacity-100' : 'opacity-0'
          }`}
          title="移除引用"
        >
          <X className="h-2 w-2" />
        </button>
      </div>
      {/* 悬浮预览弹窗 —— Portal 到 body，fixed 定位 + 高 z-index，脱离所有父容器裁剪 */}
      {hovered && popupPos && createPortal(
        <div
          className="pointer-events-none fixed z-[400]"
          style={{
            left: popupPos.x,
            top: popupPos.y,
            animation: 'refPreviewFade 150ms ease-out',
          }}
        >
          {refData.srcImage ? (
            <img src={refData.srcImage} alt="" className="h-[72px] w-[128px] rounded object-cover" />
          ) : (
            <div className="flex h-[72px] w-[128px] items-center justify-center rounded" style={{ background: (meta?.color || '#888') + '20' }}>
              <ImageIcon className="h-6 w-6" style={{ color: meta?.color || '#888' }} />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
})

// 节点元信息（标签/图标/颜色）
export const UNODE_META: Record<UnifiedNodeType, { label: string; icon: IconComponent; color: string }> = {
  image: { label: '图片生成', icon: ImageIcon, color: '#22d3ee' },
  video: { label: '视频生成', icon: Film, color: '#fbbf24' },
  audio: { label: '音频生成', icon: Music, color: '#f472b6' },
}

export const UPORT_COLOR: Record<UnifiedPortType, string> = {
  text: '#a78bfa',
  script: '#38bdf8',
  image: '#22d3ee',
  video: '#fbbf24',
  audio: '#f472b6',
  negative: '#f87171',
  params: '#2dd4bf',
}

interface BaseNodeProps {
  node: UCanvasNode
  selected: boolean
  meta: { label: string; icon: IconComponent; color: string }
  ports: { inputs: UPort[]; outputs: UPort[] }
  size: { width: number; height: number }
  onMouseDown: (e: MouseEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  onPortStart: (e: MouseEvent, portId: string, type: UnifiedPortType, isOutput: boolean) => void
  onPortUp: (e: MouseEvent) => void
  onDelete: () => void
  children: ReactNode
  settingsPanel?: ReactNode
}

// 端口在画布坐标系中的精确位置常量（与 UnifiedCanvas.tsx 的 getPortPos 完全对齐）
// 节点边框 1px，端口容器 absolute relativeTo padding edge（padding edge = border-box + NODE_BORDER）
// HOT = 32，UPortHandle 内的 HOT div 使用 -translate-x-1/2 居中
// translate 后 HOT div 中心 = UPortHandle 左边缘（translate 将中心移到元素 pre-translate 位置）
// 因此端口中心 = NODE_BORDER + x + 0 = NODE_BORDER + x
const NODE_BORDER = 1

// 计算端口 x 坐标，使端口中心对齐节点边框外缘
// UBaseNode 的 padding edge 在 node.position.x + NODE_BORDER
// 输入端口中心 → node.position.x  （节点左边框外缘）
// 输出端口中心 → node.position.x + width （节点右边框外缘）
// 公式: center = NODE_BORDER + x  →  x = center - NODE_BORDER
const INPUT_PORT_X = 0 - NODE_BORDER      // = -1
const OUTPUT_PORT_X = (w: number) => w - NODE_BORDER // = w - 1

// 节点容器基类：header + 内容区（hover 时在端口位置显示可见的 + 号连接按钮）
// memo 化：仅当 node/selected/meta/ports/size 等 props 变化时才重渲染
// children 和 settingsPanel 是 ReactNode，memo 浅比较会判为不同引用，
// 但上层 CanvasNode 组件会通过稳定订阅来减少触发频率
export const UBaseNode = memo(function UBaseNode({
  node, selected, meta, ports, size, onMouseDown, onContextMenu, onPortStart, onPortUp, onDelete, children, settingsPanel,
}: BaseNodeProps) {
  const Icon = meta.icon
  const [hovered, setHovered] = useState(false)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  // 动态节点高度：生成前后壳高度会变，端口必须同步真实高度的 1/2 居中，否则端口/连线错位
  const [realH, setRealH] = useState<number>(size.height)
  useEffect(() => {
    const el = nodeRef.current
    if (!el) return
    const measure = () => {
      const h = el.getBoundingClientRect().height || el.offsetHeight || size.height
      setRealH(h)
    }
    measure()
    // ResizeObserver 监听内容尺寸变化（图片生成 / 设置面板展开等）
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    // 图片加载完成后高度可能跳变，兜底轮询 2 次
    const t1 = setTimeout(measure, 200)
    const t2 = setTimeout(measure, 800)
    return () => {
      if (ro) ro.disconnect()
      clearTimeout(t1); clearTimeout(t2)
    }
  }, [size.height, node.id, node.type])

  // 补位虚拟端口：所有节点都保证 至少 1 个输入口 + 1 个输出口（用于 hover 时显示左右 + 号锚点）
  // 真实连线校验仍然走原端口定义 canConnect
  const firstInput: UPort | null = ports.inputs[0] ?? null
  const firstOutput: UPort | null = ports.outputs[0] ?? null
  // 推断虚拟类型：取节点主产物
  const defaultType = (
    node.type === 'image' ? 'image' :
    node.type === 'video' ? 'video' :
    node.type === 'audio' ? 'audio' :
    'text'
  ) as UnifiedPortType
  const virtualInput: UPort = firstInput ?? { id: '__vin__', label: '输入', type: defaultType }
  const virtualOutput: UPort = firstOutput ?? { id: '__vout__', label: '输出', type: defaultType }
  // 虚拟口放在节点左侧/右侧垂直居中（基于实际高度）
  const centerY = realH / 2
  const anchorY = centerY

  return (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      className={cn(
        'absolute rounded-xl border bg-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-[border-color,background-color,box-shadow] duration-150 group/unode',
        selected
          ? 'z-10'
          : 'border-[#1f1f1f] hover:border-[#2a2a2a]',
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: size.width,
        // 最小高度兜底，避免生成前尺寸坍塌导致端口浮在空气里
        minHeight: size.height,
        ...(selected ? {
          borderColor: meta.color,
          boxShadow: `0 0 0 1px ${meta.color}60, 0 8px 32px ${meta.color}25, 0 4px 24px rgba(0,0,0,0.6)`,
        } : {}),
      }}
      // preventDefault 关键：避免浏览器把在图片上的按下识别为原生拖放，从而跳过 mouseup 造成“松手后继续跟随鼠标”
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(e) }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 节点标签 - 浮动在顶部边框外，左对齐 */}
      <div className="absolute -top-[28px] left-2 whitespace-nowrap pointer-events-none">
        <span className="text-[11px] font-medium" style={{ color: meta.color + '73' /* 透明度 ≈ 45%，不干扰视觉主体 */ }}>
          {node.data.__label || meta.label}
        </span>
      </div>

      {/* 原有输入端口（invisible 热区）—— 垂直居中对齐节点左边框外缘 */}
      {ports.inputs.map((p, i) => (
        <UPortHandle
          key={p.id}
          port={p}
          isOutput={false}
          x={INPUT_PORT_X}
          y={centerY + i * PORT_GAP}
          onPortStart={onPortStart}
          onPortUp={onPortUp}
          invisible
          plusVisible={hovered}
        />
      ))}
      {/* 原有输出端口（invisible 热区）—— 垂直居中对齐节点右边框外缘 */}
      {ports.outputs.map((p, i) => (
        <UPortHandle
          key={p.id}
          port={p}
          isOutput={true}
          x={OUTPUT_PORT_X(size.width)}
          y={centerY + i * PORT_GAP}
          onPortStart={onPortStart}
          onPortUp={onPortUp}
          invisible
          plusVisible={hovered}
        />
      ))}

      {/* 补位：没有输入口时增加一个虚拟输入口（仅 hover 时显示） */}
      {ports.inputs.length === 0 && (
        <UPortHandle
          port={virtualInput}
          isOutput={false}
          x={INPUT_PORT_X}
          y={anchorY}
          onPortStart={onPortStart}
          onPortUp={onPortUp}
          invisible
          virtual
          plusVisible={hovered}
        />
      )}
      {/* 补位：没有输出口时增加一个虚拟输出口（仅 hover 时显示） */}
      {ports.outputs.length === 0 && (
        <UPortHandle
          port={virtualOutput}
          isOutput={true}
          x={OUTPUT_PORT_X(size.width)}
          y={anchorY}
          onPortStart={onPortStart}
          onPortUp={onPortUp}
          invisible
          virtual
          plusVisible={hovered}
        />
      )}

      {/* Content */}
      <div className="px-3 pb-3 pt-1.5">
        {children}
      </div>

      {/* 设置面板 - 相对节点自动定位，间距恒定 */}
      {settingsPanel && (
        <div
          className="absolute z-30"
          style={{
            top: 'calc(100% + 16px)',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {settingsPanel}
        </div>
      )}
    </div>
  )
})

// 端口连接热区：
// - invisible 模式：12x12 热区 不变，用于精准连线
// - plusVisible=true 时：在同坐标叠加一个可见的 "+ 圆形锚点"（图 1），用户视觉上看到的连接按钮
// - virtual=true：虚拟端口，只显示 +号锚点，不渲染小原点壳
const UPortHandle = memo(function UPortHandle({
  port, isOutput, x, y, onPortStart, onPortUp, invisible, plusVisible, virtual,
}: {
  port: UPort
  isOutput: boolean
  x: number
  y: number
  onPortStart: (e: MouseEvent, portId: string, type: UnifiedPortType, isOutput: boolean) => void
  onPortUp: (e: MouseEvent) => void
  invisible?: boolean
  plusVisible?: boolean
  virtual?: boolean
}) {
  const color = UPORT_COLOR[port.type]
  const HOT = 32 // 统一命中热区尺寸（与 PORT_HALF=16 对齐，确保坐标计算精确）
  return (
    <div
      className="absolute z-20"
      style={{ left: x, top: y }}
    >
      {/* 底层：大尺寸命中热区（HOT x HOT）—— 永远存在用于命中检测，但视觉上完全透明 */}
      <div
        data-port-id={port.id}
        data-port-type={port.type}
        data-port-is-output={String(isOutput)}
        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full"
        style={{
          width: HOT,
          height: HOT,
          backgroundColor: 'transparent',
          border: 'none',
          boxShadow: 'none',
        }}
        onMouseDown={(e) => { e.stopPropagation(); onPortStart(e, port.id, port.type, isOutput) }}
        onMouseUp={(e) => { onPortUp(e) }}
      />
      {/* 中层：12x12 可见端口圆点（非 invisible 时显示；纯视觉，不拦截事件） */}
      {!invisible && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: 12,
            height: 12,
            backgroundColor: color,
            borderColor: '#1a1a1a',
            boxShadow: '0 0 0 1px ' + color + '40',
          }}
        />
      )}
      {/* 上层：+ 号圆形可见锚点（hover 时淡入，纯视觉不拦截） */}
      <div
        className={cn(
          'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border transition-all duration-150',
          plusVisible
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-90',
        )}
        style={{
          width: virtual ? 26 : 28,
          height: virtual ? 26 : 28,
          backgroundColor: '#1a1a1a',
          borderColor: plusVisible ? '#3a3a3a' : 'transparent',
          boxShadow: plusVisible ? '0 2px 10px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        <Plus
          className="h-4 w-4"
          style={{ color: '#c9c9c9' }}
          strokeWidth={2.4}
        />
      </div>
    </div>
  )
})

// ==================== 图片生成节点（仅预览，设置面板独立浮动） ====================

export const ImageNode = memo(function ImageNode({ node }: { node: UCanvasNode }) {
  const runImageGen = useUnifiedCanvasStore((s) => s.runImageGen)
  const updateNodeData = useUnifiedCanvasStore((s) => s.updateNodeData)
  const selectNode = useUnifiedCanvasStore((s) => s.selectNode)
  const selectedNodeId = useUnifiedCanvasStore((s) => s.selectedNodeId)
  const isSelected = selectedNodeId === node.id
  const meta = UNODE_META[node.type]
  const status = node.data.imageStatus ?? 'idle'
  const isBusy = status === 'queued' || status === 'running'
  const results = node.data.imageResults ?? []
  const [previewOpen, setPreviewOpen] = useState(false)
  const [resultIndex, setResultIndex] = useState(0)

  const model = node.data.imageModel ?? 'general-pro'
  const resolution = node.data.imageResolution ?? '2k'
  const count = node.data.imageCount ?? 1
  const currentModel = IMAGE_MODELS.find(m => m.id === model)
  const currentResolution = IMAGE_RESOLUTIONS.find(r => r.id === resolution)

  // 结果索引越界保护
  const safeIndex = Math.min(resultIndex, Math.max(0, results.length - 1))
  const cur = results[safeIndex]
  const hasMultiple = results.length > 1

  // 图片加载完成 → 更新状态为 done
  const handleImageLoad = () => {
    if (cur && cur.status === 'loading') {
      const updated = results.map((r) =>
        r.id === cur.id ? { ...r, status: 'done' as const } : r
      )
      const allDone = updated.every((r) => r.status === 'done' || r.status === 'error')
      updateNodeData(node.id, {
        imageResults: updated,
        ...(allDone ? { imageStatus: 'done' as const } : {}),
      })
    }
  }

  // 图片加载失败 → 更新状态为 error
  const handleImageError = () => {
    if (cur && cur.status === 'loading') {
      const updated = results.map((r) =>
        r.id === cur.id ? { ...r, status: 'error' as const } : r
      )
      const allDone = updated.every((r) => r.status === 'done' || r.status === 'error')
      updateNodeData(node.id, {
        imageResults: updated,
        ...(allDone ? { imageStatus: 'error' as const } : {}),
      })
    }
  }

  return (
    <div className="relative -mx-3 -mt-1.5 -mb-3" onMouseDown={() => selectNode(node.id)}>
      {/* 结果工具栏：仅在图片生成完成后显示（浮动独立，不接触节点） */}
      {cur && cur.status === 'done' && isSelected && (
        <div
          className="absolute -top-[74px] left-1/2 z-50 flex h-[50px] w-[600px] -translate-x-1/2 items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#121212]/95 px-3 shadow-2xl backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { updateNodeData(node.id, { imageResolution: '4k' }); runImageGen(node.id) }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="高清放大"
          >
            <Sparkles className="h-4 w-4 text-cyan-400" />
            高清
          </button>
          <button
            onClick={() => { updateNodeData(node.id, { imageCount: 4 }); runImageGen(node.id) }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="9宫格生成"
          >
            <Grid3x3 className="h-4 w-4 text-cyan-400" />
            9宫格
          </button>
          <button
            onClick={() => { updateNodeData(node.id, { imageRatio: '4:3', imageCount: 3 }); runImageGen(node.id) }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="三视图"
          >
            <GalleryHorizontalEnd className="h-4 w-4 text-cyan-400" />
            三视图
          </button>
          <button
            onClick={() => { updateNodeData(node.id, { imageRatio: '21:9' }); runImageGen(node.id) }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="基于当前场景创建720°全景图"
          >
            <Globe className="h-4 w-4 text-cyan-400" />
            全景
          </button>
          <div className="h-6 w-px bg-neutral-700" />
          <button
            onClick={() => { if (cur?.url) { updateNodeData(node.id, { imageFlip: !(node.data.imageFlip) }); runImageGen(node.id) } }}
            className="group flex w-12 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="旋转翻转"
          >
            <FlipHorizontal className="h-4 w-4 text-amber-400" />
            <span className="hidden group-hover:inline">翻转</span>
          </button>
          <button
            onClick={() => { if (cur?.url) { const a = document.createElement('a'); a.href = cur.url; a.download = `image-${cur.seed}.png`; a.click() } }}
            className="group flex w-12 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="下载图片"
          >
            <Download className="h-4 w-4 text-amber-400" />
            <span className="hidden group-hover:inline">下载</span>
          </button>
          <button
            onClick={() => setPreviewOpen(true)}
            className="group flex w-12 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            title="全屏预览"
          >
            <Maximize2 className="h-4 w-4 text-amber-400" />
            <span className="hidden group-hover:inline">预览</span>
          </button>
        </div>
      )}
      {/* 预览区 */}
      <div
        className="relative overflow-hidden select-none rounded-lg bg-[#161616] group"
        style={{ aspectRatio: ((cur?.ratio || '16:9') === 'adapt' ? '1/1' : (cur?.ratio || '16:9').replace(':', '/')) }}
        // 阻止原生图片拖拽，避免“拖出图片”效果 + 松手后跟随的粘手 Bug
        onDragStart={(e) => e.preventDefault()}
      >
        {/* 空状态 */}
        {results.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-600 pointer-events-none">
            <ImageIcon className="h-11 w-11 opacity-15" strokeWidth={1} />
          </div>
        )}

        {/* 预览图 — 永远不拦截鼠标/原生拖动。节点拖拽走父容器的 onMouseDown。 */}
        {cur && cur.status !== 'error' && (
          <img
            src={cur.url}
            alt="生成图"
            draggable={false}
            className="h-full w-full object-cover transition-opacity duration-200 pointer-events-none select-none"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}

        {/* 加载中遮罩 — 纯视觉 */}
        {cur?.status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: meta.color }} />
            <span className="text-xs text-neutral-300">正在生成图片...</span>
          </div>
        )}

        {/* 错误：重试按钮允许点击，但阻止冒泡避免误触发节点选中/拖动 */}
        {cur?.status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-red-950/30">
            <span className="text-xs text-red-300 pointer-events-none">生成失败</span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); runImageGen(node.id) }}
              className="rounded-md bg-red-500/20 px-3 py-1 text-xs text-red-200 hover:bg-red-500/30"
            >
              重试
            </button>
          </div>
        )}

        {/* 多结果切换：计数徽章 + 左右箭头 */}
        {hasMultiple && cur && cur.status !== 'loading' && (
          <>
            {/* 计数徽章 */}
            <div className="absolute top-2 left-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm pointer-events-none">
              {safeIndex + 1} / {results.length}
            </div>
            {/* 左箭头 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setResultIndex((i) => (i - 1 + results.length) % results.length)
              }}
              className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              title="上一张"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* 右箭头 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setResultIndex((i) => (i + 1) % results.length)
              }}
              className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              title="下一张"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

      </div>

      {/* 全屏预览弹窗 — 使用 portal 逃离画布 transform 上下文 */}
      {previewOpen && cur && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={() => setPreviewOpen(false)}>
          <button onClick={() => setPreviewOpen(false)} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
          <img
            src={cur.url}
            alt="预览"
            className="max-h-[100vh] max-w-[100vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </div>
  )
})

// ==================== 图片设置面板（独立浮动窗口） ====================
export function ImageSettingsPanel({ node }: { node: UCanvasNode }) {
  const runImageGen = useUnifiedCanvasStore((s) => s.runImageGen)
  const clearImageResults = useUnifiedCanvasStore((s) => s.clearImageResults)
  const update = useUnifiedCanvasStore((s) => s.updateNodeData)
  useUnifiedCanvasStore((s) => s.connections) // 订阅变化以刷新引用卡片
  const meta = UNODE_META[node.type]
  const status = node.data.imageStatus ?? 'idle'
  const isBusy = status === 'queued' || status === 'running'
  const results = node.data.imageResults ?? []
  const prompt = (node.data.imagePrompt as string) || ''
  const [refTab, setRefTab] = useState<'reference' | 'mark' | 'style' | 'results'>('reference')
  const [showModelList, setShowModelList] = useState(false)
  const [showSizeList, setShowSizeList] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const model = node.data.imageModel ?? 'general-pro'
  const resolution = node.data.imageResolution ?? '2k'
  const ratio = (node.data.imageRatio as string) || '16:9'
  const count = node.data.imageCount ?? 1
  const currentModel = IMAGE_MODELS.find(m => m.id === model)
  const currentResolution = IMAGE_RESOLUTIONS.find(r => r.id === resolution)
  const cur = results[0]
  const refCount = getSourceRefs(node.id, 'ref').length

  // 预计消耗积分：kind=image；实际扣量走 count 张 暂时后端不乘 batch，只用模型+比例
  const imgEst = useCostEstimate('image', { model, ratio, resolution })
  const imgWrap = {
    disabled: isBusy,
    onClick: () => {
      if (imgEst.lowBalance) {
        useQuotaModalStore.getState().openModal({
          need: imgEst.tokens,
          remaining: imgEst.remaining,
          message: `积分不足：本次预计消耗 ${formatTokensCompact(imgEst.tokens ?? 0)}，您还剩 ${formatTokensCompact(imgEst.remaining)}`,
        })
        return
      }
      void runImageGen(node.id)
    },
  }

  const panelBody = (
    <div
      className={expanded
        ? 'w-[720px] h-[550px] rounded-xl border border-[#1f1f1f] bg-[#1a1a1a] shadow-2xl flex flex-col overflow-visible'
        : 'w-[660px] rounded-xl border border-[#1f1f1f] bg-[#1a1a1a] shadow-2xl'}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 标签页 + 全屏按钮 */}
      <div className="flex items-center gap-0.5 px-3 py-2">
        {(['reference', 'mark', 'style', 'results'] as const).map((tab) => {
          const labels = { reference: '参考', mark: '标记', style: '风格', results: '结果' }
          const icons = { reference: Layers, mark: PenLine, style: Palette, results: Grid3x3 }
          const Icon = icons[tab]
          const count = tab === 'results' ? results.length : 0
          return (
            <button
              key={tab}
              onClick={() => setRefTab(tab)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors',
                refTab === tab
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {labels[tab]}
              {count > 0 && (
                <span className="ml-0.5 rounded-full bg-cyan-500/20 px-1.5 text-[10px] text-cyan-300">
                  {count}
                </span>
              )}
            </button>
          )
        })}
        <button
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:text-neutral-300"
          title={expanded ? '还原' : '放大设置面板'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {/* 标签内容 */}
      <div className="flex-1 px-3 py-1 overflow-y-auto">
        {refTab === 'reference' && (
          <div className="relative h-full">
            <textarea
              value={prompt}
              onChange={(e) => update(node.id, { imagePrompt: e.target.value })}
              placeholder="可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜"
              rows={expanded ? 16 : 4}
              className="w-full h-full resize-none rounded-lg border border-[#1f1f1f] bg-[#161616] px-2.5 pb-2.5 text-[13px] leading-6 text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-cyan-500/50 min-h-[120px]"
              style={{ paddingTop: refCount > 0 ? 36 : 8 }}
            />
            {/* 引用内容以小图标显示在输入框左上角 */}
            {(() => {
              const refs = getSourceRefs(node.id, 'ref')
              if (refs.length === 0) return null
              return (
                <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
                  {refs.map((ref) => (
                    <RefIcon key={ref.connId} refData={ref} accentColor="#22d3ee" onPreview={setPreviewImg} />
                  ))}
                </div>
              )
            })()}
          </div>
        )}
        {refTab === 'mark' && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[#2a2a2a] text-sm text-neutral-500 h-full min-h-[120px]">
            <Upload className="mr-2 h-5 w-5" />
            上传图片进行标记编辑
          </div>
        )}
        {refTab === 'style' && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[#2a2a2a] text-sm text-neutral-500 h-full min-h-[120px]">
            <Palette className="mr-2 h-5 w-5" />
            选择风格预设
          </div>
        )}
        {refTab === 'results' && (
          <div className="h-full flex flex-col min-h-[120px]">
            {results.length === 0 ? (
              <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-[#2a2a2a] text-sm text-neutral-500">
                <ImageIcon className="mr-2 h-5 w-5" />
                暂无生成结果
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-neutral-500">共 {results.length} 张结果（最新在前）</span>
                  <button
                    onClick={() => clearImageResults(node.id)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="清空所有结果"
                  >
                    <Trash2 className="h-3 w-3" />
                    清空
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-4 gap-1.5">
                    {results.map((img) => (
                      <div
                        key={img.id}
                        className="relative aspect-video rounded-md overflow-hidden border border-[#1f1f1f] bg-[#0f0f0f] cursor-pointer group"
                        onClick={() => { setPreviewImg(img.url) }}
                      >
                        {img.status === 'loading' ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                          </div>
                        ) : img.status === 'error' ? (
                          <div className="absolute inset-0 flex items-center justify-center text-red-400">
                            <AlertCircle className="h-4 w-4" />
                          </div>
                        ) : (
                          <>
                            <img
                              src={img.url}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <ZoomIn className="h-4 w-4 text-white" />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部工具栏 - 单行 */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        {/* 模型选择 */}
        <div className="relative">
          <button
            onClick={() => { setShowModelList(v => !v); setShowSizeList(false) }}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-neutral-800/60"
          >
            <Bot className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
            <span className="text-[12px] text-neutral-200">{currentModel?.name || model}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 text-neutral-500 transition-transform', showModelList && 'rotate-180')} />
          </button>
          {showModelList && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-[120px] w-[200px] overflow-y-auto rounded-lg border border-[#1f1f1f] bg-[#121212] p-1 shadow-lg">
              {IMAGE_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { update(node.id, { imageModel: m.id }); setShowModelList(false) }}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left', model === m.id ? 'bg-cyan-500/15' : 'hover:bg-neutral-800/60')}
                >
                  <Bot className={cn('h-3 w-3 shrink-0', model === m.id ? 'text-cyan-300' : 'text-neutral-500')} />
                  <span className={cn('truncate text-[10px]', model === m.id ? 'text-cyan-100' : 'text-neutral-200')}>{m.name}</span>
                  {m.isNew && <span className="rounded bg-cyan-500/20 px-0.5 text-[7px] font-bold text-cyan-300">NEW</span>}
                  <span className={cn('ml-auto text-[9px] font-mono', model === m.id ? 'text-cyan-300' : 'text-neutral-600')}>{m.duration}s</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分隔点 */}
        <span className="text-neutral-700">·</span>

        {/* 比例/分辨率/数量 */}
        <div className="relative">
          <button
            onClick={() => { setShowSizeList(v => !v); setShowModelList(false) }}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-neutral-800/60"
          >
            <span className="font-mono text-[12px] text-neutral-200">{ratio}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[12px] text-neutral-200">{currentResolution?.quality || currentResolution?.label || '高清画质'}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[12px] text-neutral-200">{currentResolution?.label || '2K'}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[12px] text-neutral-400">{count}张</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 text-neutral-500 transition-transform', showSizeList && 'rotate-180')} />
          </button>
          {showSizeList && (
            <div className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-lg border border-[#1f1f1f] bg-[#121212] p-2 shadow-lg">
              <div className="flex gap-1">
                {IMAGE_RESOLUTIONS.map((r) => (
                  <button key={r.id} onClick={() => update(node.id, { imageResolution: r.id })}
                    className={cn('flex-1 rounded-md border py-0.5 text-[10px] font-medium', resolution === r.id ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1">
                {IMAGE_RATIOS.map((r) => (
                  <button key={r.id} onClick={() => update(node.id, { imageRatio: r.label })}
                    className={cn('flex h-6 flex-col items-center justify-center rounded-md border', ratio === r.label ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    <div className={cn('rounded-sm', ratio === r.label ? 'bg-cyan-400' : 'bg-neutral-700')}
                      style={{ width: `${Math.max(3, Math.min(r.w, r.h))}px`, height: `${Math.max(3, Math.max(r.w, r.h))}px` }} />
                    <span className="text-[7px]">{r.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {[1, 2, 4].map((c) => (
                  <button key={c} onClick={() => update(node.id, { imageCount: c })}
                    className={cn('flex-1 rounded-md border py-0.5 text-[10px] font-medium', count === c ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    {c}张
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧操作按钮组 */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* 积分消耗徽章（图像节点） */}
          <CostBadge tokens={imgEst.tokens} loading={imgEst.loading} lowBalance={imgEst.lowBalance} />
          <button
            onClick={async () => {
              if (!prompt.trim()) return
              const t = await translateToEnglish(prompt)
              if (t !== prompt) update(node.id, { imagePrompt: t })
            }}
            title="翻译为英文"
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Languages className="h-4 w-4" />
          </button>
          <button
            onClick={imgWrap.onClick}
            disabled={imgWrap.disabled}
            style={{
              background: isBusy
                ? `linear-gradient(to right, ${meta.color}80, ${meta.color}60)`
                : imgEst.lowBalance
                  ? 'linear-gradient(to right, #7f1d1d, #991b1b)'
                  : `linear-gradient(to right, ${meta.color}, ${meta.color}dd)`,
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-white transition',
              isBusy ? 'cursor-not-allowed opacity-80' : 'hover:brightness-110'
            )}
            title={
              imgEst.tokens != null && imgEst.tokens > 0
                ? imgEst.lowBalance
                  ? `积分不足：需要 ${formatTokensCompact(imgEst.tokens)}，剩余 ${formatTokensCompact(imgEst.remaining)} - 点击充值`
                  : `立即生成（预计消耗 ${formatTokensCompact(imgEst.tokens)} 积分）`
                : '立即生成'
            }
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 全屏预览 —— 图片节点 */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-[80vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewOpen(false)} className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
            {cur ? (
              <img src={cur.url} className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl" />
            ) : (
              <div className="flex h-[400px] w-[600px] items-center justify-center rounded-lg border border-dashed border-[#333] bg-[#0f0f0f] text-neutral-500">尚未生成图片</div>
            )}
          </div>
        </div>
      )}

      {/* 图片放大预览 */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-h-[80vh] max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <img src={previewImg} alt="" className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )

  return expanded
    ? createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setExpanded(false)} onWheel={(e) => e.stopPropagation()}>
          {panelBody}
        </div>,
        document.body
      )
    : panelBody
}

// ==================== 视频节点设置面板（独立浮动） ====================
export function VideoSettingsPanel({ node }: { node: UCanvasNode }) {
  const update = useUnifiedCanvasStore((s) => s.updateNodeData)
  const runVideoGen = useUnifiedCanvasStore((s) => s.runVideoGen)
  useUnifiedCanvasStore((s) => s.connections) // 订阅变化以刷新引用卡片
  const results = node.data.videoResult ? [node.data.videoResult] : []
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const status = node.data.videoStatus ?? 'idle'
  const meta = UNODE_META['video']

  const [refTab, setRefTab] = useState<'reference' | 'mark' | 'style'>('reference')
  const [showModelList, setShowModelList] = useState(false)
  const [showSizeList, setShowSizeList] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const model = node.data.videoModel ?? 'seedance'
  const resolution = node.data.videoResolution ?? '1080p'
  const duration = node.data.videoDuration ?? '5s'
  const ratio = (node.data.videoRatio as string) || '16:9'
  const currentModel = VIDEO_MODELS.find(m => m.id === model)
  const currentResolution = VIDEO_RESOLUTIONS.find(r => r.id === resolution)
  const currentDuration = VIDEO_DURATIONS.find(d => d.id === duration)
  const cur = results[0]
  const refCount = getSourceRefs(node.id, 'ref').length
  const isBusy = status === 'running' || status === 'queued'

  // 视频 duration id (5s / 10s) → 秒数
  const durationSeconds = Number(String(currentDuration?.id ?? duration).replace(/[^0-9]/g, '')) || 5
  const vidKind: 'video' | 'video.i2v' = refCount > 0 ? 'video.i2v' : 'video'
  const vidEst = useCostEstimate(vidKind, { model, duration: durationSeconds })
  const vidWrap = {
    disabled: isBusy,
    onClick: () => {
      if (vidEst.lowBalance) {
        useQuotaModalStore.getState().openModal({
          need: vidEst.tokens,
          remaining: vidEst.remaining,
          message: `积分不足：本次预计消耗 ${formatTokensCompact(vidEst.tokens ?? 0)}，您还剩 ${formatTokensCompact(vidEst.remaining)}`,
        })
        return
      }
      runVideoGen(node.id)
      setTimeout(() => vidEst.consume(), 0)
    },
  }

  const panelBody = (
    <div
      className={expanded
        ? 'w-[720px] h-[550px] rounded-xl border border-[#1f1f1f] bg-[#1a1a1a] shadow-2xl flex flex-col overflow-visible'
        : 'w-[660px] rounded-xl border border-[#1f1f1f] bg-[#1a1a1a] shadow-2xl'}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 标签页 + 全屏按钮 */}
      <div className="flex items-center gap-0.5 px-3 py-2">
        {(['reference', 'mark', 'style'] as const).map((tab) => {
          const labels = { reference: '参考', mark: '标记', style: '风格' }
          const icons = { reference: Layers, mark: PenLine, style: Palette }
          const Icon = icons[tab]
          return (
            <button
              key={tab}
              onClick={() => setRefTab(tab)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors',
                refTab === tab
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {labels[tab]}
            </button>
          )
        })}
        <button
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:text-neutral-300"
          title={expanded ? '还原' : '放大设置面板'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {/* 标签内容 */}
      <div className="flex-1 px-3 py-1 overflow-y-auto">
        {refTab === 'reference' && (
          <div className="relative h-full">
            <textarea
              value={node.data.videoPrompt ?? ''}
              onChange={(e) => update(node.id, { videoPrompt: e.target.value })}
              placeholder="描述你想生成的视频画面…"
              rows={expanded ? 16 : 4}
              className="w-full h-full resize-none rounded-lg border border-[#1f1f1f] bg-[#161616] px-2.5 pb-2.5 text-[13px] leading-6 text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-amber-500/50 min-h-[120px]"
              style={{ paddingTop: refCount > 0 ? 36 : 8 }}
            />
            {/* 引用内容以小图标显示在输入框左上角 */}
            {(() => {
              const refs = getSourceRefs(node.id, 'ref')
              if (refs.length === 0) return null
              return (
                <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
                  {refs.map((ref) => (
                    <RefIcon key={ref.connId} refData={ref} accentColor="#f59e0b" onPreview={setPreviewImg} />
                  ))}
                </div>
              )
            })()}
          </div>
        )}
        {refTab === 'mark' && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[#2a2a2a] text-sm text-neutral-500 h-full min-h-[120px]">
            <Upload className="mr-2 h-5 w-5" />
            上传图片进行标记编辑
          </div>
        )}
        {refTab === 'style' && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[#2a2a2a] text-sm text-neutral-500 h-full min-h-[120px]">
            <Palette className="mr-2 h-5 w-5" />
            选择风格预设
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        {/* 模型选择 */}
        <div className="relative">
          <button
            onClick={() => { setShowModelList(v => !v); setShowSizeList(false) }}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-neutral-800/60"
          >
            <Bot className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
            <span className="text-[12px] text-neutral-200">{currentModel?.name || model}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 text-neutral-500 transition-transform', showModelList && 'rotate-180')} />
          </button>
          {showModelList && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-[120px] w-[200px] overflow-y-auto rounded-lg border border-[#1f1f1f] bg-[#121212] p-1 shadow-lg">
              {VIDEO_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { update(node.id, { videoModel: m.id }); setShowModelList(false) }}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left', model === m.id ? 'bg-amber-500/15' : 'hover:bg-neutral-800/60')}
                >
                  <Film className={cn('h-3 w-3 shrink-0', model === m.id ? 'text-amber-300' : 'text-neutral-500')} />
                  <span className={cn('truncate text-[10px]', model === m.id ? 'text-amber-100' : 'text-neutral-200')}>{m.name}</span>
                  {m.isNew && <span className="rounded bg-amber-500/20 px-0.5 text-[7px] font-bold text-amber-300">NEW</span>}
                  <span className={cn('ml-auto text-[9px] font-mono', model === m.id ? 'text-amber-300' : 'text-neutral-600')}>{m.duration}s</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分隔点 */}
        <span className="text-neutral-700">·</span>

        {/* 分辨率/时长/比例 */}
        <div className="relative">
          <button
            onClick={() => { setShowSizeList(v => !v); setShowModelList(false) }}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-neutral-800/60"
          >
            <span className="font-mono text-[12px] text-neutral-200">{ratio}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[12px] text-neutral-200">{currentResolution?.label || '1080p'}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[12px] text-neutral-200">{currentDuration?.label || '5秒'}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 text-neutral-500 transition-transform', showSizeList && 'rotate-180')} />
          </button>
          {showSizeList && (
            <div className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-lg border border-[#1f1f1f] bg-[#121212] p-2 shadow-lg">
              <div className="flex gap-1">
                {VIDEO_RESOLUTIONS.map((r) => (
                  <button key={r.id} onClick={() => update(node.id, { videoResolution: r.id })}
                    className={cn('flex-1 rounded-md border py-0.5 text-[10px] font-medium', resolution === r.id ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {VIDEO_DURATIONS.map((d) => (
                  <button key={d.id} onClick={() => update(node.id, { videoDuration: d.id })}
                    className={cn('flex-1 rounded-md border py-0.5 text-[10px] font-medium', duration === d.id ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {IMAGE_RATIOS.filter(r => ['16:9', '9:16', '1:1', '4:3'].includes(r.label)).map((r) => (
                  <button key={r.id} onClick={() => update(node.id, { videoRatio: r.label })}
                    className={cn('flex h-6 flex-col items-center justify-center rounded-md border', ratio === r.label ? 'border-amber-400 bg-amber-500/10 text-amber-200' : 'border-[#1f1f1f] bg-[#161616] text-neutral-500 hover:text-neutral-300')}>
                    <div className={cn('rounded-sm', ratio === r.label ? 'bg-amber-400' : 'bg-neutral-700')}
                      style={{ width: `${Math.max(3, Math.min(r.w, r.h))}px`, height: `${Math.max(3, Math.max(r.w, r.h))}px` }} />
                    <span className="text-[7px]">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧操作按钮组 */}
        <div className="ml-auto flex items-center gap-0.5">
          <CostBadge tokens={vidEst.tokens} loading={vidEst.loading} lowBalance={vidEst.lowBalance} />
          <button
            onClick={async () => {
              const p = (node.data.videoPrompt as string) || ''
              if (!p.trim()) return
              const t = await translateToEnglish(p)
              if (t !== p) update(node.id, { videoPrompt: t })
            }}
            title="翻译为英文"
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <Languages className="h-4 w-4" />
          </button>
          <button
            onClick={vidWrap.onClick}
            disabled={vidWrap.disabled}
            style={{
              background: isBusy
                ? `linear-gradient(to right, ${meta.color}80, ${meta.color}60)`
                : vidEst.lowBalance
                  ? 'linear-gradient(to right, #7f1d1d, #991b1b)'
                  : `linear-gradient(to right, ${meta.color}, ${meta.color}dd)`,
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-white transition',
              isBusy ? 'cursor-not-allowed opacity-80' : 'hover:brightness-110'
            )}
            title={
              vidEst.tokens != null && vidEst.tokens > 0
                ? vidEst.lowBalance
                  ? `积分不足：需要 ${formatTokensCompact(vidEst.tokens)}，剩余 ${formatTokensCompact(vidEst.remaining)} - 点击充值`
                  : `立即生成（预计消耗 ${formatTokensCompact(vidEst.tokens)} 积分${vidKind === 'video.i2v' ? ' · 图生视频 +15%' : ''}）`
                : '立即生成'
            }
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 全屏预览 */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-[80vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewOpen(false)} className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
            {cur?.url ? (
              <video src={cur.url} className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" controls autoPlay />
            ) : (
              <div className="flex h-[400px] w-[600px] items-center justify-center rounded-lg border border-dashed border-[#333] bg-[#0f0f0f] text-neutral-500">尚未生成视频</div>
            )}
          </div>
        </div>
      )}

      {/* 图片放大预览 */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-h-[80vh] max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -right-3 -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <img src={previewImg} alt="" className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )

  return expanded
    ? createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setExpanded(false)} onWheel={(e) => e.stopPropagation()}>
          {panelBody}
        </div>,
        document.body
      )
    : panelBody
}

// ==================== 视频生成节点 ====================
export const VideoNode = memo(function VideoNode({ node }: { node: UCanvasNode }) {
  const status = node.data.videoStatus ?? 'idle'
  const selectNode = useUnifiedCanvasStore((s) => s.selectNode)
  const meta = UNODE_META['video']
  const cur = node.data.videoResult

  const [previewOpen, setPreviewOpen] = useState(false)
  const ratio = (node.data.videoRatio as string) || '16:9'

  return (
    <div className="relative -mx-3 -mt-1.5 -mb-3" onMouseDown={() => selectNode(node.id)}>
      {/* 预览区 */}
      <div
        className="relative overflow-hidden rounded-lg bg-[#161616] cursor-pointer"
        style={{ aspectRatio: ratio.replace(':', '/') }}
        onClick={() => cur?.url && setPreviewOpen(true)}
      >
        {!cur && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-neutral-600">
            <Film className="h-7 w-7 opacity-30" strokeWidth={1.2} />
            <p className="text-[10px]">尚未生成</p>
          </div>
        )}
        {status === 'running' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onClick={(e) => e.stopPropagation()}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: meta.color }} />
          </div>
        )}
        {status === 'queued' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
              <Clock className="h-4 w-4" /> 排队中...
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-950/40" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 text-[10px] text-red-300">
              <AlertCircle className="h-3.5 w-3.5" /> 生成失败
            </div>
          </div>
        )}
        {cur && status !== 'error' && status !== 'running' && status !== 'queued' && (
          <>
            {cur.thumbnail ? (
              <img src={cur.thumbnail} alt="视频缩略图" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-800">
                <Film className="h-8 w-8 text-neutral-600" />
              </div>
            )}
            {cur.url && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-black"
                  onClick={() => cur.url && setPreviewOpen(true)}
                >
                  <Play className="h-5 w-5 translate-x-[1px]" />
                </button>
              </div>
            )}
            {cur.placeholder && (
              <span className="absolute left-1.5 top-1.5 rounded bg-amber-900/60 px-1 py-0.5 text-[8px] text-amber-200">Demo</span>
            )}
            {cur.type && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1 py-0.5 text-[8px] text-neutral-300 backdrop-blur">
                {cur.type === 'text2video' ? '文生视频' : '图生视频'}
              </span>
            )}
          </>
        )}

        {/* Hover 信息层 */}
        {status === 'idle' && !cur && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-neutral-500 opacity-0 transition-opacity hover:opacity-100">
            <span>点击设置面板配置</span>
          </div>
        )}
      </div>

      {/* 全屏预览 */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-[80vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewOpen(false)} className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
            {cur?.url ? (
              <video src={cur.url} className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" controls autoPlay />
            ) : (
              <div className="flex h-[400px] w-[600px] items-center justify-center rounded-lg border border-dashed border-[#333] bg-[#0f0f0f] text-neutral-500">尚未生成视频</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

// ==================== 音频生成节点 ====================
export const AudioNode = memo(function AudioNode({ node }: { node: UCanvasNode }) {
  const update = useUnifiedCanvasStore((s) => s.updateNodeData)
  const runAudioGen = useUnifiedCanvasStore((s) => s.runAudioGen)
  useUnifiedCanvasStore((s) => s.connections) // 订阅变化以刷新引用卡片
  const meta = UNODE_META[node.type]
  const status = node.data.audioStatus ?? 'idle'
  const result = node.data.audioResult
  const isBusy = status === 'queued' || status === 'running'
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play().catch(() => setPlaying(false)); setPlaying(true) }
  }

  return (
    <div className="space-y-2">
      {/* 引用源节点卡片 */}
      {(() => {
        const refs = getSourceRefs(node.id, 'ref')
        if (refs.length === 0) return null
        return refs.map((ref) => {
          const srcMeta = UNODE_META[ref.srcType]
          return (
            <div key={ref.connId} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] p-1.5">
              {ref.srcImage ? (
                <img src={ref.srcImage} alt="" className="h-8 w-8 flex-shrink-0 rounded-md object-cover" />
              ) : (
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md"
                  style={{ background: srcMeta!.color + '33', color: srcMeta!.color }}
                >
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-neutral-200">{ref.srcLabel}</span>
                <span className="text-[10px] text-neutral-500">引用输入 · 语音内容</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeConnection(ref.connId) }}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                title="移除此引用"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })
      })()}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-neutral-400">音色</label>
        <select
          value={node.data.audioVoice ?? 'nova'}
          onChange={(e) => update(node.id, { audioVoice: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full rounded-lg border border-[#1f1f1f] bg-[#161616] px-2 py-1 text-xs text-neutral-200 outline-none focus:border-pink-500/50"
        >
          {AUDIO_VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.name} · {v.desc}</option>
          ))}
        </select>
      </div>

      <button
        onClick={() => void runAudioGen(node.id)}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={isBusy}
        style={{
          background: isBusy ? `${meta.color}80` : `linear-gradient(to right, ${meta.color}, ${meta.color}cc)`,
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            合成中...
          </>
        ) : (
          <>
            <Wand2 className="h-3.5 w-3.5" />
            生成语音
          </>
        )}
      </button>

      {result && result.url && (
        <div className="rounded-lg border border-[#1f1f1f] bg-[#161616] p-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: `${meta.color}20`, color: meta.color }}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[1px]" />}
            </button>
            <span className="flex items-center gap-1 text-[10px] text-neutral-500">
              <Volume2 className="h-3 w-3" /> 语音合成
            </span>
            <audio
              ref={audioRef}
              src={result.url}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          </div>
          {result.placeholder && (
            <span className="mt-1 inline-block rounded bg-pink-900/40 px-1.5 py-0.5 text-[9px] text-pink-300">Demo</span>
          )}
        </div>
      )}
      <p className="text-[10px] text-neutral-500">直接填写 TTS 朗读内容</p>
    </div>
  )
})

// 节点内容渲染分发
export function renderUnifiedNodeContent(node: UCanvasNode): ReactNode {
  switch (node.type) {
    case 'image': return <ImageNode node={node} />
    case 'video': return <VideoNode node={node} />
    case 'audio': return <AudioNode node={node} />
  }
}
