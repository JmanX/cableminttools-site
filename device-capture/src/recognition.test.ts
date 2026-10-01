import { analyzeScan, normalizeMac, unresolvedConflicts, resolveField } from './recognition';
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

  // The exact field failure and confusable characters must never silently save.
  for (const misread of ['00110533D733','OC110533D733','0C110533D7B3','00110533D7B3']) {
    const wrong=printed(misread,{left:100,top:55,right:270,bottom:75});
    const review=analyzeScan({text:wrong.text,lines:[macAnchor,wrong,snAnchor,printed(snCode.data,{left:100,top:165,right:270,bottom:185})]},[macCode,snCode]);
    assert(review.barcodes.find(b=>b.assignedTo==='mac')?.data===macCode.data,'original barcode must survive OCR '+misread);
    assert(review.conflicts.some(c=>c.field==='mac'&&c.barcode.raw===macCode.data&&c.ocr.raw===misread),'conflict must show both sources '+misread);
    assert(unresolvedConflicts(review,{},macCode.data,snCode.data).length>0,'typing correct value alone does not resolve conflict');
    const resolution=resolveField({},'mac',macCode.data);
    assert(!unresolvedConflicts(review,resolution,'0c:11:05:33:d7:33',snCode.data).length,'explicit choice resolves normalized value');
    assert(unresolvedConflicts(review,resolution,'00110533D733',snCode.data).length>0,'later edit invalidates conflict resolution');
    assert(!unresolvedConflicts(review,resolveField({},'mac',''),'',snCode.data).length,'explicit serial-only omission supported');
  }
  const eight=code('8C110533D733',macCode.boundingBox!);
  const eightWrong=printed('BC110533D733',{left:100,top:55,right:270,bottom:75});
  assert(analyzeScan({text:'',lines:[macAnchor,eightWrong]},[eight]).conflicts.length===1,'8/B must warn');
  const formatted=printed('0c:11:05:33:d7:33',{left:100,top:55,right:270,bottom:75});
  assert(!analyzeScan({text:'',lines:[macAnchor,formatted]},[macCode]).conflicts.length,'formatting differences are not conflicts');
  const liveMismatch=analyzeScan({text:'',lines:[macAnchor,printed('00110533D733',{left:100,top:55,right:270,bottom:75})]},[{...macCode,source:'live',coordinateSpace:'preview'}]);
  assert(liveMismatch.conflicts.length===1&&liveMismatch.conflicts[0].barcode.source.includes('Live'),'live decode/photo OCR mismatch blocks save without inventing coordinate association');
  const liveSerial=analyzeScan({text:'',lines:[snAnchor,printed('P1U922QJ0046S',{left:100,top:165,right:270,bottom:185})]},[{...snCode,source:'live',coordinateSpace:'preview'}]);
  assert(liveSerial.conflicts[0]?.field==='serial'&&!liveSerial.macs.length,'Serial-only live/photo mismatch also blocks silent OCR selection');
  const raw=analyzeScan(null,[{...macCode,data:' 0c110533d733 '}]);
  assert(raw.barcodes[0].data===' 0c110533d733 ','raw decoded payload preserved exactly');
  const serialConflict=analyzeScan({text:'',lines:[snAnchor,printed('P1U922QJ0046S',{left:100,top:165,right:270,bottom:185})]},[snCode]);
  assert(serialConflict.conflicts[0]?.field==='serial'&&!serialConflict.macs.length,'serial-only conflicts handled independently');

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

  // Approximate positions measured from the user-supplied TP-Link photo,
  // not output claimed to have been generated by ML Kit on that photo.
  const tpSerial = printed('S/N:Y25A092000491', { left: 171, top: 261, right: 268, bottom: 274 });
  const tpMac = printed('MAC:10-5A-95-3A-57-D4', { left: 171, top: 300, right: 312, bottom: 313 });
  const tpSerialCode = code('Y25A092000491', { left: 171, top: 225, right: 354, bottom: 247 });
  const tpMacCode = code('105A953A57D4', { left: 172, top: 278, right: 343, bottom: 298 });
  const deviceKey = { ...code('1B81-BD8A-89BA-7D55-1000', { left: 376, top: 225, right: 440, bottom: 288 }), type: 'qr' };
  const tp = analyzeScan({ text: '', lines: [tpMac, tpSerial] }, [deviceKey, tpMacCode, tpSerialCode]);
  assert(tp.macs[0]?.value === '10:5A:95:3A:57:D4' && tp.serials[0]?.value === tpSerialCode.data, 'TP-Link printed rows select their matching barcode above, not next row barcode');
  assert(!tp.barcodes.find(b => b.type === 'qr')?.assignedTo, 'device-key QR remains unassigned');
  const omada = analyzeScan({ text: '', lines: [
    printed('S/N:Y25C114001079', { left: 337, top: 295, right: 427, bottom: 306 }),
    printed('MAC:B8-FB-B3-A3-67-CA', { left: 337, top: 319, right: 476, bottom: 329 }),
    printed('SSID:Omada_2.4GHz_A367CA', { left: 337, top: 329, right: 493, bottom: 339 })] },
    [code('Y25C114001079', { left: 337, top: 272, right: 493, bottom: 284 }),
      code('B8FBB3A367CA', { left: 337, top: 307, right: 472, bottom: 319 }),
      { ...code('1B3B-4F01-0ABB-9AB4-5000', { left: 177, top: 326, right: 244, bottom: 392 }), type: 'qr' }]);
  assert(omada.macs[0]?.value === 'B8:FB:B3:A3:67:CA' && omada.serials[0]?.value === 'Y25C114001079', 'Omada stacked printed rows choose their own codes');
  assert(!omada.barcodes.find(b => b.type === 'qr')?.assignedTo, 'Omada device key is not MAC or serial');
  const unv = analyzeScan({ text: '', lines: [printed('SN:210235UKG03256000990', { left: 49, top: 230, right: 207, bottom: 243 })] },
    [code('210235UKG03256000990', { left: 49, top: 212, right: 276, bottom: 229 }), { ...code('810093320271', { left: 61, top: 404, right: 186, bottom: 444 }), type: 'upc_a' }]);
  assert(!unv.macs.length && unv.serials[0]?.value === '210235UKG03256000990', 'UNV serial-only label does not invent MAC or select distant retail barcode');

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
