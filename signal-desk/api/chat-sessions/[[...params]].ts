import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../_lib/auth'
import { sql } from '../_lib/db'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const params = req.query.params
  const sessionId = Array.isArray(params) ? params[0] : params

  if (!sessionId) {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT s.id, s.title, s.ended, s.created_at, s.updated_at,
          (SELECT COUNT(*)::int FROM conv_messages m WHERE m.session_id = s.id) AS message_count
        FROM chat_sessions s WHERE s.user_id = ${req.userId} ORDER BY s.updated_at DESC
      `
      return res.status(200).json(
        rows.map(r => ({
          id: r.id,
          title: r.title,
          ended: r.ended,
          messageCount: r.message_count,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      )
    }
    if (req.method === 'POST') {
      const inserted = await sql`
        INSERT INTO chat_sessions (user_id, title) VALUES (${req.userId}, '新会话')
        RETURNING id, title, ended, created_at, updated_at
      `
      const s = inserted[0]
      return res.status(201).json({
        id: s.id,
        title: s.title,
        ended: s.ended,
        messages: [],
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sessions = await sql`
    SELECT id, title, ended, created_at, updated_at
    FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${req.userId} LIMIT 1
  `
  if (sessions.length === 0) return res.status(404).json({ error: '会话不存在' })
  const session = sessions[0]

  if (req.method === 'GET') {
    const messages = await sql`
      SELECT id, role, content, reference_intel_ids, reference_label, created_at
      FROM conv_messages WHERE session_id = ${sessionId} ORDER BY created_at ASC
    `
    return res.status(200).json({
      id: session.id,
      title: session.title,
      ended: session.ended,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        referenceIntelIds: m.reference_intel_ids ?? [],
        referenceLabel: m.reference_label ?? '',
        timestamp: m.created_at,
      })),
    })
  }

  if (req.method === 'PATCH') {
    const body = readJsonBody<{ ended?: boolean }>(req)
    if (body.ended) {
      await sql`
        UPDATE chat_sessions SET ended = true, updated_at = NOW()
        WHERE id = ${sessionId} AND user_id = ${req.userId}
      `
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
