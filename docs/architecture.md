# 架构说明 / Architecture

[中文](#中文) | [English](#english)

---

## 中文

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     客户端 (Browser)                     │
│  Vue 3 + xterm.js + WebSocket                           │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws/wss)
┌──────────────────────▼──────────────────────────────────┐
│                  服务端 (Node.js)                        │
│  Express + ws + node-pty                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  auth.js    │  │ pty-manager  │  │  history.js   │  │
│  │ Token 认证  │  │  PTY 会话池  │  │  历史对话读取  │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
   WS client          Unix Socket          WS client
  (浏览器)            (rcc/rcc-tui)         (其他端)
```

### 核心模块

#### `server/pty-manager.js`

PTY 会话生命周期管理。

**数据结构**：

```js
sessions: Map<sessionId, {
  name, workingDir, resumeSessionId,
  ptyProcess,           // node-pty 实例
  clients: Set<Client>, // WS + Unix Socket 订阅者
  buffer,               // 500KB in-memory scrollback
  logPath, logStream,   // 磁盘日志（最多 9000 行）
  socketPath, socketServer,
  exitCode, createdAt, lastActiveAt
}>
```

**关键机制**：
- **全局去重**：同 `workingDir + resumeSessionId` 已有活跃会话 → 直接 attach，不重复创建
- **多路广播**：PTY 输出同时发给所有 clients（WS + Unix Socket）
- **Log rotate**：每 64KB 检查一次，超过 9000 行截断
- **自动清理**：PTY 退出后 5 秒自动删除并广播更新
- **单实例锁**：`~/.rcc/server.lock`，同机器只允许一个 rcc 服务运行

#### `server/auth.js`

- Bearer Token 认证，有效期 30 天
- 服务启动时生成 `~/.rcc/local.token`（权限 600），供 `rcc-tui` 免密本地认证
- 进程退出时自动删除 local.token

#### `client/src/App.vue`

- 每个会话独立 WS 连接（避免组件重建导致重复创建会话）
- 控制 WS：专门接收 `session_list` 广播，不承载 PTY 数据
- `termRefs`：直接调用 Terminal 组件的 `write()`/`fit()`/`scrollToBottom()`

#### `client/src/components/Terminal.vue`

纯渲染组件，无 WS 逻辑：
- `term.onData` → `emit('input')` → App → WS → PTY
- `trackInput(data)`：追踪当前行内容，驱动 SymbolBar CC/SH 模式切换
- `expose: { write, fit, scrollToBottom, trackInput }`

### 数据流

```
用户键盘输入
  → xterm onData → emit('input') → App.onTermInput
  → entry.ws.send(data) → PTY stdin

PTY 输出
  → pty.onData(data) → session.buffer
  → logStream.write(data)
  → broadcastData → ws.send(data) → termRefs[sid].write(data)
                  → socket.write(data) → 本地终端
```

---

## English

### Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│  Vue 3 + xterm.js + WebSocket                           │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws/wss)
┌──────────────────────▼──────────────────────────────────┐
│                  Server (Node.js)                        │
│  Express + ws + node-pty                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  auth.js    │  │ pty-manager  │  │  history.js   │  │
│  │ Token auth  │  │  PTY pool    │  │  History read │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
   WS client          Unix Socket          WS client
  (browser)          (rcc/rcc-tui)         (others)
```

### Core Modules

#### `server/pty-manager.js`

PTY session lifecycle management.

**Data structure**:

```js
sessions: Map<sessionId, {
  name, workingDir, resumeSessionId,
  ptyProcess,           // node-pty instance
  clients: Set<Client>, // WS + Unix Socket subscribers
  buffer,               // 500KB in-memory scrollback
  logPath, logStream,   // disk log (max 9000 lines)
  socketPath, socketServer,
  exitCode, createdAt, lastActiveAt
}>
```

**Key mechanisms**:
- **Global dedup**: same `workingDir + resumeSessionId` with an active session → attach directly, no new process
- **Broadcast**: PTY output sent to all clients simultaneously (WS + Unix Socket)
- **Log rotate**: checked every 64KB, trimmed to last 9000 lines when exceeded
- **Auto-cleanup**: session deleted 5 seconds after PTY exits, list broadcast updated
- **Single-instance lock**: `~/.rcc/server.lock`, only one rcc service per machine

#### `server/auth.js`

- Bearer Token auth, 30-day TTL
- On start, writes `~/.rcc/local.token` (chmod 600) for password-free local auth by `rcc-tui`
- local.token deleted on process exit

#### `client/src/App.vue`

- Each session has its own dedicated WS connection (prevents duplicate session creation from component re-mount)
- Control WS: receives `session_list` broadcasts only, carries no PTY data
- `termRefs`: calls Terminal component methods directly (`write()`/`fit()`/`scrollToBottom()`)

#### `client/src/components/Terminal.vue`

Pure render component, no WS logic:
- `term.onData` → `emit('input')` → App → WS → PTY
- `trackInput(data)`: tracks current line content, drives CC/SH mode switch in SymbolBar
- `expose: { write, fit, scrollToBottom, trackInput }`

### Data Flow

```
User keyboard input
  → xterm onData → emit('input') → App.onTermInput
  → entry.ws.send(data) → PTY stdin

PTY output
  → pty.onData(data) → session.buffer
  → logStream.write(data)
  → broadcastData → ws.send(data) → termRefs[sid].write(data)
                  → socket.write(data) → local terminal
```

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
