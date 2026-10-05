import type { UploadState } from './captureQueue';
export const GAP_CATEGORIES=['Missing device','Cable not installed','Damaged equipment','Bad / missing label','No power','Inaccessible location','Blocked pathway','Incomplete work','Other site issue'] as const;
export type GapCategory=typeof GAP_CATEGORIES[number];
export type Gap={id:string;user_id:string;project_id:string;building:string;floor_area:string;unit_location:string;category:GapCategory;description:string;status:'open'|'resolved';created_at:string;updated_at:string;resolved_at:string|null;photo_count:number;deletion_requested_at:string|null};
export type ProjectFile={id:string;user_id:string;project_id:string;entity_type:'gap'|'device'|'drawing'|'report';entity_id:string;storage_path:string;file_name:string;mime_type:'image/jpeg';file_size:number;created_at:string};
export type Evidence={metadata:ProjectFile;local_uri:string;state:UploadState;error:string;retries:number};
export type GapItem={gap:Gap;files:Evidence[];action:'save'|'delete';state:UploadState;error:string;retries:number;revision:number;nextRetry?:number};
export type GapDeletion={user_id:string;project_id:string;gap_id:string;created_at:string};
export type GapSnapshot={version:1;items:GapItem[];gaps:Gap[];files:ProjectFile[];checkedAt:string;calculations:Record<string,number>;calculationsCheckedAt:string};
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function evidencePath(user:string,project:string,gap:string,file:string){if(![user,project,gap,file].every(id=>uuidPattern.test(id)))throw Error('Invalid photo identity. Reopen the project.');return `${user}/${project}/gaps/${gap}/${file}.jpg`;}
export function validateGap(g:Gap,user:string){
 if(g.user_id!==user||![g.id,g.user_id,g.project_id].every(id=>uuidPattern.test(id)))throw Error('Gap belongs to a different account or project.');
 if(!GAP_CATEGORIES.includes(g.category)||!g.description.trim()||g.description.length>2000)throw Error('Choose a category and describe the issue (up to 2,000 characters).');
 if(!g.unit_location.trim())throw Error('Enter the unit, room or location for this issue.');
 if(g.building.length>120||g.floor_area.length>120||g.unit_location.length>160)throw Error('Location text is too long.');
 if(!Number.isInteger(g.photo_count)||g.photo_count<1||g.photo_count>3)throw Error('A Gap needs one to three photos.');
 if(!['open','resolved'].includes(g.status)||(g.status==='resolved')!==!!g.resolved_at||![g.created_at,g.updated_at,...(g.resolved_at?[g.resolved_at]:[])].every(d=>Number.isFinite(Date.parse(d))))throw Error('Gap status or timestamp is invalid.');
}
export function validateEvidence(f:Evidence,g:Gap){
 const m=f.metadata;
 if(m.entity_type!=='gap'||m.entity_id!==g.id||m.user_id!==g.user_id||m.project_id!==g.project_id||m.storage_path!==evidencePath(g.user_id,g.project_id,g.id,m.id)||m.mime_type!=='image/jpeg'||!Number.isSafeInteger(m.file_size)||m.file_size<1||m.file_size>10485760)throw Error('Photo identity or size could not be verified.');
 if(!(f.state==='uploaded'&&!f.local_uri)&&(!f.local_uri.startsWith('file://')||!f.local_uri.endsWith('/'+g.user_id+'/'+g.id+'/'+m.id+'.jpg')))throw Error('Photo must be preserved in CableMint local storage.');
}
export function sameGap(a:Gap,b:Gap){return ['id','user_id','project_id','building','floor_area','unit_location','category','description','status','photo_count'].every(k=>a[k as keyof Gap]===b[k as keyof Gap])&&Date.parse(a.created_at)===Date.parse(b.created_at)&&((!a.resolved_at&&!b.resolved_at)||Date.parse(a.resolved_at!)===Date.parse(b.resolved_at!))&&!a.deletion_requested_at;}
export function sameFile(a:ProjectFile,b:ProjectFile){return ['id','user_id','project_id','entity_type','entity_id','storage_path','file_name','mime_type','file_size'].every(k=>a[k as keyof ProjectFile]===b[k as keyof ProjectFile])&&Date.parse(a.created_at)===Date.parse(b.created_at);}
export function visibleGaps(s:GapSnapshot|null,project?:string){
 const map=new Map((s?.gaps??[]).filter(g=>!g.deletion_requested_at).map(g=>[g.id,g]));
 for(const i of s?.items??[]) {if(i.action==='delete')map.delete(i.gap.id);else map.set(i.gap.id,i.gap);}
 return [...map.values()].filter(g=>!project||g.project_id===project).sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
export function gapFiles(s:GapSnapshot|null,id:string){const map=new Map((s?.files??[]).filter(f=>f.entity_type==='gap'&&f.entity_id===id).map(f=>[f.id,{metadata:f,local_uri:'',state:'uploaded' as UploadState,error:'',retries:0}]));for(const f of s?.items.find(i=>i.gap.id===id)?.files??[])map.set(f.metadata.id,f);return [...map.values()];}
export function gapCounts(s:GapSnapshot|null){const counts={pending:0,uploading:0,uploaded:0,failed:0};for(const i of s?.items??[]){counts[i.state]++;if(i.action==='save')for(const f of i.files)counts[f.state]++;}return counts;}
export function gapLocation(g:Pick<Gap,'building'|'floor_area'|'unit_location'>){return [g.building,g.floor_area,g.unit_location].filter(Boolean).join(' / ');}
export function gapResize(width:number,height:number){if(width<=0||height<=0)throw Error('Photo dimensions unavailable. Choose the photo again.');return Math.max(width,height)>1800?(width>=height?{width:1800}:{height:1800}):null;}
