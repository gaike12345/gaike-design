/**
 * 结构化日志工具
 * ==============
 *
 * 功能：
 *   - 统一日志格式（JSON / 可读文本，根据环境切换）
 *   - 自动脱敏：密码、Token、邮箱、手机号、身份证号等
 *   - 请求 ID 透传：每次请求一个 traceId，方便链路追踪
 *   - 日志级别控制：error > warn > info > debug
 *
 * 使用方式：
 *   import { logger } from '../lib/logger'
 *   logger.info('用户登录', { userId: 'xxx', email: 'xxx' })
 *   logger.warn('限流触发', { ip: 'xxx', path: '/api/xxx' })
 *   logger.error('数据库错误', { error: err.message, stack: err.stack })
 */

// ========== 日志级别 ==========
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'
const isJsonLog = process.env.NODE_ENV === 'production'
const isDebug = LOG_LEVELS[currentLevel] >= LOG_LEVELS.debug

// ========== 脱敏规则 ==========
const SENSITIVE_KEYS = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'authorization',
  'apiKey', 'api_key', 'accessKey', 'access_key', 'privateKey', 'private_key',
  'jwt', 'cookie', 'session',
]

const SENSITIVE_PATTERNS = [
  // 邮箱
  { regex: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replace: (m: string, p1: string, p2: string) => `${p1.slice(0, 2)}***@${p2}` },
  // 手机号（中国大陆）
  { regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g, replace: (m: string) => m.slice(0, 3) + '****' + m.slice(7) },
  // 身份证号
  { regex: /(?<!\d)\d{17}[\dXx](?!\d)/g, replace: (m: string) => m.slice(0, 6) + '********' + m.slice(14) },
  // 银行卡号
  { regex: /(?<!\d)\d{16,19}(?!\d)/g, replace: (m: string) => m.slice(0, 4) + ' **** **** ' + m.slice(-4) },
  // JWT Token
  { regex: /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, replace: () => 'Bearer ***' },
  // Authorization Basic
  { regex: /Basic\s+[A-Za-z0-9+/=]+/gi, replace: () => 'Basic ***' },
]

/**
 * 递归脱敏对象中的敏感字段
 */
function redactValue(value: any, depth = 0): any {
  if (depth > 10) return '[Object]' // 防止循环引用

  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    let result = value
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern.regex, pattern.replace as any)
    }
    return result
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1))
  }

  if (typeof value === 'object') {
    // Error 对象特殊处理
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: isDebug ? value.stack : undefined,
      }
    }

    const result: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase()
      if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k.toLowerCase()))) {
        result[key] = '***'
      } else {
        result[key] = redactValue(val, depth + 1)
      }
    }
    return result
  }

  return value
}

// ========== 日志类 ==========

class Logger {
  private prefix = ''

  constructor(prefix = '') {
    this.prefix = prefix
  }

  /** 创建带前缀的子 Logger（用于模块区分） */
  child(prefix: string): Logger {
    return new Logger(this.prefix ? `${this.prefix}:${prefix}` : prefix)
  }

  error(message: string, data?: Record<string, any>): void {
    this._log('error', message, data)
  }

  warn(message: string, data?: Record<string, any>): void {
    this._log('warn', message, data)
  }

  info(message: string, data?: Record<string, any>): void {
    this._log('info', message, data)
  }

  debug(message: string, data?: Record<string, any>): void {
    this._log('debug', message, data)
  }

  private _log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return

    const timestamp = new Date().toISOString()
    const redactedData = data ? redactValue(data) : undefined
    const label = this.prefix ? `[${this.prefix}]` : ''

    if (isJsonLog) {
      // 生产环境 JSON 格式（便于日志采集）
      const entry = {
        timestamp,
        level,
        message,
        prefix: this.prefix || undefined,
        traceId: (globalThis as any).__traceId || undefined,
        ...redactedData,
      }
      const stream = level === 'error' ? process.stderr : process.stdout
      stream.write(JSON.stringify(entry) + '\n')
    } else {
      // 开发环境可读格式
      const levelColors: Record<LogLevel, string> = {
        error: '\x1b[31m',  // red
        warn: '\x1b[33m',   // yellow
        info: '\x1b[36m',   // cyan
        debug: '\x1b[90m',  // gray
      }
      const reset = '\x1b[0m'
      const color = levelColors[level]
      const levelStr = level.toUpperCase().padEnd(5)

      const traceId = (globalThis as any).__traceId
      const traceStr = traceId ? ` \x1b[90m(trace: ${traceId.slice(0, 8)})${reset}` : ''

      const dataStr = redactedData
        ? ' ' + Object.entries(redactedData)
            .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' ')
        : ''

      const stream = level === 'error' ? process.stderr : process.stdout
      stream.write(`${color}${levelStr}${reset} ${timestamp} ${label}${message}${traceStr}${dataStr}\n`)
    }
  }
}

// 全局单例
export const logger = new Logger()
export default logger

// ========== 辅助函数 ==========

/**
 * 设置当前请求的 traceId（用于日志透传）
 */
export function setTraceId(id: string): void {
  (globalThis as any).__traceId = id
}

export function getTraceId(): string | undefined {
  return (globalThis as any).__traceId
}

export function clearTraceId(): void {
  delete (globalThis as any).__traceId
}
