import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Button, colors, Field, ui } from './ui';
import { FieldWorkspace } from './FieldWorkspace';
import { readableError } from './presentation';

export function MobileApp() {
  return <SafeAreaProvider><AuthenticatedApp/></SafeAreaProvider>;
}
function AuthenticatedApp() {
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
      if (failure) setError(/invalid.*credentials/i.test(failure.message)?'Email or password was not recognized. Check both and try again.':readableError(failure.message));
      else setPassword('');
    } catch { setError('Unable to sign in. Check your connection and retry.'); }
    finally { setBusy(false); }
  }
  if (Platform.OS !== 'android') return <SafeAreaView style={ui.page}><Text style={ui.heading}>This build supports Android.</Text></SafeAreaView>;
  if (!ready) return <SafeAreaView style={ui.page}><ActivityIndicator color={colors.green} /></SafeAreaView>;
  if (session) return <FieldWorkspace key={session.user.id} session={session} />;
  return <SafeAreaView style={ui.page}><StatusBar barStyle="dark-content" backgroundColor="#EDF3F5"/>
    <KeyboardAvoidingView style={{flex:1}} behavior="height"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.content,{flexGrow:1,justifyContent:'center'}]}>
      <Image source={require('../assets/CableMintToolsLogo.png')} resizeMode="contain" style={{height:150,width:'100%'}} accessibilityLabel="CableMint Tools"/>
      <View style={{gap:6,marginBottom:8}}><Text style={ui.eyebrow}>BUILT FOR CONNECTED WORK</Text><Text style={[ui.heading,{fontSize:30}]}>Device Capture</Text><Text style={ui.body}>Equipment labels. Verified inventory. Connected jobs.</Text></View>
      <Text style={ui.sectionTitle}>Sign in to your workspace</Text>
      <Field label="Email" value={email} onChange={setEmail} email disabled={busy} />
      <Field label="Password" value={password} onChange={setPassword} secure disabled={busy} />
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Button title={busy ? 'Signing in…' : 'Sign In'} busy={busy} disabled={!email.trim() || !password} onPress={() => { void signIn(); }} />
      <Text style={ui.muted}>Use cableminttools.com to create an account, reset your password, or manage CableMint Pro.</Text>
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
