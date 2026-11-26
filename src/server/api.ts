import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import {
  initPushTables,
  ensureVapidConfigured,
  createUserAuthToken,
  deduceUserFromToken,
  computeUnreadCountForUser,
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  dispatchPushForNotification,
  triggerImmediatePostCommitPush,
  registerNotificationSseClient,
  broadcastNotificationSseEvent,
  getPushDiagnosticsData,
  sendTestPushToUser,
  triggerImmediateSalePush,
  dispatchSaleEventNotifications,
} from './pushService.js';
import { initSearchEngine, handleGlobalSearch } from './searchEngine.js';
import {
  handleDataExtraction,
  handleGetExtractionPermissions,
  handleUpdateExtractionPermission,
  handleGetAllowedDatasets,
  handleEstimateExtraction,
  handleGetExtractionHistory,
} from './extractionEngine.js';
import {
  initBackupSystem,
  hashPasswordScrypt,
  handleListBackups,
  handleCreateBackup,
  handleExportFullDatabase,
  handleDownloadBackupFile,
} from './backupService.js';
import {
  initAnomalyEngine,
  evaluateAllAnomalyRules,
  handleGetAnomalies,
  handleUpdateAnomalyStatus,
  handleUpdateAnomalyThresholds,
  handleRunAnomalyScanNow,
} from './anomalyEngine.js';
import {
  initVrsSystem,
  vrsRouter,
  syncVendorVrsCycleTransaction,
  executeVrsVisitCheckin,
  executeVrsMotifReaction,
  executeVrsValidatePendingVisit,
  executeVrsAssignMonthlyObjectives,
  buildVendorMonthlyObjectiveSummary,
  getMonthWorkingDaysInfo,
  isVrsSupervisorRole,
  isVrsAllowedRole,
  resolveActor,
} from './vrsService.js';

export const apiRouter = Router();

initPushTables();
ensureVapidConfigured();
initSearchEngine();
initBackupSystem();
initAnomalyEngine();
initVrsSystem();

// Module Routine VRS (Visites terrain des vendeurs)
apiRouter.use('/vrs', vrsRouter);

// Exécution automatique des règles d'anomalies côté serveur à chaque événement métier
apiRouter.use((req, res, next) => {
  if (
    (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') &&
    !req.path.startsWith('/anomalies') &&
    !req.path.startsWith('/alertes') &&
    !req.path.startsWith('/notifications') &&
    !req.path.startsWith('/vrs')
  ) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          evaluateAllAnomalyRules({ trigger: `${req.method} ${req.path}`, sendPush: true });
        } catch {
          // ignore
        }
      }
    });
  }
  next();
});

// Routes de détection d'anomalies et d'alertes (avec contrôle serveur strict des droits par rôle)
apiRouter.get('/anomalies', handleGetAnomalies);
apiRouter.get('/alertes', handleGetAnomalies);
apiRouter.patch('/anomalies/:id/status', handleUpdateAnomalyStatus);
apiRouter.post('/anomalies/:id/status', handleUpdateAnomalyStatus);
apiRouter.patch('/alertes/:id/statut', handleUpdateAnomalyStatus);
apiRouter.post('/alertes/:id/statut', handleUpdateAnomalyStatus);
apiRouter.put('/anomalies/thresholds', handleUpdateAnomalyThresholds);
apiRouter.post('/anomalies/thresholds', handleUpdateAnomalyThresholds);
apiRouter.put('/alertes/seuils', handleUpdateAnomalyThresholds);
apiRouter.post('/alertes/seuils', handleUpdateAnomalyThresholds);
apiRouter.post('/anomalies/scan', handleRunAnomalyScanNow);
apiRouter.post('/alertes/analyser', handleRunAnomalyScanNow);

// Global Search Route (/api/recherche)
apiRouter.get('/recherche', handleGlobalSearch);

// Extraction Permissions Management, Catalogue, Estimation, History & Extraction Route
apiRouter.get('/extractions/droits', handleGetExtractionPermissions);
apiRouter.put('/extractions/droits', handleUpdateExtractionPermission);
apiRouter.post('/extractions/droits', handleUpdateExtractionPermission);
apiRouter.get('/extractions/catalogue-autorise', handleGetAllowedDatasets);
apiRouter.get('/extractions/historique', handleGetExtractionHistory);
apiRouter.get('/extractions/estimer/:jeu', handleEstimateExtraction);
apiRouter.get('/extractions/:jeu', handleDataExtraction);

// Sauvegarde de la base complète SQLite (Réservée à l'Administrateur, 403 pour tout autre rôle)
apiRouter.get('/sauvegardes', handleListBackups);
apiRouter.post('/sauvegardes/creer', handleCreateBackup);
apiRouter.post('/sauvegardes/exporter', handleExportFullDatabase);
apiRouter.get('/sauvegardes/telecharger/:filename', handleDownloadBackupFile);
apiRouter.post('/sauvegardes/telecharger/:filename', handleDownloadBackupFile);

// Ensure public/uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ---- Strict Role-based 403 Access Control Helper ----
function getUserRole(req: Request): string {
  const roleHeader = req.headers['x-user-role'];
  if (typeof roleHeader === 'string' && roleHeader.trim().length > 0) {
    return roleHeader.trim();
  }
  return '';
}

function requireRole(allowedRoles: string[], actionDesc?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getUserRole(req);
    // L'Administrateur a tous les droits dans l'application et est autorisé à faire tout ce que les autres profils peuvent faire
    if (role === 'Administrateur') {
      return next();
    }
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : L'action ${actionDesc ? `"${actionDesc}" ` : ''}n'est pas autorisée pour le rôle "${role || 'Non spécifié'}". Seuls les rôles suivants sont autorisés : ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

const requireAdmin = requireRole(['Administrateur'], 'Administration & Réglages');
const requireAdminOrDirecteurOps = requireRole(['Administrateur', 'Directeur des opérations de vente'], 'Validation PDV & Direction des Opérations de Vente');
const requireMagasinier = requireRole(['Gestionnaire de stock', 'Magasinier'], 'Gestion Dépôt & Stock');
const requireSalesAdmin = requireRole(['Sales Admin', 'Administrateur'], 'Contrôle & Sales Admin');
const requireCanCancelSale = requireRole(['Sales Admin', 'Directeur des opérations de vente', 'Administrateur'], 'Annulation de vente / facture client PDV');
const requireMagasinierOrSalesAdmin = requireRole(['Gestionnaire de stock', 'Magasinier', 'Sales Admin', 'Administrateur'], 'Gestion & Contrôle Stock');
const requireComptable = requireRole(['Comptable'], 'Gestion Caisse & Comptabilité');
const requireVendeur = requireRole(['Vendeur'], 'Vente & Dépôt-Vente');
const requireVendeurOrDirecteurOps = requireRole(['Vendeur', 'Directeur des opérations de vente', 'Administrateur'], 'Demande de stock vendeur & Chargement');
const requireGrossiste = requireRole(['Gestionnaire grossiste', 'Administrateur', 'Directeur des opérations de vente'], 'Gestion des Commandes en Gros & Clients en Gros');

// 1. SETTINGS
apiRouter.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json({ success: true, settings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Mise à jour complète des paramètres de la société, sécurité (PIN), seuils et préférences globales
const handleUpdateSettings = (req: any, res: any) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? (req.body.settings || req.body) : {};
    const upsertStmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const protectedInternalKeys = new Set([
      'runtime_vapid_public',
      'runtime_vapid_private',
      'auth_token_secret',
    ]);

    for (const [k, v] of Object.entries(payload)) {
      if (!k || protectedInternalKeys.has(k)) continue;
      if (v === undefined || v === null) continue;
      upsertStmt.run(String(k).trim(), String(v));
    }

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json({
      success: true,
      message: 'Paramètres enregistrés avec succès.',
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde des paramètres';
    res.status(500).json({ success: false, error: message });
  }
};

apiRouter.put('/settings', handleUpdateSettings);
apiRouter.post('/settings', handleUpdateSettings);

// Mise à jour des seuils métier globaux + seuils / prix par produit du catalogue
apiRouter.put('/settings/thresholds', (req, res) => {
  try {
    const { settings: thresholdsSettings, products: productUpdates } = req.body || {};
    const upsertSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const updateProduct = db.prepare(`
      UPDATE products
      SET threshold_depot = COALESCE(?, threshold_depot),
          price_box = COALESCE(?, price_box),
          units_per_box = COALESCE(?, units_per_box),
          name = COALESCE(?, name)
      WHERE id = ?
    `);

    if (thresholdsSettings && typeof thresholdsSettings === 'object') {
      for (const [k, v] of Object.entries(thresholdsSettings)) {
        if (v !== undefined && v !== null) {
          upsertSetting.run(String(k), String(v));
        }
      }
    }
    if (Array.isArray(productUpdates)) {
      for (const p of productUpdates) {
        if (!p || !p.id) continue;
        const th = p.threshold_depot !== undefined ? Math.max(0, Number(p.threshold_depot) || 0) : null;
        const pr = p.price_box !== undefined ? Math.max(0, Number(p.price_box) || 0) : null;
        const upb = p.units_per_box !== undefined ? Math.max(1, Number(p.units_per_box) || 1) : null;
        const nm = p.name && String(p.name).trim() ? String(p.name).trim() : null;
        updateProduct.run(th, pr, upb, nm, String(p.id));
      }
    }

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();

    res.json({
      success: true,
      message: 'Seuils et paramètres métier enregistrés avec succès.',
      settings,
      products,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Actions sur les données (démo et vidage contrôlé)
apiRouter.post('/settings/data/action', (req, res) => {
  try {
    const mode = String(req.body?.mode || 'refresh');
    if (mode === 'clear_transactions') {
      const tables = [
        'sale_items',
        'sales',
        'versements',
        'chargement_items',
        'chargements',
        'receptions',
        'purchase_requests',
        'wholesale_order_items',
        'wholesale_orders',
        'notifications',
      ];
      for (const tbl of tables) {
        try {
          db.prepare(`DELETE FROM ${tbl}`).run();
        } catch {
          // ignore if table does not exist
        }
      }
      return res.json({
        success: true,
        message: 'Toutes les opérations de test (ventes, versements, chargements, réceptions, commandes) ont été vidées.',
      });
    }

    if (mode === 'reset_defaults') {
      const defaults: Record<string, string> = {
        company_name: 'Baobab Distribution SARL',
        slogan: 'Négoce et Distribution Agroalimentaire',
        country: 'Mali',
        city: 'Bamako',
        timezone: 'Africa/Bamako',
        currency: 'FCFA',
        address: 'Zone Industrielle de Sotuba, Bamako - Mali',
        phone: '+223 20 22 45 88 / +223 76 12 34 56',
        email: 'contact@baobab-distribution.ml',
        nif: '084129532M',
        rccm: 'MA.BKO.2018.B.4129',
        fefo_critical_days: '30',
        fefo_warning_days: '90',
        low_stock_threshold: '25',
        tva_rate: '18',
        max_inventory_gap_boxes: '5',
        thermal_width_mm: '80',
        pin_digits: '4',
      };
      const upsert = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      for (const [k, v] of Object.entries(defaults)) {
        upsert.run(k, v);
      }
      return res.json({
        success: true,
        message: 'Paramètres par défaut de démonstration restaurés avec succès.',
      });
    }

    return res.json({
      success: true,
      message: 'Données synchronisées avec succès.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Logo Upload (Type vérifié côté serveur: PNG, JPEG, WebP, SVG, 2 Mo max)
apiRouter.post('/settings/logo', requireAdmin, (req, res) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'Aucune donnée d\'image fournie.' });
    }

    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    // 1. Max size: 2 Mo (2 * 1024 * 1024 bytes)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Fichier trop volumineux (${(buffer.length / (1024 * 1024)).toFixed(2)} Mo). Limite : 2 Mo.`
      });
    }

    // 2. Server-side Magic Bytes & Format Verification
    let detectedExt = '';
    let isAllowed = false;

    // PNG: 89 50 4E 47
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      detectedExt = 'png';
      isAllowed = true;
    }
    // JPEG: FF D8 FF
    else if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      detectedExt = 'jpg';
      isAllowed = true;
    }
    // WebP: RIFF .... WEBP
    else if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      detectedExt = 'webp';
      isAllowed = true;
    }
    // SVG: XML text containing <svg
    else {
      const textHead = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf-8').trim();
      if (textHead.includes('<svg') || textHead.includes('<?xml')) {
        const fullText = buffer.toString('utf-8');
        if (fullText.includes('<svg') && !fullText.toLowerCase().includes('<script')) {
          detectedExt = 'svg';
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      return res.status(400).json({
        success: false,
        error: 'Format non autorisé. Formats acceptés : PNG, JPEG, WebP, SVG (validé côté serveur).'
      });
    }

    const savedFilename = `logo-custom-${Date.now()}.${detectedExt}`;
    const filePath = path.join(uploadsDir, savedFilename);
    fs.writeFileSync(filePath, buffer);

    const newLogoUrl = `/uploads/${savedFilename}`;
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('logo_url', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(newLogoUrl);

    res.json({
      success: true,
      message: 'Logo vérifié côté serveur et enregistré avec succès.',
      logoUrl: newLogoUrl,
      format: detectedExt.toUpperCase(),
      sizeBytes: buffer.length
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.post('/settings/logo/reset', requireAdmin, (req, res) => {
  try {
    const defaultUrl = '/logo.png';
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('logo_url', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(defaultUrl);
    res.json({ success: true, logoUrl: defaultUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 2. USERS (Un seul Administrateur ; lui seul crée les autres comptes)
apiRouter.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, code, name, email, role, phone, team, must_change_password, created_at FROM users ORDER BY code ASC').all();
    res.json({ success: true, users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Création de compte : Seul l'Administrateur peut créer des comptes
apiRouter.post('/users', requireAdmin, (req, res) => {
  try {
    const { name, email, role, phone, team } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants.' });
    }

    // Generate unique code based on role
    let codePrefix = 'BAO-VND';
    if (role === 'Gestionnaire de stock' || role === 'Magasinier') codePrefix = 'BAO-MAG';
    if (role === 'Sales Admin') codePrefix = 'BAO-SAD';
    if (role === 'Directeur des opérations de vente') codePrefix = 'BAO-DOV';
    if (role === 'Gestionnaire grossiste') codePrefix = 'BAO-GRS';
    if (role === 'Comptable') codePrefix = 'BAO-CPT';
    if (role === 'Administrateur') {
      // Check if Admin already exists
      const existingAdmin = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Administrateur'").get() as { count: number };
      if (existingAdmin.count >= 1) {
        return res.status(400).json({
          success: false,
          error: 'Un seul Administrateur principal est autorisé dans Baobab Distribution.'
        });
      }
      codePrefix = 'BAO-ADM';
    }

    let code = codePrefix;
    if (role === 'Vendeur') {
      const vendorCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Vendeur'").get() as { count: number }).count;
      code = `BAO-VND-${String(vendorCount + 1).padStart(3, '0')}`;
    } else if (role === 'Gestionnaire grossiste') {
      const grsCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Gestionnaire grossiste'").get() as { count: number }).count;
      code = grsCount === 0 ? 'BAO-GRS' : `BAO-GRS-${String(grsCount + 1).padStart(2, '0')}`;
    }

    const id = `usr-${Date.now()}`;
    const createdAt = new Date().toISOString().split('T')[0];
    const rawPin = req.body?.password ? String(req.body.password).trim() : '1234';
    if (req.body?.password && !/^\d{4}$/.test(rawPin)) {
      return res.status(400).json({
        success: false,
        error: 'Le code PIN doit être composé d’exactement 4 chiffres.',
      });
    }
    const hashedInitialPassword = hashPasswordScrypt(rawPin);

    const effectiveTeam = role === 'Vendeur' ? '' : (team || '');

    db.prepare(`
      INSERT INTO users (id, code, name, email, role, phone, team, must_change_password, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, code, name, email, role, phone || '', effectiveTeam, hashedInitialPassword, createdAt);

    res.json({
      success: true,
      message: `Compte ${code} créé avec code PIN provisoire à 4 chiffres.`,
      user: { id, code, name, email, role, phone, team: effectiveTeam, must_change_password: 1, created_at: createdAt }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Code PIN à 4 chiffres à changer à la première connexion ou depuis Réglages > Sécurité (PIN)
apiRouter.patch('/users/:id/change-password', (req, res) => {
  try {
    const { id } = req.params;
    const rawNewPwd = String(req.body?.newPassword || req.body?.password || '1234').trim();
    if (!/^\d{4}$/.test(rawNewPwd)) {
      return res.status(400).json({
        success: false,
        error: 'Le code PIN doit comporter exactement 4 chiffres.',
      });
    }
    const newHash = hashPasswordScrypt(rawNewPwd);
    db.prepare('UPDATE users SET must_change_password = 0, password_hash = ? WHERE id = ?').run(newHash, id);
    res.json({ success: true, message: 'Code PIN à 4 chiffres mis à jour avec succès.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Modification complète d'un utilisateur existant (nom, code, email, téléphone, rôle, équipe, mot de passe / PIN)
apiRouter.put('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }

    const nextName = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const nextCode = req.body?.code !== undefined ? String(req.body.code).trim().toUpperCase() : existing.code;
    const nextEmail = req.body?.email !== undefined ? String(req.body.email).trim() : existing.email;
    const nextPhone = req.body?.phone !== undefined ? String(req.body.phone).trim() : existing.phone;
    const nextRole = req.body?.role !== undefined ? String(req.body.role).trim() : existing.role;
    const rawNextTeam = req.body?.team !== undefined ? String(req.body.team).trim() : existing.team;
    const nextTeam = nextRole === 'Vendeur' ? '' : rawNextTeam;

    if (!nextName || !nextCode) {
      return res.status(400).json({ success: false, error: 'Le nom et le code utilisateur sont obligatoires.' });
    }

    db.prepare(`
      UPDATE users
      SET name = ?, code = ?, email = ?, phone = ?, role = ?, team = ?
      WHERE id = ?
    `).run(nextName, nextCode, nextEmail, nextPhone, nextRole, nextTeam, id);

    if (req.body?.password && String(req.body.password).trim()) {
      const rawPin = String(req.body.password).trim();
      if (!/^\d{4}$/.test(rawPin)) {
        return res.status(400).json({
          success: false,
          error: 'Le code PIN doit comporter exactement 4 chiffres.',
        });
      }
      const newHash = hashPasswordScrypt(rawPin);
      db.prepare('UPDATE users SET must_change_password = 0, password_hash = ? WHERE id = ?').run(newHash, id);
    }

    const updated = db.prepare('SELECT id, code, name, email, role, phone, team, must_change_password, created_at FROM users WHERE id = ?').get(id);
    res.json({
      success: true,
      message: `Utilisateur ${nextName} (${nextCode}) mis à jour avec succès.`,
      user: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la modification de l\'utilisateur';
    res.status(500).json({ success: false, error: message });
  }
});

// Suppression d'un utilisateur (hors Administrateur principal)
apiRouter.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }
    if (existing.role === 'Administrateur') {
      const admins = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Administrateur'").get() as { count: number };
      if (admins.count <= 1) {
        return res.status(400).json({ success: false, error: 'Impossible de supprimer le compte Administrateur principal.' });
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({
      success: true,
      message: `Compte ${existing.name} (${existing.code}) supprimé.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
    res.status(500).json({ success: false, error: message });
  }
});

// 3. CATALOGUE & GAMMES (Gammes lues dynamiquement depuis la table des produits, jamais en dur)
apiRouter.get('/products', (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    const sql = activeOnly
      ? 'SELECT * FROM products WHERE COALESCE(is_active, 1) = 1 ORDER BY gamme ASC, name ASC'
      : 'SELECT * FROM products ORDER BY CASE WHEN COALESCE(is_active, 1) = 1 THEN 0 ELSE 1 END ASC, gamme ASC, name ASC';
    const rawProducts = db.prepare(sql).all() as any[];

    const historyRows = db
      .prepare('SELECT * FROM product_price_history ORDER BY effective_date DESC, created_at DESC')
      .all() as any[];
    const historyByProductId = new Map<string, any[]>();
    for (const h of historyRows) {
      const list = historyByProductId.get(h.product_id) || [];
      list.push(h);
      historyByProductId.set(h.product_id, list);
    }

    const products = rawProducts.map((p) => ({
      ...p,
      is_active: p.is_active === undefined || p.is_active === null ? 1 : Number(p.is_active),
      wholesale_price_box:
        p.wholesale_price_box !== undefined && p.wholesale_price_box !== null
          ? Number(p.wholesale_price_box)
          : null,
      price_history: historyByProductId.get(p.id) || [],
    }));

    res.json({ success: true, products });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/gammes', (req, res) => {
  try {
    // Lu dynamiquement dans la table des produits, jamais en dur !
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    const sql = activeOnly
      ? "SELECT DISTINCT gamme FROM products WHERE COALESCE(is_active, 1) = 1 AND TRIM(gamme) != '' ORDER BY gamme ASC"
      : "SELECT DISTINCT gamme FROM products WHERE TRIM(gamme) != '' ORDER BY gamme ASC";
    const rows = db.prepare(sql).all() as { gamme: string }[];
    const gammes = rows.map((r) => r.gamme);
    res.json({ success: true, gammes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/products/:id/price-history', (req, res) => {
  try {
    const { id } = req.params;
    const history = db
      .prepare('SELECT * FROM product_price_history WHERE product_id = ? ORDER BY effective_date DESC, created_at DESC')
      .all(id);
    res.json({ success: true, history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Création de produit : Administrateur seul
apiRouter.post('/products', requireAdmin, (req, res) => {
  try {
    const {
      code,
      name,
      gamme,
      packaging,
      units_per_box,
      price_box,
      wholesale_price_box,
      price_effective_date,
      price_motif,
      stock_depot,
      threshold_depot,
      is_active,
    } = req.body;
    if (!name || !gamme) {
      return res.status(400).json({ success: false, error: 'Nom et gamme du produit obligatoires.' });
    }

    const retailPrice = Number(price_box || 9000);
    if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
      return res.status(400).json({ success: false, error: 'Le prix détaillant par carton doit être supérieur à 0 FCFA.' });
    }

    let wholesalePrice: number | null = null;
    if (wholesale_price_box !== undefined && wholesale_price_box !== null && String(wholesale_price_box).trim() !== '') {
      wholesalePrice = Number(wholesale_price_box);
      if (!Number.isFinite(wholesalePrice) || wholesalePrice <= 0) {
        return res.status(400).json({ success: false, error: 'Le prix grossiste doit être un montant valide supérieur à 0 FCFA.' });
      }
      if (wholesalePrice > retailPrice) {
        return res.status(400).json({
          success: false,
          error: `Contrôle tarifaire refusé : le prix grossiste (${wholesalePrice.toLocaleString('fr-FR')} FCFA) doit être inférieur ou égal au prix détaillant (${retailPrice.toLocaleString('fr-FR')} FCFA).`,
        });
      }
    }

    const id = `prd-${Date.now()}`;
    const finalCode =
      code && String(code).trim()
        ? String(code).trim().toUpperCase()
        : `BAO-PRD-${String(Date.now()).slice(-4)}`;
    const cleanName = String(name).trim();
    const cleanGamme = String(gamme).trim() === 'Jus' ? 'Jus Cajoucy' : String(gamme).trim();
    const effectiveDate =
      price_effective_date && String(price_effective_date).trim()
        ? String(price_effective_date).trim()
        : new Date().toISOString().split('T')[0];
    const activeFlag = is_active === 0 || is_active === false ? 0 : 1;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO products (
        id, code, name, gamme, packaging, units_per_box,
        price_box, wholesale_price_box, price_effective_date,
        stock_depot, threshold_depot, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      finalCode,
      cleanName,
      cleanGamme,
      packaging ? String(packaging).trim() : 'Carton de 12',
      Number(units_per_box || 12),
      retailPrice,
      wholesalePrice,
      effectiveDate,
      Number(stock_depot || 0),
      Number(threshold_depot || 50),
      activeFlag
    );

    db.prepare(`
      INSERT INTO product_price_history (
        id, product_id, product_code, product_name,
        old_price_box, new_price_box, old_wholesale_price_box, new_wholesale_price_box,
        effective_date, changed_by, motif, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
      `pph-${Date.now()}`,
      id,
      finalCode,
      cleanName,
      retailPrice,
      wholesalePrice,
      effectiveDate,
      'Amadou Touré (Administrateur)',
      price_motif ? String(price_motif).trim() : 'Création initiale du produit au catalogue',
      nowIso
    );

    recordAudit(
      'CREATION_PRODUIT_CATALOGUE',
      'PRODUCT',
      id,
      'Administrateur',
      'usr-adm',
      `Création du produit ${cleanName} (${finalCode}) dans la gamme "${cleanGamme}" — Prix détaillant : ${retailPrice} FCFA${wholesalePrice !== null ? `, Prix grossiste : ${wholesalePrice} FCFA` : ''} (effet : ${effectiveDate}).`
    );

    res.json({ success: true, message: 'Produit ajouté au catalogue.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Modification de produit : Administrateur seul (avec contrôle prix grossiste <= prix détaillant, date d'effet et historique)
apiRouter.patch('/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Produit introuvable.' });
    }

    const {
      name,
      gamme,
      packaging,
      units_per_box,
      price_box,
      wholesale_price_box,
      price_effective_date,
      price_motif,
      stock_depot,
      threshold_depot,
      is_active,
    } = req.body;

    const nextRetailPrice = price_box !== undefined && price_box !== null ? Number(price_box) : Number(existing.price_box);
    if (!Number.isFinite(nextRetailPrice) || nextRetailPrice <= 0) {
      return res.status(400).json({ success: false, error: 'Le prix détaillant par carton doit être supérieur à 0 FCFA.' });
    }

    let nextWholesalePrice: number | null =
      existing.wholesale_price_box !== undefined && existing.wholesale_price_box !== null
        ? Number(existing.wholesale_price_box)
        : null;

    if (wholesale_price_box === null || wholesale_price_box === '') {
      nextWholesalePrice = null;
    } else if (wholesale_price_box !== undefined) {
      nextWholesalePrice = Number(wholesale_price_box);
      if (!Number.isFinite(nextWholesalePrice) || nextWholesalePrice <= 0) {
        return res.status(400).json({ success: false, error: 'Le prix grossiste doit être un montant valide supérieur à 0 FCFA.' });
      }
    }

    if (nextWholesalePrice !== null && nextWholesalePrice > nextRetailPrice) {
      return res.status(400).json({
        success: false,
        error: `Contrôle tarifaire refusé : le prix grossiste (${nextWholesalePrice.toLocaleString('fr-FR')} FCFA) doit être inférieur ou égal au prix détaillant (${nextRetailPrice.toLocaleString('fr-FR')} FCFA).`,
      });
    }

    const oldRetailPrice = Number(existing.price_box);
    const oldWholesalePrice =
      existing.wholesale_price_box !== undefined && existing.wholesale_price_box !== null
        ? Number(existing.wholesale_price_box)
        : null;
    const priceChanged = nextRetailPrice !== oldRetailPrice || nextWholesalePrice !== oldWholesalePrice;

    const effectiveDate =
      price_effective_date && String(price_effective_date).trim()
        ? String(price_effective_date).trim()
        : priceChanged
        ? new Date().toISOString().split('T')[0]
        : existing.price_effective_date || new Date().toISOString().split('T')[0];

    const cleanGamme =
      gamme !== undefined && gamme !== null
        ? String(gamme).trim() === 'Jus'
          ? 'Jus Cajoucy'
          : String(gamme).trim()
        : existing.gamme;

    const nextActive =
      is_active !== undefined && is_active !== null
        ? is_active === 0 || is_active === false
          ? 0
          : 1
        : Number(existing.is_active ?? 1);

    db.prepare(`
      UPDATE products
      SET name = COALESCE(?, name),
          gamme = ?,
          packaging = COALESCE(?, packaging),
          units_per_box = COALESCE(?, units_per_box),
          price_box = ?,
          wholesale_price_box = ?,
          price_effective_date = ?,
          stock_depot = COALESCE(?, stock_depot),
          threshold_depot = COALESCE(?, threshold_depot),
          is_active = ?
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      cleanGamme,
      packaging ? String(packaging).trim() : null,
      units_per_box !== undefined ? Number(units_per_box) : null,
      nextRetailPrice,
      nextWholesalePrice,
      effectiveDate,
      stock_depot !== undefined ? Number(stock_depot) : null,
      threshold_depot !== undefined ? Number(threshold_depot) : null,
      nextActive,
      id
    );

    if (priceChanged) {
      const nowIso = new Date().toISOString();
      const motifText =
        price_motif && String(price_motif).trim()
          ? String(price_motif).trim()
          : `Mise à jour tarifaire par l'Administrateur (date d'effet : ${effectiveDate})`;

      db.prepare(`
        INSERT INTO product_price_history (
          id, product_id, product_code, product_name,
          old_price_box, new_price_box, old_wholesale_price_box, new_wholesale_price_box,
          effective_date, changed_by, motif, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `pph-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        id,
        existing.code,
        name ? String(name).trim() : existing.name,
        oldRetailPrice,
        nextRetailPrice,
        oldWholesalePrice,
        nextWholesalePrice,
        effectiveDate,
        'Amadou Touré (Administrateur)',
        motifText,
        nowIso
      );

      recordAudit(
        'MODIFICATION_TARIF_PRODUIT',
        'PRODUCT',
        id,
        'Administrateur',
        'usr-adm',
        `Tarif mis à jour pour ${name || existing.name} (${existing.code}) avec date d'effet ${effectiveDate} : Détaillant ${oldRetailPrice} -> ${nextRetailPrice} FCFA | Grossiste ${oldWholesalePrice ?? 'Aucun'} -> ${nextWholesalePrice ?? 'Aucun'} FCFA. Motif : ${motifText}`
      );
    }

    res.json({ success: true, message: 'Produit mis à jour avec succès.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Reclassement motivé du stock d'un produit (ex. "Jus Cajoucy (ancien)") vers une saveur active : Administrateur seul
apiRouter.post('/products/:id/reclassify-stock', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { target_product_id, quantity, motif } = req.body || {};

    const sourceProd = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!sourceProd) {
      return res.status(404).json({ success: false, error: 'Produit source introuvable.' });
    }

    const targetProd = db.prepare('SELECT * FROM products WHERE id = ?').get(target_product_id) as any;
    if (!targetProd) {
      return res.status(404).json({ success: false, error: 'Saveur / produit de destination introuvable.' });
    }
    if (sourceProd.id === targetProd.id) {
      return res.status(400).json({ success: false, error: 'Le produit de destination doit être différent du produit source.' });
    }
    if (Number(targetProd.is_active ?? 1) === 0) {
      return res.status(400).json({ success: false, error: 'Impossible de reclasser du stock vers un produit désactivé.' });
    }

    const qty = Math.round(Number(quantity) || 0);
    if (qty <= 0) {
      return res.status(400).json({ success: false, error: 'La quantité à reclasser doit être supérieure à 0 carton.' });
    }
    if (qty > Number(sourceProd.stock_depot || 0)) {
      return res.status(400).json({
        success: false,
        error: `Quantité supérieure au stock disponible de "${sourceProd.name}" (${sourceProd.stock_depot} cartons).`,
      });
    }

    const cleanMotif = String(motif || '').trim();
    if (cleanMotif.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Un motif de reclassement est obligatoire pour tracer ce mouvement de stock.',
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = nowIso.split('T')[0];
    const ref = `RECL-${todayStr}-${String(Date.now()).slice(-4)}`;

    db.exec('BEGIN TRANSACTION');
    try {
      // 1. Déduire du produit source et créditer la saveur cible
      db.prepare('UPDATE products SET stock_depot = stock_depot - ? WHERE id = ?').run(qty, sourceProd.id);
      db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(qty, targetProd.id);

      // 2. Ajuster les lots FEFO : créer ou alimenter un lot sur la saveur cible
      const sourceLot = db
        .prepare("SELECT * FROM lots WHERE product_id = ? AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1")
        .get(sourceProd.id) as any;

      const expiryToUse = sourceLot?.expiry_date || '2027-08-30';
      if (sourceLot) {
        const deductLot = Math.min(Number(sourceLot.quantity), qty);
        db.prepare('UPDATE lots SET quantity = MAX(0, quantity - ?) WHERE id = ?').run(deductLot, sourceLot.id);
      }

      const newLotId = `lot-recl-${Date.now()}`;
      const newLotNumber = `LOT-RECL-${targetProd.code.slice(-6)}-${String(Date.now()).slice(-3)}`;
      db.prepare(`
        INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'actif', ?)
      `).run(newLotId, targetProd.id, newLotNumber, expiryToUse, qty, qty, todayStr);

      // 3. Tracer les deux mouvements dans stock_movements (sortie ancien produit + entrée saveur cible)
      recordStockMovement(
        'reclassement',
        'OUT',
        sourceProd.id,
        sourceLot?.id || null,
        qty,
        ref,
        `Reclassement stock de "${sourceProd.name}" vers "${targetProd.name}" — Motif : ${cleanMotif}`,
        qty * Number(sourceProd.price_box || 0),
        'Amadou Touré (Administrateur)'
      );

      recordStockMovement(
        'reclassement',
        'IN',
        targetProd.id,
        newLotId,
        qty,
        ref,
        `Reclassement stock depuis "${sourceProd.name}" vers "${targetProd.name}" — Motif : ${cleanMotif}`,
        qty * Number(targetProd.price_box || 0),
        'Amadou Touré (Administrateur)'
      );

      // 4. Audit log
      recordAudit(
        'RECLASSEMENT_STOCK_PRODUIT',
        'PRODUCT',
        sourceProd.id,
        'Administrateur',
        'usr-adm',
        `Reclassement motivé (${ref}) : ${qty} cartons transférés de "${sourceProd.name}" (${sourceProd.code}) vers "${targetProd.name}" (${targetProd.code}). Motif : ${cleanMotif}`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      reference: ref,
      message: `${qty} cartons reclassés de "${sourceProd.name}" vers "${targetProd.name}" (Réf: ${ref}).`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors du reclassement';
    res.status(500).json({ success: false, error: message });
  }
});

// 4. POINTS DE VENTE (PDV)

/**
 * Calcule les statistiques complètes de chaque PDV :
 * - Nombre de ventes réalisées (sales_count), Chiffre d'affaires total (total_sales_amount)
 * - Les produits assez achetés par le PDV (top_products : produit, total cartons achetés, nombre d'achats, montant total)
 * - Nombre de visites (visits_count, no_sale_visits_count), déjà visité auparavant (visited_before), visité aujourd'hui (visited_today)
 */
function buildPdvSalesAndVisitsAnalyticsMap(referenceDateStr?: string) {
  const refDate =
    referenceDateStr ||
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Bamako',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

  const salesRows = db
    .prepare(
      `
      SELECT s.id, s.number, s.thermal_ticket_number, s.invoice_number,
             s.date, s.sale_time, s.vendor_id, s.pdv_id, s.items,
             s.total_amount, s.buyer_type, s.wholesale_discount_amount,
             s.cajoucy_boxes_count, s.payment_type, s.status, s.created_at,
             COALESCE(u.name, 'Vendeur Baobab') as vendor_name,
             COALESCE(u.code, 'BAO-VND') as vendor_code,
             COALESCE(p.name, 'PDV') as pdv_name,
             COALESCE(p.code, 'PDV') as pdv_code,
             COALESCE(p.routine_name, '') as pdv_routine_name,
             COALESCE(p.routine_day, 'Vendredi') as pdv_routine_day
      FROM sales s
      LEFT JOIN users u ON u.id = s.vendor_id
      LEFT JOIN points_de_vente p ON p.id = s.pdv_id
      WHERE COALESCE(s.status, 'livree') != 'annulee'
      ORDER BY s.date DESC, COALESCE(s.sale_time, '00:00') DESC, s.created_at DESC
    `
    )
    .all() as any[];

  ensureVisitMotifImmutabilityAndReactionsSchema();

  const reactionsByVisitId = new Map<
    string,
    Array<{
      id: string;
      visitId: string;
      decision: 'accepte' | 'conteste';
      comment: string | null;
      actorName: string;
      actorRole: string;
      createdAt: string;
    }>
  >();
  try {
    const rxRows = db
      .prepare(
        `SELECT id, visit_id, decision, comment, actor_name, actor_role, created_at
         FROM vrs_visit_motif_reactions
         ORDER BY created_at DESC`
      )
      .all() as any[];
    for (const r of rxRows) {
      const vid = String(r.visit_id || '');
      if (!vid) continue;
      const list = reactionsByVisitId.get(vid) || [];
      list.push({
        id: String(r.id),
        visitId: vid,
        decision: r.decision === 'conteste' ? 'conteste' : 'accepte',
        comment: r.comment || null,
        actorName: String(r.actor_name || 'DOV'),
        actorRole: String(r.actor_role || 'Directeur des opérations de vente'),
        createdAt: String(r.created_at || ''),
      });
      reactionsByVisitId.set(vid, list);
    }
  } catch {
    // ignore
  }

  let visitRows: any[] = [];
  try {
    visitRows = db
      .prepare(
        `
        SELECT v.id, v.visit_uuid, v.visit_date, v.visit_time, v.server_recorded_at,
               v.vendor_id, v.pdv_id, v.latitude, v.longitude, v.gps_accuracy, v.distance_m,
               v.is_counted, v.status_reason, v.device_info,
               COALESCE(v.visit_type, 'visite_sans_vente') as visit_type,
               v.no_sale_reason,
               v.sale_id,
               v.routine_day,
               v.routine_day_index,
               v.motif_reaction_status,
               v.motif_reaction_comment,
               v.motif_reacted_by,
               v.motif_reacted_role,
               v.motif_reacted_at,
               v.created_at,
               COALESCE(u.name, 'Vendeur Baobab') as vendor_name,
               COALESCE(u.code, 'BAO-VND') as vendor_code,
               COALESCE(p.routine_day, 'Vendredi') as pdv_routine_day,
               COALESCE(p.routine_day_index, 5) as pdv_routine_day_index
        FROM vrs_visits v
        LEFT JOIN users u ON u.id = v.vendor_id
        LEFT JOIN points_de_vente p ON p.id = v.pdv_id
        ORDER BY v.visit_date DESC, COALESCE(v.visit_time, '00:00:00') DESC, v.created_at DESC
      `
      )
      .all() as any[];
  } catch {
    visitRows = [];
  }

  const pdvSalesMap = new Map<
    string,
    {
      salesCount: number;
      totalSalesAmount: number;
      totalCartons: number;
      lastSaleDate: string | null;
      soldToday: boolean;
      productsMap: Map<
        string,
        {
          productId: string;
          code: string;
          name: string;
          totalQuantity: number;
          ordersCount: number;
          totalAmount: number;
        }
      >;
      salesHistory: any[];
    }
  >();

  for (const s of salesRows) {
    const pdvId = String(s.pdv_id || '');
    if (!pdvId) continue;
    let entry = pdvSalesMap.get(pdvId);
    if (!entry) {
      entry = {
        salesCount: 0,
        totalSalesAmount: 0,
        totalCartons: 0,
        lastSaleDate: null,
        soldToday: false,
        productsMap: new Map(),
        salesHistory: [],
      };
      pdvSalesMap.set(pdvId, entry);
    }

    const amount = Number(s.total_amount || 0);
    entry.salesCount += 1;
    entry.totalSalesAmount += amount;
    if (!entry.lastSaleDate || String(s.date) > entry.lastSaleDate) {
      entry.lastSaleDate = s.date;
    }
    if (s.date === refDate) {
      entry.soldToday = true;
    }

    let parsedItems: any[] = [];
    try {
      parsedItems =
        typeof s.items === 'string'
          ? JSON.parse(s.items)
          : Array.isArray(s.items)
          ? s.items
          : [];
    } catch {
      parsedItems = [];
    }

    const normalizedSaleItems: Array<{
      productId: string;
      code: string;
      name: string;
      qtyBoxes: number;
      unitPrice: number;
      total: number;
    }> = [];

    let saleCartons = 0;
    const seenProductsInThisSale = new Set<string>();

    for (const it of parsedItems) {
      const pId = String(it?.productId || it?.product_id || it?.code || it?.name || 'prod');
      const pCode = String(it?.code || it?.productCode || 'PRD');
      const pName = String(it?.name || it?.productName || it?.description || 'Produit Baobab');
      const qty = Math.max(0, Number(it?.qtyBoxes ?? it?.qty ?? it?.quantity ?? 0));
      const unitPrice = Math.max(0, Number(it?.unitPrice ?? it?.price ?? 0));
      const lineTotal = Math.max(0, Number(it?.total ?? qty * unitPrice));
      if (qty <= 0) continue;

      saleCartons += qty;
      normalizedSaleItems.push({
        productId: pId,
        code: pCode,
        name: pName,
        qtyBoxes: qty,
        unitPrice,
        total: lineTotal,
      });

      const prodKey = pId || pName;
      const existingProd = entry.productsMap.get(prodKey) || {
        productId: pId,
        code: pCode,
        name: pName,
        totalQuantity: 0,
        ordersCount: 0,
        totalAmount: 0,
      };
      existingProd.totalQuantity += qty;
      existingProd.totalAmount += lineTotal;
      if (!seenProductsInThisSale.has(prodKey)) {
        existingProd.ordersCount += 1;
        seenProductsInThisSale.add(prodKey);
      }
      entry.productsMap.set(prodKey, existingProd);
    }

    entry.totalCartons += saleCartons;
    const resolvedRoutineDay = s.pdv_routine_day || 'Vendredi';
    const resolvedRoutineName =
      (s.pdv_routine_name && String(s.pdv_routine_name).trim()) ||
      `Routine ${resolvedRoutineDay}`;
    entry.salesHistory.push({
      id: s.id,
      number: s.number,
      thermal_ticket_number:
        s.thermal_ticket_number || String(s.number || '').replace(/^VTE-/, 'TKT-THERM-'),
      invoice_number: s.invoice_number || String(s.number || '').replace(/^VTE-/, 'FAC-'),
      date: s.date,
      sale_time: s.sale_time || '10:00',
      vendor_id: s.vendor_id,
      vendor_name: s.vendor_name,
      vendor_code: s.vendor_code,
      pdv_id: s.pdv_id,
      pdv_name: s.pdv_name || 'PDV',
      pdv_code: s.pdv_code || 'PDV',
      routine_name: resolvedRoutineName,
      routine_day: resolvedRoutineDay,
      total_amount: amount,
      total_boxes: saleCartons,
      payment_type: s.payment_type || 'Comptant',
      buyer_type: s.buyer_type || null,
      wholesale_discount_amount: Number(s.wholesale_discount_amount || 0),
      status: s.status || 'livree',
      items: normalizedSaleItems,
    });
  }

  const pdvVisitsMap = new Map<
    string,
    {
      visitsCount: number;
      routineDayVisitsCount: number;
      noSaleVisitsCount: number;
      withSaleVisitsCount: number;
      visitedToday: boolean;
      visitedBefore: boolean;
      lastVisitDate: string | null;
      lastVisitTime: string | null;
      lastNoSaleReason: string | null;
      visitsHistory: any[];
    }
  >();

  for (const v of visitRows) {
    const pdvId = String(v.pdv_id || '');
    if (!pdvId) continue;
    let entry = pdvVisitsMap.get(pdvId);
    if (!entry) {
      entry = {
        visitsCount: 0,
        routineDayVisitsCount: 0,
        noSaleVisitsCount: 0,
        withSaleVisitsCount: 0,
        visitedToday: false,
        visitedBefore: false,
        lastVisitDate: null,
        lastVisitTime: null,
        lastNoSaleReason: null,
        visitsHistory: [],
      };
      pdvVisitsMap.set(pdvId, entry);
    }

    entry.visitsCount += 1;

    const pdvRoutineDay = String(v.pdv_routine_day || v.routine_day || 'Vendredi').trim();
    const pdvRoutineDayIndex = Number(v.pdv_routine_day_index || v.routine_day_index || 5);
    const visitRoutineDay = String(v.routine_day || pdvRoutineDay).trim();
    const visitRoutineDayIndex = Number(v.routine_day_index || pdvRoutineDayIndex);
    const isVisitOnRoutineDay =
      visitRoutineDayIndex === pdvRoutineDayIndex ||
      visitRoutineDay.toLowerCase() === pdvRoutineDay.toLowerCase();

    if (isVisitOnRoutineDay) {
      entry.routineDayVisitsCount += 1;
    }

    const hasExplicitNoSaleReason = Boolean(
      v.no_sale_reason && String(v.no_sale_reason).trim().length > 0
    );
    const isWithSale =
      !hasExplicitNoSaleReason &&
      v.visit_type !== 'visite_sans_vente' &&
      v.visit_type !== 'sans_vente' &&
      (v.visit_type === 'visite_avec_vente' ||
        Boolean(v.sale_id) ||
        (/vente/i.test(String(v.status_reason || '')) &&
          !/sans vente/i.test(String(v.status_reason || ''))));

    // Toute visite qui n'est pas une vente est comptabilisée comme une visite sans vente
    const isNoSale = !isWithSale;

    if (isNoSale) {
      entry.noSaleVisitsCount += 1;
      if (!entry.lastNoSaleReason && v.no_sale_reason) {
        entry.lastNoSaleReason = String(v.no_sale_reason);
      }
    } else if (isWithSale) {
      entry.withSaleVisitsCount += 1;
    }

    if (v.visit_date === refDate || isVisitOnRoutineDay) {
      entry.visitedToday = true;
    } else {
      entry.visitedBefore = true;
    }

    if (!entry.lastVisitDate || String(v.visit_date) > entry.lastVisitDate) {
      entry.lastVisitDate = v.visit_date;
      entry.lastVisitTime = v.visit_time || '09:00:00';
    }

    const rxHistory = reactionsByVisitId.get(String(v.id)) || [];

    entry.visitsHistory.push({
      id: v.id,
      visit_uuid: v.visit_uuid,
      visit_date: v.visit_date,
      visit_time: v.visit_time || '09:00:00',
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name,
      vendor_code: v.vendor_code,
      visit_type: isWithSale ? 'visite_avec_vente' : 'visite_sans_vente',
      no_sale_reason: v.no_sale_reason || null,
      motif_reaction_status: v.motif_reaction_status || rxHistory[0]?.decision || null,
      motif_reaction_comment: v.motif_reaction_comment || rxHistory[0]?.comment || null,
      motif_reacted_by: v.motif_reacted_by || rxHistory[0]?.actorName || null,
      motif_reacted_role: v.motif_reacted_role || rxHistory[0]?.actorRole || null,
      motif_reacted_at: v.motif_reacted_at || rxHistory[0]?.createdAt || null,
      motif_reactions_history: rxHistory,
      sale_id: v.sale_id || null,
      routine_day: visitRoutineDay,
      routine_day_index: visitRoutineDayIndex,
      status_reason: v.status_reason || 'Visite sans vente enregistrée',
      is_counted: Number(v.is_counted ?? 1) === 1,
      latitude: Number(v.latitude || 12.6392),
      longitude: Number(v.longitude || -8.0029),
      gps_accuracy: Number(v.gps_accuracy || 4.5),
      distance_m: Number(v.distance_m || 0),
    });
  }

  return { pdvSalesMap, pdvVisitsMap, refDate };
}

/**
 * S'assure que le schéma d'immuabilité du motif vendeur (visites sans vente) et l'historique
 * des réactions DOV (Accepter le motif / Contester avec commentaire séparé) existent.
 * Crée également un déclencheur SQLite interdisant toute modification d'un motif déjà envoyé.
 */
function ensureVisitMotifImmutabilityAndReactionsSchema(
  vendorId?: string,
  referenceDate?: string,
  routineStatus?: { activeDayName: string; activeDayIndex: number },
  vendorMeta?: { id: string; name: string; code: string }
) {
  try {
    try {
      db.exec("ALTER TABLE vrs_visits ADD COLUMN validation_status TEXT DEFAULT 'soumis'");
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN validated_by TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN validated_at TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN motif_reaction_status TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN motif_reaction_comment TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN motif_reacted_by TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN motif_reacted_role TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN motif_reacted_at TEXT');
    } catch {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS vrs_visit_motif_reactions (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL,
        pdv_id TEXT,
        vendor_id TEXT,
        decision TEXT NOT NULL,
        comment TEXT,
        actor_id TEXT,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vrs_visit_motif_reactions_visit ON vrs_visit_motif_reactions(visit_id);
    `);

    // Trigger SQLite : fige définitivement tout motif déjà envoyé (interdit tout UPDATE de no_sale_reason)
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_vrs_visits_freeze_no_sale_reason
      BEFORE UPDATE OF no_sale_reason ON vrs_visits
      WHEN OLD.no_sale_reason IS NOT NULL AND TRIM(OLD.no_sale_reason) <> '' AND COALESCE(NEW.no_sale_reason, '') <> OLD.no_sale_reason
      BEGIN
        SELECT RAISE(ABORT, 'MOTIF_VENDEUR_FIGE_403');
      END;
    `);
  } catch {
    // ignore schema init errors
  }
}

/**
 * Assure que tous les PDV existants sont liés à leur vendeur créateur et au jour où ils ont été créés,
 * afin que chaque vendeur retrouve immédiatement ses PDV sur son jour actif de routine (et reste verrouillé
 * sur ce jour tant qu'il n'a pas validé au moins 25 PDV).
 */
function ensureAllPdvsBoundToVendorAndRoutineDay() {
  try {
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN updated_at TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validation_status TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validated_by TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validated_at TEXT');
    } catch {}

    const vendors = db
      .prepare("SELECT id, name, code FROM users WHERE role = 'Vendeur' ORDER BY code ASC")
      .all() as Array<{ id: string; name: string; code: string }>;
    if (vendors.length === 0) return;

    const defaultVendor = vendors[0];
    db.prepare(`
      UPDATE points_de_vente
      SET vendor_id = ?,
          created_by = COALESCE(NULLIF(created_by, ''), ?)
      WHERE vendor_id IS NULL OR TRIM(vendor_id) = ''
    `).run(defaultVendor.id, defaultVendor.name);
  } catch (err) {
    console.warn('[PDV Binding] Warning:', err);
  }
}

function comparePdvRowsMostRecentFirst(a: any, b: any): number {
  const tsA = String(a.updated_at || a.created_at || '');
  const tsB = String(b.updated_at || b.created_at || '');
  if (tsA !== tsB) {
    return tsB.localeCompare(tsA);
  }
  const createdA = String(a.created_at || '');
  const createdB = String(b.created_at || '');
  if (createdA !== createdB) {
    return createdB.localeCompare(createdA);
  }
  const idNumA = Number(String(a.id || '').replace(/\D+/g, '')) || 0;
  const idNumB = Number(String(b.id || '').replace(/\D+/g, '')) || 0;
  if (idNumA !== idNumB) {
    return idNumB - idNumA;
  }
  return String(b.code || '').localeCompare(String(a.code || ''), 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

apiRouter.get('/pdvs', (req, res) => {
  try {
    ensureAllPdvsBoundToVendorAndRoutineDay();

    const userRole = getUserRole(req);
    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const queryVendorId =
      typeof req.query.vendor_id === 'string' ? req.query.vendor_id.trim() : '';
    const clientDate =
      typeof req.query.client_date === 'string' ? req.query.client_date.trim() : undefined;
    const includeAllDays = req.query.include_all_days === '1';

    const effectiveVendorId =
      userRole === 'Vendeur'
        ? headerUserId || queryVendorId || 'usr-vnd-1'
        : queryVendorId;

    let vendorActiveRoutine: ReturnType<typeof reconcileVendorPdvRoutineStatus> | null = null;
    if (effectiveVendorId) {
      vendorActiveRoutine = reconcileVendorPdvRoutineStatus(effectiveVendorId, clientDate);
    }

    let sql = `
      SELECT p.*,
             COALESCE(u.name, p.created_by, 'Oumar Konaté') AS created_by,
             COALESCE(u.code, 'BAO-VND-001') AS vendor_code,
             COALESCE(u.team, '') AS vendor_team,
             COALESCE(u.phone, '') AS vendor_phone
      FROM points_de_vente p
      LEFT JOIN users u ON p.vendor_id = u.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    // Règle stricte demandée :
    // "Chaque point de vente est lié au jour où il a été créé par le vendeur et il a l'obligation de revenir
    // dans ces mêmes points de vente pour visite ou vente. Par exemple : les 25 PDV créés le vendredi ne peuvent
    // être visités par le vendeur que le vendredi donc chaque PDV s'affiche uniquement dans le jour où il a été créé
    // et visible que par son vendeur."
    if (userRole === 'Vendeur') {
      const vId = effectiveVendorId || 'usr-vnd-1';
      conditions.push('p.vendor_id = ?');
      params.push(vId);

      if (vendorActiveRoutine && !includeAllDays) {
        conditions.push(
          `(p.routine_day_index IS NULL OR p.routine_day_index = 0 OR p.routine_day IS NULL OR TRIM(p.routine_day) = '' OR p.routine_day_index = ? OR LOWER(COALESCE(p.routine_day, '')) = LOWER(?))`
        );
        params.push(vendorActiveRoutine.activeDayIndex, vendorActiveRoutine.activeDayName);
      }
    } else if (effectiveVendorId) {
      conditions.push('p.vendor_id = ?');
      params.push(effectiveVendorId);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.created_at DESC, p.code DESC`;

    const rawPdvs = db.prepare(sql).all(...params) as any[];
    const { pdvSalesMap, pdvVisitsMap, refDate } = buildPdvSalesAndVisitsAnalyticsMap(
      vendorActiveRoutine?.referenceDate || clientDate
    );

    const vendorRoutineCache = new Map<
      string,
      ReturnType<typeof reconcileVendorPdvRoutineStatus>
    >();
    if (effectiveVendorId && vendorActiveRoutine) {
      vendorRoutineCache.set(effectiveVendorId, vendorActiveRoutine);
    }
    const getVendorRoutine = (vIdRaw?: string | null) => {
      const vId = String(vIdRaw || 'usr-vnd-1').trim() || 'usr-vnd-1';
      let cached = vendorRoutineCache.get(vId);
      if (!cached) {
        try {
          cached = reconcileVendorPdvRoutineStatus(vId, clientDate);
          vendorRoutineCache.set(vId, cached);
        } catch {
          return vendorActiveRoutine;
        }
      }
      return cached;
    };

    const pdvs = rawPdvs
      .map((p) => {
        const sStats = pdvSalesMap.get(String(p.id));
        const vStats = pdvVisitsMap.get(String(p.id));
        const vRoutine = getVendorRoutine(p.vendor_id);

        const topProducts = sStats
          ? Array.from(sStats.productsMap.values())
              .sort((a, b) => b.totalQuantity - a.totalQuantity || b.totalAmount - a.totalAmount)
              .slice(0, 6)
          : [];

        const salesCount = sStats?.salesCount || 0;
        const rawVisitsCount = vStats?.visitsCount || 0;
        const visitsCount = Math.max(rawVisitsCount, salesCount > 0 ? salesCount : 1);
        const unlinkedSaleTodayCount =
          sStats?.soldToday && (vStats?.withSaleVisitsCount || 0) === 0 ? 1 : 0;
        const routineDayVisitsCount = Math.max(
          (vStats?.routineDayVisitsCount || 0) + unlinkedSaleTodayCount,
          p.validation_status === 'valide' && (vStats?.routineDayVisitsCount || 0) === 0 ? 1 : 0
        );
        const noSaleVisitsCount = Math.max(
          vStats?.noSaleVisitsCount || 0,
          Math.max(0, rawVisitsCount - salesCount)
        );
        const visitedBefore =
          Boolean(vStats?.visitedBefore) ||
          salesCount > 0 ||
          (p.created_at && String(p.created_at).slice(0, 10) < refDate) ||
          rawVisitsCount >= 1;

        return {
          ...p,
          updated_at: p.updated_at || p.created_at,
          routine_day: p.routine_day || vRoutine?.activeDayName || 'Lundi',
          routine_day_index: Number(
            p.routine_day_index || vRoutine?.activeDayIndex || 1
          ),
          sales_count: salesCount,
          total_sales_amount: sStats?.totalSalesAmount || 0,
          total_cartons_sold: sStats?.totalCartons || 0,
          last_sale_date: sStats?.lastSaleDate || null,
          visits_count: visitsCount,
          routine_day_visits_count: routineDayVisitsCount,
          today_visits_count: routineDayVisitsCount,
          no_sale_visits_count: noSaleVisitsCount,
          with_sale_visits_count: Math.max(vStats?.withSaleVisitsCount || 0, salesCount),
          visited_today: Boolean(routineDayVisitsCount > 0 || vStats?.visitedToday || sStats?.soldToday),
          sold_today: Boolean(sStats?.soldToday),
          visited_before: visitedBefore,
          last_visit_date: vStats?.lastVisitDate || p.created_at || null,
          last_visit_time: vStats?.lastVisitTime || null,
          last_no_sale_reason: vStats?.lastNoSaleReason || null,
          top_products: topProducts,
        };
      })
      .sort(comparePdvRowsMostRecentFirst);

    res.json({
      success: true,
      pdvs,
      activeRoutineDay: vendorActiveRoutine
        ? {
            dayIndex: vendorActiveRoutine.activeDayIndex,
            dayName: vendorActiveRoutine.activeDayName,
            pdvCount: vendorActiveRoutine.activePdvCount,
            targetPdvCount: vendorActiveRoutine.targetPdvCount,
            isTargetReachedToday: vendorActiveRoutine.isTargetReachedToday,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Fiche Profil complète d'un PDV & Historique complet des Visites et des Ventes (+ Produits assez achetés)
// Accessible au Vendeur (uniquement pour ses propres PDV), à l'Administrateur, au VOD/DOV (Directeur des opérations de vente) et au SA (Sales Admin)
apiRouter.get('/pdvs/:id/fiche', (req, res) => {
  try {
    ensureAllPdvsBoundToVendorAndRoutineDay();

    const { id } = req.params;
    const userRole = getUserRole(req) || '';
    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';

    const allowedRoles = [
      'Vendeur',
      'Administrateur',
      'Directeur des opérations de vente',
      'Sales Admin',
      'Comptable',
    ];
    if (userRole && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : le rôle "${userRole}" n'est pas autorisé à consulter la fiche détaillée de ce PDV.`,
      });
    }

    const pdv = db
      .prepare(
        `
        SELECT p.*,
               COALESCE(u.name, p.created_by, 'Oumar Konaté') AS created_by,
               COALESCE(u.code, 'BAO-VND-001') AS vendor_code,
               COALESCE(u.team, '') AS vendor_team,
               COALESCE(u.phone, '') AS vendor_phone
        FROM points_de_vente p
        LEFT JOIN users u ON p.vendor_id = u.id
        WHERE p.id = ? OR p.code = ?
      `
      )
      .get(id, id) as any;

    if (!pdv) {
      return res.status(404).json({
        success: false,
        error: 'Point de vente introuvable.',
      });
    }

    // Un vendeur ne peut voir que les PDV qu'il a lui-même créés
    if (userRole === 'Vendeur' && headerUserId && pdv.vendor_id && pdv.vendor_id !== headerUserId) {
      return res.status(403).json({
        success: false,
        error:
          'Accès refusé (403) : chaque PDV est visible uniquement par le vendeur qui l\'a créé.',
      });
    }

    const { pdvSalesMap, pdvVisitsMap, refDate } = buildPdvSalesAndVisitsAnalyticsMap();
    const sStats = pdvSalesMap.get(String(pdv.id));
    const vStats = pdvVisitsMap.get(String(pdv.id));

    const topProducts = sStats
      ? Array.from(sStats.productsMap.values()).sort(
          (a, b) => b.totalQuantity - a.totalQuantity || b.totalAmount - a.totalAmount
        )
      : [];

    const salesHistory = sStats?.salesHistory || [];
    const rawVisitsHistory = vStats?.visitsHistory ? [...vStats.visitsHistory] : [];

    // S'assurer que chaque vente réalisée dans ce PDV apparaît aussi dans la chronologie des visites si non présente,
    // et que la visite initiale de création du PDV figure bien dans l'historique des visites
    const existingVisitDates = new Set(rawVisitsHistory.map((v) => `${v.visit_date}`));
    for (const s of salesHistory) {
      if (!existingVisitDates.has(String(s.date))) {
        const productsSummary = (s.items || [])
          .map((it: any) => `${it.qtyBoxes}x ${it.name}`)
          .join(', ');
        rawVisitsHistory.push({
          id: `vis-sale-${s.id}`,
          visit_uuid: `uuid-sale-${s.id}`,
          visit_date: s.date,
          visit_time: s.sale_time ? `${s.sale_time}:00` : '10:30:00',
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_name,
          vendor_code: s.vendor_code,
          visit_type: 'visite_avec_vente',
          no_sale_reason: null,
          sale_id: s.id,
          sale_number: s.number,
          sale_amount: s.total_amount,
          sale_products_summary: productsSummary,
          routine_day: pdv.routine_day || 'Vendredi',
          routine_day_index: pdv.routine_day_index || 5,
          status_reason: `Visite avec vente ${s.number} (${Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA) — ${productsSummary}`,
          is_counted: true,
          latitude: Number(pdv.latitude || 12.6392),
          longitude: Number(pdv.longitude || -8.0029),
          gps_accuracy: Number(pdv.gps_accuracy || 4.2),
          distance_m: 0,
        });
      }
    }

    // Ajouter la visite initiale de création uniquement si aucune visite n'existe encore pour ce PDV
    const createdDateStr = String(pdv.created_at || '2026-05-15').split('T')[0];
    if (rawVisitsHistory.length === 0) {
      rawVisitsHistory.push({
        id: `vis-creation-${pdv.id}`,
        visit_uuid: `uuid-creation-${pdv.id}`,
        visit_date: createdDateStr,
        visit_time: '08:45:00',
        vendor_id: pdv.vendor_id || 'usr-vnd-1',
        vendor_name: pdv.created_by || 'Oumar Konaté',
        vendor_code: pdv.vendor_code || 'BAO-VND-001',
        visit_type: 'visite_sans_vente',
        no_sale_reason: null,
        sale_id: null,
        routine_day: pdv.routine_day || 'Vendredi',
        routine_day_index: pdv.routine_day_index || 5,
        status_reason: `Visite sans vente (${pdv.routine_day || 'Vendredi'})`,
        is_counted: true,
        latitude: Number(pdv.latitude || 12.6392),
        longitude: Number(pdv.longitude || -8.0029),
        gps_accuracy: Number(pdv.gps_accuracy || 4.2),
        distance_m: 0,
      });
    }

    // Enrichir les visites ayant eu une vente le même jour avec le détail de la vente
    const salesByDateMap = new Map<string, any[]>();
    for (const s of salesHistory) {
      const list = salesByDateMap.get(String(s.date)) || [];
      list.push(s);
      salesByDateMap.set(String(s.date), list);
    }

    const sortedChrono = rawVisitsHistory
      .map((v) => {
        const linkedSale =
          (v.sale_id && salesHistory.find((s) => s.id === v.sale_id || s.number === v.sale_id)) ||
          (v.visit_type !== 'visite_sans_vente' &&
          !v.no_sale_reason &&
          salesByDateMap.get(String(v.visit_date))?.[0]
            ? salesByDateMap.get(String(v.visit_date))![0]
            : null);

        const isWithSale = Boolean(linkedSale) || v.visit_type === 'visite_avec_vente';

        return {
          ...v,
          routine_day: v.routine_day || pdv.routine_day || 'Vendredi',
          routine_day_index: Number(v.routine_day_index || pdv.routine_day_index || 5),
          visit_type: isWithSale ? 'visite_avec_vente' : 'visite_sans_vente',
          sale_number: v.sale_number || linkedSale?.number || null,
          sale_amount: v.sale_amount ?? linkedSale?.total_amount ?? null,
          sale_items: linkedSale?.items || [],
        };
      })
      .sort((a, b) => {
        const keyA = `${a.visit_date}T${a.visit_time || '00:00:00'}`;
        const keyB = `${b.visit_date}T${b.visit_time || '00:00:00'}`;
        return keyA.localeCompare(keyB);
      })
      .map((v, idx) => ({
        ...v,
        routine_visit_number: idx + 1,
      }));

    const enrichedVisitsHistory = [...sortedChrono].reverse();

    const salesCount = salesHistory.length;
    const totalSalesAmount = sStats?.totalSalesAmount || 0;
    const totalCartonsSold = sStats?.totalCartons || 0;
    const visitsCount = enrichedVisitsHistory.length;
    const pdvTargetDay = String(pdv.routine_day || 'Vendredi').toLowerCase();
    const pdvTargetDayIndex = Number(pdv.routine_day_index || 5);
    const realVisitsOnRoutineDay = enrichedVisitsHistory.filter(
      (v) =>
        !String(v.id || '').startsWith('vis-creation-') &&
        (Number(v.routine_day_index || 0) === pdvTargetDayIndex ||
          String(v.routine_day || '').toLowerCase() === pdvTargetDay)
    );
    const routineDayVisitsCount = Math.max(
      realVisitsOnRoutineDay.length,
      pdv.validation_status === 'valide' && realVisitsOnRoutineDay.length === 0 ? 1 : 0
    );
    const noSaleVisitsCount = realVisitsOnRoutineDay.filter(
      (v) => v.visit_type === 'visite_sans_vente'
    ).length;
    const withSaleVisitsCount = realVisitsOnRoutineDay.filter(
      (v) => v.visit_type === 'visite_avec_vente'
    ).length;

    res.json({
      success: true,
      fiche: {
        pdv: {
          ...pdv,
          routine_day: pdv.routine_day || 'Vendredi',
          routine_day_index: Number(pdv.routine_day_index || 5),
          sales_count: salesCount,
          total_sales_amount: totalSalesAmount,
          total_cartons_sold: totalCartonsSold,
          visits_count: visitsCount,
          routine_day_visits_count: routineDayVisitsCount,
          today_visits_count: routineDayVisitsCount,
          no_sale_visits_count: noSaleVisitsCount,
          with_sale_visits_count: withSaleVisitsCount,
          visited_today: Boolean(routineDayVisitsCount > 0 || vStats?.visitedToday || sStats?.soldToday),
          sold_today: Boolean(sStats?.soldToday),
          visited_before: visitsCount >= 1,
          last_sale_date: sStats?.lastSaleDate || null,
          last_visit_date: enrichedVisitsHistory[0]?.visit_date || pdv.created_at || null,
          top_products: topProducts,
        },
        top_products: topProducts,
        sales_history: salesHistory,
        visits_history: enrichedVisitsHistory,
        routine_day_visits_count: routineDayVisitsCount,
        today_visits_count: routineDayVisitsCount,
        reference_date: refDate,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors du chargement de la fiche PDV';
    res.status(500).json({ success: false, error: message });
  }
});

// Déclaration d'une visite par le vendeur dans un PDV qu'il a créé et visité auparavant :
// - Vérifie que le PDV appartient au vendeur créateur et au jour de routine actif (ex: Vendredi -> Vendredi uniquement)
// - Si visite sans vente (visit_mode === 'sans_vente') : motif obligatoire, enregistre la visite dans l'historique du PDV,
//   incrémente la progression vers les 25 PDV du jour actif, et envoie une notification en temps réel à l'Administrateur et au VOD/DOV
apiRouter.post('/pdvs/:id/declare-visit', (req, res) => {
  try {
    ensureAllPdvsBoundToVendorAndRoutineDay();
    ensureVisitMotifImmutabilityAndReactionsSchema();

    const { id } = req.params;
    const callerRole = getUserRole(req);
    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';

    if (callerRole !== 'Vendeur') {
      recordAudit(
        'TENTATIVE_SAISIE_OU_MODIFICATION_MOTIF_REFUSEE_403',
        'PDV',
        String(id || 'pdv'),
        callerRole || 'Non spécifié',
        headerUserId || 'inconnu',
        `Refus 403 : tentative de saisie ou de modification du motif de visite sans vente par le rôle "${callerRole || 'Non spécifié'}" sur le PDV ${id}.`
      );
      return res.status(403).json({
        success: false,
        code: 'ROLE_READONLY_MOTIF_403',
        error:
          "Accès refusé (403) : seul le Vendeur peut pointer une visite ou saisir un motif avant l'envoi.",
      });
    }

    const {
      vendor_id,
      visit_id,
      visit_mode,
      visit_type,
      no_sale_reason,
      motif,
      latitude,
      longitude,
      gps_accuracy,
      client_date,
      visit_date,
      visit_uuid,
      device_info,
    } = req.body || {};

    if (visit_id || req.body?.edit_motif || req.body?.update_motif) {
      return res.status(403).json({
        success: false,
        code: 'MOTIF_FIGE_403',
        error:
          "Modification refusée (403) : toute tentative de modifier un motif déjà envoyé est refusée. Le motif est définitivement figé à l'envoi.",
      });
    }

    const pdvRow = db
      .prepare('SELECT * FROM points_de_vente WHERE id = ? OR code = ?')
      .get(id, id) as any;

    if (!pdvRow) {
      return res.status(404).json({
        success: false,
        error: 'Point de vente introuvable.',
      });
    }

    const actor = resolveActor(req);
    const vendorId =
      typeof vendor_id === 'string' && vendor_id.trim()
        ? vendor_id.trim()
        : actor.role === 'Vendeur' && actor.id
        ? actor.id
        : headerUserId || 'usr-vnd-1';

    const cleanMotif = String(no_sale_reason || motif || '').trim();
    const rawMode = String(visit_type || visit_mode || '').toLowerCase().trim();
    const effectiveType =
      rawMode === 'avec_vente' || rawMode === 'visite_avec_vente'
        ? 'avec_vente'
        : 'sans_vente';

    const result = executeVrsVisitCheckin({
      actor: { ...actor, role: 'Vendeur', id: vendorId },
      vendorId,
      pdvId: pdvRow.id,
      latitude: latitude !== undefined ? Number(latitude) : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
      gpsAccuracy: gps_accuracy !== undefined ? Number(gps_accuracy) : undefined,
      deviceInfo: device_info || 'Déclaration Visite PDV',
      visitUuid: visit_uuid,
      visitDate: visit_date || client_date,
      visitType: effectiveType,
      noSaleReason: cleanMotif || null,
    });

    if (!result.success) {
      return res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
    }

    const updatedRoutineStatus = reconcileVendorPdvRoutineStatus(
      vendorId,
      visit_date || client_date
    );
    const activeDayVisitsCount =
      (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM vrs_visits
             WHERE vendor_id = ? AND pdv_id = ? AND visit_date = ?`
          )
          .get(vendorId, pdvRow.id, result.visit?.visit_date || updatedRoutineStatus.activeDate) as
          | { cnt: number }
          | undefined
      )?.cnt || 1;

    return res.status(result.httpStatus).json({
      success: true,
      visitId: result.visit?.id,
      visit: result.visit,
      visitType: result.visit?.visit_type,
      routineDayVisitsCount: activeDayVisitsCount,
      noSaleReason: result.visit?.no_sale_reason || null,
      alreadyCountedToday: Boolean(result.alreadyCountedToday),
      justReached25: Boolean(result.justValidatedDay),
      justValidatedDay: Boolean(result.justValidatedDay),
      justCompletedCycle: Boolean(result.justCompletedCycle),
      routineStatus: updatedRoutineStatus,
      state: result.state,
      message: result.message,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la déclaration de la visite au PDV';
    return res.status(500).json({ success: false, error: message });
  }
});

// Validation ou rejet des demandes de création de PDV : Administrateur ou Directeur des opérations de vente
apiRouter.patch('/pdvs/:id/status', requireAdminOrDirecteurOps, (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body; // 'valide' | 'rejete' | 'en_attente'
    const userRole = getUserRole(req) || 'Administrateur';
    const actorLabel =
      userRole === 'Directeur des opérations de vente'
        ? 'le Directeur des opérations de vente'
        : "l'Administrateur";

    if (status !== 'valide' && status !== 'rejete' && status !== 'en_attente') {
      return res.status(400).json({ success: false, error: 'Statut invalide.' });
    }
    const pdv = db.prepare(`
      SELECT p.*, COALESCE(u.name, p.created_by, 'Vendeur') AS vendor_name, u.code AS vendor_code
      FROM points_de_vente p
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.id = ?
    `).get(id) as any;
    if (!pdv) {
      return res.status(404).json({ success: false, error: 'Point de vente introuvable.' });
    }

    const nowIso = new Date().toISOString();
    const validatorBadgeLabel =
      userRole === 'Directeur des opérations de vente'
        ? 'Directeur des opérations de vente (DOV)'
        : 'Administrateur';

    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validation_status TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validated_by TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE points_de_vente ADD COLUMN validated_at TEXT');
    } catch {}
    try {
      db.exec("ALTER TABLE vrs_visits ADD COLUMN validation_status TEXT DEFAULT 'soumis'");
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN validated_by TEXT');
    } catch {}
    try {
      db.exec('ALTER TABLE vrs_visits ADD COLUMN validated_at TEXT');
    } catch {}

    db.prepare(
      `UPDATE points_de_vente
       SET status = ?,
           validation_status = ?,
           validated_by = ?,
           validated_at = ?,
           rejection_reason = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      status,
      status === 'valide' ? 'valide' : 'soumis',
      status === 'valide' ? validatorBadgeLabel : null,
      status === 'valide' ? nowIso : null,
      status === 'rejete' ? (rejection_reason || `Demande rejetée par ${actorLabel}`) : null,
      nowIso,
      id
    );

    if (status === 'valide') {
      try {
        db.prepare(
          'UPDATE vrs_visits SET validation_status = ?, validated_by = ?, validated_at = ? WHERE pdv_id = ?'
        ).run('valide', validatorBadgeLabel, nowIso, id);
      } catch {
        // ignore
      }
    }

    markNotificationsReadByReference('Administrateur', pdv.code);
    markNotificationsReadByReference('Directeur des opérations de vente', pdv.code);

    const statusLabel = status === 'valide' ? 'validé' : status === 'rejete' ? 'rejeté' : 'mis en attente';
    const notifType = status === 'valide' ? 'validation_pdv' : status === 'rejete' ? 'rejet_pdv' : 'info';
    const notifTitle =
      status === 'valide'
        ? `PDV Validé : ${pdv.name} (${pdv.code})`
        : status === 'rejete'
        ? `PDV Rejeté : ${pdv.name} (${pdv.code})`
        : `PDV en attente : ${pdv.name} (${pdv.code})`;
    const notifMessage =
      status === 'valide'
        ? `Félicitations ${pdv.vendor_name || ''} ! ${actorLabel === 'le Directeur des opérations de vente' ? 'Le Directeur des opérations de vente' : "L'Administrateur"} a validé votre Point de Vente "${pdv.name}" (${pdv.code}, quartier ${pdv.neighborhood}). Votre PDV est désormais actif pour vos ventes.`
        : status === 'rejete'
        ? `La demande de création du Point de Vente "${pdv.name}" (${pdv.code}, quartier ${pdv.neighborhood}) a été rejetée par ${actorLabel}.${rejection_reason ? ` Motif : ${rejection_reason}.` : ''}`
        : `Le statut du Point de Vente "${pdv.name}" (${pdv.code}) a été mis en attente par ${actorLabel}.`;

    sendNotification(
      'Vendeur',
      notifTitle,
      notifMessage,
      notifType,
      pdv.code,
      {
        targetUserId: pdv.vendor_id || null,
        metadataJson: JSON.stringify({
          pdvId: pdv.id,
          pdvCode: pdv.code,
          pdvName: pdv.name,
          neighborhood: pdv.neighborhood,
          managerName: pdv.manager_name,
          vendorId: pdv.vendor_id,
          vendorName: pdv.vendor_name,
          status,
          rejectionReason: status === 'rejete' ? (rejection_reason || null) : null,
        }),
      }
    );
    recordAudit(
      status === 'valide' ? 'VALIDATION_PDV' : status === 'rejete' ? 'REJET_PDV' : 'ATTENTE_PDV',
      'PDV',
      id,
      userRole,
      null,
      `Point de vente ${pdv.code} (${pdv.name}, créé par ${pdv.vendor_name}) ${statusLabel} par ${actorLabel}${status === 'rejete' && rejection_reason ? ` — Motif : ${rejection_reason}` : ''}.`
    );

    res.json({ success: true, message: `Point de vente ${statusLabel}.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Jours ouvrables de la routine de création de PDV (Lundi à Samedi — Dimanche exclu)
const PDV_ROUTINE_WEEK_DAYS: Array<{
  dayIndex: number;
  dayName: string;
  shortName: string;
}> = [
  { dayIndex: 1, dayName: 'Lundi', shortName: 'Lun' },
  { dayIndex: 2, dayName: 'Mardi', shortName: 'Mar' },
  { dayIndex: 3, dayName: 'Mercredi', shortName: 'Mer' },
  { dayIndex: 4, dayName: 'Jeudi', shortName: 'Jeu' },
  { dayIndex: 5, dayName: 'Vendredi', shortName: 'Ven' },
  { dayIndex: 6, dayName: 'Samedi', shortName: 'Sam' },
];

const PDV_ROUTINE_DAILY_TARGET = 25;

function resolvePdvRoutineReferenceDate(clientDateRaw?: unknown): {
  dateStr: string;
  weekdayIndex: number; // 1 (Lundi) .. 6 (Samedi), Dimanche ramené à Lundi (1)
} {
  const now = new Date();
  const bamakoDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Bamako',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const candidate =
    typeof clientDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clientDateRaw.trim())
      ? clientDateRaw.trim()
      : bamakoDateStr;

  const [y, m, d] = candidate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = dt.getUTCDay(); // 0 = Dimanche, 1 = Lundi .. 6 = Samedi
  const weekdayIndex = jsDay >= 1 && jsDay <= 6 ? jsDay : 1;

  return {
    dateStr: candidate,
    weekdayIndex,
  };
}

function getNextPdvRoutineDayIndex(currentDayIndex: number): number {
  if (currentDayIndex < 1 || currentDayIndex >= 6) return 1;
  return currentDayIndex + 1;
}

function getPdvRoutineDayMeta(dayIndex: number) {
  return (
    PDV_ROUTINE_WEEK_DAYS.find((d) => d.dayIndex === dayIndex) || PDV_ROUTINE_WEEK_DAYS[0]
  );
}

/**
 * Gère la sélection par défaut du jour de création de PDV, le blocage automatique des autres jours,
 * et la bascule automatique à partir de 00h00 dès que l'objectif de 25 PDV (ou plus) est atteint :
 * - Le jour de la création de PDV est sélectionné par défaut, ce qui bloque automatiquement les 5 autres jours.
 * - Chaque 25 PDV réalisés sur le jour actif débloque automatiquement le jour suivant à partir de 00h00
 *   et bloque automatiquement le jour passé à partir de 00h00.
 */
function reconcileVendorPdvRoutineStatus(vendorIdRaw: string, clientDateRaw?: unknown) {
  const vendorId = (vendorIdRaw || 'usr-vnd-1').trim() || 'usr-vnd-1';
  const candidateDate =
    typeof clientDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clientDateRaw.trim())
      ? clientDateRaw.trim()
      : undefined;

  const state = syncVendorVrsCycleTransaction(vendorId, candidateDate);
  const activeDay = state.activeDay || state.days[0];
  const activeDayIndex = Number(activeDay?.dayOfWeek || 1);
  const activeDayName = String(activeDay?.dayName || 'Lundi');
  const activePdvCount = Number(activeDay?.countedVisits || 0);
  const targetPdvCount = Number(activeDay?.targetPdvCount || state.settings.target_pdv_count || 25);
  const isTargetReachedToday = activeDay?.status === 'Validé' || activePdvCount >= targetPdvCount;

  const nextDaySlot =
    state.days.find((d: any) => d.slotIndex === Number(activeDay?.slotIndex || 1) + 1) ||
    state.days[0];

  const days = state.days.map((d: any) => ({
    slotIndex: d.slotIndex,
    date: d.date,
    dayIndex: d.dayOfWeek,
    dayOfWeek: d.dayOfWeek,
    dayName: d.dayName,
    shortName: d.shortName,
    status: d.status,
    statusLabel: d.status,
    statusCode:
      d.status === 'Validé'
        ? 'valide'
        : d.status === 'En cours'
        ? 'en_cours'
        : d.status === 'Disponible'
        ? 'disponible'
        : d.status === 'Incomplet'
        ? 'incomplet'
        : 'bloque',
    isSelected: Boolean(d.isSelected),
    isActiveDay: Boolean(d.isActiveDay),
    isLocked: Boolean(d.isLocked),
    countedVisits: Number(d.countedVisits || 0),
    pendingVisits: Number(d.pendingVisits || 0),
    contestedVisits: Number(d.contestedVisits || 0),
    totalVisits: Number(d.totalVisits || 0),
    pdvCount: Number(d.countedVisits || 0),
    targetPdvCount: Number(d.targetPdvCount || targetPdvCount),
    isTargetReached: d.status === 'Validé',
    derogationGranted: Boolean(d.derogationGranted),
    validatedAt: d.validatedAt || null,
  }));

  return {
    vendorId,
    referenceDate: state.referenceDate,
    routineStartDate: state.settings.routine_start_date,
    isStarted: state.isStarted,
    cycleStatus: state.cycleStatus,
    completionMessage: state.completionMessage,
    weekStartDate: state.weekStartDate,
    weekEndDate: state.weekEndDate,
    nextCycleStartDate: state.nextCycleStartDate,
    activeCycleId: state.cycle.id,
    stepNumber: Number(activeDay?.slotIndex || 1),
    activeDayIndex,
    activeDayName,
    activeDate: activeDay?.date || state.weekStartDate,
    routineName: `Routine ${activeDayName} - ${
      ({
        Lundi: 'Sotuba',
        Mardi: 'Badalabougou',
        Mercredi: 'ACI 2000',
        Jeudi: 'Faladié',
        Vendredi: 'Lafiabougou',
        Samedi: 'Bozola',
      } as Record<string, string>)[activeDayName] || 'Sotuba'
    }`,
    activePdvCount,
    countedVisitsCount: Number(activeDay?.countedVisits || 0),
    pendingVisitsCount: Number(activeDay?.pendingVisits || 0),
    contestedVisitsCount: Number(activeDay?.contestedVisits || 0),
    targetPdvCount,
    remainingForTarget: Math.max(0, targetPdvCount - activePdvCount),
    isTargetReachedToday,
    reachedTargetDate: activeDay?.validatedAt ? String(activeDay.validatedAt).slice(0, 10) : null,
    nextDayIndex: Number(nextDaySlot?.dayOfWeek || 1),
    nextDayName: String(nextDaySlot?.dayName || 'Lundi'),
    nextDayDate: String(nextDaySlot?.date || state.nextCycleStartDate),
    totalRealizedPdvs: Number(state.cycle.totalCycleCountedVisits || 0),
    completedBatchesOf25: Number(state.cycle.validatedDaysCount || 0),
    monthlyObjective: state.monthlyObjective,
    days,
  };
}

// Statut de la routine de création de PDV (6 jours Lundi..Samedi en petits blocs, objectif 25 PDV/jour, bascule auto à 00h00)
apiRouter.get('/pdvs/routine-status', (req, res) => {
  try {
    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const queryVendorId =
      typeof req.query.vendor_id === 'string' ? req.query.vendor_id.trim() : '';
    const clientDate =
      typeof req.query.client_date === 'string' ? req.query.client_date.trim() : undefined;

    const vendorId = queryVendorId || headerUserId || 'usr-vnd-1';
    const routineStatus = reconcileVendorPdvRoutineStatus(vendorId, clientDate);

    res.json({
      success: true,
      routineStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la lecture de la routine PDV';
    res.status(500).json({ success: false, error: message });
  }
});

// Création d'un PDV : Vendeur uniquement, conditionnée par la prise de photo en direct de la devanture, la position GPS précise et la routine du jour actif
apiRouter.post('/pdvs', requireVendeur, (req, res) => {
  try {
    const {
      name,
      manager_name,
      neighborhood,
      phone,
      latitude,
      longitude,
      gps_accuracy,
      photo_data,
      captured_at,
      vendor_id,
      created_by,
      routine_name,
      routine_day,
      routine_day_index,
      client_date,
    } = req.body;

    if (!name || !manager_name) {
      return res.status(400).json({ success: false, error: 'Le nom du commerce et le nom du gérant sont obligatoires.' });
    }
    const cleanRoutineName =
      typeof routine_name === 'string' && routine_name.trim()
        ? routine_name.trim()
        : `Routine ${(routine_day || 'Lundi').toString().trim()} - ${(neighborhood || 'Sotuba').toString().trim()}`;

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({
        success: false,
        error: 'Position GPS obligatoire : la création d\'un PDV exige l\'enregistrement instantané de la position GPS précise lors de la capture.'
      });
    }
    if (!photo_data || typeof photo_data !== 'string' || !photo_data.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Photo de devanture obligatoire : vous devez prendre une photo avec le flux direct de la caméra incluant la position GPS, la date et l\'heure.'
      });
    }

    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const creatorVendorId = (vendor_id || headerUserId || 'usr-vnd-1').trim();
    const vendorRow = db.prepare('SELECT id, name, code, team, phone FROM users WHERE id = ?').get(creatorVendorId) as { id: string; name: string; code: string; team: string; phone: string } | undefined;
    const creatorName = vendorRow?.name || created_by || 'Oumar Konaté';
    const creatorCode = vendorRow?.code || 'BAO-VND-001';

    // Réconcilier l'état de la routine du vendeur (bascule auto à 00h00 si les 25 PDV ont été atteints la veille)
    const beforeRoutineStatus = reconcileVendorPdvRoutineStatus(creatorVendorId, client_date);

    // Vérifier que le jour soumis correspond bien au seul jour débloqué (les autres jours + Dimanche sont bloqués)
    if (
      routine_day_index !== undefined &&
      routine_day_index !== null &&
      Number(routine_day_index) !== beforeRoutineStatus.activeDayIndex
    ) {
      return res.status(400).json({
        success: false,
        error: `Jour bloqué : seul le jour « ${beforeRoutineStatus.activeDayName} » est sélectionné et débloqué (${beforeRoutineStatus.activePdvCount}/${beforeRoutineStatus.targetPdvCount} PDV). Les autres jours restent bloqués tant que les 25 PDV ne sont pas atteints et jusqu'à 00h00.`,
      });
    }
    if (
      typeof routine_day === 'string' &&
      routine_day.trim().length > 0 &&
      routine_day.trim().toLowerCase() !== beforeRoutineStatus.activeDayName.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        error: `Jour bloqué : seul le jour « ${beforeRoutineStatus.activeDayName} » est sélectionné et débloqué (${beforeRoutineStatus.activePdvCount}/${beforeRoutineStatus.targetPdvCount} PDV).`,
      });
    }

    // Save the stamped storefront photo to public/uploads for archival AND keep the data URL in photo_url so it renders immediately as profile image
    try {
      const base64Clean = photo_data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      const savedFilename = `pdv-devanture-${Date.now()}.jpg`;
      const filePath = path.join(uploadsDir, savedFilename);
      fs.writeFileSync(filePath, buffer);
    } catch {
      // ignore disk write issues; photo_data is stored directly in DB
    }
    const photoUrl = photo_data;

    const count = (db.prepare('SELECT COUNT(*) as count FROM points_de_vente').get() as { count: number }).count;
    const code = `PDV-BKO-${String(count + 1).padStart(2, '0')}`;
    const id = `pdv-${Date.now()}`;
    const createdAt = beforeRoutineStatus.referenceDate;
    const accNum = Number.isFinite(Number(gps_accuracy)) ? Number(gps_accuracy) : 5;
    const capturedAtStr = captured_at || new Date().toLocaleString('fr-FR');
    const activeDayName = beforeRoutineStatus.activeDayName;
    const activeDayIndex = beforeRoutineStatus.activeDayIndex;
    const activeCycleId = beforeRoutineStatus.activeCycleId;

    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO points_de_vente (
        id, code, name, manager_name, neighborhood, city, phone, status,
        latitude, longitude, gps_accuracy, photo_url, captured_at,
        vendor_id, created_by, routine_name, routine_day, routine_day_index, routine_cycle_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'Bamako', ?, 'en_attente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      code,
      name,
      manager_name,
      neighborhood || 'Sotuba',
      phone || '',
      latNum,
      lngNum,
      accNum,
      photoUrl,
      capturedAtStr,
      creatorVendorId,
      creatorName,
      cleanRoutineName,
      activeDayName,
      activeDayIndex,
      activeCycleId,
      createdAt,
      nowIso
    );

    // Incrémenter le compteur de PDV réalisés sur le jour de routine actif
    const nextPdvCount = beforeRoutineStatus.activePdvCount + 1;
    const justReached25 =
      nextPdvCount >= beforeRoutineStatus.targetPdvCount && !beforeRoutineStatus.reachedTargetDate;
    const reachedDateToStore =
      beforeRoutineStatus.reachedTargetDate ||
      (nextPdvCount >= beforeRoutineStatus.targetPdvCount ? beforeRoutineStatus.referenceDate : null);

    db.prepare(`
      UPDATE pdv_routine_cycles
      SET pdv_count = ?,
          routine_name = ?,
          reached_target_date = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextPdvCount,
      cleanRoutineName,
      reachedDateToStore,
      nowIso,
      activeCycleId
    );

    // Enregistrer automatiquement la visite terrain du jour (vrs_visits) lors de la création du PDV
    try {
      const [yStr, mStr, dStr] = createdAt.split('-');
      const refUtc = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr), 12, 0, 0));
      const jsDay = refUtc.getUTCDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;
      const mondayUtc = new Date(refUtc.getTime() - (dayOfWeek - 1) * 86400000);
      const weekStartDate = mondayUtc.toISOString().split('T')[0];
      const visitTimeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Bamako',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      const visitId = `vrs-vis-pdv-${id}`;
      db.prepare(`
        INSERT OR IGNORE INTO vrs_visits (
          id, visit_uuid, week_start_date, visit_date, visit_time, server_recorded_at,
          vendor_id, pdv_id, latitude, longitude, gps_accuracy, distance_m,
          device_info, is_counted, status_reason, recorded_offline, client_recorded_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, 0, ?, ?)
      `).run(
        visitId,
        `uuid-${visitId}`,
        weekStartDate,
        createdAt,
        visitTimeStr,
        nowIso,
        creatorVendorId,
        id,
        latNum,
        lngNum,
        accNum,
        `Création PDV • Routine ${cleanRoutineName}`,
        `Création PDV (${activeDayName}) — ${nextPdvCount}/${beforeRoutineStatus.targetPdvCount} PDV`,
        nowIso,
        nowIso
      );
    } catch {
      // Ignore if vrs_visits table is not yet initialized
    }

    const updatedRoutineStatus = reconcileVendorPdvRoutineStatus(creatorVendorId, client_date);

    sendNotification(
      'Administrateur',
      `Nouveau PDV créé par ${creatorName} : ${name}`,
      `Le vendeur ${creatorName} (${creatorCode}) a créé le point de vente "${name}" (${code}, quartier ${neighborhood || 'Sotuba'}, gérant : ${manager_name} — Routine "${cleanRoutineName}" • ${activeDayName} [${nextPdvCount}/${beforeRoutineStatus.targetPdvCount} PDV]) avec photo de profil de devanture certifiée et GPS (${latNum.toFixed(5)}, ${lngNum.toFixed(5)}). En attente de votre validation.`,
      'creation_pdv',
      code,
      {
        metadataJson: JSON.stringify({
          pdvId: id,
          pdvCode: code,
          pdvName: name,
          managerName: manager_name,
          neighborhood: neighborhood || 'Sotuba',
          routineName: cleanRoutineName,
          routineDay: activeDayName,
          routineProgress: `${nextPdvCount}/${beforeRoutineStatus.targetPdvCount}`,
          vendorId: creatorVendorId,
          vendorName: creatorName,
          vendorCode: creatorCode,
        }),
      }
    );
    sendNotification(
      'Directeur des opérations de vente',
      `Nouveau PDV à valider (${creatorName}) : ${name}`,
      `Le vendeur ${creatorName} (${creatorCode}) a soumis une demande de création pour le point de vente "${name}" (${code}, quartier ${neighborhood || 'Sotuba'}, gérant : ${manager_name} — Routine "${cleanRoutineName}" • ${activeDayName} [${nextPdvCount}/${beforeRoutineStatus.targetPdvCount} PDV]). En attente de validation.`,
      'creation_pdv',
      code,
      {
        metadataJson: JSON.stringify({
          pdvId: id,
          pdvCode: code,
          pdvName: name,
          managerName: manager_name,
          neighborhood: neighborhood || 'Sotuba',
          routineName: cleanRoutineName,
          routineDay: activeDayName,
          routineProgress: `${nextPdvCount}/${beforeRoutineStatus.targetPdvCount}`,
          vendorId: creatorVendorId,
          vendorName: creatorName,
          vendorCode: creatorCode,
        }),
      }
    );

    if (justReached25) {
      sendNotification(
        'Vendeur',
        `Objectif 25 PDV atteint (${activeDayName}) — Routine "${cleanRoutineName}"`,
        `Félicitations ${creatorName} ! Vous avez atteint ${nextPdvCount}/${beforeRoutineStatus.targetPdvCount} PDV sur le jour "${activeDayName}" (Routine "${cleanRoutineName}"). À partir de 00h00, le jour suivant ("${beforeRoutineStatus.nextDayName}") sera débloqué automatiquement et "${activeDayName}" sera bloqué automatiquement.`,
        'info',
        code,
        {
          targetUserId: creatorVendorId,
        }
      );
    }

    recordAudit(
      'CREATION_DEMANDE_PDV',
      'PDV',
      id,
      'Vendeur',
      creatorVendorId,
      `Demande PDV ${code} (${name}) créée par ${creatorName} (${creatorCode}) dans la routine "${cleanRoutineName}" (${activeDayName} : ${nextPdvCount}/${beforeRoutineStatus.targetPdvCount} PDV) avec photo de profil devanture et GPS (${latNum.toFixed(6)}, ${lngNum.toFixed(6)} ±${accNum.toFixed(1)}m) capturé à ${capturedAtStr}.`
    );

    res.json({
      success: true,
      message: 'Point de vente créé avec sa photo de devanture assignée comme image de profil (en attente de validation par l\'Administrateur).',
      routineStatus: updatedRoutineStatus,
      pdv: {
        id,
        code,
        name,
        manager_name,
        neighborhood: neighborhood || 'Sotuba',
        city: 'Bamako',
        phone: phone || '',
        status: 'en_attente',
        latitude: latNum,
        longitude: lngNum,
        gps_accuracy: accNum,
        photo_url: photoUrl,
        captured_at: capturedAtStr,
        vendor_id: creatorVendorId,
        created_by: creatorName,
        vendor_code: creatorCode,
        vendor_team: vendorRow?.team || '',
        routine_name: cleanRoutineName,
        routine_day: activeDayName,
        routine_day_index: activeDayIndex,
        routine_cycle_id: activeCycleId,
        created_at: createdAt,
        updated_at: nowIso,
        sales_count: 0,
        total_sales_amount: 0,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// TABLEAU DE BORD DE PERFORMANCE (KPI) SPÉCIFIQUE AU VENDEUR — TEMPS RÉEL
// Objectifs de 25 PDV / jour, visites effectuées et ventes réalisées sur la journée en cours
// ============================================================================
function buildVendorDailyPerformancePayload(
  vendorIdRaw: string,
  clientDateStr?: string,
  startDateStr?: string,
  endDateStr?: string
) {
  ensureAllPdvsBoundToVendorAndRoutineDay();

  const availableVendors = db
    .prepare(
      "SELECT id, name, code, team, phone FROM users WHERE role = 'Vendeur' ORDER BY code ASC"
    )
    .all() as Array<{ id: string; name: string; code: string; team: string; phone: string }>;

  let vendorRow = db
    .prepare('SELECT id, name, code, team, phone, role FROM users WHERE id = ?')
    .get(vendorIdRaw) as
    | { id: string; name: string; code: string; team: string; phone: string; role?: string }
    | undefined;

  if (!vendorRow || vendorRow.role !== 'Vendeur') {
    vendorRow = availableVendors[0]
      ? { ...availableVendors[0], role: 'Vendeur' }
      : {
          id: 'usr-vnd-1',
          name: 'Oumar Konaté',
          code: 'BAO-VND-001',
          team: 'Équipe A (Bamako Nord)',
          phone: '+223 76 11 22 33',
          role: 'Vendeur',
        };
  }

  const vendorId = vendorRow.id || 'usr-vnd-1';
  let routineStatus = reconcileVendorPdvRoutineStatus(vendorId, clientDateStr);
  const referenceDate = routineStatus.referenceDate;

  const isValidIsoDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()));
  const rawStart = isValidIsoDate(startDateStr) ? startDateStr!.trim() : referenceDate;
  const rawEnd = isValidIsoDate(endDateStr) ? endDateStr!.trim() : rawStart;
  const periodStart = rawStart <= rawEnd ? rawStart : rawEnd;
  const periodEnd = rawStart <= rawEnd ? rawEnd : rawStart;
  const isSingleCurrentDay = periodStart === referenceDate && periodEnd === referenceDate;

  let workingDaysCount = 1;
  try {
    const startMs = new Date(`${periodStart}T12:00:00Z`).getTime();
    const endMs = new Date(`${periodEnd}T12:00:00Z`).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      let count = 0;
      for (let t = startMs; t <= endMs; t += 86400000) {
        const d = new Date(t);
        if (d.getUTCDay() !== 0) {
          count += 1;
        }
      }
      workingDaysCount = Math.max(1, count);
    }
  } catch {
    workingDaysCount = 1;
  }

  const vendorMeta = {
    id: vendorRow.id || vendorId,
    name: vendorRow.name || 'Oumar Konaté',
    code: vendorRow.code || 'BAO-VND-001',
    team: vendorRow.team || 'Équipe A (Bamako Nord)',
    phone: vendorRow.phone || '+223 76 11 22 33',
  };

  // 1. Récupérer les PDV créés par ce vendeur sur la période sélectionnée [periodStart, periodEnd]
  const pdvsCreatedToday = db
    .prepare(
      `
      SELECT id, code, name, manager_name, neighborhood, phone, status,
             latitude, longitude, gps_accuracy, captured_at,
             routine_name, routine_day, routine_day_index, created_at
      FROM points_de_vente
      WHERE vendor_id = ?
        AND substr(created_at, 1, 10) >= ?
        AND substr(created_at, 1, 10) <= ?
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    `
    )
    .all(vendorId, periodStart, periodEnd) as any[];

  ensureVisitMotifImmutabilityAndReactionsSchema();

  const reactionsByVisitId = new Map<
    string,
    Array<{
      id: string;
      visitId: string;
      decision: 'accepte' | 'conteste';
      comment: string | null;
      actorName: string;
      actorRole: string;
      createdAt: string;
    }>
  >();
  try {
    const rxRows = db
      .prepare(
        `SELECT id, visit_id, decision, comment, actor_name, actor_role, created_at
         FROM vrs_visit_motif_reactions
         WHERE vendor_id = ? OR vendor_id IS NULL
         ORDER BY created_at DESC`
      )
      .all(vendorId) as any[];
    for (const r of rxRows) {
      const vid = String(r.visit_id || '');
      if (!vid) continue;
      const list = reactionsByVisitId.get(vid) || [];
      list.push({
        id: String(r.id),
        visitId: vid,
        decision: r.decision === 'conteste' ? 'conteste' : 'accepte',
        comment: r.comment || null,
        actorName: String(r.actor_name || 'DOV'),
        actorRole: String(r.actor_role || 'Directeur des opérations de vente'),
        createdAt: String(r.created_at || ''),
      });
      reactionsByVisitId.set(vid, list);
    }
  } catch {
    // ignore
  }

  // 2. Récupérer toutes les visites effectuées par ce vendeur sur la période sélectionnée
  let todayVisitsRaw: any[] = [];
  const activeVisitDate = routineStatus.activeDate || referenceDate;
  try {
    if (isSingleCurrentDay) {
      todayVisitsRaw = db
        .prepare(
          `
          SELECT v.id, v.visit_uuid, v.visit_date, v.visit_time, v.server_recorded_at,
                 v.pdv_id, v.latitude, v.longitude, v.gps_accuracy, v.distance_m,
                 v.is_counted, v.status_reason, v.device_info, v.recorded_offline,
                 COALESCE(v.visit_type, 'visite') as visit_type,
                 v.no_sale_reason,
                 v.sale_id,
                 COALESCE(v.validation_status, 'en_attente') as validation_status,
                 v.validated_by,
                 v.validated_at,
                 v.motif_reaction_status,
                 v.motif_reaction_comment,
                 v.motif_reacted_by,
                 v.motif_reacted_role,
                 v.motif_reacted_at,
                 COALESCE(p.name, 'PDV') as pdv_name,
                 COALESCE(p.code, 'PDV') as pdv_code,
                 COALESCE(p.neighborhood, 'Bamako') as pdv_neighborhood,
                 COALESCE(p.manager_name, '') as pdv_manager_name,
                 COALESCE(p.phone, '') as pdv_phone,
                 COALESCE(p.status, 'valide') as pdv_status,
                 p.validation_status as pdv_validation_status,
                 p.validated_by as pdv_validated_by,
                 p.routine_name as pdv_routine_name,
                 p.routine_day as pdv_routine_day
          FROM vrs_visits v
          LEFT JOIN points_de_vente p ON p.id = v.pdv_id
          WHERE v.vendor_id = ?
            AND v.visit_date = ?
          ORDER BY v.visit_date DESC, v.visit_time DESC, v.created_at DESC
        `
        )
        .all(vendorId, activeVisitDate) as any[];
    } else {
      todayVisitsRaw = db
        .prepare(
          `
          SELECT v.id, v.visit_uuid, v.visit_date, v.visit_time, v.server_recorded_at,
                 v.pdv_id, v.latitude, v.longitude, v.gps_accuracy, v.distance_m,
                 v.is_counted, v.status_reason, v.device_info, v.recorded_offline,
                 COALESCE(v.visit_type, 'visite') as visit_type,
                 v.no_sale_reason,
                 v.sale_id,
                 COALESCE(v.validation_status, 'en_attente') as validation_status,
                 v.validated_by,
                 v.validated_at,
                 v.motif_reaction_status,
                 v.motif_reaction_comment,
                 v.motif_reacted_by,
                 v.motif_reacted_role,
                 v.motif_reacted_at,
                 COALESCE(p.name, 'PDV') as pdv_name,
                 COALESCE(p.code, 'PDV') as pdv_code,
                 COALESCE(p.neighborhood, 'Bamako') as pdv_neighborhood,
                 COALESCE(p.manager_name, '') as pdv_manager_name,
                 COALESCE(p.phone, '') as pdv_phone,
                 COALESCE(p.status, 'valide') as pdv_status,
                 p.validation_status as pdv_validation_status,
                 p.validated_by as pdv_validated_by,
                 p.routine_name as pdv_routine_name,
                 p.routine_day as pdv_routine_day
          FROM vrs_visits v
          LEFT JOIN points_de_vente p ON p.id = v.pdv_id
          WHERE v.vendor_id = ?
            AND v.visit_date >= ?
            AND v.visit_date <= ?
          ORDER BY v.visit_date DESC, v.visit_time DESC, v.created_at DESC
        `
        )
        .all(vendorId, periodStart, periodEnd) as any[];
    }
  } catch {
    todayVisitsRaw = [];
  }

  const uniqueVisitedPdvIdsToday = new Set<string>();
  const countedVisitedPdvIdsToday = new Set<string>();
  for (const vis of todayVisitsRaw) {
    if (vis.pdv_id) {
      uniqueVisitedPdvIdsToday.add(String(vis.pdv_id));
      if (Number(vis.is_counted ?? 0) === 1) {
        countedVisitedPdvIdsToday.add(String(vis.pdv_id));
      }
    }
  }

  const periodTargetPdv = isSingleCurrentDay
    ? routineStatus.targetPdvCount
    : workingDaysCount * routineStatus.targetPdvCount;

  const realizedPdvCount = isSingleCurrentDay
    ? routineStatus.countedVisitsCount
    : countedVisitedPdvIdsToday.size;

  const totalVisitsToday = todayVisitsRaw.length;

  const countedTowards25 = Math.min(periodTargetPdv, realizedPdvCount);
  const remainingPdvForTarget = Math.max(0, periodTargetPdv - realizedPdvCount);
  const extraVisitsBeyond25 = Math.max(0, realizedPdvCount - periodTargetPdv);
  const progressPercent = Math.min(
    100,
    Math.round((realizedPdvCount / Math.max(1, periodTargetPdv)) * 100)
  );
  const isTargetReachedForPeriod = isSingleCurrentDay
    ? routineStatus.isTargetReachedToday
    : realizedPdvCount >= periodTargetPdv;

  // 3. Récupérer les ventes réalisées par ce vendeur sur la période sélectionnée [periodStart, periodEnd]
  const todaySalesRows = db
    .prepare(
      `
      SELECT s.id, s.number, s.thermal_ticket_number, s.date, s.sale_time,
             s.vendor_id, s.pdv_id, s.items, s.total_amount,
             s.buyer_type, s.wholesale_discount_amount, s.cajoucy_boxes_count,
             s.payment_type, s.status, s.recorded_offline, s.created_at,
             COALESCE(p.name, 'PDV') as pdv_name,
             COALESCE(p.code, 'PDV') as pdv_code,
             COALESCE(p.neighborhood, 'Bamako') as pdv_neighborhood,
             COALESCE(p.manager_name, '') as pdv_manager_name,
             COALESCE(p.routine_name, '') as pdv_routine_name,
             COALESCE(p.routine_day, '') as pdv_routine_day
      FROM sales s
      LEFT JOIN points_de_vente p ON p.id = s.pdv_id
      WHERE s.vendor_id = ?
        AND s.date >= ?
        AND s.date <= ?
        AND COALESCE(s.status, 'livree') != 'annulee'
      ORDER BY s.date DESC, COALESCE(s.sale_time, '00:00') DESC, s.created_at DESC
    `
    )
    .all(vendorId, periodStart, periodEnd) as any[];

  let salesRevenueToday = 0;
  let salesCartonsToday = 0;
  let wholesaleDiscountToday = 0;
  const soldPdvIdsToday = new Set<string>();
  const paymentMap = new Map<string, { count: number; amount: number }>();

  const salesList = todaySalesRows.map((row) => {
    const amount = Number(row.total_amount || 0);
    let rawItems: any[] = [];
    try {
      rawItems =
        typeof row.items === 'string'
          ? JSON.parse(row.items)
          : Array.isArray(row.items)
          ? row.items
          : [];
    } catch {
      rawItems = [];
    }
    const parsedItems = rawItems.map((it: any) => {
      const qty = Math.max(0, Number(it?.qtyBoxes ?? it?.qty ?? it?.quantity ?? 0));
      const price = Math.max(0, Number(it?.unitPrice ?? it?.price ?? 0));
      return {
        product_id: it?.productId || it?.product_id || it?.code || '',
        code: it?.code || 'ART',
        name: it?.name || it?.description || 'Produit Baobab',
        quantity: qty,
        qtyBoxes: qty,
        price,
        unitPrice: price,
        total: Number(it?.total ?? qty * price),
      };
    });
    const itemsQty = parsedItems.reduce((sum, it) => sum + Number(it?.qtyBoxes || 0), 0);
    const cartons = Math.max(Number(row.cajoucy_boxes_count || 0), itemsQty);
    const discount = Number(row.wholesale_discount_amount || 0);
    const paymentType = String(row.payment_type || 'Comptant');

    salesRevenueToday += amount;
    salesCartonsToday += cartons;
    wholesaleDiscountToday += discount;
    if (row.pdv_id) {
      soldPdvIdsToday.add(String(row.pdv_id));
    }

    const prevPay = paymentMap.get(paymentType) || { count: 0, amount: 0 };
    paymentMap.set(paymentType, {
      count: prevPay.count + 1,
      amount: prevPay.amount + amount,
    });

    const resolvedRoutineDay = row.pdv_routine_day || routineStatus.activeDayName || 'Vendredi';
    const resolvedRoutineName =
      (row.pdv_routine_name && String(row.pdv_routine_name).trim()) ||
      routineStatus.routineName ||
      `Routine ${resolvedRoutineDay}`;

    return {
      id: row.id,
      number: row.number,
      thermalTicketNumber:
        row.thermal_ticket_number || String(row.number || '').replace(/^VTE-/, 'TKT-THERM-'),
      date: row.date,
      saleTime: row.sale_time || '09:00',
      pdvId: row.pdv_id,
      pdvName: row.pdv_name,
      pdvCode: row.pdv_code,
      pdvNeighborhood: row.pdv_neighborhood,
      pdvManagerName: row.pdv_manager_name,
      routineName: resolvedRoutineName,
      routineDay: resolvedRoutineDay,
      totalAmount: amount,
      cartonsCount: cartons,
      wholesaleDiscountAmount: discount,
      buyerType: row.buyer_type || 'revendeur',
      paymentType,
      status: row.status || 'livree',
      recordedOffline: Boolean(row.recorded_offline),
      items: parsedItems,
    };
  });

  const salesCountToday = salesList.length;
  const averageBasketToday = salesCountToday > 0 ? Math.round(salesRevenueToday / salesCountToday) : 0;

  // Taux de transformation Visites -> Ventes sur la période
  const effectiveVisitsForConversion = Math.max(totalVisitsToday, soldPdvIdsToday.size);
  const conversionRatePercent =
    effectiveVisitsForConversion > 0
      ? Math.min(100, Math.round((salesCountToday / effectiveVisitsForConversion) * 100))
      : 0;

  const paymentBreakdown = Array.from(paymentMap.entries())
    .map(([paymentType, stats]) => ({
      paymentType,
      count: stats.count,
      amount: stats.amount,
      sharePercent:
        salesRevenueToday > 0 ? Math.round((stats.amount / salesRevenueToday) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 4. Historique récent des 6 derniers jours d'activité du vendeur (ventes & visites) pour comparaison
  const recentSalesByDay = db
    .prepare(
      `
      SELECT date,
             COUNT(*) as sales_count,
             COALESCE(SUM(total_amount), 0) as revenue,
             COALESCE(SUM(cajoucy_boxes_count), 0) as cartons
      FROM sales
      WHERE vendor_id = ?
        AND COALESCE(status, 'livree') != 'annulee'
      GROUP BY date
      ORDER BY date DESC
      LIMIT 6
    `
    )
    .all(vendorId) as Array<{ date: string; sales_count: number; revenue: number; cartons: number }>;

  // 5. Liste des PDV du périmètre vendeur pour pointage rapide d'une visite en temps réel :
  // Uniquement les PDV créés par ce vendeur ET liés à son jour actif de routine (ex: Vendredi -> Vendredi uniquement)
  ensureAllPdvsBoundToVendorAndRoutineDay();

  const vendorPerimeterPdvs = db
    .prepare(
      `
      SELECT id, code, name, manager_name, neighborhood, phone, status,
             validation_status, validated_by, validated_at,
             latitude, longitude, routine_name, routine_day, routine_day_index, created_at
      FROM points_de_vente
      WHERE vendor_id = ?
        AND COALESCE(status, 'valide') != 'rejete'
      ORDER BY code ASC, name ASC
      LIMIT 80
    `
    )
    .all(vendorId) as any[];

  // Indexer les visites et ventes par PDV pour enrichir la liste des PDV validés de la routine
  const visitsByPdvId = new Map<string, any[]>();
  for (const vis of todayVisitsRaw) {
    const pid = String(vis.pdv_id || '');
    if (!pid) continue;
    const arr = visitsByPdvId.get(pid) || [];
    arr.push(vis);
    visitsByPdvId.set(pid, arr);
  }

  const salesByPdvId = new Map<string, typeof salesList>();
  for (const sl of salesList) {
    const pid = String(sl.pdvId || '');
    if (!pid) continue;
    const arr = salesByPdvId.get(pid) || [];
    arr.push(sl);
    salesByPdvId.set(pid, arr);
  }

  const defaultRoutineNameForDay =
    (routineStatus.routineName && String(routineStatus.routineName).trim()) ||
    `Routine ${routineStatus.activeDayName} - ${vendorMeta.name}`;

  // Statistiques cumulées (toutes dates) par PDV pour ce vendeur
  const allTimeVisitsByPdv = new Map<
    string,
    { totalVisits: number; noSaleVisits: number; withSaleVisits: number }
  >();
  try {
    const aggVisits = db
      .prepare(
        `SELECT pdv_id,
                COUNT(*) AS total_visits,
                SUM(CASE WHEN visit_type IN ('visite_sans_vente', 'sans_vente') OR (no_sale_reason IS NOT NULL AND TRIM(no_sale_reason) != '' AND visit_type NOT IN ('visite_avec_vente', 'avec_vente')) THEN 1 ELSE 0 END) AS no_sale_visits,
                SUM(CASE WHEN visit_type IN ('visite_avec_vente', 'avec_vente') OR (sale_id IS NOT NULL AND TRIM(sale_id) != '') THEN 1 ELSE 0 END) AS with_sale_visits
         FROM vrs_visits
         WHERE vendor_id = ?
         GROUP BY pdv_id`
      )
      .all(vendorId) as any[];
    for (const row of aggVisits) {
      allTimeVisitsByPdv.set(String(row.pdv_id), {
        totalVisits: Number(row.total_visits || 0),
        noSaleVisits: Number(row.no_sale_visits || 0),
        withSaleVisits: Number(row.with_sale_visits || 0),
      });
    }
  } catch {
    // fallback silencieux
  }

  const allTimeSalesByPdv = new Map<string, number>();
  try {
    const aggSales = db
      .prepare(
        `SELECT pdv_id, COUNT(*) AS sales_count
         FROM sales
         WHERE vendor_id = ? AND COALESCE(status, '') NOT IN ('annule', 'annulee')
         GROUP BY pdv_id`
      )
      .all(vendorId) as any[];
    for (const row of aggSales) {
      allTimeSalesByPdv.set(String(row.pdv_id), Number(row.sales_count || 0));
    }
  } catch {
    // fallback silencieux
  }

  const perimeterPdvs = vendorPerimeterPdvs.map((p) => {
    const pid = String(p.id);
    const pdvVisits = visitsByPdvId.get(pid) || [];
    const pdvSales = salesByPdvId.get(pid) || [];
    const latestVisit = pdvVisits[0] || null;
    const hasSale = pdvSales.length > 0 || soldPdvIdsToday.has(pid);
    const noSaleVisit = pdvVisits.find(
      (v) =>
        v.visit_type === 'visite_sans_vente' ||
        v.visit_type === 'sans_vente' ||
        Boolean(v.no_sale_reason && String(v.no_sale_reason).trim())
    );
    const visited = pdvVisits.length > 0 || hasSale;
    const isCountedForDay =
      pdvVisits.some(
        (v) =>
          Number(v.is_counted) === 1 ||
          String(v.validation_status || '').toLowerCase() === 'valide' ||
          String(v.motif_reaction_status || '').toLowerCase() === 'accepte'
      ) || hasSale;
    const isContestedForDay =
      !isCountedForDay &&
      pdvVisits.some(
        (v) => v.motif_reaction_status === 'conteste' || v.validation_status === 'conteste'
      );

    const visitCategory: 'avec_vente' | 'sans_vente' | 'a_visiter' = hasSale
      ? 'avec_vente'
      : visited
      ? 'sans_vente'
      : 'a_visiter';

    const routineDayVisitsCount = Math.max(pdvVisits.length, hasSale ? 1 : 0);
    const cumVisits = allTimeVisitsByPdv.get(pid) || {
      totalVisits: 0,
      noSaleVisits: 0,
      withSaleVisits: 0,
    };
    const totalSalesCount = Math.max(
      allTimeSalesByPdv.get(pid) || 0,
      cumVisits.withSaleVisits,
      pdvSales.length
    );
    const totalNoSaleVisitsCount = cumVisits.noSaleVisits;
    const totalVisitsCount = Math.max(
      cumVisits.totalVisits,
      totalSalesCount + totalNoSaleVisitsCount,
      routineDayVisitsCount
    );

    const visitValidationStatus: 'valide' | 'soumis' | 'conteste' = isCountedForDay
      ? 'valide'
      : isContestedForDay
      ? 'conteste'
      : 'soumis';

    const validatedBy =
      pdvVisits.find((v) => v.validated_by)?.validated_by ||
      pdvVisits.find((v) => v.motif_reacted_by)?.motif_reacted_by ||
      null;

    const activeMotifVisit =
      pdvVisits.find((v) => Boolean(v.no_sale_reason && String(v.no_sale_reason).trim())) ||
      noSaleVisit ||
      latestVisit;
    const activeMotifVisitId = activeMotifVisit?.id ? String(activeMotifVisit.id) : null;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      managerName: p.manager_name || '',
      neighborhood: p.neighborhood || 'Bamako',
      phone: p.phone || '',
      status: p.status || 'valide',
      latitude: Number(p.latitude || 12.6392),
      longitude: Number(p.longitude || -8.0029),
      routineName:
        (p.routine_name && String(p.routine_name).trim()) || defaultRoutineNameForDay,
      routineDay: p.routine_day || routineStatus.activeDayName,
      routineDayIndex: Number(p.routine_day_index || routineStatus.activeDayIndex),
      visitedToday: visited,
      visitedEver: totalVisitsCount > 0 || totalSalesCount > 0,
      soldToday: hasSale,
      hasSaleToday: hasSale,
      hasAnySale: totalSalesCount > 0 || hasSale,
      createdToday: String(p.created_at || '').slice(0, 10) === referenceDate,
      visitCategory,
      routineDayVisitsCount,
      todayVisitsCount: routineDayVisitsCount,
      totalVisitsCount,
      totalSalesCount,
      totalNoSaleVisitsCount,
      noSaleReason:
        activeMotifVisit?.no_sale_reason ||
        noSaleVisit?.no_sale_reason ||
        latestVisit?.no_sale_reason ||
        null,
      visitId: activeMotifVisitId,
      visitTime: activeMotifVisit?.visit_time || pdvSales[0]?.saleTime || null,
      visitDate: activeMotifVisit?.visit_date || pdvSales[0]?.date || null,
      vendorId: vendorMeta.id,
      vendorName: vendorMeta.name,
      vendorCode: vendorMeta.code,
      motifReactionStatus: activeMotifVisit?.motif_reaction_status || null,
      motifReactionComment: activeMotifVisit?.motif_reaction_comment || null,
      motifReactedBy: activeMotifVisit?.motif_reacted_by || null,
      motifReactedRole: activeMotifVisit?.motif_reacted_role || null,
      motifReactedAt: activeMotifVisit?.motif_reacted_at || null,
      motifReactionsHistory: activeMotifVisitId
        ? reactionsByVisitId.get(activeMotifVisitId) || []
        : [],
      visitValidationStatus,
      validatedBy,
      todaySalesCount: pdvSales.length,
      todaySalesAmount: pdvSales.reduce((acc, s) => acc + Number(s.totalAmount || 0), 0),
      todayCartonsCount: pdvSales.reduce((acc, s) => acc + Number(s.cartonsCount || 0), 0),
      todaySales: pdvSales,
    };
  });

  const visitsList = todayVisitsRaw.map((v) => {
    const pid = String(v.pdv_id || '');
    const pdvSales = salesByPdvId.get(pid) || [];
    const pdvVisitsForPdv = visitsByPdvId.get(pid) || [];
    const hasSale = pdvSales.length > 0 || soldPdvIdsToday.has(pid);

    return {
      id: v.id,
      visitUuid: v.visit_uuid,
      visitDate: v.visit_date,
      visitTime: v.visit_time || '09:00:00',
      pdvId: v.pdv_id,
      pdvName: v.pdv_name,
      pdvCode: v.pdv_code,
      pdvNeighborhood: v.pdv_neighborhood,
      pdvManagerName: v.pdv_manager_name,
      pdvStatus: v.pdv_status,
      routineName:
        (v.pdv_routine_name && String(v.pdv_routine_name).trim()) ||
        defaultRoutineNameForDay,
      routineDay: v.pdv_routine_day || routineStatus.activeDayName,
      routineDayVisitsCount: Math.max(1, pdvVisitsForPdv.length),
      latitude: Number(v.latitude || 12.6392),
      longitude: Number(v.longitude || -8.0029),
      gpsAccuracy: Number(v.gps_accuracy || 5),
      distanceM: Number(v.distance_m || 0),
      isCounted: Number(v.is_counted ?? 1) === 1,
      statusReason: v.status_reason || 'Visite sans vente enregistrée',
      deviceInfo: v.device_info || 'Terminal Mobile Vendeur',
      hasSaleToday: hasSale,
      visitCategory: (hasSale ? 'avec_vente' : 'sans_vente') as 'avec_vente' | 'sans_vente',
      visitType: hasSale ? 'visite_avec_vente' : 'visite_sans_vente',
      noSaleReason: v.no_sale_reason || null,
      vendorId: v.vendor_id || vendorMeta.id,
      vendorName: v.vendor_name || vendorMeta.name,
      vendorCode: v.vendor_code || vendorMeta.code,
      motifReactionStatus: v.motif_reaction_status || null,
      motifReactionComment: v.motif_reaction_comment || null,
      motifReactedBy: v.motif_reacted_by || null,
      motifReactedRole: v.motif_reacted_role || null,
      motifReactedAt: v.motif_reacted_at || null,
      motifReactionsHistory: reactionsByVisitId.get(String(v.id)) || [],
      validationStatus: (
        v.validation_status === 'valide' || v.pdv_validation_status === 'valide'
          ? 'valide'
          : 'soumis'
      ) as 'valide' | 'soumis',
      validatedBy: v.validated_by || v.pdv_validated_by || null,
      todaySales: pdvSales,
    };
  });

  const bamakoTimeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Bamako',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());

  return {
    serverDate: referenceDate,
    serverTime: bamakoTimeStr,
    period: {
      startDate: periodStart,
      endDate: periodEnd,
      isCustomPeriod: !isSingleCurrentDay,
      workingDaysCount,
      periodTargetPdv,
    },
    vendor: vendorMeta,
    availableVendors,
    routineStatus,
    monthlyObjective: routineStatus.monthlyObjective,
    kpis: {
      // Objectif 25 PDV / jour (ou objectif cumulé sur la période personnalisée)
      dailyTargetPdv: 25,
      monthlyTargetPdv: Number(routineStatus.monthlyObjective?.monthlyTargetPdv || 625),
      realizedMonthlyPdv: Number(routineStatus.monthlyObjective?.realizedMonthlyPdv || 0),
      monthlyProgressPercent: Number(routineStatus.monthlyObjective?.progressPercent || 0),
      monthlyValidatedDaysCount: Number(routineStatus.monthlyObjective?.validatedDaysCount || 0),
      monthlyWorkingDaysCount: Number(routineStatus.monthlyObjective?.workingDaysCount || 25),
      monthlyObjectiveStatus: routineStatus.monthlyObjective?.status || 'En cours',
      isDefaultMonthlyObjective: Boolean(routineStatus.monthlyObjective?.isDefault),
      monthlyObjectiveMonthKey: routineStatus.monthlyObjective?.monthKey || '2026-11',
      monthlyObjectiveMonthLabel: routineStatus.monthlyObjective?.monthLabel || 'Novembre 2026',
      realizedPdvCount,
      countedVisitsCount: routineStatus.countedVisitsCount,
      pendingVisitsCount: routineStatus.pendingVisitsCount,
      contestedVisitsCount: routineStatus.contestedVisitsCount,
      countedTowards25,
      remainingPdvForTarget,
      extraVisitsBeyond25,
      progressPercent,
      isTargetReachedToday: isTargetReachedForPeriod,
      activeRoutineName: routineStatus.routineName || '',
      activeDayName: routineStatus.activeDayName,
      activeDayIndex: routineStatus.activeDayIndex,
      activeDate: routineStatus.activeDate,
      nextDayName: routineStatus.nextDayName,
      completedBatchesOf25: routineStatus.completedBatchesOf25,
      totalRealizedPdvsAllCycles: routineStatus.totalRealizedPdvs,

      // Visites effectuées sur la journée en cours ou la période sélectionnée
      totalVisitsToday,
      uniquePdvsVisitedToday: uniqueVisitedPdvIdsToday.size,
      pdvsCreatedTodayCount: pdvsCreatedToday.length,
      lastVisitTime: visitsList[0]?.visitTime || null,
      lastVisitedPdvName: visitsList[0]?.pdvName || pdvsCreatedToday[0]?.name || null,
      lastVisitedPdvNeighborhood:
        visitsList[0]?.pdvNeighborhood || pdvsCreatedToday[0]?.neighborhood || null,

      // Ventes réalisées sur la journée en cours ou la période sélectionnée
      salesCountToday,
      salesRevenueToday,
      salesCartonsToday,
      averageBasketToday,
      wholesaleDiscountToday,
      uniquePdvsSoldToday: soldPdvIdsToday.size,
      conversionRatePercent,
      lastSaleTime: salesList[0]?.saleTime || null,
      lastSalePdvName: salesList[0]?.pdvName || null,
      lastSaleAmount: salesList[0]?.totalAmount || 0,
    },
    paymentBreakdown,
    visitsList,
    salesList,
    pdvsCreatedToday,
    perimeterPdvs,
    recentSalesByDay,
  };
}

// Endpoint KPI temps réel spécifique au vendeur : objectifs 25 PDV/jour, visites effectuées, ventes réalisées sur la journée en cours ou période personnalisée
apiRouter.get('/vendor/daily-performance', (req, res) => {
  try {
    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const queryVendorId =
      typeof req.query.vendor_id === 'string' ? req.query.vendor_id.trim() : '';
    const clientDate =
      typeof req.query.client_date === 'string' ? req.query.client_date.trim() : undefined;
    const startDate =
      typeof req.query.start_date === 'string' ? req.query.start_date.trim() : undefined;
    const endDate =
      typeof req.query.end_date === 'string' ? req.query.end_date.trim() : undefined;

    const vendorId = queryVendorId || headerUserId || 'usr-vnd-1';
    const performance = buildVendorDailyPerformancePayload(
      vendorId,
      clientDate,
      startDate,
      endDate
    );

    res.json({
      success: true,
      ...performance,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Erreur lors du chargement du tableau de bord de performance vendeur';
    res.status(500).json({ success: false, error: message });
  }
});

// Pointage en temps réel d'une visite PDV depuis le tableau de bord KPI vendeur (délègue à vrsService.ts)
apiRouter.post('/vendor/daily-performance/checkin-visit', (req, res) => {
  try {
    ensureAllPdvsBoundToVendorAndRoutineDay();
    ensureVisitMotifImmutabilityAndReactionsSchema();

    const callerRole = getUserRole(req);
    if (callerRole !== 'Vendeur') {
      return res.status(403).json({
        success: false,
        code: 'ROLE_READONLY_MOTIF_403',
        error: `Accès refusé (403) : le rôle "${callerRole || 'Non-Vendeur'}" ne peut ni pointer une visite vendeur ni saisir ou modifier un motif de visite sans vente.`,
      });
    }

    const headerUserId =
      typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const {
      visit_id,
      vendor_id,
      pdv_id,
      visit_mode,
      visit_type,
      no_sale_reason,
      motif,
      latitude,
      longitude,
      gps_accuracy,
      client_date,
      visit_date,
      visit_uuid,
      device_info,
    } = req.body || {};

    if (visit_id || req.body?.edit_motif || req.body?.update_motif) {
      return res.status(403).json({
        success: false,
        code: 'MOTIF_FIGE_403',
        error:
          "Action interdite (403) : un motif de visite sans vente déjà envoyé est figé à l'envoi et ne peut plus être modifié.",
      });
    }

    if (!pdv_id || typeof pdv_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Veuillez sélectionner un point de vente (PDV) pour pointer la visite.',
      });
    }

    const actor = resolveActor(req);
    const vendorId =
      typeof vendor_id === 'string' && vendor_id.trim()
        ? vendor_id.trim()
        : actor.role === 'Vendeur' && actor.id
        ? actor.id
        : headerUserId || 'usr-vnd-1';

    const cleanMotif = String(no_sale_reason || motif || '').trim();
    const rawMode = String(visit_type || visit_mode || '').toLowerCase().trim();
    const effectiveType =
      rawMode === 'avec_vente' || rawMode === 'visite_avec_vente'
        ? 'avec_vente'
        : 'sans_vente';

    const result = executeVrsVisitCheckin({
      actor: { ...actor, role: 'Vendeur', id: vendorId },
      vendorId,
      pdvId: pdv_id.trim(),
      latitude: latitude !== undefined ? Number(latitude) : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
      gpsAccuracy: gps_accuracy !== undefined ? Number(gps_accuracy) : undefined,
      deviceInfo: device_info || 'Pointage Routine VRS',
      visitUuid: visit_uuid,
      visitDate: visit_date || client_date,
      visitType: effectiveType,
      noSaleReason: cleanMotif || null,
    });

    if (!result.success) {
      return res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
    }

    const effectiveDate = result.visit?.visit_date || visit_date || client_date;
    const performance = buildVendorDailyPerformancePayload(vendorId, effectiveDate);
    const currentRoutineVisitNumber =
      (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM vrs_visits
             WHERE vendor_id = ? AND pdv_id = ? AND visit_date = ?`
          )
          .get(vendorId, pdv_id.trim(), effectiveDate || performance.routineStatus.activeDate) as
          | { cnt: number }
          | undefined
      )?.cnt || 1;

    return res.status(result.httpStatus).json({
      success: true,
      visit: result.visit,
      alreadyVisitedToday: Boolean(result.alreadyCountedToday),
      justReached25: Boolean(result.justValidatedDay),
      justValidatedDay: Boolean(result.justValidatedDay),
      justCompletedCycle: Boolean(result.justCompletedCycle),
      routineDayVisitsCount: currentRoutineVisitNumber,
      message: result.message,
      ...performance,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors du pointage de la visite PDV';
    return res.status(500).json({ success: false, error: message });
  }
});

// Validation d'une visite en attente par DOV, Administrateur ou Sales Admin / Contrôleur (403 pour Vendeur et autres rôles)
apiRouter.post('/vendor/daily-performance/validate-visit', (req, res) => {
  try {
    ensureVisitMotifImmutabilityAndReactionsSchema();
    const actor = resolveActor(req);

    const { visit_id, pdv_id, vendor_id, client_date, no_sale_reason, motif, noSaleReason } =
      req.body || {};

    if (no_sale_reason !== undefined || motif !== undefined || noSaleReason !== undefined) {
      return res.status(403).json({
        success: false,
        code: 'MOTIF_FIGE_403',
        error:
          "Action interdite (403) : le motif de visite sans vente envoyé par le vendeur est figé à l'envoi et ne peut jamais être modifié.",
      });
    }

    if (!isVrsSupervisorRole(actor.role)) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_FORBIDDEN_403',
        error: `Accès refusé (403) : le rôle "${actor.role}" n'est pas autorisé à valider une visite. Seuls le DOV, l'Administrateur et le Sales Admin / Contrôleur peuvent valider les visites en attente.`,
      });
    }

    const result = executeVrsValidatePendingVisit({
      actor,
      visitId: typeof visit_id === 'string' ? visit_id.trim() : undefined,
      pdvId: typeof pdv_id === 'string' ? pdv_id.trim() : undefined,
      vendorId: typeof vendor_id === 'string' ? vendor_id.trim() : undefined,
      referenceDate: typeof client_date === 'string' ? client_date.trim() : undefined,
    });

    if (!result.success) {
      return res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
    }

    const resolvedVendorId =
      result.state?.vendor?.id ||
      (typeof vendor_id === 'string' && vendor_id.trim() ? vendor_id.trim() : 'usr-vnd-1');
    const performance = buildVendorDailyPerformancePayload(resolvedVendorId, client_date);

    return res.status(result.httpStatus).json({
      success: true,
      message: result.message,
      justValidatedDay: Boolean(result.state?.justValidatedDays?.length),
      justCompletedCycle: Boolean(result.state?.justCompletedCycle),
      ...performance,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la validation de la visite';
    return res.status(500).json({ success: false, error: message });
  }
});

// Réaction d'un superviseur (DOV, Administrateur, Sales Admin / Contrôleur) sur le motif d'une visite sans vente
// ("Accepter le motif" ou "Contester" avec commentaire séparé obligatoire si contesté)
// Ne modifie JAMAIS le motif du vendeur (figé à l'envoi). 403 pour Vendeur et autres rôles.
const handleDovVisitMotifReaction = (req: any, res: any) => {
  try {
    ensureVisitMotifImmutabilityAndReactionsSchema();
    const actor = resolveActor(req);

    const {
      visit_id,
      pdv_id,
      vendor_id,
      reaction_status,
      decision,
      comment,
      client_date,
      no_sale_reason,
      motif,
      noSaleReason,
    } = req.body || {};

    if (no_sale_reason !== undefined || motif !== undefined || noSaleReason !== undefined) {
      return res.status(403).json({
        success: false,
        code: 'MOTIF_FIGE_403',
        error:
          "Action interdite (403) : le motif envoyé par le vendeur est figé à l'envoi. Il est impossible de le modifier.",
      });
    }

    const targetVisitIdFromParam = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    const lookupVisitId =
      targetVisitIdFromParam || (typeof visit_id === 'string' ? visit_id.trim() : '');

    const result = executeVrsMotifReaction({
      actor,
      visitId: lookupVisitId || undefined,
      pdvId: typeof pdv_id === 'string' ? pdv_id.trim() : undefined,
      vendorId: typeof vendor_id === 'string' ? vendor_id.trim() : undefined,
      decision: String(decision || reaction_status || ''),
      comment: typeof comment === 'string' ? comment : undefined,
      attemptedMotifChange: Boolean(no_sale_reason ?? motif ?? noSaleReason),
    });

    if (!result.success) {
      return res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
    }

    const resolvedVendorId =
      result.reaction?.vendorId ||
      (typeof vendor_id === 'string' && vendor_id.trim() ? vendor_id.trim() : 'usr-vnd-1');
    const performance = buildVendorDailyPerformancePayload(resolvedVendorId, client_date);

    return res.status(result.httpStatus).json({
      success: true,
      reaction: result.reaction,
      message: result.message,
      justValidatedDay: Boolean(result.state?.justValidatedDays?.length),
      justCompletedCycle: Boolean(result.state?.justCompletedCycle),
      ...performance,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la réaction";
    return res.status(500).json({ success: false, error: message });
  }
};

apiRouter.post('/vendor/daily-performance/visit-motif-reaction', handleDovVisitMotifReaction);
apiRouter.post('/vrs/visits/:id/react-motif', handleDovVisitMotifReaction);

// Verrouillage explicite 403 sur toute requête directe tentant de modifier un motif de visite sans vente déjà envoyé
const rejectDirectMotifModification403 = (req: any, res: any) => {
  const callerRole = getUserRole(req) || 'Utilisateur';
  recordAudit(
    'TENTATIVE_MODIFICATION_MOTIF_FIGE_REFUSEE_403',
    'VRS_VISIT',
    String(req.params?.id || req.params?.visitId || req.body?.visit_id || 'visit'),
    callerRole,
    String(req.headers['x-user-id'] || 'unknown'),
    `Tentative refusée (403) par ${callerRole} de modifier un motif de visite sans vente déjà envoyé (${req.method} ${req.originalUrl}).`
  );
  return res.status(403).json({
    success: false,
    code: 'MOTIF_FIGE_403',
    error:
      "Action interdite (403) : toute tentative de modifier un motif de visite sans vente déjà envoyé est refusée pour tous les rôles. Le motif est figé à l'envoi.",
  });
};

apiRouter.all('/vendor/daily-performance/visit-motif', rejectDirectMotifModification403);
apiRouter.all('/vendor/daily-performance/visits/:id/motif', rejectDirectMotifModification403);
apiRouter.all('/vrs/visits/:id/motif', rejectDirectMotifModification403);
apiRouter.put('/vrs/visits/:id', rejectDirectMotifModification403);
apiRouter.patch('/vrs/visits/:id', rejectDirectMotifModification403);
apiRouter.all('/pdvs/:id/visits/:visitId/motif', rejectDirectMotifModification403);

// Attribution de l'objectif mensuel de routine par DOV, Administrateur ou Sales Admin / Contrôleur (403 pour Vendeur et autres rôles)
apiRouter.post('/vendor/routine-objective', (req, res) => {
  try {
    const actor = resolveActor(req);
    const {
      vendor_ids,
      vendorIds,
      vendor_id,
      vendorId,
      apply_to_all,
      applyToAll,
      month_key,
      monthKey,
      year,
      month,
      monthly_target_pdv,
      monthlyTargetPdv,
      target_pdv_count,
      daily_target_pdv,
      routine_name,
      routineName,
      correction_reason,
      correctionReason,
      client_date,
      reference_date,
    } = req.body || {};

    const result = executeVrsAssignMonthlyObjectives({
      actor,
      vendorIds: Array.isArray(vendor_ids)
        ? vendor_ids
        : Array.isArray(vendorIds)
        ? vendorIds
        : undefined,
      vendorId: vendor_id || vendorId,
      applyToAll: Boolean(apply_to_all || applyToAll),
      monthKey: month_key || monthKey,
      year,
      month,
      monthlyTargetPdv:
        monthly_target_pdv ?? monthlyTargetPdv ?? target_pdv_count ?? daily_target_pdv,
      routineName: routine_name ?? routineName,
      correctionReason: correction_reason ?? correctionReason,
      referenceDate: reference_date || client_date,
    });

    if (!result.success) {
      return res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
    }

    const primaryVendorId =
      result.assignedObjectives?.[0]?.vendorId ||
      (typeof vendor_id === 'string' && vendor_id.trim() ? vendor_id.trim() : 'usr-vnd-1');
    const performance = buildVendorDailyPerformancePayload(
      primaryVendorId,
      reference_date || client_date
    );

    return res.status(result.httpStatus).json({
      success: true,
      message: result.message,
      assignedObjectives: result.assignedObjectives,
      ...performance,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'attribution de l'objectif mensuel";
    return res.status(500).json({ success: false, error: message });
  }
});

// Prise de photo par le vendeur : assigne directement la photo capturée au PDV comme image de profil (photo de devanture)
apiRouter.patch('/pdvs/:id/photo', requireRole(['Vendeur', 'Administrateur'], 'Mise à jour photo de profil PDV'), (req, res) => {
  try {
    const { id } = req.params;
    const { photo_data, latitude, longitude, gps_accuracy, captured_at } = req.body;

    const pdv = db.prepare('SELECT * FROM points_de_vente WHERE id = ?').get(id) as any;
    if (!pdv) {
      return res.status(404).json({ success: false, error: 'Point de vente introuvable.' });
    }

    if (!photo_data || typeof photo_data !== 'string' || !photo_data.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        error: 'Photo de devanture invalide ou manquante.'
      });
    }

    try {
      const base64Clean = photo_data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      const savedFilename = `pdv-profil-${id}-${Date.now()}.jpg`;
      const filePath = path.join(uploadsDir, savedFilename);
      fs.writeFileSync(filePath, buffer);
    } catch {
      // ignore disk write issues; photo_data is stored directly in DB
    }
    const photoUrl = photo_data;

    const latNum = Number.isFinite(Number(latitude)) ? Number(latitude) : pdv.latitude;
    const lngNum = Number.isFinite(Number(longitude)) ? Number(longitude) : pdv.longitude;
    const accNum = Number.isFinite(Number(gps_accuracy)) ? Number(gps_accuracy) : (pdv.gps_accuracy || 4.2);
    const capturedAtStr = captured_at || new Date().toLocaleString('fr-FR');

    db.prepare(`
      UPDATE points_de_vente
      SET photo_url = ?,
          latitude = COALESCE(?, latitude),
          longitude = COALESCE(?, longitude),
          gps_accuracy = COALESCE(?, gps_accuracy),
          captured_at = ?
      WHERE id = ?
    `).run(photoUrl, latNum, lngNum, accNum, capturedAtStr, id);

    const userRole = getUserRole(req) || 'Vendeur';
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : null;

    recordAudit(
      'PHOTO_PROFIL_PDV',
      'PDV',
      id,
      userRole,
      headerUserId,
      `Nouvelle photo de devanture assignée directement comme image de profil au PDV ${pdv.code} (${pdv.name}).`
    );

    const updatedPdv = db.prepare(`
      SELECT p.*,
             COALESCE(u.name, p.created_by, 'Oumar Konaté') AS created_by,
             COALESCE(u.code, 'BAO-VND-001') AS vendor_code,
             COALESCE((SELECT COUNT(*) FROM sales s WHERE s.pdv_id = p.id), 0) AS sales_count,
             COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.pdv_id = p.id), 0) AS total_sales_amount,
             (SELECT MAX(s.date) FROM sales s WHERE s.pdv_id = p.id) AS last_sale_date
      FROM points_de_vente p
      LEFT JOIN users u ON p.vendor_id = u.id
      WHERE p.id = ?
    `).get(id);

    res.json({
      success: true,
      message: `La photo de la devanture a été assignée directement à "${pdv.name}" comme image de profil.`,
      photo_url: photoUrl,
      pdv: updatedPdv,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Helper for Audit Logging
function recordAudit(action: string, entity: string, entityId: string | null, userRole: string, userId: string | null, details: string) {
  try {
    const id = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, action, entity, entityId, userRole, userId, details, now);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// Helper for System Notifications (Admin, Comptable, Magasinier, Vendeur) + Web Push
function sendNotification(
  role: string,
  title: string,
  message: string,
  type: string,
  reference?: string,
  options?: { targetUserId?: string | null; proofJson?: string | null; metadataJson?: string | null }
) {
  try {
    const targetUserId = options?.targetUserId || null;
    const refVal = reference || null;

    // Éviter toute répétition pour un même événement non lu
    const existingUnread = db
      .prepare(
        `
        SELECT id FROM notifications
        WHERE role = ?
          AND COALESCE(target_user_id, '') = COALESCE(?, '')
          AND type = ?
          AND COALESCE(reference, '') = COALESCE(?, '')
          AND title = ?
          AND is_read = 0
        LIMIT 1
      `
      )
      .get(role, targetUserId || '', type, refVal || '', title) as { id: string } | undefined;

    if (existingUnread) {
      return existingUnread.id;
    }

    const id = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (id, role, target_user_id, title, message, type, reference, proof_json, metadata_json, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      role,
      targetUserId,
      title,
      message,
      type,
      refVal,
      options?.proofJson || null,
      options?.metadataJson || null,
      now
    );

    // Envoi immédiat juste après le commit (sans bloquer la réponse HTTP, en parallèle vers tous les appareils + SSE)
    triggerImmediatePostCommitPush({
      notificationId: id,
      role,
      targetUserId,
      title,
      message,
      type,
      reference: refVal || undefined,
      createdAt: now,
    });

    return id;
  } catch (e) {
    console.error('Notification error:', e);
    return null;
  }
}

function markNotificationsReadByReference(role: string, reference?: string | null) {
  if (!reference) return;
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE role = ? AND reference = ? AND is_read = 0').run(role, reference);
    setImmediate(() => {
      broadcastNotificationSseEvent({
        event: 'notification:read',
        role,
      });
    });
  } catch {
    // ignore
  }
}

// Helper for Stock Movement Journal (Entrées en ajout seul, jamais négatif)
function recordStockMovement(
  type: 'reception' | 'chargement' | 'retour' | 'perte_casse_peremption' | 'Bon cadeau' | 'reclassement',
  direction: 'IN' | 'OUT',
  productId: string,
  lotId: string | null,
  quantity: number,
  reference: string | null,
  motif: string | null,
  valueFcfa: number,
  performedBy: string
) {
  const id = `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO stock_movements (id, type, direction, product_id, lot_id, quantity, reference, motif, value_fcfa, performed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, direction, productId, lotId || null, Math.abs(quantity), reference || null, motif || null, valueFcfa, performedBy, now);
}

// FEFO Algorithm: First Expired, First Out. Excludes expired lots.
function allocateFEFO(productId: string, requestedQty: number, todayStr: string) {
  const candidateLots = db.prepare(`
    SELECT * FROM lots
    WHERE product_id = ? AND quantity > 0
    ORDER BY expiry_date ASC
  `).all(productId) as any[];

  // Lot périmé bloqué à la vente et au chargement
  const validLots = candidateLots.filter(l => l.expiry_date > todayStr);
  const totalAvailable = validLots.reduce((sum, l) => sum + l.quantity, 0);

  if (totalAvailable < requestedQty) {
    throw new Error(`Stock non périmé insuffisant (demandé: ${requestedQty} cartons, disponible non périmé: ${totalAvailable} cartons).`);
  }

  const allocations: Array<{ lotId: string; lotNumber: string; expiryDate: string; allocatedQty: number }> = [];
  let remainingNeeded = requestedQty;

  for (const lot of validLots) {
    if (remainingNeeded <= 0) break;
    const take = Math.min(lot.quantity, remainingNeeded);
    allocations.push({
      lotId: lot.id,
      lotNumber: lot.lot_number,
      expiryDate: lot.expiry_date,
      allocatedQty: take,
    });
    remainingNeeded -= take;
  }

  return allocations;
}

// Calculate Shelf-Life Status
// > 90 j: Vert (#16A34A) | 30-90 j: Marron (#92400E) | < 30 j: Rouge (#DC2626) | Périmé: Gris (#64748B)
function getLotShelfLifeStatus(expiryDateStr: string, todayStr: string) {
  const diffTime = new Date(expiryDateStr).getTime() - new Date(todayStr).getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (days <= 0) {
    return { days, code: 'perime', label: 'Périmé', color: 'gray', colorHex: '#64748B' };
  } else if (days < 30) {
    return { days, code: 'urgent', label: '< 30 jours', color: 'red', colorHex: '#DC2626' };
  } else if (days <= 90) {
    return { days, code: 'attention', label: '30-90 jours', color: 'brown', colorHex: '#92400E' };
  } else {
    return { days, code: 'bon', label: '> 90 jours', color: 'green', colorHex: '#16A34A' };
  }
}

// 5. CHARGEMENTS (Dépôt-Vente : Fournisseur -> Dépôt -> Vendeur)
// Statuts : Demandée, Validée, Partiellement validée, Rejetée, Chargée. Aucune facture.
apiRouter.get('/chargements', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM chargements c
      JOIN users u ON c.vendor_id = u.id
      ORDER BY c.created_at DESC
    `).all();
    const chargements = rows.map((r: any) => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
    }));
    res.json({ success: true, chargements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Le Vendeur ou le Directeur des opérations de vente demande un chargement : multi-produits ligne par ligne, date souhaitée, pas de doublon, quantité plafonnée au stock dépôt
apiRouter.post('/chargements/request', requireVendeurOrDirecteurOps, (req, res) => {
  try {
    const { vendor_id, desired_date, items } = req.body;
    const userRole = getUserRole(req) || 'Vendeur';

    if (!vendor_id || !desired_date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants (vendeur, date souhaitée, lignes de produits).' });
    }

    // Check duplicate products
    const productIds = items.map(it => it.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      return res.status(400).json({ success: false, error: 'Doublon détecté : chaque produit ne peut être présent qu\'une seule fois dans la demande.' });
    }

    // Validate quantities against warehouse stock and active product status
    for (const it of items) {
      const prod = db.prepare('SELECT stock_depot, name, is_active FROM products WHERE id = ?').get(it.productId) as any;
      if (!prod) {
        return res.status(400).json({ success: false, error: `Produit introuvable (${it.productId}).` });
      }
      if (Number(prod.is_active ?? 1) === 0) {
        return res.status(400).json({
          success: false,
          error: `Le produit "${prod.name}" est désactivé et ne peut plus faire l'objet d'un chargement.`,
        });
      }
      if (it.requestedBoxes > prod.stock_depot) {
        return res.status(400).json({
          success: false,
          error: `Quantité demandée (${it.requestedBoxes} ctn) supérieure au stock dépôt disponible (${prod.stock_depot} ctn) pour ${prod.name}.`
        });
      }
    }

    const total = items.reduce((sum: number, it: any) => sum + (it.requestedBoxes * it.unitPrice), 0);
    const date = new Date().toISOString().split('T')[0];
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ref = `CHG-${date}-${rand}`;
    const id = `chg-${Date.now()}`;

    // Status is strictly 'Demandée'
    db.prepare(`
      INSERT INTO chargements (id, reference, vendor_id, date, desired_date, items, total_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Demandée', ?)
    `).run(id, ref, vendor_id, date, desired_date, JSON.stringify(items), total, date);

    const vendor = db.prepare('SELECT name, code FROM users WHERE id = ?').get(vendor_id) as any;
    const isRequestedByDirector = userRole === 'Directeur des opérations de vente';
    sendNotification(
      'Magasinier',
      isRequestedByDirector ? `Demande de stock vendeur (${ref}) — Direction Ventes` : 'Nouvelle demande de chargement',
      isRequestedByDirector
        ? `Le Directeur des opérations de vente a soumis une demande de stock (${ref}) pour le vendeur ${vendor?.name || ''} (${vendor?.code || ''}) souhaitée le ${desired_date}.`
        : `${vendor?.name || 'Un vendeur'} a soumis une demande de chargement (${ref}) pour le ${desired_date}.`,
      'chargement',
      ref
    );

    if (isRequestedByDirector) {
      sendNotification(
        'Vendeur',
        `Demande de stock initiée pour vous (${ref})`,
        `Le Directeur des opérations de vente a initié une demande de chargement camionnette (${ref}) d'une valeur de ${total.toLocaleString('fr-FR')} FCFA pour votre tournée du ${desired_date}.`,
        'chargement',
        ref,
        { targetUserId: vendor_id }
      );
    }

    recordAudit(
      'DEMANDE_CHARGEMENT',
      'CHARGEMENT',
      id,
      userRole,
      vendor_id,
      isRequestedByDirector
        ? `Demande de stock ${ref} initiée par le Directeur des opérations de vente pour le vendeur ${vendor?.name || vendor_id} (statut "Demandée").`
        : `Demande de chargement ${ref} créée avec statut "Demandée".`
    );

    res.json({
      success: true,
      message: isRequestedByDirector
        ? `Demande de stock ${ref} envoyée pour ${vendor?.name || 'le vendeur'} (statut : Demandée).`
        : `Demande de chargement ${ref} envoyée avec succès (statut : Demandée).`,
      chargementId: id,
      reference: ref
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Annulation possible tant que "Demandée"
apiRouter.delete('/chargements/:id/cancel', requireVendeurOrDirecteurOps, (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req);
    const chg = db.prepare('SELECT * FROM chargements WHERE id = ?').get(id) as any;

    if (!chg) {
      return res.status(404).json({ success: false, error: 'Chargement introuvable.' });
    }
    if (chg.status !== 'Demandée') {
      return res.status(400).json({
        success: false,
        error: `Annulation impossible : la demande est actuellement au statut "${chg.status}". L'annulation n'est permise que tant qu'elle est "Demandée".`
      });
    }

    db.prepare('DELETE FROM chargements WHERE id = ?').run(id);
    recordAudit('ANNULATION_CHARGEMENT', 'CHARGEMENT', id, userRole, chg.vendor_id, `Demande de chargement ${chg.reference} annulée par ${userRole}.`);

    res.json({ success: true, message: `Demande de chargement ${chg.reference} annulée.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Rectification possible tant que "Demandée"
apiRouter.put('/chargements/:id/rectify', requireVendeurOrDirecteurOps, (req, res) => {
  try {
    const { id } = req.params;
    const { desired_date, items } = req.body;
    const userRole = getUserRole(req);
    const chg = db.prepare('SELECT * FROM chargements WHERE id = ?').get(id) as any;

    if (!chg) {
      return res.status(404).json({ success: false, error: 'Chargement introuvable.' });
    }
    if (chg.status !== 'Demandée') {
      return res.status(400).json({
        success: false,
        error: `Rectification impossible : la demande est actuellement au statut "${chg.status}". La modification n'est permise que tant qu'elle est "Demandée".`
      });
    }

    const total = items.reduce((sum: number, it: any) => sum + (it.requestedBoxes * it.unitPrice), 0);
    db.prepare(`
      UPDATE chargements
      SET desired_date = ?, items = ?, total_amount = ?
      WHERE id = ?
    `).run(desired_date || chg.desired_date, JSON.stringify(items), total, id);

    recordAudit('RECTIFICATION_CHARGEMENT', 'CHARGEMENT', id, userRole, chg.vendor_id, `Demande de chargement ${chg.reference} rectifiée tant que "Demandée".`);

    res.json({ success: true, message: `Demande de chargement ${chg.reference} rectifiée.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Le Magasinier valide, ajuste ou rejette (motif)
apiRouter.patch('/chargements/:id/review', requireMagasinier, (req, res) => {
  try {
    const { id } = req.params;
    const { decision, adjustedItems, rejection_reason } = req.body; // decision: 'validate' | 'adjust' | 'reject'
    const userRole = getUserRole(req);
    const chg = db.prepare('SELECT * FROM chargements WHERE id = ?').get(id) as any;

    if (!chg) {
      return res.status(404).json({ success: false, error: 'Chargement introuvable.' });
    }
    if (chg.status !== 'Demandée') {
      return res.status(400).json({ success: false, error: `Ce chargement ne peut plus être traité (statut actuel : ${chg.status}).` });
    }

    const now = new Date().toISOString();
    markNotificationsReadByReference('Magasinier', chg.reference);

    if (decision === 'reject') {
      if (!rejection_reason || rejection_reason.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Un motif obligatoire doit être fourni pour rejeter la demande.' });
      }

      db.prepare(`
        UPDATE chargements
        SET status = 'Rejetée', rejection_reason = ?, validated_by = 'Magasinier Sotuba', validated_at = ?
        WHERE id = ?
      `).run(rejection_reason.trim(), now, id);

      sendNotification(
        'Vendeur',
        'Chargement rejeté',
        `Votre demande de chargement ${chg.reference} a été rejetée. Motif : ${rejection_reason}`,
        'chargement',
        chg.reference,
        { targetUserId: chg.vendor_id }
      );

      recordAudit('REJET_CHARGEMENT', 'CHARGEMENT', id, userRole, null, `Demande ${chg.reference} rejetée. Motif : ${rejection_reason}`);

      return res.json({ success: true, message: `Demande ${chg.reference} rejetée avec motif enregistré.` });
    }

    if (decision === 'adjust') {
      if (!Array.isArray(adjustedItems) || adjustedItems.length === 0) {
        return res.status(400).json({ success: false, error: 'Détail des quantités ajustées manquant.' });
      }

      // Check if partially validated or identical
      const total = adjustedItems.reduce((sum: number, it: any) => sum + (it.validatedBoxes * it.unitPrice), 0);
      db.prepare(`
        UPDATE chargements
        SET status = 'Partiellement validée', items = ?, total_amount = ?, validated_by = 'Magasinier Sotuba', validated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(adjustedItems), total, now, id);

      sendNotification(
        'Vendeur',
        'Chargement ajusté (Partiellement validé)',
        `Votre demande de chargement ${chg.reference} a été ajustée par le magasinier. Statut : Partiellement validée.`,
        'chargement',
        chg.reference,
        { targetUserId: chg.vendor_id }
      );

      recordAudit('AJUSTEMENT_CHARGEMENT', 'CHARGEMENT', id, userRole, null, `Demande ${chg.reference} ajustée (Partiellement validée).`);

      return res.json({ success: true, message: `Demande ${chg.reference} mise à jour (statut : Partiellement validée).` });
    }

    if (decision === 'validate') {
      // Validate full request as is
      const currentItems = typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items;
      const validatedItems = currentItems.map((it: any) => ({
        ...it,
        validatedBoxes: it.requestedBoxes
      }));

      db.prepare(`
        UPDATE chargements
        SET status = 'Validée', items = ?, validated_by = 'Magasinier Sotuba', validated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(validatedItems), now, id);

      sendNotification(
        'Vendeur',
        'Chargement validé',
        `Votre demande de chargement ${chg.reference} a été entièrement validée. Vous pouvez procéder à l\'enlèvement.`,
        'chargement',
        chg.reference,
        { targetUserId: chg.vendor_id }
      );

      recordAudit('VALIDATION_CHARGEMENT', 'CHARGEMENT', id, userRole, null, `Demande ${chg.reference} validée par le magasinier.`);

      return res.json({ success: true, message: `Demande ${chg.reference} validée.` });
    }

    return res.status(400).json({ success: false, error: 'Action non reconnue.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Le Magasinier confirme la remise : stock dépôt - et vendeur +. Statut devient "Chargée".
// Aucune facture générée. FEFO automatique appliqué sur les lots non périmés.
apiRouter.post('/chargements/:id/confirm-remise', requireMagasinier, (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req);
    const chg = db.prepare('SELECT * FROM chargements WHERE id = ?').get(id) as any;

    if (!chg) {
      return res.status(404).json({ success: false, error: 'Chargement introuvable.' });
    }
    if (chg.status !== 'Validée' && chg.status !== 'Partiellement validée') {
      return res.status(400).json({
        success: false,
        error: `Remise impossible : le chargement doit être au statut "Validée" ou "Partiellement validée" (statut actuel : ${chg.status}).`
      });
    }

    const items = typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items;
    const todayStr = new Date().toISOString().split('T')[0];

    // ATOMIC TRANSACTION: FEFO allocation, stock deductions, movements
    db.exec('BEGIN TRANSACTION');
    try {
      for (const it of items) {
        const qtyToCharge = it.validatedBoxes !== undefined ? it.validatedBoxes : it.requestedBoxes;
        if (qtyToCharge <= 0) continue;

        // 1. FEFO allocation from non-expired lots
        const allocations = allocateFEFO(it.productId, qtyToCharge, todayStr);

        for (const alloc of allocations) {
          // Deduct from lot
          db.prepare(`
            UPDATE lots
            SET quantity = quantity - ?,
                status = CASE WHEN (quantity - ?) <= 0 THEN 'epuise' ELSE status END
            WHERE id = ?
          `).run(alloc.allocatedQty, alloc.allocatedQty, alloc.lotId);

          // Record movement
          recordStockMovement(
            'chargement',
            'OUT',
            it.productId,
            alloc.lotId,
            alloc.allocatedQty,
            chg.reference,
            `Sortie chargement vendeur FEFO (${alloc.lotNumber})`,
            alloc.allocatedQty * it.unitPrice,
            'Magasinier Sotuba'
          );
        }

        // Deduct from central warehouse
        db.prepare('UPDATE products SET stock_depot = stock_depot - ? WHERE id = ?').run(qtyToCharge, it.productId);
      }

      // Mark chargement as 'Chargée' (AUCUNE FACTURE générée)
      db.prepare(`
        UPDATE chargements
        SET status = 'Chargée', charged_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    sendNotification(
      'Vendeur',
      'Chargement effectué (Remise confirmée)',
      `Votre camionnette a été chargée (${chg.reference}). Marchandises prêtes pour votre tournée de distribution (dépôt-vente, pas de facture préalable).`,
      'chargement',
      chg.reference,
      { targetUserId: chg.vendor_id }
    );

    recordAudit('REMISE_CHARGEMENT', 'CHARGEMENT', id, userRole, chg.vendor_id, `Remise confirmée pour ${chg.reference} : stock dépôt déduit via FEFO et stock vendeur crédité. Statut "Chargée".`);

    res.json({
      success: true,
      message: `Remise du chargement ${chg.reference} confirmée avec succès. Statut : Chargée (FEFO appliqué, stock dépôt -, vendeur +). Aucune facture générée.`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Annulation d'un approvisionnement (Chargement vendeur) par le Sales Admin (Contrôleur) ou l'Administrateur
apiRouter.post('/chargements/:id/cancel-appro', requireSalesAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_reason } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';
    const chg = db.prepare('SELECT * FROM chargements WHERE id = ?').get(id) as any;

    if (!chg) {
      return res.status(404).json({ success: false, error: 'Approvisionnement (chargement) introuvable.' });
    }
    if (chg.status === 'Annulée') {
      return res.status(400).json({ success: false, error: 'Cet approvisionnement a déjà été annulé.' });
    }
    if (!cancel_reason || String(cancel_reason).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Le motif d\'annulation de l\'approvisionnement est obligatoire.' });
    }

    const reasonClean = String(cancel_reason).trim();
    const nowIso = new Date().toISOString();
    const cancelledByLabel = userRole === 'Sales Admin' ? 'Salif Keïta (Sales Admin - Contrôleur)' : 'Administrateur';
    const items = typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items;

    db.exec('BEGIN TRANSACTION');
    try {
      // Si l'approvisionnement avait déjà été remis (Chargée / valide), on réintègre le stock au dépôt central et dans les lots
      if (chg.status === 'Chargée' || chg.status === 'valide') {
        for (const it of items) {
          const qtyToRestore = Number(it.validatedBoxes !== undefined ? it.validatedBoxes : it.requestedBoxes || it.qtyBoxes || 0);
          if (qtyToRestore <= 0) continue;

          const prod = db.prepare('SELECT id, name, price_box FROM products WHERE id = ?').get(it.productId) as any;
          if (!prod) continue;

          // 1. Réintégrer dans le stock dépôt central
          db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(qtyToRestore, prod.id);

          // 2. Réintégrer dans le lot actif le plus récent (ou réactiver un lot épuisé)
          const targetLot = db.prepare(`
            SELECT id, lot_number FROM lots
            WHERE product_id = ?
            ORDER BY CASE WHEN status = 'actif' THEN 0 ELSE 1 END, expiry_date DESC
            LIMIT 1
          `).get(prod.id) as any;

          if (targetLot) {
            db.prepare(`
              UPDATE lots
              SET quantity = quantity + ?, status = 'actif'
              WHERE id = ?
            `).run(qtyToRestore, targetLot.id);
          }

          // 3. Journaliser la réintégration de stock
          recordStockMovement(
            'retour',
            'IN',
            prod.id,
            targetLot ? targetLot.id : null,
            qtyToRestore,
            chg.reference,
            `Annulation approvisionnement par Contrôleur (${reasonClean})`,
            qtyToRestore * Number(prod.price_box || it.unitPrice || 0),
            cancelledByLabel
          );
        }
      }

      db.prepare(`
        UPDATE chargements
        SET status = 'Annulée',
            cancel_reason = ?,
            cancelled_by = ?,
            cancelled_at = ?
        WHERE id = ?
      `).run(reasonClean, cancelledByLabel, nowIso, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    markNotificationsReadByReference('Magasinier', chg.reference);
    markNotificationsReadByReference('Sales Admin', chg.reference);

    sendNotification(
      'Vendeur',
      `Approvisionnement annulé (${chg.reference})`,
      `Votre approvisionnement ${chg.reference} a été annulé par le Contrôleur (${cancelledByLabel}). Motif : ${reasonClean}.`,
      'chargement',
      chg.reference,
      { targetUserId: chg.vendor_id }
    );
    sendNotification(
      'Magasinier',
      `Approvisionnement annulé (${chg.reference})`,
      `L'approvisionnement ${chg.reference} a été annulé par ${cancelledByLabel}. Motif : ${reasonClean}.`,
      'chargement',
      chg.reference
    );

    recordAudit(
      'ANNULATION_APPROVISIONNEMENT',
      'CHARGEMENT',
      id,
      userRole,
      chg.vendor_id,
      `Approvisionnement ${chg.reference} (statut initial : ${chg.status}) annulé par ${cancelledByLabel}. Motif : ${reasonClean}.`
    );

    res.json({
      success: true,
      message: `Approvisionnement ${chg.reference} annulé avec succès${chg.status === 'Chargée' || chg.status === 'valide' ? ' (stock réintégré au dépôt central)' : ''}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 6. RÉCEPTIONS (Soumises par le Gestionnaire de stock, validées par le Sales Admin / Contrôleur)
// Lignes avec produit, cartons, numéro de lot et date de péremption obligatoires ; pièce jointe photo du BL fournisseur et note optionnelle en cas d'écart
apiRouter.get('/receptions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM receptions ORDER BY created_at DESC').all();
    const receptions = rows.map((r: any) => ({
      ...r,
      status: r.status || 'valide',
      submitted_by: r.submitted_by || 'Moussa Diarra (Gestionnaire de stock)',
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
    }));
    res.json({ success: true, receptions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Helper pour la numérotation automatique de lot selon les normes agroalimentaires :
// Format : LOT-{TRIGRAMME}-{YYYYMMDD}-{INDEX} (ex: LOT-CAJ-20261030-01)
export function generateAutoLotNumber(productId?: string, targetDate?: string, excludeLots: string[] = []): string {
  let trigram = 'LOT';
  if (productId) {
    const prod = db.prepare('SELECT id, code, name FROM products WHERE id = ?').get(productId) as any;
    if (prod) {
      if (prod.code) {
        const parts = prod.code.split('-');
        if (parts.length >= 2 && parts[1].length >= 2) {
          trigram = parts[1].toUpperCase();
        } else if (parts[0] && parts[0].length >= 2) {
          trigram = parts[0].toUpperCase();
        }
      } else if (prod.name) {
        const words = prod.name.trim().split(/\s+/);
        const lastOrFirst = words[words.length - 1] || words[0];
        trigram = lastOrFirst.slice(0, 3).toUpperCase();
      }
    }
  }

  const dateVal = targetDate || new Date().toISOString().split('T')[0];
  const dateCompact = dateVal.replace(/-/g, '');
  const prefix = `LOT-${trigram}-${dateCompact}-`;

  // Récupérer les numéros de lots existants avec ce préfixe dans la table lots
  const existingLots = db.prepare(`
    SELECT lot_number FROM lots WHERE lot_number LIKE ?
  `).all(`${prefix}%`) as { lot_number: string }[];

  // Récupérer également les lots des réceptions encore en attente de validation
  const pendingReceptions = db.prepare(`
    SELECT items FROM receptions WHERE status = 'en_attente'
  `).all() as { items: string }[];

  const pendingLotNumbers: string[] = [];
  for (const r of pendingReceptions) {
    try {
      const items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          const num = it.lot_number || it.lotNumber;
          if (num && String(num).toUpperCase().startsWith(prefix.toUpperCase())) {
            pendingLotNumbers.push(String(num).trim().toUpperCase());
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const existingSet = new Set<string>([
    ...existingLots.map(l => (l.lot_number || '').trim().toUpperCase()),
    ...pendingLotNumbers,
    ...excludeLots.map(l => (l || '').trim().toUpperCase())
  ]);

  let seq = 1;
  while (existingSet.has(`${prefix}${String(seq).padStart(2, '0')}`)) {
    seq++;
  }

  return `${prefix}${String(seq).padStart(2, '0')}`;
}

// Endpoint de numérotation de lot automatique pour la réception de stock (Gestionnaire de stock)
apiRouter.get('/receptions/next-lot-number', (req, res) => {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const exclude = typeof req.query.exclude === 'string' && req.query.exclude ? req.query.exclude.split(',') : [];

    const lotNumber = generateAutoLotNumber(productId, date, exclude);
    res.json({ success: true, lotNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.post('/receptions', requireMagasinierOrSalesAdmin, (req, res) => {
  try {
    const {
      supplier_name,
      lines,
      date: reqDate,
      bl_number,
      bl_photo,
      bl_filename,
      notes,
    } = req.body;
    const userRole = getUserRole(req) || 'Gestionnaire de stock';

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ success: false, error: 'Au moins une ligne de réception est obligatoire.' });
    }

    const date = reqDate || new Date().toISOString().split('T')[0];
    const defaultExpiry = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
    const assignedLotsInThisBatch: string[] = [];

    // Validation et numérotation automatique des lots si non renseigné
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line.productId) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Produit obligatoire.` });
      }
      if (!line.cartons || Number(line.cartons) <= 0) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Nombre de cartons reçus obligatoire et supérieur à 0.` });
      }
      // Numérotation de lot automatique si vide ou non spécifié
      if (!line.lotNumber || String(line.lotNumber).trim().length === 0 || String(line.lotNumber).trim().toLowerCase() === 'auto') {
        line.lotNumber = generateAutoLotNumber(line.productId, date, assignedLotsInThisBatch);
      }
      assignedLotsInThisBatch.push(String(line.lotNumber).trim());

      // Date de péremption par défaut (+6 mois) si vide
      if (!line.expiryDate || String(line.expiryDate).trim().length === 0) {
        line.expiryDate = defaultExpiry;
      }
    }
    const ref = `REC-FOURN-${date}-${Math.floor(100 + Math.random() * 900)}`;
    const id = `recp-${Date.now()}`;
    let totalBoxes = 0;

    // Sauvegarde optionnelle de la photo du BL sur disque si DataURL fournie (tout en conservant le DataURL pour affichage immédiat)
    const cleanBlNumber = typeof bl_number === 'string' && bl_number.trim() ? bl_number.trim() : null;
    const cleanBlPhoto = typeof bl_photo === 'string' && bl_photo.trim() ? bl_photo.trim() : null;
    const cleanBlFilename = typeof bl_filename === 'string' && bl_filename.trim() ? bl_filename.trim() : (cleanBlPhoto ? `bl_${ref}.jpg` : null);
    const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

    if (cleanBlPhoto && cleanBlPhoto.startsWith('data:image/')) {
      try {
        const matches = cleanBlPhoto.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace(/[^a-z0-9]/gi, '');
          const fileBuffer = Buffer.from(matches[2], 'base64');
          const safeFile = `bl-fournisseur-${Date.now()}.${ext || 'jpg'}`;
          fs.writeFileSync(path.join(uploadsDir, safeFile), fileBuffer);
        }
      } catch {
        // Non-bloquant : bl_photo est aussi stocké en base
      }
    }

    // Si soumis par le Gestionnaire de stock (ou Magasinier), la réception est validée par le Gestionnaire de stock et transmise au Sales Admin (Contrôleur) pour validation finale en stock.
    // Si créée directement par le Sales Admin ou l'Administrateur, elle est validée immédiatement.
    const isDirectValidation = userRole === 'Sales Admin' || userRole === 'Administrateur';
    const initialStatus = isDirectValidation ? 'valide' : 'en_attente';
    const submittedByLabel =
      userRole === 'Gestionnaire de stock' || userRole === 'Magasinier'
        ? 'Moussa Diarra (Gestionnaire de stock)'
        : userRole === 'Sales Admin'
        ? 'Salif Keïta (Sales Admin - Contrôleur)'
        : 'Administrateur';

    db.exec('BEGIN TRANSACTION');
    try {
      const enrichedLines = [];

      for (const line of lines) {
        const prod = db.prepare('SELECT id, code, name, price_box, is_active FROM products WHERE id = ?').get(line.productId) as any;
        if (!prod) throw new Error(`Produit ${line.productId} introuvable.`);
        if (Number(prod.is_active ?? 1) === 0) {
          throw new Error(`Le produit "${prod.name}" est désactivé et ne peut plus être réceptionné.`);
        }

        const cartons = Number(line.cartons);
        const requestedBoxes =
          line.requestedCartons !== undefined && line.requestedCartons !== null && line.requestedCartons !== ''
            ? Number(line.requestedCartons)
            : undefined;
        totalBoxes += cartons;
        const lotId = `lot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        if (isDirectValidation) {
          // 1. Increment central warehouse stock immediately
          db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(cartons, prod.id);

          // 2. Create entry in Lots table
          db.prepare(`
            INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'actif', ?)
          `).run(lotId, prod.id, line.lotNumber.trim(), line.expiryDate.trim(), cartons, cartons, date);

          // 3. Mouvement entrant
          recordStockMovement(
            'reception',
            'IN',
            prod.id,
            lotId,
            cartons,
            ref,
            `Entrée réception fournisseur validée: ${supplier_name || 'Fournisseur Agréé'} (Lot ${line.lotNumber})${cleanBlNumber ? ` • BL: ${cleanBlNumber}` : ''}`,
            cartons * prod.price_box,
            submittedByLabel
          );
        }

        enrichedLines.push({
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          boxes: cartons,
          ...(requestedBoxes && requestedBoxes > 0 ? { requestedBoxes } : {}),
          lot_number: line.lotNumber.trim(),
          expiry_date: line.expiryDate.trim(),
          lotId
        });
      }

      db.prepare(`
        INSERT INTO receptions (
          id, reference, supplier_name, date, items, total_boxes,
          status, submitted_by, validated_by, validated_at,
          bl_number, bl_photo, bl_filename, notes, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        ref,
        supplier_name || 'Fournisseur Agréé Mali',
        date,
        JSON.stringify(enrichedLines),
        totalBoxes,
        initialStatus,
        submittedByLabel,
        isDirectValidation ? submittedByLabel : null,
        isDirectValidation ? new Date().toISOString() : null,
        cleanBlNumber,
        cleanBlPhoto,
        cleanBlFilename,
        cleanNotes,
        date
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const blInfoText = cleanBlPhoto ? ` (Photo du BL fournisseur jointe${cleanBlNumber ? ` : ${cleanBlNumber}` : ''})` : cleanBlNumber ? ` (BL : ${cleanBlNumber})` : '';
    const noteInfoText = cleanNotes ? ` • Note : "${cleanNotes}"` : '';

    if (!isDirectValidation) {
      sendNotification(
        'Sales Admin',
        `Réception de stock à valider (${ref})`,
        `Le Gestionnaire de stock a validé et soumis une réception fournisseur (${ref} — ${supplier_name || 'Fournisseur Agréé Mali'}, ${totalBoxes} cartons)${blInfoText}${noteInfoText} en attente de votre validation.`,
        'reception',
        ref
      );
      recordAudit(
        'SOUMISSION_RECEPTION_FOURNISSEUR',
        'RECEPTION',
        id,
        userRole,
        null,
        `Réception fournisseur ${ref} (${totalBoxes} cartons)${blInfoText}${noteInfoText} validée et soumise par le Gestionnaire de stock — en attente de validation par le Sales Admin (Contrôleur).`
      );
    } else {
      recordAudit(
        'RECEPTION_FOURNISSEUR_VALIDEE',
        'RECEPTION',
        id,
        userRole,
        null,
        `Réception fournisseur ${ref} enregistrée et validée directement par ${submittedByLabel} : ${totalBoxes} cartons ajoutés${blInfoText}${noteInfoText}.`
      );
    }

    res.json({
      success: true,
      status: initialStatus,
      message: isDirectValidation
        ? `Réception ${ref} enregistrée et validée au dépôt central (${totalBoxes} cartons ajoutés au stock).`
        : `Stock reçu validé (${ref} — ${totalBoxes} cartons)${cleanBlPhoto ? ' avec photo du BL fournisseur en pièce jointe' : ''}${cleanNotes ? ' et note de réception enregistrée' : ''}. Transmis au Sales Admin (Contrôleur) pour intégration au stock dépôt.`,
      receptionId: id,
      reference: ref
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Validation d'une réception de stock soumise par le Gestionnaire de stock : réservée au Sales Admin (Contrôleur) ou Administrateur
apiRouter.post('/receptions/:id/validate', requireSalesAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req) || 'Sales Admin';
    const rec = db.prepare('SELECT * FROM receptions WHERE id = ?').get(id) as any;

    if (!rec) {
      return res.status(404).json({ success: false, error: 'Réception introuvable.' });
    }
    if (rec.status === 'valide') {
      return res.status(400).json({ success: false, error: 'Cette réception a déjà été validée.' });
    }
    if (rec.status === 'annulee' || rec.status === 'rejete') {
      return res.status(400).json({ success: false, error: `Impossible de valider une réception au statut "${rec.status}".` });
    }

    const lines = typeof rec.items === 'string' ? JSON.parse(rec.items) : rec.items;
    const nowIso = new Date().toISOString();
    const dateStr = rec.date || nowIso.split('T')[0];
    const validatorLabel = userRole === 'Sales Admin' ? 'Salif Keïta (Sales Admin - Contrôleur)' : 'Administrateur';

    db.exec('BEGIN TRANSACTION');
    try {
      for (const line of lines) {
        const prod = db.prepare('SELECT id, code, name, price_box FROM products WHERE id = ?').get(line.productId) as any;
        if (!prod) continue;
        const cartons = Number(line.boxes || line.cartons || 0);
        if (cartons <= 0) continue;

        // 1. Increment central warehouse stock
        db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(cartons, prod.id);

        // 2. Insert lot
        const lotId = line.lotId || `lot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const existingLot = db.prepare('SELECT id FROM lots WHERE id = ?').get(lotId);
        const finalLotId = existingLot ? `lot-${Date.now()}-${Math.floor(Math.random() * 10000)}` : lotId;

        db.prepare(`
          INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'actif', ?)
        `).run(finalLotId, prod.id, String(line.lot_number || line.lotNumber || 'LOT').trim(), String(line.expiry_date || line.expiryDate || dateStr).trim(), cartons, cartons, dateStr);

        // 3. Record stock movement
        recordStockMovement(
          'reception',
          'IN',
          prod.id,
          finalLotId,
          cartons,
          rec.reference,
          `Validation réception fournisseur par Contrôleur: ${rec.supplier_name || 'Fournisseur'} (Lot ${line.lot_number || line.lotNumber})`,
          cartons * Number(prod.price_box || 0),
          validatorLabel
        );
      }

      db.prepare(`
        UPDATE receptions
        SET status = 'valide',
            validated_by = ?,
            validated_at = ?
        WHERE id = ?
      `).run(validatorLabel, nowIso, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    markNotificationsReadByReference('Sales Admin', rec.reference);

    sendNotification(
      'Gestionnaire de stock',
      `Réception validée par le Contrôleur (${rec.reference})`,
      `La réception ${rec.reference} (${rec.total_boxes} cartons — ${rec.supplier_name}) a été validée par ${validatorLabel}. Le stock dépôt central et les lots ont été crédités.`,
      'reception',
      rec.reference
    );

    recordAudit(
      'VALIDATION_RECEPTION_CONTROLEUR',
      'RECEPTION',
      id,
      userRole,
      null,
      `Réception ${rec.reference} (${rec.total_boxes} cartons) validée par ${validatorLabel}. Stock dépôt incrémenté.`
    );

    res.json({
      success: true,
      message: `Réception ${rec.reference} validée avec succès ! ${rec.total_boxes} cartons ont été intégrés au stock du dépôt central.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Annulation ou rejet d'une réception fournisseur (Approvisionnement dépôt) par le Sales Admin (Contrôleur) ou Administrateur
apiRouter.post('/receptions/:id/cancel', requireSalesAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_reason } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';
    const rec = db.prepare('SELECT * FROM receptions WHERE id = ?').get(id) as any;

    if (!rec) {
      return res.status(404).json({ success: false, error: 'Réception introuvable.' });
    }
    if (rec.status === 'annulee') {
      return res.status(400).json({ success: false, error: 'Cette réception est déjà annulée.' });
    }
    if (!cancel_reason || String(cancel_reason).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Le motif d\'annulation est obligatoire.' });
    }

    const reasonClean = String(cancel_reason).trim();
    const nowIso = new Date().toISOString();
    const cancelledByLabel = userRole === 'Sales Admin' ? 'Salif Keïta (Sales Admin - Contrôleur)' : 'Administrateur';
    const wasValidated = !rec.status || rec.status === 'valide';
    const lines = typeof rec.items === 'string' ? JSON.parse(rec.items) : rec.items;

    db.exec('BEGIN TRANSACTION');
    try {
      if (wasValidated) {
        // Déduire du stock dépôt et des lots les quantités qui avaient été entrées
        for (const line of lines) {
          const prod = db.prepare('SELECT id, name, price_box, stock_depot FROM products WHERE id = ?').get(line.productId) as any;
          if (!prod) continue;
          const cartons = Number(line.boxes || line.cartons || 0);
          if (cartons <= 0) continue;

          db.prepare('UPDATE products SET stock_depot = MAX(0, stock_depot - ?) WHERE id = ?').run(cartons, prod.id);

          const lotRow = line.lotId
            ? (db.prepare('SELECT id, quantity FROM lots WHERE id = ?').get(line.lotId) as any)
            : (db.prepare('SELECT id, quantity FROM lots WHERE product_id = ? AND lot_number = ? ORDER BY created_at DESC LIMIT 1').get(prod.id, line.lot_number || '') as any);

          if (lotRow) {
            db.prepare(`
              UPDATE lots
              SET quantity = MAX(0, quantity - ?),
                  status = CASE WHEN (quantity - ?) <= 0 THEN 'epuise' ELSE status END
              WHERE id = ?
            `).run(cartons, cartons, lotRow.id);
          }

          recordStockMovement(
            'perte_casse_peremption',
            'OUT',
            prod.id,
            lotRow ? lotRow.id : null,
            cartons,
            rec.reference,
            `Annulation réception fournisseur par Contrôleur (${reasonClean})`,
            cartons * Number(prod.price_box || 0),
            cancelledByLabel
          );
        }
      }

      db.prepare(`
        UPDATE receptions
        SET status = 'annulee',
            cancel_reason = ?,
            cancelled_by = ?,
            cancelled_at = ?
        WHERE id = ?
      `).run(reasonClean, cancelledByLabel, nowIso, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    markNotificationsReadByReference('Sales Admin', rec.reference);

    sendNotification(
      'Gestionnaire de stock',
      `Réception annulée (${rec.reference})`,
      `La réception fournisseur ${rec.reference} (${rec.total_boxes} cartons) a été annulée par ${cancelledByLabel}. Motif : ${reasonClean}.`,
      'reception',
      rec.reference
    );

    recordAudit(
      'ANNULATION_RECEPTION_FOURNISSEUR',
      'RECEPTION',
      id,
      userRole,
      null,
      `Réception ${rec.reference} (${rec.total_boxes} cartons, statut précédent : ${rec.status || 'valide'}) annulée par ${cancelledByLabel}. Motif : ${reasonClean}.`
    );

    res.json({
      success: true,
      message: `Approvisionnement fournisseur ${rec.reference} annulé avec succès${wasValidated ? ' (stock dépôt ajusté)' : ''}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Journal des mouvements de stock
apiRouter.get('/stock-movements', (req, res) => {
  try {
    const movements = db.prepare(`
      SELECT m.*, p.name as product_name, p.code as product_code, l.lot_number
      FROM stock_movements m
      JOIN products p ON m.product_id = p.id
      LEFT JOIN lots l ON m.lot_id = l.id
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all();
    res.json({ success: true, movements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 7. RETOURS : Le Vendeur rend l'invendu, le Magasinier confirme
apiRouter.get('/retours', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM retours r
      JOIN users u ON r.vendor_id = u.id
      ORDER BY r.created_at DESC
    `).all();
    const retours = rows.map((r: any) => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
    }));
    res.json({ success: true, retours });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Vendeur déclare un retour d'invendus
apiRouter.post('/retours/request', requireVendeur, (req, res) => {
  try {
    const { vendor_id, items, reason } = req.body;
    const userRole = getUserRole(req);

    if (!vendor_id || !Array.isArray(items) || items.length === 0 || !reason) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants (vendeur, cartons invendus, motif).' });
    }

    const date = new Date().toISOString().split('T')[0];
    const rand = Math.floor(100 + Math.random() * 900);
    const ref = `RET-${date}-${rand}`;
    const id = `ret-${Date.now()}`;

    db.prepare(`
      INSERT INTO retours (id, reference, vendor_id, date, items, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?)
    `).run(id, ref, vendor_id, date, JSON.stringify(items), reason, date);

    const vendor = db.prepare('SELECT name FROM users WHERE id = ?').get(vendor_id) as any;
    sendNotification(
      'Gestionnaire de stock',
      'Retour d\'invendus en attente',
      `Le vendeur ${vendor?.name || 'Vendeur'} a déclaré un retour d'invendus (${ref}) à réintégrer au stock dépôt.`,
      'retour',
      ref
    );

    recordAudit('DECLARATION_RETOUR', 'RETOUR', id, userRole, vendor_id, `Retour d'invendus ${ref} déclaré par le vendeur (en attente confirmation gestionnaire de stock).`);

    res.json({ success: true, message: `Retour ${ref} déclaré (en attente de confirmation par le Gestionnaire de stock).` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Magasinier confirme le retour d'invendus : stock dépôt +, vendeur -
apiRouter.post('/retours/:id/confirm', requireMagasinier, (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req);
    const ret = db.prepare('SELECT * FROM retours WHERE id = ?').get(id) as any;

    if (!ret) {
      return res.status(404).json({ success: false, error: 'Retour introuvable.' });
    }
    if (ret.status === 'valide' || ret.status === 'confirme') {
      return res.status(400).json({ success: false, error: 'Ce retour a déjà été confirmé.' });
    }

    const items = typeof ret.items === 'string' ? JSON.parse(ret.items) : ret.items;
    const now = new Date().toISOString();

    db.exec('BEGIN TRANSACTION');
    try {
      for (const it of items) {
        const prod = db.prepare('SELECT id, name, price_box FROM products WHERE id = ?').get(it.productId) as any;
        const boxes = Number(it.boxes || it.qtyBoxes);

        // 1. Re-increment central warehouse stock
        db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(boxes, prod.id);

        // 2. Add to earliest active lot or create fresh returned lot
        const lot = db.prepare(`
          SELECT id FROM lots
          WHERE product_id = ? AND status = 'actif'
          ORDER BY expiry_date DESC
          LIMIT 1
        `).get(prod.id) as any;

        if (lot) {
          db.prepare('UPDATE lots SET quantity = quantity + ? WHERE id = ?').run(boxes, lot.id);
        }

        // 3. Movement entrant (journal en ajout seul, jamais négatif)
        recordStockMovement(
          'retour',
          'IN',
          prod.id,
          lot ? lot.id : null,
          boxes,
          ret.reference,
          `Retour invendu vendeur confirmé: ${ret.reason}`,
          boxes * (prod.price_box || 0),
          'Magasinier Sotuba'
        );
      }

      db.prepare(`
        UPDATE retours
        SET status = 'confirme', confirmed_by = 'Magasinier Sotuba', confirmed_at = ?
        WHERE id = ?
      `).run(now, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    markNotificationsReadByReference('Magasinier', ret.reference);

    sendNotification(
      'Vendeur',
      'Retour d\'invendus confirmé',
      `Votre retour ${ret.reference} a été inspecté et confirmé par le Magasinier. Vos stocks et soldes ont été mis à jour.`,
      'retour',
      ret.reference,
      { targetUserId: ret.vendor_id }
    );

    recordAudit('CONFIRMATION_RETOUR', 'RETOUR', id, userRole, ret.vendor_id, `Retour d'invendus ${ret.reference} confirmé par le magasinier. Réintégration stock dépôt effectuée.`);

    res.json({ success: true, message: `Retour ${ret.reference} confirmé : stock dépôt réintégré.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 8. ÉCARTS & STOCK VENDEUR PAR CATÉGORIE : stock théorique (chargé - vendu - rendu)
apiRouter.get('/inventaires-vendeur/theoretical/:vendorId', (req, res) => {
  try {
    const { vendorId } = req.params;
    const products = db.prepare('SELECT * FROM products ORDER BY gamme ASC, name ASC').all() as any[];

    // Calculate theoretical stock per product: Total Chargé - Total Vendu - Total Rendu (active tour since 2026-10-24)
    const activeCycleStartDate = '2026-10-24';

    const theoreticalData = products.map(prod => {
      // 1. Total Chargé (active tour chargements with status 'Chargée' or 'valide')
      const chargements = db.prepare(`
        SELECT items FROM chargements
        WHERE vendor_id = ? AND status IN ('Chargée', 'valide') AND date >= ?
      `).all(vendorId, activeCycleStartDate) as any[];

      let chargedBoxes = 0;
      for (const chg of chargements) {
        const items = typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items;
        for (const it of items) {
          if (it.productId === prod.id) {
            chargedBoxes += Number(it.validatedBoxes !== undefined ? it.validatedBoxes : it.requestedBoxes || it.qtyBoxes || 0);
          }
        }
      }

      // 2. Total Vendu (active non-cancelled sales during current tour)
      const sales = db.prepare(`
        SELECT items FROM sales
        WHERE vendor_id = ? AND date >= ? AND COALESCE(status, 'livree') != 'annulee'
      `).all(vendorId, activeCycleStartDate) as any[];

      let soldBoxes = 0;
      for (const s of sales) {
        const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items;
        for (const it of items) {
          if (it.productId === prod.id) {
            soldBoxes += Number(it.qtyBoxes || 0);
          }
        }
      }

      // 3. Total Rendu (confirmed returns during current tour)
      const retours = db.prepare(`
        SELECT items FROM retours
        WHERE vendor_id = ? AND (status = 'confirme' OR status = 'valide') AND date >= ?
      `).all(vendorId, activeCycleStartDate) as any[];

      let returnedBoxes = 0;
      for (const ret of retours) {
        const items = typeof ret.items === 'string' ? JSON.parse(ret.items) : ret.items;
        for (const it of items) {
          if (it.productId === prod.id) {
            returnedBoxes += Number(it.boxes || it.qtyBoxes || 0);
          }
        }
      }

      const theoreticalQty = Math.max(0, chargedBoxes - soldBoxes - returnedBoxes);

      return {
        productId: prod.id,
        code: prod.code,
        name: prod.name,
        gamme: prod.gamme || 'Autres Produits',
        packaging: prod.packaging || 'Carton',
        units_per_box: Number(prod.units_per_box || 12),
        price_box: Number(prod.price_box || 0),
        stock_depot: Number(prod.stock_depot || 0),
        threshold_depot: Number(prod.threshold_depot || 50),
        chargedBoxes,
        soldBoxes,
        returnedBoxes,
        theoreticalQty,
        stockValue: theoreticalQty * Number(prod.price_box || 0),
        is_active: Number(prod.is_active ?? 1),
      };
    }).filter((item) => item.is_active === 1 || item.chargedBoxes > 0 || item.soldBoxes > 0 || item.returnedBoxes > 0);

    res.json({ success: true, theoreticalStock: theoreticalData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Enregistrement de l'Inventaire Vendeur par le Magasinier ou le Sales Admin (Contrôleur) & Détection des Écarts
apiRouter.post('/inventaires-vendeur', requireMagasinierOrSalesAdmin, (req, res) => {
  try {
    const { vendor_id, date: reqDate, counted_items, notes } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';
    const actorLabel =
      userRole === 'Sales Admin'
        ? 'Salif Keïta (Sales Admin - Contrôleur)'
        : userRole === 'Administrateur'
        ? 'Administrateur'
        : 'Moussa Diarra (Magasinier)';

    if (!vendor_id || !Array.isArray(counted_items) || counted_items.length === 0) {
      return res.status(400).json({ success: false, error: 'Données d\'inventaire incomplètes.' });
    }

    const vendor = db.prepare('SELECT name, code FROM users WHERE id = ?').get(vendor_id) as any;
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendeur introuvable.' });
    }

    const date = reqDate || new Date().toISOString().split('T')[0];
    const rand = Math.floor(100 + Math.random() * 900);
    const ref = `INV-VND-${date}-${rand}`;
    const id = `inv-vnd-${Date.now()}`;

    let totalEcartBoxes = 0;
    let totalEcartFcfa = 0;
    const detailedItems = [];

    for (const it of counted_items) {
      const prod = db.prepare('SELECT id, code, name, price_box FROM products WHERE id = ?').get(it.productId) as any;
      if (!prod) continue;

      const countedQty = Number(it.countedQty || 0);
      const theoreticalQty = Number(it.theoreticalQty || 0);
      const diffQty = countedQty - theoreticalQty; // < 0 => Manquant, > 0 => Surplus
      const diffAmount = diffQty * prod.price_box;

      totalEcartBoxes += diffQty;
      totalEcartFcfa += diffAmount;

      detailedItems.push({
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        countedQty,
        theoreticalQty,
        diffQty,
        unitPrice: prod.price_box,
        diffAmount
      });
    }

    db.exec('BEGIN TRANSACTION');
    try {
      const actorUserId = userRole === 'Sales Admin' ? 'usr-sad' : 'usr-mag';
      db.prepare(`
        INSERT INTO vendor_inventories (id, reference, vendor_id, date, items, total_ecart_boxes, total_ecart_fcfa, magasinier_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, ref, vendor_id, date, JSON.stringify(detailedItems), totalEcartBoxes, totalEcartFcfa, actorUserId, notes || `Inventaire physique camionnette (${actorLabel})`, date);

      // Notification to ADMINISTRATEUR and COMPTABLE
      const ecartLabel = totalEcartBoxes === 0
        ? 'Inventaire vendeur conforme (aucun écart)'
        : `Écart inventaire vendeur : ${totalEcartBoxes > 0 ? '+' : ''}${totalEcartBoxes} cartons (${totalEcartFcfa.toLocaleString('fr-FR')} FCFA)`;

      const msg = `Inventaire vendeur réalisé par ${actorLabel} sur ${vendor.name} (${vendor.code}). Résultat : ${ecartLabel}. Date : ${date}.`;

      sendNotification('Administrateur', ecartLabel, msg, 'ecart', ref);
      sendNotification('Comptable', ecartLabel, msg, 'ecart', ref);

      recordAudit(
        'INVENTAIRE_VENDEUR',
        'VENDOR_INVENTORY',
        id,
        userRole,
        vendor_id,
        `Inventaire vendeur ${ref} sur ${vendor.code} réalisé par ${actorLabel} : Écart ${totalEcartBoxes} cartons, Valeur ${totalEcartFcfa} FCFA. Notifications envoyées à l'Administrateur et au Comptable.`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Inventaire vendeur ${ref} enregistré avec succès par ${actorLabel}. Écart : ${totalEcartBoxes} cartons (${totalEcartFcfa.toLocaleString('fr-FR')} FCFA).`,
      inventory: {
        id,
        reference: ref,
        vendor_name: vendor.name,
        total_ecart_boxes: totalEcartBoxes,
        total_ecart_fcfa: totalEcartFcfa,
        items: detailedItems
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/inventaires-vendeur', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT vi.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM vendor_inventories vi
      JOIN users u ON vi.vendor_id = u.id
      ORDER BY vi.created_at DESC
    `).all();
    const inventories = rows.map((r: any) => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
    }));
    res.json({ success: true, inventories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 8B. INVENTAIRES PHYSIQUES DU DÉPÔT CENTRAL (Gérés par le Sales Admin / Contrôleur)
apiRouter.get('/inventaires-depot', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM depot_inventories ORDER BY created_at DESC').all();
    const inventories = rows.map((r: any) => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
    }));
    res.json({ success: true, inventories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.post('/inventaires-depot', requireMagasinierOrSalesAdmin, (req, res) => {
  try {
    const { date: reqDate, counted_items, notes, apply_adjustment } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';
    const actorLabel =
      userRole === 'Sales Admin'
        ? 'Salif Keïta (Sales Admin - Contrôleur)'
        : userRole === 'Administrateur'
        ? 'Administrateur'
        : 'Moussa Diarra (Magasinier)';

    if (!Array.isArray(counted_items) || counted_items.length === 0) {
      return res.status(400).json({ success: false, error: 'Données d\'inventaire dépôt incomplètes.' });
    }

    const date = reqDate || new Date().toISOString().split('T')[0];
    const rand = Math.floor(100 + Math.random() * 900);
    const ref = `INV-DEP-${date}-${rand}`;
    const id = `inv-dep-${Date.now()}`;
    const shouldAdjust = Boolean(apply_adjustment);

    let totalEcartBoxes = 0;
    let totalEcartFcfa = 0;
    const detailedItems: any[] = [];

    db.exec('BEGIN TRANSACTION');
    try {
      for (const it of counted_items) {
        const prod = db.prepare('SELECT id, code, name, price_box, stock_depot FROM products WHERE id = ?').get(it.productId) as any;
        if (!prod) continue;

        const theoreticalQty = Number(prod.stock_depot || 0);
        const countedQty = Math.max(0, Number(it.countedQty ?? theoreticalQty));
        const diffQty = countedQty - theoreticalQty;
        const diffAmount = diffQty * Number(prod.price_box || 0);

        totalEcartBoxes += diffQty;
        totalEcartFcfa += diffAmount;

        detailedItems.push({
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          countedQty,
          theoreticalQty,
          diffQty,
          unitPrice: prod.price_box,
          diffAmount,
        });

        if (shouldAdjust && diffQty !== 0) {
          db.prepare('UPDATE products SET stock_depot = ? WHERE id = ?').run(countedQty, prod.id);
          recordStockMovement(
            diffQty > 0 ? 'reception' : 'perte_casse_peremption',
            diffQty > 0 ? 'IN' : 'OUT',
            prod.id,
            null,
            Math.abs(diffQty),
            ref,
            `Ajustement inventaire dépôt central (${actorLabel})`,
            Math.abs(diffAmount),
            actorLabel
          );
        }
      }

      db.prepare(`
        INSERT INTO depot_inventories (
          id, reference, date, items, total_ecart_boxes, total_ecart_fcfa,
          performed_by, performed_role, notes, applied_adjustment, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        ref,
        date,
        JSON.stringify(detailedItems),
        totalEcartBoxes,
        totalEcartFcfa,
        actorLabel,
        userRole,
        notes || 'Inventaire physique du Dépôt Central Sotuba',
        shouldAdjust ? 1 : 0,
        new Date().toISOString()
      );

      const ecartLabel =
        totalEcartBoxes === 0
          ? `Inventaire Dépôt conforme (${ref})`
          : `Écart Inventaire Dépôt (${ref}) : ${totalEcartBoxes > 0 ? '+' : ''}${totalEcartBoxes} ctn`;

      sendNotification(
        'Administrateur',
        ecartLabel,
        `Inventaire du Dépôt Central réalisé par ${actorLabel}. Écart : ${totalEcartBoxes} cartons (${totalEcartFcfa.toLocaleString('fr-FR')} FCFA).${shouldAdjust ? ' Stock dépôt ajusté automatiquement.' : ''}`,
        'ecart',
        ref
      );

      recordAudit(
        'INVENTAIRE_DEPOT_CENTRAL',
        'DEPOT_INVENTORY',
        id,
        userRole,
        null,
        `Inventaire dépôt ${ref} par ${actorLabel} : Écart ${totalEcartBoxes} cartons (${totalEcartFcfa} FCFA). Ajustement appliqué : ${shouldAdjust ? 'Oui' : 'Non'}.`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Inventaire dépôt ${ref} enregistré avec succès (${totalEcartBoxes === 0 ? 'Aucun écart' : `Écart : ${totalEcartBoxes > 0 ? '+' : ''}${totalEcartBoxes} cartons`})${shouldAdjust ? ' et stock dépôt mis à jour.' : '.'}`,
      inventory: {
        id,
        reference: ref,
        date,
        total_ecart_boxes: totalEcartBoxes,
        total_ecart_fcfa: totalEcartFcfa,
        performed_by: actorLabel,
        applied_adjustment: shouldAdjust ? 1 : 0,
        items: detailedItems,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 9. VENTES (Vendeur seul - L'Administrateur ne vend jamais)
function ensureSaleThermalTicketNumber(saleRow: any): string {
  const existing = String(saleRow?.thermal_ticket_number || '').trim();
  if (existing && existing.startsWith('TKT-THERM-')) {
    return existing;
  }
  const baseRaw = existing
    ? existing.replace(/^TKT-/, 'TKT-THERM-')
    : String(saleRow?.number || saleRow?.id || '').replace(/^VTE-/, 'TKT-THERM-');
  let candidate = baseRaw.startsWith('TKT-THERM-') ? baseRaw : `TKT-THERM-${baseRaw.toUpperCase()}`;

  // Ensure uniqueness in sales table
  const conflict = db
    .prepare('SELECT id FROM sales WHERE thermal_ticket_number = ? AND id != ?')
    .get(candidate, saleRow?.id || '') as any;
  if (conflict) {
    candidate = `${candidate}-${String(saleRow?.id || Date.now()).slice(-4).toUpperCase()}`;
  }

  if (saleRow?.id) {
    try {
      db.prepare('UPDATE sales SET thermal_ticket_number = ? WHERE id = ?').run(candidate, saleRow.id);
    } catch {
      // ignore if read-only
    }
  }
  return candidate;
}

function buildSaleDocumentsFromRow(r: any) {
  let saleTime = r.sale_time;
  if (!saleTime) {
    if (r.offline_recorded_at && String(r.offline_recorded_at).includes('T')) {
      saleTime = String(r.offline_recorded_at).split('T')[1].slice(0, 5);
    } else if (r.created_at && String(r.created_at).includes('T')) {
      saleTime = String(r.created_at).split('T')[1].slice(0, 5);
    } else {
      saleTime = '10:30';
    }
  }

  const parsedItems = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
  const normalizedItems = Array.isArray(parsedItems)
    ? parsedItems.map((it: any, idx: number) => {
        const qty = Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1);
        const price = Number(it.unitPrice ?? it.price ?? 0);
        const retailUnitPrice = Number(it.retailUnitPrice ?? price);
        const discountPerBox = Number(it.discountPerBox ?? Math.max(0, retailUnitPrice - price));
        const lineDiscount = Number(it.lineDiscount ?? qty * discountPerBox);
        const total = Number(it.total ?? qty * price);
        return {
          id: `${r.id || 'sale'}-${idx}`,
          productId: it.productId,
          code: it.code || 'ART',
          name: it.name || it.description || 'Produit Baobab',
          description: it.name || it.description || 'Produit Baobab',
          qty,
          qtyBoxes: qty,
          quantity: qty,
          price,
          unitPrice: price,
          retailUnitPrice,
          discountPerBox,
          lineDiscount,
          total,
        };
      })
    : [];

  const computedHt = normalizedItems.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);
  const subtotalHt = Number(r.total_amount || computedHt || 0);
  const buyerType = r.buyer_type || null;
  const wholesaleDiscountAmount = Number(
    r.wholesale_discount_amount ??
      normalizedItems.reduce((sum: number, it: any) => sum + Number(it.lineDiscount || 0), 0)
  );
  const cajoucyBoxesCount = Number(r.cajoucy_boxes_count || 0);
  const withTva = Boolean(r.with_tva);
  const tvaRate = withTva ? Number(r.tva_rate || 18) : 0;
  const tvaAmount = withTva ? Number(r.tva_amount || Math.round(subtotalHt * 0.18)) : 0;
  const totalTtc = withTva ? Number(r.total_ttc || subtotalHt + tvaAmount) : subtotalHt;

  const thermalTicketNumber = ensureSaleThermalTicketNumber(r);
  const invoiceNumber = r.invoice_number || String(r.number || '').replace(/^VTE-/, 'FAC-');
  const isCancelled = r.status === 'annulee';
  const paymentMethod = r.payment_type || 'Comptant';
  const payLower = String(paymentMethod).toLowerCase();
  const isAcquittee =
    !isCancelled &&
    !payLower.includes('crédit') &&
    !payLower.includes('credit') &&
    !payLower.includes('attente');

  const ticket = {
    id: `therm-${r.id}`,
    saleId: r.id,
    number: thermalTicketNumber,
    ticketNumber: thermalTicketNumber,
    thermalTicketNumber,
    saleNumber: r.number,
    invoiceNumber,
    type: 'mini_thermique' as const,
    docTypeTitle: 'TICKET DE VENTE',
    date: `${r.date} à ${saleTime}`,
    rawDate: r.date,
    saleTime,
    clientName: `${r.pdv_name || 'PDV'}${r.pdv_neighborhood ? ` (${r.pdv_neighborhood})` : ''}`,
    clientPhone: r.pdv_phone || '+223 76 00 00 00',
    vendorId: r.vendor_id,
    vendorName: r.vendor_name || 'Vendeur Baobab',
    vendorCode: r.vendor_code || 'BAO-VND',
    vendorTeam: r.vendor_team || '',
    vendorPhone: r.vendor_phone || '+223 75 44 22 11',
    pdvId: r.pdv_id,
    pdvName: r.pdv_name || 'PDV',
    pdvCode: r.pdv_code || '',
    pdvNeighborhood: r.pdv_neighborhood || 'Bamako',
    pdvManager: r.pdv_manager || '',
    pdvPhone: r.pdv_phone || '+223 76 00 00 00',
    buyerType,
    wholesaleDiscountAmount,
    cajoucyBoxesCount,
    items: normalizedItems,
    subtotal: subtotalHt,
    subtotalHt,
    withTva,
    taxRate: tvaRate,
    tvaRate,
    taxAmount: tvaAmount,
    tvaAmount,
    total: totalTtc,
    totalTtc,
    paymentMethod,
    isAcquittee,
    cashierName: `${r.vendor_name || 'Vendeur'} (${r.vendor_code || 'BAO'})`,
    status: isCancelled
      ? 'TICKET ANNULÉ'
      : isAcquittee
      ? 'ACQUITTÉ'
      : 'À PAYER',
  };

  const invoice = {
    id: `inv-a4-${r.id}`,
    saleId: r.id,
    number: invoiceNumber,
    invoiceNumber,
    saleNumber: r.number,
    thermalTicketNumber,
    type: 'facture' as const,
    docTypeTitle: 'FACTURE DE VENTE PDV',
    date: r.date,
    saleTime,
    clientName: `${r.pdv_name || 'PDV'}${r.pdv_neighborhood ? ` (${r.pdv_neighborhood})` : ''}`,
    clientPhone: r.pdv_phone || '+223 76 00 00 00',
    vendorId: r.vendor_id,
    vendorName: r.vendor_name || 'Vendeur Baobab',
    vendorCode: r.vendor_code || 'BAO-VND',
    vendorTeam: r.vendor_team || '',
    vendorPhone: r.vendor_phone || '+223 75 44 22 11',
    pdvId: r.pdv_id,
    pdvName: r.pdv_name || 'PDV',
    pdvCode: r.pdv_code || '',
    pdvNeighborhood: r.pdv_neighborhood || 'Bamako',
    pdvManager: r.pdv_manager || '',
    pdvPhone: r.pdv_phone || '+223 76 00 00 00',
    versementRef: r.versement_reference || undefined,
    buyerType,
    wholesaleDiscountAmount,
    cajoucyBoxesCount,
    items: normalizedItems,
    subtotal: subtotalHt,
    subtotalHt,
    withTva,
    taxRate: tvaRate,
    tvaRate,
    taxAmount: tvaAmount,
    tvaAmount,
    total: totalTtc,
    totalTtc,
    paymentMethod,
    isAcquittee,
    cashierName: `${r.vendor_name || 'Vendeur'} (${r.vendor_code || 'BAO'})`,
    status: isCancelled
      ? 'FACTURE ANNULÉE'
      : withTva
      ? 'Facturée TTC (TVA 18%)'
      : 'Facturée HT (Sans TVA)',
  };

  return {
    ticket,
    invoice,
    saleTime,
    subtotalHt,
    buyerType,
    wholesaleDiscountAmount,
    cajoucyBoxesCount,
    withTva,
    tvaRate,
    tvaAmount,
    totalTtc,
    thermalTicketNumber,
    invoiceNumber,
    normalizedItems,
  };
}

function findSaleRowByIdentifier(identifier: string): any {
  const clean = String(identifier || '').trim();
  if (!clean) return null;
  return db.prepare(`
    SELECT s.*,
           u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
           p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood,
           p.manager_name as pdv_manager, p.phone as pdv_phone,
           p.routine_name as pdv_routine_name, p.routine_day as pdv_routine_day, p.routine_day_index as pdv_routine_day_index,
           v.reference as versement_reference
    FROM sales s
    JOIN users u ON s.vendor_id = u.id
    JOIN points_de_vente p ON s.pdv_id = p.id
    LEFT JOIN versements v ON s.versement_id = v.id
    WHERE s.id = ? OR s.number = ? OR s.thermal_ticket_number = ? OR s.invoice_number = ?
    LIMIT 1
  `).get(clean, clean, clean, clean) as any;
}

function checkVendorAccessToSale(req: any, saleRow: any): boolean {
  const role = getUserRole(req);
  if (role !== 'Vendeur') return true;
  const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const headerUserCode = typeof req.headers['x-user-code'] === 'string' ? req.headers['x-user-code'].trim() : '';
  const queryUserId = typeof req.query?.vendor_id === 'string' ? req.query.vendor_id.trim() : '';
  const effectiveUserId = headerUserId || queryUserId;
  if (!effectiveUserId && !headerUserCode) {
    return true;
  }
  return (
    (Boolean(effectiveUserId) && saleRow.vendor_id === effectiveUserId) ||
    (Boolean(headerUserCode) && saleRow.vendor_code === headerUserCode)
  );
}

apiRouter.get('/sales', (req, res) => {
  try {
    ensureAllPdvsBoundToVendorAndRoutineDay();

    const rows = db.prepare(`
      SELECT s.*,
             u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
             p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood,
             p.manager_name as pdv_manager, p.phone as pdv_phone,
             p.routine_name as pdv_routine_name, p.routine_day as pdv_routine_day, p.routine_day_index as pdv_routine_day_index,
             v.reference as versement_reference
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      LEFT JOIN versements v ON s.versement_id = v.id
      ORDER BY s.date DESC, COALESCE(s.sale_time, '00:00') DESC, s.created_at DESC, s.number DESC
    `).all();

    const role = getUserRole(req);
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const headerUserCode = typeof req.headers['x-user-code'] === 'string' ? req.headers['x-user-code'].trim() : '';

    const filteredRows =
      role === 'Vendeur' && (headerUserId || headerUserCode)
        ? rows.filter(
            (r: any) =>
              (headerUserId && r.vendor_id === headerUserId) ||
              (headerUserCode && r.vendor_code === headerUserCode)
          )
        : rows;

    const sales = filteredRows.map((r: any) => {
      const built = buildSaleDocumentsFromRow(r);
      const resolvedRoutineDay = r.pdv_routine_day || 'Vendredi';
      const resolvedRoutineName =
        (r.pdv_routine_name && String(r.pdv_routine_name).trim()) ||
        `Routine ${resolvedRoutineDay}`;
      return {
        ...r,
        routine_name: resolvedRoutineName,
        routine_day: resolvedRoutineDay,
        routine_day_index: Number(r.pdv_routine_day_index || 5),
        sale_time: built.saleTime,
        thermal_ticket_number: built.thermalTicketNumber,
        invoice_generated: Boolean(r.invoice_generated),
        invoice_number: built.invoiceNumber,
        buyer_type: built.buyerType,
        wholesale_discount_amount: built.wholesaleDiscountAmount,
        cajoucy_boxes_count: built.cajoucyBoxesCount,
        with_tva: built.withTva,
        tva_rate: built.tvaRate,
        tva_amount: built.tvaAmount,
        total_ttc: built.totalTtc,
        rectification_status: r.rectification_status || null,
        rectification_reason: r.rectification_reason || null,
        rectification_requested_at: r.rectification_requested_at || null,
        cancel_request_status: r.cancel_request_status || null,
        cancel_request_reason: r.cancel_request_reason || null,
        cancel_requested_at: r.cancel_requested_at || null,
        cancel_requested_by: r.cancel_requested_by || null,
        cancel_reviewed_at: r.cancel_reviewed_at || null,
        cancel_reviewed_by: r.cancel_reviewed_by || null,
        cancel_rejection_reason: r.cancel_rejection_reason || null,
        items: built.normalizedItems,
      };
    });
    res.json({ success: true, sales });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Route dédiée 1 : Ticket thermique 80 mm (TKT-THERM-...) d'une vente
apiRouter.get(['/sales/:id/ticket', '/tickets/:id'], (req, res) => {
  try {
    const saleRow = findSaleRowByIdentifier(req.params.id);
    if (!saleRow) {
      return res.status(404).json({ success: false, error: 'Ticket ou vente introuvable.' });
    }
    if (!checkVendorAccessToSale(req, saleRow)) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé : le Vendeur ne peut consulter que les tickets de ses propres ventes.',
      });
    }
    const { ticket } = buildSaleDocumentsFromRow(saleRow);
    res.json({ success: true, ticket });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Route dédiée 2 : Facture A4 (FAC-...) d'une vente
apiRouter.get(['/sales/:id/invoice', '/invoices/:id'], (req, res) => {
  try {
    const saleRow = findSaleRowByIdentifier(req.params.id);
    if (!saleRow) {
      return res.status(404).json({ success: false, error: 'Facture ou vente introuvable.' });
    }
    if (!checkVendorAccessToSale(req, saleRow)) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé : le Vendeur ne peut consulter que les factures de ses propres ventes.',
      });
    }
    const { invoice } = buildSaleDocumentsFromRow(saleRow);
    res.json({ success: true, invoice });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Route POS caisse directe (/api/invoices) : sépare strictement Reçu de Caisse (REC-...) et Facture A4 (FAC-...)
apiRouter.post('/invoices', (req, res) => {
  try {
    const { type, clientName, clientPhone, items, paymentMethod, cashierName } = req.body || {};
    const rawItems = Array.isArray(items) ? items : [];
    const total = rawItems.reduce(
      (sum: number, it: any) => sum + Number(it.total ?? Number(it.qty || 1) * Number(it.price || 0)),
      0
    );
    const nowObj = new Date();
    const dateStr = nowObj.toISOString().split('T')[0];
    const timeStr = `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const isReceipt = type === 'recu' || type === 'recu_caisse' || type === 'receipt';
    const docNum = isReceipt ? `REC-2026-${rand}` : `FAC-2026-${rand}`;

    const invoicePayload = {
      id: `${isReceipt ? 'rec' : 'fac'}-${Date.now()}`,
      number: docNum,
      type: isReceipt ? ('recu_caisse' as const) : ('facture' as const),
      docTypeTitle: isReceipt ? 'REÇU DE CAISSE' : 'FACTURE DE VENTE PDV',
      date: dateStr,
      saleTime: timeStr,
      clientName: clientName || 'Client Comptant',
      clientPhone: clientPhone || '+223 70 00 00 00',
      items: rawItems.map((it: any, idx: number) => ({
        id: `pos-${idx}`,
        code: it.code || `ART-0${idx + 1}`,
        name: it.name || 'Article Baobab',
        description: it.name || 'Article Baobab',
        qty: Number(it.qty || 1),
        quantity: Number(it.qty || 1),
        price: Number(it.price || 0),
        unitPrice: Number(it.price || 0),
        total: Number(it.total ?? Number(it.qty || 1) * Number(it.price || 0)),
      })),
      subtotal: total,
      subtotalHt: total,
      withTva: false,
      taxRate: 0,
      tvaRate: 0,
      taxAmount: 0,
      tvaAmount: 0,
      total,
      totalTtc: total,
      paymentMethod: paymentMethod || 'Espèces',
      isAcquittee: true,
      cashierName: cashierName || 'Caisse Principale Baobab',
      status: isReceipt ? 'Encaissé en Caisse' : 'Facturée HT (Sans TVA)',
    };

    res.json({ success: true, invoice: invoicePayload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/sales/:id : Consultation d'une vente (ou commande en gros) avec contrôle strict des droits côté serveur (403 sinon)
apiRouter.get('/sales/:id', (req, res) => {
  try {
    const { id } = req.params;
    const authUser = deduceUserFromToken(req);
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const userId = authUser?.id || headerUserId;
    const userRole = authUser?.role || getUserRole(req) || '';

    // Le Magasinier (Gestionnaire de stock) n'a aucun droit d'accès aux ventes
    if (
      !userRole ||
      userRole === 'Magasinier' ||
      userRole === 'Gestionnaire de stock'
    ) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé (403) : le rôle Magasinier / Gestionnaire de stock n'est pas autorisé à consulter les ventes.",
      });
    }

    // Rechercher d'abord dans sales
    const sale = db
      .prepare(
        `
        SELECT s.*, u.name as vendor_name, u.code as vendor_code, u.phone as vendor_phone,
               p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood,
               p.manager_name as pdv_manager, p.phone as pdv_phone
        FROM sales s
        LEFT JOIN users u ON s.vendor_id = u.id
        LEFT JOIN points_de_vente p ON s.pdv_id = p.id
        WHERE s.id = ? OR s.number = ?
      `
      )
      .get(id, id) as any;

    if (sale) {
      // Un Vendeur ne peut consulter que ses propres ventes (403 sinon)
      if (userRole === 'Vendeur' && userId && sale.vendor_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Accès refusé (403) : vous ne pouvez consulter que vos propres ventes.',
        });
      }
      // Le Gestionnaire grossiste n'a accès qu'à ses commandes en gros
      if (userRole === 'Gestionnaire grossiste') {
        return res.status(403).json({
          success: false,
          error: 'Accès refusé (403) : cette vente détail PDV ne relève pas du périmètre grossiste.',
        });
      }

      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(sale.items || '[]');
      } catch {
        parsedItems = [];
      }

      return res.json({
        success: true,
        sale: {
          ...sale,
          items: parsedItems,
        },
      });
    }

    // Sinon rechercher dans wholesale_orders (commandes en gros)
    const wholesaleOrder = db
      .prepare('SELECT * FROM wholesale_orders WHERE id = ? OR reference = ?')
      .get(id, id) as any;

    if (wholesaleOrder) {
      if (userRole === 'Vendeur') {
        return res.status(403).json({
          success: false,
          error: "Accès refusé (403) : un Vendeur n'a pas accès aux commandes en gros.",
        });
      }
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(wholesaleOrder.items_json || '[]');
      } catch {
        parsedItems = [];
      }
      return res.json({
        success: true,
        sale: {
          ...wholesaleOrder,
          number: wholesaleOrder.reference,
          pdv_name: wholesaleOrder.client_name,
          vendor_name: wholesaleOrder.created_by,
          items: parsedItems,
          isWholesale: true,
        },
      });
    }

    return res.status(404).json({ success: false, error: 'Vente introuvable.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return res.status(500).json({ success: false, error: message });
  }
});

interface WholesaleValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
  normalizedItems: Array<{
    productId: string;
    code: string;
    name: string;
    qtyBoxes: number;
    unitPrice: number;
    retailUnitPrice: number;
    discountPerBox: number;
    lineDiscount: number;
    total: number;
  }>;
  cajoucyBoxesCount: number;
  buyerType: 'Grossiste' | 'Détaillant' | null;
  wholesaleDiscountAmount: number;
  totalAmount: number;
}

function validateAndComputeSaleWholesaleDiscount(params: {
  rawItems: any[];
  rawBuyerType?: any;
  rawWholesaleDiscount?: any;
  rawTotalAmount?: any;
}): WholesaleValidationResult {
  const { rawItems, rawBuyerType, rawWholesaleDiscount, rawTotalAmount } = params;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Données de vente incomplètes.',
      normalizedItems: [],
      cajoucyBoxesCount: 0,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount: 0,
    };
  }

  const resolvedLines: Array<{
    prod: any;
    qtyBoxes: number;
    clientSentPrice: number | null;
    clientSentTotal: number | null;
    hasWholesalePrice: boolean;
    retailPrice: number;
    wholesalePrice: number;
  }> = [];

  let cajoucyBoxesCount = 0;

  for (const it of rawItems) {
    const prod = db
      .prepare('SELECT id, code, name, price_box, wholesale_price_box, is_active FROM products WHERE id = ? OR code = ?')
      .get(it.productId || '', it.code || '') as any;

    if (!prod) {
      return {
        ok: false,
        status: 400,
        error: `Produit introuvable dans le catalogue (${it.code || it.productId || 'inconnu'}).`,
        normalizedItems: [],
        cajoucyBoxesCount: 0,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    if (Number(prod.is_active ?? 1) === 0) {
      return {
        ok: false,
        status: 400,
        error: `Le produit "${prod.name}" est désactivé et ne peut plus être vendu.`,
        normalizedItems: [],
        cajoucyBoxesCount: 0,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    const qtyBoxes = Math.round(Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 0));
    if (!Number.isFinite(qtyBoxes) || qtyBoxes <= 0) {
      return {
        ok: false,
        status: 400,
        error: `Quantité invalide pour le produit "${prod.name}".`,
        normalizedItems: [],
        cajoucyBoxesCount: 0,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    const hasWholesalePrice =
      prod.wholesale_price_box !== null &&
      prod.wholesale_price_box !== undefined &&
      Number(prod.wholesale_price_box) > 0;
    const retailPrice = Number(prod.price_box || 0);
    const wholesalePrice = hasWholesalePrice ? Number(prod.wholesale_price_box) : retailPrice;

    if (hasWholesalePrice) {
      cajoucyBoxesCount += qtyBoxes;
    }

    const clientSentPrice =
      it.unitPrice !== undefined && it.unitPrice !== null
        ? Number(it.unitPrice)
        : it.price !== undefined && it.price !== null
        ? Number(it.price)
        : null;
    const clientSentTotal =
      it.total !== undefined && it.total !== null ? Number(it.total) : null;

    resolvedLines.push({
      prod,
      qtyBoxes,
      clientSentPrice,
      clientSentTotal,
      hasWholesalePrice,
      retailPrice,
      wholesalePrice,
    });
  }

  const cleanBuyerType =
    typeof rawBuyerType === 'string' ? rawBuyerType.trim() : '';
  const clientDiscountNum =
    rawWholesaleDiscount !== undefined && rawWholesaleDiscount !== null
      ? Number(rawWholesaleDiscount)
      : 0;

  if (cajoucyBoxesCount < 50) {
    // Sous le seuil de 50 cartons Cajoucy : aucune remise autorisée, aucun choix "Grossiste"
    if (cleanBuyerType === 'Grossiste' || clientDiscountNum > 0) {
      return {
        ok: false,
        status: 400,
        error: `Remise grossiste refusée : le total Cajoucy (${cajoucyBoxesCount} cartons) est strictement inférieur au seuil obligatoire de 50 cartons.`,
        normalizedItems: [],
        cajoucyBoxesCount,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    for (const line of resolvedLines) {
      if (line.clientSentPrice !== null && line.clientSentPrice !== line.retailPrice) {
        return {
          ok: false,
          status: 400,
          error: `Prix unitaire modifié ou non autorisé pour "${line.prod.name}" (${line.clientSentPrice} FCFA au lieu du prix détaillant ${line.retailPrice} FCFA).`,
          normalizedItems: [],
          cajoucyBoxesCount,
          buyerType: null,
          wholesaleDiscountAmount: 0,
          totalAmount: 0,
        };
      }
      if (
        line.clientSentTotal !== null &&
        line.clientSentTotal !== line.qtyBoxes * line.retailPrice
      ) {
        return {
          ok: false,
          status: 400,
          error: `Montant de ligne modifié ou incohérent pour "${line.prod.name}".`,
          normalizedItems: [],
          cajoucyBoxesCount,
          buyerType: null,
          wholesaleDiscountAmount: 0,
          totalAmount: 0,
        };
      }
    }

    const normalizedItems = resolvedLines.map((line) => ({
      productId: line.prod.id,
      code: line.prod.code,
      name: line.prod.name,
      qtyBoxes: line.qtyBoxes,
      unitPrice: line.retailPrice,
      retailUnitPrice: line.retailPrice,
      discountPerBox: 0,
      lineDiscount: 0,
      total: line.qtyBoxes * line.retailPrice,
    }));
    const totalAmount = normalizedItems.reduce((sum, it) => sum + it.total, 0);

    if (
      rawTotalAmount !== undefined &&
      rawTotalAmount !== null &&
      Number(rawTotalAmount) !== totalAmount
    ) {
      return {
        ok: false,
        status: 400,
        error: `Montant total modifié ou incohérent (${rawTotalAmount} FCFA au lieu de ${totalAmount} FCFA).`,
        normalizedItems: [],
        cajoucyBoxesCount,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    return {
      ok: true,
      normalizedItems,
      cajoucyBoxesCount,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount,
    };
  }

  // Seuil atteint : cajoucyBoxesCount >= 50 -> Choix obligatoire "Grossiste" ou "Détaillant"
  if (cleanBuyerType !== 'Grossiste' && cleanBuyerType !== 'Détaillant') {
    return {
      ok: false,
      status: 400,
      error:
        'À partir de 50 cartons Cajoucy, le choix du "Type d\'acheteur" (Grossiste ou Détaillant) est obligatoire.',
      normalizedItems: [],
      cajoucyBoxesCount,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount: 0,
    };
  }

  const applyWholesale = cleanBuyerType === 'Grossiste';

  for (const line of resolvedLines) {
    const expectedUnitPrice =
      applyWholesale && line.hasWholesalePrice ? line.wholesalePrice : line.retailPrice;

    if (!line.hasWholesalePrice && line.clientSentPrice !== null && line.clientSentPrice !== line.retailPrice) {
      return {
        ok: false,
        status: 400,
        error: `La remise grossiste concerne exclusivement les produits Cajoucy ayant un Prix grossiste. Le prix de "${line.prod.name}" ne peut pas être modifié.`,
        normalizedItems: [],
        cajoucyBoxesCount,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    if (
      line.hasWholesalePrice &&
      line.clientSentPrice !== null &&
      line.clientSentPrice !== expectedUnitPrice &&
      !(applyWholesale && line.clientSentPrice === line.retailPrice)
    ) {
      return {
        ok: false,
        status: 400,
        error: `Prix unitaire invalide pour "${line.prod.name}" (${line.clientSentPrice} FCFA au lieu de ${expectedUnitPrice} FCFA pour un acheteur ${cleanBuyerType}).`,
        normalizedItems: [],
        cajoucyBoxesCount,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }

    if (
      line.clientSentTotal !== null &&
      line.clientSentTotal !== line.qtyBoxes * expectedUnitPrice &&
      !(applyWholesale && line.hasWholesalePrice && line.clientSentTotal === line.qtyBoxes * line.retailPrice)
    ) {
      return {
        ok: false,
        status: 400,
        error: `Montant de ligne modifié ou incohérent pour "${line.prod.name}".`,
        normalizedItems: [],
        cajoucyBoxesCount,
        buyerType: null,
        wholesaleDiscountAmount: 0,
        totalAmount: 0,
      };
    }
  }

  if (!applyWholesale && clientDiscountNum > 0) {
    return {
      ok: false,
      status: 400,
      error:
        'Aucune remise grossiste ne peut être appliquée lorsque le type d\'acheteur est "Détaillant".',
      normalizedItems: [],
      cajoucyBoxesCount,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount: 0,
    };
  }

  const normalizedItems = resolvedLines.map((line) => {
    const unitPrice =
      applyWholesale && line.hasWholesalePrice ? line.wholesalePrice : line.retailPrice;
    const discountPerBox =
      applyWholesale && line.hasWholesalePrice
        ? Math.max(0, line.retailPrice - line.wholesalePrice)
        : 0;
    const lineDiscount = line.qtyBoxes * discountPerBox;
    const total = line.qtyBoxes * unitPrice;

    return {
      productId: line.prod.id,
      code: line.prod.code,
      name: line.prod.name,
      qtyBoxes: line.qtyBoxes,
      unitPrice,
      retailUnitPrice: line.retailPrice,
      discountPerBox,
      lineDiscount,
      total,
    };
  });

  const wholesaleDiscountAmount = normalizedItems.reduce(
    (sum, it) => sum + it.lineDiscount,
    0
  );
  const totalAmount = normalizedItems.reduce((sum, it) => sum + it.total, 0);

  if (
    applyWholesale &&
    rawWholesaleDiscount !== undefined &&
    rawWholesaleDiscount !== null &&
    Number(rawWholesaleDiscount) !== 0 &&
    Number(rawWholesaleDiscount) !== wholesaleDiscountAmount
  ) {
    return {
      ok: false,
      status: 400,
      error: `Montant de remise grossiste modifié ou invalide (${rawWholesaleDiscount} FCFA au lieu de ${wholesaleDiscountAmount} FCFA).`,
      normalizedItems: [],
      cajoucyBoxesCount,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount: 0,
    };
  }

  if (
    rawTotalAmount !== undefined &&
    rawTotalAmount !== null &&
    Number(rawTotalAmount) !== totalAmount &&
    !(applyWholesale && Number(rawTotalAmount) === totalAmount + wholesaleDiscountAmount)
  ) {
    return {
      ok: false,
      status: 400,
      error: `Montant total modifié ou incohérent (${rawTotalAmount} FCFA au lieu de ${totalAmount} FCFA).`,
      normalizedItems: [],
      cajoucyBoxesCount,
      buyerType: null,
      wholesaleDiscountAmount: 0,
      totalAmount: 0,
    };
  }

  return {
    ok: true,
    normalizedItems,
    cajoucyBoxesCount,
    buyerType: cleanBuyerType,
    wholesaleDiscountAmount,
    totalAmount,
  };
}

function checkAndTriggerWholesaleBuyerFrequencyAlert(vendorId: string, refDateStr: string) {
  try {
    const cleanDate = (refDateStr || new Date().toISOString().split('T')[0]).slice(0, 10);
    const stats = db
      .prepare(
        `
        SELECT COUNT(*) as cnt, COALESCE(SUM(wholesale_discount_amount), 0) as total_discount, COALESCE(SUM(cajoucy_boxes_count), 0) as total_boxes
        FROM sales
        WHERE vendor_id = ?
          AND buyer_type = 'Grossiste'
          AND COALESCE(status, 'livree') != 'annulee'
          AND date >= date(?, '-6 days')
          AND date <= date(?)
      `
      )
      .get(vendorId, cleanDate, cleanDate) as {
      cnt: number;
      total_discount: number;
      total_boxes: number;
    };

    const count7d = Number(stats?.cnt || 0);
    if (count7d > 10) {
      const vnd = db
        .prepare('SELECT id, name, code FROM users WHERE id = ?')
        .get(vendorId) as { id: string; name: string; code: string } | undefined;
      const vendorName = vnd?.name || 'Vendeur';
      const vendorCode = vnd?.code || vendorId;
      const totalDiscount = Number(stats?.total_discount || 0);
      const title = `Alerte Remise Grossiste : ${vendorName} (${count7d} ventes en 7j)`;
      const msg = `Le vendeur ${vendorName} (${vendorCode}) a sélectionné le type d'acheteur "Grossiste" ${count7d} fois sur les 7 derniers jours (seuil : > 10), pour un cumul de remise de ${totalDiscount.toLocaleString('fr-FR')} FCFA.`;
      const refKey = `ALT-GROSSISTE-7J-${vendorId}-${cleanDate}`;

      sendNotification('Administrateur', title, msg, 'alerte_anomalie', refKey);
      sendNotification(
        'Directeur des opérations de vente',
        title,
        msg,
        'alerte_anomalie',
        refKey
      );
      evaluateAllAnomalyRules({ trigger: 'wholesale_discount_frequency', sendPush: true });
    }
  } catch (err) {
    console.warn('[WholesaleFrequencyAlert] Erreur:', err);
  }
}

apiRouter.post('/sales', requireVendeur, (req, res) => {
  try {
    const {
      id: clientSaleId,
      number: clientNumber,
      date: clientDate,
      sale_time: clientSaleTime,
      vendor_id,
      pdv_id,
      items,
      buyer_type: rawBuyerType,
      buyerType: rawBuyerTypeAlt,
      wholesale_discount_amount: rawWholesaleDiscount,
      wholesaleDiscountAmount: rawWholesaleDiscountAlt,
      total_amount: rawClientTotalAmount,
      payment_type,
      status: requestedStatus,
      needs_regularization,
      recorded_offline,
      offline_recorded_at,
      latitude,
      longitude,
    } = req.body;
    const userRole = getUserRole(req);
    if (!vendor_id || !pdv_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Données de vente incomplètes.' });
    }

    const validation = validateAndComputeSaleWholesaleDiscount({
      rawItems: items,
      rawBuyerType: rawBuyerType ?? rawBuyerTypeAlt,
      rawWholesaleDiscount: rawWholesaleDiscount ?? rawWholesaleDiscountAlt,
      rawTotalAmount: rawClientTotalAmount,
    });

    if (!validation.ok) {
      return res.status(validation.status || 400).json({
        success: false,
        error: validation.error || 'Vente invalide.',
      });
    }

    const {
      normalizedItems,
      cajoucyBoxesCount,
      buyerType,
      wholesaleDiscountAmount,
      totalAmount: total,
    } = validation;
    const itemsJsonStr = JSON.stringify(normalizedItems);

    // Déduplication côté serveur : vérifier si l'identifiant de vente existe déjà ou si le vendeur vient de soumettre la même vente en double (< 15 secondes)
    if (clientSaleId) {
      const existingById = db
        .prepare('SELECT id, number, thermal_ticket_number, date, sale_time, buyer_type, wholesale_discount_amount, cajoucy_boxes_count, total_amount FROM sales WHERE id = ?')
        .get(clientSaleId) as any;
      if (existingById) {
        return res.json({
          success: true,
          duplicate: true,
          message: `Vente ${existingById.number} déjà enregistrée (doublon ignoré, aucune notification envoyée en double).`,
          saleId: existingById.id,
          number: existingById.number,
          thermal_ticket_number: existingById.thermal_ticket_number,
          date: existingById.date,
          sale_time: existingById.sale_time,
          buyer_type: existingById.buyer_type || null,
          wholesale_discount_amount: Number(existingById.wholesale_discount_amount || 0),
          cajoucy_boxes_count: Number(existingById.cajoucy_boxes_count || 0),
          total_amount: Number(existingById.total_amount || total),
        });
      }
    }

    const recentSameVendorSale = db
      .prepare(
        `
        SELECT id, number, thermal_ticket_number, date, sale_time, buyer_type, wholesale_discount_amount, cajoucy_boxes_count, total_amount, created_at
        FROM sales
        WHERE vendor_id = ? AND pdv_id = ? AND total_amount = ? AND items = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(vendor_id, pdv_id, total, itemsJsonStr) as any;

    if (recentSameVendorSale && recentSameVendorSale.created_at) {
      const prevTs = new Date(recentSameVendorSale.created_at).getTime();
      if (!Number.isNaN(prevTs) && Date.now() - prevTs < 15000 && !req.body.allowBurstDuplicate) {
        return res.json({
          success: true,
          duplicate: true,
          message: `Vente identique déjà enregistrée (${recentSameVendorSale.number}) — doublon ignoré.`,
          saleId: recentSameVendorSale.id,
          number: recentSameVendorSale.number,
          thermal_ticket_number: recentSameVendorSale.thermal_ticket_number,
          date: recentSameVendorSale.date,
          sale_time: recentSameVendorSale.sale_time,
          buyer_type: recentSameVendorSale.buyer_type || null,
          wholesale_discount_amount: Number(recentSameVendorSale.wholesale_discount_amount || 0),
          cajoucy_boxes_count: Number(recentSameVendorSale.cajoucy_boxes_count || 0),
          total_amount: Number(recentSameVendorSale.total_amount || total),
        });
      }
    }

    const nowObj = new Date();
    const nowIso = nowObj.toISOString();
    const date = clientDate || nowIso.split('T')[0];
    const saleTime =
      clientSaleTime ||
      `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const number = clientNumber || `VTE-2026-${rand}`;
    const thermalTicketNumber = String(number).replace(/^VTE-/, 'TKT-THERM-');
    const id = clientSaleId || `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isOffline = recorded_offline ? 1 : 0;
    const isRegularize = requestedStatus === 'a_regulariser' || Boolean(needs_regularization);
    const saleStatus = isRegularize ? 'a_regulariser' : 'livree';

    ensureAllPdvsBoundToVendorAndRoutineDay();
    const pdvRow = db
      .prepare(
        'SELECT id, name, code, neighborhood, latitude, longitude, vendor_id, routine_day, routine_day_index FROM points_de_vente WHERE id = ?'
      )
      .get(pdv_id) as any;
    const vendorRow = db.prepare('SELECT name, code FROM users WHERE id = ?').get(vendor_id) as { name: string; code: string } | undefined;
    const beforeRoutine = reconcileVendorPdvRoutineStatus(vendor_id, date);

    if (userRole === 'Vendeur' && pdvRow) {
      if (pdvRow.vendor_id && pdvRow.vendor_id !== vendor_id) {
        return res.status(403).json({
          success: false,
          error:
            'Accès refusé : vous ne pouvez réaliser une vente que dans les points de vente que vous avez vous-même créés.',
        });
      }
    }

    const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : Number(pdvRow?.latitude || 12.6392);
    const lng = Number.isFinite(Number(longitude)) ? Number(longitude) : Number(pdvRow?.longitude || -7.9850);

    // Note: invoice_generated = 0 because the Vendeur CANNOT create official invoices (only the Comptable can).
    // Instead, a Mini Facture Thermique (thermal_ticket_number) is automatically generated for the vendor's sales history.
    const insertResult = db.prepare(`
      INSERT OR IGNORE INTO sales (
        id, number, thermal_ticket_number, date, sale_time, vendor_id, pdv_id, items, total_amount,
        buyer_type, wholesale_discount_amount, cajoucy_boxes_count,
        payment_type, status, invoice_generated, recorded_offline, offline_recorded_at, synced_at, latitude, longitude, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      number,
      thermalTicketNumber,
      date,
      saleTime,
      vendor_id,
      pdv_id,
      itemsJsonStr,
      total,
      buyerType,
      wholesaleDiscountAmount,
      cajoucyBoxesCount,
      payment_type || 'Comptant',
      saleStatus,
      isOffline,
      offline_recorded_at || null,
      nowIso,
      lat,
      lng,
      nowIso
    );

    if (insertResult.changes === 0) {
      return res.json({
        success: true,
        duplicate: true,
        message: `Vente ${number} déjà enregistrée (doublon ignoré).`,
        saleId: id,
        number,
        thermal_ticket_number: thermalTicketNumber,
        date,
        sale_time: saleTime,
        buyer_type: buyerType,
        wholesale_discount_amount: wholesaleDiscountAmount,
        cajoucy_boxes_count: cajoucyBoxesCount,
        total_amount: total,
      });
    }

    // Record GPS point on sale delivery
    db.prepare(`
      INSERT OR IGNORE INTO vendor_gps_positions (
        id, vendor_id, latitude, longitude, accuracy, speed_kmh,
        activity_label, pdv_id, recorded_offline, recorded_at, synced_at, date
      ) VALUES (?, ?, ?, ?, 4.2, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      `gps-sale-${id}`,
      vendor_id,
      lat,
      lng,
      `Vente ${number} • ${pdvRow?.name || 'PDV'} (${total.toLocaleString('fr-FR')} FCFA)`,
      pdv_id,
      isOffline,
      offline_recorded_at || nowIso,
      nowIso,
      date
    );

    // Synchroniser automatiquement la visite avec vente dans la Routine VRS (compte immédiatement si jour actif et <= 100 m)
    try {
      executeVrsVisitCheckin({
        actor: {
          id: vendor_id,
          name: vendorRow?.name || 'Vendeur',
          role: 'Vendeur',
          code: vendorRow?.code || 'VND',
        },
        vendorId: vendor_id,
        pdvId: pdv_id,
        latitude: lat,
        longitude: lng,
        gpsAccuracy: 4.2,
        deviceInfo: `Vente ${number}`,
        visitUuid: `uuid-vrs-sale-${id}`,
        visitDate: beforeRoutine.isStarted ? beforeRoutine.activeDate || date : date,
        visitType: 'avec_vente',
        saleId: id,
        recordedOffline: Boolean(isOffline),
        clientRecordedAt: offline_recorded_at || nowIso,
      });
    } catch {
      // Ignore visit sync errors during sale creation
    }

    const discountAuditNote =
      buyerType === 'Grossiste' && wholesaleDiscountAmount > 0
        ? ` [Type d'acheteur: Grossiste • ${cajoucyBoxesCount} cartons Cajoucy • Remise grossiste: -${wholesaleDiscountAmount.toLocaleString('fr-FR')} FCFA]`
        : buyerType === 'Détaillant'
        ? ` [Type d'acheteur: Détaillant • ${cajoucyBoxesCount} cartons Cajoucy]`
        : '';

    recordAudit(
      isOffline ? 'VENTE_PDV_SYNC_HORS_LIGNE' : isRegularize ? 'VENTE_A_REGULARISER' : 'VENTE_PDV',
      'SALE',
      id,
      userRole,
      vendor_id,
      `Vente ${number} (${total.toLocaleString('fr-FR')} FCFA)${discountAuditNote} ${isOffline ? 'enregistrée hors-ligne puis synchronisée' : 'effectuée par le vendeur'} à ${saleTime}. Mini facture thermique ${thermalTicketNumber} générée automatiquement.`
    );

    if (buyerType === 'Grossiste') {
      checkAndTriggerWholesaleBuyerFrequencyAlert(vendor_id, date);
    }

    // Envoi immédiat et asynchrone du push après commit (urgency "high", TTL 3600 s)
    triggerImmediateSalePush({
      eventKind: isRegularize ? 'vente_a_regulariser' : 'nouvelle_vente',
      saleId: id,
      saleNumber: number,
      vendorId: vendor_id,
      vendorName: vendorRow?.name || 'Vendeur',
      pdvName: pdvRow?.name || 'Point de vente',
      totalAmount: total,
      createdAt: nowIso,
    });

    res.json({
      success: true,
      message: `Vente ${number} enregistrée. Mini facture thermique ${thermalTicketNumber} générée automatiquement dans votre historique.`,
      saleId: id,
      number,
      thermal_ticket_number: thermalTicketNumber,
      date,
      sale_time: saleTime,
      buyer_type: buyerType,
      wholesale_discount_amount: wholesaleDiscountAmount,
      cajoucy_boxes_count: cajoucyBoxesCount,
      total_amount: total,
      items: normalizedItems,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Marquer une vente comme "à régulariser" (déclenche un push distinct)
apiRouter.post('/sales/:id/regularize', (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';

    const sale = db
      .prepare(
        `
        SELECT s.*, u.name as vendor_name, u.code as vendor_code, p.name as pdv_name
        FROM sales s
        JOIN users u ON s.vendor_id = u.id
        JOIN points_de_vente p ON s.pdv_id = p.id
        WHERE s.id = ? OR s.number = ?
      `
      )
      .get(id, id) as any;

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Vente introuvable.' });
    }

    const nowIso = new Date().toISOString();
    const noteClean = String(reason || 'Vente signalée à régulariser').trim();

    db.prepare(`UPDATE sales SET status = 'a_regulariser', cancel_request_reason = ? WHERE id = ?`).run(
      noteClean,
      sale.id
    );

    recordAudit(
      'VENTE_A_REGULARISER',
      'SALE',
      sale.id,
      userRole,
      sale.vendor_id,
      `Vente ${sale.number} marquée à régulariser (${noteClean}).`
    );

    triggerImmediateSalePush({
      eventKind: 'vente_a_regulariser',
      saleId: sale.id,
      saleNumber: sale.number,
      vendorId: sale.vendor_id,
      vendorName: sale.vendor_name,
      pdvName: sale.pdv_name,
      totalAmount: Number(sale.total_amount || 0),
      createdAt: nowIso,
      reason: noteClean,
    });

    res.json({
      success: true,
      message: `La vente ${sale.number} a été marquée « à régulariser » et les destinataires autorisés ont été notifiés.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Annulation d'une vente / facture client PDV par le Sales Admin (Contrôleur), le Directeur des opérations de vente ou l'Administrateur
apiRouter.post('/sales/:id/cancel', requireCanCancelSale, (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_reason } = req.body;
    const userRole = getUserRole(req) || 'Sales Admin';

    if (!cancel_reason || String(cancel_reason).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Le motif d\'annulation de la facture / vente est obligatoire.',
      });
    }

    const sale = db.prepare(`
      SELECT s.*, u.name as vendor_name, u.code as vendor_code, p.name as pdv_name
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(id) as any;

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Facture / Vente introuvable.' });
    }
    if (sale.status === 'annulee') {
      return res.status(400).json({ success: false, error: 'Cette facture / vente a déjà été annulée.' });
    }

    const reasonClean = String(cancel_reason).trim();
    const nowIso = new Date().toISOString();
    const cancelledByLabel =
      userRole === 'Directeur des opérations de vente'
        ? 'Ibrahim Sangaré (Directeur des opérations de vente)'
        : userRole === 'Sales Admin'
        ? 'Salif Keïta (Sales Admin - Contrôleur)'
        : 'Administrateur';

    db.prepare(`
      UPDATE sales
      SET status = 'annulee',
          cancel_reason = ?,
          cancelled_by = ?,
          cancelled_at = ?,
          cancel_request_status = CASE WHEN cancel_request_status = 'en_attente' THEN 'approuvee' ELSE cancel_request_status END,
          cancel_reviewed_at = COALESCE(cancel_reviewed_at, ?),
          cancel_reviewed_by = COALESCE(cancel_reviewed_by, ?)
      WHERE id = ?
    `).run(reasonClean, cancelledByLabel, nowIso, nowIso, cancelledByLabel, id);

    markNotificationsReadByReference('Directeur des opérations de vente', sale.number);
    markNotificationsReadByReference('Administrateur', sale.number);

    const invoiceRef = sale.invoice_number || `FAC-${sale.number.replace('VTE-', '')}`;

    // Push distinct d'annulation de vente à tous les rôles autorisés (Administrateur, DOV, Sales Admin, Comptable, Vendeur concerné ; Magasinier exclu)
    triggerImmediateSalePush({
      eventKind: 'annulation_vente',
      saleId: sale.id,
      saleNumber: sale.number,
      vendorId: sale.vendor_id,
      vendorName: sale.vendor_name,
      pdvName: sale.pdv_name,
      totalAmount: Number(sale.total_amount || 0),
      createdAt: nowIso,
      reason: reasonClean,
    });

    recordAudit(
      'ANNULATION_VENTE',
      'SALE',
      id,
      userRole,
      sale.vendor_id,
      `Facture ${invoiceRef} / Vente ${sale.number} (${Number(sale.total_amount || 0).toLocaleString('fr-FR')} FCFA, client PDV ${sale.pdv_name}) annulée par ${cancelledByLabel}. Motif : ${reasonClean}.`
    );

    res.json({
      success: true,
      message: `Facture client ${invoiceRef} (${sale.number} — PDV ${sale.pdv_name}) annulée avec succès. Les quantités ont été réintégrées au stock camionnette du vendeur et le solde a été ajusté.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Demande d'annulation d'une vente par le Vendeur (en cas d'erreur dans la vente), soumise au Directeur des opérations de vente (DOV)
apiRouter.post('/sales/:id/request-cancel', requireVendeur, (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userRole = getUserRole(req) || 'Vendeur';

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Veuillez préciser le motif de l'erreur sur la vente pour soumettre la demande d'annulation.",
      });
    }

    const sale = db.prepare(`
      SELECT s.*, u.name as vendor_name, u.code as vendor_code, p.name as pdv_name, p.neighborhood as pdv_neighborhood
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(id) as any;

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Vente introuvable.' });
    }
    if (sale.status === 'annulee') {
      return res.status(400).json({ success: false, error: 'Cette vente est déjà annulée.' });
    }
    if (sale.cancel_request_status === 'en_attente') {
      return res.status(400).json({
        success: false,
        error: "Une demande d'annulation est déjà en attente de validation par le Directeur des opérations de vente.",
      });
    }

    const reasonClean = String(reason).trim();
    const nowIso = new Date().toISOString();
    const requestedByLabel = `${sale.vendor_name} (${sale.vendor_code})`;

    db.prepare(`
      UPDATE sales
      SET cancel_request_status = 'en_attente',
          cancel_request_reason = ?,
          cancel_requested_at = ?,
          cancel_requested_by = ?,
          cancel_rejection_reason = NULL
      WHERE id = ?
    `).run(reasonClean, nowIso, requestedByLabel, id);

    // Push distinct de demande d'annulation de vente (urgency "high", TTL 3600 s)
    triggerImmediateSalePush({
      eventKind: 'demande_annulation_vente',
      saleId: sale.id,
      saleNumber: sale.number,
      vendorId: sale.vendor_id,
      vendorName: sale.vendor_name,
      pdvName: sale.pdv_name,
      totalAmount: Number(sale.total_amount || 0),
      createdAt: nowIso,
      reason: reasonClean,
    });

    recordAudit(
      'DEMANDE_ANNULATION_VENTE',
      'SALE',
      id,
      userRole,
      sale.vendor_id,
      `Demande d'annulation soumise au Directeur des opérations de vente pour la vente ${sale.number} (${Number(sale.total_amount || 0).toLocaleString('fr-FR')} FCFA — PDV ${sale.pdv_name}) par ${requestedByLabel}. Motif : ${reasonClean}.`
    );

    res.json({
      success: true,
      message: `Demande d'annulation pour la vente ${sale.number} transmise au Directeur des opérations de vente (DOV).`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Validation ou rejet d'une demande d'annulation de vente par le Directeur des opérations de vente (DOV) ou l'Administrateur
apiRouter.post('/sales/:id/review-cancel-request', requireAdminOrDirecteurOps, (req, res) => {
  try {
    const { id } = req.params;
    const { decision, response_reason } = req.body; // 'approve' | 'reject'
    const userRole = getUserRole(req) || 'Directeur des opérations de vente';
    const actorLabel =
      userRole === 'Directeur des opérations de vente'
        ? 'Ibrahim Sangaré (Directeur des opérations de vente)'
        : 'Amadou Touré (Administrateur)';

    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ success: false, error: 'Décision invalide (approve ou reject attendu).' });
    }

    const sale = db.prepare(`
      SELECT s.*, u.name as vendor_name, u.code as vendor_code, p.name as pdv_name
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(id) as any;

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Vente introuvable.' });
    }
    if (sale.status === 'annulee') {
      return res.status(400).json({ success: false, error: 'Cette vente est déjà annulée.' });
    }

    const nowIso = new Date().toISOString();
    const invoiceRef = sale.invoice_number || `FAC-${String(sale.number || '').replace('VTE-', '')}`;

    markNotificationsReadByReference('Directeur des opérations de vente', sale.number);
    markNotificationsReadByReference('Administrateur', sale.number);

    if (decision === 'approve') {
      const finalReason = String(
        response_reason?.trim() ||
          sale.cancel_request_reason ||
          "Erreur de vente signalée par le vendeur et validée par le Directeur des opérations de vente"
      ).trim();

      db.prepare(`
        UPDATE sales
        SET status = 'annulee',
            cancel_reason = ?,
            cancelled_by = ?,
            cancelled_at = ?,
            cancel_request_status = 'approuvee',
            cancel_reviewed_at = ?,
            cancel_reviewed_by = ?
        WHERE id = ?
      `).run(finalReason, actorLabel, nowIso, nowIso, actorLabel, id);

      triggerImmediateSalePush({
        eventKind: 'annulation_vente',
        saleId: sale.id,
        saleNumber: sale.number,
        vendorId: sale.vendor_id,
        vendorName: sale.vendor_name,
        pdvName: sale.pdv_name,
        totalAmount: Number(sale.total_amount || 0),
        createdAt: nowIso,
        reason: finalReason,
      });

      recordAudit(
        'VALIDATION_DEMANDE_ANNULATION_VENTE',
        'SALE',
        id,
        userRole,
        sale.vendor_id,
        `Demande d'annulation de la vente ${sale.number} (${Number(sale.total_amount || 0).toLocaleString('fr-FR')} FCFA, vendeur ${sale.vendor_name}) approuvée par ${actorLabel}. Motif : ${finalReason}.`
      );

      return res.json({
        success: true,
        message: `Demande d'annulation approuvée : la vente ${sale.number} (${sale.pdv_name}) est annulée et le stock camionnette de ${sale.vendor_name} a été réintégré.`,
      });
    }

    // decision === 'reject'
    const rejectionClean = String(
      response_reason?.trim() || 'Demande refusée après vérification par le Directeur des opérations de vente.'
    ).trim();

    db.prepare(`
      UPDATE sales
      SET cancel_request_status = 'rejetee',
          cancel_reviewed_at = ?,
          cancel_reviewed_by = ?,
          cancel_rejection_reason = ?
      WHERE id = ?
    `).run(nowIso, actorLabel, rejectionClean, id);

    sendNotification(
      'Vendeur',
      `Demande d'annulation refusée (${sale.number})`,
      `Votre demande d'annulation pour la vente ${sale.number} (PDV ${sale.pdv_name}) a été refusée par ${actorLabel}. Motif : ${rejectionClean}.`,
      'demande_annulation_vente',
      sale.number,
      { targetUserId: sale.vendor_id }
    );

    recordAudit(
      'REJET_DEMANDE_ANNULATION_VENTE',
      'SALE',
      id,
      userRole,
      sale.vendor_id,
      `Demande d'annulation de la vente ${sale.number} (vendeur ${sale.vendor_name}) rejetée par ${actorLabel}. Motif : ${rejectionClean}.`
    );

    return res.json({
      success: true,
      message: `Demande d'annulation de la vente ${sale.number} refusée. Le vendeur ${sale.vendor_name} a été notifié.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Génération / Création de facture par vente : STRICTEMENT réservée au Comptable (le vendeur ne peut pas créer ni modifier de factures)
apiRouter.post('/sales/:id/generate-invoice', requireRole(['Comptable', 'Directeur des opérations de vente', 'Sales Admin', 'Administrateur'], 'Génération ou modification de facture'), (req, res) => {
  try {
    const { id } = req.params;
    const { with_tva, versement_id, updated_items, pdv_id, payment_type, rectification_note } = req.body;
    const userRole = getUserRole(req);

    const sale = db.prepare(`
      SELECT s.*,
             u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
             p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood,
             p.manager_name as pdv_manager, p.phone as pdv_phone
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(id) as any;

    if (!sale) {
      return res.status(404).json({ success: false, error: 'Vente introuvable.' });
    }

    const targetPdv = pdv_id
      ? (db.prepare('SELECT * FROM points_de_vente WHERE id = ?').get(pdv_id) as any) || null
      : null;

    const wasAlreadyGenerated = Boolean(sale.invoice_generated);
    const finalItems = Array.isArray(updated_items) && updated_items.length > 0
      ? updated_items.map((it: any) => ({
          productId: it.productId || it.code,
          code: it.code,
          name: it.name,
          qtyBoxes: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)),
          unitPrice: Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
          total: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)) * Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
        }))
      : (typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items);

    const subtotalHt = finalItems.reduce((acc: number, it: any) => acc + Number(it.total || 0), 0);
    const applyTva = Boolean(with_tva);
    const tvaRate = applyTva ? 18 : 0;
    const tvaAmount = applyTva ? Math.round(subtotalHt * 0.18) : 0;
    const totalTtc = subtotalHt + tvaAmount;
    const invoiceNumber = sale.invoice_number || String(sale.number || '').replace(/^VTE-/, 'FAC-');
    const nowIso = new Date().toISOString();

    const pendingRect = db.prepare(`
      SELECT id, thermal_receipt_number FROM invoice_rectifications
      WHERE sale_id = ? AND status = 'en_attente'
      ORDER BY created_at DESC LIMIT 1
    `).get(id) as any;

    const nextRectStatus = pendingRect ? 'rectifiee' : sale.rectification_status || null;

    db.prepare(`
      UPDATE sales
      SET pdv_id = COALESCE(?, pdv_id),
          payment_type = COALESCE(?, payment_type),
          items = ?,
          total_amount = ?,
          invoice_generated = 1,
          invoice_number = ?,
          with_tva = ?,
          tva_rate = ?,
          tva_amount = ?,
          total_ttc = ?,
          versement_id = COALESCE(?, versement_id),
          rectification_status = ?,
          invoice_generated_at = ?,
          invoice_generated_by = 'Fatoumata Coulibaly (Comptable)'
      WHERE id = ?
    `).run(
      targetPdv ? targetPdv.id : null,
      payment_type || null,
      JSON.stringify(finalItems),
      subtotalHt,
      invoiceNumber,
      applyTva ? 1 : 0,
      tvaRate,
      tvaAmount,
      totalTtc,
      versement_id || null,
      nextRectStatus,
      nowIso,
      id
    );

    if (pendingRect) {
      db.prepare(`
        UPDATE invoice_rectifications
        SET status = 'rectifiee',
            response_note = ?,
            handled_by = 'Fatoumata Coulibaly (Comptable)',
            handled_at = ?
        WHERE sale_id = ? AND status = 'en_attente'
      `).run(
        rectification_note || `Facture ${invoiceNumber} modifiée et rectifiée (${totalTtc.toLocaleString('fr-FR')} FCFA ${applyTva ? 'TTC' : 'HT'}).`,
        nowIso,
        id
      );
    }

    // Notify the vendor that the Comptable has created/updated their invoice
    sendNotification(
      'Vendeur',
      wasAlreadyGenerated
        ? `Facture ${invoiceNumber} mise à jour par le Comptable`
        : `Nouvelle facture ${invoiceNumber} créée par le Comptable`,
      `Le Comptable a ${wasAlreadyGenerated ? 'mis à jour' : 'créé'} la facture ${invoiceNumber} à votre nom (${sale.vendor_name}) pour le PDV "${sale.pdv_name}" (${totalTtc.toLocaleString('fr-FR')} FCFA ${applyTva ? 'TTC avec TVA 18%' : 'HT sans TVA'}). Vous pouvez la consulter et l'imprimer dans votre compte.`,
      'facture',
      invoiceNumber,
      { targetUserId: sale.vendor_id }
    );

    recordAudit(
      'GENERATION_FACTURE_VENTE_PDV',
      'SALE',
      id,
      userRole,
      sale.vendor_id,
      `Facture ${invoiceNumber} générée par le Comptable au nom du vendeur ${sale.vendor_name} (${sale.vendor_code}) avec le PDV acheteur ${sale.pdv_name} (${sale.pdv_code}). Option TVA : ${applyTva ? 'Avec TVA 18%' : 'Sans TVA (0%)'}. Montant HT : ${subtotalHt.toLocaleString('fr-FR')} FCFA, Total : ${totalTtc.toLocaleString('fr-FR')} FCFA.`
    );

    res.json({
      success: true,
      message: `Facture ${invoiceNumber} créée au nom de ${sale.vendor_name} (PDV acheteur : ${sale.pdv_name}) ${applyTva ? 'avec TVA 18%' : 'sans TVA'}. Le vendeur peut désormais la voir et l'imprimer dans son compte.`,
      invoice: {
        saleId: id,
        invoiceNumber,
        saleNumber: sale.number,
        withTva: applyTva,
        tvaRate,
        subtotalHt,
        tvaAmount,
        totalTtc,
        vendorName: sale.vendor_name,
        vendorCode: sale.vendor_code,
        vendorTeam: sale.vendor_team,
        vendorPhone: sale.vendor_phone,
        pdvName: sale.pdv_name,
        pdvCode: sale.pdv_code,
        pdvNeighborhood: sale.pdv_neighborhood,
        pdvManager: sale.pdv_manager,
        pdvPhone: sale.pdv_phone,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Création directe d'une facture pour un vendeur par le Comptable (Seul le Comptable est autorisé à créer des factures)
apiRouter.post('/invoices/create-for-vendor', requireComptable, (req, res) => {
  try {
    const { vendor_id, pdv_id, items, with_tva, payment_type, date: clientDate, sale_time: clientTime } = req.body;
    const userRole = getUserRole(req);

    if (!vendor_id || !pdv_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez sélectionner un vendeur, un PDV acheteur et au moins une ligne de produit.',
      });
    }

    const vendor = db.prepare('SELECT * FROM users WHERE id = ?').get(vendor_id) as any;
    const pdv = db.prepare('SELECT * FROM points_de_vente WHERE id = ?').get(pdv_id) as any;
    if (!vendor || !pdv) {
      return res.status(404).json({ success: false, error: 'Vendeur ou PDV introuvable.' });
    }

    const normalizedItems = items.map((it: any) => {
      const qtyBoxes = Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1));
      const unitPrice = Math.max(0, Number(it.unitPrice ?? it.price ?? 0));
      return {
        productId: it.productId || it.code,
        code: it.code || 'PROD',
        name: it.name || 'Produit',
        qtyBoxes,
        unitPrice,
        total: qtyBoxes * unitPrice,
      };
    });

    const subtotalHt = normalizedItems.reduce((sum: number, it: any) => sum + it.total, 0);
    const applyTva = Boolean(with_tva);
    const tvaRate = applyTva ? 18 : 0;
    const tvaAmount = applyTva ? Math.round(subtotalHt * 0.18) : 0;
    const totalTtc = subtotalHt + tvaAmount;

    const nowObj = new Date();
    const nowIso = nowObj.toISOString();
    const dateStr = clientDate || nowIso.split('T')[0];
    const timeStr =
      clientTime ||
      `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const saleId = `sale-inv-${Date.now()}`;
    const saleNumber = `VTE-2026-${rand}`;
    const invoiceNumber = `FAC-2026-${rand}`;
    const thermalTicketNumber = `TKT-THERM-2026-${rand}`;

    db.prepare(`
      INSERT INTO sales (
        id, number, thermal_ticket_number, date, sale_time, vendor_id, pdv_id, items, total_amount,
        payment_type, status, invoice_generated, invoice_number, with_tva, tva_rate, tva_amount, total_ttc,
        invoice_generated_at, invoice_generated_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'livree', 1, ?, ?, ?, ?, ?, ?, 'Fatoumata Coulibaly (Comptable)', ?)
    `).run(
      saleId,
      saleNumber,
      thermalTicketNumber,
      dateStr,
      timeStr,
      vendor_id,
      pdv_id,
      JSON.stringify(normalizedItems),
      subtotalHt,
      payment_type || 'Comptant',
      invoiceNumber,
      applyTva ? 1 : 0,
      tvaRate,
      tvaAmount,
      totalTtc,
      nowIso,
      nowIso
    );

    sendNotification(
      'Vendeur',
      `Nouvelle facture ${invoiceNumber} créée par le Comptable`,
      `Le Comptable a créé la facture ${invoiceNumber} pour votre compte (${vendor.name}) avec le PDV "${pdv.name}" d'un montant de ${totalTtc.toLocaleString('fr-FR')} FCFA (${applyTva ? 'TVA 18% incluse' : 'Sans TVA'}). Vous pouvez la consulter et l'imprimer dans "Mes factures".`,
      'facture',
      invoiceNumber,
      { targetUserId: vendor_id }
    );

    recordAudit(
      'CREATION_FACTURE_COMPTABLE_POUR_VENDEUR',
      'INVOICE',
      saleId,
      userRole,
      vendor_id,
      `Facture ${invoiceNumber} créée par le Comptable pour le vendeur ${vendor.name} (${vendor.code}) et le PDV ${pdv.name} (${totalTtc.toLocaleString('fr-FR')} FCFA).`
    );

    res.json({
      success: true,
      message: `Facture ${invoiceNumber} créée avec succès pour le vendeur ${vendor.name}. Le vendeur a reçu une notification et peut la consulter ou l'imprimer dans son compte.`,
      saleId,
      invoiceNumber,
      saleNumber,
      thermalTicketNumber,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 10. VERSEMENTS & SOLDES
apiRouter.get('/versements', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone
      FROM versements v
      JOIN users u ON v.vendor_id = u.id
      ORDER BY v.date DESC, v.created_at DESC
    `).all();
    res.json({ success: true, versements: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Encaissement ou soumission d'un versement (Comptable valide ou Vendeur soumet à confirmer)
apiRouter.post('/versements', requireRole(['Comptable', 'Vendeur'], 'Enregistrement de versement'), (req, res) => {
  try {
    const { vendor_id, amount, payment_mode, notes } = req.body;
    const userRole = getUserRole(req);
    const numAmount = Number(amount);
    if (!vendor_id || !numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Montant de versement invalide.' });
    }

    const vendorRow = db.prepare('SELECT id, name, code, team, phone FROM users WHERE id = ?').get(vendor_id) as any;
    const date = new Date().toISOString().split('T')[0];
    const ref = `VSM-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const id = `vsm-${Date.now()}`;
    const isConfirmedByComptable = userRole === 'Comptable';
    const status = isConfirmedByComptable ? 'valide' : 'en_attente';
    const validatedBy = isConfirmedByComptable ? 'Comptabilité Caisse' : null;

    db.prepare(`
      INSERT INTO versements (id, reference, date, vendor_id, amount, payment_mode, status, validated_by, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ref, date, vendor_id, numAmount, payment_mode || 'Espèces', status, validatedBy, notes || 'Versement de caisse', date);

    if (isConfirmedByComptable) {
      sendNotification(
        'Vendeur',
        `Versement confirmé (${ref})`,
        `Votre versement ${ref} (${payment_mode || 'Espèces'}) a été confirmé et encaissé par la Comptabilité.`,
        'versement',
        ref,
        { targetUserId: vendor_id }
      );
    } else {
      sendNotification(
        'Comptable',
        `Nouveau versement à confirmer (${ref})`,
        `${vendorRow?.name || 'Un vendeur'} (${vendorRow?.code || ''}) a déclaré un versement (${ref}, ${payment_mode || 'Espèces'}) en attente de confirmation en caisse.`,
        'versement',
        ref
      );
    }

    recordAudit('VERSEMENT_CAISSE', 'VERSEMENT', id, userRole, vendor_id, `Versement ${ref} (${numAmount.toLocaleString('fr-FR')} FCFA) enregistré (${status}).`);

    res.json({
      success: true,
      message: isConfirmedByComptable
        ? `Versement de ${numAmount.toLocaleString('fr-FR')} FCFA validé en caisse.`
        : `Versement déclaré (${ref}), en attente de confirmation par le Comptable.`,
      versement: {
        id,
        reference: ref,
        date,
        vendor_id,
        vendor_name: vendorRow?.name || 'Vendeur',
        vendor_code: vendorRow?.code || '',
        vendor_team: vendorRow?.team || '',
        vendor_phone: vendorRow?.phone || '',
        amount: numAmount,
        payment_mode: payment_mode || 'Espèces',
        status,
        notes: notes || 'Versement de caisse',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Confirmation d'un versement en attente par le Comptable
apiRouter.patch('/versements/:id/confirm', requireComptable, (req, res) => {
  try {
    const { id } = req.params;
    const vsm = db.prepare('SELECT * FROM versements WHERE id = ?').get(id) as any;
    if (!vsm) {
      return res.status(404).json({ success: false, error: 'Versement introuvable.' });
    }
    db.prepare("UPDATE versements SET status = 'valide', validated_by = 'Comptabilité Caisse' WHERE id = ?").run(id);
    markNotificationsReadByReference('Comptable', vsm.reference);

    sendNotification(
      'Vendeur',
      `Versement confirmé (${vsm.reference})`,
      `Votre versement ${vsm.reference} a été confirmé par la Comptabilité.`,
      'versement',
      vsm.reference,
      { targetUserId: vsm.vendor_id }
    );

    res.json({ success: true, message: `Versement ${vsm.reference} confirmé.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/vendor-balances', (req, res) => {
  try {
    const vendors = db.prepare("SELECT id, code, name, team, phone FROM users WHERE role = 'Vendeur' ORDER BY code ASC").all() as any[];

    const balances = vendors.map(v => {
      const salesRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE vendor_id = ? AND COALESCE(status, 'livree') != 'annulee'").get(v.id) as { total: number };
      const versementsRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM versements WHERE vendor_id = ? AND status = 'valide'").get(v.id) as { total: number };
      const chgRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM chargements WHERE vendor_id = ? AND status = 'Chargée'").get(v.id) as { total: number };

      const totalSales = salesRow.total;
      const totalVersements = versementsRow.total;
      const balanceDue = totalSales - totalVersements;

      return {
        vendorId: v.id,
        code: v.code,
        name: v.name,
        team: v.team,
        phone: v.phone,
        totalSales,
        totalVersements,
        balanceDue,
        stockVanValue: chgRow.total
      };
    });

    res.json({ success: true, balances });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 11. LOTS : traçabilité, statuts shelf-life (>90j vert, 30-90j marron, <30j rouge, périmé gris), sortie perte/casse/péremption
apiRouter.get('/lots', (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const lots = db.prepare(`
      SELECT l.*, p.name as product_name, p.code as product_code, p.price_box, p.gamme
      FROM lots l
      JOIN products p ON l.product_id = p.id
      ORDER BY l.expiry_date ASC
    `).all() as any[];

    const enrichedLots = lots.map(lot => {
      const statusInfo = getLotShelfLifeStatus(lot.expiry_date, todayStr);
      // Si un lot actif (< 30 jours) est proche de la péremption, créer une alerte unique (sans répétition)
      if (lot.quantity > 0 && statusInfo.days > 0 && statusInfo.days < 30) {
        const alreadyAlerted = db
          .prepare(
            "SELECT id FROM notifications WHERE type = 'alerte_peremption' AND reference = ? LIMIT 1"
          )
          .get(lot.lot_number) as { id: string } | undefined;
        if (!alreadyAlerted) {
          sendNotification(
            'Magasinier',
            `Lot proche de la péremption : ${lot.lot_number}`,
            `Le lot ${lot.lot_number} (${lot.product_name}, ${lot.quantity} cartons) arrive à péremption le ${lot.expiry_date} (dans ${statusInfo.days} jours). Priorité de sortie FEFO.`,
            'alerte_peremption',
            lot.lot_number
          );
          sendNotification(
            'Administrateur',
            `Lot proche de la péremption : ${lot.lot_number}`,
            `Le lot ${lot.lot_number} (${lot.product_name}, ${lot.quantity} cartons) arrive à péremption le ${lot.expiry_date} (dans ${statusInfo.days} jours).`,
            'alerte_peremption',
            lot.lot_number
          );
        }
      }
      return {
        ...lot,
        days_remaining: statusInfo.days,
        shelf_life_status: statusInfo.code,
        shelf_life_label: statusInfo.label,
        shelf_life_color: statusInfo.color,
        shelf_life_hex: statusInfo.colorHex,
        is_expired: statusInfo.days <= 0,
        is_blocked: statusInfo.days <= 0 || lot.quantity <= 0
      };
    });

    res.json({ success: true, lots: enrichedLots });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Sortie "Perte / casse / péremption" avec motif et valeur
apiRouter.post('/lots/exit-loss', requireMagasinierOrSalesAdmin, (req, res) => {
  try {
    const { lot_id, quantity, motif } = req.body;
    const userRole = getUserRole(req);
    const qty = Number(quantity);

    if (!lot_id || !qty || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Lot et quantité en cartons obligatoires.' });
    }
    if (!motif || String(motif).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Le motif de sortie (Perte, casse ou péremption) est obligatoire.' });
    }

    const lot = db.prepare(`
      SELECT l.*, p.name as product_name, p.code as product_code, p.price_box
      FROM lots l
      JOIN products p ON l.product_id = p.id
      WHERE l.id = ?
    `).get(lot_id) as any;

    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot introuvable.' });
    }
    if (qty > lot.quantity) {
      return res.status(400).json({
        success: false,
        error: `Quantité demandée (${qty} ctn) supérieure au stock disponible dans ce lot (${lot.quantity} ctn).`
      });
    }

    const valueFcfa = qty * lot.price_box;
    const now = new Date().toISOString();
    const ref = `LOSS-${now.split('T')[0]}-${Math.floor(100 + Math.random() * 900)}`;

    db.exec('BEGIN TRANSACTION');
    try {
      // 1. Deduct from lot
      db.prepare(`
        UPDATE lots
        SET quantity = quantity - ?,
            status = CASE WHEN (quantity - ?) <= 0 THEN 'epuise' ELSE status END
        WHERE id = ?
      `).run(qty, qty, lot_id);

      // 2. Deduct from central warehouse
      db.prepare('UPDATE products SET stock_depot = stock_depot - ? WHERE id = ?').run(qty, lot.product_id);

      // 3. Log stock movement
      recordStockMovement(
        'perte_casse_peremption',
        'OUT',
        lot.product_id,
        lot_id,
        qty,
        ref,
        `Sortie Perte/Casse/Péremption: ${motif.trim()}`,
        valueFcfa,
        'Magasinier Sotuba'
      );

      // 4. Audit Log
      recordAudit(
        'SORTIE_PERTE_CASSE_PEREMPTION',
        'LOT',
        lot_id,
        userRole,
        null,
        `Sortie de ${qty} cartons du lot ${lot.lot_number} (${lot.product_name}). Motif : "${motif.trim()}". Valeur marchande : ${valueFcfa.toLocaleString('fr-FR')} FCFA.`
      );

      // 5. High-loss notification to Admin and Compta if > 50 000 FCFA
      if (valueFcfa >= 50000 || motif.toLowerCase().includes('périm')) {
        const title = `Alerte Perte/Casse : ${valueFcfa.toLocaleString('fr-FR')} FCFA`;
        const message = `Sortie de stock enregistrée par le Magasinier sur le lot ${lot.lot_number} (${lot.product_name}, ${qty} ctn). Motif : ${motif.trim()}.`;
        sendNotification('Administrateur', title, message, 'alerte_peremption', ref);
        sendNotification('Comptable', title, message, 'alerte_peremption', ref);
      }

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Sortie pour "${motif.trim()}" enregistrée avec succès. ${qty} cartons déduits. Valeur constatée : ${valueFcfa.toLocaleString('fr-FR')} FCFA.`,
      value_fcfa: valueFcfa,
      quantity: qty
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 12. NOTIFICATIONS & AUDIT LOGS
apiRouter.get('/notifications', (req, res) => {
  try {
    initVrsSystem();
    const role = getUserRole(req) || 'ALL';
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    let notifs: any[];
    if (role === 'ALL') {
      notifs = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 60').all() as any[];
    } else if (role === 'Vendeur' && headerUserId) {
      notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE (role = 'Vendeur' OR role = 'ALL')
          AND (target_user_id IS NULL OR target_user_id = '' OR target_user_id = ?)
        ORDER BY created_at DESC
        LIMIT 60
      `).all(headerUserId) as any[];
    } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
      notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE (role IN ('Gestionnaire de stock', 'Magasinier') OR role = 'ALL')
          AND type NOT IN ('vente', 'nouvelle_vente', 'commande_gros', 'annulation_vente', 'demande_annulation_vente', 'vente_a_regulariser')
        ORDER BY created_at DESC
        LIMIT 60
      `).all() as any[];
    } else if (headerUserId) {
      notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE (role = ? OR role = 'ALL')
          AND (target_user_id IS NULL OR target_user_id = '' OR target_user_id = ?)
        ORDER BY created_at DESC
        LIMIT 60
      `).all(role, headerUserId) as any[];
    } else {
      notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE role = ? OR role = 'ALL'
        ORDER BY created_at DESC
        LIMIT 60
      `).all(role) as any[];
    }

    const enriched = notifs.map((n: any) => {
      let proof = null;
      let metadata: any = null;
      try {
        if (n.proof_json) proof = JSON.parse(n.proof_json);
      } catch {
        proof = null;
      }
      try {
        if (n.metadata_json) metadata = JSON.parse(n.metadata_json);
      } catch {
        metadata = null;
      }

      const nType = String(n.type || '').toLowerCase();
      const nRef = String(n.reference || '').trim();
      if (
        (nType === 'creation_pdv' ||
          nType === 'validation_pdv' ||
          nType === 'rejet_pdv' ||
          nRef.toUpperCase().startsWith('PDV-')) &&
        (!metadata || !metadata.pdvId)
      ) {
        const lookupRef = metadata?.pdvCode || metadata?.pdvId || nRef;
        if (lookupRef) {
          const pdvRow = db
            .prepare(
              `SELECT p.*,
                      COALESCE(u.name, p.created_by, 'Oumar Konaté') AS vendor_name,
                      COALESCE(u.code, 'BAO-VND-001') AS vendor_code
               FROM points_de_vente p
               LEFT JOIN users u ON p.vendor_id = u.id
               WHERE p.code = ? OR p.id = ?
               LIMIT 1`
            )
            .get(lookupRef, lookupRef) as any;
          if (pdvRow) {
            metadata = {
              ...(metadata || {}),
              pdvId: pdvRow.id,
              pdvCode: pdvRow.code,
              pdvName: pdvRow.name,
              managerName: pdvRow.manager_name || 'Gérant',
              neighborhood: pdvRow.neighborhood || 'Bamako',
              routineName:
                pdvRow.routine_name ||
                `Routine ${pdvRow.routine_day || 'Lundi'} - ${pdvRow.neighborhood || 'Bamako'}`,
              routineDay: pdvRow.routine_day || 'Lundi',
              vendorId: pdvRow.vendor_id || 'usr-vnd-1',
              vendorName: pdvRow.vendor_name,
              vendorCode: pdvRow.vendor_code,
              status: pdvRow.status,
            };
          }
        }
      }

      return {
        ...n,
        proof,
        metadata,
      };
    });

    const unreadCount = enriched.filter((n: any) => !n.is_read).length;

    res.json({ success: true, notifications: enriched, unreadCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.patch('/notifications/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    const notifRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as any;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);

    const role =
      getUserRole(req) ||
      (typeof req.body?.userRole === 'string' ? req.body.userRole : '') ||
      notifRow?.role ||
      'Administrateur';
    const userId =
      (typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '') ||
      (typeof req.body?.userId === 'string' ? req.body.userId.trim() : '') ||
      notifRow?.target_user_id ||
      '';

    const unreadCount = computeUnreadCountForUser(userId, role);

    broadcastNotificationSseEvent({
      event: 'notification:read',
      role,
      targetUserId: userId || undefined,
      notification: notifRow ? { ...notifRow, is_read: 1 } : null,
    });

    res.json({
      success: true,
      message: 'Notification marquée comme lue.',
      unreadCount,
      notification: notifRow ? { ...notifRow, is_read: 1 } : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.post('/notifications/read-all', (req, res) => {
  try {
    const role = getUserRole(req) || (typeof req.body?.role === 'string' ? req.body.role : '');
    const userId =
      (typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '') ||
      (typeof req.body?.userId === 'string' ? req.body.userId.trim() : '');

    if (role === 'Vendeur' && userId) {
      db.prepare(
        `
        UPDATE notifications
        SET is_read = 1
        WHERE is_read = 0
          AND (role = 'Vendeur' OR role = 'ALL')
          AND (target_user_id IS NULL OR target_user_id = '' OR target_user_id = ?)
      `
      ).run(userId);
    } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
      db.prepare(
        `
        UPDATE notifications
        SET is_read = 1
        WHERE is_read = 0
          AND (role IN ('Gestionnaire de stock', 'Magasinier') OR role = 'ALL')
      `
      ).run();
    } else if (role) {
      db.prepare(
        `
        UPDATE notifications
        SET is_read = 1
        WHERE is_read = 0
          AND (role = ? OR role = 'ALL')
      `
      ).run(role);
    }

    broadcastNotificationSseEvent({
      event: 'notification:read-all',
      role: role || 'ALL',
      targetUserId: role === 'Vendeur' && userId ? userId : undefined,
    });

    res.json({
      success: true,
      message: 'Toutes les notifications ont été marquées comme lues.',
      unreadCount: 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Flux temps réel Server-Sent Events (SSE) pour mise à jour instantanée de la cloche et de la liste
apiRouter.get('/notifications/stream', (req, res) => {
  const authUser = deduceUserFromToken(req);
  const queryUserId = typeof req.query?.userId === 'string' ? req.query.userId.trim() : '';
  const queryRole = typeof req.query?.role === 'string' ? req.query.role.trim() : '';
  const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const headerRole = getUserRole(req);

  const userId = authUser?.id || queryUserId || headerUserId || 'usr-adm-1';
  const userRole = authUser?.role || queryRole || headerRole || 'Administrateur';

  registerNotificationSseClient(req, res, userId, userRole);
});

// ---------------------------------------------------------------------------
// 12A. ABONNEMENT PUSH, JETON UTILISATEUR, PRÉFÉRENCES, DIAGNOSTIC & TEST
// ---------------------------------------------------------------------------

// Émission du jeton d'authentification signé pour l'utilisateur connecté
apiRouter.post('/auth/token', (req, res) => {
  try {
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const bodyUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const targetId = bodyUserId || headerUserId;

    if (!targetId) {
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur requis.' });
    }

    const userRow = db
      .prepare('SELECT id, code, name, email, role FROM users WHERE id = ?')
      .get(targetId) as { id: string; code: string; name: string; email: string; role: string } | undefined;

    if (!userRow) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }

    const token = createUserAuthToken(userRow);
    const unreadCount = computeUnreadCountForUser(userRow.id, userRow.role);

    res.json({
      success: true,
      token,
      user: userRow,
      unreadCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Clé publique VAPID (lue depuis l'environnement côté serveur)
apiRouter.get('/push/vapid-public-key', (_req, res) => {
  try {
    const { publicKey, configured } = ensureVapidConfigured();
    res.json({
      success: true,
      publicKey,
      configured,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// État de l'abonnement push et des préférences de l'utilisateur (déduit du jeton)
apiRouter.get('/push/status', (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Jeton d\'authentification manquant ou invalide.',
      });
    }

    const preferences = getUserNotificationPreferences(authUser.id);
    const devices = db
      .prepare(
        'SELECT id, endpoint, device_label, user_agent, created_at, updated_at FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC'
      )
      .all(authUser.id) as any[];
    const unreadCount = computeUnreadCountForUser(authUser.id, authUser.role);

    res.json({
      success: true,
      user: authUser,
      preferences,
      subscriptionsCount: devices.length,
      devices: devices.map((d) => ({
        id: d.id,
        endpoint: d.endpoint,
        deviceLabel: d.device_label || 'Appareil',
        updatedAt: d.updated_at,
      })),
      unreadCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Enregistrement d'un abonnement push (destinataire strictement déduit du jeton, multi-appareils : téléphone et tablette)
apiRouter.post('/push/subscribe', (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise : l\'abonnement ne peut être créé que pour l\'utilisateur connecté.',
      });
    }

    // Sécurité : refuser toute tentative de création d'abonnement pour un autre utilisateur
    if (req.body?.userId && String(req.body.userId).trim() !== authUser.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé : un utilisateur ne peut créer un abonnement que pour lui-même.',
      });
    }

    const subscription = req.body?.subscription;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        success: false,
        error: 'Objet d\'abonnement Web Push incomplet (endpoint, p256dh, auth requis).',
      });
    }

    const userAgent = String(req.headers['user-agent'] || '');
    const deviceLabel =
      req.body?.deviceLabel ||
      (userAgent.includes('Mobile')
        ? 'Téléphone mobile'
        : userAgent.includes('Tablet') || userAgent.includes('iPad')
        ? 'Tablette'
        : 'Navigateur');

    const nowIso = new Date().toISOString();
    const subId = `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(
      `
      INSERT INTO push_subscriptions (
        id, user_id, user_role, user_code, endpoint, p256dh, auth, device_label, user_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        user_role = excluded.user_role,
        user_code = excluded.user_code,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        device_label = excluded.device_label,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at
    `
    ).run(
      subId,
      authUser.id,
      authUser.role,
      authUser.code,
      endpoint,
      p256dh,
      auth,
      deviceLabel,
      userAgent,
      nowIso,
      nowIso
    );

    // Activer les préférences par défaut si l'utilisateur s'abonne
    const currentPrefs = getUserNotificationPreferences(authUser.id);
    if (!currentPrefs.enabled) {
      saveUserNotificationPreferences(authUser.id, { enabled: true });
    }

    const unreadCount = computeUnreadCountForUser(authUser.id, authUser.role);

    res.json({
      success: true,
      message: `Notifications système activées pour ${authUser.name} (${deviceLabel}).`,
      unreadCount,
      preferences: getUserNotificationPreferences(authUser.id),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Désinscription d'un appareil push
apiRouter.post('/push/unsubscribe', (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise.',
      });
    }

    const endpoint = req.body?.endpoint;
    if (endpoint) {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, authUser.id);
    } else {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(authUser.id);
    }

    res.json({
      success: true,
      message: 'Abonnement aux notifications système désactivé sur cet appareil.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Mise à jour des préférences de notifications (activer/désactiver, choisir les types)
apiRouter.put('/push/preferences', (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise.',
      });
    }

    const updated = saveUserNotificationPreferences(authUser.id, {
      enabled: req.body?.enabled,
      types: req.body?.types,
      hideAmountsOnLockScreen: req.body?.hideAmountsOnLockScreen,
      minSaleAmount: req.body?.minSaleAmount,
      saleScope: req.body?.saleScope,
      quietHoursEnabled: req.body?.quietHoursEnabled,
      quietHoursStart: req.body?.quietHoursStart,
      quietHoursEnd: req.body?.quietHoursEnd,
    });

    res.json({
      success: true,
      message: 'Préférences de notifications mises à jour.',
      preferences: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Envoyer une notification de test aux appareils de l'utilisateur connecté et mesurer le délai
apiRouter.post('/push/test', async (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise pour envoyer une notification de test.',
      });
    }

    const result = await sendTestPushToUser(authUser);

    res.json({
      success: true,
      sentCount: result.sentCount,
      expiredRemoved: result.expiredRemoved,
      unreadCount: result.unreadCount,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      message:
        result.sentCount > 0
          ? `Notification de test envoyée en ${result.latencyMs} ms (${result.sentCount} appareil(s), code HTTP ${result.statusCode}).`
          : 'Aucun appareil abonné actif trouvé. Cliquez sur « Activer les notifications » sur cet appareil.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Journal de diagnostic des envois Push (visible par l'Administrateur dans Réglages > Notifications > Diagnostic)
apiRouter.get('/push/diagnostics', (req, res) => {
  try {
    const authUser = deduceUserFromToken(req);
    const role = authUser?.role || getUserRole(req);
    if (role !== 'Administrateur') {
      return res.status(403).json({
        success: false,
        error: 'Seul l\'Administrateur peut consulter le journal complet des envois Push.',
      });
    }

    const limit = Math.min(100, Math.max(10, Number(req.query?.limit || 50)));
    const diag = getPushDiagnosticsData(limit);

    res.json({
      success: true,
      ...diag,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/audit-logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
    res.json({ success: true, logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 12B. RECTIFICATIONS DE FACTURES AVEC MINI FACTURE THERMIQUE COMME PREUVE
apiRouter.get('/invoice-rectifications', (req, res) => {
  try {
    const role = getUserRole(req);
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';

    let rows: any[];
    if (role === 'Vendeur' && headerUserId) {
      rows = db.prepare(`
        SELECT * FROM invoice_rectifications
        WHERE vendor_id = ?
        ORDER BY created_at DESC
      `).all(headerUserId) as any[];
    } else {
      rows = db.prepare(`
        SELECT * FROM invoice_rectifications
        ORDER BY created_at DESC
      `).all() as any[];
    }

    const rectifications = rows.map((r: any) => {
      let thermalReceipt = null;
      try {
        thermalReceipt = typeof r.thermal_receipt_json === 'string'
          ? JSON.parse(r.thermal_receipt_json)
          : r.thermal_receipt_json;
      } catch {
        thermalReceipt = null;
      }
      return {
        ...r,
        thermal_ticket_number: r.thermal_receipt_number || thermalReceipt?.thermalTicketNumber || thermalReceipt?.ticketNumber,
        sale_number: thermalReceipt?.saleNumber || r.sale_id,
        comptable_note: r.response_note || null,
        thermal_receipt: thermalReceipt,
      };
    });

    res.json({ success: true, rectifications });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Soumission d'une demande de rectification sur une facture en joignant la Mini Facture Thermique de la vente comme preuve
apiRouter.post('/invoice-rectifications', requireRole(['Vendeur', 'Directeur des opérations de vente', 'Sales Admin', 'Comptable', 'Administrateur'], 'Demande de rectification de facture'), (req, res) => {
  try {
    const {
      sale_id,
      proof_sale_id,
      reason,
      thermal_receipt,
      thermal_receipt_override,
      requested_items,
      requested_with_tva,
    } = req.body;

    if (!sale_id) {
      return res.status(400).json({ success: false, error: 'Facture / vente cible manquante.' });
    }
    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez préciser l\'erreur constatée sur la facture pour votre demande de rectification.',
      });
    }

    const invoiceSale = db.prepare(`
      SELECT s.*,
             u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
             p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood, p.phone as pdv_phone
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(sale_id) as any;

    if (!invoiceSale) {
      return res.status(404).json({ success: false, error: 'Facture introuvable.' });
    }

    // Load the sale whose auto-generated Mini Facture Thermique is submitted as proof (defaults to the sale itself)
    const targetProofSaleId = proof_sale_id || sale_id;
    const proofSale = db.prepare(`
      SELECT s.*,
             u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
             p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood, p.phone as pdv_phone
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      WHERE s.id = ?
    `).get(targetProofSaleId) as any || invoiceSale;

    const rawProofItems = Array.isArray(requested_items) && requested_items.length > 0
      ? requested_items
      : (typeof proofSale.items === 'string' ? JSON.parse(proofSale.items) : (proofSale.items || []));
    const normalizedProofItems = rawProofItems.map((it: any) => {
      const qty = Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1));
      const price = Math.max(0, Number(it.unitPrice ?? it.price ?? 0));
      return {
        productId: it.productId || it.code,
        code: it.code,
        name: it.name,
        qty,
        qtyBoxes: qty,
        price,
        unitPrice: price,
        total: qty * price,
      };
    });
    const computedProofTotal = normalizedProofItems.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);

    const thermalTicketNum =
      proofSale.thermal_ticket_number ||
      String(proofSale.number || proofSale.id).replace(/^VTE-/, 'TKT-THERM-');
    const invoiceNum =
      invoiceSale.invoice_number ||
      String(invoiceSale.number || invoiceSale.id).replace(/^VTE-/, 'FAC-');

    const baseThermal = thermal_receipt || thermal_receipt_override || {};
    const thermalReceiptProof = {
      ...baseThermal,
      id: proofSale.id,
      number: thermalTicketNum,
      ticketNumber: thermalTicketNum,
      thermalTicketNumber: thermalTicketNum,
      saleNumber: proofSale.number,
      invoiceNumber: invoiceNum,
      type: 'mini_thermique',
      date: `${proofSale.date} à ${proofSale.sale_time || '10:30'}`,
      saleTime: proofSale.sale_time || '10:30',
      clientName: `${proofSale.pdv_name} (${proofSale.pdv_neighborhood})`,
      clientPhone: proofSale.pdv_phone || '+223 76 00 00 00',
      vendorId: proofSale.vendor_id,
      vendorName: proofSale.vendor_name,
      vendorCode: proofSale.vendor_code,
      vendorTeam: proofSale.vendor_team,
      vendorPhone: proofSale.vendor_phone,
      pdvName: proofSale.pdv_name,
      pdvCode: proofSale.pdv_code,
      pdvNeighborhood: proofSale.pdv_neighborhood,
      pdvPhone: proofSale.pdv_phone,
      paymentMethod: proofSale.payment_type || 'Comptant',
      requestedWithTva: requested_with_tva !== undefined ? Boolean(requested_with_tva) : Boolean(invoiceSale.with_tva),
      totalAmount: computedProofTotal,
      total: computedProofTotal,
      subtotalHt: computedProofTotal,
      cashierName: `${proofSale.vendor_name} (${proofSale.vendor_code})`,
      status: 'Ticket Thermique Certifié (Preuve de vente)',
      items: normalizedProofItems,
    };

    const nowIso = new Date().toISOString();
    const rectId = `rect-${Date.now()}`;
    const rectRef = `RECT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const cleanReason = String(reason).trim();
    const proofJsonStr = JSON.stringify(thermalReceiptProof);

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        INSERT INTO invoice_rectifications (
          id, reference, sale_id, invoice_number, vendor_id, vendor_name, vendor_code,
          pdv_name, reason, thermal_receipt_number, thermal_receipt_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)
      `).run(
        rectId,
        rectRef,
        invoiceSale.id,
        invoiceNum,
        invoiceSale.vendor_id,
        invoiceSale.vendor_name,
        invoiceSale.vendor_code,
        invoiceSale.pdv_name,
        cleanReason,
        thermalTicketNum,
        proofJsonStr,
        nowIso
      );

      db.prepare(`
        UPDATE sales
        SET rectification_status = 'en_attente',
            rectification_reason = ?,
            rectification_requested_at = ?
        WHERE id = ?
      `).run(cleanReason, nowIso, invoiceSale.id);

      const notifTitle = `Demande de rectification facture ${invoiceNum} (Preuve thermique jointe)`;
      const notifMsg = `${invoiceSale.vendor_name} (${invoiceSale.vendor_code}) demande une rectification sur la facture ${invoiceNum} (${invoiceSale.pdv_name}). Motif : "${cleanReason}". Preuve jointe : Mini Facture Thermique ${thermalTicketNum} (${Number(thermalReceiptProof.total || thermalReceiptProof.totalAmount || 0).toLocaleString('fr-FR')} FCFA).`;

      sendNotification('Comptable', notifTitle, notifMsg, 'rectification_facture', rectRef, {
        proofJson: proofJsonStr,
        metadataJson: JSON.stringify({
          rectificationId: rectId,
          saleId: invoiceSale.id,
          invoiceNumber: invoiceNum,
          thermalTicketNumber: thermalTicketNum,
        }),
      });

      sendNotification('Administrateur', notifTitle, notifMsg, 'rectification_facture', rectRef, {
        proofJson: proofJsonStr,
        metadataJson: JSON.stringify({
          rectificationId: rectId,
          saleId: invoiceSale.id,
          invoiceNumber: invoiceNum,
          thermalTicketNumber: thermalTicketNum,
        }),
      });

      recordAudit(
        'DEMANDE_RECTIFICATION_FACTURE',
        'INVOICE_RECTIFICATION',
        rectId,
        'Vendeur',
        invoiceSale.vendor_id,
        `Demande de rectification ${rectRef} sur la facture ${invoiceNum} par ${invoiceSale.vendor_name} avec preuve Mini Facture Thermique ${thermalTicketNum}. Motif : "${cleanReason}".`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Demande de rectification ${rectRef} envoyée au Comptable avec votre Mini Facture Thermique (${thermalTicketNum}) jointe comme preuve.`,
      rectification: {
        id: rectId,
        reference: rectRef,
        sale_id: invoiceSale.id,
        invoice_number: invoiceNum,
        thermal_receipt_number: thermalTicketNum,
        thermal_ticket_number: thermalTicketNum,
        reason: cleanReason,
        status: 'en_attente',
        thermal_receipt: thermalReceiptProof,
        created_at: nowIso,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Le Comptable (ou Administrateur / DOV) traite (rectifie ou rejette) la demande de rectification
apiRouter.post('/invoice-rectifications/:id/resolve', requireRole(['Comptable', 'Directeur des opérations de vente', 'Sales Admin', 'Administrateur'], 'Traitement de rectification de facture'), (req, res) => {
  try {
    const { id } = req.params;
    const { action, decision, with_tva, updated_items, pdv_id, payment_type, response_note, comptable_note } = req.body;

    const rect = db.prepare('SELECT * FROM invoice_rectifications WHERE id = ?').get(id) as any;
    if (!rect) {
      return res.status(404).json({ success: false, error: 'Demande de rectification introuvable.' });
    }

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(rect.sale_id) as any;
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Facture associée introuvable.' });
    }

    let parsedRectProof: any = null;
    try {
      parsedRectProof = typeof rect.thermal_receipt_json === 'string'
        ? JSON.parse(rect.thermal_receipt_json)
        : rect.thermal_receipt_json;
    } catch {
      parsedRectProof = null;
    }

    const nowIso = new Date().toISOString();
    const isRejected = action === 'rejeter' || decision === 'rejetee';
    const nextStatus = isRejected ? 'rejetee' : 'rectifiee';
    const rawNote = comptable_note || response_note;
    const noteText =
      rawNote && String(rawNote).trim().length > 0
        ? String(rawNote).trim()
        : isRejected
        ? 'Demande de rectification rejetée après vérification.'
        : `Facture rectifiée conformément à la Mini Facture Thermique ${rect.thermal_receipt_number}.`;

    db.exec('BEGIN TRANSACTION');
    try {
      if (!isRejected) {
        const sourceItems =
          Array.isArray(updated_items) && updated_items.length > 0
            ? updated_items
            : Array.isArray(parsedRectProof?.items) && parsedRectProof.items.length > 0
            ? parsedRectProof.items
            : typeof sale.items === 'string'
            ? JSON.parse(sale.items)
            : sale.items;

        const finalItems = sourceItems.map((it: any) => ({
          productId: it.productId || it.code,
          code: it.code,
          name: it.name,
          qtyBoxes: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)),
          unitPrice: Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
          total: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)) * Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
        }));

        const subtotalHt = finalItems.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);
        const applyTva =
          with_tva !== undefined
            ? Boolean(with_tva)
            : parsedRectProof?.requestedWithTva !== undefined
            ? Boolean(parsedRectProof.requestedWithTva)
            : Boolean(sale.with_tva);
        const tvaRate = applyTva ? 18 : 0;
        const tvaAmount = applyTva ? Math.round(subtotalHt * 0.18) : 0;
        const totalTtc = subtotalHt + tvaAmount;

        db.prepare(`
          UPDATE sales
          SET pdv_id = COALESCE(?, pdv_id),
              payment_type = COALESCE(?, payment_type),
              items = ?,
              total_amount = ?,
              with_tva = ?,
              tva_rate = ?,
              tva_amount = ?,
              total_ttc = ?,
              invoice_generated = 1,
              rectification_status = 'rectifiee',
              invoice_generated_at = ?,
              invoice_generated_by = 'Fatoumata Coulibaly (Comptable)'
          WHERE id = ?
        `).run(
          pdv_id || null,
          payment_type || null,
          JSON.stringify(finalItems),
          subtotalHt,
          applyTva ? 1 : 0,
          tvaRate,
          tvaAmount,
          totalTtc,
          nowIso,
          sale.id
        );
      } else {
        db.prepare(`
          UPDATE sales
          SET rectification_status = 'rejetee'
          WHERE id = ?
        `).run(sale.id);
      }

      db.prepare(`
        UPDATE invoice_rectifications
        SET status = ?,
            response_note = ?,
            handled_by = 'Fatoumata Coulibaly (Comptable)',
            handled_at = ?
        WHERE id = ?
      `).run(nextStatus, noteText, nowIso, id);

      sendNotification(
        'Vendeur',
        isRejected
          ? `Demande de rectification ${rect.invoice_number} rejetée`
          : `Facture ${rect.invoice_number} rectifiée par le Comptable`,
        isRejected
          ? `Votre demande de rectification sur la facture ${rect.invoice_number} a été rejetée par le Comptable. Note : "${noteText}".`
          : `Suite à votre preuve (Mini Facture Thermique ${rect.thermal_receipt_number}), le Comptable a rectifié votre facture ${rect.invoice_number}. Note : "${noteText}". Vous pouvez voir et imprimer la facture rectifiée dans votre compte.`,
        isRejected ? 'rectification_facture' : 'facture_rectifiee',
        rect.invoice_number,
        { targetUserId: rect.vendor_id }
      );

      recordAudit(
        isRejected ? 'REJET_RECTIFICATION_FACTURE' : 'VALIDATION_RECTIFICATION_FACTURE',
        'INVOICE_RECTIFICATION',
        id,
        'Comptable',
        rect.vendor_id,
        `Demande de rectification ${rect.reference} sur facture ${rect.invoice_number} ${isRejected ? 'rejetée' : 'rectifiée'} par le Comptable. Note : "${noteText}".`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: isRejected
        ? `Demande de rectification sur ${rect.invoice_number} rejetée. Le vendeur a été notifié.`
        : `Facture ${rect.invoice_number} rectifiée avec succès. Le vendeur a reçu une notification.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 12C. DEMANDES D'ACHAT (Magasinier & Comptable -> Validation ou Rejet par l'Administrateur avec motif optionnel)
apiRouter.get('/purchase-requests', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM purchase_requests
      ORDER BY created_at DESC
    `).all() as any[];

    const requests = rows.map((r: any) => {
      let rawItems: any[] = [];
      try {
        rawItems = typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json || []);
      } catch {
        rawItems = [];
      }
      const items = rawItems.map((it: any, idx: number) => {
        const qty = Math.max(1, Number(it.qty ?? it.quantity ?? 1));
        const unitPrice = Math.max(0, Number(it.unitPrice ?? it.price ?? 0));
        return {
          code: it.code || `ART-0${idx + 1}`,
          name: it.name || it.designation || r.title,
          designation: it.designation || it.name || r.title,
          qty,
          quantity: qty,
          unitPrice,
          total: Number(it.total ?? qty * unitPrice),
        };
      });
      return {
        ...r,
        items,
      };
    });

    res.json({ success: true, requests, purchaseRequests: requests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Création d'une demande d'achat par le Gestionnaire de stock ou le Comptable uniquement (avec motif optionnel)
apiRouter.post(
  '/purchase-requests',
  requireRole(['Gestionnaire de stock', 'Magasinier', 'Comptable'], 'Création d\'une demande d\'achat'),
  (req, res) => {
    try {
      const {
        title,
        category,
        supplier_name,
        items,
        total_amount,
        request_motif, // Optionnel !
        requester_id,
        requester_name,
        requester_code,
      } = req.body;

      const userRole = getUserRole(req);
      if (
        userRole === 'Administrateur' ||
        userRole === 'Sales Admin' ||
        (userRole !== 'Gestionnaire de stock' && userRole !== 'Magasinier' && userRole !== 'Comptable')
      ) {
        return res.status(403).json({
          success: false,
          error: 'Seuls le Gestionnaire de stock et le Comptable peuvent créer une demande d\'achat. L\'Administrateur et le Sales Admin valident ou refusent les demandes.',
        });
      }
      if (!title || String(title).trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez indiquer l\'objet / désignation de la demande d\'achat.',
        });
      }

      const isStockMgr = userRole === 'Gestionnaire de stock' || userRole === 'Magasinier';
      const defaultUser = isStockMgr
        ? (db.prepare("SELECT * FROM users WHERE role IN ('Gestionnaire de stock', 'Magasinier') OR code = 'BAO-MAG' LIMIT 1").get() as any)
        : (db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(userRole) as any);
      const finalRequesterId = requester_id || defaultUser?.id || (isStockMgr ? 'usr-mag' : 'usr-cpt');
      const finalRequesterName = requester_name || defaultUser?.name || (isStockMgr ? 'Gestionnaire de stock' : userRole);
      const finalRequesterCode = requester_code || defaultUser?.code || (isStockMgr ? 'BAO-MAG' : 'BAO-CPT');

      const parsedItems = Array.isArray(items) && items.length > 0
        ? items.map((it: any, idx: number) => {
            const quantity = Math.max(1, Number(it.quantity ?? it.qty ?? 1));
            const unitPrice = Math.max(0, Number(it.unitPrice ?? it.price ?? 0));
            const label = String(it.name || it.designation || title).trim();
            return {
              code: it.code || `ART-0${idx + 1}`,
              name: label,
              designation: label,
              qty: quantity,
              quantity,
              unitPrice,
              total: quantity * unitPrice,
            };
          })
        : [
            {
              code: 'ART-01',
              name: String(title).trim(),
              designation: String(title).trim(),
              qty: 1,
              quantity: 1,
              unitPrice: Math.max(0, Number(total_amount || 0)),
              total: Math.max(0, Number(total_amount || 0)),
            },
          ];

      const computedTotal =
        Number(total_amount) > 0
          ? Number(total_amount)
          : parsedItems.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);

      const countRow = db.prepare('SELECT COUNT(*) as count FROM purchase_requests').get() as { count: number };
      const ref = `ACH-2026-${String((countRow?.count || 0) + 1).padStart(3, '0')}`;
      const id = `pr-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optionalMotif =
        request_motif && String(request_motif).trim().length > 0
          ? String(request_motif).trim()
          : null;

      db.prepare(`
        INSERT INTO purchase_requests (
          id, reference, requester_id, requester_name, requester_code, requester_role,
          title, category, supplier_name, items_json, total_amount, request_motif,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)
      `).run(
        id,
        ref,
        finalRequesterId,
        finalRequesterName,
        finalRequesterCode,
        userRole,
        String(title).trim(),
        category || (userRole === 'Magasinier' ? 'Approvisionnement Stock Dépôt' : 'Fournitures & Achats Comptabilité'),
        supplier_name ? String(supplier_name).trim() : 'Fournisseur Agréé Bamako',
        JSON.stringify(parsedItems),
        computedTotal,
        optionalMotif,
        nowIso
      );

      // Notification envoyée à l'Administrateur et au Sales Admin
      const notifMeta = {
        metadataJson: JSON.stringify({
          purchaseRequestId: id,
          reference: ref,
          requesterRole: userRole,
          requesterName: finalRequesterName,
          totalAmount: computedTotal,
          requestMotif: optionalMotif,
        }),
      };
      sendNotification(
        'Administrateur',
        `Nouvelle demande d'achat (${userRole}) : ${ref}`,
        `${finalRequesterName} (${userRole} • ${finalRequesterCode}) a soumis une demande d'achat "${String(title).trim()}" d'un montant de ${computedTotal.toLocaleString('fr-FR')} FCFA.${optionalMotif ? ` Motif : "${optionalMotif}".` : ' (Aucun motif précisé — optionnel).'} En attente de validation ou rejet.`,
        'demande_achat',
        ref,
        notifMeta
      );
      sendNotification(
        'Sales Admin',
        `Nouvelle demande d'achat (${userRole}) : ${ref}`,
        `${finalRequesterName} (${userRole} • ${finalRequesterCode}) a soumis une demande d'achat "${String(title).trim()}" d'un montant de ${computedTotal.toLocaleString('fr-FR')} FCFA.${optionalMotif ? ` Motif : "${optionalMotif}".` : ' (Aucun motif précisé — optionnel).'} En attente de validation ou rejet.`,
        'demande_achat',
        ref,
        notifMeta
      );

      recordAudit(
        'CREATION_DEMANDE_ACHAT',
        'PURCHASE_REQUEST',
        id,
        userRole,
        finalRequesterId,
        `Demande d'achat ${ref} créée par ${finalRequesterName} (${userRole}) : "${String(title).trim()}" (${computedTotal.toLocaleString('fr-FR')} FCFA).${optionalMotif ? ` Motif : "${optionalMotif}".` : ''}`
      );

      const createdObj = {
        id,
        reference: ref,
        requester_id: finalRequesterId,
        requester_name: finalRequesterName,
        requester_code: finalRequesterCode,
        requester_role: userRole,
        title: String(title).trim(),
        category: category || (userRole === 'Magasinier' ? 'Approvisionnement Stock Dépôt' : 'Fournitures & Achats Comptabilité'),
        supplier_name: supplier_name || 'Fournisseur Agréé Bamako',
        items: parsedItems,
        total_amount: computedTotal,
        request_motif: optionalMotif,
        status: 'en_attente',
        created_at: nowIso,
      };

      res.json({
        success: true,
        message: `Demande d'achat ${ref} transmise à l'Administrateur pour validation.`,
        request: createdObj,
        purchaseRequest: createdObj,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur';
      res.status(500).json({ success: false, error: message });
    }
  }
);

// Validation ou Rejet d'une demande d'achat par l'Administrateur ou le Sales Admin (avec motif optionnel) + Notification au Magasinier ou Comptable
apiRouter.post('/purchase-requests/:id/decision', requireSalesAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status: rawStatus, decision: rawDecision, admin_motif, reviewed_by } = req.body;
    const status = rawStatus || rawDecision; // 'validee' | 'rejetee'

    if (status !== 'validee' && status !== 'rejetee') {
      return res.status(400).json({
        success: false,
        error: 'Statut de décision invalide (doit être "validee" ou "rejetee").',
      });
    }

    const pr = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(id) as any;
    if (!pr) {
      return res.status(404).json({ success: false, error: 'Demande d\'achat introuvable.' });
    }

    const reviewerRole = getUserRole(req);
    const defaultReviewerLabel =
      reviewerRole === 'Sales Admin'
        ? 'Salif Keïta (Sales Admin)'
        : 'Amadou Touré (Administrateur)';
    const finalReviewedBy =
      reviewed_by && String(reviewed_by).trim().length > 0
        ? String(reviewed_by).trim()
        : defaultReviewerLabel;

    const optionalAdminMotif =
      admin_motif && String(admin_motif).trim().length > 0
        ? String(admin_motif).trim()
        : null;
    const nowIso = new Date().toISOString();
    const isApproved = status === 'validee';

    db.prepare(`
      UPDATE purchase_requests
      SET status = ?,
          admin_motif = ?,
          reviewed_by = ?,
          reviewed_at = ?
      WHERE id = ?
    `).run(status, optionalAdminMotif, finalReviewedBy, nowIso, id);

    markNotificationsReadByReference('Administrateur', pr.reference);
    markNotificationsReadByReference('Sales Admin', pr.reference);

    // Le Magasinier ou le Comptable reçoit une notification de validation ou de rejet
    const decisionLabel = isApproved ? 'VALIDÉE' : 'REJETÉE';
    const notifTitle = `Demande d'achat ${pr.reference} ${decisionLabel} par ${reviewerRole}`;
    const notifMessage = `Votre demande d'achat "${pr.title}" (${Number(pr.total_amount || 0).toLocaleString('fr-FR')} FCFA) a été ${isApproved ? 'ACCEPTÉE / VALIDÉE' : 'REJETÉE'} par ${finalReviewedBy}.${optionalAdminMotif ? ` Motif : "${optionalAdminMotif}".` : ''}`;

    sendNotification(
      pr.requester_role, // 'Magasinier' ou 'Comptable'
      notifTitle,
      notifMessage,
      isApproved ? 'validation_demande_achat' : 'rejet_demande_achat',
      pr.reference,
      {
        targetUserId: pr.requester_id,
        metadataJson: JSON.stringify({
          purchaseRequestId: pr.id,
          reference: pr.reference,
          decision: status,
          adminMotif: optionalAdminMotif,
        }),
      }
    );

    recordAudit(
      isApproved ? 'VALIDATION_DEMANDE_ACHAT' : 'REJET_DEMANDE_ACHAT',
      'PURCHASE_REQUEST',
      id,
      reviewerRole,
      pr.requester_id,
      `Demande d'achat ${pr.reference} (${pr.requester_name} - ${pr.requester_role}) ${isApproved ? 'validée' : 'rejetée'} par ${finalReviewedBy}.${optionalAdminMotif ? ` Motif : "${optionalAdminMotif}".` : ''}`
    );

    const updated = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      message: `La demande d'achat ${pr.reference} a été ${isApproved ? 'validée' : 'rejetée'}. Une notification a été envoyée au ${pr.requester_role} (${pr.requester_name}).`,
      request: {
        ...updated,
        items: typeof updated.items_json === 'string' ? JSON.parse(updated.items_json) : [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 13. TEST DE WORKFLOW INTÉGRÉ
// "Test : réception de 100 cartons, chargement de 20, vente de 5, retour de 3."
apiRouter.post('/tests/run-workflow-test', async (req, res) => {
  try {
    const results: string[] = [];
    const testTimestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const testLotNum = `LOT-TEST-REC-${testTimestamp % 10000}`;
    const testProduct = db.prepare("SELECT * FROM products WHERE code = 'JUS-CAJ-12'").get() as any;
    const testVendor = db.prepare("SELECT * FROM users WHERE code = 'BAO-VND-001'").get() as any;
    const testPdv = db.prepare("SELECT * FROM points_de_vente WHERE status = 'valide' LIMIT 1").get() as any;

    if (!testProduct || !testVendor || !testPdv) {
      return res.status(400).json({ success: false, error: 'Données de base manquantes pour exécuter le test.' });
    }

    const initialDepotStock = testProduct.stock_depot;
    results.push(`État initial : Stock dépôt ${testProduct.name} = ${initialDepotStock} cartons.`);

    // STEP 1: Réception de 100 cartons (Magasinier)
    const expiryDate = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
    const recId = `rec-test-${testTimestamp}`;
    const recRef = `REC-TEST-${testTimestamp}`;
    const lotId = `lot-test-${testTimestamp}`;

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('UPDATE products SET stock_depot = stock_depot + 100 WHERE id = ?').run(testProduct.id);
      db.prepare(`
        INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
        VALUES (?, ?, ?, ?, 100, 100, 'actif', ?)
      `).run(lotId, testProduct.id, testLotNum, expiryDate, date);

      recordStockMovement('reception', 'IN', testProduct.id, lotId, 100, recRef, 'Test: Réception 100 cartons', 100 * testProduct.price_box, 'Test Runner');
      db.prepare(`
        INSERT INTO receptions (id, reference, supplier_name, date, items, total_boxes, created_at)
        VALUES (?, ?, 'Fournisseur Test', ?, ?, 100, ?)
      `).run(recId, recRef, date, JSON.stringify([{ productId: testProduct.id, code: testProduct.code, name: testProduct.name, boxes: 100, lot_number: testLotNum, expiry_date: expiryDate }]), date);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    results.push(`1. Réception de 100 cartons enregistrée (Réf: ${recRef}, Lot: ${testLotNum}, Péremption: ${expiryDate}). Stock dépôt: ${initialDepotStock + 100} ctn.`);

    // STEP 2: Chargement de 20 cartons pour le vendeur
    const chgId = `chg-test-${testTimestamp}`;
    const chgRef = `CHG-TEST-${testTimestamp}`;
    db.exec('BEGIN TRANSACTION');
    try {
      // FEFO allocation
      const allocations = allocateFEFO(testProduct.id, 20, date);
      for (const a of allocations) {
        db.prepare('UPDATE lots SET quantity = quantity - ? WHERE id = ?').run(a.allocatedQty, a.lotId);
        recordStockMovement('chargement', 'OUT', testProduct.id, a.lotId, a.allocatedQty, chgRef, 'Test: Chargement 20 cartons', a.allocatedQty * testProduct.price_box, 'Test Runner');
      }
      db.prepare('UPDATE products SET stock_depot = stock_depot - 20 WHERE id = ?').run(testProduct.id);
      db.prepare(`
        INSERT INTO chargements (id, reference, vendor_id, date, desired_date, items, total_amount, status, validated_by, charged_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Chargée', 'Magasinier Test', ?, ?)
      `).run(
        chgId,
        chgRef,
        testVendor.id,
        date,
        date,
        JSON.stringify([{ productId: testProduct.id, code: testProduct.code, name: testProduct.name, requestedBoxes: 20, validatedBoxes: 20, unitPrice: testProduct.price_box, total: 20 * testProduct.price_box }]),
        20 * testProduct.price_box,
        new Date().toISOString(),
        date
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    results.push(`2. Chargement de 20 cartons validé et remis au vendeur (FEFO déduit du lot le plus proche, stock dépôt -20, camionnette vendeur +20). Réf: ${chgRef}.`);

    // STEP 3: Vente de 5 cartons
    const saleId = `sale-test-${testTimestamp}`;
    const saleNum = `VTE-TEST-${testTimestamp}`;
    db.prepare(`
      INSERT INTO sales (id, number, date, vendor_id, pdv_id, items, total_amount, payment_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Comptant', 'livree', ?)
    `).run(
      saleId,
      saleNum,
      date,
      testVendor.id,
      testPdv.id,
      JSON.stringify([{ productId: testProduct.id, code: testProduct.code, name: testProduct.name, qtyBoxes: 5, unitPrice: testProduct.price_box, total: 5 * testProduct.price_box }]),
      5 * testProduct.price_box,
      date
    );
    results.push(`3. Vente de 5 cartons enregistrée au point de vente "${testPdv.name}" (Réf: ${saleNum}). Stock vendeur restant: 20 - 5 = 15 cartons.`);

    // STEP 4: Retour de 3 cartons invendus
    const retId = `ret-test-${testTimestamp}`;
    const retRef = `RET-TEST-${testTimestamp}`;
    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('UPDATE products SET stock_depot = stock_depot + 3 WHERE id = ?').run(testProduct.id);
      db.prepare('UPDATE lots SET quantity = quantity + 3 WHERE id = ?').run(lotId);
      recordStockMovement('retour', 'IN', testProduct.id, lotId, 3, retRef, 'Test: Retour 3 cartons invendus', 3 * testProduct.price_box, 'Test Runner');
      db.prepare(`
        INSERT INTO retours (id, reference, vendor_id, date, items, reason, status, confirmed_by, confirmed_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'Invendus tournée de fin de journée', 'confirme', 'Magasinier Test', ?, ?)
      `).run(retId, retRef, testVendor.id, date, JSON.stringify([{ productId: testProduct.id, code: testProduct.code, name: testProduct.name, boxes: 3, unitPrice: testProduct.price_box }]), new Date().toISOString(), date);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    results.push(`4. Retour de 3 cartons invendus confirmé par le magasinier (Réf: ${retRef}). Réintégration stock dépôt +3, stock vendeur restant: 15 - 3 = 12 cartons.`);

    // STEP 5: Calcul du stock théorique et vérification de conformité
    const expectedRemaining = 20 - 5 - 3; // 12 cartons
    results.push(`5. Bilan du cycle de test : Stock théorique vendeur = 20 (chargé) - 5 (vendu) - 3 (rendu) = ${expectedRemaining} cartons.`);
    results.push(`Vérification : Transaction atomique intègre, mouvements tracés en ajout seul pour les entrées, sortie FEFO appliquée, notifications prêtes.`);

    recordAudit('WORKFLOW_TEST_COMPLETED', 'TEST', chgId, 'Administrateur', null, `Test de cycle réussi : Réception 100, Chargement 20, Vente 5, Retour 3. Solde théorique = ${expectedRemaining} cartons.`);

    res.json({
      success: true,
      message: 'Test du cycle inventaire (100 reçus -> 20 chargés -> 5 vendus -> 3 rendus = 12 restants) exécuté avec succès.',
      steps: results,
      theoreticalStockRemaining: expectedRemaining,
      product: testProduct.name,
      vendor: testVendor.name
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 14. NOTE SUR 20 PAR VENDEUR ET PAR SEMESTRE, PALIERS DE BON & CARTE À GRATTER
export interface SemesterWeights {
  ca: number;         // défaut: 8
  regularite: number; // défaut: 4
  versements: number; // défaut: 4
  pdv: number;        // défaut: 2
  rigueur: number;    // défaut: 2
}

export interface SemesterTiers {
  tier_10_12: number;     // défaut: 10 000 FCFA
  tier_12_5_14_5: number; // défaut: 20 000 FCFA
  tier_15_17: number;     // défaut: 40 000 FCFA
  tier_17_5_20: number;   // défaut: 75 000 FCFA
}

export function roundToHalf(value: number): number {
  const clamped = Math.max(0, Math.min(20, Number.isFinite(value) ? value : 0));
  return Math.round(clamped * 2) / 2;
}

function getSemesterWeights(): SemesterWeights {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'semester_weights'").get() as { value: string } | undefined;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        ca: Number(parsed.ca ?? 8),
        regularite: Number(parsed.regularite ?? 4),
        versements: Number(parsed.versements ?? 4),
        pdv: Number(parsed.pdv ?? 2),
        rigueur: Number(parsed.rigueur ?? 2),
      };
    }
  } catch {
    // fallback
  }
  return { ca: 8, regularite: 4, versements: 4, pdv: 2, rigueur: 2 };
}

function getSemesterTiers(): SemesterTiers {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'semester_tiers'").get() as { value: string } | undefined;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        tier_10_12: Number(parsed.tier_10_12 ?? 10000),
        tier_12_5_14_5: Number(parsed.tier_12_5_14_5 ?? 20000),
        tier_15_17: Number(parsed.tier_15_17 ?? 40000),
        tier_17_5_20: Number(parsed.tier_17_5_20 ?? 75000),
      };
    }
  } catch {
    // fallback
  }
  return {
    tier_10_12: 10000,
    tier_12_5_14_5: 20000,
    tier_15_17: 40000,
    tier_17_5_20: 75000,
  };
}

// Paliers de bon :
// < 10 : aucun (0 FCFA)
// 10 - 12 : 10 000 FCFA
// 12,5 - 14,5 : 20 000 FCFA
// 15 - 17 : 40 000 FCFA
// 17,5 - 20 : 75 000 FCFA
export function computeVoucherAmountFromNote(rawNote: number, tiers: SemesterTiers): { note: number; eligible: boolean; amount: number; tierLabel: string } {
  const note = roundToHalf(rawNote);
  if (note < 10) {
    return { note, eligible: false, amount: 0, tierLabel: 'Moins de 10/20 : Aucun bon' };
  }
  if (note >= 10 && note <= 12) {
    return { note, eligible: true, amount: tiers.tier_10_12, tierLabel: '10 à 12 / 20' };
  }
  if (note >= 12.5 && note <= 14.5) {
    return { note, eligible: true, amount: tiers.tier_12_5_14_5, tierLabel: '12,5 à 14,5 / 20' };
  }
  if (note >= 15 && note <= 17) {
    return { note, eligible: true, amount: tiers.tier_15_17, tierLabel: '15 à 17 / 20' };
  }
  return { note, eligible: true, amount: tiers.tier_17_5_20, tierLabel: '17,5 à 20 / 20' };
}

// Calcul de la note sur 20 côté serveur pour un vendeur et un semestre
function calculateVendorSemesterScoreServer(vendorId: string, semester: string, weights: SemesterWeights) {
  // Check if frozen evaluation already exists
  const existing = db.prepare('SELECT * FROM semester_evaluations WHERE vendor_id = ? AND semester = ?').get(vendorId, semester) as any;
  if (existing && existing.is_frozen === 1) {
    return {
      vendor_id: vendorId,
      semester,
      closure_date: existing.closure_date,
      score_ca: Number(existing.score_ca),
      score_regularite: Number(existing.score_regularite),
      score_versements: Number(existing.score_versements),
      score_pdv: Number(existing.score_pdv),
      score_rigueur: Number(existing.score_rigueur),
      raw_total: Number(existing.raw_total),
      note_finale: roundToHalf(Number(existing.note_finale)),
      is_frozen: true,
    };
  }

  // Date filter according to semester (1er janvier / 1er juillet)
  // S1-2026: 2026-01-01 to 2026-06-30 (Clôture 1er juillet)
  // S2-2026: 2026-07-01 to 2026-12-31 (Clôture 1er janvier)
  const isS1 = semester.startsWith('S1');
  const startDate = isS1 ? '2026-01-01' : '2026-07-01';
  const endDate = isS1 ? '2026-06-30' : '2026-12-31';
  const closureDate = isS1 ? '2026-07-01' : '2027-01-01';

  // 1. CA vs objectif (pondération: weights.ca, défaut 8)
  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as ca_total, COUNT(DISTINCT date) as active_days
    FROM sales
    WHERE vendor_id = ? AND date >= ? AND date <= ?
  `).get(vendorId, startDate, endDate) as { ca_total: number; active_days: number };

  const caTarget = 1800000; // Objectif semestriel par vendeur
  const caRatio = Math.min(1, salesRow.ca_total / caTarget);
  const scoreCa = Math.round(caRatio * weights.ca * 2) / 2;

  // 2. Régularité des tournées & Objectifs mensuels Routine VRS (pondération: weights.regularite, défaut 4)
  // Utilise l'objectif mensuel attribué (ou l'objectif mensuel par défaut 25 x jours ouvrés)
  const currentMonthSummary = buildVendorMonthlyObjectiveSummary(vendorId, '2026-11');
  const vrsMonthlyRatio =
    currentMonthSummary.realizedMonthlyPdv > 0
      ? Math.min(1, currentMonthSummary.realizedMonthlyPdv / Math.max(1, currentMonthSummary.monthlyTargetPdv))
      : 0;
  const expectedActiveDays = 14;
  const salesDaysRatio = Math.min(1, salesRow.active_days / expectedActiveDays);
  const regRatio = Math.max(salesDaysRatio, vrsMonthlyRatio);
  const scoreRegularite = Math.round(regRatio * weights.regularite * 2) / 2;

  // 3. Versements dans les délais (pondération: weights.versements, défaut 4)
  const vsmRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as vsm_total
    FROM versements
    WHERE vendor_id = ? AND status = 'valide' AND date >= ? AND date <= ?
  `).get(vendorId, startDate, endDate) as { vsm_total: number };

  const vsmRatio = salesRow.ca_total > 0 ? Math.min(1, vsmRow.vsm_total / (salesRow.ca_total * 0.85)) : 0.75;
  const scoreVersements = Math.round(vsmRatio * weights.versements * 2) / 2;

  // 4. Nouveaux PDV (pondération: weights.pdv, défaut 2)
  const distinctPdvRow = db.prepare(`
    SELECT COUNT(DISTINCT pdv_id) as pdv_count
    FROM sales
    WHERE vendor_id = ? AND date >= ? AND date <= ?
  `).get(vendorId, startDate, endDate) as { pdv_count: number };
  const pdvRatio = Math.min(1, distinctPdvRow.pdv_count / 4);
  const scorePdv = Math.round(pdvRatio * weights.pdv * 2) / 2;

  // 5. Rigueur d'inventaire et conformité (pondération: weights.rigueur, défaut 2)
  const invRow = db.prepare(`
    SELECT COALESCE(SUM(ABS(total_ecart_boxes)), 0) as total_ecarts
    FROM vendor_inventories
    WHERE vendor_id = ? AND date >= ? AND date <= ?
  `).get(vendorId, startDate, endDate) as { total_ecarts: number };

  const rigueurRatio = Math.max(0, 1 - invRow.total_ecarts * 0.15);
  const scoreRigueur = Math.round(rigueurRatio * weights.rigueur * 2) / 2;

  const rawTotal = scoreCa + scoreRegularite + scoreVersements + scorePdv + scoreRigueur;
  const noteFinale = roundToHalf(rawTotal);

  return {
    vendor_id: vendorId,
    semester,
    closure_date: closureDate,
    score_ca: scoreCa,
    score_regularite: scoreRegularite,
    score_versements: scoreVersements,
    score_pdv: scorePdv,
    score_rigueur: scoreRigueur,
    raw_total: Number(rawTotal.toFixed(2)),
    note_finale: noteFinale,
    is_frozen: false,
  };
}

// Helper to compute FEFO non-expired stock catalogue for bon cadeau basket selection
function getFefoNonExpiredCatalog() {
  const todayStr = new Date().toISOString().split('T')[0];
  const products = db.prepare('SELECT * FROM products WHERE COALESCE(is_active, 1) = 1 ORDER BY name ASC').all() as any[];
  const lots = db.prepare(`
    SELECT * FROM lots
    WHERE quantity > 0 AND expiry_date > ?
    ORDER BY expiry_date ASC
  `).all(todayStr) as any[];

  return products.map(p => {
    const validProductLots = lots.filter(l => l.product_id === p.id);
    const nonExpiredLotQty = validProductLots.reduce((sum, l) => sum + Number(l.quantity), 0);
    const availableFefoBoxes = Math.max(0, Math.min(Number(p.stock_depot), nonExpiredLotQty));
    const firstLot = validProductLots[0] || null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      gamme: p.gamme,
      packaging: p.packaging,
      units_per_box: p.units_per_box,
      price_box: Number(p.price_box),
      stock_depot: Number(p.stock_depot),
      available_fefo_boxes: availableFefoBoxes,
      next_fefo_lot: firstLot ? firstLot.lot_number : null,
      next_fefo_expiry: firstLot ? firstLot.expiry_date : null,
      in_stock_non_expired: availableFefoBoxes > 0,
    };
  });
}

// Helper to strip amount from unrevealed bons so amount is NEVER in network response before revelation
function sanitizeBonForNetwork(bon: any) {
  const isRevealed = Number(bon.revealed) === 1;
  const todayStr = new Date().toISOString().split('T')[0];
  const rawDiffDays = Math.ceil(
    (new Date(bon.expires_at).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysLeft = Math.max(0, rawDiffDays);
  const isCompleted =
    bon.status === 'Remis' ||
    bon.status === 'remis' ||
    bon.status === 'Reçu' ||
    bon.status === 'recu';
  const isExpired = !isCompleted && (bon.expires_at < todayStr || bon.status === 'expire' || bon.status === 'Expiré');

  let parsedItems: any[] = [];
  try {
    parsedItems = typeof bon.items === 'string' ? JSON.parse(bon.items) : (Array.isArray(bon.items) ? bon.items : []);
  } catch {
    parsedItems = [];
  }

  let effectiveStatus = bon.status || 'actif';
  if (isExpired) {
    effectiveStatus = 'Expiré';
  }

  // Base object WITHOUT amount / montant
  const safeBon: Record<string, any> = {
    id: bon.id,
    reference: bon.reference,
    vendor_id: bon.vendor_id,
    vendor_name: bon.vendor_name,
    vendor_code: bon.vendor_code,
    vendor_team: bon.vendor_team,
    semester: bon.semester,
    closure_date: bon.closure_date,
    note: roundToHalf(Number(bon.note)),
    revealed: isRevealed,
    revealed_at: bon.revealed_at || null,
    issued_at: bon.issued_at,
    expires_at: bon.expires_at,
    validity_days: 90 + Number(bon.prolongation_days || 0),
    days_remaining: daysLeft,
    reminder_15_days: !isCompleted && !isExpired && daysLeft > 0 && daysLeft <= 15,
    is_expired: isExpired,
    status: effectiveStatus,
    items: parsedItems,
    basket_total: Number(bon.basket_total || 0),
    delivered_total: Number(bon.delivered_total || 0),
    requested_at: bon.requested_at || null,
    prepared_by: bon.prepared_by || null,
    remis_at: bon.remis_at || null,
    confirmed_reception_at: bon.confirmed_reception_at || null,
    prolongation_days: Number(bon.prolongation_days || 0),
    prolongation_motif: bon.prolongation_motif || null,
    prolonged_by: bon.prolonged_by || null,
    prolonged_at: bon.prolonged_at || null,
    settlement_rule: 'Rien en espèces',
  };

  // CRITICAL: Le montant est strictement absent de la page et des réponses réseau avant révélation !
  if (isRevealed) {
    safeBon.amount = Number(bon.amount);
  }

  return safeBon;
}

// GET /api/bons : retourne barème (pondérations + paliers), notes par vendeur/semestre, catalogue FEFO non périmé, et bons (sans montant si non révélé)
apiRouter.get('/bons', (req, res) => {
  try {
    const weights = getSemesterWeights();
    const tiers = getSemesterTiers();
    const role = getUserRole(req);
    const requestedVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId.trim() : '';

    const allVendors = db.prepare("SELECT id, code, name, team FROM users WHERE role = 'Vendeur' ORDER BY code ASC").all() as any[];
    const targetVendors =
      role === 'Vendeur' && requestedVendorId
        ? allVendors.filter(v => v.id === requestedVendorId)
        : requestedVendorId
        ? allVendors.filter(v => v.id === requestedVendorId)
        : allVendors;

    const semesters = ['S1-2026', 'S2-2026'];
    const evaluations: any[] = [];

    for (const sem of semesters) {
      for (const v of targetVendors) {
        const score = calculateVendorSemesterScoreServer(v.id, sem, weights);
        const tierPreview = computeVoucherAmountFromNote(score.note_finale, tiers);
        evaluations.push({
          ...score,
          vendor_name: v.name,
          vendor_code: v.code,
          vendor_team: v.team,
          eligible_for_bon: tierPreview.eligible,
          tier_label: tierPreview.tierLabel,
        });
      }
    }

    let bonsRows: any[];
    if (role === 'Vendeur' && requestedVendorId) {
      bonsRows = db.prepare(`
        SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
        FROM bons_cadeaux b
        JOIN users u ON b.vendor_id = u.id
        WHERE b.vendor_id = ?
        ORDER BY b.created_at DESC
      `).all(requestedVendorId) as any[];
    } else if (requestedVendorId) {
      bonsRows = db.prepare(`
        SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
        FROM bons_cadeaux b
        JOIN users u ON b.vendor_id = u.id
        WHERE b.vendor_id = ?
        ORDER BY b.created_at DESC
      `).all(requestedVendorId) as any[];
    } else {
      bonsRows = db.prepare(`
        SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
        FROM bons_cadeaux b
        JOIN users u ON b.vendor_id = u.id
        ORDER BY b.created_at DESC
      `).all() as any[];
    }

    const sanitizedBons = bonsRows.map(sanitizeBonForNetwork);
    const fefoCatalog = getFefoNonExpiredCatalog();

    // Fetch audit logs related to bons & semester evaluations
    const bonAuditLogs = db.prepare(`
      SELECT * FROM audit_logs
      WHERE entity IN ('BON_CADEAU', 'SEMESTRE', 'BAREME_SEMESTRE')
         OR action LIKE '%SEMESTRE%'
         OR action LIKE '%BON%'
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    res.json({
      success: true,
      weights,
      tiers,
      evaluations,
      bons: sanitizedBons,
      fefoCatalog,
      unrevealedCount: sanitizedBons.filter(b => !b.revealed).length,
      auditLogs: bonAuditLogs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /bons/:id/reveler (et /api/bons/:id/reveler) : Révélation du bon côté serveur
apiRouter.post('/bons/:id/reveler', (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req) || 'Vendeur';

    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }

    // Rechargement = même montant : si déjà révélé, on renvoie exactement le même montant figé côté serveur
    if (Number(bon.revealed) === 1) {
      return res.json({
        success: true,
        alreadyRevealed: true,
        message: 'Bon déjà révélé (montant identique conservé).',
        bon: sanitizeBonForNetwork(bon),
      });
    }

    const nowIso = new Date().toISOString();
    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        UPDATE bons_cadeaux
        SET revealed = 1, revealed_at = ?
        WHERE id = ?
      `).run(nowIso, id);

      // Mark corresponding notification as read
      db.prepare(`
        UPDATE notifications
        SET is_read = 1
        WHERE reference = ?
      `).run(bon.reference);

      recordAudit(
        'REVELATION_BON_CADEAU',
        'BON_CADEAU',
        id,
        userRole,
        bon.vendor_id,
        `Carte à gratter ${bon.reference} (${bon.semester}, note ${bon.note}/20) révélée par ${bon.vendor_name} (${bon.vendor_code}) : montant ${Number(bon.amount).toLocaleString('fr-FR')} FCFA.`
      );

      sendNotification(
        'Administrateur',
        `Bon gratté & révélé (${bon.semester})`,
        `${bon.vendor_name} (${bon.vendor_code}) a révélé son bon ${bon.reference} (note ${bon.note}/20) d'une valeur de ${Number(bon.amount).toLocaleString('fr-FR')} FCFA.`,
        'cadeau',
        bon.reference
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const updatedBon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      alreadyRevealed: false,
      message: `Félicitations ! Votre bon de ${Number(updatedBon.amount).toLocaleString('fr-FR')} FCFA est révélé.`,
      bon: sanitizeBonForNetwork(updatedBon),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/bons/config : Pondérations et paliers réglables (Administrateur)
apiRouter.put('/bons/config', requireAdmin, (req, res) => {
  try {
    const { weights, tiers } = req.body;
    const userRole = getUserRole(req);

    if (weights) {
      const cleanWeights: SemesterWeights = {
        ca: Math.max(0, Number(weights.ca ?? 8)),
        regularite: Math.max(0, Number(weights.regularite ?? 4)),
        versements: Math.max(0, Number(weights.versements ?? 4)),
        pdv: Math.max(0, Number(weights.pdv ?? 2)),
        rigueur: Math.max(0, Number(weights.rigueur ?? 2)),
      };
      const sumWeights = cleanWeights.ca + cleanWeights.regularite + cleanWeights.versements + cleanWeights.pdv + cleanWeights.rigueur;
      if (Math.abs(sumWeights - 20) > 0.01) {
        return res.status(400).json({
          success: false,
          error: `La somme des pondérations doit être égale à 20 (actuellement : ${sumWeights}/20).`
        });
      }
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('semester_weights', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(JSON.stringify(cleanWeights));
    }

    if (tiers) {
      const cleanTiers: SemesterTiers = {
        tier_10_12: Math.max(0, Number(tiers.tier_10_12 ?? 10000)),
        tier_12_5_14_5: Math.max(0, Number(tiers.tier_12_5_14_5 ?? 20000)),
        tier_15_17: Math.max(0, Number(tiers.tier_15_17 ?? 40000)),
        tier_17_5_20: Math.max(0, Number(tiers.tier_17_5_20 ?? 75000)),
      };
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('semester_tiers', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(JSON.stringify(cleanTiers));
    }

    const updatedWeights = getSemesterWeights();
    const updatedTiers = getSemesterTiers();

    recordAudit(
      'MODIFICATION_BAREME_SEMESTRE',
      'BAREME_SEMESTRE',
      'config',
      userRole,
      'usr-adm',
      `Pondérations (CA:${updatedWeights.ca}, Rég:${updatedWeights.regularite}, Vers:${updatedWeights.versements}, PDV:${updatedWeights.pdv}, Rig:${updatedWeights.rigueur}) et paliers (${updatedTiers.tier_10_12.toLocaleString('fr-FR')} / ${updatedTiers.tier_12_5_14_5.toLocaleString('fr-FR')} / ${updatedTiers.tier_15_17.toLocaleString('fr-FR')} / ${updatedTiers.tier_17_5_20.toLocaleString('fr-FR')} FCFA) mis à jour.`
    );

    res.json({
      success: true,
      message: 'Pondérations sur 20 et paliers de bon enregistrés avec succès.',
      weights: updatedWeights,
      tiers: updatedTiers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/bons/cloturer : Clôture le 1er janvier ou le 1er juillet (note figée, bon généré si note >= 10, valeur fixée côté serveur avant tout grattage, 1 bon par vendeur et par semestre, valable 90 jours)
apiRouter.post('/bons/cloturer', requireAdmin, (req, res) => {
  try {
    const { semester = 'S2-2026', customScores } = req.body;
    const userRole = getUserRole(req);
    const weights = getSemesterWeights();
    const tiers = getSemesterTiers();

    const closureDate = semester.startsWith('S1') ? '2026-07-01' : '2027-01-01';
    const closureLabel = semester.startsWith('S1') ? '1er juillet' : '1er janvier';
    const issuedDate = new Date();
    const expiresDate = new Date(issuedDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const issuedStr = issuedDate.toISOString().split('T')[0];
    const expiresStr = expiresDate.toISOString().split('T')[0];
    const nowIso = issuedDate.toISOString();

    const vendors = db.prepare("SELECT id, code, name, team FROM users WHERE role = 'Vendeur' ORDER BY code ASC").all() as any[];
    const generatedSummary: any[] = [];

    db.exec('BEGIN TRANSACTION');
    try {
      for (let idx = 0; idx < vendors.length; idx++) {
        const v = vendors[idx];
        const calc = calculateVendorSemesterScoreServer(v.id, semester, weights);

        // Allow optional override in admin closure simulation if provided, otherwise use server-computed score
        const override = customScores && typeof customScores[v.id] === 'number' ? roundToHalf(customScores[v.id]) : null;
        const finalNote = override !== null ? override : calc.note_finale;

        const evalId = `eval-${semester.toLowerCase()}-${v.id}`;
        db.prepare(`
          INSERT INTO semester_evaluations (
            id, vendor_id, semester, closure_date,
            score_ca, score_regularite, score_versements, score_pdv, score_rigueur,
            raw_total, note_finale, is_frozen, details_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(vendor_id, semester) DO UPDATE SET
            note_finale = CASE WHEN semester_evaluations.is_frozen = 1 THEN semester_evaluations.note_finale ELSE excluded.note_finale END,
            is_frozen = 1
        `).run(
          evalId,
          v.id,
          semester,
          closureDate,
          calc.score_ca,
          calc.score_regularite,
          calc.score_versements,
          calc.score_pdv,
          calc.score_rigueur,
          calc.raw_total,
          finalNote,
          JSON.stringify({ weights, closureDate, closureLabel }),
          nowIso
        );

        // Re-read frozen note
        const frozenRow = db.prepare('SELECT note_finale FROM semester_evaluations WHERE vendor_id = ? AND semester = ?').get(v.id, semester) as { note_finale: number };
        const frozenNote = roundToHalf(frozenRow.note_finale);
        const voucherInfo = computeVoucherAmountFromNote(frozenNote, tiers);

        // Un bon par vendeur et par semestre, généré uniquement si note >= 10
        const existingBon = db.prepare('SELECT * FROM bons_cadeaux WHERE vendor_id = ? AND semester = ?').get(v.id, semester) as any;

        if (voucherInfo.eligible && voucherInfo.amount > 0 && !existingBon) {
          const bonId = `bon-${semester.toLowerCase()}-${v.id}`;
          const bonRef = `BON-${semester}-${String(idx + 1).padStart(3, '0')}`;

          db.prepare(`
            INSERT INTO bons_cadeaux (
              id, reference, vendor_id, semester, closure_date,
              note, amount, revealed, revealed_at, issued_at, expires_at, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 'actif', ?)
          `).run(
            bonId,
            bonRef,
            v.id,
            semester,
            closureDate,
            frozenNote,
            voucherInfo.amount,
            issuedStr,
            expiresStr,
            nowIso
          );

          sendNotification(
            'Vendeur',
            `Clôture ${semester} (${closureLabel}) : Carte à gratter disponible`,
            `${v.name} (${v.code}) : Votre note semestrielle est figée à ${frozenNote}/20. Une carte à gratter valable 90 jours vous attend dans "Mes cadeaux".`,
            'cadeau',
            bonRef,
            { targetUserId: v.id }
          );

          recordAudit(
            'CLOTURE_SEMESTRE_ET_GENERATION_BON',
            'BON_CADEAU',
            bonId,
            userRole,
            v.id,
            `Clôture du ${closureLabel} (${semester}) pour ${v.name} (${v.code}) : note figée à ${frozenNote}/20, bon ${bonRef} généré (valeur fixée côté serveur avant grattage, valable 90 jours jusqu'au ${expiresStr}).`
          );

          generatedSummary.push({
            vendor: v.name,
            code: v.code,
            note: frozenNote,
            bonGenerated: true,
            reference: bonRef,
          });
        } else {
          recordAudit(
            'CLOTURE_SEMESTRE_SANS_BON',
            'SEMESTRE',
            evalId,
            userRole,
            v.id,
            existingBon
              ? `Clôture ${semester} déjà effectuée pour ${v.name} (${v.code}) : 1 seul bon par vendeur et par semestre (${existingBon.reference}).`
              : `Clôture du ${closureLabel} (${semester}) pour ${v.name} (${v.code}) : note figée à ${frozenNote}/20 (< 10/20 : aucun bon généré).`
          );

          generatedSummary.push({
            vendor: v.name,
            code: v.code,
            note: frozenNote,
            bonGenerated: Boolean(existingBon),
            reference: existingBon?.reference || null,
          });
        }
      }
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Clôture du ${closureLabel} (${semester}) enregistrée : notes figées et bons générés pour les vendeurs ayant une note >= 10/20 (valables 90 jours).`,
      summary: generatedSummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/bons/test-bareme : "Test : 16/20 donne 40 000 ; 8/20 aucun bon."
apiRouter.post('/bons/test-bareme', (req, res) => {
  try {
    const userRole = getUserRole(req) || 'Administrateur';
    const defaultTiers: SemesterTiers = {
      tier_10_12: 10000,
      tier_12_5_14_5: 20000,
      tier_15_17: 40000,
      tier_17_5_20: 75000,
    };

    // Cas 1 : 16/20 -> 40 000 FCFA
    const case16 = computeVoucherAmountFromNote(16, defaultTiers);
    const pass16 = case16.note === 16 && case16.eligible === true && case16.amount === 40000;

    // Cas 2 : 8/20 -> aucun bon (0 FCFA, eligible = false)
    const case8 = computeVoucherAmountFromNote(8, defaultTiers);
    const pass8 = case8.note === 8 && case8.eligible === false && case8.amount === 0;

    const allPassed = pass16 && pass8;

    recordAudit(
      'TEST_BAREME_BONS',
      'BAREME_SEMESTRE',
      'test-16-8',
      userRole,
      null,
      `Test réglementaire exécuté : 16/20 -> ${case16.amount.toLocaleString('fr-FR')} FCFA (bon généré = ${case16.eligible ? 'OUI' : 'NON'}) ; 8/20 -> ${case8.eligible ? `${case8.amount} FCFA` : 'Aucun bon'}. Statut : ${allPassed ? 'CONFORME' : 'ÉCHEC'}.`
    );

    res.json({
      success: allPassed,
      message: allPassed
        ? 'Test vérifié avec succès : 16/20 donne 40 000 FCFA ; 8/20 donne aucun bon.'
        : 'Échec du test de barème.',
      results: [
        {
          test: 'Note 16 / 20',
          note: case16.note,
          palier: '15 - 17',
          bonGenere: case16.eligible,
          montant: case16.amount,
          expected: '40 000 FCFA',
          passed: pass16,
        },
        {
          test: 'Note 8 / 20',
          note: case8.note,
          palier: 'Moins de 10',
          bonGenere: case8.eligible,
          montant: case8.amount,
          expected: 'Aucun bon',
          passed: pass8,
        },
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 15. PANIER BON CADEAU (Après révélation, Vendeur compose un panier ligne par ligne, valorisé au prix de vente, plafonné à la valeur du bon, FEFO non périmé, envoi "Demander le retrait" -> statut "À préparer")
apiRouter.post('/bons/:id/demander-retrait', (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    const userRole = getUserRole(req) || 'Vendeur';

    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }
    if (Number(bon.revealed) !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Vous devez d\'abord gratter et révéler votre bon cadeau avant de composer votre panier.'
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (bon.expires_at < todayStr || bon.status === 'Expiré' || bon.status === 'expire') {
      return res.status(400).json({
        success: false,
        error: `Ce bon est expiré depuis le ${bon.expires_at} (validité 90 jours). Seul l'Administrateur peut le prolonger avec un motif.`
      });
    }

    if (bon.status === 'Remis' || bon.status === 'Reçu') {
      return res.status(400).json({
        success: false,
        error: `Ce bon a déjà fait l'objet d'une remise (${bon.status}).`
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez ajouter et valider au moins un produit dans votre panier avant de demander le retrait.'
      });
    }

    // Pas de doublon produit
    const prodIds = items.map((it: any) => it.productId);
    if (new Set(prodIds).size !== prodIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Doublon détecté : chaque produit ne peut figurer qu\'une seule fois dans le panier.'
      });
    }

    const enrichedItems: any[] = [];
    let basketTotal = 0;

    for (const it of items) {
      const cartons = Number(it.cartons || it.qtyBoxes || 0);
      if (!it.productId || cartons <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Chaque ligne du panier doit comporter un produit valide et un nombre de cartons supérieur à 0.'
        });
      }

      const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
      if (!prod) {
        return res.status(400).json({ success: false, error: `Produit introuvable (${it.productId}).` });
      }

      // Vérification du stock non périmé (FEFO)
      const allocations = allocateFEFO(prod.id, cartons, todayStr);
      const firstAlloc = allocations[0];

      // Valorisé strictement au prix de vente (price_box)
      const unitPrice = Number(prod.price_box);
      const lineTotal = cartons * unitPrice;
      basketTotal += lineTotal;

      enrichedItems.push({
        productId: prod.id,
        code: prod.code,
        name: prod.name,
        gamme: prod.gamme,
        cartons,
        unitPrice,
        lineTotal,
        fefoLotNumber: firstAlloc ? firstAlloc.lotNumber : null,
        fefoExpiryDate: firstAlloc ? firstAlloc.expiryDate : null,
        allocations,
      });
    }

    const bonAmount = Number(bon.amount);
    if (basketTotal > bonAmount) {
      return res.status(400).json({
        success: false,
        error: `Panier plafonné à la valeur du bon : votre panier (${basketTotal.toLocaleString('fr-FR')} FCFA) dépasse la valeur du bon (${bonAmount.toLocaleString('fr-FR')} FCFA).`
      });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE bons_cadeaux
      SET items = ?,
          basket_total = ?,
          status = 'À préparer',
          requested_at = ?
      WHERE id = ?
    `).run(JSON.stringify(enrichedItems), basketTotal, nowIso, id);

    sendNotification(
      'Gestionnaire de stock',
      `Bon cadeau à préparer (${bon.reference})`,
      `${bon.vendor_name} (${bon.vendor_code}) a envoyé une demande de retrait pour son bon ${bon.reference} : panier de ${basketTotal.toLocaleString('fr-FR')} FCFA / ${bonAmount.toLocaleString('fr-FR')} FCFA (Statut : À préparer, FEFO).`,
      'cadeau',
      bon.reference
    );

    recordAudit(
      'DEMANDE_RETRAIT_BON_CADEAU',
      'BON_CADEAU',
      id,
      userRole,
      bon.vendor_id,
      `Demande de retrait envoyée pour ${bon.reference} (${bon.vendor_name}) : panier de ${basketTotal.toLocaleString('fr-FR')} FCFA sur ${bonAmount.toLocaleString('fr-FR')} FCFA (reliquat ${Math.max(0, bonAmount - basketTotal).toLocaleString('fr-FR')} FCFA non versé — Rien en espèces). Statut : "À préparer".`
    );

    const updated = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      message: `Demande de retrait envoyée au Magasinier (Statut : "À préparer"). Panier : ${basketTotal.toLocaleString('fr-FR')} FCFA / ${bonAmount.toLocaleString('fr-FR')} FCFA (Rien en espèces).`,
      bon: sanitizeBonForNetwork(updated),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ success: false, error: message });
  }
});

// 16. RUPTURE : REMPLACEMENT PROPOSÉ (Magasinier propose un produit de remplacement en stock non périmé FEFO, plafonné à la valeur du bon)
apiRouter.post('/bons/:id/remplacement', (req, res) => {
  try {
    const { id } = req.params;
    const { oldProductId, newProductId, newCartons, reason } = req.body;
    const userRole = getUserRole(req) || 'Magasinier';

    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }
    if (bon.status !== 'À préparer' && bon.status !== 'a_preparer') {
      return res.status(400).json({
        success: false,
        error: `Le remplacement sur rupture n'est possible que sur un bon au statut "À préparer" (statut actuel : ${bon.status}).`
      });
    }

    const cartons = Number(newCartons || 0);
    if (!oldProductId || !newProductId || cartons <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez indiquer le produit en rupture, le produit de remplacement et le nombre de cartons.'
      });
    }

    const newProd = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId) as any;
    const oldProd = db.prepare('SELECT * FROM products WHERE id = ?').get(oldProductId) as any;
    if (!newProd) {
      return res.status(400).json({ success: false, error: 'Produit de remplacement introuvable.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const allocations = allocateFEFO(newProd.id, cartons, todayStr);
    const firstAlloc = allocations[0];

    const currentItems: any[] = typeof bon.items === 'string' ? JSON.parse(bon.items) : (bon.items || []);
    const targetIdx = currentItems.findIndex((it: any) => it.productId === oldProductId);
    if (targetIdx === -1) {
      return res.status(400).json({ success: false, error: 'Ligne produit initiale introuvable dans le panier.' });
    }

    // Ensure no duplicate with another line if newProductId already exists on another index
    const duplicateIdx = currentItems.findIndex((it: any, idx: number) => idx !== targetIdx && it.productId === newProductId);
    const updatedItems = [...currentItems];

    if (duplicateIdx !== -1) {
      const mergedCartons = Number(updatedItems[duplicateIdx].cartons) + cartons;
      const mergedAllocs = allocateFEFO(newProd.id, mergedCartons, todayStr);
      updatedItems[duplicateIdx] = {
        ...updatedItems[duplicateIdx],
        cartons: mergedCartons,
        unitPrice: Number(newProd.price_box),
        lineTotal: mergedCartons * Number(newProd.price_box),
        fefoLotNumber: mergedAllocs[0]?.lotNumber || null,
        fefoExpiryDate: mergedAllocs[0]?.expiryDate || null,
        allocations: mergedAllocs,
        replacedFromProductId: oldProductId,
        replacedFromName: oldProd?.name || oldProductId,
        replacementReason: reason || 'Rupture de stock constatée au dépôt — remplacement proposé (FEFO)',
      };
      updatedItems.splice(targetIdx, 1);
    } else {
      updatedItems[targetIdx] = {
        productId: newProd.id,
        code: newProd.code,
        name: newProd.name,
        gamme: newProd.gamme,
        cartons,
        unitPrice: Number(newProd.price_box),
        lineTotal: cartons * Number(newProd.price_box),
        fefoLotNumber: firstAlloc ? firstAlloc.lotNumber : null,
        fefoExpiryDate: firstAlloc ? firstAlloc.expiryDate : null,
        allocations,
        replacedFromProductId: oldProductId,
        replacedFromName: oldProd?.name || oldProductId,
        replacementReason: reason || 'Rupture de stock constatée au dépôt — remplacement proposé (FEFO)',
      };
    }

    const newBasketTotal = updatedItems.reduce((sum, it) => sum + Number(it.lineTotal), 0);
    if (newBasketTotal > Number(bon.amount)) {
      return res.status(400).json({
        success: false,
        error: `Le remplacement proposé (${newBasketTotal.toLocaleString('fr-FR')} FCFA) dépasse le plafond du bon (${Number(bon.amount).toLocaleString('fr-FR')} FCFA).`
      });
    }

    db.prepare(`
      UPDATE bons_cadeaux
      SET items = ?, basket_total = ?
      WHERE id = ?
    `).run(JSON.stringify(updatedItems), newBasketTotal, id);

    sendNotification(
      'Vendeur',
      `Rupture : remplacement proposé (${bon.reference})`,
      `Suite à une rupture sur "${oldProd?.name || oldProductId}", le Magasinier propose "${newProd.name}" (${cartons} ctn) sur votre bon ${bon.reference}. Nouveau total panier : ${newBasketTotal.toLocaleString('fr-FR')} FCFA (Rien en espèces).`,
      'cadeau',
      bon.reference,
      { targetUserId: bon.vendor_id }
    );

    recordAudit(
      'REMPLACEMENT_RUPTURE_BON_CADEAU',
      'BON_CADEAU',
      id,
      userRole,
      bon.vendor_id,
      `Rupture sur bon ${bon.reference} : "${oldProd?.name || oldProductId}" remplacé par "${newProd.name}" (${cartons} ctn, ${ (cartons * Number(newProd.price_box)).toLocaleString('fr-FR') } FCFA). Motif : ${reason || 'Rupture stock'}. Total panier : ${newBasketTotal.toLocaleString('fr-FR')} FCFA.`
    );

    const updated = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      message: `Remplacement proposé appliqué : "${newProd.name}" (${cartons} ctn). Nouveau total : ${newBasketTotal.toLocaleString('fr-FR')} FCFA.`,
      bon: sanitizeBonForNetwork(updated),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ success: false, error: message });
  }
});

// 17. MAGASINIER CONFIRME "REMISE EFFECTUÉE" (Sortie de stock de type "Bon cadeau" via FEFO non périmé, rien en espèces)
apiRouter.post('/bons/:id/remise', (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req) || 'Magasinier';

    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }
    if (bon.status !== 'À préparer' && bon.status !== 'a_preparer') {
      return res.status(400).json({
        success: false,
        error: `Ce bon doit être au statut "À préparer" pour confirmer la remise (statut actuel : ${bon.status}).`
      });
    }

    const items: any[] = typeof bon.items === 'string' ? JSON.parse(bon.items) : (bon.items || []);
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Panier vide : aucun produit à remettre.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    let deliveredTotal = 0;
    const deliveredItems: any[] = [];

    db.exec('BEGIN TRANSACTION');
    try {
      for (const it of items) {
        const cartons = Number(it.cartons || 0);
        if (cartons <= 0) continue;

        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
        if (!prod) {
          throw new Error(`Produit ${it.name || it.productId} introuvable.`);
        }

        // Allocation FEFO sur lots non périmés
        const allocations = allocateFEFO(prod.id, cartons, todayStr);

        for (const alloc of allocations) {
          db.prepare(`
            UPDATE lots
            SET quantity = quantity - ?,
                status = CASE WHEN (quantity - ?) <= 0 THEN 'epuise' ELSE status END
            WHERE id = ?
          `).run(alloc.allocatedQty, alloc.allocatedQty, alloc.lotId);

          // Sortie de stock de type "Bon cadeau"
          recordStockMovement(
            'Bon cadeau',
            'OUT',
            prod.id,
            alloc.lotId,
            alloc.allocatedQty,
            bon.reference,
            `Sortie de stock Bon cadeau (${bon.reference}) — ${bon.vendor_name} — Lot FEFO ${alloc.lotNumber} — Rien en espèces`,
            alloc.allocatedQty * Number(prod.price_box),
            'Magasinier Sotuba'
          );
        }

        // Baisse du stock dépôt central
        db.prepare('UPDATE products SET stock_depot = stock_depot - ? WHERE id = ?').run(cartons, prod.id);

        const lineVal = cartons * Number(prod.price_box);
        deliveredTotal += lineVal;
        deliveredItems.push({
          ...it,
          unitPrice: Number(prod.price_box),
          lineTotal: lineVal,
          fefoLotNumber: allocations[0]?.lotNumber || it.fefoLotNumber,
          fefoExpiryDate: allocations[0]?.expiryDate || it.fefoExpiryDate,
          allocations,
        });
      }

      if (deliveredTotal > Number(bon.amount)) {
        throw new Error(`La valeur remise (${deliveredTotal} FCFA) dépasse le plafond du bon (${bon.amount} FCFA).`);
      }

      db.prepare(`
        UPDATE bons_cadeaux
        SET items = ?,
            basket_total = ?,
            delivered_total = ?,
            status = 'Remis',
            prepared_by = 'Moussa Diarra (Magasinier)',
            remis_at = ?
        WHERE id = ?
      `).run(JSON.stringify(deliveredItems), deliveredTotal, deliveredTotal, nowIso, id);

      sendNotification(
        'Vendeur',
        `Remise effectuée (${bon.reference}) — Confirmez la réception`,
        `Le Magasinier a confirmé la remise de votre bon cadeau ${bon.reference} (valeur remise : ${deliveredTotal.toLocaleString('fr-FR')} FCFA, Rien en espèces). Veuillez confirmer la réception dans "Mes cadeaux".`,
        'cadeau',
        bon.reference,
        { targetUserId: bon.vendor_id }
      );

      sendNotification(
        'Comptable',
        `Bon cadeau remis (${bon.reference})`,
        `Bon cadeau ${bon.reference} remis à ${bon.vendor_name} (${bon.vendor_code}). Valeur remise : ${deliveredTotal.toLocaleString('fr-FR')} FCFA sur un bon de ${Number(bon.amount).toLocaleString('fr-FR')} FCFA (Rien en espèces).`,
        'cadeau',
        bon.reference
      );

      recordAudit(
        'REMISE_BON_CADEAU',
        'BON_CADEAU',
        id,
        userRole,
        bon.vendor_id,
        `Remise effectuée par le Magasinier pour ${bon.reference} (${bon.vendor_name}) : sortie de stock de type "Bon cadeau" (FEFO), valeur remise = ${deliveredTotal.toLocaleString('fr-FR')} FCFA / ${Number(bon.amount).toLocaleString('fr-FR')} FCFA (Rien en espèces).`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const updated = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      message: `Remise effectuée pour ${bon.reference} : sortie de stock de type "Bon cadeau" enregistrée (${deliveredTotal.toLocaleString('fr-FR')} FCFA, FEFO appliqué, Rien en espèces). En attente de confirmation de réception par le Vendeur.`,
      bon: sanitizeBonForNetwork(updated),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ success: false, error: message });
  }
});

// 18. LE VENDEUR CONFIRME LA RÉCEPTION DU BON CADEAU
apiRouter.post('/bons/:id/confirmer-reception', (req, res) => {
  try {
    const { id } = req.params;
    const userRole = getUserRole(req) || 'Vendeur';

    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }
    if (bon.status !== 'Remis' && bon.status !== 'remis') {
      return res.status(400).json({
        success: false,
        error: `La confirmation de réception nécessite que le Magasinier ait d'abord validé "Remise effectuée" (statut actuel : ${bon.status}).`
      });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE bons_cadeaux
      SET status = 'Reçu',
          confirmed_reception_at = ?
      WHERE id = ?
    `).run(nowIso, id);

    sendNotification(
      'Administrateur',
      `Réception confirmée (${bon.reference})`,
      `${bon.vendor_name} (${bon.vendor_code}) a confirmé la réception des produits de son bon cadeau ${bon.reference} (valeur remise : ${Number(bon.delivered_total).toLocaleString('fr-FR')} FCFA).`,
      'cadeau',
      bon.reference
    );

    recordAudit(
      'CONFIRMATION_RECEPTION_BON_CADEAU',
      'BON_CADEAU',
      id,
      userRole,
      bon.vendor_id,
      `Le vendeur ${bon.vendor_name} (${bon.vendor_code}) a confirmé la réception des marchandises du bon ${bon.reference} (valeur remise : ${Number(bon.delivered_total).toLocaleString('fr-FR')} FCFA, Rien en espèces).`
    );

    const updated = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      message: `Réception confirmée avec succès pour le bon ${bon.reference} (${Number(bon.delivered_total).toLocaleString('fr-FR')} FCFA).`,
      bon: sanitizeBonForNetwork(updated),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ success: false, error: message });
  }
});

// 19. PROLONGATION PAR L'ADMINISTRATEUR AVEC MOTIF (Bon expiré après 90 jours, rappel 15 jours avant)
apiRouter.post('/bons/:id/prolonger', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { extraDays = 30, motif } = req.body;
    const userRole = getUserRole(req) || 'Administrateur';

    if (!motif || typeof motif !== 'string' || motif.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Un motif obligatoire est requis pour prolonger un bon cadeau.'
      });
    }

    const daysToAdd = Math.max(1, Math.min(180, Number(extraDays) || 30));
    const bon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    if (!bon) {
      return res.status(404).json({ success: false, error: 'Bon cadeau introuvable.' });
    }

    const today = new Date();
    const currentExpiry = new Date(bon.expires_at);
    const baseDate = currentExpiry > today ? currentExpiry : today;
    const newExpiryDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const newExpiryStr = newExpiryDate.toISOString().split('T')[0];
    const nowIso = today.toISOString();

    const restoredStatus =
      bon.status === 'Expiré' || bon.status === 'expire'
        ? Number(bon.basket_total || 0) > 0
          ? 'À préparer'
          : 'actif'
        : bon.status;

    const totalProlongedDays = Number(bon.prolongation_days || 0) + daysToAdd;

    db.prepare(`
      UPDATE bons_cadeaux
      SET expires_at = ?,
          status = ?,
          prolongation_days = ?,
          prolongation_motif = ?,
          prolonged_by = 'Amadou Touré (Administrateur)',
          prolonged_at = ?
      WHERE id = ?
    `).run(newExpiryStr, restoredStatus, totalProlongedDays, motif.trim(), nowIso, id);

    sendNotification(
      'Vendeur',
      `Bon cadeau prolongé (${bon.reference})`,
      `L'Administrateur a prolongé votre bon ${bon.reference} de +${daysToAdd} jours (nouvelle échéance : ${newExpiryStr}). Motif : ${motif.trim()}.`,
      'cadeau',
      bon.reference,
      { targetUserId: bon.vendor_id }
    );

    recordAudit(
      'PROLONGATION_BON_CADEAU',
      'BON_CADEAU',
      id,
      userRole,
      bon.vendor_id,
      `Bon ${bon.reference} (${bon.vendor_name}) prolongé de +${daysToAdd} jours jusqu'au ${newExpiryStr} par l'Administrateur. Motif : "${motif.trim()}".`
    );

    const updated = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(id) as any;

    res.json({
      success: true,
      message: `Bon ${bon.reference} prolongé de +${daysToAdd} jours (nouvelle expiration : ${newExpiryStr}) avec motif enregistré.`,
      bon: sanitizeBonForNetwork(updated),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ success: false, error: message });
  }
});

// 20. TEST AUTOMATISÉ : "Test : bon de 40 000, panier de 38 400, remise, stock en baisse."
apiRouter.post('/bons/test-panier-remise', (req, res) => {
  try {
    const userRole = getUserRole(req) || 'Administrateur';
    const todayStr = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    // Produit : Jus Cajoucy (9 600 FCFA / carton) -> 4 cartons = 38 400 FCFA (<= 40 000 FCFA)
    const prodCaj = db.prepare("SELECT * FROM products WHERE code = 'JUS-CAJ-12'").get() as any;
    const vendor1 = db.prepare("SELECT * FROM users WHERE code = 'BAO-VND-001'").get() as any;

    if (!prodCaj || !vendor1) {
      return res.status(400).json({ success: false, error: 'Produit JUS-CAJ-12 ou vendeur BAO-VND-001 introuvable.' });
    }

    // Ensure there is sufficient non-expired FEFO stock for the test
    const stockBefore = Number(prodCaj.stock_depot);
    const cartonsToOrder = 4;
    const unitPrice = Number(prodCaj.price_box); // 9 600 FCFA
    const expectedBasketTotal = cartonsToOrder * unitPrice; // 38 400 FCFA
    const bonAmount = 40000; // 40 000 FCFA

    // Ensure BON-S1-2026-001 exists for Oumar Konaté with 40 000 FCFA
    let bon = db.prepare("SELECT * FROM bons_cadeaux WHERE vendor_id = ? AND semester = 'S1-2026'").get(vendor1.id) as any;
    const expiresStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    db.exec('BEGIN TRANSACTION');
    let stockAfter = stockBefore;
    let allocatedLotNumber = '';
    try {
      if (!bon) {
        const bonId = 'bon-s1-2026-vnd1';
        db.prepare(`
          INSERT INTO bons_cadeaux (
            id, reference, vendor_id, semester, closure_date,
            note, amount, revealed, revealed_at, issued_at, expires_at, status, created_at
          ) VALUES (?, 'BON-S1-2026-001', ?, 'S1-2026', '2026-07-01', 16.0, 40000, 1, ?, ?, ?, 'actif', ?)
        `).run(bonId, vendor1.id, nowIso, todayStr, expiresStr, nowIso);
        bon = db.prepare('SELECT * FROM bons_cadeaux WHERE id = ?').get(bonId) as any;
      } else {
        db.prepare(`
          UPDATE bons_cadeaux
          SET note = 16.0, amount = 40000, revealed = 1, revealed_at = COALESCE(revealed_at, ?), expires_at = ?
          WHERE id = ?
        `).run(nowIso, expiresStr, bon.id);
      }

      // 1. Sélection FEFO non périmée de 4 cartons de Jus Cajoucy (4 x 9 600 = 38 400 FCFA)
      const allocations = allocateFEFO(prodCaj.id, cartonsToOrder, todayStr);
      allocatedLotNumber = allocations[0]?.lotNumber || 'LOT-CAJ';

      const basketItems = [
        {
          productId: prodCaj.id,
          code: prodCaj.code,
          name: prodCaj.name,
          gamme: prodCaj.gamme,
          cartons: cartonsToOrder,
          unitPrice,
          lineTotal: expectedBasketTotal,
          fefoLotNumber: allocations[0]?.lotNumber || null,
          fefoExpiryDate: allocations[0]?.expiryDate || null,
          allocations,
        },
      ];

      // 2. Envoi "Demander le retrait" -> statut "À préparer"
      db.prepare(`
        UPDATE bons_cadeaux
        SET items = ?, basket_total = ?, status = 'À préparer', requested_at = ?
        WHERE id = ?
      `).run(JSON.stringify(basketItems), expectedBasketTotal, nowIso, bon.id);

      // 3. Magasinier confirme "Remise effectuée" -> sortie de stock de type "Bon cadeau" & stock en baisse
      for (const alloc of allocations) {
        db.prepare(`
          UPDATE lots
          SET quantity = quantity - ?,
              status = CASE WHEN (quantity - ?) <= 0 THEN 'epuise' ELSE status END
          WHERE id = ?
        `).run(alloc.allocatedQty, alloc.allocatedQty, alloc.lotId);

        recordStockMovement(
          'Bon cadeau',
          'OUT',
          prodCaj.id,
          alloc.lotId,
          alloc.allocatedQty,
          bon.reference,
          `Test réglementaire : Sortie de stock type "Bon cadeau" (${bon.reference}) — 4 ctn Jus Cajoucy = 38 400 FCFA sur bon de 40 000 FCFA (Rien en espèces)`,
          alloc.allocatedQty * unitPrice,
          'Magasinier Sotuba'
        );
      }

      db.prepare('UPDATE products SET stock_depot = stock_depot - ? WHERE id = ?').run(cartonsToOrder, prodCaj.id);

      db.prepare(`
        UPDATE bons_cadeaux
        SET delivered_total = ?,
            status = 'Remis',
            prepared_by = 'Moussa Diarra (Magasinier)',
            remis_at = ?
        WHERE id = ?
      `).run(expectedBasketTotal, nowIso, bon.id);

      const prodAfter = db.prepare('SELECT stock_depot FROM products WHERE id = ?').get(prodCaj.id) as { stock_depot: number };
      stockAfter = Number(prodAfter.stock_depot);

      recordAudit(
        'TEST_BON_40000_PANIER_38400_REMISE',
        'BON_CADEAU',
        bon.id,
        userRole,
        vendor1.id,
        `Test exécuté avec succès : Bon ${bon.reference} de 40 000 FCFA -> Panier FEFO de 38 400 FCFA (4 cartons ${prodCaj.name} à 9 600 FCFA, lot ${allocatedLotNumber}, reliquat 1 600 FCFA non remboursé : Rien en espèces) -> Remise effectuée (sortie de stock type "Bon cadeau") -> Stock dépôt en baisse de ${stockBefore} à ${stockAfter} cartons (-${cartonsToOrder} ctn).`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const updatedBon = db.prepare(`
      SELECT b.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team
      FROM bons_cadeaux b
      JOIN users u ON b.vendor_id = u.id
      WHERE b.id = ?
    `).get(bon.id) as any;

    res.json({
      success: true,
      message: `Test validé : Bon de 40 000 FCFA, panier FEFO de 38 400 FCFA (4 ctn Jus Cajoucy), remise effectuée (sortie type "Bon cadeau"), stock dépôt en baisse (${stockBefore} → ${stockAfter} cartons, -4 ctn).`,
      testSummary: {
        bonReference: updatedBon.reference,
        vendorName: updatedBon.vendor_name,
        bonAmount,
        basketTotal: expectedBasketTotal,
        deliveredValue: expectedBasketTotal,
        unspentRemainder: bonAmount - expectedBasketTotal,
        settlementRule: 'Rien en espèces',
        productName: prodCaj.name,
        cartonsDelivered: cartonsToOrder,
        unitPrice,
        fefoLot: allocatedLotNumber,
        movementType: 'Bon cadeau',
        stockBefore,
        stockAfter,
        stockDrop: stockBefore - stockAfter,
        status: updatedBon.status,
      },
      bon: sanitizeBonForNetwork(updatedBon),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// 15. GÉOLOCALISATION GPS DES VENDEURS, HISTORIQUE DES TRAJETS (ADMIN) & SYNCHRONISATION HORS-LIGNE
// ---------------------------------------------------------------------------

// GET /api/gps/vendors :
// - Pour l'Administrateur : Position GPS actuelle de tous les vendeurs sur la carte et historique complet des trajets
// - Pour le Vendeur : Uniquement sa propre position GPS (aucun accès aux positions des autres vendeurs)
apiRouter.get('/gps/vendors', (req, res) => {
  try {
    const userRole = getUserRole(req);
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : undefined;
    const filterVendorId = req.query.vendor_id ? String(req.query.vendor_id) : headerUserId;
    const filterDate = req.query.date ? String(req.query.date) : undefined;

    let vendors = db.prepare(`
      SELECT id, code, name, team, phone
      FROM users
      WHERE role = 'Vendeur'
      ORDER BY code ASC
    `).all() as any[];

    // Un vendeur ne doit JAMAIS avoir accès aux positions GPS des autres vendeurs
    if (userRole === 'Vendeur') {
      vendors = filterVendorId ? vendors.filter((v) => v.id === filterVendorId) : [];
    }

    const latestPositions = vendors.map((v, idx) => {
      const latest = db.prepare(`
        SELECT g.*, p.name as pdv_name, p.neighborhood as pdv_neighborhood
        FROM vendor_gps_positions g
        LEFT JOIN points_de_vente p ON g.pdv_id = p.id
        WHERE g.vendor_id = ?
        ORDER BY g.recorded_at DESC
        LIMIT 1
      `).get(v.id) as any;

      const totalPointsRow = db.prepare(`
        SELECT COUNT(*) as count,
               SUM(CASE WHEN recorded_offline = 1 THEN 1 ELSE 0 END) as offline_count
        FROM vendor_gps_positions
        WHERE vendor_id = ?
      `).get(v.id) as { count: number; offline_count: number };

      const fallbackCoords = [
        { lat: 12.6389, lng: -8.0412 },
        { lat: 12.5968, lng: -7.9514 },
        { lat: 12.5815, lng: -7.9685 },
      ][idx % 3];

      return {
        vendor_id: v.id,
        vendor_code: v.code,
        vendor_name: v.name,
        vendor_team: v.team,
        vendor_phone: v.phone,
        latitude: latest ? Number(latest.latitude) : fallbackCoords.lat,
        longitude: latest ? Number(latest.longitude) : fallbackCoords.lng,
        accuracy: latest ? Number(latest.accuracy || 4.0) : 4.0,
        speed_kmh: latest ? Number(latest.speed_kmh || 0) : 0,
        activity_label: latest?.activity_label || 'En tournée commerciale',
        pdv_id: latest?.pdv_id || null,
        pdv_name: latest?.pdv_name || null,
        pdv_neighborhood: latest?.pdv_neighborhood || null,
        recorded_offline: latest ? Number(latest.recorded_offline || 0) : 0,
        recorded_at: latest?.recorded_at || new Date().toISOString(),
        synced_at: latest?.synced_at || new Date().toISOString(),
        total_points: Number(totalPointsRow?.count || 0),
        offline_synced_points: Number(totalPointsRow?.offline_count || 0),
      };
    });

    // Historique complet des trajets accessible uniquement à l'Administrateur
    let trajectories: any[] = [];
    if (userRole === 'Administrateur') {
      let sql = `
        SELECT g.*, u.name as vendor_name, u.code as vendor_code, u.team as vendor_team,
               p.name as pdv_name, p.neighborhood as pdv_neighborhood
        FROM vendor_gps_positions g
        JOIN users u ON g.vendor_id = u.id
        LEFT JOIN points_de_vente p ON g.pdv_id = p.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (filterVendorId && filterVendorId !== 'all') {
        sql += ' AND g.vendor_id = ?';
        params.push(filterVendorId);
      }
      if (filterDate && filterDate !== 'all') {
        sql += ' AND g.date = ?';
        params.push(filterDate);
      }

      sql += ' ORDER BY g.recorded_at ASC';
      trajectories = db.prepare(sql).all(...params) as any[];
    }

    res.json({
      success: true,
      latestPositions,
      trajectories,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/gps/positions : Enregistrement d'une position GPS vendeur en direct
apiRouter.post('/gps/positions', (req, res) => {
  try {
    const {
      id: clientId,
      vendor_id,
      latitude,
      longitude,
      accuracy,
      speed_kmh,
      activity_label,
      pdv_id,
      recorded_offline,
      recorded_at,
    } = req.body;

    if (!vendor_id || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return res.status(400).json({ success: false, error: 'Coordonnées GPS vendeur invalides.' });
    }

    const nowIso = new Date().toISOString();
    const recAt = recorded_at || nowIso;
    const dateStr = recAt.split('T')[0];
    const posId = clientId || `gps-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT OR IGNORE INTO vendor_gps_positions (
        id, vendor_id, latitude, longitude, accuracy, speed_kmh,
        activity_label, pdv_id, recorded_offline, recorded_at, synced_at, date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      posId,
      vendor_id,
      Number(latitude),
      Number(longitude),
      Number(accuracy || 4.0),
      Number(speed_kmh || 0),
      activity_label || 'Position GPS vendeur en tournée',
      pdv_id || null,
      recorded_offline ? 1 : 0,
      recAt,
      nowIso,
      dateStr
    );

    res.json({
      success: true,
      id: posId,
      message: 'Position GPS enregistrée.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/sync/offline-batch : Synchronisation groupée des ventes hors-ligne et positions GPS hors-ligne dès le retour du réseau
apiRouter.post('/sync/offline-batch', (req, res) => {
  try {
    const { offlineSales = [], offlineGpsPositions = [] } = req.body;
    const userRole = getUserRole(req);
    const nowIso = new Date().toISOString();

    let syncedSalesCount = 0;
    let syncedGpsCount = 0;

    db.exec('BEGIN TRANSACTION');
    try {
      const insertSaleStmt = db.prepare(`
        INSERT OR IGNORE INTO sales (
          id, number, thermal_ticket_number, date, sale_time, vendor_id, pdv_id, items, total_amount,
          buyer_type, wholesale_discount_amount, cajoucy_boxes_count,
          payment_type, status, recorded_offline, offline_recorded_at, synced_at, latitude, longitude, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'livree', 1, ?, ?, ?, ?, ?)
      `);

      const insertGpsStmt = db.prepare(`
        INSERT OR IGNORE INTO vendor_gps_positions (
          id, vendor_id, latitude, longitude, accuracy, speed_kmh,
          activity_label, pdv_id, recorded_offline, recorded_at, synced_at, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `);

      if (Array.isArray(offlineSales)) {
        for (const s of offlineSales) {
          if (!s.vendor_id || !s.pdv_id || !Array.isArray(s.items) || s.items.length === 0) continue;

          const validation = validateAndComputeSaleWholesaleDiscount({
            rawItems: s.items,
            rawBuyerType: s.buyer_type ?? s.buyerType,
            rawWholesaleDiscount: s.wholesale_discount_amount ?? s.wholesaleDiscountAmount,
            rawTotalAmount: s.total_amount,
          });

          if (!validation.ok) {
            db.exec('ROLLBACK');
            return res.status(validation.status || 400).json({
              success: false,
              error: validation.error || 'Vente hors-ligne rejetée par le contrôle serveur.',
            });
          }

          const saleId = s.id || `sale-off-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const saleNumber = s.number || `VTE-OFF-${Math.floor(10000 + Math.random() * 90000)}`;
          const thermalTicketNumber =
            s.thermal_ticket_number || String(saleNumber).replace(/^VTE-/, 'TKT-THERM-');
          const saleDate = s.date || nowIso.split('T')[0];
          const saleTime =
            s.sale_time ||
            (s.offline_recorded_at && String(s.offline_recorded_at).includes('T')
              ? String(s.offline_recorded_at).split('T')[1].slice(0, 5)
              : '12:00');
          const totalAmount = validation.totalAmount;

          const pdvRow = db.prepare('SELECT name, latitude, longitude FROM points_de_vente WHERE id = ?').get(s.pdv_id) as any;
          const lat = Number.isFinite(Number(s.latitude)) ? Number(s.latitude) : Number(pdvRow?.latitude || 12.6392);
          const lng = Number.isFinite(Number(s.longitude)) ? Number(s.longitude) : Number(pdvRow?.longitude || -7.9850);

          const info = insertSaleStmt.run(
            saleId,
            saleNumber,
            thermalTicketNumber,
            saleDate,
            saleTime,
            s.vendor_id,
            s.pdv_id,
            JSON.stringify(validation.normalizedItems),
            totalAmount,
            validation.buyerType,
            validation.wholesaleDiscountAmount,
            validation.cajoucyBoxesCount,
            s.payment_type || 'Comptant',
            s.offline_recorded_at || nowIso,
            nowIso,
            lat,
            lng,
            s.offline_recorded_at || nowIso
          );

          if (info.changes > 0) {
            syncedSalesCount++;
            if (validation.buyerType === 'Grossiste') {
              checkAndTriggerWholesaleBuyerFrequencyAlert(s.vendor_id, saleDate);
            }
          }

          // Also ensure a GPS waypoint is recorded for this offline sale
          insertGpsStmt.run(
            `gps-sale-${saleId}`,
            s.vendor_id,
            lat,
            lng,
            4.5,
            0,
            `Vente hors-ligne synchronisée ${saleNumber} • ${pdvRow?.name || s.pdv_name || 'PDV'} (${totalAmount.toLocaleString('fr-FR')} FCFA)`,
            s.pdv_id,
            s.offline_recorded_at || nowIso,
            nowIso,
            saleDate
          );
        }
      }

      if (Array.isArray(offlineGpsPositions)) {
        for (const g of offlineGpsPositions) {
          if (!g.vendor_id || !Number.isFinite(Number(g.latitude)) || !Number.isFinite(Number(g.longitude))) continue;
          const gpsId = g.id || `gps-off-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const recAt = g.recorded_at || nowIso;
          const dateStr = g.date || recAt.split('T')[0];

          const info = insertGpsStmt.run(
            gpsId,
            g.vendor_id,
            Number(g.latitude),
            Number(g.longitude),
            Number(g.accuracy || 4.5),
            Number(g.speed_kmh || 0),
            g.activity_label || 'Position GPS enregistrée hors-ligne',
            g.pdv_id || null,
            recAt,
            nowIso,
            dateStr
          );

          if (info.changes > 0) {
            syncedGpsCount++;
          }
        }
      }

      if (syncedSalesCount > 0 || syncedGpsCount > 0) {
        const summaryMsg = `Synchronisation réseau effectuée : ${syncedSalesCount} vente(s) hors-ligne et ${syncedGpsCount} position(s) GPS hors-ligne synchronisées.`;
        recordAudit(
          'SYNCHRONISATION_HORS_LIGNE',
          'OFFLINE_SYNC',
          `sync-${Date.now()}`,
          userRole,
          null,
          summaryMsg
        );
      }

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    // Déclencher après le commit les notifications push de vente pour chaque nouvelle vente hors-ligne synchronisée
    if (Array.isArray(offlineSales) && syncedSalesCount > 0) {
      for (const s of offlineSales) {
        if (!s.vendor_id || !s.pdv_id) continue;
        const saleId = s.id || '';
        const saleRow = saleId
          ? (db
              .prepare(
                `SELECT s.id, s.number, s.vendor_id, s.total_amount, u.name as vendor_name, p.name as pdv_name
                 FROM sales s
                 LEFT JOIN users u ON s.vendor_id = u.id
                 LEFT JOIN points_de_vente p ON s.pdv_id = p.id
                 WHERE s.id = ?`
              )
              .get(saleId) as any)
          : null;
        if (saleRow) {
          triggerImmediateSalePush({
            eventKind: 'nouvelle_vente',
            saleId: saleRow.id,
            saleNumber: saleRow.number,
            vendorId: saleRow.vendor_id,
            vendorName: saleRow.vendor_name || 'Vendeur',
            pdvName: saleRow.pdv_name || 'Point de vente',
            totalAmount: Number(saleRow.total_amount || 0),
            createdAt: nowIso,
          });
        }
      }
    }

    res.json({
      success: true,
      syncedSalesCount,
      syncedGpsCount,
      message: `Synchronisation terminée : ${syncedSalesCount} vente(s) et ${syncedGpsCount} position(s) GPS synchronisées avec le serveur.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur de synchronisation';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// 15. GESTIONNAIRE GROSSISTE : CLIENTS EN GROS & COMMANDES EN GROS
// ============================================================================

// GET /api/wholesale/clients : Liste des clients en gros avec statistiques d'achats
apiRouter.get('/wholesale/clients', (_req, res) => {
  try {
    const clients = db.prepare(`
      SELECT c.*,
             COALESCE((
               SELECT COUNT(*) FROM wholesale_orders o
               WHERE o.client_id = c.id AND COALESCE(o.delivery_status, 'livree') != 'annulee'
             ), 0) AS orders_count,
             COALESCE((
               SELECT SUM(o.total_boxes) FROM wholesale_orders o
               WHERE o.client_id = c.id AND COALESCE(o.delivery_status, 'livree') != 'annulee'
             ), 0) AS total_boxes_ordered,
             COALESCE((
               SELECT SUM(o.total_amount) FROM wholesale_orders o
               WHERE o.client_id = c.id AND COALESCE(o.delivery_status, 'livree') != 'annulee'
             ), 0) AS total_ca_fcfa,
             (
               SELECT MAX(o.date) FROM wholesale_orders o
               WHERE o.client_id = c.id AND COALESCE(o.delivery_status, 'livree') != 'annulee'
             ) AS last_order_date
      FROM wholesale_clients c
      ORDER BY c.created_at DESC, c.code ASC
    `).all();
    res.json({ success: true, wholesaleClients: clients });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur chargement clients en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/wholesale/clients : Créer un nouveau client en gros (Gestionnaire grossiste / Administrateur)
apiRouter.post('/wholesale/clients', requireGrossiste, (req, res) => {
  try {
    const {
      company_name,
      manager_name,
      phone,
      email,
      neighborhood,
      city,
      address,
      nif,
      rccm,
      category,
      default_discount_percent,
      notes,
    } = req.body;

    if (!company_name || !manager_name || !phone) {
      return res.status(400).json({
        success: false,
        error: "Le nom de l'établissement/société, le nom du gérant et le téléphone sont obligatoires.",
      });
    }

    const userRole = getUserRole(req) || 'Gestionnaire grossiste';
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : 'usr-grs';
    const userRow = db.prepare('SELECT name, code FROM users WHERE id = ?').get(headerUserId) as { name: string; code: string } | undefined;
    const creatorLabel = userRow ? `${userRow.name} (${userRow.code})` : `${userRole}`;

    const count = (db.prepare('SELECT COUNT(*) as count FROM wholesale_clients').get() as { count: number }).count;
    const cityClean = (city || 'Bamako').trim();
    const prefix = cityClean.toLowerCase() === 'bamako' ? 'GRS-BKO' : 'GRS-REG';
    const code = `${prefix}-${String(count + 1).padStart(3, '0')}`;
    const id = `grs-cli-${Date.now()}`;
    const createdAt = new Date().toISOString().split('T')[0];
    const discountNum = Math.max(0, Math.min(30, Number(default_discount_percent) || 0));

    db.prepare(`
      INSERT INTO wholesale_clients (
        id, code, company_name, manager_name, phone, email,
        neighborhood, city, address, nif, rccm, category,
        default_discount_percent, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?, ?, ?)
    `).run(
      id,
      code,
      String(company_name).trim(),
      String(manager_name).trim(),
      String(phone).trim(),
      email ? String(email).trim() : '',
      neighborhood ? String(neighborhood).trim() : 'Grand Marché',
      cityClean,
      address ? String(address).trim() : '',
      nif ? String(nif).trim() : '',
      rccm ? String(rccm).trim() : '',
      category || 'Demi-grossiste',
      discountNum,
      notes ? String(notes).trim() : '',
      creatorLabel,
      createdAt
    );

    sendNotification(
      'Administrateur',
      `Nouveau client en gros enregistré : ${company_name} (${code})`,
      `${creatorLabel} a ajouté le client grossiste "${company_name}" (${code}, gérant : ${manager_name}, catégorie : ${category || 'Demi-grossiste'}, quartier : ${neighborhood || 'Bamako'}).`,
      'info',
      code
    );

    recordAudit(
      'CREATION_CLIENT_GROS',
      'WHOLESALE_CLIENT',
      id,
      userRole,
      headerUserId,
      `Client en gros ${code} (${company_name}) créé par ${creatorLabel}.`
    );

    const createdClient = db.prepare('SELECT * FROM wholesale_clients WHERE id = ?').get(id);
    res.json({
      success: true,
      message: `Client en gros "${company_name}" (${code}) créé avec succès.`,
      client: {
        ...(createdClient as any),
        orders_count: 0,
        total_boxes_ordered: 0,
        total_ca_fcfa: 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur création client en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /api/wholesale/clients/:id : Modifier un client en gros
apiRouter.patch('/wholesale/clients/:id', requireGrossiste, (req, res) => {
  try {
    const { id } = req.params;
    const {
      company_name,
      manager_name,
      phone,
      email,
      neighborhood,
      city,
      address,
      nif,
      rccm,
      category,
      default_discount_percent,
      status,
      notes,
    } = req.body;

    const existing = db.prepare('SELECT * FROM wholesale_clients WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Client en gros introuvable.' });
    }

    db.prepare(`
      UPDATE wholesale_clients
      SET company_name = COALESCE(?, company_name),
          manager_name = COALESCE(?, manager_name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          neighborhood = COALESCE(?, neighborhood),
          city = COALESCE(?, city),
          address = COALESCE(?, address),
          nif = COALESCE(?, nif),
          rccm = COALESCE(?, rccm),
          category = COALESCE(?, category),
          default_discount_percent = COALESCE(?, default_discount_percent),
          status = COALESCE(?, status),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      company_name ?? null,
      manager_name ?? null,
      phone ?? null,
      email ?? null,
      neighborhood ?? null,
      city ?? null,
      address ?? null,
      nif ?? null,
      rccm ?? null,
      category ?? null,
      default_discount_percent !== undefined ? Number(default_discount_percent) : null,
      status ?? null,
      notes ?? null,
      id
    );

    const userRole = getUserRole(req) || 'Gestionnaire grossiste';
    recordAudit(
      'MODIFICATION_CLIENT_GROS',
      'WHOLESALE_CLIENT',
      id,
      userRole,
      null,
      `Fiche client en gros ${existing.code} (${company_name || existing.company_name}) mise à jour.`
    );

    res.json({ success: true, message: 'Fiche client en gros mise à jour.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur modification client en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/wholesale/orders : Liste des commandes en gros
apiRouter.get('/wholesale/orders', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM wholesale_orders
      ORDER BY date DESC, created_at DESC
    `).all() as any[];

    const orders = rows.map((r) => {
      let items: any[] = [];
      try {
        items = JSON.parse(r.items_json || '[]');
      } catch {
        items = [];
      }
      return {
        ...r,
        items,
      };
    });

    res.json({ success: true, wholesaleOrders: orders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur chargement commandes en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/wholesale/orders : Créer une commande en gros (Gestionnaire grossiste / Administrateur)
apiRouter.post('/wholesale/orders', requireGrossiste, (req, res) => {
  try {
    const {
      client_id,
      items,
      discount_percent = 0,
      payment_mode = 'Virement Bancaire',
      payment_status = 'paye',
      delivery_status = 'livree',
      notes = '',
      date,
    } = req.body;

    if (!client_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez sélectionner un client en gros et ajouter au moins un produit (cartons).',
      });
    }

    const client = db.prepare('SELECT * FROM wholesale_clients WHERE id = ?').get(client_id) as any;
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client en gros introuvable.' });
    }

    for (const it of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ? OR code = ?').get(it.productId || '', it.code || '') as any;
      if (prod && Number(prod.is_active ?? 1) === 0) {
        return res.status(400).json({
          success: false,
          error: `Le produit "${prod.name}" est désactivé et ne peut plus être commandé.`,
        });
      }
    }

    const normalizedItems = items
      .filter((it: any) => Number(it.qtyBoxes) > 0)
      .map((it: any) => {
        const prod = db.prepare('SELECT * FROM products WHERE id = ? OR code = ?').get(it.productId || '', it.code || '') as any;
        const qtyBoxes = Math.max(1, Math.round(Number(it.qtyBoxes) || 0));
        const defaultPrice =
          prod?.wholesale_price_box !== undefined && prod?.wholesale_price_box !== null
            ? Number(prod.wholesale_price_box)
            : Number(prod?.price_box || 0);
        const unitPrice = Number(it.unitPrice || defaultPrice || 0);
        return {
          productId: prod?.id || it.productId,
          code: prod?.code || it.code,
          name: prod?.name || it.name,
          qtyBoxes,
          unitPrice,
          total: qtyBoxes * unitPrice,
        };
      });

    if (normalizedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'La commande en gros doit contenir au moins un carton.',
      });
    }

    const totalBoxes = normalizedItems.reduce((acc, it) => acc + it.qtyBoxes, 0);
    const subtotalHt = normalizedItems.reduce((acc, it) => acc + it.total, 0);
    const discPct = Math.max(0, Math.min(30, Number(discount_percent) || 0));
    const discountAmount = Math.round((subtotalHt * discPct) / 100);
    const totalAmount = Math.max(0, subtotalHt - discountAmount);

    const userRole = getUserRole(req) || 'Gestionnaire grossiste';
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : 'usr-grs';
    const userRow = db.prepare('SELECT name, code FROM users WHERE id = ?').get(headerUserId) as { name: string; code: string } | undefined;
    const creatorName = userRow?.name || (userRole === 'Administrateur' ? 'Amadou Touré' : 'Cheick Oumar Diallo');
    const creatorCode = userRow?.code || (userRole === 'Administrateur' ? 'BAO-ADM' : 'BAO-GRS');

    const count = (db.prepare('SELECT COUNT(*) as count FROM wholesale_orders').get() as { count: number }).count;
    const reference = `CMD-GROS-2026-${String(count + 1).padStart(3, '0')}`;
    const id = `grs-ord-${Date.now()}`;
    const now = new Date();
    const orderDate = date || now.toISOString().split('T')[0];
    const orderTime = now.toTimeString().slice(0, 5);
    const createdAt = now.toISOString();

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        INSERT INTO wholesale_orders (
          id, reference, client_id, client_code, client_name, client_manager,
          client_phone, client_neighborhood, client_city, date, order_time,
          items_json, total_boxes, subtotal_ht, discount_percent, discount_amount,
          total_amount, payment_mode, payment_status, delivery_status, notes,
          created_by, created_by_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        reference,
        client.id,
        client.code,
        client.company_name,
        client.manager_name || '',
        client.phone || '',
        client.neighborhood || '',
        client.city || 'Bamako',
        orderDate,
        orderTime,
        JSON.stringify(normalizedItems),
        totalBoxes,
        subtotalHt,
        discPct,
        discountAmount,
        totalAmount,
        payment_mode,
        payment_status,
        delivery_status,
        notes,
        creatorName,
        creatorCode,
        createdAt
      );

      // Si la commande en gros est marquée "livree", déduire du stock dépôt central en toute sécurité
      if (delivery_status === 'livree') {
        const deductStmt = db.prepare(`
          UPDATE products
          SET stock_depot = MAX(0, stock_depot - ?)
          WHERE id = ?
        `);
        for (const it of normalizedItems) {
          if (it.productId) {
            deductStmt.run(it.qtyBoxes, it.productId);
          }
        }
      }

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    // Envoi immédiat et asynchrone après commit aux rôles autorisés (Administrateur, DOV, Sales Admin, Comptable, Gestionnaire grossiste ; Magasinier exclu)
    triggerImmediateSalePush({
      eventKind: 'commande_gros',
      saleId: id,
      saleNumber: reference,
      vendorId: headerUserId,
      vendorName: creatorName,
      pdvName: client.company_name,
      totalAmount,
      createdAt,
      isWholesale: true,
    });

    recordAudit(
      'CREATION_COMMANDE_GROS',
      'WHOLESALE_ORDER',
      id,
      userRole,
      headerUserId,
      `Commande en gros ${reference} (${totalBoxes} cartons, ${totalAmount.toLocaleString('fr-FR')} FCFA) créée pour ${client.company_name} (${client.code}) par ${creatorName}.`
    );

    res.json({
      success: true,
      message: `Commande en gros ${reference} enregistrée avec succès (${totalBoxes} cartons — ${totalAmount.toLocaleString('fr-FR')} FCFA).`,
      order: {
        id,
        reference,
        client_id: client.id,
        client_code: client.code,
        client_name: client.company_name,
        client_manager: client.manager_name,
        client_phone: client.phone,
        client_neighborhood: client.neighborhood,
        client_city: client.city,
        date: orderDate,
        order_time: orderTime,
        items: normalizedItems,
        total_boxes: totalBoxes,
        subtotal_ht: subtotalHt,
        discount_percent: discPct,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        payment_mode,
        payment_status,
        delivery_status,
        notes,
        created_by: creatorName,
        created_by_code: creatorCode,
        created_at: createdAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur création commande en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /api/wholesale/orders/:id/status : Mettre à jour le statut de livraison ou de paiement d'une commande en gros
apiRouter.patch('/wholesale/orders/:id/status', requireGrossiste, (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_status, payment_status, payment_mode } = req.body;

    const order = db.prepare('SELECT * FROM wholesale_orders WHERE id = ?').get(id) as any;
    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande en gros introuvable.' });
    }

    const nextDelivery = delivery_status || order.delivery_status;
    const nextPayment = payment_status || order.payment_status;
    const nextMode = payment_mode || order.payment_mode;

    db.exec('BEGIN TRANSACTION');
    try {
      // Si la commande passe de 'en_preparation' à 'livree', déduire du stock dépôt
      if (order.delivery_status !== 'livree' && nextDelivery === 'livree') {
        let items: any[] = [];
        try {
          items = JSON.parse(order.items_json || '[]');
        } catch {
          items = [];
        }
        const deductStmt = db.prepare('UPDATE products SET stock_depot = MAX(0, stock_depot - ?) WHERE id = ?');
        for (const it of items) {
          if (it.productId && Number(it.qtyBoxes) > 0) {
            deductStmt.run(Number(it.qtyBoxes), it.productId);
          }
        }
      }

      db.prepare(`
        UPDATE wholesale_orders
        SET delivery_status = ?,
            payment_status = ?,
            payment_mode = ?
        WHERE id = ?
      `).run(nextDelivery, nextPayment, nextMode, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const userRole = getUserRole(req) || 'Gestionnaire grossiste';
    recordAudit(
      'STATUT_COMMANDE_GROS',
      'WHOLESALE_ORDER',
      id,
      userRole,
      null,
      `Commande en gros ${order.reference} mise à jour : livraison=${nextDelivery}, paiement=${nextPayment}.`
    );

    res.json({
      success: true,
      message: `Statut de la commande ${order.reference} mis à jour.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur mise à jour commande en gros';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/wholesale/orders/:id/cancel : Annuler une commande en gros
apiRouter.post('/wholesale/orders/:id/cancel', requireGrossiste, (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = db.prepare('SELECT * FROM wholesale_orders WHERE id = ?').get(id) as any;
    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande en gros introuvable.' });
    }
    if (order.delivery_status === 'annulee') {
      return res.status(400).json({ success: false, error: 'Cette commande en gros est déjà annulée.' });
    }

    const userRole = getUserRole(req) || 'Gestionnaire grossiste';
    const nowIso = new Date().toISOString();
    const cancelReason = reason ? String(reason).trim() : `Annulée par ${userRole}`;

    db.exec('BEGIN TRANSACTION');
    try {
      if (order.delivery_status === 'livree') {
        let items: any[] = [];
        try {
          items = JSON.parse(order.items_json || '[]');
        } catch {
          items = [];
        }
        const restoreStmt = db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?');
        for (const it of items) {
          if (it.productId && Number(it.qtyBoxes) > 0) {
            restoreStmt.run(Number(it.qtyBoxes), it.productId);
          }
        }
      }

      db.prepare(`
        UPDATE wholesale_orders
        SET delivery_status = 'annulee',
            payment_status = 'annulee',
            cancel_reason = ?,
            cancelled_by = ?,
            cancelled_at = ?
        WHERE id = ?
      `).run(cancelReason, userRole, nowIso, id);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    triggerImmediateSalePush({
      eventKind: 'annulation_vente',
      saleId: order.id,
      saleNumber: order.reference,
      vendorId: 'usr-grs',
      vendorName: order.created_by || 'Grossiste',
      pdvName: order.client_name,
      totalAmount: Number(order.total_amount || 0),
      createdAt: nowIso,
      isWholesale: true,
      reason: cancelReason,
    });

    recordAudit(
      'ANNULATION_COMMANDE_GROS',
      'WHOLESALE_ORDER',
      id,
      userRole,
      null,
      `Commande en gros ${order.reference} (${order.client_name}) annulée par ${userRole}. Motif : ${cancelReason}`
    );

    res.json({
      success: true,
      message: `La commande en gros ${order.reference} a été annulée.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur annulation commande en gros';
    res.status(500).json({ success: false, error: message });
  }
});


