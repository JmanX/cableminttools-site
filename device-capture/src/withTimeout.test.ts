import { withTimeout } from './withTimeout';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export async function runTimeoutChecks() {
  assert(await withTimeout(Promise.resolve('codes'), 100, 'timeout') === 'codes', 'completed recognition returns values');
  let message = '';
  try { await withTimeout(new Promise(() => {}), 5, 'Barcode pass timed out'); }
  catch (error) { message = (error as Error).message; }
  assert(message === 'Barcode pass timed out', 'unsettled native call must reject so review can continue');

  let deliver: (value: string) => void = () => {};
  let cleaned = '';
  const delayedPhoto = new Promise<string>(resolve => { deliver = resolve; });
  await withTimeout(delayedPhoto, 5, 'Photo timed out', uri => { cleaned = uri; }).catch(() => {});
  deliver('temporary-photo');
  await Promise.resolve();
  assert(cleaned === 'temporary-photo', 'photo returned after timeout is removed');

  try { await withTimeout(Promise.reject(new Error('camera failed')), 100, 'timeout'); }
  catch (error) { assert((error as Error).message === 'camera failed', 'preserve native failure details'); }
}
