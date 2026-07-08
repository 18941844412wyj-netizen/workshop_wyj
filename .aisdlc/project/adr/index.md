---
title: ADR 索引（Architecture Decision Records）
status: draft
---

> 本目录记录项目级架构决策（ADR）。首批由 spec `001-competitor-intel-monitor` 的 D2 设计固化（greenfield 新增基线）。
> 状态取值：Proposed / Accepted / Superseded。当前均为 Accepted（待评审）。

## 索引

| ADR | 标题 | 状态 | 来源 Spec |
|---|---|---|---|
| [ADR-0001](./ADR-0001-database-neon-serverless-postgres.md) | 托管数据库选型：Neon Serverless Postgres | Accepted | 001-competitor-intel-monitor |
| [ADR-0002](./ADR-0002-deployment-vite-spa-vercel-functions.md) | 部署形态与前端栈：Vite SPA + Vercel Serverless Functions | Accepted | 001-competitor-intel-monitor |
| [ADR-0003](./ADR-0003-llm-structured-outputs.md) | LLM 结构化输出：Structured Outputs（strict json_schema）+ Zod | Accepted | 001-competitor-intel-monitor |
| [ADR-0004](./ADR-0004-change-detection-two-layer-denoise.md) | 变化检测两层去噪（结构层 diff + 语义层 LLM） | Accepted | 001-competitor-intel-monitor |
| [ADR-0005](./ADR-0005-collection-daily-cron-manual-trigger.md) | 采集口径：每日定时 Cron + 手动即时触发（不承诺实时） | Accepted | 001-competitor-intel-monitor |
| [ADR-0006](./ADR-0006-auth-jwt-httponly-cookie.md) | 认证会话：httpOnly Cookie 承载签名 JWT | Accepted | 001-competitor-intel-monitor |
| [ADR-0007](./ADR-0007-email-resend-idempotency.md) | 邮件通知：Resend + idempotency key 去重 | Accepted | 001-competitor-intel-monitor |
| [ADR-0008](./ADR-0008-collection-http-fetch-db-snapshot.md) | 采集机制：真实站点 markdown 抓取 + JS 注入降级（测试包为默认输入）+ DB 存快照 | Accepted | 001-competitor-intel-monitor |
