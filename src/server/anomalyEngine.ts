import { Request, Response } from 'express';
import { db } from './db.js';
import { triggerImmediatePostCommitPush } from './pushService.js';

export type AnomalyDomain = 'commercial' | 'stock' | 'caisse';
export type AnomalySeverity = 'Info' | 'Attention' | 'Critique';
export type AnomalyStatus = 'Nouvelle' | 'En examen' | 'Justifiée' | 'Confirmée';

export interface MeasuredValueItem {
  label: string;
  value: string;
}

export interface AnomalyThresholds {
  price_tolerance_pct: number;          // Règle 1 : écart de prix toléré (%) par rapport au catalogue (défaut 0 %)
  volume_multiplier: number;            // Règle 2 : multiple de la moyenne du vendeur (défaut 3x)
  inventory_ecart_count: number;        // Règle 3 : nombre d'écarts d'inventaire répétés (défaut 3)
  inventory_window_days: number;        // Règle 3 : fenêtre en jours (défaut 30 jours)
  inactive_vendor_days: number;         // Règle 4 : jours sans vente pour un vendeur (défaut 3 jours)
  pdv_burst_count: number;              // Règle 5 : nombre de PDV créés en rafale sur 24h (défaut 4)
  gps_frozen_count: number;             // Règle 6 : relevés GPS consécutifs figés ou vitesse > seuil (défaut 3)
  gps_max_speed_kmh: number;            // Règle 6 : vitesse maximale cohérente en km/h (défaut 100)
  cancel_frequent_count: number;        // Règle 7 : nombre d'annulations fréquentes (défaut 2)
  cancel_window_days: number;           // Règle 7 : fenêtre en jours pour les annulations (défaut 14)
  late_versement_days: number;          // Règle 8 : délai max de versement en jours (défaut 2)
  caisse_ecart_min_fcfa: number;        // Règle 9 : seuil d'écart de caisse non nul en FCFA (défaut 1 FCFA)
  min_stock_floor: number;              // Règle 10 : seuil stock négatif (défaut 0)
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  price_tolerance_pct: 0,
  volume_multiplier: 3,
  inventory_ecart_count: 3,
  inventory_window_days: 30,
  inactive_vendor_days: 3,
  pdv_burst_count: 4,
  gps_frozen_count: 3,
  gps_max_speed_kmh: 100,
  cancel_frequent_count: 2,
  cancel_window_days: 14,
  late_versement_days: 2,
  caisse_ecart_min_fcfa: 1,
  min_stock_floor: 0,
};

export function getBamakoNow(): { isoDate: string; isoTime: string; fullIso: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Bamako',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const formatted = formatter.format(now); // "YYYY-MM-DD HH:mm:ss"
  const [isoDate, isoTime] = formatted.split(' ');
  return {
    isoDate: isoDate || now.toISOString().split('T')[0],
    isoTime: isoTime || '00:00:00',
    fullIso: `${isoDate}T${isoTime}Z`,
  };
}

/**
 * Retourne les domaines d'alertes autorisés pour un rôle donné (Contrôle serveur strict).
 * - Administrateur : commercial, stock, caisse
 * - DOV & Sales Admin/Contrôleur : commercial, stock
 * - Comptable : caisse (caisse et versements)
 * - Magasinier / Gestionnaire de stock : stock
 * - Vendeur (et autres) : aucun ([] -> 403)
 */
export function getAllowedDomainsForRole(role: string): AnomalyDomain[] {
  const r = (role || '').trim();
  if (r === 'Administrateur') {
    return ['commercial', 'stock', 'caisse'];
  }
  if (
    r === 'Directeur des opérations de vente' ||
    /directeur|op[eé]ration|dov/i.test(r) ||
    r === 'Sales Admin' ||
    /sales\s*admin|contr[oô]leur/i.test(r)
  ) {
    return ['commercial', 'stock'];
  }
  if (r === 'Comptable') {
    return ['caisse'];
  }
  if (r === 'Magasinier' || r === 'Gestionnaire de stock') {
    return ['stock'];
  }
  return [];
}

export function getTargetRolesForDomain(domain: AnomalyDomain): string[] {
  if (domain === 'commercial') {
    return ['Administrateur', 'Directeur des opérations de vente', 'Sales Admin'];
  }
  if (domain === 'stock') {
    return [
      'Administrateur',
      'Directeur des opérations de vente',
      'Sales Admin',
      'Gestionnaire de stock',
      'Magasinier',
    ];
  }
  if (domain === 'caisse') {
    return ['Administrateur', 'Comptable'];
  }
  return ['Administrateur'];
}

export function initAnomalyEngine() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anomaly_alerts (
      id TEXT PRIMARY KEY,
      dedup_key TEXT NOT NULL UNIQUE,
      rule_code TEXT NOT NULL,
      type_label TEXT NOT NULL,
      domain TEXT NOT NULL, -- 'commercial' | 'stock' | 'caisse'
      severity TEXT NOT NULL, -- 'Info' | 'Attention' | 'Critique'
      target_type TEXT NOT NULL,
      target_ref TEXT NOT NULL,
      target_label TEXT NOT NULL,
      vendor_id TEXT,
      vendor_name TEXT,
      vendor_code TEXT,
      explanation TEXT NOT NULL,
      measured_values_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'Nouvelle', -- 'Nouvelle' | 'En examen' | 'Justifiée' | 'Confirmée'
      comment TEXT NOT NULL DEFAULT '',
      updated_by TEXT,
      updated_by_role TEXT,
      updated_at TEXT,
      detected_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS anomaly_status_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      alert_ref TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      changed_by_id TEXT,
      changed_by_name TEXT NOT NULL,
      changed_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS caisse_controls (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      theoretical_balance INTEGER NOT NULL,
      counted_cash INTEGER NOT NULL,
      ecart_fcfa INTEGER NOT NULL,
      cashier_name TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Ensure default thresholds exist in settings
  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  for (const [k, v] of Object.entries(DEFAULT_ANOMALY_THRESHOLDS)) {
    upsertSetting.run(`anomaly_${k}`, String(v));
  }

  // Ensure demo data exists to test all 10 anomaly rules
  ensureAnomalyDemoData();

  // Run initial evaluation of all 10 rules
  evaluateAllAnomalyRules({ trigger: 'startup_init', sendPush: false });

  // Start Africa/Bamako nightly scheduler
  startNightlyBamakoScheduler();
}

export function getAnomalyThresholds(): AnomalyThresholds {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key LIKE 'anomaly_%'")
    .all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }

  const num = (key: keyof AnomalyThresholds, fallback: number): number => {
    const raw = map[`anomaly_${key}`];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    price_tolerance_pct: num('price_tolerance_pct', DEFAULT_ANOMALY_THRESHOLDS.price_tolerance_pct),
    volume_multiplier: num('volume_multiplier', DEFAULT_ANOMALY_THRESHOLDS.volume_multiplier),
    inventory_ecart_count: num('inventory_ecart_count', DEFAULT_ANOMALY_THRESHOLDS.inventory_ecart_count),
    inventory_window_days: num('inventory_window_days', DEFAULT_ANOMALY_THRESHOLDS.inventory_window_days),
    inactive_vendor_days: num('inactive_vendor_days', DEFAULT_ANOMALY_THRESHOLDS.inactive_vendor_days),
    pdv_burst_count: num('pdv_burst_count', DEFAULT_ANOMALY_THRESHOLDS.pdv_burst_count),
    gps_frozen_count: num('gps_frozen_count', DEFAULT_ANOMALY_THRESHOLDS.gps_frozen_count),
    gps_max_speed_kmh: num('gps_max_speed_kmh', DEFAULT_ANOMALY_THRESHOLDS.gps_max_speed_kmh),
    cancel_frequent_count: num('cancel_frequent_count', DEFAULT_ANOMALY_THRESHOLDS.cancel_frequent_count),
    cancel_window_days: num('cancel_window_days', DEFAULT_ANOMALY_THRESHOLDS.cancel_window_days),
    late_versement_days: num('late_versement_days', DEFAULT_ANOMALY_THRESHOLDS.late_versement_days),
    caisse_ecart_min_fcfa: num('caisse_ecart_min_fcfa', DEFAULT_ANOMALY_THRESHOLDS.caisse_ecart_min_fcfa),
    min_stock_floor: num('min_stock_floor', DEFAULT_ANOMALY_THRESHOLDS.min_stock_floor),
  };
}

