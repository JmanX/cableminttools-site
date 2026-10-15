import type { Snapshot, SyncReport } from './captureQueue';
export type SyncPhase='idle'|'syncing'|'success'|'failure';
export const SYNC_SUCCESS_MS=3000;
export const syncLabels:Record<SyncPhase,string>={idle:'Sync Now',syncing:'Syncing…',success:'Synced ✓',failure:'Sync Failed — Retry'};
export function uploadCounts(snapshot:Snapshot|null){
 const items=snapshot?.items ?? [];
 return {pending:items.filter(i=>i.state==='pending').length,uploading:items.filter(i=>i.state==='uploading').length,uploaded:items.filter(i=>i.state==='uploaded').length,failed:items.filter(i=>i.state==='failed').length};
}
export function syncFeedback(report:SyncReport,snapshot:Snapshot,serverChecked=false):{phase:SyncPhase;message:string}{
 const counts=uploadCounts(snapshot);
 if(report.failed || counts.failed){
  const errors=[...new Set(snapshot.items.filter(i=>i.state==='failed').map(i=>i.error).filter(Boolean))];
  return {phase:'failure',message:errors.join('\n') || 'An upload was not confirmed. Retry when connected.'};
 }
 if(counts.pending || counts.uploading)return {phase:'idle',message:'Captures are saved on this phone and still awaiting upload. Keep the app open to sync.'};
 if(serverChecked)return {phase:'success',message:'Everything is synced — checked just now'};
 if(report.confirmed>0)return {phase:'success',message:report.confirmed+' capture(s) confirmed by the server.'};
 return {phase:'idle',message:'No pending uploads. Use Sync Now to check the server.'};
}

/** Manual synchronization always performs an authenticated server read, even with an empty journal. */
export async function checkedSync(upload:()=>Promise<SyncReport>,checkServer:()=>Promise<void>):Promise<SyncReport>{
 const started=Date.now();
 try { const report=await upload(); await checkServer(); return report; }
 finally { const remaining=300-(Date.now()-started); if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining)); }
}
