#!/usr/bin/env bash
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  RemoteCC — 一键交互式部署脚本                                           │
# │  用法: bash install.sh                                                   │
# └─────────────────────────────────────────────────────────────────────────┘
set -euo pipefail

R='\033[0m' B='\033[1m' D='\033[2m'
CYAN='\033[36m' GREEN='\033[32m' YELLOW='\033[33m' RED='\033[31m' GRAY='\033[90m'

W=$(tput cols 2>/dev/null || echo 80)
HR=$(printf '%0.s─' $(seq 1 $W))

print_banner() {
  clear
  echo -e "${CYAN}${B}"
  echo "  ██████╗  ██████╗ ██████╗ "
  echo "  ██╔══██╗██╔════╝██╔════╝ "
  echo "  ██████╔╝██║     ██║      "
  echo "  ██╔══██╗██║     ██║      "
  echo "  ██║  ██║╚██████╗╚██████╗ "
  echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ "
  echo -e "${R}"
  echo -e "  ${B}Remote Claude Code${R}  ${GRAY}— 多端协同终端工具${R}"
  echo -e "  ${D}${HR}${R}"
  echo ""
}

step() { echo -e "\n  ${CYAN}${B}▶ $1${R}"; }
ok()   { echo -e "  ${GREEN}✓ $1${R}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${R}"; }
err()  { echo -e "  ${RED}✗ $1${R}"; exit 1; }
info() { echo -e "  ${GRAY}$1${R}"; }
ask()  { echo -en "  ${CYAN}$1${R}"; }

confirm() {
  local default="${1:-y}"
  local prompt="(Y/n)"; [[ "$default" == "n" ]] && prompt="(y/N)"
  ask "$2 $prompt: "; read -r ans; ans="${ans:-$default}"
  [[ "$ans" =~ ^[Yy] ]]
}

input() {
  local def="${1:-}" msg="$2"
  [[ -n "$def" ]] && ask "$msg [${def}]: " || ask "$msg: "
  read -r val; echo "${val:-$def}"
}

# ═══════════════════════════════════════════════════════════════════════════════
print_banner
echo -e "  欢迎使用 ${B}RemoteCC${R} 一键部署向导\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Step 1: 检查环境 ──────────────────────────────────────────────────────────
step "检查运行环境"

# Node.js
if ! command -v node &>/dev/null; then err "未找到 Node.js，请先安装 Node.js >= v18"; fi
NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
[[ "$NODE_MAJOR" -ge 18 ]] || err "Node.js 版本过低 ($NODE_VER)，需要 >= v18"
ok "Node.js $NODE_VER"

# npm
command -v npm &>/dev/null || err "未找到 npm"
ok "npm $(npm --version)"

# ── Step 2: 自动检测 Claude Code ─────────────────────────────────────────────
step "检测 Claude Code"

CLAUDE_BIN=""

# 自动检测候选路径
NVM_NODE_DIRS=()
if [[ -d "$HOME/.nvm/versions/node" ]]; then
  while IFS= read -r d; do NVM_NODE_DIRS+=("$d"); done < \
    <(ls -1 "$HOME/.nvm/versions/node/" 2>/dev/null | sort -rV | head -5)
fi

CANDIDATES=(
  "$(command -v claude 2>/dev/null || true)"
)
for v in "${NVM_NODE_DIRS[@]}"; do
  CANDIDATES+=("$HOME/.nvm/versions/node/$v/bin/claude")
done

for c in "${CANDIDATES[@]}"; do
  if [[ -n "$c" && -x "$c" ]]; then
    CLAUDE_BIN="$c"
    CLAUDE_VER=$("$CLAUDE_BIN" --version 2>/dev/null | head -1 || echo "unknown")
    ok "Claude Code: $CLAUDE_BIN ($CLAUDE_VER)"
    break
  fi
done

if [[ -z "$CLAUDE_BIN" ]]; then
  err "未找到 Claude Code。请先安装：npm install -g @anthropic-ai/claude-code"
fi

# ── Step 3: IS_SANDBOX 自动检测 ──────────────────────────────────────────────
step "检测沙箱环境"

IS_SANDBOX_FLAG=""
if [[ "${IS_SANDBOX:-}" == "1" ]]; then
  warn "检测到 IS_SANDBOX=1 环境变量，将启用危险模式"
  IS_SANDBOX_FLAG="IS_SANDBOX=1 "
else
  info "未检测到沙箱环境，使用普通模式"
  info "如需危险模式，可在启动时手动设置 IS_SANDBOX=1"
fi

# ── Step 4: 服务配置 ──────────────────────────────────────────────────────────
step "配置服务参数"

RC_USER=$(input "admin" "管理员用户名")
echo -n "  密码（不显示）: "; read -rs RC_PASS; echo ""
[[ -z "$RC_PASS" ]] && err "密码不能为空"
[[ "$RC_PASS" == "changeme" ]] && warn "建议使用更安全的密码"
PORT=$(input "8310" "监听端口")
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || err "端口号无效: $PORT"
ok "配置完成：$RC_USER @ :$PORT"

