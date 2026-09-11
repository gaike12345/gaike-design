// 客服助手路由 — AI 驱动的在线客服
// 复用 LLM 供应商抽象层，未配置 API Key 时返回兜底回复
import { Router } from 'express'
import { callLlm } from '../llm/llmProvider'
import { moderateText, recordViolation } from '../moderation/moderation'
import { authOptional } from '../../mank-infra/middleware/auth'
import { authLimiter } from '../../mank-infra/middleware/rate-limit'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// 系统提示词 — 客服人设 + 平台知识
const SYSTEM_PROMPT = `你是「Man TV AI 漫剧圈」平台的智能客服助手，名叫小漫。
你的职责：
1. 解答用户关于平台功能的问题，包括：小说写作、图像创作、音频创作、视频创作、漫画创作、社区广场、会员充值等模块的使用方法。
2. 帮助用户排查常见问题（登录失败、生成报错、Token 不足、支付问题等）。
3. 引导用户前往对应的功能页面或联系人工客服。

平台信息：
- 首页：/  |  登录：/login  |  个人中心：/settings  |  定价：/pricing
- 写作工作区：/workspace/writing  |  图像工作区：/workspace/image
- 音频工作区：/workspace/audio  |  视频工作区：/workspace/video
- 漫画工作区：/workspace/comic  |  社区广场：/workspace/community
- 管理后台：/admin（仅管理员）

回答要求：
- 语气亲切、简洁明了，每次回复不超过 200 字
- 如果用户问的不是平台相关问题，礼貌引导回平台功能
- 不清楚的问题建议用户联系人工客服：13372729368@163.com`

// POST /api/support/chat — 发送消息，获取 AI 回复
/**
 * @openapi
 * /support/chat:
 *   post:
 *     tags: [客服助手]
 *     summary: 发送客服消息
 *     description: 发送消息给 AI 客服，获取智能回复（登录或匿名均可，输入输出经内容审核）
 *     security: [{ BearerAuth: [] }, []]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 description: 用户消息内容
 *                 example: "如何开始创作？"
 *               history:
 *                 type: array
 *                 description: 对话历史（最多取最近 6 条）
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: 客服回复
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                   description: AI 回复内容
 *                   example: "登录后点击顶部导航栏的「开始创作」即可进入工作区。"
 *                 placeholder:
 *                   type: boolean
 *                   description: 是否为兜底回复（LLM 未配置时为 true）
 *                   example: false
 *       400:
 *         description: 消息不能为空
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: 内容审核未通过（输入或输出包含违规内容）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 blocked:
 *                   type: boolean
 *                   example: true
 *                 stage:
 *                   type: string
 *                   enum: [input, output]
 *                 error:
 *                   type: string
 *                 riskLevel:
 *                   type: string
 */
router.post('/chat', authLimiter, authOptional, async (req, res, next) => {
  logger.info('CTRL_SUPPORT_CHAT_POST', { userId: req.user?.userId })
  try {
    const { message, history } = req.body as {
      message?: string
      history?: { role: 'user' | 'assistant'; content: string }[]
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' })
    }

    // 拼接历史上下文（最多取最近 6 条，控制 token）
    const recentHistory = Array.isArray(history) ? history.slice(-6) : []
    const contextPrompt = recentHistory
      .map((m) => `${m.role === 'user' ? '用户' : '客服'}：${m.content}`)
      .join('\n')

    const userPrompt = contextPrompt
      ? `${contextPrompt}\n用户：${message}`
      : message

    const userId = req.user?.userId

    // 输入审核
    const inputMod = await moderateText(message, {
      stage: 'input',
      endpoint: '/api/support/chat',
      userId: userId || 'anonymous',
    })
    if (!inputMod.passed) {
      if (userId) {
        await recordViolation({ userId, stage: 'input', endpoint: '/api/support/chat', content: message, result: inputMod })
      }
      return res.status(403).json({
        ok: false, blocked: true, stage: 'input',
        error: inputMod.safeReason,
        riskLevel: inputMod.riskLevel,
      })
    }

    const reply = await callLlm(SYSTEM_PROMPT, userPrompt)

    // 输出审核
    const outputMod = await moderateText(reply, {
      stage: 'output',
      endpoint: '/api/support/chat',
      userId: userId || 'anonymous',
    })
    if (!outputMod.passed) {
      if (userId) {
        await recordViolation({ userId, stage: 'output', endpoint: '/api/support/chat', content: reply.slice(0, 500), result: outputMod })
      }
      return res.status(403).json({
        ok: false, blocked: true, stage: 'output',
        error: '回复包含违规内容，已拦截',
        riskLevel: outputMod.riskLevel,
      })
    }

    res.json({
      reply,
      placeholder: reply.includes('LLM 未配置 API Key'),
    })
  } catch (e) {
    next(e)
  }
})

// GET /api/support/faq — 常见问题快捷列表（静态，不走 LLM）
/**
 * @openapi
 * /support/faq:
 *   get:
 *     tags: [客服助手]
 *     summary: 获取常见问题列表
 *     description: 获取静态常见问题列表（不走 LLM，公开接口）
 *     security: []
 *     responses:
 *       200:
 *         description: 常见问题列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 faqs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "1"
 *                       q:
 *                         type: string
 *                         description: 问题
 *                         example: "如何开始创作？"
 *                       a:
 *                         type: string
 *                         description: 回答
 *                         example: "登录后点击顶部导航栏的「开始创作」，选择你想使用的创作板块即可进入工作区。"
 */
router.get('/faq', (_req, res) => {
  logger.info('CTRL_SUPPORT_FAQ_GET', {})
  res.json({
    faqs: [
      { id: '1', q: '如何开始创作？', a: '登录后点击顶部导航栏的「开始创作」，选择你想使用的创作板块即可进入工作区。' },
      { id: '2', q: 'Token 用完了怎么办？', a: '前往「个人中心 → 充值中心」购买 Token 套餐，或升级会员获取更多额度。' },
      { id: '3', q: '生成的作品在哪里查看？', a: '在对应板块的工作区中可以查看历史作品，也可以发布到社区广场与他人分享。' },
      { id: '4', q: '支持哪些 AI 模型？', a: '写作支持 GLM-4、通义千问等；图像支持 SDXL；音频支持 TTS；视频支持 Seedance、可灵等。' },
      { id: '5', q: '忘记密码怎么办？', a: '请联系人工客服 13372729368@163.com 协助重置密码。' },
      { id: '6', q: '如何发布作品到社区？', a: '在工作区点击「发布到广场」按钮，填写标题和内容即可发布到社区广场。' },
    ],
  })
})

export default router
