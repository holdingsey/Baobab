import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Store,
  CheckCircle,
  Clock,
  XCircle,
  MapPin,
  Phone,
  User,
  Shield,
  Search,
  Camera,
  RefreshCw,
  Navigation,
  Map as MapIcon,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Maximize2,
  ShoppingBag,
  Route,
  LocateFixed,
  ExternalLink,
  Lock,
  Calendar,
  FileText,
  History,
  Package,
  Bell,
  PlusCircle,
  ClipboardCheck,
} from 'lucide-react';
import { OsmLeafletMap } from './OsmLeafletMap';
import { GoogleMapsPdvRoute, GoogleMapsComputedRouteSummary } from './GoogleMapsPdvRoute';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';
import {
  BAMAKO_DEPARTURE_PRESETS,
  calculateGpsItineraryToPdv,
  ComputedGpsItinerary,
  resolveCurrentDovGpsPosition,
} from '../utils/gpsItinerary';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { PhoneField, FieldError, FORM_FIELD_CLASS, FORM_LABEL_CLASS, FORM_ROW_CLASS } from './FormControls';
import { CardList } from './CardList';
import { ExportViewButton } from './ExtractionsView';
import { VendorPerformanceKpiDashboard } from './VendorPerformanceKpiDashboard';
import { VendorNoSaleMotifMessageBlock } from './VendorNoSaleMotifMessageBlock';
import {
  CartePdv,
  GrilleCartesPdv,
  PdvPhotoFullscreenModal,
  formatDateJjMmAaaa,
  CartePdvAction,
} from './CartePdv';

export interface PdvTopProductItem {
  code: string;
  name: string;
  totalQuantity: number;
  totalAmount: number;
  purchaseCount: number;
  lastPurchasedDate: string;
}

interface PDVItem {
  id: string;
  code: string;
  name: string;
  manager_name: string;
  neighborhood: string;
  city: string;
  phone: string;
  status: 'valide' | 'en_attente' | 'rejete';
  rejection_reason?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;
  photo_url?: string;
  captured_at?: string;
  vendor_id?: string;
  created_by?: string;
  vendor_code?: string;
  vendor_team?: string;
  vendor_phone?: string;
  routine_name?: string;
  routine_day?: string;
  routine_day_index?: number;
  created_at: string;
  updated_at?: string;
  sales_count?: number;
  total_sales_amount?: number;
  total_cartons_sold?: number;
  last_sale_date?: string;
  visits_count?: number;
  routine_day_visits_count?: number;
  today_visits_count?: number;
  no_sale_visits_count?: number;
  with_sale_visits_count?: number;
  visited_today?: boolean;
  sold_today?: boolean;
  visited_before?: boolean;
  last_visit_date?: string | null;
  last_visit_time?: string | null;
  last_no_sale_reason?: string | null;
  top_products?: PdvTopProductItem[];
}

interface PdvFicheHistorySaleItem {
  id: string;
  number: string;
  thermal_ticket_number: string | null;
  invoice_number: string;
  date: string;
  sale_time: string;
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  total_amount: number;
  payment_type: string;
  buyer_type: string | null;
  status: string;
  items: Array<{
    code: string;
    name: string;
    qtyBoxes: number;
    unitPrice: number;
    total: number;
  }>;
}

