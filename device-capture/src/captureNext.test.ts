import { nextCaptureBatch, completedCaptureScreens } from './captureNext';
import { CaptureQueue } from './captureQueue';
import { cleanDraft, emptyBatch, type Device, type SaveAttempt } from './deviceWorkflow';
import { previousScreen, searchHistory } from './historyModel';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}

export async function runCaptureNextChecks() {
  const batch = {...emptyBatch, building:'Tower A', floor_area:'Level 2',
    device_type:'WAP', manufacturer:'First vendor', model:'First model',
    unit_location:'Room 009', requireInstalledPhoto:true};
  const first = cleanDraft(batch, 'AA1122334401', 'SYNTH-FIRST', 'Room 009');
  const next = nextCaptureBatch(batch, first);
  assert(next.building === 'Tower A' && next.floor_area === 'Level 2', 'Site context stays selected');
  assert(!next.device_type && !next.manufacturer && !next.model, 'Completed equipment fields clear');
  assert(!next.unit_location, 'Default next location must be empty');
  assert(next.requireInstalledPhoto && !next.autoAdvance, 'Existing batch options stay intact');
  assert(batch.device_type === 'WAP' && first.mac_address === 'AA:11:22:33:44:01', 'Completed draft is immutable');
  assert(nextCaptureBatch({...batch, autoAdvance:true}, first).unit_location === 'Room 010', 'Explicit advance carries only the next room');
  assert(!nextCaptureBatch({...batch, autoAdvance:true}, {...first, unit_location:'Lobby'}).unit_location, 'Nonnumeric room never carries accidentally');
  assert(!nextCaptureBatch({...batch, autoAdvance:true}, {...first, unit_location:'9'.repeat(120)}).unit_location, 'Overflow never reuses the previous room');
  const routes = completedCaptureScreens(['projects','project','types','scan','history','scan']);
  assert(routes.join(',') === 'projects,project,types', 'Completed capture returns directly to Device Type');
  assert(previousScreen(routes).join(',') === 'projects,project', 'Back still finishes to project overview');
  assert(completedCaptureScreens(['projects','scan']).join(',') === 'projects,types', 'No stale scan route when type anchor is absent');

  // Exercise the unchanged real queue across consecutive different-type captures.
  const values = new Map<string,string>();
  const q = new CaptureQueue({async getItem(k){return values.get(k) ?? null;},
    async setItem(k,v){values.set(k,v);}}, 'synthetic-user');
  await q.open();
  const project = {id:'synthetic-project',user_id:'synthetic-user',name:'Synthetic Job'};
  await q.cache([project], [], true);
  const attempt1:SaveAttempt = {id:'synthetic-first',user_id:project.user_id,
    project_id:project.id,captured_at:'2026-10-04T14:00:00Z',draft:first};
  await q.enqueue(attempt1);
  assert(q.read().items[0].state === 'pending', 'Local save does not claim cloud success');
  let missingRejected = false;
  try { cleanDraft({...next,device_type:'Intercom'}, '', '', ''); } catch { missingRejected = true; }
  assert(missingRejected, 'Next device cannot save stale/missing identifiers');
  const second = cleanDraft({...next,device_type:'Intercom'}, '', 'SYNTH-SECOND', 'Room 011');
  assert(second.mac_address === '' && second.serial_number === 'SYNTH-SECOND', 'Serial-only next type stays independent');
  const attempt2:SaveAttempt = {...attempt1,id:'synthetic-second',captured_at:'2026-10-04T14:01:00Z',draft:second};
  await q.enqueue(attempt2);
  const server:Device[] = [];
  const report = await q.sync(async attempt => {
    const row = {...attempt.draft,id:attempt.id,user_id:attempt.user_id,
      project_id:attempt.project_id,captured_at:attempt.captured_at!,verified:true};
    server.push(row); return row;
  }, async id => server.filter(row => row.project_id === id));
  const snapshot = q.read();
  assert(report.confirmed === 2 && snapshot.items.every(i => i.state === 'uploaded'), 'Both saves receive distinct server confirmation');
  assert(snapshot.devices.length === 2 && snapshot.devices.every(d => d.project_id === project.id), 'History receives both in the same project');
  assert(searchHistory(snapshot.devices,[project],'WAP SYNTH-FIRST').length === 1, 'First type/identity remains correct');
  assert(searchHistory(snapshot.devices,[project],'Intercom SYNTH-SECOND').length === 1, 'Next type/serial remains correct');
  assert(snapshot.devices.find(d => d.id === attempt2.id)?.mac_address === '', 'No old MAC leaks into serial-only History');
  console.log('Capture Next: type route, site context, safe location reset, separate identities, serial-only and two confirmed History records passed');
}
