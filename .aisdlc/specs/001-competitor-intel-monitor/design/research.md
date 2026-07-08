---
title: D1 Research — 竞品情报监控代理 MVP（Signal Desk）
status: draft
---

## 基本信息

- Date：2026-07-08
- Feature：竞品情报监控代理 MVP（Signal Desk）
- Spec（分支 / ID）：`001-competitor-intel-monitor`
- 作者：DEV（技术调研）/ PM（用户本人，验收）
- 输入 SSOT：`requirements/solution.md`、`requirements/prd.md`、`requirements/prototype.md`
- 现状证据入口：`demo/src/prototypes/001-competitor-intel-monitor/`（Vite+React 原型，含数据模型 `mockData.ts`）、`ceshi/`（测试包基准 `index.html` + `cases/` 变体 + `build-cases.mjs`）

## TL;DR（最大风险 + 推荐方向）

- 最大风险：**AI 打标准确性与个性化匹配（R-007）+ 真实 LLM 成本/密钥（R-003）** 是三大亮点的成败点——打标不稳则「因人而异分发」失效。→ 用 Structured Outputs 强 schema + `ceshi/cases/` 全量回归实测把控。
- 采集口径已定（非风险）：自动采集统一为 **每日定时 Cron 自动采集**（对齐晨报语义），采集方式二选一为 **「手动即时触发」/「固定时间采集」**；不承诺分钟级「实时」，去除相关不确定性。
- 采集能力已定（对齐原始《生成MD测试用例》）：采集层按 **「真实站点 markdown 抓取 + JS 注入降级（markdown < 3 行时注入 JS 渲染再抓）」** 设计并写入 SSOT/ADR；**本期以测试包（`ceshi/index.html` + `cases/`）为默认输入**，真实抓取（含 headless/渲染）的 Serverless 可行性列为验证项 **R-010**（不阻塞 3 天闭环）。
- DB 已定：**Vercel Postgres 已停用（2025-06 迁移 Neon）** → 用 Marketplace 接 **Neon Serverless Postgres** + `@neondatabase/serverless` 驱动，关闭 R-001。
- LLM 已定：用 **Structured Outputs（`strict:true` json_schema）+ Zod** 强约束「打标+五要素分析」，避免字段缺失/幻觉枚举；对话走 grounded prompt。关闭 R-003/R-007 的机制面。
- 去噪已定：**两层过滤**——结构层只 diff 可见文本（天然滤掉纯 CSS 噪音 Z-Noise），语义层由 LLM 判定 A/B 摇摆与幻觉诱饵不报。关闭 R-004 机制面。
- 邮件已定：**Resend**（免费 3000/月，自带 idempotency key 天然去重）关闭 R-008 机制面。
- 部署形态：3 天工时内**沿用现有 Vite SPA + Vercel Serverless Functions（`/api/*`）**，避免迁移 Next.js 的返工。

## 未知项 → 研究任务映射

| 来源（solution/prd 技术背景） | 类型 | 研究任务 | 结论状态 |
|---|---|---|---|
| R-001 Vercel 兼容 DB 选型 | 依赖 | T1 | 已关闭 |
| Vercel Cron 定时自动采集口径（UR-3 P0） | 集成 | T2 | 已关闭（每日定时 + 手动触发） |
| R-003/R-007 真实 LLM 结构化打标+分析 | 集成 | T3 | 机制关闭，成本/密钥待验（验证清单） |
| R-004 变化检测去噪（样式/A-B/幻觉） | 未知 | T4 | 机制关闭，命中率待实测（验证清单） |
| 采集机制：真实站点 markdown 抓取 + JS 注入降级（测试包为默认输入） | 未知 | T5 | 机制关闭，真实抓取可行性待验（R-010） |
| R-008 邮件发送服务（UR-6 P1） | 集成 | T6 | 机制关闭，域名验证待办（验证清单） |
| 认证/会话（Serverless 友好） | 依赖 | T7 | 已关闭 |
| 部署形态/前端栈（复用 Demo vs Next.js） | 未知 | T8 | 已关闭 |
| R-006 AI 事实性/幻觉基线 | 未知 | T9 | 机制关闭，抽查待验（验证清单） |

