'use client'

import { useState, useEffect, Suspense, useTransition, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DEAL_STATUSES, type Deal } from '@/lib/deals/constants'
import { useRole } from '@/components/RoleProvider'
import { bulkCreateDeals, updateDealStatus } from '@/lib/deals/actions'
import NewDealModal from './NewDealModal'
import EditDealModal from './EditDealModal'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface Props { 
  deals: Deal[]
  settings: any
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
const fmtUnit = fmt


function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function pct(used: number, total: number) {
  return Math.min(100, Math.round((used / total) * 100))
}

const SHIPMENT_COLORS = [
  'rgba(59, 130, 246, 0.08)',  // Blue
  'rgba(16, 185, 129, 0.08)',  // Green
  'rgba(139, 92, 246, 0.08)',  // Purple
  'rgba(245, 158, 11, 0.08)',  // Amber
  'rgba(236, 72, 153, 0.08)',  // Pink
]

function getShipmentColor(shipmentId: string) {
  let hash = 0;
  for (let i = 0; i < shipmentId.length; i++) {
    hash = shipmentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SHIPMENT_COLORS[Math.abs(hash) % SHIPMENT_COLORS.length];
}

function DealsClientInner({ deals, settings }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [editDeal, setEditDeal]   = useState<Deal | null>(null)
  const [showAmexDetails, setShowAmexDetails] = useState(false)
  const [showTurboDetails, setShowTurboDetails] = useState(false)
  const [showSbDetails, setShowSbDetails] = useState(false)
  const [showFinancePools, setShowFinancePools] = useState(false)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const role = useRole()
  
  const searchParams = useSearchParams()
  const highlightParam = searchParams.get('highlight')
  const [isHighlighting, setIsHighlighting] = useState(false)
  const [showDates, setShowDates] = useState(true)
  const [showFunding, setShowFunding] = useState(false)
  const [showStatus, setShowStatus] = useState(true)
  const [sortColumn, setSortColumn] = useState('default')
  const [sortDirection, setSortDirection] = useState<'desc'|'asc'>('desc')

  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([])
  const [showBulkAdvance, setShowBulkAdvance] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<string>('')
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split('T')[0])
  const [bulkInvoice, setBulkInvoice] = useState('')
  const [bulkError, setBulkError] = useState('')

  const handleBulkSubmit = () => {
    if (!bulkStatus) return
    setBulkError('')
    startTransition(async () => {
      const needsDate = bulkStatus === 'PAID' || bulkStatus === 'PAYMENT_REQUIRED' || bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH'
      for (const id of selectedDealIds) {
        await updateDealStatus(id, bulkStatus, 'Bulk updated', needsDate ? bulkDate : undefined, [], bulkInvoice)
      }
      setShowBulkAdvance(false)
      setSelectedDealIds([])
      setBulkStatus('')
      setBulkInvoice('')
    })
  }

  useEffect(() => {
    if (highlightParam === 'unsold') {
      setIsHighlighting(true)
      const timer = setTimeout(() => setIsHighlighting(false), 15000)
      return () => clearTimeout(timer)
    }
  }, [highlightParam])

  const parseDateStr = (dateStr: string): string => {
    if (!dateStr) return ''
    dateStr = dateStr.trim()
    
    // If it's a number (Excel serial date), convert it
    if (/^\d+(\.\d+)?$/.test(dateStr)) {
      const serial = parseFloat(dateStr)
      const baseDate = new Date(1899, 11, 30)
      const d = new Date(baseDate.getTime() + serial * 24 * 60 * 60 * 1000)
      if (!isNaN(d.getTime())) return d.toISOString()
    }

    // Replace all slashes and dots with hyphens to parse consistently
    // Format could be DD/MM/YY, DD/MM/YYYY, YYYY-MM-DD
    if (dateStr.includes('/') || dateStr.includes('.')) {
      const separator = dateStr.includes('/') ? '/' : '.'
      const parts = dateStr.split(separator)
      if (parts.length === 3) {
        let p1 = parseInt(parts[0], 10)
        let p2 = parseInt(parts[1], 10)
        let p3 = parseInt(parts[2], 10)

        // Case A: YYYY/MM/DD
        if (p1 > 1000) {
          const d = new Date(p1, p2 - 1, p3)
          if (!isNaN(d.getTime())) return d.toISOString()
        }

        // Case B: DD/MM/YY or DD/MM/YYYY
        if (p3 < 100) p3 += 2000
        
        // Assume DD/MM/YYYY first (standard in UAE/UK/Europe)
        if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
          const d = new Date(p3, p2 - 1, p1)
          if (!isNaN(d.getTime())) return d.toISOString()
        }
        
        // Fallback: MM/DD/YYYY
        if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
          const d = new Date(p3, p1 - 1, p2)
          if (!isNaN(d.getTime())) return d.toISOString()
        }
      }
    }

    // Try standard parsing
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }

  const processUploadedRows = (data: any[]) => {
    return data.map(row => {
      const normalizedRow: Record<string, string> = {}
      for (const key of Object.keys(row)) {
        const cleanKey = key.toUpperCase().trim()
        normalizedRow[cleanKey] = row[key] !== null && row[key] !== undefined ? row[key].toString().trim() : ''
      }

      const qtyStr = normalizedRow['QUANTITY'] || '1'
      const quantity = parseInt(qtyStr) || 1

      const totalCostStr = normalizedRow['TOTAL COST'] || '0'
      const total_cost = parseFloat(totalCostStr) || 0

      const unitCostStr = normalizedRow['UNIT COST'] || '0'
      const unitCostInput = parseFloat(unitCostStr) || 0

      let unit_cost = unitCostInput
      if (unit_cost === 0 && total_cost > 0) {
        unit_cost = total_cost / quantity
      }

      const system_deal_number = normalizedRow['SYSTEM DEAL NUMBER'] || ''
      const deal_number_input = normalizedRow['DEAL NUMBER'] || ''
      
      let deal_number = system_deal_number || deal_number_input || ''
      
      let notes = normalizedRow['NOTES'] || ''
      if (deal_number_input && system_deal_number) {
        notes = `Excel Deal Number: ${deal_number_input}${notes ? ' | ' + notes : ''}`
      }

      const dateRaw = normalizedRow['AUCTION WON DATE'] || normalizedRow['DATE'] || ''
      const date = parseDateStr(dateRaw)

      const vendor = normalizedRow['SUPPLIER'] || normalizedRow['VENDOR'] || ''
      const auction_platform = normalizedRow['AUCTION PLATFROM'] || normalizedRow['AUCTION PLATFORM'] || 'DIRECT'
      const model = normalizedRow['MODEL'] || ''
      const storage = normalizedRow['STORAGE'] || ''
      const grade = normalizedRow['GRADE'] || ''
      const carrier = normalizedRow['CARRIER'] || ''
      const color = normalizedRow['COLOR'] || ''
      
      const feePctStr = normalizedRow['AUCTION FEE%'] || normalizedRow['AUCTION FEE'] || '0'
      let auction_fee_pct = parseFloat(feePctStr) || 0
      if (auction_platform !== 'BSTOCK') {
        auction_fee_pct = 0
      }


      const orderFeeStr = normalizedRow['ORDER FEE'] || normalizedRow['OTHER FEES'] || '0'
      const other_fees = parseFloat(orderFeeStr) || 0

      const funding_source = normalizedRow['FUNDING SOURCE'] || 'CASH_POOL'
      const amex_statement_date = parseDateStr(normalizedRow['AMEX STATEMENT DATE'] || '')

      return {
        deal_number,
        date,
        vendor,
        auction_platform,
        model,
        storage,
        grade,
        carrier,
        color,
        quantity,
        unit_cost,
        total_cost,
        auction_fee_pct,
        other_fees,
        funding_source,
        amex_statement_date,
        notes
      }
    }).filter(r => r.model && r.unit_cost > 0)
  }

  const handleDownloadTemplate = () => {
    const headers = [
      'DEAL NUMBER', 'AUCTION WON DATE', 'SUPPLIER', 'AUCTION PLATFROM', 'MODEL', 'STORAGE', 'GRADE', 'CARRIER', 'COLOR', 'QUANTITY', 'TOTAL COST', 'AUCTION FEE%', 'ORDER FEE', 'FUNDING SOURCE', 'AMEX STATEMENT DATE', 'NOTES', 'SYSTEM DEAL NUMBER'
    ].join(',')
    const exampleRow = [
      '',                                       // DEAL NUMBER (optional)
      new Date().toISOString().split('T')[0],   // AUCTION WON DATE
      'ATT',                                    // SUPPLIER
      'BSTOCK',                                 // AUCTION PLATFROM
      'iPhone 14',                              // MODEL
      '128GB',                                  // STORAGE
      'B',                                      // GRADE
      'AT&T',                                   // CARRIER
      'Black',                                  // COLOR
      '50',                                     // QUANTITY
      '12500.00',                               // TOTAL COST
      '2',                                      // AUCTION FEE%
      '0',                                      // ORDER FEE
      'AMEX',                                   // FUNDING SOURCE
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 12).toISOString().split('T')[0], // AMEX STATEMENT DATE
      'Refurbished lot',                        // NOTES
      ''                                        // SYSTEM DEAL NUMBER
    ].join(',')
    const csvContent = `${headers}\n${exampleRow}\n`
    const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'mobitech_deals_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const fileName = file.name.toLowerCase()

    const onComplete = async (mapped: any[]) => {
      if (mapped.length === 0) {
        alert('No valid deals found. Ensure the template headers match and rows have models and costs.')
        setIsUploading(false)
        return
      }

      startTransition(async () => {
        const res = await bulkCreateDeals(mapped)
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (res.error) {
          alert(res.error)
        } else {
          // Auto-backup to seed.sql so data survives any future db reset
          try {
            await fetch('/api/backup-deals', { method: 'POST' })
          } catch (_) { /* silent fail - backup is best-effort */ }
          alert(`✅ Successfully uploaded ${res.count} deals!\n\n💾 Data has been automatically saved — it will survive any future database reset.`)
        }
      })
    }

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result
          const workbook = XLSX.read(buffer, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
          const mapped = processUploadedRows(rawRows)
          onComplete(mapped)
        } catch (err: any) {
          alert('Failed to parse Excel file: ' + err.message)
          setIsUploading(false)
        }
      }
      reader.onerror = () => {
        alert('Failed to read file.')
        setIsUploading(false)
      }
      reader.readAsArrayBuffer(file)
    } else {
      // Parse as CSV
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const mapped = processUploadedRows(results.data)
          onComplete(mapped)
        },
        error: (err) => {
          alert('Failed to parse CSV file: ' + err.message)
          setIsUploading(false)
        }
      })
    }
  }

  const filtered = deals.filter(d => {
    const matchSearch = search === '' ||
      d.deal_number.toLowerCase().includes(search.toLowerCase()) ||
      d.model.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || d.status === statusFilter
    
    const isOverdue = d.status !== 'DEAL_CLOSED' && d.payment_date && (Date.now() - new Date(d.payment_date).getTime()) >= 30 * 86400_000
    const matchOverdue = !showOverdueOnly || isOverdue
    
    return matchSearch && matchStatus && matchOverdue
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    const invoicedQtyA = (a as any).invoice_line_items ? (a as any).invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
    const invoicedQtyB = (b as any).invoice_line_items ? (b as any).invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
    const validLineItemsA = (a as any).invoice_line_items ? (a as any).invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
    const validLineItemsB = (b as any).invoice_line_items ? (b as any).invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
    const invoicedValueA = validLineItemsA.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    const invoicedValueB = validLineItemsB.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)

    const remainingQtyA = Math.max(0, a.quantity - invoicedQtyA)
    const stuckCapitalA = a.quantity > 0 ? remainingQtyA * (a.total_commitment / a.quantity) : 0
    const remainingQtyB = Math.max(0, b.quantity - invoicedQtyB)
    const stuckCapitalB = b.quantity > 0 ? remainingQtyB * (b.total_commitment / b.quantity) : 0

    const shipmentDataA = (a as any).shipment_deals?.[0]?.shipments
    const shipmentDataB = (b as any).shipment_deals?.[0]?.shipments
    
    let dealShipmentCostA = 0
    if (shipmentDataA) {
      const totalUnitsA = shipmentDataA.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 1
      dealShipmentCostA = (shipmentDataA.total_logistics_cost / totalUnitsA) * a.quantity
    }
    let dealShipmentCostB = 0
    if (shipmentDataB) {
      const totalUnitsB = shipmentDataB.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 1
      dealShipmentCostB = (shipmentDataB.total_logistics_cost / totalUnitsB) * b.quantity
    }

    const grossProfitA = (a.total_revenue || 0) - (a.total_cogs || 0) - dealShipmentCostA
    const grossProfitB = (b.total_revenue || 0) - (b.total_cogs || 0) - dealShipmentCostB
    
    const isClosedA = a.status === 'DEAL_CLOSED'
    const isClosedB = b.status === 'DEAL_CLOSED'
    
    const amexProfitA = isClosedA && a.funding_source === 'AMEX' ? grossProfitA - (a.cashback_amount || 0) : null
    const amexProfitB = isClosedB && b.funding_source === 'AMEX' ? grossProfitB - (b.cashback_amount || 0) : null

    if (sortColumn === 'committed') {
      return sortDirection === 'desc' ? b.total_commitment - a.total_commitment : a.total_commitment - b.total_commitment
    } else if (sortColumn === 'stuck') {
      return sortDirection === 'desc' ? stuckCapitalB - stuckCapitalA : stuckCapitalA - stuckCapitalB
    } else if (sortColumn === 'shipment') {
      return sortDirection === 'desc' ? dealShipmentCostB - dealShipmentCostA : dealShipmentCostA - dealShipmentCostB
    } else if (sortColumn === 'gross_profit') {
      return sortDirection === 'desc' ? grossProfitB - grossProfitA : grossProfitA - grossProfitB
    } else if (sortColumn === 'amex_profit') {
      const apA = amexProfitA === null ? -Infinity : amexProfitA
      const apB = amexProfitB === null ? -Infinity : amexProfitB
      return sortDirection === 'desc' ? apB - apA : apA - apB
    }

    const getStatusTier = (status: string) => {
      if (status === 'DEAL_CLOSED' || status === 'SOLD') return 4
      if (status === 'PARTIALLY_SOLD') return 3
      if (status === 'RECEIVED_BY_MOBITECH') return 2
      return 1 // IN TRANSIT & OTHERS
    }

    const tierA = getStatusTier(a.status)
    const tierB = getStatusTier(b.status)

    if (tierA !== tierB) return tierA - tierB // lower tier means higher up (tier 1 is IN_TRANSIT)

    const dateA = new Date(a.created_at).getTime()
    const dateB = new Date(b.created_at).getTime()
    return dateB - dateA
  })

  // Deal counts
  const now30 = Date.now()
  const closedDeals       = deals.filter(d => d.status === 'DEAL_CLOSED').length
  const unclosedFresh     = deals.filter(d => d.status !== 'DEAL_CLOSED' && (!(d as any).payment_date || (now30 - new Date((d as any).payment_date).getTime()) < 30 * 86400_000)).length
  const unclosedOverdue   = deals.filter(d => d.status !== 'DEAL_CLOSED' && (d as any).payment_date && (now30 - new Date((d as any).payment_date).getTime()) >= 30 * 86400_000).length
  const totalRevenue      = deals.reduce((s, d) => s + (d.total_revenue || 0), 0)
  
  const totalRemainingUnits = deals.reduce((sum, deal) => {
    if (deal.status === 'DEAL_CLOSED') return sum
    const invoicedQty = (deal as any).invoice_line_items ? (deal as any).invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sq:number, i:any) => sq + (i.quantity || 0), 0) : 0
    const rem = deal.quantity - invoicedQty
    return sum + (rem > 0 ? rem : 0)
  }, 0)

  // Amex: sum of amex_amount on all UNCLOSED deals funded by Amex or Mixed
  const amexStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || (d.funding_source === 'MIXED' ? Number(d.total_commitment) / 2 : Number(d.total_commitment))), 0)
  const amexAvailable = (settings.amex_limit || 500000) - amexStuck

  // Turbo: sum of cash_amount on all UNCLOSED deals funded by Turbo or Mixed
  const turboStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'TURBO_CASH' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.cash_amount) || (d.funding_source === 'MIXED' ? Number(d.total_commitment) / 2 : Number(d.total_commitment))), 0)
  const turboAvailable = (settings.turbo_cash_limit || 150000) - turboStuck

  // SB: sum of cash_amount on all UNCLOSED deals funded by SB
  const sbStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && d.funding_source === 'SB_CASH')
    .reduce((s, d) => s + (Number(d.cash_amount) || Number(d.total_commitment)), 0)
  const sbAvailable = (settings.sb_cash_limit || 150000) - sbStuck

  const amexPct = pct(amexStuck, settings.amex_limit || 500000)
  const turboPct = pct(turboStuck, settings.turbo_cash_limit || 150000)
  const sbPct = pct(sbStuck, settings.sb_cash_limit || 150000)

  // Amex cutoff date = 12th of current month (or next month if already past)
  const now = new Date()
  let cutoff = new Date(now.getFullYear(), now.getMonth(), 12)
  if (now >= cutoff) cutoff = new Date(now.getFullYear(), now.getMonth() + 1, 12)
  const daysLeft = Math.ceil((cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const cutoffStr = cutoff.toLocaleDateString('en-AE', { day: '2-digit', month: 'long', year: 'numeric' })
  const cutoffUrgency = daysLeft <= 3 ? 'cutoff-danger' : daysLeft <= 7 ? 'cutoff-warn' : 'cutoff-ok'

  let tQty = 0, tInvQty = 0, tInvVal = 0, tRem = 0, tCommitted = 0, tShipCost = 0, tStuck = 0, tProfit = 0, tAmexProfit = 0
  filtered.forEach(deal => {
    const invoicedQty = (deal as any).invoice_line_items ? (deal as any).invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
    const validLineItems = (deal as any).invoice_line_items ? (deal as any).invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
    const invoicedValue = validLineItems.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    let dealShipmentCost = 0
    const shipmentData = (deal as any).shipment_deals?.[0]?.shipments
    if (shipmentData) {
      const totalShipmentCost = Number(shipmentData.total_logistics_cost) || 0
      const totalShipmentUnits = shipmentData.shipment_deals?.reduce((sum: number, sd: any) => sum + (Number(sd.deals?.quantity) || 0), 0) || 0
      if (totalShipmentUnits > 0) {
        dealShipmentCost = (totalShipmentCost / totalShipmentUnits) * deal.quantity
      }
    }
    tQty += deal.quantity
    tInvQty += invoicedQty
    tInvVal += invoicedValue
    tRem += (deal.quantity - invoicedQty)
    tCommitted += deal.total_commitment
    tShipCost += dealShipmentCost
    const remainingQty = Math.max(0, deal.quantity - invoicedQty)
    tStuck += deal.quantity > 0 ? remainingQty * (deal.total_commitment / deal.quantity) : 0
    tProfit += (invoicedValue - deal.total_commitment - dealShipmentCost)
    
    let amexProfit = 0
    if (deal.funding_source === 'AMEX' || deal.funding_source === 'MIXED') {
      const amexProfitMultiplier = deal.funding_source === 'AMEX' ? 1 : ((Number(deal.amex_amount) || 0) / deal.total_commitment)
      const baseUnitCost = deal.total_commitment / deal.quantity
      const paidQty = validLineItems.filter((i:any) => i.invoices?.status === 'PAID').reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
      amexProfit = paidQty * baseUnitCost * amexProfitMultiplier * 0.02
    }
    tAmexProfit += amexProfit
  })

  return (
    <div className="page-root">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deals</h1>
          <p className="page-sub">Track every auction purchase from win to settlement</p>
        </div>
        {role !== 'FINANCE' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="file" 
              accept=".csv" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button className="btn-ghost" onClick={handleDownloadTemplate} style={{ border: '1px solid var(--border)' }}>
              Download Template
            </button>
            <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} style={{ border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }} disabled={isUploading || isPending}>
              {isUploading || isPending ? 'Uploading...' : 'Upload Bulk Deals'}
            </button>
            <button id="new-deal-modal-btn" className="btn-primary" onClick={() => setShowModal(true)}>
              + New Deal
            </button>
          </div>
        )}
      </div>

      {/* ── Row 1: Deal Counts ── */}
      <div className="deal-summary-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="deal-summary-card">
          <span className="ds-label">Total Deals</span>
          <span className="ds-value">{deals.length}</span>
        </div>
        <div className="deal-summary-card ds-card-purple">
          <span className="ds-label">Active · Under 30 Days</span>
          <span className="ds-value ds-purple">{unclosedFresh}</span>
          <span className="ds-tag ds-tag-purple">Within target</span>
        </div>
        <div 
          className={`deal-summary-card ds-card-red ${showOverdueOnly ? 'active-filter' : ''}`}
          style={{ 
            cursor: 'pointer',
            border: showOverdueOnly ? '2px solid var(--accent-rose)' : '1px solid var(--border)',
            boxShadow: showOverdueOnly ? '0 0 12px rgba(239, 68, 68, 0.3)' : 'none'
          }}
          onClick={() => setShowOverdueOnly(!showOverdueOnly)}
        >
          <span className="ds-label">Overdue · Over 30 Days</span>
          <span className="ds-value ds-red">{unclosedOverdue}</span>
          <span className="ds-tag ds-tag-red">
            {showOverdueOnly ? 'Filtering Active' : unclosedOverdue > 0 ? 'Needs attention' : 'All clear'}
          </span>
        </div>
        <div className="deal-summary-card ds-card-amber">
          <span className="ds-label">Remaining Units</span>
          <span className="ds-value" style={{ color: 'var(--accent-amber)' }}>{totalRemainingUnits}</span>
          <span className="ds-tag" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)' }}>In stock / Transit</span>
        </div>
        <div className="deal-summary-card ds-card-green">
          <span className="ds-label">Closed Deals</span>
          <span className="ds-value ds-green">{closedDeals}</span>
          <span className="ds-tag ds-tag-green">Settled</span>
        </div>
      </div>

      {/* Finance Pools Toggle */}
      <div style={{ marginBottom: '24px', marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
        <button 
          className="btn-ghost" 
          onClick={() => setShowFinancePools(!showFinancePools)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            borderRadius: '100px', 
            padding: '10px 20px', 
            background: showFinancePools ? 'var(--bg-hover)' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <span style={{ fontSize: '16px' }}>💵</span>
          <span>{showFinancePools ? 'Hide Finance Pools' : 'Show Finance Pools'}</span>
        </button>
      </div>

      {/* 💰 Row 2: Amex + Cash Treasury Cards 💰 */}
      {showFinancePools && (
        <div className="deal-summary-row deal-summary-row-2">

        {/* AMEX CARD */}
        <div className="treasury-card treasury-card-amex">
          <div className="tc-header" onClick={() => setShowAmexDetails(!showAmexDetails)} style={{ cursor: 'pointer' }}>
            <div className="tc-icon">💳</div>
            <div style={{ flex: 1 }}>
              <div className="tc-title">American Express</div>
              {!showAmexDetails && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px' }}>
                  <span style={{ color: 'var(--accent-red)' }}>Stuck: {fmt(amexStuck)}</span>
                  <span style={{ color: 'var(--accent-green)' }}>Avail: {fmt(Math.max(0, amexAvailable))}</span>
                </div>
              )}
              {showAmexDetails && <div className="tc-limit">Limit: {fmt(settings.amex_limit || 500000)} · Cashbacks eligible</div>}
            </div>
            {showAmexDetails && (
              <div className={`tc-pct ${amexPct > 85 ? 'tc-pct-danger' : amexPct > 60 ? 'tc-pct-warn' : 'tc-pct-ok'}`}>
                {amexPct}% used
              </div>
            )}
            <div style={{ marginLeft: '12px', opacity: 0.5 }}>{showAmexDetails ? '▲' : '▼'}</div>
          </div>

          {/* Progress Bar */}
          {showAmexDetails && (
            <div className="tc-bar-bg" style={{ marginTop: '16px' }}>
              <div
                className={`tc-bar-fill ${amexPct > 85 ? 'bar-danger' : amexPct > 60 ? 'bar-warn' : 'bar-ok'}`}
                style={{ width: `${amexPct}%` }}
              />
            </div>
          )}

          {/* Details (Collapsible) */}
          {showAmexDetails && (
            <div style={{ marginTop: '20px' }}>
              {/* Cutoff Date Banner */}
              <div className={`amex-cutoff-banner ${cutoffUrgency}`}>
                <div className="acb-left">
                  <span className="acb-icon">{daysLeft <= 3 ? '🔴' : daysLeft <= 7 ? '🟡' : '🟢'}</span>
                  <div>
                    <div className="acb-label">Statement Cutoff Date</div>
                    <div className="acb-date">{cutoffStr}</div>
                  </div>
                </div>
                <div className="acb-right">
                  <span className="acb-days">{daysLeft}</span>
                  <span className="acb-days-label">day{daysLeft !== 1 ? 's' : ''} left</span>
                </div>
              </div>

              {/* Two sub-boxes */}
              <div className="tc-sub-row">
                <div className="tc-sub-box tc-sub-stuck">
                  <span className="tc-sub-label">Stuck in Deals</span>
                  <span className="tc-sub-value tc-val-red">{fmt(amexStuck)}</span>
                  <span className="tc-sub-note">Across {deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED')).length} unclosed deal{deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED')).length !== 1 ? 's' : ''}</span>
                </div>
                <div className="tc-sub-box tc-sub-avail">
                  <span className="tc-sub-label">Available to Invest</span>
                  <span className="tc-sub-value tc-val-green">{fmt(Math.max(0, amexAvailable))}</span>
                  <span className="tc-sub-note">{amexAvailable <= 0 ? '⚠ Limit reached' : 'Ready to deploy'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TURBO CASH CARD */}
        <div className="treasury-card treasury-card-cash">
          <div className="tc-header" onClick={() => setShowTurboDetails(!showTurboDetails)} style={{ cursor: 'pointer' }}>
            <div className="tc-icon">💵</div>
            <div style={{ flex: 1 }}>
              <div className="tc-title">Turbo Cash Pool</div>
              {!showTurboDetails && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px' }}>
                  <span style={{ color: 'var(--accent-red)' }}>Stuck: {fmt(turboStuck)}</span>
                  <span style={{ color: 'var(--accent-green)' }}>Avail: {fmt(Math.max(0, turboAvailable))}</span>
                </div>
              )}
              {showTurboDetails && <div className="tc-limit">Pool: {fmt(settings.turbo_cash_limit || 150000)} · Cost: 7% p.a.</div>}
            </div>
            {showTurboDetails && (
              <div className={`tc-pct ${turboPct > 85 ? 'tc-pct-danger' : turboPct > 60 ? 'tc-pct-warn' : 'tc-pct-ok'}`}>
                {turboPct}% used
              </div>
            )}
            <div style={{ marginLeft: '12px', opacity: 0.5 }}>{showTurboDetails ? '▲' : '▼'}</div>
          </div>

          {/* Progress Bar */}
          {showTurboDetails && (
            <div className="tc-bar-bg" style={{ marginTop: '16px' }}>
              <div
                className={`tc-bar-fill ${turboPct > 85 ? 'bar-danger' : turboPct > 60 ? 'bar-warn' : 'bar-ok'}`}
                style={{ width: `${turboPct}%` }}
              />
            </div>
          )}

          {/* Details (Collapsible) */}
          {showTurboDetails && (
            <div style={{ marginTop: '20px' }}>
              <div className="tc-sub-row">
                <div className="tc-sub-box tc-sub-stuck">
                  <span className="tc-sub-label">Stuck in Deals</span>
                  <span className="tc-sub-value tc-val-red">{fmt(turboStuck)}</span>
                  <span className="tc-sub-note">Across {deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'TURBO_CASH' || d.funding_source === 'MIXED')).length} unclosed deals</span>
                </div>
                <div className="tc-sub-box tc-sub-avail">
                  <span className="tc-sub-label">Available to Invest</span>
                  <span className="tc-sub-value tc-val-green">{fmt(Math.max(0, turboAvailable))}</span>
                  <span className="tc-sub-note">{turboAvailable <= 0 ? '⚠ Pool exhausted' : 'Ready to deploy'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SB CASH CARD */}
        <div className="treasury-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <div className="tc-header" onClick={() => setShowSbDetails(!showSbDetails)} style={{ cursor: 'pointer' }}>
            <div className="tc-icon">💵</div>
            <div style={{ flex: 1 }}>
              <div className="tc-title">SB Cash Pool</div>
              {!showSbDetails && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px' }}>
                  <span style={{ color: 'var(--accent-red)' }}>Stuck: {fmt(sbStuck)}</span>
                  <span style={{ color: 'var(--accent-green)' }}>Avail: {fmt(Math.max(0, sbAvailable))}</span>
                </div>
              )}
              {showSbDetails && <div className="tc-limit">Pool: {fmt(settings.sb_cash_limit || 150000)} · Cost: 7% p.a.</div>}
            </div>
            {showSbDetails && (
              <div className={`tc-pct ${sbPct > 85 ? 'tc-pct-danger' : sbPct > 60 ? 'tc-pct-warn' : 'tc-pct-ok'}`}>
                {sbPct}% used
              </div>
            )}
            <div style={{ marginLeft: '12px', opacity: 0.5 }}>{showSbDetails ? '▲' : '▼'}</div>
          </div>

          {/* Progress Bar */}
          {showSbDetails && (
            <div className="tc-bar-bg" style={{ marginTop: '16px' }}>
              <div
                className={`tc-bar-fill ${sbPct > 85 ? 'bar-danger' : sbPct > 60 ? 'bar-warn' : 'bar-ok'}`}
                style={{ width: `${sbPct}%` }}
              />
            </div>
          )}

          {/* Details (Collapsible) */}
          {showSbDetails && (
            <div style={{ marginTop: '20px' }}>
              <div className="tc-sub-row">
                <div className="tc-sub-box tc-sub-stuck">
                  <span className="tc-sub-label">Stuck in Deals</span>
                  <span className="tc-sub-value tc-val-red">{fmt(sbStuck)}</span>
                  <span className="tc-sub-note">Across {deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'SB_CASH')).length} unclosed deals</span>
                </div>
                <div className="tc-sub-box tc-sub-avail">
                  <span className="tc-sub-label">Available to Invest</span>
                  <span className="tc-sub-value tc-val-green">{fmt(Math.max(0, sbAvailable))}</span>
                  <span className="tc-sub-note">{sbAvailable <= 0 ? '⚠ Pool exhausted' : 'Ready to deploy'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        </div>
      )}

      {/* Filters */}
      <div className="deal-filters">
        <input
          id="deal-search" type="text"
          placeholder="Search by deal number or model..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="deal-search"
        />
        <select id="deal-status-filter" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)} className="deal-filter-select">
          <option value="ALL">All Statuses</option>
          {Object.entries(DEAL_STATUSES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* Deals Table */}
      {filtered.length === 0 ? (
        <div className="deals-empty">
          <div className="deals-empty-icon">◈</div>
          <h3>No deals yet</h3>
          <p>Click <strong>+ New Deal</strong> to log your first B-Stock or EcoATM auction win.</p>
        </div>
      ) : (
        <div className="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th style={{width: '40px'}}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedDealIds.length === filtered.length} onChange={(e) => {
                    if (e.target.checked) setSelectedDealIds(filtered.map(d => d.id))
                    else setSelectedDealIds([])
                  }} />
                </th>
                <th>Deal #</th>
                <th style={{ width: '250px', minWidth: '250px' }}>Model</th>
                <th>Qty</th>
                <th>Invoiced Qty Sold</th>
                <th>Invoiced Value</th>
                <th>Remaining Units</th>
                <th style={{cursor: 'pointer'}} onClick={() => {
                  if (sortColumn === 'committed') setSortDirection(d => d==='desc'?'asc':'desc')
                  else { setSortColumn('committed'); setSortDirection('desc') }
                }}>Committed {sortColumn === 'committed' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}</th>
                <th style={{cursor: 'pointer'}} onClick={() => {
                  if (sortColumn === 'stuck') setSortDirection(d => d==='desc'?'asc':'desc')
                  else { setSortColumn('stuck'); setSortDirection('desc') }
                }}>Stuck Capital {sortColumn === 'stuck' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}</th>
                <th style={{cursor: 'pointer'}} onClick={() => {
                  if (sortColumn === 'shipment') setSortDirection(d => d==='desc'?'asc':'desc')
                  else { setSortColumn('shipment'); setSortDirection('desc') }
                }}>Shipment Cost {sortColumn === 'shipment' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}</th>
                <th style={{cursor: 'pointer'}} onClick={() => {
                  if (sortColumn === 'gross_profit') setSortDirection(d => d==='desc'?'asc':'desc')
                  else { setSortColumn('gross_profit'); setSortDirection('desc') }
                }}>Gross Profit {sortColumn === 'gross_profit' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}</th>
                <th style={{cursor: 'pointer'}} onClick={() => {
                  if (sortColumn === 'amex_profit') setSortDirection(d => d==='desc'?'asc':'desc')
                  else { setSortColumn('amex_profit'); setSortDirection('desc') }
                }}>Amex Profit {sortColumn === 'amex_profit' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}</th>
                {showFunding ? (
                  <th onClick={() => setShowFunding(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide funding">Funding ◀</th>
                ) : (
                  <th onClick={() => setShowFunding(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '30px', textAlign: 'center'}} title="Click to show funding">$ ▶</th>
                )}
                {showStatus ? (
                  <th onClick={() => setShowStatus(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide status">Status ◀</th>
                ) : (
                  <th onClick={() => setShowStatus(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '60px', textAlign: 'center'}} title="Click to show status">Status ▶</th>
                )}
                {showDates ? (
                  <>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Paid Date ◀</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">SB Tech Date</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Received Date</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Partial Sold Date</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Fully Sold Date</th>
                  </>
                ) : (
                  <th onClick={() => setShowDates(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '40px', textAlign: 'center'}} title="Click to expand timeline">LT ▶</th>
                )}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(deal => {
                const st = DEAL_STATUSES[deal.status]
                const isDealUnclosed = deal.status !== 'DEAL_CLOSED'
                const shipmentId = (deal as any).shipment_deals?.[0]?.shipments?.id
                const invoicedQty = (deal as any).invoice_line_items ? (deal as any).invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
                const validLineItems = (deal as any).invoice_line_items ? (deal as any).invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
                const invoicedValue = validLineItems.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)
                const remainingQty = Math.max(0, deal.quantity - invoicedQty)
                const stuckCapital = deal.quantity > 0 ? remainingQty * (deal.total_commitment / deal.quantity) : 0
                
                let partialSoldDate = null
                if (validLineItems.length > 0) {
                  const sortedInvoices = [...validLineItems]
                    .map(i => i.invoices?.issue_date ? new Date(i.invoices.issue_date).getTime() : Infinity)
                    .filter(t => t !== Infinity)
                    .sort((a, b) => a - b)
                  if (sortedInvoices.length > 0) {
                    partialSoldDate = new Date(sortedInvoices[0]).toISOString()
                  }
                }
                
                let shipmentUnitCost = 0
                let dealShipmentCost = 0
                const shipmentData = (deal as any).shipment_deals?.[0]?.shipments
                if (shipmentData) {
                  const totalShipmentCost = Number(shipmentData.total_logistics_cost) || 0
                  const totalShipmentUnits = shipmentData.shipment_deals?.reduce((sum: number, sd: any) => sum + (Number(sd.deals?.quantity) || 0), 0) || 0
                  if (totalShipmentUnits > 0) {
                    shipmentUnitCost = totalShipmentCost / totalShipmentUnits
                    dealShipmentCost = shipmentUnitCost * deal.quantity
                  }
                }

                const liveGrossProfit = invoicedValue - deal.total_commitment - dealShipmentCost
                
                let amexProfit = 0
                if (deal.funding_source === 'AMEX' || deal.funding_source === 'MIXED') {
                  const amexProfitMultiplier = deal.funding_source === 'AMEX' ? 1 : ((Number(deal.amex_amount) || 0) / deal.total_commitment)
                  const baseUnitCost = deal.total_commitment / deal.quantity
                  const paidQty = validLineItems.filter((i:any) => i.invoices?.status === 'PAID').reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
                  amexProfit = paidQty * baseUnitCost * amexProfitMultiplier * 0.02
                }

                const isOverdue = deal.status !== 'DEAL_CLOSED' && deal.payment_date && (Date.now() - new Date(deal.payment_date).getTime()) >= 30 * 86400_000

                let bgStyle: any = {}
                if (isOverdue) {
                  bgStyle = { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderLeft: '4px solid var(--accent-rose)' }
                } else if (isHighlighting && isDealUnclosed) {
                  bgStyle = { backgroundColor: 'rgba(255, 100, 100, 0.15)' }
                } else if (shipmentId) {
                  bgStyle = { backgroundColor: getShipmentColor(shipmentId) }
                }
                const highlightStyle = { ...bgStyle, transition: 'background-color 0.5s' }
                return (
                  <tr key={deal.id} className="deal-row" style={highlightStyle}>
                    <td>
                      <input type="checkbox" checked={selectedDealIds.includes(deal.id)} onChange={(e) => {
                        if (e.target.checked) setSelectedDealIds([...selectedDealIds, deal.id])
                        else setSelectedDealIds(selectedDealIds.filter(id => id !== deal.id))
                      }} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <a href={`/dashboard/deals/${deal.id}`} className="deal-number-link">
                          {deal.deal_number}
                        </a>
                        {(deal as any).shipment_deals && (deal as any).shipment_deals.map((sd: any) => sd.shipments && (
                          <a key={sd.shipments.id} href={`/dashboard/logistics/${sd.shipments.id}`} className="deal-number-link" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            📦 {sd.shipments.shipment_number}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td style={{ width: '250px', minWidth: '250px' }}>
                      {(deal as any).items && (deal as any).items.length > 1 ? (
                        <div className="mixed-lot-container" style={{ display: 'flex', flexDirection: 'column', gap: '3px', cursor: (deal as any).items.length > 5 ? 'help' : 'default' }}>
                          {(deal as any).items.slice(0, 4).map((item: any, idx: number) => {
                            const modelStr = item.model.replace(/iPhone\s*/i, 'iPhone ').toUpperCase()
                            const specs = [item.storage, item.grade].filter(Boolean).join(' · ')
                            return (
                              <div key={item.id || idx} style={{ marginBottom: idx < 3 && idx < (deal as any).items.length - 1 ? '4px' : '0' }}>
                                <div className="deal-model" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                  {modelStr} ({item.quantity} units)
                                </div>
                                <div className="deal-model-sub" style={{ fontSize: '10px', marginTop: '1px' }}>
                                  {specs}
                                </div>
                              </div>
                            )
                          })}
                          {(deal as any).items.length > 5 ? (
                            <>
                              <div className="deal-model-sub" style={{ color: 'var(--accent-indigo)', fontWeight: 600, marginTop: '2px', textDecoration: 'underline' }}>
                                + {(deal as any).items.length - 4} more models (Hover)
                              </div>
                              <div className="mixed-lot-tooltip">
                                {(deal as any).items.map((item: any, idx: number) => {
                                  const modelStr = item.model.replace(/iPhone\s*/i, 'iPhone ').toUpperCase()
                                  return (
                                    <div key={item.id || idx} style={{ fontSize: '0.85rem', lineHeight: '1.3', fontWeight: 500, color: 'var(--text-primary)' }}>
                                      {modelStr} {item.storage} {item.grade} x {item.quantity} units
                                    </div>
                                  )
                                })}
                              </div>
                            </>
                          ) : (deal as any).items.length === 5 && (
                            (() => {
                              const item = (deal as any).items[4]
                              const modelStr = item.model.replace(/iPhone\s*/i, 'iPhone ').toUpperCase()
                              const specs = [item.storage, item.grade].filter(Boolean).join(' · ')
                              return (
                                <div key={item.id || 4} style={{ marginTop: '4px' }}>
                                  <div className="deal-model" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    {modelStr} ({item.quantity} units)
                                  </div>
                                  <div className="deal-model-sub" style={{ fontSize: '10px', marginTop: '1px' }}>
                                    {specs}
                                  </div>
                                </div>
                              )
                            })()
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="deal-model">{deal.model}</div>
                          <div className="deal-model-sub">{[deal.storage, deal.grade, deal.carrier].filter(Boolean).join(' · ')}</div>
                        </>
                      )}
                    </td>
                    <td className="deal-qty">{deal.quantity} units</td>
                    <td className="deal-qty" style={{color: invoicedQty > 0 ? 'var(--accent-teal)' : 'inherit'}}>{invoicedQty} units</td>
                    <td className="deal-amount" style={{color: invoicedValue > 0 ? 'var(--accent-teal)' : 'inherit'}}>{fmt(invoicedValue)}</td>
                    <td className="deal-qty" style={{color: remainingQty === 0 ? 'var(--accent-teal)' : remainingQty < deal.quantity ? 'var(--accent-amber)' : 'inherit'}}>{remainingQty} units</td>
                    <td className="deal-amount">{fmt(deal.total_commitment)}</td>
                    <td className="deal-amount" style={{color: stuckCapital <= 0 ? 'var(--accent-green)' : 'var(--accent-amber)'}}>{fmt(stuckCapital)}</td>
                    <td className="deal-amount">
                      {dealShipmentCost > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontWeight: 600 }}>{fmt(dealShipmentCost)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmtUnit(shipmentUnitCost)} / unit</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className={`deal-profit ${liveGrossProfit > 0 ? 'profit-pos' : liveGrossProfit < 0 ? 'profit-neg' : 'profit-zero'}`}>
                      {liveGrossProfit !== 0 ? fmt(liveGrossProfit) : '—'}
                    </td>
                    <td className="deal-profit" style={{color: amexProfit > 0 ? 'var(--accent-purple)' : 'inherit'}}>
                      {amexProfit > 0 ? fmt(amexProfit) : '—'}
                    </td>
                    {showFunding ? (
                      <td>
                        <span className={`funding-badge ${deal.funding_source === 'AMEX' ? 'badge-amex' : deal.funding_source === 'MIXED' ? 'badge-mixed' : 'badge-cash'}`}>
                          {deal.funding_source === 'AMEX' ? '💳 Amex' : deal.funding_source === 'TURBO_CASH' ? '💵 Turbo Cash' : deal.funding_source === 'SB_CASH' ? '💵 SB Cash' : '📊 Mixed'}
                        </span>
                      </td>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>$</td>
                    )}
                    {showStatus ? (
                      <td>
                        <span className={`status-badge ${st.color}`}>{st.label}</span>
                      </td>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                    )}
                    {showDates ? (
                      <>
                        <td className="deal-date">{deal.payment_date ? fmtDate(deal.payment_date) : '—'}</td>
                        <td className="deal-date">{deal.arrived_miami_date ? fmtDate(deal.arrived_miami_date) : '—'}</td>
                        <td className="deal-date">{deal.received_mobitech_date ? fmtDate(deal.received_mobitech_date) : '—'}</td>
                        <td className="deal-date">{partialSoldDate ? fmtDate(partialSoldDate) : '—'}</td>
                        <td className="deal-date">{deal.deal_closed_date ? fmtDate(deal.deal_closed_date) : '—'}</td>
                      </>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                    )}
                    <td>
                      {role !== 'FINANCE' && (
                        <button
                          id={`edit-deal-${deal.id}`}
                          className="btn-edit"
                          onClick={() => setEditDeal(deal)}
                          title="Edit deal"
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-elevated)', fontWeight: 600, borderTop: '2px solid var(--border)' }}>
                <td colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', color: 'var(--text-primary)' }}>TOTALS</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tQty} units</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tInvQty} units</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tInvVal)}</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tRem} units</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tCommitted)}</td>
                <td className="deal-amount" style={{color: tStuck <= 0 ? 'var(--accent-green)' : 'var(--accent-amber)'}}>{fmt(tStuck)}</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tShipCost)}</td>
                <td className={`deal-profit ${tProfit > 0 ? 'profit-pos' : tProfit < 0 ? 'profit-neg' : 'profit-zero'}`}>{fmt(tProfit)}</td>
                <td className="deal-profit" style={{color: tAmexProfit > 0 ? 'var(--accent-purple)' : 'inherit'}}>{tAmexProfit > 0 ? fmt(tAmexProfit) : '—'}</td>
                {showFunding ? <td></td> : <td></td>}
                {showStatus ? <td></td> : <td></td>}
                {showDates ? <td colSpan={5}></td> : <td></td>}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selectedDealIds.length > 0 && (
        <div style={{position:'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background:'var(--bg-card)', border:'1px solid var(--border)', padding:'12px 24px', borderRadius:'100px', display:'flex', alignItems:'center', gap:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.5)', zIndex:100}}>
          <span style={{fontWeight:500}}>{selectedDealIds.length} deals selected</span>
          <button className="btn-primary" onClick={() => setShowBulkAdvance(true)}>Change Status</button>
          <button className="btn-ghost" onClick={()=>setSelectedDealIds([])}>Cancel</button>
        </div>
      )}

      {showBulkAdvance && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowBulkAdvance(false)}}>
          <div className="modal-box" style={{maxWidth:'400px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Bulk Change Status</h2>
                <div className="modal-sub">Update multiple deals at once</div>
              </div>
              <button className="modal-close" onClick={()=>setShowBulkAdvance(false)}>×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">New Status</label>
                <select className="form-input" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
                   <option value="">Select status...</option>
                   {Object.entries(DEAL_STATUSES).map(([key, val]) => (
                     <option key={key} value={key}>{val.label}</option>
                   ))}
                </select>
              </div>
              {(bulkStatus === 'PAID' || bulkStatus === 'PAYMENT_REQUIRED' || bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH') && (
                 <div className="form-group">
                    <label className="form-label">
                      {bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH' ? 'Arrival Date' : 'Date'}
                    </label>
                    <input type="date" className="form-input" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
                 </div>
              )}
              {bulkStatus === 'PAYMENT_REQUIRED' && (
                 <div className="form-group">
                    <label className="form-label">Invoice Number (optional)</label>
                    <input type="text" className="form-input" value={bulkInvoice} onChange={e=>setBulkInvoice(e.target.value)} placeholder="e.g. INV-1234" />
                 </div>
              )}
              {bulkError && <div className="login-error">&#9888; {bulkError}</div>}
              <div className="modal-actions">
                 <button className="btn-ghost" onClick={()=>setShowBulkAdvance(false)}>Cancel</button>
                 <button className="btn-primary" onClick={handleBulkSubmit} disabled={!bulkStatus || isPending}>{isPending ? 'Updating...' : 'Update Deals'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && <NewDealModal onClose={() => setShowModal(false)} />}
      {editDeal  && <EditDealModal deal={editDeal} onClose={() => setEditDeal(null)} />}
    </div>
  )
}

export default function DealsClient({ deals, settings }: Props) {
  return (
    <Suspense fallback={<div style={{ padding: '40px' }}>Loading deals...</div>}>
      <DealsClientInner deals={deals} settings={settings} />
    </Suspense>
  )
}
