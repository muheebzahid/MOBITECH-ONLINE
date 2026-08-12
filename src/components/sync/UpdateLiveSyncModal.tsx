'use client'

import { useState, useEffect } from 'react'

interface Props {
  dealIds: string[]
  isOpen: boolean
  onClose: () => void
  onAddRequiredDeals?: (newIds: string[]) => void
}

export default function UpdateLiveSyncModal({ dealIds: initialDealIds, isOpen, onClose, onAddRequiredDeals }: Props) {
  const [activeDealIds, setActiveDealIds] = useState<string[]>(initialDealIds)
  const [activeTab, setActiveTab] = useState<'preview' | 'tree' | 'issues' | 'files' | 'result'>('preview')
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [manifest, setManifest] = useState<any>(null)
  const [preflight, setPreflight] = useState<any>(null)
  const [discovery, setDiscovery] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (isOpen) {
      setActiveDealIds(initialDealIds)
    }
  }, [isOpen, initialDealIds])

  useEffect(() => {
    if (isOpen && activeDealIds.length > 0) {
      loadPreview(activeDealIds)
    }
  }, [isOpen, activeDealIds])

  async function loadPreview(ids: string[]) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      // 1. Discover
      const discRes = await fetch('/api/sync/deals/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealIds: ids })
      })
      const discData = await discRes.json()
      if (!discData.success) {
        throw new Error(discData.error || 'Discovery failed')
      }
      setDiscovery(discData)

      // 2. Manifest
      const manRes = await fetch('/api/sync/deals/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealIds: ids })
      })
      const manData = await manRes.json()
      if (!manData.success || !manData.manifest) {
        throw new Error(manData.error || 'Manifest generation failed')
      }
      setManifest(manData.manifest)

      // 3. Preflight
      if (manData.manifest.status !== 'BLOCKED') {
        const pfRes = await fetch('/api/sync/deals/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealIds: ids })
        })
        const pfData = await pfRes.json()
        if (pfData.success) {
          setPreflight(pfData)
        }
      } else {
        setPreflight(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sync package preview')
    } finally {
      setLoading(false)
    }
  }

  async function handleExecuteSync() {
    setExecuting(true)
    setVerifying(true)
    setError(null)
    try {
      const res = await fetch('/api/sync/deals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealIds: activeDealIds })
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Sync execution or cloud verification failed')
      }
      setResult(data)
      setActiveTab('result')
    } catch (err: any) {
      setError(err.message || 'Execution error')
    } finally {
      setExecuting(false)
      setVerifying(false)
    }
  }

  function handleAddSingleDeal(dealIdToAdd: string) {
    if (!dealIdToAdd) return
    const combined = Array.from(new Set([...activeDealIds, dealIdToAdd]))
    setActiveDealIds(combined)
    if (onAddRequiredDeals) {
      onAddRequiredDeals(combined)
    }
  }

  function handleAddMissingDeals() {
    if (!manifest?.required_related_deals) return
    const requiredIds = manifest.required_related_deals.map((d: any) => d.required_deal_id)
    const combined = Array.from(new Set([...activeDealIds, ...requiredIds]))
    setActiveDealIds(combined)
    if (onAddRequiredDeals) {
      onAddRequiredDeals(combined)
    }
  }

  function toggleNode(nodeId: string) {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }))
  }

  function expandAll() {
    const allNodes: Record<string, boolean> = {}
    pkg.deals?.forEach((d: any) => {
      allNodes[d.id] = true
      allNodes[`${d.id}-items`] = true
      allNodes[`${d.id}-shipments`] = true
      allNodes[`${d.id}-invoices`] = true
      allNodes[`${d.id}-inventory`] = true
    })
    setExpandedNodes(allNodes)
  }

  function collapseAll() {
    setExpandedNodes({})
  }

  if (!isOpen) return null

  const pkg = discovery?.package || {}
  const counts = manifest?.counts?.records || {}
  const status = preflight?.status || manifest?.status || 'UNKNOWN'

  // Financial Metrics Calculation
  const totalPurchaseCost = (pkg.deals || []).reduce((sum: number, d: any) => sum + Number(d.total_cost || d.total_amount || 0), 0)
  const totalLogisticsCost = (pkg.shipments || []).reduce((sum: number, s: any) => sum + Number(s.total_logistics_cost || s.freight_cost || 0), 0)
  const totalRevenue = (pkg.invoices || []).reduce((sum: number, i: any) => sum + Number(i.total_amount || 0), 0)
  const totalPayments = (pkg.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
  const outstandingDue = (pkg.invoices || []).reduce((sum: number, i: any) => sum + Number(i.balance_due || 0), 0)
  const inventoryValue = (pkg.inventory_items || []).reduce((sum: number, inv: any) => sum + Number(inv.unit_cost || 0), 0)
  const expectedProfit = totalRevenue - (totalPurchaseCost + totalLogisticsCost)
  const payloadKbs = ((manifest?.estimated_payload_bytes || 0) / 1024).toFixed(1)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1180px',
          maxHeight: '92vh',
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #0f172a, #0b1120)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                ERP Sync Center — Update Live Cloud
              </div>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>
                Master Local ERP ➔ Target Project: <span style={{ color: '#60a5fa', fontWeight: 700 }}>aivcmkwclfipntadipec</span> (https://the-workflows.com)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                backgroundColor:
                  status === 'READY'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : status === 'BLOCKED'
                    ? 'rgba(244, 63, 94, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                color:
                  status === 'READY'
                    ? '#34d399'
                    : status === 'BLOCKED'
                    ? '#fb7185'
                    : '#fbbf24',
                border: `1px solid ${
                  status === 'READY'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : status === 'BLOCKED'
                    ? 'rgba(244, 63, 94, 0.3)'
                    : 'rgba(245, 158, 11, 0.3)'
                }`
              }}
            >
              STATUS: {status}
            </span>
            <button
              onClick={() => {
                onClose()
                if (result?.success) {
                  window.location.reload()
                }
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#94a3b8',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ padding: '0 28px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', display: 'flex', gap: '24px' }}>
          {[
            { id: 'preview', label: `Summary & Metrics (${manifest?.counts?.total_records || 0} Records)` },
            { id: 'tree', label: `Relational Deal Tree (${pkg.deals?.length || 0} Deals)` },
            { id: 'issues', label: `Guided Issues & Checks`, badge: manifest?.issues?.length || 0 },
            { id: 'files', label: `File Assets (${discovery?.file_references?.length || 0})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '14px 0',
                fontSize: '13.5px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#60a5fa' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {tab.label}
              {tab.badge ? (
                <span
                  style={{
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    backgroundColor: '#ef4444',
                    color: '#ffffff'
                  }}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', backgroundColor: '#0b1120' }}>
          {loading && (
            <div style={{ padding: '80px 0', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔄</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Building & Validating Relational Deal Package...</div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Auditing deals, shipments, invoices, payments, inventory &amp; online orders...</div>
            </div>
          )}

          {error && (
            <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '14px', marginBottom: '20px' }}>
              ⚠️ <strong>Error:</strong> {error}
            </div>
          )}

          {/* TAB 1: PREVIEW */}
          {!loading && activeTab === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Top Warning Banner if Blocked */}
              {status === 'BLOCKED' && (
                <div style={{ padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>⚠️ Shared Deal Dependencies Detected</div>
                    <div style={{ fontSize: '12.5px', marginTop: '2px', color: '#fcd34d' }}>
                      The selected deal shares invoices or shipments with {manifest?.required_related_deals?.length || 0} unselected deal(s). Include them to unblock your live update package.
                    </div>
                  </div>
                  <button
                    onClick={handleAddMissingDeals}
                    style={{ padding: '9px 16px', fontSize: '12.5px', fontWeight: 700, backgroundColor: '#f59e0b', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Add All Required Related Deals ⚡
                  </button>
                </div>
              )}

              {/* Package Financial Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Total Package Cost</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>${totalPurchaseCost.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{pkg.deals?.length || 0} Deal(s) + {pkg.shipments?.length || 0} Freight</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Total Billed Revenue</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>${totalRevenue.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{pkg.invoices?.length || 0} Sales Invoice(s)</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Payments Collected</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>${totalPayments.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#fb923c', marginTop: '2px' }}>Due: ${outstandingDue.toLocaleString()}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Projected Net Profit</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: expectedProfit >= 0 ? '#4ade80' : '#f87171', marginTop: '4px' }}>
                    ${expectedProfit.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Est. Payload: {payloadKbs} KB</div>
                </div>
              </div>

              {/* Record Summary Breakdown Grid */}
              <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', padding: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '14px' }}>
                  Relational Record Manifest Summary ({manifest?.counts?.total_records || 0} Total Items)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Deals', val: counts.deals },
                    { label: 'Deal Items', val: counts.deal_items },
                    { label: 'Clients / Accounts', val: counts.clients },
                    { label: 'Shipments', val: counts.shipments },
                    { label: 'Shipment Deals', val: counts.shipment_deals },
                    { label: 'Sales Invoices', val: counts.invoices },
                    { label: 'Invoice Lines', val: counts.invoice_line_items },
                    { label: 'Payments', val: counts.payments },
                    { label: 'Inventory Items', val: counts.inventory_items },
                    { label: 'Shipment Docs', val: counts.shipment_documents },
                    { label: 'Deal Status Logs', val: counts.deal_status_history },
                    { label: 'Deal Edit Logs', val: counts.deal_edit_history },
                    { label: 'Inventory History', val: counts.inventory_history },
                    { label: 'Online Orders', val: counts.online_orders },
                    { label: 'Online Order Items', val: counts.online_order_items }
                  ].map((stat, i) => (
                    <div key={i} style={{ padding: '10px 12px', backgroundColor: '#030712', borderRadius: '10px', border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{stat.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: stat.val > 0 ? '#38bdf8' : '#475569' }}>{stat.val || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TREE */}
          {!loading && activeTab === 'tree' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                  Package Deal Hierarchy &amp; Downstream Relationships
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={expandAll} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer' }}>
                    Expand All
                  </button>
                  <button onClick={collapseAll} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer' }}>
                    Collapse All
                  </button>
                </div>
              </div>

              {(pkg.deals || []).map((deal: any) => {
                const dealOpen = expandedNodes[deal.id] ?? true
                const itemsOpen = expandedNodes[`${deal.id}-items`] ?? true
                const shipsOpen = expandedNodes[`${deal.id}-shipments`] ?? true
                const invsOpen = expandedNodes[`${deal.id}-invoices`] ?? true

                const dealItems = (pkg.deal_items || []).filter((i: any) => i.deal_id === deal.id)
                const shipDeals = (pkg.shipment_deals || []).filter((sd: any) => sd.deal_id === deal.id)
                const shipIds = new Set(shipDeals.map((sd: any) => sd.shipment_id))
                const shipments = (pkg.shipments || []).filter((s: any) => shipIds.has(s.id))
                
                const invLines = (pkg.invoice_line_items || []).filter((il: any) => il.deal_id === deal.id)
                const invIds = new Set(invLines.map((il: any) => il.invoice_id))
                const invoices = (pkg.invoices || []).filter((inv: any) => invIds.has(inv.id))

                return (
                  <div key={deal.id} style={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden' }}>
                    {/* Deal Header Row */}
                    <div style={{ padding: '16px 20px', backgroundColor: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button onClick={() => toggleNode(deal.id)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '14px', cursor: 'pointer' }}>
                          {dealOpen ? '▼' : '►'}
                        </button>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                            Deal #{deal.deal_number} <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>({deal.model})</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            Supplier: {deal.supplier || 'N/A'} | Qty: {deal.quantity} | Total Cost: ${Number(deal.total_cost || deal.total_amount || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={`/dashboard/deals/${deal.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, backgroundColor: '#0f172a', color: '#38bdf8', borderRadius: '8px', textDecoration: 'none', border: '1px solid #334155' }}
                        >
                          Local ↗
                        </a>
                        <a
                          href={`https://the-workflows.com/dashboard/deals/${deal.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, backgroundColor: '#1e293b', color: '#34d399', borderRadius: '8px', textDecoration: 'none', border: '1px solid #334155' }}
                        >
                          Online ERP ↗
                        </a>
                      </div>
                    </div>

                    {/* Deal Sub-Tree */}
                    {dealOpen && (
                      <div style={{ padding: '16px 20px 20px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* 1. Deal Items */}
                        <div style={{ borderLeft: '2px solid #334155', paddingLeft: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                            <button onClick={() => toggleNode(`${deal.id}-items`)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                              {itemsOpen ? '▼' : '►'}
                            </button>
                            📦 Deal Items ({dealItems.length})
                          </div>
                          {itemsOpen && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {dealItems.map((item: any) => (
                                <div key={item.id} style={{ padding: '8px 12px', backgroundColor: '#030712', borderRadius: '8px', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{item.model} {item.storage} {item.grade} {item.color} ({item.quantity} units)</span>
                                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>${Number(item.unit_cost || 0).toLocaleString()} / unit</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Shipments */}
                        <div style={{ borderLeft: '2px solid #334155', paddingLeft: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                            <button onClick={() => toggleNode(`${deal.id}-shipments`)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                              {shipsOpen ? '▼' : '►'}
                            </button>
                            🚢 Linked Shipments ({shipments.length})
                          </div>
                          {shipsOpen && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {shipments.map((ship: any) => (
                                <div key={ship.id} style={{ padding: '10px 14px', backgroundColor: '#030712', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '13px' }}>Shipment #{ship.shipment_number}</div>
                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>Carrier: {ship.carrier || 'N/A'} | AWB: {ship.awb_number || 'N/A'} | Status: {ship.status}</div>
                                  </div>
                                  <a href={`https://the-workflows.com/dashboard/logistics/${ship.id}`} target="_blank" rel="noreferrer" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#1e293b', color: '#38bdf8', borderRadius: '6px', textDecoration: 'none' }}>
                                    Open Online Shipment ↗
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. Invoices */}
                        <div style={{ borderLeft: '2px solid #334155', paddingLeft: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                            <button onClick={() => toggleNode(`${deal.id}-invoices`)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                              {invsOpen ? '▼' : '►'}
                            </button>
                            📄 Linked Invoices ({invoices.length})
                          </div>
                          {invsOpen && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {invoices.map((inv: any) => (
                                <div key={inv.id} style={{ padding: '10px 14px', backgroundColor: '#030712', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '13px' }}>Invoice #{inv.invoice_number}</div>
                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>Amount: ${Number(inv.total_amount || 0).toLocaleString()} | Paid: ${Number(inv.amount_paid || 0).toLocaleString()} | Status: {inv.status}</div>
                                  </div>
                                  <a href={`https://the-workflows.com/dashboard/finance/invoices/${inv.id}`} target="_blank" rel="noreferrer" style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#1e293b', color: '#34d399', borderRadius: '6px', textDecoration: 'none' }}>
                                    Open Online Invoice ↗
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* TAB 3: GUIDED ISSUES & CHECKS */}
          {!loading && activeTab === 'issues' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {manifest?.required_related_deals?.length > 0 && (
                <div
                  style={{
                    padding: '20px 24px',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>⚠️</span> Shared Deal Dependencies Detected
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#fcd34d', marginTop: '4px' }}>
                        The selected deals share shipments or invoices with {manifest.required_related_deals.length} unselected deal(s). Include them to unblock your sync package.
                      </div>
                    </div>

                    <button
                      onClick={handleAddMissingDeals}
                      style={{
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        backgroundColor: '#f59e0b',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                      }}
                    >
                      + Add All Required Related Deals ⚡
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {manifest.required_related_deals.map((req: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddSingleDeal(req.required_deal_id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(245, 158, 11, 0.25)',
                          color: '#fef08a',
                          borderRadius: '8px',
                          border: '1px solid rgba(245, 158, 11, 0.5)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title="Click to add this deal and unblock sync"
                      >
                        <span>+ Add {req.required_deal_number ? `Deal ${req.required_deal_number}` : `Deal ${req.required_deal_id}`} ⚡</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {manifest?.issues?.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>No validation or dependency issues found. Package is clean.</div>
                </div>
              ) : (
                manifest?.issues?.map((issue: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '18px 22px',
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 800,
                            borderRadius: '4px',
                            backgroundColor: issue.severity === 'ERROR' ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)',
                            color: issue.severity === 'ERROR' ? '#fb7185' : '#fbbf24'
                          }}
                        >
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                          {issue.module} ➔ {issue.sourceTable}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#f8fafc', marginTop: '8px', fontSize: '14.5px', lineHeight: 1.4 }}>
                        {issue.reason}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {issue.required_deal_id && (
                        <button
                          onClick={() => handleAddSingleDeal(issue.required_deal_id)}
                          style={{
                            padding: '9px 16px',
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: '#f59e0b',
                            color: '#0f172a',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          + Include Required Deal ⚡
                        </button>
                      )}
                      {issue.referenceId && (
                        <a
                          href={`/dashboard/sales/${issue.referenceId}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: '#1e293b',
                            color: '#38bdf8',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            border: '1px solid #334155'
                          }}
                        >
                          Open {issue.referenceNumber || issue.referenceId} ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: FILES */}
          {!loading && activeTab === 'files' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(discovery?.file_references || []).length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
                  <div style={{ fontSize: '14px' }}>No attached PDF invoice documents or shipment files found in this package.</div>
                </div>
              ) : (
                discovery.file_references.map((file: any, i: number) => (
                  <div key={i} style={{ padding: '14px 18px', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#f8fafc' }}>{file.fileName || file.storagePath}</div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>Type: {file.fileType} | Bucket: {file.bucket} | Entity: {file.entityType}</div>
                    </div>
                    <a href={file.publicUrl} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#1e293b', color: '#38bdf8', borderRadius: '6px', textDecoration: 'none', border: '1px solid #334155' }}>
                      View Attachment ↗
                    </a>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: RESULT */}
          {result && activeTab === 'result' && (
            <div style={{ padding: '24px', backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #10b981', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>✅</span> Live Sync &amp; Verification Completed Successfully!
              </div>
              <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
                All {result.total_records || 0} records have been pushed live to target project <strong style={{ color: '#60a5fa' }}>aivcmkwclfipntadipec</strong> (https://the-workflows.com) and verified via cloud read-back.
              </div>
              <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '10px 24px', fontSize: '14px', fontWeight: 700, backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                Done &amp; Close Modal
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '18px 28px',
            borderTop: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              fontSize: '13.5px',
              fontWeight: 600,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>

          <button
            onClick={handleExecuteSync}
            disabled={status === 'BLOCKED' || executing || loading}
            style={{
              padding: '12px 28px',
              fontSize: '14px',
              fontWeight: 800,
              backgroundColor: status === 'BLOCKED' ? '#334155' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: status === 'BLOCKED' ? '#64748b' : '#ffffff',
              border: 'none',
              borderRadius: '12px',
              cursor: status === 'BLOCKED' || executing || loading ? 'not-allowed' : 'pointer',
              boxShadow: status === 'BLOCKED' ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.4)',
              opacity: executing ? 0.7 : 1
            }}
          >
            {executing ? 'Updating Live Cloud ERP...' : 'Confirm & Update Live Cloud'}
          </button>
        </div>
      </div>
    </div>
  )
}
