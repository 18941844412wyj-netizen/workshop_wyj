import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SignJWT, jwtVerify } from 'jose'
import { sql } from './db.js'

const COOKIE_NAME = 'token'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET 未配置')
  return new TextEncoder().encode(secret)
}

export interface TokenPayload {
  userId: string
  email: string
}

export type AuthenticatedRequest = VercelRequest & TokenPayload

function parseCookie(req: VercelRequest): string | null {
  const header = req.headers.cookie ?? ''
  const match = header.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`))
  return match ? decodeURIComponent(match.trim().slice(COOKIE_NAME.length + 1)) : null
}

export function setAuthCookie(res: VercelResponse, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`,
  )
}

export function clearAuthCookie(res: VercelResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`,
  )
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyToken(req: VercelRequest): Promise<TokenPayload> {
  const token = parseCookie(req)
  if (!token) throw new Error('Unauthorized')
  const { payload } = await jwtVerify(token, getSecret())
  const userId = payload.userId as string | undefined
  const email = payload.email as string | undefined
  if (!userId || !email) throw new Error('Unauthorized')
  return { userId, email }
}

async function userExistsInDb(userId: string): Promise<boolean> {
  const rows = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`
  return rows.length > 0
}

type AuthHandler = (req: AuthenticatedRequest, res: VercelResponse) => Promise<void | VercelResponse>

export function withAuth(handler: AuthHandler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const user = await verifyToken(req)
      if (!(await userExistsInDb(user.userId))) {
        clearAuthCookie(res)
        return res.status(401).json({ error: '登录已失效，请重新登录' })
      }
      const authed = req as AuthenticatedRequest
      authed.userId = user.userId
      authed.email = user.email
      return handler(authed, res)
    } catch {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }
}

export function readJsonBody<T extends Record<string, unknown>>(req: VercelRequest): T {
  try {
    const body = req.body
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      return body as T
    }
    if (typeof body === 'string' && body.trim()) {
      return JSON.parse(body) as T
    }
  } catch {
    // vercel dev 在 body 已消费或格式异常时访问 req.body 可能抛错
  }
  return {} as T
}