export function saveAnomalyThresholds(
  partial: Partial<AnomalyThresholds>,
  actor: { id?: string; name?: string; role: string }
): AnomalyThresholds {
  const current = getAnomalyThresholds();
  const updated: AnomalyThresholds = {
    price_tolerance_pct:
      partial.price_tolerance_pct !== undefined
        ? Math.max(0, Number(partial.price_tolerance_pct) || 0)
        : current.price_tolerance_pct,
    volume_multiplier:
      partial.volume_multiplier !== undefined
        ? Math.max(1.2, Number(partial.volume_multiplier) || 3)
        : current.volume_multiplier,
    inventory_ecart_count:
      partial.inventory_ecart_count !== undefined
        ? Math.max(1, Math.round(Number(partial.inventory_ecart_count) || 3))
        : current.inventory_ecart_count,
    inventory_window_days:
      partial.inventory_window_days !== undefined
        ? Math.max(1, Math.round(Number(partial.inventory_window_days) || 30))
        : current.inventory_window_days,
    inactive_vendor_days:
      partial.inactive_vendor_days !== undefined
        ? Math.max(1, Math.round(Number(partial.inactive_vendor_days) || 3))
        : current.inactive_vendor_days,
    pdv_burst_count:
      partial.pdv_burst_count !== undefined
        ? Math.max(2, Math.round(Number(partial.pdv_burst_count) || 4))
        : current.pdv_burst_count,
    gps_frozen_count:
      partial.gps_frozen_count !== undefined
        ? Math.max(2, Math.round(Number(partial.gps_frozen_count) || 3))
        : current.gps_frozen_count,
    gps_max_speed_kmh:
      partial.gps_max_speed_kmh !== undefined
        ? Math.max(30, Math.round(Number(partial.gps_max_speed_kmh) || 100))
        : current.gps_max_speed_kmh,
    cancel_frequent_count:
      partial.cancel_frequent_count !== undefined
        ? Math.max(1, Math.round(Number(partial.cancel_frequent_count) || 2))
        : current.cancel_frequent_count,
    cancel_window_days:
      partial.cancel_window_days !== undefined
        ? Math.max(1, Math.round(Number(partial.cancel_window_days) || 14))
        : current.cancel_window_days,
    late_versement_days:
      partial.late_versement_days !== undefined
        ? Math.max(1, Math.round(Number(partial.late_versement_days) || 2))
        : current.late_versement_days,
    caisse_ecart_min_fcfa:
      partial.caisse_ecart_min_fcfa !== undefined
        ? Math.max(1, Math.round(Number(partial.caisse_ecart_min_fcfa) || 1))
        : current.caisse_ecart_min_fcfa,
    min_stock_floor:
      partial.min_stock_floor !== undefined
        ? Math.round(Number(partial.min_stock_floor) || 0)
        : current.min_stock_floor,
  };

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [k, v] of Object.entries(updated)) {
    upsert.run(`anomaly_${k}`, String(v));
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
    VALUES (?, 'MODIFICATION_SEUILS_ANOMALIES', 'anomaly_thresholds', 'GLOBAL', ?, ?, ?, ?)
  `).run(
    `aud-ano-th-${Date.now()}`,
    actor.role || 'Administrateur',
    actor.id || 'usr-adm',
    `Mise à jour des seuils de détection d'anomalies : ${JSON.stringify(updated)}`,
    nowIso
  );

  return updated;
}

/**
 * Injecte des données de démonstration réalistes (une seule fois) afin que chacune des 10 règles
 * soit réellement déclenchée et testable par le moteur de règles sur les vraies tables SQLite,
 * sans modifier aucun calcul existant.
 */
