// 智能助手命令执行器 —— ADR「模型提议，应用裁决」的唯一执行入口
//
// 执行路径唯一性约束：本模块创建节点并预填 data 后，
// 一律复用画布既有 runImageGen / runVideoGen 触发生成
// （积分扣减、内容审核、限流、并发队列零旁路）。
// 助手命令本身没有 model 字段 —— 模型由用户在命令卡片中选择后传入。

import { useUnifiedCanvasStore } from '../store/useUnifiedCanvasStore'
import { getImageModel, validateRatio, validateResolution } from '../config/imageModels'
import { listVideoModels, estimateVideoCost } from '../config/videoModels'
import { snapToGrid } from '../store/canvasBase'
import type { AgentCommand } from './textApi'

export interface AgentExecutionPlan {
  nodeId: string
  estimatedCost: number
}

export interface ResolvedImageCommand {
  modelId: string
  ratio: string
  resolution: string
  batch: number
}

export interface ResolvedVideoCommand {
  modelId: string
  ratio: string
  resolution: string
  /** 模型支持的时长 id（如 '5s'），直接写入节点 videoDuration */
  duration: string
  durationSec: number
}

/** 按选定模型校验图像命令参数（越界参数回落到模型默认值，而不是丢弃） */
export function resolveImageCommand(cmd: AgentCommand, modelId: string): ResolvedImageCommand {
  const model = getImageModel(modelId)
  return {
    modelId: model.id,
    ratio: validateRatio(model.id, cmd.ratio || model.defaultRatio),
    resolution: validateResolution(model.id, cmd.resolution || model.defaultResolution),
    batch: Math.max(1, Math.min(Math.round(cmd.batch ?? 1) || 1, model.maxBatch)),
  }
}

/** 按选定模型校验视频命令参数（时长/分辨率/比例均以模型 config 为准） */
export function resolveVideoCommand(cmd: AgentCommand, modelId: string): ResolvedVideoCommand {
  const models = listVideoModels()
  const model = models.find((m) => m.id === modelId) || models[0]
  if (!model) throw new Error('视频模型列表为空')
  const cfg = model.config
  const durationSec = Math.round(cmd.duration ?? 0)
  const matched = (cfg?.durations ?? []).find((d) => d.value === durationSec)
  const duration = matched?.id || cfg?.defaultDuration || '5s'
  const finalDurationSec = matched?.value || Number(String(duration).replace(/\D/g, '')) || 5
  const res = (cfg?.resolutions ?? []).find((r) => r.id === cmd.resolution)
  return {
    modelId: model.id,
    ratio: cfg?.ratios.includes(cmd.ratio || '') ? (cmd.ratio as string) : cfg?.defaultRatio || '16:9',
    resolution: res?.id || cfg?.defaultResolution || '720p',
    duration,
    durationSec: finalDurationSec,
  }
}

/** 预估积分（展示用，最终以后端扣减为准） */
export function estimateAgentCost(cmd: AgentCommand, modelId: string, useRefImage: boolean): number {
  if (cmd.type === 'image') {
    const r = resolveImageCommand(cmd, modelId)
    return getImageModel(r.modelId).costTokens * r.batch
  }
  const r = resolveVideoCommand(cmd, modelId)
  const model = listVideoModels().find((m) => m.id === r.modelId)
  if (!model) return 0
  return estimateVideoCost(model, r.durationSec, r.resolution, useRefImage)
}

/** 在当前视野中心附近找一个不遮挡既有节点的位置 */
function nextAgentPosition(): { x: number; y: number } {
  const st = useUnifiedCanvasStore.getState()
  const vp = st.viewport
  const cx = (window.innerWidth / 2 - vp.x) / vp.zoom
  const cy = (window.innerHeight / 2 - vp.y) / vp.zoom
  let x = cx
  const occupied = (px: number, py: number) =>
    st.nodes.some((n) => Math.abs(n.position.x - px) < 360 && Math.abs(n.position.y - py) < 300)
  let guard = 0
  while (occupied(x, cy) && guard < 8) x += 380
  return { x: snapToGrid(x), y: snapToGrid(cy) }
}

/**
 * 参考图仅支持「引用当前选中节点」（v1 已确认的设计边界）：
 * 只接受有已完成成果的图片节点（runImageGen/runVideoGen 的 ref 端口均要求公网 URL）
 */
function resolveReferenceSource(useReference: boolean): string | null {
  if (!useReference) return null
  const st = useUnifiedCanvasStore.getState()
  const src = st.nodes.find((n) => n.id === st.selectedNodeId)
  if (!src || src.type !== 'image') return null
  const hasDone = (src.data.imageResults ?? []).some((r) => r.status === 'done' && r.originalUrl)
  return hasDone ? src.id : null
}

/**
 * 执行一条命令建议：建节点 → 预填参数 → （可选）连接参考图 → 复用画布生成
 * 同步返回执行计划；生成过程中的状态变化全部由画布节点自身呈现
 */
export function executeAgentCommand(cmd: AgentCommand, modelId: string, useRefImage: boolean): AgentExecutionPlan {
  if (cmd.type !== 'image' && cmd.type !== 'video') throw new Error('不支持的命令类型')
  const prompt = (cmd.prompt || '').trim()
  if (!prompt) throw new Error('命令缺少提示词')

  const st = useUnifiedCanvasStore.getState()
  const position = nextAgentPosition()
  const refSourceId = resolveReferenceSource(useRefImage)
  const connectRef = (nodeId: string) => {
    if (!refSourceId) return
    st.addConnection({ source: { nodeId: refSourceId, portId: 'out' }, target: { nodeId, portId: 'ref' } })
  }

  if (cmd.type === 'image') {
    const r = resolveImageCommand(cmd, modelId)
    const nodeId = st.addNode('image', position, {
      imagePrompt: prompt,
      negativePrompt: cmd.negativePrompt?.trim() || undefined,
      imageModel: r.modelId,
      imageRatio: r.ratio,
      imageResolution: r.resolution,
      imageCount: r.batch,
    }, false)
    connectRef(nodeId)
    st.selectNode(nodeId)
    const estimatedCost = estimateAgentCost(cmd, modelId, !!refSourceId)
    // 与 createConnectedImageNode 相同的异步触发模式（等待节点渲染挂载）
    setTimeout(() => { useUnifiedCanvasStore.getState().runImageGen(nodeId) }, 100)
    return { nodeId, estimatedCost }
  }

  const r = resolveVideoCommand(cmd, modelId)
  const nodeId = st.addNode('video', position, {
    videoPrompt: prompt,
    videoModel: r.modelId,
    videoRatio: r.ratio,
    videoResolution: r.resolution,
    videoDuration: r.duration,
  }, false)
  connectRef(nodeId)
  st.selectNode(nodeId)
  const estimatedCost = estimateAgentCost(cmd, modelId, !!refSourceId)
  setTimeout(() => { useUnifiedCanvasStore.getState().runVideoGen(nodeId) }, 100)
  return { nodeId, estimatedCost }
}
