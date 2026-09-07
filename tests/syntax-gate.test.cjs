const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
test('syntax gate: discovers new helper scripts, rejects module-only syntax and never executes code', t => {
    const directory = mkdtempSync(join(tmpdir(), 'glassveil-syntax-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    for (const folder of ['content', 'shared', 'popup', 'background']) mkdirSync(join(directory, folder));
    const filename = join(directory, 'shared', 'new-helper.js');
    const run = () => spawnSync(process.execPath, [resolve(__dirname, '../scripts/check-syntax.cjs')], { cwd: directory, encoding: 'utf8' });
    writeFileSync(filename, 'throw new Error("This must never execute");');
    assert.equal(run().status, 0);
    writeFileSync(filename, 'console.log(import.meta.url);');
    const invalid = run();
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /import.meta/);
});
