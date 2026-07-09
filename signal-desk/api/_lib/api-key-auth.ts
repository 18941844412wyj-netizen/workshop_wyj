import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './db.js'

export interface ApiKeyRequest extends VercelRequest {
  userId: string
  email: string
}

type ApiKeyHandler = (req: ApiKeyRequest, res: VercelResponse) => Promise<void | VercelResponse>

function extractApiKey(req: VercelRequest): string | null {
  // 优先 Authorization: Bearer <key>
  const authHeader = req.headers.authorization ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const key = authHeader.slice(7).trim()
    if (key) return key
  }
  // 备选 X-Api-Key header
  const headerKey = req.headers['x-api-key']
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim()
  // 备选 ?api_key=<key> 查询参数
  const queryKey = req.query.api_key
  if (typeof queryKey === 'string' && queryKey.trim()) return queryKey.trim()
  return null
}

export function withApiKey(handler: ApiKeyHandler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // 允许 CORS 预检
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Api-Key, Content-Type')
    if (req.method === 'OPTIONS') return res.status(204).end()

    const key = extractApiKey(req)
    if (!key) {
      return res.status(401).json({
        error: 'Missing API key. Pass via Authorization: Bearer <key>, X-Api-Key header, or ?api_key=<key>',
      })
    }

    const rows = await sql`SELECT id, email FROM users WHERE api_key = ${key} LIMIT 1`
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' })
    }

    const authed = req as ApiKeyRequest
    authed.userId = rows[0].id as string
    authed.email = rows[0].email as string
    return handler(authed, res)
  }
}
