---
id: ADR-0007
title: 邮件通知：Resend + idempotency key 去重
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

UR-6（P1）要求对「紧急/高匹配」情报邮件主动推送，支持多邮箱、去重、可开关（规则-13）。需一个 Vercel 上可用的邮件发送服务。

## Decision

采用 **Resend**（Node SDK，密钥 `RESEND_API_KEY`）。对每条待推情报按 `用户+情报ID` 生成 **idempotency key**（24h 过期）发送以实现去重；多推送邮箱写入 `to[]`（≤50）；设置页的开关/推送时间/推送内容映射到发送逻辑（关闭则跳过）。发送失败不阻塞情报入库（异常-9），记「发送失败/可重试」。发件需验证域名（或测试用 `onboarding@resend.dev`）。

## Consequences

- 正面：免费额度（3000/月、100/天）足够 MVP；内置幂等键天然满足「同情报只推一次」，省去自建去重表；与 Vercel Functions 无缝。
- 负面/约束：限速约 5–10 req/s（团队共享）；免费档需验证 1 个域名。

## Alternatives considered

- SMTP + Nodemailer：需自管连接与去重——作为 Resend 不可用时替代。
- 站内通知/红点保底：R-008 不成立时的降级。

## Evidence / References

Resend《Account quotas & limits》《Send with Vercel Functions》《Send Email API》(idempotency key)；`requirements/prd.md` R-008 / 规则-13 / AC-015 / 异常-9；`design/research.md` T6。
