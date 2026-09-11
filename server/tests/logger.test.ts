import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 在导入 logger 前设置环境变量
process.env.NODE_ENV = 'test'

// 动态导入 logger（确保使用 test 环境配置）
const loggerModule = await import('../src/mank-infra/logging/logger')
const logger = loggerModule.logger

describe('Logger', () => {
  describe('脱敏功能', () => {
    it('应该对 password 字段脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { password: 'mySecret123' })

      process.stdout.write = origStdout

      expect(captured).toBeTruthy()
      expect(captured).not.toContain('mySecret123')
      expect(captured).toContain('***')
    })

    it('应该对 token 字段脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { token: 'eyJhbGciOiJIUzI1NiJ9.xxx.yyy' })

      process.stdout.write = origStdout

      expect(captured).not.toContain('eyJhbGciOiJIUzI1NiJ9')
      expect(captured).toContain('***')
    })

    it('应该对 apiKey 字段脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { apiKey: 'sk-1234567890abcdef' })

      process.stdout.write = origStdout

      expect(captured).not.toContain('sk-1234567890abcdef')
      expect(captured).toContain('***')
    })

    it('应该对嵌套对象中的敏感字段脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', {
        user: { name: '张三', password: 'secret123', profile: { token: 'abc' } }
      })

      process.stdout.write = origStdout

      expect(captured).not.toContain('secret123')
      expect(captured).not.toContain('abc"')
      expect(captured).toContain('***')
    })

    it('应该对字符串中的邮箱格式脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { email: 'user@example.com' })

      process.stdout.write = origStdout

      expect(captured).not.toContain('user@example.com')
      // 脱敏后应为 us***@example.com
      expect(captured).toContain('example.com')
    })

    it('应该对字符串中的手机号脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { contact: '联系人 13812345678' })

      process.stdout.write = origStdout

      expect(captured).not.toContain('13812345678')
      expect(captured).toContain('138****5678')
    })

    it('应该对 Bearer Token 脱敏', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.body.signature' })

      process.stdout.write = origStdout

      expect(captured).not.toContain('eyJhbGciOiJIUzI1NiJ9')
      expect(captured).toContain('Bearer ***')
    })

    it('不应该脱敏普通字段', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { userId: 'clk123', page: 1, status: 'ok' })

      process.stdout.write = origStdout

      expect(captured).toContain('clk123')
      expect(captured).toContain('ok')
    })

    it('应该处理 null 和 undefined 值', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { a: null, b: undefined, c: 'ok' })

      process.stdout.write = origStdout

      expect(captured).toBeTruthy()
      expect(captured).toContain('ok')
    })

    it('应该处理数组中的敏感字段', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.info('TEST', { users: [{ password: 'secret1' }, { password: 'secret2' }] })

      process.stdout.write = origStdout

      expect(captured).not.toContain('secret1')
      expect(captured).not.toContain('secret2')
    })
  })

  describe('日志级别', () => {
    it('error 级别应该输出到 stderr', () => {
      let captured: any
      const origStderr = process.stderr.write.bind(process.stderr)
      process.stderr.write = (chunk: any) => { captured = chunk; return true }

      logger.error('ERROR_TEST', { detail: 'fail' })

      process.stderr.write = origStderr

      expect(captured).toBeTruthy()
      expect(captured).toContain('ERROR_TEST')
    })

    it('warn 级别应该输出', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      logger.warn('WARN_TEST', { detail: 'caution' })

      process.stdout.write = origStdout

      expect(captured).toBeTruthy()
      expect(captured).toContain('WARN_TEST')
    })
  })

  describe('子 Logger', () => {
    it('应该创建带前缀的子 logger', () => {
      let captured: any
      const origStdout = process.stdout.write.bind(process.stdout)
      process.stdout.write = (chunk: any) => { captured = chunk; return true }

      const childLogger = logger.child('AUTH')
      childLogger.info('TOKEN_ISSUED', { userId: 'xxx' })

      process.stdout.write = origStdout

      expect(captured).toContain('[AUTH]')
      expect(captured).toContain('TOKEN_ISSUED')
    })
  })
})
