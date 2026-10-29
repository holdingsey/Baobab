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
  X,
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
  balances: any[];
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
  balances,
}) => {
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activePlusModal, setActivePlusModal] = useState<'cadeaux' | 'tournee' | null>(null);

  const role = currentUser.role;
  const isVendeur = role === 'Vendeur';
  const isMagasinier = role === 'Magasinier';
  const isComptable = role === 'Comptable';
  const isAdmin = role === 'Administrateur';

  // Calculations
  const todayStr = '2026-10-26';
  const pendingPdvsCount = pdvs.filter((p) => p.status === 'en_attente').length;
  const activePdvsCount = pdvs.filter((p) => p.status === 'valide').length;

  const totalSalesFCFA = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalVersementsFCFA = versements
    .filter((v) => v.status === 'valide')
    .reduce((sum, v) => sum + v.amount, 0);
  const totalBalanceDue = balances.reduce((sum, b) => sum + b.balanceDue, 0);
  const totalStockDepotBoxes = products.reduce((sum, p) => sum + p.stock_depot, 0);

  // Today sales
  const todaySales = sales.filter((s) => s.date === todayStr);
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.total_amount, 0);

  // Month sales (October 2026)
  const monthSalesTotal = sales
    .filter((s) => s.date.startsWith('2026-10'))
    .reduce((sum, s) => sum + s.total_amount, 0);

  // Vendor specific calculations
  const mySales = sales.filter((s) => s.vendor_id === currentUser.id);
  const mySalesTotal = mySales.reduce((sum, s) => sum + s.total_amount, 0);
  const myTodaySales = mySales.filter((s) => s.date === todayStr);
  const myTodaySalesTotal = myTodaySales.reduce((sum, s) => sum + s.total_amount, 0);
  const myBalance = balances.find((b) => b.vendorId === currentUser.id) || {
    balanceDue: 714600,
    stockVanValue: 1023000,
  };
  const myChargement = chargements.find((c) => c.vendor_id === currentUser.id);
  const myVanStockBoxes = (myChargement?.items || []).reduce(
    (acc: number, it: any) => acc + (it.qtyBoxes || 0),
    0
  );
  const myPdvsVisitedCount = new Set(mySales.map((s) => s.pdv_id)).size;

  // Pending versements count
  const pendingVersementsCount = versements.filter((v) => v.status === 'en_attente').length;

  // Chart view mode toggle ('bar' | 'area')
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  // 7-day daily sales data for Admin, Comptable (all sales) and Vendeur (mySales)
  const relevantSales = isVendeur ? mySales : sales;
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 
        ROLE-SPECIFIC BANNER (Le bandeau dépend du rôle, jamais celui du Vendeur par défaut)
      */}
      <div className="rounded-3xl bg-[#008DA9] p-6 sm:p-8 text-white shadow-xl relative border border-[#008DA9]">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            {/* Role Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold uppercase tracking-wider text-white border border-white/20">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {isAdmin && <span>Administrateur &bull; {currentUser.code}</span>}
              {isMagasinier && <span>Magasinier &bull; Dépôt Central</span>}
              {isComptable && <span>Comptable &bull; Caisse Centrale</span>}
              {isVendeur && <span>Vendeur &bull; {currentUser.code}</span>}
            </div>

            {/* Personalized Greeting Title for All Accounts */}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Bonjour, {currentUser.name}
            </h1>

            <p className="text-sm text-white/90 leading-relaxed font-medium">
              {isAdmin && "Tableau de bord Administrateur — Vue d'ensemble : ventes, stocks, équipes et validations."}
              {isMagasinier && "Dépôt Central & Magasin — Réceptions, chargements, retours et lots."}
              {isComptable && "Caisse & Comptabilité — Versements, soldes et factures."}
              {isVendeur && "Espace Vendeur Dépôt-Vente — Vos ventes, votre stock et vos versements."}
            </p>
          </div>

          {/* Role Specific Actions Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* ADMINISTRATEUR BUTTONS:
                Principale verte "Valider les PDV" (bulle rouge #DC2626 chiffre blanc).
                Secondaires : Chargements, Versements, Lots, Utilisateurs, Rapports.
                Ne vend jamais.
            */}
            {isAdmin && (
              <>
                <button
                  onClick={() => onNavigateTab('validation-pdv')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-300" />
                  <span>Valider les PDV</span>
                  {pendingPdvsCount > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                    >
                      {pendingPdvsCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => onNavigateTab('chargements-lecture')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Chargements
                </button>

                <button
                  onClick={() => onNavigateTab('versements-lecture')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Versements
                </button>

                <button
                  onClick={() => onNavigateTab('lots')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Lots
                </button>

                <button
                  onClick={() => onNavigateTab('utilisateurs')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Utilisateurs
                </button>

                <button
                  onClick={() => onNavigateTab('rapports')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Rapports
                </button>
              </>
            )}

            {/* MAGASINIER BUTTONS:
                Secondaires harmonisés avec même style translucide.
            */}
            {isMagasinier && (
              <>
                <button
                  onClick={() => onNavigateTab('chargements')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  <Truck className="w-4 h-4 text-amber-300" />
                  <span>Chargements</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                  >
                    {chargements.length}
                  </span>
                </button>

                <button
                  onClick={() => onNavigateTab('receptions')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Réceptions
                </button>

                <button
                  onClick={() => onNavigateTab('retours')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Retours
                </button>

                <button
                  onClick={() => onNavigateTab('inventaire')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Inventaire
                </button>

                <button
                  onClick={() => onNavigateTab('lots')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Lots
                </button>

                <button
                  onClick={() => onNavigateTab('bons-a-remettre')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Bons à remettre
                </button>
              </>
            )}

            {/* COMPTABLE BUTTONS:
                Secondaires harmonisés avec même style translucide.
            */}
            {isComptable && (
              <>
                <button
                  onClick={() => onNavigateTab('versements')}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 text-cyan-300" />
                  <span>Versements</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                  >
                    {versements.length}
                  </span>
                </button>

                <button
                  onClick={() => onNavigateTab('soldes-vendeurs')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Soldes vendeurs
                </button>

                <button
                  onClick={() => onNavigateTab('factures')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Factures
                </button>

                <button
                  onClick={() => onNavigateTab('caisse')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Caisse du jour
                </button>

                <button
                  onClick={() => onNavigateTab('rapports')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Rapports
                </button>
              </>
            )}

            {/* VENDEUR BUTTONS:
                Principale: "Nouvelle vente".
                Secondaires : Mon chargement, Nouveau PDV, Mon stock, Mon solde ;
                Mes cadeaux et Ma tournée dans "Plus".
            */}
            {isVendeur && (
              <>
                <button
                  onClick={() => onNavigateTab('nouvelle-vente')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-teal-900 hover:bg-teal-50 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-teal-600" />
                  <span>Nouvelle vente</span>
                </button>

                <button
                  onClick={() => onNavigateTab('mon-chargement')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Mon chargement
                </button>

                <button
                  onClick={() => onNavigateTab('nouveau-pdv')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Nouveau PDV
                </button>

                <button
                  onClick={() => onNavigateTab('mon-stock')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Mon stock
                </button>

                <button
                  onClick={() => onNavigateTab('mon-solde')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                >
                  Mon solde
                </button>

                {/* Menu "Plus" pour Vendeur (100% visible, sans coupure sur mobile ou PC) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-semibold text-xs border border-white/20 transition cursor-pointer"
                  >
                    <span>Plus</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        showPlusMenu ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showPlusMenu && (
                    <>
                      {/* Fond cliquable pour refermer le menu */}
                      <div
                        className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
                        onClick={() => setShowPlusMenu(false)}
                      />

                      {/* VUE MOBILE : TIROIR MODAL DU BAS (100% VISIBLE, AUCUN ÉLÉMENT COUPÉ) */}
                      <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center p-3 pointer-events-none">
                        <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 text-slate-800 dark:text-slate-100 space-y-3 pointer-events-auto">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#008DA9]" />
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
                              className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-teal-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3 transition cursor-pointer group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-[#008DA9] dark:text-teal-300 flex items-center justify-center shrink-0 shadow-xs">
                                <Gift className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  Mes cadeaux &amp; Gratuités
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  Échantillons promotionnels &amp; fidélité PDV
                                </div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setShowPlusMenu(false);
                                setActivePlusModal('tournee');
                              }}
                              className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-teal-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3 transition cursor-pointer group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-[#008DA9] dark:text-teal-300 flex items-center justify-center shrink-0 shadow-xs">
                                <Compass className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white">
                                  Ma tournée de livraison
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  Itinéraire recommandé &amp; points de vente
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

                      {/* VUE TABLETTE & PC : POPUP ANCRÉ SOUS LE BOUTON AVEC Z-INDEX ÉLEVÉ */}
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
                          <Gift className="w-4 h-4 text-[#008DA9]" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">Mes cadeaux</div>
                            <div className="text-[10px] text-slate-400">Gratuités &amp; fidélité PDV</div>
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
                          <Compass className="w-4 h-4 text-[#008DA9]" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">Ma tournée</div>
                            <div className="text-[10px] text-slate-400">Itinéraire recommandé</div>
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

      {/* 
        ROLE-SPECIFIC KPIS
      */}

      {/* 1. KPIS ADMINISTRATEUR:
          (ventes du jour, CA du mois, stock dépôt, encaissé, à verser, PDV actifs)
      */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Ventes du jour</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              {todaySalesTotal.toLocaleString('fr-FR')} <span className="text-[10px] text-teal-600 font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{todaySales.length} livraisons</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">CA du mois</span>
            <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1">
              {monthSalesTotal.toLocaleString('fr-FR')} <span className="text-[10px] font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Octobre 2026</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Stock dépôt</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              {totalStockDepotBoxes.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-500 font-bold">cartons</span>
            </div>
            <span className="text-[10px] text-emerald-600 mt-0.5 block">Dépôt Sotuba</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Encaissé</span>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {totalVersementsFCFA.toLocaleString('fr-FR')} <span className="text-[10px] font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Validé en caisse</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">À verser</span>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
              {totalBalanceDue.toLocaleString('fr-FR')} <span className="text-[10px] font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Soldes vendeurs</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">PDV actifs</span>
            <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {activePdvsCount} / {pdvs.length}
            </div>
            <span className="text-[10px] text-teal-600 mt-0.5 block">Points de vente</span>
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
              {totalStockDepotBoxes.toLocaleString('fr-FR')} <span className="text-xs text-slate-500 font-bold">cartons</span>
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Couverture : 30-45 jours</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Chargements en attente</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
              {chargements.length} <span className="text-xs font-bold text-slate-500">camionnettes</span>
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Dépôt-vente 3-7 jours</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Lots à risque</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              0 <span className="text-xs font-bold text-emerald-600">lot</span>
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Péremptions conformes</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Retours à confirmer</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              0 <span className="text-xs font-bold text-slate-500">retour</span>
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Aucune avarie en attente</span>
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
              {totalVersementsFCFA.toLocaleString('fr-FR')} <span className="text-xs font-bold">FCFA</span>
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Total versements validés</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">À verser</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
              {totalBalanceDue.toLocaleString('fr-FR')} <span className="text-xs font-bold">FCFA</span>
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Soldes vendeurs en dépôt-vente</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Versements en attente</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              {pendingVersementsCount} <span className="text-xs font-bold text-slate-500">quittance</span>
            </div>
            <span className="text-xs text-emerald-600 mt-1 block">Caisse à jour</span>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-bold uppercase text-slate-400">Créances PDV</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              0 <span className="text-xs font-bold text-emerald-600">FCFA</span>
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
              {myTodaySalesTotal.toLocaleString('fr-FR')} <span className="text-[10px] text-teal-600 font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{myTodaySales.length} livraisons</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">CA Réalisé</span>
            <div className="text-lg font-black text-teal-700 dark:text-teal-400 mt-1">
              {mySalesTotal.toLocaleString('fr-FR')} <span className="text-[10px] font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{mySales.length} ventes cumulées</span>
          </div>

          <div
            onClick={() => onNavigateTab('mon-stock')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-teal-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">Mon stock (van)</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
              {myVanStockBoxes} <span className="text-[10px] text-slate-500 font-bold">cartons</span>
            </div>
            <span className="text-[10px] text-teal-600 mt-0.5 block">Stock 3-7 jours</span>
          </div>

          <div
            onClick={() => onNavigateTab('mon-solde')}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-amber-500 transition"
          >
            <span className="text-[10px] font-bold uppercase text-slate-400">À verser (solde)</span>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
              {myBalance.balanceDue.toLocaleString('fr-FR')} <span className="text-[10px] font-bold">FCFA</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">À remettre en caisse</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">PDV Desservis</span>
            <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {myPdvsVisitedCount} <span className="text-[10px] text-slate-500 font-bold">PDV</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Points de vente</span>
          </div>
        </div>
      )}

      {/* 
        GRAPHIQUE RÉCAPITULATIF DES VENTES QUOTIDIENNES SUR LES 7 DERNIERS JOURS
        Affiché pour : Administrateur, Comptable, Vendeur
      */}
      {(isAdmin || isComptable || isVendeur) && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#008DA9]" />
                {isVendeur
                  ? 'Évolution de mes ventes quotidiennes (7 derniers jours)'
                  : 'Récapitulatif des ventes quotidiennes (7 derniers jours)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isVendeur
                  ? `Performance journalière de votre tournée (${currentUser.name}) du ${dailySales7Days[0]?.fullDateLabel} au ${dailySales7Days[6]?.fullDateLabel}`
                  : `Chiffre d'affaires consolidé des équipes commerciales du ${dailySales7Days[0]?.fullDateLabel} au ${dailySales7Days[6]?.fullDateLabel}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Summary metrics inline */}
              <div className="flex items-center gap-4 text-xs border-r border-slate-200 dark:border-slate-800 pr-4">
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
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
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
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-600" />
              État des Stocks &amp; Alertes Dépôt Central (Sotuba)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Badges normés de suivi de niveau des 4 références agroalimentaires.
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

        {/* Mobile Cards View (< 640px) */}
        <div className="space-y-2.5 sm:hidden">
          {products.map((p) => {
            const daysCovered = Math.round(p.stock_depot / 25);
            return (
              <div
                key={p.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {p.code}
                    </span>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">{p.name}</div>
                    <div className="text-[11px] text-slate-500">{p.packaging}</div>
                  </div>
                  <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Prix Carton</span>
                    <strong className="text-slate-900 dark:text-white">
                      {p.price_box.toLocaleString('fr-FR')} FCFA
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Stock Dépôt</span>
                    <strong className="text-slate-900 dark:text-white">{p.stock_depot} cartons</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Autonomie</span>
                    <strong className="text-slate-700 dark:text-slate-300">~{daysCovered} jours</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tablet & Desktop Table (>= 640px) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-semibold text-[10px]">
                <th className="py-2.5 px-2.5 lg:px-3">Réf.</th>
                <th className="py-2.5 px-2.5 lg:px-3">Désignation &amp; Format</th>
                <th className="py-2.5 px-2.5 lg:px-3 text-right">Prix Carton</th>
                <th className="py-2.5 px-2.5 lg:px-3 text-center">Stock &amp; Autonomie</th>
                <th className="py-2.5 px-2.5 lg:px-3 text-center">Statut Niveau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => {
                const daysCovered = Math.round(p.stock_depot / 25);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-2.5 lg:px-3 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {p.code}
                    </td>
                    <td className="py-3 px-2.5 lg:px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-[11px] text-slate-500">{p.packaging}</div>
                    </td>
                    <td className="py-3 px-2.5 lg:px-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                      {p.price_box.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td className="py-3 px-2.5 lg:px-3 text-center whitespace-nowrap">
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {p.stock_depot} cartons
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">~{daysCovered} jours</div>
                    </td>
                    <td className="py-3 px-2.5 lg:px-3 text-center whitespace-nowrap">
                      <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals for "Mes cadeaux" et "Ma tournée" */}
      {activePlusModal === 'cadeaux' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-teal-600">
              <Gift className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Mes Cadeaux &amp; Gratuités PDV</h2>
            </div>
            <p className="text-xs text-slate-500">
              Suivi des échantillons promotionnels et cartons de fidélité remis aux gérants de points de vente partenaires.
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border flex justify-between items-center">
                <span>Échantillons Jus Cajoucy (Bouteilles 25cl)</span>
                <span className="font-bold text-teal-600">12 remis</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border flex justify-between items-center">
                <span>Packs Nora 6x1.5L fidélité boutique</span>
                <span className="font-bold text-teal-600">3 packs</span>
              </div>
            </div>
            <button
              onClick={() => setActivePlusModal(null)}
              className="w-full py-2 rounded-xl bg-teal-600 text-white font-bold text-xs"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {activePlusModal === 'tournee' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-teal-600">
              <Compass className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Ma Tournée de Livraison (Bamako)</h2>
            </div>
            <p className="text-xs text-slate-500">
              Ordre de passage recommandé pour votre camionnette :
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
                <div className="font-bold text-slate-900 dark:text-white">1. Sotuba &rarr; Djélibougou (Matinée)</div>
                <div className="text-[11px] text-slate-500">3 points de vente programmés</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border">
                <div className="font-bold text-slate-900 dark:text-white">2. Badalabougou &rarr; Faladié (Après-midi)</div>
                <div className="text-[11px] text-slate-500">4 points de vente programmés</div>
              </div>
            </div>
            <button
              onClick={() => setActivePlusModal(null)}
              className="w-full py-2 rounded-xl bg-teal-600 text-white font-bold text-xs"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
