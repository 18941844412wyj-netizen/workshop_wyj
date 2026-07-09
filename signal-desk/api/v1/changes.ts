/**
 * GET /api/v1/changes
 *
 * 认证：Authorization: Bearer <key> | X-Api-Key: <key> | ?api_key=<key>
 *
 * 参数：
 *   all=true      返回全部用户数据（管理员模式），响应含 user 字段
 *   limit         条数，默认50（all时200），最大1000
 *   since         ISO8601，只返回该时间之后的条目
 *   track         赛道筛选
 *   label         标签筛选
 *   priority      优先级筛选
 *   status        状态筛选；默认排除归档
 *   user_email    （仅 all=true）按用户邮箱筛选
 */

import type { VercelResponse } from '@vercel/node'
import { withApiKey, type ApiKeyRequest } from '../_lib/api-key-auth.js'
import { sql } from '../_lib/db.js'
import { parseJsonField } from '../_lib/jsonb.js'
import type { InfoLabel, Priority, IntelStatus } from '../_lib/types.js'

interface IntelRow {
  id: string
  user_id: string
  user_email: string
  target_id: string
  target_name: string
  target_url: string
  track: string
  labels: unknown
  priority: Priority
  title: string
  what_changed: string
  why_it_matters: string
  action_general: unknown
  status: IntelStatus
  created_at: string
}

function buildIntents(actionGeneral: unknown): Array<{ role: string; action: string }> {
  const DEFAULT = '结合该变化评估对业务的影响并更新应对预案。'
  const obj = parseJsonField<Record<string, string>>(actionGeneral, {})
  return [
    { role: '销售', action: obj['销售']?.trim() || DEFAULT },
    { role: '产品', action: obj['产品']?.trim() || DEFAULT },
    { role: '营销', action: obj['营销']?.trim() || DEFAULT },
  ]
}

function mapRow(row: IntelRow, includeUser: boolean) {
  const base = {
    id: row.id,
    target: { id: row.target_id, name: row.target_name, url: row.target_url, track: row.track },
    labels: parseJsonField<InfoLabel[]>(row.labels, []),
    priority: row.priority,
    title: row.title,
    whatChanged: row.what_changed,
    whyItMatters: row.why_it_matters,
    intents: buildIntents(row.action_general),
    status: row.status,
    createdAt: row.created_at,
  }
  if (!includeUser) return base
  return { user: { id: row.user_id, email: row.user_email }, ...base }
}

async function handler(req: ApiKeyRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const allMode = req.query.all === 'true'
    const defaultLimit = allMode ? 200 : 50
    const rawLimit = parseInt((req.query.limit as string) || String(defaultLimit), 10)
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? defaultLimit : rawLimit), 1000)

    const since     = (req.query.since      as string) || null
    const track     = (req.query.track      as string) || null
    const label     = (req.query.label      as string) || null
    const priority  = (req.query.priority   as string) || null
    const status    = (req.query.status     as string) || null
    const userEmail = allMode ? ((req.query.user_email as string) || null) : null

    let rows: IntelRow[]

    if (allMode) {
      // 全量模式：不过滤 user_id
      // 所有可空参数用 ::text 让 PG 明确类型
      rows = await sql<IntelRow[]>`
        SELECT i.id, i.user_id, u.email AS user_email, i.target_id,
               t.name AS target_name, t.url AS target_url, t.track,
               i.labels, i.priority, i.title, i.what_changed, i.why_it_matters,
               i.action_general, i.status, i.created_at
        FROM intels i
        JOIN targets t ON t.id = i.target_id
        JOIN users u   ON u.id = i.user_id
        WHERE i.is_noise = false
          AND i.analysis_status = 'success'
          AND (${status}::text    IS NULL OR i.status    = ${status}::text)
          AND (${track}::text     IS NULL OR t.track     = ${track}::text)
          AND (${priority}::text  IS NULL OR i.priority  = ${priority}::text)
          AND (${since}::text     IS NULL OR i.created_at > ${since}::timestamptz)
          AND (${userEmail}::text IS NULL OR u.email     = ${userEmail}::text)
          AND (${status}::text IS NOT NULL OR i.status != '归档')
        ORDER BY i.created_at DESC
        LIMIT ${limit}
      `
    } else {
      // 单用户模式
      rows = await sql<IntelRow[]>`
        SELECT i.id, i.user_id, u.email AS user_email, i.target_id,
               t.name AS target_name, t.url AS target_url, t.track,
               i.labels, i.priority, i.title, i.what_changed, i.why_it_matters,
               i.action_general, i.status, i.created_at
        FROM intels i
        JOIN targets t ON t.id = i.target_id
        JOIN users u   ON u.id = i.user_id
        WHERE i.is_noise = false
          AND i.analysis_status = 'success'
          AND i.user_id = ${req.userId}::uuid
          AND (${status}::text   IS NULL OR i.status   = ${status}::text)
          AND (${track}::text    IS NULL OR t.track    = ${track}::text)
          AND (${priority}::text IS NULL OR i.priority = ${priority}::text)
          AND (${since}::text    IS NULL OR i.created_at > ${since}::timestamptz)
          AND (${status}::text IS NOT NULL OR i.status != '归档')
        ORDER BY i.created_at DESC
        LIMIT ${limit}
      `
    }

    let items = rows.map(r => mapRow(r, allMode))
    if (label) items = items.filter(i => i.labels.includes(label as InfoLabel))

    return res.status(200).json({
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[v1/changes]', err)
    return res.status(500).json({ error: String(err) })
  }
}

export default withApiKey(handler)
