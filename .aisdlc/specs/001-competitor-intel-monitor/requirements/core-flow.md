---
title: 产品核心链路图 — 竞品情报监控代理 MVP（收敛版）
status: draft
---

> 基于收敛后的 `prd.md`（三大核心亮点 + UR-1~UR-7 优先级：P0 必做 / P1 也做 / P2 本期不做）绘制。
> 标记说明：★ = 三大核心亮点节点（黄色高亮）；〔UR-x〕= 对应用户需求；灰色 = 基本功能/系统；绿色 = 落盘存储。

## 1. 端到端产品链路（收敛版）

```mermaid
flowchart TD
    User([用户]) --> Auth["注册 / 登录 + 会话<br/>〔UR·基础〕"]

    subgraph L1["★ 信息收集层 · 因人而异的入口〔亮点1〕"]
        direction TB
        Onb["Onboarding 表单<br/>选择角色 → 自动配默认权重"]
        Role["角色标签（单选，可扩展自定义）<br/>PM · 市场 · 创始人 · 投资人"]
        Info["信息标签权重（按角色默认/可调整）<br/>定价 · 功能 · 更新日志<br/>招聘 · 营销活动 · 合规条款"]
        Profile[("用户画像<br/>角色 + 权重向量<br/>设置可随时更改")]
        Onb --> Role --> Profile
        Onb --> Info --> Profile
    end
    Auth --> Onb

    subgraph BASE["监控与采集（基本功能 + 系统调度）"]
        direction TB
        Targets["监控目标管理<br/>竞品 URL + 采集方式<br/>手动即时触发/固定时间<br/>〔UR-1 · P0〕"]
        Trigger{{"采集触发"}}
        Cron["每日定时自动采集<br/>Vercel Cron · 无需人工<br/>〔UR-3 · P0〕"]
        Manual["手动即时触发<br/>手动点击立即检测"]
        Diff["变化检测<br/>URL 快照 diff · 去噪"]
        Targets --> Trigger
        Trigger --> Cron --> Diff
        Trigger --> Manual --> Diff
    end
    Auth --> Targets

    subgraph L2["★ 信息匹配层 · AI 定义价值 + 精准匹配〔亮点2〕"]
        direction TB
        Define["AI 打标<br/>六大信息标签"]
        Tag["信息打标<br/>定价/功能/更新日志/招聘/营销活动/合规条款"]
        Analyze["AI 分析（真实大模型）<br/>What / Why / 个性化 Action〔UR-5〕<br/>优先级三档 / 原文锚点"]
        Match{{"人—信息匹配<br/>信息标签权重"}}
        Inbox["★ 情报 Inbox 双栏工作区<br/>晨报/核心池/全部 · 角色快切<br/>Inspector：详情 + 深度对话<br/>状态：未读/已读/归档〔UR-4〕"]
        Define --> Tag --> Analyze --> Match --> Inbox
    end
    Diff --> Define
    Profile -. 提供画像 .-> Match

    subgraph OUT["情报触达与消费"]
        direction TB
        Notify["主动通知（邮件）<br/>紧急 / 高匹配情报<br/>去重 + 频控 · 可开关<br/>〔UR-6 · P1〕"]
        Detail["Inspector 情报详情 + 查看原文 + 核心池"]
        ChatPanel["★ Inspector 深度对话<br/>多情报引用 · 多会话"]
        Quote["★ 引用一条/多条情报 / 引用范围"]
        Chat["★ AI 多轮深度对话〔亮点3〕<br/>跨情报联合分析 · 资料不足坦白"]
        Persist[("多会话持续落盘<br/>直到用户主动终止")]
        Feedback["情报反馈打标 + 模块定位<br/>有用 → 自动入核心池<br/>〔UR-7 · P1〕"]
        Detail -->|引用到深度对话| ChatPanel
        ChatPanel --> Quote --> Chat --> Persist
        Detail --> Feedback
    end
    Inbox --> Notify
    Inbox --> Detail
    Notify -. 邮件内链接回流 .-> Detail
    Feedback -. 反哺个性化权重（演进） .-> Profile

    classDef highlight fill:#FFF3CD,stroke:#E0A800,stroke-width:2px,color:#663C00;
    classDef base fill:#E9ECEF,stroke:#ADB5BD,color:#343A40;
    classDef store fill:#D1E7DD,stroke:#0F5132,color:#0F5132;

    class Onb,Role,Info,Define,Tag,Analyze,Match,Inbox,Quote,Chat,ChatPanel highlight;
    class Auth,Targets,Trigger,Cron,Manual,Diff,Notify,Detail,Feedback base;
    class Profile,Persist store;
```

## 2. 链路分段说明

| 阶段 | 环节 | 优先级 | 对应需求 |
|---|---|---|---|
| 入口 | 注册/登录 → ★Onboarding 画像（角色+信息标签权重） | P0 | 亮点1 |
| 监控 | 监控目标管理（竞品+赛道+绑定测试包） | P0 | UR-1 |
| 采集 | 每日定时自动采集(Cron) + 手动即时触发 → 变化检测去噪 | P0 | UR-3 |
| 匹配 | ★AI 价值定义与打标 → AI 分析(个性化 Action) → 人-信息匹配 → ★个性化 Inbox(含归档) | P0 | 亮点2 / UR-4 / UR-5 |
| 触达 | 主动通知（邮件推送重点/紧急情报） | P1 | UR-6 |
| 消费 | Inspector 详情溯源 → ★引用式多轮深度对话（Inspector 内嵌，多情报/多会话） | P1 | 亮点3 |
| 聚焦 | 核心信息池视图（手动/反馈「有用」自动加入） | P1 | UR-7 延伸 |
| 改进 | 情报反馈打标落库（权重反哺属演进） | P1 | UR-7 |

## 3. 三大核心亮点一句话定位

| 层 | 亮点 | 一句话 |
|---|---|---|
| ★ 信息收集层 | 角色标签 + 信息标签权重 | 注册即建画像——「我是谁、我更关注什么」，有重点有取舍地为不同产品/岗位定制信息入口。 |
| ★ 信息匹配层 | AI 打标 + 信息标签匹配 | AI 按六大信息标签识别网页变化，再按角色与权重把最相关的情报重点推给对的人。 |
| ★ 信息消费层 | 引用式深度对话 | 在 Inbox Inspector 内引用一条或多条情报多轮深挖，支持多会话与跨情报联合分析，二次萃取价值。 |

## 4. 边界说明

- P2 不在链路内：UR-2「竞品自动推荐（自动发现监控目标）」列为后续演进。
- 「其它领域降权保留不屏蔽」体现「有重点、有取舍但不制造信息茧房」（`prd.md` 规则-9）。
- 画像变更即时生效于匹配层排序（规则-10）；打标/分析/对话均**仅基于原文**作答，禁止臆造（规则-3/4）。
- 系统级节点无独立页面：`/api/cron/analyze`（UR-3 定时）、`/api/notify`（UR-6 邮件）。
