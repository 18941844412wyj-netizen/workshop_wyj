import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ChangeCandidate } from './change-detector.js'
import { BUILTIN_ROLES, INFO_LABELS, PRIORITIES, type InfoLabel, type Priority } from './types.js'

export const IntelSchema = z.object({
  isNoise: z.boolean(),
  noiseType: z.string().nullable(),
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
export type IntelBase = Omit<IntelAnalysis, 'actionGeneral' | 'actionPlan'>

const DEFAULT_ACTION = '结合该变化评估对业务的影响并更新应对预案。'

const IntelSchemaLoose = z.object({
  isNoise: z.boolean(),
  noiseType: z.string().nullable().optional(),
  labels: z.array(z.string()),
  priority: z.string(),
  title: z.string().min(1),
  whatChanged: z.string().min(1),
  whyItMatters: z.string().min(1),
  actionGeneral: z
    .object({ 销售: z.string().optional(), 产品: z.string().optional(), 营销: z.string().optional() })
    .optional(),
  actionPlan: z.record(z.string(), z.string()).optional(),
  sourceAnchor: z.object({ before: z.string(), after: z.string() }).optional(),
})

const ActionAdviceSchemaLoose = z.object({
  actionGeneral: z
    .object({ 销售: z.string().optional(), 产品: z.string().optional(), 营销: z.string().optional() })
    .optional(),
  actionPlan: z.record(z.string(), z.string()).optional(),
})

function coerceIntelRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const o = { ...(raw as Record<string, unknown>) }
  if (Array.isArray(o.actionGeneral)) delete o.actionGeneral
  else if (o.actionGeneral && typeof o.actionGeneral === 'object') {
    const ag = o.actionGeneral as Record<string, unknown>
    for (const k of Object.keys(ag)) {
      if (ag[k] == null) delete ag[k]
    }
  }
  if (Array.isArray(o.actionPlan)) delete o.actionPlan
  else if (o.actionPlan && typeof o.actionPlan === 'object') {
    const ap = o.actionPlan as Record<string, unknown>
    for (const k of Object.keys(ap)) {
      if (ap[k] == null) delete ap[k]
    }
  }
  if (Array.isArray(o.sourceAnchor) || o.sourceAnchor == null) {
    o.sourceAnchor = { before: '', after: '' }
  }
  return o
}

function defaultActions(): Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'> {
  return {
    actionGeneral: { 销售: DEFAULT_ACTION, 产品: DEFAULT_ACTION, 营销: DEFAULT_ACTION },
    actionPlan: Object.fromEntries(BUILTIN_ROLES.map(r => [r, DEFAULT_ACTION])) as IntelAnalysis['actionPlan'],
  }
}

function coerceActionValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const t = value.trim()
    return t || undefined
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    for (const key of ['建议', 'action', 'text', 'content', 'summary', 'value']) {
      if (typeof o[key] === 'string' && o[key]) return (o[key] as string).trim()
    }
    const parts = Object.values(o).filter(v => typeof v === 'string') as string[]
    if (parts.length) return parts.join('；')
  }
  if (Array.isArray(value)) {
    const parts = value.filter(v => typeof v === 'string') as string[]
    if (parts.length) return parts.join('；')
  }
  return undefined
}

