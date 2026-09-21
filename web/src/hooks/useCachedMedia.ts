/**
 * useCachedMedia — 优先从 IndexedDB 加载图片/视频
 * 画布渲染时调用：先查本地缓存，命中就用 Blob URL（秒加载），未命中走网络 URL
 */
import { useState, useEffect } from 'react'
import { getCachedBlobUrl } from '../services/mediaCache'

export function useCachedMedia(url: string | undefined, cacheKey?: string): string | undefined {
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(undefined)
  // cacheKey 默认用 url 本身（图片用 originalUrl，视频用 url）
  const key = cacheKey || url

  useEffect(() => {
    if (!key) { setCachedUrl(undefined); return }
    let revoked = false
    let prevUrl: string | undefined

    getCachedBlobUrl(key).then((blobUrl) => {
      if (revoked) {
        // 组件已卸载，清理
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        return
      }
      if (blobUrl) {
        prevUrl = blobUrl
        setCachedUrl(blobUrl)
      }
    })

    return () => {
      revoked = true
      if (prevUrl) URL.revokeObjectURL(prevUrl)
    }
  }, [key])

  // 有缓存用缓存，没缓存用原始 URL
  return cachedUrl || url
}
