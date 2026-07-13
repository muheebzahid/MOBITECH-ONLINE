import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mobitech ERP',
    short_name: 'Mobitech',
    description: 'Mobitech Internal Wholesale ERP Platform',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#1a1a1a',
    icons: [
      {
        src: '/icon.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'maskable'
      },
      {
        src: '/icon.jpg',
        sizes: '512x512',
        type: 'image/jpeg'
      }
    ],
  }
}
