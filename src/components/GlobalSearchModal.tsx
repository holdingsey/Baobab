import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  Loader2,
  FileText,
  ShoppingBag,
  Store,
  Package,
  Layers,
  Receipt,
  Truck,
  Wallet,
  Users,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  WifiOff,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { isAppOnline, getOfflineSalesQueue } from '../utils/offlineSync';
import { ensureUserAuthToken } from '../utils/pushNotifications';

export type SearchCategoryType =
  | 'factures'
  | 'ventes'
  | 'pdv'
  | 'produits'
  | 'lots'
  | 'versements'
  | 'chargements'
  | 'receptions'
  | 'retours'
  | 'inventaires'
  | 'cadeaux'
  | 'soldes_vendeurs'
  | 'bons_cadeaux'
  | 'utilisateurs';

export interface SearchResultItem {
  id: string;
  type: SearchCategoryType;
  typeLabel: string;
  reference: string;
  titre: string;
  sous_titre: string;
  extrait?: string;
  pertinence?: number;
  url: string;
  date?: string;
  montant?: number;
  status?: string;
  statusLabel?: string;
  donnees?: Record<string, any>;
}

export interface SearchGroup {
  type: SearchCategoryType;
  label: string;
  total: number;
  elements: SearchResultItem[];
}

function normalizeBackendItem(raw: any, fallbackType?: SearchCategoryType): SearchResultItem {
  const type = (raw.type || fallbackType || 'factures') as SearchCategoryType;
  return {
    id: String(raw.id || raw.code || raw.reference || ''),
    type,
    typeLabel: raw.typeLabel || TYPE_LABELS[type] || 'Résultat',
    reference: String(raw.reference || raw.code || raw.id || ''),
    titre: String(raw.titre || raw.title || raw.code || ''),
    sous_titre: String(raw.sous_titre || raw.subtitle || ''),
    extrait: raw.extrait ? String(raw.extrait) : undefined,
    url: String(raw.url || raw.link || '/?tab=dashboard'),
    date: raw.date ? String(raw.date) : undefined,
    montant: typeof raw.montant === 'number' ? raw.montant : typeof raw.amount === 'number' ? raw.amount : undefined,
    status: raw.status ? String(raw.status) : undefined,
    statusLabel: raw.statusLabel ? String(raw.statusLabel) : undefined,
    donnees: raw.donnees || raw,
  };
}

function normalizeBackendGroups(data: any): SearchGroup[] {
  const rawGroups = Array.isArray(data?.groups)
    ? data.groups
    : Array.isArray(data?.groupes)
    ? data.groupes
    : [];
  return rawGroups.map((g: any) => {
    const gType = (g.type || 'factures') as SearchCategoryType;
    const rawItems = Array.isArray(g.items) ? g.items : Array.isArray(g.elements) ? g.elements : [];
    const elements = rawItems.map((it: any) => normalizeBackendItem(it, gType));
    return {
      type: gType,
      label: String(g.label || TYPE_LABELS[gType] || gType),
      total: typeof g.total === 'number' ? g.total : elements.length,
      elements,
    };
  });
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  onSelectResult: (item: SearchResultItem) => void;
}

interface QuickChip {
  id: '' | SearchCategoryType;
  label: string;
}

const ALL_QUICK_CHIPS: QuickChip[] = [
  { id: '', label: 'Tout' },
  { id: 'factures', label: 'Factures' },
  { id: 'ventes', label: 'Ventes' },
  { id: 'pdv', label: 'PDV' },
  { id: 'produits', label: 'Produits' },
  { id: 'lots', label: 'Lots' },
  { id: 'versements', label: 'Versements' },
];

const ROLE_ALLOWED_CHIPS: Record<string, Array<'' | SearchCategoryType>> = {
  Vendeur: ['', 'factures', 'ventes', 'pdv', 'produits', 'versements'],
  Magasinier: ['', 'produits', 'lots'],
  'Gestionnaire de stock': ['', 'produits', 'lots'],
  Comptable: ['', 'factures', 'ventes', 'pdv', 'versements'],
  Administrateur: ['', 'factures', 'ventes', 'pdv', 'produits', 'lots', 'versements'],
  'Directeur des opérations de vente': ['', 'factures', 'ventes', 'pdv', 'produits'],
  'Sales Admin': ['', 'ventes', 'produits', 'lots'],
  'Gestionnaire grossiste': ['', 'factures', 'ventes', 'pdv', 'produits'],
};

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  Vendeur: ['Mon solde', 'Mon stock', "Mes ventes d'aujourd'hui"],
  Magasinier: ['Lots à moins de 30 jours', 'Chargements en attente'],
  'Gestionnaire de stock': ['Lots à moins de 30 jours', 'Chargements en attente'],
  Comptable: ['Versements en attente', 'Factures impayées'],
  Administrateur: ['PDV à valider', 'Vendeurs sans vente depuis 3 jours'],
  'Directeur des opérations de vente': ['PDV à valider', 'Vendeurs sans vente depuis 3 jours'],
  'Sales Admin': ['Lots à moins de 30 jours', 'Chargements en attente'],
  'Gestionnaire grossiste': ['Factures impayées', 'Mon stock'],
};

const TYPE_LABELS: Record<SearchCategoryType, string> = {
  factures: 'Factures',
  ventes: 'Ventes',
  pdv: 'Points de vente (PDV)',
  produits: 'Produits & Stock',
  lots: 'Lots & Péremptions',
  versements: 'Versements',
  chargements: 'Chargements',
  receptions: 'Réceptions fournisseur',
  retours: 'Retours dépôt',
  inventaires: 'Inventaires',
  cadeaux: 'Bons cadeaux',
  soldes_vendeurs: 'Soldes vendeurs',
  bons_cadeaux: 'Bons cadeaux',
  utilisateurs: 'Utilisateurs & Vendeurs',
};

function stripAccents(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function stripMarkTags(str: string): string {
  return String(str || '').replace(/<\/?mark>/gi, '');
}

const HIGHLIGHT_STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux',
  'et', 'ou', 'dans', 'par', 'pour', 'sur', 'avec', 'sans', 'mon',
  'ma', 'mes', 'a', 'd', 'l', 'depuis', 'moins',
]);

