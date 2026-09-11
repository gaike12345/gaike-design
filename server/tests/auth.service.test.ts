/**
 * Auth Service 单元测试
 * 规范：AI开发规范.prompt.md 第七章
 * 覆盖：loginByUid 异常分类（AuthError/ForbiddenError）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import prisma from '../src/mank-infra/database/prisma'
import { AuthError, ForbiddenError } from '../src/mank-common/errors'
import { loginByUid } from '../src/mank-core/auth/auth.service'

// Mock prisma
vi.mock('../src/mank-infra/database/prisma', () => ({
  default: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    userQuota: { create: vi.fn() },
  },
}))

// Mock logger
vi.mock('../src/mank-infra/logging/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock jwt signToken（避免依赖真实 JWT_SECRET）
vi.mock('../src/mank-common/utils/jwt', () => ({
  signToken: vi.fn(() => 'mock-token'),
}))

// Mock config
vi.mock('../src/mank-infra/config/siteConfig', () => ({
  cfgNum: vi.fn(() => 1000),
}))

// Mock uidGenerator
vi.mock('../src/mank-core/auth/uidGenerator', () => ({
  generateNextUid: vi.fn(() => Promise.resolve(100001)),
}))

// Mock bcryptjs（工厂内定义 vi.fn，避免 hoisting 引用问题）
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn(() => 'hashed') },
}))

describe('AuthService - loginByUid', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should throw AuthError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(loginByUid(999999, 'password')).rejects.toThrow(AuthError)
  })

  it('should throw AuthError when password is not set on account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', uid: 100001, email: 'test@local',
      password: null, enabled: true, role: 'user', nickname: 'test', avatar: null,
    } as any)

    await expect(loginByUid(100001, 'password')).rejects.toThrow(AuthError)
  })

  it('should throw AuthError when password is incorrect', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', uid: 100001, email: 'test@local',
      password: '$2a$10$hashedpassword', enabled: true, role: 'user', nickname: 'test', avatar: null,
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(false)

    await expect(loginByUid(100001, 'wrong-password')).rejects.toThrow(AuthError)
  })

  it('should throw ForbiddenError when account is disabled', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', uid: 100001, email: 'test@local',
      password: '$2a$10$hashedpassword', enabled: false, role: 'user', nickname: 'test', avatar: null,
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(true)

    await expect(loginByUid(100001, 'correct-password')).rejects.toThrow(ForbiddenError)
  })
})
