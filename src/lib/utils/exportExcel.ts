import * as XLSX from 'xlsx'

export interface ExcelSheetData {
  name: string
  headers: string[]
  rows: (string | number | boolean | null | undefined)[][]
}

/**
 * Enhanced utility to export structured data directly to Microsoft Excel (.xlsx)
 * Supports both single-sheet (headers + rows) and multi-sheet (ExcelSheetData[]) exports.
 * Automatically formats headers, dates, numbers, and dynamically calculates optimal column widths.
 */
export function exportToExcel(
  filename: string, 
  headersOrSheets: string[] | ExcelSheetData[], 
  rows?: (string | number | boolean | null | undefined)[][],
  defaultSheetName = 'Data'
) {
  const wb = XLSX.utils.book_new()

  if (Array.isArray(headersOrSheets) && headersOrSheets.length > 0 && typeof headersOrSheets[0] === 'object' && 'name' in headersOrSheets[0]) {
    // Multi-sheet mode
    const sheets = headersOrSheets as ExcelSheetData[]
    for (const sheet of sheets) {
      const data = [sheet.headers, ...sheet.rows]
      const ws = XLSX.utils.aoa_to_sheet(data)
      
      // Auto-fit column widths
      const colWidths = sheet.headers.map((h, colIdx) => {
        let maxLen = (h ? String(h).length : 5)
        for (const row of sheet.rows) {
          const val = row[colIdx]
          if (val !== null && val !== undefined) {
            const strLen = String(val).length
            if (strLen > maxLen) maxLen = strLen
          }
        }
        return { wch: Math.min(Math.max(maxLen + 3, 10), 65) }
      })
      ws['!cols'] = colWidths
      
      const cleanName = (sheet.name || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, ' ').substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, cleanName)
    }
  } else {
    // Single sheet mode
    const headers = (headersOrSheets as string[]) || []
    const rowData = rows || []
    const data = [headers, ...rowData]
    const ws = XLSX.utils.aoa_to_sheet(data)
    
    // Auto-fit column widths
    const colWidths = headers.map((h, colIdx) => {
      let maxLen = (h ? String(h).length : 5)
      for (const row of rowData) {
        const val = row[colIdx]
        if (val !== null && val !== undefined) {
          const strLen = String(val).length
          if (strLen > maxLen) maxLen = strLen
        }
      }
      return { wch: Math.min(Math.max(maxLen + 3, 10), 65) }
    })
    ws['!cols'] = colWidths
    
    const cleanName = (defaultSheetName || 'Data').replace(/[:\\\/\?\*\[\]]/g, ' ').substring(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, cleanName)
  }

  const cleanFilename = filename.endsWith('.xlsx') ? filename.slice(0, -5) : filename
  XLSX.writeFile(wb, `${cleanFilename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