function coerceActionAdviceRaw(raw: unknown): z.infer<typeof ActionAdviceSchemaLoose> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const result: z.infer<typeof ActionAdviceSchemaLoose> = {}

  const ag = o.actionGeneral ?? o.general ?? o.actions
  if (ag && typeof ag === 'object' && !Array.isArray(ag)) {
    const src = ag as Record<string, unknown>
    result.actionGeneral = {
      销售: coerceActionValue(src['销售'] ?? src.sales ?? src['销售团队']),
      产品: coerceActionValue(src['产品'] ?? src.product ?? src['产品团队']),
      营销: coerceActionValue(src['营销'] ?? src.marketing ?? src['营销团队']),
    }
  }

  const ap = o.actionPlan ?? o.plan ?? o.roles
  if (ap && typeof ap === 'object' && !Array.isArray(ap)) {
    const src = ap as Record<string, unknown>
    result.actionPlan = Object.fromEntries(
      BUILTIN_ROLES.map(r => [r, coerceActionValue(src[r])]).filter(([, v]) => v),
    )
  }

  const hasGeneral = result.actionGeneral && Object.values(result.actionGeneral).some(Boolean)
  const hasPlan = result.actionPlan && Object.keys(result.actionPlan).length > 0
  if (!hasGeneral && !hasPlan) {
    const blob = coerceActionValue(o.advice) ?? coerceActionValue(o.suggestion) ?? coerceActionValue(o.recommendation)
    if (blob) {
      result.actionGeneral = { 销售: blob, 产品: blob, 营销: blob }
    }
  }

  return result
}

function hasDistinctActions(actions: Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'>): boolean {
  const general = [actions.actionGeneral.销售, actions.actionGeneral.产品, actions.actionGeneral.营销].filter(
    t => t && t !== DEFAULT_ACTION,
  )
  const plan = BUILTIN_ROLES.map(r => actions.actionPlan[r]).filter(t => t && t !== DEFAULT_ACTION)
  return new Set(general).size >= 2 && new Set(plan).size >= 2
}

function normalizeActions(
  raw?: z.infer<typeof ActionAdviceSchemaLoose>,
): Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'> {
  const defaults = defaultActions()
  return {
    actionGeneral: {
      销售: raw?.actionGeneral?.销售?.trim() || defaults.actionGeneral.销售,
      产品: raw?.actionGeneral?.产品?.trim() || defaults.actionGeneral.产品,
      营销: raw?.actionGeneral?.营销?.trim() || defaults.actionGeneral.营销,
    },
    actionPlan: Object.fromEntries(
      BUILTIN_ROLES.map(r => [r, raw?.actionPlan?.[r]?.trim() || defaults.actionPlan[r]]),
    ) as IntelAnalysis['actionPlan'],
  }
}

function completeIntel(
  base: IntelBase,
  actions?: Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'>,
): IntelAnalysis {
  const normalized = actions ? normalizeActions(actions) : defaultActions()
  return { ...base, ...normalized }
}

function normalizeIntel(raw: z.infer<typeof IntelSchemaLoose>): IntelAnalysis {
  const labels = raw.labels.filter((l): l is InfoLabel =>
    (INFO_LABELS as string[]).includes(l),
  )
  const priority = (PRIORITIES as string[]).includes(raw.priority)
    ? (raw.priority as Priority)
    : '中等'
  const base: IntelBase = {
    isNoise: raw.isNoise,
    noiseType: raw.noiseType ?? null,
    labels: labels.length ? labels : ['功能'],
    priority,
    title: raw.title.slice(0, 100),
    whatChanged: raw.whatChanged,
    whyItMatters: raw.whyItMatters,
    sourceAnchor: raw.sourceAnchor ?? { before: '', after: '' },
  }
  return completeIntel(base, normalizeActions(raw))
}

function parseIntel(raw: unknown): IntelAnalysis {
  return normalizeIntel(IntelSchemaLoose.parse(coerceIntelRaw(raw)))
}

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

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return JSON.parse(fenced[1].trim())
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error('LLM 返回内容无法解析为 JSON')
}

const SYSTEM_PROMPT =
  '你是竞品情报分析师。只能基于提供的原文变化作答，禁止臆造。' +
  '六大标签：定价、功能、更新日志、招聘、营销活动、合规条款。' +
  '纯样式/A-B摇摆/无实质文本变化应标记 isNoise=true。' +
  '返回 JSON，字段：isNoise(boolean), noiseType(string|null), labels(string[]), priority(紧急|中等|低), ' +
  'title, whatChanged, whyItMatters, actionGeneral({销售,产品,营销}), ' +
  'actionPlan({产品经理,市场营销负责人,创业者·创始人,投资人}), sourceAnchor({before,after})。'

