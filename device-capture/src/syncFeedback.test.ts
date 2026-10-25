import {checkedSync,syncFeedback,uploadCounts,SYNC_SUCCESS_MS} from './syncFeedback';
import type {Snapshot} from './captureQueue';
export async function runSyncChecks(){
 const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
 const snapshot:Snapshot={version:1,items:[],projects:[],devices:[],pro:true,checkedAt:''};
 const empty={confirmed:0,attempted:0,failed:0};let checks=0;let checkedAt='';
 assert(syncFeedback(empty,snapshot).phase==='idle','Empty local journal is not a server confirmation');
 const report=await checkedSync(async()=>empty,async()=>{checks++;checkedAt='2026-10-01T00:00:00Z';});
 const result=syncFeedback(report,snapshot,true);
 assert(checks===1&&!!checkedAt&&result.phase==='success'&&result.message==='Everything is synced — checked just now','Zero uploads must still perform and confirm a server check');
 let failed=false;const previous=checkedAt;
 try{await checkedSync(async()=>empty,async()=>{checks++;throw Error('Network unavailable');});}catch{failed=true;}
 assert(failed&&checks===2&&checkedAt===previous,'Failed server check must reject without changing last successful timestamp');
 const counts=uploadCounts(snapshot);assert(counts.pending===0&&counts.uploading===0&&counts.uploaded===0&&counts.failed===0,'All four counts refreshed');
 assert(SYNC_SUCCESS_MS===3000,'Success confirmation must remain for three seconds');
 console.log('Empty-journal authenticated check, failure, timestamp and sync feedback checks passed');
}
