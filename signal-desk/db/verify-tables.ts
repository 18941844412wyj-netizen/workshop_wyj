import { sql } from '../api/_lib/db.js'

const rows = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`
console.log(rows.map(r => r.table_name).join(', '))
