import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs/promises';

function buildExportHTML(projectJSON, music0B64, music1B64, bundledJS) {
  const safeJS = bundledJS.replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Second Reality</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000}
canvas{display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
#overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;z-index:10;background:#000}
#overlay span{font-family:'Courier New',monospace;font-size:clamp(16px,3vw,32px);color:#ccc;letter-spacing:.15em;text-transform:uppercase;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.15}50%{opacity:1}}
#gh-link{position:fixed;top:10px;left:12px;display:inline-flex;align-items:center;gap:6px;color:rgba(255,255,255,.3);text-decoration:none;font-family:'Courier New',monospace;font-size:11px;z-index:5;transition:color .2s}
#gh-link:hover{color:rgba(255,255,255,.7)}
#gh-link svg{fill:currentColor}
#hud{position:fixed;top:10px;right:14px;font-family:'Courier New',monospace;font-size:13px;color:rgba(255,255,255,.45);pointer-events:none;z-index:5;display:flex;align-items:center;gap:8px}
#hud kbd{font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,.35);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-bottom-width:2px;border-radius:3px;padding:1px 5px;line-height:1.4}
</style>
</head>
<body>
<div id="overlay"><span>Press spacebar to start</span></div>
<canvas id="c1"></canvas>
<a id="gh-link" href="https://github.com/pdcgomes/second-reality-augmented" target="_blank" rel="noopener"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>pdcgomes/second-reality-augmented</a>
<div id="hud"></div>
<script>window.__DEMO_PROJECT__=${projectJSON};</script>
<script>window.__MUSIC0_B64__="${music0B64}";</script>
<script>window.__MUSIC1_B64__="${music1B64}";</script>
<script>${safeJS}</script>
</body>
</html>`;
}

function exportDemoPlugin() {
  return {
    name: 'export-demo',
    configureServer(server) {
      server.middlewares.use('/api/export', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('Method not allowed');
        }
        try {
          const assetsDir = path.resolve(__dirname, '../../assets');
          const playerEntry = path.resolve(__dirname, '../player/player-export.js');

          const esbuild = await import('esbuild');
          const result = await esbuild.build({
            entryPoints: [playerEntry],
            bundle: true,
            format: 'iife',
            write: false,
            target: 'es2020',
            logLevel: 'warning',
          });
          const bundledJS = result.outputFiles[0].text;

          const [music0, music1, projectJSON] = await Promise.all([
            fs.readFile(path.join(assetsDir, 'MUSIC0.S3M')),
            fs.readFile(path.join(assetsDir, 'MUSIC1.S3M')),
            fs.readFile(path.join(assetsDir, 'project.json'), 'utf-8'),
          ]);

          const html = buildExportHTML(
            projectJSON,
            music0.toString('base64'),
            music1.toString('base64'),
            bundledJS,
          );
          const rootDir = path.resolve(__dirname, '../..');
          await fs.writeFile(path.join(rootDir, 'U2.html'), html);

          const sizeMB = (html.length / (1024 * 1024)).toFixed(1);
          console.log(`Exported U2.html (${sizeMB} MB)`);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: 'U2.html', size: sizeMB }));
        } catch (err) {
          console.error('Export failed:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

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
  plugins: [react(), tailwindcss(), screenshotSavePlugin(), exportDemoPlugin()],
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
