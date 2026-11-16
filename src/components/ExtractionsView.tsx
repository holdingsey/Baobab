import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  FileText,
  History,
} from 'lucide-react';
import { UserSession as User } from './LoginScreen';
import { FormModal } from './FormModal';
import { DataTable, DataTableColumn } from './DataTable';
import { InfoTooltip } from './InfoTooltip';
import { ensureUserAuthToken } from '../utils/pushNotifications';

export interface ExtractionDatasetMeta {
  key: string;
  title: string;
  description: string;
  category: 'Commercial & PDV' | 'Dépôt & Logistique' | 'Comptabilité & Finance' | 'Grossiste & Achats' | 'Catalogue & Fidélité' | 'Administration & Audit';
  hasDateRange: boolean;
  filterFields: Array<
    | 'vendor_id'
    | 'pdv_id'
    | 'payment_method'
    | 'status'
    | 'gamme'
    | 'fournisseur'
    | 'category'
    | 'client_id'
    | 'semester'
    | 'role'
    | 'q'
  >;
  statusOptions?: Array<{ value: string; label: string }>;
}

export const EXTRACTION_DATASETS_META: Record<string, ExtractionDatasetMeta> = {
  ventes: {
    key: 'ventes',
    title: 'Ventes (avec lignes)',
    description: 'Détail complet des ventes terrain ligne par ligne, produits, quantités, prix unitaires, vendeurs et PDV.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['vendor_id', 'pdv_id', 'payment_method', 'status', 'q'],
    statusOptions: [
      { value: 'livree', label: 'Livrée / Active' },
      { value: 'annulee', label: 'Annulée' },
    ],
  },
  factures_pdv: {
    key: 'factures_pdv',
    title: 'Factures PDV',
    description: 'Factures émises aux points de vente, montants encaissés, restes à payer et échéances.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['vendor_id', 'pdv_id', 'payment_method', 'status', 'q'],
    statusOptions: [
      { value: 'livree', label: 'Active' },
      { value: 'annulee', label: 'Annulée' },
    ],
  },
  annulations_vente: {
    key: 'annulations_vente',
    title: 'Annulations de vente',
    description: 'Historique des ventes et factures PDV annulées avec motifs, auteurs et dates.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['vendor_id', 'pdv_id', 'q'],
  },
  analyse_produits: {
    key: 'analyse_produits',
    title: 'Analyse produits',
    description: 'Volumes vendus, chiffre d’affaires généré, nombre de commandes et stock dépôt par produit.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['gamme', 'q'],
  },
  pdv: {
    key: 'pdv',
    title: 'Points de vente (PDV)',
    description: 'Répertoire des PDV, gérants, quartiers, coordonnées GPS, statut de validation et CA cumulé.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['vendor_id', 'status', 'q'],
    statusOptions: [
      { value: 'valide', label: 'Validé' },
      { value: 'en_attente', label: 'En attente' },
      { value: 'rejete', label: 'Rejeté' },
    ],
  },
  vendeurs: {
    key: 'vendeurs',
    title: 'Vendeurs & Performances',
    description: 'Liste des vendeurs terrain, équipes, nombre de ventes, CA livré, encaissements et versements.',
    category: 'Commercial & PDV',
    hasDateRange: false,
    filterFields: ['q'],
  },
  demandes_stock_vendeur: {
    key: 'demandes_stock_vendeur',
    title: 'Demandes de stock vendeur',
    description: 'Demandes de chargement camionnette initiées par les vendeurs ou la direction des ventes.',
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['vendor_id', 'status', 'q'],
    statusOptions: [
      { value: 'Demandée', label: 'Demandée' },
      { value: 'Validée', label: 'Validée' },
      { value: 'Partiellement validée', label: 'Partiellement validée' },
      { value: 'Chargée', label: 'Chargée' },
      { value: 'Rejetée', label: 'Rejetée' },
    ],
  },
  stock_depot: {
    key: 'stock_depot',
    title: 'Stock dépôt',
    description: 'État valorisé du stock au dépôt central, seuils d’alerte, quantités en cartons et statut.',
    category: 'Dépôt & Logistique',
    hasDateRange: false,
    filterFields: ['gamme', 'q'],
  },
  stock_et_mouvements: {
    key: 'stock_et_mouvements',
    title: 'Stock et mouvements',
    description: 'Journal complet des entrées et sorties de stock (réceptions, chargements, retours, pertes, bons).',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['status', 'q'],
    statusOptions: [
      { value: 'reception', label: 'Réception' },
      { value: 'chargement', label: 'Chargement' },
      { value: 'retour', label: 'Retour' },
      { value: 'perte_casse_peremption', label: 'Perte / Casse / Péremption' },
      { value: 'Bon cadeau', label: 'Bon cadeau' },
    ],
  },
  lots: {
    key: 'lots',
    title: 'Lots & FEFO',
    description: 'Traçabilité des lots en stock, dates de fabrication, dates de péremption et jours restants.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['gamme', 'q'],
  },
  receptions: {
    key: 'receptions',
    title: 'Réceptions fournisseurs',
    description: 'Entrées de marchandises au dépôt, bons de livraison fournisseurs, lots créés et valeurs FCFA.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['fournisseur', 'q'],
  },
  approvisionnements: {
    key: 'approvisionnements',
    title: 'Approvisionnements',
    description: 'Suivi consolidé des approvisionnements dépôt, fournisseurs, lots et valorisation.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['fournisseur', 'q'],
  },
  chargements: {
    key: 'chargements',
    title: 'Chargements camionnettes',
    description: 'Bons de chargement vendeurs, quantités demandées, quantités chargées FEFO et valorisation.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['vendor_id', 'status', 'q'],
    statusOptions: [
      { value: 'Demandée', label: 'Demandée' },
      { value: 'Validée', label: 'Validée' },
      { value: 'Partiellement validée', label: 'Partiellement validée' },
      { value: 'Chargée', label: 'Chargée' },
      { value: 'Rejetée', label: 'Rejetée' },
    ],
  },
  retours: {
    key: 'retours',
    title: 'Retours en stock',
    description: 'Retours de marchandises des vendeurs vers le dépôt central, états et motifs.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['vendor_id', 'q'],
  },
  inventaires: {
    key: 'inventaires',
    title: 'Inventaires',
    description: 'Comptages physiques du dépôt, stocks théoriques, stocks comptés et écarts constatés.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['q'],
  },
  inventaires_et_ecarts: {
    key: 'inventaires_et_ecarts',
    title: 'Inventaires et écarts',
    description: 'Analyse détaillée des écarts d’inventaire physique vs théorique et motifs de régularisation.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['q'],
  },
  pertes_et_peremptions: {
    key: 'pertes_et_peremptions',
    title: 'Pertes et péremptions',
    description: 'Sorties pour casse, avarie ou péremption de lots avec valorisation financière en FCFA.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['q'],
  },
  bons_a_remettre: {
    key: 'bons_a_remettre',
    title: 'Bons cadeaux à remettre',
    description: 'Bons cadeaux gagnés par les PDV en attente de préparation ou remis par le magasinier.',
    category: 'Dépôt & Logistique',
    hasDateRange: true,
    filterFields: ['status', 'semester', 'q'],
    statusOptions: [
      { value: 'gagne', label: 'Gagné (À préparer)' },
      { value: 'remis', label: 'Remis au PDV' },
    ],
  },
  versements: {
    key: 'versements',
    title: 'Versements vendeurs',
    description: 'Versements d’espèces et Mobile Money des vendeurs à la comptabilité (confirmés, en attente, rejetés).',
    category: 'Comptabilité & Finance',
    hasDateRange: true,
    filterFields: ['vendor_id', 'payment_method', 'status', 'q'],
    statusOptions: [
      { value: 'confirme', label: 'Confirmé' },
      { value: 'en_attente', label: 'En attente' },
      { value: 'rejete', label: 'Rejeté' },
    ],
  },
  soldes_vendeurs: {
    key: 'soldes_vendeurs',
    title: 'Soldes vendeurs',
    description: 'Situation comptable par vendeur : espèces encaissées, versements confirmés et reste à verser en caisse.',
    category: 'Comptabilité & Finance',
    hasDateRange: false,
    filterFields: ['vendor_id', 'q'],
  },
  factures: {
    key: 'factures',
    title: 'Factures (PDV & Grossistes)',
    description: 'Journal comptable unifié de toutes les factures clients PDV et commandes en gros facturées.',
    category: 'Comptabilité & Finance',
    hasDateRange: true,
    filterFields: ['payment_method', 'status', 'q'],
  },
  caisse: {
    key: 'caisse',
    title: 'Journal de caisse',
    description: 'Entrées et sorties de caisse (encaissements, dépenses, frais généraux, achats approuvés).',
    category: 'Comptabilité & Finance',
    hasDateRange: true,
    filterFields: ['category', 'payment_method', 'q'],
  },
  creances_pdv: {
    key: 'creances_pdv',
    title: 'Créances PDV',
    description: 'Factures à crédit ou paiement partiel avec restes à recouvrer, dates d’échéance et jours de retard.',
    category: 'Comptabilité & Finance',
    hasDateRange: true,
    filterFields: ['vendor_id', 'pdv_id', 'q'],
  },
  commandes_en_gros: {
    key: 'commandes_en_gros',
    title: 'Commandes en gros',
    description: 'Commandes des clients grossistes (brouillon, confirmée, préparée, livrée, facturée) avec lignes.',
    category: 'Grossiste & Achats',
    hasDateRange: true,
    filterFields: ['client_id', 'status', 'payment_method', 'q'],
    statusOptions: [
      { value: 'brouillon', label: 'Brouillon' },
      { value: 'confirmee', label: 'Confirmée' },
      { value: 'preparee', label: 'Préparée' },
      { value: 'livree', label: 'Livrée' },
      { value: 'facturee', label: 'Facturée' },
      { value: 'annulee', label: 'Annulée' },
    ],
  },
  commandes_en_gros_facturees: {
    key: 'commandes_en_gros_facturees',
    title: 'Commandes en gros facturées',
    description: 'État comptable des commandes en gros livrées ou facturées, encaissements et soldes.',
    category: 'Comptabilité & Finance',
    hasDateRange: true,
    filterFields: ['client_id', 'payment_method', 'q'],
  },
  clients_en_gros: {
    key: 'clients_en_gros',
    title: 'Clients en gros',
    description: 'Répertoire des clients grossistes, plafonds de crédit, encours, chiffre d’affaires et contacts.',
    category: 'Grossiste & Achats',
    hasDateRange: false,
    filterFields: ['q'],
  },
  demandes_achat: {
    key: 'demandes_achat',
    title: "Demandes d'achat",
    description: 'Demandes d’achat et de dépenses soumises par les services avec statuts et pièces justificatives.',
    category: 'Grossiste & Achats',
    hasDateRange: true,
    filterFields: ['category', 'status', 'q'],
    statusOptions: [
      { value: 'soumise', label: 'Soumise' },
      { value: 'approuvee', label: 'Approuvée' },
      { value: 'rejetee', label: 'Rejetée' },
      { value: 'payee', label: 'Payée / Décaissée' },
    ],
  },
  catalogue_et_prix: {
    key: 'catalogue_et_prix',
    title: 'Catalogue et prix',
    description: 'Référentiel des produits Baobab Distribution, gammes, conditionnements, prix carton et unité.',
    category: 'Catalogue & Fidélité',
    hasDateRange: false,
    filterFields: ['gamme', 'q'],
  },
  bons_cadeaux: {
    key: 'bons_cadeaux',
    title: 'Bons cadeaux',
    description: 'Programme de fidélité semestriel : cartes cadeaux attribuées, révélées et remises aux PDV.',
    category: 'Catalogue & Fidélité',
    hasDateRange: true,
    filterFields: ['status', 'semester', 'q'],
    statusOptions: [
      { value: 'a_gratter', label: 'À gratter' },
      { value: 'gagne', label: 'Gagné' },
      { value: 'remis', label: 'Remis' },
    ],
  },
  notes: {
    key: 'notes',
    title: 'Notes de fidélité PDV',
    description: 'Notes semestrielles sur 10 attribuées aux points de vente (volume, régularité, ponctualité).',
    category: 'Catalogue & Fidélité',
    hasDateRange: true,
    filterFields: ['semester', 'pdv_id', 'q'],
  },
  utilisateurs: {
    key: 'utilisateurs',
    title: 'Utilisateurs (sans secrets)',
    description: 'Comptes utilisateurs, matricules, rôles et équipes (sans aucun mot de passe ni jeton).',
    category: 'Administration & Audit',
    hasDateRange: false,
    filterFields: ['role', 'q'],
  },
  audit: {
    key: 'audit',
    title: "Journal d'audit",
    description: 'Traçabilité complète des opérations critiques, validations, extractions et modifications de droits.',
    category: 'Administration & Audit',
    hasDateRange: true,
    filterFields: ['role', 'q'],
  },
};

