/**
 * 全局异常拦截器
 * ==============
 *
 * 规范参考：AI开发规范.prompt.md 第八章 8.2
 *
 * 分类处理：
 *   - BusinessError / ValidationError → 400 + ApiResponse.fail
 *   - AuthError                       → 401 + ApiResponse.fail
 *   - ForbiddenError                  → 403 + ApiResponse.fail
 *   - NotFoundError                   → 404 + ApiResponse.fail
 *   - ConflictError                   → 409 + ApiResponse.fail
 *   - 其他 Error                       → 500 + ApiResponse.fail + 堆栈入日志
 *
 * 生产环境不向客户端泄漏内部错误细节（Prisma 错误、堆栈、表名/字段名）
 */

import type { Request, Response, NextFunction } from 'express'
import logger from '../logging/logger'
import { fail, type ApiResponse } from '../../mank-common/utils/apiResponse'
import {
  AppError,
  BusinessError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../../mank-common/errors'

// 是否为生产环境
const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * 统一错误处理中间件
 * 必须挂在路由注册之后、404 兜底之前（或并列）
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // 分类异常：根据异常类型决定 HTTP 状态码与日志级别
  if (err instanceof BusinessError || err instanceof ValidationError) {
    // 业务/参数异常：可预知，WARN 级别
    logger.warn('CTRL_BUSINESS_ERROR', {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
    })
    respond(res, err.statusCode, err.message)
    return
  }

  if (err instanceof AuthError) {
    // 认证异常：INFO 级别（频繁且非故障）
    logger.info('CTRL_AUTH_ERROR', { message: err.message })
    respond(res, 401, err.message)
    return
  }

  if (err instanceof ForbiddenError) {
    // 权限异常：WARN 级别
    logger.warn('CTRL_FORBIDDEN_ERROR', { message: err.message })
    respond(res, 403, err.message)
    return
  }

  if (err instanceof NotFoundError) {
    // 资源不存在：INFO 级别
    logger.info('CTRL_NOT_FOUND_ERROR', { message: err.message })
    respond(res, 404, err.message)
    return
  }

  if (err instanceof ConflictError) {
    // 资源冲突：WARN 级别
    logger.warn('CTRL_CONFLICT_ERROR', { message: err.message })
    respond(res, 409, err.message)
    return
  }

  // 兼容旧版 AdminError：保留过渡期支持（逐步迁移到 BusinessError）
  if (err instanceof AppError || 'statusCode' in err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500
    if (statusCode >= 400 && statusCode < 500) {
      logger.warn('CTRL_LEGACY_APP_ERROR', { name: err.name, message: err.message, statusCode })
      respond(res, statusCode, err.message)
      return
    }
  }

  // 未分类异常：500，完整堆栈入日志
  logger.error('未捕获异常', {
    message: err.message,
    stack: err.stack,
    name: err.name,
  })

  const clientMessage = IS_PROD
    ? '服务器内部错误，请稍后重试'
    : (err.message || '服务器内部错误')

  respond(res, 500, clientMessage)
}

/**
 * 统一响应：返回 ApiResponse.fail，状态码与 body.code 保持一致
 */
function respond(res: Response, statusCode: number, message: string): void {
  const body: ApiResponse<null> = fail(statusCode, message)
  res.status(statusCode).json(body)
}

/**
 * 404 兜底
 */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json(fail(404, '接口不存在'))
}
