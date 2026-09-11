// ===== 站点配置默认 seed（仅在空库初始化时执行，不会覆盖已有值） =====
import prisma from '../database/prisma'
import fs from 'fs'
import path from 'path'

export type ControlType = 'text' | 'textarea' | 'number' | 'slider' | 'color' | 'switch' | 'select'
interface DefaultItem {
  group: string
  key: string
  defaultValue: unknown
  controlType: ControlType
  label: string
  description?: string
  sort?: number
  icon?: string
  config?: Record<string, unknown>
}

// ====== 协议默认正文（从 legal/*.md 读取，admin 编辑后以 admin 内容为准） ======
// 来源：用户提交的 LiblibAI 协议，已替换品牌命名为 Man TV
const LEGAL_DIR = path.join(__dirname, 'legal')
function readLegalMd(filename: string, fallback: string): string {
  try {
    const fp = path.join(LEGAL_DIR, filename)
    if (fs.existsSync(fp)) return fs.readFileSync(fp, 'utf8')
  } catch { /* fallthrough */ }
  return fallback
}

const DEFAULT_TERMS_MD = readLegalMd('terms.md', `# 用户协议

版本 v1.0.0 · 最后更新 2026-09-02

## 一、服务说明

Man TV（以下简称"本平台"）为用户提供 AI 辅助文本、图像、音频、视频生成及社区交流服务。本平台基于已备案的生成式人工智能服务，对用户输入进行加工生成内容。

用户注册即视为同意本协议全部条款。本平台有权根据法律法规与运营需要更新协议，更新后将在平台内公示不少于 7 日，公示期满继续使用即视为同意更新后的协议。

## 二、账号与注册

- 用户须使用真实邮箱注册，并对账号与密码的安全负责。
- 禁止注册多个账号进行刷量、薅积分等滥用行为。
- 用户不得冒用他人身份注册账号。

## 三、用户行为规范

用户不得利用本平台制作、传播违法内容，平台对生成内容实施输入与输出双重审核。

## 四、免责声明

- AI 生成内容存在不确定性，平台不对生成结果准确性作保证。
- 因不可抗力、系统故障等导致的损失，平台不承担责任。

## 五、争议解决

本协议适用中华人民共和国法律。争议应首先协商解决；协商不成的，可向本平台运营地有管辖权的人民法院提起诉讼。`)

const DEFAULT_PRIVACY_MD = readLegalMd('privacy.md', `# 隐私协议

版本 v1.0.0 · 最后更新 2026-09-02
个人信息保护负责人：13372729368@163.com

## 一、收集的个人信息

本平台遵循"最小必要"原则收集：账号信息、使用记录、设备信息、上传内容。

## 二、信息使用目的

- 提供核心服务功能
- 实施输入+输出双重内容安全审核，履行生成式 AI 合规义务
- 防范滥用行为
- 满足法律法规留存与监管要求

## 三、用户权利

- 用户有权查询、更正、删除个人信息，请联系客服。

## 四、联系方式

13372729368@163.com`)

