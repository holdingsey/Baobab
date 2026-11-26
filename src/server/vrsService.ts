import { Router, Request, Response } from 'express';
import { db } from './db.js';
import { triggerImmediatePostCommitPush } from './pushService.js';

export const vrsRouter = Router();

let vrsSavepointSeq = 0;
function runInDbTransaction<T>(fn: () => T): T {
  const spName = `vrs_sp_${++vrsSavepointSeq}`;
  db.exec(`SAVEPOINT ${spName}`);
  try {
    const result = fn();
    db.exec(`RELEASE SAVEPOINT ${spName}`);
    return result;
  } catch (err) {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${spName}`);
      db.exec(`RELEASE SAVEPOINT ${spName}`);
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function initVrsSystem(): void {
  ensureVrsSchema();
}

/**
 * Rôles autorisés pour la Routine VRS (côté serveur = source unique de vérité) :
 * - VENDEUR : pointe ses visites, saisit un motif avant envoi, soumet, consulte sa routine.
 *   Jamais (403) : accepter ou contester un motif, valider une visite ou un jour,
 *   attribuer un objectif, accorder une dérogation, modifier un statut.
 * - DOV, ADMINISTRATEUR, SALES ADMIN / CONTRÔLEUR : acceptent ou contestent les motifs
 *   (commentaire obligatoire si contesté), valident les visites en attente, attribuent les
 *   objectifs mensuels, accordent les dérogations.
 * - Autres rôles : aucun accès (403).
 */
export const VRS_SUPERVISOR_ROLES = new Set<string>([
  'Administrateur',
  'Directeur des opérations de vente',
  'Sales Admin',
  'Sales Admin / Contrôleur',
  'Contrôleur',
]);

export const VRS_ALLOWED_ROLES = new Set<string>([
  'Administrateur',
  'Directeur des opérations de vente',
  'Sales Admin',
  'Sales Admin / Contrôleur',
  'Contrôleur',
  'Vendeur',
]);

export const DAY_NAMES_FR: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

export const DAY_SHORT_NAMES_FR: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Jeu',
  5: 'Ven',
  6: 'Sam',
  7: 'Dim',
};

export type VrsDayStatus = 'Disponible' | 'En cours' | 'Validé' | 'Bloqué' | 'Incomplet';
export type VrsCycleStatus =
  | 'Non démarrée'
  | 'Disponible'
  | 'En cours'
  | 'Validé'
  | 'Incomplet'
  | 'Terminée'
  | 'Terminé';

export interface VrsSettings {
  routine_start_date: string; // Par défaut '2026-11-23' (lundi 23 novembre 2026, Africa/Bamako)
  next_cycle_policy: 'same_day_next_week' | 'next_working_day';
  target_pdv_count: number; // Par défaut 25
  allowed_days: number[]; // [1, 2, 3, 4, 5, 6] (Dimanche exclu)
  max_distance_m: number; // Par défaut 100 m
  max_gps_accuracy_m: number; // Par défaut 50 m
  derogation_pin: string; // Optionnel
  updated_by: string;
  updated_at: string;
}

export interface VrsActor {
  id: string;
  name: string;
  role: string;
  code: string;
}

export function isVrsSupervisorRole(role: string): boolean {
  const clean = String(role || '').trim();
  if (VRS_SUPERVISOR_ROLES.has(clean)) return true;
  const lower = clean.toLowerCase();
  return (
    lower === 'administrateur' ||
    lower === 'dov' ||
    lower.includes('directeur des opérations') ||
    lower.includes('sales admin') ||
    lower.includes('contrôleur') ||
    lower.includes('controleur')
  );
}

export function isVrsAllowedRole(role: string): boolean {
  const clean = String(role || '').trim();
  if (VRS_ALLOWED_ROLES.has(clean)) return true;
  if (clean === 'Vendeur') return true;
  return isVrsSupervisorRole(clean);
}

/**
 * Date et heure courantes dans le fuseau Africa/Bamako (UTC+0)
 */
export function getBamakoNow(): {
  dateStr: string;
  timeStr: string;
  isoStr: string;
  dayOfWeek: number; // 1 (Lundi) .. 7 (Dimanche)
} {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Bamako',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Bamako',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = utcDate.getUTCDay(); // 0=Dimanche .. 6=Samedi
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  return {
    dateStr,
    timeStr,
    isoStr: now.toISOString(),
    dayOfWeek,
  };
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = utcDate.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d + daysToAdd, 12, 0, 0));
  return utcDate.toISOString().split('T')[0];
}

/**
 * Pour une date donnée, calcule la semaine Lundi -> Samedi (dimanche exclu).
 * Chaque lundi à 00h00 une nouvelle semaine commence : lundi "Disponible", les autres "Bloqués".
 */
export function getMondayToSaturdayWeekForDate(dateStr: string): {
  weekStartDate: string; // Lundi YYYY-MM-DD
  weekEndDate: string; // Samedi YYYY-MM-DD
  nextWeekMondayDate: string; // Lundi suivant YYYY-MM-DD
  days: Array<{
    slotIndex: number; // 1 (Lundi) .. 6 (Samedi)
    date: string;
    dayOfWeek: number; // 1..6
    dayName: string;
    shortName: string;
  }>;
} {
  const dow = getDayOfWeekFromDateStr(dateStr); // 1 (Lun) .. 7 (Dim)
  const mondayDate = addDaysToDateStr(dateStr, -(dow - 1));
  const days: Array<{
    slotIndex: number;
    date: string;
    dayOfWeek: number;
    dayName: string;
    shortName: string;
  }> = [];

  for (let i = 0; i < 6; i++) {
    const dStr = addDaysToDateStr(mondayDate, i);
    const dayIdx = i + 1;
    days.push({
      slotIndex: dayIdx,
      date: dStr,
      dayOfWeek: dayIdx,
      dayName: DAY_NAMES_FR[dayIdx],
      shortName: DAY_SHORT_NAMES_FR[dayIdx],
    });
  }

  return {
    weekStartDate: mondayDate,
    weekEndDate: days[5].date,
    nextWeekMondayDate: addDaysToDateStr(mondayDate, 7),
    days,
  };
}

/**
 * Détermine la semaine Lundi -> Samedi correspondant à une date de référence
 * par rapport à la Date de démarrage de la routine (settings.routine_start_date, par défaut 2026-11-23).
 * - Avant routine_start_date : isBeforeRoutineStart = true, statut "Non démarrée".
 * - À partir de 00h00 du jour de démarrage : la semaine en cours (Lundi..Samedi) est active,
 *   et chaque lundi 00h00 une nouvelle semaine commence avec Lundi "Disponible" (0/25) et Mardi..Samedi "Bloqués".
 */
export function resolveWeekWindowForDate(
  referenceDateStr: string,
  settings: VrsSettings
): {
  isBeforeRoutineStart: boolean;
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  nextCycleStartDate: string;
  days: Array<{
    slotIndex: number;
    date: string;
    dayOfWeek: number;
    dayName: string;
    shortName: string;
  }>;
} {
  const routineStartDate = settings.routine_start_date || '2026-11-23';

  if (referenceDateStr < routineStartDate) {
    const startWeek = getMondayToSaturdayWeekForDate(routineStartDate);
    return {
      isBeforeRoutineStart: true,
      cycleNumber: 1,
      cycleStartDate: startWeek.weekStartDate,
      cycleEndDate: startWeek.weekEndDate,
      nextCycleStartDate: startWeek.nextWeekMondayDate,
      days: startWeek.days,
    };
  }

  const startWeek = getMondayToSaturdayWeekForDate(routineStartDate);
  const currentWeek = getMondayToSaturdayWeekForDate(referenceDateStr);

  // Calcul du numéro de semaine depuis la semaine de démarrage
  const [sy, sm, sd] = startWeek.weekStartDate.split('-').map(Number);
  const [cy, cm, cd] = currentWeek.weekStartDate.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const currMs = Date.UTC(cy, cm - 1, cd, 12, 0, 0);
  const diffWeeks = Math.max(0, Math.round((currMs - startMs) / (7 * 86400000)));

  return {
    isBeforeRoutineStart: false,
    cycleNumber: diffWeeks + 1,
    cycleStartDate: currentWeek.weekStartDate,
    cycleEndDate: currentWeek.weekEndDate,
    nextCycleStartDate: currentWeek.nextWeekMondayDate,
    days: currentWeek.days,
  };
}

export const MONTH_NAMES_FR: Record<number, string> = {
  1: 'Janvier',
  2: 'Février',
  3: 'Mars',
  4: 'Avril',
  5: 'Mai',
  6: 'Juin',
  7: 'Juillet',
  8: 'Août',
  9: 'Septembre',
  10: 'Octobre',
  11: 'Novembre',
  12: 'Décembre',
};

/**
 * Calcule les métadonnées d'un mois YYYY-MM :
 * - nombre de jours ouvrés (Lundi à Samedi, Dimanche exclu)
 * - premier et dernier jour du mois
 * - libellé français (ex: "Novembre 2026")
 */
export function getMonthWorkingDaysInfo(monthKey: string): {
  monthKey: string;
  year: number;
  month: number;
  monthLabel: string;
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  workingDaysCount: number;
  defaultMonthlyTargetPdv: number;
} {
  const cleanKey = /^\d{4}-\d{2}$/.test(String(monthKey || '').trim())
    ? String(monthKey).trim()
    : '2026-11';
  const [yStr, mStr] = cleanKey.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 11;
  const lastDayDate = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const totalCalendarDays = lastDayDate.getUTCDate();

  let workingDaysCount = 0;
  for (let d = 1; d <= totalCalendarDays; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const jsDay = dt.getUTCDay(); // 0 = Dimanche
    if (jsDay !== 0) {
      workingDaysCount += 1;
    }
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(totalCalendarDays).padStart(2, '0')}`;
  const monthLabel = `${MONTH_NAMES_FR[month] || 'Mois'} ${year}`;

  return {
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    monthLabel,
    startDate,
    endDate,
    totalCalendarDays,
    workingDaysCount,
    defaultMonthlyTargetPdv: 25 * workingDaysCount,
  };
}

/**
 * Formule de Haversine : distance en mètres entre deux coordonnées GPS
 */
export function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

let vrsSchemaInitialized = false;

/**
 * Initialise le schéma SQLite de la Routine VRS et effectue la purge unique
 * de toutes les anciennes données de démo de routine afin que tous les vendeurs
 * repartent à 0/25 sur lundi 23/11/2026 (2026-11-23).
 */
export function ensureVrsSchema(): void {
  if (vrsSchemaInitialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS vrs_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vrs_weeks (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      week_end_date TEXT NOT NULL,
      chosen_date TEXT,
      chosen_day_of_week INTEGER,
      active_date TEXT,
      target_pdv_count INTEGER NOT NULL DEFAULT 25,
      counted_visits_count INTEGER NOT NULL DEFAULT 0,
      total_visits_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Disponible',
      derogation_count INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(vendor_id, week_start_date)
    );

    CREATE TABLE IF NOT EXISTS vrs_cycle_days (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      cycle_start_date TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      day_date TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      day_name TEXT NOT NULL,
      target_pdv_count INTEGER NOT NULL DEFAULT 25,
      counted_visits INTEGER NOT NULL DEFAULT 0,
      pending_visits INTEGER NOT NULL DEFAULT 0,
      contested_visits INTEGER NOT NULL DEFAULT 0,
      total_visits INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Bloqué',
      is_locked INTEGER NOT NULL DEFAULT 1,
      is_active_day INTEGER NOT NULL DEFAULT 0,
      derogation_granted INTEGER NOT NULL DEFAULT 0,
      validated_at TEXT,
      unlocked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cycle_id, slot_index),
      UNIQUE(vendor_id, cycle_start_date, day_date)
    );

    CREATE TABLE IF NOT EXISTS vrs_visits (
      id TEXT PRIMARY KEY,
      visit_uuid TEXT NOT NULL UNIQUE,
      week_id TEXT,
      week_start_date TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      visit_time TEXT NOT NULL,
      server_recorded_at TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      pdv_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      gps_accuracy REAL NOT NULL DEFAULT 5.0,
      distance_m REAL NOT NULL DEFAULT 0,
      device_info TEXT,
      is_counted INTEGER NOT NULL DEFAULT 0,
      status_reason TEXT,
      visit_type TEXT DEFAULT 'visite_sans_vente',
      no_sale_reason TEXT,
      sale_id TEXT,
      routine_day TEXT,
      routine_day_index INTEGER,
      validation_status TEXT DEFAULT 'en_attente',
      validated_by TEXT,
      validated_at TEXT,
      motif_reaction_status TEXT,
      motif_reaction_comment TEXT,
      motif_reacted_by TEXT,
      motif_reacted_role TEXT,
      motif_reacted_at TEXT,
      recorded_offline INTEGER NOT NULL DEFAULT 0,
      client_recorded_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vrs_visit_motif_reactions (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      pdv_id TEXT,
      vendor_id TEXT,
      decision TEXT NOT NULL,
      comment TEXT,
      actor_role TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vrs_derogations (
      id TEXT PRIMARY KEY,
      week_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      target_date TEXT NOT NULL,
      derogation_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      granted_by_id TEXT NOT NULL,
      granted_by_name TEXT NOT NULL,
      granted_by_role TEXT NOT NULL,
      previous_week_status TEXT,
      new_week_status TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vrs_monthly_objectives (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      daily_target_pdv INTEGER NOT NULL DEFAULT 25,
      monthly_target_pdv INTEGER NOT NULL DEFAULT 600,
      working_days_count INTEGER NOT NULL DEFAULT 25,
      monthly_target_ca_fcfa INTEGER NOT NULL DEFAULT 5000000,
      monthly_target_cartons INTEGER NOT NULL DEFAULT 250,
      routine_name TEXT,
      correction_reason TEXT,
      notified_80_at TEXT,
      notified_eom_at TEXT,
      assigned_by_id TEXT,
      assigned_by_name TEXT,
      assigned_by_role TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(vendor_id, month_key)
    );

    CREATE TABLE IF NOT EXISTS vrs_monthly_objective_history (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      previous_target_pdv INTEGER,
      monthly_target_pdv INTEGER NOT NULL,
      working_days_count INTEGER NOT NULL,
      routine_name TEXT NOT NULL,
      is_past_month_correction INTEGER NOT NULL DEFAULT 0,
      correction_reason TEXT,
      assigned_by_id TEXT NOT NULL,
      assigned_by_name TEXT NOT NULL,
      assigned_by_role TEXT NOT NULL,
      assigned_at TEXT NOT NULL
    );
  `);

  const alterStatements = [
    `ALTER TABLE vrs_visits ADD COLUMN visit_type TEXT DEFAULT 'visite_sans_vente'`,
    `ALTER TABLE vrs_visits ADD COLUMN no_sale_reason TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN sale_id TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN routine_day TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN routine_day_index INTEGER`,
    `ALTER TABLE vrs_visits ADD COLUMN validation_status TEXT DEFAULT 'en_attente'`,
    `ALTER TABLE vrs_visits ADD COLUMN validated_by TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN validated_at TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN motif_reaction_status TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN motif_reaction_comment TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN motif_reacted_by TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN motif_reacted_role TEXT`,
    `ALTER TABLE vrs_visits ADD COLUMN motif_reacted_at TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN routine_name TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN routine_day TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN routine_day_index INTEGER`,
    `ALTER TABLE points_de_vente ADD COLUMN validation_status TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN validated_by TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN validated_at TEXT`,
    `ALTER TABLE points_de_vente ADD COLUMN is_active INTEGER DEFAULT 1`,
    `ALTER TABLE points_de_vente ADD COLUMN last_visit TEXT`,
    `ALTER TABLE vrs_monthly_objectives ADD COLUMN working_days_count INTEGER DEFAULT 25`,
    `ALTER TABLE vrs_monthly_objectives ADD COLUMN correction_reason TEXT`,
    `ALTER TABLE vrs_monthly_objectives ADD COLUMN notified_80_at TEXT`,
    `ALTER TABLE vrs_monthly_objectives ADD COLUMN notified_eom_at TEXT`,
  ];
  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch {
      // Colonne déjà présente
    }
  }

  // Trigger SQLite empêchant toute modification d'un motif de visite sans vente déjà envoyé
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_vrs_visits_immutable_motif
      BEFORE UPDATE OF no_sale_reason ON vrs_visits
      WHEN OLD.no_sale_reason IS NOT NULL
       AND TRIM(OLD.no_sale_reason) != ''
       AND COALESCE(NEW.no_sale_reason, '') != OLD.no_sale_reason
      BEGIN
        SELECT RAISE(ABORT, 'MOTIF_FIGE_403: Le motif de visite sans vente est fige a l envoi et ne peut plus etre modifie.');
      END;
    `);
  } catch {
    // ignore trigger error
  }

  // Réglages par défaut (Date de démarrage par défaut : LUNDI 23 novembre 2026, Africa/Bamako)
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO vrs_settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('routine_start_date', '2026-11-23');
  insertSetting.run('next_cycle_policy', 'same_day_next_week');
  insertSetting.run('target_pdv_count', '25');
  insertSetting.run('allowed_days', JSON.stringify([1, 2, 3, 4, 5, 6]));
  insertSetting.run('max_distance_m', '100');
  insertSetting.run('max_gps_accuracy_m', '50');
  insertSetting.run('derogation_pin', '');
  insertSetting.run('updated_by', 'Système Baobab ERP');
  insertSetting.run('updated_at', '2026-11-23T00:00:00.000Z');

  // Purge unique de toute donnée de routine passée : tous les vendeurs repartent à 0/25 sur lundi 23/11/2026
  const cleanResetFlag = db
    .prepare("SELECT value FROM vrs_settings WHERE key = 'vrs_clean_reset_2026_11_23_v3'")
    .get() as { value: string } | undefined;

  if (!cleanResetFlag) {
    const cleanTx = () => runInDbTransaction(() => {
      db.prepare('DELETE FROM vrs_visit_motif_reactions').run();
      db.prepare('DELETE FROM vrs_visits').run();
      db.prepare('DELETE FROM vrs_derogations').run();
      db.prepare('DELETE FROM vrs_cycle_days').run();
      db.prepare('DELETE FROM vrs_weeks').run();
      try {
        db.prepare('DELETE FROM pdv_routine_cycles').run();
      } catch {
        // table optionnelle
      }

      // Réinitialiser la date de démarrage de la routine par défaut au LUNDI 23 novembre 2026
      db.prepare(
        `INSERT INTO vrs_settings (key, value) VALUES ('routine_start_date', '2026-11-23')
         ON CONFLICT(key) DO UPDATE SET value = '2026-11-23'`
      ).run();
      db.prepare("UPDATE vrs_settings SET value = '25' WHERE key = 'target_pdv_count'").run();

      // S'assurer que chaque vendeur dispose d'au moins 25 PDV actifs et validés dans son périmètre
      ensureVendorPerimeterPdvsCatalog();

      db.prepare(
        `UPDATE points_de_vente
         SET last_visit = NULL,
             routine_day = NULL,
             routine_day_index = NULL,
             routine_name = NULL,
             status = CASE WHEN status IN ('rejete', 'en_attente') THEN status ELSE 'valide' END,
             is_active = 1`
      ).run();

      db.prepare(
        `INSERT INTO vrs_settings (key, value) VALUES ('vrs_clean_reset_2026_11_23_v3', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      ).run();
    });
    cleanTx();
  }

  // Restaurer les demandes de PDV en attente (pdv-11, pdv-12, pdv-15, pdv-16) qui n'ont pas été explicitement validées
  // et garantir que chaque demande de PDV en attente dispose de sa notification complète pour le DOV et l'Administrateur
  const restorePendingPdvsFlag = db
    .prepare("SELECT value FROM vrs_settings WHERE key = 'vrs_restore_pending_pdvs_and_dov_notifs_v2'")
    .get() as { value: string } | undefined;

  if (!restorePendingPdvsFlag) {
    try {
      db.prepare(
        `UPDATE points_de_vente
         SET status = 'en_attente',
             validation_status = 'soumis'
         WHERE id IN ('pdv-11', 'pdv-12', 'pdv-15', 'pdv-16')
           AND (validated_by IS NULL OR TRIM(validated_by) = '')
           AND status = 'valide'`
      ).run();

      const pendingPdvs = db
        .prepare(
          `SELECT p.*,
                  COALESCE(u.name, p.created_by, 'Oumar Konaté') AS vendor_name,
                  COALESCE(u.code, 'BAO-VND-001') AS vendor_code
           FROM points_de_vente p
           LEFT JOIN users u ON p.vendor_id = u.id
           WHERE p.status = 'en_attente'
           ORDER BY COALESCE(p.updated_at, p.created_at) DESC`
        )
        .all() as any[];

      for (const p of pendingPdvs) {
        const metaStr = JSON.stringify({
          pdvId: p.id,
          pdvCode: p.code,
          pdvName: p.name,
          managerName: p.manager_name || 'Gérant',
          neighborhood: p.neighborhood || 'Bamako',
          routineName: p.routine_name || `Routine ${p.routine_day || 'Lundi'} - ${p.neighborhood || 'Bamako'}`,
          routineDay: p.routine_day || 'Lundi',
          vendorId: p.vendor_id || 'usr-vnd-1',
          vendorName: p.vendor_name,
          vendorCode: p.vendor_code,
        });

        for (const targetRole of ['Directeur des opérations de vente', 'Administrateur']) {
          const existingNotif = db
            .prepare(
              `SELECT id, metadata_json FROM notifications
               WHERE role = ? AND COALESCE(reference, '') = ? AND type IN ('creation_pdv', 'validation_pdv')
               LIMIT 1`
            )
            .get(targetRole, p.code) as { id: string; metadata_json?: string | null } | undefined;

          if (!existingNotif) {
            const notifId = `notif-pdv-${targetRole === 'Administrateur' ? 'adm' : 'dov'}-${p.id}`;
            const title = `Nouveau PDV à valider (${p.vendor_name}) : ${p.name}`;
            const msg = `Le vendeur ${p.vendor_name} (${p.vendor_code}) a soumis une demande de validation pour le point de vente "${p.name}" (${p.code}, quartier ${p.neighborhood || 'Bamako'}, gérant : ${p.manager_name || 'Gérant'}). En attente de votre validation ou refus.`;
            db.prepare(
              `INSERT OR IGNORE INTO notifications (
                 id, role, target_user_id, title, message, type, reference, metadata_json, is_read, created_at
               ) VALUES (?, ?, NULL, ?, ?, 'creation_pdv', ?, ?, 0, ?)`
            ).run(
              notifId,
              targetRole,
              title,
              msg,
              p.code,
              metaStr,
              p.updated_at || p.created_at || new Date().toISOString()
            );
          } else if (!existingNotif.metadata_json) {
            db.prepare('UPDATE notifications SET metadata_json = ? WHERE id = ?').run(
              metaStr,
              existingNotif.id
            );
          }
        }
      }

      // Backfill metadata_json on any existing PDV notifications that don't have it yet
      const pdvNotifsWithoutMeta = db
        .prepare(
          `SELECT id, reference FROM notifications
           WHERE (type IN ('creation_pdv', 'validation_pdv', 'rejet_pdv') OR reference LIKE 'PDV-%')
             AND (metadata_json IS NULL OR TRIM(metadata_json) = '')`
        )
        .all() as Array<{ id: string; reference: string }>;

      for (const nRow of pdvNotifsWithoutMeta) {
        if (!nRow.reference) continue;
        const matchedPdv = db
          .prepare(
            `SELECT p.*,
                    COALESCE(u.name, p.created_by, 'Oumar Konaté') AS vendor_name,
                    COALESCE(u.code, 'BAO-VND-001') AS vendor_code
             FROM points_de_vente p
             LEFT JOIN users u ON p.vendor_id = u.id
             WHERE p.code = ? OR p.id = ?
             LIMIT 1`
          )
          .get(nRow.reference, nRow.reference) as any;
        if (matchedPdv) {
          const metaStr = JSON.stringify({
            pdvId: matchedPdv.id,
            pdvCode: matchedPdv.code,
            pdvName: matchedPdv.name,
            managerName: matchedPdv.manager_name || 'Gérant',
            neighborhood: matchedPdv.neighborhood || 'Bamako',
            routineName:
              matchedPdv.routine_name ||
              `Routine ${matchedPdv.routine_day || 'Lundi'} - ${matchedPdv.neighborhood || 'Bamako'}`,
            routineDay: matchedPdv.routine_day || 'Lundi',
            vendorId: matchedPdv.vendor_id || 'usr-vnd-1',
            vendorName: matchedPdv.vendor_name,
            vendorCode: matchedPdv.vendor_code,
          });
          db.prepare('UPDATE notifications SET metadata_json = ? WHERE id = ?').run(metaStr, nRow.id);
        }
      }

      db.prepare(
        `INSERT INTO vrs_settings (key, value) VALUES ('vrs_restore_pending_pdvs_and_dov_notifs_v2', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      ).run();
    } catch (err) {
      console.warn('[VRS] Restore pending PDVs warning:', err);
    }
  }

  vrsSchemaInitialized = true;
}

/**
 * Garantit que chaque vendeur (usr-vnd-1, usr-vnd-2, usr-vnd-3) possède au moins 25 PDV
 * actifs et validés avec coordonnées GPS à Bamako dans son périmètre commercial,
 * sans aucune visite de routine pré-remplie (0/25).
 */
function ensureVendorPerimeterPdvsCatalog(): void {
  const neighborhoods = [
    'Hamdallaye ACI 2000',
    'Badalabougou',
    'Kalaban Coura',
    'Magnambougou',
    'Sotuba ACI',
    'Baco Djicoroni',
    'Lafiabougou',
    'Faladié',
    'Quinzambougou',
    'Hippodrome',
  ];

  const vendorsConfig = [
    { id: 'usr-vnd-1', prefix: 'V1', baseLat: 12.6392, baseLng: -7.9928 },
    { id: 'usr-vnd-2', prefix: 'V2', baseLat: 12.615, baseLng: -7.981 },
    { id: 'usr-vnd-3', prefix: 'V3', baseLat: 12.592, baseLng: -7.968 },
  ];

  const insertPdv = db.prepare(`
    INSERT OR IGNORE INTO points_de_vente (
      id, code, name, manager_name, phone, neighborhood, city,
      latitude, longitude, gps_accuracy, vendor_id, status, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Bamako', ?, ?, ?, ?, 'valide', 1, '2026-11-01 08:00:00')
  `);

  for (const v of vendorsConfig) {
    for (let i = 1; i <= 25; i++) {
      const numStr = String(i).padStart(2, '0');
      const pdvId = `pdv-vrs-${v.id}-${numStr}`;
      const pdvCode = `PDV-${v.prefix}-${numStr}`;
      const neighborhood = neighborhoods[(i - 1) % neighborhoods.length];
      const lat = Number((v.baseLat + i * 0.0011).toFixed(6));
      const lng = Number((v.baseLng + (i % 5) * 0.0012).toFixed(6));

      insertPdv.run(
        pdvId,
        pdvCode,
        `Boutique Baobab ${v.prefix} #${numStr}`,
        `Gérant ${v.prefix}-${numStr}`,
        `+223 76 ${String(10 + i).padStart(2, '0')} ${String(20 + i).padStart(2, '0')} ${numStr}`,
        neighborhood,
        lat,
        lng,
        4.2,
        v.id
      );
    }
  }
}

export function getVrsSettings(): VrsSettings {
  ensureVrsSchema();
  const rows = db.prepare('SELECT key, value FROM vrs_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  let allowedDays = [1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(map.allowed_days || '[1,2,3,4,5,6]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      allowedDays = parsed.map(Number).filter((d) => d >= 1 && d <= 6);
    }
  } catch {
    allowedDays = [1, 2, 3, 4, 5, 6];
  }
  const rawStartDate = String(map.routine_start_date || '2026-11-23').trim();
  const routineStartDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate) ? rawStartDate : '2026-11-23';
  const nextCyclePolicy =
    map.next_cycle_policy === 'next_working_day' ? 'next_working_day' : 'same_day_next_week';

  return {
    routine_start_date: routineStartDate,
    next_cycle_policy: nextCyclePolicy,
    target_pdv_count: Math.max(25, Number(map.target_pdv_count || 25)),
    allowed_days: allowedDays,
    max_distance_m: Number(map.max_distance_m || 100),
    max_gps_accuracy_m: Number(map.max_gps_accuracy_m || 50),
    derogation_pin: map.derogation_pin || '',
    updated_by: map.updated_by || 'Administrateur',
    updated_at: map.updated_at || new Date().toISOString(),
  };
}

/**
 * Résout l'utilisateur appelant à partir des en-têtes HTTP ou du corps de requête
 */
export function resolveActor(req: Request): VrsActor {
  const headerRole = (req.headers['x-user-role'] as string) || '';
  const headerUserId = (req.headers['x-user-id'] as string) || '';
  const queryRole = (req.query.user_role as string) || '';
  const bodyRole = req.body?.user_role || '';

  const effectiveRole = (headerRole || queryRole || bodyRole || '').trim();

  if (headerUserId) {
    const u = db
      .prepare('SELECT id, name, role, code FROM users WHERE id = ?')
      .get(headerUserId) as VrsActor | undefined;
    if (u) {
      return {
        id: u.id,
        name: u.name,
        role: effectiveRole || u.role,
        code: u.code,
      };
    }
  }

  if (effectiveRole) {
    const u = db
      .prepare('SELECT id, name, role, code FROM users WHERE role = ? ORDER BY id ASC LIMIT 1')
      .get(effectiveRole) as VrsActor | undefined;
    if (u) {
      return {
        id: u.id,
        name: u.name,
        role: effectiveRole,
        code: u.code,
      };
    }
    return {
      id: 'usr-actor',
      name: effectiveRole,
      role: effectiveRole,
      code: 'USR',
    };
  }

  return {
    id: 'usr-admin',
    name: 'Moussa Traoré',
    role: 'Administrateur',
    code: 'BAO-ADM-001',
  };
}

/**
 * Journalise une action VRS dans audit_logs avec auteur, rôle, horodatage, état avant et après
 */
export function recordVrsAudit(params: {
  action: string;
  entityId: string;
  actor: VrsActor;
  beforeState: unknown;
  afterState: unknown;
  summary: string;
}): void {
  const id = `aud-vrs-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const nowIso = new Date().toISOString();
  const detailsPayload = JSON.stringify({
    summary: params.summary,
    actor_id: params.actor.id,
    actor_name: params.actor.name,
    actor_code: params.actor.code,
    actor_role: params.actor.role,
    timestamp: nowIso,
    before: params.beforeState,
    after: params.afterState,
  });

  db.prepare(`
    INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
    VALUES (?, ?, 'ROUTINE_VRS', ?, ?, ?, ?, ?)
  `).run(
    id,
    params.action,
    params.entityId,
    params.actor.role,
    params.actor.id,
    detailsPayload,
    nowIso
  );
}

/**
/**
 * Envoie une notification dans la cloche (notifications) et en notification push Web + SSE
 */
export function sendVrsNotification(params: {
  targetRole: string;
  targetUserId?: string | null;
  title: string;
  message: string;
  type?: 'info' | 'alerte_stock' | 'validation_pdv' | 'credit';
  referenceCode?: string;
  metadataJson?: string | null;
}): void {
  const notifId = `notif-vrs-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const nowIso = new Date().toISOString();
  const notifType = params.type || 'info';
  const refVal = params.referenceCode || 'VRS-25PDV';

  try {
    db.prepare(`
      INSERT INTO notifications (
        id, role, target_user_id, title, message, type, reference, metadata_json, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      notifId,
      params.targetRole,
      params.targetUserId || null,
      params.title,
      params.message,
      notifType,
      refVal,
      params.metadataJson || null,
      nowIso
    );

    triggerImmediatePostCommitPush({
      notificationId: notifId,
      role: params.targetRole,
      targetUserId: params.targetUserId || null,
      title: params.title,
      message: params.message,
      type: notifType,
      reference: refVal,
      createdAt: nowIso,
    });
  } catch (err) {
    console.warn('[VRS] Notification dispatch error:', err);
  }
}

/**
 * Calcule le décompte unifié des visites d'un vendeur sur une date donnée (à moins de 100 m) :
 * - "Visites comptées" (countedVisitsCount) : PDV distincts du jour pointés à <= max_distance_m
 *   ayant soit une visite avec vente (immédiat), soit une visite sans vente dont le motif a été accepté.
 *   soit une visite sans vente avec motif accepté par DOV, Administrateur ou Sales Admin.
 * - "En attente de validation" (pendingVisitsCount) : PDV distincts du jour ayant une visite
 *   sans vente avec motif en attente d'acceptation (et non déjà comptés par une vente).
 * - "Contestées" (contestedVisitsCount) : PDV distincts du jour dont le motif a été contesté
 *   par DOV, Administrateur ou Sales Admin (retirés du compte).
 */
export function recomputeDayVisitCountsInDb(
  vendorId: string,
  dayDate: string,
  maxDistanceM: number
): {
  countedVisitsCount: number;
  pendingVisitsCount: number;
  contestedVisitsCount: number;
  totalVisitsCount: number;
} {
  const rawVisits = db
    .prepare(
      `SELECT id, pdv_id, distance_m, visit_type, no_sale_reason, sale_id,
              validation_status, motif_reaction_status, is_counted, visit_time
       FROM vrs_visits
       WHERE vendor_id = ? AND visit_date = ?
       ORDER BY visit_time ASC, created_at ASC`
    )
    .all(vendorId, dayDate) as Array<{
    id: string;
    pdv_id: string;
    distance_m: number;
    visit_type: string | null;
    no_sale_reason: string | null;
    sale_id: string | null;
    validation_status: string | null;
    motif_reaction_status: string | null;
    is_counted: number;
    visit_time: string;
  }>;

  let salesByPdv = new Set<string>();
  try {
    const salesRows = db
      .prepare(
        `SELECT DISTINCT pdv_id FROM sales
         WHERE vendor_id = ? AND substr(date, 1, 10) = ? AND COALESCE(status, '') NOT IN ('annule', 'annulee') AND pdv_id IS NOT NULL`
      )
      .all(vendorId, dayDate) as Array<{ pdv_id: string }>;
    salesByPdv = new Set(salesRows.map((s) => String(s.pdv_id)));
  } catch {
    // ignore
  }

  const pdvClassification = new Map<
    string,
    {
      state: 'comptee' | 'en_attente' | 'contestee';
      primaryVisitId: string;
    }
  >();

  for (const v of rawVisits) {
    const dist = Number(v.distance_m ?? 0);
    if (dist > maxDistanceM) {
      continue;
    }

    const pdvId = String(v.pdv_id);
    const vType = String(v.visit_type || '').toLowerCase().trim();
    const hasMotif = Boolean(v.no_sale_reason && String(v.no_sale_reason).trim().length > 0);
    const hasSale =
      vType === 'avec_vente' ||
      vType === 'visite_avec_vente' ||
      vType === 'vente' ||
      Boolean(v.sale_id && String(v.sale_id).trim()) ||
      salesByPdv.has(pdvId);

    const reaction = String(v.motif_reaction_status || '').toLowerCase().trim();
    const valStatus = String(v.validation_status || '').toLowerCase().trim();

    let visitState: 'comptee' | 'en_attente' | 'contestee';

    if (hasSale) {
      visitState = 'comptee';
    } else if (hasMotif || vType === 'sans_vente' || vType === 'visite_sans_vente') {
      if (reaction === 'conteste' || valStatus === 'conteste' || valStatus === 'rejete') {
        visitState = 'contestee';
      } else if (reaction === 'accepte' || valStatus === 'valide') {
        visitState = 'comptee';
      } else {
        visitState = 'en_attente';
      }
    } else {
      if (reaction === 'conteste' || valStatus === 'conteste' || valStatus === 'rejete') {
        visitState = 'contestee';
      } else if (valStatus === 'en_attente' || valStatus === 'soumis') {
        visitState = 'en_attente';
      } else {
        visitState = 'comptee';
      }
    }

    const existing = pdvClassification.get(pdvId);
    if (!existing) {
      pdvClassification.set(pdvId, { state: visitState, primaryVisitId: v.id });
    } else {
      if (visitState === 'comptee' && existing.state !== 'comptee') {
        pdvClassification.set(pdvId, { state: 'comptee', primaryVisitId: v.id });
      } else if (visitState === 'contestee' && existing.state !== 'comptee') {
        pdvClassification.set(pdvId, { state: 'contestee', primaryVisitId: v.id });
      } else if (visitState === 'en_attente' && existing.state === 'contestee') {
        pdvClassification.set(pdvId, { state: 'en_attente', primaryVisitId: v.id });
      }
    }
  }

  let countedVisitsCount = 0;
  let pendingVisitsCount = 0;
  let contestedVisitsCount = 0;
  const countedVisitIds = new Set<string>();

  for (const [, info] of pdvClassification.entries()) {
    if (info.state === 'comptee') {
      countedVisitsCount += 1;
      countedVisitIds.add(info.primaryVisitId);
    } else if (info.state === 'en_attente') {
      pendingVisitsCount += 1;
    } else if (info.state === 'contestee') {
      contestedVisitsCount += 1;
    }
  }

  const updateVisitCountedStmt = db.prepare(
    `UPDATE vrs_visits SET is_counted = ?, validation_status = ? WHERE id = ?`
  );
  for (const v of rawVisits) {
    const isPrimaryCounted = countedVisitIds.has(v.id) ? 1 : 0;
    const pdvInfo = pdvClassification.get(String(v.pdv_id));
    const reaction = String(v.motif_reaction_status || '').toLowerCase().trim();
    const currentVal = String(v.validation_status || '').toLowerCase().trim();
    let targetValStatus = currentVal || 'en_attente';
    if (reaction === 'conteste' || pdvInfo?.state === 'contestee') {
      targetValStatus = 'conteste';
    } else if (isPrimaryCounted === 1 || pdvInfo?.state === 'comptee') {
      targetValStatus = 'valide';
    } else {
      targetValStatus = 'en_attente';
    }

    if (v.is_counted !== isPrimaryCounted || currentVal !== targetValStatus) {
      updateVisitCountedStmt.run(isPrimaryCounted, targetValStatus, v.id);
    }
  }

  return {
    countedVisitsCount,
    pendingVisitsCount,
    contestedVisitsCount,
    totalVisitsCount: rawVisits.length,
  };
}

/**
 * Synchronise dans une transaction SQLite l'état complet de la semaine (Lundi à Samedi, dimanche exclu) d'un vendeur :
 * - Avant routine_start_date (par défaut 2026-11-23) : routine "Non démarrée" (aucune visite acceptée).
 * - À partir de 00h00 du 23/11/2026 : lundi est "Disponible" avec 0/25, Mardi..Samedi sont "Bloqués".
 * - Au 25e PDV valide du jour actif : ce jour passe à "Validé" et est VERROUILLÉ, et le JOUR SUIVANT
 *   (lundi -> mardi ... vendredi -> samedi) passe automatiquement à "Disponible" dans la même transaction,
 *   avec audit et notification (cloche et push) au vendeur et au DOV.
 * - Si le samedi est validé : semaine "Terminée" (message "Semaine terminée, prochaine routine lundi").
 * - Un jour non terminé devient "Incomplet" le lendemain ; le jour suivant reste "Bloqué" jusqu'à dérogation.
 * - Chaque lundi 00h00 une nouvelle semaine commence : lundi "Disponible" (0/25), les autres "Bloqués".
 */
export function syncVendorVrsCycleTransaction(
  vendorId: string,
  referenceDateOverride?: string,
  actorOverride?: VrsActor,
  options?: { evaluateIncompleteForReferenceDate?: boolean }
): {
  vendor: { id: string; name: string; code: string; role: string; phone: string; team: string };
  settings: VrsSettings;
  referenceDate: string;
  serverDate: string;
  isStarted: boolean;
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  nextCycleStartDate: string;
  cycleStatus: VrsCycleStatus;
  completionMessage: string | null;
  cycleMessage: string | null;
  weekStartDate: string;
  weekEndDate: string;
  week: any;
  cycle: any;
  activeDay: any;
  selectedDay: any;
  days: any[];
  visits: any[];
  derogations: any[];
  perimeterPdvs: any[];
  monthlyObjective: any;
  justValidatedDays: Array<{ dayName: string; date: string; nextDayName?: string; nextDayDate?: string }>;
  justCompletedCycle: boolean;
} {
  ensureVrsSchema();
  const settings = getVrsSettings();
  const bamakoNow = getBamakoNow();
  const serverDate = bamakoNow.dateStr;
  const referenceDate =
    referenceDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateOverride)
      ? referenceDateOverride
      : serverDate;

  const actor: VrsActor = actorOverride || {
    id: 'system-vrs',
    name: 'Serveur Routine VRS',
    role: 'Système',
    code: 'SYS-VRS',
  };

  const vendorRow = db
    .prepare('SELECT id, name, code, role, phone FROM users WHERE id = ?')
    .get(vendorId) as { id: string; name: string; code: string; role: string; phone: string } | undefined;

  const vendor = vendorRow
    ? {
        ...vendorRow,
        team:
          vendorRow.id === 'usr-vnd-1' || vendorRow.id === 'usr-vnd-2'
            ? 'Équipe Bamako Rive Gauche'
            : 'Équipe Bamako Rive Droite',
      }
    : {
        id: vendorId,
        name: 'Vendeur Terrain',
        code: 'BAO-VND',
        role: 'Vendeur',
        phone: '+223 70 00 00 00',
        team: 'Équipe Bamako',
      };

  const weekWindow = resolveWeekWindowForDate(referenceDate, settings);
  const {
    isBeforeRoutineStart,
    cycleNumber,
    cycleStartDate,
    cycleEndDate,
    nextCycleStartDate,
    days: windowDays,
  } = weekWindow;

  const justValidatedDays: Array<{
    dayName: string;
    date: string;
    nextDayName?: string;
    nextDayDate?: string;
  }> = [];
  let justCompletedCycle = false;

  const runSync = () => runInDbTransaction(() => {
    const nowIso = new Date().toISOString();

    // 1. S'assurer que l'enregistrement de la semaine existe dans vrs_weeks
    let weekRow = db
      .prepare('SELECT * FROM vrs_weeks WHERE vendor_id = ? AND week_start_date = ?')
      .get(vendorId, cycleStartDate) as any;

    if (!weekRow) {
      const cycleId = `vrs-wk-${vendorId}-${cycleStartDate}`;
      const firstDay = windowDays[0]; // Lundi
      db.prepare(
        `INSERT INTO vrs_weeks (
          id, vendor_id, week_start_date, week_end_date,
          chosen_date, chosen_day_of_week, active_date,
          target_pdv_count, counted_visits_count, total_visits_count,
          status, derogation_count, locked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'Disponible', 0, NULL, ?, ?)`
      ).run(
        cycleId,
        vendorId,
        cycleStartDate,
        cycleEndDate,
        firstDay.date,
        firstDay.dayOfWeek,
        firstDay.date,
        settings.target_pdv_count,
        nowIso,
        nowIso
      );
      weekRow = db
        .prepare('SELECT * FROM vrs_weeks WHERE vendor_id = ? AND week_start_date = ?')
        .get(vendorId, cycleStartDate) as any;
    }

    // 2. S'assurer que les 6 jours de la semaine (Lundi à Samedi) existent dans vrs_cycle_days
    const insertSlotStmt = db.prepare(`
      INSERT OR IGNORE INTO vrs_cycle_days (
        id, cycle_id, vendor_id, cycle_start_date, slot_index,
        day_date, day_of_week, day_name, target_pdv_count,
        counted_visits, pending_visits, contested_visits, total_visits,
        status, is_locked, is_active_day, derogation_granted,
        validated_at, unlocked_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, 0, NULL, ?, ?, ?)
    `);

    for (const wd of windowDays) {
      const slotId = `vrs-day-${vendorId}-${cycleStartDate}-${wd.slotIndex}`;
      const initialStatus: VrsDayStatus = wd.slotIndex === 1 ? 'Disponible' : 'Bloqué';
      const initialLocked = wd.slotIndex === 1 ? 0 : 1;
      const initialActive = wd.slotIndex === 1 ? 1 : 0;
      insertSlotStmt.run(
        slotId,
        weekRow.id,
        vendorId,
        cycleStartDate,
        wd.slotIndex,
        wd.date,
        wd.dayOfWeek,
        wd.dayName,
        settings.target_pdv_count,
        initialStatus,
        initialLocked,
        initialActive,
        wd.slotIndex === 1 ? nowIso : null,
        nowIso,
        nowIso
      );
    }

    // 3. Recalculer les compteurs de visites pour chacun des 6 jours de la semaine
    const slotRows = db
      .prepare(
        `SELECT * FROM vrs_cycle_days
         WHERE cycle_id = ?
         ORDER BY slot_index ASC`
      )
      .all(weekRow.id) as any[];

    for (const slot of slotRows) {
      const counts = recomputeDayVisitCountsInDb(
        vendorId,
        slot.day_date,
        settings.max_distance_m
      );
      slot.counted_visits = counts.countedVisitsCount;
      slot.pending_visits = counts.pendingVisitsCount;
      slot.contested_visits = counts.contestedVisitsCount;
      slot.total_visits = counts.totalVisitsCount;
      slot.target_pdv_count = Math.max(25, Number(slot.target_pdv_count || settings.target_pdv_count));
    }

    // 4. Machine à états séquentielle Lundi -> Samedi :
    // Un seul jour actif à la fois, les autres "Bloqués".
    // Au 25e PDV valide du jour actif : ce jour passe à "Validé" et est VERROUILLÉ,
    // et le JOUR SUIVANT (lundi vers mardi ... vendredi vers samedi) passe automatiquement à "Disponible"
    // dans la même transaction, avec audit et notification au vendeur et au DOV.
    let activeSlotFound = false;
    const evaluateIncomplete = options?.evaluateIncompleteForReferenceDate !== false;

    for (let i = 0; i < slotRows.length; i++) {
      const slot = slotRows[i];
      const wasAlreadyValidated = slot.status === 'Validé' && Number(slot.is_locked) === 1;
      const reachedTarget = Number(slot.counted_visits) >= Number(slot.target_pdv_count);

      if (!activeSlotFound && (wasAlreadyValidated || reachedTarget)) {
        const newlyValidated = slot.status !== 'Validé';
        slot.status = 'Validé';
        slot.is_locked = 1;
        slot.is_active_day = 0;
        if (!slot.validated_at) {
          slot.validated_at = nowIso;
        }

        if (newlyValidated) {
          const nextSlot = i + 1 < slotRows.length ? slotRows[i + 1] : null;
          justValidatedDays.push({
            dayName: slot.day_name,
            date: slot.day_date,
            nextDayName: nextSlot?.day_name,
            nextDayDate: nextSlot?.day_date,
          });

          recordVrsAudit({
            action: 'VALIDATION_AUTOMATIQUE_JOUR_25_PDV',
            entityId: slot.id,
            actor,
            beforeState: {
              day_date: slot.day_date,
              day_name: slot.day_name,
              status: 'En cours',
              is_locked: 0,
              next_day_status: nextSlot ? 'Bloqué' : null,
            },
            afterState: {
              day_date: slot.day_date,
              day_name: slot.day_name,
              status: 'Validé',
              is_locked: 1,
              counted_visits: slot.counted_visits,
              target_pdv_count: slot.target_pdv_count,
              next_day_date: nextSlot?.day_date || null,
              next_day_name: nextSlot?.day_name || null,
              next_day_status: nextSlot ? 'Disponible' : 'Semaine Terminée',
            },
            summary: nextSlot
              ? `25e PDV validé pour ${vendor.name} sur ${slot.day_name} (${slot.day_date}) : ${slot.day_name} passe à "Validé" et est VERROUILLÉ ; le jour suivant (${nextSlot.day_name} ${nextSlot.day_date}) passe automatiquement à "Disponible" (0/${nextSlot.target_pdv_count}).`
              : `25e PDV validé pour ${vendor.name} sur Samedi (${slot.day_date}) : Samedi passe à "Validé" et est VERROUILLÉ. Semaine terminée, prochaine routine lundi (${nextCycleStartDate}).`,
          });

          const notifTitle = nextSlot
            ? `Routine VRS : ${slot.day_name} (${slot.day_date}) Validé — ${nextSlot.day_name} Disponible`
            : `Routine VRS : Samedi (${slot.day_date}) Validé — Semaine terminée !`;
          const notifMessage = nextSlot
            ? `${vendor.name} (${vendor.code}) a atteint ${slot.counted_visits}/${slot.target_pdv_count} PDV sur ${slot.day_name} (${slot.day_date}). Ce jour est Validé et verrouillé. Le jour suivant (${nextSlot.day_name} ${nextSlot.day_date}) est maintenant Disponible.`
            : `${vendor.name} (${vendor.code}) a validé Samedi (${slot.day_date}) avec ${slot.counted_visits}/${slot.target_pdv_count} PDV. Semaine terminée, prochaine routine lundi (${nextCycleStartDate}).`;

          sendVrsNotification({
            targetRole: 'Vendeur',
            targetUserId: vendor.id,
            title: notifTitle,
            message: notifMessage,
            type: 'info',
            referenceCode: `VRS-VAL-${slot.day_date}`,
          });
          sendVrsNotification({
            targetRole: 'Directeur des opérations de vente',
            title: notifTitle,
            message: notifMessage,
            type: 'info',
            referenceCode: `VRS-VAL-${slot.day_date}`,
          });
        }
        continue;
      }

      if (!activeSlotFound) {
        activeSlotFound = true;
        slot.is_active_day = 1;

        const isNextDayPastIncomplete =
          evaluateIncomplete &&
          !isBeforeRoutineStart &&
          referenceDate > slot.day_date &&
          Number(slot.counted_visits) < Number(slot.target_pdv_count) &&
          Number(slot.derogation_granted) === 0;

        if (isNextDayPastIncomplete) {
          slot.status = 'Incomplet';
          slot.is_locked = 1;
        } else {
          slot.is_locked = 0;
          if (!slot.unlocked_at) {
            slot.unlocked_at = nowIso;
          }
          if (
            Number(slot.counted_visits) > 0 ||
            Number(slot.pending_visits) > 0 ||
            Number(slot.derogation_granted) === 1
          ) {
            slot.status = 'En cours';
          } else {
            slot.status = 'Disponible';
          }
        }
      } else {
        slot.is_active_day = 0;
        slot.is_locked = 1;
        slot.status = 'Bloqué';
      }
    }

    const updateSlotStmt = db.prepare(`
      UPDATE vrs_cycle_days
      SET counted_visits = ?,
          pending_visits = ?,
          contested_visits = ?,
          total_visits = ?,
          target_pdv_count = ?,
          status = ?,
          is_locked = ?,
          is_active_day = ?,
          validated_at = ?,
          unlocked_at = ?,
          updated_at = ?
      WHERE id = ?
    `);

    for (const slot of slotRows) {
      updateSlotStmt.run(
        slot.counted_visits,
        slot.pending_visits,
        slot.contested_visits,
        slot.total_visits,
        slot.target_pdv_count,
        slot.status,
        slot.is_locked,
        slot.is_active_day,
        slot.validated_at,
        slot.unlocked_at,
        nowIso,
        slot.id
      );
    }

    // 5. Statut global de la semaine dans vrs_weeks
    const allSixValidated = slotRows.length === 6 && slotRows.every((s) => s.status === 'Validé');
    const currentActiveSlot =
      slotRows.find((s) => Number(s.is_active_day) === 1) || slotRows[slotRows.length - 1];

    let cycleStatus: VrsCycleStatus;
    if (isBeforeRoutineStart) {
      cycleStatus = 'Non démarrée';
    } else if (allSixValidated) {
      if (weekRow.status !== 'Terminée' && weekRow.status !== 'Terminé') {
        justCompletedCycle = true;
      }
      cycleStatus = 'Terminée';
    } else if (currentActiveSlot?.status === 'Incomplet') {
      cycleStatus = 'Incomplet';
    } else if (
      slotRows.some(
        (s) =>
          s.status === 'Validé' ||
          s.status === 'En cours' ||
          Number(s.counted_visits) > 0 ||
          Number(s.pending_visits) > 0
      )
    ) {
      cycleStatus = 'En cours';
    } else {
      cycleStatus = 'Disponible';
    }

    const activeDayCounted = Number(currentActiveSlot?.counted_visits || 0);
    const totalCycleVisits = slotRows.reduce((acc, s) => acc + Number(s.total_visits || 0), 0);

    db.prepare(`
      UPDATE vrs_weeks
      SET chosen_date = ?,
          chosen_day_of_week = ?,
          active_date = ?,
          target_pdv_count = ?,
          counted_visits_count = ?,
          total_visits_count = ?,
          status = ?,
          locked_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      currentActiveSlot?.day_date || cycleStartDate,
      currentActiveSlot?.day_of_week || windowDays[0].dayOfWeek,
      currentActiveSlot?.day_date || cycleStartDate,
      settings.target_pdv_count,
      activeDayCounted,
      totalCycleVisits,
      cycleStatus,
      allSixValidated ? weekRow.locked_at || nowIso : null,
      nowIso,
      weekRow.id
    );
  });

  runSync();

  const weekRow = db
    .prepare('SELECT * FROM vrs_weeks WHERE vendor_id = ? AND week_start_date = ?')
    .get(vendorId, cycleStartDate) as any;

  const slotRows = db
    .prepare('SELECT * FROM vrs_cycle_days WHERE cycle_id = ? ORDER BY slot_index ASC')
    .all(weekRow.id) as any[];

  const visits = db
    .prepare(
      `SELECT v.*,
              p.code as pdv_code,
              p.name as pdv_name,
              p.neighborhood as pdv_neighborhood,
              p.latitude as pdv_latitude,
              p.longitude as pdv_longitude,
              p.gps_accuracy as pdv_gps_accuracy
       FROM vrs_visits v
       LEFT JOIN points_de_vente p ON p.id = v.pdv_id
       WHERE v.vendor_id = ? AND v.visit_date >= ? AND v.visit_date <= ?
       ORDER BY v.visit_date DESC, v.visit_time DESC, v.created_at DESC`
    )
    .all(vendorId, cycleStartDate, cycleEndDate) as any[];

  const derogations = db
    .prepare(
      `SELECT * FROM vrs_derogations
       WHERE vendor_id = ? AND week_start_date = ?
       ORDER BY created_at DESC`
    )
    .all(vendorId, cycleStartDate) as any[];

  const activeSlotRow =
    slotRows.find((s) => Number(s.is_active_day) === 1) || slotRows[slotRows.length - 1];

  const selectedSlotRow =
    slotRows.find((s) => s.day_date === referenceDate) || activeSlotRow;

  const days = slotRows.map((slot) => {
    const dayStatus: VrsDayStatus = slot.status as VrsDayStatus;
    const isLocked = isBeforeRoutineStart ? true : Number(slot.is_locked) === 1;
    const isActiveDay = !isBeforeRoutineStart && Number(slot.is_active_day) === 1 && !isLocked;

    return {
      slotIndex: Number(slot.slot_index),
      date: String(slot.day_date),
      dayOfWeek: Number(slot.day_of_week),
      dayIndex: Number(slot.day_of_week),
      dayName: String(slot.day_name),
      shortName: DAY_SHORT_NAMES_FR[Number(slot.day_of_week)] || String(slot.day_name).slice(0, 3),
      status: dayStatus,
      statusLabel: dayStatus,
      isLocked,
      isActiveDay,
      isChosenDay: Number(slot.is_active_day) === 1,
      isSelected: slot.day_date === selectedSlotRow?.day_date,
      isToday: slot.day_date === referenceDate,
      countedVisits: Number(slot.counted_visits || 0),
      pendingVisits: Number(slot.pending_visits || 0),
      contestedVisits: Number(slot.contested_visits || 0),
      totalVisits: Number(slot.total_visits || 0),
      pdvCount: Number(slot.counted_visits || 0),
      targetPdvCount: Number(slot.target_pdv_count || settings.target_pdv_count),
      isTargetReached: dayStatus === 'Validé',
      derogationGranted: Number(slot.derogation_granted) === 1,
      validatedAt: slot.validated_at || null,
      unlockedAt: slot.unlocked_at || null,
    };
  });

  const activeDay = days.find((d) => d.date === activeSlotRow?.day_date) || days[0];
  const selectedDay = days.find((d) => d.date === selectedSlotRow?.day_date) || activeDay;

  const validatedDaysCount = days.filter((d) => d.status === 'Validé').length;
  const totalCycleCountedVisits = days.reduce((acc, d) => acc + d.countedVisits, 0);
  const totalCyclePendingVisits = days.reduce((acc, d) => acc + d.pendingVisits, 0);
  const totalCycleContestedVisits = days.reduce((acc, d) => acc + d.contestedVisits, 0);

  const cycleStatus: VrsCycleStatus = isBeforeRoutineStart
    ? 'Non démarrée'
    : validatedDaysCount === 6
    ? 'Terminée'
    : (weekRow?.status as VrsCycleStatus) || activeDay?.status || 'Disponible';

  const completionMessage =
    validatedDaysCount === 6 ? 'Semaine terminée, prochaine routine lundi' : null;

  const targetDayForPdvs = selectedDay?.date || activeDay?.date || cycleStartDate;
  const pdvs = db
    .prepare(
      `SELECT id, code, name, manager_name, phone, neighborhood as address, neighborhood,
              latitude, longitude, gps_accuracy, status, is_active,
              routine_name, routine_day, routine_day_index
       FROM points_de_vente
       WHERE vendor_id = ? AND status != 'rejete' AND COALESCE(is_active, 1) = 1
       ORDER BY code ASC`
    )
    .all(vendorId) as any[];

  const visitsOnTargetDay = visits.filter((v) => v.visit_date === targetDayForPdvs);

  let salesOnTargetDay: any[] = [];
  try {
    salesOnTargetDay = db
      .prepare(
        `SELECT id, pdv_id, total_amount, cajoucy_boxes_count, created_at
         FROM sales
         WHERE vendor_id = ? AND substr(date, 1, 10) = ? AND COALESCE(status, '') NOT IN ('annule', 'annulee')`
      )
      .all(vendorId, targetDayForPdvs) as any[];
  } catch {
    salesOnTargetDay = [];
  }

  const visitIds = visits.map((v) => v.id);
  const reactionsByVisitId = new Map<string, any[]>();
  if (visitIds.length > 0) {
    const placeholders = visitIds.map(() => '?').join(',');
    const reactionRows = db
      .prepare(
        `SELECT * FROM vrs_visit_motif_reactions
         WHERE visit_id IN (${placeholders})
         ORDER BY created_at DESC`
      )
      .all(...visitIds) as any[];
    for (const r of reactionRows) {
      const list = reactionsByVisitId.get(r.visit_id) || [];
      list.push({
        id: r.id,
        visitId: r.visit_id,
        pdvId: r.pdv_id,
        vendorId: r.vendor_id,
        decision: r.decision,
        reactionStatus: r.decision,
        comment: r.comment,
        actorRole: r.actor_role,
        actorName: r.actor_name,
        createdAt: r.created_at,
      });
      reactionsByVisitId.set(r.visit_id, list);
    }
  }

  const enrichedVisits = visits.map((v) => ({
    ...v,
    motif_reactions_history: reactionsByVisitId.get(v.id) || [],
  }));

  // Statistiques cumulées (tous jours confondus) par PDV pour ce vendeur :
  // nombre total de visites effectuées auprès du même PDV + visites sans vente + ventes réalisées
  const allTimeVisitsByPdv = new Map<
    string,
    { totalVisits: number; noSaleVisits: number; withSaleVisits: number }
  >();
  try {
    const aggVisitRows = db
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
    for (const row of aggVisitRows) {
      allTimeVisitsByPdv.set(String(row.pdv_id), {
        totalVisits: Number(row.total_visits || 0),
        noSaleVisits: Number(row.no_sale_visits || 0),
        withSaleVisits: Number(row.with_sale_visits || 0),
      });
    }
  } catch {
    // fallback silencieux
  }

  const allTimeSalesByPdv = new Map<string, { salesCount: number; totalAmount: number }>();
  try {
    const aggSalesRows = db
      .prepare(
        `SELECT pdv_id, COUNT(*) AS sales_count, COALESCE(SUM(total_amount), 0) AS total_amount
         FROM sales
         WHERE vendor_id = ? AND COALESCE(status, '') NOT IN ('annule', 'annulee')
         GROUP BY pdv_id`
      )
      .all(vendorId) as any[];
    for (const row of aggSalesRows) {
      allTimeSalesByPdv.set(String(row.pdv_id), {
        salesCount: Number(row.sales_count || 0),
        totalAmount: Number(row.total_amount || 0),
      });
    }
  } catch {
    // fallback silencieux
  }

  const perimeterPdvs = pdvs.map((p) => {
    const pdvVisitsToday = visitsOnTargetDay.filter((v) => v.pdv_id === p.id);
    const latestVisit = pdvVisitsToday[0] || null;
    const countedVisit = pdvVisitsToday.find((v) => Number(v.is_counted) === 1) || latestVisit;
    const pdvSalesToday = salesOnTargetDay.filter((s) => s.pdv_id === p.id);
    const hasSaleToday =
      pdvSalesToday.length > 0 ||
      pdvVisitsToday.some(
        (v) =>
          v.visit_type === 'avec_vente' ||
          v.visit_type === 'visite_avec_vente' ||
          Boolean(v.sale_id)
      );

    const cumVisits = allTimeVisitsByPdv.get(String(p.id)) || {
      totalVisits: 0,
      noSaleVisits: 0,
      withSaleVisits: 0,
    };
    const cumSales = allTimeSalesByPdv.get(String(p.id)) || { salesCount: 0, totalAmount: 0 };
    const totalSalesCount = Math.max(cumSales.salesCount, cumVisits.withSaleVisits, pdvSalesToday.length);
    const totalNoSaleVisitsCount = cumVisits.noSaleVisits;
    const totalVisitsCount = Math.max(
      cumVisits.totalVisits,
      totalSalesCount + totalNoSaleVisitsCount,
      pdvVisitsToday.length
    );

    let countCategory: 'comptee' | 'en_attente' | 'contestee' | 'non_visite' = 'non_visite';
    if (pdvVisitsToday.some((v) => Number(v.is_counted) === 1) || hasSaleToday) {
      countCategory = 'comptee';
    } else if (
      pdvVisitsToday.some(
        (v) =>
          v.motif_reaction_status === 'conteste' || v.validation_status === 'conteste'
      )
    ) {
      countCategory = 'contestee';
    } else if (pdvVisitsToday.length > 0) {
      countCategory = 'en_attente';
    }

    return {
      ...p,
      visitedToday: pdvVisitsToday.length > 0 || hasSaleToday,
      visitedEver: totalVisitsCount > 0 || totalSalesCount > 0,
      isCountedToday: countCategory === 'comptee',
      countCategory,
      routineDayVisitsCount: Math.max(pdvVisitsToday.length, hasSaleToday ? 1 : 0),
      routine_day_visits_count: Math.max(pdvVisitsToday.length, hasSaleToday ? 1 : 0),
      todayVisitsCount: Math.max(pdvVisitsToday.length, hasSaleToday ? 1 : 0),
      today_visits_count: Math.max(pdvVisitsToday.length, hasSaleToday ? 1 : 0),
      totalVisitsCount,
      total_visits_count: totalVisitsCount,
      visits_count: totalVisitsCount,
      salesCount: totalSalesCount,
      sales_count: totalSalesCount,
      todaySalesCount: pdvSalesToday.length,
      noSaleVisitsCount: totalNoSaleVisitsCount,
      no_sale_visits_count: totalNoSaleVisitsCount,
      hasAnySale: totalSalesCount > 0 || hasSaleToday,
      visitTime: countedVisit?.visit_time || null,
      visitDate: countedVisit?.visit_date || null,
      visitId: countedVisit?.id || null,
      distanceM: countedVisit?.distance_m ?? null,
      hasSaleToday,
      noSaleReason: countedVisit?.no_sale_reason || null,
      validationStatus:
        countCategory === 'comptee'
          ? 'valide'
          : countCategory === 'contestee'
          ? 'conteste'
          : countedVisit
          ? 'en_attente'
          : 'valide',
      validatedBy: countedVisit?.validated_by || null,
      motifReactionStatus: countedVisit?.motif_reaction_status || null,
      motifReactionComment: countedVisit?.motif_reaction_comment || null,
      motifReactedBy: countedVisit?.motif_reacted_by || null,
      motifReactedRole: countedVisit?.motif_reacted_role || null,
      motifReactedAt: countedVisit?.motif_reacted_at || null,
      motifReactionsHistory: countedVisit ? reactionsByVisitId.get(countedVisit.id) || [] : [],
    };
  });

  const monthKey = (referenceDate >= settings.routine_start_date
    ? referenceDate
    : settings.routine_start_date
  ).slice(0, 7);
  const currentServerMonthKey = (serverDate >= settings.routine_start_date
    ? serverDate
    : settings.routine_start_date
  ).slice(0, 7);

  const monthMeta = getMonthWorkingDaysInfo(monthKey);
  const existingObjRow = db
    .prepare('SELECT * FROM vrs_monthly_objectives WHERE vendor_id = ? AND month_key = ?')
    .get(vendorId, monthKey) as any;

  const isDefaultObjective = !existingObjRow;
  const dailyTargetFixed = 25; // Règle : "un jour actif à la fois, 25 PDV par jour, déblocage du jour suivant" inchangée
  const defaultMonthlyTargetPdv = dailyTargetFixed * monthMeta.workingDaysCount;
  const monthlyTargetPdv = existingObjRow
    ? Math.max(25, Number(existingObjRow.monthly_target_pdv || defaultMonthlyTargetPdv))
    : defaultMonthlyTargetPdv;

  // Calcul du réalisé mensuel (somme des visites comptées sur tous les jours du mois)
  const monthDaysStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(counted_visits), 0) AS realized_pdv,
         COALESCE(SUM(pending_visits), 0) AS pending_pdv,
         COALESCE(SUM(contested_visits), 0) AS contested_pdv,
         COALESCE(SUM(CASE WHEN status = 'Validé' THEN 1 ELSE 0 END), 0) AS validated_days
       FROM vrs_cycle_days
       WHERE vendor_id = ? AND substr(day_date, 1, 7) = ?`
    )
    .get(vendorId, monthKey) as {
      realized_pdv: number;
      pending_pdv: number;
      contested_pdv: number;
      validated_days: number;
    };

  let realizedMonthlyPdv = Number(monthDaysStats?.realized_pdv || 0);
  // Si des visites comptées existent dans vrs_visits sur des jours du mois non encore matérialisés dans vrs_cycle_days
  const rawMonthCountedRow = db
    .prepare(
      `SELECT COUNT(DISTINCT visit_date || '::' || pdv_id) AS cnt
       FROM vrs_visits
       WHERE vendor_id = ? AND substr(visit_date, 1, 7) = ? AND is_counted = 1`
    )
    .get(vendorId, monthKey) as { cnt: number };
  realizedMonthlyPdv = Math.max(realizedMonthlyPdv, Number(rawMonthCountedRow?.cnt || 0));

  const validatedDaysInMonth = Number(monthDaysStats?.validated_days || 0);
  const monthlyProgressPercent = Math.min(
    100,
    Math.round((realizedMonthlyPdv / Math.max(1, monthlyTargetPdv)) * 100)
  );
  const isPastMonth = monthKey < currentServerMonthKey;
  const isEndOfMonthReached = referenceDate >= monthMeta.endDate || isPastMonth;
  const monthlyObjectiveStatus: 'En cours' | 'Atteint' | 'Non atteint' =
    realizedMonthlyPdv >= monthlyTargetPdv
      ? 'Atteint'
      : isPastMonth
      ? 'Non atteint'
      : 'En cours';

  // Rappels automatiques (cloche + push) à 80 % d'avancement et en fin de mois
  if (monthlyProgressPercent >= 80 && monthlyProgressPercent < 100) {
    const already80 = existingObjRow?.notified_80_at;
    if (!already80) {
      const nowIsoRemind = new Date().toISOString();
      if (existingObjRow) {
        db.prepare('UPDATE vrs_monthly_objectives SET notified_80_at = ? WHERE id = ?').run(
          nowIsoRemind,
          existingObjRow.id
        );
      }
      sendVrsNotification({
        targetRole: 'Vendeur',
        targetUserId: vendorId,
        title: `Rappel objectif mensuel (${monthMeta.monthLabel}) : ${monthlyProgressPercent}% atteint`,
        message: `Vous avez réalisé ${realizedMonthlyPdv} / ${monthlyTargetPdv} PDV (${monthlyProgressPercent}%) sur votre objectif du mois de ${monthMeta.monthLabel}. Plus que ${Math.max(
          0,
          monthlyTargetPdv - realizedMonthlyPdv
        )} PDV pour atteindre 100% !`,
        type: 'info',
        referenceCode: `OBJ-80-${vendorId}-${monthKey}`,
      });
    }
  }

  if (isEndOfMonthReached && existingObjRow && !existingObjRow.notified_eom_at) {
    const nowIsoEom = new Date().toISOString();
    db.prepare('UPDATE vrs_monthly_objectives SET notified_eom_at = ? WHERE id = ?').run(
      nowIsoEom,
      existingObjRow.id
    );
    sendVrsNotification({
      targetRole: 'Vendeur',
      targetUserId: vendorId,
      title: `Bilan fin de mois Routine VRS (${monthMeta.monthLabel})`,
      message: `Fin du mois de ${monthMeta.monthLabel} : ${realizedMonthlyPdv} / ${monthlyTargetPdv} PDV réalisés (${monthlyProgressPercent}%) • Statut : ${monthlyObjectiveStatus}.`,
      type: 'info',
      referenceCode: `OBJ-EOM-${vendorId}-${monthKey}`,
    });
  }

  const attributionHistory = db
    .prepare(
      `SELECT * FROM vrs_monthly_objective_history
       WHERE vendor_id = ? AND month_key = ?
       ORDER BY assigned_at DESC LIMIT 20`
    )
    .all(vendorId, monthKey) as any[];

  const lastVisit = enrichedVisits[0]
    ? {
        id: enrichedVisits[0].id,
        pdvId: enrichedVisits[0].pdv_id,
        pdvCode: enrichedVisits[0].pdv_code,
        pdvName: enrichedVisits[0].pdv_name,
        pdvNeighborhood: enrichedVisits[0].pdv_neighborhood,
        pdv_latitude: enrichedVisits[0].pdv_latitude,
        pdv_longitude: enrichedVisits[0].pdv_longitude,
        latitude: enrichedVisits[0].latitude,
        longitude: enrichedVisits[0].longitude,
        gps_accuracy: enrichedVisits[0].gps_accuracy,
        visitDate: enrichedVisits[0].visit_date,
        visitTime: enrichedVisits[0].visit_time,
        distanceM: enrichedVisits[0].distance_m,
        distance_m: enrichedVisits[0].distance_m,
      }
    : null;

  const cycleSummary = {
    id: weekRow.id,
    cycleNumber,
    routineStartDate: settings.routine_start_date,
    cycleStartDate,
    cycleEndDate,
    nextCycleStartDate,
    weekStartDate: cycleStartDate,
    weekEndDate: cycleEndDate,
    isStarted: !isBeforeRoutineStart,
    status: cycleStatus,
    cycleStatus,
    completionMessage,
    activeDate: activeDay?.date || cycleStartDate,
    activeDayName: activeDay?.dayName || null,
    activeSlotIndex: activeDay?.slotIndex || 1,
    chosenDate: activeDay?.date || cycleStartDate,
    chosenDayOfWeek: activeDay?.dayOfWeek || null,
    chosenDayName: activeDay?.dayName || null,
    targetPdvCount: 25,
    // Un seul décompte partout : "Visites comptées", "En attente de validation", "Contestées"
    countedVisitsCount: Number(selectedDay?.countedVisits || 0),
    pendingVisitsCount: Number(selectedDay?.pendingVisits || 0),
    contestedVisitsCount: Number(selectedDay?.contestedVisits || 0),
    totalVisitsCount: Number(selectedDay?.totalVisits || 0),
    activeDayCountedVisits: Number(activeDay?.countedVisits || 0),
    activeDayPendingVisits: Number(activeDay?.pendingVisits || 0),
    activeDayContestedVisits: Number(activeDay?.contestedVisits || 0),
    validatedDaysCount,
    totalCycleDays: 6,
    totalCycleCountedVisits,
    totalCyclePendingVisits,
    totalCycleContestedVisits,
    derogationCount: derogations.length,
    lockedAt: weekRow.locked_at || null,
    lastVisit,
  };

  return {
    vendor,
    settings,
    referenceDate,
    serverDate,
    isStarted: !isBeforeRoutineStart,
    cycleNumber,
    cycleStartDate,
    cycleEndDate,
    nextCycleStartDate,
    cycleStatus,
    completionMessage,
    cycleMessage:
      completionMessage ||
      (isBeforeRoutineStart
        ? `Routine non démarrée (date de démarrage : ${settings.routine_start_date}).`
        : null),
    weekStartDate: cycleStartDate,
    weekEndDate: cycleEndDate,
    week: cycleSummary,
    cycle: cycleSummary,
    activeDay,
    selectedDay,
    days,
    visits: enrichedVisits,
    derogations,
    perimeterPdvs,
    monthlyObjective: {
      id: existingObjRow?.id || `obj-default-${vendorId}-${monthKey}`,
      vendorId,
      vendorName: vendor.name,
      vendorCode: vendor.code,
      monthKey,
      monthLabel: monthMeta.monthLabel,
      year: monthMeta.year,
      month: monthMeta.month,
      isDefault: isDefaultObjective,
      defaultBadgeLabel: isDefaultObjective ? 'Objectif par défaut' : null,
      isPastMonth,
      isLockedForNonAdmin: isPastMonth,
      dailyTargetPdv: 25,
      workingDaysCount: monthMeta.workingDaysCount,
      defaultMonthlyTargetPdv,
      monthlyTargetPdv,
      realizedMonthlyPdv,
      remainingMonthlyPdv: Math.max(0, monthlyTargetPdv - realizedMonthlyPdv),
      progressPercent: monthlyProgressPercent,
      validatedDaysCount: validatedDaysInMonth,
      status: monthlyObjectiveStatus,
      monthlyTargetCaFcfa: Number(existingObjRow?.monthly_target_ca_fcfa || 5000000),
      monthlyTargetCartons: Number(existingObjRow?.monthly_target_cartons || 250),
      routineName: existingObjRow?.routine_name || 'Routine par défaut',
      correctionReason: existingObjRow?.correction_reason || null,
      assignedById: existingObjRow?.assigned_by_id || null,
      assignedByName: existingObjRow?.assigned_by_name || null,
      assignedByRole: existingObjRow?.assigned_by_role || null,
      assignedAt: existingObjRow?.updated_at || existingObjRow?.created_at || null,
      history: attributionHistory,
    },
    justValidatedDays,
    justCompletedCycle,
  };
}

/**
 * Enrichit une visite avec les URLs de navigation vers la position validée du PDV
 * uniquement pour les superviseurs (Administrateur, DOV, Sales Admin / Contrôleur).
 */
export function formatVisitForActorRole(visit: any, actorRole: string): any {
  const isSupervisor = isVrsSupervisorRole(actorRole);
  if (!isSupervisor) {
    const rest = { ...visit };
    delete rest.google_maps_url;
    delete rest.openstreetmap_url;
    return rest;
  }

  const pdvLat = Number(visit.pdv_latitude);
  const pdvLng = Number(visit.pdv_longitude);
  const hasValidPdvGps = Number.isFinite(pdvLat) && Number.isFinite(pdvLng);

  return {
    ...visit,
    pdv_latitude: hasValidPdvGps ? pdvLat : null,
    pdv_longitude: hasValidPdvGps ? pdvLng : null,
    google_maps_url: hasValidPdvGps
      ? `https://www.google.com/maps/dir/?api=1&destination=${pdvLat},${pdvLng}&travelmode=driving`
      : null,
    openstreetmap_url: hasValidPdvGps
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${pdvLat},${pdvLng}`
      : null,
  };
}

/**
 * Exécute un pointage de visite de routine VRS côté serveur (source unique de vérité).
 */
export function executeVrsVisitCheckin(params: {
  actor: VrsActor;
  vendorId: string;
  pdvId: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  deviceInfo?: string;
  visitUuid?: string;
  visitDate?: string;
  visitType?: 'avec_vente' | 'sans_vente' | 'standard' | string;
  noSaleReason?: string | null;
  saleId?: string | null;
  recordedOffline?: boolean;
  clientRecordedAt?: string;
}): {
  httpStatus: number;
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  visit?: any;
  state?: any;
  alreadyCountedToday?: boolean;
  justValidatedDay?: boolean;
  justCompletedCycle?: boolean;
} {
  ensureVrsSchema();
  const settings = getVrsSettings();
  const bamakoNow = getBamakoNow();
  const { actor, vendorId, pdvId } = params;

  if (!isVrsAllowedRole(actor.role)) {
    return {
      httpStatus: 403,
      success: false,
      code: 'ROLE_FORBIDDEN_403',
      error: `Accès refusé (403) : le profil "${actor.role}" n'a aucun accès à la Routine VRS.`,
    };
  }

  if (actor.role === 'Vendeur' && actor.id && vendorId && actor.id !== vendorId) {
    return {
      httpStatus: 403,
      success: false,
      code: 'VENDOR_FORBIDDEN_403',
      error: 'Accès refusé (403) : un vendeur ne peut pointer des visites que pour sa propre routine.',
    };
  }

  let effectiveVisitDate =
    params.visitDate && /^\d{4}-\d{2}-\d{2}$/.test(params.visitDate.trim())
      ? params.visitDate.trim()
      : '';

  if (!effectiveVisitDate) {
    if (bamakoNow.dateStr < settings.routine_start_date) {
      effectiveVisitDate = bamakoNow.dateStr;
    } else {
      const preState = syncVendorVrsCycleTransaction(vendorId, bamakoNow.dateStr, actor, {
        evaluateIncompleteForReferenceDate: false,
      });
      effectiveVisitDate = preState.activeDay?.date || bamakoNow.dateStr;
    }
  }

  // 1. VÉRIFICATION DU DÉMARRAGE : Avant routine_start_date (par défaut 2026-11-23), la routine est "Non démarrée"
  if (effectiveVisitDate < settings.routine_start_date) {
    recordVrsAudit({
      action: 'REJET_VISITE_ROUTINE_NON_DEMARREE',
      entityId: pdvId || 'visit',
      actor,
      beforeState: {
        routine_start_date: settings.routine_start_date,
        attempted_visit_date: effectiveVisitDate,
      },
      afterState: { status: 'REJETÉ_NON_DÉMARRÉE' },
      summary: `Visite refusée pour ${vendorId} le ${effectiveVisitDate} : la routine est "Non démarrée" avant la date de démarrage (${settings.routine_start_date}).`,
    });
    return {
      httpStatus: 403,
      success: false,
      code: 'ROUTINE_NON_DEMARREE',
      error: `Routine non démarrée : aucune visite de routine n'est acceptée avant la date de démarrage (${settings.routine_start_date} à 00h00 Africa/Bamako).`,
    };
  }

  // 2. VÉRIFICATION DU DIMANCHE EXCLU
  const visitDow = getDayOfWeekFromDateStr(effectiveVisitDate);
  if (visitDow === 7) {
    return {
      httpStatus: 403,
      success: false,
      code: 'SUNDAY_EXCLUDED',
      error: 'Visite refusée (403) : le dimanche est exclu de la semaine de routine (Lundi à Samedi).',
    };
  }

  // 3. Synchroniser l'état de la semaine sans marquer le jour actif comme incomplet à cause d'une tentative sur un jour bloqué
  const currentState = syncVendorVrsCycleTransaction(vendorId, effectiveVisitDate, actor, {
    evaluateIncompleteForReferenceDate: false,
  });

  if (currentState.cycleStatus === 'Terminée' || currentState.cycleStatus === 'Terminé') {
    return {
      httpStatus: 403,
      success: false,
      code: 'SEMAINE_TERMINEE',
      error: 'Semaine terminée, prochaine routine lundi',
    };
  }

  const targetDaySlot = currentState.days.find((d: any) => d.date === effectiveVisitDate);
  const activeDaySlot = currentState.activeDay;

  if (!targetDaySlot) {
    return {
      httpStatus: 403,
      success: false,
      code: 'JOUR_HORS_SEMAINE_ACTIVE',
      error: `Visite refusée (403) : la date ${effectiveVisitDate} ne fait pas partie de la semaine active (${currentState.cycleStartDate} au ${currentState.cycleEndDate}). Le seul jour actif est ${activeDaySlot?.dayName} (${activeDaySlot?.date}).`,
    };
  }

  // 4. VÉRIFICATION DU JOUR ACTIF UNIQUE (les autres jours sont "Bloqués", et un jour "Validé" est VERROUILLÉ)
  if (targetDaySlot.status === 'Validé' || (targetDaySlot.isLocked && targetDaySlot.isTargetReached)) {
    return {
      httpStatus: 403,
      success: false,
      code: 'JOUR_VALIDE_VERROUILLE',
      error: `Visite refusée (403) : le jour ${targetDaySlot.dayName} (${targetDaySlot.date}) est déjà Validé (${targetDaySlot.countedVisits}/${targetDaySlot.targetPdvCount}) et verrouillé.${
        activeDaySlot && activeDaySlot.date !== targetDaySlot.date
          ? ` Le jour actif disponible est ${activeDaySlot.dayName} (${activeDaySlot.date}).`
          : ''
      }`,
    };
  }

  if (targetDaySlot.status === 'Bloqué' || targetDaySlot.isLocked || targetDaySlot.date !== activeDaySlot?.date) {
    recordVrsAudit({
      action: 'REJET_VISITE_JOUR_BLOQUE',
      entityId: currentState.cycle.id,
      actor,
      beforeState: {
        active_day: activeDaySlot?.dayName,
        active_date: activeDaySlot?.date,
        attempted_date: effectiveVisitDate,
        attempted_day_status: targetDaySlot.status,
      },
      afterState: { status: 'REJETÉ_403_JOUR_BLOQUÉ' },
      summary: `Tentative de visite sur un jour bloqué (${targetDaySlot.dayName} ${effectiveVisitDate}) refusée : seul le jour actif (${activeDaySlot?.dayName} ${activeDaySlot?.date}) est ouvert.`,
    });
    return {
      httpStatus: 403,
      success: false,
      code: 'JOUR_BLOQUE_403',
      error: `Visite refusée (403) : le jour ${targetDaySlot.dayName} (${targetDaySlot.date}) est Bloqué. Un seul jour est actif à la fois : ${activeDaySlot?.dayName} (${activeDaySlot?.date}).`,
    };
  }

  if (targetDaySlot.status === 'Incomplet' && !targetDaySlot.derogationGranted) {
    return {
      httpStatus: 403,
      success: false,
      code: 'JOUR_INCOMPLET_BLOQUE',
      error: `Visite refusée (403) : le jour ${targetDaySlot.dayName} (${targetDaySlot.date}) est Incomplet. Une dérogation du DOV, de l'Administrateur ou du Sales Admin / Contrôleur est requise.`,
    };
  }

  // 5. VÉRIFICATION DU PDV (actif, validé, à moins de 100 m)
  const pdv = db
    .prepare(
      `SELECT id, code, name, neighborhood, latitude, longitude, vendor_id, status, is_active
       FROM points_de_vente WHERE id = ?`
    )
    .get(pdvId) as any;

  if (!pdv) {
    return {
      httpStatus: 404,
      success: false,
      error: 'Point de vente introuvable.',
    };
  }

  if (pdv.status === 'rejete' || Number(pdv.is_active) !== 1) {
    return {
      httpStatus: 400,
      success: false,
      error: `Le PDV "${pdv.name}" n'est pas actif ou a été rejeté.`,
    };
  }

  const latNum = Number.isFinite(Number(params.latitude))
    ? Number(params.latitude)
    : Number(pdv.latitude || 12.6392);
  const lngNum = Number.isFinite(Number(params.longitude))
    ? Number(params.longitude)
    : Number(pdv.longitude || -7.9928);
  const accNum = Number.isFinite(Number(params.gpsAccuracy)) ? Number(params.gpsAccuracy) : 4.2;

  const distanceM = calculateHaversineMeters(
    latNum,
    lngNum,
    Number(pdv.latitude),
    Number(pdv.longitude)
  );

  if (distanceM > settings.max_distance_m) {
    recordVrsAudit({
      action: 'REJET_VISITE_DISTANCE_HORS_RAYON_100M',
      entityId: pdv.id,
      actor,
      beforeState: {
        pdv_code: pdv.code,
        max_distance_m: settings.max_distance_m,
      },
      afterState: { distance_m: distanceM },
      summary: `Visite refusée sur ${pdv.code} : distance GPS ${distanceM} m > ${settings.max_distance_m} m.`,
    });
    return {
      httpStatus: 400,
      success: false,
      code: 'DISTANCE_EXCEEDED_100M',
      error: `Visite refusée : vous êtes à ${distanceM} m du PDV "${pdv.name}" (rayon maximal autorisé : ${settings.max_distance_m} m).`,
    };
  }

  // 6. TYPE DE VISITE (strictement 2 issues réelles : Visite avec vente OU Visite sans vente avec motif)
  const cleanMotif =
    typeof params.noSaleReason === 'string' ? params.noSaleReason.trim() : '';
  const rawType = String(params.visitType || '').toLowerCase().trim();
  const hasSale =
    rawType === 'avec_vente' ||
    rawType === 'visite_avec_vente' ||
    rawType === 'vente' ||
    Boolean(params.saleId && String(params.saleId).trim());

  if (!hasSale && cleanMotif.length < 3) {
    return {
      httpStatus: 400,
      success: false,
      error: 'Le motif de la visite sans vente est obligatoire avant envoi (minimum 3 caractères).',
    };
  }

  const cleanUuid =
    params.visitUuid && String(params.visitUuid).trim()
      ? String(params.visitUuid).trim()
      : `vrs-uuid-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const existingByUuid = db
    .prepare('SELECT * FROM vrs_visits WHERE visit_uuid = ?')
    .get(cleanUuid) as any;
  if (existingByUuid) {
    const synced = syncVendorVrsCycleTransaction(vendorId, effectiveVisitDate, actor);
    return {
      httpStatus: 200,
      success: true,
      message: 'Visite déjà synchronisée (UUID idempotent).',
      visit: existingByUuid,
      state: synced,
    };
  }

  if (cleanMotif) {
    const existingMotifVisit = db
      .prepare(
        `SELECT id, no_sale_reason FROM vrs_visits
         WHERE vendor_id = ? AND pdv_id = ? AND visit_date = ?
           AND no_sale_reason IS NOT NULL AND TRIM(no_sale_reason) != ''
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(vendorId, pdv.id, effectiveVisitDate) as
      | { id: string; no_sale_reason: string }
      | undefined;

    if (
      existingMotifVisit &&
      existingMotifVisit.no_sale_reason.trim() !== cleanMotif
    ) {
      return {
        httpStatus: 403,
        success: false,
        code: 'MOTIF_FIGE_403',
        error:
          "Action interdite (403) : un motif de visite sans vente a déjà été envoyé pour ce PDV sur ce jour et est figé à l'envoi.",
      };
    }
  }

  const alreadyCountedPdv = db
    .prepare(
      `SELECT id FROM vrs_visits
       WHERE vendor_id = ? AND pdv_id = ? AND visit_date = ? AND is_counted = 1
       LIMIT 1`
    )
    .get(vendorId, pdv.id, effectiveVisitDate) as { id: string } | undefined;

  const visitId = `vrs-vis-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const nowIso = bamakoNow.isoStr;

  const countsImmediately = hasSale;
  const initialIsCounted = countsImmediately && !alreadyCountedPdv ? 1 : 0;
  const initialValidationStatus = countsImmediately ? 'valide' : 'en_attente';
  const storedVisitType = hasSale ? 'visite_avec_vente' : 'visite_sans_vente';

  const statusReason = hasSale
    ? `Visite avec vente comptée immédiatement (${targetDaySlot.dayName} ${effectiveVisitDate})`
    : `Visite sans vente soumise avec motif figé (en attente d'acceptation DOV / Admin / Sales Admin)`;

  let afterState!: ReturnType<typeof syncVendorVrsCycleTransaction>;

  const checkinTx = () => runInDbTransaction(() => {
    db.prepare(`
      INSERT INTO vrs_visits (
        id, visit_uuid, week_id, week_start_date, visit_date, visit_time, server_recorded_at,
        vendor_id, pdv_id, latitude, longitude, gps_accuracy, distance_m,
        device_info, is_counted, status_reason, visit_type, no_sale_reason, sale_id,
        routine_day, routine_day_index, validation_status,
        recorded_offline, client_recorded_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      visitId,
      cleanUuid,
      currentState.cycle.id,
      currentState.cycleStartDate,
      effectiveVisitDate,
      bamakoNow.timeStr,
      nowIso,
      vendorId,
      pdv.id,
      latNum,
      lngNum,
      accNum,
      distanceM,
      params.deviceInfo || 'Terminal Mobile Vendeur',
      initialIsCounted,
      statusReason,
      storedVisitType,
      cleanMotif || null,
      params.saleId || null,
      targetDaySlot.dayName,
      targetDaySlot.dayOfWeek,
      initialValidationStatus,
      params.recordedOffline ? 1 : 0,
      params.clientRecordedAt || nowIso,
      nowIso
    );

    db.prepare('UPDATE points_de_vente SET last_visit = ? WHERE id = ?').run(
      `${effectiveVisitDate} ${bamakoNow.timeStr}`,
      pdv.id
    );

    afterState = syncVendorVrsCycleTransaction(vendorId, effectiveVisitDate, actor, {
      evaluateIncompleteForReferenceDate: false,
    });
  });

  checkinTx();

  const updatedTargetDay =
    afterState.days.find((d: any) => d.date === effectiveVisitDate) || afterState.selectedDay;
  const justValidatedDay = afterState.justValidatedDays.length > 0;
  const justCompletedCycle = afterState.justCompletedCycle;

  recordVrsAudit({
    action: !hasSale
      ? 'SOUMISSION_VISITE_SANS_VENTE_EN_ATTENTE'
      : 'POINTAGE_VISITE_VRS_COMPTABILISEE',
    entityId: visitId,
    actor,
    beforeState: {
      day_date: effectiveVisitDate,
      day_name: targetDaySlot.dayName,
      counted_visits: targetDaySlot.countedVisits,
      status: targetDaySlot.status,
    },
    afterState: {
      day_date: effectiveVisitDate,
      day_name: updatedTargetDay?.dayName,
      counted_visits: updatedTargetDay?.countedVisits,
      pending_visits: updatedTargetDay?.pendingVisits,
      status: updatedTargetDay?.status,
      is_locked: updatedTargetDay?.isLocked,
      active_day_now: afterState.activeDay?.dayName,
      active_date_now: afterState.activeDay?.date,
      cycle_status: afterState.cycleStatus,
    },
    summary: !hasSale
      ? `Visite sans vente soumise par ${afterState.vendor.name} sur ${pdv.name} (${pdv.code}) avec motif figé « ${cleanMotif} » (En attente de validation DOV/Admin/Sales Admin).`
      : `Visite avec vente validée pour ${afterState.vendor.name} sur ${pdv.name} (${pdv.code}) à ${distanceM} m — ${updatedTargetDay?.countedVisits}/${updatedTargetDay?.targetPdvCount} PDV (${updatedTargetDay?.status}).`,
  });

  if (!hasSale) {
    const visitMetaJson = JSON.stringify({
      pdvId: pdv.id,
      pdvCode: pdv.code,
      pdvName: pdv.name,
      neighborhood: pdv.neighborhood || 'Bamako',
      managerName: pdv.manager_name || 'Gérant',
      visitId,
      noSaleReason: cleanMotif,
      vendorId: afterState.vendor.id,
      vendorName: afterState.vendor.name,
      vendorCode: afterState.vendor.code,
      isMotifVisit: true,
    });
    sendVrsNotification({
      targetRole: 'Directeur des opérations de vente',
      title: `Motif visite sans vente à valider : ${pdv.name} (${pdv.code})`,
      message: `${afterState.vendor.name} a soumis une visite sans vente sur "${pdv.name}" (${targetDaySlot.dayName} ${effectiveVisitDate}). Motif : « ${cleanMotif} ».`,
      type: 'validation_pdv',
      referenceCode: pdv.code,
      metadataJson: visitMetaJson,
    });
    sendVrsNotification({
      targetRole: 'Administrateur',
      title: `Motif visite sans vente à valider : ${pdv.name} (${pdv.code})`,
      message: `${afterState.vendor.name} a soumis une visite sans vente sur "${pdv.name}" (${targetDaySlot.dayName} ${effectiveVisitDate}). Motif : « ${cleanMotif} ».`,
      type: 'validation_pdv',
      referenceCode: pdv.code,
      metadataJson: visitMetaJson,
    });
  }

  let message: string;
  if (justCompletedCycle) {
    message = 'Semaine terminée, prochaine routine lundi';
  } else if (justValidatedDay) {
    const trans = afterState.justValidatedDays[0];
    message = `25e PDV validé ! ${trans.dayName} (${trans.date}) est maintenant Validé et verrouillé. Le jour suivant (${trans.nextDayName} ${trans.nextDayDate}) est automatiquement Disponible (0/25).`;
  } else if (!hasSale) {
    message = `Visite sans vente soumise avec motif figé sur "${pdv.name}" (En attente de validation par DOV / Administrateur / Sales Admin). Visites comptées : ${updatedTargetDay?.countedVisits}/${updatedTargetDay?.targetPdvCount}.`;
  } else {
    message = `Visite avec vente comptée sur "${pdv.name}" (${distanceM} m) — ${updatedTargetDay?.countedVisits} / ${updatedTargetDay?.targetPdvCount} PDV sur ${updatedTargetDay?.dayName} (${effectiveVisitDate}).`;
  }

  const insertedVisit = db.prepare('SELECT * FROM vrs_visits WHERE id = ?').get(visitId);

  return {
    httpStatus: 200,
    success: true,
    message,
    visit: insertedVisit,
    state: afterState,
    alreadyCountedToday: Boolean(alreadyCountedPdv),
    justValidatedDay,
    justCompletedCycle,
  };
}

/**
 * Réaction sur le motif d'une visite sans vente ("Accepter le motif" ou "Contester" avec commentaire obligatoire si contesté)
 * Autorisé uniquement pour : DOV, Administrateur, Sales Admin / Contrôleur.
 * Vendeur et autres rôles -> 403.
 */
export function executeVrsMotifReaction(params: {
  actor: VrsActor;
  visitId?: string;
  pdvId?: string;
  vendorId?: string;
  decision: string;
  comment?: string;
  referenceDate?: string;
  attemptedMotifChange?: boolean;
}): {
  httpStatus: number;
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  reaction?: any;
  state?: any;
} {
  ensureVrsSchema();
  const { actor } = params;

  if (params.attemptedMotifChange) {
    return {
      httpStatus: 403,
      success: false,
      code: 'MOTIF_FIGE_403',
      error:
        "Action interdite (403) : toute tentative de modifier un motif déjà envoyé est refusée pour tous les rôles. Le motif est figé à l'envoi.",
    };
  }

  if (!isVrsSupervisorRole(actor.role)) {
    return {
      httpStatus: 403,
      success: false,
      code: 'ROLE_FORBIDDEN_403',
      error:
        'Accès refusé (403) : seuls le DOV, l’Administrateur et le Sales Admin / Contrôleur peuvent accepter ou contester un motif de visite sans vente.',
    };
  }

  const rawDec = String(params.decision || '').toLowerCase().trim();
  const cleanDecision: 'accepte' | 'conteste' | '' =
    rawDec === 'accepte' || rawDec === 'accepted' || rawDec === 'accepter'
      ? 'accepte'
      : rawDec === 'conteste' || rawDec === 'contested' || rawDec === 'contester'
      ? 'conteste'
      : '';

  if (!cleanDecision) {
    return {
      httpStatus: 400,
      success: false,
      error: 'Décision invalide : utilisez "accepte" (Accepter le motif) ou "conteste" (Contester).',
    };
  }

  const cleanComment = typeof params.comment === 'string' ? params.comment.trim() : '';
  if (cleanDecision === 'conteste' && cleanComment.length < 3) {
    return {
      httpStatus: 400,
      success: false,
      error: 'Un commentaire séparé est obligatoire pour contester un motif (minimum 3 caractères).',
    };
  }

  let visRow: any = null;
  if (params.visitId && params.visitId.trim()) {
    visRow = db
      .prepare(
        `SELECT v.*, COALESCE(p.name, 'PDV') as pdv_name, COALESCE(p.code, '') as pdv_code
         FROM vrs_visits v
         LEFT JOIN points_de_vente p ON p.id = v.pdv_id
         WHERE v.id = ?`
      )
      .get(params.visitId.trim());
  }
  if (!visRow && params.pdvId && params.pdvId.trim()) {
    visRow = db
      .prepare(
        `SELECT v.*, COALESCE(p.name, 'PDV') as pdv_name, COALESCE(p.code, '') as pdv_code
         FROM vrs_visits v
         LEFT JOIN points_de_vente p ON p.id = v.pdv_id
         WHERE v.pdv_id = ?
         ORDER BY v.visit_date DESC, v.visit_time DESC, v.created_at DESC
         LIMIT 1`
      )
      .get(params.pdvId.trim());
  }

  if (!visRow) {
    return {
      httpStatus: 404,
      success: false,
      error: 'Visite sans vente introuvable.',
    };
  }

  const nowIso = new Date().toISOString();
  const reactionId = `vmr-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const targetValStatus = cleanDecision === 'accepte' ? 'valide' : 'conteste';

  let afterState!: ReturnType<typeof syncVendorVrsCycleTransaction>;

  const reactTx = () => runInDbTransaction(() => {
    db.prepare(
      `INSERT INTO vrs_visit_motif_reactions (
        id, visit_id, pdv_id, vendor_id, decision, comment, actor_role, actor_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reactionId,
      visRow.id,
      visRow.pdv_id,
      visRow.vendor_id,
      cleanDecision,
      cleanComment || null,
      actor.role,
      actor.name,
      nowIso
    );

    db.prepare(
      `UPDATE vrs_visits
       SET motif_reaction_status = ?,
           motif_reaction_comment = ?,
           motif_reacted_by = ?,
           motif_reacted_role = ?,
           motif_reacted_at = ?,
           validation_status = ?,
           validated_by = ?,
           validated_at = ?
       WHERE id = ?`
    ).run(
      cleanDecision,
      cleanComment || null,
      actor.name,
      actor.role,
      nowIso,
      targetValStatus,
      actor.name,
      nowIso,
      visRow.id
    );

    afterState = syncVendorVrsCycleTransaction(
      visRow.vendor_id,
      params.referenceDate || visRow.visit_date,
      actor,
      { evaluateIncompleteForReferenceDate: false }
    );
  });

  reactTx();

  recordVrsAudit({
    action:
      cleanDecision === 'accepte'
        ? 'ACCEPTATION_MOTIF_VISITE_SANS_VENTE'
        : 'CONTESTATION_MOTIF_VISITE_SANS_VENTE',
    entityId: visRow.id,
    actor,
    beforeState: {
      visit_id: visRow.id,
      pdv_id: visRow.pdv_id,
      previous_reaction: visRow.motif_reaction_status || null,
      motif_fige: visRow.no_sale_reason,
    },
    afterState: {
      decision: cleanDecision,
      comment: cleanComment || null,
      counted_visits: afterState.selectedDay?.countedVisits,
      pending_visits: afterState.selectedDay?.pendingVisits,
      contested_visits: afterState.selectedDay?.contestedVisits,
      day_status: afterState.selectedDay?.status,
    },
    summary:
      cleanDecision === 'accepte'
        ? `Motif de visite sans vente accepté par ${actor.name} (${actor.role}) sur ${visRow.pdv_name} (${visRow.pdv_code}). La visite est maintenant comptée (${afterState.selectedDay?.countedVisits}/${afterState.selectedDay?.targetPdvCount}).`
        : `Motif de visite sans vente contesté par ${actor.name} (${actor.role}) sur ${visRow.pdv_name} (${visRow.pdv_code}) avec commentaire : "${cleanComment}". La visite est retirée du compte.`,
  });

  sendVrsNotification({
    targetRole: 'Vendeur',
    targetUserId: visRow.vendor_id,
    title:
      cleanDecision === 'accepte'
        ? `Motif accepté : ${visRow.pdv_name}`
        : `Motif contesté : ${visRow.pdv_name}`,
    message:
      cleanDecision === 'accepte'
        ? `${actor.name} (${actor.role}) a accepté votre motif de visite sans vente sur "${visRow.pdv_name}". La visite est comptée dans votre routine.`
        : `${actor.name} (${actor.role}) a contesté votre motif sur "${visRow.pdv_name}" (retirée du compte). Commentaire : « ${cleanComment} ».`,
    type: 'validation_pdv',
    referenceCode: visRow.pdv_code || visRow.id,
  });

  return {
    httpStatus: 200,
    success: true,
    reaction: {
      id: reactionId,
      visitId: visRow.id,
      pdvId: visRow.pdv_id,
      vendorId: visRow.vendor_id,
      decision: cleanDecision,
      reactionStatus: cleanDecision,
      comment: cleanComment || null,
      actorRole: actor.role,
      actorName: actor.name,
      createdAt: nowIso,
    },
    message:
      cleanDecision === 'accepte'
        ? `Motif accepté sur « ${visRow.pdv_name} » : la visite est désormais comptée (${afterState.selectedDay?.countedVisits}/${afterState.selectedDay?.targetPdvCount} PDV).`
        : `Motif contesté sur « ${visRow.pdv_name} » : la visite a été retirée du compte (${afterState.selectedDay?.countedVisits}/${afterState.selectedDay?.targetPdvCount} PDV).`,
    state: afterState,
  };
}

/**
 * Validation d'une visite en attente par DOV, Administrateur ou Sales Admin / Contrôleur.
 * Vendeur et autres rôles -> 403.
 */
export function executeVrsValidatePendingVisit(params: {
  actor: VrsActor;
  visitId?: string;
  pdvId?: string;
  vendorId?: string;
  referenceDate?: string;
  attemptedMotifChange?: boolean;
}): {
  httpStatus: number;
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  state?: any;
} {
  ensureVrsSchema();
  const { actor } = params;

  if (params.attemptedMotifChange) {
    return {
      httpStatus: 403,
      success: false,
      code: 'MOTIF_FIGE_403',
      error:
        "Action interdite (403) : le motif envoyé par le vendeur est figé à l'envoi et ne peut jamais être modifié.",
    };
  }

  if (!isVrsSupervisorRole(actor.role)) {
    return {
      httpStatus: 403,
      success: false,
      code: 'ROLE_FORBIDDEN_403',
      error:
        'Accès refusé (403) : seuls le DOV, l’Administrateur et le Sales Admin / Contrôleur peuvent valider une visite en attente.',
    };
  }

  let visRow: any = null;
  if (params.visitId && params.visitId.trim()) {
    visRow = db
      .prepare('SELECT * FROM vrs_visits WHERE id = ?')
      .get(params.visitId.trim());
  }
  if (!visRow && params.pdvId && params.pdvId.trim()) {
    visRow = db
      .prepare(
        `SELECT * FROM vrs_visits
         WHERE pdv_id = ?
         ORDER BY visit_date DESC, visit_time DESC, created_at DESC
         LIMIT 1`
      )
      .get(params.pdvId.trim());
  }

  const nowIso = new Date().toISOString();
  const bamakoNow = getBamakoNow();
  let resolvedVendorId =
    visRow?.vendor_id || (params.vendorId && params.vendorId.trim()) || 'usr-vnd-1';
  let targetPdvName = 'PDV';
  let targetPdvCode = '';
  let pdvRow: any = null;

  const targetPdvId = visRow?.pdv_id || params.pdvId;
  if (targetPdvId) {
    pdvRow = db
      .prepare('SELECT id, code, name, vendor_id, latitude, longitude, gps_accuracy, routine_day, routine_day_index FROM points_de_vente WHERE id = ?')
      .get(targetPdvId) as any;
    if (pdvRow) {
      resolvedVendorId = pdvRow.vendor_id || resolvedVendorId;
      targetPdvName = pdvRow.name || targetPdvName;
      targetPdvCode = pdvRow.code || targetPdvCode;
      db.prepare(
        `UPDATE points_de_vente
         SET status = 'valide',
             validation_status = 'valide',
             validated_by = ?,
             validated_at = ?,
             rejection_reason = NULL,
             updated_at = ?
         WHERE id = ?`
      ).run(`${actor.name} (${actor.role})`, nowIso, nowIso, pdvRow.id);
    }
  }

  // Résoudre le jour actif du vendeur pour s'assurer que la visite est validée sur la journée active
  const preState = syncVendorVrsCycleTransaction(
    resolvedVendorId,
    params.referenceDate || visRow?.visit_date,
    actor,
    { evaluateIncompleteForReferenceDate: false }
  );
  const activeRoutineDate =
    preState.activeDay?.date ||
    params.referenceDate ||
    visRow?.visit_date ||
    bamakoNow.dateStr;
  const activeRoutineDayName = preState.activeDay?.dayName || pdvRow?.routine_day || 'Lundi';
  const activeRoutineDayIndex = Number(preState.activeDay?.dayOfWeek || pdvRow?.routine_day_index || 1);

  // Vérifier s'il existe déjà une visite pour ce PDV sur la date active
  let activeDayVisRow: any = null;
  if (targetPdvId) {
    activeDayVisRow = db
      .prepare(
        `SELECT * FROM vrs_visits
         WHERE vendor_id = ? AND pdv_id = ? AND visit_date = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(resolvedVendorId, targetPdvId, activeRoutineDate);
  }

  let afterState!: ReturnType<typeof syncVendorVrsCycleTransaction>;
  let validatedVisitId: string | null = visRow?.id || activeDayVisRow?.id || null;

  const valTx = () => runInDbTransaction(() => {
    const validatorLabel = `${actor.name} (${actor.role})`;

    if (visRow) {
      db.prepare(
        `UPDATE vrs_visits
         SET validation_status = 'valide',
             is_counted = 1,
             motif_reaction_status = CASE WHEN no_sale_reason IS NOT NULL AND TRIM(no_sale_reason) != '' THEN 'accepte' ELSE motif_reaction_status END,
             validated_by = ?,
             validated_at = ?
         WHERE id = ?`
      ).run(validatorLabel, nowIso, visRow.id);
    }

    if (activeDayVisRow) {
      db.prepare(
        `UPDATE vrs_visits
         SET validation_status = 'valide',
             is_counted = 1,
             motif_reaction_status = CASE WHEN no_sale_reason IS NOT NULL AND TRIM(no_sale_reason) != '' THEN 'accepte' ELSE motif_reaction_status END,
             validated_by = ?,
             validated_at = ?
         WHERE id = ?`
      ).run(validatorLabel, nowIso, activeDayVisRow.id);
      validatedVisitId = activeDayVisRow.id;
    } else if (targetPdvId) {
      // S'il n'y avait pas encore de visite pointée sur la journée active pour ce PDV,
      // on enregistre une visite validée sur la journée active pour que le PDV passe à "Visite validée"
      const newVisitId = `vrs-vis-val-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const newVisitUuid = `vrs-uuid-val-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      validatedVisitId = newVisitId;
      db.prepare(`
        INSERT INTO vrs_visits (
          id, visit_uuid, week_id, week_start_date, visit_date, visit_time, server_recorded_at,
          vendor_id, pdv_id, latitude, longitude, gps_accuracy, distance_m,
          device_info, is_counted, status_reason, visit_type, no_sale_reason, sale_id,
          routine_day, routine_day_index, validation_status, validated_by, validated_at,
          recorded_offline, client_recorded_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, ?, ?, 'valide', ?, ?, 0, ?, ?)
      `).run(
        newVisitId,
        newVisitUuid,
        preState.cycle?.id || `vrs-wk-${resolvedVendorId}-${preState.cycleStartDate}`,
        preState.cycleStartDate,
        activeRoutineDate,
        bamakoNow.timeStr,
        nowIso,
        resolvedVendorId,
        targetPdvId,
        Number(pdvRow?.latitude || 12.6392),
        Number(pdvRow?.longitude || -7.9928),
        Number(pdvRow?.gps_accuracy || 4.5),
        0,
        `Validation supervision (${actor.role})`,
        `Visite validée par ${validatorLabel} (${activeRoutineDayName} ${activeRoutineDate})`,
        visRow?.visit_type || 'visite_sans_vente',
        visRow?.no_sale_reason || null,
        activeRoutineDayName,
        activeRoutineDayIndex,
        validatorLabel,
        nowIso,
        nowIso,
        nowIso
      );

      db.prepare('UPDATE points_de_vente SET last_visit = ? WHERE id = ?').run(
        `${activeRoutineDate} ${bamakoNow.timeStr}`,
        targetPdvId
      );
    }

    if (targetPdvId) {
      db.prepare(
        `UPDATE vrs_visits
         SET validation_status = 'valide',
             motif_reaction_status = CASE WHEN no_sale_reason IS NOT NULL AND TRIM(no_sale_reason) != '' THEN 'accepte' ELSE motif_reaction_status END,
             validated_by = COALESCE(validated_by, ?),
             validated_at = COALESCE(validated_at, ?)
         WHERE pdv_id = ? AND vendor_id = ? AND visit_date = ?`
      ).run(validatorLabel, nowIso, targetPdvId, resolvedVendorId, activeRoutineDate);
    }

    afterState = syncVendorVrsCycleTransaction(
      resolvedVendorId,
      activeRoutineDate,
      actor,
      { evaluateIncompleteForReferenceDate: false }
    );
  });

  valTx();

  recordVrsAudit({
    action: 'VALIDATION_VISITE_EN_ATTENTE',
    entityId: String(validatedVisitId || targetPdvId || 'visit'),
    actor,
    beforeState: {
      visit_id: visRow?.id || null,
      pdv_id: targetPdvId || null,
      validation_status: visRow?.validation_status || 'en_attente',
    },
    afterState: {
      visit_id: validatedVisitId,
      validation_status: 'valide',
      counted_visits: afterState.selectedDay?.countedVisits,
      day_status: afterState.selectedDay?.status,
    },
    summary: `Visite validée par ${actor.name} (${actor.role}) sur "${targetPdvName}" (${targetPdvCode}) pour le vendeur ${resolvedVendorId}.`,
  });

  return {
    httpStatus: 200,
    success: true,
    message: `Visite sur « ${targetPdvName} » validée avec succès (${afterState.selectedDay?.countedVisits}/${afterState.selectedDay?.targetPdvCount} PDV).`,
    state: afterState,
  };
}

// ============================================================================
// ROUTES API /api/vrs/*
// ============================================================================

vrsRouter.get('/state', (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (!isVrsAllowedRole(actor.role)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : le profil "${actor.role}" n'a aucun accès à la Routine VRS.`,
      });
    }

    const referenceDate = (req.query.reference_date as string) || undefined;
    const requestedVendorId = (req.query.vendor_id as string) || '';

    const targetVendorId =
      actor.role === 'Vendeur'
        ? actor.id || 'usr-vnd-1'
        : requestedVendorId || 'usr-vnd-1';

    const rawPrimaryState = syncVendorVrsCycleTransaction(targetVendorId, referenceDate, actor);
    const primaryState = {
      ...rawPrimaryState,
      visits: (rawPrimaryState.visits || []).map((v: any) =>
        formatVisitForActorRole(v, actor.role)
      ),
    };

    let allVendorsSummary: any[] = [];
    if (isVrsSupervisorRole(actor.role)) {
      const vendors = db
        .prepare("SELECT id FROM users WHERE role = 'Vendeur' ORDER BY code ASC")
        .all() as Array<{ id: string }>;
      allVendorsSummary = vendors.map((v) => {
        const st = syncVendorVrsCycleTransaction(v.id, referenceDate, actor);
        return {
          ...st,
          visits: (st.visits || []).map((vis: any) => formatVisitForActorRole(vis, actor.role)),
        };
      });
    }

    res.json({
      success: true,
      actor,
      state: primaryState,
      allVendorsSummary,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur serveur lors de la lecture VRS';
    res.status(500).json({ success: false, error: message });
  }
});

vrsRouter.get('/history', (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (!isVrsAllowedRole(actor.role)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : le profil "${actor.role}" n'a aucun accès à l'historique Routine VRS.`,
      });
    }

    const requestedVendorId = (req.query.vendor_id as string) || '';
    const filterVendorId =
      actor.role === 'Vendeur' ? actor.id : requestedVendorId;

    syncVendorVrsCycleTransaction(
      filterVendorId && filterVendorId !== 'ALL' ? filterVendorId : 'usr-vnd-1',
      (req.query.reference_date as string) || undefined,
      actor
    );

    const weeksQuery =
      filterVendorId && filterVendorId !== 'ALL'
        ? `SELECT w.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_weeks w
           LEFT JOIN users u ON u.id = w.vendor_id
           WHERE w.vendor_id = ?
           ORDER BY w.week_start_date DESC`
        : `SELECT w.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_weeks w
           LEFT JOIN users u ON u.id = w.vendor_id
           ORDER BY w.week_start_date DESC, u.code ASC`;

    const weeks =
      filterVendorId && filterVendorId !== 'ALL'
        ? db.prepare(weeksQuery).all(filterVendorId)
        : db.prepare(weeksQuery).all();

    const visitsQuery =
      filterVendorId && filterVendorId !== 'ALL'
        ? `SELECT v.*, p.code as pdv_code, p.name as pdv_name, p.neighborhood as pdv_neighborhood,
                  p.latitude as pdv_latitude, p.longitude as pdv_longitude, p.gps_accuracy as pdv_gps_accuracy,
                  u.name as vendor_name, u.code as vendor_code
           FROM vrs_visits v
           LEFT JOIN points_de_vente p ON p.id = v.pdv_id
           LEFT JOIN users u ON u.id = v.vendor_id
           WHERE v.vendor_id = ?
           ORDER BY v.visit_date DESC, v.visit_time DESC LIMIT 200`
        : `SELECT v.*, p.code as pdv_code, p.name as pdv_name, p.neighborhood as pdv_neighborhood,
                  p.latitude as pdv_latitude, p.longitude as pdv_longitude, p.gps_accuracy as pdv_gps_accuracy,
                  u.name as vendor_name, u.code as vendor_code
           FROM vrs_visits v
           LEFT JOIN points_de_vente p ON p.id = v.pdv_id
           LEFT JOIN users u ON u.id = v.vendor_id
           ORDER BY v.visit_date DESC, v.visit_time DESC LIMIT 200`;

    const rawVisits = (
      filterVendorId && filterVendorId !== 'ALL'
        ? db.prepare(visitsQuery).all(filterVendorId)
        : db.prepare(visitsQuery).all()
    ) as any[];
    const visits = rawVisits.map((v) => formatVisitForActorRole(v, actor.role));

    const derogationsQuery =
      filterVendorId && filterVendorId !== 'ALL'
        ? `SELECT d.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_derogations d
           LEFT JOIN users u ON u.id = d.vendor_id
           WHERE d.vendor_id = ?
           ORDER BY d.created_at DESC`
        : `SELECT d.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_derogations d
           LEFT JOIN users u ON u.id = d.vendor_id
           ORDER BY d.created_at DESC`;

    const derogations =
      filterVendorId && filterVendorId !== 'ALL'
        ? db.prepare(derogationsQuery).all(filterVendorId)
        : db.prepare(derogationsQuery).all();

    const audits = db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE entity IN ('ROUTINE_VRS', 'VRS_VISIT')
         ORDER BY created_at DESC LIMIT 100`
      )
      .all();

    res.json({
      success: true,
      weeks,
      visits,
      derogations,
      audits,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de la lecture de l'historique VRS";
    res.status(500).json({ success: false, error: message });
  }
});

vrsRouter.post('/checkin', (req: Request, res: Response) => {
  try {
    const actor = resolveActor(req);
    const {
      vendor_id,
      pdv_id,
      latitude,
      longitude,
      gps_accuracy,
      device_info,
      visit_uuid,
      visit_date,
      visit_type,
      visit_mode,
      sale_linked,
      no_sale_reason,
      sale_id,
      recorded_offline,
      client_recorded_at,
      status,
    } = req.body || {};

    if (status === 'Validé') {
      return res.status(403).json({
        success: false,
        code: 'SERVER_ONLY_STATUS_403',
        error:
          'Action interdite (403) : le statut "Validé" est écrit par le serveur uniquement.',
      });
    }

    const targetVendorId =
      actor.role === 'Vendeur' ? actor.id || vendor_id || 'usr-vnd-1' : vendor_id || 'usr-vnd-1';

    if (!pdv_id) {
      return res.status(400).json({
        success: false,
        error: 'Identifiant du PDV (pdv_id) obligatoire.',
      });
    }

    const resolvedVisitType =
      visit_type ||
      visit_mode ||
      (sale_linked || sale_id ? 'visite_avec_vente' : 'visite_sans_vente');

    const result = executeVrsVisitCheckin({
      actor,
      vendorId: targetVendorId,
      pdvId: String(pdv_id),
      latitude: latitude !== undefined ? Number(latitude) : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
      gpsAccuracy: gps_accuracy !== undefined ? Number(gps_accuracy) : undefined,
      deviceInfo: device_info,
      visitUuid: visit_uuid,
      visitDate: visit_date,
      visitType: resolvedVisitType,
      noSaleReason: no_sale_reason,
      saleId: sale_id,
      recordedOffline: Boolean(recorded_offline),
      clientRecordedAt: client_recorded_at,
    });

    return res.status(result.httpStatus).json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur serveur lors du pointage VRS';
    return res.status(500).json({ success: false, error: message });
  }
});

vrsRouter.post('/sync-offline', (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (!isVrsAllowedRole(actor.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : rôle non autorisé à synchroniser des visites VRS.',
      });
    }

    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const results: Array<{
      visit_uuid: string;
      success: boolean;
      is_counted?: boolean;
      error?: string;
    }> = [];

    for (const item of items) {
      const targetVendorId =
        actor.role === 'Vendeur' ? actor.id : item.vendor_id || 'usr-vnd-1';

      const resItem = executeVrsVisitCheckin({
        actor,
        vendorId: targetVendorId,
        pdvId: String(item.pdv_id || ''),
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        gpsAccuracy: Number(item.gps_accuracy || 5),
        deviceInfo: item.device_info || 'Sync Hors-Ligne Mobile',
        visitUuid: String(item.visit_uuid || `vrs-off-${Date.now()}`),
        visitDate: item.visit_date,
        visitType: item.visit_type || item.visit_mode,
        noSaleReason: item.no_sale_reason,
        saleId: item.sale_id,
        recordedOffline: true,
        clientRecordedAt: item.client_recorded_at,
      });

      results.push({
        visit_uuid: item.visit_uuid,
        success: resItem.success,
        is_counted: resItem.visit ? Number(resItem.visit.is_counted) === 1 : false,
        error: resItem.error,
      });
    }

    res.json({
      success: true,
      syncedCount: results.filter((r) => r.success).length,
      results,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la synchronisation hors-ligne VRS';
    res.status(500).json({ success: false, error: message });
  }
});

const handleVrsMotifReactionRoute = (req: Request, res: Response) => {
  try {
    const actor = resolveActor(req);
    const {
      visit_id,
      pdv_id,
      vendor_id,
      decision,
      reaction_status,
      comment,
      reference_date,
      no_sale_reason,
      motif,
      noSaleReason,
    } = req.body || {};

    const attemptedMotifChange =
      no_sale_reason !== undefined || motif !== undefined || noSaleReason !== undefined;

    const result = executeVrsMotifReaction({
      actor,
      visitId: (req.params?.id as string) || visit_id,
      pdvId: pdv_id,
      vendorId: vendor_id,
      decision: decision || reaction_status,
      comment,
      referenceDate: reference_date,
      attemptedMotifChange,
    });

    return res.status(result.httpStatus).json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la réaction sur le motif';
    return res.status(500).json({ success: false, error: message });
  }
};

vrsRouter.post('/visits/:id/motif-reaction', handleVrsMotifReactionRoute);
vrsRouter.post('/visits/:id/react-motif', handleVrsMotifReactionRoute);
vrsRouter.post('/motif-reaction', handleVrsMotifReactionRoute);
vrsRouter.post('/visit-motif-reaction', handleVrsMotifReactionRoute);

const handleVrsValidateVisitRoute = (req: Request, res: Response) => {
  try {
    const actor = resolveActor(req);
    const {
      visit_id,
      pdv_id,
      vendor_id,
      reference_date,
      no_sale_reason,
      motif,
      noSaleReason,
    } = req.body || {};

    const result = executeVrsValidatePendingVisit({
      actor,
      visitId: (req.params?.id as string) || visit_id,
      pdvId: pdv_id,
      vendorId: vendor_id,
      referenceDate: reference_date,
      attemptedMotifChange:
        no_sale_reason !== undefined || motif !== undefined || noSaleReason !== undefined,
    });

    return res.status(result.httpStatus).json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la validation de la visite';
    return res.status(500).json({ success: false, error: message });
  }
};

vrsRouter.post('/visits/:id/validate', handleVrsValidateVisitRoute);
vrsRouter.post('/validate-visit', handleVrsValidateVisitRoute);

/**
 * Calcule le suivi mensuel d'un vendeur pour un mois YYYY-MM donné :
 * - objectif mensuel en PDV (ou défaut 25 * jours ouvrés avec badge "Objectif par défaut")
 * - réalisé (visites comptées dans le mois)
 * - % d'avancement
 * - jours validés sur jours ouvrés
 * - statut (En cours, Atteint, Non atteint)
 * - historique des attributions pour ce vendeur et ce mois
 */
export function buildVendorMonthlyObjectiveSummary(
  vendorId: string,
  monthKey: string,
  referenceDateOverride?: string
): {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  vendorTeam: string;
  monthKey: string;
  monthLabel: string;
  year: number;
  month: number;
  isDefault: boolean;
  defaultBadgeLabel: string | null;
  isPastMonth: boolean;
  isLockedForNonAdmin: boolean;
  dailyTargetPdv: number;
  workingDaysCount: number;
  defaultMonthlyTargetPdv: number;
  monthlyTargetPdv: number;
  realizedMonthlyPdv: number;
  remainingMonthlyPdv: number;
  progressPercent: number;
  validatedDaysCount: number;
  status: 'En cours' | 'Atteint' | 'Non atteint';
  monthlyTargetCaFcfa: number;
  monthlyTargetCartons: number;
  routineName: string;
  correctionReason: string | null;
  assignedById: string | null;
  assignedByName: string | null;
  assignedByRole: string | null;
  assignedAt: string | null;
  history: any[];
} {
  ensureVrsSchema();
  const settings = getVrsSettings();
  const bamakoNow = getBamakoNow();
  const serverDate = bamakoNow.dateStr;
  const effectiveRefDate =
    referenceDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateOverride)
      ? referenceDateOverride
      : serverDate;

  const currentServerMonthKey = (effectiveRefDate >= settings.routine_start_date
    ? effectiveRefDate
    : settings.routine_start_date
  ).slice(0, 7);

  const monthMeta = getMonthWorkingDaysInfo(monthKey || currentServerMonthKey);
  const vendorRow = db
    .prepare('SELECT id, name, code, role, phone FROM users WHERE id = ?')
    .get(vendorId) as { id: string; name: string; code: string; role: string; phone: string } | undefined;

  const codeUpper = String(vendorRow?.code || vendorId || '').toUpperCase();
  const vendorTeam =
    codeUpper.includes('VND-001') || codeUpper.includes('VND-01') || codeUpper.includes('VND-1')
      ? 'Équipe Rive Gauche (Bamako)'
      : codeUpper.includes('VND-002') || codeUpper.includes('VND-02') || codeUpper.includes('VND-2')
      ? 'Équipe Rive Droite (Bamako)'
      : codeUpper.includes('VND-003') || codeUpper.includes('VND-03') || codeUpper.includes('VND-3')
      ? 'Équipe Centre & Sotuba'
      : 'Équipe Terrain Bamako';

  const existingObjRow = db
    .prepare('SELECT * FROM vrs_monthly_objectives WHERE vendor_id = ? AND month_key = ?')
    .get(vendorId, monthMeta.monthKey) as any;

  const isDefault = !existingObjRow;
  const dailyTargetFixed = 25;
  const defaultMonthlyTargetPdv = dailyTargetFixed * monthMeta.workingDaysCount;
  const monthlyTargetPdv = existingObjRow
    ? Math.max(25, Number(existingObjRow.monthly_target_pdv || defaultMonthlyTargetPdv))
    : defaultMonthlyTargetPdv;

  const monthDaysStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(counted_visits), 0) AS realized_pdv,
         COALESCE(SUM(CASE WHEN status = 'Validé' THEN 1 ELSE 0 END), 0) AS validated_days
       FROM vrs_cycle_days
       WHERE vendor_id = ? AND substr(day_date, 1, 7) = ?`
    )
    .get(vendorId, monthMeta.monthKey) as {
      realized_pdv: number;
      validated_days: number;
    };

  const rawMonthCountedRow = db
    .prepare(
      `SELECT COUNT(DISTINCT visit_date || '::' || pdv_id) AS cnt
       FROM vrs_visits
       WHERE vendor_id = ? AND substr(visit_date, 1, 7) = ? AND is_counted = 1`
    )
    .get(vendorId, monthMeta.monthKey) as { cnt: number };

  const realizedMonthlyPdv = Math.max(
    Number(monthDaysStats?.realized_pdv || 0),
    Number(rawMonthCountedRow?.cnt || 0)
  );
  const validatedDaysCount = Number(monthDaysStats?.validated_days || 0);
  const progressPercent = Math.min(
    100,
    Math.round((realizedMonthlyPdv / Math.max(1, monthlyTargetPdv)) * 100)
  );
  const isPastMonth = monthMeta.monthKey < currentServerMonthKey;
  const status: 'En cours' | 'Atteint' | 'Non atteint' =
    realizedMonthlyPdv >= monthlyTargetPdv
      ? 'Atteint'
      : isPastMonth
      ? 'Non atteint'
      : 'En cours';

  const history = db
    .prepare(
      `SELECT h.*, u.name as vendor_name, u.code as vendor_code
       FROM vrs_monthly_objective_history h
       LEFT JOIN users u ON u.id = h.vendor_id
       WHERE h.vendor_id = ? AND h.month_key = ?
       ORDER BY h.assigned_at DESC LIMIT 30`
    )
    .all(vendorId, monthMeta.monthKey) as any[];

  return {
    id: existingObjRow?.id || `obj-default-${vendorId}-${monthMeta.monthKey}`,
    vendorId,
    vendorName: vendorRow?.name || 'Vendeur',
    vendorCode: vendorRow?.code || vendorId,
    vendorTeam,
    monthKey: monthMeta.monthKey,
    monthLabel: monthMeta.monthLabel,
    year: monthMeta.year,
    month: monthMeta.month,
    isDefault,
    defaultBadgeLabel: isDefault ? 'Objectif par défaut' : null,
    isPastMonth,
    isLockedForNonAdmin: isPastMonth,
    dailyTargetPdv: 25,
    workingDaysCount: monthMeta.workingDaysCount,
    defaultMonthlyTargetPdv,
    monthlyTargetPdv,
    realizedMonthlyPdv,
    remainingMonthlyPdv: Math.max(0, monthlyTargetPdv - realizedMonthlyPdv),
    progressPercent,
    validatedDaysCount,
    status,
    monthlyTargetCaFcfa: Number(existingObjRow?.monthly_target_ca_fcfa || 5000000),
    monthlyTargetCartons: Number(existingObjRow?.monthly_target_cartons || 250),
    routineName: existingObjRow?.routine_name || 'Routine par défaut',
    correctionReason: existingObjRow?.correction_reason || null,
    assignedById: existingObjRow?.assigned_by_id || null,
    assignedByName: existingObjRow?.assigned_by_name || null,
    assignedByRole: existingObjRow?.assigned_by_role || null,
    assignedAt: existingObjRow?.updated_at || existingObjRow?.created_at || null,
    history,
  };
}

/**
 * Attribution d'un objectif mensuel Routine VRS à un ou plusieurs vendeurs pour un mois YYYY-MM donné :
 * - Autorisé uniquement pour Administrateur, DOV, Sales Admin / Contrôleur (403 sinon).
 * - La règle "un jour actif à la fois, 25 PDV par jour, déblocage du jour suivant" reste inchangée.
 * - Objectif mensuel en PDV : défaut = 25 * nombre de jours ouvrés du mois ; minimum 25 PDV.
 * - Possible pour le mois courant et les suivants ; un mois passé est verrouillé (correction motivée par l'Administrateur seulement).
 * - Notification (cloche et push) au vendeur à chaque attribution ou modification, rappel à 80 % et en fin de mois.
 * - Audit et historique conservés avec auteur et date de l'attribution.
 */
export function executeVrsAssignMonthlyObjectives(params: {
  actor: VrsActor;
  vendorIds?: string[];
  vendorId?: string;
  applyToAll?: boolean;
  monthKey?: string;
  year?: number | string;
  month?: number | string;
  monthlyTargetPdv?: number | string;
  routineName?: string;
  correctionReason?: string;
  referenceDate?: string;
}): {
  httpStatus: number;
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  assignedObjectives?: any[];
  state?: any;
} {
  ensureVrsSchema();
  const { actor } = params;

  if (!isVrsSupervisorRole(actor.role)) {
    return {
      httpStatus: 403,
      success: false,
      code: 'ROLE_FORBIDDEN_403',
      error:
        "Accès refusé (403) : seuls l'Administrateur, le DOV et le Sales Admin / Contrôleur peuvent attribuer un objectif mensuel Routine VRS.",
    };
  }

  const settings = getVrsSettings();
  const bamakoNow = getBamakoNow();
  const effectiveRefDate =
    params.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(params.referenceDate)
      ? params.referenceDate
      : bamakoNow.dateStr;

  const currentMonthKey = (effectiveRefDate >= settings.routine_start_date
    ? effectiveRefDate
    : settings.routine_start_date
  ).slice(0, 7);

  let requestedMonthKey = '';
  if (typeof params.monthKey === 'string' && /^\d{4}-\d{2}$/.test(params.monthKey.trim())) {
    requestedMonthKey = params.monthKey.trim();
  } else if (params.year && params.month) {
    const y = Number(params.year);
    const m = Number(params.month);
    if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) {
      requestedMonthKey = `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  if (!requestedMonthKey) {
    requestedMonthKey = currentMonthKey;
  }

  const monthMeta = getMonthWorkingDaysInfo(requestedMonthKey);
  const isPastMonth = monthMeta.monthKey < currentMonthKey;
  const cleanCorrectionReason = String(params.correctionReason || '').trim();

  // Règle 1 : Un mois passé est verrouillé (correction motivée par l'Administrateur seulement)
  if (isPastMonth) {
    const isAdmin = String(actor.role || '').trim() === 'Administrateur';
    if (!isAdmin) {
      return {
        httpStatus: 403,
        success: false,
        code: 'PAST_MONTH_LOCKED_403',
        error: `Mois passé verrouillé (403) : le mois de ${monthMeta.monthLabel} (${monthMeta.monthKey}) est verrouillé. Seul l'Administrateur peut effectuer une correction motivée sur un mois passé.`,
      };
    }
    if (cleanCorrectionReason.length < 3) {
      return {
        httpStatus: 400,
        success: false,
        code: 'CORRECTION_REASON_REQUIRED_400',
        error: `Correction sur mois passé refusée : le mois de ${monthMeta.monthLabel} est verrouillé. L'Administrateur doit saisir un motif de correction obligatoire.`,
      };
    }
  }

  // Résolution de la liste des vendeurs (sélection multiple supportée)
  let targetVendorIds: string[] = [];
  if (params.applyToAll) {
    const allVnds = db
      .prepare("SELECT id FROM users WHERE role = 'Vendeur' ORDER BY code ASC")
      .all() as Array<{ id: string }>;
    targetVendorIds = allVnds.map((v) => v.id);
  } else if (Array.isArray(params.vendorIds) && params.vendorIds.length > 0) {
    targetVendorIds = Array.from(
      new Set(
        params.vendorIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
  } else if (typeof params.vendorId === 'string' && params.vendorId.trim()) {
    targetVendorIds = [params.vendorId.trim()];
  }

  if (targetVendorIds.length === 0) {
    return {
      httpStatus: 400,
      success: false,
      code: 'VENDOR_REQUIRED_400',
      error: 'Veuillez sélectionner au moins un vendeur pour attribuer l’objectif mensuel.',
    };
  }

  // Objectif mensuel en PDV : défaut = 25 x nombre de jours ouvrés du mois ; minimum 25
  const rawMonthlyTarget =
    params.monthlyTargetPdv !== undefined &&
    params.monthlyTargetPdv !== null &&
    String(params.monthlyTargetPdv).trim() !== ''
      ? Number(params.monthlyTargetPdv)
      : monthMeta.defaultMonthlyTargetPdv;

  if (!Number.isFinite(rawMonthlyTarget) || Math.round(rawMonthlyTarget) < 25) {
    return {
      httpStatus: 400,
      success: false,
      code: 'MIN_MONTHLY_OBJECTIVE_25',
      error:
        "Objectif refusé : l'objectif mensuel attribué doit être d'au moins 25 PDV minimum.",
    };
  }

  const monthlyTargetPdv = Math.max(25, Math.round(rawMonthlyTarget));
  const dailyTargetFixed = 25; // Règle : "un jour actif à la fois, 25 PDV par jour, déblocage du jour suivant" reste inchangée
  const cleanRoutineName =
    typeof params.routineName === 'string' && params.routineName.trim()
      ? params.routineName.trim()
      : `Routine ${monthMeta.monthLabel}`;
  const nowIso = new Date().toISOString();

  const assignedObjectives: any[] = [];
  let primaryUpdatedState: any = null;

  const assignTx = () =>
    runInDbTransaction(() => {
      for (const vId of targetVendorIds) {
        const beforeSummary = buildVendorMonthlyObjectiveSummary(
          vId,
          monthMeta.monthKey,
          effectiveRefDate
        );
        const existingRow = db
          .prepare('SELECT * FROM vrs_monthly_objectives WHERE vendor_id = ? AND month_key = ?')
          .get(vId, monthMeta.monthKey) as any;

        const objId = existingRow?.id || `obj-${vId}-${monthMeta.monthKey}`;

        db.prepare(`
          INSERT INTO vrs_monthly_objectives (
            id, vendor_id, month_key, daily_target_pdv, monthly_target_pdv,
            working_days_count, monthly_target_ca_fcfa, monthly_target_cartons,
            routine_name, correction_reason, notified_80_at, notified_eom_at,
            assigned_by_id, assigned_by_name, assigned_by_role, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
          ON CONFLICT(vendor_id, month_key) DO UPDATE SET
            daily_target_pdv = 25,
            monthly_target_pdv = excluded.monthly_target_pdv,
            working_days_count = excluded.working_days_count,
            routine_name = excluded.routine_name,
            correction_reason = excluded.correction_reason,
            notified_80_at = CASE
              WHEN vrs_monthly_objectives.monthly_target_pdv != excluded.monthly_target_pdv THEN NULL
              ELSE vrs_monthly_objectives.notified_80_at
            END,
            assigned_by_id = excluded.assigned_by_id,
            assigned_by_name = excluded.assigned_by_name,
            assigned_by_role = excluded.assigned_by_role,
            updated_at = excluded.updated_at
        `).run(
          objId,
          vId,
          monthMeta.monthKey,
          dailyTargetFixed,
          monthlyTargetPdv,
          monthMeta.workingDaysCount,
          5000000,
          250,
          cleanRoutineName,
          isPastMonth ? cleanCorrectionReason : null,
          actor.id,
          actor.name,
          actor.role,
          nowIso,
          nowIso
        );

        const histId = `obj-hist-${Date.now()}-${Math.floor(Math.random() * 100000)}-${vId}`;
        db.prepare(`
          INSERT INTO vrs_monthly_objective_history (
            id, objective_id, vendor_id, month_key, previous_target_pdv,
            monthly_target_pdv, working_days_count, routine_name,
            is_past_month_correction, correction_reason,
            assigned_by_id, assigned_by_name, assigned_by_role, assigned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          histId,
          objId,
          vId,
          monthMeta.monthKey,
          existingRow ? Number(existingRow.monthly_target_pdv) : null,
          monthlyTargetPdv,
          monthMeta.workingDaysCount,
          cleanRoutineName,
          isPastMonth ? 1 : 0,
          isPastMonth ? cleanCorrectionReason : null,
          actor.id,
          actor.name,
          actor.role,
          nowIso
        );

        const updatedState = syncVendorVrsCycleTransaction(vId, effectiveRefDate, actor);
        if (!primaryUpdatedState) {
          primaryUpdatedState = updatedState;
        }

        const afterSummary = buildVendorMonthlyObjectiveSummary(
          vId,
          monthMeta.monthKey,
          effectiveRefDate
        );
        assignedObjectives.push(afterSummary);

        recordVrsAudit({
          action: isPastMonth
            ? 'CORRECTION_OBJECTIF_MENSUEL_MOIS_PASSE_VRS'
            : existingRow
            ? 'MODIFICATION_OBJECTIF_MENSUEL_VRS'
            : 'ATTRIBUTION_OBJECTIF_MENSUEL_VRS',
          entityId: objId,
          actor,
          beforeState: {
            vendor_id: vId,
            vendor_name: beforeSummary.vendorName,
            month_key: monthMeta.monthKey,
            is_default: beforeSummary.isDefault,
            monthly_target_pdv: beforeSummary.monthlyTargetPdv,
            routine_name: beforeSummary.routineName,
          },
          afterState: {
            vendor_id: vId,
            vendor_name: afterSummary.vendorName,
            month_key: monthMeta.monthKey,
            is_default: false,
            daily_target_pdv: 25,
            monthly_target_pdv: monthlyTargetPdv,
            working_days_count: monthMeta.workingDaysCount,
            routine_name: cleanRoutineName,
            correction_reason: isPastMonth ? cleanCorrectionReason : null,
          },
          summary: `${
            isPastMonth ? 'Correction motivée (mois passé)' : 'Attribution'
          } de l'objectif mensuel (${monthMeta.monthLabel}) pour ${afterSummary.vendorName} (${
            afterSummary.vendorCode
          }) par ${actor.name} (${actor.role}) : ${monthlyTargetPdv} PDV sur le mois (${
            monthMeta.workingDaysCount
          } jours ouvrés • 25 PDV/jour) • Routine : « ${cleanRoutineName} »${
            isPastMonth ? ` • Motif : ${cleanCorrectionReason}` : ''
          }.`,
        });

        sendVrsNotification({
          targetRole: 'Vendeur',
          targetUserId: vId,
          title: `${
            existingRow ? 'Objectif mensuel mis à jour' : 'Nouvel objectif mensuel attribué'
          } (${monthMeta.monthLabel})`,
          message: `Objectif du mois (${monthMeta.monthLabel}) : ${monthlyTargetPdv} PDV (${cleanRoutineName}) attribué par ${actor.name} (${actor.role}). Règle quotidienne : 25 PDV par jour actif.`,
          type: 'info',
          referenceCode: `OBJ-${vId}-${monthMeta.monthKey}`,
        });
      }
    });

  assignTx();

  const vendorNamesList = assignedObjectives.map((o) => o.vendorName).join(', ');
  return {
    httpStatus: 200,
    success: true,
    message: `Objectif mensuel de ${monthlyTargetPdv} PDV (${monthMeta.monthLabel} • « ${cleanRoutineName} ») attribué à ${assignedObjectives.length} vendeur(s) (${vendorNamesList}).`,
    assignedObjectives,
    state: primaryUpdatedState,
  };
}

vrsRouter.get('/monthly-objectives', (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (!isVrsAllowedRole(actor.role)) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_FORBIDDEN_403',
        error: `Accès refusé (403) : le profil "${actor.role}" n'a aucun accès aux objectifs mensuels Routine VRS.`,
      });
    }

    const settings = getVrsSettings();
    const bamakoNow = getBamakoNow();
    const referenceDate =
      typeof req.query.reference_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.reference_date)
        ? req.query.reference_date
        : bamakoNow.dateStr;

    const currentMonthKey = (referenceDate >= settings.routine_start_date
      ? referenceDate
      : settings.routine_start_date
    ).slice(0, 7);

    const requestedMonthKey =
      typeof req.query.month_key === 'string' && /^\d{4}-\d{2}$/.test(req.query.month_key.trim())
        ? req.query.month_key.trim()
        : currentMonthKey;

    const monthMeta = getMonthWorkingDaysInfo(requestedMonthKey);
    const requestedVendorId =
      typeof req.query.vendor_id === 'string' ? req.query.vendor_id.trim() : '';

    // Vendeur : lit uniquement le sien
    const targetVendorIds: string[] = [];
    if (actor.role === 'Vendeur') {
      targetVendorIds.push(actor.id || 'usr-vnd-1');
    } else if (requestedVendorId && requestedVendorId !== 'ALL') {
      targetVendorIds.push(requestedVendorId);
    } else {
      const vendors = db
        .prepare("SELECT id FROM users WHERE role = 'Vendeur' ORDER BY code ASC")
        .all() as Array<{ id: string }>;
      vendors.forEach((v) => targetVendorIds.push(v.id));
    }

    const objectives = targetVendorIds.map((vId) =>
      buildVendorMonthlyObjectiveSummary(vId, monthMeta.monthKey, referenceDate)
    );

    const historyQuery =
      actor.role === 'Vendeur'
        ? `SELECT h.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_monthly_objective_history h
           LEFT JOIN users u ON u.id = h.vendor_id
           WHERE h.vendor_id = ?
           ORDER BY h.assigned_at DESC LIMIT 50`
        : requestedVendorId && requestedVendorId !== 'ALL'
        ? `SELECT h.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_monthly_objective_history h
           LEFT JOIN users u ON u.id = h.vendor_id
           WHERE h.vendor_id = ?
           ORDER BY h.assigned_at DESC LIMIT 100`
        : `SELECT h.*, u.name as vendor_name, u.code as vendor_code
           FROM vrs_monthly_objective_history h
           LEFT JOIN users u ON u.id = h.vendor_id
           ORDER BY h.assigned_at DESC LIMIT 100`;

    const history =
      actor.role === 'Vendeur'
        ? db.prepare(historyQuery).all(actor.id || 'usr-vnd-1')
        : requestedVendorId && requestedVendorId !== 'ALL'
        ? db.prepare(historyQuery).all(requestedVendorId)
        : db.prepare(historyQuery).all();

    return res.json({
      success: true,
      currentMonthKey,
      selectedMonth: monthMeta,
      objectives,
      history,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la lecture des objectifs mensuels VRS';
    return res.status(500).json({ success: false, error: message });
  }
});

const handleAssignMonthlyObjectiveRoute = (req: Request, res: Response) => {
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
      reference_date,
      client_date,
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

    return res.status(result.httpStatus).json({
      success: true,
      message: result.message,
      assignedObjectives: result.assignedObjectives,
      monthlyObjective: result.assignedObjectives?.[0] || result.state?.monthlyObjective,
      state: result.state,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'attribution de l'objectif mensuel";
    return res.status(500).json({ success: false, error: message });
  }
};

vrsRouter.post('/monthly-objectives', handleAssignMonthlyObjectiveRoute);
vrsRouter.post('/objectives', handleAssignMonthlyObjectiveRoute);

vrsRouter.post('/derogations', (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (!isVrsSupervisorRole(actor.role)) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_FORBIDDEN_403',
        error:
          "Accès refusé (403) : seuls le DOV, l'Administrateur et le Sales Admin / Contrôleur peuvent accorder une dérogation VRS.",
      });
    }

    const { vendor_id, target_date, derogation_type, reason, pin, reference_date, status } =
      req.body || {};

    if (status === 'Validé') {
      return res.status(403).json({
        success: false,
        code: 'SERVER_ONLY_STATUS_403',
        error:
          'Action interdite (403) : le statut "Validé" est écrit par le serveur uniquement.',
      });
    }

    if (!vendor_id) {
      return res.status(400).json({
        success: false,
        error: 'Le vendeur bénéficiaire (vendor_id) est obligatoire.',
      });
    }

    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Le motif de la dérogation est obligatoire (minimum 3 caractères).',
      });
    }

    const settings = getVrsSettings();
    if (settings.derogation_pin && settings.derogation_pin.trim().length > 0) {
      if (String(pin || '').trim() !== settings.derogation_pin.trim()) {
        return res.status(403).json({
          success: false,
          error: 'Code PIN de dérogation invalide.',
        });
      }
    }

    const effectiveRefDate =
      (target_date && /^\d{4}-\d{2}-\d{2}$/.test(target_date) ? target_date : '') ||
      (reference_date && /^\d{4}-\d{2}-\d{2}$/.test(reference_date) ? reference_date : '') ||
      settings.routine_start_date;

    const beforeState = syncVendorVrsCycleTransaction(vendor_id, effectiveRefDate, actor);

    const targetSlot =
      beforeState.days.find((d: any) => d.date === target_date) ||
      beforeState.days.find((d: any) => d.status === 'Incomplet') ||
      beforeState.activeDay;

    if (!targetSlot) {
      return res.status(400).json({
        success: false,
        error: 'Aucun jour de la semaine trouvé pour appliquer cette dérogation.',
      });
    }

    const cleanType =
      derogation_type === 'jour_supplementaire' ? 'jour_supplementaire' : 'reprise';
    const derogationId = `vrs-derog-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const nowIso = new Date().toISOString();

    const derogTx = () => runInDbTransaction(() => {
      if (cleanType === 'jour_supplementaire') {
        db.prepare(
          `UPDATE vrs_cycle_days
           SET is_active_day = CASE WHEN day_date = ? THEN 1 ELSE 0 END,
               is_locked = CASE WHEN day_date = ? THEN 0 ELSE 1 END,
               status = CASE WHEN day_date = ? THEN 'Disponible' ELSE status END,
               derogation_granted = CASE WHEN day_date = ? THEN 1 ELSE derogation_granted END,
               unlocked_at = CASE WHEN day_date = ? THEN ? ELSE unlocked_at END,
               updated_at = ?
           WHERE cycle_id = ? AND status != 'Validé'`
        ).run(
          targetSlot.date,
          targetSlot.date,
          targetSlot.date,
          targetSlot.date,
          targetSlot.date,
          nowIso,
          nowIso,
          beforeState.cycle.id
        );
      } else {
        db.prepare(
          `UPDATE vrs_cycle_days
           SET is_locked = 0,
               is_active_day = 1,
               derogation_granted = 1,
               status = CASE WHEN counted_visits > 0 THEN 'En cours' ELSE 'Disponible' END,
               updated_at = ?
           WHERE cycle_id = ? AND day_date = ?`
        ).run(nowIso, beforeState.cycle.id, targetSlot.date);
      }

      db.prepare(
        `UPDATE vrs_weeks
         SET active_date = ?,
             chosen_date = ?,
             status = 'En cours',
             derogation_count = COALESCE(derogation_count, 0) + 1,
             updated_at = ?
         WHERE id = ?`
      ).run(targetSlot.date, targetSlot.date, nowIso, beforeState.cycle.id);

      db.prepare(
        `INSERT INTO vrs_derogations (
          id, week_id, week_start_date, vendor_id, target_date, derogation_type,
          reason, granted_by_id, granted_by_name, granted_by_role,
          previous_week_status, new_week_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'En cours', ?)`
      ).run(
        derogationId,
        beforeState.cycle.id,
        beforeState.cycleStartDate,
        vendor_id,
        targetSlot.date,
        cleanType,
        cleanReason,
        actor.id,
        actor.name,
        actor.role,
        beforeState.cycleStatus,
        nowIso
      );
    });

    derogTx();

    const afterState = syncVendorVrsCycleTransaction(vendor_id, targetSlot.date, actor, {
      evaluateIncompleteForReferenceDate: false,
    });

    recordVrsAudit({
      action: 'DEROGATION_ROUTINE_VRS_ACCORDEE',
      entityId: derogationId,
      actor,
      beforeState: {
        vendor_id,
        target_date: targetSlot.date,
        previous_status: targetSlot.status,
      },
      afterState: {
        vendor_id,
        target_date: targetSlot.date,
        derogation_type: cleanType,
        reason: cleanReason,
        new_status: afterState.activeDay?.status,
      },
      summary: `Dérogation (${cleanType}) accordée par ${actor.name} (${actor.role}) pour ${afterState.vendor.name} sur le ${targetSlot.date}. Motif : "${cleanReason}".`,
    });

    const notifTitle = `Dérogation Routine VRS accordée — ${afterState.vendor.name}`;
    const notifMsg = `${actor.name} (${actor.role}) a accordé une dérogation pour le ${targetSlot.date}. Motif : « ${cleanReason} ».`;

    sendVrsNotification({
      targetRole: 'Vendeur',
      targetUserId: vendor_id,
      title: notifTitle,
      message: notifMsg,
      type: 'info',
      referenceCode: derogationId,
    });
    sendVrsNotification({
      targetRole: 'Directeur des opérations de vente',
      title: notifTitle,
      message: notifMsg,
      type: 'info',
      referenceCode: derogationId,
    });

    return res.json({
      success: true,
      message: `Dérogation accordée à ${afterState.vendor.name} pour le ${targetSlot.date}.`,
      state: afterState,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la dérogation";
    return res.status(500).json({ success: false, error: message });
  }
});

const handleUpdateVrsSettingsRoute = (req: Request, res: Response) => {
  try {
    ensureVrsSchema();
    const actor = resolveActor(req);

    if (
      actor.role !== 'Administrateur' &&
      actor.role !== 'Directeur des opérations de vente' &&
      !isVrsSupervisorRole(actor.role)
    ) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_FORBIDDEN_403',
        error:
          "Accès refusé (403) : seuls l'Administrateur et le DOV peuvent modifier les réglages de la Routine VRS.",
      });
    }

    const beforeSettings = getVrsSettings();
    const {
      routine_start_date,
      next_cycle_policy,
      target_pdv_count,
      allowed_days,
      max_distance_m,
      max_gps_accuracy_m,
      derogation_pin,
    } = req.body || {};

    const upsert = db.prepare(`
      INSERT INTO vrs_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    if (routine_start_date !== undefined) {
      if (actor.role !== 'Administrateur') {
        return res.status(403).json({
          success: false,
          code: 'ADMIN_ONLY_START_DATE_403',
          error:
            'Accès refusé (403) : seul l’Administrateur peut modifier le réglage "Date de démarrage de la routine".',
        });
      }
      const cleanDate = String(routine_start_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        return res.status(400).json({
          success: false,
          error: 'Format de "Date de démarrage de la routine" invalide (attendu : YYYY-MM-DD).',
        });
      }
      upsert.run('routine_start_date', cleanDate);
    }

    if (next_cycle_policy !== undefined) {
      const cleanPolicy =
        next_cycle_policy === 'next_working_day' ? 'next_working_day' : 'same_day_next_week';
      upsert.run('next_cycle_policy', cleanPolicy);
    }

    if (target_pdv_count !== undefined) {
      const parsedTarget = Math.round(Number(target_pdv_count) || 25);
      if (parsedTarget < 25) {
        return res.status(400).json({
          success: false,
          error: "L'objectif de routine doit être d'au moins 25 PDV minimum.",
        });
      }
      const targetNum = Math.max(25, Math.min(200, parsedTarget));
      upsert.run('target_pdv_count', String(targetNum));
      db.prepare(
        `UPDATE vrs_weeks SET target_pdv_count = ? WHERE status NOT IN ('Terminée', 'Terminé')`
      ).run(targetNum);
      db.prepare(
        `UPDATE vrs_cycle_days SET target_pdv_count = ? WHERE status != 'Validé'`
      ).run(targetNum);
    }

    if (Array.isArray(allowed_days)) {
      const cleanDays = allowed_days
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 6);
      if (cleanDays.length > 0) {
        upsert.run('allowed_days', JSON.stringify(Array.from(new Set(cleanDays)).sort()));
      }
    }

    if (max_distance_m !== undefined) {
      const distNum = Math.max(10, Math.min(500, Math.round(Number(max_distance_m) || 100)));
      upsert.run('max_distance_m', String(distNum));
    }

    if (max_gps_accuracy_m !== undefined) {
      const accNum = Math.max(10, Math.min(200, Math.round(Number(max_gps_accuracy_m) || 50)));
      upsert.run('max_gps_accuracy_m', String(accNum));
    }

    if (derogation_pin !== undefined) {
      upsert.run('derogation_pin', String(derogation_pin || '').trim());
    }

    const nowIso = new Date().toISOString();
    upsert.run('updated_by', `${actor.name} (${actor.role})`);
    upsert.run('updated_at', nowIso);

    const afterSettings = getVrsSettings();

    recordVrsAudit({
      action: 'MODIFICATION_REGLAGES_VRS',
      entityId: 'vrs_settings',
      actor,
      beforeState: {
        routine_start_date: beforeSettings.routine_start_date,
        next_cycle_policy: beforeSettings.next_cycle_policy,
        target_pdv_count: beforeSettings.target_pdv_count,
        max_distance_m: beforeSettings.max_distance_m,
      },
      afterState: {
        routine_start_date: afterSettings.routine_start_date,
        next_cycle_policy: afterSettings.next_cycle_policy,
        target_pdv_count: afterSettings.target_pdv_count,
        max_distance_m: afterSettings.max_distance_m,
      },
      summary: `Paramètres Routine VRS mis à jour par ${actor.name} : date de démarrage = ${afterSettings.routine_start_date}, objectif = ${afterSettings.target_pdv_count} PDV.`,
    });

    return res.json({
      success: true,
      message: 'Réglages de la Routine VRS enregistrés avec succès.',
      settings: {
        routine_start_date: afterSettings.routine_start_date,
        next_cycle_policy: afterSettings.next_cycle_policy,
        target_pdv_count: afterSettings.target_pdv_count,
        allowed_days: afterSettings.allowed_days,
        max_distance_m: afterSettings.max_distance_m,
        max_gps_accuracy_m: afterSettings.max_gps_accuracy_m,
        has_derogation_pin: Boolean(
          afterSettings.derogation_pin && afterSettings.derogation_pin.length > 0
        ),
        updated_by: afterSettings.updated_by,
        updated_at: afterSettings.updated_at,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erreur lors de la sauvegarde des réglages VRS';
    return res.status(500).json({ success: false, error: message });
  }
};

vrsRouter.put('/settings', handleUpdateVrsSettingsRoute);
vrsRouter.post('/settings', handleUpdateVrsSettingsRoute);
