---
title: 竞品情报监控代理 MVP（Signal Desk）实现计划（SSOT）
status: draft
---

> **必需技能：** `spec-execute`（按批次执行本计划）
> **上下文获取：** 必须先执行 `spec-context` 获取上下文，定位 `{FEATURE_DIR}`，失败即停止

**目标：** 交付 Signal Desk MVP——一个 Vite SPA + Vercel Serverless Functions + Neon Postgres 的 Web 应用，把「网页变化」自动解读为分角色结构化情报，支持因人而异推送与引用式深度对话。  
**范围：** In = 注册/登录 + Onboarding（角色+权重）+ 监控目标 + 每日定时 Cron 采集（UR-3）+ 采集层（markdown抓取+JS注入降级）+ 变化检测两层去噪 + AI 打标+分析（真实大模型，Structured Outputs）+ 个性化 Inbox（双栏，含状态/核心池）+ 引用式深度对话 + 邮件通知（UR-6）+ 反馈（UR-7）+ 设置页；Out = 真实全站规模化爬取反爬对抗、Slack/IM、多租户、质量看板、竞品自动推荐（UR-2）  
**架构：** 项目目录 `signal-desk/`：前端 Vite SPA（复用 Demo 组件/类型）部署至 Vercel CDN，后端 Vercel Serverless Functions 在 `api/` 目录，数据库 Neon Serverless Postgres（`@neondatabase/serverless`）；采集默认使用 `ceshi/` 测试包，真实站点抓取可行性由 R-010 验证。  
**验收口径：** `requirements/prd.md §6` AC-001 ～ AC-016，`requirements/solution.md §8 Mini-PRD`  
**影响范围：** 全新系统（greenfield），所有模块均为新增基线，无既有线上依赖——Auth / Profile / Targets / Collector / ChangeDetector / AIAnalyzer / Matcher / Insights / Chat / Feedback / Notifier / Cron  
**需遵守的不变量：**  
- AI 输出必须可溯源到原文，禁止臆造；每条情报带原文锚点  
- 采集层支持 markdown 抓取 + JS 注入降级（<3 行触发）；本期默认输入为测试包  
- 存储必须 Serverless 友好，禁止本地文件持久化  
- 个性化「有重点、有取舍但不屏蔽」：低权重领域降权保留  
- 深度对话仅基于「当前情报 + 被引用原文 + 会话上下文」，无依据答「资料不足」  
**子仓范围：** 无（仓库无 `.gitmodules`，`SUBMODULE_SET_JSON=[]`）

---

## TL;DR

- 一句话目标：3 天内交付 Signal Desk MVP，实现「采集→变化检测→AI 打标+分析→个性化 Inbox→深度对话+通知」完整闭环。
- In/Out：见上方范围；测试包（`ceshi/`）为默认采集输入，真实抓取可行性由 R-010 单独验证，不阻塞主路径。
- 关键路径：T1（基础设施+DB）→ T3（Auth）→ T5（采集+检测）→ T6（AI 分析，`/api/analyze` 可触发）→ T7（Insights API）→ T8（Inbox 前端）→ T9（Cron）→ 后续 P1 功能。
- 最大风险与优先验证点：R-003（LLM 密钥+成本，开发启动后 0.5 天内）、R-001（Neon 重启不丢数据，开发启动后 0.5 天内）、R-007（打标+个性化匹配可用性，Day2 前）。

---

## 范围与边界

- **In**：
  1. 最简注册/登录/登出 + httpOnly Cookie JWT 会话（Auth）
  2. Onboarding：选角色（内置 4 类）+ 自动应用角色默认信息标签权重（Profile）
  3. 监控目标 CRUD（名称/URL/赛道/采集方式：手动即时/固定时间每日定时）
  4. 采集层：真实站点 markdown 抓取 + JS 注入降级（<3 行触发）+ DB 存快照；本期默认输入=测试包 HTML
  5. 变化检测第 1 层：可见文本提取 + 空白归一化 + 行 diff → 变化候选
  6. AI 打标+分析第 2 层：Structured Outputs（strict json_schema + Zod）→ labels/priority/五要素/isNoise；noise 不生成情报
  7. `/api/analyze`（手动即时触发）+ `/api/cron/analyze`（每日定时 Cron，`CRON_SECRET` 保护）
  8. 情报 Insights API：个性化排序（画像权重+优先级加成）+ 状态（未读/已读/归档）+ 核心池
  9. 个性化 Inbox 前端：双栏工作区（列表+Inspector 详情/对话 Tab）、晨报/核心池/全部视图、筛选、角色快切
  10. 主动通知：Resend 邮件 + idempotency key 去重（`/api/notify`）
  11. 引用式深度对话：grounded prompt + 多会话 + 多情报引用（`/api/insights/:id/chat`）
  12. 反馈：七标签 + 问题模块 + 补充说明 + 「有用」自动入核心池（`/api/insights/:id/feedback`）
  13. 设置页：角色与权重 Tab（含自定义角色）+ 邮件通知 Tab（多邮箱）
  14. 路由兼容重定向：`/inbox/:id` → `?id=:id&view=detail`；`/chat` → `?view=chat`
- **Out**：真实全站规模化爬取反爬对抗（能力已设计，见 R-010）、行业政策源采集、竞品自动推荐（UR-2）、Slack/IM 推送、多用户权限与数据隔离、质量看板、跨历史情报追问、反馈反哺权重、周/月报
- **不变量/关键约束**：见头部；AUTH_SECRET / DATABASE_URL / LLM_API_KEY / RESEND_API_KEY / CRON_SECRET 全部经环境变量注入，不硬编码
- **影响面**：全新系统；路由 `/login` `/register` `/onboarding` `/targets` `/inbox` `/settings`；API `POST /api/auth/register` `/api/auth/login` `/api/auth/logout` `GET|PUT /api/profile` `GET|POST /api/targets` `PUT|DELETE /api/targets/:id` `POST /api/analyze` `GET /api/cron/analyze` `GET /api/insights` `GET|PATCH /api/insights/:id` `POST /api/insights/:id/chat` `POST /api/insights/:id/feedback` `POST /api/notify`；环境变量 × 5

## 代码工作区清单

> 仓库无 `.gitmodules`（`SUBMODULE_SET_JSON=[]`），无子仓需处理。
> 所有代码均在根项目 `001-competitor-intel-monitor` 分支下进行。

---

## 里程碑与节奏

- **M0-Day1（基础设施+核心后端）**：T1 项目初始化 + T2 DB DDL + T3 Auth API + T4 Profile/Onboarding API 完成；浏览器能注册/登录/完成 Onboarding。
- **M1-Day2（核心闭环可演示）**：T5 采集+变化检测 + T6 AI 打标+分析（`/api/analyze` 可触发）+ T7 Insights API + T8 Inbox 前端完成；核心闭环（登录→新增目标→手动触发→Inbox 看到情报）Day2 结束前可演示（AC-003/004/005）。
- **M2-Day3（P1 功能 + 部署）**：T9 Cron + T10 邮件通知 + T11 深度对话 + T12 反馈 + T13 设置页 + T14 路由兼容 + T15 全量测试包验证 + Vercel 部署；所有 AC 满足，全量 `ceshi/cases/` 验证通过。
- **裁剪策略**（R-002 不成立时）：先保 M0+M1 核心闭环，深度对话降级为单轮追问，Cron 配置留 T9 可独立补。

---

## 依赖与资源

- **环境/权限**：Node.js 20+、npm、Vercel CLI（`npm i -g vercel`）；Vercel 账号 + 项目创建权限；Neon 账号（Marketplace 接入）；`DATABASE_URL`（Neon）、`LLM_API_KEY`（OpenAI 兼容）、`LLM_BASE_URL`（如非 OpenAI 需配置）、`LLM_MODEL`、`RESEND_API_KEY`、`CRON_SECRET`（随机字符串）、`SESSION_SECRET`（随机字符串）
- **外部系统/团队**：LLM 服务（OpenAI 兼容，支持 `strict json_schema`，Structured Outputs）；Resend（邮件，免费额度 100 封/天）；Neon（托管 Postgres，Vercel Marketplace 接入）
- **数据/样本**：`ceshi/` 目录（测试包 `index.html` 基准 + `cases/` 变体，已在仓库中）；Demo 类型定义 `demo/src/prototypes/001-competitor-intel-monitor/mockData.ts`（作为 DB 字段基线参考）
- **发布/变更窗口**：Vercel Hobby Cron 仅每日一次，不承诺分钟级（ADR-0005）；Neon 免费层支持持久化，Serverless 友好

