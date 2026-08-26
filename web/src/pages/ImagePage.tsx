import CreatorLayout from '../components/layout/CreatorLayout'
import ImagePane from '../components/editor/ImagePane'
import { useNavigate } from 'react-router-dom'

/** 工作区页：/workspace/image — 图像创作 IDE */
export default function ImagePage() {
  const navigate = useNavigate()
  const onJumpTo = (target: string) => {
    const map: Record<string, string> = {
      writing: '/workspace/writing',
      comic: '/workspace/comic',
      audio: '/workspace/audio',
      video: '/workspace/video',
      community: '/workspace/community',
    }
    if (map[target]) navigate(map[target])
  }
  return (
    <CreatorLayout title="图像创作" subtitle="图像板块" projectName="图像创作项目">
      <ImagePane onJumpTo={onJumpTo as any} />
    </CreatorLayout>
  )
}
