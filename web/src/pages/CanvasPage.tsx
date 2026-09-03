import CreatorLayout from '../components/layout/CreatorLayout'
import UnifiedCanvas from '../components/canvas/UnifiedCanvas'

/** 工作区页：/workspace/canvas — 统一创作画布（图像 + 视频 + 音频） */
export default function CanvasPage() {
  return (
    <CreatorLayout title="创作画布" subtitle="图像 + 视频" projectName="创作画布项目" hideChrome>
      <div className="relative h-full overflow-hidden">
        <UnifiedCanvas />
      </div>
    </CreatorLayout>
  )
}
