/**
 * 全量 ceshi/cases 验证：变化检测 + AI 分析（T15）
 * Run: npx tsx scripts/verify-cases.ts
 */
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadEnvLocal } from '../api/_lib/env.js'
import { extractText } from '../api/_lib/collector.js'
import { detectChanges, hasMeaningfulChanges } from '../api/_lib/change-detector.js'
import { analyzeChange } from '../api/_lib/ai-analyzer.js'
import type { InfoLabel } from '../api/_lib/types.js'

loadEnvLocal()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ceshiRoot = join(__dirname, '../../ceshi')
const casesDir = join(ceshiRoot, 'cases')

type Expect =
  | { kind: 'no-candidates' }
  | { kind: 'noise' }
  | { kind: 'label'; label: InfoLabel }

const EXPECT: Record<string, Expect> = {
  'Z-AB-1': { kind: 'no-candidates' },
  'Z-AB-2': { kind: 'no-candidates' },
  'Z-Noise-1': { kind: 'no-candidates' },
  'Z-Noise-2': { kind: 'no-candidates' },
  'Z-Hallucination-1': { kind: 'noise' },
  'Z-Hallucination-2': { kind: 'noise' },
  'Z-Pricing-1': { kind: 'label', label: '定价' },
  'Z-Pricing-2': { kind: 'label', label: '定价' },
  'Z-Feature-1': { kind: 'label', label: '功能' },
  'Z-Feature-2': { kind: 'label', label: '功能' },
  'Z-Release-1': { kind: 'label', label: '更新日志' },
  'Z-Release-2': { kind: 'label', label: '更新日志' },
  'Z-Hiring-1': { kind: 'label', label: '招聘' },
  'Z-Hiring-2': { kind: 'label', label: '招聘' },
  'Z-Marketing-1': { kind: 'label', label: '营销活动' },
  'Z-Marketing-2': { kind: 'label', label: '营销活动' },
  'Z-Recall-1': { kind: 'label', label: '合规条款' },
  'Z-Recall-2': { kind: 'label', label: '合规条款' },
}

const baselineText = extractText(readFileSync(join(ceshiRoot, 'index.html'), 'utf-8'))
const caseFiles = readdirSync(casesDir).filter(f => f.endsWith('.html')).sort()

let passed = 0
let failed = 0

async function verifyCase(file: string) {
  const id = file.replace('.html', '')
  const expect = EXPECT[id]
  if (!expect) {
    console.log('SKIP:', id, '(无期望定义)')
    return
  }

  const variantText = extractText(readFileSync(join(casesDir, file), 'utf-8'))
  const candidates = detectChanges(baselineText, variantText)

  if (expect.kind === 'no-candidates') {
    const ok = !hasMeaningfulChanges(candidates)
    console.log(ok ? 'PASS' : 'FAIL', id, '→ 无有效候选', `(candidates=${candidates.length})`)
    if (ok) passed++
    else failed++
    return
  }

  if (candidates.length === 0) {
    console.log('FAIL', id, '→ 期望有变化但未检测到候选')
    failed++
    return
  }

  const analysis = await analyzeChange(candidates[0])

  if (expect.kind === 'noise') {
    const ok = analysis.isNoise
    console.log(ok ? 'PASS' : 'FAIL', id, '→ isNoise=true', `(isNoise=${analysis.isNoise}, labels=${JSON.stringify(analysis.labels)})`)
    if (ok) passed++
    else failed++
    return
  }

  const ok = !analysis.isNoise && analysis.labels.includes(expect.label)
  console.log(
    ok ? 'PASS' : 'FAIL',
    id,
    `→ labels含「${expect.label}」`,
    `(isNoise=${analysis.isNoise}, labels=${JSON.stringify(analysis.labels)})`,
  )
  if (ok) passed++
  else failed++
}

console.log('Baseline:', ceshiRoot)
console.log('Cases:', caseFiles.length)
console.log('---')

for (const file of caseFiles) {
  await verifyCase(file)
}

console.log('---')
console.log(`Result: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
