import { Resend } from 'resend'
import { sql } from './db.js'
import { defaultEmailSettings, type EmailSettings } from './types.js'

export function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY
  return !!key && !key.includes('replace_me')
}

interface IntelEmailRow {
  title: string
  what_changed: string
  why_it_matters: string
  action_general: Record<string, string>
  priority: string
}

function buildEmailHtml(intel: IntelEmailRow, settings: EmailSettings, appUrl: string): string {
  const parts: string[] = []
  if (settings.pushContent.includeTitle) {
    parts.push(`<h2>${intel.title}</h2>`)
  }
  if (settings.pushContent.includeSummary) {
    parts.push(`<p><strong>变化：</strong>${intel.what_changed}</p>`)
    parts.push(`<p><strong>意义：</strong>${intel.why_it_matters}</p>`)
  }
  if (settings.pushContent.includeAction) {
    const ag = intel.action_general ?? {}
    parts.push('<p><strong>行动建议：</strong></p><ul>')
    for (const [k, v] of Object.entries(ag)) {
      if (v) parts.push(`<li>${k}：${v}</li>`)
    }
    parts.push('</ul>')
  }
  if (settings.pushContent.includeLink) {
    parts.push(`<p><a href="${appUrl}/inbox">在 Signal Desk 查看详情 →</a></p>`)
  }
  parts.push(`<p style="color:#888;font-size:12px">优先级：${intel.priority}</p>`)
  return `<div style="font-family:sans-serif;line-height:1.6">${parts.join('\n')}</div>`
}

export async function sendNotification(
  intelId: string,
  userId: string,
): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const existing = await sql`
    SELECT id FROM notifications WHERE user_id = ${userId} AND intel_id = ${intelId} LIMIT 1
  `
  if (existing.length > 0) return { ok: true, skipped: true }

  const profileRows = await sql`
    SELECT email_settings FROM profiles WHERE user_id = ${userId} LIMIT 1
  `
  const emailSettings = (profileRows[0]?.email_settings ?? defaultEmailSettings()) as EmailSettings
  if (!emailSettings.enabled) return { ok: true, skipped: true }

  const recipients = (emailSettings.recipientEmails ?? []).filter(e => e && e.includes('@'))
  if (recipients.length === 0) return { ok: true, skipped: true }

  const intelRows = await sql`
    SELECT title, what_changed, why_it_matters, action_general, priority
    FROM intels WHERE id = ${intelId} AND user_id = ${userId} LIMIT 1
  `
  if (intelRows.length === 0) {
    return { ok: false, skipped: false, error: '情报不存在' }
  }
  const intel = intelRows[0] as IntelEmailRow

  if (!isResendConfigured()) {
    console.warn('[notifier] RESEND_API_KEY 未配置，跳过邮件发送')
    return { ok: true, skipped: true }
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: 'Signal Desk <onboarding@resend.dev>',
    to: recipients,
    subject: `【Signal Desk】${intel.title}`,
    html: buildEmailHtml(intel, emailSettings, appUrl),
    headers: { 'X-Idempotency-Key': `${userId}:${intelId}` },
  })

  if (error) {
    console.error('[notifier] Resend error:', error)
    return { ok: false, skipped: false, error: error.message }
  }

  await sql`
    INSERT INTO notifications (user_id, intel_id) VALUES (${userId}, ${intelId})
  `
  return { ok: true, skipped: false }
}
