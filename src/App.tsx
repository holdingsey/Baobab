/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginScreen, UserSession } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { VentesView } from './components/VentesView';
import { PdvView } from './components/PdvView';
import { DepotMagasinView } from './components/DepotMagasinView';
import { ComptaView } from './components/ComptaView';
import { CatalogView } from './components/CatalogView';
import { UsersAdminView } from './components/UsersAdminView';
import { IdentitySettings } from './components/IdentitySettings';
import { CartePdvView } from './components/CartePdvView';
import { CadeauxView } from './components/CadeauxView';
import { BottomNavBar } from './components/BottomNavBar';
import { PrintableDocument, InvoiceData } from './components/PrintableDocument';
import { VendorStockView } from './components/VendorStockView';
import { DemandesAchatView } from './components/DemandesAchatView';
import { GrossisteView } from './components/GrossisteView';
import { ExtractionsView } from './components/ExtractionsView';
import { isAppOnline, syncPendingOfflineData } from './utils/offlineSync';
import {
  clearAppBadge,
  closeSystemNotifications,
  ensureUserAuthToken,
  syncAppBadge,
} from './utils/pushNotifications';

function resolveTabForRole(tab: string, role: UserSession['role']): string {
  if (role === 'Vendeur') {
    if (tab === 'extractions') return 'dashboard';
    if (tab === 'chargements') return 'mon-chargement';
    if (tab === 'versements') return 'mes-versements';
    if (tab === 'pdvs' || tab === 'validation-pdv') return 'mes-pdvs';
    if (tab === 'cadeaux' || tab === 'bons-a-remettre') return 'mes-cadeaux';
    if (tab === 'factures') return 'mes-factures';
    if (tab === 'retours') return 'mon-stock';
  } else if (role === 'Sales Admin') {
    if (tab === 'mon-chargement' || tab === 'mes-chargements' || tab === 'chargements-lecture') return 'chargements';
    if (tab === 'mes-ventes' || tab === 'ventes-lecture' || tab === 'nouvelle-vente') return 'ventes';
    if (tab === 'mon-stock') return 'inventaire';
  } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
    if (tab === 'mon-chargement' || tab === 'mes-chargements') return 'chargements';
    if (tab === 'mes-cadeaux') return 'bons-a-remettre';
  } else if (role === 'Comptable') {
    if (tab === 'mes-versements') return 'versements';
    if (tab === 'mes-factures') return 'factures';
  } else if (role === 'Administrateur' || role === 'Directeur des opérations de vente') {
    if (tab === 'mes-pdvs') return 'validation-pdv';
  }
  return tab;
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('baobab_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Users list from DB
  const [usersList, setUsersList] = useState<UserSession[]>([
    {
      id: 'usr-adm',
      code: 'BAO-ADM',
      name: 'Amadou Touré',
      email: 'admin@baobab.ml',
      role: 'Administrateur',
      phone: '+223 76 01 23 45',
      team: 'Direction Générale',
      must_change_password: 0,
    },
    {
      id: 'usr-dov',
      code: 'BAO-DOV',
      name: 'Ibrahim Sangaré',
      email: 'dov@baobab.ml',
      role: 'Directeur des opérations de vente',
      phone: '+223 76 40 50 60',
      team: 'Direction des Opérations de Vente',
      must_change_password: 0,
    },
    {
      id: 'usr-sad',
      code: 'BAO-SAD',
      name: 'Salif Keïta',
      email: 'controleur@baobab.ml',
      role: 'Sales Admin',
      phone: '+223 76 55 88 99',
      team: 'Contrôle & Inventaires',
      must_change_password: 0,
    },
    {
      id: 'usr-grs',
      code: 'BAO-GRS',
      name: 'Cheick Oumar Diallo',
      email: 'grossiste@baobab.ml',
      role: 'Gestionnaire grossiste',
      phone: '+223 76 80 90 10',
      team: 'Département Ventes en Gros & Grands Comptes',
      must_change_password: 0,
    },
    {
      id: 'usr-mag',
      code: 'BAO-MAG',
      name: 'Moussa Diarra',
      email: 'magasin@baobab.ml',
      role: 'Gestionnaire de stock',
      phone: '+223 66 12 34 56',
      team: 'Dépôt Central Sotuba',
      must_change_password: 0,
    },
    {
      id: 'usr-cpt',
      code: 'BAO-CPT',
      name: 'Fatoumata Coulibaly',
      email: 'compta@baobab.ml',
      role: 'Comptable',
      phone: '+223 70 98 76 54',
      team: 'Service Comptabilité & Caisse',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-1',
      code: 'BAO-VND-001',
      name: 'Oumar Konaté',
      email: 'vendeur1@baobab.ml',
      role: 'Vendeur',
      phone: '+223 75 44 22 11',
      team: 'Équipe Sotuba / Rive Gauche',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-2',
      code: 'BAO-VND-002',
      name: 'Bakary Sidibé',
      email: 'vendeur2@baobab.ml',
      role: 'Vendeur',
      phone: '+223 69 88 77 66',
      team: 'Équipe Badalabougou / Rive Droite',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-3',
      code: 'BAO-VND-003',
      name: 'Seydou Diakité',
      email: 'vendeur3@baobab.ml',
      role: 'Vendeur',
      phone: '+223 73 11 00 99',
      team: 'Équipe Centre Commercial / Commune 3',
      must_change_password: 1, // mot de passe provisoire
    },
  ]);

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedUser = localStorage.getItem('baobab_current_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id && parsed.role) {
            if (parsed.role === 'Magasinier' || parsed.code === 'BAO-MAG') {
              parsed.role = 'Gestionnaire de stock';
            }
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return usersList[0];
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const requestedTab = params.get('tab');
      if (requestedTab) return requestedTab;
    }
    return 'dashboard';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('/logo.png');

  // Business state
  const [products, setProducts] = useState<any[]>([]);
  const [gammes, setGammes] = useState<string[]>([]);
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [versements, setVersements] = useState<any[]>([]);
  const [chargements, setChargements] = useState<any[]>([]);
  const [receptions, setReceptions] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [bons, setBons] = useState<any[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [wholesaleClients, setWholesaleClients] = useState<any[]>([]);
  const [wholesaleOrders, setWholesaleOrders] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<InvoiceData | null>(null);
  const [externalRectificationSaleId, setExternalRectificationSaleId] = useState<string | null>(null);

  // Sync theme
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const isDark = theme === 'dark';

    if (isDark) {
      root.classList.add('dark');
      body?.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body?.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }

    // Update mobile browser status bar color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#0F172A' : '#008DA9');
    }

    localStorage.setItem('baobab_theme', theme);
  }, [theme]);

  // Persist currentUser & ensure auth token for push subscriptions
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem('baobab_current_user', JSON.stringify(currentUser));
      } catch {
        // ignore
      }
      ensureUserAuthToken(currentUser.id, currentUser.role);
    }
  }, [currentUser]);

  // Gère l'ouverture depuis une notification système (URL ?tab=...&notifId=...)
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const notifIdParam = params.get('notifId');

    if (tabParam) {
      setActiveTab(resolveTabForRole(tabParam, currentUser.role));
    }
    if (notifIdParam) {
      closeSystemNotifications({ notificationId: notifIdParam });
      fetch(`/api/notifications/${encodeURIComponent(notifIdParam)}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ role: currentUser.role, userId: currentUser.id }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d && typeof d.unreadCount === 'number') {
            syncAppBadge(d.unreadCount);
          }
          window.dispatchEvent(new Event('baobab-notifications-updated'));
        })
        .catch(() => {});
    }
    if (tabParam || notifIdParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [currentUser]);

  // Load all data in parallel to avoid 14 sequential re-renders and UI stutter on mobile
  const loadData = async () => {
    try {
      const [
        setRes,
        uRes,
        pRes,
        gRes,
        pdvRes,
        sRes,
        vRes,
        chgRes,
        recpRes,
        balRes,
        bonsRes,
        prRes,
        wcRes,
        woRes,
      ] = await Promise.all([
        fetch('/api/settings').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/users').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/products').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/gammes').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/pdvs').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/sales').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/versements').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/chargements').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/receptions').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/vendor-balances').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/bons').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/purchase-requests').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/wholesale/clients').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/wholesale/orders').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (setRes?.settings?.logo_url) setLogoUrl(setRes.settings.logo_url);

      if (uRes?.users && uRes.users.length > 0) {
        const normalizedUsers = uRes.users.map((u: any) => ({
          ...u,
          role: u.role === 'Magasinier' || u.code === 'BAO-MAG' ? 'Gestionnaire de stock' : u.role,
        }));
        setUsersList(normalizedUsers);
        setCurrentUser((prev) => {
          if (!prev) return normalizedUsers[0];
          const isPrevDov =
            prev.role === 'Directeur des opérations de vente' ||
            /directeur|op[eé]ration|dov/i.test(prev.role || '') ||
            prev.code === 'BAO-DOV';
          const isPrevSad =
            prev.role === 'Sales Admin' || /sales|contr/i.test(prev.role || '') || prev.code === 'BAO-SAD';
          const isPrevGrs =
            prev.role === 'Gestionnaire grossiste' ||
            /grossiste/i.test(prev.role || '') ||
            Boolean(prev.code?.startsWith('BAO-GRS'));
          const isPrevMag =
            !isPrevGrs &&
            (prev.role === 'Gestionnaire de stock' ||
              prev.role === 'Magasinier' ||
              /gestionnaire|magas/i.test(prev.role || '') ||
              prev.code === 'BAO-MAG');
          const matched =
            normalizedUsers.find((u: any) => u.id === prev.id) ||
            normalizedUsers.find((u: any) => u.code === prev.code) ||
            (isPrevDov
              ? normalizedUsers.find(
                  (u: any) => /directeur|op[eé]ration|dov/i.test(u.role || '') || u.code === 'BAO-DOV'
                )
              : null) ||
            (isPrevSad
              ? normalizedUsers.find((u: any) => u.role === 'Sales Admin' || u.code === 'BAO-SAD')
              : null) ||
            (isPrevGrs
              ? normalizedUsers.find(
                  (u: any) => /grossiste/i.test(u.role || '') || u.code?.startsWith('BAO-GRS')
                )
              : null) ||
            (isPrevMag
              ? normalizedUsers.find(
                  (u: any) => u.role === 'Gestionnaire de stock' || u.code === 'BAO-MAG'
                )
              : null) ||
            normalizedUsers.find((u: any) => u.role === prev.role) ||
            prev;
          if (matched && (matched.role === 'Magasinier' || matched.code === 'BAO-MAG')) {
            return { ...matched, role: 'Gestionnaire de stock' };
          }
          return matched;
        });
      }

      if (pRes?.products) setProducts(pRes.products);
      if (gRes?.gammes) setGammes(gRes.gammes);
      if (pdvRes?.pdvs) setPdvs(pdvRes.pdvs);
      if (sRes?.sales) setSales(sRes.sales);
      if (vRes?.versements) setVersements(vRes.versements);
      if (chgRes?.chargements) setChargements(chgRes.chargements);
      if (recpRes?.receptions) setReceptions(recpRes.receptions);
      if (balRes?.balances) setBalances(balRes.balances);
      if (bonsRes?.bons) setBons(bonsRes.bons);
      if (prRes?.purchaseRequests) setPurchaseRequests(prRes.purchaseRequests);
      if (wcRes?.wholesaleClients) setWholesaleClients(wcRes.wholesaleClients);
      if (woRes?.wholesaleOrders) setWholesaleOrders(woRes.wholesaleOrders);

      window.dispatchEvent(new Event('baobab-notifications-updated'));
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sauvegarde automatique du cache local pour la recherche en mode hors ligne
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cachePayload = {
        products,
        pdvs,
        sales,
        versements,
        chargements,
        receptions,
        balances,
        bons,
        usersList,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('baobab_offline_search_cache', JSON.stringify(cachePayload));
    } catch {
      // ignore storage quota errors
    }
  }, [products, pdvs, sales, versements, chargements, receptions, balances, bons, usersList]);

  // Global listener: synchronize offline sales & GPS positions automatically when network becomes available
  useEffect(() => {
    const handleGlobalReconnect = async () => {
      if (isAppOnline()) {
        const res = await syncPendingOfflineData(currentUser?.role || 'Vendeur');
        if (res) {
          loadData();
        }
      }
    };

    window.addEventListener('online', handleGlobalReconnect);
    window.addEventListener('baobab-network-change', handleGlobalReconnect);
    window.addEventListener('baobab-sync-completed', loadData);
    return () => {
      window.removeEventListener('online', handleGlobalReconnect);
      window.removeEventListener('baobab-network-change', handleGlobalReconnect);
      window.removeEventListener('baobab-sync-completed', loadData);
    };
  }, [currentUser?.role]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSwitchRole = (newRole: 'Administrateur' | 'Directeur des opérations de vente' | 'Sales Admin' | 'Gestionnaire grossiste' | 'Gestionnaire de stock' | 'Magasinier' | 'Comptable' | 'Vendeur') => {
    const isDov = newRole === 'Directeur des opérations de vente' || /directeur|op[eé]ration|dov/i.test(newRole);
    const isSad = newRole === 'Sales Admin' || /sales|contr/i.test(newRole);
    const isGrs = newRole === 'Gestionnaire grossiste' || /grossiste/i.test(newRole);
    const isMag = !isGrs && (newRole === 'Gestionnaire de stock' || newRole === 'Magasinier' || /gestionnaire|magas/i.test(newRole));
    const targetUser =
      usersList.find(u =>
        isDov
          ? /directeur|op[eé]ration|dov/i.test(u.role || '') || u.code === 'BAO-DOV'
          : isSad
          ? u.role === 'Sales Admin' || u.code === 'BAO-SAD'
          : isGrs
          ? /grossiste/i.test(u.role || '') || u.code?.startsWith('BAO-GRS')
          : isMag
          ? u.role === 'Gestionnaire de stock' || u.role === 'Magasinier' || u.code === 'BAO-MAG'
          : u.role === newRole
      ) ||
      usersList.find(u => u.role.toLowerCase() === newRole.toLowerCase()) ||
      usersList[0];
    const normalized = (targetUser && (targetUser.role === 'Magasinier' || targetUser.code === 'BAO-MAG'))
      ? { ...targetUser, role: 'Gestionnaire de stock' as const }
      : targetUser;
    setCurrentUser(normalized);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    clearAppBadge();
    closeSystemNotifications({ closeAll: true });
    try {
      localStorage.removeItem('baobab_current_user');
    } catch {
      // ignore
    }
    setCurrentUser(null);
  };

  // Login Screen
  if (!currentUser) {
    return (
      <LoginScreen
        logoUrl={logoUrl}
        usersList={usersList}
        onLogin={(user) => {
          const normalized = (user && (user.role === 'Magasinier' || user.code === 'BAO-MAG'))
            ? { ...user, role: 'Gestionnaire de stock' as const }
            : user;
          setCurrentUser(normalized);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const pendingPdvsCount = pdvs.filter(p => p.status === 'en_attente').length;
  const pendingPurchaseRequestsCount = purchaseRequests.filter(pr => pr.status === 'en_attente').length;
  const pendingReceptionsCount = receptions.filter(r => r.status === 'en_attente').length;
  const unrevealedBonsCount =
    currentUser.role === 'Vendeur'
      ? bons.filter(b => b.vendor_id === currentUser.id && !b.revealed).length
      : bons.filter(b => !b.revealed).length;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Sidebar with Baobab logo & role modules */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        logoUrl={logoUrl}
        onLogout={handleLogout}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        pendingPdvsCount={pendingPdvsCount}
        unrevealedBonsCount={unrevealedBonsCount}
        pendingPurchaseRequestsCount={pendingPurchaseRequestsCount}
        pendingReceptionsCount={pendingReceptionsCount}
      />

      <div className="lg:pl-72 flex flex-col flex-1 min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Header (32px logo, "Baobab" next to it on PC) */}
        <Header
          currentUser={currentUser}
          usersList={usersList}
          logoUrl={logoUrl}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onSwitchRole={handleSwitchRole}
          onSwitchUser={(user) => {
            const normalized = (user && (user.role === 'Magasinier' || user.code === 'BAO-MAG'))
              ? { ...user, role: 'Gestionnaire de stock' as const }
              : user;
            setCurrentUser(normalized);
            setActiveTab('dashboard');
          }}
          onOpenDocument={(doc) => setSelectedDocument(doc)}
          onNavigateTab={(tab) => setActiveTab(resolveTabForRole(tab, currentUser.role))}
          onSelectSearchResult={(item) => {
            if (item.url) {
              try {
                const urlObj = new URL(item.url, window.location.origin);
                const tab = urlObj.searchParams.get('tab');
                if (tab) {
                  setActiveTab(resolveTabForRole(tab, currentUser.role));
                }
              } catch {
                // ignore
              }
            }
            if (item.type === 'factures') {
              const matchedSale = sales.find(
                (s) =>
                  String(s.id) === String(item.id) ||
                  String(s.invoice_number) === String(item.reference)
              );
              if (matchedSale && Array.isArray(matchedSale.items) && matchedSale.items.length > 0) {
                const matchedPdv = pdvs.find((p) => p.id === matchedSale.pdv_id || p.name === matchedSale.pdv_name);
                const matchedVendor = usersList.find((u) => u.id === matchedSale.vendor_id || u.name === matchedSale.vendor_name);
                setSelectedDocument({
                  id: matchedSale.id,
                  number: matchedSale.invoice_number || matchedSale.id,
                  type: 'facture',
                  date: String(matchedSale.date || '').split('T')[0] || '',
                  saleTime: String(matchedSale.date || '').includes('T')
                    ? String(matchedSale.date).split('T')[1]?.slice(0, 5)
                    : undefined,
                  clientName: matchedSale.pdv_name || 'Client PDV',
                  clientPhone: matchedPdv?.phone || '',
                  pdvName: matchedSale.pdv_name,
                  pdvCode: matchedPdv?.code,
                  pdvNeighborhood: matchedPdv ? `${matchedPdv.quartier || ''}, ${matchedPdv.commune || ''}` : undefined,
                  pdvManager: matchedPdv?.owner,
                  pdvPhone: matchedPdv?.phone,
                  vendorId: matchedSale.vendor_id,
                  vendorName: matchedSale.vendor_name,
                  vendorCode: matchedVendor?.code,
                  vendorTeam: matchedVendor?.team,
                  vendorPhone: matchedVendor?.phone,
                  saleId: matchedSale.id,
                  saleNumber: matchedSale.id,
                  thermalTicketNumber: matchedSale.thermal_ticket_number,
                  items: matchedSale.items.map((it: any) => ({
                    code: it.code || it.product_id || '',
                    name: it.name || it.product_name || 'Produit',
                    qty: Number(it.qty || 0),
                    price: Number(it.price || 0),
                    total: Number(it.total || Number(it.qty || 0) * Number(it.price || 0)),
                  })),
                  total: Number(matchedSale.total || 0),
                  paymentMethod: matchedSale.payment_method || 'Espèces',
                  cashierName: matchedSale.vendor_name || currentUser.name,
                  status:
                    Number(matchedSale.amount_paid ?? matchedSale.total ?? 0) < Number(matchedSale.total ?? 0)
                      ? 'Impayée / Crédit'
                      : 'Payée',
                });
              }
            }
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 pb-24 w-full max-w-full min-w-0 overflow-x-hidden">
          {(activeTab === 'dashboard' || activeTab === 'stats') && (
            <DashboardView
              currentUser={currentUser}
              sales={sales}
              versements={versements}
              products={products}
              pdvs={pdvs}
              chargements={chargements}
              receptions={receptions}
              balances={balances}
              wholesaleClients={wholesaleClients}
              wholesaleOrders={wholesaleOrders}
              logoUrl={logoUrl}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'commandes-gros' ||
            activeTab === 'nouvelle-commande-gros' ||
            activeTab === 'clients-gros') && (
            <GrossisteView
              currentUser={currentUser}
              products={products}
              wholesaleClients={wholesaleClients}
              wholesaleOrders={wholesaleOrders}
              initialTab={activeTab}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onRefreshData={loadData}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'ventes' ||
            activeTab === 'demandes-annulation-vente' ||
            activeTab === 'historique-sku' ||
            activeTab === 'ventes-lecture' ||
            activeTab === 'nouvelle-vente' ||
            activeTab === 'mes-ventes') && (
            <VentesView
              products={products}
              pdvs={pdvs}
              currentUser={currentUser}
              usersList={usersList}
              sales={sales}
              chargements={chargements}
              initialTab={activeTab}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'mon-stock' && (
            <VendorStockView
              products={products}
              chargements={chargements}
              sales={sales}
              currentUser={currentUser}
              onRefreshData={loadData}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'pdvs' || activeTab === 'mes-pdvs') && (
            <PdvView
              pdvs={pdvs}
              sales={sales}
              currentRole={currentUser.role}
              currentUser={currentUser}
              onRefreshPdvs={loadData}
              onPdvCreated={(newPdv) => setPdvs(prev => [newPdv, ...prev])}
              initialFilter="all"
            />
          )}

          {activeTab === 'validation-pdv' && (
            <PdvView
              pdvs={pdvs}
              sales={sales}
              currentRole={currentUser.role}
              currentUser={currentUser}
              onRefreshPdvs={loadData}
              onPdvCreated={(newPdv) => setPdvs(prev => [newPdv, ...prev])}
              initialFilter="en_attente"
            />
          )}

          {activeTab === 'nouveau-pdv' && (
            <PdvView
              pdvs={pdvs}
              sales={sales}
              currentRole={currentUser.role}
              currentUser={currentUser}
              onRefreshPdvs={loadData}
              onPdvCreated={(newPdv) => setPdvs(prev => [newPdv, ...prev])}
              initialOpenCreate={true}
            />
          )}

          {activeTab === 'carte' && (
            <CartePdvView
              pdvs={pdvs}
              sales={sales}
              currentUser={currentUser}
            />
          )}

          {(activeTab === 'stocks' ||
            activeTab === 'stock-depot' ||
            activeTab === 'lots' ||
            activeTab === 'inventaire' ||
            activeTab === 'retours' ||
            activeTab === 'bons-a-remettre' ||
            activeTab === 'receptions' ||
            activeTab === 'chargements' ||
            activeTab === 'chargements-lecture' ||
            activeTab === 'demande-stock-vendeur' ||
            activeTab === 'mon-chargement' ||
            activeTab === 'mes-chargements') && (
            <DepotMagasinView
              products={products}
              chargements={chargements}
              receptions={receptions}
              currentRole={currentUser.role}
              currentUser={currentUser}
              initialTab={activeTab}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onRefreshData={loadData}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
            />
          )}

          {(activeTab === 'compta' ||
            activeTab === 'versements' ||
            activeTab === 'versements-lecture' ||
            activeTab === 'soldes-vendeurs' ||
            activeTab === 'factures' ||
            activeTab === 'mes-factures' ||
            activeTab === 'caisse' ||
            activeTab === 'rapports' ||
            activeTab === 'mon-solde' ||
            activeTab === 'mes-versements') && (
            <ComptaView
              balances={balances}
              versements={versements}
              sales={sales}
              products={products}
              pdvs={pdvs}
              currentRole={currentUser.role}
              currentUser={currentUser}
              initialTab={activeTab}
              externalRectificationSaleId={externalRectificationSaleId}
              onClearExternalRectification={() => setExternalRectificationSaleId(null)}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onRefreshData={loadData}
            />
          )}

          {activeTab === 'demandes-achat' && (
            <DemandesAchatView
              currentUser={currentUser}
              products={products}
              purchaseRequests={purchaseRequests}
              onRefreshData={loadData}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
            />
          )}

          {activeTab === 'catalogue' && (
            <CatalogView
              products={products}
              gammes={gammes}
              currentRole={currentUser.role}
              onRefreshProducts={loadData}
            />
          )}

          {activeTab === 'utilisateurs' && (
            <UsersAdminView
              users={usersList}
              currentRole={currentUser.role}
              currentUserId={currentUser.id}
              onRefreshUsers={loadData}
              onSwitchUser={(targetUser) => {
                const normalized =
                  targetUser && (targetUser.role === 'Magasinier' || targetUser.code === 'BAO-MAG')
                    ? { ...targetUser, role: 'Gestionnaire de stock' as const }
                    : targetUser;
                setCurrentUser(normalized);
                setActiveTab('dashboard');
              }}
            />
          )}

          {(activeTab === 'cadeaux' || activeTab === 'mes-cadeaux') && (
            <CadeauxView
              currentUser={currentUser}
              pdvs={pdvs}
              logoUrl={logoUrl}
              onBonUpdated={loadData}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
            />
          )}

          {activeTab === 'extractions' && currentUser.role !== 'Vendeur' && (
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
              <ExtractionsView currentUser={currentUser as any} />
            </div>
          )}

          {activeTab === 'reglages' && (
            <IdentitySettings
              currentRole={currentUser.role}
              currentUser={currentUser}
              logoUrl={logoUrl}
              onLogoUpdated={(url) => setLogoUrl(url)}
            />
          )}
        </main>
      </div>

      {/* Bottom Nav Bar (5 colonnes égales, un mot <= 8 caractères, fond plein opaque) */}
      <BottomNavBar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Printable Invoice / Receipt / Mini Thermal Receipt Modal */}
      {selectedDocument && (
        <PrintableDocument
          document={selectedDocument}
          logoUrl={logoUrl}
          currentRole={currentUser.role}
          onClose={() => setSelectedDocument(null)}
          onRequestRectification={(doc) => {
            setSelectedDocument(null);
            setExternalRectificationSaleId(doc.id);
            setActiveTab('mes-factures');
          }}
        />
      )}
    </div>
  );
}
