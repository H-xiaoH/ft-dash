import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  direction,
  formatCompact,
  formatDateTime,
  formatDay,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRatio,
  formatSignedMoney,
  parseTimestamp,
  type DurationLabels,
  type Numberish,
} from '@/lib/format'

export interface Formatter {
  locale: () => string
  number: (value: Numberish, digits?: number) => string
  compact: (value: Numberish) => string
  money: (value: Numberish, currency?: string, digits?: number) => string
  signedMoney: (value: Numberish, currency?: string, digits?: number) => string
  ratio: (value: Numberish, digits?: number) => string
  percent: (value: Numberish, digits?: number, signed?: boolean) => string
  price: (value: Numberish) => string
  duration: (ms: Numberish) => string
  dateTime: (value: Numberish) => string
  day: (value: Numberish) => string
  toneClass: (value: Numberish) => string
  toneOf: (value: Numberish) => 'good' | 'bad' | 'flat'
  timestamp: (value: Numberish) => number | null
}

/** Locale-bound formatters. Every component formats through this composable. */
export function useFormat(): Formatter {
  const { t, locale } = useI18n()

  const current = computed(() => (locale.value === 'zh-CN' ? 'zh-CN' : 'en'))
  const durationLabels = computed<DurationLabels>(() => ({
    day: t('duration.day'),
    hour: t('duration.hour'),
    minute: t('duration.minute'),
    second: t('duration.second'),
  }))

  return {
    locale: () => current.value,
    number: (value, digits = 2) => formatNumber(value, current.value, digits),
    compact: (value) => formatCompact(value, current.value),
    money: (value, currency = '', digits = 2) => formatMoney(value, currency, current.value, digits),
    signedMoney: (value, currency = '', digits = 2) =>
      formatSignedMoney(value, currency, current.value, digits),
    ratio: (value, digits = 2) => formatRatio(value, current.value, digits),
    percent: (value, digits = 2, signed = false) =>
      formatPercent(value, current.value, digits, '—', signed),
    price: (value) => formatPrice(value, current.value),
    duration: (ms) => formatDuration(ms, durationLabels.value),
    dateTime: (value) => formatDateTime(value, current.value),
    day: (value) => formatDay(value, current.value),
    toneClass: (value) => {
      const dir = direction(value)
      return dir > 0 ? 'u-pos' : dir < 0 ? 'u-neg' : 'u-flat'
    },
    toneOf: (value) => {
      const dir = direction(value)
      return dir > 0 ? 'good' : dir < 0 ? 'bad' : 'flat'
    },
    timestamp: (value) => parseTimestamp(value),
  }
}
