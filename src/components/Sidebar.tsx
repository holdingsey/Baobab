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
  Shield
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
}) => {
  const role = currentUser.role;

  // Exact menu items per role, entries outside role strictly removed
  let menuItems: MenuItem[] = [];

  if (role === 'Administrateur') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'stats', label: 'Statistiques', icon: BarChart3 },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
      { id: 'catalogue', label: 'Catalogue', icon: Layers },
      { id: 'utilisateurs', label: 'Utilisateurs', icon: Users },
      { id: 'pdvs', label: 'PDV', icon: Store },
      {
        id: 'validation-pdv',
        label: 'Validation PDV',
        icon: CheckSquare,
        badge: pendingPdvsCount > 0 ? String(pendingPdvsCount) : undefined,
        badgeColor: '#DC2626',
      },
      {
        id: 'demandes-achat',
        label: "Demandes d'achat",
        icon: ShoppingBag,
        badge: pendingPurchaseRequestsCount > 0 ? String(pendingPurchaseRequestsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'carte', label: 'Carte', icon: MapPin },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'lots', label: 'Lots', icon: Boxes },
      { id: 'chargements-lecture', label: 'Chargements (lecture)', icon: Truck },
      { id: 'versements-lecture', label: 'Versements (lecture)', icon: DollarSign },
      { id: 'ventes', label: 'Ventes', icon: ShoppingCart },
      {
        id: 'cadeaux',
        label: 'Cadeaux',
        icon: Gift,
        badge: unrevealedBonsCount > 0 ? String(unrevealedBonsCount) : undefined,
        badgeColor: '#DC2626',
      },
      { id: 'reglages', label: 'Réglages', icon: Settings },
    ];
  } else if (role === 'Magasinier') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'receptions', label: 'Réceptions', icon: ArrowDownLeft },
      { id: 'chargements', label: 'Chargements', icon: Truck },
      { id: 'retours', label: 'Retours', icon: RotateCcw },
      { id: 'inventaire', label: 'Inventaire', icon: ClipboardList },
      { id: 'stock-depot', label: 'Stock dépôt', icon: Package },
      { id: 'lots', label: 'Lots', icon: Boxes },
      { id: 'demandes-achat', label: "Demandes d'achat", icon: ShoppingBag },
      { id: 'bons-a-remettre', label: 'Bons à remettre', icon: FileCheck },
    ];
  } else if (role === 'Comptable') {
    menuItems = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'versements', label: 'Versements', icon: DollarSign },
      { id: 'soldes-vendeurs', label: 'Soldes vendeurs', icon: CreditCard },
      { id: 'factures', label: 'Factures', icon: Receipt },
      { id: 'caisse', label: 'Caisse', icon: Wallet },
      { id: 'demandes-achat', label: "Demandes d'achat", icon: ShoppingBag },
      { id: 'ventes-lecture', label: 'Ventes (lecture)', icon: ShoppingCart },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
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

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 h-dvh max-h-screen overflow-hidden bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header with Baobab Logo */}
        <div className="shrink-0 px-4 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 flex items-center justify-center">
              <BaobabLogo logoUrl={logoUrl} size={42} variant="sidebar" />
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight">
              Baobab Distribution
            </div>
          </div>
        </div>

        {/* Exact Menu Items List (Hors rôle supprimées) */}
        <nav className="flex-1 min-h-0 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-3.5 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Menu {role} ({menuItems.length})
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-semibold transition ${
                  isActive
                    ? 'bg-[#008DA9] text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-bold text-white shrink-0 ml-1.5"
                    style={{ backgroundColor: item.badgeColor || '#DC2626' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer - Déconnexion */}
        <div className="shrink-0 p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold text-rose-600 bg-rose-50/80 hover:bg-rose-100 dark:text-rose-400 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 border border-rose-200/60 dark:border-rose-900/50 transition"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-[18px] h-[18px] shrink-0" />
              <span>Déconnexion</span>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </aside>
    </>
  );
};
