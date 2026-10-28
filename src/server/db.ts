import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getRealStorefrontPhotoForPdv } from '../utils/malianStorefrontImages.js';

// Ensure data folder exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'baobab.db');
export const db = new DatabaseSync(dbPath);

export function initDatabase() {
  // 1. Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // 2. Users table (4 roles: Administrateur, Magasinier, Comptable, Vendeur)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      phone TEXT,
      team TEXT, -- Champ libre Équipe sur le vendeur
      must_change_password INTEGER DEFAULT 0, -- 1 = mot de passe provisoire à changer
      password_hash TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 3. Products table (Gammes lues dynamiquement depuis la base de données, jamais en dur)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      gamme TEXT NOT NULL,
      packaging TEXT NOT NULL,
      units_per_box INTEGER NOT NULL,
      price_box INTEGER NOT NULL, -- Prix de vente par carton en FCFA
      stock_depot INTEGER NOT NULL, -- Stock dépôt central (30-45 jours)
      threshold_depot INTEGER NOT NULL DEFAULT 50
    );
  `);

  // 4. Lots table (Traçabilité Magasinier)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lots (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      lot_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 5. Points de Vente (PDV)
  db.exec(`
    CREATE TABLE IF NOT EXISTS points_de_vente (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Bamako',
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'valide', -- 'valide' | 'en_attente'
      created_at TEXT NOT NULL
    );
  `);

  // 6. Chargements Dépôt-Vente (Dépôt central -> Vendeur : 3-7 jours de stock, pas de paiement préalable)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chargements (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON [{ productId, code, name, qtyBoxes, unitPrice, total }]
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'valide', -- 'valide' | 'cloture'
      created_at TEXT NOT NULL
    );
  `);

  // 7. Retours Dépôt (Vendeur -> Dépôt)
  db.exec(`
    CREATE TABLE IF NOT EXISTS retours (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'valide',
      created_at TEXT NOT NULL
    );
  `);

  // 8. Réceptions Fournisseurs (Fournisseur -> Dépôt central)
  db.exec(`
    CREATE TABLE IF NOT EXISTS receptions (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      supplier_name TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL,
      total_boxes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 9. Ventes (Vendeurs -> Points de Vente)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      pdv_id TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON [{ productId, code, name, qtyBoxes, unitPrice, total }]
      total_amount INTEGER NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'Comptant', -- 'Comptant' | 'Orange Money' | 'Moov Money'
      status TEXT NOT NULL DEFAULT 'livree',
      created_at TEXT NOT NULL
    );
  `);

  // 10. Versements (Dépôt-vente : Vendeur vend puis verse l'argent à la Comptabilité)
  db.exec(`
    CREATE TABLE IF NOT EXISTS versements (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_mode TEXT NOT NULL, -- 'Espèces' | 'Orange Money' | 'Moov Money' | 'Chèque BDM'
      status TEXT NOT NULL DEFAULT 'valide', -- 'valide' | 'en_attente' | 'rejete'
      validated_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 11. Stock Movements Journal (Entrées en ajout seul, jamais négatif ; sorties avec motif et valeur)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'reception' | 'chargement' | 'retour' | 'perte_casse_peremption'
      direction TEXT NOT NULL, -- 'IN' (ajout seul, positif) | 'OUT'
      product_id TEXT NOT NULL,
      lot_id TEXT,
      quantity INTEGER NOT NULL, -- strictly positive integer
      reference TEXT,
      motif TEXT,
      value_fcfa INTEGER DEFAULT 0,
      performed_by TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 12. Inventaires Vendeurs (Magasinier compare stock théorique et physique -> écart en FCFA)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_inventories (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON [{ productId, productCode, productName, countedQty, theoreticalQty, diffQty, unitPrice, diffAmount }]
      total_ecart_boxes INTEGER NOT NULL,
      total_ecart_fcfa INTEGER NOT NULL,
      magasinier_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 13. Notifications Système (Destinées à Administrateur, Comptable, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL, -- 'Administrateur' | 'Comptable' | 'Magasinier' | 'Vendeur' | 'ALL'
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL, -- 'ecart' | 'chargement' | 'retour' | 'alerte_peremption' | 'info'
      reference TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // 14. Journal d'Audit (Traçabilité complète des transactions atomiques)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      user_role TEXT NOT NULL,
      user_id TEXT,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 15. Évaluations Semestrielles par Vendeur (Note sur 20 calculée côté serveur, arrondi 0,5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS semester_evaluations (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      closure_date TEXT NOT NULL,
      score_ca REAL NOT NULL,
      score_regularite REAL NOT NULL,
      score_versements REAL NOT NULL,
      score_pdv REAL NOT NULL,
      score_rigueur REAL NOT NULL,
      raw_total REAL NOT NULL,
      note_finale REAL NOT NULL,
      is_frozen INTEGER NOT NULL DEFAULT 0,
      details_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(vendor_id, semester)
    );
  `);

  // 16. Bons Cadeaux Semestriels (Un bon par vendeur et par semestre, valeur fixée côté serveur avant tout grattage, valable 90 jours)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bons_cadeaux (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      closure_date TEXT NOT NULL,
      note REAL NOT NULL,
      amount INTEGER NOT NULL,
      revealed INTEGER NOT NULL DEFAULT 0,
      revealed_at TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'actif',
      created_at TEXT NOT NULL,
      UNIQUE(vendor_id, semester)
    );
  `);

  // 17. Positions GPS des Vendeurs & Historique des Trajets (En ligne & Hors-ligne synchronisé)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_gps_positions (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL DEFAULT 4.5,
      speed_kmh REAL DEFAULT 0,
      activity_label TEXT,
      pdv_id TEXT,
      recorded_offline INTEGER DEFAULT 0,
      recorded_at TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      date TEXT NOT NULL
    );
  `);

  // Add missing columns gracefully to existing tables if needed
  const runMigration = (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      // Column or table already updated
    }
  };

  runMigration("ALTER TABLE lots ADD COLUMN initial_quantity INTEGER DEFAULT 0");
  runMigration("ALTER TABLE lots ADD COLUMN status TEXT DEFAULT 'actif'");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN rejection_reason TEXT");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN latitude REAL");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN longitude REAL");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN gps_accuracy REAL");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN photo_url TEXT");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN captured_at TEXT");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN vendor_id TEXT");
  runMigration("ALTER TABLE points_de_vente ADD COLUMN created_by TEXT");
  runMigration("ALTER TABLE chargements ADD COLUMN desired_date TEXT");
  runMigration("ALTER TABLE chargements ADD COLUMN rejection_reason TEXT");
  runMigration("ALTER TABLE chargements ADD COLUMN validated_by TEXT");
  runMigration("ALTER TABLE chargements ADD COLUMN validated_at TEXT");
  runMigration("ALTER TABLE chargements ADD COLUMN charged_at TEXT");
  runMigration("ALTER TABLE retours ADD COLUMN confirmed_by TEXT");
  runMigration("ALTER TABLE retours ADD COLUMN confirmed_at TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN items TEXT DEFAULT '[]'");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN basket_total INTEGER DEFAULT 0");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN delivered_total INTEGER DEFAULT 0");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN requested_at TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN prepared_by TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN remis_at TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN confirmed_reception_at TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN prolongation_days INTEGER DEFAULT 0");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN prolongation_motif TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN prolonged_by TEXT");
  runMigration("ALTER TABLE bons_cadeaux ADD COLUMN prolonged_at TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN recorded_offline INTEGER DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN offline_recorded_at TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN synced_at TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN latitude REAL");
  runMigration("ALTER TABLE sales ADD COLUMN longitude REAL");
  runMigration("ALTER TABLE sales ADD COLUMN sale_time TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN invoice_generated INTEGER DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN invoice_number TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN with_tva INTEGER DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN tva_rate REAL DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN tva_amount INTEGER DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN total_ttc INTEGER DEFAULT 0");
  runMigration("ALTER TABLE sales ADD COLUMN versement_id TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN invoice_generated_at TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN invoice_generated_by TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN thermal_ticket_number TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN rectification_status TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN rectification_reason TEXT");
  runMigration("ALTER TABLE sales ADD COLUMN rectification_requested_at TEXT");
  runMigration("ALTER TABLE notifications ADD COLUMN target_user_id TEXT");
  runMigration("ALTER TABLE notifications ADD COLUMN proof_json TEXT");
  runMigration("ALTER TABLE notifications ADD COLUMN metadata_json TEXT");

  // 18. Demandes de Rectification de Factures (Vendeur -> Comptable avec Mini Facture Thermique comme preuve)
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_rectifications (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      sale_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      vendor_id TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      vendor_code TEXT NOT NULL,
      pdv_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      thermal_receipt_number TEXT NOT NULL,
      thermal_receipt_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'en_attente', -- 'en_attente' | 'rectifiee' | 'rejetee'
      response_note TEXT,
      handled_by TEXT,
      handled_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 19. Demandes d'Achat (Magasinier & Comptable -> Validation ou Rejet par l'Administrateur avec motif optionnel)
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      requester_id TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_code TEXT NOT NULL,
      requester_role TEXT NOT NULL, -- 'Magasinier' | 'Comptable'
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Approvisionnement Dépôt',
      supplier_name TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      total_amount INTEGER NOT NULL DEFAULT 0,
      request_motif TEXT, -- Motif de la demande (optionnel)
      status TEXT NOT NULL DEFAULT 'en_attente', -- 'en_attente' | 'validee' | 'rejetee'
      admin_motif TEXT, -- Motif de l'Administrateur (optionnel)
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Check if initial demo seed has already been loaded via 'seeded_at'
  const seededCheck = db.prepare("SELECT value FROM settings WHERE key = 'seeded_at'").get() as { value: string } | undefined;
  if (seededCheck && seededCheck.value) {
    // Check if we need to ensure varied lots exist for the 4 status badges
    ensureSampleLots();
    ensurePdvGpsCoordinates();
    ensureZeroSalesPdvs();
    ensurePdvStorefrontPhotos();
    ensureRecentDailySales();
    ensureSalesHaveTimes();
    ensureSemesterBonsAndScores();
    ensureVendorGpsTrajectories();
    ensureComptableInvoicesAndPurchaseRequests();
    return;
  }

  // ---- SEED DATA (Runs exactly ONCE) ----
  console.log('[Baobab Distribution] Initialisation de la base de données démo...');

  // Default settings
  const defaultSettings: Record<string, string> = {
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
    logo_url: '/logo.png',
  };

  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // 1. Utilisateurs (Exactement les codes et rôles spécifiés)
  // Administrateur principal unique (seul habilité à créer les comptes), Magasinier, Comptable, 3 Vendeurs
  const insertUser = db.prepare(`
    INSERT INTO users (id, code, name, email, role, phone, team, must_change_password, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'usr-adm',
    'BAO-ADM',
    'Amadou Touré',
    'admin@baobab.ml',
    'Administrateur',
    '+223 76 01 23 45',
    'Direction Générale',
    0,
    'hash_adm',
    '2026-04-15'
  );

  insertUser.run(
    'usr-mag',
    'BAO-MAG',
    'Moussa Diarra',
    'magasin@baobab.ml',
    'Magasinier',
    '+223 66 12 34 56',
    'Dépôt Central Sotuba',
    0,
    'hash_mag',
    '2026-04-15'
  );

  insertUser.run(
    'usr-cpt',
    'BAO-CPT',
    'Fatoumata Coulibaly',
    'compta@baobab.ml',
    'Comptable',
    '+223 70 98 76 54',
    'Service Comptabilité & Caisse',
    0,
    'hash_cpt',
    '2026-04-15'
  );

  // 3 Vendeurs initiaux avec champ libre "Équipe"
  insertUser.run(
    'usr-vnd-1',
    'BAO-VND-001',
    'Oumar Konaté',
    'vendeur1@baobab.ml',
    'Vendeur',
    '+223 75 44 22 11',
    'Équipe Sotuba / Rive Gauche',
    0,
    'hash_vnd1',
    '2026-05-01'
  );

  insertUser.run(
    'usr-vnd-2',
    'BAO-VND-002',
    'Bakary Sidibé',
    'vendeur2@baobab.ml',
    'Vendeur',
    '+223 69 88 77 66',
    'Équipe Badalabougou / Rive Droite',
    0,
    'hash_vnd2',
    '2026-05-01'
  );

  insertUser.run(
    'usr-vnd-3',
    'BAO-VND-003',
    'Seydou Diakité',
    'vendeur3@baobab.ml',
    'Vendeur',
    '+223 73 11 00 99',
    'Équipe Centre Commercial / Commune 3',
    1, // mot de passe provisoire à changer à la première connexion
    'hash_vnd3',
    '2026-05-01'
  );

  // 2. Catalogue (Exactement 4 produits requis, prix de vente par carton)
  // Stock dépôt central calibré pour 30 à 45 jours de consommation
  const insertProduct = db.prepare(`
    INSERT INTO products (id, code, name, gamme, packaging, units_per_box, price_box, stock_depot, threshold_depot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProduct.run(
    'prod-caj',
    'JUS-CAJ-12',
    'Jus Cajoucy',
    'Jus & Boissons',
    'Carton de 12',
    12,
    9600,
    850, // ~35 jours
    100
  );

  insertProduct.run(
    'prod-ben',
    'MAY-BEN-12',
    'Mayonnaise Bennor',
    'Condiments & Sauces',
    'Carton de 12',
    12,
    14400,
    720, // ~36 jours
    80
  );

  insertProduct.run(
    'prod-nor',
    'EAU-NOR-06',
    'Eau minérale Nora',
    'Eaux Minérales',
    'Pack de 6 x 1,5 L',
    6,
    2700,
    1250, // ~40 jours
    150
  );

  insertProduct.run(
    'prod-saf',
    'SAU-SAF-24',
    'Sauce Piment Safie',
    'Condiments & Sauces',
    'Carton de 24',
    24,
    12000,
    640, // ~32 jours
    70
  );

  // Lots pour traçabilité magasinier
  const insertLot = db.prepare(`
    INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertLot.run('lot-caj-1', 'prod-caj', 'LOT-CAJ-2026-A', '2027-08-30', 850, '2026-09-10');
  insertLot.run('lot-ben-1', 'prod-ben', 'LOT-BEN-2026-B', '2027-10-15', 720, '2026-09-12');
  insertLot.run('lot-nor-1', 'prod-nor', 'LOT-NOR-2026-C', '2028-03-20', 1250, '2026-09-14');
  insertLot.run('lot-saf-1', 'prod-saf', 'LOT-SAF-2026-D', '2027-12-05', 640, '2026-09-15');

  // 3. 12 Points de Vente (PDV) à Bamako (avec validation Administrateur et vendeur créateur)
  const insertPDV = db.prepare(`
    INSERT INTO points_de_vente (id, code, name, manager_name, neighborhood, city, phone, status, vendor_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const pdvs = [
    { id: 'pdv-01', code: 'PDV-BKO-01', name: 'Alimentation Générale Sotuba', manager: 'Cheickné Traoré', area: 'Sotuba', phone: '+223 76 11 22 33', status: 'valide', vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
    { id: 'pdv-02', code: 'PDV-BKO-02', name: 'Boutique Awa - Badalabougou', manager: 'Awa Sangaré', area: 'Badalabougou', phone: '+223 66 33 44 55', status: 'valide', vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
    { id: 'pdv-03', code: 'PDV-BKO-03', name: 'Supérette Hamdallaye ACI', manager: 'Modibo Keïta', area: 'ACI 2000', phone: '+223 70 55 66 77', status: 'valide', vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
    { id: 'pdv-04', code: 'PDV-BKO-04', name: 'Épicerie Faladié Sema', manager: 'Adama Samaké', area: 'Faladié', phone: '+223 65 77 88 99', status: 'valide', vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
    { id: 'pdv-05', code: 'PDV-BKO-05', name: 'Mini-Market Lafiabougou', manager: 'Kadiatou Diallo', area: 'Lafiabougou', phone: '+223 78 99 00 11', status: 'valide', vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
    { id: 'pdv-06', code: 'PDV-BKO-06', name: 'Alimentation Moderne Niamakoro', manager: 'Ousmane Cissé', area: 'Niamakoro', phone: '+223 62 11 33 55', status: 'valide', vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' },
    { id: 'pdv-07', code: 'PDV-BKO-07', name: 'Alimentation du Fleuve Daoudabougou', manager: 'Mahamadou Koné', area: 'Daoudabougou', phone: '+223 74 22 44 66', status: 'valide', vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
    { id: 'pdv-08', code: 'PDV-BKO-08', name: 'Épicerie Centrale Bozola', manager: 'Fatouma Bagayoko', area: 'Bozola', phone: '+223 67 33 55 77', status: 'valide', vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
    { id: 'pdv-09', code: 'PDV-BKO-09', name: 'Supérette Djélibougou', manager: 'Souleymane Tangara', area: 'Djélibougou', phone: '+223 79 44 66 88', status: 'valide', vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
    { id: 'pdv-10', code: 'PDV-BKO-10', name: 'Boutique du Pont Sabalibougou', manager: 'Youssouf Dembélé', area: 'Sabalibougou', phone: '+223 68 55 77 99', status: 'valide', vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
    { id: 'pdv-11', code: 'PDV-BKO-11', name: 'Alimentation Yirimadio', manager: 'Mariam Fofana', area: 'Yirimadio', phone: '+223 71 66 88 00', status: 'en_attente', vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' }, // validation admin
    { id: 'pdv-12', code: 'PDV-BKO-12', name: 'Épicerie Moribabougou', manager: 'Boubacar Mariko', area: 'Moribabougou', phone: '+223 63 77 99 11', status: 'en_attente', vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' }, // validation admin
  ];

  for (const p of pdvs) {
    insertPDV.run(p.id, p.code, p.name, p.manager, p.area, 'Bamako', p.phone, p.status, p.vendor_id, p.created_by, '2026-05-02');
  }

  // 4. Chargements Dépôt-Vente Actuels (3-7 jours de stock dans chaque camionnette de vendeur)
  const insertChargement = db.prepare(`
    INSERT INTO chargements (id, reference, vendor_id, date, items, total_amount, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const currentChargements = [
    {
      id: 'chg-01',
      ref: 'CHG-2026-10-01',
      vendor: 'usr-vnd-1',
      date: '2026-10-24',
      items: [
        { productId: 'prod-caj', code: 'JUS-CAJ-12', name: 'Jus Cajoucy', qtyBoxes: 30, unitPrice: 9600, total: 288000 },
        { productId: 'prod-ben', code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', qtyBoxes: 25, unitPrice: 14400, total: 360000 },
        { productId: 'prod-nor', code: 'EAU-NOR-06', name: 'Eau minérale Nora', qtyBoxes: 50, unitPrice: 2700, total: 135000 },
        { productId: 'prod-saf', code: 'SAU-SAF-24', name: 'Sauce Piment Safie', qtyBoxes: 20, unitPrice: 12000, total: 240000 },
      ],
      total: 1023000
    },
    {
      id: 'chg-02',
      ref: 'CHG-2026-10-02',
      vendor: 'usr-vnd-2',
      date: '2026-10-24',
      items: [
        { productId: 'prod-caj', code: 'JUS-CAJ-12', name: 'Jus Cajoucy', qtyBoxes: 25, unitPrice: 9600, total: 240000 },
        { productId: 'prod-ben', code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', qtyBoxes: 20, unitPrice: 14400, total: 288000 },
        { productId: 'prod-nor', code: 'EAU-NOR-06', name: 'Eau minérale Nora', qtyBoxes: 45, unitPrice: 2700, total: 121500 },
        { productId: 'prod-saf', code: 'SAU-SAF-24', name: 'Sauce Piment Safie', qtyBoxes: 18, unitPrice: 12000, total: 216000 },
      ],
      total: 865500
    },
    {
      id: 'chg-03',
      ref: 'CHG-2026-10-03',
      vendor: 'usr-vnd-3',
      date: '2026-10-25',
      items: [
        { productId: 'prod-caj', code: 'JUS-CAJ-12', name: 'Jus Cajoucy', qtyBoxes: 20, unitPrice: 9600, total: 192000 },
        { productId: 'prod-ben', code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', qtyBoxes: 18, unitPrice: 14400, total: 259200 },
        { productId: 'prod-nor', code: 'EAU-NOR-06', name: 'Eau minérale Nora', qtyBoxes: 40, unitPrice: 2700, total: 108000 },
        { productId: 'prod-saf', code: 'SAU-SAF-24', name: 'Sauce Piment Safie', qtyBoxes: 15, unitPrice: 12000, total: 180000 },
      ],
      total: 739200
    }
  ];

  for (const chg of currentChargements) {
    insertChargement.run(chg.id, chg.ref, chg.vendor, chg.date, JSON.stringify(chg.items), chg.total, 'valide', chg.date);
  }

  // 5. Génération de 6 mois de ventes réelles (mai 2026 à octobre 2026)
  // et des versements correspondants en dépôt-vente
  const insertSale = db.prepare(`
    INSERT INTO sales (id, number, date, vendor_id, pdv_id, items, total_amount, payment_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVersement = db.prepare(`
    INSERT INTO versements (id, reference, date, vendor_id, amount, payment_mode, status, validated_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const vendors = ['usr-vnd-1', 'usr-vnd-2', 'usr-vnd-3'];
  const validPdvIds = pdvs.filter(p => p.status === 'valide').map(p => p.id);

  const productCatalogue = [
    { id: 'prod-caj', code: 'JUS-CAJ-12', name: 'Jus Cajoucy', price: 9600 },
    { id: 'prod-ben', code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', price: 14400 },
    { id: 'prod-nor', code: 'EAU-NOR-06', name: 'Eau minérale Nora', price: 2700 },
    { id: 'prod-saf', code: 'SAU-SAF-24', name: 'Sauce Piment Safie', price: 12000 },
  ];

  let saleCounter = 100;
  let versementCounter = 50;

  // Track sales per vendor to create matching versements with a realistic remaining unpaid balance
  const vendorSalesAccumulator: Record<string, number> = {
    'usr-vnd-1': 0,
    'usr-vnd-2': 0,
    'usr-vnd-3': 0,
  };

  // Generate sales for roughly 25 dates across the 6-month period
  const startDate = new Date('2026-05-04');
  const endDate = new Date('2026-10-26');
  const dayStep = 7; // approximately every week over 6 months

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + dayStep)) {
    const dateStr = d.toISOString().split('T')[0];

    for (let vIdx = 0; vIdx < vendors.length; vIdx++) {
      const vendorId = vendors[vIdx];
      // Pick 2 random PDVs for this vendor on this day
      const pdv1 = validPdvIds[(vIdx * 3 + Math.floor(d.getDate() % 3)) % validPdvIds.length];
      const pdv2 = validPdvIds[(vIdx * 3 + 1) % validPdvIds.length];

      for (const pdvId of [pdv1, pdv2]) {
        saleCounter++;
        const saleNum = `VTE-2026-${String(saleCounter).padStart(5, '0')}`;

        // Random selection of 2-3 products
        const qty1 = 2 + (saleCounter % 4); // 2 to 5 cartons
        const qty2 = 1 + ((saleCounter + 1) % 3); // 1 to 3 cartons
        const p1 = productCatalogue[saleCounter % 4];
        const p2 = productCatalogue[(saleCounter + 2) % 4];

        const items = [
          { productId: p1.id, code: p1.code, name: p1.name, qtyBoxes: qty1, unitPrice: p1.price, total: qty1 * p1.price },
          { productId: p2.id, code: p2.code, name: p2.name, qtyBoxes: qty2, unitPrice: p2.price, total: qty2 * p2.price }
        ];

        const saleTotal = items.reduce((sum, item) => sum + item.total, 0);
        vendorSalesAccumulator[vendorId] += saleTotal;

        insertSale.run(
          `sale-${saleCounter}`,
          saleNum,
          dateStr,
          vendorId,
          pdvId,
          JSON.stringify(items),
          saleTotal,
          saleCounter % 3 === 0 ? 'Orange Money' : 'Comptant',
          'livree',
          dateStr
        );
      }
    }

    // Bi-weekly versement by each vendor to Comptabilité (depot-vente model)
    // Vendors turn in ~85% of their recent collections, leaving a working balance in transit
    if (d.getDate() % 14 < 7) {
      for (const vendorId of vendors) {
        versementCounter++;
        // Calculate ~85% of recently accumulated sales for this batch
        const recentBatchAmount = Math.floor((120000 + (saleCounter % 50000)) / 5000) * 5000;
        insertVersement.run(
          `vsm-${versementCounter}`,
          `VSM-2026-${String(versementCounter).padStart(4, '0')}`,
          dateStr,
          vendorId,
          recentBatchAmount,
          versementCounter % 2 === 0 ? 'Espèces' : 'Orange Money',
          'valide',
          'Fatoumata Coulibaly (Comptable)',
          'Versement bimensuel des encaissements points de vente',
          dateStr
        );
      }
    }
  }

  // 6. Réceptions Fournisseurs (Fournisseur -> Dépôt Central)
  const insertReception = db.prepare(`
    INSERT INTO receptions (id, reference, supplier_name, date, items, total_boxes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertReception.run(
    'recp-01',
    'REC-FOURN-2026-08',
    'Usines Partenaires Agroalimentaires Mali',
    '2026-09-01',
    JSON.stringify([
      { code: 'JUS-CAJ-12', name: 'Jus Cajoucy', boxes: 600 },
      { code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', boxes: 500 },
      { code: 'EAU-NOR-06', name: 'Eau minérale Nora', boxes: 1000 },
      { code: 'SAU-SAF-24', name: 'Sauce Piment Safie', boxes: 450 },
    ]),
    2550,
    '2026-09-01'
  );

  insertReception.run(
    'recp-02',
    'REC-FOURN-2026-10',
    'Usines Partenaires Agroalimentaires Mali',
    '2026-10-15',
    JSON.stringify([
      { code: 'JUS-CAJ-12', name: 'Jus Cajoucy', boxes: 400 },
      { code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', boxes: 350 },
      { code: 'EAU-NOR-06', name: 'Eau minérale Nora', boxes: 500 },
      { code: 'SAU-SAF-24', name: 'Sauce Piment Safie', boxes: 300 },
    ]),
    1550,
    '2026-10-15'
  );

  // Set seeded_at flag to guarantee this seed is only run ONCE and never overwritten!
  const now = new Date().toISOString();
  db.prepare("INSERT INTO settings (key, value) VALUES ('seeded_at', ?)").run(now);
  console.log(`[Baobab Distribution] Données de démonstration initialisées avec succès le ${now}.`);
  ensureSampleLots();
  ensurePdvGpsCoordinates();
  ensureZeroSalesPdvs();
  ensurePdvStorefrontPhotos();
  ensureRecentDailySales();
  ensureSalesHaveTimes();
  ensureSemesterBonsAndScores();
  ensureVendorGpsTrajectories();
  ensureComptableInvoicesAndPurchaseRequests();
}

export function ensureZeroSalesPdvs() {
  try {
    // Ensure there are validated and non-validated PDVs created by vendors that have 0 sales ("0 ventes")
    const insertZeroSalePdv = db.prepare(`
      INSERT OR IGNORE INTO points_de_vente (
        id, code, name, manager_name, neighborhood, city, phone,
        status, latitude, longitude, gps_accuracy, captured_at,
        vendor_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Bamako', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertZeroSalePdv.run(
      'pdv-13',
      'PDV-BKO-13',
      'Boutique Danaya Sotuba',
      'Ibrahim Coulibaly',
      'Sotuba',
      '+223 76 80 12 34',
      'valide',
      12.66214,
      -7.93385,
      4.1,
      '2026-10-25 14:20:00',
      'usr-vnd-1',
      'Oumar Konaté',
      '2026-10-25'
    );

    insertZeroSalePdv.run(
      'pdv-14',
      'PDV-BKO-14',
      'Alimentation Baraka Badalabougou',
      'Sadio Keïta',
      'Badalabougou',
      '+223 66 45 90 12',
      'valide',
      12.61892,
      -7.98814,
      3.9,
      '2026-10-25 15:10:00',
      'usr-vnd-2',
      'Bakary Sidibé',
      '2026-10-25'
    );

    insertZeroSalePdv.run(
      'pdv-15',
      'PDV-BKO-15',
      'Boutique Faso Djigui Lafiabougou',
      'Mamadou Diarra',
      'Lafiabougou',
      '+223 75 19 42 88',
      'en_attente',
      12.63954,
      -8.04012,
      4.0,
      '2026-10-26 11:05:00',
      'usr-vnd-1',
      'Oumar Konaté',
      '2026-10-26'
    );

    insertZeroSalePdv.run(
      'pdv-16',
      'PDV-BKO-16',
      'Épicerie Benkadi Faladié',
      'Aminata Touré',
      'Faladié',
      '+223 69 51 23 70',
      'en_attente',
      12.59741,
      -7.95062,
      3.8,
      '2026-10-26 11:40:00',
      'usr-vnd-2',
      'Bakary Sidibé',
      '2026-10-26'
    );
  } catch (e) {
    console.warn('ensureZeroSalesPdvs warning:', e);
  }
}

export function ensurePdvStorefrontPhotos() {
  try {
    const allPdvs = db.prepare(`
      SELECT id, code, name, neighborhood, photo_url
      FROM points_de_vente
    `).all() as Array<{
      id: string;
      code: string;
      name: string;
      neighborhood: string;
      photo_url: string | null;
    }>;

    const updatePhotoStmt = db.prepare('UPDATE points_de_vente SET photo_url = ? WHERE id = ?');

    for (const pdv of allPdvs) {
      const existingUrl = pdv.photo_url ? pdv.photo_url.trim() : '';
      const isOldSvg = existingUrl.endsWith('.svg') || existingUrl.startsWith('data:image/svg+xml');
      const existingFile =
        existingUrl.startsWith('/uploads/')
          ? path.join(process.cwd(), 'public', existingUrl)
          : '';

      if (!existingUrl || isOldSvg || (existingFile && !fs.existsSync(existingFile))) {
        const realPhotoUrl = getRealStorefrontPhotoForPdv(pdv);
        updatePhotoStmt.run(realPhotoUrl, pdv.id);
      }
    }
  } catch (e) {
    console.warn('ensurePdvStorefrontPhotos warning:', e);
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function ensureSemesterBonsAndScores() {
  try {
    const defaultWeights = JSON.stringify({
      ca: 8,
      regularite: 4,
      versements: 4,
      pdv: 2,
      rigueur: 2,
    });
    const defaultTiers = JSON.stringify({
      tier_10_12: 10000,
      tier_12_5_14_5: 20000,
      tier_15_17: 40000,
      tier_17_5_20: 75000,
    });

    db.prepare(`
      INSERT OR IGNORE INTO settings (key, value) VALUES ('semester_weights', ?)
    `).run(defaultWeights);

    db.prepare(`
      INSERT OR IGNORE INTO settings (key, value) VALUES ('semester_tiers', ?)
    `).run(defaultTiers);

    const check = db.prepare("SELECT value FROM settings WHERE key = 'seeded_semester_s1_2026'").get() as { value: string } | undefined;
    if (check && check.value) return;

    const nowIso = new Date().toISOString();
    const issuedDate = new Date();
    const expiresDate = new Date(issuedDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const issuedStr = formatDate(issuedDate);
    const expiresStr = formatDate(expiresDate);

    // Clôture du 1er juillet 2026 (Semestre S1-2026) : notes figées et bons générés côté serveur avant tout grattage
    const initialEvaluations = [
      {
        id: 'eval-s1-2026-vnd1',
        vendor_id: 'usr-vnd-1',
        vendor_code: 'BAO-VND-001',
        vendor_name: 'Oumar Konaté',
        semester: 'S1-2026',
        closure_date: '2026-07-01',
        score_ca: 6.5,
        score_regularite: 3.5,
        score_versements: 3.5,
        score_pdv: 1.0,
        score_rigueur: 1.5,
        raw_total: 16.0,
        note_finale: 16.0,
        amount: 40000, // 15-17 => 40 000 FCFA
        bon_id: 'bon-s1-2026-vnd1',
        bon_ref: 'BON-S1-2026-001',
      },
      {
        id: 'eval-s1-2026-vnd2',
        vendor_id: 'usr-vnd-2',
        vendor_code: 'BAO-VND-002',
        vendor_name: 'Bakary Sidibé',
        semester: 'S1-2026',
        closure_date: '2026-07-01',
        score_ca: 5.5,
        score_regularite: 3.0,
        score_versements: 2.5,
        score_pdv: 1.0,
        score_rigueur: 1.5,
        raw_total: 13.5,
        note_finale: 13.5,
        amount: 20000, // 12,5-14,5 => 20 000 FCFA
        bon_id: 'bon-s1-2026-vnd2',
        bon_ref: 'BON-S1-2026-002',
      },
      {
        id: 'eval-s1-2026-vnd3',
        vendor_id: 'usr-vnd-3',
        vendor_code: 'BAO-VND-003',
        vendor_name: 'Seydou Diakité',
        semester: 'S1-2026',
        closure_date: '2026-07-01',
        score_ca: 7.5,
        score_regularite: 3.5,
        score_versements: 3.5,
        score_pdv: 1.5,
        score_rigueur: 2.0,
        raw_total: 18.0,
        note_finale: 18.0,
        amount: 75000, // 17,5-20 => 75 000 FCFA
        bon_id: 'bon-s1-2026-vnd3',
        bon_ref: 'BON-S1-2026-003',
      },
    ];

    const insertEval = db.prepare(`
      INSERT OR IGNORE INTO semester_evaluations (
        id, vendor_id, semester, closure_date,
        score_ca, score_regularite, score_versements, score_pdv, score_rigueur,
        raw_total, note_finale, is_frozen, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const insertBon = db.prepare(`
      INSERT OR IGNORE INTO bons_cadeaux (
        id, reference, vendor_id, semester, closure_date,
        note, amount, revealed, revealed_at, issued_at, expires_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 'actif', ?)
    `);

    const insertNotif = db.prepare(`
      INSERT OR IGNORE INTO notifications (id, role, title, message, type, reference, is_read, created_at)
      VALUES (?, 'Vendeur', ?, ?, 'cadeau', ?, 0, ?)
    `);

    const insertAudit = db.prepare(`
      INSERT OR IGNORE INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ev of initialEvaluations) {
      insertEval.run(
        ev.id,
        ev.vendor_id,
        ev.semester,
        ev.closure_date,
        ev.score_ca,
        ev.score_regularite,
        ev.score_versements,
        ev.score_pdv,
        ev.score_rigueur,
        ev.raw_total,
        ev.note_finale,
        JSON.stringify({
          weights: { ca: 8, regularite: 4, versements: 4, pdv: 2, rigueur: 2 },
          closure: 'Clôture semestrielle du 1er juillet',
        }),
        nowIso
      );

      if (ev.note_finale >= 10 && ev.amount > 0) {
        insertBon.run(
          ev.bon_id,
          ev.bon_ref,
          ev.vendor_id,
          ev.semester,
          ev.closure_date,
          ev.note_finale,
          ev.amount,
          issuedStr,
          expiresStr,
          nowIso
        );

        insertNotif.run(
          `notif-${ev.bon_id}`,
          `Nouveau bon à gratter (${ev.semester})`,
          `${ev.vendor_name} (${ev.vendor_code}) : Votre note semestrielle (${ev.note_finale}/20) vous donne droit à une carte à gratter dans "Mes cadeaux" (valable 90 jours).`,
          ev.bon_ref,
          nowIso
        );

        insertAudit.run(
          `aud-${ev.bon_id}`,
          'CLOTURE_SEMESTRE_ET_GENERATION_BON',
          'BON_CADEAU',
          ev.bon_id,
          'Administrateur',
          ev.vendor_id,
          `Clôture ${ev.semester} (${ev.closure_date}) pour ${ev.vendor_name} (${ev.vendor_code}) : note figée à ${ev.note_finale}/20, bon ${ev.bon_ref} généré (valeur fixée côté serveur avant tout grattage, validité 90 jours jusqu'au ${expiresStr}).`,
          nowIso
        );
      }
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded_semester_s1_2026', ?)").run(nowIso);
  } catch (e) {
    console.warn('ensureSemesterBonsAndScores warning:', e);
  }
}

export function ensurePdvGpsCoordinates() {
  try {
    const bamakoCoordsByArea: Record<string, { lat: number; lng: number }> = {
      'Sotuba': { lat: 12.6608, lng: -7.9352 },
      'Badalabougou': { lat: 12.6174, lng: -7.9896 },
      'ACI 2000': { lat: 12.6331, lng: -8.0268 },
      'Faladié': { lat: 12.5968, lng: -7.9514 },
      'Lafiabougou': { lat: 12.6389, lng: -8.0412 },
      'Niamakoro': { lat: 12.5815, lng: -7.9685 },
      'Daoudabougou': { lat: 12.6062, lng: -7.9721 },
      'Bozola': { lat: 12.6458, lng: -7.9942 },
      'Djélibougou': { lat: 12.6654, lng: -7.9598 },
      'Sabalibougou': { lat: 12.6025, lng: -8.0041 },
      'Yirimadio': { lat: 12.5982, lng: -7.9125 },
      'Moribabougou': { lat: 12.6852, lng: -7.8994 },
    };

    const pdvsWithoutCoords = db.prepare('SELECT id, neighborhood, created_at FROM points_de_vente WHERE latitude IS NULL OR longitude IS NULL').all() as {
      id: string;
      neighborhood: string;
      created_at: string;
    }[];

    if (pdvsWithoutCoords.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE points_de_vente
        SET latitude = ?, longitude = ?, gps_accuracy = ?, captured_at = COALESCE(captured_at, ?)
        WHERE id = ?
      `);
      pdvsWithoutCoords.forEach((p, idx) => {
        const base = bamakoCoordsByArea[p.neighborhood] || { lat: 12.6392, lng: -8.0029 };
        const jitterLat = ((idx % 5) - 2) * 0.0008;
        const jitterLng = ((idx % 4) - 1.5) * 0.0008;
        updateStmt.run(
          Number((base.lat + jitterLat).toFixed(6)),
          Number((base.lng + jitterLng).toFixed(6)),
          4.5,
          `${p.created_at} 10:15:00`,
          p.id
        );
      });
    }

    // Ensure every PDV has a creator vendor_id and created_by assigned
    const vendorByPdvId: Record<string, { vendor_id: string; created_by: string }> = {
      'pdv-01': { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
      'pdv-02': { vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
      'pdv-03': { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
      'pdv-04': { vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
      'pdv-05': { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
      'pdv-06': { vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' },
      'pdv-07': { vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
      'pdv-08': { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
      'pdv-09': { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
      'pdv-10': { vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
      'pdv-11': { vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' },
      'pdv-12': { vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' },
    };

    const pdvsWithoutOwner = db.prepare('SELECT id, neighborhood FROM points_de_vente WHERE vendor_id IS NULL OR vendor_id = \'\'').all() as {
      id: string;
      neighborhood: string;
    }[];

    if (pdvsWithoutOwner.length > 0) {
      const updateOwnerStmt = db.prepare('UPDATE points_de_vente SET vendor_id = ?, created_by = ? WHERE id = ?');
      pdvsWithoutOwner.forEach((p, idx) => {
        const mapped = vendorByPdvId[p.id] || [
          { vendor_id: 'usr-vnd-1', created_by: 'Oumar Konaté' },
          { vendor_id: 'usr-vnd-2', created_by: 'Bakary Sidibé' },
          { vendor_id: 'usr-vnd-3', created_by: 'Seydou Diakité' },
        ][idx % 3];
        updateOwnerStmt.run(mapped.vendor_id, mapped.created_by, p.id);
      });
    }
  } catch (e) {
    console.warn('ensurePdvGpsCoordinates warning:', e);
  }
}

export function ensureSampleLots() {
  try {
    const today = new Date();
    const addDays = (d: Date, days: number) => {
      const copy = new Date(d);
      copy.setDate(copy.getDate() + days);
      return formatDate(copy);
    };

    // Check existing lots count
    const countRow = db.prepare("SELECT COUNT(*) as count FROM lots").get() as { count: number };
    if (countRow.count < 6) {
      // Seed varied lots so all 4 shelf life statuses are immediately demonstrable
      const insert = db.prepare(`
        INSERT INTO lots (id, product_id, lot_number, expiry_date, quantity, initial_quantity, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 1. > 90 jours (Vert)
      insert.run('lot-caj-long', 'prod-caj', 'LOT-CAJ-V24', addDays(today, 210), 350, 350, 'actif', formatDate(today));
      insert.run('lot-ben-long', 'prod-ben', 'LOT-BEN-V28', addDays(today, 180), 280, 280, 'actif', formatDate(today));

      // 2. 30 à 90 jours (Marron)
      insert.run('lot-caj-mid', 'prod-caj', 'LOT-CAJ-M60', addDays(today, 55), 180, 200, 'actif', formatDate(today));
      insert.run('lot-saf-mid', 'prod-saf', 'LOT-SAF-M45', addDays(today, 45), 120, 150, 'actif', formatDate(today));

      // 3. Moins de 30 jours (Rouge)
      insert.run('lot-nor-urgent', 'prod-nor', 'LOT-NOR-U18', addDays(today, 18), 90, 100, 'actif', formatDate(today));
      insert.run('lot-ben-urgent', 'prod-ben', 'LOT-BEN-U12', addDays(today, 12), 65, 80, 'actif', formatDate(today));

      // 4. Périmé (Gris - bloqué à la vente et au chargement)
      insert.run('lot-caj-perime', 'prod-caj', 'LOT-CAJ-P08', addDays(today, -8), 25, 50, 'perime', formatDate(today));
      insert.run('lot-saf-perime', 'prod-saf', 'LOT-SAF-P03', addDays(today, -3), 15, 30, 'perime', formatDate(today));

      console.log('[Baobab Distribution] Lots de démonstration multi-statuts configurés.');
    }
  } catch (e) {
    console.warn('ensureSampleLots warning:', e);
  }
}

export function ensureRecentDailySales() {
  try {
    const check = db.prepare("SELECT value FROM settings WHERE key = 'seeded_recent_7days'").get() as { value: string } | undefined;
    if (check && check.value) return;

    const recentDates = [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ];

    const vendors = ['usr-vnd-1', 'usr-vnd-2', 'usr-vnd-3'];
    const pdvRows = db.prepare("SELECT id FROM points_de_vente WHERE status = 'valide' AND id NOT IN ('pdv-13', 'pdv-14')").all() as { id: string }[];
    const validPdvIds = pdvRows.length > 0 ? pdvRows.map(r => r.id) : ['pdv-01', 'pdv-02', 'pdv-03'];

    const productCatalogue = [
      { id: 'prod-caj', code: 'JUS-CAJ-12', name: 'Jus Cajoucy', price: 9600 },
      { id: 'prod-ben', code: 'MAY-BEN-12', name: 'Mayonnaise Bennor', price: 14400 },
      { id: 'prod-nor', code: 'EAU-NOR-06', name: 'Eau minérale Nora', price: 2700 },
      { id: 'prod-saf', code: 'SAU-SAF-24', name: 'Sauce Piment Safie', price: 12000 },
    ];

    const insertSale = db.prepare(`
      INSERT OR IGNORE INTO sales (id, number, date, vendor_id, pdv_id, items, total_amount, payment_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    recentDates.forEach((dateStr, dIdx) => {
      vendors.forEach((vendorId, vIdx) => {
        const seedIndex = dIdx * 10 + vIdx;
        const saleId = `sale-7d-${dIdx}-${vIdx}`;
        const saleNumber = `VTE-2026-7D${String(dIdx + 1).padStart(2, '0')}${vIdx + 1}`;
        const pdvId = validPdvIds[(dIdx + vIdx * 2) % validPdvIds.length];

        const p1 = productCatalogue[(dIdx + vIdx) % productCatalogue.length];
        const p2 = productCatalogue[(dIdx + vIdx + 2) % productCatalogue.length];
        const qty1 = 2 + ((dIdx + vIdx) % 4);
        const qty2 = 1 + ((dIdx * 2 + vIdx) % 3);

        const items = [
          { productId: p1.id, code: p1.code, name: p1.name, qtyBoxes: qty1, unitPrice: p1.price, total: qty1 * p1.price },
          { productId: p2.id, code: p2.code, name: p2.name, qtyBoxes: qty2, unitPrice: p2.price, total: qty2 * p2.price },
        ];
        const saleTotal = items.reduce((sum, it) => sum + it.total, 0);

        insertSale.run(
          saleId,
          saleNumber,
          dateStr,
          vendorId,
          pdvId,
          JSON.stringify(items),
          saleTotal,
          seedIndex % 3 === 0 ? 'Orange Money' : 'Comptant',
          'livree',
          dateStr
        );
      });
    });

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded_recent_7days', ?)").run(new Date().toISOString());
  } catch (e) {
    console.warn('ensureRecentDailySales warning:', e);
  }
}

export function ensureSalesHaveTimes() {
  try {
    const salesWithoutTime = db.prepare(`
      SELECT id, number, date, offline_recorded_at, created_at
      FROM sales
      WHERE sale_time IS NULL OR sale_time = ''
      ORDER BY date ASC, number ASC
    `).all() as Array<{
      id: string;
      number: string;
      date: string;
      offline_recorded_at?: string | null;
      created_at?: string | null;
    }>;

    if (salesWithoutTime.length === 0) return;

    const updateStmt = db.prepare(`
      UPDATE sales
      SET sale_time = ?, created_at = ?
      WHERE id = ?
    `);

    const sampleTimes = [
      '08:25', '08:50', '09:15', '09:42', '10:10', '10:35',
      '11:05', '11:28', '11:55', '12:20', '13:15', '13:48',
      '14:12', '14:40', '15:05', '15:32', '16:00', '16:25',
      '16:50', '17:18', '17:45'
    ];

    salesWithoutTime.forEach((s, idx) => {
      let timeStr = '';
      if (s.offline_recorded_at && s.offline_recorded_at.includes('T')) {
        timeStr = s.offline_recorded_at.split('T')[1].slice(0, 5);
      } else if (s.created_at && s.created_at.includes('T')) {
        timeStr = s.created_at.split('T')[1].slice(0, 5);
      }
      if (!timeStr || timeStr.length < 5) {
        timeStr = sampleTimes[idx % sampleTimes.length];
      }
      const fullCreatedAt =
        s.created_at && s.created_at.includes('T')
          ? s.created_at
          : `${s.date}T${timeStr}:00`;

      updateStmt.run(timeStr, fullCreatedAt, s.id);
    });
  } catch (e) {
    console.warn('ensureSalesHaveTimes warning:', e);
  }
}

export function ensureVendorGpsTrajectories() {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM vendor_gps_positions').get() as { count: number };
    if (countRow && countRow.count > 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const insertPos = db.prepare(`
      INSERT OR IGNORE INTO vendor_gps_positions (
        id, vendor_id, latitude, longitude, accuracy, speed_kmh,
        activity_label, pdv_id, recorded_offline, recorded_at, synced_at, date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const routes: Array<{
      id: string;
      vendor_id: string;
      lat: number;
      lng: number;
      acc: number;
      speed: number;
      label: string;
      pdv_id: string | null;
      offline: number;
      time: string;
    }> = [
      // Oumar Konaté (usr-vnd-1) — Tournée Rive Gauche (Sotuba -> Djélibougou -> Bozola -> ACI 2000 -> Lafiabougou)
      { id: 'gps-v1-1', vendor_id: 'usr-vnd-1', lat: 12.6608, lng: -7.9352, acc: 3.8, speed: 0, label: 'Départ Dépôt Central Sotuba', pdv_id: 'pdv-01', offline: 0, time: '08:05:00' },
      { id: 'gps-v1-2', vendor_id: 'usr-vnd-1', lat: 12.6654, lng: -7.9598, acc: 4.2, speed: 24, label: 'Livraison Supérette Djélibougou', pdv_id: 'pdv-09', offline: 0, time: '09:15:00' },
      { id: 'gps-v1-3', vendor_id: 'usr-vnd-1', lat: 12.6458, lng: -7.9942, acc: 5.1, speed: 18, label: 'Livraison Épicerie Centrale Bozola', pdv_id: 'pdv-08', offline: 1, time: '10:30:00' },
      { id: 'gps-v1-4', vendor_id: 'usr-vnd-1', lat: 12.6331, lng: -8.0268, acc: 3.9, speed: 28, label: 'Livraison Supérette Hamdallaye ACI', pdv_id: 'pdv-03', offline: 1, time: '11:45:00' },
      { id: 'gps-v1-5', vendor_id: 'usr-vnd-1', lat: 12.6389, lng: -8.0412, acc: 3.5, speed: 12, label: 'En tournée • Mini-Market Lafiabougou', pdv_id: 'pdv-05', offline: 0, time: '13:10:00' },

      // Bakary Sidibé (usr-vnd-2) — Tournée Rive Droite (Sotuba -> Pont Roi Fahd -> Badalabougou -> Sabalibougou -> Daoudabougou -> Faladié)
      { id: 'gps-v2-1', vendor_id: 'usr-vnd-2', lat: 12.6602, lng: -7.9360, acc: 4.0, speed: 0, label: 'Départ Dépôt Central Sotuba', pdv_id: null, offline: 0, time: '08:15:00' },
      { id: 'gps-v2-2', vendor_id: 'usr-vnd-2', lat: 12.6174, lng: -7.9896, acc: 4.4, speed: 32, label: 'Livraison Boutique Awa - Badalabougou', pdv_id: 'pdv-02', offline: 0, time: '09:30:00' },
      { id: 'gps-v2-3', vendor_id: 'usr-vnd-2', lat: 12.6025, lng: -8.0041, acc: 4.8, speed: 21, label: 'Livraison Boutique du Pont Sabalibougou', pdv_id: 'pdv-10', offline: 1, time: '10:50:00' },
      { id: 'gps-v2-4', vendor_id: 'usr-vnd-2', lat: 12.6062, lng: -7.9721, acc: 3.7, speed: 19, label: 'Livraison Alimentation du Fleuve Daoudabougou', pdv_id: 'pdv-07', offline: 0, time: '12:05:00' },
      { id: 'gps-v2-5', vendor_id: 'usr-vnd-2', lat: 12.5968, lng: -7.9514, acc: 3.6, speed: 15, label: 'En tournée • Épicerie Faladié Sema', pdv_id: 'pdv-04', offline: 0, time: '13:25:00' },

      // Seydou Diakité (usr-vnd-3) — Tournée Sud & Périphérie (Sotuba -> Yirimadio -> Faladié -> Niamakoro)
      { id: 'gps-v3-1', vendor_id: 'usr-vnd-3', lat: 12.6612, lng: -7.9348, acc: 4.1, speed: 0, label: 'Départ Dépôt Central Sotuba', pdv_id: null, offline: 0, time: '08:20:00' },
      { id: 'gps-v3-2', vendor_id: 'usr-vnd-3', lat: 12.6250, lng: -7.9240, acc: 5.0, speed: 35, label: 'Passage Chaussée de Sotuba', pdv_id: null, offline: 1, time: '09:40:00' },
      { id: 'gps-v3-3', vendor_id: 'usr-vnd-3', lat: 12.5982, lng: -7.9125, acc: 4.5, speed: 22, label: 'Prospection Alimentation Yirimadio', pdv_id: 'pdv-11', offline: 1, time: '11:10:00' },
      { id: 'gps-v3-4', vendor_id: 'usr-vnd-3', lat: 12.5815, lng: -7.9685, acc: 3.9, speed: 14, label: 'En tournée • Alimentation Moderne Niamakoro', pdv_id: 'pdv-06', offline: 0, time: '13:15:00' },
    ];

    for (const pt of routes) {
      const recordedIso = `${todayStr}T${pt.time}`;
      const syncedIso = pt.offline ? `${todayStr}T13:30:00` : recordedIso;
      insertPos.run(
        pt.id,
        pt.vendor_id,
        pt.lat,
        pt.lng,
        pt.acc,
        pt.speed,
        pt.label,
        pt.pdv_id,
        pt.offline,
        recordedIso,
        syncedIso,
        todayStr
      );
    }
  } catch (e) {
    console.warn('ensureVendorGpsTrajectories warning:', e);
  }
}

export function ensureComptableInvoicesAndPurchaseRequests() {
  try {
    // 1. Ensure every sale has an auto-generated mini thermal receipt number (thermal_ticket_number)
    const salesMissingTicket = db.prepare(`
      SELECT id, number FROM sales WHERE thermal_ticket_number IS NULL OR thermal_ticket_number = ''
    `).all() as Array<{ id: string; number: string }>;

    if (salesMissingTicket.length > 0) {
      const updateTicketStmt = db.prepare('UPDATE sales SET thermal_ticket_number = ? WHERE id = ?');
      for (const s of salesMissingTicket) {
        const ticketNum = String(s.number || s.id).replace(/^VTE-/, 'TKT-THERM-');
        updateTicketStmt.run(ticketNum.startsWith('TKT-') ? ticketNum : `TKT-THERM-${ticketNum}`, s.id);
      }
    }

    // 2. Ensure the Comptable has created official invoices for each vendor so vendors can view/print them or request rectification
    const checkInvoices = db.prepare("SELECT value FROM settings WHERE key = 'seeded_comptable_invoices_v1'").get() as { value: string } | undefined;
    if (!checkInvoices || !checkInvoices.value) {
      const vendors = ['usr-vnd-1', 'usr-vnd-2', 'usr-vnd-3'];
      const updateInvoiceStmt = db.prepare(`
        UPDATE sales
        SET invoice_generated = 1,
            invoice_number = ?,
            with_tva = ?,
            tva_rate = ?,
            tva_amount = ?,
            total_ttc = ?,
            invoice_generated_at = ?,
            invoice_generated_by = 'Fatoumata Coulibaly (Comptable)'
        WHERE id = ?
      `);

      for (const vId of vendors) {
        const recentVendorSales = db.prepare(`
          SELECT id, number, total_amount, date, sale_time
          FROM sales
          WHERE vendor_id = ?
          ORDER BY date DESC, COALESCE(sale_time, '00:00') DESC
          LIMIT 5
        `).all(vId) as Array<{ id: string; number: string; total_amount: number; date: string; sale_time: string }>;

        recentVendorSales.forEach((s, idx) => {
          const invNum = String(s.number || '').replace(/^VTE-/, 'FAC-');
          const withTva = idx % 2 === 0 ? 1 : 0;
          const subtotal = Number(s.total_amount || 0);
          const tvaAmt = withTva ? Math.round(subtotal * 0.18) : 0;
          const totalTtc = subtotal + tvaAmt;
          updateInvoiceStmt.run(
            invNum,
            withTva,
            withTva ? 18 : 0,
            tvaAmt,
            totalTtc,
            `${s.date}T16:30:00`,
            s.id
          );
        });
      }

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded_comptable_invoices_v1', ?)").run(new Date().toISOString());
    }

    // 3. Seed sample purchase requests (Demandes d'achat) from Magasinier and Comptable
    const checkPurchaseReqs = db.prepare("SELECT value FROM settings WHERE key = 'seeded_purchase_requests_v1'").get() as { value: string } | undefined;
    if (!checkPurchaseReqs || !checkPurchaseReqs.value) {
      const insertPR = db.prepare(`
        INSERT OR IGNORE INTO purchase_requests (
          id, reference, requester_id, requester_name, requester_code, requester_role,
          title, category, supplier_name, items_json, total_amount, request_motif,
          status, admin_motif, reviewed_by, reviewed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertPR.run(
        'pr-mag-01',
        'ACH-2026-001',
        'usr-mag',
        'Moussa Diarra',
        'BAO-MAG',
        'Magasinier',
        'Réapprovisionnement Dépôt Central (Jus Cajoucy & Mayonnaise Bennor)',
        'Approvisionnement Stock Dépôt',
        'Usines Partenaires Agroalimentaires Mali',
        JSON.stringify([
          { designation: 'Jus Cajoucy (Carton de 12)', quantity: 150, unitPrice: 8200, total: 1230000 },
          { designation: 'Mayonnaise Bennor (Carton de 12)', quantity: 100, unitPrice: 12500, total: 1250000 },
        ]),
        2480000,
        'Anticiper la forte demande des grossistes de Sotuba et ACI 2000 pour la semaine prochaine.',
        'en_attente',
        null,
        null,
        null,
        '2026-10-26T09:30:00'
      );

      insertPR.run(
        'pr-cpt-01',
        'ACH-2026-002',
        'usr-cpt',
        'Fatoumata Coulibaly',
        'BAO-CPT',
        'Comptable',
        'Achat de rouleaux papier thermique 80mm & classeurs comptables',
        'Fournitures Comptabilité & Caisse',
        'Papeterie Centrale du Mali (Bamako)',
        JSON.stringify([
          { designation: 'Cartons de 50 rouleaux thermiques 80mm (Vendeurs & Caisse)', quantity: 6, unitPrice: 25000, total: 150000 },
          { designation: 'Registres & classeurs d\'archivage factures TVA', quantity: 15, unitPrice: 4500, total: 67500 },
        ]),
        217500,
        'Renouvellement du stock de bobines thermiques pour les mini factures des vendeurs.',
        'en_attente',
        null,
        null,
        null,
        '2026-10-26T11:15:00'
      );

      insertPR.run(
        'pr-mag-02',
        'ACH-2026-003',
        'usr-mag',
        'Moussa Diarra',
        'BAO-MAG',
        'Magasinier',
        'Achat palettes de manutention et film étirable entrepôt Sotuba',
        'Équipement & Logistique Dépôt',
        'Sotuba Logistique SARL',
        JSON.stringify([
          { designation: 'Palettes bois renforcées normes dépôt', quantity: 25, unitPrice: 6500, total: 162500 },
          { designation: 'Rouleaux film étirable industriel', quantity: 10, unitPrice: 8500, total: 85000 },
        ]),
        247500,
        'Protection des nouveaux lots FEFO en zone de stockage.',
        'validee',
        'Demande validée. Vous pouvez procéder à la réception avec le fournisseur dès demain matin.',
        'Amadou Touré (Administrateur)',
        '2026-10-25T16:40:00',
        '2026-10-25T10:00:00'
      );

      insertPR.run(
        'pr-cpt-02',
        'ACH-2026-004',
        'usr-cpt',
        'Fatoumata Coulibaly',
        'BAO-CPT',
        'Comptable',
        'Acquisition coffre-fort secondaire de caisse',
        'Équipement Comptabilité & Caisse',
        'SécuriMali Équipements',
        JSON.stringify([
          { designation: 'Coffre-fort ignifugé 65L serrure double', quantity: 1, unitPrice: 385000, total: 385000 },
        ]),
        385000,
        null, // Motif optionnel laissé vide pour illustrer son caractère optionnel
        'rejetee',
        'Reporté au budget du prochain trimestre.',
        'Amadou Touré (Administrateur)',
        '2026-10-24T17:10:00',
        '2026-10-24T14:20:00'
      );

      // Seed notifications for Admin & Magasinier/Comptable
      const insertNotif = db.prepare(`
        INSERT OR IGNORE INTO notifications (id, role, target_user_id, title, message, type, reference, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);

      insertNotif.run(
        'notif-pr-adm-1',
        'Administrateur',
        'usr-adm',
        'Nouvelle demande d\'achat (Magasinier) : ACH-2026-001',
        'Moussa Diarra (Magasinier) a soumis une demande d\'achat de 2 480 000 FCFA : "Réapprovisionnement Dépôt Central (Jus Cajoucy & Mayonnaise Bennor)". Motif : Anticiper la forte demande des grossistes de Sotuba et ACI 2000.',
        'demande_achat',
        'ACH-2026-001',
        '2026-10-26T09:30:00'
      );

      insertNotif.run(
        'notif-pr-adm-2',
        'Administrateur',
        'usr-adm',
        'Nouvelle demande d\'achat (Comptable) : ACH-2026-002',
        'Fatoumata Coulibaly (Comptable) a soumis une demande d\'achat de 217 500 FCFA : "Achat de rouleaux papier thermique 80mm & classeurs comptables".',
        'demande_achat',
        'ACH-2026-002',
        '2026-10-26T11:15:00'
      );

      insertNotif.run(
        'notif-pr-mag-val',
        'Magasinier',
        'usr-mag',
        'Demande d\'achat ACH-2026-003 VALIDÉE par l\'Administrateur',
        'Votre demande d\'achat "Achat palettes de manutention et film étirable entrepôt Sotuba" (247 500 FCFA) a été ACCEPTÉE par l\'Administrateur. Motif de l\'Admin : "Demande validée. Vous pouvez procéder à la réception avec le fournisseur dès demain matin."',
        'demande_achat',
        'ACH-2026-003',
        '2026-10-25T16:40:00'
      );

      insertNotif.run(
        'notif-pr-cpt-rej',
        'Comptable',
        'usr-cpt',
        'Demande d\'achat ACH-2026-004 REJETÉE par l\'Administrateur',
        'Votre demande d\'achat "Acquisition coffre-fort secondaire de caisse" (385 000 FCFA) a été REJETÉE par l\'Administrateur. Motif de l\'Admin : "Reporté au budget du prochain trimestre."',
        'demande_achat',
        'ACH-2026-004',
        '2026-10-24T17:10:00'
      );

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded_purchase_requests_v1', ?)").run(new Date().toISOString());
    }
  } catch (e) {
    console.warn('ensureComptableInvoicesAndPurchaseRequests warning:', e);
  }
}

initDatabase();
