/**
 * AdminUsers Service 单元测试
 * 规范：AI开发规范.prompt.md 第七章
 * 覆盖：getUserDetail 权限校验 + 异常分类
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import prisma from '../src/mank-infra/database/prisma'
import {
  NotFoundError,
  ForbiddenError,
} from '../src/mank-common/errors'
import { getUserDetail } from '../src/mank-core/admin/adminUsers.service'

// Mock prisma
vi.mock('../src/mank-infra/database/prisma', () => ({
  default: {
    user: { findUnique: vi.fn() },
    userQuota: { findUnique: vi.fn() },
    generationLog: { findMany: vi.fn(), aggregate: vi.fn() },
    userTask: { findMany: vi.fn() },
  },
}))

// Mock logger（避免日志输出干扰测试）
vi.mock('../src/mank-infra/logging/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock jwt（避免触发 JWT_SECRET 校验导致 process.exit）
vi.mock('../src/mank-common/utils/jwt', () => ({
  signToken: vi.fn(() => 'mock-token'),
  verifyToken: vi.fn(() => ({ userId: 'mock' })),
}))

// Mock auth middleware（避免间接 import jwt.ts）
vi.mock('../src/mank-infra/middleware/auth', () => ({
  isStrictlyAbove: vi.fn(() => false),
  roleAssignableBy: vi.fn(() => ({ ok: true })),
  preventSuperadminSelfDemotion: vi.fn(() => ({ ok: true })),
  UNIQUE_SUPERADMIN_EMAIL: 'admin@manktv.com',
  canSeeRole: vi.fn((operator, target) => {
    // admin 可见 user，不可见 superadmin
    if (operator === 'superadmin') return true
    if (target === 'superadmin') return false
    return true
  }),
}))

// Mock tokenService（避免间接 import 链）
vi.mock('../src/mank-core/billing/tokenService', () => ({
  addTokens: vi.fn(),
}))

// Mock siteConfig
vi.mock('../src/mank-infra/config/siteConfig', () => ({
  cfgNum: vi.fn(() => 1000),
}))

// Mock uidGenerator
vi.mock('../src/lib/uidGenerator', () => ({
  generateNextUid: vi.fn(() => Promise.resolve(100001)),
}))

describe('AdminUsersService - getUserDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should throw NotFoundError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(getUserDetail('admin', 'nonexistent-id')).rejects.toThrow(NotFoundError)
  })

  it('should throw ForbiddenError when operator role cannot see target role', async () => {
    // 第一次 findUnique 返回 target 的 role（superadmin），操作者是 admin
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: 'superadmin' } as any)

    await expect(getUserDetail('admin', 'target-id')).rejects.toThrow(ForbiddenError)
  })

  it('should return user detail when operator has permission', async () => {
    // 第一次：查 target 的 role（user），admin 可见
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: 'user' } as any)
    // 第二次：查 user 详情
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'target-id',
      email: 'test@example.com',
      nickname: 'testuser',
      avatar: null,
      bio: null,
      role: 'user',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { works: 0, comments: 0, likes: 0 },
    } as any)
    // 其余 Promise.all 中的查询
    vi.mocked(prisma.userQuota.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.generationLog.findMany).mockResolvedValue([])
    vi.mocked(prisma.userTask.findMany).mockResolvedValue([])
    vi.mocked(prisma.generationLog.aggregate).mockResolvedValue({ _sum: { tokensUsed: 0 }, _count: { _all: 0 } } as any)

    const result = await getUserDetail('admin', 'target-id')

    expect(result.user.id).toBe('target-id')
    expect(result.user.email).toBe('test@example.com')
  })
})
