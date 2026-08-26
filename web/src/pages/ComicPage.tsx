import CreatorLayout from '../components/layout/CreatorLayout'
import ComicPane from '../components/editor/ComicPane'
import { useNavigate } from 'react-router-dom'

/** 工作区页：/workspace/comic — 漫画排版 IDE */
export default function ComicPage() {
  const navigate = useNavigate()
  const onJumpTo = (target: string) => {
    const map: Record<string, string> = {
      writing: '/workspace/writing',
      image: '/workspace/image',
      audio: '/workspace/audio',
      video: '/workspace/video',
      community: '/workspace/community',
    }
    if (map[target]) navigate(map[target])
  }
  return (
    <CreatorLayout title="漫画板块" subtitle="漫画排版" projectName="我的漫画">
      <ComicPane onJumpTo={onJumpTo as any} />
    </CreatorLayout>
  )
}
