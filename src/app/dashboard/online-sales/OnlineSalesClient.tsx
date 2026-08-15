'use client'

import { useState, useTransition, useRef } from 'react'
import PaginationBar from '@/components/PaginationBar'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createOnlineOrder, bulkCreateOnlineOrders, bulkFulfillAndShipOrders, assignImeiToOrderItem, deleteOnlineOrder } from '@/lib/online-sales/actions'
import { useRole } from '@/components/RoleProvider'
import { exportToExcel } from '@/lib/utils/exportExcel'

interface Props {
  platform: 'AMAZON' | 'REVIBE'
  initialOrders: any[]
  readyItems: any[]
  ordersTotal?: number
  ordersPage?: number
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

import { useQuery } from '@tanstack/react-query'
import { getOnlineOrders } from '@/lib/online-sales/actions'

export default function OnlineSalesClient({ platform, initialOrders, readyItems, ordersTotal = 0, ordersPage = 0 }: Props) {
  const { data: ordersResult } = useQuery({
    queryKey: ['online-orders', platform, ordersPage],
    queryFn: () => getOnlineOrders(platform, ordersPage),
    initialData: { data: initialOrders, total: ordersTotal },
    staleTime: 15 * 1000,
  })

  const currentOrders = ordersResult?.data || initialOrders
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showFulfillModal, setShowFulfillModal] = useState(false)
  const [bulkAssignments, setBulkAssignments] = useState<{orderId: string, orderNumber: string, orderItemId: string, skuDetails: string, needed: number, imeis: string[]}[]>([])

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
  const filtered = currentOrders.filter(o => {
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

  const handleDownloadTemplate = () => {
    const data = [{
      'Order Number': platform === 'AMAZON' ? 'AMZ-2026-0001' : 'RVB-2026-0001',
      'Customer Name': 'John Doe',
      'Customer Email': 'john@example.com',
      'Sale Date': new Date().toISOString().split('T')[0],
      'Model': 'Apple iPhone 13 Pro',
      'Storage': '128GB',
      'Color': 'Graphite',
      'Grade': 'Grade A',
      'Quantity': 1,
      'Unit Price': 500,
      'IMEIs': '351234567890123, 351234567890124'
    }]

    const worksheet = XLSX.utils.json_to_sheet(data)
    worksheet['!cols'] = [
      { wch: 18 }, // Order Number
      { wch: 20 }, // Customer Name
      { wch: 25 }, // Customer Email
      { wch: 15 }, // Sale Date
      { wch: 20 }, // Model
      { wch: 15 }, // Storage
      { wch: 15 }, // Color
      { wch: 15 }, // Grade
      { wch: 10 }, // Quantity
      { wch: 15 }, // Unit Price
      { wch: 30 }, // IMEIs
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders')
    XLSX.writeFile(workbook, 'online_orders_template.xlsx')
  }

  const handleOpenBulkFulfill = () => {
    const assignments: typeof bulkAssignments = []
    for (const orderId of Array.from(selectedOrders)) {
      const order = currentOrders.find(o => o.id === orderId)
      if (!order) continue
      for (const item of order.items) {
        if (!item.inventory_items || item.inventory_items.length < item.quantity) {
          assignments.push({
            orderId: order.id,
            orderNumber: order.order_number,
            orderItemId: item.id,
            skuDetails: `${item.model} ${item.storage} ${item.grade}`,
            needed: item.quantity - (item.inventory_items?.length || 0),
            imeis: Array(item.quantity - (item.inventory_items?.length || 0)).fill('')
          })
        }
      }
    }
    
    if (assignments.length === 0) {
      alert("All selected orders are already fully assigned!")
      return
    }
    setBulkAssignments(assignments)
    setShowFulfillModal(true)
  }

  const handleSubmitBulkFulfill = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      try {
        const result = await bulkFulfillAndShipOrders(platform, bulkAssignments)
        if (result.success) {
          setShowFulfillModal(false)
          setSelectedOrders(new Set())
        }
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const handleQuickAssignImei = async (orderId: string, orderItemId: string, val: string) => {
    if (!val.trim()) return
    const match = readyItems.find(r => r.imei === val.trim() || r.serial_number === val.trim())
    if (!match) return // Ignore if they haven't typed a full, valid match yet

    startTransition(async () => {
      try {
        const result = await assignImeiToOrderItem(orderId, orderItemId, val.trim(), platform)
        if (!result.success) {
          alert(result.error)
        }
      } catch (err: any) {
        alert(err.message)
      }
    })
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order? All assigned inventory will be unlinked.')) return
    startTransition(async () => {
      try {
        const result = await deleteOnlineOrder(orderId, platform)
        if (!result.success) {
          alert(result.error)
        }
      } catch (err: any) {
        alert(err.message)
      }
    })
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedOrders.size} orders? All assigned inventory will be unlinked.`)) return
    startTransition(async () => {
      try {
        for (const orderId of Array.from(selectedOrders)) {
          await deleteOnlineOrder(orderId, platform)
        }
        setSelectedOrders(new Set())
      } catch (err: any) {
        alert(err.message)
      }
    })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    startTransition(async () => {
      const reader = new FileReader()
      reader.onload = async (evt) => {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[worksheetName]
        const json = XLSX.utils.sheet_to_json(worksheet) as any[]
        
        if (json.length > 0) {
          const plainJson = JSON.parse(JSON.stringify(json))
          await bulkCreateOnlineOrders(platform, plainJson)
        }
        
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      reader.readAsArrayBuffer(file)
    })
  }

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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className="btn-ghost" 
            onClick={() => {
              const headers = ['Order Number', 'Platform', 'Customer Name', 'Order Date', 'Total Amount ($)', 'Status', 'Fulfillment Date', 'Notes']
              const rows = currentOrders.map(o => [
                o.order_number,
                o.platform || platform,
                o.customer_name || '',
                o.order_date || '',
                o.total_amount || 0,
                o.status || '',
                o.fulfillment_date || '',
                o.notes || ''
              ])
              exportToExcel(`mobitech_${platform.toLowerCase()}_orders_export`, headers, rows)
            }} 
            style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
          >
            📊 Export to Excel
          </button>
          <button className="btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={handleDownloadTemplate}>
            Download Template
          </button>
          {selectedOrders.size > 0 && (
            <>
              <button className="btn-primary" onClick={handleOpenBulkFulfill}>
                Bulk Fulfill & Ship ({selectedOrders.size})
              </button>
              <button className="btn-ghost" style={{ border: '1px solid var(--status-red)', color: 'var(--status-red)' }} onClick={handleBulkDelete}>
                Delete Selected
              </button>
            </>
          )}
          <input type="file" accept=".xlsx, .xls" style={{display: 'none'}} ref={fileInputRef} onChange={handleImportExcel} />
          <button className="btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => fileInputRef.current?.click()} disabled={isPending}>
            {isPending ? 'Uploading...' : 'Upload Bulk Orders'}
          </button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New Online Order
          </button>
        </div>
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
              <th style={{ width: '40px' }}>
                <input type="checkbox" onChange={e => {
                  if (e.target.checked) setSelectedOrders(new Set(filtered.filter(o => o.status !== 'SHIPPED' && o.status !== 'DELIVERED').map(o => o.id)))
                  else setSelectedOrders(new Set())
                }} checked={filtered.length > 0 && selectedOrders.size === filtered.filter(o => o.status !== 'SHIPPED' && o.status !== 'DELIVERED').length} />
              </th>
              <th>Order Number</th>
              <th>Customer</th>
              <th>Sale Date</th>
              <th>SKU Details</th>
              <th style={{ width: '200px' }}>Serials/IMEIs</th>
              <th style={{ width: '120px' }}>Status</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Total Amount</th>
              <th style={{ width: '60px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
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
                      <input 
                        type="checkbox" 
                        disabled={order.status === 'SHIPPED' || order.status === 'DELIVERED'}
                        checked={selectedOrders.has(order.id)}
                        onChange={e => {
                          const newSet = new Set(selectedOrders)
                          if (e.target.checked) newSet.add(order.id)
                          else newSet.delete(order.id)
                          setSelectedOrders(newSet)
                        }}
                      />
                    </td>
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
                      {!isFullyAssigned && order.status !== 'SHIPPED' && order.status !== 'DELIVERED' && order.items?.map((it: any) => {
                        const itAssigned = it.inventory_items?.length || 0
                        if (itAssigned >= (it.quantity || 1)) return null
                        return (
                          <div key={it.id} style={{ marginTop: '6px' }}>
                            <input 
                              type="text" 
                              list="ready-items-list" 
                              className="form-input" 
                              style={{ padding: '2px 6px', fontSize: '11px', height: '22px' }}
                              placeholder={`Assign ${it.model}...`}
                              onChange={e => handleQuickAssignImei(order.id, it.id, e.target.value)} 
                            />
                          </div>
                        )
                      })}
                    </td>
                    <td>
                      <span className={`status-badge ${order.status === 'SHIPPED' ? 'badge-green' : order.status === 'DELIVERED' ? 'badge-blue' : order.status === 'PAID_OUT' ? 'badge-purple' : 'badge-amber'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(order.total_amount)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn-ghost" 
                        style={{ padding: '4px 8px', color: 'var(--status-red)' }} 
                        onClick={() => handleDeleteOrder(order.id)}
                      >
                        🗑️
                      </button>
                    </td>
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
                </div>                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                  {skus.map((sku, index) => (
                    <div key={index} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', position: 'relative' }}>
                      {skus.length > 1 && (
                        <button 
                          type="button" 
                          style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '16px' }}
                          onClick={() => removeSkuRow(index)}
                        >×</button>
                      )}
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Model *</label>
                          <input type="text" className="form-input" required placeholder="e.g. iPhone 13" value={sku.model} onChange={e => updateSku(index, 'model', e.target.value)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Storage</label>
                          <input type="text" className="form-input" placeholder="e.g. 128GB" value={sku.storage} onChange={e => updateSku(index, 'storage', e.target.value)} />
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Grade</label>
                          <input type="text" className="form-input" placeholder="e.g. Excellent" value={sku.grade} onChange={e => updateSku(index, 'grade', e.target.value)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Color</label>
                          <input type="text" className="form-input" placeholder="e.g. Midnight" value={sku.color} onChange={e => updateSku(index, 'color', e.target.value)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Carrier</label>
                          <input type="text" className="form-input" placeholder="e.g. Unlocked" value={sku.carrier} onChange={e => updateSku(index, 'carrier', e.target.value)} />
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Quantity *</label>
                          <input type="number" className="form-input" required min="1" value={sku.quantity} onChange={e => updateSku(index, 'quantity', parseInt(e.target.value) || 1)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '12px' }}>Unit Price *</label>
                          <input type="number" className="form-input" required min="0" step="0.01" value={sku.unit_price || ''} onChange={e => updateSku(index, 'unit_price', parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
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
      {/* Bulk Fulfill Modal */}
      {showFulfillModal && (
        <div className="modal-overlay" onClick={(e: any) => { if(e.target === e.currentTarget) setShowFulfillModal(false) }}>
          <div className="modal-box" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Bulk Fulfill & Ship</h2>
              <button className="modal-close" onClick={() => setShowFulfillModal(false)}>×</button>
            </div>
            
            {error && (
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-red)', borderBottom: '1px solid var(--border)' }}>
                {error}
              </div>
            )}

            <form className="modal-form" onSubmit={handleSubmitBulkFulfill}>
              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '12px' }}>
                {bulkAssignments.map((assignment, i) => (
                  <div key={i} style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                      Order: {assignment.orderNumber}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      Item: {assignment.skuDetails}
                    </div>
                    
                    {assignment.imeis.map((imei, j) => (
                      <div key={j} className="form-group" style={{ marginBottom: '8px' }}>
                        <label className="form-label" style={{ fontSize: '12px' }}>Scan/Enter IMEI/Serial {j + 1}</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          list="ready-items-list"
                          placeholder="Scan barcode..."
                          value={imei}
                          onChange={e => {
                            const newAssignments = [...bulkAssignments]
                            newAssignments[i].imeis[j] = e.target.value
                            setBulkAssignments(newAssignments)
                          }}
                          required
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowFulfillModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isPending}>
                  {isPending ? 'Fulfilling...' : 'Fulfill & Ship All'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <datalist id="ready-items-list">
        {readyItems.map(it => (
          <option key={it.id} value={it.imei || it.serial_number || ''}>
            {it.model} ({it.storage} / {it.grade})
          </option>
        ))}
      </datalist>
      <PaginationBar page={ordersPage} pageSize={25} total={ordersTotal} baseUrl={`/dashboard/online-sales/${platform.toLowerCase()}`} />
    </div>
  )
}
