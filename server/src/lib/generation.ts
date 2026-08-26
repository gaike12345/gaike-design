import prisma from './prisma'

// 生成日志 + 扣减额度的统一工具函数
export interface LogGenerationParams {
  userId: string
  type: string         // novel | image | comic | audio | video
  modelId?: string     // AI 模型名称
  provider?: string    // 供应商
  input?: string       // JSON: 输入参数摘要
  output?: string      // JSON: 输出结果摘要
  tokensUsed?: number  // token 消耗
  duration?: number    // 耗时(ms)
  status?: string      // success | failed | pending
  errorMsg?: string
}

export async function logGeneration(params: LogGenerationParams) {
  const {
    userId, type, modelId, provider, input, output,
    tokensUsed = 0, duration = 0, status = 'success', errorMsg,
  } = params

  // 1) 写生成日志
  const log = await prisma.generationLog.create({
    data: {
      userId, type, modelId, provider, input, output,
      tokensUsed, duration, status, errorMsg,
    },
  })

  // 2) 扣减用户额度（失败不扣）
  if (status === 'success' && tokensUsed > 0) {
    const quota = await prisma.userQuota.findUnique({ where: { userId } })
    if (quota) {
      const newUsed = quota.usedTokens + tokensUsed
      const newRemaining = Math.max(0, quota.totalTokens - newUsed)
      await prisma.userQuota.update({
        where: { userId },
        data: {
          usedTokens: newUsed,
          remainingTokens: newRemaining,
        },
      })
    }
  }

  return log
}

// 检查用户额度是否足够
export async function checkQuota(userId: string, requiredTokens: number): Promise<{ ok: boolean; remaining: number; message?: string }> {
  const quota = await prisma.userQuota.findUnique({ where: { userId } })
  if (!quota) {
    return { ok: false, remaining: 0, message: '用户额度记录不存在' }
  }
  if (quota.remainingTokens < requiredTokens) {
    return {
      ok: false,
      remaining: quota.remainingTokens,
      message: `额度不足，剩余 ${quota.remainingTokens} tokens，需要 ${requiredTokens} tokens`,
    }
  }
  return { ok: true, remaining: quota.remainingTokens }
}
