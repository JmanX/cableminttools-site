const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const compiler = require.resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [
  compiler, '--ignoreConfig', '--target', 'ES2022', '--module', 'commonjs',
  '--skipLibCheck', '--outDir', '.test', 'src/recognition.test.ts', 'src/recognition.ts', 'src/withTimeout.test.ts', 'src/withTimeout.ts', 'src/deviceWorkflow.test.ts', 'src/deviceService.ts', 'src/historyModel.test.ts', 'src/captureQueue.ts', 'src/smartZoom.test.ts', 'src/cameraZoom.test.ts', 'src/syncFeedback.ts', 'src/syncFeedback.test.ts', 'src/presentation.test.ts', 'src/captureNext.test.ts',
], { cwd: appRoot, stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status || 1);
require(path.join(appRoot, '.test', 'src', 'recognition.test.js')).runRecognitionChecks();
require(path.join(appRoot, '.test', 'src', 'deviceWorkflow.test.js')).runWorkflowChecks();
require(path.join(appRoot, '.test', 'src', 'historyModel.test.js')).runHistoryChecks();
require(path.join(appRoot,'.test','src','presentation.test.js')).runPresentationChecks();
require(path.join(appRoot,'.test','src','smartZoom.test.js')).runZoomChecks();
const serviceChecks = spawnSync(process.execPath, [path.join(__dirname, 'test-device-service.cjs')], { cwd: appRoot, stdio: 'inherit' });
if (serviceChecks.status !== 0) process.exit(serviceChecks.status || 1);
const queueChecks=spawnSync(process.execPath,[path.join(__dirname,'test-capture-queue.cjs')],{cwd:appRoot,stdio:'inherit'});if(queueChecks.status!==0)process.exit(queueChecks.status||1);
const sessionChecks = spawnSync(process.execPath, [path.join(__dirname, 'test-session-storage.cjs')], { cwd: appRoot, stdio: 'inherit' });
if (sessionChecks.status !== 0) process.exit(sessionChecks.status || 1);
Promise.all([require(path.join(appRoot,'.test','src','captureNext.test.js')).runCaptureNextChecks(),require(path.join(appRoot,'.test','src','syncFeedback.test.js')).runSyncChecks(),require(path.join(appRoot, '.test', 'src', 'withTimeout.test.js')).runTimeoutChecks(), require(path.join(appRoot,'.test','src','cameraZoom.test.js')).runCameraZoomChecks()])
  .then(() => console.log('recognition and capture timeout checks passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
