import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000';
    // const proxyTarget = 'http://0.0.0.0:8000';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      watch: {
      usePolling: true,
      },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      allowedHosts: [
        'trendify-favoritos-frontend-498827330256.southamerica-east1.run.app',
      ],
    },
  };
});
