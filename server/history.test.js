const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadHistoryWithHome(home) {
  const originalHomedir = os.homedir;
  const originalRccCodexHome = process.env.RCC_CODEX_HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  os.homedir = () => home;
  delete process.env.RCC_CODEX_HOME;
  delete process.env.CODEX_HOME;
  delete require.cache[require.resolve('./history')];
  try {
    return require('./history');
  } finally {
    delete require.cache[require.resolve('./history')];
    os.homedir = originalHomedir;
    if (originalRccCodexHome === undefined) delete process.env.RCC_CODEX_HOME;
    else process.env.RCC_CODEX_HOME = originalRccCodexHome;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }
}

function loadHistoryWithHomeAndEnv(home, env = {}) {
  const originalHomedir = os.homedir;
  const originalRccCodexHome = process.env.RCC_CODEX_HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  os.homedir = () => home;
  if ('RCC_CODEX_HOME' in env) process.env.RCC_CODEX_HOME = env.RCC_CODEX_HOME;
  else delete process.env.RCC_CODEX_HOME;
  if ('CODEX_HOME' in env) process.env.CODEX_HOME = env.CODEX_HOME;
  else delete process.env.CODEX_HOME;
  delete require.cache[require.resolve('./history')];
  try {
    return require('./history');
  } finally {
    delete require.cache[require.resolve('./history')];
    os.homedir = originalHomedir;
    if (originalRccCodexHome === undefined) delete process.env.RCC_CODEX_HOME;
    else process.env.RCC_CODEX_HOME = originalRccCodexHome;
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
  }
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}

test('codex history includes ducx sessions stored under .baidu-cx', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const sessionId = '019f6ffc-a6f0-7560-b2c2-e8781cb15554';
  const cwd = '/workspace/remote-cc';

  writeJsonl(path.join(home, '.baidu-cx', 'history.jsonl'), [
    { session_id: sessionId, ts: 1784290256, text: 'resume this ducx session' },
  ]);
  writeJsonl(path.join(home, '.baidu-cx', 'sessions', '2026', '07', '17', `rollout-2026-07-17T20-10-56-${sessionId}.jsonl`), [
    { type: 'session_meta', timestamp: '2026-07-17T12:10:56.634Z', payload: { id: sessionId, cwd } },
    { type: 'response_item', timestamp: '2026-07-17T12:11:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'current ducx request' }] } },
  ]);

  const history = loadHistoryWithHome(home);
  const sessions = history.getSessions('codex', 'codex');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].cwd, cwd);
  assert.equal(sessions[0].lastMessage, 'resume this ducx session');
});

test('codex home paths with trailing separators are not read twice', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const sessionId = '019f6ffc-a6f0-7560-b2c2-e8781cb15555';
  const codexHome = path.join(home, '.baidu-cx');

  writeJsonl(path.join(codexHome, 'history.jsonl'), [
    { session_id: sessionId, ts: 1784290256, text: 'one history row' },
  ]);

  const history = loadHistoryWithHomeAndEnv(home, {
    CODEX_HOME: codexHome + path.sep,
  });
  const sessions = history.getSessions('codex', 'codex');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].messageCount, 1);
});