# ── Step 5: 更新 Claude 路径到 pty-manager ───────────────────────────────────
step "写入配置"

PTY_FILE="$SCRIPT_DIR/server/pty-manager.js"
if [[ -f "$PTY_FILE" ]]; then
  sed -i "s|return '/root/.nvm/versions/node/v[^']*'|return '$CLAUDE_BIN'|g" "$PTY_FILE" 2>/dev/null || true
  ok "Claude 路径已写入 pty-manager.js"
fi

ENV_FILE="$SCRIPT_DIR/.env"
cat > "$ENV_FILE" << EOF
# RemoteCC 环境配置（由 install.sh 生成 $(date '+%Y-%m-%d %H:%M')）
RC_USER=${RC_USER}
RC_PASS=${RC_PASS}
PORT=${PORT}
CLAUDE_BIN=${CLAUDE_BIN}
${IS_SANDBOX_FLAG:+IS_SANDBOX=1}
EOF
chmod 600 "$ENV_FILE"
ok ".env 已生成（权限 600）"

# ── Step 6: 安装依赖 ──────────────────────────────────────────────────────────
step "安装依赖"

echo -e "  ${GRAY}安装服务端（含 node-pty 原生编译）...${R}"
(cd "$SCRIPT_DIR/server" && npm install --loglevel=warn 2>&1 | tail -2)
ok "服务端依赖完成"

echo -e "  ${GRAY}安装前端依赖...${R}"
(cd "$SCRIPT_DIR/client" && npm install --loglevel=warn 2>&1 | tail -2)
ok "前端依赖完成"

# ── Step 7: 构建前端 ──────────────────────────────────────────────────────────
step "构建前端"

(cd "$SCRIPT_DIR/client" && npm run build 2>&1 | tail -3)
ok "前端已构建 → client/dist/"

# ── Step 8: 安装命令行工具 ────────────────────────────────────────────────────
step "安装命令行工具"

BIN_DIR="/usr/local/bin"
for tool in rcc rcc-tui rcc-server; do
  src="$SCRIPT_DIR/$tool"
  [[ -f "$src" ]] || continue
  chmod +x "$src"
  if ln -sf "$src" "$BIN_DIR/$tool" 2>/dev/null; then
    ok "$tool → $BIN_DIR/$tool"
  else
    warn "无法写入 $BIN_DIR，跳过 $tool（可手动 ln -s $src $BIN_DIR/$tool）"
  fi
done

# 更新 rcc-server 脚本里的项目路径
sed -i "s|RCC_DIR=\"/paddle/project/local_tools/remote_cc\"|RCC_DIR=\"$SCRIPT_DIR\"|g" \
  "$SCRIPT_DIR/rcc-server" 2>/dev/null || true

# ── Step 9: 启动服务 ──────────────────────────────────────────────────────────
step "启动服务"

if confirm "y" "现在启动 RemoteCC 服务?"; then
  pkill -f "node.*index.js" 2>/dev/null || true; sleep 1
  (cd "$SCRIPT_DIR/server" && \
    RC_USER="$RC_USER" RC_PASS="$RC_PASS" PORT="$PORT" \
    ${IS_SANDBOX_FLAG}CLAUDE_BIN="$CLAUDE_BIN" \
    node index.js > /tmp/rcc.log 2>&1) &
  SVC_PID=$!
  sleep 2
  if kill -0 "$SVC_PID" 2>/dev/null; then
    ok "服务已启动（pid $SVC_PID，端口 $PORT）"
  else
    err "服务启动失败，查看日志: cat /tmp/rcc.log"
  fi
fi

# ── 完成提示 ──────────────────────────────────────────────────────────────────
IFACE_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' \
  || hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP")

echo ""
echo -e "  ${D}${HR}${R}"
echo -e "\n  ${GREEN}${B}✓ 部署完成！${R}\n"
echo -e "  ${B}Web 访问${R}"
echo -e "    本机:    ${CYAN}http://localhost:${PORT}${R}"
echo -e "    局域网:  ${CYAN}http://${IFACE_IP}:${PORT}${R}"
echo ""
echo -e "  ${B}账号${R}  ${RC_USER} / ${D}(已配置)${R}"
echo ""
echo -e "  ${B}常用命令${R}"
echo -e "    ${CYAN}rcc start${R}    启动服务"
echo -e "    ${CYAN}rcc stop${R}     停止服务"
echo -e "    ${CYAN}rcc status${R}   服务状态"
echo -e "    ${CYAN}rcc ls${R}       查看会话"
echo -e "    ${CYAN}rcc-tui${R}      交互式 TUI"
echo ""
echo -e "  ${D}${HR}${R}\n"
