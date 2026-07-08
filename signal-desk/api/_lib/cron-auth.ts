import type { VercelRequest } from '@vercel/node'

export function isCronSecretConfigured(): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && !secret.includes('replace_me')
}

export function verifyCronSecret(req: VercelRequest): boolean {
  if (!isCronSecretConfigured()) return false
  const auth = req.headers.authorization ?? req.headers['Authorization']
  return auth === `Bearer ${process.env.CRON_SECRET}`
}
