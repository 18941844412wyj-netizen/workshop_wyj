import { loadEnvLocal } from '../api/_lib/env'
import { sql } from '../api/_lib/db'
import { getRoleDefaultWeights } from '../api/_lib/types'
import { mapIntelRow } from '../api/_lib/insights-mapper'

loadEnvLocal()

const rows = await sql`
  SELECT i.*, t.name AS target_name, t.track
  FROM intels i
  JOIN targets t ON t.id = i.target_id
  ORDER BY i.created_at DESC
  LIMIT 2
`
const weights = getRoleDefaultWeights('产品经理')
for (const row of rows) {
  const mapped = mapIntelRow(row as Record<string, unknown>, weights)
  console.log('---', mapped.title)
  console.log('actionGeneral:', mapped.actionGeneral)
}
