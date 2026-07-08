import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../../_lib/auth'
import { sql } from '../../_lib/db'
import type { FeedbackModule, FeedbackTag } from '../../_lib/types'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: '缺少情报 ID' })

  const body = readJsonBody<{
    tags?: FeedbackTag[]
    modules?: FeedbackModule[]
    note?: string
  }>(req)

  const tags = body.tags ?? []
  const modules = body.modules ?? []
  const note = body.note ?? ''

  const intelRows = await sql`
    SELECT id FROM intels WHERE id = ${id} AND user_id = ${req.userId} LIMIT 1
  `
  if (intelRows.length === 0) return res.status(404).json({ error: '情报不存在' })

  await sql`
    INSERT INTO feedback (intel_id, user_id, tags, modules, note)
    VALUES (${id}, ${req.userId}, ${JSON.stringify(tags)}, ${JSON.stringify(modules)}, ${note})
    ON CONFLICT (intel_id, user_id) DO UPDATE SET
      tags = EXCLUDED.tags,
      modules = EXCLUDED.modules,
      note = EXCLUDED.note,
      updated_at = NOW()
  `

  if (tags.includes('有用')) {
    await sql`
      UPDATE intels SET in_core_pool = true, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${req.userId}
    `
  }

  return res.status(200).json({ ok: true })
}

export default withAuth(handler)
