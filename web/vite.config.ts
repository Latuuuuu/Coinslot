import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Frontend lives in web/; the server serves the build from dist/public.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist/public', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // `npm run dev:web` talks to a local server started with WEB_ONLY=1.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
});
