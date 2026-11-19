const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const values = new Map();
let failPart = false, failManifest = false;
const secure = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async key => values.get(key) ?? null,
  setItemAsync: async (key, value) => {
    assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
    if ((failPart && key.endsWith('.1')) || (failManifest && key === 'auth')) throw new Error('Storage failed');
    values.set(key, value);
  },
  deleteItemAsync: async key => { values.delete(key); },
};
const source = fs.readFileSync(path.join(__dirname, '../src/sessionStorage.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const scope = { exports: {}, require: name => name === 'expo-crypto' ? { randomUUID } : secure };
vm.runInNewContext(code, scope);
const storage = scope.exports.sessionStorage;
(async () => {
  const session = JSON.stringify({ token: 'a'.repeat(7000), unicode: '😀'.repeat(2000) });
  await storage.setItem('auth', session);
  assert.equal(await storage.getItem('auth'), session);
  const originalKeys = [...values.keys()].sort();
  failPart = true;
  await assert.rejects(storage.setItem('auth', 'b'.repeat(1200)));
  failPart = false;
  assert.deepEqual([...values.keys()].sort(), originalKeys);
  assert.equal(await storage.getItem('auth'), session);
  failManifest = true;
  await assert.rejects(storage.setItem('auth', 'c'.repeat(1200)));
  failManifest = false;
  assert.deepEqual([...values.keys()].sort(), originalKeys);
  await storage.setItem('auth', 'replacement');
  assert.equal(values.size, 2);
  assert.equal(await storage.getItem('auth'), 'replacement');
  const manifest = JSON.parse(values.get('auth'));
  values.delete(`auth.${manifest.generation}.0`);
  assert.equal(await storage.getItem('auth'), null);
  await storage.removeItem('auth');
  assert.equal(values.size, 0);
  console.log('encrypted session chunk publication, rollback, and cleanup checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
