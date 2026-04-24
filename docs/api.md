# API 文档

## 认证

RemoteCC 使用 Bearer Token 认证。

### 登录获取 Token

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**响应：**

```json
{
  "token": "a1b2c3d4e5f6..."
}
```

- Token 有效期 30 天，存储在客户端 `localStorage`
- 后续请求在 Header 中携带：`Authorization: Bearer <token>`

---

## REST API

### 获取活跃会话列表

```http
GET /api/active-sessions
Authorization: Bearer <token>
```

**响应：**

```json
[
  {
    "sessionId": "uuid-...",
    "name": "project",
    "workingDir": "/paddle/project",
    "alive": true,
    "exitCode": null,
    "createdAt": 1700000000000,
    "lastActiveAt": 1700000060000,
    "logPath": "/root/.rcc/logs/uuid-....log",
    "socketPath": "/root/.rcc/sockets/uuid-....sock",
    "clientCount": 1
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 唯一 UUID |
| name | string | 会话显示名称 |
| workingDir | string | PTY 工作目录 |
| alive | boolean | PTY 进程是否存活 |
| exitCode | number\|null | 退出码，null 表示运行中 |
| createdAt | number | 创建时间戳（ms） |
| lastActiveAt | number | 最后活跃时间戳（ms） |
| logPath | string | 日志文件路径 |
| socketPath | string | Unix socket 路径 |
| clientCount | number | 当前连接的客户端数量 |

---

### 获取 Session 日志

```http
GET /api/session-log/:sessionId
Authorization: Bearer <token>
```

**响应：** `text/plain`，最后 9000 行的原始 PTY 输出（含 ANSI 转义码）。

---

### 获取 Claude 历史项目列表

```http
GET /api/projects
Authorization: Bearer <token>
```

**响应：**

```json
[
  {
    "id": "-paddle-project-my-app",
    "displayPath": "/paddle/project/my-app",
    "sessionCount": 3,
    "lastModified": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### 获取项目下的历史会话

```http
GET /api/sessions/:projectId
Authorization: Bearer <token>
```

**响应：**

```json
[
  {
    "sessionId": "abc-123-...",
    "projectId": "-paddle-project-my-app",
    "lastModified": "2024-01-01T00:00:00.000Z",
    "lastMessage": "帮我写一个 Python 脚本...",
    "messageCount": 42,
    "cwd": "/paddle/project/my-app"
  }
]
```

---

### 读取单个历史会话内容

```http
GET /api/session/:sessionId
Authorization: Bearer <token>
```

**响应：** JSONL 格式解析后的消息数组。

---

## WebSocket API

连接端点：

```
ws://<host>:<port>/ws?token=<token>
```

### 连接后

服务端立即推送当前会话列表：

```json
{ "type": "session_list", "sessions": [...] }
```

---

### 客户端 → 服务端

#### 创建新会话

```json
{
  "type": "start",
  "workingDir": "/paddle/project",
  "name": "my-session",
  "resumeSessionId": "",
  "cols": 80,
  "rows": 24
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| workingDir | 否 | 默认 `/paddle` |
| name | 否 | 默认为目录名 |
| resumeSessionId | 否 | Claude 历史会话 ID，填写后以 `--resume` 启动 |
| cols/rows | 否 | 终端尺寸，默认 80x24 |

> **去重机制**：同 `workingDir` + `resumeSessionId` 已有活跃 session 时，直接 attach，不创建新进程。

#### Attach 到已有会话

```json
{
  "type": "attach",
  "sessionId": "uuid-..."
}
```

Attach 后服务端会回放 500KB 的 scrollback buffer。

#### 调整终端大小

```json
{
  "type": "resize",
  "cols": 120,
  "rows": 30
}
```

#### 发送输入

直接发送字符串（非 JSON），作为 PTY stdin 输入：

```
hello world\n
```

或使用 input 类型：

```json
{
  "type": "input",
  "data": "hello"
}
```

#### 关闭会话（Kill PTY）

```json
{
  "type": "kill",
  "sessionId": "uuid-..."
}
```

#### 删除会话记录

```json
{
  "type": "delete",
  "sessionId": "uuid-..."
}
```

会先 kill PTY（如存活），再移除记录并广播更新。

#### 重命名会话

```json
{
  "type": "rename",
  "sessionId": "uuid-...",
  "name": "new-name"
}
```

#### 请求会话列表

```json
{ "type": "list" }
```

---

### 服务端 → 客户端

#### PTY 原始输出

非 JSON 字符串，直接写入 xterm.js：

```
\x1b[32mHello\x1b[0m World\r\n
```

#### 会话 ID 确认

```json
{
  "type": "session_id",
  "sessionId": "uuid-...",
  "name": "my-session",
  "alive": true
}
```

#### Scrollback 回放边界

```json
{ "type": "replay_start" }
// ... raw PTY data ...
{ "type": "replay_end" }
```

#### 会话列表更新

```json
{
  "type": "session_list",
  "sessions": [...]
}
```

任何会话状态变更（创建、结束、重命名、删除）都会广播给所有连接的客户端。

#### PTY 进程退出

```json
{
  "type": "exit",
  "exitCode": 0
}
```

#### 错误

```json
{
  "type": "error",
  "message": "Max sessions reached (20 alive)."
}
```

#### 被其他客户端顶替

```json
{ "type": "detached" }
```

---

## Unix Socket 协议

每个活跃 session 在 `~/.rcc/sockets/<sessionId>.sock` 提供 Unix domain socket。

连接后：
1. 服务端推送 scrollback buffer（原始 PTY 数据）
2. 客户端发送任意字节 → 写入 PTY stdin
3. PTY 输出广播给所有客户端（WS + Socket）

### OOB Resize 帧

通过特殊帧通知服务端调整 PTY 大小：

```
\x00RESIZE:<cols>:<rows>\n
```

例：`\x00RESIZE:120:30\n`

`rcc attach` 命令会在连接时和窗口大小变化时自动发送此帧。
