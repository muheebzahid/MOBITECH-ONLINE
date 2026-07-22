'use client'

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

function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }

export default function ClientDetailClient({ client }: { client: any }) {
  const invoices = client.invoices || []

  return (
    <div className="page-root">
      {/* Header */}
      <div className="deal-detail-header" style={{ marginBottom: '24px' }}>
        <div className="dh-left">
          <Link href="/dashboard/clients" className="dh-back">
            &larr; Back to Client Accounts
          </Link>
          <div className="dh-title-row" style={{ marginTop: '8px' }}>
            <h1 className="page-title" style={{ margin: 0 }}>{client.name}</h1>
            <span style={{ fontSize: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              CLIENT ACCOUNT
            </span>
          </div>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="log-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">Total Invoiced</span>
          <span className="log-sum-value">{fmtS(client.total_billed)}</span>
          <span className="log-sum-sub">All active invoices</span>
        </div>
        <div className="log-sum-card log-sum-green">
          <span className="log-sum-label">Total Paid</span>
          <span className="log-sum-value">{fmtS(client.total_paid)}</span>
          <span className="log-sum-sub">Received payments</span>
        </div>
        <div className="log-sum-card log-sum-orange">
          <span className="log-sum-label">Outstanding Balance</span>
          <span className="log-sum-value" style={{ color: client.total_outstanding > 0 ? 'var(--accent-rose)' : 'inherit' }}>
            {fmtS(client.total_outstanding)}
          </span>
          <span className="log-sum-sub">Balance due</span>
        </div>
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Invoices Count</span>
          <span className="log-sum-value">{client.invoices_count}</span>
          <span className="log-sum-sub">Draft, issued &amp; paid</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="shipment-body-grid">
        
        {/* Client Profile Details */}
        <div className="deal-info-panel" style={{ height: 'fit-content' }}>
          <div className="panel-title">Account Details</div>
          <div className="info-group">
            <div className="info-row">
              <span>Account ID</span>
              <strong style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{client.id}</strong>
            </div>
            <div className="info-row">
              <span>Email Address</span>
              <strong>{client.email || '-'}</strong>
            </div>
            <div className="info-row">
              <span>Phone Number</span>
              <strong>{client.phone || '-'}</strong>
            </div>
            <div className="info-row">
              <span>Billing Address</span>
              <strong style={{ whiteSpace: 'pre-line', textAlign: 'right', maxWidth: '60%' }}>
                {client.address || '-'}
              </strong>
            </div>
            <div className="info-row">
              <span>Created On</span>
              <strong>{fmtD(client.created_at)}</strong>
            </div>
          </div>
        </div>

        {/* Client Invoices List */}
        <div className="deal-history-panel">
          <div className="panel-title">Invoices Account Statements</div>
          {invoices.length === 0 ? (
            <p className="history-empty">No invoices linked to this client account.</p>
          ) : (
            <div className="deals-table-wrap" style={{ border: 'none', background: 'transparent', padding: 0 }}>
              <table className="deals-table" style={{ border: 'none', marginTop: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ paddingLeft: '8px' }}>Invoice #</th>
                    <th>Status</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Qty Sold</th>
                    <th style={{ textAlign: 'right' }}>Total Amount</th>
                    <th style={{ textAlign: 'right' }}>Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const statusClass = inv.status === 'PAID' ? 'status-paid' : inv.status === 'DRAFT' ? 'status-draft' : inv.status === 'CANCELLED' ? 'status-cancelled' : 'status-pending'
                    const qty = inv.invoice_line_items ? inv.invoice_line_items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) : 0
                    return (
                      <tr key={inv.id}>
                        <td style={{ paddingLeft: '8px', fontWeight: 600 }}>
                          <Link href={`/dashboard/sales/${inv.id}`} className="deal-number-link">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }} className={statusClass}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="deal-date">{fmtD(inv.issue_date)}</td>
                        <td className="deal-date">{fmtD(inv.due_date)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{qty} units</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtS(inv.total_amount)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: inv.balance_due > 0 && inv.status !== 'CANCELLED' ? 'var(--accent-rose)' : 'inherit' }}>
                          {fmtS(inv.balance_due)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
