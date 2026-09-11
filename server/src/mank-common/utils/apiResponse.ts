/**
 * 统一响应体封装
 * ==============
 *
 * 规范参考：AI开发规范.prompt.md 第五章 5.3
 *
 * 所有接口必须返回 ApiResponse<T>，统一格式：
 *   {
 *     "code": 200,
 *     "message": "操作成功",
 *     "data": { ... } | null,
 *     "timestamp": 1694150425123,
 *     "traceId": "a1b2c3d4e5f6"
 *   }
 *
 * 禁止返回 { ok: true } / { success: true } / { error: '...' } 等非标准格式
 */

import { requestContext } from '../../mank-infra/middleware/request-id'

/**
 * 统一响应体类型
 */
export interface ApiResponse<T> {
  /** 业务状态码：200=成功，4xx=客户端错误，5xx=服务端错误 */
  code: number
  /** 提示信息（可展示给用户） */
  message: string
  /** 业务数据（成功时返回，失败时为 null） */
  data: T | null
  /** 时间戳（毫秒） */
  timestamp: number
  /** 全链路追踪 ID（由 request-id 中间件注入） */
  traceId: string
}

/**
 * 从 AsyncLocalStorage 获取当前请求的 traceId
 * 在请求上下文外（如定时任务、启动期）返回空字符串
 */
function getTraceId(): string {
  const store = requestContext.getStore()
  return store?.traceId ?? ''
}

/**
 * 构造成功响应
 * @param data 业务数据
 * @param message 提示信息（默认"操作成功"）
 * @example
 *   res.json(ApiResponse.success(user))
 *   res.json(ApiResponse.success(user, '注册成功'))
 */
export function success<T>(data: T, message: string = '操作成功'): ApiResponse<T> {
  return {
    code: 200,
    message,
    data,
    timestamp: Date.now(),
    traceId: getTraceId(),
  }
}

/**
 * 构造失败响应
 * @param code 业务状态码（4xx/5xx）
 * @param message 错误信息
 * @example
 *   res.status(400).json(ApiResponse.fail(400, '参数校验失败'))
 *   res.status(500).json(ApiResponse.fail(500, '服务器内部错误'))
 */
export function fail(code: number, message: string): ApiResponse<null> {
  return {
    code,
    message,
    data: null,
    timestamp: Date.now(),
    traceId: getTraceId(),
  }
}
