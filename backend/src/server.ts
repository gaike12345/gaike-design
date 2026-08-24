/**
 * ======================================================================
 *  盖可设计圈后端服务 src/server.ts
 * ----------------------------------------------------------------------
 *  部署模式："Mock 数据优先"，无需 Postgres/DATABASE_URL 即可 100% 工作
 *  健康检查：/health
 *  API 接口：/api/config/home/all, /api/services, /api/works,
 *           /api/config/about_config, /api/config/case_studies,
 *           /api/config/cta_config
 *  CORS 放行：gaike.xyz、localhost:4173(preview)、localhost:5173(dev)
 *  监听：   0.0.0.0:$PORT  （Railway/云部署必须用 0.0.0.0 而非 127.0.0.1）
 * ======================================================================
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

const PORT = Number(process.env.PORT || 3001);
const APP_ENV = process.env.NODE_ENV || 'production';

// -------------------- 允许的 CORS 源 --------------------
const CORS_ALLOWED_ORIGINS = [
  'https://www.gaike.xyz',
  'https://gaike.xyz',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

const IMG = (name: string, w = 800, h = 500, q = 80) =>
  `https://baas-api.wanwang.xin/toc/image/preview/${name}?w=${w}&h=${h}&q=${q}`;

// -------------------- Mock 数据（与前端 fallback 完全一致，字段做了兼容） --------------------
export const BRAND = {
  name: '盖可设计圈',
  nameEn: 'Gaike Design Circle',
  tagline: '让创意落地，让设计发声',
};

export const HOME_STATS = [
  { label: '服务客户', value: '100+' },
  { label: '完成项目', value: '500+' },
  { label: '社群成员', value: '2000+' },
  { label: '行业经验', value: '5 年+' },
];

export const SERVICES = [
  {
    id: '3d-modeling',
    name: '3D 建模',
    title: '3D 建模',
    short: '角色、场景、产品三维可视化',
    description: '角色建模、场景建模、产品可视化，用三维艺术呈现无限可能。',
    image: IMG('cyberpunk-character-design.jpg', 600, 400),
    highlights: ['次世代角色', '虚幻/Unity 资产', '产品 360° 展示'],
    price: '￥2,000 起',
    icon: 'cube',
  },
  {
    id: 'app-dev',
    name: '应用开发',
    title: '应用开发',
    short: '移动应用 / Web 应用 / 交互原型',
    description: '移动应用、Web 应用、交互原型，技术驱动创意实现。',
    image: IMG('health-app-interface.jpg', 600, 400),
    highlights: ['React / Vue 前端', '小程序 / App', 'Node.js 后端'],
    price: '￥8,000 起',
    icon: 'code',
  },
  {
    id: 'concept-art',
    name: '原画设计',
    title: '原画设计',
    short: '角色 / 场景 / 概念设计',
    description: '角色原画、场景原画、概念设计，用画笔勾勒想象世界。',
    image: IMG('fantasy-scene-concept.jpg', 600, 400),
    highlights: ['游戏角色设定', '电影分镜', 'IP 美术风格'],
    price: '￥1,500 起',
    icon: 'palette',
  },
  {
    id: 'learning',
    name: '学习交友',
    title: '学习交友',
    short: '课程 / 指导 / 社群交流',
    description: '设计课程、作品指导、社群交流，与志同道合者共同成长。',
    image: IMG('creative-team-working.jpg', 600, 600),
    highlights: ['Blender 零基础班', '作品集一对一指导', '每周线上分享'],
    price: '免费加入社群',
    icon: 'users',
  },
  {
    id: 'education',
    name: '教育咨询',
    title: '教育咨询',
    short: '职业规划 / 作品集 / 留学',
    description: '职业规划、作品集指导、留学咨询，为你的设计之路指明方向。',
    image: IMG('brand-visual-system.jpg', 600, 400),
    highlights: ['国内外艺术院校申请', '转行业路径规划', '面试模拟'],
    price: '￥500 / 小时',
    icon: 'graduation-cap',
  },
];

export const WORKS = [
  { id: 1, title: '赛博朋克角色设计', category: '3D 建模', cover: IMG('cyberpunk-character-design.jpg'), tags: ['ZBrush', 'Maya'], link: '#', image: IMG('cyberpunk-character-design.jpg') },
  { id: 2, title: '健康管理 App UI/UX', category: '应用开发', cover: IMG('health-app-interface.jpg'), tags: ['React Native', 'Figma'], link: '#', image: IMG('health-app-interface.jpg') },
  { id: 3, title: '东方奇幻场景概念', category: '原画设计', cover: IMG('fantasy-scene-concept.jpg'), tags: ['PS', 'Procreate'], link: '#', image: IMG('fantasy-scene-concept.jpg') },
  { id: 4, title: '潮流品牌视觉系统', category: '其他', cover: IMG('brand-visual-system.jpg'), tags: ['Illustrator'], link: '#', image: IMG('brand-visual-system.jpg') },
  { id: 5, title: '游戏角色 3D 资产', category: '3D 建模', cover: IMG('cyber-game-character.jpg'), tags: ['Blender'], link: '#', image: IMG('cyber-game-character.jpg') },
  { id: 6, title: '移动端健康追踪 App', category: '应用开发', cover: IMG('health-app-development.jpg'), tags: ['Flutter'], link: '#', image: IMG('health-app-development.jpg') },
  { id: 7, title: '奇幻电影概念设计海报', category: '原画设计', cover: IMG('fantasy-movie-concept.jpg'), tags: ['PS', 'AI 绘画'], link: '#', image: IMG('fantasy-movie-concept.jpg') },
];

export const CASE_STUDIES = [
  { id: 1, title: '赛博游戏角色建模', category: '3D 建模', image: IMG('cyber-game-character.jpg'), description: '为 3A 游戏项目打造的主角整套建模 + 绑定 + 贴图流水线。' },
  { id: 2, title: '健康类 App 定制开发', category: '应用开发', image: IMG('health-app-development.jpg'), description: 'iOS + Android 双端，涵盖挂号、数据监测、AI 健康建议。' },
  { id: 3, title: '奇幻电影概念设计', category: '原画设计', image: IMG('fantasy-movie-concept.jpg'), description: '院线电影前期概念图 200+ 张，含世界观、角色、场景、道具。' },
];

export const CTA = {
  title: '准备好开启你的创意之旅了吗？',
  subtitle: '无论项目大小，我们都愿意陪你把想法变成现实。',
  description: '无论项目大小，我们都愿意陪你把想法变成现实。',
  buttonText: '立即咨询',
  button: { text: '立即咨询', href: '/contact' },
  href: '/contact',
};

export const ABOUT = {
  title: `不只是工作室，更是${BRAND.name}`,
  heading: `不只是工作室，更是${BRAND.name}`,
  intro: [
    '我们相信，好的设计不只是好看，更要好用、好懂、好传播。',
    `从 3D 建模到应用开发，从原画设计到职业咨询，我们提供的不只是服务，更是陪你成长的创意生态。无论你是想做一个酷炫的 3D 角色，还是开发一款自己的 App，或者只是想找个圈子一起进步，${BRAND.name}都欢迎你。`,
  ],
  stats: HOME_STATS,
  strengths: [
    { title: '创意第一', desc: '每一个项目都追求独到的创意表达。', icon: 'lightbulb' },
    { title: '技术落地', desc: '创意要能被工程实现，才算真正落地。', icon: 'rocket' },
    { title: '长期陪伴', desc: '不止交付，更是陪伴成长的伙伴关系。', icon: 'heart' },
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
};

export const HOME = {
  hero: {
    title: ['让创意落地', '让设计发声'],
    tags: ['3D 建模', '应用开发', '原画设计', '学习成长', '创意社交'],
    description: '从概念到落地，全方位支持你的创意项目。我们不只是工作室，更是你的创意成长伙伴。',
    primaryCta: { text: '探索服务', href: '/services' },
    secondaryCta: { text: '加入社群', href: '/community' },
  },
  stats: HOME_STATS,
  services: SERVICES,
  works: WORKS.slice(0, 6),
  caseStudies: CASE_STUDIES,
  cta: CTA,
};

// -------------------- Express 应用 --------------------
const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const match = CORS_ALLOWED_ORIGINS.some(
        (o) => o === origin || origin.startsWith(o.split('://')[0] + '://' + (o.split('://')[1] || '').split(':')[0])
      );
      if (match) return cb(null, true);
      if (APP_ENV !== 'production') return cb(null, true);
      cb(null, false);
    },
    credentials: false,
    maxAge: 86400,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Requested-With', 'Authorization'],
  })
);

// -------------------- 健康检查 --------------------
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'gaike-design-backend',
    timestamp: new Date().toISOString(),
    env: APP_ENV,
    endpoints: [
      '/api/config/home/all',
      '/api/services',
      '/api/works',
      '/api/config/about_config',
      '/api/config/case_studies',
      '/api/config/cta_config',
    ],
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: BRAND.name,
    tagline: BRAND.tagline,
    health: '/health',
    docs: '6 API endpoints available under /api',
  });
});

// -------------------- 6 个 API 路由 --------------------
app.get('/api/config/home/all', (_req: Request, res: Response) => {
  res.json(HOME);
});

app.get('/api/services', (req: Request, res: Response) => {
  const id = req.query.id as string | undefined;
  if (id) {
    const item = SERVICES.find((s) => s.id === id);
    if (!item) return res.status(404).json({ error: 'service not found', id });
    return res.json(item);
  }
  res.json({ items: SERVICES, total: SERVICES.length });
});

app.get('/api/works', (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const list = category ? WORKS.filter((w) => w.category === category) : WORKS;
  res.json({ items: list, total: list.length });
});

app.get('/api/config/about_config', (_req: Request, res: Response) => {
  res.json(ABOUT);
});

app.get('/api/config/case_studies', (_req: Request, res: Response) => {
  res.json({ items: CASE_STUDIES, total: CASE_STUDIES.length });
});

app.get('/api/config/cta_config', (_req: Request, res: Response) => {
  res.json(CTA);
});

// 404 fallback
app.use('*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', hint: 'see /health for available endpoints' });
});

// -------------------- 启动 --------------------
const server = app.listen(PORT, '0.0.0.0', () => {
  const info = [
    '',
    '============================================',
    `  🟢 ${BRAND.name} 后端已启动（mock-data 模式）`,
    `  🌐 http://0.0.0.0:${PORT}`,
    `  🏥 http://127.0.0.1:${PORT}/health`,
    `  📦 6 API: services(${SERVICES.length}) / works(${WORKS.length}) / case_studies(${CASE_STUDIES.length}) / home / about / cta`,
    '============================================',
    '',
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log(info);
});

server.on('error', (err: Error & { code?: string }) => {
  // eslint-disable-next-line no-console
  console.error('[backend] server error:', err.message, err.code || '');
  process.exit(1);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`\n[backend] received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
