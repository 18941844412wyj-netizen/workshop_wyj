---
title: D0 设计判定 — 竞品情报监控代理 MVP（Signal Desk）
spec: 001-competitor-intel-monitor
stage: D0
decision-date: 2026-07-08
status: 是（需要设计阶段）
---

## D0 判定：是否需要设计阶段？

**结论：是（需要设计阶段）**

---

## 判定依据

| 维度 | 评估 | 说明 |
|---|---|---|
| 新系统 vs 已有系统 | 全新（greenfield） | 无既有代码基线，影响面为全新所有模块 |
| 技术选型有风险 | 是 | R-001（DB Serverless 兼容）、R-003（LLM Structured Outputs）、R-010（真实站点采集可行性）三大高风险需先调研决策 |
| 架构涉及多层 | 是 | 前端 SPA + Serverless Functions + 托管 DB + LLM + 邮件服务，跨4层系统边界 |
| 有明确设计取舍 | 是 | 采集方式（Cron vs 实时）、DB 选型（Neon vs Supabase）、LLM 接入方式（strict json_schema vs JSON mode 兜底）、Auth 方案（JWT Cookie vs Session） |
| 工时约束明确 | 是 | 3 天 MVP，需 D1 调研优先确认关键技术路径，避免实现阶段返工 |

---

## 设计阶段产出

| 产物 | 文件 | 状态 |
|---|---|---|
| D1 技术调研 | `design/research.md` | ✅ 完成 |
| D2 技术设计 RFC | `design/design.md` | ✅ 完成 |
| ADR 决策记录 | `.aisdlc/project/adr/` (ADR-0001 ～ ADR-0008) | ✅ 完成 |

---

## 主要架构决策摘要（详见各 ADR）

| ADR | 决策 | 取舍点 |
|---|---|---|
| ADR-0001 | 数据库选用 Neon Serverless Postgres | Vercel 下 SQLite 不可持久化（R-001 验证不成立），选 Neon 托管 |
| ADR-0002 | 部署选用 Vite SPA + Vercel Serverless Functions | 3天MVP优先复用已验证Demo（Vite），不迁移 Next.js |
| ADR-0003 | LLM 接入：JSON mode + 宽松 Zod 兜底 | 智谱不支持 strict json_schema，JSON mode 兜底（C1 解除） |
| ADR-0004 | 变化检测：两层去噪 | 文本行 diff（第1层）+ AI 打标 isNoise（第2层），减少误报 |
| ADR-0005 | 定时采集：每日 Cron（不承诺分钟级） | Vercel Hobby Cron 每日一次，Inngest 作为分钟级备选已集成 |
| ADR-0006 | Auth：JWT + httpOnly Cookie | 无状态 Serverless 友好，防 XSS |
| ADR-0007 | 邮件：Resend + idempotency key | Resend 免费额度 100/天，idempotency key 防重复发送 |
| ADR-0008 | 采集：HTTP fetch + DB 快照 | 本期默认测试包，真实抓取可行性 R-010 专项验证 |
