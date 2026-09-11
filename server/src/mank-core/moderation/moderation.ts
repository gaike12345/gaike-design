// 内容安全审核服务
// 输入审核（preModerate）+ 输出审核（postModerate）
// 服务商 API 审核（MODERATION_API_KEY 配置后启用）
//
// 设计：
//   1. 服务商审核（MODERATION_API_KEY 配置后启用，未配置时跳过，标记 placeholder）
//   2. 违规 → 写 ModerationLog（append-only）+ 自动升级 User.riskLevel
//   3. riskLevel≥3 时 llmRoute 层拒绝生成（前置门控）
//
// 合规依据：《生成式人工智能服务管理暂行办法》要求输入+输出双审核

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'
import prisma from '../../mank-infra/database/prisma'
import { logger } from '../../mank-infra/logging/logger'
import { cfgBool } from '../../mank-infra/config/siteConfig'

// ==================== 类型定义 ====================
export type ModerationStage = 'input' | 'output'
export type ModerationRisk = 'low' | 'medium' | 'high'

export interface ModerationResult {
  passed: boolean
  riskLevel: ModerationRisk
  reason: string       // 内部详细原因（写日志用）
  safeReason: string   // 对外安全提示（返回给前端用，不泄露具体命中词）
  provider: 'aliyun' | 'zhipu' | 'none'
  categories: string[]
  hits: string[]
  placeholder?: boolean
}

// ==================== 工具函数 ====================
function truncate(s: string, n = 500): string {
  return s.length > n ? s.slice(0, n) + '...' : s
}

// ==================== 服务商审核 ====================
// 支持两家内容安全服务商（合规要求：至少两家）
//   - aliyun: 阿里云内容安全 Green（文本审核 TextModeration）
//   - zhipu: 智谱内容安全 Moderation API
// 通过 MODERATION_PROVIDER 环境变量选择，默认 aliyun
// 通过 MODERATION_API_KEY / MODERATION_API_SECRET 配置凭据
//
// 阿里云参数说明：
//   MODERATION_API_KEY    = AccessKeyId
//   MODERATION_API_SECRET = AccessKeySecret
//   MODERATION_REGION     = cn-shanghai（默认）
//
// 智谱参数说明：
//   MODERATION_API_KEY = 智谱 API Key（用于生成 JWT）

// 阿里云分类 → 内部分类映射
const ALIYUN_CATEGORY_MAP: Record<string, string> = {
  politics: 'political',
  violence: 'violence',
  porn: 'porn',
  contraband: 'drug',
  ad: 'low',
  abuse: 'insult',
  terrorism: 'violence',
  nude: 'porn',
  'sexual-approaching': 'porn',
  'text-other-risks': 'low',
}

// 智谱分类 → 内部分类映射
const ZHIPU_CATEGORY_MAP: Record<string, string> = {
  sensitive: 'political',
  violence: 'violence',
  porn: 'porn',
  'drug-related': 'drug',
  gambling: 'gambling',
  insult: 'insult',
  advertisement: 'low',
  other: 'low',
}

// 阿里云 RPC 签名（Signature Version 1.0）
function aliYunSign(params: Record<string, string>, accessKeySecret: string): string {
  const sorted = Object.keys(params).sort()
  const canonical = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonical)}`
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
}

// 阿里云内容安全 - 文本审核
async function scanAliyun(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const accessKeyId = process.env.MODERATION_API_KEY
  const accessKeySecret = process.env.MODERATION_API_SECRET
  const region = process.env.MODERATION_REGION || 'cn-shanghai'

  if (!accessKeyId || !accessKeySecret) return null

  try {
    const params: Record<string, string> = {
      Action: 'TextModeration',
      Version: '2022-03-02',
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(8).toString('hex'),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Service: 'green',
      ServiceParameters: JSON.stringify({ content: text, scenes: ['antispam'] }),
    }
    params.Signature = aliYunSign(params, accessKeySecret)

    const url = `https://green.${region}.aliyuncs.com/?${Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    const data = (await res.json()) as any

    if (data.Code !== 200) {
      logger.warn('阿里云审核返回错误', { code: data.Code, message: data.Message })
      return null
    }

    const result = data.Data?.result?.[0]
    if (!result) return null

    const passed = result.suggestion === 'pass'
    if (passed) return { categories: [], passed: true, reason: '阿里云审核通过' }

    const categories: string[] = []
    const details = result.results || []
    for (const d of details) {
      const mapped = ALIYUN_CATEGORY_MAP[d.label] || 'low'
      if (!categories.includes(mapped)) categories.push(mapped)
    }

    return {
      categories,
      passed: false,
      reason: `阿里云审核违规：${details.map((d: any) => d.label).join('、')}`,
    }
  } catch (e) {
    logger.warn('阿里云审核调用失败', { error: e instanceof Error ? e.message : String(e) })
    return null // 服务商故障时降级，不阻断
  }
}

