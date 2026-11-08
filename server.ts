import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/api.js';
import { handleGlobalSearch } from './src/server/searchEngine.js';
import {
  handleDataExtraction,
  handleGetExtractionPermissions,
  handleUpdateExtractionPermission,
  handleGetAllowedDatasets,
  handleEstimateExtraction,
  handleGetExtractionHistory,
} from './src/server/extractionEngine.js';
import {
  handleListBackups,
  handleCreateBackup,
  handleExportFullDatabase,
  handleDownloadBackupFile,
} from './src/server/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Digital Asset Links route for Android TWA
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
  });

  // Prevent stale Service Worker and module caching on mobile browsers
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path === '/sw-push.js' ||
      req.path === '/sw.js' ||
      req.path.startsWith('/src/')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Serve clean Service Worker for both /sw.js and /sw-push.js so stale Workbox workers immediately update
  app.get(['/sw.js', '/sw-push.js'], (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'sw-push.js'));
  });

  // Static public directory
  app.use(express.static(path.join(__dirname, 'public')));

  // Global search endpoint: GET /recherche?q=...&type=...&page=...
  app.get('/recherche', handleGlobalSearch);

  // Server-side data extraction endpoint: GET /extractions/:jeu?format=csv|xlsx&du=...&au=...&filtres=...
  app.get('/extractions/droits', handleGetExtractionPermissions);
  app.put('/extractions/droits', handleUpdateExtractionPermission);
  app.post('/extractions/droits', handleUpdateExtractionPermission);
  app.get('/extractions/catalogue-autorise', handleGetAllowedDatasets);
  app.get('/extractions/historique', handleGetExtractionHistory);
  app.get('/extractions/estimer/:jeu', handleEstimateExtraction);
  app.get('/extractions/:jeu', handleDataExtraction);

  // Sauvegarde de la base complète SQLite (Réservée à l'Administrateur, 403 pour tout autre rôle)
  app.get('/sauvegardes', handleListBackups);
  app.post('/sauvegardes/creer', handleCreateBackup);
  app.post('/sauvegardes/exporter', handleExportFullDatabase);
  app.get('/sauvegardes/telecharger/:filename', handleDownloadBackupFile);
  app.post('/sauvegardes/telecharger/:filename', handleDownloadBackupFile);

  // API routes
  app.use('/api', apiRouter);
  app.post('/bons/:id/reveler', (req, res, next) => {
    req.url = `/bons/${req.params.id}/reveler`;
    apiRouter(req, res, next);
  });

  if (!isProduction) {
    process.env.DISABLE_HMR = 'true';
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true, hmr: false, watch: null },
        appType: 'spa',
      })
    );

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        if (req.url && req.url.startsWith('/@vite/client')) {
          try {
            const transformed = await vite.transformRequest(req.url);
            if (transformed?.code) {
              const safeClientCode = transformed.code
                .replace(
                  /const createWebSocketModuleRunnerTransport = \(options\) => \{[\s\S]*?return \{[\s\S]*?send\(data\) \{[\s\S]*?\}\s*\};\s*\};/,
                  'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, disconnect() {}, send() {} });'
                )
                .replace(
                  /reject\(\/\* @__PURE__ \*\/ new Error\("WebSocket closed without opened\."\)\);/g,
                  'resolve();'
                );
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
              return res.status(200).send(safeClientCode);
            }
          } catch (_err) {
            // Fall back to default Vite middleware if transform fails
          }
        }
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    // Ensure frontend build exists (prevents ENOENT on Render if build step was skipped)
    if (!fs.existsSync(indexHtmlPath)) {
      console.log('dist/index.html introuvable — lancement automatique de "npm run build"...');
      try {
        execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
      } catch (err) {
        console.error('Erreur lors de la génération du build frontend :', err);
      }
    }

    // Serve built frontend
    app.use(express.static(distDir));

    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(503).send('Application en cours de compilation, veuillez rafraîchir la page.');
      }
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Baobab Distribution server running on port ${PORT}`);
  });

  // Accept any Vite HMR / ping WebSocket upgrade so cached @vite/client instances never fail with "WebSocket closed without opened."
  httpServer.on('upgrade', (req, socket) => {
    socket.on('error', () => {});
    const key = req.headers['sec-websocket-key'];
    if (!key || typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    const protocolHeader = req.headers['sec-websocket-protocol'];
    const selectedProtocol =
      typeof protocolHeader === 'string' ? protocolHeader.split(',')[0].trim() : '';
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
    ];
    if (selectedProtocol) {
      responseHeaders.push(`Sec-WebSocket-Protocol: ${selectedProtocol}`);
    }
    try {
      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
      if (selectedProtocol === 'vite-hmr') {
        const payload = Buffer.from('{"type":"connected"}', 'utf8');
        const frame = Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
        socket.write(frame);
      }
      socket.on('data', () => {});
    } catch (_err) {
      // Ignore write errors on closed sockets
    }
  });
}

startServer();

