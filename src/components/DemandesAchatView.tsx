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
  X,
} from 'lucide-react';
import { UserSession } from './LoginScreen';

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
}

export const DemandesAchatView: React.FC<DemandesAchatViewProps> = ({
  currentUser,
  products = [],
  purchaseRequests: externalRequests,
  onRefreshData,
}) => {
  const isAdmin = currentUser.role === 'Administrateur';
  const isMagasinier = currentUser.role === 'Magasinier';
  const isComptable = currentUser.role === 'Comptable';
  const canCreateRequest = isMagasinier || isComptable;

  const [requests, setRequests] = useState<PurchaseRequestRecord[]>(externalRequests || []);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'validee' | 'rejetee'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Magasinier' | 'Comptable'>('all');
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
      if (!isAdmin && r.requester_role !== currentUser.role && r.requester_id !== currentUser.id) {
        return false;
      }
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (isAdmin && roleFilter !== 'all' && r.requester_role !== roleFilter) return false;
      return true;
    });
  }, [requests, isAdmin, currentUser.role, currentUser.id, statusFilter, roleFilter]);

  const counts = useMemo(() => {
    const base = isAdmin
      ? requests
      : requests.filter((r) => r.requester_role === currentUser.role || r.requester_id === currentUser.id);
    return {
      total: base.length,
      pending: base.filter((r) => r.status === 'en_attente').length,
      validated: base.filter((r) => r.status === 'validee').length,
      rejected: base.filter((r) => r.status === 'rejetee').length,
      totalValidatedAmount: base
        .filter((r) => r.status === 'validee')
        .reduce((acc, r) => acc + Number(r.total_amount || 0), 0),
    };
  }, [requests, isAdmin, currentUser.role, currentUser.id]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isAdmin
                ? "Validation des Demandes d'Achat (Magasinier & Comptable)"
                : `Mes Demandes d'Achat • ${currentUser.role}`}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300">
              {isAdmin ? 'Approbation Direction Générale' : `Compte ${currentUser.role} (${currentUser.code})`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? "Examinez, validez ou rejetez les demandes d'achat soumises par le Magasinier et le Comptable (avec motif optionnel). Le demandeur reçoit immédiatement une notification de votre décision."
              : "Soumettez vos demandes d'achat (avec motif optionnel) à l'Administrateur et recevez une notification dès validation ou rejet."}
          </p>
        </div>

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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Demande d&apos;Achat</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-[#008DA9]" />
            <span>Validation / Rejet Administrateur (Motif optionnel)</span>
          </div>
        )}
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

                {/* Items Presentation (Mobile Cards <640px, Desktop Table >=640px) */}
                {/* Mobile Cards View */}
                <div className="block sm:hidden space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                    <span>Articles / Besoins ({req.items?.length || 0})</span>
                    <span>Sous-total</span>
                  </div>
                  <div className="space-y-2">
                    {(req.items || []).map((it, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            {it.code || `ART-0${i + 1}`}
                          </span>
                          <span className="font-black text-xs text-[#008DA9] whitespace-nowrap">
                            {Number(it.total || 0).toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white break-words">
                          {it.name}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-medium">
                            Quantité : <strong className="text-slate-800 dark:text-slate-200 font-bold">{it.qty}</strong>
                          </span>
                          <span className="font-medium whitespace-nowrap">
                            P.U. : <strong className="text-slate-800 dark:text-slate-200 font-semibold">{Number(it.unitPrice || 0).toLocaleString('fr-FR')} FCFA</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop / Tablet Table */}
                <div className="hidden sm:block rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200/70 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                        <th className="py-2.5 px-3">Réf.</th>
                        <th className="py-2.5 px-3">Désignation de l&apos;article / besoin</th>
                        <th className="py-2.5 px-3 text-center">Quantité</th>
                        <th className="py-2.5 px-3 text-right">Prix Unitaire</th>
                        <th className="py-2.5 px-3 text-right">Sous-total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {(req.items || []).map((it, i) => (
                        <tr key={i} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {it.code || `ART-0${i + 1}`}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                            {it.name}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {it.qty}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">
                            {Number(it.unitPrice || 0).toLocaleString('fr-FR')} FCFA
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                            {Number(it.total || 0).toLocaleString('fr-FR')} FCFA
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

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

                {/* Admin Action Buttons */}
                {isAdmin && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] text-slate-500">
                      {isPending
                        ? `Cette demande de ${req.requester_name} (${req.requester_role}) attend votre validation ou rejet.`
                        : `Demande déjà ${isValidee ? 'validée' : 'rejetée'} — vous pouvez modifier votre décision si nécessaire.`}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionTarget({ request: req, decision: 'validee' });
                          setAdminMotif(req.admin_motif || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
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
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Rejeter (Motif optionnel)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Create Purchase Request (Magasinier & Comptable) */}
      {canCreateRequest && showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-[#008DA9]" />
                <div>
                  <h2 className="text-sm sm:text-base font-black">
                    Nouvelle Demande d&apos;Achat ({currentUser.role})
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Soumise par {currentUser.name} ({currentUser.code}) • Validation requise par l&apos;Administrateur
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreate} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs">
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

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-center"
                    >
                      {/* Row 1 / Code & Name */}
                      <div className="flex items-center gap-2 sm:contents">
                        <div className="w-24 sm:w-auto sm:col-span-2">
                          <label className="text-[10px] text-slate-400 block">Code</label>
                          <input
                            type="text"
                            value={it.code}
                            onChange={(e) => handleUpdateLine(idx, 'code', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                          />
                        </div>
                        <div className="flex-1 sm:col-span-5">
                          <label className="text-[10px] text-slate-400 block">Désignation *</label>
                          <input
                            type="text"
                            required
                            value={it.name}
                            onChange={(e) => handleUpdateLine(idx, 'name', e.target.value)}
                            placeholder="Nom de l'article ou fourniture"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-[11px]"
                          />
                        </div>
                        <div className="sm:hidden flex items-end pt-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={items.length <= 1}
                            className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30 cursor-pointer"
                            title="Supprimer la ligne"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2 / Qté & P.U. */}
                      <div className="flex items-center gap-2 sm:contents">
                        <div className="w-24 sm:w-auto sm:col-span-2">
                          <label className="text-[10px] text-slate-400 block">Qté</label>
                          <input
                            type="number"
                            min="1"
                            value={it.qty}
                            onChange={(e) => handleUpdateLine(idx, 'qty', Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-center text-[11px]"
                          />
                        </div>
                        <div className="flex-1 sm:col-span-2">
                          <label className="text-[10px] text-slate-400 block">P.U. (FCFA)</label>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={it.unitPrice}
                            onChange={(e) => handleUpdateLine(idx, 'unitPrice', Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-right text-[11px]"
                          />
                        </div>
                        <div className="hidden sm:flex sm:col-span-1 flex-col items-end justify-end pt-4">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={items.length <= 1}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30 cursor-pointer"
                            title="Supprimer la ligne"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Envoi en cours...' : "Soumettre la Demande d'Achat à l'Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Admin Decision (Accept / Reject with Optional Motif) */}
      {isAdmin && decisionTarget && (
        <div
          onClick={() => setDecisionTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div
              className={`px-5 py-4 text-white flex items-center justify-between ${
                decisionTarget.decision === 'validee' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {decisionTarget.decision === 'validee' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <h3 className="text-sm sm:text-base font-black">
                  {decisionTarget.decision === 'validee'
                    ? "Valider la Demande d'Achat"
                    : "Rejeter la Demande d'Achat"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDecisionTarget(null)}
                className="p-1 rounded-lg bg-black/20 hover:bg-black/40 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdminDecision} className="p-5 space-y-4 text-xs">
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDecisionTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDecision}
                  className={`px-5 py-2 rounded-xl text-white font-bold shadow-sm transition cursor-pointer disabled:opacity-50 ${
                    decisionTarget.decision === 'validee'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingDecision
                    ? 'Traitement...'
                    : decisionTarget.decision === 'validee'
                    ? 'Confirmer la Validation & Notifier'
                    : 'Confirmer le Rejet & Notifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