---

## 风险与验证（可执行）

| # | 风险/假设 | 验证方式 | 成功信号 | 失败信号 | Owner | 截止 | 下一步动作 |
|---|---|---|---|---|---|---|---|
| R-001 | Neon 重启后数据仍在 | 接入 Neon 后注册一个账号、存一条情报，执行 `vercel redeploy`，查询 DB 数据 | 数据仍在 | 数据丢失 | DEV | T1 完成后（Day1） | 换 Supabase/Prisma Postgres，更新数据访问层 |
| R-002 | 3 天工时能否覆盖全部 MVP | T1~T8 完成后评估剩余工时 | 核心闭环 Day2 前可演示 | 超期 | DEV+PM | Day2 早 | 深度对话降级单轮追问；先保 M1 核心闭环上线 |
| R-003 | LLM Structured Outputs 可用性与成本 | T6 完成后对单条情报做端到端调用，记录耗时与 token | 稳定返回且成本可接受 | 不稳定/超预算 | PM 供密钥/DEV | T6 完成后（Day2 中） | 打标降级「关键词规则+AI 辅助」；低优先级情报只出通用建议 |
| R-004 | 两层去噪命中率 | T15 全量跑 `ceshi/cases/` 正反向用例统计 Recall/FP | 样式/A-B/幻觉不报、真信号全捕获 | 误报或漏报 | DEV | Day2 结束前 | 强化正文抽取/归一化预处理 + few-shot |
| R-007 | 打标+个性化匹配可用性 | 用 `ceshi/cases/` 覆盖 6 标签×4 角色核对打标与 Inbox 排序 | 标签命中正确、切画像排序有差异且重点置顶 | 打标乱/排序无差异 | PM 验收/DEV | Day2 结束前 | 个性化降级「筛选+高亮」而非重排 |
| R-008 | Resend 邮件可用性 | T10 完成后对一条「紧急」情报触发真实发送 + 二次触发验去重 | 稳定发出且收到、去重生效 | 发不出/重复 | PM 供密钥/DEV | T10 完成后（Day3） | 降级站内红点保底，邮件转后续 |
| R-010 | 真实站点 markdown 抓取+JS 注入降级可行性 | T5 完成后选 1–2 个真实站点（含需 JS 注入类）走完整链路记录耗时 | 跑通且不超时 | 超时/无头渲染跑不起来 | DEV | Day2 结束前 | 降级「仅静态 fetch + 测试包输入」，真实 JS 注入转后续演进 |

---

## 验收口径（可追溯）

- 追溯：`requirements/prd.md §6 AC-001～AC-016`（主验收口径）
- 追溯：`requirements/solution.md §8 Mini-PRD 验收标准（AC 1～12）`
- 追溯：`requirements/prd.md §5 规则-1～规则-16`（业务规则，影响实现细节）
- 关键验收点（摘要）：
  - AC-001：注册+Onboarding（选角色自动应用默认权重）+ 登录进 Inbox
  - AC-003/004：手动触发后生成 ≥1 条含五要素+信息标签的情报
  - AC-005：Inbox 按画像排序（重点置顶，低权重降权保留）
  - AC-006/007：Inspector 详情+引用式多轮对话（无依据答「资料不足」）
  - AC-013：Cron 无人工介入自动跑通全链路
  - AC-015：紧急/高匹配情报邮件推送，去重生效
  - AC-016：Vercel 部署，重新部署后数据不丢失

---

## NEEDS CLARIFICATION（未消除前不得进入 I2）

- C1（LLM 密钥与 Structured Outputs 支持）
  - 缺什么：需要 `LLM_API_KEY`、`LLM_BASE_URL`（如非 OpenAI）、`LLM_MODEL`；且目标模型必须支持 `strict json_schema`（Structured Outputs）
  - 取证/验证方式：T6 实现后，用提供的密钥对任意 `cases/` 变体做一次端到端 `/api/analyze` 调用，检查返回 schema 是否合规
  - 成功信号：JSON 响应字段完整（labels/priority/whatChanged/whyItMatters/actionGeneral/actionPlan/sourceAnchor/isNoise）无 parse 错误
  - 下一步动作：不成立则使用 JSON mode + 重试校验兜底；打标降级关键词规则；不阻塞 T7 以后（Analyzer 按失败状态写 DB）

- C2（Resend API Key 与域名验证）
  - 缺什么：`RESEND_API_KEY`；若需自定义发件域名需额外 DNS 验证（可用 `onboarding@resend.dev` 免验证测试）
  - 取证/验证方式：T10 完成后用 `RESEND_API_KEY` 触发测试邮件到指定邮箱
  - 成功信号：收件箱收到含情报摘要的邮件
  - 下一步动作：不成立则 T10 降级「站内通知/Inbox 红点」保底，邮件推送转后续演进

- C3（CRON_SECRET 与 Vercel Cron 路由保护格式）
  - 缺什么：确认 `vercel.json` crons 配置可以触发 `/api/cron/analyze` 且 Hobby 档每日一次限制已接受
  - 取证/验证方式：T9 完成后，在 Vercel Dashboard 手动触发 Cron Job，确认 `CRON_SECRET` Header 校验通过
  - 成功信号：Cron 路由返回 200，DB 写入新情报
  - 下一步动作：Hobby 每日限制确认接受（ADR-0005 已记录）；不成立则加外部调度器（演进）

---

## 任务清单（SSOT）

> 执行中把 `branch/commit/changed_files` 回写到对应任务；命令默认 PowerShell（`;` 分隔多命令）。  
> AUTO_COMMIT=true（默认）：每个任务步骤完成后频繁提交，commit message 必须中文。

---

