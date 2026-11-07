import { batchStorageKey, cleanDraft, duplicateFields, emptyBatch, hasProStatus, nextUnit, restoreBatch, sameSavedAttempt, type Device, type SaveAttempt } from './deviceWorkflow';
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
export function runWorkflowChecks() {
  const batch = { ...emptyBatch, device_type: 'IP Camera', building: 'A', unit_location: 'Room 009', autoAdvance: true };
  const draft = cleanDraft(batch, '', 'UNV24091234', batch.unit_location);
  assert(draft.mac_address === '' && draft.serial_number === 'UNV24091234', 'serial-only device is valid');
  assert(cleanDraft(batch, '0c110533d733', '', '204').mac_address === '0C:11:05:33:D7:33', 'confirmed MAC normalized before saving');
  for (const values of [['not-a-mac', 'SER123'], ['', '']]) {
    let rejected = false; try { cleanDraft(batch, values[0], values[1], ''); } catch { rejected = true; }
    assert(rejected, 'invalid or missing identifiers rejected');
  }
  let required = false; try { cleanDraft(emptyBatch, '', 'SER123', ''); } catch { required = true; }
  assert(required, 'device type required');
  let locationLimit = false; try { cleanDraft(batch, '', 'SER123', 'x'.repeat(121)); } catch { locationLimit = true; }
  assert(locationLimit, 'existing schema location limit respected');
  assert(nextUnit('Room 009', true) === 'Room 010', 'numeric location increment retains zero padding');
  assert(nextUnit('Building 2 Room 101A', true) === 'Building 2 Room 102A', 'only final numeric group advances');
  assert(nextUnit('Lobby', true) === 'Lobby' && nextUnit('101', false) === '101', 'non-numeric or disabled advance unchanged');
  assert(nextUnit('999999999999999999999', true) === '1000000000000000000000', 'large numeric identifiers never lose precision');
  const row = { ...draft, id: 'device-a', user_id: 'user-a', project_id: 'project-a', captured_at: '', verified: true } as Device;
  const dup = duplicateFields([{ ...row, mac_address: '0c-11-05-33-d7-33', serial_number: 'unv24091234' }], { ...draft, mac_address: '0C:11:05:33:D7:33' });
  assert(dup.length === 1 && dup[0].fields.length === 2, 'MAC format variants and case-insensitive serial duplicates detected independently');
  assert(!duplicateFields([{ ...row, mac_address: '', serial_number: '' }], { ...draft, serial_number: '' }).length, 'empty identifiers never count as duplicates');
  const attempt: SaveAttempt = { id: row.id, user_id: row.user_id, project_id: row.project_id, draft };
  assert(sameSavedAttempt(row, attempt), 'committed retry recognized');
  assert(!sameSavedAttempt({ ...row, user_id: 'other-user' }, attempt) && !sameSavedAttempt({ ...row, unit_location: 'other-room' }, attempt), 'different ownership or edited fields cannot acknowledge an old save');
  assert(hasProStatus([{ status: 'active' }]) && hasProStatus([{ status: 'trialing' }]), 'existing website Pro states supported');
  assert(!hasProStatus([{ status: 'past_due' }, { status: 'cancelled' }]), 'non-Pro states never grant access');
  assert(batchStorageKey('user-a', 'project-a') !== batchStorageKey('user-b', 'project-a') && batchStorageKey('user-a', 'project-a') !== batchStorageKey('user-a', 'project-b'), 'batch settings isolated by user and project');
  assert(restoreBatch('{broken').device_type === '' && restoreBatch(JSON.stringify(batch)).autoAdvance, 'batch restoration handles corrupt and valid data');
}
