/**
 * CachedImg / CachedVideo — 优先从 IndexedDB 加载本地缓存的图片/视频
 * 命中缓存时用 Blob URL 秒加载，未命中时走原始网络 URL
 * 替代 <img src={url}> 和 <video src={url}>
 */
import { useState, useEffect, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react'
import { getCachedBlobUrl } from '../../services/mediaCache'

function useCachedUrl(url: string | undefined, cacheKey?: string): string | undefined {
  const [cached, setCached] = useState<string | undefined>(undefined)
  const key = cacheKey || url

  useEffect(() => {
    if (!key) { setCached(undefined); return }
    let revoked = false
    let prevUrl: string | undefined

    getCachedBlobUrl(key).then((blobUrl) => {
      if (revoked) {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        return
      }
      if (blobUrl) {
        prevUrl = blobUrl
        setCached(blobUrl)
      }
    })

    return () => {
      revoked = true
      if (prevUrl) URL.revokeObjectURL(prevUrl)
    }
  }, [key])

  return cached || url
}

type CachedImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  cacheKey?: string
}

export function CachedImg({ src, cacheKey, ...rest }: CachedImgProps) {
  const cachedSrc = useCachedUrl(src, cacheKey)
  return <img src={cachedSrc} {...rest} />
}

type CachedVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  cacheKey?: string
}

export function CachedVideo({ src, cacheKey, ...rest }: CachedVideoProps) {
  const cachedSrc = useCachedUrl(src, cacheKey)
  return <video src={cachedSrc} {...rest} />
}