// 智谱内容安全 - 文本审核
async function scanZhipu(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const apiKey = process.env.MODERATION_API_KEY
  if (!apiKey) return null

  try {
    // 智谱 Moderation API
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text, model: 'text-moderation' }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      logger.warn('智谱审核返回错误', { status: res.status })
      return null
    }

    const data = (await res.json()) as any
    const results = data.results || []

    if (results.length === 0 || results[0].flagged === false) {
      return { categories: [], passed: true, reason: '智谱审核通过' }
    }

    const categories: string[] = []
    const categoriesData = results[0].categories || {}
    for (const [key, flagged] of Object.entries(categoriesData)) {
      if (flagged) {
        const mapped = ZHIPU_CATEGORY_MAP[key] || 'low'
        if (!categories.includes(mapped)) categories.push(mapped)
      }
    }

    return {
      categories,
      passed: false,
      reason: `智谱审核违规：${results[0].category_scores ? Object.keys(results[0].category_scores).filter((k) => (results[0].category_scores as any)[k] > 0.5).join('、') : '违规内容'}`,
    }
  } catch (e) {
    logger.warn('智谱审核调用失败', { error: e instanceof Error ? e.message : String(e) })
    return null // 服务商故障时降级，不阻断
  }
}

// 服务商审核主入口
async function scanProvider(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const key = process.env.MODERATION_API_KEY
  if (!key) return null // demo 模式，跳过服务商审核

  const provider = (process.env.MODERATION_PROVIDER as 'aliyun' | 'zhipu') || 'aliyun'

  if (provider === 'zhipu') {
    return await scanZhipu(text)
  } else {
    return await scanAliyun(text)
  }
}

// ==================== 图片内容审核 ====================

export interface ImageModerationResult {
  passed: boolean
  riskLevel: ModerationRisk
  reason: string       // 内部详细原因
  safeReason: string   // 对外安全提示
  provider: 'aliyun' | 'none'
  categories: string[]
  hits: string[]
}

