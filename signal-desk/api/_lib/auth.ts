import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SignJWT, jwtVerify } from 'jose'

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

type AuthHandler = (req: AuthenticatedRequest, res: VercelResponse) => Promise<void | VercelResponse>

export function withAuth(handler: AuthHandler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      const user = await verifyToken(req)
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
  const body = req.body
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    return body as T
  }
  if (typeof body === 'string' && body.trim()) {
    return JSON.parse(body) as T
  }
  return {} as T
}
