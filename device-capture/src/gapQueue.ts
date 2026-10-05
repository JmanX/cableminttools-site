import type { DurableStorage, SyncReport, UploadState } from './captureQueue';
import { gapFiles, sameFile, sameGap, validateEvidence, validateGap, type Evidence, type Gap, type GapDeletion, type GapItem, type GapSnapshot, type ProjectFile } from './gapWorkflow';
export interface GapTransport {saveGap(gap:Gap):Promise<Gap>;saveFile(file:Evidence):Promise<ProjectFile>;deleteGap(gap:Gap,files:Evidence[]):Promise<void>;removeLocal(file:Evidence):Promise<void>;}
const states:UploadState[]=['pending','uploading','uploaded','failed'];
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
export class GapQueue {
 private snapshot:GapSnapshot={version:1,items:[],gaps:[],files:[],checkedAt:'',calculations:{},calculationsCheckedAt:''};
 private tail:Promise<void>=Promise.resolve();private worker:Promise<SyncReport>|null=null;private opened=false;
 constructor(private storage:DurableStorage,private user:string,private publish:(s:GapSnapshot)=>void=()=>{}){}
 private get key(){return 'cablemint.gap-journal.v1.'+this.user;}
 read(){return clone(this.snapshot);}
 private change(edit:(s:GapSnapshot)=>void){const work=this.tail.catch(()=>{}).then(async()=>{const next=clone(this.snapshot);edit(next);await this.storage.setItem(this.key,JSON.stringify(next));this.snapshot=next;this.publish(this.read());});this.tail=work;return work;}
 async open(){
  const raw=await this.storage.getItem(this.key);
  if(raw){const s=JSON.parse(raw) as GapSnapshot;if(s.version!==1||!Array.isArray(s.items)||!Array.isArray(s.gaps)||!Array.isArray(s.files)||typeof s.checkedAt!=='string'||!s.calculations)throw Error('Gap journal is not readable. Keep its local photos and retry.');
   const ids=new Set<string>();for(const i of s.items){validateGap(i.gap,this.user);if(ids.has(i.gap.id)||!states.includes(i.state)||!['save','delete'].includes(i.action)||!Number.isInteger(i.revision)||i.revision<1||!Array.isArray(i.files)||i.files.length>3)throw Error('Gap journal identity is invalid.');ids.add(i.gap.id);for(const f of i.files){validateEvidence(f,i.gap);if(!states.includes(f.state))throw Error('Photo state is invalid.');}}
   if(s.gaps.some(g=>g.user_id!==this.user)||s.files.some(f=>f.user_id!==this.user))throw Error('Gap cache belongs to another account.');
   this.snapshot=s;
  }
  await this.change(s=>{for(const i of s.items){if(i.state==='uploading')i.state='pending';for(const f of i.files)if(f.state==='uploading')f.state='pending';}});
  this.opened=true;
 }
 async cache(gaps:Gap[],files:ProjectFile[],checkedAt:string,calculations?:Record<string,number>,deletions:GapDeletion[]=[]){
  if(gaps.some(g=>g.user_id!==this.user)||files.some(f=>f.user_id!==this.user)||deletions.some(d=>d.user_id!==this.user))throw Error('Server returned another account’s Gap data.');
  await this.change(s=>{s.gaps=gaps;s.files=files;for(const i of s.items)if(i.action!=='delete'&&deletions.some(d=>d.gap_id===i.gap.id&&d.project_id===i.gap.project_id)){i.action='delete';i.state='pending';i.error='';i.nextRetry=undefined;i.revision++;}s.checkedAt=checkedAt;if(calculations){s.calculations=calculations;s.calculationsCheckedAt=checkedAt;}
   // A remote deletion must not be resurrected from an already acknowledged local row.
   s.items=s.items.filter(i=>!!this.worker||i.state!=='uploaded'||i.action!=='save'||gaps.some(g=>g.id===i.gap.id&&!g.deletion_requested_at));
  });
 }
 async enqueue(gap:Gap,files:Evidence[]){
  if(!this.opened)throw Error('Gap storage is not ready. Keep the photos and retry.');
  validateGap(gap,this.user);if(files.length!==gap.photo_count||files.length<1||files.length>3||new Set(files.map(f=>f.metadata.id)).size!==files.length)throw Error('Add between one and three photos.');
  files.forEach(f=>validateEvidence(f,gap));
  await this.change(s=>{const old=s.items.find(i=>i.gap.id===gap.id);if(old){if(old.action==='delete'||!sameGap(old.gap,gap)||old.files.length!==files.length||old.files.some((f,index)=>!sameFile(f.metadata,files[index].metadata)||f.local_uri!==files[index].local_uri))throw Error('This Gap ID already belongs to another issue.');return;}s.items.push({gap,files,action:'save',state:'pending',error:'',retries:0,revision:1});});
 }
 async setStatus(gap:Gap,status:Gap['status']){
  validateGap(gap,this.user);await this.change(s=>{let i=s.items.find(i=>i.gap.id===gap.id);if(i?.action==='delete'||gap.deletion_requested_at)throw Error('Deletion is already queued.');
   if(!i){i={gap,files:gapFiles(s,gap.id),action:'save',state:'pending',error:'',retries:0,revision:1};s.items.push(i);}
   const now=new Date().toISOString();i.gap={...i.gap,status,resolved_at:status==='resolved'?now:null,updated_at:now};i.state='pending';i.error='';i.nextRetry=undefined;i.revision++;
  });
 }
 async remove(gap:Gap){
  validateGap(gap,this.user);await this.change(s=>{let i=s.items.find(i=>i.gap.id===gap.id);if(!i){i={gap,files:gapFiles(s,gap.id),action:'delete',state:'pending',error:'',retries:0,revision:1};s.items.push(i);}i.action='delete';i.state='pending';i.error='';i.nextRetry=undefined;i.revision++;});
 }
 hasWork(retryFailed=false){return this.snapshot.items.some(i=>i.state==='pending'||i.state==='uploading'||(i.state==='failed'&&(retryFailed||!!i.nextRetry&&i.nextRetry<=Date.now())));}
 async idle(){await this.worker;await this.tail;}
 sync(transport:GapTransport,active:()=>boolean,retryFailed=false):Promise<SyncReport>{
  if(this.worker)return this.worker;const work=this.run(transport,active,retryFailed);this.worker=work;void work.finally(()=>{if(this.worker===work)this.worker=null;}).catch(()=>{});return work;
 }
 private async run(t:GapTransport,active:()=>boolean,retryFailed:boolean){
  const report={attempted:0,confirmed:0,failed:0};const processed=new Set<string>();
  for(;;){const source=this.snapshot.items.find(i=>!processed.has(i.gap.id+':'+i.revision)&&(i.state==='pending'||i.state==='uploading'||(i.state==='failed'&&(retryFailed||!!i.nextRetry&&i.nextRetry<=Date.now()))));
   if(!source||!active())break;
   const item=clone(source),id=item.gap.id,revision=item.revision;processed.add(id+':'+revision);
   const current=()=>this.snapshot.items.find(i=>i.gap.id===id)?.revision===revision;
   await this.change(s=>{const i=s.items.find(i=>i.gap.id===id)!;if(i.revision===revision){i.state='uploading';i.error='';i.retries++;}});report.attempted++;
   try {
    if(item.action==='delete'){
     if(!active())throw Error('Sync interrupted. Keep the app open and retry.');
     await t.deleteGap(item.gap,item.files);
     for(const f of item.files)if(f.local_uri)await t.removeLocal(f);
     await this.change(s=>{if(!current())return;s.items=s.items.filter(i=>i.gap.id!==id);s.gaps=s.gaps.filter(g=>g.id!==id);s.files=s.files.filter(f=>f.entity_type!=='gap'||f.entity_id!==id);});report.confirmed++;continue;
    }
    if(!active())throw Error('Sync interrupted. Keep the app open and retry.');
    const confirmed=await t.saveGap(item.gap);if(!sameGap(confirmed,item.gap))throw Error('Server did not confirm the Gap. Retry the same ID.');
    for(const f of item.files){
     if(!current())break;if(f.state==='uploaded')continue;if(!active())throw Error('Sync interrupted. Keep the app open and retry.');
     await this.change(s=>{const file=s.items.find(i=>i.gap.id===id)?.files.find(x=>x.metadata.id===f.metadata.id);if(current()&&file){file.state='uploading';file.error='';file.retries++;}});
     try {const m=await t.saveFile(f);if(!sameFile(m,f.metadata))throw Error('Server did not confirm photo metadata. Retry this same photo.');
      await this.change(s=>{const file=s.items.find(i=>i.gap.id===id)?.files.find(x=>x.metadata.id===m.id);if(file){file.state='uploaded';file.error='';s.files=[m,...s.files.filter(x=>x.id!==m.id)];}});
     }catch(e){await this.change(s=>{const file=s.items.find(i=>i.gap.id===id)?.files.find(x=>x.metadata.id===f.metadata.id);if(file){file.state='failed';file.error=(e as Error).message;}});throw e;}
    }
    if(!current())continue;
    await this.change(s=>{const i=s.items.find(i=>i.gap.id===id)!;if(i.revision!==revision)return;if(i.files.length!==i.gap.photo_count||i.files.some(f=>f.state!=='uploaded'))throw Error('Photo confirmation is incomplete.');i.state='uploaded';i.error='';i.nextRetry=undefined;i.gap=confirmed;s.gaps=[confirmed,...s.gaps.filter(g=>g.id!==id)];});report.confirmed++;
   }catch(e){report.failed++;await this.change(s=>{const i=s.items.find(i=>i.gap.id===id);if(!i||i.revision!==revision)return;i.state='failed';i.error=(e as Error).message||String(e);i.nextRetry=/network|fetch|timeout|offline|internet|interrupted/i.test(i.error)?Date.now()+Math.min(300000,15000*2**Math.min(i.retries,5)):undefined;});}
  }
  return report;
 }
}
