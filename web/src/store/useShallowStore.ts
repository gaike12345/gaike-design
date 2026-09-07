// 修复 React 19 + Zustand 对象选择器的无限循环问题
//
// 问题：Zustand 的 useStore(selector, shallow) 在 React 19 中，如果 selector 返回新对象，
// 会触发 "getSnapshot should be cached" 警告并导致无限更新循环。
//
// 解决方案：使用 useState + subscribe 手动管理选中的状态，确保返回值引用稳定。

import { useState, useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import type { StoreApi } from 'zustand'

export function useShallowStore<T extends object, S>(
  store: StoreApi<T>,
  selector: (state: T) => S,
): S {
  const [selected, setSelected] = useState<S>(() => selector(store.getState()))
  const selectedRef = useRef(selected)
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((state) => {
      const next = selectorRef.current(state)
      if (!shallow(selectedRef.current, next)) {
        selectedRef.current = next
        setSelected(next)
      }
    })
  }, [store])

  return selected
}