export const DEFAULT_ITEMS: DefaultItem[] = [
  // ====== ① 品牌外观 (brand) ======
  { group: 'brand', key: 'brand.site_name', defaultValue: 'Man TV', controlType: 'text', label: '站点名称', description: '显示在 Navbar、Footer、登录页', sort: 1, icon: 'Sparkles' },
  { group: 'brand', key: 'brand.site_slogan', defaultValue: 'AI 驱动的一站式创作平台', controlType: 'text', label: '站点副标题', sort: 2, icon: 'Type' },
  { group: 'brand', key: 'brand.primary_color', defaultValue: '#7c3aed', controlType: 'color', label: '品牌主色', description: '按钮、Tab 下划线、强调链接', sort: 3, icon: 'Palette' },
  { group: 'brand', key: 'brand.hero_accent', defaultValue: '#22d3ee', controlType: 'color', label: '高亮辅色', sort: 4, icon: 'Droplets' },
  { group: 'brand', key: 'brand.footer_copy', defaultValue: '© 2026 Man TV · 生成式人工智能服务已备案', controlType: 'textarea', label: 'Footer 版权文案', sort: 10, icon: 'Copyright', config: { rows: 2 } },

  // ====== ② 登录/注册页 (login) ======
  { group: 'login', key: 'login.welcome_title', defaultValue: '欢迎回来 👋', controlType: 'text', label: '登录页欢迎标题', sort: 1, icon: 'LogIn' },
  { group: 'login', key: 'login.welcome_subtitle', defaultValue: '登录 Man TV，继续你的 AI 创作旅程', controlType: 'textarea', label: '登录页欢迎副标题', sort: 2, config: { rows: 2 } },
  { group: 'login', key: 'login.new_user_tokens', defaultValue: 100000, controlType: 'slider', label: '新用户赠送积分', description: '调整后只影响此后新注册用户', sort: 3, icon: 'Gift', config: { min: 5000, max: 1000000, step: 5000, unit: '积分' } },

  // ====== ③ 首页 Hero (hero) ======
  { group: 'hero', key: 'hero.title', defaultValue: '一个想法，从 0 到作品，AI 全程陪你创作。', controlType: 'textarea', label: 'Hero 大标题', sort: 1, icon: 'Rocket', config: { rows: 2 } },
  { group: 'hero', key: 'hero.subtitle', defaultValue: '小说写作、AI 绘画、漫画分镜、语音配乐、视频生成，一个平台全部搞定。', controlType: 'textarea', label: 'Hero 副标题', sort: 2, config: { rows: 2 } },
  { group: 'hero', key: 'hero.cta_text', defaultValue: '🎬 立即开始创作', controlType: 'text', label: 'Hero 主按钮文案', sort: 3 },
  { group: 'hero', key: 'hero.cta_link', defaultValue: '/novel', controlType: 'text', label: 'Hero 主按钮跳转链接', description: '内部路径如 /novel /canvas /audio /community', sort: 4 },
  { group: 'hero', key: 'hero.bg_from', defaultValue: '#ede9fe', controlType: 'color', label: 'Hero 背景起始色', sort: 10 },
  { group: 'hero', key: 'hero.bg_to', defaultValue: '#ecfeff', controlType: 'color', label: 'Hero 背景结束色', sort: 11 },
  { group: 'hero', key: 'hero.recommend_count', defaultValue: 6, controlType: 'slider', label: '首页推荐作品数', sort: 20, icon: 'LayoutGrid', config: { min: 2, max: 18, step: 2, unit: '个' } },
  { group: 'hero', key: 'hero.recommend_sort', defaultValue: 'likes', controlType: 'select', label: '首页推荐排序方式', sort: 21, icon: 'ArrowUpDown',
    config: { options: [
      { label: '按点赞数', value: 'likes' },
      { label: '按发布时间', value: 'newest' },
      { label: '按评论数', value: 'comments' },
      { label: '随机推荐', value: 'random' },
    ] } },

  // ====== ④ 4 个 Landing ======
  { group: 'landing-novel', key: 'ln.title', defaultValue: 'AI 小说创作引擎', controlType: 'text', label: '小说写作 - 标题', sort: 1 },
  { group: 'landing-novel', key: 'ln.desc', defaultValue: '世界观构建 → 角色卡 → 自动大纲 → 章节续写 → 一致性润色，一部长篇只用 3 天。', controlType: 'textarea', label: '小说写作 - 描述', sort: 2, config: { rows: 3 } },
  { group: 'landing-novel', key: 'ln.accent', defaultValue: '#6366f1', controlType: 'color', label: '小说 - 强调色', sort: 3, icon: 'BookOpen' },

  { group: 'landing-canvas', key: 'lc.title', defaultValue: '可视化创作画布', controlType: 'text', label: '创作画布 - 标题', sort: 1 },
  { group: 'landing-canvas', key: 'lc.desc', defaultValue: '节点连接一切：文字 → 图 → 视频 → 音效，想怎么串就怎么串。', controlType: 'textarea', label: '创作画布 - 描述', sort: 2, config: { rows: 3 } },
  { group: 'landing-canvas', key: 'lc.accent', defaultValue: '#06b6d4', controlType: 'color', label: '画布 - 强调色', sort: 3, icon: 'Nodes' },

  { group: 'landing-audio', key: 'la.title', defaultValue: 'AI 音频创作工作室', controlType: 'text', label: '音频创作 - 标题', sort: 1 },
  { group: 'landing-audio', key: 'la.desc', defaultValue: 'TTS 配音 + 音乐生成 + 音效库合成，一键出你专属的播客或 BGM。', controlType: 'textarea', label: '音频创作 - 描述', sort: 2, config: { rows: 3 } },
  { group: 'landing-audio', key: 'la.accent', defaultValue: '#ec4899', controlType: 'color', label: '音频 - 强调色', sort: 3, icon: 'Music4' },

  { group: 'landing-community', key: 'lcm.title', defaultValue: '创作者社区', controlType: 'text', label: '社区 - 标题', sort: 1 },
  { group: 'landing-community', key: 'lcm.desc', defaultValue: '作品广场、做同款一键复刻、模型市场、创作者主页。', controlType: 'textarea', label: '社区 - 描述', sort: 2, config: { rows: 3 } },
  { group: 'landing-community', key: 'lcm.accent', defaultValue: '#10b981', controlType: 'color', label: '社区 - 强调色', sort: 3, icon: 'UsersRound' },

  // ====== ⑤ 定价 (pricing) ======
  { group: 'pricing', key: 'pricing.show_pro', defaultValue: true, controlType: 'switch', label: '显示 Pro 套餐卡片', sort: 1, icon: 'DollarSign' },
  { group: 'pricing', key: 'pricing.show_business', defaultValue: true, controlType: 'switch', label: '显示 商业 套餐卡片', sort: 2 },
  { group: 'pricing', key: 'pricing.pro_price_yuan', defaultValue: 29.9, controlType: 'number', label: 'Pro 月付价格 (¥)', sort: 3, config: { min: 0, max: 9999, step: 0.1 } },
  { group: 'pricing', key: 'pricing.pro_tokens', defaultValue: 500000, controlType: 'slider', label: 'Pro 套餐月积分', sort: 4, config: { min: 50000, max: 20000000, step: 50000, unit: '积分' } },

  // ====== ⑤.b 计费套餐 (billing) — H3: 从 billing.ts 硬编码迁入 SiteConfig ======
  { group: 'billing', key: 'billing.currency', defaultValue: 'CNY', controlType: 'text', label: '计费币种', sort: 1, description: 'ISO 货币代码，如 CNY / USD' },
  { group: 'billing', key: 'billing.period', defaultValue: 'month', controlType: 'text', label: '订阅周期', sort: 2, description: 'month / year' },
  { group: 'billing', key: 'billing.plans', defaultValue: [
      { id: 'free', name: '免费版', price: 0, tokens: 100000, features: ['基础生成', '社区浏览', '每日 100 次调用'] },
      { id: 'pro', name: '专业版', price: 29, tokens: 500000, features: ['无限生成', '优先队列', '高清导出', '无水印'] },
      { id: 'business', name: '商业版', price: 99, tokens: 2000000, features: ['专业版全部功能', '商用授权', 'API 接入', '专属客服'] },
      { id: 'enterprise', name: '企业版', price: 299, tokens: 10000000, features: ['商业版全部功能', '私有部署', '定制模型', 'SLA 保障'] },
    ], controlType: 'textarea', label: '会员套餐定义 (JSON)', sort: 3, icon: 'CreditCard',
    description: '数组，每项含 id/name/price/tokens/features。修改后计费接口立即生效。', config: { rows: 12 } },
  { group: 'billing', key: 'billing.recharge_packages', defaultValue: [
      { id: 'pkg_10', tokens: 100000, price: 9, bonus: 0 },
      { id: 'pkg_50', tokens: 500000, price: 39, bonus: 50000 },
      { id: 'pkg_100', tokens: 1000000, price: 69, bonus: 150000 },
      { id: 'pkg_500', tokens: 5000000, price: 299, bonus: 1000000 },
    ], controlType: 'textarea', label: '充值套餐定义 (JSON)', sort: 4, icon: 'Wallet',
    description: '数组，每项含 id/tokens/price/bonus。修改后充值接口立即生效。', config: { rows: 8 } },

  // ====== ⑥ 限流阈值 (rate-limit) ======
  { group: 'rate-limit', key: 'rl.auth_per_min_per_ip', defaultValue: 30, controlType: 'slider', label: '登录/注册 次/分钟/IP', sort: 1, description: '推荐 20~60，防爆破', icon: 'ShieldCheck', config: { min: 5, max: 200, step: 5, unit: '次/分' } },
  { group: 'rate-limit', key: 'rl.llm_per_min_per_user', defaultValue: 30, controlType: 'slider', label: 'AI 写作 LLM 次/分钟/用户', sort: 2, config: { min: 5, max: 200, step: 5, unit: '次/分' } },
  { group: 'rate-limit', key: 'rl.image_per_min_per_user', defaultValue: 20, controlType: 'slider', label: '图像生成 次/分钟/用户', sort: 3, config: { min: 2, max: 100, step: 2, unit: '次/分' } },
  { group: 'rate-limit', key: 'rl.audio_per_min_per_user', defaultValue: 20, controlType: 'slider', label: '音频生成 次/分钟/用户', sort: 4, config: { min: 2, max: 100, step: 2, unit: '次/分' } },
  { group: 'rate-limit', key: 'rl.video_per_min_per_user', defaultValue: 5, controlType: 'slider', label: '视频生成 次/分钟/用户', sort: 5, icon: 'Film', config: { min: 1, max: 30, step: 1, unit: '次/分' } },

  // ====== ⑦ 安全/AI 默认 (safety) ======
  // 审核总开关：关闭后所有 LLM 接口跳过输入/输出审核（仅应急关闭用，默认开启）
  { group: 'safety', key: 'safety.moderation_enabled', defaultValue: true, controlType: 'switch', label: '内容审核总开关', sort: 1, icon: 'ShieldCheck',
    description: '关闭后所有 AI 生成接口跳过输入/输出审核。仅在遭遇审核服务故障等紧急情况时关闭，平时务必开启。' },
  { group: 'safety', key: 'safety.announcement', defaultValue: '', controlType: 'textarea', label: '全局公告横幅（留空=关闭）', sort: 10, icon: 'Bell',
    description: '出现在 Navbar 上方的全站公告条。有内容即开启、留空即关闭。', config: { rows: 2 } },
  { group: 'safety', key: 'safety.announcement_link', defaultValue: '', controlType: 'text', label: '公告跳转链接（留空=不跳转）', sort: 11 },

  // ====== ⑦ 协议条款 (legal) — 后台可编辑，登录页弹窗读取 ======
  // 协议采用 Markdown 文本（# 标题 / ## 章节 / - 列表 / 段落），便于非技术编辑
  // 前端 LegalModal 解析渲染；修改后立即生效（双保险：主动 reload + 15s 后台轮询）
  {
    group: 'legal', key: 'legal.terms', defaultValue: DEFAULT_TERMS_MD, controlType: 'textarea',
    label: '《用户协议》正文', description: '登录页《用户协议》弹窗的完整内容（Markdown 格式：# 一级标题、## 章节标题、- 列表项、空行分段）',
    sort: 1, icon: 'FileText', config: { rows: 24 },
  },
  {
    group: 'legal', key: 'legal.privacy', defaultValue: DEFAULT_PRIVACY_MD, controlType: 'textarea',
    label: '《隐私协议》正文', description: '登录页《隐私协议》弹窗的完整内容（Markdown 格式同上）',
    sort: 2, icon: 'ShieldCheck', config: { rows: 24 },
  },
]

