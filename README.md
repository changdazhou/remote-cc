# RemoteCC — 躺平使用 Claude Code / Codex

[English](README.en.md) | 中文

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  RemoteCC
```

> **本工具由 Claude Code 辅助生成，目前仍在打磨迭代中。欢迎提交 [Issue](https://github.com/changdazhou/remote-cc/issues) 反馈 BUG 和建议。**

---

## 这是什么？

**把 Claude Code 和 Codex 从本地终端解放出来，躺在床上用手机也能和它们对话。**

Claude Code / Codex 都是跑在终端里的 AI 编程助手，功能强大，但只能在本机用。RemoteCC 打通了这个限制——你的 Agent 会话可以同时从手机浏览器、平板、电脑终端访问，**所有端实时同步，真正共享同一个 PTY 进程**。

不是截图，不是日志，是**完全实时的双向同步**——你在手机上输入，电脑上看得到；你在终端里执行，手机上同步显示。任意断开任意端，Agent 在后台继续工作，随时重连、无缝恢复。

---

## 核心特性

- **真实终端** — 颜色、交互、鼠标全支持，和直接在本机用没有区别
- **实时多端同步** — 手机、平板、电脑同时接入同一个 Agent 会话
- **HTTP 回退传输** — WebSocket 被反代或接入网关拦截时，首页、Agent 终端和共享终端自动改走 HTTP
- **持久会话** — 关闭浏览器或断开 SSH，Agent 在后台继续跑，随时 reconnect
- **历史恢复** — 读取 Claude Code / Codex / Grok 历史，自动按工作目录恢复上次对话
- **启动参数透传** — 新建或恢复会话时可临时填写 `--model xxx` 等参数，原样传给 Agent CLI
- **目录式新建任务** — 新建会话时可从服务器目录树选择工作目录
- **文件浏览器** — 在 Web 端直接浏览服务器上的文件，预览代码/图片，复制路径
- **终端管理界面** — 在服务器上直接运行 `remotecc`，弹出可视化菜单管理所有会话
- **多端断开快捷键** — `Ctrl+]` 随时脱离当前会话回菜单，不终止 Agent
- **移动端优化** — 响应式 UI，手机上也能舒适操作
- **可定制外观** — 9 种 UI 风格、深/浅多套配色和多套图标风格，默认 Studio + Aurora + Material

---

## 上传文件 / 图片给 Agent

Web 端终端支持三种方式向 Claude Code 或 Codex 传递文件：

| 方式 | 操作 |
|------|------|
| 点击按钮选文件 | 手机端点击终端快捷栏上传按钮，选择任意文件或图片 |
| 拖拽 | 直接把文件拖到终端区域 |
| 粘贴图片 | 截图后 Ctrl+V 粘贴（自动上传） |

文件上传到服务器 `~/.rcc/uploads/` 目录，路径自动填入终端光标位置，直接回车或继续输入 Agent 命令即可。

---

## 文件浏览器

点击顶栏文件夹图标打开文件浏览器，默认显示服务器根目录 `/`。

| 操作 | 说明 |
|------|------|
| 单击文件 | 右侧预览内容（代码含行号，图片直接显示） |
| 双击文件 | 全屏查看，手机上阅读更舒适 |
| 双击目录 | 进入目录 |
| 新建文件夹按钮 | 在当前目录创建子目录 |
| 复制路径按钮 | 复制文件/目录的绝对路径 |
| 上传 / 下载按钮 | 上传到当前目录 / 下载文件 |
| 拖拽文件 | 直接把文件拖到文件浏览器，上传到当前目录 |
| 路径输入框 | 直接输入路径跳转，回车确认 |

支持预览的文件类型：`.md` `.txt` `.py` `.js` `.ts` `.json` `.sh` `.yaml` 等代码和文本文件，以及常见图片格式（`png` `jpg` `gif` `webp`）。

设置页可以配置文件浏览器默认打开目录、终端默认目录、新建会话默认目录，也支持修改 Web 登录密码。

---

## 共享终端

点击顶栏终端图标打开共享终端。它不进入 RemoteCC Agent 会话列表，但会作为一个前台终端会话保留：浏览器断开或刷新不会杀进程，重新打开会回放最近输出，多端打开会同步同一个终端。默认优先使用 `zsh`，其次 `fish`、`bash`、`sh`；也可以用 `RCC_SHELL` 或 `REMOTECC_SHELL` 指定。

---

## 多端实时同步原理

```
                     你打开了三个窗口
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    手机浏览器          电脑浏览器         本地终端
  (WS/HTTP回退)     (WS/HTTP回退)    (Unix Socket)
          │                 │                 │
          └────────┬────────┘                 │
                   ▼                          │
             PTY Manager  ◀────────────────────┘
                   │
                   ▼
          Agent 进程（一直跑）
