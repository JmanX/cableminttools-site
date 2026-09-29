import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Keyboard, Platform, SafeAreaView, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { createProject, ProjectCreateError, deleteDevice, loadDevices, loadProjects, readPro, saveDevice } from './deviceService';
import { batchStorageKey, emptyBatch, nextUnit, restoreBatch, type Batch, type Device, type Project, type SaveAttempt } from './deviceWorkflow';
import { Button, colors, Field, ui } from './ui';
import { DeviceScanner } from './DeviceScanner';

export function MobileApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, current) => {
      authChanged = true;
      if (alive) { setSession(current); setReady(true); setPassword(''); }
    });
    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (alive && !authChanged) { setSession(data.session); setReady(true); if (failure) setError('Unable to restore sign-in. Please sign in again.'); }
    }).catch(() => { if (alive) { setReady(true); setError('Unable to restore sign-in. Please retry.'); } });
    const refresh = (state: string) => state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    return () => { alive = false; subscription.unsubscribe(); appState.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  async function signIn() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (failure) setError(failure.message);
      else setPassword('');
    } catch { setError('Unable to sign in. Check your connection and retry.'); }
    finally { setBusy(false); }
  }
  if (Platform.OS !== 'android') return <SafeAreaView style={ui.page}><Text style={ui.heading}>This build supports Android.</Text></SafeAreaView>;
  if (!ready) return <SafeAreaView style={ui.page}><ActivityIndicator color={colors.green} /></SafeAreaView>;
  if (session) return <SignedIn key={session.user.id} session={session} />;
  return <SafeAreaView style={[ui.page, { paddingTop: StatusBar.currentHeight ?? 0 }]}><StatusBar barStyle="dark-content" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <Text style={ui.heading}>CableMint Device Capture</Text><Text style={ui.body}>Sign in with your existing CableMint email and password.</Text>
      <Field label="Email" value={email} onChange={setEmail} email disabled={busy} />
      <Field label="Password" value={password} onChange={setPassword} secure disabled={busy} />
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Button title={busy ? 'Signing in…' : 'Sign In'} disabled={busy || !email.trim() || !password} onPress={() => { void signIn(); }} />
      <Text style={ui.muted}>Use the CableMint website for account creation, password recovery, and subscription management. This app has no checkout.</Text>
    </ScrollView></SafeAreaView>;
}

