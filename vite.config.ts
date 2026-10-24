import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // mapbox-gl is loaded on demand; pre-bundling it avoids a mid-session dev-server reload.
  optimizeDeps: { include: ['mapbox-gl'] },
  // mapbox-gl is a ~1.9 MB lazy chunk (about 520 kB gzipped) loaded only when a map or token is used.
  build: { chunkSizeWarningLimit: 2000 },
});
