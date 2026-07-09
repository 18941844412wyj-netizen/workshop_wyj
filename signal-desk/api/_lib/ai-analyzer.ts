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
  whatChanged: z.string().optional(),
  whyItMatters: z.string().optional(),
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

  const whatChanged = coerceActionValue(o.whatChanged ?? o['变化内容'] ?? o.summary)
  if (whatChanged) result.whatChanged = whatChanged
  const whyItMatters = coerceActionValue(o.whyItMatters ?? o['战略意义'] ?? o.significance)
  if (whyItMatters) result.whyItMatters = whyItMatters

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

const DOMAIN_PERSONA =
  '你是互联网 AIGC 视觉赛道（生图 / 生视频 / 创意 Agent）的资深市场竞争分析专家，' +
  '常年研究 Midjourney、Stable Diffusion 生态、DALL·E、Ideogram、Recraft、Runway、Pika、可灵、即梦、Sora、Luma 等公司。' +
  '你分析的素材都是这些公司公开发布在官网、定价页、更新日志、招聘页上的信息，属于正当的公开市场研究。' +
  '你熟悉这条赛道的关键竞争维度：模型能力（分辨率 / 时长 / 一致性 / 可控性 / 出图速度）、' +
  'credits 与订阅的商业化打法、工作流与 API / 插件生态、版权合规与商用授权、获客渠道与增长杠杆。' +
  '你的读者是产品经理、市场负责人、创始人和投资人——他们要的是能立刻用于决策的判断，不是正确的废话。'

const DEPTH_RULES =
  '写作铁律：' +
  '(1) 只基于提供的变化原文作答，禁止臆造事实；证据不足时直接写「信息不足，需补充：X」，不要用模糊表述凑数。' +
  '(2) 严禁空话套话。禁止出现「可能影响策略」「需要关注」「建议评估影响」这类没有信息量的句子；' +
  '每一句都必须落到具体的数字、机制、差异点或可验证的判断上。' +
  '(3) 允许犀利、有立场、有取舍——可以明确点评这一步的商业意图、能力短板或高明 / 冒进之处。' +
  '(4) 量化优先：涉及价格、credits、时长、分辨率等，务必还原「从 A 变到 B、幅度多少」，而不是只说「有变化」。' +
  '(5) 站在 AIGC 视觉赛道的专业上下文里解读，而不是泛泛的「某互联网公司」。'

const SYSTEM_PROMPT =
  DOMAIN_PERSONA +
  ' 你的任务：对一条竞品公开页面的变化做深度竞争分析解读。' +
  '六大标签：定价、功能、更新日志、招聘、营销活动、合规条款。' +
  '纯样式 / A-B 摇摆 / 无实质文本变化应标记 isNoise=true。' +
  DEPTH_RULES +
  ' 字段深度要求：' +
  'whatChanged——用完整句子还原「改了什么」，包含变化前→变化后与量化幅度，不能只丢一个词或一个折扣码；' +
  'whyItMatters——推断对方的动机、这一步指向的竞争意图、对赛道格局与「我方」的具体影响，以及时间窗口，2-4 句、有判断；' +
  'title——一句话点出信号本质（≤100 字）。' +
  ' 返回 JSON，字段：isNoise(boolean), noiseType(string|null), labels(string[]), priority(紧急|中等|低), ' +
  'title, whatChanged, whyItMatters, actionGeneral({销售,产品,营销}), ' +
  'actionPlan({产品经理,市场营销负责人,创业者·创始人,投资人}), sourceAnchor({before,after})。'

  const ACTION_SYSTEM_PROMPT =
  DOMAIN_PERSONA +
  ' 你的任务：基于已识别的竞品变化，为不同职能角色给出「读完就能动手」的应对建议。' +
  DEPTH_RULES +
  ' 建议要求：每个角色一条，彼此明显不同（针对该角色真正关心的杠杆），' +
  '要具体到「做什么动作、盯哪个指标 / 参数、抢哪个时间窗口」，而不是「关注一下」「调整策略」。' +
  'actionGeneral 面向销售 / 产品 / 营销三条职能主线；' +
  'actionPlan 面向产品经理（功能与工作流取舍）、市场营销负责人（获客与投放口径）、' +
  '创业者·创始人（战略与资源押注）、投资人（赛道信号与标的价值）。' +
  ' 同时基于原文把「变化内容」与「战略意义」改写得更有深度：' +
  'whatChanged 用完整句子还原变化前→变化后与量化幅度，不能只丢一个词或折扣码；' +
  'whyItMatters 推断对方动机、竞争意图、对赛道格局与我方的具体影响及时间窗口（2-4 句、有判断）。' +
  ' 必须严格输出以下 JSON 结构，所有值为中文字符串（可犀利、有取舍），不要嵌套对象或数组：' +
  '{"whatChanged":"...","whyItMatters":"...","actionGeneral":{"销售":"...","产品":"...","营销":"..."},"actionPlan":{"产品经理":"...","市场营销负责人":"...","创业者·创始人":"...","投资人":"..."}}'

