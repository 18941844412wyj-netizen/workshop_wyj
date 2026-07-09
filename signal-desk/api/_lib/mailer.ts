import { Resend } from 'resend'
import nodemailer, { type Transporter } from 'nodemailer'

// ─── 配置检测 ────────────────────────────────────────────────────────────────

/** Resend 是否已配置（有 API Key 即可） */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** SMTP 是否已配置（host + user + pass 齐全且非占位符） */
export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  return Boolean(host && user && pass && !pass.includes('replace_me'))
}

/** 邮件功能是否可用（Resend 或 SMTP 任一已配置） */
export function isMailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured()
}

// ─── 发件人 ──────────────────────────────────────────────────────────────────

function getFromAddress(): string {
  // Resend 模式：优先用 RESEND_FROM，否则用 Resend 官方测试地址（纯地址格式）
  if (isResendConfigured()) {
    return process.env.RESEND_FROM || 'onboarding@resend.dev'
  }
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER || ''
  const name = process.env.SMTP_FROM_NAME || 'Signal Desk'
  return `${name} <${addr}>`
}

// ─── SMTP transporter（懒加载） ───────────────────────────────────────────────

let smtpTransporter: Transporter | undefined

function getSmtpTransporter(): Transporter {
  if (!smtpTransporter) {
    const port = Number(process.env.SMTP_PORT || 465)
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return smtpTransporter
}

// ─── 统一发信接口 ─────────────────────────────────────────────────────────────

export interface SendMailInput {
  to: string[]
  subject: string
  html: string
}

/** 底层发信：优先 Resend，否则 SMTP */
export async function sendMail(input: SendMailInput): Promise<{ ok: boolean; error?: string }> {
  if (!isMailConfigured()) {
    return { ok: false, error: '邮件未配置（请设置 RESEND_API_KEY 或 SMTP 参数）' }
  }

  // ── Resend ──
  if (isResendConfigured()) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({
        from: getFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
      })
      if (error) {
        console.error('[mailer] Resend error:', error)
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[mailer] Resend exception:', message)
      return { ok: false, error: message }
    }
  }

  // ── SMTP 回退 ──
  try {
    await getSmtpTransporter().sendMail({
      from: getFromAddress(),
      to: input.to.join(', '),
      subject: input.subject,
      html: input.html,
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[mailer] SMTP error:', message)
    return { ok: false, error: message }
  }
}
