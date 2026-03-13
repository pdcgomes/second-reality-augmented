import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs/promises';

function screenshotSavePlugin() {
  return {
    name: 'screenshot-save',
    configureServer(server) {
      server.middlewares.use('/api/screenshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const { filename, data } = JSON.parse(body);
            const dir = path.resolve(__dirname, '../../assets/screenshots');
            await fs.mkdir(dir, { recursive: true });
            const base64 = data.replace(/^data:image\/png;base64,/, '');
            await fs.writeFile(path.join(dir, filename), Buffer.from(base64, 'base64'));
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `assets/screenshots/${filename}` }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), screenshotSavePlugin()],
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