### Task T1: 项目初始化（signal-desk/ + 依赖 + Vercel 配置 + Neon 连接验证）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `cd signal-desk ; npm install` → PASS
- `cd signal-desk ; npm run build` → PASS
- `vercel.json` SPA rewrite + Cron 占位 → PASS
- `npx tsx api/_lib/db-test.ts` → PASS（输出 `1`；验证后已删除 db-test.ts）

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `88c5809`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/package.json`
    - `signal-desk/tsconfig.json`
    - `signal-desk/vite.config.ts`
    - `signal-desk/vercel.json`
    - `signal-desk/.gitignore`
    - `signal-desk/index.html`
    - `signal-desk/src/main.tsx`
    - `signal-desk/src/App.tsx`
    - `signal-desk/src/style.css`
    - `signal-desk/src/vite-env.d.ts`
    - `signal-desk/api/_lib/db.ts`
    - `signal-desk/api/_lib/auth.ts`
    - `signal-desk/api/_lib/types.ts`
    - `signal-desk/api/_lib/env.ts`

**代码仓范围：**
- 根项目：`signal-desk/`（新建目录）

**文件（创建）：**
- `signal-desk/package.json`
- `signal-desk/tsconfig.json`
- `signal-desk/vite.config.ts`
- `signal-desk/vercel.json`
- `signal-desk/.env.local`（本地环境变量，不提交，加入 `.gitignore`）
- `signal-desk/.gitignore`
- `signal-desk/src/main.tsx`（入口，空壳）
- `signal-desk/src/App.tsx`（空壳，后续覆盖）
- `signal-desk/src/style.css`
- `signal-desk/index.html`
- `signal-desk/api/_lib/db.ts`（Neon 连接模块）
- `signal-desk/api/_lib/auth.ts`（JWT 中间件）
- `signal-desk/api/_lib/types.ts`（共享 TS 类型，从 Demo mockData.ts 迁移）

**验收点：**
- `cd signal-desk ; npm install` 无报错
- `cd signal-desk ; npm run dev` 能在 `localhost:5173` 打开空白页
- `api/_lib/db.ts` 能用 `@neondatabase/serverless` 连通 Neon，执行 `SELECT 1` 返回 `1`
- `vercel.json` 包含正确的 SPA rewrite 规则与 Cron 配置占位

**步骤 1：初始化 Vite 项目（复用 Demo 依赖基线）**

```
cd C:\Users\Administrator\Desktop\workshop
npm create vite@latest signal-desk -- --template react-ts
```

进入目录，安装额外依赖：

```
cd signal-desk
npm install react-router-dom @neondatabase/serverless jose bcryptjs zod openai resend
npm install -D @types/bcryptjs
```

**步骤 2：配置 vite.config.ts（代理 /api/* 到本地 vercel dev）**

修改 `signal-desk/vite.config.ts`，添加 server.proxy：
```
proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
```

**步骤 3：创建 vercel.json**

内容：
```json
{
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "crons": [
    { "path": "/api/cron/analyze", "schedule": "0 1 * * *" }
  ]
}
```

**步骤 4：创建 api/_lib/db.ts（Neon 连接）**

```typescript
// signal-desk/api/_lib/db.ts
import { neon } from '@neondatabase/serverless'
export const sql = neon(process.env.DATABASE_URL!)
```

**步骤 5：创建 api/_lib/auth.ts（JWT httpOnly Cookie 中间件）**

使用 `jose` 签发/验证 JWT，设置 `httpOnly; Secure; SameSite=Lax`：
- 签发：`signToken(payload)` → 返回 JWT 字符串
- 验证：`verifyToken(req)` → 返回 `{ userId, email }` 或 throw
- `withAuth(handler)` 高阶函数包装需要鉴权的 handler

**步骤 6：创建 api/_lib/types.ts（共享类型定义）**

从 `demo/src/prototypes/001-competitor-intel-monitor/mockData.ts` 迁移并扩展：
- `InfoLabel`、`Priority`、`Track`、`IntelStatus`、`CollectMode`、`FeedbackTag`、`FeedbackModule`
- `ROLE_DEFAULT_WEIGHTS`（4 角色 × 6 标签权重矩阵）
- `BUILTIN_ROLES`、`INFO_LABELS`、`TRACKS`、`PRIORITIES`
- `calcMatchScore(labels: InfoLabel[], priority: Priority, weights: Record<InfoLabel, number>): number`（个性化打分，复用 Demo 逻辑）

**步骤 7：创建 .env.local 模板（不提交）**

```
DATABASE_URL=postgres://...
SESSION_SECRET=replace_me
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
RESEND_API_KEY=re_...
CRON_SECRET=replace_me_random_string
```

**步骤 8：验证 Neon 连接**

在 `signal-desk/api/_lib/db-test.ts`（测试用，事后删除）中：
```typescript
import { sql } from './db'
const r = await sql`SELECT 1 AS v`
console.log(r[0].v) // 期望输出 1
```
Run: `npx tsx api/_lib/db-test.ts`
Expected: 控制台输出 `1`

**步骤 9：提交（AUTO_COMMIT=true）**
- Commit message: `初始化 signal-desk 项目：Vite + Vercel 配置 + Neon 连接模块 + 共享类型`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/package.json`
      - `signal-desk/tsconfig.json`
      - `signal-desk/vite.config.ts`
      - `signal-desk/vercel.json`
      - `signal-desk/.gitignore`
      - `signal-desk/index.html`
      - `signal-desk/src/main.tsx`
      - `signal-desk/src/App.tsx`
      - `signal-desk/src/style.css`
      - `signal-desk/api/_lib/db.ts`
      - `signal-desk/api/_lib/auth.ts`
      - `signal-desk/api/_lib/types.ts`

---

### Task T2: 数据库 DDL（全量建表 + 迁移运行）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `npx tsx db/migrate.ts` → PASS（`Migration complete`）
- `npx tsx db/verify-tables.ts` → PASS（9 张表：chat_sessions, conv_messages, feedback, intels, notifications, profiles, snapshots, targets, users）

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `88c5809`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/db/schema.sql`
    - `signal-desk/db/migrate.ts`
    - `signal-desk/db/verify-tables.ts`

**代码仓范围：**
- 根项目：`signal-desk/db/`

**文件（创建）：**
- `signal-desk/db/schema.sql`（所有建表语句）
- `signal-desk/db/migrate.ts`（迁移执行脚本）

**验收点：**
- `npx tsx signal-desk/db/migrate.ts` 执行成功，无报错
- Neon 控制台可见 8 张表：`users`、`profiles`、`targets`、`snapshots`、`intels`、`feedback`、`chat_sessions`、`conv_messages`、`notifications`
- 所有外键约束与索引正确（`intels.target_id → targets.id`，`conv_messages.session_id → chat_sessions.id` 等）

**步骤 1：编写 schema.sql**

包含以下表（字段基线来自 `demo/mockData.ts` 类型定义 + `design.md §3.3`）：

```sql
-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles（角色+权重+自定义角色+通知偏好）
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT,
  weights JSONB NOT NULL DEFAULT '{"定价":3,"功能":3,"更新日志":3,"招聘":2,"营销活动":3,"合规条款":2}',
  custom_roles JSONB NOT NULL DEFAULT '[]',
  email_settings JSONB NOT NULL DEFAULT '{"enabled":true,"recipientEmails":[],"pushTime":"09:00","pushContent":{"includeTitle":true,"includeSummary":true,"includeAction":true,"includeLink":true}}',
  onboarded BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- targets（监控目标）
CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  track TEXT NOT NULL,                   -- '生图'|'生视频'|'Agent'
  collect_mode TEXT NOT NULL DEFAULT 'manual',  -- 'manual'|'scheduled'
  schedule TEXT,                          -- e.g. '每日 09:00'
  monitor_status TEXT DEFAULT '监控中',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- snapshots（采集快照，每次采集存一条）
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  text_content TEXT,                      -- 提取的可见文本，供 diff
  version INT NOT NULL DEFAULT 1,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_target_captured ON snapshots(target_id, captured_at DESC);

-- intels（情报）
CREATE TABLE IF NOT EXISTS intels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_before_id UUID REFERENCES snapshots(id),
  snapshot_after_id UUID REFERENCES snapshots(id),
  labels JSONB NOT NULL DEFAULT '[]',    -- InfoLabel[]
  priority TEXT NOT NULL,                -- '紧急'|'中等'|'低'
  title TEXT NOT NULL,
  what_changed TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  action_general JSONB NOT NULL DEFAULT '{}',  -- {销售,产品,营销}
  action_plan JSONB NOT NULL DEFAULT '{}',     -- {产品经理,市场营销负责人,...}
  source_anchor JSONB NOT NULL DEFAULT '{"before":"","after":""}',
  status TEXT NOT NULL DEFAULT '未读',    -- '未读'|'已读'|'归档'
  match_score NUMERIC DEFAULT 0,
  in_core_pool BOOLEAN DEFAULT FALSE,
  is_noise BOOLEAN DEFAULT FALSE,
  noise_type TEXT,
  analysis_status TEXT DEFAULT 'success', -- 'pending'|'success'|'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intels_user_created ON intels(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intels_user_status ON intels(user_id, status);

-- feedback（反馈，独立表便于统计）
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intel_id UUID NOT NULL REFERENCES intels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tags JSONB NOT NULL DEFAULT '[]',       -- FeedbackTag[]
  modules JSONB NOT NULL DEFAULT '[]',    -- FeedbackModule[]
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(intel_id, user_id)
);

-- chat_sessions（对话会话）
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '新会话',
  ended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- conv_messages（对话消息）
CREATE TABLE IF NOT EXISTS conv_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                     -- 'user'|'ai'
  content TEXT NOT NULL,
  reference_intel_ids JSONB DEFAULT '[]', -- string[]（被引用情报 ID）
  reference_label TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_messages_session ON conv_messages(session_id, created_at ASC);

