// 排版编辑器视图
//
// Phase 1 实现：
// - Konva Stage 画布（缩放、平移）
// - ImageLayer / BubbleLayer / TextLayer 渲染
// - 选中 + 拖拽（不做 Transformer 自由变换，留 Phase 2）
// - 右侧图层列表 + 属性面板（极简）
// - PNG 导出
// - 模板切换（4 种）+ 多页管理

import { useEffect, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Rect,
  Image as KonvaImage,
  Text,
  Ellipse,
  Group,
  Line,
  Transformer,
} from 'react-konva'
import type Konva from 'konva'
import {
  Download,
  Plus,
  Minus,
  Trash2,
  Copy,
  Type as TypeIcon,
  MessageCircle,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Layers,
  Layout as LayoutIcon,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  useLayoutStore,
  LAYOUT_PRESETS,
  makeBubbleLayer,
  makeImageLayer,
  type Layer as LayerType,
  type ImageLayer,
  type BubbleLayer,
  type TextLayer,
  type LayoutType,
} from '../../store/useLayoutStore'
import { exportStagePNG } from '../../services/layoutApi'
import { cn } from '../../lib/utils'

// ============ 图像加载 hook ============
function useHTMLImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
    image.onerror = () => setImg(null)
    image.src = src
  }, [src])
  return img
}

// ============ ImageLayer 渲染 ============
function ImageLayerView({
  layer,
  isSelected,
  onSelect,
  onChange,
}: {
  layer: ImageLayer
  isSelected: boolean
  onSelect: () => void
  onChange: (partial: Partial<ImageLayer>) => void
}) {
  const image = useHTMLImage(layer.props.src)
  const imgRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const node = imgRef.current
    const tr = trRef.current
    if (!node || !tr) return
    if (isSelected) tr.nodes([node])
    else tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [isSelected])

  return (
    <>
      <KonvaImage
        ref={imgRef}
        image={image ?? undefined}
        x={layer.x}
        y={layer.y}
        width={layer.w}
        height={layer.h}
        rotation={layer.rotation}
        opacity={layer.opacity}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = imgRef.current
          if (!node) return
          const scaleX = node.scaleX()
          const scaleY = node.scaleY()
          // 应用变换后把 scale 重置回 1，把变化吸收到 w/h
          node.scaleX(1)
          node.scaleY(1)
          onChange({
            x: node.x(),
            y: node.y(),
            w: Math.max(20, layer.w * scaleX),
            h: Math.max(20, layer.h * scaleY),
            rotation: node.rotation(),
          })
        }}
      />
      {/* 无图占位 */}
      {!layer.props.src && (
        <Rect
          x={layer.x}
          y={layer.y}
          width={layer.w}
          height={layer.h}
          stroke="#94a3b8"
          strokeWidth={2}
          dash={[10, 6]}
          listening={false}
        />
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          keepRatio={false}
          borderStroke="#7c3aed"
          anchorStroke="#7c3aed"
          anchorFill="#ffffff"
          anchorSize={8}
          ignoreStroke={true}
        />
      )}
    </>
  )
}

