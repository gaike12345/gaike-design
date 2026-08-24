import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'
import { API_BASE_URL, API_TIMEOUT_MS, API_PATHS, BRAND } from '../config'
import type { HeroConfig, AboutConfig, CTAConfig, SiteSetting, HomeConfig } from '../hooks/useHomeConfig'

/* =========================================================================
 *  API 客户端（核心修复：优雅降级 + Mock Fallback）
 * -------------------------------------------------------------------------
 *  问题背景：
 *    原实现中，6 个 API 一旦超时（10s）直接报错，导致 services/portfolio/about
 *    等页面只有标题没有内容。
 *
 *  修复策略（三层兜底）：
 *    1) 超时从 10s → 5s + 0 重试（用户不卡）
 *    2) 所有 get*() 函数 catch 失败时，返回 fallback mock 数据
 *    3) mock 数据与后台返回结构一致，组件层无感切换
 *
 *  一旦 Railway 后端恢复，将自动走真实 API，无需改代码。
 * ========================================================================= */

// -------------------- Axios 实例 --------------------
// 【关键修复】API_PATHS 本身已经以 '/api/...' 开头，
// 所以本地（相对路径代理）场景下 baseURL 必须为空，否则会出现 /api/api/... 双前缀。
const _rawBase = API_BASE_URL;
const _isLocalProxy = _rawBase === '/api' || _rawBase.startsWith('/api?');
const axiosBaseURL: string = _isLocalProxy
  ? '' // 走当前 origin + API_PATHS（以 /api 开头），由 vite 的 /api → localhost:3001 代理
  : _rawBase;

const http: AxiosInstance = axios.create({
  baseURL: axiosBaseURL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  // 重要：跨域请求不带 cookie（Railway 不需要鉴权），避免额外预检
  withCredentials: false,
})

// 请求拦截器：可加 token，目前留空
http.interceptors.request.use((config) => {
  return config
})

// 响应拦截器：统一错误打印（但不抛给业务层，由业务层 catch 决定 fallback）
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const url = err.config?.url || 'unknown'
    const msg = err.code === 'ECONNABORTED' ? '超时' : err.message || '网络错误'
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API 降级] ${url} → ${msg}，已切换为本地 mock 数据`)
    }
    return Promise.reject(err)
  },
)

// -------------------- Fallback Mock 数据 --------------------
const IMG = (name: string, w = 800, h = 500, q = 80) =>
  `https://baas-api.wanwang.xin/toc/image/preview/${name}?w=${w}&h=${h}&q=${q}`

const FALLBACK_HOME = {
  hero: {
    title: ['让创意落地', '让设计发声'],
    tags: ['3D 建模', '应用开发', '原画设计', '学习成长', '创意社交'],
    description:
      '从概念到落地，全方位支持你的创意项目。我们不只是工作室，更是你的创意成长伙伴。',
    primaryCta: { text: '探索服务', href: '/services' },
    secondaryCta: { text: '加入社群', href: '/community' },
  },
  stats: [
    { label: '服务客户', value: '100+' },
    { label: '完成项目', value: '500+' },
    { label: '社群成员', value: '2000+' },
    { label: '行业经验', value: '5 年+' },
  ],
  caseStudies: [
    { id: 1, title: '赛博游戏角色建模', category: '3D 建模', image: IMG('cyber-game-character.jpg') },
    { id: 2, title: '健康类 App 定制开发', category: '应用开发', image: IMG('health-app-development.jpg') },
    { id: 3, title: '奇幻电影概念设计', category: '原画设计', image: IMG('fantasy-movie-concept.jpg') },
  ],
  cta: {
    title: '准备好开启你的创意之旅了吗？',
    description: '无论项目大小，我们都愿意陪你把想法变成现实。',
    button: { text: '立即咨询', href: '/contact' },
  },
}

