import { defineConfig } from 'vite';

export default defineConfig({
  // Serve the existing vanilla HTML/CSS/JS frontend as-is
  root: 'src/public',

  server: {
    port: 5173,          // Vite auto-tries next port if this is busy — no EADDRINUSE ever
    strictPort: false,
    open: true,          // auto-open browser on npm run dev

    proxy: {
      // Forward all /api/* requests to the Express backend
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  }
});
