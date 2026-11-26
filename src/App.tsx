/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginScreen, UserSession } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { VentesView, buildMiniThermalReceiptDoc } from './components/VentesView';
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
import { AlertesView } from './components/AlertesView';
import { RoutineVrsView } from './components/RoutineVrsView';
import { PWAInstallPromptBanner } from './components/PWAInstallButton';
import { isAppOnline, syncPendingOfflineData } from './utils/offlineSync';
import {
  clearAppBadge,
  closeSystemNotifications,
  ensureUserAuthToken,
  syncAppBadge,
} from './utils/pushNotifications';

function resolveTabForRole(tab: string, role: UserSession['role']): string {
  if (role === 'Vendeur') {
    if (tab === 'extractions' || tab === 'alertes') return 'dashboard';
    if (tab === 'historique-sku' || tab === 'ventes' || tab === 'factures' || tab === 'mes-factures') return 'mes-ventes';
    if (tab === 'chargements' || tab === 'mes-chargements') return 'mon-chargement';
    if (tab === 'versements') return 'mes-versements';
    if (tab === 'soldes-vendeurs' || tab === 'caisse' || tab === 'compta') return 'mon-solde';
    if (tab === 'pdvs' || tab === 'validation-pdv') return 'mes-pdvs';
    if (tab === 'cadeaux' || tab === 'bons-a-remettre') return 'mes-cadeaux';
    if (tab === 'retours' || tab === 'stock-depot' || tab === 'stocks' || tab === 'inventaire') return 'mon-stock';
  } else if (role === 'Sales Admin') {
    if (tab === 'mon-chargement' || tab === 'mes-chargements' || tab === 'chargements-lecture') return 'chargements';
    if (tab === 'mes-ventes' || tab === 'ventes-lecture' || tab === 'nouvelle-vente') return 'ventes';
    if (tab === 'mon-stock' || tab === 'stock-depot') return 'inventaire';
    if (tab === 'mes-versements' || tab === 'versements') return 'versements-lecture';
    if (tab === 'pdvs' || tab === 'mes-pdvs' || tab === 'validation-pdv') return 'carte';
  } else if (role === 'Gestionnaire de stock' || role === 'Magasinier') {
    if (tab === 'routine-vrs') return 'dashboard';
    if (tab === 'mon-chargement' || tab === 'mes-chargements') return 'chargements';
    if (tab === 'mes-cadeaux' || tab === 'cadeaux') return 'bons-a-remettre';
    if (tab === 'ventes' || tab === 'mes-ventes') return 'stock-depot';
  } else if (role === 'Facturation' || role === 'Comptable') {
    if (tab === 'routine-vrs') return 'dashboard';
    if (tab === 'mes-versements') return 'versements';
    if (tab === 'mes-factures') return 'factures';
    if (tab === 'mon-solde') return 'soldes-vendeurs';
    if (tab === 'ventes' || tab === 'mes-ventes') return 'ventes-lecture';
    if (tab === 'chargements' || tab === 'mon-chargement') return 'chargements-lecture';
  } else if (role === 'Gestionnaire grossiste') {
    if (tab === 'routine-vrs') return 'dashboard';
    if (tab === 'ventes' || tab === 'mes-ventes') return 'commandes-gros';
    if (tab === 'nouvelle-vente') return 'nouvelle-commande-gros';
    if (tab === 'pdvs' || tab === 'mes-pdvs') return 'clients-gros';
  } else if (role === 'Directeur des opérations de vente') {
    if (tab === 'catalogue') return 'historique-sku';
    if (tab === 'mes-pdvs') return 'pdvs';
    if (tab === 'mes-ventes' || tab === 'nouvelle-vente') return 'ventes';
    if (tab === 'chargements' || tab === 'mon-chargement') return 'demande-stock-vendeur';
  } else if (role === 'Administrateur') {
    if (tab === 'mes-pdvs') return 'pdvs';
    if (tab === 'mes-ventes') return 'ventes';
    if (tab === 'mon-stock') return 'stock-depot';
    if (tab === 'mon-solde') return 'soldes-vendeurs';
    if (tab === 'mes-versements') return 'versements';
    if (tab === 'mon-chargement') return 'chargements';
    if (tab === 'mes-cadeaux') return 'cadeaux';
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
      name: 'Issa Koné',
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
      role: 'Facturation',
      phone: '+223 70 98 76 54',
      team: 'Service Facturation & Caisse',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-1',
      code: 'BAO-VND-001',
      name: 'Oumar Konaté',
      email: 'vendeur1@baobab.ml',
      role: 'Vendeur',
      phone: '+223 75 44 22 11',
      team: '',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-2',
      code: 'BAO-VND-002',
      name: 'Bakary Sidibé',
      email: 'vendeur2@baobab.ml',
      role: 'Vendeur',
      phone: '+223 69 88 77 66',
      team: '',
      must_change_password: 0,
    },
    {
      id: 'usr-vnd-3',
      code: 'BAO-VND-003',
      name: 'Seydou Diakité',
      email: 'vendeur3@baobab.ml',
      role: 'Vendeur',
      phone: '+223 73 11 00 99',
      team: '',
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
            if (parsed.role === 'Comptable' || parsed.code === 'BAO-CPT') {
              parsed.role = 'Facturation';
            }
            if (parsed.role === 'Directeur des opérations de vente' || parsed.code === 'BAO-DOV') {
              parsed.name = 'Issa Koné';
            }
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
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
  const [anomalyAlerts, setAnomalyAlerts] = useState<any[]>([]);
  const [newAnomaliesCount, setNewAnomaliesCount] = useState<number>(0);
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

  const openSaleByIdWithServerRbac = React.useCallback(
    async (saleIdOrNumber: string) => {
      if (!currentUser || !saleIdOrNumber) return;
      try {
        const res = await fetch(`/api/sales/${encodeURIComponent(saleIdOrNumber)}`, {
          headers: {
            'x-user-id': currentUser.id,
            'x-user-role': currentUser.role,
          },
        });
        if (!res.ok) return; // 403 ou 404 bloqué côté serveur
        const data = await res.json();
        if (data?.success && data.sale && !data.sale.isWholesale) {
          setSelectedDocument(buildMiniThermalReceiptDoc(data.sale));
        }
      } catch {
        // ignore
      }
    },
    [currentUser]
  );

  // Gère l'ouverture depuis une notification système (URL ?tab=...&saleId=...&notifId=...)
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const saleIdParam = params.get('saleId') || params.get('saleNumber');
    const notifIdParam = params.get('notifId');

    if (tabParam) {
      setActiveTab(resolveTabForRole(tabParam, currentUser.role));
    }
    if (saleIdParam) {
      void openSaleByIdWithServerRbac(saleIdParam);
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
    if (tabParam || saleIdParam || notifIdParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [currentUser, openSaleByIdWithServerRbac]);

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

      if (setRes?.settings) {
        if (setRes.settings.logo_url) setLogoUrl(setRes.settings.logo_url);
        try {
          localStorage.setItem('baobab_company_settings', JSON.stringify(setRes.settings));
        } catch {
          // ignore
        }
      }

      if (uRes?.users && uRes.users.length > 0) {
        const normalizedUsers = uRes.users.map((u: any) => ({
          ...u,
          name:
            u.role === 'Directeur des opérations de vente' || u.code === 'BAO-DOV'
              ? 'Issa Koné'
              : u.name,
          role:
            u.role === 'Magasinier' || u.code === 'BAO-MAG'
              ? 'Gestionnaire de stock'
              : u.role === 'Comptable' || u.code === 'BAO-CPT'
              ? 'Facturation'
              : u.role,
        }));
        setUsersList(normalizedUsers);
        setCurrentUser((prev) => {
          if (!prev) return null;
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
          const isPrevCpt =
            prev.role === 'Facturation' ||
            prev.role === 'Comptable' ||
            /factur|compt/i.test(prev.role || '') ||
            prev.code === 'BAO-CPT';
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
            (isPrevCpt
              ? normalizedUsers.find(
                  (u: any) => u.role === 'Facturation' || u.role === 'Comptable' || u.code === 'BAO-CPT'
                )
              : null) ||
            normalizedUsers.find((u: any) => u.role === prev.role) ||
            prev;
          const nextUser =
            matched && (matched.role === 'Magasinier' || matched.code === 'BAO-MAG')
              ? { ...matched, role: 'Gestionnaire de stock' }
              : matched && (matched.role === 'Comptable' || matched.code === 'BAO-CPT')
              ? { ...matched, role: 'Facturation' }
              : matched;
          if (
            prev &&
            nextUser &&
            prev.id === nextUser.id &&
            prev.role === nextUser.role &&
            prev.name === nextUser.name &&
            prev.code === nextUser.code
          ) {
            return prev;
          }
          return nextUser;
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
      window.dispatchEvent(new Event('baobab-anomalies-updated'));
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  const loadAnomaliesForRole = React.useCallback(async (user: UserSession | null) => {
    if (!user || user.role === 'Vendeur') {
      setAnomalyAlerts([]);
      setNewAnomaliesCount(0);
      return;
    }
    try {
      const res = await fetch('/api/anomalies', {
        headers: {
          'x-user-role': user.role,
          'x-user-id': user.id,
        },
      });
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d.alerts) ? d.alerts : [];
        setAnomalyAlerts(list);
        setNewAnomaliesCount(
          typeof d.newCount === 'number'
            ? d.newCount
            : list.filter((a: any) => a.status === 'Nouvelle').length
        );
      } else {
        setAnomalyAlerts([]);
        setNewAnomaliesCount(0);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    loadAnomaliesForRole(currentUser);
    const onAnomaliesUpdated = () => {
      loadAnomaliesForRole(currentUser);
    };
    window.addEventListener('baobab-anomalies-updated', onAnomaliesUpdated);
    return () => {
      window.removeEventListener('baobab-anomalies-updated', onAnomaliesUpdated);
    };
  }, [currentUser, loadAnomaliesForRole]);

  // Mise à jour temps réel du tableau de bord et de la liste des ventes sur réception d'un événement de vente (SSE)
  useEffect(() => {
    const refreshSalesRealtime = async () => {
      try {
        const [sRes, woRes, balRes] = await Promise.all([
          fetch('/api/sales').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/wholesale/orders').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/vendor-balances').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (sRes?.sales) setSales(sRes.sales);
        if (woRes?.wholesaleOrders) setWholesaleOrders(woRes.wholesaleOrders);
        if (balRes?.balances) setBalances(balRes.balances);
      } catch {
        // ignore
      }
    };

    const handleOpenSaleEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const targetId = detail?.saleId || detail?.saleNumber;
      if (targetId) {
        void openSaleByIdWithServerRbac(String(targetId));
      }
    };

    const refreshVrsAndPdvs = async () => {
      try {
        const [pRes, sRes, balRes] = await Promise.all([
          fetch('/api/pdvs').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/sales').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/vendor-balances').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (pRes?.pdvs) setPdvs(pRes.pdvs);
        if (sRes?.sales) setSales(sRes.sales);
        if (balRes?.balances) setBalances(balRes.balances);
      } catch {
        // ignore
      }
    };

    window.addEventListener('baobab-sales-realtime-updated', refreshSalesRealtime);
    window.addEventListener('baobab-vrs-updated', refreshVrsAndPdvs);
    window.addEventListener('baobab-pdvs-updated', refreshVrsAndPdvs);
    window.addEventListener('baobab-open-sale-detail', handleOpenSaleEvent);
    return () => {
      window.removeEventListener('baobab-sales-realtime-updated', refreshSalesRealtime);
      window.removeEventListener('baobab-vrs-updated', refreshVrsAndPdvs);
      window.removeEventListener('baobab-pdvs-updated', refreshVrsAndPdvs);
      window.removeEventListener('baobab-open-sale-detail', handleOpenSaleEvent);
    };
  }, [openSaleByIdWithServerRbac]);

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

  // Google Maps Platform Demo Key Quota Exceeded state
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSwitchRole = (newRole: 'Administrateur' | 'Directeur des opérations de vente' | 'Sales Admin' | 'Gestionnaire grossiste' | 'Gestionnaire de stock' | 'Magasinier' | 'Facturation' | 'Comptable' | 'Vendeur') => {
    const isDov = newRole === 'Directeur des opérations de vente' || /directeur|op[eé]ration|dov/i.test(newRole);
    const isSad = newRole === 'Sales Admin' || /sales|contr/i.test(newRole);
    const isGrs = newRole === 'Gestionnaire grossiste' || /grossiste/i.test(newRole);
    const isMag = !isGrs && (newRole === 'Gestionnaire de stock' || newRole === 'Magasinier' || /gestionnaire|magas/i.test(newRole));
    const isCpt = newRole === 'Facturation' || newRole === 'Comptable' || /factur|compt/i.test(newRole);
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
          : isCpt
          ? u.role === 'Facturation' || u.role === 'Comptable' || u.code === 'BAO-CPT'
          : u.role === newRole
      ) ||
      usersList.find(u => u.role.toLowerCase() === newRole.toLowerCase()) ||
      usersList[0];
    const normalized =
      targetUser && (targetUser.role === 'Magasinier' || targetUser.code === 'BAO-MAG')
        ? { ...targetUser, role: 'Gestionnaire de stock' as const }
        : targetUser && (targetUser.role === 'Comptable' || targetUser.code === 'BAO-CPT')
        ? { ...targetUser, role: 'Facturation' as const }
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
      <>
        {gmpQuotaExceeded && (
          <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-4">
            <span>
              Google Maps Platform : le quota de la clé de démonstration gratuite a été atteint. Pour continuer à utiliser les cartes sans limite, passez à votre propre clé API Google Cloud.
            </span>
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-medium underline hover:text-amber-700"
            >
              Comment mettre à niveau →
            </a>
          </div>
        )}
        <LoginScreen
          logoUrl={logoUrl}
          usersList={usersList}
          onLogin={(user) => {
            const normalized =
              user && (user.role === 'Magasinier' || user.code === 'BAO-MAG')
                ? { ...user, role: 'Gestionnaire de stock' as const }
                : user && (user.role === 'Comptable' || user.code === 'BAO-CPT')
                ? { ...user, role: 'Facturation' as const }
                : user;
            setCurrentUser(normalized);
            setActiveTab('dashboard');
          }}
        />
        <PWAInstallPromptBanner />
      </>
    );
  }

  const handleNavigateTab = (tab: string) => {
    const nextTab = currentUser ? resolveTabForRole(tab, currentUser.role) : tab;
    setActiveTab(nextTab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStartSaleForPdv = (pdv: any) => {
    const pdvId = typeof pdv === 'string' ? pdv : pdv?.id;
    if (pdvId) {
      try {
        localStorage.setItem('baobab_preselected_sale_pdv_id', String(pdvId));
      } catch {
        // ignore
      }
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('baobab-open-sale-for-pdv', { detail: { pdvId: String(pdvId) } })
        );
      }, 60);
    }
    handleNavigateTab(currentUser.role === 'Vendeur' ? 'nouvelle-vente' : 'ventes');
  };

  const pendingPdvsCount = pdvs.filter(p => p.status === 'en_attente').length;
  const pendingPurchaseRequestsCount = purchaseRequests.filter(pr => pr.status === 'en_attente').length;
  const pendingReceptionsCount = receptions.filter(r => r.status === 'en_attente').length;
  const unrevealedBonsCount =
    currentUser.role === 'Vendeur'
      ? bons.filter(b => b.vendor_id === currentUser.id && !b.revealed).length
      : bons.filter(b => !b.revealed).length;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row lg:items-start font-sans">
      {/* Sidebar with Baobab logo & role modules */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        currentUser={currentUser}
        logoUrl={logoUrl}
        onLogout={handleLogout}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        pendingPdvsCount={pendingPdvsCount}
        unrevealedBonsCount={unrevealedBonsCount}
        pendingPurchaseRequestsCount={pendingPurchaseRequestsCount}
        pendingReceptionsCount={pendingReceptionsCount}
        newAnomaliesCount={newAnomaliesCount}
      />

      <div className="flex flex-col flex-1 min-w-0 w-full max-w-full overflow-x-clip">
        {gmpQuotaExceeded && (
          <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-4">
            <span>
              Google Maps Platform : le quota de la clé de démonstration gratuite a été atteint. Pour continuer à utiliser les cartes sans limite, passez à votre propre clé API Google Cloud.
            </span>
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-medium underline hover:text-amber-700"
            >
              Comment mettre à niveau →
            </a>
          </div>
        )}
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
            const normalized =
              user && (user.role === 'Magasinier' || user.code === 'BAO-MAG')
                ? { ...user, role: 'Gestionnaire de stock' as const }
                : user && (user.role === 'Comptable' || user.code === 'BAO-CPT')
                ? { ...user, role: 'Facturation' as const }
                : user;
            setCurrentUser(normalized);
            setActiveTab('dashboard');
          }}
          onOpenDocument={(doc) => setSelectedDocument(doc)}
          onNavigateTab={handleNavigateTab}
          onSelectSearchResult={(item) => {
            if (item.url) {
              try {
                const urlObj = new URL(item.url, window.location.origin);
                const tab = urlObj.searchParams.get('tab');
                if (tab) {
                  handleNavigateTab(tab);
                }
              } catch {
                // ignore
              }
            }
            if (item.type === 'factures' || item.type === 'ventes') {
              const refStr = String(item.reference || '').toUpperCase();
              const isTicketSearch = currentUser.role === 'Vendeur' || refStr.startsWith('TKT-');
              const matchedSale = sales.find(
                (s) =>
                  String(s.id) === String(item.id) ||
                  String(s.invoice_number) === String(item.reference) ||
                  String(s.thermal_ticket_number) === String(item.reference)
              );
              if (matchedSale && Array.isArray(matchedSale.items) && matchedSale.items.length > 0) {
                const matchedPdv = pdvs.find((p) => p.id === matchedSale.pdv_id || p.name === matchedSale.pdv_name);
                const matchedVendor = usersList.find((u) => u.id === matchedSale.vendor_id || u.name === matchedSale.vendor_name);
                const ticketNo =
                  matchedSale.thermal_ticket_number ||
                  String(matchedSale.number || matchedSale.id || '').replace(/^VTE-/, 'TKT-THERM-');
                const subtotalHt = Number(matchedSale.subtotal_ht || matchedSale.total_amount || matchedSale.total || 0);
                const withTva = Boolean(matchedSale.with_tva);
                const tvaRate = withTva ? Number(matchedSale.tva_rate || 18) : 0;
                const tvaAmount = Number(matchedSale.tva_amount || (withTva ? Math.round(subtotalHt * 0.18) : 0));
                const totalTtc = Number(matchedSale.total_ttc || subtotalHt + tvaAmount);
                setSelectedDocument({
                  id: matchedSale.id,
                  number: isTicketSearch ? ticketNo : matchedSale.invoice_number || matchedSale.id,
                  type: isTicketSearch ? 'mini_thermique' : 'facture',
                  docTypeTitle: isTicketSearch ? 'TICKET DE VENTE' : 'FACTURE DE VENTE PDV',
                  date: String(matchedSale.date || '').split('T')[0] || '',
                  saleTime:
                    matchedSale.sale_time ||
                    (String(matchedSale.date || '').includes('T')
                      ? String(matchedSale.date).split('T')[1]?.slice(0, 5)
                      : undefined),
                  clientName: matchedSale.pdv_name || 'Client PDV',
                  clientPhone: matchedPdv?.phone || '',
                  pdvName: matchedSale.pdv_name,
                  pdvCode: matchedPdv?.code,
                  pdvNeighborhood:
                    matchedSale.pdv_neighborhood ||
                    (matchedPdv ? `${matchedPdv.quartier || ''}, ${matchedPdv.commune || ''}` : undefined),
                  pdvManager: matchedSale.pdv_manager || matchedPdv?.owner,
                  pdvPhone: matchedSale.pdv_phone || matchedPdv?.phone,
                  vendorId: matchedSale.vendor_id,
                  vendorName: matchedSale.vendor_name,
                  vendorCode: matchedSale.vendor_code || matchedVendor?.code,
                  vendorTeam: matchedSale.vendor_team || matchedVendor?.team,
                  vendorPhone: matchedSale.vendor_phone || matchedVendor?.phone,
                  saleId: matchedSale.id,
                  saleNumber: matchedSale.number || matchedSale.id,
                  thermalTicketNumber: ticketNo,
                  withTva,
                  subtotalHt,
                  tvaRate,
                  tvaAmount,
                  totalTtc,
                  items: matchedSale.items.map((it: any) => ({
                    code: it.code || it.product_id || '',
                    name: it.name || it.product_name || 'Produit',
                    qty: Number(it.qtyBoxes ?? it.qty ?? 0),
                    price: Number(it.unitPrice ?? it.price ?? 0),
                    total: Number(
                      it.total ||
                        Number(it.qtyBoxes ?? it.qty ?? 0) * Number(it.unitPrice ?? it.price ?? 0)
                    ),
                  })),
                  total: totalTtc,
                  paymentMethod: matchedSale.payment_type || matchedSale.payment_method || 'Comptant',
                  cashierName: matchedSale.vendor_name || currentUser.name,
                  status: isTicketSearch
                    ? 'Ticket Thermique Certifié (Preuve de vente)'
                    : Number(matchedSale.amount_paid ?? totalTtc) < totalTtc
                    ? 'Impayée / Crédit'
                    : 'Payée',
                });
              }
            }
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 pb-24 w-full max-w-full min-w-0 overflow-x-clip">
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
              anomalyAlerts={anomalyAlerts}
              newAnomaliesCount={newAnomaliesCount}
              logoUrl={logoUrl}
              onOpenDocument={(doc) => setSelectedDocument(doc)}
              onNavigateTab={handleNavigateTab}
            />
          )}

          {activeTab === 'alertes' && currentUser.role !== 'Vendeur' && (
            <AlertesView
              currentUser={currentUser}
              usersList={usersList}
              onAlertsUpdated={(count: number) => {
                setNewAnomaliesCount(count);
                loadAnomaliesForRole(currentUser);
              }}
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
              onNavigateTab={handleNavigateTab}
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
              onNavigateTab={handleNavigateTab}
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
              onStartSaleForPdv={handleStartSaleForPdv}
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
              onStartSaleForPdv={handleStartSaleForPdv}
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
              onStartSaleForPdv={handleStartSaleForPdv}
              initialOpenCreate={true}
            />
          )}

          {activeTab === 'carte' && (
            <CartePdvView
              pdvs={pdvs}
              sales={sales}
              currentUser={currentUser}
              onStartSaleForPdv={handleStartSaleForPdv}
              onNavigateTab={handleNavigateTab}
            />
          )}

          {activeTab === 'routine-vrs' &&
            (currentUser.role === 'Administrateur' ||
              currentUser.role === 'Directeur des opérations de vente' ||
              currentUser.role === 'Sales Admin' ||
              currentUser.role === 'Vendeur') && (
              <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <RoutineVrsView
                  currentUser={currentUser}
                  onStartSaleForPdv={handleStartSaleForPdv}
                  onNavigateTab={handleNavigateTab}
                  onRefreshData={loadData}
                />
              </div>
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
              onNavigateTab={handleNavigateTab}
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
              onNavigateTab={handleNavigateTab}
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
                    : targetUser && (targetUser.role === 'Comptable' || targetUser.code === 'BAO-CPT')
                    ? { ...targetUser, role: 'Facturation' as const }
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
              users={usersList}
              products={products}
              onRefreshData={loadData}
            />
          )}
        </main>
      </div>

      {/* Bottom Nav Bar (5 colonnes égales, un mot <= 8 caractères, fond plein opaque) */}
      <BottomNavBar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
      />

      {/* Printable Invoice / Receipt / Mini Thermal Receipt Modal */}
      {selectedDocument && (
        <PrintableDocument
          document={selectedDocument}
          logoUrl={logoUrl}
          currentRole={currentUser.role}
          onClose={() => setSelectedDocument(null)}
          onRequestRectification={
            currentUser.role === 'Vendeur'
              ? undefined
              : (doc) => {
                  const cleanId = String(doc.id || '').replace(/^doc-sale-/, '');
                  setSelectedDocument(null);
                  setExternalRectificationSaleId(cleanId);
                  setActiveTab('factures');
                }
          }
        />
      )}

      {/* Bannière de proposition d'installation PWA sur Mobile, Tablette, PC et Laptop */}
      <PWAInstallPromptBanner />
    </div>
  );
}
