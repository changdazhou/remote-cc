# RemoteCC

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  Remote Claude Code — 多端协同终端工具
```

## 为什么需要 RemoteCC？

Claude Code 是运行在本地终端的 AI 编程助手。当你离开电脑、切换到平板/手机、或者需要团队协作时，会话就中断了——所有上下文丢失，工作流被打断。

**RemoteCC 解决的是"Claude Code 不能多端访问"这个痛点。**

### 核心架构：一个 PTY，多个观察者

```
                        ┌─────────────────────────────┐
                        │      PTY Process (claude)    │
                        │   --dangerously-skip-perms   │
                        └──────────────┬───────────────┘
                                       │ stdout/stdin
                            ┌──────────▼──────────┐
                            │    PTY Manager       │
                            │  (node-pty + ws)     │
                            │  500KB scrollback    │
                            │  disk log (9000行)   │
                            └──┬──────┬──────┬─────┘
                               │      │      │
              ┌────────────────▼┐   ┌─▼──┐  ┌▼──────────────────┐
              │  浏览器 WebSocket│   │    │  │ 本地终端 Unix Socket│
              │  (手机/平板/PC)  │   │... │  │ rcc attach         │
              └─────────────────┘   └────┘  └────────────────────┘
                   xterm.js                    原生 PTY 渲染
```

**关键特性：**
- 同一 PTY 进程，所有端看到完全相同的内容（不是镜像，是共享）
- 任意一端输入，所有端实时可见
- 浏览器关闭 → PTY 继续运行，下次打开自动恢复
- `rcc attach` 接入后 `Ctrl+]` 断开，PTY 不中断

## 多端协同场景

| 场景 | 解决方案 |
|------|----------|
| 手机查看 Claude 输出 | 浏览器打开 `http://server:8310` |
| 离开电脑，手机继续工作 | 手机浏览器接入，完整键盘操作 |
| 本地终端 + 远程监控 | `rcc attach` + 浏览器同时观看 |
| 团队协作（pair programming） | 多人同时接入同一会话 |
| 后台长任务不中断 | PTY 持久运行，随时查看进度 |
| SSH 断线不丢失 | 会话独立于 SSH，重连即恢复 |

## 快速安装

```bash
git clone <repo> remote_cc
cd remote_cc
bash install.sh
```

安装脚本会：
1. 检查 Node.js、npm、Claude Code 环境
2. 交互式配置用户名/密码/端口
3. 询问是否启用 IS_SANDBOX（危险模式）
4. 自动安装依赖、构建前端
5. 将 `rcc`/`rcc-tui`/`rcc-server` 安装到 PATH
6. 可选立即启动服务

## 手动启动

```bash
# 普通启动
RC_USER=admin RC_PASS=secret PORT=8310 node server/index.js

# 沙箱模式（自动跳过权限确认）
IS_SANDBOX=1 RC_USER=admin RC_PASS=secret PORT=8310 node server/index.js

# 守护进程（推荐，崩溃自动重启）
rcc-server start
rcc-server status
rcc-server stop
rcc-server log
```

## 工具说明

### `rcc` — 命令行接入工具

```bash
rcc ls                  # 查看所有会话
rcc attach              # 接入唯一活跃会话
rcc attach my-project   # 按名称接入
rcc log my-project      # tail -f 实时日志
```

**断开方式：** `Ctrl+]`（不终止 PTY 会话）

### `rcc-tui` — 交互式终端 UI（推荐）

```bash
rcc-tui
```

无需传参，启动后进入交互菜单：

```
  ██████╗  ██████╗ ██████╗
  ...（大字 banner）

  [ RemoteCC ]  ● 服务运行中  :8310  pid 12345

  对话列表
  ────────────────────────────────────────

   › ● my-project  ~/project  3m ago
     ○ old-session  2h ago
     ·····················
     ＋  新建对话
     ⏎  恢复历史对话
     ↻  刷新
     ✕  退出

  ↑↓ 选择   Enter 确认   q/Esc 返回   Ctrl+C 退出
```

**页面流程：**
```
主菜单
├── 选择活跃会话 → ▶ 接入 / ≡ 日志 / ← 返回
├── 选择已结束会话 → ≡ 查看历史日志
├── 新建对话 → 输入目录（留空返回）→ 创建并接入
└── 恢复历史 → 选项目 → 选会话 → 确认目录 → 以 --resume 启动
```

**键盘操作：**

| 按键 | 功能 |
|------|------|
| `↑` / `↓` 或 `Ctrl+P/N` | 移动选择 |
| `Enter` | 确认 |
| `q` 或 `Esc` | 返回上一页 |
| `Ctrl+C` | 退出程序 |
| **`Ctrl+]`** | **在会话内断开，回到菜单** |

> **注意：** `Ctrl+C` 在会话内会发给 Claude 处理（取消生成等），不会断开。用 `Ctrl+]` 断开回菜单。

## Web 界面

浏览器访问 `http://<server>:8310`，支持：
- 多颜色主题（深色 6 套 + 浅色 3 套）
- 三种 UI 风格（Cyberpunk / Minimal / Glass）
- 符号快捷键栏（CC/SH 双模式）
- 会话管理、历史恢复、日志查看
- 帮助文档（右上角 `?`）

## 安全说明

- 所有 HTTP/WS 请求通过 Bearer Token 认证
- 本地工具（`rcc`/`rcc-tui`）通过 `~/.rcc/local.token` 免密认证
- 生产环境建议通过 Nginx 反代并启用 HTTPS
- `IS_SANDBOX=1` 仅在受信任的隔离环境中使用

## 详细文档

- [安装指南](docs/installation.md)
- [使用手册](docs/usage.md)
- [API 文档](docs/api.md)
- [架构说明](docs/architecture.md)
- [开发指南](docs/development.md)

## License

MIT
