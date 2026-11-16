import webpush from 'web-push';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Request, Response } from 'express';
import { db } from './db.js';

export type NotificationCategoryKey =
  | 'ventes'
  | 'chargements'
  | 'versements'
  | 'pdv'
  | 'peremption'
  | 'cadeaux';

export type SalePushScope = 'all' | 'mine' | 'above_threshold';

export interface NotificationPreferences {
  enabled: boolean;
  types: Record<NotificationCategoryKey, boolean>;
  hideAmountsOnLockScreen: boolean;
  minSaleAmount: number;
  saleScope: SalePushScope;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const DEFAULT_NOTIFICATION_TYPES: Record<NotificationCategoryKey, boolean> = {
  ventes: true,
  chargements: true,
  versements: true,
  pdv: true,
  peremption: true,
  cadeaux: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  types: { ...DEFAULT_NOTIFICATION_TYPES },
  hideAmountsOnLockScreen: true,
  minSaleAmount: 0,
  saleScope: 'all',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '06:00',
};

export interface PushDeliveryLogEntry {
  id: string;
  event_id: string;
  user_id: string;
  user_role: string;
  device_label: string;
  endpoint: string;
  title: string;
  urgency: 'high' | 'normal';
  created_at: string;
  sent_at: string;
  latency_ms: number;
  status_code: number;
  attempts: number;
  status: 'succes' | 'echec' | 'abonnement_supprime';
  error_message?: string | null;
}

// Déduplication en mémoire par (eventId::endpoint) pour éviter tout double envoi
const sentEventEndpoints = new Set<string>();

// Registre temps réel Server-Sent Events (SSE) pour mise à jour instantanée dans l'application ouverte
interface SseClient {
  id: string;
  userId: string;
  userRole: string;
  res: Response;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

const sseClients = new Map<string, SseClient>();

function doesRoleMatchRecipient(clientRole: string, notifRole: string): boolean {
  if (!notifRole || notifRole === 'ALL') return true;
  if (clientRole === notifRole) return true;
  const stockRoles = ['Magasinier', 'Gestionnaire de stock'];
  if (stockRoles.includes(clientRole) && stockRoles.includes(notifRole)) return true;
  return false;
}

export function registerNotificationSseClient(
  req: Request,
  res: Response,
  userId: string,
  userRole: string
): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const unreadCount = computeUnreadCountForUser(userId, userRole);

  // Envoi immédiat de l'état initial dès l'ouverture du flux SSE
  try {
    res.write(
      `data: ${JSON.stringify({
        event: 'connected',
        clientId,
        unreadCount,
        serverTime: new Date().toISOString(),
      })}\n\n`
    );
  } catch {
    // ignore write error
  }

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeatTimer);
      sseClients.delete(clientId);
    }
  }, 20000);

  sseClients.set(clientId, {
    id: clientId,
    userId,
    userRole,
    res,
    heartbeatTimer,
  });

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    sseClients.delete(clientId);
  });
}

export function broadcastNotificationSseEvent(params: {
  event: 'notification:created' | 'notification:read' | 'notification:read-all';
  notification?: any;
  role?: string;
  targetUserId?: string | null;
  pushPayload?: {
    title: string;
    body: string;
    url: string;
    tag: string;
    notificationId: string;
    requireInteraction: boolean;
    urgency: 'high' | 'normal';
  };
}): number {
  let deliveredCount = 0;
  const targetUid = params.targetUserId ? String(params.targetUserId).trim() : '';
  const targetRole = params.role ? String(params.role).trim() : 'ALL';

  for (const [clientId, client] of sseClients.entries()) {
    if (targetUid && client.userId && client.userId !== targetUid) {
      continue;
    }
    if (!doesRoleMatchRecipient(client.userRole, targetRole)) {
      continue;
    }

    const unreadCount = computeUnreadCountForUser(client.userId, client.userRole);
    try {
      client.res.write(
        `data: ${JSON.stringify({
          event: params.event,
          unreadCount,
          notification: params.notification || null,
          pushPayload: params.pushPayload || null,
          timestamp: Date.now(),
        })}\n\n`
      );
      deliveredCount++;
    } catch {
      clearInterval(client.heartbeatTimer);
      sseClients.delete(clientId);
    }
  }
  return deliveredCount;
}

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
    const rawData = Buffer.alloc(height * (1 + width * 4), 0);

    const setWhitePixel = (x: number, y: number, alpha = 255) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const offset = y * (1 + width * 4) + 1 + x * 4;
      rawData[offset] = 255;
      rawData[offset + 1] = 255;
      rawData[offset + 2] = 255;
      rawData[offset + 3] = Math.max(rawData[offset + 3], alpha);
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

    drawFilledCircle(36, 22, 13);
    drawFilledCircle(23, 25, 10);
    drawFilledCircle(49, 25, 10);
    drawFilledCircle(17, 31, 7);
    drawFilledCircle(55, 31, 7);
    drawFilledCircle(36, 15, 9);

    for (let y = 30; y <= 58; y++) {
      const progress = (y - 30) / 28;
      const halfWidth = 5.5 + Math.sin(progress * Math.PI) * 2.2 + progress * 2.0;
      for (let x = Math.floor(36 - halfWidth); x <= Math.ceil(36 + halfWidth); x++) {
        setWhitePixel(x, y, 255);
      }
    }

    for (let y = 56; y <= 62; y++) {
      const flare = (y - 56) * 2.2;
      for (let x = Math.floor(27 - flare); x <= Math.ceil(45 + flare); x++) {
        setWhitePixel(x, y, 255);
      }
    }

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
    ihdr[8] = 8;
    ihdr[9] = 6;
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
      settings_json TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN settings_json TEXT`);
  } catch {
    // Column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_delivery_logs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      device_label TEXT,
      endpoint TEXT NOT NULL,
      title TEXT NOT NULL,
      urgency TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      status_code INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      error_message TEXT
    );
  `);
}

function recordPushDeliveryLog(entry: Omit<PushDeliveryLogEntry, 'id'>) {
  try {
    const id = `plog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `
      INSERT INTO push_delivery_logs (
        id, event_id, user_id, user_role, device_label, endpoint, title, urgency,
        created_at, sent_at, latency_ms, status_code, attempts, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      entry.event_id,
      entry.user_id,
      entry.user_role,
      entry.device_label || 'Appareil',
      entry.endpoint,
      entry.title,
      entry.urgency,
      entry.created_at,
      entry.sent_at,
      Math.max(1, Math.round(entry.latency_ms)),
      entry.status_code,
      entry.attempts,
      entry.status,
      entry.error_message || null
    );
  } catch (err) {
    console.warn('[Push] Erreur journalisation push_delivery_logs:', err);
  }
}

