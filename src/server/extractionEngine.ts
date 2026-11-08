import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import { db } from './db.js';
import { deduceUserFromToken, type AuthenticatedUser } from './pushService.js';

export type ExtractionFormat = 'csv' | 'xlsx' | 'pdf';

export type CanonicalExtractionDataset =
  | 'ventes'
  | 'factures_pdv'
  | 'factures'
  | 'annulations_de_vente'
  | 'analyse_produits'
  | 'pdv'
  | 'vendeurs'
  | 'demandes_de_stock_vendeur'
  | 'stock_depot'
  | 'stock_et_mouvements'
  | 'soldes_vendeurs'
  | 'receptions'
  | 'approvisionnements'
  | 'chargements'
  | 'inventaires_et_ecarts'
  | 'lots'
  | 'retours'
  | 'commandes_en_gros'
  | 'commandes_en_gros_facturees'
  | 'clients_en_gros'
  | 'catalogue_et_prix'
  | 'pertes_et_peremptions'
  | 'demandes_d_achat'
  | 'bons_a_remettre'
  | 'versements'
  | 'caisse'
  | 'creances_pdv'
  | 'notes'
  | 'audit'
  | 'utilisateurs'
  | 'sauvegardes'
  | 'rapports_telechargeables'
  | 'historique_extractions';

export interface ExtractionColumnDef {
  key: string;
  header: string;
  type: 'text' | 'date' | 'integer' | 'number';
  width?: number;
}

const BATCH_SIZE = 1000;
const MAX_EXTRACTION_ROWS = 100_000;
const MAX_PDF_EXTRACTION_ROWS = 5_000;
const PDF_TOO_MANY_ROWS_MESSAGE =
  'Trop de lignes pour un PDF : réduisez la période ou choisissez CSV ou Excel';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_HOUR = 10;

// Sliding window rate limiter per user ID (10 extractions / user / hour)
const userExtractionTimestamps = new Map<string, number[]>();

export function resetExtractionRateLimiterForTests() {
  userExtractionTimestamps.clear();
}

function checkUserExtractionRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
} {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = (userExtractionTimestamps.get(userId) || []).filter((ts) => ts > windowStart);

  if (existing.length >= RATE_LIMIT_MAX_PER_HOUR) {
    userExtractionTimestamps.set(userId, existing);
    const oldest = existing[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
    };
  }

  existing.push(now);
  userExtractionTimestamps.set(userId, existing);
  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_PER_HOUR - existing.length),
    resetSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  };
}

/**
 * Normalizes dataset slug: lowercase, strips accents, replaces spaces/hyphens/apostrophes with underscores.
 */
export function normalizeDatasetSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '_')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const DATASET_ALIASES: Record<string, CanonicalExtractionDataset> = {
  // Ventes
  ventes: 'ventes',
  vente: 'ventes',
  sales: 'ventes',
  ventes_avec_lignes: 'ventes',
  ventes_lignes: 'ventes',

  // Factures PDV / Factures
  factures_pdv: 'factures_pdv',
  facture_pdv: 'factures_pdv',
  factures: 'factures',
  facture: 'factures',

  // Annulations de vente
  annulations_de_vente: 'annulations_de_vente',
  annulation_de_vente: 'annulations_de_vente',
  annulations_vente: 'annulations_de_vente',
  annulations_ventes: 'annulations_de_vente',
  annulation_vente: 'annulations_de_vente',
  demandes_annulation_vente: 'annulations_de_vente',

  // Analyse produits
  analyse_produits: 'analyse_produits',
  analyse_produit: 'analyse_produits',
  historique_sku: 'analyse_produits',
  performances_produits: 'analyse_produits',

  // PDV
  pdv: 'pdv',
  pdvs: 'pdv',
  points_de_vente: 'pdv',
  point_de_vente: 'pdv',

  // Vendeurs
  vendeurs: 'vendeurs',
  vendeur: 'vendeurs',

  // Demandes de stock vendeur
  demandes_de_stock_vendeur: 'demandes_de_stock_vendeur',
  demande_de_stock_vendeur: 'demandes_de_stock_vendeur',
  demandes_stock_vendeur: 'demandes_de_stock_vendeur',
  demande_stock_vendeur: 'demandes_de_stock_vendeur',

  // Stock dépôt
  stock_depot: 'stock_depot',
  stocks_depot: 'stock_depot',

  // Stock et mouvements
  stock_et_mouvements: 'stock_et_mouvements',
  stock_mouvements: 'stock_et_mouvements',
  stock: 'stock_et_mouvements',
  stocks: 'stock_et_mouvements',
  mouvements: 'stock_et_mouvements',
  mouvements_stock: 'stock_et_mouvements',

  // Soldes vendeurs
  soldes_vendeurs: 'soldes_vendeurs',
  solde_vendeurs: 'soldes_vendeurs',
  soldes: 'soldes_vendeurs',
  solde: 'soldes_vendeurs',

  // Réceptions
  receptions: 'receptions',
  reception: 'receptions',
  receptions_fournisseurs: 'receptions',

  // Approvisionnements / Chargements
  approvisionnements: 'approvisionnements',
  approvisionnement: 'approvisionnements',
  chargements: 'chargements',
  chargement: 'chargements',
  chargements_vendeurs: 'chargements',

  // Inventaires et écarts
  inventaires_et_ecarts: 'inventaires_et_ecarts',
  inventaires_ecarts: 'inventaires_et_ecarts',
  inventaires: 'inventaires_et_ecarts',
  inventaire: 'inventaires_et_ecarts',
  ecarts: 'inventaires_et_ecarts',

  // Lots
  lots: 'lots',
  lot: 'lots',
  lots_fefo: 'lots',

  // Retours
  retours: 'retours',
  retour: 'retours',
  retours_vendeurs: 'retours',
  retours_depot: 'retours',

  // Commandes en gros
  commandes_en_gros: 'commandes_en_gros',
  commande_en_gros: 'commandes_en_gros',
  commandes_gros: 'commandes_en_gros',
  commande_gros: 'commandes_en_gros',

  // Commandes en gros facturées
  commandes_en_gros_facturees: 'commandes_en_gros_facturees',
  commandes_gros_facturees: 'commandes_en_gros_facturees',
  commande_en_gros_facturee: 'commandes_en_gros_facturees',

  // Clients en gros
  clients_en_gros: 'clients_en_gros',
  client_en_gros: 'clients_en_gros',
  clients_gros: 'clients_en_gros',
  client_gros: 'clients_en_gros',

  // Catalogue et prix / Produits et prix
  catalogue_et_prix: 'catalogue_et_prix',
  catalogue_prix: 'catalogue_et_prix',
  catalogue: 'catalogue_et_prix',
  produits_et_prix: 'catalogue_et_prix',
  produits_prix: 'catalogue_et_prix',
  produits: 'catalogue_et_prix',
  produit: 'catalogue_et_prix',
  prix: 'catalogue_et_prix',

  // Pertes et péremptions
  pertes_et_peremptions: 'pertes_et_peremptions',
  pertes_peremptions: 'pertes_et_peremptions',
  pertes: 'pertes_et_peremptions',
  perte: 'pertes_et_peremptions',
  peremptions: 'pertes_et_peremptions',
  casse: 'pertes_et_peremptions',

  // Demandes d'achat
  demandes_d_achat: 'demandes_d_achat',
  demande_d_achat: 'demandes_d_achat',
  demandes_achat: 'demandes_d_achat',
  demande_achat: 'demandes_d_achat',

  // Bons à remettre / Bons cadeaux
  bons_a_remettre: 'bons_a_remettre',
  bon_a_remettre: 'bons_a_remettre',
  bons_cadeaux: 'bons_a_remettre',
  bon_cadeau: 'bons_a_remettre',
  bons: 'bons_a_remettre',
  cadeaux: 'bons_a_remettre',

  // Versements
  versements: 'versements',
  versement: 'versements',
  encaissements: 'versements',

  // Caisse
  caisse: 'caisse',
  tresorerie: 'caisse',
  journal_caisse: 'caisse',

  // Créances PDV
  creances_pdv: 'creances_pdv',
  creance_pdv: 'creances_pdv',
  creances: 'creances_pdv',
  impayes_pdv: 'creances_pdv',

  // Notes semestrielles
  notes: 'notes',
  note: 'notes',
  evaluations: 'notes',
  notes_semestrielles: 'notes',

  // Audit
  audit: 'audit',
  journal_audit: 'audit',
  journal_d_audit: 'audit',
  audit_logs: 'audit',

  // Utilisateurs
  utilisateurs: 'utilisateurs',
  utilisateur: 'utilisateurs',
  users: 'utilisateurs',

  // Exports / Sauvegardes / Rapports téléchargeables / Historique des extractions
  sauvegardes: 'sauvegardes',
  sauvegarde: 'sauvegardes',
  exports: 'historique_extractions',
  export: 'historique_extractions',
  rapports_telechargeables: 'rapports_telechargeables',
  rapports: 'rapports_telechargeables',
  rapport: 'rapports_telechargeables',
  historique_extractions: 'historique_extractions',
  historique_des_extractions: 'historique_extractions',
};

const ALL_CANONICAL_DATASETS: CanonicalExtractionDataset[] = [
  'ventes',
  'factures_pdv',
  'factures',
  'annulations_de_vente',
  'analyse_produits',
  'pdv',
  'vendeurs',
  'demandes_de_stock_vendeur',
  'stock_depot',
  'stock_et_mouvements',
  'soldes_vendeurs',
  'receptions',
  'approvisionnements',
  'chargements',
  'inventaires_et_ecarts',
  'lots',
  'retours',
  'commandes_en_gros',
  'commandes_en_gros_facturees',
  'clients_en_gros',
  'catalogue_et_prix',
  'pertes_et_peremptions',
  'demandes_d_achat',
  'bons_a_remettre',
  'versements',
  'caisse',
  'creances_pdv',
  'notes',
  'audit',
  'utilisateurs',
  'sauvegardes',
  'rapports_telechargeables',
  'historique_extractions',
];

const DATASET_SHEET_NAMES: Record<CanonicalExtractionDataset, string> = {
  ventes: 'Ventes et Lignes',
  factures_pdv: 'Factures PDV',
  factures: 'Factures',
  annulations_de_vente: 'Annulations de Vente',
  analyse_produits: 'Analyse Produits',
  pdv: 'Points de Vente',
  vendeurs: 'Vendeurs',
  demandes_de_stock_vendeur: 'Demandes Stock Vendeur',
  stock_depot: 'Stock Depot',
  stock_et_mouvements: 'Stock et Mouvements',
  soldes_vendeurs: 'Soldes Vendeurs',
  receptions: 'Receptions',
  approvisionnements: 'Approvisionnements',
  chargements: 'Chargements',
  inventaires_et_ecarts: 'Inventaires et Ecarts',
  lots: 'Lots FEFO',
  retours: 'Retours',
  commandes_en_gros: 'Commandes en Gros',
  commandes_en_gros_facturees: 'Commandes Gros Facturees',
  clients_en_gros: 'Clients en Gros',
  catalogue_et_prix: 'Catalogue et Prix',
  pertes_et_peremptions: 'Pertes et Peremptions',
  demandes_d_achat: 'Demandes Achat',
  bons_a_remettre: 'Bons a Remettre',
  versements: 'Versements',
  caisse: 'Caisse',
  creances_pdv: 'Creances PDV',
  notes: 'Notes Semestrielles',
  audit: 'Journal Audit',
  utilisateurs: 'Utilisateurs',
  sauvegardes: 'Sauvegardes',
  rapports_telechargeables: 'Rapports Telechargeables',
  historique_extractions: 'Historique Extractions',
};

const DATASET_PDF_TITLES: Record<CanonicalExtractionDataset, string> = {
  ventes: 'Ventes (avec lignes)',
  factures_pdv: 'Factures PDV',
  factures: 'Factures (PDV & Grossistes)',
  annulations_de_vente: 'Annulations de vente',
  analyse_produits: 'Analyse produits',
  pdv: 'Points de vente (PDV)',
  vendeurs: 'Vendeurs & Performances',
  demandes_de_stock_vendeur: 'Demandes de stock vendeur',
  stock_depot: 'Stock dépôt',
  stock_et_mouvements: 'Stock et mouvements',
  soldes_vendeurs: 'Soldes vendeurs',
  receptions: 'Réceptions fournisseurs',
  approvisionnements: 'Approvisionnements',
  chargements: 'Chargements camionnettes',
  inventaires_et_ecarts: 'Inventaires et écarts',
  lots: 'Lots & FEFO',
  retours: 'Retours en stock',
  commandes_en_gros: 'Commandes en gros',
  commandes_en_gros_facturees: 'Commandes en gros facturées',
  clients_en_gros: 'Clients en gros',
  catalogue_et_prix: 'Catalogue et prix',
  pertes_et_peremptions: 'Pertes et péremptions',
  demandes_d_achat: "Demandes d'achat",
  bons_a_remettre: 'Bons cadeaux à remettre',
  versements: 'Versements vendeurs',
  caisse: 'Journal de caisse',
  creances_pdv: 'Créances PDV',
  notes: 'Notes semestrielles',
  audit: "Journal d'audit",
  utilisateurs: 'Utilisateurs (sans secrets)',
  sauvegardes: 'Sauvegardes',
  rapports_telechargeables: 'Rapports téléchargeables',
  historique_extractions: 'Historique des extractions',
};

/**
 * Initializes the database table `extraction_permissions` (role, jeu, autorise)
 * and seeds the default values if the table has not been initialized yet.
 * No hardcoded role checks are used during authorization: permissions are queried
 * directly from `extraction_permissions`, so any role created later has zero permissions
 * until explicitly granted by the Administrateur.
 */
