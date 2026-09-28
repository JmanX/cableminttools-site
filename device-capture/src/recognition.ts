import type { OcrLine, OcrResult } from '../modules/cablemint-ocr/src/CableMintOcrModule';

export type ValueCandidate = {
  value: string;
  source: 'printed MAC label' | 'printed serial label';
  corroboratedByBarcode: boolean;
};

export type BarcodeCandidate = { data: string; type: string };

export type ScanReview = {
  macs: ValueCandidate[];
  serials: ValueCandidate[];
  barcodes: BarcodeCandidate[];
  ocrText: string;
};

const MAC_SHAPE = /(?:[\da-f]{2}[:\-\s]){5}[\da-f]{2}|[\da-f]{4}(?:\.[\da-f]{4}){2}|\b[\da-f]{12}\b/i;
const MAC_LABEL = /\b(?:MAC(?:\s+ADDRESS)?|ETHERNET\s+MAC|WLAN\s+MAC)\b\s*[:#-]?\s*/i;
const SERIAL_LABEL = /\b(?:S\s*\/?\s*N|SERIAL(?:\s+(?:NUMBER|NO\.?))?)\b\s*[:#-]?\s*/i;
const SERIAL_VALUE = /^[A-Z0-9][A-Z0-9._\/-]{3,79}$/i;

export function normalizeMac(raw: string): string | null {
  const found = raw.match(MAC_SHAPE)?.[0];
  if (!found) return null;
  const hex = found.replace(/[^\da-f]/gi, '').toUpperCase();
  if (hex.length !== 12 || /^0{12}$/.test(hex) || /^F{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g)!.join(':');
}

function afterLabel(line: OcrLine, label: RegExp): string | null {
  const match = label.exec(line.text);
  if (!match) return null;
  const tail = line.text.slice(match.index + match[0].length).trim();
  return tail || null;
}

function nearbyValue(lines: OcrLine[], index: number): string | null {
  const line = lines[index];
  const sameRow = lines
    .filter((other, otherIndex) => otherIndex !== index && other.left >= line.right - 8 &&
      Math.abs((other.top + other.bottom) / 2 - (line.top + line.bottom) / 2) <= Math.max(24, line.bottom - line.top))
    .sort((a, b) => a.left - b.left)[0];
  if (sameRow) return sameRow.text.trim();
  const next = lines[index + 1];
  if (next && next.top - line.bottom < Math.max(34, 2 * (line.bottom - line.top))) return next.text.trim();
  return null;
}

function serialValue(raw: string): string | null {
  const token = raw.trim().split(/\s+/)[0]?.replace(/^[^A-Z0-9]+|[^A-Z0-9._\/-]+$/gi, '');
  return token && SERIAL_VALUE.test(token) ? token.toUpperCase() : null;
}

function barcodeMatches(value: string, barcodes: BarcodeCandidate[], isMac: boolean): boolean {
  return barcodes.some((barcode) => isMac
    ? normalizeMac(barcode.data) === value
    : barcode.data.trim().toUpperCase() === value);
}

export function analyzeScan(ocr: OcrResult | null, barcodeResults: BarcodeCandidate[]): ScanReview {
  const barcodes = Array.from(
    new Map(barcodeResults.filter((item) => item.data.trim()).map((item) =>
      [`${item.type}:${item.data.trim()}`, { type: item.type, data: item.data.trim() }])).values(),
  );
  const macs = new Map<string, ValueCandidate>();
  const serials = new Map<string, ValueCandidate>();
  const lines = ocr?.lines ?? [];

  lines.forEach((line, index) => {
    if (MAC_LABEL.test(line.text)) {
      const raw = afterLabel(line, MAC_LABEL) ?? nearbyValue(lines, index);
      const value = raw ? normalizeMac(raw) : null;
      if (value) macs.set(value, {
        value,
        source: 'printed MAC label',
        corroboratedByBarcode: barcodeMatches(value, barcodes, true),
      });
    }
    if (SERIAL_LABEL.test(line.text)) {
      const raw = afterLabel(line, SERIAL_LABEL) ?? nearbyValue(lines, index);
      const value = raw ? serialValue(raw) : null;
      if (value) serials.set(value, {
        value,
        source: 'printed serial label',
        corroboratedByBarcode: barcodeMatches(value, barcodes, false),
      });
    }
  });

  return {
    macs: [...macs.values()],
    serials: [...serials.values()],
    barcodes,
    ocrText: ocr?.text ?? '',
  };
}
