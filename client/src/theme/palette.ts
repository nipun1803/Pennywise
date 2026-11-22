// Sampled from the design screenshots (dark values from the undimmed captures).
export const palette = {
  light: { background: '#FAFAFC', surface: '#FFFFFF', raised: '#F1F0FB', text: '#191B28', muted: '#646672', border: '#E4E3EC', separator: '#ECEBF2', handle: '#D3D2DC', primary: '#595CDF', onPrimary: '#FFFFFF', link: '#504D97', tint: '#EEEDFF', avatar: '#E3DFFF', disabled: '#E9E9EF', onDisabled: '#9A99A6', segment: '#F1F0F7', danger: '#C2415A', dangerTint: '#FCE8EC', positive: '#2F8A68', warning: '#815D12', warningBg: '#FFF4D7', skeleton: '#ECEBF3', shadow: '#1B1A4A', scrim: 'rgba(20, 19, 40, 0.45)' },
  dark: { background: '#151419', surface: '#202126', raised: '#28253A', text: '#F2EFF5', muted: '#A4A2B2', border: '#45424D', separator: '#33313E', handle: '#5B586B', primary: '#695FD9', onPrimary: '#FFFFFF', link: '#A9A0F8', tint: '#28253A', avatar: '#302B49', disabled: '#2E2E38', onDisabled: '#918F9C', segment: '#2A2833', danger: '#FC8696', dangerTint: '#3C2431', positive: '#7CCBB0', warning: '#F3D28B', warningBg: '#3B301B', skeleton: '#2A2833', shadow: '#000000', scrim: 'rgba(0, 0, 0, 0.6)' },
} as const;
export type AppColors = { [K in keyof typeof palette.light]: string };
export const accents = { emerald: '#2F8A68', blue: '#3569B6', amber: '#B4693A', violet: '#595CDF', rose: '#B34870' } as const;
// Soft avatar pairs from the onboarding example rows: [background, foreground] per theme.
export const avatarTones = {
  light: { violet: ['#E3DFFF', '#504D97'], emerald: ['#DDF2EA', '#2F8A68'], amber: ['#FBE9DD', '#A35F33'], blue: ['#DDE8F8', '#3569B6'], rose: ['#F8DFE9', '#A23D63'] },
  dark: { violet: ['#302B49', '#A9A0F8'], emerald: ['#1F3A31', '#7CCBB0'], amber: ['#3A2C24', '#E7B48D'], blue: ['#1F2D45', '#8DB2EC'], rose: ['#3D2330', '#E79AB8'] },
} as const;
export const groupIcons = { people: 'people-outline', airplane: 'airplane-outline', home: 'home-outline', restaurant: 'restaurant-outline', briefcase: 'briefcase-outline', heart: 'heart-outline' } as const;
export const avatarIcons = { leaf: 'leaf-outline', sun: 'sunny-outline', sparkles: 'sparkles-outline', coffee: 'cafe-outline' } as const;
export const fonts = { 400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold' } as const;
