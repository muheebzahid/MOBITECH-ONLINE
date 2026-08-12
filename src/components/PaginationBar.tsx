'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface PaginationBarProps {
  page: number
  pageSize: number
  total: number
  baseUrl: string
}

export default function PaginationBar({ page, pageSize, total, baseUrl }: PaginationBarProps) {
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const hasPrev = page > 0
  const hasNext = page < totalPages - 1

  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)

  const createPageUrl = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', newPage.toString())
    return `${baseUrl}?${params.toString()}`
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      marginTop: '8px',
      fontSize: '13px',
      color: 'rgba(255,255,255,0.5)',
    }}>
      <span>
        Showing <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{from}–{to}</strong> of{' '}
        <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{total}</strong>
      </span>

      <div style={{ display: 'flex', gap: '8px' }}>
        {hasPrev ? (
          <Link
            href={createPageUrl(page - 1)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            ← Previous
          </Link>
        ) : (
          <span
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.2)',
              pointerEvents: 'none',
              cursor: 'default',
            }}
          >
            ← Previous
          </span>
        )}

        <span style={{
          padding: '6px 14px',
          borderRadius: '6px',
          background: 'rgba(99,102,241,0.2)',
          color: '#a5b4fc',
          border: '1px solid rgba(99,102,241,0.3)',
          fontWeight: 600,
        }}>
          {page + 1} / {totalPages}
        </span>

        {hasNext ? (
          <Link
            href={createPageUrl(page + 1)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            Next →
          </Link>
        ) : (
          <span
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.2)',
              pointerEvents: 'none',
              cursor: 'default',
            }}
          >
            Next →
          </span>
        )}
      </div>
    </div>
  )
}