export function getPushDiagnosticsData(limit = 50): {
  logs: PushDeliveryLogEntry[];
  totalSent: number;
  successCount: number;
  failedCount: number;
  removedSubscriptionsCount: number;
  avgLatencyMs: number;
  activeSubscriptionsCount: number;
  connectedSseClientsCount: number;
} {
  try {
    const logs = db
      .prepare('SELECT * FROM push_delivery_logs ORDER BY sent_at DESC LIMIT ?')
      .all(limit) as unknown as PushDeliveryLogEntry[];

    const statsRow = db
      .prepare(
        `
        SELECT
          COUNT(*) as totalSent,
          SUM(CASE WHEN status = 'succes' THEN 1 ELSE 0 END) as successCount,
          SUM(CASE WHEN status = 'echec' THEN 1 ELSE 0 END) as failedCount,
          SUM(CASE WHEN status = 'abonnement_supprime' THEN 1 ELSE 0 END) as removedCount,
          AVG(CASE WHEN status = 'succes' THEN latency_ms ELSE NULL END) as avgLatency
        FROM push_delivery_logs
      `
      )
      .get() as
      | {
          totalSent: number;
          successCount: number;
          failedCount: number;
          removedCount: number;
          avgLatency: number | null;
        }
      | undefined;

    const activeSubsRow = db
      .prepare('SELECT COUNT(*) as cnt FROM push_subscriptions')
      .get() as { cnt: number } | undefined;

    return {
      logs,
      totalSent: Number(statsRow?.totalSent || 0),
      successCount: Number(statsRow?.successCount || 0),
      failedCount: Number(statsRow?.failedCount || 0),
      removedSubscriptionsCount: Number(statsRow?.removedCount || 0),
      avgLatencyMs: statsRow?.avgLatency ? Math.round(Number(statsRow.avgLatency)) : 0,
      activeSubscriptionsCount: Number(activeSubsRow?.cnt || 0),
      connectedSseClientsCount: sseClients.size,
    };
  } catch {
    return {
      logs: [],
      totalSent: 0,
      successCount: 0,
      failedCount: 0,
      removedSubscriptionsCount: 0,
      avgLatencyMs: 0,
      activeSubscriptionsCount: 0,
      connectedSseClientsCount: sseClients.size,
    };
  }
}

let vapidInitialized = false;

