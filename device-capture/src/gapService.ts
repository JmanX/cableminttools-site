import { supabase } from './supabase';
import { requireUser, serverError } from './deviceService';
import { sameFile, sameGap, validateGap, type Evidence, type Gap, type GapDeletion, type ProjectFile } from './gapWorkflow';
import { readEvidenceBytes, removeEvidence } from './gapEvidence';
import type { GapTransport } from './gapQueue';
const BUCKET='project-files';
const GAP_COLUMNS='id,user_id,project_id,building,floor_area,unit_location,category,description,status,photo_count,created_at,updated_at,resolved_at,deletion_requested_at';
const FILE_COLUMNS='id,user_id,project_id,entity_type,entity_id,storage_path,file_name,mime_type,file_size,created_at';
async function ownProject(user:string,project:string){
 await requireUser(user);
 const {data,error}=await supabase.from('field_projects').select('id').eq('id',project).eq('user_id',user).maybeSingle();
 if(error)throw serverError('Project access check failed',error);if(!data)throw Error('This project is no longer available. Select another project.');
}
async function readGap(g:Gap){const {data,error}=await supabase.from('field_gaps').select(GAP_COLUMNS).eq('id',g.id).eq('user_id',g.user_id).eq('project_id',g.project_id).maybeSingle();if(error)throw serverError('Gap check failed',error);return data as Gap|null;}
export async function saveGap(g:Gap){
 validateGap(g,g.user_id);await ownProject(g.user_id,g.project_id);
 const prior=await readGap(g);if(prior?.deletion_requested_at)throw Error('This Gap is being deleted. Refresh the project.');
 const {data,error}=await supabase.from('field_gaps').upsert(g,{onConflict:'id'}).select(GAP_COLUMNS).single();
 if(error)throw serverError('Gap upload failed',error);if(!data||!sameGap(data as Gap,g))throw Error('Gap was not confirmed. Retry this same issue.');return data as Gap;
}
export async function saveGapFile(f:Evidence){
 const m=f.metadata;await ownProject(m.user_id,m.project_id);
 const {data:gap,error:gapError}=await supabase.from('field_gaps').select(GAP_COLUMNS).eq('id',m.entity_id).eq('user_id',m.user_id).eq('project_id',m.project_id).maybeSingle();
 if(gapError)throw serverError('Photo parent check failed',gapError);if(!gap||gap.deletion_requested_at)throw Error('Photo cannot upload because its Gap is missing or being deleted.');
 const bytes=await readEvidenceBytes(f,gap as Gap);
 await requireUser(m.user_id);
 const {data:uploaded,error:uploadError}=await supabase.storage.from(BUCKET).upload(m.storage_path,bytes,{contentType:'image/jpeg',cacheControl:'60',upsert:true});
 if(uploadError)throw serverError('Photo upload failed; retained on this phone',uploadError);
 if(uploaded?.path!==m.storage_path)throw Error('Photo upload path was not confirmed. Retry this same photo.');
 await requireUser(m.user_id);
 const {data:info,error:infoError}=await supabase.storage.from(BUCKET).info(m.storage_path);
 if(infoError)throw serverError('Photo upload verification failed',infoError);
 if(!info||Number(info.size??info.metadata?.size)!==m.file_size)throw Error('Photo size was not confirmed by Storage. The local photo is retained for retry.');
 await requireUser(m.user_id);
 const {data,error}=await supabase.from('project_files').upsert(m,{onConflict:'id'}).select(FILE_COLUMNS).single();
 if(error)throw serverError('Photo metadata upload failed; retained for retry',error);
 if(!data||!sameFile(data as ProjectFile,m))throw Error('Photo metadata was not confirmed. Retry this same photo.');return data as ProjectFile;
}
async function objectNames(g:Gap){
 const prefix=`${g.user_id}/${g.project_id}/gaps/${g.id}`,names:string[]=[];
 for(let offset=0;;offset+=100){await requireUser(g.user_id);const {data,error}=await supabase.storage.from(BUCKET).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw serverError('Could not list Gap photos for cleanup',error);
  for(const file of data??[]){if(!/^[0-9a-f-]{36}\.jpg$/.test(file.name))throw Error('Unexpected photo path. Cleanup needs review.');names.push(prefix+'/'+file.name);}
  if(!data||data.length<100)return names;
 }
}
export async function deleteGap(g:Gap,files:Evidence[]){
 await ownProject(g.user_id,g.project_id);
 const marker={user_id:g.user_id,project_id:g.project_id,gap_id:g.id};
 const {error:markerError}=await supabase.from('field_gap_deletions').upsert(marker,{onConflict:'user_id,project_id,gap_id',ignoreDuplicates:true});if(markerError)throw serverError('Gap deletion journal could not be confirmed',markerError);
 const {data:markerRow,error:markerCheck}=await supabase.from('field_gap_deletions').select('gap_id').eq('user_id',g.user_id).eq('project_id',g.project_id).eq('gap_id',g.id).maybeSingle();if(markerCheck)throw serverError('Gap deletion journal check failed',markerCheck);if(!markerRow)throw Error('Gap deletion marker was not confirmed. Retry.');
 const current=await readGap(g);
 if(current){
  const {data,error}=await supabase.from('field_gaps').update({deletion_requested_at:current.deletion_requested_at??new Date().toISOString()}).eq('id',g.id).eq('user_id',g.user_id).eq('project_id',g.project_id).select(GAP_COLUMNS).single();
  if(error)throw serverError('Gap deletion could not start',error);if(!data?.deletion_requested_at)throw Error('Gap cleanup was not confirmed. Retry.');
  const paths=await objectNames(g);
  // Includes an uploaded object whose metadata acknowledgement failed.
  if(paths.length){await requireUser(g.user_id);const {error:removeError}=await supabase.storage.from(BUCKET).remove(paths);if(removeError)throw serverError('Photo cleanup failed. Deletion remains queued',removeError);}
  if((await objectNames(g)).length)throw Error('Some cloud photos remain. Retry cleanup before deleting this Gap.');
  await requireUser(g.user_id);
  const {error:metaError}=await supabase.from('project_files').delete().eq('user_id',g.user_id).eq('project_id',g.project_id).eq('entity_type','gap').eq('entity_id',g.id);
  if(metaError)throw serverError('Photo metadata cleanup failed',metaError);
  const {data:remaining,error:checkError}=await supabase.from('project_files').select('id').eq('user_id',g.user_id).eq('project_id',g.project_id).eq('entity_type','gap').eq('entity_id',g.id).limit(1);
  if(checkError)throw serverError('Photo metadata cleanup check failed',checkError);if(remaining?.length)throw Error('Photo metadata remains. Retry cleanup.');
  await requireUser(g.user_id);const {error:deleteError}=await supabase.from('field_gaps').delete().eq('id',g.id).eq('user_id',g.user_id).eq('project_id',g.project_id);
  if(deleteError)throw serverError('Gap deletion failed',deleteError);
 }
 if(await readGap(g))throw Error('Gap still exists on the server. Retry deletion.');
 // Local files are removed by the journal only after the cloud deletion is confirmed.
 void files;
}
export async function loadGapCloud(user:string){
 await requireUser(user);const gaps:Gap[]=[],files:ProjectFile[]=[],deletions:GapDeletion[]=[];
 for(let offset=0;;offset+=500){const {data,error}=await supabase.from('field_gaps').select(GAP_COLUMNS).eq('user_id',user).order('created_at',{ascending:false}).order('id').range(offset,offset+499);if(error)throw serverError('Gap list could not refresh',error);gaps.push(...(data??[]) as Gap[]);if(!data||data.length<500)break;}
 for(let offset=0;;offset+=500){const {data,error}=await supabase.from('project_files').select(FILE_COLUMNS).eq('user_id',user).order('created_at',{ascending:false}).order('id').range(offset,offset+499);if(error)throw serverError('Photo list could not refresh',error);files.push(...(data??[]) as ProjectFile[]);if(!data||data.length<500)break;}
 for(let offset=0;;offset+=500){const {data,error}=await supabase.from('field_gap_deletions').select('user_id,project_id,gap_id,created_at').eq('user_id',user).order('created_at').order('gap_id').range(offset,offset+499);if(error)throw serverError('Gap deletion list could not refresh',error);deletions.push(...(data??[]) as GapDeletion[]);if(!data||data.length<500)break;}
 if(gaps.some(g=>g.user_id!==user)||files.some(f=>f.user_id!==user))throw Error('Project data ownership could not be confirmed.');return {gaps,files,deletions};
}
export async function loadCalculationCounts(user:string){await requireUser(user);const counts:Record<string,number>={};for(let offset=0;;offset+=500){const {data,error}=await supabase.from('field_project_calculations').select('id,project_id').eq('user_id',user).order('id').range(offset,offset+499);if(error)throw serverError('Saved calculations could not be checked',error);for(const c of data??[])counts[c.project_id]=(counts[c.project_id]??0)+1;if(!data||data.length<500)return counts;}}
export async function gapPhotoUrl(file:ProjectFile){await ownProject(file.user_id,file.project_id);const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path,60);if(error)throw serverError('Private photo could not load. Retry when connected',error);if(!data?.signedUrl)throw Error('Private photo access was not confirmed.');return data.signedUrl;}
export const gapTransport:GapTransport={saveGap,saveFile:saveGapFile,deleteGap,removeLocal:removeEvidence};
