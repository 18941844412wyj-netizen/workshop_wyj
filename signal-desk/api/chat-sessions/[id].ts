import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'
import { parseReferenceIntelIds } from '../_lib/chat-utils.js'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const sessionId = req.query.id as string | undefined
  if (!sessionId) return res.status(400).json({ error: '缺少会话 ID' })

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
        content: m.content ?? '',
        referenceIntelIds: parseReferenceIntelIds(m.reference_intel_ids),
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
