'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRole } from '@/components/RoleProvider'



interface Props {
  user: User
  children: React.ReactNode
}

import { useQueryClient } from '@tanstack/react-query'

export default function DashboardShell({ user, children }: Props) {
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const role = useRole()

  const isExpanded = sidebarOpen || isHovered

  const handleLogout = async () => {
    queryClient.clear()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞', href: '/dashboard', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
    { id: 'deals', label: 'Deals', icon: '◈', href: '/dashboard/deals', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
    { id: 'inventory', label: 'Online Inventory', icon: '📦', href: '/dashboard/inventory', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
    { id: 'logistics', label: 'Logistics', icon: '◎', href: '/dashboard/logistics', roles: ['SUPER_ADMIN', 'FINANCE', 'LOGISTICS', 'VIEW_ONLY'] },
    { id: 'sales', label: 'Sales Invoices', icon: '📄', href: '/dashboard/sales', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
    { id: 'online-sales', label: 'Online Sales', icon: '🛒', href: '/dashboard/online-sales', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
    { id: 'clients', label: 'Clients', icon: '👤', href: '/dashboard/clients', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
    { id: 'accounting', label: 'Accounting', icon: '📊', href: '/dashboard/accounting', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
    { 
      id: 'analytics', 
      label: 'Analytics', 
      icon: '📈', 
      href: '/dashboard/analytics', 
      roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'],
      subItems: [
        { id: 'analytics-heatmap', label: 'Profitability Heatmap', href: '/dashboard/analytics?tab=heatmap' },
        { id: 'analytics-forecast', label: 'Procurement Forecast', href: '/dashboard/analytics?tab=forecast' }
      ]
    },
    { id: 'partners', label: 'Partners', icon: '🤝', href: '/dashboard/partners', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
    { id: 'finance', label: 'Treasury', icon: '🏦', href: '/dashboard/finance', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
    { id: 'admin', label: 'Admin', icon: '⚙️', href: '/dashboard/admin', roles: ['SUPER_ADMIN'] }
  ]

  const navItems = allNavItems.filter(item => item.roles.includes(role))

  return (
    <div className="erp-root" data-role={role}>
      {/* Sidebar */}
      <aside 
        className={`sidebar ${isExpanded ? 'sidebar-open' : 'sidebar-collapsed'}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#sgrad)" />
              <path d="M8 22L16 10L24 22H8Z" fill="white" opacity="0.9" />
              <defs>
                <linearGradient id="sgrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          {isExpanded && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Mobitech</span>
              <span className="sidebar-brand-sub">ERP Platform</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <div key={item.id} className="nav-group">
                <Link
                  href={item.href}
                  id={`nav-${item.id}`}
                  className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {isExpanded && <span className="nav-label">{item.label}</span>}
                  {isActive && <span className="nav-indicator" />}
                </Link>
                {/* Render sub-modules only if sidebar is expanded and parent is active */}
                {isExpanded && isActive && item.subItems && (
                  <div className="nav-subitems" style={{ paddingLeft: '44px', marginTop: '2px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {item.subItems.map(sub => (
                      <Link 
                        key={sub.id} 
                        href={sub.href} 
                        style={{ 
                          color: 'var(--text-muted)', 
                          fontSize: '13px', 
                          textDecoration: 'none', 
                          padding: '6px 0',
                          transition: 'color 0.2s',
                          display: 'block'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>


        {/* User section */}
        <div 
          className="sidebar-user" 
          style={{ 
            position: 'relative', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            padding: isExpanded ? '14px 12px' : '14px 0',
            minHeight: '60px'
          }}
        >
          <div className="user-avatar">{user.email?.charAt(0).toUpperCase()}</div>
          {isExpanded && (
            <div className="user-info" style={{ marginRight: '24px' }}>
              <span className="user-name">{user.email?.split('@')[0]}</span>
              <span className="user-role">{role.replace('_', ' ')}</span>
            </div>
          )}
          {isExpanded && (
            <button 
              id="logout-btn" 
              onClick={handleLogout} 
              className="logout-btn" 
              title="Sign out"
              style={{ marginRight: '16px' }}
            >
              ⏻
            </button>
          )}

          {/* Sidebar Collapse/Expand Toggle Arrow Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              position: 'absolute',
              bottom: '18px',
              right: isExpanded ? '10px' : '50%',
              transform: isExpanded ? 'none' : 'translateX(50%)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '9px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              transition: 'all var(--transition)',
              zIndex: 50
            }}
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay d-mobile-only" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Main Content */}
      <main className="erp-main">
        {/* Mobile App Header Bar */}
        <header className="mobile-top-bar d-mobile-only">
          <button 
            className="mobile-hamburger-btn" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Open Navigation Menu"
          >
            ☰
          </button>
          
          <div className="mobile-brand-title">
            <span className="mobile-app-name">Mobitech ERP</span>
          </div>

          <div className="mobile-user-badge">
            <span className="user-avatar-sm">{user.email?.charAt(0).toUpperCase()}</span>
          </div>
        </header>

        {children}

        {/* Mobile Bottom Dock Navigation Bar */}
        <nav className="mobile-bottom-dock d-mobile-only">
          {[
            { id: 'home', label: 'Home', icon: '⊞', href: '/dashboard', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
            { id: 'deals', label: 'Deals', icon: '◈', href: '/dashboard/deals', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
            { id: 'inventory', label: 'Stock', icon: '📦', href: '/dashboard/inventory', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
            { id: 'sales', label: 'Invoices', icon: '📄', href: '/dashboard/sales', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
            { id: 'online-sales', label: 'Online', icon: '🛒', href: '/dashboard/online-sales', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
            { id: 'clients', label: 'Clients', icon: '👤', href: '/dashboard/clients', roles: ['SUPER_ADMIN', 'FINANCE', 'SALES', 'VIEW_ONLY'] },
            { id: 'accounting', label: 'Finance', icon: '📊', href: '/dashboard/accounting', roles: ['SUPER_ADMIN', 'FINANCE', 'VIEW_ONLY'] },
            { id: 'logistics', label: 'Logistics', icon: '◎', href: '/dashboard/logistics', roles: ['SUPER_ADMIN', 'FINANCE', 'LOGISTICS', 'VIEW_ONLY'] }
          ].filter(dock => dock.roles.includes(role)).map(dock => {
            const isDockActive = pathname === dock.href || (dock.href !== '/dashboard' && pathname.startsWith(dock.href))
            return (
              <Link 
                key={dock.id} 
                href={dock.href}
                className={`mobile-dock-item ${isDockActive ? 'mobile-dock-active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="mobile-dock-icon">{dock.icon}</span>
                <span className="mobile-dock-label">{dock.label}</span>
              </Link>
            )
          })}
        </nav>
      </main>
    </div>
  )
}
