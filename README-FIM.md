# TIMBot-WS FIM 定制版

基于 [TIMBot-WS](https://github.com/Tencent-RTC/TIMBot-WS) 官方插件的定制版本，新增**远端登录获取 UserSig** 功能。

## 与原版的区别

| 特性 | 原版 | FIM 定制版 |
|------|------|-----------|
| UserSig 获取 | 手动填静态签名，过期需重新配置 | 自动从服务端登录接口获取，过期自动续签 |
| UserID | 必须手动配置 | 可从登录接口自动获取 |
| 配置项 | sdkAppId + userId + userSig | sdkAppId + sigEndpoint + sigUsername + sigPassword |

## 前置条件

- OpenClaw >= 2026.3.24
- Node.js >= 18
- npm
- 你的 Go 服务端提供登录接口：`POST /login/password`

## 快速安装

```bash
# 克隆仓库
git clone git@github.com:wqcd/TIMBot-WS.git
cd TIMBot-WS

# 一键安装（编译 + 安装 + 配置）
python3 install.py
```

交互式安装会依次要求输入：
1. 腾讯 IM SDKAppID
2. 是否使用远端登录（选是）
3. 登录接口地址
4. 登录账号
5. 登录密码

脚本会自动调用登录接口获取 `user_id`，无需手动填写。

### 命令行一步到位（非交互式）

```bash
python3 install.py \
  --sdk-app-id 16000xxxxx \
  --sig-endpoint http://192.168.1.100:8080/login/password \
  --sig-username myuser \
  --sig-password mypass
```

### 更新插件

```bash
cd TIMBot-WS
git pull
python3 install.py
```

### 卸载

```bash
python3 install.py --uninstall
```

## 手动安装

如果 `install.py` 不可用，可以手动操作：

```bash
cd TIMBot-WS

# 1. 安装依赖
npm install

# 2. 提取 IM SDK（首次需要）
mkdir -p im-node-sdk-dist
npm pack timbot-ws@2026.4.7-beta.1
tar -xzf timbot-ws-*.tgz
cp -rf package/dist/im-sdk-bundle/* im-node-sdk-dist/
rm -rf package timbot-ws-*.tgz

# 3. 编译
npm run build

# 4. 修复 warning
echo '{"type":"module"}' > dist/im-sdk-bundle/package.json

# 5. 安装到 OpenClaw（会卡住，出现 Linked plugin path 后 Ctrl+C 即可）
openclaw plugins install -l $(pwd)

# 6. 编辑配置
openclaw config edit
```

## 配置说明

在 `~/.openclaw/openclaw.json` 中配置：

```json
{
  "channels": {
    "timbot-ws": {
      "enabled": true,
      "sdkAppId": "你的腾讯IM应用ID",
      "sigEndpoint": "http://你的Go服务地址/login/password",
      "sigUsername": "登录账号",
      "sigPassword": "登录密码"
    }
  }
}
```

### 配置项

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `sdkAppId` | 是 | 腾讯云 IM SDKAppID |
| `userId` | 否 | 机器人 UserID，不填则从登录接口自动获取 |
| `sigEndpoint` | 二选一 | 登录接口完整 URL |
| `sigUsername` | 二选一 | 登录账号 |
| `sigPassword` | 二选一 | 登录密码 |
| `userSig` | 二选一 | 静态 UserSig（不使用远端登录时填写） |

> `sigEndpoint` + `sigUsername` + `sigPassword` 优先于静态 `userSig`。

### 可选配置

```json
{
  "channels": {
    "timbot-ws": {
      "streamingMode": "off",
      "typingText": "正在思考中...",
      "typingDelayMs": 1000,
      "fallbackPolicy": "strict",
      "overflowPolicy": "stop",
      "dm": {
        "policy": "open",
        "allowFrom": ["*"]
      }
    }
  }
}
```

## Go 服务端接口要求

你的 Go 服务只需提供登录接口，返回 UserSig：

```
POST /login/password
Content-Type: application/json

Request:
{ "username": "xxx", "password": "xxx" }

Response:
{
  "code": 0,
  "message": "请求成功！",
  "results": {
    "jwt": "token...",
    "sig": "eJyrVgrx...",
    "user_id": "administrator"
  }
}
```

- `results.sig` — UserSig，必填
- `results.user_id` — 自动用作 `userId`，选填

## 启动与验证

```bash
# 前台启动（调试用，看日志）
openclaw gateway run --verbose --force

# 后台启动
nohup openclaw gateway run --verbose --force > ~/openclaw.log 2>&1 &
```

启动成功后日志中会看到：

```
[timbot-ws] fetching userSig via login: POST http://...
[timbot-ws] userSig fetched successfully (length=xxx)
[ws-transport] login: userID=xxx, sdkAppId=xxx
[ws-transport] login successful
[ws-transport] SDK ready
```

看到 `SDK ready` 说明已连接腾讯 IM，可以正常收发消息。

## 消息收发流程

```
用户 (腾讯IM客户端) → 腾讯IM云 → WebSocket长连接 → timbot-ws → OpenClaw → AI模型 → 回复
```

- **收消息**：自动，通过 WebSocket 实时接收，无需公网 IP
- **发消息**：AI 自动回复，或通过命令 `openclaw send --channel timbot-ws --to "userId" "消息内容"`
- **群消息**：需要 @机器人 才会触发回复

## UserSig 自动续签

UserSig 过期时：
1. 腾讯 IM SDK 触发 `KICKED_OUT_USERSIG_EXPIRED` 事件
2. `WsTransport._relogin()` 自动调用 `userSigProvider`
3. Provider 重新 POST 你的登录接口获取新 sig
4. 用新 sig 重新连接，整个过程自动完成

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| `npm pack` 失败 | 检查网络，或手动下载 npm 包 |
| `MODULE_TYPELESS_PACKAGE_JSON` warning | `echo '{"type":"module"}' > dist/im-sdk-bundle/package.json` |
| `openclaw plugins install` 卡住 | 出现 `Linked plugin path` 后 Ctrl+C，已安装成功 |
| `userSigProvider returned empty` | 检查登录接口是否返回 `results.sig` 字段 |
| `login failed: code=xxx` | 检查账号密码是否正确 |
| `initial sig fetch failed` | 检查 sigEndpoint 地址是否可达 |
| 连接后收不到消息 | 检查 `dm.policy` 配置和 `allowFrom` |
| 群消息不回复 | 需要在群里 @机器人 |

## 文件结构

```
TIMBot-WS/
├── install.py              # 一键安装脚本
├── index.ts                # 插件入口
├── src/
│   ├── types.ts            # 类型定义（含 sigEndpoint/sigUsername/sigPassword）
│   ├── config-schema.ts    # 配置 schema
│   ├── accounts.ts         # 账号解析
│   ├── channel.ts          # 通道主逻辑（含远端登录 provider）
│   ├── ws-transport.ts     # WebSocket 传输层（含 resolveUserSig + relogin）
│   ├── monitor.ts          # 消息收发处理
│   └── ...
├── im-node-sdk-dist/       # Node.js IM SDK（gitignore，需提取）
└── dist/                   # 编译输出
```

## 修改记录

基于官方 `timbot-ws@2026.4.7-beta.1` 修改：

1. **`types.ts`** — 新增 `sigEndpoint`、`sigUsername`、`sigPassword` 类型
2. **`config-schema.ts`** — 新增三个配置字段定义
3. **`accounts.ts`** — `configured` 判断支持远端登录配置
4. **`ws-transport.ts`** — 新增 `userSigProvider` + `resolveUserSig()`，login/relogin 动态获取 sig
5. **`channel.ts`** — 构建 `userSigProvider`，POST 登录接口获取 sig + 自动解析 user_id
6. **`install.py`** — 一键安装脚本，含自动提取 SDK bundle、交互式配置
