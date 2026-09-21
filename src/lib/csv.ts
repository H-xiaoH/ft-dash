/** Minimal CSV serialiser: RFC 4180 quoting, no dependency. */

export type CsvValue = string | number | boolean | null | undefined

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(rows: CsvValue[][], lineEnding = '\n'): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join(lineEnding)
}

/** Triggers a client-side download; used for the trade export. */
export function downloadCsv(filename: string, rows: CsvValue[][]) {
  const csv = toCsv(rows)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
