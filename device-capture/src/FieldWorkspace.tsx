import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Keyboard, Pressable, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from './supabase';
import { createProject, DuplicateDeviceError, ProjectCreateError, deleteDevice, loadDevices, loadHistory, loadProjects, readPro, saveDevice } from './deviceService';
import { batchStorageKey, emptyBatch, duplicateFields, restoreBatch, type Batch, type Device, type Project, type SaveAttempt } from './deviceWorkflow';
import { previousScreen, searchHistory, type Screen } from './historyModel';
import { DeviceScanner } from './DeviceScanner';
import { Button, colors, Field, ui } from './ui';
import { CaptureQueue, type Snapshot } from './captureQueue';
import { SyncStatus } from './SyncStatus';
import { SYNC_SUCCESS_MS, checkedSync, syncFeedback, uploadCounts, type SyncPhase } from './syncFeedback';
import appConfig from '../app.json';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader, AdvancedPanel, BottomNavigation, CaptureStepHeader, ConfirmationPanel, DeviceHistoryRow, DeviceTypeCard, EmptyState, ProjectCard, SectionHeading, StatusBadge, type Tab } from './components';
import { Icon } from './Icon';
import { latestCapture, queueStatus, readableError, syncBadge } from './presentation';
import { nextCaptureBatch, completedCaptureScreens } from './captureNext';
import { GapQueue } from './gapQueue';
import { gapTransport, loadGapCloud, loadCalculationCounts } from './gapService';
import { visibleGaps, type GapSnapshot } from './gapWorkflow';
import { combinedCounts, combinedFeedback, withGapStatus } from './gapPresentation';
import { GapWorkspace, type GapNavigation } from './GapWorkspace';

