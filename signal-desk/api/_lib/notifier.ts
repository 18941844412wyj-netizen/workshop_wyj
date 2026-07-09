import { sql } from './db.js'
import { defaultEmailSettings, type EmailSettings } from './types.js'
import { isMailConfigured, isResendConfigured, sendMail } from './mailer.js'

/** 邮件是否可用（Resend 或 SMTP 已配置） */
export function isEmailConfigured(): boolean {
  return isMailConfigured()
}

/** pushTime -> 北京时间小时（用于每日摘要的定时匹配） */
export const PUSH_TIME_HOURS: Record<string, number> = {
  '09:00': 9,
  '12:00': 12,
  '18:00': 18,
}

interface IntelEmailRow {
  id: string
  title: string
  what_changed: string
  why_it_matters: string
  action_general: Record<string, string>
  priority: string
}

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function priorityColor(priority: string): string {
  if (priority === '紧急') return '#d92d20'
  if (priority === '中等') return '#b54708'
  return '#667085'
}

/** 单条情报的 HTML 片段（遵循用户勾选的推送内容） */
function buildIntelBlock(intel: IntelEmailRow, settings: EmailSettings, appUrl: string): string {
  const c = settings.pushContent
  const parts: string[] = []
  parts.push(
    `<div style="border:1px solid #eaecf0;border-radius:10px;padding:16px 18px;margin:0 0 14px">`,
  )
  parts.push(
    `<span style="display:inline-block;font-size:12px;color:${priorityColor(intel.priority)};font-weight:600;margin-bottom:6px">优先级 · ${escapeHtml(intel.priority)}</span>`,
  )
  if (c.includeTitle) {
    parts.push(`<h2 style="margin:0 0 10px;font-size:17px;color:#101828">${escapeHtml(intel.title)}</h2>`)
  }
  if (c.includeSummary) {
    parts.push(`<p style="margin:0 0 8px;color:#344054"><strong>变化内容：</strong>${escapeHtml(intel.what_changed)}</p>`)
    parts.push(`<p style="margin:0 0 8px;color:#344054"><strong>战略意义：</strong>${escapeHtml(intel.why_it_matters)}</p>`)
  }
  if (c.includeAction) {
    const ag = intel.action_general ?? {}
    const items = Object.entries(ag).filter(([, v]) => v)
    if (items.length > 0) {
      parts.push('<p style="margin:0 0 6px;color:#344054"><strong>行动建议：</strong></p>')
      parts.push('<ul style="margin:0 0 4px;padding-left:20px;color:#344054">')
      for (const [k, v] of items) {
        parts.push(`<li style="margin:0 0 4px">${escapeHtml(k)}：${escapeHtml(v)}</li>`)
      }
      parts.push('</ul>')
    }
  }
  if (c.includeLink) {
    parts.push(`<p style="margin:8px 0 0"><a href="${appUrl}/inbox" style="color:#155eef;text-decoration:none">在 Signal Desk 查看详情 →</a></p>`)
  }
  parts.push('</div>')
  return parts.join('\n')
}