export function getDatasetMeta(key: string): ExtractionDatasetMeta {
  if (EXTRACTION_DATASETS_META[key]) {
    return EXTRACTION_DATASETS_META[key];
  }
  return {
    key,
    title: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    description: `Extraction structurée des données du jeu "${key}".`,
    category: 'Commercial & PDV',
    hasDateRange: true,
    filterFields: ['q'],
  };
}

// Helper to build headers with Bearer token
async function getExtractionAuthHeaders(currentUser?: User | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!currentUser) return headers;
  headers['x-user-id'] = currentUser.id;
  headers['x-user-role'] = currentUser.role;
  const token = await ensureUserAuthToken(currentUser.id, currentUser.role);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  return headers;
}

// Shared hook to check allowed datasets for current user's role
export function useExtractionPermissions(currentUser?: User | null) {
  const [allowedDatasets, setAllowedDatasets] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const isVendeur = !currentUser || currentUser.role === 'Vendeur';

  const fetchAllowed = useCallback(async () => {
    if (!currentUser || currentUser.role === 'Vendeur') {
      setAllowedDatasets([]);
      setLoading(false);
      return;
    }
    try {
      const headers = await getExtractionAuthHeaders(currentUser);
      const res = await fetch('/api/extractions/catalogue-autorise', { headers });
      if (!res.ok) {
        setAllowedDatasets([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.allowedDatasets)) {
        setAllowedDatasets(data.allowedDatasets);
      } else {
        setAllowedDatasets([]);
      }
    } catch {
      setAllowedDatasets([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    void fetchAllowed();
    const onPermissionsUpdated = () => {
      void fetchAllowed();
    };
    window.addEventListener('baobab:extraction-permissions-updated', onPermissionsUpdated);
    return () => {
      window.removeEventListener('baobab:extraction-permissions-updated', onPermissionsUpdated);
    };
  }, [fetchAllowed]);

  const canExport = useCallback(
    (jeu: string): boolean => {
      if (isVendeur) return false;
      // Check exact dataset or canonical equivalents
      if (allowedDatasets.includes(jeu)) return true;
      if (jeu === 'stock' && (allowedDatasets.includes('stock_depot') || allowedDatasets.includes('stock_et_mouvements'))) return true;
      if (jeu === 'inventaires' && allowedDatasets.includes('inventaires_et_ecarts')) return true;
      if (jeu === 'inventaires_et_ecarts' && allowedDatasets.includes('inventaires')) return true;
      if (jeu === 'factures_pdv' && allowedDatasets.includes('factures')) return true;
      if (jeu === 'factures' && allowedDatasets.includes('factures_pdv')) return true;
      if (jeu === 'commandes_en_gros' && allowedDatasets.includes('commandes_en_gros_facturees')) return true;
      return false;
    },
    [allowedDatasets, isVendeur]
  );

  const resolveAuthorizedDatasetKey = useCallback(
    (jeu: string): string => {
      if (allowedDatasets.includes(jeu)) return jeu;
      if (jeu === 'inventaires' && allowedDatasets.includes('inventaires_et_ecarts')) return 'inventaires_et_ecarts';
      if (jeu === 'inventaires_et_ecarts' && allowedDatasets.includes('inventaires')) return 'inventaires';
      if (jeu === 'stock_depot' && allowedDatasets.includes('stock_et_mouvements')) return 'stock_et_mouvements';
      if (jeu === 'factures_pdv' && allowedDatasets.includes('factures')) return 'factures';
      if (jeu === 'commandes_en_gros' && allowedDatasets.includes('commandes_en_gros_facturees')) return 'commandes_en_gros_facturees';
      return jeu;
    },
    [allowedDatasets]
  );

  return {
    allowedDatasets,
    loading,
    canExport,
    resolveAuthorizedDatasetKey,
    refreshPermissions: fetchAllowed,
  };
}

// Date shortcut helper
function computeDateShortcut(shortcut: 'today' | '7days' | 'month' | 'prev_month' | 'semester'): { du: string; au: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth(); // 0-indexed
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  if (shortcut === 'today') {
    const today = fmt(now);
    return { du: today, au: today };
  }
  if (shortcut === '7days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { du: fmt(start), au: fmt(now) };
  }
  if (shortcut === 'month') {
    const start = new Date(Date.UTC(yyyy, mm, 1));
    const end = new Date(Date.UTC(yyyy, mm + 1, 0));
    return { du: fmt(start), au: fmt(end) };
  }
  if (shortcut === 'prev_month') {
    const start = new Date(Date.UTC(yyyy, mm - 1, 1));
    const end = new Date(Date.UTC(yyyy, mm, 0));
    return { du: fmt(start), au: fmt(end) };
  }
  // 'semester'
  if (mm < 6) {
    return { du: `${yyyy}-01-01`, au: `${yyyy}-06-30` };
  }
  return { du: `${yyyy}-07-01`, au: `${yyyy}-12-31` };
}

export function formatExplicitExtractionFilename(
  jeu: string,
  du: string,
  au: string,
  format: 'csv' | 'xlsx' | 'pdf'
): string {
  const cleanJeu = String(jeu || 'extraction')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_');
  const today = new Date().toISOString().split('T')[0];
  const d1 = /^\d{4}-\d{2}-\d{2}$/.test(du) ? du : '';
  const d2 = /^\d{4}-\d{2}-\d{2}$/.test(au) ? au : '';
  if (d1 && d2) {
    return `baobab_${cleanJeu}_${d1}_${d2}.${format}`;
  }
  if (d1) {
    return `baobab_${cleanJeu}_depuis_${d1}.${format}`;
  }
  if (d2) {
    return `baobab_${cleanJeu}_jusquau_${d2}.${format}`;
  }
  return `baobab_${cleanJeu}_${today}.${format}`;
}

export interface SharedExtractionModalProps {
  currentUser: User;
  datasetKey: string;
  onClose: () => void;
  onSuccess?: () => void;
  initialDu?: string;
  initialAu?: string;
  initialFilters?: Record<string, any>;
}

export const SharedExtractionModal: React.FC<SharedExtractionModalProps> = ({
  currentUser,
  datasetKey,
  onClose,
  onSuccess,
  initialDu,
  initialAu,
  initialFilters,
}) => {
  const meta = getDatasetMeta(datasetKey);

  // Default period: current month if dataset uses dates
  const defaultPeriod = useMemo(() => computeDateShortcut('month'), []);
  const [du, setDu] = useState<string>(initialDu !== undefined ? initialDu : meta.hasDateRange ? defaultPeriod.du : '');
  const [au, setAu] = useState<string>(initialAu !== undefined ? initialAu : meta.hasDateRange ? defaultPeriod.au : '');
  const [activeShortcut, setActiveShortcut] = useState<string>(
    initialDu || initialAu ? 'custom' : meta.hasDateRange ? 'month' : 'all'
  );
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('xlsx');

  // Adapted filters state
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    if (initialFilters) {
      for (const [k, v] of Object.entries(initialFilters)) {
        if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 'all' && v !== 'tous') {
          base[k] = String(v).trim();
        }
      }
    }
    return base;
  });

  // Dynamic options for select filters (vendors, PDVs, gammes, wholesale clients)
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [pdvs, setPdvs] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [gammes, setGammes] = useState<string[]>([]);
  const [wholesaleClients, setWholesaleClients] = useState<Array<{ id: string; company_name: string; code: string }>>([]);

  // Row count estimation
  const [estimatedRows, setEstimatedRows] = useState<number | null>(null);
  const [estimating, setEstimating] = useState<boolean>(false);

  // Download progress & error state
  const [downloading, setDownloading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load filter reference lists when needed
    const loadRefs = async () => {
      try {
        if (meta.filterFields.includes('vendor_id')) {
          const r = await fetch('/api/users');
          const d = await r.json();
          if (d.users) {
            setVendors(d.users.filter((u: any) => u.role === 'Vendeur'));
          }
        }
        if (meta.filterFields.includes('pdv_id')) {
          const r = await fetch('/api/pdvs');
          const d = await r.json();
          if (d.pdvs) {
            setPdvs(d.pdvs);
          }
        }
        if (meta.filterFields.includes('gamme')) {
          const r = await fetch('/api/gammes');
          const d = await r.json();
          if (d.gammes) {
            setGammes(d.gammes);
          }
        }
        if (meta.filterFields.includes('client_id')) {
          const r = await fetch('/api/wholesale-clients', {
            headers: { 'x-user-role': currentUser.role, 'x-user-id': currentUser.id },
          });
          if (r.ok) {
            const d = await r.json();
            if (d.clients) setWholesaleClients(d.clients);
          }
        }
      } catch {
        // ignore reference load error
      }
    };
    void loadRefs();
  }, [datasetKey, currentUser.id, currentUser.role, meta.filterFields]);

  // Serialize non-empty filters
  const cleanFiltersObj = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v && v.trim() !== '' && v !== 'all' && v !== 'tous') {
        out[k] = v.trim();
      }
    }
    return out;
  }, [filters]);

  // Estimate row count whenever du, au, format, or filters change
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setEstimating(true);
      setErrorMessage(null);
      try {
        const headers = await getExtractionAuthHeaders(currentUser);
        const params = new URLSearchParams();
        params.set('format', format);
        if (du) params.set('du', du);
        if (au) params.set('au', au);
        if (Object.keys(cleanFiltersObj).length > 0) {
          params.set('filtres', JSON.stringify(cleanFiltersObj));
        }
        const res = await fetch(`/api/extractions/estimer/${encodeURIComponent(datasetKey)}?${params.toString()}`, {
          headers,
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.success) {
          const rowsCount = typeof data.estimatedRows === 'number' ? data.estimatedRows : 0;
          setEstimatedRows(rowsCount);
          if (format === 'pdf' && rowsCount > 5000) {
            setErrorMessage('Trop de lignes pour un PDF : réduisez la période ou choisissez CSV ou Excel');
          } else if (data.exceedsLimit && data.warning) {
            setErrorMessage(data.warning);
          }
        } else {
          setEstimatedRows(null);
          if (data.error) setErrorMessage(data.error);
        }
      } catch {
        if (!cancelled) setEstimatedRows(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [datasetKey, du, au, format, cleanFiltersObj, currentUser]);

  const applyShortcut = (key: 'today' | '7days' | 'month' | 'prev_month' | 'semester' | 'all') => {
    setActiveShortcut(key);
    setErrorMessage(null);
    if (key === 'all') {
      setDu('');
      setAu('');
      return;
    }
    const range = computeDateShortcut(key);
    setDu(range.du);
    setAu(range.au);
  };

  const explicitFilename = useMemo(
    () => formatExplicitExtractionFilename(datasetKey, du, au, format),
    [datasetKey, du, au, format]
  );

  const exceedsCurrentFormatLimit =
    estimatedRows !== null && (format === 'pdf' ? estimatedRows > 5000 : estimatedRows > 100000);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (downloading) return;

    if (du && au && du > au) {
      setErrorMessage('La date de début ("Du") ne peut pas être postérieure à la date de fin ("Au").');
      return;
    }

    if (format === 'pdf' && estimatedRows !== null && estimatedRows > 5000) {
      setErrorMessage('Trop de lignes pour un PDF : réduisez la période ou choisissez CSV ou Excel');
      return;
    }

    setDownloading(true);
    setProgressPercent(15);
    setErrorMessage(null);
    setSuccessMessage(null);

    const progressInterval = setInterval(() => {
      setProgressPercent((prev) => (prev < 85 ? prev + 12 : prev));
    }, 200);

    try {
      const headers = await getExtractionAuthHeaders(currentUser);
      const params = new URLSearchParams();
      params.set('format', format);
      if (du) params.set('du', du);
      if (au) params.set('au', au);
      if (Object.keys(cleanFiltersObj).length > 0) {
        params.set('filtres', JSON.stringify(cleanFiltersObj));
      }

      const res = await fetch(`/extractions/${encodeURIComponent(datasetKey)}?${params.toString()}`, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        clearInterval(progressInterval);
        setProgressPercent(0);
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.error ||
          (res.status === 403
            ? 'Accès refusé (403) : votre rôle ne dispose pas du droit d’extraction sur ce jeu de données.'
            : res.status === 429
            ? 'Limite atteinte : maximum 10 extractions par heure. Veuillez patienter avant de relancer.'
            : res.status === 413
            ? format === 'pdf'
              ? 'Trop de lignes pour un PDF : réduisez la période ou choisissez CSV ou Excel'
              : 'Volume supérieur à 100 000 lignes. Réduisez la période sélectionnée.'
            : `Erreur lors de la génération du fichier (${res.status}).`);
        setErrorMessage(msg);
        setDownloading(false);
        return;
      }

      setProgressPercent(92);
      const blob = await res.blob();
      const serverFilename = res.headers.get('X-Extraction-Filename') || explicitFilename;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = serverFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      clearInterval(progressInterval);
      setProgressPercent(100);
      setSuccessMessage(`Fichier "${serverFilename}" téléchargé avec succès.`);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      clearInterval(progressInterval);
      setProgressPercent(0);
      setErrorMessage(
        err instanceof Error
          ? `Erreur réseau lors du téléchargement : ${err.message}`
          : 'Impossible de contacter le serveur pour générer l’extraction.'
      );
    } finally {
      setDownloading(false);
    }
  };

  if (currentUser.role === 'Vendeur') {
    return null;
  }

  return (
    <FormModal
      title={`Extraire : ${meta.title}`}
      subtitle={meta.description}
      onClose={onClose}
      onSubmit={handleDownload}
      footerContent={
        <div className="w-full space-y-2.5">
          {/* Barre de progression lors du téléchargement */}
          {(downloading || progressPercent === 100) && (
            <div className="w-full space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>
                  {downloading ? 'Génération et téléchargement en flux...' : 'Téléchargement terminé'}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#15803D] transition-all duration-200 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Bouton vert "Télécharger" (48 px, pleine largeur) */}
          <button
            type="submit"
            disabled={downloading || exceedsCurrentFormatLimit}
            className="w-full h-[48px] px-5 rounded-[12px] bg-[#15803D] hover:bg-[#166534] text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5 shrink-0" />
            <span>
              {downloading
                ? 'Téléchargement en cours...'
                : `Télécharger (${format === 'xlsx' ? 'Excel' : format.toUpperCase()})`}
            </span>
          </button>
        </div>
      }
    >
      {/* 1. Raccourcis de période + Dates Du / Au */}
      <div className="space-y-3.5 w-full min-w-0">
        <div className="flex flex-col gap-2.5 w-full min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
            Période d&apos;extraction
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-2 flex-wrap w-full">
            {[
              { id: 'today', label: "Aujourd'hui" },
              { id: '7days', label: '7 jours' },
              { id: 'month', label: 'Mois' },
              { id: 'prev_month', label: 'Mois précédent' },
              { id: 'semester', label: 'Semestre' },
              { id: 'all', label: 'Tout' },
            ].map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => applyShortcut(sc.id as any)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center text-center ${
                  activeShortcut === sc.id
                    ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 w-full">
          <div className="flex flex-col gap-1.5 min-w-0 w-full">
            <label
              htmlFor="ext-date-du"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
            >
              Date de début (Du)
            </label>
            <input
              id="ext-date-du"
              type="date"
              value={du}
              onChange={(e) => {
                setDu(e.target.value);
                setActiveShortcut('custom');
              }}
              className="w-full block"
            />
          </div>
          <div className="flex flex-col gap-1.5 min-w-0 w-full">
            <label
              htmlFor="ext-date-au"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
            >
              Date de fin (Au)
            </label>
            <input
              id="ext-date-au"
              type="date"
              value={au}
              onChange={(e) => {
                setAu(e.target.value);
                setActiveShortcut('custom');
              }}
              className="w-full block"
            />
          </div>
        </div>
      </div>

      {/* 2. Filtres adaptés au jeu de données */}
      {meta.filterFields.length > 0 && (
        <div className="space-y-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-800 w-full min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Filter className="w-4 h-4 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
            Filtres adaptés ({meta.title})
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 w-full">
            {meta.filterFields.includes('vendor_id') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-vendor"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Vendeur
                </label>
                <select
                  id="ext-filter-vendor"
                  value={filters.vendor_id || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, vendor_id: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les vendeurs</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.filterFields.includes('pdv_id') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-pdv"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Point de Vente (PDV)
                </label>
                <select
                  id="ext-filter-pdv"
                  value={filters.pdv_id || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, pdv_id: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les PDV</option>
                  {pdvs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.filterFields.includes('client_id') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-client"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Client en gros
                </label>
                <select
                  id="ext-filter-client"
                  value={filters.client_id || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, client_id: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les clients en gros</option>
                  {wholesaleClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.filterFields.includes('gamme') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-gamme"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Gamme de produit
                </label>
                <select
                  id="ext-filter-gamme"
                  value={filters.gamme || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, gamme: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Toutes les gammes</option>
                  {gammes.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.filterFields.includes('payment_method') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-payment"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Mode de paiement
                </label>
                <select
                  id="ext-filter-payment"
                  value={filters.payment_method || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les modes</option>
                  <option value="especes">Espèces</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="credit">Crédit / À terme</option>
                  <option value="virement">Virement / Chèque</option>
                </select>
              </div>
            )}

            {meta.filterFields.includes('status') && meta.statusOptions && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-status"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Statut
                </label>
                <select
                  id="ext-filter-status"
                  value={filters.status || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les statuts</option>
                  {meta.statusOptions.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.filterFields.includes('fournisseur') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-fournisseur"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Fournisseur
                </label>
                <input
                  id="ext-filter-fournisseur"
                  type="text"
                  placeholder="Ex: Moulins du Mali..."
                  value={filters.fournisseur || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, fournisseur: e.target.value }))}
                  className="w-full block"
                />
              </div>
            )}

            {meta.filterFields.includes('category') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-category"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Catégorie
                </label>
                <input
                  id="ext-filter-category"
                  type="text"
                  placeholder="Ex: Carburant, Logistique..."
                  value={filters.category || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full block"
                />
              </div>
            )}

            {meta.filterFields.includes('semester') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-semester"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Semestre
                </label>
                <select
                  id="ext-filter-semester"
                  value={filters.semester || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, semester: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les semestres</option>
                  <option value="2026-S2">2026-S2</option>
                  <option value="2026-S1">2026-S1</option>
                  <option value="2025-S2">2025-S2</option>
                </select>
              </div>
            )}

            {meta.filterFields.includes('role') && (
              <div className="flex flex-col gap-1.5 min-w-0 w-full">
                <label
                  htmlFor="ext-filter-role"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Rôle utilisateur
                </label>
                <select
                  id="ext-filter-role"
                  value={filters.role || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full block"
                >
                  <option value="">Tous les rôles</option>
                  <option value="Administrateur">Administrateur</option>
                  <option value="Directeur des opérations de vente">DOV</option>
                  <option value="Sales Admin">Sales Admin / Contrôleur</option>
                  <option value="Gestionnaire grossiste">Gestionnaire grossiste</option>
                  <option value="Gestionnaire de stock">Magasinier</option>
                  <option value="Comptable">Comptable</option>
                  <option value="Vendeur">Vendeur</option>
                </select>
              </div>
            )}

            {meta.filterFields.includes('q') && (
              <div
                className={`flex flex-col gap-1.5 min-w-0 w-full ${
                  meta.filterFields.filter((f) => f !== 'q' && (f !== 'status' || Boolean(meta.statusOptions))).length % 2 === 0
                    ? 'sm:col-span-2'
                    : ''
                }`}
              >
                <label
                  htmlFor="ext-filter-q"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug"
                >
                  Recherche par mot-clé / référence
                </label>
                <input
                  id="ext-filter-q"
                  type="text"
                  placeholder="Référence, nom, code..."
                  value={filters.q || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                  className="w-full block"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Choix du format : "CSV", "Excel" ou "PDF" (trois boutons égaux de 48 px) */}
      <div className="space-y-2.5 pt-3.5 border-t border-slate-200 dark:border-slate-800 w-full min-w-0">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Format du fichier à générer
        </label>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full">
          <button
            type="button"
            onClick={() => setFormat('csv')}
            className={`h-[48px] min-h-[48px] w-full px-3 rounded-[10px] border font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
              format === 'csv'
                ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setFormat('xlsx')}
            className={`h-[48px] min-h-[48px] w-full px-3 rounded-[10px] border font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
              format === 'xlsx'
                ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setFormat('pdf')}
            className={`h-[48px] min-h-[48px] w-full px-3 rounded-[10px] border font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
              format === 'pdf'
                ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* 4. Nombre de lignes estimé & Nom de fichier explicite */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2 text-xs w-full min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">Nombre de lignes estimé :</span>
          <span className="font-black text-sm text-slate-900 dark:text-white">
            {estimating ? (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Calcul en cours...
              </span>
            ) : estimatedRows !== null ? (
              `${estimatedRows.toLocaleString('fr-FR')} ${estimatedRows > 1 ? 'lignes' : 'ligne'}`
            ) : (
              '—'
            )}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
          <span className="text-slate-500 dark:text-slate-400 font-semibold shrink-0">Nom du fichier :</span>
          <code className="font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 break-all">
            {explicitFilename}
          </code>
        </div>
      </div>

      {/* 5. Messages d'erreur ou de confirmation clairs en français */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-start gap-2.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{successMessage}</span>
        </div>
      )}
    </FormModal>
  );
};

/**
 * Bouton "Exporter" à placer dans les écrans de données du rôle.
 * Il ne s'affiche QUE si :
 * - Le rôle courant n'est PAS Vendeur
 * - Le rôle courant possède le droit d'extraction sur ce jeu dans la table `extraction_permissions`
 */
export interface ExportViewButtonProps {
  currentUser?: User | null;
  jeu: string;
  label?: string;
  du?: string;
  au?: string;
  filtres?: Record<string, any>;
  className?: string;
}

export const ExportViewButton: React.FC<ExportViewButtonProps> = ({
  currentUser,
  jeu,
  label = 'Exporter',
  du,
  au,
  filtres,
  className = '',
}) => {
  const { canExport, resolveAuthorizedDatasetKey } = useExtractionPermissions(currentUser);
  const [modalOpen, setModalOpen] = useState(false);

  if (!currentUser || currentUser.role === 'Vendeur') {
    return null;
  }

  if (!canExport(jeu)) {
    return null;
  }

  const resolvedKey = resolveAuthorizedDatasetKey(jeu);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0] dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 dark:border-emerald-700 text-[#15803D] dark:text-emerald-300 font-bold text-xs transition cursor-pointer shadow-2xs shrink-0 ${className}`}
        title={`Exporter la vue filtrée (${getDatasetMeta(resolvedKey).title})`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </button>

      {modalOpen && (
        <SharedExtractionModal
          currentUser={currentUser}
          datasetKey={resolvedKey}
          initialDu={du}
          initialAu={au}
          initialFilters={filtres}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
};

/**
 * Écran principal "Extractions" (visible pour tous les rôles sauf le Vendeur)
 */
export interface ExtractionsViewProps {
  currentUser: User;
}

interface ExtractionHistoryRow {
  id: string;
  user_id: string;
  user_code: string;
  user_name?: string;
  user_role: string;
  jeu: string;
  format: string;
  date_du: string | null;
  date_au: string | null;
  filtres_json: string | null;
  row_count: number;
  status: string;
  created_at: string;
}

export const ExtractionsView: React.FC<ExtractionsViewProps> = ({ currentUser }) => {
  const { allowedDatasets, loading: loadingPermissions } = useExtractionPermissions(currentUser);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [historyRows, setHistoryRows] = useState<ExtractionHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  const loadHistory = useCallback(async () => {
    if (!currentUser || currentUser.role === 'Vendeur') return;
    setLoadingHistory(true);
    try {
      const headers = await getExtractionAuthHeaders(currentUser);
      const res = await fetch('/api/extractions/historique', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setHistoryRows(data.history);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Le Vendeur n'a ni menu, ni écran, ni bouton
  if (!currentUser || currentUser.role === 'Vendeur') {
    return null;
  }

  // Deduplicate canonical dataset keys so we don't show duplicate alias cards
  const uniqueAuthorizedCards = useMemo(() => {
    const seen = new Set<string>();
    const list: ExtractionDatasetMeta[] = [];
    for (const key of allowedDatasets) {
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(getDatasetMeta(key));
    }
    return list;
  }, [allowedDatasets]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of uniqueAuthorizedCards) {
      cats.add(item.category);
    }
    return Array.from(cats);
  }, [uniqueAuthorizedCards]);

  const filteredCards = useMemo(() => {
    return uniqueAuthorizedCards.filter((card) => {
      if (categoryFilter !== 'all' && card.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          card.title.toLowerCase().includes(q) ||
          card.description.toLowerCase().includes(q) ||
          card.key.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [uniqueAuthorizedCards, categoryFilter, searchQuery]);

  const isAdmin = currentUser.role === 'Administrateur';

  const historyColumns = useMemo<DataTableColumn<ExtractionHistoryRow>[]>(() => {
    const cols: DataTableColumn<ExtractionHistoryRow>[] = [
      {
        key: 'created_at',
        header: 'Date & Heure',
        mobileLabel: 'Date',
        cell: (row) => (
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
            {new Date(row.created_at).toLocaleString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      },
      {
        key: 'jeu',
        header: 'Jeu de données',
        mobileLabel: 'Jeu',
        cell: (row) => {
          const meta = getDatasetMeta(row.jeu);
          return (
            <div>
              <div className="font-bold text-slate-900 dark:text-white">{meta.title}</div>
              <div className="text-[11px] font-mono text-slate-400">{row.jeu}</div>
            </div>
          );
        },
      },
    ];

    if (isAdmin) {
      cols.push({
        key: 'user',
        header: 'Utilisateur & Rôle',
        mobileLabel: 'Utilisateur',
        cell: (row) => (
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-200">
              {row.user_name || row.user_code} <span className="font-mono text-[11px] text-slate-400">({row.user_code})</span>
            </div>
            <div className="text-[11px] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-semibold">
              {row.user_role}
            </div>
          </div>
        ),
      });
    }

    cols.push(
      {
        key: 'periode',
        header: 'Période (Du / Au)',
        mobileLabel: 'Période',
        cell: (row) =>
          row.date_du || row.date_au ? (
            <span className="font-mono text-xs">
              {row.date_du || 'Début'} → {row.date_au || 'Fin'}
            </span>
          ) : (
            <span className="text-slate-400 italic">Toutes dates</span>
          ),
      },
      {
        key: 'format',
        header: 'Format',
        align: 'center',
        cell: (row) => {
          const fmt = String(row.format || '').toLowerCase();
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono font-bold text-[11px] uppercase ${
                fmt === 'xlsx'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                  : fmt === 'pdf'
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
              }`}
            >
              {fmt.toUpperCase()}
            </span>
          );
        },
      },
      {
        key: 'row_count',
        header: 'Lignes extraites',
        isNumeric: true,
        cell: (row) => (
          <span className="font-mono font-bold text-slate-900 dark:text-white">
            {Number(row.row_count || 0).toLocaleString('fr-FR')}
          </span>
        ),
      },
      {
        key: 'nom_fichier',
        header: 'Fichier généré',
        secondary: true,
        cell: (row) => {
          const fmt = String(row.format || '').toLowerCase();
          const ext: 'csv' | 'xlsx' | 'pdf' =
            fmt === 'csv' ? 'csv' : fmt === 'pdf' ? 'pdf' : 'xlsx';
          return (
            <code className="font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all">
              {formatExplicitExtractionFilename(
                row.jeu,
                row.date_du || '',
                row.date_au || '',
                ext
              )}
            </code>
          );
        },
      }
    );

    return cols;
  }, [isAdmin]);

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* En-tête de l'écran Extractions */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-[var(--marque-clair)] flex items-center justify-center text-[var(--marque-fonce)] shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                Centre d&apos;Extractions &amp; Exports Certifiés
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rôle actif : <strong className="text-slate-800 dark:text-slate-200">{currentUser.role}</strong> —{' '}
                <strong>{uniqueAuthorizedCards.length}</strong>{' '}
                {uniqueAuthorizedCards.length > 1 ? 'jeux de données autorisés' : 'jeu de données autorisé'}
              </p>
            </div>
          </div>
        </div>

        {/* Barre de recherche et filtre par catégorie */}
        <div
          className={`grid grid-cols-1 ${
            categories.length > 1 ? 'sm:grid-cols-2' : ''
          } xl:flex xl:items-center gap-3 w-full xl:w-auto`}
        >
          <input
            type="search"
            placeholder="Rechercher un jeu de données..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full xl:w-64 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[var(--marque-fonce)]"
          />
          {categories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full xl:w-64 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <option value="all">Toutes les catégories ({uniqueAuthorizedCards.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Grille des cartes de jeux autorisés pour le rôle */}
      {loadingPermissions ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
          Chargement des jeux de données autorisés pour votre rôle...
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Aucun jeu de données autorisé ne correspond à votre filtre.
          </p>
          <p className="text-xs text-slate-500">
            L&apos;Administrateur gère les droits d&apos;extraction par rôle dans Réglages &gt; Droits d&apos;extraction.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <div
              key={card.key}
              onClick={() => setSelectedDataset(card.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedDataset(card.key);
                }
              }}
              className="group p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#15803D] dark:hover:border-emerald-600 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4 cursor-pointer"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {card.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#15803D] dark:text-emerald-400">
                    CSV / XLSX / PDF
                  </span>
                </div>

                <h3 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-[#15803D] dark:group-hover:text-emerald-400 transition">
                  {card.title}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {card.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-mono">{card.key}</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#15803D] text-white font-bold text-xs group-hover:bg-[#166534] transition">
                  <Download className="w-3.5 h-3.5" />
                  <span>Configurer &amp; Extraire</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section Historique des extractions : l'Administrateur voit tout, les autres les leurs */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Historique des extractions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin
                  ? "Vue Administrateur : journal complet des extractions effectuées par tous les rôles."
                  : 'Vos extractions récentes (limitées à 10 extractions par heure).'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadHistory()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            <span>Actualiser l&apos;historique</span>
          </button>
        </div>

        <DataTable
          data={historyRows}
          columns={historyColumns}
          rowKey={(r) => r.id}
          mobileTitle={(r) => getDatasetMeta(r.jeu).title}
          mobileSubtitle={(r) =>
            new Date(r.created_at).toLocaleString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          }
          mobileBadge={(r) => (
            <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
              {r.format.toUpperCase()} • {Number(r.row_count || 0).toLocaleString('fr-FR')} lig.
            </span>
          )}
          emptyMessage={
            loadingHistory
              ? 'Chargement de l’historique des extractions...'
              : 'Aucune extraction enregistrée pour le moment.'
          }
          totalsFooter={
            <span>
              Total lignes extraites :{' '}
              <strong>
                {historyRows.reduce((acc, r) => acc + Number(r.row_count || 0), 0).toLocaleString('fr-FR')}
              </strong>
            </span>
          }
        />
      </div>

      {/* Modal partagé d'extraction au clic sur une carte */}
      {selectedDataset && (
        <SharedExtractionModal
          currentUser={currentUser}
          datasetKey={selectedDataset}
          onClose={() => setSelectedDataset(null)}
          onSuccess={() => void loadHistory()}
        />
      )}
    </div>
  );
};

/**
 * Réglages > Droits d'extraction (Administrateur seul) :
 * Tableau rôle par jeu avec cases à cocher, modifications journalisées.
 */
export interface ExtractionPermissionsMatrixProps {
  currentUser: User;
  hideHeader?: boolean;
}

const DISPLAY_ROLES: Array<{ key: string; label: string; badge: string; locked?: boolean }> = [
  { key: 'Administrateur', label: 'Administrateur', badge: 'BAO-ADM', locked: true },
  { key: 'Directeur des opérations de vente', label: 'DOV', badge: 'BAO-DOV' },
  { key: 'Sales Admin', label: 'Sales Admin / Contrôleur', badge: 'BAO-SAD' },
  { key: 'Gestionnaire grossiste', label: 'Gestionnaire grossiste', badge: 'BAO-GRS' },
  { key: 'Magasinier', label: 'Magasinier', badge: 'BAO-MAG' },
  { key: 'Comptable', label: 'Comptable', badge: 'BAO-CPT' },
  { key: 'Vendeur', label: 'Vendeur (403 strict)', badge: 'BAO-VND', locked: true },
];

const MATRIX_DATASETS: string[] = [
  'ventes',
  'factures_pdv',
  'annulations_vente',
  'analyse_produits',
  'pdv',
  'vendeurs',
  'demandes_stock_vendeur',
  'stock_depot',
  'stock_et_mouvements',
  'lots',
  'receptions',
  'approvisionnements',
  'chargements',
  'retours',
  'inventaires',
  'inventaires_et_ecarts',
  'pertes_et_peremptions',
  'bons_a_remettre',
  'versements',
  'soldes_vendeurs',
  'factures',
  'caisse',
  'creances_pdv',
  'commandes_en_gros',
  'commandes_en_gros_facturees',
  'clients_en_gros',
  'demandes_achat',
  'catalogue_et_prix',
  'bons_cadeaux',
  'notes',
  'utilisateurs',
  'audit',
];

export const ExtractionPermissionsMatrix: React.FC<ExtractionPermissionsMatrixProps> = ({
  currentUser,
  hideHeader = false,
}) => {
  const [permMap, setPermMap] = useState<Record<string, boolean>>({});
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; details: string; created_at: string; user_id: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [datasetQuery, setDatasetQuery] = useState<string>('');

  const loadMatrix = useCallback(async () => {
    if (currentUser.role !== 'Administrateur') return;
    setLoading(true);
    try {
      const headers = await getExtractionAuthHeaders(currentUser);
      const res = await fetch('/api/extractions/droits', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.permissions)) {
          const map: Record<string, boolean> = {};
          for (const row of data.permissions) {
            map[`${row.role}::${row.jeu}`] = Number(row.autorise) === 1;
          }
          setPermMap(map);
        }
        if (Array.isArray(data.auditLogs)) {
          setAuditLogs(data.auditLogs);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  if (currentUser.role !== 'Administrateur') {
    return null;
  }

  const isAllowed = (roleKey: string, jeu: string): boolean => {
    if (roleKey === 'Vendeur') return false;
    if (roleKey === 'Administrateur') return true;
    if (permMap[`${roleKey}::${jeu}`] !== undefined) {
      return permMap[`${roleKey}::${jeu}`];
    }
    if (roleKey === 'Directeur des opérations de vente' && permMap[`DOV::${jeu}`] !== undefined) {
      return permMap[`DOV::${jeu}`];
    }
    if (roleKey === 'Sales Admin' && permMap[`Sales Admin / Contrôleur::${jeu}`] !== undefined) {
      return permMap[`Sales Admin / Contrôleur::${jeu}`];
    }
    if (roleKey === 'Magasinier' && permMap[`Gestionnaire de stock::${jeu}`] !== undefined) {
      return permMap[`Gestionnaire de stock::${jeu}`];
    }
    return false;
  };

  const handleToggle = async (roleKey: string, jeu: string, nextValue: boolean) => {
    if (roleKey === 'Vendeur' || roleKey === 'Administrateur') return;
    const cellKey = `${roleKey}::${jeu}`;
    setSavingCell(cellKey);
    setFeedback(null);

    try {
      const headers = await getExtractionAuthHeaders(currentUser);
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/extractions/droits', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          role: roleKey,
          jeu,
          autorise: nextValue,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPermMap((prev) => ({
          ...prev,
          [cellKey]: nextValue,
        }));
        setFeedback({
          type: 'ok',
          text: `Droit "${getDatasetMeta(jeu).title}" ${nextValue ? 'accordé à' : 'retiré à'} ${roleKey} (modification journalisée).`,
        });
        window.dispatchEvent(new Event('baobab:extraction-permissions-updated'));
        void loadMatrix();
      } else {
        setFeedback({
          type: 'err',
          text: data.error || 'Erreur lors de la mise à jour du droit d’extraction.',
        });
      }
    } catch {
      setFeedback({
        type: 'err',
        text: 'Erreur réseau lors de la modification des droits.',
      });
    } finally {
      setSavingCell(null);
    }
  };

  const visibleRoles = DISPLAY_ROLES.filter((r) => roleFilter === 'ALL' || r.key === roleFilter);
  const filteredDatasets = MATRIX_DATASETS.filter((jeu) => {
    if (!datasetQuery.trim()) return true;
    const q = datasetQuery.trim().toLowerCase();
    const meta = getDatasetMeta(jeu);
    return (
      meta.title.toLowerCase().includes(q) ||
      jeu.toLowerCase().includes(q) ||
      meta.category.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className={
        hideHeader
          ? 'space-y-4 w-full max-w-full min-w-0'
          : 'p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 w-full max-w-full min-w-0'
      }
    >
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--marque-clair)] flex items-center justify-center text-[var(--marque-fonce)] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                Droits d&apos;extraction
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-snug">
                  Matrice des autorisations d&apos;export par rôle.
                </p>
                <InfoTooltip text="Cochez ou décochez les jeux autorisés pour chaque rôle. Toutes les modifications sont appliquées immédiatement en base et journalisées dans l'audit." />
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Filtres rapides : par rôle et par jeu de données */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Filtrer par rôle
          </label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white"
          >
            <option value="ALL">Tous les rôles ({DISPLAY_ROLES.length})</option>
            {DISPLAY_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} ({r.badge})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Rechercher un jeu de données
          </label>
          <input
            type="text"
            value={datasetQuery}
            onChange={(e) => setDatasetQuery(e.target.value)}
            placeholder="Ex: Stock, Lots, Ventes, Réceptions..."
            className="w-full h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Liste de cartes par jeu de données : aucune case à cocher ni colonne tronquée */}
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Chargement des droits d&apos;extraction...
        </div>
      ) : filteredDatasets.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Aucun jeu de données ne correspond à votre recherche.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDatasets.map((jeu) => {
            const meta = getDatasetMeta(jeu);
            return (
              <div
                key={jeu}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {meta.title}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {jeu}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                    {meta.category}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {visibleRoles.map((role) => {
                    const checked = isAllowed(role.key, jeu);
                    const isBusy = savingCell === `${role.key}::${jeu}`;
                    const isDisabled = Boolean(role.locked) || isBusy;
                    return (
                      <label
                        key={`${role.key}::${jeu}`}
                        className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition select-none ${
                          isDisabled
                            ? 'cursor-not-allowed opacity-75'
                            : 'cursor-pointer hover:border-[#15803D]'
                        } ${
                          checked
                            ? 'border-[#15803D]/50 bg-[#15803D]/8 dark:bg-[#15803D]/15'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                            {role.label}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {role.badge}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isDisabled}
                            onChange={(e) => void handleToggle(role.key, jeu, e.target.checked)}
                            aria-label={`Droit ${meta.title} pour ${role.label}`}
                            className="w-5 h-5 shrink-0 rounded accent-[#15803D] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Journal des modifications de droits d'extraction */}
      {auditLogs.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Journal des modifications de droits d&apos;extraction
          </h4>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {auditLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-3 text-xs flex-wrap"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200">{log.details}</span>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  {new Date(log.created_at).toLocaleString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton principal vert en bas de la section */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
        <button
          type="button"
          onClick={() => void loadMatrix()}
          disabled={loading}
          className="h-[48px] min-h-[48px] px-5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser les droits d&apos;extraction</span>
        </button>
      </div>
    </div>
  );
};
