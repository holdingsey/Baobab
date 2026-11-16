import React, { useState } from 'react';
import {
  TrendingUp,
  Package,
  FileText,
  DollarSign,
  Truck,
  Store,
  ArrowRight,
  ShieldCheck,
  Printer,
  CheckCircle2,
  Calendar,
  Layers,
  CheckSquare,
  Users,
  Clock,
  AlertTriangle,
  Gift,
  Compass,
  ChevronDown,
  PlusCircle,
  FileSpreadsheet,
  BarChart3,
  Download,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { InvoiceData } from './PrintableDocument';
import { UserSession } from './LoginScreen';
import { StockBadge } from './StockBadge';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { exportTableToCsv } from '../utils/csvExport';
import { AdaptiveAmount } from '../utils/formatAmount';
import { DataTable } from './DataTable';

interface DashboardViewProps {
  currentUser: UserSession;
  onOpenDocument: (doc: InvoiceData) => void;
  onNavigateTab: (tab: string) => void;
  logoUrl?: string;
  sales: any[];
  versements: any[];
  products: any[];
  pdvs: any[];
  chargements: any[];
  receptions?: any[];
  balances: any[];
  wholesaleClients?: any[];
  wholesaleOrders?: any[];
  anomalyAlerts?: any[];
  newAnomaliesCount?: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onOpenDocument,
  onNavigateTab,
  sales,
  versements,
  products,
  pdvs,
  chargements,
  receptions = [],
  balances,
  wholesaleClients = [],
  wholesaleOrders = [],
  anomalyAlerts = [],
  newAnomaliesCount = 0,
}) => {
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activePlusModal, setActivePlusModal] = useState<'cadeaux' | 'tournee' | null>(null);

  const role = currentUser.role;
  const isVendeur = role === 'Vendeur';
  const isMagasinier = role === 'Gestionnaire de stock' || role === 'Magasinier';
  const isSalesAdmin = role === 'Sales Admin';
  const isGrossiste = role === 'Gestionnaire grossiste' || /grossiste/i.test(role || '') || Boolean(currentUser?.code?.startsWith('BAO-GRS'));
  const isComptable = role === 'Comptable';
  const isAdmin = role === 'Administrateur';
  const isDirecteurOps = role === 'Directeur des opérations de vente' || /directeur|op[eé]ration|dov/i.test(role || '') || currentUser?.code === 'BAO-DOV';

  const activeWholesaleOrders = wholesaleOrders.filter((o) => o.delivery_status !== 'annulee');
  const totalWholesaleCA = activeWholesaleOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const totalWholesaleBoxes = activeWholesaleOrders.reduce((sum, o) => sum + (Number(o.total_boxes) || 0), 0);

  // Calculations
  const todayStr = '2026-10-26';
  const pendingPdvsCount = pdvs.filter((p) => p.status === 'en_attente').length;
  const activePdvsCount = pdvs.filter((p) => p.status === 'valide').length;
  const pendingReceptionsCount = receptions.filter((r) => r.status === 'en_attente').length;

  const activeSales = sales.filter((s) => s.status !== 'annulee');
  const cancelledSalesCount = sales.filter((s) => s.status === 'annulee').length;
  const pendingSaleCancelRequestsCount = sales.filter(
    (s) => s.cancel_request_status === 'en_attente' && s.status !== 'annulee'
  ).length;

  const totalSalesFCFA = activeSales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalVersementsFCFA = versements
    .filter((v) => v.status === 'valide')
    .reduce((sum, v) => sum + v.amount, 0);
  const totalBalanceDue = balances.reduce((sum, b) => sum + b.balanceDue, 0);
  const totalStockDepotBoxes = products.reduce((sum, p) => sum + p.stock_depot, 0);

  // Today sales
  const todaySales = activeSales.filter((s) => s.date === todayStr);
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.total_amount, 0);

  // Month sales (October 2026)
  const monthSalesTotal = activeSales
    .filter((s) => s.date.startsWith('2026-10'))
    .reduce((sum, s) => sum + s.total_amount, 0);

  // Vendor specific calculations
  const mySales = activeSales.filter((s) => s.vendor_id === currentUser.id);
  const mySalesTotal = mySales.reduce((sum, s) => sum + s.total_amount, 0);
  const myTodaySales = mySales.filter((s) => s.date === todayStr);
  const myTodaySalesTotal = myTodaySales.reduce((sum, s) => sum + s.total_amount, 0);
  const myBalance = balances.find((b) => b.vendorId === currentUser.id) || {
    balanceDue: 714600,
    stockVanValue: 1023000,
  };
  const myChargement = chargements.find((c) => c.vendor_id === currentUser.id && c.status !== 'Annulée');
  const myVanStockBoxes = (myChargement?.items || []).reduce(
    (acc: number, it: any) => acc + (it.qtyBoxes || 0),
    0
  );
  const myPdvsVisitedCount = new Set(mySales.map((s) => s.pdv_id)).size;

  // Pending versements count
  const pendingVersementsCount = versements.filter((v) => v.status === 'en_attente').length;

  // Chart view mode toggle ('bar' | 'area')
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [reportMonthFilter, setReportMonthFilter] = useState<string>('2026-10');

  const handleExportMonthlySalesCsv = () => {
    const filtered =
      reportMonthFilter === 'ALL'
        ? sales
        : sales.filter((s) => String(s.date || '').startsWith(reportMonthFilter));
    exportTableToCsv({
      filename: `reporting_ventes_${reportMonthFilter === 'ALL' ? 'global' : reportMonthFilter}.csv`,
      columns: [
        'N° Vente',
        'N° Facture PDV',
        'Date',
        'Point de Vente',
        'Quartier',
        'Nom Vendeur',
        'Code Vendeur',
        'Total Cartons',
        'Detail Produits',
        'Mode de Reglement',
        'Statut',
        'Montant Total (FCFA)',
      ],
      rows: filtered.map((s) => {
        const itemsList = Array.isArray(s.items) ? s.items : [];
        const boxes = itemsList.reduce((acc: number, it: any) => acc + Number(it.qtyBoxes || 0), 0);
        const detail = itemsList.map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(' | ');
        const invNo = s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`;
        return [
          s.number || s.id,
          invNo,
          s.date || '',
          s.pdv_name || '',
          s.pdv_neighborhood || '',
          s.vendor_name || '',
          s.vendor_code || '',
          boxes,
          detail,
          s.payment_type || 'Comptant',
          s.status === 'annulee' ? 'Annulee' : 'Validee',
          Number(s.total_amount || 0),
        ];
      }),
    });
  };

  const handleExportMonthlyStocksCsv = () => {
    exportTableToCsv({
      filename: `reporting_stocks_depot_${reportMonthFilter === 'ALL' ? 'global' : reportMonthFilter}.csv`,
      columns: [
        'Code SKU',
        'Designation Produit',
        'Gamme',
        'Conditionnement',
        'Unites par Carton',
        'Prix Carton (FCFA)',
        'Stock Depot (Cartons)',
        'Stock Depot (Unites)',
        'Seuil Alerte (Cartons)',
        'Statut Stock',
        'Valeur Stock (FCFA)',
      ],
      rows: products.map((p) => {
        const stockCtn = Number(p.stock_depot || 0);
        const threshold = Number(p.threshold_depot || 0);
        const statusLabel = stockCtn <= 0 ? 'Rupture' : stockCtn <= threshold ? 'Stock Bas' : 'Normal';
        return [
          p.code,
          p.name,
          p.gamme || '',
          p.packaging || '',
          Number(p.units_per_box || 12),
          Number(p.price_box || 0),
          stockCtn,
          stockCtn * Number(p.units_per_box || 12),
          threshold,
          statusLabel,
          stockCtn * Number(p.price_box || 0),
        ];
      }),
    });
  };

  const handleExportMonthlyVersementsCsv = () => {
    const filtered =
      reportMonthFilter === 'ALL'
        ? versements
        : versements.filter((v) => String(v.date || '').startsWith(reportMonthFilter));
    exportTableToCsv({
      filename: `reporting_versements_${reportMonthFilter === 'ALL' ? 'global' : reportMonthFilter}.csv`,
      columns: [
        'Reference Versement',
        'Date',
        'Nom Vendeur',
        'Code Vendeur',
        'Mode de Reglement',
        'Motif / Notes',
        'Statut Validation',
        'Montant Encaisse (FCFA)',
      ],
      rows: filtered.map((v) => [
        v.reference || v.id,
        v.date || '',
        v.vendor_name || '',
        v.vendor_code || '',
        v.payment_mode || 'Especes',
        v.notes || 'Versement de caisse des ventes PDV',
        v.status === 'en_attente' ? 'En attente' : 'Valide en Caisse',
        Number(v.amount || 0),
      ]),
    });
  };

  // 7-day daily sales data for Admin, Sales Admin, Comptable (all active sales) and Vendeur (mySales)
  const relevantSales = isVendeur ? mySales : activeSales;
  const latestSaleDateStr = sales.reduce(
    (maxDate: string, s: any) => (s.date && s.date > maxDate ? s.date : maxDate),
    todayStr
  );

  const dailySales7Days = React.useMemo(() => {
    const anchor = new Date(`${latestSaleDateStr}T12:00:00Z`);
    const days: {
      date: string;
      label: string;
      fullDateLabel: string;
      montant: number;
      ventes: number;
      cartons: number;
    }[] = [];

    const dayNamesShort = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const monthNamesShort = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(anchor.getUTCDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dayLabel = `${dayNamesShort[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
      const fullLabel = `${dayNamesShort[d.getUTCDay()]} ${d.getUTCDate()} ${monthNamesShort[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

      const daySales = relevantSales.filter((s: any) => s.date === isoDate);
      const montant = daySales.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0);
      const cartons = daySales.reduce((sum: number, s: any) => {
        const itemsList = Array.isArray(s.items) ? s.items : [];
        return sum + itemsList.reduce((acc: number, it: any) => acc + (Number(it.qtyBoxes) || 0), 0);
      }, 0);

      days.push({
        date: isoDate,
        label: dayLabel,
        fullDateLabel: fullLabel,
        montant,
        ventes: daySales.length,
        cartons,
      });
    }
    return days;
  }, [relevantSales, latestSaleDateStr]);

  const total7DaysFCFA = dailySales7Days.reduce((acc, d) => acc + d.montant, 0);
  const avg7DaysFCFA = Math.round(total7DaysFCFA / 7);
  const total7DaysVentes = dailySales7Days.reduce((acc, d) => acc + d.ventes, 0);
  const total7DaysCartons = dailySales7Days.reduce((acc, d) => acc + d.cartons, 0);

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {/* 
        ROLE-SPECIFIC BANNER (Le bandeau dépend du rôle, jamais celui du Vendeur par défaut)
      */}
      {/* 
        ROLE-SPECIFIC BANNER (Fond de carte du thème, pastille de rôle en couleur de marque texte blanc, compact 390x700)
      */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 sm:p-5 text-slate-900 dark:text-slate-100 shadow-xs relative border border-slate-200 dark:border-slate-800">
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 min-w-0">
          <div className="space-y-1.5 max-w-2xl min-w-0 w-full">
            {/* Pastille de rôle (couleur de marque, texte blanc, contraste >= 4,5:1) */}
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] shadow-xs">
              {isAdmin && <span>Administrateur</span>}
              {isDirecteurOps && <span>Directeur des opérations</span>}
              {isSalesAdmin && <span>Sales Admin</span>}
              {isGrossiste && <span>Gestionnaire grossiste</span>}
              {isMagasinier && <span>Magasinier</span>}
              {isComptable && <span>Comptable</span>}
              {isVendeur && <span>Vendeur</span>}
            </div>

            {/* Titre d'accueil */}
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight break-words">
              Bonjour, {currentUser.name}
            </h1>

            {/* Description d'accueil par rôle (1 ligne de 60 caractères maximum, jamais celle d'un autre rôle) */}
            <p className="text-[14px] leading-snug text-slate-600 dark:text-slate-300 font-medium whitespace-normal break-words">
              {isAdmin
                ? "Vue d'ensemble : ventes, stocks et validations."
                : isDirecteurOps
                ? "Ventes, PDV et équipes terrain."
                : isSalesAdmin
                ? "Contrôle : réceptions, inventaires et retours."
                : isGrossiste
                ? "Commandes et clients en gros."
                : isMagasinier
                ? "Dépôt : réceptions, chargements et lots."
                : isComptable
                ? "Caisse : versements, soldes et factures."
                : "Vos ventes, votre stock et vos versements."}
            </p>
          </div>

          {/* Boutons d'accueil : grille de 2 colonnes, icône au-dessus du libellé, 1 à 2 lignes jamais coupé, hauteur auto avec min 72 px */}
          <div className="grid grid-cols-2 gap-2.5 w-full lg:w-auto max-w-full min-w-0">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('ventes')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <BarChart3 className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Ventes</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('validation-pdv')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <CheckSquare className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Valider PDV</span>
                  {pendingPdvsCount > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {pendingPdvsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('receptions')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Réceptions</span>
                  {pendingReceptionsCount > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {pendingReceptionsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('chargements')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Truck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Chargements</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('versements')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <DollarSign className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Versements</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('utilisateurs')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Users className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Utilisateurs</span>
                </button>
              </>
            )}

            {isGrossiste && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('nouvelle-commande-gros')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <PlusCircle className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">+ Commande</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('commandes-gros')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Layers className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Commandes</span>
                  {activeWholesaleOrders.length > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {activeWholesaleOrders.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('clients-gros')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Store className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Clients</span>
                  {wholesaleClients.length > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {wholesaleClients.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('stock-depot')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Stock dépôt</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('catalogue')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <FileText className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Catalogue</span>
                </button>
              </>
            )}

            {isDirecteurOps && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('ventes')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <BarChart3 className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Ventes</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('demandes-annulation-vente')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <AlertTriangle className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Annulations</span>
                  {pendingSaleCancelRequestsCount > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {pendingSaleCancelRequestsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('validation-pdv')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <CheckSquare className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Valider PDV</span>
                  {pendingPdvsCount > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {pendingPdvsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('demande-stock-vendeur')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Truck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Stock vendeur</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('pdvs')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Store className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">PDV</span>
                </button>
              </>
            )}

            {isSalesAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('receptions')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <CheckSquare className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Réceptions</span>
                  {pendingReceptionsCount > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {pendingReceptionsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('chargements')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Truck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Chargements</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('ventes')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <BarChart3 className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Ventes</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('inventaire')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <CheckCircle2 className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Inventaires</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('stock-depot')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Stock dépôt</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('lots')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Layers className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Lots</span>
                </button>
              </>
            )}

            {isMagasinier && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('chargements')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <Truck className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Chargements</span>
                  {chargements.length > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {chargements.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('receptions')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Réceptions</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('retours')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <ArrowRight className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Retours</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('inventaire')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <CheckSquare className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Inventaire</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('lots')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Layers className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Lots</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('bons-a-remettre')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Gift className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Bons cadeaux</span>
                </button>
              </>
            )}

            {isComptable && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('versements')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <DollarSign className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Versements</span>
                  {versements.length > 0 && (
                    <span className="absolute -top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black flex items-center justify-center leading-none shadow-xs pointer-events-none z-10">
                      {versements.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('soldes-vendeurs')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Users className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Soldes vendeurs</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('factures')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <FileText className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Factures</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('caisse')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <DollarSign className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Caisse</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('rapports')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <BarChart3 className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Rapports</span>
                </button>
              </>
            )}

            {isVendeur && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('nouvelle-vente')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] border border-[var(--marque-fonce)] font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 shadow-xs transition cursor-pointer text-center leading-snug"
                >
                  <PlusCircle className="w-5 h-5 shrink-0" />
                  <span className="whitespace-normal break-words">Nouvelle vente</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('mon-chargement')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Truck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Mon chargement</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('nouveau-pdv')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Store className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Nouveau PDV</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('mon-stock')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Mon stock</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('mon-solde')}
                  className="relative w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                >
                  <DollarSign className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span className="whitespace-normal break-words">Mon solde</span>
                </button>

                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className="w-full min-w-0 min-h-[72px] h-auto py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center leading-snug"
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0 transition-transform duration-200 ${
                        showPlusMenu ? 'rotate-180' : ''
                      }`}
                    />
                    <span className="whitespace-normal break-words">Plus</span>
                  </button>

                  {showPlusMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
                        onClick={() => setShowPlusMenu(false)}
                      />

                      <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center p-3 pointer-events-none">
                        <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 text-slate-800 dark:text-slate-100 space-y-3 pointer-events-auto">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[var(--marque-fonce)]" />
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                Options Vendeur
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowPlusMenu(false)}
                              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowPlusMenu(false);
                                setActivePlusModal('cadeaux');
                              }}
                              className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-[var(--marque-clair)] border border-slate-200 dark:border-slate-700/60 flex items-center gap-3 transition cursor-pointer group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] flex items-center justify-center shrink-0 shadow-xs">
                                <Gift className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  Mes cadeaux
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Échantillons et fidélité PDV.
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setShowPlusMenu(false);
                                setActivePlusModal('tournee');
                              }}
                              className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-[var(--marque-clair)] border border-slate-200 dark:border-slate-700/60 flex items-center gap-3 transition cursor-pointer group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] flex items-center justify-center shrink-0 shadow-xs">
                                <Compass className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  Ma tournée
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Itinéraire et points de vente.
                                </div>
                              </div>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowPlusMenu(false)}
                            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer text-center"
                          >
                            Fermer
                          </button>
                        </div>
                      </div>

                      <div className="hidden sm:block absolute right-0 top-full mt-2 w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-2 text-xs text-slate-800 dark:text-slate-100">
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                          Options Vendeur
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPlusMenu(false);
                            setActivePlusModal('cadeaux');
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 font-medium transition cursor-pointer text-slate-700 dark:text-slate-200"
                        >
                          <Gift className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">Mes cadeaux</div>
                            <div className="text-[10px] text-slate-400">Échantillons et fidélité PDV.</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPlusMenu(false);
                            setActivePlusModal('tournee');
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 font-medium transition cursor-pointer text-slate-700 dark:text-slate-200"
                        >
                          <Compass className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">Ma tournée</div>
                            <div className="text-[10px] text-slate-400">Itinéraire et points de vente.</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* BLOC "À TRAITER" DU TABLEAU DE BORD (Détection d'anomalies — jamais pour Vendeur) */}
      {(isAdmin || isDirecteurOps || isSalesAdmin || isComptable || isMagasinier) && (
        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-[#DC2626] dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    À traiter
                  </h2>
                  {newAnomaliesCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black text-white shadow-xs"
                      style={{ backgroundColor: '#DC2626' }}
                      title={`${newAnomaliesCount} nouvelle(s) alerte(s)`}
                    >
                      {newAnomaliesCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Détection d&apos;anomalies ({isComptable ? 'Caisse et versements' : isMagasinier ? 'Stock et lots' : 'Commerciales et stock'}) &bull; Aide à la décision non bloquante.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('alertes')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              <span>Voir toutes les alertes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {(() => {
            const pendingAnomalies = anomalyAlerts.filter(
              (a) => a.status === 'Nouvelle' || a.status === 'En examen'
            );
            if (pendingAnomalies.length === 0) {
              return (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center gap-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Aucune anomalie nouvelle ou en examen à traiter pour votre périmètre.</span>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingAnomalies.slice(0, 6).map((alert) => {
                  const isCritique = alert.severity === 'Critique';
                  const isAttention = alert.severity === 'Attention';
                  return (
                    <div
                      key={alert.id}
                      onClick={() => onNavigateTab('alertes')}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                        isCritique
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/70 hover:border-rose-400'
                          : isAttention
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/70 hover:border-amber-400'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isCritique
                                ? 'bg-[#DC2626] text-white'
                                : isAttention
                                ? 'bg-amber-500 text-white'
                                : 'bg-sky-600 text-white'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            {alert.status}
                          </span>
                        </div>
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                          {alert.type_label}
                        </div>
                        <div className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 leading-snug">
                          {alert.target_label}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                          {alert.explanation}
                        </p>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium whitespace-normal break-words min-w-0 flex-1">
                          {Array.isArray(alert.measured_values)
                            ? alert.measured_values
                                .slice(0, 2)
                                .map((m: any) => `${m.label} : ${m.value}`)
                                .join(' • ')
                            : String(alert.measured_values || '')}
                        </span>
                        <span className="font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0">
                          Examiner &rarr;
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* 
        ROLE-SPECIFIC KPIS
      */}

      {/* 1. KPIS & VUE GLOBALE DES OPÉRATIONS — ADMINISTRATEUR */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div
              onClick={() => onNavigateTab('ventes')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">Ventes du jour</span>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                <AdaptiveAmount amount={todaySalesTotal} unit="FCFA" unitClassName="text-[10px] text-teal-600 font-bold" />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">{todaySales.length} livraisons &bull; Voir tout</span>
            </div>

            <div
              onClick={() => onNavigateTab('ventes')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">Chiffre d&apos;affaires</span>
              <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1">
                <AdaptiveAmount amount={totalSalesFCFA} unit="FCFA" unitClassName="text-[10px] font-bold" />
              </div>
              <span className="text-[10px] text-teal-600 font-semibold mt-0.5 block">Cumul des ventes validées</span>
            </div>

            <div
              onClick={() => onNavigateTab('receptions')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">Stock & Réceptions</span>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                <AdaptiveAmount amount={totalStockDepotBoxes} unit="cartons" unitClassName="text-[10px] text-slate-500 font-bold" />
              </div>
              <span className="text-[10px] text-emerald-600 mt-0.5 block">
                {pendingReceptionsCount > 0 ? `${pendingReceptionsCount} réception(s) à valider` : 'Dépôt Sotuba →'}
              </span>
            </div>

            <div
              onClick={() => onNavigateTab('versements')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">Encaissé Caisse</span>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                <AdaptiveAmount amount={totalVersementsFCFA} unit="FCFA" unitClassName="text-[10px] font-bold" />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {pendingVersementsCount > 0 ? `${pendingVersementsCount} en attente` : 'Validé en caisse'}
              </span>
            </div>

            <div
              onClick={() => onNavigateTab('chargements')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">À verser & Appro.</span>
              <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                <AdaptiveAmount amount={totalBalanceDue} unit="FCFA" unitClassName="text-[10px] font-bold" />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">{chargements.length} chargements suivis</span>
            </div>

            <div
              onClick={() => onNavigateTab('validation-pdv')}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-teal-400 transition cursor-pointer"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">PDV & Réseau</span>
              <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1 baobab-amount">
                {activePdvsCount} / {pdvs.length}
              </div>
              <span className="text-[10px] text-teal-600 mt-0.5 block">
                {pendingPdvsCount > 0 ? `${pendingPdvsCount} PDV à valider` : 'Tous les PDV actifs'}
              </span>
            </div>
          </div>

          {/* Reporting Mensuel — Export CSV (Ventes, Stocks, Versements) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--marque-fonce)] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>Rapports mensuels (Export CSV)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center">
                    <span>Exportez les ventes, stocks et versements en CSV.</span>
                    <InfoTooltip text="Téléchargez en un clic les tableaux de données (Ventes, Stocks, Versements) au format CSV UTF-8 avec séparateur point-virgule pour Excel." />
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={reportMonthFilter}
                  onChange={(e) => setReportMonthFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                  aria-label="Période de reporting mensuel"
                >
                  <option value="2026-10">Octobre 2026 (Mois en cours)</option>
                  <option value="2026-09">Septembre 2026</option>
                  <option value="2026-08">Août 2026</option>
                  <option value="2026-07">Juillet 2026</option>
                  <option value="2026-06">Juin 2026</option>
                  <option value="2026-05">Mai 2026</option>
                  <option value="ALL">Toute la période (6 mois)</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportMonthlySalesCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exporter Ventes (CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMonthlyStocksCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Exporter Stocks (CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMonthlyVersementsCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Exporter Versements (CSV)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. KPIS MAGASINIER:
          (stock dépôt, chargements en attente, lots à risque, retours à confirmer)
      */}
      {isMagasinier && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Stock dépôt central</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={totalStockDepotBoxes} unit="cartons" unitClassName="text-xs text-slate-500 font-bold" />
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Couverture : 30-45 jours</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Chargements en attente</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
              <AdaptiveAmount amount={chargements.length} unit="camionnettes" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Dépôt-vente 3-7 jours</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Lots à risque</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={0} unit="lot" unitClassName="text-xs font-bold text-emerald-600" />
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Péremptions conformes</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Retours à confirmer</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={0} unit="retour" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Aucune avarie en attente</span>
          </div>
        </div>
      )}

      {/* 2B. KPIS SALES ADMIN (CONTRÔLEUR):
          (réceptions à valider, approvisionnements actifs, ventes contrôlées, stock dépôt & inventaires)
      */}
      {isSalesAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigateTab('receptions')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Réceptions à valider</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
              <AdaptiveAmount amount={pendingReceptionsCount} unit="en attente" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-teal-600 font-semibold mt-1 block">
              Soumises par le Gestionnaire de stock
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('chargements')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Approvisionnements</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={chargements.filter((c) => c.status !== 'Annulée').length} unit="actifs" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              Contrôle &amp; annulation autorisés
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('ventes')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Ventes &amp; Annulations</span>
            <div className="text-2xl font-black text-teal-700 dark:text-teal-400 mt-2">
              <AdaptiveAmount amount={activeSales.length} unit="actives" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1 block">
              {cancelledSalesCount} vente(s) annulée(s)
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('inventaire')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Stock Dépôt &amp; Inventaires</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={totalStockDepotBoxes} unit="cartons" unitClassName="text-xs text-slate-500 font-bold" />
            </div>
            <span className="text-xs text-emerald-600 font-semibold mt-1 block">
              Gérer les inventaires vendeurs &amp; dépôt
            </span>
          </div>
        </div>
      )}

      {/* 2B-BIS. KPIS GESTIONNAIRE GROSSISTE */}
      {isGrossiste && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigateTab('commandes-gros')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Chiffre d&apos;affaires Gros</span>
            <div className="text-2xl font-black text-teal-700 dark:text-teal-400 mt-2">
              <AdaptiveAmount amount={totalWholesaleCA} unit="FCFA" unitClassName="text-xs font-bold" />
            </div>
            <span className="text-xs text-teal-600 font-semibold mt-1 block">
              {activeWholesaleOrders.length} commandes en gros actives &rarr;
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('commandes-gros')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Volume Vendu en Gros</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={totalWholesaleBoxes} unit="cartons" unitClassName="text-xs font-bold text-emerald-600" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">
              Expéditions grossistes &amp; demi-grossistes
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('clients-gros')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Clients en Gros</span>
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
              <AdaptiveAmount amount={wholesaleClients.length} unit="clients" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-teal-600 font-semibold mt-1 block">
              Gérer la liste des clients en gros &rarr;
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('stock-depot')}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-xs font-bold uppercase text-slate-400">Stock Dépôt Central</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={totalStockDepotBoxes} unit="cartons" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-emerald-600 font-semibold mt-1 block">
              Disponible pour commandes en gros
            </span>
          </div>
        </div>
      )}

      {/* 2C. KPIS DIRECTEUR DES OPÉRATIONS DE VENTE:
          (CA global vendeurs, Historique SKU, Validation PDV, Demandes de stock vendeurs, Factures PDV)
      */}
      {isDirecteurOps && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div
            onClick={() => onNavigateTab('ventes')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Ventes globales vendeurs</span>
            <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1">
              <AdaptiveAmount amount={totalSalesFCFA} unit="FCFA" unitClassName="text-[10px] font-bold" />
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              {activeSales.length} ventes ({todaySales.length} aujourd&apos;hui)
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('catalogue')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Produits suivis</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              <AdaptiveAmount amount={products.length} unit="références" unitClassName="text-[10px] text-teal-600 font-bold" />
            </div>
            <span className="text-[10px] text-teal-600 font-semibold mt-0.5 block">
              Catalogue officiel &rarr;
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('validation-pdv')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Créations PDV à valider</span>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
              <AdaptiveAmount amount={pendingPdvsCount} unit="en attente" unitClassName="text-[10px] font-bold text-slate-500" />
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              {activePdvsCount} PDV validés actifs
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('demande-stock-vendeur')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Demande stock vendeur</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              <AdaptiveAmount amount={chargements.filter((c) => c.status !== 'Annulée').length} unit="chargements" unitClassName="text-[10px] text-slate-500 font-bold" />
            </div>
            <span className="text-[10px] text-teal-600 font-semibold mt-0.5 block">
              + Demander du stock vendeur
            </span>
          </div>

          <div
            onClick={() => onNavigateTab('ventes')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-rose-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Factures clients PDV</span>
            <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
              <AdaptiveAmount amount={activeSales.length} unit="actives" unitClassName="text-[10px] font-bold text-slate-500" />
            </div>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5 block">
              {cancelledSalesCount} facture(s) annulée(s)
            </span>
          </div>
        </div>
      )}

      {/* 3. KPIS COMPTABLE:
          (encaissé, à verser, versements en attente, créances PDV)
      */}
      {isComptable && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Encaissé</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
              <AdaptiveAmount amount={totalVersementsFCFA} unit="FCFA" unitClassName="text-xs font-bold" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Total versements validés</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">À verser</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
              <AdaptiveAmount amount={totalBalanceDue} unit="FCFA" unitClassName="text-xs font-bold" />
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Soldes vendeurs en dépôt-vente</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Versements en attente</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={pendingVersementsCount} unit="quittance" unitClassName="text-xs font-bold text-slate-500" />
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Caisse à jour</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Créances PDV</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              <AdaptiveAmount amount={0} unit="FCFA" unitClassName="text-xs font-bold text-emerald-600" />
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Paiements comptant &amp; OM</span>
          </div>
        </div>
      )}

      {/* 4. KPIS VENDEUR:
          (ventes du jour, CA, mon stock, à verser, PDV)
      */}
      {isVendeur && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Ventes du jour</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              <AdaptiveAmount amount={myTodaySalesTotal} unit="FCFA" unitClassName="text-[10px] text-teal-600 font-bold" />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{myTodaySales.length} livraisons</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">CA Réalisé</span>
            <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1">
              <AdaptiveAmount amount={mySalesTotal} unit="FCFA" unitClassName="text-[10px] font-bold" />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{mySales.length} ventes cumulées</span>
          </div>

          <div
            onClick={() => onNavigateTab('mon-stock')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Mon stock (van)</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              <AdaptiveAmount amount={myVanStockBoxes} unit="cartons" unitClassName="text-[10px] text-slate-500 font-bold" />
            </div>
            <span className="text-[10px] text-teal-600 mt-0.5 block">Stock 3-7 jours</span>
          </div>

          <div
            onClick={() => onNavigateTab('mon-solde')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-amber-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">À verser (solde)</span>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
              <AdaptiveAmount amount={myBalance.balanceDue} unit="FCFA" unitClassName="text-[10px] font-bold" />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">À remettre en caisse</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">PDV Desservis</span>
            <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
              <AdaptiveAmount amount={myPdvsVisitedCount} unit="PDV" unitClassName="text-[10px] text-slate-500 font-bold" />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Points de vente</span>
          </div>
        </div>
      )}

      {/* 
        GRAPHIQUE RÉCAPITULATIF DES VENTES QUOTIDIENNES SUR LES 7 DERNIERS JOURS
        Affiché pour : Administrateur, Directeur des opérations de vente, Sales Admin, Comptable, Vendeur
      */}
      {(isAdmin || isDirecteurOps || isSalesAdmin || isComptable || isVendeur) && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#008DA9]" />
                {isVendeur
                  ? 'Évolution de mes ventes quotidiennes (7 derniers jours)'
                  : 'Récapitulatif des ventes quotidiennes (7 derniers jours)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center">
                <span>
                  {isVendeur
                    ? 'Performance quotidienne sur les 7 derniers jours.'
                    : "Chiffre d'affaires quotidien sur 7 jours."}
                </span>
                <InfoTooltip
                  text={
                    isVendeur
                      ? `Performance journalière de votre tournée (${currentUser.name}) du ${dailySales7Days[0]?.fullDateLabel} au ${dailySales7Days[6]?.fullDateLabel}.`
                      : `Chiffre d'affaires consolidé des équipes commerciales du ${dailySales7Days[0]?.fullDateLabel} au ${dailySales7Days[6]?.fullDateLabel}.`
                  }
                />
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full lg:w-auto">
              {/* Summary metrics inline */}
              <div className="grid grid-cols-1 xs:grid-cols-3 sm:flex sm:flex-wrap items-start sm:items-center gap-3 sm:gap-4 text-xs sm:border-r border-slate-200 dark:border-slate-800 sm:pr-4 w-full sm:w-auto">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total 7 jours</span>
                  <span className="font-black text-slate-900 dark:text-white text-sm">
                    {total7DaysFCFA.toLocaleString('fr-FR')} <span className="text-[10px] text-[#008DA9]">FCFA</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Moyenne / jour</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                    {avg7DaysFCFA.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-500">FCFA</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Volume 7 jours</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {total7DaysCartons} cartons <span className="text-[10px] text-slate-400">({total7DaysVentes} ventes)</span>
                  </span>
                </div>
              </div>

              {/* Interactive chart mode selector */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    chartType === 'bar'
                      ? 'bg-white dark:bg-slate-900 text-[#008DA9] shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Histogramme
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    chartType === 'area'
                      ? 'bg-white dark:bg-slate-900 text-[#008DA9] shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Courbe
                </button>
              </div>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={dailySales7Days} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(val: number) =>
                      val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`
                    }
                    width={52}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0, 141, 169, 0.06)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl bg-slate-900 text-white p-3.5 shadow-xl border border-slate-700 text-xs space-y-1.5">
                          <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">
                            {data.fullDateLabel}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Chiffre d&apos;affaires :</span>
                            <span className="font-black text-[#38BDF8]">
                              {Number(data.montant).toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Livraisons PDV :</span>
                            <span className="font-bold text-white">{data.ventes} vente(s)</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Volume livré :</span>
                            <span className="font-bold text-emerald-400">{data.cartons} cartons</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="montant"
                    name="Ventes (FCFA)"
                    fill="#008DA9"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={false}
                  />
                </BarChart>
              ) : (
                <AreaChart data={dailySales7Days} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesBlueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#008DA9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#008DA9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(val: number) =>
                      val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`
                    }
                    width={52}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl bg-slate-900 text-white p-3.5 shadow-xl border border-slate-700 text-xs space-y-1.5">
                          <div className="font-bold text-slate-200 border-b border-slate-700 pb-1">
                            {data.fullDateLabel}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Chiffre d&apos;affaires :</span>
                            <span className="font-black text-[#38BDF8]">
                              {Number(data.montant).toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Livraisons PDV :</span>
                            <span className="font-bold text-white">{data.ventes} vente(s)</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Volume livré :</span>
                            <span className="font-bold text-emerald-400">{data.cartons} cartons</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="montant"
                    name="Ventes (FCFA)"
                    stroke="#008DA9"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#salesBlueGradient)"
                    activeDot={{ r: 6, fill: '#008DA9', stroke: '#FFFFFF', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Tableau récapitulatif sous le graphique des 7 derniers jours */}
          <div className="pt-2">
            <DataTable<any>
              data={dailySales7Days}
              rowKey={(d) => d.dateStr || d.label}
              mobileTitle={(d) => d.fullDateLabel || d.label}
              mobileBadge={(d) => (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                  {d.ventes} vente(s)
                </span>
              )}
              columns={[
                {
                  key: 'jour',
                  header: 'Jour & Date',
                  hideInMobileCard: true,
                  cell: (d) => (
                    <span className="font-bold text-slate-900 dark:text-white">
                      {d.fullDateLabel || d.label}
                    </span>
                  ),
                  footer: 'TOTAL 7 JOURS',
                },
                {
                  key: 'ventes',
                  header: 'Livraisons PDV',
                  mobileLabel: 'Livraisons PDV',
                  isNumeric: true,
                  cell: (d) => <span>{d.ventes} vente(s)</span>,
                  footer: `${dailySales7Days.reduce((acc, d) => acc + Number(d.ventes || 0), 0)} vente(s)`,
                },
                {
                  key: 'cartons',
                  header: 'Volume Livré',
                  mobileLabel: 'Volume livré',
                  isNumeric: true,
                  secondary: true,
                  cell: (d) => <span className="font-bold text-emerald-700 dark:text-emerald-400">{d.cartons} cartons</span>,
                  footer: `${dailySales7Days.reduce((acc, d) => acc + Number(d.cartons || 0), 0)} cartons`,
                },
                {
                  key: 'montant',
                  header: "Chiffre d'affaires",
                  mobileLabel: "Chiffre d'affaires",
                  isNumeric: true,
                  cell: (d) => (
                    <span className="font-black text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                      {Number(d.montant || 0).toLocaleString('fr-FR')} FCFA
                    </span>
                  ),
                  footer: `${total7DaysFCFA.toLocaleString('fr-FR')} FCFA`,
                },
              ]}
              totalsFooter={
                <>
                  <span>
                    Cumul 7j : <strong className="whitespace-nowrap">{total7DaysFCFA.toLocaleString('fr-FR')} FCFA</strong>
                  </span>
                  <span>
                    Moyenne / jour : <strong className="whitespace-nowrap">{avg7DaysFCFA.toLocaleString('fr-FR')} FCFA</strong>
                  </span>
                </>
              }
            />
          </div>
        </div>
      )}

      {/* 
        STOCK TABLE WITH EXACT COLOR BADGES:
        - Surstock : gris #E2E8F0 texte noir
        - Stock bas : marron #92400E texte blanc
        - Risque de rupture : rouge #B91C1C texte blanc
        - Niveau normal : vert #15803D texte blanc
      */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-600" />
              État des Stocks &amp; Alertes Dépôt Central (Sotuba)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center">
              <span>Suivi des stocks et seuils d&apos;alerte du dépôt.</span>
              <InfoTooltip text="Badges normés de suivi de niveau des références agroalimentaires au dépôt central de Sotuba." />
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span
              className="px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: '#E2E8F0', color: '#000000' }}
            >
              Surstock
            </span>
            <span
              className="px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: '#15803D', color: '#FFFFFF' }}
            >
              Niveau normal
            </span>
            <span
              className="px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: '#92400E', color: '#FFFFFF' }}
            >
              Stock bas
            </span>
            <span
              className="px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: '#B91C1C', color: '#FFFFFF' }}
            >
              Risque de rupture
            </span>
          </div>
        </div>

        <DataTable<any>
          data={products}
          rowKey={(p) => p.id}
          mobileTitle={(p) => (
            <span>
              <span className="font-mono text-teal-600 dark:text-teal-400 mr-1.5">{p.code}</span>
              {p.name}
            </span>
          )}
          mobileSubtitle={(p) => p.packaging}
          mobileBadge={(p) => <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />}
          columns={[
            {
              key: 'code',
              header: 'Réf.',
              hideInMobileCard: true,
              cell: (p) => (
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {p.code}
                </span>
              ),
              footer: 'TOTAUX STOCK DÉPÔT',
            },
            {
              key: 'name',
              header: 'Désignation & Format',
              hideInMobileCard: true,
              cell: (p) => (
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{p.packaging}</div>
                </div>
              ),
            },
            {
              key: 'price_box',
              header: 'Prix Carton',
              mobileLabel: 'Prix Carton',
              isNumeric: true,
              cell: (p) => (
                <span className="font-black text-slate-900 dark:text-white">
                  {p.price_box.toLocaleString('fr-FR')} FCFA
                </span>
              ),
            },
            {
              key: 'stock_depot',
              header: 'Stock & Autonomie',
              mobileLabel: 'Stock Dépôt',
              isNumeric: true,
              cell: (p) => {
                const daysCovered = Math.round(p.stock_depot / 25);
                return (
                  <div>
                    <div className="font-extrabold text-slate-900 dark:text-white">{p.stock_depot} cartons</div>
                    <div className="text-[11px] text-slate-500 font-medium">~{daysCovered} jours</div>
                  </div>
                );
              },
              footer: `${totalStockDepotBoxes.toLocaleString('fr-FR')} cartons`,
            },
            {
              key: 'status',
              header: 'Statut Niveau',
              align: 'center',
              hideInMobileCard: true,
              cell: (p) => <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />,
            },
          ]}
          totalsFooter={
            <>
              <span>
                Stock Dépôt : <strong className="whitespace-nowrap">{totalStockDepotBoxes.toLocaleString('fr-FR')} cartons</strong>
              </span>
              <span>
                Valeur Dépôt :{' '}
                <strong className="text-teal-700 dark:text-teal-400 whitespace-nowrap">
                  {products
                    .reduce((acc, p) => acc + Number(p.stock_depot || 0) * Number(p.price_box || 0), 0)
                    .toLocaleString('fr-FR')}{' '}
                  FCFA
                </strong>
              </span>
            </>
          }
        />
      </div>

      {/* Modals for "Mes cadeaux" et "Ma tournée" */}
      {activePlusModal === 'cadeaux' && (
        <FormModal
          title="Mes Cadeaux & Gratuités PDV"
          subtitle="Suivi des échantillons promotionnels et cartons de fidélité remis aux gérants de points de vente partenaires."
          icon={<Gift className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => setActivePlusModal(null)}
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setActivePlusModal(null);
          }}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border flex justify-between items-center">
              <span>Échantillons Jus Cajoucy (Bouteilles 25cl)</span>
              <span className="font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">12 remis</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border flex justify-between items-center">
              <span>Packs Nora 6x1.5L fidélité boutique</span>
              <span className="font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">3 packs</span>
            </div>
          </div>
        </FormModal>
      )}

      {activePlusModal === 'tournee' && (
        <FormModal
          title="Ma Tournée de Livraison (Bamako)"
          subtitle="Ordre de passage recommandé pour votre camionnette :"
          icon={<Compass className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => setActivePlusModal(null)}
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setActivePlusModal(null);
          }}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
              <div className="font-bold text-slate-900 dark:text-white">1. Sotuba &rarr; Djélibougou (Matinée)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">3 points de vente programmés</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
              <div className="font-bold text-slate-900 dark:text-white">2. Badalabougou &rarr; Faladié (Après-midi)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">4 points de vente programmés</div>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
