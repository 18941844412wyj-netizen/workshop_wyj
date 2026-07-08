import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { loadEnvLocal } from '../api/_lib/env'

loadEnvLocal()

const __dirname = dirname(fileURLToPath(import.meta.url))
const connectionString = process.env.DATABASE_URL

if (!connectionString || connectionString.includes('replace_me')) {
  console.error('DATABASE_URL 未配置或为占位符，请在 signal-desk/.env.local 中设置 Supabase 连接串')
  process.exit(1)
}

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
const sql = postgres(connectionString, { ssl: 'require', max: 1 })

try {
  await sql.unsafe(schema)
  console.log('Migration complete (Supabase / Postgres)')
} finally {
  await sql.end({ timeout: 5 })
}