-- notifications（邮件推送去重）
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intel_id UUID NOT NULL REFERENCES intels(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, intel_id)              -- 去重键：同情报对同用户只推一次
);
```

**步骤 2：编写并运行 migrate.ts**

```typescript
// signal-desk/db/migrate.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { sql } from '../api/_lib/db'
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
await sql.unsafe(schema)
console.log('Migration complete')
```

Run: `cd signal-desk ; npx tsx db/migrate.ts`
Expected: `Migration complete`，无 error

**步骤 3：验证（R-001 同步验证）**

Run: `cd signal-desk ; npx tsx -e "import {sql} from './api/_lib/db'; const r = await sql\`SELECT table_name FROM information_schema.tables WHERE table_schema='public'\`; console.log(r.map(x=>x.table_name))"`
Expected: 打印出 9 张表名（users/profiles/targets/snapshots/intels/feedback/chat_sessions/conv_messages/notifications）

**步骤 4：提交**
- Commit message: `新增数据库 DDL：9 张表建表脚本与迁移工具`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/db/schema.sql`
      - `signal-desk/db/migrate.ts`

---

### Task T3: Auth API（注册/登录/登出 + 前端登录/注册页）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `vercel dev --listen 3000 --yes` + curl → PASS
- `POST /api/auth/register` → 200 `{"ok":true}` + Set-Cookie
- `POST /api/auth/login` → 200 `{"ok":true}`
- `POST /api/auth/logout` → 200 `{"ok":true}`
- `GET /api/profile`（无 Cookie）→ 401
- `GET /api/profile`（有 Cookie）→ 200 含 profile 字段
- 修复：`api/profile.ts` 导入路径、`login.ts`/`logout.ts` 内容互换、`readJsonBody` 兼容 Vercel body 解析

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `88c5809`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/auth/register.ts`
    - `signal-desk/api/auth/login.ts`
    - `signal-desk/api/auth/logout.ts`
    - `signal-desk/api/profile.ts`
    - `signal-desk/api/_lib/auth.ts`
    - `signal-desk/src/pages/LoginPage.tsx`
    - `signal-desk/src/pages/RegisterPage.tsx`
    - `signal-desk/index.html`

**代码仓范围：**
- 根项目：`signal-desk/api/auth/`、`signal-desk/src/pages/`

**文件（创建）：**
- `signal-desk/api/auth/register.ts`
- `signal-desk/api/auth/login.ts`
- `signal-desk/api/auth/logout.ts`
- `signal-desk/src/pages/LoginPage.tsx`（从 Demo 迁移并接真实 API）
- `signal-desk/src/pages/RegisterPage.tsx`（从 Demo 迁移并接真实 API）

**验收点：**
- `POST /api/auth/register` 邮箱+密码注册成功，返回 200 + Set-Cookie（httpOnly）
- `POST /api/auth/login` 正确密码登录成功，返回 200 + Set-Cookie
- `POST /api/auth/logout` 清除 Cookie，返回 200
- 未登录访问 `/api/profile` 返回 401
- 前端注册后自动跳转 `/onboarding`；登录后跳转 `/inbox`

**步骤 1：实现 register.ts**

逻辑：
1. 解析 `{ email, password, confirm }` from body
2. 校验：邮箱格式、密码 ≥6 位、两次一致
3. 检查 `users` 表是否已存在同邮箱
4. `bcrypt.hash(password, 12)` 得到 hash
5. INSERT `users`，INSERT `profiles`（默认 onboarded=false）
6. `signToken({ userId, email })` 签发 JWT
7. `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
8. 返回 `{ ok: true }`

**步骤 2：实现 login.ts**

逻辑：
1. 解析 `{ email, password }`
2. 查 `users` 得 `password_hash`
3. `bcrypt.compare(password, hash)` 验证
4. 签发 JWT，Set-Cookie，返回 `{ ok: true }`

**步骤 3：实现 logout.ts**

逻辑：清除 Cookie（Max-Age=0），返回 `{ ok: true }`

**步骤 4：实现 api/_lib/auth.ts 的 withAuth 中间件**

```typescript
// withAuth(handler) 包装：从 Cookie 解析 JWT → 注入 req.userId
// 失败返回 { error: 'Unauthorized' } 401
```

**步骤 5：迁移前端登录/注册页**

从 `demo/src/prototypes/001-competitor-intel-monitor/pages/LoginPage.tsx` 和 `RegisterPage.tsx` 复制，替换 mock 函数调用为真实 `fetch('/api/auth/login', ...)` 与 `fetch('/api/auth/register', ...)`。

**步骤 6：本地验证**

Run: `cd signal-desk ; vercel dev`（同时启动 Vite + Serverless Functions）  
在 browser 或 curl 中：
- `curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"test@test.com\",\"password\":\"123456\",\"confirm\":\"123456\"}"`
- Expected: `{"ok":true}` + response header 中有 `Set-Cookie: token=...`

**步骤 7：提交**
- Commit message: `实现 Auth API（注册/登录/登出）+ 前端登录注册页面接入真实 API`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/auth/register.ts`
      - `signal-desk/api/auth/login.ts`
      - `signal-desk/api/auth/logout.ts`
      - `signal-desk/api/_lib/auth.ts`（补全 withAuth）
      - `signal-desk/src/pages/LoginPage.tsx`
      - `signal-desk/src/pages/RegisterPage.tsx`

---

### Task T4: 用户画像 + Onboarding（Profile API + 页面）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/`、`signal-desk/src/pages/`

**文件（创建）：**
- `signal-desk/api/profile.ts`（GET/PUT）
- `signal-desk/src/pages/OnboardingPage.tsx`（从 Demo 迁移）

**验收点：**
- `PUT /api/profile` 保存角色+权重+自定义角色+通知偏好到 DB
- `GET /api/profile` 返回 `{ role, weights, customRoles, emailSettings, onboarded }`
- Onboarding 页面：选角色后自动应用默认权重（`ROLE_DEFAULT_WEIGHTS`），提交后 `onboarded=true`，跳转 `/targets`
- 用户完成 Onboarding 后，再访问 `/onboarding` 重定向 `/inbox`（规则-6 延伸）

**步骤 1：实现 profile.ts**

GET：查 `profiles` 表，返回画像；若不存在返回默认值。
PUT：upsert `profiles`（role/weights/custom_roles/email_settings/onboarded），更新 `updated_at`。

权重校验（对应规则-8）：6 个标签均须有值，至少一个 > 0。

**步骤 2：迁移 OnboardingPage**

从 Demo `OnboardingPage.tsx` 复制，替换 mock 为：
- `GET /api/profile` 获取当前画像（已选角色时跳过）
- 选角色后本地应用 `ROLE_DEFAULT_WEIGHTS[role]`，可调整权重
- 提交：`PUT /api/profile { role, weights, onboarded: true }`
- 成功后跳转 `/targets`

**步骤 3：路由守卫（前端）**

在 `App.tsx` 中添加简单鉴权：未登录访问业务页面 → 跳转 `/login`；已登录且未 Onboarded 访问 `/inbox` 或 `/targets` → 跳转 `/onboarding`（对应规则-6/异常-6）。

**步骤 4：验证**

Run: `vercel dev`，注册→Onboarding 选「市场营销负责人」→提交，DB 查询 `profiles` 确认 `role='市场营销负责人'`，`weights` 为 `{"定价":4,"功能":3,...,"营销活动":5,...}`

Expected PASS: 数据正确写入，页面跳转至 `/targets`

**步骤 5：提交**
- Commit message: `实现用户画像 API（GET/PUT /api/profile）+ Onboarding 页面接入真实 API`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/profile.ts`
      - `signal-desk/src/pages/OnboardingPage.tsx`
      - `signal-desk/src/App.tsx`（路由守卫）

---

### Task T5: 监控目标管理（Targets API + 前端页面）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/targets/`、`signal-desk/src/pages/`

**文件（创建）：**
- `signal-desk/api/targets/index.ts`（GET/POST）
- `signal-desk/api/targets/[id].ts`（PUT/DELETE）
- `signal-desk/src/pages/TargetsPage.tsx`（从 Demo 迁移）

**验收点：**
- `GET /api/targets` 返回当前用户的监控目标列表
- `POST /api/targets` 新增目标（名称/URL/赛道/采集方式），URL 格式校验（需以 `https://` 开头）
- `PUT /api/targets/:id`、`DELETE /api/targets/:id` 正常工作
- 前端 Targets 页可新增/编辑/删除，操作后列表即时刷新（AC-002）

**步骤 1：实现 targets/index.ts**

GET：查 `targets` 表，`WHERE user_id = :userId`，按 `created_at DESC`。  
POST：校验字段 → INSERT `targets`，返回新记录。

