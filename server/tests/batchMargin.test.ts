/**
 * PATCH /api/models/batch-margin — 全局毛利率批量设置 单元测试
 *
 * 覆盖：
 *   1. 参数验证：margin 缺失 / 非数字 / < 0 → 400
 *   2. 无匹配模型 → 404
 *   3. 正常批量更新：margin 变更 + costTokens 自动联动重算
 *   4. providerFilter 过滤生效
 *   5. cache 失效 invalidateModelCostCache 被调用
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express, { Request, Response } from 'express'
import request from 'supertest'

// -----------------------------
// vi.hoisted: 在所有 import 之前初始化 mock
// -----------------------------
const {
  mockPrisma,
  mockAuthRequired,
  mockRequireAdminOrAbove,
  mockInvalidateCache,
} = vi.hoisted(() => ({
  mockPrisma: {
    aIModel: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  mockAuthRequired: vi.fn((req: Request, _res: Response, next: any) => {
    ;(req as any).user = { userId: 'admin-1', role: 'admin' }
    next()
  }),
  mockRequireAdminOrAbove: vi.fn((_req: Request, _res: Response, next: any) => next()),
  mockInvalidateCache: vi.fn(),
}))

vi.mock('../src/mank-infra/database/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/mank-infra/logging/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}))
vi.mock('../src/mank-core/billing/modelCost', () => ({
  invalidateModelCostCache: mockInvalidateCache,
}))
// auth 中间件 mock — 路径必须匹配 route 文件 import: ../../mank-infra/middleware/auth
vi.mock('../src/mank-infra/middleware/auth', () => ({
  authRequired: mockAuthRequired,
  authOptional: (_req: any, _res: any, next: any) => next(),
  requireRole: (_roles: any[]) => (_req: any, _res: any, next: any) => next(),
  requireAdminOrAbove: mockRequireAdminOrAbove,
}))

// 最后才 import route — 所有 vi.mock 必须先声明
import modelsRouter from '../src/mank-core/models/models.route'

// -----------------------------
// 构造 express app
// -----------------------------
const app = express()
app.use(express.json())
app.use('/api', modelsRouter)

describe('PATCH /api/models/batch-margin — 全局毛利率批量设置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- 参数验证 ----
  describe('参数验证', () => {
    it('margin 缺失 → 400', async () => {
      const res = await request(app).patch('/api/models/batch-margin').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/margin/)
    })

    it('margin 非数字 → 400', async () => {
      const res = await request(app)
        .patch('/api/models/batch-margin')
        .send({ margin: 'abc' })
      expect(res.status).toBe(400)
    })

    it('margin < 0 → 400', async () => {
      const res = await request(app)
        .patch('/api/models/batch-margin')
        .send({ margin: -1 })
      expect(res.status).toBe(400)
    })
  })

  // ---- 无匹配 ----
  it('无匹配模型 → 404', async () => {
    mockPrisma.aIModel.findMany.mockResolvedValue([])
    const res = await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 50, providerFilter: 'nonexistent' })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/没有匹配的模型/)
  })

  // ---- 正常批量 ----
  it('正常批量更新: margin=0 → margin=50，costTokens 自动联动', async () => {
    // DB mock: 2 个模型，都是 margin=0
    mockPrisma.aIModel.findMany.mockResolvedValue([
      { id: 'm1', name: 'wan-2.6', costTokens: 5, margin: 0, provider: { name: 'pollinations-video' } },
      { id: 'm2', name: 'flux.2-flex', costTokens: 1, margin: 0, provider: { name: 'pollinations' } },
    ])
    mockPrisma.aIModel.update.mockResolvedValue({})

    const res = await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 50 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.total).toBe(2)
    expect(res.body.updated).toBe(2)
    expect(res.body.skipped).toBe(0)

    // 验证 costTokens 联动公式:
    // wan-2.6: baseTokens = 5/(1+0/100) = 5 → newCost = ceil(5 * 1.5) = 8
    // flux.2-flex: baseTokens = 1/1 = 1 → newCost = ceil(1 * 1.5) = 2
    const updateCalls = mockPrisma.aIModel.update.mock.calls
    expect(updateCalls).toHaveLength(2)

    // wan-2.6 更新
    expect(updateCalls[0][0].where.id).toBe('m1')
    expect(updateCalls[0][0].data.margin).toBe(50)
    expect(updateCalls[0][0].data.costTokens).toBe(8)  // ceil(5 × 1.5) = 8

    // flux.2-flex 更新
    expect(updateCalls[1][0].where.id).toBe('m2')
    expect(updateCalls[1][0].data.margin).toBe(50)
    expect(updateCalls[1][0].data.costTokens).toBe(2)  // ceil(1 × 1.5) = 2

    // 验证 cache 失效
    expect(mockInvalidateCache).toHaveBeenCalled()
  })

  // ---- providerFilter 过滤 ----
  it('providerFilter 只更新指定 provider 的模型', async () => {
    mockPrisma.aIModel.findMany.mockResolvedValue([
      { id: 'm1', name: 'wan-2.6', costTokens: 5, margin: 0, provider: { name: 'pollinations-video' } },
    ])
    mockPrisma.aIModel.update.mockResolvedValue({})

    await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 50, providerFilter: 'pollinations-video' })

    // 验证 where provider filter 生效
    const whereArg = mockPrisma.aIModel.findMany.mock.calls[0][0].where
    expect(whereArg.provider.name).toBe('pollinations-video')
    expect(mockPrisma.aIModel.update).toHaveBeenCalledTimes(1)
  })

  // ---- 跳过已匹配 ----
  it('margin 已经是目标值 → 跳过 (skipped)', async () => {
    mockPrisma.aIModel.findMany.mockResolvedValue([
      { id: 'm1', name: 'model-a', costTokens: 8, margin: 50, provider: { name: 'pollinations' } },
    ])

    const res = await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 50 })

    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(0)
    expect(res.body.skipped).toBe(1)
    expect(mockPrisma.aIModel.update).not.toHaveBeenCalled()
    // cache 失效即使 skipped 也调用（因为可能之前有更新）
    expect(mockInvalidateCache).toHaveBeenCalled()
  })

  // ---- 边缘：极小 costTokens + 大 margin ----
  it('极小 costTokens(1) + margin=1000 → 至少保持 1', async () => {
    mockPrisma.aIModel.findMany.mockResolvedValue([
      { id: 'm1', name: 'tiny', costTokens: 1, margin: 0, provider: { name: 'pollinations' } },
    ])
    mockPrisma.aIModel.update.mockResolvedValue({})

    await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 1000 })

    const newCost = mockPrisma.aIModel.update.mock.calls[0][0].data.costTokens
    // baseTokens = max(1, round(1/1)) = 1; newCost = ceil(1 × (1+1000/100)) = ceil(11) = 11
    expect(newCost).toBe(11)
  })

  // ---- 中间件链 ----
  it('authRequired 和 requireAdminOrAbove 中间件都被调用', async () => {
    mockPrisma.aIModel.findMany.mockResolvedValue([])
    await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 50 })

    expect(mockAuthRequired).toHaveBeenCalled()
    expect(mockRequireAdminOrAbove).toHaveBeenCalled()
  })

  // ---- 从非零 margin 改到另一个值 ----
  it('已有 margin=50 改为 margin=100: 从售价反推 baseTokens', async () => {
    // costTokens=15, margin=50 → baseTokens = round(15/1.5) = 10
    // 新 costTokens = ceil(10 × (1+100/100)) = ceil(20) = 20
    mockPrisma.aIModel.findMany.mockResolvedValue([
      { id: 'm1', name: 'm', costTokens: 15, margin: 50, provider: { name: 'pollinations' } },
    ])
    mockPrisma.aIModel.update.mockResolvedValue({})

    await request(app)
      .patch('/api/models/batch-margin')
      .send({ margin: 100 })

    const { margin: newMargin, costTokens: newCost } = mockPrisma.aIModel.update.mock.calls[0][0].data
    expect(newMargin).toBe(100)
    expect(newCost).toBe(20)
  })
})
