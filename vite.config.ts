import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// GitHub Pages: https://dequintalegione-boop.github.io/Nexora/
const base = process.env.GITHUB_PAGES === 'true' ? '/Nexora/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Nexora',
        short_name: 'Nexora',
        description: 'Персональная система управления жизнью, задачами и временем',
        theme_color: '#05060a',
        background_color: '#05060a',
        display: 'standalone',
        start_url: base,
        scope: base,
        lang: 'ru',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
