const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { normalizeAgent } = require('./agent-config');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_HOME_DIRS = uniquePaths([
  process.env.RCC_CODEX_HOME,
  process.env.CODEX_HOME,
  path.join(os.homedir(), '.baidu-cx'),
  path.join(os.homedir(), '.codex'),
].filter(Boolean).map(expandHome));

function expandHome(input) {
  if (!input || input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const p of paths) {
    const key = path.resolve(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

function getProjects(agent = 'claude') {
  return normalizeAgent(agent) === 'codex' ? getCodexProjects() : getClaudeProjects();
}

function getClaudeProjects() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const projects = [];
  for (const dir of dirs) {
    const sessions = getSessions(dir);
    if (sessions.length === 0) continue;
    // cwd 从最新 session 的第一条消息中读取
    const latestSession = sessions[0];
    projects.push({
      id: dir,
      displayPath: latestSession.cwd || dir,
      sessionCount: sessions.length,
      lastModified: sessions[0].lastModified,
    });
  }
  return projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function getSessions(projectId, agent = 'claude') {
  return normalizeAgent(agent) === 'codex' ? getCodexSessions(projectId) : getClaudeSessions(projectId);
}

function getClaudeSessions(projectId) {
  const dir = path.join(CLAUDE_PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const filePath = path.join(dir, f);
      const stat = fs.statSync(filePath);
      return { file: f, filePath, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return files.map(({ file, filePath, mtime }) => {
    const sessionId = file.replace('.jsonl', '');
    const preview = readSessionPreview(filePath);
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

function readSessionPreview(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    let lastMessage = '';
    let messageCount = 0;
    let cwd = '';

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.cwd && !cwd) cwd = obj.cwd;
        if (obj.type === 'user' || obj.type === 'assistant') {
          messageCount++;
          // 取最后一条用户消息作为预览
          if (obj.type === 'user') {
            const msg = obj.message;
            if (msg && msg.content) {
              if (typeof msg.content === 'string') lastMessage = msg.content.slice(0, 100);
              else if (Array.isArray(msg.content)) {
                const textPart = msg.content.find(p => p.type === 'text');
                if (textPart) lastMessage = textPart.text.slice(0, 100);
              }
            }
          }
        }
      } catch (_) {}
    }
    return { lastMessage, messageCount, cwd };
  } catch (_) {
    return { lastMessage: '', messageCount: 0, cwd: '' };
  }
}

function readSession(sessionId, agent = 'claude') {
  if (normalizeAgent(agent) === 'codex') return [];
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

  return Array.from(byId.values())
    .map(session => normalizeCodexSession(session))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

function getCodexSessionsFromFiles() {
  const byId = new Map();
  for (const filePath of listCodexSessionFiles()) {
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
    sessionId: '',
    lastModified: stat.mtime.toISOString(),
    lastMessage: '',
    messageCount: 0,
    cwd: '',
  };

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      continue;
    }

    if (obj.timestamp && new Date(obj.timestamp) > new Date(session.lastModified)) {
      session.lastModified = new Date(obj.timestamp).toISOString();
    }

    if (obj.type === 'session_meta' && obj.payload) {
      if (!session.sessionId && obj.payload.id) session.sessionId = obj.payload.id;
      if (!session.cwd && obj.payload.cwd) session.cwd = obj.payload.cwd;
      if (obj.payload.timestamp && new Date(obj.payload.timestamp) > new Date(session.lastModified)) {
        session.lastModified = new Date(obj.payload.timestamp).toISOString();
      }
    }

    if (obj.type === 'turn_context' && obj.payload && !session.cwd && obj.payload.cwd) {
      session.cwd = obj.payload.cwd;
    }

    if (obj.type === 'response_item' && obj.payload?.type === 'message') {
      const role = obj.payload.role;
      if (role === 'user' || role === 'assistant') session.messageCount += 1;
      if (role === 'user') {
        const text = extractCodexMessageText(obj.payload.content);
        if (text && !isEnvironmentContext(text)) session.lastMessage = text.slice(0, 100);
      }
    }
  }

  return session;
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
  const messageCount = session.messageCount || session.historyCount || 0;
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

module.exports = { getProjects, getSessions, readSession };
