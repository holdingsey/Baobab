import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  FileSpreadsheet,
  Layers,
  Users,
  Store,
  CheckSquare,
  MapPin,
  Package,
  Boxes,
  Truck,
  DollarSign,
  ShoppingCart,
  Gift,
  Settings,
  ArrowDownLeft,
  RotateCcw,
  ClipboardList,
  FileCheck,
  CreditCard,
  Receipt,
  Wallet,
  PlusCircle,
  Plus,
  History,
  ShoppingBag,
  LogOut,
  ChevronRight,
  X,
  ShieldAlert
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { UserSession } from './LoginScreen';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserSession;
  logoUrl?: string;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  pendingPdvsCount?: number;
  unrevealedBonsCount?: number;
  pendingPurchaseRequestsCount?: number;
  pendingReceptionsCount?: number;
  newAnomaliesCount?: number;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  logoUrl,
  onLogout,
  isOpen,
  onClose,
  pendingPdvsCount = 0,
  unrevealedBonsCount = 0,
  pendingPurchaseRequestsCount = 0,
  pendingReceptionsCount = 0,
  newAnomaliesCount = 0,
}) => {
  const role = currentUser.role;

  // Exact menu items per role, entries outside role strictly removed
  let menuItems: MenuItem[] = [];

  if (role === 'Administrateur') {
    menuItems = [
      { id: 'dashboard', label: 'Vue globale', icon: LayoutDashboard },
      {
        id: 'alertes',
        label: 'Alertes',
        icon: ShieldAlert,
        badge: newAnomaliesCount > 0 ? String(newAnomaliesCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'ventes', label: 'Ventes & Factures PDV', icon: ShoppingCart },
      { id: 'demandes-annulation-vente', label: 'Demandes annulation vente', icon: RotateCcw },
      { id: 'historique-sku', label: 'Analyse produits', icon: BarChart3 },
      { id: 'commandes-gros', label: 'Commandes en gros', icon: Boxes },
      { id: 'clients-gros', label: 'Clients en gros', icon: Store },
      { id: 'utilisateurs', label: 'Utilisateurs', icon: Users },
      {
        id: 'validation-pdv',
        label: 'Validation PDV',
        icon: CheckSquare,
        badge: pendingPdvsCount > 0 ? String(pendingPdvsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'pdvs', label: 'Points de vente (PDV)', icon: Store },
      { id: 'carte', label: 'Carte & Tournées GPS', icon: MapPin },
      {
        id: 'receptions',
        label: 'Réceptions & Contrôle',
        icon: ArrowDownLeft,
        badge: pendingReceptionsCount > 0 ? String(pendingReceptionsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'chargements', label: 'Chargements & Appro.', icon: Truck },
      { id: 'inventaire', label: 'Inventaires', icon: ClipboardList },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'lots', label: 'Lots & FEFO', icon: Boxes },
      { id: 'retours', label: 'Retours vendeurs', icon: RotateCcw },
      { id: 'versements', label: 'Versements & Caisse', icon: DollarSign },
      { id: 'factures', label: 'Factures & Reçus', icon: Receipt },
      {
        id: 'demandes-achat',
        label: "Demandes d'achat",
        icon: ShoppingBag,
        badge: pendingPurchaseRequestsCount > 0 ? String(pendingPurchaseRequestsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'catalogue', label: 'Catalogue & Prix', icon: Layers },
      { id: 'stats', label: 'Statistiques', icon: BarChart3 },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
      {
        id: 'cadeaux',
        label: 'Cadeaux & Notes',
        icon: Gift,
        badge: unrevealedBonsCount > 0 ? String(unrevealedBonsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'reglages', label: 'Réglages', icon: Settings },
    ];
  } else if (role === 'Directeur des opérations de vente' || /directeur|op[eé]ration|dov/i.test(role || '')) {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      {
        id: 'alertes',
        label: 'Alertes',
        icon: ShieldAlert,
        badge: newAnomaliesCount > 0 ? String(newAnomaliesCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'ventes', label: 'Ventes & Factures PDV', icon: ShoppingCart },
      { id: 'demandes-annulation-vente', label: 'Demandes annulation vente', icon: RotateCcw },
      { id: 'historique-sku', label: 'Analyse produits', icon: BarChart3 },
      {
        id: 'validation-pdv',
        label: 'Validation création PDV',
        icon: CheckSquare,
        badge: pendingPdvsCount > 0 ? String(pendingPdvsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'demande-stock-vendeur', label: 'Demande stock vendeur', icon: Truck },
      { id: 'pdvs', label: 'Points de vente', icon: Store },
      { id: 'carte', label: 'Carte & Tournées', icon: MapPin },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
    ];
  } else if (role === 'Sales Admin') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      {
        id: 'alertes',
        label: 'Alertes',
        icon: ShieldAlert,
        badge: newAnomaliesCount > 0 ? String(newAnomaliesCount) : undefined,
        badgeColor: '#DC2626',
      },
      {
        id: 'receptions',
        label: 'Validation Réceptions',
        icon: ArrowDownLeft,
        badge: pendingReceptionsCount > 0 ? String(pendingReceptionsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'chargements', label: 'Approvisionnements', icon: Truck },
      { id: 'ventes', label: 'Contrôle des Ventes', icon: ShoppingCart },
      { id: 'inventaire', label: 'Inventaires', icon: ClipboardList },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'lots', label: 'Lots & FEFO', icon: Boxes },
      { id: 'retours', label: 'Retours vendeurs', icon: RotateCcw },
      {
        id: 'demandes-achat',
        label: "Demandes d'achat",
        icon: ShoppingBag,
        badge: pendingPurchaseRequestsCount > 0 ? String(pendingPurchaseRequestsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
    ];
  } else if (role === 'Gestionnaire grossiste' || /grossiste/i.test(role || '') || currentUser.code?.startsWith('BAO-GRS')) {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'commandes-gros', label: 'Commandes en gros', icon: ShoppingCart },
      { id: 'nouvelle-commande-gros', label: 'Nouvelle commande en gros', icon: PlusCircle },
      { id: 'clients-gros', label: 'Clients en gros', icon: Store },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'catalogue', label: 'Catalogue & Prix', icon: Layers },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
    ];
  } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      {
        id: 'alertes',
        label: 'Alertes',
        icon: ShieldAlert,
        badge: newAnomaliesCount > 0 ? String(newAnomaliesCount) : undefined,
        badgeColor: '#DC2626',
      },
      {
        id: 'receptions',
        label: 'Réceptions',
        icon: ArrowDownLeft,
        badge: pendingReceptionsCount > 0 ? String(pendingReceptionsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'chargements', label: 'Chargements', icon: Truck },
      { id: 'retours', label: 'Retours', icon: RotateCcw },
      { id: 'inventaire', label: 'Inventaire', icon: ClipboardList },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'lots', label: 'Lots', icon: Boxes },
      { id: 'demandes-achat', label: "Demandes d'achat", icon: ShoppingBag },
      { id: 'bons-a-remettre', label: 'Bons à remettre', icon: FileCheck },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
    ];
  } else if (role === 'Comptable') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      {
        id: 'alertes',
        label: 'Alertes',
        icon: ShieldAlert,
        badge: newAnomaliesCount > 0 ? String(newAnomaliesCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'versements', label: 'Versements', icon: DollarSign },
      { id: 'soldes-vendeurs', label: 'Soldes vendeurs', icon: CreditCard },
      { id: 'factures', label: 'Factures', icon: Receipt },
      { id: 'caisse', label: 'Caisse', icon: Wallet },
      { id: 'demandes-achat', label: "Demandes d'achat", icon: ShoppingBag },
      { id: 'ventes-lecture', label: 'Ventes (lecture)', icon: ShoppingCart },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
      { id: 'extractions', label: 'Extractions', icon: FileSpreadsheet },
    ];
  } else {
    // Vendeur
    menuItems = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'nouvelle-vente', label: 'Nouvelle vente', icon: PlusCircle },
      { id: 'mon-chargement', label: 'Mon chargement', icon: Truck },
      { id: 'mes-chargements', label: 'Mes chargements', icon: History },
      { id: 'nouveau-pdv', label: 'Nouveau PDV', icon: Plus },
      { id: 'mes-pdvs', label: 'Mes PDV', icon: Store },
      { id: 'mon-stock', label: 'Mon stock', icon: Boxes },
      { id: 'mes-ventes', label: 'Mes ventes', icon: ShoppingBag },
      { id: 'mes-factures', label: 'Mes factures', icon: Receipt },
      { id: 'mon-solde', label: 'Mon solde', icon: CreditCard },
      { id: 'mes-versements', label: 'Mes versements', icon: DollarSign },
      {
        id: 'mes-cadeaux',
        label: 'Mes cadeaux',
        icon: Gift,
        badge: unrevealedBonsCount > 0 ? String(unrevealedBonsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'carte', label: 'Carte', icon: MapPin },
    ];
  }

  const [isPageScrolled, setIsPageScrolled] = React.useState(false);
  const [isNavScrolled, setIsNavScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleWindowScroll = () => {
      setIsPageScrolled(window.scrollY > 8);
    };
    handleWindowScroll();
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  const shortRoleLabel = /directeur|op[eé]ration|dov/i.test(role || '')
    ? 'DOV'
    : role === 'Sales Admin'
    ? 'Contrôleur'
    : /grossiste/i.test(role || '') || currentUser.code?.startsWith('BAO-GRS')
    ? 'Grossiste'
    : role === 'Magasinier' || role === 'Gestionnaire de stock' || currentUser.code === 'BAO-MAG'
    ? 'Magasinier'
    : role;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container - Sticky on desktop scroll & fixed sticky drawer on mobile/tablet */}
      <aside
        className={`fixed top-0 bottom-0 left-0 lg:sticky lg:top-0 lg:self-start lg:shrink-0 z-50 w-56 max-w-[70vw] sm:w-60 lg:w-60 lg:max-w-none h-dvh max-h-dvh overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 lg:pointer-events-auto ${
          isPageScrolled ? 'shadow-lg lg:shadow-md' : ''
        } ${
          isOpen ? 'translate-x-0 pointer-events-auto shadow-2xl' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Sticky Header with Baobab Logo */}
        <div
          className={`sticky top-0 z-20 shrink-0 px-3 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 transition-shadow ${
            isNavScrolled || isPageScrolled ? 'shadow-xs' : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-8 w-8 shrink-0 flex items-center justify-center">
              <BaobabLogo logoUrl={logoUrl} size={30} variant="sidebar" />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight min-w-0">
              Baobab Distribution
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="lg:hidden w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 shrink-0 transition cursor-pointer"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Exact Menu Items List (Hors rôle supprimées) */}
        <nav
          onScroll={(e) => setIsNavScrolled(e.currentTarget.scrollTop > 4)}
          className="flex-1 min-h-0 px-2 pb-2 space-y-0.5 overflow-y-auto overscroll-contain"
        >
          <div
            className={`sticky top-0 z-10 px-2.5 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-shadow ${
              isNavScrolled ? 'border-b border-slate-100 dark:border-slate-800/80 shadow-2xs' : ''
            }`}
          >
            Menu {shortRoleLabel} ({menuItems.length})
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose();
                }}
                className={`w-full min-h-[38px] h-auto flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] transition cursor-pointer ${
                  isActive
                    ? 'bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-bold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] leading-snug">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className="text-[10.5px] px-1.5 py-0.5 rounded-full font-bold text-white shrink-0 ml-1"
                    style={{ backgroundColor: item.badgeColor || '#DC2626' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sticky Footer - Déconnexion */}
        <div className="sticky bottom-0 z-20 shrink-0 p-2.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
          <button
            onClick={onLogout}
            className="w-full min-h-[38px] flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-bold text-rose-600 bg-rose-50/80 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 border border-rose-200/60 dark:border-rose-900/50 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Déconnexion</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </aside>
    </>
  );
};
