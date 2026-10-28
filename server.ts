import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Serve built frontend if exists
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Baobab Distribution server running on port ${PORT}`);
});
