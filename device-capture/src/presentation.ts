import type { Snapshot } from './captureQueue';
import type { SyncPhase } from './syncFeedback';
import type { Device } from './deviceWorkflow';
import type { Status } from './theme';
export function syncBadge(phase:SyncPhase,journal:Snapshot|null,checked:boolean,projectId?:string):Status {
 const items=(journal?.items??[]).filter(i=>!projectId||i.attempt.project_id===projectId);
 if(phase==='syncing'||items.some(i=>i.state==='uploading'))return 'Syncing';
 if(phase==='failure'||items.some(i=>i.state==='failed'))return 'Failed';
 if(items.some(i=>i.state==='pending'))return 'Pending';
 return checked?'Synced':'Offline';
}
export function queueStatus(state:string):Status{return state==='uploaded'?'Synced':state==='uploading'?'Syncing':state==='failed'?'Failed':'Pending';}
export function latestCapture(devices:Device[]){return devices.reduce((last,d)=>d.captured_at>last?d.captured_at:last,'');}
// Only translate technical failures at the presentation boundary. Detailed evidence
// remains available in advanced panels; retries use the unchanged durable queue.
export function readableError(message:string){
 if(/fetch|network|offline|socket|connection|timeout/i.test(message))return 'Unable to reach CableMint. Check your connection, then retry. Saved captures remain on this phone.';
 if(/jwt|token|session|unauthorized/i.test(message))return 'Your sign-in could not be verified. Refresh account access or sign in again.';
 if(/duplicate|already.*(MAC|serial)/i.test(message))return message;
 if(/violates|postgres|supabase|PGRST|relation|row.level|native.*exception/i.test(message))return 'CableMint could not complete this operation. Retry or refresh the project. See advanced details for the technical error.';
 return message;
}
