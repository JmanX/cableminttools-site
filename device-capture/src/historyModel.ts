import type { Device, Project } from './deviceWorkflow';
export function searchHistory(rows: Device[], projects: Project[], search: string, projectId = '') {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const names = new Map(projects.map(p => [p.id, p.name]));
  return rows.filter(row => (!projectId || row.project_id === projectId) && terms.every(term =>
    [names.get(row.project_id), row.unit_location, row.device_type, row.mac_address, row.serial_number, row.building, row.floor_area, row.manufacturer, row.model]
      .filter(Boolean).join(' ').toLowerCase().includes(term)));
}
export type Screen = 'projects' | 'project' | 'types' | 'scan' | 'history' | 'tasks' | 'account' | 'create' | 'sync';
export function previousScreen(stack: Screen[]) { return stack.length > 1 ? stack.slice(0, -1) : stack; }
