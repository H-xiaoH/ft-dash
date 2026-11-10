import type { DailyEntry, HistoricBalanceResponse } from './types'

export type ChartPeriod = 'daily' | 'weekly' | 'monthly'
export type PeriodRow = DailyEntry & { equity: number | null }

interface EquitySample {
  time: number
  value: number
}

export function equitySamples(history: HistoricBalanceResponse | null): EquitySample[] {
  if (!history) return []
  const timeIndex = history.columns.indexOf('__date_ts')
  const equityIndex = history.columns.indexOf('total_quote')
  if (timeIndex === -1 || equityIndex === -1) return []
  return history.data
    .flatMap((row) => {
      const time = row[timeIndex]
      const value = row[equityIndex]
      return typeof time === 'number' &&
        typeof value === 'number' &&
        Number.isFinite(time) &&
        Number.isFinite(value) &&
        time >= history.capture_start_ts
        ? [{ time, value }]
        : []
    })
    .sort((a, b) => a.time - b.time)
}

export function periodEquityRows(
  entries: DailyEntry[],
  samples: EquitySample[],
  period: ChartPeriod,
  currentEquity: number | null,
): PeriodRow[] {
  const now = Date.now()
  return entries.map((entry) => {
    const start = Date.parse(`${entry.date}T00:00:00Z`)
    const endDate = new Date(start)
    if (period === 'monthly') endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    else endDate.setUTCDate(endDate.getUTCDate() + (period === 'weekly' ? 7 : 1))
    const end = endDate.getTime()
    const equity =
      start <= now && now < end
        ? currentEquity
        : (samples.findLast((sample) => sample.time >= start && sample.time < end)?.value ?? null)
    return { ...entry, equity }
  })
}
