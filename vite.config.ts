import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre-gl is loaded on demand; pre-bundling it avoids a mid-session dev-server reload.
  optimizeDeps: { include: ['maplibre-gl'] },
  // maplibre-gl is a large lazy chunk loaded only when a map mounts.
  build: { chunkSizeWarningLimit: 2000 },
});
