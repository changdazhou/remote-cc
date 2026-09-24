const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { normalizeAgent } = require('./agent-config');
const { readLocalAgentEnv } = require('./local-env');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_HOME_DIRS = uniquePaths([
  process.env.RCC_CODEX_HOME,
  process.env.CODEX_HOME,
  readLocalAgentEnv().CODEX_HOME,
  path.join(os.homedir(), '.codex'),
].filter(Boolean).map(expandHome));
const GROK_HOME_DIRS = uniquePaths([
  process.env.GROK_HOME,
  path.join(os.homedir(), '.grok'),
].filter(Boolean).map(expandHome));
const CODEX_HISTORY_CACHE_TTL_MS = positiveInt(process.env.RCC_HISTORY_CACHE_TTL_MS, 15000);
const CODEX_SESSION_META_BYTES = positiveInt(process.env.RCC_CODEX_SESSION_META_BYTES, 64 * 1024);
const CODEX_SESSION_META_LINES = 20;
const CLAUDE_SESSION_META_BYTES = positiveInt(process.env.RCC_CLAUDE_SESSION_META_BYTES, 256 * 1024);
const GROK_SUMMARY_MAX_BYTES = 1024 * 1024;

let codexSessionsCache = { sessions: null, expiresAt: 0 };

function expandHome(input) {
  if (!input || input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const p of paths) {
    const key = canonicalPathKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

function canonicalPathKey(p) {
  try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); }
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getProjects(agent = 'claude') {
  const id = normalizeAgent(agent);
  if (id === 'codex') return getCodexProjects();
  if (id === 'grok') return getGrokProjects();
  return getClaudeProjects();
}

function getClaudeProjects() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const projects = [];
  for (const dir of dirs) {
    const files = listClaudeSessionFiles(dir);
    if (files.length === 0) continue;
    // 只读最新 session 的头部前缀解析 cwd，避免全量读取整个历史目录
    const latest = files[0];
    const cwd = readClaudeSessionMeta(latest.filePath, latest.mtime).cwd;
    projects.push({
      id: dir,
      displayPath: cwd || dir,
      sessionCount: files.length,
      lastModified: latest.mtime.toISOString(),
    });
  }
  return projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function getSessions(projectId, agent = 'claude') {
  const id = normalizeAgent(agent);
  if (id === 'codex') return getCodexSessions(projectId);
  if (id === 'grok') return getGrokSessions(projectId);
  return getClaudeSessions(projectId);
}

function listClaudeSessionFiles(projectId) {
  const dir = path.join(CLAUDE_PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const filePath = path.join(dir, f);
      const stat = fs.statSync(filePath);
      return { file: f, filePath, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function getClaudeSessions(projectId) {
  return listClaudeSessionFiles(projectId).map(({ file, filePath, mtime }) => {
    const sessionId = file.replace('.jsonl', '');
    const preview = readClaudeSessionMeta(filePath, mtime);
    return {
      sessionId,
      projectId,
      lastModified: mtime.toISOString(),
      lastMessage: preview.lastMessage,
      messageCount: preview.messageCount,
      cwd: preview.cwd,
    };
  });
}

function readClaudeSessionMeta(filePath, mtime) {
  const prefix = readFilePrefix(filePath, CLAUDE_SESSION_META_BYTES);
  // 若一次前缀读取已覆盖整个文件，则可信为完整消息数
  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch (_) {}
  const complete = fileSize > 0 && fileSize <= CLAUDE_SESSION_META_BYTES;
  const lines = prefix.split('\n');
  // 最后一行可能被截断，若未覆盖整个文件则丢弃
  if (!complete && lines.length) lines.pop();

  let lastMessage = '';
  let messageCount = 0;
  let cwd = '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; }
    if (obj.cwd && !cwd) cwd = obj.cwd;
    if (obj.type === 'user' || obj.type === 'assistant') {
      messageCount++;
      if (obj.type === 'user') {
        const msg = obj.message;
        if (msg && msg.content) {
          if (typeof msg.content === 'string') lastMessage = msg.content.slice(0, 100);
          else if (Array.isArray(msg.content)) {
            const textPart = msg.content.find(p => p.type === 'text');
            if (textPart && textPart.text) lastMessage = textPart.text.slice(0, 100);
          }
        }
      }
    }
  }
  return { lastMessage, messageCount, cwd, complete };
}

function readSession(sessionId, agent = 'claude') {
  if (normalizeAgent(agent) !== 'claude') return [];
  // search all project dirs for this session
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const filePath = path.join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    }
  }
  return [];
}

function getCodexHistoryEntries() {
  const entries = [];
  for (const filePath of listCodexHistoryFiles()) {
    try {
      const items = fs.readFileSync(filePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try { return JSON.parse(line); } catch (_) { return null; }
        })
        .filter(item => item && item.session_id);
      entries.push(...items);
    } catch (_) {}
  }
  return entries.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

function listCodexHistoryFiles() {
  return CODEX_HOME_DIRS
    .map(dir => path.join(dir, 'history.jsonl'))
    .filter(filePath => fs.existsSync(filePath));
}

function getCodexProjects() {
  const sessions = buildCodexSessions();
  if (!sessions.length) return [];

  const byProject = new Map();
  for (const session of sessions) {
    const current = byProject.get(session.projectId) || {
      id: session.projectId,
      displayPath: session.cwd || '~',
      sessionCount: 0,
      lastModified: new Date(0).toISOString(),
    };
    current.sessionCount += 1;
    if (new Date(session.lastModified) > new Date(current.lastModified)) {
      current.lastModified = session.lastModified;
    }
    byProject.set(session.projectId, current);
  }

  return Array.from(byProject.values())
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function getCodexSessions(projectId) {
  const sessions = buildCodexSessions();
  if (projectId === 'codex') return sessions;
  return sessions.filter(session => session.projectId === projectId);
}

function buildCodexSessions() {
  const now = Date.now();
  if (codexSessionsCache.sessions && now < codexSessionsCache.expiresAt) {
    return codexSessionsCache.sessions;
  }

  const byId = getCodexSessionsFromFiles();
  for (const item of getCodexHistoryEntries()) {
    const id = item.session_id;
    const lastModified = item.ts ? new Date(item.ts * 1000).toISOString() : '';
    const current = byId.get(id) || {
      sessionId: id,
      lastModified: new Date(0).toISOString(),
      lastMessage: '',
      messageCount: 0,
      cwd: '',
    };
    current.historyCount = (current.historyCount || 0) + 1;
    if (item.text) current.lastMessage = String(item.text).slice(0, 100);
    if (lastModified && new Date(lastModified) > new Date(current.lastModified)) {
      current.lastModified = lastModified;
    }
    byId.set(id, current);
  }

  const sessions = Array.from(byId.values())
    .map(session => normalizeCodexSession(session))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  codexSessionsCache = {
    sessions,
    expiresAt: Date.now() + CODEX_HISTORY_CACHE_TTL_MS,
  };
  return sessions;
}

function getCodexSessionsFromFiles() {
  const byId = new Map();
  for (const filePath of listCodexSessionFiles()) {
    const idHint = codexSessionIdFromFilePath(filePath);
    if (idHint && byId.get(idHint)?.cwd) continue;
    const session = readCodexSessionFile(filePath);
    if (!session || !session.sessionId) continue;
    byId.set(session.sessionId, session);
  }
  return byId;
}

function listCodexSessionFiles() {
  const files = [];
  const stack = CODEX_HOME_DIRS
    .map(dir => path.join(dir, 'sessions'))
    .filter(dir => fs.existsSync(dir));
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath);
    }
  }
  return files;
}

