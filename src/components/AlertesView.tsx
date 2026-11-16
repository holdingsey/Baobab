import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Info,
  Sliders,
  RefreshCw,
  CheckCircle2,
  Clock,
  MessageSquare,
  History,
  User,
  Tag,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { FormModal } from './FormModal';
import {
  FORM_FIELD_CLASS,
  FORM_LABEL_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FORM_ROW_CLASS,
} from './FormControls';

export interface MeasuredValueItem {
  label: string;
  value: string;
}

export interface AnomalyStatusHistoryItem {
  id: string;
  alert_id: string;
  alert_ref: string;
  previous_status: string;
  new_status: string;
  comment: string;
  changed_by_id?: string;
  changed_by_name: string;
  changed_by_role: string;
  created_at: string;
}

export interface AnomalyAlertItem {
  id: string;
  dedup_key: string;
  rule_code: string;
  type_label: string;
  domain: 'commercial' | 'stock' | 'caisse';
  severity: 'Info' | 'Attention' | 'Critique';
  target_type: string;
  target_ref: string;
  target_label: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_code?: string | null;
  explanation: string;
  measured_values: MeasuredValueItem[];
  status: 'Nouvelle' | 'En examen' | 'Justifiée' | 'Confirmée';
  comment: string;
  updated_by?: string | null;
  updated_by_role?: string | null;
  updated_at?: string | null;
  detected_at: string;
  created_at: string;
  history?: AnomalyStatusHistoryItem[];
}

export interface AnomalyThresholdsConfig {
  price_tolerance_pct: number;
  volume_multiplier: number;
  inventory_ecart_count: number;
  inventory_window_days: number;
  inactive_vendor_days: number;
  pdv_burst_count: number;
  gps_frozen_count: number;
  gps_max_speed_kmh: number;
  cancel_frequent_count: number;
  cancel_window_days: number;
  late_versement_days: number;
  caisse_ecart_min_fcfa: number;
  min_stock_floor: number;
}

interface AlertesViewProps {
  currentUser: UserSession;
  usersList?: UserSession[];
  onAlertsUpdated?: (newCount: number) => void;
}

