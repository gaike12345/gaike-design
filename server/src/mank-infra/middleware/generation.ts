import { Request, Response, NextFunction } from 'express'
import logger from '../logging/logger'
import {
  logGeneration,
  checkQuota,
  atomicDeductQuota,
  atomicRefundQuota,
  recordUsedTokens,
} from '../../mank-core/generation/generation'
import {
  deductTokens,
  settleByTxId,
  refundByTxId,
  refundTokens,
} from '../../mank-core/billing/tokenService'
import { getModelCost, getModelMargin } from '../../mank-core/billing/modelCost'

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
      _genTxId?: string        // 积分流水ID（异步任务结算时用）
      _genRelatedId?: string   // 关联的任务ID/生成ID
      // 毛利对账字段（2026-09 升级）
      _genMarginAtCall?: number  // 调用时的 margin 快照
      _genCostTokens?: number   // 官方成本积分（不含毛利）
    }
  }
}

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

    let actualCost: number
    try {
      actualCost = typeof tokensRequired === 'function' ? await tokensRequired(req) : tokensRequired
    } catch (e) {
      const fallback = typeof tokensRequired === 'number' ? tokensRequired : 1000
      logger.warn('动态计算积分失败，使用兜底值', { fallback, error: e instanceof Error ? e.message : String(e) })
      actualCost = fallback
    }
    actualCost = Math.max(0, Math.trunc(actualCost))
    req._genTokens = actualCost

    const quota = await checkQuota(req.user.userId, actualCost)
    if (!quota.ok) {
      return res.status(402).json({
        error: quota.message || '积分额度不足，请先充值后再使用',
        need: actualCost,
        remaining: quota.remaining ?? 0,
      })
    }

    if (actualCost > 0) {
      const deductResult = await deductTokens({
        userId: req.user.userId,
        amount: actualCost,
        relatedType: asyncTask ? 'task' : 'generation',
        modelId: req.body?.model || req.body?.voice || req.body?.modelId || undefined,
        reason: `${type} 生成预扣`,
      })

      if (!deductResult.success) {
        return res.status(402).json({
          error: '积分不足或并发抢扣失败，请重试',
          need: actualCost,
        })
      }

      req._genTxId = deductResult.transactionId
    }

    // 预读 margin 和 costTokens（用于毛利对账）
    // 快照时机：请求开始时预扣阶段，与 tokensUsed 同步写入 GenerationLog
    const modelForCost = req._genModel || req.body?.model || req.body?.voice || req.body?.modelId
    if (modelForCost && actualCost > 0) {
      try {
        const [costFromDb, margin] = await Promise.all([
          getModelCost(modelForCost as string, type as 'novel' | 'image' | 'audio' | 'video' | 'comic', 1000),
          getModelMargin(modelForCost as string),
        ])
        // 售价 = costFromDb（已含毛利的当前 costTokens）
        // 成本价 = costFromDb / margin（去除毛利）
        // 注意：若 margin=2.0，则 costTokens=售价/2 = 成本价
        if (margin > 0) {
          req._genMarginAtCall = margin
          req._genCostTokens = Math.max(0, Math.round(costFromDb / margin))
        }
      } catch (e) {
        logger.warn('预读 margin/costTokens 失败，毛利统计将使用默认值', {
          model: modelForCost, error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    req._genStartTime = Date.now()
    req._genType = type
    req._genPreDeducted = true
    req._genAsyncTask = asyncTask

    res.on('finish', () => {
      const statusCode = res.statusCode
      const success = statusCode >= 200 && statusCode < 400

      if (asyncTask) {
        const status = success ? 'pending' : 'failed'
        ;(async () => {
          try {
            const taskId = (res as any).locals?.taskId || req._genRelatedId
            const genLog = await logGeneration({
              userId: req.user!.userId,
              type,
              modelId: req._genModel || req.body?.model || req.body?.voice || req.body?.modelId || undefined,
              provider: undefined,
              input: JSON.stringify(req.body || {}).slice(0, 500),
              output: taskId ? JSON.stringify({ taskId }) : undefined,
              tokensUsed: 0,
              duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
              status,
              errorMsg: success ? undefined : `HTTP ${statusCode}`,
              // 异步任务入队阶段不结算毛利（tokensUsed=0），毛利在任务完成时由 taskWorker 写入
              costTokens: 0,
              marginAtCall: req._genMarginAtCall,
            })

            if (!success && actualCost > 0) {
              await refundTokens({
                userId: req.user!.userId,
                relatedId: taskId || genLog.id,
                relatedType: 'task',
                reason: `入队失败 HTTP ${statusCode}`,
              })
            }
          } catch (e) {
            logger.error('异步任务后置处理失败', { error: e instanceof Error ? e.message : String(e) })
          }
        })()
        return
      }

      if (actualCost > 0 && req._genTxId) {
        if (success) {
          settleByTxId(req._genTxId)
        } else {
          refundByTxId(req._genTxId, `生成失败 HTTP ${statusCode}`)
        }
      }

      ;(async () => {
        try {
          await logGeneration({
            userId: req.user!.userId,
            type,
            modelId: req._genModel || req.body?.model || req.body?.voice || req.body?.modelId || undefined,
            provider: undefined,
            input: JSON.stringify(req.body || {}).slice(0, 500),
            output: undefined,
            tokensUsed: success ? actualCost : 0,
            duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
            status: success ? 'success' : 'failed',
            errorMsg: success ? undefined : `HTTP ${statusCode}`,
            // 毛利对账字段（仅在成功调用时记录）
            costTokens: success ? req._genCostTokens : 0,
            marginAtCall: req._genMarginAtCall,
          })
        } catch (e) {
          logger.error('同步任务后置处理失败', { error: e instanceof Error ? e.message : String(e) })
        }
      })()
    })

    next()
  }
}
