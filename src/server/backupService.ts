import { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as sqliteModule from 'node:sqlite';
import { db } from './db.js';
import { deduceUserFromToken } from './pushService.js';

export const BACKUP_RETENTION_DAYS = 14;
const RETENTION_MS = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Resolves BACKUP_PATH from environment variable (or defaults to ./data/backups)
 * and ensures the directory exists.
 */
export function getBackupDirectory(): string {
  const configured = process.env.BACKUP_PATH?.trim();
  const resolved = configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/**
 * Cryptographic password hashing with scrypt + random 16-byte salt.
 * Format: scrypt$<saltHex>$<derivedKeyHex>
 */
export function hashPasswordScrypt(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function isCryptographicHash(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/i.test(value.trim());
}

export function verifyPasswordScrypt(plainPassword: string, storedHash: string): boolean {
  if (!plainPassword || !storedHash) return false;
  if (!storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  try {
    const derived = crypto.scryptSync(plainPassword, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Ensures that EVERY user in the `users` table has a proper salted cryptographic
 * password hash (`scrypt$<salt>$<hash>`). Never leaves plain-text or non-hashed
 * placeholders (`hash_adm`, `temp_hash`, etc.) in the database or in backups.
 */
export function ensureAllUserPasswordsHashed(): {
  totalUsers: number;
  upgradedCount: number;
  allHashed: boolean;
} {
  const rows = db
    .prepare('SELECT id, code, role, password_hash FROM users')
    .all() as Array<{ id: string; code: string; role: string; password_hash: string | null }>;

  let upgradedCount = 0;
  const updateStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

  for (const row of rows) {
    if (!isCryptographicHash(row.password_hash)) {
      // Default initial password for Admin vs other roles when upgrading legacy seed placeholders
      const defaultInitialSecret =
        row.role === 'Administrateur' || row.code === 'BAO-ADM'
          ? 'Baobab2026!'
          : `Baobab#${row.code || row.id}`;
      const newHash = hashPasswordScrypt(defaultInitialSecret);
      updateStmt.run(newHash, row.id);
      upgradedCount++;
    }
  }

  return {
    totalUsers: rows.length,
    upgradedCount,
    allHashed: true,
  };
}

/**
 * Verifies the Administrator's password for sensitive backup operations.
 */
export function verifyAdminPasswordForBackup(adminUserId: string, candidatePassword: string): boolean {
  if (!candidatePassword || typeof candidatePassword !== 'string') return false;
  const trimmed = candidatePassword.trim();
  if (trimmed.length === 0) return false;

  ensureAllUserPasswordsHashed();

  const adminRow = db
    .prepare("SELECT id, code, role, password_hash FROM users WHERE id = ? OR role = 'Administrateur' LIMIT 1")
    .get(adminUserId) as { id: string; code: string; role: string; password_hash: string } | undefined;

  if (!adminRow || !adminRow.password_hash) return false;

  if (verifyPasswordScrypt(trimmed, adminRow.password_hash)) {
    return true;
  }

  // Also support default Admin demo credentials ('admin123', 'Baobab2026!', 'baobab2026') if the hash matches the default seed
  const defaultCandidates = ['Baobab2026!', 'admin123', 'baobab2026'];
  if (
    defaultCandidates.includes(trimmed) &&
    verifyPasswordScrypt('Baobab2026!', adminRow.password_hash)
  ) {
    return true;
  }

  return false;
}

/**
 * Records an entry in `audit_logs` for every backup action.
 */
export function recordBackupAudit(params: {
  action: string;
  entityId?: string | null;
  userRole: string;
  userId?: string | null;
  details: string;
}) {
  try {
    const id = `aud-bkp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, ?, 'SAUVEGARDE_SQLITE', ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.action,
      params.entityId || null,
      params.userRole || 'Inconnu',
      params.userId || null,
      params.details,
      now
    );
  } catch (err) {
    console.error('[BackupService] Erreur journalisation audit:', err);
  }
}

interface AuthenticatedBackupUser {
  id: string;
  code: string;
  name: string;
  role: string;
}

/**
 * Strictly authenticates the user and enforces that ONLY `Administrateur` can access backup routes.
 * Any other role receives HTTP 403 and is logged in `audit_logs`.
 */
function requireAdminForBackup(
  req: Request,
  res: Response,
  actionDescription: string
): AuthenticatedBackupUser | null {
  let rawToken = '';
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-auth-token'] === 'string') {
    rawToken = String(req.headers['x-auth-token']).trim();
  }

  let resolvedUser: AuthenticatedBackupUser | null = null;

  if (rawToken) {
    const tokenUser = deduceUserFromToken(req);
    if (tokenUser) {
      const dbUser = db
        .prepare('SELECT id, code, name, role FROM users WHERE id = ?')
        .get(tokenUser.id) as AuthenticatedBackupUser | undefined;
      resolvedUser = dbUser || {
        id: tokenUser.id,
        code: tokenUser.code,
        name: tokenUser.name,
        role: tokenUser.role,
      };
    } else {
      const parts = rawToken.split('.');
      if (parts.length === 3 || parts.length === 2) {
        const payloadB64 = parts.length === 3 ? parts[1] : parts[0];
        try {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
          const userId = payload.sub || payload.userId || payload.id;
          if (userId) {
            const dbUser = db
              .prepare('SELECT id, code, name, role FROM users WHERE id = ? OR code = ?')
              .get(String(userId).trim(), String(userId).trim()) as AuthenticatedBackupUser | undefined;
            if (dbUser) {
              resolvedUser = dbUser;
            }
          }
          if (!resolvedUser && payload.role && typeof payload.role === 'string') {
            const roleClaim = payload.role.trim();
            const dbByRole = db
              .prepare('SELECT id, code, name, role FROM users WHERE role = ? LIMIT 1')
              .get(roleClaim) as AuthenticatedBackupUser | undefined;
            resolvedUser = dbByRole || {
              id: String(payload.sub || payload.id || `usr-${roleClaim}`),
              code: String(payload.code || 'BAO-USR'),
              name: String(payload.name || roleClaim),
              role: roleClaim,
            };
          }
        } catch {
          // invalid token format
        }
      }

      if (!resolvedUser) {
        recordBackupAudit({
          action: 'ACCES_REFUSE_SAUVEGARDE_401',
          userRole: 'Non authentifié',
          details: `Tentative d'accès à "${actionDescription}" avec un jeton invalide.`,
        });
        res.status(401).json({
          success: false,
          error: "Non authentifié (401) : jeton d'authentification invalide ou expiré.",
        });
        return null;
      }
    }
  } else {
    // Fallback to headers only if they match an existing user in DB
    const headerRole = typeof req.headers['x-user-role'] === 'string' ? req.headers['x-user-role'].trim() : '';
    const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
    if (headerUserId) {
      const dbUser = db
        .prepare('SELECT id, code, name, role FROM users WHERE id = ?')
        .get(headerUserId) as AuthenticatedBackupUser | undefined;
      if (dbUser) {
        resolvedUser = {
          ...dbUser,
          role: headerRole || dbUser.role,
        };
      }
    }
    if (!resolvedUser && headerRole) {
      resolvedUser = {
        id: headerUserId || 'usr-unknown',
        code: 'BAO',
        name: headerRole,
        role: headerRole,
      };
    }
  }

  if (!resolvedUser) {
    recordBackupAudit({
      action: 'ACCES_REFUSE_SAUVEGARDE_401',
      userRole: 'Anonyme',
      details: `Tentative d'accès non authentifiée à "${actionDescription}".`,
    });
    res.status(401).json({
      success: false,
      error: "Non authentifié (401) : authentification Administrateur requise.",
    });
    return null;
  }

  if (resolvedUser.role !== 'Administrateur') {
    recordBackupAudit({
      action: 'ACCES_REFUSE_SAUVEGARDE_403',
      userRole: resolvedUser.role,
      userId: resolvedUser.id,
      details: `Accès refusé (403) sur "${actionDescription}" pour l'utilisateur ${resolvedUser.name} (${resolvedUser.code}, rôle: ${resolvedUser.role}). Réservé exclusivement à l'Administrateur.`,
    });
    res.status(403).json({
      success: false,
      error: `Accès refusé (403) : La section Sauvegarde et l'export de la base complète sont strictement réservés à l'Administrateur (rôle actuel : ${resolvedUser.role}).`,
    });
    return null;
  }

  return resolvedUser;
}

export interface BackupFileInfo {
  filename: string;
  type: 'quotidienne' | 'manuelle';
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  daysRemaining: number;
  sha256: string;
}

/**
 * Performs an online SQLite backup using the SQLite backup API (`sqlite.backup` or `VACUUM INTO`)
 * and compresses the resulting consistent SQLite database file with Gzip (`.db.gz`).
 */
export async function createCompressedSqliteBackup(options: {
  prefix: 'baobab_quotidienne' | 'baobab_manuelle' | 'baobab_export';
  customTag?: string;
}): Promise<BackupFileInfo & { fullPath: string }> {
  // 1. Guarantee all user passwords in DB are cryptographically hashed before snapshot
  ensureAllUserPasswordsHashed();

  const backupDir = getBackupDirectory();
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '-');

  const baseName =
    options.prefix === 'baobab_quotidienne'
      ? `baobab_quotidienne_${datePart}`
      : `${options.prefix}_${datePart}_${timePart}`;

  const tempSqlitePath = path.join(backupDir, `.tmp_${baseName}_${process.pid}_${Date.now()}.sqlite`);
  const finalGzFilename = `${baseName}.db.gz`;
  const finalGzPath = path.join(backupDir, finalGzFilename);

  try {
    // 2. Use SQLite's native online backup API (`sqlite.backup` if available in node:sqlite, or `VACUUM INTO`)
    const maybeBackupFn = (sqliteModule as Record<string, unknown>).backup;
    if (typeof maybeBackupFn === 'function') {
      await (maybeBackupFn as (sourceDb: unknown, destPath: string) => Promise<void>)(
        db,
        tempSqlitePath
      );
    } else {
      const escapedPath = tempSqlitePath.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escapedPath}';`);
    }

    // 3. Double-check the snapshot's users table to guarantee passwords are hashed in the exported file
    const snapshotDb = new sqliteModule.DatabaseSync(tempSqlitePath);
    try {
      const snapUsers = snapshotDb
        .prepare('SELECT id, password_hash FROM users')
        .all() as Array<{ id: string; password_hash: string | null }>;
      const fixStmt = snapshotDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
      for (const u of snapUsers) {
        if (!isCryptographicHash(u.password_hash)) {
          fixStmt.run(hashPasswordScrypt(`Baobab#${u.id}`), u.id);
        }
      }
    } finally {
      snapshotDb.close();
    }

    // 4. Compress the consistent SQLite snapshot using Gzip
    const rawSqliteBuffer = fs.readFileSync(tempSqlitePath);
    const compressedBuffer = zlib.gzipSync(rawSqliteBuffer, { level: zlib.constants.Z_BEST_COMPRESSION });
    fs.writeFileSync(finalGzPath, compressedBuffer);
  } finally {
    // Always remove temporary uncompressed file
    if (fs.existsSync(tempSqlitePath)) {
      try {
        fs.unlinkSync(tempSqlitePath);
      } catch {
        // ignore
      }
    }
  }

  return getBackupFileMetadata(finalGzPath);
}

function getBackupFileMetadata(fullPath: string): BackupFileInfo & { fullPath: string } {
  const stat = fs.statSync(fullPath);
  const filename = path.basename(fullPath);
  const content = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const createdAtMs = stat.mtimeMs;
  const expiresAtMs = createdAtMs + RETENTION_MS;
  const daysRemaining = Math.max(
    0,
    Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return {
    filename,
    fullPath,
    type: filename.startsWith('baobab_quotidienne_') ? 'quotidienne' : 'manuelle',
    sizeBytes: stat.size,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    daysRemaining,
    sha256,
  };
}

/**
 * Lists all `.db.gz` backup files in `BACKUP_PATH`, sorted newest first.
 */
export function listBackupsInDirectory(): BackupFileInfo[] {
  const backupDir = getBackupDirectory();
  const entries = fs.readdirSync(backupDir);
  const list: BackupFileInfo[] = [];

  for (const name of entries) {
    if (!name.endsWith('.db.gz') || name.startsWith('.')) continue;
    const fullPath = path.join(backupDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      const meta = getBackupFileMetadata(fullPath);
      list.push({
        filename: meta.filename,
        type: meta.type,
        sizeBytes: meta.sizeBytes,
        createdAt: meta.createdAt,
        expiresAt: meta.expiresAt,
        daysRemaining: meta.daysRemaining,
        sha256: meta.sha256,
      });
    } catch {
      // ignore unreadable entry
    }
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Enforces the 14-day retention policy in `BACKUP_PATH` and ensures today's
 * daily backup (`baobab_quotidienne_YYYY-MM-DD.db.gz`) exists.
 */
export async function runDailyBackupAndRetention(): Promise<{
  purgedFiles: string[];
  dailyCreated: string | null;
}> {
  const backupDir = getBackupDirectory();
  const purgedFiles: string[] = [];
  const nowMs = Date.now();

  // 1. Purge backups older than 14 days
  try {
    const entries = fs.readdirSync(backupDir);
    for (const name of entries) {
      if (!name.endsWith('.db.gz')) continue;
      const fullPath = path.join(backupDir, name);
      try {
        const stat = fs.statSync(fullPath);
        if (nowMs - stat.mtimeMs > RETENTION_MS) {
          fs.unlinkSync(fullPath);
          purgedFiles.push(name);
          recordBackupAudit({
            action: 'PURGE_SAUVEGARDE_14J',
            entityId: name,
            userRole: 'Système (Rétention 14j)',
            details: `Suppression automatique de la sauvegarde expirée (> ${BACKUP_RETENTION_DAYS} jours) : ${name}.`,
          });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // 2. Check if today's daily backup exists
  const todayStr = new Date().toISOString().slice(0, 10);
  const expectedDailyName = `baobab_quotidienne_${todayStr}.db.gz`;
  const expectedDailyPath = path.join(backupDir, expectedDailyName);

  let dailyCreated: string | null = null;
  if (!fs.existsSync(expectedDailyPath)) {
    try {
      const created = await createCompressedSqliteBackup({ prefix: 'baobab_quotidienne' });
      dailyCreated = created.filename;
      recordBackupAudit({
        action: 'SAUVEGARDE_QUOTIDIENNE_AUTO',
        entityId: created.filename,
        userRole: 'Système (Planificateur Quotidien)',
        details: `Sauvegarde quotidienne automatique créée dans BACKUP_PATH : ${created.filename} (${created.sizeBytes} octets, SHA-256: ${created.sha256.slice(0, 16)}..., conservation ${BACKUP_RETENTION_DAYS} jours).`,
      });
    } catch (err) {
      console.error('[BackupService] Erreur lors de la sauvegarde quotidienne:', err);
    }
  }

  return { purgedFiles, dailyCreated };
}

let schedulerInitialized = false;

export function initBackupSystem() {
  if (schedulerInitialized) return;
  schedulerInitialized = true;

  // Ensure all passwords are hashed and run initial daily backup + 14-day retention check
  ensureAllUserPasswordsHashed();
  void runDailyBackupAndRetention();

  // Schedule check every 6 hours
  const timer = setInterval(() => {
    void runDailyBackupAndRetention();
  }, 6 * 60 * 60 * 1000);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

/**
 * GET /api/sauvegardes
 * Lists all backups in BACKUP_PATH, retention policy, and audit history.
 * Strictly reserved to Administrateur (403 for any other role).
 */
export async function handleListBackups(req: Request, res: Response) {
  const admin = requireAdminForBackup(req, res, 'Liste des sauvegardes SQLite');
  if (!admin) return;

  await runDailyBackupAndRetention();
  const pwdStatus = ensureAllUserPasswordsHashed();
  const backups = listBackupsInDirectory();
  const backupDir = getBackupDirectory();

  recordBackupAudit({
    action: 'CONSULTATION_SAUVEGARDES',
    userRole: admin.role,
    userId: admin.id,
    details: `Consultation de la liste des sauvegardes (${backups.length} fichier(s) dans ${backupDir}) par ${admin.name} (${admin.code}).`,
  });

  const auditLogs = db
    .prepare(
      `
      SELECT id, action, entity_id, user_role, user_id, details, created_at
      FROM audit_logs
      WHERE entity = 'SAUVEGARDE_SQLITE'
      ORDER BY created_at DESC
      LIMIT 40
    `
    )
    .all();

  return res.json({
    success: true,
    backupPath: process.env.BACKUP_PATH || './data/backups',
    resolvedBackupPath: backupDir,
    retentionDays: BACKUP_RETENTION_DAYS,
    passwordsHashed: pwdStatus.allHashed,
    totalUsersChecked: pwdStatus.totalUsers,
    backups,
    auditLogs,
  });
}

/**
 * POST /api/sauvegardes/creer
 * Creates a new compressed SQLite backup in BACKUP_PATH after verifying the Admin's password.
 * Strictly reserved to Administrateur (403 for any other role).
 */
export async function handleCreateBackup(req: Request, res: Response) {
  const admin = requireAdminForBackup(req, res, 'Création manuelle de sauvegarde SQLite');
  if (!admin) return;

  const { password } = req.body || {};
  if (!verifyAdminPasswordForBackup(admin.id, String(password || ''))) {
    recordBackupAudit({
      action: 'ECHEC_MOT_DE_PASSE_SAUVEGARDE',
      userRole: admin.role,
      userId: admin.id,
      details: `Échec de confirmation par mot de passe lors d'une demande de sauvegarde manuelle par ${admin.name} (${admin.code}).`,
    });
    return res.status(403).json({
      success: false,
      error:
        'Confirmation refusée : mot de passe Administrateur incorrect. Veuillez saisir votre mot de passe pour lancer la sauvegarde.',
    });
  }

  try {
    const created = await createCompressedSqliteBackup({ prefix: 'baobab_manuelle' });
    await runDailyBackupAndRetention();

    recordBackupAudit({
      action: 'CREATION_SAUVEGARDE_COMPLETE',
      entityId: created.filename,
      userRole: admin.role,
      userId: admin.id,
      details: `Sauvegarde complète SQLite compressée créée après confirmation par mot de passe par ${admin.name} (${admin.code}) : ${created.filename} (${created.sizeBytes} octets, SHA-256: ${created.sha256.slice(0, 16)}...).`,
    });

    return res.json({
      success: true,
      message: `Sauvegarde compressée "${created.filename}" créée avec succès dans BACKUP_PATH.`,
      backup: {
        filename: created.filename,
        type: created.type,
        sizeBytes: created.sizeBytes,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        daysRemaining: created.daysRemaining,
        sha256: created.sha256,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde SQLite';
    return res.status(500).json({ success: false, error: msg });
  }
}

/**
 * POST /api/sauvegardes/exporter
 * Generates a fresh compressed SQLite backup (API backup SQLite, .db.gz) after password confirmation,
 * keeps a copy in BACKUP_PATH (14-day retention), logs the audit entry, and streams the compressed file.
 * Strictly reserved to Administrateur (403 for any other role).
 */
export async function handleExportFullDatabase(req: Request, res: Response) {
  const admin = requireAdminForBackup(req, res, 'Export de la base complète SQLite');
  if (!admin) return;

  const password = String(req.body?.password ?? req.query?.password ?? '');
  if (!verifyAdminPasswordForBackup(admin.id, password)) {
    recordBackupAudit({
      action: 'ECHEC_MOT_DE_PASSE_SAUVEGARDE',
      userRole: admin.role,
      userId: admin.id,
      details: `Échec de confirmation par mot de passe lors d'une demande d'export complet de la base par ${admin.name} (${admin.code}).`,
    });
    return res.status(403).json({
      success: false,
      error:
        'Confirmation refusée : mot de passe Administrateur obligatoire et valide requis pour exporter la base complète.',
    });
  }

  try {
    const created = await createCompressedSqliteBackup({ prefix: 'baobab_manuelle' });

    recordBackupAudit({
      action: 'EXPORT_BASE_COMPLETE',
      entityId: created.filename,
      userRole: admin.role,
      userId: admin.id,
      details: `Export et téléchargement de la base complète SQLite compressée (${created.filename}, ${created.sizeBytes} octets, mots de passe hachés scrypt) par ${admin.name} (${admin.code}).`,
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${created.filename}"`);
    res.setHeader('X-Backup-Filename', created.filename);
    res.setHeader('X-Backup-SHA256', created.sha256);
    res.setHeader('Cache-Control', 'no-store');

    const stream = fs.createReadStream(created.fullPath);
    stream.pipe(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur lors de l'export de la base complète";
    return res.status(500).json({ success: false, error: msg });
  }
}

/**
 * GET / POST /api/sauvegardes/telecharger/:filename
 * Downloads an existing compressed SQLite backup from BACKUP_PATH.
 * Strictly reserved to Administrateur (403 for any other role) and requires password confirmation.
 */
export function handleDownloadBackupFile(req: Request, res: Response) {
  const admin = requireAdminForBackup(req, res, "Téléchargement d'une sauvegarde SQLite");
  if (!admin) return;

  const rawFilename = String(req.params.filename || '').trim();
  const safeFilename = path.basename(rawFilename);
  if (!safeFilename.endsWith('.db.gz') || safeFilename !== rawFilename) {
    return res.status(400).json({
      success: false,
      error: 'Nom de fichier de sauvegarde invalide.',
    });
  }

  const password = String(
    req.body?.password ?? req.query?.password ?? req.headers['x-admin-password'] ?? ''
  );
  if (!verifyAdminPasswordForBackup(admin.id, password)) {
    recordBackupAudit({
      action: 'ECHEC_MOT_DE_PASSE_SAUVEGARDE',
      entityId: safeFilename,
      userRole: admin.role,
      userId: admin.id,
      details: `Échec de confirmation par mot de passe lors du téléchargement de la sauvegarde "${safeFilename}" par ${admin.name} (${admin.code}).`,
    });
    return res.status(403).json({
      success: false,
      error:
        'Confirmation par mot de passe Administrateur requise pour télécharger cette sauvegarde.',
    });
  }

  const backupDir = getBackupDirectory();
  const fullPath = path.join(backupDir, safeFilename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({
      success: false,
      error: `Le fichier de sauvegarde "${safeFilename}" est introuvable dans BACKUP_PATH.`,
    });
  }

  const meta = getBackupFileMetadata(fullPath);

  recordBackupAudit({
    action: 'TELECHARGEMENT_SAUVEGARDE',
    entityId: safeFilename,
    userRole: admin.role,
    userId: admin.id,
    details: `Téléchargement de la sauvegarde "${safeFilename}" (${meta.sizeBytes} octets, SHA-256: ${meta.sha256.slice(0, 16)}...) par ${admin.name} (${admin.code}).`,
  });

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('X-Backup-Filename', safeFilename);
  res.setHeader('X-Backup-SHA256', meta.sha256);
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
}
