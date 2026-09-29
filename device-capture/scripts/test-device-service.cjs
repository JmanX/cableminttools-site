const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '.test', 'src');
const { emptyBatch, cleanDraft } = require(path.join(root, 'deviceWorkflow.js'));
let rows = [], pro = true, authId = 'user-a', calls = [], mode = 'normal', idCommitted = false;
let projectRows = [{ id: 'project-a', user_id: 'user-a', name: 'Test' }], createdProject = null, projectMode = 'normal';
const draft = cleanDraft({ ...emptyBatch, device_type: 'IP Camera' }, '', 'SN123', 'Room 101');
const attempt = { id: 'device-a', user_id: 'user-a', project_id: 'project-a', draft };
const saved = { ...draft, ...attempt, verified: true, captured_at: '', draft: undefined };
const mock = {
  auth: { getUser: async () => ({ data: { user: { id: authId, email: 'user_a@example.test' } }, error: null }) },
  from(table) {
    const q = { table, filters: [], operation: 'select', payload: null, rangeValue: null };
    const builder = {
      select() { return builder; }, eq(k, v) { q.filters.push([k, v]); return builder; },
      ilike(k, v) { q.filters.push([k, v]); return builder; }, in() { return builder; }, limit() { return builder; }, order() { return builder; },
      range(a, b) { q.rangeValue = [a, b]; return builder; }, maybeSingle() { q.single = true; return builder; }, single() { q.single = true; return builder; },
      insert(payload) { q.operation = 'insert'; q.payload = payload; return builder; }, delete() { q.operation = 'delete'; return builder; },
      then(resolve, reject) {
        calls.push(q);
        let response;
        if (table === 'dodo_subscriptions') response = { data: pro ? [{ status: 'active' }] : [], error: mode === 'proError' ? { message: 'network' } : null };
        else if (table === 'field_projects') {
          if (q.operation === 'insert') {
            assert.equal(q.payload.user_id, authId);
            assert.deepEqual(Object.keys(q.payload).sort(), ['id', 'name', 'user_id']);
            if (projectMode === 'permission') response = { data: null, error: { code: '42501' } };
            else if (projectMode === 'duplicate') response = { data: null, error: { code: '23505' } };
            else {
              createdProject = q.payload;
              response = { data: projectMode === 'uncertain' ? null : createdProject, error: projectMode === 'uncertain' ? { message: 'network' } : null };
            }
          } else if (q.single) response = { data: q.filters.some(([k, v]) => k === 'id' && v === 'new-project') ? createdProject : { id: 'project-a' }, error: null };
          else response = { data: projectRows, error: projectMode === 'listError' ? { message: 'network' } : null };
        }
        else if (q.operation === 'insert') {
          assert.equal(q.payload.verified, true); assert.equal(q.payload.user_id, authId); assert.equal(q.payload.project_id, 'project-a');
          assert.equal('photo' in q.payload, false); assert.equal('autoAdvance' in q.payload, false);
          if (mode === 'insertError') return Promise.resolve({data:null,error:{message:'new row violates row-level security policy',code:'42501',details:'ownership check',hint:'verify project'}}).then(resolve,reject);
          idCommitted = true; response = { data: mode === 'uncertain' ? null : saved, error: mode === 'uncertain' ? { message: 'timeout' } : null };
        } else if (q.operation === 'delete') response = mode === 'deleteError' ? {data:null,error:{message:'delete denied',code:'42501'}} : { data: [{ id: attempt.id }], error: null };
        else if (q.single) response = { data: idCommitted ? saved : null, error: null };
        else response = { data: rows, error: mode === 'listError' ? { message: 'network' } : null };
        return Promise.resolve(response).then(resolve, reject);
      },
    }; return builder;
  },
};
require.cache[path.join(root, 'supabase.js')] = { id: path.join(root, 'supabase.js'), filename: path.join(root, 'supabase.js'), loaded: true, exports: { supabase: mock } };
const service = require(path.join(root, 'deviceService.js'));
async function checks() {
  await assert.rejects(service.createProject('user-a', '   ', 'new-project'), /Enter a project/);
  await assert.rejects(service.createProject('user-a', 'x'.repeat(81), 'new-project'), /80 characters/);
  assert.equal(calls.length, 0);
  await assert.rejects(service.createProject('user-a', ' test ', 'new-project'), /already have a project/);
  assert.equal(calls.some(q => q.operation === 'insert'), false);
  calls = []; projectMode = 'uncertain';
  await assert.rejects(service.createProject('user-a', '  New Site  ', 'new-project'), error => error.uncertain && /not confirmed/.test(error.message));
  projectMode = 'normal';
  const created = await service.createProject('user-a', 'New Site', 'new-project');
  assert.deepEqual(created, { id: 'new-project', user_id: 'user-a', name: 'New Site' });
  assert.equal(calls.filter(q => q.operation === 'insert').length, 1, 'uncertain creation retry reconciles the same UUID');
  for (const q of calls.filter(q => q.operation === 'select')) assert(q.filters.some(([k, v]) => k === 'user_id' && v === 'user-a'));
  createdProject = null; calls = []; projectMode = 'duplicate';
  await assert.rejects(service.createProject('user-a', 'New Site', 'new-project'), /already exists/);
  projectMode = 'permission';
  await assert.rejects(service.createProject('user-a', 'New Site', 'new-project'), /Sign in again/);
  projectMode = 'listError'; calls = [];
  await assert.rejects(service.createProject('user-a', 'New Site', 'new-project'), /Unable to load your projects/);
  assert.equal(calls.some(q => q.operation === 'insert'), false);
  projectMode = 'normal'; authId = 'user-b'; calls = [];
  await assert.rejects(service.createProject('user-a', 'New Site', 'new-project'), /sign in again/);
  assert.equal(calls.length, 0);
  authId = 'user-a'; calls = [];
  console.log('project creation validation, ownership, duplicate errors, and retry checks passed');
  await service.saveDevice(attempt);
  assert.equal(calls.filter(q => q.operation === 'insert').length, 1);
  await service.saveDevice(attempt);
  assert.equal(calls.filter(q => q.operation === 'insert').length, 1, 'retry acknowledges same record without another insert');
  idCommitted = false; calls = []; rows = [{ ...saved, id: 'existing', serial_number: 'sn123' }];
  await assert.rejects(service.saveDevice(attempt), error => error instanceof service.DuplicateDeviceError && error.records[0].id === 'existing');
  assert.equal(calls.some(q => q.operation === 'insert'), false, 'duplicate prevents insert');
  rows = []; pro = false; calls = [];
  await assert.rejects(service.saveDevice(attempt), /Pro access is required/);
  assert.equal(calls.some(q => q.operation === 'insert'), false);
  pro = true; mode = 'proError';
  await assert.rejects(service.saveDevice(attempt), /Unable to verify Pro/);
  mode = 'listError';
  await assert.rejects(service.saveDevice(attempt), /Unable to load project devices/);
  mode = 'insertError'; calls = [];
  await assert.rejects(service.saveDevice(attempt), /Supabase device insert failed: new row violates row-level security policy\nCode: 42501\nDetails: ownership check\nHint: verify project/);
  assert.equal(idCommitted, false);
  mode = 'uncertain'; calls = [];
  await assert.rejects(service.saveDevice(attempt), /Supabase device insert failed: timeout/);
  mode = 'normal'; await service.saveDevice(attempt);
  assert.equal(calls.filter(q => q.operation === 'insert').length, 1, 'uncertain insert response recovered by ID on retry');
  authId = 'user-b'; calls = [];
  await assert.rejects(service.loadDevices('user-a', 'project-a'), /sign in again/);
  assert.equal(calls.length, 0, 'stale session cannot query another account');
  authId = 'user-a'; calls = []; await service.loadDevices('user-a', 'project-a'); await service.deleteDevice('user-a', 'project-a', attempt.id);
  for (const q of calls.filter(q => q.table === 'field_devices')) {
    assert(q.filters.some(([k, v]) => k === 'user_id' && v === 'user-a'), 'device query scoped to owner');
    assert(q.filters.some(([k, v]) => k === 'project_id' && v === 'project-a'), 'device query scoped to project');
  }
  const deletion = calls.find(q => q.operation === 'delete'); assert(deletion.filters.some(([k, v]) => k === 'id' && v === attempt.id));
  mode='deleteError'; await assert.rejects(service.deleteDevice('user-a','project-a',attempt.id), /delete denied\nCode: 42501/);
  mode='normal'; calls=[]; await service.loadHistory('user-a');
  assert(calls.filter(q=>q.table==='field_devices').every(q=>q.filters.some(([k,v])=>k==='user_id' && v==='user-a')));
  console.log('device service ownership, duplicate, entitlement, and uncertain-save checks passed');
}
checks().catch(error => { console.error(error); process.exitCode = 1; });
