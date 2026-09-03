// 个人中心 Banner 组件（背景 + 头像 + 上传功能）
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { api, getToken, clearToken } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'
import { useQuotaModalStore } from '../../store/useQuotaModalStore'

export interface BannerUser {
  id: string
  nickname?: string | null
  email?: string | null
  avatar?: string | null
  banner?: string | null
  role?: string
  createdAt?: string | Date | null
}

export function SettingsBanner({
  user,
  onBannerChange,
  onAvatarChange,
}: {
  user: BannerUser | null
  onBannerChange?: (url: string | null) => void
  onAvatarChange?: (url: string) => void
}) {
  const [bannerUploading, setBannerUploading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [bannerUrl, setBannerUrl] = useState<string | null | undefined>(user?.banner)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 同步 user.banner 更新
  useEffect(() => {
    setBannerUrl(user?.banner)
  }, [user?.banner])

  // 统一文件上传（带 401/402 处理，与 api.ts 逻辑一致）
  const uploadFile = useCallback(async (file: File, endpoint: string, fieldName: string): Promise<string> => {
    const token = getToken()
    const fd = new FormData()
    fd.append(fieldName, file)
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    })

    // 401 → 清除 token
    if (res.status === 401) {
      clearToken()
      throw new Error('登录已过期，请重新登录')
    }

    // 402 → 积分不足，弹出弹窗
    if (res.status === 402) {
      let data: { error?: string; need?: number; remaining?: number } | null = null
      try { data = await res.json() } catch { /* ignore */ }
      useQuotaModalStore.getState().openModal({
        need: data?.need,
        remaining: data?.remaining,
        message: data?.error,
      })
      throw new Error(data?.error || '积分不足，请先充值')
    }

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '上传失败')
    return data.url
  }, [])

  const handleBannerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    try {
      const url = await uploadFile(file, 'user/banner', 'banner')
      setBannerUrl(url)
      onBannerChange?.(url)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBannerUploading(false)
      e.target.value = ''
    }
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const url = await uploadFile(file, 'auth/avatar', 'avatar')
      onAvatarChange?.(url)
      // 同步更新到 store 中的 user 对象
      const authStore = useAuthStore.getState()
      if (authStore.user) {
        authStore.setUser({ ...authStore.user, avatar: url })
      }
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const handleClearBanner = async () => {
    if (!confirm('确定要移除 Banner 背景吗？')) return
    try {
      await api.put('/api/user/profile', { banner: null })
      setBannerUrl(null)
      onBannerChange?.(null)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const initials = (user?.nickname || user?.email || 'U').slice(0, 1).toUpperCase()
  const hasBanner = !!bannerUrl

  return (
    <section
      className="relative overflow-hidden"
      style={hasBanner
        ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: 'linear-gradient(135deg,#4c1d95 0%,#7c3aed 40%,#06b6d4 100%)' }
      }
    >
      {/* 遮罩层，保证文字可读性 */}
      {hasBanner && <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-purple-900/50" aria-hidden />}

      {/* 默认渐变才显示装饰光斑 */}
      {!hasBanner && (
        <>
          <div className="pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full bg-fuchsia-400/30 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden />
        </>
      )}

      {/* ===== Banner 内容区 — 和下方 container-page 用完全一样的 padding ===== */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:gap-10">
          {/* 左：头像 + 身份（始终左对齐） */}
          <div className="flex items-center gap-5">
            <div className="group relative">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.nickname || 'avatar'}
                  className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/30 shadow-xl sm:h-24 sm:w-24" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white ring-4 ring-white/30 backdrop-blur-sm sm:h-24 sm:w-24">
                  {initials}
                </div>
              )}
              {/* 头像悬浮上传按钮 */}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-white/80 text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50"
                title="更换头像"
              >
                {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
            </div>

            <div className="text-white">
              <h1 className="text-2xl font-bold sm:text-3xl">{user?.nickname || '创作者'}</h1>
              <p className="mt-1 text-sm text-white/70">
                {user?.email || '—'}
              </p>
            </div>
          </div>

          {/* 占位，让上传按钮推到右侧 */}
          <div className="flex-1" aria-hidden />

          {/* Banner 上传按钮组 */}
          <div className="flex items-end gap-2 self-end">
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={bannerUploading}
              title={hasBanner ? '更换背景' : '上传背景'}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25 disabled:opacity-50"
            >
              {bannerUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Camera className="h-4 w-4" />}
            </button>
            {hasBanner && (
              <button
                type="button"
                onClick={handleClearBanner}
                title="移除背景"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-red-500/30 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} />
          </div>
        </div>
      </div>
    </section>
  )
}
