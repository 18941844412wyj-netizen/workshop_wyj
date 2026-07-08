import { loadEnvLocal } from './env.js'
import { sql } from './db.js'
import { verifyCronSecret } from './cron-auth.js'
import { sendNotification } from './notifier.js'
import { generateChatReply } from './chat-reply.js'

loadEnvLocal()

const mockReq = (auth?: string) =>
  ({ headers: auth ? { authorization: auth } : {} }) as import('@vercel/node').VercelRequest

async function main() {
  let pass = 0
  let fail = 0

  const assert = (name: string, ok: boolean) => {
    if (ok) { console.log('PASS:', name); pass++ }
    else { console.log('FAIL:', name); fail++ }
  }

  assert('cron 无 token → 401', !verifyCronSecret(mockReq()))
  assert('cron 正确 token', verifyCronSecret(mockReq('Bearer dev_cron_local_test_secret')))

  const intelRows = await sql`
    SELECT id, user_id, title, what_changed, why_it_matters, action_plan, source_anchor
    FROM intels WHERE analysis_status = 'success' ORDER BY created_at DESC LIMIT 1
  `
  if (intelRows.length === 0) {
    console.log('SKIP: 无情报数据，跳过 notify/chat 测试')
  } else {
    const intel = intelRows[0]
    const userId = intel.user_id as string
    const intelId = intel.id as string

    const n1 = await sendNotification(intelId, userId)
    assert('notify 首次调用 ok', n1.ok)
    const n2 = await sendNotification(intelId, userId)
    assert('notify 二次 skipped', n2.skipped === true)

    const ctx = {
      id: intelId,
      title: intel.title as string,
      whatChanged: intel.what_changed as string,
      whyItMatters: intel.why_it_matters as string,
      actionPlan: (intel.action_plan ?? {}) as Record<string, string>,
      sourceAnchor: (intel.source_anchor ?? { before: '', after: '' }) as { before: string; after: string },
    }

    const priceReply = await generateChatReply({
      message: '价格变化了多少？',
      referenceLabel: '变化内容',
      intels: [ctx],
      history: [],
    })
    assert('chat 价格追问有内容', priceReply.length > 5)

    const ceoReply = await generateChatReply({
      message: '这家公司 CEO 是谁？',
      referenceLabel: '整条情报',
      intels: [ctx],
      history: [],
    })
    assert('chat 无关问题 → 资料不足', ceoReply.includes('资料不足'))
  }

  const scheduled = await sql`SELECT COUNT(*)::int AS c FROM targets WHERE collect_mode = 'scheduled'`
  console.log('scheduled targets:', scheduled[0]?.c)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
