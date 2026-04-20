import express from 'express';

const router = express.Router();

// 允许代理的域名白名单
const ALLOWED_HOSTS = [
  'images.unsplash.com',
  'unsplash.com',
  'i.imgur.com',
  'pbs.twimg.com',
  'assets.mixkit.co',
  'cdn.pixabay.com',
  'images.pexels.com',
  'picsum.photos',
];

router.get('/', async (req, res) => {
  const rawUrl = req.query.url;

  if (!rawUrl) {
    return res.status(400).json({ error: '缺少 url 参数' });
  }

  // URL 解码并验证
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
  } catch {
    return res.status(400).json({ error: 'URL 解码失败' });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: '无效的 URL 格式' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: '仅支持 http/https' });
  }

  // 域名白名单检查
  const hostname = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.some(h =>
    hostname === h || hostname.endsWith('.' + h)
  );

  if (!allowed) {
    return res.status(403).json({ error: '该域名不在代理白名单中' });
  }

  // 请求图片，设置 15 秒超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'identity', // 不压缩，方便处理
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return res.status(502).json({ error: `源站返回 ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    // 限制大小 20MB
    if (buffer.byteLength > 20 * 1024 * 1024) {
      return res.status(413).json({ error: '图片超过 20MB 限制' });
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Connection', 'close');
    res.send(Buffer.from(buffer));

  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: '获取图片超时（超过15秒）' });
    }
    console.error('[proxy-image] fetch error:', err.message);
    return res.status(502).json({ error: '代理获取图片失败' });
  }
});

export default router;
