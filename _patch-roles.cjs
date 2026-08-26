const fs=require('fs');

// ===== 1. schema.prisma — 更新 role 注释 =====
const schemaPath='server/prisma/schema.prisma';
let schema=fs.readFileSync(schemaPath,'utf8');
schema=schema.replace(
  'role      String   @default("user") // user | creator | moderator | admin',
  'role      String   @default("user") // user | creator | moderator | admin | superadmin'
);
fs.writeFileSync(schemaPath,schema,'utf8');
console.log('[1] schema.prisma role comment updated');

// ===== 2. auth.ts 中间件 — 新增 requireSuperAdmin / requireAdminOrAbove =====
const authPath='server/src/middleware/auth.ts';
let auth=fs.readFileSync(authPath,'utf8');
// 在 requireRole 函数后追加两个新中间件
auth+='\n// 超级管理员专属'
+ '\nexport function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {'
+ '\n  if (!req.user) return res.status(401).json({ error: "未登录" })'
+ '\n  if (req.user.role !== "superadmin") return res.status(403).json({ error: "需要超级管理员权限" })'
+ '\n  next()\n}'
+ '\n// 管理员及以上（admin + superadmin 均可）'
+ '\nexport function requireAdminOrAbove(req: Request, res: Response, next: NextFunction) {'
+ '\n  if (!req.user) return res.status(401).json({ error: "未登录" })'
+ '\n  const r = req.user.role || "user"'
+ '\n  if (r !== "admin" && r !== "superadmin") return res.status(403).json({ error: "需要管理员权限" })'
+ '\n  next()\n}';
fs.writeFileSync(authPath,auth,'utf8');
console.log('[2] auth.ts middleware updated');

// ===== 3. admin.ts 路由 — 权限分层 =====
const adminPath='server/src/routes/admin.ts';
let admin=fs.readFileSync(adminPath,'utf8');

// 3a. 替换 import 和 router.use
admin=admin.replace(
  "import { authRequired, requireRole } from '../middleware/auth'",
  "import { authRequired, requireRole, requireSuperAdmin, requireAdminOrAbove } from '../middleware/auth'"
);
admin=admin.replace(
  "router.use(authRequired, requireRole('admin'))",
  "// 管理员及以上均可访问；超级管理员专属接口单独加 requireSuperAdmin\nrouter.use(authRequired, requireAdminOrAbove)"
);

// 3b. 更新 VALID_ROLES
admin=admin.replace(
  "const VALID_ROLES = ['user', 'creator', 'moderator', 'admin'] as const",
  "const VALID_ROLES = ['user', 'creator', 'moderator', 'admin', 'superadmin'] as const"
);

// 3c. 给超级管理员专属接口加 requireSuperAdmin
// stats
admin=admin.replace(
  "router.get('/stats',",
  "router.get('/stats', requireSuperAdmin,"
);
// logs
admin=admin.replace(
  "router.get('/logs',",
  "router.get('/logs', requireSuperAdmin,"
);
// generations
admin=admin.replace(
  "router.get('/generations',",
  "router.get('/generations', requireSuperAdmin,"
);
// features POST/PUT/DELETE
admin=admin.replace(
  "router.post('/features',",
  "router.post('/features', requireSuperAdmin,"
);
admin=admin.replace(
  "router.put('/features/:id',",
  "router.put('/features/:id', requireSuperAdmin,"
);
admin=admin.replace(
  "router.delete('/features/:id',",
  "router.delete('/features/:id', requireSuperAdmin,"
);
// role change — superadmin only
admin=admin.replace(
  "router.put('/users/:id/role',",
  "router.put('/users/:id/role', requireSuperAdmin,"
);

// 3d. 新增 POST /users — 新增用户（admin+ 可用）
const newUserEndpoint = `
// 12. POST /users — 新增用户（管理员可操作）
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, nickname, role } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }
    // 检查邮箱是否已存在
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: '该邮箱已注册' })
    }
    // 只有 superadmin 可以创建 superadmin
    const targetRole = (role === 'superadmin' && req.user?.role !== 'superadmin') ? 'user' : (role || 'user')
    if (!isRole(targetRole)) {
      return res.status(400).json({ error: '非法的角色值' })
    }
    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(String(password), 10)
    const newUser = await prisma.user.create({
      data: {
        email: String(email),
        password: hashedPassword,
        nickname: nickname ? String(nickname) : String(email).split('@')[0],
        role: targetRole,
      },
      select: {
        id: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true,
      },
    })
    // 初始化额度
    const plan = targetRole === 'superadmin' ? 'enterprise' : 'free'
    const totalTokens = targetRole === 'superadmin' ? 999_000_000 : 100_000
    await prisma.userQuota.create({
      data: { userId: newUser.id, totalTokens, usedTokens: 0, plan },
    })
    res.json(newUser)
  } catch (e) {
    next(e)
  }
})

// 13. POST /users/:id/recharge — 给用户充值 token（管理员可操作）
router.post('/users/:id/recharge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { amount } = req.body
    const tokenAmount = parseInt(String(amount || 0), 10)
    if (!tokenAmount || tokenAmount <= 0) {
      return res.status(400).json({ error: '充值金额必须为正整数' })
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: '用户不存在' })

    let quota = await prisma.userQuota.findUnique({ where: { userId: id } })
    if (!quota) {
      quota = await prisma.userQuota.create({
        data: { userId: id, totalTokens: 100000, usedTokens: 0, plan: 'free' },
      })
    }
    const updated = await prisma.userQuota.update({
      where: { userId: id },
      data: { totalTokens: { increment: tokenAmount } },
    })

    // 记录充值订单
    await prisma.paymentOrder.create({
      data: {
        userId: id,
        amount: 0,
        tokenAmount,
        paymentMethod: 'admin_recharge',
        status: 'completed',
      },
    })

    res.json({ ok: true, newTotal: updated.totalTokens, added: tokenAmount })
  } catch (e) {
    next(e)
  }
})
`;

// 在文件末尾 export 之前插入
admin = admin.replace('export default router', newUserEndpoint + '\nexport default router');

fs.writeFileSync(adminPath, admin, 'utf8');
console.log('[3] admin.ts routes updated with permission tiers');

// ===== 4. auth.ts 路由 — 更新 VALID_ROLES =====
const authRoutesPath='server/src/routes/auth.ts';
let authRoutes=fs.readFileSync(authRoutesPath,'utf8');
authRoutes=authRoutes.replace(
  /const VALID_ROLES\s*=\s*\[[^\]]*\]/,
  "const VALID_ROLES = ['user', 'creator', 'moderator', 'admin', 'superadmin']"
);
fs.writeFileSync(authRoutesPath, authRoutes, 'utf8');
console.log('[4] auth.ts routes VALID_ROLES updated');

// ===== 5. seed.ts — 更新 admin 用户为 superadmin =====
const seedPath='server/prisma/seed.ts';
let seed=fs.readFileSync(seedPath,'utf8');
seed=seed.replace(
  /role:\s*'admin'/g,
  "role: 'superadmin'"
);
fs.writeFileSync(seedPath, seed, 'utf8');
console.log('[5] seed.ts admin→superadmin updated');

console.log('\nAll backend patches done.');
