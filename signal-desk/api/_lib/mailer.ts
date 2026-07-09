import nodemailer, { type Transporter } from 'nodemailer'

/** SMTP 是否已配置（host + user + pass 齐全且非占位符） */
export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  return Boolean(host && user && pass && !pass.includes('replace_me'))
}

let transporter: Transporter | undefined

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465)
    // 465 走 SSL；587/25 走 STARTTLS。可用 SMTP_SECURE 显式覆盖。
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : port === 465
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

/** 发件人显示名 + 地址；默认用 SMTP_USER 作为发件地址（多数服务商要求发件人=登录账号） */
function getFrom(): string {
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER || ''
  const name = process.env.SMTP_FROM_NAME || 'Signal Desk'
  return `${name} <${addr}>`
}

export interface SendMailInput {
  to: string[]
  subject: string
  html: string
}

/** 底层发信；调用前请先确保 isSmtpConfigured() 为 true */
export async function sendMail(input: SendMailInput): Promise<{ ok: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return { ok: false, error: 'SMTP 未配置' }
  }
  try {
    await getTransporter().sendMail({
      from: getFrom(),
      to: input.to.join(', '),
      subject: input.subject,
      html: input.html,
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[mailer] sendMail failed:', message)
    return { ok: false, error: message }
  }
}
