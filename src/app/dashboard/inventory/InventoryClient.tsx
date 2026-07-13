'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INVENTORY_LOCATIONS, INVENTORY_STATUSES, type InventoryLocation, type InventoryStatus } from '@/lib/inventory/constants'
import { updateInventoryLocation } from '@/lib/inventory/actions'
import { useRole } from '@/components/RoleProvider'

function fmtS(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0) }

export default function InventoryClient({ inventory }: { inventory: any[] }) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('ALL')
  
  const [editingLocation, setEditingLocation] = useState<string | null>(null)
  
  const handleLocationChange = (itemId: string, newLocation: string) => {
    startTransition(async () => {
      await updateInventoryLocation(itemId, newLocation)
      setEditingLocation(null)
    })
  }

  const filtered = inventory.filter(item => {
    if (locationFilter !== 'ALL' && item.location !== locationFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      if (!item.imei?.toLowerCase().includes(term) && !item.model?.toLowerCase().includes(term) && !item.deals?.deal_number?.toLowerCase().includes(term)) {
        return false
      }
    }
    return true
  })

  // Summary Metrics
  const totalUnits = inventory.filter(i => i.status !== 'SOLD' && i.status !== 'RETURNED').length
  const totalValue = inventory.filter(i => i.status !== 'SOLD' && i.status !== 'RETURNED').reduce((sum, i) => sum + i.total_cost, 0)
  
  const fbaUnits = inventory.filter(i => i.location === 'AMAZON_FBA' && i.status !== 'SOLD').length
  const dubaiUnits = inventory.filter(i => i.location === 'DUBAI_WAREHOUSE' && i.status !== 'SOLD').length

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory & IMEIs</h1>
          <p className="page-subtitle">Track individual units, locations, and costs</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="log-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">Total Units</span>
          <span className="log-sum-value">{totalUnits}</span>
          <span className="log-sum-sub">In stock across all locations</span>
        </div>
        {role !== 'SALES' && (
          <div className="log-sum-card log-sum-green">
            <span className="log-sum-label">Inventory Value</span>
            <span className="log-sum-value">{fmtS(totalValue)}</span>
            <span className="log-sum-sub">Total cost basis</span>
          </div>
        )}
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Dubai Warehouse</span>
          <span className="log-sum-value">{dubaiUnits}</span>
          <span className="log-sum-sub">Units physically present</span>
        </div>
        <div className="log-sum-card log-sum-indigo">
          <span className="log-sum-label">Amazon FBA</span>
          <span className="log-sum-value">{fbaUnits}</span>
          <span className="log-sum-sub">Units at Amazon</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
        <input 
          type="text" 
          className="form-input" 
          style={{ maxWidth: '300px' }}
          placeholder="Search IMEI, model, or deal..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
        />
        <select className="form-input" style={{ maxWidth: '200px' }} value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
          <option value="ALL">All Locations</option>
          {Object.entries(INVENTORY_LOCATIONS).map(([k,v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Inventory Table */}
      <div className="deals-table-wrap" style={{ marginTop: '20px' }}>
        <table className="deals-table">
          <thead>
            <tr>
              <th>IMEI / Serial</th>
              <th>Model & Specs</th>
              <th>Origin Deal</th>
              <th>Location</th>
              <th>Status</th>
              {role !== 'SALES' && <th style={{textAlign:'right'}}>Unit Cost</th>}
              <th style={{textAlign:'right'}}>Target Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{textAlign:'center', padding:'30px', color:'var(--text-muted)'}}>No items found.</td></tr>
            )}
            {filtered.map(item => {
              const loc = INVENTORY_LOCATIONS[item.location as InventoryLocation]
              const st = INVENTORY_STATUSES[item.status as InventoryStatus]
              return (
                <tr key={item.id} className="deal-row">
                  <td>
                    <div style={{fontWeight:600}}>{item.imei || item.serial_number || 'N/A'}</div>
                  </td>
                  <td>
                    <div><strong>{item.model}</strong></div>
                    <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{item.storage} &middot; {item.color} &middot; Grade {item.grade}</div>
                  </td>
                  <td>
                    {role === 'SALES' ? (
                      <span className="deal-number-link">{item.deals?.deal_number}</span>
                    ) : (
                      <a href={`/dashboard/deals/${item.deal_id}`} className="deal-number-link">{item.deals?.deal_number}</a>
                    )}
                  </td>
                  <td>
                    {editingLocation === item.id ? (
                      <select 
                        className="form-input" 
                        style={{ padding:'4px 8px', fontSize:'12px', width:'140px' }}
                        defaultValue={item.location}
                        onChange={e => handleLocationChange(item.id, e.target.value)}
                        onBlur={() => setEditingLocation(null)}
                        autoFocus
                        disabled={isPending}
                      >
                        {Object.entries(INVENTORY_LOCATIONS).map(([k,v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <span className={`status-badge ${loc?.color||''}`}>{loc?.label}</span>
                        {role !== 'SALES' && (
                          <button className="btn-ghost" style={{padding:'2px 4px', fontSize:'10px'}} onClick={() => setEditingLocation(item.id)}>✎</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td><span className={`status-badge ${st?.color||''}`}>{st?.label}</span></td>
                  
                  {role !== 'SALES' && (
                    <td className="deal-amount" style={{textAlign:'right'}}>
                      {fmtS(item.total_cost)}
                      {item.logistics_cost > 0 && <div style={{fontSize:'10px', color:'var(--text-muted)'}}>includes +{fmtS(item.logistics_cost)} ship</div>}
                    </td>
                  )}
                  
                  <td className="deal-amount" style={{textAlign:'right', color: 'var(--accent-green)'}}>
                    {fmtS(item.target_price || 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