export const AlertesView: React.FC<AlertesViewProps> = ({
  currentUser,
  usersList = [],
  onAlertsUpdated,
}) => {
  const [alerts, setAlerts] = useState<AnomalyAlertItem[]>([]);
  const [newCount, setNewCount] = useState<number>(0);
  const [thresholds, setThresholds] = useState<AnomalyThresholdsConfig>({
    price_tolerance_pct: 0,
    volume_multiplier: 3,
    inventory_ecart_count: 3,
    inventory_window_days: 30,
    inactive_vendor_days: 3,
    pdv_burst_count: 4,
    gps_frozen_count: 3,
    gps_max_speed_kmh: 100,
    cancel_frequent_count: 2,
    cancel_window_days: 14,
    late_versement_days: 2,
    caisse_ecart_min_fcfa: 1,
    min_stock_floor: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtres : gravité, type, vendeur, statut
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal de changement de statut + commentaire
  const [editingAlert, setEditingAlert] = useState<AnomalyAlertItem | null>(null);
  const [nextStatus, setNextStatus] = useState<'Nouvelle' | 'En examen' | 'Justifiée' | 'Confirmée'>('En examen');
  const [nextComment, setNextComment] = useState<string>('');
  const [savingStatus, setSavingStatus] = useState<boolean>(false);

  // Modal de réglage des seuils (Administrateur uniquement)
  const [showThresholdsModal, setShowThresholdsModal] = useState<boolean>(false);
  const [draftThresholds, setDraftThresholds] = useState<AnomalyThresholdsConfig>(thresholds);
  const [savingThresholds, setSavingThresholds] = useState<boolean>(false);

  // Historique d'audit déplié par carte
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'Administrateur';

  const fetchAnomalies = useCallback(async () => {
    try {
      const res = await fetch('/api/anomalies', {
        headers: {
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
      });
      if (!res.ok) {
        setAlerts([]);
        setNewCount(0);
        return;
      }
      const data = await res.json();
      if (data.success) {
        const list = Array.isArray(data.alerts) ? data.alerts : [];
        setAlerts(list);
        const countNouvelles = typeof data.newCount === 'number'
          ? data.newCount
          : list.filter((a: AnomalyAlertItem) => a.status === 'Nouvelle').length;
        setNewCount(countNouvelles);
        if (onAlertsUpdated) {
          onAlertsUpdated(countNouvelles);
        }
        if (data.thresholds) {
          setThresholds(data.thresholds);
          setDraftThresholds(data.thresholds);
        }
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, currentUser.id, onAlertsUpdated]);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  const handleRunScanNow = async () => {
    setScanning(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/anomalies/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchAnomalies();
        setFeedback({
          type: 'success',
          text: 'Vérification des règles exécutée avec succès (fuseau Africa/Bamako).',
        });
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'Erreur lors de la vérification.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Erreur réseau lors de la vérification.' });
    } finally {
      setScanning(false);
    }
  };

  const handleOpenStatusModal = (alert: AnomalyAlertItem) => {
    setEditingAlert(alert);
    setNextStatus(alert.status === 'Nouvelle' ? 'En examen' : alert.status);
    setNextComment(alert.comment || '');
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlert) return;
    setSavingStatus(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/anomalies/${encodeURIComponent(editingAlert.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          status: nextStatus,
          comment: nextComment.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingAlert(null);
        await fetchAnomalies();
        setFeedback({
          type: 'success',
          text: `Statut de l'alerte mis à jour (${nextStatus}) et tracé dans l'audit.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'Impossible de mettre à jour le statut.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Erreur réseau lors de la mise à jour.' });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingThresholds(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/anomalies/thresholds', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({ thresholds: draftThresholds }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowThresholdsModal(false);
        await fetchAnomalies();
        setFeedback({
          type: 'success',
          text: 'Seuils de détection enregistrés et règles réévaluées.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'Erreur lors de la sauvegarde des seuils.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Erreur réseau lors de la sauvegarde des seuils.' });
    } finally {
      setSavingThresholds(false);
    }
  };

  // Liste des types distincts disponibles pour le filtre
  const availableTypes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alerts) {
      map.set(a.rule_code, a.type_label);
    }
    return Array.from(map.entries()).map(([code, label]) => ({ code, label }));
  }, [alerts]);

  // Liste des vendeurs pour le filtre
  const availableVendors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const u of usersList) {
      if (u.role === 'Vendeur') {
        map.set(u.id, { id: u.id, name: u.name, code: u.code });
      }
    }
    for (const a of alerts) {
      if (a.vendor_id && a.vendor_name && !map.has(a.vendor_id)) {
        map.set(a.vendor_id, {
          id: a.vendor_id,
          name: a.vendor_name,
          code: a.vendor_code || '',
        });
      }
    }
    return Array.from(map.values());
  }, [usersList, alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
      if (typeFilter !== 'ALL' && a.rule_code !== typeFilter) return false;
      if (vendorFilter !== 'ALL' && a.vendor_id !== vendorFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      return true;
    });
  }, [alerts, severityFilter, typeFilter, vendorFilter, statusFilter]);

  const getSeverityBadge = (severity: AnomalyAlertItem['severity']) => {
    if (severity === 'Critique') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0 text-[#DC2626]" />
          <span>Critique</span>
        </span>
      );
    }
    if (severity === 'Attention') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>Attention</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
        <Info className="w-3.5 h-3.5 shrink-0 text-sky-600" />
        <span>Info</span>
      </span>
    );
  };

  const getStatusBadge = (status: AnomalyAlertItem['status']) => {
    if (status === 'Nouvelle') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#DC2626] text-white">
          <span>Nouvelle</span>
        </span>
      );
    }
    if (status === 'En examen') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/50">
          <Clock className="w-3 h-3 shrink-0" />
          <span>En examen</span>
        </span>
      );
    }
    if (status === 'Justifiée') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-400/50">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          <span>Justifiée</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-400/50">
        <ShieldAlert className="w-3 h-3 shrink-0" />
        <span>Confirmée</span>
      </span>
    );
  };

  const getDomainLabel = (domain: AnomalyAlertItem['domain']) => {
    if (domain === 'commercial') return 'Commercial & Terrain';
    if (domain === 'stock') return 'Stock & Lots';
    return 'Caisse & Versements';
  };

  if (currentUser.role === 'Vendeur') {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* En-tête de page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <ShieldAlert className="w-6 h-6 text-[#008DA9] shrink-0" />
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
              Alertes &amp; Détection d&apos;Anomalies
            </h1>
            {newCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[#DC2626] text-white text-xs font-black shrink-0"
                title={`${newCount} nouvelle(s) alerte(s)`}
              >
                {newCount}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Exécution automatique à chaque événement et chaque nuit à 00h00 (Africa/Bamako). Une alerte est une aide à la décision, jamais une sanction automatique.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleRunScanNow}
            disabled={scanning}
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition"
          >
            <RefreshCw className={`w-4 h-4 text-[#008DA9] shrink-0 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Analyse...' : 'Analyser maintenant'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setDraftThresholds(thresholds);
                setShowThresholdsModal(true);
              }}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition shadow-xs"
            >
              <Sliders className="w-4 h-4 shrink-0" />
              <span>Seuils réglables</span>
            </button>
          )}
        </div>
      </div>

      {/* Bandeau d'aide non-bloquant */}
      <div className="p-3.5 rounded-2xl bg-teal-50/90 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 flex items-start gap-2.5 text-xs text-teal-950 dark:text-teal-200">
        <ShieldCheck className="w-4 h-4 text-[#008DA9] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 leading-relaxed">
          <strong>Aide au contrôle interne (aucune action bloquante) :</strong> Les alertes signalent les écarts mesurés pour vérification contradictoire. Chaque changement de statut (<em>Nouvelle</em>, <em>En examen</em>, <em>Justifiée</em>, <em>Confirmée</em>) avec commentaire est enregistré dans le journal d&apos;audit.
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="px-2 py-0.5 rounded font-mono text-sm cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Résumé rapide par statut et gravité */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Nouvelles alertes</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-black text-[#DC2626]">{newCount}</span>
            {newCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[11px] font-bold">
                À traiter
              </span>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Critiques</div>
          <div className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
            {alerts.filter((a) => a.severity === 'Critique').length}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">En examen</div>
          <div className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
            {alerts.filter((a) => a.status === 'En examen').length}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Traitées (Justifiées / Confirmées)</div>
          <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {alerts.filter((a) => a.status === 'Justifiée' || a.status === 'Confirmée').length}
          </div>
        </div>
      </div>

      {/* Barre des 4 filtres : Gravité, Type, Vendeur, Statut */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Gravité
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="ALL">Toutes les gravités</option>
              <option value="Critique">Critique</option>
              <option value="Attention">Attention</option>
              <option value="Info">Info</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Type d&apos;anomalie
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="ALL">Tous les types ({availableTypes.length})</option>
              {availableTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Vendeur concerné
            </label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="ALL">Tous les vendeurs</option>
              {availableVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Statut de traitement
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="Nouvelle">Nouvelle</option>
              <option value="En examen">En examen</option>
              <option value="Justifiée">Justifiée</option>
              <option value="Confirmée">Confirmée</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des cartes d'alertes */}
      {loading ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
          Chargement des alertes d&apos;anomalies...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
          <div className="font-bold text-slate-800 dark:text-slate-200">
            Aucune alerte ne correspond aux filtres sélectionnés
          </div>
          <p className="text-xs text-slate-500">
            Modifiez les filtres ci-dessus ou lancez une analyse manuelle.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredAlerts.map((alert) => {
            const isHistoryOpen = expandedHistoryId === alert.id;
            return (
              <div
                key={alert.id}
                className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition shadow-xs space-y-3.5 ${
                  alert.severity === 'Critique' && alert.status === 'Nouvelle'
                    ? 'border-red-300 dark:border-red-800/90'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Ligne 1 : Badges Type, Gravité, Statut, Domaine + Bouton qualifier */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getSeverityBadge(alert.severity)}
                      {getStatusBadge(alert.status)}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {alert.type_label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                        {getDomainLabel(alert.domain)}
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        {alert.id}
                      </span>
                    </div>

                    {/* Élément concerné & Vendeur */}
                    <div className="flex items-center gap-3 flex-wrap pt-0.5">
                      <div className="inline-flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">
                        <Tag className="w-4 h-4 text-[#008DA9] shrink-0" />
                        <span>
                          {alert.target_type} : {alert.target_label} ({alert.target_ref})
                        </span>
                      </div>

                      {alert.vendor_name && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                          <User className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                          <span>
                            {alert.vendor_name}
                            {alert.vendor_code ? ` (${alert.vendor_code})` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenStatusModal(alert)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--marque-clair)] hover:bg-[#008DA9]/20 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Statut &amp; Commentaire</span>
                    </button>
                  </div>
                </div>

                {/* Explication en une phrase */}
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
                  {alert.explanation}
                </p>

                {/* Valeurs mesurées */}
                {Array.isArray(alert.measured_values) && alert.measured_values.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {alert.measured_values.map((mv, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800"
                      >
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {mv.label}
                        </div>
                        <div className="text-xs sm:text-sm font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">
                          {mv.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Commentaire enregistré & pied de carte (date + historique d'audit) */}
                {alert.comment && (
                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-1">
                    <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Commentaire de qualification
                        {alert.updated_by ? ` (${alert.updated_by} • ${alert.updated_by_role})` : ''} :
                      </span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200">{alert.comment}</div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-500">
                  <span>
                    Détectée le{' '}
                    <strong className="font-mono text-slate-700 dark:text-slate-300">
                      {String(alert.detected_at || '').replace('T', ' ').slice(0, 16)}
                    </strong>
                  </span>

                  {Array.isArray(alert.history) && alert.history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedHistoryId(isHistoryOpen ? null : alert.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#008DA9] dark:text-teal-300 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Journal d&apos;audit ({alert.history.length})
                      </span>
                    </button>
                  )}
                </div>

                {isHistoryOpen && Array.isArray(alert.history) && alert.history.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Historique audité des changements de statut :
                    </div>
                    {alert.history.map((h) => (
                      <div
                        key={h.id}
                        className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {h.previous_status} &rarr; {h.new_status}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {String(h.created_at || '').replace('T', ' ').slice(0, 16)}
                          </span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-300">
                          Par <strong>{h.changed_by_name}</strong> ({h.changed_by_role})
                          {h.comment ? ` — « ${h.comment} »` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de qualification (Statut + Commentaire audité) */}
      {editingAlert && (
        <FormModal
          title={`Qualifier l'alerte ${editingAlert.id}`}
          subtitle={`${editingAlert.type_label} • ${editingAlert.target_label}`}
          icon={<ShieldAlert className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setEditingAlert(null)}
          onSubmit={handleSaveStatus}
          submitLabel={savingStatus ? 'Enregistrement...' : 'Enregistrer le statut'}
          submitDisabled={savingStatus}
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                {editingAlert.target_label} ({editingAlert.target_ref})
              </div>
              <div className="text-slate-600 dark:text-slate-300">{editingAlert.explanation}</div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Nouveau statut de l&apos;alerte *</label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as any)}
                className={FORM_SELECT_CLASS}
              >
                <option value="Nouvelle">Nouvelle</option>
                <option value="En examen">En examen</option>
                <option value="Justifiée">Justifiée (écart expliqué / autorisé)</option>
                <option value="Confirmée">Confirmée (anomalie avérée)</option>
              </select>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Commentaire de vérification / justification
              </label>
              <textarea
                rows={3}
                value={nextComment}
                onChange={(e) => setNextComment(e.target.value)}
                placeholder="Indiquez l'explication recueillie ou la vérification effectuée..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* Modal de configuration des seuils par l'Administrateur */}
      {showThresholdsModal && isAdmin && (
        <FormModal
          title="Seuils de Détection d'Anomalies (Administrateur)"
          subtitle="Ajustez les seuils des 10 règles exécutées à chaque événement et chaque nuit (Africa/Bamako)."
          icon={<Sliders className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowThresholdsModal(false)}
          onSubmit={handleSaveThresholds}
          submitLabel={savingThresholds ? 'Enregistrement...' : 'Enregistrer les seuils'}
          submitDisabled={savingThresholds}
        >
          <div className="space-y-4 text-xs">
            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  1. Écart de prix catalogue toléré (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={draftThresholds.price_tolerance_pct}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      price_tolerance_pct: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  2. Multiple volume / moyenne vendeur (×)
                </label>
                <input
                  type="number"
                  min={1.5}
                  max={20}
                  step={0.5}
                  value={draftThresholds.volume_multiplier}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      volume_multiplier: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  3. Nombre d&apos;écarts d&apos;inventaire répétés
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draftThresholds.inventory_ecart_count}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      inventory_ecart_count: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Fenêtre inventaires répétés (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={draftThresholds.inventory_window_days}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      inventory_window_days: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  4. Vendeur sans vente depuis (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={draftThresholds.inactive_vendor_days}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      inactive_vendor_days: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  5. PDV créés en rafale (nb max / 24h)
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={draftThresholds.pdv_burst_count}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      pdv_burst_count: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  6. Relevés GPS figés consécutifs
                </label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={draftThresholds.gps_frozen_count}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      gps_frozen_count: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Vitesse GPS maximale cohérente (km/h)
                </label>
                <input
                  type="number"
                  min={30}
                  max={250}
                  value={draftThresholds.gps_max_speed_kmh}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      gps_max_speed_kmh: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  7. Annulations de vente fréquentes (nb)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draftThresholds.cancel_frequent_count}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      cancel_frequent_count: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  8. Retard de versement max (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draftThresholds.late_versement_days}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      late_versement_days: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  9. Seuil d&apos;écart de caisse min (FCFA)
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={draftThresholds.caisse_ecart_min_fcfa}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      caisse_ecart_min_fcfa: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  10. Plancher stock minimal autorisé (cartons)
                </label>
                <input
                  type="number"
                  value={draftThresholds.min_stock_floor}
                  onChange={(e) =>
                    setDraftThresholds({
                      ...draftThresholds,
                      min_stock_floor: Number(e.target.value),
                    })
                  }
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
