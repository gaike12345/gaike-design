/**
 * 全局异常分类体系
 * =================
 *
 * 规范参考：AI开发规范.prompt.md 第八章
 *
 * 设计原则：
 *   - 业务异常（可预知）：BusinessError、ValidationError、ConflictError
 *   - 权限异常：AuthError、ForbiddenError
 *   - 资源异常：NotFoundError
 *   - 系统异常（不可预知）：SystemError
 *
 * 使用方式：
 *   throw new BusinessError('用户不存在', 404)
 *   throw new ValidationError('邮箱格式不正确')
 *   throw new NotFoundError('项目不存在')
 *
 * 全局拦截器（mank-infra/middleware/error.ts）会根据异常类型分类返回 ApiResponse
 */

/**
 * 异常基类
 * 所有业务异常必须继承此类，确保 statusCode 属性可用
 */
export class AppError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 500) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
  }
}

/**
 * 业务异常（可预知，默认 400）
 * 用于业务规则不满足的情况，如"积分不足"、"邮箱已注册"
 */
export class BusinessError extends AppError {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode)
  }
}

/**
 * 参数校验异常（400）
 * 用于请求参数不合法的情况，如"邮箱格式不正确"、"密码至少 8 位"
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400)
  }
}

/**
 * 认证异常（401）
 * 用于未登录或 Token 过期的情况
 */
export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 401)
  }
}

/**
 * 权限异常（403）
 * 用于已登录但角色不足的情况
 */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403)
  }
}

/**
 * 资源不存在异常（404）
 * 用于查询结果为空的情况
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404)
  }
}

/**
 * 资源冲突异常（409）
 * 用于资源已存在的情况，如"邮箱已注册"、"用户名重复"
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409)
  }
}

/**
 * 系统异常（500，不可预知）
 * 用于未捕获的异常、第三方服务故障等
 */
export class SystemError extends AppError {
  constructor(message: string) {
    super(message, 500)
  }
}
