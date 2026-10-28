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
  Boxes
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
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard }, // 7 chars
      { id: 'stats', label: 'Stats', icon: BarChart3 },           // 5 chars
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet }, // 8 chars
      { id: 'pdvs', label: 'PDV', icon: Store },                  // 3 chars
      { id: 'reglages', label: 'Réglages', icon: Settings },      // 8 chars
    ];
  } else if (role === 'Magasinier') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard }, // 7 chars
      { id: 'stock-depot', label: 'Dépôt', icon: Package },        // 5 chars
      { id: 'receptions', label: 'Entrées', icon: ArrowDownLeft }, // 7 chars
      { id: 'chargements', label: 'Sorties', icon: Truck },        // 7 chars
      { id: 'retours', label: 'Retours', icon: RotateCcw },        // 7 chars
    ];
  } else if (role === 'Comptable') {
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },   // 7 chars
      { id: 'caisse', label: 'Caisse', icon: DollarSign },            // 6 chars
      { id: 'soldes-vendeurs', label: 'Soldes', icon: CreditCard },   // 6 chars
      { id: 'factures', label: 'Factures', icon: Receipt },           // 8 chars
      { id: 'rapports', label: 'Rapports', icon: FileSpreadsheet },   // 8 chars
    ];
  } else {
    // Vendeur
    items = [
      { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },  // 7 chars
      { id: 'nouvelle-vente', label: 'Vente', icon: PlusCircle },    // 5 chars
      { id: 'mon-stock', label: 'Stock', icon: Boxes },              // 5 chars
      { id: 'mes-pdvs', label: 'PDV', icon: Store },                 // 3 chars
      { id: 'mon-solde', label: 'Solde', icon: CreditCard },         // 5 chars
    ];
  }

  return (
    <div className="fixed bottom-0 left-0 lg:left-64 right-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl transition-colors">
      <nav className="grid grid-cols-5 w-full h-16 max-w-7xl mx-auto">
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
              className={`flex flex-col items-center justify-center w-full h-full transition relative text-center px-1 cursor-pointer ${
                isActive
                  ? 'text-[#008DA9] dark:text-teal-400 font-extrabold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-3 right-3 h-0.5 bg-[#008DA9] dark:bg-teal-400 rounded-full" />
              )}
              <Icon className={`w-4 h-4 mb-1 shrink-0 ${isActive ? 'text-[#008DA9] dark:text-teal-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-400'}`} />
              <span className="text-[11px] truncate w-full text-center tracking-tight leading-none">
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