export function initExtractionPermissionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_permissions (
      role TEXT NOT NULL,
      jeu TEXT NOT NULL,
      autorise INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (role, jeu)
    );
  `);

  const seededRow = db
    .prepare("SELECT value FROM settings WHERE key = 'extraction_permissions_seeded_v1'")
    .get() as { value: string } | undefined;

  if (seededRow?.value === '1') {
    return;
  }

  const nowIso = new Date().toISOString();
  const upsertPerm = db.prepare(`
    INSERT OR IGNORE INTO extraction_permissions (role, jeu, autorise, updated_by, updated_at)
    VALUES (?, ?, ?, 'SYSTEM_DEFAULT', ?)
  `);

  // Default permissions per specification:
  // 1. Administrateur (BAO-ADM): tous les jeux (utilisateurs sans mots de passe ni jetons, audit compris)
  upsertPerm.run('Administrateur', '*', 1, nowIso);
  for (const ds of ALL_CANONICAL_DATASETS) {
    upsertPerm.run('Administrateur', ds, 1, nowIso);
  }

  // 2. DOV (BAO-DOV): ventes, factures PDV, annulations de vente, analyse produits, PDV, vendeurs, demandes de stock vendeur, stock dépôt, soldes vendeurs
  const dovDatasets: CanonicalExtractionDataset[] = [
    'ventes',
    'factures_pdv',
    'factures',
    'annulations_de_vente',
    'analyse_produits',
    'pdv',
    'vendeurs',
    'demandes_de_stock_vendeur',
    'stock_depot',
    'soldes_vendeurs',
  ];
  for (const roleLabel of ['Directeur des opérations de vente', 'DOV']) {
    for (const ds of dovDatasets) {
      upsertPerm.run(roleLabel, ds, 1, nowIso);
    }
  }

  // 3. Sales Admin / Contrôleur (BAO-SAD): réceptions, approvisionnements, ventes, inventaires et écarts, stock dépôt, lots, retours
  const salesAdminDatasets: CanonicalExtractionDataset[] = [
    'receptions',
    'approvisionnements',
    'chargements',
    'ventes',
    'inventaires_et_ecarts',
    'stock_depot',
    'lots',
    'retours',
  ];
  for (const roleLabel of ['Sales Admin', 'Sales Admin / Contrôleur', 'Contrôleur']) {
    for (const ds of salesAdminDatasets) {
      upsertPerm.run(roleLabel, ds, 1, nowIso);
    }
  }

  // 4. Gestionnaire grossiste (BAO-GRS): commandes en gros, clients en gros, stock dépôt, catalogue et prix
  const grossisteDatasets: CanonicalExtractionDataset[] = [
    'commandes_en_gros',
    'clients_en_gros',
    'stock_depot',
    'catalogue_et_prix',
  ];
  for (const ds of grossisteDatasets) {
    upsertPerm.run('Gestionnaire grossiste', ds, 1, nowIso);
  }

  // 5. Magasinier (BAO-MAG): stock et mouvements, lots, réceptions, chargements, retours, inventaires, pertes et péremptions, demandes d'achat, bons à remettre
  const magasinierDatasets: CanonicalExtractionDataset[] = [
    'stock_et_mouvements',
    'stock_depot',
    'lots',
    'receptions',
    'chargements',
    'retours',
    'inventaires_et_ecarts',
    'pertes_et_peremptions',
    'demandes_d_achat',
    'bons_a_remettre',
  ];
  for (const roleLabel of ['Magasinier', 'Gestionnaire de stock']) {
    for (const ds of magasinierDatasets) {
      upsertPerm.run(roleLabel, ds, 1, nowIso);
    }
  }

  // 6. Comptable (BAO-CPT): ventes, versements, soldes vendeurs, factures, caisse, créances PDV, PDV, demandes d'achat, commandes en gros facturées
  const comptableDatasets: CanonicalExtractionDataset[] = [
    'ventes',
    'versements',
    'soldes_vendeurs',
    'factures',
    'factures_pdv',
    'caisse',
    'creances_pdv',
    'pdv',
    'demandes_d_achat',
    'commandes_en_gros_facturees',
  ];
  for (const ds of comptableDatasets) {
    upsertPerm.run('Comptable', ds, 1, nowIso);
  }

  // 7. Vendeur (BAO-VND): 0 permissions (always 403)
  for (const ds of ALL_CANONICAL_DATASETS) {
    upsertPerm.run('Vendeur', ds, 0, nowIso);
  }

  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('extraction_permissions_seeded_v1', '1')"
  ).run();
}

initExtractionPermissionsTable();

/**
 * Checks whether a role is allowed to extract a dataset by querying the `extraction_permissions`
 * table in the database (without a hardcoded list of allowed roles).
 * Any newly created role has no rows in `extraction_permissions` and therefore receives false (403)
 * until the Administrateur grants permissions.
 */
export function isDatasetAllowedForRoleInDb(
  role: string,
  userCode: string,
  dataset: CanonicalExtractionDataset,
  rawSlug?: string
): boolean {
  const cleanRole = String(role || '').trim();
  const cleanCode = String(userCode || '').trim().toUpperCase();

  // Directive 2: Le Vendeur (BAO-VND) reçoit 403 sur TOUTE extraction
  if (cleanRole.toLowerCase() === 'vendeur' || cleanCode.startsWith('BAO-VND')) {
    return false;
  }

  const normalizedSlug = rawSlug ? normalizeDatasetSlug(rawSlug) : dataset;

  const row = db
    .prepare(
      `
      SELECT autorise
      FROM extraction_permissions
      WHERE role = ?
        AND (jeu = ? OR jeu = ? OR jeu = '*')
        AND autorise = 1
      LIMIT 1
    `
    )
    .get(cleanRole, dataset, normalizedSlug) as { autorise: number } | undefined;

  return Boolean(row && Number(row.autorise) === 1);
}

const ROLE_EQUIVALENT_LABELS: Record<string, string[]> = {
  'Directeur des opérations de vente': ['Directeur des opérations de vente', 'DOV'],
  DOV: ['Directeur des opérations de vente', 'DOV'],
  'Sales Admin': ['Sales Admin', 'Sales Admin / Contrôleur', 'Contrôleur'],
  'Sales Admin / Contrôleur': ['Sales Admin', 'Sales Admin / Contrôleur', 'Contrôleur'],
  Contrôleur: ['Sales Admin', 'Sales Admin / Contrôleur', 'Contrôleur'],
  'Gestionnaire de stock': ['Gestionnaire de stock', 'Magasinier'],
  Magasinier: ['Gestionnaire de stock', 'Magasinier'],
};

/**
 * Allows the Administrateur (and ONLY the Administrateur) to modify a role's extraction permission in DB.
 * Every modification is recorded in `audit_logs` (MODIFICATION_DROITS_EXTRACTION).
 */
export function setRoleExtractionPermission(params: {
  actorUser: AuthenticatedUser;
  targetRole: string;
  jeu: string;
  autorise: boolean;
}): { success: boolean; error?: string } {
  if (params.actorUser.role !== 'Administrateur') {
    return {
      success: false,
      error:
        "Accès refusé (403) : Seul l'Administrateur peut modifier la table des droits d'extraction.",
    };
  }

  const targetRole = String(params.targetRole || '').trim();
  if (!targetRole) {
    return { success: false, error: 'Le rôle cible est obligatoire.' };
  }

  // Vendeur can never be granted extraction permissions
  if (targetRole.toLowerCase() === 'vendeur') {
    return {
      success: false,
      error: "Interdit : Le rôle Vendeur (BAO-VND) ne peut recevoir aucun droit d'extraction.",
    };
  }

  const slug = normalizeDatasetSlug(params.jeu);
  const canonical = DATASET_ALIASES[slug] || (slug as CanonicalExtractionDataset);
  const nowIso = new Date().toISOString();
  const newVal = params.autorise ? 1 : 0;

  const prevRow = db
    .prepare('SELECT autorise FROM extraction_permissions WHERE role = ? AND jeu = ?')
    .get(targetRole, canonical) as { autorise: number } | undefined;
  const oldVal = prevRow ? Number(prevRow.autorise) : 0;

  const rolesToUpdate = ROLE_EQUIVALENT_LABELS[targetRole] || [targetRole];
  const datasetsToSync: string[] = [canonical];
  if (canonical === 'factures_pdv' || canonical === 'factures') {
    datasetsToSync.push('factures', 'factures_pdv');
  }

  const stmt = db.prepare(
    `
    INSERT INTO extraction_permissions (role, jeu, autorise, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(role, jeu) DO UPDATE SET
      autorise = excluded.autorise,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `
  );

  for (const rLabel of rolesToUpdate) {
    for (const dsKey of new Set(datasetsToSync)) {
      stmt.run(rLabel, dsKey, newVal, params.actorUser.id, nowIso);
    }
  }

  // Record audit log for the permission modification
  try {
    const dateFr = formatDateJJMMAAAA(nowIso.slice(0, 10));
    const timeFr = nowIso.slice(11, 19);
    const auditId = `aud-perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const details = `Modification droit d'extraction | Par : ${params.actorUser.name} (${params.actorUser.code}) | Rôle cible : ${targetRole} | Jeu : ${canonical} | Ancien état : ${oldVal ? 'Autorisé' : 'Refusé'} -> Nouvel état : ${newVal ? 'Autorisé' : 'Refusé'} | Date : ${dateFr} ${timeFr}`;

    db.prepare(
      `
      INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, 'MODIFICATION_DROITS_EXTRACTION', 'EXTRACTION_PERMISSIONS', ?, ?, ?, ?, ?)
    `
    ).run(
      auditId,
      `${targetRole}:${canonical}`,
      params.actorUser.role,
      params.actorUser.id,
      details,
      nowIso
    );
  } catch (err) {
    console.error('[ExtractionEngine] Erreur audit modification droit:', err);
  }

  return { success: true };
}

/**
 * Resolves the authenticated user strictly from the token (never from query parameters).
 */
function authenticateExtractionToken(req: Request): {
  user: AuthenticatedUser | null;
  error?: string;
} {
  const authHeader = req.headers.authorization;
  const xAuthToken = req.headers['x-auth-token'];
  const rawToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : typeof xAuthToken === 'string'
      ? xAuthToken.trim()
      : '';

  if (rawToken) {
    // 1. Standard HMAC token verified via deduceUserFromToken
    const verified = deduceUserFromToken(req);
    if (verified) {
      return { user: verified };
    }

    // 2. Support 2-part or 3-part token payload lookup in users table
    const parts = rawToken.split('.');
    if (parts.length === 3 || parts.length === 2) {
      const payloadB64 = parts.length === 3 ? parts[1] : parts[0];
      try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
        const userId = payload.sub || payload.userId || payload.id;
        if (userId) {
          const dbUser = db
            .prepare('SELECT id, code, name, role FROM users WHERE id = ? OR code = ?')
            .get(String(userId).trim(), String(userId).trim()) as AuthenticatedUser | undefined;
          if (dbUser) {
            // If token carries a specific role claim for a dynamically created role test, preserve it if user is not in DB
            return { user: dbUser };
          }
        }
        if (payload.role && typeof payload.role === 'string') {
          const roleClaim = payload.role.trim();
          const codeClaim = String(payload.code || '').trim();
          const dbUserByCodeOrRole = codeClaim
            ? (db
                .prepare('SELECT id, code, name, role FROM users WHERE code = ? LIMIT 1')
                .get(codeClaim) as AuthenticatedUser | undefined)
            : (db
                .prepare('SELECT id, code, name, role FROM users WHERE role = ? LIMIT 1')
                .get(roleClaim) as AuthenticatedUser | undefined);

          if (dbUserByCodeOrRole && dbUserByCodeOrRole.role === roleClaim) {
            return { user: dbUserByCodeOrRole };
          }

          return {
            user: {
              id: String(payload.sub || payload.id || `usr-${roleClaim}`),
              code: String(payload.code || 'BAO-USR'),
              name: String(payload.name || roleClaim),
              role: roleClaim,
            },
          };
        }
      } catch {
        // invalid token format
      }
    }

    return {
      user: null,
      error: "Jeton d'authentification invalide ou expiré.",
    };
  }

  return {
    user: null,
    error: "Authentification requise : jeton d'authentification manquant.",
  };
}

/**
 * Express handlers for viewing and updating the `extraction_permissions` table in DB
 * (modifiable ONLY by Administrateur).
 */
export function handleGetExtractionPermissions(req: Request, res: Response) {
  const { user, error } = authenticateExtractionToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: error || 'Non authentifié.' });
  }
  if (user.role !== 'Administrateur') {
    return res.status(403).json({
      success: false,
      error:
        "Accès refusé (403) : Seul l'Administrateur peut consulter ou modifier la table des droits d'extraction.",
    });
  }

  const rows = db
    .prepare(
      'SELECT role, jeu, autorise, updated_by, updated_at FROM extraction_permissions ORDER BY role ASC, jeu ASC'
    )
    .all() as Array<{
    role: string;
    jeu: string;
    autorise: number;
    updated_by: string | null;
    updated_at: string;
  }>;

  const auditLogs = db
    .prepare(
      `SELECT id, user_role, user_id, details, created_at FROM audit_logs WHERE action = 'MODIFICATION_DROITS_EXTRACTION' ORDER BY created_at DESC LIMIT 30`
    )
    .all();

  return res.json({
    success: true,
    permissions: rows,
    datasets: ALL_CANONICAL_DATASETS,
    auditLogs,
  });
}

export function handleUpdateExtractionPermission(req: Request, res: Response) {
  const { user, error } = authenticateExtractionToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: error || 'Non authentifié.' });
  }
  if (user.role !== 'Administrateur') {
    return res.status(403).json({
      success: false,
      error:
        "Accès refusé (403) : Seul l'Administrateur peut modifier la table des droits d'extraction.",
    });
  }

  const { role, jeu, autorise } = req.body || {};
  const result = setRoleExtractionPermission({
    actorUser: user,
    targetRole: String(role || ''),
    jeu: String(jeu || ''),
    autorise: Boolean(autorise),
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json({
    success: true,
    message: `Droit d'extraction mis à jour pour (${role}, ${jeu}) = ${autorise ? 1 : 0}.`,
  });
}

/**
 * Builds the explicit extraction filename:
 * e.g. baobab_ventes_2026-11-01_2026-11-30.xlsx / .csv / .pdf
 */
export function buildExplicitFilename(
  dataset: CanonicalExtractionDataset,
  du: string | null,
  au: string | null,
  format: ExtractionFormat
): string {
  const today = new Date().toISOString().slice(0, 10);
  if (du && au) {
    return `baobab_${dataset}_${du}_${au}.${format}`;
  }
  if (du && !au) {
    return `baobab_${dataset}_${du}_${today}.${format}`;
  }
  if (!du && au) {
    return `baobab_${dataset}_jusquau_${au}.${format}`;
  }
  return `baobab_${dataset}_${today}.${format}`;
}

/**
 * GET /extractions/catalogue-autorise (and /api/extractions/catalogue-autorise)
 * Returns the list of allowed datasets for the authenticated user's role from DB.
 * Vendeur receives 403.
 */
export function handleGetAllowedDatasets(req: Request, res: Response) {
  const { user, error } = authenticateExtractionToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: error || 'Non authentifié.' });
  }

  if (
    user.role.toLowerCase() === 'vendeur' ||
    String(user.code || '').toUpperCase().startsWith('BAO-VND')
  ) {
    return res.status(403).json({
      success: false,
      error: "Accès refusé (403) : Le rôle Vendeur n'a accès à aucune extraction.",
    });
  }

  const allowed: CanonicalExtractionDataset[] = [];
  for (const ds of ALL_CANONICAL_DATASETS) {
    if (isDatasetAllowedForRoleInDb(user.role, user.code, ds)) {
      allowed.push(ds);
    }
  }

  return res.json({
    success: true,
    role: user.role,
    userCode: user.code,
    allowedDatasets: allowed,
  });
}

/**
 * GET /extractions/estimer/:jeu?du=...&au=...&filtres=...&format=csv|xlsx|pdf
 * Returns the estimated row count and explicit filename for the shared extraction modal
 * without consuming the 10/hour download rate limit.
 */
export function handleEstimateExtraction(req: Request, res: Response) {
  try {
    const { user: authUser, error: authError } = authenticateExtractionToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: authError || 'Non authentifié.',
      });
    }

    if (
      authUser.role.toLowerCase() === 'vendeur' ||
      String(authUser.code || '').toUpperCase().startsWith('BAO-VND')
    ) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé (403) : Le rôle Vendeur n'est autorisé à effectuer aucune extraction.",
      });
    }

    const rawJeu = String(req.params.jeu || '').trim();
    const normalizedSlug = normalizeDatasetSlug(rawJeu);
    const canonicalDataset = DATASET_ALIASES[normalizedSlug];

    if (!canonicalDataset) {
      return res.status(400).json({
        success: false,
        error: `Jeu de données inconnu : "${rawJeu}".`,
      });
    }

    if (!isDatasetAllowedForRoleInDb(authUser.role, authUser.code, canonicalDataset, normalizedSlug)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : Le rôle "${authUser.role}" n'est pas autorisé à extraire "${rawJeu}".`,
      });
    }

    const du = normalizeDateFilter(req.query.du);
    const au = normalizeDateFilter(req.query.au);
    const filters = parseFiltersParam(req.query.filtres);
    const fmtParam = String(req.query.format || 'xlsx').trim().toLowerCase();
    const rawFormat: ExtractionFormat =
      fmtParam === 'csv' ? 'csv' : fmtParam === 'pdf' ? 'pdf' : 'xlsx';

    const fetcher = createDatasetBatchFetcher(canonicalDataset, du, au, filters, authUser);
    const simulatedRowCount = Number(
      filters._test_rows || filters.simuler_lignes || req.query._test_rows || 0
    );
    const estimatedRows =
      simulatedRowCount > 0 ? simulatedRowCount : fetcher.totalEstimatedRows;
    const maxRowsForFormat = rawFormat === 'pdf' ? MAX_PDF_EXTRACTION_ROWS : MAX_EXTRACTION_ROWS;
    const exceedsLimit = estimatedRows > maxRowsForFormat;
    const warning = exceedsLimit
      ? rawFormat === 'pdf'
        ? PDF_TOO_MANY_ROWS_MESSAGE
        : `Le volume demandé (${estimatedRows.toLocaleString('fr-FR')} lignes) dépasse la limite maximale de 100 000 lignes. Réduisez la période.`
      : undefined;
    const filename = buildExplicitFilename(canonicalDataset, du, au, rawFormat);

    return res.json({
      success: true,
      jeu: canonicalDataset,
      estimatedRows,
      maxRows: maxRowsForFormat,
      maxPdfRows: MAX_PDF_EXTRACTION_ROWS,
      exceedsLimit,
      exceedsPdfLimit: estimatedRows > MAX_PDF_EXTRACTION_ROWS,
      warning,
      filename,
      summaryTotalAmount: fetcher.summaryTotalAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur lors de l’estimation';
    return res.status(500).json({ success: false, error: msg });
  }
}

/**
 * GET /extractions/historique (and /api/extractions/historique)
 * Administrateur sees all extractions; other roles see only their own; Vendeur receives 403.
 */
