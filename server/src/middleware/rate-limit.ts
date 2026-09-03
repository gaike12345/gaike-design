import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import type { Request, Response, NextFunction } from 'express'
import { cfgNum } from '../lib/siteConfig'
import { getRedis, isRedisReady } from '../lib/redis'

// ============================================================
// 动态限流：管理员在管理后台改配置后，本模块会每 CACHE_REFRESH_MS
// 重新读取 SiteConfig，无需重启进程。
//
// 分布式限流：配置 Redis 时自动使用 RedisStore，多实例共享计数；
//             未配置 Redis 时降级为内存限流（单实例）。
// ============================================================
const CACHE_REFRESH_MS = 60 * 1000
const DEFAULTS = {
  auth: 30, llm: 30, image: 20, audio: 20, video: 5,
}

let cacheStamp = 0
let cache: typeof DEFAULTS = { ...DEFAULTS }
async function readLimits(): Promise<typeof DEFAULTS> {
  const now = Date.now()
  if (cacheStamp && now - cacheStamp < CACHE_REFRESH_MS) return cache
  const [auth, llm, image, audio, video] = await Promise.all([
    cfgNum('rl.auth_per_min_per_ip', DEFAULTS.auth),
    cfgNum('rl.llm_per_min_per_user', DEFAULTS.llm),
    cfgNum('rl.image_per_min_per_user', DEFAULTS.image),
    cfgNum('rl.audio_per_min_per_user', DEFAULTS.audio),
    cfgNum('rl.video_per_min_per_user', DEFAULTS.video),
  ])
  cache = { auth, llm, image, audio, video }
  cacheStamp = now
  return cache
}

// ============== 获取限流 Store（Redis 优先，内存兜底） ==============
function getStore(prefix: string) {
  const redis = getRedis()
  if (redis && isRedisReady()) {
    return new RedisStore({
      // @ts-ignore rate-limit-redis 的 sendCommand 签名兼容
      sendCommand: (...args: string[]) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    })
  }
  // 内存模式：不指定 store，使用默认的 MemoryStore
  return undefined
}

// ============== IP 归一化 ==============
function normalizeIp(req: Request): string {
  const xff = req.headers['x-forwarded-for']
  const rawIp = typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined
  let ip = rawIp || req.ip || (req.socket as any)?.remoteAddress || 'unknown'
  if (ip.includes(':')) {
    const doubleColon = ip.indexOf('::')
    if (doubleColon !== -1) {
      const head = ip.slice(0, doubleColon).split(':').filter(Boolean).slice(0, 4)
      ip = head.join(':') + '::'
    } else {
      const segs = ip.split(':').filter(Boolean).slice(0, 4)
      ip = segs.join(':') + '::'
    }
  }
  return ip === '::1' ? '127.0.0.1' : ip
}

// ============== authLimiter：登录/注册 IP 限流 ==============
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  async max(_req: Request) { return (await readLimits()).auth },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore('auth'),
  message: {
    ok: false,
    error: '请求过于频繁，请稍后再试',
    code: 'RATE_LIMITED',
    retryAfterMs: 60000,
  },
})

// ============== AI 限流：按用户/IP + 接口路径 ==============
function createAiLimiter(key: 'llm' | 'image' | 'audio' | 'video') {
  return rateLimit({
    windowMs: 60 * 1000,
    async max(_req) { return (await readLimits())[key] },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    store: getStore(key),
    keyGenerator(req: Request): string {
      const userId = (req as any).user?.userId
      if (userId) return `${req.path}:${userId}`
      return `${req.path}:${normalizeIp(req)}`
    },
    message: {
      ok: false,
      error: `该接口限流，请稍后再试`,
      code: 'AI_RATE_LIMITED',
      retryAfterMs: 60 * 1000,
    },
  })
}

export const novelLimiter = createAiLimiter('llm')
export const imageLimiter = createAiLimiter('image')
export const audioLimiter = createAiLimiter('audio')
export const videoLimiter = createAiLimiter('video')

// ============== 错误处理 ==============
export function rateLimitErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err && err.statusCode === 429) {
    return res.status(429).json({
      ok: false,
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMITED',
      retryAfterMs: parseInt(err.headers?.['Retry-After'] || '60', 10) * 1000,
    })
  }
  next(err)
}

// ============== 当前限流模式（供健康检查/监控使用） ==============
export function getRateLimitMode(): 'redis' | 'memory' {
  return isRedisReady() ? 'redis' : 'memory'
}
