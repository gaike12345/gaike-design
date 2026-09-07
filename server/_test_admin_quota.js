const BASE = 'http://localhost:3000/api'

async function login(account, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const data = await res.json()
  return data.token
}

async function getQuota(token) {
  const res = await fetch(`${BASE}/user/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

async function generateImage(token) {
  const res = await fetch(`${BASE}/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: 'sdxl', prompt: 'a test image', ratio: '1:1', batch: 1 }),
  })
  return res.json()
}

;(async () => {
  console.log('=== 管理员积分行为测试 ===\n')

  // 登录管理员账号
  const token = await login('admin@manktv.com', 'password123')
  if (!token) { console.log('管理员登录失败，尝试 superadmin...') }

  const token2 = token || await login('superadmin@manktv.com', 'password123')
  if (!token2) { console.log('全部登录失败'); return }

  console.log('1. 初始额度:')
  const q1 = await getQuota(token2)
  console.log(`   total: ${q1.totalTokens?.toLocaleString()}`)
  console.log(`   remain: ${q1.remainingTokens?.toLocaleString()}`)
  console.log(`   used: ${q1.usedTokens?.toLocaleString()}`)
  console.log(`   plan: ${q1.planId}`)
  console.log()

  console.log('2. 生成图片 (扣 20 积分):')
  const gen = await generateImage(token2)
  console.log(`   结果: ${gen.error ? '失败: ' + gen.error : '成功'}`)
  console.log()

  console.log('3. 生成后立即查询:')
  const q2 = await getQuota(token2)
  console.log(`   total: ${q2.totalTokens?.toLocaleString()}`)
  console.log(`   remain: ${q2.remainingTokens?.toLocaleString()}`)
  console.log(`   used: ${q2.usedTokens?.toLocaleString()}`)
  console.log(`   扣减: ${q1.remainingTokens - q2.remainingTokens}`)
  console.log()

  console.log('4. 等待 2 秒再查:')
  await new Promise(r => setTimeout(r, 2000))
  const q3 = await getQuota(token2)
  console.log(`   total: ${q3.totalTokens?.toLocaleString()}`)
  console.log(`   remain: ${q3.remainingTokens?.toLocaleString()}`)
  console.log(`   used: ${q3.usedTokens?.toLocaleString()}`)
  console.log()

  console.log('5. 再生成一张:')
  const gen2 = await generateImage(token2)
  console.log(`   结果: ${gen2.error ? '失败: ' + gen2.error : '成功'}`)
  const q4 = await getQuota(token2)
  console.log(`   remain: ${q4.remainingTokens?.toLocaleString()}`)
  console.log(`   累计扣减: ${q1.remainingTokens - q4.remainingTokens}`)
  console.log()

  console.log('=== 测试完成 ===')
})()
