import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Single page. `three` dominates the bundle, hence the raised chunk warning limit.
export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: { app: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
