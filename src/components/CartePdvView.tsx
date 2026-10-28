import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin,
  Store,
  Phone,
  User,
  CheckCircle,
  Clock,
  Navigation,
  Eye,
  EyeOff,
  XCircle,
  Truck,
  Wifi,
  WifiOff,
  RefreshCw,
  Route,
  LocateFixed,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import {
  OsmLeafletMap,
  OsmMarkerItem,
  OsmVendorMarkerItem,
  OsmTrajectoryPoint,
} from './OsmLeafletMap';
import {
  isAppOnline,
  isSimulatedOffline,
  setSimulatedOffline,
  getOfflineGpsQueue,
  getOfflineSalesQueue,
  enqueueOfflineGpsPosition,
  syncPendingOfflineData,
  OfflineGpsRecord,
} from '../utils/offlineSync';
import { getPdvStorefrontImageUrl } from '../utils/malianStorefrontImages';

interface CartePdvViewProps {
  pdvs: any[];
  sales?: any[];
  currentUser: any;
}

const BAMAKO_NEIGHBORHOOD_GPS: Record<string, { lat: number; lng: number }> = {
  Sotuba: { lat: 12.6608, lng: -7.9352 },
  Badalabougou: { lat: 12.6174, lng: -7.9896 },
  'ACI 2000': { lat: 12.6331, lng: -8.0268 },
  Faladié: { lat: 12.5968, lng: -7.9514 },
  Lafiabougou: { lat: 12.6389, lng: -8.0412 },
  Niamakoro: { lat: 12.5815, lng: -7.9685 },
  Daoudabougou: { lat: 12.6062, lng: -7.9721 },
  Bozola: { lat: 12.6458, lng: -7.9942 },
  Djélibougou: { lat: 12.6654, lng: -7.9598 },
  Sabalibougou: { lat: 12.6025, lng: -8.0041 },
  Yirimadio: { lat: 12.5982, lng: -7.9125 },
  Moribabougou: { lat: 12.6852, lng: -7.8994 },
};

