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

- C1（LLM 密钥与 Structured Outputs 支持）— **已解除（2026-07-08）**
  - 已配置：智谱 `glm-4-flash`（`LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/`）
  - 验证：`npx tsx api/_lib/llm-test.ts` PASS（~21s，labels=`["定价"]`，priority=`紧急`）
  - 说明：智谱不支持 `strict json_schema`；已实现 JSON mode + 宽松 Zod 规范化兜底（ADR-0003 兼容路径）
  - 密钥仅存于 `signal-desk/.env.local`（未提交 git）；部署时需同步至 Vercel 环境变量

- C2（Resend API Key 与域名验证）
  - 缺什么：`RESEND_API_KEY`；若需自定义发件域名需额外 DNS 验证（可用 `onboarding@resend.dev` 免验证测试）
  - 取证/验证方式：T10 完成后用 `RESEND_API_KEY` 触发测试邮件到指定邮箱
  - 成功信号：收件箱收到含情报摘要的邮件
  - 下一步动作：不成立则 T10 降级「站内通知/Inbox 红点」保底，邮件推送转后续演进

- C3（CRON_SECRET 与 Vercel Cron 路由保护格式）— **部分解除（2026-07-08）**
  - 本地验证：`GET /api/cron/analyze` 无 Header → 401；正确 `Authorization: Bearer {CRON_SECRET}` → 200
  - `vercel.json` crons 已配置 `0 1 * * *`（UTC 01:00 = 北京时间 09:00）
  - 待部署后：Vercel Dashboard 手动触发 Cron 做生产侧确认

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
    commit: `<TBD>`
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
    commit: `<TBD>`
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
    commit: `<TBD>`
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

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `PUT /api/profile` 保存角色+权重+onboarded → PASS（`{"ok":true}`）
- `GET /api/profile` → PASS（role=`市场营销负责人`，weights 含 `营销活动:5`）
- `npm run build` → PASS
- Onboarding 页面 + App 路由守卫已接入

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `74c1a79`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/profile.ts`
    - `signal-desk/src/pages/OnboardingPage.tsx`
    - `signal-desk/src/App.tsx`
    - `signal-desk/src/components/AuthGuard.tsx`
    - `signal-desk/src/components/RoleSelector.tsx`
    - `signal-desk/src/lib/constants.ts`

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/profile.ts`
      - `signal-desk/src/pages/OnboardingPage.tsx`
      - `signal-desk/src/App.tsx`（路由守卫）

---

### Task T5: 监控目标管理（Targets API + 前端页面）

- [x] **状态**：已完成（含 stats 端点 + auto 采集模式 + StatsModal 前端）

**验证结果摘要（2026-07-08）：**
- `POST /api/targets` 新增 Midjourney → PASS（201 + 正确字段）
- `GET /api/targets` → PASS（返回列表含新记录）
- `GET /api/targets/:id?stats=true` → PASS（返回 total/valuable/noise/noiseTypes）
- `npm run build` → PASS

