import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  MapPin,
  TrendingUp,
  Store,
  CheckCircle2,
  Lock,
  Clock,
  RefreshCw,
  PlusCircle,
  ShoppingBag,
  Navigation,
  Sparkles,
  Calendar,
  ArrowRight,
  Package,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { AdaptiveAmount } from '../utils/formatAmount';
import {
  VendorNoSaleMotifMessageBlock,
  MotifReactionRecord,
} from './VendorNoSaleMotifMessageBlock';
import { CartePdv, CartePdvAction } from './CartePdv';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';

export interface RoutineDayBlock {
  slotIndex?: number;
  date?: string;
  dayIndex: number;
  dayOfWeek?: number;
  dayName: string;
  shortName: string;
  status?: string;
  isSelected: boolean;
  isActiveDay?: boolean;
  isLocked: boolean;
  countedVisits?: number;
  pendingVisits?: number;
  contestedVisits?: number;
  totalVisits?: number;
  pdvCount: number;
  targetPdvCount: number;
  isTargetReached: boolean;
  isPastLockedAtMidnight?: boolean;
  isNextToUnlockAtMidnight?: boolean;
  lockedAtMidnightDate?: string | null;
  statusCode?: string;
  statusLabel: string;
}

export interface VendorDailyPerformanceData {
  serverDate: string;
  serverTime: string;
  period?: {
    startDate: string;
    endDate: string;
    isCustomPeriod: boolean;
    workingDaysCount: number;
    periodTargetPdv: number;
  };
  vendor: {
    id: string;
    name: string;
    code: string;
    team: string;
    phone: string;
  };
  availableVendors?: Array<{
    id: string;
    name: string;
    code: string;
    team: string;
    phone: string;
  }>;
  routineStatus: {
    vendorId: string;
    referenceDate: string;
    activeCycleId: string;
    stepNumber: number;
    activeDayIndex: number;
    activeDayName: string;
    routineName: string;
    activePdvCount: number;
    targetPdvCount: number;
    remainingForTarget: number;
    isTargetReachedToday: boolean;
    reachedTargetDate: string | null;
    nextDayIndex: number;
    nextDayName: string;
    totalRealizedPdvs: number;
    completedBatchesOf25: number;
    days: RoutineDayBlock[];
  };
  monthlyObjective?: {
    monthKey: string;
    year: number;
    month: number;
    monthLabel: string;
    workingDaysCount: number;
    defaultMonthlyTargetPdv: number;
    monthlyTargetPdv: number;
    realizedMonthlyPdv: number;
    progressPercent: number;
    validatedDaysCount: number;
    status: 'En cours' | 'Atteint' | 'Non atteint';
    isDefault: boolean;
    defaultBadgeLabel: string | null;
    routineName: string;
    isPastMonthLocked: boolean;
    assignedById: string | null;
    assignedByName: string | null;
    assignedByRole: string | null;
    assignedAt: string | null;
    updatedAt: string | null;
    correctionReason: string | null;
    history?: Array<{
      id: string;
      vendorId: string;
      vendorName: string;
      vendorCode: string;
      monthKey: string;
      targetPdvCount: number;
      previousTargetPdvCount: number | null;
      workingDaysCount: number;
      routineName: string;
      isPastMonthCorrection: boolean;
      correctionReason: string | null;
      assignedById: string;
      assignedByName: string;
      assignedByRole: string;
      createdAt: string;
    }>;
  };
  kpis: {
    dailyTargetPdv: number;
    realizedPdvCount: number;
    countedTowards25: number;
    remainingPdvForTarget: number;
    extraVisitsBeyond25: number;
    progressPercent: number;
    isTargetReachedToday: boolean;
    activeRoutineName: string;
    activeDayName: string;
    activeDayIndex: number;
    nextDayName: string;
    completedBatchesOf25: number;
    totalRealizedPdvsAllCycles: number;
    totalVisitsToday: number;
    uniquePdvsVisitedToday: number;
    pdvsCreatedTodayCount: number;
    lastVisitTime: string | null;
    lastVisitedPdvName: string | null;
    lastVisitedPdvNeighborhood: string | null;
    salesCountToday: number;
    salesRevenueToday: number;
    salesCartonsToday: number;
    averageBasketToday: number;
    wholesaleDiscountToday: number;
    uniquePdvsSoldToday: number;
    conversionRatePercent: number;
    lastSaleTime: string | null;
    lastSalePdvName: string | null;
    lastSaleAmount: number;
    monthlyObjective?: VendorDailyPerformanceData['monthlyObjective'];
    monthlyTargetPdv?: number;
    realizedMonthlyPdv?: number;
    monthlyProgressPercent?: number;
    monthlyValidatedDaysCount?: number;
    monthlyWorkingDaysCount?: number;
    monthlyStatus?: 'En cours' | 'Atteint' | 'Non atteint';
    monthlyIsDefault?: boolean;
    monthlyMonthKey?: string;
    monthlyMonthLabel?: string;
  };
  paymentBreakdown: Array<{
    paymentType: string;
    count: number;
    amount: number;
    sharePercent: number;
  }>;
  visitsList: Array<{
    id: string;
    visitUuid: string;
    visitDate: string;
    visitTime: string;
    pdvId: string;
    pdvName: string;
    pdvCode: string;
    pdvNeighborhood: string;
    pdvManagerName: string;
    pdvStatus: string;
    routineName: string;
    routineDay: string;
    latitude: number;
    longitude: number;
    gpsAccuracy: number;
    distanceM: number;
    isCounted: boolean;
    statusReason: string;
    deviceInfo: string;
    hasSaleToday: boolean;
    visitType?: string;
    visitCategory?: 'avec_vente' | 'sans_vente' | 'a_visiter';
    routineDayVisitsCount?: number;
    todayVisitsCount?: number;
    noSaleReason?: string | null;
    vendorId?: string | null;
    vendorName?: string | null;
    vendorCode?: string | null;
    motifReactionStatus?: 'accepted' | 'contested' | null;
    motifReactionComment?: string | null;
    motifReactedBy?: string | null;
    motifReactedRole?: string | null;
    motifReactedAt?: string | null;
    motifReactionsHistory?: MotifReactionRecord[];
    validationStatus?: 'valide' | 'soumis';
    validatedBy?: string | null;
  }>;
  salesList: Array<{
    id: string;
    number: string;
    thermalTicketNumber: string;
    date: string;
    saleTime: string;
    pdvId: string;
    pdvName: string;
    pdvCode: string;
    pdvNeighborhood: string;
    pdvManagerName: string;
    routineName?: string;
    routineDay?: string;
    totalAmount: number;
    cartonsCount: number;
    wholesaleDiscountAmount: number;
    buyerType: string;
    paymentType: string;
    status: string;
    recordedOffline: boolean;
    items: Array<{
      name?: string;
      code?: string;
      quantity?: number;
      qtyBoxes?: number;
      price?: number;
      unitPrice?: number;
      total?: number;
    }>;
  }>;
  perimeterPdvs: Array<{
    id: string;
    code: string;
    name: string;
    managerName: string;
    neighborhood: string;
    phone: string;
    status: string;
    latitude: number;
    longitude: number;
    routineName: string;
    routineDay: string;
    routineDayIndex?: number;
    visitedToday: boolean;
    soldToday: boolean;
    hasSaleToday?: boolean;
    salesCountToday?: number;
    createdToday: boolean;
    visitCategory?: 'avec_vente' | 'sans_vente' | 'a_visiter';
    visitedEver?: boolean;
    hasAnySale?: boolean;
    noSaleReason?: string | null;
    visitId?: string | null;
    visitTime?: string | null;
    visitDate?: string | null;
    vendorId?: string | null;
    vendorName?: string | null;
    vendorCode?: string | null;
    motifReactionStatus?: 'accepted' | 'contested' | null;
    motifReactionComment?: string | null;
    motifReactedBy?: string | null;
    motifReactedRole?: string | null;
    motifReactedAt?: string | null;
    motifReactionsHistory?: MotifReactionRecord[];
    visitValidationStatus?: 'valide' | 'soumis';
    validatedBy?: string | null;
    routineDayVisitsCount?: number;
    todayVisitsCount?: number;
    totalVisitsCount?: number;
    totalSalesCount?: number;
    totalNoSaleVisitsCount?: number;
    todaySalesCount?: number;
    todaySalesAmount?: number;
    todayCartonsCount?: number;
    todaySales?: Array<{
      id: string;
      number: string;
      date: string;
      saleTime: string;
      totalAmount: number;
      cartonsCount: number;
      items: Array<{ name?: string; qtyBoxes?: number; quantity?: number }>;
    }>;
  }>;
  recentSalesByDay: Array<{
    date: string;
    sales_count: number;
    revenue: number;
    cartons: number;
  }>;
}

