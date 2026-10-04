import {syncBadge,queueStatus,readableError,latestCapture} from './presentation';
import type {Snapshot} from './captureQueue';
import {emptyBatch} from './deviceWorkflow';
export function runPresentationChecks(){
 const journal:Snapshot={version:1,items:[],projects:[],devices:[],pro:true,checkedAt:''};
 if(syncBadge('idle',journal,false)!=='Offline'||syncBadge('idle',journal,true)!=='Synced')throw Error('Unconfirmed server state must not appear synced');
 if(syncBadge('syncing',journal,true)!=='Syncing'||syncBadge('failure',journal,true)!=='Failed')throw Error('Server operation feedback missing');
 journal.items.push({attempt:{id:'d',user_id:'u',project_id:'p',draft:{...emptyBatch,mac_address:'AA:BB:CC:DD:11:22',serial_number:''}},state:'pending',error:'',retries:0,updatedAt:''});
 if(syncBadge('idle',journal,true)!=='Pending'||syncBadge('idle',journal,true,'other')!=='Synced')throw Error('Project badges must scope queue state');
 journal.items[0].state='uploading';if(syncBadge('idle',journal,true)!=='Syncing')throw Error('Uploading state');
 journal.items[0].state='failed';if(syncBadge('idle',journal,true)!=='Failed')throw Error('Failed state');
 journal.items[0].state='uploaded';if(syncBadge('idle',journal,true)!=='Synced')throw Error('Uploaded confirmation');
 if(queueStatus('pending')==='Synced'||queueStatus('uploading')==='Synced'||queueStatus('failed')==='Synced')throw Error('Only server-confirmed records may appear synced');
 if(readableError('PGRST relation missing').includes('PGRST')||!readableError('fetch failed').includes('retry'))throw Error('Actionable error copy');
 if(latestCapture([])!=='')throw Error('No invented capture date');
 console.log('UI status scopes, server confirmation and actionable error checks passed');
}
