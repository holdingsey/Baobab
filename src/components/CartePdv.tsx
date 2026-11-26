import React, { useState } from 'react';
import {
  Eye,
  MapPin,
  Navigation,
  ShoppingBag,
  Store,
  User,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';

/**
 * Formate une date au format JJ/MM/AAAA (ex: "23/11/2026").
 */
export function formatDateJjMmAaaa(rawDate?: string | null): string {
  if (!rawDate) return '23/11/2026';
  const trimmed = String(rawDate).trim();
  if (!trimmed) return '23/11/2026';

  // Déjà au format JJ/MM/AAAA
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[1]}/${dmyMatch[2]}/${dmyMatch[3]}`;
  }

  // Format AAAA-MM-JJ (ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return '23/11/2026';
}

/**
 * Illustration neutre affichée si la photo du PDV est absente ou ne charge pas.
 */
export const NeutralPdvIllustration: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`w-full min-h-[160px] py-6 px-4 bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center gap-2 text-slate-600 dark:text-slate-300 select-none ${className}`}
    role="img"
    aria-label="Illustration neutre de point de vente"
  >
    <svg
      viewBox="0 0 120 88"
      className="w-24 h-20 text-slate-500 dark:text-slate-400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="14"
        y="30"
        width="92"
        height="48"
        rx="4"
        className="fill-slate-200 dark:fill-slate-700 stroke-slate-500 dark:stroke-slate-400"
        strokeWidth="2.5"
      />
      <path
        d="M10 30L22 14H98L110 30H10Z"
        className="fill-slate-300 dark:fill-slate-600 stroke-slate-500 dark:stroke-slate-400"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect
        x="48"
        y="46"
        width="24"
        height="32"
        rx="2"
        className="fill-slate-300 dark:fill-slate-600 stroke-slate-500 dark:stroke-slate-400"
        strokeWidth="2"
      />
      <rect
        x="22"
        y="44"
        width="18"
        height="16"
        rx="2"
        className="fill-slate-100 dark:fill-slate-800 stroke-slate-500 dark:stroke-slate-400"
        strokeWidth="2"
      />
      <rect
        x="80"
        y="44"
        width="18"
        height="16"
        rx="2"
        className="fill-slate-100 dark:fill-slate-800 stroke-slate-500 dark:stroke-slate-400"
        strokeWidth="2"
      />
    </svg>
    <span className="font-sans text-xs font-semibold text-slate-700 dark:text-slate-200">
      Illustration PDV
    </span>
  </div>
);

/**
 * Visionneuse plein écran avec zoom au pincement et boutons de zoom.
 */
export interface PdvPhotoFullscreenModalProps {
  imageUrl?: string | null;
  photoUrl?: string | null;
  pdvName?: string;
  name?: string;
  pdvCode?: string;
  code?: string;
  neighborhood?: string;
  city?: string;
  subtitle?: string;
  onClose: () => void;
}

export const PdvPhotoFullscreenModal: React.FC<PdvPhotoFullscreenModalProps> = ({
  imageUrl,
  photoUrl,
  pdvName,
  name,
  pdvCode,
  code,
  neighborhood,
  city = 'Bamako',
  subtitle,
  onClose,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [imgError, setImgError] = useState<boolean>(false);

  const resolvedUrl = imageUrl ?? photoUrl;
  const resolvedTitle = pdvName ?? name ?? 'Point de vente';
  const resolvedCode = pdvCode ?? code;
  const hasValidPhoto = Boolean(resolvedUrl && String(resolvedUrl).trim().length > 0 && !imgError);

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/95 flex flex-col justify-between p-3 sm:p-6 box-border"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo plein écran de ${resolvedTitle}`}
      onClick={onClose}
    >
      {/* Barre supérieure */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <div className="font-sans text-base font-bold text-white leading-snug [overflow-wrap:anywhere]">
            {resolvedTitle}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-0.5">
            {resolvedCode && (
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-white border border-slate-600">
                {resolvedCode}
              </span>
            )}
            {subtitle ? (
              <span className="font-sans">{subtitle}</span>
            ) : (
              neighborhood && (
                <span className="font-sans">
                  {neighborhood}, {city}
                </span>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
            className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 text-xs font-sans font-bold inline-flex items-center gap-1.5 cursor-pointer"
            title="Zoom arrière"
          >
            <ZoomOut className="w-4 h-4 shrink-0" />
            <span className="font-mono">{Math.round(zoom * 100)}%</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))))}
            className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 text-xs font-sans font-bold inline-flex items-center gap-1.5 cursor-pointer"
            title="Zoom avant"
          >
            <ZoomIn className="w-4 h-4 shrink-0" />
            <span>Zoom</span>
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 text-xs font-sans font-bold inline-flex items-center gap-1.5 cursor-pointer"
              title="Réinitialiser le zoom"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>100%</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-sans font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4 shrink-0" />
            <span>Fermer</span>
          </button>
        </div>
      </div>

      {/* Zone image plein écran avec pinch-zoom tactile */}
      <div
        className="flex-1 my-3 overflow-auto flex items-center justify-center rounded-xl bg-slate-900/90 border border-slate-800 p-2 sm:p-4"
        style={{ touchAction: 'pinch-zoom' }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasValidPhoto ? (
          <img
            src={String(resolvedUrl)}
            alt={`Photo de ${resolvedTitle}`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              touchAction: 'pinch-zoom',
            }}
            className="max-w-full max-h-[76vh] w-auto h-auto object-contain transition-transform duration-150 select-none"
          />
        ) : (
          <div className="w-full max-w-md rounded-xl overflow-hidden border border-slate-700">
            <NeutralPdvIllustration className="min-h-[240px]" />
          </div>
        )}
      </div>

      {/* Pied d'information */}
      <div
        className="text-center font-sans text-xs text-slate-300"
        onClick={(e) => e.stopPropagation()}
      >
        Pincez l&apos;image sur mobile ou utilisez les boutons Zoom pour agrandir la photo en entier sans rognage.
      </div>
    </div>
  );
};

