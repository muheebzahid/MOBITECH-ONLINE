'use client'

import { useState, useEffect } from 'react'
import { getSalesMemberNotifications } from '@/lib/audit/actions'

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getActionLabel(action: string, tableName: string, newData: any) {
  if (action === 'CREATE' && tableName === 'online_orders') {
    return `🛍️ New Online Order (${newData?.order_number || 'Order'}) Created`
  }
  if (action === 'CREATE' && tableName === 'invoices') {
    return `📄 New Sales Invoice (${newData?.customer_name || 'Invoice'}) Drafted`
  }
  if (action === 'IMEI_ASSIGNED' || action === 'ALLOCATED_TO_ONLINE') {
    return `📦 Device Allocated / Assigned to Online Sales`
  }
  if (action === 'STATUS_CHANGE') {
    return `🔄 ${tableName.replace('_', ' ').toUpperCase()} Status Changed to ${newData?.status || 'Updated'}`
  }
  if (action === 'DELETE') {
    return `🗑️ ${tableName.replace('_', ' ').toUpperCase()} Entry Deleted`
  }
  return `✏️ ${tableName.replace('_', ' ').toUpperCase()} Updated (${action})`
}

export default function SalesNotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [lastReadTime, setLastReadTime] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mobitech_sales_notif_last_read') || new Date(0).toISOString()
    }
    return new Date(0).toISOString()
  })

  const fetchNotifications = async () => {
    try {
      const logs = await getSalesMemberNotifications(50)
      setNotifications(logs)
    } catch (err) {
      console.error('Failed to fetch sales notifications:', err)
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Poll every 15 seconds for live real-time Master ERP updates from Online ERP
    const interval = setInterval(fetchNotifications, 15000)
    return () => clearInterval(interval)
  }, [])

  const unreadCount = notifications.filter(n => new Date(n.created_at) > new Date(lastReadTime)).length

  const handleOpen = () => {
    const now = new Date().toISOString()
    setLastReadTime(now)
    if (typeof window !== 'undefined') {
      localStorage.setItem('mobitech_sales_notif_last_read', now)
    }
    setIsOpen(!isOpen)
  }

  const handleMarkAllRead = () => {
    const now = new Date().toISOString()
    setLastReadTime(now)
    if (typeof window !== 'undefined') {
      localStorage.setItem('mobitech_sales_notif_last_read', now)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        id="sales-notif-bell-btn"
        style={{
          position: 'relative',
          background: isOpen ? 'var(--accent-purple)' : 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '8px 12px',
          color: isOpen ? '#fff' : 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
        }}
        title="Sales Activity Notifications (Live Cloud Feed)"
      >
        <span>🔔</span>
        <span style={{ fontSize: '12px' }}>Sales Updates</span>
        {unreadCount > 0 && (
          <span
            style={{
              background: 'var(--accent-red)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '10px',
              lineHeight: '1.2'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Drawer / Modal */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '46px',
            right: 0,
            width: '380px',
            maxHeight: '520px',
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                🔔 Sales Activity Notifications
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Live updates from Sales Team in Online ERP
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-purple)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Mark Read
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 12px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No recent sales activity notifications yet.
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread = new Date(item.created_at) > new Date(lastReadTime)
                const userEmail = item.new_data?._user?.email || item.old_data?._user?.email || 'sales@mobitech.com'
                const actionTitle = getActionLabel(item.action, item.table_name, item.new_data)

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: isUnread ? 'rgba(168, 85, 247, 0.08)' : 'var(--bg)',
                      border: isUnread ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid var(--border-subtle)',
                      marginBottom: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                        👤 {userEmail.split('@')[0]} <span style={{ background: 'var(--accent-purple)', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontSize: '9px', marginLeft: '4px' }}>SALES</span>
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: '12.5px', marginBottom: '4px', color: 'var(--text)' }}>
                      {actionTitle}
                    </div>

                    {/* Details Summary */}
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px' }}>
                      {item.new_data?.order_number && <div>Order Number: <strong>{item.new_data.order_number}</strong></div>}
                      {item.new_data?.total_amount !== undefined && <div>Amount: <strong>${Number(item.new_data.total_amount).toFixed(2)}</strong></div>}
                      {item.new_data?.imei && <div>Assigned IMEI: <strong>{item.new_data.imei}</strong></div>}
                      {item.new_data?.status && <div>Status: <strong>{item.new_data.status}</strong></div>}
                      {item.new_data?.customer_name && <div>Customer: <strong>{item.new_data.customer_name}</strong></div>}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border)',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}
          >
            ⚡ Master ERP Real-Time Cloud Listener
          </div>
        </div>
      )}
    </div>
  )
}