---

## Research Tasks Completed

### T1. Vercel 兼容的 Serverless Postgres 选型（R-001）

**Task**：查明 Vercel 上「重新部署数据不丢失」的托管 DB 现状与推荐驱动。

**研究发现**：
- Vercel Postgres 已于 **2025-06 停用**，所有实例自动迁移至 Neon；Vercel 不再自营数据库，改由 Marketplace 接第三方（Neon / Supabase / Prisma Postgres / PlanetScale / Upstash）。
- 新项目官方推荐 **Neon `@neondatabase/serverless`** 驱动：单条查询用 HTTP 版 `neon()`，事务用 WebSocket 版 `Pool`；与 Drizzle/Prisma/Kysely 兼容。
- Serverless 环境需连接池（内置池 / PgBouncer）避免连接耗尽；DB 区域应贴近函数默认区 `iad1`。

**Decision**：采用 **Neon Serverless Postgres（经 Vercel Marketplace 集成）+ `@neondatabase/serverless`**；简单查询用 `neon()` HTTP，涉及多写事务用 `Pool`。凭据仅存环境变量，注入 `DATABASE_URL`。

**Rationale**：
- 直接满足「Serverless 友好 + 重新部署不丢数据」硬约束（AC-016），且是 Vercel Postgres 的技术继任者，迁移成本最低。
- Marketplace 统一计费/环境变量注入，3 天内接入摩擦最小。

**Alternatives considered**：
- Supabase：全家桶（含 Auth/Storage/Realtime）；本 MVP 认证极简、无 Realtime 需求，引入全家桶属过度配置——不选，但若后续要现成 Auth 可重估。
- Prisma Postgres / PlanetScale / Upstash：ORM 优先 / MySQL / KV，与「关系型 + 最小依赖」定位不最匹配——不选。
- 本地 SQLite：Vercel FS 临时化，重启丢数据——明确排除（PRD 规则-5）。

**Evidence**：Neon 官方《Vercel Postgres Transition Guide》；Vercel《Marketplace Storage》；`requirements/prd.md` R-001 / 规则-5 / AC-016。

---

### T2. Vercel Cron 定时自动采集口径（UR-3 P0）

**Task**：查明 Vercel Cron 的频率/精度/超时/并发限制，确定「无需人工、持续自动」的落地口径。

**研究发现**：
- **Hobby**：Cron 最小间隔 **每天一次**，精度按小时（`0 8 * * *` 可能 08:00–08:59 触发）；更高频表达式**部署即失败**。**Pro/Enterprise**：每分钟、分钟级精度。时区固定 UTC。
- 函数 `maxDuration`：Hobby 默认且上限 **300s**；Pro 800s（1800s beta）。超时返回 504 `FUNCTION_INVOCATION_TIMEOUT`。
- **并发风险**：若单次运行超过间隔，Vercel 可能在前次未结束时触发第二实例 → 竞态/重复处理。官方建议：拆分工作单元、设 `maxDuration`、加长间隔、加防重叠锁。
- Cron 路由应受保护（`CRON_SECRET` / Authorization 校验），配置在 `vercel.json`。

**Decision**：
- UR-3 P0 自动采集统一为 **每日定时 Cron 自动采集**（对齐 PRD「每日 09:00 固定时间采集 / 晨报」语义，Hobby 免费即满足）；`vercel.json` 配 `crons` + `/api/cron/analyze`，用 `CRON_SECRET` 保护。
- 采集方式二选一：**「手动即时触发 `/api/analyze`」**（Demo 已有该交互）/ **「固定时间采集（每日定时）」**；不承诺分钟级「实时」。
- Cron 处理**分批 + 幂等 + 防重叠**：单次只处理到期目标、单目标一次分析写入前查重（同目标同快照不重复生成情报），单函数控制在 300s 内；目标多时分片。

**Rationale**：每日定时 Cron 在 Hobby 免费档即可交付「无人工介入的每日情报产出」满足 UR-3 验收（AC-013）；采集方式收敛为「手动触发 / 每日定时」两种确定形态，产品语义清晰、无付费或返工负担。

