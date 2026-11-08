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
  XCircle,
  AlertTriangle,
  X,
  ShoppingBag,
} from 'lucide-react';
import { InvoiceData } from './PrintableDocument';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { exportTableToCsv } from '../utils/csvExport';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { DataTable, DataTableColumn } from './DataTable';
import { ExportViewButton } from './ExtractionsView';
import {
  PaymentMethodSelector,
  FORM_LABEL_CLASS,
  FORM_FIELD_CLASS,
  FORM_TEXTAREA_CLASS,
  FORM_ROW_CLASS,
  FORM_GROUP_CLASS,
  ConfirmDestructiveButton,
} from './FormControls';
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

export function buildA4ClientInvoiceDoc(sale: any): InvoiceData {
  const saleTime = getSaleTime(sale);
  const formattedDate = formatSaleDateFr(sale.date);
  const invoiceNo = sale.invoice_number || `FAC-${String(sale.number || '').replace('VTE-', '')}`;
  const isCancelled = sale.status === 'annulee';
  const totalHt = Number(sale.subtotal_ht || sale.total_amount || 0);
  const tvaAmt = Number(sale.tva_amount || 0);
  const totalTtc = Number(sale.total_ttc || sale.total_amount || 0);
  return {
    id: sale.id,
    number: invoiceNo,
    saleNumber: sale.number,
    thermalTicketNumber: getThermalTicketNumber(sale),
    saleTime,
    type: 'facture',
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
    subtotalHt: totalHt,
    tvaAmount: tvaAmt,
    items: (sale.items || []).map((it: any) => ({
      code: it.code,
      name: it.name,
      qty: it.qtyBoxes ?? it.qty ?? 0,
      price: it.unitPrice ?? it.price ?? 0,
      total: it.total ?? 0,
    })),
    total: totalTtc,
    paymentMethod: sale.payment_type || 'Comptant',
    cashierName: `${sale.vendor_name} (${sale.vendor_code})`,
    status: isCancelled
      ? `FACTURE ANNULÉE (${sale.cancel_reason || 'Direction des ventes'})`
      : 'Facture Client PDV Valide',
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
  const isDirecteurOps = currentUser.role === 'Directeur des opérations de vente';
  const isSalesAdmin = currentUser.role === 'Sales Admin';
  const canCancelSale = isSalesAdmin || isAdmin || isDirecteurOps;
  const canCreateSale = isVendeur || isAdmin;

  // Sub-tabs for Directeur des opérations de vente & Admin ('globale' | 'demandes-annulation' | 'par-vendeur' | 'historique-sku' | 'nouvelle')
  const [directorSubTab, setDirectorSubTab] = useState<'globale' | 'demandes-annulation' | 'par-vendeur' | 'historique-sku' | 'nouvelle'>(() => {
    if (initialTab === 'historique-sku') return 'historique-sku';
    if (initialTab === 'demandes-annulation-vente') return 'demandes-annulation';
    if (initialTab === 'nouvelle-vente' && isAdmin) return 'nouvelle';
    return 'globale';
  });

  // Period & SKU filters for "Historique des ventes par SKU sur une période donnée"
  const [skuStartDate, setSkuStartDate] = useState<string>('2026-05-01');
  const [skuEndDate, setSkuEndDate] = useState<string>('2026-10-31');
  const [selectedSkuCode, setSelectedSkuCode] = useState<string>('ALL');
  const [selectedSkuVendorCode, setSelectedSkuVendorCode] = useState<string>('ALL');

  // Sale cancellation modal state (Sales Admin / Contrôleur, Directeur des opérations de vente & Administrateur)
  const [cancellingSale, setCancellingSale] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancellingSale, setIsCancellingSale] = useState<boolean>(false);
  const [cancelSaleFeedback, setCancelSaleFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Demande d'annulation de vente par le Vendeur -> soumise au Directeur des opérations de vente (DOV)
  const [requestingCancelSale, setRequestingCancelSale] = useState<any | null>(null);
  const [requestCancelReason, setRequestCancelReason] = useState<string>('');
  const [isRequestingCancel, setIsRequestingCancel] = useState<boolean>(false);

  // Traitement (Approbation / Rejet) d'une demande d'annulation par le Directeur des opérations de vente (DOV) ou Administrateur
  const [rejectingCancelRequestSale, setRejectingCancelRequestSale] = useState<any | null>(null);
  const [rejectCancelReason, setRejectCancelReason] = useState<string>('');
  const [isReviewingCancelRequest, setIsReviewingCancelRequest] = useState<boolean>(false);

  const [vendorSubTab, setVendorSubTab] = useState<'nouvelle' | 'historique'>(() => {
    if (!isVendeur) return 'historique';
    if (initialTab === 'mes-ventes') return 'historique';
    return 'nouvelle';
  });

  // For Admin / Directeur Ops: null = show vendor profile cards; string = selected vendor's ID to display their sales history
  const [selectedAdminVendorId, setSelectedAdminVendorId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab === 'historique-sku') {
      setDirectorSubTab('historique-sku');
    } else if (initialTab === 'demandes-annulation-vente' && (isDirecteurOps || isAdmin)) {
      setDirectorSubTab('demandes-annulation');
    } else if (initialTab === 'nouvelle-vente' && isAdmin) {
      setDirectorSubTab('nouvelle');
    } else if (initialTab === 'ventes' && (isDirecteurOps || isAdmin)) {
      setDirectorSubTab('globale');
    }
    if (!isVendeur) {
      setVendorSubTab('historique');
    } else if (initialTab === 'mes-ventes') {
      setVendorSubTab('historique');
    } else if (initialTab === 'nouvelle-vente') {
      setVendorSubTab('nouvelle');
    }
  }, [initialTab, isVendeur, isDirecteurOps, isAdmin]);

  const [selectedPdvId, setSelectedPdvId] = useState(pdvs.filter((p) => p.status === 'valide')[0]?.id || '');
  const [selectedSaleVendorId, setSelectedSaleVendorId] = useState<string>(
    usersList.find((u) => u.role === 'Vendeur')?.id || 'usr-vnd-1'
  );
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
  const effectiveVendorUser = useMemo(() => {
    if (isVendeur) return currentUser;
    const found = usersList.find((u) => u.id === selectedSaleVendorId && u.role === 'Vendeur');
    return (
      found || {
        id: 'usr-vnd-1',
        name: 'Oumar Konaté',
        code: 'BAO-VND-001',
        team: 'Équipe Sotuba / Rive Gauche',
        role: 'Vendeur',
      }
    );
  }, [isVendeur, currentUser, usersList, selectedSaleVendorId]);

  const myChargement = chargements.find((c) => c.vendor_id === effectiveVendorUser.id);
  const validPdvs = pdvs.filter((p) => p.status === 'valide');

  const addToCart = (productId: string, delta: number) => {
    if (!canCreateSale) return;
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
    if (!canCreateSale || cartItems.length === 0 || !selectedPdvId) return;
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
          vendor_id: effectiveVendorUser.id,
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
          vendorName: effectiveVendorUser.name,
          vendorCode: effectiveVendorUser.code,
          vendorTeam: effectiveVendorUser.team,
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

  // Annulation d'une vente par le Sales Admin (Contrôleur) ou Administrateur
  const handleConfirmCancelSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSale || !cancelReason.trim()) return;
    setIsCancellingSale(true);
    setCancelSaleFeedback(null);
    try {
      const res = await fetch(`/api/sales/${cancellingSale.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ cancel_reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'annulation de la vente.");
      }
      setCancelSaleFeedback({
        type: 'success',
        text: data.message || `Vente ${cancellingSale.number} annulée avec succès.`,
      });
      setCancellingSale(null);
      setCancelReason('');
      onRefreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'annulation.";
      setCancelSaleFeedback({ type: 'error', text: msg });
    } finally {
      setIsCancellingSale(false);
    }
  };

  // Soumission d'une demande d'annulation de vente par le Vendeur -> Directeur des opérations de vente (DOV)
  const handleSubmitVendorCancelRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestingCancelSale || !requestCancelReason.trim()) return;
    setIsRequestingCancel(true);
    setCancelSaleFeedback(null);
    try {
      const res = await fetch(`/api/sales/${requestingCancelSale.id}/request-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ reason: requestCancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'envoi de la demande d'annulation.");
      }
      setCancelSaleFeedback({
        type: 'success',
        text:
          data.message ||
          `Demande d'annulation pour la vente ${requestingCancelSale.number} envoyée au Directeur des opérations de vente.`,
      });
      setRequestingCancelSale(null);
      setRequestCancelReason('');
      onRefreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'envoi de la demande.";
      setCancelSaleFeedback({ type: 'error', text: msg });
    } finally {
      setIsRequestingCancel(false);
    }
  };

  // Approbation ou rejet d'une demande d'annulation vendeur par le Directeur des opérations de vente (DOV) ou Administrateur
  const handleReviewCancelRequest = async (saleObj: any, decision: 'approve' | 'reject', customReason?: string) => {
    if (!saleObj) return;
    setIsReviewingCancelRequest(true);
    setCancelSaleFeedback(null);
    try {
      const res = await fetch(`/api/sales/${saleObj.id}/review-cancel-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          decision,
          response_reason: customReason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors du traitement de la demande.');
      }
      setCancelSaleFeedback({
        type: 'success',
        text: data.message,
      });
      setRejectingCancelRequestSale(null);
      setRejectCancelReason('');
      onRefreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du traitement.';
      setCancelSaleFeedback({ type: 'error', text: msg });
    } finally {
      setIsReviewingCancelRequest(false);
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

  const pendingCancelRequests = useMemo(
    () => sortedCombinedSales.filter((s) => s.cancel_request_status === 'en_attente' && s.status !== 'annulee'),
    [sortedCombinedSales]
  );

  const allCancelRequests = useMemo(
    () =>
      sortedCombinedSales
        .filter((s) => Boolean(s.cancel_request_status))
        .sort((a, b) => {
          const aPend = a.cancel_request_status === 'en_attente' && a.status !== 'annulee' ? 0 : 1;
          const bPend = b.cancel_request_status === 'en_attente' && b.status !== 'annulee' ? 0 : 1;
          if (aPend !== bPend) return aPend - bPend;
          return getSaleSortKey(b).localeCompare(getSaleSortKey(a));
        }),
    [sortedCombinedSales]
  );

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
        const activeVSales = vSales.filter((s) => s.status !== 'annulee');
        const totalAmount = activeVSales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
        const totalBoxes = activeVSales.reduce(
          (acc, s) =>
            acc + (s.items || []).reduce((sum: number, it: any) => sum + Number(it.qtyBoxes || 0), 0),
          0
        );
        const uniquePdvs = new Set(activeVSales.map((s) => s.pdv_id)).size;
        const latestSale = activeVSales[0] || vSales[0] || null;

        return {
          ...v,
          salesCount: activeVSales.length,
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
    if ((isAdmin || isDirecteurOps) && selectedAdminVendor) {
      return selectedAdminVendor.sales;
    }
    return sortedCombinedSales;
  }, [isVendeur, isAdmin, isDirecteurOps, selectedAdminVendor, sortedCombinedSales, currentUser.id]);

  const vendorCodes = Array.from(new Set(sortedCombinedSales.map((s) => s.vendor_code).filter(Boolean)));

  const filteredSales = useMemo(() => {
    return visibleSales.filter((s) => {
      const matchesVendor =
        (isAdmin || isDirecteurOps) && selectedAdminVendor
          ? true
          : filterVendorCode === 'all' || s.vendor_code === filterVendorCode;
      const q = searchTerm.toLowerCase();
      const saleTime = getSaleTime(s);
      const invoiceRef = s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`;
      const matchesSearch =
        !q ||
        (s.number || '').toLowerCase().includes(q) ||
        invoiceRef.toLowerCase().includes(q) ||
        (s.pdv_name || '').toLowerCase().includes(q) ||
        (s.pdv_neighborhood || '').toLowerCase().includes(q) ||
        (s.vendor_name || '').toLowerCase().includes(q) ||
        (s.vendor_code || '').toLowerCase().includes(q) ||
        (s.date || '').toLowerCase().includes(q) ||
        formatSaleDateFr(s.date).toLowerCase().includes(q) ||
        saleTime.toLowerCase().includes(q);
      return matchesVendor && matchesSearch;
    });
  }, [visibleSales, isAdmin, isDirecteurOps, selectedAdminVendor, filterVendorCode, searchTerm]);

  const totalFilteredAmount = filteredSales
    .filter((s) => s.status !== 'annulee')
    .reduce((sum, s) => sum + (s.total_amount || 0), 0);

  // Analytics & Chronological Line Items for "Historique des ventes par SKU sur une période donnée"
  const periodFilteredSalesForSku = useMemo(() => {
    return sortedCombinedSales.filter((s) => {
      if (isVendeur && s.vendor_id !== currentUser.id) return false;
      const dateStr = (s.date || '').split('T')[0];
      if (skuStartDate && dateStr < skuStartDate) return false;
      if (skuEndDate && dateStr > skuEndDate) return false;
      if (selectedSkuVendorCode !== 'ALL' && s.vendor_code !== selectedSkuVendorCode) return false;
      return true;
    });
  }, [sortedCombinedSales, skuStartDate, skuEndDate, selectedSkuVendorCode, isVendeur, currentUser.id]);

  const skuSummaryByProduct = useMemo(() => {
    const activePeriodSales = periodFilteredSalesForSku.filter((s) => s.status !== 'annulee');
    const grandTotalRevenue = activePeriodSales.reduce((acc, s) => {
      const items = Array.isArray(s.items) ? s.items : [];
      return (
        acc +
        items
          .filter((it: any) => selectedSkuCode === 'ALL' || it.code === selectedSkuCode)
          .reduce((sum: number, it: any) => sum + Number(it.total || (it.qtyBoxes || 0) * (it.unitPrice || 0)), 0)
      );
    }, 0);

    return products
      .filter((p) => selectedSkuCode === 'ALL' || p.code === selectedSkuCode)
      .map((prod) => {
        let totalBoxesSold = 0;
        let totalRevenue = 0;
        let salesCount = 0;
        const pdvSet = new Set<string>();

        for (const s of activePeriodSales) {
          const items = Array.isArray(s.items) ? s.items : [];
          const matchingLine = items.find(
            (it: any) => it.code === prod.code || it.productId === prod.id || it.name === prod.name
          );
          if (matchingLine) {
            const boxes = Number(matchingLine.qtyBoxes ?? matchingLine.qty ?? 0);
            const rev = Number(matchingLine.total ?? boxes * prod.price_box);
            totalBoxesSold += boxes;
            totalRevenue += rev;
            salesCount += 1;
            if (s.pdv_id) pdvSet.add(s.pdv_id);
          }
        }

        const sharePercent = grandTotalRevenue > 0 ? Math.round((totalRevenue / grandTotalRevenue) * 100) : 0;

        return {
          ...prod,
          totalBoxesSold,
          totalUnitsSold: totalBoxesSold * (prod.units_per_box || 12),
          totalRevenue,
          salesCount,
          uniquePdvsCount: pdvSet.size,
          sharePercent,
        };
      });
  }, [products, periodFilteredSalesForSku, selectedSkuCode]);

  const skuChronologicalLineItems = useMemo(() => {
    const lines: Array<{
      lineKey: string;
      sale: any;
      skuCode: string;
      productName: string;
      qtyBoxes: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const s of periodFilteredSalesForSku) {
      const items = Array.isArray(s.items) ? s.items : [];
      items.forEach((it: any, idx: number) => {
        const code = it.code || 'SKU';
        if (selectedSkuCode !== 'ALL' && code !== selectedSkuCode) return;
        const qtyBoxes = Number(it.qtyBoxes ?? it.qty ?? 0);
        const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
        const lineTotal = Number(it.total ?? qtyBoxes * unitPrice);
        lines.push({
          lineKey: `${s.id}-${code}-${idx}`,
          sale: s,
          skuCode: code,
          productName: it.name || code,
          qtyBoxes,
          unitPrice,
          lineTotal,
        });
      });
    }
    return lines;
  }, [periodFilteredSalesForSku, selectedSkuCode]);

  const handleExportSkuHistoryPdf = () => {
    const activeLines = skuChronologicalLineItems.filter((l) => l.sale.status !== 'annulee');
    const totalBoxes = activeLines.reduce((sum, l) => sum + l.qtyBoxes, 0);
    const totalAmount = activeLines.reduce((sum, l) => sum + l.lineTotal, 0);

    exportTableToPdf({
      title: `Historique des Ventes par SKU (${selectedSkuCode === 'ALL' ? 'Tous les SKU' : selectedSkuCode})`,
      subtitle: `Periode du ${formatSaleDateFr(skuStartDate)} au ${formatSaleDateFr(skuEndDate)} ${
        selectedSkuVendorCode !== 'ALL' ? `- Vendeur : ${selectedSkuVendorCode}` : '- Toutes les equipes'
      }`,
      filename: `historique_ventes_sku_${skuStartDate}_${skuEndDate}.pdf`,
      roleLabel: `Utilisateur : ${currentUser.name} (${currentUser.role})`,
      summaryCards: [
        { label: 'Periode analysee', value: `${formatSaleDateFr(skuStartDate)} - ${formatSaleDateFr(skuEndDate)}` },
        { label: 'Filtre SKU', value: selectedSkuCode === 'ALL' ? '4 references SKU' : selectedSkuCode },
        { label: 'Cartons vendus', value: `${totalBoxes} cartons` },
        { label: 'CA Periode (SKU)', value: formatFcfaPdf(totalAmount) },
      ],
      columns: [
        'Date & Heure',
        'Facture PDV / Vente',
        'Client PDV (Quartier)',
        'Vendeur',
        'Code SKU & Produit',
        'Quantite',
        'Montant Ligne',
      ],
      rows: skuChronologicalLineItems.map((l) => {
        const invNo = l.sale.invoice_number || `FAC-${String(l.sale.number || '').replace('VTE-', '')}`;
        return [
          `${formatSaleDateFr(l.sale.date)} a ${getSaleTime(l.sale)}`,
          `${invNo} (${l.sale.number})${l.sale.status === 'annulee' ? ' [ANNULEE]' : ''}`,
          `${l.sale.pdv_name || ''} (${l.sale.pdv_neighborhood || ''})`,
          `${l.sale.vendor_name || ''} (${l.sale.vendor_code || ''})`,
          `${l.skuCode} - ${l.productName}`,
          `${l.qtyBoxes} cartons`,
          formatFcfaPdf(l.lineTotal),
        ];
      }),
    });
  };

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

  const handleExportSkuHistoryCsv = () => {
    exportTableToCsv({
      filename: `historique_ventes_sku_${skuStartDate}_${skuEndDate}.csv`,
      columns: [
        'Date',
        'Heure',
        'N° Vente',
        'Facture PDV',
        'Point de Vente',
        'Quartier',
        'Nom Vendeur',
        'Code Vendeur',
        'Code SKU',
        'Designation Produit',
        'Quantite (Cartons)',
        'Prix Unitaire Carton (FCFA)',
        'Montant Ligne (FCFA)',
        'Statut Vente',
      ],
      rows: skuChronologicalLineItems.map((l) => {
        const invNo = l.sale.invoice_number || `FAC-${String(l.sale.number || '').replace('VTE-', '')}`;
        return [
          l.sale.date || '',
          getSaleTime(l.sale),
          l.sale.number || l.sale.id,
          invNo,
          l.sale.pdv_name || '',
          l.sale.pdv_neighborhood || '',
          l.sale.vendor_name || '',
          l.sale.vendor_code || '',
          l.skuCode,
          l.productName,
          l.qtyBoxes,
          l.unitPrice,
          l.lineTotal,
          l.sale.status === 'annulee' ? 'Annulee' : 'Validee',
        ];
      }),
    });
  };

  const handleExportSalesCsv = (salesToExport = filteredSales) => {
    exportTableToCsv({
      filename: `ventes_baobab_${new Date().toISOString().split('T')[0]}.csv`,
      columns: [
        'N° Vente',
        'N° Facture PDV',
        'Date',
        'Heure',
        'Point de Vente',
        'Quartier',
        'Nom Vendeur',
        'Code Vendeur',
        'Total Cartons',
        'Detail Produits Vendus',
        'Mode de Reglement',
        'Statut',
        'Montant Total (FCFA)',
      ],
      rows: salesToExport.map((s) => {
        const boxes = (s.items || []).reduce((acc: number, it: any) => acc + Number(it.qtyBoxes || 0), 0);
        const detail = (s.items || [])
          .map((it: any) => `${it.qtyBoxes}x ${it.name}`)
          .join(' | ');
        const invNo = s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`;
        return [
          s.number || s.id,
          invNo,
          s.date || '',
          getSaleTime(s),
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? 'Ventes & Livraisons aux Points de Vente'
                : isDirecteurOps || isAdmin
                ? directorSubTab === 'historique-sku'
                  ? 'Analyse des Ventes par Produit'
                  : directorSubTab === 'nouvelle'
                  ? 'Enregistrer une Nouvelle Vente PDV'
                  : 'Ventes Vendeurs & Factures Clients PDV'
                : isSalesAdmin
                ? 'Contrôle & Annulation des Ventes'
                : 'Consultation des Ventes'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)]">
              {isVendeur
                ? 'Vendeur'
                : isAdmin
                ? 'Administrateur'
                : isDirecteurOps
                ? 'Directeur des opérations'
                : isSalesAdmin
                ? 'Sales Admin'
                : currentUser.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isVendeur
                ? 'Vos ventes, livraisons et factures clients PDV.'
                : 'Suivi des ventes, livraisons et factures PDV.'}
            </p>
            <InfoTooltip
              text={
                isAdmin
                  ? 'Vue globale sur les opérations de vente, analyse par référence produit sur une période donnée, consultation par vendeur, création et annulation de vente ou facture client PDV.'
                  : isDirecteurOps
                  ? "Vue globale sur les ventes des vendeurs, analyse des ventes par produit sur une période donnée et annulation de la facture du client d'un PDV."
                  : isSalesAdmin
                  ? "Contrôlez les ventes des équipes commerciales et annulez une vente en cas d'anomalie ou d'erreur (avec réintégration automatique dans le stock camionnette du vendeur)."
                  : isVendeur
                  ? 'Enregistrez vos ventes même en absence de réseau : elles sont sauvegardées localement avec la date, l’heure et votre position GPS, puis synchronisées automatiquement.'
                  : 'Consultation en lecture seule des ventes réalisées par les équipes commerciales (du plus récent au plus ancien avec date et heure).'
              }
            />
          </div>
        </div>

        {isVendeur ? (
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setVendorSubTab('nouvelle');
                setDirectorSubTab('nouvelle');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                vendorSubTab === 'nouvelle' && directorSubTab !== 'historique-sku'
                  ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              + Vente
            </button>
            <button
              onClick={() => {
                setVendorSubTab('historique');
                setDirectorSubTab('globale');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                vendorSubTab === 'historique' && directorSubTab !== 'historique-sku'
                  ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Mes ventes ({visibleSales.length})
            </button>
            <button
              onClick={() => {
                setDirectorSubTab('historique-sku');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center flex items-center justify-center gap-1 ${
                directorSubTab === 'historique-sku'
                  ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>Par SKU</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {(isAdmin || isDirecteurOps) && selectedAdminVendor && (
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
            <ExportViewButton
              currentUser={currentUser}
              jeu={
                directorSubTab === 'historique-sku'
                  ? 'analyse_produits'
                  : directorSubTab === 'demandes-annulation'
                  ? 'annulations_vente'
                  : 'ventes'
              }
              label="Exporter"
              du={directorSubTab === 'historique-sku' ? skuStartDate : undefined}
              au={directorSubTab === 'historique-sku' ? skuEndDate : undefined}
              filtres={{
                vendor_id: selectedAdminVendor?.id || '',
                q: searchTerm,
              }}
            />
            <ExportViewButton
              currentUser={currentUser}
              jeu="factures_pdv"
              label="Exporter Factures PDV"
              filtres={{
                vendor_id: selectedAdminVendor?.id || '',
                q: searchTerm,
              }}
            />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold">
              <Shield className="w-4 h-4 text-[#008DA9]" />
              <span>
                {isAdmin
                  ? 'Administrateur • Tous les droits actifs'
                  : canCancelSale
                  ? 'Contrôle actif • Annulation de facture PDV / vente autorisée'
                  : 'Lecture seule • Aucune création de vente ni de facture'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-tabs pour tous les profils */}
      {!isVendeur && (
        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <button
            type="button"
            onClick={() => {
              setDirectorSubTab('globale');
              setSelectedAdminVendorId(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              directorSubTab === 'globale'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Vue globale des ventes &amp; Factures PDV ({sortedCombinedSales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectorSubTab('demandes-annulation');
              setSelectedAdminVendorId(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              directorSubTab === 'demandes-annulation'
                ? 'bg-rose-600 text-white shadow-xs'
                : pendingCancelRequests.length > 0
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Demandes d&apos;annulation vendeurs</span>
            {pendingCancelRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-2xs">
                {pendingCancelRequests.length} en attente
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectorSubTab('historique-sku');
              setSelectedAdminVendorId(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              directorSubTab === 'historique-sku'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Analyse des ventes par produit</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectorSubTab('par-vendeur');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              directorSubTab === 'par-vendeur'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Ventes par Vendeur ({vendorProfiles.length} équipes)</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setDirectorSubTab('nouvelle');
                setSelectedAdminVendorId(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                directorSubTab === 'nouvelle'
                  ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                  : 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] bg-[var(--marque-clair)] hover:opacity-90'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ Nouvelle vente PDV</span>
            </button>
          )}
        </div>
      )}

      {/* BANNIÈRE D'ALERTE POUR LE DIRECTEUR DES OPÉRATIONS DE VENTE (DOV) & ADMIN QUAND UN VENDEUR A SOUMIS UNE DEMANDE D'ANNULATION */}
      {(isDirecteurOps || isAdmin) && pendingCancelRequests.length > 0 && directorSubTab !== 'demandes-annulation' && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-rose-950 dark:text-rose-200 flex items-center gap-2 flex-wrap">
                <span>
                  {pendingCancelRequests.length} demande{pendingCancelRequests.length > 1 ? 's' : ''} d&apos;annulation de vente soumise{pendingCancelRequests.length > 1 ? 's' : ''} par les vendeurs
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  Validation DOV requise
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                Un vendeur a signalé une erreur dans sa vente et demande son annulation avec réintégration du stock camionnette.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDirectorSubTab('demandes-annulation')}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition cursor-pointer shrink-0"
          >
            Examiner &amp; Valider ({pendingCancelRequests.length})
          </button>
        </div>
      )}

      {cancelSaleFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            cancelSaleFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {cancelSaleFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            {cancelSaleFeedback.text}
          </span>
          <button onClick={() => setCancelSaleFeedback(null)} className="font-mono text-sm cursor-pointer">&times;</button>
        </div>
      )}

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
              className="px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
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

      {/* VENDEUR OR ADMIN: Nouvelle Vente Form */}
      {((isVendeur && vendorSubTab === 'nouvelle') || (isAdmin && directorSubTab === 'nouvelle')) && (
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
              {isAdmin && (
                <div>
                  <label className="block text-slate-500 mb-1 font-semibold">
                    Vendeur rattaché à la vente
                  </label>
                  <select
                    value={selectedSaleVendorId}
                    onChange={(e) => setSelectedSaleVendorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                  >
                    {vendorProfiles.map((vp) => (
                      <option key={vp.id} value={vp.id}>
                        {vp.name} ({vp.code}) — {vp.team}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
                  Mode de paiement
                </label>
                <PaymentMethodSelector
                  value={paymentType}
                  onChange={setPaymentType}
                  especesValue="Comptant"
                  mobileMoneyValue="Mobile Money"
                  virementValue="Virement"
                />
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
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800 dark:text-slate-200 break-words">{it.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {it.qtyBoxes} cartons &times; {it.unitPrice.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                        <div className="font-black text-slate-900 dark:text-white shrink-0">
                          {it.total.toLocaleString('fr-FR')} FCFA
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => addToCart(it.productId, -1)}
                          className="h-[34px] px-2.5 rounded-lg border border-[#64748B] dark:border-[#94A3B8] bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          - 1 ctn
                        </button>
                        <button
                          type="button"
                          onClick={() => addToCart(it.productId, 1)}
                          className="h-[34px] px-2.5 rounded-lg border border-[#64748B] dark:border-[#94A3B8] bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          + 1 ctn
                        </button>
                        <ConfirmDestructiveButton
                          onConfirm={() => addToCart(it.productId, -it.qtyBoxes)}
                          label="Supprimer"
                          confirmLabel="Supprimer ?"
                          className="h-[34px] text-xs py-0"
                        />
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
                  className="w-full min-h-[48px] py-2.5 px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] active:bg-[#004A5A] disabled:opacity-50 text-[var(--marque-texte-sur-plein)] font-bold text-sm leading-tight text-center break-words flex items-center justify-center gap-2 shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marque-fonce)]"
                >
                  <Receipt className="w-4 h-4 shrink-0" />
                  <span>
                    {online
                      ? 'Valider la Vente & Générer Mini Facture Thermique'
                      : 'Enregistrer Hors-Ligne & Générer Mini Facture Thermique'}
                  </span>
                </button>
              </div>
            </form>

            {/* Encart d'accès rapide : Erreur dans une vente récente ? Demander l'annulation au DOV */}
            {isVendeur && visibleSales.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Erreur dans une vente ?</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setVendorSubTab('historique')}
                    className="text-[11px] font-bold text-[#008DA9] hover:underline cursor-pointer"
                  >
                    Voir toutes mes ventes &rarr;
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  En cas d&apos;erreur de saisie (quantité, produit ou client PDV), soumettez une <strong>demande d&apos;annulation au Directeur des opérations de vente (DOV)</strong> :
                </p>
                <div className="space-y-1.5">
                  {visibleSales.slice(0, 3).map((recentSale) => {
                    const isCancelled = recentSale.status === 'annulee';
                    const isPendingReq = recentSale.cancel_request_status === 'en_attente';
                    return (
                      <div
                        key={recentSale.id}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2 text-[11px] flex-wrap"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-bold text-slate-900 dark:text-white break-words">
                            {recentSale.number} &bull; {Number(recentSale.total_amount || 0).toLocaleString('fr-FR')} FCFA
                          </div>
                          <div className="text-[10px] text-slate-500 break-words">
                            {recentSale.pdv_name} ({formatSaleDateFr(recentSale.date)} à {getSaleTime(recentSale)})
                          </div>
                        </div>
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 shrink-0">
                            Annulée
                          </span>
                        ) : isPendingReq ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 shrink-0">
                            En attente DOV
                          </span>
                        ) : !recentSale.isPendingOffline ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRequestingCancelSale(recentSale);
                              setRequestCancelReason('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] shrink-0 cursor-pointer transition"
                          >
                            Demander annulation
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ONGLET DÉDIÉ DOV, ADMIN & CONTROLEUR : DEMANDES D'ANNULATION DE VENTES SOUMISES PAR LES VENDEURS */}
      {(isDirecteurOps || isAdmin || isSalesAdmin) && directorSubTab === 'demandes-annulation' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Demandes d&apos;Annulation de Vente des Vendeurs ({allCancelRequests.length})
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Validation des demandes d&apos;annulation vendeurs.
                  </p>
                  <InfoTooltip text="Lorsqu'un vendeur commet une erreur dans une vente, sa demande d'annulation vous est soumise ici. Approuvez-la pour annuler la vente et réintégrer automatiquement les cartons dans son stock camionnette." />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-black text-xs">
                {pendingCancelRequests.length} en attente
              </span>
            </div>
          </div>

          {allCancelRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-400">
              Aucune demande d&apos;annulation de vente soumise par les vendeurs pour le moment.
            </div>
          ) : (
            <div className="space-y-4">
              {allCancelRequests.map((s) => {
                const totalBoxes = (s.items || []).reduce((acc: number, it: any) => acc + Number(it.qtyBoxes || 0), 0);
                const isPending = s.cancel_request_status === 'en_attente' && s.status !== 'annulee';
                const isApproved = s.cancel_request_status === 'approuvee' || s.status === 'annulee';
                const isRejected = s.cancel_request_status === 'rejetee' && s.status !== 'annulee';

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-xs transition space-y-4 ${
                      isPending
                        ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20'
                        : isApproved
                        ? 'border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                          {s.number}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({formatSaleDateFr(s.date)} à {getSaleTime(s)})
                        </span>
                        {isPending && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950">
                            En attente de validation DOV
                          </span>
                        )}
                        {isApproved && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Annulation Approuvée (Vente annulée)
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Demande Refusée
                          </span>
                        )}
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-base font-black text-[#008DA9]">
                          {Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                        <span className="text-xs text-slate-500 ml-2">({totalBoxes} cartons &bull; {s.payment_type || 'Comptant'})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Vendeur demandeur</span>
                        <span className="font-black text-slate-900 dark:text-white block mt-0.5">
                          {s.vendor_name} ({s.vendor_code})
                        </span>
                        <span className="text-[11px] text-slate-500">{s.vendor_team || 'Équipe Commerciale'}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Client Point de Vente (PDV)</span>
                        <span className="font-black text-slate-900 dark:text-white block mt-0.5">
                          {s.pdv_name}
                        </span>
                        <span className="text-[11px] text-slate-500">{s.pdv_neighborhood}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Détail des produits vendus</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                          {(s.items || []).map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-xs space-y-1">
                      <div className="font-black text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Motif de l&apos;erreur déclaré par le vendeur :</span>
                      </div>
                      <p className="text-rose-950 dark:text-rose-100 font-medium pl-5">
                        &laquo; {s.cancel_request_reason || 'Erreur de saisie signalée par le vendeur'} &raquo;
                      </p>
                      {s.cancel_rejection_reason && (
                        <p className="text-xs text-rose-700 dark:text-rose-300 pl-5 pt-1">
                          <strong>Motif du refus DOV :</strong> {s.cancel_rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onOpenDocument(buildA4ClientInvoiceDoc(s))}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Voir Facture PDV A4</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDocument(buildMiniThermalReceiptDoc(s))}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 font-bold text-xs cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Voir Ticket Thermique</span>
                        </button>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            disabled={isReviewingCancelRequest}
                            onClick={() => {
                              setRejectingCancelRequestSale(s);
                              setRejectCancelReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser la demande</span>
                          </button>

                          <button
                            type="button"
                            disabled={isReviewingCancelRequest}
                            onClick={() => handleReviewCancelRequest(s, 'approve')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Approuver &amp; Annuler la vente</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HISTORIQUE DES VENTES PAR SKU SUR UNE PÉRIODE DONNÉE */}
      {directorSubTab === 'historique-sku' && (
        <div className="space-y-6">
          {/* Barre de filtres Période + SKU + Vendeur + Export PDF */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#008DA9] shrink-0" />
                  <span>Analyse des Ventes par Produit sur Période</span>
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Volumes et chiffre d&apos;affaires par produit.
                  </p>
                  <InfoTooltip text="Analysez les volumes (cartons/unités) et le chiffre d'affaires par référence produit sur la période de votre choix." />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const is7Days = skuStartDate === '2026-10-24' && skuEndDate === '2026-10-31';
                  const isOctobre = skuStartDate === '2026-10-01' && skuEndDate === '2026-10-31';
                  const is3Months = skuStartDate === '2026-08-01' && skuEndDate === '2026-10-31';
                  const is6Months = skuStartDate === '2026-05-01' && skuEndDate === '2026-10-31';

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSkuStartDate('2026-10-24');
                          setSkuEndDate('2026-10-31');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                          is7Days
                            ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-sm ring-2 ring-[#008DA9]/25'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        {is7Days && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        <span>7 derniers jours</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSkuStartDate('2026-10-01');
                          setSkuEndDate('2026-10-31');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                          isOctobre
                            ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-sm ring-2 ring-[#008DA9]/25'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        {isOctobre && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        <span>Mois d&apos;Octobre 2026</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSkuStartDate('2026-08-01');
                          setSkuEndDate('2026-10-31');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                          is3Months
                            ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-sm ring-2 ring-[#008DA9]/25'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        {is3Months && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        <span>3 derniers mois</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSkuStartDate('2026-05-01');
                          setSkuEndDate('2026-10-31');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                          is6Months
                            ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-sm ring-2 ring-[#008DA9]/25'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        {is6Months && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        <span>Toute la période (6 mois)</span>
                      </button>
                    </>
                  );
                })()}

                {!isVendeur && (
                  <>
                    <ExportViewButton
                      currentUser={currentUser}
                      jeu="analyse_produits"
                      label="Exporter Analyse SKU"
                      du={skuStartDate}
                      au={skuEndDate}
                      filtres={{ q: selectedSkuCode !== 'ALL' ? selectedSkuCode : '' }}
                    />
                    <button
                      type="button"
                      onClick={handleExportSkuHistoryPdf}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Exporter PDF SKU</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Résumé dynamique instantané de la période sélectionnée (visible immédiatement sur mobile et PC) */}
            {(() => {
              const activeLines = skuChronologicalLineItems.filter((l) => l.sale.status !== 'annulee');
              const totalBoxesPeriod = activeLines.reduce((sum, l) => sum + l.qtyBoxes, 0);
              const totalCaPeriod = activeLines.reduce((sum, l) => sum + l.lineTotal, 0);
              const periodLabel =
                skuStartDate === '2026-10-24' && skuEndDate === '2026-10-31'
                  ? '7 derniers jours'
                  : skuStartDate === '2026-10-01' && skuEndDate === '2026-10-31'
                  ? "Mois d'Octobre 2026"
                  : skuStartDate === '2026-08-01' && skuEndDate === '2026-10-31'
                  ? '3 derniers mois (Août – Oct. 2026)'
                  : skuStartDate === '2026-05-01' && skuEndDate === '2026-10-31'
                  ? 'Toute la période (6 mois : Mai – Oct. 2026)'
                  : 'Période personnalisée';

              return (
                <div className="p-3 sm:p-3.5 rounded-xl bg-teal-50/80 dark:bg-teal-950/35 border border-teal-200/80 dark:border-teal-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Filtre actif : <strong className="text-[#008DA9] dark:text-cyan-300">{periodLabel}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-800 font-mono font-bold text-slate-800 dark:text-slate-200">
                      Du {formatSaleDateFr(skuStartDate)} au {formatSaleDateFr(skuEndDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Lignes SKU : <strong className="font-black text-slate-900 dark:text-white">{activeLines.length}</strong>
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Volume : <strong className="font-black text-emerald-700 dark:text-emerald-400">{totalBoxesPeriod.toLocaleString('fr-FR')} cartons</strong>
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      CA Période : <strong className="font-black text-[#008DA9] dark:text-cyan-300">{totalCaPeriod.toLocaleString('fr-FR')} FCFA</strong>
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Date de début (Du) :
                </label>
                <input
                  type="date"
                  value={skuStartDate}
                  onChange={(e) => setSkuStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Date de fin (Au) :
                </label>
                <input
                  type="date"
                  value={skuEndDate}
                  onChange={(e) => setSkuEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Référence SKU / Produit :
                </label>
                <select
                  value={selectedSkuCode}
                  onChange={(e) => setSelectedSkuCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="ALL">Tous les SKU ({products.length} références)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Vendeur :
                </label>
                <select
                  value={selectedSkuVendorCode}
                  onChange={(e) => setSelectedSkuVendorCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="ALL">Tous les vendeurs</option>
                  {vendorProfiles.map((vp) => (
                    <option key={vp.id} value={vp.code}>
                      {vp.name} ({vp.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Synthèse par SKU sur la période */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {skuSummaryByProduct.map((sku) => (
              <div
                key={sku.id}
                onClick={() => setSelectedSkuCode(selectedSkuCode === sku.code ? 'ALL' : sku.code)}
                className={`p-4 rounded-2xl border transition cursor-pointer space-y-3 ${
                  selectedSkuCode === sku.code
                    ? 'border-2 border-[#008DA9] bg-[#008DA9]/5 dark:bg-[#008DA9]/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#008DA9]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300">
                      {sku.code}
                    </span>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white mt-1.5">
                      {sku.name}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {sku.packaging} &bull; {sku.price_box.toLocaleString('fr-FR')} FCFA/ctn
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black">
                    {sku.sharePercent}% du CA
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Volume vendu</span>
                    <span className="font-black text-base text-slate-900 dark:text-white">
                      {sku.totalBoxesSold} <span className="text-[10px] text-teal-600">cartons</span>
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ({sku.totalUnitsSold.toLocaleString('fr-FR')} unités)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">CA Période</span>
                    <span className="font-black text-sm text-[#008DA9] dark:text-cyan-400">
                      {sku.totalRevenue.toLocaleString('fr-FR')} FCFA
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {sku.salesCount} ventes &bull; {sku.uniquePdvsCount} PDV
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tableau chronologique détaillé des ventes par SKU sur la période */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  Détail Chronologique des Ventes par SKU ({skuChronologicalLineItems.length} lignes sur la période)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Du {formatSaleDateFr(skuStartDate)} au {formatSaleDateFr(skuEndDate)} &bull; Cliquez sur « Facture A4 » ou « Annuler facture PDV » sur n&apos;importe quelle ligne.
                </p>
              </div>
              {selectedSkuCode !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedSkuCode('ALL')}
                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-[#008DA9] cursor-pointer"
                >
                  Afficher tous les SKU &times;
                </button>
              )}
            </div>

            <div className="p-3 sm:p-4">
              <DataTable<any>
                data={skuChronologicalLineItems}
                getRowKey={(line) => line.lineKey}
                emptyMessage="Aucune vente trouvée pour ce SKU sur la période sélectionnée."
                mobileTitle={(line) =>
                  line.sale.invoice_number ||
                  `FAC-${String(line.sale.number || '').replace('VTE-', '')}`
                }
                mobileSubtitle={(line) =>
                  `${line.sale.number} • ${formatSaleDateFr(line.sale.date)} à ${getSaleTime(line.sale)}`
                }
                mobileStatusBadge={(line) =>
                  line.sale.status === 'annulee' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                      Facture annulée
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                      Valide
                    </span>
                  )
                }
                columns={[
                  {
                    key: 'date',
                    label: 'Date & Heure',
                    render: (line) => (
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatSaleDateFr(line.sale.date)}
                        </div>
                        <div className="font-mono text-[10px] text-[#008DA9] font-bold">
                          {getSaleTime(line.sale)}
                        </div>
                      </div>
                    ),
                    footer: <span className="uppercase text-[11px]">Total période</span>,
                  },
                  {
                    key: 'invoice',
                    label: 'Facture Client PDV',
                    hideOnMobileCard: true,
                    render: (line) => {
                      const s = line.sale;
                      const isCancelled = s.status === 'annulee';
                      const invNo =
                        s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`;
                      return (
                        <div>
                          <div className="font-mono font-black text-slate-900 dark:text-white">
                            {invNo}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">{s.number}</div>
                          {isCancelled && (
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-600 text-white">
                              Facture annulée
                            </span>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'pdv',
                    label: 'Point de Vente',
                    render: (line) => (
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {line.sale.pdv_name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {line.sale.pdv_neighborhood}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'vendor',
                    label: 'Vendeur',
                    isSecondary: true,
                    render: (line) => (
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {line.sale.vendor_name}
                        </div>
                        <div className="font-mono text-[10px] text-[#008DA9]">
                          {line.sale.vendor_code}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'sku',
                    label: 'Référence SKU & Produit',
                    render: (line) => (
                      <div>
                        <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[#008DA9] dark:text-cyan-300 mr-1.5">
                          {line.skuCode}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {line.productName}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'qty',
                    label: 'Quantité',
                    align: 'center',
                    isNumeric: true,
                    render: (line) => (
                      <span className="font-black text-slate-900 dark:text-white">
                        {line.qtyBoxes} cartons
                      </span>
                    ),
                    footer: (
                      <span>
                        {skuChronologicalLineItems
                          .filter((l) => l.sale.status !== 'annulee')
                          .reduce((acc, l) => acc + Number(l.qtyBoxes || 0), 0)}{' '}
                        cartons
                      </span>
                    ),
                  },
                  {
                    key: 'amount',
                    label: 'Montant SKU',
                    align: 'right',
                    isNumeric: true,
                    render: (line) => (
                      <span className="font-black text-teal-700 dark:text-teal-400">
                        {line.lineTotal.toLocaleString('fr-FR')} FCFA
                      </span>
                    ),
                    footer: (
                      <span className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                        {skuChronologicalLineItems
                          .filter((l) => l.sale.status !== 'annulee')
                          .reduce((acc, l) => acc + Number(l.lineTotal || 0), 0)
                          .toLocaleString('fr-FR')}{' '}
                        FCFA
                      </span>
                    ),
                  },
                ]}
                renderActions={(line) => {
                  const s = line.sale;
                  const isCancelled = s.status === 'annulee';
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenDocument(buildA4ClientInvoiceDoc(s))}
                        className="px-2.5 py-1 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[10px] cursor-pointer"
                      >
                        Facture A4
                      </button>
                      {canCancelSale && !isCancelled && !s.isPendingOffline && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingSale(s);
                            setCancelReason('Annulation de la facture client PDV');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer"
                        >
                          Annuler facture PDV
                        </button>
                      )}
                    </>
                  );
                }}
                totalsFooter={
                  <>
                    <span>
                      Lignes actives :{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {skuChronologicalLineItems.filter((l) => l.sale.status !== 'annulee').length}
                      </strong>
                    </span>
                    <span>
                      Total Cartons :{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {skuChronologicalLineItems
                          .filter((l) => l.sale.status !== 'annulee')
                          .reduce((acc, l) => acc + Number(l.qtyBoxes || 0), 0)}{' '}
                        ctn
                      </strong>
                    </span>
                    <span>
                      Total CA SKU :{' '}
                      <strong className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                        {skuChronologicalLineItems
                          .filter((l) => l.sale.status !== 'annulee')
                          .reduce((acc, l) => acc + Number(l.lineTotal || 0), 0)
                          .toLocaleString('fr-FR')}{' '}
                        FCFA
                      </strong>
                    </span>
                  </>
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* ADMIN / DIRECTEUR OPS VIEW: PROFILS DES VENDEURS */}
      {(isAdmin || isDirecteurOps) && directorSubTab === 'par-vendeur' && !selectedAdminVendor && (
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

      {/* SALES HISTORY & CONSULTATION (Shown for Vendeur in 'historique', Comptable, Sales Admin, Directeur Ops in 'globale', or when a vendor is selected) */}
      {((isVendeur && vendorSubTab === 'historique') ||
        (!isVendeur && !isAdmin && !isDirecteurOps) ||
        ((isAdmin || isDirecteurOps) && directorSubTab === 'globale') ||
        ((isAdmin || isDirecteurOps) && directorSubTab === 'par-vendeur' && selectedAdminVendor !== null)) && (
        <div className="space-y-4">
          {/* Selected Vendor Profile Banner + Quick Vendor Switcher */}
          {(isAdmin || isDirecteurOps) && selectedAdminVendor && (
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

            {!isVendeur && (
              <>
                <ExportViewButton
                  currentUser={currentUser}
                  jeu="ventes"
                  label="Exporter"
                  filtres={{
                    vendor_id: selectedAdminVendor?.id || '',
                    q: searchTerm,
                  }}
                />

                <button
                  type="button"
                  onClick={() => handleExportSalesPdf()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Exporter en PDF</span>
                </button>
              </>
            )}
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

          {/* Sales Table — Composant partagé DataTable */}
          <DataTable<any>
            data={filteredSales}
            getRowKey={(s) => s.id}
            emptyMessage="Aucune vente trouvée pour cette recherche."
            mobileTitle={(s) => (
              <span
                className={`font-mono font-black ${
                  s.status === 'annulee'
                    ? 'line-through text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {s.number}
              </span>
            )}
            mobileSubtitle={(s) =>
              `${formatSaleDateFr(s.date)} • ${getSaleTime(s)} • ${getThermalTicketNumber(s)}`
            }
            mobileStatusBadge={(s) => {
              const isCancelled = s.status === 'annulee';
              if (isCancelled) {
                return (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                    Vente Annulée
                  </span>
                );
              }
              if (s.cancel_request_status === 'en_attente') {
                return (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                    Demande annulation DOV
                  </span>
                );
              }
              if (s.isPendingOffline) {
                return (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Hors-ligne
                  </span>
                );
              }
              return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Validée
                </span>
              );
            }}
            columns={[
              {
                key: 'number',
                label: 'N° Vente & Horodatage',
                hideOnMobileCard: true,
                render: (s) => {
                  const saleTime = getSaleTime(s);
                  const formattedDate = formatSaleDateFr(s.date);
                  const isCancelled = s.status === 'annulee';
                  return (
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`font-mono font-bold ${
                            isCancelled
                              ? 'line-through text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {s.number}
                        </span>
                        {isCancelled && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                            Annulée
                          </span>
                        )}
                        {!isCancelled && s.cancel_request_status === 'en_attente' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                            Demande annulation DOV
                          </span>
                        )}
                        {!isCancelled && s.cancel_request_status === 'rejetee' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                            Annulation refusée DOV
                          </span>
                        )}
                      </div>
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
                      {isCancelled ? (
                        <div className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          Motif : {s.cancel_reason || 'Annulée par la Direction des ventes'}
                        </div>
                      ) : s.cancel_request_status === 'en_attente' ? (
                        <div className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          Motif vendeur : {s.cancel_request_reason}
                        </div>
                      ) : s.cancel_request_status === 'rejetee' ? (
                        <div className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          Refus DOV : {s.cancel_rejection_reason || 'Refusée'}
                        </div>
                      ) : s.isPendingOffline ? (
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
                    </div>
                  );
                },
                footer: <span className="uppercase text-[11px]">Totaux ventes actives</span>,
              },
              {
                key: 'pdv',
                label: 'Point de Vente',
                render: (s) => (
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{s.pdv_name}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#008DA9] shrink-0" />
                      <span>{s.pdv_neighborhood}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'vendor',
                label: 'Vendeur',
                isSecondary: true,
                render: (s) => (
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {s.vendor_name}{' '}
                    <span className="font-mono text-[10px] text-[#008DA9]">({s.vendor_code})</span>
                  </div>
                ),
              },
              {
                key: 'items',
                label: 'Détail Cartons',
                render: (s) => {
                  const totalBoxes = (s.items || []).reduce(
                    (acc: number, it: any) => acc + (it.qtyBoxes || 0),
                    0
                  );
                  return (
                    <div className="text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {totalBoxes} ctn
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {(s.items || []).map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(', ')}
                      </div>
                    </div>
                  );
                },
                footer: (
                  <span>
                    {filteredSales
                      .filter((s) => s.status !== 'annulee')
                      .reduce(
                        (acc, s) =>
                          acc +
                          (s.items || []).reduce(
                            (sum: number, it: any) => sum + Number(it.qtyBoxes || 0),
                            0
                          ),
                        0
                      )}{' '}
                    ctn
                  </span>
                ),
              },
              {
                key: 'payment',
                label: 'Règlement',
                isSecondary: true,
                render: (s) => (
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {s.payment_type || 'Comptant'}
                  </span>
                ),
              },
              {
                key: 'ticket',
                label: 'Facture & Ticket',
                isSecondary: true,
                render: (s) => (
                  <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`} •{' '}
                    {getThermalTicketNumber(s)}
                  </span>
                ),
              },
              {
                key: 'amount',
                label: 'Montant',
                align: 'right',
                isNumeric: true,
                render: (s) => {
                  const isCancelled = s.status === 'annulee';
                  return (
                    <span
                      className={`font-black ${
                        isCancelled
                          ? 'line-through text-rose-500 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {s.total_amount.toLocaleString('fr-FR')} FCFA
                    </span>
                  );
                },
                footer: (
                  <span className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {filteredSales
                      .filter((s) => s.status !== 'annulee')
                      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(s) => {
              const isCancelled = s.status === 'annulee';
              return (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(buildA4ClientInvoiceDoc(s))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                    title="Ouvrir la Facture Client PDV au format A4"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Facture PDV A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(buildMiniThermalReceiptDoc(s))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs transition cursor-pointer"
                    title="Ouvrir la Mini Facture Thermique automatique (utilisable comme preuve de vente)"
                  >
                    <Receipt className="w-3.5 h-3.5 shrink-0" />
                    <span>Mini Facture</span>
                  </button>
                  {isVendeur &&
                    !isCancelled &&
                    s.cancel_request_status !== 'en_attente' &&
                    !s.isPendingOffline && (
                      <button
                        type="button"
                        onClick={() => {
                          setRequestingCancelSale(s);
                          setRequestCancelReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Demander annulation (DOV)</span>
                      </button>
                    )}
                  {(isDirecteurOps || isAdmin) &&
                    !isCancelled &&
                    s.cancel_request_status === 'en_attente' && (
                      <>
                        <button
                          type="button"
                          disabled={isReviewingCancelRequest}
                          onClick={() => handleReviewCancelRequest(s, 'approve')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Approuver demande</span>
                        </button>
                        <button
                          type="button"
                          disabled={isReviewingCancelRequest}
                          onClick={() => {
                            setRejectingCancelRequestSale(s);
                            setRejectCancelReason('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[11px] transition cursor-pointer"
                        >
                          <span>Refuser</span>
                        </button>
                      </>
                    )}
                  {canCancelSale &&
                    !isCancelled &&
                    s.cancel_request_status !== 'en_attente' &&
                    !s.isPendingOffline && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingSale(s);
                          setCancelReason('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isDirecteurOps ? 'Annuler facture PDV' : 'Annuler la vente'}
                        </span>
                      </button>
                    )}
                </>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Ventes actives :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {filteredSales.filter((s) => s.status !== 'annulee').length}
                  </strong>
                </span>
                <span>
                  Total Cartons :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {filteredSales
                      .filter((s) => s.status !== 'annulee')
                      .reduce(
                        (acc, s) =>
                          acc +
                          (s.items || []).reduce(
                            (sum: number, it: any) => sum + Number(it.qtyBoxes || 0),
                            0
                          ),
                        0
                      )}{' '}
                    cartons
                  </strong>
                </span>
                <span>
                  Total CA :{' '}
                  <strong className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {filteredSales
                      .filter((s) => s.status !== 'annulee')
                      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* MODAL D'ANNULATION DE VENTE (Sales Admin / Contrôleur & Administrateur) */}
      {cancellingSale && (
        <FormModal
          title={
            isDirecteurOps
              ? `Annuler la facture PDV (${cancellingSale.invoice_number || `FAC-${String(cancellingSale.number || '').replace('VTE-', '')}`})`
              : `Annuler la vente ${cancellingSale.number}`
          }
          subtitle={`Action ${currentUser.role} (${currentUser.name})`}
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
          onClose={() => setCancellingSale(null)}
          onSubmit={handleConfirmCancelSale}
          submitLabel={isCancellingSale ? 'Annulation...' : "Confirmer l'annulation"}
          submitDisabled={isCancellingSale || !cancelReason.trim()}
          isDirty={Boolean(cancelReason.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Vendeur :</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {cancellingSale.vendor_name} ({cancellingSale.vendor_code})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Point de vente :</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {cancellingSale.pdv_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Montant :</span>
                <span className="font-black text-rose-600">
                  {Number(cancellingSale.total_amount || 0).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
              L&apos;annulation réintègre automatiquement les cartons dans le stock camionnette du vendeur et déduit le montant de son solde à verser.
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif d&apos;annulation obligatoire *
              </label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Erreur de saisie quantité, double enregistrement, annulation commande client PDV..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* MODAL DE DEMANDE D'ANNULATION DE VENTE PAR LE VENDEUR -> SOUMISE AU DIRECTEUR DES OPÉRATIONS DE VENTE (DOV) */}
      {requestingCancelSale && (
        <FormModal
          title={`Demande d'annulation de la vente ${requestingCancelSale.number}`}
          subtitle="Soumise au Directeur des opérations de vente (DOV)"
          icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
          onClose={() => setRequestingCancelSale(null)}
          onSubmit={handleSubmitVendorCancelRequest}
          submitLabel={isRequestingCancel ? 'Envoi en cours...' : 'Soumettre au Directeur des opérations de vente'}
          submitDisabled={isRequestingCancel || !requestCancelReason.trim()}
          isDirty={Boolean(requestCancelReason.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">N° Vente &amp; Date :</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {requestingCancelSale.number} ({formatSaleDateFr(requestingCancelSale.date)} à {getSaleTime(requestingCancelSale)})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Point de vente (PDV) :</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {requestingCancelSale.pdv_name} ({requestingCancelSale.pdv_neighborhood})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Détail cartons :</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {(requestingCancelSale.items || []).map((it: any) => `${it.qtyBoxes}x ${it.name}`).join(', ')}
                </span>
              </div>
              <div className="flex justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-semibold">Montant total :</span>
                <span className="font-black text-rose-600 text-sm">
                  {Number(requestingCancelSale.total_amount || 0).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-950 dark:text-teal-200">
              Votre demande sera transmise immédiatement à <strong>Ibrahim Sangaré (Directeur des opérations de vente)</strong>. Dès sa validation, la vente sera annulée et les cartons seront réintégrés dans votre stock camionnette.
            </div>

            <div>
              <span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Type d&apos;erreur constatée (sélection rapide) :
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Erreur sur la quantité de cartons saisie',
                  'Erreur de référence produit / SKU sélectionné',
                  'Erreur de Point de Vente (PDV) client sélectionné',
                  'Double enregistrement involontaire de la vente',
                  'Erreur sur le mode de règlement',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRequestCancelReason(preset)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                      requestCancelReason === preset
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif détaillé de l&apos;erreur dans la vente *
              </label>
              <textarea
                rows={3}
                required
                value={requestCancelReason}
                onChange={(e) => setRequestCancelReason(e.target.value)}
                placeholder="Précisez l'erreur commise dans la vente à l'attention du Directeur des opérations de vente..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* MODAL DE REFUS D'UNE DEMANDE D'ANNULATION VENDEUR PAR LE DIRECTEUR DES OPÉRATIONS DE VENTE (DOV) */}
      {rejectingCancelRequestSale && (
        <FormModal
          title={`Refuser la demande d'annulation (${rejectingCancelRequestSale.number})`}
          subtitle={`Vendeur : ${rejectingCancelRequestSale.vendor_name} (${rejectingCancelRequestSale.vendor_code})`}
          onClose={() => setRejectingCancelRequestSale(null)}
          onSubmit={(e) => {
            e.preventDefault();
            handleReviewCancelRequest(rejectingCancelRequestSale, 'reject', rejectCancelReason);
          }}
          submitLabel={isReviewingCancelRequest ? 'Traitement...' : 'Confirmer le refus'}
          submitDisabled={isReviewingCancelRequest || !rejectCancelReason.trim()}
          isDirty={Boolean(rejectCancelReason.trim())}
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif du refus (communiqué au vendeur) *
              </label>
              <textarea
                rows={3}
                required
                value={rejectCancelReason}
                onChange={(e) => setRejectCancelReason(e.target.value)}
                placeholder="Ex: Livraison déjà confirmée par le gérant du PDV..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};

