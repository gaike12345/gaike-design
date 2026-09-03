// 前端预览 Tab 组件
// 从 AdminPage.tsx 抽取，提供 iframe 形式的站点前端预览功能。

import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink } from 'lucide-react'

export function PreviewTab({
  initialUrl,
  onInitialUrlApplied,
}: {
  initialUrl?: string
  onInitialUrlApplied?: () => void
}) {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176'
  const defaultUrl = initialUrl ?? baseOrigin
  const [url, setUrl] = useState(defaultUrl)
  const [inputUrl, setInputUrl] = useState(defaultUrl)
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    if (!initialUrl) return
    setUrl(initialUrl)
    setInputUrl(initialUrl)
    setIframeKey((k) => k + 1)
    onInitialUrlApplied?.()
  }, [initialUrl, onInitialUrlApplied])

  const handleNavigate = () => {
    let u = inputUrl.trim()
    if (!u.startsWith('http')) u = 'http://' + u
    setUrl(u)
    setIframeKey((k) => k + 1)
  }

  const handleRefresh = () => setIframeKey((k) => k + 1)

  return (
    <div className="space-y-3">
      {/* URL 导航栏 */}
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2">
        <button
          onClick={handleRefresh}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          title="刷新"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleNavigate() }}
          placeholder="输入前端 URL..."
          className="flex-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={handleNavigate}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        >
          前往
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          title="新窗口打开"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* iframe 前端预览 */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <iframe
          key={iframeKey}
          src={url}
          className="h-[calc(100vh-220px)] w-full"
          title="前端预览"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>

      {/* 快捷链接 */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: '首页', path: '/' },
          { label: '写作', path: '/novel' },
          { label: '图像', path: '/image' },
          { label: '音频', path: '/audio' },
          { label: '视频', path: '/video' },
          { label: '社区', path: '/community' },
          { label: '个人中心', path: '/settings' },
        ].map((link) => (
          <button
            key={link.path}
            onClick={() => {
              const newUrl = (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176') + link.path
              setUrl(newUrl)
              setInputUrl(newUrl)
              setIframeKey((k) => k + 1)
            }}
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  )
}