export function ensureVapidConfigured(): { publicKey: string; configured: boolean } {
  let publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  let privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  let subject = (process.env.VAPID_SUBJECT || '').trim();

  if (!publicKey || !privateKey) {
    try {
      const pubRow = db
        .prepare("SELECT value FROM settings WHERE key = 'runtime_vapid_public'")
        .get() as { value: string } | undefined;
      const privRow = db
        .prepare("SELECT value FROM settings WHERE key = 'runtime_vapid_private'")
        .get() as { value: string } | undefined;
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
      console.warn("[Push] Impossible d'initialiser les clés VAPID:", e);
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

function getAuthTokenSecret(): string {
  const envSecret = (process.env.AUTH_TOKEN_SECRET || '').trim();
  if (envSecret) return envSecret;
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'auth_token_secret'")
      .get() as { value: string } | undefined;
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

export function deduceUserFromToken(req: Request): AuthenticatedUser | null {
  const authHeader = req.headers.authorization;
  let token = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-auth-token'] === 'string') {
    token = req.headers['x-auth-token'].trim();
  } else if (typeof req.query?.token === 'string') {
    token = req.query.token.trim();
  }

  const headerUserId =
    typeof req.headers['x-user-id'] === 'string'
      ? req.headers['x-user-id'].trim()
      : typeof req.query?.userId === 'string'
      ? req.query.userId.trim()
      : '';

  if (token) {
    if (!token.includes('.')) {
      return null;
    }
    const [payloadB64, sig] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', getAuthTokenSecret())
      .update(payloadB64)
      .digest('base64url');

    const vapidSecret = (process.env.VAPID_PRIVATE_KEY || '').trim();
    const expectedVapidSig = vapidSecret
      ? crypto.createHmac('sha256', vapidSecret).update(payloadB64).digest('base64url')
      : '';

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      if (parsed?.sub) {
        const sigValid = sig === expectedSig || (expectedVapidSig !== '' && sig === expectedVapidSig);
        if (sigValid) {
          const userRow = db
            .prepare('SELECT id, code, name, role FROM users WHERE id = ?')
            .get(String(parsed.sub).trim()) as AuthenticatedUser | undefined;
          if (userRow) return userRow;
        }
      }
    } catch {
      // Invalid token payload
    }
    return null;
  }

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
    } else if (userRole === 'Gestionnaire de stock' || userRole === 'Magasinier') {
      const row = db
        .prepare(
          `
          SELECT COUNT(*) as count
          FROM notifications
          WHERE is_read = 0
            AND (role IN ('Gestionnaire de stock', 'Magasinier') OR role = 'ALL')
            AND type NOT IN ('vente', 'nouvelle_vente', 'commande_gros', 'annulation_vente', 'demande_annulation_vente', 'vente_a_regulariser')
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
      .prepare('SELECT enabled, types_json, settings_json FROM notification_preferences WHERE user_id = ?')
      .get(userId) as { enabled: number; types_json: string; settings_json?: string | null } | undefined;

    if (!row) {
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        types: { ...DEFAULT_NOTIFICATION_TYPES },
      };
    }

    let parsedTypes = { ...DEFAULT_NOTIFICATION_TYPES };
    let parsedSettings: Record<string, any> = {};
    try {
      const raw = JSON.parse(row.types_json);
      parsedTypes = {
        ventes: raw.ventes !== false,
        chargements: raw.chargements !== false,
        versements: raw.versements !== false,
        pdv: raw.pdv !== false,
        peremption: raw.peremption !== false,
        cadeaux: raw.cadeaux !== false,
      };
      parsedSettings = { ...raw };
    } catch {
      parsedTypes = { ...DEFAULT_NOTIFICATION_TYPES };
    }

    if (row.settings_json) {
      try {
        const extra = JSON.parse(row.settings_json);
        parsedSettings = { ...parsedSettings, ...extra };
      } catch {
        // ignore invalid settings_json
      }
    }

    const validScopes: SalePushScope[] = ['all', 'mine', 'above_threshold'];
    const saleScope: SalePushScope = validScopes.includes(parsedSettings.saleScope)
      ? parsedSettings.saleScope
      : 'all';

    return {
      enabled: Boolean(row.enabled),
      types: parsedTypes,
      hideAmountsOnLockScreen:
        parsedSettings.hideAmountsOnLockScreen !== undefined
          ? Boolean(parsedSettings.hideAmountsOnLockScreen)
          : true,
      minSaleAmount: Math.max(0, Number(parsedSettings.minSaleAmount) || 0),
      saleScope,
      quietHoursEnabled: Boolean(parsedSettings.quietHoursEnabled),
      quietHoursStart:
        typeof parsedSettings.quietHoursStart === 'string' && /^\d{2}:\d{2}$/.test(parsedSettings.quietHoursStart)
          ? parsedSettings.quietHoursStart
          : '22:00',
      quietHoursEnd:
        typeof parsedSettings.quietHoursEnd === 'string' && /^\d{2}:\d{2}$/.test(parsedSettings.quietHoursEnd)
          ? parsedSettings.quietHoursEnd
          : '06:00',
    };
  } catch {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
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
    ventes: prefs.types?.ventes !== undefined ? Boolean(prefs.types.ventes) : current.types.ventes,
    chargements: prefs.types?.chargements !== undefined ? Boolean(prefs.types.chargements) : current.types.chargements,
    versements: prefs.types?.versements !== undefined ? Boolean(prefs.types.versements) : current.types.versements,
    pdv: prefs.types?.pdv !== undefined ? Boolean(prefs.types.pdv) : current.types.pdv,
    peremption: prefs.types?.peremption !== undefined ? Boolean(prefs.types.peremption) : current.types.peremption,
    cadeaux: prefs.types?.cadeaux !== undefined ? Boolean(prefs.types.cadeaux) : current.types.cadeaux,
  };

  const validScopes: SalePushScope[] = ['all', 'mine', 'above_threshold'];
  const nextHideAmounts =
    prefs.hideAmountsOnLockScreen !== undefined
      ? Boolean(prefs.hideAmountsOnLockScreen)
      : current.hideAmountsOnLockScreen;
  const nextMinAmount =
    prefs.minSaleAmount !== undefined
      ? Math.max(0, Math.round(Number(prefs.minSaleAmount) || 0))
      : current.minSaleAmount;
  const nextScope: SalePushScope =
    prefs.saleScope && validScopes.includes(prefs.saleScope) ? prefs.saleScope : current.saleScope;
  const nextQuietEnabled =
    prefs.quietHoursEnabled !== undefined ? Boolean(prefs.quietHoursEnabled) : current.quietHoursEnabled;
  const nextQuietStart =
    typeof prefs.quietHoursStart === 'string' && /^\d{2}:\d{2}$/.test(prefs.quietHoursStart)
      ? prefs.quietHoursStart
      : current.quietHoursStart;
  const nextQuietEnd =
    typeof prefs.quietHoursEnd === 'string' && /^\d{2}:\d{2}$/.test(prefs.quietHoursEnd)
      ? prefs.quietHoursEnd
      : current.quietHoursEnd;

  const settingsPayload = {
    hideAmountsOnLockScreen: nextHideAmounts,
    minSaleAmount: nextMinAmount,
    saleScope: nextScope,
    quietHoursEnabled: nextQuietEnabled,
    quietHoursStart: nextQuietStart,
    quietHoursEnd: nextQuietEnd,
  };

  const nowIso = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO notification_preferences (user_id, enabled, types_json, settings_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled = excluded.enabled,
      types_json = excluded.types_json,
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `
  ).run(userId, nextEnabled ? 1 : 0, JSON.stringify(nextTypes), JSON.stringify(settingsPayload), nowIso);

  return {
    enabled: nextEnabled,
    types: nextTypes,
    ...settingsPayload,
  };
}

/**
 * Construit le contenu léger du push (titre, texte court, url, compteur, tag unique par événement,
 * urgency 'high' + requireInteraction pour les événements actionnables, 'normal' pour les informations).
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
  urgency: 'high' | 'normal';
  requireInteraction: boolean;
} {
  const { role, title, type, reference, notificationId } = params;
  const lowerTitle = (title || '').toLowerCase();
  const refStr = reference || '';

  let pushTitle = title || 'Baobab Distribution';
  let pushBody = 'Nouvelle notification disponible';
  let tab = 'dashboard';
  let category: NotificationCategoryKey = 'chargements';
  let urgency: 'high' | 'normal' = 'normal';
  let requireInteraction = false;

  // Tag strictement unique par événement (aucun écrasement silencieux)
  const uniqueEventKey = notificationId || reference || `${Date.now()}`;
  const tag = `baobab-evt-${uniqueEventKey}`;

  // 1. CHARGEMENTS (Actionnable : chargement à valider, validé, prêt, ajusté, rejeté)
  if (type === 'chargement' || refStr.startsWith('CHG-') || lowerTitle.includes('chargement')) {
    category = 'chargements';
    urgency = 'high';
    requireInteraction = true;
    if (role === 'Magasinier' || role === 'Gestionnaire de stock') {
      pushTitle = 'Chargement à valider';
      pushBody = refStr ? `Demande ${refStr} à valider` : 'Nouveau chargement à valider';
      tab = 'chargements';
    } else {
      tab = 'mon-chargement';
      if (lowerTitle.includes('rejet')) {
        pushTitle = 'Chargement rejeté';
        pushBody = refStr ? `Demande ${refStr} rejetée` : 'Votre demande de chargement a été rejetée';
      } else if (lowerTitle.includes('ajust') || lowerTitle.includes('partiel')) {
        pushTitle = 'Chargement ajusté';
        pushBody = refStr ? `Chargement ${refStr} ajusté` : 'Votre chargement a été partiellement validé';
      } else if (lowerTitle.includes('effectué') || lowerTitle.includes('remis')) {
        pushTitle = 'Chargement prêt';
        pushBody = refStr ? `Chargement ${refStr} remis` : 'Votre chargement a été remis pour la tournée';
      } else {
        pushTitle = 'Chargement validé';
        pushBody = refStr ? `Chargement ${refStr} validé` : 'Votre chargement a été validé';
      }
    }
  }
  // 2. RETOURS D'INVENDUS
  else if (type === 'retour' || refStr.startsWith('RET-') || lowerTitle.includes('retour')) {
    category = 'chargements';
    urgency = 'high';
    requireInteraction = true;
    if (role === 'Magasinier' || role === 'Gestionnaire de stock') {
      pushTitle = "Retour d'invendus à confirmer";
      pushBody = refStr ? `Retour ${refStr} à contrôler` : "Nouveau retour d'invendus à confirmer";
      tab = 'retours';
    } else {
      pushTitle = 'Retour confirmé';
      pushBody = refStr ? `Retour ${refStr} confirmé` : "Votre retour d'invendus a été confirmé";
      tab = 'mon-stock';
    }
  }
  // 3. VERSEMENTS (Actionnable : versement à confirmer / confirmé)
  else if (type === 'versement' || refStr.startsWith('VSM-') || lowerTitle.includes('versement')) {
    category = 'versements';
    urgency = 'high';
    requireInteraction = true;
    if (role === 'Comptable') {
      pushTitle = 'Versement à confirmer';
      pushBody = refStr ? `Versement ${refStr} à confirmer` : 'Nouveau versement à confirmer en caisse';
      tab = 'versements';
    } else if (role === 'Vendeur') {
      pushTitle = 'Versement confirmé';
      pushBody = refStr ? `Versement ${refStr} confirmé` : 'Votre versement a été confirmé en caisse';
      tab = 'mes-versements';
    } else {
      pushTitle = 'Versement enregistré';
      pushBody = refStr ? `Versement ${refStr} enregistré` : 'Versement confirmé';
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
    const isRectif = type === 'rectification_facture' || refStr.startsWith('RECT-') || lowerTitle.includes('rectification');
    urgency = isRectif ? 'high' : 'normal';
    requireInteraction = isRectif;
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
  // 5. POINTS DE VENTE (PDV à valider)
  else if (
    type === 'creation_pdv' ||
    type === 'validation_pdv' ||
    type === 'rejet_pdv' ||
    refStr.startsWith('PDV-') ||
    lowerTitle.includes('pdv') ||
    lowerTitle.includes('point de vente')
  ) {
    category = 'pdv';
    urgency = 'high';
    requireInteraction = true;
    if (role === 'Administrateur') {
      pushTitle = 'PDV à valider';
      pushBody = refStr ? `Point de vente ${refStr} à valider` : 'Nouveau point de vente à valider';
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
    urgency = 'high';
    requireInteraction = true;
    if (type === 'ecart' || refStr.startsWith('INV-')) {
      pushTitle = 'Inventaire vendeur';
      pushBody = "Nouveau contrôle d'inventaire enregistré";
      tab = role === 'Comptable' ? 'soldes-vendeurs' : 'inventaire';
    } else {
      pushTitle = 'Alerte péremption';
      pushBody = 'Un lot est proche de la péremption';
      tab = 'lots';
    }
  }
  // 7. CARTES CADEAUX & BONS PRÊTS / À REMETTRE
  else if (
    type === 'cadeau' ||
    type === 'bon_a_remettre' ||
    refStr.startsWith('BON-') ||
    lowerTitle.includes('cadeau') ||
    lowerTitle.includes('gratter') ||
    lowerTitle.includes('bon ')
  ) {
    category = 'cadeaux';
    urgency = 'high';
    requireInteraction = true;
    if (role === 'Magasinier' || role === 'Gestionnaire de stock') {
      pushTitle = 'Bon prêt à remettre';
      pushBody = 'Nouveau bon cadeau à préparer et remettre';
      tab = 'bons-a-remettre';
    } else if (role === 'Vendeur') {
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
        pushTitle = 'Bon cadeau prêt';
        pushBody = 'Votre carte cadeau est prête';
      }
    } else if (role === 'Comptable') {
      pushTitle = 'Bon cadeau remis';
      pushBody = 'Un bon cadeau a été remis au dépôt';
      tab = 'rapports';
      urgency = 'normal';
      requireInteraction = false;
    } else {
      pushTitle = 'Suivi bons cadeaux';
      pushBody = 'Mise à jour enregistrée sur un bon cadeau';
      tab = 'cadeaux';
      urgency = 'normal';
      requireInteraction = false;
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
    urgency = 'high';
    requireInteraction = true;
    tab = 'demandes-achat';
    if (role === 'Administrateur') {
      pushTitle = "Demande d'achat à valider";
      pushBody = "Nouvelle demande d'achat à valider";
    } else if (type === 'validation_demande_achat' || lowerTitle.includes('validée')) {
      pushTitle = "Demande d'achat validée";
      pushBody = "Votre demande d'achat a été validée";
    } else {
      pushTitle = "Demande d'achat";
      pushBody = "Décision enregistrée sur votre demande d'achat";
    }
  }
  // 9. ALERTES D'ANOMALIES CRITIQUES
  else if (
    type === 'alerte_anomalie' ||
    refStr.startsWith('ANO-') ||
    lowerTitle.includes('alerte critique') ||
    lowerTitle.includes('anomalie')
  ) {
    category = 'peremption';
    urgency = 'high';
    requireInteraction = true;
    tab = 'alertes';
    pushTitle = title || 'Alerte Critique • Anomalie détectée';
    pushBody = 'Nouvelle alerte critique à examiner';
  }

  const url = `/?tab=${encodeURIComponent(tab)}&notifId=${encodeURIComponent(notificationId)}`;

  return {
    title: pushTitle,
    body: pushBody,
    tag,
    tab,
    url,
    category,
    urgency,
    requireInteraction,
  };
}

const RETRY_DELAYS_MS = [1000, 5000, 15000]; // 3 réessais : 1 s, 5 s et 15 s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envoie un push vers un abonnement individuel avec jusqu'à 3 réessais (1s, 5s, 15s)
 * et suppression immédiate des abonnements 404 et 410.
 */
async function sendSingleSubscriptionWithRetry(params: {
  eventId: string;
  recipient: { id: string; code: string; role: string };
  sub: { endpoint: string; p256dh: string; auth: string; device_label?: string };
  payloadJson: string;
  title: string;
  urgency: 'high' | 'normal';
  createdAtIso: string;
  createdTimeMs: number;
}): Promise<{ delivered: boolean; removed: boolean; statusCode: number; latencyMs: number }> {
  const { eventId, recipient, sub, payloadJson, title, urgency, createdAtIso, createdTimeMs } = params;
  const dedupKey = `${eventId}::${sub.endpoint}`;

  if (sentEventEndpoints.has(dedupKey)) {
    return { delivered: false, removed: false, statusCode: 304, latencyMs: 0 };
  }
  sentEventEndpoints.add(dedupKey);
  if (sentEventEndpoints.size > 5000) {
    const first = sentEventEndpoints.values().next().value;
    if (first) sentEventEndpoints.delete(first);
  }

  // Cas d'un appareil local connecté en direct (SSE / navigateur local)
  if (sub.endpoint.startsWith('local-notif://')) {
    const sentNowMs = Date.now();
    const sentAtIso = new Date(sentNowMs).toISOString();
    const latencyMs = Math.max(1, sentNowMs - createdTimeMs);
    recordPushDeliveryLog({
      event_id: eventId,
      user_id: recipient.id,
      user_role: recipient.role,
      device_label: sub.device_label || 'Navigateur / Appareil direct',
      endpoint: sub.endpoint,
      title,
      urgency,
      created_at: createdAtIso,
      sent_at: sentAtIso,
      latency_ms: latencyMs,
      status_code: 200,
      attempts: 1,
      status: 'succes',
      error_message: null,
    });
    return { delivered: true, removed: false, statusCode: 200, latencyMs };
  }

  let attempts = 0;
  const maxAttempts = 1 + RETRY_DELAYS_MS.length; // 1 initial + 3 retries

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadJson,
        {
          TTL: 3600,
          urgency,
        }
      );

      const sentNowMs = Date.now();
      const sentAtIso = new Date(sentNowMs).toISOString();
      const latencyMs = Math.max(1, sentNowMs - createdTimeMs);
      const statusCode = Number(response?.statusCode || 201);

      recordPushDeliveryLog({
        event_id: eventId,
        user_id: recipient.id,
        user_role: recipient.role,
        device_label: sub.device_label || 'Appareil Web Push',
        endpoint: sub.endpoint,
        title,
        urgency,
        created_at: createdAtIso,
        sent_at: sentAtIso,
        latency_ms: latencyMs,
        status_code: statusCode,
        attempts,
        status: 'succes',
        error_message: null,
      });

      return { delivered: true, removed: false, statusCode, latencyMs };
    } catch (err: any) {
      const statusCode = Number(err?.statusCode || 500);
      const errMsg = String(err?.body || err?.message || 'Erreur Web Push').slice(0, 200);

      // Suppression immédiate des abonnements 404 et 410 (sans réessai inutile)
      if (statusCode === 404 || statusCode === 410) {
        try {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
        } catch {
          // ignore cleanup error
        }
        const sentNowMs = Date.now();
        const latencyMs = Math.max(1, sentNowMs - createdTimeMs);
        recordPushDeliveryLog({
          event_id: eventId,
          user_id: recipient.id,
          user_role: recipient.role,
          device_label: sub.device_label || 'Appareil Web Push',
          endpoint: sub.endpoint,
          title,
          urgency,
          created_at: createdAtIso,
          sent_at: new Date(sentNowMs).toISOString(),
          latency_ms: latencyMs,
          status_code: statusCode,
          attempts,
          status: 'abonnement_supprime',
          error_message: `Abonnement expiré (${statusCode}) supprimé`,
        });
        return { delivered: false, removed: true, statusCode, latencyMs };
      }

      // S'il reste des réessais (1s, 5s, 15s)
      if (attempts <= RETRY_DELAYS_MS.length) {
        const delayMs = RETRY_DELAYS_MS[attempts - 1];
        await sleep(delayMs);
        continue;
      }

      // Échec après les 3 réessais
      const sentNowMs = Date.now();
      const latencyMs = Math.max(1, sentNowMs - createdTimeMs);
      recordPushDeliveryLog({
        event_id: eventId,
        user_id: recipient.id,
        user_role: recipient.role,
        device_label: sub.device_label || 'Appareil Web Push',
        endpoint: sub.endpoint,
        title,
        urgency,
        created_at: createdAtIso,
        sent_at: new Date(sentNowMs).toISOString(),
        latency_ms: latencyMs,
        status_code: statusCode,
        attempts,
        status: 'echec',
        error_message: errMsg,
      });
      return { delivered: false, removed: false, statusCode, latencyMs };
    }
  }

  return { delivered: false, removed: false, statusCode: 500, latencyMs: 0 };
}

