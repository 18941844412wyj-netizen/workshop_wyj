import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'
import type { CollectMode, Track } from '../_lib/types.js'

function mapTarget(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    track: row.track,
    collectMode: row.collect_mode,
    schedule: row.schedule ?? undefined,
    monitorStatus: row.monitor_status,
  }
}

function validateTargetBody(body: {
  name?: string
  url?: string
  track?: string
  collectMode?: string
  schedule?: string
}) {
  if (!body.name?.trim()) return '竞品名称不能为空'
  if (!body.url?.trim()) return 'URL 不能为空'
  if (!/^https:\/\//.test(body.url.trim()) && !body.url.trim().startsWith('test://')) return 'URL 需以 https:// 或 test:// 开头'
  if (!['生图', '生视频', 'Agent'].includes(body.track ?? '')) return '无效赛道'
  if (!['manual', 'scheduled', 'auto'].includes(body.collectMode ?? '')) return '无效采集方式'
  return null
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, name, url, track, collect_mode, schedule, monitor_status
      FROM targets WHERE user_id = ${req.userId}
      ORDER BY created_at DESC
    `
    return res.status(200).json(rows.map(r => mapTarget(r as Record<string, unknown>)))
  }

  if (req.method === 'POST') {
    const body = readJsonBody<{
      name?: string
      url?: string
      track?: Track
      collectMode?: CollectMode
      schedule?: string
    }>(req)
    const err = validateTargetBody(body)
    if (err) return res.status(400).json({ error: err })

    const rows = await sql`
      INSERT INTO targets (user_id, name, url, track, collect_mode, schedule)
      VALUES (
        ${req.userId},
        ${body.name!.trim()},
        ${body.url!.trim()},
        ${body.track!},
        ${body.collectMode!},
        ${body.schedule ?? null}
      )
      RETURNING id, name, url, track, collect_mode, schedule, monitor_status
    `
    return res.status(201).json(mapTarget(rows[0] as Record<string, unknown>))
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