function wrapEmail(heading: string, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;max-width:640px;margin:0 auto;padding:8px">
  <p style="font-size:13px;color:#667085;margin:0 0 12px">${escapeHtml(heading)}</p>
  ${bodyHtml}
  <p style="color:#98a2b3;font-size:12px;margin:16px 0 0">本邮件由 Signal Desk 竞品监控自动发送。</p>
</div>`
}

function getRecipients(settings: EmailSettings): string[] {
  return (settings.recipientEmails ?? []).map(e => e.trim()).filter(e => e && e.includes('@'))
}

async function loadSettings(userId: string): Promise<EmailSettings> {
  const rows = await sql`
    SELECT email_settings FROM profiles WHERE user_id = ${userId} LIMIT 1
  `
  return (rows[0]?.email_settings ?? defaultEmailSettings()) as EmailSettings
}

function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:5173'
}

async function recordNotified(userId: string, intelIds: string[]): Promise<void> {
  for (const intelId of intelIds) {
    await sql`
      INSERT INTO notifications (user_id, intel_id) VALUES (${userId}, ${intelId})
      ON CONFLICT (user_id, intel_id) DO NOTHING
    `
  }
}

export interface NotifyResult {
  ok: boolean
  skipped: boolean
  reason?: string
  error?: string
}

/**
 * 即时推送：run-analysis 每生成一条情报后调用。
 * 仅当「pushTime=immediate」或「该情报为紧急」时立即发送；
 * 其余情报留给每日摘要（不写 notifications，便于摘要拾取）。
 */
export async function sendNotification(intelId: string, userId: string): Promise<NotifyResult> {
  const existing = await sql`
    SELECT id FROM notifications WHERE user_id = ${userId} AND intel_id = ${intelId} LIMIT 1
  `
  if (existing.length > 0) return { ok: true, skipped: true, reason: '已发送' }

  const settings = await loadSettings(userId)
  if (!settings.enabled) return { ok: true, skipped: true, reason: '未开启邮件推送' }

  const recipients = getRecipients(settings)
  if (recipients.length === 0) return { ok: true, skipped: true, reason: '无收件邮箱' }

  const intelRows = await sql`
    SELECT id, title, what_changed, why_it_matters, action_general, priority
    FROM intels WHERE id = ${intelId} AND user_id = ${userId} LIMIT 1
  `
  if (intelRows.length === 0) return { ok: false, skipped: false, error: '情报不存在' }
  const intel = intelRows[0] as IntelEmailRow

  const sendNow = settings.pushTime === 'immediate' || intel.priority === '紧急'
  if (!sendNow) return { ok: true, skipped: true, reason: '非紧急，转入每日摘要' }

  if (!isMailConfigured()) {
    console.warn('[notifier] 邮件未配置，跳过即时邮件')
    return { ok: true, skipped: true, reason: '邮件未配置' }
  }

  const appUrl = getAppUrl()
  const heading = intel.priority === '紧急' ? '紧急竞品情报' : '新竞品情报'
  const { ok, error } = await sendMail({
    to: recipients,
    subject: `【Signal Desk】${intel.title}`,
    html: wrapEmail(heading, buildIntelBlock(intel, settings, appUrl)),
  })
  if (!ok) return { ok: false, skipped: false, error }

  await recordNotified(userId, [intel.id])
  return { ok: true, skipped: false }
}

export interface DigestResult {
  ok: boolean
  skipped: boolean
  count: number
  reason?: string
  error?: string
}

/**
 * 每日摘要：把当天尚未推送过的非噪音情报汇总成一封邮件。
 * pushTime=immediate 的用户不发摘要（其情报已即时送达）。
 */
export async function sendDailyDigest(userId: string): Promise<DigestResult> {
  const settings = await loadSettings(userId)
  if (!settings.enabled) return { ok: true, skipped: true, count: 0, reason: '未开启邮件推送' }
  if (settings.pushTime === 'immediate') return { ok: true, skipped: true, count: 0, reason: 'immediate 模式无摘要' }

  const recipients = getRecipients(settings)
  if (recipients.length === 0) return { ok: true, skipped: true, count: 0, reason: '无收件邮箱' }

  const rows = await sql`
    SELECT i.id, i.title, i.what_changed, i.why_it_matters, i.action_general, i.priority
    FROM intels i
    WHERE i.user_id = ${userId}
      AND i.is_noise = false
      AND i.analysis_status = 'success'
      AND i.created_at >= NOW() - INTERVAL '25 hours'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n WHERE n.user_id = ${userId} AND n.intel_id = i.id
      )
    ORDER BY
      CASE i.priority WHEN '紧急' THEN 0 WHEN '中等' THEN 1 ELSE 2 END,
      i.created_at DESC
  `
  if (rows.length === 0) return { ok: true, skipped: true, count: 0, reason: '当日无新增情报' }

  if (!isMailConfigured()) {
    console.warn('[notifier] 邮件未配置，跳过每日摘要')
    return { ok: true, skipped: true, count: 0, reason: '邮件未配置' }
  }

  const appUrl = getAppUrl()
  const intels = rows as unknown as IntelEmailRow[]
  const body = intels.map(i => buildIntelBlock(i, settings, appUrl)).join('\n')
  const heading = `今日竞品动态摘要 · 共 ${intels.length} 条`
  const { ok, error } = await sendMail({
    to: recipients,
    subject: `【Signal Desk】每日竞品摘要 · ${intels.length} 条`,
    html: wrapEmail(heading, body),
  })
  if (!ok) return { ok: false, skipped: false, count: 0, error }

  await recordNotified(userId, intels.map(i => i.id))
  return { ok: true, skipped: false, count: intels.length }
}

/**
 * 立即发送今日真实情报（按优先级排序，最多 10 条）。
 * 若当日暂无情报则发一封空摘要提示。收件人取设置里的邮箱，无则取账号邮箱。
 * Resend 测试模式下：若设置了 RESEND_ACCOUNT_EMAIL，强制用该地址作为唯一收件人，
 * 避免因用户未保存设置而导致收件人仍为 QQ 邮箱被 Resend 拒绝。
 */
export async function sendTestEmail(userId: string): Promise<{ ok: boolean; error?: string; to?: string[] }> {
  if (!isMailConfigured()) return { ok: false, error: '邮件未配置，请先设置 RESEND_API_KEY 或 SMTP 参数' }

  // Resend 测试模式：强制使用 RESEND_ACCOUNT_EMAIL（环境变量），跳过 DB 设置
  const resendAccountEmail = process.env.RESEND_ACCOUNT_EMAIL
  if (isResendConfigured() && resendAccountEmail) {
    const recipients = [resendAccountEmail]
    const settings = await loadSettings(userId)
    const appUrl = getAppUrl()
    const rows = await sql`
      SELECT id, title, what_changed, why_it_matters, action_general, priority
      FROM intels
      WHERE user_id = ${userId}
        AND is_noise = false
        AND analysis_status = 'success'
        AND created_at >= NOW() - INTERVAL '25 hours'
      ORDER BY
        CASE priority WHEN '紧急' THEN 0 WHEN '中等' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT 10
    `
    if (rows.length === 0) {
      const { ok, error } = await sendMail({
        to: recipients,
        subject: '【Signal Desk】今日暂无新情报',
        html: wrapEmail('今日情报摘要', `<p style="color:#344054;margin:0">今日（过去 25 小时内）暂无新的竞品情报，邮件推送已配置成功。</p>`),
      })
      return { ok, error, to: recipients }
    }
    const intels = rows as unknown as IntelEmailRow[]
    const urgentCount = intels.filter(i => i.priority === '紧急').length
    const heading = urgentCount > 0
      ? `今日紧急情报 · ${urgentCount} 条紧急 / 共 ${intels.length} 条`
      : `今日情报摘要 · 共 ${intels.length} 条`
    const body = intels.map(i => buildIntelBlock(i, settings, appUrl)).join('\n')
    const { ok, error } = await sendMail({
      to: recipients,
      subject: `【Signal Desk】今日情报 · ${intels.length} 条${urgentCount > 0 ? `（${urgentCount} 条紧急）` : ''}`,
      html: wrapEmail(heading, body),
    })
    return { ok, error, to: recipients }
  }

  // 通用路径：从 DB 设置读取收件人
  const settings = await loadSettings(userId)
  let recipients = getRecipients(settings)
  if (recipients.length === 0) {
    const userRows = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`
    const fallback = userRows[0]?.email as string | undefined
    if (fallback) recipients = [fallback]
  }
  if (recipients.length === 0) return { ok: false, error: '没有可用的收件邮箱' }

  const appUrl = getAppUrl()
  const rows = await sql`
    SELECT id, title, what_changed, why_it_matters, action_general, priority
    FROM intels
    WHERE user_id = ${userId}
      AND is_noise = false
      AND analysis_status = 'success'
      AND created_at >= NOW() - INTERVAL '25 hours'
    ORDER BY
      CASE priority WHEN '紧急' THEN 0 WHEN '中等' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT 10
  `
  if (rows.length === 0) {
    const { ok, error } = await sendMail({
      to: recipients,
      subject: '【Signal Desk】今日暂无新情报',
      html: wrapEmail('今日情报摘要', `<p style="color:#344054;margin:0">今日（过去 25 小时内）暂无新的竞品情报，邮件推送已配置成功。</p>`),
    })
    return { ok, error, to: recipients }
  }
  const intels = rows as unknown as IntelEmailRow[]
  const urgentCount = intels.filter(i => i.priority === '紧急').length
  const heading = urgentCount > 0
    ? `今日紧急情报 · ${urgentCount} 条紧急 / 共 ${intels.length} 条`
    : `今日情报摘要 · 共 ${intels.length} 条`
  const body = intels.map(i => buildIntelBlock(i, settings, appUrl)).join('\n')
  const { ok, error } = await sendMail({
    to: recipients,
    subject: `【Signal Desk】今日情报 · ${intels.length} 条${urgentCount > 0 ? `（${urgentCount} 条紧急）` : ''}`,
    html: wrapEmail(heading, body),
  })
  return { ok, error, to: recipients }
}
