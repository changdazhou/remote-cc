# 安装指南

## 快速安装（推荐）

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

安装脚本会自动完成所有步骤：检测环境、安装依赖、构建前端、注册命令行工具，并可选立即启动服务。

---

## 手动安装

### 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18，推荐 v24（使用 nvm 安装） |
| 操作系统 | Linux / macOS |
| Claude Code | 已安装并可执行 |
| 内存 | >= 512MB |

### 第一步：克隆项目

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
```

### 第二步：安装 Claude Code（如未安装）

```bash
npm install -g @anthropic-ai/claude-code
```

安装脚本会自动检测 Claude Code 路径。如检测不到，会报错并提示安装命令。

### 第三步：安装后端依赖

```bash
cd server
npm install
```

> `node-pty` 含 C++ 原生绑定，安装时会自动编译。需要系统安装 `python3` 和 `make`。
>
> CentOS/RHEL：`yum install python3 make gcc-c++`
> Ubuntu/Debian：`apt install python3 make g++`

### 第四步：安装前端依赖并构建

```bash
cd ../client
npm install
npm run build
```

构建产物输出到 `client/dist/`，服务端会自动 serve 这个目录。

### 第五步：配置环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RC_USER` | `admin` | 登录用户名 |
| `RC_PASS` | — | 登录密码（**必须设置**） |
| `PORT` | `3000` | 监听端口 |
| `IS_SANDBOX` | — | 设为 `1` 则自动跳过权限确认 |

**重要**：生产环境务必设置强密码。

### 第六步：启动服务

#### 守护进程启动（推荐）

```bash
# 安装后命令行工具已注册到 PATH
rcc start

# 其他管理命令
rcc status   # 查看运行状态
rcc stop     # 停止服务
rcc restart  # 重启服务
```

启用 IS_SANDBOX 模式：

```bash
IS_SANDBOX=1 RC_USER=admin RC_PASS=yourpassword PORT=8310 rcc start
```

#### 直接启动（前台，调试用）

```bash
cd server
RC_USER=admin RC_PASS=yourpassword PORT=8310 node index.js
```

### 第七步：安装命令行工具

```bash
# 安装到 PATH（需要 sudo 或有 /usr/local/bin 写权限）
ln -sf $(pwd)/rcc       /usr/local/bin/rcc
ln -sf $(pwd)/rcc-tui   /usr/local/bin/rcc-tui
ln -sf $(pwd)/rcc-server /usr/local/bin/rcc-server
```

### 第八步：验证安装

```bash
# 检查服务是否正常响应
curl http://localhost:8310/

# 检查会话列表
rcc status
rcc ls
```

---

## 使用 systemd（可选）

创建 `/etc/systemd/system/remotecc.service`：

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
ExecStart=/root/.nvm/versions/node/v24.13.0/bin/node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable remotecc
systemctl start remotecc
```

---

## 防火墙配置

```bash
# iptables
iptables -A INPUT -p tcp --dport 8310 -j ACCEPT

# firewalld
firewall-cmd --permanent --add-port=8310/tcp
firewall-cmd --reload
```

---

## HTTPS 配置（推荐）

生产环境建议通过 Nginx 反代并启用 HTTPS（WebSocket 需要 wss://）：

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
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

---

## 更新

```bash
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
rcc restart
```

---

## 数据目录

RemoteCC 使用 `~/.rcc/` 存储运行时数据：

```
~/.rcc/
├── logs/          # 每个 PTY session 的输出日志（最多 9000 行）
├── sockets/       # Unix domain socket（用于本地终端直连）
├── sessions.json  # 会话元数据（每次启动自动清空）
├── server.lock    # 单实例锁（含 pid 和端口）
└── local.token    # 本地认证 token（rcc-tui 使用，权限 600）
```

> 每次服务重启，`sessions.json` 和日志文件都会被清空。

---

## Windows 安装

### 系统要求

- Windows 10 1809+ 或 Windows 11（需要 ConPTY 支持）
- Node.js >= 18（推荐 v24 LTS）
- Visual C++ Build Tools（node-pty 原生编译）
- Claude Code 已安装

### 安装 Visual C++ Build Tools

```powershell
# 方法1：通过 npm 安装 windows-build-tools（推荐）
npm install -g windows-build-tools

# 方法2：手动安装 Visual Studio Build Tools
# 下载 https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 勾选 "C++ build tools"
```

### 安装依赖与启动

```powershell
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc\server
npm install

cd ..\client
npm install
npm run build

# 启动服务
cd ..\server
$env:RC_USER="admin"; $env:RC_PASS="yourpassword"; $env:PORT="8310"
node index.js
```

### 配置 Claude 路径（Windows）

通过环境变量 `CLAUDE_BIN` 指定：

```powershell
$env:CLAUDE_BIN = "C:\Users\username\AppData\Roaming\npm\claude.cmd"
```

或在 `install.sh` / `pty-manager.js` 中手动修改 `findClaudeBin()` 函数。

### Windows 防火墙

```powershell
New-NetFirewallRule -DisplayName "RemoteCC" -Direction Inbound -Protocol TCP -LocalPort 8310 -Action Allow
```

> Windows 使用 Named Pipe（`\\.\pipe\rcc-<sessionId>`）替代 Unix Socket，`rcc-tui` 功能同样支持。
