import type { VercelResponse } from '@vercel/node'
import { withAuth, type AuthenticatedRequest } from './_lib/auth'
import { sql } from './_lib/db'

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const rows = await sql`
    SELECT role, weights, custom_roles, email_settings, onboarded
    FROM profiles WHERE user_id = ${req.userId} LIMIT 1
  `
  if (rows.length === 0) return res.status(404).json({ error: 'Profile not found' })

  const p = rows[0]
  return res.status(200).json({
    role: p.role,
    weights: p.weights,
    customRoles: p.custom_roles,
    emailSettings: p.email_settings,
    onboarded: p.onboarded,
  })
}

export default withAuth(handler)