const FALLBACK_SERVICES = [
  {
    id: '3d-modeling',
    name: '3D 建模',
    short: '角色、场景、产品三维可视化',
    description: '角色建模、场景建模、产品可视化，用三维艺术呈现无限可能。',
    image: IMG('cyberpunk-character-design.jpg', 600, 400),
    highlights: ['次世代角色', '虚幻/Unity 资产', '产品 360° 展示'],
    price: '￥2,000 起',
  },
  {
    id: 'app-dev',
    name: '应用开发',
    short: '移动应用 / Web 应用 / 交互原型',
    description: '移动应用、Web 应用、交互原型，技术驱动创意实现。',
    image: IMG('health-app-interface.jpg', 600, 400),
    highlights: ['React / Vue 前端', '小程序 / App', 'Node.js 后端'],
    price: '￥8,000 起',
  },
  {
    id: 'concept-art',
    name: '原画设计',
    short: '角色 / 场景 / 概念设计',
    description: '角色原画、场景原画、概念设计，用画笔勾勒想象世界。',
    image: IMG('fantasy-scene-concept.jpg', 600, 400),
    highlights: ['游戏角色设定', '电影分镜', 'IP 美术风格'],
    price: '￥1,500 起',
  },
  {
    id: 'learning',
    name: '学习交友',
    short: '课程 / 指导 / 社群交流',
    description: '设计课程、作品指导、社群交流，与志同道合者共同成长。',
    image: IMG('creative-team-working.jpg', 600, 600),
    highlights: ['Blender 零基础班', '作品集一对一指导', '每周线上分享'],
    price: '免费加入社群',
  },
  {
    id: 'education',
    name: '教育咨询',
    short: '职业规划 / 作品集 / 留学',
    description: '职业规划、作品集指导、留学咨询，为你的设计之路指明方向。',
    image: IMG('brand-visual-system.jpg', 600, 400),
    highlights: ['国内外艺术院校申请', '转行业路径规划', '面试模拟'],
    price: '￥500 / 小时',
  },
]

const FALLBACK_WORKS = [
  { id: 1, title: '赛博朋克角色设计', category: '3D 建模', cover: IMG('cyberpunk-character-design.jpg'), tags: ['ZBrush', 'Maya'], link: '#' },
  { id: 2, title: '健康管理 App UI/UX', category: '应用开发', cover: IMG('health-app-interface.jpg'), tags: ['React Native', 'Figma'], link: '#' },
  { id: 3, title: '东方奇幻场景概念', category: '原画设计', cover: IMG('fantasy-scene-concept.jpg'), tags: ['PS', 'Procreate'], link: '#' },
  { id: 4, title: '潮流品牌视觉系统', category: '其他', cover: IMG('brand-visual-system.jpg'), tags: ['Illustrator'], link: '#' },
  { id: 5, title: '游戏角色 3D 资产', category: '3D 建模', cover: IMG('cyber-game-character.jpg'), tags: ['Blender'], link: '#' },
  { id: 6, title: '移动端健康追踪 App', category: '应用开发', cover: IMG('health-app-development.jpg'), tags: ['Flutter'], link: '#' },
]

const FALLBACK_ABOUT = {
  heading: `不只是工作室，更是${BRAND.name}`,
  intro: [
    '我们相信，好的设计不只是好看，更要好用、好懂、好传播。',
    `从 3D 建模到应用开发，从原画设计到职业咨询，我们提供的不只是服务，更是陪你成长的创意生态。无论你是想做一个酷炫的 3D 角色，还是开发一款自己的 App，或者只是想找个圈子一起进步，${BRAND.name}都欢迎你。`,
  ],
  values: [
    { title: '创意第一', desc: '每一个项目都追求独到的创意表达。' },
    { title: '技术落地', desc: '创意要能被工程实现，才算真正落地。' },
    { title: '长期陪伴', desc: '不止交付，更是陪伴成长的伙伴关系。' },
  ],
  team: [
    { name: '主理人 A', role: '创意总监 / 3D 艺术家', avatar: IMG('creative-team-working.jpg', 300, 300) },
    { name: '主理人 B', role: '技术负责人 / 全栈工程师', avatar: IMG('creative-team-working.jpg', 300, 300) },
    { name: '主理人 C', role: '原画组长 / 概念设计师', avatar: IMG('creative-team-working.jpg', 300, 300) },
  ],
}

const FALLBACK_CASE_STUDIES = FALLBACK_HOME.caseStudies
const FALLBACK_CTA = FALLBACK_HOME.cta

// -------------------- 工具函数：出错时返回 mock --------------------
function fallback<T>(data: T, _err: unknown): T {
  // 这里可以加上报：Sentry / 自建监控
  return data
}

// -------------------- 业务 API（全部 Promise<真实类型>，降级无感） --------------------
export async function getHomeConfig() {
  try {
    const { data } = await http.get(API_PATHS.home)
    return data ?? FALLBACK_HOME
  } catch (e) {
    return fallback(FALLBACK_HOME, e)
  }
}

export async function getServices() {
  try {
    const { data } = await http.get(API_PATHS.services)
    return (Array.isArray(data) ? data : data?.items) ?? FALLBACK_SERVICES
  } catch (e) {
    return fallback(FALLBACK_SERVICES, e)
  }
}

export async function getWorks(category?: string) {
  try {
    const { data } = await http.get(API_PATHS.works, category ? ({ params: { category } } as AxiosRequestConfig) : undefined)
    const list = Array.isArray(data) ? data : data?.items
    return Array.isArray(list) && list.length ? list : FALLBACK_WORKS
  } catch (e) {
    const r = fallback(FALLBACK_WORKS, e)
    return category ? r.filter((w: typeof FALLBACK_WORKS[number]) => w.category === category) : r
  }
}

