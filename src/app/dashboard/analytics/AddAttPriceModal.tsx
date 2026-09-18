'use client'

import { useState, useTransition } from 'react'
import { addAttClosingPrice, updateAttClosingPrice, type AttClosingPrice } from '@/lib/analytics/attPriceActions'

interface Props {
  isOpen: boolean
  onClose: () => void
  initialData?: AttClosingPrice | null
}

export default function AddAttPriceModal({ isOpen, onClose, initialData }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  if (!isOpen) return null

  const isEdit = !!initialData?.id

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = isEdit 
        ? await updateAttClosingPrice(initialData.id, formData)
        : await addAttClosingPrice(formData)

      if (res.error) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px',
        width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit AT&T Closing Price Log' : 'Add AT&T Closing Price Log'}
          </h3>
          <button 
            onClick={onClose} 
            type="button" 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', padding: 0 }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model *</label>
              <input 
                name="model"
                type="text" 
                required 
                placeholder="e.g. iPhone 15 Pro" 
                defaultValue={initialData?.model || ''}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Storage *</label>
              <input 
                name="storage"
                type="text" 
                required 
                placeholder="e.g. 128GB" 
                defaultValue={initialData?.storage || ''}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Grade *</label>
              <input 
                name="grade"
                type="text" 
                required 
                placeholder="e.g. CT, B+, E_YYN" 
                defaultValue={initialData?.grade || ''}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Carrier</label>
              <input 
                name="carrier"
                type="text" 
                placeholder="e.g. Unlocked, ATT" 
                defaultValue={initialData?.carrier || 'Unlocked'}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Closing Price ($) *</label>
              <input 
                name="closing_price"
                type="number" 
                step="0.01"
                required 
                placeholder="0.00" 
                defaultValue={initialData?.closing_price || ''}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Auction Date *</label>
              <input 
                name="auction_date"
                type="date" 
                required 
                defaultValue={initialData?.auction_date || new Date().toISOString().split('T')[0]}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Quantity</label>
              <input 
                name="quantity"
                type="number" 
                min="1"
                defaultValue={initialData?.quantity || 1}
                className="form-input" 
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notes / Auction Ref (Optional)</label>
            <textarea 
              name="notes"
              rows={2}
              placeholder="e.g. ATT Bid Board Batch #4412" 
              defaultValue={initialData?.notes || ''}
              className="form-input" 
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isPending}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isPending}
              className="btn-primary"
              style={{ background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
            >
              {isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Record')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
