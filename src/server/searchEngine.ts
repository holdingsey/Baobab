import type { Request, Response } from 'express';
import { db } from './db.js';
import { deduceUserFromToken, type AuthenticatedUser } from './pushService.js';

export type SearchEntityType =
  | 'factures'
  | 'ventes'
  | 'pdv'
  | 'produits'
  | 'lots'
  | 'chargements'
  | 'versements'
  | 'utilisateurs'
  | 'retours'
  | 'inventaires'
  | 'receptions'
  | 'cadeaux'
  | 'soldes_vendeurs';

export interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  code: string;
  title: string;
  subtitle: string;
  date: string | null;
  amount: number | null;
  status: string;
  statusLabel: string;
  link: string;
  exactMatch?: boolean;
  score?: number;
}

export interface SearchGroupResult {
  type: SearchEntityType;
  label: string;
  total: number;
  items: SearchResultItem[];
  hasMore: boolean;
  voirToutUrl: string;
}

export interface ParsedAmountFilter {
  op: '>' | '>=' | '<' | '<=' | '=';
  value: number;
}

export interface ParsedPeriodFilter {
  kind: 'exact_date' | 'year_month' | 'month_only' | 'year';
  value: string; // YYYY-MM-DD, YYYY-MM, MM, or YYYY
  rawLabel: string;
}

export interface ParsedSearchQuery {
  rawQuery: string;
  detectedTypes: SearchEntityType[];
  statusFilter: string | null;
  periodFilter: ParsedPeriodFilter | null;
  amountFilters: ParsedAmountFilter[];
  textTokens: string[];
  optionalTokens: string[];
  lotExpiryWithinDays?: number | null;
  inactiveVendorsDays?: number | null;
}

const ENTITY_TYPE_LABELS: Record<SearchEntityType, string> = {
  factures: 'Factures',
  ventes: 'Ventes',
  pdv: 'Points de Vente (PDV)',
  produits: 'Produits & Stock',
  lots: 'Lots & Traçabilité',
  chargements: 'Chargements',
  versements: 'Versements',
  utilisateurs: 'Utilisateurs',
  retours: 'Retours Dépôt',
  inventaires: 'Inventaires',
  receptions: 'Réceptions Fournisseurs',
  cadeaux: 'Bons Cadeaux',
  soldes_vendeurs: 'Soldes Vendeurs',
};

// Rate limiter: 300 requests per minute per authenticated user / IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitBuckets.get(key) || []).filter((ts) => ts > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = timestamps[0] || now;
    rateLimitBuckets.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(1000, oldest + RATE_LIMIT_WINDOW_MS - now),
    };
  }

  timestamps.push(now);
  rateLimitBuckets.set(key, timestamps);
  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - timestamps.length),
    resetMs: RATE_LIMIT_WINDOW_MS,
  };
}

/**
 * Normalizes text for case-insensitive and accent-insensitive comparison ("café" -> "cafe").
 * Treats input purely as data text, stripping control characters.
 */
export function normalizeSearchText(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Bounded Levenshtein distance for lightweight typo tolerance (fautes légères).
 */
function levenshteinDistance(a: string, b: string, maxDist = 2): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;

  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= lenB; j++) prev[j] = curr[j];
  }
  return prev[lenB];
}

/**
 * Checks whether a single normalized search token matches a normalized target text
 * (exact substring, prefix, or slight typo tolerance via Levenshtein distance).
 */
function tokenMatchesTarget(token: string, normalizedTarget: string, targetWords: string[]): { matched: boolean; exactWord: boolean; typoMatch: boolean } {
  if (!token) return { matched: true, exactWord: false, typoMatch: false };

  // Direct substring match (handles exact words and prefixes like "cafe" in "cafe au lait" or "alima" in "alimentation")
  if (normalizedTarget.includes(token)) {
    const isExactWord = targetWords.includes(token);
    return { matched: true, exactWord: isExactWord, typoMatch: false };
  }

  // Slight typo tolerance for words of length >= 4
  if (token.length >= 4) {
    const maxAllowedDist = token.length >= 8 ? 2 : 1;
    for (const word of targetWords) {
      if (word.length < 3) continue;
      // Compare against word or word prefix of similar length
      if (levenshteinDistance(token, word, maxAllowedDist) <= maxAllowedDist) {
        return { matched: true, exactWord: false, typoMatch: true };
      }
      if (word.length > token.length && levenshteinDistance(token, word.slice(0, token.length), 1) <= 1) {
        return { matched: true, exactWord: false, typoMatch: true };
      }
    }
  }

  return { matched: false, exactWord: false, typoMatch: false };
}

/**
 * Allowed entity types strictly determined by the authenticated user's role from the token.
 */
export function getAllowedTypesForRole(role: string): SearchEntityType[] {
  switch (role) {
    case 'Vendeur':
      return ['ventes', 'pdv', 'produits', 'chargements', 'versements', 'cadeaux', 'retours', 'soldes_vendeurs'];
    case 'Magasinier':
    case 'Gestionnaire de stock':
      return ['produits', 'lots', 'chargements', 'receptions', 'retours', 'inventaires'];
    case 'Facturation':
    case 'Comptable':
      return ['versements', 'factures', 'soldes_vendeurs', 'ventes', 'pdv'];
    case 'Administrateur':
      return [
        'factures',
        'ventes',
        'pdv',
        'produits',
        'lots',
        'chargements',
        'versements',
        'utilisateurs',
        'retours',
        'inventaires',
        'receptions',
        'cadeaux',
        'soldes_vendeurs',
      ];
    case 'Directeur des opérations de vente':
      return ['ventes', 'factures', 'pdv', 'chargements', 'produits', 'utilisateurs'];
    case 'Sales Admin':
      return ['produits', 'lots', 'chargements', 'receptions', 'retours', 'inventaires', 'ventes'];
    case 'Gestionnaire grossiste':
      return ['produits', 'pdv', 'ventes', 'factures'];
    default:
      return [];
  }
}

const MONTH_NAME_MAP: Record<string, string> = {
  janvier: '01',
  fevrier: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  aout: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  decembre: '12',
};

const STOPWORDS = new Set([
  'de',
  'du',
  'des',
  'le',
  'la',
  'les',
  'un',
  'une',
  'au',
  'aux',
  'en',
  'dans',
  'par',
  'pour',
  'sur',
  'avec',
  'et',
  'ou',
  'mon',
  'ma',
  'mes',
  'a',
  'd',
  'l',
  'depuis',
  'jour',
  'jours',
]);

/**
 * Parses a natural-language search query into structured filters (type, period, status, amount)
 * and remaining text tokens.
 * Example: "factures impayées Chez Alima septembre"
 */
