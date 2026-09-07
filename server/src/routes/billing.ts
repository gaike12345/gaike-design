import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { authRequired } from '../middleware/auth'
import { getAllSiteConfigs } from '../lib/siteConfig'

const router = Router()

// 会员套餐定义（H3: 默认值，运行时从 SiteConfig 读取，可在管理后台动态调整）
// 标准汇率：1元 = 100积分
const DEFAULT_PLANS = [
  { id: 'free', name: '免费版', price: 0, tokens: 1000, features: ['基础生成', '社区浏览', '每日签到赠积分'] },
  { id: 'pro', name: '专业版', price: 29, tokens: 3000, features: ['优先队列', '高清导出', '无水印', '专属模板'] },
  { id: 'business', name: '商业版', price: 99, tokens: 12000, features: ['专业版全部功能', '商用授权', 'API 接入', '专属客服'] },
  { id: 'enterprise', name: '企业版', price: 299, tokens: 40000, features: ['商业版全部功能', '私有部署', '定制模型', 'SLA 保障'] },
]

// 充值套餐定义（H3: 默认值，运行时从 SiteConfig 读取）
// 标准汇率：1元 = 100积分，充值越多赠送越多
const DEFAULT_RECHARGE_PACKAGES = [
  { id: 'pkg_10', tokens: 900, price: 9, bonus: 100 },
  { id: 'pkg_50', tokens: 3900, price: 39, bonus: 600 },
  { id: 'pkg_100', tokens: 6900, price: 69, bonus: 1600 },
  { id: 'pkg_500', tokens: 29900, price: 299, bonus: 10100 },
]

// H3: 从 SiteConfig 读取计费配置，解析失败或未配置时回退到硬编码默认值
async function getBillingConfig() {
  const { flat } = await getAllSiteConfigs()
  const currency = typeof flat['billing.currency'] === 'string' ? flat['billing.currency'] : 'CNY'
  const period = typeof flat['billing.period'] === 'string' ? flat['billing.period'] : 'month'
  let plans = DEFAULT_PLANS
  let packages = DEFAULT_RECHARGE_PACKAGES
  const rawPlans = flat['billing.plans']
  if (Array.isArray(rawPlans) && rawPlans.length) plans = rawPlans as typeof DEFAULT_PLANS
  const rawPkgs = flat['billing.recharge_packages']
  if (Array.isArray(rawPkgs) && rawPkgs.length) packages = rawPkgs as typeof DEFAULT_RECHARGE_PACKAGES
  return { plans, packages, currency, period }
}

// GET /api/billing/plans — 获取会员套餐列表（公开）
router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { plans, currency, period } = await getBillingConfig()
    res.json({
      placeholder: true,
      plans,
      currency,
      period,
      note: 'MVP 演示定价，生产环境需接入真实计费系统（微信支付 / 支付宝 / Stripe）',
    })
  } catch (e) { next(e) }
})

// GET /api/billing/packages — 获取充值套餐列表（公开）
router.get('/packages', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { packages, currency } = await getBillingConfig()
    res.json({
      placeholder: true,
      packages,
      currency,
      note: 'MVP 演示充值套餐，赠送 token 额度为演示策略，生产环境可动态调整',
    })
  } catch (e) { next(e) }
})

// 以下接口需要登录
router.use(authRequired)

