/**
 * Utility helper to export structured table data directly to Microsoft Excel (.csv)
 * Includes UTF-8 Byte Order Mark (\uFEFF) for seamless Excel formatting.
 */
export function exportToExcel(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return '""'
        const str = String(cell).replace(/"/g, '""')
        return `"${str}"`
      }).join(',')
    )
  ].join('\r\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
