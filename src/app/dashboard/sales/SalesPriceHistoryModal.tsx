'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { SalesPriceHistorySummary } from '@/lib/sales/actions'

interface Props {
  isOpen: boolean
  onClose: () => void
  summary: SalesPriceHistorySummary | null
  isLoading?: boolean
  currentCustomerId?: string | null
  currentCustomerName?: string | null
}

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n)) return '-'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SalesPriceHistoryModal({
  isOpen,
  onClose,
  summary,
  isLoading,
  currentCustomerId,
  currentCustomerName
}: Props) {
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUSTOMER'>('ALL')

  if (!isOpen) return null

  const allItems = summary?.items || []
  const customerItems = allItems.filter(it => 
    (currentCustomerId && it.client_id === currentCustomerId) ||
    (currentCustomerName && it.customer_name?.toLowerCase().trim() === currentCustomerName.toLowerCase().trim())
  )

  const activeItems = filterMode === 'CUSTOMER' ? customerItems : allItems

  const titleModel = [summary?.queryModel, summary?.queryStorage, summary?.queryGrade].filter(Boolean).join(' ') || 'Item Sales History'

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: '820px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📊</span>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Sales Price History</h2>
            </div>
            <p className="modal-sub" style={{ margin: '4px 0 0', color: 'var(--accent-indigo)', fontWeight: 600, fontSize: '13px' }}>
              {titleModel}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '18px' }}>✕</button>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            Loading sales price history...
          </div>
        ) : !summary || allItems.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📦</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>No Previous Sales Found</div>
            <p style={{ fontSize: '13px', margin: '6px 0 0' }}>There are no recorded sales for this model/SKU yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
            
            {/* KPI Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Last Sold Price</div>
                <div style={{ fontSize: '19px', fontWeight: 700, color: 'var(--accent-indigo)', marginTop: '2px' }}>
                  {fmt(summary.lastSoldPrice)}
                </div>
                {summary.lastSoldDate && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {summary.lastSoldDate}
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Average Price (ASP)</div>
                <div style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {fmt(summary.avgSoldPrice)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Volume-weighted avg
                </div>
              </div>

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Price Range</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {fmt(summary.minSoldPrice)} - {fmt(summary.maxSoldPrice)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Min to Max
                </div>
              </div>

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Units Sold</div>
                <div style={{ fontSize: '19px', fontWeight: 700, color: '#22c55e', marginTop: '2px' }}>
                  {summary.totalUnitsSold.toLocaleString()} units
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {fmt(summary.totalRevenue)} total
                </div>
              </div>
            </div>

            {/* Customer Specific Callout if available */}
            {currentCustomerName && (
              <div style={{ 
                background: filterMode === 'CUSTOMER' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-elevated)', 
                border: filterMode === 'CUSTOMER' ? '1px solid var(--accent-indigo)' : '1px solid var(--border)', 
                borderRadius: 'var(--radius-sm)', 
                padding: '10px 14px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                flexWrap: 'wrap', 
                gap: '8px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>👤</span>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Customer: {currentCustomerName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '10px' }}>
                      {customerItems.length > 0 
                        ? `Last sold: ${fmt(summary.customerLastSoldPrice)} | Avg: ${fmt(summary.customerAvgSoldPrice)} (${summary.customerUnitsSold} units)`
                        : 'No prior sales to this customer'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setFilterMode('ALL')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: filterMode === 'ALL' ? 'var(--accent-indigo)' : 'transparent',
                      color: filterMode === 'ALL' ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    All Customers ({allItems.length})
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFilterMode('CUSTOMER')}
                    disabled={customerItems.length === 0}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: filterMode === 'CUSTOMER' ? 'var(--accent-indigo)' : 'transparent',
                      color: filterMode === 'CUSTOMER' ? '#fff' : 'var(--text-secondary)',
                      cursor: customerItems.length > 0 ? 'pointer' : 'not-allowed',
                      opacity: customerItems.length > 0 ? 1 : 0.5,
                      fontWeight: 600
                    }}
                  >
                    This Customer ({customerItems.length})
                  </button>
                </div>
              </div>
            )}

            {/* Historical Invoices Table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Invoice #</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Customer</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Unit Sales Price</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map((item, idx) => {
                      const isThisCustomer = (currentCustomerId && item.client_id === currentCustomerId) ||
                        (currentCustomerName && item.customer_name?.toLowerCase().trim() === currentCustomerName.toLowerCase().trim())
                      return (
                        <tr 
                          key={item.id || idx} 
                          style={{ 
                            borderBottom: '1px solid var(--border)',
                            background: isThisCustomer ? 'rgba(99, 102, 241, 0.04)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                            <Link 
                              href={`/dashboard/sales/${item.invoice_id}`}
                              target="_blank"
                              style={{ color: 'var(--accent-indigo)', textDecoration: 'none' }}
                            >
                              📄 {item.invoice_number}
                            </Link>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                            {item.issue_date || '-'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: isThisCustomer ? 600 : 400 }}>
                            {item.customer_name}
                            {isThisCustomer && (
                              <span style={{ marginLeft: '6px', fontSize: '10px', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-indigo)', padding: '1px 5px', borderRadius: '3px' }}>
                                Current
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {fmt(item.unit_price)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {fmt(item.total_price)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose} style={{ padding: '6px 18px', fontSize: '12px' }}>
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
