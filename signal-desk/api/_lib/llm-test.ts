import { loadEnvLocal } from './env.js'
import { analyzeChange } from './ai-analyzer.js'

loadEnvLocal()

const candidate = {
  before: 'Starter 套餐 $29/月',
  after: 'Starter 套餐 $39/月',
  type: 'modified' as const,
}

try {
  const start = Date.now()
  const result = await analyzeChange(candidate)
  console.log('PASS in', Date.now() - start, 'ms')
  console.log(JSON.stringify({ labels: result.labels, priority: result.priority, title: result.title, isNoise: result.isNoise }, null, 2))
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err)
  process.exit(1)
}
