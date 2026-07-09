import { loadEnvLocal } from '../api/_lib/env.js'
loadEnvLocal()
import { sql } from '../api/_lib/db.js'
import { collectSnapshot, extractText } from '../api/_lib/collector.js'
import { detectChanges, hasMeaningfulChanges } from '../api/_lib/change-detector.js'
import { runAnalysis } from '../api/_lib/run-analysis.js'

const SITE = 'https://picpi-iota.vercel.app'
const TARGET_URL = `${SITE}/`

async function timer(path: string, body?: unknown) {
  const res = await fetch(`${SITE}/api/timer/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json() as Promise<{ currentFile?: string; currentIndex?: number; isRunning?: boolean }>
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

try {
  // 1) 选活跃用户（情报最多的）
  const u = await sql`
    SELECT i.user_id, u.email, count(*)::int AS c
    FROM intels i JOIN users u ON u.id = i.user_id
    GROUP BY i.user_id, u.email ORDER BY c DESC LIMIT 1
  `
  const userId = u[0].user_id as string
  console.log('演示用户:', u[0].email)

  // 2) reset 到基线 index.html
  console.log('reset ->', (await timer('reset')).currentFile)

  // 3) 建/复用 Picpi 监控目标
  const existing = await sql`
    SELECT id FROM targets WHERE user_id = ${userId} AND url = ${TARGET_URL} LIMIT 1
  `
  let targetId: string
  if (existing.length) {
    targetId = existing[0].id as string
    console.log('复用已有目标:', targetId)
  } else {
    const t = await sql`
      INSERT INTO targets (user_id, name, url, track, collect_mode, monitor_status)
      VALUES (${userId}, 'Picpi', ${TARGET_URL}, '生图', 'scheduled', '监控中')
      RETURNING id
    `
    targetId = t[0].id as string
    console.log('新建目标 Picpi:', targetId)
  }

  // 4) 采集基线快照（index.html）
  const base = await collectSnapshot({ id: targetId, url: TARGET_URL }, sql)
  console.log(`基线快照 v${base.version}，文本 ${base.textContent.length} 字，含定价段:`, base.textContent.includes('Starter'))

  // 5) 轮询 "/"，出现「对基线有意义的变化」即定格（跳过 A/B 与噪音）
  console.log('start ->', (await timer('start')).currentFile)
  console.log('轮询 "/" 直到检测到有意义的变化…')
  let landed = false
  for (let i = 0; i < 20; i++) {
    await sleep(4_000)
    const html = await (await fetch(TARGET_URL, { headers: { 'User-Agent': 'SignalDesk/1.0' } })).text()
    const liveText = extractText(html)
    const candidates = detectChanges(base.textContent, liveText)
    if (hasMeaningfulChanges(candidates)) {
      const stopped = await timer('stop')
      console.log(`检测到变化 -> ${stopped.currentFile} (index ${stopped.currentIndex})，候选 ${candidates.length} 处`)
      landed = true
      break
    }
  }
  if (!landed) {
    console.log('轮询超时，未捕获有意义变化')
    await timer('stop')
  }

  // 6) 真实管线：采集当前 case → 检测变化 → AI 分析 → 生成情报
  console.log('运行 runAnalysis …')
  const before = new Date().toISOString()
  const result = await runAnalysis(targetId, userId)
  console.log('结果:', JSON.stringify({ ok: result.ok, generated: result.generated, message: result.message, error: result.error }))

  // 7) 打印本次生成的情报
  const intels = await sql`
    SELECT title, priority, labels, what_changed, why_it_matters, is_noise
    FROM intels WHERE target_id = ${targetId} AND created_at >= ${before}
    ORDER BY created_at ASC
  `
  console.log(`\n本次生成 ${intels.length} 条情报：`)
  for (const it of intels) {
    console.log('─'.repeat(70))
    console.log('标题    :', it.title, '|', it.priority, '|', JSON.stringify(it.labels))
    console.log('变化内容:', String(it.what_changed).slice(0, 160))
    console.log('战略意义:', String(it.why_it_matters).slice(0, 200))
  }
} finally {
  await sql.end({ timeout: 5 })
}