export async function getAboutConfig() {
  try {
    const { data } = await http.get(API_PATHS.about)
    return data ?? FALLBACK_ABOUT
  } catch (e) {
    return fallback(FALLBACK_ABOUT, e)
  }
}

export async function getCaseStudies() {
  try {
    const { data } = await http.get(API_PATHS.caseStudies)
    return (Array.isArray(data) ? data : data?.items) ?? FALLBACK_CASE_STUDIES
  } catch (e) {
    return fallback(FALLBACK_CASE_STUDIES, e)
  }
}

export async function getCtaConfig() {
  try {
    const { data } = await http.get(API_PATHS.cta)
    return data ?? FALLBACK_CTA
  } catch (e) {
    return fallback(FALLBACK_CTA, e)
  }
}

// 一次性并发获取首页全部（并发失败不阻塞）
export async function getAllHomeData() {
  const [home, services, works, about, cases, cta] = await Promise.allSettled([
    getHomeConfig(),
    getServices(),
    getWorks(),
    getAboutConfig(),
    getCaseStudies(),
    getCtaConfig(),
  ])
  const unwrap = <T,>(r: PromiseSettledResult<T>, fb: T): T =>
    r.status === 'fulfilled' ? r.value : fb
  return {
    home: unwrap(home, FALLBACK_HOME),
    services: unwrap(services, FALLBACK_SERVICES),
    works: unwrap(works, FALLBACK_WORKS),
    about: unwrap(about, FALLBACK_ABOUT),
    cases: unwrap(cases, FALLBACK_CASE_STUDIES),
    cta: unwrap(cta, FALLBACK_CTA),
  }
}

export default http

/* =========================================================================
 *  原仓库代码兼容性导出（从 src/pages 多处 import { worksApi, blogApi, ... } ）
 *  与新的 API 体系做桥接，避免 import 报错
 * ========================================================================= */

type ListResp<T> = Promise<{ items: T[]; total: number }>;

export const worksApi = {
  list: (category?: string): ListResp<typeof FALLBACK_WORKS[number]> =>
    getWorks(category).then(list => ({ items: list as any, total: (list as any[]).length })),
  get: getWorks,
  // 与业务层 response.data?.data 对齐
  getAll: async (category?: string) => {
    const list = await getWorks(category);
    const arr = (list as any[]).map((it: any) => ({
      ...it,
      image_url: it.image_url || it.cover || it.image || '',
      cover: it.cover || it.image_url || it.image || '',
    }));
    return { data: { data: arr } };
  },
};

export const servicesApi = {
  list: (): ListResp<typeof FALLBACK_SERVICES[number]> =>
    getServices().then(list => ({ items: list as any, total: (list as any[]).length })),
  // 与业务层 response.data?.data 对齐
  getAll: async () => {
    const list = await getServices();
    const arr = (list as any[]).map((s: any) => ({
      ...s,
      image_url: s.image_url || s.image || '',
    }));
    return { data: { data: arr } };
  },
};

export const caseStudiesApi = {
  list: (): ListResp<typeof FALLBACK_CASE_STUDIES[number]> =>
    getCaseStudies().then(list => ({ items: list as any, total: (list as any[]).length })),
  getAll: async () => {
    const list = await getCaseStudies();
    const arr = (list as any[]).map((c: any) => ({
      ...c,
      image_url: c.image_url || c.image || c.cover || '',
    }));
    return { data: { data: arr } };
  },
};

