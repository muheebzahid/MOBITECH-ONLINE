'use client'

import { useState, useTransition, Fragment, useRef, useEffect } from 'react'
import PaginationBar from '@/components/PaginationBar'
import * as XLSX from 'xlsx'
import { updateInventoryLocation, updateRefurbStage, deleteInventoryItem, updateInventoryItemImei, bulkUpdateInventoryItems, bulkDeleteInventoryItems } from '@/lib/inventory/actions'
import { useRole } from '@/components/RoleProvider'

const STAGES = [
  { id: 'SEPARATED', label: 'Separated' },
  { id: 'HANDED_TO_REFURBISH', label: 'Refurbishing' },
  { id: 'QC_DONE', label: 'QC Done' },
  { id: 'READY_TO_SELL', label: 'Ready to Sell' },
  { id: 'ASSIGNED', label: 'Assigned to Order' },
  { id: 'SOLD', label: 'Sold Online' }
]

function fmtS(n: number) {
  const parts = Number(n || 0).toString().split('.')
  const integerPart = parts[0]
  let decimalPart = parts[1] || ''
  if (decimalPart.length < 3) decimalPart = decimalPart.padEnd(3, '0')
  else decimalPart = decimalPart.substring(0, 3)
  const formattedInteger = new Intl.NumberFormat('en-US').format(parseFloat(integerPart))
  return `$${formattedInteger}.${decimalPart}`
}

import { moveSkuToOnlineInventory } from '@/lib/deals/actions'

import { useQuery } from '@tanstack/react-query'
import { getAllInventory } from '@/lib/inventory/actions'