const TYPES = ['WAP', 'Intercom', 'Network Switch', 'Security Camera', 'Access Control', 'Fiber / Other'];
export function FieldWorkspace({ session }: { session: Session }) {
  const userId = session.user.id;
  const [stack, setStack] = useState<Screen[]>(['projects']);
  const screen = stack[stack.length - 1];
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<Device[]>([]);
  const [batch, setBatch] = useState<Batch>({ ...emptyBatch });
  const [batchReady, setBatchReady] = useState('');
  const [pro, setPro] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [serverFresh,setServerFresh]=useState(false);
  const [serverTime, setServerTime] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Synced' | 'Pending' | 'Failed'>('All');
  const [historyProject, setHistoryProject] = useState('');
  const [picking, setPicking] = useState(false);
  const [scanMounted,setScanMounted]=useState(false);
  const [scannerBusy,setScannerBusy]=useState(false);
  const [lastSavedId,setLastSavedId]=useState('');
  const [selectedDevice,setSelectedDevice]=useState<Device|null>(null);
  const [showProjectFilter,setShowProjectFilter]=useState(false);
  const [showBatch,setShowBatch]=useState(false);
  const [showError,setShowError]=useState(false);
  const [name, setName] = useState('');
  const [creation, setCreation] = useState<{ id: string; name: string } | null>(null);
  const op = useRef(false), alive = useRef(true), writes = useRef(Promise.resolve());
  const [journal, setJournal] = useState<Snapshot | null>(null);
  const [gapJournal,setGapJournal]=useState<GapSnapshot|null>(null);
  const [gapBusy,setGapBusy]=useState(false);
  const gapQueue=useRef<GapQueue|null>(null),gapNavigation=useRef<GapNavigation|null>(null);
  const uploadPaused=useRef(false);
  const queue = useRef<CaptureQueue | null>(null);
  const syncWork=useRef(false),workspaceReady=useRef(false);
  const successTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [syncPhase,setSyncPhase]=useState<SyncPhase>('idle');
  const [syncMessage,setSyncMessage]=useState('');
  useEffect(()=>()=>{if(successTimer.current)clearTimeout(successTimer.current);},[]);
  async function syncQueue(manual=false,onlyId?:string) {
    const q=queue.current,gq=gapQueue.current;
    if (!q || !gq || !workspaceReady.current || syncWork.current || uploadPaused.current || (manual && op.current)) return;
    const items=q.read().items;
    const hasWork=items.some(i=>(!onlyId || i.attempt.id===onlyId) && ((i.state==='pending' || i.state==='uploading') || (i.state==='failed' && (manual || (i.nextRetry!==undefined && i.nextRetry<=Date.now())))));
    if(!hasWork && !(gq.hasWork(manual)&&!onlyId) && !manual)return;
    syncWork.current=true;
    if(manual){op.current=true;setBusy(true);}
    if(successTimer.current){clearTimeout(successTimer.current);successTimer.current=null;}
    setSyncPhase('syncing');setSyncMessage(manual ? 'Checking the server and synchronizing records and photos…' : 'Uploading saved records and photo evidence…');
    try {
      const active=()=>alive.current && !uploadPaused.current && AppState.currentState==='active';
      const upload=async()=>{const devices=await q.sync(saveDevice,id=>loadDevices(userId,id),active,{retryFailed:manual,onlyId});const gaps=onlyId?{attempted:0,confirmed:0,failed:0}:await gq.sync(gapTransport,active,manual);return {attempted:devices.attempted+gaps.attempted,confirmed:devices.confirmed+gaps.confirmed,failed:devices.failed+gaps.failed};};
      const report=manual ? await checkedSync(upload,async()=>{
        const [captures,gapCloud]=await Promise.all([loadHistory(userId),loadGapCloud(userId)]);
        if(!alive.current || uploadPaused.current)throw Error('Server check interrupted. Retry when the app is ready.');
        const checkedAt=new Date().toISOString();
        await q.cacheServerDevices(captures,checkedAt);
        await gq.cache(gapCloud.gaps,gapCloud.files,checkedAt,undefined,gapCloud.deletions);
        if(alive.current){setServerTime(new Date(checkedAt).toLocaleString());setServerFresh(true);}
      }) : await upload();
      if(!alive.current)return;
      const result=combinedFeedback(report,q.read(),gq.read(),manual);
      setSyncPhase(result.phase);setSyncMessage(result.message);
      if(result.phase==='success')successTimer.current=setTimeout(()=>{if(alive.current){setSyncPhase('idle');setSyncMessage(combinedFeedback({confirmed:0,attempted:0,failed:0},q.read(),gq.read()).message);}successTimer.current=null;},SYNC_SUCCESS_MS);
    } catch (failure) {
      if(alive.current){if(manual)setServerFresh(false);setSyncPhase('failure');setSyncMessage('Sync could not be confirmed: '+(failure as Error).message);}
    } finally {syncWork.current=false;if(manual){op.current=false;if(alive.current)setBusy(false);}}
  }
  useEffect(() => {
    const q=new CaptureQueue(AsyncStorage,userId,s=>{if(alive.current){setJournal(s);setRows(s.devices);}});
    queue.current=q;
    const gq=new GapQueue(AsyncStorage,userId,s=>{if(alive.current)setGapJournal(s);});gapQueue.current=gq;
    void Promise.all([q.open(),gq.open()]).then(()=>{workspaceReady.current=true;if(alive.current){const s=q.read();setProjects(s.projects);setRows(s.devices);setPro(s.pro);setServerTime(s.checkedAt ? new Date(s.checkedAt).toLocaleString() : '');void syncQueue();void refresh();}})
     .catch(f=>{if(alive.current)setStorageError('Capture journal could not load: '+f.message);});
  },[userId]);
  useEffect(()=>{const timer=setInterval(()=>{if(AppState.currentState==='active')void syncQueue();},30000);return()=>clearInterval(timer);},[]);
  const key = project ? batchStorageKey(userId, project.id) : '';
  const push = (next: Screen) => { setError(''); if(next==='scan')setScanMounted(true); setStack(s => s.at(-1)===next?s:[...s, next]); };
  function back() {
    if (op.current || gapBusy) return;
    if(screen==='gaps'&&gapNavigation.current?.back())return;
    if(selectedDevice){setSelectedDevice(null);return;}
    if (screen === 'create' && creation) {
      Alert.alert('Leave project creation?', 'The project may already exist. Refresh projects before creating it again.', [{ text: 'Stay', style: 'cancel' }, { text: 'Back', onPress: () => { setCreation(null); setName(''); setStack(previousScreen); } }]);
    } else { setError(''); setPicking(false); setStack(previousScreen); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (screen === 'scan') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (op.current) return true; if(selectedDevice){setSelectedDevice(null);return true;} if (stack.length > 1) { back(); return true; } return false; });
    return () => sub.remove();
  }, [stack, creation,selectedDevice,gapBusy]);
  async function refresh() {
    if (!workspaceReady.current || op.current) return;
    op.current = true; setBusy(true); setError('');
    try {
      const entitlement = await readPro(userId);
      if(!alive.current)return;setPro(entitlement);await queue.current?.entitlement(entitlement);
      const own = await loadProjects(userId);
      const [captures,gapCloud]=await Promise.all([loadHistory(userId),loadGapCloud(userId)]);
      const calculations=await loadCalculationCounts(userId).catch(()=>undefined);
      if (!alive.current) return;
      setServerFresh(true);setPro(entitlement); setProjects(own); setRows(captures); setServerTime(new Date().toLocaleString());
      await queue.current?.cache(own,captures,entitlement);
      await gapQueue.current?.cache(gapCloud.gaps,gapCloud.files,new Date().toISOString(),calculations,gapCloud.deletions);void syncQueue();
      if (project && !own.some(p => p.id === project.id)) { setProject(null); setStack(['projects']); }
    } catch (failure) { if (alive.current) {setServerFresh(false);setError((failure as Error).message);} }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active' && screen !== 'scan' && screen !== 'create') { void syncQueue(); void refresh(); } }); return () => sub.remove(); }, [screen, project?.id]);
  useEffect(() => {
    let cancelled = false; setBatchReady(''); setStorageError('');
    if (key) void writes.current.catch(() => {}).then(() => AsyncStorage.getItem(key)).then(raw => { if (!cancelled) { setBatch(restoreBatch(raw)); setBatchReady(key); } })
      .catch(() => { if (!cancelled) setStorageError('Batch settings could not load. Reopen the project to retry.'); });
    return () => { cancelled = true; };
  }, [key]);
  useEffect(() => {
    if (!key || key !== batchReady) return;
    const value = JSON.stringify(batch);
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(key, value));
    void writes.current.catch(() => { if (alive.current) setStorageError('Batch settings could not be stored. Keep the app open and retry.'); });
  }, [key, batchReady, batch]);
  function openCreateProject(){
    const proceed=async()=>{try{if(gapNavigation.current?.hasDraft())await gapNavigation.current.discard();push('create');}catch(e){setError((e as Error).message);}};
    if(scanMounted||gapNavigation.current?.hasDraft())Alert.alert('Create a new project?','Opening a new project discards the unsaved capture or Gap draft. Saved records are kept.',[{text:'Stay',style:'cancel'},{text:'Continue',onPress:()=>{void proceed();}}]);else void proceed();
  }
  function chooseProject(p:Project) {
    const choose=()=>{if(project?.id!==p.id){setScanMounted(false);setLastSavedId('');setStack(s=>s.filter(item=>item!=='scan'));}setProject(p);setSavedMessage('');push(picking?'types':'project');setPicking(false);};
    if(gapNavigation.current?.hasDraft()&&project?.id!==p.id){Alert.alert('Switch project?','The unsaved Gap draft and its photos will be discarded. Saved Gaps and devices are kept.',[{text:'Stay',style:'cancel'},{text:'Switch project',onPress:()=>{void gapNavigation.current?.discard().then(choose).catch(e=>setError(e.message));}}]);return;}
    if(scanMounted && project?.id!==p.id)Alert.alert('Switch capture project?','This will discard the open scan. Your saved captures and remembered batch settings are retained.',[{text:'Stay',style:'cancel'},{text:'Switch project',onPress:choose}]);else choose();
  }
  function capture() {
    if (op.current) return;
    if (pro !== true) { push('account'); setError('Refresh account access to verify CableMint Pro before capturing.'); return; }
    if (scanMounted && project) push('scan'); else if (project) push('types'); else { setPicking(true); push('projects'); }
  }
  async function newProject() {
    if (op.current) return;
    op.current = true; setBusy(true); setError('');
    const attempt = creation ?? { id: randomUUID(), name: name.trim() };
    try {
      const created = await createProject(userId, attempt.name, attempt.id);
      let own: Project[];
      try { own = await loadProjects(userId); }
      catch { own = [created, ...projects.filter(p => p.id !== created.id)]; if (alive.current) setError('Project created; list refresh failed. Refresh when connected.'); }
      if (alive.current) {
        setScanMounted(false);setLastSavedId('');setProjects(own); await queue.current?.cache(own,rows,pro===true); setProject(created); setName(''); setCreation(null); setSavedMessage(''); Keyboard.dismiss();
        setStack(s => [...s.slice(0, -1).filter(item=>item!=='scan'), picking ? 'types' : 'project']); setPicking(false);
      }
    } catch (failure) { if (alive.current) { if (creation || (failure instanceof ProjectCreateError && failure.uncertain)) setCreation(attempt); setError((failure as Error).message); } }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  async function save(attempt: SaveAttempt) {
    if (!project || attempt.project_id !== project.id || attempt.user_id !== userId) throw new Error('Project changed. Go Back and select a project.');
    if (op.current) throw new Error('Another operation is running. Wait and retry.');
    op.current = true;
    try {
      if(!queue.current || !journal) throw new Error('Capture storage is not ready. Keep this scan and retry.');
      const latest=queue.current.read();
      const previous=latest.items.find(i=>i.attempt.id===attempt.id);
      if(!previous){
        const candidates=[...rows.filter(d=>d.project_id===project.id),...latest.items.filter(i=>i.attempt.project_id===project.id && i.state!=='uploaded').map(i=>({...i.attempt.draft,...i.attempt,verified:true,captured_at:i.attempt.captured_at ?? ''}))];
        const conflicts=duplicateFields(candidates,attempt.draft);
        if(conflicts.length)throw new DuplicateDeviceError(candidates.filter(d=>conflicts.some(c=>c.id===d.id)));
      }
      const durable=previous?.attempt ?? {...attempt,captured_at:new Date().toISOString()};
      await queue.current.enqueue(durable);
      // Publish locally before any network request. The worker alone can mark Uploaded.
      const unit = nextCaptureBatch(batch, durable.draft).unit_location;
      if(alive.current){setLastSavedId(durable.id);setBatch(b=>nextCaptureBatch(b,durable.draft));setSavedMessage('Saved on this phone. Pending upload; see Sync & Uploads for server confirmation.');}
      void syncQueue();
      return unit;
    } finally { op.current = false; }
  }
  async function remove(device: Device) {
    if (op.current) return;
    op.current = true; setBusy(true); setError('');
    try {
      uploadPaused.current=true;await Promise.all([queue.current?.idle(),gapQueue.current?.idle()]);
      await deleteDevice(userId, device.project_id, device.id);
      await queue.current?.forgetDeleted(device.id);
      const server = await loadHistory(userId);
      if (alive.current) { setSelectedDevice(null);setRows(server); setServerTime(new Date().toLocaleTimeString()); await queue.current?.cache(projects,server,pro===true); }
    } catch (failure) { if (alive.current) setError((failure as Error).message + '\nRefresh the server list before trying again.'); }
    finally { uploadPaused.current=false;op.current = false; if (alive.current) setBusy(false); }
  }
  function confirmDelete(device: Device) { Alert.alert('Delete from Supabase?', `${device.device_type} · ${device.unit_location}\n${device.mac_address || device.serial_number}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(device); } }]); }
  async function signOut() {
    if (op.current || gapBusy) return; op.current = true; setBusy(true);
    try { uploadPaused.current=true;await Promise.all([queue.current?.idle(),gapQueue.current?.idle()]);const result = await supabase.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }
    catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { uploadPaused.current=false;op.current = false; if (alive.current) setBusy(false); }
  }
  function startCapture(type:string){
    setBatch(b=>({...b,device_type:type}));setLastSavedId('');push('scan');
  }
  function captureNext(){
    setScanMounted(false);setScannerBusy(false);setStack(completedCaptureScreens);
  }
  const counts=combinedCounts(journal,gapJournal);
  const status=withGapStatus(syncBadge(syncPhase,journal,serverFresh),gapJournal);
  const projectGaps=visibleGaps(gapJournal,project?.id);
  const localItems=(journal?.items??[]).filter(i=>i.state!=='uploaded'&&!rows.some(d=>d.id===i.attempt.id));
  const localDevices:Device[]=localItems.map(i=>({...i.attempt.draft,id:i.attempt.id,project_id:i.attempt.project_id,user_id:i.attempt.user_id,captured_at:i.attempt.captured_at??'',verified:true}));
  const localFiltered=filter==='Synced'?[]:searchHistory(localDevices,projects,search,historyProject).filter(d=>filter==='All'||(filter==='Failed'?localItems.find(i=>i.attempt.id===d.id)?.state==='failed':localItems.find(i=>i.attempt.id===d.id)?.state!=='failed'));
  const filtered=filter==='Pending'||filter==='Failed'?[]:searchHistory(rows,projects,search,historyProject);
  const visibleHistory=[...localFiltered,...filtered].sort((a,b)=>b.captured_at.localeCompare(a.captured_at));
  const projectDevices=[...rows,...localDevices].filter(d=>d.project_id===project?.id).sort((a,b)=>b.captured_at.localeCompare(a.captured_at));
  const saved=journal?.items.find(i=>i.attempt.id===lastSavedId);
  const savedStatus=saved?queueStatus(saved.state):'Pending';
  const saveFeedback=saved?<ConfirmationPanel title={saved.state==='uploaded'?'Saved & synced ✓':'Device saved ✓'} status={savedStatus}
    detail={saved.state==='uploaded'?'Confirmed by CableMint cloud.':saved.state==='failed'?'Saved locally · Upload failed. Open Sync & Uploads to retry.':'Saved locally · Waiting to sync'}/>:null;
  const activeTab:Tab=screen==='scan'||screen==='types'||picking?'capture':screen==='history'?'history':screen==='tasks'?'tasks':screen==='account'||screen==='sync'?'account':'projects';
  function selectTab(tab:Tab){
    if(busy||scannerBusy||gapBusy)return;
    if(tab==='capture'){capture();return;}
    setSelectedDevice(null);setPicking(false);if(tab==='history')setHistoryProject('');push(tab);
  }
  const title=screen==='projects'?(picking?'Capture to a project':'Projects'):screen==='project'?project?.name??'Project':screen==='gaps'?'Gaps / Punch List':screen==='types'?'New capture':screen==='create'?'Create project':screen==='history'?'History':screen==='sync'?'Sync & Uploads':screen==='account'?'Account':'Tasks';
  const subtitles:Partial<Record<Screen,string>>={gaps:project?.name,projects:picking?'Choose the job for this capture':`${projects.length} field project${projects.length===1?'':'s'}`,history:'Your field device inventory',tasks:'Across your projects',account:'Your CableMint workspace',sync:'Record and photo upload confirmation',create:'A job name keeps your captures organized'};
  function recordRow(d:Device){return <DeviceHistoryRow key={d.id} device={d} project={projects.find(p=>p.id===d.project_id)?.name??'Project'} status={queueStatus(localItems.find(i=>i.attempt.id===d.id)?.state??'uploaded')} onPress={()=>{setSelectedDevice(d);if(screen!=='history'){setHistoryProject(d.project_id);push('history');}}}/>;}
  return <SafeAreaView edges={['top','bottom']} style={[ui.page,{backgroundColor:colors.blue}]}><StatusBar barStyle="light-content" backgroundColor={colors.blue}/>
    {scanMounted&&project&&batchReady===key&&<DeviceScanner project={project} userId={userId} batch={batch} active={screen==='scan'} onBusyChange={setScannerBusy} saveFeedback={saveFeedback}
      onSave={save} onCaptureNext={captureNext} onBatchChange={(field,value)=>setBatch(b=>({...b,[field]:value}))}
      onExit={()=>{setScanMounted(false);setStack(s=>{const next=s.filter(item=>item!=='scan');return next.length?next:['projects'];});}} onDevices={()=>{setHistoryProject(project.id);push('history');}} savedMessage="" batchStorageError={storageError}/>}
    {screen!=='scan'&&<View style={ui.page}>
    <AppHeader title={title} subtitle={subtitles[screen]} status={status} onSync={()=>push('sync')} onBack={stack.length>1?()=>{if(selectedDevice)setSelectedDevice(null);else back();}:undefined} disabled={busy||gapBusy}/>
    {screen==='types'&&project&&<CaptureStepHeader step="Type" project={project.name}/>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      {project&&<GapWorkspace key={project.id} ref={gapNavigation} userId={userId} project={project} active={screen==='gaps'} snapshot={gapJournal} queue={gapJournal?gapQueue.current:null} context={batch} onBusy={setGapBusy} onSync={()=>{void syncQueue(true);}} onChange={context=>{if(context)setBatch(b=>({...b,...context}));void syncQueue();}}/>}
      {(!serverFresh&&!busy)&&screen!=='sync'&&<View style={[ui.row,{padding:10,backgroundColor:'#E2EBEF',borderRadius:8}]}><Icon name="offline" size={18}/><Text style={[ui.muted,ui.flex]}>Using saved data. Refresh or sync to check the server.</Text></View>}
      {!!error&&<View style={[ui.card,{borderColor:'#AA302A'}]}><Text accessibilityRole="alert" style={ui.error}>{readableError(error)}</Text><AdvancedPanel title="Technical error details" open={showError} onToggle={()=>setShowError(!showError)}><Text selectable style={ui.muted}>{error}</Text></AdvancedPanel></View>}
      {!!storageError&&<Text accessibilityRole="alert" style={ui.error}>{readableError(storageError)}</Text>}
      {busy&&<View style={ui.row}><ActivityIndicator color={colors.green}/><Text style={ui.muted}>{syncPhase==='syncing'?'Syncing…':'Loading your workspace…'}</Text></View>}
      {counts.failed>0&&screen!=='sync'&&<Pressable accessibilityRole="button" onPress={()=>push('sync')} style={[ui.card,{backgroundColor:'#FFF0EC'}]}><Text style={ui.error}>{counts.failed} upload{counts.failed===1?'':'s'} need attention. Tap to retry.</Text></Pressable>}
      {screen==='projects'?<>
        <View style={ui.row}><View style={ui.flex}><Text style={ui.heading}>{picking?'Choose a job':'Your field jobs'}</Text><Text style={ui.muted}>Capture. Verify. Keep work connected.</Text></View></View>
        <Button title="Create Project" icon="plus" disabled={busy} onPress={openCreateProject}/>
        {!projects.length&&!busy&&<EmptyState title="Your first job starts here" description="Create a project, then capture and verify its devices."/>}
        {projects.map(p=>{const devices=[...rows,...localDevices].filter(d=>d.project_id===p.id);return <ProjectCard key={p.id} project={p} count={devices.length} last={latestCapture(devices)} status={withGapStatus(syncBadge(syncPhase,journal,serverFresh,p.id),gapJournal,p.id)} disabled={busy} onPress={()=>chooseProject(p)}/>;})}
        <Button title="Refresh Projects" icon="sync" secondary disabled={busy} onPress={()=>{void refresh();}}/>
        {scanMounted&&<Button title="Resume Open Capture" secondary icon="capture" onPress={()=>push('scan')}/>}
      </>:screen==='create'?<>
        <View style={ui.card}><Text style={ui.heading}>Name the job</Text><Text style={ui.body}>Use the site or project name your team recognizes.</Text><Field label="Project / Site name" placeholder="e.g. North Tower" value={name} onChange={setName} maxLength={80} disabled={busy||!!creation}/>
        {!!creation&&<Text style={ui.muted}>Creation was not confirmed. Retry checks the same project ID.</Text>}
        <Button title={busy?'Creating…':creation?'Retry Create Project':'Create & Open Project'} busy={busy} disabled={!name.trim()&&!creation} onPress={()=>{void newProject();}}/></View>
      </>:screen==='project'&&project?<>
        <View style={[ui.card,{backgroundColor:colors.blue,borderColor:colors.blue}]}><Text style={[ui.eyebrow,{color:'#BBCCD5'}]}>PROJECT DASHBOARD</Text><Text style={[ui.stat,{color:'white'}]}>{projectDevices.length}<Text style={{fontSize:16}}> devices captured</Text></Text><Text style={ui.headerSub}>{projectDevices.length?`Last capture ${new Date(projectDevices[0].captured_at).toLocaleString()}`:'Ready for your first device'}</Text><Button title={scanMounted?'Resume Capture':'Captures · Choose Device Type'} icon="capture" disabled={busy||batchReady!==key} onPress={capture}/></View>
        {saveFeedback}
        <Pressable accessibilityRole="button" accessibilityLabel="Open Gaps and Punch List" onPress={()=>push('gaps')} style={ui.projectCard}>
          <View style={ui.row}><View style={ui.tile}><Icon name="tasks" size={27}/></View><View style={ui.flex}><Text style={ui.sectionTitle}>Gaps / Punch List</Text><Text style={ui.caption}>Missing, damaged or incomplete work</Text></View><Icon name="next"/></View>
          <View style={[ui.row,{justifyContent:'space-between'}]}><Text style={ui.stat}>{gapJournal?.checkedAt?projectGaps.filter(g=>g.status==='open').length:'—'}<Text style={ui.muted}> open Gaps</Text></Text><StatusBadge status={withGapStatus(serverFresh?'Synced':'Offline',gapJournal,project.id)}/></View>
          {!gapJournal?.checkedAt&&<Text style={ui.caption}>Cloud Gap count has not been checked yet.</Text>}
        </Pressable>
        <View style={ui.card}><View style={ui.row}><Icon name="tasks"/><Text style={[ui.sectionTitle,ui.flex]}>Project Report</Text><Text style={ui.caption}>Coming soon</Text></View><Text style={ui.muted}>A combined project report is planned for a later release.</Text></View>
        {!!gapJournal?.calculationsCheckedAt&&<View style={ui.card}><Text style={ui.sectionTitle}>Saved Calculations</Text><Text style={ui.stat}>{gapJournal.calculations[project.id]??0}</Text><Text style={ui.caption}>Stored in this project · View on the CableMint website. Count checked {new Date(gapJournal.calculationsCheckedAt).toLocaleString()}.</Text></View>}
        <SectionHeading title="Current batch" action={showBatch?'Done':'Edit'} onPress={()=>setShowBatch(!showBatch)}/>
        <View style={ui.card}><View style={ui.row}><Icon name="location"/><View style={ui.flex}><Text style={ui.label}>{[batch.building,batch.floor_area].filter(Boolean).join(' / ')||'Location not set'}</Text><Text style={ui.muted}>{batch.unit_location||'Add a unit or room during capture'}</Text></View></View>
          <Text style={ui.caption}>{batch.device_type||'Choose type at capture'}{batch.autoAdvance?' · Room auto-advance on':''}{batch.requireInstalledPhoto?' · Installed photo required':''}</Text>
          {showBatch&&<>
            {([['building','Building',100],['floor_area','Floor / Area',100],['unit_location','Unit / Room',120],['manufacturer','Manufacturer',100],['model','Model',120]] as const).map(([field,label,max])=><Field key={field} label={label} value={batch[field]} maxLength={max} disabled={busy||batchReady!==key} onChange={value=>setBatch(b=>({...b,[field]:value}))}/>)}
            <View style={ui.row}><Text style={[ui.label,ui.flex]}>Installed photo required</Text><Switch accessibilityLabel="Require installed photo" trackColor={{true:colors.green}} value={batch.requireInstalledPhoto} disabled={batchReady!==key} onValueChange={requireInstalledPhoto=>setBatch(b=>({...b,requireInstalledPhoto}))}/></View><Text style={ui.caption}>Temporary check only. Photos are not uploaded or retained.</Text>
            <View style={ui.row}><Text style={[ui.label,ui.flex]}>Advance room number</Text><Switch accessibilityLabel="Auto advance room number" trackColor={{true:colors.green}} value={batch.autoAdvance} disabled={batchReady!==key} onValueChange={autoAdvance=>setBatch(b=>({...b,autoAdvance}))}/></View>
          </>}
        </View>
        <SectionHeading title="Recent captures" action="View History" onPress={()=>{setHistoryProject(project.id);push('history');}}/>
        {projectDevices.slice(0,3).map(recordRow)}{!projectDevices.length&&<EmptyState icon="capture" title="Ready to capture" description="Verified devices will appear here after saving."/>}
      </>:screen==='types'&&project?<>
        {saveFeedback}
        <Text style={ui.heading}>What are you capturing?</Text><Text style={ui.muted}>MAC and serial labels are supported. Choose the equipment category.</Text>
        {TYPES.map(type=><DeviceTypeCard key={type} type={type} description={type==='WAP'?'Wireless access point':type==='Security Camera'?'IP camera · MAC or serial':type==='Network Switch'?'Network infrastructure':type==='Access Control'?'Reader or controller':type==='Intercom'?'Entry and communication':'Fiber equipment or other label'} disabled={batchReady!==key} onPress={()=>startCapture(type)}/>)}
        <View style={ui.card}><Field label="Custom device type" placeholder="Equipment category" value={batch.device_type} maxLength={80} disabled={batchReady!==key} onChange={device_type=>setBatch(b=>({...b,device_type}))}/><Button title="Capture This Type" secondary disabled={!batch.device_type.trim()||batchReady!==key} onPress={()=>startCapture(batch.device_type)}/></View>
      </>:screen==='history'?<>
        {selectedDevice?<>
          <Button title="Back to History" icon="back" secondary onPress={()=>setSelectedDevice(null)}/>
          <View style={ui.card}><View style={ui.row}><Text style={[ui.heading,ui.flex]}>{selectedDevice.device_type}</Text><StatusBadge status={queueStatus(localItems.find(i=>i.attempt.id===selectedDevice.id)?.state??'uploaded')}/></View><Text style={ui.body}>{projects.find(p=>p.id===selectedDevice.project_id)?.name}</Text><Text style={ui.label}>{[selectedDevice.building,selectedDevice.floor_area,selectedDevice.unit_location].filter(Boolean).join(' / ')||'No location set'}</Text><Text style={ui.eyebrow}>MAC ADDRESS</Text><Text selectable style={ui.identifier}>{selectedDevice.mac_address||'No MAC · serial-only'}</Text><Text style={ui.eyebrow}>SERIAL NUMBER</Text><Text selectable style={ui.identifier}>{selectedDevice.serial_number||'Not supplied'}</Text><Text style={ui.muted}>{new Date(selectedDevice.captured_at).toLocaleString()}</Text>
          {localItems.some(i=>i.attempt.id===selectedDevice.id)?<Button title="Open Sync & Uploads" secondary onPress={()=>push('sync')}/>:<Button title="Delete Device" icon="trash" secondary danger disabled={busy} onPress={()=>confirmDelete(selectedDevice)}/>}</View>
        </>:<>
          <View style={ui.row}><Icon name="search"/><Field label="Search captures" placeholder="MAC, serial, room, project or type" value={search} onChange={setSearch}/></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{(['All','Synced','Pending','Failed'] as const).map(f=><Pressable key={f} accessibilityRole="button" accessibilityState={{selected:filter===f}} onPress={()=>setFilter(f)} style={{minHeight:48,justifyContent:'center',paddingHorizontal:16,borderRadius:10,backgroundColor:filter===f?colors.blue:'white',borderWidth:1,borderColor:'#CEDBE2'}}><Text style={{fontWeight:'700',color:filter===f?'white':colors.blue}}>{f}</Text></Pressable>)}</ScrollView>
          <SectionHeading title={`${visibleHistory.length} capture${visibleHistory.length===1?'':'s'}`} action={historyProject?projects.find(p=>p.id===historyProject)?.name??'Project':'All projects'} onPress={()=>setShowProjectFilter(!showProjectFilter)}/>
          {showProjectFilter&&<View style={ui.card}><Button title="All Projects" secondary onPress={()=>{setHistoryProject('');setShowProjectFilter(false);}}/>{projects.map(p=><Button key={p.id} title={p.name} secondary onPress={()=>{setHistoryProject(p.id);setShowProjectFilter(false);}}/>)}</View>}
          {visibleHistory.map(recordRow)}{!visibleHistory.length&&!busy&&<EmptyState icon="history" title={search||historyProject||filter!=='All'?'No matching captures':'No captures yet'} description={search||historyProject||filter!=='All'?'Try a different search or clear the filters.':'Capture your first device to start a searchable inventory.'} action={search||historyProject||filter!=='All'?'Clear Filters':'Capture Device'} onPress={()=>{if(search||historyProject||filter!=='All'){setSearch('');setHistoryProject('');setFilter('All');}else capture();}}/>}
          <Button title="Refresh History" icon="sync" secondary disabled={busy} onPress={()=>{void refresh();}}/>
        </>}
      </>:screen==='tasks'?<EmptyState icon="tasks" title="A clear workspace" description="Project tasks are not available in this release. Your device capture and inventory tools are ready to use." action="Capture a Device" onPress={capture}/>
      :screen==='sync'?<>
        <SyncStatus phase={syncPhase} message={syncMessage} lastChecked={serverTime} counts={counts} disabled={!journal||!gapJournal||busy||gapBusy} onSync={()=>{void syncQueue(true);}}/>
        <Text style={ui.muted}>Device records, Gaps and photos stay on this phone until the server confirms them. Counts include each record and photo upload. Keep CableMint open to sync.</Text>
        {(journal?.items??[]).slice().reverse().map(item=><View key={item.attempt.id} style={ui.card}><View style={ui.row}><Text style={[ui.label,ui.flex]}>{item.attempt.draft.unit_location||item.attempt.draft.device_type}</Text><StatusBadge status={queueStatus(item.state)}/></View><Text selectable style={ui.identifier}>{item.attempt.draft.mac_address||item.attempt.draft.serial_number}</Text><Text style={ui.caption}>{item.attempt.draft.device_type} · {item.retries} upload attempt{item.retries===1?'':'s'}</Text>{!!item.error&&<><Text style={ui.error}>{readableError(item.error)}</Text><AdvancedPanel title="Upload error details" open={showError} onToggle={()=>setShowError(!showError)}><Text selectable style={ui.muted}>{item.error}</Text></AdvancedPanel></>}{item.state==='failed'&&<Button title="Retry Upload" disabled={syncPhase==='syncing'||busy} onPress={()=>{void syncQueue(true,item.attempt.id);}}/>}</View>)}
        {(gapJournal?.items??[]).slice().reverse().map(item=><View key={item.gap.id} style={ui.card}><View style={ui.row}><Icon name={item.action==='delete'?'trash':'tasks'}/><Text style={[ui.label,ui.flex]}>{item.action==='delete'?'Delete Gap & photos':item.gap.category}</Text><StatusBadge status={queueStatus(item.state)}/></View><Text style={ui.body}>{item.gap.unit_location}</Text><Text style={ui.caption}>{projects.find(p=>p.id===item.gap.project_id)?.name??'Project'} · {item.retries} attempt{item.retries===1?'':'s'}</Text>
          {item.action==='save'&&item.files.map((f,i)=><View key={f.metadata.id} style={[ui.row,{flexWrap:'wrap'}]}><Icon name="gallery" size={18}/><Text style={[ui.caption,ui.flex]}>Photo {i+1} · {(f.metadata.file_size/1024).toFixed(0)} KB · {f.retries} attempt{f.retries===1?'':'s'}</Text><StatusBadge status={queueStatus(f.state)}/>{!!f.error&&<Text style={ui.error}>{readableError(f.error)}</Text>}</View>)}
          {!!item.error&&<><Text style={ui.error}>{readableError(item.error)}</Text><AdvancedPanel title="Upload / cleanup error details" open={showError} onToggle={()=>setShowError(!showError)}><Text selectable style={ui.muted}>{item.error}</Text></AdvancedPanel></>}
          {item.state==='failed'&&<Button title={item.action==='delete'?'Retry Gap Cleanup':'Retry Gap & Photos'} icon="sync" disabled={syncPhase==='syncing'||busy||gapBusy} onPress={()=>{void syncQueue(true);}}/>}
        </View>)}
        {!journal?.items.length&&!gapJournal?.items.length&&<EmptyState icon="sync" title="No local uploads" description="Sync Now checks the server even when the local upload queue is empty."/>}
      </>:screen==='account'?<>
        <View style={ui.projectCard}><View style={ui.row}><View style={[ui.tile,{width:56,height:56}]}><Icon name="account" size={30}/></View><View style={ui.flex}><Text style={ui.eyebrow}>SIGNED IN</Text><Text selectable style={ui.sectionTitle}>{session.user.email}</Text></View></View><View style={[ui.row,{justifyContent:'space-between'}]}><Text style={ui.label}>CableMint Pro</Text><Text style={ui.link}>{pro===null?'Not verified':pro?'Active at last check':'Not active'}</Text></View><Text style={ui.caption}>Access checked {journal?.proCheckedAt?new Date(journal.proCheckedAt).toLocaleString():'not yet'}</Text></View>
        <View style={ui.card}><SectionHeading title="Workspace"/><View style={[ui.row,{justifyContent:'space-between'}]}><Text style={ui.body}>Device Capture</Text><Text style={ui.label}>v{appConfig.expo.version}</Text></View><View style={ui.row}><Text style={[ui.body,ui.flex]}>Cloud storage used</Text><Text style={ui.label}>{gapJournal?.checkedAt?(gapJournal.files.reduce((n,f)=>n+Number(f.file_size),0)/1048576).toFixed(1)+' MB':'Not checked'}</Text></View><Text style={ui.caption}>Private photo evidence · Measured at the last successful server check.</Text><Button title="Sync & Uploads" secondary icon="sync" onPress={()=>push('sync')}/><Button title="Refresh Projects & Access" secondary disabled={busy} onPress={()=>{void refresh();}}/></View><Text style={ui.muted}>Manage your account and CableMint Pro on cableminttools.com.</Text><Button title="Sign Out" secondary disabled={busy||gapBusy} onPress={()=>{void signOut();}}/>
      </>:null}
    </ScrollView></View>}
    <BottomNavigation active={activeTab} capturePending={scanMounted} disabled={busy||scannerBusy||gapBusy} onSelect={selectTab}/>
  </SafeAreaView>;
}
