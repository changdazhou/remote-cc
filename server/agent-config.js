const fs = require('fs');
const path = require('path');
const os = require('os');
const { getWebSettings } = require('./web-settings');
const { localAgentEnvValue, splitPathList } = require('./local-env');

const IS_WIN = process.platform === 'win32';
const HOME = os.homedir();
const DEFAULT_AGENT = (process.env.RCC_AGENT || 'claude').toLowerCase();
const PROXY_ENV_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
];
const MAX_EXTRA_ARGS_LENGTH = 4096;

// 本机首选的同协议 CLI（RCC_<AGENT>_PREFERRED，按 PATH 分隔符分隔）：存在时优先于原生命令（仅 Unix）
function preferredCandidates(agentId) {
  return splitPathList(localAgentEnvValue(`RCC_${agentId.toUpperCase()}_PREFERRED`)).map(expandHome);
}

function sandboxEnabled() {
  return process.env.IS_SANDBOX === '1';
}

const AGENTS = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    envVar: 'CLAUDE_BIN',
    command: IS_WIN ? 'claude.cmd' : 'claude',
    windowsCandidates: [
      path.join(HOME, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(HOME, 'AppData', 'Roaming', 'npm', 'claude'),
      'claude.cmd',
      'claude',
    ],
    unixCandidates: [
      'claude',
      '/root/.nvm/versions/node/v24.14.0/bin/claude',
      path.join(HOME, '.claude', 'local', 'claude'),
      path.join(HOME, '.local', 'bin', 'claude'),
    ],
    buildArgs({ resumeSessionId, extraArgs = [] }) {
      const args = [];
      if (sandboxEnabled()) args.push('--dangerously-skip-permissions');
      if (resumeSessionId) args.push('--resume', resumeSessionId);
      return [...args, ...extraArgs];
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    envVar: 'CODEX_BIN',
    command: IS_WIN ? 'codex.cmd' : 'codex',
    windowsCandidates: [
      path.join(HOME, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
      path.join(HOME, 'AppData', 'Roaming', 'npm', 'codex'),
      'codex.cmd',
      'codex',
    ],
    unixCandidates: [
      'codex',
    ],
    buildArgs({ cwd, resumeSessionId, extraArgs = [] }) {
      const globalArgs = [
        '-c', `shell_environment_policy.exclude=${JSON.stringify(PROXY_ENV_KEYS)}`,
      ];
      const sessionArgs = [
        '--cd', cwd,
        '--no-alt-screen',
      ];
      if (sandboxEnabled()) sessionArgs.push('--dangerously-bypass-approvals-and-sandbox');
      if (resumeSessionId) return [...globalArgs, 'resume', ...sessionArgs, ...extraArgs, resumeSessionId];
      return [...globalArgs, ...sessionArgs, ...extraArgs];
    },
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    envVar: 'GROK_BIN',
    command: IS_WIN ? 'grok.exe' : 'grok',
    windowsCandidates: [
      path.join(HOME, '.grok', 'bin', 'grok.exe'),
      'grok.exe',
      'grok',
    ],
    unixCandidates: [
      'grok',
      path.join(process.env.GROK_HOME || path.join(HOME, '.grok'), 'bin', 'grok'),
      path.join(HOME, '.local', 'bin', 'grok'),
    ],
    buildArgs({ resumeSessionId, extraArgs = [] }) {
      const args = [];
      if (sandboxEnabled()) args.push('--always-approve');
      if (resumeSessionId) args.push('--resume', resumeSessionId);
      return [...args, ...extraArgs];
    },
  },
};

function normalizeAgent(agent) {
  const id = String(agent || DEFAULT_AGENT || 'claude').toLowerCase();
  return AGENTS[id] ? id : 'claude';
}

/**
 * 把用户输入的启动参数字符串按 shell 规则拆分（支持单/双引号和反斜杠转义），不做变量展开。
 * @param {string|string[]} input
 * @returns {string[]}
 */
function parseExtraArgs(input) {
  if (Array.isArray(input)) {
    return input.filter(item => typeof item === 'string' && item.length).slice(0, 64);
  }
  if (typeof input !== 'string') return [];
  const text = input.slice(0, MAX_EXTRA_ARGS_LENGTH);
  const args = [];
  let current = '';
  let hasToken = false;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = '';
      else current += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = '';
      else if (ch === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) current += text[++i];
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      hasToken = true;
    } else if (ch === '\\' && i + 1 < text.length) {
      current += text[++i];
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) args.push(current);
      current = '';
      hasToken = false;
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (hasToken) args.push(current);
  return args;
}

function commandExists(command) {
  return !!findInPath(command);
}

function findInPath(command) {
  if (!command || command.includes('/') || command.includes('\\')) return '';
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = IS_WIN && !/\.(cmd|exe|bat)$/i.test(command)
    ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command]
    : [command];
  for (const dir of pathDirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        if (fs.statSync(full).isFile()) return full;
      } catch (_) {}
    }
  }
  return '';
}

function expandHome(input) {
  if (!input || input === '~') return HOME;
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(HOME, input.slice(2));
  return input;
}

