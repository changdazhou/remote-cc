# API 文档 / API Reference

[中文](#中文) | [English](#english)

---

## 中文

### 认证

所有 API 请求需携带 Bearer Token。

```bash
# 登录获取 Token
curl -X POST http://localhost:8310/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
# 返回: {"token":"..."}

# 后续请求携带 Token
curl -H "Authorization: Bearer <token>" http://localhost:8310/api/active-sessions
```

Token 有效期 30 天，存储在客户端 `localStorage`。

---

### REST API

#### 获取活跃会话列表

```
GET /api/active-sessions
```

响应：

```json
[{
  "sessionId": "uuid",
  "name": "paddle",
  "workingDir": "/paddle",
  "alive": true,
  "exitCode": null,
  "createdAt": 1700000000000,
  "lastActiveAt": 1700000060000,
  "logPath": "/root/.rcc/logs/uuid.log",
  "socketPath": "/root/.rcc/sockets/uuid.sock",
  "clientCount": 2
}]
```

#### 获取会话日志

```
GET /api/session-log/:sessionId
```

响应：`text/plain`，最后 9000 行原始 PTY 输出（含 ANSI 转义码）。

#### 获取 Claude 历史项目

```
GET /api/projects
```

#### 获取项目下的历史会话

```
GET /api/sessions/:projectId
```

#### 读取文档（无需认证）

```
GET /docs                  # 文档列表
GET /docs/:name            # 读取指定文档（如 usage.md）
```

---

### WebSocket API

连接：`ws://<host>:<port>/ws?token=<token>`

连接后服务端立即推送：`{"type":"session_list","sessions":[...]}`

#### 客户端 → 服务端

| 消息类型 | 说明 | 参数 |
|---------|------|------|
| `start` | 创建新会话 | `workingDir`, `name`, `resumeSessionId?`, `cols`, `rows` |
| `attach` | 接入已有会话 | `sessionId` |
| `resize` | 调整终端尺寸 | `cols`, `rows` |
| `kill` | 终止会话 | `sessionId` |
| `delete` | 删除会话记录 | `sessionId` |
| `rename` | 重命名会话 | `sessionId`, `name` |
| 原始字符串 | 键盘输入 → PTY stdin | — |

#### 服务端 → 客户端

| 消息类型 | 说明 |
|---------|------|
| 原始字符串 | PTY 输出，直接写入 xterm.js |
| `session_id` | 会话创建/接入确认，含 `sessionId`、`name` |
| `session_list` | 会话列表更新（任何变更时广播） |
| `replay_start` / `replay_end` | Scrollback 回放边界 |
| `exit` | PTY 进程退出，含 `exitCode` |
| `error` | 错误信息 |

---

### Unix Socket 协议

路径：`~/.rcc/sockets/<sessionId>.sock`

连接后服务端推送 scrollback buffer，之后为全双工 PTY 流。

**OOB Resize 帧**（调整终端尺寸）：

```
\x00RESIZE:<cols>:<rows>\n
```

示例：`\x00RESIZE:120:30\n`

---

## English

### Authentication

All API requests require a Bearer Token.

```bash
# Get token
curl -X POST http://localhost:8310/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
# Returns: {"token":"..."}

# Use token
curl -H "Authorization: Bearer <token>" http://localhost:8310/api/active-sessions
```

Tokens are valid for 30 days and stored in the client's `localStorage`.

---

### REST API

#### List Active Sessions

```
GET /api/active-sessions
```

Response:

```json
[{
  "sessionId": "uuid",
  "name": "paddle",
  "workingDir": "/paddle",
  "alive": true,
  "exitCode": null,
  "createdAt": 1700000000000,
  "lastActiveAt": 1700000060000,
  "logPath": "/root/.rcc/logs/uuid.log",
  "socketPath": "/root/.rcc/sockets/uuid.sock",
  "clientCount": 2
}]
```

#### Get Session Log

```
GET /api/session-log/:sessionId
```

Response: `text/plain`, last 9000 lines of raw PTY output (including ANSI escape codes).

#### Get Claude History Projects

```
GET /api/projects
```

#### Get Sessions in a Project

```
GET /api/sessions/:projectId
```

#### Read Documentation (no auth required)

```
GET /docs                  # List docs
GET /docs/:name            # Read a doc (e.g. usage.md)
```

---

### WebSocket API

Connect: `ws://<host>:<port>/ws?token=<token>`

On connect, the server immediately sends: `{"type":"session_list","sessions":[...]}`

#### Client → Server

| Message type | Description | Parameters |
|-------------|-------------|------------|
| `start` | Create new session | `workingDir`, `name`, `resumeSessionId?`, `cols`, `rows` |
| `attach` | Attach to existing session | `sessionId` |
| `resize` | Resize terminal | `cols`, `rows` |
| `kill` | Kill session PTY | `sessionId` |
| `delete` | Delete session record | `sessionId` |
| `rename` | Rename session | `sessionId`, `name` |
| Raw string | Keyboard input → PTY stdin | — |

#### Server → Client

| Message type | Description |
|-------------|-------------|
| Raw string | PTY output, written directly to xterm.js |
| `session_id` | Session created/attached, includes `sessionId`, `name` |
| `session_list` | Session list update (broadcast on any change) |
| `replay_start` / `replay_end` | Scrollback replay boundaries |
| `exit` | PTY process exited, includes `exitCode` |
| `error` | Error message |

---

### Unix Socket Protocol

Path: `~/.rcc/sockets/<sessionId>.sock`

On connect, the server sends the scrollback buffer, then full-duplex PTY stream.

**OOB Resize Frame**:

```
\x00RESIZE:<cols>:<rows>\n
```

Example: `\x00RESIZE:120:30\n`

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
