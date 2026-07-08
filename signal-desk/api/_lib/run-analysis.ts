import { sql } from './db.js'
import { collectSnapshot } from './collector.js'
import { detectChanges } from './change-detector.js'
import { analyzeChange, isLlmConfigured } from './ai-analyzer.js'
import { sendNotification } from './notifier.js'
import { parseJsonField } from './jsonb.js'
import { calcMatchScore, getRoleDefaultWeights, type InfoLabel, type Priority } from './types.js'

export interface RunAnalysisResult {
  ok: boolean
  intelIds: string[]
  generated: number
  message?: string
  error?: string
}

export async function runAnalysis(targetId: string, userId: string): Promise<RunAnalysisResult> {
  if (!isLlmConfigured()) {
    const targetRows = await sql`
      SELECT url FROM targets WHERE id = ${targetId} AND user_id = ${userId} LIMIT 1
    `
    if (targetRows.length === 0) {
      return { ok: false, intelIds: [], generated: 0, error: '目标不存在' }
    }
    if (!(targetRows[0].url as string).startsWith('test://')) {
      return { ok: false, intelIds: [], generated: 0, error: 'LLM 配置缺失' }
    }
  }

  const targets = await sql`
    SELECT id, url, name FROM targets WHERE id = ${targetId} AND user_id = ${userId} LIMIT 1
  `
  if (targets.length === 0) {
    return { ok: false, intelIds: [], generated: 0, error: '目标不存在' }
  }
  const target = targets[0]

  const curr = await collectSnapshot(
    { id: target.id as string, url: target.url as string },
    sql,
  )

  const prevRows = await sql`
    SELECT id, text_content FROM snapshots
    WHERE target_id = ${targetId} AND id != ${curr.snapshotId}
    ORDER BY version DESC LIMIT 1
  `
  if (prevRows.length === 0) {
    return { ok: true, intelIds: [], generated: 0, message: '已保存基准快照，等待下次变化' }
  }

  const prevText = (prevRows[0].text_content as string) || ''
  const candidates = detectChanges(prevText, curr.textContent)
  if (candidates.length === 0) {
    return { ok: true, intelIds: [], generated: 0, message: '无重大变化' }
  }

  const profileRows = await sql`
    SELECT weights FROM profiles WHERE user_id = ${userId} LIMIT 1
  `
  const weights = parseJsonField<Record<InfoLabel, number>>(
    profileRows[0]?.weights,
    getRoleDefaultWeights('产品经理'),
  )

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
          ${targetId}, ${userId}, ${prevRows[0].id}, ${curr.snapshotId},
          ${sql.json(analysis.labels)}, ${analysis.priority}, ${analysis.title},
          ${analysis.whatChanged}, ${analysis.whyItMatters},
          ${sql.json(analysis.actionGeneral)}, ${sql.json(analysis.actionPlan)},
          ${sql.json(analysis.sourceAnchor)}, ${matchScore},
          'success', false
        ) RETURNING id
      `
      const intelId = inserted[0].id as string
      intelIds.push(intelId)

      try {
        await sendNotification(intelId, userId)
      } catch (notifyErr) {
        console.error('[run-analysis] notify failed:', notifyErr)
      }
    } catch (err) {
      console.error('[run-analysis] candidate failed:', err)
      const inserted = await sql`
        INSERT INTO intels (
          target_id, user_id, snapshot_before_id, snapshot_after_id,
          labels, priority, title, what_changed, why_it_matters,
          action_general, action_plan, source_anchor,
          analysis_status, is_noise
        ) VALUES (
          ${targetId}, ${userId}, ${prevRows[0].id}, ${curr.snapshotId},
          ${sql.json([])}, '低', '分析失败', ${candidate.after || candidate.before},
          '自动分析未能完成', ${sql.json({})}, ${sql.json({})},
          ${sql.json({ before: candidate.before, after: candidate.after })},
          'failed', false
        ) RETURNING id
      `
      intelIds.push(inserted[0].id as string)
    }
  }

  return { ok: true, intelIds, generated: intelIds.length }
}