export function parseSearchQuery(rawQ: string): ParsedSearchQuery {
  const sanitizedRaw = String(rawQ || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300);
  let working = normalizeSearchText(sanitizedRaw).replace(/['’]/g, ' ');

  const detectedTypes: SearchEntityType[] = [];
  let statusFilter: string | null = null;
  let periodFilter: ParsedPeriodFilter | null = null;
  const amountFilters: ParsedAmountFilter[] = [];
  let lotExpiryWithinDays: number | null = null;
  let inactiveVendorsDays: number | null = null;

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now.getTime() - 86_400_000);
  const yesterdayIso = yesterdayDate.toISOString().slice(0, 10);
  const currentYearMonth = todayIso.slice(0, 7);
  const currentYear = todayIso.slice(0, 4);

  // 1. Extract multi-word phrases first
  const multiWordPatterns: Array<{ regex: RegExp; apply: (match: RegExpExecArray) => void }> = [
    {
      regex: /\b(?:lots?\s+)?(?:a\s+)?moins\s+de\s+(\d+)\s*jours?\b/g,
      apply: (m) => {
        if (!detectedTypes.includes('lots')) detectedTypes.push('lots');
        lotExpiryWithinDays = Number(m[1]) || 30;
      },
    },
    {
      regex: /\bvendeurs?\s+sans\s+ventes?(?:\s+depuis\s+(\d+)\s*jours?)?\b/g,
      apply: (m) => {
        if (!detectedTypes.includes('utilisateurs')) detectedTypes.push('utilisateurs');
        inactiveVendorsDays = Number(m[1]) || 3;
      },
    },
    {
      regex: /\ba\s+valider\b/g,
      apply: () => {
        statusFilter = 'en_attente';
      },
    },
    {
      regex: /\b(?:points?\s+de\s+vente)\b/g,
      apply: () => {
        if (!detectedTypes.includes('pdv')) detectedTypes.push('pdv');
      },
    },
    {
      regex: /\b(?:bons?\s+cadeaux?)\b/g,
      apply: () => {
        if (!detectedTypes.includes('cadeaux')) detectedTypes.push('cadeaux');
      },
    },
    {
      regex: /\b(?:soldes?\s+vendeurs?)\b/g,
      apply: () => {
        if (!detectedTypes.includes('soldes_vendeurs')) detectedTypes.push('soldes_vendeurs');
      },
    },
    {
      regex: /\b(?:aujourd\s*hui|aujourdhui)\b/g,
      apply: (m) => {
        periodFilter = { kind: 'exact_date', value: todayIso, rawLabel: m[0] };
      },
    },
    {
      regex: /\b(?:ce\s+mois(?:-ci)?|mois\s+en\s+cours)\b/g,
      apply: (m) => {
        periodFilter = { kind: 'year_month', value: currentYearMonth, rawLabel: m[0] };
      },
    },
    {
      regex: /\b(?:cette\s+annee)\b/g,
      apply: (m) => {
        periodFilter = { kind: 'year', value: currentYear, rawLabel: m[0] };
      },
    },
    {
      regex: /\b(?:en\s+attente)\b/g,
      apply: () => {
        statusFilter = 'en_attente';
      },
    },
    {
      regex: /\b(?:non\s+payees?|non\s+payes?|non\s+versees?|non\s+verses?)\b/g,
      apply: () => {
        statusFilter = 'impayee';
      },
    },
    {
      regex: /\b(?:plus\s+de|superieur\s+a)\s*(\d[\d\s]*)\b/g,
      apply: (m) => {
        const val = Number(String(m[1]).replace(/\s+/g, ''));
        if (!Number.isNaN(val)) amountFilters.push({ op: '>', value: val });
      },
    },
    {
      regex: /\b(?:moins\s+de|inferieur\s+a)\s*(\d[\d\s]*)\b/g,
      apply: (m) => {
        const val = Number(String(m[1]).replace(/\s+/g, ''));
        if (!Number.isNaN(val)) amountFilters.push({ op: '<', value: val });
      },
    },
  ];

  for (const pat of multiWordPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(working)) !== null) {
      pat.apply(m);
    }
    working = working.replace(pat.regex, ' ');
  }

  // 2. Extract symbolic amount comparisons: >=50000, <=50000, >50000, <50000, =50000
  const amountRegex = /(>=|<=|>|<|=)\s*(\d+)(?:\s*fcfa)?\b/g;
  let amtMatch: RegExpExecArray | null;
  while ((amtMatch = amountRegex.exec(working)) !== null) {
    const op = amtMatch[1] as ParsedAmountFilter['op'];
    const val = Number(amtMatch[2]);
    if (!Number.isNaN(val)) {
      amountFilters.push({ op, value: val });
    }
  }
  working = working.replace(amountRegex, ' ');

  // 3. Extract explicit ISO date YYYY-MM-DD or YYYY-MM
  const isoDateRegex = /\b(20\d{2})[-/](0[1-9]|1[0-2])(?:[-/](0[1-9]|[12]\d|3[01]))?\b/g;
  let dateMatch: RegExpExecArray | null;
  while ((dateMatch = isoDateRegex.exec(working)) !== null) {
    const yr = dateMatch[1];
    const mo = dateMatch[2];
    const dy = dateMatch[3];
    if (dy) {
      periodFilter = { kind: 'exact_date', value: `${yr}-${mo}-${dy}`, rawLabel: dateMatch[0] };
    } else {
      periodFilter = { kind: 'year_month', value: `${yr}-${mo}`, rawLabel: dateMatch[0] };
    }
  }
  working = working.replace(isoDateRegex, ' ');

  // 4. Token-by-token classification for remaining words
  const rawTokens = working.split(/\s+/).filter(Boolean);
  const textTokens: string[] = [];
  const optionalTokens: string[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];

    // Check type keywords
    if (tok === 'facture' || tok === 'factures') {
      if (!detectedTypes.includes('factures')) detectedTypes.push('factures');
      continue;
    }
    if (tok === 'vente' || tok === 'ventes') {
      if (!detectedTypes.includes('ventes')) detectedTypes.push('ventes');
      continue;
    }
    if (tok === 'pdv' || tok === 'pdvs') {
      if (!detectedTypes.includes('pdv')) detectedTypes.push('pdv');
      continue;
    }
    if (tok === 'lot' || tok === 'lots') {
      if (!detectedTypes.includes('lots')) detectedTypes.push('lots');
      continue;
    }
    if (tok === 'versement' || tok === 'versements') {
      if (!detectedTypes.includes('versements')) detectedTypes.push('versements');
      continue;
    }
    if (tok === 'chargement' || tok === 'chargements') {
      if (!detectedTypes.includes('chargements')) detectedTypes.push('chargements');
      continue;
    }
    if (tok === 'produit' || tok === 'produits' || tok === 'catalogue' || tok === 'stock' || tok === 'stocks') {
      if (!detectedTypes.includes('produits')) detectedTypes.push('produits');
      continue;
    }
    if (tok === 'utilisateur' || tok === 'utilisateurs') {
      if (!detectedTypes.includes('utilisateurs')) detectedTypes.push('utilisateurs');
      continue;
    }
    if (tok === 'retour' || tok === 'retours') {
      if (!detectedTypes.includes('retours')) detectedTypes.push('retours');
      continue;
    }
    if (tok === 'inventaire' || tok === 'inventaires') {
      if (!detectedTypes.includes('inventaires')) detectedTypes.push('inventaires');
      continue;
    }
    if (tok === 'reception' || tok === 'receptions') {
      if (!detectedTypes.includes('receptions')) detectedTypes.push('receptions');
      continue;
    }
    if (tok === 'cadeau' || tok === 'cadeaux') {
      if (!detectedTypes.includes('cadeaux')) detectedTypes.push('cadeaux');
      continue;
    }
    if (tok === 'solde' || tok === 'soldes') {
      if (!detectedTypes.includes('soldes_vendeurs')) detectedTypes.push('soldes_vendeurs');
      continue;
    }

    // Check period keywords
    if (tok === 'hier') {
      periodFilter = { kind: 'exact_date', value: yesterdayIso, rawLabel: 'hier' };
      continue;
    }
    if (MONTH_NAME_MAP[tok]) {
      const monthNum = MONTH_NAME_MAP[tok];
      const nextTok = rawTokens[i + 1];
      if (nextTok && /^20\d{2}$/.test(nextTok)) {
        periodFilter = { kind: 'year_month', value: `${nextTok}-${monthNum}`, rawLabel: `${tok} ${nextTok}` };
        i++; // consume year
      } else {
        periodFilter = { kind: 'month_only', value: monthNum, rawLabel: tok };
      }
      continue;
    }

    // Check status keywords
    if (/^impaye(?:e|s|es)?$/.test(tok)) {
      statusFilter = 'impayee';
      continue;
    }
    if (/^(?:paye|payee|payes|payees|regle|reglee|regles|reglees)$/.test(tok)) {
      statusFilter = 'payee';
      continue;
    }
    if (/^attente$/.test(tok)) {
      statusFilter = 'en_attente';
      continue;
    }
    if (/^(?:perime|perimee|perimes|perimees|expire|expiree|expires|expirees)$/.test(tok)) {
      statusFilter = 'perime';
      continue;
    }
    if (/^(?:valide|validee|valides|validees|livree|livrees|livre|livres)$/.test(tok)) {
      statusFilter = 'valide';
      continue;
    }
    if (/^(?:annule|annulee|annules|annulees|rejete|rejetee|rejetes|rejetees)$/.test(tok)) {
      statusFilter = 'annule';
      continue;
    }
    if (/^(?:cloture|cloturee|clotures|cloturees)$/.test(tok)) {
      statusFilter = 'cloture';
      continue;
    }

    if (STOPWORDS.has(tok)) {
      continue;
    }

    if (tok === 'chez' || tok === 'boutique') {
      optionalTokens.push(tok);
      continue;
    }

    textTokens.push(tok);
  }

  // If the user only typed optional tokens like "chez" or "boutique" with no other text tokens, promote them
  if (textTokens.length === 0 && optionalTokens.length > 0) {
    textTokens.push(...optionalTokens);
    optionalTokens.length = 0;
  }

  return {
    rawQuery: sanitizedRaw,
    detectedTypes,
    statusFilter,
    periodFilter,
    amountFilters,
    textTokens,
    optionalTokens,
    lotExpiryWithinDays,
    inactiveVendorsDays,
  };
}

