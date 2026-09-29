import { searchHistory, previousScreen } from './historyModel';
import { emptyBatch, type Device } from './deviceWorkflow';
export function runHistoryChecks() {
 const d:Device={...emptyBatch,id:'a',project_id:'p',user_id:'u',building:'North',floor_area:'Level 2',unit_location:'Suite 104',device_type:'WAP',manufacturer:'Vendor',model:'M1',mac_address:'AA:BB:CC:DD:EE:FF',serial_number:'SER001',captured_at:'2026-09-29T12:00:00Z',verified:true};
 const p=[{id:'p',user_id:'u',name:'Site Pine'}];
 for(const term of ['pine','north','level 2','suite','wap','aa:bb','ser001','vendor','m1']) if(searchHistory([d],p,term).length!==1) throw Error('Missing search field: '+term);
 if(searchHistory([d],p,'pine suite').length!==1 || searchHistory([d],p,'pine unknown').length || searchHistory([d],p,'','other').length) throw Error('History scope/terms failed');
 if(previousScreen(['projects','types','scan']).join(',')!=='projects,types' || previousScreen(['projects']).length!==1) throw Error('Back stack failed');
 console.log('history search and previous-screen checks passed');
}