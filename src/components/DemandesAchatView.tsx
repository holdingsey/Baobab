import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingBag,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  Trash2,
  MessageSquare,
  Bell,
  ShieldCheck,
  Package,
  Calculator,
  Printer,
  X,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { ConfirmDestructiveButton } from './FormControls';
import { DataTable } from './DataTable';
import { ExportViewButton } from './ExtractionsView';
import { InvoiceData } from './PrintableDocument';

interface PurchaseRequestItem {
  code: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface PurchaseRequestRecord {
  id: string;
  reference: string;
  requester_id: string;
  requester_name: string;
  requester_code: string;
  requester_role: 'Magasinier' | 'Comptable' | string;
  title: string;
  category: string;
  supplier_name: string;
  items: PurchaseRequestItem[];
  total_amount: number;
  request_motif?: string | null;
  status: 'en_attente' | 'validee' | 'rejetee';
  admin_motif?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

interface DemandesAchatViewProps {
  currentUser: UserSession;
  products?: any[];
  purchaseRequests?: PurchaseRequestRecord[];
  onRefreshData?: () => void;
  onOpenDocument?: (doc: InvoiceData) => void;
}

export const DemandesAchatView: React.FC<DemandesAchatViewProps> = ({
  currentUser,
  products = [],
  purchaseRequests: externalRequests,
  onRefreshData,
  onOpenDocument,
}) => {
  const isAdmin = currentUser.role === 'Administrateur';
  const isMagasinier = currentUser.role === 'Gestionnaire de stock' || currentUser.role === 'Magasinier';
  const isComptable = currentUser.role === 'Comptable';
  const canCreateRequest = isMagasinier || isComptable || isAdmin;

  const [requests, setRequests] = useState<PurchaseRequestRecord[]>(externalRequests || []);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'validee' | 'rejetee'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Gestionnaire de stock' | 'Magasinier' | 'Comptable'>('all');
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Modal state (Magasinier & Comptable)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(
    isMagasinier ? 'Réapprovisionnement Stock Dépôt' : 'Fournitures Comptables & Caisse'
  );
  const [supplierName, setSupplierName] = useState(
    isMagasinier ? 'Usine Bennor & Safie Production' : 'Papeterie & Équipements Bamako'
  );
  const [requestMotif, setRequestMotif] = useState('');
  const [items, setItems] = useState<PurchaseRequestItem[]>([
    {
      code: isMagasinier ? 'BEN-400' : 'FOUR-01',
      name: isMagasinier ? 'Lait Concentré Sucré Bennor 400g (Carton)' : 'Rouleaux papier thermique 80mm & Quittances',
      qty: isMagasinier ? 50 : 20,
      unitPrice: isMagasinier ? 18500 : 2500,
      total: isMagasinier ? 925000 : 50000,
    },
  ]);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Admin Decision Modal state
  const [decisionTarget, setDecisionTarget] = useState<{
    request: PurchaseRequestRecord;
    decision: 'validee' | 'rejetee';
  } | null>(null);
  const [adminMotif, setAdminMotif] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const fetchRequestsAndNotifs = useCallback(async () => {
    try {
      const [reqRes, notifRes] = await Promise.all([
        fetch('/api/purchase-requests', {
          headers: {
            'x-user-role': currentUser.role,
            'x-user-id': currentUser.id,
          },
        }),
        fetch('/api/notifications', {
          headers: {
            'x-user-role': currentUser.role,
            'x-user-id': currentUser.id,
          },
        }),
      ]);

      if (reqRes.ok) {
        const d = await reqRes.json();
        if (d.purchaseRequests) {
          setRequests(d.purchaseRequests);
        }
      }
      if (notifRes.ok) {
        const nd = await notifRes.json();
        if (nd.notifications) {
          setNotifications(
            nd.notifications.filter(
              (n: any) =>
                n.type === 'validation_demande_achat' ||
                n.type === 'rejet_demande_achat' ||
                n.type === 'demande_achat'
            )
          );
        }
      }
    } catch {
      // ignore
    }
  }, [currentUser.role, currentUser.id]);

  useEffect(() => {
    fetchRequestsAndNotifs();
  }, [fetchRequestsAndNotifs]);

  useEffect(() => {
    if (externalRequests && externalRequests.length > 0) {
      setRequests(externalRequests);
    }
  }, [externalRequests]);

  const handleAddLine = () => {
    setItems((prev) => [
      ...prev,
      {
        code: `ART-${prev.length + 1}`,
        name: '',
        qty: 1,
        unitPrice: 10000,
        total: 10000,
      },
    ]);
  };

  const handleAddCatalogProductLine = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const unitPrice = Number(prod.price_box || 15000);
    setItems((prev) => [
      ...prev,
      {
        code: prod.code || 'PROD',
        name: `${prod.name} (${prod.packaging || 'Carton'})`,
        qty: 20,
        unitPrice,
        total: 20 * unitPrice,
      },
    ]);
  };

  const handleUpdateLine = (index: number, field: keyof PurchaseRequestItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        const q = Math.max(1, Number(updated.qty || 1));
        const p = Math.max(0, Number(updated.unitPrice || 0));
        updated.qty = q;
        updated.unitPrice = p;
        updated.total = q * p;
        return updated;
      })
    );
  };

  const handleRemoveLine = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const computedTotal = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.total || 0), 0),
    [items]
  );

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateRequest || !title.trim() || items.length === 0) return;

    setIsSubmittingCreate(true);
    try {
      const res = await fetch('/api/purchase-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          requester_id: currentUser.id,
          requester_name: currentUser.name,
          requester_code: currentUser.code,
          title: title.trim(),
          category,
          supplier_name: supplierName.trim() || 'Fournisseur Agréé Bamako',
          items: items.filter((it) => it.name.trim() !== ''),
          total_amount: computedTotal,
          request_motif: requestMotif.trim() || null, // Motif optionnel
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowCreateModal(false);
        setTitle('');
        setRequestMotif('');
        setFeedbackBanner({
          type: 'success',
          text: `Votre demande d'achat ${data.purchaseRequest?.reference || ''} (${computedTotal.toLocaleString('fr-FR')} FCFA) a été transmise à l'Administrateur pour validation.`,
        });
        await fetchRequestsAndNotifs();
        onRefreshData?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: data.error || "Erreur lors de l'envoi de la demande d'achat.",
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: "Impossible de contacter le serveur pour envoyer la demande d'achat.",
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleConfirmAdminDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !decisionTarget) return;

    setIsSubmittingDecision(true);
    try {
      const res = await fetch(`/api/purchase-requests/${decisionTarget.request.id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          decision: decisionTarget.decision,
          admin_motif: adminMotif.trim() || null, // Motif optionnel de l'Admin
          reviewed_by: `${currentUser.name} (${currentUser.code})`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const actionLabel = decisionTarget.decision === 'validee' ? 'validée' : 'rejetée';
        setFeedbackBanner({
          type: 'success',
          text: `Demande d'achat ${decisionTarget.request.reference} ${actionLabel} avec succès. Une notification a été envoyée à ${decisionTarget.request.requester_name} (${decisionTarget.request.requester_role}).`,
        });
        setDecisionTarget(null);
        setAdminMotif('');
        await fetchRequestsAndNotifs();
        onRefreshData?.();
      } else {
        setFeedbackBanner({
          type: 'error',
          text: data.error || 'Erreur lors du traitement de la demande.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Erreur réseau lors de la validation/rejet.',
      });
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const visibleRequests = useMemo(() => {
    return requests.filter((r) => {
      const sameRole =
        r.requester_role === currentUser.role ||
        (isMagasinier && (r.requester_role === 'Gestionnaire de stock' || r.requester_role === 'Magasinier'));
      if (!isAdmin && !sameRole && r.requester_id !== currentUser.id) {
        return false;
      }
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (isAdmin && roleFilter !== 'all') {
        if (roleFilter === 'Gestionnaire de stock' || roleFilter === 'Magasinier') {
          if (r.requester_role !== 'Gestionnaire de stock' && r.requester_role !== 'Magasinier') return false;
        } else if (r.requester_role !== roleFilter) {
          return false;
        }
      }
      return true;
    });
  }, [requests, isAdmin, isMagasinier, currentUser.role, currentUser.id, statusFilter, roleFilter]);

  const counts = useMemo(() => {
    const base = isAdmin
      ? requests
      : requests.filter(
          (r) =>
            r.requester_role === currentUser.role ||
            (isMagasinier && (r.requester_role === 'Gestionnaire de stock' || r.requester_role === 'Magasinier')) ||
            r.requester_id === currentUser.id
        );
    return {
      total: base.length,
      pending: base.filter((r) => r.status === 'en_attente').length,
      validated: base.filter((r) => r.status === 'validee').length,
      rejected: base.filter((r) => r.status === 'rejetee').length,
      totalValidatedAmount: base
        .filter((r) => r.status === 'validee')
        .reduce((acc, r) => acc + Number(r.total_amount || 0), 0),
    };
  }, [requests, isAdmin, isMagasinier, currentUser.role, currentUser.id]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isAdmin
                ? "Validation des Demandes d'Achat"
                : "Mes Demandes d'Achat"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-white">
              {isAdmin
                ? 'Administrateur'
                : currentUser.role === 'Gestionnaire de stock'
                ? 'Magasinier'
                : currentUser.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Suivi et validation des demandes d&apos;achat.
            </p>
            <InfoTooltip
              text={
                isAdmin
                  ? "Examinez, validez ou rejetez les demandes d'achat soumises par le Gestionnaire de stock et le Comptable (avec motif optionnel). Le demandeur reçoit immédiatement une notification de votre décision."
                  : "Soumettez vos demandes d'achat (avec motif optionnel) à l'Administrateur et recevez une notification dès validation ou rejet."
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ExportViewButton
            currentUser={currentUser as any}
            jeu="demandes_achat"
            label="Exporter"
          />
          {canCreateRequest ? (
            <button
              type="button"
              onClick={() => {
                setTitle(
                  isMagasinier
                    ? 'Réapprovisionnement cartons dépôt Sotuba'
                    : 'Commande fournitures comptables & rouleaux thermiques'
                );
                setRequestMotif('');
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle Demande d&apos;Achat</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              <span>Validation / Rejet Administrateur (Motif optionnel)</span>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-sm font-mono px-2 py-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Recent Decision Notifications for Magasinier / Comptable */}
      {!isAdmin && notifications.length > 0 && (
        <div className="rounded-2xl border border-[#008DA9]/30 bg-cyan-50/50 dark:bg-cyan-950/20 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#008DA9]" />
              <span>Notifications de Validation / Rejet reçues de l&apos;Administrateur</span>
            </div>
            <span className="text-[11px] font-bold text-[#008DA9]">
              {notifications.length} notification(s)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {notifications.slice(0, 4).map((n) => {
              const isRejected = n.type === 'rejet_demande_achat';
              return (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border text-xs ${
                    isRejected
                      ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/80 text-rose-900 dark:text-rose-200'
                      : 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-black">
                    <span className="flex items-center gap-1.5">
                      {isRejected ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      {n.title}
                    </span>
                    <span className="text-[10px] opacity-75 font-mono">
                      {(n.created_at || '').split('T')[0]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug opacity-90">{n.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Demandes</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{counts.total}</div>
          <span className="text-[11px] text-slate-500">Magasinier &amp; Comptable</span>
        </div>

        <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
            En attente de l&apos;Admin
          </span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {counts.pending}
          </div>
          <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
            À valider ou rejeter
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Demandes Validées
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {counts.validated}
          </div>
          <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
            {counts.totalValidatedAmount.toLocaleString('fr-FR')} FCFA approuvés
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-950/20 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
            Demandes Rejetées
          </span>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {counts.rejected}
          </div>
          <span className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
            Refusées par l&apos;Admin
          </span>
        </div>
      </div>

      {/* Filters — Grille de boutons en rangées et colonnes sans débordement */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-2 border ${
              statusFilter === 'all'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>Toutes</span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-black/10 dark:bg-white/10">
              {counts.total}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('en_attente')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-2 border ${
              statusFilter === 'en_attente'
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>En attente</span>
            </span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-black/10 dark:bg-white/10">
              {counts.pending}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('validee')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-2 border ${
              statusFilter === 'validee'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Validées</span>
            </span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-black/10 dark:bg-white/10">
              {counts.validated}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('rejetee')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-2 border ${
              statusFilter === 'rejetee'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Rejetées</span>
            </span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-black/10 dark:bg-white/10">
              {counts.rejected}
            </span>
          </button>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'Magasinier', 'Comptable'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center border ${
                  roleFilter === r
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {r === 'all' ? 'Tous les demandeurs' : `Demandeur : ${r}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Requests List */}
      <div className="space-y-4">
        {visibleRequests.length === 0 ? (
          <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
            Aucune demande d&apos;achat trouvée pour ce filtre.
          </div>
        ) : (
          visibleRequests.map((req) => {
            const isPending = req.status === 'en_attente';
            const isValidee = req.status === 'validee';
            const isRejetee = req.status === 'rejetee';
            const createdDate = (req.created_at || '').split('T')[0];
            const createdTime = (req.created_at || '').split('T')[1]?.slice(0, 5) || '09:00';

            return (
              <div
                key={req.id}
                className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-xs transition space-y-4 ${
                  isPending
                    ? 'border-amber-300 dark:border-amber-800/80'
                    : isValidee
                    ? 'border-emerald-200 dark:border-emerald-800/70'
                    : 'border-rose-200 dark:border-rose-800/70'
                }`}
              >
                {/* Top Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                        {req.reference}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          req.requester_role === 'Magasinier'
                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                        }`}
                      >
                        {req.requester_role === 'Magasinier' ? (
                          <Package className="w-3 h-3" />
                        ) : (
                          <Calculator className="w-3 h-3" />
                        )}
                        <span>
                          {req.requester_role} • {req.requester_name} ({req.requester_code})
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Soumise le {createdDate} à {createdTime}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {req.title}
                    </h3>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        Catégorie : <strong className="text-slate-700 dark:text-slate-300">{req.category}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Fournisseur : <strong className="text-slate-700 dark:text-slate-300">{req.supplier_name}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Montant Total Demandé
                      </span>
                      <span className="text-lg font-black text-[#008DA9]">
                        {Number(req.total_amount || 0).toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>

                    <div>
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 text-xs font-black">
                          <Clock className="w-3.5 h-3.5" />
                          <span>En attente Admin</span>
                        </span>
                      )}
                      {isValidee && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 text-xs font-black">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Validée par l&apos;Admin</span>
                        </span>
                      )}
                      {isRejetee && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-300 text-xs font-black">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rejetée par l&apos;Admin</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <DataTable
                  data={(req.items || []).map((it, idx) => ({ ...it, idx }))}
                  rowKey={(it) => `${req.id}-item-${it.idx}`}
                  pageSize={20}
                  emptyMessage="Aucun article dans cette demande."
                  mobileTitle={(it) => (
                    <div>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {it.code || `ART-0${it.idx + 1}`}
                      </span>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white mt-1">
                        {it.name}
                      </div>
                    </div>
                  )}
                  mobileBadge={(it) => (
                    <span className="font-black text-xs text-[#008DA9] whitespace-nowrap">
                      {Number(it.total || 0).toLocaleString('fr-FR')} FCFA
                    </span>
                  )}
                  totalsFooter={
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Total articles : {(req.items || []).length}</span>
                      <span className="whitespace-nowrap font-black text-[var(--marque-fonce)] dark:text-teal-300">
                        Total : {Number(req.total_amount || 0).toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                  }
                  columns={[
                    {
                      key: 'code',
                      header: 'Réf.',
                      hideOnMobileCard: true,
                      render: (it) => (
                        <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                          {it.code || `ART-0${it.idx + 1}`}
                        </span>
                      ),
                    },
                    {
                      key: 'name',
                      header: "Désignation de l'article / besoin",
                      hideOnMobileCard: true,
                      render: (it) => (
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {it.name}
                        </span>
                      ),
                    },
                    {
                      key: 'qty',
                      header: 'Quantité',
                      mobileLabel: 'Quantité',
                      align: 'center',
                      isNumeric: true,
                      render: (it) => (
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {it.qty}
                        </span>
                      ),
                    },
                    {
                      key: 'unitPrice',
                      header: 'Prix Unitaire',
                      mobileLabel: 'Prix Unitaire',
                      align: 'right',
                      isNumeric: true,
                      render: (it) => (
                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                          {Number(it.unitPrice || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      ),
                    },
                    {
                      key: 'total',
                      header: 'Sous-total',
                      mobileLabel: 'Sous-total',
                      align: 'right',
                      isNumeric: true,
                      hideOnMobileCard: true,
                      render: (it) => (
                        <span className="font-black text-slate-900 dark:text-white">
                          {Number(it.total || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      ),
                    },
                  ]}
                />

                {/* Motifs (Motif de la demande optionnel + Motif de décision Admin optionnel) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#008DA9]" />
                      <span>Motif de la demande ({req.requester_role} • Optionnel) :</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">
                      {req.request_motif ? (
                        req.request_motif
                      ) : (
                        <span className="italic text-slate-400">Aucun motif renseigné (optionnel)</span>
                      )}
                    </p>
                  </div>

                  {!isPending && (
                    <div
                      className={`p-3 rounded-xl border ${
                        isValidee
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70'
                          : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/70'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase flex items-center justify-between gap-2">
                        <span
                          className={
                            isValidee
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-rose-800 dark:text-rose-300'
                          }
                        >
                          Décision Administrateur ({isValidee ? 'Validée' : 'Rejetée'}) • Motif (Optionnel) :
                        </span>
                        {req.reviewed_at && (
                          <span className="font-mono text-[10px] opacity-75">
                            {req.reviewed_at.split('T')[0]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                        {req.admin_motif ? (
                          req.admin_motif
                        ) : (
                          <span className="italic text-slate-400">
                            Aucun motif précisé par l&apos;Administrateur (optionnel)
                          </span>
                        )}
                      </p>
                      {req.reviewed_by && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          Traitée par : <strong>{req.reviewed_by}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons (Aperçu / Imprimer A4 + Validation Admin si applicable) */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-slate-500">
                    {isAdmin
                      ? isPending
                        ? `Cette demande de ${req.requester_name} (${req.requester_role}) attend votre validation ou rejet.`
                        : `Demande déjà ${isValidee ? 'validée' : 'rejetée'} — vous pouvez modifier votre décision si nécessaire.`
                      : `Document officiel de demande d'achat • Catégorie : ${req.category}`}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {onOpenDocument && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenDocument({
                            id: req.id,
                            number: req.reference,
                            date: `${createdDate} à ${createdTime}`,
                            type: 'demande_achat',
                            docTypeTitle: "DEMANDE D'ACHAT FOURNISSEUR",
                            emitterTitle: `DEMANDEUR (${req.requester_role.toUpperCase()} BAOBAB)`,
                            recipientTitle: 'FOURNISSEUR / DIRECTION ACHATS',
                            vendorName: req.requester_name,
                            vendorCode: req.requester_code,
                            vendorTeam: `Service ${req.requester_role} — Baobab Distribution`,
                            clientName: req.supplier_name || 'Fournisseur Partenaire',
                            pdvName: req.supplier_name || 'Fournisseur Partenaire',
                            pdvNeighborhood: `Catégorie : ${req.category}`,
                            pdvManager: req.title,
                            items: (req.items || []).map((it, idx) => ({
                              id: `${req.id}-${idx}`,
                              code: it.code || `ART-0${idx + 1}`,
                              description: it.name,
                              quantity: Number(it.qty || 1),
                              unitPrice: Number(it.unitPrice || 0),
                              total: Number(it.total || 0),
                            })),
                            subtotal: Number(req.total_amount || 0),
                            taxRate: 0,
                            taxAmount: 0,
                            total: Number(req.total_amount || 0),
                            paymentMethod: 'Bon de commande fournisseur',
                            status: isValidee
                              ? 'Validée par la Direction'
                              : isRejetee
                              ? 'Rejetée par la Direction'
                              : 'En attente de validation Admin',
                            isAcquittee: isValidee,
                            notes: req.request_motif
                              ? `Motif : ${req.request_motif}${req.admin_motif ? ` | Décision Admin : ${req.admin_motif}` : ''}`
                              : req.admin_motif || undefined,
                            sigLeftLabel: `Le Demandeur (${req.requester_role})`,
                            sigCenterLabel: 'Service Comptabilité / Budget',
                            sigRightLabel: 'Direction Générale (Validation)',
                          })
                        }
                        className="inline-flex items-center gap-1.5 h-[48px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">Imprimer</span>
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDecisionTarget({ request: req, decision: 'validee' });
                            setAdminMotif(req.admin_motif || '');
                          }}
                          className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Accepter / Valider (Motif optionnel)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDecisionTarget({ request: req, decision: 'rejetee' });
                            setAdminMotif(req.admin_motif || '');
                          }}
                          className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Rejeter (Motif optionnel)</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Create Purchase Request (Magasinier & Comptable) */}
      {canCreateRequest && showCreateModal && (
        <FormModal
          title={`Nouvelle Demande d'Achat (${currentUser.role})`}
          subtitle={`Soumise par ${currentUser.name} (${currentUser.code}) • Validation requise par l'Administrateur`}
          icon={<ShoppingBag className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleSubmitCreate}
          submitLabel={isSubmittingCreate ? 'Envoi en cours...' : "Soumettre la Demande d'Achat à l'Admin"}
          submitDisabled={isSubmittingCreate}
          isDirty={Boolean(title.trim() || supplierName.trim() || requestMotif.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Objet / Intitulé de la demande d&apos;achat *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Réapprovisionnement cartons Lait Bennor / Rouleaux papier thermique..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Catégorie d&apos;achat
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="Réapprovisionnement Stock Dépôt">Réapprovisionnement Stock Dépôt</option>
                  <option value="Emballages & Logistique">Emballages &amp; Logistique</option>
                  <option value="Fournitures Comptables & Caisse">Fournitures Comptables &amp; Caisse</option>
                  <option value="Équipements & Maintenance">Équipements &amp; Maintenance</option>
                  <option value="Autre besoin opérationnel">Autre besoin opérationnel</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Fournisseur / Prestataire
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Nom du fournisseur..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Articles / Lignes de la demande d&apos;achat
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {products.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddCatalogProductLine(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold"
                    >
                      <option value="">+ Ajouter un produit du catalogue...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name} ({Number(p.price_box || 0).toLocaleString('fr-FR')} FCFA)
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="px-2.5 py-1.5 rounded-lg bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300 font-bold text-[11px] hover:bg-[#008DA9]/25 cursor-pointer"
                  >
                    + Ajouter une ligne libre
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex flex-col gap-3"
                  >
                    {/* Row 1 / Code & Name */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Code</label>
                        <input
                          type="text"
                          value={it.code}
                          onChange={(e) => handleUpdateLine(idx, 'code', e.target.value)}
                          className="w-full h-[48px] px-3 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[14px]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Désignation *</label>
                        <input
                          type="text"
                          required
                          value={it.name}
                          onChange={(e) => handleUpdateLine(idx, 'name', e.target.value)}
                          placeholder="Nom de l'article ou fourniture"
                          className="w-full h-[48px] px-3 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-[14px]"
                        />
                      </div>
                    </div>

                    {/* Row 2 / Qté & P.U. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Quantité</label>
                        <input
                          type="number"
                          min="1"
                          value={it.qty}
                          onChange={(e) => handleUpdateLine(idx, 'qty', Number(e.target.value))}
                          className="w-full h-[48px] px-3 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-center text-[14px]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">P.U. (FCFA)</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={it.unitPrice}
                          onChange={(e) => handleUpdateLine(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full h-[48px] px-3 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-right text-[14px]"
                        />
                      </div>
                    </div>

                    {/* Ligne séparée pour la suppression */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Total : {(it.qty * it.unitPrice).toLocaleString('fr-FR')} FCFA
                      </span>
                      <ConfirmDestructiveButton
                        disabled={items.length <= 1}
                        label="Supprimer la ligne"
                        confirmLabel="Supprimer ?"
                        onConfirm={() => handleRemoveLine(idx)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#008DA9]/10 border border-[#008DA9]/30">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Montant Total de la Demande d&apos;Achat :
                </span>
                <span className="text-lg font-black text-[#008DA9]">
                  {computedTotal.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            {/* Optional Motif */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Motif de la demande <span className="text-slate-400 font-normal">(Optionnel)</span>
              </label>
              <textarea
                rows={3}
                value={requestMotif}
                onChange={(e) => setRequestMotif(e.target.value)}
                placeholder="Expliquez le motif ou l'urgence de cette demande d'achat (facultatif)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* MODAL: Admin Decision (Accept / Reject with Optional Motif) */}
      {isAdmin && decisionTarget && (
        <FormModal
          title={
            decisionTarget.decision === 'validee'
              ? "Valider la Demande d'Achat"
              : "Rejeter la Demande d'Achat"
          }
          icon={
            decisionTarget.decision === 'validee' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600" />
            )
          }
          onClose={() => setDecisionTarget(null)}
          onSubmit={handleConfirmAdminDecision}
          submitLabel={
            isSubmittingDecision
              ? 'Traitement...'
              : decisionTarget.decision === 'validee'
              ? 'Confirmer la Validation & Notifier'
              : 'Confirmer le Rejet & Notifier'
          }
          submitDisabled={isSubmittingDecision}
          isDirty={Boolean(adminMotif.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[#008DA9]">
                  {decisionTarget.request.reference}
                </span>
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {decisionTarget.request.requester_role} • {decisionTarget.request.requester_name}
                </span>
              </div>
              <div className="font-black text-sm text-slate-900 dark:text-white">
                {decisionTarget.request.title}
              </div>
              <div className="text-slate-500">
                Montant :{' '}
                <strong className="text-slate-900 dark:text-white">
                  {Number(decisionTarget.request.total_amount || 0).toLocaleString('fr-FR')} FCFA
                </strong>
              </div>
              {decisionTarget.request.request_motif && (
                <div className="pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
                  <strong>Motif du demandeur :</strong> {decisionTarget.request.request_motif}
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Motif de {decisionTarget.decision === 'validee' ? 'validation' : 'rejet'}{' '}
                <span className="text-slate-400 font-normal">(Optionnel)</span>
              </label>
              <textarea
                rows={3}
                value={adminMotif}
                onChange={(e) => setAdminMotif(e.target.value)}
                placeholder={
                  decisionTarget.decision === 'validee'
                    ? 'Commentaire ou motif de validation (optionnel)...'
                    : 'Précisez le motif du rejet si souhaité (optionnel)...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Le {decisionTarget.request.requester_role} ({decisionTarget.request.requester_name}) recevra immédiatement une notification de{' '}
                {decisionTarget.decision === 'validee' ? 'validation' : 'rejet'} avec ce motif.
              </p>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