**步骤 2：实现 targets/[id].ts**

PUT：校验字段 → UPDATE `targets WHERE id = :id AND user_id = :userId`。  
DELETE：DELETE `targets` + 级联删除（DB 已配 ON DELETE CASCADE）。

**步骤 3：迁移 TargetsPage**

从 Demo `TargetsPage.tsx` 复制，替换 mock 为真实 fetch；「手动即时触发」按钮暂时 disabled（T6 后再接）。

**步骤 4：验证**

Run: 浏览器 `/targets`，新增「Midjourney, https://midjourney.com, 生图, scheduled」  
DB Query: `SELECT * FROM targets WHERE user_id = '<user_id>'`  
Expected PASS: 一条记录，字段正确

**步骤 5：提交**
- Commit message: `实现监控目标 CRUD API 与 Targets 页面`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/targets/index.ts`
      - `signal-desk/api/targets/[id].ts`
      - `signal-desk/src/pages/TargetsPage.tsx`

---

### Task T6: 采集层 + 变化检测（Collector + ChangeDetector）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/_lib/`

**文件（创建）：**
- `signal-desk/api/_lib/collector.ts`（HTML 抓取 + markdown 提取 + JS 注入降级 + 存快照）
- `signal-desk/api/_lib/change-detector.ts`（文本 diff + 两层去噪第 1 层）

**验收点：**
- `collectSnapshot(target)` 能从 URL 抓取 HTML，提取可见文本，存入 `snapshots`，返回 `snapshotId`
- markdown 文本 < 3 行时，能触发「JS 注入降级」分支（本期降级为加 `?js=1` 参数或 Playwright 调用，R-010 验证可行性）
- `detectChanges(prevText, currText)` 能输出「变化候选数组」，纯 CSS/格式变化被过滤
- 对 `ceshi/index.html` 和任意 `ceshi/cases/Z-Noise-1.html` 运行，「仅样式变化」不产生有意义候选

**步骤 1：实现 collector.ts**

```typescript
// 核心逻辑（伪代码）：
// 1. fetch(url, {headers: {'User-Agent': '...'}})
// 2. extractText(html): 剥离 <style>/<script>/注释/属性，提取可见文本 → markdown
// 3. if (markdown.split('\n').filter(Boolean).length < 3) → JS 注入降级
//    降级策略（本期）：在 URL 末尾追加 ?_render=1，或直接 log WARN + 仍用原始 html
//    (R-010: 真实 Playwright 注入可行性留验证)
// 4. INSERT snapshots(target_id, html, text_content, version=prev+1)
// 5. return snapshotId
```

extractText 实现要点：
- 用正则或 HTML 解析器（`node-html-parser` 或手写）剥离 `<style>`、`<script>`、`<!-- -->`
- 保留文本节点，空白归一化（多个空行→单空行）
- 返回纯文本字符串

**步骤 2：实现 change-detector.ts**

```typescript
// detectChanges(prevText: string, currText: string): ChangeCandidates[]
// 1. 按段落/行分割两版本
// 2. 用 diff-match-patch 或手写行 diff 得到 added/removed/modified 块
// 3. 过滤：去掉纯数字/时间戳/空白行变化（降低 FP）
// 4. 返回 { before, after, type: 'added'|'removed'|'modified' }[]
```

安装依赖：`npm install diff` 或 `diff-match-patch`

**步骤 3：本地测试（R-010 同步评估）**

用测试包验证：
```typescript
// signal-desk/api/_lib/collector-test.ts
import { readFileSync } from 'fs'
import { detectChanges } from './change-detector'
const base = readFileSync('../../ceshi/index.html', 'utf-8')
const noise = readFileSync('../../ceshi/cases/Z-Noise-1.html', 'utf-8')
const pricing = readFileSync('../../ceshi/cases/Z-Pricing-1.html', 'utf-8')
const candidates1 = detectChanges(extractText(base), extractText(noise))
const candidates2 = detectChanges(extractText(base), extractText(pricing))
console.log('Noise candidates (expected 0 meaningful):', candidates1.length)
console.log('Pricing candidates (expected >0):', candidates2.length)
```

Run: `cd signal-desk ; npx tsx api/_lib/collector-test.ts`  
Expected PASS: noise → 0 个有意义候选；pricing → ≥1 个候选

**步骤 4：提交**
- Commit message: `实现采集层（Collector）与变化检测第 1 层（ChangeDetector），对 ceshi/cases 测试通过`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/_lib/collector.ts`
      - `signal-desk/api/_lib/change-detector.ts`
      - `signal-desk/package.json`（新增 diff 依赖）

---

### Task T7: AI 打标+分析引擎（AIAnalyzer + /api/analyze）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/_lib/`、`signal-desk/api/`

**文件（创建）：**
- `signal-desk/api/_lib/ai-analyzer.ts`（Structured Outputs + Zod schema + OpenAI 调用）
- `signal-desk/api/analyze.ts`（POST /api/analyze，手动即时触发）

**验收点：**
- `analyzeChange(candidate, originalText, userProfile)` 能调用 LLM，返回 Zod 校验后的结构化情报字段
- `isNoise=true` 的候选不写入 `intels` 表（规则-2）
- `/api/analyze` POST `{ targetId }` 能触发「采集→检测→AI 分析→写 DB」全链路，返回 `{ ok, intelIds: string[] }`
- LLM 调用失败时，情报 `analysis_status='failed'` 写 DB，不产出半成品（异常-2）
- 对 `Z-Pricing-1.html` 变体，输出 `labels` 包含 `'定价'`，`isNoise=false`（R-007 初步验证）

**步骤 1：定义 Zod Schema（AI 输出契约）**

```typescript
// signal-desk/api/_lib/ai-analyzer.ts
import { z } from 'zod'
const INFO_LABELS = ['定价','功能','更新日志','招聘','营销活动','合规条款'] as const
const PRIORITIES = ['紧急','中等','低'] as const
const BUILTIN_ROLES = ['产品经理','市场营销负责人','创业者·创始人','投资人'] as const

export const IntelSchema = z.object({
  isNoise: z.boolean(),
  noiseType: z.string().optional(), // 'AB测试'|'纯样式'|'幻觉诱饵'
  labels: z.array(z.enum(INFO_LABELS)).min(1),
  priority: z.enum(PRIORITIES),
  title: z.string().min(1).max(100),
  whatChanged: z.string().min(1),
  whyItMatters: z.string().min(1),
  actionGeneral: z.object({ 销售: z.string(), 产品: z.string(), 营销: z.string() }),
  actionPlan: z.object({
    '产品经理': z.string(),
    '市场营销负责人': z.string(),
    '创业者·创始人': z.string(),
    '投资人': z.string(),
  }),
  sourceAnchor: z.object({ before: z.string(), after: z.string() }),
})
```

**步骤 2：实现 analyzeChange 函数**

Prompt 结构：
- System：「你是竞品情报分析师。只能基于提供的原文作答，禁止臆造。返回 JSON。」
- User：变化候选（before/after）+ 原文上下文 + 六大标签定义 + 噪音定义（A/B摇摆/纯样式/幻觉诱饵）

调用方式：
```typescript
const completion = await openai.chat.completions.create({
  model: process.env.LLM_MODEL!,
  messages: [...],
  response_format: { type: 'json_schema', json_schema: { strict: true, schema: zodToJsonSchema(IntelSchema) } },
})
```

使用 `zod-to-json-schema` 或 `openai` SDK 的 `zodResponseFormat` 辅助。  
安装：`npm install zod-to-json-schema`

**步骤 3：实现 /api/analyze.ts**

```
POST /api/analyze { targetId }
→ withAuth(handler)
→ 1. 查 targets，确认属于当前用户
→ 2. collectSnapshot(target) → currSnapshot
→ 3. 查上一 snapshot（version 最大的前一条）→ prevSnapshot（无则跳过分析，仅存快照）
→ 4. detectChanges(prevSnapshot.textContent, currSnapshot.textContent) → candidates
→ 5. 若 candidates 为空 → 返回 { ok: true, intelIds: [], message: '无重大变化' }
→ 6. 获取用户 profile → weights
→ 7. for each candidate: analyzeChange(candidate, ...) → intel | noise
→ 8. noise: 跳过；success: INSERT intels（含 matchScore）；failed: INSERT intels(analysis_status='failed')
→ 9. 如有新情报且优先级=紧急 → 异步调用 /api/notify（不阻塞返回）
→ 10. return { ok: true, intelIds: [新情报 ID...] }
```

