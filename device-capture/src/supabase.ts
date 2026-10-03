import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './backendConfig';
import { sessionStorage } from './sessionStorage';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock },
  global: { fetch: async (input, init) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 20000);
    if (init?.signal?.aborted) abort();
    init?.signal?.addEventListener('abort', abort, { once: true });
    try { return await fetch(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
  } },
});
