import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { AdvancedPanel, Button, ConfirmationPanel, EmptyState, Field, SectionHeading, StatusBadge, captureTime, colors, ui } from './components';
import { Icon } from './Icon';
import { queueStatus, readableError } from './presentation';
import { GAP_CATEGORIES, gapFiles, gapLocation, visibleGaps, type Evidence, type Gap, type GapSnapshot } from './gapWorkflow';
import type { GapQueue } from './gapQueue';
import { addGapPhoto, localEvidenceExists, removeEvidence } from './gapEvidence';
import { gapPhotoUrl } from './gapService';
export type GapNavigation={back:()=>boolean;hasDraft:()=>boolean;discard:()=>Promise<void>};
type Props={userId:string;project:{id:string;name:string};snapshot:GapSnapshot|null;queue:GapQueue|null;active:boolean;context:{building:string;floor_area:string};onBusy:(busy:boolean)=>void;onChange:(context?:{building:string;floor_area:string})=>void;onSync:()=>void};
export function gapRowState(snapshot:GapSnapshot|null,g:Gap){const item=snapshot?.items.find(i=>i.gap.id===g.id);if(item)return queueStatus(item.state);return gapFiles(snapshot,g.id).length===g.photo_count?'Synced':'Pending';}
function EvidencePhoto({file,onRemove}:{file:Evidence;onRemove?:()=>void}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[open,setOpen]=useState(false);const signedAt=useRef(0),alive=useRef(true);
 const local=localEvidenceExists(file)?file.local_uri:'';
 async function load(){setError('');if(local){setUrl(local);return local;}setLoading(true);try{const next=await gapPhotoUrl(file.metadata);if(alive.current){setUrl(next);signedAt.current=Date.now();}return next;}catch(e){if(alive.current)setError(readableError((e as Error).message));return '';}finally{if(alive.current)setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[file.metadata.id,file.local_uri]);
 async function expand(){if(!local&&Date.now()-signedAt.current>50000){if(!await load())return;}setOpen(true);}
 return <View style={{gap:8,flex:1,minWidth:100}}>
  <Pressable accessibilityRole="button" accessibilityLabel="View Gap photo" onPress={()=>{void expand();}} style={{height:138,borderRadius:10,overflow:'hidden',backgroundColor:colors.line,alignItems:'center',justifyContent:'center'}}>{loading?<ActivityIndicator color={colors.blue}/>:url&&!error?<Image source={{uri:url}} style={{width:'100%',height:'100%'}} resizeMode="cover" onError={()=>setError('Photo could not load. Connect and retry.')}/>:<Icon name="gallery" size={30}/>}</Pressable>
  {!!error&&<><Text style={ui.caption}>{error}</Text><Button title="Retry Photo" secondary onPress={()=>{void load();}}/></>}
  {onRemove&&<Button title="Remove" secondary icon="trash" onPress={onRemove}/>}
  <Text style={ui.caption}>{(file.metadata.file_size/1024).toFixed(0)} KB · {queueStatus(file.state)}</Text>
  <Modal visible={open} transparent onRequestClose={()=>setOpen(false)}><View style={{flex:1,backgroundColor:colors.blue,padding:20,justifyContent:'center',gap:16}}><Image source={{uri:url}} resizeMode="contain" style={{width:'100%',height:'75%'}} onError={()=>{setOpen(false);setError('Photo access expired or the connection was lost. Retry Photo.');}}/><Button title="Close Photo" onPress={()=>setOpen(false)}/></View></Modal>
 </View>;
}
export const GapWorkspace=forwardRef<GapNavigation,Props>(function GapWorkspace({userId,project,snapshot,queue,active,context,onBusy,onChange,onSync},ref){
 const [mode,setMode]=useState<'list'|'create'|'detail'>('list'),[filter,setFilter]=useState<'open'|'resolved'|'all'>('open'),[selected,setSelected]=useState(''),[step,setStep]=useState(0);
 const [id,setId]=useState(''),[createdAt,setCreatedAt]=useState(''),[building,setBuilding]=useState(''),[floor,setFloor]=useState(''),[location,setLocation]=useState(''),[category,setCategory]=useState<Gap['category']|''>(''),[description,setDescription]=useState(''),[photos,setPhotos]=useState<Evidence[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[details,setDetails]=useState(false),[savedId,setSavedId]=useState('');
 const locked=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function lock(value:boolean){locked.current=value;setBusy(value);onBusy(value);}
 async function discard(){if(locked.current)throw Error('Wait for the photo operation to finish.');lock(true);try{for(const f of photos)await removeEvidence(f);setPhotos([]);setMode('list');setError('');}finally{lock(false);}}
 function cancel(){Alert.alert('Discard this Gap draft?','The unsaved description and selected photos will be removed. Saved Gaps are kept.',[{text:'Keep Draft',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>{void discard().catch(e=>setError(e.message));}}]);}
 useImperativeHandle(ref,()=>({hasDraft:()=>mode==='create',discard,back:()=>{if(locked.current)return true;if(mode==='create'){if(step>0){setStep(step-1);setError('');}else cancel();return true;}if(mode==='detail'){setMode('list');setError('');return true;}return false;}}));
 function begin(){if(!queue){setError('Gap storage is not ready. Reopen the project and retry.');return;}setId(randomUUID());setCreatedAt(new Date().toISOString());setBuilding(context.building);setFloor(context.floor_area);setLocation('');setCategory('');setDescription('');setPhotos([]);setSavedId('');setError('');setStep(0);setMode('create');}
 async function photo(source:'camera'|'gallery'){if(locked.current||photos.length>=3)return;lock(true);setError('');try{const f=await addGapPhoto(source,userId,project.id,id);if(f&&alive.current)setPhotos(p=>[...p,f]);else if(f)await removeEvidence(f);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)lock(false);}}
 async function removePhoto(f:Evidence){if(locked.current)return;lock(true);try{await removeEvidence(f);setPhotos(p=>p.filter(x=>x.metadata.id!==f.metadata.id));}catch(e){setError((e as Error).message);}finally{lock(false);}}
 async function save(){if(locked.current||!queue)return;lock(true);setError('');try{
  const gap:Gap={id,user_id:userId,project_id:project.id,building:building.trim(),floor_area:floor.trim(),unit_location:location.trim(),category:category as Gap['category'],description:description.trim(),status:'open',photo_count:photos.length,created_at:createdAt,updated_at:createdAt,resolved_at:null,deletion_requested_at:null};
  await queue.enqueue(gap,photos);setSavedId(id);setSelected(id);setPhotos([]);setMode('detail');onChange({building:gap.building,floor_area:gap.floor_area});
 }catch(e){setError((e as Error).message);}finally{lock(false);}}
 async function changeStatus(g:Gap){if(locked.current||!queue)return;lock(true);setError('');try{await queue.setStatus(g,g.status==='open'?'resolved':'open');onChange();}catch(e){setError((e as Error).message);}finally{lock(false);}}
 function confirmDelete(g:Gap){Alert.alert('Delete this Gap and its photos?',gapLocation(g)+'\nDeletion is queued on this phone. Cloud photos and metadata are removed before the Gap disappears from the server.',[{text:'Cancel',style:'cancel'},{text:'Delete Gap',style:'destructive',onPress:()=>{void (async()=>{if(locked.current||!queue)return;lock(true);try{await queue.remove(g);setMode('list');onChange();}catch(e){setError((e as Error).message);}finally{lock(false);}})();}}]);}
 const all=visibleGaps(snapshot,project.id),g=all.find(g=>g.id===selected),visible=all.filter(g=>filter==='all'||g.status===filter);
 const steps=['Location','Category','Description','Photos'];
 const recent=all.map(g=>({building:g.building,floor_area:g.floor_area})).filter((c,i,a)=>i===a.findIndex(x=>x.building===c.building&&x.floor_area===c.floor_area)).slice(0,3);
 return <View style={{display:active?'flex':'none',gap:14}}>
  {!!error&&<View style={[ui.card,{borderColor:colors.danger}]}><Text accessibilityRole="alert" style={ui.error}>{readableError(error)}</Text><AdvancedPanel title="Technical details" open={details} onToggle={()=>setDetails(!details)}><Text selectable style={ui.caption}>{error}</Text></AdvancedPanel></View>}
  {mode==='list'?<>
   <View style={ui.row}><View style={ui.flex}><Text style={ui.heading}>Gaps / Punch List</Text><Text style={ui.muted}>{project.name} · {all.filter(g=>g.status==='open').length} open</Text></View></View>
   <Button title="Record Gap" icon="plus" disabled={!queue||busy} onPress={begin}/>
   <View style={[ui.row,{gap:6}]}>{(['open','resolved','all'] as const).map(f=><Pressable key={f} accessibilityRole="button" accessibilityState={{selected:filter===f}} onPress={()=>setFilter(f)} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:filter===f?colors.blue:'white',borderWidth:1,borderColor:colors.line}}><Text style={{fontWeight:'700',color:filter===f?'white':colors.ink}}>{f[0].toUpperCase()+f.slice(1)}</Text></Pressable>)}</View>
   {visible.map(g=><Pressable key={g.id} accessibilityRole="button" accessibilityLabel={g.category+', '+gapLocation(g)} onPress={()=>{setSelected(g.id);setSavedId('');setMode('detail');}} style={ui.historyRow}><View style={ui.row}><View style={ui.tile}><Icon name={g.status==='resolved'?'check':'warning'}/></View><View style={ui.flex}><Text style={ui.label}>{gapLocation(g)}</Text><Text style={ui.sectionTitle}>{g.category}</Text></View><StatusBadge status={gapRowState(snapshot,g)}/></View><Text numberOfLines={2} style={[ui.body,{marginTop:10}]}>{g.description}</Text><Text style={[ui.caption,{marginTop:8}]}>{g.status==='open'?'Open':'Resolved'} · {gapFiles(snapshot,g.id).length}/{g.photo_count} photos · {captureTime(g.created_at)}</Text></Pressable>)}
   {!visible.length&&<EmptyState icon="tasks" title={all.length?'No '+filter+' Gaps':'No Gaps recorded'} description={all.length?'Choose another filter to see this project’s issues.':'Document missing, damaged or incomplete work with private photo evidence.'} action="Record Gap" onPress={begin}/>}
   {(snapshot?.items??[]).some(i=>i.action==='delete'&&i.gap.project_id===project.id)&&<View style={ui.card}><Text style={ui.muted}>A deletion is queued. Photos are retained until cloud cleanup succeeds.</Text><Button title="Sync / Retry Cleanup" secondary onPress={onSync}/></View>}
  </>:mode==='create'?<>
   <View style={ui.card}><Text style={ui.eyebrow}>RECORD GAP · {step+1} / 4</Text><Text style={ui.heading}>{steps[step]}</Text><Text style={ui.muted}>{project.name}{building||floor?' · '+[building,floor].filter(Boolean).join(' / '):''}</Text><View style={ui.row}>{steps.map((s,i)=><View key={s} style={{flex:1,height:3,borderRadius:2,backgroundColor:i<=step?colors.green:colors.line}}/>)}</View></View>
   {step===0?<View style={ui.card}><Field label="Building" value={building} maxLength={120} onChange={setBuilding}/><Field label="Floor / Area" value={floor} maxLength={120} onChange={setFloor}/><Field label="Unit / Room / Location" value={location} maxLength={160} placeholder="Where is the issue?" onChange={setLocation}/>{recent.length>0&&<><Text style={ui.eyebrow}>RECENT BUILDING / FLOOR</Text>{recent.map((r,i)=><Button key={i} title={[r.building,r.floor_area].filter(Boolean).join(' / ')||'No building / floor'} secondary onPress={()=>{setBuilding(r.building);setFloor(r.floor_area);}}/>)}</>}</View>
   :step===1?<View style={{gap:8}}>{GAP_CATEGORIES.map(c=><Pressable key={c} accessibilityRole="button" accessibilityState={{selected:category===c}} onPress={()=>setCategory(c)} style={[ui.typeCard,category===c&&{borderColor:colors.success,backgroundColor:colors.mint}]}><Icon name={category===c?'check':'warning'}/><Text style={[ui.label,ui.flex]}>{c}</Text></Pressable>)}</View>
   :step===2?<View style={ui.card}><Text style={ui.label}>Describe the issue</Text><TextInput accessibilityLabel="Gap description" multiline textAlignVertical="top" style={[ui.input,{minHeight:156}]} maxLength={2000} value={description} onChangeText={setDescription} placeholder="What is missing or needs attention?" placeholderTextColor={colors.muted}/><Text style={ui.caption}>{description.length} / 2,000 characters</Text></View>
   :<><Text style={ui.body}>Add 1–3 evidence photos. They stay on this phone until private cloud storage confirms the upload.</Text><View style={[ui.row,{alignItems:'flex-start',flexWrap:'wrap'}]}>{photos.map(f=><EvidencePhoto key={f.metadata.id} file={f} onRemove={()=>{void removePhoto(f);}}/>)}</View><View style={ui.row}><View style={ui.flex}><Button title="Take Photo" icon="camera" secondary disabled={busy||photos.length>=3} onPress={()=>{void photo('camera');}}/></View><View style={ui.flex}><Button title="Choose Photo" icon="gallery" secondary disabled={busy||photos.length>=3} onPress={()=>{void photo('gallery');}}/></View></View><Text style={ui.caption}>Evidence photos are optimized for field detail. Scanner label photos stay temporary and are never added here.</Text></>}
   <Button title={busy?'Saving…':step===3?'Save Gap': 'Next: '+steps[step+1]} busy={busy} disabled={step===0?!location.trim():step===1?!category:step===2?!description.trim():photos.length<1} onPress={()=>{if(step===3)void save();else{setError('');setStep(step+1);}}}/>
   <Button title={step?'Previous Step':'Cancel Gap'} icon="back" secondary disabled={busy} onPress={()=>{if(step)setStep(step-1);else cancel();}}/>
  </>:g?<>
   {savedId===g.id&&<ConfirmationPanel title={gapRowState(snapshot,g)==='Synced'?'Gap saved & synced ✓':'Gap saved ✓'} status={gapRowState(snapshot,g)} detail={gapRowState(snapshot,g)==='Synced'?'Gap and every photo confirmed by CableMint cloud.':'Saved locally · Waiting for Gap and photo confirmation'}/>}
   <View style={ui.projectCard}><View style={ui.row}><Text style={[ui.heading,ui.flex]}>{g.category}</Text><StatusBadge status={gapRowState(snapshot,g)}/></View><Text style={ui.label}>{gapLocation(g)}</Text><Text style={ui.body}>{g.description}</Text><Text style={ui.caption}>{g.status==='open'?'Open':'Resolved'} · Created {captureTime(g.created_at)}{g.resolved_at?' · Resolved '+captureTime(g.resolved_at):''}</Text></View>
   <SectionHeading title="Photo evidence"/><View style={[ui.row,{alignItems:'flex-start',flexWrap:'wrap'}]}>{gapFiles(snapshot,g.id).map(f=><EvidencePhoto key={f.metadata.id} file={f}/>)}</View>
   {gapFiles(snapshot,g.id).length<g.photo_count&&<Text style={ui.muted}>Evidence upload is incomplete. Sync from the phone that recorded this Gap.</Text>}
   {gapRowState(snapshot,g)==='Failed'&&<Button title="Retry Gap & Photos" icon="sync" onPress={onSync}/>}
   <Button title={g.status==='open'?'Mark Resolved':'Reopen Gap'} icon={g.status==='open'?'check':'warning'} disabled={busy||gapFiles(snapshot,g.id).length!==g.photo_count} onPress={()=>{void changeStatus(g);}}/>
   <Button title="Record Another Gap" icon="plus" onPress={begin} disabled={busy}/>
   <Button title="Back to Gaps" secondary icon="back" disabled={busy} onPress={()=>{setMode('list');setSavedId('');}}/>
   <Button title="Delete Gap & Photos" secondary danger icon="trash" disabled={busy} onPress={()=>confirmDelete(g)}/>
  </>:<EmptyState icon="tasks" title="Gap no longer available" description="It may have been deleted from another device. Your other saved issues are kept." action="Back to Gaps" onPress={()=>setMode('list')}/>}
 </View>;
});
