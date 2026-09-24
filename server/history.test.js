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

test('codex history reads CODEX_HOME from the local agent env', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const sessionId = '019f6ffc-a6f0-7560-b2c2-e8781cb15554';
  const cwd = '/workspace/remote-cc';
  fs.mkdirSync(path.join(home, '.rcc'), { recursive: true });
  fs.writeFileSync(path.join(home, '.rcc', 'agent.env'), 'CODEX_HOME=~/.codex-alt\n');

  writeJsonl(path.join(home, '.codex-alt', 'history.jsonl'), [
    { session_id: sessionId, ts: 1784290256, text: 'resume this alt session' },
  ]);
  writeJsonl(path.join(home, '.codex-alt', 'sessions', '2026', '07', '17', `rollout-2026-07-17T20-10-56-${sessionId}.jsonl`), [
    { type: 'session_meta', timestamp: '2026-07-17T12:10:56.634Z', payload: { id: sessionId, cwd } },
    { type: 'response_item', timestamp: '2026-07-17T12:11:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'current alt request' }] } },
  ]);

  const history = loadHistoryWithHome(home);
  const sessions = history.getSessions('codex', 'codex');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].cwd, cwd);
  assert.equal(sessions[0].lastMessage, 'resume this alt session');
});

test('codex home paths with trailing separators are not read twice', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const sessionId = '019f6ffc-a6f0-7560-b2c2-e8781cb15555';
  const codexHome = path.join(home, '.codex-alt');

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

test('codex metadata is extracted from a bounded prefix of huge session files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const sessionId = '019f6ffc-a6f0-7560-b2c2-e8781cb15556';
  const cwd = '/workspace/huge-history';
  const filePath = path.join(
    home,
    '.codex',
    'sessions',
    '2026',
    '07',
    '17',
    `rollout-2026-07-17T20-10-56-${sessionId}.jsonl`
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `{"timestamp":"2026-07-17T12:10:56.634Z","type":"session_meta","payload":{"id":"${sessionId}","cwd":"${cwd}","padding":"${'x'.repeat(128 * 1024)}"}}\n`
  );

  const history = loadHistoryWithHome(home);
  const sessions = history.getSessions('codex', 'codex');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].cwd, cwd);
});

test('grok history is grouped by the recorded working directory', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-history-'));
  const cwd = '/workspace/grok-project';
  const sessionId = '0199f1a2-0000-7000-8000-000000000001';
  const otherId = '0199f1a2-0000-7000-8000-000000000002';
  const groupDir = path.join(home, '.grok', 'sessions', encodeURIComponent(cwd));

  fs.mkdirSync(path.join(groupDir, sessionId), { recursive: true });
  fs.writeFileSync(path.join(groupDir, sessionId, 'summary.json'), JSON.stringify({
    info: { id: sessionId, cwd },
    generated_title: 'Fix the flaky upload test',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-21T10:00:00Z',
    num_chat_messages: 6,
  }));
  fs.mkdirSync(path.join(groupDir, otherId), { recursive: true });
  fs.writeFileSync(path.join(groupDir, otherId, 'summary.json'), JSON.stringify({
    session_summary: 'older session',
    updated_at: 1758362400,
  }));
  fs.writeFileSync(path.join(groupDir, 'permission.toml'), '');

  const originalGrokHome = process.env.GROK_HOME;
  delete process.env.GROK_HOME;
  let history;
  try {
    history = loadHistoryWithHome(home);
  } finally {
    if (originalGrokHome !== undefined) process.env.GROK_HOME = originalGrokHome;
  }

  const projects = history.getProjects('grok');
  assert.equal(projects.length, 1);
  assert.equal(projects[0].displayPath, cwd);
  assert.equal(projects[0].sessionCount, 2);

  const sessions = history.getSessions(projects[0].id, 'grok');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].lastMessage, 'Fix the flaky upload test');
  assert.equal(sessions[0].messageCount, 6);
  assert.equal(sessions[1].sessionId, otherId);
  assert.equal(sessions[1].cwd, cwd);
  assert.equal(sessions[1].lastModified, new Date(1758362400 * 1000).toISOString());
});
