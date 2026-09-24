const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.IS_SANDBOX;

const { getAgentConfig, parseExtraArgs, normalizeAgent } = require('./agent-config');

test('codex resume keeps global config before the resume subcommand', () => {
  const args = getAgentConfig('codex').buildArgs({
    cwd: '/workspace/project',
    resumeSessionId: '019f45e7-70b7-7510-8254-4ec4e631e978',
  });

  assert.equal(args[0], '-c');
  assert.match(args[1], /^shell_environment_policy\.exclude=/);
  assert.equal(args[2], 'resume');
  assert.deepEqual(args.slice(3), [
    '--cd',
    '/workspace/project',
    '--no-alt-screen',
    '019f45e7-70b7-7510-8254-4ec4e631e978',
  ]);
});

test('codex sandbox flag stays after the resume subcommand', () => {
  process.env.IS_SANDBOX = '1';
  try {
    const args = getAgentConfig('codex').buildArgs({ cwd: '/w', resumeSessionId: 'abc' });
    assert.equal(args[2], 'resume');
    assert.ok(args.indexOf('--dangerously-bypass-approvals-and-sandbox') > 2);
    assert.equal(args[args.length - 1], 'abc');
  } finally {
    delete process.env.IS_SANDBOX;
  }
});

test('extra args are appended for new sessions and placed before the codex resume id', () => {
  const extraArgs = ['--model', 'gpt-5'];
  assert.deepEqual(
    getAgentConfig('claude').buildArgs({ resumeSessionId: 's1', extraArgs }),
    ['--resume', 's1', '--model', 'gpt-5'],
  );
  const codexNew = getAgentConfig('codex').buildArgs({ cwd: '/w', extraArgs });
  assert.deepEqual(codexNew.slice(-2), extraArgs);
  const codexResume = getAgentConfig('codex').buildArgs({ cwd: '/w', resumeSessionId: 's2', extraArgs });
  assert.deepEqual(codexResume.slice(-3), ['--model', 'gpt-5', 's2']);
  assert.deepEqual(
    getAgentConfig('grok').buildArgs({ resumeSessionId: 's3', extraArgs: ['-m', 'grok-4'] }),
    ['--resume', 's3', '-m', 'grok-4'],
  );
});

test('grok is a supported agent', () => {
  assert.equal(normalizeAgent('grok'), 'grok');
  assert.equal(normalizeAgent('GROK'), 'grok');
  assert.equal(normalizeAgent('unknown'), 'claude');
});

test('parseExtraArgs splits like a shell without expansion', () => {
  assert.deepEqual(parseExtraArgs(''), []);
  assert.deepEqual(parseExtraArgs('  --model   opus  '), ['--model', 'opus']);
  assert.deepEqual(parseExtraArgs('--model=x -c \'a="b c"\''), ['--model=x', '-c', 'a="b c"']);
  assert.deepEqual(parseExtraArgs('--rules "use \\"tabs\\"" $HOME'), ['--rules', 'use "tabs"', '$HOME']);
  assert.deepEqual(parseExtraArgs('a\\ b ""'), ['a b', '']);
  assert.deepEqual(parseExtraArgs(['--x', 1, '', 'y']), ['--x', 'y']);
  assert.deepEqual(parseExtraArgs(null), []);
});

test('local preferred commands win over the native command and <AGENT>_BIN', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  if (process.platform === 'win32') return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-bin-'));
  for (const name of ['claude', 'claude-plus', 'grok', 'grok-plus', 'codex', 'codex-plus']) {
    fs.writeFileSync(path.join(dir, name), '#!/bin/sh\n', { mode: 0o755 });
  }
  fs.mkdirSync(path.join(dir, '.rcc'));
  fs.writeFileSync(path.join(dir, '.rcc', 'agent.env'), 'RCC_CODEX_PREFERRED="~/codex-plus"\n');
  const saved = {};
  for (const key of ['PATH', 'CLAUDE_BIN', 'GROK_BIN', 'RCC_CLAUDE_PREFERRED', 'RCC_CODEX_PREFERRED', 'RCC_GROK_PREFERRED']) {
    saved[key] = process.env[key];
  }
  process.env.PATH = dir;
  process.env.CLAUDE_BIN = path.join(dir, 'claude');
  process.env.GROK_BIN = path.join(dir, 'grok');
  process.env.RCC_CLAUDE_PREFERRED = 'claude-plus';
  process.env.RCC_GROK_PREFERRED = `missing${path.delimiter}grok-plus`;
  delete process.env.RCC_CODEX_PREFERRED;
  const originalHomedir = os.homedir;
  os.homedir = () => dir;
  delete require.cache[require.resolve('./agent-config')];
  delete require.cache[require.resolve('./web-settings')];
  try {
    const { resolveAgentBin } = require('./agent-config');
    assert.equal(resolveAgentBin('claude').command, path.join(dir, 'claude-plus'));
    assert.equal(resolveAgentBin('grok').command, path.join(dir, 'grok-plus'));
    assert.equal(resolveAgentBin('codex').command, path.join(dir, 'codex-plus'));
  } finally {
    os.homedir = originalHomedir;
    delete require.cache[require.resolve('./agent-config')];
    delete require.cache[require.resolve('./web-settings')];
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
