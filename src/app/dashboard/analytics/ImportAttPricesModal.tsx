'use client'

import { useState, useTransition, useRef } from 'react'
import * as XLSX from 'xlsx'
import { addAttClosingPricesBulk } from '@/lib/analytics/attPriceActions'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ImportAttPricesModal({ isOpen, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [parsedCount, setParsedCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setParsedCount(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = XLSX.utils.sheet_to_json(ws) as any[]

        if (rawData.length === 0) {
          setError('File is empty.')
          return
        }

        // Map columns flexibly
        const items = rawData.map(row => {
          const model = row['Model'] || row['model'] || row['MODEL'] || ''
          const storage = row['Storage'] || row['storage'] || row['STORAGE'] || row['Capacity'] || ''
          const grade = row['Grade'] || row['grade'] || row['GRADE'] || row['Condition'] || ''
          const carrier = row['Carrier'] || row['carrier'] || row['CARRIER'] || 'Unlocked'
          const closing_price = parseFloat(row['Closing Price'] || row['closing_price'] || row['Price'] || row['price'] || row['Cost'] || 0)
          const auction_date = row['Auction Date'] || row['auction_date'] || row['Date'] || row['date'] || ''
          const quantity = parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 1)
          const notes = row['Notes'] || row['notes'] || row['Note'] || ''

          return {
            model: String(model).trim(),
            storage: String(storage).trim(),
            grade: String(grade).trim(),
            carrier: String(carrier).trim(),
            closing_price,
            auction_date: auction_date ? String(auction_date).trim() : undefined,
            quantity: isNaN(quantity) ? 1 : quantity,
            notes: notes ? String(notes).trim() : undefined
          }
        }).filter(item => item.model && item.storage && item.grade && item.closing_price > 0)

        if (items.length === 0) {
          setError('No valid rows found. File must contain columns: Model, Storage, Grade, Closing Price.')
          return
        }

        setParsedCount(items.length)

        startTransition(async () => {
          const res = await addAttClosingPricesBulk(items)
          if (res.error) {
            setError(res.error)
          } else {
            onClose()
          }
        })

      } catch (err: any) {
        setError('Failed to parse file. Please upload a valid .xlsx, .xls, or .csv file.')
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px',
        width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Import AT&T Closing Prices
          </h3>
          <button 
            onClick={onClose} 
            type="button" 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', padding: 0 }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Upload an Excel (`.xlsx`) or CSV file containing historical AT&T closing price logs.
            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '12px' }}>
              <strong>Expected Headers:</strong> `Model`, `Storage`, `Grade`, `Closing Price` (optional: `Carrier`, `Auction Date`, `Quantity`, `Notes`).
            </div>
          </div>

          <div style={{
            border: '2px dashed var(--border)', borderRadius: '8px', padding: '28px 16px', textAlign: 'center',
            background: 'var(--bg)', cursor: 'pointer'
          }} onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isPending ? `Importing ${parsedCount || ''} records...` : 'Click to choose file (.xlsx / .csv)'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isPending}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
