import OpenAI from 'openai'
import { isLlmConfigured } from './ai-analyzer'

export interface IntelContext {
  id: string
  title: string
  whatChanged: string
  whyItMatters: string
  actionPlan: Record<string, string>
  sourceAnchor: { before: string; after: string }
}

export interface ChatHistoryItem {
  role: 'user' | 'ai'
  content: string
}

function getOpenAI() {
  if (!isLlmConfigured()) throw new Error('LLM 配置缺失')
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  })
}

function extractIntelSnippet(intel: IntelContext, referenceLabel: string): string {
  switch (referenceLabel) {
    case '变化内容':
      return `【${intel.title}】变化内容：${intel.whatChanged}`
    case '战略意义':
      return `【${intel.title}】战略意义：${intel.whyItMatters}`
    case '行动建议':
      return `【${intel.title}】行动建议：${Object.values(intel.actionPlan).join('；')}`
    default:
      return [
        `【${intel.title}】`,
        `变化：${intel.whatChanged}`,
        `意义：${intel.whyItMatters}`,
        `原文对比：${intel.sourceAnchor.before} → ${intel.sourceAnchor.after}`,
      ].join('\n')
  }
}

function ruleBasedReply(
  message: string,
  referenceLabel: string,
  intels: IntelContext[],
): string {
  const corpus = intels.map(i => extractIntelSnippet(i, referenceLabel)).join('\n\n')
  const lower = message.toLowerCase()
  const hasDigits = /\d/.test(corpus)
  const asksAmount = /多少|变化|涨|降|价格/.test(message)
  if (asksAmount && hasDigits) {
    const nums = corpus.match(/\$?\d+(?:\.\d+)?/g) ?? []
    if (nums.length >= 2) {
      return `基于引用情报，价格从 ${nums[0]} 调整为 ${nums[1]}（引用范围：${referenceLabel}）。`
    }
    if (nums.length === 1) {
      return `基于引用情报，相关价格为 ${nums[0]}（引用范围：${referenceLabel}）。`
    }
  }

  const needsExternal =
    /ceo|创始人是谁|股价|市值|融资|总部在哪|什么时候成立/.test(lower) ||
    (/多少|具体数字|百分比/.test(message) && !corpus.match(/\d+/))

  if (needsExternal && !corpus.match(/\d+/)) {
    return '资料不足，无法基于已有情报作答。当前引用情报中未包含您询问的信息，本系统仅基于已有情报作答，不联网查询。'
  }

  if (intels.length > 1) {
    const synthesis = intels.map(i => `• ${i.title}：${i.whyItMatters}`).join('\n')
    return `综合 ${intels.length} 条引用情报（范围：${referenceLabel}）分析：\n\n${synthesis}\n\n如需更具体的数据，请确认情报原文是否包含相关信息。`
  }

  const intel = intels[0]
  if (!intel) return '请先选择至少一条情报作为引用。'
  return `基于情报「${intel.title}」（引用：${referenceLabel}）分析：\n\n${intel.whyItMatters}\n\n变化详情：${intel.whatChanged}`
}

export async function generateChatReply(params: {
  message: string
  referenceLabel: string
  intels: IntelContext[]
  history: ChatHistoryItem[]
}): Promise<string> {
  const { message, referenceLabel, intels, history } = params
  if (intels.length === 0) {
    return '请先选择至少一条情报作为引用。'
  }

  if (!isLlmConfigured()) {
    return ruleBasedReply(message, referenceLabel, intels)
  }

  const intelBlock = intels.map(i => extractIntelSnippet(i, referenceLabel)).join('\n\n---\n\n')
  const historyBlock = history
    .slice(-8)
    .map(h => `${h.role === 'user' ? '用户' : '助手'}：${h.content}`)
    .join('\n')

  const systemPrompt =
    '你是竞品情报分析助手。只能基于用户提供的情报原文作答，禁止联网、禁止臆造。' +
    '若问题所需信息不在情报原文中，必须明确回复「资料不足」，并简要说明缺少什么。' +
    '回答使用简体中文，简洁专业。'

  const userPrompt = [
    '【引用情报原文】',
    intelBlock,
    historyBlock ? `\n【对话历史】\n${historyBlock}` : '',
    `\n【用户问题】\n${message}`,
  ].join('\n')

  try {
    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    })
    const content = completion.choices[0]?.message?.content?.trim()
    if (content) return content
  } catch (err) {
    console.error('[chat-reply] LLM failed:', err)
  }

  return ruleBasedReply(message, referenceLabel, intels)
}
