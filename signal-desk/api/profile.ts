import type { VercelResponse } from '@vercel/node'
import { withAuth, readJsonBody, type AuthenticatedRequest } from './_lib/auth'
import { sql } from './_lib/db'
import {
  BUILTIN_ROLES,
  INFO_LABELS,
  defaultEmailSettings,
  getRoleDefaultWeights,
  type InfoLabel,
  type Role,
} from './_lib/types'

function serializeProfile(p: Record<string, unknown>) {
  return {
    role: p.role ?? null,
    weights: p.weights,
    customRoles: p.custom_roles ?? [],
    emailSettings: p.email_settings ?? defaultEmailSettings(),
    onboarded: p.onboarded ?? false,
  }
}

function validateWeights(weights: Record<string, number> | undefined): weights is Record<InfoLabel, number> {
  if (!weights || typeof weights !== 'object') return false
  for (const label of INFO_LABELS) {
    const v = weights[label]
    if (typeof v !== 'number' || v < 0 || v > 5) return false
  }
  return INFO_LABELS.some(label => (weights[label] ?? 0) > 0)
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT p.role, p.weights, p.custom_roles, p.email_settings, p.onboarded, u.email
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ${req.userId} LIMIT 1
    `
    if (rows.length === 0) {
      return res.status(200).json({
        email: req.email,
        role: null,
        weights: getRoleDefaultWeights('产品经理'),
        customRoles: [],
        emailSettings: defaultEmailSettings(),
        onboarded: false,
      })
    }
    const p = rows[0] as Record<string, unknown>
    return res.status(200).json({
      email: p.email,
      ...serializeProfile(p),
    })
  }

  if (req.method === 'PUT') {
    const body = readJsonBody<{
      role?: Role | null
      weights?: Record<InfoLabel, number>
      customRoles?: unknown[]
      emailSettings?: unknown
      onboarded?: boolean
    }>(req)

    const role = body.role ?? null
    if (role && !BUILTIN_ROLES.includes(role as typeof BUILTIN_ROLES[number]) && typeof role !== 'string') {
      return res.status(400).json({ error: '无效角色' })
    }

    const weights = body.weights ?? (role ? getRoleDefaultWeights(role) : undefined)
    if (!validateWeights(weights)) {
      return res.status(400).json({ error: '权重配置无效：6 个标签均须有 0-5 的值，且至少一个大于 0' })
    }

    const customRoles = body.customRoles ?? []
    const emailSettings = body.emailSettings ?? defaultEmailSettings()
    const onboarded = body.onboarded ?? false

    await sql`
      UPDATE profiles SET
        role = ${role},
        weights = ${JSON.stringify(weights)},
        custom_roles = ${JSON.stringify(customRoles)},
        email_settings = ${JSON.stringify(emailSettings)},
        onboarded = ${onboarded},
        updated_at = NOW()
      WHERE user_id = ${req.userId}
    `

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
