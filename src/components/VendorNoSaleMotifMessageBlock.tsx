import React, { useState } from 'react';
import { MessageSquare, CheckCircle2, AlertTriangle, Clock, ShieldCheck } from 'lucide-react';

export interface MotifReactionHistoryItem {
  id: string;
  visitId: string;
  decision?: 'accepte' | 'conteste' | 'accepted' | 'contested' | string;
  reactionStatus?: 'accepte' | 'conteste' | 'accepted' | 'contested' | string;
  comment: string | null;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

export type MotifReactionRecord = MotifReactionHistoryItem;

export interface VendorNoSaleMotifMessageBlockProps {
  visitId?: string | null;
  pdvId?: string | null;
  vendorId?: string | null;
  motif: string;
  authorName: string;
  authorCode?: string | null;
  visitDate?: string | null;
  visitTime?: string | null;
  viewerRole?: string;
  viewerId?: string;
  viewerName?: string;
  reactionStatus?: 'accepte' | 'conteste' | 'accepted' | 'contested' | string | null;
  reactionComment?: string | null;
  reactedBy?: string | null;
  reactedRole?: string | null;
  reactedAt?: string | null;
  reactionsHistory?: MotifReactionHistoryItem[];
  onReactionSuccess?: (updatedPayload?: any) => void;
}

const normalizeDecisionStatus = (
  val?: string | null
): 'accepte' | 'conteste' | null => {
  if (!val) return null;
  const s = String(val).toLowerCase().trim();
  if (s === 'accepte' || s === 'accepted' || s === 'accepter') return 'accepte';
  if (s === 'conteste' || s === 'contested' || s === 'contester') return 'conteste';
  return null;
};

/**
 * Affichage en lecture seule du motif de visite sans vente envoyé par le vendeur.
 * - Aucun champ de formulaire (ni input, ni textarea), pas de bordure de champ, pas de curseur de saisie.
 * - Bloc de texte simple : fond neutre, icône de message, libellé "Motif du vendeur",
 *   texte complet avec retour à la ligne, auteur, date et heure.
 * - Permet au DOV de réagir sans modifier le message : boutons "Accepter le motif" et "Contester"
 *   avec commentaire séparé (champ distinct, obligatoire si contesté), historique conservé et audit.
 */
export const VendorNoSaleMotifMessageBlock: React.FC<VendorNoSaleMotifMessageBlockProps> = ({
  visitId,
  pdvId,
  vendorId,
  motif,
  authorName,
  authorCode,
  visitDate,
  visitTime,
  viewerRole = '',
  viewerId = '',
  viewerName = '',
  reactionStatus = null,
  reactionComment = null,
  reactedBy = null,
  reactedRole = null,
  reactedAt = null,
  reactionsHistory = [],
  onReactionSuccess,
}) => {
  const [isContestOpen, setIsContestOpen] = useState<boolean>(false);
  const [contestComment, setContestComment] = useState<string>('');
  const [submittingDecision, setSubmittingDecision] = useState<'accepte' | 'conteste' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [localStatus, setLocalStatus] = useState<'accepte' | 'conteste' | null>(
    normalizeDecisionStatus(reactionStatus)
  );
  const [localComment, setLocalComment] = useState<string | null>(reactionComment);
  const [localReactedBy, setLocalReactedBy] = useState<string | null>(reactedBy);
  const [localReactedRole, setLocalReactedRole] = useState<string | null>(reactedRole);
  const [localReactedAt, setLocalReactedAt] = useState<string | null>(reactedAt);
  const [localHistory, setLocalHistory] = useState<MotifReactionHistoryItem[]>(reactionsHistory);

  React.useEffect(() => {
    setLocalStatus(normalizeDecisionStatus(reactionStatus));
    setLocalComment(reactionComment);
    setLocalReactedBy(reactedBy);
    setLocalReactedRole(reactedRole);
    setLocalReactedAt(reactedAt);
    if (Array.isArray(reactionsHistory)) {
      setLocalHistory(reactionsHistory);
    }
  }, [reactionStatus, reactionComment, reactedBy, reactedRole, reactedAt, reactionsHistory]);

  const normalizedRole = String(viewerRole || '').trim();
  const lowerRole = normalizedRole.toLowerCase();
  const isSupervisor =
    lowerRole !== 'vendeur' &&
    (normalizedRole === 'Directeur des opérations de vente' ||
      normalizedRole === 'Administrateur' ||
      normalizedRole === 'Sales Admin / Contrôleur' ||
      lowerRole.includes('directeur des opérations') ||
      lowerRole.includes('administrateur') ||
      lowerRole.includes('sales admin') ||
      lowerRole.includes('contrôleur') ||
      lowerRole.includes('controleur') ||
      normalizedRole.toUpperCase() === 'DOV');
  const isDov = isSupervisor;

  const formattedDate = visitDate ? String(visitDate).slice(0, 10) : "Aujourd'hui";
  const formattedTime = visitTime ? String(visitTime).slice(0, 8) : '';

  const formatDateTimeStr = (isoOrDate?: string | null) => {
    if (!isoOrDate) return '';
    const str = String(isoOrDate);
    if (str.includes('T')) {
      return str.replace('T', ' à ').slice(0, 21);
    }
    return str;
  };

  const handleSendReaction = async (decision: 'accepte' | 'conteste') => {
    if (submittingDecision) return;
    const cleanComment = contestComment.trim();

    if (decision === 'conteste' && cleanComment.length < 3) {
      setFeedback({
        type: 'error',
        text: 'Le commentaire de contestation est obligatoire (minimum 3 caractères).',
      });
      return;
    }

    setSubmittingDecision(decision);
    setFeedback(null);

    try {
      const res = await fetch('/api/vendor/daily-performance/visit-motif-reaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': normalizedRole || 'Directeur des opérations de vente',
          ...(viewerId ? { 'x-user-id': viewerId } : {}),
        },
        body: JSON.stringify({
          visit_id: visitId || undefined,
          pdv_id: pdvId || undefined,
          vendor_id: vendorId || undefined,
          decision,
          comment: decision === 'conteste' ? cleanComment : cleanComment || undefined,
          actor_name: viewerName || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setLocalStatus(decision);
        setLocalComment(cleanComment || null);
        setLocalReactedBy(json.reaction?.actorName || viewerName || 'DOV');
        setLocalReactedRole(json.reaction?.actorRole || normalizedRole || 'DOV');
        setLocalReactedAt(json.reaction?.createdAt || new Date().toISOString());
        if (Array.isArray(json.reactionsHistory)) {
          setLocalHistory(json.reactionsHistory);
        } else if (json.reaction) {
          setLocalHistory((prev) => [json.reaction, ...prev]);
        }
        setIsContestOpen(false);
        setContestComment('');
        setFeedback({
          type: 'success',
          text:
            json.message ||
            (decision === 'accepte'
              ? 'Motif du vendeur accepté et journalisé dans l’audit.'
              : 'Motif du vendeur contesté avec votre commentaire séparé.'),
        });
        window.dispatchEvent(new Event('baobab-notifications-updated'));
        if (onReactionSuccess) {
          onReactionSuccess(json);
        }
      } else {
        setFeedback({
          type: 'error',
          text: json?.error || "Impossible d'enregistrer la réaction sur ce motif.",
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: "Erreur réseau lors de l'enregistrement de la réaction.",
      });
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <div className="box-border w-full min-w-0 space-y-2 [overflow-wrap:anywhere]">
      {/* Bloc de message en lecture seule (aucun input ni textarea, pas de bordure de champ, pas de curseur) */}
      <div
        role="region"
        aria-label="Motif du vendeur en lecture seule"
        className="box-border w-full min-w-0 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 cursor-default space-y-1.5 [overflow-wrap:anywhere]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <MessageSquare className="w-4 h-4 text-[#006D77] dark:text-teal-300 shrink-0" />
            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
              Motif du vendeur
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {localStatus === 'accepte' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#15803D] text-white text-[11px] font-bold">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Motif accepté</span>
              </span>
            )}
            {localStatus === 'conteste' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#92400E] text-white text-[11px] font-bold">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Motif contesté</span>
              </span>
            )}
          </div>
        </div>

        {/* Texte complet du motif avec retour à la ligne, jamais coupé */}
        <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed m-0">
          {motif}
        </p>

        {/* Auteur, date et heure */}
        <div className="pt-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug [overflow-wrap:anywhere]">
          <span>
            Auteur :{' '}
            <strong className="font-bold text-slate-900 dark:text-white">
              {authorName || 'Vendeur'}
              {authorCode ? ` (${authorCode})` : ''}
            </strong>
          </span>
          <span aria-hidden="true">&middot;</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0 text-slate-600 dark:text-slate-400" />
            <span>
              Date et heure :{' '}
              <strong className="font-bold text-slate-900 dark:text-white">
                {formattedDate}
                {formattedTime ? ` à ${formattedTime}` : ''}
              </strong>
            </span>
          </span>
        </div>
      </div>

      {/* Historique conservé des réactions DOV (séparé du message du vendeur) */}
      {(localHistory.length > 0 || localStatus) && (
        <div className="box-border w-full min-w-0 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 space-y-1.5 [overflow-wrap:anywhere]">
          <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#006D77] dark:text-teal-300 shrink-0" />
            <span>
              Historique des réactions DOV (
              {localHistory.length > 0 ? localHistory.length : 1})
            </span>
          </div>

          {localHistory.length > 0 ? (
            <div className="space-y-1.5">
              {localHistory.map((item) => {
                const itemDec = normalizeDecisionStatus(item.decision || item.reactionStatus);
                return (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800/80 text-xs space-y-1 [overflow-wrap:anywhere]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${
                          itemDec === 'accepte' ? 'bg-[#15803D]' : 'bg-[#92400E]'
                        }`}
                      >
                        {itemDec === 'accepte' ? 'Motif accepté' : 'Motif contesté'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {item.actorName} ({item.actorRole}) &middot;{' '}
                        {formatDateTimeStr(item.createdAt)}
                      </span>
                    </div>
                    {item.comment && (
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        Commentaire DOV : {item.comment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 text-xs space-y-1 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${
                    localStatus === 'accepte' ? 'bg-[#15803D]' : 'bg-[#92400E]'
                  }`}
                >
                  {localStatus === 'accepte' ? 'Motif accepté' : 'Motif contesté'}
                </span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {localReactedBy || 'DOV'}
                  {localReactedRole ? ` (${localReactedRole})` : ''}
                  {localReactedAt ? ` · ${formatDateTimeStr(localReactedAt)}` : ''}
                </span>
              </div>
              {localComment && (
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  Commentaire DOV : {localComment}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Réaction du DOV sans modifier le message du vendeur */}
      {isDov && (
        <div className="box-border w-full min-w-0 space-y-2">
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 w-full min-w-0 box-border">
            <button
              type="button"
              disabled={submittingDecision !== null}
              onClick={() => handleSendReaction('accepte')}
              className="box-border w-full max-w-full min-w-0 min-h-[48px] h-auto px-3 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white text-xs font-extrabold text-center leading-snug whitespace-normal [overflow-wrap:anywhere] flex items-center justify-center transition cursor-pointer"
            >
              {submittingDecision === 'accepte' ? 'Validation...' : 'Accepter le motif'}
            </button>

            <button
              type="button"
              disabled={submittingDecision !== null}
              onClick={() => {
                setIsContestOpen((prev) => !prev);
                setFeedback(null);
              }}
              className="box-border w-full max-w-full min-w-0 min-h-[48px] h-auto px-3 py-2 rounded-xl bg-[#92400E] hover:bg-[#78350F] disabled:opacity-50 text-white text-xs font-extrabold text-center leading-snug whitespace-normal [overflow-wrap:anywhere] flex items-center justify-center transition cursor-pointer"
            >
              Contester
            </button>
          </div>

          {/* Champ distinct pour le commentaire séparé du DOV en cas de contestation */}
          {isContestOpen && (
            <div className="box-border w-full min-w-0 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 space-y-2 [overflow-wrap:anywhere]">
              <label className="block text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                Commentaire séparé du DOV (obligatoire en cas de contestation) *
              </label>
              <textarea
                rows={2}
                value={contestComment}
                onChange={(e) => setContestComment(e.target.value)}
                placeholder="Saisissez le motif de contestation du DOV (le message du vendeur reste intact)..."
                className="box-border w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
              />
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 w-full min-w-0 box-border">
                <button
                  type="button"
                  disabled={submittingDecision !== null}
                  onClick={() => handleSendReaction('conteste')}
                  className="box-border w-full min-w-0 min-h-[48px] px-3 py-2 rounded-lg bg-[#92400E] hover:bg-[#78350F] disabled:opacity-50 text-white text-xs font-extrabold text-center leading-snug flex items-center justify-center cursor-pointer"
                >
                  {submittingDecision === 'conteste'
                    ? 'Envoi...'
                    : 'Confirmer la contestation'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsContestOpen(false);
                    setFeedback(null);
                  }}
                  className="box-border w-full min-w-0 min-h-[48px] px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-xs font-extrabold text-center leading-snug flex items-center justify-center cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`p-2 rounded-lg text-xs font-bold [overflow-wrap:anywhere] ${
                feedback.type === 'success'
                  ? 'bg-[#15803D] text-white'
                  : 'bg-rose-700 text-white'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
