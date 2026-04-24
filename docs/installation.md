# 安装指南

## 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18，推荐 v24（使用 nvm 安装） |
| 操作系统 | Linux / macOS |
| Claude Code | 已安装并可执行 |
| 内存 | >= 512MB |

## 第一步：确认 Claude Code 路径

RemoteCC 默认使用以下路径启动 claude：

```
/root/.nvm/versions/node/v24.13.0/bin/claude
```

如需修改，编辑 `server/pty-manager.js` 第一行：

```js
const CLAUDE_BIN = '/your/path/to/claude';
```

## 第二步：安装后端依赖

```bash
cd server
npm install
```

> `node-pty` 包含 C++ 原生绑定，安装时会自动编译。需要系统安装 `python3` 和 `make`。
>
> CentOS/RHEL：`yum install python3 make gcc-c++`
> Ubuntu/Debian：`apt install python3 make g++`

## 第三步：安装前端依赖并构建

```bash
cd ../client
npm install
npm run build
```

构建产物输出到 `client/dist/`，服务端会自动 serve 这个目录。

## 第四步：配置环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RC_USER` | `admin` | 登录用户名 |
| `RC_PASS` | `changeme` | 登录密码 |
| `PORT` | `3000` | 监听端口 |

**重要**：生产环境务必修改密码。

## 第五步：启动服务

### 直接启动（前台）

```bash
cd server
RC_USER=admin RC_PASS=your_secure_password PORT=8310 node index.js
```

### 守护进程启动（推荐）

```bash
# 将 rcc-server 脚本放到 PATH
ln -sf /path/to/remote_cc/rcc-server /usr/local/bin/rcc-server

# 启动（崩溃自动重启）
RC_USER=admin RC_PASS=your_password PORT=8310 rcc-server start

# 查看状态
rcc-server status

# 查看日志
rcc-server log

# 停止
rcc-server stop
```

### 使用 systemd（可选）

创建 `/etc/systemd/system/remotecc.service`：

```ini
[Unit]
Description=RemoteCC Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/remote_cc/server
Environment=RC_USER=admin
Environment=RC_PASS=your_password
Environment=PORT=8310
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

## 第六步：安装命令行工具（可选）

```bash
# rcc — 本地终端连接工具
ln -sf /path/to/remote_cc/rcc /usr/local/bin/rcc

# rcc-server — 守护进程管理
ln -sf /path/to/remote_cc/rcc-server /usr/local/bin/rcc-server
```

## 第七步：验证安装

```bash
# 检查服务是否正常响应
curl http://localhost:8310/

# 检查 API
curl -s -X POST http://localhost:8310/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
# 应返回: {"token":"..."}
```

## 防火墙配置

如需从外部访问，开放端口：

```bash
# iptables
iptables -A INPUT -p tcp --dport 8310 -j ACCEPT

# firewalld
firewall-cmd --permanent --add-port=8310/tcp
firewall-cmd --reload
```

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

## 更新

```bash
# 拉取最新代码后
cd server && npm install
cd ../client && npm install && npm run build
rcc-server restart
```

## 数据目录

RemoteCC 使用 `~/.rcc/` 存储运行时数据：

```
~/.rcc/
├── logs/       # 每个 PTY session 的完整输出日志
├── sockets/    # Unix domain socket 文件（用于 rcc attach）
└── sessions.json  # 会话元数据（启动时清空）
```

> 注意：每次服务重启，`sessions.json` 和日志文件都会被清空。如需保留日志，请在重启前手动备份 `~/.rcc/logs/`。

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

### 安装依赖

```powershell
cd remote_cc\server
npm install

cd ..\client
npm install
npm run build
```

### 启动服务

```powershell
# 直接启动
cd server
$env:RC_USER="admin"; $env:RC_PASS="your_password"; $env:PORT="8310"; node index.js

# 或使用 PowerShell 守护脚本
$env:RC_USER="admin"; $env:RC_PASS="your_password"; $env:PORT="8310"
.\rcc-server.ps1 start
.\rcc-server.ps1 status
.\rcc-server.ps1 stop
```

### 配置 Claude 路径

Windows 下 Claude 路径通过环境变量 `CLAUDE_BIN` 指定：

```powershell
$env:CLAUDE_BIN = "C:\Users\username\AppData\Roaming\npm\claude.cmd"
```

或者直接修改 `server\pty-manager.js` 里的 `findClaudeBin()` 函数。

### 使用命令行工具

```powershell
# 在 PATH 里可以直接调用
rcc ls
rcc attach
rcc log my-session

# 或用完整路径
node C:\path\to\remote_cc\rcc ls
```

将 `rcc.cmd` 所在目录加入系统 PATH，即可直接使用 `rcc` 命令。

### Windows 防火墙

```powershell
New-NetFirewallRule -DisplayName "RemoteCC" -Direction Inbound -Protocol TCP -LocalPort 8310 -Action Allow
```

### 注意事项

- Windows 使用 Named Pipe（`\\.\pipe\rcc-<sessionId>`）替代 Unix Socket
- `rcc attach` 功能在 Windows 上同样支持
- 终端颜色依赖 Windows Terminal 或 ConPTY，建议使用 Windows Terminal