export async function seedSiteConfig() {
  let created = 0
  let updated = 0
  for (const item of DEFAULT_ITEMS) {
    const value = JSON.stringify(item.defaultValue)
    const configStr = item.config ? JSON.stringify(item.config) : null
    const exist = await prisma.siteConfig.findUnique({
      where: { group_key: { group: item.group, key: item.key } },
    })
    if (!exist) {
      await prisma.siteConfig.create({
        data: {
          group: item.group,
          key: item.key,
          value,
          controlType: item.controlType,
          label: item.label,
          description: item.description ?? null,
          sort: item.sort ?? 0,
          icon: item.icon ?? null,
          config: configStr,
        },
      })
      created++
    } else {
      const needUpdate =
        exist.label !== item.label ||
        (exist.sort ?? 0) !== (item.sort ?? 0) ||
        exist.icon !== (item.icon ?? null) ||
        exist.description !== (item.description ?? null) ||
        exist.controlType !== item.controlType ||
        exist.config !== configStr
      if (needUpdate) {
        await prisma.siteConfig.update({
          where: { id: exist.id },
          data: {
            label: item.label,
            sort: item.sort ?? 0,
            icon: item.icon ?? null,
            description: item.description ?? null,
            controlType: item.controlType,
            config: configStr,
          },
        })
        updated++
      }
    }
  }
  return { created, updated }
}
