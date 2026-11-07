import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Inside Docker the API is reachable by its Compose service name.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// File-change events from a Windows host don't reach Linux containers, so poll there.
const usePolling = process.env.VITE_USE_POLLING === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    // Inside Docker (compose.dev.yaml) WEB_PORT is 3000; run natively it stays on Vite's 5173.
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    // IP addresses and localhost are always allowed; also accept mDNS names like my-pc.local
    // and the Tailscale HTTPS address (*.ts.net).
    // Keeping a host allow-list protects the dev server against DNS-rebinding attacks.
    allowedHosts: ['.local', '.ts.net'],
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
