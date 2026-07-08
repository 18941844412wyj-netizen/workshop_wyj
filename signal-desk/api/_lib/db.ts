import postgres, { type Sql } from 'postgres'
import { loadEnvLocal } from './env'

loadEnvLocal()

let sqlInstance: Sql | undefined

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || connectionString.includes('replace_me')) {
    throw new Error(
      'DATABASE_URL 未配置或为占位符，请在 signal-desk/.env.local 中设置 Supabase 连接串',
    )
  }
  return connectionString
}

function isPoolerConnection(connectionString: string): boolean {
  return (
    connectionString.includes('pooler.supabase.com')
    || connectionString.includes('pgbouncer=true')
    || /:6543\//.test(connectionString)
  )
}

function getSql(): Sql {
  if (!sqlInstance) {
    const connectionString = getConnectionString()
    sqlInstance = postgres(connectionString, {
      ssl: 'require',
      // Supabase Transaction pooler 不支持 prepared statements
      prepare: !isPoolerConnection(connectionString),
      max: 1,
    })
  }
  return sqlInstance
}

export const sql: Sql = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getSql()(strings, ...values)) as Sql
