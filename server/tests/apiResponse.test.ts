/**
 * 统一响应体 ApiResponse 单元测试
 * 规范：AI开发规范.prompt.md 第五章 5.3
 */

import { describe, it, expect } from 'vitest'
import { success, fail } from '../src/mank-common/utils/apiResponse'

describe('ApiResponse - 统一响应体', () => {
  describe('success() - 成功响应', () => {
    it('should return code 200 with data', () => {
      const res = success({ id: 1, name: 'test' })
      expect(res.code).toBe(200)
      expect(res.data).toEqual({ id: 1, name: 'test' })
    })

    it('should use default message "操作成功" when not provided', () => {
      const res = success({})
      expect(res.message).toBe('操作成功')
    })

    it('should use custom message when provided', () => {
      const res = success({}, '注册成功')
      expect(res.message).toBe('注册成功')
    })

    it('should always include timestamp as number', () => {
      const res = success({})
      expect(typeof res.timestamp).toBe('number')
      expect(res.timestamp).toBeGreaterThan(0)
    })

    it('should include traceId field (may be empty outside request context)', () => {
      const res = success({})
      expect(res).toHaveProperty('traceId')
      expect(typeof res.traceId).toBe('string')
    })

    it('should return null data when data is null', () => {
      const res = success(null)
      expect(res.data).toBeNull()
    })

    it('should preserve array data', () => {
      const res = success([1, 2, 3])
      expect(res.data).toEqual([1, 2, 3])
    })
  })

  describe('fail() - 失败响应', () => {
    it('should return provided error code', () => {
      const res = fail(400, '参数校验失败')
      expect(res.code).toBe(400)
    })

    it('should return 500 for server errors', () => {
      const res = fail(500, '服务器内部错误')
      expect(res.code).toBe(500)
    })

    it('should set data to null', () => {
      const res = fail(404, '资源不存在')
      expect(res.data).toBeNull()
    })

    it('should preserve error message', () => {
      const res = fail(409, '邮箱已注册')
      expect(res.message).toBe('邮箱已注册')
    })

    it('should always include timestamp', () => {
      const res = fail(400, '错误')
      expect(typeof res.timestamp).toBe('number')
      expect(res.timestamp).toBeGreaterThan(0)
    })

    it('should include traceId field', () => {
      const res = fail(401, '未登录')
      expect(res).toHaveProperty('traceId')
      expect(typeof res.traceId).toBe('string')
    })
  })

  describe('响应体结构完整性', () => {
    it('should have all 5 required fields on success', () => {
      const res = success({})
      expect(Object.keys(res).sort()).toEqual(
        ['code', 'data', 'message', 'timestamp', 'traceId'].sort()
      )
    })

    it('should have all 5 required fields on fail', () => {
      const res = fail(500, '出错了')
      expect(Object.keys(res).sort()).toEqual(
        ['code', 'data', 'message', 'timestamp', 'traceId'].sort()
      )
    })
  })
})