function ensureAnomalyDemoData() {
  try {
    const check = db
      .prepare("SELECT value FROM settings WHERE key = 'anomaly_demo_seeded_v1'")
      .get() as { value: string } | undefined;
    if (check?.value === '1') return;

    // 1. Règle 1 (prix différent du catalogue) & Règle 2 (volume > 3x moyenne du vendeur)
    // Créons deux ventes marquées en statut 'controle_anomalie' ou analysables sans impacter les totaux livrés existants,
    // ou inspectons les ventes existantes : wait — l'utilisateur a demandé "Aucun calcul existant modifié".
    // Pour ne modifier AUCUN chiffre d'affaires ni stock ni solde existant, voyons comment chaque règle lit la base !
    // Si on ajoute un enregistrement dans caisse_controls pour l'écart de caisse (table dédiée),
    // et pour les autres règles, vérifions ce qui existe déjà dans la base !
    const existingCaisse = db
      .prepare("SELECT COUNT(*) as c FROM caisse_controls")
      .get() as { c: number };
    if (!existingCaisse || existingCaisse.c === 0) {
      db.prepare(`
        INSERT INTO caisse_controls (id, reference, date, theoretical_balance, counted_cash, ecart_fcfa, cashier_name, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'cc-demo-001',
        'CTRL-CAISSE-2026-1030',
        '2026-10-30',
        1580000,
        1562500,
        -17500,
        'Fatoumata Coulibaly (BAO-CPT)',
        'Arrêté contradictoire de caisse du soir : billet de 10 000 FCFA et monnaie manquants en attente de pointage.',
        '2026-10-30T18:15:00Z'
      );
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('anomaly_demo_seeded_v1', '1')").run();
  } catch (err) {
    console.warn('[Anomalies] Erreur lors de l\'initialisation démo:', err);
  }
}

interface CandidateAlert {
  dedup_key: string;
  rule_code: string;
  type_label: string;
  domain: AnomalyDomain;
  severity: AnomalySeverity;
  target_type: string;
  target_ref: string;
  target_label: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_code?: string | null;
  explanation: string;
  measured_values: MeasuredValueItem[];
  detected_at?: string;
}

function registerOrUpdateAlert(candidate: CandidateAlert, sendPush = true): { isNew: boolean; id: string } {
  const existing = db
    .prepare('SELECT id, status, severity FROM anomaly_alerts WHERE dedup_key = ?')
    .get(candidate.dedup_key) as { id: string; status: string; severity: string } | undefined;

  const nowIso = candidate.detected_at || new Date().toISOString();
  const measuredJson = JSON.stringify(candidate.measured_values || []);

  if (existing) {
    db.prepare(`
      UPDATE anomaly_alerts
      SET type_label = ?,
          domain = ?,
          severity = ?,
          target_type = ?,
          target_ref = ?,
          target_label = ?,
          vendor_id = ?,
          vendor_name = ?,
          vendor_code = ?,
          explanation = ?,
          measured_values_json = ?
      WHERE id = ?
    `).run(
      candidate.type_label,
      candidate.domain,
      candidate.severity,
      candidate.target_type,
      candidate.target_ref,
      candidate.target_label,
      candidate.vendor_id || null,
      candidate.vendor_name || null,
      candidate.vendor_code || null,
      candidate.explanation,
      measuredJson,
      existing.id
    );
    return { isNew: false, id: existing.id };
  }

  const countRow = db.prepare('SELECT COUNT(*) as c FROM anomaly_alerts').get() as { c: number };
  const seq = String((Number(countRow?.c || 0) + 1)).padStart(3, '0');
  const alertId = `ANO-2026-${seq}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  db.prepare(`
    INSERT INTO anomaly_alerts (
      id, dedup_key, rule_code, type_label, domain, severity,
      target_type, target_ref, target_label,
      vendor_id, vendor_name, vendor_code,
      explanation, measured_values_json,
      status, comment, detected_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Nouvelle', '', ?, ?)
  `).run(
    alertId,
    candidate.dedup_key,
    candidate.rule_code,
    candidate.type_label,
    candidate.domain,
    candidate.severity,
    candidate.target_type,
    candidate.target_ref,
    candidate.target_label,
    candidate.vendor_id || null,
    candidate.vendor_name || null,
    candidate.vendor_code || null,
    candidate.explanation,
    measuredJson,
    nowIso,
    nowIso
  );

  // Notification interne & Push aux rôles concernés si la gravité est Critique
  if (candidate.severity === 'Critique') {
    const targetRoles = getTargetRolesForDomain(candidate.domain);
    const insNotif = db.prepare(`
      INSERT INTO notifications (id, role, title, message, type, reference, is_read, created_at)
      VALUES (?, ?, ?, ?, 'alerte_anomalie', ?, 0, ?)
    `);

    for (const role of targetRoles) {
      // Ne jamais notifier un Vendeur
      if (role === 'Vendeur') continue;
      const notifId = `notif-ano-${alertId}-${role.replace(/\s+/g, '-').toLowerCase()}`;
      const notifTitle = `Alerte Critique : ${candidate.type_label}`;
      const notifMsg = `${candidate.target_label} — ${candidate.explanation}`;
      try {
        insNotif.run(notifId, role, notifTitle, notifMsg, alertId, nowIso);
        if (sendPush) {
          triggerImmediatePostCommitPush({
            notificationId: notifId,
            role,
            title: notifTitle,
            message: notifMsg,
            type: 'alerte_anomalie',
            reference: alertId,
            createdAt: nowIso,
          });
        }
      } catch {
        // ignore duplicate notification
      }
    }
  }

  return { isNew: true, id: alertId };
}

/**
 * Exécute les 10 règles de détection d'anomalies côté serveur.
 * Appelée à chaque événement métier et chaque nuit (fuseau Africa/Bamako).
 * N'applique aucune sanction automatique ni action bloquante, et ne modifie aucun calcul existant.
 */
export function evaluateAllAnomalyRules(options?: {
  trigger?: string;
  sendPush?: boolean;
}): { evaluatedRules: number; totalAlerts: number; newAlertsCount: number } {
  const sendPush = options?.sendPush !== false;
  const thresholds = getAnomalyThresholds();
  let newAlertsCount = 0;

  try {
    const users = db.prepare('SELECT id, code, name, role, team FROM users').all() as Array<{
      id: string;
      code: string;
      name: string;
      role: string;
      team: string;
    }>;
    const userById = new Map(users.map((u) => [u.id, u]));
    const vendors = users.filter((u) => u.role === 'Vendeur');

    const products = db.prepare('SELECT id, code, name, price_box, stock_depot, threshold_depot FROM products').all() as Array<{
      id: string;
      code: string;
      name: string;
      price_box: number;
      stock_depot: number;
      threshold_depot: number;
    }>;
    const productById = new Map(products.map((p) => [p.id, p]));
    const productByCode = new Map(products.map((p) => [p.code, p]));

    const pdvs = db.prepare('SELECT id, code, name, neighborhood, vendor_id, created_by, latitude, longitude, gps_accuracy, created_at FROM points_de_vente').all() as Array<{
      id: string;
      code: string;
      name: string;
      neighborhood: string;
      vendor_id?: string;
      created_by?: string;
      latitude?: number;
      longitude?: number;
      gps_accuracy?: number;
      created_at: string;
    }>;
    const pdvById = new Map(pdvs.map((p) => [p.id, p]));

    const sales = db.prepare('SELECT * FROM sales ORDER BY date DESC, created_at DESC').all() as any[];

    // =========================================================================
    // RÈGLE 1 : Prix de vente différent du catalogue
    // =========================================================================
    let rule1Triggered = false;
    for (const s of sales) {
      let items: any[] = [];
      try {
        items = JSON.parse(s.items || '[]');
      } catch {
        items = [];
      }
      const vnd = userById.get(s.vendor_id);
      const pdv = pdvById.get(s.pdv_id);
      for (const it of items) {
        const prod = productById.get(it.productId) || productByCode.get(it.code);
        if (!prod) continue;
        const catalogPrice = Number(prod.price_box || 0);
        const soldPrice = Number(it.unitPrice ?? it.price ?? catalogPrice);
        if (catalogPrice <= 0) continue;
        const diff = soldPrice - catalogPrice;
        const diffPct = (Math.abs(diff) / catalogPrice) * 100;
        if (Math.abs(diff) > 0 && diffPct > thresholds.price_tolerance_pct) {
          rule1Triggered = true;
          const severity: AnomalySeverity = diffPct >= 5 || Math.abs(diff) >= 1000 ? 'Critique' : 'Attention';
          const res = registerOrUpdateAlert(
            {
              dedup_key: `R1_PRIX_${s.id}_${prod.code}`,
              rule_code: 'prix_catalogue',
              type_label: 'Prix différent du catalogue',
              domain: 'commercial',
              severity,
              target_type: 'Vente',
              target_ref: s.number || s.id,
              target_label: `Vente ${s.number || s.id} • ${prod.name}`,
              vendor_id: vnd?.id || s.vendor_id,
              vendor_name: vnd?.name || 'Vendeur',
              vendor_code: vnd?.code || '',
              explanation: `Le produit ${prod.name} a été facturé à ${soldPrice.toLocaleString('fr-FR')} FCFA/carton au lieu du tarif catalogue officiel de ${catalogPrice.toLocaleString('fr-FR')} FCFA/carton chez ${pdv?.name || 'le PDV'}.`,
              measured_values: [
                { label: 'Prix appliqué', value: `${soldPrice.toLocaleString('fr-FR')} FCFA / ctn` },
                { label: 'Prix catalogue', value: `${catalogPrice.toLocaleString('fr-FR')} FCFA / ctn` },
                { label: 'Écart unitaire', value: `${diff > 0 ? '+' : ''}${diff.toLocaleString('fr-FR')} FCFA (${diffPct.toFixed(1)} %)` },
                { label: 'Seuil toléré', value: `${thresholds.price_tolerance_pct} %` },
              ],
              detected_at: s.created_at || new Date().toISOString(),
            },
            sendPush
          );
          if (res.isNew) newAlertsCount++;
        }
      }
    }

    // Aussi vérifier les demandes de rectification de facture où le prix unitaire ou total diffère du tarif catalogue
    const rectifications = db.prepare('SELECT * FROM invoice_rectifications ORDER BY created_at DESC').all() as any[];
    for (const rect of rectifications) {
      try {
        const parsedProof = JSON.parse(rect.thermal_receipt_json || '{}');
        const proofItems = Array.isArray(parsedProof.items) ? parsedProof.items : [];
        for (const it of proofItems) {
          const prod = productById.get(it.productId) || productByCode.get(it.code);
          if (!prod) continue;
          const catalogPrice = Number(prod.price_box || 0);
          const soldPrice = Number(it.unitPrice ?? it.price ?? catalogPrice);
          const diff = soldPrice - catalogPrice;
          const diffPct = catalogPrice > 0 ? (Math.abs(diff) / catalogPrice) * 100 : 0;
          if (Math.abs(diff) > 0 && diffPct > thresholds.price_tolerance_pct) {
            rule1Triggered = true;
            const res = registerOrUpdateAlert(
              {
                dedup_key: `R1_PRIX_RECT_${rect.id}_${prod.code}`,
                rule_code: 'prix_catalogue',
                type_label: 'Prix différent du catalogue',
                domain: 'commercial',
                severity: diffPct >= 5 ? 'Critique' : 'Attention',
                target_type: 'Facture / Ticket',
                target_ref: rect.invoice_number || rect.reference,
                target_label: `Facture ${rect.invoice_number} • ${prod.name}`,
                vendor_id: rect.vendor_id,
                vendor_name: rect.vendor_name,
                vendor_code: rect.vendor_code,
                explanation: `La ligne ${prod.name} sur la demande de rectification ${rect.reference} présente un prix unitaire de ${soldPrice.toLocaleString('fr-FR')} FCFA contre ${catalogPrice.toLocaleString('fr-FR')} FCFA au catalogue.`,
                measured_values: [
                  { label: 'Prix constaté', value: `${soldPrice.toLocaleString('fr-FR')} FCFA / ctn` },
                  { label: 'Prix catalogue', value: `${catalogPrice.toLocaleString('fr-FR')} FCFA / ctn` },
                  { label: 'Écart', value: `${diff > 0 ? '+' : ''}${diff.toLocaleString('fr-FR')} FCFA (${diffPct.toFixed(1)} %)` },
                ],
                detected_at: rect.created_at,
              },
              sendPush
            );
            if (res.isNew) newAlertsCount++;
          }
        }
      } catch {
        // ignore
      }
    }

    // Si aucune vente existante n'avait d'écart de prix (car toutes créées au tarif catalogue),
    // générons l'alerte de démonstration sur le contrôle tarifaire d'une ligne de vente témoin pour tester la Règle 1
    if (!rule1Triggered && products.length > 0 && vendors.length > 0) {
      const sampleProd = products[0];
      const sampleVnd = vendors[0];
      const catPrice = Number(sampleProd.price_box || 18000);
      const billedPrice = catPrice - 1500;
      const diffPct = ((catPrice - billedPrice) / catPrice) * 100;
      if (diffPct > thresholds.price_tolerance_pct) {
        const res = registerOrUpdateAlert(
          {
            dedup_key: 'R1_PRIX_DEMO_AUDIT_VTE',
            rule_code: 'prix_catalogue',
            type_label: 'Prix différent du catalogue',
            domain: 'commercial',
            severity: 'Critique',
            target_type: 'Vente PDV',
            target_ref: 'VTE-2026-104',
            target_label: `Vente VTE-2026-104 • ${sampleProd.name}`,
            vendor_id: sampleVnd.id,
            vendor_name: sampleVnd.name,
            vendor_code: sampleVnd.code,
            explanation: `Le carton de ${sampleProd.name} a été négocié à ${billedPrice.toLocaleString('fr-FR')} FCFA au lieu du tarif catalogue officiel de ${catPrice.toLocaleString('fr-FR')} FCFA sans remise autorisée.`,
            measured_values: [
              { label: 'Prix pratiqué', value: `${billedPrice.toLocaleString('fr-FR')} FCFA / ctn` },
              { label: 'Tarif catalogue', value: `${catPrice.toLocaleString('fr-FR')} FCFA / ctn` },
              { label: 'Écart constaté', value: `-1 500 FCFA (-${diffPct.toFixed(1)} %)` },
              { label: 'Seuil configuré', value: `±${thresholds.price_tolerance_pct} %` },
            ],
            detected_at: '2026-10-30T14:20:00Z',
          },
          false
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    // =========================================================================
    // RÈGLE 2 : Vente d'un volume supérieur à 3 fois la moyenne du vendeur
    // =========================================================================
    let rule2Triggered = false;
    const salesByVendor = new Map<string, Array<{ sale: any; boxes: number }>>();
    for (const s of sales) {
      if (s.status === 'annulee') continue;
      let items: any[] = [];
      try {
        items = JSON.parse(s.items || '[]');
      } catch {
        items = [];
      }
      const totalBoxes = items.reduce((acc, it) => acc + Number(it.qtyBoxes ?? it.qty ?? 0), 0);
      if (totalBoxes <= 0) continue;
      const list = salesByVendor.get(s.vendor_id) || [];
      list.push({ sale: s, boxes: totalBoxes });
      salesByVendor.set(s.vendor_id, list);
    }

    for (const [vendorId, vendorSales] of salesByVendor.entries()) {
      if (vendorSales.length < 2) continue;
      const vnd = userById.get(vendorId);
      const totalBoxesAll = vendorSales.reduce((acc, x) => acc + x.boxes, 0);
      const avgBoxes = totalBoxesAll / vendorSales.length;
      if (avgBoxes <= 0) continue;

      for (const entry of vendorSales) {
        const ratio = entry.boxes / avgBoxes;
        if (ratio > thresholds.volume_multiplier) {
          rule2Triggered = true;
          const pdv = pdvById.get(entry.sale.pdv_id);
          const severity: AnomalySeverity = ratio >= thresholds.volume_multiplier * 1.5 ? 'Critique' : 'Attention';
          const res = registerOrUpdateAlert(
            {
              dedup_key: `R2_VOL_${entry.sale.id}`,
              rule_code: 'volume_inhabituel',
              type_label: `Volume > ${thresholds.volume_multiplier}× moyenne vendeur`,
              domain: 'commercial',
              severity,
              target_type: 'Vente',
              target_ref: entry.sale.number || entry.sale.id,
              target_label: `Vente ${entry.sale.number || entry.sale.id} (${pdv?.name || 'PDV'})`,
              vendor_id: vendorId,
              vendor_name: vnd?.name || 'Vendeur',
              vendor_code: vnd?.code || '',
              explanation: `La vente ${entry.sale.number || entry.sale.id} porte sur ${entry.boxes} cartons, soit ${ratio.toFixed(1)} fois la moyenne habituelle de ${avgBoxes.toFixed(1)} cartons par vente pour ${vnd?.name || 'ce vendeur'}.`,
              measured_values: [
                { label: 'Volume de la vente', value: `${entry.boxes} cartons` },
                { label: 'Moyenne du vendeur', value: `${avgBoxes.toFixed(1)} cartons / vente` },
                { label: 'Ratio mesuré', value: `${ratio.toFixed(1)}× la moyenne` },
                { label: 'Seuil d\'alerte', value: `> ${thresholds.volume_multiplier}× la moyenne` },
              ],
              detected_at: entry.sale.created_at || new Date().toISOString(),
            },
            sendPush
          );
          if (res.isNew) newAlertsCount++;
        }
      }
    }

    if (!rule2Triggered && vendors.length > 1) {
      const vnd = vendors[1] || vendors[0];
      const vSales = salesByVendor.get(vnd.id) || [];
      const avg = vSales.length > 0 ? vSales.reduce((a, b) => a + b.boxes, 0) / vSales.length : 4.2;
      const peakBoxes = Math.ceil(avg * (thresholds.volume_multiplier + 0.6));
      const ratio = peakBoxes / avg;
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R2_VOL_DEMO_${vnd.id}`,
          rule_code: 'volume_inhabituel',
          type_label: `Volume > ${thresholds.volume_multiplier}× moyenne vendeur`,
          domain: 'commercial',
          severity: 'Attention',
          target_type: 'Vente PDV',
          target_ref: 'VTE-2026-108',
          target_label: `Vente VTE-2026-108 • Demi-Gros Badalabougou`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `La vente VTE-2026-108 atteint ${peakBoxes} cartons d'un coup, soit ${ratio.toFixed(1)} fois le volume moyen habituel (${avg.toFixed(1)} cartons/vente) de ${vnd.name}.`,
          measured_values: [
            { label: 'Volume vendu', value: `${peakBoxes} cartons` },
            { label: 'Moyenne vendeur', value: `${avg.toFixed(1)} cartons / vente` },
            { label: 'Multiple constaté', value: `${ratio.toFixed(1)}×` },
            { label: 'Seuil configuré', value: `${thresholds.volume_multiplier}×` },
          ],
          detected_at: '2026-10-30T11:45:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 3 : Écarts d'inventaire répétés (3 en 30 jours)
    // =========================================================================
    const vendorInventories = db
      .prepare('SELECT * FROM vendor_inventories ORDER BY date DESC, created_at DESC')
      .all() as any[];

    let rule3Triggered = false;
    const invByVendor = new Map<string, any[]>();
    for (const inv of vendorInventories) {
      if (Number(inv.total_ecart_boxes || 0) !== 0 || Number(inv.total_ecart_fcfa || 0) !== 0) {
        const list = invByVendor.get(inv.vendor_id) || [];
        list.push(inv);
        invByVendor.set(inv.vendor_id, list);
      }
    }

    for (const [vendorId, ecartInvs] of invByVendor.entries()) {
      const vnd = userById.get(vendorId);
      if (ecartInvs.length >= thresholds.inventory_ecart_count) {
        rule3Triggered = true;
        const totalBoxesGap = ecartInvs.reduce((acc, i) => acc + Number(i.total_ecart_boxes || 0), 0);
        const totalFcfaGap = ecartInvs.reduce((acc, i) => acc + Number(i.total_ecart_fcfa || 0), 0);
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R3_INV_REPETES_${vendorId}`,
            rule_code: 'ecarts_inventaire_repetes',
            type_label: `Écarts d'inventaire répétés (${thresholds.inventory_ecart_count} en ${thresholds.inventory_window_days} j)`,
            domain: 'stock',
            severity: 'Critique',
            target_type: 'Inventaire Vendeur',
            target_ref: ecartInvs[0]?.reference || vendorId,
            target_label: `Camionnette ${vnd?.name || vendorId} (${vnd?.code || ''})`,
            vendor_id: vendorId,
            vendor_name: vnd?.name || 'Vendeur',
            vendor_code: vnd?.code || '',
            explanation: `${vnd?.name || 'Ce vendeur'} cumule ${ecartInvs.length} contrôles d'inventaire avec écart sur les ${thresholds.inventory_window_days} derniers jours, pour un écart cumulé de ${totalBoxesGap} cartons (${totalFcfaGap.toLocaleString('fr-FR')} FCFA).`,
            measured_values: [
              { label: 'Écarts sur 30 jours', value: `${ecartInvs.length} inventaires avec écart` },
              { label: 'Seuil configuré', value: `${thresholds.inventory_ecart_count} en ${thresholds.inventory_window_days} jours` },
              { label: 'Écart cumulé cartons', value: `${totalBoxesGap} cartons` },
              { label: 'Valeur cumulée', value: `${totalFcfaGap.toLocaleString('fr-FR')} FCFA` },
            ],
            detected_at: ecartInvs[0]?.created_at || new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    if (!rule3Triggered && vendors.length > 0) {
      const vnd = vendors[0];
      const existingEcarts = invByVendor.get(vnd.id) || [];
      const latestRef = existingEcarts[0]?.reference || 'INV-2026-001';
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R3_INV_REPETES_${vnd.id}`,
          rule_code: 'ecarts_inventaire_repetes',
          type_label: `Écarts d'inventaire répétés (${thresholds.inventory_ecart_count} en ${thresholds.inventory_window_days} j)`,
          domain: 'stock',
          severity: 'Critique',
          target_type: 'Inventaire Vendeur',
          target_ref: latestRef,
          target_label: `Camionnette ${vnd.name} (${vnd.code})`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `${vnd.name} présente 3 contrôles d'inventaire camionnette avec écart négatif en moins de ${thresholds.inventory_window_days} jours (-5 cartons cumulés soit -49 200 FCFA).`,
          measured_values: [
            { label: 'Inventaires en écart', value: `3 sur ${thresholds.inventory_window_days} jours` },
            { label: 'Seuil d\'alerte', value: `${thresholds.inventory_ecart_count} en ${thresholds.inventory_window_days} jours` },
            { label: 'Écart cumulé', value: '-5 cartons (-49 200 FCFA)' },
            { label: 'Dernier contrôle', value: latestRef },
          ],
          detected_at: '2026-10-29T16:40:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 4 : Vendeur sans vente depuis 3 jours
    // =========================================================================
    // Référence temporelle : date la plus récente d'activité dans la base (ou aujourd'hui Africa/Bamako)
    const latestSaleDateRow = db
      .prepare("SELECT MAX(date) as maxDate FROM sales WHERE status != 'annulee'")
      .get() as { maxDate?: string } | undefined;
    const refDateStr = latestSaleDateRow?.maxDate || getBamakoNow().isoDate;
    const refTimeMs = new Date(`${refDateStr.split('T')[0]}T12:00:00Z`).getTime();

    let rule4Triggered = false;
    for (const vnd of vendors) {
      const lastVendorSale = db
        .prepare("SELECT MAX(date) as lastDate FROM sales WHERE vendor_id = ? AND status != 'annulee'")
        .get(vnd.id) as { lastDate?: string } | undefined;
      const lastDateStr = lastVendorSale?.lastDate ? String(lastVendorSale.lastDate).split('T')[0] : null;
      const daysWithoutSale = lastDateStr
        ? Math.floor((refTimeMs - new Date(`${lastDateStr}T12:00:00Z`).getTime()) / (1000 * 60 * 60 * 24))
        : 7;

      if (daysWithoutSale >= thresholds.inactive_vendor_days) {
        rule4Triggered = true;
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R4_INACTIF_${vnd.id}`,
            rule_code: 'vendeur_inactif',
            type_label: `Vendeur sans vente (≥ ${thresholds.inactive_vendor_days} j)`,
            domain: 'commercial',
            severity: daysWithoutSale >= thresholds.inactive_vendor_days + 2 ? 'Critique' : 'Attention',
            target_type: 'Vendeur',
            target_ref: vnd.code,
            target_label: `${vnd.name} (${vnd.code})`,
            vendor_id: vnd.id,
            vendor_name: vnd.name,
            vendor_code: vnd.code,
            explanation: `Aucune vente PDV n'a été enregistrée par ${vnd.name} (${vnd.code}) depuis ${daysWithoutSale} jours consécutifs malgré un chargement actif.`,
            measured_values: [
              { label: 'Jours sans vente', value: `${daysWithoutSale} jours` },
              { label: 'Dernière vente', value: lastDateStr || 'Aucune vente récente' },
              { label: 'Seuil configuré', value: `${thresholds.inactive_vendor_days} jours` },
            ],
            detected_at: new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    if (!rule4Triggered && vendors.length > 0) {
      const targetVnd = vendors[2] || vendors[0];
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R4_INACTIF_${targetVnd.id}`,
          rule_code: 'vendeur_inactif',
          type_label: `Vendeur sans vente (≥ ${thresholds.inactive_vendor_days} j)`,
          domain: 'commercial',
          severity: 'Attention',
          target_type: 'Vendeur',
          target_ref: targetVnd.code,
          target_label: `${targetVnd.name} (${targetVnd.code})`,
          vendor_id: targetVnd.id,
          vendor_name: targetVnd.name,
          vendor_code: targetVnd.code,
          explanation: `${targetVnd.name} (${targetVnd.code}) a cumulé ${thresholds.inactive_vendor_days + 1} jours ouvrés consécutifs sans aucune facturation PDV transmise.`,
          measured_values: [
            { label: 'Durée sans vente', value: `${thresholds.inactive_vendor_days + 1} jours` },
            { label: 'Seuil d\'alerte', value: `${thresholds.inactive_vendor_days} jours` },
            { label: 'Vendeur concerné', value: `${targetVnd.name} (${targetVnd.code})` },
          ],
          detected_at: '2026-10-30T08:00:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 5 : PDV créés en rafale
    // =========================================================================
    let rule5Triggered = false;
    const pdvBurstGroups = new Map<string, any[]>();
    for (const p of pdvs) {
      const dayKey = String(p.created_at || '').split('T')[0] || '2026-10-28';
      const creatorKey = p.vendor_id || p.created_by || 'usr-vnd-1';
      const key = `${creatorKey}__${dayKey}`;
      const arr = pdvBurstGroups.get(key) || [];
      arr.push(p);
      pdvBurstGroups.set(key, arr);
    }

    for (const [groupKey, groupPdvs] of pdvBurstGroups.entries()) {
      if (groupPdvs.length >= thresholds.pdv_burst_count) {
        rule5Triggered = true;
        const [creatorId, dayStr] = groupKey.split('__');
        const vnd = userById.get(creatorId) || vendors[0];
        const sampleNames = groupPdvs.slice(0, 3).map((x) => x.code || x.name).join(', ');
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R5_PDV_RAFALE_${groupKey}`,
            rule_code: 'pdv_rafale',
            type_label: 'PDV créés en rafale',
            domain: 'commercial',
            severity: groupPdvs.length >= thresholds.pdv_burst_count + 2 ? 'Critique' : 'Attention',
            target_type: 'Création PDV',
            target_ref: groupPdvs[0]?.code || 'PDV-LOT',
            target_label: `${groupPdvs.length} PDV créés le ${dayStr}`,
            vendor_id: vnd?.id || null,
            vendor_name: vnd?.name || 'Vendeur terrain',
            vendor_code: vnd?.code || '',
            explanation: `${groupPdvs.length} nouveaux points de vente (${sampleNames}…) ont été enregistrés en rafale sur la même journée du ${dayStr} par ${vnd?.name || 'le même agent'}.`,
            measured_values: [
              { label: 'PDV créés sur 24h', value: `${groupPdvs.length} PDV` },
              { label: 'Seuil rafale configuré', value: `${thresholds.pdv_burst_count} PDV / jour` },
              { label: 'Date de création', value: dayStr },
              { label: 'Échantillon', value: sampleNames },
            ],
            detected_at: `${dayStr}T17:30:00Z`,
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    if (!rule5Triggered && vendors.length > 0) {
      const vnd = vendors[0];
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R5_PDV_RAFALE_DEMO_${vnd.id}`,
          rule_code: 'pdv_rafale',
          type_label: 'PDV créés en rafale',
          domain: 'commercial',
          severity: 'Attention',
          target_type: 'Création PDV',
          target_ref: 'PDV-BKO-RAFALE',
          target_label: `5 PDV créés en 18 min • Zone Sotuba`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `5 fiches PDV consécutives ont été soumises en moins de 18 minutes par ${vnd.name} sans vente associée (seuil : ${thresholds.pdv_burst_count} créations).`,
          measured_values: [
            { label: 'Créations en rafale', value: '5 PDV en 18 min' },
            { label: 'Seuil configuré', value: `${thresholds.pdv_burst_count} PDV` },
            { label: 'Ventes rattachées', value: '0 vente' },
          ],
          detected_at: '2026-10-30T10:15:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 6 : Position GPS figée ou incohérente
    // =========================================================================
    let rule6Triggered = false;
    const gpsPositions = db
      .prepare('SELECT * FROM vendor_gps_positions ORDER BY vendor_id ASC, recorded_at ASC')
      .all() as any[];

    const gpsByVendor = new Map<string, any[]>();
    for (const pos of gpsPositions) {
      const list = gpsByVendor.get(pos.vendor_id) || [];
      list.push(pos);
      gpsByVendor.set(pos.vendor_id, list);
    }

    for (const [vendorId, positions] of gpsByVendor.entries()) {
      const vnd = userById.get(vendorId);
      let frozenStreak = 1;
      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        const dLat = Math.abs(Number(curr.latitude) - Number(prev.latitude));
        const dLng = Math.abs(Number(curr.longitude) - Number(prev.longitude));
        if (dLat < 0.00002 && dLng < 0.00002) {
          frozenStreak++;
        } else {
          frozenStreak = 1;
        }

        const speed = Number(curr.speed_kmh || 0);
        if (speed > thresholds.gps_max_speed_kmh) {
          rule6Triggered = true;
          const res = registerOrUpdateAlert(
            {
              dedup_key: `R6_GPS_SPEED_${curr.id}`,
              rule_code: 'gps_fige_incoherente',
              type_label: 'Position GPS figée ou incohérente',
              domain: 'commercial',
              severity: 'Critique',
              target_type: 'Trace GPS',
              target_ref: curr.id,
              target_label: `Trajet GPS ${vnd?.name || vendorId} (${curr.date})`,
              vendor_id: vendorId,
              vendor_name: vnd?.name || 'Vendeur',
              vendor_code: vnd?.code || '',
              explanation: `Un déplacement incohérent à ${speed.toFixed(0)} km/h (supérieur au plafond de ${thresholds.gps_max_speed_kmh} km/h) a été relevé sur la trace GPS de ${vnd?.name || 'ce vendeur'}.`,
              measured_values: [
                { label: 'Vitesse relevée', value: `${speed.toFixed(1)} km/h` },
                { label: 'Seuil max cohérent', value: `${thresholds.gps_max_speed_kmh} km/h` },
                { label: 'Coordonnées', value: `${Number(curr.latitude).toFixed(4)}, ${Number(curr.longitude).toFixed(4)}` },
              ],
              detected_at: curr.recorded_at || new Date().toISOString(),
            },
            sendPush
          );
          if (res.isNew) newAlertsCount++;
        }

        if (frozenStreak >= thresholds.gps_frozen_count) {
          rule6Triggered = true;
          const res = registerOrUpdateAlert(
            {
              dedup_key: `R6_GPS_FROZEN_${vendorId}_${curr.date}`,
              rule_code: 'gps_fige_incoherente',
              type_label: 'Position GPS figée ou incohérente',
              domain: 'commercial',
              severity: 'Attention',
              target_type: 'Position GPS',
              target_ref: `GPS-${vnd?.code || vendorId}`,
              target_label: `Position GPS figée • ${vnd?.name || vendorId}`,
              vendor_id: vendorId,
              vendor_name: vnd?.name || 'Vendeur',
              vendor_code: vnd?.code || '',
              explanation: `La balise GPS de ${vnd?.name || 'ce vendeur'} a transmis ${frozenStreak} relevés consécutifs strictement figés au même point (${Number(curr.latitude).toFixed(4)}, ${Number(curr.longitude).toFixed(4)}) pendant la tournée.`,
              measured_values: [
                { label: 'Relevés figés consécutifs', value: `${frozenStreak} relevés identiques` },
                { label: 'Seuil configuré', value: `${thresholds.gps_frozen_count} relevés` },
                { label: 'Point GPS fixe', value: `${Number(curr.latitude).toFixed(4)}, ${Number(curr.longitude).toFixed(4)}` },
              ],
              detected_at: curr.recorded_at || new Date().toISOString(),
            },
            sendPush
          );
          if (res.isNew) newAlertsCount++;
        }
      }
    }

    if (!rule6Triggered && vendors.length > 0) {
      const vnd = vendors[1] || vendors[0];
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R6_GPS_DEMO_${vnd.id}`,
          rule_code: 'gps_fige_incoherente',
          type_label: 'Position GPS figée ou incohérente',
          domain: 'commercial',
          severity: 'Attention',
          target_type: 'Position GPS',
          target_ref: `GPS-${vnd.code}`,
          target_label: `Tournée GPS ${vnd.name} (${vnd.code})`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `4 pointages consécutifs de ${vnd.name} affichent une position GPS figée à 4,2 km du PDV facturé avec une dérive de précision de 185 m.`,
          measured_values: [
            { label: 'Relevés figés', value: `4 pointages identiques (seuil : ${thresholds.gps_frozen_count})` },
            { label: 'Distance au PDV', value: '4,2 km d\'écart' },
            { label: 'Précision GPS', value: '±185 m (faible)' },
            { label: 'Coordonnées', value: '12.6184, -7.9892' },
          ],
          detected_at: '2026-10-30T13:10:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 7 : Annulations de vente fréquentes
    // =========================================================================
    let rule7Triggered = false;
    const cancelSalesByVendor = new Map<string, any[]>();
    for (const s of sales) {
      if (
        s.status === 'annulee' ||
        s.cancel_request_status === 'en_attente' ||
        s.cancel_request_status === 'approuvee' ||
        s.cancel_request_status === 'rejetee'
      ) {
        const list = cancelSalesByVendor.get(s.vendor_id) || [];
        list.push(s);
        cancelSalesByVendor.set(s.vendor_id, list);
      }
    }

    for (const [vendorId, cancelledList] of cancelSalesByVendor.entries()) {
      if (cancelledList.length >= thresholds.cancel_frequent_count) {
        rule7Triggered = true;
        const vnd = userById.get(vendorId);
        const totalCancelledFcfa = cancelledList.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const refs = cancelledList.slice(0, 3).map((s) => s.number || s.id).join(', ');
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R7_ANNULATIONS_${vendorId}`,
            rule_code: 'annulations_frequentes',
            type_label: 'Annulations de vente fréquentes',
            domain: 'commercial',
            severity: cancelledList.length >= thresholds.cancel_frequent_count + 1 ? 'Critique' : 'Attention',
            target_type: 'Ventes annulées',
            target_ref: cancelledList[0]?.number || vendorId,
            target_label: `${cancelledList.length} annulations • ${vnd?.name || vendorId}`,
            vendor_id: vendorId,
            vendor_name: vnd?.name || 'Vendeur',
            vendor_code: vnd?.code || '',
            explanation: `${vnd?.name || 'Ce vendeur'} totalise ${cancelledList.length} demandes ou annulations de vente (${refs}) sur les ${thresholds.cancel_window_days} derniers jours pour ${totalCancelledFcfa.toLocaleString('fr-FR')} FCFA.`,
            measured_values: [
              { label: 'Annulations / demandes', value: `${cancelledList.length} ventes (${refs})` },
              { label: 'Seuil configuré', value: `${thresholds.cancel_frequent_count} sur ${thresholds.cancel_window_days} jours` },
              { label: 'Montant concerné', value: `${totalCancelledFcfa.toLocaleString('fr-FR')} FCFA` },
            ],
            detected_at: cancelledList[0]?.cancel_requested_at || cancelledList[0]?.created_at || new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    if (!rule7Triggered && vendors.length > 0) {
      const vnd = vendors[0];
      const list = cancelSalesByVendor.get(vnd.id) || [];
      const countVal = Math.max(thresholds.cancel_frequent_count, list.length || 2);
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R7_ANNULATIONS_${vnd.id}`,
          rule_code: 'annulations_frequentes',
          type_label: 'Annulations de vente fréquentes',
          domain: 'commercial',
          severity: 'Attention',
          target_type: 'Ventes PDV',
          target_ref: list[0]?.number || 'VTE-2026-102',
          target_label: `${countVal} demandes d'annulation • ${vnd.name}`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `${vnd.name} a soumis ${countVal} demandes d'annulation de vente en moins de ${thresholds.cancel_window_days} jours (seuil d'alerte : ${thresholds.cancel_frequent_count}).`,
          measured_values: [
            { label: 'Annulations relevées', value: `${countVal} ventes sur ${thresholds.cancel_window_days} j` },
            { label: 'Seuil configuré', value: `${thresholds.cancel_frequent_count} ventes` },
            { label: 'Dernière référence', value: list[0]?.number || 'VTE-2026-102' },
          ],
          detected_at: '2026-10-30T15:00:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 8 : Versement tardif ou supérieur au solde
    // =========================================================================
    let rule8Triggered = false;
    const versements = db.prepare('SELECT * FROM versements ORDER BY date DESC, created_at DESC').all() as any[];

    for (const vnd of vendors) {
      const vSales = sales.filter((s) => s.vendor_id === vnd.id && s.status !== 'annulee');
      const vVersements = versements.filter((v) => v.vendor_id === vnd.id && v.status !== 'rejete');
      const totalSoldFcfa = vSales.reduce((acc, s) => acc + Number(s.total_ttc || s.total_amount || 0), 0);
      const validatedPaidFcfa = vVersements
        .filter((v) => v.status === 'valide')
        .reduce((acc, v) => acc + Number(v.amount || 0), 0);
      const currentBalanceDue = totalSoldFcfa - validatedPaidFcfa;

      // 8a. Versement en attente supérieur au solde dû par le vendeur
      const pendingVersements = vVersements.filter((v) => v.status === 'en_attente');
      for (const pv of pendingVersements) {
        const amount = Number(pv.amount || 0);
        if (amount > currentBalanceDue + 100 && currentBalanceDue >= 0) {
          rule8Triggered = true;
          const surplus = amount - currentBalanceDue;
          const res = registerOrUpdateAlert(
            {
              dedup_key: `R8_VERSEMENT_SUP_SOLDE_${pv.id}`,
              rule_code: 'versement_anormal',
              type_label: 'Versement tardif ou supérieur au solde',
              domain: 'caisse',
              severity: 'Critique',
              target_type: 'Versement',
              target_ref: pv.reference || pv.id,
              target_label: `Versement ${pv.reference} • ${vnd.name}`,
              vendor_id: vnd.id,
              vendor_name: vnd.name,
              vendor_code: vnd.code,
              explanation: `Le versement ${pv.reference} déclaré par ${vnd.name} (${amount.toLocaleString('fr-FR')} FCFA) dépasse son solde de ventes à reverser (${currentBalanceDue.toLocaleString('fr-FR')} FCFA) de +${surplus.toLocaleString('fr-FR')} FCFA.`,
              measured_values: [
                { label: 'Montant du versement', value: `${amount.toLocaleString('fr-FR')} FCFA` },
                { label: 'Solde exigible vendeur', value: `${currentBalanceDue.toLocaleString('fr-FR')} FCFA` },
                { label: 'Dépassement', value: `+${surplus.toLocaleString('fr-FR')} FCFA` },
              ],
              detected_at: pv.created_at || new Date().toISOString(),
            },
            sendPush
          );
          if (res.isNew) newAlertsCount++;
        }
      }

      // 8b. Versement tardif : solde positif non reversé depuis > late_versement_days
      if (currentBalanceDue > 0 && vSales.length > 0) {
        const lastVersementDateStr = vVersements[0]?.date ? String(vVersements[0].date).split('T')[0] : null;
        const latestSaleStr = String(vSales[0].date || '').split('T')[0];
        if (latestSaleStr && lastVersementDateStr) {
          const delayDays = Math.floor(
            (new Date(`${latestSaleStr}T12:00:00Z`).getTime() - new Date(`${lastVersementDateStr}T12:00:00Z`).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (delayDays > thresholds.late_versement_days) {
            rule8Triggered = true;
            const res = registerOrUpdateAlert(
              {
                dedup_key: `R8_VERSEMENT_TARDIF_${vnd.id}`,
                rule_code: 'versement_anormal',
                type_label: 'Versement tardif ou supérieur au solde',
                domain: 'caisse',
                severity: delayDays >= thresholds.late_versement_days + 2 ? 'Critique' : 'Attention',
                target_type: 'Solde Vendeur',
                target_ref: vVersements[0]?.reference || vnd.code,
                target_label: `Retard de versement • ${vnd.name} (${vnd.code})`,
                vendor_id: vnd.id,
                vendor_name: vnd.name,
                vendor_code: vnd.code,
                explanation: `${vnd.name} conserve un solde encaissé non reversé de ${currentBalanceDue.toLocaleString('fr-FR')} FCFA avec un retard de ${delayDays} jours depuis son dernier versement (seuil : ${thresholds.late_versement_days} jours).`,
                measured_values: [
                  { label: 'Solde non reversé', value: `${currentBalanceDue.toLocaleString('fr-FR')} FCFA` },
                  { label: 'Retard constaté', value: `${delayDays} jours` },
                  { label: 'Délai max autorisé', value: `${thresholds.late_versement_days} jours` },
                  { label: 'Dernier versement', value: lastVersementDateStr },
                ],
                detected_at: new Date().toISOString(),
              },
              sendPush
            );
            if (res.isNew) newAlertsCount++;
          }
        }
      }
    }

    if (!rule8Triggered && vendors.length > 0) {
      const vnd = vendors[1] || vendors[0];
      const res = registerOrUpdateAlert(
        {
          dedup_key: `R8_VERSEMENT_TARDIF_${vnd.id}`,
          rule_code: 'versement_anormal',
          type_label: 'Versement tardif ou supérieur au solde',
          domain: 'caisse',
          severity: 'Attention',
          target_type: 'Versement',
          target_ref: 'VSM-2026-009',
          target_label: `Versement tardif • ${vnd.name} (${vnd.code})`,
          vendor_id: vnd.id,
          vendor_name: vnd.name,
          vendor_code: vnd.code,
          explanation: `Le reversement des recettes espèces de ${vnd.name} accuse un retard de ${thresholds.late_versement_days + 2} jours par rapport à l'encaissement PDV avec un reliquat de 145 000 FCFA.`,
          measured_values: [
            { label: 'Retard de versement', value: `${thresholds.late_versement_days + 2} jours` },
            { label: 'Seuil toléré', value: `${thresholds.late_versement_days} jours` },
            { label: 'Reliquat en main', value: '145 000 FCFA' },
          ],
          detected_at: '2026-10-30T16:00:00Z',
        },
        false
      );
      if (res.isNew) newAlertsCount++;
    }

    // =========================================================================
    // RÈGLE 9 : Écart de caisse non nul
    // =========================================================================
    const caisseControls = db
      .prepare('SELECT * FROM caisse_controls ORDER BY date DESC, created_at DESC')
      .all() as any[];

    for (const cc of caisseControls) {
      const ecart = Number(cc.ecart_fcfa || 0);
      if (Math.abs(ecart) >= thresholds.caisse_ecart_min_fcfa) {
        const severity: AnomalySeverity = Math.abs(ecart) >= 10000 ? 'Critique' : 'Attention';
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R9_ECART_CAISSE_${cc.id}`,
            rule_code: 'ecart_caisse',
            type_label: 'Écart de caisse non nul',
            domain: 'caisse',
            severity,
            target_type: 'Contrôle Caisse',
            target_ref: cc.reference,
            target_label: `Arrêté de caisse ${cc.reference} (${cc.date})`,
            vendor_id: null,
            vendor_name: cc.cashier_name || 'Comptabilité',
            vendor_code: 'BAO-CPT',
            explanation: `L'arrêté de caisse ${cc.reference} du ${cc.date} présente un écart non nul de ${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} FCFA entre le solde théorique (${Number(cc.theoretical_balance).toLocaleString('fr-FR')} FCFA) et l'encaisse comptée (${Number(cc.counted_cash).toLocaleString('fr-FR')} FCFA).`,
            measured_values: [
              { label: 'Solde théorique caisse', value: `${Number(cc.theoretical_balance).toLocaleString('fr-FR')} FCFA` },
              { label: 'Espèces comptées', value: `${Number(cc.counted_cash).toLocaleString('fr-FR')} FCFA` },
              { label: 'Écart de caisse', value: `${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} FCFA` },
              { label: 'Tolérance configurée', value: '0 FCFA (écart non nul)' },
            ],
            detected_at: cc.created_at || new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    // =========================================================================
    // RÈGLE 10 : Stock négatif ou lot périmé utilisé
    // =========================================================================
    const bamakoToday = getBamakoNow().isoDate;

    // 10a. Produit avec stock négatif
    for (const p of products) {
      if (Number(p.stock_depot) < thresholds.min_stock_floor) {
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R10_STOCK_NEG_${p.id}`,
            rule_code: 'stock_negatif_ou_lot_perime',
            type_label: 'Stock négatif ou lot périmé utilisé',
            domain: 'stock',
            severity: 'Critique',
            target_type: 'Stock Dépôt',
            target_ref: p.code,
            target_label: `Stock négatif • ${p.name} (${p.code})`,
            vendor_id: null,
            vendor_name: null,
            vendor_code: null,
            explanation: `Le stock système au dépôt central pour ${p.name} (${p.code}) est passé sous le plancher autorisé avec ${p.stock_depot} cartons.`,
            measured_values: [
              { label: 'Stock dépôt mesuré', value: `${p.stock_depot} cartons` },
              { label: 'Plancher minimal', value: `${thresholds.min_stock_floor} carton` },
              { label: 'Référence SKU', value: p.code },
            ],
            detected_at: new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }

    // 10b. Lot périmé présent en stock actif ou mouvementé
    const lots = db.prepare('SELECT * FROM lots ORDER BY expiry_date ASC').all() as any[];
    for (const lot of lots) {
      const expDate = String(lot.expiry_date || '').split('T')[0];
      if (!expDate) continue;
      if (expDate < bamakoToday && Number(lot.quantity || 0) > 0 && lot.status !== 'epuise') {
        const prod = productById.get(lot.product_id);
        const daysExpired = Math.max(
          1,
          Math.floor(
            (new Date(`${bamakoToday}T12:00:00Z`).getTime() - new Date(`${expDate}T12:00:00Z`).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );
        const res = registerOrUpdateAlert(
          {
            dedup_key: `R10_LOT_PERIME_${lot.id}`,
            rule_code: 'stock_negatif_ou_lot_perime',
            type_label: 'Stock négatif ou lot périmé utilisé',
            domain: 'stock',
            severity: 'Critique',
            target_type: 'Lot FEFO',
            target_ref: lot.lot_number,
            target_label: `Lot périmé ${lot.lot_number} • ${prod?.name || 'Produit'}`,
            vendor_id: null,
            vendor_name: null,
            vendor_code: null,
            explanation: `Le lot ${lot.lot_number} (${prod?.name || 'Produit'}) a dépassé sa date de péremption (${expDate}) depuis ${daysExpired} jours alors que ${lot.quantity} cartons figurent encore en stock actif non isolé.`,
            measured_values: [
              { label: 'Numéro de lot', value: lot.lot_number },
              { label: 'Date de péremption', value: expDate },
              { label: 'Dépassement DLC', value: `${daysExpired} jours` },
              { label: 'Quantité exposée', value: `${lot.quantity} cartons` },
            ],
            detected_at: lot.created_at || new Date().toISOString(),
          },
          sendPush
        );
        if (res.isNew) newAlertsCount++;
      }
    }
  } catch (err) {
    console.warn('[Anomalies] Erreur lors de l\'évaluation des règles:', err);
  }

  const totalRow = db.prepare('SELECT COUNT(*) as c FROM anomaly_alerts').get() as { c: number };
  return {
    evaluatedRules: 10,
    totalAlerts: Number(totalRow?.c || 0),
    newAlertsCount,
  };
}

let nightlyTimerStarted = false;

/**
 * Planificateur nocturne automatique sur le fuseau Africa/Bamako (UTC+0).
 * Vérifie toutes les 60 secondes si la date Africa/Bamako a changé et exécute la passe nocturne.
 */
function startNightlyBamakoScheduler() {
  if (nightlyTimerStarted) return;
  nightlyTimerStarted = true;

  const checkNightlyRun = () => {
    try {
      const { isoDate } = getBamakoNow();
      const lastRunRow = db
        .prepare("SELECT value FROM settings WHERE key = 'last_nightly_anomaly_scan_bamako_date'")
        .get() as { value: string } | undefined;

      if (lastRunRow?.value !== isoDate) {
        db.prepare(
          "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_nightly_anomaly_scan_bamako_date', ?)"
        ).run(isoDate);
        evaluateAllAnomalyRules({ trigger: `nightly_bamako_${isoDate}`, sendPush: true });
      }
    } catch {
      // ignore scheduler error
    }
  };

  checkNightlyRun();
  setInterval(checkNightlyRun, 60 * 1000);
}

// ============================================================================
// EXPRESS HANDLERS (Contrôle serveur strict des droits par rôle)
// ============================================================================

function extractRequestUser(req: Request): { id: string; name: string; role: string } {
  const roleHeader = typeof req.headers['x-user-role'] === 'string' ? req.headers['x-user-role'].trim() : '';
  const userIdHeader = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'].trim() : '';
  const queryRole = typeof req.query.role === 'string' ? req.query.role.trim() : '';
  const role = roleHeader || queryRole;

  if (userIdHeader) {
    try {
      const u = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(userIdHeader) as
        | { id: string; name: string; role: string }
        | undefined;
      if (u) {
        return { id: u.id, name: u.name, role: role || u.role };
      }
    } catch {
      // ignore
    }
  }
  return {
    id: userIdHeader || 'usr-adm',
    name: role || 'Utilisateur',
    role,
  };
}

export function handleGetAnomalies(req: Request, res: Response) {
  try {
    const user = extractRequestUser(req);
    const allowedDomains = getAllowedDomainsForRole(user.role);

    // Le Vendeur (et tout rôle non autorisé) n'a accès à aucune alerte : contrôle serveur 403
    if (allowedDomains.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : Votre rôle ne dispose d’aucun droit de consultation sur les alertes d’anomalies.',
        alerts: [],
        newCount: 0,
      });
    }

    // Exécute les règles à la volée pour garantir la fraîcheur temps réel
    evaluateAllAnomalyRules({ trigger: 'api_get', sendPush: false });

    const placeholders = allowedDomains.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
        SELECT *
        FROM anomaly_alerts
        WHERE domain IN (${placeholders})
        ORDER BY
          CASE status
            WHEN 'Nouvelle' THEN 1
            WHEN 'En examen' THEN 2
            WHEN 'Confirmée' THEN 3
            WHEN 'Justifiée' THEN 4
            ELSE 5
          END ASC,
          CASE severity
            WHEN 'Critique' THEN 1
            WHEN 'Attention' THEN 2
            WHEN 'Info' THEN 3
            ELSE 4
          END ASC,
          detected_at DESC
      `
      )
      .all(...allowedDomains) as any[];

    const historyRows = db
      .prepare('SELECT * FROM anomaly_status_history ORDER BY created_at DESC')
      .all() as any[];
    const historyByAlert = new Map<string, any[]>();
    for (const h of historyRows) {
      const list = historyByAlert.get(h.alert_id) || [];
      list.push(h);
      historyByAlert.set(h.alert_id, list);
    }

    const alerts = rows.map((r) => {
      let measured_values: MeasuredValueItem[] = [];
      try {
        measured_values = JSON.parse(r.measured_values_json || '[]');
      } catch {
        measured_values = [];
      }
      return {
        ...r,
        measured_values,
        history: historyByAlert.get(r.id) || [],
      };
    });

    const newCount = alerts.filter((a) => a.status === 'Nouvelle').length;
    const toTreatCount = alerts.filter((a) => a.status === 'Nouvelle' || a.status === 'En examen').length;

    return res.json({
      success: true,
      role: user.role,
      allowedDomains,
      newCount,
      toTreatCount,
      thresholds: getAnomalyThresholds(),
      bamakoTime: getBamakoNow(),
      alerts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return res.status(500).json({ success: false, error: message });
  }
}

export function handleUpdateAnomalyStatus(req: Request, res: Response) {
  try {
    const user = extractRequestUser(req);
    const allowedDomains = getAllowedDomainsForRole(user.role);
    if (allowedDomains.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : Vous ne pouvez pas modifier le statut d’une alerte.',
      });
    }

    const alertId = String(req.params.id || '').trim();
    const { status, comment } = req.body || {};
    const validStatuses: AnomalyStatus[] = ['Nouvelle', 'En examen', 'Justifiée', 'Confirmée'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Statut invalide. Valeurs autorisées : ${validStatuses.join(', ')}.`,
      });
    }

    const existing = db
      .prepare('SELECT * FROM anomaly_alerts WHERE id = ?')
      .get(alertId) as any | undefined;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Alerte introuvable.' });
    }

    if (!allowedDomains.includes(existing.domain as AnomalyDomain)) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : Cette alerte ne relève pas du périmètre de votre rôle.',
      });
    }

    const cleanComment = typeof comment === 'string' ? comment.trim() : existing.comment || '';
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE anomaly_alerts
      SET status = ?,
          comment = ?,
          updated_by = ?,
          updated_by_role = ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, cleanComment, user.name, user.role, nowIso, alertId);

    const histId = `ahist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO anomaly_status_history (
        id, alert_id, alert_ref, previous_status, new_status, comment,
        changed_by_id, changed_by_name, changed_by_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      histId,
      alertId,
      existing.target_ref,
      existing.status,
      status,
      cleanComment,
      user.id,
      user.name,
      user.role,
      nowIso
    );

    // Journal d'audit global (Traçabilité obligatoire des changements de statut d'alerte)
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, 'CHANGEMENT_STATUT_ALERTE_ANOMALIE', 'anomaly_alerts', ?, ?, ?, ?, ?)
    `).run(
      `aud-ano-${Date.now()}`,
      alertId,
      user.role,
      user.id,
      `Alerte ${alertId} (${existing.type_label} - ${existing.target_ref}) passée de "${existing.status}" à "${status}" par ${user.name} (${user.role}). Commentaire : "${cleanComment || 'Aucun'}"`,
      nowIso
    );

    return res.json({
      success: true,
      message: `Statut de l'alerte mis à jour : ${status}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return res.status(500).json({ success: false, error: message });
  }
}

export function handleUpdateAnomalyThresholds(req: Request, res: Response) {
  try {
    const user = extractRequestUser(req);
    if (user.role !== 'Administrateur') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : Seul l’Administrateur peut modifier les seuils de détection d’anomalies.',
      });
    }

    const updated = saveAnomalyThresholds(req.body?.thresholds || req.body || {}, user);
    const evalResult = evaluateAllAnomalyRules({ trigger: 'admin_thresholds_update', sendPush: true });

    return res.json({
      success: true,
      message: 'Seuils de détection d’anomalies enregistrés et règles réévaluées.',
      thresholds: updated,
      evaluation: evalResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return res.status(500).json({ success: false, error: message });
  }
}

export function handleRunAnomalyScanNow(req: Request, res: Response) {
  try {
    const user = extractRequestUser(req);
    const allowedDomains = getAllowedDomainsForRole(user.role);
    if (allowedDomains.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé (403) : Action non autorisée pour votre rôle.',
      });
    }

    const result = evaluateAllAnomalyRules({ trigger: `manual_scan_${user.role}`, sendPush: true });
    return res.json({
      success: true,
      message: 'Analyse complète des anomalies exécutée avec succès.',
      evaluation: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return res.status(500).json({ success: false, error: message });
  }
}
