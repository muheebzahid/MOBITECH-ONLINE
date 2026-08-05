'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { assignImeiToOrderItem, removeImeiFromOrderItem, updateOnlineOrderStatus, deleteOnlineOrder } from '@/lib/online-sales/actions'
import { useRole } from '@/components/RoleProvider'

interface Props {
  order: any
}

function fmt(n: number) {
  const parts = Number(n || 0).toString().split('.')
  const integerPart = parts[0]
  let decimalPart = parts[1] || ''
  
  if (decimalPart.length < 3) {
    decimalPart = decimalPart.padEnd(3, '0')
  } else {
    decimalPart = decimalPart.substring(0, 3)
  }
  
  const formattedInteger = new Intl.NumberFormat('en-US').format(parseFloat(integerPart))
  return `$${formattedInteger}.${decimalPart}`
}

function fmtD(d: string | null | undefined) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function OnlineOrderDetailClient({ order }: Props) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [imeiInputs, setImeiInputs] = useState<Record<string, string>>({})
  const [imeiErrors, setImeiErrors] = useState<Record<string, string>>({})
  const [statusVal, setStatusVal] = useState(order.status)

  const handleUpdateStatus = () => {
    setError('')
    startTransition(async () => {
      const res = await updateOnlineOrderStatus(order.id, order.platform, statusVal)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this order? All assigned IMEIs will be unlinked.')) return
    setError('')
    startTransition(async () => {
      const res = await deleteOnlineOrder(order.id, order.platform)
      if (res.error) setError(res.error)
      else router.push(`/dashboard/online-sales/${order.platform.toLowerCase()}`)
    })
  }

  const handleAssignImei = (itemId: string) => {
    const text = imeiInputs[itemId] || ''
    if (!text.trim()) return

    setImeiErrors(prev => ({ ...prev, [itemId]: '' }))
    startTransition(async () => {
      const res = await assignImeiToOrderItem(order.id, itemId, text, order.platform)
      if (res.error) {
        setImeiErrors(prev => ({ ...prev, [itemId]: res.error }))
      } else {
        setImeiInputs(prev => ({ ...prev, [itemId]: '' }))
        router.refresh()
      }
    })
  }

  const handleRemoveImei = (itemId: string) => {
    startTransition(async () => {
      const res = await removeImeiFromOrderItem(order.id, itemId, order.platform)
      if (res.error) alert(res.error)
      else router.refresh()
    })
  }

  const platformLabel = order.platform === 'AMAZON' ? 'Amazon Sales' : 'Revibe Sales'
  const backLink = `/dashboard/online-sales/${order.platform.toLowerCase()}`

  return (
    <div className="page-root">
      
      {/* Header */}
      <div className="deal-detail-header">
        <div className="dh-left">
          <a href={backLink} className="dh-back">Back to {platformLabel}</a>
          <div className="dh-title-row">
            <h1 className="dh-title">{order.order_number}</h1>
            <span className={`status-badge ${order.status === 'SHIPPED' ? 'badge-green' : order.status === 'DELIVERED' ? 'badge-blue' : 'badge-amber'}`}>
              {order.status}
            </span>
          </div>
          <p className="dh-sub">
            {order.customer_name || 'Generic Customer'} &middot; Sale Date: {fmtD(order.sale_date)}
          </p>
        </div>
        <div className="dh-actions">
          {role === 'SUPER_ADMIN' && (
            <button className="btn-ghost" style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }} onClick={handleDelete} disabled={isPending}>
              🗑 Delete Order
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-red)', border: '1px solid var(--status-red)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Main Grid */}
      <div className="shipment-body-grid" style={{ gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        
        {/* Left Side: Order details & SKUs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Order Details Card */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Order Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Order ID</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>{order.order_number}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Platform</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: 'var(--accent-purple)' }}>{platformLabel}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Customer Details</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>
                  {order.customer_name || 'Generic Customer'}
                  {order.customer_email && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> ({order.customer_email})</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Order Value</div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--accent-green)' }}>{fmt(order.total_amount)}</div>
              </div>
            </div>
          </div>

          {/* SKU Items List */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Outbound SKU Specifications</h3>
            <div className="deals-table-wrap" style={{ marginTop: 0 }}>
              <table className="deals-table" style={{ border: 'none' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ paddingLeft: 0 }}>Model Specs</th>
                    <th>Storage</th>
                    <th>Grade</th>
                    <th>Color</th>
                    <th>Carrier</th>
                    <th style={{ textAlign: 'right' }}>Qty Ordered</th>
                    <th style={{ textAlign: 'right', paddingRight: 0 }}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{ paddingLeft: 0 }}><strong>{item.model}</strong></td>
                      <td>{item.storage || '—'}</td>
                      <td>{item.grade || '—'}</td>
                      <td>{item.color || '—'}</td>
                      <td>{item.carrier || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', paddingRight: 0, fontWeight: 600 }}>{fmt(item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Side: Status transitions & IMEI assignment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Status Panel */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Update Order Status</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select 
                className="form-input" 
                style={{ flex: 1, fontSize: '13px', padding: '6px 10px' }}
                value={statusVal}
                onChange={e => setStatusVal(e.target.value)}
              >
                <option value="PENDING">PENDING</option>
                <option value="SHIPPED">SHIPPED</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleUpdateStatus} disabled={isPending}>
                Save
              </button>
            </div>
          </div>

          {/* IMEI Assignment for every SKU */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>Assign Device IMEIs</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {order.items?.map((item: any) => {
                const assignedItems = order.inventory_items?.filter((it: any) => it.online_order_item_id === item.id) || []
                const assignedCount = assignedItems.length
                const targetQty = item.quantity
                const isComplete = assignedCount >= targetQty

                return (
                  <div key={item.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        {item.model} {[item.storage, item.grade].filter(Boolean).join(' ')}
                      </span>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 600, 
                        color: isComplete ? 'var(--accent-green)' : 'var(--accent-amber)' 
                      }}>
                        {assignedCount} / {targetQty} Assigned
                      </span>
                    </div>

                    {/* Scan Input */}
                    {!isComplete && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Scan IMEI / Serial..."
                          style={{ fontSize: '12px', padding: '4px 8px', height: 'auto' }}
                          value={imeiInputs[item.id] || ''}
                          onChange={e => setImeiInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAssignImei(item.id) }}
                        />
                        <button 
                          className="btn-primary" 
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          onClick={() => handleAssignImei(item.id)}
                          disabled={isPending}
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {/* Error display */}
                    {imeiErrors[item.id] && (
                      <div style={{ fontSize: '11px', color: 'var(--status-red)', marginBottom: '8px' }}>
                        ⚠️ {imeiErrors[item.id]}
                      </div>
                    )}

                    {/* Assigned List */}
                    {assignedCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        {assignedItems.map((ii: any) => (
                          <div key={ii.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-body)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border)' }}>
                            <Link 
                              href={`/dashboard/inventory?q=${ii.imei || ii.serial_number || ''}`}
                              style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'underline' }}
                            >
                              {ii.imei || ii.serial_number}
                            </Link>
                            <button 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                              onClick={() => handleRemoveImei(ii.id)}
                              disabled={isPending}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}
