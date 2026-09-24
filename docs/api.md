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

修改 Web 登录密码：

```bash
curl -X POST http://localhost:8310/api/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"oldpassword","newPassword":"newpassword123"}'
```

密码会以 scrypt 哈希保存到 `~/.rcc/auth.json`。修改成功后现有 Web Token 失效，需要重新登录；本地 `~/.rcc/local.token` 不受影响。

---

### REST API

#### 获取/保存 Web 设置

```
GET /api/settings
POST /api/settings
```

`POST /api/settings` 请求体：

```json
{
  "settings": {
    "fileBrowserDefaultPath": "/",
    "shellDefaultCwd": "/",
    "newConversationDefaultDir": "~",
    "uiStyle": "studio",
    "colorTheme": "aurora",
    "iconStyle": "sharp",
    "language": "zh",
    "fontSize": 13
  }
}
```

设置会持久化到 `~/.rcc/web-settings.json`（权限 600）。默认外观为 Studio + Aurora + Material（`iconStyle: "sharp"`）。首次打开新版 Web 端时，如果后端尚无设置文件，前端会把当前 `localStorage` 设置迁移到后端。

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

#### 获取 Agent 历史项目

```
GET /api/projects?agent=claude
GET /api/projects?agent=codex
GET /api/projects?agent=grok
GET /api/projects?agent=grok
```

#### 获取项目下的历史会话

```
GET /api/sessions/:projectId?agent=claude
GET /api/sessions/:projectId?agent=codex
```

#### 读取文档（无需认证）

```
GET /docs                  # 文档列表
GET /docs/:name            # 读取指定文档（如 usage.md）
```

#### 文件系统（需认证）

```
GET /api/fs/list?path=~&hidden=false
```

响应：`{ path, entries: [{ name, type, size, mtime, ext }] }`

- `type`：`"dir"` | `"file"`
- 白名单路径：默认 `/`（可通过 `FS_ROOTS` 扩展）

```
GET /api/fs/read?path=/path/to/file&maxBytes=102400
```

响应：
- 文本：`{ path, type: "text", content, truncated, size }`
- 图片：`{ path, type: "image", dataUrl, size }`（base64 data URL）
- 超限/不支持：`{ path, type: "image_too_large"|"unsupported", size }`

```
GET /api/fs/stat?path=/path/to/file
```

响应：`{ path, name, type, size, mtime, mode }`

```
POST /api/fs/mkdir
```

请求：`{ "path": "/target/dir", "name": "new-folder" }`
响应：`{ path, name, type: "dir", size, mtime, mode }`

```
POST /api/fs/upload?path=/target/dir
```

请求：`application/octet-stream`，请求体为文件原始字节，文件名 URL 编码后放在 `X-Filename-Encoded`（兼容 `X-Filename`）header。服务端流式写入同目录临时文件，完成后重命名；同名文件自动加 `-1`、`-2` 后缀，中断的上传不会留下残缺文件。单个文件上限 10 GB，超出返回 `413`；声明大小超过磁盘剩余空间返回 `507`。
响应：`{ path, name, type, size, mtime, mode }`

```
POST /api/upload
```

终端粘贴/上传的图片和文件，保存到 `~/.rcc/uploads/`，响应 `{ path, filename }`。大小限制同上。

```
GET /api/fs/download?path=/path/to/file
```

响应：二进制文件流（`Content-Disposition: attachment`）。除 `Authorization` header 外也支持 `?token=`，便于浏览器直接下载。

#### HTTP 终端回退（需认证）

当接入层不支持 WebSocket Upgrade 时，Web 端会自动使用这些 HTTP 长轮询接口：

```
POST /api/terminal/start
POST /api/terminal/:sessionId/attach
POST /api/terminal/:sessionId/input
POST /api/terminal/:sessionId/resize
POST /api/terminal/:sessionId/kill
POST /api/terminal/:sessionId/delete
POST /api/terminal/:sessionId/rename
GET  /api/terminal/:sessionId/poll?cursor=0&wait=20000

POST /api/shell/start
POST /api/shell/input
POST /api/shell/resize
POST /api/shell/kill
GET  /api/shell/poll?cursor=0&wait=20000
```

`poll` 返回 `{ output, cursor, reset, alive, exitCode }`；客户端用返回的 `cursor` 继续下一次长轮询。`wait` 最大 25000ms。
`kill` 和 `delete` 可重复调用；目标已不存在时返回成功且不产生副作用。终端输入接口天然非幂等，客户端不会自动重试输入请求。

---

### WebSocket API

连接：`ws://<host>:<port>/ws?token=<token>`

连接后服务端立即推送：`{"type":"session_list","sessions":[...]}`

#### 客户端 → 服务端

| 消息类型 | 说明 | 参数 |
|---------|------|------|
| `start` | 创建新会话。`agent` 为 `claude` / `codex` / `grok`；`extraArgs` 为透传给 Agent CLI 的参数字符串（按 shell 规则拆分，不做变量展开）；相同 `requestId` 的重复请求会接入已创建的会话 | `workingDir`, `name`, `agent?`, `resumeSessionId?`, `extraArgs?`, `requestId?`, `cols`, `rows` |
| `attach` | 接入已有会话 | `sessionId` |
| `resize` | 调整终端尺寸 | `cols`, `rows` |
| `shell_start` | 接入共享前台终端，必要时创建 | `cwd`, `cols`, `rows` |
| `shell_input` | 写入共享终端 stdin | `data` |
| `shell_resize` | 按当前客户端尺寸调整共享终端 | `cols`, `rows` |
| `shell_kill` | 关闭共享终端 | — |
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
| `shell_replay_start` / `shell_replay_end` | 共享终端 scrollback 回放边界 |
| `shell_ready` | 共享终端已接入，含 `cwd` |
| `shell_exit` | 共享终端已退出，含 `exitCode` |
| `shell_error` | 共享终端错误信息 |

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

