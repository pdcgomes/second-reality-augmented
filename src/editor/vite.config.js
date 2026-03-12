import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core'),
      '@effects': path.resolve(__dirname, '../effects'),
    },
  },
  test: {
    include: ['../__tests__/**/*.test.js'],
    environment: 'node',
  },
});