interface VendorPerformanceKpiDashboardProps {
  vendorId: string;
  vendorName: string;
  vendorRole: string;
  onNavigateTab?: (tab: string) => void;
  onOpenNewPdvModal?: () => void;
  compact?: boolean;
  externalRefreshTrigger?: number;
  vanStockBoxes?: number;
  balanceDueFCFA?: number;
  hideCreationActions?: boolean;
}

const DEFAULT_WEEK_DAYS: RoutineDayBlock[] = [
  {
    dayIndex: 1,
    dayName: 'Lundi',
    shortName: 'Lun',
    date: '2026-11-23',
    status: 'Disponible',
    isSelected: true,
    isLocked: false,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'disponible',
    statusLabel: 'Disponible',
  },
  {
    dayIndex: 2,
    dayName: 'Mardi',
    shortName: 'Mar',
    date: '2026-11-24',
    status: 'Bloqué',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 3,
    dayName: 'Mercredi',
    shortName: 'Mer',
    date: '2026-11-25',
    status: 'Bloqué',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 4,
    dayName: 'Jeudi',
    shortName: 'Jeu',
    date: '2026-11-26',
    status: 'Bloqué',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 5,
    dayName: 'Vendredi',
    shortName: 'Ven',
    date: '2026-11-27',
    status: 'Bloqué',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 6,
    dayName: 'Samedi',
    shortName: 'Sam',
    date: '2026-11-28',
    status: 'Bloqué',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
];

export const VendorPerformanceKpiDashboard: React.FC<VendorPerformanceKpiDashboardProps> = ({
  vendorId,
  vendorName,
  vendorRole,
  onNavigateTab,
  onOpenNewPdvModal,
  compact = false,
  externalRefreshTrigger = 0,
  vanStockBoxes,
  balanceDueFCFA,
  hideCreationActions = false,
}) => {
  const isVendeurRole = vendorRole === 'Vendeur';
  const canValidateOrAssignObjective =
    !isVendeurRole &&
    (vendorRole === 'Administrateur' ||
      vendorRole === 'Directeur des opérations de vente' ||
      vendorRole === 'Sales Admin / Contrôleur');
  const showCreationActions = !hideCreationActions && isVendeurRole;
  const [selectedVendorId, setSelectedVendorId] = useState<string>(vendorId || 'usr-vnd-1');
  const [data, setData] = useState<VendorDailyPerformanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [liveTimeStr, setLiveTimeStr] = useState<string>('');
  const [selectedPdvIdForVisit, setSelectedPdvIdForVisit] = useState<string>('');
  const [quickRoutineName, setQuickRoutineName] = useState<string>('');
  const [quickNoSaleReason, setQuickNoSaleReason] = useState<string>('');
  const [checkingInVisit, setCheckingInVisit] = useState<boolean>(false);
  const [validatingItemId, setValidatingItemId] = useState<string | null>(null);
  const [validatedPdvIds, setValidatedPdvIds] = useState<Record<string, boolean>>({});
  const [objectiveTargetInput, setObjectiveTargetInput] = useState<number>(625);
  const [objectiveMonthKeyInput, setObjectiveMonthKeyInput] = useState<string>('2026-11');
  const [objectiveCorrectionReasonInput, setObjectiveCorrectionReasonInput] = useState<string>('');
  const [savingObjective, setSavingObjective] = useState<boolean>(false);
  const [objectiveFeedback, setObjectiveFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [checkinFeedback, setCheckinFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (vendorId) {
      setSelectedVendorId(vendorId);
    }
  }, [vendorId]);

  const getLocalTodayStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const fetchPerformance = useCallback(
    async (isSilent = false) => {
      if (!isSilent) {
        setRefreshing(true);
      }
      try {
        const clientDate = getLocalTodayStr();
        const targetVendorId = selectedVendorId || vendorId || 'usr-vnd-1';
        const res = await fetch(
          `/api/vendor/daily-performance?vendor_id=${encodeURIComponent(
            targetVendorId
          )}&client_date=${encodeURIComponent(clientDate)}`,
          {
            headers: {
              'x-user-id': targetVendorId,
              'x-user-role': vendorRole || 'Vendeur',
            },
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.success) {
            setData(json);
            if (json.vendor?.id && json.vendor.id !== selectedVendorId) {
              setSelectedVendorId(json.vendor.id);
            }
            const defaultRoutineLabel =
              json.kpis?.activeRoutineName ||
              json.routineStatus?.routineName ||
              `Routine ${json.kpis?.activeDayName || 'Vendredi'} - ${json.vendor?.name || vendorName}`;
            setQuickRoutineName((prev) => prev || defaultRoutineLabel);
            const mObj = json.monthlyObjective || json.kpis?.monthlyObjective;
            if (mObj?.monthlyTargetPdv) {
              setObjectiveTargetInput(Math.max(25, Number(mObj.monthlyTargetPdv) || 625));
            }
            if (mObj?.monthKey) {
              setObjectiveMonthKeyInput((prev) => prev || String(mObj.monthKey));
            }
            if (Array.isArray(json.perimeterPdvs) && json.perimeterPdvs.length > 0) {
              const validList = json.perimeterPdvs.filter((p: any) => p.status === 'valide');
              const pool = validList.length > 0 ? validList : json.perimeterPdvs;
              setSelectedPdvIdForVisit((prev) => {
                if (prev && pool.some((p: any) => p.id === prev)) {
                  return prev;
                }
                const firstUnvisited = pool.find((p: any) => !p.visitedToday);
                return firstUnvisited ? firstUnvisited.id : pool[0].id;
              });
            }
          }
        }
      } catch {
        // Silent network fallback
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedVendorId, vendorId, vendorRole, vendorName]
  );

  // Chargement initial + polling temps réel toutes les 5 secondes + écoute des validations PDV
  useEffect(() => {
    fetchPerformance(false);
    const interval = setInterval(() => {
      fetchPerformance(true);
    }, 5000);
    const onPdvsUpdated = () => {
      fetchPerformance(true);
    };
    window.addEventListener('baobab-pdvs-updated', onPdvsUpdated);
    window.addEventListener('baobab-pdv-visits-updated', onPdvsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('baobab-pdvs-updated', onPdvsUpdated);
      window.removeEventListener('baobab-pdv-visits-updated', onPdvsUpdated);
    };
  }, [fetchPerformance, externalRefreshTrigger]);

  // Horloge en direct
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setLiveTimeStr(`${hh}:${mm}:${ss}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmitVisitForPdv = async (targetPdvId?: string) => {
    const effectivePdvId = targetPdvId || selectedPdvIdForVisit;
    if (!effectivePdvId || checkingInVisit) return;
    const trimmedReason = quickNoSaleReason.trim();
    if (trimmedReason.length < 3) {
      setCheckinFeedback({
        type: 'error',
        text: "Le motif est obligatoire pour une visite sans vente (soumis au DOV, à l'Administrateur et au Sales Admin).",
      });
      return;
    }
    setCheckingInVisit(true);
    setCheckinFeedback(null);
    try {
      const clientDate = getLocalTodayStr();
      const targetVendorId = data?.vendor?.id || selectedVendorId || vendorId || 'usr-vnd-1';
      const res = await fetch('/api/vendor/daily-performance/checkin-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': targetVendorId,
          'x-user-role': vendorRole || 'Vendeur',
        },
        body: JSON.stringify({
          vendor_id: targetVendorId,
          pdv_id: effectivePdvId,
          visit_mode: 'sans_vente',
          visit_type: 'sans_vente',
          no_sale_reason: trimmedReason,
          routine_name:
            quickRoutineName.trim() ||
            data?.kpis?.activeRoutineName ||
            `Routine ${data?.kpis?.activeDayName || 'Lundi'}`,
          client_date: clientDate,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setData(json);
        setQuickNoSaleReason('');
        setCheckinFeedback({
          type: json.alreadyVisitedToday ? 'info' : 'success',
          text: json.message || 'Déclaration de visite soumise avec succès.',
        });
        window.dispatchEvent(new Event('baobab-pdv-visits-updated'));
        window.dispatchEvent(new Event('baobab-notifications-updated'));
      } else {
        setCheckinFeedback({
          type: 'error',
          text: json?.error || 'Impossible de soumettre la visite PDV.',
        });
      }
    } catch {
      setCheckinFeedback({
        type: 'error',
        text: 'Erreur réseau lors de la soumission de la visite PDV.',
      });
    } finally {
      setCheckingInVisit(false);
    }
  };

  // Validation d'une visite / d'un PDV par l'Administrateur, le DOV ou le Sales Admin / Contrôleur (jamais par le Vendeur)
  const handleAdminOrDovValidateVisit = async (params: { visitId?: string | null; pdvId?: string }) => {
    if (!canValidateOrAssignObjective || validatingItemId) return;
    const key = String(params.visitId || params.pdvId || 'val');
    setValidatingItemId(key);
    setCheckinFeedback(null);
    try {
      const clientDate = getLocalTodayStr();
      const targetVendorId = data?.vendor?.id || selectedVendorId || vendorId || 'usr-vnd-1';
      const res = await fetch('/api/vendor/daily-performance/validate-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': vendorRole,
        },
        body: JSON.stringify({
          vendor_id: targetVendorId,
          visit_id: params.visitId || undefined,
          pdv_id: params.pdvId || undefined,
          client_date: clientDate,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        if (params.pdvId) {
          setValidatedPdvIds((prev) => ({ ...prev, [String(params.pdvId)]: true }));
        }
        if (params.visitId) {
          setValidatedPdvIds((prev) => ({ ...prev, [String(params.visitId)]: true }));
        }
        setData(json);
        setCheckinFeedback({
          type: 'success',
          text: json.message || 'Visite validée par la supervision.',
        });
        window.dispatchEvent(new Event('baobab-notifications-updated'));
        window.dispatchEvent(new Event('baobab-pdvs-updated'));
      } else {
        setCheckinFeedback({
          type: 'error',
          text: json?.error || 'Impossible de valider cette visite.',
        });
      }
    } catch {
      setCheckinFeedback({
        type: 'error',
        text: 'Erreur réseau lors de la validation.',
      });
    } finally {
      setValidatingItemId(null);
    }
  };

  // Attribution de l'objectif MENSUEL de routine (par vendeur et par mois, min 25 PDV) par Admin, DOV ou Sales Admin / Contrôleur
  const handleAssignRoutineObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canValidateOrAssignObjective || savingObjective) return;
    const targetNum = Math.round(Number(objectiveTargetInput) || 25);
    if (targetNum < 25) {
      setObjectiveFeedback({
        type: 'error',
        text: "L'objectif mensuel attribué au vendeur doit être d'au moins 25 PDV minimum.",
      });
      return;
    }
    const currentServerMonth = String(
      data?.monthlyObjective?.monthKey ||
        data?.kpis?.monthlyMonthKey ||
        data?.serverDate?.slice(0, 7) ||
        '2026-11'
    );
    const targetMonthKey = objectiveMonthKeyInput || currentServerMonth;
    const isPastMonth = targetMonthKey < currentServerMonth;
    if (isPastMonth && vendorRole !== 'Administrateur') {
      setObjectiveFeedback({
        type: 'error',
        text: 'Ce mois passé est verrouillé : seul l’Administrateur peut effectuer une correction motivée.',
      });
      return;
    }
    if (isPastMonth && vendorRole === 'Administrateur' && objectiveCorrectionReasonInput.trim().length < 3) {
      setObjectiveFeedback({
        type: 'error',
        text: 'Le motif de correction est obligatoire pour modifier un mois passé verrouillé.',
      });
      return;
    }

    setSavingObjective(true);
    setObjectiveFeedback(null);
    try {
      const clientDate = getLocalTodayStr();
      const targetVendorId = data?.vendor?.id || selectedVendorId || vendorId || 'usr-vnd-1';
      const res = await fetch('/api/vrs/monthly-objectives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': vendorRole,
        },
        body: JSON.stringify({
          vendor_ids: [targetVendorId],
          month_key: targetMonthKey,
          target_pdv_count: targetNum,
          routine_name:
            quickRoutineName.trim() ||
            data?.monthlyObjective?.routineName ||
            data?.kpis?.activeRoutineName ||
            `Routine VRS ${targetMonthKey}`,
          correction_reason: isPastMonth ? objectiveCorrectionReasonInput.trim() : undefined,
          reference_date: clientDate,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        await fetchPerformance(true);
        setObjectiveCorrectionReasonInput('');
        setObjectiveFeedback({
          type: 'success',
          text: json.message || `Objectif du mois (${targetMonthKey}) fixé à ${targetNum} PDV.`,
        });
      } else {
        setObjectiveFeedback({
          type: 'error',
          text: json?.error || "Impossible d'enregistrer l'objectif mensuel.",
        });
      }
    } catch {
      setObjectiveFeedback({
        type: 'error',
        text: "Erreur réseau lors de l'attribution de l'objectif mensuel.",
      });
    } finally {
      setSavingObjective(false);
    }
  };

  // Ouvre l'écran Nouvelle Vente en activant automatiquement le PDV sélectionné de la routine du jour actif
  const handleOpenSaleForRoutinePdv = (pdvId: string) => {
    try {
      localStorage.setItem('baobab_preselected_sale_pdv_id', pdvId);
      window.dispatchEvent(
        new CustomEvent('baobab-open-sale-for-pdv', { detail: { pdvId } })
      );
    } catch {
      // ignore storage errors
    }
    if (onNavigateTab) {
      onNavigateTab('nouvelle-vente');
    }
  };

  const kpis: VendorDailyPerformanceData['kpis'] = data?.kpis || {
    dailyTargetPdv: 25,
    realizedPdvCount: 0,
    countedTowards25: 0,
    remainingPdvForTarget: 25,
    extraVisitsBeyond25: 0,
    progressPercent: 0,
    isTargetReachedToday: false,
    activeRoutineName: 'Routine Lundi',
    activeDayName: 'Lundi',
    activeDayIndex: 1,
    nextDayName: 'Mardi',
    completedBatchesOf25: 0,
    totalRealizedPdvsAllCycles: 0,
    totalVisitsToday: 0,
    uniquePdvsVisitedToday: 0,
    pdvsCreatedTodayCount: 0,
    lastVisitTime: null,
    lastVisitedPdvName: null,
    lastVisitedPdvNeighborhood: null,
    salesCountToday: 0,
    salesRevenueToday: 0,
    salesCartonsToday: 0,
    averageBasketToday: 0,
    wholesaleDiscountToday: 0,
    uniquePdvsSoldToday: 0,
    conversionRatePercent: 0,
    lastSaleTime: null,
    lastSalePdvName: null,
    lastSaleAmount: 0,
  };

  const countedVisitsCount = Number(
    (kpis as any).countedVisitsCount ??
      (data?.routineStatus as any)?.countedVisitsCount ??
      kpis.realizedPdvCount ??
      0
  );
  const pendingVisitsCount = Number(
    (kpis as any).pendingVisitsCount ?? (data?.routineStatus as any)?.pendingVisitsCount ?? 0
  );
  const contestedVisitsCount = Number(
    (kpis as any).contestedVisitsCount ?? (data?.routineStatus as any)?.contestedVisitsCount ?? 0
  );
  const routineCycleStatus = String(
    (data?.routineStatus as any)?.cycleStatus || 'Disponible'
  );
  const completionMessage = (data?.routineStatus as any)?.completionMessage || null;

  const days = data?.routineStatus?.days || DEFAULT_WEEK_DAYS;
  const visitsList = data?.visitsList || [];
  const salesList = data?.salesList || [];
  const paymentBreakdown = data?.paymentBreakdown || [];
  const perimeterPdvs = data?.perimeterPdvs || [];
  const validatedRoutinePdvs = perimeterPdvs.filter((p) => p.status !== 'rejete');
  const validatedWithSaleCount = validatedRoutinePdvs.filter(
    (p) => p.visitCategory === 'avec_vente' || p.soldToday
  ).length;
  const validatedWithoutSaleCount = validatedRoutinePdvs.filter(
    (p) => p.visitCategory === 'sans_vente'
  ).length;
  const defaultRoutineFullLineName =
    quickRoutineName.trim() ||
    kpis.activeRoutineName ||
    data?.routineStatus?.routineName ||
    `Routine ${kpis.activeDayName} — ${data?.vendor?.name || vendorName}`;

  // Mode compact pour affichage en haut de la vue Points de Vente (PdvView)
  if (compact) {
    return (
      <div className="@container w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-gradient-to-br from-white via-teal-50/30 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-black uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
              <span>Tableau de Bord de Performance (KPI) Vendeur</span>
            </span>
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              {data?.vendor?.name || vendorName} • Journée du {data?.serverDate || getLocalTodayStr()} ({kpis.activeDayName})
            </span>
            {kpis.activeRoutineName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 text-[11px] font-bold">
                Routine : {kpis.activeRoutineName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {vendorRole !== 'Vendeur' &&
              data?.availableVendors &&
              data.availableVendors.length > 1 && (
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs cursor-pointer"
                  aria-label="Sélectionner le vendeur"
                >
                  {data.availableVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              )}
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-bold">
              <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>{liveTimeStr}</span>
              <span className="text-slate-400">•</span>
              <span className="text-[11px] text-teal-700 dark:text-teal-300">
                Statut : {routineCycleStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 @[700px]:grid-cols-3 gap-3 min-w-0">
          {/* 1. Objectif du mois + Objectif 25 PDV / jour */}
          <div className="min-w-0 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
            {(() => {
              const mObj = data?.monthlyObjective || kpis.monthlyObjective;
              const mTarget = Number(mObj?.monthlyTargetPdv ?? kpis.monthlyTargetPdv ?? 625);
              const mRealized = Number(mObj?.realizedMonthlyPdv ?? kpis.realizedMonthlyPdv ?? countedVisitsCount);
              const mPct = Math.min(100, Math.round((mRealized / Math.max(1, mTarget)) * 100));
              const mIsDef = mObj?.isDefault ?? kpis.monthlyIsDefault ?? true;
              const mValDays = Number(mObj?.validatedDaysCount ?? kpis.monthlyValidatedDaysCount ?? 0);
              const mWorkDays = Number(mObj?.workingDaysCount ?? kpis.monthlyWorkingDaysCount ?? 25);
              const mStatus = mObj?.status ?? kpis.monthlyStatus ?? 'En cours';
              return (
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      Objectif du mois : {mTarget} PDV
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {mIsDef && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-extrabold">
                          Objectif par défaut
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black text-white ${
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
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        mStatus === 'Atteint' ? 'bg-[#15803D]' : 'bg-[#006D77]'
                      }`}
                      style={{ width: `${mPct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <span>
                      Réalisé : {mRealized} / {mTarget} PDV ({mPct}%)
                    </span>
                    <span>
                      Jours validés : {mValDays} / {mWorkDays} j ouvrés
                    </span>
                  </div>
                </div>
              );
            })()}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  Jour actif ({kpis.activeDayName})
                </span>
                <span
                  className={`text-xs font-black px-2 py-0.5 rounded-md whitespace-nowrap ${
                    kpis.isTargetReachedToday
                      ? 'bg-[#15803D] text-white'
                      : 'bg-[#006D77] text-white'
                  }`}
                >
                  {countedVisitsCount} / {kpis.dailyTargetPdv} PDV ({kpis.progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-300 ${
                    kpis.isTargetReachedToday ? 'bg-[#15803D]' : 'bg-[#006E87]'
                  }`}
                  style={{ width: `${kpis.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* 2. Décompte unifié des visites */}
          <div className="min-w-0 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
              Décompte des visites ({kpis.activeDayName})
            </span>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="px-2 py-0.5 rounded bg-[#15803D] text-white text-[11px] font-bold">
                Visites comptées : {countedVisitsCount}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#92400E] text-white text-[11px] font-bold">
                En attente de validation : {pendingVisitsCount}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#B91C1C] text-white text-[11px] font-bold">
                Contestées : {contestedVisitsCount}
              </span>
            </div>
          </div>

          {/* 3. Ventes réalisées sur la journée en cours */}
          <div className="min-w-0 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
              Ventes réalisées (Journée en cours)
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-1.5 mt-1">
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                {kpis.salesRevenueToday.toLocaleString('fr-FR')}{' '}
                <span className="text-xs font-bold">FCFA</span>
              </span>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {kpis.salesCountToday} vente(s) • {kpis.salesCartonsToday} cartons
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Taux de transformation : {kpis.conversionRatePercent}% • Panier moyen :{' '}
              {kpis.averageBasketToday.toLocaleString('fr-FR')} FCFA
            </span>
          </div>
        </div>

        {/* Jours de la semaine (Lundi à Samedi — Dimanche exclu) avec date et statuts */}
        <div className="pt-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              Semaine de routine (Lundi à Samedi — Dimanche exclu)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 @[720px]:grid-cols-6 gap-2 min-w-0">
            {days.map((d) => {
              const dayStatus = String(d.status || d.statusLabel || 'Bloqué');
              const isValide = dayStatus === 'Validé' || d.isTargetReached;
              const isEnCours = dayStatus === 'En cours';
              const isDisponible = dayStatus === 'Disponible';
              const isIncomplet = dayStatus === 'Incomplet';
              const isBloque = !isValide && !isEnCours && !isDisponible && !isIncomplet;

              const badgeStyle = isValide
                ? 'bg-[#15803D] text-white'
                : isEnCours
                ? 'bg-[#92400E] text-white'
                : isIncomplet
                ? 'bg-[#B91C1C] text-white'
                : isDisponible
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700 text-white';

              return (
                <div
                  key={d.dayIndex}
                  className={`min-w-0 rounded-xl px-2 py-2 border text-center transition flex flex-col items-center justify-between min-h-[82px] ${
                    isValide
                      ? 'border-2 border-[#15803D] bg-emerald-50 dark:bg-emerald-950/50'
                      : isEnCours || isDisponible
                      ? 'border-2 border-[#006D77] bg-teal-50/90 dark:bg-teal-950/60'
                      : isIncomplet
                      ? 'border-2 border-[#B91C1C] bg-red-50/80 dark:bg-red-950/40'
                      : 'border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50'
                  }`}
                >
                  <div className="w-full min-w-0 text-center">
                    <span className="block w-full text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                      {d.dayName}
                    </span>
                    {d.date && (
                      <span className="block w-full text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight mt-0.5">
                        {d.date}
                      </span>
                    )}
                  </div>

                  <div className="inline-flex items-center justify-center gap-1 text-xs font-black font-mono text-slate-900 dark:text-white my-1">
                    {isBloque || isValide ? (
                      <Lock className="w-3 h-3 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#006D77] shrink-0" />
                    )}
                    <span>
                      {d.countedVisits ?? d.pdvCount ?? 0}/{d.targetPdvCount ?? 25}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center justify-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md w-full text-center leading-tight ${badgeStyle}`}
                  >
                    {isBloque && <Lock className="w-2.5 h-2.5 shrink-0" />}
                    <span>{dayStatus}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="@container w-full max-w-full min-w-0 rounded-3xl border-2 border-teal-600/30 dark:border-teal-500/30 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* BANDEAU D'EN-TÊTE TEMPS RÉEL */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-[#004E60] via-[#006E87] to-[#008DA9] text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Temps Réel • Journée en cours
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 text-white text-xs font-bold">
                <Calendar className="w-3.5 h-3.5" />
                {kpis.activeDayName} ({data?.serverDate || getLocalTodayStr()})
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 text-white text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                {liveTimeStr}
              </span>
              {kpis.activeRoutineName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 text-xs font-black">
                  Routine : {kpis.activeRoutineName}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
              Tableau de Bord de Performance (KPI) Vendeur — {data?.vendor?.name || vendorName}
            </h2>
            <p className="text-xs text-teal-100">
              Suivi en direct de votre objectif de 25 PDV/jour (Lundi à Samedi, bascule automatique à
              00h00), des visites effectuées et des ventes réalisées aujourd&apos;hui.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {vendorRole !== 'Vendeur' &&
              data?.availableVendors &&
              data.availableVendors.length > 1 && (
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-white/15 text-white border border-white/25 font-bold text-xs cursor-pointer"
                  aria-label="Sélectionner le vendeur"
                >
                  {data.availableVendors.map((v) => (
                    <option key={v.id} value={v.id} className="text-slate-900">
                      {v.name} ({v.code})
                    </option>
                  ))}
                </select>
              )}
            {showCreationActions && onNavigateTab && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onOpenNewPdvModal ? onOpenNewPdvModal() : onNavigateTab('nouveau-pdv')
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white text-[#00586B] hover:bg-teal-50 font-extrabold text-xs shadow-xs transition cursor-pointer"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>+ Créer un PDV ({kpis.activeDayName})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('nouvelle-vente')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>+ Nouvelle vente</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fetchPerformance(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition cursor-pointer"
              title="Actualiser les indicateurs en temps réel"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Sync...' : 'Actualiser'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CORPS DU TABLEAU DE BORD KPI VENDEUR */}
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* LES 3 PILIERS KPI TEMPS RÉEL DEMANDÉS :
            - Ligne 1 : Pilier 1 (50%) & Pilier 2 (50%) avec un large espace de manœuvre
            - Ligne 2 (pleine largeur) : Pilier 3 (3. Ventes du jour • En direct — CA & Livraisons du jour) */}
        <div className="grid grid-cols-1 @[760px]:grid-cols-2 @[1120px]:grid-cols-12 gap-4 sm:gap-5 min-w-0">
          {/* =================================================================
              PILIER 1 : OBJECTIF DE 25 PDV PAR JOUR + PETITS BLOCS LUNDI..SAMEDI
          ================================================================== */}
          <div className="min-w-0 @[1120px]:col-span-6 rounded-2xl border-2 border-teal-600/30 dark:border-teal-500/30 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 sm:p-5 flex flex-col justify-between gap-3.5 overflow-hidden">
            <div className="space-y-3 min-w-0">
              {/* OBJECTIF DU MOIS : X PDV (au-dessus de la progression du jour actif X / 25) */}
              {(() => {
                const mObj = data?.monthlyObjective || kpis.monthlyObjective;
                const mTarget = Number(mObj?.monthlyTargetPdv ?? kpis.monthlyTargetPdv ?? 625);
                const mRealized = Number(mObj?.realizedMonthlyPdv ?? kpis.realizedMonthlyPdv ?? countedVisitsCount);
                const mPct = Math.min(100, Math.round((mRealized / Math.max(1, mTarget)) * 100));
                const mIsDef = mObj?.isDefault ?? kpis.monthlyIsDefault ?? true;
                const mValDays = Number(mObj?.validatedDaysCount ?? kpis.monthlyValidatedDaysCount ?? 0);
                const mWorkDays = Number(mObj?.workingDaysCount ?? kpis.monthlyWorkingDaysCount ?? 25);
                const mStatus = mObj?.status ?? kpis.monthlyStatus ?? 'En cours';
                const mLabel = mObj?.monthLabel ?? kpis.monthlyMonthLabel ?? 'Novembre 2026';
                return (
                  <div className="p-3 rounded-xl border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 block">
                          Objectif Mensuel ({mLabel})
                        </span>
                        <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                          Objectif du mois : {mTarget} PDV
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mIsDef && (
                          <span className="px-2.5 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold">
                            Objectif par défaut
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-black text-white ${
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
                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          mStatus === 'Atteint' ? 'bg-[#15803D]' : 'bg-[#006D77]'
                        }`}
                        style={{ width: `${mPct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>
                        Réalisé (visites comptées) :{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {mRealized} / {mTarget} PDV ({mPct}%)
                        </strong>
                      </span>
                      <span>
                        Jours validés :{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {mValDays} / {mWorkDays} jours ouvrés
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                    <Target className="w-4 h-4 shrink-0" />
                    <span>Progression du jour actif • 25 PDV / Jour</span>
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5 leading-snug [overflow-wrap:anywhere]">
                    Jour actif : {kpis.activeDayName}{' '}
                    {kpis.activeRoutineName ? `• « ${kpis.activeRoutineName} »` : ''}
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black shrink-0 whitespace-nowrap ${
                    kpis.isTargetReachedToday
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#006E87] text-white'
                  }`}
                >
                  {kpis.realizedPdvCount} / {kpis.dailyTargetPdv} PDV ({kpis.progressPercent}%)
                </span>
              </div>

              {/* Jauge visuelle 25 PDV */}
              <div className="space-y-1.5 min-w-0">
                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      kpis.isTargetReachedToday
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-r from-[#00586B] to-[#008DA9]'
                    }`}
                    style={{ width: `${kpis.progressPercent}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  {kpis.isTargetReachedToday ? (
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Objectif 25 PDV atteint ! ({kpis.realizedPdvCount} PDV)</span>
                    </span>
                  ) : (
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Encore{' '}
                      <strong className="text-teal-700 dark:text-teal-400 font-black">
                        {kpis.remainingPdvForTarget} PDV
                      </strong>{' '}
                      pour atteindre les 25 PDV
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300">
                    Statut : {routineCycleStatus}
                  </span>
                </div>
              </div>

              {/* 6 jours de la semaine (Lundi à Samedi, Dimanche exclu) avec leur date et statuts */}
              <div className="pt-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                    Semaine de routine (Lundi à Samedi • Dimanche exclu)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
                  {days.map((d) => {
                    const dayStatus = String(d.status || d.statusLabel || 'Bloqué');
                    const isValide = dayStatus === 'Validé' || d.isTargetReached;
                    const isEnCours = dayStatus === 'En cours';
                    const isDisponible = dayStatus === 'Disponible';
                    const isIncomplet = dayStatus === 'Incomplet';
                    const isBloque = !isValide && !isEnCours && !isDisponible && !isIncomplet;

                    const badgeStyle = isValide
                      ? 'bg-[#15803D] text-white'
                      : isEnCours
                      ? 'bg-[#92400E] text-white'
                      : isIncomplet
                      ? 'bg-[#B91C1C] text-white'
                      : isDisponible
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-700 text-white';

                    return (
                      <div
                        key={d.dayIndex}
                        className={`min-w-0 rounded-xl px-2 py-2 border text-center transition flex flex-col items-center justify-between min-h-[82px] ${
                          isValide
                            ? 'border-2 border-[#15803D] bg-emerald-50 dark:bg-emerald-950/50'
                            : isEnCours || isDisponible
                            ? 'border-2 border-[#006D77] bg-teal-50/90 dark:bg-teal-950/60'
                            : isIncomplet
                            ? 'border-2 border-[#B91C1C] bg-red-50/80 dark:bg-red-950/40'
                            : 'border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50'
                        }`}
                      >
                        <div className="w-full min-w-0 text-center">
                          <span className="block w-full text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                            {d.dayName}
                          </span>
                          {d.date && (
                            <span className="block w-full text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight mt-0.5">
                              {d.date}
                            </span>
                          )}
                        </div>

                        <div className="inline-flex items-center justify-center gap-1 text-xs font-black font-mono text-slate-900 dark:text-white my-1">
                          {isBloque || isValide ? (
                            <Lock className="w-3 h-3 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#006D77] shrink-0" />
                          )}
                          <span>
                            {d.countedVisits ?? d.pdvCount ?? 0}/{d.targetPdvCount ?? 25}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center justify-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md w-full text-center leading-tight ${badgeStyle}`}
                        >
                          {isBloque && <Lock className="w-2.5 h-2.5 shrink-0" />}
                          <span>{dayStatus}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Attribution de l'objectif mensuel uniquement visible pour les superviseurs (jamais pour le Vendeur) */}
            {canValidateOrAssignObjective && (
              <div className="p-3 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-white dark:bg-slate-900 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-black text-teal-800 dark:text-teal-300 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Attribuer objectif mensuel (Min. 25 PDV)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 text-xs font-black">
                    Actuel : {Number(data?.monthlyObjective?.monthlyTargetPdv ?? kpis.monthlyTargetPdv ?? 625)} PDV / mois
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
                      Mois
                    </label>
                    <input
                      type="month"
                      value={objectiveMonthKeyInput}
                      onChange={(e) => setObjectiveMonthKeyInput(e.target.value)}
                      className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
                      Objectif mensuel (≥ 25 PDV)
                    </label>
                    <input
                      type="number"
                      min={25}
                      value={objectiveTargetInput}
                      onChange={(e) =>
                        setObjectiveTargetInput(Math.max(25, Number(e.target.value || 25)))
                      }
                      className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
                      Nom de la routine
                    </label>
                    <input
                      type="text"
                      value={quickRoutineName}
                      onChange={(e) => setQuickRoutineName(e.target.value)}
                      placeholder="Routine VRS"
                      className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-end">
                    <button
                      type="button"
                      onClick={handleAssignRoutineObjective}
                      disabled={savingObjective}
                      className="w-full min-h-[48px] py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-extrabold transition cursor-pointer"
                    >
                      {savingObjective ? 'Attribution...' : 'Attribuer'}
                    </button>
                  </div>
                </div>
                {objectiveMonthKeyInput <
                  String(data?.monthlyObjective?.monthKey || data?.serverDate?.slice(0, 7) || '2026-11') && (
                  <div className="space-y-1.5 pt-1">
                    {vendorRole === 'Administrateur' ? (
                      <div>
                        <label className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block mb-0.5">
                          Motif de correction (obligatoire pour un mois passé verrouillé) *
                        </label>
                        <input
                          type="text"
                          value={objectiveCorrectionReasonInput}
                          onChange={(e) => setObjectiveCorrectionReasonInput(e.target.value)}
                          placeholder="Motif de la correction Administrateur..."
                          className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/30 text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    ) : (
                      <div className="text-[11px] font-bold text-[#B91C1C] dark:text-rose-400">
                        Mois passé verrouillé : seul l&apos;Administrateur peut effectuer une correction motivée.
                      </div>
                    )}
                  </div>
                )}
                {objectiveFeedback && (
                  <div
                    className={`text-[11px] font-bold ${
                      objectiveFeedback.type === 'success'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {objectiveFeedback.text}
                  </div>
                )}
              </div>
            )}

            {completionMessage && (
              <div className="p-2.5 sm:p-3 rounded-xl border bg-[#15803D] text-white text-xs font-extrabold flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{completionMessage}</span>
              </div>
            )}
          </div>

          {/* =================================================================
              PILIER 2 : NOMBRE DE VISITES EFFECTUÉES (JOURNÉE EN COURS) + LISTE DES PDV VALIDÉS
          ================================================================== */}
          <div className="box-border min-w-0 @[1120px]:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 sm:p-5 flex flex-col justify-between gap-3.5 overflow-hidden [overflow-wrap:anywhere]">
            <div className="space-y-3 min-w-0 box-border">
              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#006D77] dark:text-teal-300">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span>2. Visites effectuées • Journée en cours</span>
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                    Présence terrain &amp; pointage PDV
                  </h3>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#006D77] text-white text-xs font-black shrink-0">
                  {kpis.totalVisitsToday} {kpis.totalVisitsToday > 1 ? 'visites' : 'visite'}
                </span>
              </div>

              {/* Un seul décompte partout : "Visites comptées", "En attente de validation", "Contestées" */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 min-w-0 box-border">
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#15803D] text-white text-center min-w-0 box-border">
                  <span className="text-[11px] font-bold block leading-tight">
                    Visites comptées
                  </span>
                  <div className="text-lg sm:text-xl font-black mt-0.5">
                    {countedVisitsCount}
                  </div>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#92400E] text-white text-center min-w-0 box-border">
                  <span className="text-[11px] font-bold block leading-tight">
                    En attente de validation
                  </span>
                  <div className="text-lg sm:text-xl font-black mt-0.5">
                    {pendingVisitsCount}
                  </div>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#B91C1C] text-white text-center min-w-0 box-border">
                  <span className="text-[11px] font-bold block leading-tight">
                    Contestées
                  </span>
                  <div className="text-lg sm:text-xl font-black mt-0.5">
                    {contestedVisitsCount}
                  </div>
                </div>
              </div>

              {/* Dernier PDV visité */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs box-border min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1 text-slate-600 dark:text-slate-300 font-bold text-[11px]">
                  <span>Dernière visite enregistrée</span>
                  {kpis.lastVisitTime && (
                    <span className="text-[#006D77] dark:text-teal-300 font-extrabold">
                      à {String(kpis.lastVisitTime).slice(0, 8)}
                    </span>
                  )}
                </div>
                {kpis.lastVisitedPdvName ? (
                  <div className="mt-1 font-extrabold text-slate-900 dark:text-white flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{kpis.lastVisitedPdvName}</span>
                    {kpis.lastVisitedPdvNeighborhood && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-bold">
                        {kpis.lastVisitedPdvNeighborhood}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-slate-600 dark:text-slate-300">
                    Aucune visite pointée sur la journée active ({kpis.activeDayName}).
                  </div>
                )}
              </div>
            </div>

            {/* Bloc des visites de la Routine */}
            <div className="box-border min-w-0 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 space-y-3 [overflow-wrap:anywhere]">
              {/* Résumé sur 2 lignes avec singulier/pluriel */}
              <div className="space-y-1 min-w-0">
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
                  <Navigation className="w-4 h-4 text-[#006D77] dark:text-teal-400 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Pointer une visite PDV ({kpis.activeDayName})
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug">
                  <div>
                    {validatedRoutinePdvs.length}{' '}
                    {validatedRoutinePdvs.length > 1 ? 'PDV validés' : 'PDV validé'}
                  </div>
                  <div>
                    {validatedWithSaleCount} avec {validatedWithSaleCount > 1 ? 'ventes' : 'vente'} &middot;{' '}
                    {validatedWithoutSaleCount} sans {validatedWithoutSaleCount > 1 ? 'ventes' : 'vente'}
                  </div>
                </div>
              </div>

              {/* Carte "Routine par défaut" : titre complet sur sa ligne, aucune ellipsis ni troncature */}
              <div className="box-border w-full min-w-0 p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 space-y-1 [overflow-wrap:anywhere]">
                <div className="text-xs font-extrabold text-[#006D77] dark:text-teal-300 block w-full">
                  Routine par défaut
                </div>
                <div className="text-sm font-black text-slate-900 dark:text-white leading-snug [overflow-wrap:anywhere]">
                  {quickRoutineName || defaultRoutineFullLineName} ({kpis.activeDayName})
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                  Création directe PDV &middot; {validatedRoutinePdvs.length}{' '}
                  {validatedRoutinePdvs.length > 1 ? 'PDV validés' : 'PDV validé'}
                </div>
              </div>

              {/* Saisie du motif obligatoire AVANT envoi d'une visite sans vente : réservée exclusivement au Vendeur.
                  Pour le DOV, l'Administrateur et le Sales Admin / Contrôleur, aucun input ni textarea de motif n'est affiché (lecture seule). */}
              {isVendeurRole && (
                <div className="min-w-0 box-border space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-800 dark:text-slate-200 leading-snug">
                    Motif obligatoire de la visite sans vente (figé à l&apos;envoi) *
                  </label>
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {[
                      'Stock suffisant chez le client',
                      'Gérant absent lors du passage',
                      'Trésorerie insuffisante',
                      'Boutique momentanément fermée',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuickNoSaleReason(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          quickNoSaleReason === preset
                            ? 'bg-[#92400E] text-white border-[#92400E]'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    value={quickNoSaleReason}
                    onChange={(e) => setQuickNoSaleReason(e.target.value)}
                    placeholder="Saisissez le motif obligatoire avant d'envoyer la visite sans vente..."
                    className="box-border w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl border border-[#92400E] bg-amber-50/70 dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              {/* Liste des PDV validés — Titre en casse normale + infobulle "i" */}
              <div className="space-y-2.5 min-w-0 box-border">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white min-w-0 [overflow-wrap:anywhere]">
                    PDV validés ({kpis.activeDayName}) — Visites sans vente &amp; avec vente
                  </span>

                  <details className="relative shrink-0">
                    <summary
                      title={
                        isVendeurRole
                          ? 'Vendeur : soumission uniquement (validation Admin / DOV)'
                          : 'Admin / DOV : validation des visites soumises'
                      }
                      aria-label={
                        isVendeurRole
                          ? 'Information : Vendeur soumission uniquement (validation Admin / DOV)'
                          : 'Information : Admin / DOV validation des visites soumises'
                      }
                      className="list-none w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-xs font-black flex items-center justify-center cursor-pointer select-none border border-slate-300 dark:border-slate-600"
                    >
                      i
                    </summary>
                    <div className="absolute right-0 z-20 mt-1.5 w-60 p-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg border border-slate-700">
                      {isVendeurRole
                        ? 'Vendeur : soumission uniquement (validation par Admin ou DOV).'
                        : 'Admin / DOV : validation des visites soumises par le vendeur.'}
                    </div>
                  </details>
                </div>

                {validatedRoutinePdvs.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-700 dark:text-slate-300">
                    Aucun PDV validé pour la routine <strong>{defaultRoutineFullLineName}</strong> (
                    {kpis.activeDayName}). Le vendeur crée directement ses points de vente pour ce
                    jour de routine et l&apos;Admin ou le DOV les valide.
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2.5 pr-0.5 min-w-0 box-border">
                    {validatedRoutinePdvs.map((pdv) => {
                      const hasSale =
                        pdv.soldToday ||
                        pdv.hasSaleToday ||
                        Boolean(pdv.todaySales && pdv.todaySales.length > 0);
                      const isSansVente =
                        !hasSale &&
                        (pdv.visitCategory === 'sans_vente' || Boolean(pdv.noSaleReason));
                      const isVisited = pdv.visitedToday || hasSale || isSansVente;
                      const isVisitValidatedBySupervisor =
                        pdv.visitValidationStatus === 'valide' ||
                        Boolean((pdv as any).isCountedToday) ||
                        Boolean(validatedPdvIds[String(pdv.id)]) ||
                        (pdv.visitId ? Boolean(validatedPdvIds[String(pdv.visitId)]) : false);
                      const dayVisitsCnt = Number(
                        pdv.routineDayVisitsCount ??
                          pdv.todayVisitsCount ??
                          (pdv.visitedToday ? 1 : 0)
                      );
                      const salesCnt = Number(
                        pdv.totalSalesCount ??
                          pdv.todaySalesCount ??
                          pdv.todaySales?.length ??
                          (hasSale ? 1 : 0)
                      );
                      const noSaleCnt = Number(
                        pdv.totalNoSaleVisitsCount ??
                          (isSansVente ? Math.max(1, dayVisitsCnt - salesCnt) : 0)
                      );
                      const totalVisitsCnt = Math.max(
                        Number(pdv.totalVisitsCount ?? 0),
                        dayVisitsCnt,
                        salesCnt + noSaleCnt
                      );
                      const hasAnySale = salesCnt > 0 || hasSale || Boolean(pdv.hasAnySale);
                      const dayLabel = (pdv.routineDay || kpis.activeDayName || 'lundi').toLowerCase();

                      const actions: CartePdvAction[] = [];
                      if (isVendeurRole) {
                        actions.push({
                          id: 'visite-sans-vente',
                          label: 'Visite sans vente',
                          variant: 'warning',
                          disabled: checkingInVisit,
                          onClick: () => handleSubmitVisitForPdv(pdv.id),
                        });
                        actions.push({
                          id: 'vendre',
                          label: 'Vendre',
                          variant: 'success',
                          onClick: () => handleOpenSaleForRoutinePdv(pdv.id),
                        });
                      }
                      if (canValidateOrAssignObjective) {
                        const isCurrentlyValidating =
                          validatingItemId === String(pdv.visitId || pdv.id) ||
                          validatingItemId === String(pdv.id);
                        actions.push({
                          id: 'valider-visite',
                          label: isVisitValidatedBySupervisor
                            ? 'Visite validée'
                            : isCurrentlyValidating
                            ? 'Validation...'
                            : 'Valider la visite',
                          variant: isVisitValidatedBySupervisor ? 'gray' : 'primary',
                          disabled: isVisitValidatedBySupervisor || isCurrentlyValidating,
                          onClick: () => {
                            if (isVisitValidatedBySupervisor) return;
                            handleAdminOrDovValidateVisit({
                              visitId: pdv.visitId,
                              pdvId: pdv.id,
                            });
                          },
                        });
                      }

                      return (
                        <CartePdv
                          key={pdv.id}
                          pdv={{
                            id: pdv.id,
                            code: pdv.code,
                            name: pdv.name,
                            neighborhood: pdv.neighborhood,
                            city: 'Bamako',
                            created_by: pdv.vendorName || data?.vendor?.name || vendorName,
                            vendor_code: pdv.vendorCode || data?.vendor?.code,
                            status: isVisitValidatedBySupervisor ? 'valide' : 'en_attente',
                            photo_url: getPdvStorefrontImageUrl(pdv),
                            created_at: pdv.visitDate || data?.serverDate,
                          }}
                          infoBadges={[
                            isVisited
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
                              : `Jour : ${dayLabel}`,
                          ]}
                          routineDayName={dayLabel}
                          routineDayVisitsCount={dayVisitsCnt}
                          totalVisitsCount={totalVisitsCnt}
                          noSaleVisitsCount={noSaleCnt}
                          salesCount={salesCnt}
                          actions={actions}
                          extraContent={
                            isSansVente && pdv.noSaleReason ? (
                              <VendorNoSaleMotifMessageBlock
                                motif={pdv.noSaleReason}
                                authorName={pdv.vendorName || data?.vendor?.name || vendorName}
                                authorCode={pdv.vendorCode || data?.vendor?.code}
                                visitDate={pdv.visitDate || data?.serverDate}
                                visitTime={pdv.visitTime}
                                visitId={pdv.visitId}
                                pdvId={pdv.id}
                                vendorId={pdv.vendorId || data?.vendor?.id || selectedVendorId}
                                viewerRole={vendorRole}
                                reactionStatus={pdv.motifReactionStatus}
                                reactionComment={pdv.motifReactionComment}
                                reactedBy={pdv.motifReactedBy}
                                reactedRole={pdv.motifReactedRole}
                                reactedAt={pdv.motifReactedAt}
                                reactionsHistory={pdv.motifReactionsHistory}
                                onReactionSuccess={() => fetchPerformance(true)}
                              />
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {checkinFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-bold ${
                    checkinFeedback.type === 'success'
                      ? 'bg-[#15803D] text-white'
                      : checkinFeedback.type === 'info'
                      ? 'bg-[#92400E] text-white'
                      : 'bg-rose-700 text-white'
                  }`}
                >
                  {checkinFeedback.text}
                </div>
              )}
            </div>
          </div>

          {/* =================================================================
              PILIER 3 : VENTES RÉALISÉES SUR LA JOURNÉE EN COURS (SUR TOUTE UNE LIGNE)
          ================================================================== */}
          <div className="min-w-0 @[760px]:col-span-2 @[1120px]:col-span-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 sm:p-5 flex flex-col justify-between gap-4 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span>3. Ventes du jour • En direct</span>
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  CA &amp; Livraisons du jour
                </h3>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black shrink-0 whitespace-nowrap">
                {kpis.salesCountToday} vente(s)
              </span>
            </div>

            <div className="grid grid-cols-1 @[760px]:grid-cols-2 @[1120px]:grid-cols-12 gap-3.5 items-stretch min-w-0">
              {/* Montant total des ventes réalisées sur la journée en cours */}
              <div className="@[1120px]:col-span-4 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                    Chiffre d&apos;affaires réalisé aujourd&apos;hui
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                    <AdaptiveAmount
                      amount={kpis.salesRevenueToday}
                      unit="FCFA"
                      unitClassName="text-xs font-bold text-emerald-600"
                    />
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  <span>{kpis.salesCartonsToday} cartons livrés</span>
                  <span>•</span>
                  <span>{kpis.uniquePdvsSoldToday} PDV facturé(s)</span>
                </div>
              </div>

              {/* Panier moyen & Taux de transformation Visites -> Ventes */}
              <div className="@[1120px]:col-span-4 grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block whitespace-nowrap">
                    Panier Moyen
                  </span>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                    {kpis.averageBasketToday.toLocaleString('fr-FR')}{' '}
                    <span className="text-[10px] text-teal-600 font-bold">FCFA</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block whitespace-nowrap">
                    Transformation
                  </span>
                  <div className="text-sm sm:text-base font-black text-teal-700 dark:text-teal-400 mt-1 whitespace-nowrap">
                    {kpis.conversionRatePercent}%{' '}
                    <span className="text-[10px] text-slate-400 font-semibold">
                      ({kpis.salesCountToday}/{Math.max(kpis.totalVisitsToday, kpis.salesCountToday)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Répartition par mode de paiement sur la journée en cours */}
              <div className="@[760px]:col-span-2 @[1120px]:col-span-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-center space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                  Encaissements du jour par mode
                </span>
                {paymentBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Aucune vente enregistrée sur la journée en cours ({data?.serverDate}).
                  </p>
                ) : (
                  <div className="space-y-1">
                    {paymentBreakdown.map((pb) => (
                      <div
                        key={pb.paymentType}
                        className="flex flex-wrap items-center justify-between gap-1 text-xs"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {pb.paymentType} ({pb.count})
                        </span>
                        <span className="font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {pb.amount.toLocaleString('fr-FR')} FCFA ({pb.sharePercent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Raccourcis Stock Van / Solde ou Nouvelle Vente */}
            {(vanStockBoxes !== undefined ||
              balanceDueFCFA !== undefined ||
              (showCreationActions && onNavigateTab)) && (
              <div className="grid grid-cols-1 @[760px]:grid-cols-12 gap-2.5 items-center">
                {(vanStockBoxes !== undefined || balanceDueFCFA !== undefined) && (
                  <div
                    className={`grid grid-cols-2 gap-2.5 ${
                      showCreationActions && onNavigateTab
                        ? '@[760px]:col-span-7'
                        : '@[760px]:col-span-12'
                    }`}
                  >
                    {vanStockBoxes !== undefined && (
                      <div
                        onClick={() => onNavigateTab && onNavigateTab('mon-stock')}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-teal-500 transition"
                      >
                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 whitespace-nowrap">
                          <Package className="w-3 h-3 text-teal-600 shrink-0" />
                          <span>Stock Van</span>
                        </span>
                        <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5 whitespace-nowrap">
                          {vanStockBoxes} cartons
                        </div>
                      </div>
                    )}
                    {balanceDueFCFA !== undefined && (
                      <div
                        onClick={() => onNavigateTab && onNavigateTab('mon-solde')}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-amber-500 transition"
                      >
                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 whitespace-nowrap">
                          <DollarSign className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>À verser</span>
                        </span>
                        <div className="text-xs font-black text-amber-600 dark:text-amber-400 mt-0.5 whitespace-nowrap">
                          {balanceDueFCFA.toLocaleString('fr-FR')} F
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showCreationActions && onNavigateTab && (
                  <div
                    className={
                      vanStockBoxes !== undefined || balanceDueFCFA !== undefined
                        ? '@[760px]:col-span-5'
                        : '@[760px]:col-span-12'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onNavigateTab('nouvelle-vente')}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <span>Enregistrer une vente maintenant</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* =================================================================
            JOURNAUX D'ACTIVITÉ TEMPS RÉEL DE LA JOURNÉE EN COURS (2 COLONNES)
        ================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Colonne Gauche : Liste en temps réel des visites effectuées aujourd'hui */}
          <div className="lg:col-span-6 box-border min-w-0 [overflow-wrap:anywhere] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 min-w-0">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#006D77] shrink-0" />
                  <span>
                    Visites &amp; PDV réalisés sur la journée en cours ({visitsList.length})
                  </span>
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  Chaque visite ou création de PDV incrémente l&apos;objectif de{' '}
                  {Math.max(25, Number(kpis.dailyTargetPdv || 25))} PDV du jour sélectionné (
                  {kpis.activeDayName}).
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-[#006D77] text-white text-xs font-black">
                {kpis.realizedPdvCount} / {Math.max(25, Number(kpis.dailyTargetPdv || 25))} PDV
              </span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Chargement des visites de la journée en cours...
              </div>
            ) : visitsList.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Aucune visite PDV pointée pour le moment sur {kpis.activeDayName} (
                  {data?.serverDate}).
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Soumettez une visite depuis la liste des PDV validés ci-dessus ou créez un nouveau
                  point de vente pour démarrer votre progression vers les{' '}
                  {Math.max(25, Number(kpis.dailyTargetPdv || 25))} PDV.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 box-border min-w-0">
                {visitsList.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-xl border space-y-2 box-border min-w-0 [overflow-wrap:anywhere] ${
                      v.hasSaleToday
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
                    }`}
                  >
                    {/* Ligne 1 : Icône + Nom du PDV + Badge visuel Vente / Sans vente */}
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            v.hasSaleToday
                              ? 'bg-[#15803D] text-white'
                              : 'bg-[#92400E] text-white'
                          }`}
                          title={v.hasSaleToday ? 'Visite avec vente réalisée' : 'Visite sans vente'}
                        >
                          {v.hasSaleToday ? (
                            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </span>
                        <div className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                          {v.pdvName} {v.pdvCode ? `(${v.pdvCode})` : ''}
                        </div>
                      </div>

                      {v.hasSaleToday ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-md bg-[#15803D] text-white shrink-0">
                          <ShoppingBag className="w-3 h-3 shrink-0" />
                          <span>Avec vente</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-md bg-[#92400E] text-white shrink-0">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Sans vente</span>
                        </span>
                      )}
                    </div>

                    {/* Ligne 2 : Quartier et heure de visite */}
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                      Quartier : {v.pdvNeighborhood || 'Bamako'} · Heure de visite :{' '}
                      {String(v.visitTime || '').slice(0, 8)}
                    </div>

                    {/* Ligne 3 : Badges de statut (retour à la ligne autorisé) */}
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      {v.routineName && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white">
                          {v.routineName}
                        </span>
                      )}
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/70 text-[#006D77] dark:text-cyan-300">
                        Visité {Math.max(1, Number(v.routineDayVisitsCount || v.todayVisitsCount || 1))} fois ({v.routineDay || kpis.activeDayName})
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          v.validationStatus === 'valide'
                            ? 'bg-[#15803D] text-white'
                            : 'bg-[#92400E] text-white'
                        }`}
                      >
                        {v.validationStatus === 'valide'
                          ? `Validé · Compté / ${Math.max(25, Number(kpis.dailyTargetPdv || 25))}`
                          : 'En attente de validation'}
                      </span>
                      {v.statusReason && !v.noSaleReason && (
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {v.statusReason}
                        </span>
                      )}
                    </div>

                    {/* Bloc message "Motif du vendeur" en lecture seule */}
                    {v.noSaleReason && (
                      <VendorNoSaleMotifMessageBlock
                        motif={v.noSaleReason}
                        authorName={v.vendorName || data?.vendor?.name || vendorName}
                        authorCode={v.vendorCode || data?.vendor?.code}
                        visitDate={v.visitDate || data?.serverDate}
                        visitTime={v.visitTime}
                        visitId={v.id}
                        pdvId={v.pdvId}
                        vendorId={v.vendorId || data?.vendor?.id || selectedVendorId}
                        viewerRole={vendorRole}
                        reactionStatus={v.motifReactionStatus}
                        reactionComment={v.motifReactionComment}
                        reactedBy={v.motifReactedBy}
                        reactedRole={v.motifReactedRole}
                        reactedAt={v.motifReactedAt}
                        reactionsHistory={v.motifReactionsHistory}
                        onReactionSuccess={() => fetchPerformance(true)}
                      />
                    )}

                    {/* Ligne 4 : Boutons */}
                    {canValidateOrAssignObjective && (() => {
                      const isRowValidated =
                        v.validationStatus === 'valide' ||
                        Boolean(validatedPdvIds[String(v.id)]) ||
                        Boolean(validatedPdvIds[String(v.pdvId)]);
                      const isRowValidating =
                        validatingItemId === String(v.id || v.pdvId) ||
                        validatingItemId === String(v.pdvId);
                      return (
                        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 pt-1 box-border min-w-0">
                          <button
                            type="button"
                            disabled={isRowValidated || isRowValidating}
                            onClick={() => {
                              if (isRowValidated) return;
                              handleAdminOrDovValidateVisit({ visitId: v.id, pdvId: v.pdvId });
                            }}
                            className={`box-border w-full min-w-0 min-h-[48px] px-2.5 py-2 rounded-lg text-xs font-extrabold leading-tight text-center flex items-center justify-center ${
                              isRowValidated
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-75'
                                : 'bg-[#006D77] hover:bg-[#005a63] disabled:opacity-50 text-white cursor-pointer'
                            }`}
                          >
                            {isRowValidated
                              ? 'Visite validée'
                              : isRowValidating
                              ? 'Validation...'
                              : 'Valider la visite'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Colonne Droite : Historique des ventes réalisées sur la journée en cours
              Affiche : Nom du PDV, Nom de la routine où il est lié, Nom du produit et nombre de cartons achetés, Date et heure */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  <span>
                    Ventes réalisées sur la journée en cours ({salesList.length})
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Historique détaillé : PDV, routine liée, produits &amp; cartons achetés, date et
                  heure ({data?.serverDate}).
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-black">
                {kpis.salesRevenueToday.toLocaleString('fr-FR')} FCFA
              </span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Chargement des ventes de la journée en cours...
              </div>
            ) : salesList.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Aucune vente enregistrée pour le moment sur la journée en cours (
                  {data?.serverDate}).
                </p>
                {data?.recentSalesByDay && data.recentSalesByDay.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dernière journée avec ventes :{' '}
                    <strong>{data.recentSalesByDay[0].date}</strong> (
                    {data.recentSalesByDay[0].sales_count} ventes •{' '}
                    {Number(data.recentSalesByDay[0].revenue || 0).toLocaleString('fr-FR')} FCFA).
                  </p>
                )}
                {showCreationActions && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('nouvelle-vente')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer mt-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Créer la première vente du jour</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {salesList.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col gap-1.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                            PDV : {s.pdvName}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300">
                            Routine : {s.routineName || defaultRoutineFullLineName} (
                            {s.routineDay || kpis.activeDayName})
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {s.number}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300">
                            {s.paymentType}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 block">
                          {s.totalAmount.toLocaleString('fr-FR')} FCFA
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {s.date} à {s.saleTime}
                        </span>
                      </div>
                    </div>

                    {/* Produits achetés et nombre de cartons */}
                    <div className="text-[11px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                      <span className="font-extrabold text-slate-500 dark:text-slate-400 uppercase text-[10px] mr-1.5">
                        Produits &amp; cartons :
                      </span>
                      {s.items && s.items.length > 0 ? (
                        <span className="font-bold">
                          {s.items
                            .map(
                              (it) =>
                                `${it.name} : ${it.qtyBoxes ?? it.quantity ?? 0} carton(s)`,
                            )
                            .join(' • ')}
                        </span>
                      ) : (
                        <span className="font-bold">{s.cartonsCount} carton(s) acheté(s)</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>
                        Quartier : <strong>{s.pdvNeighborhood}</strong> • Total :{' '}
                        <strong>{s.cartonsCount} carton(s)</strong>
                      </span>
                      <span>
                        Date &amp; heure :{' '}
                        <strong>
                          {s.date} • {s.saleTime}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
