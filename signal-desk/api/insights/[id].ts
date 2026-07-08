import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../_lib/auth'
import { sql } from '../_lib/db'
import { getRoleDefaultWeights, type InfoLabel, type IntelStatus } from '../_lib/types'
import { mapIntelRow } from '../_lib/insights-mapper'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: '缺少情报 ID' })

  if (req.method === 'GET') {
    const profileRows = await sql`SELECT weights FROM profiles WHERE user_id = ${req.userId} LIMIT 1`
    const weights = (profileRows[0]?.weights as Record<InfoLabel, number>) ?? getRoleDefaultWeights('产品经理')

    const rows = await sql`
      SELECT i.*, t.name AS target_name, t.track,
        f.tags AS feedback_tags, f.modules AS feedback_modules, f.note AS feedback_note
      FROM intels i
      JOIN targets t ON t.id = i.target_id
      LEFT JOIN feedback f ON f.intel_id = i.id AND f.user_id = ${req.userId}
      WHERE i.id = ${id} AND i.user_id = ${req.userId}
      LIMIT 1
    `
    if (rows.length === 0) return res.status(404).json({ error: '情报不存在' })
    return res.status(200).json(mapIntelRow(rows[0] as Record<string, unknown>, weights))
  }

  if (req.method === 'PATCH') {
    const body = readJsonBody<{ status?: IntelStatus; inCorePool?: boolean }>(req)
    if (body.status) {
      await sql`
        UPDATE intels SET status = ${body.status}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${req.userId}
      `
    }
    if (typeof body.inCorePool === 'boolean') {
      await sql`
        UPDATE intels SET in_core_pool = ${body.inCorePool}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${req.userId}
      `
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