export function renderHighlightedText(rawText: string, rawQuery: string): React.ReactNode {
  const cleanText = stripMarkTags(rawText || '');
  if (!cleanText) return '';
  const cleanQuery = (rawQuery || '').trim();
  if (!cleanQuery) return cleanText;

  const tokens = Array.from(
    new Set(
      stripAccents(cleanQuery)
        .replace(/['’]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !HIGHLIGHT_STOPWORDS.has(t))
    )
  ).sort((a, b) => b.length - a.length);

  if (tokens.length === 0) return cleanText;

  const normalizedText = stripAccents(cleanText);
  const ranges: Array<[number, number]> = [];

  for (const token of tokens) {
    let startIndex = 0;
    while (startIndex < normalizedText.length) {
      const idx = normalizedText.indexOf(token, startIndex);
      if (idx === -1) break;
      ranges.push([idx, idx + token.length]);
      startIndex = idx + token.length;
    }
  }

  if (ranges.length === 0) return cleanText;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], index) => {
    if (start > cursor) {
      parts.push(cleanText.slice(cursor, start));
    }
    parts.push(
      <mark
        key={`hl-${index}-${start}`}
        className="bg-amber-200 dark:bg-amber-500/40 text-slate-950 dark:text-white font-extrabold px-1 rounded"
      >
        {cleanText.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < cleanText.length) {
    parts.push(cleanText.slice(cursor));
  }

  return parts;
}

function getCategoryIcon(type: SearchCategoryType) {
  switch (type) {
    case 'factures':
      return <FileText className="w-5 h-5 text-[#008DA9] dark:text-cyan-400 shrink-0" />;
    case 'ventes':
      return <ShoppingBag className="w-5 h-5 text-[#15803D] dark:text-emerald-400 shrink-0" />;
    case 'pdv':
      return <Store className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />;
    case 'produits':
      return <Package className="w-5 h-5 text-[#008DA9] dark:text-cyan-400 shrink-0" />;
    case 'lots':
      return <Layers className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />;
    case 'versements':
      return <Receipt className="w-5 h-5 text-[#15803D] dark:text-emerald-400 shrink-0" />;
    case 'chargements':
      return <Truck className="w-5 h-5 text-[#008DA9] dark:text-cyan-400 shrink-0" />;
    case 'receptions':
    case 'retours':
    case 'inventaires':
      return <Package className="w-5 h-5 text-[#15803D] dark:text-emerald-400 shrink-0" />;
    case 'soldes_vendeurs':
      return <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />;
    case 'utilisateurs':
      return <Users className="w-5 h-5 text-[#008DA9] dark:text-cyan-400 shrink-0" />;
    default:
      return <FileText className="w-5 h-5 text-slate-500 shrink-0" />;
  }
}

interface StatusBadgeInfo {
  label: string;
  className: string;
}

function getResultStatusBadge(item: SearchResultItem): StatusBadgeInfo {
  const d = item.donnees || {};
  const sub = stripAccents(item.sous_titre || '');
  const title = stripAccents(item.titre || '');
  const stKey = stripAccents(item.status || d.status || '');
  const stLabel = item.statusLabel || '';

  const greenCls =
    'bg-emerald-100 text-[#15803D] border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700';
  const amberCls =
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700';
  const redCls =
    'bg-red-100 text-[#B91C1C] border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-700';
  const tealCls =
    'bg-teal-50 text-[#008DA9] border-teal-200 dark:bg-teal-950/60 dark:text-cyan-300 dark:border-teal-800';

  if (stKey) {
    if (['payee', 'valide', 'validee', 'confirme', 'actif', 'en_stock'].includes(stKey)) {
      return { label: stLabel || 'Validé', className: greenCls };
    }
    if (['en_attente', 'a_valider', 'partielle', 'proche_peremption', 'stock_faible', 'provisoire'].includes(stKey)) {
      return { label: stLabel || 'En attente', className: amberCls };
    }
    if (['impayee', 'annule', 'annulee', 'rejete', 'rupture', 'perime', 'ecart', 'inactif'].includes(stKey)) {
      return { label: stLabel || 'Alerte', className: redCls };
    }
  }

  if (item.type === 'factures' || item.type === 'ventes') {
    const cancelStatus = String(d.cancellation_status || '');
    const rectStatus = String(d.rectification_status || '');
    const payMethod = stripAccents(String(d.payment_method || ''));
    const total = Number(d.total ?? item.montant ?? 0);
    const paid = Number(d.amount_paid ?? total);
    const credit = Math.max(0, total - paid);

    if (cancelStatus === 'approuvee') return { label: 'Annulée', className: redCls };
    if (cancelStatus === 'en_attente' || rectStatus === 'en_attente') {
      return { label: 'En attente', className: amberCls };
    }
    if (credit > 0 || payMethod === 'credit' || sub.includes('impayee')) {
      return { label: credit > 0 && paid > 0 ? 'Partielle' : 'Impayée', className: redCls };
    }
    return { label: item.type === 'factures' ? 'Payée' : 'Validée', className: greenCls };
  }

  if (item.type === 'pdv') {
    const st = String(d.status || '');
    if (st === 'en_attente' || sub.includes('en attente')) {
      return { label: 'À valider', className: amberCls };
    }
    if (st === 'rejete' || sub.includes('rejete')) {
      return { label: 'Rejeté', className: redCls };
    }
    return { label: 'Validé', className: greenCls };
  }

  if (item.type === 'versements') {
    const st = String(d.status || '');
    if (st === 'en_attente' || sub.includes('en attente')) {
      return { label: 'En attente', className: amberCls };
    }
    if (st === 'ecart' || Number(d.discrepancy || 0) !== 0 || sub.includes('ecart')) {
      return { label: 'Écart', className: redCls };
    }
    return { label: 'Validé', className: greenCls };
  }

  if (item.type === 'chargements') {
    const st = String(d.status || '');
    if (st === 'en_attente' || sub.includes('en attente')) {
      return { label: 'En attente', className: amberCls };
    }
    return { label: 'Confirmé', className: greenCls };
  }

  if (item.type === 'lots') {
    const exp = String(d.expiry || d.expiry_date || '');
    if (exp) {
      const diffDays = Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { label: 'Périmé', className: redCls };
      if (diffDays <= 30) return { label: `Expire sous ${diffDays}j`, className: amberCls };
    }
    return { label: 'Conforme FEFO', className: greenCls };
  }

  if (item.type === 'produits') {
    const stock = Number(d.stock_depot ?? 0);
    const min = Number(d.min_threshold ?? 10);
    if (stock <= 0) return { label: 'Rupture', className: redCls };
    if (stock <= min) return { label: 'Stock bas', className: amberCls };
    return { label: 'En stock', className: greenCls };
  }

  if (item.type === 'soldes_vendeurs') {
    const debt = Number(d.remaining_debt ?? item.montant ?? 0);
    if (debt > 0) return { label: 'À reverser', className: amberCls };
    return { label: 'Soldé (0 FCFA)', className: greenCls };
  }

  if (item.type === 'utilisateurs') {
    if (typeof d.days_since_last_sale === 'number' && d.days_since_last_sale >= 3) {
      return {
        label:
          d.days_since_last_sale >= 999
            ? 'Aucune vente'
            : `Sans vente (${d.days_since_last_sale}j)`,
        className: redCls,
      };
    }
    if (title.includes('provisoire') || sub.includes('provisoire')) {
      return { label: 'Mot de passe provisoire', className: amberCls };
    }
    return { label: 'Actif', className: tealCls };
  }

  return { label: item.typeLabel || 'Fiche', className: tealCls };
}

function searchOfflineCache(
  rawQuery: string,
  activeChip: '' | SearchCategoryType,
  currentUser: UserSession
): SearchGroup[] {
  let cache: any = {};
  try {
    const raw = localStorage.getItem('baobab_offline_search_cache');
    if (raw) cache = JSON.parse(raw);
  } catch {
    cache = {};
  }

  const qNorm = stripAccents(rawQuery.trim());
  const isTodayFilter = /aujourd['’]?hui/.test(qNorm);
  const isUnpaidFilter = /impaye/.test(qNorm);
  const isPendingFilter = /en\s+attente|a\s+valider/.test(qNorm);
  const isLotUnder30Days = /moins\s+de\s+30\s*jours/.test(qNorm);
  const isInactiveVendors = /vendeurs?\s+sans\s+ventes?/.test(qNorm);
  const isMonSolde = /mon\s+solde|solde/.test(qNorm);
  const isMonStock = /mon\s+stock/.test(qNorm);

  const tokens = qNorm
    .replace(/aujourd['’]?hui/g, '')
    .replace(/impayes?/g, '')
    .replace(/en\s+attente/g, '')
    .replace(/a\s+valider/g, '')
    .replace(/lots?\s+a\s+moins\s+de\s+\d+\s*jours?/g, '')
    .replace(/vendeurs?\s+sans\s+ventes?(\s+depuis\s+\d+\s*jours?)?/g, '')
    .replace(/mon\s+solde/g, '')
    .replace(/mon\s+stock/g, '')
    .replace(/mes\s+ventes?/g, '')
    .replace(/factures?/g, '')
    .replace(/versements?/g, '')
    .replace(/chargements?/g, '')
    .replace(/pdvs?/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !HIGHLIGHT_STOPWORDS.has(t));

  const matchesTokens = (haystack: string) => {
    if (tokens.length === 0) return true;
    const h = stripAccents(haystack);
    return tokens.every((tok) => h.includes(tok));
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const role = currentUser.role;
  const allowedChips = ROLE_ALLOWED_CHIPS[role] || ROLE_ALLOWED_CHIPS.Administrateur;

  const canSearchType = (t: SearchCategoryType) => {
    if (activeChip && activeChip !== t) return false;
    if (isMonSolde) return t === 'soldes_vendeurs';
    if (isMonStock) return t === 'produits' || t === 'chargements';
    if (isLotUnder30Days) return t === 'lots';
    if (isInactiveVendors) return t === 'utilisateurs';
    if (/factures?\s+impaye/.test(qNorm)) return t === 'factures';
    if (/versements?\s+en\s+attente/.test(qNorm)) return t === 'versements';
    if (/chargements?\s+en\s+attente/.test(qNorm)) return t === 'chargements';
    if (/pdv\s+a\s+valider/.test(qNorm)) return t === 'pdv';
    if (/mes\s+ventes/.test(qNorm)) return t === 'ventes';
    if (
      t === 'soldes_vendeurs' ||
      t === 'chargements' ||
      t === 'utilisateurs'
    ) {
      return true;
    }
    return allowedChips.includes(t);
  };

  const groups: SearchGroup[] = [];

  // 1. Soldes vendeurs (pour "Mon solde" Vendeur ou Comptable/Admin)
  if (canSearchType('soldes_vendeurs') && (role === 'Vendeur' || role === 'Comptable' || role === 'Administrateur')) {
    const balances: any[] = Array.isArray(cache.balances) ? cache.balances : [];
    const items: SearchResultItem[] = balances
      .filter((b) => (role === 'Vendeur' ? b.vendor_id === currentUser.id : true))
      .filter((b) =>
        matchesTokens(`${b.vendor_name || ''} ${b.vendor_code || ''} ${b.team || ''} solde`)
      )
      .map((b) => ({
        id: String(b.vendor_id || currentUser.id),
        type: 'soldes_vendeurs' as const,
        typeLabel: TYPE_LABELS.soldes_vendeurs,
        reference: String(b.vendor_code || currentUser.code || ''),
        titre: `Solde Vendeur ${b.vendor_name || currentUser.name} (${b.vendor_code || currentUser.code})`,
        sous_titre: `Reste à reverser : ${Number(b.remaining_debt || 0).toLocaleString('fr-FR')} FCFA • Total vendu : ${Number(b.total_sold || 0).toLocaleString('fr-FR')} FCFA`,
        url: role === 'Vendeur' ? '/?tab=mon-solde' : '/?tab=soldes-vendeurs',
        montant: Number(b.remaining_debt || 0),
        donnees: b,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'soldes_vendeurs',
        label: TYPE_LABELS.soldes_vendeurs,
        total: items.length,
        elements: items,
      });
    }
  }

  // 2. Factures & Ventes
  const cachedSales: any[] = [
    ...(Array.isArray(cache.sales) ? cache.sales : []),
    ...getOfflineSalesQueue().map((q: any) => ({
      id: q.id,
      invoice_number: q.invoice_number || q.number || q.id,
      thermal_ticket_number: q.thermal_ticket_number || q.id,
      pdv_id: q.pdv_id,
      pdv_name: q.pdv_name,
      vendor_id: q.vendor_id || currentUser.id,
      vendor_name: q.vendor_name || currentUser.name,
      total: q.total ?? q.total_amount ?? 0,
      amount_paid: q.amount_paid ?? q.total ?? q.total_amount ?? 0,
      payment_method: q.payment_method || q.payment_mode || 'Espèces',
      date: q.created_at || q.date || new Date().toISOString(),
    })),
  ];

  if (canSearchType('factures')) {
    const items: SearchResultItem[] = cachedSales
      .filter((s) => (role === 'Vendeur' ? s.vendor_id === currentUser.id || s.vendor_name === currentUser.name : true))
      .filter((s) => {
        if (isTodayFilter && !String(s.date || '').startsWith(todayIso)) return false;
        const total = Number(s.total || 0);
        const paid = Number(s.amount_paid ?? total);
        const isUnpaid = total > paid || stripAccents(String(s.payment_method || '')) === 'credit';
        if (isUnpaidFilter && !isUnpaid) return false;
        return matchesTokens(
          `${s.invoice_number || ''} ${s.thermal_ticket_number || ''} ${s.pdv_name || ''} ${s.vendor_name || ''} ${s.payment_method || ''}`
        );
      })
      .map((s) => {
        const total = Number(s.total || 0);
        const paid = Number(s.amount_paid ?? total);
        const credit = Math.max(0, total - paid);
        return {
          id: String(s.id),
          type: 'factures' as const,
          typeLabel: TYPE_LABELS.factures,
          reference: String(s.invoice_number || s.id),
          titre: `Facture ${s.invoice_number || s.id} — ${s.pdv_name || 'PDV'}`,
          sous_titre: `${Number(total).toLocaleString('fr-FR')} FCFA • ${
            credit > 0 ? `Impayée (Reste ${credit.toLocaleString('fr-FR')} FCFA)` : 'Payée'
          } • Vendeur : ${s.vendor_name || ''}`,
          url: role === 'Vendeur' ? '/?tab=mes-factures' : '/?tab=factures',
          date: s.date,
          montant: total,
          donnees: s,
        };
      });
    if (items.length > 0) {
      groups.push({
        type: 'factures',
        label: TYPE_LABELS.factures,
        total: items.length,
        elements: items,
      });
    }
  }

  if (canSearchType('ventes')) {
    const items: SearchResultItem[] = cachedSales
      .filter((s) => (role === 'Vendeur' ? s.vendor_id === currentUser.id || s.vendor_name === currentUser.name : true))
      .filter((s) => {
        if (isTodayFilter && !String(s.date || '').startsWith(todayIso)) return false;
        return matchesTokens(
          `${s.id || ''} ${s.invoice_number || ''} ${s.pdv_name || ''} ${s.vendor_name || ''} ${s.payment_method || ''}`
        );
      })
      .map((s) => ({
        id: String(s.id),
        type: 'ventes' as const,
        typeLabel: TYPE_LABELS.ventes,
        reference: String(s.id),
        titre: `Vente ${s.id} — ${s.pdv_name || 'PDV'}`,
        sous_titre: `${Number(s.total || 0).toLocaleString('fr-FR')} FCFA • ${s.payment_method || 'Espèces'} • ${String(s.date || '').slice(0, 10)}`,
        url: role === 'Vendeur' ? '/?tab=mes-ventes' : '/?tab=ventes',
        date: s.date,
        montant: Number(s.total || 0),
        donnees: s,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'ventes',
        label: TYPE_LABELS.ventes,
        total: items.length,
        elements: items,
      });
    }
  }

  // 3. PDV
  if (canSearchType('pdv')) {
    const pdvs: any[] = Array.isArray(cache.pdvs) ? cache.pdvs : [];
    const items: SearchResultItem[] = pdvs
      .filter((p) => {
        if (isPendingFilter && p.status !== 'en_attente') return false;
        return matchesTokens(
          `${p.code || ''} ${p.name || ''} ${p.owner || ''} ${p.phone || ''} ${p.quartier || ''} ${p.commune || ''}`
        );
      })
      .map((p) => ({
        id: String(p.id),
        type: 'pdv' as const,
        typeLabel: TYPE_LABELS.pdv,
        reference: String(p.code || p.id),
        titre: `${p.name} (${p.code || p.id})`,
        sous_titre: `${p.quartier || ''}, ${p.commune || ''} • Tél : ${p.phone || 'N/R'} • Statut : ${
          p.status === 'valide' ? 'Validé' : p.status === 'en_attente' ? 'En attente' : 'Rejeté'
        }`,
        url:
          p.status === 'en_attente' &&
          (role === 'Administrateur' || role === 'Directeur des opérations de vente')
            ? '/?tab=validation-pdv'
            : role === 'Vendeur'
            ? '/?tab=mes-pdvs'
            : '/?tab=pdvs',
        donnees: p,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'pdv',
        label: TYPE_LABELS.pdv,
        total: items.length,
        elements: items,
      });
    }
  }

  // 4. Produits & Lots
  const products: any[] = Array.isArray(cache.products) ? cache.products : [];
  if (canSearchType('produits')) {
    const items: SearchResultItem[] = products
      .filter((p) => matchesTokens(`${p.code || ''} ${p.name || ''} ${p.gamme || ''} ${p.unit || ''}`))
      .map((p) => ({
        id: String(p.id),
        type: 'produits' as const,
        typeLabel: TYPE_LABELS.produits,
        reference: String(p.code || p.id),
        titre: `${p.name} (${p.code})`,
        sous_titre: `Gamme ${p.gamme || ''} • ${Number(p.price || 0).toLocaleString('fr-FR')} FCFA • Stock dépôt : ${p.stock_depot ?? 0}`,
        url: role === 'Vendeur' ? '/?tab=mon-stock' : '/?tab=catalogue',
        montant: Number(p.price || 0),
        donnees: p,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'produits',
        label: TYPE_LABELS.produits,
        total: items.length,
        elements: items,
      });
    }
  }

  if (canSearchType('lots')) {
    const allLots: SearchResultItem[] = [];
    const maxExpiryIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const p of products) {
      const lots = Array.isArray(p.lots) ? p.lots : [];
      for (const l of lots) {
        const exp = String(l.expiry || l.expiry_date || '');
        if (isLotUnder30Days && (!exp || exp > maxExpiryIso)) continue;
        if (!matchesTokens(`${l.lot_number || ''} ${p.name || ''} ${p.code || ''} ${exp}`)) continue;
        allLots.push({
          id: String(l.id || l.lot_number),
          type: 'lots',
          typeLabel: TYPE_LABELS.lots,
          reference: String(l.lot_number || l.id),
          titre: `Lot ${l.lot_number} — ${p.name}`,
          sous_titre: `Qté : ${l.qty} (${p.unit || 'Carton'}) • Péremption : ${exp}`,
          url: '/?tab=lots',
          date: exp,
          donnees: { ...l, product_name: p.name, product_code: p.code },
        });
      }
    }
    if (allLots.length > 0) {
      groups.push({
        type: 'lots',
        label: TYPE_LABELS.lots,
        total: allLots.length,
        elements: allLots,
      });
    }
  }

  // 5. Versements
  if (canSearchType('versements')) {
    const versements: any[] = Array.isArray(cache.versements) ? cache.versements : [];
    const items: SearchResultItem[] = versements
      .filter((v) => (role === 'Vendeur' ? v.vendor_id === currentUser.id : true))
      .filter((v) => {
        if (isPendingFilter && v.status !== 'en_attente') return false;
        return matchesTokens(`${v.id || ''} ${v.vendor_name || ''} ${v.method || ''} ${v.reference || ''}`);
      })
      .map((v) => ({
        id: String(v.id),
        type: 'versements' as const,
        typeLabel: TYPE_LABELS.versements,
        reference: String(v.id),
        titre: `Versement ${v.id} — ${v.vendor_name || ''}`,
        sous_titre: `Déclaré : ${Number(v.declared_amount || 0).toLocaleString('fr-FR')} FCFA • ${v.method || ''} • Statut : ${
          v.status === 'valide' ? 'Validé' : v.status === 'ecart' ? 'Écart' : 'En attente'
        }`,
        url: role === 'Vendeur' ? '/?tab=mes-versements' : '/?tab=versements',
        date: v.date,
        montant: Number(v.declared_amount || 0),
        donnees: v,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'versements',
        label: TYPE_LABELS.versements,
        total: items.length,
        elements: items,
      });
    }
  }

  // 6. Chargements (pour "Chargements en attente" ou recherche Magasinier/Vendeur)
  if (canSearchType('chargements')) {
    const chargements: any[] = Array.isArray(cache.chargements) ? cache.chargements : [];
    const items: SearchResultItem[] = chargements
      .filter((c) => (role === 'Vendeur' ? c.vendor_id === currentUser.id : true))
      .filter((c) => {
        if (isPendingFilter && c.status !== 'en_attente') return false;
        return matchesTokens(`${c.id || ''} ${c.vendor_name || ''} ${c.status || ''}`);
      })
      .map((c) => ({
        id: String(c.id),
        type: 'chargements' as const,
        typeLabel: TYPE_LABELS.chargements,
        reference: String(c.id),
        titre: `Chargement ${c.id} — ${c.vendor_name || ''}`,
        sous_titre: `Date : ${String(c.date || '').slice(0, 10)} • Statut : ${
          c.status === 'confirme' ? 'Confirmé' : 'En attente'
        }`,
        url: role === 'Vendeur' ? '/?tab=mon-chargement' : '/?tab=chargements',
        date: c.date,
        donnees: c,
      }));
    if (items.length > 0) {
      groups.push({
        type: 'chargements',
        label: TYPE_LABELS.chargements,
        total: items.length,
        elements: items,
      });
    }
  }

  // 7. Utilisateurs / Vendeurs sans vente depuis 3 jours
  if (canSearchType('utilisateurs') && (role === 'Administrateur' || role === 'Directeur des opérations de vente')) {
    const users: any[] = Array.isArray(cache.usersList) ? cache.usersList : [];
    const cutoffIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const items: SearchResultItem[] = users
      .filter((u) => {
        if (isInactiveVendors) {
          if (u.role !== 'Vendeur') return false;
          const userSales = cachedSales.filter((s) => s.vendor_id === u.id && s.cancellation_status !== 'approuvee');
          const latestDate = userSales.reduce((max, s) => (String(s.date || '') > max ? String(s.date || '') : max), '');
          return !latestDate || latestDate < cutoffIso;
        }
        return matchesTokens(`${u.code || ''} ${u.name || ''} ${u.role || ''} ${u.phone || ''}`);
      })
      .map((u) => {
        const userSales = cachedSales.filter((s) => s.vendor_id === u.id && s.cancellation_status !== 'approuvee');
        const latestDate = userSales.reduce((max, s) => (String(s.date || '') > max ? String(s.date || '') : max), '');
        const daysSince = latestDate
          ? Math.floor((Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        return {
          id: String(u.id),
          type: 'utilisateurs' as const,
          typeLabel: TYPE_LABELS.utilisateurs,
          reference: String(u.code || u.id),
          titre: `${u.name} (${u.code})`,
          sous_titre: isInactiveVendors
            ? `Vendeur • Tél : ${u.phone || 'N/R'} • ${
                latestDate ? `Sans vente depuis ${daysSince} jours` : 'Aucune vente enregistrée'
              }`
            : `Rôle : ${u.role}${u.role !== 'Vendeur' && u.team ? ` • Service : ${u.team}` : ''} • Tél : ${u.phone || 'N/R'}`,
          url: '/?tab=utilisateurs',
          donnees: { ...u, days_since_last_sale: daysSince },
        };
      });
    if (items.length > 0) {
      groups.push({
        type: 'utilisateurs',
        label: TYPE_LABELS.utilisateurs,
        total: items.length,
        elements: items,
      });
    }
  }

  return groups;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState<'' | SearchCategoryType>('');
  const [expandedType, setExpandedType] = useState<SearchCategoryType | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [expandedElements, setExpandedElements] = useState<SearchResultItem[]>([]);
  const [expandedTotal, setExpandedTotal] = useState(0);
  const [expandedTotalPages, setExpandedTotalPages] = useState(1);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(() => isAppOnline());
  const [usedOfflineFallback, setUsedOfflineFallback] = useState(false);
  const [recentItems, setRecentItems] = useState<SearchResultItem[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<Record<number, HTMLElement | null>>({});

  const recentStorageKey = `baobab_recent_searches_${currentUser.id}`;

  // Load recent items for currentUser
  const loadRecentItems = useCallback(() => {
    try {
      const saved = localStorage.getItem(recentStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecentItems(parsed.slice(0, 5));
          return;
        }
      }
    } catch {
      // ignore
    }
    setRecentItems([]);
  }, [recentStorageKey]);

  const saveRecentItem = useCallback(
    (item: SearchResultItem) => {
      try {
        const next = [
          item,
          ...recentItems.filter((r) => !(r.id === item.id && r.type === item.type)),
        ].slice(0, 5);
        setRecentItems(next);
        localStorage.setItem(recentStorageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [recentItems, recentStorageKey]
  );

  const clearRecentItems = () => {
    try {
      localStorage.removeItem(recentStorageKey);
    } catch {
      // ignore
    }
    setRecentItems([]);
  };

  // Sync network state
  useEffect(() => {
    const syncNetwork = () => setOnline(isAppOnline());
    window.addEventListener('online', syncNetwork);
    window.addEventListener('offline', syncNetwork);
    window.addEventListener('baobab-network-change', syncNetwork);
    return () => {
      window.removeEventListener('online', syncNetwork);
      window.removeEventListener('offline', syncNetwork);
      window.removeEventListener('baobab-network-change', syncNetwork);
    };
  }, []);

  // Reset / autofocus when opening modal
  useEffect(() => {
    if (isOpen) {
      loadRecentItems();
      setActiveIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setLoading(false);
    }
  }, [isOpen, loadRecentItems]);

  // Role-filtered chips
  const roleChips = useMemo(() => {
    const allowed = ROLE_ALLOWED_CHIPS[currentUser.role] || ROLE_ALLOWED_CHIPS.Administrateur;
    return ALL_QUICK_CHIPS.filter((chip) => allowed.includes(chip.id));
  }, [currentUser.role]);

  // Role-specific suggestions
  const roleSuggestions = useMemo(() => {
    return ROLE_SUGGESTIONS[currentUser.role] || ROLE_SUGGESTIONS.Administrateur;
  }, [currentUser.role]);

  const isIdleEmptyState = query.trim() === '' && activeChip === '' && !expandedType;

  // Debounced search (250 ms) with AbortController cancellation
  useEffect(() => {
    if (!isOpen) return;

    if (isIdleEmptyState) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setLoading(false);
      setGroups([]);
      setExpandedElements([]);
      setUsedOfflineFallback(!isAppOnline());
      return;
    }

    const effectiveType = expandedType || activeChip || '';

    // Cancel any previous pending request immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setLoading(true);

    const debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!isAppOnline()) {
        const offlineGroups = searchOfflineCache(query, effectiveType, currentUser);
        if (expandedType) {
          const foundGroup = offlineGroups.find((g) => g.type === expandedType);
          const allEls = foundGroup ? foundGroup.elements : [];
          setExpandedElements(allEls);
          setExpandedTotal(allEls.length);
          setExpandedTotalPages(1);
        } else {
          setGroups(offlineGroups);
        }
        setUsedOfflineFallback(true);
        setLoading(false);
        setActiveIndex(0);
        return;
      }

      try {
        const token = await ensureUserAuthToken(currentUser.id, currentUser.role);

        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (effectiveType) params.set('type', effectiveType);
        if (expandedType) params.set('page', String(page));

        const headers: Record<string, string> = {
          'x-user-id': currentUser.id,
          'x-user-role': currentUser.role,
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          headers['x-auth-token'] = token;
        }

        const res = await fetch(`/recherche?${params.toString()}`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        setUsedOfflineFallback(false);

        const normalizedGroups = normalizeBackendGroups(data);

        if (expandedType) {
          const targetGroup =
            normalizedGroups.find((g) => g.type === expandedType) || normalizedGroups[0];
          const els = targetGroup
            ? targetGroup.elements
            : Array.isArray(data.elements)
            ? data.elements.map((it: any) => normalizeBackendItem(it, expandedType))
            : [];
          const totalCount = targetGroup
            ? targetGroup.total
            : typeof data.totalResults === 'number'
            ? data.totalResults
            : els.length;
          const pageSize = Number(data.pagination?.pageSize || 20);
          setExpandedElements(els);
          setExpandedTotal(totalCount);
          setExpandedTotalPages(Math.max(1, Math.ceil(totalCount / pageSize)));
        } else {
          setGroups(normalizedGroups);
        }
        setActiveIndex(0);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        // Fallback to local cache if network fails
        const offlineGroups = searchOfflineCache(query, effectiveType, currentUser);
        if (expandedType) {
          const foundGroup = offlineGroups.find((g) => g.type === expandedType);
          const allEls = foundGroup ? foundGroup.elements : [];
          setExpandedElements(allEls);
          setExpandedTotal(allEls.length);
          setExpandedTotalPages(1);
        } else {
          setGroups(offlineGroups);
        }
        setUsedOfflineFallback(true);
        setActiveIndex(0);
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [isOpen, query, activeChip, expandedType, page, currentUser, isIdleEmptyState]);

  // Build flat list of navigable entries for keyboard Up/Down/Enter navigation
  const navigableEntries = useMemo(() => {
    if (isIdleEmptyState) {
      const entries: Array<
        | { kind: 'recent'; item: SearchResultItem }
        | { kind: 'suggestion'; label: string }
      > = [];
      recentItems.forEach((item) => entries.push({ kind: 'recent', item }));
      roleSuggestions.forEach((label) => entries.push({ kind: 'suggestion', label }));
      return entries;
    }

    if (expandedType) {
      return expandedElements.map((item) => ({ kind: 'result' as const, item }));
    }

    const entries: Array<{ kind: 'result'; item: SearchResultItem }> = [];
    groups.forEach((group) => {
      const previewItems = activeChip ? group.elements : group.elements.slice(0, 5);
      previewItems.forEach((item) => entries.push({ kind: 'result', item }));
    });
    return entries;
  }, [isIdleEmptyState, recentItems, roleSuggestions, expandedType, expandedElements, groups, activeChip]);

  // Keep active item visible when navigating with keyboard
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleTriggerEntry = useCallback(
    (entry: (typeof navigableEntries)[number] | undefined) => {
      if (!entry) return;
      if (entry.kind === 'suggestion') {
        setActiveChip('');
        setExpandedType(null);
        setPage(1);
        setQuery(entry.label);
        inputRef.current?.focus();
        return;
      }
      const targetItem = entry.item;
      saveRecentItem(targetItem);
      onSelectResult(targetItem);
      onClose();
    },
    [onClose, onSelectResult, saveRecentItem]
  );

  // Keyboard navigation handler (ArrowDown, ArrowUp, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (expandedType) {
        setExpandedType(null);
        setPage(1);
        return;
      }
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navigableEntries.length > 0) {
        setActiveIndex((prev) => (prev + 1) % navigableEntries.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navigableEntries.length > 0) {
        setActiveIndex((prev) => (prev - 1 + navigableEntries.length) % navigableEntries.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (navigableEntries.length > 0 && navigableEntries[activeIndex]) {
        e.preventDefault();
        handleTriggerEntry(navigableEntries[activeIndex]);
      }
    }
  };

  if (!isOpen) return null;

  const totalResultsCount = expandedType
    ? expandedTotal
    : groups.reduce((acc, g) => acc + (g.total || g.elements.length), 0);

  let runningFlatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-0 sm:p-4 overflow-hidden"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche globale Baobab Distribution"
    >
      {/* Panneau modal OPAQUE : plein écran 100dvh sur mobile, 640 px centré sur PC */}
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[86dvh] sm:max-w-[640px] bg-white dark:bg-[#0F172A] opacity-100 text-slate-900 dark:text-slate-100 sm:rounded-2xl border-0 sm:border sm:border-slate-300 dark:sm:border-slate-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête fixe : Champ de recherche 52 px + Filtres rapides en puces */}
        <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (expandedType) {
                    setExpandedType(null);
                    setPage(1);
                  }
                }}
                placeholder="Rechercher une facture, vente, PDV, produit, lot, versement..."
                aria-label="Champ de recherche globale"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="baobab-search-input-52 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-400 dark:border-slate-600 rounded-xl font-medium"
              />
              {/* Indicateur de chargement ou bouton d'effacement (cible tactile 48x48 px) */}
              {loading ? (
                <div
                  className="w-12 h-12 flex items-center justify-center absolute right-0.5 top-1/2 -translate-y-1/2 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]"
                  aria-label="Recherche en cours"
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : query.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setExpandedType(null);
                    setPage(1);
                    inputRef.current?.focus();
                  }}
                  className="w-12 h-12 flex items-center justify-center absolute right-0.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-xl cursor-pointer"
                  aria-label="Effacer la saisie"
                  title="Effacer la saisie"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer transition"
              aria-label="Fermer la recherche"
            >
              Fermer
            </button>
          </div>

          {/* Filtres rapides en puces sous le champ (seulement ceux du rôle, zone tactile >= 48 px) */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1"
            role="tablist"
            aria-label="Filtres par catégorie"
          >
            {roleChips.map((chip) => {
              const isSelected =
                (expandedType ? expandedType === chip.id : activeChip === chip.id);
              return (
                <button
                  key={chip.id || 'tout'}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setExpandedType(null);
                    setPage(1);
                    setActiveChip(chip.id);
                    inputRef.current?.focus();
                  }}
                  className={`min-h-[48px] h-auto px-3.5 py-2 rounded-xl text-sm font-bold shrink-0 border transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] border-[var(--marque-fonce)] shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Message clair en mode Hors ligne */}
          {(!online || usedOfflineFallback) && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-medium leading-snug">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-800 dark:text-amber-300" />
              <span className="break-words min-w-0">
                Mode hors ligne : la recherche est limitée aux éléments en cache sur cet appareil.
              </span>
            </div>
          )}
        </div>

        {/* Corps défilant (overflow-y-auto) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-5 bg-white dark:bg-[#0F172A] min-w-0">
          {/* État sans saisie : Récents (5 derniers éléments par utilisateur) + Suggestions selon le rôle */}
          {isIdleEmptyState ? (
            <div className="space-y-5">
              {/* Section Récents */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Clock className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                    <span>Récents</span>
                  </div>
                  {recentItems.length > 0 && (
                    <button
                      type="button"
                      onClick={clearRecentItems}
                      className="min-h-[48px] px-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#B91C1C] dark:text-slate-400 dark:hover:text-red-400 cursor-pointer rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Effacer</span>
                    </button>
                  )}
                </div>

                {recentItems.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
                    Aucun élément consulté récemment par {currentUser.name}.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {recentItems.map((item) => {
                      runningFlatIndex += 1;
                      const currentIdx = runningFlatIndex;
                      const isActive = activeIndex === currentIdx;
                      const badge = getResultStatusBadge(item);

                      return (
                        <button
                          key={`recent-${item.type}-${item.id}`}
                          ref={(el) => {
                            itemRefs.current[currentIdx] = el;
                          }}
                          type="button"
                          onMouseEnter={() => setActiveIndex(currentIdx)}
                          onClick={() => handleTriggerEntry({ kind: 'recent', item })}
                          className={`w-full min-h-[48px] p-3 rounded-xl text-left border transition flex items-start justify-between gap-3 cursor-pointer ${
                            isActive
                              ? 'bg-[var(--marque-clair)] dark:bg-slate-800 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] ring-2 ring-[#006B82]/25 dark:ring-[#38CAE6]/30'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="mt-0.5 shrink-0">{getCategoryIcon(item.type)}</div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="font-bold text-sm text-slate-900 dark:text-white break-words leading-snug">
                                {stripMarkTags(item.titre)}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300 break-words leading-snug">
                                {stripMarkTags(item.sous_titre)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <ArrowRight className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section Suggestions selon le rôle */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Sparkles className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span>Suggestions ({currentUser.role})</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {roleSuggestions.map((suggestion) => {
                    runningFlatIndex += 1;
                    const currentIdx = runningFlatIndex;
                    const isActive = activeIndex === currentIdx;

                    return (
                      <button
                        key={suggestion}
                        ref={(el) => {
                          itemRefs.current[currentIdx] = el;
                        }}
                        type="button"
                        onMouseEnter={() => setActiveIndex(currentIdx)}
                        onClick={() => handleTriggerEntry({ kind: 'suggestion', label: suggestion })}
                        className={`w-full min-h-[48px] px-3.5 py-3 rounded-xl text-left border transition flex items-center justify-between gap-3 cursor-pointer ${
                          isActive
                            ? 'bg-[var(--marque-clair)] dark:bg-slate-800 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] ring-2 ring-[#006B82]/25 dark:ring-[#38CAE6]/30'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Search className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                          <span className="font-bold text-sm text-slate-900 dark:text-white break-words leading-snug">
                            {suggestion}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0">
                          <span>Rechercher</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : expandedType ? (
            /* Vue "Voir tout" pour un type donné */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedType(null);
                    setPage(1);
                  }}
                  className="min-h-[48px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Retour aux résultats groupés</span>
                </button>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  {TYPE_LABELS[expandedType]} ({expandedTotal})
                </div>
              </div>

              {expandedElements.length === 0 && !loading ? (
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                  <p className="text-base font-extrabold text-slate-900 dark:text-white break-words">
                    Aucun résultat pour « {query.trim() || TYPE_LABELS[expandedType]} »
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {expandedElements.map((item) => {
                    runningFlatIndex += 1;
                    const currentIdx = runningFlatIndex;
                    const isActive = activeIndex === currentIdx;
                    const badge = getResultStatusBadge(item);

                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        ref={(el) => {
                          itemRefs.current[currentIdx] = el;
                        }}
                        type="button"
                        onMouseEnter={() => setActiveIndex(currentIdx)}
                        onClick={() => handleTriggerEntry({ kind: 'result', item })}
                        className={`w-full min-h-[48px] p-3.5 rounded-xl text-left border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer ${
                          isActive
                            ? 'bg-[var(--marque-clair)] dark:bg-slate-800 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] ring-2 ring-[#006B82]/25 dark:ring-[#38CAE6]/30'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="mt-0.5 shrink-0">{getCategoryIcon(item.type)}</div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-bold text-sm text-slate-900 dark:text-white break-words leading-snug">
                              {renderHighlightedText(item.titre, query)}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 break-words leading-snug">
                              {renderHighlightedText(item.sous_titre, query)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-8 sm:pl-0">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <ArrowRight className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {expandedTotalPages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[48px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-sm disabled:opacity-40 cursor-pointer"
                  >
                    Page précédente
                  </button>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Page {page} / {expandedTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= expandedTotalPages}
                    onClick={() => setPage((p) => Math.min(expandedTotalPages, p + 1))}
                    className="min-h-[48px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-sm disabled:opacity-40 cursor-pointer"
                  >
                    Page suivante
                  </button>
                </div>
              )}
            </div>
          ) : groups.length === 0 && !loading ? (
            /* Aucun résultat : "Aucun résultat pour « ... »" avec suggestions */
            <div className="p-5 sm:p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="text-center space-y-1.5">
                <div className="text-base font-extrabold text-slate-900 dark:text-white break-words">
                  Aucun résultat pour « {query.trim() || roleChips.find((c) => c.id === activeChip)?.label || ''} »
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 break-words">
                  Vérifiez l'orthographe ou essayez l'une des suggestions ci-dessous :
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Suggestions ({currentUser.role})
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {roleSuggestions.map((suggestion) => (
                    <button
                      key={`empty-sug-${suggestion}`}
                      type="button"
                      onClick={() => {
                        setActiveChip('');
                        setExpandedType(null);
                        setPage(1);
                        setQuery(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-[var(--marque-clair)] dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-left font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between gap-2 cursor-pointer transition"
                    >
                      <span className="break-words min-w-0">{suggestion}</span>
                      <ArrowRight className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {activeChip !== '' && (
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setActiveChip('')}
                    className="min-h-[48px] px-4 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-bold text-sm cursor-pointer transition"
                  >
                    Rechercher dans toutes les catégories
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Résultats groupés par type avec icône, titre, sous-titre, badge de statut et "Voir tout" par type */
            <div className="space-y-5">
              {groups.map((group) => {
                const visibleElements = activeChip ? group.elements : group.elements.slice(0, 5);
                return (
                  <div key={group.type} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {getCategoryIcon(group.type)}
                        <h3 className="font-extrabold text-sm text-slate-900 dark:text-white break-words">
                          {group.label || TYPE_LABELS[group.type]}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {group.total}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setExpandedType(group.type);
                          setPage(1);
                        }}
                        className="min-h-[48px] px-3 rounded-xl text-xs font-extrabold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] hover:bg-[var(--marque-clair)] dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0 cursor-pointer transition"
                      >
                        <span>Voir tout ({group.total})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      {visibleElements.map((item) => {
                        runningFlatIndex += 1;
                        const currentIdx = runningFlatIndex;
                        const isActive = activeIndex === currentIdx;
                        const badge = getResultStatusBadge(item);

                        return (
                          <button
                            key={`${item.type}-${item.id}`}
                            ref={(el) => {
                              itemRefs.current[currentIdx] = el;
                            }}
                            type="button"
                            onMouseEnter={() => setActiveIndex(currentIdx)}
                            onClick={() => handleTriggerEntry({ kind: 'result', item })}
                            className={`w-full min-h-[48px] p-3.5 rounded-xl text-left border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer ${
                              isActive
                                ? 'bg-[var(--marque-clair)] dark:bg-slate-800 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] ring-2 ring-[#006B82]/25 dark:ring-[#38CAE6]/30'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="mt-0.5 shrink-0">{getCategoryIcon(item.type)}</div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="font-bold text-sm text-slate-900 dark:text-white break-words leading-snug">
                                  {renderHighlightedText(item.titre, query)}
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-300 break-words leading-snug">
                                  {renderHighlightedText(item.sous_titre, query)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-8 sm:pl-0">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border whitespace-nowrap ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              <ArrowRight className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pied fixe avec aide navigation clavier et résumé */}
        <div
          className="shrink-0 px-3 sm:px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 font-medium">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px] inline-flex items-center">
                <ArrowUp className="w-3 h-3" />
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px] inline-flex items-center">
                <ArrowDown className="w-3 h-3" />
              </kbd>
              <span>Naviguer</span>
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px] inline-flex items-center gap-0.5">
                <CornerDownLeft className="w-3 h-3" /> Entrée
              </kbd>
              <span>Ouvrir</span>
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px]">
                Échap
              </kbd>
              <span>Fermer</span>
            </span>
          </div>

          {!isIdleEmptyState && (
            <div className="font-bold text-slate-800 dark:text-slate-200">
              {loading
                ? 'Recherche...'
                : `${totalResultsCount} résultat${totalResultsCount > 1 ? 's' : ''}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