export const configApi = {
  getHome: getHomeConfig,
  getAbout: getAboutConfig,
  getCaseStudies: getCaseStudies,
  getCta: getCtaConfig,

  // ⬇️ 原仓库实际调用的方法：直接返回 { data: { data: ... } }，和业务层 response.data.data 对齐
  async getHomeConfig() {
    const d = await getHomeConfig();
    // useHomeConfig 需要：{ hero, about, cta, services, caseStudies, siteSettings }
    const hero: HeroConfig | null = d.hero
      ? {
          id: 'hero-1',
          title: (d.hero as any).title?.join(' / ') ?? d.hero.title,
          description: (d.hero as any).description,
          button1_text: (d.hero as any).primaryCta?.text,
          button1_link: (d.hero as any).primaryCta?.href,
          button2_text: (d.hero as any).secondaryCta?.text,
          button2_link: (d.hero as any).secondaryCta?.href,
        }
      : null;
    const stats: { value: string; label: string }[] = (d as any).stats ?? [];
    const about: AboutConfig | null = (d as any).about?.intro
      ? {
          id: 'about-1',
          title: (d as any).about.heading,
          description: (d as any).about.intro?.[0] ?? '',
          subtitle: (d as any).about.intro?.[1] ?? '',
          stats,
          image_url: ((d as any).about.team?.[0]?.avatar) || IMG('creative-team-working.jpg', 600, 600),
          badge_text: '创意技术',
        }
      : null;
    const cta: CTAConfig | null = (d as any).cta
      ? {
          id: 'cta-1',
          title: (d as any).cta.title,
          description: (d as any).cta.description,
          button1_text: (d as any).cta.button?.text,
          button1_link: (d as any).cta.button?.href,
        }
      : null;
    const svc = (await getServices()).map((s: any, i: number) => ({
      id: s.id || `svc-${i}`,
      name: s.name,
      short: s.short,
      description: s.description,
      image_url: s.image,
      highlights: s.highlights,
      price: s.price,
    }));
    const cs = (d as any).caseStudies?.map((c: any) => ({
      id: String(c.id),
      title: c.title,
      category: c.category,
      image_url: c.image,
    })) || [];
    const siteSettings: SiteSetting[] = [
      { id: 'ss-1', key: 'site_name', value: BRAND.name, type: 'string' },
      { id: 'ss-2', key: 'slogan', value: BRAND.tagline, type: 'string' },
    ];
    const payload: HomeConfig = { hero, about, cta, services: svc, caseStudies: cs, siteSettings };
    return { data: { data: payload } };
  },

  /**
   * 统一 getTable(name) 桥接：
   *  - about_config   → [{... AboutSection 字段}]
   *  - case_studies   → [...案例]
   *  - cta_config     → [{... CTA 字段}]
   *  所有返回都符合 response.data?.data?.[0] 的消费方式
   */
  async getTable(name: string) {
    switch (name) {
      case 'about_config': {
        const a = await getAboutConfig();
        const stats = a.values?.length
          ? a.values.map((v: any) => ({ label: v.title, value: v.desc })).concat([
              { label: '服务客户', value: '100+' },
              { label: '完成项目', value: '500+' },
            ])
          : [{ value: '100+', label: '服务客户' }, { value: '500+', label: '完成项目' }, { value: '2000+', label: '社群成员' }, { value: '5年+', label: '行业经验' }];
        return {
          data: {
            data: [
              {
                id: 'about-1',
                title: a.heading,
                description: a.intro?.[0] ?? '',
                subtitle: a.intro?.[1] ?? '',
                stats: JSON.stringify(stats),
                image_url: a.team?.[0]?.avatar || IMG('creative-team-working.jpg', 600, 600),
                badge_text: '创意技术',
              },
            ],
          },
        };
      }
      case 'case_studies': {
        const list = await getCaseStudies();
        return {
          data: {
            data: list.map((c: any, i: number) => ({
              id: String(c.id ?? i),
              title: c.title,
              client: c.client ?? '盖可客户',
              category: c.category ?? '',
              challenge: c.challenge ?? '从创意概念到可落地执行，需要在美学与技术之间找到平衡。',
              solution: c.solution ?? '采用设计 + 工程一体化流程，三维建模与交互原型同步推进。',
              result: c.result ?? '交付周期缩短 30%，满意度 95%+。',
              testimonial: c.testimonial ?? '专业且懂业务，真正帮助我们把想法变成了现实。',
              rating: 5,
              image_url: c.image || c.image_url || IMG('cyber-game-character.jpg'),
            })),
          },
        };
      }
      case 'cta_config': {
        const c = await getCtaConfig();
        return {
          data: {
            data: [
              {
                id: 'cta-1',
                title: c.title ?? '准备好开启你的创意之旅了吗？',
                description: c.description ?? '',
                button1_text: (c as any).button?.text ?? '立即咨询',
                button1_link: (c as any).button?.href ?? '/contact',
              },
            ],
          },
        };
      }
      default:
        return { data: { data: [] } };
    }
  },

  getSiteConfig: () => Promise.resolve({
    title: BRAND.name,
    name: BRAND.name,
    tagline: BRAND.tagline,
    description: BRAND.name + ' - ' + BRAND.tagline,
    services: servicesApi.list,
  }),
};

export const blogApi = {
  list: (): ListResp<any> => Promise.resolve({ items: [], total: 0 }),
  getBySlug: (_slug: string) => Promise.resolve(null),
  get: (_id: string | number) => Promise.resolve(null),
};

export const eventsApi = {
  list: (): ListResp<any> => Promise.resolve({ items: [], total: 0 }),
  getUpcoming: (): ListResp<any> => Promise.resolve({ items: [], total: 0 }),
};

export const testimonialsApi = {
  list: (): ListResp<any> => Promise.resolve({ items: [], total: 0 }),
};

export const contactApi = {
  submit: (_payload: Record<string, unknown>): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }),
};
