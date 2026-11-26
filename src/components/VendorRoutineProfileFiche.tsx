import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  MapPin,
  CheckCircle2,
  Lock,
  Clock,
  RefreshCw,
  ShoppingBag,
  Calendar,
  UserCheck,
  Phone,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { AdaptiveAmount } from '../utils/formatAmount';
import {
  RoutineDayBlock,
  VendorDailyPerformanceData,
} from './VendorPerformanceKpiDashboard';
import { VendorNoSaleMotifMessageBlock } from './VendorNoSaleMotifMessageBlock';
import { CartePdv, CartePdvAction } from './CartePdv';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';

const DEFAULT_WEEK_DAYS: RoutineDayBlock[] = [
  {
    dayIndex: 1,
    dayName: 'Lundi',
    shortName: 'Lun',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 2,
    dayName: 'Mardi',
    shortName: 'Mar',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 3,
    dayName: 'Mercredi',
    shortName: 'Mer',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 4,
    dayName: 'Jeudi',
    shortName: 'Jeu',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 5,
    dayName: 'Vendredi',
    shortName: 'Ven',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
  {
    dayIndex: 6,
    dayName: 'Samedi',
    shortName: 'Sam',
    isSelected: false,
    isLocked: true,
    pdvCount: 0,
    targetPdvCount: 25,
    isTargetReached: false,
    isPastLockedAtMidnight: false,
    isNextToUnlockAtMidnight: false,
    lockedAtMidnightDate: null,
    statusCode: 'bloque',
    statusLabel: 'Bloqué',
  },
];

function getTimeRemainingUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffMs = Math.max(0, midnight.getTime() - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

export interface VendorRoutineProfileFicheProps {
  vendorId: string;
  vendorName?: string;
  vendorCode?: string;
  vendorTeam?: string;
  vendorPhone?: string;
  weekStatus?: string;
  derogationCount?: number;
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
  viewerRole?: string;
  viewerName?: string;
  onGrantDerogation?: () => void;
  onInspectSixDays?: () => void;
  onAssignMonthlyObjective?: () => void;
  externalRefreshTrigger?: number;
}

export const VendorRoutineProfileFiche: React.FC<VendorRoutineProfileFicheProps> = ({
  vendorId,
  vendorName,
  vendorCode,
  vendorTeam,
  vendorPhone,
  weekStatus,
  derogationCount = 0,
  startDate,
  endDate,
  periodLabel,
  viewerRole = 'Vendeur',
  viewerName,
  onGrantDerogation,
  onInspectSixDays,
  onAssignMonthlyObjective,
  externalRefreshTrigger = 0,
}) => {
  const [data, setData] = useState<VendorDailyPerformanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const normalizedViewerRole = String(viewerRole || '').trim();
  const lowerViewerRole = normalizedViewerRole.toLowerCase();
  const isSupervisor =
    lowerViewerRole !== 'vendeur' &&
    (normalizedViewerRole === 'Directeur des opérations de vente' ||
      normalizedViewerRole === 'Administrateur' ||
      normalizedViewerRole === 'Sales Admin / Contrôleur' ||
      lowerViewerRole.includes('directeur des opérations') ||
      lowerViewerRole.includes('administrateur') ||
      lowerViewerRole.includes('sales admin') ||
      lowerViewerRole.includes('contrôleur') ||
      lowerViewerRole.includes('controleur') ||
      normalizedViewerRole.toUpperCase() === 'DOV');

  const getLocalClientDate = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const fetchVendorDailyPerformance = useCallback(
    async (silent = false) => {
      if (!vendorId) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const clientDate = getLocalClientDate();
        const params = new URLSearchParams({
          vendor_id: vendorId,
          client_date: clientDate,
        });
        if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          params.set('start_date', startDate);
        }
        if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
          params.set('end_date', endDate);
        }
        const res = await fetch(`/api/vendor/daily-performance?${params.toString()}`);
        if (res.ok) {
          const json: VendorDailyPerformanceData = await res.json();
          setData(json);
        }
      } catch {
        // Silencieux en cas d'erreur réseau temporaire
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [vendorId, startDate, endDate, getLocalClientDate]
  );

  useEffect(() => {
    fetchVendorDailyPerformance(false);
  }, [fetchVendorDailyPerformance, externalRefreshTrigger]);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchVendorDailyPerformance(true);
    }, 15000);
    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchVendorDailyPerformance]);

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
    (data?.routineStatus as any)?.cycleStatus || weekStatus || 'Disponible'
  );
  const completionMessage = (data?.routineStatus as any)?.completionMessage || null;

  const days = data?.routineStatus?.days || DEFAULT_WEEK_DAYS;
  const visitsList = data?.visitsList || [];
  const salesList = data?.salesList || [];
  const perimeterPdvs = data?.perimeterPdvs || [];
  const validatedRoutinePdvs = perimeterPdvs.filter((p) => p.status !== 'rejete');
  const paymentBreakdown = data?.paymentBreakdown || [];
  const defaultRoutineName =
    String(kpis.activeRoutineName || '').trim() || `Routine ${kpis.activeDayName}`;

  const [objectiveTargetInput, setObjectiveTargetInput] = useState<number>(625);
  const [objectiveMonthKeyInput, setObjectiveMonthKeyInput] = useState<string>('2026-11');
  const [objectiveRoutineNameInput, setObjectiveRoutineNameInput] = useState<string>('');
  const [objectiveCorrectionReasonInput, setObjectiveCorrectionReasonInput] = useState<string>('');
  const [savingObjective, setSavingObjective] = useState<boolean>(false);
  const [validatingKey, setValidatingKey] = useState<string | null>(null);
  const [validatedPdvIds, setValidatedPdvIds] = useState<Record<string, boolean>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const mObj = data?.monthlyObjective || data?.kpis?.monthlyObjective;
    if (mObj?.monthlyTargetPdv) {
      setObjectiveTargetInput(Math.max(25, Number(mObj.monthlyTargetPdv) || 625));
    }
    if (mObj?.monthKey) {
      setObjectiveMonthKeyInput((prev) => prev || String(mObj.monthKey));
    }
    if (mObj?.routineName || data?.kpis?.activeRoutineName) {
      setObjectiveRoutineNameInput(String(mObj?.routineName || data?.kpis?.activeRoutineName || ''));
    }
  }, [data?.monthlyObjective, data?.kpis?.monthlyObjective, data?.kpis?.activeRoutineName]);

  const handleAssignVendorObjective = async () => {
    if (!isSupervisor) return;
    const cleanTarget = Math.max(25, Math.floor(Number(objectiveTargetInput) || 25));
    const currentServerMonth = String(
      data?.monthlyObjective?.monthKey ||
        data?.kpis?.monthlyMonthKey ||
        data?.serverDate?.slice(0, 7) ||
        '2026-11'
    );
    const targetMonthKey = objectiveMonthKeyInput || currentServerMonth;
    const isPastMonth = targetMonthKey < currentServerMonth;
    const isAdminViewer =
      normalizedViewerRole === 'Administrateur' || lowerViewerRole.includes('administrateur');

    if (isPastMonth && !isAdminViewer) {
      setActionError(
        'Ce mois passé est verrouillé : seul l’Administrateur peut effectuer une correction motivée.'
      );
      return;
    }
    if (isPastMonth && isAdminViewer && objectiveCorrectionReasonInput.trim().length < 3) {
      setActionError(
        'Le motif de correction est obligatoire pour modifier un mois passé verrouillé.'
      );
      return;
    }

    setSavingObjective(true);
    setActionNotice(null);
    setActionError(null);
    try {
      const res = await fetch('/api/vrs/monthly-objectives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': viewerRole || 'Directeur des opérations de vente',
        },
        body: JSON.stringify({
          vendor_ids: [vendorId],
          month_key: targetMonthKey,
          target_pdv_count: cleanTarget,
          routine_name: objectiveRoutineNameInput.trim() || defaultRoutineName,
          correction_reason: isPastMonth ? objectiveCorrectionReasonInput.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setActionNotice(
          json.message ||
            `Objectif mensuel de ${cleanTarget} PDV (${targetMonthKey}) attribué avec succès à ${displayName}.`
        );
        setObjectiveCorrectionReasonInput('');
        await fetchVendorDailyPerformance(true);
      } else {
        setActionError(json.error || "Erreur lors de l'attribution de l'objectif mensuel.");
      }
    } catch {
      setActionError("Erreur réseau lors de l'attribution de l'objectif mensuel.");
    } finally {
      setSavingObjective(false);
    }
  };

  const handleValidateSubmittedVisit = async (opts: { visitId?: string | null; pdvId?: string }) => {
    if (!isSupervisor || validatingKey) return;
    const key = String(opts.visitId || `pdv-${opts.pdvId || ''}`);
    setValidatingKey(key);
    setActionNotice(null);
    setActionError(null);
    try {
      const clientDate = getLocalClientDate();
      const res = await fetch('/api/vendor/daily-performance/validate-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': viewerRole || 'Directeur des opérations de vente',
        },
        body: JSON.stringify({
          visit_id: opts.visitId || undefined,
          pdv_id: opts.pdvId || undefined,
          vendor_id: vendorId,
          client_date: clientDate,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (opts.pdvId) {
          setValidatedPdvIds((prev) => ({ ...prev, [String(opts.pdvId)]: true }));
        }
        if (opts.visitId) {
          setValidatedPdvIds((prev) => ({ ...prev, [String(opts.visitId)]: true }));
        }
        if (json.kpis && json.perimeterPdvs) {
          setData(json);
        }
        setActionNotice(json.message || 'Visite / PDV validé par Admin / DOV.');
        window.dispatchEvent(new Event('baobab-notifications-updated'));
        window.dispatchEvent(new Event('baobab-pdvs-updated'));
        await fetchVendorDailyPerformance(true);
      } else {
        setActionError(json.error || 'Impossible de valider cette visite.');
      }
    } catch {
      setActionError('Erreur réseau lors de la validation.');
    } finally {
      setValidatingKey(null);
    }
  };

  const isCustomPeriod = Boolean(data?.period?.isCustomPeriod || (startDate && endDate && (startDate !== data?.serverDate || endDate !== data?.serverDate)));
  const effectiveStartDate = data?.period?.startDate || startDate || data?.serverDate || 'Aujourd’hui';
  const effectiveEndDate = data?.period?.endDate || endDate || data?.serverDate || 'Aujourd’hui';
  const periodDisplayTitle = isCustomPeriod
    ? periodLabel
      ? `${periodLabel} (${effectiveStartDate === effectiveEndDate ? effectiveStartDate : `du ${effectiveStartDate} au ${effectiveEndDate}`})`
      : effectiveStartDate === effectiveEndDate
      ? `Le ${effectiveStartDate}`
      : `Du ${effectiveStartDate} au ${effectiveEndDate}`
    : periodLabel || 'Journée en cours';

  const displayName = data?.vendor?.name || vendorName || 'Vendeur Terrain';
  const displayCode = data?.vendor?.code || vendorCode || 'VND';
  const displayTeam = data?.vendor?.team || vendorTeam || 'Équipe Terrain Bamako';
  const displayPhone = data?.vendor?.phone || vendorPhone || '+223 76 11 22 33';

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="@container w-full max-w-full min-w-0 rounded-2xl sm:rounded-3xl border-2 border-teal-600/30 dark:border-teal-500/30 bg-white dark:bg-slate-900 shadow-md overflow-hidden">
      {/* ==================================================================
          EN-TÊTE DE LA FICHE PROFIL VENDEUR (IDENTITÉ & ACTIONS ADMIN / DOV)
      ================================================================== */}
      <div className="bg-gradient-to-r from-[#003B46] via-[#07575B] to-[#006D77] text-white px-3.5 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col @[780px]:flex-row @[780px]:items-center @[780px]:justify-between gap-3 min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            {/* Avatar initiales uniquement (évite le retour à la ligne du code BAO-VND-002 dans le carré) */}
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 shadow-xs">
              <span className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
                {initials || 'VN'}
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-400/20 border border-teal-300/30 text-teal-100 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                  <UserCheck className="w-3 h-3 text-teal-300 shrink-0" />
                  <span>Fiche Profil Vendeur</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/15 text-white text-[10px] font-extrabold whitespace-nowrap">
                  Jour actif : {kpis.activeDayName}
                </span>
                {isCustomPeriod && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/90 text-white text-[10px] font-extrabold">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>Période : {periodDisplayTitle}</span>
                  </span>
                )}
                {kpis.isTargetReachedToday ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Objectif {kpis.dailyTargetPdv}/{kpis.dailyTargetPdv} Validé</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/90 text-slate-950 text-[10px] font-black uppercase whitespace-nowrap">
                    <span>
                      {weekStatus || 'En cours'} • {kpis.realizedPdvCount}/{kpis.dailyTargetPdv} PDV
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white leading-snug">
                  {displayName}
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/15 text-teal-100 font-mono font-extrabold text-xs whitespace-nowrap">
                  {displayCode}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] sm:text-xs text-teal-100/90">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Users className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                  <span>{displayTeam}</span>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap">
                  <Phone className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                  <span>{displayPhone}</span>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>
                    {isCustomPeriod
                      ? `Période : ${periodDisplayTitle}`
                      : `Date : ${data?.serverDate || 'Aujourd’hui'}`}{' '}
                    • Dérogations : {derogationCount}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Boutons d'action superviseur (Actualiser, Dérogation, Détail 6 jours) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchVendorDailyPerformance(true)}
              className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap"
              title="Actualiser la fiche profil du vendeur en temps réel"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>

            {onInspectSixDays && (
              <button
                type="button"
                onClick={onInspectSixDays}
                className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Détail 6 jours</span>
              </button>
            )}

            {isSupervisor && onGrantDerogation && (
              <button
                type="button"
                onClick={onGrantDerogation}
                className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition cursor-pointer shadow-xs whitespace-nowrap"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Accorder une dérogation</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================
          CORPS DE LA FICHE PROFIL VENDEUR : LES 4 BLOCS DEMANDÉS
          - Ligne 1 : Bloc 1 (50%) & Bloc 2 (50%) avec un large espace de manœuvre
          - Ligne 2 (pleine largeur) : Bloc 3 (3. CA & Livraison du jour / période)
      ================================================================== */}
      <div className="p-3 sm:p-4 md:p-5 space-y-4 bg-slate-50/60 dark:bg-slate-950/40 min-w-0">
        <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-3.5 sm:gap-4 min-w-0">
          {/* ==============================================================
              BLOC 1 : L'OBJECTIF QUOTIDIEN (25 PDV / JOUR + 6 JOURS LUN-SAM)
          ============================================================== */}
          <div className="min-w-0 rounded-2xl border-2 border-teal-500/30 dark:border-teal-500/40 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between space-y-3.5 overflow-hidden">
            <div className="space-y-3 min-w-0">
              {/* OBJECTIF DU MOIS : X PDV (avec progression mensuelle, et sous elle la progression du jour actif X / 25) */}
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
                  <div className="p-3 rounded-xl bg-teal-50/50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 block">
                          Objectif Mensuel • {mLabel}
                        </span>
                        <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                          Objectif du mois : {mTarget} PDV
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mIsDef && (
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold">
                            Objectif par défaut
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-black text-white ${
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

                    <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          mStatus === 'Atteint'
                            ? 'bg-[#15803D]'
                            : mStatus === 'Non atteint'
                            ? 'bg-[#B91C1C]'
                            : 'bg-[#006D77]'
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
                          {mValDays} / {mWorkDays} j ouvrés
                        </strong>
                      </span>
                    </div>

                    {mObj?.assignedByName && mObj?.assignedAt && !mIsDef && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Attribué par <strong>{mObj.assignedByName}</strong> ({mObj.assignedByRole}) le{' '}
                        {String(mObj.assignedAt).replace('T', ' ').slice(0, 16)}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* En-tête Bloc 1 : Progression du jour actif (X / 25 PDV) sous la progression mensuelle */}
              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 block leading-snug">
                      {isCustomPeriod
                        ? `1. Objectif période (${data?.period?.workingDaysCount || 1} j ouvrés × 25 PDV)`
                        : 'Progression du jour actif • 25 PDV / Jour'}
                    </span>
                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug mt-0.5">
                      Jour actif : {kpis.activeDayName}
                    </h4>
                  </div>
                </div>

                {kpis.isTargetReachedToday ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black shrink-0 whitespace-nowrap">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Validé {kpis.dailyTargetPdv}/{kpis.dailyTargetPdv}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-extrabold shrink-0 whitespace-nowrap">
                    <span>{kpis.progressPercent}%</span>
                  </span>
                )}
              </div>

              {/* Jauge principale X / 25 PDV (sans retour à la ligne vertical entre X et / 25 PDV) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 space-y-2 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 min-w-0">
                  <div className="whitespace-nowrap">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {kpis.realizedPdvCount}
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-slate-500 dark:text-slate-400">
                      {' '}
                      / {kpis.dailyTargetPdv} PDV
                    </span>
                  </div>
                  <div className="text-right">
                    {kpis.remainingPdvForTarget > 0 ? (
                      <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        Reste : {kpis.remainingPdvForTarget} PDV
                      </span>
                    ) : (
                      <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                        Objectif atteint (+{kpis.extraVisitsBeyond25} bonus)
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      kpis.isTargetReachedToday
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                        : 'bg-gradient-to-r from-[#006D77] to-teal-500'
                    }`}
                    style={{ width: `${kpis.progressPercent}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 pt-0.5">
                  <span>
                    Statut semaine :{' '}
                    <strong className="text-slate-900 dark:text-white">{routineCycleStatus}</strong>
                  </span>
                  {completionMessage ? (
                    <span className="text-[#15803D] dark:text-emerald-400 font-extrabold">
                      {completionMessage}
                    </span>
                  ) : (
                    <span className="text-teal-700 dark:text-teal-300">
                      Jour actif : {kpis.activeDayName}
                      {(data?.routineStatus as any)?.activeDate
                        ? ` (${(data?.routineStatus as any).activeDate})`
                        : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* 6 jours de la semaine (Lundi à Samedi — Dimanche exclu) avec leur date et statuts normalisés */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <span>Semaine de routine (Lundi à Samedi)</span>
                  {(data?.routineStatus as any)?.weekStartDate && (
                    <span className="text-teal-700 dark:text-teal-400 whitespace-nowrap">
                      {(data?.routineStatus as any).weekStartDate} au{' '}
                      {(data?.routineStatus as any).weekEndDate}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
                  {days.map((d: any) => {
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

                    const badgeText = isValide
                      ? 'Validé'
                      : isEnCours
                      ? 'En cours'
                      : isIncomplet
                      ? 'Incomplet'
                      : isDisponible
                      ? 'Disponible'
                      : 'Bloqué';

                    return (
                      <div
                        key={d.dayIndex || d.slotIndex || d.dayName}
                        className={`min-w-0 px-2.5 py-2 rounded-xl border text-center transition flex flex-col items-center justify-between min-h-[82px] ${
                          isValide
                            ? 'border-2 border-[#15803D] bg-emerald-50/80 dark:bg-emerald-950/40'
                            : isEnCours || isDisponible
                            ? 'border-2 border-[#006D77] bg-teal-50/80 dark:bg-teal-950/40'
                            : isIncomplet
                            ? 'border-2 border-[#B91C1C] bg-red-50/80 dark:bg-red-950/40'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/50'
                        }`}
                      >
                        <div className="w-full min-w-0 text-center">
                          <span className="block w-full text-xs font-black text-slate-900 dark:text-white leading-tight">
                            {d.dayName}
                          </span>
                          {d.date && (
                            <span className="block w-full text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight mt-0.5">
                              {d.date}
                            </span>
                          )}
                        </div>

                        <div className="inline-flex items-center justify-center gap-1 text-xs font-black text-slate-900 dark:text-white my-1">
                          {isBloque || isValide ? (
                            <Lock className="w-3 h-3 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-[#006D77] dark:text-teal-400 shrink-0" />
                          )}
                          <span>
                            {d.countedVisits ?? d.pdvCount ?? 0}/{d.targetPdvCount ?? 25}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold leading-tight w-full text-center ${badgeStyle}`}
                        >
                          {isBloque && <Lock className="w-2.5 h-2.5 shrink-0" />}
                          <span>{badgeText}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attribution de l'objectif mensuel uniquement visible pour DOV, Administrateur et Sales Admin / Contrôleur (jamais pour le Vendeur) */}
              {isSupervisor && (
                <div className="p-3 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/40 dark:bg-teal-950/20 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-black text-teal-800 dark:text-teal-300">
                    <span>Attribuer objectif mensuel (Min. 25 PDV)</span>
                    <div className="flex items-center gap-2">
                      <span>
                        Actuel :{' '}
                        {Number(
                          data?.monthlyObjective?.monthlyTargetPdv ??
                            kpis.monthlyTargetPdv ??
                            625
                        )}{' '}
                        PDV
                      </span>
                      {onAssignMonthlyObjective && (
                        <button
                          type="button"
                          onClick={onAssignMonthlyObjective}
                          className="px-2.5 py-1 rounded-lg bg-[#006D77] hover:bg-[#00586B] text-white text-[11px] font-extrabold transition cursor-pointer"
                        >
                          Ouvrir le formulaire complet
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-3">
                      <input
                        type="month"
                        value={objectiveMonthKeyInput}
                        onChange={(e) => setObjectiveMonthKeyInput(e.target.value)}
                        aria-label="Mois de l'objectif"
                        className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-black text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        min={25}
                        value={objectiveTargetInput}
                        onChange={(e) =>
                          setObjectiveTargetInput(Math.max(25, Number(e.target.value || 25)))
                        }
                        aria-label="Objectif mensuel PDV minimum 25"
                        className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-black text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        value={objectiveRoutineNameInput}
                        onChange={(e) => setObjectiveRoutineNameInput(e.target.value)}
                        placeholder="Nom de la routine"
                        aria-label="Nom de la routine"
                        className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <button
                        type="button"
                        onClick={handleAssignVendorObjective}
                        disabled={savingObjective}
                        className="w-full min-h-[48px] py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-extrabold transition cursor-pointer"
                      >
                        {savingObjective ? '...' : 'Attribuer'}
                      </button>
                    </div>
                  </div>
                  {objectiveMonthKeyInput <
                    String(
                      data?.monthlyObjective?.monthKey ||
                        data?.serverDate?.slice(0, 7) ||
                        '2026-11'
                    ) && (
                    <div className="pt-1">
                      {normalizedViewerRole === 'Administrateur' ||
                      lowerViewerRole.includes('administrateur') ? (
                        <input
                          type="text"
                          value={objectiveCorrectionReasonInput}
                          onChange={(e) => setObjectiveCorrectionReasonInput(e.target.value)}
                          placeholder="Motif obligatoire de correction du mois passé verrouillé *"
                          className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/30 text-xs font-bold text-slate-900 dark:text-white"
                        />
                      ) : (
                        <div className="text-[11px] font-bold text-[#B91C1C] dark:text-rose-400">
                          Ce mois passé est verrouillé : correction motivée réservée à l&apos;Administrateur.
                        </div>
                      )}
                    </div>
                  )}
                  {actionNotice && (
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {actionNotice}
                    </div>
                  )}
                  {actionError && (
                    <div className="text-[11px] font-bold text-[#B91C1C] dark:text-rose-400">
                      {actionError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ==============================================================
              BLOC 2 : LES VISITES EFFECTUÉES - JOURNÉE EN COURS / PÉRIODE (SANS LE POINTAGE)
          ============================================================== */}
          <div className="box-border min-w-0 [overflow-wrap:anywhere] rounded-2xl border-2 border-[#006D77]/30 dark:border-[#006D77]/50 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between space-y-3.5">
            <div className="space-y-3 box-border min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 box-border min-w-0">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#006D77] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="text-xs font-bold text-[#006D77] dark:text-teal-300 block leading-snug">
                      2. Visites effectuées • {periodDisplayTitle}
                    </span>
                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug mt-0.5">
                      {kpis.totalVisitsToday} {kpis.totalVisitsToday > 1 ? 'visites' : 'visite'} •{' '}
                      {kpis.uniquePdvsVisitedToday} PDV{' '}
                      {kpis.uniquePdvsVisitedToday > 1 ? 'distincts' : 'distinct'}
                    </h4>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-xs font-extrabold shrink-0">
                  {isCustomPeriod ? 'Période' : 'Direct'}
                </span>
              </div>

              {/* Un seul décompte partout : "Visites comptées", "En attente de validation", "Contestées" */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 box-border min-w-0">
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#15803D] text-white text-center box-border min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-[11px] font-bold block leading-tight">
                    Visites comptées
                  </span>
                  <span className="text-lg sm:text-xl font-black block mt-0.5">
                    {countedVisitsCount}
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#92400E] text-white text-center box-border min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-[11px] font-bold block leading-tight">
                    En attente de validation
                  </span>
                  <span className="text-lg sm:text-xl font-black block mt-0.5">
                    {pendingVisitsCount}
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#B91C1C] text-white text-center box-border min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-[11px] font-bold block leading-tight">
                    Contestées
                  </span>
                  <span className="text-lg sm:text-xl font-black block mt-0.5">
                    {contestedVisitsCount}
                  </span>
                </div>
              </div>

              {/* Dernière visite enregistrée */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1 box-border min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Dernière visite enregistrée</span>
                  {kpis.lastVisitTime && (
                    <span className="text-[#006D77] dark:text-teal-300 font-extrabold">
                      à {String(kpis.lastVisitTime).slice(0, 8)}
                    </span>
                  )}
                </div>
                {kpis.lastVisitedPdvName ? (
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                    {kpis.lastVisitedPdvName}{' '}
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      ({kpis.lastVisitedPdvNeighborhood || 'Bamako'})
                    </span>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Aucune visite pointée sur cette période ({periodDisplayTitle})
                  </div>
                )}
              </div>

              {/* Carte "Routine par défaut" + Liste "PDV validés" */}
              {(() => {
                const totalValidCount = validatedRoutinePdvs.length;
                const withSaleCount = validatedRoutinePdvs.filter(
                  (p) => p.hasSaleToday || (p.todaySales && p.todaySales.length > 0)
                ).length;
                const withoutSaleCount = validatedRoutinePdvs.filter(
                  (p) =>
                    !(p.hasSaleToday || (p.todaySales && p.todaySales.length > 0)) &&
                    (p.visitCategory === 'sans_vente' || Boolean(p.noSaleReason))
                ).length;

                return (
                  <div className="space-y-2.5 box-border min-w-0 [overflow-wrap:anywhere]">
                    {/* Carte "Routine par défaut" — titre complet sur sa ligne + résumé sur 2 lignes avec singulier/pluriel */}
                    <div className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 space-y-1.5 box-border min-w-0 [overflow-wrap:anywhere]">
                      <div className="block w-full">
                        <span className="inline-block text-xs font-extrabold px-2.5 py-1 rounded-md bg-[#006D77] text-white">
                          Routine par défaut
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                        {defaultRoutineName} ({kpis.activeDayName})
                      </div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug space-y-0.5">
                        <div className="block">
                          {totalValidCount} {totalValidCount > 1 ? 'PDV validés' : 'PDV validé'}
                        </div>
                        <div className="block">
                          {withSaleCount} avec {withSaleCount > 1 ? 'ventes' : 'vente'} ·{' '}
                          {withoutSaleCount} sans {withoutSaleCount > 1 ? 'ventes' : 'vente'}
                        </div>
                      </div>
                    </div>

                    {/* Liste "PDV validés" : Une seule carte par PDV, 4 lignes */}
                    {validatedRoutinePdvs.length > 0 && (
                      <div className="space-y-2 box-border min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                          PDV validés ({totalValidCount})
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-2.5 pr-0.5 box-border min-w-0">
                          {validatedRoutinePdvs.map((pdv) => {
                            const hasSale =
                              pdv.hasSaleToday ||
                              Boolean(pdv.todaySales && pdv.todaySales.length > 0);
                            const isSansVente =
                              !hasSale &&
                              (pdv.visitCategory === 'sans_vente' || Boolean(pdv.noSaleReason));
                            const isValidated =
                              pdv.visitValidationStatus === 'valide' ||
                              Boolean((pdv as any).isCountedToday) ||
                              Boolean(validatedPdvIds[String(pdv.id)]) ||
                              (pdv.visitId ? Boolean(validatedPdvIds[String(pdv.visitId)]) : false);
                            const isVisited = Boolean(pdv.visitedToday || hasSale || isSansVente);
                            const dayVisitsCnt = Number(
                              pdv.routineDayVisitsCount ??
                                pdv.todayVisitsCount ??
                                (pdv.visitedToday ? 1 : 0)
                            );
                            const salesCnt = Number(
                              (pdv as any).totalSalesCount ??
                                pdv.todaySalesCount ??
                                pdv.todaySales?.length ??
                                (hasSale ? 1 : 0)
                            );
                            const noSaleCnt = Number(
                              (pdv as any).totalNoSaleVisitsCount ??
                                (isSansVente ? Math.max(1, dayVisitsCnt - salesCnt) : 0)
                            );
                            const totalVisitsCnt = Math.max(
                              Number((pdv as any).totalVisitsCount ?? 0),
                              dayVisitsCnt,
                              salesCnt + noSaleCnt
                            );
                            const hasAnySale = salesCnt > 0 || hasSale;
                            const dayLabel = (
                              pdv.routineDay ||
                              kpis.activeDayName ||
                              'lundi'
                            ).toLowerCase();

                            const actions: CartePdvAction[] = [];
                            if (isSupervisor) {
                              const isCurrentlyValidating =
                                validatingKey === String(pdv.visitId || `pdv-${pdv.id}`) ||
                                validatingKey === `pdv-${pdv.id}`;
                              actions.push({
                                id: 'valider-visite',
                                label: isValidated
                                  ? 'Visite validée'
                                  : isCurrentlyValidating
                                  ? 'Validation...'
                                  : 'Valider la visite',
                                variant: isValidated ? 'gray' : 'primary',
                                disabled: isValidated || isCurrentlyValidating,
                                onClick: () => {
                                  if (isValidated) return;
                                  handleValidateSubmittedVisit({
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
                                  neighborhood: pdv.neighborhood || 'Bamako',
                                  city: 'Bamako',
                                  created_by: pdv.vendorName || displayName,
                                  vendor_code: pdv.vendorCode || displayCode,
                                  status: isValidated ? 'valide' : 'en_attente',
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
                                      authorName={pdv.vendorName || displayName}
                                      authorCode={pdv.vendorCode || displayCode}
                                      visitDate={pdv.visitDate || data?.serverDate}
                                      visitTime={pdv.visitTime}
                                      visitId={pdv.visitId}
                                      pdvId={pdv.id}
                                      vendorId={pdv.vendorId || vendorId}
                                      viewerRole={viewerRole}
                                      viewerName={viewerName}
                                      reactionStatus={pdv.motifReactionStatus}
                                      reactionComment={pdv.motifReactionComment}
                                      reactedBy={pdv.motifReactedBy}
                                      reactedRole={pdv.motifReactedRole}
                                      reactedAt={pdv.motifReactedAt}
                                      reactionsHistory={pdv.motifReactionsHistory}
                                      onReactionSuccess={() => fetchVendorDailyPerformance(true)}
                                    />
                                  ) : undefined
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ==============================================================
              BLOC 3 : LE CA & LIVRAISON DU JOUR / PÉRIODE (SUR TOUTE UNE LIGNE)
          ============================================================== */}
          <div className="min-w-0 @[700px]:col-span-2 rounded-2xl border-2 border-emerald-500/30 dark:border-emerald-500/40 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between space-y-3.5 overflow-hidden">
            <div className="space-y-3.5 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block leading-snug">
                      3. Ventes du jour • En direct ({periodDisplayTitle})
                    </span>
                    <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug mt-0.5">
                      CA &amp; Livraisons du jour — {kpis.salesCountToday} vente(s) •{' '}
                      {kpis.salesCartonsToday} carton(s)
                    </h4>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-black shrink-0 whitespace-nowrap">
                  {isCustomPeriod ? 'CA Période' : 'CA Jour'}
                </span>
              </div>

              <div className="grid grid-cols-1 @[700px]:grid-cols-2 @[1040px]:grid-cols-12 gap-3 items-stretch min-w-0">
                {/* Montant total des ventes */}
                <div className="@[1040px]:col-span-4 p-3.5 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xs flex flex-col justify-between space-y-1 min-w-0">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100 block">
                      CA &amp; Livraisons ({periodDisplayTitle})
                    </span>
                    <div className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
                      <AdaptiveAmount amount={kpis.salesRevenueToday} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-emerald-100 font-semibold pt-1">
                    <span>
                      {kpis.salesCartonsToday} carton(s) livré(s) • {kpis.uniquePdvsSoldToday} PDV
                      facturé(s)
                    </span>
                  </div>
                </div>

                {/* Panier moyen & Taux de transformation Visite -> Vente */}
                <div className="@[1040px]:col-span-4 grid grid-cols-2 gap-2.5 min-w-0">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex flex-col justify-center min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                      Panier Moyen
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block mt-1 whitespace-nowrap">
                      {kpis.averageBasketToday.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex flex-col justify-center min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                      Transformation
                    </span>
                    <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 block mt-1">
                      {kpis.conversionRatePercent}% des PDV visités
                    </span>
                  </div>
                </div>

                {/* Répartition par mode de paiement */}
                <div className="@[700px]:col-span-2 @[1040px]:col-span-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex flex-col justify-center space-y-1.5 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block">
                    Encaissements par mode ({isCustomPeriod ? 'Période' : 'Jour'})
                  </span>
                  {paymentBreakdown.length > 0 ? (
                    <div className="space-y-1">
                      {paymentBreakdown.map((p) => (
                        <div
                          key={p.paymentType}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold"
                        >
                          <span className="text-slate-700 dark:text-slate-300">
                            {p.paymentType} ({p.count})
                          </span>
                          <span className="text-slate-900 dark:text-white font-black whitespace-nowrap">
                            {p.amount.toLocaleString('fr-FR')} FCFA ({p.sharePercent}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Aucune vente facturée sur cette période ({periodDisplayTitle}).
                    </div>
                  )}
                </div>
              </div>

              {/* Historique des ventes de la période (PDV, Routine liée, Produit & Cartons achetés, Date et Heure) */}
              {salesList.length > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 space-y-1.5 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-800 dark:text-emerald-300 block">
                    Historique des ventes ({salesList.length})
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {salesList.map((s) => (
                      <div
                        key={s.id}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-0.5 [overflow-wrap:anywhere]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {s.pdvName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] font-bold">
                            {s.routineName || defaultRoutineName} ({s.routineDay || kpis.activeDayName})
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {s.items && s.items.length > 0
                            ? s.items
                                .map(
                                  (it) =>
                                    `${it.name} : ${it.qtyBoxes ?? it.quantity ?? 0} carton(s)`
                                )
                                .join(' • ')
                            : `${s.cartonsCount} carton(s)`}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>
                            {s.date} à {s.saleTime}
                          </span>
                          <span className="font-black text-[#15803D] dark:text-emerald-400">
                            {Number(s.totalAmount || 0).toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================
            BLOC 4 : LES VISITES ET PDV RÉALISÉS SUR LA JOURNÉE EN COURS / PÉRIODE
        ================================================================ */}
        <div className="box-border min-w-0 [overflow-wrap:anywhere] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 min-w-0">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#006D77] shrink-0" />
                <span>
                  4. Visites &amp; PDV réalisés — {periodDisplayTitle} ({visitsList.length})
                </span>
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                Liste des visites effectuées et des PDV créés par {displayName} ({periodDisplayTitle}
                ).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 text-xs font-black">
                PDV créés : {kpis.pdvsCreatedTodayCount}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[#006D77] text-white text-xs font-black">
                {kpis.realizedPdvCount} / {kpis.dailyTargetPdv} PDV
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Chargement des visites et PDV réalisés par {displayName}...
            </div>
          ) : visitsList.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Aucune visite ni création de PDV enregistrée pour {displayName} sur{' '}
                {periodDisplayTitle}.
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Les visites pointées et les points de vente créés sur la période sélectionnée
                s&apos;affichent automatiquement ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 @[700px]:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1 box-border min-w-0">
              {visitsList.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1.5 box-border min-w-0 [overflow-wrap:anywhere]"
                >
                  {/* Ligne 1 : Nom du PDV */}
                  <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                    {v.pdvName} {v.pdvCode ? `(${v.pdvCode})` : ''}
                  </div>

                  {/* Ligne 2 : Quartier et heure de visite */}
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                    Quartier : {v.pdvNeighborhood || 'Bamako'} · Heure de visite :{' '}
                    {v.visitDate && isCustomPeriod ? `${v.visitDate} à ` : ''}
                    {String(v.visitTime || '').slice(0, 8)}
                  </div>

                  {/* Ligne 3 : Badges de statut */}
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/70 text-[#006D77] dark:text-cyan-300">
                      Visité {Math.max(1, Number(v.routineDayVisitsCount || v.todayVisitsCount || 1))} fois ({v.routineDay || kpis.activeDayName})
                    </span>
                    {v.hasSaleToday ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#15803D] text-white">
                        Avec vente
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#92400E] text-white">
                        Visite sans vente
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        v.isCounted
                          ? 'bg-[#006D77] text-white'
                          : 'bg-[#92400E] text-white'
                      }`}
                    >
                      {v.isCounted ? `Compté / ${kpis.dailyTargetPdv}` : 'Passage supplémentaire'}
                    </span>
                    {v.validationStatus === 'valide' ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#15803D] text-white">
                        Validé{v.validatedBy ? ` par ${v.validatedBy}` : ''}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#92400E] text-white">
                        En attente de validation
                      </span>
                    )}
                    {v.statusReason && !v.noSaleReason && (
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {v.statusReason}
                      </span>
                    )}
                  </div>

                  {/* Bloc message "Motif du vendeur" en lecture seule + réaction DOV séparée */}
                  {v.noSaleReason && (
                    <VendorNoSaleMotifMessageBlock
                      motif={v.noSaleReason}
                      authorName={v.vendorName || displayName}
                      authorCode={v.vendorCode || displayCode}
                      visitDate={v.visitDate || data?.serverDate}
                      visitTime={v.visitTime}
                      visitId={v.id}
                      pdvId={v.pdvId}
                      vendorId={v.vendorId || vendorId}
                      viewerRole={viewerRole}
                      viewerName={viewerName}
                      reactionStatus={v.motifReactionStatus}
                      reactionComment={v.motifReactionComment}
                      reactedBy={v.motifReactedBy}
                      reactedRole={v.motifReactedRole}
                      reactedAt={v.motifReactedAt}
                      reactionsHistory={v.motifReactionsHistory}
                      onReactionSuccess={() => fetchVendorDailyPerformance(true)}
                    />
                  )}

                  {/* Ligne 4 : Bouton de validation de visite (uniquement pour DOV, Administrateur, Sales Admin / Contrôleur) */}
                  {isSupervisor && (() => {
                    const isRowValidated =
                      v.validationStatus === 'valide' ||
                      Boolean(validatedPdvIds[String(v.id)]) ||
                      Boolean(validatedPdvIds[String(v.pdvId)]);
                    const isRowValidating =
                      validatingKey === String(v.id || `pdv-${v.pdvId}`) ||
                      validatingKey === `pdv-${v.pdvId}`;
                    return (
                      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 pt-1 box-border min-w-0">
                        <button
                          type="button"
                          disabled={isRowValidated || isRowValidating}
                          onClick={() => {
                            if (isRowValidated) return;
                            handleValidateSubmittedVisit({
                              visitId: v.id,
                              pdvId: v.pdvId,
                            });
                          }}
                          className={`box-border w-full min-w-0 min-h-[48px] px-2.5 py-2 rounded-lg text-xs font-extrabold leading-tight text-center flex items-center justify-center ${
                            isRowValidated
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-75'
                              : 'bg-[#006D77] hover:bg-[#005a63] text-white cursor-pointer disabled:opacity-50'
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
      </div>
    </div>
  );
};