**Alternatives considered**：
- 直接上 Pro（$20/人·月）拿分钟级 Cron：能满足「实时」字面，但超出 3 天 MVP 的成本与必要性——不选，列为后续演进。
- 纯外部调度器替代 Vercel Cron：能高频，但引入额外系统与密钥，MVP 复杂度上升——仅作兜底，不作主路径。
- 长任务单次跑全量：有 300s 超时与并发重叠风险——不选，改分批。

**Evidence**：Vercel《Cron Usage & Pricing》《Managing Cron Jobs》《Functions Limits》；`requirements/prd.md` 规则-11 / AC-013 / 异常-8。

---

### T3. 真实 LLM 结构化打标与分析（R-003 / R-007）

**Task**：查明如何让大模型稳定产出「六大信息标签 + 五要素分析 + 三档优先级 + 原文锚点」的强 schema 结果。

**研究发现**：
- 2026 生产标准：用 **Structured Outputs（`response_format: json_schema` + `strict:true`）**，由约束解码保证 100% schema 合规；legacy JSON mode 仅保证「是合法 JSON」不保证 schema。
- 严格模式要求：所有字段列入 `required`、每层对象 `additionalProperties:false`、可选字段用 `["type","null"]` 联合类型；须处理 `refusal` 字段与 `finish_reason` 截断。
- 推荐用 Zod（TS）自动生成 schema，保证代码契约与 API 一致；函数调用亦可 `strict:true`。

**Decision**：
- 打标 + 分析用**一次结构化调用**（或打标、分析两段，视 token/延迟实测），`strict:true` json_schema，字段：`labels[]`(枚举六选)、`priority`(枚举三档)、`whatChanged`、`whyItMatters`、`actionGeneral{销售,产品,营销}`、`actionPlan{按角色}`、`sourceAnchor`(原文锚点)、`isNoise`+`noiseType`(用于 A/B/幻觉语义过滤，见 T4)。
- 用 **Zod** 定义 schema；解析后校验；处理 refusal / 截断 → 标记「分析失败/可重试」（异常-2）。
- 接入层封装模型/密钥/超时可配（solution 边界 2），便于替换/降级。

**Rationale**：强 schema 直接支撑 AC-004（字段完整）与 R-007（标签命中稳定），把「像分析师思考」的核心价值落到可解析结构；接入层可配满足成本降级动作。

**Alternatives considered**：
- Legacy JSON mode：不保证 schema，需自写重试与校验——不选（除非目标模型不支持 Structured Outputs 时降级）。
- 纯关键词规则打标：稳定但丢洞察，作为 R-007 不成立时的降级项（规则+AI 辅助）。
- 自由文本 + 正则抽取：脆弱、易漏字段——不选。

**Evidence**：OpenAI《Structured model outputs》《Introducing Structured Outputs》《Function calling》；`requirements/prd.md` R-003 / R-007 / 规则-3 / AC-004。

---

### T4. 变化检测与去噪机制（R-004）

**Task**：确定「基准 vs 变体」如何 diff，并让「纯样式 / A-B / 幻觉诱饵」不生成情报。

**研究发现（基于 `ceshi/` 全量 case）**：
- **纯 CSS 噪音（Z-Noise-1/2）**：只改 `--hero-grad`/`.card` 等样式，**可见文本不变** → 只要 diff「抽取后的可见文本」而非原始 HTML，天然过滤。
- **A/B（Z-AB-1/2）**：变体靠**内联 `<script>` 按日期奇偶切换**；服务端抓取的是静态源码（脚本不执行），Z-AB-1 源码等同 baseline（仅版本号），Z-AB-2 是新增一段 A/B 脚本 → 属「基础设施变化」，需**语义层识别为 A/B 摇摆不报**。
- **幻觉诱饵（Z-Hallucination-1/2）**：改的是可见文本（50,000→80,000 / “Coming Soon” / 媒体背书）→ **diff 一定会捕获**，只能在**语义层判定为诱饵/未上线不报**。
- **真信号（Pricing/Feature/Release/Hiring/Marketing/Recall）**：均为可见文本增删改，diff 可捕获；Z-Recall 属隐蔽但真实变化，须保证 Recall 不漏。

