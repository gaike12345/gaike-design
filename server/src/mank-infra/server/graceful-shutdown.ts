/**
 * 优雅停机（Graceful Shutdown）
 * ==========================
 *
 * 功能：
 *   - 捕获 SIGTERM / SIGINT 信号，停止接受新请求
 *   - 等待正在处理的请求完成（有超时保护）
 *   - 关闭数据库连接、Redis 连接
 *   - 输出停机日志和统计
 *
 * 使用：在服务启动后调用 setupGracefulShutdown(server)
 */

import type { Server } from 'http'
import prisma from '../database/prisma'
import { closeRedis } from '../cache/redis'
import logger from '../logging/logger'

const GRACEFUL_TIMEOUT_MS = 10_000 // 最多等 10 秒
let isShuttingDown = false

/**
 * 设置优雅停机
 */
export function setupGracefulShutdown(server: Server): void {
  // 防止重复注册
  if (isShuttingDown) return

  const shutdown = async (signal: string) => {
    // 防止重复触发
    if (isShuttingDown) return
    isShuttingDown = true

    logger.info(`收到 ${signal} 信号，开始优雅停机...`)
    const startTime = Date.now()

    // 1. 停止接受新连接
    server.close(() => {
      logger.info('HTTP 服务已停止接受新连接')
    })

    // 2. 超时强制退出保护
    const forceTimeout = setTimeout(() => {
      logger.warn(`优雅停机超时（${GRACEFUL_TIMEOUT_MS}ms），强制退出`)
      process.exit(1)
    }, GRACEFUL_TIMEOUT_MS)
    forceTimeout.unref?.()

    try {
      // 3. 关闭数据库连接
      await prisma.$disconnect()
      logger.info('数据库连接已关闭')

      // 4. 关闭 Redis 连接
      await closeRedis()
      logger.info('Redis 连接已关闭')

      const duration = Date.now() - startTime
      logger.info(`优雅停机完成，耗时 ${duration}ms`)
      clearTimeout(forceTimeout)
      process.exit(0)
    } catch (e) {
      logger.error('优雅停机过程中出错', { error: e })
      clearTimeout(forceTimeout)
      process.exit(1)
    }
  }

  // 监听终止信号
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // 未捕获的异常（兜底）
  process.on('uncaughtException', (err) => {
    logger.error('未捕获的异常', { error: err.message, stack: err.stack })
    // 严重错误立即退出（不优雅停机，防止数据损坏）
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('未处理的 Promise 拒绝', { reason: String(reason) })
    // 未处理的 Promise 拒绝不立即退出，但需要告警
  })

  logger.info('优雅停机已启用')
}

/**
 * 检查是否正在停机中（可用于健康检查返回 503）
 */
export function isShuttingDownStatus(): boolean {
  return isShuttingDown
}

export default setupGracefulShutdown