matchScore 计算：`calcMatchScore(labels, priority, weights)` 来自 `api/_lib/types.ts`

**步骤 4：本地验证（R-003 + R-007 同步验证）**

Run: `vercel dev`，调用：
```
curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -H "Cookie: token=..." -d "{\"targetId\":\"<target_id>\"}"
```
Expected: 
- 若 LLM 调用成功：`{"ok":true,"intelIds":["..."]}` 且 DB `intels` 表有新记录，`labels` 含正确信息标签
- 若密钥未配置：`{"ok":false,"error":"LLM 配置缺失"}` 404

**步骤 5：提交**
- Commit message: `实现 AI 打标+分析引擎（Structured Outputs + Zod）与 /api/analyze 手动触发接口`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/_lib/ai-analyzer.ts`
      - `signal-desk/api/analyze.ts`
      - `signal-desk/package.json`（新增 zod-to-json-schema 依赖）

---

### Task T8: 情报 Insights API（个性化排序 + 状态 + 核心池）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/insights/`

**文件（创建）：**
- `signal-desk/api/insights/index.ts`（GET /api/insights）
- `signal-desk/api/insights/[id]/index.ts`（GET/PATCH /api/insights/:id）
- `signal-desk/api/insights/[id]/feedback.ts`（POST /api/insights/:id/feedback）

**验收点：**
- `GET /api/insights?view=all|morning|pool&track=&label=&priority=&archiveFilter=hide|all|only` 返回按画像个性化排序的情报列表（规则-9/规则-11）
- `GET /api/insights/:id` 返回完整情报字段（含 feedback）
- `PATCH /api/insights/:id { status }` 更新状态并持久化（AC-014）
- `PATCH /api/insights/:id { inCorePool }` 更新核心池标记
- `POST /api/insights/:id/feedback` 写入反馈，`tags` 含「有用」时自动 `inCorePool=true`（规则-14/AC-009）

**步骤 1：实现 insights/index.ts（GET）**

查询逻辑：
1. 查用户 profile（weights）
2. 查 `intels WHERE user_id = :uid AND is_noise = false AND analysis_status = 'success'`
3. 根据 `archiveFilter`：hide=排除归档；only=仅归档；all=全部
4. 根据 `view`：pool=仅核心池；morning=今日；all=全部
5. 应用 `track`/`label`/`priority` 筛选
6. 计算 matchScore（labels×weights + priority加成），排序
7. 返回分页列表（默认 50 条）

**步骤 2：实现 insights/[id]/index.ts（GET/PATCH）**

GET：查 `intels JOIN feedback` 返回完整字段。  
PATCH：更新 `status`（未读/已读/归档）或 `in_core_pool`。

**步骤 3：实现 insights/[id]/feedback.ts（POST）**

1. Upsert `feedback(intel_id, user_id, tags, modules, note)`
2. 若 `tags.includes('有用')` → UPDATE `intels SET in_core_pool=true`
3. 返回 `{ ok: true }`

**步骤 4：验证**

Run: 调用 `/api/analyze` 生成情报后，调用 `GET /api/insights`  
Expected: 情报按 matchScore 降序排列，`archiveFilter=hide` 不含归档情报

**步骤 5：提交**
- Commit message: `实现情报 Insights API：个性化排序、状态管理、核心池、反馈接口`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/insights/index.ts`
      - `signal-desk/api/insights/[id]/index.ts`
      - `signal-desk/api/insights/[id]/feedback.ts`

---

### Task T9: 个性化情报 Inbox 前端（双栏工作区 + Inspector + 视图 + 筛选）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/src/pages/`、`signal-desk/src/components/`

**文件（创建/修改）：**
- `signal-desk/src/pages/InboxPage.tsx`（从 Demo 迁移，接真实 API）
- `signal-desk/src/components/InspectorPanel.tsx`（情报详情 + 反馈 Tab）
- `signal-desk/src/components/InboxList.tsx`（左栏列表）

**验收点：**
- 双栏布局：左栏列表（未读/晨报/核心池/全部视图）+ 右栏 Inspector
- Inspector 详情 Tab：展示完整情报（变化内容/战略意义/行动建议·当前角色+通用视角）+ 查看原文按钮（AC-006）
- 情报状态（未读→已读→归档）可操作，刷新后保持（AC-014）
- 筛选（赛道/信息标签/优先级/归档状态）正确（AC-011）
- 角色快切：Inbox 顶部切换角色，行动建议展示随之变化（AC-012/规则-15，不改持久化画像）
- 核心池标记可操作（AC-010）
- Targets 页「立即检测」按钮接通 `/api/analyze`（完成 T7 后）

**步骤 1：迁移 InboxPage 并接真实 API**

从 Demo `InboxPage.tsx` 复制，替换所有 `getPersonalizedIntels()`、`setIntelStatus()` 等 mock 调用为：
- `fetch('/api/insights?view=all&...')` 
- `fetch('/api/insights/:id', { method: 'PATCH', body: JSON.stringify({ status }) })`

**步骤 2：实现 InspectorPanel**

- 详情 Tab：展示情报五要素（whatChanged/whyItMatters/actionPlan[currentRole]+actionGeneral）
- 「查看原文」：展示 `sourceAnchor.before` vs `sourceAnchor.after` 的 diff 视图（对应 AC-006）
- 反馈 Tab：七标签选择 + 问题模块 + 补充说明；提交调用 `POST /api/insights/:id/feedback`（AC-009）

**步骤 3：角色快切（规则-15）**

Inbox 顶部角色选择器：本地 state 维护 `currentRole`，影响 Inspector 中 `actionPlan[currentRole]` 展示和列表匹配分计算（前端重算，不影响持久化画像）。

**步骤 4：验证（核心闭环 Day2 前验收）**

完整流程：注册→Onboarding→新增监控目标→手动触发分析→Inbox 出现情报→点开 Inspector→查看详情→切换状态为已读  
Expected PASS: AC-001/003/004/005/006/009/014 通过

**步骤 5：提交**
- Commit message: `实现个性化情报 Inbox 前端：双栏工作区、Inspector 详情、角色快切、反馈`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/src/pages/InboxPage.tsx`
      - `signal-desk/src/components/InspectorPanel.tsx`
      - `signal-desk/src/components/InboxList.tsx`

---

### Task T10: Vercel Cron 定时采集（/api/cron/analyze + vercel.json 配置）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/cron/`、`signal-desk/vercel.json`

**文件（创建/修改）：**
- `signal-desk/api/cron/analyze.ts`（GET，CRON_SECRET 保护）
- `signal-desk/vercel.json`（补全 crons 配置）

**验收点：**
- `GET /api/cron/analyze` 缺少 `Authorization: Bearer {CRON_SECRET}` Header 时返回 401
- 正确 Header 时，对所有 `collect_mode='scheduled'` 的监控目标依次执行「采集→检测→打标→分析」全链路（ADR-0005/规则-11）
- Vercel Dashboard 可看到 Cron Job 配置，手动触发后 DB 有新情报（AC-013）
- Cron 失败时记录 `analysis_status='failed'`，不产出半成品，不影响已有情报（异常-8）

**步骤 1：实现 api/cron/analyze.ts**

```typescript
// CRON_SECRET 校验
const auth = req.headers['authorization']
if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })

// 查所有 collect_mode='scheduled' 的 targets（所有用户）
// for each target:
//   try { 复用 /api/analyze 的核心逻辑（提取为 runAnalysis(targetId, userId)） }
//   catch { 记录失败，继续下一个 }
// 返回 { ok: true, processed: n, generated: m }
```

关键：把 `/api/analyze` 中的核心逻辑提取为 `api/_lib/run-analysis.ts`，供手动触发和 Cron 共用，避免代码重复。

**步骤 2：更新 vercel.json**