**Decision**：**两层过滤**——
1) **结构层**：抽取可见文本（剥离 `<style>/<script>/注释/标签属性`）→ 空白归一化 → 按区块/行做文本 diff，输出「有意义变化候选」。这一层过滤纯样式噪音。
2) **语义层（LLM）**：对候选打标时同时判定 `isNoise/noiseType`（A/B 摇摆、幻觉诱饵、未上线预告）→ 噪音候选不生成情报（PRD 规则-2）。

**Rationale**：把「样式噪音」交给便宜确定的文本 diff，把「需要理解的噪音（A/B/幻觉）」交给 LLM，职责清晰且与测试包的真/伪信号分布完全对齐，最大化 Recall（不漏真）同时抑制 FP。

**Alternatives considered**：
- 原始 HTML 直接 diff：会把 CSS 变量/属性变化误报（FP），且噪声大——不选。
- 纯规则过滤 A/B/幻觉：脆弱，难覆盖多样文案——不选，作为 R-004 兜底（正文抽取+归一化预处理已内含）。
- 渲染后 DOM 快照 diff（headless 浏览器）：A/B 脚本会执行导致跨次抖动，且 Serverless 跑 headless 重——不选（本期抓静态源码即可）。

**Evidence**：`ceshi/cases/build-cases.mjs`（各 case 的 replace 规则与 `type: 正向/反向`）、`ceshi/cases/Z-Pricing-1.html`（ZONE 注释含 expected）、`requirements/prd.md` 规则-2 / R-004 / 异常-3。

---

### T5. 采集机制：真实站点 markdown 抓取 + JS 注入降级（测试包为默认输入）

**Task**：对齐原始《生成MD测试用例》，明确「用户填 URL → 系统自动抓取识别变化」的采集能力形态，以及本期（3 天 MVP / 测试包）如何落地。

**研究发现**：
- 原始《生成MD测试用例》验证过 40+ 真实站点：默认「正常抓取 markdown」；**部分站点（如 ihuiwa.com / klingai.com）常规方式抓不到，需 JS 注入渲染再抓——判定规则：当获取的 markdown 数据 < 3 行时启用 JS 注入**。
- 测试包为静态 HTML：基准 `ceshi/index.html` + 变体 `ceshi/cases/Z-*.html`，每页含 `<meta name="x-test-version">` 版本锚点，`build-cases.mjs` 声明式生成。
- Serverless FS 对**运行时写入**是临时的，但对**部署时打包进去的只读静态资源**可读；HTTP 抓取同源静态资源亦可行。JS 注入/渲染需引入 headless 浏览器或第三方渲染服务，在 Vercel Serverless 上偏重、冷启动/超时（300s）有不确定性。

**Decision**：
- **采集层能力（写入 SSOT/ADR）**：`fetch(target.url)` → 提取正文为 **markdown**；**当 markdown < 3 行时触发 JS 注入/渲染降级**再抓一次；抽取可见文本进入 T4 两层 diff。此为对齐原始需求的目标能力。
- **本期默认输入 = 测试包**：把测试包作为静态资源随部署发布（或独立可访问 URL），演示中把监控目标 URL 映射到各 case 页，模拟「基准→变体」变化；测试包同时作为效果评估/回归基准（对齐《效果评估标准》）。
- **快照持久化到 Neon**（非 FS）：目标首次抓取存基准快照；后续抓取新版本 → 与库中上一快照做 T4 两层 diff → 生成候选。版本用 `x-test-version` 锚点辅助对齐 Ground Truth。
- **真实抓取 + JS 注入的 Serverless 可行性列为验证项 R-010**：不阻塞本期核心闭环；不成立则降级为「仅静态 fetch + 测试包演示」，真实 JS 注入抓取转后续演进。

**Rationale**：把「抓取→markdown 提取→(不足则 JS 注入)→存快照→diff」定为采集层统一能力，忠于原始《生成MD测试用例》；本期用测试包默认输入既复用同一链路又规避真实站点反爬/渲染不确定性，3 天闭环不受阻，真实抓取靠 R-010 早期验证收敛风险。

