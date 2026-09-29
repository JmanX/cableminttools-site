import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, SafeAreaView, ScrollView, StatusBar, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Button, colors, Field, ui } from './ui';
import { FieldWorkspace } from './FieldWorkspace';

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
  if (session) return <FieldWorkspace key={session.user.id} session={session} />;
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

