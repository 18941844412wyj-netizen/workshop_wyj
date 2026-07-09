export type BuiltinRole = '产品经理' | '市场营销负责人' | '创业者·创始人' | '投资人'
export type Role = BuiltinRole | string
export type Track = '生图' | '生视频' | 'Agent'
export type Priority = '紧急' | '中等' | '低'
export type InfoLabel = '定价' | '功能' | '更新日志' | '招聘' | '营销活动' | '合规条款'
export type FeedbackTag = '有用' | '幻觉/事实错误' | '漏抓' | '优先级标错' | '建议是废话' | 'A/B测试误报' | '其他'
export type FeedbackModule = '变化内容' | '战略意义' | '行动建议' | '信息标签' | '优先级'
export type IntelStatus = '未读' | '已读' | '归档'
export type CollectMode = 'manual' | 'scheduled' | 'auto'

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

export interface CustomRole {
  name: string
  weights: Record<InfoLabel, number>
}

export const INFO_LABELS: InfoLabel[] = ['定价', '功能', '更新日志', '招聘', '营销活动', '合规条款']
export const BUILTIN_ROLES: BuiltinRole[] = ['产品经理', '市场营销负责人', '创业者·创始人', '投资人']
export const TRACKS: Track[] = ['生图', '生视频', 'Agent']
export const PRIORITIES: Priority[] = ['紧急', '中等', '低']

export const ROLE_DEFAULT_WEIGHTS: Record<BuiltinRole, Record<InfoLabel, number>> = {
  '产品经理': { 定价: 3, 功能: 5, 更新日志: 4, 招聘: 2, 营销活动: 3, 合规条款: 2 },
  '市场营销负责人': { 定价: 4, 功能: 3, 更新日志: 2, 招聘: 2, 营销活动: 5, 合规条款: 2 },
  '创业者·创始人': { 定价: 4, 功能: 4, 更新日志: 3, 招聘: 3, 营销活动: 4, 合规条款: 3 },
  '投资人': { 定价: 5, 功能: 3, 更新日志: 2, 招聘: 4, 营销活动: 3, 合规条款: 4 },
}

export const DEFAULT_WEIGHTS: Record<InfoLabel, number> = {
  定价: 3, 功能: 3, 更新日志: 3, 招聘: 2, 营销活动: 3, 合规条款: 2,
}

export function getRoleDefaultWeights(role: Role): Record<InfoLabel, number> {
  if ((ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[role]) {
    return { ...(ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[role] }
  }
  return { ...DEFAULT_WEIGHTS }
}

/** 个性化匹配分（1–5），复用 Demo Inbox 排序逻辑 */
export function calcMatchScore(
  labels: InfoLabel[],
  priority: Priority,
  weights: Record<InfoLabel, number>,
): number {
  const raw =
    labels.reduce((sum, label) => sum + (weights[label] ?? 1), 0) +
    (priority === '紧急' ? 10 : priority === '中等' ? 5 : 0)
  return Math.min(5, Math.max(1, Math.round(raw / 3)))
}

export const defaultEmailSettings = (): EmailSettings => ({
  enabled: true,
  recipientEmails: [],
  pushTime: '09:00',
  pushContent: {
    includeTitle: true,
    includeSummary: true,
    includeAction: true,
    includeLink: true,
  },
})
