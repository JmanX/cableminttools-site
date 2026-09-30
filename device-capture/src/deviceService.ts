import { supabase } from './supabase';
import { duplicateFields, hasProStatus, sameSavedAttempt, type Device, type Project, type SaveAttempt } from './deviceWorkflow';

const DEVICE_COLUMNS = 'id,project_id,user_id,building,floor_area,unit_location,device_type,manufacturer,model,mac_address,serial_number,verified,captured_at';
export class SavePreflightError extends Error {}
export class DuplicateDeviceError extends SavePreflightError {
  constructor(public records: Device[]) { super('This MAC or serial already exists in this project. Review the existing record below.'); }
}
export function serverError(operation: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  return new Error(`${operation}: ${[error.message, error.code && `Code: ${error.code}`, error.details && `Details: ${error.details}`, error.hint && `Hint: ${error.hint}`].filter(Boolean).join('\n')}`);
}
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
  if (error) throw serverError('Session verification failed', error);
  if (!data.user || data.user.id !== expectedId) throw new Error('Please sign in again before accessing this project.');
  return data.user;
}
export async function readPro(userId: string) {
  const user = await requireUser(userId);
  if (!user.email) return false;
  const { data, error } = await supabase.from('dodo_subscriptions').select('status')
    .ilike('customer_email', user.email.replace(/[\\%_]/g, '\\$&')).in('status', ['active', 'trialing']).limit(1);
  if (error) throw serverError('Unable to verify Pro access', error);
  return hasProStatus(data ?? []);
}
export async function loadProjects(userId: string): Promise<Project[]> {
  await requireUser(userId);
  const projects: Project[] = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('field_projects').select('id,name,user_id').eq('user_id', userId)
      .order('updated_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw serverError('Unable to load your projects', error);
    projects.push(...(data ?? []));
    if (!data || data.length < 500) return projects;
  }
}
async function requireProject(userId: string, projectId: string) {
  const { data, error } = await supabase.from('field_projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw serverError('Project verification failed', error);
  if (!data) throw new Error('This project is no longer available to your account. Select another project.');
}
export async function loadDevices(userId: string, projectId: string): Promise<Device[]> {
  await requireUser(userId);
  await requireProject(userId, projectId);
  const rows: Device[] = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('field_devices').select(DEVICE_COLUMNS).eq('user_id', userId).eq('project_id', projectId)
      .order('captured_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw serverError('Unable to load project devices', error);
    rows.push(...((data ?? []) as Device[]));
    if (!data || data.length < 500) return rows;
  }
}

export async function loadHistory(userId: string): Promise<Device[]> {
  await requireUser(userId);
  const rows: Device[] = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('field_devices').select(DEVICE_COLUMNS).eq('user_id', userId)
      .order('captured_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw serverError('Unable to load capture history', error);
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
  if (previous.error) throw serverError('Could not check the previous save', previous.error);
  if (previous.data) {
    if (sameSavedAttempt(previous.data as Device, attempt)) return previous.data as Device;
    throw new Error('The previous save differs from these fields. Check Current Project Devices before saving again.');
  }
  const existing = await loadDevices(attempt.user_id, attempt.project_id);
  const duplicates = duplicateFields(existing, attempt.draft);
  if (duplicates.length) throw new DuplicateDeviceError(existing.filter(d => duplicates.some(match => match.id === d.id)));
  writing = true;
  const { data, error } = await supabase.from('field_devices').insert({ id: attempt.id, user_id: attempt.user_id,
    project_id: attempt.project_id, ...attempt.draft, ...(attempt.captured_at ? {captured_at:attempt.captured_at} : {}), verified: true }).select(DEVICE_COLUMNS).single();
  if (error) throw serverError('Supabase device insert failed', error);
  if (!data || !sameSavedAttempt(data as Device, attempt)) throw new Error('Supabase did not confirm these device fields. Your scan is retained; retry the same save.');
  return data as Device;
  } catch (error) {
    if (!writing && !(error instanceof SavePreflightError)) throw new SavePreflightError((error as Error).message);
    throw error;
  }
}

export async function deleteDevice(userId: string, projectId: string, id: string) {
  if (!await readPro(userId)) throw new Error('CableMint Pro access is required. Refresh account access.');
  await requireProject(userId, projectId);
  const { data, error } = await supabase.from('field_devices').delete().eq('id', id).eq('user_id', userId).eq('project_id', projectId).select('id');
  if (error) throw serverError('Supabase device delete failed', error);
  if (data?.length !== 1) throw new Error('Delete was not confirmed. Refresh the list before trying again.');
}
