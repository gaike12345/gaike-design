// 统一创作画布容器 - 图像+视频合并的节点式工作流核心
//
// 功能：平移、缩放、网格背景、节点渲染、SVG 连线、拖拽连线、工具栏、节点添加面板
// 对标 LibTV 画布：单一画布承载 text->image->video->audio 全链路
// 复用图像画布的交互逻辑，统一配色（violet 主色，兼容图像 cyan 与视频 amber）

import { useRef, useEffect, useCallback, useState, type ReactNode, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useUnifiedCanvasStore, UNODE_PORTS, UNODE_SIZE, GRID_SIZE, snapToGrid,
  type UCanvasNode, type UnifiedNodeType, type UnifiedPortType, type UPort,
} from '../../store/useUnifiedCanvasStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useQuotaStore } from '../../store/useQuotaStore'
import { formatTokensCompact } from '../../services/cost'
import {
  UBaseNode, UNODE_META, renderUnifiedNodeContent, ImageSettingsPanel, VideoSettingsPanel,
  HEADER_HEIGHT, PORT_GAP, PORT_Y_OFFSET,
} from './UnifiedNodes'
import { Plus, Trash2, Maximize2, Wand2, Move, Wrench, Library, Users, History, Keyboard, BookOpen, Save, Shuffle, Link2Off, Grid3x3, ZoomIn, ZoomOut, Share2, AlignHorizontalJustifyCenter, CircleHelp, Sparkles, Eye, EyeOff, X, RotateCcw, Minus, Type, FileText, Image as ImageIcon, Film, Music, Ban, SlidersHorizontal, Layers, Upload, Clock, RefreshCw, Box, GalleryHorizontalEnd, ChevronRight, ChevronDown, Home, FolderOpen } from 'lucide-react'

import { cn } from '../../lib/utils'
import logo from '../../assets/logo.png'

// 端口在画布坐标系中的位置
// 与 UnifiedNodes.UPortHandle 的实际渲染位置完全一致
// UBaseNode 有 1px border，node.position 是边框外侧左上角
// UPortHandle 使用 absolute positioning + translateX(-50%) 居中
// HOT = 32，UPortHandle 内的 HOT div 使用 -translate-x-1/2 居中
// translate 后 HOT div 中心 = UPortHandle 左边缘
// 因此端口中心 = NODE_BORDER + x (x 为 UPortHandle 的 left 值)
// 输入端口 x = -NODE_BORDER → center = node.position.x + 1 + (-1) = node.position.x
// 输出端口 x = width - NODE_BORDER → center = node.position.x + 1 + (w - 1) = node.position.x + w
const NODE_BORDER = 1

// 端口 DOM 真实坐标（优先）：从 data-port-id 热区元素直接读屏幕中心，再反算画布坐标
// 让连线端点与可见 + 号锚点视觉严格重合，不再依赖 size.height / NODE_BORDER 等常量猜测
function getNodeRealHeight(nodeId: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const el = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
  if (!el) return fallback
  return el.getBoundingClientRect().height || el.offsetHeight || fallback
}

// 贝塞尔曲线路径 —— 经过优化的稳定版：
// 1. 水平控制点距离做 clamp（MIN~MAX），避免距离过短时变直线、过长时过度弯曲
// 2. 右连左（target 在 source 左侧）时水平控制点方向自动反向，保证平滑不自交
// 3. 源/目标不在同一水平线时，引入轻微垂直弯折（vBend），避免"硬拐"L 形
function bezierPath(sx: number, sy: number, tx: number, ty: number) {
  const MIN_CTRL = 40
  const MAX_CTRL = 240
  const RATIO = 0.4
  const MIN_BEND = 8
  const MAX_BEND = 56

  const absDx = Math.abs(tx - sx)
  const dy = ty - sy
  const rightFacing = tx >= sx // 源→目标：总体方向向右（true）还是向左（false）

  const hCtrl = Math.min(MAX_CTRL, Math.max(MIN_CTRL, absDx * RATIO))
  const vBend = Math.min(MAX_BEND, Math.max(MIN_BEND, Math.abs(dy) * 0.28 + MIN_BEND))

  const signX = rightFacing ? 1 : -1
  const signY = dy >= 0 ? 1 : -1

  const c1x = sx + hCtrl * signX
  const c1y = sy + vBend * signY
  const c2x = tx - hCtrl * signX
  const c2y = ty - vBend * signY

  return 'M ' + sx + ' ' + sy + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + tx + ' ' + ty
}

