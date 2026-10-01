const assert=require('node:assert/strict');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
const {syncFeedback,SYNC_SUCCESS_MS}=require('../.test/src/syncFeedback.js');
const {CaptureQueue}=require('../.test/src/captureQueue.js');
const {emptyBatch,cleanDraft}=require('../.test/src/deviceWorkflow.js');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cablemint-queue-'));
 let failWrite=false;
 const storage={getItem:async k=>fs.readFile(path.join(dir,k),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;}),setItem:async(k,v)=>{if(failWrite)throw Error('disk full');await fs.writeFile(path.join(dir,k+'.tmp'),v);await fs.rename(path.join(dir,k+'.tmp'),path.join(dir,k));}};
 try{
 const attempt={id:'stable-a',user_id:'u',project_id:'p',captured_at:new Date().toISOString(),draft:cleanDraft({...emptyBatch,device_type:'WAP'},'','S1','Room 1')};
 const q=new CaptureQueue(storage,'u');await q.open();await q.enqueue(attempt);
 failWrite=true;await assert.rejects(q.enqueue({...attempt,id:'b'}),/disk full/);assert.equal(q.read().items.length,1);failWrite=false;
 let restarted=new CaptureQueue(storage,'u');await restarted.open();assert.equal(restarted.read().items[0].attempt.id,'stable-a');
 let cloud=null,inserts=0; const save=async a=>{if(cloud)return cloud;inserts++;cloud={...a.draft,...a,verified:true};throw Error('timeout after server commit');};
 await restarted.sync(save,async()=>[cloud]);assert.equal(restarted.read().items[0].state,'failed');assert.match(restarted.read().items[0].error,/timeout/);
 restarted=new CaptureQueue(storage,'u');await restarted.open();await restarted.retry('stable-a');await Promise.all([restarted.sync(save,async()=>[cloud]),restarted.sync(save,async()=>[cloud])]);assert.equal(inserts,1);assert.equal(restarted.read().items[0].state,'uploaded');assert.equal(restarted.read().devices.length,1);
 const raw=JSON.parse(await storage.getItem('cablemint.capture-journal.v1.u'));raw.items[0].state='uploading';await storage.setItem('cablemint.capture-journal.v1.u',JSON.stringify(raw));
 restarted=new CaptureQueue(storage,'u');await restarted.open();assert.equal(restarted.read().items[0].state,'pending');
 const other=new CaptureQueue(storage,'other');await other.open();assert.equal(other.read().items.length,0);
 await assert.rejects(other.enqueue(attempt),/owner changed/);
 const unopened=new CaptureQueue(storage,'unopened');await assert.rejects(unopened.enqueue({...attempt,user_id:'unopened'}),/not opened/);
 await storage.setItem('cablemint.capture-journal.v1.corrupt','{bad');const broken=new CaptureQueue(storage,'corrupt');await assert.rejects(broken.open());await assert.rejects(broken.cache([],[],true),/not opened/);assert.equal(await storage.getItem('cablemint.capture-journal.v1.corrupt'),'{bad');
 await restarted.sync(async a=>({...cloud,user_id:'wrong'}),async()=>[]);assert.equal(restarted.read().items[0].state,'failed');assert.match(restarted.read().items[0].error,/did not confirm/);
 await restarted.retry('stable-a');await restarted.sync(async()=>cloud,async()=>{throw Error('refresh offline');});assert.equal(restarted.read().items[0].state,'uploaded');assert.match(restarted.read().items[0].error,/refresh offline/);
 await restarted.forgetDeleted('stable-a');assert.equal(restarted.read().items.length,0);assert.equal(restarted.read().devices.length,0);


 // Delayed server acknowledgement: shared worker, uploading counts, never premature success.
 const memory={value:null,getItem:async()=>memory.value,setItem:async(k,v)=>{memory.value=v;}};
 const feedbackQueue=new CaptureQueue(memory,'u');await feedbackQueue.open();await feedbackQueue.enqueue(attempt);
 let confirm;let uploads=0;
 const slowSave=a=>{uploads++;return new Promise(resolve=>{confirm=()=>resolve({...a.draft,...a,verified:true});});};
 const first=feedbackQueue.sync(slowSave,async()=>[]);
 const second=feedbackQueue.sync(slowSave,async()=>[]);
 assert.equal(first,second);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(uploads,1);assert.equal(feedbackQueue.read().items[0].state,'uploading');
 assert.notEqual(syncFeedback({confirmed:0,attempted:1,failed:0},feedbackQueue.read()).phase,'success');
 confirm();const confirmed=await first;
 assert.equal(syncFeedback(confirmed,feedbackQueue.read()).phase,'success');
 assert.ok(SYNC_SUCCESS_MS>=2000 && SYNC_SUCCESS_MS<=3000);
 assert.equal(syncFeedback(await feedbackQueue.sync(slowSave,async()=>[]),feedbackQueue.read()).message,'No pending uploads. Use Sync Now to check the server.');
 await feedbackQueue.enqueue({...attempt,id:'failed-feedback'});
 const failure=await feedbackQueue.sync(async()=>{throw Error('Network request failed: offline');},async()=>[]);
 assert.equal(syncFeedback(failure,feedbackQueue.read()).phase,'failure');
 assert.match(syncFeedback(failure,feedbackQueue.read()).message,/offline/);
 const skipped=await feedbackQueue.sync(slowSave,async()=>[]);
 assert.equal(skipped.attempted,0); // backoff still applies to automatic sync
 const retry=await feedbackQueue.sync(async a=>({...a.draft,...a,verified:true}),async()=>[],()=>true,{retryFailed:true});
 assert.equal(retry.confirmed,1);assert.equal(syncFeedback(retry,feedbackQueue.read()).phase,'success');
 await feedbackQueue.enqueue({...attempt,id:'background'});
 const paused=await feedbackQueue.sync(slowSave,async()=>[],()=>false);
 assert.equal(paused.confirmed,0);assert.equal(syncFeedback(paused,feedbackQueue.read()).phase,'idle');

 // If local status publication fails after a server commit, the same worker can
 // reconcile the stranded Uploading item without falsely reporting an empty queue.
 memory.value=null;
 const stranded=new CaptureQueue(memory,'u');await stranded.open();
 await stranded.enqueue({...attempt,id:'stranded'});
 const originalWrite=memory.setItem;
 let blockJournal=false;
 memory.setItem=async(k,v)=>{if(blockJournal)throw Error('journal write failed');return originalWrite(k,v);};
 await assert.rejects(stranded.sync(async a=>{blockJournal=true;return {...a.draft,...a,verified:true};},async()=>[]),/journal write failed/);
 assert.equal(stranded.read().items.find(i=>i.attempt.id==='stranded').state,'uploading');
 assert.notEqual(syncFeedback({confirmed:0,attempted:0,failed:0},stranded.read()).message,'Everything is synced');
 blockJournal=false;
 const reconciled=await stranded.sync(async a=>({...a.draft,...a,verified:true}),async()=>[]);
 assert.equal(reconciled.confirmed,1);
 assert.equal(stranded.read().items.find(i=>i.attempt.id==='stranded').state,'uploaded');
 console.log('sync feedback checks: delayed confirmation, single worker, counts, empty queue, visible errors, explicit retry and paused sync passed');

 console.log('durable queue restart, interrupted upload, lost-response retry, single worker, write failure and account isolation checks passed');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});