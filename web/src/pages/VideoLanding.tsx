import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  Film,
  Type,
  Wand2 as WandIcon,
  AudioLines,
} from 'lucide-react'

const VIDEO_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Cinematic%20cyberpunk%20city%20video%20thumbnail%2C%20neon%20alley%20in%20rain%20at%20night%2C%20cinematic%20teal%20magenta%20color%20grade%2C%20dramatic%20lighting%2C%20film%20letterbox&image_size=landscape_4_3',
    typeLabel: 'AI 短片',
    title: '赛博都市·夜景漫游',
    author: '光影师',
    likes: 6728,
    filter: 'video',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Chinese%20traditional%20ink%20wash%20animation%20still%2C%20warrior%20sword%20dance%20on%20misty%20lake%20mountains%2C%20flowing%20robes%2C%20sumi-e%20style%2C%20motion%20blur&image_size=landscape_4_3',
    typeLabel: '国风动画',
    title: '古风舞剑·水墨动画',
    author: '青鸢',
    likes: 4215,
    filter: 'video',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Cute%20pet%20vlog%20thumbnail%2C%20fluffy%20corgi%20puppy%20in%20cozy%20sunlit%20apartment%2C%20pastel%20warm%20tone%20lifestyle%2C%20soft%20bokeh%20background&image_size=landscape_4_3',
    typeLabel: '治愈短片',
    title: '萌宠日常 Vlog',
    author: '毛孩子',
    likes: 7892,
    filter: 'video',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Food%20vlog%20ramen%20thumbnail%2C%20close%20up%20rich%20tonkotsu%20pork%20ramen%20with%20steam%2C%20japanese%20shop%20red%20lanterns%2C%20cinematic%20lighting%2C%20mouth%20watering&image_size=landscape_4_3',
    typeLabel: '生活记录',
    title: '美食探店·深夜拉面',
    author: '吃货君',
    likes: 5463,
    filter: 'video',
  },
]

/** 功能预览页：/video — 视频创作 */
export default function VideoLanding() {
  return (
    <FeatureLanding
      tag="视频创作"
      heroTitle={{ prefix: 'AI 让你的故事', highlight: '动起来' }}
      heroDesc="文生视频、图生视频、多镜头 Storyboard 拼接、自动字幕、配乐推荐。把漫画分镜直接变成动态视频，让你的读者一次看个过瘾。"
      primaryCta={{ label: '进入视频工作区', to: '/workspace/video' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '视频创作工具界面', custom: <PreviewMock /> }}
      works={VIDEO_WORKS}
      abilities={[
        {
          icon: <Film className="h-6 w-6" />,
          title: '静图 → 视频',
          desc: '上传单张插画，AI 自动赋予镜头运动（推拉摇移），输出 5-15 秒片段。',
        },
        {
          icon: <WandIcon className="h-6 w-6" />,
          title: '文生视频',
          desc: '输入一段剧情描述 + 风格词，AI 生成连贯的视频片段，支持起止帧控制。',
        },
        {
          icon: <Type className="h-6 w-6" />,
          title: '自动字幕与转场',
          desc: '识别对白自动打轴，自动匹配转场特效，多镜头无缝拼成完整短片。',
        },
        {
          icon: <AudioLines className="h-6 w-6" />,
          title: '配乐推荐',
          desc: 'AI 分析视频情绪，从 MankTV 曲库推荐匹配 BGM，也可导入音频板块产物。',
        },
      ]}
      steps={[
        { title: '脚本 Storyboard', desc: '把小说 / 漫画脚本拆成镜头，每个镜头决定时长、景别、运动方式。' },
        { title: '片段生成', desc: '按镜头生成视频，利用起止帧保持角色 / 场景一致性。' },
        { title: '剪辑与发布', desc: '拼接、上字幕、配乐、调色，导出 MP4 直接发布社区或外部平台。' },
      ]}
      finalCta={{
        title: '把静态作品变成短视频？',
        desc: 'AI 视频板块让你无需昂贵剪辑软件，浏览器就能出片。',
        button: { label: '立即进入视频工作区', to: '/workspace/video' },
      }}
      accent={ACCENTS.video}
    />
  )
}

function PreviewMock() {
  return (
    <div className="h-full w-full p-3 text-xs text-slate-300">
      <div className="space-y-2">
        {/* 播放预览 */}
        <div className="relative flex aspect-video items-center justify-center rounded bg-slate-950 ring-1 ring-white/10">
          <Film className="h-8 w-8 text-blue-400/60" />
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-white/10">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-400 to-indigo-400" />
            </div>
            <span className="text-[10px] text-slate-400">00:12 / 00:45</span>
          </div>
        </div>
        {/* 镜头时间线 */}
        <div className="grid grid-cols-5 gap-1">
          {[0,1,2,3,4].map((i)=>(
            <div key={i} className={`rounded ${i===1 ? 'ring-1 ring-blue-400' : ''} bg-white/5 aspect-video`}>
              <div className="m-0.5 text-[9px] text-slate-500">镜{i+1} {i*10}s</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-400">
          <div className="rounded bg-white/5 px-2 py-1">字幕：开</div>
          <div className="rounded bg-white/5 px-2 py-1">BGM：匹配</div>
          <div className="rounded bg-blue-500/20 px-2 py-1 text-blue-200">导出 MP4</div>
        </div>
      </div>
    </div>
  )
}