// POST /api/billing/recharge — 创建充值订单
router.post('/recharge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const { packageId, payMethod } = req.body

    const { packages: rechargePackages } = await getBillingConfig()
    const pkg = rechargePackages.find((p) => p.id === packageId)
    if (!pkg) return res.status(400).json({ error: '无效的充值套餐' })

    const order = await prisma.paymentOrder.create({
      data: {
        userId,
        amount: pkg.price,
        tokens: pkg.tokens + (pkg.bonus || 0),
        planId: null,
        status: 'pending',
        payMethod: payMethod || 'alipay',
      },
    })

    // 模拟支付成功（实际应对接支付网关）
    res.json({
      placeholder: true,
      order,
      payUrl: `https://pay.mantv.cn/mock/${order.id}`,
      payMockUrl: `/api/billing/pay/${order.id}`,
      message: '订单已创建（MVP 演示，点击"模拟支付完成"立即到账）',
      note: '生产环境需对接支付宝/微信/Stripe 支付网关并使用签名回调验证',
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/billing/subscribe — 创建/升级会员订阅
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const { planId, payMethod } = req.body

    const { plans } = await getBillingConfig()
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return res.status(400).json({ error: '无效的套餐' })

    if (plan.id === 'free') {
      // 免费版直接更新（额度来自配置的 free 套餐 tokens）
      const freeTokens = plan.tokens
      const quota = await prisma.userQuota.findUnique({ where: { userId } })
      if (quota) {
        await prisma.userQuota.update({
          where: { userId },
          data: {
            planId: 'free',
            totalTokens: freeTokens,
            remainingTokens: freeTokens - quota.usedTokens,
          },
        })
      }
      return res.json({ ok: true, planId: 'free', message: '已切换到免费版', placeholder: true })
    }

    // 付费版创建订单
    const order = await prisma.paymentOrder.create({
      data: {
        userId,
        amount: plan.price,
        tokens: plan.tokens,
        planId,
        status: 'pending',
        payMethod: payMethod || 'alipay',
      },
    })

    res.json({
      placeholder: true,
      order,
      payUrl: `https://pay.mantv.cn/mock/${order.id}`,
      payMockUrl: `/api/billing/pay/${order.id}`,
      message: `订阅 ${plan.name} 订单已创建（MVP 演示，点击"模拟支付完成"立即生效）`,
      note: '生产环境需对接订阅系统（周期性扣费、到期自动降级）',
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/billing/pay/:id — 模拟支付完成（回调接口）
// ⚠️ 安全约束：仅在非生产环境开放，避免用户自助确认订单白嫖额度
// 生产环境必须由支付网关签名回调驱动，禁止前端直接调用本接口
router.post('/pay/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: '生产环境禁止使用模拟支付接口，请对接真实支付网关回调',
      })
    }
    const userId = req.user!.userId
    const orderId = String(req.params.id)

    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
    if (!order) return res.status(404).json({ error: '订单不存在' })
    if (order.userId !== userId) return res.status(403).json({ error: '无权操作' })
    if (order.status !== 'pending') return res.status(400).json({ error: '订单状态不允许支付' })

    // 订单状态置 paid + 用户额度增加 + 订阅记录 三步必须在一个事务里
    // 避免中途失败导致"已支付但额度未到账"
    const expires = new Date()
    // 加一个月，处理月末边界（如 1月31日 + 1月 = 3月3日）→ 统一取下月同日，超出则取月末
    const targetMonth = expires.getMonth() + 1
    expires.setMonth(targetMonth)

    await prisma.$transaction(async (tx) => {
      // 1) 订单状态置 paid
      await tx.paymentOrder.update({
        where: { id: orderId },
        data: { status: 'paid', paidAt: new Date(), tradeNo: `MOCK_${Date.now()}` },
      })

      // 2) 增加用户额度（原子 increment，避免读改写竞态）
      const updateData: {
        totalTokens: { increment: number }
        remainingTokens: { increment: number }
        planId?: string
      } = {
        totalTokens: { increment: order.tokens },
        remainingTokens: { increment: order.tokens },
      }
      if (order.planId) updateData.planId = order.planId

      await tx.userQuota.update({
        where: { userId },
        data: updateData,
      })

      // 3) 订阅计划：创建或续期 Subscription
      if (order.planId && order.planId !== 'free') {
        const existing = await tx.subscription.findFirst({
          where: { userId, planId: order.planId, status: 'active' },
        })
        if (!existing) {
          await tx.subscription.create({
            data: {
              planId: order.planId,
              status: 'active',
              userId,
              expiresAt: expires,
            },
          })
        } else {
          await tx.subscription.update({
            where: { id: existing.id },
            data: { status: 'active', expiresAt: expires },
          })
        }
      }
    })

    res.json({
      placeholder: true,
      ok: true,
      message: '模拟支付成功，额度已到账（生产环境请使用真实支付网关回调）',
    })
  } catch (e) {
    next(e)
  }
})

// GET /api/billing/orders — 当前用户订单列表
router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const status = String(req.query.status || '')
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: { userId: string; status?: string } = { userId }
    if (status) where.status = status

    const [orders, total] = await Promise.all([
      prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.paymentOrder.count({ where }),
    ])

    res.json({
      placeholder: true,
      orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (e) {
    next(e)
  }
})

export default router