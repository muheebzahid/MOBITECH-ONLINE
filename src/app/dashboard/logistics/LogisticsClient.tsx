'use client'

import { useState, useTransition } from 'react'
import PaginationBar from '@/components/PaginationBar'
import { useRouter } from 'next/navigation'
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_ORDER, CARRIERS, type ShipmentStatus } from '@/lib/logistics/constants'
import { createShipment, updateShipmentHandler } from '@/lib/logistics/actions'
import { useRole } from '@/components/RoleProvider'
import { exportToExcel } from '@/lib/utils/exportExcel'
import { getAuditHistory } from '@/lib/audit/actions'
import AuditHistoryModal from '@/components/audit/AuditHistoryModal'

function fmtS(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0) }
function fmtD(d: string | null | undefined) { if (!d) return '-'; return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) }
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }

interface Props {
  shipments: any[]
  unshippedDeals: any[]
  shipmentsTotal?: number
  shipmentsPage?: number
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getShipments } from '@/lib/logistics/actions'

export default function LogisticsClient({ shipments, unshippedDeals, shipmentsTotal = 0, shipmentsPage = 0 }: Props) {
  const { data: shipmentsResult } = useQuery({
    queryKey: ['shipments', shipmentsPage],
    queryFn: () => getShipments(shipmentsPage),
    initialData: { data: shipments, total: shipmentsTotal },
    staleTime: 30 * 1000,
  })

  const queryClient = useQueryClient()
  const currentShipments = shipmentsResult?.data || shipments
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [handlerOverrides, setHandlerOverrides] = useState<Record<string, string | null>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<string[]>([])
  const [form, setForm] = useState({ carrier: '', awb_number: '', sb_invoice_number: '', sb_fee: '', usa_to_usa_cost: '', usa_to_dxb_cost: '', pickup_ref: '', pickup_date: '', notes: '' })
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  const [showAuditModal, setShowAuditModal] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const handleOpenAudit = async () => {
    const logs = await getAuditHistory('shipments')
    setAuditLogs(logs)
    setShowAuditModal(true)
  }

  // Summary counts
  const inTransit   = currentShipments.filter(s => ['SHIPPED_FROM_USA','IN_TRANSIT'].includes(s.status)).length
  const pending     = currentShipments.filter(s => ['PENDING','AT_SB_TECHNOLOGY'].includes(s.status)).length
  const atDubai     = currentShipments.filter(s => ['ARRIVED_DUBAI','CUSTOMS_CLEARED','AT_TURBO_LOGISTICS'].includes(s.status)).length
  const delivered   = currentShipments.filter(s => s.status === 'DELIVERED_TO_MOBITECH').length
  const totalCost   = currentShipments.reduce((s, sh) => s + (sh.total_logistics_cost || 0), 0)

  const toggleDeal = (id: string) => {
    setSelectedDeals(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  const handleCreate = () => {
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      selectedDeals.forEach(id => fd.append('deal_ids', id))
      if (attachedFiles.length > 0) {
        attachedFiles.forEach(file => {
          fd.append('documents', file)
        })
      }
      const result = await createShipment(fd)
      if (result.error) { setError(result.error); return }
      setShowCreate(false)
      setSelectedDeals([])
      setAttachedFiles([])
      setForm({ carrier: '', awb_number: '', sb_invoice_number: '', sb_fee: '', usa_to_usa_cost: '', usa_to_dxb_cost: '', pickup_ref: '', pickup_date: '', notes: '' })
      router.refresh()
    })
  }

  return (
    <div className="page-root">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Logistics</h1>
          <p className="page-subtitle">Track every shipment from Miami to Mobitech warehouse</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            className="btn-ghost" 
            onClick={handleOpenAudit} 
            style={{ border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}
          >
            📜 History
          </button>
          <button 
            className="btn-ghost" 
            onClick={() => {
              const headers = [
                'Shipment Number', 'Status', 'Carrier', 'AWB / Waybill', 
                'Deals Count', 'Deal Numbers', 'Total Units in Shipment',
                'SB Invoice Number', 'Shipped USA Date', 'Arrived Dubai Date', 'Delivered Date', 
                'SB Fee ($)', 'USA-to-USA Cost ($)', 'USA-to-DXB Cost ($)', 'Total Logistics Cost ($)', 'Notes'
              ]
              const rows = currentShipments.map(s => {
                const dealsList = (s.shipment_deals || []).map((sd: any) => sd.deals?.deal_number).filter(Boolean).join('; ')
                const totalUnits = (s.shipment_deals || []).reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0)
                const dealsCount = (s.shipment_deals || []).length

                return [
                  s.shipment_number,
                  s.status || '',
                  s.carrier || '',
                  s.awb_number || '',
                  dealsCount,
                  dealsList || 'None',
                  totalUnits,
                  s.sb_invoice_number || '',
                  s.shipped_usa_date || '',
                  s.arrived_dubai_date || '',
                  s.delivered_mobitech_date || '',
                  s.sb_fee || 0,
                  s.usa_to_usa_cost || 0,
                  s.usa_to_dxb_cost || 0,
                  s.total_logistics_cost || 0,
                  s.notes || ''
                ]
              })
              exportToExcel('mobitech_logistics_export', headers, rows)
            }} 
            style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
          >
            📊 Export to Excel
          </button>
          {role !== 'FINANCE' && role !== 'VIEW_ONLY' && (
            <button className="btn-primary" onClick={() => setShowCreate(true)} id="new-shipment-btn">
              + New Shipment
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="log-summary-grid">
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">In Transit (USA)</span>
          <span className="log-sum-value">{inTransit}</span>
          <span className="log-sum-sub">Shipped from USA</span>
        </div>
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Pending / At SB</span>
          <span className="log-sum-value">{pending}</span>
          <span className="log-sum-sub">Awaiting shipment</span>
        </div>
        <div className="log-sum-card log-sum-orange">
          <span className="log-sum-label">At Dubai</span>
          <span className="log-sum-value">{atDubai}</span>
          <span className="log-sum-sub">Customs / Turbo</span>
        </div>
        <div className="log-sum-card log-sum-green">
          <span className="log-sum-label">Delivered</span>
          <span className="log-sum-value">{delivered}</span>
          <span className="log-sum-sub">At Mobitech</span>
        </div>
        <div className="log-sum-card log-sum-neutral">
          <span className="log-sum-label">Total Logistics Cost</span>
          <span className="log-sum-value" style={{ fontSize: '20px' }}>{fmtS(totalCost)}</span>
          <span className="log-sum-sub">All shipments combined</span>
        </div>
      </div>

      {/* Shipments Table */}
      {shipments.length === 0 ? (
        <div className="deals-empty">
          <div className="deals-empty-icon">&#9992;</div>
          <h3>No shipments yet</h3>
          <p>Click <strong>+ New Shipment</strong> to log your first shipment from Miami to Dubai.</p>
        </div>
      ) : (
        <div className="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th>Shipment #</th>
                <th>Status</th>
                <th>Deals</th>
                <th>Carrier</th>
                <th>Handler</th>
                <th>AWB / Waybill</th>
                <th>Shipped</th>
                <th>Arrived Dubai</th>
                <th>Delivered</th>
                <th>Logistics Cost</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(sh => {
                const st = SHIPMENT_STATUSES[sh.status as ShipmentStatus]
                const dealCount = (sh.shipment_deals || []).length
                const days = sh.shipped_usa_date ? daysSince(sh.shipped_usa_date) : null
                return (
                  <tr key={sh.id} className="deal-row">
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <a href={`/dashboard/logistics/${sh.id}`} className="deal-number-link">
                          {sh.shipment_number}
                        </a>
                        {sh.awb_number && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {sh.awb_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${st.color}`}>{st.label}</span>
                    </td>
                    <td>
                      <span className="log-deal-count">
                        {dealCount} deal{dealCount !== 1 ? 's' : ''} 
                        {dealCount > 0 && <span style={{color: 'var(--text-muted)', fontWeight: 400}}> ({sh.shipment_deals.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0)} units)</span>}
                      </span>
                    </td>
                    <td className="deal-date">{sh.carrier || '-'}</td>
                    <td>
                      <select 
                        className="form-input" 
                        style={{ padding: '4px 8px', fontSize: '11px', height: 'auto', width: 'auto', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        value={handlerOverrides[sh.id] !== undefined ? (handlerOverrides[sh.id] || '') : (sh.handled_by || '')}
                        onChange={(e) => {
                          const val = e.target.value || null
                          setHandlerOverrides(prev => ({ ...prev, [sh.id]: val }))
                          startTransition(async () => {
                            await updateShipmentHandler(sh.id, val)
                            queryClient.invalidateQueries({ queryKey: ['shipments'] })
                            router.refresh()
                          })
                        }}
                      >
                        <option value="">- Select -</option>
                        <option value="SB Technology">SB Technology</option>
                        <option value="Turbo Logistics">Turbo Logistics</option>
                      </select>
                    </td>
                    <td>
                      {sh.awb_number
                        ? <span className="log-awb">{sh.awb_number}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td className="deal-date">{fmtD(sh.shipped_usa_date)}</td>
                    <td className="deal-date">{fmtD(sh.arrived_dubai_date)}</td>
                    <td className="deal-date">{fmtD(sh.delivered_mobitech_date)}</td>
                    <td className="deal-amount">{fmtS(sh.total_logistics_cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Shipment Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal-box" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">New Shipment</h2>
                <p className="modal-sub">Group deals into a shipment and set initial details</p>
              </div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">

              {/* Deal Selection */}
              <div className="form-group">
                <label className="form-label">Deals in this Shipment</label>
                {unshippedDeals.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>All active deals are already in a shipment.</p>
                ) : (
                  <div className="log-deal-picker">
                    {unshippedDeals.map(deal => (
                      <label key={deal.id} className={`log-deal-option ${selectedDeals.includes(deal.id) ? 'selected' : ''}`}>
                        <input type="checkbox" checked={selectedDeals.includes(deal.id)} onChange={() => toggleDeal(deal.id)} style={{ display: 'none' }} />
                        <div className="ldo-check">{selectedDeals.includes(deal.id) ? '✓' : ''}</div>
                        <div className="ldo-info">
                          <span className="ldo-number">{deal.deal_number}</span>
                          <span className="ldo-model">{deal.model} · {[deal.storage, deal.grade].filter(Boolean).join(' ')}</span>
                        </div>
                        <span className="ldo-qty">{deal.quantity} units</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Shipment Details */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Carrier</label>
                  <select className="form-input" value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}>
                    <option value="">Select carrier...</option>
                    {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">AWB / Waybill Number</label>
                  <input type="text" className="form-input" placeholder="e.g. 176-12345678" value={form.awb_number} onChange={e => setForm(f => ({ ...f, awb_number: e.target.value }))} />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">SB Technology Invoice #</label>
                  <input type="text" className="form-input" placeholder="e.g. SB-2026-001" value={form.sb_invoice_number} onChange={e => setForm(f => ({ ...f, sb_invoice_number: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">SB Technology Fee ($)</label>
                  <input type="number" className="form-input" placeholder="0.00" value={form.sb_fee} onChange={e => setForm(f => ({ ...f, sb_fee: e.target.value }))} />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Pickup Date</label>
                  <input type="date" className="form-input" value={form.pickup_date} onChange={e => setForm(f => ({ ...f, pickup_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Pickup Reference</label>
                  <input type="text" className="form-input" placeholder="e.g. Auction pickup ref" value={form.pickup_ref} onChange={e => setForm(f => ({ ...f, pickup_ref: e.target.value }))} />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">USA to USA Shipping Cost ($)</label>
                  <input type="number" className="form-input" placeholder="0.00" value={form.usa_to_usa_cost} onChange={e => setForm(f => ({ ...f, usa_to_usa_cost: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">USA to DXB Shipping Cost ($)</label>
                  <input type="number" className="form-input" placeholder="0.00" value={form.usa_to_dxb_cost} onChange={e => setForm(f => ({ ...f, usa_to_dxb_cost: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Total Freight Cost: {fmtS((parseFloat(form.usa_to_usa_cost)||0) + (parseFloat(form.usa_to_dxb_cost)||0))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Attach Document or Photo</label>
                <input 
                  type="file" 
                  className="form-input" 
                  accept="image/*,application/pdf"
                  multiple
                  onChange={e => setAttachedFiles(Array.from(e.target.files || []))} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} placeholder="Any additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" disabled={isPending} onClick={handleCreate} id="create-shipment-btn">
                  {isPending ? 'Creating...' : `Create Shipment${selectedDeals.length > 0 ? ` (${selectedDeals.length} deals)` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AuditHistoryModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} logs={auditLogs} title="Logistics Shipments Edit History" />
      <PaginationBar page={shipmentsPage} pageSize={25} total={shipmentsTotal} baseUrl="/dashboard/logistics" />
    </div>
  )
}