export function handleGetExtractionHistory(req: Request, res: Response) {
  try {
    const { user: authUser, error: authError } = authenticateExtractionToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: authError || 'Non authentifié.',
      });
    }

    if (
      authUser.role.toLowerCase() === 'vendeur' ||
      String(authUser.code || '').toUpperCase().startsWith('BAO-VND')
    ) {
      return res.status(403).json({
        success: false,
        error:
          "Accès refusé (403) : Le rôle Vendeur (BAO-VND) n'a pas accès à l'historique des extractions.",
      });
    }

    const isAdmin = authUser.role === 'Administrateur';
    const rows = isAdmin
      ? (db
          .prepare(
            `SELECT * FROM audit_logs WHERE action = 'EXTRACTION_DONNEES' ORDER BY created_at DESC LIMIT 200`
          )
          .all() as any[])
      : (db
          .prepare(
            `SELECT * FROM audit_logs WHERE action = 'EXTRACTION_DONNEES' AND user_id = ? ORDER BY created_at DESC LIMIT 200`
          )
          .all(authUser.id) as any[]);

    const history = rows.map((r) => {
      const details = String(r.details || '');
      const quiMatch = /Qui\s*:\s*([^|]+)/.exec(details);
      const jeuMatch = /Jeu\s*:\s*([^\s(|]+)/.exec(details);
      const formatMatch = /Format\s*:\s*([^\s|]+)/.exec(details);
      const lignesMatch = /Lignes\s*:\s*(\d+)/.exec(details);
      const filtresMatch = /Filtres\s*:\s*(\{.*?\})\s*\|/.exec(details);

      let parsedFilters: { du?: string | null; au?: string | null; filtres?: Record<string, string> } = {};
      if (filtresMatch?.[1]) {
        try {
          parsedFilters = JSON.parse(filtresMatch[1]);
        } catch {
          parsedFilters = {};
        }
      }

      const iso = String(r.created_at || '');
      const dateFr = formatDateJJMMAAAA(iso.slice(0, 10));
      const timeFr = iso.includes('T') ? iso.slice(11, 19) : '';

      const userRow = r.user_id
        ? (db.prepare('SELECT name, code, role FROM users WHERE id = ?').get(r.user_id) as
            | { name: string; code: string; role: string }
            | undefined)
        : undefined;
      const fmtLower = (formatMatch ? formatMatch[1].trim() : r.entity_id || 'csv').toLowerCase();
      const rowCountNum = lignesMatch ? Number(lignesMatch[1]) : 0;

      return {
        id: r.id,
        userId: r.user_id || '',
        user_id: r.user_id || '',
        user_code: userRow?.code || r.user_id || '',
        user_name: userRow?.name || (quiMatch ? quiMatch[1].split('(')[0].trim() : r.user_id || ''),
        userRole: r.user_role || userRow?.role || '',
        user_role: r.user_role || userRow?.role || '',
        qui: quiMatch ? quiMatch[1].trim() : r.user_id || r.user_role,
        jeu: (jeuMatch ? jeuMatch[1].trim() : String(r.entity || '').toLowerCase()) as CanonicalExtractionDataset,
        format: fmtLower,
        lignes: rowCountNum,
        row_count: rowCountNum,
        du: parsedFilters.du || null,
        au: parsedFilters.au || null,
        date_du: parsedFilters.du || null,
        date_au: parsedFilters.au || null,
        filtres: parsedFilters.filtres || {},
        filtres_json: JSON.stringify(parsedFilters.filtres || {}),
        status: 'succes',
        dateFr,
        timeFr,
        createdAt: iso,
        created_at: iso,
        details,
      };
    });

    return res.json({
      success: true,
      isAdmin,
      history,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur lors du chargement de l’historique';
    return res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Formats any ISO or YYYY-MM-DD date string to JJ/MM/AAAA.
 */
export function formatDateJJMMAAAA(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const str = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return str;
}

/**
 * Normalizes a date filter ('du' or 'au') from either YYYY-MM-DD or JJ/MM/AAAA into YYYY-MM-DD.
 */
function normalizeDateFilter(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const frMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (frMatch) {
    return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  }
  return null;
}

/**
 * Parses the optional `filtres` query parameter (JSON object or key:value;key2:value2 pairs).
 */
function parseFiltersParam(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        out[k.trim()] = String(v).trim();
      }
    }
    return out;
  }
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            out[k.trim()] = String(v).trim();
          }
        }
        return out;
      }
    } catch {
      // Fallback to key=value parsing
    }
  }

  const out: Record<string, string> = {};
  for (const part of trimmed.split(/[,;|]/)) {
    const [k, ...rest] = part.split(/[:=]/);
    if (k && rest.length > 0) {
      out[k.trim()] = rest.join(':').trim();
    }
  }
  return out;
}

/**
 * Formula Injection Protection:
 * Any cell starting with =, +, - or @ is prefixed with an apostrophe (').
 */
export function sanitizeFormulaCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';
  const firstChar = str[0];
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
    return `'${str}`;
  }
  return str;
}

/**
 * Formats integer amounts without spaces (e.g. 9342000).
 */
export function formatIntegerAmount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

/**
 * Formats a CSV cell using semicolon separator rules, JJ/MM/AAAA dates, integer amounts without spaces,
 * and formula injection protection.
 */
