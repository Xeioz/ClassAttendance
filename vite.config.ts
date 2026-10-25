import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: { manifest: true },
  plugins: [
    react(),
    {
      name: 'production-security-policy',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; form-action 'none'; frame-src 'none'",
            },
            injectTo: 'head-prepend',
          },
        ],
      },
    },

    {
      name: 'offline-checklist',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify([
            ...new Set([
              ...Object.keys(bundle).filter((name) => /\.(html|js|css|wasm)$/.test(name)),
              'index.html',
              'icon.svg',
              'guide.html',
            ]),
          ]),
        });
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Attendance Desk',
        short_name: 'Attendance',
        description: 'Offline-capable browser-based attendance',
        theme_color: '#123b32',
        background_color: '#f5f6f2',
        display: 'browser',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      injectManifest: {
        // Precache is cache-first, including lazy scanner/export chunks. No CDN at runtime.
        globPatterns: ['**/*.{html,js,css,svg,png,ico,wasm,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
