import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { verifyCronSecret } from '../_lib/cron-auth.js'
import { sendDailyDigest, PUSH_TIME_HOURS } from '../_lib/notifier.js'

/**
 * 每日摘要定时任务。Vercel cron 以 UTC 触发；pushTime 是北京时间。
 * 到点的用户（email_settings.pushTime 的小时 == 当前北京小时）会收到当日情报摘要。
 * 调试：?all=1 对所有非 immediate 用户强制发一次；?pushTime=09:00 手动指定时段。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const override = typeof req.query.pushTime === 'string' ? req.query.pushTime : undefined
  const runAll = req.query.all === '1'

  const beijingHour = (new Date().getUTCHours() + 8) % 24
  const dueTimes = override
    ? [override]
    : Object.entries(PUSH_TIME_HOURS)
        .filter(([, h]) => h === beijingHour)
        .map(([t]) => t)

  const userIds = new Set<string>()
  if (runAll) {
    const rows = await sql`
      SELECT user_id FROM profiles
      WHERE email_settings->>'enabled' = 'true'
        AND email_settings->>'pushTime' <> 'immediate'
    `
    for (const r of rows) userIds.add(r.user_id as string)
  } else {
    for (const t of dueTimes) {
      const rows = await sql`
        SELECT user_id FROM profiles
        WHERE email_settings->>'enabled' = 'true'
          AND email_settings->>'pushTime' = ${t}
      `
      for (const r of rows) userIds.add(r.user_id as string)
    }
  }

  let sent = 0
  let totalIntels = 0
  for (const userId of userIds) {
    try {
      const result = await sendDailyDigest(userId)
      if (result.ok && !result.skipped) {
        sent++
        totalIntels += result.count
      }
    } catch (err) {
      console.error('[cron/digest] user failed:', userId, err)
    }
  }

  return res.status(200).json({
    ok: true,
    beijingHour,
    dueTimes,
    users: userIds.size,
    sent,
    totalIntels,
  })
}
