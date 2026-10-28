import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Store,
  Printer,
  Truck,
  Search,
  Eye,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  MapPin,
  Clock,
  User,
  Users,
  Phone,
  Mail,
  Briefcase,
  ArrowLeft,
  Calendar,
  TrendingUp,
  Receipt,
  FileText,
  Download,
} from 'lucide-react';
import { InvoiceData } from './PrintableDocument';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import {
  isAppOnline,
  isSimulatedOffline,
  setSimulatedOffline,
  getOfflineSalesQueue,
  getOfflineGpsQueue,
  enqueueOfflineSale,
  enqueueOfflineGpsPosition,
  syncPendingOfflineData,
  OfflineSaleRecord,
} from '../utils/offlineSync';

interface VentesViewProps {
  products: any[];
  pdvs: any[];
  currentUser: any;
  usersList?: any[];
  sales: any[];
  chargements: any[];
  initialTab?: string;
  onOpenDocument: (doc: InvoiceData) => void;
  onRefreshData: () => void;
}

const FALLBACK_TIMES = [
  '08:25', '08:50', '09:15', '09:42', '10:10', '10:35',
  '11:05', '11:28', '11:55', '12:20', '13:15', '13:48',
  '14:12', '14:40', '15:05', '15:32', '16:00', '16:25',
  '16:50', '17:18', '17:45',
];

