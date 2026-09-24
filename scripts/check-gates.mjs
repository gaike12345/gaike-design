import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const gates = [
  { name: 'server/typecheck', cwd: 'server', cmd: 'npm run typecheck' },
  { name: 'server/test', cwd: 'server', cmd: 'npm run test' },
  { name: 'server/arch', cwd: 'server', cmd: 'npm run arch:check:code' },
  { name: 'server/lint', cwd: 'server', cmd: 'npm run lint:check' },
  { name: 'web/build', cwd: 'web', cmd: 'npm run build' },
  { name: 'web/typecheck', cwd: 'web', cmd: 'npm run typecheck:check' },
  { name: 'web/lint', cwd: 'web', cmd: 'npm run lint:check' },
]

const failed = []

console.log('══════════════ 全量验证门禁 ══════════════\n')

for (const gate of gates) {
  const started = Date.now()
  const result = spawnSync(gate.cmd, {
    cwd: resolve(root, gate.cwd),
    shell: true,
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)

  if (result.status === 0) {
    console.log(`✅ ${gate.name} (${seconds}s)`)
  } else {
    failed.push(gate.name)
    const output = (result.stdout || '') + (result.stderr || '')
    console.log(`❌ ${gate.name} (${seconds}s)  exit=${result.status}`)
    console.log(output.trimEnd().split('\n').slice(-30).join('\n'))
    console.log('')
  }
}

console.log('')
if (failed.length > 0) {
  console.log(`门禁失败：${failed.join(', ')}`)
  process.exit(1)
}
console.log('全部门禁通过 ✅')