```json
{
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "crons": [
    { "path": "/api/cron/analyze", "schedule": "0 1 * * *" }
  ]
}
```

注：Vercel Hobby 档 Cron 仅每日一次（ADR-0005 已确认），UTC 01:00 = 北京时间 09:00。

**步骤 3：本地手动验证（C3 同步验证）**

Run:
```
curl -X GET http://localhost:3000/api/cron/analyze -H "Authorization: Bearer <CRON_SECRET>"
```
Expected: `{"ok":true,"processed":1,"generated":1}`，DB `intels` 新增记录

**步骤 4：提交**
- Commit message: `实现 Vercel Cron 定时采集（/api/cron/analyze）+ 抽取公共分析逻辑`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/cron/analyze.ts`
      - `signal-desk/api/_lib/run-analysis.ts`（新提取的公共逻辑）
      - `signal-desk/api/analyze.ts`（改为调用 run-analysis）
      - `signal-desk/vercel.json`

---

### Task T11: 邮件主动通知（Notifier + /api/notify + Resend）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/`、`signal-desk/api/_lib/`

**文件（创建）：**
- `signal-desk/api/_lib/notifier.ts`（Resend 发送 + idempotency key 去重逻辑）
- `signal-desk/api/notify.ts`（POST /api/notify）

**验收点：**
- `POST /api/notify { intelId, userId }` 查 `notifications` 去重后通过 Resend 发送邮件（AC-015）
- 同一情报同一用户第二次调用，返回 `{ ok: true, skipped: true }`（idempotency key 去重，规则-13）
- 邮件内容包含：情报标题/摘要/行动建议/详情链接（per `emailSettings.pushContent` 配置）
- 用户 `emailSettings.enabled=false` 时，跳过发送
- 发送失败时：情报仍在 Inbox，通知记为失败，不阻塞（异常-9）

**步骤 1：实现 notifier.ts**

```typescript
// sendNotification(intelId: string, userId: string): Promise<{ok, skipped}>
// 1. 查 notifications WHERE user_id = :uid AND intel_id = :iid
// 2. 若已存在 → return { ok: true, skipped: true }
// 3. 查用户 emailSettings: enabled, recipientEmails, pushContent
// 4. 若 !enabled 或 recipientEmails 为空 → return { ok: true, skipped: true }
// 5. 查 intel 完整信息
// 6. 构建邮件 HTML（per pushContent 配置）
// 7. await resend.emails.send({ from: 'Signal Desk <onboarding@resend.dev>', to: recipientEmails, subject, html, headers: { 'X-Idempotency-Key': `${userId}:${intelId}` } })
// 8. INSERT notifications(user_id, intel_id)
// 9. return { ok: true, skipped: false }
```

**步骤 2：实现 /api/notify.ts**

POST 接受 `{ intelId, userId }`（内部调用，也应有简单授权校验：来自 Cron 或 analyze 内部才允许无 Cookie 调用，可用 CRON_SECRET 或直接在 run-analysis 内部调用 sendNotification 函数，跳过 HTTP 层）。

推荐：`run-analysis.ts` 中直接 `import { sendNotification } from './notifier'`，不经 HTTP；`/api/notify` 作为外部接口供测试使用。

**步骤 3：本地验证（R-008 同步验证）**

配置 `RESEND_API_KEY` 后：
- 手动触发一条「紧急」情报的分析
- 检查 `notifications` 表是否有记录
- 检查 `recipientEmails` 收件箱是否收到邮件

Expected PASS: 邮件收到，`notifications` 表有去重记录；第二次调用返回 `skipped: true`

**步骤 4：提交**
- Commit message: `实现邮件主动通知（Resend + idempotency key 去重 + /api/notify）`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/_lib/notifier.ts`
      - `signal-desk/api/notify.ts`
      - `signal-desk/api/_lib/run-analysis.ts`（集成 sendNotification 调用）
      - `signal-desk/package.json`（已有 resend 依赖）

---

### Task T12: 引用式深度对话（Chat API + Inspector 对话 Tab）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/api/insights/[id]/`、`signal-desk/src/components/`

**文件（创建）：**
- `signal-desk/api/insights/[id]/chat.ts`（POST /api/insights/:id/chat）
- `signal-desk/api/chat-sessions/index.ts`（GET/POST /api/chat-sessions，会话管理）
- `signal-desk/api/chat-sessions/[id].ts`（PATCH /api/chat-sessions/:id，终止会话）
- `signal-desk/src/components/DeepChatPanel.tsx`（从 Demo 迁移，接真实 API）

**验收点：**
- `POST /api/insights/:id/chat { sessionId?, message, referenceIntelIds, referenceLabel }` 返回 AI 回复（grounded）
- 无依据问题时，AI 明确回复「资料不足」（规则-4/异常-5，AC-007）
- 会话历史持久化，刷新后可回看（AC-008）
- 支持多会话（GET /api/chat-sessions 返回会话列表，可切换）
- 终止会话（PATCH /api/chat-sessions/:id { ended: true }）后不可继续发送消息（设计doc §3.3 Chat 状态机）
- Inspector 深度对话 Tab 内嵌，支持多情报引用 chip（AC-007）

**步骤 1：实现 /api/insights/[id]/chat.ts**

```typescript
// POST /api/insights/:id/chat { sessionId?, message, referenceIntelIds, referenceLabel }
// 1. 若无 sessionId → INSERT chat_sessions → sessionId
// 2. 查 session，若 ended=true → return 400 '会话已结束'
// 3. INSERT conv_messages(session_id, role='user', content=message, reference_intel_ids, reference_label)
// 4. 查被引用情报（referenceIntelIds），提取 whatChanged/whyItMatters/sourceAnchor
// 5. 构建 grounded system prompt：「仅基于以下情报原文作答。如信息不足，明确回复『资料不足』，禁止联网或臆造。」+ 情报原文 + 会话历史（前 N 条）
// 6. 调用 LLM（stream 或 non-stream）
// 7. INSERT conv_messages(session_id, role='ai', content=aiResponse)
// 8. 返回 { sessionId, message: { id, role:'ai', content, timestamp } }
```

**步骤 2：实现会话管理 API**

- `GET /api/chat-sessions`：返回当前用户的所有会话列表（title/ended/updatedAt）
- `POST /api/chat-sessions`：新建空会话
- `PATCH /api/chat-sessions/:id { ended: true }`：终止会话

**步骤 3：迁移 DeepChatPanel**

从 Demo `DeepChatPanel.tsx` 复制，替换 `sendGlobalMessage()` mock 为：
- 发消息：`POST /api/insights/:id/chat`
- 会话切换：`GET /api/chat-sessions` + `PATCH /api/chat-sessions/:id`
- 历史加载：GET chat-session messages

**步骤 4：验证（R-006 同步验证）**

测试 grounded 约束：
- 引用「Midjourney Starter 套餐涨价」情报，询问「价格变化了多少」→ 期望 AI 回答基于原文给出具体数据
- 询问「这家公司 CEO 是谁」（原文中没有）→ 期望「资料不足」

Expected PASS: AC-007/AC-008 通过

**步骤 5：提交**
- Commit message: `实现引用式深度对话 API（grounded prompt + 多会话管理）+ Inspector 对话 Tab`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/insights/[id]/chat.ts`
      - `signal-desk/api/chat-sessions/index.ts`
      - `signal-desk/api/chat-sessions/[id].ts`
      - `signal-desk/src/components/DeepChatPanel.tsx`

---

### Task T13: 设置页（角色与权重 Tab + 邮件通知 Tab）

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/src/pages/`

**文件（创建）：**
- `signal-desk/src/pages/SettingsPage.tsx`（从 Demo 迁移，接真实 API）

**验收点：**
- 「角色与权重」Tab：可更改角色（含自定义角色）+ 调整 6 个标签权重，保存后 Inbox 排序即时变化（规则-10/AC-012）
- 自定义角色：可新增自定义角色名称，并为其设置默认权重（规则-7）
- 「邮件通知」Tab：多推送邮箱管理 + 推送时间 + 推送内容配置 + 开关（规则-13/AC-015）
- 保存后 `PUT /api/profile` 写入 DB，持久化生效

**步骤 1：迁移 SettingsPage**

