/**
 * Redis 连接服务
 * =============
 *
 * 功能：
 *   - 统一 Redis 连接管理（单例模式）
 *   - 自动重连 + 指数退避
 *   - 连接状态监听（可用于健康检查）
 *   - 未配置 Redis 时返回 null，上层自动降级
 *
 * 环境变量：
 *   REDIS_URL         Redis 连接串（如 redis://:password@host:6379/0）
 *   REDIS_HOST        主机（默认 localhost）
 *   REDIS_PORT        端口（默认 6379）
 *   REDIS_PASSWORD    密码（可选）
 *   REDIS_DB          数据库编号（默认 0）
 */

import Redis, { RedisOptions } from 'ioredis'
import logger from './logger'

let redisInstance: Redis | null = null
let isConnecting = false

/**
 * 获取 Redis 实例（懒加载，单例）
 * 未配置 Redis 时返回 null，调用方应自动降级
 */
export function getRedis(): Redis | null {
  if (redisInstance) return redisInstance
  if (isConnecting) return null

  const url = process.env.REDIS_URL
  const host = process.env.REDIS_HOST
  const port = process.env.REDIS_PORT
  const password = process.env.REDIS_PASSWORD
  const db = process.env.REDIS_DB

  // 没有任何 Redis 配置 → 返回 null（降级模式）
  if (!url && !host) return null

  isConnecting = true

  try {
    const options: RedisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times: number) {
        // 指数退避：100ms → 200ms → 400ms → ... → 最大 30s
        const delay = Math.min(times * 100, 30000)
        logger.warn('Redis 连接重试', { attempt: times, delayMs: delay })
        return delay
      },
      reconnectOnError(err: Error) {
        // 只读错误触发重连
        if (err.message.includes('READONLY')) return true
        return false
      },
    }

    if (url) {
      redisInstance = new Redis(url, options)
    } else {
      redisInstance = new Redis({
        host: host || 'localhost',
        port: parseInt(port || '6379', 10),
        password: password || undefined,
        db: parseInt(db || '0', 10),
        ...options,
      })
    }

    // 连接事件监听
    redisInstance.on('connect', () => {
      logger.info('Redis 连接中')
    })

    redisInstance.on('ready', () => {
      logger.info('Redis 连接就绪，队列服务可用')
    })

    redisInstance.on('error', (err: Error) => {
      logger.error('Redis 连接错误', { error: err.message })
    })

    redisInstance.on('close', () => {
      logger.warn('Redis 连接已关闭')
    })

    // 异步发起连接（不阻塞主进程）
    redisInstance.connect().catch((err: Error) => {
      logger.error('Redis 初始连接失败，使用降级模式', { error: err.message })
      // 连接失败时置空，让上层走内存队列
      redisInstance = null
      isConnecting = false
    })

    // 连接成功后标记
    redisInstance.once('ready', () => {
      isConnecting = false
    })

    return redisInstance
  } catch (e: any) {
    logger.error('Redis 初始化失败', { error: e.message })
    redisInstance = null
    isConnecting = false
    return null
  }
}

/**
 * 检查 Redis 是否可用（就绪状态）
 */
export function isRedisReady(): boolean {
  if (!redisInstance) return false
  return redisInstance.status === 'ready'
}

/**
 * 关闭 Redis 连接（用于优雅停机）
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit()
    redisInstance = null
    isConnecting = false
    logger.info('Redis 连接已关闭')
  }
}

export default getRedis
