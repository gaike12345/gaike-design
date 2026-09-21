/**
 * IndexedDB 本地缓存 — 图片/视频 Blob 持久化
 * 生成完成时存入，画布渲染时优先读取本地缓存
 * 浏览器不清理则永久保留，次日打开也能秒加载
 */

const DB_NAME = 'manktv-media-cache'
const DB_VERSION = 1
const STORE_NAME = 'media'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 存入 Blob 到 IndexedDB
 * @param key 缓存 key（建议用 originalUrl 或 nodeId+resultId）
 * @param blob 图片/视频二进制数据
 */
export async function cacheBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, key)
    tx.oncomplete = () => db.close()
  } catch (e) {
    // IndexedDB 满了或不可用时静默失败，不影响主流程
    console.warn('[mediaCache] cacheBlob failed:', e)
  }
}

/**
 * 从 IndexedDB 读取 Blob，返回 object URL（需手动 revoke）
 * @param key 缓存 key
 * @returns object URL 或 null（未缓存）
 */
export async function getCachedBlobUrl(key: string): Promise<string | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    return new Promise((resolve) => {
      req.onsuccess = () => {
        db.close()
        if (req.result instanceof Blob) {
          resolve(URL.createObjectURL(req.result))
        } else {
          resolve(null)
        }
      }
      req.onerror = () => { db.close(); resolve(null) }
    })
  } catch {
    return null
  }
}

/**
 * 下载 URL 并缓存为 Blob
 * 生成完成时调用：立即下载 Pollinations 返回的图片/视频并存入 IndexedDB
 * @param url 要下载的 URL
 * @param key 缓存 key
 */
export async function downloadAndCache(url: string, key: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const blob = await res.blob()
    await cacheBlob(key, blob)
  } catch (e) {
    console.warn('[mediaCache] downloadAndCache failed:', e)
  }
}

/**
 * 删除指定缓存
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => db.close()
  } catch {
    // 静默失败
  }
}

/**
 * 清空所有缓存
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => db.close()
  } catch {
    // 静默失败
  }
}
