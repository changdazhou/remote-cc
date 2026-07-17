const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '..', 'rcc-server'), 'utf8');

test('rcc-server preserves ducx home and provider auth environment', () => {
  assert.match(script, /CODEX_HOME="\$\{CODEX_HOME:-\$HOME\/\.baidu-cx\}"/);
  assert.match(script, /\[\[ -n "\$CODEX_HOME" +\]\] && export CODEX_HOME/);
  assert.match(script, /\[\[ -n "\$ONEAPI_AUTH_TOKEN" +\]\] && export ONEAPI_AUTH_TOKEN/);
});
