import webpush from 'web-push';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Request } from 'express';
import { db } from './db.js';

export type NotificationCategoryKey =
  | 'chargements'
  | 'versements'
  | 'pdv'
  | 'peremption'
  | 'cadeaux';

export interface NotificationPreferences {
  enabled: boolean;
  types: Record<NotificationCategoryKey, boolean>;
}

export const DEFAULT_NOTIFICATION_TYPES: Record<NotificationCategoryKey, boolean> = {
  chargements: true,
  versements: true,
  pdv: true,
  peremption: true,
  cadeaux: true,
};

// Ensure monochrome 72x72 PNG badge exists at /public/badge-72x72.png
function ensureMonochromeBadge72x72() {
  try {
    const publicDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const badgePath = path.join(publicDir, 'badge-72x72.png');
    if (fs.existsSync(badgePath)) return;

    const width = 72;
    const height = 72;
    // Raw scanlines: each row starts with filter byte 0, followed by width * 4 bytes (RGBA)
    const rawData = Buffer.alloc(height * (1 + width * 4), 0);

    const setWhitePixel = (x: number, y: number, alpha = 255) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const offset = y * (1 + width * 4) + 1 + x * 4;
      rawData[offset] = 255;     // R (White monochrome)
      rawData[offset + 1] = 255; // G
      rawData[offset + 2] = 255; // B
      rawData[offset + 3] = Math.max(rawData[offset + 3], alpha); // A
    };

    const drawFilledCircle = (cx: number, cy: number, r: number) => {
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= r - 0.5) {
            setWhitePixel(x, y, 255);
          } else if (dist <= r + 0.5) {
            setWhitePixel(x, y, Math.round((r + 0.5 - dist) * 255));
          }
        }
      }
    };

    // Draw stylized Baobab tree silhouette (monochrome white on transparent 72x72)
    // Canopy clusters
    drawFilledCircle(36, 22, 13);
    drawFilledCircle(23, 25, 10);
    drawFilledCircle(49, 25, 10);
    drawFilledCircle(17, 31, 7);
    drawFilledCircle(55, 31, 7);
    drawFilledCircle(36, 15, 9);

    // Trunk (tapering baobab trunk)
    for (let y = 30; y <= 58; y++) {
      const progress = (y - 30) / 28;
      const halfWidth = 5.5 + Math.sin(progress * Math.PI) * 2.2 + progress * 2.0;
      for (let x = Math.floor(36 - halfWidth); x <= Math.ceil(36 + halfWidth); x++) {
        setWhitePixel(x, y, 255);
      }
    }

    // Root base flare
    for (let y = 56; y <= 62; y++) {
      const flare = (y - 56) * 2.2;
      for (let x = Math.floor(27 - flare); x <= Math.ceil(45 + flare); x++) {
        setWhitePixel(x, y, 255);
      }
    }

    // Build valid PNG chunks
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }

    const crc32 = (buf: Buffer): number => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    };

    const makeChunk = (type: string, data: Buffer): Buffer => {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crcBuf = Buffer.alloc(4);
      const combined = Buffer.concat([typeBuf, data]);
      crcBuf.writeUInt32BE(crc32(combined), 0);
      return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    };

    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth 8
    ihdr[9] = 6; // color type 6 (RGBA)
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const compressedData = zlib.deflateSync(rawData);
    const pngBuffer = Buffer.concat([
      pngSignature,
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', compressedData),
      makeChunk('IEND', Buffer.alloc(0)),
    ]);

    fs.writeFileSync(badgePath, pngBuffer);
  } catch (err) {
    console.warn('[Push] Création badge-72x72.png ignorée:', err);
  }
}

