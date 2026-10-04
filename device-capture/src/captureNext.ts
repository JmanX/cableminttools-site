import { nextUnit, type Batch, type DeviceDraft } from './deviceWorkflow';
import type { Screen } from './historyModel';

/** Keep site context, but never inherit the completed equipment's identity/type. */
export function nextCaptureBatch(batch: Batch, completed: DeviceDraft): Batch {
  const advanced = batch.autoAdvance ? nextUnit(completed.unit_location, true) : '';
  return {
    ...batch,
    building: completed.building,
    floor_area: completed.floor_area,
    device_type: '',
    manufacturer: '',
    model: '',
    // Explicit room auto-advance may carry a NEW value. A nonnumeric/overflowing
    // value must clear too, rather than silently reusing the completed location.
    unit_location: advanced !== completed.unit_location ? advanced : '',
  };
}

/** Remove completed scan routes so Back cannot resume a finished device. */
export function completedCaptureScreens(stack: Screen[]): Screen[] {
  const typeIndex = stack.lastIndexOf('types');
  const before = typeIndex >= 0 ? stack.slice(0, typeIndex) : stack;
  const base = before.filter(screen => screen !== 'scan' && screen !== 'types');
  return [...(base.length ? base : ['projects' as const]), 'types'];
}
