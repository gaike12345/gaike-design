import { Request, Response, NextFunction } from 'express'
import logger from '../lib/logger'
import {
  logGeneration,
  checkQuota,
  atomicDeductQuota,
  atomicRefundQuota,
  recordUsedTokens,
} from '../lib/generation'

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      _genStartTime?: number
      _genType?: string
      _genTokens?: number
      _genPreDeducted?: boolean // 标记是否已预扣额度
      _genModel?: string       // 本次请求最终决定使用的模型名（用于日志）
      _genAsyncTask?: boolean  // 是否为异步任务（入队即返回，任务在后台执行）
    }
  }
}

/**
 * 生成中间件：原子预扣额度 → 记录开始时间 → 响应完成后写日志（成功累加 usedTokens，失败退还预扣）
 *
 * 🔑  积分制度升级 (2026-09):
 *   tokensRequired 支持 number | (req) => Promise<number> 两种签名
 *   - number：编译期/启动时固定（旧代码兼容，novel/LLM 等按模型类型粗粒度）
 *   - 函数：在请求处理阶段按 req.body.model / voice / modelId 等动态查询 AIModel.costTokens
 *           三大创作板块（image/video/audio/comic）都用函数形式，真正实现"不同模型消耗不同积分"
 *
 * 🚦 解决 TOCTOU 竞态：原 checkQuota + finish 时扣减的两步模式在并发下可被绕过，
 *    这里改为请求进入时原子预扣；失败退还，成功记为已用。
 */
export function withGeneration(
  type: string,
  tokensRequired: number | ((req: Request) => Promise<number>),
  options?: { asyncTask?: boolean },
) {
  const asyncTask = options?.asyncTask ?? false
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录后再使用 AI 创作功能' })
    }

    // 1) 计算本次消耗积分（函数式会查 AIModel DB → 缓存命中会很快）
    let actualCost: number
    try {
      actualCost = typeof tokensRequired === 'function' ? await tokensRequired(req) : tokensRequired
    } catch (e) {
      const fallback = typeof tokensRequired === 'number' ? tokensRequired : 1000
      logger.warn('动态计算积分失败，使用兜底值', { fallback, error: e instanceof Error ? e.message : String(e) })
      actualCost = fallback
    }
    actualCost = Math.max(0, Math.trunc(actualCost)) // 规范化：非负整数
    req._genTokens = actualCost

    // 2) 轻量只读检查（提前友好提示，不阻塞真正原子扣减并发正确性 — 双重保险）
    const quota = await checkQuota(req.user.userId, actualCost)
    if (!quota.ok) {
      return res.status(402).json({
        error: quota.message || '积分额度不足，请先充值后再使用',
        need: actualCost,
        remaining: quota.remaining ?? 0,
      })
    }

    // 3) 原子预扣（并发安全：updateMany where remainingTokens >= actualCost）
    const deducted = actualCost <= 0 ? true : await atomicDeductQuota(req.user.userId, actualCost)
    if (!deducted) {
      // 并发抢扣失败：上一刻还有额度，这一刻被其他请求抢走
      return res.status(402).json({
        error: '积分不足或并发抢扣失败，请重试',
        need: actualCost,
      })
    }

    req._genStartTime = Date.now()
    req._genType = type
    req._genPreDeducted = true
    req._genAsyncTask = asyncTask

    // 4) 响应完成后异步写日志 + 处理积分
    res.on('finish', () => {
      const statusCode = res.statusCode
      const success = statusCode >= 200 && statusCode < 400

      // 异步任务模式：HTTP 成功仅表示入队成功，不代表生成完成
      //   - 入队成功：记 pending 日志，积分保留在预扣状态，由 Worker 在任务完成时最终结算
      //   - 入队失败：退还预扣积分
      if (asyncTask) {
        const status = success ? 'pending' : 'failed'
        ;(async () => {
          try {
            await logGeneration({
              userId: req.user!.userId,
              type,
              modelId: req._genModel || req.body?.model || req.body?.voice || req.body?.modelId || undefined,
              provider: undefined,
              input: JSON.stringify(req.body || {}).slice(0, 500),
              output: undefined,
              tokensUsed: 0, // 异步任务完成时再记
              duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
              status,
              errorMsg: success ? undefined : `HTTP ${statusCode}`,
            })

            if (!success && actualCost > 0) {
              // 入队失败：退还预扣
              await atomicRefundQuota(req.user!.userId, actualCost)
            }
          } catch (e) {
            logger.error('异步任务后置处理失败', { error: e instanceof Error ? e.message : String(e) })
          }
        })()
        return
      }

      // 同步任务模式：HTTP 成功 = 生成成功
      const status = success ? 'success' : 'failed'
      const tokensUsed = success ? actualCost : 0

      // 异步清理，不阻塞响应
      ;(async () => {
        try {
          await logGeneration({
            userId: req.user!.userId,
            type,
            modelId: req._genModel || req.body?.model || req.body?.voice || req.body?.modelId || undefined,
            provider: undefined,
            input: JSON.stringify(req.body || {}).slice(0, 500),
            output: undefined,
            tokensUsed,
            duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
            status,
            errorMsg: success ? undefined : `HTTP ${statusCode}`,
          })

          if (success) {
            // 成功：累加 usedTokens（remainingTokens 已在预扣时扣过）
            if (actualCost > 0) await recordUsedTokens(req.user!.userId, actualCost)
          } else {
            // 失败：退还预扣
            if (actualCost > 0) await atomicRefundQuota(req.user!.userId, actualCost)
          }
        } catch (e) {
          logger.error('同步任务后置处理失败', { error: e instanceof Error ? e.message : String(e) })
        }
      })()
    })

    next()
  }
}