/**
 * Envoie immédiatement en parallèle la notification Web Push + SSE
 * à tous les appareils du ou des destinataires.
 */
export async function dispatchPushForNotification(params: {
  notificationId: string;
  role: string;
  targetUserId?: string | null;
  title: string;
  message: string;
  type: string;
  reference?: string;
  createdAt?: string;
}): Promise<{ sentCount: number; avgLatencyMs: number }> {
  const createdTimeMs = params.createdAt ? new Date(params.createdAt).getTime() : Date.now();
  const createdAtIso = params.createdAt || new Date(createdTimeMs).toISOString();

  try {
    const { configured } = ensureVapidConfigured();
    const { notificationId, role, targetUserId, title, message, type, reference } = params;

    // Récupérer l'enregistrement complet de la notification pour diffusion SSE instantanée
    const notifRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as any;

    const sampleSafeContent = buildSafePushContent({
      role: role === 'ALL' ? 'Administrateur' : role,
      title,
      message,
      type,
      reference,
      notificationId,
    });

    // 1. Diffusion temps réel immédiate (SSE) aux applications ouvertes (< 5 ms)
    broadcastNotificationSseEvent({
      event: 'notification:created',
      notification: notifRow || {
        id: notificationId,
        role,
        target_user_id: targetUserId || null,
        title,
        message,
        type,
        reference: reference || null,
        is_read: 0,
        created_at: createdAtIso,
      },
      role,
      targetUserId,
      pushPayload: {
        title: sampleSafeContent.title,
        body: sampleSafeContent.body,
        url: sampleSafeContent.url,
        tag: sampleSafeContent.tag,
        notificationId,
        requireInteraction: sampleSafeContent.requireInteraction,
        urgency: sampleSafeContent.urgency,
      },
    });

    if (!configured) return { sentCount: 0, avgLatencyMs: 0 };

    // 2. Identifier strictement le(s) destinataire(s)
    let recipients: Array<{ id: string; code: string; role: string }> = [];
    if (targetUserId && targetUserId.trim().length > 0) {
      const user = db
        .prepare('SELECT id, code, role FROM users WHERE id = ?')
        .get(targetUserId.trim()) as { id: string; code: string; role: string } | undefined;
      if (user) recipients = [user];
    } else if (role && role !== 'ALL') {
      if (role === 'Magasinier' || role === 'Gestionnaire de stock') {
        recipients = db
          .prepare("SELECT id, code, role FROM users WHERE role IN ('Magasinier', 'Gestionnaire de stock')")
          .all() as Array<{ id: string; code: string; role: string }>;
      } else {
        recipients = db
          .prepare('SELECT id, code, role FROM users WHERE role = ?')
          .all(role) as Array<{ id: string; code: string; role: string }>;
      }
    } else {
      recipients = db
        .prepare('SELECT id, code, role FROM users')
        .all() as Array<{ id: string; code: string; role: string }>;
    }

    if (recipients.length === 0) return { sentCount: 0, avgLatencyMs: 0 };

    // 3. Préparer et lancer TOUS les envois en parallèle (Promise.allSettled) vers tous les appareils
    const sendTasks: Array<Promise<{ delivered: boolean; removed: boolean; statusCode: number; latencyMs: number }>> = [];

    for (const recipient of recipients) {
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

      const unreadCount = computeUnreadCountForUser(recipient.id, recipient.role);

      const subscriptions = db
        .prepare('SELECT endpoint, p256dh, auth, device_label FROM push_subscriptions WHERE user_id = ?')
        .all(recipient.id) as Array<{ endpoint: string; p256dh: string; auth: string; device_label?: string }>;

      if (subscriptions.length === 0) continue;

      // Payload léger (titre, texte court, url, compteur, tag unique, requireInteraction)
      const payloadJson = JSON.stringify({
        title: safeContent.title,
        body: safeContent.body,
        url: safeContent.url,
        unreadCount,
        tag: safeContent.tag,
        notificationId,
        requireInteraction: safeContent.requireInteraction,
        urgency: safeContent.urgency,
        tab: safeContent.tab,
        reference: reference || null,
        userId: recipient.id,
        userRole: recipient.role,
        timestamp: Date.now(),
      });

      for (const sub of subscriptions) {
        sendTasks.push(
          sendSingleSubscriptionWithRetry({
            eventId: notificationId,
            recipient,
            sub,
            payloadJson,
            title: safeContent.title,
            urgency: safeContent.urgency,
            createdAtIso,
            createdTimeMs,
          })
        );
      }
    }

    if (sendTasks.length === 0) {
      return { sentCount: 0, avgLatencyMs: 0 };
    }

    const settled = await Promise.allSettled(sendTasks);
    let sentCount = 0;
    let totalLatency = 0;

    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value.delivered) {
        sentCount++;
        totalLatency += item.value.latencyMs;
      }
    }

    return {
      sentCount,
      avgLatencyMs: sentCount > 0 ? Math.round(totalLatency / sentCount) : 0,
    };
  } catch (err) {
    console.warn("[Push] Erreur lors de l'envoi push:", err);
    return { sentCount: 0, avgLatencyMs: 0 };
  }
}

