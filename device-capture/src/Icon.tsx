import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './theme';
export type IconName = 'projects'|'history'|'capture'|'tasks'|'account'|'back'|'next'|'plus'|'search'|'check'|'sync'|'warning'|'offline'|'wap'|'camera'|'intercom'|'switch'|'access'|'fiber'|'gallery'|'flash'|'edit'|'trash'|'location'|'settings';
const paths: Partial<Record<IconName,string>> = {
  projects:'M4 21V4h11v17M8 8h3M8 12h3M8 16h3M17 10h3v11M2 21h20',
  history:'M3 10a9 9 0 1 1 1 8M3 5v5h5M12 7v6l4 2',
  tasks:'M8 5H5v16h14V5h-3M8 4h8v4H8zM8 12h8M8 16h6',
  account:'M4 21c0-5 16-5 16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  back:'M19 12H5m6-6-6 6 6 6', next:'m9 5 7 7-7 7', plus:'M12 5v14M5 12h14',
  search:'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', check:'m5 12 4 4L19 6',
  sync:'M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5',
  warning:'m12 3 10 18H2L12 3zm0 6v5m0 3v.1', offline:'M3 3l18 18M2 8a18 18 0 0 1 20 0M5 12a12 12 0 0 1 12-1M9 16a5 5 0 0 1 6 0M12 20h.1',
  wap:'M3 6a17 17 0 0 1 18 0M6 10a11 11 0 0 1 12 0M9 14a5 5 0 0 1 6 0M4 20h16M12 18v2',
  intercom:'M6 2h12v20H6zM9 6h6M9 10h6M9 14h6M12 18h.1',
  switch:'M3 7h18v12H3zM6 11v4M10 11v4M14 11v4M18 11v4',
  access:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6L12 2zm-4 10 3 3 5-6',
  fiber:'M4 3v6c0 5 16 1 16 7v5M8 3v5c0 2 8 0 8 6v7M2 3h8M14 21h8',
  gallery:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.1', flash:'M13 2 5 14h6l-1 8 9-13h-6l0-7',
  edit:'m14 5 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5z',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  location:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  settings:'M4 7h16M4 17h16M9 4v6M15 14v6',
};
export function Icon({ name, size=22, color=colors.ink }: {name:IconName;size?:number;color?:string}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {name==='capture'||name==='camera' ? <><Path d="M3 7h4l2-3h6l2 3h4v14H3z"/><Circle cx="12" cy="13" r="4"/></> : <Path d={paths[name]}/>}
  </Svg>;
}
export function deviceIcon(type:string):IconName {
  if(/wap|wireless/i.test(type))return 'wap'; if(/camera/i.test(type))return 'camera';
  if(/intercom/i.test(type))return 'intercom'; if(/switch/i.test(type))return 'switch';
  if(/access/i.test(type))return 'access'; return 'fiber';
}
