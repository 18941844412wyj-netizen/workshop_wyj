---
id: ADR-0005
title: 采集口径：每日定时 Cron + 手动即时触发（不承诺实时）
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

UR-3 要求「持续、自动化采集」（P0）。经调研 Vercel Cron：Hobby 档仅支持「每天一次」且按小时不精确（±59 分钟），更高频表达式部署即失败；Pro 才有分钟级。函数 `maxDuration` Hobby 上限 300s；若单次运行超间隔会触发并发重叠。原方案的「实时采集」在 Hobby 上不可交付。

## Decision

UR-3 自动采集统一为 **每日定时 Cron 自动采集**（对齐晨报语义，Hobby 免费即满足）；采集方式二选一为 **「手动即时触发 `/api/analyze`」/「固定时间采集（每日定时）」**；**不承诺分钟级「实时」**。Cron 路由用 `CRON_SECRET` 保护；处理遵循「分批 + 幂等（同目标同快照不重复生成）+ 防重叠（运行锁）」，单函数 ≤300s，目标多时分片。

## Consequences

- 正面：Hobby 免费即交付「无人工介入的每日情报产出」（AC-013）；采集形态确定、产品语义清晰，无付费/返工负担；消除 UR-3 技术不确定性（原 R-009/V-009 风险项已移除）。
- 负面/约束：不支持分钟级实时；每日触发时间不精确（小时级）。

## Alternatives considered

- 上 Pro（$20/人·月）拿分钟级 Cron：超出 MVP 成本必要性——后续演进。
- 纯外部调度器（Crontap/GitHub Actions）指向同一受保护路由：可高频，但引入额外系统——仅作演进/演示兜底。

## Evidence / References

Vercel《Cron Usage & Pricing》《Managing Cron Jobs》《Functions Limits》；`requirements/prd.md` 规则-11 / AC-013 / 异常-8；`design/research.md` T2。
