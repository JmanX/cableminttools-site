import { GapQueue, type GapTransport } from './gapQueue';
import { gapCounts, evidencePath, type Gap, type Evidence, type GapSnapshot } from './gapWorkflow';
import { gapRecordStatus, gapSyncSummary, withGapStatus } from './gapPresentation';
import { syncBadge } from './presentation';
import { gapRetryable } from './gapRetry';
const U='10000000-0000-4000-8000-000000000001',C1='20000000-0000-4000-8000-000000000001',G='30000000-0000-4000-8000-000000000001',F='40000000-0000-4000-8000-000000000001',date='2026-10-06T12:00:00Z';
function check(value:unknown,message:string){if(!value)throw Error(message);}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const gap=(count=1):Gap=>({id:G,user_id:U,project_id:C1,building:'C',floor_area:'1',unit_location:'109',category:'Missing device',description:'Retained evidence regression',status:'open',photo_count:count,created_at:date,updated_at:date,resolved_at:null,deletion_requested_at:null});
const photo=(id=F):Evidence=>({metadata:{id,user_id:U,project_id:C1,entity_type:'gap',entity_id:G,storage_path:evidencePath(U,C1,G,id),file_name:'evidence.jpg',mime_type:'image/jpeg',file_size:1200,created_at:date},local_uri:'file:///documents/gap-evidence/'+U+'/'+G+'/'+id+'.jpg',state:'pending',error:'',retries:0});
const authorization='Photo upload failed; retained on this phone: new row violates row-level security policy for table "objects"\nCode: AccessDenied';
function disk(initial:GapSnapshot|null=null){let raw=initial?JSON.stringify(initial):null;return {getItem:async()=>raw,setItem:async(_k:string,v:string)=>{raw=v;}};}
const deviceJournal={version:1 as const,items:[],projects:[],devices:[],pro:true,checkedAt:date};
export async function runGapHotfixChecks(){
 for(const text of [authorization,'network request AccessDenied','network request Status: 403','42501 permission denied','RLS denied','forbidden connection loss'])check(!gapRetryable(Error(text)),'Authorization must not auto-retry: '+text);
 check(!gapRetryable({message:'network',statusCode:'403'}),'HTTP 403 overrides network wording');
 for(const error of [Error('offline'),Error('request timeout'),Error('connection loss'),Error('Status: 503'),{message:'service unavailable',status:502}])check(gapRetryable(error),'Transient failure must remain retryable');
 const old:GapSnapshot={version:1,items:[{gap:gap(),files:[{...photo(),state:'failed',error:authorization,retries:2}],action:'save',state:'failed',error:authorization,retries:2,revision:1,nextRetry:Date.now()-1}],gaps:[gap()],files:[],checkedAt:date,calculations:{},calculationsCheckedAt:date};
 const storage=disk(old),q=new GapQueue(storage,U);await q.open();
 check(!q.hasWork(),'Legacy authorization failure must wait for manual retry');
 check(q.read().items[0].nextRetry===undefined,'Old automatic auth backoff must clear');
 check(gapRecordStatus(q.read(),gap())==='Synced','Existing confirmed Gap record must remain Synced');
 check(gapSyncSummary(q.read(),gap())==='Gap synced · Photo upload failed','Separate photo failure copy missing');
 const counts=gapCounts(q.read());check(counts.uploaded===1&&counts.failed===1,'Do not count the confirmed Gap as a failed upload');
 check(withGapStatus(syncBadge('failure',deviceJournal,true,C1),q.read(),C1)==='Failed','C1 must show its failed photo');
 for(const project of ['A2','B1','A1'])check(withGapStatus(syncBadge('failure',deviceJournal,true,project),q.read(),project)==='Synced','Unrelated project inherited C1/global failure');
 check(withGapStatus(syncBadge('failure',deviceJournal,true),q.read())==='Failed','Workspace failure must remain visible');
 let rowWrites=0,photoWrites=0;const objects=new Map<string,Evidence>(),metadata=new Map<string,Evidence>();
 const transport:GapTransport={saveGap:async g=>{rowWrites++;return clone(g);},saveFile:async f=>{photoWrites++;objects.set(f.metadata.storage_path,clone(f));metadata.set(f.metadata.id,clone(f));return clone(f.metadata);},deleteGap:async()=>{},removeLocal:async()=>{}};
 await q.sync(transport,()=>true);check(photoWrites===0&&rowWrites===0,'Automatic worker retried authorization failure');
 await q.sync(transport,()=>true,true,G);
 check(rowWrites===0&&photoWrites===1,'Photo retry must not rewrite an acknowledged Gap');
 check(objects.size===1&&metadata.size===1,'Stable object and metadata retry duplicated evidence');
 const retained=q.read().items[0];check(retained.gap.id===G&&retained.files[0].metadata.id===F&&retained.files[0].metadata.storage_path===photo().metadata.storage_path&&retained.files[0].local_uri===photo().local_uri,'Retry changed retained Gap/photo identity');
 check(retained.state==='uploaded'&&gapCounts(q.read()).failed===0,'Recovery must clear all failed items');
 check(withGapStatus(syncBadge('idle',deviceJournal,true,C1),q.read(),C1)==='Synced','C1 did not recover');
 // v1.4.0 may not yet have cached its acknowledged row; refresh proves it without creating a new Gap.
 const uncached=new GapQueue(disk({...old,gaps:[]}),U);await uncached.open();check(gapRecordStatus(uncached.read(),gap())==='Pending','Unconfirmed old row cannot be claimed Synced');await uncached.cache([gap()],[],date);await uncached.sync(transport,()=>true,true,G);check(rowWrites===0,'Refreshed existing record was unnecessarily re-uploaded');
 // New Gap acknowledgement is persisted before the failed photo and survives a restart.
 const d=disk(),fresh=new GapQueue(d,U);await fresh.open();await fresh.enqueue(gap(),[photo()]);let gapWrites=0,attempts=0;
 const failed={...transport,saveGap:async(g:Gap)=>{gapWrites++;return clone(g);},saveFile:async(f:Evidence)=>{attempts++;throw Object.assign(Error(authorization),{code:'AccessDenied',status:403});}};
 await fresh.sync(failed,()=>true);check(fresh.read().items[0].recordState==='uploaded','Photo failure erased Gap acknowledgement');
 const restart=new GapQueue(d,U);await restart.open();check(gapCounts(restart.read()).uploaded===1&&!restart.hasWork(),'Restart lost record confirmation or resumed permanent retry');
 await restart.setStatus(gap(),'resolved');await restart.sync(failed,()=>true);check(gapWrites===2&&attempts===1,'Status edit must not auto-retry permission-failed photos');
 await restart.sync(transport,()=>true,true,G);check(rowWrites===0,'Status-acknowledged record must be skipped on photo retry');
 // Only the failed second photo retries; the first confirmed photo and record are skipped.
 const two=new GapQueue(disk(),U);await two.open();const F2='40000000-0000-4000-8000-000000000002';await two.enqueue(gap(2),[photo(),photo(F2)]);
 let rows=0,first=0,second=0,fail=true;const partial={...transport,saveGap:async(g:Gap)=>{rows++;return clone(g);},saveFile:async(f:Evidence)=>{if(f.metadata.id===F)first++;else{second++;if(fail){fail=false;throw Error('Connection lost');}}return clone(f.metadata);}};
 await two.sync(partial,()=>true);check(two.read().items[0].nextRetry!==undefined,'Transient failure lost automatic backoff');
 await two.sync(partial,()=>true,true,G);check(rows===1&&first===1&&second===2,'Retry duplicated successful operations');
 // A targeted retry must not touch another project's failed item.
 const targeted=new GapQueue(disk({...old,items:[...old.items,{...clone(old.items[0]),gap:{...gap(),id:'30000000-0000-4000-8000-000000000002',project_id:'20000000-0000-4000-8000-000000000002'},files:[]}]}),U);
 await targeted.open();let targetedCalls=0;await targeted.sync({...transport,saveFile:async f=>{targetedCalls++;return clone(f.metadata);}},()=>true,true,G);check(targetedCalls===1&&targeted.read().items[1].state==='failed','Targeted retry touched unrelated Gap');
 console.log('v1.4.1 Gap hotfix: legacy retained-photo recovery, unchanged IDs/path, independent record/photo states, project isolation, authorization pause, transient backoff, acknowledged-operation skipping and targeted retry passed');
}