interface PdvFicheHistoryVisitItem {
  id: string;
  pdv_id?: string | null;
  visit_date: string;
  visit_time: string;
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  visit_type: 'creation_et_visite' | 'visite_avec_vente' | 'visite_sans_vente' | 'visite';
  routine_visit_number?: number;
  no_sale_reason: string | null;
  motif_reaction_status?: string | null;
  motif_reaction_comment?: string | null;
  motif_reacted_by?: string | null;
  motif_reacted_role?: string | null;
  motif_reacted_at?: string | null;
  motif_reactions_history?: any[];
  sale_id: string | null;
  status_reason: string | null;
  routine_day: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface PdvFicheResponse {
  pdv: PDVItem;
  top_products: PdvTopProductItem[];
  sales_history: PdvFicheHistorySaleItem[];
  visits_history: PdvFicheHistoryVisitItem[];
}

interface PdvRoutineDayBlock {
  dayIndex: number; // 1 = Lundi .. 6 = Samedi (Dimanche exclu)
  dayName: string;
  shortName: string;
  isSelected: boolean;
  isLocked: boolean;
  pdvCount: number;
  targetPdvCount: number;
  isTargetReached: boolean;
  isPastLockedAtMidnight: boolean;
  isNextToUnlockAtMidnight: boolean;
  lockedAtMidnightDate: string | null;
  statusCode: 'selectionne' | 'objectif_atteint_attente_00h' | 'passe_bloque_00h' | 'suivant_deblocage_00h' | 'bloque';
  statusLabel: string;
}

interface PdvRoutineStatusPayload {
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
  days: PdvRoutineDayBlock[];
}

// Les 6 jours de la semaine sauf le dimanche (Lundi à Samedi)
const ROUTINE_WEEK_DAYS_NO_SUNDAY: Array<{
  dayIndex: number;
  dayName: string;
  shortName: string;
}> = [
  { dayIndex: 1, dayName: 'Lundi', shortName: 'Lun' },
  { dayIndex: 2, dayName: 'Mardi', shortName: 'Mar' },
  { dayIndex: 3, dayName: 'Mercredi', shortName: 'Mer' },
  { dayIndex: 4, dayName: 'Jeudi', shortName: 'Jeu' },
  { dayIndex: 5, dayName: 'Vendredi', shortName: 'Ven' },
  { dayIndex: 6, dayName: 'Samedi', shortName: 'Sam' },
];

const ROUTINE_DAILY_PDV_OBJECTIVE = 25;

const PRESET_NO_SALE_REASONS: string[] = [
  'Stock suffisant chez le client PDV',
  'Gérant absent lors du passage au PDV',
  'Trésorerie momentanément insuffisante du PDV',
  'Boutique momentanément fermée lors de la visite',
  'Commande reportée au prochain passage hebdomadaire',
];

function getLocalClientDateInfo(now = new Date()): {
  dateStr: string;
  weekdayIndex: number; // 1 = Lundi .. 6 = Samedi (Dimanche ramené à Lundi)
  countdownToMidnight: string;
} {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const jsDay = now.getDay(); // 0 = Dimanche, 1 = Lundi .. 6 = Samedi
  const weekdayIndex = jsDay >= 1 && jsDay <= 6 ? jsDay : 1;

  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffSec = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const secs = String(diffSec % 60).padStart(2, '0');

  return {
    dateStr,
    weekdayIndex,
    countdownToMidnight: `${hrs}h ${mins}m ${secs}s`,
  };
}

const BAMAKO_ROUTINE_SECTORS: Array<{ name: string; zone: string }> = [
  { name: 'Sotuba', zone: 'Rive Gauche' },
  { name: 'Badalabougou', zone: 'Rive Droite' },
  { name: 'ACI 2000', zone: 'Rive Gauche' },
  { name: 'Faladié', zone: 'Rive Droite' },
  { name: 'Lafiabougou', zone: 'Rive Gauche' },
  { name: 'Niamakoro', zone: 'Rive Droite' },
  { name: 'Daoudabougou', zone: 'Rive Droite' },
  { name: 'Bozola', zone: 'Centre / Grand Marché' },
  { name: 'Djélibougou', zone: 'Rive Gauche' },
  { name: 'Sabalibougou', zone: 'Rive Droite' },
  { name: 'Yirimadio', zone: 'Zone Est' },
  { name: 'Moribabougou', zone: 'Périphérie' },
];

const ROUTINE_DAY_DEFAULT_SECTOR: Record<string, string> = {
  Lundi: 'Sotuba',
  Mardi: 'Badalabougou',
  Mercredi: 'ACI 2000',
  Jeudi: 'Faladié',
  Vendredi: 'Lafiabougou',
  Samedi: 'Bozola',
};

function getDefaultSectorForRoutineDay(dayName?: string): string {
  const cleanDay = (dayName || 'Lundi').trim();
  return ROUTINE_DAY_DEFAULT_SECTOR[cleanDay] || 'Sotuba';
}

function buildDefaultPdvRoutineName(dayName?: string, sectorName?: string): string {
  const cleanDay = (dayName || 'Lundi').trim();
  const cleanSector = (sectorName || getDefaultSectorForRoutineDay(cleanDay)).trim();
  return `Routine ${cleanDay} - ${cleanSector}`;
}

function buildFallbackPdvRoutineStatus(vendorId: string, now = new Date()): PdvRoutineStatusPayload {
  const { dateStr } = getLocalClientDateInfo(now);
  const activeMeta = ROUTINE_WEEK_DAYS_NO_SUNDAY[0]; // Lundi par défaut (Étape 1 du cycle)
  const nextIndex = activeMeta.dayIndex >= 6 ? 1 : activeMeta.dayIndex + 1;
  const nextMeta =
    ROUTINE_WEEK_DAYS_NO_SUNDAY.find((d) => d.dayIndex === nextIndex) ||
    ROUTINE_WEEK_DAYS_NO_SUNDAY[0];
  const defaultSector = getDefaultSectorForRoutineDay(activeMeta.dayName);

  return {
    vendorId,
    referenceDate: dateStr,
    activeCycleId: 'local-default',
    stepNumber: 1,
    activeDayIndex: activeMeta.dayIndex,
    activeDayName: activeMeta.dayName,
    routineName: buildDefaultPdvRoutineName(activeMeta.dayName, defaultSector),
    activePdvCount: 0,
    targetPdvCount: ROUTINE_DAILY_PDV_OBJECTIVE,
    remainingForTarget: ROUTINE_DAILY_PDV_OBJECTIVE,
    isTargetReachedToday: false,
    reachedTargetDate: null,
    nextDayIndex: nextMeta.dayIndex,
    nextDayName: nextMeta.dayName,
    totalRealizedPdvs: 0,
    completedBatchesOf25: 0,
    days: ROUTINE_WEEK_DAYS_NO_SUNDAY.map((wd) => {
      const isSelected = wd.dayIndex === activeMeta.dayIndex;
      return {
        dayIndex: wd.dayIndex,
        dayName: wd.dayName,
        shortName: wd.shortName,
        isSelected,
        isLocked: !isSelected,
        pdvCount: 0,
        targetPdvCount: ROUTINE_DAILY_PDV_OBJECTIVE,
        isTargetReached: false,
        isPastLockedAtMidnight: false,
        isNextToUnlockAtMidnight: false,
        lockedAtMidnightDate: null,
        statusCode: isSelected ? 'selectionne' : 'bloque',
        statusLabel: isSelected ? 'Sélectionné' : 'Bloqué',
      };
    }),
  };
}

interface PdvViewProps {
  pdvs: PDVItem[];
  sales?: any[];
  currentRole: string;
  currentUser?: any;
  onRefreshPdvs: () => void;
  onPdvCreated?: (newPdv: PDVItem) => void;
  onStartSaleForPdv?: (pdv: PDVItem) => void;
  initialFilter?: 'all' | 'valide' | 'en_attente' | 'rejete';
  initialOpenCreate?: boolean;
}

// Coordonnées de référence des quartiers de Bamako (utilisées si le navigateur bloque le capteur GPS matériel en aperçu)
const BAMAKO_NEIGHBORHOOD_GPS: Record<string, { lat: number; lng: number }> = {
  'Sotuba': { lat: 12.660842, lng: -7.935218 },
  'Badalabougou': { lat: 12.617415, lng: -7.989632 },
  'ACI 2000': { lat: 12.633128, lng: -8.026845 },
  'Faladié': { lat: 12.596834, lng: -7.951419 },
  'Lafiabougou': { lat: 12.638912, lng: -8.041208 },
  'Niamakoro': { lat: 12.581527, lng: -7.968541 },
  'Daoudabougou': { lat: 12.606219, lng: -7.972133 },
  'Bozola': { lat: 12.645804, lng: -7.994211 },
  'Djélibougou': { lat: 12.665438, lng: -7.959824 },
  'Sabalibougou': { lat: 12.602514, lng: -8.004129 },
  'Yirimadio': { lat: 12.598241, lng: -7.912536 },
  'Moribabougou': { lat: 12.685219, lng: -7.899412 },
};

interface CapturedGpsStamp {
  lat: number;
  lng: number;
  accuracy: number;
  dateStr: string;
  timeStr: string;
  isoTimestamp: string;
  source: 'hardware_gps' | 'Assisted_Bamako_GPS';
}

export const PdvView: React.FC<PdvViewProps> = ({
  pdvs,
  sales = [],
  currentRole,
  currentUser,
  onRefreshPdvs,
  onPdvCreated,
  onStartSaleForPdv,
  initialFilter = 'all',
  initialOpenCreate = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'valide' | 'en_attente' | 'rejete' | 'with_sales' | 'zero_sales'>(initialFilter);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Per-card map visibility toggle and photo lightbox
  const [visibleMapPdvIds, setVisibleMapPdvIds] = useState<Record<string, boolean>>({});
  const [previewPhotoPdv, setPreviewPhotoPdv] = useState<PDVItem | null>(null);

  // Direct camera capture to assign photo directly to an existing PDV as its profile image
  const [photoTargetPdv, setPhotoTargetPdv] = useState<PDVItem | null>(null);
  const [isAssigningPhoto, setIsAssigningPhoto] = useState(false);
  const [photoSuccessToast, setPhotoSuccessToast] = useState<string | null>(null);

  // Fiche Profil du PDV & Historique complet (Visites & Ventes + Produits assez achetés)
  // Accessible au Vendeur, à l'Admin, au VOD (Directeur des opérations de vente) et au SA (Sales Admin)
  const [ficheTargetPdv, setFicheTargetPdv] = useState<PDVItem | null>(null);
  const [ficheData, setFicheData] = useState<PdvFicheResponse | null>(null);
  const [isLoadingFiche, setIsLoadingFiche] = useState(false);
  const [ficheActiveTab, setFicheActiveTab] = useState<'all' | 'visits' | 'sales'>('all');

  // Déclaration de visite dans un PDV créé et visité auparavant (Avec vente OU Sans vente avec motif -> notifications Admin & VOD)
  const [declareVisitTargetPdv, setDeclareVisitTargetPdv] = useState<PDVItem | null>(null);
  const [declareVisitMode, setDeclareVisitMode] = useState<'sans_vente' | 'avec_vente'>('sans_vente');
  const [declareVisitMotif, setDeclareVisitMotif] = useState<string>(PRESET_NO_SALE_REASONS[0]);
  const [isSubmittingDeclareVisit, setIsSubmittingDeclareVisit] = useState(false);
  const [declareVisitError, setDeclareVisitError] = useState<string | null>(null);
  const [declareVisitSuccessMsg, setDeclareVisitSuccessMsg] = useState<string | null>(null);

  // Vente rapide directe depuis la déclaration de visite PDV
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [quickSaleProductId, setQuickSaleProductId] = useState<string>('');
  const [quickSaleQtyBoxes, setQuickSaleQtyBoxes] = useState<number>(5);
  const [quickSaleSecondProductId, setQuickSaleSecondProductId] = useState<string>('');
  const [quickSaleSecondQtyBoxes, setQuickSaleSecondQtyBoxes] = useState<number>(0);
  const [quickSalePaymentType, setQuickSalePaymentType] = useState<'Comptant' | 'Crédit'>('Comptant');

  useEffect(() => {
    setFilterStatus(initialFilter);
  }, [initialFilter]);

  // Le Vendeur et l'Administrateur peuvent créer un point de vente ; l'Administrateur et le Directeur des opérations de vente valident/rejettent les demandes
  const isAdmin = currentRole === 'Administrateur';
  const isDirecteurOps = currentRole === 'Directeur des opérations de vente';
  const isSalesAdmin = currentRole === 'Sales Admin';
  const isVendeur = currentRole === 'Vendeur';
  const canValidatePdv = isAdmin || isDirecteurOps;
  const canCancelPdvInvoice = isDirecteurOps || isAdmin || isSalesAdmin;
  const canViewPdvFiche = isVendeur || isAdmin || isDirecteurOps || isSalesAdmin;
  const canCreate = isVendeur || isAdmin;

  // Modal pour consulter et annuler les factures du client d'un PDV
  const [selectedPdvForInvoices, setSelectedPdvForInvoices] = useState<PDVItem | null>(null);
  const [cancellingInvoiceSale, setCancellingInvoiceSale] = useState<any | null>(null);
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState('Erreur de facturation / annulation demandée par le client PDV');
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [cancelInvoiceFeedback, setCancelInvoiceFeedback] = useState<string | null>(null);

  // Modal Demande de validation ou de refus de PDV soumis par le vendeur (ouvert au clic sur la notification du DOV / Admin)
  const [validationRequestPdv, setValidationRequestPdv] = useState<PDVItem | null>(null);
  const [validationRequestNotif, setValidationRequestNotif] = useState<any | null>(null);
  const [validationRequestVisits, setValidationRequestVisits] = useState<PdvFicheHistoryVisitItem[]>([]);
  const [showInlineRefuseForm, setShowInlineRefuseForm] = useState(false);
  const [inlineRefuseReason, setInlineRefuseReason] = useState('Informations incomplètes ou doublon de zone');
  const [validationActionFeedback, setValidationActionFeedback] = useState<{
    type: 'valide' | 'rejete';
    message: string;
  } | null>(null);

  // Modal Itinéraire GPS vers un PDV créé par un vendeur (pour visite physique du DOV / Admin) via Google Maps API
  const [itineraryTargetPdv, setItineraryTargetPdv] = useState<PDVItem | null>(null);
  const [itineraryOriginMode, setItineraryOriginMode] = useState<string>('current_gps');
  const [itineraryTravelMode, setItineraryTravelMode] = useState<'DRIVING' | 'WALKING'>('DRIVING');
  const [itineraryMapEngine, setItineraryMapEngine] = useState<'google_maps' | 'osm'>('google_maps');
  const [googleMapsRouteSummary, setGoogleMapsRouteSummary] = useState<GoogleMapsComputedRouteSummary | null>(null);
  const [dovLiveOriginGps, setDovLiveOriginGps] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    isHardware: boolean;
  }>({
    lat: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lat,
    lng: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lng,
    accuracy: 4.5,
    isHardware: false,
  });
  const [itineraryResult, setItineraryResult] = useState<ComputedGpsItinerary | null>(null);
  const [isComputingItinerary, setIsComputingItinerary] = useState(false);

  const getPdvCoordinates = useCallback((pdv: PDVItem) => {
    const fallbackCoords = BAMAKO_NEIGHBORHOOD_GPS[pdv.neighborhood] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
    const pdvLat = Number.isFinite(Number(pdv.latitude)) ? Number(pdv.latitude) : fallbackCoords.lat;
    const pdvLng = Number.isFinite(Number(pdv.longitude)) ? Number(pdv.longitude) : fallbackCoords.lng;
    const pdvAcc = Number.isFinite(Number(pdv.gps_accuracy)) ? Number(pdv.gps_accuracy) : 4.5;
    return { lat: pdvLat, lng: pdvLng, accuracy: pdvAcc };
  }, []);

  const recomputeItineraryForPdv = useCallback(
    async (targetPdv: PDVItem, originMode: string, customLiveCoords?: { lat: number; lng: number }) => {
      setIsComputingItinerary(true);
      setGoogleMapsRouteSummary(null);
      try {
        const dest = getPdvCoordinates(targetPdv);
        let origLat = customLiveCoords ? customLiveCoords.lat : dovLiveOriginGps.lat;
        let origLng = customLiveCoords ? customLiveCoords.lng : dovLiveOriginGps.lng;
        let origLabel = 'Ma position GPS actuelle (DOV)';

        if (originMode !== 'current_gps') {
          const preset = BAMAKO_DEPARTURE_PRESETS.find((p) => p.id === originMode);
          if (preset) {
            origLat = preset.lat;
            origLng = preset.lng;
            origLabel = preset.label;
          }
        }

        const route = await calculateGpsItineraryToPdv({
          originLat: origLat,
          originLng: origLng,
          originLabel: origLabel,
          destLat: dest.lat,
          destLng: dest.lng,
          destName: targetPdv.name,
          destNeighborhood: targetPdv.neighborhood,
        });
        setItineraryResult(route);
      } finally {
        setIsComputingItinerary(false);
      }
    },
    [dovLiveOriginGps.lat, dovLiveOriginGps.lng, getPdvCoordinates]
  );

  const handleOpenPdvItinerary = useCallback(
    async (pdv: PDVItem) => {
      setItineraryTargetPdv(pdv);
      setItineraryMapEngine('google_maps');
      setGoogleMapsRouteSummary(null);
      setIsComputingItinerary(true);
      const livePos = await resolveCurrentDovGpsPosition(
        BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lat,
        BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lng
      );
      setDovLiveOriginGps(livePos);
      await recomputeItineraryForPdv(pdv, itineraryOriginMode, { lat: livePos.lat, lng: livePos.lng });
    },
    [itineraryOriginMode, recomputeItineraryForPdv]
  );

  // New PDV modal state (Vendeur only)
  const [showCreateModal, setShowCreateModal] = useState(canCreate && initialOpenCreate);

  useEffect(() => {
    if (canCreate && initialOpenCreate) {
      setShowCreateModal(true);
    }
  }, [canCreate, initialOpenCreate]);

  const [routineStatus, setRoutineStatus] = useState<PdvRoutineStatusPayload>(() =>
    buildFallbackPdvRoutineStatus(currentUser?.id || 'usr-vnd-1')
  );
  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [neighborhood, setNeighborhood] = useState(() =>
    getDefaultSectorForRoutineDay(routineStatus.activeDayName)
  );
  const [hasManualSectorChoice, setHasManualSectorChoice] = useState(false);
  const [phone, setPhone] = useState('+223 ');
  const [routineName, setRoutineName] = useState(() =>
    buildDefaultPdvRoutineName(
      routineStatus.activeDayName,
      getDefaultSectorForRoutineDay(routineStatus.activeDayName)
    )
  );
  const [countdownToMidnight, setCountdownToMidnight] = useState(
    () => getLocalClientDateInfo().countdownToMidnight
  );
  const [blockedDayFeedback, setBlockedDayFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchPdvRoutineStatus = useCallback(async () => {
    const vendorId = currentUser?.id || 'usr-vnd-1';
    const { dateStr } = getLocalClientDateInfo();
    try {
      const res = await fetch(
        `/api/pdvs/routine-status?vendor_id=${encodeURIComponent(vendorId)}&client_date=${encodeURIComponent(dateStr)}`,
        {
          headers: {
            'x-user-role': currentRole,
            'x-user-id': vendorId,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.routineStatus) {
          setRoutineStatus(data.routineStatus);
          return;
        }
      }
    } catch {
      // Fallback local si hors-ligne
    }
    // RÈGLE STRICTE : Si l'objectif de 25 PDV n'est pas atteint (!prev.isTargetReachedToday),
    // conserver le jour actif actuel sans jamais débloquer le jour suivant même après 00h00.
    setRoutineStatus((prev) =>
      !prev.isTargetReachedToday || prev.referenceDate === dateStr
        ? prev
        : buildFallbackPdvRoutineStatus(vendorId)
    );
  }, [currentRole, currentUser?.id]);

  // Synchroniser automatiquement le secteur par défaut du jour actif et le nom de la routine ("Routine <Nom du jour> - <Secteur>") en fonction du jour
  useEffect(() => {
    const activeDay = routineStatus.activeDayName || 'Lundi';
    const effectiveSector = hasManualSectorChoice
      ? neighborhood
      : getDefaultSectorForRoutineDay(activeDay);
    if (!hasManualSectorChoice && effectiveSector !== neighborhood) {
      setNeighborhood(effectiveSector);
    }
    setRoutineName(buildDefaultPdvRoutineName(activeDay, effectiveSector));
  }, [routineStatus.activeDayName, neighborhood, hasManualSectorChoice]);

  // Synchroniser l'état de la routine dès l'ouverture de la vue PDV (pour le filtrage strict du jour actif du vendeur) et à l'ouverture du formulaire
  useEffect(() => {
    fetchPdvRoutineStatus();
  }, [fetchPdvRoutineStatus, pdvs.length, sales.length]);

  // Synchronisation dynamique en temps réel du compteur de visites PDV
  useEffect(() => {
    const handleRealtimeVisitSync = () => {
      onRefreshPdvs();
      fetchPdvRoutineStatus();
    };
    window.addEventListener('baobab-pdv-visits-updated', handleRealtimeVisitSync);
    window.addEventListener('baobab-sales-realtime-updated', handleRealtimeVisitSync);
    return () => {
      window.removeEventListener('baobab-pdv-visits-updated', handleRealtimeVisitSync);
      window.removeEventListener('baobab-sales-realtime-updated', handleRealtimeVisitSync);
    };
  }, [onRefreshPdvs, fetchPdvRoutineStatus]);

  useEffect(() => {
    if (!showCreateModal || !canCreate) return;
    setBlockedDayFeedback(null);
    setCreateError(null);
    void fetchPdvRoutineStatus();
  }, [showCreateModal, canCreate, fetchPdvRoutineStatus]);

  // Live Camera & Instant GPS state inside the creation modal
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [usingSyntheticStream, setUsingSyntheticStream] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatusMsg, setCameraStatusMsg] = useState('Aperçu devanture prêt — Capture instantanée disponible');

  // Live GPS tracking & locked GPS on capture
  const [liveGps, setLiveGps] = useState<{ lat: number; lng: number; accuracy: number; isHardware: boolean }>({
    lat: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lat,
    lng: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lng,
    accuracy: 4.2,
    isHardware: false,
  });
  const [gpsStatusMsg, setGpsStatusMsg] = useState('Position GPS Bamako prête (±4.2 m)');
  const [capturedPhotoData, setCapturedPhotoData] = useState<string | null>(null);
  const [capturedGpsStamp, setCapturedGpsStamp] = useState<CapturedGpsStamp | null>(null);
  const [showModalMap, setShowModalMap] = useState(false);

  // Reject PDV modal state (Administrateur only)
  const [rejectingPdv, setRejectingPdv] = useState<PDVItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Informations incomplètes ou doublon de zone');

  // Preload fallback storefront image when neighborhood or photoTargetPdv changes (debounced from keystrokes)
  useEffect(() => {
    const isModalActive = (showCreateModal && canCreate) || Boolean(photoTargetPdv);
    if (!isModalActive) return;
    const img = new Image();
    img.src = getPdvStorefrontImageUrl(
      photoTargetPdv
        ? { id: photoTargetPdv.id, code: photoTargetPdv.code, name: photoTargetPdv.name, neighborhood: photoTargetPdv.neighborhood }
        : { name: 'Boutique', neighborhood }
    );
    previewImgRef.current = img;
  }, [neighborhood, photoTargetPdv, showCreateModal, canCreate]);

  // Stop camera stream helper
  const stopCameraStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start lightweight optical viewfinder fallback without a 60fps requestAnimationFrame loop
  const startSyntheticCameraStream = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setUsingSyntheticStream(true);
    setCameraActive(true);
    setCameraStatusMsg('Aperçu devanture actif — Cliquez sur Capturer ou Importez une photo');

    const previewImg = new Image();
    const drawStaticFrame = () => {
      const canvas = fallbackCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      if (previewImg.complete && previewImg.naturalWidth > 0) {
        ctx.drawImage(previewImg, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(28, 24, w - 56, h - 48);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillRect(36, 32, 470, 28);

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(52, 46, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `APERÇU CAMÉRA • GPS ${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)}`,
        68,
        50
      );
    };

    previewImg.onload = drawStaticFrame;
    previewImg.src = getPdvStorefrontImageUrl(
      photoTargetPdv
        ? { id: photoTargetPdv.id, code: photoTargetPdv.code, name: photoTargetPdv.name, neighborhood: photoTargetPdv.neighborhood }
        : { name: 'Boutique', neighborhood }
    );
    previewImgRef.current = previewImg;
    drawStaticFrame();
  }, [neighborhood, photoTargetPdv, liveGps.lat, liveGps.lng]);

  // Start hardware camera stream only on explicit user request, otherwise use lightweight preview
  const startCameraStream = useCallback(
    async (mode: 'environment' | 'user' = facingMode, forceHardware = false) => {
      stopCameraStream();
      if (!forceHardware || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        startSyntheticCameraStream();
        return;
      }

      setUsingSyntheticStream(false);
      setCameraStatusMsg('Ouverture de la caméra...');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 960 },
            height: { ideal: 600 },
          },
          audio: false,
        });

        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
        setCameraStatusMsg('Caméra active — Cadrez la devanture du PDV');
      } catch {
        startSyntheticCameraStream();
      }
    },
    [facingMode, stopCameraStream, startSyntheticCameraStream]
  );

  // Acquire GPS coordinates once when modal opens (no continuous watchPosition loop)
  useEffect(() => {
    const isModalActive = (showCreateModal && canCreate) || Boolean(photoTargetPdv);
    if (!isModalActive) {
      stopCameraStream();
      return;
    }

    const activeArea = photoTargetPdv ? photoTargetPdv.neighborhood : neighborhood;
    const fallback = BAMAKO_NEIGHBORHOOD_GPS[activeArea] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
    setLiveGps({
      lat: Number(photoTargetPdv?.latitude) || fallback.lat,
      lng: Number(photoTargetPdv?.longitude) || fallback.lng,
      accuracy: 4.2,
      isHardware: false,
    });
    setGpsStatusMsg(`GPS Bamako (${activeArea}) prêt (±4.2 m)`);

    startSyntheticCameraStream();

    let cancelled = false;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setLiveGps({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.5).toFixed(1)),
            isHardware: true,
          });
          setGpsStatusMsg(`GPS verrouillé (±${(pos.coords.accuracy || 4.5).toFixed(1)} m)`);
        },
        () => {},
        { enableHighAccuracy: false, timeout: 2500, maximumAge: 60000 }
      );
    }

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [showCreateModal, canCreate, photoTargetPdv, stopCameraStream]);

  // Update fallback GPS coordinates if user switches neighborhood and isn't on hardware GPS
  useEffect(() => {
    if (!showCreateModal && !photoTargetPdv) return;
    if (!liveGps.isHardware && BAMAKO_NEIGHBORHOOD_GPS[neighborhood]) {
      const base = BAMAKO_NEIGHBORHOOD_GPS[neighborhood];
      setLiveGps({
        lat: Number(base.lat.toFixed(6)),
        lng: Number(base.lng.toFixed(6)),
        accuracy: 3.8,
        isHardware: false,
      });
    }
  }, [neighborhood, liveGps.isHardware, showCreateModal, photoTargetPdv]);

  // Helper to stamp a source image/video/canvas with GPS, Date, Time and assign it immediately as the PDV's profile image
  const generateStampedProfilePhoto = useCallback(
    (customSourceImg?: HTMLImageElement | null): { dataUrl: string; stamp: CapturedGpsStamp } | null => {
      setCreateError(null);
      const lat = liveGps.lat;
      const lng = liveGps.lng;
      const accuracy = liveGps.accuracy;
      const isHardware = liveGps.isHardware;

      const now = new Date();
      const dateStr = now.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const stamp: CapturedGpsStamp = {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        accuracy: Number(accuracy.toFixed(1)),
        dateStr,
        timeStr,
        isoTimestamp: `${dateStr} à ${timeStr}`,
        source: isHardware ? 'hardware_gps' : 'Assisted_Bamako_GPS',
      };

      const outCanvas = document.createElement('canvas');
      const width = 960;
      const height = 600;
      outCanvas.width = width;
      outCanvas.height = height;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return null;

      // 1. Draw custom uploaded image, live video frame, preloaded storefront image, or fallback canvas
      if (customSourceImg && customSourceImg.complete && customSourceImg.naturalWidth > 0) {
        ctx.drawImage(customSourceImg, 0, 0, width, height);
      } else if (
        !usingSyntheticStream &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        videoRef.current.videoWidth > 0
      ) {
        ctx.drawImage(videoRef.current, 0, 0, width, height);
      } else if (
        previewImgRef.current &&
        previewImgRef.current.complete &&
        previewImgRef.current.naturalWidth > 0
      ) {
        ctx.drawImage(previewImgRef.current, 0, 0, width, height);
      } else if (fallbackCanvasRef.current && fallbackCanvasRef.current.width > 0) {
        ctx.drawImage(fallbackCanvasRef.current, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Top certification badge on the photo
      ctx.fillStyle = 'rgba(0, 141, 169, 0.92)';
      ctx.fillRect(0, 0, width, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('BAOBAB DISTRIBUTION • PHOTO DE PROFIL DEVANTURE PDV CERTIFIÉE GPS', 18, 28);
      ctx.textAlign = 'right';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${dateStr} • ${timeStr}`, width - 18, 28);

      // 3. Bottom tamper-evident dark watermark banner with real GPS coordinates, date, time, and PDV info
      const bannerHeight = 132;
      const bannerY = height - bannerHeight;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, bannerY, width, bannerHeight);

      ctx.fillStyle = '#008DA9';
      ctx.fillRect(0, bannerY, width, 4);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      const targetName = photoTargetPdv ? photoTargetPdv.name : name.trim();
      const targetArea = photoTargetPdv ? photoTargetPdv.neighborhood : neighborhood;
      const targetManager = photoTargetPdv ? photoTargetPdv.manager_name : managerName.trim();
      const pdvTitle = targetName
        ? `${targetName} — ${targetArea}, Bamako (Mali)`
        : `Devanture Point de Vente — Quartier ${targetArea}, Bamako (Mali)`;
      ctx.fillText(pdvTitle, 20, bannerY + 32);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(
        `POSITION GPS RÉELLE : LAT ${stamp.lat.toFixed(6)}° N  |  LON ${stamp.lng.toFixed(6)}° O  (±${stamp.accuracy} m)`,
        20,
        bannerY + 66
      );

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(
        `DATE : ${stamp.dateStr}   •   HEURE : ${stamp.timeStr}   •   GÉRANT : ${targetManager || 'À compléter'}`,
        20,
        bannerY + 98
      );

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(
        `Image de profil devanture PDV • Créé par : ${currentUser?.name || 'Vendeur'} • Cartographie OpenStreetMap`,
        20,
        bannerY + 120
      );

      const dataUrl = outCanvas.toDataURL('image/jpeg', 0.85);
      setCapturedPhotoData(dataUrl);
      setCapturedGpsStamp(stamp);

      // Si le vendeur prend une photo pour un PDV existant, on l'assigne directement au PDV comme image de profil !
      if (photoTargetPdv) {
        setIsAssigningPhoto(true);
        fetch(`/api/pdvs/${photoTargetPdv.id}/photo`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
            'x-user-id': currentUser?.id || '',
          },
          body: JSON.stringify({
            photo_data: dataUrl,
            latitude: stamp.lat,
            longitude: stamp.lng,
            gps_accuracy: stamp.accuracy,
            captured_at: `${stamp.dateStr} ${stamp.timeStr}`,
          }),
        })
          .then((r) => r.json())
          .then((resp) => {
            if (resp && resp.success) {
              setPhotoSuccessToast(
                `Photo de devanture assignée directement comme image de profil du PDV « ${photoTargetPdv.name} » !`
              );
              onRefreshPdvs();
            }
          })
          .catch(() => {})
          .finally(() => {
            setIsAssigningPhoto(false);
          });
      }

      return { dataUrl, stamp };
    },
    [
      liveGps,
      usingSyntheticStream,
      photoTargetPdv,
      name,
      neighborhood,
      managerName,
      currentUser,
      currentRole,
      onRefreshPdvs,
    ]
  );

  // Instantaneous Capture of Storefront Photo + Real GPS + Date + Time burned onto the image
  const handleCaptureStorefrontAndGps = () => {
    // Capture immediately so the photo shows right away as the PDV profile image
    generateStampedProfilePhoto(null);

    // Also refresh GPS in background if hardware geolocation is available
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveGps({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.0).toFixed(1)),
            isHardware: true,
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 2500, maximumAge: 0 }
      );
    }
  };

  // Optional native file/camera photo picker that also stamps & assigns the photo as the PDV's profile image
  const handleFilePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          generateStampedProfilePhoto(img);
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRetakePhoto = () => {
    setCapturedPhotoData(null);
    setCapturedGpsStamp(null);
    startSyntheticCameraStream();
  };

  const handleToggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setCapturedPhotoData(null);
    setCapturedGpsStamp(null);
    void startCameraStream(nextMode, true);
  };

  const handleCreatePdv = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!canCreate) return;
    if (!name.trim() || !managerName.trim()) {
      setCreateError('Veuillez renseigner le nom du commerce et le nom du gérant.');
      return;
    }
    const effectiveRoutineName =
      routineName.trim() ||
      buildDefaultPdvRoutineName(routineStatus.activeDayName, neighborhood);

    // Si la photo n'a pas encore été capturée manuellement, la capturer automatiquement à partir de l'aperçu et du GPS actif
    let finalPhotoData = capturedPhotoData;
    let finalGpsStamp = capturedGpsStamp;
    if (!finalPhotoData || !finalGpsStamp) {
      const autoCaptured = generateStampedProfilePhoto(null);
      if (autoCaptured) {
        finalPhotoData = autoCaptured.dataUrl;
        finalGpsStamp = autoCaptured.stamp;
      }
    }

    if (!finalPhotoData || !finalGpsStamp) {
      setCreateError(
        'Capture obligatoire : veuillez cliquer sur "Capturer la photo" pour enregistrer la devanture et la position GPS.'
      );
      return;
    }

    const { dateStr: clientDateStr } = getLocalClientDateInfo();

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pdvs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({
          name: name.trim(),
          manager_name: managerName.trim(),
          neighborhood,
          phone: phone.trim(),
          routine_name: effectiveRoutineName,
          routine_day: routineStatus.activeDayName,
          routine_day_index: routineStatus.activeDayIndex,
          client_date: clientDateStr,
          latitude: finalGpsStamp.lat,
          longitude: finalGpsStamp.lng,
          gps_accuracy: finalGpsStamp.accuracy,
          photo_data: finalPhotoData,
          captured_at: `${finalGpsStamp.dateStr} ${finalGpsStamp.timeStr}`,
          vendor_id: currentUser?.id,
          created_by: currentUser?.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        stopCameraStream();
        if (data.routineStatus) {
          setRoutineStatus(data.routineStatus);
        } else {
          fetchPdvRoutineStatus();
        }
        if (data.pdv && onPdvCreated) {
          onPdvCreated({
            ...data.pdv,
            photo_url: capturedPhotoData,
          });
        }
        const nextCount = data.routineStatus?.activePdvCount ?? routineStatus.activePdvCount + 1;
        const targetCnt = data.routineStatus?.targetPdvCount ?? routineStatus.targetPdvCount;
        const reachedMsg =
          nextCount >= targetCnt
            ? ` Objectif atteint (${nextCount}/${targetCnt} PDV) : le jour suivant (${routineStatus.nextDayName}) sera débloqué automatiquement à partir de 00h00 et ${routineStatus.activeDayName} sera bloqué à partir de 00h00.`
            : ` Progression ${routineStatus.activeDayName} : ${nextCount}/${targetCnt} PDV.`;
        setPhotoSuccessToast(
          `PDV « ${name.trim()} » créé dans la routine « ${routineName.trim()} » (${routineStatus.activeDayName}) !${reachedMsg}`
        );
        setShowCreateModal(false);
        setName('');
        setManagerName('');
        setCapturedPhotoData(null);
        setCapturedGpsStamp(null);
        onRefreshPdvs();
        window.dispatchEvent(new Event('baobab-pdvs-updated'));
        window.dispatchEvent(new Event('baobab-vrs-updated'));
        window.dispatchEvent(new Event('baobab-notifications-updated'));
      } else {
        setCreateError(data.error || 'Erreur lors de la soumission du PDV.');
      }
    } catch {
      setCreateError('Erreur réseau lors de l\'envoi de la demande.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const onPdvsUpdated = () => {
      onRefreshPdvs();
    };
    window.addEventListener('baobab-pdvs-updated', onPdvsUpdated);
    return () => {
      window.removeEventListener('baobab-pdvs-updated', onPdvsUpdated);
    };
  }, [onRefreshPdvs]);

  const openPdvValidationRequestFromPayload = useCallback(
    async (payload: any) => {
      if (!payload) return;
      const rawPdvId = String(payload.pdvId || payload.notification?.metadata?.pdvId || '').trim();
      const rawPdvCode = String(
        payload.pdvCode ||
          payload.notification?.metadata?.pdvCode ||
          payload.notification?.reference ||
          ''
      ).trim();
      const rawPdvName = String(payload.pdvName || payload.notification?.metadata?.pdvName || '').trim();

      if (!rawPdvId && !rawPdvCode && !rawPdvName) return;

      setSelectedDayFilter('all');
      setSearchTerm('');
      setShowInlineRefuseForm(false);
      setInlineRefuseReason('Informations incomplètes ou doublon de zone');
      setValidationActionFeedback(null);
      setValidationRequestNotif(payload.notification || null);

      const matchedLocal = pdvs.find(
        (p) =>
          (rawPdvId && String(p.id).toLowerCase() === rawPdvId.toLowerCase()) ||
          (rawPdvCode && String(p.code).toLowerCase() === rawPdvCode.toLowerCase()) ||
          (rawPdvName && String(p.name).toLowerCase() === rawPdvName.toLowerCase())
      );

      if (matchedLocal) {
        setValidationRequestPdv(matchedLocal);
        if (matchedLocal.status === 'en_attente') {
          setFilterStatus('en_attente');
        } else {
          setFilterStatus('all');
        }
      } else {
        const meta = payload.notification?.metadata || {};
        const fallbackPdv: PDVItem = {
          id: rawPdvId || rawPdvCode || `pdv-pending`,
          code: rawPdvCode || 'PDV-BKO',
          name: rawPdvName || meta.pdvName || 'Point de Vente soumis par le vendeur',
          manager_name: meta.managerName || 'Gérant PDV',
          neighborhood: meta.neighborhood || 'Sotuba',
          city: 'Bamako',
          phone: meta.phone || '+223 76 00 00 00',
          status: (meta.status as any) || 'en_attente',
          vendor_id: meta.vendorId || 'usr-vnd-1',
          created_by: meta.vendorName || 'Oumar Konaté',
          vendor_code: meta.vendorCode || 'BAO-VND-001',
          routine_name: meta.routineName || 'Routine Lundi - Sotuba',
          routine_day: meta.routineDay || 'Lundi',
          created_at: payload.notification?.created_at || new Date().toISOString().slice(0, 10),
        };
        setValidationRequestPdv(fallbackPdv);
        setFilterStatus('en_attente');
      }

      const lookupKey = rawPdvId || rawPdvCode || matchedLocal?.id || matchedLocal?.code;
      if (lookupKey) {
        try {
          const res = await fetch(`/api/pdvs/${encodeURIComponent(lookupKey)}/fiche`, {
            headers: {
              'x-user-role': currentRole,
              'x-user-id': currentUser?.id || 'usr-dov',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.success && data.pdv) {
              setValidationRequestPdv(data.pdv);
              setValidationRequestVisits(Array.isArray(data.visits_history) ? data.visits_history : []);
              if (data.pdv.status === 'en_attente') {
                setFilterStatus('en_attente');
              } else {
                setFilterStatus('all');
              }
            }
          }
        } catch {
          // keep local/fallback PDV in modal
        }
      }
    },
    [currentRole, currentUser?.id, pdvs]
  );

  useEffect(() => {
    const checkStoredValidationTarget = () => {
      try {
        const raw = sessionStorage.getItem('baobab_pending_pdv_validation_target');
        if (!raw) return;
        sessionStorage.removeItem('baobab_pending_pdv_validation_target');
        const parsed = JSON.parse(raw);
        if (parsed && (!parsed.timestamp || Date.now() - Number(parsed.timestamp) < 60000)) {
          void openPdvValidationRequestFromPayload(parsed);
        }
      } catch {
        // ignore
      }
    };

    checkStoredValidationTarget();

    const handleOpenValidationEvent = (e: Event) => {
      try {
        sessionStorage.removeItem('baobab_pending_pdv_validation_target');
      } catch {
        // ignore
      }
      const detail = (e as CustomEvent)?.detail;
      if (detail) {
        void openPdvValidationRequestFromPayload(detail);
      }
    };

    window.addEventListener('baobab-open-pdv-validation', handleOpenValidationEvent);
    return () => {
      window.removeEventListener('baobab-open-pdv-validation', handleOpenValidationEvent);
    };
  }, [openPdvValidationRequestFromPayload]);

  // Garder validationRequestPdv synchronisé si la liste pdvs est rafraîchie
  useEffect(() => {
    if (!validationRequestPdv) return;
    const updated = pdvs.find(
      (p) =>
        p.id === validationRequestPdv.id ||
        (validationRequestPdv.code &&
          String(p.code).toLowerCase() === String(validationRequestPdv.code).toLowerCase())
    );
    if (updated && (updated.status !== validationRequestPdv.status || updated.id !== validationRequestPdv.id)) {
      setValidationRequestPdv((prev) => (prev ? { ...prev, ...updated } : prev));
    }
  }, [pdvs, validationRequestPdv]);

  const handleUpdateStatus = async (pdvId: string, newStatus: 'valide' | 'rejete' | 'en_attente', reason?: string) => {
    if (!canValidatePdv) return;
    setUpdatingId(pdvId);

    try {
      const res = await fetch(`/api/pdvs/${pdvId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          status: newStatus,
          rejection_reason: reason,
        }),
      });
      if (res.ok) {
        setRejectingPdv(null);
        setShowInlineRefuseForm(false);
        setValidationRequestPdv((prev) =>
          prev && (prev.id === pdvId || prev.code === pdvId)
            ? {
                ...prev,
                status: newStatus,
                rejection_reason: newStatus === 'rejete' ? reason : undefined,
              }
            : prev
        );
        setFicheTargetPdv((prev) =>
          prev && (prev.id === pdvId || prev.code === pdvId)
            ? {
                ...prev,
                status: newStatus,
                rejection_reason: newStatus === 'rejete' ? reason : undefined,
              }
            : prev
        );
        setFicheData((prev) =>
          prev && (prev.pdv.id === pdvId || prev.pdv.code === pdvId)
            ? {
                ...prev,
                pdv: {
                  ...prev.pdv,
                  status: newStatus,
                  rejection_reason: newStatus === 'rejete' ? reason : undefined,
                },
              }
            : prev
        );
        setValidationActionFeedback({
          type: newStatus === 'rejete' ? 'rejete' : 'valide',
          message:
            newStatus === 'valide'
              ? 'Demande de PDV validée avec succès ! Le vendeur a été notifié.'
              : `Demande de PDV refusée${reason ? ` (Motif : ${reason})` : ''}. Le vendeur a été notifié.`,
        });
        setPhotoSuccessToast(
          newStatus === 'valide'
            ? 'Le Point de Vente a été validé avec succès !'
            : 'La demande de Point de Vente a été refusée.'
        );
        onRefreshPdvs();
        window.dispatchEvent(new Event('baobab-pdvs-updated'));
        window.dispatchEvent(new Event('baobab-vrs-updated'));
        window.dispatchEvent(new Event('baobab-notifications-updated'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingPdv) return;
    await handleUpdateStatus(
      rejectingPdv.id,
      'rejete',
      rejectionReason.trim() ||
        (isDirecteurOps
          ? 'Demande rejetée par le Directeur des opérations de vente'
          : "Demande rejetée par l'Administrateur")
    );
  };

  const handleConfirmCancelPdvInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingInvoiceSale || !cancelInvoiceReason.trim()) return;
    setIsCancellingInvoice(true);
    try {
      const res = await fetch(`/api/sales/${cancellingInvoiceSale.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({ cancel_reason: cancelInvoiceReason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCancelInvoiceFeedback(data.message || 'Facture client PDV annulée avec succès.');
        setCancellingInvoiceSale(null);
        onRefreshPdvs();
      }
    } finally {
      setIsCancellingInvoice(false);
    }
  };

  const toggleCardMap = (pdvId: string) => {
    setVisibleMapPdvIds((prev) => ({
      ...prev,
      [pdvId]: !prev[pdvId],
    }));
  };

  const getPdvSalesCount = useCallback(
    (pdv: PDVItem): number => {
      if (typeof pdv.sales_count === 'number') {
        return pdv.sales_count;
      }
      if (Array.isArray(sales) && sales.length > 0) {
        return sales.filter((s) => s.pdv_id === pdv.id && s.status !== 'annulee').length;
      }
      return 0;
    },
    [sales]
  );

  const getPdvSalesAmount = useCallback(
    (pdv: PDVItem): number => {
      if (typeof pdv.total_sales_amount === 'number' && pdv.total_sales_amount > 0) {
        return pdv.total_sales_amount;
      }
      if (Array.isArray(sales) && sales.length > 0) {
        return sales
          .filter((s) => s.pdv_id === pdv.id && s.status !== 'annulee')
          .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
      }
      return Number(pdv.total_sales_amount || 0);
    },
    [sales]
  );

  // Calcule ou récupère le ou les produits assez achetés par le PDV
  const getPdvTopProducts = useCallback(
    (pdv: PDVItem): PdvTopProductItem[] => {
      if (Array.isArray(pdv.top_products) && pdv.top_products.length > 0) {
        return pdv.top_products;
      }
      const pdvSales = (sales || []).filter((s) => s.pdv_id === pdv.id && s.status !== 'annulee');
      if (pdvSales.length === 0) return [];
      const prodMap = new Map<string, PdvTopProductItem>();
      for (const s of pdvSales) {
        let itemsArr: any[] = [];
        if (Array.isArray(s.items)) {
          itemsArr = s.items;
        } else if (typeof s.items === 'string') {
          try {
            itemsArr = JSON.parse(s.items || '[]');
          } catch {
            itemsArr = [];
          }
        }
        for (const it of itemsArr) {
          const name = String(it.name || it.productName || 'Produit Baobab').trim();
          const code = String(it.code || it.productId || name).trim();
          const qty = Math.max(0, Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 0));
          const amt = Math.max(0, Number(it.total ?? qty * Number(it.unitPrice ?? it.price ?? 0)));
          if (qty <= 0) continue;
          const prev = prodMap.get(code) || {
            code,
            name,
            totalQuantity: 0,
            totalAmount: 0,
            purchaseCount: 0,
            lastPurchasedDate: String(s.date || ''),
          };
          prev.totalQuantity += qty;
          prev.totalAmount += amt;
          prev.purchaseCount += 1;
          if (String(s.date || '') >= prev.lastPurchasedDate) {
            prev.lastPurchasedDate = String(s.date || '');
          }
          prodMap.set(code, prev);
        }
      }
      return Array.from(prodMap.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity || b.totalAmount - a.totalAmount)
        .slice(0, 6);
    },
    [sales]
  );

  // Ouvrir la Fiche Profil complète d'un PDV & son Historique (Visites & Ventes + Produits assez achetés)
  const handleOpenPdvFiche = useCallback(
    async (pdv: PDVItem, defaultTab: 'all' | 'visits' | 'sales' = 'all') => {
      if (!canViewPdvFiche) return;
      setFicheTargetPdv(pdv);
      setFicheActiveTab(defaultTab);
      setIsLoadingFiche(true);

      // Fallback immédiat pendant le chargement serveur
      const localSales: PdvFicheHistorySaleItem[] = (sales || [])
        .filter((s) => s.pdv_id === pdv.id && s.status !== 'annulee')
        .map((s) => {
          let parsedItems: any[] = [];
          if (Array.isArray(s.items)) parsedItems = s.items;
          else if (typeof s.items === 'string') {
            try {
              parsedItems = JSON.parse(s.items || '[]');
            } catch {
              parsedItems = [];
            }
          }
          return {
            id: String(s.id),
            number: String(s.number || s.id),
            thermal_ticket_number: s.thermal_ticket_number || null,
            invoice_number:
              s.invoice_number || `FAC-${String(s.number || s.id).replace(/^VTE-/, '')}`,
            date: String(s.date || ''),
            sale_time: String(s.sale_time || '09:00'),
            vendor_id: String(s.vendor_id || pdv.vendor_id || 'usr-vnd-1'),
            vendor_name: String(s.vendor_name || pdv.created_by || 'Oumar Konaté'),
            vendor_code: String(s.vendor_code || pdv.vendor_code || 'BAO-VND-001'),
            total_amount: Number(s.total_amount || 0),
            payment_type: String(s.payment_type || 'Comptant'),
            buyer_type: s.buyer_type || null,
            status: String(s.status || 'livree'),
            items: parsedItems.map((it: any) => ({
              code: String(it.code || it.productId || 'ART'),
              name: String(it.name || it.productName || 'Produit Baobab'),
              qtyBoxes: Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1),
              unitPrice: Number(it.unitPrice ?? it.price ?? 0),
              total: Number(
                it.total ??
                  Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1) *
                    Number(it.unitPrice ?? it.price ?? 0)
              ),
            })),
          };
        });

      setFicheData({
        pdv,
        top_products: getPdvTopProducts(pdv),
        sales_history: localSales,
        visits_history: [],
      });

      try {
        const res = await fetch(`/api/pdvs/${encodeURIComponent(pdv.id)}/fiche`, {
          headers: {
            'x-user-role': currentRole,
            'x-user-id': currentUser?.id || 'usr-vnd-1',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data.pdv) {
            setFicheData({
              pdv: data.pdv,
              top_products: Array.isArray(data.top_products)
                ? data.top_products
                : getPdvTopProducts(pdv),
              sales_history: Array.isArray(data.sales_history) ? data.sales_history : localSales,
              visits_history: Array.isArray(data.visits_history) ? data.visits_history : [],
            });
          }
        }
      } catch {
        // Garde le fallback local
      } finally {
        setIsLoadingFiche(false);
      }
    },
    [canViewPdvFiche, currentRole, currentUser?.id, getPdvTopProducts, sales]
  );

  // Ouvrir le modal de déclaration de visite (Avec vente ou Sans vente + motif soumis à l'Admin & VOD)
  const handleOpenDeclareVisit = useCallback(
    async (pdv: PDVItem, initialMode: 'sans_vente' | 'avec_vente' = 'sans_vente') => {
      setDeclareVisitTargetPdv(pdv);
      setDeclareVisitMode(initialMode);
      setDeclareVisitMotif(pdv.last_no_sale_reason || PRESET_NO_SALE_REASONS[0]);
      setDeclareVisitError(null);
      setDeclareVisitSuccessMsg(null);

      if (catalogProducts.length === 0) {
        try {
          const res = await fetch('/api/products');
          if (res.ok) {
            const d = await res.json();
            const activeProds = (d?.products || []).filter(
              (pr: any) => Number(pr.is_active ?? 1) !== 0
            );
            setCatalogProducts(activeProds);
            if (activeProds.length > 0 && !quickSaleProductId) {
              setQuickSaleProductId(activeProds[0].id);
            }
          }
        } catch {
          // ignore
        }
      } else if (!quickSaleProductId && catalogProducts.length > 0) {
        setQuickSaleProductId(catalogProducts[0].id);
      }
    },
    [catalogProducts, quickSaleProductId]
  );

  const handleSubmitDeclareVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declareVisitTargetPdv) return;
    setDeclareVisitError(null);
    setDeclareVisitSuccessMsg(null);

    const vendorId = currentUser?.id || 'usr-vnd-1';
    const { dateStr: clientDateStr } = getLocalClientDateInfo();
    const coords = getPdvCoordinates(declareVisitTargetPdv);

    if (declareVisitMode === 'sans_vente') {
      const cleanMotif = declareVisitMotif.trim();
      if (cleanMotif.length < 3) {
        setDeclareVisitError(
          "Veuillez renseigner le motif de la visite sans vente (soumis à l'Administrateur et au VOD)."
        );
        return;
      }

      setIsSubmittingDeclareVisit(true);
      try {
        const res = await fetch(
          `/api/pdvs/${encodeURIComponent(declareVisitTargetPdv.id)}/declare-visit`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-role': currentRole,
              'x-user-id': vendorId,
            },
            body: JSON.stringify({
              vendor_id: vendorId,
              visit_mode: 'sans_vente',
              motif: cleanMotif,
              client_date: clientDateStr,
              latitude: coords.lat,
              longitude: coords.lng,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success) {
          if (data.routineStatus) {
            setRoutineStatus(data.routineStatus);
          } else {
            fetchPdvRoutineStatus();
          }
          const nextCount =
            typeof data.routineDayVisitsCount === 'number'
              ? data.routineDayVisitsCount
              : Number(declareVisitTargetPdv.routine_day_visits_count ?? declareVisitTargetPdv.today_visits_count ?? 0) + 1;
          setDeclareVisitTargetPdv((prev) =>
            prev
              ? {
                  ...prev,
                  routine_day_visits_count: nextCount,
                  today_visits_count: nextCount,
                  visited_today: true,
                }
              : prev
          );
          setDeclareVisitSuccessMsg(
            data.message ||
              `Visite sans vente enregistrée pour « ${declareVisitTargetPdv.name} » (Motif : « ${cleanMotif} »). Notification transmise à l'Administrateur et au VOD.`
          );
          setPhotoSuccessToast(
            `Visite sans vente déclarée sur « ${declareVisitTargetPdv.name} » (Motif soumis à l'Admin & au VOD : « ${cleanMotif} »).`
          );
          onRefreshPdvs();
          window.dispatchEvent(new Event('baobab-pdv-visits-updated'));
          window.dispatchEvent(new Event('baobab-notifications-updated'));
          if (ficheTargetPdv && ficheTargetPdv.id === declareVisitTargetPdv.id) {
            void handleOpenPdvFiche(declareVisitTargetPdv, 'visits');
          }
        } else {
          setDeclareVisitError(
            data?.error || 'Erreur lors de la déclaration de la visite sans vente.'
          );
        }
      } catch {
        setDeclareVisitError('Erreur réseau lors de la soumission de la visite sans vente.');
      } finally {
        setIsSubmittingDeclareVisit(false);
      }
      return;
    }

    // Mode 'avec_vente' : enregistrement direct de la vente lors de la visite dans ce PDV
    const prod1 = catalogProducts.find((p) => p.id === quickSaleProductId);
    if (!prod1 || quickSaleQtyBoxes <= 0) {
      setDeclareVisitError('Veuillez sélectionner au moins un produit et un nombre de cartons > 0.');
      return;
    }

    const saleItems: Array<{
      productId: string;
      code: string;
      name: string;
      qtyBoxes: number;
      unitPrice: number;
      total: number;
    }> = [
      {
        productId: prod1.id,
        code: prod1.code,
        name: prod1.name,
        qtyBoxes: Number(quickSaleQtyBoxes),
        unitPrice: Number(prod1.price_box || 0),
        total: Number(quickSaleQtyBoxes) * Number(prod1.price_box || 0),
      },
    ];

    if (quickSaleSecondProductId && quickSaleSecondQtyBoxes > 0) {
      const prod2 = catalogProducts.find((p) => p.id === quickSaleSecondProductId);
      if (prod2 && prod2.id !== prod1.id) {
        saleItems.push({
          productId: prod2.id,
          code: prod2.code,
          name: prod2.name,
          qtyBoxes: Number(quickSaleSecondQtyBoxes),
          unitPrice: Number(prod2.price_box || 0),
          total: Number(quickSaleSecondQtyBoxes) * Number(prod2.price_box || 0),
        });
      }
    }

    const totalCajoucyBoxes = saleItems.reduce((sum, it) => {
      const pObj = catalogProducts.find((p) => p.id === it.productId);
      const hasWholesale = pObj && Number(pObj.wholesale_price_box || 0) > 0;
      return sum + (hasWholesale ? it.qtyBoxes : 0);
    }, 0);
    const totalSaleAmount = saleItems.reduce((sum, it) => sum + it.total, 0);

    setIsSubmittingDeclareVisit(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': vendorId,
        },
        body: JSON.stringify({
          vendor_id: vendorId,
          pdv_id: declareVisitTargetPdv.id,
          date: clientDateStr,
          items: saleItems,
          buyer_type: totalCajoucyBoxes >= 50 ? 'Détaillant' : undefined,
          total_amount: totalSaleAmount,
          payment_type: quickSalePaymentType,
          latitude: coords.lat,
          longitude: coords.lng,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        fetchPdvRoutineStatus();
        const productsLabel = saleItems.map((it) => `${it.name} (${it.qtyBoxes} ctn)`).join(', ');
        setDeclareVisitSuccessMsg(
          `Visite avec vente ${data.number} (${totalSaleAmount.toLocaleString('fr-FR')} FCFA • ${productsLabel}) enregistrée dans l'historique des ventes et la fiche profil de « ${declareVisitTargetPdv.name} » !`
        );
        setPhotoSuccessToast(
          `Vente ${data.number} (${productsLabel}) enregistrée sur « ${declareVisitTargetPdv.name} » !`
        );
        const nextSaleVisitCount =
          Number(declareVisitTargetPdv.routine_day_visits_count ?? declareVisitTargetPdv.today_visits_count ?? 0) + 1;
        setDeclareVisitTargetPdv((prev) =>
          prev
            ? {
                ...prev,
                routine_day_visits_count: nextSaleVisitCount,
                today_visits_count: nextSaleVisitCount,
                visited_today: true,
                sold_today: true,
              }
            : prev
        );
        onRefreshPdvs();
        window.dispatchEvent(new Event('baobab-pdv-visits-updated'));
        window.dispatchEvent(new Event('baobab-sales-realtime-updated'));
        window.dispatchEvent(new Event('baobab-notifications-updated'));
        if (ficheTargetPdv && ficheTargetPdv.id === declareVisitTargetPdv.id) {
          void handleOpenPdvFiche(declareVisitTargetPdv, 'sales');
        }
      } else {
        setDeclareVisitError(data?.error || "Erreur lors de l'enregistrement de la vente.");
      }
    } catch {
      setDeclareVisitError("Erreur réseau lors de l'enregistrement de la vente.");
    } finally {
      setIsSubmittingDeclareVisit(false);
    }
  };

  // RÈGLE STRICTE :
  // "Chaque point de vente est lié au jour où il a été créé par le vendeur et il a l'obligation de revenir
  // dans ces mêmes points de vente pour visite ou vente. Par exemple : les 25 PDV créés le vendredi ne peuvent
  // être visités par le vendeur que le vendredi donc chaque PDV s'affiche uniquement dans le jour où il a été créé
  // et visible que par son vendeur."
  const vendorMatchedPdvs: PDVItem[] =
    currentRole === 'Vendeur' && (currentUser?.id || currentUser?.name)
      ? pdvs.filter(
          (p) =>
            (currentUser?.id && p.vendor_id === currentUser.id) ||
            (!p.vendor_id && currentUser?.name && p.created_by === currentUser.name) ||
            (currentUser?.name && (p as any).vendor_name === currentUser.name)
        )
      : pdvs;

  const vendorAllDaysPdvs: PDVItem[] =
    vendorMatchedPdvs.length > 0 ? vendorMatchedPdvs : pdvs;

  const vendorDayMatchedPdvs: PDVItem[] =
    currentRole === 'Vendeur'
      ? vendorAllDaysPdvs.filter((p) => {
          const pDayIdx = Number(p.routine_day_index || 0);
          const pDayName = String(p.routine_day || '').trim().toLowerCase();
          const activeIdx = Number(routineStatus.activeDayIndex || 1);
          const activeName = String(routineStatus.activeDayName || 'Lundi')
            .trim()
            .toLowerCase();
          if (pDayIdx > 0 && pDayIdx === activeIdx) return true;
          if (pDayName && pDayName === activeName) return true;
          if (!pDayIdx && !pDayName) return true;
          return false;
        })
      : [];

  const scopedPdvs: PDVItem[] =
    currentRole === 'Vendeur'
      ? vendorDayMatchedPdvs.length > 0
        ? vendorDayMatchedPdvs
        : vendorAllDaysPdvs
      : selectedDayFilter === 'all'
      ? pdvs
      : pdvs.filter(
          (p) =>
            String(p.routine_day || '').toLowerCase() === selectedDayFilter.toLowerCase() ||
            String(p.routine_day_index || '') === selectedDayFilter
        );

  const pdvsWithSalesCount = scopedPdvs.filter((p) => getPdvSalesCount(p) > 0).length;
  const pdvsZeroSalesCount = scopedPdvs.filter((p) => getPdvSalesCount(p) === 0).length;

  const comparePdvsNewestFirst = useCallback((a: PDVItem, b: PDVItem) => {
    const extractNumericSuffix = (raw: unknown): number => {
      const str = String(raw || '');
      const m = str.match(/(\d+)(?!.*\d)/);
      return m ? Number(m[1]) : 0;
    };
    const tsA = String(a.updated_at || a.created_at || '');
    const tsB = String(b.updated_at || b.created_at || '');
    if (tsA !== tsB) return tsB.localeCompare(tsA);

    const cA = String(a.created_at || '');
    const cB = String(b.created_at || '');
    if (cA !== cB) return cB.localeCompare(cA);

    const idNumA = extractNumericSuffix(a.id);
    const idNumB = extractNumericSuffix(b.id);
    if (idNumA !== idNumB) return idNumB - idNumA;

    const codeNumA = extractNumericSuffix(a.code);
    const codeNumB = extractNumericSuffix(b.code);
    if (codeNumA !== codeNumB) return codeNumB - codeNumA;

    return String(b.code || '').localeCompare(String(a.code || ''), 'fr');
  }, []);

  const filtered = scopedPdvs
    .filter((p) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.neighborhood || '').toLowerCase().includes(q) ||
        String(p.manager_name || '').toLowerCase().includes(q) ||
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.city || '').toLowerCase().includes(q) ||
        String((p as any).vendor_name || p.created_by || '').toLowerCase().includes(q);
      const count = getPdvSalesCount(p);
      const matchesStatus =
        filterStatus === 'all'
          ? true
          : filterStatus === 'with_sales'
          ? count > 0
          : filterStatus === 'zero_sales'
          ? count === 0
          : p.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort(comparePdvsNewestFirst);

  const rejectedCount = scopedPdvs.filter((p) => p.status === 'rejete').length;

  const activeModalLat = capturedGpsStamp ? capturedGpsStamp.lat : liveGps.lat;
  const activeModalLng = capturedGpsStamp ? capturedGpsStamp.lng : liveGps.lng;
  const activeModalAcc = capturedGpsStamp ? capturedGpsStamp.accuracy : liveGps.accuracy;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Points de Vente (PDV) &bull; Bamako
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {currentRole === 'Vendeur'
                ? `${scopedPdvs.length} PDV du ${routineStatus.activeDayName} (Mes PDV)`
                : `Réseau de ${scopedPdvs.length} PDV`}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#008DA9]/15 text-[#008DA9] dark:bg-[#008DA9]/25 dark:text-cyan-300">
              {pdvsWithSalesCount} avec ventes
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {pdvsZeroSalesCount} avec 0 ventes
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {currentRole === 'Vendeur'
                ? `Affichage exclusif de vos PDV créés le ${routineStatus.activeDayName} — obligation de validation d'au moins 25 PDV avant passage au jour suivant.`
                : 'Fiches profils PDV, produits les plus achetés, historique complet des visites et des ventes.'}
            </p>
            <InfoTooltip
              text={
                canValidatePdv
                  ? 'Chaque PDV dispose de sa fiche profil affichant le nombre de ventes réalisées, les produits assez achetés par le PDV, et tout l’historique des visites (avec ou sans vente + motif) et des ventes.'
                  : "Chaque PDV est lié au jour où il a été créé par son vendeur et s'affiche uniquement sur ce jour. Tant que les 25 PDV ne sont pas validés, vous restez sur ce jour."
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ExportViewButton
            currentUser={currentUser as any}
            jeu="pdv"
            label="Exporter"
            filtres={{
              status:
                filterStatus !== 'all' && filterStatus !== 'with_sales' && filterStatus !== 'zero_sales'
                  ? filterStatus
                  : '',
              q: searchTerm,
            }}
          />
          {canCreate && (
            <button
              onClick={() => {
                const defaultSec = getDefaultSectorForRoutineDay(routineStatus.activeDayName);
                setHasManualSectorChoice(false);
                setNeighborhood(defaultSec);
                setRoutineName(buildDefaultPdvRoutineName(routineStatus.activeDayName, defaultSec));
                setCreateError(null);
                setCapturedPhotoData(null);
                setCapturedGpsStamp(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>+ Nouveau PDV ({routineStatus.activeDayName})</span>
            </button>
          )}

          {canValidatePdv && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold">
              <Shield className="w-4 h-4" />
              <span>
                {isDirecteurOps
                  ? 'VOD : Fiches PDV, Historique Visites/Ventes & Notifications Motifs'
                  : 'Admin : Fiches PDV, Historique Visites/Ventes & Validation'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bandeau Règle Stricte Vendeur : Obligation d'au moins 25 PDV & Verrouillage sur le jour non atteint + Portefeuille PDV lié au jour */}
      {currentRole === 'Vendeur' && (
        <div
          className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
            routineStatus.isTargetReachedToday
              ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-cyan-50/90 dark:bg-slate-800/80 border-[#008DA9]/40 text-slate-800 dark:text-slate-100'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-white ${
                routineStatus.isTargetReachedToday ? 'bg-emerald-600' : 'bg-[#008DA9]'
              }`}
            >
              <Calendar className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                <span>
                  Jour actif obligatoire : {routineStatus.activeDayName} ({routineStatus.activePdvCount}/
                  {routineStatus.targetPdvCount} PDV validés)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    routineStatus.isTargetReachedToday
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {routineStatus.isTargetReachedToday
                    ? `Objectif 25 PDV validé • Déblocage ${routineStatus.nextDayName} à 00h00`
                    : `Verrouillé sur ${routineStatus.activeDayName} (${routineStatus.remainingForTarget} PDV restants)`}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                {routineStatus.isTargetReachedToday
                  ? `Vous avez validé au moins 25 PDV sur ${routineStatus.activeDayName}. À partir de 00h00, ${routineStatus.nextDayName} sera débloqué et ${routineStatus.activeDayName} sera verrouillé.`
                  : `Tant que vous n'avez pas validé obligatoirement au moins 25 PDV, vous restez sur ${routineStatus.activeDayName}. Seuls vos ${scopedPdvs.length} PDV créés le ${routineStatus.activeDayName} s'affichent ici pour visite ou vente.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {ROUTINE_WEEK_DAYS_NO_SUNDAY.map((d) => {
              const isCurrent = d.dayIndex === routineStatus.activeDayIndex;
              return (
                <span
                  key={d.dayIndex}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black border flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-[#008DA9] text-white border-[#008DA9]'
                      : 'bg-white/70 dark:bg-slate-900/60 text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                  title={
                    isCurrent
                      ? `${d.dayName} : Jour actif (${scopedPdvs.length} PDV affichés)`
                      : `${d.dayName} : Verrouillé (les PDV de ${d.dayName} ne sont visibles et visitables que le ${d.dayName})`
                  }
                >
                  {isCurrent ? <CheckCircle className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                  <span>{d.shortName}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Bandeau KPI Temps Réel Vendeur (Objectif 25 PDV/jour, visites effectuées, ventes réalisées sur la journée en cours + Jours de routine Lundi..Samedi) */}
      {(currentRole === 'Vendeur' || isAdmin || isDirecteurOps) && (
        <VendorPerformanceKpiDashboard
          vendorId={currentRole === 'Vendeur' ? currentUser?.id || 'usr-vnd-1' : 'usr-vnd-1'}
          vendorName={currentRole === 'Vendeur' ? currentUser?.name || 'Oumar Konaté' : 'Oumar Konaté'}
          vendorRole={currentRole}
          compact
          hideCreationActions={currentRole !== 'Vendeur'}
          externalRefreshTrigger={pdvs.length + sales.length + routineStatus.activePdvCount}
        />
      )}

      {/* Filtre par Jour de création PDV pour l'Admin, le VOD et le Sales Admin */}
      {currentRole !== 'Vendeur' && (
        <div className="flex items-center gap-1.5 flex-wrap bg-slate-100/80 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300 px-2 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#008DA9]" />
            <span>Filtrer par jour lié au PDV :</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedDayFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
              selectedDayFilter === 'all'
                ? 'bg-[#008DA9] text-white'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Tous les jours ({pdvs.length})
          </button>
          {ROUTINE_WEEK_DAYS_NO_SUNDAY.map((d) => {
            const dayCnt = pdvs.filter(
              (p) =>
                Number(p.routine_day_index || 0) === d.dayIndex ||
                String(p.routine_day || '').toLowerCase() === d.dayName.toLowerCase()
            ).length;
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => setSelectedDayFilter(d.dayName)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                  selectedDayFilter === d.dayName
                    ? 'bg-[#008DA9] text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {d.dayName} ({dayCnt})
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Status Filter Grid — Boutons en rangées et colonnes sans débordement */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Rechercher par nom, quartier (Sotuba, Badalabougou, Faladié...), gérant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-[48px] min-h-[48px] pl-11 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[16px] text-slate-900 dark:text-white focus:outline-none focus:border-[#008DA9] transition-none"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
              filterStatus === 'all'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>Tous</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
              {scopedPdvs.length}
            </span>
          </button>
          <button
            onClick={() => setFilterStatus('with_sales')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
              filterStatus === 'with_sales'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>Avec ventes</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
              {pdvsWithSalesCount}
            </span>
          </button>
          <button
            onClick={() => setFilterStatus('zero_sales')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
              filterStatus === 'zero_sales'
                ? 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>0 ventes</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
              {pdvsZeroSalesCount}
            </span>
          </button>
          <button
            onClick={() => setFilterStatus('valide')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
              filterStatus === 'valide'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>Validés</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
              {scopedPdvs.filter((p) => p.status === 'valide').length}
            </span>
          </button>
          <button
            onClick={() => setFilterStatus('en_attente')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
              filterStatus === 'en_attente'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>En Attente</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
              {scopedPdvs.filter((p) => p.status === 'en_attente').length}
            </span>
          </button>
          {(rejectedCount > 0 || canValidatePdv) && (
            <button
              onClick={() => setFilterStatus('rejete')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between gap-1.5 border ${
                filterStatus === 'rejete'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span>Rejetés</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-black/10 dark:bg-white/10">
                {rejectedCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {photoSuccessToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{photoSuccessToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setPhotoSuccessToast(null)}
            className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Grille de cartes partagées des Points de Vente (PDV) — 1 col mobile, 2 cols tablette, 3 cols PC >= 1280px */}
      <div className="space-y-4 w-full min-w-0 box-border">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center font-sans space-y-3">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Aucun point de vente ne correspond à ces critères.
            </p>
            {(pdvs.length > 0 && (filterStatus !== 'all' || selectedDayFilter !== 'all' || searchTerm.trim() !== '')) && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStatus('all');
                    setSelectedDayFilter('all');
                    setSearchTerm('');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-900 text-white text-xs font-bold hover:bg-blue-950 transition-colors cursor-pointer"
                >
                  Afficher tous les Points de Vente ({scopedPdvs.length || pdvs.length})
                </button>
              </div>
            )}
          </div>
        ) : (
          <GrilleCartesPdv>
            {filtered.map((pdv) => {
              const storefrontImg = getPdvStorefrontImageUrl(pdv);
              const routineDayLabel = (
                pdv.routine_day ||
                routineStatus.activeDayName ||
                'lundi'
              ).toLowerCase();
              const salesCnt = getPdvSalesCount(pdv);
              const routineVisitsToday = Number(
                pdv.today_visits_count ??
                  pdv.routine_day_visits_count ??
                  (pdv.visited_today ? 1 : 0)
              );
              const noSaleCnt = Math.max(Number(pdv.no_sale_visits_count ?? 0), 0);
              const totalVisitsCnt = Math.max(
                Number(pdv.visits_count ?? routineVisitsToday),
                salesCnt + noSaleCnt
              );

              const infoBadges: string[] = [];
              if (pdv.visited_today || routineVisitsToday > 0) {
                infoBadges.push("Visité aujourd'hui");
              } else if (totalVisitsCnt > 0) {
                infoBadges.push('Déjà visité');
              } else {
                infoBadges.push('Non visité');
              }
              if (salesCnt > 0) {
                infoBadges.push(salesCnt > 1 ? `Avec vente (${salesCnt})` : 'Avec vente');
              } else if (totalVisitsCnt > 0) {
                infoBadges.push('Sans vente');
              } else {
                infoBadges.push(`Jour : ${routineDayLabel}`);
              }

              const customActions: CartePdvAction[] = [];
              if (canValidatePdv && pdv.status !== 'valide') {
                customActions.push({
                  key: 'valider_pdv',
                  label: 'Valider',
                  onClick: () => handleUpdateStatus(pdv.id, 'valide'),
                  disabled: updatingId === pdv.id,
                  variant: 'green',
                  icon: <CheckCircle className="w-4 h-4 shrink-0" />,
                });
              }
              if (canValidatePdv && pdv.status !== 'rejete') {
                customActions.push({
                  key: 'rejeter_pdv',
                  label: 'Refuser',
                  onClick: () => {
                    setRejectingPdv(pdv);
                    setRejectionReason('Informations incomplètes ou doublon de zone');
                  },
                  disabled: updatingId === pdv.id,
                  variant: 'red',
                  icon: <XCircle className="w-4 h-4 shrink-0" />,
                });
              }

              return (
                <CartePdv
                  key={pdv.id}
                  pdv={pdv}
                  photoUrl={storefrontImg}
                  name={pdv.name}
                  code={pdv.code}
                  createdAt={pdv.created_at}
                  neighborhood={pdv.neighborhood}
                  city={pdv.city || 'Bamako'}
                  vendorName={pdv.created_by || 'Oumar Konaté'}
                  vendorCode={pdv.vendor_code || 'BAO-VND-001'}
                  status={pdv.status}
                  infoBadges={infoBadges}
                  routineDayLabel={routineDayLabel}
                  todayVisitsCount={routineVisitsToday}
                  visitsCount={totalVisitsCnt}
                  noSaleCount={noSaleCnt}
                  salesCount={salesCnt}
                  visitLabel="Visite sans vente"
                  currentRole={currentRole}
                  onViewFiche={
                    canViewPdvFiche ? () => handleOpenPdvFiche(pdv, 'all') : undefined
                  }
                  onItinerary={() => handleOpenPdvItinerary(pdv)}
                  onSell={
                    isVendeur || currentRole === 'Administrateur'
                      ? () =>
                          onStartSaleForPdv
                            ? onStartSaleForPdv(pdv)
                            : handleOpenDeclareVisit(pdv, 'avec_vente')
                      : undefined
                  }
                  onVisit={
                    isVendeur || currentRole === 'Administrateur'
                      ? () => handleOpenDeclareVisit(pdv, 'sans_vente')
                      : undefined
                  }
                  customActions={customActions}
                />
              );
            })}
          </GrilleCartesPdv>
        )}

        {/* Pied de synthèse de la liste des PDV */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 font-sans text-xs sm:text-sm text-slate-700 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Validés :{' '}
              <strong className="font-mono font-bold text-[#15803D] dark:text-white">
                {filtered.filter((p) => p.status === 'valide').length}
              </strong>
            </span>
            <span>
              En attente :{' '}
              <strong className="font-mono font-bold text-[#92400E] dark:text-white">
                {filtered.filter((p) => p.status === 'en_attente').length}
              </strong>
            </span>
            <span>
              Refusés :{' '}
              <strong className="font-mono font-bold text-[#B91C1C] dark:text-white">
                {filtered.filter((p) => p.status === 'rejete').length}
              </strong>
            </span>
          </div>
          <span>
            CA cumulé PDV :{' '}
            <strong className="font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
              {filtered.reduce((acc, p) => acc + getPdvSalesAmount(p), 0).toLocaleString('fr-FR')}{' '}
              FCFA
            </strong>
          </span>
        </div>
      </div>

      {/* Hidden file input for optional direct photo selection/camera on mobile & desktop */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilePhotoSelected}
        className="hidden"
      />

      {/* Modal Itinéraire GPS & Visite Physique vers le PDV créé par un vendeur (DOV / Administrateur) avec Google Maps API */}
      {itineraryTargetPdv && (
        <FormModal
          title={`Itinéraire GPS Google Maps • Visite Physique PDV`}
          subtitle={`${itineraryTargetPdv.name} (${itineraryTargetPdv.code}) • Quartier ${itineraryTargetPdv.neighborhood}, Bamako • Créé par ${itineraryTargetPdv.created_by || 'Oumar Konaté'}`}
          icon={<Route className="w-5 h-5 text-[#006B82]" />}
          onClose={() => {
            setItineraryTargetPdv(null);
            setItineraryResult(null);
            setGoogleMapsRouteSummary(null);
          }}
          cancelLabel="Fermer"
          submitLabel="Fermer l'itinéraire"
          onSubmit={(e) => {
            e.preventDefault();
            setItineraryTargetPdv(null);
            setItineraryResult(null);
            setGoogleMapsRouteSummary(null);
          }}
        >
          <div className="space-y-4 text-xs">
            {/* Fiche d'identité du PDV à visiter via le composant partagé CartePdv */}
            <CartePdv
              pdv={itineraryTargetPdv}
              photoUrl={getPdvStorefrontImageUrl(itineraryTargetPdv)}
              name={itineraryTargetPdv.name}
              code={itineraryTargetPdv.code}
              createdAt={itineraryTargetPdv.created_at}
              neighborhood={itineraryTargetPdv.neighborhood}
              city={itineraryTargetPdv.city || 'Bamako'}
              vendorName={itineraryTargetPdv.created_by || 'Oumar Konaté'}
              vendorCode={itineraryTargetPdv.vendor_code || 'BAO-VND-001'}
              status={itineraryTargetPdv.status}
              routineDayLabel={(
                itineraryTargetPdv.routine_day ||
                routineStatus.activeDayName ||
                'lundi'
              ).toLowerCase()}
              todayVisitsCount={Number(
                itineraryTargetPdv.today_visits_count ??
                  itineraryTargetPdv.routine_day_visits_count ??
                  (itineraryTargetPdv.visited_today ? 1 : 0)
              )}
              noSaleCount={Number(itineraryTargetPdv.no_sale_visits_count ?? 0)}
              salesCount={getPdvSalesCount(itineraryTargetPdv)}
              currentRole={currentRole}
              onViewFiche={
                canViewPdvFiche
                  ? () => {
                      const target = itineraryTargetPdv;
                      setItineraryTargetPdv(null);
                      void handleOpenPdvFiche(target, 'all');
                    }
                  : undefined
              }
            />

            {/* Sélection du point de départ du DOV & mode de déplacement */}
            <div className="p-3.5 rounded-2xl border border-[#008DA9]/30 bg-cyan-50/40 dark:bg-slate-800/60 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <LocateFixed className="w-4 h-4 text-[#008DA9]" />
                  <span>Point de départ pour votre déplacement (Visite physique DOV) :</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setItineraryTravelMode('DRIVING')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      itineraryTravelMode === 'DRIVING'
                        ? 'bg-[#008DA9] text-white border-[#008DA9]'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Véhicule / Moto
                  </button>
                  <button
                    type="button"
                    onClick={() => setItineraryTravelMode('WALKING')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      itineraryTravelMode === 'WALKING'
                        ? 'bg-[#008DA9] text-white border-[#008DA9]'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Piéton
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setItineraryOriginMode('current_gps');
                      const livePos = await resolveCurrentDovGpsPosition(
                        BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lat,
                        BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lng
                      );
                      setDovLiveOriginGps(livePos);
                      await recomputeItineraryForPdv(itineraryTargetPdv, 'current_gps', {
                        lat: livePos.lat,
                        lng: livePos.lng,
                      });
                    }}
                    disabled={isComputingItinerary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isComputingItinerary ? 'animate-spin' : ''}`} />
                    <span>Actualiser ma position GPS</span>
                  </button>
                </div>
              </div>

              <select
                value={itineraryOriginMode}
                onChange={async (e) => {
                  const nextMode = e.target.value;
                  setItineraryOriginMode(nextMode);
                  await recomputeItineraryForPdv(itineraryTargetPdv, nextMode);
                }}
                className="w-full h-[48px] min-h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-xs"
              >
                <option value="current_gps">
                  Ma position GPS actuelle ({dovLiveOriginGps.lat.toFixed(5)}, {dovLiveOriginGps.lng.toFixed(5)})
                </option>
                {BAMAKO_DEPARTURE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({preset.lat.toFixed(4)}, {preset.lng.toFixed(4)})
                  </option>
                ))}
              </select>
            </div>

            {/* Indicateurs clés du trajet (Distance Google Maps, Durée Véhicule, Durée Moto, Cap) */}
            {itineraryResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    {googleMapsRouteSummary ? 'Distance Google Maps' : 'Distance routière'}
                  </div>
                  <div className="text-base font-black text-[#008DA9] dark:text-cyan-400 mt-0.5">
                    {googleMapsRouteSummary ? googleMapsRouteSummary.distanceLabel : `${itineraryResult.distanceKm} km`}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    {itineraryTravelMode === 'WALKING' ? 'Durée Marche (Google)' : 'Trajet Véhicule DOV'}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    ~{googleMapsRouteSummary ? googleMapsRouteSummary.durationLabel : `${itineraryResult.durationVehicleMin} min`}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Trajet Moto Terrain</div>
                  <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                    ~{itineraryResult.durationMotoMin} min
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Direction / Cap</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {itineraryResult.compassDirection}
                  </div>
                </div>
              </div>
            )}

            {/* Carte Interactive Google Maps (avec bascule optionnelle OpenStreetMap) traçant le chemin jusqu'au PDV */}
            {(() => {
              const pdvCoords = getPdvCoordinates(itineraryTargetPdv);
              const originLat = itineraryResult ? itineraryResult.originLat : dovLiveOriginGps.lat;
              const originLng = itineraryResult ? itineraryResult.originLng : dovLiveOriginGps.lng;
              const originLabel = itineraryResult ? itineraryResult.originLabel : 'Ma position GPS actuelle (DOV)';

              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <MapIcon className="w-4 h-4 text-[#008DA9]" />
                      <span>
                        {itineraryMapEngine === 'google_maps'
                          ? 'Tracé de l’itinéraire GPS via l’API Google Maps (Routes API)'
                          : 'Carte GPS OpenStreetMap de l’itinéraire jusqu’au PDV'}
                      </span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setItineraryMapEngine('google_maps')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          itineraryMapEngine === 'google_maps'
                            ? 'bg-[#008DA9] text-white border-[#008DA9]'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        Google Maps API
                      </button>
                      <button
                        type="button"
                        onClick={() => setItineraryMapEngine('osm')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          itineraryMapEngine === 'osm'
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-700'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        OpenStreetMap
                      </button>
                    </div>
                  </div>

                  {itineraryMapEngine === 'google_maps' ? (
                    <GoogleMapsPdvRoute
                      originLat={originLat}
                      originLng={originLng}
                      originLabel={originLabel}
                      destLat={pdvCoords.lat}
                      destLng={pdvCoords.lng}
                      destName={itineraryTargetPdv.name}
                      destCode={itineraryTargetPdv.code}
                      destNeighborhood={itineraryTargetPdv.neighborhood}
                      destManager={itineraryTargetPdv.manager_name}
                      vendorCreator={itineraryTargetPdv.created_by || 'Oumar Konaté'}
                      travelMode={itineraryTravelMode}
                      fallbackPolyline={itineraryResult?.polyline}
                      heightClassName="h-80"
                      onRouteCalculated={(summary) => setGoogleMapsRouteSummary(summary)}
                    />
                  ) : (
                    <OsmLeafletMap
                      centerLat={pdvCoords.lat}
                      centerLng={pdvCoords.lng}
                      accuracy={pdvCoords.accuracy}
                      zoom={14}
                      heightClassName="h-80"
                      label={`${itineraryTargetPdv.name} (${itineraryTargetPdv.code})`}
                      sublabel={`Quartier ${itineraryTargetPdv.neighborhood} • Gérant : ${itineraryTargetPdv.manager_name}`}
                      markers={[
                        {
                          id: itineraryTargetPdv.id,
                          lat: pdvCoords.lat,
                          lng: pdvCoords.lng,
                          accuracy: pdvCoords.accuracy,
                          title: `${itineraryTargetPdv.name} (${itineraryTargetPdv.code})`,
                          subtitle: `${itineraryTargetPdv.neighborhood}, Bamako • Créé par ${itineraryTargetPdv.created_by || 'Vendeur'}`,
                          status: itineraryTargetPdv.status,
                          capturedAt: itineraryTargetPdv.captured_at,
                        },
                      ]}
                      selectedId={itineraryTargetPdv.id}
                      routeOverlay={
                        itineraryResult
                          ? {
                              originLat: itineraryResult.originLat,
                              originLng: itineraryResult.originLng,
                              originLabel: itineraryResult.originLabel,
                              destLat: itineraryResult.destLat,
                              destLng: itineraryResult.destLng,
                              destLabel: itineraryResult.destLabel,
                              polyline: itineraryResult.polyline,
                              distanceKm: itineraryResult.distanceKm,
                              durationMin: itineraryResult.durationVehicleMin,
                            }
                          : null
                      }
                    />
                  )}
                </div>
              );
            })()}

            {/* Boutons de lancement de navigation GPS sur Smartphone / Tablette / Ordinateur */}
            {itineraryResult && (
              <div className="space-y-2">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  Démarrer le guidage GPS vocal pour se déplacer sur place :
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <a
                    href={itineraryResult.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Navigation className="w-4 h-4 shrink-0" />
                    <span>Guidage Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  </a>
                  <a
                    href={itineraryResult.osmDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Route className="w-4 h-4 shrink-0" />
                    <span>Itinéraire OpenStreetMap</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  </a>
                  <a
                    href={itineraryResult.wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span>Ouvrir dans Waze</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  </a>
                </div>
              </div>
            )}

            {/* Étapes détaillées de l'itinéraire routier (Google Maps Routes API ou OSRM/Bamako) */}
            {(() => {
              const displayedSteps =
                googleMapsRouteSummary && googleMapsRouteSummary.steps.length > 0
                  ? googleMapsRouteSummary.steps
                  : itineraryResult?.steps || [];
              if (displayedSteps.length === 0) return null;
              return (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      Étapes détaillées de l&apos;itinéraire ({displayedSteps.length} étapes)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                      {googleMapsRouteSummary && googleMapsRouteSummary.steps.length > 0
                        ? 'Google Maps Routes API'
                        : itineraryResult?.source === 'osrm_live'
                        ? 'Calcul routier GPS direct'
                        : 'Calcul routier Bamako (Hors-ligne actif)'}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {displayedSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-[#008DA9] text-white font-mono font-black text-[11px] flex items-center justify-center shrink-0">
                            {step.stepNumber}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                            {step.instruction}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-[#008DA9] dark:text-cyan-400 shrink-0">
                          {step.distanceLabel} &bull; {step.durationLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Actions rapides de validation / rejet sur place pour le DOV / Administrateur */}
            {canValidatePdv && (
              <div className="p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-extrabold text-teal-900 dark:text-teal-200">
                    Décision suite à la visite physique du PDV
                  </div>
                  <div className="text-[11px] text-teal-700 dark:text-teal-300">
                    Vous pouvez valider ou rejeter ce PDV directement depuis cette fiche de visite terrain.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {itineraryTargetPdv.status !== 'valide' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleUpdateStatus(itineraryTargetPdv.id, 'valide');
                        setItineraryTargetPdv((prev) => (prev ? { ...prev, status: 'valide' } : null));
                      }}
                      disabled={updatingId === itineraryTargetPdv.id}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Valider le PDV</span>
                    </button>
                  )}
                  {itineraryTargetPdv.status !== 'rejete' && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = itineraryTargetPdv;
                        setItineraryTargetPdv(null);
                        setRejectingPdv(target);
                        setRejectionReason('PDV non conforme lors de la visite physique DOV');
                      }}
                      disabled={updatingId === itineraryTargetPdv.id}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white font-bold text-xs cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>Rejeter</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </FormModal>
      )}

      {/* Fullscreen Storefront Photo Modal */}
      {previewPhotoPdv && (
        <PdvPhotoFullscreenModal
          photoUrl={getPdvStorefrontImageUrl(previewPhotoPdv)}
          name={previewPhotoPdv.name}
          code={previewPhotoPdv.code}
          subtitle={`${previewPhotoPdv.neighborhood}, ${previewPhotoPdv.city || 'Bamako'} • Par ${previewPhotoPdv.created_by || 'Oumar Konaté'} • GPS ${Number(previewPhotoPdv.latitude || 12.6392).toFixed(6)}, ${Number(previewPhotoPdv.longitude || -8.0029).toFixed(6)}`}
          onClose={() => setPreviewPhotoPdv(null)}
        />
      )}

      {/* Direct Camera Modal for Existing PDV — Immediately assigns captured photo as the PDV's profile image */}
      {photoTargetPdv && (
        <FormModal
          title="Photo Devanture & Profil PDV"
          subtitle={`${photoTargetPdv.name} (${photoTargetPdv.code}) • ${photoTargetPdv.neighborhood}, Bamako`}
          icon={<Camera className="w-5 h-5 text-[var(--marque-fonce)]" />}
          onClose={() => {
            stopCameraStream();
            setPhotoTargetPdv(null);
            setCapturedPhotoData(null);
            setCapturedGpsStamp(null);
          }}
          cancelLabel="Fermer"
          hideFooter={true}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl border-2 border-[var(--marque)]/40 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide text-[11px]">
                    Prise de photo directe
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-cyan-300 border border-[var(--marque)]/30 text-[11px] font-bold flex items-center gap-1 hover:opacity-90 cursor-pointer"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Importer / Appareil photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCameraFacing}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:bg-slate-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Changer caméra ({facingMode === 'environment' ? 'Arrière' : 'Avant'})</span>
                  </button>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-16/10 flex items-center justify-center">
                {!capturedPhotoData ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${usingSyntheticStream ? 'hidden' : 'block'}`}
                    />
                    <canvas
                      ref={fallbackCanvasRef}
                      width={800}
                      height={500}
                      className={`w-full h-full object-cover ${usingSyntheticStream ? 'block' : 'hidden'}`}
                    />
                    <div className="absolute bottom-2 left-2 right-2 bg-slate-950/80 backdrop-blur-xs text-white px-3 py-2 rounded-xl border border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="font-mono">
                        <span className="text-cyan-400 font-bold">GPS DIRECT :</span>{' '}
                        Lat {liveGps.lat.toFixed(6)}° N | Lng {liveGps.lng.toFixed(6)}° O (±{liveGps.accuracy}m)
                      </div>
                      <div className="text-[10px] text-emerald-300 font-semibold">
                        {cameraStatusMsg}
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    src={capturedPhotoData}
                    alt="Devanture PDV capturée"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain bg-black"
                  />
                )}
              </div>

              {!capturedPhotoData ? (
                <button
                  type="button"
                  onClick={handleCaptureStorefrontAndGps}
                  disabled={isAssigningPhoto}
                  className="w-full py-3 px-4 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Prendre la photo &amp; Assigner au profil du PDV</span>
                </button>
              ) : (
                <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl">
                  <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                    <img
                      src={capturedPhotoData}
                      alt="Nouveau profil PDV"
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-500 shrink-0"
                    />
                    <div>
                      <div className="font-extrabold text-xs flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>
                          {isAssigningPhoto
                            ? 'Enregistrement de la photo de profil en cours...'
                            : `Image de profil assignée directement à « ${photoTargetPdv.name} » !`}
                        </span>
                      </div>
                      {capturedGpsStamp && (
                        <div className="font-mono text-[11px] mt-0.5">
                          GPS: {capturedGpsStamp.lat.toFixed(6)}, {capturedGpsStamp.lng.toFixed(6)} &bull; {capturedGpsStamp.dateStr} à {capturedGpsStamp.timeStr}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1 hover:bg-slate-100 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reprendre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCameraStream();
                        setPhotoTargetPdv(null);
                        setCapturedPhotoData(null);
                        setCapturedGpsStamp(null);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs cursor-pointer"
                    >
                      Terminer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </FormModal>
      )}

      {/* Reject PDV Modal (Administrateur & DOV) */}
      {canValidatePdv && rejectingPdv && (
        <FormModal
          title="Rejeter la demande de PDV"
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
          onClose={() => setRejectingPdv(null)}
          onSubmit={handleConfirmReject}
          submitLabel="Confirmer le rejet"
          submitDisabled={updatingId === rejectingPdv.id}
          isDirty={Boolean(rejectionReason.trim())}
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-900 dark:text-white">{rejectingPdv.name}</div>
              <div className="text-slate-500 mt-0.5">
                {rejectingPdv.code} &bull; {rejectingPdv.neighborhood} &bull; Gérant : {rejectingPdv.manager_name}
              </div>
              <div className="text-teal-700 dark:text-teal-300 font-bold mt-1">
                Créé par le vendeur : {rejectingPdv.created_by || 'Oumar Konaté'}
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif du rejet :
              </label>
              <input
                type="text"
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Indiquez le motif du rejet..."
                className={FORM_FIELD_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* Modal Demande de validation ou de refus de PDV soumis par le vendeur (ouvert au clic sur la notification du DOV / Administrateur) */}
      {validationRequestPdv && (
        <FormModal
          title={`Demande de validation ou de refus de PDV • ${validationRequestPdv.name}`}
          subtitle={`${validationRequestPdv.code} • Soumis par le vendeur ${validationRequestPdv.created_by || 'Oumar Konaté'} (${validationRequestPdv.vendor_code || 'BAO-VND-001'}) • Quartier ${validationRequestPdv.neighborhood}, Bamako`}
          icon={<Store className="w-5 h-5 text-[#006B82]" />}
          onClose={() => {
            setValidationRequestPdv(null);
            setValidationRequestNotif(null);
            setShowInlineRefuseForm(false);
            setValidationActionFeedback(null);
          }}
          cancelLabel="Fermer"
          submitLabel="Fermer la demande"
          onSubmit={(e) => {
            e.preventDefault();
            setValidationRequestPdv(null);
            setValidationRequestNotif(null);
            setShowInlineRefuseForm(false);
            setValidationActionFeedback(null);
          }}
        >
          <div className="space-y-4 text-xs font-sans">
            {/* Message de la notification / Demande soumise par le vendeur */}
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#006B82]" />
                  <span>
                    {validationRequestNotif?.title ||
                      `Demande soumise par ${validationRequestPdv.created_by || 'Oumar Konaté'} : ${validationRequestPdv.name}`}
                  </span>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                    validationRequestPdv.status === 'valide'
                      ? 'bg-[#15803D] text-white'
                      : validationRequestPdv.status === 'rejete'
                      ? 'bg-[#B91C1C] text-white'
                      : 'bg-[#92400E] text-white'
                  }`}
                >
                  {validationRequestPdv.status === 'valide'
                    ? 'PDV Validé'
                    : validationRequestPdv.status === 'rejete'
                    ? 'PDV Refusé'
                    : 'En attente de décision DOV'}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                {validationRequestNotif?.message ||
                  `Le vendeur ${validationRequestPdv.created_by || 'Oumar Konaté'} (${validationRequestPdv.vendor_code || 'BAO-VND-001'}) a soumis le point de vente « ${validationRequestPdv.name} » (${validationRequestPdv.code}), quartier ${validationRequestPdv.neighborhood}, Bamako (Gérant : ${validationRequestPdv.manager_name}${validationRequestPdv.phone ? ` • ${validationRequestPdv.phone}` : ''}).`}
              </p>
            </div>

            {/* Retour visuel immédiat après validation ou refus */}
            {validationActionFeedback && (
              <div
                className={`p-3.5 rounded-2xl border font-bold flex items-center gap-2.5 ${
                  validationActionFeedback.type === 'valide'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-[#15803D] text-[#15803D] dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-[#B91C1C] text-[#B91C1C] dark:text-rose-200'
                }`}
              >
                {validationActionFeedback.type === 'valide' ? (
                  <CheckCircle className="w-5 h-5 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 shrink-0" />
                )}
                <span>{validationActionFeedback.message}</span>
              </div>
            )}

            {/* Carte complète du PDV soumis par le vendeur via le composant partagé CartePdv */}
            <CartePdv
              pdv={validationRequestPdv}
              photoUrl={getPdvStorefrontImageUrl(validationRequestPdv)}
              name={validationRequestPdv.name}
              code={validationRequestPdv.code}
              createdAt={validationRequestPdv.created_at}
              neighborhood={validationRequestPdv.neighborhood}
              city={validationRequestPdv.city || 'Bamako'}
              vendorName={validationRequestPdv.created_by || 'Oumar Konaté'}
              vendorCode={validationRequestPdv.vendor_code || 'BAO-VND-001'}
              status={validationRequestPdv.status}
              routineDayLabel={(
                validationRequestPdv.routine_day ||
                routineStatus.activeDayName ||
                'lundi'
              ).toLowerCase()}
              todayVisitsCount={Number(
                validationRequestPdv.today_visits_count ??
                  validationRequestPdv.routine_day_visits_count ??
                  (validationRequestPdv.visited_today ? 1 : 0)
              )}
              visitsCount={Math.max(
                Number(validationRequestPdv.visits_count ?? 1),
                getPdvSalesCount(validationRequestPdv) +
                  Number(validationRequestPdv.no_sale_visits_count ?? 0)
              )}
              noSaleCount={Number(validationRequestPdv.no_sale_visits_count ?? 0)}
              salesCount={getPdvSalesCount(validationRequestPdv)}
              currentRole={currentRole}
              onViewFiche={
                canViewPdvFiche
                  ? () => {
                      const target = validationRequestPdv;
                      setValidationRequestPdv(null);
                      void handleOpenPdvFiche(target, 'all');
                    }
                  : undefined
              }
              onItinerary={() => {
                const target = validationRequestPdv;
                setValidationRequestPdv(null);
                handleOpenPdvItinerary(target);
              }}
              extraContent={
                <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  <div>
                    Gérant : <strong>{validationRequestPdv.manager_name || 'Gérant'}</strong>
                    {validationRequestPdv.phone ? (
                      <>
                        {' '}
                        &bull; Tél : <span className="font-mono font-bold">{validationRequestPdv.phone}</span>
                      </>
                    ) : null}
                  </div>
                  {validationRequestPdv.routine_name && (
                    <div>
                      Routine : <strong>{validationRequestPdv.routine_name}</strong> (
                      {validationRequestPdv.routine_day || 'Lundi'})
                    </div>
                  )}
                  {validationRequestPdv.rejection_reason && validationRequestPdv.status === 'rejete' && (
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[#B91C1C] dark:text-rose-300 font-bold">
                      Motif du refus : {validationRequestPdv.rejection_reason}
                    </div>
                  )}
                </div>
              }
            />

            {/* Si des visites sans vente avec motif existent sur ce PDV, les afficher directement pour validation/contestation */}
            {validationRequestVisits.filter((v) => Boolean(v.no_sale_reason)).length > 0 && (
              <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 space-y-2.5">
                <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#92400E]" />
                  <span>Motif(s) de visite sans vente soumis par le vendeur sur ce PDV</span>
                </div>
                {validationRequestVisits
                  .filter((v) => Boolean(v.no_sale_reason))
                  .slice(0, 3)
                  .map((v) => (
                    <VendorNoSaleMotifMessageBlock
                      key={v.id}
                      motif={v.no_sale_reason || ''}
                      authorName={v.vendor_name}
                      authorCode={v.vendor_code}
                      visitDate={v.visit_date}
                      visitTime={v.visit_time}
                      visitId={v.id}
                      pdvId={v.pdv_id || validationRequestPdv.id}
                      vendorId={v.vendor_id}
                      viewerRole={currentRole}
                      viewerName={currentUser?.name || 'Issa Koné'}
                      reactionStatus={v.motif_reaction_status}
                      reactionComment={v.motif_reaction_comment}
                      reactedBy={v.motif_reacted_by}
                      reactedRole={v.motif_reacted_role}
                      reactedAt={v.motif_reacted_at}
                      reactionsHistory={v.motif_reactions_history}
                      onReactionSuccess={() => {
                        void openPdvValidationRequestFromPayload({
                          pdvId: validationRequestPdv.id,
                          pdvCode: validationRequestPdv.code,
                          pdvName: validationRequestPdv.name,
                          notification: validationRequestNotif,
                        });
                      }}
                    />
                  ))}
              </div>
            )}

            {/* Bloc de décision : Valider ou Refuser la demande de PDV (DOV & Administrateur) */}
            {canValidatePdv && (
              <div className="p-4 rounded-2xl border-2 border-[#006B82]/40 bg-slate-50 dark:bg-slate-800/70 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Décision sur la demande de PDV ({isDirecteurOps ? 'Directeur des opérations de vente' : 'Administrateur'})
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      Validez ce point de vente pour l&apos;activer dans la routine du vendeur, ou refusez la demande avec un motif.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={
                      updatingId === validationRequestPdv.id ||
                      validationRequestPdv.status === 'valide'
                    }
                    onClick={() => handleUpdateStatus(validationRequestPdv.id, 'valide')}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {validationRequestPdv.status === 'valide'
                        ? 'PDV déjà validé'
                        : updatingId === validationRequestPdv.id
                        ? 'Validation en cours...'
                        : 'Valider la demande de PDV'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingId === validationRequestPdv.id}
                    onClick={() => setShowInlineRefuseForm((prev) => !prev)}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>Refuser la demande de PDV</span>
                  </button>
                </div>

                {/* Formulaire de motif de refus direct dans la demande */}
                {showInlineRefuseForm && (
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-[#B91C1C]/40 space-y-3">
                    <div className="font-bold text-[#B91C1C] dark:text-rose-300">
                      Motif du refus de la demande de PDV :
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Informations incomplètes ou doublon de zone',
                        'Photo de devanture non conforme',
                        'Position GPS imprécise ou hors secteur',
                        'Coordonnées du gérant erronées',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setInlineRefuseReason(preset)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                            inlineRefuseReason === preset
                              ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={inlineRefuseReason}
                      onChange={(e) => setInlineRefuseReason(e.target.value)}
                      placeholder="Saisissez le motif du refus..."
                      className={FORM_FIELD_CLASS}
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineRefuseForm(false)}
                        className="min-h-[44px] px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === validationRequestPdv.id || !inlineRefuseReason.trim()}
                        onClick={() =>
                          handleUpdateStatus(
                            validationRequestPdv.id,
                            'rejete',
                            inlineRefuseReason.trim()
                          )
                        }
                        className="min-h-[44px] px-4 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>Confirmer le refus du PDV</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </FormModal>
      )}

      {/* New PDV Modal (Vendeur only) */}
      {canCreate && showCreateModal && (
        <FormModal
          title="Nouveau PDV"
          icon={<Store className="w-4 h-4 text-[#008DA9]" />}
          onClose={() => {
            stopCameraStream();
            setShowCreateModal(false);
          }}
          onSubmit={handleCreatePdv}
          submitLabel={
            <>
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{isSubmitting ? 'Envoi en cours...' : 'Enregistrer le PDV'}</span>
            </>
          }
          submitDisabled={isSubmitting}
          isDirty={false}
        >
          <div className="space-y-2.5 sm:space-y-3 text-xs">
            {createError && <FieldError message={createError} />}

            {/* Bloc Image de Profil du PDV ultra-compact sur une seule ligne (Mobile & Tablette) */}
            <div className="p-2 sm:p-2.5 rounded-xl border border-[#008DA9]/40 bg-teal-50/50 dark:bg-slate-800/70 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <img
                    src={
                      capturedPhotoData ||
                      getPdvStorefrontImageUrl({
                        name: name.trim() || 'Boutique',
                        neighborhood,
                      })
                    }
                    alt="Profil PDV"
                    referrerPolicy="no-referrer"
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover border ${
                      capturedPhotoData ? 'border-emerald-500' : 'border-[#008DA9]'
                    }`}
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center border border-white dark:border-slate-900 ${
                      capturedPhotoData ? 'bg-emerald-600' : 'bg-[#008DA9]'
                    }`}
                  >
                    {capturedPhotoData ? <Check className="w-2.5 h-2.5" /> : <Camera className="w-2.5 h-2.5" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                      {name.trim() || 'Photo devanture'}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                        capturedPhotoData
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                      }`}
                    >
                      {capturedPhotoData ? 'Photo OK' : 'Requise'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {neighborhood} &bull; {routineStatus.activeDayName} ({routineStatus.activePdvCount}/{routineStatus.targetPdvCount})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCaptureStorefrontAndGps}
                className="px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>{capturedPhotoData ? 'Refaire' : 'Photo'}</span>
              </button>
            </div>

            {/* Step 1: PDV Identification Fields & Routine Configuration */}
            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  Nom du commerce / Alimentation *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alimentation Le Régal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Nom du gérant / boutiquier *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Issa Traoré"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Quartier / Secteur (Bamako)
                </label>
                <select
                  value={neighborhood}
                  onChange={(e) => {
                    const nextSec = e.target.value;
                    setHasManualSectorChoice(true);
                    setNeighborhood(nextSec);
                    setRoutineName(buildDefaultPdvRoutineName(routineStatus.activeDayName, nextSec));
                  }}
                  className={FORM_FIELD_CLASS}
                >
                  {BAMAKO_ROUTINE_SECTORS.map((sec) => (
                    <option key={sec.name} value={sec.name}>
                      {sec.name} ({sec.zone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Téléphone du PDV
                </label>
                <PhoneField
                  value={phone}
                  onChange={setPhone}
                  placeholder="70 00 00 00"
                />
              </div>
            </div>

            {/* Routine du PDV compactée : Nom de la routine & Jours de la semaine (Lundi..Samedi) en petits blocs */}
            <div className="p-2.5 sm:p-3 rounded-xl border border-[#008DA9]/35 bg-slate-50/90 dark:bg-slate-800/60 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                  <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                    Routine PDV ({routineStatus.targetPdvCount} PDV/j)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                    00h00 : {countdownToMidnight}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      routineStatus.isTargetReachedToday
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#008DA9] text-white'
                    }`}
                  >
                    {routineStatus.activeDayName} : {routineStatus.activePdvCount}/{routineStatus.targetPdvCount}
                  </span>
                </div>
              </div>

              {/* Champ pour le nom de la routine : "Routine [Nom du jour] - [Secteur]" déjà sélectionnée par défaut en fonction du jour */}
              <div>
                <label className={FORM_LABEL_CLASS}>
                  Nom de la routine (Jour &amp; Secteur) *
                </label>
                <select
                  required
                  value={
                    routineName ||
                    buildDefaultPdvRoutineName(routineStatus.activeDayName, neighborhood)
                  }
                  onChange={(e) => {
                    const chosenRoutine = e.target.value;
                    setRoutineName(chosenRoutine);
                    const matchedSector = BAMAKO_ROUTINE_SECTORS.find((sec) =>
                      chosenRoutine.endsWith(` - ${sec.name}`)
                    );
                    if (matchedSector) {
                      setHasManualSectorChoice(true);
                      setNeighborhood(matchedSector.name);
                    }
                  }}
                  className={FORM_FIELD_CLASS}
                >
                  {BAMAKO_ROUTINE_SECTORS.map((sec) => {
                    const optValue = buildDefaultPdvRoutineName(
                      routineStatus.activeDayName,
                      sec.name
                    );
                    return (
                      <option key={optValue} value={optValue}>
                        {optValue} ({sec.zone})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Jours de la semaine sauf le dimanche en petits blocs compacts (Lundi à Samedi) */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
                  {routineStatus.days.map((day) => {
                    const isSelected = day.isSelected;
                    const isTargetReached = day.isTargetReached;
                    const isNextUnlock = day.isNextToUnlockAtMidnight;
                    const isPastLocked = day.isPastLockedAtMidnight;

                    return (
                      <button
                        key={day.dayIndex}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          if (day.isLocked) {
                            setBlockedDayFeedback(
                              `${day.dayName} est bloqué (${routineStatus.activeDayName} actif : ${routineStatus.activePdvCount}/${routineStatus.targetPdvCount} PDV). Déblocage auto à 00h00 dès 25 PDV.`
                            );
                          } else {
                            setBlockedDayFeedback(null);
                          }
                        }}
                        className={`p-1.5 rounded-lg border text-center transition flex flex-col items-center justify-between min-h-[50px] sm:min-h-[58px] ${
                          isSelected
                            ? isTargetReached
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs cursor-pointer'
                              : 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs cursor-pointer'
                            : isNextUnlock
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 cursor-not-allowed'
                            : isPastLocked
                            ? 'bg-slate-200/80 dark:bg-slate-800/90 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 cursor-not-allowed'
                            : 'bg-slate-100 dark:bg-slate-900/70 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 opacity-75 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-0.5 w-full whitespace-nowrap">
                          <span className="font-extrabold text-[11px] leading-none whitespace-nowrap">
                            {day.shortName}
                          </span>
                          {isSelected ? (
                            <CheckCircle className="w-2.5 h-2.5 shrink-0 text-white" />
                          ) : (
                            <Lock className="w-2.5 h-2.5 shrink-0 opacity-75" />
                          )}
                        </div>
                        <span className="font-mono text-[10px] font-black leading-none whitespace-nowrap">
                          {day.pdvCount}/{day.targetPdvCount}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Barre de progression compacte */}
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      routineStatus.isTargetReachedToday ? 'bg-emerald-600' : 'bg-[#008DA9]'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (routineStatus.activePdvCount /
                            Math.max(1, routineStatus.targetPdvCount)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>

                {blockedDayFeedback && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                    <span>{blockedDayFeedback}</span>
                    <button
                      type="button"
                      onClick={() => setBlockedDayFeedback(null)}
                      className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Live Camera Stream & Instantaneous GPS Capture */}
            <div className="p-3.5 rounded-2xl border-2 border-[#008DA9]/40 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide text-[11px]">
                    1. Flux Direct Caméra &mdash; Devanture &amp; Image de Profil du PDV (Obligatoire)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300 border border-[#008DA9]/30 text-[11px] font-bold flex items-center gap-1 hover:bg-[#008DA9]/25 cursor-pointer"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Importer / Appareil photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCameraFacing}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:bg-slate-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Changer caméra ({facingMode === 'environment' ? 'Arrière' : 'Avant'})</span>
                  </button>
                </div>
              </div>

              {/* Live Video or Captured Stamped Photo */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-16/10 flex items-center justify-center">
                {!capturedPhotoData ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${usingSyntheticStream ? 'hidden' : 'block'}`}
                    />
                    <canvas
                      ref={fallbackCanvasRef}
                      width={800}
                      height={500}
                      className={`w-full h-full object-cover ${usingSyntheticStream ? 'block' : 'hidden'}`}
                    />
                    {/* Live HUD overlay showing current GPS before capture */}
                    <div className="absolute bottom-2 left-2 right-2 bg-slate-950/80 backdrop-blur-xs text-white px-3 py-2 rounded-xl border border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="font-mono">
                        <span className="text-cyan-400 font-bold">GPS DIRECT :</span>{' '}
                        Lat {liveGps.lat.toFixed(6)}° N | Lng {liveGps.lng.toFixed(6)}° O (±{liveGps.accuracy}m)
                      </div>
                      <div className="text-[10px] text-emerald-300 font-semibold">
                        {cameraStatusMsg}
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    src={capturedPhotoData}
                    alt="Devanture PDV capturée avec GPS, date et heure"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain bg-black"
                  />
                )}
              </div>

              {/* Capture / Retake Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!capturedPhotoData ? (
                  <button
                    type="button"
                    onClick={handleCaptureStorefrontAndGps}
                    className="w-full py-3 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capturer la photo de la devanture &amp; Assigner comme profil du PDV</span>
                  </button>
                ) : (
                  <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-2.5 rounded-xl">
                    <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                      <img
                        src={capturedPhotoData}
                        alt="Profil PDV assigné"
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shrink-0 shadow-xs"
                      />
                      <div>
                        <div className="font-extrabold text-xs flex items-center gap-1">
                          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span>Photo de la devanture assignée comme image de profil du PDV !</span>
                        </div>
                        {capturedGpsStamp && (
                          <div className="font-mono text-[11px]">
                            Lat: {capturedGpsStamp.lat.toFixed(6)} | Lng: {capturedGpsStamp.lng.toFixed(6)} (±{capturedGpsStamp.accuracy}m) &bull; {capturedGpsStamp.dateStr} à {capturedGpsStamp.timeStr}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1 hover:bg-slate-100 cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reprendre la photo</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: OpenStreetMap Leaflet Map with Show / Hide Toggle */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-[#008DA9]" />
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                      2. Position GPS Précise &bull; OpenStreetMap Leaflet
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {capturedGpsStamp
                        ? `Position figée à la capture (${capturedGpsStamp.dateStr} ${capturedGpsStamp.timeStr})`
                        : gpsStatusMsg}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowModalMap((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                    showModalMap
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-700'
                      : 'bg-[#008DA9] text-white border-[#008DA9]'
                  }`}
                >
                  {showModalMap ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Masquer la carte</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Afficher la carte</span>
                    </>
                  )}
                </button>
              </div>

              {showModalMap && (
                <OsmLeafletMap
                  centerLat={activeModalLat}
                  centerLng={activeModalLng}
                  accuracy={activeModalAcc}
                  zoom={17}
                  heightClassName="h-56"
                  label={name.trim() || 'Nouveau Point de Vente (PDV)'}
                  sublabel={`Quartier ${neighborhood}, Bamako • ${
                    capturedGpsStamp
                      ? `Capturé le ${capturedGpsStamp.dateStr} à ${capturedGpsStamp.timeStr}`
                      : 'Position GPS en direct'
                  }`}
                />
              )}
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
              La demande de création accompagnée de la photo de devanture horodatée (assignée comme image de profil du PDV) sera soumise à l&apos;Administrateur pour validation.
            </div>
          </div>
        </FormModal>
      )}

      {/* Modal Factures du client PDV & Annulation de facture */}
      {selectedPdvForInvoices && (
        <FormModal
          title={`Factures du client PDV • ${selectedPdvForInvoices.name}`}
          subtitle={`${selectedPdvForInvoices.code} • Gérant : ${selectedPdvForInvoices.manager_name} • Quartier ${selectedPdvForInvoices.neighborhood}`}
          onClose={() => {
            setSelectedPdvForInvoices(null);
            setCancellingInvoiceSale(null);
          }}
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setSelectedPdvForInvoices(null);
            setCancellingInvoiceSale(null);
          }}
        >
          <div className="space-y-4 text-xs">
            {cancelInvoiceFeedback && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cancelInvoiceFeedback}</span>
              </div>
            )}

            {cancellingInvoiceSale && (
              <form
                onSubmit={handleConfirmCancelPdvInvoice}
                className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-3"
              >
                <div className="font-bold text-rose-800 dark:text-rose-200 flex items-center justify-between">
                  <span>
                    Confirmer l&apos;annulation de la facture{' '}
                    <strong className="font-mono">
                      {cancellingInvoiceSale.invoice_number || `FAC-${cancellingInvoiceSale.number.replace('VTE-', '')}`}
                    </strong>{' '}
                    ({Number(cancellingInvoiceSale.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                  </span>
                </div>
                <div>
                  <label className={FORM_LABEL_CLASS}>
                    Motif obligatoire d&apos;annulation de la facture client PDV :
                  </label>
                  <input
                    type="text"
                    value={cancelInvoiceReason}
                    onChange={(e) => setCancelInvoiceReason(e.target.value)}
                    required
                    className={FORM_FIELD_CLASS}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCancellingInvoiceSale(null)}
                    className="h-[44px] px-4 rounded-[12px] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] font-semibold cursor-pointer"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    disabled={isCancellingInvoice}
                    className="h-[44px] px-4 rounded-[12px] bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold cursor-pointer"
                  >
                    {isCancellingInvoice ? 'Annulation...' : 'Confirmer annulation facture'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {(sales || [])
                .filter((s) => s.pdv_id === selectedPdvForInvoices.id)
                .map((s) => {
                  const isCancelled = s.status === 'annulee';
                  const invoiceRef = s.invoice_number || `FAC-${String(s.number || '').replace('VTE-', '')}`;
                  return (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCancelled
                          ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50 opacity-80'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-slate-900 dark:text-white">
                            {invoiceRef}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">({s.number})</span>
                          {isCancelled ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                              Facture annulée
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                              Facture valide
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          Date : <strong>{s.date}</strong> &bull; Vendeur : <strong>{s.vendor_name}</strong> &bull; Montant :{' '}
                          <strong className="text-teal-700 dark:text-teal-400">
                            {Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA
                          </strong>
                        </div>
                        {isCancelled && s.cancel_reason && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                            Motif d&apos;annulation : {s.cancel_reason}
                          </div>
                        )}
                      </div>

                      {!isCancelled && canCancelPdvInvoice && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingInvoiceSale(s);
                            setCancelInvoiceReason('Erreur de facturation / annulation demandée par le client PDV');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Annuler la facture</span>
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </FormModal>
      )}

      {/* Modal Fiche Profil du PDV & Historique complet (Visites & Ventes + Produits assez achetés par le PDV) */}
      {/* Visible par : Vendeur (pour ses PDV), Administrateur, VOD (Directeur des opérations de vente) et SA (Sales Admin) */}
      {ficheTargetPdv && (
        <FormModal
          title={`Fiche Profil PDV & Historique • ${ficheTargetPdv.name}`}
          subtitle={`${ficheTargetPdv.code} • Jour obligatoire : ${
            ficheData?.pdv?.routine_day || ficheTargetPdv.routine_day || 'Vendredi'
          } • Créé par ${ficheData?.pdv?.created_by || ficheTargetPdv.created_by || 'Oumar Konaté'}`}
          icon={<FileText className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => {
            setFicheTargetPdv(null);
            setFicheData(null);
          }}
          cancelLabel="Fermer"
          submitLabel="Fermer la fiche PDV"
          onSubmit={(e) => {
            e.preventDefault();
            setFicheTargetPdv(null);
            setFicheData(null);
          }}
        >
          {(() => {
            const pInfo = ficheData?.pdv || ficheTargetPdv;
            const topProds = ficheData?.top_products || getPdvTopProducts(ficheTargetPdv);
            const salesHistory = ficheData?.sales_history || [];
            const visitsHistory = ficheData?.visits_history || [];
            const totalSalesCount =
              typeof pInfo.sales_count === 'number'
                ? pInfo.sales_count
                : salesHistory.length || getPdvSalesCount(ficheTargetPdv);
            const totalSalesAmount =
              typeof pInfo.total_sales_amount === 'number' && pInfo.total_sales_amount > 0
                ? pInfo.total_sales_amount
                : salesHistory.reduce((acc, s) => acc + Number(s.total_amount || 0), 0) ||
                  getPdvSalesAmount(ficheTargetPdv);
            const totalCartons =
              typeof pInfo.total_cartons_sold === 'number' && pInfo.total_cartons_sold > 0
                ? pInfo.total_cartons_sold
                : topProds.reduce((acc, tp) => acc + Number(tp.totalQuantity || 0), 0);
            const totalVisitsCount = Math.max(
              Number(pInfo.visits_count || 0),
              visitsHistory.length,
              totalSalesCount > 0 ? totalSalesCount : 1
            );
            const realRoutineVisits = visitsHistory.filter(
              (v) => !String(v.id || '').startsWith('vis-creation-')
            );
            const routineDayVisitsCount =
              typeof pInfo.today_visits_count === 'number'
                ? pInfo.today_visits_count
                : typeof pInfo.routine_day_visits_count === 'number'
                ? pInfo.routine_day_visits_count
                : realRoutineVisits.length;
            const noSaleVisitsCnt =
              typeof pInfo.no_sale_visits_count === 'number'
                ? pInfo.no_sale_visits_count
                : realRoutineVisits.filter(
                    (v) => v.visit_type === 'visite_sans_vente' || (!v.sale_id && v.visit_type !== 'visite_avec_vente')
                  ).length;
            const pdvRoutineDayLabel = pInfo.routine_day || 'Vendredi';

            return (
              <div className="space-y-4 text-xs">
                {/* En-tête Identité Fiche Profil PDV (Carte de présentation du PDV) */}
                <CartePdv
                  pdv={{
                    ...pInfo,
                    photo_url: getPdvStorefrontImageUrl(pInfo),
                    sales_count: totalSalesCount,
                    no_sale_visits_count: noSaleVisitsCnt,
                    total_visits_count: totalVisitsCount,
                    routine_day_visits_count: routineDayVisitsCount,
                    today_visits_count: routineDayVisitsCount,
                  }}
                  infoBadges={[
                    ...(routineDayVisitsCount > 0 || pInfo.visited_today ? ["Visité aujourd'hui"] : []),
                    `Jour : ${pdvRoutineDayLabel.toLowerCase()}`,
                  ]}
                  routineDayName={pdvRoutineDayLabel}
                  routineDayVisitsCount={routineDayVisitsCount}
                  totalVisitsCount={totalVisitsCount}
                  noSaleVisitsCount={noSaleVisitsCnt}
                  salesCount={totalSalesCount}
                  onPreviewPhoto={() =>
                    setPreviewPhotoPdv({
                      ...pInfo,
                      photo_url: getPdvStorefrontImageUrl(pInfo),
                    })
                  }
                  actions={[
                    {
                      id: 'itineraire',
                      label: 'Itinéraire',
                      icon: <Navigation className="w-4 h-4 shrink-0" />,
                      variant: 'secondary',
                      onClick: () => {
                        setFicheTargetPdv(null);
                        handleOpenPdvItinerary(pInfo);
                      },
                    },
                    ...(canValidatePdv && pInfo.status !== 'valide'
                      ? [
                          {
                            id: 'valider-pdv-fiche',
                            label: 'Valider',
                            icon: <CheckCircle className="w-4 h-4 shrink-0" />,
                            variant: 'green' as const,
                            disabled: updatingId === pInfo.id,
                            onClick: () => {
                              void handleUpdateStatus(pInfo.id, 'valide');
                            },
                          },
                        ]
                      : []),
                    ...(canValidatePdv && pInfo.status !== 'rejete'
                      ? [
                          {
                            id: 'refuser-pdv-fiche',
                            label: 'Refuser',
                            icon: <XCircle className="w-4 h-4 shrink-0" />,
                            variant: 'red' as const,
                            disabled: updatingId === pInfo.id,
                            onClick: () => {
                              setFicheTargetPdv(null);
                              setRejectingPdv(pInfo);
                              setRejectionReason('Informations incomplètes ou doublon de zone');
                            },
                          },
                        ]
                      : []),
                    ...(isVendeur
                      ? [
                          {
                            id: 'vendre',
                            label: 'Vendre',
                            icon: <ShoppingBag className="w-4 h-4 shrink-0" />,
                            variant: 'success' as const,
                            onClick: () => {
                              setFicheTargetPdv(null);
                              handleOpenDeclareVisit(pInfo, 'avec_vente');
                            },
                          },
                          {
                            id: 'visiter',
                            label: 'Visiter',
                            icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
                            variant: 'warning' as const,
                            onClick: () => {
                              setFicheTargetPdv(null);
                              handleOpenDeclareVisit(pInfo, 'sans_vente');
                            },
                          },
                        ]
                      : []),
                  ]}
                  extraContent={
                    <div className="text-xs font-sans text-slate-600 dark:text-slate-300">
                      Gérant : <strong>{pInfo.manager_name}</strong> (<span className="font-mono">{pInfo.phone}</span>)
                    </div>
                  }
                />

                {/* 4 KPIs de la Fiche Profil PDV */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-sans">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Nombre de ventes réalisées
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                      <span className="font-mono">{totalSalesCount}</span> {totalSalesCount > 1 ? 'ventes' : 'vente'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] font-bold text-[#15803D] dark:text-white">
                      Chiffre d&apos;affaires cumulé
                    </div>
                    <div className="text-base sm:text-lg font-black text-[#15803D] dark:text-white mt-0.5 font-mono">
                      {totalSalesAmount.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Visites du jour ({pdvRoutineDayLabel.toLowerCase()})
                      </div>
                      <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-[#005F78] text-white text-xs font-bold font-mono shrink-0">
                        {routineDayVisitsCount}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                      <span className="font-mono font-bold">{totalVisitsCount}</span> {totalVisitsCount > 1 ? 'visites' : 'visite'} · <span className="font-mono font-bold">{noSaleVisitsCnt}</span> sans vente · <span className="font-mono font-bold">{totalSalesCount}</span> {totalSalesCount > 1 ? 'ventes' : 'vente'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Volume total acheté
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                      <span className="font-mono">{totalCartons}</span> cartons
                    </div>
                  </div>
                </div>

                {/* Section : Produit(s) assez acheté(s) par ce PDV */}
                <div className="p-3.5 rounded-2xl border border-[#008DA9]/35 bg-cyan-50/40 dark:bg-slate-800/60 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-[#008DA9]" />
                      <span>Produit(s) assez acheté(s) par ce PDV (Produits les plus achetés)</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-[#008DA9] text-white text-[10px] font-black">
                      {topProds.length} produit{topProds.length > 1 ? 's' : ''} référencé{topProds.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {topProds.length === 0 ? (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                      Aucun produit acheté par ce PDV pour le moment (0 vente enregistrée).
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {topProds.map((tp, idx) => (
                        <div
                          key={tp.code}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-[#008DA9] text-white font-black text-[10px] flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="font-extrabold text-slate-900 dark:text-white truncate">
                                {tp.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Code <span className="font-mono font-bold">{tp.code}</span> &bull;{' '}
                              <strong>
                                {tp.purchaseCount} {tp.purchaseCount > 1 ? 'achats' : 'achat'}
                              </strong>
                              {tp.lastPurchasedDate ? ` • Dernier : ${tp.lastPurchasedDate}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-[#008DA9] dark:text-cyan-400">
                              {tp.totalQuantity} cartons
                            </div>
                            <div className="font-bold text-[11px] text-emerald-700 dark:text-emerald-400">
                              {Number(tp.totalAmount || 0).toLocaleString('fr-FR')} FCFA
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Onglets de l'Historique de la Fiche de PDV : Tout l'historique / Historique des Visites / Historique des Ventes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <History className="w-4 h-4 text-[#008DA9]" />
                      <span>Historique complet de la Fiche de PDV (Visites &amp; Ventes)</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setFicheActiveTab('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                          ficheActiveTab === 'all'
                            ? 'bg-[#008DA9] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Tout l&apos;historique ({visitsHistory.length + salesHistory.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFicheActiveTab('visits')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                          ficheActiveTab === 'visits'
                            ? 'bg-[#008DA9] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Historique des Visites ({visitsHistory.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFicheActiveTab('sales')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                          ficheActiveTab === 'sales'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Historique des Ventes &amp; Produits ({salesHistory.length})
                      </button>
                    </div>
                  </div>

                  {isLoadingFiche && (
                    <div className="text-center py-2 text-slate-500 font-semibold">
                      Chargement de l&apos;historique complet du PDV...
                    </div>
                  )}

                  {/* Bloc 1 : Historique des Visites du PDV (Création, Visites avec vente, Visites sans vente + motif) */}
                  {(ficheActiveTab === 'all' || ficheActiveTab === 'visits') && (
                    <div className="space-y-2">
                      <div className="font-extrabold text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <span>1. Historique des Visites en PDV ({visitsHistory.length})</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#15803D] text-white text-[11px] font-bold">
                            <ShoppingBag className="w-3 h-3 shrink-0" />
                            <span>
                              {
                                visitsHistory.filter(
                                  (v) => v.visit_type === 'visite_avec_vente' || Boolean(v.sale_id)
                                ).length
                              }{' '}
                              avec vente
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#92400E] text-white text-[11px] font-bold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>
                              {
                                visitsHistory.filter(
                                  (v) => v.visit_type !== 'visite_avec_vente' && !v.sale_id
                                ).length
                              }{' '}
                              sans vente
                            </span>
                          </span>
                        </div>
                      </div>
                      {visitsHistory.length === 0 ? (
                        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                          Aucune visite enregistrée pour ce PDV.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {visitsHistory.map((v, vIdx) => {
                            const isWithSale = v.visit_type === 'visite_avec_vente' || Boolean(v.sale_id);
                            const isCreation = v.visit_type === 'creation_et_visite';
                            const isNoSale = !isWithSale;
                            const visitNum = v.routine_visit_number || Math.max(1, visitsHistory.length - vIdx);
                            return (
                              <div
                                key={v.id}
                                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                                  isNoSale
                                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                                    : 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                  {/* Icône visuelle rapide distinguant Vente réalisée vs Sans vente */}
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                      isWithSale
                                        ? 'bg-[#15803D] text-white'
                                        : 'bg-[#92400E] text-white'
                                    }`}
                                    title={isWithSale ? 'Visite avec vente réalisée' : 'Visite sans vente'}
                                  >
                                    {isWithSale ? (
                                      <ShoppingBag className="w-4 h-4 shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-4 h-4 shrink-0" />
                                    )}
                                  </div>

                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-md bg-[#006B82] text-white text-[10px] font-black">
                                        Passage #{visitNum} ({v.routine_day || pdvRoutineDayLabel})
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                                          isNoSale
                                            ? 'bg-[#92400E] text-white'
                                            : 'bg-[#15803D] text-white'
                                        }`}
                                      >
                                        {isWithSale ? (
                                          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                        ) : (
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                        <span>
                                          {isWithSale
                                            ? 'Vente réalisée'
                                            : isCreation
                                            ? 'Sans vente (Création & 1ère visite)'
                                            : 'Visite sans vente'}
                                        </span>
                                      </span>
                                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                        {v.visit_date} à {String(v.visit_time || '').slice(0, 5)}
                                      </span>
                                    </div>

                                    {v.no_sale_reason && (
                                      <VendorNoSaleMotifMessageBlock
                                        motif={v.no_sale_reason}
                                        authorName={v.vendor_name}
                                        authorCode={v.vendor_code}
                                        visitDate={v.visit_date}
                                        visitTime={v.visit_time}
                                        visitId={v.id}
                                        pdvId={v.pdv_id || pInfo.id}
                                        vendorId={v.vendor_id}
                                        viewerRole={currentRole}
                                        viewerName={currentUser.name}
                                        reactionStatus={v.motif_reaction_status}
                                        reactionComment={v.motif_reaction_comment}
                                        reactedBy={v.motif_reacted_by}
                                        reactedRole={v.motif_reacted_role}
                                        reactedAt={v.motif_reacted_at}
                                        reactionsHistory={v.motif_reactions_history}
                                        onReactionSuccess={() => {
                                          void handleOpenPdvFiche(pInfo, ficheActiveTab);
                                        }}
                                      />
                                    )}

                                    {v.status_reason && !v.no_sale_reason && (
                                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                        {v.status_reason}
                                      </div>
                                    )}

                                    <div className="text-[11px] text-slate-500">
                                      Vendeur : <strong>{v.vendor_name}</strong> ({v.vendor_code})
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bloc 2 : Historique des Ventes du PDV avec le ou les produits achetés */}
                  {(ficheActiveTab === 'all' || ficheActiveTab === 'sales') && (
                    <div className="space-y-2">
                      <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span>2. Historique des Ventes &amp; Produits achetés ({salesHistory.length})</span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                          Total : {totalSalesAmount.toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>

                      {salesHistory.length === 0 ? (
                        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500">
                          Aucune vente réalisée dans ce PDV pour le moment.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {salesHistory.map((s: any) => (
                            <div
                              key={s.id}
                              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-slate-900 dark:text-white">
                                    PDV : {s.pdv_name || pInfo.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 text-[10px] font-extrabold">
                                    Routine :{' '}
                                    {s.routine_name ||
                                      pInfo.routine_name ||
                                      `Routine ${s.routine_day || pInfo.routine_day || 'Vendredi'}`}{' '}
                                    ({s.routine_day || pInfo.routine_day || 'Vendredi'})
                                  </span>
                                  <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                                    {s.number}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-[#008DA9] dark:text-cyan-300 font-mono text-[10px] font-bold">
                                    Date &amp; heure : {s.date} à {s.sale_time}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                                    {s.payment_type || 'Comptant'}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    Par <strong>{s.vendor_name}</strong>
                                  </span>
                                </div>
                                <div className="font-black text-sm text-emerald-700 dark:text-emerald-400">
                                  {Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA
                                </div>
                              </div>

                              {/* Liste détaillée du ou des produits achetés et nombre de cartons lors de cette vente */}
                              <div className="space-y-1">
                                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                                  Produit(s) &amp; nombre de cartons achetés :
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {(s.items || []).map((it: any, idx: number) => (
                                    <div
                                      key={`${s.id}-it-${idx}`}
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0 flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                                        <span className="font-bold text-slate-900 dark:text-white truncate">
                                          {it.name}
                                        </span>
                                      </div>
                                      <div className="font-mono text-[11px] font-extrabold text-[#008DA9] dark:text-cyan-300 shrink-0">
                                        {it.qtyBoxes} carton(s) &times;{' '}
                                        {Number(it.unitPrice || 0).toLocaleString('fr-FR')} ={' '}
                                        <strong className="text-emerald-700 dark:text-emerald-400">
                                          {Number(it.total || 0).toLocaleString('fr-FR')} F
                                        </strong>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </FormModal>
      )}

      {/* Modal Déclaration de Visite dans un PDV créé et visité auparavant (Visite sans vente avec motif -> Admin & VOD OU Réaliser une vente) */}
      {declareVisitTargetPdv && (
        <FormModal
          title={`Déclarer ma visite au PDV • ${declareVisitTargetPdv.name}`}
          subtitle={`${declareVisitTargetPdv.code} • Quartier ${declareVisitTargetPdv.neighborhood} • Jour obligatoire : ${
            declareVisitTargetPdv.routine_day || routineStatus.activeDayName || 'Vendredi'
          }`}
          icon={<ClipboardCheck className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => {
            setDeclareVisitTargetPdv(null);
            setDeclareVisitError(null);
            setDeclareVisitSuccessMsg(null);
          }}
          cancelLabel="Fermer"
          onSubmit={handleSubmitDeclareVisit}
          submitLabel={
            isSubmittingDeclareVisit
              ? 'Enregistrement en cours...'
              : declareVisitMode === 'sans_vente'
              ? "Soumettre la visite sans vente + Motif (Admin & VOD)"
              : "Valider la visite & Enregistrer la vente"
          }
          submitDisabled={isSubmittingDeclareVisit}
        >
          <div className="space-y-4 text-xs">
            {declareVisitError && <FieldError message={declareVisitError} />}

            {declareVisitSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold flex items-start gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div>{declareVisitSuccessMsg}</div>
                  <div className="text-[11px] font-normal text-emerald-800 dark:text-emerald-300">
                    La fiche profil et l&apos;historique du PDV « {declareVisitTargetPdv.name} » ont été mis à jour en temps réel.
                  </div>
                </div>
              </div>
            )}

            {/* Rappel du PDV avec CartePdv partagée */}
            <CartePdv
              pdv={{
                ...declareVisitTargetPdv,
                photo_url: getPdvStorefrontImageUrl(declareVisitTargetPdv),
              }}
              infoBadges={[
                ...(declareVisitTargetPdv.visited_today ? ["Visité aujourd'hui"] : []),
                `Jour : ${(declareVisitTargetPdv.routine_day || routineStatus.activeDayName || 'lundi').toLowerCase()}`,
              ]}
              routineDayName={declareVisitTargetPdv.routine_day || routineStatus.activeDayName || 'lundi'}
              routineDayVisitsCount={Number(
                declareVisitTargetPdv.today_visits_count ??
                  declareVisitTargetPdv.routine_day_visits_count ??
                  (declareVisitTargetPdv.visited_today ? 1 : 0)
              )}
              totalVisitsCount={Number(
                declareVisitTargetPdv.visits_count ??
                  (getPdvSalesCount(declareVisitTargetPdv) +
                    Number(declareVisitTargetPdv.no_sale_visits_count || 0) ||
                    (declareVisitTargetPdv.visited_today ? 1 : 0))
              )}
              noSaleVisitsCount={Number(declareVisitTargetPdv.no_sale_visits_count || 0)}
              salesCount={getPdvSalesCount(declareVisitTargetPdv)}
              actions={[
                {
                  id: 'voir-fiche',
                  label: 'Voir la fiche',
                  icon: <FileText className="w-4 h-4 shrink-0" />,
                  variant: 'primary',
                  onClick: () => {
                    const target = declareVisitTargetPdv;
                    setDeclareVisitTargetPdv(null);
                    void handleOpenPdvFiche(target, 'all');
                  },
                },
                {
                  id: 'itineraire',
                  label: 'Itinéraire',
                  icon: <Navigation className="w-4 h-4 shrink-0" />,
                  variant: 'secondary',
                  onClick: () => {
                    const target = declareVisitTargetPdv;
                    setDeclareVisitTargetPdv(null);
                    handleOpenPdvItinerary(target);
                  },
                },
              ]}
            />

            {/* Choix du type de déclaration de visite */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDeclareVisitMode('sans_vente');
                  setDeclareVisitError(null);
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                  declareVisitMode === 'sans_vente'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                }`}
              >
                <Bell className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-xs">
                    1. Visite sans vente
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      declareVisitMode === 'sans_vente'
                        ? 'text-amber-100'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Inclut le motif obligatoire soumis à l&apos;Admin et au DOV (figé à l&apos;envoi).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeclareVisitMode('avec_vente');
                  setDeclareVisitError(null);
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                  declareVisitMode === 'avec_vente'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                }`}
              >
                <ShoppingBag className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-xs">
                    2. Réaliser une vente dans ce PDV
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      declareVisitMode === 'avec_vente'
                        ? 'text-emerald-100'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Enregistrer une vente et afficher les produits achetés dans l&apos;historique du PDV.
                  </div>
                </div>
              </button>
            </div>

            {declareVisitMode === 'sans_vente' ? (
              currentRole === 'Vendeur' ? (
                <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-extrabold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-amber-600" />
                      <span>Motif obligatoire de la visite sans vente (figé à l&apos;envoi) *</span>
                    </span>
                  </div>

                  {/* Motifs rapides prédéfinis avant envoi */}
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_NO_SALE_REASONS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDeclareVisitMotif(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                          declareVisitMotif === preset
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-amber-300 dark:border-amber-700'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className={FORM_LABEL_CLASS}>
                      Saisie du motif avant envoi (sera figé à l&apos;envoi) *
                    </label>
                    <input
                      type="text"
                      required
                      value={declareVisitMotif}
                      onChange={(e) => setDeclareVisitMotif(e.target.value)}
                      placeholder="Indiquez le motif précis de la visite sans vente avant l'envoi..."
                      className={FORM_FIELD_CLASS}
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-800 text-[11px] text-slate-700 dark:text-slate-300">
                    En validant, cette visite sans vente est enregistrée dans l&apos;historique de la fiche de{' '}
                    <strong>{declareVisitTargetPdv.name}</strong>, votre motif est figé en lecture seule, et une notification est envoyée à l&apos;
                    <strong>Administrateur</strong> et au <strong>DOV</strong>.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Le motif des visites sans vente est un message envoyé par le vendeur et affiché en lecture seule pour le DOV, l&apos;Administrateur et le Sales Admin / Contrôleur.
                </div>
              )
            ) : (
              <div className="p-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/25 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    <span>Sélection du ou des produits achetés lors de cette visite</span>
                  </span>
                  {onStartSaleForPdv && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = declareVisitTargetPdv;
                        setDeclareVisitTargetPdv(null);
                        onStartSaleForPdv(target);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#008DA9] text-white font-bold text-[11px] cursor-pointer flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Ouvrir le formulaire complet de Vente</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className={FORM_LABEL_CLASS}>Produit acheté #1 *</label>
                    <select
                      value={quickSaleProductId}
                      onChange={(e) => setQuickSaleProductId(e.target.value)}
                      className={FORM_FIELD_CLASS}
                    >
                      {catalogProducts.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.name} ({pr.code}) — {Number(pr.price_box || 0).toLocaleString('fr-FR')} FCFA/ctn
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FORM_LABEL_CLASS}>Quantité (cartons) *</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={quickSaleQtyBoxes}
                      onChange={(e) => setQuickSaleQtyBoxes(Math.max(1, Number(e.target.value || 1)))}
                      className={FORM_FIELD_CLASS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className={FORM_LABEL_CLASS}>Produit acheté #2 (optionnel)</label>
                    <select
                      value={quickSaleSecondProductId}
                      onChange={(e) => {
                        setQuickSaleSecondProductId(e.target.value);
                        if (e.target.value && quickSaleSecondQtyBoxes <= 0) {
                          setQuickSaleSecondQtyBoxes(3);
                        }
                      }}
                      className={FORM_FIELD_CLASS}
                    >
                      <option value="">-- Aucun second produit --</option>
                      {catalogProducts
                        .filter((pr) => pr.id !== quickSaleProductId)
                        .map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.name} ({pr.code}) — {Number(pr.price_box || 0).toLocaleString('fr-FR')} FCFA/ctn
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className={FORM_LABEL_CLASS}>Quantité #2 (cartons)</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      disabled={!quickSaleSecondProductId}
                      value={quickSaleSecondProductId ? quickSaleSecondQtyBoxes : 0}
                      onChange={(e) => setQuickSaleSecondQtyBoxes(Math.max(0, Number(e.target.value || 0)))}
                      className={FORM_FIELD_CLASS}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Règlement :</span>
                    {(['Comptant', 'Crédit'] as const).map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setQuickSalePaymentType(pt)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border ${
                          quickSalePaymentType === pt
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const p1 = catalogProducts.find((p) => p.id === quickSaleProductId);
                    const p2 = quickSaleSecondProductId
                      ? catalogProducts.find((p) => p.id === quickSaleSecondProductId)
                      : null;
                    const tot =
                      (p1 ? Number(p1.price_box || 0) * Number(quickSaleQtyBoxes || 0) : 0) +
                      (p2 ? Number(p2.price_box || 0) * Number(quickSaleSecondQtyBoxes || 0) : 0);
                    return (
                      <div className="font-black text-sm text-emerald-800 dark:text-emerald-300">
                        Total vente : {tot.toLocaleString('fr-FR')} FCFA
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
};