从 Demo `SettingsPage.tsx` 复制，替换 mock 为：
- 加载：`GET /api/profile`
- 保存：`PUT /api/profile { role, weights, customRoles, emailSettings }`

**步骤 2：角色快切联动**

Inbox 角色快切（规则-15）改动 local state 即可，不调 API；若在设置页保存新角色则调 `PUT /api/profile`。

**步骤 3：验证**

- 切换角色为「市场营销负责人」保存 → `GET /api/profile` 确认 role 和 weights 正确
- Inbox 打开，检查行动建议 Tab 展示的是市场营销视角

Expected PASS: AC-012 通过

**步骤 4：提交**
- Commit message: `实现设置页：角色与权重 Tab + 邮件通知 Tab，接入真实 Profile API`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/src/pages/SettingsPage.tsx`

---

### Task T14: 路由 + 兼容重定向 + App 完整组装

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/src/`

**文件（修改）：**
- `signal-desk/src/App.tsx`（react-router 完整路由定义）
- `signal-desk/src/main.tsx`（根组件挂载）

**验收点：**
- `/inbox/:id` → 跳转 `/inbox?id=:id&view=detail`（AC-006 Inspector 直接打开）
- `/chat` → 跳转 `/inbox?view=chat`（`/chat` 兼容重定向，设计 §3.5）
- 未登录访问任何业务路由 → 重定向 `/login`（异常-1/规则-6）
- 已登录未 Onboarded 访问 `/inbox` → 重定向 `/onboarding`（异常-6）
- 侧边栏导航：Inbox / 监控目标 / 设置（设计 §9）

**步骤 1：实现 react-router 路由配置**

```typescript
// src/App.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
  <Route path="/targets" element={<RequireAuthAndOnboarding><TargetsPage /></RequireAuthAndOnboarding>} />
  <Route path="/inbox" element={<RequireAuthAndOnboarding><InboxPage /></RequireAuthAndOnboarding>} />
  <Route path="/inbox/:id" element={<Navigate to={(loc) => `/inbox?id=${params.id}&view=detail`} />} />
  <Route path="/chat" element={<Navigate to="/inbox?view=chat" />} />
  <Route path="/settings" element={<RequireAuthAndOnboarding><SettingsPage /></RequireAuthAndOnboarding>} />
  <Route path="/" element={<Navigate to="/inbox" />} />
</Routes>
```

**步骤 2：侧边栏组件**

添加 `src/components/Sidebar.tsx`：Inbox / 监控目标 / 设置三个导航项 + 登出按钮。

**步骤 3：验证**

- 访问 `http://localhost:5173/inbox/intel-001` → 应跳转至 `/inbox?id=intel-001&view=detail`
- 访问 `/chat` → 应跳转至 `/inbox?view=chat`
- 未登录访问 `/inbox` → 重定向 `/login`

Expected PASS: 路由行为正确

**步骤 4：提交**
- Commit message: `完成 App 路由装配：兼容重定向、鉴权守卫、侧边栏导航`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/src/App.tsx`
      - `signal-desk/src/main.tsx`
      - `signal-desk/src/components/Sidebar.tsx`

---

### Task T15: 全量测试包联调 + ceshi/cases 验证 + Vercel 部署

- [ ] **状态**：未开始

**代码仓范围：**
- 根项目：`signal-desk/`

**文件（无新增，更新配置）：**
- `signal-desk/vercel.json`（确认 crons/rewrites 正确）

**验收点（对应 AC 验收矩阵）：**
- AC-001：注册→Onboarding→登录→Inbox 完整流程 ✓
- AC-002：新增监控目标（含测试包 URL）✓
- AC-003/004：触发分析后有 ≥1 条含完整五要素+信息标签的情报 ✓
- AC-005：Inbox 按画像排序，重点置顶 ✓
- AC-006/007：Inspector 详情+引用式追问（grounded）✓
- AC-008：多会话持久化，刷新后可回看 ✓
- AC-009：反馈打标 + 「有用」自动加核心池 ✓
- AC-010/011：晨报/核心池视图 + 筛选正确 ✓
- AC-012：设置/快切角色后 Inbox 排序变化 ✓
- AC-013：Cron 手动触发后无人工介入产出新情报 ✓
- AC-014：归档状态持久化，筛选可见 ✓
- AC-015：紧急情报邮件推送，去重生效 ✓
- AC-016：Vercel 部署，重新部署后数据不丢失 ✓

**去噪验证（R-004 闭环）：**
对所有 `ceshi/cases/` 变体批量验证（共 18 个 case）：
- Z-AB-1/2：A/B 测试 → `isNoise=true`（不生成情报）
- Z-Feature-1/2：功能变化 → `labels=['功能']`
- Z-Hallucination-1/2：幻觉诱饵 → `isNoise=true`
- Z-Hiring-1/2：招聘 → `labels=['招聘']`
- Z-Marketing-1/2：营销活动 → `labels=['营销活动']`
- Z-Noise-1/2：纯样式 → `isNoise=true` 或无候选
- Z-Pricing-1/2：定价 → `labels=['定价']`
- Z-Recall-1/2：合规条款 → `labels=['合规条款']`
- Z-Release-1/2：更新日志 → `labels=['更新日志']`

**步骤 1：配置测试包为采集 URL**

在 DB 中为监控目标设置采集 URL 为测试包静态文件（可通过 `localhost` 或部署后的 Vercel URL 访问 `ceshi/` 目录）。

**步骤 2：批量运行全量 case 验证脚本**

```typescript
// signal-desk/scripts/verify-cases.ts
// 对 ceshi/cases/ 目录下每个变体，调用 detectChanges + analyzeChange
// 输出每个 case 的 isNoise/labels/priority 结果
// 统计：真信号 Recall（期望 ≥90%）、FP 率（期望 ≤10%）
```

Run: `cd signal-desk ; npx tsx scripts/verify-cases.ts`
Expected: 真信号全部捕获，噪音（AB/Noise/Hallucination）全部过滤

**步骤 3：Vercel 部署**

```powershell
cd signal-desk
vercel --prod
```

配置环境变量（Vercel Dashboard → Settings → Environment Variables）：
- `DATABASE_URL`、`SESSION_SECRET`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`RESEND_API_KEY`、`CRON_SECRET`

**步骤 4：部署后验证（R-001 终验，AC-016）**

- 部署后注册账号，新增情报，执行 `vercel redeploy`
- 重新访问 Inbox，情报仍在
- Expected PASS: 数据重启不丢失（R-001 成立）

**步骤 5：Cron 手动触发验证（AC-013）**

Vercel Dashboard → Cron Jobs → 手动触发 → 查看 Function Log + DB `intels` 表

Expected PASS: 情报自动产出，无需人工点击

**步骤 6：提交**
- Commit message: `全量 ceshi/cases 验证通过，Vercel 部署完成，所有 AC 验收`
- 审计信息：
  - repo: `root`
    branch: `001-competitor-intel-monitor`
    commit: `88c5809`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/scripts/verify-cases.ts`
      - `signal-desk/vercel.json`（最终确认）

---

## Merge-back 待办清单（仅记录，不在本阶段执行）

> 实现完成后，以下变更建议晋升到 `project/` 级别，供后续 Spec 复用。

- MB-001：创建 `.aisdlc/project/components/` 各模块组件页，把本 RFC §3.5 API 契约要点沉淀为 SSOT
  - 证据入口：`design/design.md §3.5`
  - 建议动作：`project/components/auth.md`、`project/components/insights.md`、`project/components/chat.md`、`project/components/notifier.md`
  - Owner：DEV（I2 完成后）

- MB-002：把 DB schema（`signal-desk/db/schema.sql`）晋升为 `project/memory/data-contracts.md`
  - 证据入口：`signal-desk/db/schema.sql`
  - 建议动作：抽取表结构与字段说明，写入 `project/memory/data-contracts.md`

- MB-003：确认 greenfield（R-005），创建 `project/memory/product.md` 与 `project/memory/glossary.md`
  - 证据入口：`requirements/prd.md §1`、`design/design.md §4`
  - 建议动作：PM 评审后补齐权威入口，关闭 Context Gap

- MB-004：ADR-0001～0008 已在 `project/adr/` 落盘，无需额外合并
