import { neon } from '@neondatabase/serverless'
import { loadEnvLocal } from './env'

loadEnvLocal()

const connectionString = process.env.DATABASE_URL
if (!connectionString || connectionString.includes('replace_me')) {
  console.error('DATABASE_URL 未配置或为占位符，请在 signal-desk/.env.local 中设置真实 Neon 连接串')
  process.exit(1)
}

const sql = neon(connectionString)
const rows = await sql`SELECT 1 AS v`
console.log(rows[0].v)
