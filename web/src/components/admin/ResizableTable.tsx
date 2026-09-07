// 可拖拽调整列宽的表格头 + 表格容器
// 用法：
//   const { colWidths, handleMouseDown, tableRef, containerRef } = useResizableTable(['uid', 'name', ...], { uid: 80, name: 150, ... })
//   <div ref={containerRef} className="overflow-x-auto">
//     <table ref={tableRef} ...>
//       <thead>
//         <tr>
//           <th style={{ width: colWidths.uid }}>
//             UID
//             <ResizableHandle onMouseDown={(e) => handleMouseDown(e, 'uid')} />
//           </th>
//         </tr>
//       </thead>
//     </table>
//   </div>

import { useState, useRef, useCallback, useEffect } from 'react'

const MIN_WIDTH = 60

interface ResizableHandleProps {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function ResizableHandle({ onMouseDown }: ResizableHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-violet-400/50 active:bg-violet-500/60"
      style={{ transform: 'translateX(50%)' }}
    />
  )
}

export function useResizableTable<K extends string>(
  keys: K[],
  defaultWidths: Record<K, number>,
) {
  const [colWidths, setColWidths] = useState<Record<K, number>>(defaultWidths)
  const [resizing, setResizing] = useState<K | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent, key: K) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(key)
    startXRef.current = e.clientX
    startWidthRef.current = colWidths[key]
  }, [colWidths])

  useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.max(MIN_WIDTH, startWidthRef.current + delta)
      setColWidths((prev) => ({ ...prev, [resizing]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizing(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  return { colWidths, handleMouseDown, resizing }
}
