const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '..', 'rcc-server'), 'utf8');

test('rcc-server loads the local agent env and preserves provider auth environment', () => {
  assert.match(script, /AGENT_ENV_FILE="\$HOME\/\.rcc\/agent\.env"/);
  assert.match(script, /CODEX_HOME="\$\{CODEX_HOME:-\}"/);
  assert.match(script, /\[\[ -n "\$CODEX_HOME" +\]\] && export CODEX_HOME/);
  assert.match(script, /\[\[ -n "\$ONEAPI_AUTH_TOKEN" +\]\] && export ONEAPI_AUTH_TOKEN/);
});
