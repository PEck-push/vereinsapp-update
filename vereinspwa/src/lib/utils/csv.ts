/**
 * Exports data as a CSV file download in the browser.
 * No backend required – uses Blob + URL.createObjectURL.
 */
export function exportCSV(
  rows: Record<string, string | number>[],
  filename: string
): void {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const escape = (v: string | number) => {
    const s = String(v)
    // Escape quotes and wrap if contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h] ?? '')).join(',')),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function formatCSVDate(date: Date): string {
  return date.toLocaleDateString('de-AT')
}
