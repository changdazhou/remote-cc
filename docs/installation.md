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

---

### 手动安装

#### 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18，推荐 v24 |
| 操作系统 | Linux / macOS |
| Claude Code | 已安装（`npm install -g @anthropic-ai/claude-code`） |
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
| `PORT` | `3000` | 监听端口 |
| `IS_SANDBOX` | — | 设为 `1` 自动跳过权限确认 |

#### 4. 安装命令行工具

```bash
ln -sf $(pwd)/rcc        /usr/local/bin/rcc
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

---

### Manual Installation

#### Requirements

| Item | Requirement |
|------|-------------|
| Node.js | >= 18, v24 recommended |
| OS | Linux / macOS |
| Claude Code | Installed (`npm install -g @anthropic-ai/claude-code`) |
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
| `PORT` | `3000` | Listen port |
| `IS_SANDBOX` | — | Set to `1` to skip permission prompts |

#### 4. Install CLI Tools

```bash
ln -sf $(pwd)/rcc        /usr/local/bin/rcc
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
├── server.lock    # Single-instance lock
└── local.token    # Local auth token (chmod 600)
```

---

## License / 许可证

Apache 2.0 — see [LICENSE](../LICENSE)
