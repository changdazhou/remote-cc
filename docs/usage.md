# 使用手册 / Usage Manual

[中文](#中文) | [English](#english)

---

## 中文

### 多端协同工作原理

RemoteCC 的核心是**一个 PTY 进程，多个同步观察者**：

```
Agent PTY（持续运行）
        ├──▶ 浏览器 WebSocket（手机/平板/PC）
        ├──▶ rcc-tui（本地交互式 TUI）
        └──▶ remotecc attach（进入 TUI 接入会话）
```

无论从哪端输入，所有端实时可见。PTY 独立于客户端运行——关闭浏览器或断开 SSH，Agent 在后台继续工作。

Web 端默认使用 WebSocket 获取实时状态并传输终端数据；如果接入网关不支持 WebSocket Upgrade，首页会通过 HTTP 轮询刷新会话列表，终端会自动切换到 HTTP 长轮询回退模式。

---

### Web 界面

浏览器访问 `http://<server>:8310` 登录后使用。

#### 对话列表（首页）

| 元素 | 说明 |
|------|------|
| 绿点 ● | 会话运行中 |
| 灰点 ○ | 会话已结束（5秒后自动移除） |
| 会话名 | 默认为目录名，双击可改名 |
| 时间 | 最后活跃时间 |
| `≡` | 查看日志 |
| `✕` | 关闭/删除会话 |

#### 新建对话

- **New 标签**：选择 Claude Code、Codex 或 Grok，输入工作目录或点击目录按钮选择工作目录，填写会话名 → 启动
- **启动参数**：可选，按 shell 规则拆分后原样追加到 Agent 命令行，例如 `--model opus`；每个 Agent 单独记住本页输入，恢复会话时同样可用
- **Resume 标签**：从 Claude Code / Codex / Grok 历史中按工作目录选择对话 → 恢复
- **代理**：安装时可配置 `CODEX_PROXY` / `CLAUDE_PROXY`；代理只用于 Agent CLI，不会作为 RemoteCC 全局代理。

#### 终端操作

| 快捷键 | 功能 |
|--------|------|
| Shift+Tab | 切换 Claude 内部模式（Plan/Auto/Act） |
| Ctrl+Shift+C | 复制选中内容 |
| Ctrl+Shift+V | 粘贴 |
| 右键 | 上下文菜单（Copy/Paste/Clear） |

#### 符号快捷键栏

- 快捷键栏只在手机端显示，PC 端保留完整终端区域。
- **CC 模式**（蓝色）：`M`（Shift+Tab）`Esc` `Tab` `/` `!` `↑↓←→` `⏎`
- **SH 模式**（黄色，行首输入 `!` 自动切换）：两行移动端专用终端面板；第一行 `ESC` `/` `|` `-` `HOME` `↑` `END` `TAB`，第二行 `FN` `CTRL` `ALT` `←` `↓` `→` `~`；点 `CTRL` 后再输入 `x` 即发送 `Ctrl+x`
- `Ctrl+]` 在会话内断开回菜单

#### 文件浏览器（右上角文件夹图标）

点击顶栏文件夹图标打开文件浏览器，默认显示服务器根目录 `/`：

- **左栏**：目录浏览，双击进入子目录，支持隐藏文件显示
- **右栏**：文件预览（文本/代码含行号、图片）
- **新建文件夹**：点击工具栏文件夹加号，在当前目录创建子目录
- **复制路径**：鼠标悬停条目，点击复制路径按钮；预览面板顶部也有复制按钮
- **上传 / 下载**：点击上传按钮或把文件拖到文件浏览器，可上传到当前目录（实时显示进度、速度和剩余时间，可取消；单文件上限 10 GB）；点击下载按钮由浏览器直接下载文件

#### 共享终端（右上角终端图标）

终端按钮会打开一个普通 PTY。它不进入 Agent 会话列表，但会作为单个前台终端会话保留：关闭页面、断网或刷新不会杀进程，重新打开会回放最近输出；多个 Web 端打开终端图标时会同步同一个终端。默认优先使用 `zsh`，其次 `fish`、`bash`、`sh`；可通过 `RCC_SHELL` 或 `REMOTECC_SHELL` 指定。

如果 WebSocket 不可用，终端会自动切换到 HTTP 长轮询传输，并在断连后继续重试。

#### 设置页（右上角设置图标）

- **外观**：9 种 UI 风格，深色 12 套 / 浅色 9 套颜色主题，6 种图标风格；默认 Studio + Aurora + Material
- **终端**：字体（含 MesloLG NF 系列）/字号/行高/光标/回滚行数/符号栏
- **连接**：重连延迟
- **远程控制**：文件浏览器默认目录、终端默认目录、新建会话默认目录
- **账户**：查看当前用户、修改 Web 登录密码、退出登录
- **语言**：中文 / English；设置页、帮助页、说明文案和图标提示会同步切换

---

### 命令行工具

#### remotecc

统一管理入口：

```bash
remotecc                   # 进入 TUI 界面
remotecc attach            # 进入 TUI 界面
remotecc attach <name>     # 直接在 TUI 内接入指定会话
remotecc ls                # 列出所有会话
remotecc log <name>        # 实时查看会话日志（tail -f）
```

**断开方式**：`Ctrl+]`（不终止 PTY）

#### rcc-tui（推荐）

本地交互式 TUI，无需登录，直接通过 Unix Socket 连接：

```bash
rcc-tui
```

启动后显示大字 banner 和会话列表。`rcc-tui` 会读取 `~/.rcc/server.lock` 和项目 `.env` 来判断服务端口；如果端口被其他进程占用，`rcc-server status` 会显示占用者：

```
  ██████╗  ██████╗ ██████╗
  ...
  ● 服务运行中  :8310

  对话列表
  ─────────────────────────
   › ● my-project  ~/project  3m ago
     ＋  新建对话
     ⏎  恢复历史对话
     ✕  退出
```

**键盘操作**：

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 移动光标 |
| `Enter` | 确认/进入 |
| `q` / `Esc` | 返回上一页 |
| `Ctrl+C` | 退出 rcc-tui |
| **`Ctrl+]`** | **在会话内断开，返回菜单** |

---

### 截图

#### Web

| 会话列表 | Agent 终端 |
|---|---|
| <img src="assets/screenshots/web-home-desktop.jpg" alt="Web 会话列表" width="520"> | <img src="assets/screenshots/web-terminal-desktop.png" alt="Web 终端" width="520"> |

| 文件浏览器 | 共享终端 |
|---|---|
| <img src="assets/screenshots/web-file-browser-desktop.jpg" alt="Web 文件浏览器" width="520"> | <img src="assets/screenshots/web-shell-desktop.png" alt="Web 共享终端" width="520"> |

| 外观设置 | 终端与目录设置 |
|---|---|
| <img src="assets/screenshots/web-settings-appearance.jpg" alt="外观设置" width="520"> | <img src="assets/screenshots/web-settings-terminal.jpg" alt="终端与目录设置" width="520"> |

#### 移动端

| 会话列表 | Agent 终端 | 文件浏览器 | 设置 |
|---|---|---|---|
| <img src="assets/screenshots/mobile-home.jpg" alt="移动端会话列表" width="220"> | <img src="assets/screenshots/mobile-terminal.jpg" alt="移动端终端" width="220"> | <img src="assets/screenshots/mobile-file-browser.jpg" alt="移动端文件浏览器" width="220"> | <img src="assets/screenshots/mobile-settings.jpg" alt="移动端设置" width="220"> |

#### TUI

| 会话列表 | 会话操作 |
|---|---|
| <img src="assets/screenshots/tui-session-list.png" alt="TUI 会话列表" width="420"> | <img src="assets/screenshots/tui-session-actions.png" alt="TUI 会话操作" width="420"> |

---

### URL 路由

| URL | 说明 |
|-----|------|
| `/#/` | 首页 |
| `/#/new` | 新建对话 |
| `/#/session/:id` | 打开指定会话 |
| `/#/settings` | 设置页 |

---

## English

### How Multi-Client Sync Works

RemoteCC's core is **one PTY process, multiple synchronized observers**:

```
Agent PTY (always running)
        ├──▶ Browser WebSocket (phone/tablet/PC)
        ├──▶ rcc-tui (local interactive TUI)
        └──▶ remotecc attach (enter TUI to attach session)
```

Input from any client is visible to all others in real time. The PTY runs independently — closing the browser or dropping SSH does not interrupt the agent.

The Web client uses WebSocket for live state and terminal transport by default. If the access gateway does not support WebSocket Upgrade, the home page refreshes the session list by HTTP polling, and terminals automatically switch to HTTP long-polling fallback.

---

### Web Interface

Open `http://<server>:8310` in a browser and log in.

#### Conversation List (Home)

| Element | Description |
|---------|-------------|
| Green ● | Session running |
| Gray ○ | Session ended (auto-removed after 5s) |
| Session name | Defaults to directory name; double-click to rename |
| Time | Last active time |
| `≡` | View log |
| `✕` | Close/delete session |

#### New Conversation

- **New tab**: Choose Claude Code, Codex, or Grok, enter a working directory or pick one from the directory picker, enter a session name → start
- **Launch args**: optional; split with shell quoting rules and appended to the agent command line as-is, e.g. `--model opus`. Remembered per agent on the page and also available when resuming
- **Resume tab**: Browse Claude Code / Codex / Grok history grouped by working directory → resume
- **Proxy**: Configure `CODEX_PROXY` / `CLAUDE_PROXY` during installation; proxy variables are scoped to the agent CLI and are not global RemoteCC proxy settings.

#### Terminal Shortcuts

| Shortcut | Function |
|----------|----------|
| Shift+Tab | Switch Claude mode (Plan/Auto/Act) |
| Ctrl+Shift+C | Copy selection |
| Ctrl+Shift+V | Paste |
| Right-click | Context menu (Copy/Paste/Clear) |

#### Symbol Bar

- The shortcut bar is shown only on mobile; desktop keeps the full terminal area.
- **CC mode** (blue): `M`(Shift+Tab) `Esc` `Tab` `/` `!` `↑↓←→` `⏎`
- **SH mode** (yellow, auto-switch when `!` is first char): two-row mobile-only terminal panel; row 1 is `ESC` `/` `|` `-` `HOME` `↑` `END` `TAB`, row 2 is `FN` `CTRL` `ALT` `←` `↓` `→` `~`; tap `CTRL`, then type `x` to send `Ctrl+x`
- `Ctrl+]` detaches from session back to menu

#### File Browser (folder icon, top right)

Click the folder icon to open the file browser, which defaults to the server root directory `/`:

- **Left panel**: directory listing, double-click to enter, toggle hidden files
- **Right panel**: file preview (text/code with line numbers, images)
- **New folder**: click the folder-plus tool button to create a subdirectory in the current directory
- **Copy path**: hover over an entry and click the copy path button; also available in the preview header
- **Upload / download**: click the upload button or drop files onto the browser to upload into the current directory (live progress, speed and ETA, cancellable; max 10 GB per file); the download button hands the file to the browser's native downloader

#### Shared Terminal (terminal icon, top right)

The terminal button opens a normal PTY. It does not enter the agent session list, but it is kept as one foreground terminal session: closing the page, network disconnects, or refreshes do not kill it, reopening replays recent output, and multiple Web clients attach to the same terminal. It prefers `zsh`, then `fish`, `bash`, and `sh`; set `RCC_SHELL` or `REMOTECC_SHELL` to override it.

If WebSocket is unavailable, the terminal automatically switches to HTTP long-polling transport and keeps retrying after disconnects.

#### Settings (settings icon, top right)

- **Appearance**: 9 UI styles, 12 dark and 9 light color themes, 6 icon styles; defaults to Studio + Aurora + Material
- **Terminal**: font (including MesloLG NF family) / size / line-height / cursor / scrollback / symbol bar
- **Connection**: reconnect delays
- **Remote control**: file browser default path, terminal cwd, new-session default directory
- **Account**: current user, Web login password change, sign out
- **Language**: 中文 / English; settings, help, descriptions, and icon tooltips switch together

Web settings are stored on the server in `~/.rcc/web-settings.json`, so default directories, themes, terminal preferences, and language survive RemoteCC restarts. Existing browser `localStorage` settings are migrated automatically the first time the backend settings file does not exist.

---

### CLI Tools

#### remotecc

Unified management entry point:

```bash
remotecc                   # Open TUI
remotecc attach            # Open TUI
remotecc attach <name>     # Open TUI and attach to named session directly
remotecc ls                # List all sessions
remotecc log <name>        # tail -f session log
```

**Detach**: `Ctrl+]` (does not kill the PTY)

#### rcc-tui (Recommended)

Local interactive TUI — no login required, connects directly via Unix Socket:

```bash
rcc-tui
```

Displays a large-text banner and session list on launch. `rcc-tui` reads `~/.rcc/server.lock` and the project `.env` to detect the service port; if another process occupies the port, `rcc-server status` shows the owner:

```
  ██████╗  ██████╗ ██████╗
  ...
  ● Service running  :8310

  Conversation List
  ─────────────────────────
   › ● my-project  ~/project  3m ago
     ＋  New conversation
     ⏎  Resume history
     ✕  Exit
```

**Keyboard**:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move cursor |
| `Enter` | Confirm / enter |
| `q` / `Esc` | Back to previous page |
| `Ctrl+C` | Quit rcc-tui |
| **`Ctrl+]`** | **Detach from session, back to menu** |

---

### Screenshots

#### Web

| Sessions | Agent terminal |
|---|---|
| <img src="assets/screenshots/web-home-desktop.jpg" alt="Web sessions" width="520"> | <img src="assets/screenshots/web-terminal-desktop.png" alt="Web terminal" width="520"> |

| File browser | Shared terminal |
|---|---|
| <img src="assets/screenshots/web-file-browser-desktop.jpg" alt="Web file browser" width="520"> | <img src="assets/screenshots/web-shell-desktop.png" alt="Web shared terminal" width="520"> |

| Appearance settings | Terminal and path settings |
|---|---|
| <img src="assets/screenshots/web-settings-appearance.jpg" alt="Appearance settings" width="520"> | <img src="assets/screenshots/web-settings-terminal.jpg" alt="Terminal and path settings" width="520"> |

#### Mobile

| Sessions | Agent terminal | File browser | Settings |
|---|---|---|---|
| <img src="assets/screenshots/mobile-home.jpg" alt="Mobile sessions" width="220"> | <img src="assets/screenshots/mobile-terminal.jpg" alt="Mobile terminal" width="220"> | <img src="assets/screenshots/mobile-file-browser.jpg" alt="Mobile file browser" width="220"> | <img src="assets/screenshots/mobile-settings.jpg" alt="Mobile settings" width="220"> |

#### TUI

| Session list | Session actions |
|---|---|
| <img src="assets/screenshots/tui-session-list.png" alt="TUI session list" width="420"> | <img src="assets/screenshots/tui-session-actions.png" alt="TUI session actions" width="420"> |

---

### URL Routes

| URL | Description |
|-----|-------------|
| `/#/` | Home |
| `/#/new` | New conversation |
| `/#/session/:id` | Open specific session |
| `/#/settings` | Settings |

---

## 更新记录 / Changelog

### 2026-09-24

**终端渲染**：改用 WebGL 渲染，选区与文字对齐；字体、字号变化后同步列数，PC 端右侧不再截掉字符。

**滚动**：上划查看历史不再被拉回，10 秒无操作后自动回到底部；新增「回到底部」按钮，手机滑动支持惯性。

**配色**：Agent 查询终端颜色时正常应答，配色跟随主题；在 Agent 会话中启动服务时，新会话不再继承关闭颜色等设置。

**上传**：实时进度、速度、剩余时间，可取消；单文件上限 10 GB。

### 2026-09-23

**大文件传输**：上传、下载改为流式处理，大文件不再卡死。

**启动参数**：新建或恢复会话时可填写 `--model xxx` 等参数，原样传给 Agent。

**Grok**：新增 Grok Agent，支持新建、历史恢复和自定义命令。

**会话**：同一目录可同时开多个会话；启动失败原因直接显示在终端中。

### 2026-06-04

**共享终端**：Web 终端改为单个前台共享会话，支持断线重连、历史回放和多端同步。

**移动端终端**：修复手机端无法输入的问题，并支持上滑查看历史、文本选择复制、默认 MesloLGM NF 字体和终端专用 `CTRL` / `ALT` / `FN` 快捷键。

**设置页优化**：移动端 UI 风格预览改为整宽卡片，避免预览图被窄列压扁。

**文档截图**：接入新版截图，按桌面、手机、TUI 分组展示。

<details>
<summary>更早更新 / Older</summary>

### 2026-06-03

**TUI 断开修复**：修复 `rcc-tui` 新建会话后第一次 `Ctrl+]` 无法正常回菜单的问题。

**新建任务目录选择**：Web 新建会话支持通过目录选择器挑选工作目录。

**文件浏览器**：默认从 `/` 打开，支持新建文件夹、点击/拖拽上传到当前目录和下载文件。

**共享终端**：Web 顶栏通用终端入口改为单个前台共享终端，会话断开后仍保留，重新打开会回放最近输出。

**图标与主题**：Web 顶栏、文件管理器、设置页和操作按钮使用统一 SVG 图标系统；默认 Material 风格，支持 6 种图标风格、9 种 UI 风格、深色 12 套 / 浅色 9 套配色。

**设置增强**：设置页支持默认目录配置和 Web 登录密码修改。

**设置持久化**：Web 设置会保存到后端 `~/.rcc/web-settings.json`，默认目录、主题、终端偏好和语言在 RemoteCC 重启后仍然有效。

**帮助文档**：帮助页支持中英文切换和内嵌截图展示，移动端使用左侧章节抽屉。

### 2026-05-21

**Codex 历史恢复**：恢复列表改为读取 `~/.codex/sessions/` 中的真实会话元数据，按工作目录分组；恢复时会使用原始 cwd，不再退回 `~`。

**恢复界面**：Web/TUI 的 Codex 历史按工作目录展示，去掉 `~/.codex/history.jsonl` 这一层无意义容器。

**移动端终端**：优化 xterm 异步写入后的自动锁底和用户滚动识别，减少 Codex 输出底部留白。

**终端快捷键**：移动端终端面板改为两行布局，支持 `CTRL` / `ALT` / `FN` 一次性修饰键，适配 zsh/fish/bash/tmux 常用操作。

**终端字体**：默认使用 MesloLGM NF，并内置 MesloLGS NF / MesloLGM NF / MesloLGL NF Web 字体，手机端也能渲染 Nerd Font 图标。

### 2026-05-19

**Codex Agent**：新建会话支持选择 Claude Code 或 Codex；Web、TUI 和会话列表都会保留并展示 Agent 类型。

**历史恢复**：Claude Code 继续读取 `~/.claude/projects/`，Codex 支持恢复历史对话。

**Agent 代理**：安装和 `remotecc update` 可补充 `CODEX_PROXY` / `CLAUDE_PROXY`；代理只注入 Agent CLI，不作为 RemoteCC 全局代理。

**服务状态**：`rcc-tui` 改进服务检测；`rcc-server status/start` 在端口被占用时显示占用进程。

### 2026-05-12

**文件浏览器**：Web 界面新增文件浏览功能。顶栏点击 ⊞ 打开，支持目录导航、文本/图片预览、复制路径、一键 cd 到终端。

**热重载架构**：服务拆分为 proxy.js（常驻）和 app.js（可热重启）。执行 `rcc-server reload` 仅重启业务层，WS 连接和 Agent 会话不中断。

**rcc-server 命令**：

| 命令 | 说明 |
|------|------|
| `rcc-server reload` | 热重载（改了 app.js 层代码用此命令，不断会话） |
| `rcc-server restart` | 完整重启（改了 proxy.js/auth.js 等核心文件用此命令） |

</details>

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
