import { analyzeScan, normalizeMac } from './recognition';
import type { Bounds, OcrLine, ImageBarcode } from '../modules/cablemint-ocr/src/CableMintOcr.types';

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
  const vendor = analyzeScan({ text: 'SN:\nAKUVOX', lines: [line('SN:'), line('AKUVOX', 25)] }, []);
  assert(!vendor.serials.length, 'nearby vendor word cannot become an OCR serial candidate');

  const splitMac = analyzeScan({ text: 'MAC\nB8FBB3A367CA', lines: [line('MAC'), line('B8FBB3A367CA', 25)] }, []);
  assert(splitMac.macs[0].value === 'B8:FB:B3:A3:67:CA', 'MAC on following OCR line');

  const geometry = (left: number, top: number, right: number, bottom: number) => ({
    boundingBox: { left, top, right, bottom }, coordinateSpace: 'image' as const,
    cornerPoints: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }],
  });
  const printed = (text: string, box: Bounds): OcrLine => ({ text, ...box, ...geometry(box.left, box.top, box.right, box.bottom),
    elements: [{ text, ...geometry(box.left, box.top, box.right, box.bottom) }] });
  const code = (data: string, box: Bounds): ImageBarcode => ({ data, type: 'code128', source: 'image', ...geometry(box.left, box.top, box.right, box.bottom) });
  const macAnchor = printed('MAC:', { left: 20, top: 20, right: 70, bottom: 40 });
  const snAnchor = printed('SN:', { left: 20, top: 130, right: 55, bottom: 150 });
  const macCode = code('0C110533D733', { left: 100, top: 15, right: 350, bottom: 50 });
  const snCode = code('P1U922QJ00465', { left: 100, top: 125, right: 350, bottom: 160 });
  const typo = printed('DC110533D733', { left: 100, top: 55, right: 270, bottom: 75 });
  // Synthetic geometry regression based on the user-confirmed Akuvox values.
  // SN appears first in flattened OCR order: classification must ignore that.
  const akuvox = analyzeScan({ text: 'SN:\nDC110533D733\nMAC:\nP1U922QJ00465', lines: [snAnchor, typo, macAnchor,
    printed('P1U922QJ00465', { left: 100, top: 165, right: 270, bottom: 185 })] }, [snCode, macCode]);
  assert(akuvox.macs.length === 1 && akuvox.macs[0].value === '0C:11:05:33:D7:33', 'Akuvox MAC anchor selects nearby barcode, not OCR D/0 typo');
  assert(akuvox.serials.length === 1 && akuvox.serials[0].value === 'P1U922QJ00465', 'Akuvox SN anchor selects its own barcode');
  assert(!akuvox.serials.some(c => c.value === 'DC110533D733'), 'MAC OCR typo cannot leak into serial by array order');
  assert(akuvox.macs[0].source === 'Barcode near printed MAC label', 'assignment explanation');
  assert(akuvox.macs[0].anchor.cornerPoints?.length === 4 && akuvox.macs[0].evidence.cornerPoints?.length === 4, 'preserve anchor and evidence corner points');
  assert(akuvox.barcodes.find(b => b.data === macCode.data)?.assignedTo === 'mac', 'raw barcode assignment shown');

  const belowCode = code(macCode.data, { left: 20, top: 50, right: 270, bottom: 90 });
  const inline = printed('MAC:DC110533D733', { left: 20, top: 80, right: 270, bottom: 100 });
  const above = code(macCode.data, { left: 60, top: 20, right: 270, bottom: 60 });
  assert(analyzeScan({ text: inline.text, lines: [inline] }, [above]).macs[0]?.value === '0C:11:05:33:D7:33', 'nearby barcode overrides combined inline OCR typo');
  const sharedSn = printed('SN:0C110533D733', { left: 20, top: 110, right: 270, bottom: 130 });
  const shared = analyzeScan({ text: '', lines: [inline, sharedSn] }, [above]);
  assert(!shared.macs.length && !shared.serials.length, 'barcode shared by competing printed values stays ambiguous');
  const wrongFrame = analyzeScan({ text: '', lines: [{ ...macAnchor, imageWidth: 500, imageHeight: 800,
    elements: macAnchor.elements?.map(e => ({ ...e, imageWidth: 500, imageHeight: 800 })) }] }, [{ ...macCode, imageWidth: 800, imageHeight: 500 }]);
  assert(!wrongFrame.macs.length, 'different image coordinate frames cannot be associated');
  assert(akuvox.ocrLines.length === 4 && akuvox.ocrValues.some(v => v.text === typo.text), 'all OCR geometry retained for review');
  assert(analyzeScan({ text: 'MAC:', lines: [macAnchor] }, [belowCode]).macs[0]?.value === '0C:11:05:33:D7:33', 'barcode immediately below MAC anchor');
  const anchorless = analyzeScan({ text: typo.text, lines: [typo] }, [macCode]);
  assert(!anchorless.macs.length && !anchorless.serials.length && !anchorless.barcodes[0].assignedTo, 'shape plus barcode geometry alone cannot establish MAC');

  const competing = code('A1B2C3D4E5F6', { left: 105, top: 17, right: 355, bottom: 48 });
  const ambiguous = analyzeScan({ text: 'MAC:', lines: [macAnchor, typo] }, [macCode, competing]);
  assert(!ambiguous.macs.length && ambiguous.barcodes.every(b => !b.assignedTo), 'similarly near barcodes remain unassigned, without OCR fallback');
  const preview = analyzeScan({ text: 'MAC:', lines: [macAnchor] }, [{ ...macCode, source: 'live', coordinateSpace: 'preview' }]);
  assert(!preview.macs.length, 'never compare preview coordinates with photo OCR coordinates');
  const serialHex = analyzeScan({ text: 'SN:', lines: [snAnchor] }, [{ ...snCode, data: macCode.data }]);
  assert(serialHex.serials[0]?.value === macCode.data && !serialHex.macs.length, 'hex serial remains a serial when associated with SN');
  const far = code(macCode.data, { left: 100, top: 500, right: 350, bottom: 535 });
  assert(!analyzeScan({ text: 'MAC:', lines: [macAnchor] }, [far]).macs.length, 'remote barcode cannot be assigned');

  // Rotate the entire label: corner-point baselines, not screen rows, govern.
  const rotate = <T extends { cornerPoints?: { x: number; y: number }[]; elements?: { cornerPoints?: { x: number; y: number }[] }[] }>(node: T): T => {
    const transform = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(0.5) - p.y * Math.sin(0.5), y: p.x * Math.sin(0.5) + p.y * Math.cos(0.5) });
    return { ...node, cornerPoints: node.cornerPoints?.map(transform), elements: node.elements?.map(e => ({ ...e, cornerPoints: e.cornerPoints?.map(transform) })) };
  };
  const tilted = analyzeScan({ text: '', lines: [rotate(snAnchor), rotate(macAnchor), rotate(typo)] }, [rotate(macCode), rotate(snCode)]);
  assert(tilted.macs[0]?.value === '0C:11:05:33:D7:33' && tilted.serials[0]?.value === 'P1U922QJ00465', 'tilted Akuvox label retains spatial ownership');
  for (const text of ['MAC', 'MAC:', 'SN', 'S/N', 'SERIAL', 'SERIAL NUMBER']) {
    const anchor = printed(text, macAnchor);
    const layout = analyzeScan({ text, lines: [anchor] }, [macCode]);
    assert((text.startsWith('MAC') ? layout.macs : layout.serials).length === 1, `recognize printed ${text} anchor`);
  }
}
