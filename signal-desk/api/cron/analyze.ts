import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { verifyCronSecret } from '../_lib/cron-auth'
import { runAnalysis } from '../_lib/run-analysis'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const targets = await sql`
    SELECT id, user_id FROM targets WHERE collect_mode = 'scheduled'
  `

  let processed = 0
  let generated = 0

  for (const target of targets) {
    try {
      const result = await runAnalysis(target.id as string, target.user_id as string)
      processed++
      generated += result.generated
      if (!result.ok && result.error) {
        console.error('[cron/analyze] target failed:', target.id, result.error)
      }
    } catch (err) {
      console.error('[cron/analyze] target error:', target.id, err)
    }
  }

  return res.status(200).json({ ok: true, processed, generated })
}
