---
id: ADR-0002
title: 部署形态与前端栈：Vite SPA + Vercel Serverless Functions
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

需求要求「前后端分离 + 可部署 + 浏览器访问」的 3 天 MVP。已有可交互 Demo 采用 Vite 8 + React 19 + react-router 7（SPA），页面/组件/数据模型齐备，是 SSOT 反写来源。Vercel 支持框架无关的 `/api/*` Serverless Functions 与 `vercel.json`（rewrites/crons）。

## Decision

**沿用 Vite SPA（静态构建，Vercel CDN）+ Vercel Serverless Functions（`/api/*`）**。`vercel.json` 配 SPA rewrites 回退与 `crons`。前端复用 Demo 组件与类型，仅把内存 mock 替换为真实 `/api` 调用。

## Consequences

- 正面：最大化复用已验证 Demo，避免迁移返工，契合 3 天工时（R-002）；`/api` 天然承载 auth/targets/analyze/cron/insights/chat/notify。
- 负面/约束：相比 Next.js，SSR/边缘渲染/一体化 DX 较弱；SPA 路由需 rewrites 处理。

## Alternatives considered

- 迁移 Next.js（App Router）：全栈/Cron DX 更好，但需重写路由与页面，3 天内风险高——列为后续演进。
- 前后端独立部署：增加跨域与运维复杂度——不选。

## Evidence / References

`demo/package.json`、`demo/src/prototypes/001-competitor-intel-monitor/`；`requirements/prd.md` §9 / R-002；`design/research.md` T8。
