/**
 * 请求 ID 中间件
 * ==============
 *
 * 功能：
 *   - 为每个请求生成唯一 traceId
 *   - 从 X-Request-Id / X-Trace-Id 头透传上游 traceId（如存在）
 *   - 将 traceId 注入响应头 X-Request-Id
 *   - 记录请求开始时间，用于响应耗时统计
 *   - 自动记录请求日志（方法、路径、状态码、耗时）
 *
 * 与 logger 配合：请求期间 logger 自动携带 traceId
 */

import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import logger from '../lib/logger'

const REQUEST_ID_HEADER = 'x-request-id'
const TRACE_ID_HEADER = 'x-trace-id'

/**
 * 生成请求 ID（短格式，12 字符足够）
 */
function generateId(): string {
  return crypto.randomBytes(8).toString('hex')
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string
      startTime: number
    }
  }
}

/**
 * 请求 ID + 请求日志中间件
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  // 1. 获取或生成请求 ID
  const upstreamId = req.headers[TRACE_ID_HEADER] as string
    || req.headers[REQUEST_ID_HEADER] as string
  const requestId = upstreamId || generateId()

  req.requestId = requestId
  req.startTime = Date.now()

  // 2. 注入到全局上下文（logger 用）
  ;(globalThis as any).__traceId = requestId

  // 3. 响应头返回请求 ID
  res.setHeader(REQUEST_ID_HEADER, requestId)

  // 4. 请求结束时记录访问日志
  res.on('finish', () => {
    const duration = Date.now() - req.startTime
    const status = res.statusCode

    const logData: Record<string, any> = {
      method: req.method,
      path: req.path,
      status,
      durationMs: duration,
      ip: req.ip || (req.socket as any)?.remoteAddress,
    }

    // 慢请求告警（> 1s 标记 warn，> 3s 标记 error）
    if (duration > 3000) {
      logger.warn('慢请求', logData)
    } else if (status >= 500) {
      logger.error('请求失败', logData)
    } else if (status >= 400) {
      logger.warn('客户端错误', logData)
    } else {
      logger.info('请求完成', logData)
    }

    // 清理 traceId
    if ((globalThis as any).__traceId === requestId) {
      delete (globalThis as any).__traceId
    }
  })

  next()
}

export default requestId
