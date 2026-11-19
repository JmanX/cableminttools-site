import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Picker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { evidencePath, gapResize, validateEvidence, type Evidence, type Gap } from './gapWorkflow';
function destination(user:string,gap:string,file:string){evidencePath(user,user,gap,file);return new File(Paths.document,'gap-evidence',user,gap,file+'.jpg');}
export function localEvidenceExists(f:Evidence){return !!f.local_uri&&new File(f.local_uri).exists;}
export async function addGapPhoto(source:'camera'|'gallery',user:string,project:string,gap:string):Promise<Evidence|null>{
 evidencePath(user,project,gap,randomUUID());
 if(source==='camera'){const permission=await Picker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Camera permission is needed for evidence. Enable it in Android settings or choose an existing photo.');}
 // Android system Photo Picker grants access to selected images; no broad media permission.
 const result=source==='camera'?await Picker.launchCameraAsync({mediaTypes:['images'],quality:1,exif:false}):await Picker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,exif:false,allowsMultipleSelection:false});
 if(result.canceled||!result.assets?.[0])return null;
 const asset=result.assets[0],id=randomUUID(),context=ImageManipulator.manipulate(asset.uri);
 // Use decoded dimensions so EXIF rotation cannot produce an oversized long edge.
 let cacheUri='',target:File|undefined;
 try{
  let rendered=await context.renderAsync();
  const resize=gapResize(rendered.width,rendered.height);if(resize){context.resize(resize);rendered.release();rendered=await context.renderAsync();}
  try {const image=await rendered.saveAsync({format:SaveFormat.JPEG,compress:.8});cacheUri=image.uri;}finally{rendered.release();}
  const dir=new Directory(Paths.document,'gap-evidence',user,gap);dir.create({intermediates:true,idempotent:true});
  target=destination(user,gap,id);await new File(cacheUri).copy(target);
  const size=target.size;if(!target.exists||size<=0||size>10485760)throw Error('Compressed photo could not be preserved. Choose a smaller image and retry.');
  return {metadata:{id,user_id:user,project_id:project,entity_type:'gap',entity_id:gap,storage_path:evidencePath(user,project,gap,id),file_name:'evidence-'+id+'.jpg',mime_type:'image/jpeg',file_size:size,created_at:new Date().toISOString()},local_uri:target.uri,state:'pending',error:'',retries:0};
 }catch(e){if(target?.exists)target.delete();throw e;}
 finally {context.release();if(cacheUri.startsWith(Paths.cache.uri)){const cached=new File(cacheUri);if(cached.exists)cached.delete();}}
}
export async function readEvidenceBytes(f:Evidence,g:Gap):Promise<ArrayBuffer>{
 validateEvidence(f,g);const target=destination(g.user_id,g.id,f.metadata.id);if(target.uri!==f.local_uri||!target.exists)throw Error('Evidence photo is missing on this phone. Keep the Gap and retry after restoring the photo.');
 const bytes=await target.bytes();if(bytes.byteLength!==f.metadata.file_size)throw Error('Local evidence size changed. The Gap was kept for review.');
 return new Uint8Array(bytes).buffer;
}
export async function removeEvidence(f:Evidence){
 if(!f.local_uri)return;const m=f.metadata,target=destination(m.user_id,m.entity_id,m.id);if(target.uri!==f.local_uri)throw Error('Local photo path could not be verified.');if(target.exists)target.delete();
}
