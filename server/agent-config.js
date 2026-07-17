const fs = require('fs');
const path = require('path');
const os = require('os');
const { getWebSettings } = require('./web-settings');

const IS_WIN = process.platform === 'win32';
const DEFAULT_AGENT = (process.env.RCC_AGENT || 'claude').toLowerCase();
const PROXY_ENV_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
];
const BAIDU_CC_CLAUDE_BIN = '/root/.comate/baidu-cc/bin/ducc';
const BAIDU_CX_CODEX_BIN = '/root/.baidu-cx/baidu-cx/bin/ducx';

const AGENTS = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    envVar: 'CLAUDE_BIN',
    command: IS_WIN ? 'claude.cmd' : 'claude',
    windowsCandidates: [
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude'),
      'claude.cmd',
      'claude',
    ],
    unixCandidates: [
      process.env.CLAUDE_BIN,
      '/root/.nvm/versions/node/v24.14.0/bin/claude',
      'claude',
      BAIDU_CC_CLAUDE_BIN,
    ],
    buildArgs({ resumeSessionId }) {
      const args = [];
      if (process.env.IS_SANDBOX === '1') args.push('--dangerously-skip-permissions');
      if (resumeSessionId) args.push('--resume', resumeSessionId);
      return args;
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    envVar: 'CODEX_BIN',
    command: IS_WIN ? 'codex.cmd' : 'codex',
    windowsCandidates: [
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'codex.cmd'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'codex'),
      'codex.cmd',
      'codex',
    ],
    unixCandidates: [
      process.env.CODEX_BIN,
      BAIDU_CX_CODEX_BIN,
      'codex',
    ],
    buildArgs({ cwd, resumeSessionId }) {
      const globalArgs = [
        '-c', `shell_environment_policy.exclude=${JSON.stringify(PROXY_ENV_KEYS)}`,
      ];
      const sessionArgs = [
        '--cd', cwd,
        '--no-alt-screen',
      ];
      if (process.env.IS_SANDBOX === '1') globalArgs.push('--dangerously-bypass-approvals-and-sandbox');
      if (resumeSessionId) return [...globalArgs, 'resume', ...sessionArgs, resumeSessionId];
      return [...globalArgs, ...sessionArgs];
    },
  },
};

function normalizeAgent(agent) {
  const id = (agent || DEFAULT_AGENT || 'claude').toLowerCase();
  return AGENTS[id] ? id : 'claude';
}

function commandExists(command) {
  if (!command || command.includes(path.sep)) return false;
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = IS_WIN && !/\.(cmd|exe|bat)$/i.test(command)
    ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command]
    : [command];
  return pathDirs.some(dir => names.some(name => {
    try { fs.accessSync(path.join(dir, name), fs.constants.X_OK); return true; } catch (_) { return false; }
  }));
}

function executableExists(command) {
  if (!command) return false;
  if (!command.includes(path.sep)) return commandExists(command);
  try { fs.accessSync(command, fs.constants.X_OK); return true; } catch (_) { return false; }
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

function resolveAgentBin(agentId) {
  const cfg = AGENTS[normalizeAgent(agentId)];
  const custom = customCommandFor(cfg.id);
  if (custom) {
    return {
      command: custom,
      available: executableExists(custom),
      source: 'settings',
    };
  }

  if (cfg.id === 'codex' && !IS_WIN && executableExists(BAIDU_CX_CODEX_BIN)) {
    return {
      command: BAIDU_CX_CODEX_BIN,
      available: true,
      source: 'known-path',
    };
  }

  const fromEnv = process.env[cfg.envVar];
  if (fromEnv) {
    return {
      command: fromEnv,
      available: executableExists(fromEnv),
      source: cfg.envVar,
    };
  }

  const candidates = IS_WIN ? cfg.windowsCandidates : cfg.unixCandidates;
  for (const c of candidates) {
    if (!c) continue;
    if (!c.includes(path.sep)) {
      if (commandExists(c)) return { command: c, available: true, source: 'PATH' };
      continue;
    }
    try { fs.accessSync(c, fs.constants.X_OK); return { command: c, available: true, source: 'known-path' }; } catch (_) {}
  }

  return {
    command: cfg.command,
    available: commandExists(cfg.command),
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

function buildAgentEnv(agent, baseEnv = process.env, clientEnv = {}) {
  return {
    ...withoutProxyEnv(baseEnv),
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
  resolveAgentBin,
  findAgentBin,
  getAgentStatuses,
  getAgentConfig,
  withoutProxyEnv,
  getAgentProxyEnv,
  buildAgentEnv,
};