export default function UnifiedCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const {
    nodes, connections, viewport, drag, selectedNodeId,
    panBy, zoomTo,
    selectNode, moveNode, removeNode, removeConnection,
    startDrag, endDrag,
    addNode, addConnection,
  } = useUnifiedCanvasStore()
  const { activeProjectId, createProject, deleteProject } = useProjectStore()
  const remainingTokens = useQuotaStore((s) => s.quota.remainingTokens)
  const refreshQuota = useQuotaStore((s) => s.refreshQuota)
  const quotaLoading = useQuotaStore((s) => s.loading)

  // refs 避免事件监听器依赖变化导致重建
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections
  // 拖拽连线用 ref 直接操作 DOM，绕过 React 渲染周期
  const dragCursorRef = useRef<{ x: number; y: number } | null>(null)
  const dragPathRef = useRef<SVGPathElement | null>(null)
  const dragFromPortRef = useRef(drag.fromPort)
  dragFromPortRef.current = drag.fromPort
  // 拖拽激活状态的 ref（关键：绕过 React 18 自动批处理导致的闭包过时问题）
  const dragActiveRef = useRef(drag.active)
  dragActiveRef.current = drag.active
  // 坐标转换函数的 ref，避免事件监听器闭包中使用过时的视口值
  const toCanvasRef = useRef<(cx: number, cy: number) => { x: number; y: number }>(() => ({ x: 0, y: 0 }))
  const toScreenRef = useRef<(cx: number, cy: number) => { x: number; y: number }>(() => ({ x: 0, y: 0 }))

  // 端口坐标计算 —— 必须在组件内，闭包访问 toCanvasRef / containerRef（稳定 ref 对象，.current 始终最新）
  // 模块级函数无法访问组件作用域变量，会导致 ReferenceError 让画布崩溃
  const getPortPos = (node: UCanvasNode, portId: string, isOutput: boolean) => {
    // 1) 优先从 DOM 热区真实位置取（让连线端点 与 可见 + 号 精准重合，生成前后高度变了也不偏移）
    //    防御：toCanvasRef 在模块初始化阶段 / 首次渲染前可能是占位函数（返回{0,0}），必须校验容器再读
    const toCanvas = toCanvasRef.current
    if (toCanvas && typeof document !== 'undefined' && containerRef.current) {
      const nodeEl = document.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)
      if (nodeEl) {
        const portEl = nodeEl.querySelector<HTMLElement>(`[data-port-id="${portId}"][data-port-is-output="${String(isOutput)}"]`)
        if (portEl) {
          const r = portEl.getBoundingClientRect()
          const cr = containerRef.current.getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && cr.width > 0 && cr.height > 0) {
            return toCanvas((r.left + r.right) / 2, (r.top + r.bottom) / 2)
          }
        }
      }
    }
    // 2) 回退：常量计算（首次渲染 / DOM 未挂载 / 容器未就绪 时用）
    const ports = isOutput ? UNODE_PORTS[node.type].outputs : UNODE_PORTS[node.type].inputs
    let idx = ports.findIndex((p) => p.id === portId)
    if (idx < 0) idx = 0
    const w = UNODE_SIZE[node.type].width
    const fallbackH = UNODE_SIZE[node.type].height
    const h = getNodeRealHeight(node.id, fallbackH)
    return {
      x: isOutput ? node.position.x + w : node.position.x,
      y: node.position.y + NODE_BORDER + h / 2 + idx * PORT_GAP,
    }
  }

  const panningRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const dragNodeRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)
  // 记录端口拖拽过程中最后一次鼠标屏幕坐标，用于菜单定位
  const lastMousePos = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 })
  // 标记：刚在 mouseup 中设置了 portCreateMenu，跳过紧随其后的一次 document click 清空
  const suppressNextDocClickForMenu = useRef(false)
  // 左上角 logo 菜单
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const logoMenuRef = useRef<HTMLDivElement>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [hideConnections, setHideConnections] = useState(false)
  const [hideGrid, setHideGrid] = useState(false)

  // 画布初始化：从 localStorage 恢复状态
  useEffect(() => {
    const loaded = useUnifiedCanvasStore.getState().loadFromStorage()
    if (loaded) {
      // 如果有保存的状态，不显示默认工作流
    }
    // 画布进入时 拉一次用户余额（首帧显示）
    void refreshQuota({ force: false })
  }, [refreshQuota])
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [rightMenuOpen, setRightMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; canvasX: number; canvasY: number; kind: 'canvas' }
    | { x: number; y: number; kind: 'node'; nodeId: string }
    | null
  >(null)
  // 端口拖出空白松开后弹出的节点创建菜单
  const [portCreateMenu, setPortCreateMenu] = useState<
    | {
        x: number; y: number;                       // 屏幕坐标（相对画布容器）
        canvasX: number; canvasY: number;           // 画布坐标
        fromPort: NonNullable<typeof drag.fromPort>; // 拖拽来源端口
      }
    | null
  >(null)

  // logo 菜单：创建新项目
  const handleCreateProject = async () => {
    setLogoBusy(true)
    try {
      const id = await createProject('新项目 ' + new Date().toLocaleDateString('zh-CN'), 'script')
      setLogoMenuOpen(false)
      if (id) navigate('/workspace')
    } finally {
      setLogoBusy(false)
    }
  }
  // logo 菜单：删除当前项目
  const handleDeleteProject = async () => {
    if (!activeProjectId) { setLogoMenuOpen(false); return }
    setLogoBusy(true)
    try {
      await deleteProject(activeProjectId)
      setConfirmDelete(false)
      setLogoMenuOpen(false)
      navigate('/workspace')
    } finally {
      setLogoBusy(false)
    }
  }

  // 屏幕坐标 -> 画布坐标
  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      }
    },
    [viewport],
  )

  // 画布坐标 -> 屏幕坐标
  const toScreen = useCallback(
    (cx: number, cy: number) => {
      return {
        x: cx * viewport.zoom + viewport.x,
        y: cy * viewport.zoom + viewport.y,
      }
    },
    [viewport],
  )
  // 更新 ref，确保事件监听器始终使用最新的视口变换
  toCanvasRef.current = toCanvas
  toScreenRef.current = toScreen

  // 画布页面挂载时：给 body 加深色主题，卸载时恢复
  useEffect(() => {
    document.body.classList.add('canvas-dark')
    return () => {
      document.body.classList.remove('canvas-dark')
    }
  }, [])

  // ESC 关闭右键菜单 + 端口创建菜单；Del/Backspace 删除选中节点
  useEffect(() => {
    const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
    const isEditingInput = () => {
      const a = document.activeElement as HTMLElement | null
      if (!a) return false
      if (INPUT_TAGS.has(a.tagName)) return true
      return a.isContentEditable === true
    }

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setPortCreateMenu(null)
        setLogoMenuOpen(false)
        setConfirmDelete(false)
        return
      }
      // Delete 或 Backspace 删除选中节点（排除输入框/文本域中编辑文本的场景）
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedNodeId) return
        if (isEditingInput()) return
        e.preventDefault()
        removeNode(selectedNodeId)
        selectNode(null)
      }
    }
    const onDocClick = (e: globalThis.MouseEvent) => {
      // mouseup 中刚设置了 portCreateMenu → 跳过紧随其后的这次 document click，避免菜单被立即清空
      if (suppressNextDocClickForMenu.current) {
        suppressNextDocClickForMenu.current = false
        return
      }
      // 点击 logo 菜单外 → 关闭
      if (logoMenuOpen && logoMenuRef.current && !logoMenuRef.current.contains(e.target as Node)) {
        setLogoMenuOpen(false)
      }
      setContextMenu(null)
      setPortCreateMenu(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onDocClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onDocClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId])