function readCodexSessionFile(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return null;
  }

  const session = {
    sessionId: codexSessionIdFromFilePath(filePath),
    lastModified: stat.mtime.toISOString(),
    lastMessage: '',
    messageCount: 0,
    cwd: '',
  };

  const prefix = readFilePrefix(filePath, CODEX_SESSION_META_BYTES);
  const lines = prefix.split('\n').filter(Boolean).slice(0, CODEX_SESSION_META_LINES);
  for (const line of lines) {
    if (!line.trim()) continue;
    applyCodexSessionLine(session, line);
  }

  return session.sessionId ? session : null;
}

function readFilePrefix(filePath, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } catch (_) {
    return '';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

function applyCodexSessionLine(session, line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (_) {
    applyCodexSessionLineFallback(session, line);
    return;
  }

  updateSessionLastModified(session, obj.timestamp);

  if (obj.type === 'session_meta' && obj.payload) {
    if (!session.sessionId && obj.payload.id) session.sessionId = obj.payload.id;
    if (!session.cwd && obj.payload.cwd) session.cwd = obj.payload.cwd;
    updateSessionLastModified(session, obj.payload.timestamp);
  }

  if (obj.type === 'turn_context' && obj.payload && !session.cwd && obj.payload.cwd) {
    session.cwd = obj.payload.cwd;
  }

  if (obj.type === 'response_item' && obj.payload?.type === 'message') {
    session.messageCount = (session.messageCount || 0) + 1;
    if (obj.payload.role === 'user') {
      const text = extractCodexMessageText(obj.payload.content);
      if (text && !isEnvironmentContext(text)) session.lastMessage = text.slice(0, 100);
    }
  }
}

function applyCodexSessionLineFallback(session, line) {
  if (line.includes('"session_meta"')) {
    if (!session.sessionId) session.sessionId = extractJsonStringField(line, 'id') || session.sessionId;
    if (!session.cwd) session.cwd = extractJsonStringField(line, 'cwd') || session.cwd;
    updateSessionLastModified(session, extractJsonStringField(line, 'timestamp'));
    return;
  }

  if (line.includes('"turn_context"') && !session.cwd) {
    session.cwd = extractJsonStringField(line, 'cwd') || session.cwd;
  }
}

function updateSessionLastModified(session, timestamp) {
  if (!timestamp) return;
  const next = new Date(timestamp);
  if (!Number.isFinite(next.getTime())) return;
  if (next > new Date(session.lastModified)) {
    session.lastModified = next.toISOString();
  }
}

function codexSessionIdFromFilePath(filePath) {
  const matches = path.basename(filePath).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig);
  return matches && matches.length ? matches[matches.length - 1] : '';
}

