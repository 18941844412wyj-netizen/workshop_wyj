import type { VercelResponse } from '@vercel/node'
import { withAuth, type AuthenticatedRequest } from './_lib/auth.js'
import { sendTestEmail } from './_lib/notifier.js'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const result = await sendTestEmail(req.userId)
    if (!result.ok) {
      return res.status(400).json({ error: result.error ?? '发送失败' })
    }
    return res.status(200).json({ ok: true, to: result.to })
  } catch (err) {
    console.error('[email-test]', err)
    return res.status(500).json({ error: '服务器错误，请稍后重试' })
  }
}

export default withAuth(handler)
