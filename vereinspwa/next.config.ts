import type { NextConfig } from 'next'
// Use @ducanh2912/next-pwa – the only maintained fork with App Router support
// The original 'next-pwa' does NOT support Next.js 14 App Router.
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } },
      },
      {
        urlPattern: /\/api\/.*/,
        handler: 'NetworkFirst',
        options: { cacheName: 'api-calls', networkTimeoutSeconds: 10 },
      },
      {
        urlPattern: /\/_next\/static\/.*/,
        handler: 'CacheFirst',
        options: { cacheName: 'next-static', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } },
      },
    ],
  },
})

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
}

module.exports = withPWA(nextConfig)
