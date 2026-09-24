const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cliLang, translator } = require('./cli-lang');

test('cli language defaults to Chinese, env wins over the saved choice', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-lang-'));
  try {
    assert.equal(cliLang({}, home), 'zh');
    fs.mkdirSync(path.join(home, '.rcc'));
    fs.writeFileSync(path.join(home, '.rcc', 'lang'), 'en\n');
    assert.equal(cliLang({}, home), 'en');
    assert.equal(cliLang({ RCC_LANG: 'zh_CN' }, home), 'zh');
    assert.equal(cliLang({ RCC_LANG: 'EN' }, home), 'en');
    assert.equal(cliLang({ RCC_LANG: 'fr' }, home), 'en');
    assert.equal(translator('en')('中', 'EN'), 'EN');
    assert.equal(translator('zh')('中', 'EN'), '中');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
