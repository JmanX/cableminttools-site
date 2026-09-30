const assert=require('node:assert/strict');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
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

 console.log('durable queue restart, interrupted upload, lost-response retry, single worker, write failure and account isolation checks passed');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});