**Alternatives considered**：
- 本期即上真实 headless 抓取全量站点：忠于字面但引入无头浏览器/渲染服务（新基础设施），3 天工时与部署复杂度风险高——不选，降为「能力入案 + R-010 验证 + 测试包默认」。
- 直接读打包内 fixture 文件而不走 HTTP：更简单，但偏离「URL 抓取」语义，扩展真实站点时返工——作为离线测试兜底，不作主路径。
- 快照存 FS/内存：Serverless 重启丢失，违反规则-5——不选。

**Evidence**：`yuanshixuqiu/Monitor 生成MD测试用例.md`（markdown 抓取 + <3 行触发 JS 注入规则）；`ceshi/index.html` 版本锚点与 ZONE 注释；`ceshi/cases/build-cases.mjs`；`requirements/solution.md` 边界 1 / 2.1；`requirements/prd.md` 规则-5。

---

### T6. 邮件主动通知服务（R-008 · UR-6 P1）

**Task**：选定 Vercel 上可用的邮件发送服务，落实「紧急/高匹配去重推送、多邮箱、可关闭」。

**研究发现**：
- **Resend**：免费额度 3000 封/月、100 封/天，限速约 5–10 req/s（按团队共享）；Node SDK `npm i resend`，密钥存 `RESEND_API_KEY`；`to` 最多 50 地址；支持 `scheduledAt`、Batch（单请求 ≤100 封）。
- 关键：**内置 Idempotency Key（24h 过期）** → 天然实现「同一情报对同一用户只推一次」的去重（规则-13）。
- 需**验证发件域名**（或用 `onboarding@resend.dev` 做测试收发）。

**Decision**：采用 **Resend**；对每条「紧急/高匹配」情报，按 `用户+情报ID` 生成 idempotency key 发送 → 去重；多推送邮箱写入 `to[]`；设置页开关/时间/内容映射到发送逻辑（关闭则跳过）。发送失败不阻塞情报入库（异常-9），记「发送失败/可重试」。

**Rationale**：免费额度足够 MVP 演示；idempotency key 直接满足去重口径，省去自建去重表；Node SDK 与 Vercel Functions 无缝。

**Alternatives considered**：
- SMTP（Nodemailer + 第三方 SMTP）：可行但需自管连接与去重逻辑，摩擦更大——不选，作为 Resend 不可用时的替代。
- 站内通知/红点保底：R-008 不成立时的降级动作（solution/prd 已定）。

**Evidence**：Resend《Account quotas & limits》《Send with Vercel Functions》《Send Email API》(idempotency key)；`requirements/prd.md` R-008 / 规则-13 / AC-015 / 异常-9。

---

### T7. 认证与会话（Serverless 友好，最简）

**Task**：确定 Serverless 下最简且持久的注册/登录会话方案。

**研究发现**：
- Demo 现为纯前端内存态（`register/login` 仅改内存 state），无真实持久化——需替换为 DB + 服务端会话。
- Serverless 无常驻内存，会话须**无状态（签名 token）或存 DB**。

**Decision**：**httpOnly + Secure Cookie 承载签名 JWT**（`SESSION_SECRET`）；密码用 bcrypt/scrypt 哈希存 Neon；受保护 `/api/*` 与业务页校验 cookie（规则-6 / 异常-1）。单账号 MVP，不做多租户/权限矩阵。

**Rationale**：无状态 JWT-cookie 最贴合 Serverless（无需会话存储往返），实现最快；哈希存储满足最低安全底线。

**Alternatives considered**：
- Supabase Auth：现成但需引入 Supabase 全家桶（与 T1 Neon 选型冲突）——不选。
- DB session 表 + 随机 token：可行但每请求多一次 DB 往返，MVP 无必要——不选。
- localStorage 存 token：易受 XSS，安全性差——不选。

**Evidence**：`demo/.../mockData.ts`（现内存态 `login/register`）；`requirements/prd.md` 规则-6 / 异常-1 / 功能清单「注册登录」。

---

### T8. 部署形态与前端技术栈（复用 Demo vs 迁移 Next.js）

**Task**：在 3 天工时内确定前后端分离 + Vercel 部署的落地形态。

