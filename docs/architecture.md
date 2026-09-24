# 架构说明 / Architecture

[中文](#中文) | [English](#english)

---

## 中文

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     客户端 (Browser)                     │
│  Vue 3 + xterm.js + WS 优先 / HTTP 回退                  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│               proxy.js（长期常驻进程）                   │
│  - 对外 HTTP/WS 服务（:8310）                           │
│  - Token 认证                                           │
│  - WS/HTTP 回退 + PTY 管理（pty-manager）                │
│  - 热重载：SIGUSR2 → 重启 app.js，不断 WS/PTY           │
└──────────────────────┬──────────────────────────────────┘
                       │ Unix Socket (/tmp/rcc-app.sock)
┌──────────────────────▼──────────────────────────────────┐
│               app.js（可热重启的业务层）                  │
│  - REST API（projects/sessions/fs/upload）              │
│  - 文件浏览器 API（/api/fs/*）                          │
└─────────────────────────────────────────────────────────┘
```

**热重载设计**：proxy.js 常驻，负责 WS 连接和 PTY 进程；app.js 处理业务逻辑，修改后可通过 `rcc-server reload` 无中断热重启。

### 核心模块

#### `server/proxy.js`

长期常驻进程，职责：
- 监听 HTTP/WS 端口，管理 token（Bearer Auth + local.token）
- WebSocket 连接全生命周期（含 PTY 消息路由），并为受限接入层提供 HTTP 回退路由
- 普通 HTTP 请求通过 Unix Socket 转发给 app.js
- `/api/active-sessions`、`/api/session-log`、`/api/terminal/*`、`/api/shell/*` 在 proxy 侧直接响应（依赖 pty-manager 内存状态）
- 监听 SIGUSR2 触发热重载（debounce 防多次触发）

#### `server/index.js`

保留给直接启动和开发场景使用，暴露与 `server/proxy.js` 一致的 HTTP 终端回退接口，避免不同启动方式出现传输能力差异。

#### `server/app.js`

可热重启的业务层，监听 Unix Socket，通过 mock req/res 处理 Express 路由：
- 其余 REST API（projects、sessions、fs、settings）；文件上传/下载由 proxy.js 直接流式处理，不经过 IPC
- SPA 静态文件服务 + SPA fallback

#### `server/pty-manager.js`

PTY 会话池，由 proxy.js 加载，生命周期与 proxy 绑定：

```js
sessions: Map<sessionId, {
  ptyProcess,           // node-pty 实例
  clients: Set<Client>, // WS + Unix Socket 订阅者
  buffer,               // 500KB in-memory scrollback
  logPath, logStream,   // 磁盘日志（最多 9000 行）
  socketPath, socketServer,
}>
```

**关键机制**：
- 相同 `requestId`（客户端重连/HTTP 重试）或同 Agent + `workingDir` + `resumeSessionId` 已有活跃会话 → 直接 attach，不重复创建；新会话即使目录相同也会单独创建
- PTY 输出广播给所有 clients（WS + Unix Socket）
- Web 端默认走 WS；WS Upgrade 不可用时，会话列表和终端都可切换到 HTTP 轮询
- 会话退出 5s 后自动清理并广播列表更新
- Web 共享终端是独立的单前台 PTY，会在浏览器断开后保留并向新客户端回放 scrollback

#### `server/fs-handler.js`

文件浏览 API 实现：
- 安全白名单：默认服务器根目录 `/`（可通过 `FS_ROOTS` 环境变量扩展）
- `path.resolve()` 防路径遍历
- 文本预览 100KB 限制，图片预览 2MB 限制

#### `server/auth.js`

- Bearer Token 认证，有效期 30 天
- 启动时生成 `local.token`（写入由 proxy.js 在端口监听成功后执行，防 watchdog 重试时覆盖）
- `rcc-server stop` 清理 local.token

#### `client/src/components/FileBrowser.vue`

文件浏览器组件，双栏布局（文件列表 + 预览）：
- 默认显示 Web 设置中的文件浏览器目录，初始为 `/`
- 支持文本/代码预览（含行号）、图片预览
- 支持新建文件夹、上传/下载和复制路径，预览面板顶部也有复制按钮

#### `client/src/App.vue`

- 每个会话独立 WS 连接（不共用，防组件重建导致重复创建）
- 控制 WS：专门接收 `session_list` 广播；WS 不可用时通过 `/api/active-sessions` HTTP 轮询刷新
- Agent 终端：WS 优先；连接失败或未 open 即关闭时自动切到 `/api/terminal/*` HTTP 长轮询
- `sendToActiveTerminal(text)`：文件浏览器 → 当前活跃终端

### 数据流

```
用户键盘输入
  → xterm onData → emit('input') → App → WS 或 HTTP input → proxy → PTY stdin

PTY 输出
  → pty.onData → session.buffer + logStream
  → broadcastData → ws.send 或 HTTP poll → xterm.write（浏览器）
                 → socket.write（rcc-tui）
```

---

## English

### Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│  Vue 3 + xterm.js + WebSocket first / HTTP fallback     │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│               proxy.js (long-running process)            │
│  - HTTP/WS server (:8310)                               │
│  - Token auth                                           │
│  - WS/HTTP fallback + PTY management (pty-manager)      │
│  - Hot reload: SIGUSR2 → restart app.js, no WS/PTY drop │
└──────────────────────┬──────────────────────────────────┘
                       │ Unix Socket (/tmp/rcc-app.sock)
┌──────────────────────▼──────────────────────────────────┐
│               app.js (hot-reloadable business layer)     │
│  - REST API (projects/sessions/fs/upload)               │
│  - File browser API (/api/fs/*)                         │
└─────────────────────────────────────────────────────────┘
```

**Hot reload design**: proxy.js stays alive, owning WS connections and PTY processes. app.js handles business logic and can be restarted without interruption via `rcc-server reload`.

### Core Modules

#### `server/proxy.js`

Long-running process:
- HTTP/WS server, token management (Bearer Auth + local.token)
- Full WS lifecycle (PTY message routing), with HTTP fallback routes for restricted access layers
- Forwards HTTP requests to app.js via Unix Socket
- `/api/active-sessions`, `/api/session-log`, `/api/terminal/*`, and `/api/shell/*` handled directly (depend on in-memory pty-manager state)
- Listens for SIGUSR2 to trigger hot reload (debounced)

#### `server/index.js`

Kept for direct startup and development. It exposes the same HTTP terminal fallback endpoints as `server/proxy.js`, so transport behavior stays consistent across startup modes.

#### `server/app.js`

Hot-reloadable business layer, listens on Unix Socket, handles Express routes via mock req/res:
- Remaining REST APIs (projects, sessions, fs, settings); file upload/download is streamed directly by proxy.js instead of going through IPC
- Static file serving + SPA fallback

#### `server/pty-manager.js`

PTY session pool, loaded by proxy.js, lifecycle tied to proxy:
- Same `requestId` (client reconnect / HTTP retry), or same agent + `workingDir` + `resumeSessionId` with an active session → attach directly; new sessions in the same directory are created separately
- PTY output broadcast to all clients (WS + Unix Socket)
- Web uses WS by default; if WS Upgrade is unavailable, session lists and terminals can switch to HTTP polling
- Session auto-removed 5s after PTY exits
- The Web shared terminal is an independent single foreground PTY, preserved across browser disconnects and replayed to new clients

#### `server/fs-handler.js`

File browser API:
- Whitelist roots: server root `/` by default (extendable via `FS_ROOTS`)
- `path.resolve()` prevents traversal attacks
- Text preview 100KB limit, image preview 2MB limit

#### `server/auth.js`

- Bearer Token, 30-day TTL
- `local.token` written only after `server.listen()` succeeds (prevents watchdog retries from overwriting)
- Cleaned up by `rcc-server stop`

#### `client/src/App.vue`

- Per-session WS connections avoid duplicate starts during component rebuilds
- Control WS receives `session_list` broadcasts; when WS is unavailable, `/api/active-sessions` HTTP polling keeps Home updated
- Agent terminals prefer WS and switch to `/api/terminal/*` HTTP long polling on failed or blocked WS connection attempts

### Data Flow

```
User keyboard input
  → xterm onData → emit('input') → App → WS or HTTP input → proxy → PTY stdin

PTY output
  → pty.onData → session.buffer + logStream
  → broadcastData → ws.send or HTTP poll → xterm.write (browser)
                 → socket.write (rcc-tui)
```

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
