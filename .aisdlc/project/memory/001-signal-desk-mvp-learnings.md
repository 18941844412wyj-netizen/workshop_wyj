---
title: 项目知识沉淀 — Signal Desk MVP（001-competitor-intel-monitor）
source-spec: 001-competitor-intel-monitor
merge-back-date: 2026-07-09
status: final
---

## 概述

Signal Desk MVP 开发完成，此文件记录本 Spec 周期中积累的可复用知识、风险验证结论与后续演进建议，供后续 Spec 和项目维护参考。

---

## 一、技术决策与教训

### LLM 接入（GLM-4-Flash）
- **教训**：智谱 API 不支持 `strict json_schema`，OpenAI 的 Structured Outputs 规范在非 OpenAI 服务上需 JSON mode + Zod 兜底。
- **经验**：使用 Zod 解析 + 宽松匹配是比强制 strict 更健壮的方案；约需兜底代码约 30 行。
- **可复用**：`api/_lib/ai-analyzer.ts` 中的 schema → Zod 兜底模式可直接复用于后续 Spec。

### Vercel Serverless + Neon Postgres
- **教训**：Vercel Hobby 12 函数上限需严格控制 API 文件数量，多余函数需合并（已踩坑）。
- **教训**：Cron 在 Hobby 计划仅支持每日一次；分钟级需 Inngest 或升级 Pro。
- **经验**：`@neondatabase/serverless` 直接调用 Postgres，无需 ORM，适合小型 MVP；复杂查询需自行管理 SQL。

### 邮件通知（Resend）
- **教训**：Resend 免费账号测试模式只能发到已验证邮箱；生产需 `RESEND_ACCOUNT_EMAIL` 绕过或配置自定义发件域名。
- **经验**：idempotency key（`insight_id + user_id`）有效防止重复发邮件，建议作为所有通知类功能的默认模式。

### 变化检测去噪
- **经验**：两层去噪（行 diff 第1层 + AI isNoise 第2层）效果良好，纯样式/A-B 摇摆不报率高。
- **教训**：第1层 diff 需做文本归一化（去除多余空白，统一换行），否则假阳性率高。

---

## 二、风险验证结论

| 风险 | 结论 | 详情 |
|---|---|---|
| R-001 Neon 重启不丢数据 | ✅ 成立 | redeploy 后数据完整 |
| R-003 LLM Structured Outputs | ✅ 成立（有限制）| GLM-4-Flash JSON mode + Zod 兜底稳定运行 |
| R-004 去噪命中率 | ✅ 成立 | 测试包样式/A-B 用例均不报 |
| R-007 打标+个性化 | ✅ 成立 | 标签命中正确，切画像排序有差异 |
| R-008 Resend 邮件 | ✅ 成立（有限制）| 见邮件通知教训 |
| R-010 真实站点采集 | ⚠️ 部分成立 | 静态 fetch 可用，JS 注入未完整生产验证 → M1 专项 |

---

## 三、后续演进建议（M1 规划入口）

1. **真实站点 JS 注入采集**（R-010）：Playwright headless 链路需在生产环境验证，关注 Vercel 超时限制（10s/函数）。
2. **邮件发件域名**：配置自定义 DNS 域名解除测试模式限制。
3. **反馈反哺权重**：当前反馈落库但不影响权重排序；M1 可接入"有用率"影响个性化权重。
4. **Inngest 分钟级 Cron**：Inngest 已集成（`api/inngest.ts`），M1 可切换为分钟级采集。
5. **竞品自动推荐**（UR-2）：需搜索 API 接入，独立 Spec 规划。

---

## 四、可复用模块清单

| 模块 | 文件 | 可复用场景 |
|---|---|---|
| JWT Auth 中间件 | `api/_lib/auth.ts` | 所有需鉴权的 Serverless API |
| DB 连接（Neon）| `api/_lib/db.ts` | 后续 Spec 同数据库项目 |
| LLM 调用（JSON mode + Zod）| `api/_lib/ai-analyzer.ts` | 任何需结构化输出的 LLM 场景 |
| 邮件通知（Resend + 幂等）| `api/_lib/notifier.ts`, `mailer.ts` | 所有需发邮件的通知场景 |
| 变化检测两层去噪 | `api/_lib/change-detector.ts` | 任何网页内容监控场景 |
| 个性化排序算法 | `api/insights/index.ts` | 任何需按用户画像权重排序的场景 |
