import { sameSavedAttempt, type Device, type Project, type SaveAttempt } from './deviceWorkflow';
export type UploadState='pending'|'uploading'|'uploaded'|'failed';
export type QueueItem={attempt:SaveAttempt;state:UploadState;error:string;retries:number;updatedAt:string;nextRetry?:number};
export type Snapshot={version:1;items:QueueItem[];projects:Project[];devices:Device[];pro:boolean|null;checkedAt:string;proCheckedAt?:string};
export type SyncReport={confirmed:number;failed:number;attempted:number};
export interface DurableStorage {getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>}
const blank=():Snapshot=>({version:1,items:[],projects:[],devices:[],pro:null,checkedAt:''});
/** One serialized journal publication: an unsuccessful write never updates memory.
 * Stable IDs reconcile interrupted/uncertain requests after process restart. */
export class CaptureQueue {
 private tail:Promise<unknown>=Promise.resolve();
 private snapshot:Snapshot=blank();
 private syncing=false;
 private worker:Promise<SyncReport>|null=null;
 private opened=false;
 private idleWaiters:(()=>void)[]=[];
 async idle(){if(this.syncing)await new Promise<void>(resolve=>this.idleWaiters.push(resolve));}
 async entitlement(pro:boolean){await this.change(s=>{s.pro=pro;s.proCheckedAt=new Date().toISOString();});}
 constructor(private storage:DurableStorage,readonly userId:string,private changed:(snapshot:Snapshot)=>void=()=>{}){}
 private key(){return 'cablemint.capture-journal.v1.'+this.userId;}
 async open(){
  const raw=await this.storage.getItem(this.key());
  if(raw){const parsed=JSON.parse(raw) as Snapshot;if(parsed.version!==1||!Array.isArray(parsed.items))throw Error('Unsupported capture journal. Keep app data and contact support.');
   if(!Array.isArray(parsed.projects)||!Array.isArray(parsed.devices)||parsed.projects.some(p=>p.user_id!==this.userId)||parsed.devices.some(d=>d.user_id!==this.userId))throw Error('Capture cache is invalid or belongs to another account. Keep app data and contact support.');
   if(parsed.items.some(i=>!i.attempt || i.attempt.user_id!==this.userId || !['pending','uploading','uploaded','failed'].includes(i.state)))throw Error('Capture journal owner/state mismatch.');
   this.snapshot=parsed;
  }
  this.opened=true;
  try{await this.change(s=>{s.items.forEach(i=>{if(i.state==='uploading'){i.state='pending';i.error='Interrupted upload; retry uses the same record ID.';}});});}catch(failure){this.opened=false;throw failure;}
 }
 read(){return JSON.parse(JSON.stringify(this.snapshot)) as Snapshot;}
 private change(edit:(s:Snapshot)=>void):Promise<void>{
  if(!this.opened)return Promise.reject(Error('Capture storage has not opened. Reopen the app before saving.'));
  const work=this.tail.catch(()=>{}).then(async()=>{const next=this.read();edit(next);await this.storage.setItem(this.key(),JSON.stringify(next));this.snapshot=next;this.changed(this.read());});
  this.tail=work;return work;
 }
 async cache(projects:Project[],devices:Device[],pro:boolean){
  if(projects.some(p=>p.user_id!==this.userId)||devices.some(d=>d.user_id!==this.userId))throw Error('Server cache owner mismatch.');
  await this.change(s=>{s.projects=projects;s.devices=devices;s.pro=pro;s.proCheckedAt=new Date().toISOString();s.checkedAt=new Date().toISOString();});
 }
 async enqueue(attempt:SaveAttempt){
  if(attempt.user_id!==this.userId)throw Error('Capture owner changed.');
  await this.change(s=>{const old=s.items.find(i=>i.attempt.id===attempt.id);if(old){if(JSON.stringify(old.attempt)!==JSON.stringify(attempt))throw Error('Retry fields differ from the durable capture.');return;}
   s.items.push({attempt,state:'pending',error:'',retries:0,updatedAt:new Date().toISOString()});});
 }
 async forgetDeleted(id:string){await this.change(s=>{s.items=s.items.filter(i=>i.attempt.id!==id);s.devices=s.devices.filter(d=>d.id!==id);});}
 async retry(id:string){await this.change(s=>{const i=s.items.find(i=>i.attempt.id===id);if(i&&i.state==='failed'){i.state='pending';i.error='';}});}
 sync(save:(attempt:SaveAttempt)=>Promise<Device>,refresh:(projectId:string)=>Promise<Device[]>,active:()=>boolean=()=>true,options:{retryFailed?:boolean;onlyId?:string}={}){
  if(this.worker)return this.worker;
  this.worker=this.runSync(save,refresh,active,options).finally(()=>{this.worker=null;});
  return this.worker;
 }
 private async runSync(save:(attempt:SaveAttempt)=>Promise<Device>,refresh:(projectId:string)=>Promise<Device[]>,active:()=>boolean,options:{retryFailed?:boolean;onlyId?:string}):Promise<SyncReport>{
  this.syncing=true;const report:SyncReport={confirmed:0,failed:0,attempted:0};
  try{
   const pending=this.read().items.filter(i=>(!options.onlyId || i.attempt.id===options.onlyId) && ((i.state==='pending' || i.state==='uploading') || (i.state==='failed' && (options.retryFailed || (i.nextRetry!==undefined && i.nextRetry<=Date.now())))));
   for(const item of pending){
    if(!active())break;
    await this.change(s=>{const i=s.items.find(i=>i.attempt.id===item.attempt.id)!;i.state='uploading';i.retries++;i.updatedAt=new Date().toISOString();});
    report.attempted++;
    try{
     const confirmed=await save(item.attempt);
     if(!sameSavedAttempt(confirmed,item.attempt))throw Error('Server did not confirm this capture. Retry the same record ID.');
     await this.change(s=>{const i=s.items.find(i=>i.attempt.id===item.attempt.id)!;i.state='uploaded';i.error='';i.nextRetry=undefined;i.updatedAt=new Date().toISOString();s.devices=[confirmed,...s.devices.filter(d=>d.id!==confirmed.id)];});
     report.confirmed++;
    }catch(error){
     report.failed++;
     await this.change(s=>{const i=s.items.find(i=>i.attempt.id===item.attempt.id)!;i.state='failed';i.error=(error as Error).message||String(error); const records=(error as {records?:Device[]}).records; if(records)i.error+='\nExisting: '+records.map(d=>[d.device_type,d.unit_location,d.mac_address,d.serial_number].filter(Boolean).join(' · ')).join('\n'); i.nextRetry=/network|fetch failed|timeout|timed out|offline|internet/i.test(i.error) ? Date.now()+Math.min(300000,15000*2**Math.min(i.retries,5)) : undefined;i.updatedAt=new Date().toISOString();});
     continue;
    }
    try{const devices=await refresh(item.attempt.project_id);await this.change(s=>{s.devices=[...devices,...s.devices.filter(d=>d.project_id!==item.attempt.project_id)];});}
    catch(error){await this.change(s=>{const i=s.items.find(i=>i.attempt.id===item.attempt.id)!;i.error='Uploaded; list refresh failed: '+(error as Error).message;});}
   }
   return report;
  }finally{this.syncing=false;this.idleWaiters.splice(0).forEach(resolve=>resolve());}
 }
}