// 全局 mousemove/up（平移 / 节点拖拽 / 端口连线）
  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      // 持续记录最后一次鼠标屏幕坐标，供松开时定位菜单
      lastMousePos.current = { clientX: e.clientX, clientY: e.clientY }
      if (panningRef.current) {
        const dx = e.clientX - panningRef.current.lastX
        const dy = e.clientY - panningRef.current.lastY
        panningRef.current.lastX = e.clientX
        panningRef.current.lastY = e.clientY
        panBy(dx, dy)
        return
      }
      if (dragNodeRef.current) {
        const c = toCanvasRef.current(e.clientX, e.clientY)
        let nx = c.x - dragNodeRef.current.offsetX
        let ny = c.y - dragNodeRef.current.offsetY
        if (snapEnabled) {
          nx = snapToGrid(nx, GRID_SIZE)
          ny = snapToGrid(ny, GRID_SIZE)
        }
        moveNode(dragNodeRef.current.nodeId, nx, ny)
        // 直接 DOM 更新所有相关连线，使用最新位置避免 React 批处理导致高频拖拽时连线滞后
        const draggedId = dragNodeRef.current.nodeId
        connectionsRef.current.forEach((c) => {
          if (c.source.nodeId !== draggedId && c.target.nodeId !== draggedId) return
          const sn = nodesRef.current.find((n) => n.id === c.source.nodeId)
          const tn = nodesRef.current.find((n) => n.id === c.target.nodeId)
          if (!sn || !tn) return
          // 用最新位置替换被拖拽节点的旧位置
          const snAdj = sn.id === draggedId ? { ...sn, position: { x: nx, y: ny } } : sn
          const tnAdj = tn.id === draggedId ? { ...tn, position: { x: nx, y: ny } } : tn
          const sp = getPortPos(snAdj, c.source.portId, true)
          const tp = getPortPos(tnAdj, c.target.portId, false)
          const ss = toScreenRef.current(sp.x, sp.y)
          const ts = toScreenRef.current(tp.x, tp.y)
          const newPath = bezierPath(ss.x, ss.y, ts.x, ts.y)
          const g = connElsRef.current.get(c.id)
          if (g) {
            const basePath = g.children[0] as SVGPathElement
            if (basePath && basePath.getAttribute('d') !== newPath) {
              basePath.setAttribute('d', newPath)
              // 只更新 basePath.d，beams 由 RAF 统一重采样（read latest basePath.d 即可）
              // 不在此处写 beams —— 避免与 RAF 竞态导致闪烁
            }
          }
        })
        return
      }
      if (dragActiveRef.current && dragFromPortRef.current) {
        // 直接操作 DOM 更新连线，完全绕过 React 渲染周期
        const canvasPt = toCanvasRef.current(e.clientX, e.clientY)
        dragCursorRef.current = canvasPt
        const pathEl = dragPathRef.current
        const fp = dragFromPortRef.current
        if (pathEl && fp) {
          const srcNode = nodesRef.current.find((n) => n.id === fp.nodeId)
          if (srcNode) {
            const sp = getPortPos(srcNode, fp.portId, fp.isOutput)
            const ss = toScreenRef.current(sp.x, sp.y)
            const ts = toScreenRef.current(canvasPt.x, canvasPt.y)
            pathEl.setAttribute('d', bezierPath(ss.x, ss.y, ts.x, ts.y))
          }
        }
      }
    }
    const onUp = () => {
      panningRef.current = null
      dragNodeRef.current = null
      if (dragActiveRef.current && dragFromPortRef.current) {
        // 先移除 DOM 中的临时连线，避免与 React 渲染冲突
        if (dragPathRef.current) {
          dragPathRef.current.remove()
          dragPathRef.current = null
        }
        const { clientX, clientY } = lastMousePos.current
        const fromPortCopy = { ...dragFromPortRef.current }

        // ===== 方案A：优先尝试直接命中目标端口（elementFromPoint 查找带 data-port-id 的元素） =====
        let connected = false
        try {
          const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
          if (el) {
            const portEl = el.closest('[data-port-id]') as HTMLElement | null
            if (portEl) {
              const toPortId = portEl.getAttribute('data-port-id')
              const toType = portEl.getAttribute('data-port-type') as UnifiedPortType | null
              const toIsOutputRaw = portEl.getAttribute('data-port-is-output')
              const toIsOutput = toIsOutputRaw === 'true'
              const nodeEl = portEl.closest('[data-node-id]') as HTMLElement | null
              const toNodeId = nodeEl?.getAttribute('data-node-id') ?? null
              if (toPortId && toType && toNodeId && toNodeId !== fromPortCopy.nodeId) {
                endDrag({ nodeId: toNodeId, portId: toPortId, type: toType, isOutput: toIsOutput })
                connected = true
              }
            }
            // ===== 方案A+：鼠标在节点区域内 → 自动连接到该节点的输入端口 =====
            if (!connected) {
              const nodeEl2 = el.closest('[data-node-id]') as HTMLElement | null
              if (nodeEl2) {
                const toNodeId = nodeEl2.getAttribute('data-node-id')
                if (toNodeId && toNodeId !== fromPortCopy.nodeId) {
                  const targetNode = nodesRef.current.find((n) => n.id === toNodeId)
                  if (targetNode) {
                    const inputPort = UNODE_PORTS[targetNode.type].inputs[0]
                    if (inputPort && !fromPortCopy.isOutput) {
                      // 源端口是输入 → 目标必须是输出
                      const outputPort = UNODE_PORTS[targetNode.type].outputs[0]
                      if (outputPort) {
                        endDrag({ nodeId: toNodeId, portId: outputPort.id, type: outputPort.type, isOutput: true })
                        connected = true
                      }
                    } else if (inputPort && fromPortCopy.isOutput) {
                      // 源端口是输出 → 目标必须是输入
                      endDrag({ nodeId: toNodeId, portId: inputPort.id, type: inputPort.type, isOutput: false })
                      connected = true
                    }
                  }
                }
              }
            }
          }
        } catch { /* elementFromPoint 异常时忽略，走下面的 fallback */ }

        // ===== 方案B：距离最近端口 Fallback（elementFromPoint 未命中时，找画布坐标距离≤THRESHOLD的最近端口） =====
        if (!connected) {
          try {
            const THRESHOLD = 80 // 画布坐标系下的像素阈值
            const cursorCanvas = toCanvasRef.current(clientX, clientY)
            let best: {
              nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean; dist: number
            } | null = null
            for (const n of nodesRef.current) {
              const portGroups: Array<{ list: typeof UNODE_PORTS[UnifiedNodeType]['inputs']; isOutput: boolean }> = [
                { list: UNODE_PORTS[n.type].inputs, isOutput: false },
                { list: UNODE_PORTS[n.type].outputs, isOutput: true },
              ]
              for (const g of portGroups) {
                if (g.list.length === 0) continue
                g.list.forEach((p, i) => {
                  // 端口位置与 getPortPos 保持一致：基于真实 DOM 高度垂直居中
                  const fallbackH = UNODE_SIZE[n.type].height
                  const w = UNODE_SIZE[n.type].width
                  const h = getNodeRealHeight(n.id, fallbackH)
                  const pos = {
                    x: g.isOutput ? n.position.x + w : n.position.x,
                    y: n.position.y + NODE_BORDER + h / 2 + i * PORT_GAP,
                  }
                  const dx = pos.x - cursorCanvas.x
                  const dy = pos.y - cursorCanvas.y
                  const dist = Math.sqrt(dx * dx + dy * dy)
                  if (dist <= THRESHOLD && (!best || dist < best.dist)) {
                    // 禁止自连
                    if (n.id === fromPortCopy.nodeId) return
                    // 方向必须与发起端相反
                    if (fromPortCopy.isOutput === g.isOutput) return
                    best = { nodeId: n.id, portId: p.id, type: p.type, isOutput: g.isOutput, dist }
                  }
                })
              }
            }
            if (best) {
              const targetPort = best as { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean }
              endDrag({ nodeId: targetPort.nodeId, portId: targetPort.portId, type: targetPort.type, isOutput: targetPort.isOutput })
              connected = true
            }
          } catch { /* fallback 异常时走菜单分支 */ }
        }

        // ===== 方案C：仍未命中端口 → 显示节点创建菜单（空白松开） =====
        if (!connected) {
          const rect = containerRef.current?.getBoundingClientRect()
          const canvasPos = toCanvasRef.current(clientX, clientY)
          const menuX = rect ? clientX - rect.left : clientX
          const menuY = rect ? clientY - rect.top : clientY
          // 先 endDrag(null) 清除连线预览，再显示菜单
          endDrag(null)
          // 标记要跳过紧随其后的一次 document click，避免菜单被立即清空
          suppressNextDocClickForMenu.current = true
          setPortCreateMenu({
            x: menuX,
            y: menuY,
            canvasX: canvasPos.x,
            canvasY: canvasPos.y,
            fromPort: fromPortCopy,
          })
        }
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // 使用 refs 避免每次 nodes/connections 变化时重建事件监听器
  }, [panBy, moveNode, endDrag, snapEnabled])

  // 同步 SVG 连线 —— DOM-only 模式：创建/更新/移除连线 DOM 元素
  // 完全绕过 React 渲染，直接操作 DOM 以获得最佳性能
  const containerRef2 = useRef<HTMLDivElement>(null)
  containerRef2.current = containerRef.current
  const connElsRef = useRef<Map<string, SVGGElement>>(new Map())

  // ========== Effect 1：连线 DOM 同步（创建/更新/移除，含 basePath.d 和 beam display） ==========
  useEffect(() => {
    const container = containerRef2.current
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return

    // 彻底清空 SVG 中所有 <g data-conn-id> 元素 + 临时拖拽路径
    // 只保留 <defs>，每次完全重建确保无残留
    svg.querySelectorAll('g[data-conn-id], path[data-temp]').forEach((el) => el.remove())
    connElsRef.current.clear()

    connections.forEach((c) => {
      const sn = nodes.find((n) => n.id === c.source.nodeId)
      const tn = nodes.find((n) => n.id === c.target.nodeId)
      if (!sn || !tn) return

      const sp = getPortPos(sn, c.source.portId, true)
      const tp = getPortPos(tn, c.target.portId, false)
      const ss = toScreenRef.current(sp.x, sp.y)
      const ts = toScreenRef.current(tp.x, tp.y)
      const newPath = bezierPath(ss.x, ss.y, ts.x, ts.y)

      const isActive = selectedNodeId && (c.source.nodeId === selectedNodeId || c.target.nodeId === selectedNodeId)

      // 每次完全新建，确保没有 filter/样式残留
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('data-conn-id', c.id)
      g.setAttribute('data-active', isActive ? '1' : '0')
      g.setAttribute('class', 'pointer-events-auto')

      const basePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      basePath.setAttribute('fill', 'none')
      basePath.setAttribute('stroke', 'url(#connGrad)')
      basePath.setAttribute('stroke-width', '1.4')
      basePath.setAttribute('d', newPath)
      g.appendChild(basePath)

      const beam1 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      beam1.setAttribute('fill', 'none')
      beam1.setAttribute('stroke-width', '3')
      beam1.setAttribute('stroke-linecap', 'round')
      beam1.setAttribute('class', 'conn-beam')
      beam1.setAttribute('stroke', 'url(#connFlowGradLTR)')
      beam1.style.display = isActive ? '' : 'none'
      g.appendChild(beam1)

      const beam2 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      beam2.setAttribute('fill', 'none')
      beam2.setAttribute('stroke-width', '3')
      beam2.setAttribute('stroke-linecap', 'round')
      beam2.setAttribute('class', 'conn-beam')
      beam2.setAttribute('stroke', 'url(#connFlowGradLTR)')
      beam2.style.display = isActive ? '' : 'none'
      g.appendChild(beam2)

      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      hitPath.setAttribute('fill', 'none')
      hitPath.setAttribute('stroke', 'transparent')
      hitPath.setAttribute('stroke-width', '12')
      hitPath.setAttribute('class', 'cursor-pointer')
      hitPath.setAttribute('d', newPath)
      hitPath.style.pointerEvents = 'stroke'
      hitPath.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        useUnifiedCanvasStore.getState().removeConnection(c.id)
      })
      g.appendChild(hitPath)

      svg.appendChild(g)
      connElsRef.current.set(c.id, g)
    })
  }, [nodes, connections, viewport, selectedNodeId])

  // ========== Effect 2：流光 RAF 动画（只启动一次，永不中断） ==========
  // 职责单一：每帧从最新 basePath.d 重采样 beam 路径
  // 所有 basePath.d 更新由 Effect 1 + onMove 完成，此处只读
  useEffect(() => {
    const MAX_STEPS = 12
    let globalOffset = 0
    const lenCache = new Map<string, { d: string; len: number }>()
    let rafId = 0

    // 记录每个 beam 上次设置的 d 字符串和方向，避免无意义 setAttribute
    const lastBeamInfo = new WeakMap<SVGPathElement, { d: string; stroke: string }>()

    const animate = () => {
      globalOffset += 1.6

      for (const g of connElsRef.current.values()) {
        // 只更新激活连线的 beam（有选中节点且连线关联）
        if (g.getAttribute('data-active') !== '1') continue

        const basePath = g.children[0] as SVGPathElement
        const beam1 = g.children[1] as SVGPathElement
        const beam2 = g.children[2] as SVGPathElement
        if (!basePath || !beam1 || !beam2) continue

        const gKey = g.getAttribute('data-conn-id') || ''
        const curD = basePath.getAttribute('d') || ''
        let totalLen = 0
        const cached = lenCache.get(gKey)
        if (cached && cached.d === curD) {
          totalLen = cached.len
        } else {
          totalLen = basePath.getTotalLength()
          lenCache.set(gKey, { d: curD, len: totalLen })
        }
        if (totalLen < 1) continue

        const beamLen = Math.max(24, Math.min(80, totalLen * 0.25))
        const steps = Math.min(MAX_STEPS, Math.max(4, Math.ceil(beamLen / 6)))

        // 安全地采样 beam 路径 —— 避免 wrap-around 时产生穿越直线
        const buildBeam = (start: number) => {
          const s = ((start % totalLen) + totalLen) % totalLen
          const beamEnd = s + beamLen
          const wraps = beamEnd > totalLen
          const actualBeamLen = wraps ? (totalLen - s) : beamLen
          if (actualBeamLen < 4) return { d: '', ltr: true }

          const st = Math.min(steps, Math.max(4, Math.ceil(actualBeamLen / 6)))
          let d = ''
          let sx = 0, ex = 0
          for (let i = 0; i <= st; i++) {
            const t = i / st
            const pos = s + actualBeamLen * t
            const p = basePath.getPointAtLength(pos)
            if (i === 0) { sx = p.x; d += 'M' + p.x.toFixed(1) + ',' + p.y.toFixed(1) }
            else { d += 'L' + p.x.toFixed(1) + ',' + p.y.toFixed(1) }
            if (i === st) ex = p.x
          }
          return { d, ltr: sx <= ex }
        }

        const pos1 = globalOffset % totalLen
        const pos2 = (globalOffset + totalLen / 2) % totalLen

        const r1 = buildBeam(pos1)
        const r2 = buildBeam(pos2)

        // beam1 — RAF 只负责构建路径和写入，不负责 display 切换
        // display 由 Effect 1 根据 isActive 统一管理
        if (r1.d) {
          const s1 = r1.ltr ? 'url(#connFlowGradLTR)' : 'url(#connFlowGradRTL)'
          const li1 = lastBeamInfo.get(beam1)
          if (!li1 || li1.d !== r1.d) beam1.setAttribute('d', r1.d)
          if (!li1 || li1.stroke !== s1) beam1.setAttribute('stroke', s1)
          lastBeamInfo.set(beam1, { d: r1.d, stroke: s1 })
        }

        // beam2
        if (r2.d) {
          const s2 = r2.ltr ? 'url(#connFlowGradLTR)' : 'url(#connFlowGradRTL)'
          const li2 = lastBeamInfo.get(beam2)
          if (!li2 || li2.d !== r2.d) beam2.setAttribute('d', r2.d)
          if (!li2 || li2.stroke !== s2) beam2.setAttribute('stroke', s2)
          lastBeamInfo.set(beam2, { d: r2.d, stroke: s2 })
        }
      }

      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(rafId)
  }, [])

  // 滚轮缩放（以鼠标位置为中心）
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const delta = -e.deltaY * 0.001
      zoomTo(viewport.zoom * (1 + delta), cx, cy)
    },
    [viewport.zoom, zoomTo],
  )

  // 画布空白点击：取消选中 + 开始平移
  // 注意：节点/端口自己的 onMouseDown 已经 stopPropagation，能冒泡到这里的都是画布背景/空白
  const onCanvasMouseDown = (e: MouseEvent) => {
    selectNode(null)
    panningRef.current = { lastX: e.clientX, lastY: e.clientY }
  }

  // 节点拖拽开始
  const onNodeDragStart = (e: MouseEvent, node: UCanvasNode) => {
    e.stopPropagation()
    selectNode(node.id)
    const c = toCanvasRef.current(e.clientX, e.clientY)
    dragNodeRef.current = {
      nodeId: node.id,
      offsetX: c.x - node.position.x,
      offsetY: c.y - node.position.y,
    }
  }

  // 端口拖拽开始
  const onPortStart = (e: MouseEvent, node: UCanvasNode, portId: string, type: UnifiedPortType, isOutput: boolean) => {
    e.stopPropagation()
    e.preventDefault()
    const pos = getPortPos(node, portId, isOutput)
    const fromPort = { nodeId: node.id, portId, type, isOutput }
    // 关键：先设置 ref，确保立即生效，不等待 React 异步
    dragActiveRef.current = true
    dragFromPortRef.current = fromPort
    dragCursorRef.current = { x: pos.x, y: pos.y }
    startDrag(fromPort)

    // 直接在 DOM 中创建临时连线，完全绕过 React 渲染，避免 removeChild 冲突
    const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null
    if (svgEl) {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      pathEl.setAttribute('fill', 'none')
      pathEl.setAttribute('stroke', 'url(#connGrad)')
      pathEl.setAttribute('stroke-width', '2')
      pathEl.setAttribute('stroke-dasharray', '4 4')
      pathEl.setAttribute('stroke-opacity', '0.7')
      pathEl.style.pointerEvents = 'none'
      const ss = toScreenRef.current(pos.x, pos.y)
      pathEl.setAttribute('d', bezierPath(ss.x, ss.y, ss.x, ss.y))
      svgEl.appendChild(pathEl)
      dragPathRef.current = pathEl
    }
  }

  // 端口释放 ——  所有连接逻辑统一在 window 级 onUp 中处理
  const onPortUp = (_e: MouseEvent) => {
    // 不再阻止冒泡，确保 window 级 mouseup 处理器能接收到事件并创建连接
  }

  return (
    <div className="canvas-dark relative h-full w-full overflow-hidden bg-black">
      {/* 左上角：Man TV logo + 下拉菜单（4 个选项） */}
      <div className="pointer-events-auto absolute top-4 left-4 z-30" ref={logoMenuRef}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLogoMenuOpen((v) => !v); setConfirmDelete(false) }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center gap-2 rounded-xl border border-[#262626] bg-[#141414]/90 px-2.5 py-1.5 font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur transition-colors hover:bg-[#1a1a1a] active:bg-[#1f1f1f]"
          aria-haspopup="menu"
          aria-expanded={logoMenuOpen}
        >
          <img src={logo} alt="Man TV logo" className="h-7 w-7" />
          <span className="text-[13px] tracking-tight">Man TV</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-neutral-400 transition-transform', logoMenuOpen && 'rotate-180')} />
        </button>

        {/* 下拉菜单 */}
        {logoMenuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-neutral-700/80 bg-[#141414]/97 shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-md py-1.5"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              onClick={() => { setLogoMenuOpen(false); navigate('/') }}
              className="group flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-100 hover:bg-neutral-800 transition-colors"
            >
              <span className="h-7 w-7 rounded-md bg-neutral-800 text-neutral-300 flex items-center justify-center group-hover:bg-violet-500/15 group-hover:text-violet-300 transition-colors">
                <Home className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">回到主页</span>
              <span className="text-[10px] font-mono text-neutral-600 group-hover:text-neutral-400">⌘H</span>
            </button>

            <button
              role="menuitem"
              onClick={() => { setLogoMenuOpen(false); navigate('/workspace') }}
              className="group flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-100 hover:bg-neutral-800 transition-colors"
            >
              <span className="h-7 w-7 rounded-md bg-neutral-800 text-neutral-300 flex items-center justify-center group-hover:bg-cyan-500/15 group-hover:text-cyan-300 transition-colors">
                <FolderOpen className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">全部项目</span>
              <span className="text-[10px] font-mono text-neutral-600 group-hover:text-neutral-400">⌘P</span>
            </button>

            <div className="my-1 mx-3 h-px bg-neutral-700/70" />

            <button
              role="menuitem"
              onClick={handleCreateProject}
              disabled={logoBusy}
              className={cn(
                'group flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                logoBusy ? 'opacity-60 cursor-not-allowed text-neutral-400' : 'text-neutral-100 hover:bg-neutral-800'
              )}
            >
              <span className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                logoBusy ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-800 text-neutral-300 group-hover:bg-emerald-500/15 group-hover:text-emerald-300'
              )}>
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">创建新项目</span>
              <span className="text-[10px] font-mono text-neutral-600 group-hover:text-neutral-400">⌘N</span>
            </button>

            <button
              role="menuitem"
              disabled={!activeProjectId || logoBusy}
              onClick={() => { setConfirmDelete(true) }}
              className={cn(
                'group flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                !activeProjectId || logoBusy
                  ? 'opacity-45 cursor-not-allowed text-neutral-500'
                  : 'text-red-300 hover:bg-red-900/30'
              )}
            >
              <span className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                !activeProjectId || logoBusy
                  ? 'bg-neutral-800 text-neutral-600'
                  : 'bg-red-900/30 text-red-300 group-hover:bg-red-500/20 group-hover:text-red-200'
              )}>
                <Trash2 className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">删除项目</span>
              <span className="text-[10px] font-mono text-neutral-600">⌫</span>
            </button>

            {!activeProjectId && (
              <div className="px-3 pb-1 pt-0.5 text-[10px] text-neutral-500 leading-snug">
                当前不在项目中，仅在工作区可删除
              </div>
            )}
          </div>
        )}

        {/* 删除项目确认弹窗 */}
        {confirmDelete && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 backdrop-blur-sm"
            onClick={() => !logoBusy && setConfirmDelete(false)}
          >
            <div
              className="w-[340px] rounded-xl border border-neutral-700 bg-[#141414] p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-lg bg-red-900/40 text-red-300 flex items-center justify-center">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-neutral-100 leading-none">确认删除项目？</div>
                  <div className="mt-1.5 text-[11px] text-neutral-400 leading-relaxed">
                    删除后无法恢复，项目内的所有分镜、图片、音视频资产都会被清除。
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  disabled={logoBusy}
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
                <button
                  disabled={logoBusy}
                  onClick={handleDeleteProject}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors shadow-lg shadow-red-500/20"
                >
                  {logoBusy ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右上角：用户头像 + 积分 */}
      <div className="pointer-events-auto absolute top-4 right-4 z-30 flex items-center gap-2.5">
        {/* 积分 */}
        <div className="flex items-center gap-1.5 rounded-full bg-[#141414]/90 border border-[#262626] px-3 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur">
          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[9px] font-black text-black shadow-inner">₵</span>
          <span
            className="text-[12px] font-semibold text-amber-300 tabular-nums"
            title={quotaLoading ? '积分读取中…' : `剩余积分 ${formatTokensCompact(remainingTokens)}`}
          >
            {quotaLoading ? '…' : formatTokensCompact(remainingTokens)}
          </span>
          <button
            onClick={() => navigate('/settings#quota')}
            className="ml-1 h-4 w-4 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 flex items-center justify-center transition-colors"
            title="前往充值中心"
          >
            <Plus className="h-2.5 w-2.5"/>
          </button>
        </div>
        {/* 用户头像 */}
        <button className="group relative h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-[2px] shadow-[0_4px_16px_rgba(139,92,246,0.35)] transition-transform hover:scale-[1.03]">
          <div className="h-full w-full rounded-full bg-[#0d0d0d] flex items-center justify-center text-[12px] font-bold text-white">
            漫
          </div>
          {/* 在线绿点 */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0d0d0d]"/>
        </button>
      </div>

      {/* 画布容器 */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        data-canvas-bg="1"
        onWheel={onWheel}
        onMouseDown={onCanvasMouseDown}
        onContextMenu={(e) => {
          // 节点右键自己已经 stopPropagation，到这里的都是画布空白
          e.preventDefault()
          e.stopPropagation()
          const pos = toCanvasRef.current(e.clientX, e.clientY)
          const rect = containerRef.current?.getBoundingClientRect()
          setContextMenu({
            x: e.clientX - (rect?.left ?? 0),
            y: e.clientY - (rect?.top ?? 0),
            canvasX: pos.x,
            canvasY: pos.y,
            kind: 'canvas',
          })
        }}
        style={hideGrid ? { backgroundColor: '#0a0a0a' } : {backgroundColor: '#0a0a0a',backgroundImage: 'radial-gradient(circle, #181818 1px, transparent 1px)',backgroundSize: (24 * viewport.zoom) + 'px ' + (24 * viewport.zoom) + 'px',backgroundPosition: viewport.x + 'px ' + viewport.y + 'px',}}
      >
        {/* SVG 连线层（屏幕坐标，不随节点层变换）—— 连线由 DOM 操作管理 */}
        <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            {/* 默认连线渐变 —— 灰白色底线 */}
            <linearGradient id="connGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a3a3a3" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#d4d4d4" stopOpacity="0.9"/>
            </linearGradient>
            {/* 光束渐变 —— 尾(0%)全透明 → 半透淡蓝 → 头(100%)饱和淡蓝 */}
            <linearGradient id="connFlowGradLTR" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"  stopColor="#60a5fa" stopOpacity="0"/>
              <stop offset="30%" stopColor="#60a5fa" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.55"/>
            </linearGradient>
            <linearGradient id="connFlowGradRTL" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%"  stopColor="#60a5fa" stopOpacity="0"/>
              <stop offset="30%" stopColor="#60a5fa" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.55"/>
            </linearGradient>
          </defs>
        </svg>

        {/* 节点层（画布坐标变换） */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: 'translate(' + viewport.x + 'px, ' + viewport.y + 'px) scale(' + viewport.zoom + ')',
          }}
        >
          {nodes.map((node) => {
            const meta = UNODE_META[node.type]
            const ports = UNODE_PORTS[node.type]
            const size = UNODE_SIZE[node.type]
            const isSelected = selectedNodeId === node.id
            const settingsPanel = isSelected && node.type === 'image' ? (
              <ImageSettingsPanel node={node} />
            ) : isSelected && node.type === 'video' ? (
              <VideoSettingsPanel node={node} />
            ) : null
            return (
              <UBaseNode
                key={node.id}
                node={node}
                selected={isSelected}
                meta={meta}
                ports={ports}
                size={size}
                onMouseDown={(e) => onNodeDragStart(e, node)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const rect = containerRef.current?.getBoundingClientRect()
                  setContextMenu({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), kind: 'node', nodeId: node.id })
                }}
                onPortStart={(e, portId, type, isOutput) => onPortStart(e, node, portId, type, isOutput)}
                onPortUp={(e) => onPortUp(e)}
                onDelete={() => useUnifiedCanvasStore.getState().removeNode(node.id)}
                settingsPanel={settingsPanel}
              >
                {renderUnifiedNodeContent(node)}
              </UBaseNode>
            )
          })}
        </div>
      </div>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddNodeAt={(type) => {
            if (contextMenu.kind !== 'canvas') return
            const { canvasX, canvasY } = contextMenu
            addNode(type, canvasX, canvasY, undefined, false)
            setContextMenu(null)
          }}
          onDuplicateNode={(nodeId) => {
            const st = useUnifiedCanvasStore.getState()
            const n = st.nodes.find((x) => x.id === nodeId)
            if (n) st.addNode(n.type, n.position.x + 30, n.position.y + 30, n.data)
            setContextMenu(null)
          }}
          onDeleteNode={(nodeId) => {
            useUnifiedCanvasStore.getState().removeNode(nodeId)
            setContextMenu(null)
          }}
        />
      )}

      {/* 端口拖出空白松开 → 节点创建菜单（图2） */}
      {portCreateMenu && (
        <PortCreateMenu
          menu={portCreateMenu}
          onClose={() => setPortCreateMenu(null)}
          onCreate={(newType) => {
            const { canvasX, canvasY, fromPort } = portCreateMenu
            // 1. 创建新节点（放在松开位置，适当偏移避免遮挡菜单）
            const newNodeId = addNode(newType, canvasX - 30, canvasY - 30, undefined, false)
            // 2. 从store拿到最新节点数据后建立连接
            const st = useUnifiedCanvasStore.getState()
            const newNode = st.nodes.find((n) => n.id === newNodeId)
            if (!newNode) { setPortCreateMenu(null); return }
            const newPorts = UNODE_PORTS[newType]
            // 找到新节点上与来源端口类型匹配的真实端口（非虚拟）
            let matchPortId: string | null = null
            if (fromPort.isOutput) {
              // 来源是输出口 → 找新节点的输入口，且 type 相等
              const p = newPorts.inputs.find((pp) => pp.type === fromPort.type)
              matchPortId = p?.id ?? null
            } else {
              // 来源是输入口 → 找新节点的输出口，且 type 相等
              const p = newPorts.outputs.find((pp) => pp.type === fromPort.type)
              matchPortId = p?.id ?? null
            }
            // 3. 若原端口是虚拟端口（__vin__ / __vout__），需换成原节点的真实端口
            const sourceNode = st.nodes.find((n) => n.id === fromPort.nodeId)
            let realFromPortId = fromPort.portId
            if (sourceNode) {
              const srcPorts = UNODE_PORTS[sourceNode.type]
              if (fromPort.isOutput) {
                // 取原节点第一个真实输出口
                const real = srcPorts.outputs[0]
                if (real) realFromPortId = real.id
              } else {
                // 取原节点第一个真实输入口
                const real = srcPorts.inputs[0]
                if (real) realFromPortId = real.id
              }
            }
            // 4. 建立连接（source=输出口, target=输入口）
            if (matchPortId && sourceNode) {
              const source = fromPort.isOutput
                ? { nodeId: fromPort.nodeId, portId: realFromPortId }
                : { nodeId: newNodeId, portId: matchPortId }
              const target = fromPort.isOutput
                ? { nodeId: newNodeId, portId: matchPortId }
                : { nodeId: fromPort.nodeId, portId: realFromPortId }
              // 类型兼容校验
              const srcPort = (fromPort.isOutput
                ? UNODE_PORTS[sourceNode.type].outputs.find(p => p.id === source.portId)
                : UNODE_PORTS[newType].outputs.find(p => p.id === source.portId)
              )
              const tgtPort = (fromPort.isOutput
                ? UNODE_PORTS[newType].inputs.find(p => p.id === target.portId)
                : UNODE_PORTS[sourceNode.type].inputs.find(p => p.id === target.portId)
              )
              if (srcPort && tgtPort && srcPort.type === tgtPort.type) {
                addConnection({ source, target })
              }
            }
            setPortCreateMenu(null)
          }}
        />
      )}
    </div>
  )
}

