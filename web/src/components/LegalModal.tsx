// 《用户协议》/《隐私协议》弹窗 — 内容来自后台 SiteConfig（legal.terms / legal.privacy）
// 后台 admin 编辑后立即生效（双保险：主动 reload + 15s 后台轮询）
// 当 API 不可用时退化为本地 fallback（保证弹窗始终可显示）

import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'

export type LegalType = 'terms' | 'privacy'

interface Props {
  type: LegalType
  open: boolean
  onClose: () => void
}

// —— 本地 fallback：仅当后台 SiteConfig 未返回时使用（与后端 seed v1.1.0 对齐的简版） ——
const FALLBACK_TEXT: Record<LegalType, string> = {
  terms: `# 用户协议\n\n版本 v1.1.0 · 最后更新 2026-09-02\n服务备案：生成式人工智能服务已备案\n算法备案：生成式人工智能算法已备案\n\n## 一、服务说明\n\nAI 漫剧圈（以下简称"本平台"）为用户提供 AI 辅助文本、图像、音频、视频生成及社区交流服务。\n\n用户注册即视为同意本协议全部条款。本平台有权根据法律法规与运营需要更新协议，更新后将在平台内公示不少于 7 日。\n\n## 二、账号与注册\n\n- 用户须使用真实邮箱注册，并对账号与密码的安全负责。\n- 禁止注册多个账号进行刷量、薅积分等滥用行为。\n- 用户不得冒用他人身份注册账号。\n\n## 三、用户行为规范\n\n用户不得利用本平台制作、传播违法内容（违反宪法、危害国家安全、煽动民族仇恨、散布淫秽色情、侮辱诽谤他人等）。平台对生成内容实施输入与输出双重审核，违规内容将被拦截并可能触发账号处罚。\n\n## 四、内容权利\n\n- 用户使用本平台 AI 工具生成的内容，其权利归属以当时有效的法律法规为准。\n- 用户不得将生成内容用于侵权、欺诈、深度伪造等非法用途。\n- 本平台名称、Logo、源代码等知识产权归本平台所有，未经许可不得商用。\n\n## 五、付费服务\n\n- 本平台提供积分、会员等付费服务，具体价格与权益以页面公示为准。\n- 除法律法规另有规定外，已支付费用原则上不予退还。\n\n## 六、免责声明\n\n- AI 生成内容存在不确定性，平台不对生成结果准确性作保证。\n- 因不可抗力、系统故障等导致的损失，平台不承担责任。\n\n## 七、争议解决\n\n本协议适用中华人民共和国法律。争议应首先协商解决；协商不成的，可向本平台注册地有管辖权的人民法院提起诉讼。`,
  privacy: `# 隐私协议\n\n版本 v1.1.0 · 最后更新 2026-09-02\n个人信息保护负责人：13372729368@163.com\n\n## 一、收集的个人信息\n\n本平台遵循"最小必要"原则收集：\n\n- 账号信息：邮箱、昵称、加密后的密码（bcrypt 哈希，不可逆）\n- 使用记录：生成历史、订单、积分、社区互动等日志\n- 设备信息：登录 IP、User-Agent、操作时间\n- 上传内容：提示词、图片/音频等\n- 支付信息：订单号、金额、时间（不存储完整支付凭证）\n\n## 二、信息使用目的\n\n- 提供核心服务功能\n- 实施输入+输出双重内容安全审核，履行生成式 AI 合规义务\n- 防范滥用行为\n- 满足法律法规留存与监管要求\n\n## 三、信息共享、转让与公开披露\n\n平台不会向第三方出售用户个人信息。例外情形：获得用户同意、为完成 AI 生成传输至已备案的供应商、法律法规要求、保护合法权益。\n\n## 四、境外传输与模型供应商\n\n为完成 AI 生成服务，用户输入将传输至已备案的生成式 AI 供应商（智谱、通义、Pollinations 等）。传输前已签署数据处理协议，确保等效保护。用户不同意可停止使用相关功能。\n\n## 五、用户权利\n\n- 查阅与复制、更正与补充、删除、撤回同意、注销账号、拒绝自动化决策\n\n## 六、个人信息保护负责人\n\n联系方式：13372729368@163.com。平台将在 15 个工作日内答复。\n\n## 七、投诉与救济\n\n可通过负责人邮箱投诉；对结果不满意可向网信部门投诉举报。`,
}

// —— 极简 Markdown 解析器（仅支持协议用到的语法） ——
// 支持：# 一级标题、## 二级标题、- 列表项、空行分段、其他为段落
function parseLegalMarkdown(md: string) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Array<
    | { kind: 'h1'; text: string }
    | { kind: 'h2'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'p'; text: string }
  > = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    // 空行跳过
    if (!trimmed) { i++; continue }
    // 一级标题
    if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: trimmed.slice(2).trim() })
      i++; continue
    }
    // 二级标题
    if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: trimmed.slice(3).trim() })
      i++; continue
    }
    // 列表项（连续 - 开头合并为一个 list block）
    if (trimmed.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2).trim())
        i++
      }
      blocks.push({ kind: 'list', items })
      continue
    }
    // 段落（连续非空非特殊行合并）
    const para: string[] = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t || t.startsWith('# ') || t.startsWith('## ') || t.startsWith('- ')) break
      para.push(t)
      i++
    }
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
  }
  return blocks
}

export default function LegalModal({ type, open, onClose }: Props) {
  const { get } = useSiteConfig()
  const rawMd = get<string>(`legal.${type}`, FALLBACK_TEXT[type])

  const blocks = useMemo(() => parseLegalMarkdown(rawMd), [rawMd])

  // ESC 关闭 + 滚动锁定
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-[92vw] max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-bold text-neutral-900">
            {type === 'terms' ? '用户协议' : '隐私协议'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 正文 — Markdown 渲染 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-neutral-700">
          {blocks.map((b, idx) => {
            if (b.kind === 'h1') {
              return (
                <h1 key={idx} className="mb-1 text-xl font-bold text-neutral-900">{b.text}</h1>
              )
            }
            if (b.kind === 'h2') {
              return (
                <h3 key={idx} className="mb-2 mt-5 text-sm font-semibold text-neutral-900">{b.text}</h3>
              )
            }
            if (b.kind === 'list') {
              return (
                <ul key={idx} className="mb-3 space-y-1 pl-5">
                  {b.items.map((it, j) => (
                    <li key={j} className="list-disc text-[13px] leading-6 text-neutral-600">{it}</li>
                  ))}
                </ul>
              )
            }
            return (
              <p key={idx} className="mb-3 text-[13px] leading-6 text-neutral-600">{b.text}</p>
            )
          })}
          <p className="mt-6 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
            勾选即表示您已阅读并同意本协议全部条款。
          </p>
        </div>

        {/* 底部 */}
        <div className="shrink-0 border-t border-neutral-200 px-6 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            我已阅读
          </button>
        </div>
      </div>
    </div>
  )
}
