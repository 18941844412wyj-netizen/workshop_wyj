import postgres from 'postgres'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const m = env.match(/DATABASE_URL=(.+)/)
if (!m) throw new Error('no DATABASE_URL')
const sql = postgres(m[1].trim(), { ssl: 'require', prepare: false, max: 1 })
const rows = await sql`
  SELECT weights, custom_roles, email_settings, pg_typeof(weights) as wt
  FROM profiles
  ORDER BY updated_at DESC
  LIMIT 3
`
for (const r of rows) {
  console.log('typeof weights in JS:', typeof r.weights)
  console.log('pg_typeof:', r.wt)
  console.log('weights sample:', String(r.weights).slice(0, 80))
  console.log('---')
}
await sql.end()
