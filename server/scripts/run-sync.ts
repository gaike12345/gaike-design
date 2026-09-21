/**
 * 一次性脚本：触发 Pollinations 视频/图片模型全量同步
 * 用法：tsx scripts/run-sync.ts [video|image|pricing|all]
 *
 * 用于部署后立即同步 DB 中模型的 config 字段（含 pricing_variants 真实倍率），
 * 避免等待定时同步或手动调用 admin API。
 */
import { syncVideoModelsFromPollinations } from '../src/mank-core/video/syncPollinations'
import { syncImageModelsFromPollinations } from '../src/mank-core/image/syncPollinations'
import { syncPollinationsPricing } from '../src/mank-core/billing/pollinationsSync'

async function main() {
  const target = process.argv[2] || 'all'
  console.log(`[run-sync] target=${target}`)

  if (target === 'video' || target === 'all') {
    console.log('\n========== Video models sync ==========')
    try {
      const r = await syncVideoModelsFromPollinations()
      console.log(`Video sync: synced=${r.synced} skipped=${r.skipped} errors=${r.errors.length}`)
      if (r.notFound.length > 0) console.log('  notFound:', r.notFound.join(', '))
      if (r.errors.length > 0) console.log('  errors:', JSON.stringify(r.errors))
    } catch (e) {
      console.error('Video sync error:', e instanceof Error ? e.message : String(e))
    }
  }

  if (target === 'image' || target === 'all') {
    console.log('\n========== Image models sync ==========')
    try {
      const r = await syncImageModelsFromPollinations()
      console.log(`Image sync: synced=${r.synced} skipped=${r.skipped} errors=${r.errors.length}`)
      if (r.notFound.length > 0) console.log('  notFound:', r.notFound.join(', '))
      if (r.errors.length > 0) console.log('  errors:', JSON.stringify(r.errors))
    } catch (e) {
      console.error('Image sync error:', e instanceof Error ? e.message : String(e))
    }
  }

  if (target === 'pricing' || target === 'all') {
    console.log('\n========== Pollinations pricing sync (costTokens) ==========')
    try {
      const r = await syncPollinationsPricing('manual')
      console.log(`Pricing sync: status=${r.status} checked=${r.modelsChecked} updated=${r.modelsUpdated} added=${r.modelsAdded}`)
      if (r.errorMessage) console.log('  error:', r.errorMessage)
    } catch (e) {
      console.error('Pricing sync error:', e instanceof Error ? e.message : String(e))
    }
  }

  console.log('\n[run-sync] done')
  process.exit(0)
}

void main()
