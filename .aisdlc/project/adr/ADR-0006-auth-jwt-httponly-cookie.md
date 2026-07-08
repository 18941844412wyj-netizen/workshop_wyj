---
id: ADR-0006
title: 认证会话：httpOnly Cookie 承载签名 JWT
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

需最简注册/登录 + 会话保持（单账号 MVP，不做多租户/权限矩阵）。Serverless 无常驻内存，会话须无状态或存 DB。Demo 现为纯前端内存态，需替换为真实持久化。

## Decision

**httpOnly + Secure Cookie 承载签名 JWT**（`SESSION_SECRET`）；密码用 bcrypt/scrypt 哈希存 Neon；受保护 `/api/*` 与业务页校验 cookie（规则-6 / 异常-1）。单账号，不做数据隔离。

## Consequences

- 正面：无状态最贴合 Serverless（无需会话存储往返），实现最快；哈希存储满足最低安全底线；httpOnly 抵御 XSS 读取 token。
- 负面/约束：JWT 主动失效需额外机制（MVP 不做）；密钥轮换需重签。

## Alternatives considered

- Supabase Auth：现成但引入全家桶，与 ADR-0001 Neon 选型冲突——不选。
- DB session 表 + 随机 token：每请求多一次 DB 往返，MVP 无必要——不选。
- localStorage 存 token：易受 XSS——不选。

## Evidence / References

`demo/.../mockData.ts`（现内存态 login/register）；`requirements/prd.md` 规则-6 / 异常-1；`design/research.md` T7。
