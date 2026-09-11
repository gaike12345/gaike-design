import { PrismaClient } from '@prisma/client'

// Prisma 客户端单例 — 开发模式下 tsx watch 会热重载导致多次 new PrismaClient
// 利用 globalThis 缓存实例，避免 SQLite 连接泄漏（Best Practice per Prisma 文档）
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

const prisma = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'production'
    ? ['error']
    : ['warn', 'error'],
})

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma

export default prisma
