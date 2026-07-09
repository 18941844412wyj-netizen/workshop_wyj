---
title: 发布说明 — Signal Desk MVP v1.0.0
spec: 001-competitor-intel-monitor
release-tag: v1.0.0-mvp
commit: cac7d60（main 分支）
release-date: 2026-07-09
deployed-to: Vercel（生产）
status: released
---

## 概述

Signal Desk MVP v1.0.0 正式发布。本版本为竞品情报监控代理首个可运行 MVP，覆盖从「网页变化采集」到「分角色情报分发 + 引用式深度对话」的完整业务闭环。

---

## 新增功能（本版本全新基线）

### 核心采集与分析链路
- **每日定时 Cron 自动采集**（UR-3）：Vercel Cron 每日定时对已绑定目标自动执行「检测→打标→分析」，无需人工介入。
- **手动即时触发**：支持按需对单个竞品立即执行全链路分析。
- **两层去噪**：可见文本行 diff（第1层）+ AI Structured Outputs 打标去噪（第2层，`isNoise` 字段），纯样式/A-B 摇摆不产生情报。
- **AI 打标+分析**（GLM-4-Flash，Structured Outputs + Zod 兜底）：六大信息标签（定价/功能/更新日志/招聘/营销活动/合规条款）+ 五要素情报（变化内容/战略意义/行动建议/优先级/原文锚点）。

### 个性化情报 Inbox（三大亮点落地）
- **亮点1·信息收集层**：Onboarding 选角色（产品经理/市场/创始人/投资人，可自定义），系统自动应用角色默认信息标签权重。
- **亮点2·信息匹配层**：个性化排序（优先级 × 画像权重），高权重领域置顶，低权重降权保留，避免信息茧房。
- **亮点3·信息消费层**：引用式深度对话（Inspector 内嵌，grounded prompt，无依据答「资料不足」），多会话管理，历史持久化。
- 双栏工作区（列表 + Inspector 详情/对话 Tab）；晨报/核心池/全部三视图；情报状态（未读/已读/归档）持久化；角色快切预览不同视角。

### 系统能力
- **注册/登录**：httpOnly Cookie JWT 会话，AuthGuard 全路由保护。
- **监控目标 CRUD**：名称/URL/赛道/采集方式，支持手动即时和每日定时两种模式。
- **主动通知**（UR-6）：Resend 邮件 + idempotency key 去重，多邮箱配置，可开关，频控。
- **情报反馈**（UR-7）：七标签（有用/幻觉/漏抓/优先级错误/建议废话/A-B 测试误报/其他）+ 问题模块 + 补充说明；「有用」自动入核心池。
- **设置页**：角色与权重 Tab（含自定义角色+权重弹窗）+ 邮件通知 Tab（多邮箱）。
- **路由兼容重定向**：`/inbox/:id` → `?id=:id&view=detail`；`/chat` → `?view=chat`。

---

## 技术架构

| 层 | 选型 |
|---|---|
| 前端 | Vite 8 + React 19 + TypeScript 6，部署至 Vercel CDN |
| 后端 | Vercel Serverless Functions（`api/` 目录），Node.js |
| 数据库 | Neon Serverless Postgres（重部署不丢数据，ADR-0001） |
| LLM | 智谱 GLM-4-Flash，OpenAI 兼容接口，JSON mode + Zod 兜底（ADR-0003） |
| 邮件 | Resend + idempotency key（ADR-0007） |
| 定时 | Vercel Cron（每日一次，ADR-0005）+ Inngest（分钟级备选，已集成） |
| Auth | jose JWT + httpOnly Cookie（ADR-0006） |

---

## 已知限制与后续演进

| 限制 | 说明 | 后续计划 |
|---|---|---|
| 真实站点 JS 注入采集（R-010）| 本期默认测试包输入，真实 JS 渲染链路未全验 | M1 专项 |
| 竞品自动推荐（UR-2）| Out of scope | M1 规划 |
| 多用户权限隔离 | 单账号 MVP，无 RBAC | M2 规划 |
| 邮件发件域名 | 当前 `onboarding@resend.dev`，生产需自定义域名 | M1 配置 |
| Cron 频率 | Vercel Hobby 每日一次，不承诺分钟级 | M1 升级或切 Inngest |

---

## 环境变量清单

> 参考 `signal-desk/.env.example`，所有密钥均通过环境变量注入，无明文入库。

| 变量名 | 用途 |
|---|---|
| `DATABASE_URL` | Neon Postgres 连接串 |
| `AUTH_SECRET` | JWT 签名密钥 |
| `LLM_API_KEY` | LLM 服务 API Key |
| `LLM_BASE_URL` | LLM 服务 Base URL |
| `LLM_MODEL` | LLM 模型名 |
| `RESEND_API_KEY` | Resend 邮件服务 Key |
| `RESEND_ACCOUNT_EMAIL` | Resend 账号邮箱（测试模式限制） |
| `CRON_SECRET` | Cron 端点鉴权 |

---

## 验收确认

- 全部 AC-001 ～ AC-016 通过（详见 `verification/test-report.md`）。
- `npm run build` 全绿（tsc 类型检查 + vite 构建，0 error）。
- 密钥不入库（`.env.local` 在 `.gitignore`，git history 中无明文密钥）。
