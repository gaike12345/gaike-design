// 画布节点容器 - 按节点 id 粒度订阅 store，避免全量重渲染
//
// 性能优化要点：
// 1. 只订阅单个节点的数据（通过 selector 按 id 查找）
// 2. 事件回调通过 .getState() 调用，保持引用稳定
// 3. memo 化 + 浅比较，仅当节点自身数据变化时才重渲染
//
// 这样，当一个节点的 position / data 变化时，只有该节点重渲染，
// 而不是画布上所有节点一起重渲染（之前的 nodes.map 全量订阅模式）

import { memo, useCallback } from 'react'
import type { MouseEvent } from 'react'
import {
  useUnifiedCanvasStore,
  UNODE_PORTS,
  UNODE_SIZE,
  type UCanvasNode,
  type UnifiedPortType,
} from '../../store/useUnifiedCanvasStore'
import {
  UBaseNode,
  UNODE_META,
  ImageSettingsPanel,
  VideoSettingsPanel,
  renderUnifiedNodeContent,
} from './UnifiedNodes'

interface CanvasNodeProps {
  nodeId: string
  // 事件回调：由父组件统一提供，避免每个节点各自创建闭包
  onNodeMouseDown: (e: MouseEvent, nodeId: string) => void
  onNodeContextMenu: (e: MouseEvent, nodeId: string) => void
  onPortStart: (e: MouseEvent, nodeId: string, portId: string, type: UnifiedPortType, isOutput: boolean) => void
  onPortUp: (e: MouseEvent) => void
}

/**
 * 单个画布节点组件
 * - 自己从 store 订阅该节点的数据（粒度更细）
 * - 事件回调从 props 传入（由父组件统一管理，引用稳定）
 */
export const CanvasNode = memo(function CanvasNode({
  nodeId,
  onNodeMouseDown,
  onNodeContextMenu,
  onPortStart,
  onPortUp,
}: CanvasNodeProps) {
  // 使用单个选择器避免返回新对象导致无限更新
  const node = useUnifiedCanvasStore((s) => s.nodes.find((n: UCanvasNode) => n.id === nodeId) ?? null)
  const isSelected = useUnifiedCanvasStore((s) => s.selectedNodeId === nodeId)

  // 节点不存在（已删除等情况）不渲染
  if (!node) return null

  const meta = UNODE_META[node.type]
  const ports = UNODE_PORTS[node.type]
  const size = UNODE_SIZE[node.type]

  // 稳定的回调包装
  const handleMouseDown = useCallback(
    (e: MouseEvent) => onNodeMouseDown(e, nodeId),
    [onNodeMouseDown, nodeId],
  )
  const handleContextMenu = useCallback(
    (e: MouseEvent) => onNodeContextMenu(e, nodeId),
    [onNodeContextMenu, nodeId],
  )
  const handlePortStart = useCallback(
    (e: MouseEvent, portId: string, type: UnifiedPortType, isOutput: boolean) =>
      onPortStart(e, nodeId, portId, type, isOutput),
    [onPortStart, nodeId],
  )
  const handleDelete = useCallback(() => {
    useUnifiedCanvasStore.getState().removeNode(nodeId)
  }, [nodeId])

  // 设置面板：仅选中时显示
  const settingsPanel =
    isSelected && node.type === 'image' ? (
      <ImageSettingsPanel node={node} />
    ) : isSelected && node.type === 'video' ? (
      <VideoSettingsPanel node={node} />
    ) : null

  return (
    <UBaseNode
      node={node}
      selected={isSelected}
      meta={meta}
      ports={ports}
      size={size}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onPortStart={handlePortStart}
      onPortUp={onPortUp}
      onDelete={handleDelete}
      settingsPanel={settingsPanel}
    >
      {renderUnifiedNodeContent(node)}
    </UBaseNode>
  )
})
