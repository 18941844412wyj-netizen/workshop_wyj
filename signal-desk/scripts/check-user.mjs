import postgres from 'postgres'
import { loadEnvLocal } from '../api/_lib/env.js'

loadEnvLocal()

const email = process.argv[2] || '1415214854@qq.com'
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 })

try {
  const rows = await sql`
    SELECT email, created_at FROM users WHERE email = ${email.toLowerCase()}
  `
  console.log(`email: ${email.toLowerCase()}`)
  console.log(`exists: ${rows.length > 0}`)
  if (rows.length) console.log(rows[0])

  const recent = await sql`
    SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 10
  `
  console.log('\nrecent users:')
  for (const u of recent) console.log(`- ${u.email} (${u.created_at})`)
} finally {
  await sql.end({ timeout: 5 })
}
