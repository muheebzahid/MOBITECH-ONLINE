'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { DEAL_STATUSES, type DealStatus, SUPPLIERS, PLATFORMS } from '@/lib/deals/constants'
import { updateDealStatus, uploadDealDocument, deleteDealDocument } from '@/lib/deals/actions'
import { addInventoryBulk } from '@/lib/inventory/actions'
import { useRole } from '@/components/RoleProvider'
import EditDealModal from '../EditDealModal'
import MoveToOnlineModal from './MoveToOnlineModal'
const STATUS_ORDER: DealStatus[] = [
  'AUCTION_WON','AWAITING_PAYMENT_LINK','PAYMENT_REQUIRED','PAID',
  'READY_FOR_PICKUP','IN_TRANSIT_USA','AT_SB_TECHNOLOGY','IN_TRANSIT_DUBAI',
  'AT_TURBO_LOGISTICS','RECEIVED_BY_MOBITECH','PARTIALLY_SOLD','SOLD','DEAL_CLOSED',
]

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
const fmtS = fmt

function fmtAED(n: number) {
  const parts = Number(n || 0).toFixed(2).split('.')
  const integerPart = parts[0]
  const decimalPart = parts[1] || '00'
  
  const formattedInteger = new Intl.NumberFormat('en-US').format(parseFloat(integerPart))
  return `AED ${formattedInteger}.${decimalPart}`
}

function fmtDate(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) }
function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }
function daysSince(d: string) { return Math.floor((Date.now()-new Date(d).getTime())/86400000) }

const st = (status: string) => DEAL_STATUSES[status as DealStatus]



interface Props { deal: any }

