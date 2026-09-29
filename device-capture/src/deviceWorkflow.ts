import { normalizeMac } from './recognition';

export type Batch = { building: string; floor_area: string; device_type: string; manufacturer: string; model: string; unit_location: string; autoAdvance: boolean };
export const emptyBatch: Batch = { building: '', floor_area: '', device_type: '', manufacturer: '', model: '', unit_location: '', autoAdvance: false };
export type Project = { id: string; name: string; user_id: string };
export type DeviceDraft = Omit<Batch, 'autoAdvance'> & { mac_address: string; serial_number: string };
export type Device = DeviceDraft & { id: string; project_id: string; user_id: string; captured_at: string; verified: boolean };
export type SaveAttempt = { id: string; project_id: string; user_id: string; draft: DeviceDraft };

export function cleanDraft(batch: Batch, mac: string, serial: string, unit: string): DeviceDraft {
  const normalized = mac.trim() ? normalizeMac(mac) : '';
  if (normalized === null) throw new Error('Enter a valid MAC or leave MAC blank for a serial-only device.');
  const draft = { building: batch.building.trim(), floor_area: batch.floor_area.trim(), device_type: batch.device_type.trim(),
    manufacturer: batch.manufacturer.trim(), model: batch.model.trim(), unit_location: unit.trim(), mac_address: normalized, serial_number: serial.trim() };
  if (!draft.device_type) throw new Error('Device Type is required. Return to Batch Setup to enter it.');
  if (!draft.mac_address && !draft.serial_number) throw new Error('Choose or enter a MAC address or serial number.');
  const limits: Record<keyof DeviceDraft, number> = { building: 100, floor_area: 100, device_type: 80, manufacturer: 100, model: 120, unit_location: 120, mac_address: 32, serial_number: 160 };
  for (const field of Object.keys(limits) as (keyof DeviceDraft)[]) {
    if ([...draft[field]].length > limits[field]) throw new Error(`${field.replace(/_/g, ' ')} is too long (maximum ${limits[field]} characters).`);
  }
  return draft;
}

export function nextUnit(value: string, enabled: boolean): string {
  if (!enabled) return value;
  const match = /^(.*?)(\d+)(\D*)$/.exec(value);
  if (!match) return value;
  // Increment the final numeric group without Number overflow or losing zeros.
  const digits = (BigInt(match[2]) + BigInt(1)).toString().padStart(match[2].length, '0');
  const next = match[1] + digits + match[3];
  return [...next].length <= 120 ? next : value;
}

export function hasProStatus(rows: { status: string }[]): boolean {
  return rows.some(row => row.status === 'active' || row.status === 'trialing');
}

export function duplicateFields(rows: Pick<Device, 'id' | 'mac_address' | 'serial_number' | 'unit_location'>[], draft: DeviceDraft) {
  return rows.flatMap(row => {
    const fields: string[] = [];
    if (draft.mac_address && normalizeMac(row.mac_address) === draft.mac_address) fields.push('MAC');
    if (draft.serial_number && row.serial_number.trim().toUpperCase() === draft.serial_number.toUpperCase()) fields.push('serial');
    return fields.length ? [{ id: row.id, fields, location: row.unit_location }] : [];
  });
}

export function sameSavedAttempt(row: Device, attempt: SaveAttempt): boolean {
  return row.id === attempt.id && row.user_id === attempt.user_id && row.project_id === attempt.project_id && row.verified &&
    (Object.keys(attempt.draft) as (keyof DeviceDraft)[]).every(field => row[field] === attempt.draft[field]);
}

export function batchStorageKey(userId: string, projectId: string) { return `cablemint.batch.v1.${userId}.${projectId}`; }

export function restoreBatch(raw: string | null): Batch {
  if (!raw) return { ...emptyBatch };
  try {
    const input = JSON.parse(raw);
    const result = { ...emptyBatch };
    for (const field of ['building', 'floor_area', 'device_type', 'manufacturer', 'model', 'unit_location'] as const) {
      if (typeof input[field] === 'string') result[field] = input[field];
    }
    result.autoAdvance = input.autoAdvance === true;
    return result;
  } catch { return { ...emptyBatch }; }
}