```

**任意端输入 → PTY stdin → 所有端同步看到输出**

这不是镜像或转发，而是多个订阅者共享同一个 PTY master fd。哪怕你把所有客户端都断开，Agent 还在后台继续执行任务。

---

## 快速开始

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

安装脚本全程交互，自动检测环境，无需手动配置。

安装向导、`rcc-tui` 和命令行提示默认中文。需要英文时用 `bash install.sh --lang en`（或 `RCC_LANG=en bash install.sh`），选择会记在 `~/.rcc/lang`，之后 `rcc-tui`、`remotecc` 也默认英文；临时切换可在命令前加 `RCC_LANG=en` 或 `RCC_LANG=zh`。Web 界面的语言在设置页单独切换。

RemoteCC 会自动检测 Claude Code、Codex 和 Grok，至少安装其中一个即可。新建会话时可以选择 Agent，并可在「启动参数」里临时填写要透传给 Agent CLI 的参数（如 `--model xxx`）；历史恢复支持 Claude Code 的 `~/.claude/projects/`、Codex 的 `~/.codex/sessions/` 以及 Grok 的 `~/.grok/sessions/` 会话记录。

如果 Codex 或 Claude Code 需要代理，可在安装向导中配置 `CODEX_PROXY` / `CLAUDE_PROXY`。代理只注入对应 Agent CLI，不作为 RemoteCC 全局代理；提示里的默认示例是 `http://127.0.0.1:7890`。

安装完成后：

```bash
remotecc start     # 启动服务
remotecc           # 弹出可视化菜单，管理会话
```

浏览器打开 `http://<服务器IP>:8310` 也可以使用。

---

## 常用命令

```bash
# 服务管理
remotecc start          # 启动服务（守护进程，崩溃自动重启）
remotecc stop           # 停止服务
remotecc restart        # 完整重启（更新后需要用）
remotecc reload         # 热重载（不断开正在进行的会话）
remotecc update         # 拉取最新版本，自动重启/热重载
remotecc status         # 查看服务是否在运行

# 日常使用（在服务器终端里运行）
remotecc                # 弹出可视化菜单，查看/进入/新建会话
remotecc attach <名称>  # 直接进入指定名称的会话
```

在任意会话内：**`Ctrl+]`** 退回菜单，不终止 Agent 进程。

---

## 更新日志

### 2026-09-24

- **终端渲染**：改用 WebGL 渲染，选区与文字对齐；字体、字号变化后重新测量并同步列数，PC 端右侧不再截掉字符
- **命令行英文**：安装向导、`rcc-tui`、`remotecc` 支持英文，默认中文，用 `--lang en` 或 `RCC_LANG=en` 切换
- **滚动**：上划查看历史不再被新输出拉回，10 秒无操作自动回到底部；新增「回到底部」按钮，手机滑动支持惯性
- **配色**：正确应答 Agent 的终端颜色查询，配色跟随主题；在 Agent 会话中启动服务时，新会话不再继承关闭颜色等设置
- **上传**：显示进度、速度和剩余时间，可取消；单文件上限 10 GB
- **Agent 命令**：显示完整可执行文件路径；可在 `~/.rcc/agent.env` 中配置首选命令和 `CODEX_HOME`

### 2026-09-23

- **大文件传输**：上传、下载改为流式处理，大文件不再卡死；中文文件名下载修复
- **启动参数**：新建或恢复会话时可填写 `--model xxx` 等参数，原样传给 Agent（Web 与 `rcc-tui`）
- **Grok**：新增 Grok Agent，支持新建、历史恢复和自定义命令
- **会话**：同一目录可同时开多个会话；启动失败原因直接显示在终端中
- **稳定性**：WebSocket 重连期间的输入不再丢失，HTTP 回退后自动尝试恢复 WebSocket
- **问题修复**：会话重命名、历史列表刷新、文件预览、手机端复制模式和回车发送等

### 2026-07-01

- **Agent 终端复制与粘贴**：修正 PC 端选区坐标偏移；有选区时 `Ctrl/Cmd+C` 复制，无选区时保留终端中断语义；`Ctrl/Cmd+V` 改走浏览器剪贴板，避免 Windows/X11 服务端剪贴板报错
- **运行中查看历史**：Agent 输出时用户主动上滑会暂停锁底，停顿后自动回到底部，便于任务执行过程中查看历史内容
- **文件管理器目录状态**：记住最后访问目录，刷新后优先回到上次位置；修改默认目录时自动重置这条状态

<details>
<summary>更早更新</summary>

### 2026-06-16

- **移动端输入增强**：Agent 快捷栏第一排调整为上传、MODE、换行、发送；换行发送 LF，发送按钮发送 CR，语义更清晰
- **手机键盘回车配置**：设置页新增“手机键盘回车键”，可选择默认发送或单纯换行，并持久化到 `~/.rcc/web-settings.json`
- **设置同步修复**：Web 设置同步改为比较本地和服务端更新时间，避免刷新时旧服务端配置覆盖刚修改的终端设置

### 2026-06-05

