import CreatorLayout from '../components/layout/CreatorLayout'
import WritingPane from '../components/editor/WritingPane'
import { useNavigate } from 'react-router-dom'

/** 独立工作区页：/writing 或 /workspace/writing — 小说写作 IDE（对标蛙蛙写作） */
export default function WritingPage() {
  const navigate = useNavigate()
  const onJumpTo = (target: string) => {
    // IDE 内部跳转直接走对应工作区路由（/workspace/*）
    const map: Record<string, string> = {
      image: '/workspace/canvas',
      audio: '/workspace/audio',
      video: '/workspace/canvas',
      community: '/workspace/community',
    }
    if (map[target]) navigate(map[target])
  }
  return (
    <CreatorLayout title="小说写作" subtitle="写作板块" projectName="我的小说">
      <div className="flex flex-1 flex-col overflow-hidden">
        <WritingPane onJumpTo={onJumpTo as any} />
      </div>
    </CreatorLayout>
  )
}
