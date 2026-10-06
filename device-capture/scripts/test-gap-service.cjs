const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..','.test','src'),U='10000000-0000-4000-8000-000000000001',P='20000000-0000-4000-8000-000000000001',G='30000000-0000-4000-8000-000000000001',F='40000000-0000-4000-8000-000000000001',now='2026-10-04T12:00:00.000Z';
const gap={id:G,user_id:U,project_id:P,building:'A',floor_area:'2',unit_location:'201',category:'Missing device',description:'Synthetic service fixture',status:'open',photo_count:1,created_at:now,updated_at:now,resolved_at:null,deletion_requested_at:null};
const metadata={id:F,user_id:U,project_id:P,entity_type:'gap',entity_id:G,storage_path:U+'/'+P+'/gaps/'+G+'/'+F+'.jpg',file_name:'evidence.jpg',mime_type:'image/jpeg',file_size:1200,created_at:now};
const file={metadata,local_uri:'file:///documents/gap-evidence/'+U+'/'+G+'/'+F+'.jpg',state:'pending',error:'',retries:0};
let auth=U,projectAvailable=true,mode='',calls=[],rows={field_projects:[{id:P,user_id:U}],field_gaps:[],project_files:[],field_gap_deletions:[],field_project_calculations:[]};const objects=new Map();
const clone=x=>JSON.parse(JSON.stringify(x));
const mock={auth:{getUser:async()=>({data:{user:{id:auth}},error:null})},from(table){
 const q={table,operation:'select',filters:[],payload:null,one:false};
 const b={select(){return b;},eq(k,v){q.filters.push([k,v]);return b;},order(){return b;},range(){return b;},limit(){return b;},single(){q.one=true;return b;},maybeSingle(){q.one=true;return b;},upsert(p,options){q.operation='upsert';q.payload=clone(p);q.options=options;return b;},update(p){q.operation='update';q.payload=clone(p);return b;},delete(){q.operation='delete';return b;},then(resolve,reject){
  calls.push(clone(q));let data=rows[table].filter(r=>q.filters.every(([k,v])=>r[k]===v)),error=null;
  if(table==='field_projects'&&!projectAvailable)data=[];
  if(q.operation==='upsert'){
   assert.equal(q.payload.user_id,U);
   if(table==='project_files'&&mode==='metadataFail')error={message:'metadata connection lost'};
   else if(table==='field_gaps'&&rows.field_gap_deletions.some(d=>d.gap_id===q.payload.id))error={message:'violates deletion RLS'};
   else {const previous=rows[table].find(r=>table==='field_gap_deletions'?r.gap_id===q.payload.gap_id:r.id===q.payload.id);if(!previous)rows[table].push(q.payload);else if(!q.options?.ignoreDuplicates)Object.assign(previous,q.payload);data=[q.payload];}
  } else if(q.operation==='update'){for(const r of data)Object.assign(r,q.payload);}
  else if(q.operation==='delete'){rows[table]=rows[table].filter(r=>!data.includes(r));data=[];if(table==='field_gaps'&&mode==='deleteLostResponse')error={message:'network response lost'};}
  return Promise.resolve({data:q.one?data[0]??null:data,error}).then(resolve,reject);
 }};return b;
},storage:{from(bucket){
 assert.equal(bucket,'project-files');return {
 async upload(key,bytes,options){calls.push({storage:'upload',key});if(mode==='rlsDenied')return {data:null,error:{message:'new row violates row-level security policy for table objects',code:'AccessDenied',statusCode:'403'}};if(mode==='service503')return {data:null,error:{message:'temporarily unavailable',statusCode:'503'}};assert(bytes instanceof ArrayBuffer);assert.deepEqual(options,{contentType:'image/jpeg',cacheControl:'60',upsert:true});objects.set(key,bytes.byteLength);return {data:{path:mode==='wrongPath'?'wrong.jpg':key},error:null};},
 async info(key){calls.push({storage:'info',key});return {data:{size:mode==='wrongSize'?1:objects.get(key)},error:null};},
 async list(prefix){calls.push({storage:'list',prefix});return {data:[...objects.keys()].filter(k=>k.startsWith(prefix+'/')).map(k=>({name:k.slice(prefix.length+1)})),error:null};},
 async remove(keys){calls.push({storage:'remove',keys});if(mode==='removeFail')return {error:{message:'photo cleanup network failed'}};for(const key of keys)objects.delete(key);return {data:[],error:null};},
 async createSignedUrl(key,seconds){assert.equal(seconds,60);calls.push({storage:'signed',key});return {data:{signedUrl:'https://private.example.test/short-lived-test-url'},error:null};},
 };}}};