- **HTTP 回退传输**：WebSocket 不可用时，首页会话列表改用 HTTP 轮询，Agent 终端和共享终端自动切换到 HTTP 长轮询
- **反代兼容性**：补齐 `kill` / `delete` / `rename` 等会话控制操作的 HTTP 回退，支持不透传 WebSocket Upgrade 的接入层
- **幂等性处理**：会话启动/接入、终端启动、resize、kill/delete 等控制操作可重复调用；终端输入保持非幂等，避免自动重试导致命令重复

### 2026-06-04

- **共享终端**：Web 终端改为单个前台共享会话，支持断线重连、历史回放和多端同步
- **移动端终端**：修复手机端无法输入的问题，并支持上滑查看历史、文本选择复制、默认 MesloLGM NF 字体和终端专用 `CTRL` / `ALT` / `FN` 快捷键
- **设置页优化**：移动端 UI 风格预览改为整宽卡片，避免预览图被窄列压扁
- **文档截图**：接入新版截图，按桌面、手机、TUI 分组展示

### 2026-06-03

- **Web 控制台增强**：新建会话支持目录选择；文件浏览器支持 `/` 根目录、新建文件夹、上传下载和路径复制
- **终端**：Web 顶栏新增通用终端，默认优先使用 `zsh`
- **移动端终端**：快捷键栏仅在手机端显示，终端模式使用专用快捷键
- **外观与语言**：默认 Studio + Aurora + Material，支持 9 种 UI 风格、深/浅多套配色、6 种图标风格和完整中英文切换
- **设置持久化**：Web 设置保存到 `~/.rcc/web-settings.json`，默认目录、主题、终端偏好和语言重启后仍然有效
- **TUI 断开修复**：修复 `rcc-tui` 新建会话后第一次 `Ctrl+]` 无法正常回菜单的问题

### 2026-05-21

- **Codex 历史恢复**：改为读取 `~/.codex/sessions/` 中的真实会话元数据，按工作目录分组，恢复时不再落到 `~`
- **恢复界面**：Web/TUI 的 Codex 历史按工作目录展示，不再多出 `~/.codex/history.jsonl` 这一层
- **移动端终端**：优化 xterm 异步写入后的锁底逻辑，减少 Codex 输出底部留白

### 2026-05-19

- **Codex 支持**：新建会话可选择 Claude Code 或 Codex，活跃会话会显示 Agent 类型
- **历史恢复**：支持从 Claude Code / Codex 历史中恢复历史对话
- **Agent 代理**：安装和更新流程支持 `CODEX_PROXY` / `CLAUDE_PROXY`，代理只注入对应 Agent CLI
- **服务管理**：修复 `rcc-tui` 服务状态误判，端口占用时 `rcc-server` 会显示占用进程

### 2026-05-12

- **文件浏览器**：Web 界面新增文件浏览功能，支持代码/图片预览、双击全屏、复制路径
- **热重载**：`remotecc reload` 仅重启业务层，不断开正在进行的 Agent 会话
- **remotecc update**：一键更新，自动判断是否需要重启
- **remotecc attach**：直接进入指定会话，断开后回到菜单而非退出终端
- **登录页跳转**：服务重启后浏览器自动跳回登录页，不再白屏

</details>

---

## 截图

### 桌面端

| 会话列表 | Agent 终端 |
|---|---|
| <img src="docs/assets/screenshots/web-home-desktop.jpg" alt="Web 会话列表" width="520"> | <img src="docs/assets/screenshots/web-terminal-desktop.png" alt="Web 终端" width="520"> |

| 文件浏览器 | 共享终端 |
|---|---|
| <img src="docs/assets/screenshots/web-file-browser-desktop.jpg" alt="Web 文件浏览器" width="520"> | <img src="docs/assets/screenshots/web-shell-desktop.png" alt="Web 共享终端" width="520"> |

| 外观设置 | 终端与目录设置 |
|---|---|
| <img src="docs/assets/screenshots/web-settings-appearance.jpg" alt="外观设置" width="520"> | <img src="docs/assets/screenshots/web-settings-terminal.jpg" alt="终端与目录设置" width="520"> |

### 手机端

| 会话列表 | Agent 终端 | 文件浏览器 | 设置 |
|---|---|---|---|
| <img src="docs/assets/screenshots/mobile-home.jpg" alt="移动端会话列表" width="220"> | <img src="docs/assets/screenshots/mobile-terminal.jpg" alt="移动端终端" width="220"> | <img src="docs/assets/screenshots/mobile-file-browser.jpg" alt="移动端文件浏览器" width="220"> | <img src="docs/assets/screenshots/mobile-settings.jpg" alt="移动端设置" width="220"> |

### TUI

| 会话列表 | 会话操作 |
|---|---|
| <img src="docs/assets/screenshots/tui-session-list.png" alt="TUI 会话列表" width="420"> | <img src="docs/assets/screenshots/tui-session-actions.png" alt="TUI 会话操作" width="420"> |

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

[Apache 2.0](LICENSE) © 2026 changdazhou
