import type { VercelResponse } from '@vercel/node'
import type { JSONValue } from 'postgres'
import { withAuth, readJsonBody, type AuthenticatedRequest } from './_lib/auth.js'
import { sql } from './_lib/db.js'
import { parseJsonField } from './_lib/jsonb.js'
import {
  BUILTIN_ROLES,
  INFO_LABELS,
  defaultEmailSettings,
  getRoleDefaultWeights,
  type CustomRole,
  type EmailSettings,
  type InfoLabel,
  type Role,
} from './_lib/types.js'

function serializeProfile(p: Record<string, unknown>) {
  return {
    role: p.role ?? null,
    weights: parseJsonField<Record<InfoLabel, number>>(
      p.weights,
      getRoleDefaultWeights('产品经理'),
    ),
    customRoles: parseJsonField<CustomRole[]>(p.custom_roles, []),
    emailSettings: parseJsonField<EmailSettings>(p.email_settings, defaultEmailSettings()),
    onboarded: Boolean(p.onboarded),
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
  try {
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
      const emailSettings = (body.emailSettings ?? defaultEmailSettings()) as EmailSettings
      const onboarded = body.onboarded ?? false

      await sql`
        INSERT INTO profiles (user_id, role, weights, custom_roles, email_settings, onboarded, updated_at)
        VALUES (
          ${req.userId},
          ${role},
          ${sql.json(weights)},
          ${sql.json(customRoles as unknown as JSONValue)},
          ${sql.json(emailSettings as unknown as JSONValue)},
          ${onboarded},
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          role = EXCLUDED.role,
          weights = EXCLUDED.weights,
          custom_roles = EXCLUDED.custom_roles,
          email_settings = EXCLUDED.email_settings,
          onboarded = EXCLUDED.onboarded,
          updated_at = NOW()
      `

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[profile]', err)
    return res.status(500).json({ error: '服务器错误，请稍后重试' })
  }
}

export default withAuth(handler)