Change the Web login password:

```bash
curl -X POST http://localhost:8310/api/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"oldpassword","newPassword":"newpassword123"}'
```

The password is stored as a scrypt hash in `~/.rcc/auth.json`. After a successful change, existing Web tokens are invalidated and the browser must sign in again; the local `~/.rcc/local.token` is unaffected.

---

### REST API

#### Get / Save Web Settings

```
GET /api/settings
POST /api/settings
```

`POST /api/settings` body:

```json
{
  "settings": {
    "fileBrowserDefaultPath": "/",
    "shellDefaultCwd": "/",
    "newConversationDefaultDir": "~",
    "uiStyle": "studio",
    "colorTheme": "aurora",
    "iconStyle": "sharp",
    "language": "en",
    "fontSize": 13
  }
}
```

Settings are persisted to `~/.rcc/web-settings.json` (chmod 600). The default appearance is Studio + Aurora + Material (`iconStyle: "sharp"`). On first launch with no backend settings file, the Web client migrates the current `localStorage` settings to the backend.

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

#### Get Agent History Projects

```
GET /api/projects?agent=claude
GET /api/projects?agent=codex
```

#### Get Sessions in a Project

```
GET /api/sessions/:projectId?agent=claude
GET /api/sessions/:projectId?agent=codex
```

#### Read Documentation (no auth required)

```
GET /docs                  # List docs
GET /docs/:name            # Read a doc (e.g. usage.md)
```

#### File System (auth required)

```
GET /api/fs/list?path=~&hidden=false
```

Response: `{ path, entries: [{ name, type, size, mtime, ext }] }`

- `type`: `"dir"` | `"file"`
- Whitelist roots: `/` by default (extendable via `FS_ROOTS`)

```
GET /api/fs/read?path=/path/to/file&maxBytes=102400
```

Response:
- Text: `{ path, type: "text", content, truncated, size }`
- Image: `{ path, type: "image", dataUrl, size }` (base64 data URL)
- Too large / unsupported: `{ path, type: "image_too_large"|"unsupported", size }`

```
GET /api/fs/stat?path=/path/to/file
```

Response: `{ path, name, type, size, mtime, mode }`

```
POST /api/fs/mkdir
```

Request: `{ "path": "/target/dir", "name": "new-folder" }`
Response: `{ path, name, type: "dir", size, mtime, mode }`

```
POST /api/fs/upload?path=/target/dir
```

Request: `application/octet-stream` with the raw file bytes as the body and the URL-encoded filename in the `X-Filename-Encoded` header (`X-Filename` also accepted). The server streams into a temporary file in the same directory and renames it when complete; name clashes get `-1`, `-2` suffixes and interrupted uploads leave no partial file. Max 10 GB per file (`413` beyond that); `507` if the declared size exceeds free disk space.
Response: `{ path, name, type, size, mtime, mode }`

```
POST /api/upload
```

Images/files pasted or uploaded from the terminal are saved to `~/.rcc/uploads/`. Response: `{ path, filename }`. Same size limits apply.

```
GET /api/fs/download?path=/path/to/file
```

Response: binary file stream (`Content-Disposition: attachment`). Besides the `Authorization` header, `?token=` is accepted so browsers can download directly.

#### HTTP Terminal Fallback (auth required)

When the access layer does not support WebSocket Upgrade, the Web client automatically uses these HTTP long-polling endpoints:

```
POST /api/terminal/start
POST /api/terminal/:sessionId/attach
POST /api/terminal/:sessionId/input
POST /api/terminal/:sessionId/resize
POST /api/terminal/:sessionId/kill
POST /api/terminal/:sessionId/delete
POST /api/terminal/:sessionId/rename
GET  /api/terminal/:sessionId/poll?cursor=0&wait=20000

POST /api/shell/start
POST /api/shell/input
POST /api/shell/resize
POST /api/shell/kill
GET  /api/shell/poll?cursor=0&wait=20000
```

`poll` returns `{ output, cursor, reset, alive, exitCode }`; clients pass the returned `cursor` to the next long-poll request. `wait` is capped at 25000ms.
`kill` and `delete` are safe to repeat; missing targets return success without side effects. Terminal input is naturally non-idempotent, so clients do not retry input requests automatically.

---

### WebSocket API

Connect: `ws://<host>:<port>/ws?token=<token>`

On connect, the server immediately sends: `{"type":"session_list","sessions":[...]}`

#### Client → Server

| Message type | Description | Parameters |
|-------------|-------------|------------|
| `start` | Create new session. `agent` is `claude` / `codex` / `grok`; `extraArgs` is a string of args passed to the agent CLI (split with shell quoting rules, no variable expansion); repeated requests with the same `requestId` attach to the session already created | `workingDir`, `name`, `agent?`, `resumeSessionId?`, `extraArgs?`, `requestId?`, `cols`, `rows` |
| `attach` | Attach to existing session | `sessionId` |
| `resize` | Resize terminal | `cols`, `rows` |
| `shell_start` | Attach to the shared foreground terminal, creating it if needed | `cwd`, `cols`, `rows` |
| `shell_input` | Write to shared terminal stdin | `data` |
| `shell_resize` | Resize shared terminal for the current client | `cols`, `rows` |
| `shell_kill` | Close the shared terminal | — |
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
| `shell_replay_start` / `shell_replay_end` | Shared terminal scrollback replay boundaries |
| `shell_ready` | Shared terminal is ready, includes `cwd` |
| `shell_exit` | Shared terminal exited, includes `exitCode` |
| `shell_error` | Shared terminal error message |

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
