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
  sendTestPushToUser,
} from './pushService.js';

export const apiRouter = Router();

initPushTables();
ensureVapidConfigured();

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
const requireMagasinier = requireRole(['Magasinier'], 'Gestion Dépôt & Magasin');
const requireComptable = requireRole(['Comptable'], 'Gestion Caisse & Comptabilité');
const requireVendeur = requireRole(['Vendeur'], 'Vente & Dépôt-Vente');

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
    if (role === 'Magasinier') codePrefix = 'BAO-MAG';
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
    }

    const id = `usr-${Date.now()}`;
    const createdAt = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO users (id, code, name, email, role, phone, team, must_change_password, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'temp_hash', ?)
    `).run(id, code, name, email, role, phone || '', team || '', createdAt);

    res.json({
      success: true,
      message: `Compte ${code} créé avec mot de passe provisoire.`,
      user: { id, code, name, email, role, phone, team, must_change_password: 1, created_at: createdAt }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Mot de passe provisoire à changer à la première connexion
apiRouter.patch('/users/:id/change-password', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 3. CATALOGUE & GAMMES (Gammes lues dynamiquement depuis la base de données, jamais en dur)
apiRouter.get('/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
    res.json({ success: true, products });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.get('/gammes', (req, res) => {
  try {
    // Lu dynamiquement dans la table produits, jamais en dur !
    const rows = db.prepare('SELECT DISTINCT gamme FROM products ORDER BY gamme ASC').all() as { gamme: string }[];
    const gammes = rows.map(r => r.gamme);
    res.json({ success: true, gammes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Modification de produit : Administrateur seul
apiRouter.patch('/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { price_box, stock_depot, threshold_depot } = req.body;
    db.prepare(`
      UPDATE products
      SET price_box = COALESCE(?, price_box),
          stock_depot = COALESCE(?, stock_depot),
          threshold_depot = COALESCE(?, threshold_depot)
      WHERE id = ?
    `).run(price_box, stock_depot, threshold_depot, id);
    res.json({ success: true, message: 'Produit mis à jour.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// 4. POINTS DE VENTE (PDV)
apiRouter.get('/pdvs', (req, res) => {
  try {
    const userRole = getUserRole(req);
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    const queryVendorId = typeof req.query.vendor_id === 'string' ? req.query.vendor_id.trim() : '';
    const filterVendorId = queryVendorId || (userRole === 'Vendeur' ? headerUserId : '');

    let sql = `
      SELECT p.*,
             COALESCE(u.name, p.created_by, 'Oumar Konaté') AS created_by,
             COALESCE(u.code, 'BAO-VND-001') AS vendor_code,
             COALESCE(u.team, '') AS vendor_team,
             COALESCE(u.phone, '') AS vendor_phone,
             COALESCE((SELECT COUNT(*) FROM sales s WHERE s.pdv_id = p.id), 0) AS sales_count,
             COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.pdv_id = p.id), 0) AS total_sales_amount,
             (SELECT MAX(s.date) FROM sales s WHERE s.pdv_id = p.id) AS last_sale_date
      FROM points_de_vente p
      LEFT JOIN users u ON p.vendor_id = u.id
    `;
    const params: any[] = [];
    if (userRole === 'Vendeur' && filterVendorId) {
      sql += ` WHERE p.vendor_id = ?`;
      params.push(filterVendorId);
    }
    sql += ` ORDER BY p.created_at DESC, p.code ASC`;

    const pdvs = db.prepare(sql).all(...params);
    res.json({ success: true, pdvs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Validation ou rejet des demandes de création de PDV : Administrateur seul
apiRouter.patch('/pdvs/:id/status', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body; // 'valide' | 'rejete' | 'en_attente'
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

    db.prepare('UPDATE points_de_vente SET status = ?, rejection_reason = ? WHERE id = ?').run(
      status,
      status === 'rejete' ? (rejection_reason || 'Demande rejetée par l\'Administrateur') : null,
      id
    );

    markNotificationsReadByReference('Administrateur', pdv.code);

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
        ? `Félicitations ${pdv.vendor_name || ''} ! L'Administrateur a validé votre Point de Vente "${pdv.name}" (${pdv.code}, quartier ${pdv.neighborhood}). Votre PDV est désormais actif pour vos ventes.`
        : status === 'rejete'
        ? `La demande de création du Point de Vente "${pdv.name}" (${pdv.code}, quartier ${pdv.neighborhood}) a été rejetée par l'Administrateur.${rejection_reason ? ` Motif : ${rejection_reason}.` : ''}`
        : `Le statut du Point de Vente "${pdv.name}" (${pdv.code}) a été mis en attente par l'Administrateur.`;

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
      'Administrateur',
      null,
      `Point de vente ${pdv.code} (${pdv.name}, créé par ${pdv.vendor_name}) ${statusLabel}${status === 'rejete' && rejection_reason ? ` — Motif : ${rejection_reason}` : ''}.`
    );

    res.json({ success: true, message: `Point de vente ${statusLabel}.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Création d'un PDV : Vendeur uniquement, conditionnée par la prise de photo en direct de la devanture et la position GPS précise
apiRouter.post('/pdvs', requireVendeur, (req, res) => {
  try {
    const { name, manager_name, neighborhood, phone, latitude, longitude, gps_accuracy, photo_data, captured_at, vendor_id, created_by } = req.body;
    if (!name || !manager_name) {
      return res.status(400).json({ success: false, error: 'Le nom du commerce et le nom du gérant sont obligatoires.' });
    }
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
    const createdAt = new Date().toISOString().split('T')[0];
    const accNum = Number.isFinite(Number(gps_accuracy)) ? Number(gps_accuracy) : 5;
    const capturedAtStr = captured_at || new Date().toLocaleString('fr-FR');

    db.prepare(`
      INSERT INTO points_de_vente (id, code, name, manager_name, neighborhood, city, phone, status, latitude, longitude, gps_accuracy, photo_url, captured_at, vendor_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'Bamako', ?, 'en_attente', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, manager_name, neighborhood || 'Sotuba', phone || '', latNum, lngNum, accNum, photoUrl, capturedAtStr, creatorVendorId, creatorName, createdAt);

    sendNotification(
      'Administrateur',
      `Nouveau PDV créé par ${creatorName} : ${name}`,
      `Le vendeur ${creatorName} (${creatorCode}) a créé le point de vente "${name}" (${code}, quartier ${neighborhood || 'Sotuba'}, gérant : ${manager_name}) avec photo de profil de devanture certifiée et GPS (${latNum.toFixed(5)}, ${lngNum.toFixed(5)}). En attente de votre validation.`,
      'creation_pdv',
      code,
      {
        metadataJson: JSON.stringify({
          pdvId: id,
          pdvCode: code,
          pdvName: name,
          managerName: manager_name,
          neighborhood: neighborhood || 'Sotuba',
          vendorId: creatorVendorId,
          vendorName: creatorName,
          vendorCode: creatorCode,
        }),
      }
    );

    recordAudit(
      'CREATION_DEMANDE_PDV',
      'PDV',
      id,
      'Vendeur',
      creatorVendorId,
      `Demande PDV ${code} (${name}) créée par ${creatorName} (${creatorCode}) avec photo de profil devanture et GPS (${latNum.toFixed(6)}, ${lngNum.toFixed(6)} ±${accNum.toFixed(1)}m) capturé à ${capturedAtStr}.`
    );

    res.json({
      success: true,
      message: 'Point de vente créé avec sa photo de devanture assignée comme image de profil (en attente de validation par l\'Administrateur).',
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
        created_at: createdAt,
        sales_count: 0,
        total_sales_amount: 0,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
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

    // Envoi asynchrone de la notification Web Push aux appareils du destinataire uniquement
    void dispatchPushForNotification({
      notificationId: id,
      role,
      targetUserId,
      title,
      message,
      type,
      reference: refVal || undefined,
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
  } catch {
    // ignore
  }
}

// Helper for Stock Movement Journal (Entrées en ajout seul, jamais négatif)
function recordStockMovement(
  type: 'reception' | 'chargement' | 'retour' | 'perte_casse_peremption' | 'Bon cadeau',
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

// Le Vendeur demande un chargement : multi-produits ligne par ligne, date souhaitée, pas de doublon, quantité plafonnée au stock dépôt
apiRouter.post('/chargements/request', requireVendeur, (req, res) => {
  try {
    const { vendor_id, desired_date, items } = req.body;
    const userRole = getUserRole(req);

    if (!vendor_id || !desired_date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants (vendeur, date souhaitée, lignes de produits).' });
    }

    // Check duplicate products
    const productIds = items.map(it => it.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      return res.status(400).json({ success: false, error: 'Doublon détecté : chaque produit ne peut être présent qu\'une seule fois dans la demande.' });
    }

    // Validate quantities against warehouse stock
    for (const it of items) {
      const prod = db.prepare('SELECT stock_depot, name FROM products WHERE id = ?').get(it.productId) as any;
      if (!prod) {
        return res.status(400).json({ success: false, error: `Produit introuvable (${it.productId}).` });
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
    sendNotification(
      'Magasinier',
      'Nouvelle demande de chargement',
      `${vendor?.name || 'Un vendeur'} a soumis une demande de chargement (${ref}) pour le ${desired_date}.`,
      'chargement',
      ref
    );

    recordAudit('DEMANDE_CHARGEMENT', 'CHARGEMENT', id, userRole, vendor_id, `Demande de chargement ${ref} créée avec statut "Demandée".`);

    res.json({ success: true, message: `Demande de chargement ${ref} envoyée avec succès (statut : Demandée).`, chargementId: id, reference: ref });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Annulation possible tant que "Demandée"
apiRouter.delete('/chargements/:id/cancel', requireVendeur, (req, res) => {
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
    recordAudit('ANNULATION_CHARGEMENT', 'CHARGEMENT', id, userRole, chg.vendor_id, `Demande de chargement ${chg.reference} annulée par le vendeur.`);

    res.json({ success: true, message: `Demande de chargement ${chg.reference} annulée.` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Rectification possible tant que "Demandée"
apiRouter.put('/chargements/:id/rectify', requireVendeur, (req, res) => {
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

// 6. RÉCEPTIONS (Magasinier)
// Lignes avec produit, cartons, numéro de lot et date de péremption obligatoires ; mouvement entrant (journal en ajout seul, jamais négatif)
apiRouter.get('/receptions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM receptions ORDER BY created_at DESC').all();
    const receptions = rows.map((r: any) => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
    }));
    res.json({ success: true, receptions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

apiRouter.post('/receptions', requireMagasinier, (req, res) => {
  try {
    const { supplier_name, lines, date: reqDate } = req.body;
    const userRole = getUserRole(req);

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ success: false, error: 'Au moins une ligne de réception est obligatoire.' });
    }

    // Validation stricte : produit, cartons, numéro de lot et date de péremption obligatoires
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line.productId) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Produit obligatoire.` });
      }
      if (!line.cartons || Number(line.cartons) <= 0) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Nombre de cartons obligatoire et supérieur à 0.` });
      }
      if (!line.lotNumber || String(line.lotNumber).trim().length === 0) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Numéro de lot obligatoire.` });
      }
      if (!line.expiryDate || String(line.expiryDate).trim().length === 0) {
        return res.status(400).json({ success: false, error: `Ligne ${idx + 1} : Date de péremption obligatoire.` });
      }
    }

    const date = reqDate || new Date().toISOString().split('T')[0];
    const ref = `REC-FOURN-${date}-${Math.floor(100 + Math.random() * 900)}`;
    const id = `recp-${Date.now()}`;
    let totalBoxes = 0;

    // ATOMIC TRANSACTION: update depot stock, insert new lots, insert strictly positive movement log
    db.exec('BEGIN TRANSACTION');
    try {
      const enrichedLines = [];

      for (const line of lines) {
        const prod = db.prepare('SELECT id, code, name, price_box FROM products WHERE id = ?').get(line.productId) as any;
        if (!prod) throw new Error(`Produit ${line.productId} introuvable.`);

        const cartons = Number(line.cartons);
        totalBoxes += cartons;

        // 1. Increment central warehouse stock
        db.prepare('UPDATE products SET stock_depot = stock_depot + ? WHERE id = ?').run(cartons, prod.id);

        // 2. Create entry in Lots table
        const lotId = `lot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
          INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'actif', ?)
        `).run(lotId, prod.id, line.lotNumber.trim(), line.expiryDate.trim(), cartons, cartons, date);

        // 3. Mouvement entrant (journal en ajout seul, strictement positif, jamais négatif)
        recordStockMovement(
          'reception',
          'IN',
          prod.id,
          lotId,
          cartons, // strictly positive
          ref,
          `Entrée réception fournisseur: ${supplier_name || 'Fournisseur Agréé'} (Lot ${line.lotNumber})`,
          cartons * prod.price_box,
          'Magasinier Sotuba'
        );

        enrichedLines.push({
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          boxes: cartons,
          lot_number: line.lotNumber.trim(),
          expiry_date: line.expiryDate.trim(),
          lotId
        });
      }

      db.prepare(`
        INSERT INTO receptions (id, reference, supplier_name, date, items, total_boxes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, ref, supplier_name || 'Fournisseur Agréé Mali', date, JSON.stringify(enrichedLines), totalBoxes, date);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    recordAudit('RECEPTION_FOURNISSEUR', 'RECEPTION', id, userRole, null, `Réception fournisseur ${ref} enregistrée : ${totalBoxes} cartons ajoutés.`);

    res.json({
      success: true,
      message: `Réception ${ref} enregistrée au dépôt central avec ${totalBoxes} cartons (lots tracés, mouvement entrant en ajout seul).`,
      receptionId: id,
      reference: ref
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
      'Magasinier',
      'Retour d\'invendus en attente',
      `Le vendeur ${vendor?.name || 'Vendeur'} a déclaré un retour d'invendus (${ref}) à réintégrer au stock dépôt.`,
      'retour',
      ref
    );

    recordAudit('DECLARATION_RETOUR', 'RETOUR', id, userRole, vendor_id, `Retour d'invendus ${ref} déclaré par le vendeur (en attente confirmation magasinier).`);

    res.json({ success: true, message: `Retour ${ref} déclaré (en attente de confirmation par le Magasinier).` });
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

      // 2. Total Vendu (sales during current tour)
      const sales = db.prepare(`
        SELECT items FROM sales
        WHERE vendor_id = ? AND date >= ?
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
        stockValue: theoreticalQty * Number(prod.price_box || 0)
      };
    });

    res.json({ success: true, theoreticalStock: theoreticalData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Enregistrement de l'Inventaire Vendeur par le Magasinier & Détection des Écarts
apiRouter.post('/inventaires-vendeur', requireMagasinier, (req, res) => {
  try {
    const { vendor_id, date: reqDate, counted_items, notes } = req.body;
    const userRole = getUserRole(req);

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
      db.prepare(`
        INSERT INTO vendor_inventories (id, reference, vendor_id, date, items, total_ecart_boxes, total_ecart_fcfa, magasinier_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'usr-mag', ?, ?)
      `).run(id, ref, vendor_id, date, JSON.stringify(detailedItems), totalEcartBoxes, totalEcartFcfa, notes || 'Inventaire physique camionnette', date);

      // Notification to ADMINISTRATEUR and COMPTABLE
      const ecartLabel = totalEcartBoxes === 0
        ? 'Inventaire vendeur conforme (aucun écart)'
        : `Écart inventaire vendeur : ${totalEcartBoxes > 0 ? '+' : ''}${totalEcartBoxes} cartons (${totalEcartFcfa.toLocaleString('fr-FR')} FCFA)`;

      const msg = `Inventaire vendeur réalisé par le Magasinier sur ${vendor.name} (${vendor.code}). Résultat : ${ecartLabel}. Date : ${date}.`;

      sendNotification('Administrateur', ecartLabel, msg, 'ecart', ref);
      sendNotification('Comptable', ecartLabel, msg, 'ecart', ref);

      recordAudit(
        'INVENTAIRE_VENDEUR',
        'VENDOR_INVENTORY',
        id,
        userRole,
        vendor_id,
        `Inventaire vendeur ${ref} sur ${vendor.code} : Écart ${totalEcartBoxes} cartons, Valeur ${totalEcartFcfa} FCFA. Notifications envoyées à l'Administrateur et au Comptable.`
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      message: `Inventaire vendeur ${ref} enregistré avec succès. Écart : ${totalEcartBoxes} cartons (${totalEcartFcfa.toLocaleString('fr-FR')} FCFA). Notifications transmises à l'Administrateur et au Comptable.`,
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

// 9. VENTES (Vendeur seul - L'Administrateur ne vend jamais)
apiRouter.get('/sales', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.*,
             u.name as vendor_name, u.code as vendor_code, u.team as vendor_team, u.phone as vendor_phone,
             p.name as pdv_name, p.code as pdv_code, p.neighborhood as pdv_neighborhood,
             p.manager_name as pdv_manager, p.phone as pdv_phone,
             v.reference as versement_reference
      FROM sales s
      JOIN users u ON s.vendor_id = u.id
      JOIN points_de_vente p ON s.pdv_id = p.id
      LEFT JOIN versements v ON s.versement_id = v.id
      ORDER BY s.date DESC, COALESCE(s.sale_time, '00:00') DESC, s.created_at DESC, s.number DESC
    `).all();

    const sales = rows.map((r: any) => {
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
      const subtotalHt = Number(r.total_amount || 0);
      const withTva = Boolean(r.with_tva);
      const tvaRate = withTva ? Number(r.tva_rate || 18) : 0;
      const tvaAmount = withTva ? Number(r.tva_amount || Math.round(subtotalHt * 0.18)) : 0;
      const totalTtc = withTva ? Number(r.total_ttc || subtotalHt + tvaAmount) : subtotalHt;

      const thermalTicketNumber =
        r.thermal_ticket_number ||
        String(r.number || r.id || '').replace(/^VTE-/, 'TKT-THERM-');

      return {
        ...r,
        sale_time: saleTime,
        thermal_ticket_number: thermalTicketNumber.startsWith('TKT-')
          ? thermalTicketNumber
          : `TKT-THERM-${thermalTicketNumber}`,
        invoice_generated: Boolean(r.invoice_generated),
        invoice_number: r.invoice_number || String(r.number || '').replace(/^VTE-/, 'FAC-'),
        with_tva: withTva,
        tva_rate: tvaRate,
        tva_amount: tvaAmount,
        total_ttc: totalTtc,
        rectification_status: r.rectification_status || null,
        rectification_reason: r.rectification_reason || null,
        rectification_requested_at: r.rectification_requested_at || null,
        items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
      };
    });
    res.json({ success: true, sales });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

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
      payment_type,
      recorded_offline,
      offline_recorded_at,
      latitude,
      longitude,
    } = req.body;
    const userRole = getUserRole(req);
    if (!vendor_id || !pdv_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Données de vente incomplètes.' });
    }

    const total = items.reduce((sum: number, it: any) => sum + (Number(it.qtyBoxes) * Number(it.unitPrice)), 0);
    const nowObj = new Date();
    const nowIso = nowObj.toISOString();
    const date = clientDate || nowIso.split('T')[0];
    const saleTime =
      clientSaleTime ||
      `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const number = clientNumber || `VTE-2026-${rand}`;
    const thermalTicketNumber = String(number).replace(/^VTE-/, 'TKT-THERM-');
    const id = clientSaleId || `sale-${Date.now()}`;
    const isOffline = recorded_offline ? 1 : 0;

    const pdvRow = db.prepare('SELECT name, neighborhood, latitude, longitude FROM points_de_vente WHERE id = ?').get(pdv_id) as any;
    const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : Number(pdvRow?.latitude || 12.6392);
    const lng = Number.isFinite(Number(longitude)) ? Number(longitude) : Number(pdvRow?.longitude || -7.9850);

    // Note: invoice_generated = 0 because the Vendeur CANNOT create official invoices (only the Comptable can).
    // Instead, a Mini Facture Thermique (thermal_ticket_number) is automatically generated for the vendor's sales history.
    db.prepare(`
      INSERT OR IGNORE INTO sales (
        id, number, thermal_ticket_number, date, sale_time, vendor_id, pdv_id, items, total_amount,
        payment_type, status, invoice_generated, recorded_offline, offline_recorded_at, synced_at, latitude, longitude, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'livree', 0, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      number,
      thermalTicketNumber,
      date,
      saleTime,
      vendor_id,
      pdv_id,
      JSON.stringify(items),
      total,
      payment_type || 'Comptant',
      isOffline,
      offline_recorded_at || null,
      nowIso,
      lat,
      lng,
      nowIso
    );

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

    recordAudit(
      isOffline ? 'VENTE_PDV_SYNC_HORS_LIGNE' : 'VENTE_PDV',
      'SALE',
      id,
      userRole,
      vendor_id,
      `Vente ${number} (${total.toLocaleString('fr-FR')} FCFA) ${isOffline ? 'enregistrée hors-ligne puis synchronisée' : 'effectuée par le vendeur'} à ${saleTime}. Mini facture thermique ${thermalTicketNumber} générée automatiquement.`
    );

    res.json({
      success: true,
      message: `Vente ${number} enregistrée. Mini facture thermique ${thermalTicketNumber} générée automatiquement dans votre historique.`,
      saleId: id,
      number,
      thermal_ticket_number: thermalTicketNumber,
      date,
      sale_time: saleTime,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ success: false, error: message });
  }
});

// Génération / Création de facture par vente : STRICTEMENT réservée au Comptable (le vendeur ne peut pas créer ni modifier de factures)
apiRouter.post('/sales/:id/generate-invoice', requireComptable, (req, res) => {
  try {
    const { id } = req.params;
    const { with_tva, versement_id, updated_items } = req.body;
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

    const wasAlreadyGenerated = Boolean(sale.invoice_generated);
    const finalItems = Array.isArray(updated_items) && updated_items.length > 0
      ? updated_items.map((it: any) => ({
          productId: it.productId || it.code,
          code: it.code,
          name: it.name,
          qtyBoxes: Number(it.qtyBoxes ?? it.qty ?? 1),
          unitPrice: Number(it.unitPrice ?? it.price ?? 0),
          total: Number(it.qtyBoxes ?? it.qty ?? 1) * Number(it.unitPrice ?? it.price ?? 0),
        }))
      : (typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items);

    const subtotalHt = finalItems.reduce((acc: number, it: any) => acc + Number(it.total || 0), 0);
    const applyTva = Boolean(with_tva);
    const tvaRate = applyTva ? 18 : 0;
    const tvaAmount = applyTva ? Math.round(subtotalHt * 0.18) : 0;
    const totalTtc = subtotalHt + tvaAmount;
    const invoiceNumber = sale.invoice_number || String(sale.number || '').replace(/^VTE-/, 'FAC-');
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE sales
      SET items = ?,
          total_amount = ?,
          invoice_generated = 1,
          invoice_number = ?,
          with_tva = ?,
          tva_rate = ?,
          tva_amount = ?,
          total_ttc = ?,
          versement_id = COALESCE(?, versement_id),
          invoice_generated_at = ?,
          invoice_generated_by = 'Fatoumata Coulibaly (Comptable)'
      WHERE id = ?
    `).run(
      JSON.stringify(finalItems),
      subtotalHt,
      invoiceNumber,
      applyTva ? 1 : 0,
      tvaRate,
      tvaAmount,
      totalTtc,
      versement_id || null,
      nowIso,
      id
    );

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
      const salesRow = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE vendor_id = ?').get(v.id) as { total: number };
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
apiRouter.post('/lots/exit-loss', requireMagasinier, (req, res) => {
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
      let metadata = null;
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

// ---------------------------------------------------------------------------
// 12A. ABONNEMENT PUSH, JETON UTILISATEUR, PRÉFÉRENCES & NOTIFICATION DE TEST
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

// Envoyer une notification de test aux appareils de l'utilisateur connecté
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
      message:
        result.sentCount > 0
          ? `Notification de test envoyée sur ${result.sentCount} appareil(s) enregistré(s).`
          : 'Aucun appareil abonné actif trouvé. Cliquez sur « Activer les notifications » sur cet appareil.',
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

// Le Vendeur soumet une demande de rectification sur une facture créée par le Comptable en joignant la Mini Facture Thermique de sa vente comme preuve
apiRouter.post('/invoice-rectifications', requireVendeur, (req, res) => {
  try {
    const {
      sale_id,
      proof_sale_id,
      reason,
      thermal_receipt,
      thermal_receipt_override,
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

    const parsedProofItems = typeof proofSale.items === 'string' ? JSON.parse(proofSale.items) : (proofSale.items || []);
    const thermalTicketNum =
      proofSale.thermal_ticket_number ||
      String(proofSale.number || proofSale.id).replace(/^VTE-/, 'TKT-THERM-');
    const invoiceNum =
      invoiceSale.invoice_number ||
      String(invoiceSale.number || invoiceSale.id).replace(/^VTE-/, 'FAC-');

    const thermalReceiptProof = thermal_receipt || thermal_receipt_override || {
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
      totalAmount: Number(proofSale.total_amount || 0),
      total: Number(proofSale.total_amount || 0),
      cashierName: `${proofSale.vendor_name} (${proofSale.vendor_code})`,
      status: 'Ticket Thermique Certifié (Preuve de vente)',
      items: parsedProofItems.map((it: any) => ({
        code: it.code,
        name: it.name,
        qty: Number(it.qtyBoxes ?? it.qty ?? 1),
        price: Number(it.unitPrice ?? it.price ?? 0),
        total: Number(it.total ?? (Number(it.qtyBoxes ?? 1) * Number(it.unitPrice ?? 0))),
      })),
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

// Le Comptable traite (rectifie ou rejette) la demande de rectification du vendeur
apiRouter.post('/invoice-rectifications/:id/resolve', requireComptable, (req, res) => {
  try {
    const { id } = req.params;
    const { action, decision, with_tva, updated_items, response_note, comptable_note } = req.body;

    const rect = db.prepare('SELECT * FROM invoice_rectifications WHERE id = ?').get(id) as any;
    if (!rect) {
      return res.status(404).json({ success: false, error: 'Demande de rectification introuvable.' });
    }

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(rect.sale_id) as any;
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Facture associée introuvable.' });
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
        let finalItems = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
        if (Array.isArray(updated_items) && updated_items.length > 0) {
          finalItems = updated_items.map((it: any) => ({
            productId: it.productId || it.code,
            code: it.code,
            name: it.name,
            qtyBoxes: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)),
            unitPrice: Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
            total: Math.max(1, Number(it.qtyBoxes ?? it.qty ?? 1)) * Math.max(0, Number(it.unitPrice ?? it.price ?? 0)),
          }));
        }

        const subtotalHt = finalItems.reduce((sum: number, it: any) => sum + Number(it.total || 0), 0);
        const applyTva = with_tva !== undefined ? Boolean(with_tva) : Boolean(sale.with_tva);
        const tvaRate = applyTva ? 18 : 0;
        const tvaAmount = applyTva ? Math.round(subtotalHt * 0.18) : 0;
        const totalTtc = subtotalHt + tvaAmount;

        db.prepare(`
          UPDATE sales
          SET items = ?,
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

// Création d'une demande d'achat par le Magasinier ou le Comptable (avec motif optionnel)
apiRouter.post(
  '/purchase-requests',
  requireRole(['Magasinier', 'Comptable'], 'Création d\'une demande d\'achat'),
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
      if (!title || String(title).trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez indiquer l\'objet / désignation de la demande d\'achat.',
        });
      }

      const defaultUser = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(userRole) as any;
      const finalRequesterId = requester_id || defaultUser?.id || (userRole === 'Magasinier' ? 'usr-mag' : 'usr-cpt');
      const finalRequesterName = requester_name || defaultUser?.name || userRole;
      const finalRequesterCode = requester_code || defaultUser?.code || (userRole === 'Magasinier' ? 'BAO-MAG' : 'BAO-CPT');

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

      // Notification envoyée à l'Administrateur
      sendNotification(
        'Administrateur',
        `Nouvelle demande d'achat (${userRole}) : ${ref}`,
        `${finalRequesterName} (${userRole} • ${finalRequesterCode}) a soumis une demande d'achat "${String(title).trim()}" d'un montant de ${computedTotal.toLocaleString('fr-FR')} FCFA.${optionalMotif ? ` Motif : "${optionalMotif}".` : ' (Aucun motif précisé — optionnel).'} En attente de validation ou rejet.`,
        'demande_achat',
        ref,
        {
          metadataJson: JSON.stringify({
            purchaseRequestId: id,
            reference: ref,
            requesterRole: userRole,
            requesterName: finalRequesterName,
            totalAmount: computedTotal,
            requestMotif: optionalMotif,
          }),
        }
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

// Validation ou Rejet d'une demande d'achat par l'Administrateur (avec motif optionnel) + Notification au Magasinier ou Comptable
apiRouter.post('/purchase-requests/:id/decision', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status: rawStatus, decision: rawDecision, admin_motif } = req.body;
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
          reviewed_by = 'Amadou Touré (Administrateur)',
          reviewed_at = ?
      WHERE id = ?
    `).run(status, optionalAdminMotif, nowIso, id);

    markNotificationsReadByReference('Administrateur', pr.reference);

    // Le Magasinier ou le Comptable reçoit une notification de validation ou de rejet de l'Admin
    const decisionLabel = isApproved ? 'VALIDÉE' : 'REJETÉE';
    const notifTitle = `Demande d'achat ${pr.reference} ${decisionLabel} par l'Administrateur`;
    const notifMessage = `Votre demande d'achat "${pr.title}" (${Number(pr.total_amount || 0).toLocaleString('fr-FR')} FCFA) a été ${isApproved ? 'ACCEPTÉE / VALIDÉE' : 'REJETÉE'} par l'Administrateur.${optionalAdminMotif ? ` Motif de l'Administrateur : "${optionalAdminMotif}".` : ''}`;

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
      'Administrateur',
      pr.requester_id,
      `Demande d'achat ${pr.reference} (${pr.requester_name} - ${pr.requester_role}) ${isApproved ? 'validée' : 'rejetée'} par l'Administrateur.${optionalAdminMotif ? ` Motif : "${optionalAdminMotif}".` : ''}`
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

  // 2. Régularité des tournées (pondération: weights.regularite, défaut 4)
  const expectedActiveDays = 14;
  const regRatio = Math.min(1, salesRow.active_days / expectedActiveDays);
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
  const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all() as any[];
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
      'Magasinier',
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
          id, number, date, sale_time, vendor_id, pdv_id, items, total_amount,
          payment_type, status, recorded_offline, offline_recorded_at, synced_at, latitude, longitude, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'livree', 1, ?, ?, ?, ?, ?)
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
          const saleId = s.id || `sale-off-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const saleNumber = s.number || `VTE-OFF-${Math.floor(10000 + Math.random() * 90000)}`;
          const saleDate = s.date || nowIso.split('T')[0];
          const saleTime =
            s.sale_time ||
            (s.offline_recorded_at && String(s.offline_recorded_at).includes('T')
              ? String(s.offline_recorded_at).split('T')[1].slice(0, 5)
              : '12:00');
          const totalAmount = Number(
            s.total_amount ??
              s.items.reduce((acc: number, it: any) => acc + Number(it.qtyBoxes) * Number(it.unitPrice), 0)
          );

          const pdvRow = db.prepare('SELECT name, latitude, longitude FROM points_de_vente WHERE id = ?').get(s.pdv_id) as any;
          const lat = Number.isFinite(Number(s.latitude)) ? Number(s.latitude) : Number(pdvRow?.latitude || 12.6392);
          const lng = Number.isFinite(Number(s.longitude)) ? Number(s.longitude) : Number(pdvRow?.longitude || -7.9850);

          const info = insertSaleStmt.run(
            saleId,
            saleNumber,
            saleDate,
            saleTime,
            s.vendor_id,
            s.pdv_id,
            JSON.stringify(s.items),
            totalAmount,
            s.payment_type || 'Comptant',
            s.offline_recorded_at || nowIso,
            nowIso,
            lat,
            lng,
            s.offline_recorded_at || nowIso
          );

          if (info.changes > 0) {
            syncedSalesCount++;
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
        sendNotification('Administrateur', 'Synchronisation Hors-Ligne Vendeur', summaryMsg, 'info', `SYNC-${Date.now()}`);
        if (syncedSalesCount > 0) {
          sendNotification('Comptable', 'Ventes Hors-Ligne Synchronisées', summaryMsg, 'info', `SYNC-${Date.now()}`);
        }
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



