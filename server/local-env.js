const fs = require('fs');
const os = require('os');
const path = require('path');

// 本机私有的 Agent 配置（~/.rcc/agent.env，KEY=VALUE 格式，不纳入仓库），
// 用于放只在这台机器上存在的命令路径、CODEX_HOME 等。进程环境变量优先。
function localAgentEnvPath() {
  return path.join(os.homedir(), '.rcc', 'agent.env');
}

function expandValue(value) {
  const home = os.homedir();
  return value
    .replace(/^~(?=$|[/\\])/, home)
    .replace(/\$\{HOME\}|\$HOME\b/g, home);
}

function readLocalAgentEnv() {
  let text = '';
  try {
    text = fs.readFileSync(localAgentEnvPath(), 'utf8');
  } catch (_) {
    return {};
  }
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = expandValue(value);
  }
  return env;
}

function localAgentEnvValue(key) {
  const fromProcess = process.env[key];
  if (fromProcess) return fromProcess;
  return readLocalAgentEnv()[key] || '';
}

function splitPathList(value) {
  return String(value || '').split(path.delimiter).map(s => s.trim()).filter(Boolean);
}

module.exports = { localAgentEnvPath, readLocalAgentEnv, localAgentEnvValue, splitPathList };