export default function InventoryClient({ inventory, activeDeals = [], inventoryTotal = 0, inventoryPage = 0 }: { inventory: any[], activeDeals?: any[], inventoryTotal?: number, inventoryPage?: number }) {
  const { data: inventoryResult } = useQuery({
    queryKey: ['inventory', inventoryPage],
    queryFn: () => getAllInventory(inventoryPage),
    initialData: { data: inventory, total: inventoryTotal },
    staleTime: 15 * 1000,
  })

  const currentInventory = inventoryResult?.data || inventory
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [activeStage, setActiveStage] = useState('SEPARATED')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const q = urlParams.get('q')
      if (q) {
        setSearchTerm(q)
        const matchingItem = currentInventory.find((it: any) => 
          (it.imei && it.imei.toLowerCase() === q.toLowerCase()) || 
          (it.serial_number && it.serial_number.toLowerCase() === q.toLowerCase())
        )
        if (matchingItem) {
          setActiveStage(matchingItem.status)
          setHighlightedItemId(matchingItem.id)
          const timer = setTimeout(() => {
            setHighlightedItemId(null)
          }, 15000)
          return () => clearTimeout(timer)
        }
      }
    }
  }, [inventory])
  
  const [editingRepair, setEditingRepair] = useState<string | null>(null)
  const [repairCost, setRepairCost] = useState<number>(0)
  
  const [editingQc, setEditingQc] = useState<string | null>(null)
  const [qcDoc, setQcDoc] = useState('')

  // Add Inventory Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingImeiId, setEditingImeiId] = useState<string | null>(null)
  const [editImeiValue, setEditImeiValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedDealId, setSelectedDealId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [moveQty, setMoveQty] = useState(1)
  const [moving, setMoving] = useState(false)

  const [showDealDropdown, setShowDealDropdown] = useState(false)
  const [dealSearchQuery, setDealSearchQuery] = useState('')

  const getItemAvailableQty = (deal: any, item: any) => {
    if (!deal || !item) return 0
    const invoiced = (deal.invoice_line_items || [])
      .filter((li: any) => li.deal_item_id === item.id && li.invoices?.status !== 'CANCELLED' && li.invoices?.status !== 'VOIDED')
      .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
    return Math.max(0, (item.quantity || 0) - invoiced)
  }

  const dealsWithAvailable = activeDeals.map(d => {
    const items = (d.items || []).map((i: any) => ({
      ...i,
      availableQty: getItemAvailableQty(d, i)
    })).filter((i: any) => i.availableQty > 0)
    
    return {
      ...d,
      availableItems: items,
      totalAvailable: items.reduce((sum: number, i: any) => sum + i.availableQty, 0)
    }
  }).filter(d => d.totalAvailable > 0)

  const selectedDeal = dealsWithAvailable.find(d => d.id === selectedDealId)
  const selectedItem = selectedDeal?.availableItems?.find((i: any) => i.id === selectedItemId)
  const maxQty = selectedItem?.availableQty || 1

  // Compute landed cost the same way DealDetailClient does:
  // item.unit_cost + pro-rated (auction_fee + other_fees) / deal.quantity + pro-rated shipping
  const totalLandedCost = (() => {
    if (!selectedDeal || !selectedItem) return 0
    const itemUnitCost = Number(selectedItem.unit_cost || 0)
    const dealFeePerUnit = (selectedDeal.quantity || 0) > 0
      ? ((Number(selectedDeal.auction_fee || 0) + Number(selectedDeal.other_fees || 0)) / selectedDeal.quantity)
      : 0
    const shipment = selectedDeal.shipment_deals?.[0]?.shipments
    const totalShipmentUnits = shipment
      ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0)
      : 0
    const shippingCostPerUnit = totalShipmentUnits > 0
      ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits)
      : 0
    return itemUnitCost + dealFeePerUnit + shippingCostPerUnit
  })()

  const filteredDealsList = dealsWithAvailable.filter(d => {
    if (!dealSearchQuery) return true
    const q = dealSearchQuery.toLowerCase()
    return d.deal_number?.toLowerCase().includes(q) || 
           d.model?.toLowerCase().includes(q)
  })

  const getSelectedDealLabel = () => {
    if (!selectedDealId) return '-- Choose a Deal --'
    const d = dealsWithAvailable.find(deal => deal.id === selectedDealId)
    if (!d) return '-- Choose a Deal --'
    return `${d.deal_number} - Available Qty: ${d.totalAvailable}`
  }

  const handleMoveStage = (itemId: string, newStage: string) => {
    startTransition(async () => {
      await updateRefurbStage(itemId, newStage)
    })
  }

  const handleSaveRepair = (itemId: string) => {
    startTransition(async () => {
      await updateRefurbStage(itemId, 'HANDED_TO_REFURBISH', { repair_cost: repairCost })
      setEditingRepair(null)
    })
  }

  const handleSaveQc = (itemId: string) => {
    startTransition(async () => {
      await updateRefurbStage(itemId, 'QC_DONE', { qc_document_url: qcDoc })
      setEditingQc(null)
    })
  }

  const filtered = inventory.filter(item => {
    if (item.refurb_stage !== activeStage) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      if (!item.imei?.toLowerCase().includes(term) && !item.model?.toLowerCase().includes(term)) {
        return false
      }
    }
    return true
  })

  const handleMoveInventory = async (e: any) => {
    e.preventDefault()
    if (!selectedDeal || !selectedItem || moveQty <= 0 || moveQty > maxQty) return alert('Invalid selection or quantity')
    
    setMoving(true)
    const res = await moveSkuToOnlineInventory(
      selectedDealId, 
      selectedItemId, 
      selectedItem.model, 
      moveQty, 
      totalLandedCost
    )
    if (res.error) {
      alert(res.error)
      setMoving(false)
    } else {
      setShowAddModal(false)
      setSelectedDealId('')
      setSelectedItemId('')
      setMoveQty(1)
      setMoving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item? It will be returned to the deal.')) {
      startTransition(async () => {
        const res = await deleteInventoryItem(id)
        if (res.error) alert(res.error)
        else setSelectedItems(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
    }
  }

  const handleExportExcel = () => {
    const itemsToExport = selectedItems.size > 0 
      ? currentInventory.filter(i => selectedItems.has(i.id))
      : currentInventory

    if (itemsToExport.length === 0) return alert('No inventory items to export.')

    const data = itemsToExport.map(i => ({
      ID: i.id,
      'Deal Number': i.deals?.deal_number || '',
      Model: i.model,
      Specs: `${i.storage || ''} / ${i.color || ''} / Grade ${i.grade || ''}`,
      IMEI: i.imei || '',
      'Serial Number': i.serial_number || '',
      'Repair Cost': i.repair_cost || 0,
      Stage: i.refurb_stage || '',
      Status: i.status || ''
    }))

    const worksheet = XLSX.utils.json_to_sheet(data)
    worksheet['!cols'] = [
      { wch: 36 },
      { wch: 18 },
      { wch: 20 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory')
    
    const timestamp = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `mobitech_inventory_export_${timestamp}.xlsx`)
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
        
        const updates = json.map(row => ({
          id: row['ID'],
          imei: row['IMEI'] !== undefined ? String(row['IMEI']) : undefined,
          serial_number: row['Serial Number'] !== undefined ? String(row['Serial Number']) : undefined,
          repair_cost: row['Repair Cost'] !== undefined ? Number(row['Repair Cost']) : undefined
        })).filter(u => u.id)
        
        if (updates.length > 0) {
          await bulkUpdateInventoryItems(updates)
        }
        
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      reader.readAsArrayBuffer(file)
    })
  }

  const handleBulkMove = (newStage: string) => {
    if (selectedItems.size === 0) return
    startTransition(async () => {
      await Promise.all(Array.from(selectedItems).map(id => updateRefurbStage(id, newStage)))
      setSelectedItems(new Set())
    })
  }

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return
    if (confirm(`Are you sure you want to delete ${selectedItems.size} items? They will be returned to their deals.`)) {
      startTransition(async () => {
        const results = await bulkDeleteInventoryItems(Array.from(selectedItems))
        const errors = results.filter(r => r.error).map(r => r.error)
        if (errors.length > 0) alert(`Some deletions failed: ${errors.join(', ')}`)
        setSelectedItems(new Set())
      })
    }
  }

  const groupedFiltered = filtered.reduce((acc, item) => {
    const dealNum = item.deals?.deal_number || 'Unknown Deal'
    if (!acc[dealNum]) acc[dealNum] = []
    acc[dealNum].push(item)
    return acc
  }, {} as Record<string, any[]>)

  const groupedEntries = Object.entries(groupedFiltered) as [string, any[]][]

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Refurbishment Pipeline</h1>
          <p className="page-subtitle">Track IMEI refurbishment, repair costs, and QC</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={handleExportExcel} style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}>
            📊 Export to Excel
          </button>
          {role !== 'VIEW_ONLY' && (
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              + Add Inventory
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
        {STAGES.map(s => {
          const count = currentInventory.filter(i => i.refurb_stage === s.id).length
          return (
            <button
              key={s.id}
              className={`btn-ghost ${activeStage === s.id ? 'active-tab' : ''}`}
              onClick={() => setActiveStage(s.id)}
              style={{
                background: activeStage === s.id ? 'var(--bg-hover)' : 'transparent',
                fontWeight: activeStage === s.id ? 600 : 400,
                color: activeStage === s.id ? 'var(--text)' : 'var(--text-muted)'
              }}
            >
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
        <input 
          type="text" 
          className="form-input" 
          style={{ maxWidth: '300px' }}
          placeholder="Search IMEI or model..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
        />
        {selectedItems.size > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-hover)', padding: '4px 12px', borderRadius: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, marginRight: '8px' }}>{selectedItems.size} selected</span>
            {activeStage === 'SEPARATED' && role !== 'VIEW_ONLY' && <button className="btn-primary" style={{padding: '4px 12px'}} onClick={() => handleBulkMove('HANDED_TO_REFURBISH')}>Hand to Refurbish</button>}
            {activeStage === 'HANDED_TO_REFURBISH' && role !== 'VIEW_ONLY' && <button className="btn-primary" style={{padding: '4px 12px'}} onClick={() => handleBulkMove('QC_DONE')}>Mark QC Done</button>}
            {activeStage === 'QC_DONE' && role !== 'VIEW_ONLY' && <button className="btn-primary" style={{padding: '4px 12px'}} onClick={() => handleBulkMove('READY_TO_SELL')}>Ready to Sell</button>}
            
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 8px' }}></div>
            
            <button className="btn-ghost" style={{padding: '4px 12px', border: '1px solid var(--border)'}} onClick={handleExportExcel}>Export Excel</button>
            
            {role !== 'VIEW_ONLY' && (
              <>
                <input type="file" accept=".xlsx, .xls" style={{display: 'none'}} ref={fileInputRef} onChange={handleImportExcel} />
                <button className="btn-ghost" style={{padding: '4px 12px', border: '1px solid var(--border)'}} onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                  {isPending ? 'Importing...' : 'Import Excel'}
                </button>
                
                <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 8px' }}></div>

                <button className="btn-ghost" style={{padding: '4px 12px', color: 'var(--status-red)'}} onClick={handleBulkDelete}>Delete Selected</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="deals-table-wrap">
        <table className="deals-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" onChange={e => {
                  if (e.target.checked) setSelectedItems(new Set(filtered.map(i => i.id)))
                  else setSelectedItems(new Set())
                }} checked={filtered.length > 0 && selectedItems.size === filtered.length} />
              </th>
              <th>Deal Number</th>
              <th>IMEI / Serial</th>
              <th>Model & Specs</th>
              <th style={{textAlign:'right'}}>Unit Cost</th>
              <th style={{textAlign:'right'}}>Repair Cost</th>
              <th style={{textAlign:'right'}}>Total Cost</th>
              <th>QC Doc</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{textAlign:'center', padding:'30px', color:'var(--text-muted)'}}>No items in this stage.</td></tr>
            )}
            {groupedEntries.map(([dealNum, items]) => (
              <Fragment key={dealNum}>
                {items.map(item => (
                  <tr 
                    key={item.id} 
                    className="deal-row"
                    style={highlightedItemId === item.id ? { backgroundColor: 'var(--status-green-dim, rgba(16, 185, 129, 0.2))' } : {}}
                  >
                    <td>
                      <input type="checkbox" checked={selectedItems.has(item.id)} onChange={e => {
                        const next = new Set(selectedItems)
                        if (e.target.checked) next.add(item.id)
                        else next.delete(item.id)
                        setSelectedItems(next)
                      }} />
                    </td>
                    <td><div style={{fontWeight:500, color: 'var(--text-muted)'}}>{item.deals?.deal_number || 'N/A'}</div></td>
                    <td>
                      {editingImeiId === item.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '2px 6px', fontSize: '11px', width: '120px' }} 
                            value={editImeiValue} 
                            onChange={e => setEditImeiValue(e.target.value)} 
                            autoFocus 
                          />
                          <button className="btn-primary" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => {
                            startTransition(async () => {
                              await updateInventoryItemImei(item.id, editImeiValue)
                              setEditingImeiId(null)
                            })
                          }}>Save</button>
                          <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => setEditingImeiId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{fontWeight:600}}>{item.imei || item.serial_number || 'N/A'}</div>
                          {role !== 'VIEW_ONLY' && (
                            <button 
                              className="btn-ghost" 
                              style={{ padding: 0, fontSize: '11px', color: 'var(--accent-indigo)' }} 
                              onClick={() => { setEditingImeiId(item.id); setEditImeiValue(item.imei || item.serial_number || ''); }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div><strong>{item.model}</strong></div>
                      <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{item.storage} &middot; {item.color} &middot; Grade {item.grade}</div>
                    </td>
                    <td style={{textAlign:'right'}}>{fmtS(item.unit_cost)}</td>
                    <td style={{textAlign:'right'}}>
                      {editingRepair === item.id ? (
                        <div style={{display:'flex', gap:'4px', justifyContent:'flex-end'}}>
                          <input type="number" className="form-input" style={{width:'80px', padding:'4px'}} value={repairCost} onChange={e=>setRepairCost(parseFloat(e.target.value)||0)} />
                          <button className="btn-primary" style={{padding:'4px 8px'}} onClick={()=>handleSaveRepair(item.id)}>Save</button>
                        </div>
                      ) : (
                        <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'8px'}}>
                          {fmtS(item.repair_cost)}
                          {activeStage === 'HANDED_TO_REFURBISH' && role !== 'VIEW_ONLY' && (
                            <button className="btn-ghost" style={{padding:'2px 6px'}} onClick={()=>{setEditingRepair(item.id); setRepairCost(item.repair_cost)}}>✎</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:'right', fontWeight: 600, color: 'var(--accent-teal)'}}>{fmtS(item.total_cost)}</td>
                    <td>
                      {editingQc === item.id ? (
                        <div style={{display:'flex', gap:'4px'}}>
                          <input type="text" className="form-input" placeholder="Doc URL" style={{width:'120px', padding:'4px'}} value={qcDoc} onChange={e=>setQcDoc(e.target.value)} />
                          <button className="btn-primary" style={{padding:'4px 8px'}} onClick={()=>handleSaveQc(item.id)}>Save</button>
                        </div>
                      ) : (
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          {item.qc_document_url ? <a href={item.qc_document_url} target="_blank" rel="noreferrer" style={{color:'var(--accent-blue)', fontSize:'12px'}}>View Doc</a> : <span style={{color:'var(--text-muted)', fontSize:'12px'}}>No doc</span>}
                          {activeStage === 'QC_DONE' && role !== 'VIEW_ONLY' && (
                            <button className="btn-ghost" style={{padding:'2px 6px'}} onClick={()=>{setEditingQc(item.id); setQcDoc(item.qc_document_url||'')}}>✎</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {activeStage === 'SEPARATED' && role !== 'VIEW_ONLY' && <button className="btn-primary" onClick={()=>handleMoveStage(item.id, 'HANDED_TO_REFURBISH')}>Hand to Refurbish</button>}
                        
                        {activeStage === 'HANDED_TO_REFURBISH' && (
                          <>
                            {role !== 'VIEW_ONLY' && <button className="btn-ghost" title="Move back to Separated" style={{padding:'4px 8px'}} onClick={()=>handleMoveStage(item.id, 'SEPARATED')}>↶</button>}
                            {role !== 'VIEW_ONLY' && <button className="btn-primary" onClick={()=>handleMoveStage(item.id, 'QC_DONE')}>Mark QC Done</button>}
                          </>
                        )}
                        
                        {activeStage === 'QC_DONE' && (
                          <>
                            {role !== 'VIEW_ONLY' && <button className="btn-ghost" title="Move back to Refurbishing" style={{padding:'4px 8px'}} onClick={()=>handleMoveStage(item.id, 'HANDED_TO_REFURBISH')}>↶</button>}
                            {role !== 'VIEW_ONLY' && <button className="btn-primary" disabled={!item.qc_document_url} onClick={()=>handleMoveStage(item.id, 'READY_TO_SELL')}>Ready to Sell</button>}
                          </>
                        )}

                        {(activeStage === 'SOLD' || activeStage === 'ASSIGNED') && item.online_orders && (
                          <a href={`/dashboard/online-sales/${item.online_orders.platform?.toLowerCase() || 'amazon'}/${item.online_order_id}`} className={`status-badge ${activeStage === 'ASSIGNED' ? 'badge-blue' : 'badge-purple'}`} style={{ textDecoration: 'none', display: 'inline-block' }}>
                            {activeStage === 'ASSIGNED' ? 'Assigned to' : 'Sold on'} {item.online_orders.order_number}
                          </a>
                        )}

                        {activeStage === 'READY_TO_SELL' && (
                          <>
                            {role !== 'VIEW_ONLY' && <button className="btn-ghost" title="Move back to QC Done" style={{padding:'4px 8px'}} onClick={()=>handleMoveStage(item.id, 'QC_DONE')}>↶</button>}
                            <span className="status-badge badge-green">Ready</span>
                          </>
                        )}
                        
                        {role !== 'VIEW_ONLY' && (
                          <button 
                            className="btn-ghost" 
                            title="Delete Unit" 
                            style={{padding:'4px 8px', color: 'var(--status-red)'}} 
                            onClick={() => handleDelete(item.id)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length > 0 && (
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, paddingRight: '16px' }}>
                      Subtotal for {dealNum} ({items.length} units):
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtS(items.reduce((sum, i) => sum + (Number(i.unit_cost) || 0), 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fmtS(items.reduce((sum, i) => sum + (Number(i.repair_cost) || 0), 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-teal)' }}>
                      {fmtS(items.reduce((sum, i) => sum + (Number(i.total_cost) || 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={(e: any) => { if(e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px', overflow: 'visible' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Pull Inventory from Deals</h2>
                <div className="modal-sub">Move stock into the Refurbishment Pipeline</div>
              </div>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleMoveInventory}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Select Deal</label>
                
                {/* Trigger Button */}
                <div 
                  className="form-input" 
                  onClick={() => setShowDealDropdown(!showDealDropdown)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontSize: '13px', color: selectedDealId ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {getSelectedDealLabel()}
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{showDealDropdown ? '▲' : '▼'}</span>
                </div>

                {/* Click outside overlay */}
                {showDealDropdown && (
                  <div 
                    onClick={() => { setShowDealDropdown(false); setDealSearchQuery(''); }}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
                  />
                )}

                {/* Dropdown Panel */}
                {showDealDropdown && (
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: '100%', 
                      left: 0, 
                      right: 0, 
                      zIndex: 100, 
                      background: 'var(--bg-surface)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius-sm)', 
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                      marginTop: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: '300px',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Search Input Bar */}
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                      <input 
                        type="text" 
                        className="form-input"
                        placeholder="Search deal # or model..."
                        value={dealSearchQuery}
                        onChange={e => setDealSearchQuery(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 10px', width: '100%', boxSizing: 'border-box' }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    </div>

                    {/* Options List */}
                    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                      {filteredDealsList.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          No matching deals found
                        </div>
                      )}

                      {filteredDealsList.map(d => (
                        <div
                          key={d.id}
                          onClick={() => {
                            setSelectedDealId(d.id)
                            setSelectedItemId('')
                            setShowDealDropdown(false)
                            setDealSearchQuery('')
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            backgroundColor: selectedDealId === d.id ? 'var(--bg-hover)' : 'transparent',
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border-subtle)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedDealId === d.id ? 'var(--bg-hover)' : 'transparent'}
                        >
                          <div style={{ fontWeight: 600 }}>{d.deal_number}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Available Qty: {d.totalAvailable}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedDealId && (
                <div className="form-group">
                  <label className="form-label">Select Model / SKU</label>
                  <select 
                    className="form-input" 
                    value={selectedItemId}
                    onChange={e => {
                      setSelectedItemId(e.target.value)
                      const item = selectedDeal?.availableItems?.find((i: any) => i.id === e.target.value)
                      if (item) setMoveQty(item.availableQty)
                    }}
                    required
                  >
                    <option value="">-- Choose an Item --</option>
                    {selectedDeal?.availableItems?.map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {i.model} ({i.storage}, {i.grade}) - Qty: {i.availableQty}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedItemId && (
                <>
                  <div className="form-group">
                    <label className="form-label">Total Landed Cost per Unit</label>
                    <input type="text" className="form-input" disabled value={`$${totalLandedCost.toFixed(3)}`} />
                    <div className="form-help" style={{ marginTop: '6px' }}>
                      {(() => {
                        const itemUnitCost = Number(selectedItem?.unit_cost || 0)
                        const dealFeePerUnit = (selectedDeal?.quantity || 0) > 0
                          ? ((Number(selectedDeal?.auction_fee || 0) + Number(selectedDeal?.other_fees || 0)) / selectedDeal.quantity)
                          : 0
                        const shipment = selectedDeal?.shipment_deals?.[0]?.shipments
                        const totalShipmentUnits = shipment
                          ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0)
                          : 0
                        const shippingCostPerUnit = totalShipmentUnits > 0
                          ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits)
                          : 0
                        return (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            SKU Bid: <strong>${itemUnitCost.toFixed(3)}</strong>
                            {' + '}Fees: <strong>${dealFeePerUnit.toFixed(3)}</strong>
                            {' + '}Shipping: <strong>${shippingCostPerUnit.toFixed(3)}</strong>
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity to Move</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      min="1" 
                      max={maxQty} 
                      value={moveQty} 
                      onChange={e => setMoveQty(Number(e.target.value))}
                      required
                    />
                    <div className="form-help">Max available to move: {maxQty}</div>
                  </div>
                </>
              )}

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAddModal(false)} disabled={moving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={moving || !selectedItemId}>
                  {moving ? 'Moving...' : 'Move to Online Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <PaginationBar page={inventoryPage} pageSize={25} total={inventoryTotal} baseUrl="/dashboard/inventory" />
    </div>
  )
}
