import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build du frontend IDREM TERESHKOVA BOT.
 *
 * - Par défaut, `base: '/'` : le dossier `frontend/dist` est servi par le
 *   serveur Express du backend (déploiement unique sur Render / Railway / VPS).
 * - Pour GitHub Pages (sous-dossier), builder avec :
 *     VITE_BASE_PATH=/nom-du-repo/ npm run build
 *   Le routeur utilise automatiquement `import.meta.env.BASE_URL`.
 *
 * En développement, Vite proxy `/api` vers le backend local (port 3000),
 * ce qui évite tout problème CORS.
 */
const basePath = process.env.VITE_BASE_PATH || '/';
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
