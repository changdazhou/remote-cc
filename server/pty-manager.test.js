const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// pty-manager 加载时会清空 ~/.rcc/logs 与 sockets，必须在临时 HOME 的子进程里运行
function runWithTempHome(script, env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-pty-'));
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: __dirname,
    env: { ...process.env, HOME: home, ...env },
    encoding: 'utf8',
    timeout: 30000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`);
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

test('replay keeps early history after the raw buffer is trimmed by redraw frames', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcc-pty-bin-'));
  const fakeShell = path.join(dir, 'fake-shell');
  // 先输出一行历史，再输出 >500KB 的同步重绘帧（只改写底部状态行），最后挂起
  fs.writeFileSync(fakeShell, `#!${process.execPath}
process.stdout.write('EARLY-HISTORY-LINE\\r\\n');
const frame = '\\x1b[?2026h\\x1b[24;1H\\x1b[2K working ' + 'x'.repeat(60) + '\\x1b[?2026l';
let sent = 0;
(function pump() {
  let chunk = '';
  for (let i = 0; i < 200; i++) chunk += frame;
  sent += chunk.length;
  process.stdout.write(chunk, () => { if (sent < 700 * 1024) pump(); else process.stdout.write('\\x1b[24;1HREADY'); });
})();
setInterval(() => {}, 1000);
`, { mode: 0o755 });

  const result = runWithTempHome(`
    const pm = require('./pty-manager');
    pm.startShellHttp({ cols: 80, rows: 24 });
    const deadline = Date.now() + 20000;
    (async function wait() {
      while (Date.now() < deadline) {
        const snap = await pm.pollShellHttp({ cursor: 0, wait: 0 });
        if (snap.output.includes('READY') && snap.cursor > 600 * 1024) {
          await new Promise(r => setTimeout(r, 300));
          const final = pm.startShellHttp({ cols: 80, rows: 24 });
          console.log(JSON.stringify({
            cursor: final.cursor,
            hasHistory: final.output.includes('EARLY-HISTORY-LINE'),
            hasReady: final.output.includes('READY'),
            bytes: final.output.length,
          }));
          pm.killShellHttp();
          process.exit(0);
        }
        await new Promise(r => setTimeout(r, 100));
      }
      console.log(JSON.stringify({ timeout: true }));
      process.exit(0);
    })();
  `, { RCC_SHELL: fakeShell });
  fs.rmSync(dir, { recursive: true, force: true });

  assert.equal(result.timeout, undefined);
  assert.ok(result.cursor > 500 * 1024);
  assert.equal(result.hasHistory, true);
  assert.equal(result.hasReady, true);
  assert.ok(result.bytes < 100 * 1024);
});
