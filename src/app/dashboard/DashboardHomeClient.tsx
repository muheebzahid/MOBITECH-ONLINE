'use client'

const kpiCards = [
  { label: 'Active Deals', value: '—', sub: 'No data yet', color: 'kpi-purple' },
  { label: 'Amex Utilised', value: '—', sub: 'of $500,000 limit', color: 'kpi-blue' },
  { label: 'Cash Deployed', value: '—', sub: 'of $300,000 pool', color: 'kpi-amber' },
  { label: 'Net Profit (MTD)', value: '—', sub: 'Month to date', color: 'kpi-green' },
  { label: 'Inventory Value', value: '—', sub: 'At Dubai warehouse', color: 'kpi-indigo' },
  { label: 'Outstanding A/R', value: '—', sub: 'Wholesale + Online', color: 'kpi-rose' },
]

export default function DashboardHomeClient() {
  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Welcome back · {new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="header-right">
          <div className="header-badge header-badge-green">● System Online</div>
          <div className="header-badge header-badge-amber">⚠ Amex cutoff in — days</div>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <div key={card.label} className={`kpi-card ${card.color}`}>
            <div className="kpi-label">{card.label}</div>
            <div className="kpi-value">{card.value}</div>
            <div className="kpi-sub">{card.sub}</div>
          </div>
        ))}
      </section>

      {/* Coming Soon Modules */}
      <section className="modules-grid">
        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">⚡</span>
            <h2 className="module-title">Recent Deals</h2>
          </div>
          <div className="module-empty">
            <p>No deals yet. Add your first auction win to get started.</p>
            <button id="new-deal-btn" className="btn-primary" disabled>+ New Deal <span className="coming-soon">Coming Soon</span></button>
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">◉</span>
            <h2 className="module-title">Treasury Alerts</h2>
          </div>
          <div className="module-empty">
            <p>No active treasury alerts. Amex and Cash Pool tracking will appear here.</p>
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">◑</span>
            <h2 className="module-title">Partner Balances</h2>
          </div>
          <div className="partner-rows">
            {['Muheeb', 'Beshair', 'Faisal'].map((partner) => (
              <div key={partner} className="partner-row">
                <div className="partner-avatar">{partner[0]}</div>
                <div className="partner-details">
                  <span className="partner-name">{partner}</span>
                  <span className="partner-share">33.33% share</span>
                </div>
                <div className="partner-balance">—</div>
              </div>
            ))}
          </div>
        </div>

        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">▦</span>
            <h2 className="module-title">Inventory Summary</h2>
          </div>
          <div className="module-empty">
            <p>Inventory will populate once the first deal is received at the Dubai warehouse.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
