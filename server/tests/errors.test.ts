/**
 * 异常分类体系单元测试
 * 规范：AI开发规范.prompt.md 第八章
 */

import { describe, it, expect } from 'vitest'
import {
  AppError,
  BusinessError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  SystemError,
} from '../src/mank-common/errors'

describe('Errors - 异常分类体系', () => {
  describe('AppError - 基类', () => {
    it('should set message and statusCode when constructed', () => {
      const err = new AppError('出错了', 500)
      expect(err.message).toBe('出错了')
      expect(err.statusCode).toBe(500)
      expect(err.name).toBe('AppError')
    })

    it('should default statusCode to 500 when not provided', () => {
      const err = new AppError('出错了')
      expect(err.statusCode).toBe(500)
    })

    it('should be instanceof Error', () => {
      const err = new AppError('出错了')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('BusinessError - 业务异常', () => {
    it('should default statusCode to 400', () => {
      const err = new BusinessError('积分不足')
      expect(err.statusCode).toBe(400)
    })

    it('should allow custom statusCode override', () => {
      const err = new BusinessError('积分不足', 402)
      expect(err.statusCode).toBe(402)
    })

    it('should preserve message', () => {
      const err = new BusinessError('用户不存在')
      expect(err.message).toBe('用户不存在')
      expect(err.name).toBe('BusinessError')
    })

    it('should be instanceof AppError', () => {
      const err = new BusinessError('test')
      expect(err).toBeInstanceOf(AppError)
    })
  })

  describe('ValidationError - 参数校验异常', () => {
    it('should always have statusCode 400', () => {
      expect(new ValidationError('邮箱格式不正确').statusCode).toBe(400)
    })

    it('should preserve message', () => {
      const err = new ValidationError('密码至少 8 位')
      expect(err.message).toBe('密码至少 8 位')
      expect(err.name).toBe('ValidationError')
    })
  })

  describe('AuthError - 认证异常', () => {
    it('should always have statusCode 401', () => {
      expect(new AuthError('未登录').statusCode).toBe(401)
    })

    it('should preserve message', () => {
      const err = new AuthError('Token 已过期')
      expect(err.message).toBe('Token 已过期')
      expect(err.name).toBe('AuthError')
    })
  })

  describe('ForbiddenError - 权限异常', () => {
    it('should always have statusCode 403', () => {
      expect(new ForbiddenError('无权限').statusCode).toBe(403)
    })

    it('should preserve message', () => {
      const err = new ForbiddenError('需要超级管理员权限')
      expect(err.message).toBe('需要超级管理员权限')
      expect(err.name).toBe('ForbiddenError')
    })
  })

  describe('NotFoundError - 资源不存在', () => {
    it('should always have statusCode 404', () => {
      expect(new NotFoundError('项目不存在').statusCode).toBe(404)
    })

    it('should preserve message', () => {
      const err = new NotFoundError('用户不存在')
      expect(err.message).toBe('用户不存在')
      expect(err.name).toBe('NotFoundError')
    })
  })

  describe('ConflictError - 资源冲突', () => {
    it('should always have statusCode 409', () => {
      expect(new ConflictError('邮箱已注册').statusCode).toBe(409)
    })

    it('should preserve message', () => {
      const err = new ConflictError('用户名重复')
      expect(err.message).toBe('用户名重复')
      expect(err.name).toBe('ConflictError')
    })
  })

  describe('SystemError - 系统异常', () => {
    it('should always have statusCode 500', () => {
      expect(new SystemError('内部错误').statusCode).toBe(500)
    })

    it('should preserve message', () => {
      const err = new SystemError('数据库连接失败')
      expect(err.message).toBe('数据库连接失败')
      expect(err.name).toBe('SystemError')
    })
  })

  describe('继承关系 - instanceof 链', () => {
    it('should make all sub errors instanceof AppError', () => {
      expect(new BusinessError('x')).toBeInstanceOf(AppError)
      expect(new ValidationError('x')).toBeInstanceOf(AppError)
      expect(new AuthError('x')).toBeInstanceOf(AppError)
      expect(new ForbiddenError('x')).toBeInstanceOf(AppError)
      expect(new NotFoundError('x')).toBeInstanceOf(AppError)
      expect(new ConflictError('x')).toBeInstanceOf(AppError)
      expect(new SystemError('x')).toBeInstanceOf(AppError)
    })

    it('should make all sub errors instanceof Error', () => {
      expect(new BusinessError('x')).toBeInstanceOf(Error)
      expect(new ValidationError('x')).toBeInstanceOf(Error)
      expect(new AuthError('x')).toBeInstanceOf(Error)
      expect(new ForbiddenError('x')).toBeInstanceOf(Error)
      expect(new NotFoundError('x')).toBeInstanceOf(Error)
      expect(new ConflictError('x')).toBeInstanceOf(Error)
      expect(new SystemError('x')).toBeInstanceOf(Error)
    })
  })
})
