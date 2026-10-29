import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Digital Asset Links route for Android TWA
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
  });

  // Static public directory
  app.use(express.static(path.join(__dirname, 'public')));

  // API routes
  app.use('/api', apiRouter);
  app.post('/bons/:id/reveler', (req, res, next) => {
    req.url = `/bons/${req.params.id}/reveler`;
    apiRouter(req, res, next);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Baobab Distribution server running on port ${PORT}`);
  });
}

startServer();

