import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  LayoutGrid,
  Grid3X3,
  Speech,
  Download,
} from 'lucide-react'

const COMIC_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Manga%20cyberpunk%20mecha%20girl%20cover%2C%20neon%20tokyo%20background%2C%20pink%20robot%20armor%20anime%20heroine%2C%20comic%20panel%20borders%2C%20speed%20lines&image_size=landscape_4_3',
    typeLabel: '赛博朋克',
    title: '机甲少女娜娜',
    author: 'NEKO',
    likes: 4821,
    filter: 'comic',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Chinese%20mythology%20fantasy%20comic%20cover%2C%20ink%20wash%20style%2C%20nine-tailed%20fox%20spirit%20on%20misty%20mountain%2C%20flowing%20silk%20robes%2C%20white%20cranes%20flying%2C%20scroll%20texture&image_size=landscape_4_3',
    typeLabel: '古风奇幻',
    title: '山海奇谈录',
    author: '白川',
    likes: 3976,
    filter: 'comic',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=High%20school%20romance%20shoujo%20manga%20cover%2C%20cherry%20blossoms%20falling%2C%20two%20students%20on%20rooftop%2C%20golden%20hour%20sunset%2C%20soft%20pastel%20tones%2C%20anime%20couple%20sparkles&image_size=landscape_4_3',
    typeLabel: '校园青春',
    title: '毕业前的告白',
    author: '小林',
    likes: 5234,
    filter: 'comic',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Japanese%20late%20night%20diner%20izakaya%20comic%20cover%2C%20warm%20lantern%20light%2C%20chef%20behind%20counter%20plating%20dish%2C%20steam%20rising%2C%20cozy%20mood%20amber%20palette&image_size=landscape_4_3',
    typeLabel: '治愈日常',
    title: '深夜食堂物语',
    author: '大辅',
    likes: 2810,
    filter: 'comic',
  },
]

/** 功能预览页：/comic — 漫画创作 */
export default function ComicLanding() {
  return (
    <FeatureLanding
      tag="漫画创作"
      heroTitle={{ prefix: 'AI 漫画', highlight: '一页封神' }}
      heroDesc="脚本自动拆分镜、画面自动出图、对话框自动排版。条漫 / 4 格 / 绘本跨页多模板，从脚本到最终 PNG / PDF 全流程无需切换工具。"
      primaryCta={{ label: '进入漫画工作区', to: '/workspace/comic' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '漫画创作工具界面', custom: <PreviewMock /> }}
      works={COMIC_WORKS}
      abilities={[
        {
          icon: <Grid3X3 className="h-6 w-6" />,
          title: '多版式模板',
          desc: '3 栏条漫、4 格漫画、绘本跨页、单图海报…预置模板一键切换尺寸。',
        },
        {
          icon: <LayoutGrid className="h-6 w-6" />,
          title: '脚本 → 分镜',
          desc: '小说脚本一键自动拆分镜，每分镜自带画面描述与对白，直接送生成。',
        },
        {
          icon: <Speech className="h-6 w-6" />,
          title: '对话气泡排版',
          desc: '对白自动生成对话气泡，形状 / 字体 / 描边自由调整，保留风格一致。',
        },
        {
          icon: <Download className="h-6 w-6" />,
          title: '批量导出',
          desc: '整页 PNG / 多页 PDF / 长图一键导出，也可直接发布社区广场。',
        },
      ]}
      steps={[
        { title: '准备脚本', desc: '在写作工作区完成小说脚本，或直接导入现成分镜稿。' },
        { title: '自动排版 + 出图', desc: 'AI 拆分镜并自动生成画面，手工微调图层、气泡、角色一致性。' },
        { title: '导出发布', desc: '整页或整卷批量导出，发布社区，同步链接分享给读者。' },
      ]}
      finalCta={{
        title: '让你的故事立刻画出来？',
        desc: '自动分镜 + 自动排版，画漫画再也不需要 Photoshop。',
        button: { label: '立即进入漫画工作区', to: '/workspace/comic' },
      }}
      accent={ACCENTS.comic}
    />
  )
}

function PreviewMock() {
  const cell = 'rounded-sm bg-white/5'
  return (
    <div className="h-full w-full p-3 text-xs text-slate-300">
      <div className="flex h-full gap-2">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${cell} relative flex items-center justify-center`}>
              <div className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-400" />
              <div className="absolute bottom-1 left-1 right-1 h-2 rounded bg-slate-900/60" />
            </div>
          ))}
        </div>
        <div className="w-[28%] space-y-1.5 text-[10px]">
          <div className={`${cell} px-2 py-1 text-slate-400`}>图层</div>
          <div className={`${cell} px-2 py-1 text-slate-300`}>✦ 分镜 1 画面</div>
          <div className={`${cell} px-2 py-1 text-slate-300`}>✦ 分镜 2 画面</div>
          <div className={`${cell} px-2 py-1 text-blue-300`}>💬 气泡-「站住！」</div>
          <div className={`${cell} px-2 py-1 text-slate-300`}>✦ 分镜 3 画面</div>
          <div className={`${cell} px-2 py-1 text-slate-300`}>✦ 分镜 4 画面</div>
        </div>
      </div>
    </div>
  )
}