**实际变更（与原计划差异）：**
1. **新增 stats 端点**：`GET /api/targets/:id?stats=true`，返回该目标情报统计：`total`（总数）、`valuable`（有价值）、`noise`（无价值）、`noiseTypes`（噪音类型分布数组）；SQL 用 4 次并发查询取统计数。
2. **新增 `auto` 采集模式**：`collect_mode` 枚举增加 `auto`（每1分钟自动采集），前端显示为"自动采集（每1分钟）"；URL 格式校验同步增加 `test://` 协议头支持。
3. **前端 TargetsPage 增强**：
   - 新增 `StatsModal` 弹窗组件：展示监控统计三宫格（总数/有价值/无价值）+ 有价值比率进度条 + 噪音类型分布（含彩色标签与进度条）
   - 噪音类型样式映射：营销数字诱饵（橙）/ 日期变更（紫）/ 排版样式调整（蓝）/ A-B摇摆（粉）/ 其他（灰）
   - 竞品名称可点击触发 StatsModal

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `74c1a79`（基础）→ 后续提交补充 stats 与 auto 模式
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/targets/index.ts`
    - `signal-desk/api/targets/[id].ts`（新增 GET stats + auto 模式校验）
    - `signal-desk/src/pages/TargetsPage.tsx`（新增 StatsModal + auto 显示）
    - `signal-desk/src/components/Layout.tsx`

**代码仓范围：**
- 根项目：`signal-desk/api/targets/`、`signal-desk/src/pages/`

**文件（创建/修改）：**
- `signal-desk/api/targets/index.ts`（GET/POST）
- `signal-desk/api/targets/[id].ts`（PUT/DELETE + **GET stats**）
- `signal-desk/src/pages/TargetsPage.tsx`（从 Demo 迁移 + **StatsModal** + **auto 模式**）

**验收点：**
- `GET /api/targets` 返回当前用户的监控目标列表
- `POST /api/targets` 新增目标（名称/URL/赛道/采集方式），URL 支持 `https://` 和 `test://`
- `PUT /api/targets/:id`、`DELETE /api/targets/:id` 正常工作
- `GET /api/targets/:id?stats=true` 返回情报统计数据，无情报时四个字段为 0/空数组
- 前端 Targets 页可新增/编辑/删除，支持三种采集方式（手动/自动/固定时间）（AC-002）
- 点击竞品名或"详情"按钮，弹出 StatsModal 展示情报统计

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/targets/index.ts`
      - `signal-desk/api/targets/[id].ts`
      - `signal-desk/src/pages/TargetsPage.tsx`

---

### Task T6: 采集层 + 变化检测（Collector + ChangeDetector）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `npx tsx api/_lib/collector-test.ts` → PASS（Noise=0 meaningful，Pricing≥1）
- `npm run build` → PASS

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `74c1a79`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/_lib/collector.ts`
    - `signal-desk/api/_lib/change-detector.ts`
    - `signal-desk/api/_lib/collector-test.ts`
    - `signal-desk/package.json`

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/_lib/collector.ts`
      - `signal-desk/api/_lib/change-detector.ts`
      - `signal-desk/package.json`（新增 diff 依赖）

---

### Task T7: AI 打标+分析引擎（AIAnalyzer + /api/analyze）

- [x] **状态**：已完成（两阶段分析架构；AIGC 赛道专家人设；strict schema 不可用时降级 JSON mode）

**验证结果摘要（2026-07-08）：**
- `test://index.html` → 基准快照 → PASS
- `test://cases/Z-Pricing-1.html` → analyze → PASS（intelIds 含 1 条，`labels: ["定价"]`）
- 非 test:// URL 且无 LLM 密钥 → 404 `LLM 配置缺失`（符合 plan）
- `npx tsx api/_lib/llm-test.ts` → PASS（智谱 LLM 真实调用，JSON mode 兜底）
- `npm run build` → PASS

**实际变更（与原计划差异）：**
1. **两阶段分析架构**（替代原计划的单次全量 LLM 调用）：
   - **阶段 1（关键词规则）**：`patternNoiseBase`（噪音判断）+ `patternSignalBase`（信号识别）→ 输出 `IntelBase`（含标签/优先级/摘要，不含行动建议）
   - **阶段 2（LLM 行动建议）**：`generateActionAdvice` 用专门的 `ACTION_SYSTEM_PROMPT` 调用 LLM，生成差异化 `actionGeneral`/`actionPlan`，并改写 `whatChanged`/`whyItMatters` 深度；含 `hasDistinctActions` 质量检查（至少 2 个不同建议才采用）
   - 若关键词无命中，直接全量 LLM 调用（`zodResponseFormat` → 降级 `json_object`）
