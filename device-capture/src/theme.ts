export type Status = 'Synced'|'Syncing'|'Pending'|'Failed'|'Offline';
export const colors = {
  blue: '#20313B', green: '#29B381', ink: '#20313B', muted: '#52636F',
  paper: '#EDF3F5', white: '#FFFFFF', line: '#CEDBE2', mint: '#E0F4EA',
  success: '#146342', danger: '#AA302A', dangerSoft: '#FFF0EC',
  warning: '#7A4B0A', warningSoft: '#FFF4DA', offline: '#536477',
};
export const design = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius: { small: 8, field: 10, card: 16, pill: 30 },
  type: { caption: 12, small: 13, body: 15, title: 22, hero: 30 },
  touch: 48, button: 52, icon: 22,
  shadow: { shadowColor: colors.blue, shadowOffset: { width: 0, height: 3 }, shadowOpacity: .06, shadowRadius: 8, elevation: 2 },
};