// 阿里云图片审核 - ImageModeration
async function scanAliyunImage(imageUrl: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const accessKeyId = process.env.MODERATION_API_KEY
  const accessKeySecret = process.env.MODERATION_API_SECRET
  const region = process.env.MODERATION_REGION || 'cn-shanghai'

  if (!accessKeyId || !accessKeySecret) return null

  try {
    const params: Record<string, string> = {
      Action: 'ImageModeration',
      Version: '2022-03-02',
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(8).toString('hex'),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Service: 'green',
      ServiceParameters: JSON.stringify({
        imageUrl,
        scenes: ['porn', 'terrorism', 'politics', 'contraband', 'ad', 'live'],
      }),
    }
    params.Signature = aliYunSign(params, accessKeySecret)

    const url = `https://green.${region}.aliyuncs.com/?${Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 图片审核超时设长一点

    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    const data = (await res.json()) as any

    if (data.Code !== 200) {
      logger.warn('阿里云图片审核返回错误', { code: data.Code, message: data.Message })
      return null
    }

    const result = data.Data?.result?.[0]
    if (!result) return null

    const passed = result.suggestion === 'pass'
    if (passed) return { categories: [], passed: true, reason: '阿里云图片审核通过' }

    const categories: string[] = []
    const details = result.results || []
    const hitLabels: string[] = []
    for (const d of details) {
      const mapped = ALIYUN_CATEGORY_MAP[d.label] || 'low'
      if (!categories.includes(mapped)) categories.push(mapped)
      hitLabels.push(d.label)
    }

    return {
      categories,
      passed: false,
      reason: `阿里云图片审核违规：${hitLabels.join('、')}`,
    }
  } catch (e) {
    logger.warn('阿里云图片审核调用失败', { error: e instanceof Error ? e.message : String(e) })
    return null // 服务商故障时降级，不阻断
  }
}

// 主入口：审核图片 URL
export async function moderateImageUrl(
  imageUrl: string,
  opts: { endpoint: string; userId: string },
): Promise<ImageModerationResult> {
  const hasKey = !!process.env.MODERATION_API_KEY

  // 审核总开关
  const enabled = await cfgBool('safety.image_moderation_enabled', true)
  if (!enabled) {
    return {
      passed: true, riskLevel: 'low',
      reason: '图片审核已关闭', safeReason: '审核通过',
      provider: 'none', categories: [], hits: [],
    }
  }

  // demo 模式：无 key 时直接通过（降级）
  if (!hasKey) {
    return {
      passed: true, riskLevel: 'low',
      reason: '无审核 Key，跳过图片审核（demo 模式）', safeReason: '审核通过',
      provider: 'none', categories: [], hits: [],
    }
  }

  const providerName = (process.env.MODERATION_PROVIDER as 'aliyun' | 'zhipu') || 'aliyun'

  // 调用服务商图片审核
  const providerResult = await scanAliyunImage(imageUrl)
  if (providerResult && !providerResult.passed) {
    return {
      passed: false,
      riskLevel: 'medium',
      reason: providerResult.reason,
      safeReason: '图片包含违规内容，已被拦截',
      provider: providerName as 'aliyun',
      categories: providerResult.categories,
      hits: providerResult.categories,
    }
  }

  // 通过
  return {
    passed: true, riskLevel: 'low',
    reason: '图片审核通过', safeReason: '审核通过',
    provider: providerName as 'aliyun', categories: [], hits: [],
  }
}

// ==================== 主入口：审核文本 ====================
export async function moderateText(
  text: string,
  opts: { stage: ModerationStage; endpoint: string; userId: string },
): Promise<ModerationResult> {
  const hasKey = !!process.env.MODERATION_API_KEY
  const providerName = (process.env.MODERATION_PROVIDER as 'aliyun' | 'zhipu') || 'aliyun'

  // 0. 审核总开关：关闭时直接通过（应急关闭，仅在审核故障时使用）
  const enabled = await cfgBool('safety.moderation_enabled', true)
  if (!enabled) {
    return {
      passed: true, riskLevel: 'low', reason: '审核已关闭（应急模式）', safeReason: '审核通过',
      provider: 'none', categories: [], hits: [], placeholder: !hasKey,
    }
  }

  // 1. 服务商审核（有 key 时）
  const providerResult = await scanProvider(text)
  if (providerResult && !providerResult.passed) {
    return {
      passed: false,
      riskLevel: 'medium',
      reason: providerResult.reason,
      safeReason: '提示词包含违规内容，请修改后重试',
      provider: providerName,
      categories: providerResult.categories,
      hits: [],
    }
  }

  // 2. 通过
  return {
    passed: true,
    riskLevel: 'low',
    reason: '审核通过',
    safeReason: '审核通过',
    provider: hasKey ? providerName : 'none',
    categories: [],
    hits: [],
    placeholder: !hasKey,
  }
}

// ==================== 记录违规 + 自动风险等级升降级 ====================
export async function recordViolation(opts: {
  userId: string
  stage: ModerationStage
  endpoint: string
  content: string
  result: {
    riskLevel: ModerationRisk
    reason: string
    provider: string
    categories: string[]
    placeholder?: boolean
  }
}): Promise<void> {
  try {
    // 1. 写 ModerationLog（append-only，无 update/delete）
    await prisma.moderationLog.create({
      data: {
        userId: opts.userId,
        stage: opts.stage,
        endpoint: opts.endpoint,
        content: truncate(opts.content, 500),
        result: 'block',
        riskLevel: opts.result.riskLevel,
        reason: truncate(opts.result.reason || '', 500),
        categories: truncate(JSON.stringify(opts.result.categories), 1000),
        provider: opts.result.provider,
        placeholder: opts.result.placeholder ?? false,
      },
    })

    // 2. 自动升降级 riskLevel（基于 violationCount + 本次违规严重度）
    //    规则：
    //      high 违规：1 次升到 2（限制观察期）
    //      medium 违规：2 次升到 1（警告），4 次升到 2
    //      low 违规：3 次升到 1，6 次升到 2
    //    注意：最高只升到 2（限制观察期），不会封禁账号（riskLevel 不会到 3）
    //          违规仅导致本次生成失败并返还积分，不封禁账号
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { riskLevel: true, violationCount: true },
    })
    if (!user) return

    const newCount = user.violationCount + 1
    let newRisk = user.riskLevel

    if (opts.result.riskLevel === 'high') {
      // high 违规：1 次升到 2（限制观察期），不再升级到 3
      newRisk = 2
    } else if (opts.result.riskLevel === 'medium') {
      if (newCount >= 4) newRisk = Math.max(newRisk, 2)
      else if (newCount >= 2) newRisk = Math.max(newRisk, 1)
    } else {
      // low
      if (newCount >= 6) newRisk = Math.max(newRisk, 2)
      else if (newCount >= 3) newRisk = Math.max(newRisk, 1)
    }

    // 封顶：最高 2 级（限制观察期），不封禁账号
    newRisk = Math.min(newRisk, 2)

    await prisma.user.update({
      where: { id: opts.userId },
      data: {
        violationCount: newCount,
        riskLevel: newRisk,
        riskUpdatedAt: new Date(),
      },
    })
  } catch (e) {
    // 审核记录写入失败不应阻断主流程，仅记日志
    logger.error('违规记录写入失败', { error: e instanceof Error ? e.message : String(e) })
  }
}

// ==================== 上传文件审核 ====================
// 审核上传文件的文件名和文本类文件内容
//  - 所有文件：审核 originalname（文件名可能包含违规文字）
//  - 文本文件 (.txt)：额外审核文件内容
// 审核失败时调用方需负责删除已上传的文件

export interface UploadModerationResult {
  passed: boolean
  reason: string       // 内部详细原因
  safeReason: string   // 对外安全提示
  result?: ModerationResult
}

export async function moderateUpload(
  file: Express.Multer.File,
  opts: { endpoint: string; userId: string },
): Promise<UploadModerationResult> {
  const originalName = file.originalname || ''
  const ext = path.extname(originalName).toLowerCase()

  // 1. 审核文件名（所有文件类型都执行）
  const nameResult = await moderateText(originalName, {
    stage: 'input',
    endpoint: `${opts.endpoint}:filename`,
    userId: opts.userId,
  })
  if (!nameResult.passed) {
    await recordViolation({
      userId: opts.userId,
      stage: 'input',
      endpoint: `${opts.endpoint}:filename`,
      content: originalName,
      result: nameResult,
    })
    return {
      passed: false,
      reason: `文件名违规：${nameResult.reason}`,
      safeReason: '文件名包含违规内容',
      result: nameResult,
    }
  }

  // 2. 文本文件：审核文件内容
  const textExtensions = ['.txt', '.md', '.srt', '.vtt', '.lrc', '.csv']
  if (textExtensions.includes(ext)) {
    try {
      const content = await fs.promises.readFile(file.path, 'utf-8')
      // 文本文件只审核前 10KB，避免大文件占用过多资源
      const preview = content.slice(0, 10240)
      const contentResult = await moderateText(preview, {
        stage: 'input',
        endpoint: `${opts.endpoint}:content`,
        userId: opts.userId,
      })
      if (!contentResult.passed) {
        await recordViolation({
          userId: opts.userId,
          stage: 'input',
          endpoint: `${opts.endpoint}:content`,
          content: preview,
          result: contentResult,
        })
        return {
          passed: false,
          reason: `文件内容违规：${contentResult.reason}`,
          safeReason: '文件内容包含违规内容',
          result: contentResult,
        }
      }
    } catch (e) {
      // 文件读取失败不阻断上传（可能是二进制文件误判等），仅记日志
      logger.error('读取上传文件内容失败', { error: (e as Error).message })
    }
  }

  return { passed: true, reason: '审核通过', safeReason: '审核通过' }
}

// 工具：删除上传文件（审核失败时清理磁盘）— 异步非阻塞
export async function cleanupUploadedFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath)
  } catch (e) {
    // 文件不存在或删除失败都不影响主流程
    logger.warn('清理上传文件失败', { filePath, error: (e as Error).message })
  }
}

// ==================== 风险等级门控 ====================
// riskLevel≥3 时拒绝 AI 生成（在 llmRoute 层前置检查）
export async function checkUserRiskGate(userId: string): Promise<{
  allowed: boolean
  riskLevel: number
  message?: string
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { riskLevel: true, violationCount: true, enabled: true },
  })
  if (!user) return { allowed: false, riskLevel: 0, message: '用户不存在' }
  if (!user.enabled) return { allowed: false, riskLevel: 0, message: '账号已被关闭' }
  if (user.riskLevel >= 3) {
    return {
      allowed: false,
      riskLevel: user.riskLevel,
      message: '账号因多次违规已被限制 AI 生成，请联系管理员',
    }
  }
  if (user.riskLevel === 2) {
    // 限制级：允许生成但标记需人工复核（前端可提示）
    return { allowed: true, riskLevel: 2, message: '账号处于限制观察期，生成内容将接受人工复核' }
  }
  return { allowed: user.riskLevel < 3, riskLevel: user.riskLevel }
}

// ==================== 统一输入审核检查 ====================
// 封装「风险门控 → 输入审核 → 违规记录 → 构造拦截响应」的完整流程，
// 消除 image/audio/video/comic/canvas 5 个路由文件中的重复代码（约 80 行/文件）。
//
// 用法：
//   const check = await checkInputModeration({ userId, text: prompt, endpoint: '/api/image/generate' })
//   if (!check.passed) return res.status(check.statusCode).json(check.body)

export interface ModerationCheckPassed {
  passed: true
}

export interface ModerationCheckBlocked {
  passed: false
  statusCode: number
  body: Record<string, unknown>
}

export type ModerationCheckResult = ModerationCheckPassed | ModerationCheckBlocked

export interface CheckInputModerationOpts {
  userId?: string          // 匿名用户传 undefined（仅审核不记违规）
  text: string             // 待审核文本，空字符串/空白直接通过
  endpoint: string         // 接口路径，用于日志
  stage?: ModerationStage  // 默认 'input'
  responseStyle?: 'simple' | 'detailed'
  // simple:    { error: string } — 大多数路由使用
  // detailed:  { ok:false, blocked:true, stage, error, riskLevel } — canvas 风格
}

export async function checkInputModeration(opts: CheckInputModerationOpts): Promise<ModerationCheckResult> {
  const {
    userId,
    text,
    endpoint,
    stage = 'input',
    responseStyle = 'simple',
  } = opts

  // 空白文本：直接通过（某些接口文本是可选的，如 video/img2video）
  if (!text || !text.trim()) {
    return { passed: true }
  }

  // 1) 风险门控（仅登录用户）
  if (userId) {
    const gate = await checkUserRiskGate(userId)
    if (!gate.allowed) {
      const body = responseStyle === 'detailed'
        ? {
            ok: false,
            blocked: true,
            stage,
            error: gate.message || '账号已被限制 AI 生成',
            riskLevel: 'high' as const,
            riskUserLevel: gate.riskLevel,
          }
        : { error: gate.message }
      return { passed: false, statusCode: 403, body }
    }
  }

  // 2) 输入审核
  const mod = await moderateText(text, {
    stage,
    endpoint,
    userId: userId || 'anonymous',
  })

  if (!mod.passed) {
    // 3) 违规记录（仅登录用户）
    if (userId) {
      await recordViolation({
        userId,
        stage,
        endpoint,
        content: text,
        result: mod,
      })
    }

    const body = responseStyle === 'detailed'
      ? {
          ok: false,
          blocked: true,
          stage,
          error: mod.safeReason,
          riskLevel: mod.riskLevel,
        }
      : { error: mod.safeReason }

    return { passed: false, statusCode: 403, body }
  }

  return { passed: true }
}