2. **AIGC 赛道专家人设（DOMAIN_PERSONA）**：系统 Prompt 明确竞品范围（Midjourney/Runway/可灵/即梦等），分析从赛道专业视角出发
3. **深度写作规范（DEPTH_RULES）**：禁空话/量化优先（还原 A→B 的具体幅度）/允许犀利有立场/AIGC 赛道上下文
4. **噪音类型规范化**：固定 4 种中文枚举（营销数字诱饵/日期变更/排版样式调整/A-B摇摆），替代原来的自由字符串
5. **双模型调用降级链**：`parse(strict)` → `create(json_object)` → 规则兜底（`ruleBasedAnalyze`），三层保护不产出半成品

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `cf02299`（初版）→ 后续提交重构两阶段架构
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/_lib/ai-analyzer.ts`（两阶段架构、AIGC 人设、深度规范）
    - `signal-desk/api/analyze.ts`
    - `signal-desk/api/_lib/collector.ts`（test:// 测试包支持）
    - `signal-desk/package.json`

**代码仓范围：**
- 根项目：`signal-desk/api/_lib/`、`signal-desk/api/`

**文件（创建）：**
- `signal-desk/api/_lib/ai-analyzer.ts`（两阶段分析 + Zod schema + OpenAI 调用）
- `signal-desk/api/analyze.ts`（POST /api/analyze，手动即时触发）

**验收点：**
- `analyzeChange(candidate)` 按两阶段架构运行：关键词命中时走规则+LLM 行动建议，未命中时走全量 LLM
- `isNoise=true` 的候选不写入 `intels` 表（规则-2）；噪音类型为 4 种固定枚举之一
- `/api/analyze` POST `{ targetId }` 能触发「采集→检测→AI 分析→写 DB」全链路，返回 `{ ok, intelIds: string[] }`
- LLM 调用失败时降级规则兜底，`analysis_status='failed'` 写 DB，不产出半成品（异常-2）
- 对 `Z-Pricing-1.html` 变体，输出 `labels` 包含 `'定价'`，`isNoise=false`（R-007 初步验证）
- 行动建议有差异化（销售/产品/营销 + 四角色各不同），通过 `hasDistinctActions` 检查

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/_lib/ai-analyzer.ts`
      - `signal-desk/api/analyze.ts`
      - `signal-desk/package.json`（新增 zod-to-json-schema 依赖）

---

### Task T8: 情报 Insights API（个性化排序 + 状态 + 核心池）

- [x] **状态**：已完成（chat + feedback 合并为 `[action].ts`）

**验证结果摘要（2026-07-08）：**
- `GET /api/insights?view=all` → PASS（按 matchScore 排序，含定价情报）
- 情报字段完整（五要素 + sourceHtml + feedback 空数组）
- `npm run build` → PASS

**实际变更（与原计划差异）：**
- **函数合并**：`insights/[id]/chat.ts` 与 `insights/[id]/feedback.ts` 两个独立文件已**合并为 `insights/[id]/[action].ts`**（节省 Vercel Hobby 平台的 12 个 Serverless Function 配额）；通过 query param `action=chat|feedback` 路由到对应处理函数（`handleChat`/`handleFeedback`）
- 原先规划的 `insights/[id]/feedback.ts` 已在 T8 期间删除（D 状态），功能保留在 `[action].ts` 中
- 原先规划的 `insights/[id]/chat.ts` 已在 T12 期间删除（D 状态），功能保留在 `[action].ts` 中

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `cf02299`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/insights/index.ts`
    - `signal-desk/api/insights/[id].ts`
    - `signal-desk/api/insights/[id]/[action].ts`（合并 chat + feedback，替代原 chat.ts 与 feedback.ts）
    - `signal-desk/api/_lib/insights-mapper.ts`

**代码仓范围：**
- 根项目：`signal-desk/api/insights/`

**文件（创建）：**
- `signal-desk/api/insights/index.ts`（GET /api/insights）
- `signal-desk/api/insights/[id].ts`（GET/PATCH /api/insights/:id）
- `signal-desk/api/insights/[id]/[action].ts`（POST /api/insights/:id/chat + POST /api/insights/:id/feedback，合并文件）

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/api/insights/index.ts`
      - `signal-desk/api/insights/[id]/index.ts`
      - `signal-desk/api/insights/[id]/feedback.ts`

---

### Task T9: 个性化情报 Inbox 前端（双栏工作区 + Inspector + 视图 + 筛选）

- [x] **状态**：已完成（深度对话 Tab 留 T11）

