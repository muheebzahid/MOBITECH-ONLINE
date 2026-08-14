'use client'

import { useState } from 'react'
import Link from 'next/link'

function fmtS(n: number) {
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

import { useQuery } from '@tanstack/react-query'
import { getClients } from '@/lib/clients/actions'

export default function ClientsClient({ clients }: { clients: any[] }) {
  const { data: currentClients = clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
    initialData: clients,
    staleTime: 120 * 1000,
  })

  const [searchQuery, setSearchQuery] = useState('')

  // Aggregate global metrics
  const activeClientsCount = currentClients.length
  const totalBilled = currentClients.reduce((sum: number, c: any) => sum + Number(c.total_billed || 0), 0)
  const totalCollected = currentClients.reduce((sum: number, c: any) => sum + Number(c.total_paid || 0), 0)
  const totalOutstanding = currentClients.reduce((sum: number, c: any) => sum + Number(c.total_outstanding || 0), 0)

  // Filter clients by search query
  const filteredClients = currentClients.filter((c: any) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Accounts</h1>
          <p className="page-subtitle">Manage wholesale customer accounts and track outstanding balances</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="log-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">Active Clients</span>
          <span className="log-sum-value">{activeClientsCount}</span>
          <span className="log-sum-sub">Unique accounts</span>
        </div>
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Total Invoiced</span>
          <span className="log-sum-value">{fmtS(totalBilled)}</span>
          <span className="log-sum-sub">Total billed sales</span>
        </div>
        <div className="log-sum-card log-sum-green">
          <span className="log-sum-label">Total Collected</span>
          <span className="log-sum-value">{fmtS(totalCollected)}</span>
          <span className="log-sum-sub">Received payments</span>
        </div>
        <div className="log-sum-card log-sum-orange">
          <span className="log-sum-label">Outstanding Receivables</span>
          <span className="log-sum-value" style={{ color: 'var(--accent-rose)' }}>{fmtS(totalOutstanding)}</span>
          <span className="log-sum-sub">Total balance due</span>
        </div>
      </div>

      {/* Search / Filter */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by client name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ maxWidth: '360px' }}
        />
      </div>

      {/* Clients Table */}
      {filteredClients.length === 0 ? (
        <div className="deals-empty">
          <div className="deals-empty-icon">👥</div>
          <h3>No clients found</h3>
          <p>Clients are automatically created when wholesale invoices are drafted.</p>
        </div>
      ) : (
        <div className="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '16px' }}>Client Name</th>
                <th>Contact Info</th>
                <th>Address</th>
                <th style={{ textAlign: 'center' }}>Invoices</th>
                <th style={{ textAlign: 'right' }}>Total Invoiced</th>
                <th style={{ textAlign: 'right' }}>Total Collected</th>
                <th style={{ textAlign: 'right' }}>Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => (
                <tr key={client.id} className="deal-row">
                  <td style={{ paddingLeft: '16px', fontWeight: 600 }}>
                    <Link href={`/dashboard/clients/${client.id}`} className="deal-number-link">
                      {client.name}
                    </Link>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px' }}>
                      {client.email && <span>{client.email}</span>}
                      {client.phone && <span style={{ color: 'var(--text-muted)' }}>{client.phone}</span>}
                      {!client.email && !client.phone && <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </div>
                  </td>
                  <td className="deal-date" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.address || '-'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {client.invoices_count}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmtS(client.total_billed)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-green)' }}>
                    {fmtS(client.total_paid)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: client.total_outstanding > 0 ? 'var(--accent-rose)' : 'inherit' }}>
                    {fmtS(client.total_outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
