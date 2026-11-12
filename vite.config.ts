import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The deployed API only allows CORS from http://localhost:5173 (`webOrigins` in infra/cdk.json). Fail loudly if the
  // port is taken (usually a stale dev server) instead of silently moving to a port the API rejects.
  server: { port: 5173, strictPort: true },
  // maplibre-gl is loaded on demand; pre-bundling it avoids a mid-session dev-server reload.
  optimizeDeps: { include: ['maplibre-gl'] },
  // maplibre-gl is a large lazy chunk loaded only when a map mounts.
  build: { chunkSizeWarningLimit: 2000 },
});