export interface CartePdvAction {
  key?: string;
  id?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?:
    | 'brand'
    | 'green'
    | 'brown'
    | 'red'
    | 'gray'
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'danger';
  icon?: React.ReactNode;
}

export interface CartePdvProps {
  pdv: any;
  /** Photo explicite (ou calculée automatiquement via getPdvStorefrontImageUrl si absente). Passer null ou "" si photo absente pour afficher l'illustration neutre. */
  photoUrl?: string | null;
  /** Forcer l'illustration neutre (pour tests ou photo absente) */
  forceNoPhoto?: boolean;
  /** Nom du PDV */
  name?: string;
  /** Code du PDV (ex: PDV-BKO-92) */
  code?: string;
  /** Date de création (sera formatée en JJ/MM/AAAA) */
  createdAt?: string | null;
  /** Quartier */
  neighborhood?: string;
  /** Ville (Bamako par défaut) */
  city?: string;
  /** Nom du vendeur */
  vendorName?: string;
  /** Code du vendeur */
  vendorCode?: string;
  /** Statut du PDV : 'valide' | 'en_attente' | 'rejete' | 'inactif' (ou libellé) */
  status?: string;
  /** Badges d'information supplémentaires (au plus 2 seront affichés, ex: ["Visité aujourd'hui", "Jour : lundi"]) */
  infoBadges?: string[];
  /** Jour de routine pour le libellé "Visites du jour (lundi)" */
  routineDayLabel?: string;
  routineDayName?: string;
  /** Nombre de visites du jour en cours */
  todayVisitsCount?: number;
  routineDayVisitsCount?: number;
  /** Nombre total de visites pour le résumé "1 visite · 1 sans vente · 0 vente" */
  visitsCount?: number;
  totalVisitsCount?: number;
  /** Nombre de visites sans vente */
  noSaleCount?: number;
  noSaleVisitsCount?: number;
  /** Nombre de ventes */
  salesCount?: number;
  /** Contenu additionnel optionnel (ex: motif de visite sans vente ou détails) */
  extraContent?: React.ReactNode;
  /** Rôle courant pour déterminer les actions par défaut */
  currentRole?: string;
  /** Actions principales selon le rôle : "Voir la fiche", "Itinéraire", "Vendre", "Visiter" */
  onViewFiche?: () => void;
  onItinerary?: () => void;
  onSell?: () => void;
  onVisit?: () => void;
  /** Libellé personnalisé pour le bouton Visiter (par défaut "Visiter") */
  visitLabel?: string;
  /** Libellé personnalisé pour le bouton Vendre (par défaut "Vendre") */
  sellLabel?: string;
  /** Désactiver le bouton Visiter */
  visitDisabled?: boolean;
  /** Désactiver le bouton Vendre */
  sellDisabled?: boolean;
  /** Actions supplémentaires (ex: Valider le PDV / Refuser en validation de PDV) affichées dans la grille 2 colonnes 48 px */
  customActions?: CartePdvAction[];
  actions?: CartePdvAction[];
  /** Callback optionnel à l'ouverture de la photo plein écran */
  onOpenPhotoFullscreen?: (pdv: any, resolvedPhotoUrl: string | null) => void;
  onPreviewPhoto?: () => void;
  /** Indique si la carte est sélectionnée (ex: sur la carte interactive) */
  isSelected?: boolean;
  className?: string;
}

