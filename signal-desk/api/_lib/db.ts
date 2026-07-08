import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { loadEnvLocal } from './env'

loadEnvLocal()

let sqlInstance: NeonQueryFunction<false, false> | undefined

function getSql(): NeonQueryFunction<false, false> {
  if (!sqlInstance) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString || connectionString.includes('replace_me')) {
      throw new Error('DATABASE_URL 未配置或为占位符，请在 signal-desk/.env.local 中设置真实 Neon 连接串')
    }
    sqlInstance = neon(connectionString)
  }
  return sqlInstance
}

export const sql: NeonQueryFunction<false, false> = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getSql()(strings, ...values)) as NeonQueryFunction<false, false>
