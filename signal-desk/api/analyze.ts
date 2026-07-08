import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from './_lib/auth'
import { runAnalysis } from './_lib/run-analysis'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { targetId } = readJsonBody<{ targetId?: string }>(req)
  if (!targetId) return res.status(400).json({ error: '缺少 targetId' })

  const result = await runAnalysis(targetId, req.userId)

  if (!result.ok) {
    if (result.error === '目标不存在') {
      return res.status(404).json({ error: result.error })
    }
    if (result.error === 'LLM 配置缺失') {
      return res.status(404).json({ ok: false, error: result.error })
    }
    return res.status(500).json({ ok: false, error: result.error ?? '分析失败' })
  }

  return res.status(200).json({
    ok: true,
    intelIds: result.intelIds,
    ...(result.message ? { message: result.message } : {}),
  })
}

export default withAuth(handler)
