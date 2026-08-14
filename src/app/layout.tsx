import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mobitech ERP | Operations & Finance Platform',
  description: 'Private ERP platform for Mobitech Wireless, SB Technology, and Turbo Logistics.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Mobitech ERP',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icon.svg',
  }
}

import Providers from '@/components/Providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