function extractJsonStringField(text, field) {
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!match) return '';
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch (_) {
    return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function mergeCodexMessageCount(session) {
  return session.historyCount || session.messageCount || 0;
}

function extractCodexMessageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const textPart = content.find(part => part && (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text'));
  return textPart?.text || '';
}

function isEnvironmentContext(text) {
  return String(text).trim().startsWith('<environment_context>');
}

function normalizeCodexSession(session) {
  const cwd = session.cwd || '~';
  const messageCount = mergeCodexMessageCount(session);
  return {
    sessionId: session.sessionId,
    projectId: codexProjectId(cwd),
    lastModified: session.lastModified || new Date(0).toISOString(),
    lastMessage: session.lastMessage || '',
    messageCount,
    cwd,
  };
}

function codexProjectId(cwd) {
  const hash = crypto.createHash('sha1').update(cwd || '~').digest('hex').slice(0, 16);
  return `codex-${hash}`;
}

// ── Grok ──────────────────────────────────────────────────────────────────────
// 目录结构：<GROK_HOME>/sessions/<URL 编码的 cwd>/<session-id>/summary.json

function getGrokProjects() {
  const byProject = new Map();
  for (const session of buildGrokSessions()) {
    const current = byProject.get(session.projectId) || {
      id: session.projectId,
      displayPath: session.cwd || '~',
      sessionCount: 0,
      lastModified: new Date(0).toISOString(),
    };
    current.sessionCount += 1;
    if (new Date(session.lastModified) > new Date(current.lastModified)) current.lastModified = session.lastModified;
    byProject.set(session.projectId, current);
  }
  return Array.from(byProject.values())
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function getGrokSessions(projectId) {
  const sessions = buildGrokSessions();
  if (projectId === 'grok') return sessions;
  return sessions.filter(session => session.projectId === projectId);
}

function buildGrokSessions() {
  const byId = new Map();
  for (const home of GROK_HOME_DIRS) {
    const root = path.join(home, 'sessions');
    let groups = [];
    try { groups = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }
    for (const group of groups) {
      if (!group.isDirectory()) continue;
      const groupDir = path.join(root, group.name);
      const groupCwd = grokGroupCwd(groupDir, group.name);
      let entries = [];
      try { entries = fs.readdirSync(groupDir, { withFileTypes: true }); } catch (_) { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const session = readGrokSession(path.join(groupDir, entry.name), entry.name, groupCwd);
        if (!session) continue;
        const prev = byId.get(session.sessionId);
        if (!prev || new Date(session.lastModified) > new Date(prev.lastModified)) byId.set(session.sessionId, session);
      }
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function grokGroupCwd(groupDir, name) {
  try {
    const recorded = fs.readFileSync(path.join(groupDir, '.cwd'), 'utf8').trim();
    if (recorded) return recorded;
  } catch (_) {}
  try {
    const decoded = decodeURIComponent(name);
    if (path.isAbsolute(decoded) || /^[a-zA-Z]:[\\/]/.test(decoded)) return decoded;
  } catch (_) {}
  return '';
}

function readGrokSession(sessionDir, dirName, groupCwd) {
  const summaryPath = path.join(sessionDir, 'summary.json');
  let stat;
  try { stat = fs.statSync(summaryPath); } catch (_) { return null; }
  let summary = {};
  if (stat.size <= GROK_SUMMARY_MAX_BYTES) {
    try { summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) || {}; } catch (_) { summary = {}; }
  }
  const info = summary.info && typeof summary.info === 'object' ? summary.info : {};
  const sessionId = firstString(info.id, info.session_id, info.sessionId, summary.session_id, summary.id) || dirName;
  const cwd = firstString(info.cwd, info.working_dir, info.workingDir, info.workspace, summary.cwd) || groupCwd || '~';
  const title = firstString(
    summary.title,
    summary.generated_title,
    summary.session_summary,
    summary.last_turn_summary,
  );
  const lastModified = toIsoDate(summary.updated_at) || toIsoDate(summary.created_at) || stat.mtime.toISOString();
  const messageCount = Number(summary.num_chat_messages ?? summary.num_messages) || 0;
  return {
    sessionId,
    projectId: grokProjectId(cwd),
    lastModified,
    lastMessage: title.slice(0, 100),
    messageCount,
    cwd,
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toIsoDate(value) {
  if (value === undefined || value === null || value === '') return '';
  let date;
  if (typeof value === 'number') date = new Date(value < 1e12 ? value * 1000 : value);
  else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return toIsoDate(Number(value));
  else date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function grokProjectId(cwd) {
  const hash = crypto.createHash('sha1').update(cwd || '~').digest('hex').slice(0, 16);
  return `grok-${hash}`;
}

module.exports = { getProjects, getSessions, readSession };
