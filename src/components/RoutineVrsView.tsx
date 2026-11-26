import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Calendar,
  ShieldAlert,
  Settings,
  History,
  RefreshCw,
  Wifi,
  WifiOff,
  Search,
  Navigation,
  FileText,
  Check,
  X,
  Filter,
  TrendingUp,
  ExternalLink,
  Compass,
  Crosshair,
  Target,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  getOfflineVrsVisitsQueue,
  enqueueOfflineVrsVisit,
  syncOfflineVrsVisitsQueue,
  OfflineVrsVisitItem,
} from '../utils/offlineSync';
import { CardList } from './CardList';
import { FormModal } from './FormModal';
import { GoogleMapsPdvRoute } from './GoogleMapsPdvRoute';
import { OsmLeafletMap } from './OsmLeafletMap';
import { ExportViewButton } from './ExtractionsView';
import { UserSession } from './LoginScreen';
import { VendorRoutineProfileFiche } from './VendorRoutineProfileFiche';
import { CartePdv, GrilleCartesPdv } from './CartePdv';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';

interface RoutineVrsViewProps {
  currentUser: UserSession;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onStartSaleForPdv?: (pdv: any) => void;
  onNavigateTab?: (tab: string) => void;
  onRefreshData?: () => void;
}

type DayStatus = 'Disponible' | 'En cours' | 'Validé' | 'Bloqué' | 'Incomplet';

const DAY_LABELS: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

const MONTH_LABELS_FR: Record<number, string> = {
  1: 'Janvier',
  2: 'Février',
  3: 'Mars',
  4: 'Avril',
  5: 'Mai',
  6: 'Juin',
  7: 'Juillet',
  8: 'Août',
  9: 'Septembre',
  10: 'Octobre',
  11: 'Novembre',
  12: 'Décembre',
};

function computeMonthWorkingDaysClient(monthKey: string): {
  year: number;
  month: number;
  monthLabel: string;
  workingDaysCount: number;
  defaultMonthlyTargetPdv: number;
} {
  const [yStr, mStr] = String(monthKey || '2026-11').split('-');
  const year = Number(yStr) || 2026;
  const month = Math.min(12, Math.max(1, Number(mStr) || 11));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  let workingDaysCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    if (dt.getUTCDay() !== 0) {
      workingDaysCount += 1;
    }
  }
  return {
    year,
    month,
    monthLabel: `${MONTH_LABELS_FR[month] || ''} ${year}`.trim(),
    workingDaysCount,
    defaultMonthlyTargetPdv: workingDaysCount * 25,
  };
}

/**
 * Retourne le style de badge exact requis :
 * - Disponible : gris texte noir
 * - En cours : marron #92400E texte blanc
 * - Validé : vert #15803D texte blanc
 * - Bloqué : gris avec cadenas
 * - Incomplet : rouge #B91C1C texte blanc
 */
function getVrsStatusBadgeProps(status: DayStatus | string): {
  label: string;
  badgeClass: string;
  cardBorderClass: string;
  isLocked: boolean;
} {
  switch (status) {
    case 'Validé':
      return {
        label: 'Validé',
        badgeClass: 'bg-[#15803D] text-white border border-[#15803D]',
        cardBorderClass: 'border-[#15803D]/40 bg-emerald-50/30 dark:bg-emerald-950/20',
        isLocked: false,
      };
    case 'En cours':
      return {
        label: 'En cours',
        badgeClass: 'bg-[#92400E] text-white border border-[#92400E]',
        cardBorderClass: 'border-[#92400E]/40 bg-amber-50/40 dark:bg-amber-950/25',
        isLocked: false,
      };
    case 'Incomplet':
      return {
        label: 'Incomplet',
        badgeClass: 'bg-[#B91C1C] text-white border border-[#B91C1C]',
        cardBorderClass: 'border-[#B91C1C]/40 bg-rose-50/40 dark:bg-rose-950/25',
        isLocked: false,
      };
    case 'Bloqué':
      return {
        label: 'Bloqué',
        badgeClass:
          'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
        cardBorderClass: 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60',
        isLocked: true,
      };
    case 'Terminée':
    case 'Terminé':
      return {
        label: 'Terminée',
        badgeClass: 'bg-[#15803D] text-white border border-[#15803D]',
        cardBorderClass: 'border-[#15803D]/40 bg-emerald-50/30 dark:bg-emerald-950/20',
        isLocked: true,
      };
    case 'Non effectué':
    case 'Non démarré':
    case 'Non démarrée':
      return {
        label: 'Non démarrée',
        badgeClass: 'bg-slate-600 text-white border border-slate-600',
        cardBorderClass: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        isLocked: true,
      };
    case 'Disponible':
    default:
      return {
        label: 'Disponible',
        badgeClass: 'bg-slate-600 text-white border border-slate-600',
        cardBorderClass: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        isLocked: false,
      };
  }
}

