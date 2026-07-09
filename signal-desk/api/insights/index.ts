import type { VercelResponse } from '@vercel/node'
import { withAuth, type AuthenticatedRequest } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'
import { parseJsonField } from '../_lib/jsonb.js'
import { getRoleDefaultWeights, type InfoLabel } from '../_lib/types.js'
import { mapIntelRow, sortIntels } from '../_lib/insights-mapper.js'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const view = (req.query.view as string) || 'all'
  const track = req.query.track as string | undefined
  const label = req.query.label as string | undefined
  const priority = req.query.priority as string | undefined
  const archiveFilter = (req.query.archiveFilter as string) || 'hide'
  const noiseOnly = req.query.noise === 'only'

  const profileRows = await sql`SELECT weights FROM profiles WHERE user_id = ${req.userId} LIMIT 1`
  const weights = parseJsonField<Record<InfoLabel, number>>(
    profileRows[0]?.weights,
    getRoleDefaultWeights('产品经理'),
  )

  let rows = await sql`
    SELECT i.*, t.name AS target_name, t.track,
      f.tags AS feedback_tags, f.modules AS feedback_modules, f.note AS feedback_note
    FROM intels i
    JOIN targets t ON t.id = i.target_id
    LEFT JOIN feedback f ON f.intel_id = i.id AND f.user_id = ${req.userId}
    WHERE i.user_id = ${req.userId}
      AND i.is_noise = ${noiseOnly}
      AND i.analysis_status = 'success'
    ORDER BY i.created_at DESC
    LIMIT 200
  `

  let list = rows.map(r => mapIntelRow(r as Record<string, unknown>, weights))

  if (archiveFilter === 'hide') list = list.filter(i => i.status !== '归档')
  else if (archiveFilter === 'only') list = list.filter(i => i.status === '归档')

  if (view === 'pool') list = list.filter(i => i.inCorePool)
  if (view === 'morning') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    list = list.filter(i => new Date(i.createdAt as string) >= today)
    list.sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
  } else {
    if (track) list = list.filter(i => i.track === track)
    if (label) list = list.filter(i => i.labels.includes(label as InfoLabel))
    if (priority) list = list.filter(i => i.priority === priority)
    list = sortIntels(list)
  }

  return res.status(200).json(list.slice(0, 50))
}

export default withAuth(handler)
