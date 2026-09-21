import { describe, it, expect, beforeEach } from 'vitest'
import { signImageUrl, verifySignedUrl } from '../src/mank-common/utils/imageSigner'

describe('Image Signer', () => {
  const originalUrl = 'https://image.pollinations.ai/prompt/test%20image'
  const userId = 'user-123'
  const costTokens = 20

  describe('signImageUrl', () => {
    it('应该生成包含 proxy 路径的签名 URL', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)

      expect(signed).toMatch(/^\/api\/image\/proxy\?/)
    })

    it('签名 URL 应包含时间戳', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')
      const ts = url.searchParams.get('t')

      expect(ts).toBeTruthy()
      expect(parseInt(ts!, 10)).toBeGreaterThan(0)
    })

    it('签名 URL 应包含签名', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')
      const sig = url.searchParams.get('s')

      expect(sig).toBeTruthy()
      expect(sig!.length).toBe(16) // HMAC-SHA256 截断为 16 字符
    })

    it('签名 URL 应包含用户 ID', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')

      expect(url.searchParams.get('uid')).toBe(userId)
    })

    it('签名 URL 应包含积分成本', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')

      expect(url.searchParams.get('c')).toBe(String(costTokens))
    })

    it('签名 URL 应包含交易流水 ID（txId）', () => {
      const txId = 'tx-abc-123'
      const signed = signImageUrl(originalUrl, userId, costTokens, txId)
      const url = new URL(signed, 'http://localhost')

      expect(url.searchParams.get('tx')).toBe(txId)
    })

    it('无 txId 时签名 URL 不应包含 tx 参数', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')

      expect(url.searchParams.get('tx')).toBeNull()
    })

    it('无用户 ID 和积分时应生成最小签名 URL', () => {
      const signed = signImageUrl(originalUrl)

      const url = new URL(signed, 'http://localhost')
      expect(url.searchParams.get('uid')).toBeNull()
      expect(url.searchParams.get('c')).toBeNull()
      expect(url.searchParams.get('u')).toBeTruthy()
      expect(url.searchParams.get('t')).toBeTruthy()
      expect(url.searchParams.get('s')).toBeTruthy()
    })
  })

  describe('verifySignedUrl', () => {
    it('应该验证有效的签名 URL', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')
      const params = url.searchParams

      const result = verifySignedUrl(
        params.get('u')!,
        params.get('t')!,
        params.get('s')!,
        params.get('uid') || undefined,
        params.get('c') || undefined,
      )

      expect(result).not.toBeNull()
      expect(result!.url).toBe(originalUrl)
      expect(result!.userId).toBe(userId)
      expect(result!.costTokens).toBe(costTokens)
    })

    it('应该拒绝篡改的 URL', () => {
      const signed = signImageUrl(originalUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')
      const params = url.searchParams

      // 篡改签名
      const badSig = params.get('s')!.replace(/^./, 'x')

      const result = verifySignedUrl(
        params.get('u')!,
        params.get('t')!,
        badSig,
        params.get('uid') || undefined,
        params.get('c') || undefined,
      )

      expect(result).toBeNull()
    })

    it('应该拒绝过期的签名（超过 2 小时）', () => {
      const oldTs = String(Date.now() - 3 * 60 * 60 * 1000) // 3 小时前
      const payload = `${oldTs}::::${originalUrl}`
      const sig = require('crypto').createHmac('sha256', process.env.IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod')
        .update(payload).digest('hex').slice(0, 16)
      const encoded = Buffer.from(originalUrl).toString('base64url')

      const result = verifySignedUrl(encoded, oldTs, sig)

      expect(result).toBeNull()
    })

    it('应该拒绝非法的时间戳', () => {
      const result = verifySignedUrl('dGVzdA==', 'not-a-number', 'abcdef1234567890')

      expect(result).toBeNull()
    })

    it('应该拒绝不在白名单中的主机', () => {
      const evilUrl = 'https://evil.com/prompt/test'
      const ts = String(Date.now())
      const payload = `${ts}::::${evilUrl}`
      const sig = require('crypto').createHmac('sha256', process.env.IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod')
        .update(payload).digest('hex').slice(0, 16)
      const encoded = Buffer.from(evilUrl).toString('base64url')

      const result = verifySignedUrl(encoded, ts, sig)

      expect(result).toBeNull()
    })

    it('应该接受已知 region 的 OSS 子域名', () => {
      const aliUrl = 'https://result-bj.oss-cn-beijing.aliyuncs.com/output/test.png'
      const signed = signImageUrl(aliUrl, userId, costTokens)
      const url = new URL(signed, 'http://localhost')
      const params = url.searchParams

      const result = verifySignedUrl(
        params.get('u')!,
        params.get('t')!,
        params.get('s')!,
        params.get('uid') || undefined,
        params.get('c') || undefined,
      )

      expect(result).not.toBeNull()
      expect(result!.url).toBe(aliUrl)
    })

    it('应该拒绝未知 region 的 aliyuncs.com 子域名（防 SSRF）', () => {
      const evilUrl = 'https://attacker-bucket.oss-cn-unknown.aliyuncs.com/output/test.png'
      const ts = String(Date.now())
      const payload = `${ts}::::${evilUrl}`
      const sig = require('crypto').createHmac('sha256', process.env.IMAGE_SIGNING_SECRET || '')
        .update(payload).digest('hex').slice(0, 16)
      const encoded = Buffer.from(evilUrl).toString('base64url')

      const result = verifySignedUrl(encoded, ts, sig)

      expect(result).toBeNull()
    })

    it('携带 txId 的签名 URL 验证后应返回 txId', () => {
      const txId = 'tx-xyz-789'
      const signed = signImageUrl(originalUrl, userId, costTokens, txId)
      const url = new URL(signed, 'http://localhost')
      const params = url.searchParams

      const result = verifySignedUrl(
        params.get('u')!,
        params.get('t')!,
        params.get('s')!,
        params.get('uid') || undefined,
        params.get('c') || undefined,
        params.get('tx') || undefined,
      )

      expect(result).not.toBeNull()
      expect(result!.txId).toBe(txId)
    })

    it('篡改 txId 应导致签名验证失败', () => {
      const txId = 'tx-xyz-789'
      const signed = signImageUrl(originalUrl, userId, costTokens, txId)
      const url = new URL(signed, 'http://localhost')
      const params = url.searchParams

      // 篡改 txId
      const tamperedTx = 'tampered-tx-id'

      const result = verifySignedUrl(
        params.get('u')!,
        params.get('t')!,
        params.get('s')!,
        params.get('uid') || undefined,
        params.get('c') || undefined,
        tamperedTx,
      )

      expect(result).toBeNull()
    })
  })

  describe('往返一致性', () => {
    it('签名的 URL 应始终能通过验证', () => {
      const testUrls = [
        'https://image.pollinations.ai/prompt/a%20beautiful%20cat',
        'https://dashscope-result.oss-cn-beijing.aliyuncs.com/test/result.png',
        'https://dashscope-result.oss-cn-hangzhou.aliyuncs.com/output/image.jpg',
      ]

      for (const url of testUrls) {
        const signed = signImageUrl(url, 'user-456', 100)
        const parsed = new URL(signed, 'http://localhost')
        const params = parsed.searchParams

        const result = verifySignedUrl(
          params.get('u')!,
          params.get('t')!,
          params.get('s')!,
          params.get('uid') || undefined,
          params.get('c') || undefined,
        )

        expect(result).not.toBeNull()
        expect(result!.url).toBe(url)
      }
    })
  })
})
