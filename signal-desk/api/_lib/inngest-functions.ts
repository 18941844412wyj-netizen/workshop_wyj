import { inngest } from './inngest-client.js'
import { sql } from './db.js'
import { runAnalysis } from './run-analysis.js'
import { sendDailyDigest, PUSH_TIME_HOURS } from './notifier.js'

/**
 * 每 5 分钟扫描所有 scheduled 目标，检测页面变化并生成情报。
 * Inngest v4 API：trigger 放在 options.triggers 数组里，handler 是第 2 个参数。
 */
export const detectPageChanges = inngest.createFunction(
  {
    id: 'detect-page-changes',
    name: '页面变化检测（每 5 分钟）',
    triggers: [{ cron: '*/5 * * * *' }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const targets = await step.run('fetch-scheduled-targets', async () => {
      return sql<{ id: string; user_id: string }[]>`
        SELECT id, user_id FROM targets WHERE collect_mode = 'scheduled'
      `
    })

    const results: { targetId: string; ok: boolean; generated: number }[] = []

    for (const target of targets) {
      const result = await step.run(`analyze-target-${target.id}`, async () => {
        return runAnalysis(target.id, target.user_id)
      })
      results.push({ targetId: target.id, ok: result.ok, generated: result.generated })
    }

    return { processed: targets.length, results }
  },
)

/**
 * 每小时检查一次，对当前北京时间命中推送时段的用户发送日报摘要。
 */
export const sendHourlyDigest = inngest.createFunction(
  {
    id: 'send-hourly-digest',
    name: '日报摘要推送（每小时）',
    triggers: [{ cron: '0 * * * *' }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const beijingHour = await step.run('get-beijing-hour', async () => {
      return (new Date().getUTCHours() + 8) % 24
    })

    const dueTimes = Object.entries(PUSH_TIME_HOURS)
      .filter(([, h]) => h === beijingHour)
      .map(([t]) => t)

    if (dueTimes.length === 0) {
      return { skipped: true, beijingHour }
    }

    const userIds = await step.run('fetch-due-users', async () => {
      const rows = await sql<{ user_id: string }[]>`
        SELECT user_id FROM profiles
        WHERE email_settings->>'enabled' = 'true'
          AND email_settings->>'pushTime' = ANY(${sql.array(dueTimes)})
      `
      return rows.map((r) => r.user_id)
    })

    let sent = 0
    let totalIntels = 0
    for (const userId of userIds) {
      const result = await step.run(`digest-user-${userId}`, async () => {
        return sendDailyDigest(userId)
      })
      if (result.ok && !result.skipped) {
        sent++
        totalIntels += result.count
      }
    }

    return { beijingHour, dueTimes, users: userIds.length, sent, totalIntels }
  },
)
