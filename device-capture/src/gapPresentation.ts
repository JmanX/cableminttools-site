import { gapCounts, gapFiles, gapRecordState, visibleGaps, type GapSnapshot } from './gapWorkflow';
import { syncFeedback, uploadCounts } from './syncFeedback';
import type { Snapshot, SyncReport } from './captureQueue';
import type { Status } from './theme';
import { queueStatus } from './presentation';
export function gapRecordStatus(snapshot:GapSnapshot|null,g:import('./gapWorkflow').Gap):Status{const item=snapshot?.items.find(i=>i.gap.id===g.id);return item?queueStatus(gapRecordState(item)):snapshot?.gaps.some(remote=>remote.id===g.id)?'Synced':'Pending';}
export function gapRowStatus(snapshot:GapSnapshot|null,g:import('./gapWorkflow').Gap):Status{const item=snapshot?.items.find(i=>i.gap.id===g.id);if(item)return queueStatus(item.state);return gapFiles(snapshot,g.id).length===g.photo_count?'Synced':'Pending';}
export function gapSyncSummary(snapshot:GapSnapshot|null,g:import('./gapWorkflow').Gap){const record=gapRecordStatus(snapshot,g),photos=gapFiles(snapshot,g.id);if(record==='Synced'){if(photos.some(f=>f.state==='failed'))return 'Gap synced · Photo upload failed';if(photos.some(f=>f.state==='uploading'))return 'Gap synced · Uploading photos';if(photos.length!==g.photo_count||photos.some(f=>f.state==='pending'))return 'Gap synced · Photos pending';return 'Gap and every photo confirmed by CableMint cloud.';}return record==='Failed'?'Gap record upload failed · Local evidence retained':'Saved locally · Waiting for Gap record confirmation';}

export function combinedCounts(devices:Snapshot|null,gaps:GapSnapshot|null){const a=uploadCounts(devices),b=gapCounts(gaps);return {pending:a.pending+b.pending,uploading:a.uploading+b.uploading,uploaded:a.uploaded+b.uploaded,failed:a.failed+b.failed};}
export function withGapStatus(base:Status,gaps:GapSnapshot|null,project?:string):Status{
 if(base==='Failed'||base==='Syncing')return base;
 const items=(gaps?.items??[]).filter(i=>!project||i.gap.project_id===project);
 if(items.some(i=>i.state==='failed'||i.files.some(f=>f.state==='failed')))return 'Failed';
 if(items.some(i=>i.state==='uploading'))return 'Syncing';
 if(items.some(i=>i.state==='pending')||visibleGaps(gaps,project).some(g=>gapFiles(gaps,g.id).length<g.photo_count))return 'Pending';
 return base;
}
export function combinedFeedback(report:SyncReport,devices:Snapshot,gaps:GapSnapshot|null,checked=false){
 const counts=gapCounts(gaps);
 if(counts.failed){const errors=(gaps?.items??[]).filter(i=>i.state==='failed').map(i=>i.error).filter(Boolean);return {phase:'failure' as const,message:'Gap or photo sync failed. Local evidence is retained. Retry in Sync & Uploads.'+(errors.length?'\n'+errors.join('\n'):'')};}
 if(counts.pending||counts.uploading)return {phase:'idle' as const,message:'Gaps and photos saved locally · Waiting for complete cloud confirmation.'};
 if(visibleGaps(gaps).some(g=>gapFiles(gaps,g.id).length<g.photo_count))return {phase:'idle' as const,message:'Cloud check complete · Some Gap photos are still pending on the phone that recorded them.'};
 return syncFeedback(report,devices,checked);
}
