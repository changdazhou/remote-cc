const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const RC_USER = process.env.RC_USER || 'admin';
const RC_PASS = process.env.RC_PASS || 'changeme';
const AUTH_FILE = path.join(os.homedir(), '.rcc', 'auth.json');
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

// 内存 token 池，value = { exp, local }
const tokens = new Map();
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30天

function genToken() { return crypto.randomBytes(32).toString('hex'); }

function createToken(local = false) {
  const tok = genToken();
  tokens.set(tok, { exp: Date.now() + TOKEN_TTL, local });
  return tok;
}

function validateToken(tok) {
  if (!tok) return false;
  const meta = tokens.get(tok);
  if (!meta) return false;
  const exp = typeof meta === 'number' ? meta : meta.exp;
  if (Date.now() > exp) { tokens.delete(tok); return false; }
  return true;
}

// token 失效时通知持有长连接的一方（WS 只在握手时鉴权，改密码后已建立的连接要主动断开）
const invalidationListeners = new Set();
function onTokensInvalidated(listener) {
  invalidationListeners.add(listener);
}

function invalidateWebTokens() {
  for (const [tok, meta] of tokens.entries()) {
    if (typeof meta === 'number' || !meta.local) tokens.delete(tok);
  }
  for (const listener of invalidationListeners) {
    try { listener(); } catch (_) {}
  }
}

// ── 登录限流：按来源 IP 统计失败次数，防止暴力猜密码 ──────────────────────────
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginFailures = new Map(); // ip → { count, first }

function loginBlocked(ip) {
  const rec = loginFailures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) { loginFailures.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_FAILURES;
}

function recordLoginResult(ip, ok) {
  if (ok) { loginFailures.delete(ip); return; }
  const now = Date.now();
  const rec = loginFailures.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) loginFailures.set(ip, { count: 1, first: now });
  else rec.count++;
  if (loginFailures.size > 10000) {
    for (const [key, item] of loginFailures) if (now - item.first > LOGIN_WINDOW_MS) loginFailures.delete(key);
  }
}

// 返回 { status, body }，供 proxy.js（原生 http）和 index.js（express）共用
function attemptLogin(ip, username, password) {
  if (loginBlocked(ip)) return { status: 429, body: { error: 'Too many failed attempts, try again later' } };
  const ok = validateCredentials(username, password);
  recordLoginResult(ip, ok);
  return ok ? { status: 200, body: { token: createToken() } } : { status: 401, body: { error: 'Invalid credentials' } };
}

function publicError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function readAuthOverride() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (!data || data.version !== 1 || !data.passwordHash || !data.salt) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(a || '', 'hex');
  const right = Buffer.from(b || '', 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function timingSafeEqualText(a, b) {
  // 先做摘要再比较，长度固定，避免按字节提前返回泄露密码前缀
  const left = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const right = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password) {
  const override = readAuthOverride();
  if (!override) return timingSafeEqualText(password, RC_PASS);
  const computed = hashPassword(password || '', override.salt);
  return timingSafeEqualHex(computed, override.passwordHash);
}

function effectiveUsername() {
  return readAuthOverride()?.username || RC_USER;
}

function validateCredentials(username, password) {
  return username === effectiveUsername() && verifyPassword(password);
}

function validateNewPassword(password) {
  if (typeof password !== 'string') throw publicError('New password is required');
  if (password.length < 8) throw publicError('New password must be at least 8 characters');
  if (password.length > 256) throw publicError('New password is too long');
}

function writeAuthOverride(record) {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const tmp = `${AUTH_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, AUTH_FILE);
  try { fs.chmodSync(AUTH_FILE, 0o600); } catch (_) {}
}

function changePassword(currentPassword, newPassword) {
  if (!verifyPassword(currentPassword || '')) {
    throw publicError('Current password is incorrect', 403);
  }
  validateNewPassword(newPassword);
  const salt = crypto.randomBytes(16).toString('hex');
  writeAuthOverride({
    version: 1,
    username: effectiveUsername(),
    passwordHash: hashPassword(newPassword, salt),
    salt,
    algorithm: 'scrypt',
    params: SCRYPT_OPTIONS,
    updatedAt: new Date().toISOString(),
  });
  invalidateWebTokens();
}

// ── 本地令牌：服务启动时生成，写入 ~/.rcc/local.token ─────────────────────
// rcc-tui 等本地工具直接读这个文件，无需账号密码
const LOCAL_TOKEN_FILE = path.join(os.homedir(), '.rcc', 'local.token');

function initLocalToken() {
  const tok = genToken();
  tokens.set(tok, { exp: Date.now() + 365 * 24 * 60 * 60 * 1000, local: true }); // 1年有效
  // 写入文件延迟到 proxy 确认端口监听成功后（由 proxy.js 调用 writeLocalToken）
  // 避免 watchdog 重试期间多个进程竞争写入不同 token
  return tok;
}

// 启动时立即生成本地 token
const LOCAL_TOKEN = initLocalToken();

// 注意：local.token 由 rcc-server stop 脚本负责清理
// 这里不在 exit 时删除，避免 watchdog 重启时短暂消失导致 rcc-tui 读到无效 token

// POST /api/login → { token }
function loginHandler(req, res) {
  const { username, password } = req.body || {};
  const result = attemptLogin(req.socket?.remoteAddress || '', username, password);
  res.status(result.status).json(result.body);
}

function changePasswordHandler(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  try {
    changePassword(currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'Bad request' });
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
  const tok = wsToken(req);
  return validateToken(tok);
}

function wsToken(req) {
  // 畸形的 upgrade 目标会让 new URL 抛错；这里在 upgrade 事件里同步执行，抛出会直接打崩进程
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams.get('token') || '';
  } catch (_) {
    return '';
  }
}

module.exports = {
  httpAuth,
  wsAuth,
  loginHandler,
  changePasswordHandler,
  validateCredentials,
  changePassword,
  invalidateWebTokens,
  onTokensInvalidated,
  attemptLogin,
  wsToken,
  validateTokenExported: validateToken,
  createTokenExported: createToken,
  LOCAL_TOKEN_FILE,
  LOCAL_TOKEN,
  AUTH_FILE,
  writeLocalToken: () => {
    try {
      fs.mkdirSync(path.dirname(LOCAL_TOKEN_FILE), { recursive: true });
      fs.writeFileSync(LOCAL_TOKEN_FILE, LOCAL_TOKEN, { mode: 0o600 });
    } catch (_) {}
  },
};
