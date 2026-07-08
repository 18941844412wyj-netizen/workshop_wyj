import { loadEnvLocal } from '../api/_lib/env.js'
import { sql } from '../api/_lib/db.js'
import { calcMatchScore } from '../api/_lib/types.js'

loadEnvLocal()

const MOCK_TARGET = {
  name: 'Midjourney',
  url: 'https://midjourney.com',
  track: '生图',
}

const MOCK_INTELS = [
  {
    labels: ['定价'],
    priority: '紧急' as const,
    title: 'Midjourney Starter 套餐涨价 $29→$39',
    whatChanged:
      'Starter 套餐月费由 $29 调整为 $39，其它套餐（Basic / Standard / Pro）价格未变。涨幅约 34%，定价页面「Starter」卡片底部金额已更新。',
    whyItMatters:
      'Midjourney 向企业客户发力，连续两季度提高入门门槛，可能意味着其商业化战略从 C 端向 B 端倾移，同时筛选低付费意愿用户。',
    actionPlan: {
      产品经理: '① 评估我司定价策略是否需要推出对应企业级套餐；② 关注 Midjourney 企业版功能差异化，梳理竞品矩阵。',
      市场营销负责人: '① 利用对手涨价窗口期推出限时优惠；② 强调性价比作为差异化卖点。',
      '创业者·创始人': '① 重新评估成本结构；② 调研目标客户对价格弹性的敏感度。',
      投资人: '① 关注 MJ 收入增速与客户留存数据；② 评估跟进竞品的定价空间。',
    },
    actionGeneral: {
      销售: '向潜在企业客户传达性价比优势，突出对手涨价事实。',
      产品: '功能差异分析，找到竞品未覆盖的需求点。',
      营销: '品牌定位调整，借势营销，吸引对手流失用户。',
    },
    sourceAnchor: {
      before: '<div class="pricing-card starter">\n  <h3>Starter</h3>\n  <p class="price">$29/月</p>\n</div>',
      after: '<div class="pricing-card starter">\n  <h3>Starter</h3>\n  <p class="price"><del>$29</del> $39/月</p>\n</div>',
    },
    status: '未读',
    matchScore: 5,
  },
  {
    labels: ['功能'],
    priority: '中等' as const,
    title: 'Midjourney 新增 AI 视频广告生成功能',
    whatChanged:
      '功能区新增「AI Video Ads」卡片，支持上传品牌素材后一键生成 15s 视频广告，当前限 Pro 套餐及以上用户访问。',
    whyItMatters:
      '生图平台向下游创意服务延伸，扩大用户黏性；若该功能体验良好，可能分流部分短视频生产工具的用户。',
    actionPlan: {
      产品经理: '① 调研用户对视频广告生成的需求强度；② 评估是否跟进开发。',
      市场营销负责人: '① 内测该功能并产出对标评测；② 测试对营销工作流的适配度。',
      '创业者·创始人': '① 评估是否影响自身产品定位；② 考虑与 MJ 合作或差异化切入。',
      投资人: '① 关注功能落地质量与用户口碑；② 评估对短视频赛道的冲击范围。',
    },
    actionGeneral: {
      销售: '以功能评测为素材展示竞品能力边界。',
      产品: '快速原型验证同类功能可行性。',
      营销: '借竞品发布节点发布对比内容。',
    },
    sourceAnchor: {
      before: '<section class="features">\n  <div>Text to Image</div>\n</section>',
      after: '<section class="features">\n  <div>Text to Image</div>\n  <div class="new-badge">AI Video Ads ✨</div>\n</section>',
    },
    status: '已读',
    matchScore: 4,
    inCorePool: true,
  },
]

async function ensureTarget(userId: string) {
  const existing = await sql`
    SELECT id FROM targets WHERE user_id = ${userId} AND name = ${MOCK_TARGET.name} LIMIT 1
  `
  if (existing.length > 0) return existing[0].id as string

  const inserted = await sql`
    INSERT INTO targets (user_id, name, url, track, collect_mode, monitor_status)
    VALUES (${userId}, ${MOCK_TARGET.name}, ${MOCK_TARGET.url}, ${MOCK_TARGET.track}, 'manual', '监控中')
    RETURNING id
  `
  return inserted[0].id as string
}

async function ensureSnapshots(targetId: string) {
  const existing = await sql`
    SELECT id FROM snapshots WHERE target_id = ${targetId} ORDER BY captured_at ASC LIMIT 2
  `
  if (existing.length >= 2) {
    return { beforeId: existing[0].id as string, afterId: existing[1].id as string }
  }

  const before = await sql`
    INSERT INTO snapshots (target_id, html, text_content, version)
    VALUES (${targetId}, '<html>before</html>', 'before content', 1)
    RETURNING id
  `
  const after = await sql`
    INSERT INTO snapshots (target_id, html, text_content, version)
    VALUES (${targetId}, '<html>after</html>', 'after content', 2)
    RETURNING id
  `
  return { beforeId: before[0].id as string, afterId: after[0].id as string }
}

async function seedForUser(userId: string, email: string) {
  const profileRows = await sql`SELECT weights FROM profiles WHERE user_id = ${userId} LIMIT 1`
  const weights = (profileRows[0]?.weights ?? {
    定价: 3, 功能: 3, 更新日志: 3, 招聘: 2, 营销活动: 3, 合规条款: 2,
  }) as Record<string, number>

  const targetId = await ensureTarget(userId)
  const { beforeId, afterId } = await ensureSnapshots(targetId)

  const existingCount = await sql`
    SELECT count(*)::int AS c FROM intels WHERE user_id = ${userId}
  `
  if ((existingCount[0].c as number) >= MOCK_INTELS.length) {
    console.log(`跳过 ${email}：已有 ${existingCount[0].c} 条情报`)
    return
  }

  for (const intel of MOCK_INTELS) {
    const dup = await sql`
      SELECT id FROM intels WHERE user_id = ${userId} AND title = ${intel.title} LIMIT 1
    `
    if (dup.length > 0) continue

    const matchScore = calcMatchScore(intel.labels as never, intel.priority, weights as never)
    await sql`
      INSERT INTO intels (
        target_id, user_id, snapshot_before_id, snapshot_after_id,
        labels, priority, title, what_changed, why_it_matters,
        action_general, action_plan, source_anchor, status,
        match_score, in_core_pool, analysis_status, is_noise
      ) VALUES (
        ${targetId}, ${userId}, ${beforeId}, ${afterId},
        ${intel.labels}, ${intel.priority}, ${intel.title},
        ${intel.whatChanged}, ${intel.whyItMatters},
        ${intel.actionGeneral}, ${intel.actionPlan},
        ${intel.sourceAnchor}, ${intel.status},
        ${matchScore}, ${intel.inCorePool ?? false}, 'success', false
      )
    `
    console.log(`  + ${intel.title}`)
  }
}

const users = await sql`SELECT id, email FROM users ORDER BY created_at ASC`
if (users.length === 0) {
  console.error('数据库中没有用户，请先注册账号后再运行 seed')
  process.exit(1)
}

for (const user of users) {
  console.log(`为用户 ${user.email} 写入 mock 情报...`)
  await seedForUser(user.id as string, user.email as string)
}

console.log('完成')
