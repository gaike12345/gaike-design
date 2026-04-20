import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = express.Router();

// 允许代理的域名白名单（防止 SSRF 攻击）
const ALLOWED_DOMAINS = [
  'images.unsplash.com',
  'unsplash.com',
  'i.imgur.com',
  'imgur.com',
  'pbs.twimg.com',
  'twimg.com',
  'github.com',
  'raw.githubusercontent.com',
  'assets.mixkit.co',
  'cdn.pixabay.com',
  'pixabay.com',
  'images.pexels.com',
  'pexels.com',
];

// 缓存配置
const imageCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
const MAX_CACHE_SIZE = 100; // 最多缓存100张图片

router.get('/', async (req, res) => {
  let targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: '缺少 url 参数' });
  }

  // URL 解码
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch {
    return res.status(400).json({ error: 'URL 解码失败' });
  }

  // 验证 URL 格式
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: '无效的 URL' });
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return res.status(400).json({ error: '仅支持 http/https 协议' });
  }

  // 域名白名单检查
  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowed = ALLOWED_DOMAINS.some(domain =>
    hostname === domain || hostname.endsWith('.' + domain)
  );

  if (!isAllowed) {
    return res.status(403).json({ error: '该域名不在代理白名单中' });
  }

  // 检查缓存
  const cacheKey = targetUrl;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Cache', 'HIT');
    return res.send(cached.data);
  }

  // 从源站获取图片
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({ error: '源站返回错误' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    // 写入缓存
    if (imageCache.size >= MAX_CACHE_SIZE) {
      // 删除最早的缓存
      const oldest = imageCache.keys().next().value;
      imageCache.delete(oldest);
    }
    imageCache.set(cacheKey, {
      data: buffer,
      contentType,
      timestamp: Date.now(),
    });

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Cache', 'MISS');
    res.send(buffer);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: '获取图片超时' });
    }
    console.error('Image proxy error:', err.message);
    return res.status(502).json({ error: '代理获取图片失败' });
  }
});

export default router;
