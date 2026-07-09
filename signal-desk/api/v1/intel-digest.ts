/**
 * GET /api/v1/intel-digest
 *
 * 返回精简的竞品情报摘要，结构：
 *   [{ competitor, change: { summary, before, after }, intent: [{ role, action }] }]
 *
 * 认证：Authorization: Bearer <key> | X-Api-Key: <key> | ?api_key=<key>
 *
 * 查询参数：
 *   limit       条数，默认 50，最大 500
 *   since       ISO8601，只返回该时间之后的条目
 *   track       赛道筛选（对应 targets.track）
 *   priority    优先级筛选（高/中/低）
 *   target_name 竞品名称模糊搜索（ILIKE %name%）
 */

import type { VercelResponse } from '@vercel/node'
import { withApiKey, type ApiKeyRequest } from '../_lib/api-key-auth.js'
import { sql } from '../_lib/db.js'
import { parseJsonField } from '../_lib/jsonb.js'

interface DigestRow {
  id: string
  target_id: string
  target_name: string
  target_url: string
  track: string
  title: string
  what_changed: string
  source_anchor: unknown
  action_general: unknown
  priority: string
  created_at: string
}

interface IntentItem {
  role: string
  action: string
}

interface ChangePayload {
  summary: string
  before: string
  after: string
}

function buildChange(row: DigestRow): ChangePayload {
  const anchor = parseJsonField<{ before?: string; after?: string }>(row.source_anchor, {})
  return {
    summary: row.what_changed,
    before: anchor.before?.trim() || '',
    after: anchor.after?.trim() || '',
  }
}

function buildIntent(actionGeneral: unknown): IntentItem[] {
  const DEFAULT = '结合该变化评估对业务的影响并更新应对预案。'
  const obj = parseJsonField<Record<string, string>>(actionGeneral, {})
  return [
    { role: '销售', action: obj['销售']?.trim() || DEFAULT },
    { role: '产品', action: obj['产品']?.trim() || DEFAULT },
    { role: '营销', action: obj['营销']?.trim() || DEFAULT },
  ]
}

function mapRow(row: DigestRow) {
  return {
    id: row.id,
    competitor: {
      id: row.target_id,
      name: row.target_name,
      url: row.target_url,
      track: row.track,
    },
    change: buildChange(row),
    intent: buildIntent(row.action_general),
    priority: row.priority,
    title: row.title,
    createdAt: row.created_at,
  }
}

async function handler(req: ApiKeyRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rawLimit = parseInt((req.query.limit as string) || '50', 10)
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 500)

    const since      = (req.query.since       as string) || null
    const track      = (req.query.track       as string) || null
    const priority   = (req.query.priority    as string) || null
    const targetName = (req.query.target_name as string) || null

    const rows = await sql<DigestRow[]>`
      SELECT
        i.id,
        i.target_id,
        t.name        AS target_name,
        t.url         AS target_url,
        t.track,
        i.title,
        i.what_changed,
        i.source_anchor,
        i.action_general,
        i.priority,
        i.created_at
      FROM intels i
      JOIN targets t ON t.id = i.target_id
      WHERE i.user_id         = ${req.userId}::uuid
        AND i.is_noise        = false
        AND i.analysis_status = 'success'
        AND i.status         != '归档'
        AND (${since}::text      IS NULL OR i.created_at > ${since}::timestamptz)
        AND (${track}::text      IS NULL OR t.track      = ${track}::text)
        AND (${priority}::text   IS NULL OR i.priority   = ${priority}::text)
        AND (${targetName}::text IS NULL OR t.name ILIKE '%' || ${targetName}::text || '%')
      ORDER BY i.created_at DESC
      LIMIT ${limit}
    `

    const items = rows.map(mapRow)

    return res.status(200).json({
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[v1/intel-digest]', err)
    return res.status(500).json({ error: String(err) })
  }
}

export default withApiKey(handler)