require.cache[path.join(root,'supabase.js')]={id:path.join(root,'supabase.js'),filename:path.join(root,'supabase.js'),loaded:true,exports:{supabase:mock}};
require.cache[path.join(root,'gapEvidence.js')]={id:path.join(root,'gapEvidence.js'),filename:path.join(root,'gapEvidence.js'),loaded:true,exports:{readEvidenceBytes:async f=>new ArrayBuffer(f.metadata.file_size),removeEvidence:async()=>{}}};
const service=require(path.join(root,'gapService.js'));
(async()=>{
 auth=P;await assert.rejects(service.saveGap(gap),/sign in again/);assert.equal(calls.length,0);auth=U;projectAvailable=false;await assert.rejects(service.saveGap(gap),/project.*no longer/);assert(!calls.some(c=>c.operation==='upsert'));projectAvailable=true;calls=[];
 assert.deepEqual(await service.saveGap(gap),gap);
 mode='rlsDenied';await assert.rejects(service.saveGapFile(file),e=>e.code==='AccessDenied'&&e.status===403);assert.equal(objects.size,0);mode='service503';await assert.rejects(service.saveGapFile(file),e=>e.status===503&&e.message.includes('503'));mode='';
 mode='metadataFail';await assert.rejects(service.saveGapFile(file),/metadata/);assert.equal(objects.size,1);assert.equal(rows.project_files.length,0);mode='';
 const priorUploads=calls.filter(c=>c.storage==='upload').length;assert.deepEqual(await service.saveGapFile({...file,state:'failed',retries:1}),metadata);assert.equal(calls.filter(c=>c.storage==='upload').length,priorUploads,'metadata retry must not repeat confirmed bytes');assert.equal(objects.size,1);assert.equal(rows.project_files.length,1);
 const priorMetaWrites=calls.filter(c=>c.table==='project_files'&&c.operation==='upsert').length;await service.saveGapFile({...file,state:'failed',retries:2});assert.equal(calls.filter(c=>c.table==='project_files'&&c.operation==='upsert').length,priorMetaWrites,'lost metadata response recovery must not repeat confirmed metadata');
 mode='wrongPath';await assert.rejects(service.saveGapFile(file),/path.*not confirmed/);mode='wrongSize';await assert.rejects(service.saveGapFile(file),/size.*not confirmed/);mode='';
 rows.field_gaps[0].deletion_requested_at=now;const uploads=calls.filter(c=>c.storage==='upload').length;await assert.rejects(service.saveGapFile(file),/being deleted/);assert.equal(calls.filter(c=>c.storage==='upload').length,uploads);rows.field_gaps[0].deletion_requested_at=null;
 await service.gapPhotoUrl(metadata);assert.equal(calls.at(-1).storage,'signed');
 mode='removeFail';await assert.rejects(service.deleteGap(gap,[file]),/cleanup/);assert.equal(rows.field_gap_deletions.length,1);assert.equal(rows.field_gaps.length,1);assert.equal(rows.project_files.length,1);assert.equal(objects.size,1);assert(!calls.some(c=>c.operation==='delete'&&c.table==='field_gaps'));
 mode='deleteLostResponse';await assert.rejects(service.deleteGap(gap,[file]),/deletion failed/);assert.equal(objects.size,0);assert.equal(rows.project_files.length,0);assert.equal(rows.field_gaps.length,0);mode='';await service.deleteGap(gap,[file]);assert.equal(rows.field_gap_deletions.length,1);
 await assert.rejects(service.saveGap(gap),/deletion RLS/);
 const cloud=await service.loadGapCloud(U);assert.equal(cloud.deletions.length,1);
 for(const q of calls.filter(c=>c.table&&c.operation==='select'))assert(q.filters.some(([k,v])=>k==='user_id'&&v===U),'every database read scopes ownership');
 console.log('Gap service: authenticated project preflight, stable Storage upsert, size/path/metadata confirmation, private short-lived URLs, cleanup failure retention, lost-delete-response retry and deletion-marker rejection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
