// 微信公众号扫码登录服务
// 流程：
// 1. 前端请求获取扫码 scene → 后端生成带参数二维码 → 返回二维码图片 + sceneId
// 2. 用户扫码并关注公众号 → 微信服务器回调 → 后端记录 openId 和用户信息
// 3. 前端轮询扫码状态 → 已扫码登录 → 返回 token
//
// 未配置微信公众号时（开发模式）：
// - 生成模拟二维码，扫码状态用 mock 轮询（5 秒后自动"扫码成功"）
// - 方便前端开发调试

import prisma from './prisma'
import { signToken } from './jwt'
import { cfgNum } from './siteConfig'
import { generateNextUid } from './uidGenerator'
import logger from './logger'

// 扫码场景存储（内存模式）
// sceneId -> { status, openId?, user?, createdAt, expireAt }
type SceneStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'
interface SceneRecord {
  sceneId: string
  status: SceneStatus
  openId?: string
  userInfo?: { nickname?: string; avatar?: string }
  createdAt: number
  expireAt: number
}

const sceneStore = new Map<string, SceneRecord>()
const SCENE_EXPIRE = 5 * 60 * 1000 // 5 分钟过期

// 生成 sceneId
function generateSceneId(): string {
  return 'wc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
}

/**
 * 创建扫码场景（生成二维码）
 */
export async function createWechatScanScene(): Promise<{
  sceneId: string
  qrCodeUrl: string
  expireAt: number
}> {
  const sceneId = generateSceneId()
  const now = Date.now()
  const expireAt = now + SCENE_EXPIRE

  const appId = process.env.WECHAT_APP_ID
  const appSecret = process.env.WECHAT_APP_SECRET

  // 开发模式：生成模拟二维码（用 qrcode 库生成 sceneId 内容的二维码）
  if (!appId || !appSecret) {
    const qrcode = await import('qrcode')
    // 二维码内容：包含 sceneId，方便测试
    const qrData = `wechat-login://scan?sceneId=${sceneId}`
    const qrCodeUrl = await qrcode.toDataURL(qrData, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    sceneStore.set(sceneId, {
      sceneId,
      status: 'waiting',
      createdAt: now,
      expireAt,
    })

    // 开发模式：3 秒后自动标记为已扫码，6 秒后自动确认登录（方便调试）
    setTimeout(() => {
      const scene = sceneStore.get(sceneId)
      if (scene && scene.status === 'waiting') {
        scene.status = 'scanned'
        scene.openId = 'dev_openid_' + sceneId.slice(-8)
        scene.userInfo = { nickname: '微信用户', avatar: '' }
      }
    }, 3000)

    setTimeout(() => {
      const scene = sceneStore.get(sceneId)
      if (scene && scene.status === 'scanned') {
        scene.status = 'confirmed'
      }
    }, 6000)

    return { sceneId, qrCodeUrl, expireAt }
  }

  // 生产模式：调用微信公众号 API 获取带参数二维码
  try {
    // 1. 获取 access_token
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    )
    const tokenData = (await tokenRes.json()) as { access_token?: string; errmsg?: string }
    if (!tokenData.access_token) {
      throw new Error(tokenData.errmsg || '获取 access_token 失败')
    }

    // 2. 生成带参数二维码
    const qrRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${tokenData.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expire_seconds: Math.floor(SCENE_EXPIRE / 1000),
          action_name: 'QR_STR_SCENE',
          action_info: { scene: { scene_str: sceneId } },
        }),
      }
    )
    const qrData = (await qrRes.json()) as { ticket?: string; errmsg?: string }
    if (!qrData.ticket) {
      throw new Error(qrData.errmsg || '生成二维码失败')
    }

    // 3. 组装二维码图片 URL
    const qrCodeUrl = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(qrData.ticket)}`

    sceneStore.set(sceneId, {
      sceneId,
      status: 'waiting',
      createdAt: now,
      expireAt,
    })

    return { sceneId, qrCodeUrl, expireAt }
  } catch (e) {
    logger.error('微信扫码登录：生成二维码失败', { error: e instanceof Error ? e.message : String(e) })
    // 失败时回退到开发模式
    const qrcode = await import('qrcode')
    const qrData = `wechat-login://scan?sceneId=${sceneId}`
    const qrCodeUrl = await qrcode.toDataURL(qrData, { width: 240, margin: 2 })
    sceneStore.set(sceneId, { sceneId, status: 'waiting', createdAt: now, expireAt })
    return { sceneId, qrCodeUrl, expireAt }
  }
}

/**
 * 查询扫码状态（前端轮询）
 */
export async function getWechatScanStatus(sceneId: string): Promise<{
  status: SceneStatus
  token?: string
  user?: any
  expireAt?: number
}> {
  const scene = sceneStore.get(sceneId)

  if (!scene) {
    return { status: 'expired' }
  }

  // 检查是否过期
  if (Date.now() > scene.expireAt) {
    scene.status = 'expired'
    sceneStore.delete(sceneId)
    return { status: 'expired' }
  }

  // 已确认登录 → 查找/创建用户，返回 token
  if (scene.status === 'confirmed' && scene.openId) {
    const result = await getOrCreateWechatUser(scene.openId, scene.userInfo)
    return {
      status: 'confirmed',
      token: result.token,
      user: result.user,
      expireAt: scene.expireAt,
    }
  }

  return { status: scene.status, expireAt: scene.expireAt }
}

/**
 * 微信回调处理（用户扫码/关注时触发）
 */
export async function handleWechatCallback(openId: string, sceneId: string, userInfo?: { nickname?: string; avatar?: string }) {
  const scene = sceneStore.get(sceneId)
  if (!scene || Date.now() > scene.expireAt) {
    return { ok: false, error: '场景已过期' }
  }

  scene.openId = openId
  scene.userInfo = userInfo
  scene.status = 'scanned'

  // 关注后自动确认登录
  scene.status = 'confirmed'

  return { ok: true }
}

/**
 * 查找或创建微信用户
 */
async function getOrCreateWechatUser(openId: string, userInfo?: { nickname?: string; avatar?: string }) {
  // 先按 openId 查找
  let user = await prisma.user.findFirst({
    where: { wechatOpenId: openId },
  })

  if (!user) {
    // 新用户：自动注册
    const freeTokens = Math.max(0, await cfgNum('login.new_user_tokens', 100_000))
    const uid = await generateNextUid()
    user = await prisma.user.create({
      data: {
        uid,
        email: `wx_${openId.slice(-8)}@wechat.local`, // 占位邮箱
        password: '',
        nickname: userInfo?.nickname || `微信用户${openId.slice(-4)}`,
        avatar: userInfo?.avatar || null,
        wechatOpenId: openId,
        loginMethod: 'wechat',
      },
    })
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        totalTokens: freeTokens,
        usedTokens: 0,
        remainingTokens: freeTokens,
        planId: 'free',
      },
    })
  } else if (!user.enabled) {
    throw new Error('账号已被关闭，请联系管理员')
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role })

  return {
    token,
    user: { id: user.id, uid: user.uid, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role },
  }
}

// 定期清理过期场景（每 10 分钟清理一次）
setInterval(() => {
  const now = Date.now()
  for (const [id, scene] of sceneStore) {
    if (now > scene.expireAt) {
      sceneStore.delete(id)
    }
  }
}, 10 * 60 * 1000)
