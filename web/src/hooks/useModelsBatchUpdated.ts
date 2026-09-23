// 全局「模型批量更新」事件订阅 hook
//
// PollinationsSyncPanel 在批量调整汇率 / 毛利率后派发 window 'models-batch-updated' 事件，
// 模型相关模块（模型列表 / 费用估算 / 内联编辑）通过本 hook 监听并自动刷新。
// 采用 ref 保存最新 handler：仅订阅一次，事件触发时始终调用最新回调。
import { useEffect, useRef } from 'react'

export const MODELS_BATCH_UPDATED_EVENT = 'models-batch-updated'

export function useModelsBatchUpdated(handler: () => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const fn = () => ref.current()
    window.addEventListener(MODELS_BATCH_UPDATED_EVENT, fn)
    return () => window.removeEventListener(MODELS_BATCH_UPDATED_EVENT, fn)
  }, [])
}
