import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";
import fs from "node:fs";
import tailwindcss from '@tailwindcss/vite'
import wranglerPagesFunctionsDev from './scripts/wrangler';

// Stamp dist/sw.js with the build timestamp so each deploy produces a
// byte-different service worker. Browsers diff sw.js to decide whether to
// fire an update; without a per-build delta installed PWAs would never see
// the "new version available" toast set up in App.tsx.
const stampSwBuildVersion = (): Plugin => ({
  name: 'stamp-sw-build-version',
  apply: 'build',
  closeBundle() {
    const swPath = path.resolve(__dirname, 'dist', 'sw.js');
    if (!fs.existsSync(swPath)) return;
    const version = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const src = fs.readFileSync(swPath, 'utf8');
    fs.writeFileSync(swPath, src.replace(/__BUILD_VERSION__/g, version));
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    stampSwBuildVersion(),
    !process.argv.includes('build') && wranglerPagesFunctionsDev({
      matchRoutes: [/^\/api/],
      displayWranglerLogs: true,
    }),
  ],
  server: {
    // port,
    // host: true,
    open: false,
    strictPort: true,
    watch: {
      ignored: [
        '**/docs/**', // tell vite to ignore watching `functions`
        '**/gateway-worker/**', // tell vite to ignore watching `functions`
        '**/workers/**', // tell vite to ignore watching `functions`
        '**/functions/**', // tell vite to ignore watching `functions`
        '**/**.html', // The following files will not refresh the website when changed
        '**/**.json', // The following files will not refresh the website when changed
      ],
      usePolling: true,
    },
    headers: {
      'Cache-Control': 'public, max-age=0',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8443',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          const parts = id.split('node_modules/').pop()?.split('/');
          if (!parts || parts.length === 0) return 'vendor';

          const dependency = parts[0].startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
          if (dependency === 'react' || dependency === 'react-dom') {
            return 'react-vendor';
          }
          return `vendor-${dependency.replace('@', '').replace('/', '-')}`;
        },
      },
    },
  },
})
