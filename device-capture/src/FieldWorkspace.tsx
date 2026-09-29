import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Keyboard, Pressable, SafeAreaView, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from './supabase';
import { createProject, ProjectCreateError, deleteDevice, loadDevices, loadHistory, loadProjects, readPro, saveDevice } from './deviceService';
import { batchStorageKey, emptyBatch, nextUnit, restoreBatch, type Batch, type Device, type Project, type SaveAttempt } from './deviceWorkflow';
import { previousScreen, searchHistory, type Screen } from './historyModel';
import { DeviceScanner } from './DeviceScanner';
import { Button, colors, Field, ui } from './ui';
import appConfig from '../app.json';

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
  const [serverTime, setServerTime] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Synced' | 'Pending' | 'Failed'>('All');
  const [historyProject, setHistoryProject] = useState('');
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const [creation, setCreation] = useState<{ id: string; name: string } | null>(null);
  const op = useRef(false), alive = useRef(true), writes = useRef(Promise.resolve());
  const key = project ? batchStorageKey(userId, project.id) : '';
  const push = (next: Screen) => { setError(''); setStack(s => [...s, next]); };
  function back() {
    if (op.current) return;
    if (screen === 'create' && creation) {
      Alert.alert('Leave project creation?', 'The project may already exist. Refresh projects before creating it again.', [{ text: 'Stay', style: 'cancel' }, { text: 'Back', onPress: () => { setCreation(null); setName(''); setStack(previousScreen); } }]);
    } else { setError(''); setPicking(false); setStack(previousScreen); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (screen === 'scan') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (op.current) return true; if (stack.length > 1) { back(); return true; } return false; });
    return () => sub.remove();
  }, [stack, creation]);
  async function refresh() {
    if (op.current) return;
    op.current = true; setBusy(true); setError('');
    try {
      const entitlement = await readPro(userId);
      const own = await loadProjects(userId);
      const captures = await loadHistory(userId);
      if (!alive.current) return;
      setPro(entitlement); setProjects(own); setRows(captures); setServerTime(new Date().toLocaleTimeString());
      if (project && !own.some(p => p.id === project.id)) { setProject(null); setStack(['projects']); }
    } catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [userId]);
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active' && screen !== 'scan' && screen !== 'create') void refresh(); }); return () => sub.remove(); }, [screen, project?.id]);
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
  function chooseProject(p: Project) { setProject(p); setSavedMessage(''); push(picking ? 'types' : 'project'); setPicking(false); }
  function capture() {
    if (op.current) return;
    if (pro !== true) { push('account'); setError('Refresh account access to verify CableMint Pro before capturing.'); return; }
    if (project) push('types'); else { setPicking(true); push('projects'); }
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
        setProjects(own); setProject(created); setName(''); setCreation(null); setSavedMessage(''); Keyboard.dismiss();
        setStack(s => [...s.slice(0, -1), picking ? 'types' : 'project']); setPicking(false);
      }
    } catch (failure) { if (alive.current) { if (creation || (failure instanceof ProjectCreateError && failure.uncertain)) setCreation(attempt); setError((failure as Error).message); } }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  async function save(attempt: SaveAttempt) {
    if (!project || attempt.project_id !== project.id || attempt.user_id !== userId) throw new Error('Project changed. Go Back and select a project.');
    if (op.current) throw new Error('Another operation is running. Wait and retry.');
    op.current = true;
    try {
      await saveDevice(attempt);
      // A server response, not an optimistic phone copy, is the sync boundary.
      let message = `Synced to Supabase: ${attempt.draft.device_type} at ${attempt.draft.unit_location || 'unspecified location'}.`;
      try {
        const server = await loadDevices(userId, project.id);
        if (alive.current) { setRows(previous => [...server, ...previous.filter(d => d.project_id !== project.id)]); setServerTime(new Date().toLocaleTimeString()); }
      } catch (failure) { message += ` List refresh failed: ${(failure as Error).message}`; }
      const unit = nextUnit(attempt.draft.unit_location, batch.autoAdvance);
      if (alive.current) { setBatch(previous => ({ ...previous, building: attempt.draft.building, floor_area: attempt.draft.floor_area, unit_location: unit })); setSavedMessage(message); }
      return unit;
    } finally { op.current = false; }
  }
  async function remove(device: Device) {
    if (op.current) return;
    op.current = true; setBusy(true); setError('');
    try {
      await deleteDevice(userId, device.project_id, device.id);
      const server = await loadHistory(userId);
      if (alive.current) { setRows(server); setServerTime(new Date().toLocaleTimeString()); }
    } catch (failure) { if (alive.current) setError((failure as Error).message + '\nRefresh the server list before trying again.'); }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  function confirmDelete(device: Device) { Alert.alert('Delete from Supabase?', `${device.device_type} · ${device.unit_location}\n${device.mac_address || device.serial_number}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(device); } }]); }
  async function signOut() {
    if (op.current) return; op.current = true; setBusy(true);
    try { const result = await supabase.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }
    catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { op.current = false; if (alive.current) setBusy(false); }
  }
  function deviceCard(d: Device) {
    return <View key={d.id} style={ui.card}><Text style={ui.label}>{projects.find(p => p.id === d.project_id)?.name ?? 'Project'} · {d.device_type}</Text>
      <Text style={ui.body}>{[d.building, d.floor_area, d.unit_location].filter(Boolean).join(' / ') || 'No installation location'}</Text>
      <Text selectable style={ui.body}>MAC: {d.mac_address || 'None'}{'\n'}Serial: {d.serial_number || 'None'}</Text>
      <Text style={ui.muted}>Synced · {new Date(d.captured_at).toLocaleString()}</Text><Button title="Delete Device" secondary disabled={busy} onPress={() => confirmDelete(d)} /></View>;
  }
  if (screen === 'scan' && project && batchReady === key) return <DeviceScanner project={project} userId={userId} batch={batch} onSave={save}
    onBatchChange={(field,value) => setBatch(b => ({ ...b, [field]: value }))}
    onExit={() => setStack(previousScreen)} onDevices={() => { setHistoryProject(project.id); push('history'); }} savedMessage={savedMessage} batchStorageError={storageError} />;
  const filtered = filter === 'Pending' || filter === 'Failed' ? [] : searchHistory(rows, projects, search, historyProject);
  return <SafeAreaView style={[ui.page, { paddingTop: StatusBar.currentHeight ?? 0 }]}><StatusBar barStyle="light-content" backgroundColor={colors.blue} />
    <View style={ui.header}><Text style={ui.brand}>CABLEMINT TOOLS</Text><Text style={ui.white}>Device Capture</Text>{stack.length > 1 && <Button title="← Back" secondary disabled={busy} onPress={back} />}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}{busy && <ActivityIndicator color={colors.green} />}
      {screen === 'projects' ? <><Text style={ui.heading}>{picking ? 'Choose Capture Project' : 'Projects'}</Text>
        <Text style={ui.muted}>{serverTime ? `Server list checked ${serverTime}` : 'Server list not loaded'}{error ? ' · Refresh needed' : ''}</Text>
        {!projects.length && !busy && <Text style={ui.body}>Create a project to start capturing devices.</Text>}
        {projects.map(p => { const captured = rows.filter(d => d.project_id === p.id); const last = captured.reduce((latest, d) => d.captured_at > latest ? d.captured_at : latest, ''); return <View key={p.id} style={ui.card}>
          <Text style={ui.heading}>{p.name}</Text><Text style={ui.body}>{captured.length} server-confirmed devices</Text><Text style={ui.muted}>{last ? `Last capture ${new Date(last).toLocaleString()}` : 'No server captures yet'} · {serverTime && !error ? 'Server checked' : 'Needs refresh'}</Text>
          <Button title={picking ? 'Capture in This Project' : 'Open Project'} disabled={busy} onPress={() => chooseProject(p)} /></View>; })}
        <Button title="Create New Project" disabled={busy} onPress={() => push('create')} /><Button title="Refresh Projects & Access" secondary disabled={busy} onPress={() => { void refresh(); }} />
        <Button title="Sign Out" secondary disabled={busy} onPress={() => { void signOut(); }} />
      </> : screen === 'create' ? <><Text style={ui.heading}>Create New Project</Text><Field label="Project / Site Name" value={name} onChange={setName} maxLength={80} disabled={busy || !!creation} />
        {!!creation && <Text style={ui.muted}>Creation was not confirmed. Retry uses the same project ID.</Text>}<Button title={busy ? 'Creating…' : creation ? 'Retry Create Project' : 'Create Project & Open'} disabled={busy} onPress={() => { void newProject(); }} />
      </> : screen === 'project' && project ? <><Text style={ui.heading}>{project.name}</Text><Text style={ui.body}>{rows.filter(d => d.project_id === project.id).length} server-confirmed devices</Text>
        {!!savedMessage && <Text style={ui.body}>{savedMessage}</Text>}<Button title="Capture Device" disabled={busy || batchReady !== key} onPress={capture} />
        <Button title="Current Project Devices" secondary disabled={busy} onPress={() => { setHistoryProject(project.id); push('history'); }} />
        <Text style={ui.heading}>Batch Context</Text>{!!storageError && <Text style={ui.error}>{storageError}</Text>}
        {([['building','Building',100],['floor_area','Floor / Area',100],['manufacturer','Manufacturer',100],['model','Model',120],['unit_location','Unit / Room / Location',120]] as const).map(([field,label,max]) => <Field key={field} label={label} value={batch[field]} maxLength={max} disabled={busy || batchReady !== key} onChange={value => setBatch(b => ({ ...b, [field]: value }))} />)}
        <Text style={ui.label}>Auto-advance final room number after saving</Text><Switch value={batch.autoAdvance} disabled={batchReady !== key} onValueChange={autoAdvance => setBatch(b => ({ ...b, autoAdvance }))} />
      </> : screen === 'types' && project ? <><Text style={ui.heading}>Device Type</Text><Text style={ui.body}>{project.name}</Text>
        {TYPES.map(type => <Button key={type} title={type} secondary disabled={batchReady !== key} onPress={() => { setBatch(b => ({ ...b, device_type: type })); push('scan'); }} />)}
        <Field label="Custom Device Type" value={batch.device_type} maxLength={80} disabled={batchReady !== key} onChange={device_type => setBatch(b => ({ ...b, device_type }))} />
        <Button title="Capture Custom Type" disabled={!batch.device_type.trim() || batchReady !== key} onPress={() => push('scan')} />
      </> : screen === 'history' ? <><Text style={ui.heading}>Capture History</Text><Text style={ui.muted}>Server-backed records{serverTime ? ` · checked ${serverTime}` : ''}</Text>
        <Field label="Search project, location, type, MAC, serial, building or floor" value={search} onChange={setSearch} />
        <View style={{ flexDirection: 'row', gap: 4 }}>{(['All','Synced','Pending','Failed'] as const).map(f => <View key={f} style={{ flex: 1 }}><Button title={f} secondary={filter !== f} onPress={() => setFilter(f)} /></View>)}</View>
        <Button title={historyProject ? 'Show All Projects' : 'All Projects'} secondary onPress={() => setHistoryProject('')} />
        {projects.map(p => <Button key={p.id} title={p.name} secondary={historyProject !== p.id} onPress={() => setHistoryProject(p.id)} />)}
        {filtered.map(deviceCard)}{!filtered.length && <Text style={ui.muted}>No matching server records.</Text>}
        <Button title="Refresh History" disabled={busy} onPress={() => { void refresh(); }} />
      </> : screen === 'tasks' ? <><Text style={ui.heading}>Tasks</Text><Text style={ui.body}>Project tasks and Record a Gap are planned CableMint features. No tasks or punch-list backend is connected.</Text></>
      : screen === 'account' ? <><Text style={ui.heading}>Account</Text><Text style={ui.body}>{session.user.email}</Text><Text style={ui.body}>CableMint Pro: {pro === null ? 'Not verified' : pro ? 'Active' : 'Not active'}</Text>
        <Text style={ui.muted}>Version {appConfig.expo.version} · Android</Text><Button title="Refresh Projects & Access" secondary disabled={busy} onPress={() => { void refresh(); }} />
        <Text style={ui.muted}>Manage your subscription on the CableMint website. No billing or checkout is included here.</Text><Button title="Sign Out" secondary disabled={busy} onPress={() => { void signOut(); }} />
      </> : null}
    </ScrollView>
    <View style={{ flexDirection: 'row', padding: 8, gap: 4, backgroundColor: colors.blue }}>{(['projects','history','capture','tasks','account'] as const).map(tab => <View key={tab} style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: tab === screen, disabled: busy }} disabled={busy} style={{minHeight:56,justifyContent:"center",alignItems:"center",borderRadius:10,backgroundColor:tab === "capture" ? colors.green : colors.blue}} onPress={() => { if (tab === 'capture') capture(); else { setError(''); setPicking(false); if (tab === 'history') setHistoryProject(''); setStack(s => s[s.length-1] === tab ? s : [...s, tab]); } }}><Text style={{fontSize:12,fontWeight:'700',color:tab === 'capture' ? colors.blue : 'white'}}>{tab[0].toUpperCase()+tab.slice(1)}</Text></Pressable>
    </View>)}</View>
  </SafeAreaView>;
}