**研究发现**：
- Demo 已成型：**Vite 8 + React 19 + react-router-dom 7**，SPA 客户端路由，页面/组件/数据模型（`mockData.ts` 的类型与状态机）齐备，是 SSOT 反写来源。
- Vercel 支持框架无关的 `/api/*` Serverless Functions + `vercel.json`（rewrites 支持 SPA 回退、crons 配置）。

**Decision**：**沿用 Vite SPA（静态构建）+ Vercel Serverless Functions（`/api/*`）**；`vercel.json` 配 SPA rewrites + crons；前端复用 Demo 组件与类型，仅把内存 mock 换成真实 `/api` 调用。

**Rationale**：直接复用已验证的 Demo（含交互、类型、数据模型），避免迁 Next.js 的移植返工，最契合 3 天工时（R-002）；`/api` 函数天然承载 auth/targets/analyze/cron/insights/chat/notify 等接口（PRD 影响面已列）。

**Alternatives considered**：
- 迁移 Next.js（App Router）：统一全栈、API/cron DX 更好，但需重写路由与页面结构，3 天内风险高——列为后续演进。
- 前后端独立部署（前端 Vercel + 后端另一平台）：增加跨域与运维复杂度——不选。

**Evidence**：`demo/package.json`（Vite/React/router 版本）、`demo/src/prototypes/001-competitor-intel-monitor/`；`requirements/prd.md` §9 影响面接口清单 / R-002。

---

### T9. AI 事实性/幻觉基线（R-006）

**Task**：明确如何约束「仅基于原文作答 + 强制引用锚点 + 资料不足坦白」。

**研究发现**：
- Structured Outputs 可强制 `sourceAnchor` 字段存在（不可省略），但**内容真实性仍需 Prompt + 校验**；`refusal` 可编程识别拒答。
- 对话（chat）不适合强 schema（自由文本），需靠 **grounded system prompt**：只喂「当前情报 + 被引用原文 + 会话上下文」，禁止外部知识，无依据时输出「资料不足」（规则-4 / 异常-5）。

**Decision**：
- 分析链：Prompt 强约束「只依据变化候选+原文，每要素带原文锚点」，`sourceAnchor` 设为 required；抽查逐字核对 What Changed（R-006 验收）。
- 对话链：grounded prompt 限定上下文范围 + 明确「不联网/不臆造/无依据答『资料不足』」；Demo 已示意该兜底逻辑（`sendGlobalMessage` 的资料不足分支）。

**Rationale**：把「结构合规」交 Structured Outputs、把「事实不臆造」交 Prompt 约束 + 人工抽查，双管齐下满足 AC-007 与 R-006。

**Alternatives considered**：
- 仅靠模型自觉不臆造：不可靠——不选。
- 接入检索/联网增强事实：违反「不联网现抓」口径（规则-4）——明确排除。

**Evidence**：`demo/.../mockData.ts` 资料不足分支；OpenAI Structured Outputs（refusal/required）；`requirements/prd.md` 规则-3/4 / R-006 / AC-007 / 异常-5。

---

## 风险与验证清单（本轮未完全关闭项）

> 说明：以下为「机制已定、但需在开发早期用真实密钥/环境实测才能签收」的条目，沿用 PRD §8 编号，补充触发动作。

