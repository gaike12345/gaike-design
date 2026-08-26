import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { authRequired } from '../middleware/auth'

const router = Router()

// 会员套餐定义
const PLANS = [
  { id: 'free', name: '免费版', price: 0, tokens: 100000, features: ['基础生成', '社区浏览', '每日 100 次调用'] },
  { id: 'pro', name: '专业版', price: 29, tokens: 500000, features: ['无限生成', '优先队列', '高清导出', '无水印'] },
  { id: 'business', name: '商业版', price: 99, tokens: 2000000, features: ['专业版全部功能', '商用授权', 'API 接入', '专属客服'] },
  { id: 'enterprise', name: '企业版', price: 299, tokens: 10000000, features: ['商业版全部功能', '私有部署', '定制模型', 'SLA 保障'] },
]

// 充值套餐定义
const RECHARGE_PACKAGES = [
  { id: 'pkg_10', tokens: 100000, price: 9, bonus: 0 },
  { id: 'pkg_50', tokens: 500000, price: 39, bonus: 50000 },
  { id: 'pkg_100', tokens: 1000000, price: 69, bonus: 150000 },
  { id: 'pkg_500', tokens: 5000000, price: 299, bonus: 1000000 },
]

// GET /api/billing/plans — 获取会员套餐列表（公开）
router.get('/plans', (_req: Request, res: Response) => {
  res.json({ plans: PLANS })
})

// GET /api/billing/packages — 获取充值套餐列表（公开）
router.get('/packages', (_req: Request, res: Response) => {
  res.json({ packages: RECHARGE_PACKAGES })
})

// 以下接口需要登录
router.use(authRequired)

// POST /api/billing/recharge — 创建充值订单
router.post('/recharge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const { packageId, payMethod } = req.body

    const pkg = RECHARGE_PACKAGES.find((p) => p.id === packageId)
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
      order,
      payUrl: `https://pay.manktv.com/mock/${order.id}`,
      message: '订单已创建，请完成支付',
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

    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) return res.status(400).json({ error: '无效的套餐' })

    if (plan.id === 'free') {
      // 免费版直接更新
      const quota = await prisma.userQuota.findUnique({ where: { userId } })
      if (quota) {
        await prisma.userQuota.update({
          where: { userId },
          data: {
            planId: 'free',
            totalTokens: 100000,
            remainingTokens: 100000 - quota.usedTokens,
          },
        })
      }
      return res.json({ ok: true, planId: 'free', message: '已切换到免费版' })
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
      order,
      payUrl: `https://pay.manktv.com/mock/${order.id}`,
      message: `订阅 ${plan.name} 订单已创建`,
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/billing/pay/:id — 模拟支付完成（回调接口）
router.post('/pay/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const orderId = String(req.params.id)

    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
    if (!order) return res.status(404).json({ error: '订单不存在' })
    if (order.userId !== userId) return res.status(403).json({ error: '无权操作' })
    if (order.status !== 'pending') return res.status(400).json({ error: '订单状态不允许支付' })

    // 更新订单状态
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { status: 'paid', paidAt: new Date(), tradeNo: `MOCK_${Date.now()}` },
    })

    // 增加用户额度
    const quota = await prisma.userQuota.findUnique({ where: { userId } })
    if (quota) {
      const newTotal = quota.totalTokens + order.tokens
      const newRemaining = quota.remainingTokens + order.tokens
      const updateData: {
        totalTokens: number
        remainingTokens: number
        planId?: string
      } = { totalTokens: newTotal, remainingTokens: newRemaining }

      if (order.planId) {
        updateData.planId = order.planId
      }

      await prisma.userQuota.update({
        where: { userId },
        data: updateData,
      })
    }

    res.json({ ok: true, message: '支付成功，额度已到账' })
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
