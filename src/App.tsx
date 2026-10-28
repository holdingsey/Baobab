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
import { isAppOnline, syncPendingOfflineData } from './utils/offlineSync';
import {
  clearAppBadge,
  closeSystemNotifications,
  ensureUserAuthToken,
  syncAppBadge,
} from './utils/pushNotifications';

function resolveTabForRole(tab: string, role: UserSession['role']): string {
  if (role === 'Vendeur') {
    if (tab === 'chargements') return 'mon-chargement';
    if (tab === 'versements') return 'mes-versements';
    if (tab === 'pdvs' || tab === 'validation-pdv') return 'mes-pdvs';
    if (tab === 'cadeaux' || tab === 'bons-a-remettre') return 'mes-cadeaux';
    if (tab === 'factures') return 'mes-factures';
    if (tab === 'retours') return 'mon-stock';
  } else if (role === 'Magasinier') {
    if (tab === 'mon-chargement' || tab === 'mes-chargements') return 'chargements';
    if (tab === 'mes-cadeaux') return 'bons-a-remettre';
  } else if (role === 'Comptable') {
    if (tab === 'mes-versements') return 'versements';
    if (tab === 'mes-factures') return 'factures';
  } else if (role === 'Administrateur') {
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
      id: 'usr-mag',
      code: 'BAO-MAG',
      name: 'Moussa Diarra',
      email: 'magasin@baobab.ml',
      role: 'Magasinier',
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
          if (parsed && parsed.id && parsed.role) return parsed;
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
      metaThemeColor.setAttribute('content', isDark ? '#020617' : '#0284c7');
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

  // Load all data
  const loadData = async () => {
    try {
      // 1. Settings
      const setRes = await fetch('/api/settings').catch(() => null);
      if (setRes && setRes.ok) {
        const d = await setRes.json();
        if (d.settings?.logo_url) setLogoUrl(d.settings.logo_url);
      }

      // 2. Users
      const uRes = await fetch('/api/users').catch(() => null);
      if (uRes && uRes.ok) {
        const d = await uRes.json();
        if (d.users && d.users.length > 0) {
          setUsersList(d.users);
          // Update current user reference if exists
          setCurrentUser(prev => (prev ? d.users.find((u: any) => u.id === prev.id) || d.users[0] : null));
        }
      }

      // 3. Products
      const pRes = await fetch('/api/products').catch(() => null);
      if (pRes && pRes.ok) {
        const d = await pRes.json();
        if (d.products) setProducts(d.products);
      }

      // 4. Gammes (lues dynamiquement depuis la base de données)
      const gRes = await fetch('/api/gammes').catch(() => null);
      if (gRes && gRes.ok) {
        const d = await gRes.json();
        if (d.gammes) setGammes(d.gammes);
      }

      // 5. PDVs
      const pdvRes = await fetch('/api/pdvs').catch(() => null);
      if (pdvRes && pdvRes.ok) {
        const d = await pdvRes.json();
        if (d.pdvs) setPdvs(d.pdvs);
      }

      // 6. Sales (6 mois)
      const sRes = await fetch('/api/sales').catch(() => null);
      if (sRes && sRes.ok) {
        const d = await sRes.json();
        if (d.sales) setSales(d.sales);
      }

      // 7. Versements
      const vRes = await fetch('/api/versements').catch(() => null);
      if (vRes && vRes.ok) {
        const d = await vRes.json();
        if (d.versements) setVersements(d.versements);
      }

      // 8. Chargements
      const chgRes = await fetch('/api/chargements').catch(() => null);
      if (chgRes && chgRes.ok) {
        const d = await chgRes.json();
        if (d.chargements) setChargements(d.chargements);
      }

      // 9. Réceptions
      const recpRes = await fetch('/api/receptions').catch(() => null);
      if (recpRes && recpRes.ok) {
        const d = await recpRes.json();
        if (d.receptions) setReceptions(d.receptions);
      }

      // 10. Vendor balances
      const balRes = await fetch('/api/vendor-balances').catch(() => null);
      if (balRes && balRes.ok) {
        const d = await balRes.json();
        if (d.balances) setBalances(d.balances);
      }

      // 11. Semester Bons (sans montant si non révélé)
      const bonsRes = await fetch('/api/bons').catch(() => null);
      if (bonsRes && bonsRes.ok) {
        const d = await bonsRes.json();
        if (d.bons) setBons(d.bons);
      }

      // 12. Purchase Requests (Demandes d'achat Magasinier & Comptable -> Validation Admin)
      const prRes = await fetch('/api/purchase-requests').catch(() => null);
      if (prRes && prRes.ok) {
        const d = await prRes.json();
        if (d.purchaseRequests) setPurchaseRequests(d.purchaseRequests);
      }

      // Rafraîchit immédiatement le compteur de la cloche et le badge de l'icône après traitement d'un élément
      window.dispatchEvent(new Event('baobab-notifications-updated'));
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleSwitchRole = (newRole: 'Administrateur' | 'Magasinier' | 'Comptable' | 'Vendeur') => {
    const targetUser = usersList.find(u => u.role === newRole) || usersList[0];
    setCurrentUser(targetUser);
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
          setCurrentUser(user);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const pendingPdvsCount = pdvs.filter(p => p.status === 'en_attente').length;
  const pendingPurchaseRequestsCount = purchaseRequests.filter(pr => pr.status === 'en_attente').length;
  const unrevealedBonsCount =
    currentUser.role === 'Vendeur'
      ? bons.filter(b => b.vendor_id === currentUser.id && !b.revealed).length
      : bons.filter(b => !b.revealed).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
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
      />

      <div className="lg:pl-72 flex flex-col flex-1 min-w-0">
        {/* Header (32px logo, "Baobab" next to it on PC) */}
        <Header
          currentUser={currentUser}
          usersList={usersList}
          logoUrl={logoUrl}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onSwitchRole={handleSwitchRole}
          onSwitchUser={(user) => setCurrentUser(user)}
          onOpenDocument={(doc) => setSelectedDocument(doc)}
          onNavigateTab={(tab) => setActiveTab(resolveTabForRole(tab, currentUser.role))}
        />

        {/* Main Content Area */}
        <main className="flex-1 pb-24">
          {(activeTab === 'dashboard' || activeTab === 'stats') && (
            <DashboardView
              currentUser={currentUser}
              sales={sales}
              versements={versements}
              products={products}
              pdvs={pdvs}
              chargements={chargements}
              balances={balances}
              logoUrl={logoUrl}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'ventes' ||
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
              onRefreshUsers={loadData}
            />
          )}

          {(activeTab === 'cadeaux' || activeTab === 'mes-cadeaux') && (
            <CadeauxView
              currentUser={currentUser}
              pdvs={pdvs}
              logoUrl={logoUrl}
              onBonUpdated={loadData}
            />
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
