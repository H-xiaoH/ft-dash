import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zhCN from './locales/zh-CN'

export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function detectLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'en'
  for (const candidate of navigator.languages ?? [navigator.language]) {
    if (!candidate) continue
    if (candidate.toLowerCase().startsWith('zh')) {
      return candidate.toLowerCase().includes('tw') || candidate.toLowerCase().includes('hk')
        ? 'zh-CN'
        : 'zh-CN'
    }
    if (candidate.toLowerCase().startsWith('en')) return 'en'
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    en,
  },
  // Surface missing translations while developing; stay quiet in production.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})

export const LOCALE_LABELS: Record<AppLocale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
}
