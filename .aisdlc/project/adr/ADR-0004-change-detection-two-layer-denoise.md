---
id: ADR-0004
title: 变化检测两层去噪（结构层 diff + 语义层 LLM）
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

采集输入为测试包 HTML（基准 + 变体）。需在「基准 vs 变体」中捕获真信号（定价/功能/更新日志/招聘/营销/合规），同时不报噪音：纯 CSS 样式（Z-Noise）、A/B 摇摆（Z-AB）、幻觉诱饵/未上线（Z-Hallucination）。分析测试包发现：CSS 噪音不改可见文本；A/B 与幻觉诱饵会改可见文本（diff 必然捕获），需语义理解才能判噪。

## Decision

采用**两层过滤**：
1. **结构层**：抽取可见文本（剥离 style/script/注释/属性）→ 空白归一化 → 区块/行 diff → 输出「变化候选」。天然过滤纯 CSS 噪音。
2. **语义层（LLM）**：打标时判定 `isNoise/noiseType`（A/B 摇摆、幻觉诱饵、未上线预告）→ 噪音候选不生成情报（规则-2）。

采集抓取静态源码（不执行 A/B 内联脚本）。

## Consequences

- 正面：确定性噪音交便宜的文本 diff，需理解的噪音交 LLM，职责清晰；与测试包真/伪信号分布对齐，最大化 Recall、抑制 FP。
- 负面/约束：语义层依赖 LLM 判断质量（见 R-004/R-006）。

## Alternatives considered

- 原始 HTML 直接 diff：CSS/属性变化误报——不选。
- 纯规则过滤 A/B/幻觉：脆弱——作为兜底（正文抽取+归一化预处理）。
- headless 渲染后 DOM 快照 diff：A/B 脚本执行致抖动且 Serverless 重——不选。

## Evidence / References

`ceshi/cases/build-cases.mjs`、`ceshi/index.html`（ZONE 注释/expected）；`requirements/prd.md` 规则-2 / R-004 / 异常-3；`design/research.md` T4。
