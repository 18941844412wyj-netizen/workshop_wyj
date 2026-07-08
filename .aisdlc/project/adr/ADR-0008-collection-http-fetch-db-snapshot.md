---
id: ADR-0008
title: 采集机制：真实站点 markdown 抓取 + JS 注入降级（测试包为默认输入）+ DB 存快照
status: Accepted
date: 2026-07-08
source_spec: 001-competitor-intel-monitor
---

## Context

产品语义是「用户填 URL → 系统自动抓取识别变化」。原始《生成MD测试用例》验证过 40+ 真实站点：默认「正常抓取 markdown」，部分站点（如 ihuiwa.com / klingai.com）常规方式抓不到，需 **JS 注入渲染再抓——判定规则：当获取的 markdown 数据 < 3 行时启用 JS 注入**。

约束：本期为 3 天 MVP，部署在 Vercel Serverless；运行时 FS 写入临时化（快照不可存 FS）；JS 注入/渲染需引入 headless 浏览器或第三方渲染服务，冷启动/超时（300s）有不确定性。原始《效果评估标准》要求以测试包（`ceshi/index.html` 基准 + `cases/Z-*.html` 变体，含 `x-test-version` 版本锚点）作为长期评估基准。

## Decision

- **采集层目标能力（忠于原始需求）**：`fetch(target.url)` → 提取正文为 **markdown**；**当 markdown < 3 行时触发 JS 注入/渲染降级**再抓一次；抽取可见文本进入两层 diff（ADR-0004）。
- **本期默认输入 = 测试包**：测试包作为静态资源随部署发布（或独立可访问 URL），演示中把监控目标 URL 映射到各 case 页，模拟「基准→变体」变化；测试包同时作为效果评估/回归基准。
- **快照持久化到 Neon（DB）**：目标首次抓取存基准快照；后续抓取新版本与库中上一快照做两层 diff → 生成候选。用 `x-test-version` 辅助对齐 Ground Truth。
- **真实抓取 + JS 注入的 Serverless 可行性列为验证项 R-010**：不阻塞本期核心闭环。

## Consequences

- 正面：采集链路（抓取→markdown 提取→(不足则 JS 注入)→存快照→diff）一次成型，忠于原始《生成MD测试用例》；本期用测试包默认输入规避真实站点反爬/渲染不确定性，3 天闭环不受阻；快照存 DB 满足持久化（规则-5）。
- 负面/约束：真实站点 JS 注入抓取依赖 headless/渲染服务，其 Serverless 可行性需 R-010 早期验证；不成立则降级为「仅静态 fetch + 测试包默认输入」，真实 JS 注入抓取转后续演进。

## Alternatives considered

- 本期即上真实 headless 抓取全量站点：忠于字面但引入新基础设施，3 天工时/部署复杂度风险高——不选，降为「能力入案 + R-010 验证 + 测试包默认」。
- 直接读打包内 fixture 文件（不走 HTTP）：更简单但偏离「URL 抓取」语义，扩展真实站点时返工——作为离线测试兜底。
- 快照存 FS/内存：Serverless 重启丢失——排除。

## Evidence / References

`yuanshixuqiu/Monitor 生成MD测试用例.md`（markdown 抓取 + <3 行触发 JS 注入规则）；`ceshi/index.html`（版本锚点/ZONE 注释）、`ceshi/cases/build-cases.mjs`；`requirements/solution.md` 边界 1 / `prd.md` 规则-5；`design/research.md` T5 / R-010。
