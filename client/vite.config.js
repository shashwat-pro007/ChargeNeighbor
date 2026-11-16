import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const extraHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    strictPort: false,
    // Only the hosts named by the environment are accepted, never a wildcard.
    allowedHosts: ['localhost', '127.0.0.1', ...extraHosts],
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/uploads': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3000),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
