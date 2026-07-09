import type { VercelResponse } from '@vercel/node'
import { withAuth, type AuthenticatedRequest } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
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

export default withAuth(handler)
