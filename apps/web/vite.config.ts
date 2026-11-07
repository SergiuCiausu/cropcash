import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root for the whole monorepo. Only VITE_* vars reach the browser.
  envDir: '../../',
  server: {
    port: 5173,
    strictPort: true,
  },
});
