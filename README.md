# RemoteCC — 躺平使用 Claude Code

[English](README.en.md) | 中文

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  Remote Claude Code
```

> **本工具由 Claude Code 辅助生成，目前仍在打磨迭代中。欢迎提交 [Issue](https://github.com/changdazhou/remote-cc/issues) 反馈 BUG 和建议。**

---

## 这是什么？

**把 Claude Code 从本地终端解放出来，躺在床上用手机也能和它对话。**

Claude Code 是跑在终端里的 AI 编程助手，功能强大，但只能在本机用。RemoteCC 打通了这个限制——你的 Claude Code 会话可以同时从手机浏览器、平板、电脑终端访问，**所有端实时同步，真正共享同一个 PTY 进程**。

不是截图，不是日志，是**完全实时的双向同步**——你在手机上输入，电脑上看得到；你在终端里执行，手机上同步显示。任意断开任意端，Claude 在后台继续工作，随时重连、无缝恢复。

---

## 核心特性

- **真实终端** — PTY + xterm.js，颜色/交互/鼠标全支持
- **实时多端同步** — 同一 PTY 进程广播给所有连接端，零延迟
- **持久会话** — 类 tmux 架构，关闭浏览器/断开 SSH 不中断
- **历史恢复** — 读取 `~/.claude/projects/`，随时 `--resume` 继续上次对话
- **本地 TUI** — `rcc-tui` 交互式终端界面，无需浏览器，无需登录
- **多端断开快捷键** — `Ctrl+]` 随时从任意端脱离，PTY 不受影响
- **移动端优化** — 响应式 UI，CC/SH 双模式快捷键栏
- **丰富主题** — 9 套颜色主题 + 3 种 UI 风格

---

## 多端实时同步原理

```
                     你打开了三个窗口
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    手机浏览器          电脑浏览器         本地终端
    (WebSocket)       (WebSocket)      (Unix Socket)
          │                 │                 │
          └────────┬────────┘                 │
                   ▼                          │
             PTY Manager  ◀────────────────────┘
                   │
                   ▼
          claude 进程（一直跑）
```

**任意端输入 → PTY stdin → 所有端同步看到输出**

这不是镜像或转发，而是多个订阅者共享同一个 PTY master fd。哪怕你把所有客户端都断开，claude 还在后台继续执行任务。

---

## 快速开始

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

安装脚本全程交互，自动检测环境，无需手动配置。

安装完成后：

```bash
rcc start          # 启动服务
```

浏览器打开 `http://<IP>:8310`，或直接用终端：

```bash
rcc-tui            # 本地交互式界面（推荐）
```

---

## 常用命令

```bash
rcc start          # 启动服务（守护进程，崩溃自动重启）
rcc stop           # 停止服务
rcc status         # 查看服务状态
rcc ls             # 查看所有会话
rcc-tui            # 交互式 TUI（无需登录，本地直连）
```

在任意会话内：**`Ctrl+]`** 断开回菜单，不终止 Claude 进程。

---

## 截图

> Web 终端 · 会话管理 · rcc-tui · 移动端

（欢迎贡献截图 🙏）

---

## 文档

- [安装指南](docs/installation.md)
- [使用手册](docs/usage.md)
- [API 文档](docs/api.md)
- [架构说明](docs/architecture.md)
- [开发指南](docs/development.md)

---

## 参与贡献

这个工具还很年轻，欢迎：

- 🐛 [提交 BUG](https://github.com/changdazhou/remote-cc/issues/new?labels=bug)
- 💡 [提功能建议](https://github.com/changdazhou/remote-cc/issues/new?labels=enhancement)
- 🔧 提交 PR

---

## 许可证

[Apache 2.0](LICENSE) © 2024 changdazhou
