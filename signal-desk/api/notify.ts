import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readJsonBody, verifyToken } from './_lib/auth'
import { verifyCronSecret } from './_lib/cron-auth'
import { sendNotification } from './_lib/notifier'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { intelId, userId } = readJsonBody<{ intelId?: string; userId?: string }>(req)
  if (!intelId || !userId) {
    return res.status(400).json({ error: '缺少 intelId 或 userId' })
  }

  let authorized = verifyCronSecret(req)
  if (!authorized) {
    try {
      const user = await verifyToken(req)
      authorized = user.userId === userId
    } catch {
      authorized = false
    }
  }
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const result = await sendNotification(intelId, userId)
  if (!result.ok) {
    return res.status(500).json(result)
  }
  return res.status(200).json(result)
}
