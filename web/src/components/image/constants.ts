// 图像板块共享常量
//
// 提取自 ImagePane / Studio，消除重复定义
// 所有图像相关功能模块统一引用此处

import {
  Wand2, Sparkles, Layers, History,
} from 'lucide-react'
import type { AspectRatio } from '../../store/useStudioStore'

// 画面比例预设
export const RATIOS: { value: AspectRatio; label: string; w: number; h: number }[] = [
  { value: '1:1', label: '1:1', w: 24, h: 24 },
  { value: '3:4', label: '3:4', w: 18, h: 24 },
  { value: '4:3', label: '4:3', w: 24, h: 18 },
  { value: '16:9', label: '16:9', w: 28, h: 16 },
  { value: '9:16', label: '9:16', w: 16, h: 28 },
]

// 模型列表
export const MODELS = [
  { id: 'sdxl', name: 'SDXL 基础', tag: '通用', desc: '稳定通用大模型' },
  { id: 'flux', name: 'Flux Dev', tag: '高质量', desc: '细节表现优异' },
  { id: 'smart-v2', name: '智能图片 V2', tag: '长文本', desc: '长排版文字准确' },
  { id: 'seedream', name: 'Seedream 5.0', tag: '多语言', desc: '交互式编辑' },
  { id: 'guoman', name: '国漫专用', tag: '风格', desc: '中文漫画优化' },
]

// 提示词模板
export const TEMPLATES = [
  '赛博朋克少女机甲特写，霓虹灯，雨夜，电影质感，8k',
  '国风水墨山水画卷，云雾缭绕，远山含黛，留白构图',
  '二次元森林精灵少女，柔和光影，花瓣飘落，治愈系',
  '科幻太空站全景，星河背景，金属质感，广角镜头',
  '电商产品图，极简白底，柔光打光，高端质感',
]

// 快捷功能预设
export const PRESETS = [
  { icon: Wand2, label: 'Prompt 助手' },
  { icon: Layers, label: '角色库' },
  { icon: Sparkles, label: '画风库' },
  { icon: History, label: '历史' },
]

// ControlNet 类型
export const CONTROLNET_TYPES = [
  { id: 'canny', label: '线稿', desc: '边缘检测' },
  { id: 'depth', label: '深度', desc: '深度图' },
  { id: 'pose', label: '姿态', desc: 'OpenPose' },
  { id: 'normal', label: '法线', desc: '法线贴图' },
  { id: 'mlsd', label: '直线', desc: '建筑线' },
  { id: 'scribble', label: '涂鸦', desc: '草图引导' },
]

// 比例 → Tailwind aspect 类
export const RATIO_CLASS: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-[16/9]',
  '9:16': 'aspect-[9/16]',
}