// ============ BubbleLayer 渲染 ============
function BubbleLayerView({
  layer,
  isSelected,
  onSelect,
  onChange,
}: {
  layer: BubbleLayer
  isSelected: boolean
  onSelect: () => void
  onChange: (partial: Partial<BubbleLayer>) => void
}) {
  const { shape, text, fontFamily, fontSize, color, align, bgColor, borderColor } = layer.props
  const padding = 12
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const node = groupRef.current
    const tr = trRef.current
    if (!node || !tr) return
    if (isSelected) tr.nodes([node])
    else tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [isSelected])

  // 不同形状绘制
  return (
    <>
      <Group
        ref={groupRef}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        opacity={layer.opacity}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current
          if (!node) return
          const scaleX = node.scaleX()
          const scaleY = node.scaleY()
          node.scaleX(1)
          node.scaleY(1)
          onChange({
            x: node.x(),
            y: node.y(),
            w: Math.max(20, layer.w * scaleX),
            h: Math.max(20, layer.h * scaleY),
            rotation: node.rotation(),
          })
        }}
      >
        {shape === 'ellipse' && (
          <Ellipse
            x={layer.w / 2}
            y={layer.h / 2}
            radiusX={layer.w / 2}
            radiusY={layer.h / 2}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={2}
          />
        )}
        {shape === 'rect' && (
          <Rect
            width={layer.w}
            height={layer.h}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={2}
            cornerRadius={12}
          />
        )}
        {shape === 'shout' && (
          <Line
            points={generateStarPoints(layer.w, layer.h)}
            closed
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={2}
          />
        )}
        {shape === 'cloud' && (
          <Rect
            width={layer.w}
            height={layer.h}
            fill={bgColor}
            stroke={borderColor}
            strokeWidth={2}
            cornerRadius={40}
          />
        )}
        <Text
          x={padding}
          y={padding}
          width={layer.w - padding * 2}
          height={layer.h - padding * 2}
          text={text}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fill={color}
          align={align}
          verticalAlign="middle"
          listening={false}
        />
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          keepRatio={false}
          borderStroke="#7c3aed"
          anchorStroke="#7c3aed"
          anchorFill="#ffffff"
          anchorSize={8}
          ignoreStroke={true}
        />
      )}
    </>
  )
}

// 爆炸形点列表（粗略多边形）
function generateStarPoints(w: number, h: number): number[] {
  const cx = w / 2
  const cy = h / 2
  const r1 = Math.min(w, h) / 2
  const r2 = r1 * 0.7
  const points: number[] = []
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8
    const r = i % 2 === 0 ? r1 : r2
    points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
  }
  return points
}

// ============ TextLayer 渲染 ============
function TextLayerView({
  layer,
  isSelected,
  onSelect,
  onChange,
}: {
  layer: TextLayer
  isSelected: boolean
  onSelect: () => void
  onChange: (partial: Partial<TextLayer>) => void
}) {
  const { text, fontFamily, fontSize, color, align } = layer.props
  const txtRef = useRef<Konva.Text>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const node = txtRef.current
    const tr = trRef.current
    if (!node || !tr) return
    if (isSelected) tr.nodes([node])
    else tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [isSelected])

  return (
    <>
      <Text
        ref={txtRef}
        x={layer.x}
        y={layer.y}
        width={layer.w}
        text={text}
        fontFamily={fontFamily}
        fontSize={fontSize}
        fill={color}
        align={align}
        rotation={layer.rotation}
        opacity={layer.opacity}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = txtRef.current
          if (!node) return
          const scaleX = node.scaleX()
          const scaleY = node.scaleY()
          node.scaleX(1)
          node.scaleY(1)
          onChange({
            x: node.x(),
            y: node.y(),
            w: Math.max(20, layer.w * scaleX),
            h: Math.max(20, layer.h * scaleY),
            rotation: node.rotation(),
          })
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          keepRatio={false}
          borderStroke="#7c3aed"
          anchorStroke="#7c3aed"
          anchorFill="#ffffff"
          anchorSize={8}
          ignoreStroke={true}
        />
      )}
    </>
  )
}

// ============ Layer 渲染分发 ============
function LayerView({
  layer,
  isSelected,
  onSelect,
  onChange,
}: {
  layer: LayerType
  isSelected: boolean
  onSelect: () => void
  onChange: (partial: Partial<LayerType>) => void
}) {
  if (layer.type === 'image') {
    return (
      <ImageLayerView
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        onChange={onChange as (p: Partial<ImageLayer>) => void}
      />
    )
  }
  if (layer.type === 'bubble') {
    return (
      <BubbleLayerView
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        onChange={onChange as (p: Partial<BubbleLayer>) => void}
      />
    )
  }
  return (
    <TextLayerView
      layer={layer}
      isSelected={isSelected}
      onSelect={onSelect}
      onChange={onChange as (p: Partial<TextLayer>) => void}
    />
  )
}

