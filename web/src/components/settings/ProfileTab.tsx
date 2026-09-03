// 个人资料 Tab 组件
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader2,
  Save,
  User,
} from 'lucide-react'
import { api } from '../../services/api'
import { LoadingBlock, ErrorBlock } from './common'
import type { UserProfile } from './types'

export function ProfileTab({ initial }: { initial: { nickname?: string; avatar?: string | null; role?: string; email?: string } | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarInput, setAvatarInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<UserProfile>('/api/user/profile')
      setProfile(data)
      setNickname(data.nickname || '')
      setBio(data.bio || '')
      setAvatar(data.avatar || '')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 用 store 中的 user 作回退显示
  const fallbackEmail = initial?.email || profile?.email || ''
  const fallbackAvatar = initial?.avatar || ''

  const save = async (patch: { nickname?: string; bio?: string; avatar?: string }) => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const updated = await api.put<UserProfile>('/api/user/profile', patch)
      setProfile(updated)
      setNickname(updated.nickname || '')
      setBio(updated.bio || '')
      setAvatar(updated.avatar || '')
      setAvatarInput(false)
      setSaveMsg({ ok: true, text: '已保存' })
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  const email = profile?.email || fallbackEmail
  const avatarUrl = avatar || fallbackAvatar || ''

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start">
          {/* 头像（可点击更换 URL） */}
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setAvatarInput((v) => !v)}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-neutral-200 bg-neutral-50"
              title="点击更换头像"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-400">
                  <User className="h-10 w-10" />
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 text-white text-xs transition-opacity group-hover:opacity-100">
                更换
              </span>
            </button>
            {avatarInput && (
              <div className="w-56 space-y-2">
                <input
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="粘贴头像 URL"
                  className="input !py-1.5 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => save({ avatar })}
                    disabled={saving}
                    className="btn-primary !py-1 !px-3 text-xs flex-1"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAvatar(profile?.avatar || ''); setAvatarInput(false) }}
                    className="btn-ghost !py-1 !px-3 text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 基本信息 */}
          <div className="flex-1 w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-neutral-900">
                {profile?.nickname || initial?.nickname || '未设置'}
              </h2>
            </div>

            {/* 昵称（失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={() => {
                  if (nickname !== (profile?.nickname || '') && nickname.trim()) {
                    save({ nickname: nickname.trim() })
                  } else {
                    setNickname(profile?.nickname || '')
                  }
                }}
                placeholder="设置一个昵称"
                className="input"
              />
            </div>

            {/* 邮箱（只读） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">邮箱（只读）</label>
              <input
                type="email"
                value={email}
                readOnly
                className="input bg-neutral-50 text-neutral-500"
              />
            </div>

            {/* UID（只读，可复制） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">UID 账号（只读）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={profile?.uid || ''}
                  readOnly
                  className="input bg-neutral-50 text-neutral-500 flex-1 font-mono tracking-wide"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (profile?.uid) {
                      navigator.clipboard.writeText(String(profile.uid))
                        .then(() => {
                          const el = document.createElement('div')
                          el.textContent = '已复制'
                          el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-800 text-white text-xs px-3 py-1.5 rounded-lg'
                          document.body.appendChild(el)
                          setTimeout(() => el.remove(), 1500)
                        })
                        .catch(() => {})
                    }
                  }}
                  className="btn-ghost !py-1.5 !px-3 text-xs shrink-0"
                >
                  复制
                </button>
              </div>
              <p className="mt-1 text-xs text-neutral-400">UID 是您的专属数字账号，可用于登录</p>
            </div>

            {/* 简介 bio（textarea，失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">个人简介</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                onBlur={() => {
                  if (bio !== (profile?.bio || '')) {
                    save({ bio })
                  }
                }}
                rows={3}
                placeholder="介绍一下自己..."
                className="input resize-none"
              />
            </div>

            {/* 保存提示 */}
            {saveMsg && (
              <div className={`flex items-center gap-1.5 text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {saveMsg.text}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
