import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from '../../_lib/auth'
import { sql } from '../../_lib/db'
import { generateChatReply, type IntelContext } from '../../_lib/chat-reply'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const insightId = req.query.id as string | undefined
    if (!insightId) return res.status(400).json({ error: '缺少情报 ID' })

    const body = readJsonBody<{
      sessionId?: string
      message?: string
      referenceIntelIds?: string[]
      referenceLabel?: string
    }>(req)

    const message = body.message?.trim()
    if (!message) return res.status(400).json({ error: '缺少 message' })

    const referenceIntelIds = body.referenceIntelIds?.length
      ? body.referenceIntelIds
      : [insightId]
    const referenceLabel = body.referenceLabel ?? '整条情报'

    let sessionId = body.sessionId

    if (sessionId) {
      const existing = await sql`
        SELECT id, ended FROM chat_sessions
        WHERE id = ${sessionId} AND user_id = ${req.userId} LIMIT 1
      `
      if (existing.length === 0) return res.status(404).json({ error: '会话不存在' })
      if (existing[0].ended) return res.status(400).json({ error: '会话已结束' })
    } else {
      const title = message.slice(0, 24) + (message.length > 24 ? '…' : '')
      const inserted = await sql`
        INSERT INTO chat_sessions (user_id, title) VALUES (${req.userId}, ${title})
        RETURNING id
      `
      sessionId = inserted[0].id as string
    }

    await sql`
      INSERT INTO conv_messages (session_id, role, content, reference_intel_ids, reference_label)
      VALUES (${sessionId}, 'user', ${message}, ${JSON.stringify(referenceIntelIds)}, ${referenceLabel})
    `

    const intels: IntelContext[] = []
    for (const refId of referenceIntelIds) {
      const rows = await sql`
        SELECT id, title, what_changed, why_it_matters, action_plan, source_anchor
        FROM intels WHERE id = ${refId} AND user_id = ${req.userId} LIMIT 1
      `
      if (rows.length > 0) {
        const r = rows[0]
        intels.push({
          id: r.id as string,
          title: r.title as string,
          whatChanged: r.what_changed as string,
          whyItMatters: r.why_it_matters as string,
          actionPlan: (r.action_plan ?? {}) as Record<string, string>,
          sourceAnchor: (r.source_anchor ?? { before: '', after: '' }) as { before: string; after: string },
        })
      }
    }

    const historyRows = await sql`
      SELECT role, content FROM conv_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `
    const history = historyRows.slice(0, -1).map(r => ({
      role: r.role as 'user' | 'ai',
      content: r.content as string,
    }))

    const aiContent = await generateChatReply({
      message,
      referenceLabel,
      intels,
      history,
    })

    const aiInserted = await sql`
      INSERT INTO conv_messages (session_id, role, content)
      VALUES (${sessionId}, 'ai', ${aiContent})
      RETURNING id, created_at
    `

    await sql`
      UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${sessionId}
    `

    return res.status(200).json({
      sessionId,
      message: {
        id: aiInserted[0].id,
        role: 'ai',
        content: aiContent,
        timestamp: aiInserted[0].created_at,
      },
    })
  } catch (err) {
    console.error('[insights/chat] failed:', err)
    return res.status(500).json({ error: '深度对话失败，请稍后重试' })
  }
}

export default withAuth(handler)