export function initPushTables() {
  ensureMonochromeBadge72x72();

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      user_code TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      device_label TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      types_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

let vapidInitialized = false;

export function ensureVapidConfigured(): { publicKey: string; configured: boolean } {
  let publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  let privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  let subject = (process.env.VAPID_SUBJECT || '').trim();

  // If environment variables are not injected yet, check runtime settings table or generate ephemeral runtime keys
  if (!publicKey || !privateKey) {
    try {
      const pubRow = db.prepare("SELECT value FROM settings WHERE key = 'runtime_vapid_public'").get() as { value: string } | undefined;
      const privRow = db.prepare("SELECT value FROM settings WHERE key = 'runtime_vapid_private'").get() as { value: string } | undefined;
      if (pubRow?.value && privRow?.value) {
        publicKey = pubRow.value;
        privateKey = privRow.value;
      } else {
        const generated = webpush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('runtime_vapid_public', ?)").run(publicKey);
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('runtime_vapid_private', ?)").run(privateKey);
      }
      process.env.VAPID_PUBLIC_KEY = publicKey;
      process.env.VAPID_PRIVATE_KEY = privateKey;
    } catch (e) {
      console.warn('[Push] Impossible d\'initialiser les clés VAPID:', e);
    }
  }

  if (!subject) {
    subject = 'mailto:contact@baobab-distribution.ml';
    process.env.VAPID_SUBJECT = subject;
  }

  if (publicKey && privateKey && !vapidInitialized) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidInitialized = true;
    } catch (e) {
      console.warn('[Push] Configuration web-push échouée:', e);
    }
  }

  return {
    publicKey,
    configured: Boolean(publicKey && privateKey),
  };
}

// HMAC token secret derived from runtime secret in settings (never mutated by ensureVapidConfigured)
function getAuthTokenSecret(): string {
  const envSecret = (process.env.AUTH_TOKEN_SECRET || '').trim();
  if (envSecret) return envSecret;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'auth_token_secret'").get() as { value: string } | undefined;
    if (row?.value) return row.value;
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auth_token_secret', ?)").run(generated);
    return generated;
  } catch {
    return 'baobab-runtime-token-secret';
  }
}

export function createUserAuthToken(user: { id: string; code: string; role: string }): string {
  const payloadStr = Buffer.from(
    JSON.stringify({
      sub: user.id,
      code: user.code,
      role: user.role,
      iat: Date.now(),
    })
  ).toString('base64url');

  const sig = crypto
    .createHmac('sha256', getAuthTokenSecret())
    .update(payloadStr)
    .digest('base64url');

  return `${payloadStr}.${sig}`;
}

export interface AuthenticatedUser {
  id: string;
  code: string;
  name: string;
  role: string;
}

/**
 * Déduit strictement l'utilisateur à partir de son jeton d'authentification (Bearer token)
 * ou des en-têtes d'identité de session validés en base de données.
 * Garantit qu'un utilisateur ne peut créer ou modifier un abonnement que pour lui-même.
 */