function executableExists(command) {
  if (!command) return false;
  const expanded = expandHome(command);
  if (!expanded.includes('/') && !expanded.includes('\\')) return commandExists(expanded);
  try {
    fs.accessSync(expanded, fs.constants.X_OK);
    return fs.statSync(expanded).isFile();
  } catch (_) {
    return false;
  }
}

function customCommandFor(agentId) {
  try {
    const settings = getWebSettings().settings || {};
    const key = `${normalizeAgent(agentId)}Command`;
    return typeof settings[key] === 'string' ? settings[key].trim() : '';
  } catch (_) {
    return '';
  }
}

function firstAvailable(candidates, source) {
  const seen = new Set();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    if (!c.includes('/') && !c.includes('\\')) {
      const full = findInPath(c);
      if (full) return { command: full, available: true, source: 'PATH' };
      continue;
    }
    if (executableExists(c)) return { command: c, available: true, source };
  }
  return null;
}

/**
 * 解析 Agent 可执行文件，优先级：
 *   Web 设置里的自定义命令 > 本机首选命令（RCC_<AGENT>_PREFERRED）> <AGENT>_BIN 环境变量 > 内置候选路径 / PATH
 */
function resolveAgentBin(agentId) {
  const cfg = AGENTS[normalizeAgent(agentId)];
  const custom = customCommandFor(cfg.id);
  if (custom) {
    const expanded = expandHome(custom);
    return {
      command: findInPath(expanded) || expanded,
      available: executableExists(expanded),
      source: 'settings',
    };
  }

  if (!IS_WIN) {
    const preferred = firstAvailable(preferredCandidates(cfg.id), 'known-path');
    if (preferred) return preferred;
  }

  const fromEnv = process.env[cfg.envVar];
  if (fromEnv && executableExists(fromEnv)) {
    return { command: expandHome(fromEnv), available: true, source: cfg.envVar };
  }

  const found = firstAvailable(IS_WIN ? cfg.windowsCandidates : cfg.unixCandidates, 'known-path');
  if (found) return found;

  if (fromEnv) {
    return { command: expandHome(fromEnv), available: false, source: cfg.envVar };
  }
  const full = findInPath(cfg.command);
  return {
    command: full || cfg.command,
    available: !!full,
    source: 'default',
  };
}

function findAgentBin(agentId) {
  return resolveAgentBin(agentId).command;
}

function getAgentConfig(agent) {
  return AGENTS[normalizeAgent(agent)];
}

function withoutProxyEnv(env = {}) {
  const clean = { ...env };
  for (const key of PROXY_ENV_KEYS) delete clean[key];
  return clean;
}

function getAgentProxyEnv(agent) {
  const agentId = normalizeAgent(agent);
  const prefix = agentId.toUpperCase();
  const proxy = process.env[`${prefix}_PROXY`] || '';
  if (!proxy) return {};

  const noProxy = process.env[`${prefix}_NO_PROXY`] || process.env.AGENT_NO_PROXY || 'localhost,127.0.0.1,::1';
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  };
}

// 服务若从某个 Agent 会话内部启动，会继承其运行时标记（关闭颜色、嵌套会话检测等），不能再传给新会话
const HOST_SESSION_ENV_KEYS = [
  'NO_COLOR', 'AI_AGENT',
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CODEX_CI', 'CODEX_THREAD_ID', 'CODEX_MANAGED_BY_NPM', 'CODEX_MANAGED_PACKAGE_ROOT',
];
const HOST_SESSION_ENV_VALUES = { GIT_EDITOR: 'true', GIT_PAGER: 'cat', GH_PAGER: 'cat' };

function withoutHostSessionEnv(env = {}) {
  const out = { ...env };
  for (const key of HOST_SESSION_ENV_KEYS) delete out[key];
  for (const [key, value] of Object.entries(HOST_SESSION_ENV_VALUES)) {
    if (out[key] === value) delete out[key];
  }
  return out;
}

function buildAgentEnv(agent, baseEnv = process.env, clientEnv = {}) {
  return {
    ...withoutProxyEnv(withoutHostSessionEnv(baseEnv)),
    ...withoutProxyEnv(clientEnv),
    ...getAgentProxyEnv(agent),
  };
}

function getAgentStatuses() {
  const defaultAgent = normalizeAgent(DEFAULT_AGENT);
  return Object.values(AGENTS).map(cfg => {
    const resolved = resolveAgentBin(cfg.id);
    return {
      id: cfg.id,
      label: cfg.label,
      available: resolved.available,
      command: resolved.command,
      source: resolved.source,
      default: cfg.id === defaultAgent,
    };
  });
}

module.exports = {
  AGENTS,
  PROXY_ENV_KEYS,
  DEFAULT_AGENT: normalizeAgent(DEFAULT_AGENT),
  normalizeAgent,
  parseExtraArgs,
  resolveAgentBin,
  findAgentBin,
  getAgentStatuses,
  getAgentConfig,
  withoutProxyEnv,
  getAgentProxyEnv,
  buildAgentEnv,
  withoutHostSessionEnv,
};
