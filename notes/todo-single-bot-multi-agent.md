# TODO: 单机器人 Multi-Agent 支持

## 问题描述

timbot-ws 目前**不支持单机器人的 multi-agent 模式**。

原因：腾讯 IM Node SDK 在单进程中只能创建一个 IM 实例（`TIM.create()` 是单例模式），无法同时登录多个账号。而 multi-agent 需要多个独立的机器人账号来区分不同的 AI 助手。

## 现状

- timbot（Webhook 版）支持多账号：因为 Webhook 是无状态的，每个请求可以独立处理
- timbot-ws（WebSocket 版）单进程只能维护一个 IM 连接，只能登录一个账号

## 解决方案

### 方案 A：IM SDK Node 版本支持多实例

**优势：**
- 架构简单，无需子进程管理
- 资源共享，性能更好
- 代码改动较小

**劣势：**
- 依赖腾讯 IM SDK 团队支持
- 时间不可控

**实施路径：**
1. 向 IM SDK 团队反馈需求：`TIM.create()` 支持多实例模式
2. 每个实例独立登录不同账号
3. 等 SDK 支持后，timbot-ws 改造为多实例模式

### 方案 B：Node 子进程方案

**优势：**
- 不依赖 SDK 改动，可自行实现
- 进程隔离，稳定性更好
- 各账号独立运行，互不影响

**劣势：**
- 架构复杂度增加
- 需要设计进程间通信机制
- 资源占用增加

**实施路径：**
1. 主进程作为调度器，管理多个子进程
2. 每个子进程运行一个 IM 实例，登录一个账号
3. 主进程通过 IPC（进程间通信）与子进程通信
4. 消息路由：主进程接收 OpenClaw 调度 → 转发给对应子进程 → 子进程处理并回复

**架构设计：**
```
┌───────────────────────────────────────────────────────┐
│                    主进程 (Orchestrator)               │
│  - 接收 OpenClaw channel API 调用                      │
│  - 管理子进程生命周期                                   │
│  - 路由消息到对应子进程                                 │
└───────────────────────────────────────────────────────┘
         │ IPC           │ IPC           │ IPC
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  子进程 A    │  │  子进程 B    │  │  子进程 C    │
│  @RBT#001   │  │  @RBT#002   │  │  @RBT#003   │
│  IM 实例 A   │  │  IM 实例 B   │  │  IM 实例 C   │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 临时解决方案

在正式方案实现前，用户可以：

1. **运行多个 OpenClaw 实例**：每个实例配置不同的 timbot-ws 账号
2. **使用 timbot（Webhook 版）**：如果需要 multi-agent，切换到 Webhook 版本
3. **单账号 + peer 路由**：使用 bindings 的 peer 匹配，将不同用户/群路由到不同 Agent（但无法实现"不同会话切换"的体验）

## 优先级

- **重要程度**：中高
- **紧急程度**：中（有 timbot Webhook 版作为替代方案）

## 相关文件

- `src/ws-transport.ts` - WebSocket 传输层
- `src/channel.ts` - Channel 插件定义
- `notes/multi-agent.md` - Multi-Agent 方案设计文档

## 备注

记录日期：2026-04-02

---

# TODO: tim_stream 模式限制

## 问题描述

timbot-ws 的 `tim_stream` 模式（使用 `TIMStreamElem` 发送流式消息）**目前不可用**。

## 原因

腾讯 IM Node SDK（tim-js-sdk）目前**不支持发送流式消息（TIMStreamElem）**。该功能只能通过服务端 REST API 实现

## 影响范围

| 流式模式 | 可用性 | 说明 |
|----------|--------|------|
| `off` | ✅ 可用 | 关闭流式，一次性发送最终消息 |
| `text_modify` | ✅ 可用 | 通过 SDK 的 modifyMessage 修改文本消息实现 |
| `custom_modify` | ✅ 可用 | 通过 SDK 的 modifyMessage 修改自定义消息实现 |
| `tim_stream` | ❌ 不可用 | SDK 不支持发送 TIMStreamElem |

## 建议

- 需要流式效果：使用 `text_modify` 或 `custom_modify` 模式
- 需要原生 TIMStreamElem：使用 timbot（Webhook 版），通过服务端 REST API 发送

## 后续计划

1. 观察 IM Node SDK 后续版本是否支持流式消息
2. 或考虑在 timbot-ws 中混用 REST API 来发送流式消息（但会破坏 WebSocket 纯净性）

记录日期：2026-04-02
