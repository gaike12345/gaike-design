/**
 * Zod 参数校验中间件
 * ==================
 *
 * 提供统一的请求参数校验能力，支持 body / query / params 三种位置。
 * 校验失败返回 400 状态码和结构化错误信息。
 *
 * 使用方式：
 *   import { validate, z } from '../middleware/validate'
 *
 *   router.post('/login', validate({
 *     body: z.object({
 *       email: z.string().email(),
 *       password: z.string().min(6),
 *     }),
 *   }), async (req, res) => {
 *     // req.body 已被验证为安全类型
 *     const { email, password } = req.body
 *   })
 */

import { z, ZodSchema, ZodError } from 'zod'
import type { Request, Response, NextFunction } from 'express'

export { z }

// ========== 校验选项 ==========

interface ValidateOptions {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

// ========== 分页统一原语 ==========
// 手写分页解析点（admin/billing/user/projects/site/community）与 schema 校验共用同一套夹取语义：
// 非数值/NaN → 回落默认值（历史 5 种手写风格中 3 种会让 NaN 漏进 prisma，此处统一收敛）；
// 数值越界 → 夹取到 [1, max]；小数 → 截断为整数。

export interface PaginationOptions {
  maxPageSize?: number
  defaultPageSize?: number
}

const PAGE_MAX = Number.MAX_SAFE_INTEGER

function clampInt(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(1, n))
}

/** 分页 query schema 工厂：cap 可按端点现状参数化（billing/user=50，site audit limit=200，其余 100） */
export function paginationSchema(opts: PaginationOptions = {}) {
  const { maxPageSize = 100, defaultPageSize = 20 } = opts
  return z.object({
    page: z.coerce.number().transform((n) => clampInt(n, 1, PAGE_MAX)).default(1),
    pageSize: z.coerce.number().transform((n) => clampInt(n, defaultPageSize, maxPageSize)).default(defaultPageSize),
  })
}

/** { page, pageSize } 风格手写解析点统一入口（q 传 req.query） */
export function parsePagination(q: Record<string, unknown>, opts: PaginationOptions = {}): { page: number; pageSize: number } {
  const { maxPageSize = 100, defaultPageSize = 20 } = opts
  return {
    page: clampInt(q?.page, 1, PAGE_MAX),
    pageSize: clampInt(q?.pageSize, defaultPageSize, maxPageSize),
  }
}

/** { page, limit } 风格手写解析点统一入口（projects 等） */
export function parsePageLimit(q: Record<string, unknown>, opts: PaginationOptions = {}): { page: number; limit: number } {
  const { maxPageSize = 100, defaultPageSize = 20 } = opts
  return {
    page: clampInt(q?.page, 1, PAGE_MAX),
    limit: clampInt(q?.limit, defaultPageSize, maxPageSize),
  }
}

/** 仅 limit 的手写解析点统一入口（site audit 等） */
export function parseLimit(q: Record<string, unknown>, opts: { max?: number; default?: number } = {}): number {
  return clampInt(q?.limit, opts.default ?? 20, opts.max ?? 100)
}

// ========== 通用校验 Schema ==========

export const commonSchemas = {
  // 分页（默认实例：cap 100 / 默认 20，与手写点同一夹取语义）
  pagination: paginationSchema(),

  // ID 参数
  idParam: z.object({
    id: z.string().min(1).max(64),
  }),

  // 搜索关键词
  searchQuery: z.object({
    q: z.string().max(200).optional(),
  }),

  // 邮箱
  email: z.string().email().max(255),

  // 密码（6-128 位）
  password: z.string().min(6).max(128),

  // 昵称（1-32 字符）
  nickname: z.string().min(1).max(32),

  // URL
  url: z.string().url().max(2048),

  // 排序方向
  sortDir: z.enum(['asc', 'desc']).default('desc'),
}

// ========== 校验中间件 ==========

export function validate(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, any> = {}

    // 校验 body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body)
      if (!result.success) {
        errors.body = formatZodError(result.error)
      } else {
        req.body = result.data
      }
    }

    // 校验 query
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query)
      if (!result.success) {
        errors.query = formatZodError(result.error)
      } else {
        req.query = result.data as typeof req.query
      }
    }

    // 校验 params
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params)
      if (!result.success) {
        errors.params = formatZodError(result.error)
      } else {
        req.params = result.data as typeof req.params
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: '请求参数不合法',
        code: 'VALIDATION_ERROR',
        details: errors,
      })
    }

    next()
  }
}

// ========== 错误格式化 ==========

function formatZodError(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root'
    formatted[path] = issue.message
  }
  return formatted
}

export default validate
