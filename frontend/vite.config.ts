import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const compatEnv: Record<string, string> = {
    NODE_ENV: mode,
  };

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('REACT_APP_')) compatEnv[key] = value;
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pulse_logo.webp'],
        manifest: {
          name: 'Pulse Chat',
          short_name: 'Pulse',
          description: 'A premium, real-time chat application for seamless communication.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          icons: [
            {
              src: 'favicon_io/android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'favicon_io/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'favicon_io/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
      })
    ],
    server: {
      port: 3000,
      host: true,
    },
    preview: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: 'build',
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            if (!moduleId.includes('node_modules')) return;
            if (moduleId.includes('react-router-dom') || moduleId.includes('react-router') || moduleId.includes('@remix-run/router')) {
              return 'router-vendor';
            }
            if (moduleId.includes('react-dom')) {
              return 'react-dom-vendor';
            }
            if (moduleId.includes('/react/')) {
              return 'react-core-vendor';
            }
            if (moduleId.includes('styled-components')) {
              return 'ui-vendor';
            }
            if (moduleId.includes('emoji-picker-react')) {
              return 'emoji-vendor';
            }
            if (moduleId.includes('react-virtuoso')) {
              return 'virtuoso-vendor';
            }
            if (moduleId.includes('@use-gesture/react')) {
              return 'gesture-vendor';
            }
            return 'vendor';
          },
        },
      },
    },
    envPrefix: ['VITE_', 'REACT_APP_'],
    define: {
      'process.env': compatEnv,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      globals: true,
    },
  };
});
