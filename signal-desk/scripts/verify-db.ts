import postgres from 'postgres'
import { loadEnvLocal } from '../api/_lib/env.js'

loadEnvLocal()

const EXPECTED_TABLES = [
  'users',
  'profiles',
  'targets',
  'snapshots',
  'intels',
  'feedback',
  'chat_sessions',
  'conv_messages',
  'notifications',
]

const connectionString = process.env.DATABASE_URL
if (!connectionString || connectionString.includes('replace_me')) {
  console.error('❌ DATABASE_URL 未配置')
  process.exit(1)
}

function detectProvider(url: string): string {
  if (url.includes('supabase.co') || url.includes('pooler.supabase.com')) return 'Supabase'
  if (url.includes('neon.tech')) return 'Neon'
  return 'Postgres（未知提供商）'
}

const sql = postgres(connectionString, {
  ssl: 'require',
  prepare: false,
  max: 1,
})

try {
  const [{ version }] = await sql`SELECT version() AS version`
  const provider = detectProvider(connectionString)
  const host = (() => {
    try {
      return new URL(connectionString.replace(/^postgresql:/, 'http:')).host
    } catch {
      return '(无法解析)'
    }
  })()

  console.log('=== 数据库连接验证 ===')
  console.log(`提供商: ${provider}`)
  console.log(`主机: ${host}`)
  console.log(`Postgres: ${String(version).split(',')[0]}`)
  console.log('')

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  const existing = new Set(tables.map(t => t.table_name))

  console.log('=== 表结构检查 ===')
  let allOk = true
  for (const name of EXPECTED_TABLES) {
    const ok = existing.has(name)
    if (!ok) allOk = false
    console.log(`${ok ? '✓' : '✗'} ${name}`)
  }

  const extra = [...existing].filter(t => !EXPECTED_TABLES.includes(t))
  if (extra.length > 0) {
    console.log('')
    console.log('其他表:', extra.join(', '))
  }

  console.log('')
  console.log('=== 数据统计 ===')
  if (allOk) {
    const [users] = await sql`SELECT COUNT(*)::int AS c FROM users`
    const [targets] = await sql`SELECT COUNT(*)::int AS c FROM targets`
    const [intels] = await sql`SELECT COUNT(*)::int AS c FROM intels`
    const [sessions] = await sql`SELECT COUNT(*)::int AS c FROM chat_sessions`
    console.log(`用户: ${users.c}`)
    console.log(`监控目标: ${targets.c}`)
    console.log(`情报: ${intels.c}`)
    console.log(`对话会话: ${sessions.c}`)
  } else {
    console.log('表不完整，跳过统计。请运行: npm run db:migrate')
  }

  console.log('')
  if (provider !== 'Supabase') {
    console.log('⚠️  当前 DATABASE_URL 仍指向 Neon，尚未切换到 Supabase。')
    console.log('   请在 .env.local 中替换为 Supabase 连接串后重新运行本脚本。')
    process.exit(allOk ? 2 : 1)
  }

  console.log(allOk ? '✅ Supabase 迁移验证通过' : '❌ Supabase 已连接但表结构不完整，请运行 npm run db:migrate')
  process.exit(allOk ? 0 : 1)
} catch (err) {
  console.error('❌ 数据库连接失败:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
