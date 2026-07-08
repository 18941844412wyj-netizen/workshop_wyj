---
id: ADR-0003
title: LLM 结构化输出：Structured Outputs（strict json_schema）+ Zod
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

核心价值要求 LLM 稳定产出「六大信息标签 + 五要素分析 + 三档优先级 + 原文锚点」的强结构结果（AC-004 / R-007）。legacy JSON mode 仅保证「合法 JSON」不保证 schema 合规（可能缺字段/幻觉枚举）。

## Decision

使用 **Structured Outputs（`response_format: json_schema` + `strict:true`）** 约束打标+分析输出；用 **Zod** 定义/校验 schema。要求：所有字段列入 `required`、每层 `additionalProperties:false`、可选字段用可空联合类型；处理 `refusal` 与 `finish_reason` 截断 → 标记「分析失败/可重试」。模型接入层封装（模型/密钥/超时可配）便于替换降级。对话链不用强 schema，改用 grounded system prompt。

Schema 字段：`labels[] / priority / whatChanged / whyItMatters / actionGeneral{销售,产品,营销} / actionPlan{按角色} / sourceAnchor / isNoise / noiseType`。

## Consequences

- 正面：100% schema 合规，直接支撑字段完整性与打标稳定性；可像 typed API 一样消费 AI 输出。
- 负面/约束：需目标模型支持 strict json_schema（gpt-4o-2024-08-06+ / 兼容 GPT-5 系）；轻微 token 开销。

## Alternatives considered

- legacy JSON mode + 校验重试：不保证 schema——作为不支持时的降级。
- 纯关键词规则打标：稳定但丢洞察——作为 R-007 不成立时的降级（规则+AI 辅助）。

## Evidence / References

OpenAI《Structured model outputs》《Function calling》；`requirements/prd.md` R-003 / R-007 / 规则-3 / AC-004；`design/research.md` T3 / T9。
