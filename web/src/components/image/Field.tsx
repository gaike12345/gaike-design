// 图像板块共享：参数字段容器
//
// 配套 label 的表单字段包裹器，统一参数面板的视觉节奏

import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  children: ReactNode
}

export default function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  )
}