// ============ 工具栏 ============
function Toolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onExport,
  activeLayout,
  onLayoutChange,
}: {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onExport: () => void
  activeLayout: LayoutType
  onLayoutChange: (l: LayoutType) => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-2">
      <LayoutIcon className="h-4 w-4 text-brand-600" />
      <span className="text-xs font-medium text-ink-900">排版模式</span>

      <div className="mx-3 h-5 w-px bg-ink-200" />

      {/* 模板切换 */}
      <div className="flex items-center gap-1">
        {(Object.keys(LAYOUT_PRESETS) as LayoutType[]).map((k) => (
          <button
            key={k}
            onClick={() => onLayoutChange(k)}
            title={LAYOUT_PRESETS[k].desc}
            className={cn(
              'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all',
              activeLayout === k
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-ink-200 text-ink-600 hover:border-ink-300'
            )}
          >
            {LAYOUT_PRESETS[k].label}
          </button>
        ))}
      </div>

      <div className="mx-3 h-5 w-px bg-ink-200" />

      {/* 缩放 */}
      <button onClick={onZoomOut} className="btn-ghost !px-2 !py-1" title="缩小">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-center text-[11px] tabular-nums text-ink-600">
        {Math.round(scale * 100)}%
      </span>
      <button onClick={onZoomIn} className="btn-ghost !px-2 !py-1" title="放大">
        <Plus className="h-3.5 w-3.5" />
      </button>

      <div className="ml-auto">
        <button onClick={onExport} className="btn-primary !py-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> 导出 PNG
        </button>
      </div>
    </div>
  )
}

