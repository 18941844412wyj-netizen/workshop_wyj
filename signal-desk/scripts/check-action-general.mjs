import { loadEnvLocal } from '../api/_lib/env.js'
import { sql } from '../api/_lib/db.js'

loadEnvLocal()

const rows = await sql`
  SELECT id, title, action_general, action_plan, pg_typeof(action_general) as ag_type
  FROM intels
  ORDER BY created_at DESC
  LIMIT 5
`
for (const r of rows) {
  console.log('---', r.title)
  console.log('typeof:', typeof r.action_general)
  console.log('value:', JSON.stringify(r.action_general).slice(0, 200))
}
await sql.end()
