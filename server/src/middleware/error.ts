import type { Request, Response, NextFunction } from 'express'

// 是否为生产环境
const IS_PROD = process.env.NODE_ENV === 'production'

// 统一错误处理中间件
// 生产环境不向客户端泄漏内部错误细节（如 Prisma 错误、堆栈、表名/字段名）
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // 完整错误信息（含 stack）写入服务端日志，便于排查
  console.error('[Error]', err.message, '\n', err.stack)

  // 客户端可见的友好错误信息
  const clientMessage = IS_PROD
    ? '服务器内部错误，请稍后重试'
    : (err.message || '服务器内部错误')

  res.status(500).json({
    error: clientMessage,
    // 仅开发环境返回错误名，帮助调试；不返回 stack / message 原文
    ...(IS_PROD ? {} : { debug: err.name }),
  })
}

// 404 兜底
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: '接口不存在' })
}
