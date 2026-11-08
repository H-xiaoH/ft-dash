import { createVuetify } from 'vuetify'
import { md3 } from 'vuetify/blueprints'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en, zhHans } from 'vuetify/locale'

export const vuetify = createVuetify({
  blueprint: md3,
  display: {
    mobileBreakpoint: 720,
    thresholds: { xs: 0, sm: 640, md: 720, lg: 1100, xl: 1600, xxl: 1920 },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  locale: { locale: 'zhHans', fallback: 'en', messages: { en, zhHans } },
  theme: {
    defaultTheme: 'ftDark',
    themes: {
      ftDark: {
        dark: true,
        colors: {
          primary: '#D0BCFF',
          'on-primary': '#381E72',
          secondary: '#CCC2DC',
          background: '#141218',
          surface: '#1D1B20',
          'surface-variant': '#49454F',
          'on-surface': '#E6E0E9',
          'on-background': '#E6E0E9',
          error: '#F2B8B5',
          'on-error': '#601410',
          success: '#81D5AA',
          warning: '#F4BE77',
          info: '#AAC7FF',
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'tonal', size: 'default', density: 'comfortable', height: 36 },
    VBtnGroup: { size: 'default' },
    VBtnToggle: { size: 'default' },
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: true },
    VSwitch: { color: 'primary', inset: true, hideDetails: true, density: 'compact' },
    VCard: { rounded: 'lg', elevation: 0 },
    VList: { density: 'compact' },
    VListSubheader: { color: 'on-surface' },
    VTable: { density: 'compact' },
  },
})
