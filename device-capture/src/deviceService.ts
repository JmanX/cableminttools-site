import { supabase } from './supabase';
import { duplicateFields, hasProStatus, sameSavedAttempt, type Device, type Project, type SaveAttempt } from './deviceWorkflow';

const DEVICE_COLUMNS = 'id,project_id,user_id,building,floor_area,unit_location,device_type,manufacturer,model,mac_address,serial_number,verified,captured_at';
export class SavePreflightError extends Error {}
export class ProjectCreateError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
export async function createProject(userId: string, input: string, id: string): Promise<Project> {
  const name = input.trim();
  if (!name) throw new ProjectCreateError('Enter a project/site name.');
  if ([...name].length > 80) throw new ProjectCreateError('Project/site name must be 80 characters or fewer.');
  await requireUser(userId);
  let previous;
  try {
    previous = await supabase.from('field_projects').select('id,name,user_id').eq('id', id).eq('user_id', userId).maybeSingle();
  } catch { throw new ProjectCreateError('Could not check the project. Check your connection and retry.'); }
  if (previous.error) throw new ProjectCreateError('Could not check the project. Check your connection and retry.');
  if (previous.data) {
    if (previous.data.name === name && previous.data.user_id === userId) return previous.data as Project;
    throw new ProjectCreateError('This creation attempt belongs to another project. Refresh your projects before continuing.');
  }
  const projects = await loadProjects(userId);
  if (projects.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new ProjectCreateError('You already have a project with this name. Select it from the list or use a different name.');
  }
  let result;
  try {
    result = await supabase.from('field_projects').insert({ id, user_id: userId, name }).select('id,name,user_id').single();
  } catch { throw new ProjectCreateError('Project creation was not confirmed. Check your connection and retry this same project, or refresh the list.', true); }
  if (result.error) {
    if (result.error.code === '23505') throw new ProjectCreateError('A project with this name already exists, or this creation already reached the server. Refresh the list or retry this same project.');
    if (result.error.code === '42501') throw new ProjectCreateError('Your account could not create this project. Sign in again and retry.');
    if (result.error.code === '23514' || result.error.code === '23503') throw new ProjectCreateError('Project creation was rejected. Check the name and sign in again before retrying.');
    throw new ProjectCreateError('Project creation was not confirmed. Check your connection and retry this same project, or refresh the list.', true);
  }
  if (!result.data) throw new ProjectCreateError('Project creation was not confirmed. Retry this same project or refresh the list.', true);
  return result.data as Project;
}
export async function requireUser(expectedId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== expectedId) throw new Error('Please sign in again before accessing this project.');
  return data.user;
}
export async function readPro(userId: string) {
  const user = await requireUser(userId);
  if (!user.email) return false;
  const { data, error } = await supabase.from('dodo_subscriptions').select('status')
    .ilike('customer_email', user.email.replace(/[\\%_]/g, '\\$&')).in('status', ['active', 'trialing']).limit(1);
  if (error) throw new Error('Unable to verify Pro access. Check your connection and retry.');
  return hasProStatus(data ?? []);
}
export async function loadProjects(userId: string): Promise<Project[]> {
  await requireUser(userId);
  const projects: Project[] = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('field_projects').select('id,name,user_id').eq('user_id', userId)
      .order('updated_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw new Error('Unable to load your projects. Check your connection and retry.');
    projects.push(...(data ?? []));
    if (!data || data.length < 500) return projects;
  }
}
async function requireProject(userId: string, projectId: string) {
  const { data, error } = await supabase.from('field_projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error || !data) throw new Error('This project is no longer available to your account. Select another project.');
}
export async function loadDevices(userId: string, projectId: string): Promise<Device[]> {
  await requireUser(userId);
  await requireProject(userId, projectId);
  const rows: Device[] = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('field_devices').select(DEVICE_COLUMNS).eq('user_id', userId).eq('project_id', projectId)
      .order('captured_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw new Error('Unable to load project devices. Check your connection and retry.');
    rows.push(...((data ?? []) as Device[]));
    if (!data || data.length < 500) return rows;
  }
}

export async function saveDevice(attempt: SaveAttempt): Promise<Device> {
  let writing = false;
  try {
  if (!await readPro(attempt.user_id)) throw new Error('CableMint Pro access is required to save devices. Refresh access or manage your account on the website.');
  await requireProject(attempt.user_id, attempt.project_id);
  // An uncertain response can be retried with the same ID. Never turn it into
  // a second insert or silently overwrite the first capture.
  const previous = await supabase.from('field_devices').select(DEVICE_COLUMNS).eq('id', attempt.id)
    .eq('user_id', attempt.user_id).eq('project_id', attempt.project_id).maybeSingle();
  if (previous.error) throw new Error('Could not check the previous save. Keep this scan and retry when connected.');
  if (previous.data) {
    if (sameSavedAttempt(previous.data as Device, attempt)) return previous.data as Device;
    throw new Error('The previous save differs from these fields. Check Current Project Devices before saving again.');
  }
  const duplicates = duplicateFields(await loadDevices(attempt.user_id, attempt.project_id), attempt.draft);
  if (duplicates.length) throw new Error(`Already in this project: ${duplicates.map(d => `${d.fields.join(' and ')}${d.location ? ` at ${d.location}` : ''}`).join('; ')}. Review Current Project Devices or correct the fields.`);
  writing = true;
  const { data, error } = await supabase.from('field_devices').insert({ id: attempt.id, user_id: attempt.user_id,
    project_id: attempt.project_id, ...attempt.draft, verified: true }).select(DEVICE_COLUMNS).single();
  if (error || !data) throw new Error('Save was not confirmed. Your scan is retained. Retry Save & Next to check this same save, or inspect Current Project Devices.');
  return data as Device;
  } catch (error) {
    if (!writing) throw new SavePreflightError((error as Error).message);
    throw error;
  }
}

export async function deleteDevice(userId: string, projectId: string, id: string) {
  if (!await readPro(userId)) throw new Error('CableMint Pro access is required. Refresh account access.');
  await requireProject(userId, projectId);
  const { data, error } = await supabase.from('field_devices').delete().eq('id', id).eq('user_id', userId).eq('project_id', projectId).select('id');
  if (error || data?.length !== 1) throw new Error('Delete was not confirmed. Refresh the list before trying again.');
}