function SignedIn({ session }: { session: Session }) {
  const userId = session.user.id;
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [access, setAccess] = useState<'loading' | 'pro' | 'free' | 'error'>('loading');
  const [view, setView] = useState<'projects' | 'batch' | 'scan' | 'devices'>('projects');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [batch, setBatch] = useState<Batch>({ ...emptyBatch });
  const [batchReadyKey, setBatchReadyKey] = useState('');
  const [storageRetry, setStorageRetry] = useState(0);
  const [savedMessage, setSavedMessage] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectAttempt, setProjectAttempt] = useState<{ id: string; name: string } | null>(null);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const persistence = useRef(Promise.resolve());
  const operation = useRef(false);
  const key = project ? batchStorageKey(userId, project.id) : '';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestGeneration.current++; }; }, []);
  async function refreshAccess() {
    if (operation.current) return;
    const generation = ++requestGeneration.current;
    setAccess('loading'); setError('');
    try {
      const pro = await readPro(userId);
      const ownProjects = await loadProjects(userId);
      if (!mounted.current || generation !== requestGeneration.current) return;
      setProjects(ownProjects); setAccess(pro ? 'pro' : 'free');
      if (project && !ownProjects.some(p => p.id === project.id)) { setProject(null); setView('projects'); }
    } catch (failure) {
      if (mounted.current && generation === requestGeneration.current) { setAccess('error'); setError((failure as Error).message); }
    }
  }
  useEffect(() => { void refreshAccess(); }, [userId]);
  async function submitProject() {
    if (operation.current || access !== 'pro') return;
    operation.current = true; setBusy(true); setError('');
    const attempt = projectAttempt ?? { id: randomUUID(), name: projectName.trim() };
    try {
      const created = await createProject(userId, attempt.name, attempt.id);
      let refreshed: Project[];
      try { refreshed = await loadProjects(userId); }
      catch {
        refreshed = [created, ...projects.filter(p => p.id !== created.id)];
        if (mounted.current) setError('Project created, but the list could not refresh. Your new project is open; refresh projects when connected.');
      }
      if (!mounted.current) return;
      setProjects(refreshed.some(p => p.id === created.id) ? refreshed : [created, ...refreshed]);
      setProject(created); setView('batch'); setSavedMessage('');
      setCreatingProject(false); setProjectName(''); setProjectAttempt(null); Keyboard.dismiss();
    } catch (failure) {
      if (mounted.current) {
        // Preserve an uncertain attempt even when a later read fails, so retry
        // never changes its ID or name and accidentally creates another site.
        if (projectAttempt || (failure instanceof ProjectCreateError && failure.uncertain)) setProjectAttempt(attempt);
        setError((failure as Error).message || 'Unable to create project. Check your connection and retry.');
      }
    } finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  // Refresh access on resume; operation guards avoid detaching an in-flight save.
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active' && view !== 'scan') void refreshAccess(); }); return () => sub.remove(); }, [userId, project?.id, view]);

  async function restoreCurrentBatch() {
    if (!key || operation.current) return;
    if (batchReadyKey !== key) { setStorageRetry(retry => retry + 1); return; }
    operation.current = true; setBusy(true);
    try {
      persistence.current = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(batch)));
      await persistence.current;
      if (mounted.current) setStorageError('');
    }
    catch { if (mounted.current) setStorageError('Could not store batch settings. Retry before closing the app.'); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    setBatchReadyKey(''); setStorageError('');
    if (key) void persistence.current.catch(() => {}).then(() => AsyncStorage.getItem(key)).then(value => {
      if (!cancelled) { setBatch(restoreBatch(value)); setBatchReadyKey(key); }
    }).catch(() => { if (!cancelled) setStorageError('Could not restore batch settings. Retry before starting a scan.'); });
    return () => { cancelled = true; };
  }, [key, storageRetry]);
  useEffect(() => {
    if (!key || batchReadyKey !== key) return;
    const value = JSON.stringify(batch);
    persistence.current = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(key, value));
    void persistence.current.catch(() => { if (mounted.current) setStorageError('Batch settings could not be stored on this phone. Keep the app open and retry.'); });
  }, [batch, key, batchReadyKey]);
  function changeBatch(field: keyof Batch, value: string | boolean) { setBatch(previous => ({ ...previous, [field]: value })); }

  async function showDevices() {
    if (!project || operation.current) return;
    operation.current = true; setBusy(true); setError(''); setView('devices'); setDevices([]);
    try { const rows = await loadDevices(userId, project.id); if (mounted.current) setDevices(rows); }
    catch (failure) { if (mounted.current) setError((failure as Error).message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  function askDelete(device: Device) {
    Alert.alert('Delete device?', `${device.device_type} · ${device.unit_location || 'No location'}\n${device.mac_address || device.serial_number}`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void removeDevice(device); } },
    ]);
  }
  async function removeDevice(device: Device) {
    if (!project || operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { await deleteDevice(userId, project.id, device.id); if (mounted.current) setDevices(rows => rows.filter(d => d.id !== device.id)); }
    catch (failure) { if (mounted.current) setError((failure as Error).message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(attempt: SaveAttempt) {
    if (!project || attempt.project_id !== project.id || attempt.user_id !== userId) throw new Error('Project changed. Return to Batch Setup.');
    if (operation.current) throw new Error('Another operation is running. Please wait.');
    operation.current = true;
    try {
      await saveDevice(attempt);
      const unit = nextUnit(attempt.draft.unit_location, batch.autoAdvance);
      if (mounted.current) {
        setBatch(previous => ({ ...previous, unit_location: unit }));
        setSavedMessage(`Saved ${attempt.draft.device_type}${attempt.draft.unit_location ? ` at ${attempt.draft.unit_location}` : ''}. Ready for the next device.`);
      }
      return unit;
    } finally { operation.current = false; }
  }
  async function signOut() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { const { error: failure } = await supabase.auth.signOut({ scope: 'local' }); if (failure) throw failure; }
    catch { if (mounted.current) setError('Unable to sign out. Please retry.'); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  if (view === 'scan' && project && access === 'pro') return <DeviceScanner project={project} userId={userId} batch={batch}
    savedMessage={savedMessage} batchStorageError={storageError} onSave={save} onExit={() => setView('batch')} onDevices={() => { void showDevices(); }} />;

  return <SafeAreaView style={[ui.page, { paddingTop: StatusBar.currentHeight ?? 0 }]}><StatusBar barStyle="light-content" backgroundColor={colors.blue} />
    <View style={ui.header}><Text style={ui.brand}>CABLEMINT TOOLS</Text><Text style={ui.white}>Device Capture</Text><Text style={{ color: '#B7CEDB' }}>{session.user.email} · {access === 'pro' ? 'Pro' : access === 'free' ? 'Pro access not active' : 'Checking access'}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {access === 'loading' && <ActivityIndicator color={colors.green} />}
      {access !== 'pro' ? <>
        <Text style={ui.heading}>CableMint Pro access</Text><Text style={ui.body}>{access === 'free' ? 'No active Pro entitlement was found for this account. Manage your subscription on the CableMint website, then refresh access.' : 'Connect to the internet to verify your account and Pro access.'}</Text>
        <Button title="Refresh Access" disabled={access === 'loading' || busy} onPress={() => { void refreshAccess(); }} />
      </> : view === 'projects' ? <>
        <Text style={ui.heading}>Select Project</Text>
        {!projects.length && <Text style={ui.body}>No projects yet. Create your first project below.</Text>}
        {projects.map(p => <Button key={p.id} title={p.name} secondary disabled={busy} onPress={() => { setProject(p); setSavedMessage(''); setView('batch'); setCreatingProject(false); setProjectName(''); setProjectAttempt(null); setError(''); }} />)}
        <Button title="Create New Project" disabled={busy} onPress={() => { setCreatingProject(true); setError(''); }} />
        {creatingProject && <View style={ui.card}>
          <Field label="Project / Site Name" value={projectName} onChange={setProjectName} maxLength={80} placeholder="Site or project name" disabled={busy || !!projectAttempt} />
          {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
          {!!projectAttempt && <Text style={ui.muted}>Creation was not confirmed. Retry the same project or refresh the list before starting another.</Text>}
          <Button title={busy ? 'Creating Project…' : projectAttempt ? 'Retry Create Project' : 'Create Project & Open'} disabled={busy} onPress={() => { void submitProject(); }} />
          <Button title="Cancel" secondary disabled={busy} onPress={() => {
            const cancel = () => { setCreatingProject(false); setProjectName(''); setProjectAttempt(null); setError(''); };
            if (projectAttempt) Alert.alert('Cancel this creation?', 'The project may already exist. Refresh your project list before creating it again.', [{ text: 'Stay', style: 'cancel' }, { text: 'Cancel Creation', onPress: cancel }]);
            else cancel();
          }} />
        </View>}
        <Button title="Refresh Projects & Access" secondary disabled={busy} onPress={() => { void refreshAccess(); }} />
      </> : project && view === 'devices' ? <>
        <Text style={ui.heading}>Current Project Devices</Text><Text style={ui.body}>{project.name}</Text>
        {busy && <ActivityIndicator color={colors.green} />}
        {!busy && !devices.length && !error && <Text style={ui.muted}>No devices saved in this project.</Text>}
        {devices.map(d => <View key={d.id} style={ui.card}><Text style={ui.label}>{d.device_type} · {d.manufacturer} {d.model}</Text>
          <Text style={ui.body}>{[d.building, d.floor_area, d.unit_location].filter(Boolean).join(' / ') || 'No location entered'}</Text>
          <Text selectable style={ui.body}>MAC: {d.mac_address || 'None'}{ '\n' }Serial: {d.serial_number || 'None'}</Text>
          <Text style={ui.muted}>{new Date(d.captured_at).toLocaleString()} · {d.verified ? 'Verified' : 'Unverified'}</Text>
          <Button title="Delete" secondary disabled={busy} onPress={() => askDelete(d)} /></View>)}
        <Button title="Refresh Devices" disabled={busy} onPress={() => { void showDevices(); }} />
        <Button title="Back to Batch Setup" secondary disabled={busy} onPress={() => setView('batch')} />
      </> : project ? <>
        <Text style={ui.heading}>Batch Setup</Text><Text style={ui.body}>{project.name}</Text>
        {!!savedMessage && <Text style={ui.body}>{savedMessage}</Text>}
        {!!storageError && <><Text style={ui.error}>{storageError}</Text><Button title="Retry Batch Storage" secondary onPress={() => { void restoreCurrentBatch(); }} /></>}
        {batchReadyKey !== key && !storageError && <ActivityIndicator color={colors.green} />}
        {([['building', 'Building', 100], ['floor_area', 'Floor / Area', 100], ['device_type', 'Device Type (required)', 80], ['manufacturer', 'Manufacturer', 100], ['model', 'Model', 120], ['unit_location', 'Unit / Room / Location', 120]] as const).map(([field, label, limit]) =>
          <Field key={field} label={label} value={batch[field]} maxLength={limit} onChange={value => changeBatch(field, value)} disabled={busy || batchReadyKey !== key} />)}
        <View style={ui.card}><Text style={ui.label}>Auto-advance final number after saving</Text><Switch accessibilityLabel="Auto-advance unit number" value={batch.autoAdvance} onValueChange={value => changeBatch('autoAdvance', value)} disabled={batchReadyKey !== key || busy} />
          <Text style={ui.muted}>Room 101 → Room 102. Without a number, location stays unchanged. Advances only after a confirmed save.</Text></View>
        <Button title="Scan with Camera" disabled={busy || batchReadyKey !== key || !batch.device_type.trim()} onPress={() => setView('scan')} />
        <Text style={ui.muted}>Choose Existing Photo is available on the scanner screen. Batch fields persist for this user and project on this phone. Saving requires a connection.</Text>
        <Button title="Current Project Devices" secondary disabled={busy} onPress={() => { void showDevices(); }} />
        <Button title="Change Project" secondary disabled={busy} onPress={() => { setProject(null); setView('projects'); }} />
        <Button title="Refresh Pro Access" secondary disabled={busy} onPress={() => { void refreshAccess(); }} />
      </> : null}
      <Button title="Sign Out" secondary disabled={busy || access === 'loading'} onPress={() => { void signOut(); }} />
    </ScrollView></SafeAreaView>;
}
