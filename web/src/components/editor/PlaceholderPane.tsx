// 占位板块（音频/视频/社区 P0 骨架）
//
// v1.2 决策第 11 项：先把六大板块 UI/状态/service 兜底骨架全部建好
// 此组件为音频/视频/社区板块的 UI 占位，待 API 接入后由真实组件替换

import { useState } from 'react'
import { Loader2, Wand2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  paneId: 'audio' | 'video' | 'community'
  title: string
  desc: string
  todo: string[]
}

export default function PlaceholderPane({ paneId, title, desc, todo }: Props) {
  const [stubTriggered, setStubTriggered] = useState(false)

  // 兜底逻辑演示：点击主按钮后假装异步生成 2 秒后返回占位结果
  const onStubAction = () => {
    setStubTriggered(true)
    setTimeout(() => setStubTriggered(false), 2000)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        {paneId === 'audio' && <span className="text-2xl">🎵</span>}
        {paneId === 'video' && <span className="text-2xl">🎬</span>}
        {paneId === 'community' && <span className="text-2xl">🌐</span>}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-ink-500">{desc}</p>
      </div>

      {/* 功能清单（P0 范围） */}
      <div className="w-full max-w-2xl rounded-lg border border-ink-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            P0 功能清单
          </h3>
          <span className="chip bg-amber-50 text-amber-600">待 API 接入</span>
        </div>
        <ul className="space-y-2 text-left">
          {todo.map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-[12px] text-ink-600"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              <span>{t}</span>
              <span className="ml-auto chip bg-ink-50 px-1.5 py-0 text-[9px] text-ink-400">
                UI 骨架就绪
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 兜底按钮演示：API 未接入时友好提示 */}
      <button
        onClick={onStubAction}
        disabled={stubTriggered}
        className={cn('btn-primary px-5 py-2.5 text-sm')}
      >
        {stubTriggered ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            生成中（占位）…
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            尝试主操作（兜底占位）
          </>
        )}
      </button>

      <p className="flex items-center gap-1 text-[11px] text-ink-400">
        <AlertTriangle className="h-3 w-3" />
        API 未接入，仅演示 UI/状态/兜底逻辑；待用户提供 API key 后切换 service 层
      </p>
    </div>
  )
}
