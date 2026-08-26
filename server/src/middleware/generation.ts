import { Request, Response, NextFunction } from 'express'
import { logGeneration, checkQuota } from '../lib/generation'

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      _genStartTime?: number
      _genType?: string
      _genTokens?: number
    }
  }
}

// 生成中间件：检查额度 → 记录开始时间 → 响应完成后写日志 + 扣额度
export function withGeneration(type: string, tokensRequired: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录后再使用 AI 创作功能' })
    }
    // 检查额度
    const quota = await checkQuota(req.user.userId, tokensRequired)
    if (!quota.ok) {
      return res.status(402).json({ error: quota.message || 'Token 额度不足' })
    }
    req._genStartTime = Date.now()
    req._genType = type
    req._genTokens = tokensRequired

    // 响应完成后异步写日志 + 扣额度（不阻塞响应）
    res.on('finish', () => {
      const statusCode = res.statusCode
      const status = statusCode >= 200 && statusCode < 400 ? 'success' : 'failed'
      logGeneration({
        userId: req.user!.userId,
        type,
        modelId: req.body?.model || req.body?.voice || undefined,
        provider: undefined,
        input: JSON.stringify(req.body || {}).slice(0, 500),
        output: undefined, // finish 事件无法读取响应体
        tokensUsed: status === 'success' ? tokensRequired : 0,
        duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
        status,
        errorMsg: status === 'failed' ? `HTTP ${statusCode}` : undefined,
      }).catch(() => {})
    })

    next()
  }
}