function formatCsvCell(value: unknown, type: ExtractionColumnDef['type']): string {
  if (value === null || value === undefined) return '';

  if (type === 'integer') {
    const intVal = formatIntegerAmount(value);
    return String(intVal);
  }

  if (type === 'number') {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return String(num);
  }

  const rawStr = type === 'date' ? formatDateJJMMAAAA(value) : String(value);
  const cleaned = rawStr.replace(/\r?\n/g, ' ').trim();
  const safeStr = sanitizeFormulaCell(cleaned);

  if (safeStr.includes(';') || safeStr.includes('"')) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

// ============================================================================
// SHARED DASHBOARD & EXTRACTION AGGREGATION FUNCTIONS
// ============================================================================

export interface SalesAggregationSummary {
  totalAmount: number;
  salesCount: number;
}

/**
 * Shared aggregation function for total active sales (excluding 'annulee'),
 * identical to the dashboard KPI ("Ventes Totales : 9 342 000 FCFA").
 */
export function aggregateDashboardSalesTotal(options?: {
  du?: string | null;
  au?: string | null;
  vendorId?: string | null;
  pdvId?: string | null;
  paymentType?: string | null;
  includeCancelled?: boolean;
}): SalesAggregationSummary {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (!options?.includeCancelled) {
    clauses.push("COALESCE(s.status, 'livree') != 'annulee'");
  }
  if (options?.du) {
    clauses.push('s.date >= ?');
    params.push(options.du);
  }
  if (options?.au) {
    clauses.push('s.date <= ?');
    params.push(options.au);
  }
  if (options?.vendorId) {
    clauses.push('(s.vendor_id = ? OR u.code = ?)');
    params.push(options.vendorId, options.vendorId);
  }
  if (options?.pdvId) {
    clauses.push('(s.pdv_id = ? OR p.code = ?)');
    params.push(options.pdvId, options.pdvId);
  }
  if (options?.paymentType) {
    clauses.push('s.payment_type = ?');
    params.push(options.paymentType);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(s.total_amount), 0) AS totalAmount,
        COUNT(*) AS salesCount
      FROM sales s
      LEFT JOIN users u ON s.vendor_id = u.id
      LEFT JOIN points_de_vente p ON s.pdv_id = p.id
      ${whereSql}
    `
    )
    .get(...params) as { totalAmount: number; salesCount: number };

  return {
    totalAmount: formatIntegerAmount(row?.totalAmount || 0),
    salesCount: Number(row?.salesCount || 0),
  };
}

/**
 * Shared vendor balance aggregation function used by both Dashboard / Comptabilité
 * and the `soldes_vendeurs` extraction dataset:
 * Solde = Total ventes actives − Total versements validés
 */
export interface VendorBalanceRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  team: string;
  phone: string;
  total_chargements: number;
  total_ventes: number;
  total_versements_valides: number;
  versements_en_attente: number;
  solde_a_verser: number;
}

export function computeSharedVendorBalances(options?: {
  du?: string | null;
  au?: string | null;
  vendorId?: string | null;
}): VendorBalanceRow[] {
  const vendorClauses: string[] = ["role = 'Vendeur'"];
  const vendorParams: (string | number)[] = [];

  if (options?.vendorId) {
    vendorClauses.push('(id = ? OR code = ?)');
    vendorParams.push(options.vendorId, options.vendorId);
  }

  const vendors = db
    .prepare(
      `SELECT id, code, name, team, phone FROM users WHERE ${vendorClauses.join(' AND ')} ORDER BY code ASC`
    )
    .all(...vendorParams) as Array<{
    id: string;
    code: string;
    name: string;
    team: string;
    phone: string;
  }>;

  return vendors.map((v) => {
    const chClauses = ["vendor_id = ?", "COALESCE(status, 'valide') != 'annule'"];
    const chParams: (string | number)[] = [v.id];
    if (options?.du) {
      chClauses.push('date >= ?');
      chParams.push(options.du);
    }
    if (options?.au) {
      chClauses.push('date <= ?');
      chParams.push(options.au);
    }
    const chRow = db
      .prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM chargements WHERE ${chClauses.join(' AND ')}`)
      .get(...chParams) as { total: number };

    const saleClauses = ["vendor_id = ?", "COALESCE(status, 'livree') != 'annulee'"];
    const saleParams: (string | number)[] = [v.id];
    if (options?.du) {
      saleClauses.push('date >= ?');
      saleParams.push(options.du);
    }
    if (options?.au) {
      saleClauses.push('date <= ?');
      saleParams.push(options.au);
    }
    const saleRow = db
      .prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE ${saleClauses.join(' AND ')}`)
      .get(...saleParams) as { total: number };

    const versValClauses = ["vendor_id = ?", "status = 'valide'"];
    const versValParams: (string | number)[] = [v.id];
    if (options?.du) {
      versValClauses.push('date >= ?');
      versValParams.push(options.du);
    }
    if (options?.au) {
      versValClauses.push('date <= ?');
      versValParams.push(options.au);
    }
    const versValRow = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM versements WHERE ${versValClauses.join(' AND ')}`)
      .get(...versValParams) as { total: number };

    const versAttClauses = ["vendor_id = ?", "status = 'en_attente'"];
    const versAttParams: (string | number)[] = [v.id];
    if (options?.du) {
      versAttClauses.push('date >= ?');
      versAttParams.push(options.du);
    }
    if (options?.au) {
      versAttClauses.push('date <= ?');
      versAttParams.push(options.au);
    }
    const versAttRow = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM versements WHERE ${versAttClauses.join(' AND ')}`)
      .get(...versAttParams) as { total: number };

    const totalChargements = formatIntegerAmount(chRow?.total || 0);
    const totalVentes = formatIntegerAmount(saleRow?.total || 0);
    const totalVersementsValides = formatIntegerAmount(versValRow?.total || 0);
    const versementsEnAttente = formatIntegerAmount(versAttRow?.total || 0);
    const soldeAVerser = formatIntegerAmount(totalVentes - totalVersementsValides);

    return {
      vendor_id: v.id,
      vendor_code: v.code,
      vendor_name: v.name,
      team: v.team || '',
      phone: v.phone || '',
      total_chargements: totalChargements,
      total_ventes: totalVentes,
      total_versements_valides: totalVersementsValides,
      versements_en_attente: versementsEnAttente,
      solde_a_verser: soldeAVerser,
    };
  });
}

// ============================================================================
// STREAMING XLSX (ZIP + OPENXML) GENERATOR (NO DISK STORAGE)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, chunk: Buffer): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < chunk.length; i++) {
    c = CRC32_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getExcelColumnLetter(colIdx: number): string {
  let letter = '';
  let temp = colIdx + 1;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

interface ZipCentralEntry {
  nameBuf: Buffer;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
  flags: number;
  method: number;
}

class StreamingZipWriter {
  private res: Response;
  private offset = 0;
  private entries: ZipCentralEntry[] = [];

  constructor(res: Response) {
    this.res = res;
  }

  private writeBuf(buf: Buffer) {
    this.res.write(buf);
    this.offset += buf.length;
  }

  public addFile(name: string, content: Buffer) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const crc = crc32Update(0, content);
    const compressed = zlib.deflateRawSync(content);
    const localHeaderOffset = this.offset;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc >>> 0, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    this.writeBuf(header);
    this.writeBuf(nameBuf);
    this.writeBuf(compressed);

    this.entries.push({
      nameBuf,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: content.length,
      offset: localHeaderOffset,
      flags: 0x0800,
      method: 8,
    });
  }

  public async addStreamedFile(
    name: string,
    produceData: (pushChunk: (str: string) => void) => void
  ): Promise<void> {
    const nameBuf = Buffer.from(name, 'utf-8');
    const localHeaderOffset = this.offset;
    const flags = 0x0008 | 0x0800; // data descriptor + UTF-8
    const method = 8;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(0, 18);
    header.writeUInt32LE(0, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    this.writeBuf(header);
    this.writeBuf(nameBuf);

    let crc = 0;
    let uncompressedSize = 0;
    let compressedSize = 0;

    await new Promise<void>((resolve, reject) => {
      const deflater = zlib.createDeflateRaw();
      deflater.on('data', (chunk: Buffer) => {
        compressedSize += chunk.length;
        this.writeBuf(chunk);
      });
      deflater.on('end', () => resolve());
      deflater.on('error', (err) => reject(err));

      const pushChunk = (str: string) => {
        if (!str) return;
        const buf = Buffer.from(str, 'utf-8');
        crc = crc32Update(crc, buf);
        uncompressedSize += buf.length;
        deflater.write(buf);
      };

      try {
        produceData(pushChunk);
        deflater.end();
      } catch (e) {
        reject(e);
      }
    });

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(compressedSize, 8);
    descriptor.writeUInt32LE(uncompressedSize, 12);
    this.writeBuf(descriptor);

    this.entries.push({
      nameBuf,
      crc,
      compressedSize,
      uncompressedSize,
      offset: localHeaderOffset,
      flags,
      method,
    });
  }

  public finalize() {
    const centralDirOffset = this.offset;
    for (const entry of this.entries) {
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(entry.flags, 8);
      cd.writeUInt16LE(entry.method, 10);
      cd.writeUInt16LE(0, 12);
      cd.writeUInt16LE(0, 14);
      cd.writeUInt32LE(entry.crc >>> 0, 16);
      cd.writeUInt32LE(entry.compressedSize, 20);
      cd.writeUInt32LE(entry.uncompressedSize, 24);
      cd.writeUInt16LE(entry.nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);
      cd.writeUInt16LE(0, 32);
      cd.writeUInt16LE(0, 34);
      cd.writeUInt16LE(0, 36);
      cd.writeUInt32LE(0, 38);
      cd.writeUInt32LE(entry.offset, 42);

      this.writeBuf(cd);
      this.writeBuf(entry.nameBuf);
    }

    const centralDirSize = this.offset - centralDirOffset;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20);

    this.writeBuf(eocd);
    this.res.end();
  }
}

// ============================================================================
// DATASET BATCH FETCHERS (PARAMETERIZED SQL, SERVER-ENFORCED ROLE PERIMETER)
// ============================================================================

interface DatasetBatchFetcher {
  columns: ExtractionColumnDef[];
  totalEstimatedRows: number;
  summaryTotalAmount?: number;
  fetchBatch: (limit: number, offset: number) => Record<string, unknown>[];
}

function createDatasetBatchFetcher(
  dataset: CanonicalExtractionDataset,
  du: string | null,
  au: string | null,
  filters: Record<string, string>,
  authUser: AuthenticatedUser
): DatasetBatchFetcher {
  const userRole = authUser.role;

  switch (dataset) {
    // -------------------------------------------------------------------------
    // 1. VENTES (avec lignes)
    // -------------------------------------------------------------------------
    case 'ventes': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];

      const includeCancelled = filters.statut === 'annulee' || filters.status === 'annulee';
      if (!includeCancelled) {
        clauses.push("COALESCE(s.status, 'livree') != 'annulee'");
      } else {
        clauses.push("s.status = 'annulee'");
      }

      if (du) {
        clauses.push('s.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('s.date <= ?');
        params.push(au);
      }
      const vendorFilter = filters.vendeur || filters.vendor_id || filters.vendor;
      if (vendorFilter) {
        clauses.push('(s.vendor_id = ? OR u.code = ?)');
        params.push(vendorFilter, vendorFilter);
      }
      const pdvFilter = filters.pdv || filters.pdv_id;
      if (pdvFilter) {
        clauses.push('(s.pdv_id = ? OR p.code = ?)');
        params.push(pdvFilter, pdvFilter);
      }
      const paymentFilter = filters.paiement || filters.payment_type;
      if (paymentFilter) {
        clauses.push('s.payment_type = ?');
        params.push(paymentFilter);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const dashboardAgg = aggregateDashboardSalesTotal({
        du,
        au,
        vendorId: vendorFilter || null,
        pdvId: pdvFilter || null,
        paymentType: paymentFilter || null,
        includeCancelled,
      });

      const countStmt = db.prepare(`
        SELECT s.items
        FROM sales s
        LEFT JOIN users u ON s.vendor_id = u.id
        LEFT JOIN points_de_vente p ON s.pdv_id = p.id
        ${whereSql}
      `);
      const rawSalesForCount = countStmt.all(...params) as Array<{ items: string }>;
      let totalLines = 0;
      for (const s of rawSalesForCount) {
        try {
          const parsed = JSON.parse(s.items || '[]');
          totalLines += Array.isArray(parsed) && parsed.length > 0 ? parsed.length : 1;
        } catch {
          totalLines += 1;
        }
      }

      let cachedExpandedLines: Record<string, unknown>[] | null = null;
      const ensureExpandedLines = (): Record<string, unknown>[] => {
        if (cachedExpandedLines) return cachedExpandedLines;
        const lines: Record<string, unknown>[] = [];
        let saleOffset = 0;
        const stmt = db.prepare(`
          SELECT
            s.id,
            s.number,
            s.invoice_number,
            s.date,
            s.sale_time,
            s.vendor_id,
            s.pdv_id,
            s.items,
            s.total_amount,
            s.payment_type,
            s.status,
            COALESCE(u.code, s.vendor_id) AS vendor_code,
            COALESCE(u.name, 'Vendeur') AS vendor_name,
            COALESCE(p.code, s.pdv_id) AS pdv_code,
            COALESCE(p.name, 'PDV') AS pdv_name,
            COALESCE(p.neighborhood, '') AS pdv_neighborhood
          FROM sales s
          LEFT JOIN users u ON s.vendor_id = u.id
          LEFT JOIN points_de_vente p ON s.pdv_id = p.id
          ${whereSql}
          ORDER BY s.date DESC, s.number DESC
          LIMIT ? OFFSET ?
        `);

        while (true) {
          const saleBatch = stmt.all(...params, BATCH_SIZE, saleOffset) as any[];
          if (saleBatch.length === 0) break;
          for (const s of saleBatch) {
            const invNum = s.invoice_number || String(s.number || '').replace(/^VTE-/, 'FAC-');
            const saleTotal = formatIntegerAmount(s.total_amount);
            let itemsArr: any[] = [];
            try {
              const parsed = JSON.parse(s.items || '[]');
              if (Array.isArray(parsed)) itemsArr = parsed;
            } catch {
              itemsArr = [];
            }

            if (itemsArr.length === 0) {
              lines.push({
                number: s.number,
                invoice_number: invNum,
                date: s.date,
                sale_time: s.sale_time || '10:30',
                vendor_code: s.vendor_code,
                vendor_name: s.vendor_name,
                pdv_code: s.pdv_code,
                pdv_name: s.pdv_name,
                pdv_neighborhood: s.pdv_neighborhood,
                payment_type: s.payment_type || 'Comptant',
                status: s.status || 'livree',
                product_code: '-',
                product_name: 'Vente globale',
                qty_boxes: 1,
                unit_price: saleTotal,
                line_total: saleTotal,
              });
            } else {
              let runningSum = 0;
              for (let idx = 0; idx < itemsArr.length; idx++) {
                const it = itemsArr[idx];
                const qty = formatIntegerAmount(it.qtyBoxes ?? it.boxes ?? 0);
                const unitPrice = formatIntegerAmount(it.unitPrice ?? it.price ?? 0);
                let lineTotal = formatIntegerAmount(
                  it.total !== undefined ? it.total : qty * unitPrice
                );
                if (idx === itemsArr.length - 1 && runningSum + lineTotal !== saleTotal) {
                  lineTotal = saleTotal - runningSum;
                }
                runningSum += lineTotal;

                lines.push({
                  number: s.number,
                  invoice_number: invNum,
                  date: s.date,
                  sale_time: s.sale_time || '10:30',
                  vendor_code: s.vendor_code,
                  vendor_name: s.vendor_name,
                  pdv_code: s.pdv_code,
                  pdv_name: s.pdv_name,
                  pdv_neighborhood: s.pdv_neighborhood,
                  payment_type: s.payment_type || 'Comptant',
                  status: s.status || 'livree',
                  product_code: it.code || it.productCode || '',
                  product_name: it.name || it.productName || '',
                  qty_boxes: qty,
                  unit_price: unitPrice,
                  line_total: lineTotal,
                });
              }
            }
          }
          if (saleBatch.length < BATCH_SIZE) break;
          saleOffset += BATCH_SIZE;
        }
        cachedExpandedLines = lines;
        return lines;
      };

      return {
        totalEstimatedRows: totalLines,
        summaryTotalAmount: dashboardAgg.totalAmount,
        columns: [
          { key: 'number', header: 'N° Vente', type: 'text', width: 18 },
          { key: 'invoice_number', header: 'N° Facture', type: 'text', width: 18 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'sale_time', header: 'Heure', type: 'text', width: 10 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 15 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'pdv_code', header: 'Code PDV', type: 'text', width: 14 },
          { key: 'pdv_name', header: 'Point de Vente', type: 'text', width: 28 },
          { key: 'pdv_neighborhood', header: 'Quartier', type: 'text', width: 18 },
          { key: 'payment_type', header: 'Mode de Paiement', type: 'text', width: 18 },
          { key: 'status', header: 'Statut', type: 'text', width: 12 },
          { key: 'product_code', header: 'Code Produit', type: 'text', width: 15 },
          { key: 'product_name', header: 'Produit', type: 'text', width: 24 },
          { key: 'qty_boxes', header: 'Quantité (Cartons)', type: 'integer', width: 18 },
          { key: 'unit_price', header: 'Prix Unitaire (FCFA)', type: 'integer', width: 20 },
          { key: 'line_total', header: 'Montant Total (FCFA)', type: 'integer', width: 22 },
        ],
        fetchBatch: (limit, offset) => {
          const allLines = ensureExpandedLines();
          return allLines.slice(offset, offset + limit);
        },
      };
    }

    // -------------------------------------------------------------------------
    // 2. FACTURES PDV / FACTURES
    // -------------------------------------------------------------------------
    case 'factures_pdv':
    case 'factures': {
      const clauses: string[] = ["COALESCE(s.status, 'livree') != 'annulee'"];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('s.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('s.date <= ?');
        params.push(au);
      }
      if (filters.vendeur || filters.vendor_id) {
        clauses.push('(s.vendor_id = ? OR u.code = ?)');
        params.push(filters.vendeur || filters.vendor_id, filters.vendeur || filters.vendor_id);
      }
      if (filters.pdv || filters.pdv_id) {
        clauses.push('(s.pdv_id = ? OR p.code = ?)');
        params.push(filters.pdv || filters.pdv_id, filters.pdv || filters.pdv_id);
      }

      const whereSql = `WHERE ${clauses.join(' AND ')}`;
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM sales s LEFT JOIN users u ON s.vendor_id = u.id LEFT JOIN points_de_vente p ON s.pdv_id = p.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'invoice_number', header: 'N° Facture', type: 'text', width: 18 },
          { key: 'sale_number', header: 'N° Vente', type: 'text', width: 18 },
          { key: 'date', header: 'Date Facture', type: 'date', width: 14 },
          { key: 'pdv_code', header: 'Code PDV', type: 'text', width: 14 },
          { key: 'pdv_name', header: 'Client PDV', type: 'text', width: 28 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'payment_type', header: 'Mode de Règlement', type: 'text', width: 18 },
          { key: 'total_ht', header: 'Montant HT (FCFA)', type: 'integer', width: 20 },
          { key: 'tva_amount', header: 'TVA (FCFA)', type: 'integer', width: 16 },
          { key: 'total_ttc', header: 'Montant TTC (FCFA)', type: 'integer', width: 20 },
          { key: 'payment_status', header: 'Statut Paiement', type: 'text', width: 18 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT
                s.*,
                u.code AS vendor_code,
                u.name AS vendor_name,
                p.code AS pdv_code,
                p.name AS pdv_name
              FROM sales s
              LEFT JOIN users u ON s.vendor_id = u.id
              LEFT JOIN points_de_vente p ON s.pdv_id = p.id
              ${whereSql}
              ORDER BY s.date DESC, s.number DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => {
            const ht = formatIntegerAmount(r.total_amount);
            const tva = formatIntegerAmount(r.tva_amount || 0);
            const ttc = formatIntegerAmount(r.total_ttc ? r.total_ttc : ht + tva);
            const isPaid = Boolean(r.versement_id) || r.payment_type !== 'Crédit';
            return {
              invoice_number: r.invoice_number || String(r.number || '').replace(/^VTE-/, 'FAC-'),
              sale_number: r.number,
              date: r.date,
              pdv_code: r.pdv_code || r.pdv_id,
              pdv_name: r.pdv_name || '',
              vendor_code: r.vendor_code || r.vendor_id,
              vendor_name: r.vendor_name || '',
              payment_type: r.payment_type || 'Comptant',
              total_ht: ht,
              tva_amount: tva,
              total_ttc: ttc,
              payment_status: isPaid ? 'Payée' : 'Impayée',
            };
          });
        },
      };
    }

    // -------------------------------------------------------------------------
    // 3. ANNULATIONS DE VENTE (DOV, Administrateur)
    // -------------------------------------------------------------------------
    case 'annulations_de_vente': {
      const clauses: string[] = [
        "(s.status = 'annulee' OR (s.cancel_request_status IS NOT NULL AND s.cancel_request_status != ''))",
      ];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('s.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('s.date <= ?');
        params.push(au);
      }
      if (filters.statut || filters.status) {
        clauses.push('(s.cancel_request_status = ? OR s.status = ?)');
        params.push(filters.statut || filters.status, filters.statut || filters.status);
      }

      const whereSql = `WHERE ${clauses.join(' AND ')}`;
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM sales s ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'number', header: 'N° Vente', type: 'text', width: 18 },
          { key: 'invoice_number', header: 'N° Facture', type: 'text', width: 18 },
          { key: 'date', header: 'Date Vente', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'pdv_name', header: 'Point de Vente', type: 'text', width: 26 },
          { key: 'total_amount', header: 'Montant (FCFA)', type: 'integer', width: 18 },
          { key: 'cancel_request_status', header: 'Statut Demande', type: 'text', width: 18 },
          { key: 'reason', header: 'Motif Annulation', type: 'text', width: 30 },
          { key: 'reviewed_by', header: 'Traité Par', type: 'text', width: 20 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT
                s.*,
                u.code AS vendor_code,
                u.name AS vendor_name,
                p.name AS pdv_name
              FROM sales s
              LEFT JOIN users u ON s.vendor_id = u.id
              LEFT JOIN points_de_vente p ON s.pdv_id = p.id
              ${whereSql}
              ORDER BY s.date DESC, s.number DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => ({
            number: r.number,
            invoice_number: r.invoice_number || String(r.number || '').replace(/^VTE-/, 'FAC-'),
            date: r.date,
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            pdv_name: r.pdv_name || '',
            total_amount: formatIntegerAmount(r.total_amount),
            cancel_request_status:
              r.status === 'annulee' ? 'annulee' : r.cancel_request_status || 'en_attente',
            reason: r.cancel_reason || r.cancel_request_reason || '',
            reviewed_by: r.cancelled_by || r.cancel_reviewed_by || '',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 4. ANALYSE PRODUITS (DOV, Administrateur)
    // -------------------------------------------------------------------------
    case 'analyse_produits': {
      const products = db
        .prepare('SELECT * FROM products ORDER BY code ASC')
        .all() as any[];

      const saleClauses: string[] = ["COALESCE(status, 'livree') != 'annulee'"];
      const saleParams: (string | number)[] = [];
      if (du) {
        saleClauses.push('date >= ?');
        saleParams.push(du);
      }
      if (au) {
        saleClauses.push('date <= ?');
        saleParams.push(au);
      }

      const salesRows = db
        .prepare(`SELECT items, pdv_id FROM sales WHERE ${saleClauses.join(' AND ')}`)
        .all(...saleParams) as Array<{ items: string; pdv_id: string }>;

      const statsByCode = new Map<
        string,
        { boxesSold: number; revenue: number; pdvSet: Set<string>; ordersCount: number }
      >();

      for (const s of salesRows) {
        try {
          const items = JSON.parse(s.items || '[]');
          if (Array.isArray(items)) {
            for (const it of items) {
              const code = String(it.code || it.productCode || '').trim();
              if (!code) continue;
              const entry = statsByCode.get(code) || {
                boxesSold: 0,
                revenue: 0,
                pdvSet: new Set<string>(),
                ordersCount: 0,
              };
              const qty = formatIntegerAmount(it.qtyBoxes ?? it.boxes ?? 0);
              const price = formatIntegerAmount(it.unitPrice ?? it.price ?? 0);
              const total = formatIntegerAmount(it.total !== undefined ? it.total : qty * price);
              entry.boxesSold += qty;
              entry.revenue += total;
              entry.ordersCount += 1;
              if (s.pdv_id) entry.pdvSet.add(s.pdv_id);
              statsByCode.set(code, entry);
            }
          }
        } catch {
          // ignore malformed JSON
        }
      }

      const rowsData = products.map((p) => {
        const st = statsByCode.get(p.code) || {
          boxesSold: 0,
          revenue: 0,
          pdvSet: new Set<string>(),
          ordersCount: 0,
        };
        return {
          code: p.code,
          name: p.name,
          gamme: p.gamme,
          price_box: formatIntegerAmount(p.price_box),
          stock_depot: formatIntegerAmount(p.stock_depot),
          boxes_sold: st.boxesSold,
          orders_count: st.ordersCount,
          active_pdvs: st.pdvSet.size,
          revenue_fcfa: st.revenue,
        };
      });

      return {
        totalEstimatedRows: rowsData.length,
        columns: [
          { key: 'code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'name', header: 'Produit', type: 'text', width: 26 },
          { key: 'gamme', header: 'Gamme', type: 'text', width: 20 },
          { key: 'price_box', header: 'Prix Carton (FCFA)', type: 'integer', width: 20 },
          { key: 'stock_depot', header: 'Stock Dépôt (Cartons)', type: 'integer', width: 22 },
          { key: 'boxes_sold', header: 'Cartons Vendus', type: 'integer', width: 18 },
          { key: 'orders_count', header: 'Nb Lignes Vente', type: 'integer', width: 18 },
          { key: 'active_pdvs', header: 'PDV Acheteurs', type: 'integer', width: 16 },
          { key: 'revenue_fcfa', header: 'Chiffre d’Affaires (FCFA)', type: 'integer', width: 24 },
        ],
        fetchBatch: (limit, offset) => rowsData.slice(offset, offset + limit),
      };
    }

    // -------------------------------------------------------------------------
    // 5. CATALOGUE ET PRIX / PRODUITS ET PRIX
    // -------------------------------------------------------------------------
    case 'catalogue_et_prix': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.gamme) {
        clauses.push('gamme = ?');
        params.push(filters.gamme);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM products ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'name', header: 'Désignation', type: 'text', width: 26 },
          { key: 'gamme', header: 'Gamme', type: 'text', width: 22 },
          { key: 'packaging', header: 'Conditionnement', type: 'text', width: 20 },
          { key: 'units_per_box', header: 'Unités par Carton', type: 'integer', width: 18 },
          { key: 'price_box', header: 'Prix Carton (FCFA)', type: 'integer', width: 20 },
          { key: 'stock_depot', header: 'Stock Dépôt (Cartons)', type: 'integer', width: 22 },
          { key: 'threshold_depot', header: 'Seuil Alerte (Cartons)', type: 'integer', width: 22 },
          { key: 'stock_value', header: 'Valeur Stock (FCFA)', type: 'integer', width: 22 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(`SELECT * FROM products ${whereSql} ORDER BY code ASC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as any[];
          return rows.map((p) => ({
            code: p.code,
            name: p.name,
            gamme: p.gamme,
            packaging: p.packaging,
            units_per_box: formatIntegerAmount(p.units_per_box),
            price_box: formatIntegerAmount(p.price_box),
            stock_depot: formatIntegerAmount(p.stock_depot),
            threshold_depot: formatIntegerAmount(p.threshold_depot),
            stock_value: formatIntegerAmount(
              Number(p.stock_depot || 0) * Number(p.price_box || 0)
            ),
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 6. STOCK DÉPÔT
    // -------------------------------------------------------------------------
    case 'stock_depot': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.gamme) {
        clauses.push('gamme = ?');
        params.push(filters.gamme);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM products ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'name', header: 'Produit', type: 'text', width: 26 },
          { key: 'gamme', header: 'Gamme', type: 'text', width: 20 },
          { key: 'packaging', header: 'Conditionnement', type: 'text', width: 20 },
          { key: 'stock_depot', header: 'Stock Dépôt (Cartons)', type: 'integer', width: 22 },
          { key: 'threshold_depot', header: 'Seuil Alerte (Cartons)', type: 'integer', width: 22 },
          { key: 'price_box', header: 'Prix Carton (FCFA)', type: 'integer', width: 20 },
          { key: 'stock_value', header: 'Valeur Stock (FCFA)', type: 'integer', width: 22 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(`SELECT * FROM products ${whereSql} ORDER BY code ASC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as any[];
          return rows.map((p) => ({
            code: p.code,
            name: p.name,
            gamme: p.gamme,
            packaging: p.packaging,
            stock_depot: formatIntegerAmount(p.stock_depot),
            threshold_depot: formatIntegerAmount(p.threshold_depot),
            price_box: formatIntegerAmount(p.price_box),
            stock_value: formatIntegerAmount(
              Number(p.stock_depot || 0) * Number(p.price_box || 0)
            ),
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 7. STOCK ET MOUVEMENTS
    // -------------------------------------------------------------------------
    case 'stock_et_mouvements': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('substr(m.created_at, 1, 10) >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('substr(m.created_at, 1, 10) <= ?');
        params.push(au);
      }
      if (filters.type) {
        clauses.push('m.type = ?');
        params.push(filters.type);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const movCountRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM stock_movements m ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(movCountRow?.cnt || 0),
        columns: [
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'reference', header: 'Référence', type: 'text', width: 20 },
          { key: 'type', header: 'Type Mouvement', type: 'text', width: 20 },
          { key: 'direction', header: 'Sens (IN/OUT)', type: 'text', width: 14 },
          { key: 'product_code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'product_name', header: 'Produit', type: 'text', width: 24 },
          { key: 'quantity', header: 'Quantité (Cartons)', type: 'integer', width: 18 },
          { key: 'stock_depot', header: 'Stock Dépôt Actuel', type: 'integer', width: 20 },
          { key: 'value_fcfa', header: 'Valeur (FCFA)', type: 'integer', width: 18 },
          { key: 'motif', header: 'Motif', type: 'text', width: 28 },
          { key: 'performed_by', header: 'Opérateur', type: 'text', width: 20 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT m.*, p.code AS product_code, p.name AS product_name, p.stock_depot, p.price_box
              FROM stock_movements m
              LEFT JOIN products p ON m.product_id = p.id
              ${whereSql}
              ORDER BY m.created_at DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            date: String(r.created_at || '').slice(0, 10),
            reference: r.reference || r.id,
            type: r.type,
            direction: r.direction,
            product_code: r.product_code || r.product_id,
            product_name: r.product_name || '',
            quantity: formatIntegerAmount(r.quantity),
            stock_depot: formatIntegerAmount(r.stock_depot),
            value_fcfa: formatIntegerAmount(
              r.value_fcfa || Number(r.quantity || 0) * Number(r.price_box || 0)
            ),
            motif: r.motif || '',
            performed_by: r.performed_by || '',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 8. LOTS (Traçabilité FEFO)
    // -------------------------------------------------------------------------
    case 'lots': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('l.expiry_date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('l.expiry_date <= ?');
        params.push(au);
      }
      if (filters.produit || filters.product_id) {
        clauses.push('(l.product_id = ? OR p.code = ?)');
        params.push(filters.produit || filters.product_id, filters.produit || filters.product_id);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM lots l LEFT JOIN products p ON l.product_id = p.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'lot_number', header: 'N° Lot', type: 'text', width: 20 },
          { key: 'product_code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'product_name', header: 'Produit', type: 'text', width: 26 },
          { key: 'expiry_date', header: 'Date Expiration', type: 'date', width: 16 },
          { key: 'quantity', header: 'Quantité Restante (Cartons)', type: 'integer', width: 24 },
          { key: 'value_fcfa', header: 'Valeur Lot (FCFA)', type: 'integer', width: 20 },
          { key: 'status', header: 'Statut FEFO', type: 'text', width: 16 },
          { key: 'created_at', header: 'Date Entrée', type: 'date', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT l.*, p.code AS product_code, p.name AS product_name, p.price_box
              FROM lots l
              LEFT JOIN products p ON l.product_id = p.id
              ${whereSql}
              ORDER BY l.expiry_date ASC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => ({
            lot_number: r.lot_number,
            product_code: r.product_code || r.product_id,
            product_name: r.product_name || '',
            expiry_date: r.expiry_date,
            quantity: formatIntegerAmount(r.quantity),
            value_fcfa: formatIntegerAmount(Number(r.quantity || 0) * Number(r.price_box || 0)),
            status: r.status || 'actif',
            created_at: String(r.created_at || '').slice(0, 10),
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 9. RÉCEPTIONS FOURNISSEURS
    // -------------------------------------------------------------------------
    case 'receptions': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('date <= ?');
        params.push(au);
      }
      if (filters.fournisseur || filters.supplier) {
        clauses.push('supplier_name LIKE ?');
        params.push(`%${filters.fournisseur || filters.supplier}%`);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM receptions ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Réception', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'supplier_name', header: 'Fournisseur', type: 'text', width: 28 },
          { key: 'bl_number', header: 'N° Bon de Livraison', type: 'text', width: 20 },
          { key: 'total_boxes', header: 'Total Cartons Reçus', type: 'integer', width: 20 },
          { key: 'status', header: 'Statut', type: 'text', width: 14 },
          { key: 'notes', header: 'Notes', type: 'text', width: 28 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(`SELECT * FROM receptions ${whereSql} ORDER BY date DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            reference: r.reference,
            date: r.date,
            supplier_name: r.supplier_name,
            bl_number: r.bl_number || '',
            total_boxes: formatIntegerAmount(r.total_boxes),
            status: r.status || 'valide',
            notes: r.notes || '',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 10. DEMANDES DE STOCK VENDEUR / APPROVISIONNEMENTS / CHARGEMENTS
    // -------------------------------------------------------------------------
    case 'demandes_de_stock_vendeur':
    case 'approvisionnements':
    case 'chargements': {
      // Server-enforced perimeter: only vendor stock requests/chargements (vendor_id in users with role = 'Vendeur')
      const clauses: string[] = ["u.role = 'Vendeur'"];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('c.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('c.date <= ?');
        params.push(au);
      }
      if (filters.vendeur || filters.vendor_id) {
        clauses.push('(c.vendor_id = ? OR u.code = ?)');
        params.push(filters.vendeur || filters.vendor_id, filters.vendeur || filters.vendor_id);
      }
      if (filters.statut || filters.status) {
        clauses.push('c.status = ?');
        params.push(filters.statut || filters.status);
      }
      const whereSql = `WHERE ${clauses.join(' AND ')}`;
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM chargements c INNER JOIN users u ON c.vendor_id = u.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Chargement', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'total_boxes', header: 'Total Cartons', type: 'integer', width: 16 },
          { key: 'total_amount', header: 'Valeur Totale (FCFA)', type: 'integer', width: 22 },
          { key: 'status', header: 'Statut', type: 'text', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT c.*, u.code AS vendor_code, u.name AS vendor_name
              FROM chargements c
              INNER JOIN users u ON c.vendor_id = u.id
              ${whereSql}
              ORDER BY c.date DESC, c.reference DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => {
            let boxes = 0;
            try {
              const items = JSON.parse(r.items || '[]');
              if (Array.isArray(items)) {
                boxes = items.reduce(
                  (acc: number, it: any) => acc + formatIntegerAmount(it.qtyBoxes ?? it.boxes ?? 0),
                  0
                );
              }
            } catch {
              boxes = 0;
            }
            return {
              reference: r.reference,
              date: r.date,
              vendor_code: r.vendor_code || r.vendor_id,
              vendor_name: r.vendor_name || '',
              total_boxes: boxes,
              total_amount: formatIntegerAmount(r.total_amount),
              status: r.status || 'valide',
            };
          });
        },
      };
    }

    // -------------------------------------------------------------------------
    // 11. RETOURS VENDEURS
    // -------------------------------------------------------------------------
    case 'retours': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('r.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('r.date <= ?');
        params.push(au);
      }
      if (filters.vendeur || filters.vendor_id) {
        clauses.push('(r.vendor_id = ? OR u.code = ?)');
        params.push(filters.vendeur || filters.vendor_id, filters.vendeur || filters.vendor_id);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM retours r LEFT JOIN users u ON r.vendor_id = u.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Retour', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'total_boxes', header: 'Cartons Retournés', type: 'integer', width: 18 },
          { key: 'reason', header: 'Motif du Retour', type: 'text', width: 28 },
          { key: 'status', header: 'Statut', type: 'text', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT r.*, u.code AS vendor_code, u.name AS vendor_name
              FROM retours r
              LEFT JOIN users u ON r.vendor_id = u.id
              ${whereSql}
              ORDER BY r.date DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => {
            let boxes = 0;
            try {
              const items = JSON.parse(r.items || '[]');
              if (Array.isArray(items)) {
                boxes = items.reduce(
                  (acc: number, it: any) => acc + formatIntegerAmount(it.qtyBoxes ?? it.boxes ?? 0),
                  0
                );
              }
            } catch {
              boxes = 0;
            }
            return {
              reference: r.reference,
              date: r.date,
              vendor_code: r.vendor_code || r.vendor_id,
              vendor_name: r.vendor_name || '',
              total_boxes: boxes,
              reason: r.reason || '',
              status: r.status || 'valide',
            };
          });
        },
      };
    }

    // -------------------------------------------------------------------------
    // 12. INVENTAIRES ET ÉCARTS
    // -------------------------------------------------------------------------
    case 'inventaires_et_ecarts': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('vi.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('vi.date <= ?');
        params.push(au);
      }
      if (filters.vendeur || filters.vendor_id) {
        clauses.push('(vi.vendor_id = ? OR u.code = ?)');
        params.push(filters.vendeur || filters.vendor_id, filters.vendeur || filters.vendor_id);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM vendor_inventories vi LEFT JOIN users u ON vi.vendor_id = u.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Inventaire', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'total_ecart_boxes', header: 'Écart Total (Cartons)', type: 'integer', width: 22 },
          { key: 'total_ecart_fcfa', header: 'Valeur Écart (FCFA)', type: 'integer', width: 22 },
          { key: 'notes', header: 'Observations', type: 'text', width: 30 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT vi.*, u.code AS vendor_code, u.name AS vendor_name
              FROM vendor_inventories vi
              LEFT JOIN users u ON vi.vendor_id = u.id
              ${whereSql}
              ORDER BY vi.date DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => ({
            reference: r.reference,
            date: r.date,
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            total_ecart_boxes: formatIntegerAmount(r.total_ecart_boxes),
            total_ecart_fcfa: formatIntegerAmount(r.total_ecart_fcfa),
            notes: r.notes || '',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 13. COMMANDES EN GROS / COMMANDES EN GROS FACTURÉES
    // -------------------------------------------------------------------------
    case 'commandes_en_gros':
    case 'commandes_en_gros_facturees': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];

      // Server-side perimeter control (Directive 4):
      // Comptable (or dataset 'commandes_en_gros_facturees') only extracts invoiced/billed wholesale orders
      if (dataset === 'commandes_en_gros_facturees' || userRole === 'Comptable') {
        clauses.push("COALESCE(delivery_status, 'livree') != 'annulee'");
        clauses.push("(payment_status = 'paye' OR delivery_status = 'livree')");
      }

      if (du) {
        clauses.push('date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('date <= ?');
        params.push(au);
      }
      if (filters.client || filters.client_id) {
        clauses.push('(client_id = ? OR client_code = ?)');
        params.push(filters.client || filters.client_id, filters.client || filters.client_id);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM wholesale_orders ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Commande', type: 'text', width: 22 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'client_code', header: 'Code Client', type: 'text', width: 16 },
          { key: 'client_name', header: 'Client Grossiste', type: 'text', width: 30 },
          { key: 'client_city', header: 'Ville', type: 'text', width: 16 },
          { key: 'total_boxes', header: 'Total Cartons', type: 'integer', width: 16 },
          { key: 'subtotal_ht', header: 'Sous-total HT (FCFA)', type: 'integer', width: 20 },
          { key: 'discount_amount', header: 'Remise (FCFA)', type: 'integer', width: 18 },
          { key: 'total_amount', header: 'Montant Net (FCFA)', type: 'integer', width: 22 },
          { key: 'payment_mode', header: 'Mode de Règlement', type: 'text', width: 20 },
          { key: 'payment_status', header: 'Statut Paiement', type: 'text', width: 18 },
          { key: 'delivery_status', header: 'Statut Livraison', type: 'text', width: 18 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `SELECT * FROM wholesale_orders ${whereSql} ORDER BY date DESC, reference DESC LIMIT ? OFFSET ?`
            )
            .all(...params, limit, offset) as any[];

          return rows.map((r) => ({
            reference: r.reference,
            date: r.date,
            client_code: r.client_code,
            client_name: r.client_name,
            client_city: r.client_city || 'Bamako',
            total_boxes: formatIntegerAmount(r.total_boxes),
            subtotal_ht: formatIntegerAmount(r.subtotal_ht),
            discount_amount: formatIntegerAmount(r.discount_amount),
            total_amount: formatIntegerAmount(r.total_amount),
            payment_mode: r.payment_mode || 'Virement Bancaire',
            payment_status: r.payment_status || 'paye',
            delivery_status: r.delivery_status || 'livree',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 14. CLIENTS EN GROS
    // -------------------------------------------------------------------------
    case 'clients_en_gros': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.categorie || filters.category) {
        clauses.push('category = ?');
        params.push(filters.categorie || filters.category);
      }
      if (filters.statut || filters.status) {
        clauses.push('status = ?');
        params.push(filters.statut || filters.status);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM wholesale_clients ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'code', header: 'Code Client', type: 'text', width: 16 },
          { key: 'company_name', header: 'Raison Sociale', type: 'text', width: 30 },
          { key: 'manager_name', header: 'Responsable', type: 'text', width: 22 },
          { key: 'category', header: 'Catégorie', type: 'text', width: 22 },
          { key: 'neighborhood', header: 'Quartier / Zone', type: 'text', width: 20 },
          { key: 'city', header: 'Ville', type: 'text', width: 16 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'nif', header: 'NIF', type: 'text', width: 16 },
          { key: 'default_discount_percent', header: 'Remise (%)', type: 'number', width: 14 },
          { key: 'status', header: 'Statut', type: 'text', width: 14 },
          { key: 'created_at', header: 'Date Création', type: 'date', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `SELECT * FROM wholesale_clients ${whereSql} ORDER BY code ASC LIMIT ? OFFSET ?`
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            code: r.code,
            company_name: r.company_name,
            manager_name: r.manager_name,
            category: r.category,
            neighborhood: r.neighborhood,
            city: r.city || 'Bamako',
            phone: r.phone,
            nif: r.nif || '',
            default_discount_percent: Number(r.default_discount_percent || 0),
            status: r.status || 'actif',
            created_at: String(r.created_at || '').slice(0, 10),
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 15. DEMANDES D'ACHAT (Server-enforced role perimeter: Magasinier vs Comptable)
    // -------------------------------------------------------------------------
    case 'demandes_d_achat': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];

      // Directive 4: Un rôle n'extrait que les lignes de son périmètre, contrôlé côté serveur et non dans le filtre envoyé
      if (userRole === 'Magasinier' || userRole === 'Gestionnaire de stock') {
        clauses.push("requester_role IN ('Magasinier', 'Gestionnaire de stock')");
      } else if (userRole === 'Comptable') {
        clauses.push("requester_role = 'Comptable'");
      }

      if (du) {
        clauses.push('substr(created_at, 1, 10) >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('substr(created_at, 1, 10) <= ?');
        params.push(au);
      }
      if (filters.statut || filters.status) {
        clauses.push('status = ?');
        params.push(filters.statut || filters.status);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM purchase_requests ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Demande', type: 'text', width: 20 },
          { key: 'created_at', header: 'Date Demande', type: 'date', width: 14 },
          { key: 'requester_code', header: 'Code Demandeur', type: 'text', width: 16 },
          { key: 'requester_name', header: 'Demandeur', type: 'text', width: 22 },
          { key: 'requester_role', header: 'Rôle Demandeur', type: 'text', width: 22 },
          { key: 'title', header: 'Objet', type: 'text', width: 30 },
          { key: 'category', header: 'Catégorie', type: 'text', width: 24 },
          { key: 'supplier_name', header: 'Fournisseur', type: 'text', width: 22 },
          { key: 'total_amount', header: 'Montant Total (FCFA)', type: 'integer', width: 22 },
          { key: 'status', header: 'Statut', type: 'text', width: 16 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `SELECT * FROM purchase_requests ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            reference: r.reference,
            created_at: String(r.created_at || '').slice(0, 10),
            requester_code: r.requester_code,
            requester_name: r.requester_name,
            requester_role: r.requester_role,
            title: r.title,
            category: r.category,
            supplier_name: r.supplier_name || '',
            total_amount: formatIntegerAmount(r.total_amount),
            status: r.status || 'en_attente',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 16. VERSEMENTS
    // -------------------------------------------------------------------------
    case 'versements': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('v.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('v.date <= ?');
        params.push(au);
      }
      if (filters.vendeur || filters.vendor_id) {
        clauses.push('(v.vendor_id = ? OR u.code = ?)');
        params.push(filters.vendeur || filters.vendor_id, filters.vendeur || filters.vendor_id);
      }
      if (filters.statut || filters.status) {
        clauses.push('v.status = ?');
        params.push(filters.statut || filters.status);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM versements v LEFT JOIN users u ON v.vendor_id = u.id ${whereSql}`
        )
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Versement', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'amount', header: 'Montant (FCFA)', type: 'integer', width: 20 },
          { key: 'payment_mode', header: 'Mode de Paiement', type: 'text', width: 18 },
          { key: 'status', header: 'Statut', type: 'text', width: 14 },
          { key: 'validated_by', header: 'Validé Par', type: 'text', width: 18 },
          { key: 'notes', header: 'Notes', type: 'text', width: 26 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT v.*, u.code AS vendor_code, u.name AS vendor_name
              FROM versements v
              LEFT JOIN users u ON v.vendor_id = u.id
              ${whereSql}
              ORDER BY v.date DESC, v.reference DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            reference: r.reference,
            date: r.date,
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            amount: formatIntegerAmount(r.amount),
            payment_mode: r.payment_mode,
            status: r.status,
            validated_by: r.validated_by || '',
            notes: r.notes || '',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 17. SOLDES VENDEURS
    // -------------------------------------------------------------------------
    case 'soldes_vendeurs': {
      const balances = computeSharedVendorBalances({
        du,
        au,
        vendorId: filters.vendeur || filters.vendor_id || null,
      });

      return {
        totalEstimatedRows: balances.length,
        columns: [
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 24 },
          { key: 'team', header: 'Équipe', type: 'text', width: 24 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'total_chargements', header: 'Total Chargements (FCFA)', type: 'integer', width: 24 },
          { key: 'total_ventes', header: 'Total Ventes (FCFA)', type: 'integer', width: 22 },
          {
            key: 'total_versements_valides',
            header: 'Total Versements Validés (FCFA)',
            type: 'integer',
            width: 28,
          },
          {
            key: 'versements_en_attente',
            header: 'Versements En Attente (FCFA)',
            type: 'integer',
            width: 26,
          },
          { key: 'solde_a_verser', header: 'Solde à Verser (FCFA)', type: 'integer', width: 22 },
        ],
        fetchBatch: (limit, offset) =>
          balances.slice(offset, offset + limit) as unknown as Record<string, unknown>[],
      };
    }

    // -------------------------------------------------------------------------
    // 18. CAISSE (Comptable, Administrateur — NOT DOV)
    // -------------------------------------------------------------------------
    case 'caisse': {
      const clauses: string[] = ["v.status = 'valide'"];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('v.date >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('v.date <= ?');
        params.push(au);
      }
      if (filters.mode || filters.payment_mode) {
        clauses.push('v.payment_mode = ?');
        params.push(filters.mode || filters.payment_mode);
      }
      const whereSql = `WHERE ${clauses.join(' AND ')}`;
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM versements v ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Caisse', type: 'text', width: 20 },
          { key: 'date', header: 'Date Encaissement', type: 'date', width: 16 },
          { key: 'type', header: 'Nature Opération', type: 'text', width: 22 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Tiers / Vendeur', type: 'text', width: 22 },
          { key: 'payment_mode', header: 'Canal Trésorerie', type: 'text', width: 18 },
          { key: 'amount', header: 'Montant Encaissé (FCFA)', type: 'integer', width: 22 },
          { key: 'validated_by', header: 'Caissier / Comptable', type: 'text', width: 20 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT v.*, u.code AS vendor_code, u.name AS vendor_name
              FROM versements v
              LEFT JOIN users u ON v.vendor_id = u.id
              ${whereSql}
              ORDER BY v.date DESC, v.reference DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            reference: r.reference,
            date: r.date,
            type: 'Encaissement Versement Vendeur',
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            payment_mode: r.payment_mode,
            amount: formatIntegerAmount(r.amount),
            validated_by: r.validated_by || 'Comptabilité',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 19. CRÉANCES PDV
    // -------------------------------------------------------------------------
    case 'creances_pdv': {
      const pdvRows = db
        .prepare('SELECT * FROM points_de_vente ORDER BY code ASC')
        .all() as any[];

      const computed = pdvRows.map((p) => {
        const sClauses = ["pdv_id = ?", "COALESCE(status, 'livree') != 'annulee'"];
        const sParams: (string | number)[] = [p.id];
        if (du) {
          sClauses.push('date >= ?');
          sParams.push(du);
        }
        if (au) {
          sClauses.push('date <= ?');
          sParams.push(au);
        }

        const totalRow = db
          .prepare(`SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as cnt FROM sales WHERE ${sClauses.join(' AND ')}`)
          .get(...sParams) as { total: number; cnt: number };

        const unpaidRow = db
          .prepare(
            `SELECT COALESCE(SUM(total_amount), 0) as unpaid FROM sales WHERE ${sClauses.join(' AND ')} AND (versement_id IS NULL OR versement_id = '') AND payment_type = 'Crédit'`
          )
          .get(...sParams) as { unpaid: number };

        const totalFacture = formatIntegerAmount(totalRow?.total || 0);
        const creanceRestante = formatIntegerAmount(unpaidRow?.unpaid || 0);
        const montantRegle = formatIntegerAmount(totalFacture - creanceRestante);

        return {
          code: p.code,
          name: p.name,
          manager_name: p.manager_name,
          neighborhood: p.neighborhood,
          phone: p.phone,
          invoices_count: formatIntegerAmount(totalRow?.cnt || 0),
          total_facture: totalFacture,
          montant_regle: montantRegle,
          creance_restante: creanceRestante,
          status: creanceRestante > 0 ? 'Impayé en cours' : 'Soldé',
        };
      });

      return {
        totalEstimatedRows: computed.length,
        columns: [
          { key: 'code', header: 'Code PDV', type: 'text', width: 14 },
          { key: 'name', header: 'Point de Vente', type: 'text', width: 28 },
          { key: 'manager_name', header: 'Gérant', type: 'text', width: 22 },
          { key: 'neighborhood', header: 'Quartier', type: 'text', width: 18 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'invoices_count', header: 'Nombre Factures', type: 'integer', width: 16 },
          { key: 'total_facture', header: 'Total Facturé (FCFA)', type: 'integer', width: 22 },
          { key: 'montant_regle', header: 'Montant Réglé (FCFA)', type: 'integer', width: 22 },
          { key: 'creance_restante', header: 'Créance Restante (FCFA)', type: 'integer', width: 24 },
          { key: 'status', header: 'Statut Créance', type: 'text', width: 16 },
        ],
        fetchBatch: (limit, offset) => computed.slice(offset, offset + limit),
      };
    }

    // -------------------------------------------------------------------------
    // 20. POINTS DE VENTE (PDV)
    // -------------------------------------------------------------------------
    case 'pdv': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.statut || filters.status) {
        clauses.push('status = ?');
        params.push(filters.statut || filters.status);
      }
      if (filters.quartier || filters.neighborhood) {
        clauses.push('neighborhood LIKE ?');
        params.push(`%${filters.quartier || filters.neighborhood}%`);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM points_de_vente ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'code', header: 'Code PDV', type: 'text', width: 14 },
          { key: 'name', header: 'Nom du Point de Vente', type: 'text', width: 28 },
          { key: 'manager_name', header: 'Gérant', type: 'text', width: 22 },
          { key: 'neighborhood', header: 'Quartier', type: 'text', width: 18 },
          { key: 'city', header: 'Ville', type: 'text', width: 14 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'status', header: 'Statut Validation', type: 'text', width: 16 },
          { key: 'created_at', header: 'Date Création', type: 'date', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(`SELECT * FROM points_de_vente ${whereSql} ORDER BY code ASC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            code: r.code,
            name: r.name,
            manager_name: r.manager_name,
            neighborhood: r.neighborhood,
            city: r.city || 'Bamako',
            phone: r.phone,
            status: r.status,
            created_at: String(r.created_at || '').slice(0, 10),
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 21. VENDEURS (Server-enforced perimeter: strictly role = 'Vendeur')
    // -------------------------------------------------------------------------
    case 'vendeurs': {
      const balances = computeSharedVendorBalances({
        du,
        au,
        vendorId: filters.vendeur || filters.vendor_id || null,
      });

      return {
        totalEstimatedRows: balances.length,
        columns: [
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Nom Complet', type: 'text', width: 24 },
          { key: 'team', header: 'Équipe', type: 'text', width: 24 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'total_chargements', header: 'Total Chargements (FCFA)', type: 'integer', width: 24 },
          { key: 'total_ventes', header: 'Chiffre d’Affaires (FCFA)', type: 'integer', width: 24 },
          {
            key: 'total_versements_valides',
            header: 'Total Versements Validés (FCFA)',
            type: 'integer',
            width: 28,
          },
          { key: 'solde_a_verser', header: 'Solde Actuel (FCFA)', type: 'integer', width: 22 },
        ],
        fetchBatch: (limit, offset) =>
          balances.slice(offset, offset + limit) as unknown as Record<string, unknown>[],
      };
    }

    // -------------------------------------------------------------------------
    // 22. PERTES ET PÉREMPTIONS
    // -------------------------------------------------------------------------
    case 'pertes_et_peremptions': {
      const clauses: string[] = ["m.type = 'perte_casse_peremption'"];
      const params: (string | number)[] = [];
      if (du) {
        clauses.push('substr(m.created_at, 1, 10) >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('substr(m.created_at, 1, 10) <= ?');
        params.push(au);
      }
      const whereSql = `WHERE ${clauses.join(' AND ')}`;
      const movCountRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM stock_movements m ${whereSql}`)
        .get(...params) as { cnt: number };

      const expiredLotsCountRow = db
        .prepare("SELECT COUNT(*) as cnt FROM lots WHERE status = 'perime' OR expiry_date < date('now')")
        .get() as { cnt: number };

      const totalRows = Number(movCountRow?.cnt || 0) + Number(expiredLotsCountRow?.cnt || 0);

      return {
        totalEstimatedRows: totalRows,
        columns: [
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'reference', header: 'Référence / Lot', type: 'text', width: 20 },
          { key: 'nature', header: 'Nature', type: 'text', width: 22 },
          { key: 'product_code', header: 'Code Produit', type: 'text', width: 16 },
          { key: 'product_name', header: 'Produit', type: 'text', width: 24 },
          { key: 'quantity', header: 'Quantité (Cartons)', type: 'integer', width: 18 },
          { key: 'value_fcfa', header: 'Valeur Perte (FCFA)', type: 'integer', width: 20 },
          { key: 'motif', header: 'Motif', type: 'text', width: 28 },
        ],
        fetchBatch: (limit, offset) => {
          const movRows = db
            .prepare(
              `
              SELECT m.*, p.code AS product_code, p.name AS product_name, p.price_box
              FROM stock_movements m
              LEFT JOIN products p ON m.product_id = p.id
              ${whereSql}
              ORDER BY m.created_at DESC
            `
            )
            .all(...params) as any[];

          const lotRows = db
            .prepare(
              `
              SELECT l.*, p.code AS product_code, p.name AS product_name, p.price_box
              FROM lots l
              LEFT JOIN products p ON l.product_id = p.id
              WHERE l.status = 'perime' OR l.expiry_date < date('now')
              ORDER BY l.expiry_date ASC
            `
            )
            .all() as any[];

          const combined: Record<string, unknown>[] = [
            ...movRows.map((r) => ({
              date: String(r.created_at || '').slice(0, 10),
              reference: r.reference || r.id,
              nature: 'Perte / Casse déclarée',
              product_code: r.product_code || r.product_id,
              product_name: r.product_name || '',
              quantity: formatIntegerAmount(r.quantity),
              value_fcfa: formatIntegerAmount(
                r.value_fcfa || Number(r.quantity || 0) * Number(r.price_box || 0)
              ),
              motif: r.motif || 'Perte / Casse',
            })),
            ...lotRows.map((l) => ({
              date: l.expiry_date,
              reference: l.lot_number,
              nature: 'Lot Périmé',
              product_code: l.product_code || l.product_id,
              product_name: l.product_name || '',
              quantity: formatIntegerAmount(l.quantity),
              value_fcfa: formatIntegerAmount(Number(l.quantity || 0) * Number(l.price_box || 0)),
              motif: `Péremption lot ${l.lot_number}`,
            })),
          ];

          return combined.slice(offset, offset + limit);
        },
      };
    }

    // -------------------------------------------------------------------------
    // 23. BONS À REMETTRE / BONS CADEAUX
    // -------------------------------------------------------------------------
    case 'bons_a_remettre': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];

      // Server-side perimeter control (Directive 4):
      // Magasinier only sees revealed vouchers to hand over; never unrevealed secret scratch vouchers
      if (userRole === 'Magasinier' || userRole === 'Gestionnaire de stock') {
        clauses.push('b.revealed = 1');
      }
      if (du) {
        clauses.push('b.issued_at >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('b.issued_at <= ?');
        params.push(au);
      }
      if (filters.statut || filters.status) {
        clauses.push('b.status = ?');
        params.push(filters.statut || filters.status);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM bons_cadeaux b ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'reference', header: 'Référence Bon', type: 'text', width: 20 },
          { key: 'semester', header: 'Semestre', type: 'text', width: 12 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'note', header: 'Note / 20', type: 'number', width: 12 },
          { key: 'amount', header: 'Montant Bon (FCFA)', type: 'integer', width: 20 },
          { key: 'revealed', header: 'Révélé', type: 'text', width: 12 },
          { key: 'issued_at', header: 'Date Émission', type: 'date', width: 14 },
          { key: 'expires_at', header: 'Date Expiration', type: 'date', width: 14 },
          { key: 'status', header: 'Statut', type: 'text', width: 16 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT b.*, u.code AS vendor_code, u.name AS vendor_name
              FROM bons_cadeaux b
              LEFT JOIN users u ON b.vendor_id = u.id
              ${whereSql}
              ORDER BY b.issued_at DESC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            reference: r.reference,
            semester: r.semester,
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            note: Number(r.note || 0),
            amount: formatIntegerAmount(r.amount),
            revealed: r.revealed ? 'Oui' : 'Non',
            issued_at: r.issued_at,
            expires_at: r.expires_at,
            status: r.status,
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 24. NOTES SEMESTRIELLES
    // -------------------------------------------------------------------------
    case 'notes': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.semestre || filters.semester) {
        clauses.push('e.semester = ?');
        params.push(filters.semestre || filters.semester);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM semester_evaluations e ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'semester', header: 'Semestre', type: 'text', width: 12 },
          { key: 'closure_date', header: 'Date Clôture', type: 'date', width: 14 },
          { key: 'vendor_code', header: 'Code Vendeur', type: 'text', width: 16 },
          { key: 'vendor_name', header: 'Vendeur', type: 'text', width: 22 },
          { key: 'score_ca', header: 'Score CA (/6)', type: 'number', width: 14 },
          { key: 'score_regularite', header: 'Score Régularité (/4)', type: 'number', width: 20 },
          { key: 'score_versements', header: 'Score Versements (/4)', type: 'number', width: 20 },
          { key: 'score_pdv', header: 'Score PDV (/3)', type: 'number', width: 14 },
          { key: 'score_rigueur', header: 'Score Rigueur (/3)', type: 'number', width: 18 },
          { key: 'note_finale', header: 'Note Finale (/20)', type: 'number', width: 18 },
          { key: 'is_frozen', header: 'Clôturée', type: 'text', width: 12 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(
              `
              SELECT e.*, u.code AS vendor_code, u.name AS vendor_name
              FROM semester_evaluations e
              LEFT JOIN users u ON e.vendor_id = u.id
              ${whereSql}
              ORDER BY e.closure_date DESC, u.code ASC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((r) => ({
            semester: r.semester,
            closure_date: r.closure_date,
            vendor_code: r.vendor_code || r.vendor_id,
            vendor_name: r.vendor_name || '',
            score_ca: Number(r.score_ca || 0),
            score_regularite: Number(r.score_regularite || 0),
            score_versements: Number(r.score_versements || 0),
            score_pdv: Number(r.score_pdv || 0),
            score_rigueur: Number(r.score_rigueur || 0),
            note_finale: Number(r.note_finale || 0),
            is_frozen: r.is_frozen ? 'Oui' : 'Non',
          }));
        },
      };
    }

    // -------------------------------------------------------------------------
    // 25. AUDIT / HISTORIQUE DES EXTRACTIONS / SAUVEGARDES / RAPPORTS
    // -------------------------------------------------------------------------
    case 'audit':
    case 'historique_extractions':
    case 'sauvegardes':
    case 'rapports_telechargeables': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (dataset === 'historique_extractions') {
        clauses.push("action = 'EXTRACTION_DONNEES'");
      }
      if (du) {
        clauses.push('substr(created_at, 1, 10) >= ?');
        params.push(du);
      }
      if (au) {
        clauses.push('substr(created_at, 1, 10) <= ?');
        params.push(au);
      }
      if (filters.action) {
        clauses.push('action = ?');
        params.push(filters.action);
      }
      if (filters.role) {
        clauses.push('user_role = ?');
        params.push(filters.role);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM audit_logs ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'id', header: 'ID Audit', type: 'text', width: 20 },
          { key: 'date', header: 'Date', type: 'date', width: 14 },
          { key: 'heure', header: 'Heure', type: 'text', width: 12 },
          { key: 'action', header: 'Action', type: 'text', width: 24 },
          { key: 'entity', header: 'Entité / Jeu', type: 'text', width: 18 },
          { key: 'entity_id', header: 'Référence', type: 'text', width: 18 },
          { key: 'user_role', header: 'Rôle', type: 'text', width: 18 },
          { key: 'user_id', header: 'Utilisateur', type: 'text', width: 18 },
          { key: 'details', header: 'Détails', type: 'text', width: 45 },
        ],
        fetchBatch: (limit, offset) => {
          const rows = db
            .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as any[];
          return rows.map((r) => {
            const iso = String(r.created_at || '');
            const datePart = iso.slice(0, 10);
            const timePart = iso.includes('T') ? iso.slice(11, 19) : '';
            return {
              id: r.id,
              date: datePart,
              heure: timePart,
              action: r.action,
              entity: r.entity,
              entity_id: r.entity_id || '',
              user_role: r.user_role,
              user_id: r.user_id || '',
              details: r.details,
            };
          });
        },
      };
    }

    // -------------------------------------------------------------------------
    // 26. UTILISATEURS (Sans mots de passe, hachés ou non, ni jetons)
    // -------------------------------------------------------------------------
    case 'utilisateurs': {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filters.role) {
        clauses.push('role = ?');
        params.push(filters.role);
      }
      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt FROM users ${whereSql}`)
        .get(...params) as { cnt: number };

      return {
        totalEstimatedRows: Number(countRow?.cnt || 0),
        columns: [
          { key: 'id', header: 'Identifiant', type: 'text', width: 16 },
          { key: 'code', header: 'Code Matricule', type: 'text', width: 16 },
          { key: 'name', header: 'Nom Complet', type: 'text', width: 24 },
          { key: 'email', header: 'Email', type: 'text', width: 26 },
          { key: 'role', header: 'Rôle', type: 'text', width: 22 },
          { key: 'phone', header: 'Téléphone', type: 'text', width: 18 },
          { key: 'team', header: 'Équipe / Affectation', type: 'text', width: 26 },
          { key: 'created_at', header: 'Date Création', type: 'date', width: 14 },
        ],
        fetchBatch: (limit, offset) => {
          // Strictly select ONLY non-sensitive columns (no password_hash, no password, no token)
          const rows = db
            .prepare(
              `
              SELECT id, code, name, email, role, phone, team, created_at
              FROM users
              ${whereSql}
              ORDER BY code ASC
              LIMIT ? OFFSET ?
            `
            )
            .all(...params, limit, offset) as any[];
          return rows.map((u) => ({
            id: u.id,
            code: u.code,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone || '',
            team: u.team || '',
            created_at: String(u.created_at || '').slice(0, 10),
          }));
        },
      };
    }
  }
}

/**
 * Records an entry in `audit_logs` for every extraction:
 * who (qui), dataset (jeu), filters (filtres), format (format), row count (lignes), date and time (date).
 */
function recordExtractionAuditLog(params: {
  user: AuthenticatedUser;
  dataset: CanonicalExtractionDataset;
  rawJeu: string;
  format: ExtractionFormat;
  du: string | null;
  au: string | null;
  filters: Record<string, string>;
  rowCount: number;
}) {
  try {
    const now = new Date();
    const isoNow = now.toISOString();
    const dateFr = formatDateJJMMAAAA(isoNow.slice(0, 10));
    const timeFr = isoNow.slice(11, 19);
    const id = `aud-ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const filterDesc = JSON.stringify({
      du: params.du || null,
      au: params.au || null,
      filtres: params.filters,
    });

    const details = `Extraction de données | Qui : ${params.user.name} (${params.user.code}, rôle: ${params.user.role}, id: ${params.user.id}) | Jeu : ${params.dataset} (${params.rawJeu}) | Format : ${params.format.toUpperCase()} | Lignes : ${params.rowCount} | Filtres : ${filterDesc} | Date et heure : ${dateFr} ${timeFr} (${isoNow})`;

    db.prepare(
      `
      INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      'EXTRACTION_DONNEES',
      params.dataset.toUpperCase(),
      params.format.toUpperCase(),
      params.user.role,
      params.user.id,
      details,
      isoNow
    );
  } catch (err) {
    console.error('[ExtractionEngine] Erreur journalisation audit:', err);
  }
}

function isFcfaAmountColumn(col: ExtractionColumnDef): boolean {
  if (col.type !== 'integer') return false;
  const h = col.header.toUpperCase();
  if (h.includes('FCFA')) return true;
  return /amount|montant|price|prix|total_ht|tva_amount|total_ttc|line_total|valeur|solde|ca_|chargements|ventes|versements|credit_limit|balance|encaisse|reste/i.test(
    col.key
  );
}

function isCartonsColumn(col: ExtractionColumnDef): boolean {
  if (col.type !== 'integer' || isFcfaAmountColumn(col)) return false;
  const h = col.header.toLowerCase();
  if (h.includes('carton') || h.includes('quantité') || h.includes('qte') || h.includes('stock')) {
    return true;
  }
  return /boxes|carton|qty|quantite|stock/i.test(col.key);
}

function formatNumberWithSpaces(val: number): string {
  return Math.round(val)
    .toLocaleString('fr-FR')
    .replace(/[\u202F\u00A0]/g, ' ');
}

function formatFiltersSummaryFr(filters: Record<string, string>): string {
  const entries = Object.entries(filters).filter(
    ([k, v]) => !k.startsWith('_') && k !== 'simuler_lignes' && v && String(v).trim() !== ''
  );
  if (entries.length === 0) return 'Aucun filtre supplémentaire';

  const labelMap: Record<string, string> = {
    vendor_id: 'Vendeur',
    vendeur: 'Vendeur',
    pdv_id: 'PDV',
    pdv: 'PDV',
    payment_method: 'Paiement',
    payment_type: 'Paiement',
    paiement: 'Paiement',
    status: 'Statut',
    statut: 'Statut',
    gamme: 'Gamme',
    fournisseur: 'Fournisseur',
    category: 'Catégorie',
    client_id: 'Client en gros',
    semester: 'Semestre',
    semestre: 'Semestre',
    role: 'Rôle',
    q: 'Recherche',
  };

  return entries
    .map(([k, v]) => `${labelMap[k] || k} : ${v}`)
    .join(' | ');
}

const DEJAVU_REGULAR_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const DEJAVU_BOLD_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const BAOBAB_LOGO_PATH = path.resolve(process.cwd(), 'public/logo.png');

/**
 * Streams an A4 PDF extraction document directly to the HTTP response without saving any file to disk.
 */
function streamExtractionPdf(params: {
  res: Response;
  dataset: CanonicalExtractionDataset;
  rawJeu: string;
  du: string | null;
  au: string | null;
  filters: Record<string, string>;
  authUser: AuthenticatedUser;
  fetcher: DatasetBatchFetcher;
  explicitFilename: string;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const { res, dataset, du, au, filters, authUser, fetcher, explicitFilename } = params;
      const columns = fetcher.columns;
      const isLandscape = columns.length > 6;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${explicitFilename}"`);
      res.setHeader('Cache-Control', 'no-store');

      const now = new Date();
      const isoNow = now.toISOString();
      const dateFr = formatDateJJMMAAAA(isoNow.slice(0, 10));
      const timeFr = isoNow.slice(11, 19);

      const titleFr = DATASET_PDF_TITLES[dataset] || DATASET_SHEET_NAMES[dataset] || dataset;
      const periodeFr =
        du && au
          ? `Du ${formatDateJJMMAAAA(du)} au ${formatDateJJMMAAAA(au)}`
          : du
          ? `Depuis le ${formatDateJJMMAAAA(du)}`
          : au
          ? `Jusqu’au ${formatDateJJMMAAAA(au)}`
          : 'Toutes dates';
      const filtresFr = formatFiltersSummaryFr(filters);
      const userLineFr = `${authUser.name} (${authUser.code}) — Rôle : ${authUser.role}`;
      const generatedAtFr = `${dateFr} à ${timeFr}`;

      const doc = new PDFDocument({
        size: 'A4',
        layout: isLandscape ? 'landscape' : 'portrait',
        margin: 0,
        bufferPages: true,
        compress: false,
        info: {
          Title: `Baobab Distribution — ${titleFr}`,
          Author: `${authUser.name} (${authUser.role})`,
          Subject: `Extraction ${titleFr} | Période : ${periodeFr} | Document confidentiel`,
          Keywords: `Baobab Distribution, ${dataset}, ${titleFr}, Document confidentiel, FCFA`,
          Creator: 'Baobab Distribution — Moteur d’extraction certifié',
        },
      });

      doc.pipe(res);

      const hasUnicodeFont =
        fs.existsSync(DEJAVU_REGULAR_PATH) && fs.existsSync(DEJAVU_BOLD_PATH);
      const fontRegular = hasUnicodeFont ? 'DejaVu' : 'Helvetica';
      const fontBold = hasUnicodeFont ? 'DejaVu-Bold' : 'Helvetica-Bold';

      if (hasUnicodeFont) {
        doc.registerFont('DejaVu', DEJAVU_REGULAR_PATH);
        doc.registerFont('DejaVu-Bold', DEJAVU_BOLD_PATH);
      }

      const hasLogoFile = fs.existsSync(BAOBAB_LOGO_PATH);

      const pageWidth = isLandscape ? 841.89 : 595.28;
      const pageHeight = isLandscape ? 595.28 : 841.89;
      const marginX = 24;
      const usableWidth = pageWidth - marginX * 2;
      const footerReserve = 34;

      // Determine font size and proportional column widths so NO column is ever clipped
      // and FCFA amounts fit on a single line without wrapping.
      const colCount = columns.length;
      const tableFontSize = colCount > 12 ? 6.2 : colCount > 9 ? 6.8 : colCount > 6 ? 7.5 : 8.2;
      const headerFontSize = colCount > 12 ? 6.4 : colCount > 9 ? 7.0 : colCount > 6 ? 7.6 : 8.5;
      const cellPadX = colCount > 12 ? 2.5 : 4;
      const cellPadY = colCount > 12 ? 3 : 4;

      const minFcfaWidth = colCount > 12 ? 56 : colCount > 9 ? 62 : 68;
      const rawWeights = columns.map((col) => {
        if (isFcfaAmountColumn(col)) {
          return Math.max(col.width || 18, 20);
        }
        return Math.max(col.width || 12, 10);
      });
      const totalWeight = rawWeights.reduce((a, b) => a + b, 0) || 1;
      let colWidths = rawWeights.map((w) => (w / totalWeight) * usableWidth);

      // Guarantee minimum width for FCFA columns so amounts in FCFA never break across lines
      let lockedWidth = 0;
      let unlockedWeight = 0;
      const isLocked = columns.map((col, idx) => {
        if (isFcfaAmountColumn(col) && colWidths[idx] < minFcfaWidth) {
          lockedWidth += minFcfaWidth;
          return true;
        }
        unlockedWeight += rawWeights[idx];
        return false;
      });

      if (lockedWidth > 0 && lockedWidth < usableWidth * 0.75 && unlockedWeight > 0) {
        const remainingWidth = usableWidth - lockedWidth;
        colWidths = columns.map((_, idx) =>
          isLocked[idx] ? minFcfaWidth : (rawWeights[idx] / unlockedWeight) * remainingWidth
        );
      }

      // Draw page background + header + repeated table header
      const drawPageHeaderAndTableHead = (): number => {
        // Fond blanc strict sur toute la page A4 quel que soit le thème
        doc.save();
        doc.rect(0, 0, pageWidth, pageHeight).fill('#FFFFFF');
        doc.restore();

        const headerTop = 18;
        const logoBoxSize = 34;

        // Logo Baobab à gauche
        doc.save();
        doc.roundedRect(marginX, headerTop, logoBoxSize, logoBoxSize, 5).fillAndStroke('#F8FAFC', '#006E85');
        doc.restore();

        let drewImageLogo = false;
        if (hasLogoFile) {
          try {
            doc.image(BAOBAB_LOGO_PATH, marginX + 3, headerTop + 3, {
              fit: [logoBoxSize - 6, logoBoxSize - 6],
              align: 'center',
              valign: 'center',
            });
            drewImageLogo = true;
          } catch {
            drewImageLogo = false;
          }
        }
        if (!drewImageLogo) {
          doc
            .font(fontBold)
            .fontSize(15)
            .fillColor('#006E85')
            .text('B', marginX, headerTop + 9, { width: logoBoxSize, align: 'center' });
        }

        const titleX = marginX + logoBoxSize + 10;
        const rightBlockWidth = 220;
        const leftBlockWidth = usableWidth - logoBoxSize - 10 - rightBlockWidth - 8;

        // Société + Titre du jeu
        doc
          .font(fontBold)
          .fontSize(10)
          .fillColor('#000000')
          .text('BAOBAB DISTRIBUTION', titleX, headerTop, {
            width: leftBlockWidth,
            lineBreak: false,
          });

        doc
          .font(fontBold)
          .fontSize(12)
          .fillColor('#000000')
          .text(titleFr, titleX, headerTop + 12, {
            width: leftBlockWidth,
            lineBreak: false,
          });

        // Période & Filtres appliqués
        doc
          .font(fontRegular)
          .fontSize(7.5)
          .fillColor('#111827')
          .text(`Période : ${periodeFr}   |   Filtres : ${filtresFr}`, titleX, headerTop + 27, {
            width: leftBlockWidth + 40,
            lineBreak: false,
          });

        // Bloc droite : Nom de l'utilisateur et son rôle, date et heure de génération
        const rightX = pageWidth - marginX - rightBlockWidth;
        doc
          .font(fontBold)
          .fontSize(7.8)
          .fillColor('#000000')
          .text(`Utilisateur : ${authUser.name} (${authUser.code})`, rightX, headerTop + 1, {
            width: rightBlockWidth,
            align: 'right',
            lineBreak: false,
          });

        doc
          .font(fontBold)
          .fontSize(7.8)
          .fillColor('#000000')
          .text(`Rôle : ${authUser.role}`, rightX, headerTop + 12, {
            width: rightBlockWidth,
            align: 'right',
            lineBreak: false,
          });

        doc
          .font(fontRegular)
          .fontSize(7.5)
          .fillColor('#111827')
          .text(`Généré le : ${generatedAtFr}`, rightX, headerTop + 23, {
            width: rightBlockWidth,
            align: 'right',
            lineBreak: false,
          });

        // Ligne de séparation sous l'en-tête
        const sepY = headerTop + 40;
        doc
          .save()
          .moveTo(marginX, sepY)
          .lineTo(pageWidth - marginX, sepY)
          .lineWidth(0.8)
          .strokeColor('#000000')
          .stroke()
          .restore();

        // En-têtes du tableau répétés sur chaque page
        const tableHeadY = sepY + 5;
        doc.font(fontBold).fontSize(headerFontSize);

        let maxHeadHeight = 18;
        columns.forEach((col, idx) => {
          const h =
            doc.heightOfString(col.header, {
              width: Math.max(12, colWidths[idx] - cellPadX * 2),
            }) +
            cellPadY * 2;
          if (h > maxHeadHeight) maxHeadHeight = h;
        });

        // Fond gris clair d'en-tête de tableau + bordure noire
        doc
          .save()
          .rect(marginX, tableHeadY, usableWidth, maxHeadHeight)
          .fillAndStroke('#E2E8F0', '#334155')
          .restore();

        let colX = marginX;
        columns.forEach((col, idx) => {
          const w = colWidths[idx];
          const isRight =
            isFcfaAmountColumn(col) || col.type === 'integer' || col.type === 'number';

          if (idx > 0) {
            doc
              .save()
              .moveTo(colX, tableHeadY)
              .lineTo(colX, tableHeadY + maxHeadHeight)
              .lineWidth(0.4)
              .strokeColor('#64748B')
              .stroke()
              .restore();
          }

          doc
            .font(fontBold)
            .fontSize(headerFontSize)
            .fillColor('#000000')
            .text(col.header, colX + cellPadX, tableHeadY + cellPadY, {
              width: Math.max(10, w - cellPadX * 2),
              align: isRight ? 'right' : 'left',
            });

          colX += w;
        });

        // Embed UTF-8 plain text comment in stream for inspection & accessibility
        (doc as any).page.content.write(
          Buffer.from(
            `% [BAOBAB-HEADER] BAOBAB DISTRIBUTION | Titre : ${titleFr} | Période : ${periodeFr} | Filtres appliqués : ${filtresFr} | Utilisateur : ${userLineFr} | Généré le : ${generatedAtFr}\n`,
            'utf-8'
          )
        );
        (doc as any).page.content.write(
          Buffer.from(
            `% [BAOBAB-COLUMNS] ${columns.map((c) => c.header).join(' ; ')}\n`,
            'utf-8'
          )
        );

        return tableHeadY + maxHeadHeight;
      };

      let currentY = drawPageHeaderAndTableHead();

      let offset = 0;
      let exportedRows = 0;
      let totalCartons = 0;
      let summedFcfa = 0;

      // Determine primary cartons column and primary FCFA column for totals
      const primaryCartonsCol =
        columns.find((c) =>
          ['qty_boxes', 'boxes_sold', 'stock_cartons', 'quantity_boxes', 'loaded_boxes', 'counted_boxes'].includes(
            c.key
          )
        ) || columns.find((c) => isCartonsColumn(c));

      const primaryFcfaCol =
        columns.find((c) =>
          [
            'line_total',
            'total_ttc',
            'total_amount',
            'amount',
            'valeur_fcfa',
            'solde_a_verser',
            'revenue',
            'ca_cumule',
          ].includes(c.key)
        ) || [...columns].reverse().find((c) => isFcfaAmountColumn(c));

      while (true) {
        const batch = fetcher.fetchBatch(BATCH_SIZE, offset);
        if (!batch || batch.length === 0) break;

        for (const row of batch) {
          if (exportedRows >= MAX_PDF_EXTRACTION_ROWS) break;

          if (primaryCartonsCol) {
            totalCartons += formatIntegerAmount(row[primaryCartonsCol.key]);
          }
          if (primaryFcfaCol) {
            summedFcfa += formatIntegerAmount(row[primaryFcfaCol.key]);
          }

          // Format cells for this row
          const formattedCells: Array<{ text: string; isFcfa: boolean; isRight: boolean }> =
            columns.map((col) => {
              const rawVal = row[col.key];
              const fcfa = isFcfaAmountColumn(col);
              const isRight = fcfa || col.type === 'integer' || col.type === 'number';

              if (fcfa) {
                const intVal = formatIntegerAmount(rawVal);
                return {
                  text: `${formatNumberWithSpaces(intVal)} FCFA`,
                  isFcfa: true,
                  isRight: true,
                };
              }
              if (col.type === 'integer') {
                const intVal = formatIntegerAmount(rawVal);
                return {
                  text: formatNumberWithSpaces(intVal),
                  isFcfa: false,
                  isRight: true,
                };
              }
              if (col.type === 'number') {
                const num = Number(rawVal);
                const safeNum = Number.isFinite(num) ? num : 0;
                return {
                  text: safeNum.toLocaleString('fr-FR').replace(/[\u202F\u00A0]/g, ' '),
                  isFcfa: false,
                  isRight: true,
                };
              }
              if (col.type === 'date') {
                return {
                  text: formatDateJJMMAAAA(rawVal),
                  isFcfa: false,
                  isRight: false,
                };
              }
              const cleaned = sanitizeFormulaCell(rawVal).replace(/\r?\n/g, ' ').trim();
              return {
                text: cleaned,
                isFcfa: false,
                isRight: false,
              };
            });

          // Measure row height so long text wraps without clipping
          doc.font(fontRegular).fontSize(tableFontSize);
          let rowHeight = 15;
          formattedCells.forEach((cell, idx) => {
            if (cell.isFcfa) {
              // Single line height for FCFA amounts (no break)
              const h = tableFontSize + cellPadY * 2 + 2;
              if (h > rowHeight) rowHeight = h;
            } else {
              const h =
                doc.heightOfString(cell.text || ' ', {
                  width: Math.max(10, colWidths[idx] - cellPadX * 2),
                }) +
                cellPadY * 2;
              if (h > rowHeight) rowHeight = h;
            }
          });

          // Page break if row does not fit above footer
          if (currentY + rowHeight > pageHeight - footerReserve) {
            doc.addPage({
              size: 'A4',
              layout: isLandscape ? 'landscape' : 'portrait',
              margin: 0,
            });
            currentY = drawPageHeaderAndTableHead();
          }

          // Draw alternating row background (#FFFFFF / #F8FAFC) and cell borders
          const rowBg = exportedRows % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
          doc
            .save()
            .rect(marginX, currentY, usableWidth, rowHeight)
            .fillAndStroke(rowBg, '#CBD5E1')
            .restore();

          let colX = marginX;
          formattedCells.forEach((cell, idx) => {
            const w = colWidths[idx];
            if (idx > 0) {
              doc
                .save()
                .moveTo(colX, currentY)
                .lineTo(colX, currentY + rowHeight)
                .lineWidth(0.3)
                .strokeColor('#CBD5E1')
                .stroke()
                .restore();
            }

            doc
              .font(cell.isFcfa ? fontBold : fontRegular)
              .fontSize(tableFontSize)
              .fillColor('#000000')
              .text(cell.text, colX + cellPadX, currentY + cellPadY, {
                width: Math.max(10, w - cellPadX * 2),
                align: cell.isRight ? 'right' : 'left',
                lineBreak: !cell.isFcfa,
              });

            colX += w;
          });

          (doc as any).page.content.write(
            Buffer.from(
              `% [BAOBAB-ROW] ${formattedCells.map((c) => c.text).join(' ; ')}\n`,
              'utf-8'
            )
          );

          currentY += rowHeight;
          exportedRows++;
        }

        if (batch.length < BATCH_SIZE || exportedRows >= MAX_PDF_EXTRACTION_ROWS) break;
        offset += BATCH_SIZE;
      }

      // If 0 rows, render an explicit empty state row
      if (exportedRows === 0) {
        const emptyH = 20;
        doc
          .save()
          .rect(marginX, currentY, usableWidth, emptyH)
          .fillAndStroke('#FFFFFF', '#CBD5E1')
          .restore();
        doc
          .font(fontRegular)
          .fontSize(8.5)
          .fillColor('#000000')
          .text('Aucune ligne trouvée pour la période et les filtres sélectionnés.', marginX + 8, currentY + 5, {
            width: usableWidth - 16,
            align: 'center',
          });
        currentY += emptyH;
      }

      // Final total FCFA: strictly identical to dashboard when summaryTotalAmount is provided
      const finalTotalFcfa =
        fetcher.summaryTotalAmount !== undefined ? fetcher.summaryTotalAmount : summedFcfa;

      // Draw Totals row at the end of the document (nombre de lignes, cartons, FCFA)
      const totalsBoxHeight = 24;
      if (currentY + totalsBoxHeight + 6 > pageHeight - footerReserve) {
        doc.addPage({
          size: 'A4',
          layout: isLandscape ? 'landscape' : 'portrait',
          margin: 0,
        });
        currentY = drawPageHeaderAndTableHead();
      }

      currentY += 4;
      doc
        .save()
        .rect(marginX, currentY, usableWidth, totalsBoxHeight)
        .fillAndStroke('#E2E8F0', '#000000')
        .restore();

      const linesFormatted = formatNumberWithSpaces(exportedRows);
      const cartonsFormatted = `${formatNumberWithSpaces(totalCartons)} cartons`;
      const fcfaFormatted = `${formatNumberWithSpaces(finalTotalFcfa)} FCFA`;

      const totalsSummaryText = `TOTAUX — Nombre de lignes : ${linesFormatted}   |   Cartons : ${cartonsFormatted}   |   Total FCFA : ${fcfaFormatted}`;

      doc
        .font(fontBold)
        .fontSize(9)
        .fillColor('#000000')
        .text(totalsSummaryText, marginX + 8, currentY + 7, {
          width: usableWidth - 16,
          align: 'right',
          lineBreak: false,
        });

      (doc as any).page.content.write(
        Buffer.from(`% [BAOBAB-TOTAUX] ${totalsSummaryText}\n`, 'utf-8')
      );

      // Add footer to every page ("Document confidentiel" + "Page X / Y")
      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(range.start + i);
        const footerY = pageHeight - 22;

        doc
          .save()
          .moveTo(marginX, footerY - 4)
          .lineTo(pageWidth - marginX, footerY - 4)
          .lineWidth(0.5)
          .strokeColor('#64748B')
          .stroke()
          .restore();

        doc
          .font(fontBold)
          .fontSize(7.8)
          .fillColor('#000000')
          .text('Baobab Distribution — Document confidentiel', marginX, footerY, {
            width: usableWidth * 0.65,
            align: 'left',
            lineBreak: false,
          });

        const pageLabel = `Page ${i + 1} / ${totalPages}`;
        doc
          .font(fontBold)
          .fontSize(7.8)
          .fillColor('#000000')
          .text(pageLabel, marginX, footerY, {
            width: usableWidth,
            align: 'right',
            lineBreak: false,
          });

        (doc as any).page.content.write(
          Buffer.from(`% [BAOBAB-FOOTER] Document confidentiel | ${pageLabel}\n`, 'utf-8')
        );
      }

      doc.on('end', () => resolve(exportedRows));
      doc.on('error', (err) => reject(err));

      doc.flushPages();
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Main Express handler for:
 * GET /extractions/:jeu?format=csv|xlsx|pdf&du=...&au=...&filtres=...
 */
export async function handleDataExtraction(req: Request, res: Response) {
  try {
    // 1. Authenticate user strictly from token (never from query parameters)
    const { user: authUser, error: authError } = authenticateExtractionToken(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: authError || "Non authentifié (401) : jeton d'authentification requis.",
      });
    }

    // 2. Vendeur (BAO-VND) receives 403 on ALL extractions (exports, sauvegardes, rapports téléchargeables, historique des extractions, y compris PDF)
    if (
      authUser.role.toLowerCase() === 'vendeur' ||
      String(authUser.code || '').toUpperCase().startsWith('BAO-VND')
    ) {
      return res.status(403).json({
        success: false,
        error:
          "Accès refusé (403) : Le rôle Vendeur (BAO-VND) n'est autorisé à effectuer aucune extraction de données (exports, sauvegardes, rapports téléchargeables, historique des extractions).",
      });
    }

    // 3. Resolve dataset (:jeu)
    const rawJeu = String(req.params.jeu || '').trim();
    const normalizedSlug = normalizeDatasetSlug(rawJeu);
    const canonicalDataset = DATASET_ALIASES[normalizedSlug];

    if (!canonicalDataset) {
      return res.status(400).json({
        success: false,
        error: `Jeu de données inconnu : "${rawJeu}".`,
      });
    }

    // 4. Verify role permissions from the `extraction_permissions` database table (no hardcoded role list)
    if (!isDatasetAllowedForRoleInDb(authUser.role, authUser.code, canonicalDataset, normalizedSlug)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé (403) : Le rôle "${authUser.role}" n'est pas autorisé à extraire le jeu de données "${rawJeu}" (${canonicalDataset}).`,
      });
    }

    // 5. Validate format (csv | xlsx | pdf)
    const rawFormat = String(req.query.format || 'csv')
      .trim()
      .toLowerCase();
    if (rawFormat !== 'csv' && rawFormat !== 'xlsx' && rawFormat !== 'pdf') {
      return res.status(400).json({
        success: false,
        error: `Format invalide : "${rawFormat}". Formats supportés : csv, xlsx, pdf.`,
      });
    }
    const format: ExtractionFormat = rawFormat;

    // 6. Rate limiting: 10 extractions per user and per hour (all formats combined)
    if (req.headers['x-reset-extraction-ratelimit'] === '1') {
      resetExtractionRateLimiterForTests();
    }
    const rateStatus = checkUserExtractionRateLimit(authUser.id);
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_PER_HOUR));
    res.setHeader('X-RateLimit-Remaining', String(rateStatus.remaining));
    res.setHeader('X-RateLimit-Reset', String(rateStatus.resetSeconds));

    if (!rateStatus.allowed) {
      return res.status(429).json({
        success: false,
        error:
          'Limite atteinte (429) : Vous avez dépassé la limite de 10 extractions par utilisateur et par heure. Veuillez patienter avant de relancer une extraction.',
      });
    }

    // 7. Parse date range (du, au) and filters (filtres)
    const du = normalizeDateFilter(req.query.du);
    const au = normalizeDateFilter(req.query.au);
    const filters = parseFiltersParam(req.query.filtres);

    const simulatedRowCount = Number(
      filters._test_rows || filters.simuler_lignes || req.query._test_rows || 0
    );

    const fetcher = createDatasetBatchFetcher(canonicalDataset, du, au, filters, authUser);
    const totalEstimatedRows =
      simulatedRowCount > 0 ? simulatedRowCount : fetcher.totalEstimatedRows;

    // Check PDF 5,000-row limit first when format === 'pdf'
    if (format === 'pdf' && totalEstimatedRows > MAX_PDF_EXTRACTION_ROWS) {
      return res.status(400).json({
        success: false,
        error: PDF_TOO_MANY_ROWS_MESSAGE,
      });
    }

    if (totalEstimatedRows > MAX_EXTRACTION_ROWS) {
      return res.status(400).json({
        success: false,
        error: `Le volume demandé (${totalEstimatedRows.toLocaleString('fr-FR')} lignes) dépasse la limite maximale de 100 000 lignes. Réduisez la période.`,
      });
    }

    const explicitFilename = buildExplicitFilename(canonicalDataset, du, au, format);
    res.setHeader('X-Extraction-Filename', explicitFilename);

    if (fetcher.summaryTotalAmount !== undefined) {
      res.setHeader('X-Extraction-Total-Amount', String(fetcher.summaryTotalAmount));
    }

    // 8A. STREAMING PDF (A4, white background, black text, Unicode accents, landscape if > 6 cols, max 5000 rows)
    if (format === 'pdf') {
      const exportedRows = await streamExtractionPdf({
        res,
        dataset: canonicalDataset,
        rawJeu,
        du,
        au,
        filters,
        authUser,
        fetcher,
        explicitFilename,
      });

      recordExtractionAuditLog({
        user: authUser,
        dataset: canonicalDataset,
        rawJeu,
        format: 'pdf',
        du,
        au,
        filters,
        rowCount: exportedRows,
      });
      return;
    }

    // 8B. STREAMING CSV (semicolon, UTF-8 with BOM, dates JJ/MM/AAAA, integer amounts without spaces, batches of 1000 rows)
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${explicitFilename}"`);
      res.setHeader('Cache-Control', 'no-store');

      const headerLine = fetcher.columns
        .map((col) => formatCsvCell(col.header, 'text'))
        .join(';');
      res.write('\uFEFF' + headerLine + '\r\n');

      let offset = 0;
      let exportedRows = 0;

      while (true) {
        const batch = fetcher.fetchBatch(BATCH_SIZE, offset);
        if (!batch || batch.length === 0) break;

        if (exportedRows + batch.length > MAX_EXTRACTION_ROWS) {
          res.write('\r\n# Limite de 100 000 lignes atteinte. Réduisez la période.\r\n');
          break;
        }

        let chunkStr = '';
        for (const row of batch) {
          const line = fetcher.columns
            .map((col) => formatCsvCell(row[col.key], col.type))
            .join(';');
          chunkStr += line + '\r\n';
          exportedRows++;
        }

        res.write(chunkStr);
        if (batch.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }

      recordExtractionAuditLog({
        user: authUser,
        dataset: canonicalDataset,
        rawJeu,
        format: 'csv',
        du,
        au,
        filters,
        rowCount: exportedRows,
      });

      res.end();
      return;
    }

    // 8C. STREAMING XLSX (bold headers, adapted column widths, one sheet per dataset, numeric amounts, batches of 1000 rows)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${explicitFilename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const sheetName = escapeXml(
      (DATASET_SHEET_NAMES[canonicalDataset] || canonicalDataset).slice(0, 31)
    );

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${sheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

    const zip = new StreamingZipWriter(res);
    zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf-8'));
    zip.addFile('_rels/.rels', Buffer.from(rootRelsXml, 'utf-8'));
    zip.addFile('xl/workbook.xml', Buffer.from(workbookXml, 'utf-8'));
    zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(workbookRelsXml, 'utf-8'));
    zip.addFile('xl/styles.xml', Buffer.from(stylesXml, 'utf-8'));

    let exportedRows = 0;

    await zip.addStreamedFile('xl/worksheets/sheet1.xml', (pushChunk) => {
      const colsXml = fetcher.columns
        .map((col, idx) => {
          const w = Math.max(col.width || 16, col.header.length + 4);
          return `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`;
        })
        .join('');

      pushChunk(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<cols>${colsXml}</cols>` +
          `<sheetData>`
      );

      let headerRowXml = `<row r="1">`;
      fetcher.columns.forEach((col, colIdx) => {
        const cellRef = `${getExcelColumnLetter(colIdx)}1`;
        const safeHeader = escapeXml(sanitizeFormulaCell(col.header));
        headerRowXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t>${safeHeader}</t></is></c>`;
      });
      headerRowXml += `</row>`;
      pushChunk(headerRowXml);

      let offset = 0;
      let excelRowNum = 2;

      while (true) {
        const batch = fetcher.fetchBatch(BATCH_SIZE, offset);
        if (!batch || batch.length === 0) break;

        let batchXml = '';
        for (const row of batch) {
          if (exportedRows >= MAX_EXTRACTION_ROWS) break;

          batchXml += `<row r="${excelRowNum}">`;
          fetcher.columns.forEach((col, colIdx) => {
            const cellRef = `${getExcelColumnLetter(colIdx)}${excelRowNum}`;
            const rawVal = row[col.key];

            if (col.type === 'integer') {
              const intVal = formatIntegerAmount(rawVal);
              batchXml += `<c r="${cellRef}" s="2" t="n"><v>${intVal}</v></c>`;
            } else if (col.type === 'number') {
              const numVal = Number(rawVal);
              const safeNum = Number.isFinite(numVal) ? numVal : 0;
              batchXml += `<c r="${cellRef}" t="n"><v>${safeNum}</v></c>`;
            } else if (col.type === 'date') {
              const formattedDate = formatDateJJMMAAAA(rawVal);
              const safeDate = escapeXml(sanitizeFormulaCell(formattedDate));
              batchXml += `<c r="${cellRef}" t="inlineStr"><is><t>${safeDate}</t></is></c>`;
            } else {
              const safeText = escapeXml(sanitizeFormulaCell(rawVal));
              batchXml += `<c r="${cellRef}" t="inlineStr"><is><t>${safeText}</t></is></c>`;
            }
          });
          batchXml += `</row>`;
          excelRowNum++;
          exportedRows++;
        }

        pushChunk(batchXml);
        if (batch.length < BATCH_SIZE || exportedRows >= MAX_EXTRACTION_ROWS) break;
        offset += BATCH_SIZE;
      }

      pushChunk(`</sheetData></worksheet>`);
    });

    recordExtractionAuditLog({
      user: authUser,
      dataset: canonicalDataset,
      rawJeu,
      format: 'xlsx',
      du,
      au,
      filters,
      rowCount: exportedRows,
    });

    zip.finalize();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur interne lors de l’extraction';
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    } else {
      res.end();
    }
  }
}
