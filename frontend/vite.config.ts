import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://api:8000',
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
        ws: true,  // habilita proxy de WebSocket (necessário para /api/v1/andon/ws)
        // Reescreve Location header em redirects para evitar que o browser
        // tente acessar o hostname interno do Docker (api:8000) diretamente.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            const location = proxyRes.headers['location'];
            if (location && location.includes('api:8000')) {
              proxyRes.headers['location'] = location.replace(
                /https?:\/\/api:8000/g,
                ''
              );
            }
          });
        },
      },
    },
  },
});
