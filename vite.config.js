import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // ...existing aliases...
    },
  },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'code/src/main.jsx'), // Update entry point
    },
  },
});
