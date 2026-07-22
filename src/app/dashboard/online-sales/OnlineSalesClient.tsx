'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOnlineOrder } from '@/lib/online-sales/actions'
import { useRole } from '@/components/RoleProvider'

interface Props {
  platform: 'AMAZON' | 'REVIBE'
  initialOrders: any[]
  readyItems: any[]
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
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function OnlineSalesClient({ platform, initialOrders, readyItems }: Props) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')

  // Form State
  const [form, setForm] = useState({
    order_number: '',
    customer_name: '',
    customer_email: '',
    sale_date: new Date().toISOString().split('T')[0],
    total_amount: '0'
  })

  const [skus, setSkus] = useState<any[]>([
    { id: '', model: '', storage: '', grade: '', color: '', carrier: '', quantity: 1, unit_price: 0 }
  ])

  const addSkuRow = () => {
    setSkus([...skus, { id: '', model: '', storage: '', grade: '', color: '', carrier: '', quantity: 1, unit_price: 0 }])
  }

  const removeSkuRow = (index: number) => {
    if (skus.length === 1) return
    const updated = skus.filter((_, i) => i !== index)
    setSkus(updated)
    const total = updated.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0)
    setForm(f => ({ ...f, total_amount: total.toString() }))
  }

  const updateSku = (index: number, field: string, val: any) => {
    const updated = [...skus]
    updated[index][field] = val
    setSkus(updated)
    const total = updated.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0)
    setForm(f => ({ ...f, total_amount: total.toString() }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.order_number.trim()) {
      setError('Order number is required')
      return
    }
    const emptyModel = skus.some(s => !s.model.trim())
    if (emptyModel) {
      setError('All SKU items must specify a model')
      return
    }

    setError('')
    startTransition(async () => {
      const fd = new FormData()
      fd.append('order_number', form.order_number)
      fd.append('customer_name', form.customer_name)
      fd.append('customer_email', form.customer_email)
      fd.append('sale_date', form.sale_date)
      fd.append('total_amount', form.total_amount)

      const res = await createOnlineOrder(platform, fd, JSON.stringify(skus))
      if (res.error) {
        setError(res.error)
      } else {
        setShowModal(false)
        setForm({
          order_number: '',
          customer_name: '',
          customer_email: '',
          sale_date: new Date().toISOString().split('T')[0],
          total_amount: '0'
        })
        setSkus([{ id: '', model: '', storage: '', grade: '', color: '', carrier: '', quantity: 1, unit_price: 0 }])
        router.refresh()
      }
    })
  }

  // Filter & Search
  const filtered = initialOrders.filter(o => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const matchOrder = o.order_number?.toLowerCase().includes(q)
    const matchCust = o.customer_name?.toLowerCase().includes(q)
    const matchStatus = o.status?.toLowerCase().includes(q)
    const matchItems = o.items?.some((it: any) => it.model?.toLowerCase().includes(q))
    return matchOrder || matchCust || matchStatus || matchItems
  })

  // Metrics
  const totalOrders = filtered.length
  const totalQtySold = filtered.reduce((sum, o) => {
    const qty = o.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0) || 0
    return sum + qty
  }, 0)
  const totalRevVal = filtered.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  const pendingShipments = filtered.filter(o => o.status === 'PENDING').length

  return (
    <div className="page-root">
      
      {/* Tab Header Navigation */}
      <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button 
          onClick={() => router.push('/dashboard/online-sales/amazon')}
          style={{
            padding: '12px 16px',
            background: 'none',
            border: 'none',
            borderBottom: platform === 'AMAZON' ? '3px solid var(--accent-purple)' : 'none',
            color: platform === 'AMAZON' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '15px'
          }}
        >
          Amazon Sales
        </button>
        <button 
          onClick={() => router.push('/dashboard/online-sales/revibe')}
          style={{
            padding: '12px 16px',
            background: 'none',
            border: 'none',
            borderBottom: platform === 'REVIBE' ? '3px solid var(--accent-purple)' : 'none',
            color: platform === 'REVIBE' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '15px'
          }}
        >
          Revibe Sales
        </button>
      </div>

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{platform === 'AMAZON' ? 'Amazon Orders' : 'Revibe Orders'}</h1>
          <p className="page-subtitle">Track orders, manage SKU details, and scan outbound device IMEIs</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + New Online Order
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="deal-summary-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="deal-summary-card">
          <span className="ds-label">Total Orders</span>
          <span className="ds-value">{totalOrders}</span>
        </div>
        <div className="deal-summary-card ds-card-purple">
          <span className="ds-label">Total Units Sold</span>
          <span className="ds-value ds-purple">{totalQtySold}</span>
        </div>
        <div className="deal-summary-card">
          <span className="ds-label">Total Revenue</span>
          <span className="ds-value" style={{ color: 'var(--accent-green)' }}>{fmt(totalRevVal)}</span>
        </div>
        <div className="deal-summary-card ds-card-red">
          <span className="ds-label">Pending Shipment</span>
          <span className="ds-value ds-red">{pendingShipments}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Search by order #, customer, SKU model..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ maxWidth: '400px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        />
      </div>

      {/* Orders Table */}
      <div className="deals-table-wrap" style={{ marginTop: 0 }}>
        <table className="deals-table">
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Customer</th>
              <th>Sale Date</th>
              <th>SKU Details</th>
              <th>Serials/IMEIs</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No orders found.
                </td>
              </tr>
            ) : (
              filtered.map(order => {
                const assignedCount = order.inventory_items?.length || 0
                const targetQty = order.items?.reduce((s: number, it: any) => s + (it.quantity || 0), 0) || 0
                const isFullyAssigned = assignedCount >= targetQty

                const daysSinceSale = Math.floor((Date.now() - new Date(order.sale_date).getTime()) / (1000 * 60 * 60 * 24))
                const isOverdue = daysSinceSale > 10 && order.status !== 'PAID_OUT'

                return (
                  <tr key={order.id} className="deal-row" style={isOverdue ? { background: 'rgba(239, 68, 68, 0.1)' } : {}}>
                    <td>
                      <a href={`/dashboard/online-sales/${platform.toLowerCase()}/${order.id}`} className="deal-number-link">
                        {order.order_number}
                      </a>
                    </td>
                    <td>
                      <strong>{order.customer_name || 'Generic Customer'}</strong>
                      {order.customer_email && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.customer_email}</div>}
                    </td>
                    <td>
                      <div style={{ color: isOverdue ? 'var(--accent-red)' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal' }}>
                        {fmtD(order.sale_date)}
                      </div>
                      {isOverdue && <div style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 'bold' }}>OVERDUE PAYOUT</div>}
                    </td>
                    <td>
                      {order.items?.map((it: any, i: number) => (
                        <div key={i} style={{ fontSize: '12px' }}>
                          {it.model} {it.storage || ''} {it.grade || ''} &times; {it.quantity}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        color: isFullyAssigned ? 'var(--accent-green)' : 'var(--accent-amber)' 
                      }}>
                        {assignedCount} / {targetQty} Assigned
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${order.status === 'SHIPPED' ? 'badge-green' : order.status === 'DELIVERED' ? 'badge-blue' : order.status === 'PAID_OUT' ? 'badge-purple' : 'badge-amber'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(order.total_amount)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New Order Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: '750px', width: '90%' }}>
            <div className="modal-header">
              <h3>Create Online Order ({platform === 'AMAZON' ? 'Amazon' : 'Revibe'})</h3>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && <div style={{ color: 'var(--status-red)', fontSize: '13px' }}>{error}</div>}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Order Number *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    placeholder={platform === 'AMAZON' ? 'e.g. AMZ-2026-0001' : 'e.g. RVB-2026-0001'}
                    value={form.order_number}
                    onChange={e => setForm({ ...form, order_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Sale Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    required 
                    value={form.sale_date}
                    onChange={e => setForm({ ...form, sale_date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Customer Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="John Doe"
                    value={form.customer_name}
                    onChange={e => setForm({ ...form, customer_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Customer Email</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="john@example.com"
                    value={form.customer_email}
                    onChange={e => setForm({ ...form, customer_email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Order SKU Items</h4>
                  <button type="button" className="btn-ghost" style={{ fontSize: '12px', border: '1px solid var(--border)', padding: '4px 8px' }} onClick={addSkuRow}>
                    + Add SKU Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto', paddingRight: '8px' }}>
                  {skus.map((sku, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                      <select 
                        className="form-input" 
                        required 
                        value={sku.id} 
                        onChange={e => {
                          const item = readyItems.find(it => it.id === e.target.value)
                          if (item) {
                            updateSku(index, 'id', item.id)
                            updateSku(index, 'model', item.model)
                            updateSku(index, 'storage', item.storage || '')
                            updateSku(index, 'grade', item.grade || '')
                            updateSku(index, 'color', item.color || '')
                            updateSku(index, 'carrier', item.carrier || '')
                          }
                        }}
                      >
                        <option value="">Select Ready to Sell Item...</option>
                        {readyItems.map(it => (
                          <option key={it.id} value={it.id}>
                            {it.imei || it.serial_number} - {it.model} ({it.storage} / {it.grade})
                          </option>
                        ))}
                      </select>
                      
                      <input 
                        type="number" 
                        className="form-input" 
                        required 
                        min="0" 
                        step="0.01" 
                        placeholder="Sale Price"
                        value={sku.unit_price || ''} 
                        onChange={e => updateSku(index, 'unit_price', parseFloat(e.target.value) || 0)} 
                      />
                      <button 
                        type="button" 
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '16px' }}
                        onClick={() => removeSkuRow(index)}
                        disabled={skus.length === 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>
                  Total Amount: <span style={{ color: 'var(--accent-green)' }}>{fmt(Number(form.total_amount))}</span>
                </div>
                <div className="modal-footer" style={{ padding: 0 }}>
                  <button type="button" className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={isPending}>
                    {isPending ? 'Saving...' : 'Save Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
