import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../_lib/auth'
import { sql } from '../_lib/db'
import type { CollectMode, Track } from '../_lib/types'

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
  if (!/^https:\/\//.test(body.url.trim())) return 'URL 需以 https:// 开头'
  if (!['生图', '生视频', 'Agent'].includes(body.track ?? '')) return '无效赛道'
  if (!['manual', 'scheduled'].includes(body.collectMode ?? '')) return '无效采集方式'
  return null
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: '缺少目标 ID' })

  if (req.method === 'PUT') {
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
      UPDATE targets SET
        name = ${body.name!.trim()},
        url = ${body.url!.trim()},
        track = ${body.track!},
        collect_mode = ${body.collectMode!},
        schedule = ${body.schedule ?? null},
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${req.userId}
      RETURNING id, name, url, track, collect_mode, schedule, monitor_status
    `
    if (rows.length === 0) return res.status(404).json({ error: '目标不存在' })
    return res.status(200).json(mapTarget(rows[0] as Record<string, unknown>))
  }

  if (req.method === 'DELETE') {
    const rows = await sql`
      DELETE FROM targets WHERE id = ${id} AND user_id = ${req.userId}
      RETURNING id
    `
    if (rows.length === 0) return res.status(404).json({ error: '目标不存在' })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
