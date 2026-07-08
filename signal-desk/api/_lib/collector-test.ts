import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractText } from './collector.js'
import { detectChanges, hasMeaningfulChanges } from './change-detector.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ceshiRoot = join(__dirname, '../../../ceshi')

const base = readFileSync(join(ceshiRoot, 'index.html'), 'utf-8')
const noise = readFileSync(join(ceshiRoot, 'cases/Z-Noise-1.html'), 'utf-8')
const pricing = readFileSync(join(ceshiRoot, 'cases/Z-Pricing-1.html'), 'utf-8')

const candidates1 = detectChanges(extractText(base), extractText(noise))
const candidates2 = detectChanges(extractText(base), extractText(pricing))

console.log('Noise candidates (expected 0 meaningful):', hasMeaningfulChanges(candidates1) ? candidates1.length : 0)
console.log('Pricing candidates (expected >0):', candidates2.length)

if (hasMeaningfulChanges(candidates1)) {
  console.error('FAIL: noise case should not produce meaningful candidates')
  process.exit(1)
}
if (candidates2.length === 0) {
  console.error('FAIL: pricing case should produce candidates')
  process.exit(1)
}
console.log('PASS')