// Haversine distance in km between two GPS points
function computeDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const CartePdvView: React.FC<CartePdvViewProps> = ({ pdvs, sales = [], currentUser }) => {
  const isAdmin = currentUser?.role === 'Administrateur';
  const isVendeur = currentUser?.role === 'Vendeur';

  const getPdvSalesCount = useCallback(
    (pdv: any): number => {
      if (!pdv) return 0;
      if (Array.isArray(sales) && sales.length > 0) {
        return sales.filter((s) => s.pdv_id === pdv.id).length;
      }
      return Number(pdv.sales_count || 0);
    },
    [sales]
  );

  // Le vendeur ne peut voir que les PDV qu'il a créés
  const visiblePdvs = useMemo(() => {
    if (isVendeur && currentUser?.id) {
      return pdvs.filter(
        (p) => p.vendor_id === currentUser.id || (!p.vendor_id && p.created_by === currentUser.name)
      );
    }
    return pdvs;
  }, [pdvs, isVendeur, currentUser?.id, currentUser?.name]);

  const [mapMode, setMapMode] = useState<'global' | 'vendeurs' | 'trajets'>('global');
  const [selectedPdv, setSelectedPdv] = useState<any>(visiblePdvs[0] || null);
  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    isVendeur && currentUser?.id ? currentUser.id : 'usr-vnd-1'
  );
  const [trajectoryDateFilter, setTrajectoryDateFilter] = useState<string>('all');
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    if (!selectedPdv || !visiblePdvs.some((p) => p.id === selectedPdv.id)) {
      setSelectedPdv(visiblePdvs[0] || null);
    }
  }, [visiblePdvs, selectedPdv]);

  useEffect(() => {
    if (isVendeur && currentUser?.id) {
      setSelectedVendorId(currentUser.id);
      setMapMode('global');
    }
  }, [isVendeur, currentUser?.id]);

  // Server GPS data
  const [vendorPositions, setVendorPositions] = useState<any[]>([]);
  const [trajectories, setTrajectories] = useState<any[]>([]);

  // Offline & Sync states
  const [online, setOnline] = useState<boolean>(() => isAppOnline());
  const [simulatedOffline, setSimulatedOfflineState] = useState<boolean>(() => isSimulatedOffline());
  const [pendingOfflineGps, setPendingOfflineGps] = useState<OfflineGpsRecord[]>(() => getOfflineGpsQueue());
  const [pendingOfflineSalesCount, setPendingOfflineSalesCount] = useState<number>(() => getOfflineSalesQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [autoTrackGps, setAutoTrackGps] = useState(false);
  const [activityNote, setActivityNote] = useState('En tournée commerciale • Relevé GPS terrain');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'offline' | 'info'; text: string } | null>(null);

  const fetchGpsData = useCallback(async () => {
    if (!isAppOnline()) return;
    try {
      const query = isVendeur && currentUser?.id ? `?vendor_id=${encodeURIComponent(currentUser.id)}` : '';
      const res = await fetch(`/api/gps/vendors${query}`, {
        headers: {
          'x-user-role': currentUser?.role || 'Administrateur',
          'x-user-id': currentUser?.id || '',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.latestPositions) setVendorPositions(data.latestPositions);
        if (data.trajectories) setTrajectories(data.trajectories);
      }
    } catch {
      // ignore when offline
    }
  }, [currentUser?.id, currentUser?.role, isVendeur]);

  const refreshQueueState = useCallback(() => {
    setOnline(isAppOnline());
    setSimulatedOfflineState(isSimulatedOffline());
    const allGpsQueue = getOfflineGpsQueue();
    setPendingOfflineGps(
      isVendeur && currentUser?.id ? allGpsQueue.filter((g) => g.vendor_id === currentUser.id) : allGpsQueue
    );
    const allSalesQueue = getOfflineSalesQueue();
    setPendingOfflineSalesCount(
      isVendeur && currentUser?.id ? allSalesQueue.filter((s) => s.vendor_id === currentUser.id).length : allSalesQueue.length
    );
  }, [currentUser?.id, isVendeur]);

  const handleSyncNow = useCallback(
    async (silent = false) => {
      if (!isAppOnline()) return;
      const gpsQ = getOfflineGpsQueue();
      const salesQ = getOfflineSalesQueue();
      if (gpsQ.length === 0 && salesQ.length === 0) {
        if (!silent) {
          setStatusMessage({
            type: 'info',
            text: 'Toutes les positions GPS et ventes hors-ligne sont déjà synchronisées.',
          });
        }
        return;
      }

      setIsSyncing(true);
      try {
        const summary = await syncPendingOfflineData(currentUser?.role || 'Vendeur');
        refreshQueueState();
        await fetchGpsData();
        if (summary) {
          setStatusMessage({
            type: 'success',
            text: summary.message,
          });
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [currentUser?.role, fetchGpsData, refreshQueueState]
  );

  useEffect(() => {
    fetchGpsData();
  }, [fetchGpsData]);

  useEffect(() => {
    const onNetChange = () => {
      refreshQueueState();
      if (isAppOnline()) {
        handleSyncNow(true);
        fetchGpsData();
      }
    };
    const onQueueChange = () => {
      refreshQueueState();
    };

    window.addEventListener('online', onNetChange);
    window.addEventListener('offline', onNetChange);
    window.addEventListener('baobab-network-change', onNetChange);
    window.addEventListener('baobab-queue-updated', onQueueChange);
    window.addEventListener('baobab-sync-completed', onQueueChange);

    if (isAppOnline() && (getOfflineGpsQueue().length > 0 || getOfflineSalesQueue().length > 0)) {
      handleSyncNow(true);
    }

    return () => {
      window.removeEventListener('online', onNetChange);
      window.removeEventListener('offline', onNetChange);
      window.removeEventListener('baobab-network-change', onNetChange);
      window.removeEventListener('baobab-queue-updated', onQueueChange);
      window.removeEventListener('baobab-sync-completed', onQueueChange);
    };
  }, [fetchGpsData, handleSyncNow, refreshQueueState]);

  const handleToggleOfflineSimulation = () => {
    const nextOffline = !simulatedOffline;
    setSimulatedOffline(nextOffline);
    setSimulatedOfflineState(nextOffline);
    setOnline(!nextOffline && navigator.onLine);
    if (nextOffline) {
      setStatusMessage({
        type: 'offline',
        text: 'Mode Hors-Ligne activé : les positions GPS des vendeurs sont enregistrées localement et seront synchronisées dès le retour du réseau.',
      });
    } else {
      setStatusMessage({
        type: 'info',
        text: 'Réseau disponible : synchronisation automatique des positions GPS hors-ligne en cours...',
      });
    }
  };

  // Capture & record vendor GPS position (works both Online and Offline)
  const handleRecordVendorGpsPosition = useCallback(
    async (customLabel?: string) => {
      const targetVendorId = isVendeur ? currentUser.id : selectedVendorId || 'usr-vnd-1';
      const existingVendor = vendorPositions.find((v) => v.vendor_id === targetVendorId);
      const baseLat = existingVendor ? Number(existingVendor.latitude) : 12.6389;
      const baseLng = existingVendor ? Number(existingVendor.longitude) : -8.015;

      setIsCapturingGps(true);

      const getCoords = (): Promise<{ lat: number; lng: number; accuracy: number; speed: number }> => {
        return new Promise((resolve) => {
          // Slight realistic movement step along tour in Bamako if geolocation unavailable
          const stepLat = Number((baseLat + (Math.random() - 0.42) * 0.0045).toFixed(6));
          const stepLng = Number((baseLng + (Math.random() - 0.45) * 0.0045).toFixed(6));
          const simSpeed = Math.round(14 + Math.random() * 20);

          if (typeof navigator === 'undefined' || !navigator.geolocation) {
            resolve({ lat: stepLat, lng: stepLng, accuracy: 3.8, speed: simSpeed });
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                lat: Number(pos.coords.latitude.toFixed(6)),
                lng: Number(pos.coords.longitude.toFixed(6)),
                accuracy: Number((pos.coords.accuracy || 4.0).toFixed(1)),
                speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : simSpeed,
              });
            },
            () => {
              resolve({ lat: stepLat, lng: stepLng, accuracy: 3.8, speed: simSpeed });
            },
            { enableHighAccuracy: true, timeout: 2200, maximumAge: 5000 }
          );
        });
      };

      try {
        const coords = await getCoords();
        const nowIso = new Date().toISOString();
        const dateStr = nowIso.split('T')[0];
        const label = customLabel || activityNote || 'Position GPS vendeur en tournée';
        const posId = `gps-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        if (!isAppOnline()) {
          // Save in local offline GPS queue
          enqueueOfflineGpsPosition({
            id: posId,
            vendor_id: targetVendorId,
            vendor_name: isVendeur ? currentUser.name : existingVendor?.vendor_name || 'Vendeur',
            vendor_code: isVendeur ? currentUser.code : existingVendor?.vendor_code || 'BAO-VND',
            latitude: coords.lat,
            longitude: coords.lng,
            accuracy: coords.accuracy,
            speed_kmh: coords.speed,
            activity_label: label,
            pdv_id: selectedPdv?.id || null,
            recorded_offline: 1,
            recorded_at: nowIso,
            date: dateStr,
          });
          refreshQueueState();
          setStatusMessage({
            type: 'offline',
            text: `Position GPS (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}) enregistrée hors-ligne. Elle sera synchronisée automatiquement dès le retour du réseau.`,
          });
          return;
        }

        // Online: send directly to server, fallback to offline queue if request fails
        const res = await fetch('/api/gps/positions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentUser?.role || 'Vendeur',
          },
          body: JSON.stringify({
            id: posId,
            vendor_id: targetVendorId,
            latitude: coords.lat,
            longitude: coords.lng,
            accuracy: coords.accuracy,
            speed_kmh: coords.speed,
            activity_label: label,
            pdv_id: selectedPdv?.id || null,
            recorded_offline: 0,
            recorded_at: nowIso,
          }),
        });

        if (res.ok) {
          await fetchGpsData();
          setStatusMessage({
            type: 'success',
            text: `Position GPS (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}) enregistrée et synchronisée en direct sur la carte.`,
          });
        } else {
          throw new Error('Network error');
        }
      } catch {
        // Fallback to offline queue
        const nowIso = new Date().toISOString();
        enqueueOfflineGpsPosition({
          id: `gps-off-${Date.now()}`,
          vendor_id: targetVendorId,
          vendor_name: isVendeur ? currentUser.name : existingVendor?.vendor_name || 'Vendeur',
          vendor_code: isVendeur ? currentUser.code : existingVendor?.vendor_code || 'BAO-VND',
          latitude: baseLat + 0.002,
          longitude: baseLng - 0.002,
          accuracy: 4.2,
          speed_kmh: 18,
          activity_label: customLabel || activityNote,
          pdv_id: selectedPdv?.id || null,
          recorded_offline: 1,
          recorded_at: nowIso,
          date: nowIso.split('T')[0],
        });
        refreshQueueState();
      } finally {
        setIsCapturingGps(false);
      }
    },
    [activityNote, currentUser, fetchGpsData, isVendeur, refreshQueueState, selectedPdv?.id, selectedVendorId, vendorPositions]
  );

  // Automatic GPS tracking interval when enabled
  useEffect(() => {
    if (!autoTrackGps) return;
    const timer = setInterval(() => {
      handleRecordVendorGpsPosition('Suivi GPS automatique en tournée');
    }, 12000);
    return () => clearInterval(timer);
  }, [autoTrackGps, handleRecordVendorGpsPosition]);

  const getPdvCoords = (p: any, idx = 0) => {
    const lat = Number(p?.latitude);
    const lng = Number(p?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        accuracy: Number.isFinite(Number(p?.gps_accuracy)) ? Number(p.gps_accuracy) : 4.5,
      };
    }
    const base = BAMAKO_NEIGHBORHOOD_GPS[p?.neighborhood] || { lat: 12.6392, lng: -8.0029 };
    return {
      lat: Number((base.lat + (idx % 5) * 0.0005).toFixed(6)),
      lng: Number((base.lng + (idx % 4) * 0.0005).toFixed(6)),
      accuracy: 4.5,
    };
  };

  // Merge server vendor positions with any locally queued offline GPS positions
  // IMPORTANT: Si l'utilisateur est un Vendeur, il n'a aucun accès aux positions des autres vendeurs
  const mergedVendorPositions = useMemo(() => {
    const scopedServerPositions =
      isVendeur && currentUser?.id
        ? vendorPositions.filter((vp) => vp.vendor_id === currentUser.id)
        : vendorPositions;

    return scopedServerPositions.map((vp) => {
      const localPointsForVendor = pendingOfflineGps.filter((g) => g.vendor_id === vp.vendor_id);
      if (localPointsForVendor.length > 0) {
        const latestLocal = localPointsForVendor[localPointsForVendor.length - 1];
        return {
          ...vp,
          latitude: latestLocal.latitude,
          longitude: latestLocal.longitude,
          accuracy: latestLocal.accuracy,
          speed_kmh: latestLocal.speed_kmh,
          activity_label: latestLocal.activity_label,
          recorded_at: latestLocal.recorded_at,
          recorded_offline: 1,
          isPendingLocal: true,
          pendingLocalCount: localPointsForVendor.length,
        };
      }
      return {
        ...vp,
        isPendingLocal: false,
        pendingLocalCount: 0,
      };
    });
  }, [vendorPositions, pendingOfflineGps, isVendeur, currentUser?.id]);

  const pdvMarkers: OsmMarkerItem[] = useMemo(
    () =>
      visiblePdvs.map((p, idx) => {
        const c = getPdvCoords(p, idx);
        return {
          id: p.id,
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          title: `${p.name} (${p.code})`,
          subtitle: `${p.neighborhood}, Bamako • Gérant: ${p.manager_name}`,
          status: p.status,
          capturedAt: p.captured_at,
        };
      }),
    [visiblePdvs]
  );

  // Sur la carte, le vendeur ne voit que ses propres PDV et jamais la position des autres vendeurs
  const vendorMapMarkers: OsmVendorMarkerItem[] = useMemo(
    () =>
      isVendeur
        ? []
        : mergedVendorPositions.map((v) => ({
            vendorId: v.vendor_id,
            vendorCode: v.vendor_code,
            vendorName: v.vendor_name,
            team: v.vendor_team,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            accuracy: Number(v.accuracy || 4.0),
            speedKmh: Number(v.speed_kmh || 0),
            activityLabel: v.activity_label,
            recordedAt: v.recorded_at,
            recordedOffline: Boolean(v.recorded_offline),
            isPendingLocal: Boolean(v.isPendingLocal),
          })),
    [mergedVendorPositions, isVendeur]
  );

  // Filter trajectory points for the selected vendor (for Admin route history)
  const selectedVendorTrajectory = useMemo(() => {
    const serverPts = trajectories.filter((t) => {
      const matchVendor = t.vendor_id === selectedVendorId;
      const matchDate = trajectoryDateFilter === 'all' || t.date === trajectoryDateFilter;
      return matchVendor && matchDate;
    });
    const localPts = pendingOfflineGps
      .filter((g) => {
        const matchVendor = g.vendor_id === selectedVendorId;
        const matchDate = trajectoryDateFilter === 'all' || g.date === trajectoryDateFilter;
        return matchVendor && matchDate;
      })
      .map((g) => ({
        ...g,
        isPendingLocal: true,
      }));

    return [...serverPts, ...localPts].sort((a, b) =>
      String(a.recorded_at || '').localeCompare(String(b.recorded_at || ''))
    );
  }, [trajectories, pendingOfflineGps, selectedVendorId, trajectoryDateFilter]);

  const mapTrajectoryPoints: OsmTrajectoryPoint[] = useMemo(
    () =>
      selectedVendorTrajectory.map((pt, idx) => ({
        id: pt.id,
        lat: Number(pt.latitude),
        lng: Number(pt.longitude),
        stepNumber: idx + 1,
        title: pt.activity_label || 'Point GPS Tournée',
        subtitle: pt.pdv_name ? `${pt.pdv_name} (${pt.pdv_neighborhood})` : undefined,
        recordedAt: pt.recorded_at,
        recordedOffline: Boolean(pt.recorded_offline),
        speedKmh: Number(pt.speed_kmh || 0),
      })),
    [selectedVendorTrajectory]
  );

  // Calculate total trajectory distance in km
  const trajectoryTotalDistanceKm = useMemo(() => {
    if (selectedVendorTrajectory.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < selectedVendorTrajectory.length; i++) {
      const prev = selectedVendorTrajectory[i - 1];
      const curr = selectedVendorTrajectory[i];
      total += computeDistanceKm(
        Number(prev.latitude),
        Number(prev.longitude),
        Number(curr.latitude),
        Number(curr.longitude)
      );
    }
    return Number(total.toFixed(2));
  }, [selectedVendorTrajectory]);

  const availableTrajectoryDates = useMemo(() => {
    const dates = new Set<string>();
    trajectories.forEach((t) => {
      if (t.date) dates.add(t.date);
    });
    pendingOfflineGps.forEach((g) => {
      if (g.date) dates.add(g.date);
    });
    return Array.from(dates).sort().reverse();
  }, [trajectories, pendingOfflineGps]);

  // Determine map center based on active mode
  const activeCenter = useMemo(() => {
    if (mapMode === 'trajets' && mapTrajectoryPoints.length > 0) {
      const lastPt = mapTrajectoryPoints[mapTrajectoryPoints.length - 1];
      return { lat: lastPt.lat, lng: lastPt.lng, accuracy: 4.0, zoom: 13 };
    }
    if (mapMode === 'vendeurs') {
      const selV = mergedVendorPositions.find((v) => v.vendor_id === selectedVendorId) || mergedVendorPositions[0];
      if (selV) {
        return {
          lat: Number(selV.latitude),
          lng: Number(selV.longitude),
          accuracy: Number(selV.accuracy || 4.0),
          zoom: 13,
        };
      }
    }
    if (selectedPdv) {
      const c = getPdvCoords(selectedPdv);
      return { lat: c.lat, lng: c.lng, accuracy: c.accuracy, zoom: 13 };
    }
    return { lat: 12.6392, lng: -7.985, accuracy: 5, zoom: 13 };
  }, [mapMode, mapTrajectoryPoints, mergedVendorPositions, selectedVendorId, selectedPdv]);

  const selectedVendorInfo = mergedVendorPositions.find((v) => v.vendor_id === selectedVendorId) || mergedVendorPositions[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? `Carte GPS OpenStreetMap • Mes Points de Vente (${currentUser?.name})`
                : 'Carte GPS OpenStreetMap • Vendeurs, Trajets & PDV'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {isVendeur
                ? `${visiblePdvs.length} PDV créés par moi`
                : `${mergedVendorPositions.length} Vendeurs GPS • ${visiblePdvs.length} PDV`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVendeur
              ? 'Affichage exclusif des Points de Vente (PDV) que vous avez créés sur la carte OpenStreetMap. Les positions et les PDV des autres vendeurs sont confidentiels.'
              : "Suivi GPS en temps réel de tous les vendeurs sur la carte, sauvegarde hors-ligne des positions en cas d'absence de réseau avec synchronisation automatique, et historique complet des trajets pour l'Administrateur."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowMap((prev) => !prev)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
            showMap
              ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800'
              : 'bg-[#008DA9] hover:bg-[#00748C] text-white'
          }`}
        >
          {showMap ? (
            <>
              <EyeOff className="w-4 h-4" />
              <span>Masquer la carte GPS</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>Afficher la carte GPS</span>
            </>
          )}
        </button>
      </div>

      {/* BARRE RÉSEAU, CAPTURE GPS HORS-LIGNE & SYNCHRONISATION AUTOMATIQUE */}
      <div
        className={`p-4 rounded-2xl border text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
          online
            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              online ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
            }`}
          >
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-black text-sm flex items-center gap-2 flex-wrap">
              <span>
                {online
                  ? isVendeur
                    ? 'Réseau GPS Actif • Vos PDV créés sont affichés sur la carte'
                    : 'Réseau GPS Actif • Positions Vendeurs Synchronisées'
                  : 'Mode Sans Réseau (Hors-Ligne) • Enregistrement GPS Local Actif'}
              </span>
              {(pendingOfflineGps.length > 0 || pendingOfflineSalesCount > 0) && (
                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-black">
                  {pendingOfflineGps.length} position(s) GPS &amp; {pendingOfflineSalesCount} vente(s) en attente de synchro
                </span>
              )}
            </div>
            <p className="text-[11px] opacity-85 mt-0.5">
              {online
                ? isVendeur
                  ? `Vous visualisez uniquement vos ${visiblePdvs.length} point(s) de vente créé(s).`
                  : "Les positions GPS de tous les vendeurs sont affichées sur la carte et l'historique des trajets est synchronisé."
                : "S'il n'y a pas de réseau, chaque position GPS est enregistrée sur l'appareil et synchronisée automatiquement dès que le réseau redevient disponible."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleRecordVendorGpsPosition()}
            disabled={isCapturingGps}
            className="px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>
              {isCapturingGps
                ? 'Capture GPS...'
                : online
                ? 'Enregistrer ma position GPS'
                : 'Enregistrer ma position GPS (Hors-ligne)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAutoTrackGps((v) => !v)}
            className={`px-3 py-2 rounded-xl font-bold text-xs border transition cursor-pointer ${
              autoTrackGps
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {autoTrackGps ? 'Suivi GPS Auto : ACTIF' : 'Activer Suivi GPS Auto'}
          </button>

          {(pendingOfflineGps.length > 0 || pendingOfflineSalesCount > 0) && online && (
            <button
              type="button"
              onClick={() => handleSyncNow(false)}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchro...' : 'Synchroniser maintenant'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleOfflineSimulation}
            className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition cursor-pointer ${
              online
                ? 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50'
                : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white shadow-xs'
            }`}
          >
            {online ? (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Simuler Hors-Ligne</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Rétablir Réseau &amp; Synchro</span>
              </>
            )}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : statusMessage.type === 'offline'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              : 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {statusMessage.text}
          </span>
          <button onClick={() => setStatusMessage(null)} className="font-mono text-sm">&times;</button>
        </div>
      )}

      {/* MODE TABS & CARTES DE POSITION DE TOUS LES VENDEURS : Réservés aux rôles non-Vendeur (Administrateur, etc.) */}
      {!isVendeur && (
        <>
          <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-4`}>
            <button
              type="button"
              onClick={() => setMapMode('global')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border text-left ${
                mapMode === 'global'
                  ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#008DA9]'
              }`}
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span>Carte Globale (Tous les Vendeurs &amp; PDV)</span>
            </button>

            <button
              type="button"
              onClick={() => setMapMode('vendeurs')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
                mapMode === 'vendeurs'
                  ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#008DA9]'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Truck className="w-4 h-4 shrink-0" />
                <span>Position GPS de Tous les Vendeurs</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                  mapMode === 'vendeurs'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {mergedVendorPositions.length}
              </span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setMapMode('trajets')}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border text-left ${
                  mapMode === 'trajets'
                    ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#008DA9]'
                }`}
              >
                <Route className="w-4 h-4 shrink-0" />
                <span>Historique du Trajet par Vendeur (Admin)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mergedVendorPositions.map((v) => {
              const isSelected = selectedVendorId === v.vendor_id;
              return (
                <div
                  key={v.vendor_id}
                  onClick={() => {
                    setSelectedVendorId(v.vendor_id);
                    if (mapMode === 'global') setMapMode('vendeurs');
                  }}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? 'border-2 border-[#008DA9] bg-cyan-50/40 dark:bg-cyan-950/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#008DA9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#008DA9] text-white font-black text-xs flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-black text-xs text-slate-900 dark:text-white">{v.vendor_name}</div>
                        <div className="font-mono text-[10px] font-bold text-[#008DA9]">{v.vendor_code}</div>
                      </div>
                    </div>
                    {v.isPendingLocal ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Hors-ligne ({v.pendingLocalCount} en attente)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        GPS Synchronisé
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {v.activity_label}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>
                      Lat: {Number(v.latitude).toFixed(5)} | Lng: {Number(v.longitude).toFixed(5)}
                    </span>
                    <span>{v.speed_kmh ? `${v.speed_kmh} km/h` : `±${Number(v.accuracy || 4).toFixed(1)}m`}</span>
                  </div>

                  {isAdmin && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {v.total_points + (v.pendingLocalCount || 0)} points GPS enregistrés
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVendorId(v.vendor_id);
                          setMapMode('trajets');
                        }}
                        className="text-[10px] font-bold text-[#008DA9] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Route className="w-3 h-3" />
                        <span>Voir l'historique du trajet</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MAIN MAP & SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {showMap ? (
            <OsmLeafletMap
              centerLat={activeCenter.lat}
              centerLng={activeCenter.lng}
              accuracy={activeCenter.accuracy}
              zoom={activeCenter.zoom}
              heightClassName="h-[450px]"
              markers={mapMode === 'global' ? pdvMarkers : undefined}
              vendorMarkers={
                isVendeur
                  ? undefined
                  : mapMode !== 'trajets'
                  ? vendorMapMarkers
                  : vendorMapMarkers.filter((v) => v.vendorId === selectedVendorId)
              }
              trajectoryPoints={!isVendeur && mapMode === 'trajets' ? mapTrajectoryPoints : undefined}
              selectedId={mapMode === 'global' ? selectedPdv?.id : selectedVendorId}
              onSelectMarker={(id) => {
                const found = visiblePdvs.find((item) => item.id === id);
                if (found) setSelectedPdv(found);
              }}
              onSelectVendor={(vId) => {
                if (!isVendeur) setSelectedVendorId(vId);
              }}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
              <Navigation className="w-8 h-8 text-[#008DA9] mx-auto" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                La carte OpenStreetMap Leaflet est actuellement masquée
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isVendeur
                  ? 'Cliquez sur le bouton ci-dessous pour afficher la carte interactive avec la position GPS précise de vos points de vente.'
                  : 'Cliquez sur le bouton ci-dessous pour afficher la carte interactive avec la position GPS précise des vendeurs et des points de vente.'}
              </p>
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white text-xs font-bold cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Afficher la carte avec la position précise</span>
              </button>
            </div>
          )}

          {/* Quick PDV Selector Grid when in Global mode — Grille en rangées et colonnes sans débordement */}
          {mapMode === 'global' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {visiblePdvs.map((p) => {
                const isSelected = selectedPdv?.id === p.id;
                const pdvSalesCount = getPdvSalesCount(p);
                const pdvImg = getPdvStorefrontImageUrl(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPdv(p)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-between gap-2 cursor-pointer text-left ${
                      isSelected
                        ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#008DA9]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <img
                        src={pdvImg}
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-lg object-cover border border-white/40 shrink-0"
                      />
                      <span className="truncate">
                        {p.name} <span className="opacity-75 text-[10px]">({p.neighborhood})</span>
                      </span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : pdvSalesCount > 0
                          ? 'bg-cyan-50 text-[#008DA9] dark:bg-cyan-950/60 dark:text-cyan-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {pdvSalesCount > 0 ? `${pdvSalesCount} ${pdvSalesCount > 1 ? 'ventes' : 'vente'}` : '0 ventes'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Context-sensitive details (Trajectory summary for Admin OR Selected Vendor / PDV details) */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between space-y-4">
          {mapMode === 'trajets' && isAdmin ? (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-[#008DA9]" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Contrôle Trajet Vendeur (Admin)
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-bold text-[10px]">
                  Accès Administrateur
                </span>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Choisir le Vendeur :</label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  {mergedVendorPositions.map((v) => (
                    <option key={v.vendor_id} value={v.vendor_id}>
                      {v.vendor_name} ({v.vendor_code}) — {v.vendor_team}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Filtrer par date de tournée :</label>
                <select
                  value={trajectoryDateFilter}
                  onChange={(e) => setTrajectoryDateFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="all">Tout l'historique ({selectedVendorTrajectory.length} points)</option>
                  {availableTrajectoryDates.map((d) => (
                    <option key={d} value={d}>
                      Journée du {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Distance Parcourue</div>
                  <div className="text-base font-black text-[#008DA9] mt-0.5">{trajectoryTotalDistanceKm} km</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Étapes GPS Tracées</div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedVendorTrajectory.length} points
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
                <strong>Points capturés hors-ligne &amp; synchronisés :</strong>{' '}
                {selectedVendorTrajectory.filter((t) => t.recorded_offline).length} étape(s) enregistrée(s) sans réseau puis synchronisée(s) automatiquement.
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                <div className="font-bold text-slate-700 dark:text-slate-300">
                  Chronologie des étapes du trajet :
                </div>
                {selectedVendorTrajectory.map((pt, idx) => (
                  <div
                    key={pt.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-slate-900 dark:text-white">
                        #{idx + 1} • {pt.activity_label}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {String(pt.recorded_at || '').replace('T', ' ').slice(11, 19)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>
                        {Number(pt.latitude).toFixed(5)}, {Number(pt.longitude).toFixed(5)}
                      </span>
                      <span
                        className={`font-sans font-bold ${
                          pt.isPendingLocal
                            ? 'text-amber-600'
                            : pt.recorded_offline
                            ? 'text-teal-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {pt.isPendingLocal
                          ? 'Hors-ligne (En attente)'
                          : pt.recorded_offline
                          ? 'Hors-ligne • Synchronisé'
                          : 'Direct GPS'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : mapMode === 'vendeurs' && selectedVendorInfo ? (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#008DA9] bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-1 rounded">
                  {selectedVendorInfo.vendor_code}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  GPS Vendeur Actif
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {selectedVendorInfo.vendor_name}
              </h3>
              <p className="text-slate-500 -mt-2">{selectedVendorInfo.vendor_team}</p>

              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 font-mono text-[11px] space-y-1.5">
                <div className="font-sans font-bold text-[#008DA9] flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Dernière Position GPS Connue :</span>
                </div>
                <div>Latitude : {Number(selectedVendorInfo.latitude).toFixed(6)}° N</div>
                <div>Longitude : {Number(selectedVendorInfo.longitude).toFixed(6)}° O</div>
                <div>Précision : ±{Number(selectedVendorInfo.accuracy || 4.0).toFixed(1)} m</div>
                <div>Vitesse : {Number(selectedVendorInfo.speed_kmh || 0)} km/h</div>
                <div className="text-[10px] text-slate-500 pt-1">
                  Horodatage : {String(selectedVendorInfo.recorded_at || '').replace('T', ' ').slice(0, 19)}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Note d'étape pour nouveau relevé GPS :
                </label>
                <input
                  type="text"
                  value={activityNote}
                  onChange={(e) => setActivityNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => handleRecordVendorGpsPosition()}
                  disabled={isCapturingGps}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LocateFixed className="w-4 h-4" />
                  <span>
                    {online
                      ? 'Capturer & Synchroniser Position GPS'
                      : 'Capturer Position GPS Hors-Ligne'}
                  </span>
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setMapMode('trajets')}
                  className="w-full py-2.5 px-4 rounded-xl border border-[#008DA9] text-[#008DA9] hover:bg-cyan-50 dark:hover:bg-cyan-950/30 font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Route className="w-4 h-4" />
                  <span>Afficher l'historique complet du trajet</span>
                </button>
              )}
            </div>
          ) : selectedPdv ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#008DA9] bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded">
                    {selectedPdv.code}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      selectedPdv.status === 'valide'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : selectedPdv.status === 'rejete'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {selectedPdv.status === 'valide' ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> Validé
                      </>
                    ) : selectedPdv.status === 'rejete' ? (
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

                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
                  <img
                    src={getPdvStorefrontImageUrl(selectedPdv)}
                    alt={`Devanture ${selectedPdv.name}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-40 object-cover"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={getPdvStorefrontImageUrl(selectedPdv)}
                    alt={`Image de profil ${selectedPdv.name}`}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-[#008DA9] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#008DA9] dark:text-cyan-400">
                      Image de profil PDV &bull; {selectedPdv.status === 'valide' ? 'Validé' : 'Non Validé'}
                    </div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white leading-snug truncate">
                      {selectedPdv.name}
                    </h3>
                  </div>
                </div>

                {(() => {
                  const selCount = getPdvSalesCount(selectedPdv);
                  return (
                    <div
                      className={`p-2.5 rounded-xl border text-xs ${
                        selCount > 0
                          ? 'bg-cyan-50/70 dark:bg-cyan-950/25 border-cyan-200 dark:border-cyan-900/60 text-slate-800 dark:text-slate-200'
                          : 'bg-slate-100/80 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-black text-[#008DA9] dark:text-cyan-400">
                        {selCount > 0
                          ? `${selCount} ${selCount > 1 ? 'ventes réalisées sur ce PDV' : 'vente réalisée sur ce PDV'}`
                          : '0 ventes'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {selCount > 0
                          ? 'Chaque vente réalisée constitue une facture à part.'
                          : 'PDV créé par le vendeur sans aucune vente réalisée à ce jour.'}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span>
                      Quartier : <strong>{selectedPdv.neighborhood}</strong> (Bamako)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span>
                      Gérant : <strong>{selectedPdv.manager_name}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span>
                      Téléphone : <strong>{selectedPdv.phone}</strong>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="font-bold text-[#008DA9] flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Position GPS Précise :</span>
                    </div>
                    <div>Latitude : {activeCenter.lat.toFixed(6)}° N</div>
                    <div>Longitude : {activeCenter.lng.toFixed(6)}° O</div>
                    <div>Précision : ±{activeCenter.accuracy.toFixed(1)} m</div>
                    {selectedPdv.captured_at && (
                      <div className="text-[10px] text-slate-500 pt-0.5">
                        Horodatage : {selectedPdv.captured_at}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                {isVendeur
                  ? `Seuls les points de vente que vous avez créés (${visiblePdvs.length} PDV) sont visibles sur votre carte.`
                  : 'Les marqueurs bleus sur la carte indiquent la position GPS en direct de chaque vendeur.'}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              {isVendeur
                ? 'Sélectionnez un de vos points de vente sur la carte'
                : 'Sélectionnez un point de vente ou un vendeur sur la carte'}
            </div>
          )}
        </div>
      </div>

      {/* SECTION ADMINISTRATEUR : TABLEAU COMPLET DE L'HISTORIQUE DES TRAJETS DE CHAQUE VENDEUR */}
      {isAdmin && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#008DA9]" />
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Historique Complet du Trajet GPS de Chaque Vendeur (Réservé Administrateur)
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Consultez l'itinéraire chronologique exact de chaque vendeur (points enregistrés en direct ou hors-ligne puis synchronisés).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
              {mergedVendorPositions.map((v) => (
                <button
                  key={v.vendor_id}
                  type="button"
                  onClick={() => {
                    setSelectedVendorId(v.vendor_id);
                    setMapMode('trajets');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                    selectedVendorId === v.vendor_id
                      ? 'bg-[#008DA9] text-white border-[#008DA9]'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {v.vendor_name} ({v.vendor_code})
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Cards (< 640px) */}
          <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {selectedVendorTrajectory.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Aucun point de trajet enregistré pour ce filtre.
              </div>
            ) : (
              selectedVendorTrajectory.map((pt, idx) => (
                <div key={pt.id} className="p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-[#008DA9]">
                      Étape #{idx + 1} &bull; {selectedVendorInfo?.vendor_name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {String(pt.recorded_at || '').replace('T', ' ').slice(0, 19)}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {pt.activity_label}
                    {pt.pdv_name && (
                      <span className="block text-[11px] text-slate-500 font-normal">
                        PDV : {pt.pdv_name} ({pt.pdv_neighborhood})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
                    <span>
                      {Number(pt.latitude).toFixed(5)}° N, {Number(pt.longitude).toFixed(5)}° O
                    </span>
                    <span>
                      ±{Number(pt.accuracy || 4.0).toFixed(1)}m &bull; {Number(pt.speed_kmh || 0)} km/h
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Tablet & Desktop Table (>= 640px) — Sans débordement */}
          <div className="hidden sm:block">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                  <th className="py-3 px-3">Étape &amp; Horodatage</th>
                  <th className="py-3 px-3">Vendeur &amp; Activité</th>
                  <th className="py-3 px-3">Coordonnées GPS &amp; Précision</th>
                  <th className="py-3 px-3 text-center">Mode Synchro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedVendorTrajectory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Aucun point de trajet enregistré pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  selectedVendorTrajectory.map((pt, idx) => (
                    <tr key={pt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3">
                        <span className="font-mono font-black text-[#008DA9]">#{idx + 1}</span>
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {String(pt.recorded_at || '').replace('T', ' ').slice(0, 19)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {selectedVendorInfo?.vendor_name}{' '}
                          <span className="font-mono text-[10px] text-[#008DA9]">
                            ({selectedVendorInfo?.vendor_code})
                          </span>
                        </div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                          {pt.activity_label}
                        </div>
                        {pt.pdv_name && (
                          <div className="text-[10px] text-slate-400">
                            PDV : {pt.pdv_name} ({pt.pdv_neighborhood})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-slate-700 dark:text-slate-300">
                          {Number(pt.latitude).toFixed(6)}° N, {Number(pt.longitude).toFixed(6)}° O
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Précision ±{Number(pt.accuracy || 4.0).toFixed(1)} m &bull; Vitesse {Number(pt.speed_kmh || 0)} km/h
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {pt.isPendingLocal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <Clock className="w-3 h-3" /> Hors-ligne (En attente)
                          </span>
                        ) : pt.recorded_offline ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                            <CheckCircle2 className="w-3 h-3" /> Hors-Ligne • Synchro
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Wifi className="w-3 h-3" /> En ligne (Direct GPS)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
