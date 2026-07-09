---
title: 测试报告 — 竞品情报监控代理 MVP（Signal Desk）
spec: 001-competitor-intel-monitor
linked-test-cases: verification/test-cases.md
commit: cac7d60（main 分支最新，feat(inbox): add InboxList component and InboxPage）
tester: DEV（用户本人）
env: Vercel 生产部署 + Neon Postgres + 智谱 GLM-4-Flash
test-date: 2026-07-09
status: PASS（全量门禁通过）
---

## 1. 执行摘要

| 项目 | 结果 |
|---|---|
| 构建（`npm run build`）| ✅ PASS — tsc + vite build 0 error |
| 类型检查（`tsc`） | ✅ PASS — 0 error |
| 核心 AC 覆盖（AC-001～016） | ✅ 全部 PASS（见下节） |
| 安全检查（密钥不入库） | ✅ PASS |
| 去噪用例（TC-E2） | ✅ PASS |
| 已知遗留项 | 见第 4 节 |

---

## 2. 构建验证结果

```
命令：cd signal-desk && npm run build
> signal-desk@0.0.0 build
> tsc && tsc -p api/tsconfig.json && vite build

✓ 41 modules transformed.
dist/index.html                   0.47 kB │ gzip:  0.30 kB
dist/assets/index-DCj_Ilhn.css   28.09 kB │ gzip:  5.71 kB
dist/assets/index-bnO1esRc.js   288.23 kB │ gzip: 88.70 kB
✓ built in 310ms

exit code: 0（全绿）
```

---

## 3. AC 验收结果（逐条）

| TC | 对应 AC | 验证方式 | 状态 | 备注 |
|---|---|---|---|---|
| TC-001 | AC-001 | 端到端注册→Onboarding，API 验证 profile.tagWeights | ✅ PASS | 角色默认权重正确写入 DB |
| TC-002 | AC-002 | 前端目标 CRUD 操作 + API 校验 | ✅ PASS | 两种采集方式均可保存 |
| TC-003 | AC-003 | 手动触发 `/api/analyze`，Inbox 查看情报 | ✅ PASS | 平均 ~15s 产出情报 |
| TC-004 | AC-004 | Inspector 字段核查 + API 返回验证 | ✅ PASS | 五要素 + ≥1 标签 + 优先级三档 |
| TC-005 | AC-005 | 多角色切换 Inbox 排序对比 | ✅ PASS | 高权重领域置顶，低权重降权保留 |
| TC-006 | AC-006 | Inspector 详情 Tab + 原文展开 | ✅ PASS | View Source 展示变化对比 |
| TC-007 | AC-007 | 引用对话在范围内/超范围问题测试 | ✅ PASS | 超范围明确回答「资料不足」 |
| TC-008 | AC-008 | 多会话创建 + 刷新后历史验证 | ✅ PASS | 会话历史持久化，切换正确 |
| TC-009 | AC-009 | 反馈打标 + 刷新验证 + 核心池验证 | ✅ PASS | 「有用」自动入核心池 |
| TC-010 | AC-010 | 晨报/核心池视图切换验证 | ✅ PASS | 晨报仅含当日，核心池仅含核心 |
| TC-011 | AC-011 | 四类筛选条件逐一验证 | ✅ PASS | 赛道/标签/优先级/归档筛选均生效 |
| TC-012 | AC-012 | 设置页权重修改 + Inbox 排序前后对比 | ✅ PASS | 角色快切即时影响行动建议 |
| TC-013 | AC-013（UR-3）| 调用 `/api/cron/analyze` 模拟定时触发 | ✅ PASS | 全链路跑通，字段完整 |
| TC-014 | AC-014（UR-4）| 归档→刷新→筛选→取消归档 | ✅ PASS | 状态持久化，筛选可查 |
| TC-015 | AC-015（UR-6）| Resend 邮件触发 + 去重验证 | ✅ PASS | 邮件发出，二次不重发；见备注 |
| TC-016 | AC-016 | Vercel 部署访问 + redeploy 后数据验证 | ✅ PASS | Neon Postgres 重部署不丢数据 |
| TC-E1 | 规则-6 | 无 Cookie 访问业务页/API | ✅ PASS | 全部 401 或重定向 /login |
| TC-E2 | 规则-2 | 纯样式变体用例触发 | ✅ PASS | isNoise=true，不产生情报 |
| TC-E3 | B3 安全 | gitignore + git log + 代码扫描 | ✅ PASS | 无明文密钥入库 |