// ============ 右侧图层面板 ============
function LayerPanel() {
  const layout = useLayoutStore()
  const page = layout.activePage()
  if (!page) return null

  const layerIcon = (t: LayerType['type']) => {
    if (t === 'image') return <ImageIcon className="h-3 w-3" />
    if (t === 'bubble') return <MessageCircle className="h-3 w-3" />
    return <TypeIcon className="h-3 w-3" />
  }
  const layerName = (l: LayerType) => {
    if (l.type === 'image') return `分镜${l.props.sceneId ? `#${l.props.sceneId}` : '图'}`
    if (l.type === 'bubble') return `气泡·${l.props.text.slice(0, 6) || '空'}`
    return `文字·${l.props.text.slice(0, 6) || '空'}`
  }

  // 反向显示（顶层在上）
  const layersTopFirst = [...page.layers].reverse()

  return (
    <div className="flex w-60 shrink-0 flex-col border-l border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-ink-500" />
          <span className="text-xs font-semibold text-ink-900">图层</span>
          <span className="ml-auto text-[10px] text-ink-400">{page.layers.length} 项</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {layersTopFirst.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-ink-400">暂无图层</p>
        ) : (
          <div className="space-y-0.5">
            {layersTopFirst.map((l) => {
              const isSelected = l.id === layout.selectedLayerId
              return (
                <div
                  key={l.id}
                  onClick={() => layout.selectLayer(l.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                    isSelected ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50'
                  )}
                >
                  <span className="text-ink-500">{layerIcon(l.type)}</span>
                  <span className="flex-1 truncate">{layerName(l)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      layout.updateLayer(l.id, { visible: !l.visible })
                    }}
                    className="text-ink-400 hover:text-ink-600"
                  >
                    {l.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 层操作按钮 */}
      <div className="flex border-t border-ink-200">
        <button
          onClick={() => {
            const id = layout.selectedLayerId
            if (id) layout.moveLayer(id, 'up')
          }}
          className="flex-1 py-1.5 text-[11px] text-ink-600 hover:bg-ink-50"
        >
          <ChevronUp className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            const id = layout.selectedLayerId
            if (id) layout.moveLayer(id, 'down')
          }}
          className="flex-1 border-l border-ink-200 py-1.5 text-[11px] text-ink-600 hover:bg-ink-50"
        >
          <ChevronDown className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            const id = layout.selectedLayerId
            if (id) layout.removeLayer(id)
          }}
          className="flex-1 border-l border-ink-200 py-1.5 text-[11px] text-red-500 hover:bg-red-50"
        >
          <Trash2 className="mx-auto h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============ 属性面板 ============
function PropertyPanel() {
  const layout = useLayoutStore()
  const layer = layout.selectedLayer()

  if (!layer) {
    return (
      <div className="border-t border-ink-200 bg-white p-3 text-[11px] text-ink-400">
        选中图层后可编辑属性
      </div>
    )
  }

  const update = (partial: Partial<LayerType>) =>
    layout.updateLayer(layer.id, partial as Partial<LayerType> | ((l: LayerType) => LayerType))
  const updateProps = (propsPartial: Record<string, unknown>) => {
    layout.updateLayer(layer.id, (l) => {
      const cloned = { ...l, props: { ...l.props, ...propsPartial } } as LayerType
      return cloned
    })
  }

  return (
    <div className="border-t border-ink-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          {layer.type === 'image' ? '图像' : layer.type === 'bubble' ? '气泡' : '文字'}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        {/* 通用：位置尺寸 */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="block">
              <span className="text-[10px] text-ink-500">{k.toUpperCase()}</span>
              <input
                type="number"
                value={Math.round(layer[k])}
                onChange={(e) => update({ [k]: Number(e.target.value) } as Partial<LayerType>)}
                className="input !py-1 !px-1.5 text-[11px]"
              />
            </label>
          ))}
        </div>

        {/* 气泡：文本 + 字号 */}
        {layer.type === 'bubble' && (
          <>
            <label className="block">
              <span className="text-[10px] text-ink-500">对白</span>
              <textarea
                value={layer.props.text}
                onChange={(e) => updateProps({ text: e.target.value })}
                rows={2}
                className="input resize-none text-[11px]"
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="text-[10px] text-ink-500">字号</span>
                <input
                  type="number"
                  value={layer.props.fontSize}
                  onChange={(e) => updateProps({ fontSize: Number(e.target.value) })}
                  className="input !py-1 !px-1.5 text-[11px]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-ink-500">形状</span>
                <select
                  value={layer.props.shape}
                  onChange={(e) => updateProps({ shape: e.target.value })}
                  className="input !py-1 !px-1.5 text-[11px]"
                >
                  <option value="ellipse">椭圆</option>
                  <option value="rect">矩形</option>
                  <option value="cloud">云形</option>
                  <option value="shout">爆炸</option>
                </select>
              </label>
            </div>
          </>
        )}

        {/* 图像：补 src */}
        {layer.type === 'image' && (
          <label className="block">
            <span className="text-[10px] text-ink-500">图片 URL</span>
            <input
              type="text"
              value={layer.props.src}
              onChange={(e) => updateProps({ src: e.target.value })}
              placeholder="粘贴图片 URL 或从「图像模式」生成后回填"
              className="input !py-1 !px-1.5 text-[11px]"
            />
          </label>
        )}

        {/* 文字 */}
        {layer.type === 'text' && (
          <>
            <label className="block">
              <span className="text-[10px] text-ink-500">文本</span>
              <textarea
                value={layer.props.text}
                onChange={(e) => updateProps({ text: e.target.value })}
                rows={2}
                className="input resize-none text-[11px]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-ink-500">字号</span>
              <input
                type="number"
                value={layer.props.fontSize}
                onChange={(e) => updateProps({ fontSize: Number(e.target.value) })}
                className="input !py-1 !px-1.5 text-[11px]"
              />
            </label>
          </>
        )}

        {/* 透明度 */}
        <label className="block">
          <span className="text-[10px] text-ink-500">透明度 {Math.round(layer.opacity * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={layer.opacity * 100}
            onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
            className="w-full accent-brand-600"
          />
        </label>
      </div>
    </div>
  )
}

// ============ 添加图层工具条 ============
function AddLayerBar() {
  const layout = useLayoutStore()
  const page = layout.activePage()
  if (!page) return null

  const addBubble = () => {
    const b = makeBubbleLayer({
      text: '新对白',
      x: page.width / 2 - 160,
      y: page.height / 2 - 40,
    })
    layout.addLayer(b)
  }
  const addText = () => {
    layout.addLayer({
      id: `txt_${Date.now()}`,
      type: 'text',
      x: page.width / 2 - 100,
      y: page.height / 2 - 20,
      w: 200,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        text: '新文字',
        fontFamily: '思源黑体',
        fontSize: 24,
        color: '#1a1a2e',
        align: 'center',
        vertical: false,
      },
    })
  }
  const addImage = () => {
    layout.addLayer(
      makeImageLayer({
        x: page.width / 2 - 200,
        y: page.height / 2 - 100,
        w: 400,
        h: 200,
      })
    )
  }

  return (
    <div className="flex items-center gap-1 border-t border-ink-200 bg-white px-3 py-2">
      <span className="text-[10px] text-ink-500">添加</span>
      <button onClick={addImage} className="btn-ghost !px-2 !py-1 text-[11px]">
        <ImageIcon className="h-3 w-3" /> 图
      </button>
      <button onClick={addBubble} className="btn-ghost !px-2 !py-1 text-[11px]">
        <MessageCircle className="h-3 w-3" /> 气泡
      </button>
      <button onClick={addText} className="btn-ghost !px-2 !py-1 text-[11px]">
        <TypeIcon className="h-3 w-3" /> 文字
      </button>
    </div>
  )
}

