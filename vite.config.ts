import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Family Shop',
        short_name: 'FamilyShop',
        description: 'Shared family shopping list with a permanent master library',
        theme_color: '#1F3D2B',
        background_color: '#FFF8EF',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['shopping', 'lifestyle', 'utilities'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'family-shop-v5',
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest}'],
        importScripts: ['sw-push.js'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'family-shop-html-v5',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/') || url.hostname.endsWith('.workers.dev'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'open-food-facts',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
})