const ACTION_SYSTEM_PROMPT =
  '你是竞品情报顾问。基于已识别的页面变化，为不同职能角色输出具体、可执行且彼此不同的应对建议。' +
  '只能使用提供的变化原文与摘要，禁止臆造。' +
  '必须严格输出以下 JSON 结构，所有值为中文字符串（1-2句），不要嵌套对象或数组：' +
  '{"actionGeneral":{"销售":"...","产品":"...","营销":"..."},"actionPlan":{"产品经理":"...","市场营销负责人":"...","创业者·创始人":"...","投资人":"..."}}'

async function generateActionAdvice(
  candidate: ChangeCandidate,
  base: IntelBase,
): Promise<Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'>> {
  const openai = getOpenAI()
  const userContent = [
    `变化前：\n${candidate.before}`,
    `变化后：\n${candidate.after}`,
    `标签：${base.labels.join('、')}`,
    `优先级：${base.priority}`,
    `标题：${base.title}`,
    `变化摘要：${base.whatChanged}`,
    `战略意义：${base.whyItMatters}`,
  ].join('\n\n')

  const messages = [
    { role: 'system' as const, content: ACTION_SYSTEM_PROMPT + ' 只输出 JSON，不要 markdown。' },
    { role: 'user' as const, content: userContent },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o',
      messages: attempt === 0
        ? messages
        : [
            messages[0],
            {
              role: 'user' as const,
              content:
                userContent +
                '\n\n上次输出格式不正确。请只返回 actionGeneral 与 actionPlan 两个对象，键名必须完全一致，值为中文字符串。',
            },
          ],
      response_format: { type: 'json_object' },
    })
    const content = completion.choices[0]?.message?.content
    if (!content) continue
    const actions = normalizeActions(coerceActionAdviceRaw(extractJson(content)))
    if (hasDistinctActions(actions)) return actions
  }

  throw new Error('LLM 行动建议格式无效或缺少差异化内容')
}

async function enrichWithActions(candidate: ChangeCandidate, base: IntelBase): Promise<IntelAnalysis> {
  if (base.isNoise || !isLlmConfigured()) {
    return completeIntel(base)
  }
  try {
    const actions = await generateActionAdvice(candidate, base)
    return completeIntel(base, actions)
  } catch (err) {
    console.warn('[ai-analyzer] generateActionAdvice failed:', err)
    return completeIntel(base)
  }
}

async function analyzeWithJsonMode(
  openai: OpenAI,
  candidate: ChangeCandidate,
): Promise<IntelAnalysis> {
  const completion = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + ' 只输出 JSON，不要 markdown。' },
      {
        role: 'user',
        content: `变化前：\n${candidate.before}\n\n变化后：\n${candidate.after}\n\n类型：${candidate.type}`,
      },
    ],
    response_format: { type: 'json_object' },
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('LLM 未返回有效分析结果')
  try {
    return parseIntel(extractJson(content))
  } catch (err) {
    console.warn('[ai-analyzer] JSON parse failed, fallback rule-based:', err)
    return ruleBasedAnalyze(candidate)
  }
}

/** 关键词规则：仅判噪音 */
function patternNoiseBase(candidate: ChangeCandidate): IntelBase | null {
  const fullText = `${candidate.before}\n${candidate.after}`
  if (/trusted by|e-commerce sellers|as featured in techcrunch|product hunt|saastr/i.test(fullText)) {
    return {
      isNoise: true,
      noiseType: '营销数字诱饵',
      labels: ['营销活动'],
      priority: '低',
      title: '页面营销文案微调（噪音）',
      whatChanged: candidate.after || candidate.before,
      whyItMatters: '属营销口径或统计数字变化，无实质产品/定价信号。',
      sourceAnchor: { before: candidate.before, after: candidate.after },
    }
  }
  return null
}

