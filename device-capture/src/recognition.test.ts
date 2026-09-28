import { analyzeScan, normalizeMac } from './recognition';

const line = (text: string, top = 0, left = 0) => ({ text, top, left, bottom: top + 20, right: left + 140 });

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export function runRecognitionChecks() {
  assert(normalizeMac('B8-FB-B3-A3-67-CA') === 'B8:FB:B3:A3:67:CA', 'dashed MAC');
  assert(normalizeMac('B8FBB3A367CA') === 'B8:FB:B3:A3:67:CA', 'compact MAC');
  assert(normalizeMac('Y25C114001079') === null, 'serial must not be parsed as MAC');

  const result = analyzeScan(
    { text: 'MAC: B8-FB-B3-A3-67-CA\nS/N: Y25C114001079', lines: [line('MAC: B8-FB-B3-A3-67-CA'), line('S/N: Y25C114001079', 30)] },
    [{ type: 'code128', data: 'A1B2C3D4E5F6' } as never, { type: 'code128', data: 'Y25C114001079' } as never],
  );
  assert(result.macs.length === 1 && result.macs[0].value === 'B8:FB:B3:A3:67:CA', 'explicit MAC');
  assert(result.serials.length === 1 && result.serials[0].value === 'Y25C114001079', 'explicit serial');
  assert(!result.macs[0].corroboratedByBarcode, 'unrelated barcode cannot corroborate MAC');

  const unlabelled = analyzeScan(null, [{ type: 'code128', data: 'A1B2C3D4E5F6' } as never]);
  assert(unlabelled.macs.length === 0, 'unlabelled hex barcode cannot auto-fill MAC');

  const serialOnly = analyzeScan({ text: 'S/N: UNV24091234', lines: [line('S/N: UNV24091234')] }, []);
  assert(serialOnly.macs.length === 0 && serialOnly.serials[0].value === 'UNV24091234', 'serial-only label');

  const splitMac = analyzeScan({ text: 'MAC\nB8FBB3A367CA', lines: [line('MAC'), line('B8FBB3A367CA', 25)] }, []);
  assert(splitMac.macs[0].value === 'B8:FB:B3:A3:67:CA', 'MAC on following OCR line');
}
