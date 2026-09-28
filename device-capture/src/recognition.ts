import type { Bounds, Geometry, ImageBarcode, OcrElement, OcrLine, OcrResult, Point } from '../modules/cablemint-ocr/src/CableMintOcr.types';

type Field = 'mac' | 'serial';
export type ValueCandidate = {
  value: string;
  source: string;
  corroboratedByBarcode: boolean;
  anchor: OcrElement;
  evidence: OcrElement | ImageBarcode;
};
export type BarcodeCandidate = ImageBarcode & { assignedTo?: Field; assignmentReason?: string };
export type ScanReview = { macs: ValueCandidate[]; serials: ValueCandidate[]; barcodes: BarcodeCandidate[];
  ocrText: string; ocrLines: OcrLine[]; anchors: OcrElement[]; ocrValues: OcrElement[] };
type Anchor = OcrElement & { kind: Field; id: number };
type TextValue = OcrElement & { inlineAnchor?: number };

const MAC_SHAPE = /^(?:[\da-f]{12}|(?:[\da-f]{2}[:\-\s]){5}[\da-f]{2}|[\da-f]{4}(?:\.[\da-f]{4}){2})$/i;
const ANCHOR = /^(?:(?:ETHERNET\s+|WLAN\s+)?MAC(?:\s+ADDRESS)?|S\s*\/?\s*N|SERIAL(?:\s+(?:NUMBER|NO\.?))?)\b\s*[:#-]?\s*/i;

export function normalizeMac(raw: string): string | null {
  const trimmed = raw.trim();
  if (!MAC_SHAPE.test(trimmed)) return null;
  const hex = trimmed.replace(/[^\da-f]/gi, '').toUpperCase();
  if (hex.length !== 12 || /^0{12}$/.test(hex) || /^F{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g)!.join(':');
}

function serialValue(raw: string): string | null {
  const text = raw.trim();
  return /^[A-Z0-9][A-Z0-9._\/-]{3,159}$/i.test(text) ? text : null;
}

function points(node: Geometry): Point[] {
  if (node.cornerPoints?.length === 4 && node.cornerPoints.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return node.cornerPoints;
  const b = node.boundingBox;
  if (!b || b.right <= b.left || b.bottom <= b.top) return [];
  return [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
}

function envelope(vertices: Point[]): Bounds | null {
  if (!vertices.length) return null;
  return { left: Math.min(...vertices.map(p => p.x)), right: Math.max(...vertices.map(p => p.x)),
    top: Math.min(...vertices.map(p => p.y)), bottom: Math.max(...vertices.map(p => p.y)) };
}

function joinElements(elements: OcrElement[]): OcrElement {
  const boundingBox = envelope(elements.flatMap(points));
  // Multiword anchors preserve each element in the native OCR result; their
  // union is used only for association. Keep the first word's angle.
  const first = points(elements[0]);
  const last = points(elements[elements.length - 1]);
  return { ...elements[0], text: elements.map(e => e.text).join(' '), boundingBox,
    cornerPoints: first.length && last.length ? [first[0], last[1], last[2], first[3]] : [] };
}

function readLayout(ocr: OcrResult | null): { anchors: Anchor[]; values: TextValue[] } {
  const anchors: Anchor[] = [], values: TextValue[] = [];
  for (const line of ocr?.lines ?? []) {
    const elements = line.elements?.length ? line.elements : null;
    if (!elements) {
      const node: OcrElement = { ...line, boundingBox: line.boundingBox ?? line };
      const match = ANCHOR.exec(line.text.trim());
      if (match) {
        const anchor: Anchor = { ...node, text: match[0].trim(), kind: /MAC/i.test(match[0]) ? 'mac' : 'serial', id: anchors.length };
        anchors.push(anchor);
        const tail = line.text.trim().slice(match[0].length).trim();
        if (tail) values.push({ ...node, text: tail, inlineAnchor: anchor.id });
      } else values.push(node);
      continue;
    }
    // Word order is used only to recognize a multiword anchor inside one OCR
    // line. Values on other lines are matched solely by their coordinates.
    for (let i = 0; i < elements.length;) {
      let anchorEnd = -1;
      for (let end = i; end < Math.min(i + 4, elements.length); end++) {
        const text = elements.slice(i, end + 1).map(e => e.text).join(' ').trim();
        const match = ANCHOR.exec(text);
        if (match && match[0].length === text.length) anchorEnd = end;
      }
      if (anchorEnd >= i) {
        const node = joinElements(elements.slice(i, anchorEnd + 1));
        anchors.push({ ...node, kind: /MAC/i.test(node.text) ? 'mac' : 'serial', id: anchors.length });
        i = anchorEnd + 1;
      } else {
        const node = elements[i];
        const match = ANCHOR.exec(node.text.trim());
        const tail = match ? node.text.trim().slice(match[0].length).trim() : '';
        if (match && tail) {
          const anchor: Anchor = { ...node, text: match[0].trim(), kind: /MAC/i.test(match[0]) ? 'mac' : 'serial', id: anchors.length };
          anchors.push(anchor);
          values.push({ ...node, text: tail, inlineAnchor: anchor.id });
        } else values.push(node);
        i++;
      }
    }
  }
  return { anchors, values };
}

// Project corner points onto the printed anchor's baseline. This works for
// tilted labels as well as horizontal labels, without relying on OCR order.
function localBox(anchor: Anchor, node: Geometry): Bounds | null {
  const a = points(anchor), p = points(node);
  if (a.length !== 4 || !p.length) return null;
  const dx = a[1].x - a[0].x, dy = a[1].y - a[0].y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  return envelope(p.map(q => ({ x: ((q.x - a[0].x) * dx + (q.y - a[0].y) * dy) / length,
    y: (-(q.x - a[0].x) * dy + (q.y - a[0].y) * dx) / length })));
}

function proximity(anchor: Anchor, node: Geometry): number | null {
  if (node.coordinateSpace === 'preview') return null;
  if (anchor.imageWidth && node.imageWidth && (anchor.imageWidth !== node.imageWidth || anchor.imageHeight !== node.imageHeight)) return null;
  const a = localBox(anchor, anchor), b = localBox(anchor, node);
  if (!a || !b) return null;
  const h = Math.max(1, a.bottom - a.top);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const gapX = Math.max(0, b.left - a.right, a.left - b.right);
  const sameRow = overlapY >= Math.min(h, b.bottom - b.top) * 0.3 && b.left >= a.right - h * 0.6;
  if (sameRow && gapX <= 14 * h) return gapX / h + Math.abs((b.top + b.bottom - a.top - a.bottom) / 2) / h;
  const gapY = b.top - a.bottom;
  const below = gapY >= -0.25 * h && gapY <= 3.5 * h && b.right >= a.left - h && b.left <= a.right + 7 * h;
  return below ? 1 + Math.max(0, gapY) / h + gapX / h : null;
}

function ranked<T extends Geometry>(anchor: Anchor, nodes: T[], anchors: Anchor[]): { node: T; score: number }[] {
  return nodes.flatMap(node => {
    const score = proximity(anchor, node);
    if (score === null) return [];
    // A competing printed field between this anchor and the target blocks a
    // cross-row assignment, even when the target happens to look like a MAC.
    const b = localBox(anchor, node), a = localBox(anchor, anchor);
    const blocked = b && a && b.top >= a.bottom && anchors.some(other => {
      if (other.id === anchor.id) return false;
      const o = localBox(anchor, other);
      return o && o.top >= a.bottom && o.bottom <= b.top && o.right >= Math.min(a.left, b.left) && o.left <= Math.max(a.right, b.right);
    });
    return blocked ? [] : [{ node, score }];
  }).sort((a, b) => a.score - b.score);
}

function uniqueNearest<T>(items: { node: T; score: number }[]): T | null {
  if (!items.length) return null;
  if (items[1] && items[1].score - items[0].score <= Math.max(0.65, items[0].score * 0.2)) return null;
  return items[0].node;
}

function matchingPrintedValue(anchor: Anchor, text: TextValue, barcode: ImageBarcode): number | null {
  if (barcode.coordinateSpace === 'preview' || (anchor.imageWidth && barcode.imageWidth &&
    (anchor.imageWidth !== barcode.imageWidth || anchor.imageHeight !== barcode.imageHeight))) return null;
  const printed = text.text.replace(/[:.\-\s]/g, '').toUpperCase();
  const decoded = barcode.data.replace(/[:.\-\s]/g, '').toUpperCase();
  // Compare observed values, never invent an OCR correction. At most one
  // mistaken OCR character is tolerated, and matching still needs geometry.
  if (printed.length < 4 || printed.length !== decoded.length ||
    [...printed].filter((c, i) => c !== decoded[i]).length > 1) return null;
  const t = localBox(anchor, text), b = localBox(anchor, barcode), a = localBox(anchor, anchor);
  if (!t || !b || !a) return null;
  const h = Math.max(1, a.bottom - a.top);
  const overlapX = Math.min(t.right, b.right) - Math.max(t.left, b.left);
  const gapY = Math.max(0, b.top - t.bottom, t.top - b.bottom);
  if (overlapX < Math.min(t.right - t.left, b.right - b.left) * 0.3 || gapY > 3 * h) return null;
  return gapY / h + Math.abs((b.left + b.right - t.left - t.right) / 2) / Math.max(h, t.right - t.left);
}

export function analyzeScan(ocr: OcrResult | null, barcodeResults: ImageBarcode[]): ScanReview {
  const { anchors, values } = readLayout(ocr);
  // Prefer still-image geometry over an identical live-preview value. Keep
  // separate detections at separate positions, since those may be ambiguous.
  const imageData = new Set(barcodeResults.filter(b => b.source !== 'live' && b.coordinateSpace !== 'preview' && points(b).length).map(b => b.data.trim()));
  const barcodes: BarcodeCandidate[] = [];
  const seen = new Set<string>();
  for (const code of barcodeResults) {
    const data = code.data.trim();
    if (!data || (code.source === 'live' && imageData.has(data))) continue;
    const key = JSON.stringify([data, code.type, points(code)]);
    if (!seen.has(key)) { barcodes.push({ ...code, data }); seen.add(key); }
  }
  const imageCodes = barcodes.filter(b => b.source !== 'live' && b.coordinateSpace !== 'preview' && points(b).length);
  const macs = new Map<string, ValueCandidate>(), serials = new Map<string, ValueCandidate>();
  for (const anchor of anchors) {
    const candidates = ranked(anchor, imageCodes, anchors);
    const barcode = uniqueNearest(candidates);
    let evidence: ImageBarcode | TextValue | null = null;
    let fromBarcode = false;
    if (candidates.length) {
      // A barcode must have one nearest anchor AND that anchor must have one
      // nearest barcode. Ties stay unassigned; OCR cannot override ambiguity.
      if (!barcode) continue;
      const owners = anchors.flatMap(a => ranked(a, [barcode], anchors).map(item => ({ node: a, score: item.score })));
      owners.sort((a, b) => a.score - b.score);
      if (uniqueNearest(owners)?.id !== anchor.id) continue;
      evidence = barcode;
      fromBarcode = true;
    } else {
      const nearbyText = values.filter(v => v.inlineAnchor === undefined);
      const textChoices = [...ranked(anchor, nearbyText, anchors),
        ...values.filter(v => v.inlineAnchor === anchor.id).map(node => ({ node, score: -1 }))];
      textChoices.sort((a, b) => a.score - b.score);
      const textValue = uniqueNearest(textChoices);
      if (!textValue) continue;
      const owners = anchors.flatMap(a => a.id === textValue.inlineAnchor
        ? [{ node: a, score: -1 }]
        : ranked(a, [textValue], anchors).map(item => ({ node: a, score: item.score })));
      owners.sort((a, b) => a.score - b.score);
      if (uniqueNearest(owners)?.id !== anchor.id) continue;
      evidence = textValue;
      // Some labels print the human-readable value immediately under its
      // barcode. The anchor-to-text link must be unique before considering
      // that barcode; this also handles MAC:VALUE recognized as one word.
      const matching = imageCodes.flatMap(node => {
        const score = matchingPrintedValue(anchor, textValue, node);
        return score === null ? [] : [{ node, score }];
      }).sort((a, b) => a.score - b.score);
      if (matching.length) {
        const decoded = uniqueNearest(matching);
        if (!decoded) continue;
        const competingTextOwner = anchors.some(other => other.id !== anchor.id && values.some(v => {
          if (v.inlineAnchor !== undefined && v.inlineAnchor !== other.id) return false;
          return (v.inlineAnchor === other.id || proximity(other, v) !== null) && matchingPrintedValue(other, v, decoded) !== null;
        }));
        if (competingTextOwner) continue;
        const directOwners = anchors.flatMap(a => ranked(a, [decoded], anchors).map(item => ({ node: a, score: item.score })));
        if (directOwners.some(owner => owner.node.id !== anchor.id)) continue;
        evidence = decoded;
        fromBarcode = true;
      }
    }
    const raw = 'data' in evidence ? evidence.data : evidence.text;
    // Detached OCR words such as a vendor logo are insufficient serial
    // evidence. Alphabetic-only serials remain available via manual review
    // or decoded barcodes; do not guess them from nearby printed prose.
    const value = anchor.kind === 'mac' ? normalizeMac(raw)
      : !fromBarcode && !/\d/.test(raw) ? null : serialValue(raw);
    if (!value) continue;
    const label = anchor.kind === 'mac' ? 'MAC' : 'serial';
    const source = `${fromBarcode ? 'Barcode' : 'OCR value'} near printed ${label} label`;
    const candidate: ValueCandidate = { value, source, corroboratedByBarcode: fromBarcode, anchor, evidence };
    (anchor.kind === 'mac' ? macs : serials).set(value, candidate);
    if (fromBarcode) { (evidence as BarcodeCandidate).assignedTo = anchor.kind; (evidence as BarcodeCandidate).assignmentReason = source; }
  }
  return { macs: [...macs.values()], serials: [...serials.values()], barcodes, ocrText: ocr?.text ?? '',
    ocrLines: ocr?.lines ?? [], anchors, ocrValues: values };
}