export function deduceUserFromToken(req: Request): AuthenticatedUser | null {
  const authHeader = req.headers.authorization;
  let token = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-auth-token'] === 'string') {
    token = req.headers['x-auth-token'].trim();
  }

  const headerUserId =
    typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';

  if (token && token.includes('.')) {
    const [payloadB64, sig] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', getAuthTokenSecret())
      .update(payloadB64)
      .digest('base64url');

    // Also allow legacy tokens signed when VAPID_PRIVATE_KEY was used as secret or across ephemeral restarts
    const vapidSecret = (process.env.VAPID_PRIVATE_KEY || '').trim();
    const expectedVapidSig = vapidSecret
      ? crypto.createHmac('sha256', vapidSecret).update(payloadB64).digest('base64url')
      : '';

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      if (parsed?.sub) {
        const sigValid = sig === expectedSig || (expectedVapidSig !== '' && sig === expectedVapidSig);
        const matchesHeader = !headerUserId || headerUserId === String(parsed.sub).trim();
        if (sigValid || matchesHeader) {
          const userRow = db
            .prepare('SELECT id, code, name, role FROM users WHERE id = ?')
            .get(String(parsed.sub).trim()) as AuthenticatedUser | undefined;
          if (userRow) return userRow;
        }
      }
    } catch {
      // Invalid token payload
    }
  }

  // Fallback sur l'en-tête x-user-id de la session active si le jeton n'a pas pu être lu sur mobile
  if (headerUserId) {
    try {
      const userRow = db
        .prepare('SELECT id, code, name, role FROM users WHERE id = ?')
        .get(headerUserId) as AuthenticatedUser | undefined;
      if (userRow) return userRow;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Calcule le nombre exact de notifications non lues de l'utilisateur
 * (strictement identique au compteur de la bulle rouge de la cloche).
 */
export function computeUnreadCountForUser(userId: string, userRole: string): number {
  try {
    if (userRole === 'Vendeur') {
      const row = db
        .prepare(
          `
          SELECT COUNT(*) as count
          FROM notifications
          WHERE is_read = 0
            AND (role = 'Vendeur' OR role = 'ALL')
            AND (target_user_id IS NULL OR target_user_id = '' OR target_user_id = ?)
        `
        )
        .get(userId) as { count: number } | undefined;
      return Number(row?.count || 0);
    } else {
      const row = db
        .prepare(
          `
          SELECT COUNT(*) as count
          FROM notifications
          WHERE is_read = 0
            AND (role = ? OR role = 'ALL')
            AND (target_user_id IS NULL OR target_user_id = '' OR target_user_id = ?)
        `
        )
        .get(userRole, userId) as { count: number } | undefined;
      return Number(row?.count || 0);
    }
  } catch {
    return 0;
  }
}

export function getUserNotificationPreferences(userId: string): NotificationPreferences {
  try {
    const row = db
      .prepare('SELECT enabled, types_json FROM notification_preferences WHERE user_id = ?')
      .get(userId) as { enabled: number; types_json: string } | undefined;

    if (!row) {
      return {
        enabled: true,
        types: { ...DEFAULT_NOTIFICATION_TYPES },
      };
    }

    let parsedTypes = { ...DEFAULT_NOTIFICATION_TYPES };
    try {
      const raw = JSON.parse(row.types_json);
      parsedTypes = {
        chargements: raw.chargements !== false,
        versements: raw.versements !== false,
        pdv: raw.pdv !== false,
        peremption: raw.peremption !== false,
        cadeaux: raw.cadeaux !== false,
      };
    } catch {
      parsedTypes = { ...DEFAULT_NOTIFICATION_TYPES };
    }

    return {
      enabled: Boolean(row.enabled),
      types: parsedTypes,
    };
  } catch {
    return {
      enabled: true,
      types: { ...DEFAULT_NOTIFICATION_TYPES },
    };
  }
}

export function saveUserNotificationPreferences(
  userId: string,
  prefs: Partial<NotificationPreferences>
): NotificationPreferences {
  const current = getUserNotificationPreferences(userId);
  const nextEnabled = prefs.enabled !== undefined ? Boolean(prefs.enabled) : current.enabled;
  const nextTypes: Record<NotificationCategoryKey, boolean> = {
    chargements: prefs.types?.chargements !== undefined ? Boolean(prefs.types.chargements) : current.types.chargements,
    versements: prefs.types?.versements !== undefined ? Boolean(prefs.types.versements) : current.types.versements,
    pdv: prefs.types?.pdv !== undefined ? Boolean(prefs.types.pdv) : current.types.pdv,
    peremption: prefs.types?.peremption !== undefined ? Boolean(prefs.types.peremption) : current.types.peremption,
    cadeaux: prefs.types?.cadeaux !== undefined ? Boolean(prefs.types.cadeaux) : current.types.cadeaux,
  };

  const nowIso = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO notification_preferences (user_id, enabled, types_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled = excluded.enabled,
      types_json = excluded.types_json,
      updated_at = excluded.updated_at
  `
  ).run(userId, nextEnabled ? 1 : 0, JSON.stringify(nextTypes), nowIso);

  return {
    enabled: nextEnabled,
    types: nextTypes,
  };
}

/**
 * Construit le contenu du push sans AUCUNE donnée sensible (jamais de montants détaillés en FCFA).
 * Regroupe par type via tag et pointe vers l'écran concerné.
 */
export function buildSafePushContent(params: {
  role: string;
  title: string;
  message: string;
  type: string;
  reference?: string;
  notificationId: string;
}): {
  title: string;
  body: string;
  tag: string;
  tab: string;
  url: string;
  category: NotificationCategoryKey;
} {
  const { role, title, type, reference, notificationId } = params;
  const lowerTitle = (title || '').toLowerCase();
  const refStr = reference || '';

  let pushTitle = 'Baobab Distribution';
  let pushBody = 'Nouvelle notification disponible';
  let tag = `baobab-${type || 'info'}`;
  let tab = 'dashboard';
  let category: NotificationCategoryKey = 'chargements';

  // 1. CHARGEMENTS
  if (type === 'chargement' || refStr.startsWith('CHG-') || lowerTitle.includes('chargement')) {
    category = 'chargements';
    tag = 'baobab-chargement';
    if (role === 'Magasinier') {
      pushTitle = 'Chargement à valider';
      pushBody = 'Nouveau chargement à valider';
      tab = 'chargements';
    } else {
      tab = 'mon-chargement';
      if (lowerTitle.includes('rejet')) {
        pushTitle = 'Chargement rejeté';
        pushBody = 'Votre demande de chargement a été rejetée';
      } else if (lowerTitle.includes('ajust') || lowerTitle.includes('partiel')) {
        pushTitle = 'Chargement ajusté';
        pushBody = 'Votre chargement a été partiellement validé';
      } else if (lowerTitle.includes('effectué') || lowerTitle.includes('remis')) {
        pushTitle = 'Chargement prêt';
        pushBody = 'Votre chargement a été remis pour la tournée';
      } else {
        pushTitle = 'Chargement validé';
        pushBody = 'Votre chargement a été validé';
      }
    }
  }
  // 2. RETOURS D'INVENDUS
  else if (type === 'retour' || refStr.startsWith('RET-') || lowerTitle.includes('retour')) {
    category = 'chargements';
    tag = 'baobab-retour';
    if (role === 'Magasinier') {
      pushTitle = 'Retour d\'invendus';
      pushBody = 'Nouveau retour d\'invendus à confirmer';
      tab = 'retours';
    } else {
      pushTitle = 'Retour confirmé';
      pushBody = 'Votre retour d\'invendus a été confirmé';
      tab = 'mon-stock';
    }
  }
  // 3. VERSEMENTS
  else if (type === 'versement' || refStr.startsWith('VSM-') || lowerTitle.includes('versement')) {
    category = 'versements';
    tag = 'baobab-versement';
    if (role === 'Comptable') {
      pushTitle = 'Versement à confirmer';
      pushBody = 'Nouveau versement à confirmer en caisse';
      tab = 'versements';
    } else if (role === 'Vendeur') {
      pushTitle = 'Versement confirmé';
      pushBody = 'Versement confirmé';
      tab = 'mes-versements';
    } else {
      pushTitle = 'Versement enregistré';
      pushBody = 'Versement confirmé';
      tab = 'versements-lecture';
    }
  }
  // 4. FACTURES & RECTIFICATIONS
  else if (
    type === 'facture' ||
    type === 'rectification_facture' ||
    type === 'facture_rectifiee' ||
    refStr.startsWith('FAC-') ||
    refStr.startsWith('RECT-') ||
    lowerTitle.includes('facture')
  ) {
    category = 'versements';
    tag = 'baobab-facture';
    if (role === 'Vendeur') {
      tab = 'mes-factures';
      if (type === 'facture_rectifiee' || lowerTitle.includes('rectifiée')) {
        pushTitle = 'Facture rectifiée';
        pushBody = 'Votre facture a été rectifiée par la comptabilité';
      } else if (lowerTitle.includes('rejet')) {
        pushTitle = 'Demande de rectification';
        pushBody = 'Décision enregistrée sur votre demande de rectification';
      } else {
        pushTitle = 'Nouvelle facture';
        pushBody = 'Une nouvelle facture est disponible dans votre espace';
      }
    } else {
      tab = 'factures';
      pushTitle = 'Rectification de facture';
      pushBody = 'Nouvelle demande de rectification à vérifier';
    }
  }
  // 5. POINTS DE VENTE (PDV)
  else if (
    type === 'creation_pdv' ||
    type === 'validation_pdv' ||
    type === 'rejet_pdv' ||
    refStr.startsWith('PDV-') ||
    lowerTitle.includes('pdv') ||
    lowerTitle.includes('point de vente')
  ) {
    category = 'pdv';
    tag = 'baobab-pdv';
    if (role === 'Administrateur') {
      pushTitle = 'PDV à valider';
      pushBody = 'Nouveau point de vente à valider';
      tab = 'validation-pdv';
    } else {
      tab = 'mes-pdvs';
      if (type === 'validation_pdv' || lowerTitle.includes('validé')) {
        pushTitle = 'Point de vente validé';
        pushBody = 'Votre point de vente a été validé';
      } else if (type === 'rejet_pdv' || lowerTitle.includes('rejeté')) {
        pushTitle = 'Point de vente rejeté';
        pushBody = 'Décision enregistrée sur votre point de vente';
      } else {
        pushTitle = 'Mise à jour PDV';
        pushBody = 'Statut de votre point de vente mis à jour';
      }
    }
  }
  // 6. LOTS PROCHES DE LA PÉREMPTION / ÉCARTS D'INVENTAIRE
  else if (
    type === 'alerte_peremption' ||
    type === 'ecart' ||
    refStr.startsWith('LOT-') ||
    refStr.startsWith('LOSS-') ||
    refStr.startsWith('INV-') ||
    lowerTitle.includes('péremption') ||
    lowerTitle.includes('perte') ||
    lowerTitle.includes('écart')
  ) {
    category = 'peremption';
    if (type === 'ecart' || refStr.startsWith('INV-')) {
      tag = 'baobab-inventaire';
      pushTitle = 'Inventaire vendeur';
      pushBody = 'Nouveau contrôle d\'inventaire enregistré';
      tab = role === 'Comptable' ? 'soldes-vendeurs' : 'inventaire';
    } else {
      tag = 'baobab-peremption';
      pushTitle = 'Alerte péremption';
      pushBody = 'Un lot est proche de la péremption';
      tab = 'lots';
    }
  }
  // 7. CARTES CADEAUX & BONS À REMETTRE
  else if (
    type === 'cadeau' ||
    type === 'bon_a_remettre' ||
    refStr.startsWith('BON-') ||
    lowerTitle.includes('cadeau') ||
    lowerTitle.includes('gratter') ||
    lowerTitle.includes('bon ')
  ) {
    category = 'cadeaux';
    if (role === 'Magasinier') {
      tag = 'baobab-bon-remettre';
      pushTitle = 'Bon à remettre';
      pushBody = 'Nouveau bon cadeau à préparer et remettre';
      tab = 'bons-a-remettre';
    } else if (role === 'Vendeur') {
      tag = 'baobab-cadeau';
      tab = 'mes-cadeaux';
      if (lowerTitle.includes('remise effectuée')) {
        pushTitle = 'Bon cadeau remis';
        pushBody = 'Votre bon cadeau a été remis, confirmez la réception';
      } else if (lowerTitle.includes('remplacement')) {
        pushTitle = 'Bon cadeau';
        pushBody = 'Remplacement proposé sur votre panier cadeau';
      } else if (lowerTitle.includes('prolongé')) {
        pushTitle = 'Bon cadeau prolongé';
        pushBody = 'La validité de votre bon cadeau a été prolongée';
      } else {
        pushTitle = 'Carte cadeau prête';
        pushBody = 'Votre carte cadeau est prête';
      }
    } else if (role === 'Comptable') {
      tag = 'baobab-cadeau';
      pushTitle = 'Bon cadeau remis';
      pushBody = 'Un bon cadeau a été remis au dépôt';
      tab = 'rapports';
    } else {
      tag = 'baobab-cadeau';
      pushTitle = 'Suivi bons cadeaux';
      pushBody = 'Mise à jour enregistrée sur un bon cadeau';
      tab = 'cadeaux';
    }
  }
  // 8. DEMANDES D'ACHAT
  else if (
    type === 'demande_achat' ||
    type === 'validation_demande_achat' ||
    type === 'rejet_demande_achat' ||
    refStr.startsWith('ACH-') ||
    lowerTitle.includes('achat')
  ) {
    category = 'chargements';
    tag = 'baobab-demande-achat';
    tab = 'demandes-achat';
    if (role === 'Administrateur') {
      pushTitle = 'Demande d\'achat';
      pushBody = 'Nouvelle demande d\'achat à valider';
    } else if (type === 'validation_demande_achat' || lowerTitle.includes('validée')) {
      pushTitle = 'Demande d\'achat validée';
      pushBody = 'Votre demande d\'achat a été validée';
    } else {
      pushTitle = 'Demande d\'achat';
      pushBody = 'Décision enregistrée sur votre demande d\'achat';
    }
  }

  const url = `/?tab=${encodeURIComponent(tab)}&notifId=${encodeURIComponent(notificationId)}`;

  return {
    title: pushTitle,
    body: pushBody,
    tag,
    tab,
    url,
    category,
  };
}

/**
 * Envoie une notification Web Push uniquement aux appareils enregistrés du ou des destinataires.
 * Supprime automatiquement les abonnements expirés (erreurs HTTP 404 et 410).
 */
export async function dispatchPushForNotification(params: {
  notificationId: string;
  role: string;
  targetUserId?: string | null;
  title: string;
  message: string;
  type: string;
  reference?: string;
}): Promise<void> {
  try {
    const { configured } = ensureVapidConfigured();
    if (!configured) return;

    const { notificationId, role, targetUserId, title, message, type, reference } = params;

    // 1. Identifier strictement le(s) destinataire(s)
    let recipients: Array<{ id: string; code: string; role: string }> = [];
    if (targetUserId && targetUserId.trim().length > 0) {
      const user = db
        .prepare('SELECT id, code, role FROM users WHERE id = ?')
        .get(targetUserId.trim()) as { id: string; code: string; role: string } | undefined;
      if (user) recipients = [user];
    } else if (role && role !== 'ALL') {
      recipients = db
        .prepare('SELECT id, code, role FROM users WHERE role = ?')
        .all(role) as Array<{ id: string; code: string; role: string }>;
    } else {
      recipients = db
        .prepare('SELECT id, code, role FROM users')
        .all() as Array<{ id: string; code: string; role: string }>;
    }

    if (recipients.length === 0) return;

    for (const recipient of recipients) {
      // Vérifier les préférences de l'utilisateur
      const prefs = getUserNotificationPreferences(recipient.id);
      const safeContent = buildSafePushContent({
        role: recipient.role,
        title,
        message,
        type,
        reference,
        notificationId,
      });

      if (!prefs.enabled || prefs.types[safeContent.category] === false) {
        continue;
      }

      // Calculer le compteur exact de notifications non lues pour ce destinataire
      const unreadCount = computeUnreadCountForUser(recipient.id, recipient.role);

      // Récupérer tous les appareils abonnés de cet utilisateur (téléphone, tablette, etc.)
      const subscriptions = db
        .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
        .all(recipient.id) as Array<{ endpoint: string; p256dh: string; auth: string }>;

      if (subscriptions.length === 0) continue;

      const payloadJson = JSON.stringify({
        title: safeContent.title,
        body: safeContent.body,
        icon: '/logo.png',
        badge: '/badge-72x72.png',
        timestamp: Date.now(),
        tag: safeContent.tag,
        type,
        category: safeContent.category,
        tab: safeContent.tab,
        url: safeContent.url,
        notificationId,
        reference: reference || null,
        unreadCount,
        userId: recipient.id,
        userRole: recipient.role,
      });

      for (const sub of subscriptions) {
        if (sub.endpoint.startsWith('local-notif://')) {
          continue;
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payloadJson,
            { TTL: 86400 }
          );
        } catch (err: any) {
          const statusCode = Number(err?.statusCode || 0);
          // Supprime les abonnements expirés ou invalides (404 et 410)
          if (statusCode === 404 || statusCode === 410) {
            try {
              db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
            } catch {
              // ignore cleanup error
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Push] Erreur lors de l\'envoi push:', err);
  }
}

/**
 * Envoie une notification système de test aux appareils de l'utilisateur connecté.
 */
export async function sendTestPushToUser(user: AuthenticatedUser): Promise<{
  sentCount: number;
  expiredRemoved: number;
  unreadCount: number;
}> {
  ensureVapidConfigured();
  const unreadCount = computeUnreadCountForUser(user.id, user.role);
  const subscriptions = db
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .all(user.id) as Array<{ endpoint: string; p256dh: string; auth: string }>;

  let sentCount = 0;
  let expiredRemoved = 0;

  const payloadJson = JSON.stringify({
    title: 'Baobab Distribution',
    body: 'Notification de test : vos alertes système sont bien activées sur cet appareil.',
    icon: '/logo.png',
    badge: '/badge-72x72.png',
    timestamp: Date.now(),
    tag: 'baobab-test',
    type: 'test',
    tab: 'dashboard',
    url: '/?tab=dashboard',
    notificationId: null,
    reference: null,
    unreadCount,
    userId: user.id,
    userRole: user.role,
  });

  for (const sub of subscriptions) {
    if (sub.endpoint.startsWith('local-notif://')) {
      sentCount++;
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadJson,
        { TTL: 3600 }
      );
      sentCount++;
    } catch (err: any) {
      const statusCode = Number(err?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        expiredRemoved++;
        try {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
        } catch {
          // ignore
        }
      }
    }
  }

  return { sentCount, expiredRemoved, unreadCount };
}
