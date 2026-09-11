/**
 * 去 AI 味清洗器 — 从 routes/llm.ts 提取
 * 规则来源：server/src/lib/writingPrompt.ts 第 14-40 行「去AI味规则」
 */

const AI_TASTE_REPLACEMENTS: Array<{ from: RegExp; to: string; reason: string }> = [
  { from: /深吸一口气/g, to: '顿了顿', reason: '动作类禁用词' },
  { from: /不禁地/g, to: '地', reason: '动作类禁用词' },
  { from: /不禁笑/g, to: '笑', reason: '动作类禁用词' },
  { from: /不禁皱/g, to: '皱', reason: '动作类禁用词' },
  { from: /不禁(?=喊|想|打|站|点)/g, to: '', reason: '动作类禁用词' },
  { from: /一丝/g, to: '', reason: '情态类禁用词' },
  { from: /一抹/g, to: '', reason: '情态类禁用词' },
  { from: /些许/g, to: '', reason: '情态类禁用词' },
  { from: /几分/g, to: '', reason: '情态类禁用词' },
  { from: /隐约/g, to: '', reason: '情态类禁用词' },
  { from: /毫无征兆/g, to: '', reason: '情态类禁用词' },
  { from: /几不可闻/g, to: '', reason: '情态类禁用词' },
  { from: /微不可察/g, to: '', reason: '情态类禁用词' },
  { from: /仿佛/g, to: '', reason: '情态类禁用词' },
  { from: /犹如/g, to: '', reason: '情态类禁用词' },
  { from: /宛若/g, to: '', reason: '情态类禁用词' },
  { from: /如同/g, to: '', reason: '情态类禁用词' },
  { from: /嘴角勾起(?:一抹|一丝|一阵)?/g, to: '嘴角一扯', reason: '表情类禁用词' },
  { from: /眼中闪过(?:一丝|一抹|一阵|一缕)?/g, to: '眼皮一跳', reason: '表情类禁用词' },
  { from: /眉头微皱/g, to: '皱了皱眉', reason: '表情类禁用词' },
  { from: /瞳孔微缩/g, to: '眼睛眯了眯', reason: '表情类禁用词' },
  { from: /指节泛白/g, to: '手指攥紧了', reason: '表情类禁用词' },
  { from: /眼神锐利/g, to: '眼神发冷', reason: '表情类禁用词' },
  { from: /目光锐利/g, to: '目光发冷', reason: '表情类禁用词' },
  { from: /心中一动/g, to: '顿住', reason: '心理类禁用词' },
  { from: /心头一震/g, to: '手一抖', reason: '心理类禁用词' },
  { from: /心下了然/g, to: '点了点头', reason: '心理类禁用词' },
  { from: /心中暗道/g, to: '心里想', reason: '心理类禁用词' },
  { from: /心底泛起/g, to: '涌上', reason: '心理类禁用词' },
  { from: /心中一凛/g, to: '背脊一紧', reason: '心理类禁用词' },
  { from: /不由得/g, to: '', reason: '心理类禁用词' },
  { from: /不容置疑/g, to: '', reason: '判断类禁用词' },
  { from: /不容置喙/g, to: '', reason: '判断类禁用词' },
  { from: /不易察觉/g, to: '', reason: '判断类禁用词' },
  { from: /显而易见/g, to: '', reason: '判断类禁用词' },
  { from: /毫无疑问/g, to: '', reason: '判断类禁用词' },
  { from: /前所未有/g, to: '', reason: '判断类禁用词' },
  { from: /不由自主/g, to: '', reason: '过渡类禁用词' },
  { from: /情不自禁/g, to: '', reason: '过渡类禁用词' },
  { from: /自然而然/g, to: '', reason: '过渡类禁用词' },
  { from: /不是([^，。！？\n]{1,15})，而是/g, to: '$1', reason: '最毒句式' },
  { from: /——|—|--/g, to: '，', reason: '破折号禁用' },
]

export function sanitizeAiTaste(text: string): string {
  if (!text) return text
  let cleaned = text
  for (const rule of AI_TASTE_REPLACEMENTS) {
    cleaned = cleaned.replace(rule.from, rule.to)
  }
  cleaned = cleaned
    .replace(/，\s*，/g, '，')
    .replace(/，{2,}/g, '，')
    .replace(/^\s*，|，(?=[。！？；\n])/g, '')
    .replace(/\s+，/g, '，')
    .replace(/，\s+/g, '，')
  return cleaned
}
