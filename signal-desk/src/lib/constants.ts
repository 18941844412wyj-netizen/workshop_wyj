export type BuiltinRole = '产品经理' | '市场营销负责人' | '创业者·创始人' | '投资人'
export type Role = BuiltinRole | string
export type Track = '生图' | '生视频' | 'Agent'
export type Priority = '紧急' | '中等' | '低'
export type CollectMode = 'manual' | 'scheduled' | 'auto'

export interface Target {
  id: string
  name: string
  url: string
  track: Track
  collectMode: CollectMode
  schedule?: string
  monitorStatus: '监控中' | '已暂停'
}

export const BUILTIN_ROLES: BuiltinRole[] = ['产品经理', '市场营销负责人', '创业者·创始人', '投资人']
export const INFO_LABELS = ['定价', '功能', '更新日志', '招聘', '营销活动', '合规条款'] as const
export type InfoLabel = typeof INFO_LABELS[number]

export const ROLE_DEFAULT_WEIGHTS: Record<BuiltinRole, Record<InfoLabel, number>> = {
  '产品经理': { 定价: 3, 功能: 5, 更新日志: 4, 招聘: 2, 营销活动: 3, 合规条款: 2 },
  '市场营销负责人': { 定价: 4, 功能: 3, 更新日志: 2, 招聘: 2, 营销活动: 5, 合规条款: 2 },
  '创业者·创始人': { 定价: 4, 功能: 4, 更新日志: 3, 招聘: 3, 营销活动: 4, 合规条款: 3 },
  '投资人': { 定价: 5, 功能: 3, 更新日志: 2, 招聘: 4, 营销活动: 3, 合规条款: 4 },
}

export function getRoleDefaultWeights(role: Role): Record<InfoLabel, number> {
  if ((ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[role]) {
    return { ...(ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[role] }
  }
  return { ...ROLE_DEFAULT_WEIGHTS['产品经理'] }
}

/**
 * 根据当前角色权重重新计算有效优先级：
 * 若用户对该标签权重 ≥ 4 → 视为紧急；≥ 3 → 中等；其余取 AI 判定。
 * 取"权重优先级"与"AI 优先级"中较高者。
 */
export function getEffectivePriority(
  labels: InfoLabel[],
  aiPriority: Priority,
  weights: Record<InfoLabel, number>,
): Priority {
  if (labels.length === 0) return aiPriority
  const maxWeight = labels.reduce((max, label) => Math.max(max, weights[label] ?? 1), 0)
  const weightPriority: Priority = maxWeight >= 4 ? '紧急' : maxWeight >= 3 ? '中等' : '低'
  const rank = (p: Priority) => (p === '紧急' ? 3 : p === '中等' ? 2 : 1)
  return rank(aiPriority) >= rank(weightPriority) ? aiPriority : weightPriority
}

export interface CustomRole {
  name: string
  weights: Record<InfoLabel, number>
}

export interface EmailSettings {
  enabled: boolean
  recipientEmails: string[]
  pushTime: string
  pushContent: {
    includeTitle: boolean
    includeSummary: boolean
    includeAction: boolean
    includeLink: boolean
  }
}

export const defaultEmailSettings = (): EmailSettings => ({
  enabled: true,
  recipientEmails: [],
  pushTime: '09:00',
  pushContent: { includeTitle: true, includeSummary: true, includeAction: true, includeLink: true },
})

export function getAllRoles(customRoles: CustomRole[]): Role[] {
  return [...BUILTIN_ROLES, ...customRoles.map(r => r.name)]
}

export interface UserProfile {
  email?: string
  role: Role | null
  weights: Record<InfoLabel, number>
  customRoles: CustomRole[]
  emailSettings: EmailSettings
  onboarded: boolean
  apiKey?: string | null
}

export async function fetchProfile(): Promise<UserProfile | null> {
  const res = await fetch('/api/profile', { credentials: 'include' })
  if (!res.ok) return null
  return res.json()
}

export async function saveProfile(body: Partial<UserProfile> & { onboarded?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.error || '保存失败' }
  const { invalidateProfileCache } = await import('./profile-cache')
  invalidateProfileCache()
  return { ok: true }
}

export async function sendTestEmail(): Promise<{ ok: boolean; error?: string; to?: string[] }> {
  const res = await fetch('/api/profile?action=test-email', { method: 'POST', credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error || '发送失败' }
  return { ok: true, to: data.to }
}

export async function generateApiKey(): Promise<{ ok: boolean; apiKey?: string; error?: string }> {
  const res = await fetch('/api/profile?action=generate-api-key', { method: 'POST', credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error || '生成失败' }
  return { ok: true, apiKey: data.apiKey }
}

export async function revokeApiKey(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/profile?action=revoke-api-key', { method: 'POST', credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error || '撤销失败' }
  return { ok: true }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  const { invalidateProfileCache } = await import('./profile-cache')
  invalidateProfileCache()
}
