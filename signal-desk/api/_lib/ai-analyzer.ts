import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ChangeCandidate } from './change-detector'
import { BUILTIN_ROLES, INFO_LABELS, type InfoLabel, type Priority } from './types'

export const IntelSchema = z.object({
  isNoise: z.boolean(),
  noiseType: z.string().optional(),
  labels: z.array(z.enum(INFO_LABELS as unknown as [InfoLabel, ...InfoLabel[]])),
  priority: z.enum(['紧急', '中等', '低'] as [Priority, ...Priority[]]),
  title: z.string().min(1).max(100),
  whatChanged: z.string().min(1),
  whyItMatters: z.string().min(1),
  actionGeneral: z.object({ 销售: z.string(), 产品: z.string(), 营销: z.string() }),
  actionPlan: z.object({
    '产品经理': z.string(),
    '市场营销负责人': z.string(),
    '创业者·创始人': z.string(),
    '投资人': z.string(),
  }),
  sourceAnchor: z.object({ before: z.string(), after: z.string() }),
})

export type IntelAnalysis = z.infer<typeof IntelSchema>

export function isLlmConfigured(): boolean {
  const key = process.env.LLM_API_KEY
  return !!key && !key.includes('replace_me')
}

function getOpenAI() {
  if (!isLlmConfigured()) throw new Error('LLM 配置缺失')
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  })
}

/** C1 降级：关键词规则 + 模板（无 LLM 密钥时使用） */
function ruleBasedAnalyze(candidate: ChangeCandidate): IntelAnalysis {
  const text = `${candidate.before}\n${candidate.after}`.toLowerCase()
  const isPricing =
    /定价|price|\$\d+|套餐|月费|涨价/.test(text) ||
    (/\$39/.test(candidate.after) && /\$29/.test(candidate.before))

  if (isPricing) {
    return {
      isNoise: false,
      labels: ['定价'],
      priority: '紧急',
      title: '竞品定价发生变化',
      whatChanged: candidate.after || candidate.before,
      whyItMatters: '定价调整可能影响竞品价格带与用户转化，需关注其商业化策略变化。',
      actionGeneral: {
        销售: '评估是否需要推出对应价格应对策略',
        产品: '梳理竞品套餐差异与功能边界',
        营销: '关注窗口期内的差异化传播机会',
      },
      actionPlan: Object.fromEntries(
        BUILTIN_ROLES.map(r => [r, `① 复核 ${r} 视角下的定价影响；② 更新竞品矩阵与应对预案。`]),
      ) as IntelAnalysis['actionPlan'],
      sourceAnchor: { before: candidate.before, after: candidate.after },
    }
  }

  return {
    isNoise: false,
    labels: ['功能'],
    priority: '中等',
    title: '竞品页面内容发生变化',
    whatChanged: candidate.after || candidate.before,
    whyItMatters: '页面可见内容出现变化，建议结合上下文判断是否为有效信号。',
    actionGeneral: { 销售: '关注变化是否影响卖点', 产品: '评估功能/文案是否对标', 营销: '留意传播口径变化' },
    actionPlan: Object.fromEntries(
      BUILTIN_ROLES.map(r => [r, `从 ${r} 视角评估该变化对业务的影响。`]),
    ) as IntelAnalysis['actionPlan'],
    sourceAnchor: { before: candidate.before, after: candidate.after },
  }
}

export async function analyzeChange(candidate: ChangeCandidate): Promise<IntelAnalysis> {
  if (!isLlmConfigured()) {
    return ruleBasedAnalyze(candidate)
  }

  const openai = getOpenAI()
  const completion = await openai.chat.completions.parse({
    model: process.env.LLM_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          '你是竞品情报分析师。只能基于提供的原文变化作答，禁止臆造。返回结构化 JSON。' +
          '六大标签：定价、功能、更新日志、招聘、营销活动、合规条款。' +
          '纯样式/A-B摇摆/无实质文本变化应标记 isNoise=true。',
      },
      {
        role: 'user',
        content: `变化前：\n${candidate.before}\n\n变化后：\n${candidate.after}\n\n类型：${candidate.type}`,
      },
    ],
    response_format: zodResponseFormat(IntelSchema, 'intel_analysis'),
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error('LLM 未返回有效分析结果')
  return parsed
}
