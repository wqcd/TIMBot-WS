# timbot-ws - Tencent Cloud IM WebSocket Channel Plugin

OpenClaw 腾讯云 IM 通道插件（WebSocket 版）— 通过 WebSocket SDK 实现腾讯云即时通信 IM 智能机器人。


**Maintainer:** leochliu@tencent.com

---

- **English:** [README.en.md](./README.en.md)
- **中文：** [README.zh-CN.md](./README.zh-CN.md)

---

## 与 timbot（Webhook 版）的区别

| 特性 | timbot-ws (WebSocket) | timbot (Webhook) |
|------|----------------------|------------------|
| **部署要求** | 无需公网 IP | 需要公网 IP + HTTPS |
| **连接方式** | 长连接，主动连接腾讯 IM | 被动接收 Webhook 回调 |
| **适用场景** | 本地开发、内网部署、快速原型 | 生产环境、高并发、多实例 |
| **Multi-Agent** | 🚧 暂不支持单机器人多 Agent | ✅ 支持 |
| **流式消息** | ⚠️ 部分支持（text_modify/custom_modify） | ✅ 完整支持（含原生 TIMStreamElem） |

> ⚠️ **注意**：timbot-ws 当前不支持单机器人的 multi-agent 模式，如需此功能请使用 timbot（Webhook 版）。详见 [限制说明](#限制说明)。

---

**[Web Demo](https://web.sdk.qcloud.com/trtc/webrtc/v5/test/qer/openclaw-demo/index.html)** — 腾讯云 IM TIMBot 插件支持全平台，本页面仅供 Web 测试，请勿用于正式环境。

**[Full integration guide / 完整对外接入教程](https://cloud.tencent.com/document/product/269/128326)** — OpenClaw：微信小程序快速接入指南

---

## Changelog

### 2026.3.19

- fix: 群聊多机器人路由匹配（`AtRobots_Account`）
- feat: Web Demo 支持添加非好友成员入群

### 2026.3.12

- docs: 补充流式模式依赖上游 partial 输出的说明与可观测性日志
- chore: 添加调试配置命令与本地 webhook 测试脚本

### 2026.3.10

- feat: 流式消息支持，新增 `streamingMode` 配置（`off` / `text_modify` / `custom_modify` / `tim_stream`）
- feat: 流式失败兜底策略与 `typingText` 占位消息
- fix: 多项稳定性修复（API 响应判断、签名校验、流式协议适配等）

### 2026.3.5

- feat: 群聊支持 (Bot.OnGroupMessage)
- fix: 默认 DM 策略配置中补充 allowFrom 通配符
- fix: 群消息使用 botAccount 作为发送者
- fix: startAccount 的 promise 保持 pending 直到 abortSignal 触发

### 2026.3.4

- fix: 适配 OpenClaw 2026.3.x HTTP route API

### 2026.2.11

- docs: 更新 onboarding 引导和 README

### 2026.2.10

- feat: 添加 onboarding 引导向导，准备 npm 发布
- refactor: 增加 verbose 日志

### 2026.1.30

- feat: 初始实现 Tencent IM bot 支持
- feat: 添加 webhook token 校验
- feat: 添加 userSig 生成器
- feat: 项目更名为 OpenClaw
- fix: 忽略 [custom] 类型消息

---

## 限制说明

### tim_stream 模式不支持

timbot-ws 的 `tim_stream` 模式（原生 `TIMStreamElem` 流式消息）**不可用**。

**原因**：腾讯 IM Node SDK 目前不支持发送流式消息（`TIMStreamElem`），该功能只能通过服务端 REST API 实现。

**可用的流式模式**：
| 模式 | 可用性 | 说明 |
|------|--------|------|
| `off` | ✅ | 关闭流式，一次性发送最终消息 |
| `text_modify` | ✅ | 通过修改文本消息实现打字机效果 |
| `custom_modify` | ✅ | 通过修改自定义消息实现，前端自行渲染 |
| `tim_stream` | ❌ | SDK 不支持，请使用 timbot（Webhook 版） |

### 单机器人 Multi-Agent 不支持

timbot-ws 当前**不支持单机器人的 multi-agent 模式**。
