import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

type Manifest = { generation: string; count: number };
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
function readManifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  try { const m = JSON.parse(raw); return /^[a-f0-9-]{36}$/.test(m.generation) && Number.isInteger(m.count) && m.count > 0 && m.count <= 256 ? m : null; }
  catch { return null; }
}
const partKey = (key: string, m: Manifest, index: number) => `${key}.${m.generation}.${index}`;
async function cleanParts(key: string, m: Manifest | null) {
  if (m) await Promise.all(Array.from({ length: m.count }, (_, i) => SecureStore.deleteItemAsync(partKey(key, m, i), options)));
}

// A session can exceed SecureStore's per-value size guidance. Small encrypted
// chunks are published by swapping one manifest after every chunk is written.
export const sessionStorage = {
  async getItem(key: string) {
    const manifest = readManifest(await SecureStore.getItemAsync(key, options));
    if (!manifest) return null;
    const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, i) => SecureStore.getItemAsync(partKey(key, manifest, i), options)));
    return chunks.some(chunk => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    const old = readManifest(await SecureStore.getItemAsync(key, options));
    const manifest = { generation: randomUUID(), count: Math.ceil(value.length / 400) };
    if (!manifest.count || manifest.count > 256) throw new Error('Session storage size is unsupported.');
    try {
      for (let i = 0; i < manifest.count; i++) {
        await SecureStore.setItemAsync(partKey(key, manifest, i), value.slice(i * 400, (i + 1) * 400), options);
      }
      await SecureStore.setItemAsync(key, JSON.stringify(manifest), options);
    } catch (error) { await cleanParts(key, manifest).catch(() => {}); throw error; }
    await cleanParts(key, old).catch(() => {});
  },
  async removeItem(key: string) {
    const old = readManifest(await SecureStore.getItemAsync(key, options));
    await SecureStore.deleteItemAsync(key, options);
    await cleanParts(key, old);
  },
};
