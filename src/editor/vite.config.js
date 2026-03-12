import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: path.resolve(__dirname, '../../assets'),
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core'),
      '@effects': path.resolve(__dirname, '../effects'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  test: {
    include: ['../__tests__/**/*.test.js'],
    environment: 'node',
  },
});
