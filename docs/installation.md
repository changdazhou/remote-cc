# 安装指南 / Installation Guide

[中文](#中文) | [English](#english)

---

## 中文

### 快速安装（推荐）

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

安装脚本会自动：检测环境、安装依赖、构建前端、注册命令行工具，并可选立即启动服务。

**界面语言**：安装向导、`rcc-tui` 和 `remotecc` 默认中文。

```bash
bash install.sh --lang en          # 或 -L en
RCC_LANG=en bash install.sh        # 用环境变量，效果相同
```

- 优先级：`--lang` 参数 > `RCC_LANG` 环境变量 > `~/.rcc/lang` > 中文
- 显式指定语言时会写入 `~/.rcc/lang`，之后 `rcc-tui`、`remotecc`、`rcc-server` 都沿用；改回中文用 `--lang zh` 重新安装，或直接编辑该文件
- 只想临时切换一次：`RCC_LANG=en rcc-tui`
- Web 界面的语言在设置页单独切换，不受这里影响

---

### 手动安装

#### 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18，推荐 v24 |
| 操作系统 | Linux / macOS |
| Agent CLI | 至少安装一个：Claude Code（`npm install -g @anthropic-ai/claude-code`）、Codex（`npm install -g @openai/codex`）或 Grok |
| 内存 | >= 512MB |

#### 1. 克隆项目

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
```

#### 2. 安装依赖

```bash
# 服务端（含 node-pty 原生编译）
cd server && npm install

# 前端
cd ../client && npm install && npm run build
```

#### 3. 配置环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RC_USER` | `admin` | 登录用户名 |
| `RC_PASS` | — | 登录密码（**必须设置**） |
| `PORT` | `8310` | 监听端口 |
| `IS_SANDBOX` | — | 设为 `1` 自动跳过权限确认 |
| `CLAUDE_PROXY` | — | 仅 Claude Code CLI 使用的代理 URL |
| `CODEX_PROXY` | — | 仅 Codex CLI 使用的代理 URL |
| `GROK_PROXY` | — | 仅 Grok CLI 使用的代理 URL |
| `CLAUDE_BIN` / `CODEX_BIN` / `GROK_BIN` | 自动检测 | 指定 Agent 可执行文件路径（Web 设置页的「Agent 命令」优先级更高） |
| `RCC_CLAUDE_PREFERRED` / `RCC_CODEX_PREFERRED` / `RCC_GROK_PREFERRED` | — | 本机首选的同协议命令，多个用 `:` 分隔，存在时优先于原生命令和 `*_BIN`；建议写在 `~/.rcc/agent.env`（本机私有，不纳入仓库，`CODEX_HOME` 也可放在这里） |
| `AGENT_NO_PROXY` | `localhost,127.0.0.1,::1` | Agent CLI 的 NO_PROXY |

`RC_PASS` 是初始/兜底密码。通过 Web 设置页修改密码后，新密码会以 scrypt 哈希写入 `~/.rcc/auth.json`，后续登录优先使用该文件。

如果 Codex 需要代理，设置 `CODEX_PROXY=http://127.0.0.1:7890` 这类本地代理地址即可。RemoteCC 只会把它注入 Codex CLI；Codex 执行任务时会排除 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` 等代理变量，避免影响项目命令。

#### 4. 安装命令行工具

```bash
ln -sf $(pwd)/remotecc   /usr/local/bin/remotecc
ln -sf $(pwd)/rcc-tui    /usr/local/bin/rcc-tui
ln -sf $(pwd)/rcc-server /usr/local/bin/rcc-server
```

#### 5. 启动服务

```bash
remotecc start        # 守护进程启动
remotecc status       # 查看状态
remotecc stop         # 停止

# 启用沙箱模式
IS_SANDBOX=1 RC_USER=admin RC_PASS=yourpassword PORT=8310 remotecc start
```

---

### systemd 配置

```ini
[Unit]
Description=RemoteCC Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/remote-cc/server
Environment=RC_USER=admin
Environment=RC_PASS=yourpassword
Environment=PORT=8310
Environment=IS_SANDBOX=1
ExecStart=/usr/bin/env node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now remotecc
```

### HTTPS（推荐）

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    location / {
        proxy_pass http://127.0.0.1:8310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

### 更新

```bash
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
remotecc restart
```

### 数据目录

```
~/.rcc/
├── logs/          # PTY 输出日志（最多 9000 行）
├── sockets/       # Unix domain socket
├── sessions.json  # 会话元数据（每次启动清空）
├── web-settings.json # Web 设置（默认目录、主题、终端偏好等）
├── lang           # 命令行界面语言（zh / en，安装时 --lang 写入）
├── server.lock    # 单实例锁
└── local.token    # 本地认证 token（权限 600）
```

---

## English

### Quick Install (Recommended)

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

The script automatically detects the environment, installs dependencies, builds the frontend, registers CLI tools, and optionally starts the service.

**Language**: the installer, `rcc-tui` and `remotecc` default to Chinese.

```bash
bash install.sh --lang en          # or -L en
RCC_LANG=en bash install.sh        # same effect via environment variable
```

- Precedence: `--lang` flag > `RCC_LANG` environment variable > `~/.rcc/lang` > Chinese
- An explicit choice is saved to `~/.rcc/lang`, and `rcc-tui`, `remotecc` and `rcc-server` use it afterwards; switch back with `--lang zh` or edit that file
- To switch just once: `RCC_LANG=en rcc-tui`
- The Web UI language is set separately on its settings page

---

### Manual Installation

#### Requirements

| Item | Requirement |
|------|-------------|
| Node.js | >= 18, v24 recommended |
| OS | Linux / macOS |
| Agent CLI | Install at least one: Claude Code (`npm install -g @anthropic-ai/claude-code`), Codex (`npm install -g @openai/codex`), or Grok |
| Memory | >= 512MB |

#### 1. Clone

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
```

#### 2. Install Dependencies

```bash
# Server (includes native node-pty compilation)
cd server && npm install

# Frontend
cd ../client && npm install && npm run build
```

#### 3. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RC_USER` | `admin` | Login username |
| `RC_PASS` | — | Login password (**required**) |
| `PORT` | `8310` | Listen port |
| `IS_SANDBOX` | — | Set to `1` to skip permission prompts |
| `CLAUDE_PROXY` | — | Proxy URL used only by the Claude Code CLI |
| `CODEX_PROXY` | — | Proxy URL used only by the Codex CLI |
| `GROK_PROXY` | — | Proxy URL used only by the Grok CLI |
| `CLAUDE_BIN` / `CODEX_BIN` / `GROK_BIN` | auto-detected | Agent executable path (the "Agent Commands" setting in the Web UI takes precedence) |
| `RCC_CLAUDE_PREFERRED` / `RCC_CODEX_PREFERRED` / `RCC_GROK_PREFERRED` | — | Machine-local preferred same-protocol commands, `:`-separated; used before the native command and `*_BIN` when present. Best kept in `~/.rcc/agent.env` (machine-private, not in the repo; `CODEX_HOME` can go there too) |
| `AGENT_NO_PROXY` | `localhost,127.0.0.1,::1` | NO_PROXY for agent CLIs |

`RC_PASS` is the initial/fallback password. After changing the password from the Web settings page, the new password is stored as a scrypt hash in `~/.rcc/auth.json` and takes precedence for future logins.

If Codex needs a proxy, set a local proxy URL such as `CODEX_PROXY=http://127.0.0.1:7890`. RemoteCC injects it only into the Codex CLI; Codex child tasks exclude `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` so project commands are not forced through the proxy.

#### 4. Install CLI Tools

```bash
ln -sf $(pwd)/remotecc   /usr/local/bin/remotecc
ln -sf $(pwd)/rcc-tui    /usr/local/bin/rcc-tui
ln -sf $(pwd)/rcc-server /usr/local/bin/rcc-server
```

#### 5. Start Service

```bash
remotecc start        # Start as daemon
remotecc status       # Check status
remotecc stop         # Stop

# With sandbox mode
IS_SANDBOX=1 RC_USER=admin RC_PASS=yourpassword PORT=8310 remotecc start
```

---

### systemd Setup

```ini
[Unit]
Description=RemoteCC Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/remote-cc/server
Environment=RC_USER=admin
Environment=RC_PASS=yourpassword
Environment=PORT=8310
Environment=IS_SANDBOX=1
ExecStart=/usr/bin/env node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now remotecc
```

### HTTPS (Recommended)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    location / {
        proxy_pass http://127.0.0.1:8310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

### Update

```bash
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
remotecc restart
```

### Data Directory

```
~/.rcc/
├── logs/          # PTY output logs (max 9000 lines)
├── sockets/       # Unix domain sockets
├── sessions.json  # Session metadata (cleared on each restart)
├── web-settings.json # Web settings (default dirs, theme, terminal preferences)
├── lang           # CLI language (zh / en, saved by install --lang)
├── server.lock    # Single-instance lock
└── local.token    # Local auth token (chmod 600)
```

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
