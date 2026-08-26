const fs=require('fs');

// ===== 1. 创建生成中间件 withGeneration =====
const middlewarePath='server/src/middleware/generation.ts';
const middlewareContent = `import { Request, Response, NextFunction } from 'express'
import { logGeneration, checkQuota } from '../lib/generation'

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      _genStartTime?: number
      _genType?: string
      _genTokens?: number
    }
  }
}

// 生成中间件：检查额度 → 记录开始时间 → 拦截响应写日志
export function withGeneration(type: string, tokensRequired: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录后再使用 AI 创作功能' })
    }
    // 检查额度
    const quota = await checkQuota(req.user.userId, tokensRequired)
    if (!quota.ok) {
      return res.status(402).json({ error: quota.message || 'Token 额度不足' })
    }
    req._genStartTime = Date.now()
    req._genType = type
    req._genTokens = tokensRequired
    // 拦截 res.json 写生成日志
    const originalJson = res.json.bind(res)
    res.json = (data?: any) => {
      const status = (data && data.ok === false) ? 'failed' : 'success'
      logGeneration({
        userId: req.user!.userId,
        type,
        modelId: req.body?.model || req.body?.voice || undefined,
        provider: undefined,
        input: JSON.stringify(req.body || {}).slice(0, 500),
        output: JSON.stringify(data || {}).slice(0, 500),
        tokensUsed: tokensRequired,
        duration: req._genStartTime ? Date.now() - req._genStartTime : 0,
        status,
        errorMsg: status === 'failed' ? data?.error : undefined,
      }).catch(() => {})
      return originalJson(data)
    }
    next()
  }
}
`;
fs.writeFileSync(middlewarePath, middlewareContent, 'utf8');
console.log('[1] generation middleware created');

// ===== 2. llm.ts — 改为 authRequired + withGeneration =====
const llmPath='server/src/routes/llm.ts';
let llm=fs.readFileSync(llmPath,'utf8');
llm=llm.replace(
  "import { authOptional } from '../middleware/auth'",
  "import { authRequired } from '../middleware/auth'\nimport { withGeneration } from '../middleware/generation'"
);
llm=llm.replace(
  "router.use(authOptional)",
  "router.use(authRequired)"
);
// 给主要生成接口加 withGeneration（token 成本 500）
const llmEndpoints = [
  '/synopsis-options', '/master-outline', '/character-relations',
  '/volume-outline', '/chapter-outline', '/continue-plot',
  '/inspiration', '/outline-acts', '/expand-chapter',
  '/generate-text', '/rewrite', '/polish'
];
for (const ep of llmEndpoints) {
  llm=llm.replace(
    `router.post('${ep}', async`,
    `router.post('${ep}', withGeneration('novel', 500), async`
  );
}
fs.writeFileSync(llmPath, llm, 'utf8');
console.log('[2] llm.ts patched with authRequired + withGeneration');

// ===== 3. image.ts — 改为 authRequired + withGeneration =====
const imgPath='server/src/routes/image.ts';
let img=fs.readFileSync(imgPath,'utf8');
img=img.replace(
  "import { authOptional } from '../middleware/auth'",
  "import { authRequired } from '../middleware/auth'\nimport { withGeneration } from '../middleware/generation'"
);
img=img.replace(
  "router.use(authOptional)",
  "router.use(authRequired)"
);
img=img.replace(
  "router.post('/generate', async",
  "router.post('/generate', withGeneration('image', 1000), async"
);
img=img.replace(
  "router.post('/img2img', async",
  "router.post('/img2img', withGeneration('image', 1000), async"
);
img=img.replace(
  "router.post('/enhance-prompt', async",
  "router.post('/enhance-prompt', withGeneration('novel', 200), async"
);
fs.writeFileSync(imgPath, img, 'utf8');
console.log('[3] image.ts patched');

// ===== 4. audio.ts — 改为 authRequired + withGeneration =====
const audioPath='server/src/routes/audio.ts';
let audio=fs.readFileSync(audioPath,'utf8');
audio=audio.replace(
  "import { authOptional } from '../middleware/auth'",
  "import { authRequired } from '../middleware/auth'\nimport { withGeneration } from '../middleware/generation'"
);
audio=audio.replace(
  "router.use(authOptional)",
  "router.use(authRequired)"
);
audio=audio.replace(
  "router.post('/tts', async",
  "router.post('/tts', withGeneration('audio', 500), async"
);
audio=audio.replace(
  "router.post('/music', async",
  "router.post('/music', withGeneration('audio', 1000), async"
);
fs.writeFileSync(audioPath, audio, 'utf8');
console.log('[4] audio.ts patched');

// ===== 5. video.ts — 改为 authRequired + withGeneration =====
const videoPath='server/src/routes/video.ts';
let video=fs.readFileSync(videoPath,'utf8');
video=video.replace(
  "import { authOptional } from '../middleware/auth'",
  "import { authRequired } from '../middleware/auth'\nimport { withGeneration } from '../middleware/generation'"
);
video=video.replace(
  "router.use(authOptional)",
  "router.use(authRequired)"
);
video=video.replace(
  "router.post('/text2video', async",
  "router.post('/text2video', withGeneration('video', 5000), async"
);
video=video.replace(
  "router.post('/img2video', async",
  "router.post('/img2video', withGeneration('video', 5000), async"
);
fs.writeFileSync(videoPath, video, 'utf8');
console.log('[5] video.ts patched');

console.log('\nAll AI routes patched with authRequired + withGeneration');
