const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const compiler = require.resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [
  compiler, '--ignoreConfig', '--target', 'ES2020', '--module', 'commonjs',
  '--skipLibCheck', '--outDir', '.test', 'src/recognition.test.ts', 'src/recognition.ts',
], { cwd: appRoot, stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status || 1);
require(path.join(appRoot, '.test', 'src', 'recognition.test.js')).runRecognitionChecks();
console.log('recognition checks passed');