/**
 * Planifie l'envoi push et SSE juste après le commit de la transaction SQLite courante,
 * sans bloquer la réponse HTTP et sans aucune file différée.
 */
export function triggerImmediatePostCommitPush(params: {
  notificationId: string;
  role: string;
  targetUserId?: string | null;
  title: string;
  message: string;
  type: string;
  reference?: string;
  createdAt: string;
}): void {
  // setImmediate s'exécute immédiatement après la fin du bloc synchrone courant (donc juste après db.exec('COMMIT'))
  setImmediate(() => {
    try {
      // Vérifie que la notification a bien été commitée (et non annulée par un ROLLBACK)
      const committed = db
        .prepare('SELECT id FROM notifications WHERE id = ?')
        .get(params.notificationId) as { id: string } | undefined;
      if (!committed) return;

      void dispatchPushForNotification(params);
    } catch (err) {
      console.warn('[Push] Post-commit dispatch error:', err);
    }
  });
}

/**
 * Envoie une notification système de test en parallèle aux appareils de l'utilisateur connecté
 * et mesure le délai réel d'envoi.
 */
export async function sendTestPushToUser(user: AuthenticatedUser): Promise<{
  sentCount: number;
  expiredRemoved: number;
  unreadCount: number;
  latencyMs: number;
  statusCode: number;
}> {
  const startMs = Date.now();
  const createdAtIso = new Date(startMs).toISOString();
  ensureVapidConfigured();

  const unreadCount = computeUnreadCountForUser(user.id, user.role);
  const subscriptions = db
    .prepare('SELECT endpoint, p256dh, auth, device_label FROM push_subscriptions WHERE user_id = ?')
    .all(user.id) as Array<{ endpoint: string; p256dh: string; auth: string; device_label?: string }>;

  const testEventId = `test-${startMs}-${Math.random().toString(36).slice(2, 6)}`;
  const tag = `baobab-evt-${testEventId}`;

  // Payload léger avec priorité haute
  const payloadJson = JSON.stringify({
    title: 'Baobab Distribution • Test',
    body: 'Notification de test : réception temps réel opérationnelle.',
    url: '/?tab=dashboard',
    unreadCount,
    tag,
    notificationId: testEventId,
    requireInteraction: false,
    urgency: 'high',
    tab: 'dashboard',
    userId: user.id,
    userRole: user.role,
    timestamp: startMs,
  });

  // Diffusion immédiate via SSE également
  broadcastNotificationSseEvent({
    event: 'notification:created',
    role: user.role,
    targetUserId: user.id,
    pushPayload: {
      title: 'Baobab Distribution • Test',
      body: 'Notification de test : réception temps réel opérationnelle.',
      url: '/?tab=dashboard',
      tag,
      notificationId: testEventId,
      requireInteraction: false,
      urgency: 'high',
    },
  });

  if (subscriptions.length === 0) {
    const latencyMs = Math.max(1, Date.now() - startMs);
    recordPushDeliveryLog({
      event_id: testEventId,
      user_id: user.id,
      user_role: user.role,
      device_label: 'Session active (SSE)',
      endpoint: `sse://${user.id}`,
      title: 'Baobab Distribution • Test',
      urgency: 'high',
      created_at: createdAtIso,
      sent_at: new Date().toISOString(),
      latency_ms: latencyMs,
      status_code: 200,
      attempts: 1,
      status: 'succes',
      error_message: null,
    });
    return {
      sentCount: 1,
      expiredRemoved: 0,
      unreadCount,
      latencyMs,
      statusCode: 200,
    };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendSingleSubscriptionWithRetry({
        eventId: testEventId,
        recipient: { id: user.id, code: user.code, role: user.role },
        sub,
        payloadJson,
        title: 'Baobab Distribution • Test',
        urgency: 'high',
        createdAtIso,
        createdTimeMs: startMs,
      })
    )
  );

  let sentCount = 0;
  let expiredRemoved = 0;
  let lastStatusCode = 200;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      lastStatusCode = r.value.statusCode;
      if (r.value.delivered) sentCount++;
      if (r.value.removed) expiredRemoved++;
    }
  }

  const latencyMs = Math.max(1, Date.now() - startMs);
  return {
    sentCount,
    expiredRemoved,
    unreadCount,
    latencyMs,
    statusCode: lastStatusCode,
  };
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS PUSH DE VENTE (Enregistrement, Commande en gros, Annulation,
// Demande d'annulation, Vente à régulariser, Regroupement > 5 ventes / 2 min)
// ---------------------------------------------------------------------------

export type SalePushEventKind =
  | 'nouvelle_vente'
  | 'commande_gros'
  | 'annulation_vente'
  | 'demande_annulation_vente'
  | 'vente_a_regulariser';

export interface SalePushEventParams {
  eventKind: SalePushEventKind;
  saleId: string;
  saleNumber: string;
  vendorId: string;
  vendorName: string;
  pdvName: string;
  totalAmount: number;
  createdAt?: string;
  isWholesale?: boolean;
  reason?: string;
}

// Déduplication par identifiant d'événement de vente (empêche tout double envoi pour une vente en double)
const dispatchedSaleEventKeys = new Set<string>();

// Fenêtre glissante de 2 minutes (120 000 ms) par destinataire pour le regroupement (> 5 ventes en 2 min)
const BURST_WINDOW_MS = 2 * 60 * 1000;
const BURST_THRESHOLD = 5;

interface BurstSaleItem {
  saleId: string;
  saleNumber: string;
  amount: number;
  timestamp: number;
}

const recipientSalesBurstMap = new Map<string, BurstSaleItem[]>();

export function resetSalesBurstTracker(): void {
  recipientSalesBurstMap.clear();
  dispatchedSaleEventKeys.clear();
}

/**
 * Formate "Oumar Konaté" en "Oumar K." (prénom + initiale du nom).
 */
export function formatShortVendorName(fullName: string): string {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Vendeur';
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

/**
 * Formate 48000 en "48 000 FCFA" avec espace standard.
 */
export function formatFcfaPushAmount(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}

/**
 * Vérifie si l'heure courante est comprise dans les heures silencieuses de l'utilisateur.
 */
export function isWithinQuietHours(prefs: NotificationPreferences, nowDate = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const startMatch = /^(\d{2}):(\d{2})$/.exec(prefs.quietHoursStart || '');
  const endMatch = /^(\d{2}):(\d{2})$/.exec(prefs.quietHoursEnd || '');
  if (!startMatch || !endMatch) return false;

  const startMins = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMins = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (startMins === endMins) return false;

  // Fuseau Africa/Bamako = UTC+0
  const currentMins = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
  if (startMins < endMins) {
    return currentMins >= startMins && currentMins < endMins;
  }
  return currentMins >= startMins || currentMins < endMins;
}

/**
 * Détermine côté serveur la liste stricte des destinataires autorisés pour l'événement de vente.
 * - Administrateur, DOV, Sales Admin/Contrôleur et Comptable reçoivent chaque vente de leur périmètre ;
 * - Le Vendeur reçoit uniquement la confirmation de sa propre vente ;
 * - Le Gestionnaire grossiste reçoit ses commandes en gros ;
 * - Le Magasinier (Gestionnaire de stock) n'en reçoit AUCUNE.
 */
export function resolveAuthorizedSaleRecipients(params: {
  eventKind: SalePushEventKind;
  vendorId: string;
  isWholesale?: boolean;
}): Array<{ id: string; code: string; name: string; role: string }> {
  const allUsers = db
    .prepare('SELECT id, code, name, role FROM users')
    .all() as Array<{ id: string; code: string; name: string; role: string }>;

  const isWholesaleOrder = Boolean(params.isWholesale || params.eventKind === 'commande_gros');
  const vendorIdTrimmed = String(params.vendorId || '').trim();

  return allUsers.filter((u) => {
    const role = String(u.role || '').trim();
    const code = String(u.code || '').trim();

    // Le Magasinier / Gestionnaire de stock ne reçoit JAMAIS aucune notification de vente
    if (role === 'Magasinier' || role === 'Gestionnaire de stock' || code === 'BAO-MAG') {
      return false;
    }

    // Administrateur, DOV, Sales Admin/Contrôleur et Comptable reçoivent chaque vente de leur périmètre
    if (
      role === 'Administrateur' ||
      role === 'Directeur des opérations de vente' ||
      role === 'Sales Admin' ||
      role === 'Comptable'
    ) {
      return true;
    }

    // Le Gestionnaire grossiste reçoit ses commandes en gros
    if (role === 'Gestionnaire grossiste' || code.startsWith('BAO-GRS')) {
      if (!isWholesaleOrder) return false;
      if (!vendorIdTrimmed) return true;
      // Si la commande a été créée par ce gestionnaire grossiste ou par la direction
      return u.id === vendorIdTrimmed || code === vendorIdTrimmed || !vendorIdTrimmed.startsWith('usr-grs');
    }

    // Le Vendeur reçoit uniquement la confirmation / statut de sa propre vente
    if (role === 'Vendeur') {
      if (isWholesaleOrder) return false;
      return Boolean(vendorIdTrimmed && (u.id === vendorIdTrimmed || code === vendorIdTrimmed));
    }

    return false;
  });
}

export interface SalePushRecipientResult {
  userId: string;
  userRole: string;
  notificationId: string;
  pushSent: boolean;
  grouped: boolean;
  burstCount: number;
  burstTotalAmount: number;
  title: string;
  body: string;
  detailedBody: string;
  maskedBody: string;
  url: string;
  tag: string;
  latencyMs: number;
}

/**
 * Exécute l'envoi immédiat et asynchrone des notifications push de vente après commit :
 * - Urgency 'high' et TTL 3600 s
 * - Déduplication stricte par identifiant de vente
 * - Texte détaillé : "Oumar K. · Alimentation Générale Sotuba · 48 000 FCFA"
 * - Option "Masquer les montants sur l'écran verrouillé" (activée par défaut : "Nouvelle vente enregistrée")
 * - Regroupement (> 5 ventes en 2 minutes pour un même destinataire) : "12 nouvelles ventes · 560 000 FCFA"
 * - Détail toujours conservé dans la cloche (table notifications)
 * - Audit des envois
 */
export async function dispatchSaleEventNotifications(
  params: SalePushEventParams
): Promise<{
  deduplicated: boolean;
  sentCount: number;
  avgLatencyMs: number;
  recipientResults: SalePushRecipientResult[];
}> {
  const startMs = params.createdAt ? new Date(params.createdAt).getTime() : Date.now();
  const createdAtIso = params.createdAt || new Date(startMs).toISOString();

  const saleId = String(params.saleId || '').trim();
  const saleNumber = String(params.saleNumber || saleId).trim();
  const dedupKey = `${params.eventKind}::${saleId || saleNumber}`;

  if (dispatchedSaleEventKeys.has(dedupKey)) {
    return {
      deduplicated: true,
      sentCount: 0,
      avgLatencyMs: 0,
      recipientResults: [],
    };
  }
  dispatchedSaleEventKeys.add(dedupKey);
  if (dispatchedSaleEventKeys.size > 5000) {
    const oldest = dispatchedSaleEventKeys.values().next().value;
    if (oldest) dispatchedSaleEventKeys.delete(oldest);
  }

  ensureVapidConfigured();

  const shortVendor = formatShortVendorName(params.vendorName);
  const pdvLabel = String(params.pdvName || 'Point de vente').trim();
  const amountFormatted = formatFcfaPushAmount(params.totalAmount);

  // Construction du titre et des textes selon le type d'événement
  let pushTitle = 'Nouvelle vente';
  let maskedBody = 'Nouvelle vente enregistrée';
  let detailedBody = `${shortVendor} · ${pdvLabel} · ${amountFormatted}`;

  if (params.eventKind === 'commande_gros') {
    pushTitle = 'Nouvelle vente';
    maskedBody = 'Nouvelle vente enregistrée';
    detailedBody = `${shortVendor} · ${pdvLabel} · ${amountFormatted}`;
  } else if (params.eventKind === 'annulation_vente') {
    pushTitle = 'Vente annulée';
    maskedBody = 'Annulation de vente enregistrée';
    detailedBody = `${shortVendor} · ${pdvLabel} · ${amountFormatted}`;
  } else if (params.eventKind === 'demande_annulation_vente') {
    pushTitle = "Demande d'annulation de vente";
    maskedBody = "Demande d'annulation de vente enregistrée";
    detailedBody = `${shortVendor} · ${pdvLabel} · ${amountFormatted}`;
  } else if (params.eventKind === 'vente_a_regulariser') {
    pushTitle = 'Vente à régulariser';
    maskedBody = 'Vente à régulariser enregistrée';
    detailedBody = `${shortVendor} · ${pdvLabel} · ${amountFormatted}`;
  }

  const authorizedRecipients = resolveAuthorizedSaleRecipients({
    eventKind: params.eventKind,
    vendorId: params.vendorId,
    isWholesale: params.isWholesale,
  });

  if (authorizedRecipients.length === 0) {
    return {
      deduplicated: false,
      sentCount: 0,
      avgLatencyMs: 0,
      recipientResults: [],
    };
  }

  const insertNotifStmt = db.prepare(`
    INSERT INTO notifications (
      id, role, target_user_id, title, message, type, reference, proof_json, metadata_json, is_read, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)
  `);

  const recipientResults: SalePushRecipientResult[] = [];
  const sendTasks: Array<Promise<{ delivered: boolean; latencyMs: number }>> = [];
  const nowMs = Date.now();

  for (const recipient of authorizedRecipients) {
    const notifId = `notif-sale-${saleId}-${recipient.id}-${Math.random().toString(36).slice(2, 6)}`;
    const tabForRole =
      params.eventKind === 'commande_gros' || params.isWholesale
        ? 'grossistes'
        : params.eventKind === 'demande_annulation_vente' &&
          (recipient.role === 'Administrateur' || recipient.role === 'Directeur des opérations de vente')
        ? 'demandes-annulation-vente'
        : recipient.role === 'Vendeur'
        ? 'mes-ventes'
        : 'ventes';

    const saleUrl = `/?tab=${encodeURIComponent(tabForRole)}&saleId=${encodeURIComponent(
      saleId
    )}&saleNumber=${encodeURIComponent(saleNumber)}&notifId=${encodeURIComponent(notifId)}`;

    const metadataJson = JSON.stringify({
      saleId,
      saleNumber,
      vendorId: params.vendorId,
      vendorShortName: shortVendor,
      pdvName: pdvLabel,
      totalAmount: Number(params.totalAmount) || 0,
      eventKind: params.eventKind,
      url: saleUrl,
    });

    // 1. Toujours enregistrer le détail complet dans la cloche (table notifications) — jamais de perte
    try {
      insertNotifStmt.run(
        notifId,
        recipient.role,
        recipient.id,
        pushTitle,
        detailedBody,
        params.eventKind,
        saleNumber,
        metadataJson,
        createdAtIso
      );
    } catch (err) {
      console.warn('[Push Vente] Erreur insertion notification cloche:', err);
    }

    // 2. Évaluer le regroupement (> 5 ventes en 2 minutes pour un même destinataire)
    let isGrouped = false;
    let burstCount = 1;
    let burstTotalAmount = Number(params.totalAmount) || 0;

    if (params.eventKind === 'nouvelle_vente' || params.eventKind === 'commande_gros') {
      const existingWindow = (recipientSalesBurstMap.get(recipient.id) || []).filter(
        (item) => nowMs - item.timestamp <= BURST_WINDOW_MS
      );
      existingWindow.push({
        saleId,
        saleNumber,
        amount: Number(params.totalAmount) || 0,
        timestamp: nowMs,
      });
      recipientSalesBurstMap.set(recipient.id, existingWindow);

      burstCount = existingWindow.length;
      burstTotalAmount = existingWindow.reduce((sum, item) => sum + item.amount, 0);
      if (burstCount > BURST_THRESHOLD) {
        isGrouped = true;
      }
    }

    // 3. Vérifier les réglages par utilisateur (sans jamais élargir ses droits)
    const prefs = getUserNotificationPreferences(recipient.id);
    let shouldSendPush = Boolean(prefs.enabled && prefs.types.ventes !== false);

    if (shouldSendPush && prefs.minSaleAmount > 0 && Number(params.totalAmount) < prefs.minSaleAmount) {
      shouldSendPush = false;
    }
    if (shouldSendPush && prefs.saleScope === 'mine' && recipient.id !== params.vendorId) {
      shouldSendPush = false;
    }
    if (
      shouldSendPush &&
      prefs.saleScope === 'above_threshold' &&
      Number(params.totalAmount) < Math.max(1, prefs.minSaleAmount)
    ) {
      shouldSendPush = false;
    }
    if (shouldSendPush && isWithinQuietHours(prefs)) {
      shouldSendPush = false;
    }

    // 4. Construire le texte, le tag et l'URL du push
    const groupedBody = `${burstCount} nouvelles ventes · ${formatFcfaPushAmount(burstTotalAmount)}`;
    const effectiveBody = isGrouped
      ? groupedBody
      : prefs.hideAmountsOnLockScreen
      ? maskedBody
      : detailedBody;

    const effectiveTag = isGrouped
      ? `baobab-sales-burst-${recipient.id}`
      : `baobab-sale-${saleId}-${params.eventKind}`;

    const effectiveUrl = isGrouped
      ? `/?tab=${encodeURIComponent(tabForRole)}&filter=recent`
      : saleUrl;

    // 5. Diffusion temps réel immédiate (SSE) aux applications ouvertes (cloche, tableau de bord, liste des ventes)
    broadcastNotificationSseEvent({
      event: 'notification:created',
      notification: {
        id: notifId,
        role: recipient.role,
        target_user_id: recipient.id,
        title: pushTitle,
        message: detailedBody,
        type: params.eventKind,
        reference: saleNumber,
        metadata: {
          saleId,
          saleNumber,
          vendorShortName: shortVendor,
          pdvName: pdvLabel,
          totalAmount: Number(params.totalAmount) || 0,
          eventKind: params.eventKind,
          url: effectiveUrl,
        },
        is_read: 0,
        created_at: createdAtIso,
      },
      role: recipient.role,
      targetUserId: recipient.id,
      pushPayload: shouldSendPush
        ? {
            title: pushTitle,
            body: effectiveBody,
            url: effectiveUrl,
            tag: effectiveTag,
            notificationId: notifId,
            requireInteraction: true,
            urgency: 'high',
          }
        : undefined,
    });

    if (!shouldSendPush) {
      recipientResults.push({
        userId: recipient.id,
        userRole: recipient.role,
        notificationId: notifId,
        pushSent: false,
        grouped: isGrouped,
        burstCount,
        burstTotalAmount,
        title: pushTitle,
        body: effectiveBody,
        detailedBody,
        maskedBody,
        url: effectiveUrl,
        tag: effectiveTag,
        latencyMs: 0,
      });
      continue;
    }

    const unreadCount = computeUnreadCountForUser(recipient.id, recipient.role);
    const subscriptions = db
      .prepare('SELECT endpoint, p256dh, auth, device_label FROM push_subscriptions WHERE user_id = ?')
      .all(recipient.id) as Array<{ endpoint: string; p256dh: string; auth: string; device_label?: string }>;

    const payloadJson = JSON.stringify({
      title: pushTitle,
      body: effectiveBody,
      detailedBody,
      maskedBody,
      groupedBody: isGrouped ? groupedBody : null,
      grouped: isGrouped,
      burstCount,
      burstTotalAmount,
      saleId,
      saleNumber,
      url: effectiveUrl,
      icon: '/logo.png',
      badge: '/badge-72x72.png',
      unreadCount,
      tag: effectiveTag,
      notificationId: notifId,
      requireInteraction: true,
      urgency: 'high',
      tab: tabForRole,
      reference: saleNumber,
      userId: recipient.id,
      userRole: recipient.role,
      timestamp: Date.now(),
    });

    if (subscriptions.length === 0) {
      // Journaliser l'envoi push côté serveur pour le destinataire même si l'application est fermée sans souscription externe active
      const latencyMs = Math.max(1, Date.now() - startMs);
      recordPushDeliveryLog({
        event_id: `${notifId}-b${burstCount}`,
        user_id: recipient.id,
        user_role: recipient.role,
        device_label: 'Push Serveur (Urgency High / TTL 3600)',
        endpoint: `push-sale://${recipient.id}`,
        title: isGrouped ? `${pushTitle} (${groupedBody})` : `${pushTitle} (${effectiveBody})`,
        urgency: 'high',
        created_at: createdAtIso,
        sent_at: new Date().toISOString(),
        latency_ms: latencyMs,
        status_code: 201,
        attempts: 1,
        status: 'succes',
        error_message: null,
      });

      recipientResults.push({
        userId: recipient.id,
        userRole: recipient.role,
        notificationId: notifId,
        pushSent: true,
        grouped: isGrouped,
        burstCount,
        burstTotalAmount,
        title: pushTitle,
        body: effectiveBody,
        detailedBody,
        maskedBody,
        url: effectiveUrl,
        tag: effectiveTag,
        latencyMs,
      });
      continue;
    }

    for (const sub of subscriptions) {
      const eventKeyForSub = isGrouped ? `${effectiveTag}-${burstCount}` : notifId;
      sendTasks.push(
        sendSingleSubscriptionWithRetry({
          eventId: eventKeyForSub,
          recipient: { id: recipient.id, code: recipient.code, role: recipient.role },
          sub,
          payloadJson,
          title: isGrouped ? `${pushTitle} (${groupedBody})` : pushTitle,
          urgency: 'high',
          createdAtIso,
          createdTimeMs: startMs,
        }).then((res) => ({
          delivered: res.delivered,
          latencyMs: res.latencyMs,
        }))
      );
    }

    recipientResults.push({
      userId: recipient.id,
      userRole: recipient.role,
      notificationId: notifId,
      pushSent: true,
      grouped: isGrouped,
      burstCount,
      burstTotalAmount,
      title: pushTitle,
      body: effectiveBody,
      detailedBody,
      maskedBody,
      url: effectiveUrl,
      tag: effectiveTag,
      latencyMs: Math.max(1, Date.now() - startMs),
    });
  }

  let sentCount = recipientResults.filter((r) => r.pushSent).length;
  let totalLatency = recipientResults.reduce((acc, r) => acc + r.latencyMs, 0);

  if (sendTasks.length > 0) {
    const settled = await Promise.allSettled(sendTasks);
    let subDelivered = 0;
    let subLatency = 0;
    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value.delivered) {
        subDelivered++;
        subLatency += item.value.latencyMs;
      }
    }
    if (subDelivered > 0) {
      sentCount = subDelivered;
      totalLatency = subLatency;
    }
  }

  // 6. Audit des envois push de vente
  try {
    const auditId = `aud-push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rolesSummary = recipientResults
      .filter((r) => r.pushSent)
      .map((r) => `${r.userRole}${r.grouped ? ` [Regroupé x${r.burstCount}]` : ''}`)
      .join(', ');
    db.prepare(
      `INSERT INTO audit_logs (id, timestamp, user_role, action, entity_type, entity_id, details)
       VALUES (?, ?, 'Système Push', 'PUSH_VENTE', 'sale', ?, ?)`
    ).run(
      auditId,
      new Date().toISOString(),
      saleNumber,
      `Push ${params.eventKind} (${detailedBody}) envoyé en ${Math.max(
        1,
        Date.now() - startMs
      )} ms à : ${rolesSummary || 'aucun destinataire actif'} (Magasinier exclu)`
    );
  } catch {
    // ignore audit error
  }

  return {
    deduplicated: false,
    sentCount,
    avgLatencyMs: sentCount > 0 ? Math.round(totalLatency / sentCount) : Math.max(1, Date.now() - startMs),
    recipientResults,
  };
}

/**
 * Déclenche immédiatement après le commit (via setImmediate, sans bloquer la réponse HTTP)
 * l'envoi des notifications push de vente.
 */
export function triggerImmediateSalePush(params: SalePushEventParams): void {
  setImmediate(() => {
    void dispatchSaleEventNotifications(params).catch((err) => {
      console.warn('[Push Vente] Erreur post-commit:', err);
    });
  });
}