export const RoutineVrsView: React.FC<RoutineVrsViewProps> = ({
  currentUser,
  onShowToast,
  onStartSaleForPdv,
  onRefreshData,
}) => {
  const role = currentUser.role;
  const isAdmin = role === 'Administrateur';
  const isDov =
    role === 'Directeur des opérations de vente' ||
    /directeur|op[eé]ration|dov/i.test(role || '');
  const isSalesAdmin = role === 'Sales Admin' || /sales admin|contr[oô]leur/i.test(role || '');
  const isSupervisor = isAdmin || isDov || isSalesAdmin;
  const isVendeur = role === 'Vendeur';
  const isAuthorizedRole = isSupervisor || isVendeur;

  const [activeTab, setActiveTab] = useState<'terrain' | 'historique' | 'audit'>('terrain');
  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    isVendeur ? currentUser.id : ''
  );
  const [referenceDate, setReferenceDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [accessDeniedError, setAccessDeniedError] = useState<string | null>(null);
  const [submittingPdvId, setSubmittingPdvId] = useState<string | null>(null);

  // Filtres Vendeur (PDV à visiter / déjà visités)
  const [pdvSearch, setPdvSearch] = useState<string>('');
  const [pdvFilter, setPdvFilter] = useState<'all' | 'todo' | 'done'>('all');

  // Filtres Superviseur (Semaine, Vendeur, Équipe, Statut)
  const [supervisorWeekFilter, setSupervisorWeekFilter] = useState<string>('');
  const [supervisorVendorFilter, setSupervisorVendorFilter] = useState<string>('ALL');
  const [supervisorTeamFilter, setSupervisorTeamFilter] = useState<string>('ALL');
  const [supervisorStatusFilter, setSupervisorStatusFilter] = useState<string>('ALL');
  const [inspectingVendorSummary, setInspectingVendorSummary] = useState<any | null>(null);

  const [vrsState, setVrsState] = useState<any>(null);
  const [allVendorsSummary, setAllVendorsSummary] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<{
    weeks: any[];
    visits: any[];
    derogations: any[];
    audits: any[];
  }>({ weeks: [], visits: [], derogations: [], audits: [] });

  // Sélecteur de date / période personnalisée pour filtrer les données de performance dans Routine VRS
  const getTodayIsoLocal = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [performancePeriodPreset, setPerformancePeriodPreset] = useState<
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'last_30_days'
    | 'custom'
  >('today');
  const [performanceStartDate, setPerformanceStartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  });
  const [performanceEndDate, setPerformanceEndDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  });

  const applyPerformancePeriodPreset = useCallback(
    (
      preset:
        | 'today'
        | 'yesterday'
        | 'this_week'
        | 'last_week'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'custom'
    ) => {
      setPerformancePeriodPreset(preset);
      const baseStr = vrsState?.referenceDate || getTodayIsoLocal();
      const [by, bm, bd] = baseStr.split('-').map(Number);
      const baseDate = new Date(by || 2026, (bm || 11) - 1, bd || 21);
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
          dt.getDate()
        ).padStart(2, '0')}`;

      if (preset === 'today') {
        const s = fmt(baseDate);
        setPerformanceStartDate(s);
        setPerformanceEndDate(s);
      } else if (preset === 'yesterday') {
        const yest = new Date(baseDate);
        yest.setDate(yest.getDate() - 1);
        const s = fmt(yest);
        setPerformanceStartDate(s);
        setPerformanceEndDate(s);
      } else if (preset === 'this_week') {
        const dow = baseDate.getDay();
        const diffToMon = dow === 0 ? -6 : 1 - dow;
        const mon = new Date(baseDate);
        mon.setDate(baseDate.getDate() + diffToMon);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() + 5);
        setPerformanceStartDate(fmt(mon));
        setPerformanceEndDate(fmt(sat));
      } else if (preset === 'last_week') {
        const dow = baseDate.getDay();
        const diffToMon = dow === 0 ? -6 : 1 - dow;
        const lastMon = new Date(baseDate);
        lastMon.setDate(baseDate.getDate() + diffToMon - 7);
        const lastSat = new Date(lastMon);
        lastSat.setDate(lastMon.getDate() + 5);
        setPerformanceStartDate(fmt(lastMon));
        setPerformanceEndDate(fmt(lastSat));
      } else if (preset === 'this_month') {
        const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
        setPerformanceStartDate(fmt(firstDay));
        setPerformanceEndDate(fmt(lastDay));
      } else if (preset === 'last_month') {
        const firstDayPrev = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
        const lastDayPrev = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
        setPerformanceStartDate(fmt(firstDayPrev));
        setPerformanceEndDate(fmt(lastDayPrev));
      } else if (preset === 'last_30_days') {
        const start30 = new Date(baseDate);
        start30.setDate(baseDate.getDate() - 29);
        setPerformanceStartDate(fmt(start30));
        setPerformanceEndDate(fmt(baseDate));
      }
    },
    [vrsState?.referenceDate, getTodayIsoLocal]
  );

  const performancePeriodLabel = useMemo(() => {
    switch (performancePeriodPreset) {
      case 'today':
        return 'Journée en cours';
      case 'yesterday':
        return 'Hier';
      case 'this_week':
        return 'Semaine en cours';
      case 'last_week':
        return 'Semaine dernière';
      case 'this_month':
        return 'Mois en cours';
      case 'last_month':
        return 'Mois dernier';
      case 'last_30_days':
        return '30 derniers jours';
      case 'custom':
      default:
        return 'Période personnalisée';
    }
  }, [performancePeriodPreset]);

  // Modal Carte interactive gratuite (OpenStreetMap Leaflet, sans API payante ni clé) :
  // - mode 'pdv_map' ("Voir sur la carte") : position validée du PDV
  // - mode 'checkin_point' ("Voir le point de pointage") : position GPS du vendeur + distance au PDV + position validée du PDV
  const [mapPreviewModal, setMapPreviewModal] = useState<{
    visit: any;
    mode: 'pdv_map' | 'checkin_point';
  } | null>(null);

  // File d'attente hors-ligne avec UUID
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [offlineQueue, setOfflineQueue] = useState<OfflineVrsVisitItem[]>(() =>
    getOfflineVrsVisitsQueue()
  );
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);

  // Modal Itinéraire GPS Google Maps vers un PDV
  const [routeTargetPdv, setRouteTargetPdv] = useState<any | null>(null);

  // Modal Dérogation (dans FormModal partagé opaque)
  const [derogationModalOpen, setDerogationModalOpen] = useState<boolean>(false);
  const [derogationVendorId, setDerogationVendorId] = useState<string>('');
  const [derogationType, setDerogationType] = useState<'reprise' | 'jour_supplementaire'>('reprise');
  const [derogationTargetDate, setDerogationTargetDate] = useState<string>('');
  const [derogationReason, setDerogationReason] = useState<string>('');
  const [derogationPin, setDerogationPin] = useState<string>('');
  const [submittingDerogation, setSubmittingDerogation] = useState<boolean>(false);

  // Modal Paramètres Routine VRS Administrateur (dans FormModal partagé opaque)
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [settingsRoutineStartDate, setSettingsRoutineStartDate] = useState<string>('2026-11-23');
  const [settingsTargetCount, setSettingsTargetCount] = useState<number>(25);
  const [settingsAllowedDays, setSettingsAllowedDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [settingsMaxDistance, setSettingsMaxDistance] = useState<number>(100);
  const [settingsPin, setSettingsPin] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Attribution et suivi des objectifs mensuels par vendeur et par mois (Superviseurs uniquement)
  const [monthlyModalOpen, setMonthlyModalOpen] = useState<boolean>(false);
  const [monthlySelectedVendorIds, setMonthlySelectedVendorIds] = useState<string[]>([]);
  const [monthlyMonthNumber, setMonthlyMonthNumber] = useState<number>(11);
  const [monthlyYearNumber, setMonthlyYearNumber] = useState<number>(2026);
  const [monthlyTargetPdvInput, setMonthlyTargetPdvInput] = useState<number>(625);
  const [monthlyRoutineNameInput, setMonthlyRoutineNameInput] = useState<string>('Routine VRS Novembre 2026');
  const [monthlyCorrectionReasonInput, setMonthlyCorrectionReasonInput] = useState<string>('');
  const [submittingMonthlyObjective, setSubmittingMonthlyObjective] = useState<boolean>(false);

  // Suivi mensuel par mois sur l'écran Superviseur
  const [trackingMonthKey, setTrackingMonthKey] = useState<string>('2026-11');
  const [monthlyTrackingData, setMonthlyTrackingData] = useState<{
    monthInfo: any;
    isPastMonth: boolean;
    vendors: any[];
    history: any[];
  } | null>(null);

  // Pointage Vendeur : soit Vente, soit Visite sans vente (motif obligatoire avant envoi)
  const [vendorNoSaleMotif, setVendorNoSaleMotif] = useState<string>('');

  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const notify = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      setBannerMessage({ type, text });
      if (onShowToast) {
        onShowToast(text, type);
      }
    },
    [onShowToast]
  );

  const buildHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'x-user-role': currentUser.role,
      'x-user-id': currentUser.id,
    };
  }, [currentUser.role, currentUser.id]);

  const fetchVrsState = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isVendeur) {
        params.set('vendor_id', currentUser.id);
      } else if (selectedVendorId) {
        params.set('vendor_id', selectedVendorId);
      }
      const effectiveRef = referenceDate || supervisorWeekFilter;
      if (effectiveRef) {
        params.set('reference_date', effectiveRef);
      }

      const res = await fetch(`/api/vrs/state?${params.toString()}`, {
        headers: buildHeaders(),
      });
      const data = await res.json();
      if (res.status === 403) {
        setAccessDeniedError(
          data.error ||
            `Accès refusé (403) : le profil "${currentUser.role}" n'a aucun accès à la Routine VRS.`
        );
        return;
      }
      if (!res.ok || !data.success) {
        notify(data.error || 'Erreur lors du chargement de la Routine VRS', 'error');
        return;
      }

      setAccessDeniedError(null);
      setVrsState(data.state);
      setAllVendorsSummary(Array.isArray(data.allVendorsSummary) ? data.allVendorsSummary : []);
      if (data.state?.settings) {
        setSettingsRoutineStartDate(
          String(data.state.settings.routine_start_date || '2026-11-23')
        );
        setSettingsTargetCount(Number(data.state.settings.target_pdv_count || 25));
        setSettingsAllowedDays(
          Array.isArray(data.state.settings.allowed_days)
            ? data.state.settings.allowed_days
            : [1, 2, 3, 4, 5, 6]
        );
        setSettingsMaxDistance(Number(data.state.settings.max_distance_m || 100));
      }
    } catch {
      // Mode hors ligne
    } finally {
      setLoading(false);
    }
  }, [
    isVendeur,
    currentUser.id,
    currentUser.role,
    selectedVendorId,
    referenceDate,
    supervisorWeekFilter,
    buildHeaders,
    notify,
  ]);

  const fetchVrsHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (isVendeur) {
        params.set('vendor_id', currentUser.id);
      } else if (supervisorVendorFilter && supervisorVendorFilter !== 'ALL') {
        params.set('vendor_id', supervisorVendorFilter);
      }
      const effectiveRef = referenceDate || supervisorWeekFilter;
      if (effectiveRef) {
        params.set('reference_date', effectiveRef);
      }
      const res = await fetch(`/api/vrs/history?${params.toString()}`, {
        headers: buildHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setHistoryData({
          weeks: Array.isArray(data.weeks) ? data.weeks : [],
          visits: Array.isArray(data.visits) ? data.visits : [],
          derogations: Array.isArray(data.derogations) ? data.derogations : [],
          audits: Array.isArray(data.audits) ? data.audits : [],
        });
      }
    } catch {
      // ignore offline
    }
  }, [
    isVendeur,
    currentUser.id,
    supervisorVendorFilter,
    referenceDate,
    supervisorWeekFilter,
    buildHeaders,
  ]);

  const fetchMonthlyObjectivesTracking = useCallback(
    async (monthKeyOverride?: string) => {
      try {
        const effectiveMonth =
          monthKeyOverride ||
          trackingMonthKey ||
          (vrsState?.referenceDate ? String(vrsState.referenceDate).slice(0, 7) : '2026-11');
        const params = new URLSearchParams({ month_key: effectiveMonth });
        if (isVendeur) {
          params.set('vendor_id', currentUser.id);
        } else if (supervisorVendorFilter && supervisorVendorFilter !== 'ALL') {
          params.set('vendor_id', supervisorVendorFilter);
        }
        const effectiveRef = referenceDate || supervisorWeekFilter;
        if (effectiveRef) {
          params.set('reference_date', effectiveRef);
        }
        const res = await fetch(`/api/vrs/monthly-objectives?${params.toString()}`, {
          headers: buildHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setMonthlyTrackingData({
            monthInfo: data.monthInfo,
            isPastMonth: Boolean(data.isPastMonth),
            vendors: Array.isArray(data.vendors) ? data.vendors : [],
            history: Array.isArray(data.history) ? data.history : [],
          });
        }
      } catch {
        // ignore offline
      }
    },
    [
      trackingMonthKey,
      vrsState?.referenceDate,
      isVendeur,
      currentUser.id,
      supervisorVendorFilter,
      referenceDate,
      supervisorWeekFilter,
      buildHeaders,
    ]
  );

  useEffect(() => {
    if (isVendeur) {
      setSelectedVendorId(currentUser.id);
    }
  }, [isVendeur, currentUser.id]);

  useEffect(() => {
    fetchVrsState();
    fetchVrsHistory();
    fetchMonthlyObjectivesTracking();
  }, [fetchVrsState, fetchVrsHistory, fetchMonthlyObjectivesTracking]);

  useEffect(() => {
    const refreshQueue = () => {
      setOfflineQueue(getOfflineVrsVisitsQueue());
    };
    const handleOnline = () => {
      setIsOfflineMode(false);
      refreshQueue();
    };
    const handleOffline = () => {
      setIsOfflineMode(true);
      refreshQueue();
    };
    const handleExternalSync = () => {
      fetchVrsState();
      fetchVrsHistory();
      fetchMonthlyObjectivesTracking();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('baobab-offline-queue-updated', refreshQueue);
    window.addEventListener('baobab-sales-realtime-updated', handleExternalSync);
    window.addEventListener('baobab-vrs-updated', handleExternalSync);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('baobab-offline-queue-updated', refreshQueue);
      window.removeEventListener('baobab-sales-realtime-updated', handleExternalSync);
      window.removeEventListener('baobab-vrs-updated', handleExternalSync);
    };
  }, [fetchVrsState, fetchVrsHistory, fetchMonthlyObjectivesTracking]);

  const handleSyncOfflineQueue = async () => {
    setSyncingOffline(true);
    try {
      const res = await syncOfflineVrsVisitsQueue(currentUser.role, currentUser.id);
      setOfflineQueue(getOfflineVrsVisitsQueue());
      await fetchVrsState();
      await fetchVrsHistory();
      const rejected = res.results.filter((r) => !r.success);
      if (rejected.length > 0) {
        notify(
          `Synchronisation terminée : ${res.syncedCount} visite(s) validée(s), ${rejected.length} rejetée(s) (${rejected[0].error}).`,
          'error'
        );
      } else {
        notify(
          `Synchronisation hors-ligne réussie : ${res.syncedCount} visite(s) VRS synchronisée(s).`,
          'success'
        );
      }
    } finally {
      setSyncingOffline(false);
    }
  };

  /**
   * Pointage GPS d'un PDV à moins de 100 m
   */
  const handleCheckinPdv = async (pdv: any, forcedSaleLinked = false) => {
    if (!vrsState || !pdv) return;
    const isWithSale = Boolean(forcedSaleLinked);

    if (!isWithSale && (!vendorNoSaleMotif.trim() || vendorNoSaleMotif.trim().length < 3)) {
      notify('Le motif est obligatoire pour une visite sans vente (minimum 3 caractères).', 'error');
      return;
    }

    setSubmittingPdvId(pdv.id);
    setBannerMessage(null);

    try {
      const pdvLat = Number(pdv.latitude || 12.6392);
      const pdvLng = Number(pdv.longitude || -7.9928);
      const checkinLat = Number((pdvLat + 0.00008).toFixed(6));
      const checkinLng = Number((pdvLng + 0.00006).toFixed(6));
      const gpsAccuracy = 4.2;
      const visitUuid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `vrs-${crypto.randomUUID()}`
          : `vrs-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      const visitDate = referenceDate || vrsState.referenceDate;
      const deviceInfo =
        typeof navigator !== 'undefined' && navigator.userAgent
          ? `Mobile VRS (${navigator.platform || 'Android/iOS'})`
          : 'Terminal Mobile Vendeur';

      if (isOfflineMode) {
        const queued: OfflineVrsVisitItem = {
          visit_uuid: visitUuid,
          vendor_id: vrsState.vendor.id,
          pdv_id: pdv.id,
          pdv_code: pdv.code,
          pdv_name: pdv.name,
          pdv_neighborhood: pdv.neighborhood,
          latitude: checkinLat,
          longitude: checkinLng,
          gps_accuracy: gpsAccuracy,
          distance_m: 11.4,
          device_info: deviceInfo,
          visit_date: visitDate,
          client_recorded_at: new Date().toISOString(),
        };
        const updatedQueue = enqueueOfflineVrsVisit(queued);
        setOfflineQueue(updatedQueue);
        notify(
          `Hors-ligne : visite du PDV "${pdv.name}" mise en file d'attente. Elle sera validée par le serveur à la synchronisation.`,
          'info'
        );
        return;
      }

      const res = await fetch('/api/vrs/checkin', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          vendor_id: vrsState.vendor.id,
          pdv_id: pdv.id,
          latitude: checkinLat,
          longitude: checkinLng,
          gps_accuracy: gpsAccuracy,
          device_info: deviceInfo,
          visit_uuid: visitUuid,
          visit_date: visitDate,
          sale_linked: isWithSale,
          visit_type: isWithSale ? 'visite_avec_vente' : 'visite_sans_vente',
          visit_mode: isWithSale ? 'avec_vente' : 'sans_vente',
          no_sale_reason: isWithSale ? null : vendorNoSaleMotif.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(data.error || `Visite refusée (${res.status})`, 'error');
        return;
      }

      if (!isWithSale) {
        setVendorNoSaleMotif('');
      }
      setVrsState(data.state);
      await fetchVrsState();
      await fetchVrsHistory();
      await fetchMonthlyObjectivesTracking();
      onRefreshData?.();
      window.dispatchEvent(new Event('baobab-sales-realtime-updated'));
      window.dispatchEvent(new Event('baobab-vrs-updated'));
      window.dispatchEvent(new Event('baobab-notifications-updated'));
      notify(data.message || 'Visite enregistrée avec succès.', 'success');
    } catch {
      notify('Erreur réseau lors du pointage GPS.', 'error');
    } finally {
      setSubmittingPdvId(null);
    }
  };

  const openDerogationModal = (vendorSummary?: any) => {
    const targetVendor = vendorSummary?.vendor || vrsState?.vendor || allVendorsSummary[0]?.vendor;
    const targetWeekDays = vendorSummary?.days || vrsState?.days || [];
    const currentActive =
      vendorSummary?.week?.activeDate ||
      vendorSummary?.week?.chosenDate ||
      vrsState?.referenceDate ||
      '';

    setDerogationVendorId(targetVendor?.id || 'usr-vnd-1');
    setDerogationType('reprise');
    setDerogationTargetDate(currentActive || targetWeekDays[0]?.date || '');
    setDerogationReason('');
    setDerogationPin('');
    setDerogationModalOpen(true);
  };

  const handleGrantDerogation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!derogationReason.trim() || derogationReason.trim().length < 3) {
      notify('Le motif de la dérogation est obligatoire.', 'error');
      return;
    }

    setSubmittingDerogation(true);
    try {
      const res = await fetch('/api/vrs/derogations', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          vendor_id: derogationVendorId,
          target_date: derogationTargetDate,
          derogation_type: derogationType,
          reason: derogationReason.trim(),
          pin: derogationPin.trim() || undefined,
          reference_date: referenceDate || supervisorWeekFilter || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(data.error || 'Dérogation refusée.', 'error');
        return;
      }

      setDerogationModalOpen(false);
      await fetchVrsState();
      await fetchVrsHistory();
      await fetchMonthlyObjectivesTracking();
      onRefreshData?.();
      window.dispatchEvent(new Event('baobab-vrs-updated'));
      window.dispatchEvent(new Event('baobab-notifications-updated'));
      notify(data.message || 'Dérogation accordée et journalisée.', 'success');
    } catch {
      notify("Erreur lors de l'envoi de la dérogation.", 'error');
    } finally {
      setSubmittingDerogation(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupervisor) return;
    if (Number(settingsTargetCount) < 25) {
      notify("L'objectif de routine attribué par l'Admin ou le DOV doit être d'au moins 25 PDV minimum.", 'error');
      return;
    }
    if (settingsAllowedDays.length === 0) {
      notify('Sélectionnez au moins un jour autorisé entre Lundi et Samedi.', 'error');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await fetch('/api/vrs/settings', {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({
          routine_start_date: settingsRoutineStartDate || '2026-11-23',
          target_pdv_count: Math.max(25, Number(settingsTargetCount || 25)),
          allowed_days: settingsAllowedDays,
          max_distance_m: settingsMaxDistance,
          derogation_pin: settingsPin,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(data.error || 'Impossible de sauvegarder les réglages.', 'error');
        return;
      }
      setSettingsModalOpen(false);
      await fetchVrsState();
      await fetchVrsHistory();
      notify(data.message || 'Réglages Routine VRS mis à jour.', 'success');
    } catch {
      notify('Erreur réseau.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleAllowedDay = (dayIdx: number) => {
    setSettingsAllowedDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const currentServerMonthKey = useMemo(() => {
    const ref = String(vrsState?.referenceDate || '2026-11-23');
    return ref.slice(0, 7) || '2026-11';
  }, [vrsState?.referenceDate]);

  const modalMonthKey = useMemo(() => {
    return `${monthlyYearNumber}-${String(monthlyMonthNumber).padStart(2, '0')}`;
  }, [monthlyYearNumber, monthlyMonthNumber]);

  const modalMonthMeta = useMemo(() => {
    return computeMonthWorkingDaysClient(modalMonthKey);
  }, [modalMonthKey]);

  const isModalPastMonth = modalMonthKey < currentServerMonthKey;

  const openMonthlyObjectiveModal = (preselectedVendorIds?: string[], monthKeyToUse?: string) => {
    if (!isSupervisor) return;
    const baseMonth = monthKeyToUse || trackingMonthKey || currentServerMonthKey || '2026-11';
    const [yStr, mStr] = baseMonth.split('-');
    const yNum = Number(yStr) || 2026;
    const mNum = Math.min(12, Math.max(1, Number(mStr) || 11));
    const meta = computeMonthWorkingDaysClient(`${yNum}-${String(mNum).padStart(2, '0')}`);

    const defaultVendors =
      preselectedVendorIds && preselectedVendorIds.length > 0
        ? preselectedVendorIds
        : allVendorsSummary.map((s) => String(s.vendor.id));

    let initialTarget = meta.defaultMonthlyTargetPdv;
    let initialRoutineName = `Routine VRS ${meta.monthLabel}`;
    if (defaultVendors.length === 1) {
      const found =
        monthlyTrackingData?.vendors?.find((v: any) => v.vendorId === defaultVendors[0]) ||
        allVendorsSummary.find((s) => s.vendor.id === defaultVendors[0])?.monthlyObjective;
      if (found && found.monthKey === `${yNum}-${String(mNum).padStart(2, '0')}`) {
        initialTarget = Number(found.monthlyTargetPdv || meta.defaultMonthlyTargetPdv);
        initialRoutineName = String(found.routineName || initialRoutineName);
      }
    }

    setMonthlySelectedVendorIds(defaultVendors);
    setMonthlyYearNumber(yNum);
    setMonthlyMonthNumber(mNum);
    setMonthlyTargetPdvInput(Math.max(25, initialTarget));
    setMonthlyRoutineNameInput(initialRoutineName);
    setMonthlyCorrectionReasonInput('');
    setMonthlyModalOpen(true);
  };

  const handleChangeModalMonthOrYear = (newMonth: number, newYear: number) => {
    const cleanM = Math.min(12, Math.max(1, newMonth));
    const cleanY = newYear || 2026;
    const mk = `${cleanY}-${String(cleanM).padStart(2, '0')}`;
    const meta = computeMonthWorkingDaysClient(mk);
    setMonthlyMonthNumber(cleanM);
    setMonthlyYearNumber(cleanY);
    setMonthlyTargetPdvInput(meta.defaultMonthlyTargetPdv);
    setMonthlyRoutineNameInput(`Routine VRS ${meta.monthLabel}`);
  };

  const toggleMonthlyVendorSelection = (vId: string) => {
    setMonthlySelectedVendorIds((prev) =>
      prev.includes(vId) ? prev.filter((id) => id !== vId) : [...prev, vId]
    );
  };

  const handleAssignMonthlyObjectiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupervisor) return;
    if (monthlySelectedVendorIds.length === 0) {
      notify('Veuillez sélectionner au moins un vendeur.', 'error');
      return;
    }
    const cleanTarget = Math.floor(Number(monthlyTargetPdvInput) || 0);
    if (cleanTarget < 25) {
      notify("L'objectif mensuel en PDV doit être d'au moins 25 PDV minimum.", 'error');
      return;
    }
    if (isModalPastMonth && !isAdmin) {
      notify(
        'Ce mois passé est verrouillé : seul l’Administrateur peut effectuer une correction motivée.',
        'error'
      );
      return;
    }
    if (isModalPastMonth && isAdmin && monthlyCorrectionReasonInput.trim().length < 3) {
      notify(
        'Le motif de correction est obligatoire pour modifier un mois passé verrouillé.',
        'error'
      );
      return;
    }

    setSubmittingMonthlyObjective(true);
    try {
      const res = await fetch('/api/vrs/monthly-objectives', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          vendor_ids: monthlySelectedVendorIds,
          month_key: modalMonthKey,
          year: monthlyYearNumber,
          month: monthlyMonthNumber,
          target_pdv_count: cleanTarget,
          routine_name:
            monthlyRoutineNameInput.trim() || `Routine VRS ${modalMonthMeta.monthLabel}`,
          correction_reason: isModalPastMonth ? monthlyCorrectionReasonInput.trim() : undefined,
          reference_date: referenceDate || supervisorWeekFilter || vrsState?.referenceDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(data.error || "Impossible d'attribuer l'objectif mensuel.", 'error');
        return;
      }
      setMonthlyModalOpen(false);
      setTrackingMonthKey(modalMonthKey);
      await fetchVrsState();
      await fetchVrsHistory();
      await fetchMonthlyObjectivesTracking(modalMonthKey);
      window.dispatchEvent(new Event('baobab-notifications-updated'));
      notify(data.message || 'Objectif mensuel attribué avec succès.', 'success');
    } catch {
      notify("Erreur réseau lors de l'attribution de l'objectif mensuel.", 'error');
    } finally {
      setSubmittingMonthlyObjective(false);
    }
  };

  // Prochain PDV à visiter pour le Vendeur
  const nextPdvToVisit = useMemo(() => {
    const list: any[] = vrsState?.perimeterPdvs || [];
    return list.find((p) => !p.visitedToday) || list[0] || null;
  }, [vrsState?.perimeterPdvs]);

  // Liste filtrée des PDV pour le Vendeur
  const filteredPerimeterPdvs = useMemo(() => {
    const list: any[] = vrsState?.perimeterPdvs || [];
    return list.filter((p) => {
      if (pdvFilter === 'todo' && p.visitedToday) return false;
      if (pdvFilter === 'done' && !p.visitedToday) return false;
      if (pdvSearch.trim()) {
        const q = pdvSearch.toLowerCase();
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.code || '').toLowerCase().includes(q) ||
          (p.neighborhood || '').toLowerCase().includes(q) ||
          (p.manager_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vrsState?.perimeterPdvs, pdvFilter, pdvSearch]);

  const activeDayLabel = useMemo(() => {
    const activeDay = vrsState?.days?.find((d: any) => d.isActiveDay);
    if (activeDay) return `${activeDay.dayName} (${activeDay.date})`;
    return vrsState?.week?.chosenDayName || null;
  }, [vrsState]);

  // Synthèse et filtres Superviseur (Administrateur, DOV, Sales Admin / Contrôleur)
  const availableTeams = useMemo(() => {
    const set = new Set<string>();
    allVendorsSummary.forEach((s) => {
      if (s?.vendor?.team) set.add(s.vendor.team);
    });
    return Array.from(set);
  }, [allVendorsSummary]);

  const availableWeeks = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>();
    if (vrsState?.weekStartDate) {
      map.set(vrsState.weekStartDate, {
        start: vrsState.weekStartDate,
        end: vrsState.weekEndDate,
      });
    }
    historyData.weeks.forEach((w) => {
      if (w.week_start_date && !map.has(w.week_start_date)) {
        map.set(w.week_start_date, {
          start: w.week_start_date,
          end: w.week_end_date || w.week_start_date,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
  }, [vrsState, historyData.weeks]);

  const filteredVendorsForSupervisor = useMemo(() => {
    return allVendorsSummary.filter((item) => {
      if (supervisorVendorFilter !== 'ALL' && item.vendor.id !== supervisorVendorFilter) {
        return false;
      }
      if (supervisorTeamFilter !== 'ALL' && item.vendor.team !== supervisorTeamFilter) {
        return false;
      }
      if (supervisorStatusFilter !== 'ALL') {
        const st = item.week.status;
        if (supervisorStatusFilter === 'Non démarré') {
          if (st !== 'Non effectué' && st !== 'Non démarré' && st !== 'Disponible') return false;
        } else if (st !== supervisorStatusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [
    allVendorsSummary,
    supervisorVendorFilter,
    supervisorTeamFilter,
    supervisorStatusFilter,
  ]);

  const supervisorSynthesis = useMemo(() => {
    const valides = allVendorsSummary.filter((s) => s.week?.status === 'Validé').length;
    const enCours = allVendorsSummary.filter((s) => s.week?.status === 'En cours').length;
    const incomplets = allVendorsSummary.filter((s) => s.week?.status === 'Incomplet').length;
    const nonDemarres = allVendorsSummary.filter(
      (s) =>
        s.week?.status === 'Non effectué' ||
        s.week?.status === 'Non démarré' ||
        s.week?.status === 'Disponible'
    ).length;
    return { valides, enCours, incomplets, nonDemarres };
  }, [allVendorsSummary]);

  // Données de tendance quotidienne (Lundi à Samedi) du nombre moyen de PDV visités par l'ensemble des vendeurs cette semaine
  const dailyAverageTrendData = useMemo(() => {
    const sourceVendors =
      filteredVendorsForSupervisor.length > 0 ? filteredVendorsForSupervisor : allVendorsSummary;
    const vendorCount = Math.max(1, sourceVendors.length);

    // Extraire les 6 jours (Lundi à Samedi) de la semaine active
    const baseDays =
      sourceVendors[0]?.days ||
      vrsState?.days ||
      [1, 2, 3, 4, 5, 6].map((idx) => ({
        dayOfWeek: idx,
        dayName: DAY_LABELS[idx],
        date: '',
      }));

    let cumulativeTotalVisits = 0;

    return baseDays.map((dayMeta: any, index: number) => {
      const dayName = dayMeta.dayName || DAY_LABELS[index + 1] || `Jour ${index + 1}`;
      const dayDate = dayMeta.date || '';

      let totalVisitsOnDay = 0;
      let activeVendorsOnDay = 0;

      sourceVendors.forEach((vendorSummary) => {
        const vendorDay = (vendorSummary.days || []).find(
          (d: any) =>
            (dayDate && d.date === dayDate) ||
            d.dayName === dayName ||
            d.dayOfWeek === dayMeta.dayOfWeek
        );
        const dayVisits = Number(vendorDay?.countedVisits ?? vendorDay?.totalVisits ?? 0);
        totalVisitsOnDay += dayVisits;
        if (dayVisits > 0) {
          activeVendorsOnDay += 1;
        }
      });

      cumulativeTotalVisits += totalVisitsOnDay;

      // Moyenne quotidienne sur l'ensemble des vendeurs et moyenne cumulée hebdomadaire par vendeur
      const moyenneQuotidienne = Number((totalVisitsOnDay / vendorCount).toFixed(1));
      const moyenneCumulee = Number((cumulativeTotalVisits / vendorCount).toFixed(1));
      const moyenneVendeursActifs =
        activeVendorsOnDay > 0
          ? Number((totalVisitsOnDay / activeVendorsOnDay).toFixed(1))
          : 0;

      return {
        dayName,
        shortDay: dayName.slice(0, 3),
        date: dayDate,
        label: dayDate ? `${dayName} (${dayDate.slice(5)})` : dayName,
        moyenneQuotidienne,
        moyenneCumulee,
        moyenneVendeursActifs,
        totalVisitesJour: totalVisitsOnDay,
        vendeursActifs: activeVendorsOnDay,
        nombreVendeurs: sourceVendors.length,
      };
    });
  }, [filteredVendorsForSupervisor, allVendorsSummary, vrsState]);

  const targetCount = Number(vrsState?.week?.targetPdvCount || 25);
  const countedCount = Number(vrsState?.week?.countedVisitsCount || 0);
  const progressPercent = Math.min(100, Math.round((countedCount / Math.max(1, targetCount)) * 100));

  // Liste consolidée des visites pointées des vendeurs filtrés pour l'écran de supervision
  const filteredSupervisorVisits = useMemo(() => {
    if (!isSupervisor) return [];
    const list: any[] = [];
    const seenIds = new Set<string>();
    const hasCustomDateRange =
      performancePeriodPreset !== 'today' &&
      Boolean(performanceStartDate) &&
      Boolean(performanceEndDate);

    filteredVendorsForSupervisor.forEach((vendorSummary) => {
      const vendorVisits = Array.isArray(vendorSummary.visits) ? vendorSummary.visits : [];
      vendorVisits.forEach((v: any) => {
        const vDate = String(v.visit_date || '');
        if (hasCustomDateRange && vDate && (vDate < performanceStartDate || vDate > performanceEndDate)) {
          return;
        }
        if (v.id) seenIds.add(String(v.id));
        list.push({
          ...v,
          vendor_name: v.vendor_name || vendorSummary.vendor?.name,
          vendor_code: v.vendor_code || vendorSummary.vendor?.code,
          vendor_team: vendorSummary.vendor?.team,
        });
      });
    });

    if (hasCustomDateRange && Array.isArray(historyData.visits)) {
      const allowedVendorIds = new Set(
        filteredVendorsForSupervisor.map((s) => String(s.vendor?.id || ''))
      );
      historyData.visits.forEach((hv: any) => {
        if (!hv || seenIds.has(String(hv.id))) return;
        if (allowedVendorIds.size > 0 && !allowedVendorIds.has(String(hv.vendor_id || ''))) {
          return;
        }
        const vDate = String(hv.visit_date || '');
        if (vDate >= performanceStartDate && vDate <= performanceEndDate) {
          seenIds.add(String(hv.id));
          list.push(hv);
        }
      });
    }

    return list.sort((a, b) => {
      const dateCmp = String(b.visit_date || '').localeCompare(String(a.visit_date || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(b.visit_time || '').localeCompare(String(a.visit_time || ''));
    });
  }, [
    isSupervisor,
    filteredVendorsForSupervisor,
    historyData.visits,
    performancePeriodPreset,
    performanceStartDate,
    performanceEndDate,
  ]);

  /**
   * Ligne d'actions sous chaque visite pointée :
   * - Affichée UNIQUEMENT pour Administrateur, DOV et Sales Admin / Contrôleur (isSupervisor)
   * - Jamais visible pour le Vendeur et contrôlée côté serveur (google_maps_url & openstreetmap_url fournis par le serveur uniquement aux superviseurs)
   * - Boutons 48 px, libellés complets, flex-wrap, aucun texte coupé, aucun appel à une API payante ni clé
   * - Coordonnées = position validée du PDV (pdv_latitude, pdv_longitude)
   * - Option "Voir le point de pointage" avec la position GPS du vendeur et la distance au PDV
   */
  const renderSupervisorVisitActionsRow = (visit: any) => {
    if (!isSupervisor || !visit) return null;

    const pdvLat = Number(visit.pdv_latitude);
    const pdvLng = Number(visit.pdv_longitude);
    const hasValidatedPdvGps = Number.isFinite(pdvLat) && Number.isFinite(pdvLng);

    // URLs contrôlées côté serveur avec les coordonnées validées du PDV
    const googleMapsUrl =
      visit.google_maps_url ||
      (hasValidatedPdvGps
        ? `https://www.google.com/maps/dir/?api=1&destination=${pdvLat},${pdvLng}&travelmode=driving`
        : null);
    const openStreetMapUrl =
      visit.openstreetmap_url ||
      (hasValidatedPdvGps
        ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${pdvLat},${pdvLng}`
        : null);

    if (!googleMapsUrl || !openStreetMapUrl) return null;

    const vendorLat = Number(visit.latitude);
    const vendorLng = Number(visit.longitude);
    const distanceM = Number(visit.distance_m ?? visit.distanceM ?? 0);

    return (
      <div className="mt-2 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-bold [overflow-wrap:anywhere]">
            Position validée du PDV :{' '}
            <span className="font-mono text-slate-900 dark:text-white">
              {pdvLat.toFixed(6)}, {pdvLng.toFixed(6)}
            </span>
          </span>
          {Number.isFinite(vendorLat) && Number.isFinite(vendorLng) && (
            <span className="font-semibold [overflow-wrap:anywhere]">
              Pointage vendeur :{' '}
              <span className="font-mono text-slate-900 dark:text-white">
                {vendorLat.toFixed(6)}, {vendorLng.toFixed(6)}
              </span>{' '}
              ({distanceM.toFixed(1)} m du PDV)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white text-xs sm:text-sm font-bold shadow-2xs transition inline-flex items-center justify-center gap-2 whitespace-normal [overflow-wrap:anywhere]"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>Google Maps</span>
          </a>

          <a
            href={openStreetMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs sm:text-sm font-bold shadow-2xs transition inline-flex items-center justify-center gap-2 whitespace-normal [overflow-wrap:anywhere]"
          >
            <Compass className="w-4 h-4 shrink-0" />
            <span>OpenStreetMap</span>
          </a>

          <button
            type="button"
            onClick={() => setMapPreviewModal({ visit, mode: 'pdv_map' })}
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer whitespace-normal [overflow-wrap:anywhere]"
          >
            <MapPin className="w-4 h-4 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
            <span>Voir sur la carte</span>
          </button>

          <button
            type="button"
            onClick={() => setMapPreviewModal({ visit, mode: 'checkin_point' })}
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-[#92400E] dark:text-amber-300 border border-[#92400E]/40 text-xs sm:text-sm font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer whitespace-normal [overflow-wrap:anywhere]"
          >
            <Crosshair className="w-4 h-4 shrink-0" />
            <span>Voir le point de pointage</span>
          </button>
        </div>
      </div>
    );
  };

  // Contrôle d'accès 403 pour les rôles non autorisés (Comptable, Magasinier, Gestionnaire grossiste)
  if (!isAuthorizedRole || accessDeniedError) {
    return (
      <div className="p-6 rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 space-y-2">
        <div className="flex items-center gap-2.5 font-extrabold text-base">
          <Lock className="w-5 h-5 shrink-0 text-[#B91C1C]" />
          <span>Accès refusé (403) — Routine VRS</span>
        </div>
        <p className="text-sm">
          {accessDeniedError ||
            `Votre profil (${currentUser.role}) n'est pas autorisé à accéder au module Routine VRS.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 min-w-0">
      {/* =====================================================================
          EN-TÊTE PRINCIPAL :
          - VENDEUR ("Ma routine") : titre "Routine VRS : objectif 25 PDV"
          - ADMINISTRATEUR, DOV, SALES ADMIN / CONTRÔLEUR : titre "Routine VRS"
         ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-start sm:items-center gap-3">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--marque-fonce)] text-white shadow-xs shrink-0">
                <Navigation className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white leading-snug [overflow-wrap:anywhere]">
                  {isVendeur
                    ? `Routine VRS : objectif ${targetCount} PDV`
                    : 'Routine VRS'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 [overflow-wrap:anywhere]">
                  {isVendeur
                    ? `Ma routine hebdomadaire (Lundi à Samedi • Pointage GPS < ${
                        vrsState?.settings?.max_distance_m || 100
                      } m • Semaine du ${vrsState?.weekStartDate || ''} au ${
                        vrsState?.weekEndDate || ''
                      })`
                    : `Suivi des visites terrain des vendeurs — Objectif ${targetCount} PDV par semaine (Lundi à Samedi • Fuseau Africa/Bamako)`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Boutons d'action Superviseur : Export CSV/Excel/PDF + Accorder une dérogation + Paramètres Admin */}
            {isSupervisor && (
              <>
                <ExportViewButton
                  currentUser={currentUser}
                  jeu="routine_vrs"
                  label="Exporter (CSV, Excel, PDF)"
                  filtres={{
                    vendor_id:
                      supervisorVendorFilter !== 'ALL' ? supervisorVendorFilter : '',
                    status:
                      supervisorStatusFilter !== 'ALL' ? supervisorStatusFilter : '',
                  }}
                />

                <button
                  type="button"
                  onClick={() => openMonthlyObjectiveModal()}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#006D77] hover:bg-[#00586B] text-white text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Target className="w-4 h-4 shrink-0" />
                  <span>Attribuer objectif mensuel</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDerogationModal()}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Accorder une dérogation</span>
                </button>
              </>
            )}

            {isSupervisor && (
              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-sm font-bold transition inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>Date de démarrage &amp; Réglages VRS</span>
              </button>
            )}

            {/* Mode En ligne / Hors ligne (File UUID) */}
            <button
              type="button"
              onClick={() => setIsOfflineMode((prev) => !prev)}
              className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition cursor-pointer ${
                isOfflineMode
                  ? 'bg-[#92400E] text-white border-[#92400E]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
              }`}
            >
              {isOfflineMode ? (
                <WifiOff className="w-4 h-4 shrink-0" />
              ) : (
                <Wifi className="w-4 h-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
              )}
              <span>{isOfflineMode ? 'Mode Hors-ligne (UUID)' : 'En ligne'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                fetchVrsState();
                fetchVrsHistory();
              }}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {/* Navigation par onglets (hauteur 48 px) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('terrain')}
            className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
              activeTab === 'terrain'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span>
              {isVendeur
                ? `Ma routine (${countedCount} / ${targetCount} PDV)`
                : `Suivi des vendeurs (${allVendorsSummary.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historique')}
            className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
              activeTab === 'historique'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Historique par semaine ({historyData.weeks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Journal d&apos;audit &amp; Dérogations</span>
          </button>
        </div>

        {/* =================================================================
            SÉLECTEUR DE DATE & PÉRIODE DE PERFORMANCE (Routine VRS)
            Permet de filtrer les données de performance sur une période
            personnalisée (ex: semaine dernière, mois dernier, dates au choix)
            au lieu de restreindre la vue uniquement à la journée en cours.
           ================================================================= */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[#006D77] dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    Période d&apos;analyse des données de performance :
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#006D77] text-white text-xs font-black">
                    {performancePeriodLabel} (
                    {performanceStartDate === performanceEndDate
                      ? performanceStartDate
                      : `du ${performanceStartDate} au ${performanceEndDate}`}
                    )
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Filtrez les indicateurs de performance (visites, PDV réalisés, CA et livraisons)
                  sur la journée en cours, la semaine dernière, le mois dernier ou une période
                  personnalisée.
                </p>
              </div>
            </div>

            {performancePeriodPreset !== 'today' && (
              <button
                type="button"
                onClick={() => applyPerformancePeriodPreset('today')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-[#006D77] dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-extrabold transition cursor-pointer self-start lg:self-auto whitespace-nowrap"
              >
                Revenir à la journée en cours
              </button>
            )}
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70">
            {/* Boutons de raccourcis de période */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Journée en cours' },
                  { id: 'yesterday', label: 'Hier' },
                  { id: 'this_week', label: 'Semaine en cours' },
                  { id: 'last_week', label: 'Semaine dernière' },
                  { id: 'this_month', label: 'Mois en cours' },
                  { id: 'last_month', label: 'Mois dernier' },
                  { id: 'last_30_days', label: '30 derniers jours' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPerformancePeriodPreset(preset.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                    performancePeriodPreset === preset.id
                      ? 'bg-[#006D77] text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Sélecteurs de dates personnalisées Du / Au */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-perf-start-date"
                  className="text-xs font-extrabold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  Du :
                </label>
                <input
                  id="vrs-perf-start-date"
                  type="date"
                  value={performanceStartDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setPerformancePeriodPreset('custom');
                    setPerformanceStartDate(val);
                    if (performanceEndDate && val > performanceEndDate) {
                      setPerformanceEndDate(val);
                    }
                  }}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-perf-end-date"
                  className="text-xs font-extrabold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  Au :
                </label>
                <input
                  id="vrs-perf-end-date"
                  type="date"
                  value={performanceEndDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setPerformancePeriodPreset('custom');
                    setPerformanceEndDate(val);
                    if (performanceStartDate && val < performanceStartDate) {
                      setPerformanceStartDate(val);
                    }
                  }}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bannière d'information ou d'erreur */}
      {bannerMessage && (
        <div
          className={`flex items-center justify-between gap-3 p-4 rounded-2xl border text-sm font-bold ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
              : bannerMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
              : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#15803D] dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#B91C1C] dark:text-rose-400" />
            )}
            <span className="[overflow-wrap:anywhere]">{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            aria-label="Fermer le message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File d'attente hors-ligne en attente de synchronisation */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <WifiOff className="w-5 h-5 text-[#92400E] dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {offlineQueue.length} visite(s) VRS en file hors-ligne
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Ces enregistrements hors-ligne seront revalidés par le serveur lors de la synchronisation.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={syncingOffline}
            onClick={handleSyncOfflineQueue}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white text-sm font-bold shadow-xs transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${syncingOffline ? 'animate-spin' : ''}`} />
            <span>
              Synchroniser ({offlineQueue.length})
            </span>
          </button>
        </div>
      )}

      {/* =====================================================================
          1. ÉCRAN VENDEUR ("Ma routine")
         ===================================================================== */}
      {activeTab === 'terrain' && isVendeur && vrsState && (
        <div className="space-y-6">
          {/* OBJECTIF DU MOIS : X PDV avec progression mensuelle, et SOUS ELLE la progression du jour actif (X / 25) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            {(() => {
              const mObj = vrsState.monthlyObjective;
              const mTarget = Number(mObj?.monthlyTargetPdv || 625);
              const mRealized = Number(mObj?.realizedMonthlyPdv || 0);
              const mPct = Math.min(100, Math.round((mRealized / Math.max(1, mTarget)) * 100));
              const mIsDefault = Boolean(mObj?.isDefault ?? true);
              const mValidatedDays = Number(mObj?.validatedDaysCount || 0);
              const mWorkingDays = Number(mObj?.workingDaysCount || 25);
              const mStatus = String(mObj?.status || 'En cours');
              const mLabel = String(mObj?.monthLabel || 'Novembre 2026');

              return (
                <div className="p-3.5 sm:p-4 rounded-xl bg-teal-50/50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400 block">
                        Suivi mensuel ({mLabel}) • {mObj?.routineName || 'Routine VRS'}
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                        Objectif du mois : {mTarget} PDV
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {mIsDefault && (
                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-xs font-extrabold">
                          Objectif par défaut
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-extrabold text-white ${
                          mStatus === 'Atteint'
                            ? 'bg-[#15803D]'
                            : mStatus === 'Non atteint'
                            ? 'bg-[#B91C1C]'
                            : 'bg-[#92400E]'
                        }`}
                      >
                        {mStatus}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <span>
                        Progression mensuelle (visites comptées) :{' '}
                        <strong>
                          {mRealized} / {mTarget} PDV ({mPct}%)
                        </strong>
                      </span>
                      <span>
                        Jours validés :{' '}
                        <strong>
                          {mValidatedDays} / {mWorkingDays} jours ouvrés
                        </strong>
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          mStatus === 'Atteint'
                            ? 'bg-[#15803D]'
                            : mStatus === 'Non atteint'
                            ? 'bg-[#B91C1C]'
                            : 'bg-[#006D77]'
                        }`}
                        style={{ width: `${mPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                  Progression du jour actif ({activeDayLabel || vrsState.referenceDate})
                </span>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {countedCount} / {targetCount} PDV
                  </span>
                  {(() => {
                    const badge = getVrsStatusBadgeProps(vrsState.week.status);
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold ${badge.badgeClass}`}
                      >
                        {badge.isLocked && <Lock className="w-3.5 h-3.5 shrink-0" />}
                        <span>{badge.label}</span>
                      </span>
                    );
                  })()}
                </div>
              </div>

            </div>

            {/* Motif obligatoire pour enregistrer une Visite sans vente */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Motif de la visite sans vente (obligatoire avant envoi, figé après soumission)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Stock suffisant chez le client',
                  'Gérant absent lors du passage',
                  'Trésorerie insuffisante',
                  'Boutique momentanément fermée',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVendorNoSaleMotif(preset)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      vendorNoSaleMotif === preset
                        ? 'bg-[#92400E] text-white border-[#92400E]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={vendorNoSaleMotif}
                onChange={(e) => setVendorNoSaleMotif(e.target.value)}
                placeholder="Saisissez ou sélectionnez le motif avant de soumettre une visite sans vente..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
              />
            </div>

            {/* Boutons d'action Vendeur : "Visite sans vente", "Effectuer une vente", "Itinéraire" */}
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={!nextPdvToVisit || submittingPdvId !== null}
                onClick={() => nextPdvToVisit && handleCheckinPdv(nextPdvToVisit, false)}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <MapPin className="w-4 h-4 shrink-0" />
                <span>Visite sans vente</span>
              </button>

              <button
                type="button"
                disabled={!nextPdvToVisit || submittingPdvId !== null}
                onClick={() =>
                  nextPdvToVisit &&
                  (onStartSaleForPdv
                    ? onStartSaleForPdv(nextPdvToVisit)
                    : handleCheckinPdv(nextPdvToVisit, true))
                }
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Effectuer une vente</span>
              </button>

              <button
                type="button"
                disabled={!nextPdvToVisit}
                onClick={() => nextPdvToVisit && setRouteTargetPdv(nextPdvToVisit)}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-[360px]:col-span-2 sm:col-span-1"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span>Itinéraire</span>
              </button>
            </div>

            {/* Barre de progression visuelle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>
                  {nextPdvToVisit
                    ? `Prochain PDV : ${nextPdvToVisit.name} (${nextPdvToVisit.neighborhood})`
                    : 'Tous les PDV du périmètre ont été visités'}
                </span>
                <span>
                  {countedCount} / {targetCount} PDV ({progressPercent}%)
                </span>
              </div>
              <div className="w-full h-3.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    vrsState.week.status === 'Validé' || vrsState.week.status === 'Terminée'
                      ? 'bg-[#15803D]'
                      : vrsState.week.status === 'Incomplet'
                      ? 'bg-[#B91C1C]'
                      : 'bg-[#92400E]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Décompte unique : Visites comptées, En attente de validation, Contestées */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-[#15803D]/30 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Visites comptées
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#15803D] text-white text-xs font-black">
                  {Number(vrsState.week?.countedVisitsCount || 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-[#92400E]/30 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  En attente de validation
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#92400E] text-white text-xs font-black">
                  {Number(vrsState.week?.pendingVisitsCount || 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-[#B91C1C]/30 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Contestées
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[#B91C1C] text-white text-xs font-black">
                  {Number(vrsState.week?.contestedVisitsCount || 0)}
                </span>
              </div>
            </div>

            {/* Message d'état du cycle hebdomadaire (Non démarrée / Semaine terminée) */}
            {vrsState.cycleMessage && (
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 text-sm font-bold ${
                  vrsState.week?.status === 'Terminée'
                    ? 'bg-[#15803D] text-white border-[#15803D]'
                    : 'bg-slate-700 text-white border-slate-700'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="leading-snug [overflow-wrap:anywhere]">{vrsState.cycleMessage}</div>
              </div>
            )}
          </div>

          {/* 6 cartes (Lundi à Samedi, avec date) et statuts normalisés */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Semaine de routine (Lundi à Samedi)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Au 25e PDV valide du jour actif, ce jour passe à « Validé » et le jour suivant passe automatiquement à « Disponible ».
                </p>
              </div>
              {referenceDate && (
                <button
                  type="button"
                  onClick={() => setReferenceDate('')}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] hover:underline cursor-pointer self-start sm:self-auto"
                >
                  Revenir au jour de référence
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 min-w-0">
              {vrsState.days.map((day: any) => {
                const badge = getVrsStatusBadgeProps(day.status);
                const isSelected = day.date === (referenceDate || vrsState.referenceDate);

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setReferenceDate(day.date)}
                    className={`w-full min-w-0 overflow-hidden text-left rounded-xl p-3.5 sm:p-4 border transition flex flex-col justify-between gap-3 cursor-pointer ${
                      badge.cardBorderClass
                    } ${
                      isSelected
                        ? 'ring-2 ring-[var(--marque-fonce)] dark:ring-[var(--marque-eclaircie)]'
                        : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 w-full min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                          {day.dayName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 [overflow-wrap:anywhere]">
                          {day.date}
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold shrink-0 whitespace-nowrap ${badge.badgeClass}`}
                      >
                        {(badge.isLocked || day.isLocked) && <Lock className="w-3.5 h-3.5 shrink-0" />}
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Progression
                      </span>
                      <span className="text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {day.countedVisits} / {day.targetPdvCount} PDV
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fiche de routine du vendeur (viewerRole=Vendeur : lecture seule des motifs, aucune action superviseur) */}
          <VendorRoutineProfileFiche
            vendorId={vrsState.vendor?.id || currentUser.id}
            vendorName={vrsState.vendor?.name || currentUser.name}
            vendorCode={vrsState.vendor?.code}
            vendorTeam={vrsState.vendor?.team}
            vendorPhone={vrsState.vendor?.phone}
            weekStatus={vrsState.week?.status}
            derogationCount={vrsState.week?.derogationCount || 0}
            startDate={performanceStartDate}
            endDate={performanceEndDate}
            periodLabel={performancePeriodLabel}
            viewerRole={currentUser.role}
            viewerName={currentUser.name}
          />

          {/* Liste des PDV du vendeur avec uniquement les boutons autorisés */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Points de vente du périmètre ({filteredPerimeterPdvs.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pointage GPS à moins de {vrsState.settings?.max_distance_m || 100} m. Une visite avec vente compte immédiatement ; une visite sans vente avec motif compte après acceptation du motif.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pdvSearch}
                    onChange={(e) => setPdvSearch(e.target.value)}
                    placeholder="Rechercher un PDV, quartier..."
                    className="w-full min-h-[48px] pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--marque-fonce)]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPdvFilter('all')}
                    className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                      pdvFilter === 'all'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Tous ({vrsState.perimeterPdvs?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdvFilter('todo')}
                    className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                      pdvFilter === 'todo'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    À visiter (
                    {(vrsState.perimeterPdvs || []).filter((p: any) => !p.visitedToday).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdvFilter('done')}
                    className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                      pdvFilter === 'done'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Déjà visités (
                    {(vrsState.perimeterPdvs || []).filter((p: any) => p.visitedToday).length})
                  </button>
                </div>
              </div>
            </div>

            {filteredPerimeterPdvs.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-center text-sm font-semibold text-slate-500">
                Aucun point de vente ne correspond à votre filtre actuel.
              </div>
            ) : (
              <GrilleCartesPdv>
                {filteredPerimeterPdvs.map((pdv: any) => {
                  const visitedToday = Boolean(pdv.visitedToday || pdv.visited_today);
                  const activeDayLabel = String(
                    vrsState?.activeDayName ||
                      pdv.routine_day ||
                      'lundi'
                  ).toLowerCase();
                  const salesCnt = Number(pdv.salesCount ?? pdv.sales_count ?? (pdv.hasSaleToday ? 1 : 0));
                  const noSaleCnt = Number(
                    pdv.noSaleVisitsCount ?? pdv.no_sale_visits_count ?? (visitedToday && salesCnt === 0 ? 1 : 0)
                  );
                  const dayVisitsCnt = Number(
                    pdv.todayVisitsCount ?? pdv.today_visits_count ?? pdv.routineDayVisitsCount ?? pdv.routine_day_visits_count ?? (visitedToday ? 1 : 0)
                  );
                  const totalVisitsCnt = Math.max(
                    Number(pdv.totalVisitsCount ?? pdv.total_visits_count ?? pdv.visits_count ?? 0),
                    dayVisitsCnt,
                    salesCnt + noSaleCnt
                  );
                  const hasAnySale = salesCnt > 0 || Boolean(pdv.hasSaleToday || pdv.hasAnySale);

                  return (
                    <CartePdv
                      key={pdv.id}
                      pdv={{
                        ...pdv,
                        photo_url: pdv.photo_url || getPdvStorefrontImageUrl(pdv),
                        created_by: pdv.created_by || currentUser.name,
                        vendor_code: pdv.vendor_code || (currentUser as any).vendorCode,
                      }}
                      infoBadges={[
                        visitedToday
                          ? "Visité aujourd'hui"
                          : totalVisitsCnt > 0
                          ? 'Déjà visité'
                          : 'Non visité',
                        hasAnySale
                          ? salesCnt > 1
                            ? `Avec vente (${salesCnt})`
                            : 'Avec vente'
                          : totalVisitsCnt > 0
                          ? 'Sans vente'
                          : `Jour : ${activeDayLabel}`,
                      ]}
                      routineDayName={activeDayLabel}
                      routineDayVisitsCount={dayVisitsCnt}
                      totalVisitsCount={totalVisitsCnt}
                      noSaleVisitsCount={noSaleCnt}
                      salesCount={salesCnt}
                      actions={[
                        {
                          id: 'visite-sans-vente',
                          label: 'Visite sans vente',
                          icon: <MapPin className="w-4 h-4 shrink-0" />,
                          variant: 'warning',
                          disabled: submittingPdvId === pdv.id,
                          onClick: () => handleCheckinPdv(pdv, false),
                        },
                        {
                          id: 'vendre',
                          label: 'Vendre',
                          icon: <Check className="w-4 h-4 shrink-0" />,
                          variant: 'success',
                          disabled: submittingPdvId === pdv.id,
                          onClick: () =>
                            onStartSaleForPdv
                              ? onStartSaleForPdv(pdv)
                              : handleCheckinPdv(pdv, true),
                        },
                        {
                          id: 'itineraire',
                          label: 'Itinéraire',
                          icon: <Navigation className="w-4 h-4 shrink-0" />,
                          variant: 'secondary',
                          onClick: () => setRouteTargetPdv(pdv),
                        },
                      ]}
                    />
                  );
                })}
              </GrilleCartesPdv>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          2. ÉCRAN ADMINISTRATEUR, DOV ET SALES ADMIN / CONTRÔLEUR ("Routine VRS")
          - Synthèse : vendeurs validés, en cours, incomplets, non démarrés
          - Filtres par semaine, vendeur, équipe, statut
          - Cartes : un vendeur par carte avec jour choisi, progression X/25,
            statut, dernière visite
          - Bouton "Accorder une dérogation" (motif obligatoire, PIN si défini)
          - Export CSV, Excel et PDF selon la table de droits d'extraction
         ===================================================================== */}
      {activeTab === 'terrain' && isSupervisor && (
        <div className="space-y-6">
          {/* Synthèse : vendeurs validés, en cours, incomplets, non démarrés */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  Vendeurs validés
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#15803D] text-white shrink-0 whitespace-nowrap">
                  Validé
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#15803D] dark:text-emerald-400 mt-2">
                {supervisorSynthesis.valides}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                Objectif {targetCount}/{targetCount} PDV atteint
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  En cours
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#92400E] text-white shrink-0 whitespace-nowrap">
                  En cours
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#92400E] dark:text-amber-400 mt-2">
                {supervisorSynthesis.enCours}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                Tournée VRS en cours aujourd&apos;hui
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  Incomplets
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#B91C1C] text-white shrink-0 whitespace-nowrap">
                  Incomplet
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#B91C1C] dark:text-rose-400 mt-2">
                {supervisorSynthesis.incomplets}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                Journée non terminée (&lt; {targetCount} PDV)
              </span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  Non démarrés
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#E2E8F0] text-[#0F172A] shrink-0 whitespace-nowrap">
                  Disponible
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
                {supervisorSynthesis.nonDemarres}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                Aucune visite pointée cette semaine
              </span>
            </div>
          </div>

          {/* Graphique linéaire Recharts : tendance quotidienne du nombre moyen de PDV visités par l'ensemble des vendeurs cette semaine */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span>
                    Tendance quotidienne du nombre moyen de PDV visités cette semaine
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Évolution du Lundi au Samedi (Semaine du {vrsState?.weekStartDate || ''} au{' '}
                  {vrsState?.weekEndDate || ''}) sur l&apos;ensemble des vendeurs (
                  {filteredVendorsForSupervisor.length || allVendorsSummary.length} vendeur(s) •
                  Objectif : {targetCount} PDV).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                  <span>Moyenne quotidienne / vendeur</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#92400E]" />
                  <span>Moyenne cumulée semaine / vendeur</span>
                </span>
              </div>
            </div>

            <div className="w-full h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyAverageTrendData}
                  margin={{ top: 12, right: 20, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis
                    dataKey="dayName"
                    tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    domain={[0, Math.max(targetCount, 25)]}
                    tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    unit=" PDV"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                    labelStyle={{ color: '#f8fafc', fontWeight: 800, marginBottom: '4px' }}
                    formatter={(value: any, name: any) => [`${value} PDV`, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingTop: '8px' }}
                  />
                  <ReferenceLine
                    y={targetCount}
                    stroke="#15803D"
                    strokeDasharray="5 5"
                    label={{
                      value: `Objectif ${targetCount} PDV`,
                      position: 'insideTopRight',
                      fill: '#15803D',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="moyenneQuotidienne"
                    name="Moyenne quotidienne (PDV / vendeur)"
                    stroke="#15803D"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#15803D', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 7 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="moyenneCumulee"
                    name="Moyenne cumulée semaine (PDV / vendeur)"
                    stroke="#92400E"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#92400E', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Filtres par semaine, vendeur, équipe, statut */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                <Filter className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                <span>Filtres Routine VRS (Semaine, Vendeur, Équipe, Statut)</span>
              </div>
              {(supervisorWeekFilter ||
                supervisorVendorFilter !== 'ALL' ||
                supervisorTeamFilter !== 'ALL' ||
                supervisorStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSupervisorWeekFilter('');
                    setReferenceDate('');
                    setSupervisorVendorFilter('ALL');
                    setSupervisorTeamFilter('ALL');
                    setSupervisorStatusFilter('ALL');
                  }}
                  className="text-xs font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] hover:underline cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Filtre Semaine */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-filter-week"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Semaine
                </label>
                <select
                  id="vrs-filter-week"
                  value={supervisorWeekFilter}
                  onChange={(e) => {
                    setSupervisorWeekFilter(e.target.value);
                    setReferenceDate(e.target.value);
                  }}
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">
                    Semaine en cours ({vrsState?.weekStartDate || 'Lundi'} au{' '}
                    {vrsState?.weekEndDate || 'Samedi'})
                  </option>
                  {availableWeeks.map((w) => (
                    <option key={w.start} value={w.start}>
                      Semaine du {w.start} au {w.end}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre Vendeur */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-filter-vendor"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Vendeur
                </label>
                <select
                  id="vrs-filter-vendor"
                  value={supervisorVendorFilter}
                  onChange={(e) => setSupervisorVendorFilter(e.target.value)}
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Tous les vendeurs ({allVendorsSummary.length})</option>
                  {allVendorsSummary.map((s) => (
                    <option key={s.vendor.id} value={s.vendor.id}>
                      {s.vendor.name} ({s.vendor.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre Équipe */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-filter-team"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Équipe
                </label>
                <select
                  id="vrs-filter-team"
                  value={supervisorTeamFilter}
                  onChange={(e) => setSupervisorTeamFilter(e.target.value)}
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Toutes les équipes</option>
                  {availableTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre Statut */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="vrs-filter-status"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Statut
                </label>
                <select
                  id="vrs-filter-status"
                  value={supervisorStatusFilter}
                  onChange={(e) => setSupervisorStatusFilter(e.target.value)}
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="Validé">Validé (25/25)</option>
                  <option value="En cours">En cours</option>
                  <option value="Incomplet">Incomplet</option>
                  <option value="Non démarré">Non démarré</option>
                </select>
              </div>
            </div>
          </div>

          {/* Liste des vendeurs en cartes : un vendeur par carte avec jour choisi, progression X/25, statut, dernière visite */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Vendeurs du périmètre ({filteredVendorsForSupervisor.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Un vendeur par carte avec jour choisi, progression X/{targetCount}, statut et dernière visite enregistrée.
                </p>
              </div>
            </div>

            <CardList<any>
              data={filteredVendorsForSupervisor}
              rowKey={(s) => s.vendor.id}
              emptyMessage="Aucun vendeur ne correspond aux filtres sélectionnés."
              title={(s) => `${s.vendor.name} (${s.vendor.code})`}
              subtitle={(s) =>
                `${s.vendor.team || 'Équipe Terrain Bamako'} • Semaine du ${s.week.weekStartDate} au ${s.week.weekEndDate}`
              }
              badges={(s) => {
                const badge = getVrsStatusBadgeProps(s.week.status);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold ${badge.badgeClass}`}
                  >
                    {badge.isLocked && <Lock className="w-3.5 h-3.5 shrink-0" />}
                    <span>{badge.label}</span>
                  </span>
                );
              }}
              fields={[
                {
                  key: 'jour_choisi',
                  label: 'Jour choisi',
                  value: (s) =>
                    s.week.chosenDayName
                      ? `${s.week.chosenDayName} (${s.week.activeDate || s.week.chosenDate})`
                      : 'Non démarré',
                },
                {
                  key: 'progression',
                  label: 'Progression',
                  value: (s) => {
                    const counted = Number(s.week.countedVisitsCount || 0);
                    const target = Number(s.week.targetPdvCount || 25);
                    const pct = Math.min(100, Math.round((counted / Math.max(1, target)) * 100));
                    return (
                      <div className="space-y-1 min-w-[140px]">
                        <div className="font-black text-slate-900 dark:text-white">
                          {counted} / {target} PDV ({pct}%)
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              s.week.status === 'Validé'
                                ? 'bg-[#15803D]'
                                : s.week.status === 'Incomplet'
                                ? 'bg-[#B91C1C]'
                                : 'bg-[#92400E]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: 'objectif_mensuel',
                  label: 'Objectif du mois',
                  value: (s) => {
                    const mObj = s.monthlyObjective;
                    const mTarget = Number(mObj?.monthlyTargetPdv || 625);
                    const mRealized = Number(mObj?.realizedMonthlyPdv || 0);
                    const mPct = Math.min(100, Math.round((mRealized / Math.max(1, mTarget)) * 100));
                    const mIsDefault = Boolean(mObj?.isDefault ?? true);
                    const mValidatedDays = Number(mObj?.validatedDaysCount || 0);
                    const mWorkingDays = Number(mObj?.workingDaysCount || 25);
                    const mStatus = String(mObj?.status || 'En cours');
                    return (
                      <div className="space-y-1 min-w-[160px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-black text-slate-900 dark:text-white">
                            {mRealized} / {mTarget} PDV ({mPct}%)
                          </span>
                          {mIsDefault && (
                            <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold">
                              Objectif par défaut
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                              mStatus === 'Atteint'
                                ? 'bg-[#15803D]'
                                : mStatus === 'Non atteint'
                                ? 'bg-[#B91C1C]'
                                : 'bg-[#92400E]'
                            }`}
                          >
                            {mStatus}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Jours validés : {mValidatedDays} / {mWorkingDays} j ouvrés ({mObj?.monthLabel || 'Novembre 2026'})
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: 'derniere_visite',
                  label: 'Dernière visite',
                  value: (s) => {
                    const lv = s.week.lastVisit;
                    if (!lv) return 'Aucune visite cette semaine';
                    return (
                      <div className="space-y-1.5">
                        <div className="font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                          {lv.visitDate} à {String(lv.visitTime || '').slice(0, 5)} — {lv.pdvName} (
                          {lv.pdvNeighborhood || lv.pdvCode})
                        </div>
                        {renderSupervisorVisitActionsRow(lv)}
                      </div>
                    );
                  },
                },
                {
                  key: 'derogations',
                  label: 'Dérogations accordées',
                  value: (s) => `${s.week.derogationCount || 0} dérogation(s)`,
                },
              ]}
              actions={(s) => [
                {
                  key: 'attribuer_objectif_mensuel',
                  label: 'Attribuer objectif mensuel',
                  icon: <Target className="w-4 h-4 shrink-0" />,
                  variant: 'primary',
                  onClick: () => openMonthlyObjectiveModal([s.vendor.id]),
                },
                {
                  key: 'derogation',
                  label: 'Accorder une dérogation',
                  icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
                  variant: 'secondary',
                  onClick: () => openDerogationModal(s),
                },
                {
                  key: 'detail_jours',
                  label: isAdmin || isDov ? 'Fiche Profil & 6 jours' : 'Détail 6 jours & PDV',
                  icon: <Calendar className="w-4 h-4 shrink-0" />,
                  variant: 'secondary',
                  onClick: () => setInspectingVendorSummary(s),
                },
              ]}
            />
          </div>

          {/* =====================================================================
              SUIVI & HISTORIQUE DES OBJECTIFS MENSUELS PAR VENDEUR ET PAR MOIS
              (Objectif, réalisé, % d'avancement, jours validés / jours ouvrés,
              statut En cours / Atteint / Non atteint, badge gris "Objectif par défaut",
              historique par mois conservé avec auteur et date de l'attribution)
             ===================================================================== */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#006D77] dark:text-teal-400 shrink-0" />
                  <span>
                    Suivi des objectifs mensuels par vendeur et par mois (
                    {monthlyTrackingData?.monthInfo?.monthLabel || 'Novembre 2026'})
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pour chaque vendeur et mois : objectif, réalisé (visites comptées), % d&apos;avancement, jours validés sur jours ouvrés (
                  {monthlyTrackingData?.monthInfo?.workingDaysCount || 25} j ouvrés • Défaut :{' '}
                  {monthlyTrackingData?.monthInfo?.defaultMonthlyTargetPdv || 625} PDV), statut et historique d&apos;attribution.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="vrs-tracking-month"
                    className="text-xs font-extrabold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    Mois consulté :
                  </label>
                  <input
                    id="vrs-tracking-month"
                    type="month"
                    value={trackingMonthKey}
                    onChange={(e) => {
                      const val = e.target.value || '2026-11';
                      setTrackingMonthKey(val);
                      fetchMonthlyObjectivesTracking(val);
                    }}
                    className="min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-black text-slate-900 dark:text-white"
                  />
                </div>

                {monthlyTrackingData?.isPastMonth && (
                  <span className="inline-flex items-center gap-1.5 min-h-[48px] px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-[#92400E] dark:text-amber-300 border border-[#92400E]/40 text-xs font-extrabold">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>
                      Mois passé verrouillé (correction motivée par l&apos;Administrateur seulement)
                    </span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => openMonthlyObjectiveModal(undefined, trackingMonthKey)}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#006D77] hover:bg-[#00586B] text-white text-xs sm:text-sm font-bold shadow-xs transition inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Target className="w-4 h-4 shrink-0" />
                  <span>Attribuer pour ce mois</span>
                </button>
              </div>
            </div>

            {/* Tableau de suivi des objectifs avec colonne calculée "% de réalisation (Ventes réelles / Objectif)" et code couleur :
                - Rouge (< 80%)
                - Orange (80 - 99%)
                - Vert (>= 100%) */}
            {(() => {
              const trackingRows: any[] = monthlyTrackingData?.vendors?.length
                ? monthlyTrackingData.vendors
                : filteredVendorsForSupervisor.map((s) => s.monthlyObjective).filter(Boolean);

              const getRealizationColorClasses = (pct: number) => {
                if (pct >= 100) {
                  return {
                    badge:
                      'bg-emerald-600 text-white border border-emerald-700 dark:bg-emerald-600 dark:border-emerald-500',
                    bar: 'bg-emerald-600',
                    text: 'text-emerald-700 dark:text-emerald-400',
                    label: '≥ 100% (Objectif atteint)',
                  };
                }
                if (pct >= 80) {
                  return {
                    badge:
                      'bg-orange-500 text-white border border-orange-600 dark:bg-orange-500 dark:border-orange-400',
                    bar: 'bg-orange-500',
                    text: 'text-orange-600 dark:text-orange-400',
                    label: '80% – 99% (Proche objectif)',
                  };
                }
                return {
                  badge:
                    'bg-red-600 text-white border border-red-700 dark:bg-red-600 dark:border-red-500',
                  bar: 'bg-red-600',
                  text: 'text-red-600 dark:text-red-400',
                  label: '< 80% (Sous objectif)',
                };
              };

              return (
                <>
                  {/* Légende du code couleur du pourcentage de réalisation */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-xs">
                    <span className="font-extrabold text-slate-700 dark:text-slate-200">
                      Code couleur % de réalisation (Ventes réelles / Objectif) :
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white font-extrabold">
                        <span>Rouge : &lt; 80%</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500 text-white font-extrabold">
                        <span>Orange : 80% – 99%</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600 text-white font-extrabold">
                        <span>Vert : ≥ 100%</span>
                      </span>
                    </div>
                  </div>

                  {/* Tableau structuré de suivi des objectifs mensuels */}
                  {trackingRows.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 px-3.5 font-extrabold">Vendeur</th>
                            <th className="py-3 px-3.5 font-extrabold">Mois &amp; Routine</th>
                            <th className="py-3 px-3.5 font-extrabold text-right">Objectif</th>
                            <th className="py-3 px-3.5 font-extrabold text-right">
                              Ventes réelles / Réalisé
                            </th>
                            <th className="py-3 px-3.5 font-extrabold text-center">
                              % de réalisation (Ventes réelles / Objectif)
                            </th>
                            <th className="py-3 px-3.5 font-extrabold text-center">
                              Jours validés / Ouvrés
                            </th>
                            <th className="py-3 px-3.5 font-extrabold text-center">Statut</th>
                            <th className="py-3 px-3.5 font-extrabold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                          {trackingRows.map((m) => {
                            const realVal = Number(
                              m.realizedSalesCount ?? m.realizedMonthlyPdv ?? 0
                            );
                            const objVal = Math.max(1, Number(m.monthlyTargetPdv || 25));
                            const calcPct = Number(((realVal / objVal) * 100).toFixed(1));
                            const colorMeta = getRealizationColorClasses(calcPct);

                            return (
                              <tr
                                key={`table-row-${m.vendorId}-${m.monthKey}`}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                              >
                                <td className="py-3 px-3.5 font-extrabold text-slate-900 dark:text-white">
                                  <div>{m.vendorName}</div>
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                    {m.vendorCode}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-slate-700 dark:text-slate-300">
                                  <div className="font-bold">{m.monthLabel}</div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {m.routineName || 'Routine VRS'}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                                  <div>{objVal} PDV</div>
                                  {m.isDefault && (
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold">
                                      Objectif par défaut
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                                  {realVal} PDV
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="flex flex-col items-center gap-1.5 min-w-[150px]">
                                    <span
                                      className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-xs font-black shadow-2xs whitespace-nowrap ${colorMeta.badge}`}
                                    >
                                      {calcPct}% ({realVal} / {objVal})
                                    </span>
                                    <div className="w-full max-w-[160px] h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all duration-300 ${colorMeta.bar}`}
                                        style={{ width: `${Math.min(100, Math.max(0, calcPct))}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-center font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {m.validatedDaysCount} / {m.workingDaysCount} j
                                </td>
                                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-extrabold text-white ${
                                      m.status === 'Atteint'
                                        ? 'bg-[#15803D]'
                                        : m.status === 'Non atteint'
                                        ? 'bg-[#B91C1C]'
                                        : 'bg-[#92400E]'
                                    }`}
                                  >
                                    {m.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => openMonthlyObjectiveModal([m.vendorId], m.monthKey)}
                                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#006D77] hover:bg-[#00586B] text-white text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Target className="w-3.5 h-3.5 shrink-0" />
                                    <span>Attribuer</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <CardList<any>
                    data={trackingRows}
                    rowKey={(m) => `${m.vendorId}-${m.monthKey}`}
                    emptyMessage="Aucun vendeur trouvé pour ce mois."
                    title={(m) => `${m.vendorName} (${m.vendorCode}) — ${m.monthLabel}`}
                    subtitle={(m) =>
                      `Routine : ${m.routineName || 'Routine VRS'} • Jours ouvrés du mois : ${m.workingDaysCount} j`
                    }
                    badges={(m) => {
                      const realVal = Number(m.realizedSalesCount ?? m.realizedMonthlyPdv ?? 0);
                      const objVal = Math.max(1, Number(m.monthlyTargetPdv || 25));
                      const calcPct = Number(((realVal / objVal) * 100).toFixed(1));
                      const colorMeta = getRealizationColorClasses(calcPct);
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.isDefault && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                              Objectif par défaut
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-black ${colorMeta.badge}`}
                          >
                            Réalisation : {calcPct}%
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold text-white ${
                              m.status === 'Atteint'
                                ? 'bg-[#15803D]'
                                : m.status === 'Non atteint'
                                ? 'bg-[#B91C1C]'
                                : 'bg-[#92400E]'
                            }`}
                          >
                            {m.status}
                          </span>
                        </div>
                      );
                    }}
                    fields={[
                      {
                        key: 'objectif',
                        label: 'Objectif mensuel',
                        value: (m) => (
                          <span className="font-black text-slate-900 dark:text-white">
                            {m.monthlyTargetPdv} PDV{' '}
                            {m.isDefault ? `(25 × ${m.workingDaysCount} j)` : '(Attribué)'}
                          </span>
                        ),
                      },
                      {
                        key: 'pourcentage_realisation_calcule',
                        label: '% de réalisation (Ventes réelles / Objectif)',
                        value: (m) => {
                          const realVal = Number(
                            m.realizedSalesCount ?? m.realizedMonthlyPdv ?? 0
                          );
                          const objVal = Math.max(1, Number(m.monthlyTargetPdv || 25));
                          const calcPct = Number(((realVal / objVal) * 100).toFixed(1));
                          const colorMeta = getRealizationColorClasses(calcPct);
                          return (
                            <div className="space-y-1.5 min-w-[160px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-black ${colorMeta.badge}`}
                                >
                                  {calcPct}% ({realVal} / {objVal} PDV)
                                </span>
                                <span className={`text-[11px] font-extrabold ${colorMeta.text}`}>
                                  {colorMeta.label}
                                </span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${colorMeta.bar}`}
                                  style={{ width: `${Math.min(100, Math.max(0, calcPct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        },
                      },
                      {
                        key: 'jours_valides',
                        label: 'Jours validés / Jours ouvrés',
                        value: (m) => `${m.validatedDaysCount} / ${m.workingDaysCount} jours ouvrés`,
                      },
                      {
                        key: 'attribution_info',
                        label: 'Auteur & Date d’attribution',
                        value: (m) =>
                          m.isDefault || !m.assignedByName
                            ? `Objectif par défaut (${m.defaultMonthlyTargetPdv} PDV)`
                            : `${m.assignedByName} (${m.assignedByRole}) le ${String(
                                m.updatedAt || m.assignedAt || ''
                              )
                                .replace('T', ' ')
                                .slice(0, 16)}${
                                m.correctionReason ? ` — Motif : ${m.correctionReason}` : ''
                              }`,
                      },
                    ]}
                    actions={(m) => [
                      {
                        key: 'assign_vendor_month',
                        label: 'Attribuer / Modifier',
                        icon: <Target className="w-4 h-4 shrink-0" />,
                        variant: 'primary',
                        onClick: () => openMonthlyObjectiveModal([m.vendorId], m.monthKey),
                      },
                    ]}
                  />
                </>
              );
            })()}

            {/* Historique par mois conservé avec auteur et date de l'attribution */}
            {Array.isArray(monthlyTrackingData?.history) &&
              monthlyTrackingData.history.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-[#006D77] dark:text-teal-400" />
                    <span>
                      Historique des attributions d&apos;objectifs mensuels (
                      {monthlyTrackingData.history.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {monthlyTrackingData.history.slice(0, 8).map((h: any) => (
                      <div
                        key={h.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1 font-extrabold text-slate-900 dark:text-white">
                          <span>
                            {h.vendorName} ({h.vendorCode}) • Mois {h.monthKey}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#006D77] text-white font-black">
                            {h.previousTargetPdvCount
                              ? `${h.previousTargetPdvCount} → ${h.targetPdvCount} PDV`
                              : `${h.targetPdvCount} PDV`}
                          </span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 font-semibold">
                          Routine : {h.routineName} • Attribué par{' '}
                          <strong>{h.assignedByName}</strong> ({h.assignedByRole}) le{' '}
                          {String(h.createdAt || '').replace('T', ' ').slice(0, 19)}
                        </div>
                        {h.correctionReason && (
                          <div className="text-[#92400E] dark:text-amber-300 font-bold">
                            Motif de correction (mois passé) : {h.correctionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* =====================================================================
              FICHES DE ROUTINE DES VENDEURS (DOV, ADMINISTRATEUR, SALES ADMIN / CONTRÔLEUR)
              Un vendeur par carte, motifs en lecture seule, validations,
              objectifs mensuels, dérogations, itinéraires
             ===================================================================== */}
          {isSupervisor && (
            <div className="bg-white dark:bg-slate-900 border-2 border-teal-600/30 dark:border-teal-500/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 text-xs font-black tracking-wider mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Supervision Routine VRS</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Fiches Routine des Vendeurs ({filteredVendorsForSupervisor.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Un vendeur par carte : motifs en lecture seule, validations, objectifs mensuels, dérogations et itinéraires.
                  </p>
                </div>

                {/* Sélecteur rapide de vendeur pour filtrer ou afficher toutes les fiches profil */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSupervisorVendorFilter('ALL')}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                      supervisorVendorFilter === 'ALL'
                        ? 'bg-[#006D77] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Toutes les fiches ({allVendorsSummary.length})
                  </button>
                  {allVendorsSummary.map((s) => (
                    <button
                      key={`fiche-tab-${s.vendor.id}`}
                      type="button"
                      onClick={() => setSupervisorVendorFilter(s.vendor.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                        supervisorVendorFilter === s.vendor.id
                          ? 'bg-[#006D77] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {s.vendor.name} ({s.vendor.code})
                    </button>
                  ))}
                </div>
              </div>

              {filteredVendorsForSupervisor.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm font-bold text-slate-600 dark:text-slate-300">
                  Aucun vendeur ne correspond aux filtres sélectionnés.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredVendorsForSupervisor.map((s) => (
                    <VendorRoutineProfileFiche
                      key={`vendor-fiche-${s.vendor.id}`}
                      vendorId={s.vendor.id}
                      vendorName={s.vendor.name}
                      vendorCode={s.vendor.code}
                      vendorTeam={s.vendor.team}
                      vendorPhone={s.vendor.phone}
                      weekStatus={s.week?.status}
                      derogationCount={s.week?.derogationCount || 0}
                      startDate={performanceStartDate}
                      endDate={performanceEndDate}
                      periodLabel={performancePeriodLabel}
                      viewerRole={currentUser.role}
                      viewerName={currentUser.name}
                      onGrantDerogation={() => openDerogationModal(s)}
                      onInspectSixDays={() => setInspectingVendorSummary(s)}
                      onAssignMonthlyObjective={() => openMonthlyObjectiveModal([s.vendor.id])}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Liste des visites pointées des vendeurs (avec ligne d'actions Google Maps, OpenStreetMap, Voir sur la carte, Voir le point de pointage) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Visites pointées des vendeurs ({filteredSupervisorVisits.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sous chaque visite pointée : navigation directe vers les coordonnées validées du PDV (Google Maps, OpenStreetMap, Voir sur la carte) et point de pointage GPS du vendeur.
                </p>
              </div>
            </div>

            <CardList<any>
              data={filteredSupervisorVisits}
              rowKey={(v) => v.id}
              emptyMessage="Aucune visite pointée enregistrée pour les filtres actuels."
              title={(v) => `${v.pdv_name || v.pdv_id} (${v.pdv_code || ''})`}
              subtitle={(v) =>
                `Vendeur : ${v.vendor_name || v.vendor_id} (${v.vendor_code || ''}) • Quartier : ${
                  v.pdv_neighborhood || 'Bamako'
                }`
              }
              badges={(v) =>
                Number(v.is_counted) === 1 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#15803D] text-white border border-[#15803D]">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Visite comptée</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#E2E8F0] text-[#0F172A] border border-slate-300">
                    Hors quota
                  </span>
                )
              }
              fields={[
                {
                  key: 'horodatage',
                  label: 'Date & Heure serveur',
                  value: (v) =>
                    `${v.visit_date} à ${String(v.visit_time || '').slice(0, 8)} (${
                      v.device_info || 'Terminal Mobile'
                    })`,
                },
                {
                  key: 'distance',
                  label: 'Distance & Précision GPS',
                  value: (v) =>
                    `${Number(v.distance_m || 0).toFixed(1)} m du PDV (±${Number(
                      v.gps_accuracy || 4.2
                    ).toFixed(1)} m)`,
                },
                {
                  key: 'navigation_superviseur',
                  label: 'Itinéraire & Carte (Coordonnées validées du PDV)',
                  value: (v) => renderSupervisorVisitActionsRow(v),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          ONGLET 2 : HISTORIQUE PAR SEMAINE (EN CARTES PARTAGÉES CardList)
         ===================================================================== */}
      {activeTab === 'historique' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Historique par semaine ({historyData.weeks.length})</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Réinitialisation automatique le lundi à 00h00 (Africa/Bamako). Historique conservé par semaine : jour choisi, nombre de PDV et statut.
                </p>
              </div>
              {isSupervisor && (
                <ExportViewButton
                  currentUser={currentUser}
                  jeu="routine_vrs"
                  label="Exporter l'historique"
                />
              )}
            </div>

            <CardList<any>
              data={historyData.weeks}
              rowKey={(w) => w.id}
              emptyMessage="Aucune semaine Routine VRS enregistrée pour ce filtre."
              title={(w) =>
                `${w.vendor_name || w.vendor_id} (${w.vendor_code || ''}) — Semaine du ${w.week_start_date}`
              }
              subtitle={(w) => `Du Lundi ${w.week_start_date} au Samedi ${w.week_end_date}`}
              badges={(w) => {
                const badge = getVrsStatusBadgeProps(w.status);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold ${badge.badgeClass}`}
                  >
                    {badge.isLocked && <Lock className="w-3.5 h-3.5 shrink-0" />}
                    <span>{badge.label}</span>
                  </span>
                );
              }}
              fields={[
                {
                  key: 'jour_choisi',
                  label: 'Jour choisi',
                  value: (w) => w.active_date || w.chosen_date || 'Non démarré',
                },
                {
                  key: 'progression',
                  label: 'Progression PDV',
                  value: (w) => `${w.counted_visits_count} / ${w.target_pdv_count} PDV`,
                },
                {
                  key: 'total_visites',
                  label: 'Visites totales (dont hors quota)',
                  value: (w) => `${w.total_visits_count} visite(s)`,
                },
                {
                  key: 'derogations',
                  label: 'Dérogations',
                  value: (w) => `${w.derogation_count || 0} dérogation(s)`,
                },
              ]}
              actions={
                isSupervisor
                  ? (w) => [
                      {
                        key: 'derogation',
                        label: 'Accorder une dérogation',
                        icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
                        variant: 'secondary',
                        onClick: () => {
                          const found = allVendorsSummary.find(
                            (s) => s.vendor.id === w.vendor_id
                          );
                          openDerogationModal(found);
                        },
                      },
                    ]
                  : undefined
              }
            />
          </div>

          {/* Historique des visites pointées (Superviseurs uniquement : Administrateur, DOV, Sales Admin / Contrôleur) */}
          {isSupervisor && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Historique des visites pointées ({historyData.visits.length})</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Chaque visite affiche la ligne d&apos;actions vers la position validée du PDV (Google Maps, OpenStreetMap, Voir sur la carte) et l&apos;option Voir le point de pointage.
                </p>
              </div>

              <CardList<any>
                data={historyData.visits}
                rowKey={(v) => v.id}
                emptyMessage="Aucune visite pointée dans l'historique pour ce filtre."
                title={(v) => `${v.pdv_name || v.pdv_id} (${v.pdv_code || ''})`}
                subtitle={(v) =>
                  `Vendeur : ${v.vendor_name || v.vendor_id} (${v.vendor_code || ''}) • Semaine du ${
                    v.week_start_date
                  } • Quartier : ${v.pdv_neighborhood || 'Bamako'}`
                }
                badges={(v) =>
                  Number(v.is_counted) === 1 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#15803D] text-white border border-[#15803D]">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Visite comptée</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#E2E8F0] text-[#0F172A] border border-slate-300">
                      Hors quota
                    </span>
                  )
                }
                fields={[
                  {
                    key: 'horodatage',
                    label: 'Date & Heure serveur',
                    value: (v) =>
                      `${v.visit_date} à ${String(v.visit_time || '').slice(0, 8)} (${
                        v.device_info || 'Terminal Mobile'
                      })`,
                  },
                  {
                    key: 'distance',
                    label: 'Distance & Précision GPS',
                    value: (v) =>
                      `${Number(v.distance_m || 0).toFixed(1)} m du PDV (±${Number(
                        v.gps_accuracy || 4.2
                      ).toFixed(1)} m)`,
                  },
                  {
                    key: 'navigation_superviseur',
                    label: 'Itinéraire & Carte (Coordonnées validées du PDV)',
                    value: (v) => renderSupervisorVisitActionsRow(v),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          ONGLET 3 : JOURNAL D'AUDIT & DÉROGATIONS (EN CARTES PARTAGÉES CardList)
         ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Dérogations accordées */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#92400E] dark:text-amber-400" />
              <span>Dérogations accordées ({historyData.derogations.length})</span>
            </h2>

            <CardList<any>
              data={historyData.derogations}
              rowKey={(d) => d.id}
              emptyMessage="Aucune dérogation (jour supplémentaire ou reprise) n'a été accordée sur cette période."
              title={(d) =>
                `${d.vendor_name || d.vendor_id} (${d.vendor_code || ''}) — ${
                  d.derogation_type === 'jour_supplementaire'
                    ? 'Jour supplémentaire'
                    : 'Reprise de journée'
                }`
              }
              subtitle={(d) =>
                `Accordée par ${d.granted_by_name} (${d.granted_by_role}) • Le ${String(
                  d.created_at || ''
                )
                  .replace('T', ' ')
                  .slice(0, 19)}`
              }
              badges={(d) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#92400E] text-white border border-[#92400E]">
                  {d.previous_week_status} → {d.new_week_status}
                </span>
              )}
              fields={[
                {
                  key: 'target_date',
                  label: 'Jour cible dérogé',
                  value: (d) => d.target_date,
                },
                {
                  key: 'reason',
                  label: 'Motif obligatoire',
                  value: (d) => d.reason,
                },
              ]}
            />
          </div>

          {/* Journal d'audit */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              <span>Journal d&apos;Audit Routine VRS ({historyData.audits.length})</span>
            </h2>

            <CardList<any>
              data={historyData.audits}
              rowKey={(a) => a.id}
              emptyMessage="Les actions de pointage, verrouillage et dérogation apparaîtront ici."
              title={(a) => a.action}
              subtitle={(a) =>
                `${String(a.created_at || '').replace('T', ' ').slice(0, 19)} • Rôle : ${a.user_role}`
              }
              fields={[
                {
                  key: 'actor',
                  label: 'Opérateur',
                  value: (a) => {
                    try {
                      const parsed = JSON.parse(a.details || '{}');
                      return parsed.actor_name || a.user_id || 'Système';
                    } catch {
                      return a.user_id || 'Système';
                    }
                  },
                },
                {
                  key: 'summary',
                  label: 'Détail Avant / Après',
                  value: (a) => {
                    try {
                      const parsed = JSON.parse(a.details || '{}');
                      return parsed.summary || a.details;
                    } catch {
                      return a.details;
                    }
                  },
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 0 : ATTRIBUTION DES OBJECTIFS MENSUELS PAR VENDEUR ET PAR MOIS
          - Administrateur, DOV, Sales Admin / Contrôleur uniquement (jamais Vendeur)
          - Sélection multiple d'un ou plusieurs vendeurs
          - Sélecteur mois et année (mois courant par défaut)
          - Objectif mensuel en PDV (défaut : 25 × nombre de jours ouvrés du mois ; min 25)
          - Nom de la routine
          - Mois passé verrouillé (correction motivée par l'Administrateur seulement)
          - Champs 48 px, aucun débordement
         ===================================================================== */}
      {monthlyModalOpen && isSupervisor && (
        <FormModal
          title="Attribuer l'objectif mensuel Routine VRS"
          subtitle={`Attribution par vendeur et par mois (${modalMonthMeta.monthLabel} • ${modalMonthMeta.workingDaysCount} jours ouvrés • Défaut : ${modalMonthMeta.defaultMonthlyTargetPdv} PDV).`}
          onClose={() => setMonthlyModalOpen(false)}
          onSubmit={handleAssignMonthlyObjectiveSubmit}
          submitLabel={submittingMonthlyObjective ? 'Attribution en cours...' : 'Attribuer'}
          submitDisabled={
            submittingMonthlyObjective ||
            monthlySelectedVendorIds.length === 0 ||
            (isModalPastMonth && !isAdmin)
          }
          icon={<Target className="w-4 h-4" />}
        >
          <div className="space-y-4 min-w-0">
            {/* 1. Choix d'un ou plusieurs vendeurs (sélection multiple) */}
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  Vendeur(s) bénéficiaire(s) (sélection multiple) *
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMonthlySelectedVendorIds(allVendorsSummary.map((s) => String(s.vendor.id)))
                    }
                    className="text-xs font-extrabold text-[#006D77] dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Tout sélectionner ({allVendorsSummary.length})
                  </button>
                  <span className="text-slate-400">•</span>
                  <button
                    type="button"
                    onClick={() => setMonthlySelectedVendorIds([])}
                    className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Effacer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allVendorsSummary.map((s) => {
                  const vId = String(s.vendor.id);
                  const checked = monthlySelectedVendorIds.includes(vId);
                  return (
                    <button
                      key={`monthly-vnd-${vId}`}
                      type="button"
                      onClick={() => toggleMonthlyVendorSelection(vId)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-w-0 ${
                        checked
                          ? 'bg-[#006D77] text-white border-[#006D77]'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold leading-snug [overflow-wrap:anywhere]">
                          {s.vendor.name} ({s.vendor.code})
                        </div>
                        <div
                          className={`text-[11px] leading-snug ${
                            checked ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {s.vendor.team || 'Équipe Terrain Bamako'}
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                          checked
                            ? 'bg-white text-[#006D77] border-white'
                            : 'border-slate-400 dark:border-slate-500'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Sélecteur Mois et Année (mois courant par défaut) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div className="min-w-0">
                <label
                  htmlFor="monthly-select-month"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Mois *
                </label>
                <select
                  id="monthly-select-month"
                  value={monthlyMonthNumber}
                  onChange={(e) =>
                    handleChangeModalMonthOrYear(Number(e.target.value), monthlyYearNumber)
                  }
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                >
                  {Object.entries(MONTH_LABELS_FR).map(([mNum, mLabel]) => (
                    <option key={mNum} value={Number(mNum)}>
                      {mLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="monthly-select-year"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  Année *
                </label>
                <select
                  id="monthly-select-year"
                  value={monthlyYearNumber}
                  onChange={(e) =>
                    handleChangeModalMonthOrYear(monthlyMonthNumber, Number(e.target.value))
                  }
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                >
                  {[2025, 2026, 2027, 2028].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Avertissement / Motif obligatoire si mois passé verrouillé */}
            {isModalPastMonth && (
              <div
                className={`p-3.5 rounded-xl border space-y-2 ${
                  isAdmin
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    Mois passé verrouillé ({modalMonthMeta.monthLabel})
                  </span>
                </div>
                {isAdmin ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="monthly-correction-reason"
                      className="block text-xs font-bold"
                    >
                      Motif obligatoire de correction par l&apos;Administrateur *
                    </label>
                    <input
                      id="monthly-correction-reason"
                      type="text"
                      required
                      value={monthlyCorrectionReasonInput}
                      onChange={(e) => setMonthlyCorrectionReasonInput(e.target.value)}
                      placeholder="Saisissez le motif de la correction sur ce mois passé..."
                      className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-amber-400 dark:border-amber-600 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <p className="text-xs font-semibold">
                    Un mois passé est verrouillé. Seul l&apos;Administrateur peut effectuer une correction motivée sur un mois passé.
                  </p>
                )}
              </div>
            )}

            {/* 3. Objectif mensuel en PDV (défaut : 25 × nombre de jours ouvrés du mois ; minimum 25) */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="monthly-target-pdv"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Objectif mensuel en PDV (minimum 25 PDV) *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setMonthlyTargetPdvInput(modalMonthMeta.defaultMonthlyTargetPdv)
                  }
                  className="text-xs font-extrabold text-[#006D77] dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Appliquer défaut (25 × {modalMonthMeta.workingDaysCount} j ={' '}
                  {modalMonthMeta.defaultMonthlyTargetPdv} PDV)
                </button>
              </div>
              <input
                id="monthly-target-pdv"
                type="number"
                min={25}
                required
                value={monthlyTargetPdvInput}
                onChange={(e) =>
                  setMonthlyTargetPdvInput(Math.max(25, Number(e.target.value || 25)))
                }
                className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black text-slate-900 dark:text-white"
              />
            </div>

            {/* 4. Nom de la routine */}
            <div className="space-y-1.5 min-w-0">
              <label
                htmlFor="monthly-routine-name"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Nom de la routine *
              </label>
              <input
                id="monthly-routine-name"
                type="text"
                required
                value={monthlyRoutineNameInput}
                onChange={(e) => setMonthlyRoutineNameInput(e.target.value)}
                placeholder={`Routine VRS ${modalMonthMeta.monthLabel}`}
                className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* =====================================================================
          MODAL 1 : ACCORDER UNE DÉROGATION (FormModal partagé opaque)
         ===================================================================== */}
      {derogationModalOpen && isSupervisor && (
        <FormModal
          title="Accorder une dérogation Routine VRS"
          subtitle="Autoriser un jour supplémentaire ou la reprise d'une journée incomplète (journalisée et notifiée au vendeur et au DOV)."
          onClose={() => setDerogationModalOpen(false)}
          onSubmit={handleGrantDerogation}
          submitLabel={
            submittingDerogation ? 'Validation en cours...' : 'Accorder la dérogation'
          }
          submitDisabled={submittingDerogation}
          icon={<ShieldAlert className="w-4 h-4" />}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="derog-vendor"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Vendeur bénéficiaire *
              </label>
              <select
                id="derog-vendor"
                value={derogationVendorId}
                onChange={(e) => setDerogationVendorId(e.target.value)}
                required
              >
                {allVendorsSummary.map((s) => (
                  <option key={s.vendor.id} value={s.vendor.id}>
                    {s.vendor.name} ({s.vendor.code}) — {s.week.countedVisitsCount}/
                    {s.week.targetPdvCount} PDV ({s.week.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Type de dérogation *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDerogationType('reprise')}
                  className={`min-h-[48px] p-3 rounded-xl border text-left transition cursor-pointer ${
                    derogationType === 'reprise'
                      ? 'border-[#92400E] bg-amber-50 dark:bg-amber-950/40 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-extrabold">Reprise de journée</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Réouvre le jour incomplet pour terminer les 25 PDV
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDerogationType('jour_supplementaire')}
                  className={`min-h-[48px] p-3 rounded-xl border text-left transition cursor-pointer ${
                    derogationType === 'jour_supplementaire'
                      ? 'border-[#92400E] bg-amber-50 dark:bg-amber-950/40 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-extrabold">Jour supplémentaire</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Déverrouille un autre jour de la semaine
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="derog-date"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Date du jour à déverrouiller / reprendre *
              </label>
              <input
                id="derog-date"
                type="date"
                required
                value={derogationTargetDate}
                onChange={(e) => setDerogationTargetDate(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="derog-reason"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Motif obligatoire de la dérogation *
              </label>
              <textarea
                id="derog-reason"
                rows={3}
                required
                value={derogationReason}
                onChange={(e) => setDerogationReason(e.target.value)}
                placeholder="Ex : Panne véhicule sur Sotuba, intempéries majeures, autorisation exceptionnelle DOV..."
              />
            </div>

            <div>
              <label
                htmlFor="derog-pin"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Code PIN de validation{' '}
                {vrsState?.settings?.has_derogation_pin
                  ? '(Obligatoire)'
                  : '(Si défini dans les réglages)'}
              </label>
              <input
                id="derog-pin"
                type="password"
                value={derogationPin}
                onChange={(e) => setDerogationPin(e.target.value)}
                placeholder="Saisir le code PIN si défini..."
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* =====================================================================
          MODAL 2 : PARAMÈTRES ROUTINE VRS ADMIN & DOV (FormModal partagé opaque)
         ===================================================================== */}
      {settingsModalOpen && isSupervisor && (
        <FormModal
          title="Date de démarrage & Paramètres Routine VRS"
          subtitle="Date de démarrage de la routine (défaut : lundi 23 novembre 2026, Africa/Bamako), objectif 25 PDV minimum et PIN de dérogation."
          onClose={() => setSettingsModalOpen(false)}
          onSubmit={handleSaveSettings}
          submitLabel={savingSettings ? 'Enregistrement...' : 'Attribuer & enregistrer'}
          submitDisabled={savingSettings}
          icon={<Settings className="w-4 h-4" />}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="vrs-routine-start-date"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Date de démarrage de la routine (Africa/Bamako, défaut : lundi 23/11/2026)
              </label>
              <input
                id="vrs-routine-start-date"
                type="date"
                value={settingsRoutineStartDate}
                onChange={(e) => setSettingsRoutineStartDate(e.target.value || '2026-11-23')}
              />
            </div>

            <div>
              <label
                htmlFor="vrs-target-count"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Objectif de routine attribué aux vendeurs (minimum obligatoire : 25 PDV)
              </label>
              <input
                id="vrs-target-count"
                type="number"
                min={25}
                max={100}
                value={settingsTargetCount}
                onChange={(e) => setSettingsTargetCount(Math.max(25, Number(e.target.value || 25)))}
              />
            </div>

            <div>
              <label
                htmlFor="vrs-max-distance"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Rayon maximal de validation GPS en mètres (défaut : 100 m)
              </label>
              <input
                id="vrs-max-distance"
                type="number"
                min={10}
                max={500}
                value={settingsMaxDistance}
                onChange={(e) => setSettingsMaxDistance(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Jours autorisés dans la semaine (défaut : Lundi à Samedi)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((dayIdx) => {
                  const checked = settingsAllowedDays.includes(dayIdx);
                  return (
                    <button
                      key={dayIdx}
                      type="button"
                      onClick={() => toggleAllowedDay(dayIdx)}
                      className={`min-h-[48px] flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-extrabold transition cursor-pointer ${
                        checked
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <span>{DAY_LABELS[dayIdx]}</span>
                      {checked && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="vrs-derog-pin"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Code PIN de dérogation (laisser vide pour désactiver)
              </label>
              <input
                id="vrs-derog-pin"
                type="password"
                value={settingsPin}
                onChange={(e) => setSettingsPin(e.target.value)}
                placeholder={
                  vrsState?.settings?.has_derogation_pin
                    ? 'PIN actuellement actif (saisir pour modifier)'
                    : 'Aucun PIN défini'
                }
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* =====================================================================
          MODAL 3 : DÉTAIL DES 6 JOURS & VISITES D'UN VENDEUR POUR LE SUPERVISEUR (FormModal opaque)
         ===================================================================== */}
      {inspectingVendorSummary && (
        <FormModal
          size="xl"
          title={`Fiche Profil & Routine VRS — ${inspectingVendorSummary.vendor.name} (${inspectingVendorSummary.vendor.code})`}
          subtitle={`Semaine du ${inspectingVendorSummary.week.weekStartDate} au ${inspectingVendorSummary.week.weekEndDate} • Progression : ${inspectingVendorSummary.week.countedVisitsCount} / ${inspectingVendorSummary.week.targetPdvCount} PDV`}
          onClose={() => setInspectingVendorSummary(null)}
          footerContent={
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              <button
                type="button"
                onClick={() => {
                  const target = inspectingVendorSummary;
                  setInspectingVendorSummary(null);
                  openDerogationModal(target);
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Accorder une dérogation</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectingVendorSummary(null)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold flex items-center justify-center cursor-pointer"
              >
                Fermer
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {(isAdmin || isDov) && (
              <VendorRoutineProfileFiche
                vendorId={inspectingVendorSummary.vendor.id}
                vendorName={inspectingVendorSummary.vendor.name}
                vendorCode={inspectingVendorSummary.vendor.code}
                vendorTeam={inspectingVendorSummary.vendor.team}
                vendorPhone={inspectingVendorSummary.vendor.phone}
                weekStatus={inspectingVendorSummary.week?.status}
                derogationCount={inspectingVendorSummary.week?.derogationCount || 0}
                startDate={performanceStartDate}
                endDate={performanceEndDate}
                periodLabel={performancePeriodLabel}
                viewerRole={currentUser.role}
                viewerName={currentUser.name}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(inspectingVendorSummary.days || []).map((d: any) => {
                const badge = getVrsStatusBadgeProps(d.status);
                return (
                  <div
                    key={d.date}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${badge.cardBorderClass}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {d.dayName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{d.date}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold ${badge.badgeClass}`}
                      >
                        {badge.isLocked && <Lock className="w-3 h-3 shrink-0" />}
                        <span>{badge.label}</span>
                      </span>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">
                      {d.countedVisits} / {d.targetPdvCount} PDV
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Liste des visites pointées sur la fiche de routine du vendeur */}
            {isSupervisor && (
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Visites pointées du vendeur ({(inspectingVendorSummary.visits || []).length})
                </h3>
                <CardList<any>
                  data={inspectingVendorSummary.visits || []}
                  rowKey={(v) => v.id}
                  emptyMessage="Aucune visite pointée pour ce vendeur cette semaine."
                  title={(v) => `${v.pdv_name || v.pdv_id} (${v.pdv_code || ''})`}
                  subtitle={(v) =>
                    `${v.visit_date} à ${String(v.visit_time || '').slice(0, 8)} • Quartier : ${
                      v.pdv_neighborhood || 'Bamako'
                    }`
                  }
                  badges={(v) =>
                    Number(v.is_counted) === 1 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#15803D] text-white border border-[#15803D]">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Comptée</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-[#E2E8F0] text-[#0F172A] border border-slate-300">
                        Hors quota
                      </span>
                    )
                  }
                  fields={[
                    {
                      key: 'distance',
                      label: 'Distance au PDV',
                      value: (v) =>
                        `${Number(v.distance_m || 0).toFixed(1)} m (±${Number(
                          v.gps_accuracy || 4.2
                        ).toFixed(1)} m)`,
                    },
                    {
                      key: 'navigation_superviseur',
                      label: 'Itinéraire & Carte (Coordonnées validées du PDV)',
                      value: (v) => renderSupervisorVisitActionsRow(v),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </FormModal>
      )}

      {/* =====================================================================
          MODAL 4 : ITINÉRAIRE GPS VERS LE PROCHAIN PDV (FormModal opaque + GoogleMapsPdvRoute)
         ===================================================================== */}
      {routeTargetPdv && (
        <FormModal
          size="lg"
          title={`Itinéraire GPS — ${routeTargetPdv.name}`}
          subtitle={`Code : ${routeTargetPdv.code} • Quartier : ${routeTargetPdv.neighborhood}`}
          onClose={() => setRouteTargetPdv(null)}
          footerContent={
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              {isVendeur && !routeTargetPdv.visitedToday && (
                <button
                  type="button"
                  onClick={() => {
                    const target = routeTargetPdv;
                    setRouteTargetPdv(null);
                    handleCheckinPdv(target, false);
                  }}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>Visite sans vente</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setRouteTargetPdv(null)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold flex items-center justify-center cursor-pointer sm:col-span-1"
              >
                Fermer l&apos;itinéraire
              </button>
            </div>
          }
        >
          <GoogleMapsPdvRoute
            originLat={12.6608}
            originLng={-7.9352}
            originLabel={`Position Vendeur (${currentUser.name})`}
            destLat={Number(routeTargetPdv.latitude || 12.6392)}
            destLng={Number(routeTargetPdv.longitude || -7.9928)}
            destName={routeTargetPdv.name}
            destCode={routeTargetPdv.code}
            destNeighborhood={routeTargetPdv.neighborhood}
            destManager={routeTargetPdv.manager_name}
          />
        </FormModal>
      )}

      {/* =====================================================================
          MODAL 5 : VOIR SUR LA CARTE / VOIR LE POINT DE POINTAGE (SUPERVISEURS UNIQUEMENT)
          - Sans API payante ni clé (OpenStreetMap Leaflet)
          - Coordonnées = position validée du PDV (jamais saisie à la main)
          - Option "Voir le point de pointage" avec la position GPS du vendeur et la distance au PDV
         ===================================================================== */}
      {isSupervisor && mapPreviewModal && (() => {
        const v = mapPreviewModal.visit;
        const pdvLat = Number(v.pdv_latitude || 12.6392);
        const pdvLng = Number(v.pdv_longitude || -7.9928);
        const vendorLat = Number(v.latitude || pdvLat);
        const vendorLng = Number(v.longitude || pdvLng);
        const distanceM = Number(v.distance_m ?? v.distanceM ?? 0);
        const gpsAccuracy = Number(v.gps_accuracy || 4.2);
        const pdvName = v.pdv_name || v.pdvName || v.pdv_id || 'PDV';
        const pdvCode = v.pdv_code || v.pdvCode || '';
        const pdvNeighborhood = v.pdv_neighborhood || v.pdvNeighborhood || 'Bamako';
        const vendorName = v.vendor_name || 'Vendeur';
        const vendorCode = v.vendor_code || v.vendor_id || '';
        const isCheckinMode = mapPreviewModal.mode === 'checkin_point';

        const googleMapsUrl =
          v.google_maps_url ||
          `https://www.google.com/maps/dir/?api=1&destination=${pdvLat},${pdvLng}&travelmode=driving`;
        const openStreetMapUrl =
          v.openstreetmap_url ||
          `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${pdvLat},${pdvLng}`;

        return (
          <FormModal
            title={
              isCheckinMode
                ? `Point de pointage GPS — ${pdvName} (${pdvCode})`
                : `Position validée du PDV — ${pdvName} (${pdvCode})`
            }
            subtitle={`Quartier : ${pdvNeighborhood} • Vendeur : ${vendorName} (${vendorCode}) • Distance au PDV : ${distanceM.toFixed(1)} m`}
            onClose={() => setMapPreviewModal(null)}
            footerContent={
              <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Google Maps</span>
                  </a>
                  <a
                    href={openStreetMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Compass className="w-4 h-4 shrink-0" />
                    <span>OpenStreetMap</span>
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setMapPreviewModal({
                        visit: v,
                        mode: isCheckinMode ? 'pdv_map' : 'checkin_point',
                      })
                    }
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-[#92400E] dark:text-amber-300 border border-[#92400E]/40 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Crosshair className="w-4 h-4 shrink-0" />
                    <span>
                      {isCheckinMode ? 'Voir sur la carte (PDV)' : 'Voir le point de pointage'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setMapPreviewModal(null)}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold inline-flex items-center justify-center cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Récapitulatif des coordonnées validées du PDV et de la position GPS du vendeur */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-[#15803D]/40 bg-emerald-50/40 dark:bg-emerald-950/30 space-y-1">
                  <div className="text-xs font-extrabold uppercase text-[#15803D] dark:text-emerald-400">
                    Position validée du PDV (Référence serveur)
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                    {pdvName} ({pdvCode})
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                    Lat : {pdvLat.toFixed(6)}° N • Lng : {pdvLng.toFixed(6)}° O
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[#92400E]/40 bg-amber-50/40 dark:bg-amber-950/30 space-y-1">
                  <div className="text-xs font-extrabold uppercase text-[#92400E] dark:text-amber-400">
                    Point de pointage GPS du vendeur
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                    {vendorName} ({vendorCode}) — Distance : {distanceM.toFixed(1)} m du PDV
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                    Lat : {vendorLat.toFixed(6)}° N • Lng : {vendorLng.toFixed(6)}° O (±
                    {gpsAccuracy.toFixed(1)} m)
                  </div>
                </div>
              </div>

              {/* Carte OpenStreetMap / Leaflet (aucune clé ni API payante) */}
              <OsmLeafletMap
                centerLat={isCheckinMode ? vendorLat : pdvLat}
                centerLng={isCheckinMode ? vendorLng : pdvLng}
                accuracy={gpsAccuracy}
                zoom={isCheckinMode ? 18 : 17}
                heightClassName="h-72 sm:h-80"
                label={`${pdvName} (${pdvCode})`}
                sublabel={`Position validée du PDV • Quartier : ${pdvNeighborhood}`}
                markers={[
                  {
                    id: String(v.pdv_id || 'pdv'),
                    lat: pdvLat,
                    lng: pdvLng,
                    accuracy: Number(v.pdv_gps_accuracy || 4.2),
                    title: `PDV validé : ${pdvName} (${pdvCode})`,
                    subtitle: `Quartier : ${pdvNeighborhood}`,
                    status: 'valide',
                    capturedAt: `${v.visit_date || v.visitDate || ''} ${v.visit_time || v.visitTime || ''}`,
                  },
                ]}
                vendorMarkers={
                  isCheckinMode
                    ? [
                        {
                          vendorId: String(v.vendor_id || 'vnd'),
                          vendorCode: String(vendorCode || 'VND'),
                          vendorName: String(vendorName),
                          lat: vendorLat,
                          lng: vendorLng,
                          accuracy: gpsAccuracy,
                          activityLabel: `Point de pointage à ${distanceM.toFixed(1)} m du PDV`,
                          recordedAt: String(v.server_recorded_at || v.visit_date || ''),
                        },
                      ]
                    : undefined
                }
                selectedId={isCheckinMode ? String(v.vendor_id || 'vnd') : String(v.pdv_id || 'pdv')}
              />
            </div>
          </FormModal>
        );
      })()}
    </div>
  );
};