function buildSignalBase(
  candidate: ChangeCandidate,
  label: InfoLabel,
  priority: Priority,
  title: string,
  whyItMatters: string,
): IntelBase {
  return {
    isNoise: false,
    noiseType: null,
    labels: [label],
    priority,
    title,
    whatChanged: candidate.after || candidate.before,
    whyItMatters,
    sourceAnchor: { before: candidate.before, after: candidate.after },
  }
}

/** 关键词规则：仅打标与摘要（不生成行动建议） */
function patternSignalBase(candidate: ChangeCandidate): IntelBase | null {
  const text = `${candidate.before}\n${candidate.after}`
  const lower = text.toLowerCase()

  if (/senior pmm|ml engineer|data engineer|engineering manager|远程 · 全职|招聘/i.test(text)) {
    return buildSignalBase(candidate, '招聘', '中等', '竞品招聘动态变化', '招聘扩张或岗位调整可能反映业务方向与资源投入变化。')
  }
  if (/大促|折扣码|spring30|mid25|立减|年度计划.*折/i.test(text)) {
    return buildSignalBase(candidate, '营销活动', '中等', '竞品营销活动变化', '促销口径或折扣力度变化可能影响获客与转化策略。')
  }
  if (/服务端保留|自购买之日起|credits 自购买|有效期内|逾期自动删除/i.test(text)) {
    return buildSignalBase(candidate, '合规条款', '中等', '竞品条款/权益变化', '数据保留或权益有效期变化可能影响用户预期与合规风险。')
  }
  if (/v2\.\d|新增：|改进：|changelog|release notes/i.test(text)) {
    return buildSignalBase(candidate, '更新日志', '中等', '竞品版本更新', '版本发布或更新日志变化反映产品迭代节奏。')
  }
  if (/ai 视频广告|详情页文案|新功能|一键将商品|一键生成/i.test(text)) {
    return buildSignalBase(candidate, '功能', '中等', '竞品功能发生变化', '新功能或能力上线可能改变竞争格局。')
  }
  if (
    /定价|price|\$\d+|套餐|月费|涨价|credits · 约/.test(lower) ||
    (/\$39/.test(candidate.after) && /\$29/.test(candidate.before)) ||
    (/2,500 credits/.test(candidate.before) && /2,000 credits/.test(candidate.after))
  ) {
    return buildSignalBase(candidate, '定价', '紧急', '竞品定价发生变化', '定价调整可能影响竞品价格带与用户转化，需关注其商业化策略变化。')
  }
  return null
}

function ruleBasedAnalyze(candidate: ChangeCandidate): IntelAnalysis {
  const noise = patternNoiseBase(candidate)
  if (noise) return completeIntel(noise)
  const signal = patternSignalBase(candidate)
  if (signal) return completeIntel(signal)

  return completeIntel(
    buildSignalBase(
      candidate,
      '功能',
      '中等',
      '竞品页面内容发生变化',
      '页面可见内容出现变化，建议结合上下文判断是否为有效信号。',
    ),
  )
}

export async function analyzeChange(candidate: ChangeCandidate): Promise<IntelAnalysis> {
  const noise = patternNoiseBase(candidate)
  if (noise) return completeIntel(noise)

  const signal = patternSignalBase(candidate)
  if (signal) return enrichWithActions(candidate, signal)

  if (!isLlmConfigured()) {
    return ruleBasedAnalyze(candidate)
  }

  const openai = getOpenAI()
  try {
    const completion = await openai.chat.completions.parse({
      model: process.env.LLM_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `变化前：\n${candidate.before}\n\n变化后：\n${candidate.after}\n\n类型：${candidate.type}`,
        },
      ],
      response_format: zodResponseFormat(IntelSchema, 'intel_analysis'),
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (parsed) return parsed
  } catch {
    /* strict schema 不支持时降级 json_object */
  }
  return analyzeWithJsonMode(openai, candidate)
}