export default function DealDetailClient({ deal }: Props) {
  const router = useRouter()
  const [isPending,startTransition] = useTransition()
  const [showEdit,setShowEdit] = useState(false)

  const dealQty = deal.quantity || 0
  const baseUnitCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0
  let amexProfitMultiplier = 0
  if (deal.funding_source === 'AMEX') {
    amexProfitMultiplier = 1
  } else if (deal.funding_source === 'MIXED') {
    const commitment = Number(deal.total_commitment) || 1
    amexProfitMultiplier = (Number(deal.amex_amount) || 0) / commitment
  }
  const [showAdvance,setShowAdvance] = useState(false)
  const [advanceNote,setAdvanceNote] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0])
  const [error,setError] = useState('')
  
  // Inventory State
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [moveOnlineSku, setMoveOnlineSku] = useState<any>(null)

  // Document Upload State
  const [docUploadPending, setDocUploadPending] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    startTransition(async () => {
      setDocUploadPending(true)
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await uploadDealDocument(deal.id, formData)
      if (res.error) {
        alert('Upload failed: ' + res.error)
      }
      setDocUploadPending(false)
      if (docInputRef.current) docInputRef.current.value = ''
    })
  }

  const handleDocDelete = (docId: string, url: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    startTransition(async () => {
      const res = await deleteDealDocument(docId, url, deal.id)
      if (res.error) alert('Delete failed: ' + res.error)
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]
        
        if (data.length === 0) {
          setUploadError('File is empty.')
          return
        }

        startTransition(async () => {
          // Map excel data to our items schema. 
          // Assuming excel has headers like 'IMEI' or 'Serial Number'
          const items = data.map(row => ({
            imei: row['IMEI'] || row['imei'] || row['Imei'] || '',
            serial_number: row['Serial Number'] || row['serial_number'] || row['Serial'] || '',
            model: row['Model'] || row['model'] || '',
            storage: row['Storage'] || row['storage'] || '',
            color: row['Color'] || row['color'] || '',
            grade: row['Grade'] || row['grade'] || '',
          }))
          
          const result = await addInventoryBulk(deal.id, items)
          if (result.error) {
            setUploadError(result.error)
          } else {
            setShowInventoryModal(false)
          }
        })
      } catch (err: any) {
        setUploadError('Error parsing Excel file. Please ensure it is a valid .xlsx or .csv')
      }
    }
    reader.readAsBinaryString(file)
  }

  const exportToPDF = () => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF()

      // Header: Mobitech Wireless Logo (Vectors for clean resolution)
      doc.setFillColor(99, 102, 241) // Indigo background icon
      doc.roundedRect(15, 15, 14, 14, 2, 2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('M', 19.5, 24)

      doc.setTextColor(31, 41, 55) // Dark gray
      doc.setFontSize(16)
      doc.text('MOBITECH', 32, 21)
      doc.setTextColor(99, 102, 241) // Indigo
      doc.setFontSize(10)
      doc.text('WIRELESS', 32, 26)

      // Statement Title
      doc.setTextColor(75, 85, 99)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generated: ${new Date().toLocaleDateString('en-AE')}`, 150, 20)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(99, 102, 241)
      doc.text('DEAL STATEMENT', 150, 26)

      // Line Separator
      doc.setDrawColor(229, 231, 235)
      doc.line(15, 34, 195, 34)

      // Deal Info Section
      doc.setTextColor(17, 24, 39)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Deal Reference: ${deal.deal_number || 'N/A'}`, 15, 42)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(75, 85, 99)
      doc.text(`Status: ${st(deal.status)?.label || deal.status}`, 15, 48)
      doc.text(`Platform: ${deal.platform || '-'}`, 15, 53)
      doc.text(`Supplier: ${deal.supplier || '-'}`, 15, 58)

      doc.text(`Winning Bid: ${fmt(deal.unit_cost)}`, 100, 48)
      doc.text(`Auction Fee: ${fmt(deal.auction_fee)}`, 100, 53)
      doc.text(`Total Commitment: ${fmt(deal.total_commitment)}`, 100, 58)

      doc.text(`Total Revenue: ${fmt(deal.total_revenue)}`, 150, 48)
      doc.text(`COGS: ${fmt(deal.total_cogs)}`, 150, 53)
      doc.text(`Gross Profit: ${fmt(deal.gross_profit)}`, 150, 58)
      doc.text(`Profit (AED): ${fmtAED(deal.gross_profit * 3.674)}`, 150, 63)

      // Line Separator
      doc.line(15, 66, 195, 66)

      let y = 74
      
      // SKU Table Section
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(17, 24, 39)
      doc.text('Deal SKUs (Inventory Summary)', 15, y)
      y += 8

      // Table Header
      doc.setFillColor(243, 244, 246)
      doc.rect(15, y, 180, 7, 'F')
      doc.setFontSize(9)
      doc.setTextColor(55, 65, 81)
      doc.setFont('helvetica', 'bold')
      doc.text('Model', 17, y + 5)
      doc.text('Storage', 45, y + 5)
      doc.text('Grade', 65, y + 5)
      doc.text('Stock+Fee Cost', 77, y + 5)
      doc.text('Shipping/Unit', 107, y + 5)
      doc.text('Total Cost/Unit', 132, y + 5)
      doc.text('Total Cost', 157, y + 5)
      doc.text('Qty', 182, y + 5)
      y += 7

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(31, 41, 55)

      // Loop SKUs
      deal.items.forEach((item: any) => {
        // Page break check
        if (y > 270) {
          doc.addPage()
          y = 20
        }

        const skuSales = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1))
        const qtySold = skuSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)

        const shipment = deal.shipment_deals?.[0]?.shipments
        const totalShipmentUnits = shipment
          ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0)
          : 0
        const shippingCostPerUnit = totalShipmentUnits > 0
          ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits)
          : 0

        const dealFeePerUnit = deal.quantity > 0
          ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity)
          : 0

        const unitBidCost = Number(item.unit_cost || 0)
        const stockPlusFeeCost = unitBidCost + dealFeePerUnit
        const totalCostPerUnit = stockPlusFeeCost + shippingCostPerUnit

        const totalSalesRevenue = skuSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
        const avgSalePrice = qtySold > 0 ? (totalSalesRevenue / qtySold) : 0
        const totalCostOfSold = qtySold * totalCostPerUnit
        const skuProfit = totalSalesRevenue - totalCostOfSold

        // Draw SKU Row
        const itemRemaining = Math.max(0, item.quantity - qtySold)
        doc.text(item.model.substring(0, 15), 17, y + 5)
        doc.text(item.storage || '-', 45, y + 5)
        doc.text(item.grade || '-', 65, y + 5)
        doc.text(fmt(stockPlusFeeCost), 77, y + 5)
        doc.text(fmt(shippingCostPerUnit), 107, y + 5)
        doc.text(fmt(totalCostPerUnit), 132, y + 5)
        doc.text(fmtS(item.quantity * totalCostPerUnit), 157, y + 5)
        doc.text(String(itemRemaining), 182, y + 5)
        
        doc.setDrawColor(243, 244, 246)
        doc.line(15, y + 7, 195, y + 7)
        y += 7

        // Sales Details if sold
        if (qtySold > 0) {
          skuSales.forEach((li: any) => {
            const inv = li.invoices
            if (!inv) return
            
            if (y > 270) {
              doc.addPage()
              y = 20
            }
            
            const invQty = li.quantity || 0
            const invUnitPrice = Number(li.unit_price || 0)
            const invRevenue = invQty * invUnitPrice
            const invLandedCost = invQty * totalCostPerUnit
            const invProfit = invRevenue - invLandedCost

            doc.setFillColor(249, 250, 251)
            doc.rect(15, y, 180, 7, 'F')
            doc.setFontSize(8)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(107, 114, 128)
            doc.text(`Sales (Inv ${inv.invoice_number}): ${invQty} units @ ${fmt(invUnitPrice)} (Rev: ${fmt(invRevenue)})`, 17, y + 4)
            
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(invProfit >= 0 ? 34 : 220, invProfit >= 0 ? 197 : 38, invProfit >= 0 ? 94 : 38)
            doc.text(`Profit: ${fmtS(invProfit)}`, 140, y + 4)
            
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(31, 41, 55)
            y += 7
          })
        }
      })

      // Add unattributed sales to PDF if multi-item deal
      if (deal.items.length > 1) {
        const unattributedSales = (deal.invoice_line_items || []).filter((li: any) => !li.deal_item_id)
        const unattributedQty = unattributedSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
        if (unattributedQty > 0) {
          if (y > 270) {
            doc.addPage()
            y = 20
          }
          doc.text('[Whole Deal Allocation]', 17, y + 5)
          doc.text('-', 45, y + 5)
          doc.text('-', 65, y + 5)
          doc.text('-', 77, y + 5)
          doc.text('-', 107, y + 5)
          doc.text('-', 132, y + 5)
          doc.text('-', 157, y + 5)
          doc.text(`-${unattributedQty}`, 182, y + 5)
          doc.setDrawColor(243, 244, 246)
          doc.line(15, y + 7, 195, y + 7)
          y += 7

          const dealFeePerUnit = deal.quantity > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity) : 0
          const shipment = deal.shipment_deals?.[0]?.shipments
          const totalShipmentUnits = shipment ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0) : 0
          const shippingCostPerUnit = totalShipmentUnits > 0 ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits) : 0
          const totalCostPerUnit = (deal.unit_cost || 0) + dealFeePerUnit + shippingCostPerUnit

          unattributedSales.forEach((li: any) => {
            const inv = li.invoices
            if (!inv) return
            if (y > 270) {
              doc.addPage()
              y = 20
            }
            const invQty = li.quantity || 0
            const invUnitPrice = Number(li.unit_price || 0)
            const invRevenue = invQty * invUnitPrice
            const invLandedCost = invQty * totalCostPerUnit
            const invProfit = invRevenue - invLandedCost

            doc.setFillColor(249, 250, 251)
            doc.rect(15, y, 180, 7, 'F')
            doc.setFontSize(8)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(107, 114, 128)
            doc.text(`Sales (Inv ${inv.invoice_number}): ${invQty} units @ ${fmt(invUnitPrice)} (Rev: ${fmt(invRevenue)})`, 17, y + 4)
            
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(invProfit >= 0 ? 34 : 220, invProfit >= 0 ? 197 : 38, invProfit >= 0 ? 94 : 38)
            doc.text(`Profit: ${fmtS(invProfit)}`, 140, y + 4)
            
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(31, 41, 55)
            y += 7
          })
        }
      }

      // SKU Table Total Row
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.setFillColor(243, 244, 246)
      doc.rect(15, y, 180, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('TOTAL:', 17, y + 5)

      const totalRemainingQty = (() => {
        const totalSkuRemaining = deal.items.reduce((total: number, item: any) => {
          const qtySold = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1)).reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
          return total + Math.max(0, (item.quantity || 0) - qtySold)
        }, 0)
        
        if (deal.items.length > 1) {
          const unattributedQty = (deal.invoice_line_items || [])
            .filter((li: any) => !li.deal_item_id)
            .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
          return Math.max(0, totalSkuRemaining - unattributedQty)
        }
        
        return totalSkuRemaining
      })()

      const totalCostSum = deal.items.reduce((sum: number, it: any) => {
        const dealFeePerUnit = deal.quantity > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity) : 0
        const shipment = deal.shipment_deals?.[0]?.shipments
        const totalShipmentUnits = shipment ? (shipment.shipment_deals?.reduce((s: number, sd: any) => s + (sd.deals?.quantity || 0), 0) || 0) : 0
        const shippingCostPerUnit = totalShipmentUnits > 0 ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits) : 0
        const unitTotalCost = Number(it.unit_cost || 0) + dealFeePerUnit + shippingCostPerUnit
        return sum + ((it.quantity || 0) * unitTotalCost)
      }, 0)

      doc.text(fmtS(totalCostSum), 157, y + 5)
      doc.text(String(totalRemainingQty), 182, y + 5)
      y += 7

      y += 5

      // Line Separator
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.setDrawColor(229, 231, 235)
      doc.line(15, y, 195, y)
      y += 8

      // Linked Invoices Section
      if (y > 250) {
        doc.addPage()
        y = 20
      }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(17, 24, 39)
      doc.text('Linked Invoices & Sales Statements', 15, y)
      y += 8

      const invoiceLineItems = deal.invoice_line_items || []
      if (invoiceLineItems.length === 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(156, 163, 175)
        doc.text('No invoices linked to this deal.', 17, y + 4)
        y += 8
      } else {
        doc.setFillColor(243, 244, 246)
        doc.rect(15, y, 180, 7, 'F')
        doc.setFontSize(9)
        doc.setTextColor(55, 65, 81)
        doc.setFont('helvetica', 'bold')
        doc.text('Invoice #', 17, y + 5)
        doc.text('Status', 50, y + 5)
        doc.text('Issue Date', 85, y + 5)
        doc.text('Due Date', 120, y + 5)
        doc.text('Total Amount', 155, y + 5)
        y += 7

        doc.setFont('helvetica', 'normal')
        doc.setTextColor(31, 41, 55)

        invoiceLineItems.forEach((line: any) => {
          const inv = line.invoices
          if (!inv) return

          if (y > 270) {
            doc.addPage()
            y = 20
          }

          doc.text(inv.invoice_number || '-', 17, y + 5)
          doc.text(inv.status || '-', 50, y + 5)
          doc.text(inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('en-AE') : '-', 85, y + 5)
          doc.text(inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-AE') : '-', 120, y + 5)
          doc.text(fmtS(inv.total_amount), 155, y + 5)
          
          doc.setDrawColor(243, 244, 246)
          doc.line(15, y + 7, 195, y + 7)
          y += 7
        })

        // Invoice Table Total Row
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.setFillColor(243, 244, 246)
        doc.rect(15, y, 180, 7, 'F')
        doc.setFont('helvetica', 'bold')
        doc.text('TOTAL:', 17, y + 5)
        
        const totalInvoiceAmt = invoiceLineItems.reduce((sum: number, line: any) => sum + Number(line.invoices?.total_amount || 0), 0)
        doc.text(fmtS(totalInvoiceAmt), 155, y + 5)
        y += 7
      }

      // Save PDF
      doc.save(`deal_${deal.deal_number || 'statement'}.pdf`)
    })
  }

  const role = useRole()
  const currentStep = STATUS_ORDER.indexOf(deal.status as DealStatus)
  const defaultNextStatus  = currentStep < STATUS_ORDER.length-1 ? STATUS_ORDER[currentStep+1] : null
  const [targetStatus, setTargetStatus] = useState<DealStatus | null>(null)
  
  const isClosed    = deal.status === 'DEAL_CLOSED'
  const hasPaid     = !!deal.payment_date
  const days        = hasPaid ? daysSince(deal.payment_date) : 0
  const overdue     = !isClosed && hasPaid && days >= 30

  const statusHistory = [...(deal.deal_status_history||[])].sort((a:any,b:any)=>new Date(b.changed_at).getTime()-new Date(a.changed_at).getTime())
  const editHistory   = [...(deal.deal_edit_history||[])].sort((a:any,b:any)=>new Date(b.edited_at).getTime()-new Date(a.edited_at).getTime())

  const siblingDeals = deal.shipment_deals?.[0]?.shipments?.shipment_deals?.map((sd: any) => sd.deals).filter((d: any) => d && d.id !== deal.id) || []
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<string[]>([])
  const [attInvoiceNumber, setAttInvoiceNumber] = useState('')

  const handleAdvance = () => {
    if(!targetStatus) return
    setError('')
    startTransition(async () => {
      const result = await updateDealStatus(deal.id, targetStatus, advanceNote||undefined, advanceDate, selectedSiblingIds, attInvoiceNumber)
      if(result.error) { setError(result.error) }
      else { setShowAdvance(false); setAdvanceNote(''); setAttInvoiceNumber(''); setTargetStatus(null); setSelectedSiblingIds([]); router.refresh() }
    })
  }

  const st = (s: string) => DEAL_STATUSES[s as DealStatus]

  const fundingIcon = deal.funding_source === 'AMEX' ? 'AMEX' : deal.funding_source === 'CASH_POOL' ? 'CASH' : 'MIXED'
  const fundingLabel = deal.funding_source === 'AMEX'
    ? `${fmtS(deal.amex_amount)} on card`
    : deal.funding_source === 'CASH_POOL'
    ? `${fmtS(deal.cash_amount)} from pool`
    : `Amex ${fmtS(deal.amex_amount)} / Cash ${fmtS(deal.cash_amount)}`

  const shipment = deal.shipment_deals?.[0]?.shipments

  return (
    <div className="page-root">

      {/* Header */}
      <div className="deal-detail-header">
        <div className="dh-left">
          <a href="/dashboard/deals" className="dh-back">Back to Deals</a>
          <div className="dh-title-row">
            <h1 className="dh-title">{deal.deal_number}</h1>
            <span className={`status-badge ${st(deal.status)?.color||''}`}>{st(deal.status)?.label}</span>
            {overdue && <span className="overdue-badge">{days}d overdue</span>}
          </div>
          <p className="dh-sub">{deal.model} &middot; {[deal.storage,deal.grade,deal.carrier,deal.color].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="dh-actions">
          {role !== 'VIEW_ONLY' && (
            <button className="btn-ghost" onClick={()=>setShowEdit(true)}>Edit Deal</button>
          )}
          {defaultNextStatus && !isClosed && role !== 'VIEW_ONLY' && (
            <button className="btn-advance" onClick={()=>{ setTargetStatus(defaultNextStatus); setShowAdvance(true); }}>
              Advance &rarr; {st(defaultNextStatus)?.label}
            </button>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="pipeline-wrap">
        <div className="pipeline-scroll">
          {STATUS_ORDER.map((status,idx) => {
            const isDone=idx<currentStep, isCur=idx===currentStep
            const meta=st(status)
            const canClick = role === 'SUPER_ADMIN' && status !== deal.status
            return (
              <div 
                key={status} 
                className={`pipeline-step ${isDone?'step-done':isCur?'step-current':'step-future'} ${canClick ? 'step-clickable' : ''}`}
                onClick={() => {
                  if (canClick) {
                    setTargetStatus(status)
                    setShowAdvance(true)
                  }
                }}
                style={{ cursor: canClick ? 'pointer' : 'default' }}
              >
                <div className="step-circle">{isDone?'✓':<span className="step-num">{idx+1}</span>}</div>
                <div className="step-label">{meta?.label}</div>
                {(() => {
                  const hardcoded: Partial<Record<DealStatus, string>> = {
                    'AUCTION_WON': deal.auction_won_date,
                    'PAYMENT_REQUIRED': deal.payment_link_date,
                    'PAID': deal.payment_date,
                    'READY_FOR_PICKUP': deal.pickup_ready_date,
                    'IN_TRANSIT_USA': deal.shipped_usa_date,
                    'AT_SB_TECHNOLOGY': deal.arrived_miami_date,
                    'IN_TRANSIT_DUBAI': deal.shipped_dubai_date,
                    'RECEIVED_BY_MOBITECH': deal.received_mobitech_date,
                    'DEAL_CLOSED': deal.deal_closed_date,
                  }
                  const shipmentDates: Partial<Record<DealStatus, string>> = shipment ? {
                    'AT_SB_TECHNOLOGY': shipment.pickup_date,
                    'IN_TRANSIT_DUBAI': shipment.shipped_usa_date,
                    'AT_TURBO_LOGISTICS': shipment.turbo_received_date || shipment.arrived_dubai_date,
                    'RECEIVED_BY_MOBITECH': shipment.delivered_mobitech_date,
                  } : {}

                  const activeInvoices = (deal.invoice_line_items || [])
                    .map((li: any) => li.invoices)
                    .filter((inv: any) => inv && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT')
                  const sortedInvoices = [...activeInvoices].sort((a: any, b: any) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime())

                  const salesDates: Partial<Record<DealStatus, string>> = {}
                  if (sortedInvoices.length > 0) {
                    salesDates['PARTIALLY_SOLD'] = sortedInvoices[0].issue_date
                    salesDates['SOLD'] = sortedInvoices[sortedInvoices.length - 1].issue_date
                  }

                  let sDate = salesDates[status] || shipmentDates[status] || hardcoded[status]
                  if (!sDate) {
                    const h = statusHistory.find((x: any) => x.new_status === status)
                    if (h) sDate = h.changed_at
                  }
                  if (sDate) {
                    return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtD(sDate)}</div>
                  }
                  return null
                })()}
                {idx<STATUS_ORDER.length-1 && <div className={`step-connector ${isDone?'connector-done':'connector-future'}`}/>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Financial Cards */}
      <div className="deal-fin-grid">
        <div className="fin-card">
          <span className="fin-label">Winning Bid</span>
          <span className="fin-value">{fmt(deal.unit_cost)} <span className="fin-per">/ unit</span></span>
          <span className="fin-sub">{deal.quantity} units total</span>
        </div>
        <div className="fin-card">
          <span className="fin-label">Bid Total</span>
          <span className="fin-value">{fmtS(deal.total_cost)}</span>
          <span className="fin-sub">Before fees</span>
        </div>
        <div className="fin-card fin-card-amber">
          <span className="fin-label">Auction Fee</span>
          <span className="fin-value fin-amber">{fmt(deal.auction_fee)}</span>
          <span className="fin-sub">{deal.total_cost>0?((deal.auction_fee/deal.total_cost)*100).toFixed(1):0}% of bid</span>
        </div>
        <div className="fin-card fin-card-highlight">
          <span className="fin-label">Total Commitment</span>
          <span className="fin-value fin-white">{fmtS(deal.total_commitment)}</span>
          <span className="fin-sub">Bid + all fees</span>
        </div>
        <div className="fin-card fin-card-blue">
          <span className="fin-label">Funding Source</span>
          <span className="fin-value fin-blue">{fundingIcon}</span>
          <span className="fin-sub">{fundingLabel}</span>
        </div>
        <div className={`fin-card ${deal.cashback_eligible?'fin-card-green':''}`}>
          <span className="fin-label">Amex Cashback (2%)</span>
          <span className={`fin-value ${deal.cashback_eligible?'fin-green':'fin-muted'}`}>
            {deal.cashback_eligible ? `+ ${fmt(deal.total_commitment*0.02)}` : 'Not eligible'}
          </span>
          <span className="fin-sub">{deal.amex_statement_date?`Statement: ${fmtD(deal.amex_statement_date)}`:'No statement date'}</span>
        </div>
      </div>

      {/* Body Grid */}
      <div className="deal-body-grid">

        {/* Left: Deal Info */}
        <div className="deal-info-panel">
          <div className="panel-title">Deal Information</div>

          <div className="info-group">
            <div className="info-section-label">Product</div>
            <div className="info-row"><span>Model</span><strong>{deal.model}</strong></div>
            <div className="info-row"><span>Storage</span><strong>{deal.storage||'-'}</strong></div>
            <div className="info-row"><span>Grade</span><strong>{deal.grade||'-'}</strong></div>
            <div className="info-row"><span>Carrier</span><strong>{deal.carrier||'-'}</strong></div>
            <div className="info-row"><span>Color</span><strong>{deal.color||'-'}</strong></div>
            <div className="info-row"><span>Quantity</span><strong>{deal.quantity} units</strong></div>
          </div>

          <div className="info-group">
            <div className="info-section-label">Supplier</div>
            <div className="info-row"><span>Supplier</span><strong>{SUPPLIERS.find((s:any)=>s.value===deal.supplier)?.label||deal.supplier}</strong></div>
            <div className="info-row"><span>Platform</span><strong>{PLATFORMS.find((p:any)=>p.value===deal.auction_platform)?.label||deal.auction_platform}</strong></div>
          </div>

          <div className="info-group">
            <div className="info-section-label">Key Dates</div>
            <div className="info-row"><span>Auction Won</span><strong>{fmtD(deal.auction_won_date)}</strong></div>
            <div className="info-row"><span>Payment Date</span><strong>{fmtD(deal.payment_date)}</strong></div>
            <div className="info-row"><span>Shipped USA</span><strong>{fmtD(shipment?.shipped_usa_date || deal.shipped_usa_date)}</strong></div>
            <div className="info-row"><span>Arrived Dubai</span><strong>{fmtD(shipment?.arrived_dubai_date || deal.arrived_dubai_date)}</strong></div>
            <div className="info-row"><span>Received (Mobitech)</span><strong>{fmtD(shipment?.delivered_mobitech_date || deal.received_mobitech_date)}</strong></div>
            <div className="info-row"><span>Deal Closed</span><strong>{fmtD(deal.deal_closed_date)}</strong></div>
          </div>

          {deal.notes && (
            <div className="info-group">
              <div className="info-section-label">Notes</div>
              <p className="info-notes">{deal.notes}</p>
            </div>
          )}

          <div className="info-group">
            <div className="info-section-label">Profit (Deal Level)</div>
            <div className="info-row"><span>Total Revenue</span><strong className="fin-green">{fmtS(deal.total_revenue)} <span style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:400}}>(AED: {fmtAED(deal.total_revenue * 3.674)})</span></strong></div>
            <div className="info-row"><span>COGS</span><strong>{fmtS(deal.total_cogs)} <span style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:400}}>(AED: {fmtAED(deal.total_cogs * 3.674)})</span></strong></div>
            <div className="info-row">
              <span>Gross Profit (Net)</span>
              <strong className={deal.gross_profit>0?'fin-green':deal.gross_profit<0?'fin-red':''}>
                {fmtS(deal.gross_profit)} <span style={{fontSize:'12px', color: deal.gross_profit>0?'var(--accent-green)':deal.gross_profit<0?'var(--status-red)':'var(--text-muted)', fontWeight:500}}>(AED: {fmtAED(deal.gross_profit * 3.674)})</span>
              </strong>
            </div>
            {(() => {
               const totalAmexProfit = (deal.invoice_line_items || []).filter((li: any) => li.invoices?.status === 'PAID').reduce((sum: number, li: any) => sum + ((li.quantity || 0) * baseUnitCost * amexProfitMultiplier * 0.02), 0)
               if (totalAmexProfit > 0) {
                 return (
                   <div className="info-row">
                     <span>Amex Profit</span>
                     <strong style={{ color: 'var(--accent-purple)' }}>{fmtS(totalAmexProfit)}</strong>
                   </div>
                 )
               }
               return null
            })()}
            {deal.shipment_deals?.[0]?.shipments && (
              <div className="info-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border)' }}>
                <span>Logistics</span>
                <Link href={`/dashboard/logistics/${deal.shipment_deals[0].shipments.id}`} style={{ color: 'var(--accent-teal)', textDecoration: 'underline' }}>
                  View Shipment
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Left Bottom: Inventory */}
        <div className="deal-info-panel" style={{ marginTop: '24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <div className="panel-title" style={{marginBottom:0}}>Inventory Units</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {role !== 'FINANCE' && role !== 'VIEW_ONLY' && (
                <button className="btn-ghost" style={{fontSize:'12px', color:'var(--text-muted)'}} onClick={()=>setShowInventoryModal(true)}>
                  Import Excel
                </button>
              )}
              <button className="btn-primary" style={{fontSize:'12px', padding: '6px 12px', background: 'var(--accent-indigo)', borderColor: 'var(--accent-indigo)'}} onClick={exportToPDF}>
                📄 Export to PDF
              </button>
            </div>
          </div>
          
          {deal.items && deal.items.length > 0 && (
            <div className="deals-table-wrap" style={{ marginBottom: '24px' }}>
              <div className="panel-title" style={{ padding: '0 16px 12px 16px', margin: 0 }}>Deal SKUs</div>
              <table className="deals-table" style={{border:'none', marginTop: 0}}>
                <thead style={{borderBottom:'1px solid var(--border-subtle)'}}>
                  <tr>
                    <th style={{paddingLeft:16}}>Model</th>
                    <th>Storage</th>
                    <th>Grade</th>
                    <th style={{textAlign:'right'}}>Stock + Fee Cost</th>
                    <th style={{textAlign:'right'}}>Shipping/Unit</th>
                    <th style={{textAlign:'right'}}>Total Cost/Unit</th>
                    <th style={{textAlign:'right'}}>Target Price</th>
                    <th style={{textAlign:'right'}}>Qty</th>
                    <th style={{textAlign:'right'}}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.items.map((item: any) => {
                    const skuSales = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1))
                    const qtySold = skuSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                    const availQty = Math.max(0, (item.quantity || 0) - qtySold)

                    // Shipment logistics cost per unit
                    const shipment = deal.shipment_deals?.[0]?.shipments
                    const totalShipmentUnits = shipment
                      ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0)
                      : 0
                    const shippingCostPerUnit = totalShipmentUnits > 0
                      ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits)
                      : 0

                    // Deal-level fee per unit (auction fee + order/other fees)
                    const dealFeePerUnit = deal.quantity > 0
                      ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity)
                      : 0

                    const unitBidCost = Number(item.unit_cost || 0)
                    const stockPlusFeeCost = unitBidCost + dealFeePerUnit
                    const totalCostPerUnit = stockPlusFeeCost + shippingCostPerUnit

                    const totalSalesRevenue = skuSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
                    const avgSalePrice = qtySold > 0 ? (totalSalesRevenue / qtySold) : 0
                    const totalCostOfSold = qtySold * totalCostPerUnit
                    const skuProfit = totalSalesRevenue - totalCostOfSold

                    return (
                      <tr key={item.id} style={{ borderBottom: qtySold > 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                        <td style={{paddingLeft:16, fontWeight:600}}>{item.model}</td>
                        <td>{item.storage || '-'}</td>
                        <td>{item.grade || '-'}</td>
                        <td style={{textAlign:'right'}}>{fmt(stockPlusFeeCost)}</td>
                        <td style={{textAlign:'right', color:'var(--accent-teal)'}}>{fmt(shippingCostPerUnit)}</td>
                        <td style={{textAlign:'right', fontWeight:600, color:'var(--accent-indigo)'}}>{fmt(totalCostPerUnit)}</td>
                        <td style={{textAlign:'right', fontWeight:600}}>{fmt(item.target_price)}</td>
                        <td style={{textAlign:'right', fontWeight: 600, color: availQty === 0 ? 'var(--text-muted)' : 'inherit'}}>{availQty}</td>
                        <td style={{textAlign:'right'}}>
                          {availQty > 0 && role !== 'VIEW_ONLY' && (
                            <button 
                              className="btn-ghost" 
                              style={{fontSize: '11px', padding: '4px 8px'}}
                              onClick={() => setMoveOnlineSku({ item, availQty, totalCostPerUnit })}
                            >
                              Move to Online
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {deal.items.map((item: any) => {
                    const skuSales = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1))
                    const qtySold = skuSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                    if (qtySold === 0) return null

                    const shipment = deal.shipment_deals?.[0]?.shipments
                    const totalShipmentUnits = shipment
                      ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0)
                      : 0
                    const shippingCostPerUnit = totalShipmentUnits > 0
                      ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits)
                      : 0

                    const dealFeePerUnit = deal.quantity > 0
                      ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity)
                      : 0

                    const unitBidCost = Number(item.unit_cost || 0)
                    const totalCostPerUnit = unitBidCost + dealFeePerUnit + shippingCostPerUnit

                    const totalSalesRevenue = skuSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
                    const avgSalePrice = qtySold > 0 ? (totalSalesRevenue / qtySold) : 0
                    const totalCostOfSold = qtySold * totalCostPerUnit
                    const skuProfit = totalSalesRevenue - totalCostOfSold

                    return (
                      <tr key={`detail-${item.id}`} style={{ background: 'var(--bg-elevated)', borderTop: '1px dashed var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <td colSpan={8} style={{ padding: '12px 16px', fontSize: '11px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Sales Detail ({item.model}): Sold {qtySold} of {item.quantity} units</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Avg Price: {fmt(avgSalePrice)}</span>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {skuSales.map((li: any) => {
                                const inv = li.invoices
                                if (!inv) return null
                                const invQty = li.quantity || 0
                                const invUnitPrice = Number(li.unit_price || 0)
                                const invRevenue = invQty * invUnitPrice
                                const invLandedCost = invQty * totalCostPerUnit
                                const invProfit = invRevenue - invLandedCost
                                
                                const isPaid = inv.status === 'PAID'
                                const invAmexProfit = isPaid ? (invQty * baseUnitCost * amexProfitMultiplier * 0.02) : 0

                                return (
                                  <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <Link 
                                        href={`/dashboard/sales/${inv.id}`} 
                                        className="deal-number-link" 
                                        style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                      >
                                        📄 {inv.invoice_number}
                                      </Link>
                                      <span style={{ color: 'var(--border-subtle)' }}>|</span>
                                      <span>Qty: <strong>{invQty}</strong> @ <strong>{fmt(invUnitPrice)}</strong></span>
                                      <span style={{ color: 'var(--text-muted)' }}>•</span>
                                      <span>Revenue: <strong>{fmtS(invRevenue)}</strong></span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>Landed Cost: <strong>{fmtS(invLandedCost)}</strong></span>
                                      <span style={{ 
                                        fontWeight: 700, 
                                        color: invProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)',
                                        background: invProfit >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        padding: '4px 8px',
                                        borderRadius: '4px'
                                      }}>
                                        Net Profit: {fmtS(invProfit)}
                                      </span>
                                      {amexProfitMultiplier > 0 && (
                                        <span style={{ 
                                          fontWeight: 600, 
                                          color: isPaid ? 'var(--accent-purple)' : 'var(--text-muted)',
                                          background: isPaid ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-hover)',
                                          padding: '4px 8px',
                                          borderRadius: '4px'
                                        }}>
                                          Amex Profit: {fmtS(invAmexProfit)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', paddingTop: '8px', marginTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
                                {(() => {
                                  const skuAmexProfit = skuSales.filter((li: any) => li.invoices?.status === 'PAID').reduce((sum: number, li: any) => sum + ((li.quantity || 0) * baseUnitCost * amexProfitMultiplier * 0.02), 0)
                                  return (
                                    <>
                                      <span>SKU NET PROFIT: <strong style={{ color: skuProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>{fmtS(skuProfit)}</strong></span>
                                      {amexProfitMultiplier > 0 && (
                                        <span>SKU AMEX PROFIT: <strong style={{ color: 'var(--accent-purple)' }}>{fmtS(skuAmexProfit)}</strong></span>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {deal.items.length > 1 && (() => {
                    const unattributedSales = (deal.invoice_line_items || []).filter((li: any) => !li.deal_item_id)
                    const unattributedQty = unattributedSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                    if (unattributedQty === 0) return null
                    return (
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{paddingLeft:16, fontWeight:600, color:'var(--text-muted)'}}>[Whole Deal Allocation]</td>
                        <td>-</td>
                        <td>-</td>
                        <td style={{textAlign:'right'}}>-</td>
                        <td style={{textAlign:'right'}}>-</td>
                        <td style={{textAlign:'right'}}>-</td>
                        <td style={{textAlign:'right'}}>-</td>
                        <td style={{textAlign:'right', fontWeight: 600, color: 'var(--accent-rose)'}}>-{unattributedQty}</td>
                      </tr>
                    )
                  })()}

                  {deal.items.length > 1 && (() => {
                    const unattributedSales = (deal.invoice_line_items || []).filter((li: any) => !li.deal_item_id)
                    const unattributedQty = unattributedSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                    if (unattributedQty === 0) return null
                    
                    const dealFeePerUnit = deal.quantity > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity) : 0
                    const shipment = deal.shipment_deals?.[0]?.shipments
                    const totalShipmentUnits = shipment ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0) : 0
                    const shippingCostPerUnit = totalShipmentUnits > 0 ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits) : 0
                    const totalCostPerUnit = (deal.unit_cost || 0) + dealFeePerUnit + shippingCostPerUnit
                    const unattributedTotalRevenue = unattributedSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
                    const unattributedProfit = unattributedTotalRevenue - (unattributedQty * totalCostPerUnit)

                    return (
                      <tr key="detail-unattributed" style={{ background: 'var(--bg-elevated)', borderTop: '1px dashed var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <td colSpan={8} style={{ padding: '12px 16px', fontSize: '11px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Sales Detail ([Whole Deal Allocation]): Sold {unattributedQty} units</span>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {unattributedSales.map((li: any) => {
                                const inv = li.invoices
                                if (!inv) return null
                                const invQty = li.quantity || 0
                                const invUnitPrice = Number(li.unit_price || 0)
                                const invRevenue = invQty * invUnitPrice
                                const invLandedCost = invQty * totalCostPerUnit
                                const invProfit = invRevenue - invLandedCost
                                
                                const isPaid = inv.status === 'PAID'
                                const invAmexProfit = isPaid ? (invQty * baseUnitCost * amexProfitMultiplier * 0.02) : 0

                                return (
                                  <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <Link 
                                        href={`/dashboard/sales/${inv.id}`} 
                                        className="deal-number-link" 
                                        style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                      >
                                        📄 {inv.invoice_number}
                                      </Link>
                                      <span style={{ color: 'var(--border-subtle)' }}>|</span>
                                      <span>Qty: <strong>{invQty}</strong> @ <strong>{fmt(invUnitPrice)}</strong></span>
                                      <span style={{ color: 'var(--text-muted)' }}>•</span>
                                      <span>Revenue: <strong>{fmtS(invRevenue)}</strong></span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>Landed Cost: <strong>{fmtS(invLandedCost)}</strong></span>
                                      <span style={{ 
                                        fontWeight: 700, 
                                        color: invProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)',
                                        background: invProfit >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        padding: '4px 8px',
                                        borderRadius: '4px'
                                      }}>
                                        Net Profit: {fmtS(invProfit)}
                                      </span>
                                      {amexProfitMultiplier > 0 && (
                                        <span style={{ 
                                          fontWeight: 600, 
                                          color: isPaid ? 'var(--accent-purple)' : 'var(--text-muted)',
                                          background: isPaid ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-hover)',
                                          padding: '4px 8px',
                                          borderRadius: '4px'
                                        }}>
                                          Amex Profit: {fmtS(invAmexProfit)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', paddingTop: '8px', marginTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
                                {(() => {
                                  const unattributedAmexProfit = unattributedSales.filter((li: any) => li.invoices?.status === 'PAID').reduce((sum: number, li: any) => sum + ((li.quantity || 0) * baseUnitCost * amexProfitMultiplier * 0.02), 0)
                                  return (
                                    <>
                                      <span>SKU NET PROFIT: <strong style={{ color: unattributedProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>{fmtS(unattributedProfit)}</strong></span>
                                      {amexProfitMultiplier > 0 && (
                                        <span>SKU AMEX PROFIT: <strong style={{ color: 'var(--accent-purple)' }}>{fmtS(unattributedAmexProfit)}</strong></span>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })()}

                  <tr>
                    <td colSpan={7} style={{paddingLeft:16, textAlign:'right', fontWeight:700, color:'var(--text-muted)', fontSize:'12px'}}>
                      <div style={{ display: 'flex', gap: '24px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <span>TOTAL REVENUE: <strong style={{ color: 'var(--text)' }}>{fmtS(deal.total_revenue || 0)}</strong></span>
                        {(() => {
                          const totalAmexProfit = (deal.invoice_line_items || []).filter((li: any) => li.invoices?.status === 'PAID').reduce((sum: number, li: any) => sum + ((li.quantity || 0) * baseUnitCost * amexProfitMultiplier * 0.02), 0)
                          
                          let pureNetProfit = 0
                          deal.items.forEach((item: any) => {
                            const skuSales = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1))
                            const qtySold = skuSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                            if (qtySold > 0) {
                              const shipment = deal.shipment_deals?.[0]?.shipments
                              const totalShipmentUnits = shipment ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0) : 0
                              const shippingCostPerUnit = totalShipmentUnits > 0 ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits) : 0
                              const dealFeePerUnit = deal.quantity > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity) : 0
                              const unitBidCost = Number(item.unit_cost || 0)
                              const totalCostPerUnit = unitBidCost + dealFeePerUnit + shippingCostPerUnit
                              const totalSalesRevenue = skuSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
                              pureNetProfit += (totalSalesRevenue - (qtySold * totalCostPerUnit))
                            }
                          })
                          if (deal.items.length > 1) {
                            const unattributedSales = (deal.invoice_line_items || []).filter((li: any) => !li.deal_item_id)
                            const unattributedQty = unattributedSales.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                            if (unattributedQty > 0) {
                              const dealFeePerUnit = deal.quantity > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / deal.quantity) : 0
                              const shipment = deal.shipment_deals?.[0]?.shipments
                              const totalShipmentUnits = shipment ? (shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0) : 0
                              const shippingCostPerUnit = totalShipmentUnits > 0 ? (Number(shipment.total_logistics_cost || 0) / totalShipmentUnits) : 0
                              const totalCostPerUnit = (deal.unit_cost || 0) + dealFeePerUnit + shippingCostPerUnit
                              const unattributedTotalRevenue = unattributedSales.reduce((sum: number, li: any) => sum + Number(li.total_price || (li.quantity * li.unit_price) || 0), 0)
                              pureNetProfit += (unattributedTotalRevenue - (unattributedQty * totalCostPerUnit))
                            }
                          }

                          return (
                            <>
                              <span>TOTAL NET PROFIT: <strong style={{ color: pureNetProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>{fmtS(pureNetProfit)}</strong></span>
                              {amexProfitMultiplier > 0 && (
                                <>
                                  <span>TOTAL AMEX PROFIT: <strong style={{ color: 'var(--accent-purple)' }}>{fmtS(totalAmexProfit)}</strong></span>
                                  <span>COMBINED PROFIT: <strong style={{ color: (pureNetProfit + totalAmexProfit) >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>{fmtS(pureNetProfit + totalAmexProfit)}</strong></span>
                                </>
                              )}
                            </>
                          )
                        })()}
                        <span>REMAINING QTY:</span>
                      </div>
                    </td>
                    <td style={{textAlign:'right', fontWeight:700, fontSize:'14px'}}>
                      {(() => {
                        const totalSkuRemaining = deal.items.reduce((total: number, item: any) => {
                          const qtySold = (deal.invoice_line_items || []).filter((li: any) => li.deal_item_id === item.id || (!li.deal_item_id && deal.items.length === 1)).reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                          return total + Math.max(0, (item.quantity || 0) - qtySold)
                        }, 0)
                        
                        if (deal.items.length > 1) {
                          const unattributedQty = (deal.invoice_line_items || [])
                            .filter((li: any) => !li.deal_item_id)
                            .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                          return Math.max(0, totalSkuRemaining - unattributedQty)
                        }
                        
                        return totalSkuRemaining
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          
          <div className="panel-title" style={{ padding: '0 16px 12px 16px', margin: 0 }}>Scanned IMEIs</div>
          {(!deal.inventory_items || deal.inventory_items.length === 0) ? (
            <p className="history-empty">No inventory units logged.</p>
          ) : (
            <div className="deals-table-wrap">
              <table className="deals-table" style={{border:'none', marginTop: 0}}>
                <thead style={{borderBottom:'1px solid var(--border-subtle)'}}>
                  <tr>
                    <th style={{paddingLeft:16}}>IMEI/Serial</th>
                    <th>Model</th>
                    <th>Loc</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.inventory_items.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{paddingLeft:16, fontWeight:600}}>{item.imei || item.serial_number || '-'}</td>
                      <td>{item.model}</td>
                      <td><span style={{fontSize:'10px', color:'var(--text-muted)'}}>{item.location}</span></td>
                      <td><span style={{fontSize:'10px', color:'var(--text-muted)'}}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Histories & Sales */}
        <div className="deal-history-panel">

          <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Documents</span>
            <div>
              <input 
                type="file" 
                ref={docInputRef} 
                style={{ display: 'none' }} 
                onChange={handleDocUpload}
              />
              {role !== 'VIEW_ONLY' && (
                <button 
                  className="btn-primary" 
                  style={{ padding: '4px 8px', fontSize: '11px', height: 'auto' }}
                  onClick={() => docInputRef.current?.click()}
                  disabled={docUploadPending}
                >
                  {docUploadPending ? 'Uploading...' : '+ Add Document'}
                </button>
              )}
            </div>
          </div>
          
          {(!deal.deal_documents || deal.deal_documents.length === 0) ? (
            <p className="history-empty" style={{ marginBottom: '24px' }}>No documents attached.</p>
          ) : (
            <div className="status-history-list" style={{ marginBottom: '24px' }}>
              {deal.deal_documents.map((doc: any) => (
                <div key={doc.id} style={{ border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', padding:'10px 12px', background:'var(--bg-elevated)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-indigo)', textDecoration: 'none' }}>
                      📄 {doc.file_name}
                    </a>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Uploaded: {fmtDate(doc.created_at)} • {(doc.file_size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  {role === 'SUPER_ADMIN' && (
                    <button 
                      className="btn-ghost" 
                      style={{ padding: '4px', fontSize: '11px', color: 'var(--accent-rose)' }}
                      onClick={() => handleDocDelete(doc.id, doc.file_url)}
                      title="Delete Document"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="panel-title">Sales & Invoices</div>
          {(!deal.invoice_line_items || deal.invoice_line_items.length === 0) ? (
            <p className="history-empty">No invoices linked to this deal.</p>
          ) : (
            <div className="status-history-list" style={{ marginBottom: '24px' }}>
              {deal.invoice_line_items.map((line: any) => {
                const inv = line.invoices
                if (!inv) return null
                return (
                  <div key={line.id} style={{ border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', padding:'12px', background:'var(--bg-elevated)', marginBottom: '8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                      <a href={`/dashboard/sales/${inv.id}`} className="deal-number-link" style={{fontSize: '13px'}}>{inv.invoice_number}</a>
                      <span style={{fontSize:'10px', fontWeight:700, color:'var(--text-muted)'}}>{inv.status}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                      Sold <strong>{line.quantity} units</strong> @ {fmtS(line.unit_price)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>
                      <span>Invoice Total: {fmtS(inv.total_amount)}</span>
                      <span>Date: {fmtD(inv.issue_date)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="panel-title">Status History</div>
          {statusHistory.length===0 ? (
            <p className="history-empty">No status changes yet.</p>
          ) : (
            <div className="status-history-list">
              {statusHistory.map((h:any)=>(
                <div key={h.id} className="sh-item">
                  <div className="sh-dot"/>
                  <div className="sh-body">
                    <div className="sh-top">
                      {h.old_status && (
                        <>
                          <span className={`status-badge ${st(h.old_status)?.color||''}`} style={{fontSize:'10px'}}>
                            {st(h.old_status)?.label}
                          </span>
                          <span className="sh-arrow">&rarr;</span>
                        </>
                      )}
                      <span className={`status-badge ${st(h.new_status)?.color||''}`} style={{fontSize:'10px'}}>
                        {st(h.new_status)?.label}
                      </span>
                    </div>
                    {h.notes && <p className="sh-note">&ldquo;{h.notes}&rdquo;</p>}
                    <span className="sh-when">{fmtDate(h.changed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="panel-title" style={{marginTop:'24px'}}>Edit History</div>
          {editHistory.length===0 ? (
            <p className="history-empty">No edits made yet.</p>
          ) : (
            <div className="edit-history">
              {editHistory.map((e:any)=>(
                <div key={e.id} className="edit-history-item">
                  <div className="edit-history-header">
                    <span className="edit-history-who">Edited</span>
                    <span className="edit-history-when">{fmtDate(e.edited_at)}</span>
                  </div>
                  {e.edit_note && <p className="edit-history-reason">&ldquo;{e.edit_note}&rdquo;</p>}
                  <div className="edit-field-changes">
                    {(e.field_changes as any[]).map((fc:any,i:number)=>(
                      <div key={i} className="edit-field-change">
                        <span className="efc-label">{fc.label}</span>
                        <span className="efc-old">{fc.old_value||'-'}</span>
                        <span className="efc-arrow">&rarr;</span>
                        <span className="efc-new">{fc.new_value||'-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advance Status Modal */}
      {showAdvance && targetStatus && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowAdvance(false)}}>
          <div className="modal-box" style={{maxWidth:'480px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Advance Deal Status</h2>
                <p className="modal-sub">{deal.deal_number}</p>
              </div>
              <button className="modal-close" onClick={()=>setShowAdvance(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="advance-status-preview">
                <div className="asp-from">
                  <span className="asp-label">Current</span>
                  <span className={`status-badge ${st(deal.status)?.color||''}`}>{st(deal.status)?.label}</span>
                </div>
                <span className="asp-arrow">&rarr;</span>
                <div className="asp-to">
                  <span className="asp-label">New Status</span>
                  <span className={`status-badge ${st(targetStatus)?.color||''}`}>{st(targetStatus)?.label}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note <span className="form-hint-inline">(optional — saved to history)</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Payment confirmed by SB team"
                  value={advanceNote}
                  onChange={(e:any)=>setAdvanceNote(e.target.value)}
                  onKeyDown={(e:any)=>{if(e.key==='Enter')handleAdvance()}}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={advanceDate}
                  onChange={(e:any) => setAdvanceDate(e.target.value)}
                  required
                />
                <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'6px'}}>
                  Accurate dates are important to track timeline metrics.
                </div>
              </div>
              {targetStatus === 'PAYMENT_REQUIRED' && deal.supplier === 'ATT' && (
                <div className="form-group" style={{marginTop: '12px'}}>
                  <label className="form-label">AT&T Invoice Number (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. ATT-INV-9999"
                    value={attInvoiceNumber}
                    onChange={(e:any) => setAttInvoiceNumber(e.target.value)}
                  />
                </div>
              )}
              {targetStatus === 'PAYMENT_REQUIRED' && deal.supplier !== 'ATT' && (
                <div className="form-group" style={{marginTop: '12px'}}>
                  <label className="form-label">Invoice Number (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. INV-9999"
                    value={attInvoiceNumber}
                    onChange={(e:any) => setAttInvoiceNumber(e.target.value)}
                  />
                </div>
              )}
              {['READY_FOR_PICKUP', 'IN_TRANSIT_USA', 'AT_SB_TECHNOLOGY', 'IN_TRANSIT_DUBAI', 'AT_TURBO_LOGISTICS', 'RECEIVED_BY_MOBITECH'].includes(targetStatus || '') && siblingDeals.length > 0 && (
                <div className="form-group" style={{marginTop:'16px'}}>
                  <label className="form-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Update other deals in shipment</span>
                    <button className="btn-ghost" style={{padding:'2px 8px',fontSize:'11px'}} onClick={(e)=>{
                      e.preventDefault()
                      if(selectedSiblingIds.length === siblingDeals.length) setSelectedSiblingIds([])
                      else setSelectedSiblingIds(siblingDeals.map((d:any)=>d.id))
                    }}>
                      {selectedSiblingIds.length === siblingDeals.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </label>
                  <div style={{border:'1px solid var(--border)', borderRadius:'var(--radius)', maxHeight:'120px', overflowY:'auto', padding:'8px', background:'var(--bg)'}}>
                    {siblingDeals.map((sd:any) => (
                      <label key={sd.id} style={{display:'flex', alignItems:'center', gap:'8px', padding:'4px 0', fontSize:'13px', cursor:'pointer'}}>
                        <input type="checkbox" 
                          checked={selectedSiblingIds.includes(sd.id)}
                          onChange={(e) => {
                            if(e.target.checked) setSelectedSiblingIds([...selectedSiblingIds, sd.id])
                            else setSelectedSiblingIds(selectedSiblingIds.filter(id => id !== sd.id))
                          }}
                        />
                        <span style={{fontWeight:500}}>{sd.deal_number}</span>
                        <span style={{color:'var(--text-muted)'}}>• Current: {st(sd.status)?.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'6px'}}>
                    Selected deals will also be advanced to {st(targetStatus!)?.label}.
                  </div>
                </div>
              )}
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowAdvance(false)}>Cancel</button>
                <button className="btn-advance" disabled={isPending} onClick={handleAdvance} id="confirm-advance-btn">
                  {isPending ? 'Updating...' : `Confirm: ${st(targetStatus)?.label}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && <EditDealModal deal={deal} onClose={()=>{setShowEdit(false);router.refresh()}}/>}

      {/* Inventory Upload Modal */}
      {showInventoryModal && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowInventoryModal(false)}}>
          <div className="modal-box" style={{maxWidth:'500px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Receive Inventory</h2>
                <p className="modal-sub">Upload an Excel (.xlsx) or CSV file with IMEIs</p>
              </div>
              <button className="modal-close" onClick={()=>setShowInventoryModal(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Upload File</label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center', background: 'var(--bg-elevated)', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Click to select a file</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Requires a column named "IMEI" or "Serial Number"</p>
                </div>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />
              </div>
              {uploadError && <div className="login-error">&#9888; {uploadError}</div>}
              {isPending && <div style={{textAlign:'center', marginTop:'16px', fontSize:'13px', color:'var(--accent-indigo)', fontWeight:600}}>Processing file...</div>}
            </div>
          </div>
        </div>
      )}

      {moveOnlineSku && (
        <MoveToOnlineModal 
          dealId={deal.id}
          dealItemId={moveOnlineSku.item.id}
          modelName={moveOnlineSku.item.model}
          maxQty={moveOnlineSku.availQty}
          totalLandedCost={moveOnlineSku.totalCostPerUnit}
          onClose={() => setMoveOnlineSku(null)}
        />
      )}
    </div>
  )
}
