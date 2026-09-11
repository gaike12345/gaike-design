import type { AspectRatio } from '../../store/useStudioStore'

// 画面比例预设
export const RATIOS: { value: AspectRatio; label: string; w: number; h: number }[] = [
  { value: '1:1', label: '1:1', w: 24, h: 24 },
  { value: '3:4', label: '3:4', w: 18, h: 24 },
  { value: '4:3', label: '4:3', w: 24, h: 18 },
  { value: '16:9', label: '16:9', w: 28, h: 16 },
  { value: '9:16', label: '9:16', w: 16, h: 28 },
]

// 比例 → Tailwind aspect 类
export const RATIO_CLASS: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-[16/9]',
  '9:16': 'aspect-[9/16]',
}
