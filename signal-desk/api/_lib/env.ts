import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/** 加载 signal-desk/.env.local 到 process.env（脚本用） */
export function loadEnvLocal(cwd = process.cwd()) {
  const path = join(cwd, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}
