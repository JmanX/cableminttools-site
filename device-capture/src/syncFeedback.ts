import type { Snapshot, SyncReport } from './captureQueue';
export type SyncPhase='idle'|'syncing'|'success'|'failure';
export const SYNC_SUCCESS_MS=2500;
export const syncLabels:Record<SyncPhase,string>={idle:'Sync Now',syncing:'Syncing…',success:'Synced ✓',failure:'Sync Failed — Retry'};
export function uploadCounts(snapshot:Snapshot|null){
 const items=snapshot?.items ?? [];
 return {pending:items.filter(i=>i.state==='pending').length,uploading:items.filter(i=>i.state==='uploading').length,failed:items.filter(i=>i.state==='failed').length};
}
export function syncFeedback(report:SyncReport,snapshot:Snapshot):{phase:SyncPhase;message:string}{
 const counts=uploadCounts(snapshot);
 if(report.failed || counts.failed){
  const errors=[...new Set(snapshot.items.filter(i=>i.state==='failed').map(i=>i.error).filter(Boolean))];
  return {phase:'failure',message:errors.join('\n') || 'An upload was not confirmed. Retry when connected.'};
 }
 if(counts.pending || counts.uploading)return {phase:'idle',message:'Captures are saved on this phone and still awaiting upload. Keep the app open to sync.'};
 if(report.confirmed>0)return {phase:'success',message:report.confirmed+' capture(s) confirmed by the server.'};
 return {phase:'idle',message:'Everything is synced'};
}
