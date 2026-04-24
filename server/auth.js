const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const RC_USER = process.env.RC_USER || 'admin';
const RC_PASS = process.env.RC_PASS || 'changeme';

// 内存 token 池，value = 过期时间
const tokens = new Map();
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30天

function genToken() { return crypto.randomBytes(32).toString('hex'); }

function createToken() {
  const tok = genToken();
  tokens.set(tok, Date.now() + TOKEN_TTL);
  return tok;
}

function validateToken(tok) {
  if (!tok) return false;
  const exp = tokens.get(tok);
  if (!exp) return false;
  if (Date.now() > exp) { tokens.delete(tok); return false; }
  return true;
}

// ── 本地令牌：服务启动时生成，写入 ~/.rcc/local.token ─────────────────────
// rcc-tui 等本地工具直接读这个文件，无需账号密码
const LOCAL_TOKEN_FILE = path.join(os.homedir(), '.rcc', 'local.token');

function initLocalToken() {
  const tok = genToken();
  tokens.set(tok, Date.now() + 365 * 24 * 60 * 60 * 1000); // 1年有效
  try {
    fs.mkdirSync(path.dirname(LOCAL_TOKEN_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_TOKEN_FILE, tok, { mode: 0o600 });
  } catch (_) {}
  return tok;
}

// 启动时立即生成本地 token
const LOCAL_TOKEN = initLocalToken();

// 进程退出时清除本地 token 文件
process.on('exit', () => { try { fs.unlinkSync(LOCAL_TOKEN_FILE); } catch (_) {} });

// POST /api/login → { token }
function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (username === RC_USER && password === RC_PASS) {
    res.json({ token: createToken() });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

// HTTP 中间件：跳过 /api/login，其余验证 Bearer token
function httpAuth(req, res, next) {
  if (req.path === '/api/login') return next();
  const auth = req.headers['authorization'] || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : req.query.token;
  if (validateToken(tok)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// WS upgrade 验证：?token=xxx
function wsAuth(req) {
  const url = new URL(req.url, 'http://localhost');
  const tok = url.searchParams.get('token');
  return validateToken(tok);
}

module.exports = { httpAuth, wsAuth, loginHandler };
