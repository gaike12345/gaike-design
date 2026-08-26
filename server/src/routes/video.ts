import { Router } from 'express'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'

const router = Router()
router.use(authRequired)

// 异步任务存储（MVP 阶段用内存，生产换 Redis）
const tasks = new Map<string, { status: string; url?: string; prompt: string; createdAt: number }>()

// POST /api/video/text2video — 文生视频
router.post('/text2video', withGeneration('video', 5000), async (req, res) => {
  const { prompt, duration = 5 } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
  const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  tasks.set(taskId, { status: 'queued', prompt, createdAt: Date.now() })

  // TODO: 对接视频生成 API（如可灵、即梦、Runway）
  // MVP 阶段模拟：3 秒后标记完成
  setTimeout(() => {
    const t = tasks.get(taskId)
    if (t) {
      t.status = 'done'
      t.url = `/uploads/video-placeholder.mp4`
    }
  }, 3000)

  res.json({ taskId, status: 'queued', duration })
})

// POST /api/video/img2video — 图生视频
router.post('/img2video', withGeneration('video', 5000), async (req, res) => {
  const { imageUrl, prompt = '' } = req.body
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' })
  const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  tasks.set(taskId, { status: 'queued', prompt, createdAt: Date.now() })

  setTimeout(() => {
    const t = tasks.get(taskId)
    if (t) {
      t.status = 'done'
      t.url = `/uploads/video-placeholder.mp4`
    }
  }, 3000)

  res.json({ taskId, status: 'queued' })
})

// GET /api/video/task/:taskId — 查询视频生成状态
router.get('/task/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) return res.status(404).json({ error: '任务不存在' })
  res.json({ status: task.status, url: task.url, prompt: task.prompt })
})

export default router