const ActionEnrichSchema = z.object({
  whatChanged: z.string().min(1),
  whyItMatters: z.string().min(1),
  actionGeneral: z.object({ 销售: z.string().min(1), 产品: z.string().min(1), 营销: z.string().min(1) }),
  actionPlan: z.object({
    '产品经理': z.string().min(1),
    '市场营销负责人': z.string().min(1),
    '创业者·创始人': z.string().min(1),
    '投资人': z.string().min(1),
  }),
})

interface EnrichedSignal {
  whatChanged?: string
  whyItMatters?: string
  actions: Pick<IntelAnalysis, 'actionGeneral' | 'actionPlan'>
}

async function generateActionAdvice(
  candidate: ChangeCandidate,
  base: IntelBase,
): Promise<EnrichedSignal> {
  const openai = getOpenAI()
  const model = process.env.LLM_MODEL || 'gpt-4o'
  const userContent = [
    `变化前：\n${candidate.before}`,
    `变化后：\n${candidate.after}`,
    `标签：${base.labels.join('、')}`,
    `优先级：${base.priority}`,
    `标题：${base.title}`,
    `变化摘要（草稿，可改写得更有深度）：${base.whatChanged}`,
    `战略意义（草稿，可改写得更有深度）：${base.whyItMatters}`,
  ].join('\n\n')

  const messages = [
    { role: 'system' as const, content: ACTION_SYSTEM_PROMPT + ' 只输出 JSON，不要 markdown。' },
    { role: 'user' as const, content: userContent },
  ]

  // 首选 json_schema 严格结构化输出（网关下最稳定），失败再降级 json_object
  try {
    const completion = await openai.chat.completions.parse({
      model,
      messages,
      response_format: zodResponseFormat(ActionEnrichSchema, 'action_enrich'),
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (parsed) {
      const actions = normalizeActions(parsed)
      if (hasDistinctActions(actions)) {
        return { whatChanged: parsed.whatChanged, whyItMatters: parsed.whyItMatters, actions }
      }
    }
  } catch {
    /* strict schema 不支持时降级 json_object */
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model,
      messages: attempt === 0
        ? messages
        : [
            messages[0],
            {
              role: 'user' as const,
              content:
                userContent +
                '\n\n上次输出格式不正确。请只返回 whatChanged、whyItMatters、actionGeneral、actionPlan 四个字段，键名必须完全一致，值为中文字符串。',
            },
          ],
      response_format: { type: 'json_object' },
    })
    const content = completion.choices[0]?.message?.content
    if (!content) continue
    const raw = coerceActionAdviceRaw(extractJson(content))
    const actions = normalizeActions(raw)
    if (hasDistinctActions(actions)) {
      return { whatChanged: raw.whatChanged, whyItMatters: raw.whyItMatters, actions }
    }
  }

  throw new Error('LLM 行动建议格式无效或缺少差异化内容')
}

/** 取更有深度的版本：LLM 改写显著更长且非空时采用，否则保留规则草稿 */
function pickDeeper(draft: string, rewritten?: string): string {
  const next = rewritten?.trim()
  if (!next) return draft
  if (next.length >= Math.max(draft.trim().length, 12)) return next
  return draft
}

async function enrichWithActions(candidate: ChangeCandidate, base: IntelBase): Promise<IntelAnalysis> {
  if (base.isNoise || !isLlmConfigured()) {
    return completeIntel(base)
  }
  try {
    const enriched = await generateActionAdvice(candidate, base)
    const deepenedBase: IntelBase = {
      ...base,
      whatChanged: pickDeeper(base.whatChanged, enriched.whatChanged),
      whyItMatters: pickDeeper(base.whyItMatters, enriched.whyItMatters),
    }
    return completeIntel(deepenedBase, enriched.actions)
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
