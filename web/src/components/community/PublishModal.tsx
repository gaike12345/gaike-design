// 发布作品弹窗组件
// 从 CommunityPage.tsx 抽取。

import { useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import type { WorkType } from './types'

export function PublishModal({
  open,
  onClose,
  onPublish,
  publishing,
}: {
  open: boolean
  onClose: () => void
  onPublish: (title: string, type: WorkType, content: string) => void
  publishing: boolean
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WorkType>('novel')
  const [content, setContent] = useState('')

  if (!open) return null

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return
    onPublish(title.trim(), type, content.trim())
    setTitle('')
    setType('novel')
    setContent('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">发布作品</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 transition hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给你的作品起个名字"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WorkType)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
            >
              <option value="novel">小说</option>
              <option value="image">图像</option>
              <option value="comic">漫画</option>
              <option value="audio">音频</option>
              <option value="video">视频</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder={
                type === 'image'
                  ? '每行一个图片描述，将作为图片占位展示'
                  : '输入作品内容'
              }
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 text-neutral-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={publishing || !title.trim().length || !content.trim().length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-community-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-community-700 disabled:opacity-50"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发布
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
