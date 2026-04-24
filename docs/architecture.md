# 架构说明

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     客户端 (Browser)                     │
│  Vue 3 + xterm.js + WebSocket                           │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws/wss)
                       │ HTTP REST API
┌──────────────────────▼──────────────────────────────────┐
│                  服务端 (Node.js)                        │
│  Express + ws + node-pty                                │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  auth.js    │  │ pty-manager  │  │  history.js   │  │
│  │ Token 认证  │  │  PTY 会话池  │  │  历史对话读取  │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                          │                              │
│              ┌───────────┼───────────┐                  │
│         WS client    Unix Socket   WS client            │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    PTY Sessions                          │
│  claude --dangerously-skip-permissions [--resume <id>]  │
└─────────────────────────────────────────────────────────┘
```

## 核心模块

### 服务端

#### `server/index.js`
Express + HTTP server + WebSocketServer 入口。

- 静态文件优先于 API 路由（无 auth）
- API 路由全部需要 Bearer Token
- WS upgrade 时验证 Token（URL query `?token=`）
- 每个 WS 连接分配唯一 `wsId`，注册到 `allWS` Map

#### `server/auth.js`
Token 认证系统。

- 内存 Token 池 (`Map<token, expiry>`)，30 天有效
- `POST /api/login` → 验证用户名密码 → 生成随机 64 字节 hex token
- `httpAuth` 中间件：验证 `Authorization: Bearer <token>`
- `wsAuth`：验证 URL query `?token=`

#### `server/pty-manager.js`
PTY 会话生命周期管理，是系统核心。

**数据结构：**
```
sessions: Map<sessionId, {
  name, workingDir, resumeSessionId,
  ptyProcess,           // node-pty 实例
  clients: Set<Client>, // 订阅者（WS + Unix Socket）
  buffer,               // 500KB scrollback
  logPath, logStream,   // 磁盘日志
  socketPath, socketServer, // Unix socket
  exitCode, createdAt, lastActiveAt
}>

wsToSession: Map<wsId, { sessionId, client }>
allWS: Map<wsId, ws>   // 全局 WS 注册表（用于广播 session_list）
```

**关键机制：**

1. **去重创建**：同 `workingDir + resumeSessionId` 已有活跃 session → 直接 attach
2. **多路广播**：PTY 输出通过 `broadcastData` 发给所有 clients（WS + Unix Socket）
3. **Log rotate**：每 64KB 检查一次，超过 9000 行截断保留末尾
4. **自动清理**：PTY 退出后 5 秒自动从 sessions Map 删除并广播更新
5. **OOB resize**：Unix socket 客户端通过 `\x00RESIZE:<cols>:<rows>\n` 帧传递窗口大小

**Client 接口：**
```js
{
  type: 'ws' | 'unix',
  send(data: string),
  sendJSON(obj: object),
  close()
}
```

#### `server/history.js`
读取 `~/.claude/projects/` 目录下的 JSONL 文件。

- `getProjects()` — 列出所有项目，排序按最后修改时间
- `getSessions(projectId)` — 列出某项目的会话，提取 lastMessage/messageCount/cwd
- `readSession(sessionId)` — 读取完整会话消息

### 前端

#### `src/App.vue`
主组件，管理：
- **认证状态**：`authed`，对接 `api.login()`
- **控制 WS**：与服务端保持单独 WS 连接，专门接收 `session_list` 广播
- **termList**：活跃的终端实例列表，每个 entry 有独立 WS + `alive` 状态
- **termRefs**：`{ [sid]: Terminal component instance }`，App 直接调 `write()`/`fit()`/`scrollToBottom()`
- **路由**：监听 `view` + `activeSessionId`，同步到 URL hash

**关键设计 — 每 session 独立 WS：**

每次 `openSession` / `startSession` 都调 `connectEntryWS(entry)`，创建专属 WS：
- `onopen` → 发 `start` 或 `attach`
- `onmessage` → PTY 数据直接调 `termRefs[sid].write(data)`
- `onclose` → 指数退避重连（1s → 最大 15s）

这样 Terminal 组件只负责渲染，不管 WS 逻辑，避免了 WS/组件生命周期不同步导致的重复创建问题。

#### `src/components/Terminal.vue`
纯渲染组件，无 WS 逻辑：
- 接收 `theme` prop，读取 `settings` 的字体/光标配置
- `term.onData` → `emit('input', data)`（由 App 转发给 WS）
- `trackInput(data)` — 追踪当前行内容，供 SymbolBar 判断 CC/Shell 模式
- `expose: { write, fit, scrollToBottom, trackInput }`

#### `src/components/SymbolBar.vue`
快捷键栏，接收 `currentLine` prop：
- `currentLine.startsWith('!')` → 自动切 Shell 模式
- CC 模式：M、Esc、Tab、/、!、↑↓←→、⏎
- Shell 模式：两排，Linux 常用符号

#### `src/settings.js`
全局响应式设置，`localStorage` 持久化：
- `settings` — reactive 对象，watch 后自动保存
- `COLOR_THEMES` — 每个主题含 `icons` 字段（主题专属图标集）
- `getIcons(themeId)` — 获取当前主题图标

#### `src/router.js`
极简 Hash 路由：
- `parseHash()` — 解析 URL `#/...`
- `navigate(name, params)` — 更新 URL 不刷新页面
- 监听 `hashchange` 更新 `route` ref

#### `src/i18n.js`
中英文字典，`useI18n()` 返回 `computed` ref：
- 切换语言后所有使用 `t.xxx` 的地方立即响应

## 数据流

```
用户键盘输入
    │
    ▼
xterm.js onData
    │
    ▼
Terminal.vue emit('input')
    │
    ▼
App.vue onTermInput(sid, data)
    ├── entry.ws.send(data)  ──→  PTY stdin
    └── termRefs[sid].trackInput(data)  ──→  SymbolBar currentLine

PTY 输出
    │
    ▼
pty.onData(data)
    ├── session.buffer += data  （scrollback）
    ├── logStream.write(data)  （磁盘日志）
    └── broadcastData(session, data)
            ├── WS client.send(data)
            │       ▼
            │   App.vue onmessage
            │       ▼
            │   termRefs[sid].write(data)
            │       ▼
            │   xterm.js render
            │
            └── Unix socket client.send(data)
                    ▼
                local terminal
```

## 多端协同原理

```
Browser WS ──┐
             ├── session.clients (Set<Client>)
Local TTY ───┘
                    │
                    ▼ broadcastData
                PTY stdout → 所有 clients

Browser 输入 → ws.send(raw) → handleMessage → ptyProcess.write()
Local 输入   → socket.write() → ptyProcess.write()
```

两端共享同一个 PTY master fd，输入输出完全透明。
