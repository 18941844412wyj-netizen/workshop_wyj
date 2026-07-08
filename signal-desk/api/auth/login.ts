import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db'
import { readJsonBody, setAuthCookie, signToken } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password } = readJsonBody<{ email?: string; password?: string }>(req)

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: '请输入邮箱和密码' })
  }

  const rows = await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
  `
  if (rows.length === 0) return res.status(401).json({ error: '邮箱或密码错误' })

  const user = rows[0]
  const valid = await bcrypt.compare(password, user.password_hash as string)
  if (!valid) return res.status(401).json({ error: '邮箱或密码错误' })

  const token = await signToken({ userId: user.id as string, email: user.email as string })
  setAuthCookie(res, token)
  return res.status(200).json({ ok: true })
}
