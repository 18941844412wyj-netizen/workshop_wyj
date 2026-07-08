import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from './_lib/auth'
import { sql } from './_lib/db'
import { collectSnapshot } from './_lib/collector'
import { detectChanges } from './_lib/change-detector'
import { analyzeChange, isLlmConfigured } from './_lib/ai-analyzer'
import { calcMatchScore, getRoleDefaultWeights, type InfoLabel, type Priority } from './_lib/types'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { targetId } = readJsonBody<{ targetId?: string }>(req)
  if (!targetId) return res.status(400).json({ error: '缺少 targetId' })

  if (!isLlmConfigured()) {
    const targetRows = await sql`
      SELECT url FROM targets WHERE id = ${targetId} AND user_id = ${req.userId} LIMIT 1
    `
    if (targetRows.length === 0) return res.status(404).json({ error: '目标不存在' })
    const url = targetRows[0].url as string
    if (!url.startsWith('test://')) {
      return res.status(404).json({ ok: false, error: 'LLM 配置缺失' })
    }
  }

  const targets = await sql`
    SELECT id, url, name FROM targets WHERE id = ${targetId} AND user_id = ${req.userId} LIMIT 1
  `
  if (targets.length === 0) return res.status(404).json({ error: '目标不存在' })
  const target = targets[0]

  const curr = await collectSnapshot({ id: target.id as string, url: target.url as string }, sql)

  const prevRows = await sql`
    SELECT id, text_content FROM snapshots
    WHERE target_id = ${targetId} AND id != ${curr.snapshotId}
    ORDER BY version DESC LIMIT 1
  `
  if (prevRows.length === 0) {
    return res.status(200).json({ ok: true, intelIds: [], message: '已保存基准快照，等待下次变化' })
  }

  const prevText = (prevRows[0].text_content as string) || ''
  const candidates = detectChanges(prevText, curr.textContent)
  if (candidates.length === 0) {
    return res.status(200).json({ ok: true, intelIds: [], message: '无重大变化' })
  }

  const profileRows = await sql`
    SELECT weights FROM profiles WHERE user_id = ${req.userId} LIMIT 1
  `
  const weights = (profileRows[0]?.weights as Record<InfoLabel, number>) ?? getRoleDefaultWeights('产品经理')

  const intelIds: string[] = []

  for (const candidate of candidates) {
    try {
      const analysis = await analyzeChange(candidate)
      if (analysis.isNoise) continue

      const matchScore = calcMatchScore(
        analysis.labels as InfoLabel[],
        analysis.priority as Priority,
        weights,
      )

      const inserted = await sql`
        INSERT INTO intels (
          target_id, user_id, snapshot_before_id, snapshot_after_id,
          labels, priority, title, what_changed, why_it_matters,
          action_general, action_plan, source_anchor, match_score,
          analysis_status, is_noise
        ) VALUES (
          ${targetId}, ${req.userId}, ${prevRows[0].id}, ${curr.snapshotId},
          ${JSON.stringify(analysis.labels)}, ${analysis.priority}, ${analysis.title},
          ${analysis.whatChanged}, ${analysis.whyItMatters},
          ${JSON.stringify(analysis.actionGeneral)}, ${JSON.stringify(analysis.actionPlan)},
          ${JSON.stringify(analysis.sourceAnchor)}, ${matchScore},
          'success', false
        ) RETURNING id
      `
      intelIds.push(inserted[0].id as string)
    } catch (err) {
      console.error('[analyze] candidate failed:', err)
      const inserted = await sql`
        INSERT INTO intels (
          target_id, user_id, snapshot_before_id, snapshot_after_id,
          labels, priority, title, what_changed, why_it_matters,
          action_general, action_plan, source_anchor,
          analysis_status, is_noise
        ) VALUES (
          ${targetId}, ${req.userId}, ${prevRows[0].id}, ${curr.snapshotId},
          '[]', '低', '分析失败', ${candidate.after || candidate.before},
          '自动分析未能完成', '{}', '{}',
          ${JSON.stringify({ before: candidate.before, after: candidate.after })},
          'failed', false
        ) RETURNING id
      `
      intelIds.push(inserted[0].id as string)
    }
  }

  return res.status(200).json({ ok: true, intelIds })
}

export default withAuth(handler)
