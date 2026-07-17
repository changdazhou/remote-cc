const test = require('node:test');
const assert = require('node:assert/strict');

const { getAgentConfig } = require('./agent-config');

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
