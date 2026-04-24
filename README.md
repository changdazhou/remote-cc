# RemoteCC

[中文](#中文) | [English](#english)

---

## 中文

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  Remote Claude Code — 多端协同终端工具
```

### 为什么需要 RemoteCC？

Claude Code 是运行在本地终端的 AI 编程助手。当你离开电脑、切换到平板/手机、或需要团队协作时，会话就中断了——所有上下文丢失，工作流被打断。

**RemoteCC 解决的是"Claude Code 不能多端访问"这个痛点。**

### 核心架构：一个 PTY，多个观察者

```
                        ┌─────────────────────────────┐
                        │      PTY Process (claude)    │
                        └──────────────┬───────────────┘
                                       │ stdout/stdin
                            ┌──────────▼──────────┐
                            │    PTY Manager       │
                            │  500KB scrollback    │
                            │  disk log (9000行)   │
                            └──┬──────┬──────┬─────┘
                               │      │      │
              ┌────────────────▼┐   ┌─▼──┐  ┌▼──────────────────┐
              │  浏览器 WebSocket│   │... │  │ 本地终端 Unix Socket│
              │  (手机/平板/PC)  │   │    │  │ rcc / rcc-tui      │
              └─────────────────┘   └────┘  └────────────────────┘
```

同一 PTY 进程，所有端看到完全相同的内容，任意端输入所有端实时可见。浏览器关闭后 PTY 继续运行，下次打开自动恢复。

### 多端协同场景

| 场景 | 解决方案 |
|------|----------|
| 手机查看 Claude 输出 | 浏览器打开 `http://server:8310` |
| 离开电脑，手机继续工作 | 手机浏览器接入，完整键盘操作 |
| 后台长任务不中断 | PTY 持久运行，随时查看进度 |
| SSH 断线不丢失 | 会话独立于 SSH，重连即恢复 |

### 快速安装

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

### 命令参考

```bash
rcc start         # 启动服务
rcc stop          # 停止服务
rcc status        # 服务状态
rcc ls            # 查看会话列表
rcc-tui           # 交互式终端 UI（推荐）
```

> 在会话内用 **`Ctrl+]`** 断开回菜单，不终止 PTY 进程。

### 详细文档

- [安装指南 / Installation](docs/installation.md)
- [使用手册 / Usage](docs/usage.md)
- [API 文档 / API Reference](docs/api.md)
- [架构说明 / Architecture](docs/architecture.md)
- [开发指南 / Development](docs/development.md)

### 许可证

本项目基于 [Apache 2.0 许可证](LICENSE) 发布。

---

## English

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  Remote Claude Code — Multi-client collaborative terminal
```

### Why RemoteCC?

Claude Code is an AI coding assistant that runs in your local terminal. When you leave your computer, switch to a tablet/phone, or need team collaboration, the session breaks — all context is lost and your workflow is interrupted.

**RemoteCC solves the problem of "Claude Code can't be accessed from multiple devices."**

### Core Architecture: One PTY, Multiple Observers

```
                        ┌─────────────────────────────┐
                        │      PTY Process (claude)    │
                        └──────────────┬───────────────┘
                                       │ stdout/stdin
                            ┌──────────▼──────────┐
                            │    PTY Manager       │
                            │  500KB scrollback    │
                            │  disk log (9000 ln)  │
                            └──┬──────┬──────┬─────┘
                               │      │      │
              ┌────────────────▼┐   ┌─▼──┐  ┌▼──────────────────┐
              │  Browser WS      │   │... │  │ Local Unix Socket  │
              │  (phone/PC/iPad) │   │    │  │ rcc / rcc-tui      │
              └─────────────────┘   └────┘  └────────────────────┘
```

All clients share the same PTY process — input from any client is visible to all, in real time. The PTY keeps running after the browser closes and resumes automatically on reconnect.

### Use Cases

| Scenario | Solution |
|----------|----------|
| Check Claude output on phone | Open `http://server:8310` in browser |
| Continue work away from desk | Full keyboard interaction on mobile |
| Long-running background tasks | PTY persists, check progress anytime |
| SSH disconnection safety | Sessions survive SSH drops |

### Quick Install

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

### Command Reference

```bash
rcc start         # Start service
rcc stop          # Stop service
rcc status        # Service status
rcc ls            # List sessions
rcc-tui           # Interactive TUI (recommended)
```

> Press **`Ctrl+]`** inside a session to detach back to the menu without killing the PTY.

### Documentation

- [Installation Guide](docs/installation.md)
- [Usage Manual](docs/usage.md)
- [API Reference](docs/api.md)
- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)

### License

This project is released under the [Apache 2.0 License](LICENSE).