| 编号 | 验证信号（成立/不成立） | 方法 | Owner | 截止 | 触发动作 |
|---|---|---|---|---|---|
| R-003 | 单条「打标+五要素」结构化调用稳定返回、成本可接受=成立 | 用目标模型对一条变化做端到端 Structured Outputs 调用，记录耗时/token；确认模型支持 strict json_schema | PM 供密钥 / DEV 接入 | 开发启动后 0.5 天 | 不成立则打标降级「关键词规则+AI 辅助」，低优先级只出通用建议或换低成本模型 |
| R-007 | 六大标签命中正确 + 切换画像后 Inbox 排序有差异且重点置顶=成立 | 用 `ceshi/cases/` 覆盖 6 标签×4 角色核对打标与个性化排序 | PM 验收 / DEV 调优 | Day2 结束前 | 不成立则个性化降级为「筛选+高亮」而非重排 |
| R-004 | 纯样式(Z-Noise)不报、A/B(Z-AB)与幻觉(Z-Hallucination)不报、真信号全捕获=成立 | 全量跑 `ceshi/cases/` 正向/反向用例统计 Recall/FP | DEV | Day2 结束前 | 不成立则强化正文抽取/文本归一化预处理；语义层补 few-shot |
| R-008 | 能稳定发出且收件箱可收（含去重）=成立 | 验证发件域名或用 `onboarding@resend.dev`，对一条紧急情报触发真实发送 + 二次触发验去重 | PM 供密钥 / DEV 接入 | 开发启动后 1 天 | 不成立则降级站内通知/红点，邮件转后续 |
| R-006 | 抽查无编造事实、资料不足能坦白=成立 | 抽查若干情报逐字核对 What Changed 与原文；构造无依据追问验兜底 | PM 验收 / DEV 调优 | MVP 演示前 | 不成立则强化「仅基于原文+强制锚点」提示 |
| R-002 | 核心闭环 Day2 前可演示=成立 | 开工半天工时切分，引用式深度对话列为最后可裁剪项 | DEV+PM | 开发启动当天 | 不成立则深度对话降级单轮追问，先保核心闭环 |
| R-005 | 确认 greenfield 且模块清单采纳=成立 | 确认无 `.aisdlc/project/memory/*`（本轮已核实缺失）→ 按新增基线 | PM | 方案评审时 | 非 greenfield 则先 project-discover 补权威入口 |
| R-010 | 真实站点 markdown 抓取 + JS 注入降级（<3 行触发）在 Vercel Serverless 上可跑通、不超时=成立 | 选 1–2 个真实站点（含需 JS 注入的 klingai/ihuiwa 类）走 `fetch→markdown→(不足则注入)` 链路，记录耗时/成功率 | DEV | Day2 结束前 | 不成立则降级「仅静态 fetch + 测试包默认输入」，真实 JS 注入抓取转后续演进 |

---

## 对 D2（spec-design）的可引用输入

- **技术选型基线（可直接进 D2 决策章节）**：Neon Serverless Postgres（T1）、Vite SPA + Vercel `/api` Functions（T8）、Structured Outputs+Zod（T3）、两层去噪（T4）、真实站点 markdown 抓取 + JS 注入降级（测试包为默认输入）+ DB 快照（T5）、Resend+idempotency（T6）、JWT-cookie 会话（T7）。
- **需在 D2 落盘的对外契约要点**（本 D1 不写字段/DDL，仅列入口与要点，留给 D2）：
  - 接口契约：`/api/auth/{register,login}`、`/api/profile`、`/api/targets`、`/api/analyze`、`/api/cron/analyze`(受 `CRON_SECRET` 保护)、`/api/insights[/:id]`、`/api/insights/:id/{chat,feedback}`、`/api/notify`（PRD §9 已列）。
  - 数据模型要点：以 Demo `mockData.ts` 类型为基线（`UserProfile/Target/Intel/ChatSession/EmailSettings/CustomRole` + 快照表 + 情报去重键），D2 转 DDL。
  - LLM 分析 schema（Zod）：`labels[]/priority/whatChanged/whyItMatters/actionGeneral/actionPlan/sourceAnchor/isNoise/noiseType`。
  - 需更新的项目级入口（本轮缺失，建议 D2 或 project-discover 处理）：`.aisdlc/project/memory/{product,glossary}.md`、`project/contracts/`、`project/adr/`（记录 DB/部署/LLM 三项关键决策为 ADR）。

## 追溯

- 需求 SSOT：`requirements/solution.md`（§2 推荐方案 / §2.1 三大亮点 / §5 验证清单 / §7 Impact）、`requirements/prd.md`（§5 规则 / §6 AC / §8 验证清单 / §9 影响面）、`requirements/prototype.md`（页面/接口/走查脚本）。
- 现状证据：`demo/src/prototypes/001-competitor-intel-monitor/`、`ceshi/`（`index.html` / `cases/` / `build-cases.mjs`）。
- 外部证据：Vercel（Cron Usage&Pricing、Managing Cron Jobs、Functions Limits、Marketplace Storage）、Neon（Vercel Postgres Transition Guide）、OpenAI（Structured Outputs、Function calling）、Resend（Quotas&Limits、Send with Vercel Functions、Send Email API）。