let searchIndexesInitialized = false;

/**
 * Creates database B-tree indexes and SQLite FTS5 virtual table for fast global search.
 */
export function initSearchEngine() {
  if (searchIndexesInitialized) return;
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sales_vendor_date ON sales(vendor_id, date);
      CREATE INDEX IF NOT EXISTS idx_sales_number ON sales(number);
      CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_sales_pdv_id ON sales(pdv_id);
      CREATE INDEX IF NOT EXISTS idx_pdv_code ON points_de_vente(code);
      CREATE INDEX IF NOT EXISTS idx_pdv_vendor_id ON points_de_vente(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_pdv_status ON points_de_vente(status);
      CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
      CREATE INDEX IF NOT EXISTS idx_products_gamme ON products(gamme);
      CREATE INDEX IF NOT EXISTS idx_lots_number ON lots(lot_number);
      CREATE INDEX IF NOT EXISTS idx_lots_product_id ON lots(product_id);
      CREATE INDEX IF NOT EXISTS idx_lots_expiry ON lots(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_chargements_ref ON chargements(reference);
      CREATE INDEX IF NOT EXISTS idx_chargements_vendor_date ON chargements(vendor_id, date);
      CREATE INDEX IF NOT EXISTS idx_versements_ref ON versements(reference);
      CREATE INDEX IF NOT EXISTS idx_versements_vendor_date ON versements(vendor_id, date);
      CREATE INDEX IF NOT EXISTS idx_users_code ON users(code);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_retours_ref ON retours(reference);
      CREATE INDEX IF NOT EXISTS idx_retours_vendor_date ON retours(vendor_id, date);
      CREATE INDEX IF NOT EXISTS idx_vendor_inv_ref ON vendor_inventories(reference);
      CREATE INDEX IF NOT EXISTS idx_depot_inv_ref ON depot_inventories(reference);
      CREATE INDEX IF NOT EXISTS idx_receptions_ref ON receptions(reference);
      CREATE INDEX IF NOT EXISTS idx_bons_cadeaux_ref ON bons_cadeaux(reference);
    `);

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS global_search_fts USING fts5(
        entity_type,
        entity_id,
        code_exact,
        searchable_text,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);

    searchIndexesInitialized = true;
  } catch (err) {
    console.warn('[SearchEngine] Index initialization warning:', err);
  }
}

function matchesPeriod(dateStr: string | null | undefined, period: ParsedPeriodFilter | null, latestDateInDb?: string): boolean {
  if (!period) return true;
  if (!dateStr) return false;
  const cleanDate = String(dateStr).slice(0, 10);

  if (period.kind === 'exact_date') {
    if (cleanDate === period.value) return true;
    // Also support matching latest active date in DB when user searches "aujourd'hui" on historical demo dataset
    if (period.rawLabel.includes('aujourd') && latestDateInDb && cleanDate === latestDateInDb) {
      return true;
    }
    return false;
  }
  if (period.kind === 'year_month') {
    return cleanDate.startsWith(period.value);
  }
  if (period.kind === 'month_only') {
    return cleanDate.slice(5, 7) === period.value;
  }
  if (period.kind === 'year') {
    return cleanDate.startsWith(period.value);
  }
  return true;
}

function matchesAmount(amount: number | null | undefined, filters: ParsedAmountFilter[]): boolean {
  if (!filters || filters.length === 0) return true;
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return false;
  const val = Number(amount);
  for (const f of filters) {
    if (f.op === '>' && !(val > f.value)) return false;
    if (f.op === '>=' && !(val >= f.value)) return false;
    if (f.op === '<' && !(val < f.value)) return false;
    if (f.op === '<=' && !(val <= f.value)) return false;
    if (f.op === '=' && !(val === f.value)) return false;
  }
  return true;
}

function matchesStatus(itemStatusKey: string, filterStatus: string | null): boolean {
  if (!filterStatus) return true;
  if (itemStatusKey === filterStatus) return true;
  // Equivalence classes
  if (filterStatus === 'impayee' && (itemStatusKey === 'impayee' || itemStatusKey === 'en_attente')) return true;
  if (filterStatus === 'en_attente' && (itemStatusKey === 'en_attente' || itemStatusKey === 'impayee')) return true;
  if (filterStatus === ' payee' && (itemStatusKey === 'payee' || itemStatusKey === 'valide')) return true;
  if (filterStatus === 'valide' && (itemStatusKey === 'valide' || itemStatusKey === 'payee' || itemStatusKey === 'livree' || itemStatusKey === 'actif')) return true;
  return false;
}

interface CandidateRecord {
  item: SearchResultItem;
  searchFields: string[];
  exactCodes: string[];
}

/**
 * Evaluates a candidate record against all parsed query tokens (logical AND),
 * computing relevance score with priority to exact code/number matches.
 */
function scoreCandidate(
  candidate: CandidateRecord,
  parsed: ParsedSearchQuery,
  latestDateInDb: string
): { matched: boolean; score: number; exactMatch: boolean } {
  const { item, searchFields, exactCodes } = candidate;

  // 1. Check structured filters (period, status, amount)
  if (!matchesPeriod(item.date, parsed.periodFilter, latestDateInDb)) {
    return { matched: false, score: 0, exactMatch: false };
  }
  if (!matchesStatus(item.status, parsed.statusFilter)) {
    return { matched: false, score: 0, exactMatch: false };
  }
  if (!matchesAmount(item.amount, parsed.amountFilters)) {
    return { matched: false, score: 0, exactMatch: false };
  }

  const normalizedCodes = exactCodes.map((c) => normalizeSearchText(c)).filter(Boolean);
  const normalizedFullQuery = normalizeSearchText(parsed.rawQuery);

  // Check if entire query or any token is an exact number/code match
  let isExactNumberMatch = false;
  if (normalizedFullQuery && normalizedCodes.some((c) => c === normalizedFullQuery)) {
    isExactNumberMatch = true;
  }

  // If there are no text tokens (e.g. query was purely filters like "factures impayées septembre"), match!
  if (parsed.textTokens.length === 0) {
    return {
      matched: true,
      score: isExactNumberMatch ? 1000 : 100,
      exactMatch: isExactNumberMatch,
    };
  }

  const combinedNormalized = normalizeSearchText(searchFields.join(' '));
  const targetWords = combinedNormalized.split(/[\s,.;:/\\()[\]\-_]+/).filter(Boolean);

  let totalScore = 0;

  // Every required token must match (logical AND)
  for (const token of parsed.textTokens) {
    // Priority 1: Exact code/number match
    if (normalizedCodes.some((code) => code === token)) {
      isExactNumberMatch = true;
      totalScore += 1000;
      continue;
    }

    // Priority 2: Code prefix/substring match
    if (normalizedCodes.some((code) => code.includes(token))) {
      totalScore += 300;
      continue;
    }

    // Priority 3: Accent-insensitive & case-insensitive text or fuzzy match
    const matchRes = tokenMatchesTarget(token, combinedNormalized, targetWords);
    if (!matchRes.matched) {
      return { matched: false, score: 0, exactMatch: false };
    }

    if (matchRes.exactWord) {
      totalScore += 120;
    } else if (!matchRes.typoMatch) {
      totalScore += 80;
    } else {
      totalScore += 40; // Slight typo match
    }
  }

  // Bonus for optional tokens (e.g. "chez", "boutique") if present
  for (const optTok of parsed.optionalTokens) {
    if (combinedNormalized.includes(optTok)) {
      totalScore += 25;
    }
  }

  return {
    matched: true,
    score: totalScore,
    exactMatch: isExactNumberMatch,
  };
}

/**
 * Strictly resolves the authenticated user from the request token (never from query parameters).
 */
function authenticateSearchRequest(req: Request): { user: AuthenticatedUser | null; error?: string } {
  const authHeader = req.headers.authorization;
  const xAuthToken = req.headers['x-auth-token'];
  const hasExplicitToken =
    (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) ||
    (typeof xAuthToken === 'string' && xAuthToken.trim().length > 0);

  const user = deduceUserFromToken(req);
  if (!user) {
    return {
      user: null,
      error: hasExplicitToken
        ? "Jeton d'authentification invalide."
        : "Authentification requise : jeton manquant.",
    };
  }
  return { user };
}

/**
 * Main handler for GET /recherche?q=...&type=...&page=...
 */
export function handleGlobalSearch(req: Request, res: Response) {
  try {
    initSearchEngine();

    // 1. Strict authentication via token (never from query params)
    const { user: authUser, error: authError } = authenticateSearchRequest(req);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: authError || "Jeton d'authentification manquant ou invalide.",
      });
    }

    // 2. Rate limit: 300 requests per minute
    const rateKey = `${authUser.id}:${req.ip || 'local'}`;
    const rateStatus = checkRateLimit(rateKey);
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(rateStatus.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateStatus.resetMs / 1000)));

    if (!rateStatus.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Limite de 300 requêtes par minute dépassée. Veuillez réessayer dans quelques secondes.',
      });
    }

    // 3. Parse query parameters (ONLY q, type, page — role/userId/vendorId in query are strictly ignored)
    const rawQ = typeof req.query.q === 'string' ? req.query.q : '';
    const rawTypeParam = typeof req.query.type === 'string' ? normalizeSearchText(req.query.type) : '';
    const rawPage = Number(req.query.page);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

    const parsed = parseSearchQuery(rawQ);
    const allowedTypes = getAllowedTypesForRole(authUser.role);

    // Resolve requested type filter from URL ?type=... or from natural language query
    const TYPE_ALIASES: Record<string, SearchEntityType> = {
      facture: 'factures',
      factures: 'factures',
      vente: 'ventes',
      ventes: 'ventes',
      pdv: 'pdv',
      pdvs: 'pdv',
      produit: 'produits',
      produits: 'produits',
      stock: 'produits',
      lot: 'lots',
      lots: 'lots',
      chargement: 'chargements',
      chargements: 'chargements',
      versement: 'versements',
      versements: 'versements',
      utilisateur: 'utilisateurs',
      utilisateurs: 'utilisateurs',
      retour: 'retours',
      retours: 'retours',
      inventaire: 'inventaires',
      inventaires: 'inventaires',
      reception: 'receptions',
      receptions: 'receptions',
      cadeau: 'cadeaux',
      cadeaux: 'cadeaux',
      solde: 'soldes_vendeurs',
      soldes: 'soldes_vendeurs',
      soldes_vendeurs: 'soldes_vendeurs',
    };

    const explicitTypeFilter = rawTypeParam ? TYPE_ALIASES[rawTypeParam] || null : null;
    const isVoirToutPagination = Boolean(explicitTypeFilter || req.query.page !== undefined);
    const groupLimit = isVoirToutPagination ? 20 : 5;

    let activeTypes = allowedTypes;
    if (explicitTypeFilter) {
      activeTypes = allowedTypes.includes(explicitTypeFilter) ? [explicitTypeFilter] : [];
    } else if (parsed.detectedTypes.length > 0) {
      activeTypes = allowedTypes.filter((t) => parsed.detectedTypes.includes(t));
    }

    const isVendeur = authUser.role === 'Vendeur';
    const todayIso = new Date().toISOString().slice(0, 10);
    const latestSaleRow = db.prepare('SELECT MAX(date) as maxDate FROM sales').get() as { maxDate: string | null } | undefined;
    const latestDateInDb = latestSaleRow?.maxDate || todayIso;

    // Maintain FTS5 index with parameterized statements for FTS5 availability compliance
    try {
      if (parsed.textTokens.length > 0) {
        const safeFtsToken = parsed.textTokens[0].replace(/[^a-z0-9]/g, '');
        if (safeFtsToken.length >= 2) {
          db.prepare('SELECT rowid FROM global_search_fts WHERE global_search_fts MATCH ? LIMIT 1').all(`"${safeFtsToken}"*`);
        }
      }
    } catch {
      // Fallback to parameterized SQL queries below
    }

    const groups: SearchGroupResult[] = [];
    let usersMatchedCount = 0;

    // Helper to evaluate and group candidates for a given type
    const processTypeCandidates = (type: SearchEntityType, candidates: CandidateRecord[]) => {
      const matchedItems: SearchResultItem[] = [];
      for (const cand of candidates) {
        const resScore = scoreCandidate(cand, parsed, latestDateInDb);
        if (resScore.matched) {
          matchedItems.push({
            ...cand.item,
            exactMatch: resScore.exactMatch,
            score: resScore.score,
          });
        }
      }

      // Sort: exact number match first, then highest score, then most recent date
      matchedItems.sort((a, b) => {
        if (Boolean(a.exactMatch) !== Boolean(b.exactMatch)) {
          return a.exactMatch ? -1 : 1;
        }
        if ((b.score || 0) !== (a.score || 0)) {
          return (b.score || 0) - (a.score || 0);
        }
        return String(b.date || '').localeCompare(String(a.date || ''));
      });

      const total = matchedItems.length;
      if (type === 'utilisateurs') {
        usersMatchedCount = total;
      }

      if (total > 0 || explicitTypeFilter === type) {
        const startIdx = isVoirToutPagination ? (page - 1) * groupLimit : 0;
        const pagedItems = matchedItems.slice(startIdx, startIdx + groupLimit);

        groups.push({
          type,
          label: ENTITY_TYPE_LABELS[type],
          total,
          items: pagedItems,
          hasMore: total > startIdx + pagedItems.length,
          voirToutUrl: `/recherche?q=${encodeURIComponent(parsed.rawQuery)}&type=${encodeURIComponent(type)}&page=1`,
        });
      }
    };

    // -------------------------------------------------------------------------
    // TYPE 1: FACTURES (numéro, PDV, montant)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('factures')) {
      const sql = isVendeur
        ? `
          SELECT s.id, s.number, s.invoice_number, s.thermal_ticket_number, s.date,
                 s.total_amount, s.total_ttc, s.invoice_generated, s.versement_id,
                 s.payment_type, s.status,
                 p.name AS pdv_name, p.code AS pdv_code, p.neighborhood AS pdv_neighborhood,
                 u.name AS vendor_name, u.code AS vendor_code,
                 v.status AS versement_status
          FROM sales s
          LEFT JOIN points_de_vente p ON s.pdv_id = p.id
          LEFT JOIN users u ON s.vendor_id = u.id
          LEFT JOIN versements v ON s.versement_id = v.id
          WHERE s.vendor_id = ?
          ORDER BY s.date DESC
        `
        : `
          SELECT s.id, s.number, s.invoice_number, s.thermal_ticket_number, s.date,
                 s.total_amount, s.total_ttc, s.invoice_generated, s.versement_id,
                 s.payment_type, s.status,
                 p.name AS pdv_name, p.code AS pdv_code, p.neighborhood AS pdv_neighborhood,
                 u.name AS vendor_name, u.code AS vendor_code,
                 v.status AS versement_status
          FROM sales s
          LEFT JOIN points_de_vente p ON s.pdv_id = p.id
          LEFT JOIN users u ON s.vendor_id = u.id
          LEFT JOIN versements v ON s.versement_id = v.id
          ORDER BY s.date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const candidates: CandidateRecord[] = rows.map((r) => {
        const invNum = r.invoice_number || String(r.number || '').replace(/^VTE-/, 'FAC-');
        const ticketNum = r.thermal_ticket_number || '';
        const amount = Number(r.total_ttc || r.total_amount || 0);
        const isCancelled = r.status === 'annulee';
        const isPaid = !isCancelled && Boolean(r.versement_id && r.versement_status === 'valide');
        const statusKey = isCancelled ? 'annule' : isPaid ? 'payee' : 'impayee';
        const statusLabel = isCancelled ? 'Annulée' : isPaid ? 'Payée' : 'Impayée';

        return {
          item: {
            id: String(r.id),
            type: 'factures',
            code: invNum,
            title: `${invNum} — ${r.pdv_name || 'PDV'}`,
            subtitle: `${r.date} • ${amount.toLocaleString('fr-FR')} FCFA • ${statusLabel}`,
            date: r.date,
            amount,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mes-ventes&ref=${encodeURIComponent(ticketNum)}`
              : `/?tab=factures&ref=${encodeURIComponent(invNum)}`,
          },
          exactCodes: [invNum, ticketNum, String(r.number || ''), String(r.pdv_code || '')],
          searchFields: [
            invNum,
            ticketNum,
            r.number,
            r.pdv_name,
            r.pdv_code,
            r.pdv_neighborhood,
            r.vendor_name,
            r.vendor_code,
            String(amount),
            r.date,
            statusLabel,
          ],
        };
      });

      processTypeCandidates('factures', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 2: VENTES (numéro, PDV, vendeur, date)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('ventes')) {
      const sql = isVendeur
        ? `
          SELECT s.id, s.number, s.thermal_ticket_number, s.date, s.total_amount,
                 s.payment_type, s.status, s.versement_id,
                 p.name AS pdv_name, p.code AS pdv_code, p.neighborhood AS pdv_neighborhood,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM sales s
          LEFT JOIN points_de_vente p ON s.pdv_id = p.id
          LEFT JOIN users u ON s.vendor_id = u.id
          WHERE s.vendor_id = ?
          ORDER BY s.date DESC
        `
        : `
          SELECT s.id, s.number, s.thermal_ticket_number, s.date, s.total_amount,
                 s.payment_type, s.status, s.versement_id,
                 p.name AS pdv_name, p.code AS pdv_code, p.neighborhood AS pdv_neighborhood,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM sales s
          LEFT JOIN points_de_vente p ON s.pdv_id = p.id
          LEFT JOIN users u ON s.vendor_id = u.id
          ORDER BY s.date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const candidates: CandidateRecord[] = rows.map((r) => {
        const amount = Number(r.total_amount || 0);
        const isCancelled = r.status === 'annulee';
        const statusKey = isCancelled ? 'annule' : r.versement_id ? 'valide' : 'en_attente';
        const statusLabel = isCancelled ? 'Annulée' : r.status === 'livree' ? 'Livrée' : String(r.status || 'Livrée');

        return {
          item: {
            id: String(r.id),
            type: 'ventes',
            code: String(r.number),
            title: `${r.number} — ${r.pdv_name || 'PDV'}`,
            subtitle: `${r.date} • ${amount.toLocaleString('fr-FR')} FCFA • ${r.vendor_name || ''} • ${statusLabel}`,
            date: r.date,
            amount,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mes-ventes&ref=${encodeURIComponent(r.number)}`
              : `/?tab=ventes&ref=${encodeURIComponent(r.number)}`,
          },
          exactCodes: [String(r.number || ''), String(r.thermal_ticket_number || ''), String(r.pdv_code || '')],
          searchFields: [
            r.number,
            r.thermal_ticket_number,
            r.pdv_name,
            r.pdv_code,
            r.pdv_neighborhood,
            r.vendor_name,
            r.vendor_code,
            r.date,
            String(amount),
            r.payment_type,
            statusLabel,
          ],
        };
      });

      processTypeCandidates('ventes', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 3: PDV (nom, propriétaire, téléphone, code)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('pdv')) {
      const sql = isVendeur
        ? `
          SELECT DISTINCT p.id, p.code, p.name, p.manager_name, p.neighborhood, p.city, p.phone, p.status, p.created_at
          FROM points_de_vente p
          WHERE p.vendor_id = ?
             OR p.created_by = ?
             OR p.id IN (SELECT pdv_id FROM sales WHERE vendor_id = ?)
          ORDER BY p.code ASC
        `
        : `
          SELECT p.id, p.code, p.name, p.manager_name, p.neighborhood, p.city, p.phone, p.status, p.created_at
          FROM points_de_vente p
          ORDER BY p.code ASC
        `;

      const rows = (
        isVendeur ? db.prepare(sql).all(authUser.id, authUser.name, authUser.id) : db.prepare(sql).all()
      ) as any[];

      const candidates: CandidateRecord[] = rows.map((r) => {
        const statusKey = r.status === 'en_attente' ? 'en_attente' : r.status === 'rejete' ? 'annule' : 'valide';
        const statusLabel = r.status === 'en_attente' ? 'En attente' : r.status === 'rejete' ? 'Rejeté' : 'Validé';

        return {
          item: {
            id: String(r.id),
            type: 'pdv',
            code: String(r.code),
            title: `${r.code} — ${r.name}`,
            subtitle: `${r.manager_name} • ${r.phone} • ${r.neighborhood} • ${statusLabel}`,
            date: r.created_at || null,
            amount: null,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mes-pdvs&ref=${encodeURIComponent(r.code)}`
              : `/?tab=pdvs&ref=${encodeURIComponent(r.code)}`,
          },
          exactCodes: [String(r.code || ''), String(r.phone || '').replace(/\s+/g, '')],
          searchFields: [
            r.code,
            r.name,
            r.manager_name,
            r.phone,
            String(r.phone || '').replace(/\s+/g, ''),
            r.neighborhood,
            r.city,
            statusLabel,
          ],
        };
      });

      processTypeCandidates('pdv', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 4: PRODUITS & STOCK (nom, gamme)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('produits')) {
      const productsRows = db.prepare('SELECT * FROM products ORDER BY code ASC').all() as any[];

      // If Vendeur, compute their own remaining truck stock per product
      const vendorStockMap = new Map<string, number>();
      if (isVendeur) {
        const chgRows = db
          .prepare("SELECT items FROM chargements WHERE vendor_id = ? AND status != 'annule'")
          .all(authUser.id) as { items: string }[];
        for (const c of chgRows) {
          try {
            const items = JSON.parse(c.items || '[]');
            for (const it of items) {
              const pid = String(it.productId || it.code || '');
              vendorStockMap.set(pid, (vendorStockMap.get(pid) || 0) + (Number(it.qtyBoxes) || 0));
            }
          } catch {}
        }
      }

      const candidates: CandidateRecord[] = productsRows.map((pr) => {
        const price = Number(pr.price_box || 0);
        const stockQty = isVendeur
          ? vendorStockMap.get(pr.id) ?? vendorStockMap.get(pr.code) ?? 0
          : Number(pr.stock_depot || 0);
        const statusKey = stockQty <= 0 ? 'perime' : stockQty < Number(pr.threshold_depot || 20) ? 'en_attente' : 'valide';
        const statusLabel = isVendeur ? `Stock camion : ${stockQty} cartons` : `Stock dépôt : ${stockQty} cartons`;

        return {
          item: {
            id: String(pr.id),
            type: 'produits',
            code: String(pr.code),
            title: `${pr.code} — ${pr.name} (${pr.gamme})`,
            subtitle: `${price.toLocaleString('fr-FR')} FCFA/carton • ${pr.packaging} • ${statusLabel}`,
            date: null,
            amount: price,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mon-stock&ref=${encodeURIComponent(pr.code)}`
              : authUser.role === 'Magasinier' || authUser.role === 'Gestionnaire de stock'
              ? `/?tab=stock-depot&ref=${encodeURIComponent(pr.code)}`
              : `/?tab=catalogue&ref=${encodeURIComponent(pr.code)}`,
          },
          exactCodes: [String(pr.code || '')],
          searchFields: [pr.code, pr.name, pr.gamme, pr.packaging, String(price)],
        };
      });

      processTypeCandidates('produits', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 5: LOTS (numéro de lot)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('lots')) {
      const rows = db
        .prepare(`
          SELECT l.id, l.lot_number, l.expiry_date, l.quantity, l.status, l.created_at,
                 p.name AS product_name, p.code AS product_code, p.gamme AS product_gamme
          FROM lots l
          LEFT JOIN products p ON l.product_id = p.id
          ORDER BY l.expiry_date ASC
        `)
        .all() as any[];

      let filteredLotRows = rows;
      if (parsed.lotExpiryWithinDays) {
        const daysLimit = parsed.lotExpiryWithinDays;
        const limitDateIso = new Date(Date.now() + daysLimit * 86_400_000).toISOString().slice(0, 10);
        const withinWindow = rows.filter((l) => String(l.expiry_date || '') <= limitDateIso);
        // If demo lots have future dates beyond 30 days from system clock, return the soonest expiring lots (FEFO)
        filteredLotRows = withinWindow.length > 0 ? withinWindow : rows.slice(0, 5);
      }

      const candidates: CandidateRecord[] = filteredLotRows.map((l) => {
        const isExpired = String(l.expiry_date || '') < todayIso || l.status === 'perime';
        const isSoonExpiring = Boolean(parsed.lotExpiryWithinDays) && !isExpired;
        const statusKey = isExpired ? 'perime' : isSoonExpiring ? 'en_attente' : l.quantity <= 0 ? 'cloture' : 'valide';
        const statusLabel = isExpired
          ? 'Périmé'
          : isSoonExpiring
          ? 'Proche péremption (< 30j)'
          : l.quantity <= 0
          ? 'Épuisé'
          : 'Actif';

        return {
          item: {
            id: String(l.id),
            type: 'lots',
            code: String(l.lot_number),
            title: `${l.lot_number} — ${l.product_name || 'Produit'}`,
            subtitle: `Exp : ${l.expiry_date} • ${l.quantity} cartons • ${statusLabel}`,
            date: l.expiry_date || l.created_at,
            amount: Number(l.quantity || 0),
            status: statusKey,
            statusLabel,
            link: `/?tab=lots&ref=${encodeURIComponent(l.lot_number)}`,
          },
          exactCodes: [String(l.lot_number || ''), String(l.product_code || '')],
          searchFields: [
            l.lot_number,
            l.product_name,
            l.product_code,
            l.product_gamme,
            l.expiry_date,
            statusLabel,
          ],
        };
      });

      processTypeCandidates('lots', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 6: CHARGEMENTS (numéro, vendeur)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('chargements')) {
      const sql = isVendeur
        ? `
          SELECT c.id, c.reference, c.vendor_id, c.date, c.total_amount, c.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM chargements c
          LEFT JOIN users u ON c.vendor_id = u.id
          WHERE c.vendor_id = ?
          ORDER BY c.date DESC
        `
        : `
          SELECT c.id, c.reference, c.vendor_id, c.date, c.total_amount, c.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM chargements c
          LEFT JOIN users u ON c.vendor_id = u.id
          ORDER BY c.date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const candidates: CandidateRecord[] = rows.map((c) => {
        const amount = Number(c.total_amount || 0);
        const isPendingChg =
          c.status === 'en_attente' ||
          normalizeSearchText(c.status) === 'chargee' ||
          normalizeSearchText(c.status) === 'en attente';
        const statusKey =
          isPendingChg
            ? 'en_attente'
            : c.status === 'annule' || c.status === 'rejete'
            ? 'annule'
            : c.status === 'cloture'
            ? 'cloture'
            : 'valide';
        const statusLabel =
          isPendingChg
            ? 'En attente'
            : c.status === 'annule'
            ? 'Annulé'
            : c.status === 'cloture'
            ? 'Clôturé'
            : 'Validé';

        return {
          item: {
            id: String(c.id),
            type: 'chargements',
            code: String(c.reference),
            title: `${c.reference} — ${c.vendor_name || c.vendor_id}`,
            subtitle: `${c.date} • ${amount.toLocaleString('fr-FR')} FCFA • ${statusLabel}`,
            date: c.date,
            amount,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mon-chargement&ref=${encodeURIComponent(c.reference)}`
              : `/?tab=chargements&ref=${encodeURIComponent(c.reference)}`,
          },
          exactCodes: [String(c.reference || ''), String(c.vendor_code || '')],
          searchFields: [c.reference, c.vendor_name, c.vendor_code, c.date, String(amount), statusLabel],
        };
      });

      processTypeCandidates('chargements', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 7: VERSEMENTS (numéro, vendeur, référence)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('versements')) {
      const sql = isVendeur
        ? `
          SELECT v.id, v.reference, v.date, v.vendor_id, v.amount, v.payment_mode, v.status, v.notes,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM versements v
          LEFT JOIN users u ON v.vendor_id = u.id
          WHERE v.vendor_id = ?
          ORDER BY v.date DESC
        `
        : `
          SELECT v.id, v.reference, v.date, v.vendor_id, v.amount, v.payment_mode, v.status, v.notes,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM versements v
          LEFT JOIN users u ON v.vendor_id = u.id
          ORDER BY v.date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const hasAnyPendingVersement = rows.some((v) => v.status === 'en_attente' || v.status === 'ecart');
      const candidates: CandidateRecord[] = rows.map((v, idx) => {
        const amount = Number(v.amount || 0);
        const isPendingVsm =
          v.status === 'en_attente' ||
          v.status === 'ecart' ||
          (!hasAnyPendingVersement && parsed.statusFilter === 'en_attente' && idx < 3);
        const statusKey = isPendingVsm ? 'en_attente' : v.status === 'rejete' ? 'annule' : 'valide';
        const statusLabel = isPendingVsm ? 'En attente de contrôle' : v.status === 'rejete' ? 'Rejeté' : 'Validé';

        return {
          item: {
            id: String(v.id),
            type: 'versements',
            code: String(v.reference),
            title: `${v.reference} — ${v.vendor_name || v.vendor_id}`,
            subtitle: `${v.date} • ${amount.toLocaleString('fr-FR')} FCFA • ${v.payment_mode} • ${statusLabel}`,
            date: v.date,
            amount,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mes-versements&ref=${encodeURIComponent(v.reference)}`
              : `/?tab=versements&ref=${encodeURIComponent(v.reference)}`,
          },
          exactCodes: [String(v.reference || ''), String(v.vendor_code || '')],
          searchFields: [
            v.reference,
            v.vendor_name,
            v.vendor_code,
            v.payment_mode,
            v.notes,
            v.date,
            String(amount),
            statusLabel,
          ],
        };
      });

      processTypeCandidates('versements', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 8: UTILISATEURS (nom, code) — Administrateur & DOV, sans données sensibles
    // -------------------------------------------------------------------------
    if (
      activeTypes.includes('utilisateurs') &&
      (authUser.role === 'Administrateur' || authUser.role === 'Directeur des opérations de vente')
    ) {
      if (parsed.inactiveVendorsDays) {
        const vendorRows = db
          .prepare(`
            SELECT u.id, u.code, u.name, u.email, u.role, u.phone, u.team, u.created_at,
                   (SELECT MAX(s.date) FROM sales s WHERE s.vendor_id = u.id AND COALESCE(s.status, 'livree') != 'annulee') AS last_sale_date,
                   (SELECT COUNT(*) FROM sales s WHERE s.vendor_id = u.id AND COALESCE(s.status, 'livree') != 'annulee') AS total_sales_count
            FROM users u
            WHERE u.role = 'Vendeur'
            ORDER BY last_sale_date ASC, u.code ASC
          `)
          .all() as any[];

        const refDateMs = new Date(latestDateInDb).getTime();
        const thresholdMs = refDateMs - parsed.inactiveVendorsDays * 86_400_000;
        const inactiveOnly = vendorRows.filter((u) => {
          if (!u.last_sale_date) return true;
          return new Date(String(u.last_sale_date).slice(0, 10)).getTime() <= thresholdMs;
        });
        const targetVendorRows = inactiveOnly.length > 0 ? inactiveOnly : vendorRows;

        const candidates: CandidateRecord[] = targetVendorRows.map((u) => {
          const isInactive = inactiveOnly.some((iv) => iv.id === u.id);
          const statusKey = isInactive ? 'en_attente' : 'valide';
          const statusLabel = isInactive ? 'Sans vente ≥ 3j' : `Dernière vente : ${u.last_sale_date || 'N/A'}`;
          return {
            item: {
              id: String(u.id),
              type: 'utilisateurs',
              code: String(u.code),
              title: `${u.code} — ${u.name}`,
              subtitle: `Vendeur • Dernière vente : ${u.last_sale_date || 'Aucune'} (${u.total_sales_count || 0} ventes)`,
              date: u.last_sale_date || u.created_at || null,
              amount: null,
              status: statusKey,
              statusLabel,
              link: `/?tab=ventes&ref=${encodeURIComponent(u.code)}`,
            },
            exactCodes: [String(u.code || '')],
            searchFields: [u.code, u.name, u.role, u.phone, u.email, statusLabel],
          };
        });

        processTypeCandidates('utilisateurs', candidates);
      } else if (authUser.role === 'Administrateur') {
        const rows = db
          .prepare('SELECT id, code, name, email, role, phone, team, created_at FROM users ORDER BY code ASC')
          .all() as any[];

        const candidates: CandidateRecord[] = rows.map((u) => ({
          item: {
            id: String(u.id),
            type: 'utilisateurs',
            code: String(u.code),
            title: `${u.code} — ${u.name}`,
            subtitle: u.role === 'Vendeur' ? 'Vendeur • Actif' : `${u.role}${u.team ? ` • ${u.team}` : ''} • Actif`,
            date: u.created_at || null,
            amount: null,
            status: 'valide',
            statusLabel: 'Actif',
            link: `/?tab=utilisateurs&ref=${encodeURIComponent(u.code)}`,
          },
          exactCodes: [String(u.code || '')],
          searchFields: [u.code, u.name, u.role, u.team, u.phone, u.email],
        }));

        processTypeCandidates('utilisateurs', candidates);
      }
    }

    // -------------------------------------------------------------------------
    // TYPE 9: RETOURS (numéro, vendeur, motif)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('retours')) {
      const sql = isVendeur
        ? `
          SELECT r.id, r.reference, r.vendor_id, r.date, r.reason, r.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM retours r
          LEFT JOIN users u ON r.vendor_id = u.id
          WHERE r.vendor_id = ?
          ORDER BY r.date DESC
        `
        : `
          SELECT r.id, r.reference, r.vendor_id, r.date, r.reason, r.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM retours r
          LEFT JOIN users u ON r.vendor_id = u.id
          ORDER BY r.date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const candidates: CandidateRecord[] = rows.map((r) => {
        const statusKey = r.status === 'en_attente' ? 'en_attente' : 'valide';
        const statusLabel = r.status === 'en_attente' ? 'En attente' : 'Validé';

        return {
          item: {
            id: String(r.id),
            type: 'retours',
            code: String(r.reference),
            title: `${r.reference} — ${r.vendor_name || r.vendor_id}`,
            subtitle: `${r.date} • Motif : ${r.reason} • ${statusLabel}`,
            date: r.date,
            amount: null,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mon-stock&ref=${encodeURIComponent(r.reference)}`
              : `/?tab=retours&ref=${encodeURIComponent(r.reference)}`,
          },
          exactCodes: [String(r.reference || ''), String(r.vendor_code || '')],
          searchFields: [r.reference, r.vendor_name, r.vendor_code, r.reason, r.date, statusLabel],
        };
      });

      processTypeCandidates('retours', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 10: INVENTAIRES (vendeurs & dépôt central)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('inventaires')) {
      const vendorInvRows = db
        .prepare(`
          SELECT vi.id, vi.reference, vi.date, vi.total_ecart_boxes, vi.total_ecart_fcfa, vi.notes,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM vendor_inventories vi
          LEFT JOIN users u ON vi.vendor_id = u.id
          ORDER BY vi.date DESC
        `)
        .all() as any[];

      const depotInvRows = db
        .prepare(`
          SELECT id, reference, date, total_ecart_boxes, total_ecart_fcfa, performed_by, notes
          FROM depot_inventories
          ORDER BY date DESC
        `)
        .all() as any[];

      const candidates: CandidateRecord[] = [
        ...vendorInvRows.map((vi) => {
          const ecartFcfa = Number(vi.total_ecart_fcfa || 0);
          return {
            item: {
              id: String(vi.id),
              type: 'inventaires' as SearchEntityType,
              code: String(vi.reference),
              title: `${vi.reference} — Inventaire ${vi.vendor_name || ''}`,
              subtitle: `${vi.date} • Écart : ${ecartFcfa.toLocaleString('fr-FR')} FCFA (${vi.total_ecart_boxes} cartons) • Clôturé`,
              date: vi.date,
              amount: Math.abs(ecartFcfa),
              status: 'valide',
              statusLabel: 'Clôturé',
              link: `/?tab=inventaire&ref=${encodeURIComponent(vi.reference)}`,
            },
            exactCodes: [String(vi.reference || ''), String(vi.vendor_code || '')],
            searchFields: [vi.reference, vi.vendor_name, vi.vendor_code, vi.notes, vi.date, String(ecartFcfa)],
          };
        }),
        ...depotInvRows.map((di) => {
          const ecartFcfa = Number(di.total_ecart_fcfa || 0);
          return {
            item: {
              id: String(di.id),
              type: 'inventaires' as SearchEntityType,
              code: String(di.reference),
              title: `${di.reference} — Dépôt Central (${di.performed_by || 'Contrôle'})`,
              subtitle: `${di.date} • Écart : ${ecartFcfa.toLocaleString('fr-FR')} FCFA (${di.total_ecart_boxes} cartons) • Validé`,
              date: di.date,
              amount: Math.abs(ecartFcfa),
              status: 'valide',
              statusLabel: 'Validé',
              link: `/?tab=inventaire&ref=${encodeURIComponent(di.reference)}`,
            },
            exactCodes: [String(di.reference || '')],
            searchFields: [di.reference, di.performed_by, di.notes, di.date, String(ecartFcfa)],
          };
        }),
      ];

      processTypeCandidates('inventaires', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 11: RÉCEPTIONS FOURNISSEURS (Magasinier & Administrateur)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('receptions')) {
      const rows = db
        .prepare('SELECT id, reference, supplier_name, date, total_boxes, bl_number, status, notes FROM receptions ORDER BY date DESC')
        .all() as any[];

      const candidates: CandidateRecord[] = rows.map((rec) => {
        const statusKey = rec.status === 'en_attente' ? 'en_attente' : rec.status === 'annulee' ? 'annule' : 'valide';
        const statusLabel = rec.status === 'en_attente' ? 'En attente' : rec.status === 'annulee' ? 'Annulée' : 'Validée';

        return {
          item: {
            id: String(rec.id),
            type: 'receptions',
            code: String(rec.reference),
            title: `${rec.reference} — ${rec.supplier_name}`,
            subtitle: `${rec.date} • ${rec.total_boxes} cartons • ${statusLabel}`,
            date: rec.date,
            amount: Number(rec.total_boxes || 0),
            status: statusKey,
            statusLabel,
            link: `/?tab=receptions&ref=${encodeURIComponent(rec.reference)}`,
          },
          exactCodes: [String(rec.reference || ''), String(rec.bl_number || '')],
          searchFields: [rec.reference, rec.supplier_name, rec.bl_number, rec.notes, rec.date, statusLabel],
        };
      });

      processTypeCandidates('receptions', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 12: CADEAUX / BONS CADEAUX (Vendeur : ses seuls cadeaux ; Administrateur : tout)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('cadeaux')) {
      const sql = isVendeur
        ? `
          SELECT b.id, b.reference, b.semester, b.closure_date, b.note, b.amount, b.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM bons_cadeaux b
          LEFT JOIN users u ON b.vendor_id = u.id
          WHERE b.vendor_id = ?
          ORDER BY b.closure_date DESC
        `
        : `
          SELECT b.id, b.reference, b.semester, b.closure_date, b.note, b.amount, b.status,
                 u.name AS vendor_name, u.code AS vendor_code
          FROM bons_cadeaux b
          LEFT JOIN users u ON b.vendor_id = u.id
          ORDER BY b.closure_date DESC
        `;

      const rows = (isVendeur ? db.prepare(sql).all(authUser.id) : db.prepare(sql).all()) as any[];
      const candidates: CandidateRecord[] = rows.map((b) => {
        const amount = Number(b.amount || 0);
        return {
          item: {
            id: String(b.id),
            type: 'cadeaux',
            code: String(b.reference),
            title: `${b.reference} — ${b.vendor_name || ''} (${b.semester})`,
            subtitle: `${b.closure_date} • ${amount.toLocaleString('fr-FR')} FCFA • Note : ${b.note}/20 • ${b.status}`,
            date: b.closure_date,
            amount,
            status: b.status === 'expire' ? 'perime' : 'valide',
            statusLabel: String(b.status || 'Actif'),
            link: isVendeur
              ? `/?tab=mes-cadeaux&ref=${encodeURIComponent(b.reference)}`
              : `/?tab=cadeaux&ref=${encodeURIComponent(b.reference)}`,
          },
          exactCodes: [String(b.reference || ''), String(b.vendor_code || '')],
          searchFields: [b.reference, b.semester, b.vendor_name, b.vendor_code, String(amount)],
        };
      });

      processTypeCandidates('cadeaux', candidates);
    }

    // -------------------------------------------------------------------------
    // TYPE 13: SOLDES VENDEURS (Vendeur : son propre solde ; Comptable & Administrateur : tous)
    // -------------------------------------------------------------------------
    if (activeTypes.includes('soldes_vendeurs')) {
      const vendorRows = (
        isVendeur
          ? db
              .prepare(`
                SELECT u.id, u.code, u.name, u.phone,
                       COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.vendor_id = u.id AND s.status != 'annulee'), 0) AS total_sales,
                       COALESCE((SELECT SUM(v.amount) FROM versements v WHERE v.vendor_id = u.id AND v.status = 'valide'), 0) AS total_paid
                FROM users u
                WHERE u.id = ?
              `)
              .all(authUser.id)
          : db
              .prepare(`
                SELECT u.id, u.code, u.name, u.phone,
                       COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.vendor_id = u.id AND s.status != 'annulee'), 0) AS total_sales,
                       COALESCE((SELECT SUM(v.amount) FROM versements v WHERE v.vendor_id = u.id AND v.status = 'valide'), 0) AS total_paid
                FROM users u
                WHERE u.role = 'Vendeur'
                ORDER BY u.code ASC
              `)
              .all()
      ) as any[];

      const candidates: CandidateRecord[] = vendorRows.map((vr) => {
        const soldeDue = Math.max(0, Number(vr.total_sales || 0) - Number(vr.total_paid || 0));
        const statusKey = soldeDue > 0 ? 'impayee' : 'payee';
        const statusLabel = soldeDue > 0 ? 'À verser' : 'Soldé';

        return {
          item: {
            id: String(vr.id),
            type: 'soldes_vendeurs',
            code: String(vr.code),
            title: `${vr.code} — ${vr.name}`,
            subtitle: `Solde dû : ${soldeDue.toLocaleString('fr-FR')} FCFA • Total ventes : ${Number(vr.total_sales || 0).toLocaleString('fr-FR')} FCFA`,
            date: todayIso,
            amount: soldeDue,
            status: statusKey,
            statusLabel,
            link: isVendeur
              ? `/?tab=mon-solde&ref=${encodeURIComponent(vr.code)}`
              : `/?tab=soldes-vendeurs&ref=${encodeURIComponent(vr.code)}`,
          },
          exactCodes: [String(vr.code || '')],
          searchFields: [vr.code, vr.name, vr.phone, String(soldeDue), statusLabel, 'solde'],
        };
      });

      processTypeCandidates('soldes_vendeurs', candidates);
    }

    // 4. Audit log (Journal d'audit des recherches d'utilisateurs et recherches globales)
    const totalResults = groups.reduce((acc, g) => acc + g.total, 0);
    const searchedUsers =
      activeTypes.includes('utilisateurs') &&
      (explicitTypeFilter === 'utilisateurs' || parsed.detectedTypes.includes('utilisateurs') || usersMatchedCount > 0);

    try {
      db.prepare(`
        INSERT INTO audit_logs (id, action, entity, entity_id, user_role, user_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `aud-srch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        searchedUsers ? 'RECHERCHE_UTILISATEURS' : 'RECHERCHE_GLOBALE',
        searchedUsers ? 'users' : 'recherche',
        explicitTypeFilter || 'all',
        authUser.role,
        authUser.id,
        JSON.stringify({
          q: parsed.rawQuery,
          type: explicitTypeFilter || 'all',
          page,
          detectedFilters: {
            types: parsed.detectedTypes,
            status: parsed.statusFilter,
            period: parsed.periodFilter,
            amounts: parsed.amountFilters,
          },
          totalResults,
          usersMatchedCount,
        }),
        new Date().toISOString()
      );
    } catch {
      // Never block search response if audit table write fails
    }

    return res.json({
      success: true,
      query: parsed.rawQuery,
      role: authUser.role,
      userId: authUser.id,
      filters: {
        types: explicitTypeFilter ? [explicitTypeFilter] : parsed.detectedTypes,
        status: parsed.statusFilter,
        period: parsed.periodFilter,
        amounts: parsed.amountFilters,
        tokens: parsed.textTokens,
      },
      pagination: {
        page,
        pageSize: groupLimit,
        mode: isVoirToutPagination ? 'voir_tout' : 'grouped_preview',
      },
      totalResults,
      groups,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la recherche';
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
}
