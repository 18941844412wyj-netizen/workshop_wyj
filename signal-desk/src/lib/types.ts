import type { Priority, InfoLabel } from './constants'

export type FeedbackTag = '有用' | '幻觉/事实错误' | '漏抓' | '优先级标错' | '建议是废话' | 'A/B测试误报' | '其他'
export type FeedbackModule = '变化内容' | '战略意义' | '行动建议' | '信息标签' | '优先级'
export type IntelStatus = '未读' | '已读' | '归档'
export type Role = string

export interface Intel {
  id: string
  targetId: string
  targetName: string
  track: string
  labels: InfoLabel[]
  priority: Priority
  title: string
  whatChanged: string
  whyItMatters: string
  actionPlan: Record<string, string>
  actionGeneral: { 销售: string; 产品: string; 营销: string }
  sourceHtml: { before: string; after: string }
  status: IntelStatus
  matchScore: number
  createdAt: string
  feedback: FeedbackTag[]
  feedbackModules: FeedbackModule[]
  feedbackNote: string
  inCorePool: boolean
}

export const FEEDBACK_TAGS: FeedbackTag[] = [
  '有用', '幻觉/事实错误', '漏抓', '优先级标错', '建议是废话', 'A/B测试误报', '其他',
]
export const FEEDBACK_MODULES: FeedbackModule[] = [
  '变化内容', '战略意义', '行动建议', '信息标签', '优先级',
]

export function getIntelActionPlan(intel: Intel, role: Role): string {
  return intel.actionPlan[role] ?? intel.actionPlan['产品经理'] ?? ''
}

export interface ConvMsg {
  id: string
  role: 'user' | 'ai'
  content: string
  referenceIntelIds?: string[]
  referenceLabel?: string
  timestamp: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  ended: boolean
  messageCount?: number
  createdAt: string
  updatedAt: string
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ConvMsg[]
}
