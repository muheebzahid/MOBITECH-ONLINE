'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moveSkuToOnlineInventory } from '@/lib/deals/actions'

export default function MoveToOnlineModal({ 
  dealId, 
  dealItemId, 
  modelName, 
  maxQty, 
  totalLandedCost,
  onClose 
}: { 
  dealId: string, 
  dealItemId: string, 
  modelName: string, 
  maxQty: number, 
  totalLandedCost: number,
  onClose: () => void 
}) {
  const [qty, setQty] = useState(maxQty)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleMove(e: any) {
    e.preventDefault()
    if (qty <= 0 || qty > maxQty) return alert('Invalid quantity')
    
    setLoading(true)
    const res = await moveSkuToOnlineInventory(dealId, dealItemId, modelName, qty, totalLandedCost)
    if (res.error) {
      alert(res.error)
      setLoading(false)
    } else {
      router.refresh()
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={(e: any) => { if(e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{maxWidth: '400px'}}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Move to Online Inventory</h2>
            <div className="modal-sub">Transfer units to the Online Inventory Master Deal</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form className="modal-form" onSubmit={handleMove}>
          <div className="form-group">
            <label className="form-label">SKU / Model</label>
            <input type="text" className="form-input" disabled value={modelName} />
          </div>
          <div className="form-group">
            <label className="form-label">Total Landed Cost per Unit</label>
            <input type="text" className="form-input" disabled value={`$${totalLandedCost.toFixed(3)}`} />
            <div className="form-help">This cost basis will be carried over to online inventory.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity to Move</label>
            <input 
              type="number" 
              className="form-input" 
              min="1" 
              max={maxQty} 
              value={qty} 
              onChange={e => setQty(Number(e.target.value))}
              required
            />
            <div className="form-help">Max available to move: {maxQty}</div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Moving...' : 'Move to Online Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