**验证结果摘要（2026-07-08）：**
- Inbox 双栏布局 + 晨报/核心池/全部视图 + 筛选面板 → 已实现
- Inspector 详情（五要素 + 原文对比 + 反馈）→ 已实现
- Targets「立即检测」接通 `/api/analyze` → 已实现
- `npm run build` → PASS

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `cf02299`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/src/pages/InboxPage.tsx`
    - `signal-desk/src/components/InspectorPanel.tsx`
    - `signal-desk/src/components/InboxList.tsx`
    - `signal-desk/src/components/inbox-ui.tsx`
    - `signal-desk/src/pages/TargetsPage.tsx`
    - `signal-desk/src/App.tsx`

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
    commit: `<TBD>`
    pr: `<TBD>`
    changed_files:
      - `signal-desk/src/pages/InboxPage.tsx`
      - `signal-desk/src/components/InspectorPanel.tsx`
      - `signal-desk/src/components/InboxList.tsx`

---

### Task T10: Vercel Cron 定时采集（/api/cron/analyze + vercel.json 配置）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- 无 Authorization Header → 401 PASS
- 正确 Bearer CRON_SECRET → `{"ok":true,"processed":N,"generated":M}` PASS
- 核心逻辑已抽取至 `run-analysis.ts`，`/api/analyze` 与 Cron 共用
- DB 存在 1 个 `collect_mode='scheduled'` 目标（非 test:// URL 抓取失败时记录日志并继续）

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `547bf92`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/cron/analyze.ts`
    - `signal-desk/api/_lib/run-analysis.ts`
    - `signal-desk/api/_lib/cron-auth.ts`
    - `signal-desk/api/analyze.ts`
    - `signal-desk/vercel.json`

---

### Task T11: 邮件主动通知（Notifier + /api/notify + Resend）

- [x] **状态**：已完成（RESEND_API_KEY 未配置时优雅跳过；去重逻辑已验证）

**验证结果摘要（2026-07-08）：**
- `sendNotification` 首次 → `{ ok: true }`；二次 → `{ ok: true, skipped: true }` PASS
- `run-analysis.ts` 分析成功后自动调用 `sendNotification`
- `POST /api/notify` 支持 Cookie 用户本人或 CRON_SECRET 授权

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `547bf92`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/_lib/notifier.ts`
    - `signal-desk/api/notify.ts`
    - `signal-desk/api/_lib/run-analysis.ts`

---

### Task T12: 引用式深度对话（Chat API + Inspector 对话 Tab）

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `generateChatReply` 价格追问 → 基于原文回答 PASS
- 无关问题（CEO）→ 「资料不足」PASS
- Inbox Inspector 新增「深度对话」Tab + `DeepChatPanel` 接真实 API
- 会话 API：GET/POST `/api/chat-sessions`、GET/PATCH `/api/chat-sessions/:id`

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `547bf92`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/api/insights/[id]/chat.ts`
    - `signal-desk/api/chat-sessions/index.ts`
    - `signal-desk/api/chat-sessions/[id].ts`
    - `signal-desk/api/_lib/chat-reply.ts`
    - `signal-desk/src/components/DeepChatPanel.tsx`
    - `signal-desk/src/pages/InboxPage.tsx`
    - `signal-desk/src/lib/types.ts`

---

### Task T13: 设置页（角色与权重 Tab + 邮件通知 Tab + API Tab）

- [x] **状态**：已完成（三 Tab：role / email / **api**）

**验证结果摘要（2026-07-08）：**
- `SettingsPage.tsx` 接入 `GET/PUT /api/profile`
- 角色与权重 Tab：内置角色 + 自定义角色 + WeightModal
- 邮件通知 Tab：多邮箱/推送时间/内容开关
- **API Tab（新增）**：生成/撤销/复制 API Key
- `npm run build` → PASS

**实际变更（与原计划差异）：**
- **新增第三个 Tab「API」**（Tab 类型扩展为 `'role' | 'email' | 'api'`）：
  - 展示当前 API Key（脱敏显示/明文切换）
  - 「生成 API Key」按钮 → 调用 `POST /api/profile?action=generate-api-key`
  - 「复制」按钮 → `navigator.clipboard.writeText(apiKey)` + 2 秒反馈
  - 「撤销 API Key」按钮 → confirm 对话框 → 调用 `POST /api/profile?action=revoke-api-key`
- API Key 格式：`sk_` 前缀 + 32 字节随机字符串，存 `users.api_key` 字段
- `GET /api/profile` 响应新增 `apiKey` 字段，供设置页初始化展示
- `src/lib/constants.ts` 新增 `generateApiKey()`、`revokeApiKey()` 函数

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `fe780ac`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/src/pages/SettingsPage.tsx`（新增 API Tab）
    - `signal-desk/src/components/inbox-ui.tsx`（WeightModal）
    - `signal-desk/src/lib/constants.ts`（新增 generateApiKey/revokeApiKey）

---

### Task T14: 路由 + 兼容重定向 + App 完整组装

- [x] **状态**：已完成

**验证结果摘要（2026-07-08）：**
- `/inbox/:id` → `/inbox?id=:id&view=detail`
- `/chat` → `/inbox?view=chat`
- 业务路由使用 `RequireAuth` + onboarded 守卫
- 侧边栏导航已在 `Layout.tsx`（Inbox / 监控目标 / 设置）
- `npm run build` → PASS

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `fe780ac`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/src/App.tsx`
    - `signal-desk/src/pages/InboxPage.tsx`