export function getSaleTime(sale: any): string {
  if (sale?.sale_time && typeof sale.sale_time === 'string' && /^\d{2}:\d{2}/.test(sale.sale_time.trim())) {
    return sale.sale_time.trim().slice(0, 5);
  }
  if (sale?.offline_recorded_at && typeof sale.offline_recorded_at === 'string' && sale.offline_recorded_at.includes('T')) {
    const t = sale.offline_recorded_at.split('T')[1]?.slice(0, 5);
    if (t && /^\d{2}:\d{2}$/.test(t)) return t;
  }
  if (sale?.created_at && typeof sale.created_at === 'string' && sale.created_at.includes('T')) {
    const t = sale.created_at.split('T')[1]?.slice(0, 5);
    if (t && /^\d{2}:\d{2}$/.test(t)) return t;
  }
  const str = String(sale?.id || sale?.number || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_TIMES[hash % FALLBACK_TIMES.length];
}

export function formatSaleDateFr(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

export function getSaleSortKey(sale: any): string {
  const datePart = (sale?.date || '1970-01-01').split('T')[0];
  const timePart = getSaleTime(sale);
  return `${datePart}T${timePart}:00`;
}

export function getThermalTicketNumber(sale: any): string {
  if (sale?.thermal_ticket_number) return sale.thermal_ticket_number;
  const numStr = String(sale?.number || sale?.id || '');
  if (numStr.startsWith('VTE-')) {
    return numStr.replace(/^VTE-/, 'TKT-THERM-');
  }
  return `TKT-THERM-${numStr.toUpperCase()}`;
}

export function buildMiniThermalReceiptDoc(sale: any): InvoiceData {
  const saleTime = getSaleTime(sale);
  const formattedDate = formatSaleDateFr(sale.date);
  const ticketNo = getThermalTicketNumber(sale);
  return {
    id: sale.id,
    number: ticketNo,
    saleNumber: sale.number,
    thermalTicketNumber: ticketNo,
    saleTime,
    type: 'mini_thermique',
    date: `${formattedDate} à ${saleTime}`,
    clientName: `${sale.pdv_name} (${sale.pdv_neighborhood})`,
    clientPhone: sale.pdv_phone || '+223 76 00 00 00',
    vendorName: sale.vendor_name,
    vendorCode: sale.vendor_code,
    vendorTeam: sale.vendor_team,
    vendorPhone: sale.vendor_phone || '+223 75 44 22 11',
    pdvName: sale.pdv_name,
    pdvCode: sale.pdv_code,
    pdvNeighborhood: sale.pdv_neighborhood,
    pdvManager: sale.pdv_manager,
    pdvPhone: sale.pdv_phone || '+223 76 00 00 00',
    subtotalHt: Number(sale.total_amount || 0),
    items: (sale.items || []).map((it: any) => ({
      code: it.code,
      name: it.name,
      qty: it.qtyBoxes ?? it.qty ?? 0,
      price: it.unitPrice ?? it.price ?? 0,
      total: it.total ?? 0,
    })),
    total: Number(sale.total_amount || 0),
    paymentMethod: sale.payment_type || 'Comptant',
    cashierName: `${sale.vendor_name} (${sale.vendor_code})`,
    status: sale.isPendingOffline
      ? 'Ticket Thermique Hors-Ligne (Preuve de vente)'
      : 'Ticket Thermique Certifié (Preuve de vente)',
  };
}

export const VentesView: React.FC<VentesViewProps> = ({
  products,
  pdvs,
  currentUser,
  usersList = [],
  sales,
  chargements,
  initialTab,
  onOpenDocument,
  onRefreshData,
}) => {
  const isVendeur = currentUser.role === 'Vendeur';
  const isAdmin = currentUser.role === 'Administrateur';

  const [vendorSubTab, setVendorSubTab] = useState<'nouvelle' | 'historique'>(() => {
    if (!isVendeur) return 'historique';
    if (initialTab === 'mes-ventes') return 'historique';
    return 'nouvelle';
  });

  // For Admin: null = show vendor profile cards; string = selected vendor's ID to display their sales history
  const [selectedAdminVendorId, setSelectedAdminVendorId] = useState<string | null>(null);

  useEffect(() => {
    if (!isVendeur) {
      setVendorSubTab('historique');
    } else if (initialTab === 'mes-ventes') {
      setVendorSubTab('historique');
    } else if (initialTab === 'nouvelle-vente') {
      setVendorSubTab('nouvelle');
    }
  }, [initialTab, isVendeur]);

  const [selectedPdvId, setSelectedPdvId] = useState(pdvs.filter((p) => p.status === 'valide')[0]?.id || '');
  const [cart, setCart] = useState<{ [productId: string]: number }>({});
  const [paymentType, setPaymentType] = useState('Comptant');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Offline / Network synchronization states
  const [online, setOnline] = useState<boolean>(() => isAppOnline());
  const [simulatedOffline, setSimulatedOfflineState] = useState<boolean>(() => isSimulatedOffline());
  const [pendingOfflineSales, setPendingOfflineSales] = useState<OfflineSaleRecord[]>(() => getOfflineSalesQueue());
  const [pendingOfflineGpsCount, setPendingOfflineGpsCount] = useState<number>(() => getOfflineGpsQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncBannerMsg, setSyncBannerMsg] = useState<{ type: 'success' | 'offline' | 'info'; text: string } | null>(null);

  const refreshQueueState = useCallback(() => {
    setOnline(isAppOnline());
    setSimulatedOfflineState(isSimulatedOffline());
    setPendingOfflineSales(getOfflineSalesQueue());
    setPendingOfflineGpsCount(getOfflineGpsQueue().length);
  }, []);

  const handleTriggerSync = useCallback(
    async (silent = false) => {
      if (!isAppOnline()) return;
      const salesQ = getOfflineSalesQueue();
      const gpsQ = getOfflineGpsQueue();
      if (salesQ.length === 0 && gpsQ.length === 0) {
        if (!silent) {
          setSyncBannerMsg({
            type: 'info',
            text: 'Toutes les ventes et positions GPS sont déjà synchronisées avec le serveur.',
          });
        }
        return;
      }

      setIsSyncing(true);
      try {
        const res = await syncPendingOfflineData(currentUser.role);
        refreshQueueState();
        if (res) {
          setSyncBannerMsg({
            type: 'success',
            text: res.message,
          });
          onRefreshData();
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [currentUser.role, onRefreshData, refreshQueueState]
  );

  useEffect(() => {
    const onNetChange = () => {
      refreshQueueState();
      if (isAppOnline()) {
        handleTriggerSync(true);
      }
    };
    const onQueueChange = () => {
      refreshQueueState();
    };

    window.addEventListener('online', onNetChange);
    window.addEventListener('offline', onNetChange);
    window.addEventListener('baobab-network-change', onNetChange);
    window.addEventListener('baobab-queue-updated', onQueueChange);
    window.addEventListener('baobab-sync-completed', onQueueChange);

    if (isAppOnline() && (getOfflineSalesQueue().length > 0 || getOfflineGpsQueue().length > 0)) {
      handleTriggerSync(true);
    }

    return () => {
      window.removeEventListener('online', onNetChange);
      window.removeEventListener('offline', onNetChange);
      window.removeEventListener('baobab-network-change', onNetChange);
      window.removeEventListener('baobab-queue-updated', onQueueChange);
      window.removeEventListener('baobab-sync-completed', onQueueChange);
    };
  }, [handleTriggerSync, refreshQueueState]);

  const handleToggleOfflineSimulation = () => {
    const nextOffline = !simulatedOffline;
    setSimulatedOffline(nextOffline);
    setSimulatedOfflineState(nextOffline);
    setOnline(!nextOffline && navigator.onLine);
    if (nextOffline) {
      setSyncBannerMsg({
        type: 'offline',
        text: 'Mode Hors-Ligne activé : vos ventes et positions GPS seront enregistrées localement et synchronisées dès le retour du réseau.',
      });
    } else {
      setSyncBannerMsg({
        type: 'info',
        text: 'Réseau rétabli : synchronisation automatique des ventes et positions GPS en cours...',
      });
    }
  };

  // Filters for sales history
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVendorCode, setFilterVendorCode] = useState('all');

  // Filter vendor's active chargements
  const myChargement = chargements.find((c) => c.vendor_id === currentUser.id);
  const validPdvs = pdvs.filter((p) => p.status === 'valide');

  const addToCart = (productId: string, delta: number) => {
    if (!isVendeur) return;
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const cartItems = Object.entries(cart).map(([pId, qty]) => {
    const p = products.find((prod) => prod.id === pId);
    return {
      productId: pId,
      code: p ? p.code : pId,
      name: p ? p.name : 'Produit',
      qtyBoxes: qty,
      unitPrice: p ? p.price_box : 0,
      total: qty * (p ? p.price_box : 0),
    };
  });

  const cartTotal = cartItems.reduce((sum, item) => sum + item.total, 0);

  // Resolve GPS position (browser geolocation or fallback to PDV coordinates)
  const resolveCurrentGps = (pdvObj: any): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve) => {
      const fallbackLat = Number.isFinite(Number(pdvObj?.latitude)) ? Number(pdvObj.latitude) : 12.6392;
      const fallbackLng = Number.isFinite(Number(pdvObj?.longitude)) ? Number(pdvObj.longitude) : -7.985;
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ lat: fallbackLat, lng: fallbackLng, accuracy: 4.5 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.5).toFixed(1)),
          });
        },
        () => {
          resolve({ lat: fallbackLat, lng: fallbackLng, accuracy: 4.5 });
        },
        { enableHighAccuracy: true, timeout: 2500, maximumAge: 15000 }
      );
    });
  };

  const saveSaleOfflineAndOpenReceipt = (pdvObj: any, gps: { lat: number; lng: number; accuracy: number }) => {
    const nowObj = new Date();
    const nowIso = nowObj.toISOString();
    const dateStr = nowIso.split('T')[0];
    const saleTimeStr = `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const rand = Math.floor(10000 + Math.random() * 90000);
    const offlineSaleId = `sale-off-${Date.now()}`;
    const offlineNumber = `VTE-OFF-${rand}`;

    const saleRecord: OfflineSaleRecord = {
      id: offlineSaleId,
      number: offlineNumber,
      date: dateStr,
      sale_time: saleTimeStr,
      vendor_id: currentUser.id,
      vendor_name: currentUser.name,
      vendor_code: currentUser.code,
      vendor_team: currentUser.team,
      pdv_id: selectedPdvId,
      pdv_name: pdvObj?.name || 'PDV Client',
      pdv_neighborhood: pdvObj?.neighborhood || 'Bamako',
      pdv_phone: pdvObj?.phone || '+223 76 00 00 00',
      items: cartItems,
      total_amount: cartTotal,
      payment_type: paymentType,
      latitude: gps.lat,
      longitude: gps.lng,
      recorded_offline: 1,
      offline_recorded_at: nowIso,
      status: 'hors_ligne_en_attente',
    };

    enqueueOfflineSale(saleRecord);

    enqueueOfflineGpsPosition({
      id: `gps-off-sale-${offlineSaleId}`,
      vendor_id: currentUser.id,
      vendor_name: currentUser.name,
      vendor_code: currentUser.code,
      latitude: gps.lat,
      longitude: gps.lng,
      accuracy: gps.accuracy,
      speed_kmh: 0,
      activity_label: `Vente hors-ligne ${offlineNumber} • ${pdvObj?.name || 'PDV'} (${cartTotal.toLocaleString('fr-FR')} FCFA)`,
      pdv_id: selectedPdvId,
      recorded_offline: 1,
      recorded_at: nowIso,
      date: dateStr,
    });

    refreshQueueState();
    setCart({});
    setSyncBannerMsg({
      type: 'offline',
      text: `Vente ${offlineNumber} (${cartTotal.toLocaleString('fr-FR')} FCFA à ${saleTimeStr}) et position GPS enregistrées hors-ligne sur cet appareil. Elles seront synchronisées automatiquement dès que le réseau sera disponible.`,
    });

    const offlineThermalNumber = `TKT-THERM-OFF-${rand}`;
    onOpenDocument({
      id: offlineSaleId,
      number: offlineThermalNumber,
      saleNumber: offlineNumber,
      thermalTicketNumber: offlineThermalNumber,
      saleTime: saleTimeStr,
      type: 'mini_thermique',
      date: `${formatSaleDateFr(dateStr)} à ${saleTimeStr}`,
      clientName: `${pdvObj?.name} (${pdvObj?.neighborhood})`,
      clientPhone: pdvObj?.phone,
      vendorName: currentUser.name,
      vendorCode: currentUser.code,
      vendorTeam: currentUser.team,
      pdvName: pdvObj?.name,
      pdvCode: pdvObj?.code,
      pdvNeighborhood: pdvObj?.neighborhood,
      pdvManager: pdvObj?.manager_name,
      pdvPhone: pdvObj?.phone,
      items: cartItems.map((it) => ({
        code: it.code,
        name: it.name,
        qty: it.qtyBoxes,
        price: it.unitPrice,
        total: it.total,
      })),
      total: cartTotal,
      paymentMethod: paymentType,
      cashierName: `${currentUser.name} (${currentUser.code})`,
      status: 'Ticket Thermique Hors-Ligne (Preuve de vente)',
    });
  };

  const handleCheckoutSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVendeur || cartItems.length === 0 || !selectedPdvId) return;
    setIsSubmitting(true);

    const pdvObj = pdvs.find((p) => p.id === selectedPdvId);
    const gps = await resolveCurrentGps(pdvObj);

    if (!isAppOnline()) {
      saveSaleOfflineAndOpenReceipt(pdvObj, gps);
      setIsSubmitting(false);
      return;
    }

    const nowObj = new Date();
    const saleTimeStr = `${String(nowObj.getHours()).padStart(2, '0')}:${String(nowObj.getMinutes()).padStart(2, '0')}`;
    const dateStr = nowObj.toISOString().split('T')[0];

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          vendor_id: currentUser.id,
          pdv_id: selectedPdvId,
          items: cartItems,
          payment_type: paymentType,
          sale_time: saleTimeStr,
          date: dateStr,
          latitude: gps.lat,
          longitude: gps.lng,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCart({});
        onRefreshData();

        const finalTime = data.sale_time || saleTimeStr;
        const finalDate = data.date || dateStr;
        const saleNum = data.number || `VTE-2026-${Math.floor(10000 + Math.random() * 90000)}`;
        const thermalNo = data.thermal_ticket_number || saleNum.replace(/^VTE-/, 'TKT-THERM-');

        onOpenDocument({
          id: data.saleId || `sale-${Date.now()}`,
          number: thermalNo,
          saleNumber: saleNum,
          thermalTicketNumber: thermalNo,
          saleTime: finalTime,
          type: 'mini_thermique',
          date: `${formatSaleDateFr(finalDate)} à ${finalTime}`,
          clientName: `${pdvObj?.name} (${pdvObj?.neighborhood})`,
          clientPhone: pdvObj?.phone,
          vendorName: currentUser.name,
          vendorCode: currentUser.code,
          vendorTeam: currentUser.team,
          pdvName: pdvObj?.name,
          pdvCode: pdvObj?.code,
          pdvNeighborhood: pdvObj?.neighborhood,
          pdvManager: pdvObj?.manager_name,
          pdvPhone: pdvObj?.phone,
          items: cartItems.map((it) => ({
            code: it.code,
            name: it.name,
            qty: it.qtyBoxes,
            price: it.unitPrice,
            total: it.total,
          })),
          total: cartTotal,
          paymentMethod: paymentType,
          cashierName: `${currentUser.name} (${currentUser.code})`,
          status: 'Ticket Thermique Certifié (Preuve de vente)',
        });
      } else {
        saveSaleOfflineAndOpenReceipt(pdvObj, gps);
      }
    } catch {
      saveSaleOfflineAndOpenReceipt(pdvObj, gps);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Combine server sales with locally queued offline sales and sort strictly from MOST RECENT to OLDEST
  const sortedCombinedSales = useMemo(() => {
    const raw = [
      ...pendingOfflineSales.map((os) => ({
        ...os,
        isPendingOffline: true,
      })),
      ...sales,
    ];

    return raw.sort((a, b) => {
      const keyA = getSaleSortKey(a);
      const keyB = getSaleSortKey(b);
      if (keyA !== keyB) {
        return keyB.localeCompare(keyA); // Most recent date+time first
      }
      return String(b.number || b.id || '').localeCompare(String(a.number || a.id || ''));
    });
  }, [pendingOfflineSales, sales]);

  // Build vendor profiles list for Admin view
  const vendorProfiles = useMemo(() => {
    const fromUsers = (usersList || []).filter((u) => u.role === 'Vendeur');
    const vendorMap = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        email: string;
        phone: string;
        team: string;
      }
    >();

    for (const u of fromUsers) {
      vendorMap.set(u.id, {
        id: u.id,
        code: u.code || 'BAO-VND',
        name: u.name || 'Vendeur',
        email: u.email || '',
        phone: u.phone || '+223 76 00 00 00',
        team: u.team || 'Équipe Commerciale Bamako',
      });
    }

    // Ensure any vendor present in sales is also included
    for (const s of sortedCombinedSales) {
      if (s.vendor_id && !vendorMap.has(s.vendor_id)) {
        vendorMap.set(s.vendor_id, {
          id: s.vendor_id,
          code: s.vendor_code || 'BAO-VND',
          name: s.vendor_name || 'Vendeur',
          email: '',
          phone: '+223 76 00 00 00',
          team: s.vendor_team || 'Équipe Commerciale Bamako',
        });
      }
    }

    return Array.from(vendorMap.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((v) => {
        // Sales for this vendor, already sorted from most recent to oldest
        const vSales = sortedCombinedSales.filter(
          (s) => s.vendor_id === v.id || (s.vendor_code && s.vendor_code === v.code)
        );
        const totalAmount = vSales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const totalBoxes = vSales.reduce(
          (acc, s) =>
            acc + (s.items || []).reduce((sum: number, it: any) => sum + Number(it.qtyBoxes || 0), 0),
          0
        );
        const uniquePdvs = new Set(vSales.map((s) => s.pdv_id)).size;
        const latestSale = vSales[0] || null;

        return {
          ...v,
          salesCount: vSales.length,
          totalAmount,
          totalBoxes,
          uniquePdvs,
          latestSale,
          sales: vSales,
        };
      });
  }, [usersList, sortedCombinedSales]);

  const selectedAdminVendor = useMemo(() => {
    if (!selectedAdminVendorId) return null;
    return vendorProfiles.find((vp) => vp.id === selectedAdminVendorId) || null;
  }, [vendorProfiles, selectedAdminVendorId]);

  // Sales visible to current user
  const visibleSales = useMemo(() => {
    if (isVendeur) {
      return sortedCombinedSales.filter((s) => s.vendor_id === currentUser.id);
    }
    if (isAdmin && selectedAdminVendor) {
      return selectedAdminVendor.sales;
    }
    return sortedCombinedSales;
  }, [isVendeur, isAdmin, selectedAdminVendor, sortedCombinedSales, currentUser.id]);

  const vendorCodes = Array.from(new Set(sortedCombinedSales.map((s) => s.vendor_code).filter(Boolean)));

  const filteredSales = useMemo(() => {
    return visibleSales.filter((s) => {
      const matchesVendor =
        isAdmin && selectedAdminVendor
          ? true
          : filterVendorCode === 'all' || s.vendor_code === filterVendorCode;
      const q = searchTerm.toLowerCase();
      const saleTime = getSaleTime(s);
      const matchesSearch =
        !q ||
        (s.number || '').toLowerCase().includes(q) ||
        (s.pdv_name || '').toLowerCase().includes(q) ||
        (s.pdv_neighborhood || '').toLowerCase().includes(q) ||
        (s.vendor_name || '').toLowerCase().includes(q) ||
        (s.vendor_code || '').toLowerCase().includes(q) ||
        (s.date || '').toLowerCase().includes(q) ||
        formatSaleDateFr(s.date).toLowerCase().includes(q) ||
        saleTime.toLowerCase().includes(q);
      return matchesVendor && matchesSearch;
    });
  }, [visibleSales, isAdmin, selectedAdminVendor, filterVendorCode, searchTerm]);

  const totalFilteredAmount = filteredSales.reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const handleExportSalesPdf = (salesToExport = filteredSales, customTitle?: string) => {
    const totalAmount = salesToExport.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalBoxes = salesToExport.reduce(
      (sum, s) => sum + (s.items || []).reduce((acc: number, it: any) => acc + Number(it.qtyBoxes || 0), 0),
      0
    );
    const uniquePdvCount = new Set(salesToExport.map((s) => s.pdv_id)).size;

    exportTableToPdf({
      title:
        customTitle ||
        (isVendeur
          ? `Historique de Mes Ventes - ${currentUser.name} (${currentUser.code})`
          : isAdmin && selectedAdminVendor
          ? `Historique des Ventes - ${selectedAdminVendor.name} (${selectedAdminVendor.code})`
          : 'Journal Global des Ventes & Livraisons PDV'),
      subtitle: `Exportation officielle des ventes triees du plus recent au plus ancien`,
      filename: `ventes_baobab_${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: `Utilisateur : ${currentUser.name} (${currentUser.role})`,
      summaryCards: [
        { label: 'Nombre de ventes', value: `${salesToExport.length} livraisons` },
        { label: 'Volume total vendu', value: `${totalBoxes} cartons` },
        { label: 'PDV livres', value: `${uniquePdvCount} PDV` },
        { label: 'Chiffre d\'affaires', value: formatFcfaPdf(totalAmount) },
      ],
      columns: [
        'N° Vente',
        'Date & Heure',
        'Point de Vente (Quartier)',
        'Vendeur (Code)',
        'Detail Cartons Vendus',
        'Reglement',
        'Montant (FCFA)',
      ],
      rows: salesToExport.map((s) => {
        const boxes = (s.items || []).reduce((acc: number, it: any) => acc + Number(it.qtyBoxes || 0), 0);
        const detail = `${boxes} ctn : ${(s.items || [])
          .map((it: any) => `${it.qtyBoxes}x ${it.name}`)
          .join(', ')}`;
        return [
          s.number || s.id,
          `${formatSaleDateFr(s.date)} a ${getSaleTime(s)}`,
          `${s.pdv_name || ''} (${s.pdv_neighborhood || ''})`,
          `${s.vendor_name || ''} (${s.vendor_code || ''})`,
          detail,
          s.payment_type || 'Comptant',
          formatFcfaPdf(s.total_amount),
        ];
      }),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? 'Ventes & Livraisons aux Points de Vente'
                : isAdmin
                ? 'Ventes par Vendeur (Consultation Administrateur)'
                : 'Consultation des Ventes (Lecture seule)'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {isVendeur ? 'Dépôt-Vente • En ligne & Hors-ligne' : `Consultation ${currentUser.role}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? "Consultez les profils des vendeurs et accédez à l'historique détaillé des ventes de chaque vendeur (triées du plus récent au plus ancien avec date et heure)."
              : isVendeur
              ? 'Enregistrez vos ventes même en absence de réseau : elles sont sauvegardées localement avec la date, l’heure et votre position GPS, puis synchronisées automatiquement.'
              : 'Consultation en lecture seule des ventes réalisées par les équipes commerciales (du plus récent au plus ancien avec date et heure).'}
          </p>
        </div>

        {isVendeur ? (
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button
              onClick={() => setVendorSubTab('nouvelle')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                vendorSubTab === 'nouvelle'
                  ? 'bg-[#008DA9] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              + Nouvelle vente
            </button>
            <button
              onClick={() => setVendorSubTab('historique')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                vendorSubTab === 'historique'
                  ? 'bg-[#008DA9] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Mes ventes ({visibleSales.length})
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && selectedAdminVendor && (
              <button
                type="button"
                onClick={() => {
                  setSelectedAdminVendorId(null);
                  setSearchTerm('');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Profils des vendeurs</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold">
              <Shield className="w-4 h-4 text-[#008DA9]" />
              <span>Lecture seule &bull; Aucune création de vente ni de facture</span>
            </div>
          </div>
        )}
      </div>

      {/* BARRE D'ÉTAT RÉSEAU & SYNCHRONISATION HORS-LIGNE */}
      <div
        className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
          online
            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              online ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
            }`}
          >
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-black text-sm flex items-center gap-2 flex-wrap">
              <span>
                {online
                  ? 'Réseau Disponible • Synchronisation Automatique Active'
                  : 'Mode Hors-Ligne (Réseau Absent) • Enregistrement Local Actif'}
              </span>
              {(pendingOfflineSales.length > 0 || pendingOfflineGpsCount > 0) && (
                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-black">
                  {pendingOfflineSales.length} vente(s) &amp; {pendingOfflineGpsCount} point(s) GPS en attente
                </span>
              )}
            </div>
            <p className="text-[11px] opacity-85 mt-0.5">
              {online
                ? 'Vos ventes et positions GPS sont transmises en temps réel au serveur central de Sotuba.'
                : 'Vous pouvez continuer à vendre et facturer sans connexion : tout est stocké sur votre appareil et sera synchronisé dès le retour du réseau.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {(pendingOfflineSales.length > 0 || pendingOfflineGpsCount > 0) && online && (
            <button
              type="button"
              onClick={() => handleTriggerSync(false)}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleOfflineSimulation}
            className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition cursor-pointer ${
              online
                ? 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50'
                : 'bg-[#008DA9] hover:bg-[#00748C] border-[#008DA9] text-white shadow-xs'
            }`}
          >
            {online ? (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Simuler coupure réseau (Hors-ligne)</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Rétablir le réseau &amp; Synchroniser</span>
              </>
            )}
          </button>
        </div>
      </div>

      {syncBannerMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            syncBannerMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : syncBannerMsg.type === 'offline'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              : 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {syncBannerMsg.text}
          </span>
          <button onClick={() => setSyncBannerMsg(null)} className="font-mono text-sm">&times;</button>
        </div>
      )}

      {/* VENDEUR ONLY: Nouvelle Vente Form */}
      {isVendeur && vendorSubTab === 'nouvelle' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Product Catalog by carton */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-500">
                Sélectionnez les cartons à livrer
              </span>
              {myChargement && (
                <span className="text-xs font-semibold text-[#008DA9] flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" />
                  Chargement camionnette actif (Stock 3-7j)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((p) => {
                const qtyInCart = cart[p.id] || 0;
                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold">
                          {p.code}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          {p.gamme}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                        {p.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{p.packaging}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-base font-black text-slate-900 dark:text-white">
                          {p.price_box.toLocaleString('fr-FR')} <span className="text-xs text-[#008DA9]">FCFA</span>
                        </div>
                        <span className="text-[10px] text-slate-400">le carton</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {qtyInCart > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => addToCart(p.id, -1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-bold text-xs">{qtyInCart}</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => addToCart(p.id, 1)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Ajouter</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Order summary & PDV select */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between space-y-4 h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-[#008DA9]" />
                Bon de Livraison &bull; Vente PDV
              </h2>
              {cartItems.length > 0 && (
                <button
                  onClick={() => setCart({})}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium cursor-pointer"
                >
                  Vider
                </button>
              )}
            </div>

            <form onSubmit={handleCheckoutSale} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 mb-1 font-semibold">
                  Point de Vente Client (PDV)
                </label>
                <select
                  value={selectedPdvId}
                  onChange={(e) => setSelectedPdvId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  {validPdvs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.neighborhood}) - {p.manager_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-semibold">
                  Mode de règlement
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Comptant">Espèces Comptant (FCFA)</option>
                  <option value="Orange Money">Orange Money Mali</option>
                  <option value="Moov Money">Moov Money Mali</option>
                </select>
              </div>

              {/* Cart summary list */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                {cartItems.length === 0 ? (
                  <div className="py-6 text-center text-slate-400">
                    Aucun carton sélectionné. Ajoutez des produits à gauche.
                  </div>
                ) : (
                  cartItems.map((it) => (
                    <div
                      key={it.productId}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{it.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {it.qtyBoxes} cartons &times; {it.unitPrice.toLocaleString('fr-FR')} FCFA
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {it.total.toLocaleString('fr-FR')} FCFA
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Total & Submit */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs uppercase font-bold text-slate-500">Total Vente</span>
                  <span className="text-xl font-black text-[#008DA9]">
                    {cartTotal.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>

                <div className="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                  <strong>Information facturation :</strong> Le vendeur ne peut pas créer de factures officielles (seul le Comptable y est autorisé). La validation de cette vente génère automatiquement votre <strong>Mini Facture Thermique (80mm)</strong> dans votre historique de ventes.
                </div>

                <button
                  type="submit"
                  disabled={cartItems.length === 0 || isSubmitting}
                  className={`w-full py-3 px-4 rounded-xl disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer ${
                    online
                      ? 'bg-[#008DA9] hover:bg-[#00748C]'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  <span>
                    {online
                      ? 'Valider la Vente & Générer Mini Facture Thermique'
                      : 'Enregistrer Hors-Ligne & Générer Mini Facture Thermique'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN VIEW: PROFILS DES VENDEURS (Affichés dès que l'Admin ouvre le menu "Ventes") */}
      {isAdmin && !selectedAdminVendor && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#008DA9]/10 text-[#008DA9] flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Profils des Vendeurs ({vendorProfiles.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cliquez sur « Ventes du vendeur » sous le profil d&apos;un vendeur pour afficher tout son historique de ventes du plus récent au plus ancien avec dates et heures.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap text-xs">
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Ventes Équipes</span>
                <span className="font-black text-slate-900 dark:text-white">
                  {sortedCombinedSales.length} ventes &bull;{' '}
                  <span className="text-[#008DA9]">
                    {sortedCombinedSales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0).toLocaleString('fr-FR')} FCFA
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleExportSalesPdf(sortedCombinedSales, 'Rapport Global des Ventes - Toutes les Equipes')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Exporter PDF (Toutes les ventes)</span>
              </button>
            </div>
          </div>

          {/* Grid of Vendor Profile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vendorProfiles.map((vendor) => {
              const initials = vendor.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const latestTime = vendor.latestSale ? getSaleTime(vendor.latestSale) : null;
              const latestDate = vendor.latestSale ? formatSaleDateFr(vendor.latestSale.date) : null;

              return (
                <div
                  key={vendor.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:shadow-md hover:border-[#008DA9]/50 transition flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    {/* Vendor Identity Header */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-14 h-14 rounded-2xl bg-[#008DA9] text-white font-black text-lg flex items-center justify-center shadow-sm shrink-0">
                        {initials || <User className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#008DA9]/10 text-[#008DA9] dark:bg-[#008DA9]/20 dark:text-cyan-300">
                            {vendor.code}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Vendeur Actif
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1 truncate">
                          {vendor.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Briefcase className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                          <span className="truncate">{vendor.team}</span>
                        </p>
                      </div>
                    </div>

                    {/* Vendor Contact Details */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-[#008DA9]" />
                          Téléphone :
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.phone}</span>
                      </div>
                      {vendor.email && (
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Mail className="w-3.5 h-3.5 text-[#008DA9]" />
                            Email :
                          </span>
                          <span className="font-medium truncate max-w-[170px]">{vendor.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Vendor Sales KPIs */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Ventes</span>
                        <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                          {vendor.salesCount}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Cartons</span>
                        <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                          {vendor.totalBoxes}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">PDV Livrés</span>
                        <span className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                          {vendor.uniquePdvs}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Chiffre d&apos;affaires cumulé
                        </span>
                        <span className="text-lg font-black text-[#008DA9]">
                          {vendor.totalAmount.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
                        </span>
                      </div>

                      {vendor.latestSale && (
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                            Dernière vente
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <Clock className="w-3.5 h-3.5 text-[#008DA9]" />
                            {latestDate} à {latestTime}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Button "Ventes du vendeur" under each vendor profile */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAdminVendorId(vendor.id);
                      setSearchTerm('');
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Ventes du vendeur</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-black">
                      {vendor.salesCount}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SALES HISTORY & CONSULTATION (Shown for Vendeur in 'historique', Comptable, and Admin when a vendor is selected) */}
      {((isVendeur && vendorSubTab === 'historique') ||
        (!isVendeur && !isAdmin) ||
        (isAdmin && selectedAdminVendor !== null)) && (
        <div className="space-y-4">
          {/* Admin Selected Vendor Profile Banner + Quick Vendor Switcher */}
          {isAdmin && selectedAdminVendor && (
            <div className="rounded-2xl border border-[#008DA9]/30 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#008DA9] text-white font-black text-base flex items-center justify-center shrink-0 shadow-xs">
                    {selectedAdminVendor.name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-full bg-[#008DA9]/10 text-[#008DA9] dark:bg-[#008DA9]/20 dark:text-cyan-300">
                        {selectedAdminVendor.code}
                      </span>
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">
                        Historique des ventes de {selectedAdminVendor.name}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{selectedAdminVendor.team}</span>
                      <span>&bull;</span>
                      <span>Tél : {selectedAdminVendor.phone}</span>
                      <span>&bull;</span>
                      <span className="text-[#008DA9] font-semibold">
                        Triées du plus récent au plus ancien (avec dates et heures)
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAdminVendorId(null);
                      setSearchTerm('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Retour aux profils des vendeurs</span>
                  </button>
                </div>
              </div>

              {/* Quick Switcher between Vendors — Grille de boutons en rangées et colonnes sans débordement */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-[11px] font-bold uppercase text-slate-400 block">
                  Changer de vendeur :
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {vendorProfiles.map((vp) => {
                    const isCurrent = vp.id === selectedAdminVendor.id;
                    return (
                      <button
                        key={vp.id}
                        type="button"
                        onClick={() => setSelectedAdminVendorId(vp.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
                          isCurrent
                            ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="truncate">{vp.name} ({vp.code})</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                            isCurrent
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {vp.salesCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Summary KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Nombre de ventes affichées</span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {filteredSales.length} <span className="text-xs text-slate-500 font-semibold">livraisons PDV</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Chiffre d&apos;affaires cumulé</span>
              <div className="text-xl font-black text-[#008DA9] mt-1">
                {totalFilteredAmount.toLocaleString('fr-FR')} <span className="text-xs font-bold">FCFA</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Points de vente livrés</span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {new Set(filteredSales.map((s) => s.pdv_id)).size} <span className="text-xs font-semibold">PDV actifs</span>
              </div>
            </div>
          </div>

          {/* Search & Chronological Sort Indicator */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par N° vente, date, heure, point de vente, quartier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {!isVendeur && !isAdmin && (
              <select
                value={filterVendorCode}
                onChange={(e) => setFilterVendorCode(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="all">Tous les vendeurs ({vendorCodes.length})</option>
                {vendorCodes.map((code) => (
                  <option key={code} value={code}>
                    Vendeur {code}
                  </option>
                ))}
              </select>
            )}

            <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#008DA9]" />
              <span>Du plus récent au plus ancien</span>
            </div>

            <button
              type="button"
              onClick={() => handleExportSalesPdf()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Exporter en PDF</span>
            </button>
          </div>

          {/* Banner explaining automatic Mini Facture Thermique in Sales History */}
          <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-950 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2.5">
              <Receipt className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Mini Facture Thermique automatique (80mm) :</strong> Chaque vente de cet historique génère automatiquement une <strong>Mini Facture Thermique (`TKT-THERM-...`)</strong> imprimable. {isVendeur ? "Seul le Comptable crée les factures officielles ; en cas d'erreur sur une facture du Comptable, vous pouvez soumettre cette mini facture thermique comme preuve dans votre demande de rectification." : "Ce ticket thermique sert également de preuve officielle lors d'une demande de rectification de facture par le vendeur."}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-200 font-mono font-bold text-[11px] shrink-0">
              Format Thermique 80mm • Preuve de Vente
            </span>
          </div>

          {/* Sales Table — Cartes sur mobile (< 640px) & Tableau compact sur tablette/desktop (>= 640px) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {/* Mobile Cards (< 640px) */}
            <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Aucune vente trouvée pour cette recherche.
                </div>
              ) : (
                filteredSales.map((s) => {
                  const totalBoxes = (s.items || []).reduce(
                    (acc: number, it: any) => acc + (it.qtyBoxes || 0),
                    0
                  );
                  const saleTime = getSaleTime(s);
                  const formattedDate = formatSaleDateFr(s.date);
                  return (
                    <div key={s.id} className="p-3.5 space-y-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-black text-slate-900 dark:text-white">{s.number}</span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                            <span>{formattedDate}</span>
                            <span>&bull;</span>
                            <span className="font-mono font-bold text-[#008DA9]">{saleTime}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm text-[#008DA9]">
                            {s.total_amount.toLocaleString('fr-FR')} FCFA
                          </div>
                          <div className="text-[10px] text-slate-500">{s.payment_type || 'Comptant'}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px]">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Client PDV</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{s.pdv_name}</span>
                          <span className="text-[10px] text-slate-500">{s.pdv_neighborhood}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendeur</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{s.vendor_name}</span>
                          <span className="font-mono text-[10px] text-[#008DA9]">{s.vendor_code}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{totalBoxes} cartons :</strong>{' '}
                        {(s.items || []).map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(', ')}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {getThermalTicketNumber(s)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenDocument(buildMiniThermalReceiptDoc(s))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs transition cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Mini Facture Thermique</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Tablet & Desktop Table (>= 640px) — Sans débordement */}
            <div className="hidden sm:block">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">N° Vente &amp; Horodatage</th>
                    <th className="py-3 px-3">Point de Vente &amp; Vendeur</th>
                    <th className="py-3 px-3">Détail Cartons</th>
                    <th className="py-3 px-3 text-right">Montant &amp; Règlement</th>
                    <th className="py-3 px-3 text-center">Mini Facture Thermique</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Aucune vente trouvée pour cette recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((s) => {
                      const totalBoxes = (s.items || []).reduce(
                        (acc: number, it: any) => acc + (it.qtyBoxes || 0),
                        0
                      );
                      const saleTime = getSaleTime(s);
                      const formattedDate = formatSaleDateFr(s.date);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">{s.number}</div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200 text-[11px]">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {formattedDate}
                              </span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#008DA9]/10 text-[#008DA9] dark:bg-[#008DA9]/20 dark:text-cyan-300 font-mono font-black text-[10px]">
                                <Clock className="w-2.5 h-2.5" />
                                {saleTime}
                              </span>
                            </div>
                            {s.isPendingOffline ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 mt-1">
                                <Clock className="w-3 h-3" /> Hors-ligne (En attente)
                              </span>
                            ) : s.recorded_offline ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 mt-1">
                                <CheckCircle2 className="w-3 h-3" /> Hors-ligne • Synchro
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                En ligne
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{s.pdv_name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#008DA9] shrink-0" />
                              <span>{s.pdv_neighborhood}</span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mt-1">
                              {s.vendor_name} <span className="font-mono text-[10px] text-[#008DA9]">({s.vendor_code})</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                            <span className="font-bold text-slate-900 dark:text-white">{totalBoxes} ctn</span>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                              {(s.items || []).map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(', ')}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="font-black text-slate-900 dark:text-white">
                              {s.total_amount.toLocaleString('fr-FR')} FCFA
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                              {s.payment_type || 'Comptant'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenDocument(buildMiniThermalReceiptDoc(s))}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs transition cursor-pointer"
                                title="Ouvrir la Mini Facture Thermique automatique (utilisable comme preuve de vente)"
                              >
                                <Receipt className="w-3.5 h-3.5 shrink-0" />
                                <span>Mini Facture</span>
                              </button>
                              <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {getThermalTicketNumber(s)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
