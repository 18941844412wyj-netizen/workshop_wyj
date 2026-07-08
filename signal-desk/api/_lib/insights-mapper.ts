import type { InfoLabel, IntelStatus, Priority } from '../_lib/types'
import { calcMatchScore } from '../_lib/types'

export function mapIntelRow(
  row: Record<string, unknown>,
  weights: Record<InfoLabel, number>,
) {
  const labels = row.labels as InfoLabel[]
  const priority = row.priority as Priority
  return {
    id: row.id,
    targetId: row.target_id,
    targetName: row.target_name,
    track: row.track,
    labels,
    priority,
    title: row.title,
    whatChanged: row.what_changed,
    whyItMatters: row.why_it_matters,
    actionPlan: row.action_plan,
    actionGeneral: row.action_general,
    sourceHtml: row.source_anchor,
    status: row.status as IntelStatus,
    matchScore: calcMatchScore(labels, priority, weights),
    createdAt: row.created_at,
    feedback: row.feedback_tags ?? [],
    feedbackModules: row.feedback_modules ?? [],
    feedbackNote: row.feedback_note ?? '',
    inCorePool: row.in_core_pool,
    analysisStatus: row.analysis_status,
  }
}

export function sortIntels<T extends { matchScore: number; createdAt: unknown }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const scoreDiff = b.matchScore - a.matchScore
    if (scoreDiff !== 0) return scoreDiff
    return new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime()
  })
}