---

### Task T15: 全量测试包联调 + ceshi/cases 验证 + Vercel 部署

- [x] **状态**：已完成（生产环境变量需在 Vercel Dashboard 手动配置）

**验证结果摘要（2026-07-08）：**
- `npx tsx scripts/verify-cases.ts` → **18/18 PASS**
- 合并 API 路由至 11 个 Serverless Functions（Hobby 12 上限）
- Vercel 生产部署成功：https://signal-desk-sepia.vercel.app
- 待运维：在 Vercel 配置 `DATABASE_URL` / `SESSION_SECRET` / `LLM_*` / `CRON_SECRET` / `RESEND_API_KEY`

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `fe780ac`
  pr: `<TBD>`
  changed_files:
    - `signal-desk/scripts/verify-cases.ts`
    - `signal-desk/api/_lib/ai-analyzer.ts`（关键词规则路由）
    - `signal-desk/api/auth/[action].ts`（合并 auth 端点）
    - `signal-desk/api/chat-sessions/[[...params]].ts`（合并会话 API）
    - `signal-desk/api/tsconfig.json`
    - `signal-desk/package.json`（@types/node）

---

### Task T16: API Key 功能（数据库字段 + Profile API + 设置页 API Tab）

- [x] **状态**：已完成（随 T13 设置页一同实现；事后补充记录）

> **说明**：本 Task 为事后补充，记录在 T13 设计阶段未预料但已落地的 API Key 功能，便于追溯与后续复用。

**功能概述：**
API Key 功能允许用户在设置页生成/撤销/复制个人 API Key，用于外部集成（如 CLI 工具、自动化脚本直接调用 Signal Desk API）。

**验证结果摘要（2026-07-08 后）：**
- `POST /api/profile?action=generate-api-key` → 返回 `{ apiKey: 'sk_xxx' }` PASS
- `POST /api/profile?action=revoke-api-key` → 返回 `{ ok: true }` PASS
- `GET /api/profile` 响应含 `apiKey` 字段 PASS
- 设置页 API Tab 展示/生成/撤销/复制 API Key PASS
- `npm run build` → PASS

**审计信息：**
- repo: `root`
  branch: `001-competitor-intel-monitor`
  commit: `<TBD>`（与 T13 同批）
  pr: `<TBD>`
  changed_files:
    - `signal-desk/db/schema.sql`（`users` 表新增 `api_key TEXT UNIQUE` 列 + 索引）
    - `signal-desk/db/migrations/001-add-api-key.sql`（存量 DB 增量迁移脚本）
    - `signal-desk/api/profile.ts`（generate-api-key / revoke-api-key 操作 + GET 返回 apiKey）
    - `signal-desk/src/pages/SettingsPage.tsx`（API Tab）
    - `signal-desk/src/lib/constants.ts`（generateApiKey / revokeApiKey 函数）

**代码仓范围：**
- 根项目：`signal-desk/db/`、`signal-desk/api/`、`signal-desk/src/`

**数据库变更：**
- `users` 表增加字段 `api_key TEXT UNIQUE`（可为 NULL）
- `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL`
- 新建：`db/migrations/001-add-api-key.sql`（存量数据库需手动执行；新建数据库直接用 schema.sql 即可）

**API 变更：**
- `GET /api/profile` 响应新增 `apiKey: string | null` 字段
- `POST /api/profile?action=generate-api-key`：生成 `sk_` 前缀 + 32 字节随机 API Key，存 `users.api_key`，返回 `{ apiKey }`
- `POST /api/profile?action=revoke-api-key`：置 `users.api_key = NULL`，返回 `{ ok: true }`

**验收点：**
- 用户可在设置页 API Tab 生成 API Key（每次生成覆盖旧 Key）
- 撤销后 `users.api_key = NULL`，设置页显示"暂无 API Key"
- API Key 格式为 `sk_` + 32 位小写字母数字（排除歧义字符）
- 数据库唯一索引保证 API Key 全局唯一

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
