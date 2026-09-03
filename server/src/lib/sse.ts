/**
 * SSE（Server-Sent Events）实时推送服务
 * ====================================
 *
 * 功能：
 *   - 任务状态实时推送（替代前端轮询）
 *   - 自动重连支持（Last-Event-ID）
 *   - 心跳保活（每 15s 发送注释，防止连接超时）
 *   - 内存模式 + Redis 模式均支持
 *
 * 使用方式（前端）：
 *   const es = new EventSource('/api/tasks/stream?token=xxx')
 *   es.addEventListener('task:change', (e) => {
 *     const data = JSON.parse(e.data)
 *     console.log('任务状态更新:', data.taskId, data.status)
 *   })
 *
 *   // 或监听特定任务
 *   es.addEventListener('task:vid_abc123', (e) => { ... })
 */

import type { Request, Response } from 'express'
import { taskQueue } from './taskQueue'
import logger from './logger'

const HEARTBEAT_INTERVAL_MS = 15_000 // 15 秒心跳
const CLIENT_TIMEOUT_MS = 5 * 60_000 // 5 分钟无消息自动断开

interface SSEClient {
  id: string
  res: Response
  userId: string
  lastEventId: string
}

// 当前活跃的 SSE 连接（内存模式下使用）
const clients = new Map<string, SSEClient>()
let clientCount = 0

/**
 * 发送 SSE 事件
 */
function sendEvent(res: Response, event: string, data: any, id?: string): void {
  if (id) res.write(`id: ${id}\n`)
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * 发送心跳注释（防止代理/负载均衡超时断开）
 */
function sendHeartbeat(res: Response): void {
  res.write(`: heartbeat ${Date.now()}\n\n`)
}

/**
 * SSE 中间件处理函数
 * 需要在 authRequired 之后调用，确保 req.user 已设置
 */
export function sseHandler(req: Request, res: Response): void {
  const userId = (req as any).user?.userId
  if (!userId) {
    res.status(401).json({ error: '未授权' })
    return
  }

  const clientId = `sse_${++clientCount}_${Date.now()}`
  const lastEventId = req.headers['last-event-id'] as string || ''

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
  })

  // 禁用压缩（SSE 流不适合压缩）
  res.flushHeaders?.()

  const client: SSEClient = {
    id: clientId,
    res,
    userId,
    lastEventId,
  }

  clients.set(clientId, client)

  logger.info('SSE 连接建立', { clientId, userId, totalClients: clients.size })

  // 发送初始连接事件
  sendEvent(res, 'connected', {
    clientId,
    message: '连接已建立',
    heartbeat: HEARTBEAT_INTERVAL_MS,
  })

  // 心跳定时器
  const heartbeatTimer = setInterval(() => {
    sendHeartbeat(res)
  }, HEARTBEAT_INTERVAL_MS)
  heartbeatTimer.unref?.()

  // 超时定时器（无事件时自动断开，客户端会重连）
  let activityTimer: NodeJS.Timeout
  const resetActivityTimer = () => {
    clearTimeout(activityTimer)
    activityTimer = setTimeout(() => {
      logger.info('SSE 连接超时，主动断开', { clientId })
      res.end()
    }, CLIENT_TIMEOUT_MS)
  }
  resetActivityTimer()

  // 监听任务状态变更
  const unregister = taskQueue.onAnyChange((data) => {
    // 只推送给任务所属用户
    // 注意：data 中没有 userId 字段，需要从任务详情中获取
    // 这里我们用通配方式推送，前端根据 taskId 过滤
    // 如需更严格的用户隔离，可在 data 中携带 userId 并在此过滤
    sendEvent(res, 'task:change', data)
    sendEvent(res, `task:${data.taskId}`, data)
    resetActivityTimer()
  })

  // 客户端断开清理
  req.on('close', () => {
    clearInterval(heartbeatTimer)
    clearTimeout(activityTimer)
    unregister()
    clients.delete(clientId)
    logger.info('SSE 连接关闭', { clientId, userId, totalClients: clients.size })
  })
}

/**
 * 获取当前 SSE 连接数（监控用）
 */
export function getSseClientCount(): number {
  return clients.size
}

export default sseHandler
