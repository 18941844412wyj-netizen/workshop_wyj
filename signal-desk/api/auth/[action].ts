import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { sql } from '../_lib/db'
import { readJsonBody, setAuthCookie, clearAuthCookie, signToken } from '../_lib/auth'
import { DEFAULT_WEIGHTS, defaultEmailSettings } from '../_lib/types'

async function handleLogin(req: VercelRequest, res: VercelResponse) {
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

async function handleRegister(req: VercelRequest, res: VercelResponse) {
  const { email, password, confirm } = readJsonBody<{
    email?: string
    password?: string
    confirm?: string
  }>(req)
  if (!email?.trim()) return res.status(400).json({ error: '请输入邮箱' })
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({ error: '请输入有效邮箱' })
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  if (password !== confirm) return res.status(400).json({ error: '两次密码不一致' })
  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
  if (existing.length > 0) return res.status(409).json({ error: '该邮箱已注册' })
  const passwordHash = await bcrypt.hash(password, 12)
  const users = await sql`
    INSERT INTO users (email, password_hash) VALUES (${email.toLowerCase()}, ${passwordHash})
    RETURNING id, email
  `
  const user = users[0]
  await sql`
    INSERT INTO profiles (user_id, weights, email_settings, onboarded)
    VALUES (${user.id}, ${JSON.stringify(DEFAULT_WEIGHTS)}, ${JSON.stringify(defaultEmailSettings())}, false)
  `
  const token = await signToken({ userId: user.id as string, email: user.email as string })
  setAuthCookie(res, token)
  return res.status(200).json({ ok: true })
}

async function handleLogout(_req: VercelRequest, res: VercelResponse) {
  clearAuthCookie(res)
  return res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const action = req.query.action as string | undefined
  if (action === 'login') return handleLogin(req, res)
  if (action === 'register') return handleRegister(req, res)
  if (action === 'logout') return handleLogout(req, res)
  return res.status(404).json({ error: 'Unknown auth action' })
}
