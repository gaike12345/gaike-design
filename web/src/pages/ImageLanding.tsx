import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  Image as ImageIcon,
  Wand2,
  Palette,
  Layers,
} from 'lucide-react'

const IMAGE_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Cyberpunk%20girl%20concept%20portrait%2C%20neon%20glowing%20circuit%20tattoos%2C%20futuristic%20city%20background%2C%20ultra%20detailed%20digital%20painting%2C%20pink%20cyan%20neon&image_size=landscape_4_3',
    typeLabel: '概念原画',
    title: '赛博少女肖像',
    author: 'CYBER',
    likes: 8234,
    filter: 'image',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Ghibli%20style%20forest%20illustration%2C%20morning%20mist%2C%20deer%20and%20fireflies%2C%20soft%20watercolor%20serene%20nature%2C%20warm%20golden%20light%20rays&image_size=landscape_4_3',
    typeLabel: '治愈插画',
    title: '森林清晨',
    author: '森绘',
    likes: 6721,
    filter: 'image',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Futuristic%20mech%20suit%20concept%20blueprint%2C%20titanium%20armor%2C%20glowing%20orange%20reactor%20core%2C%20industrial%20sci-fi%20technical%20drawing&image_size=landscape_4_3',
    typeLabel: '科幻设定',
    title: '机甲概念设计',
    author: '机械师',
    likes: 5938,
    filter: 'image',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Photorealistic%20ancient%20Chinese%20old%20town%20street%20sunset%2C%20golden%20hour%2C%20red%20paper%20lanterns%2C%20stone%20pavement%2C%20cinematic%20photography&image_size=landscape_4_3',
    typeLabel: '写实摄影',
    title: '古城老街',
    author: '光影',
    likes: 4125,
    filter: 'image',
  },
]

/** 功能预览页：/image — 图像创作 */
export default function ImageLanding() {
  return (
    <FeatureLanding
      tag="图像创作"
      heroTitle={{ prefix: '用文字', highlight: '描绘想象' }}
      heroDesc="从写实摄影到奇幻插画，从油画质感到像素艺术。输入你的创意描述，AI 帮你将想象变为现实。"
      primaryCta={{ label: '进入图像工作区', to: '/workspace/image' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '图像创作工具界面', custom: <PreviewMock /> }}
      works={IMAGE_WORKS}
      abilities={[
        {
          icon: <Wand2 className="h-6 w-6" />,
          title: '文生图',
          desc: '用自然语言描述画面，AI 自动生成高分辨率图像，支持多轮精修。',
        },
        {
          icon: <ImageIcon className="h-6 w-6" />,
          title: '图生图',
          desc: '上传参考图改构图、换风格、补细节，保留结构的同时注入新灵感。',
        },
        {
          icon: <Palette className="h-6 w-6" />,
          title: '风格迁移',
          desc: '赛博朋克、水墨画、吉卜力、写实摄影…一键切换艺术表现形式。',
        },
        {
          icon: <Layers className="h-6 w-6" />,
          title: '批量生成',
          desc: '一次 Prompt 出 N 张变体，自动挑选最优图，支持多角度构图。',
        },
      ]}
      steps={[
        { title: '输入画面描述', desc: '写下你想要的画面：主体、场景、光影、构图、风格词。' },
        { title: '生成与精修', desc: 'AI 出多稿，你挑选并二次精修（ControlNet / LoRA / 在画布上局部重绘）。' },
        { title: '导出与复用', desc: '导出 PNG/WebP，将角色与场景保存到素材库，供漫画/视频复用。' },
      ]}
      finalCta={{
        title: '准备好画出你的想象了吗？',
        desc: '数十种模型 + 本地素材库，让图像创作从「画」变成「描述」。',
        button: { label: '立即进入图像工作区', to: '/workspace/image' },
      }}
      accent={ACCENTS.image}
    />
  )
}

function PreviewMock() {
  const box = 'rounded bg-white/5'
  return (
    <div className="h-full w-full p-3 text-xs text-slate-300">
      <div className="flex h-full gap-2">
        <div className="w-[42%] space-y-2">
          <div className={`${box} flex items-center justify-center text-blue-300/80`} style={{ aspectRatio: '4/3' }}>
            <ImageIcon className="h-10 w-10" />
          </div>
          <div className={`${box} h-3 w-2/3`} />
          <div className={`${box} h-2 w-full`} />
          <div className={`${box} h-2 w-5/6`} />
        </div>
        <div className="flex-1 space-y-2">
          <div className={`${box} px-2 py-1 text-[10px] text-slate-400`}>Prompt</div>
          <div className={`${box} h-2 w-3/4`} />
          <div className={`${box} h-2 w-full`} />
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`${box}`} style={{ aspectRatio: '1' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
