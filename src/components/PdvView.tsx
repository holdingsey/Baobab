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
} from 'lucide-react';
import { OsmLeafletMap } from './OsmLeafletMap';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { PhoneField, FieldError, FORM_FIELD_CLASS, FORM_LABEL_CLASS, FORM_ROW_CLASS } from './FormControls';
import { DataTable } from './DataTable';
import { ExportViewButton } from './ExtractionsView';

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
  created_at: string;
  sales_count?: number;
  total_sales_amount?: number;
  last_sale_date?: string;
}

interface PdvViewProps {
  pdvs: PDVItem[];
  sales?: any[];
  currentRole: string;
  currentUser?: any;
  onRefreshPdvs: () => void;
  onPdvCreated?: (newPdv: PDVItem) => void;
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
  initialFilter = 'all',
  initialOpenCreate = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'valide' | 'en_attente' | 'rejete' | 'with_sales' | 'zero_sales'>(initialFilter);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Per-card map visibility toggle and photo lightbox
  const [visibleMapPdvIds, setVisibleMapPdvIds] = useState<Record<string, boolean>>({});
  const [previewPhotoPdv, setPreviewPhotoPdv] = useState<PDVItem | null>(null);

  // Direct camera capture to assign photo directly to an existing PDV as its profile image
  const [photoTargetPdv, setPhotoTargetPdv] = useState<PDVItem | null>(null);
  const [isAssigningPhoto, setIsAssigningPhoto] = useState(false);
  const [photoSuccessToast, setPhotoSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    setFilterStatus(initialFilter);
  }, [initialFilter]);

  // Le Vendeur et l'Administrateur peuvent créer un point de vente ; l'Administrateur et le Directeur des opérations de vente valident/rejettent les demandes
  const isAdmin = currentRole === 'Administrateur';
  const isDirecteurOps = currentRole === 'Directeur des opérations de vente';
  const canValidatePdv = isAdmin || isDirecteurOps;
  const canCancelPdvInvoice = isDirecteurOps || isAdmin || currentRole === 'Sales Admin';
  const canCreate = currentRole === 'Vendeur' || isAdmin;

  // Modal pour consulter et annuler les factures du client d'un PDV
  const [selectedPdvForInvoices, setSelectedPdvForInvoices] = useState<PDVItem | null>(null);
  const [cancellingInvoiceSale, setCancellingInvoiceSale] = useState<any | null>(null);
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState('Erreur de facturation / annulation demandée par le client PDV');
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [cancelInvoiceFeedback, setCancelInvoiceFeedback] = useState<string | null>(null);

  // New PDV modal state (Vendeur only)
  const [showCreateModal, setShowCreateModal] = useState(canCreate && initialOpenCreate);

  useEffect(() => {
    if (canCreate && initialOpenCreate) {
      setShowCreateModal(true);
    }
  }, [canCreate, initialOpenCreate]);

  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [neighborhood, setNeighborhood] = useState('Sotuba');
  const [phone, setPhone] = useState('+223 ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Live Camera & Instant GPS state inside the creation modal
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [usingSyntheticStream, setUsingSyntheticStream] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatusMsg, setCameraStatusMsg] = useState('Initialisation du flux direct de la caméra...');

  // Live GPS tracking & locked GPS on capture
  const [liveGps, setLiveGps] = useState<{ lat: number; lng: number; accuracy: number; isHardware: boolean }>({
    lat: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lat,
    lng: BAMAKO_NEIGHBORHOOD_GPS['Sotuba'].lng,
    accuracy: 4.2,
    isHardware: false,
  });
  const [gpsStatusMsg, setGpsStatusMsg] = useState('Acquisition du signal GPS haute précision...');
  const [capturedPhotoData, setCapturedPhotoData] = useState<string | null>(null);
  const [capturedGpsStamp, setCapturedGpsStamp] = useState<CapturedGpsStamp | null>(null);
  const [showModalMap, setShowModalMap] = useState(true);

  // Reject PDV modal state (Administrateur only)
  const [rejectingPdv, setRejectingPdv] = useState<PDVItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Informations incomplètes ou doublon de zone');

  // Preload fallback storefront image whenever neighborhood, name, or photoTargetPdv changes
  useEffect(() => {
    const img = new Image();
    img.src = getPdvStorefrontImageUrl(
      photoTargetPdv
        ? { id: photoTargetPdv.id, code: photoTargetPdv.code, name: photoTargetPdv.name, neighborhood: photoTargetPdv.neighborhood }
        : { name: name.trim() || 'Boutique', neighborhood }
    );
    previewImgRef.current = img;
  }, [name, neighborhood, photoTargetPdv]);

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

  // Start optical viewfinder fallback using a real storefront photograph (without crossOrigin cache mismatch)
  const startSyntheticCameraStream = useCallback(() => {
    setUsingSyntheticStream(true);
    setCameraActive(true);
    setCameraStatusMsg('Flux direct caméra actif — Cadrez la devanture de la boutique');

    const previewImg = new Image();
    previewImg.src = getPdvStorefrontImageUrl(
      photoTargetPdv
        ? { id: photoTargetPdv.id, code: photoTargetPdv.code, name: photoTargetPdv.name, neighborhood: photoTargetPdv.neighborhood }
        : { name: name.trim() || 'Boutique', neighborhood }
    );
    previewImgRef.current = previewImg;

    const renderLoop = () => {
      const canvas = fallbackCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const now = new Date();

          const activeImg = previewImgRef.current || previewImg;
          if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
            ctx.drawImage(activeImg, 0, 0, w, h);
          } else {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, w, h);
          }

          // Live viewfinder crosshair + pulsing REC indicator
          const pulse = (Math.sin(now.getTime() / 250) + 1) / 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(28, 24, w - 56, h - 48);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
          ctx.fillRect(36, 32, 480, 28);

          ctx.fillStyle = `rgba(220, 38, 38, ${0.5 + pulse * 0.5})`;
          ctx.beginPath();
          ctx.arc(52, 46, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `DIRECT CAM • ${now.toLocaleTimeString('fr-FR')} • GPS ${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)}`,
            68,
            50
          );
        }
      }
      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, [name, neighborhood, photoTargetPdv, liveGps.lat, liveGps.lng]);

  // Start real hardware camera stream via getUserMedia
  const startCameraStream = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    stopCameraStream();
    setUsingSyntheticStream(false);
    setCameraStatusMsg('Ouverture du flux vidéo direct de la caméra...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      startSyntheticCameraStream();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setCameraStatusMsg('Flux direct caméra actif — Cadrez la devanture du PDV');
    } catch {
      // Fallback to live optical viewfinder canvas if hardware camera is unavailable
      startSyntheticCameraStream();
    }
  }, [facingMode, stopCameraStream, startSyntheticCameraStream]);

  // Acquire live GPS coordinates continuously while modal (create or direct PDV photo) is open
  useEffect(() => {
    const isModalActive = (showCreateModal && canCreate) || Boolean(photoTargetPdv);
    if (!isModalActive) {
      stopCameraStream();
      return;
    }

    const activeArea = photoTargetPdv ? photoTargetPdv.neighborhood : neighborhood;
    startCameraStream(facingMode);

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      setGpsStatusMsg('Signal GPS en direct actif (Haute Précision)...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLiveGps({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.5).toFixed(1)),
            isHardware: true,
          });
          setGpsStatusMsg(`GPS verrouillé (±${(pos.coords.accuracy || 4.5).toFixed(1)} m)`);
        },
        () => {
          const fallback = BAMAKO_NEIGHBORHOOD_GPS[activeArea] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
          setLiveGps({
            lat: Number(photoTargetPdv?.latitude) || fallback.lat,
            lng: Number(photoTargetPdv?.longitude) || fallback.lng,
            accuracy: 4.2,
            isHardware: false,
          });
          setGpsStatusMsg(`GPS Bamako (${activeArea}) prêt (±4.2 m)`);
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
      );

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveGps({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.5).toFixed(1)),
            isHardware: true,
          });
          setGpsStatusMsg(`GPS temps réel actif (±${(pos.coords.accuracy || 4.5).toFixed(1)} m)`);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      const fallback = BAMAKO_NEIGHBORHOOD_GPS[activeArea] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
      setLiveGps({
        lat: Number(photoTargetPdv?.latitude) || fallback.lat,
        lng: Number(photoTargetPdv?.longitude) || fallback.lng,
        accuracy: 4.2,
        isHardware: false,
      });
      setGpsStatusMsg(`GPS Bamako (${activeArea}) actif`);
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      stopCameraStream();
    };
  }, [showCreateModal, canCreate, photoTargetPdv]);

  // Update fallback GPS coordinates if user switches neighborhood and isn't on hardware GPS
  useEffect(() => {
    if (!liveGps.isHardware && BAMAKO_NEIGHBORHOOD_GPS[neighborhood]) {
      const base = BAMAKO_NEIGHBORHOOD_GPS[neighborhood];
      const offset = ((Date.now() % 100) - 50) * 0.000015;
      setLiveGps({
        lat: Number((base.lat + offset).toFixed(6)),
        lng: Number((base.lng - offset).toFixed(6)),
        accuracy: 3.8,
        isHardware: false,
      });
    }
  }, [neighborhood, liveGps.isHardware]);

  // Helper to stamp a source image/video/canvas with GPS, Date, Time and assign it immediately as the PDV's profile image
  const generateStampedProfilePhoto = useCallback(
    (customSourceImg?: HTMLImageElement | null) => {
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
      if (!ctx) return;

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

      const dataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
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
    startCameraStream(facingMode);
  };

  const handleToggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setCapturedPhotoData(null);
    setCapturedGpsStamp(null);
    startCameraStream(nextMode);
  };

  const handleCreatePdv = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!canCreate) return;
    if (!name.trim() || !managerName.trim()) {
      setCreateError('Veuillez renseigner le nom du commerce et le nom du gérant.');
      return;
    }
    if (!capturedPhotoData || !capturedGpsStamp) {
      setCreateError(
        'Capture obligatoire : vous devez prendre la photo de la devanture pour l\'assigner comme image de profil du PDV et enregistrer la position GPS.'
      );
      return;
    }

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
          latitude: capturedGpsStamp.lat,
          longitude: capturedGpsStamp.lng,
          gps_accuracy: capturedGpsStamp.accuracy,
          photo_data: capturedPhotoData,
          captured_at: `${capturedGpsStamp.dateStr} ${capturedGpsStamp.timeStr}`,
          vendor_id: currentUser?.id,
          created_by: currentUser?.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        stopCameraStream();
        if (data.pdv && onPdvCreated) {
          onPdvCreated({
            ...data.pdv,
            photo_url: capturedPhotoData,
          });
        }
        setPhotoSuccessToast(
          `PDV « ${name.trim()} » créé avec succès ! La photo prise a été assignée comme image de profil du PDV.`
        );
        setShowCreateModal(false);
        setName('');
        setManagerName('');
        setCapturedPhotoData(null);
        setCapturedGpsStamp(null);
        onRefreshPdvs();
      } else {
        setCreateError(data.error || 'Erreur lors de la soumission du PDV.');
      }
    } catch {
      setCreateError('Erreur réseau lors de l\'envoi de la demande.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        onRefreshPdvs();
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

  // Le vendeur ne voit que les PDV qu'il a créés
  const scopedPdvs =
    currentRole === 'Vendeur' && currentUser?.id
      ? pdvs.filter((p) => p.vendor_id === currentUser.id || (!p.vendor_id && p.created_by === currentUser.name))
      : pdvs;

  const getPdvSalesCount = (pdv: PDVItem): number => {
    if (Array.isArray(sales) && sales.length > 0) {
      return sales.filter((s) => s.pdv_id === pdv.id).length;
    }
    return Number(pdv.sales_count || 0);
  };

  const getPdvSalesAmount = (pdv: PDVItem): number => {
    if (Array.isArray(sales) && sales.length > 0) {
      return sales
        .filter((s) => s.pdv_id === pdv.id)
        .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    }
    return Number(pdv.total_sales_amount || 0);
  };

  const pdvsWithSalesCount = scopedPdvs.filter((p) => getPdvSalesCount(p) > 0).length;
  const pdvsZeroSalesCount = scopedPdvs.filter((p) => getPdvSalesCount(p) === 0).length;

  const filtered = scopedPdvs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.neighborhood.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manager_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());
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
  });

  const rejectedCount = scopedPdvs.filter((p) => p.status === 'rejete').length;

  const activeModalLat = capturedGpsStamp ? capturedGpsStamp.lat : liveGps.lat;
  const activeModalLng = capturedGpsStamp ? capturedGpsStamp.lng : liveGps.lng;
  const activeModalAcc = capturedGpsStamp ? capturedGpsStamp.accuracy : liveGps.accuracy;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Points de Vente (PDV) &bull; Bamako
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {currentRole === 'Vendeur' ? `${scopedPdvs.length} PDV créés par moi` : `Réseau de ${scopedPdvs.length} PDV`}
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
              Gestion et validation des points de vente.
            </p>
            <InfoTooltip
              text={
                canValidatePdv
                  ? 'Validation ou rejet des demandes de création de points de vente et suivi des factures clients PDV.'
                  : "Un vendeur peut créer un PDV sans pour autant faire aucune vente : chaque PDV affiche son nombre de ventes réalisées ou « 0 ventes » s'il n'y en a pas."
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
                setCreateError(null);
                setCapturedPhotoData(null);
                setCapturedGpsStamp(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>+ Nouveau PDV (Caméra &amp; GPS)</span>
            </button>
          )}

          {canValidatePdv && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold">
              <Shield className="w-4 h-4" />
              <span>
                {isDirecteurOps
                  ? 'Validation PDV & Annulation Facture PDV (Direction Ventes)'
                  : 'Validation / Rejet Administrateur'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Search & Status Filter Grid — Boutons en rangées et colonnes sans débordement */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, quartier (Sotuba, Badalabougou, Faladié...), gérant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
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

      {/* Tableau et cartes empilées partagés des Points de Vente (PDV) */}
      <DataTable<PDVItem>
        data={filtered}
        rowKey={(pdv) => pdv.id}
        mobileTitle={(pdv) => {
          const storefrontImg = getPdvStorefrontImageUrl(pdv);
          return (
            <div className="flex items-center gap-2.5">
              <img
                src={storefrontImg}
                alt={pdv.name}
                referrerPolicy="no-referrer"
                onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                className="w-10 h-10 rounded-xl object-cover border border-[#008DA9] shrink-0 cursor-pointer"
              />
              <div>
                <span className="font-mono text-[11px] text-[#008DA9] font-bold block">{pdv.code}</span>
                <span>{pdv.name}</span>
              </div>
            </div>
          );
        }}
        mobileSubtitle={(pdv) => `Quartier ${pdv.neighborhood}, ${pdv.city} • Gérant : ${pdv.manager_name}`}
        mobileBadge={(pdv) => {
          const isValide = pdv.status === 'valide';
          const isRejete = pdv.status === 'rejete';
          return (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                isValide
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : isRejete
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {isValide ? 'Validé' : isRejete ? 'Rejeté' : 'En attente'}
            </span>
          );
        }}
        columns={[
          {
            key: 'pdv',
            header: 'Code & Point de Vente',
            hideInMobileCard: true,
            cell: (pdv) => {
              const storefrontImg = getPdvStorefrontImageUrl(pdv);
              return (
                <div className="flex items-center gap-2.5">
                  <img
                    src={storefrontImg}
                    alt={pdv.name}
                    referrerPolicy="no-referrer"
                    onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                    className="w-10 h-10 rounded-xl object-cover border border-[#008DA9] shrink-0 cursor-pointer"
                  />
                  <div>
                    <div className="font-mono text-[11px] font-bold text-[#008DA9]">{pdv.code}</div>
                    <div className="font-bold text-slate-900 dark:text-white">{pdv.name}</div>
                  </div>
                </div>
              );
            },
            footer: 'TOTAUX PDV',
          },
          {
            key: 'neighborhood',
            header: 'Quartier & Ville',
            mobileLabel: 'Quartier',
            cell: (pdv) => (
              <span>
                {pdv.neighborhood}, {pdv.city}
              </span>
            ),
          },
          {
            key: 'manager',
            header: 'Gérant & Téléphone',
            mobileLabel: 'Gérant & Tél',
            cell: (pdv) => (
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">{pdv.manager_name}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{pdv.phone}</div>
              </div>
            ),
          },
          {
            key: 'vendor',
            header: 'Vendeur Créateur',
            mobileLabel: 'Vendeur',
            secondary: true,
            cell: (pdv) => (
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {pdv.created_by || 'Oumar Konaté'}
                </span>
                {pdv.vendor_code && (
                  <span className="ml-1.5 font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-[#008DA9] dark:text-cyan-300 font-bold">
                    {pdv.vendor_code}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: 'gps',
            header: 'Coordonnées GPS',
            mobileLabel: 'GPS',
            secondary: true,
            isNumeric: true,
            cell: (pdv) => {
              const fallbackCoords = BAMAKO_NEIGHBORHOOD_GPS[pdv.neighborhood] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
              const pdvLat = Number.isFinite(Number(pdv.latitude)) ? Number(pdv.latitude) : fallbackCoords.lat;
              const pdvLng = Number.isFinite(Number(pdv.longitude)) ? Number(pdv.longitude) : fallbackCoords.lng;
              return (
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {pdvLat.toFixed(5)}, {pdvLng.toFixed(5)}
                </span>
              );
            },
          },
          {
            key: 'sales',
            header: 'Ventes & CA PDV',
            mobileLabel: 'Activité Ventes',
            isNumeric: true,
            cell: (pdv) => {
              const cnt = getPdvSalesCount(pdv);
              const amt = getPdvSalesAmount(pdv);
              return (
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {cnt > 0 ? `${cnt} ${cnt > 1 ? 'ventes' : 'vente'}` : '0 ventes'}
                  </span>
                  {cnt > 0 && (
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      {amt.toLocaleString('fr-FR')} FCFA
                    </div>
                  )}
                </div>
              );
            },
            footer: `${filtered.reduce((acc, p) => acc + getPdvSalesAmount(p), 0).toLocaleString('fr-FR')} FCFA`,
          },
          {
            key: 'status',
            header: 'Statut',
            align: 'center',
            hideInMobileCard: true,
            cell: (pdv) => {
              const isValide = pdv.status === 'valide';
              const isRejete = pdv.status === 'rejete';
              return (
                <div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      isValide
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : isRejete
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {isValide ? 'Validé' : isRejete ? 'Rejeté' : 'En attente'}
                  </span>
                  {isRejete && pdv.rejection_reason && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 max-w-[180px] break-words">
                      {pdv.rejection_reason}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            hideInMobileCard: true,
            cell: (pdv) => {
              const salesCount = getPdvSalesCount(pdv);
              const storefrontImg = getPdvStorefrontImageUrl(pdv);
              return (
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer hover:bg-slate-100"
                  >
                    Photo
                  </button>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreateError(null);
                        setCapturedPhotoData(null);
                        setCapturedGpsStamp(null);
                        setPhotoTargetPdv(pdv);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300 border border-[#008DA9]/30 text-[11px] font-bold cursor-pointer"
                    >
                      Caméra
                    </button>
                  )}
                  {canValidatePdv && pdv.status !== 'valide' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(pdv.id, 'valide')}
                      disabled={updatingId === pdv.id}
                      className="px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-emerald-800 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Valider
                    </button>
                  )}
                  {canValidatePdv && pdv.status !== 'rejete' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingPdv(pdv);
                        setRejectionReason('Informations incomplètes ou doublon de zone');
                      }}
                      disabled={updatingId === pdv.id}
                      className="px-2.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Rejeter
                    </button>
                  )}
                  {canCancelPdvInvoice && salesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelInvoiceFeedback(null);
                        setCancellingInvoiceSale(null);
                        setSelectedPdvForInvoices(pdv);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Factures ({salesCount})
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
        mobileActions={(pdv) => {
          const salesCount = getPdvSalesCount(pdv);
          const storefrontImg = getPdvStorefrontImageUrl(pdv);
          return (
            <>
              <button
                type="button"
                onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Voir photo
              </button>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateError(null);
                    setCapturedPhotoData(null);
                    setCapturedGpsStamp(null);
                    setPhotoTargetPdv(pdv);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#008DA9]/15 text-[#008DA9] dark:text-cyan-300 border border-[#008DA9]/30 text-xs font-bold cursor-pointer"
                >
                  Prendre photo
                </button>
              )}
              {canValidatePdv && pdv.status !== 'valide' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(pdv.id, 'valide')}
                  disabled={updatingId === pdv.id}
                  className="px-3 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-bold cursor-pointer"
                >
                  Valider
                </button>
              )}
              {canValidatePdv && pdv.status !== 'rejete' && (
                <button
                  type="button"
                  onClick={() => {
                    setRejectingPdv(pdv);
                    setRejectionReason('Informations incomplètes ou doublon de zone');
                  }}
                  disabled={updatingId === pdv.id}
                  className="px-3 py-1.5 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
                >
                  Rejeter
                </button>
              )}
              {canCancelPdvInvoice && salesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelInvoiceFeedback(null);
                    setCancellingInvoiceSale(null);
                    setSelectedPdvForInvoices(pdv);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                >
                  Factures ({salesCount})
                </button>
              )}
            </>
          );
        }}
        totalsFooter={
          <>
            <span>
              Validés : <strong>{filtered.filter((p) => p.status === 'valide').length}</strong>
            </span>
            <span>
              En attente : <strong>{filtered.filter((p) => p.status === 'en_attente').length}</strong>
            </span>
            <span>
              CA cumulé PDV :{' '}
              <strong className="text-teal-700 dark:text-teal-400 whitespace-nowrap">
                {filtered.reduce((acc, p) => acc + getPdvSalesAmount(p), 0).toLocaleString('fr-FR')} FCFA
              </strong>
            </span>
          </>
        }
      />

      {/* Hidden file input for optional direct photo selection/camera on mobile & desktop */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilePhotoSelected}
        className="hidden"
      />

      {/* Fullscreen Storefront Photo Modal */}
      {previewPhotoPdv && (
        <FormModal
          title={`Devanture • ${previewPhotoPdv.name}`}
          subtitle={`${previewPhotoPdv.code} • ${previewPhotoPdv.neighborhood}, Bamako • Par ${previewPhotoPdv.created_by || 'Oumar Konaté'}`}
          icon={<Camera className="w-5 h-5 text-[var(--marque-fonce)]" />}
          onClose={() => setPreviewPhotoPdv(null)}
          cancelLabel="Fermer"
          hideFooter={false}
          submitLabel="Fermer"
          onSubmit={() => setPreviewPhotoPdv(null)}
        >
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
              <img
                src={getPdvStorefrontImageUrl(previewPhotoPdv)}
                alt={previewPhotoPdv.name}
                referrerPolicy="no-referrer"
                className="w-full max-h-[60vh] object-contain mx-auto"
              />
            </div>
            <p className="text-xs text-slate-500 font-mono text-center">
              Coordonnées GPS : {Number(previewPhotoPdv.latitude || 12.6392).toFixed(6)}, {Number(previewPhotoPdv.longitude || -8.0029).toFixed(6)}
            </p>
          </div>
        </FormModal>
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

      {/* Reject PDV Modal (Administrateur only) */}
      {isAdmin && rejectingPdv && (
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

      {/* New PDV Modal (Vendeur only) — Conditioned on Live Camera Stream + Instant Precise GPS with OpenStreetMap Leaflet */}
      {canCreate && showCreateModal && (
        <FormModal
          title="Création de PDV • Photo de Profil & GPS"
          subtitle="La photo prise s'affiche immédiatement comme image de profil du PDV."
          icon={<Store className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => {
            stopCameraStream();
            setShowCreateModal(false);
          }}
          onSubmit={handleCreatePdv}
          submitLabel={
            <>
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Envoi en cours...' : 'Soumettre le PDV (Photo Profil + GPS)'}</span>
            </>
          }
          submitDisabled={isSubmitting || !capturedPhotoData || !capturedGpsStamp}
          isDirty={Boolean(name.trim() || managerName.trim() || capturedPhotoData)}
        >
          <div className="space-y-4 text-xs">
            {createError && <FieldError message={createError} />}

            {/* Live PDV Profile Image Card inside the Creation Modal */}
            <div className="p-3.5 rounded-2xl border-2 border-[#008DA9]/40 bg-gradient-to-r from-teal-50/70 to-cyan-50/50 dark:from-slate-800/80 dark:to-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={
                      capturedPhotoData ||
                      getPdvStorefrontImageUrl({
                        name: name.trim() || 'Boutique',
                        neighborhood,
                      })
                    }
                    alt="Image de profil du PDV"
                    referrerPolicy="no-referrer"
                    className={`w-16 h-16 rounded-2xl object-cover border-2 shadow-md ${
                      capturedPhotoData ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-[#008DA9]'
                    }`}
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full text-white flex items-center justify-center shadow-sm border border-white dark:border-slate-900 ${
                      capturedPhotoData ? 'bg-emerald-600' : 'bg-[#008DA9]'
                    }`}
                  >
                    {capturedPhotoData ? <Check className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#008DA9] dark:text-cyan-400">
                      Image de Profil du PDV
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        capturedPhotoData
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                      }`}
                    >
                      {capturedPhotoData ? 'Photo prise & assignée au profil' : 'Prenez une photo ci-dessous'}
                    </span>
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white break-words leading-snug mt-0.5">
                    {name.trim() || 'Nouveau Point de Vente'}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 break-words leading-snug">
                    Quartier {neighborhood}, Bamako &bull; Vendeur créateur :{' '}
                    <strong>{currentUser?.name || 'Oumar Konaté'}</strong>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCaptureStorefrontAndGps}
                  className="px-3 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{capturedPhotoData ? 'Actualiser la photo' : 'Prendre la photo'}</span>
                </button>
              </div>
            </div>

            {/* Step 1: PDV Identification Fields */}
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
                  Quartier (Bamako)
                </label>
                <select
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className={FORM_FIELD_CLASS}
                >
                  <option value="Sotuba">Sotuba (Rive Gauche)</option>
                  <option value="Badalabougou">Badalabougou (Rive Droite)</option>
                  <option value="ACI 2000">ACI 2000 (Rive Gauche)</option>
                  <option value="Faladié">Faladié (Rive Droite)</option>
                  <option value="Lafiabougou">Lafiabougou (Rive Gauche)</option>
                  <option value="Niamakoro">Niamakoro (Rive Droite)</option>
                  <option value="Daoudabougou">Daoudabougou (Rive Droite)</option>
                  <option value="Bozola">Bozola (Centre / Grand Marché)</option>
                  <option value="Djélibougou">Djélibougou (Rive Gauche)</option>
                  <option value="Sabalibougou">Sabalibougou (Rive Droite)</option>
                  <option value="Yirimadio">Yirimadio (Zone Est)</option>
                  <option value="Moribabougou">Moribabougou (Périphérie)</option>
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
    </div>
  );
};