// ============ 主组件 ============
export default function LayoutModeView() {
  const layout = useLayoutStore()
  const stageRef = useRef<Konva.Stage>(null)
  const [scale, setScale] = useState(0.4) // 默认 40% 缩放，适配屏幕

  const activePage = layout.activePage()

  // 进入排版模式时若没有页面，自动新建一页
  useEffect(() => {
    if (layout.pages.length === 0) {
      layout.addPage('strip3')
    }
  }, [layout.pages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.1))
  const zoomOut = () => setScale((s) => Math.max(0.1, s - 0.1))

  const handleLayoutChange = (l: LayoutType) => {
    if (!activePage) return
    layout.updatePage(activePage.id, { layout: l, ...LAYOUT_PRESETS[l] })
  }

  const handleExport = () => {
    if (!stageRef.current || !activePage) return
    // 先清空选中，避免 Transformer 框入导出图
    layout.selectLayer(null)
    // 等 React 重渲染后再导出
    requestAnimationFrame(() => {
      if (!stageRef.current) return
      const ok = exportStagePNG(
        stageRef.current,
        `manhua_p${activePage.seq}.png`,
        2 / scale // 把当前 scale 换算回 2x 像素密度
      )
      if (!ok) alert('导出失败，请检查图片是否跨域加载')
    })
  }

  // 空状态
  if (!activePage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        <button onClick={() => layout.addPage('strip3')} className="btn-primary">
          新建第一页
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        scale={scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onExport={handleExport}
        activeLayout={activePage.layout}
        onLayoutChange={handleLayoutChange}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 画布区 */}
        <div
          className="flex-1 overflow-auto bg-ink-50 p-6"
          onMouseDown={(e) => {
            // 点击空白处取消选中
            if (e.target === e.currentTarget) layout.selectLayer(null)
          }}
        >
          <div className="mx-auto" style={{ width: activePage.width * scale }}>
            <div
              className="relative bg-white shadow-lg"
              style={{
                width: activePage.width * scale,
                height: activePage.height * scale,
              }}
            >
              <Stage
                ref={stageRef}
                width={activePage.width * scale}
                height={activePage.height * scale}
                scaleX={scale}
                scaleY={scale}
                onMouseDown={(e) => {
                  const stage = e.target.getStage()
                  if (e.target === stage) layout.selectLayer(null)
                }}
              >
                <Layer>
                  {/* 背景 */}
                  <Rect
                    x={0}
                    y={0}
                    width={activePage.width}
                    height={activePage.height}
                    fill={activePage.background}
                  />

                  {/* 渲染所有 layer */}
                  {activePage.layers.map((l) => (
                    <LayerView
                      key={l.id}
                      layer={l}
                      isSelected={l.id === layout.selectedLayerId}
                      onSelect={() => layout.selectLayer(l.id)}
                      onChange={(partial) => layout.updateLayer(l.id, partial)}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="flex w-60 shrink-0 flex-col border-l border-ink-200">
          <LayerPanel />
          <AddLayerBar />
          <PropertyPanel />
        </div>
      </div>

      {/* 底部页码条 */}
      <PageStrip />
    </div>
  )
}

// ============ 底部多页条 ============
function PageStrip() {
  const layout = useLayoutStore()
  const { pages, activePageId } = layout
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  if (pages.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-t border-ink-200 bg-white px-4 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">页面</span>
      <span className="text-[10px] text-ink-400">拖拽重排 · 悬停查看操作</span>

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {pages.map((p) => {
          const isActive = p.id === activePageId
          const isDragOver = overId === p.id && dragId && dragId !== p.id
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== p.id) setOverId(p.id)
              }}
              onDragLeave={() => setOverId(null)}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== p.id) layout.movePageTo(dragId, p.id)
                setDragId(null)
                setOverId(null)
              }}
              onClick={() => layout.setActivePage(p.id)}
              className={cn(
                'group relative flex h-14 w-11 shrink-0 cursor-pointer flex-col items-center justify-center rounded border transition-all',
                isActive
                  ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                dragId === p.id && 'opacity-40',
                isDragOver && 'border-brand-400 border-dashed bg-brand-50'
              )}
              title={`第 ${p.seq} 页 · ${LAYOUT_PRESETS[p.layout].label} · ${p.width}×${p.height}`}
            >
              <span className="text-xs font-semibold">{p.seq}</span>
              <span className="text-[8px] opacity-60">
                {LAYOUT_PRESETS[p.layout].label.slice(0, 2)}
              </span>
              <span className="text-[8px] opacity-40">{p.layers.length} 层</span>

              {/* 悬停显示操作按钮 */}
              {isActive && (
                <div className="absolute -top-2 right-0 flex translate-y-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      layout.duplicatePage(p.id)
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded bg-white text-ink-500 shadow ring-1 ring-ink-200 hover:text-brand-600"
                    title="复制页"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (pages.length <= 1) return
                      if (confirm(`确认删除第 ${p.seq} 页？`)) layout.removePage(p.id)
                    }}
                    disabled={pages.length <= 1}
                    className="flex h-4 w-4 items-center justify-center rounded bg-white text-red-500 shadow ring-1 ring-ink-200 hover:bg-red-50 disabled:opacity-30"
                    title={pages.length <= 1 ? '至少保留 1 页' : '删除页'}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={() => layout.addPage(layout.activePage()?.layout ?? 'strip3')}
          className="flex h-14 w-11 items-center justify-center rounded border border-dashed border-ink-300 text-ink-400 hover:border-brand-300 hover:text-brand-500"
          title="新建页"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 左右移动当前页 */}
      <div className="ml-2 flex flex-col gap-0.5">
        <button
          onClick={() => activePageId && layout.movePage(activePageId, 'up')}
          disabled={!activePageId}
          className="btn-ghost !px-1 !py-0.5 disabled:opacity-30"
          title="当前页右移"
        >
          <ChevronUp className="h-3 w-3 rotate-90" />
        </button>
        <button
          onClick={() => activePageId && layout.movePage(activePageId, 'down')}
          disabled={!activePageId}
          className="btn-ghost !px-1 !py-0.5 disabled:opacity-30"
          title="当前页左移"
        >
          <ChevronDown className="h-3 w-3 rotate-90" />
        </button>
      </div>

      <div className="ml-auto text-[10px] text-ink-400">
        {activePageId && (
          <>
            第 {pages.find((p) => p.id === activePageId)?.seq ?? 0}/{pages.length} 页 ·{' '}
            {(() => {
              const p = pages.find((x) => x.id === activePageId)
              return p ? `${p.width}×${p.height}` : ''
            })()}
          </>
        )}
      </div>
    </div>
  )
}