/**
 * Composant unique partagé "Carte PDV" utilisé partout où un PDV est affiché :
 * liste Points de vente, Mes PDV, validation de PDV, routine et visites, ventes,
 * carte (fiche au clic), cohérence, recherche et rapports.
 */
export const CartePdv: React.FC<CartePdvProps> = ({
  pdv,
  photoUrl,
  forceNoPhoto = false,
  name,
  code,
  createdAt,
  neighborhood,
  city = 'Bamako',
  vendorName,
  vendorCode,
  status,
  infoBadges,
  routineDayLabel,
  routineDayName,
  todayVisitsCount,
  routineDayVisitsCount,
  visitsCount,
  totalVisitsCount,
  noSaleCount,
  noSaleVisitsCount,
  salesCount,
  extraContent,
  currentRole,
  onViewFiche,
  onItinerary,
  onSell,
  onVisit,
  visitLabel = 'Visite sans vente',
  sellLabel = 'Vendre',
  visitDisabled = false,
  sellDisabled = false,
  customActions,
  actions,
  onOpenPhotoFullscreen,
  onPreviewPhoto,
  isSelected = false,
  className = '',
}) => {
  const [imgLoadError, setImgLoadError] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // Résolution des champs à partir de `pdv` ou des props explicites
  const resolvedName = String(name ?? pdv?.name ?? pdv?.pdv_name ?? pdv?.pdvName ?? 'Point de vente').trim();
  const resolvedCode = String(code ?? pdv?.code ?? pdv?.pdv_code ?? pdv?.pdvCode ?? 'PDV-BKO-01').trim();
  const rawDate =
    createdAt ??
    pdv?.created_at ??
    pdv?.captured_at ??
    pdv?.visitDate ??
    pdv?.visit_date ??
    '23/11/2026';
  const formattedCreatedDate = formatDateJjMmAaaa(rawDate);

  const resolvedNeighborhood = String(
    neighborhood ?? pdv?.neighborhood ?? pdv?.quartier ?? pdv?.pdv_neighborhood ?? pdv?.pdvNeighborhood ?? 'Bamako'
  ).trim();
  const resolvedCity = String(city ?? pdv?.commune ?? 'Bamako').trim() || 'Bamako';

  const resolvedVendorName = String(
    vendorName ?? pdv?.created_by ?? pdv?.vendor_name ?? pdv?.vendorName ?? 'Oumar Konaté'
  ).trim();
  const resolvedVendorCode = String(
    vendorCode ?? pdv?.vendor_code ?? pdv?.vendorCode ?? 'BAO-VND-001'
  ).trim();

  // Photo : jamais rognée (object-fit: contain), jamais en position absolue ni superposée au texte
  const rawPhoto =
    forceNoPhoto
      ? null
      : photoUrl !== undefined
      ? photoUrl
      : pdv?.photo_url !== undefined
      ? pdv.photo_url
      : pdv?.noPhoto
      ? null
      : getPdvStorefrontImageUrl(pdv);

  const hasValidPhoto = Boolean(rawPhoto && String(rawPhoto).trim().length > 0 && !imgLoadError);

  // Statut du PDV : Validé (#15803D texte blanc), En attente (#92400E texte blanc), Refusé (#B91C1C texte blanc), Inactif (gris)
  const rawStatus = String(status ?? pdv?.status ?? pdv?.visitValidationStatus ?? 'valide')
    .toLowerCase()
    .trim();

  let statusBadgeLabel = 'Validé';
  let statusBadgeClass = 'bg-[#15803D] text-white';

  if (
    rawStatus === 'en_attente' ||
    rawStatus === 'en attente' ||
    rawStatus === 'pending' ||
    rawStatus === 'en cours'
  ) {
    statusBadgeLabel = 'En attente';
    statusBadgeClass = 'bg-[#92400E] text-white';
  } else if (
    rawStatus === 'rejete' ||
    rawStatus === 'refuse' ||
    rawStatus === 'refusé' ||
    rawStatus === 'rejeté' ||
    rawStatus === 'conteste' ||
    rawStatus === 'contesté'
  ) {
    statusBadgeLabel = 'Refusé';
    statusBadgeClass = 'bg-[#B91C1C] text-white';
  } else if (rawStatus === 'inactif' || rawStatus === 'inactive' || rawStatus === 'bloque' || rawStatus === 'bloqué') {
    statusBadgeLabel = 'Inactif';
    statusBadgeClass = 'bg-slate-600 text-white';
  } else {
    statusBadgeLabel = 'Validé';
    statusBadgeClass = 'bg-[#15803D] text-white';
  }

  // Jour de routine en minuscules (ex: "lundi")
  const resolvedDayLower = String(
    routineDayLabel ?? routineDayName ?? pdv?.routine_day ?? pdv?.routineDay ?? 'lundi'
  )
    .trim()
    .toLowerCase();

  // Compteurs de visites et ventes (cumulés auprès de ce même PDV + journée en cours)
  const resolvedSalesCount = Number(
    salesCount ??
      pdv?.totalSalesCount ??
      pdv?.sales_count ??
      pdv?.salesCount ??
      pdv?.todaySalesCount ??
      (Array.isArray(pdv?.todaySales) ? pdv.todaySales.length : undefined) ??
      (pdv?.soldToday || pdv?.hasSaleToday ? 1 : 0)
  );

  const resolvedTodayVisitsCount = Number(
    todayVisitsCount ??
      routineDayVisitsCount ??
      pdv?.today_visits_count ??
      pdv?.routine_day_visits_count ??
      pdv?.routineDayVisitsCount ??
      pdv?.todayVisitsCount ??
      (pdv?.visitedToday ? 1 : 0)
  );

  const resolvedNoSaleCount = Number(
    noSaleCount ??
      noSaleVisitsCount ??
      pdv?.totalNoSaleVisitsCount ??
      pdv?.no_sale_visits_count ??
      pdv?.noSaleVisitsCount ??
      (pdv?.visitCategory === 'sans_vente' || Boolean(pdv?.noSaleReason) ? 1 : 0)
  );

  const resolvedTotalVisitsCount = Math.max(
    Number(
      visitsCount ??
        totalVisitsCount ??
        pdv?.totalVisitsCount ??
        pdv?.total_visits_count ??
        pdv?.visits_count ??
        resolvedTodayVisitsCount
    ),
    resolvedTodayVisitsCount,
    resolvedSalesCount + resolvedNoSaleCount
  );

  const isVisitedToday = resolvedTodayVisitsCount > 0 || Boolean(pdv?.visitedToday || pdv?.visited_today);
  const hasAnySaleOnPdv =
    resolvedSalesCount > 0 || Boolean(pdv?.soldToday || pdv?.hasSaleToday || pdv?.hasAnySale);

  // Au plus DEUX badges d'information (visite effectuée + vente réalisée ou jour)
  const defaultInfoBadges: string[] = [];
  if (isVisitedToday) {
    defaultInfoBadges.push("Visité aujourd'hui");
  } else if (resolvedTotalVisitsCount > 0) {
    defaultInfoBadges.push('Déjà visité');
  } else {
    defaultInfoBadges.push('Non visité');
  }
  if (hasAnySaleOnPdv) {
    defaultInfoBadges.push(
      resolvedSalesCount > 1 ? `Avec vente (${resolvedSalesCount})` : 'Avec vente'
    );
  } else if (resolvedTotalVisitsCount > 0) {
    defaultInfoBadges.push('Sans vente');
  } else if (resolvedDayLower) {
    defaultInfoBadges.push(`Jour : ${resolvedDayLower}`);
  }
  const candidateInfoBadges = Array.isArray(infoBadges) ? infoBadges.filter(Boolean) : defaultInfoBadges;
  const limitedInfoBadges = candidateInfoBadges.slice(0, 2);

  const getInfoBadgeClasses = (badgeText: string) => {
    const lower = badgeText.toLowerCase();
    if (lower.includes('avec vente')) {
      return 'bg-[#15803D] text-white border border-[#15803D]';
    }
    if (lower.includes('sans vente')) {
      return 'bg-[#92400E] text-white border border-[#92400E]';
    }
    if (lower.includes('visité aujourd')) {
      return 'bg-[#006B82] text-white border border-[#006B82]';
    }
    return 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700';
  };

  // Construction de la liste d'actions en grille de 2 colonnes, 48 px, libellés complets
  const actionButtons: CartePdvAction[] = [];

  if (onViewFiche) {
    actionButtons.push({
      key: 'voir_fiche',
      label: 'Voir la fiche',
      onClick: onViewFiche,
      variant: 'brand',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    });
  }

  if (onItinerary) {
    actionButtons.push({
      key: 'itineraire',
      label: 'Itinéraire',
      onClick: onItinerary,
      variant: 'gray',
      icon: <Navigation className="w-4 h-4 shrink-0" />,
    });
  }

  if (onSell && (currentRole === 'Vendeur' || currentRole === 'Administrateur' || !currentRole)) {
    actionButtons.push({
      key: 'vendre',
      label: sellLabel,
      onClick: onSell,
      disabled: sellDisabled,
      variant: 'green',
      icon: <ShoppingBag className="w-4 h-4 shrink-0" />,
    });
  }

  if (onVisit) {
    actionButtons.push({
      key: 'visiter',
      label: visitLabel,
      onClick: onVisit,
      disabled: visitDisabled,
      variant: 'brown',
      icon: <MapPin className="w-4 h-4 shrink-0" />,
    });
  }

  if (Array.isArray(customActions) && customActions.length > 0) {
    for (const ca of customActions) {
      actionButtons.push(ca);
    }
  }

  if (Array.isArray(actions) && actions.length > 0) {
    for (const act of actions) {
      actionButtons.push(act);
    }
  }

  const getActionVariantClasses = (variant: CartePdvAction['variant']) => {
    switch (variant) {
      case 'green':
      case 'success':
        return 'bg-[#15803D] hover:bg-[#166534] text-white border border-[#15803D]';
      case 'brown':
      case 'warning':
        return 'bg-[#92400E] hover:bg-[#78350F] text-white border border-[#92400E]';
      case 'red':
      case 'danger':
        return 'bg-[#B91C1C] hover:bg-[#991B1B] text-white border border-[#B91C1C]';
      case 'gray':
      case 'secondary':
        return 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700';
      case 'brand':
      case 'primary':
      default:
        return 'bg-[#006B82] hover:bg-[#00586B] text-white border border-[#006B82]';
    }
  };

  const handleOpenPhoto = () => {
    if (onPreviewPhoto) {
      onPreviewPhoto();
    } else if (onOpenPhotoFullscreen) {
      onOpenPhotoFullscreen(pdv, hasValidPhoto ? String(rawPhoto) : null);
    } else {
      setFullscreenOpen(true);
    }
  };

  return (
    <>
      <article
        className={`box-border w-full max-w-full min-w-0 h-full rounded-2xl border p-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs flex flex-col justify-between gap-3 [overflow-wrap:anywhere] ${
          isSelected
            ? 'border-2 border-[#006B82] dark:border-slate-300'
            : 'border-slate-200 dark:border-slate-800'
        } ${className}`}
      >
        {/* Corps principal :
            - Mobile (< 768px) : en colonne (flex-col), photo pleine largeur en tête (hauteur auto, max 260 px), espacement 16 px (gap-4)
            - Tablette & PC (md: >= 768px) : en ligne (md:flex-row), photo à gauche (largeur 40 %, max 320 px) et texte à droite, espacement 16 px (md:gap-4) */}
        <div className="flex flex-col md:flex-row md:items-start gap-4 min-w-0 w-full box-border">
          {/* 1. BLOC PHOTO ENTIÈRE (sans rognage, object-fit: contain, ratio conservé, fond neutre derrière, bouton œil en bas hors du texte, jamais en position absolue) */}
          <div className="w-full md:w-[40%] md:max-w-[320px] md:shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden box-border">
            <div
              onClick={handleOpenPhoto}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenPhoto();
                }
              }}
              aria-label={`Ouvrir la photo de ${resolvedName} en plein écran`}
              className="w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer p-1.5 box-border"
            >
              {hasValidPhoto ? (
                <img
                  src={String(rawPhoto)}
                  alt={`Devanture de ${resolvedName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgLoadError(true)}
                  className="w-full h-auto max-h-[260px] object-contain mx-auto block select-none"
                />
              ) : (
                <NeutralPdvIllustration className="max-h-[260px]" />
              )}
            </div>

            {/* Bouton œil conservé en bas de la photo, hors du texte, jamais en position absolue */}
            <div className="w-full px-2.5 py-1.5 bg-slate-200/80 dark:bg-slate-800/90 border-t border-slate-300/80 dark:border-slate-700 flex items-center justify-end">
              <button
                type="button"
                onClick={handleOpenPhoto}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 font-sans text-xs font-bold cursor-pointer"
                title="Voir la photo en plein écran"
                aria-label={`Voir la photo de ${resolvedName} en plein écran`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0 text-[#006B82] dark:text-slate-200" />
                <span>Plein écran</span>
              </button>
            </div>
          </div>

          {/* 2. COLONNE TEXTE À DROITE SUR TABLETTE/PC, EN DESSOUS SUR MOBILE (12 px entre les blocs : space-y-3) */}
          <div className="flex-1 min-w-0 w-full space-y-3 box-border font-sans">
            {/* Nom du PDV : police normale (DM Sans), 20 px, gras, sur sa propre ligne, retour à la ligne autorisé */}
            <div className="block w-full min-w-0">
              <h3 className="font-sans text-[20px] font-bold leading-snug text-slate-900 dark:text-white whitespace-normal [overflow-wrap:anywhere] m-0">
                {resolvedName}
              </h3>
            </div>

            {/* Code PDV-BKO-92 en petit badge (police des codes) avec "Créé le 23/11/2026" (police normale, date JJ/MM/AAAA) */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold">
                {resolvedCode}
              </span>
              <span className="font-sans text-xs font-semibold text-slate-700 dark:text-slate-300">
                Créé le {formattedCreatedDate}
              </span>
            </div>

            {/* Quartier et ville avec icône de lieu */}
            <div className="flex items-start gap-2 text-xs sm:text-sm font-sans font-semibold text-slate-800 dark:text-slate-200 min-w-0">
              <MapPin className="w-4 h-4 shrink-0 text-[#006B82] dark:text-slate-300 mt-0.5" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {resolvedNeighborhood}, {resolvedCity}
              </span>
            </div>

            {/* Vendeur (nom et code, police normale) */}
            <div className="flex items-start gap-2 text-xs sm:text-sm font-sans font-medium text-slate-700 dark:text-slate-300 min-w-0">
              <User className="w-4 h-4 shrink-0 text-slate-600 dark:text-slate-400 mt-0.5" />
              <span className="font-sans min-w-0 [overflow-wrap:anywhere]">
                Vendeur : <strong className="font-sans font-bold text-slate-900 dark:text-white">{resolvedVendorName}</strong>
                {resolvedVendorCode ? ` (${resolvedVendorCode})` : ''}
              </span>
            </div>

            {/* Ligne de statut : 1 badge de statut (Validé vert #15803D, En attente marron #92400E, Refusé rouge #B91C1C, Inactif gris)
                et au plus 2 badges d'information ("Visité aujourd'hui", "Jour : lundi"), avec retour à la ligne */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md font-sans text-xs font-bold leading-tight ${statusBadgeClass}`}
              >
                {statusBadgeLabel}
              </span>

              {limitedInfoBadges.map((badgeText, idx) => (
                <span
                  key={`${badgeText}-${idx}`}
                  className={`inline-flex items-center px-2.5 py-1 rounded-md font-sans text-xs font-semibold leading-tight ${getInfoBadgeClasses(
                    badgeText
                  )}`}
                >
                  {badgeText}
                </span>
              ))}
            </div>

            {/* Compteurs de visites sur ce PDV : visites du jour + nombre total de visites effectuées auprès du même PDV + ventes */}
            <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0">
                  <span className="font-sans text-xs font-bold text-slate-900 dark:text-white leading-snug [overflow-wrap:anywhere]">
                    Visites du jour ({resolvedDayLower})
                  </span>
                  <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-full bg-[#006B82] text-white font-mono text-xs font-bold shrink-0">
                    {resolvedTodayVisitsCount}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0">
                  <span className="font-sans text-xs font-bold text-slate-900 dark:text-white leading-snug [overflow-wrap:anywhere]">
                    Total visites ce PDV
                  </span>
                  <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-full bg-slate-800 dark:bg-slate-600 text-white font-mono text-xs font-bold shrink-0">
                    {resolvedTotalVisitsCount}
                  </span>
                </div>
              </div>

              {/* Résumé des visites et ventes sur une ligne : "X visites · Y sans vente · Z ventes" */}
              <div className="font-sans text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                <span className="font-mono font-bold">{resolvedTotalVisitsCount}</span>{' '}
                {resolvedTotalVisitsCount > 1 ? 'visites' : 'visite'} &middot;{' '}
                <span className="font-mono font-bold text-[#92400E] dark:text-amber-300">
                  {resolvedNoSaleCount}
                </span>{' '}
                sans vente &middot;{' '}
                <span className="font-mono font-bold text-[#15803D] dark:text-emerald-300">
                  {resolvedSalesCount}
                </span>{' '}
                {resolvedSalesCount > 1 ? 'ventes' : 'vente'}
              </div>
            </div>
          </div>
        </div>

        {/* Contenu complémentaire optionnel (motif vendeur en lecture seule, etc.) */}
        {extraContent && <div className="w-full min-w-0 box-border pt-1">{extraContent}</div>}

        {/* Actions en bas : grille de 2 colonnes, 48 px, libellés complets, jamais plus larges que la carte */}
        {actionButtons.length > 0 && (
          <div className="grid grid-cols-2 gap-2 w-full max-w-full min-w-0 pt-2 border-t border-slate-200 dark:border-slate-800 box-border">
            {actionButtons.map((act, idx) => (
              <button
                key={act.key || act.id || `${act.label}-${idx}`}
                type="button"
                disabled={act.disabled}
                onClick={act.onClick}
                className={`box-border w-full max-w-full min-w-0 min-h-[48px] px-3 py-2.5 rounded-xl font-sans text-xs sm:text-sm font-bold leading-snug text-center inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${getActionVariantClasses(
                  act.variant
                )}`}
              >
                {act.icon}
                <span className="whitespace-normal [overflow-wrap:anywhere]">{act.label}</span>
              </button>
            ))}
          </div>
        )}
      </article>

      {fullscreenOpen && (
        <PdvPhotoFullscreenModal
          imageUrl={hasValidPhoto ? String(rawPhoto) : null}
          pdvName={resolvedName}
          pdvCode={resolvedCode}
          neighborhood={resolvedNeighborhood}
          city={resolvedCity}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
    </>
  );
};

/**
 * Grille responsive partagée pour les cartes PDV :
 * - Mobile : 1 colonne (grid-cols-1)
 * - Tablette : 2 colonnes (md:grid-cols-2)
 * - PC : 3 colonnes à partir de 1280 px (xl:grid-cols-3)
 * - Cartes de même hauteur dans une ligne (items-stretch)
 */
export const GrilleCartesPdv: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch w-full max-w-full min-w-0 box-border ${className}`}
  >
    {children}
  </div>
);
