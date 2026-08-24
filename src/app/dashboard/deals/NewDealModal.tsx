'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDeal } from '@/lib/deals/actions'
import {
  SUPPLIERS, PLATFORMS, FUNDING_SOURCES,
  IPHONE_MODELS, STORAGE_OPTIONS, GRADES, ATT_GRADES, ECOATM_GRADES, CARRIERS
} from '@/lib/deals/constants'

interface Props { onClose: () => void }

export default function NewDealModal({ onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Form state
  const [dealNumber, setDealNumber] = useState('')
  const [auctionWonDate, setAuctionWonDate] = useState(() => new Date().toISOString().split('T')[0])
  const [supplier, setSupplier] = useState('ATT')
  const [platform, setPlatform] = useState('BSTOCK')
  
  const [items, setItems] = useState<any[]>([
    { id: crypto.randomUUID(), model: '', storage: '128GB', grade: 'CT', carrier: 'AT&T', color: '', quantity: '', unitCost: '', totalCost: '', repairCost: '0' }
  ])

  const [auctionFeePct, setAuctionFeePct] = useState('2')
  const [otherFees, setOtherFees] = useState('0')
  const [fundingSource, setFundingSource] = useState('AMEX')
  const [amexStatementDate, setAmexStatementDate] = useState(() => {
    // Default to 12th of current month
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth(), 12)
    if (d < now) d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  })
  const [notes, setNotes] = useState('')

  // Live calculations
  const totalCost = items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0)), 0)
  const totalQty = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)
  const auctionFee = (totalCost * (parseFloat(auctionFeePct) || 0)) / 100
  const other = parseFloat(otherFees) || 0
  const totalCommitment = totalCost + auctionFee + other
  const cashback = fundingSource === 'AMEX' ? totalCommitment * 0.02 : 0

  function fmt(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }

  const updateItem = (id: string, field: string, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      
      const updated = { ...item, [field]: value }
      
      if (field === 'totalCost') {
        const tc = parseFloat(value)
        const q = parseInt(updated.quantity)
        if (!isNaN(tc) && q > 0) {
          updated.unitCost = (tc / q).toFixed(6).replace(/\.?0+$/, '')
        } else if (value === '') {
          updated.unitCost = ''
        }
      } else if (field === 'unitCost' || field === 'quantity') {
        const uc = parseFloat(updated.unitCost)
        const q = parseInt(updated.quantity)
        if (!isNaN(uc) && !isNaN(q) && q > 0) {
          updated.totalCost = (uc * q).toFixed(2).replace(/\.?0+$/, '')
        } else if (updated.unitCost === '' || updated.quantity === '') {
          updated.totalCost = ''
        }
      }
      
      return updated
    }))
  }

  const addItem = () => {
    setItems(prev => [...prev, { id: crypto.randomUUID(), model: '', storage: '128GB', grade: 'CT', carrier: 'AT&T', color: '', quantity: '', unitCost: '', totalCost: '', repairCost: '0' }])
  }

  const removeItem = (id: string) => {
    if (items.length === 1) return
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)

    // Append items as JSON
    const mappedItems = items.map(i => ({
      model: i.model,
      storage: i.storage,
      grade: i.grade,
      carrier: i.carrier,
      color: i.color,
      quantity: parseInt(i.quantity) || 0,
      unit_cost: parseFloat(i.unitCost) || 0,
      repair_cost: parseFloat(i.repairCost) || 0
    }))
    fd.append('items_json', JSON.stringify(mappedItems))

    startTransition(async () => {
      const result = await createDeal(fd)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">New Auction Deal</h2>
            <p className="modal-sub">Log a new B-Stock or EcoATM auction win</p>
          </div>
          <button className="modal-close" onClick={onClose} id="close-deal-modal">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Section: Identity & Platform */}
          <div className="form-section">
            <h3 className="form-section-title">📦 Identity & Platform</h3>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Deal Number <span className="form-hint-inline">(optional — auto-generated if blank)</span></label>
                <input name="deal_number" type="text" className="form-input" placeholder="e.g. DL-2026-0001" value={dealNumber} onChange={e => setDealNumber(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Auction Won Date *</label>
                <input name="auction_won_date" type="date" className="form-input" value={auctionWonDate} onChange={e => setAuctionWonDate(e.target.value)} required />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Supplier *</label>
                <select 
                  name="supplier" 
                  className="form-input" 
                  value={supplier} 
                  onChange={e => {
                    const newSupplier = e.target.value
                    setSupplier(newSupplier)
                    if (newSupplier === 'ECOATM') {
                      setPlatform('ECOATM')
                      setAuctionFeePct('0')
                    } else if (newSupplier === 'ATT') {
                      setPlatform('BSTOCK')
                      setAuctionFeePct('2')
                    }
                  }} 
                  required
                >
                  {SUPPLIERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Auction Platform *</label>
                <select 
                  name="auction_platform" 
                  className="form-input" 
                  value={platform} 
                  onChange={e => {
                    const newPlatform = e.target.value
                    setPlatform(newPlatform)
                    if (newPlatform === 'BSTOCK') {
                      setAuctionFeePct('2')
                    } else {
                      setAuctionFeePct('0')
                    }
                  }} 
                  required
                >
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

          </div>

          {/* Section: Product Details / Line Items */}
          <div className="form-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="form-section-title" style={{ marginBottom: 0 }}>📱 Line Items</h3>
              <button type="button" className="btn-ghost" onClick={addItem} style={{ padding: '4px 12px', fontSize: '0.9rem' }}>+ Add Item</button>
            </div>
            
            {items.map((item, index) => (
              <div key={item.id} style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Item {index + 1}</strong>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '0.9rem' }}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Model *</label>
                    <input list={`models-list-${item.id}`} className="form-input" placeholder="e.g. iPhone 13" value={item.model} onChange={e => updateItem(item.id, 'model', e.target.value)} required />
                    <datalist id={`models-list-${item.id}`}>
                      {IPHONE_MODELS.map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Storage</label>
                    <select className="form-input" value={item.storage} onChange={e => updateItem(item.id, 'storage', e.target.value)}>
                      {STORAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Grade</label>
                    <select className="form-input" value={item.grade} onChange={e => updateItem(item.id, 'grade', e.target.value)}>
                      {(supplier === 'ATT' ? ATT_GRADES : supplier === 'ECOATM' ? ECOATM_GRADES : GRADES).map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Carrier</label>
                    <select className="form-input" value={item.carrier} onChange={e => updateItem(item.id, 'carrier', e.target.value)}>
                      {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color</label>
                    <input type="text" className="form-input" placeholder="e.g. Midnight" value={item.color} onChange={e => updateItem(item.id, 'color', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input type="number" min="1" className="form-input" placeholder="100" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Cost (USD)</label>
                    <input type="number" step="any" min="0" className="form-input" placeholder="e.g. 5000.00" value={item.totalCost} onChange={e => updateItem(item.id, 'totalCost', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit Cost (USD) *</label>
                    <input type="number" step="any" min="0" className="form-input" placeholder="100.00" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Est. Repair Cost/Unit (USD)</label>
                    <input type="number" step="any" min="0" className="form-input" placeholder="0.00" value={item.repairCost} onChange={e => updateItem(item.id, 'repairCost', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Section: Pricing */}
          <div className="form-section">
            <h3 className="form-section-title">💰 Fees & Totals</h3>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Auction Fee %</label>
                <input
                  name="auction_fee_pct" type="number" step="0.1" className="form-input"
                  value={auctionFeePct}
                  onChange={e => setAuctionFeePct(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Other Fees (USD)</label>
                <input
                  name="other_fees" type="number" step="0.01" className="form-input"
                  value={otherFees}
                  onChange={e => setOtherFees(e.target.value)}
                />
              </div>
            </div>

            {/* Live Cost Calculator */}
            <div className="cost-calculator">
              <div className="calc-row">
                <span>Winning Bid Total</span>
                <span>{fmt(totalCost)}</span>
              </div>
              <div className="calc-row">
                <span>{parseFloat(auctionFeePct) === 0 ? 'Auction Fee (Included in Unit Cost)' : `Auction Fee (${auctionFeePct}%)`}</span>
                <span className="calc-neg">{parseFloat(auctionFeePct) === 0 ? '$0.00' : `+ ${fmt(auctionFee)}`}</span>
              </div>
              {other > 0 && (
                <div className="calc-row">
                  <span>Other Fees</span>
                  <span className="calc-neg">+ {fmt(other)}</span>
                </div>
              )}
              <div className="calc-row calc-total">
                <span>Total Commitment</span>
                <span>{fmt(totalCommitment)}</span>
              </div>
              {fundingSource === 'AMEX' && cashback > 0 && (
                <div className="calc-row calc-cashback" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border)' }}>
                  <span>Amex Cashback Profit <br/><small style={{opacity: 0.7, fontSize: '0.8rem'}}>(If paid before cutoff)</small></span>
                  <span>{fmt(cashback)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Funding */}
          <div className="form-section">
            <h3 className="form-section-title">💳 Funding Source</h3>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Funding Source *</label>
                <select name="funding_source" className="form-input" value={fundingSource} onChange={e => setFundingSource(e.target.value)}>
                  {FUNDING_SOURCES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              {fundingSource === 'AMEX' && (
                <div className="form-group">
                  <label className="form-label">Amex Statement Date</label>
                  <input
                    name="amex_statement_date" type="date" className="form-input"
                    value={amexStatementDate}
                    onChange={e => setAmexStatementDate(e.target.value)}
                  />
                  <span className="form-hint">Pay before this date to earn 2% cashback ({fmt(cashback)})</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea name="notes" className="form-input form-textarea" placeholder="Any additional notes..." rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && (
            <div className="login-error">⚠ {error}</div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isPending} id="submit-deal-btn">
              {isPending ? 'Creating Deal...' : '+ Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
