export const colors = {
  ink: '#17243B',
  muted: '#667085',
  line: '#E6E9EF',
  surface: '#FFFFFF',
  background: '#F8F9FC',
  editorBackground: '#EEF0F4',
  paperBorder: '#DADDE4',
  blue: '#3959DB',
  blueDark: '#2E4BC4',
  blueSoft: '#EEF1FF',
  teal: '#168A82',
  tealSoft: '#E8F8F5',
  coral: '#E85F51',
  coralSoft: '#FFF0ED',
  black: '#000000',
  blueStrong: '#1D4ED8',
  greenStrong: '#15803D',
  danger: '#D92D20',
  dangerSoft: '#FEF3F2',
  cropBackground: '#111827',
  cropStage: '#0C1321',
  cropInstruction: '#D5DAE4',
  overlay: 'rgba(13, 20, 34, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#1E2944',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  paper: {
    shadowColor: '#18243A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 6,
  },
} as const;
