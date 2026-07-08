---
id: ADR-0001
title: 托管数据库选型：Neon Serverless Postgres
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

MVP 部署于 Vercel（Serverless），文件系统临时化，本地 SQLite 无法持久化（重新部署丢数据，违反 PRD 规则-5 / AC-016）。经调研：Vercel Postgres 已于 2025-06 停用并整体迁移到 Neon；Vercel 不再自营数据库，改由 Marketplace 接第三方。

## Decision

采用 **Neon Serverless Postgres**（经 Vercel Marketplace 集成），驱动用 **`@neondatabase/serverless`**：单条查询用 HTTP 版 `neon()`，多写事务用 WebSocket 版 `Pool`。凭据仅存环境变量（`DATABASE_URL`），Serverless 下使用连接池避免连接耗尽，DB 区域贴近函数默认区 `iad1`。

## Consequences

- 正面：满足「重启不丢数据」；Vercel 统一计费与环境变量注入，接入摩擦最小；与 Drizzle/Prisma/Kysely 兼容。
- 负面/约束：需管理连接池；分支/PITR/autoscaling 等高级特性需 Neon 付费档（MVP 不依赖）。

## Alternatives considered

- Supabase：全家桶（含 Auth/Storage/Realtime），本 MVP 无此需求，属过度配置——不选（若后续要现成 Auth 可重估）。
- Prisma Postgres / PlanetScale / Upstash：ORM 优先 / MySQL / KV，与「关系型 + 最小依赖」不最匹配——不选。
- 本地 SQLite：Serverless 不可持久化——排除。

## Evidence / References

Neon《Vercel Postgres Transition Guide》；Vercel《Marketplace Storage》；`requirements/prd.md` R-001 / 规则-5 / AC-016；`design/research.md` T1。
