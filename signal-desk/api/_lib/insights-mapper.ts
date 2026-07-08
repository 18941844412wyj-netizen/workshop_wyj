import type { InfoLabel, IntelStatus, Priority } from './types.js'
import { calcMatchScore } from './types.js'
import { parseJsonField } from './jsonb.js'

const DEFAULT_ACTION = '结合该变化评估对业务的影响并更新应对预案。'

function parseActionGeneral(value: unknown): { 销售: string; 产品: string; 营销: string } {
  const obj = parseJsonField<Record<string, string>>(value, {})
  return {
    销售: obj['销售']?.trim() || DEFAULT_ACTION,
    产品: obj['产品']?.trim() || DEFAULT_ACTION,
    营销: obj['营销']?.trim() || DEFAULT_ACTION,
  }
}

function parseActionPlan(value: unknown): Record<string, string> {
  return parseJsonField<Record<string, string>>(value, {})
}

function parseSourceAnchor(value: unknown): { before: string; after: string } {
  const anchor = parseJsonField<{ before?: string; after?: string }>(value, {})
  return { before: anchor.before ?? '', after: anchor.after ?? '' }
}

export function mapIntelRow(
  row: Record<string, unknown>,
  weights: Record<InfoLabel, number>,
) {
  const labels = parseJsonField<InfoLabel[]>(row.labels, [])
  const priority = row.priority as Priority
  const feedbackTags = parseJsonField<string[]>(row.feedback_tags, [])
  const feedbackModules = parseJsonField<string[]>(row.feedback_modules, [])
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
    actionPlan: parseActionPlan(row.action_plan),
    actionGeneral: parseActionGeneral(row.action_general),
    sourceHtml: parseSourceAnchor(row.source_anchor),
    status: row.status as IntelStatus,
    matchScore: calcMatchScore(labels, priority, weights),
    createdAt: row.created_at,
    feedback: feedbackTags,
    feedbackModules,
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