**备注（TC-015）**：Resend 免费账号限制收件人为已验证邮箱；测试使用 `RESEND_ACCOUNT_EMAIL` 绑定账号邮箱绕过测试模式限制，生产环境需配置自定义发件域名或使用 `onboarding@resend.dev` 发件地址。

---

## 4. 遗留项与已知限制

| # | 描述 | 类型 | 影响范围 | 建议后续动作 |
|---|---|---|---|---|
| L-001 | 真实站点 JS 注入降级（R-010）：本期默认测试包输入，真实 JS 渲染未在生产验证 | 设计内已知约束 | 真实站点采集 | M1 专项验证真实爬取链路 |
| L-002 | Vercel Hobby Cron 仅每日一次：无法在测试环境验证分钟级触发 | 平台约束 | Cron 频率 | 生产观测 or 升级 Pro 计划 |
| L-003 | 邮件发件域名验证（R-008）：当前 `onboarding@resend.dev` 发件，自定义域名需 DNS 验证 | 配置项 | 邮件发件方展示 | M1 配置自定义域名 |
| L-004 | 竞品自动推荐（UR-2）：Out of scope 本期不实现 | Out of scope | 竞品发现 | M1 规划 |
| L-005 | `INEFFECTIVE_DYNAMIC_IMPORT` 构建警告：profile-cache.ts 动态/静态混合导入 | 低优构建告警 | 构建产物分块 | 下期重构 import 结构消除告警 |

---

## 5. 风险验证结果（对照 plan.md §风险与验证）

| 风险 | 验证结果 | 
|---|---|
| R-001 Neon 重启不丢数据 | ✅ 成立：redeploy 后数据完整 |
| R-003 LLM Structured Outputs 可用性 | ✅ 成立：GLM-4-Flash JSON mode + Zod 兜底，稳定返回 |
| R-004 变化检测去噪命中率 | ✅ 成立：纯样式用例不报，内容变化捕获 |
| R-007 打标+个性化匹配可用性 | ✅ 成立：标签命中正确，切画像排序有差异 |
| R-008 Resend 邮件可用性 | ✅ 成立（带限制）：见 TC-015 备注 |
| R-010 真实站点采集可行性 | ⚠️ 部分成立：静态 fetch 可用，JS 注入未在生产完整验证（L-001） |

---

## 6. 复现与验证步骤

**运行环境**：
- OS：Windows 10 / Node.js 20+
- 前端框架：Vite 8 + React 19 + TypeScript 6
- 后端：Vercel Serverless Functions + Neon Postgres
- LLM：智谱 GLM-4-Flash（OpenAI 兼容接口）

**复现步骤**：
```bash
# 1. 进入项目目录
cd signal-desk

# 2. 安装依赖
npm install

# 3. 配置环境变量（参考 .env.example）
cp .env.example .env.local
# 填入 DATABASE_URL / LLM_API_KEY / LLM_BASE_URL / LLM_MODEL / RESEND_API_KEY / CRON_SECRET / AUTH_SECRET / RESEND_ACCOUNT_EMAIL

# 4. 执行数据库迁移
npm run db:migrate

# 5. 启动本地前端开发服务
npm run dev

# 6. 启动本地 API 服务（Vercel CLI）
npm run dev:api

# 7. 运行构建验证
npm run build
```

**Vercel 部署验证**：登录 Vercel Dashboard → 触发 Redeploy → 访问部署 URL → 验证数据持久。
