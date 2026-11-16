import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  FileSpreadsheet,
  Store,
  Settings,
  Package,
  ArrowDownLeft,
  Truck,
  RotateCcw,
  CreditCard,
  Receipt,
  DollarSign,
  PlusCircle,
  Boxes,
  ShoppingCart,
  ClipboardList
} from 'lucide-react';
import { UserSession } from './LoginScreen';

interface BottomNavBarProps {
  currentUser: UserSession;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface BottomTabItem {
  id: string;
  label: string; // 1 mot <= 8 caractères
  icon: React.FC<{ className?: string }>;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
}) => {
  const role = currentUser.role;

  // 5 colonnes égales, un mot de 8 caractères maximum, fond plein opaque
  let items: BottomTabItem[] = [];

  if (role === 'Administrateur') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'stats', label: 'Stats', icon: BarChart3 },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
      { id: 'pdvs', label: 'PDV', icon: Store },
      { id: 'reglages', label: 'Réglages', icon: Settings },
    ];
  } else if (role === 'Directeur des opérations de vente' || /directeur|op[eé]ration|dov/i.test(role || '')) {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'ventes', label: 'Ventes', icon: ShoppingCart },
      { id: 'historique-sku', label: 'SKU', icon: BarChart3 },
      { id: 'validation-pdv', label: 'Valid.', icon: Store },
      { id: 'demande-stock-vendeur', label: 'Stock', icon: Truck },
    ];
  } else if (role === 'Sales Admin') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'receptions', label: 'Entrées', icon: ArrowDownLeft },
      { id: 'chargements', label: 'Appros', icon: Truck },
      { id: 'ventes', label: 'Ventes', icon: ShoppingCart },
      { id: 'inventaire', label: 'Invent.', icon: ClipboardList },
    ];
  } else if (role === 'Gestionnaire grossiste' || /grossiste/i.test(role || '') || currentUser.code?.startsWith('BAO-GRS')) {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'commandes-gros', label: 'Gros', icon: ShoppingCart },
      { id: 'nouvelle-commande-gros', label: 'Créer', icon: PlusCircle },
      { id: 'clients-gros', label: 'Clients', icon: Store },
      { id: 'stock-depot', label: 'Dépôt', icon: Package },
    ];
  } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'stock-depot', label: 'Dépôt', icon: Package },
      { id: 'receptions', label: 'Entrées', icon: ArrowDownLeft },
      { id: 'chargements', label: 'Sorties', icon: Truck },
      { id: 'retours', label: 'Retours', icon: RotateCcw },
    ];
  } else if (role === 'Comptable') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'caisse', label: 'Caisse', icon: DollarSign },
      { id: 'soldes-vendeurs', label: 'Soldes', icon: CreditCard },
      { id: 'factures', label: 'Factures', icon: Receipt },
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },
    ];
  } else {
    // Vendeur
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
      { id: 'nouvelle-vente', label: 'Vente', icon: PlusCircle },
      { id: 'mon-stock', label: 'Stock', icon: Boxes },
      { id: 'mes-pdvs', label: 'PDV', icon: Store },
      { id: 'mon-solde', label: 'Solde', icon: CreditCard },
    ];
  }

  return (
    <div className="fixed bottom-0 left-0 lg:left-60 right-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
      <nav className="baobab-bottom-nav-grid grid grid-cols-[repeat(5,minmax(0,1fr))] w-full h-16 max-w-7xl mx-auto">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive =
            activeTab === it.id ||
            (it.id === 'dashboard' && activeTab === 'dashboard') ||
            (it.id === 'pdvs' && (activeTab === 'pdvs' || activeTab === 'validation-pdv' || activeTab === 'carte')) ||
            (it.id === 'mes-pdvs' && (activeTab === 'mes-pdvs' || activeTab === 'nouveau-pdv' || activeTab === 'carte')) ||
            (it.id === 'stock-depot' && (activeTab === 'stock-depot' || activeTab === 'lots' || activeTab === 'inventaire')) ||
            (it.id === 'caisse' && (activeTab === 'caisse' || activeTab === 'versements')) ||
            (it.id === 'mon-stock' && (activeTab === 'mon-stock' || activeTab === 'mon-chargement' || activeTab === 'mes-chargements'));

          return (
            <button
              key={it.id}
              onClick={() => setActiveTab(it.id)}
              className={`flex flex-col items-center justify-center w-full min-w-0 h-full transition relative text-center px-0.5 cursor-pointer ${
                isActive
                  ? 'bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-3 right-3 h-0.5 bg-[var(--marque-fonce)] dark:bg-[var(--marque-eclaircie)] rounded-full" />
              )}
              <Icon
                className={`w-4 h-4 mb-1 shrink-0 ${
                  isActive
                    ? 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] stroke-[2.5]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              <span className="baobab-bottom-nav-label w-full text-center">
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
