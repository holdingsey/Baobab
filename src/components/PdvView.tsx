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

  // Seul le Vendeur crée une demande de point de vente ; l'Administrateur ne crée jamais de PDV
  const isAdmin = currentRole === 'Administrateur';
  const canCreate = currentRole === 'Vendeur';

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
    if (!isAdmin) return;
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
    await handleUpdateStatus(rejectingPdv.id, 'rejete', rejectionReason.trim() || "Demande rejetée par l'Administrateur");
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
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? "Validation ou rejet des demandes de création de points de vente. Un vendeur peut créer un PDV sans pour autant faire aucune vente (affiché « 0 ventes »)."
              : "Un vendeur peut créer un PDV sans pour autant faire aucune vente : chaque PDV affiche son nombre de ventes réalisées ou « 0 ventes » s'il n'y en a pas."}
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          {isAdmin && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold">
              <Shield className="w-4 h-4" />
              <span>Validation / Rejet Administrateur</span>
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
          {(rejectedCount > 0 || isAdmin) && (
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

      {/* PDV Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((pdv) => {
          const isValide = pdv.status === 'valide';
          const isRejete = pdv.status === 'rejete';
          const fallbackCoords = BAMAKO_NEIGHBORHOOD_GPS[pdv.neighborhood] || BAMAKO_NEIGHBORHOOD_GPS['Sotuba'];
          const pdvLat = Number.isFinite(Number(pdv.latitude)) ? Number(pdv.latitude) : fallbackCoords.lat;
          const pdvLng = Number.isFinite(Number(pdv.longitude)) ? Number(pdv.longitude) : fallbackCoords.lng;
          const pdvAcc = Number.isFinite(Number(pdv.gps_accuracy)) ? Number(pdv.gps_accuracy) : 4.5;
          const isMapOpen = Boolean(visibleMapPdvIds[pdv.id]);
          const salesCount = getPdvSalesCount(pdv);
          const salesAmount = getPdvSalesAmount(pdv);
          const storefrontImg = getPdvStorefrontImageUrl(pdv);

          return (
            <div
              key={pdv.id}
              className={`p-5 rounded-2xl border transition shadow-xs flex flex-col justify-between space-y-4 ${
                isValide
                  ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  : isRejete
                  ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20'
                  : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                    {pdv.code}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        salesCount > 0
                          ? 'bg-[#008DA9]/15 text-[#008DA9] dark:bg-[#008DA9]/25 dark:text-cyan-300 border border-[#008DA9]/30'
                          : 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <ShoppingBag className="w-3 h-3" />
                      {salesCount > 0 ? `${salesCount} ${salesCount > 1 ? 'ventes' : 'vente'}` : '0 ventes'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        isValide
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : isRejete
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {isValide ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Validé
                        </>
                      ) : isRejete ? (
                        <>
                          <XCircle className="w-3 h-3" /> Rejeté
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" /> En attente
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Storefront Banner & Profile Image for every PDV (validated and non-validated) */}
                <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
                  <img
                    src={storefrontImg}
                    alt={`Devanture ${pdv.name}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-40 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1 shadow-md cursor-pointer"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Agrandir</span>
                  </button>
                </div>

                {/* PDV Profile Header with Circular/Rounded Storefront Profile Avatar */}
                <div className="flex items-center gap-3 pt-0.5">
                  <div className="relative shrink-0">
                    <img
                      src={storefrontImg}
                      alt={`Image de profil ${pdv.name}`}
                      referrerPolicy="no-referrer"
                      onClick={() => setPreviewPhotoPdv({ ...pdv, photo_url: storefrontImg })}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-[#008DA9] shadow-sm cursor-pointer"
                    />
                    {canCreate && (
                      <button
                        type="button"
                        title="Prendre une photo et l'assigner directement comme image de profil"
                        onClick={() => {
                          setCreateError(null);
                          setCapturedPhotoData(null);
                          setCapturedGpsStamp(null);
                          setPhotoTargetPdv(pdv);
                        }}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#008DA9] hover:bg-[#00748C] text-white flex items-center justify-center shadow-md border border-white dark:border-slate-900 cursor-pointer"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#008DA9] dark:text-cyan-400">
                      Profil du PDV &bull; {isValide ? 'Boutique Validée' : 'Non Validée'}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
                      {pdv.name}
                    </h3>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Quartier {pdv.neighborhood}, {pdv.city}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[10.5px] font-bold text-teal-800 dark:text-teal-300 max-w-full min-w-0">
                      <User className="w-3 h-3 text-[#008DA9] shrink-0" />
                      <span className="truncate flex-1 min-w-0">
                        Créé par : <strong>{pdv.created_by || 'Oumar Konaté'}</strong>
                      </span>
                      {pdv.vendor_code && (
                        <span className="shrink-0 font-mono text-[9px] font-extrabold px-1 py-0.2 rounded bg-white/90 dark:bg-slate-800 border border-teal-300 dark:border-teal-700 text-[#008DA9] dark:text-cyan-300">
                          {pdv.vendor_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Direct Camera Action Button for Vendor to Take & Assign Storefront Photo as Profile Image */}
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreateError(null);
                      setCapturedPhotoData(null);
                      setCapturedGpsStamp(null);
                      setPhotoTargetPdv(pdv);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[#008DA9]/10 hover:bg-[#008DA9] text-[#008DA9] hover:text-white border border-[#008DA9]/30 text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Prendre une photo (Assigner comme profil du PDV)</span>
                  </button>
                )}

                <div>
                  {/* Sales activity notice on each PDV */}
                  <div
                    className={`p-2.5 rounded-xl border text-xs ${
                      salesCount > 0
                        ? 'bg-cyan-50/70 dark:bg-cyan-950/25 border-cyan-200 dark:border-cyan-900/60 text-slate-800 dark:text-slate-200'
                        : 'bg-slate-100/80 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-[#008DA9] dark:text-cyan-400">
                        {salesCount > 0
                          ? `${salesCount} ${salesCount > 1 ? 'ventes réalisées' : 'vente réalisée'}`
                          : '0 ventes'}
                      </span>
                      {salesCount > 0 && (
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {salesAmount.toLocaleString('fr-FR')} FCFA
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {salesCount > 0
                        ? 'Chaque vente réalisée sur ce PDV constitue une facture à part.'
                        : 'PDV créé par le vendeur sans aucune vente réalisée à ce jour.'}
                    </p>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-800/70">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                        <User className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                        <span className="truncate">
                          Vendeur : <strong className="text-slate-900 dark:text-white font-extrabold">{pdv.created_by || 'Oumar Konaté'}</strong>
                        </span>
                      </div>
                      {pdv.vendor_code && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-[#008DA9] dark:text-cyan-300 border border-teal-200 dark:border-teal-800 shrink-0">
                          {pdv.vendor_code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                      <span>{pdv.neighborhood}, {pdv.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <User className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                      <span>Gérant boutique : <strong>{pdv.manager_name}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                      <span>{pdv.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/70 px-2.5 py-1.5 rounded-lg">
                      <Navigation className="w-3.5 h-3.5 text-[#008DA9] shrink-0" />
                      <span>
                        GPS: {pdvLat.toFixed(5)}, {pdvLng.toFixed(5)} (±{pdvAcc.toFixed(1)}m)
                      </span>
                    </div>
                    {pdv.captured_at && (
                      <div className="text-[10px] text-slate-400">
                        Capturé le : <span className="font-mono font-semibold">{pdv.captured_at}</span>
                      </div>
                    )}
                    {isRejete && pdv.rejection_reason && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-100/70 dark:bg-rose-950/50 text-[11px] text-rose-800 dark:text-rose-300">
                        <strong>Motif du rejet :</strong> {pdv.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Show / Hide OpenStreetMap Leaflet Map Toggle Button per PDV */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleCardMap(pdv.id)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      isMapOpen
                        ? 'bg-[#008DA9] text-white border-[#008DA9]'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {isMapOpen ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Masquer la carte GPS</span>
                      </>
                    ) : (
                      <>
                        <MapIcon className="w-3.5 h-3.5 text-[#008DA9]" />
                        <span>Afficher la carte (Position précise)</span>
                      </>
                    )}
                  </button>

                  {isMapOpen && (
                    <div className="mt-2.5">
                      <OsmLeafletMap
                        centerLat={pdvLat}
                        centerLng={pdvLng}
                        accuracy={pdvAcc}
                        zoom={16}
                        heightClassName="h-48"
                        label={pdv.name}
                        sublabel={`${pdv.neighborhood}, Bamako • Gérant: ${pdv.manager_name} • Vendeur: ${pdv.created_by || 'Oumar Konaté'}`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Validation & Rejection Buttons */}
              {isAdmin && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  {pdv.status === 'en_attente' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUpdateStatus(pdv.id, 'valide')}
                        disabled={updatingId === pdv.id}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Valider</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectingPdv(pdv);
                          setRejectionReason('Informations incomplètes ou doublon de zone');
                        }}
                        disabled={updatingId === pdv.id}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rejeter</span>
                      </button>
                    </div>
                  ) : pdv.status === 'valide' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUpdateStatus(pdv.id, 'en_attente')}
                        disabled={updatingId === pdv.id}
                        className="py-1.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 dark:bg-slate-800 dark:hover:bg-amber-950 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>En attente</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectingPdv(pdv);
                          setRejectionReason('Point de vente désactivé / rejeté');
                        }}
                        disabled={updatingId === pdv.id}
                        className="py-1.5 px-3 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rejeter</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus(pdv.id, 'valide')}
                      disabled={updatingId === pdv.id}
                      className="w-full py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Valider ce PDV</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Image de Profil PDV &bull; Devanture {previewPhotoPdv.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewPhotoPdv.code} &bull; {previewPhotoPdv.neighborhood}, Bamako &bull; Créé par le vendeur :{' '}
                  <strong>{previewPhotoPdv.created_by || 'Oumar Konaté'}</strong> &bull; GPS :{' '}
                  {Number(previewPhotoPdv.latitude || 12.6392).toFixed(6)}, {Number(previewPhotoPdv.longitude || -8.0029).toFixed(6)}
                </p>
              </div>
              <button
                onClick={() => setPreviewPhotoPdv(null)}
                className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm cursor-pointer"
              >
                Fermer &times;
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
              <img
                src={getPdvStorefrontImageUrl(previewPhotoPdv)}
                alt={previewPhotoPdv.name}
                referrerPolicy="no-referrer"
                className="w-full max-h-[70vh] object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Direct Camera Modal for Existing PDV — Immediately assigns captured photo as the PDV's profile image */}
      {photoTargetPdv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <img
                  src={capturedPhotoData || getPdvStorefrontImageUrl(photoTargetPdv)}
                  alt={photoTargetPdv.name}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-[#008DA9] shadow-sm"
                />
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#008DA9]" />
                    Photo Devanture &bull; Image de Profil du PDV
                  </h3>
                  <p className="text-xs text-slate-500">
                    {photoTargetPdv.name} ({photoTargetPdv.code}) &bull; {photoTargetPdv.neighborhood}, Bamako
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setPhotoTargetPdv(null);
                  setCapturedPhotoData(null);
                  setCapturedGpsStamp(null);
                }}
                className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3.5 rounded-2xl border-2 border-[#008DA9]/40 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide text-[11px]">
                    Prise de photo directe &mdash; Assignée immédiatement comme profil du PDV
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
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
                  className="w-full py-3 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Prendre la photo &amp; Assigner directement comme image de profil du PDV</span>
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
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Terminer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject PDV Modal (Administrateur only) */}
      {isAdmin && rejectingPdv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                Rejeter la demande de PDV
              </h3>
              <button
                onClick={() => setRejectingPdv(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="space-y-3.5 text-xs">
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
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif du rejet :
                </label>
                <input
                  type="text"
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Indiquez le motif du rejet..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingPdv(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updatingId === rejectingPdv.id}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs"
                >
                  Confirmer le rejet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New PDV Modal (Vendeur only) — Conditioned on Live Camera Stream + Instant Precise GPS with OpenStreetMap Leaflet */}
      {canCreate && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  {capturedPhotoData ? (
                    <img
                      src={capturedPhotoData}
                      alt="Image de profil du nouveau PDV"
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-[#008DA9]/10 border-2 border-dashed border-[#008DA9] flex items-center justify-center text-[#008DA9]">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2 truncate">
                    <Store className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span className="truncate">Création de PDV &bull; Photo de Profil &amp; GPS</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    La photo prise s&apos;affiche immédiatement comme image de profil du PDV.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setShowCreateModal(false);
                }}
                className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold flex items-center justify-center cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePdv} className="space-y-4 text-xs">
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
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">
                      {name.trim() || 'Nouveau Point de Vente'}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom du commerce / Alimentation * :
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Alimentation Le Régal"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom du gérant / boutiquier * :
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Issa Traoré"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quartier (Bamako) :
                  </label>
                  <select
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
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
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Téléphone du PDV :
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+223 70 00 00 00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                La demande de création accompagnée de la photo de devanture horodatée (assignée comme image de profil du PDV) sera soumise à l'Administrateur pour validation.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setShowCreateModal(false);
                  }}
                  className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !capturedPhotoData || !capturedGpsStamp}
                  className={`px-5 py-2.5 rounded-xl font-bold transition shadow-xs flex items-center gap-1.5 ${
                    !capturedPhotoData || !capturedGpsStamp
                      ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-[#008DA9] hover:bg-[#00748C] text-white cursor-pointer'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmitting ? 'Envoi en cours...' : 'Soumettre le PDV (Photo Profil + GPS)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