// 右键上下文菜单（画布空白 → 直接展示节点浮窗 + 其他操作；节点右键 → 复制/删除）
function CanvasContextMenu({
  menu, onClose, onAddNodeAt, onDuplicateNode, onDeleteNode,
}: {
  menu:
    | { x: number; y: number; canvasX: number; canvasY: number; kind: 'canvas' }
    | { x: number; y: number; kind: 'node'; nodeId: string }
  onClose: () => void
  onAddNodeAt: (type: UnifiedNodeType) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 防溢出：超出视口则反向展开
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    // 先把 position 暂设为 0 测量后再修正
    let nx = menu.x
    let ny = menu.y
    if (nx + w > vw - 8) nx = Math.max(8, vw - w - 8)
    if (ny + h > vh - 8) ny = Math.max(8, vh - h - 8)
    el.style.left = nx + 'px'
    el.style.top = ny + 'px'
  }, [menu])

  if (menu.kind === 'canvas') {
    // 画布右键：直接展示节点选项浮窗 + 辅助操作
    const quickNodes: { type: UnifiedNodeType; label: string; icon: any; color: string; desc: string }[] = [
      { type: 'image',  label: '图片生成', icon: ImageIcon,           color: '#22d3ee', desc: '输入提示词 · 生成图像' },
      { type: 'video',  label: '视频生成', icon: Film,                color: '#fbbf24', desc: '图生视频 · 视频生成' },
      { type: 'audio',  label: '音频生成', icon: Music,               color: '#f472b6', desc: '提示词生成配音/音乐' },
    ]

    return (
      <div
        ref={containerRef}
        className="fixed z-[60] rounded-xl border border-neutral-700/80 bg-[#141414]/95 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md p-2 w-[340px]"
        style={{ left: 0, top: 0 }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-400"/>
            <span className="text-[11px] font-semibold text-neutral-200 tracking-wide">快速添加节点</span>
          </div>
          <span className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5 border border-neutral-700/60">在鼠标位置插入</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-1">
          {quickNodes.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.type}
                onClick={() => onAddNodeAt(n.type)}
                className="group relative rounded-lg border border-neutral-700/70 bg-neutral-900/70 p-2.5 text-left transition-all hover:border-transparent hover:bg-neutral-800 hover:shadow-md"
                style={{ boxShadow: 'none' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 1px ${n.color}55, 0 4px 16px ${n.color}22`
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: `${n.color}1a`, color: n.color, border: `1px solid ${n.color}33` }}
                  >
                    <Icon className="h-3.5 w-3.5"/>
                  </span>
                  <span className="text-[12px] font-semibold text-neutral-100">{n.label}</span>
                </div>
                <div className="mt-1.5 pl-9 text-[10px] text-neutral-500 leading-snug">{n.desc}</div>
              </button>
            )
          })}
        </div>
        <div className="mx-1 h-px bg-neutral-700/70"/>
        <div className="py-0.5 px-1">
          <button onClick={() => { onClose(); /* Demo */ }} className="w-full px-2.5 py-1.5 flex items-center gap-2 rounded-md text-[11px] text-neutral-200 hover:bg-neutral-800 transition-colors">
            <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-neutral-800 text-neutral-300"><Upload className="h-3.5 w-3.5"/></span>
            <span className="flex-1 text-left">上传…</span>
            <kbd className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700 font-mono">⌘U</kbd>
          </button>
          <button onClick={() => { onClose(); /* Demo */ }} className="w-full px-2.5 py-1.5 flex items-center gap-2 rounded-md text-[11px] text-neutral-200 hover:bg-neutral-800 transition-colors">
            <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-neutral-800 text-neutral-300"><Save className="h-3.5 w-3.5"/></span>
            <span className="flex-1 text-left">保存到我的资产</span>
            <kbd className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700 font-mono">⌘S</kbd>
          </button>
          <div className="my-0.5 mx-1.5 h-px bg-neutral-700/70"/>
          <button disabled className="w-full px-2.5 py-1.5 flex items-center gap-2 rounded-md text-[11px] text-neutral-400 opacity-50 cursor-not-allowed">
            <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-neutral-800 text-neutral-500"><RotateCcw className="h-3.5 w-3.5"/></span>
            <span className="flex-1 text-left">撤销</span>
            <kbd className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700 font-mono">⌘Z</kbd>
          </button>
          <button disabled className="w-full px-2.5 py-1.5 flex items-center gap-2 rounded-md text-[11px] text-neutral-400 opacity-50 cursor-not-allowed">
            <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-neutral-800 text-neutral-500"><RefreshCw className="h-3.5 w-3.5"/></span>
            <span className="flex-1 text-left">重做</span>
            <kbd className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700 font-mono">⇧⌘Z</kbd>
          </button>
        </div>
      </div>
    )
  }

  // 节点右键：复制/删除
  const nodeItems = [
    { k: 'dup',   label: '复制节点', icon: Plus,    badge: '⌘D', onClick: () => onDuplicateNode(menu.nodeId), sub: '复制到右下方 30px' },
    { k: 'sep',   sep: true },
    { k: 'del',   label: '删除节点', icon: Trash2,  badge: '⌫',  onClick: () => onDeleteNode(menu.nodeId), danger: true },
  ] as const

  return (
    <div
      ref={containerRef}
      className="fixed z-[60] rounded-lg border border-neutral-700 bg-[#1c1c1c] shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md py-1 min-w-[200px]"
      style={{ left: 0, top: 0 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}>
      {nodeItems.map((it: any) => it.sep
        ? <div key={it.k} className="my-0.5 mx-1.5 h-px bg-neutral-700/80"/>
        : (() => {
            const Icon = it.icon
            return (
              <button key={it.k} disabled={it.disabled}
                onClick={it.onClick}
                className={cn(
                  'w-full px-2 py-1.5 flex items-center gap-2 transition-colors text-left',
                  it.disabled
                    ? 'opacity-50 cursor-not-allowed hover:bg-transparent'
                    : it.danger
                      ? 'text-red-300 hover:bg-red-900/30'
                      : 'text-neutral-200 hover:bg-neutral-800'
                )}>
                <span className={cn(
                  'h-6 w-6 rounded-md flex items-center justify-center shrink-0',
                  it.danger ? 'bg-red-900/30 text-red-300' : 'bg-neutral-800 text-neutral-300'
                )}>
                  <Icon className="h-3.5 w-3.5"/>
                </span>
                <span className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium">{it.label}</div>
                  {it.sub && <div className="text-[9px] text-neutral-500 truncate">{it.sub}</div>}
                </span>
                {it.badge && (
                  <kbd className="text-[9px] text-neutral-500 bg-neutral-800 rounded px-1 py-0.5 border border-neutral-700 font-mono">
                    {it.badge}
                  </kbd>
                )}
              </button>
            )
          })()
      )}
    </div>
  )
}

// 端口拖出松开 → 节点创建菜单（参考图2：引用该节点生成）
// - 根据来源端口的方向(isOutput)和类型(type)，过滤出可连接的节点（否则置灰）
// - 支持带 Beta/NEW 徽章、右侧箭头表示可展开
function PortCreateMenu({
  menu, onClose, onCreate,
}: {
  menu: {
    x: number; y: number;
    canvasX: number; canvasY: number;
    fromPort: { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean };
  }
  onClose: () => void
  onCreate: (type: UnifiedNodeType) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 防溢出：超出视口则反向展开
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = menu.x
    let ny = menu.y
    if (nx + w > vw - 8) nx = Math.max(8, vw - w - 8)
    if (ny + h > vh - 8) ny = Math.max(8, vh - h - 8)
    el.style.left = nx + 'px'
    el.style.top = ny + 'px'
  }, [menu])

  // 判断某节点类型是否可以与来源端口建立连接（至少有1个真实端口匹配）
  const canLink = (t: UnifiedNodeType): boolean => {
    const fp = menu.fromPort
    const ports = UNODE_PORTS[t]
    if (fp.isOutput) {
      // 来源=输出口 → 新节点需有输入口，type匹配
      return ports.inputs.some(p => p.type === fp.type)
    } else {
      // 来源=输入口 → 新节点需有输出口，type匹配
      return ports.outputs.some(p => p.type === fp.type)
    }
  }
  // 虚拟端口放宽：允许创建任意节点，后续尝试连接（失败则只创建不连）
  const isVirtual = menu.fromPort.portId === '__vin__' || menu.fromPort.portId === '__vout__'

  // 菜单列表（参考 Lib TV 图2：引用该节点生成）
  type Item = {
    type: UnifiedNodeType | null
    label: string
    icon: any
    badge?: { text: string; tone: 'new' | 'beta' | 'default' }
    desc?: string
    disabled?: boolean
    hasSub?: boolean
  }
  const items: Item[] = [
    { type: 'image',  label: '图片', icon: ImageIcon, desc: '图像生成', hasSub: false },
    { type: 'video',  label: '视频', icon: Film,      desc: '视频生成', hasSub: false },
    { type: 'audio',  label: '音频', icon: Music,     desc: '配音/音乐', hasSub: false },
  ]

  return (
    <div
      ref={containerRef}
      className="fixed z-[60] rounded-xl border border-neutral-700/80 bg-[#141414]/95 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md py-2 w-[220px]"
      style={{ left: 0, top: 0 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}>
      {/* 标题：引用该节点生成 */}
      <div className="px-3 pb-1.5 pt-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-400"/>
          <span className="text-[11px] font-semibold text-neutral-200 tracking-wide">引用该节点生成</span>
        </div>
      </div>
      <div className="mx-2 my-1 h-px bg-neutral-700/70"/>
      {/* 菜单项 */}
      <div className="px-1">
        {items.map((it) => {
          if (it.type === null) return null
          const Icon = it.icon
          const ok = isVirtual || canLink(it.type)
          const meta = UNODE_META[it.type]
          const badgeTone = it.badge?.tone ?? 'default'
          return (
            <button
              key={it.type + (it.disabled ? '-d' : '')}
              disabled={!ok}
              onClick={() => ok && onCreate(it.type!)}
              className={cn(
                'group w-full px-2 py-1.5 flex items-center gap-2.5 rounded-md transition-colors text-left',
                ok
                  ? 'hover:bg-neutral-800 text-neutral-100'
                  : 'opacity-40 cursor-not-allowed text-neutral-500',
              )}
              style={ok ? undefined : {}}
            >
              {/* 图标背景色块 */}
              <span
                className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 border"
                style={{
                  background: ok ? (meta.color + '15') : '#1f1f1f',
                  color: ok ? meta.color : '#737373',
                  borderColor: ok ? (meta.color + '33') : '#262626',
                }}
              >
                <Icon className="h-3.5 w-3.5"/>
              </span>
              <span className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium leading-none">{it.label}</span>
                  {it.badge && (
                    <span
                      className={cn(
                        'rounded px-1 py-0.5 text-[8px] font-bold tracking-wide',
                        badgeTone === 'new'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : badgeTone === 'beta'
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-neutral-700/60 text-neutral-400 border border-neutral-600/60',
                      )}
                    >
                      {it.badge.text}
                    </span>
                  )}
                </div>
                {it.desc && <div className="mt-0.5 text-[10px] text-neutral-500 leading-none">{it.desc}</div>}
              </span>
              {it.hasSub && (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-600 group-hover:text-neutral-400 shrink-0"/>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
