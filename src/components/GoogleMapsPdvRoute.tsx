/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Navigation, Route as RouteIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { RouteStepItem } from '../utils/gpsItinerary';

declare const google: any;

export interface GoogleMapsComputedRouteSummary {
  distanceKm: number;
  durationMin: number;
  durationLabel: string;
  distanceLabel: string;
  steps: RouteStepItem[];
  source: 'google_maps_routes_api' | 'fallback_polyline';
}

export interface GoogleMapsPdvRouteProps {
  originLat: number;
  originLng: number;
  originLabel: string;
  destLat: number;
  destLng: number;
  destName: string;
  destCode?: string;
  destNeighborhood?: string;
  destManager?: string;
  vendorCreator?: string;
  travelMode?: 'DRIVING' | 'WALKING';
  fallbackPolyline?: [number, number][];
  heightClassName?: string;
  onRouteCalculated?: (summary: GoogleMapsComputedRouteSummary) => void;
}

function getGoogleMapsApiKey(): string {
  const viteKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  if (viteKey && typeof viteKey === 'string' && viteKey.trim().length > 0) {
    return viteKey.trim();
  }
  const procKey = typeof process !== 'undefined' ? (process.env as any)?.GOOGLE_MAPS_API_KEY : '';
  if (procKey && typeof procKey === 'string' && procKey.trim().length > 0) {
    return procKey.trim();
  }
  const globalKey = (globalThis as any).GOOGLE_MAPS_API_KEY;
  if (globalKey && typeof globalKey === 'string' && globalKey.trim().length > 0) {
    return globalKey.trim();
  }
  return '';
}

function formatDurationMinutes(durationMillis: number): { min: number; label: string } {
  const min = Math.max(1, Math.round(durationMillis / 60000));
  if (min < 60) {
    return { min, label: `${min} min` };
  }
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return { min, label: rem > 0 ? `${hrs} h ${rem} min` : `${hrs} h` };
}

function formatDistanceMeters(distanceMeters: number): { km: number; label: string } {
  const km = Number((distanceMeters / 1000).toFixed(2));
  if (distanceMeters < 1000) {
    return { km, label: `${Math.round(distanceMeters)} m` };
  }
  return { km, label: `${km} km` };
}

interface InnerRouteRendererProps {
  originLat: number;
  originLng: number;
  originLabel: string;
  destLat: number;
  destLng: number;
  destName: string;
  travelMode: 'DRIVING' | 'WALKING';
  fallbackPolyline?: [number, number][];
  onRouteCalculated?: (summary: GoogleMapsComputedRouteSummary) => void;
  onStatusUpdate: (status: { loading: boolean; mode: 'google_routes' | 'fallback'; message: string }) => void;
}

const InnerGoogleRouteRenderer: React.FC<InnerRouteRendererProps> = ({
  originLat,
  originLng,
  destLat,
  destLng,
  destName,
  travelMode,
  fallbackPolyline,
  onRouteCalculated,
  onStatusUpdate,
}) => {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const polylinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!map || !routesLibrary) return;

    let cancelled = false;

    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => {
        if (p && typeof p.setMap === 'function') {
          p.setMap(null);
        }
      });
      polylinesRef.current = [];
    };

    const drawFallbackPolyline = (reasonMsg: string) => {
      if (cancelled || !map || typeof google === 'undefined' || !google?.maps) return;
      clearPolylines();

      const pathCoords: Array<{ lat: number; lng: number }> =
        fallbackPolyline && fallbackPolyline.length >= 2
          ? fallbackPolyline.map(([lat, lng]) => ({ lat, lng }))
          : [
              { lat: originLat, lng: originLng },
              { lat: destLat, lng: destLng },
            ];

      const haloLine = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: '#FFFFFF',
        strokeOpacity: 0.9,
        strokeWeight: 9,
        map,
      });

      const mainLine = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: '#008DA9',
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
      });

      polylinesRef.current = [haloLine, mainLine];

      const bounds = new google.maps.LatLngBounds();
      pathCoords.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 56);

      onStatusUpdate({
        loading: false,
        mode: 'fallback',
        message: reasonMsg,
      });
    };

    const computeGoogleRoute = async () => {
      clearPolylines();
      onStatusUpdate({
        loading: true,
        mode: 'google_routes',
        message: 'Calcul du tracé GPS Google Maps (Routes API)...',
      });

      const RouteClass = (routesLibrary as any).Route;
      if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') {
        drawFallbackPolyline('Tracé GPS affiché sur Google Maps');
        return;
      }

      try {
        const request = {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
        };

        const response = await RouteClass.computeRoutes(request);
        if (cancelled) return;

        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute) {
          drawFallbackPolyline('Itinéraire direct tracé sur Google Maps');
          return;
        }

        clearPolylines();

        let createdPolylines: any[] = [];
        if (typeof primaryRoute.createPolylines === 'function') {
          createdPolylines = primaryRoute.createPolylines() || [];
          createdPolylines.forEach((polyline: any) => {
            polyline.setOptions({
              map,
              strokeColor: '#008DA9',
              strokeOpacity: 0.95,
              strokeWeight: 6,
            });
          });
        }

        if (
          createdPolylines.length === 0 &&
          Array.isArray(primaryRoute.path) &&
          primaryRoute.path.length > 0 &&
          typeof google !== 'undefined' &&
          google?.maps
        ) {
          const halo = new google.maps.Polyline({
            path: primaryRoute.path,
            map,
            strokeColor: '#FFFFFF',
            strokeOpacity: 0.9,
            strokeWeight: 9,
          });
          const main = new google.maps.Polyline({
            path: primaryRoute.path,
            map,
            strokeColor: '#008DA9',
            strokeOpacity: 0.95,
            strokeWeight: 6,
          });
          createdPolylines = [halo, main];
        }

        polylinesRef.current = createdPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 48);
        } else if (typeof google !== 'undefined' && google?.maps) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend({ lat: originLat, lng: originLng });
          bounds.extend({ lat: destLat, lng: destLng });
          map.fitBounds(bounds, 56);
        }

        const distanceMeters = Number(primaryRoute.distanceMeters || 0);
        const durationMillis = Number(primaryRoute.durationMillis || 0);
        const distFormatted = formatDistanceMeters(distanceMeters);
        const durFormatted = formatDurationMinutes(durationMillis);

        // Extract turn-by-turn steps from primaryRoute.legs[0].steps if available
        const rawSteps = primaryRoute.legs?.[0]?.steps || [];
        const parsedSteps: RouteStepItem[] =
          Array.isArray(rawSteps) && rawSteps.length > 0
            ? rawSteps.map((st: any, idx: number) => {
                const stepDist = Number(st.distanceMeters || st.distance?.value || 0);
                const stepDurMs = Number(st.staticDurationMillis || st.durationMillis || 60000);
                const instructionText =
                  st.instructions ||
                  st.navigationInstruction?.instructions ||
                  (idx === rawSteps.length - 1
                    ? `Arrivée au PDV « ${destName} »`
                    : `Continuer sur l'axe vers ${destName}`);
                return {
                  stepNumber: idx + 1,
                  instruction: String(instructionText).replace(/<[^>]+>/g, ''),
                  distanceLabel: formatDistanceMeters(stepDist).label,
                  durationLabel: formatDurationMinutes(stepDurMs).label,
                };
              })
            : [];

        if (onRouteCalculated && distanceMeters > 0) {
          onRouteCalculated({
            distanceKm: distFormatted.km,
            durationMin: durFormatted.min,
            durationLabel: durFormatted.label,
            distanceLabel: distFormatted.label,
            steps: parsedSteps,
            source: 'google_maps_routes_api',
          });
        }

        onStatusUpdate({
          loading: false,
          mode: 'google_routes',
          message: `Tracé Google Maps Routes API • ${distFormatted.label} (~${durFormatted.label})`,
        });
      } catch (err: any) {
        if (cancelled) return;
        const msg = String(err?.message || err?.code || err || '');
        if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QuotaExceeded|429/i.test(msg)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawFallbackPolyline('Tracé GPS actif sur Google Maps');
      }
    };

    computeGoogleRoute();

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [
    map,
    routesLibrary,
    originLat,
    originLng,
    destLat,
    destLng,
    destName,
    travelMode,
    fallbackPolyline,
    onRouteCalculated,
    onStatusUpdate,
  ]);

  return null;
};

export const GoogleMapsPdvRoute: React.FC<GoogleMapsPdvRouteProps> = ({
  originLat,
  originLng,
  originLabel,
  destLat,
  destLng,
  destName,
  destCode,
  destNeighborhood,
  destManager,
  vendorCreator,
  travelMode = 'DRIVING',
  fallbackPolyline,
  heightClassName = 'h-80',
  onRouteCalculated,
}) => {
  const apiKey = getGoogleMapsApiKey();
  const [selectedMarker, setSelectedMarker] = useState<'origin' | 'destination' | null>('destination');
  const [routeStatus, setRouteStatus] = useState<{
    loading: boolean;
    mode: 'google_routes' | 'fallback';
    message: string;
  }>({
    loading: true,
    mode: 'google_routes',
    message: 'Initialisation du tracé Google Maps...',
  });

  const centerLat = Number(((originLat + destLat) / 2).toFixed(6));
  const centerLng = Number(((originLng + destLng) / 2).toFixed(6));

  if (!apiKey) {
    const dirflg = travelMode === 'WALKING' ? 'w' : 'd';
    const embedDirectionUrl = `https://maps.google.com/maps?saddr=${originLat},${originLng}&daddr=${destLat},${destLng}&dirflg=${dirflg}&hl=fr&output=embed`;
    const externalGoogleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=${travelMode.toLowerCase()}`;

    return (
      <div className="rounded-2xl overflow-hidden border-2 border-[#008DA9]/40 bg-slate-900 shadow-sm">
        {/* Barre d'état supérieure Google Maps (Mode sans clé API) */}
        <div className="px-3.5 py-2 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-[11px] border-b border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#008DA9] text-white font-black text-[10px] uppercase tracking-wider">
              <RouteIcon className="w-3 h-3" />
              Google Maps Direct
            </span>
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Itinéraire Google Maps vers {destName} (sans clé API)</span>
            </span>
          </div>
          <a
            href={externalGoogleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#15803D] hover:bg-emerald-800 text-white font-bold text-[11px] transition-colors"
          >
            <Navigation className="w-3 h-3 shrink-0" />
            <span>Ouvrir dans Google Maps</span>
          </a>
        </div>

        {/* Carte Google Maps intégrée sans clé API */}
        <div className={`relative w-full ${heightClassName} bg-slate-100 dark:bg-slate-800`}>
          <iframe
            title={`Itinéraire Google Maps vers ${destName}`}
            src={embedDirectionUrl}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        {/* Légende bas de carte */}
        <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-3 h-3 rounded-full bg-slate-900 border-2 border-sky-400 inline-block" />
              <span>Départ : {originLabel} ({originLat.toFixed(4)}, {originLng.toFixed(4)})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-3 h-3 rounded-full bg-emerald-700 border-2 border-white inline-block" />
              <span>Arrivée PDV : {destName} ({destLat.toFixed(4)}, {destLng.toFixed(4)})</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1 font-bold text-[#008DA9] dark:text-cyan-400">
            <Navigation className="w-3 h-3" />
            <span>Mode : {travelMode === 'WALKING' ? 'Piéton' : 'Véhicule / Moto'}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-[#008DA9]/40 bg-slate-900 shadow-sm">
      {/* Barre d'état supérieure Google Maps API */}
      <div className="px-3.5 py-2 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-[11px] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#008DA9] text-white font-black text-[10px] uppercase tracking-wider">
            <RouteIcon className="w-3 h-3" />
            Google Maps API
          </span>
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            {routeStatus.loading ? (
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>{routeStatus.message}</span>
          </span>
        </div>
        <div className="font-mono text-[10px] text-cyan-300">
          Départ ({originLat.toFixed(4)}, {originLng.toFixed(4)}) → PDV ({destLat.toFixed(4)}, {destLng.toFixed(4)})
        </div>
      </div>

      {/* Conteneur de la carte Google Maps */}
      <div className={`relative w-full ${heightClassName}`}>
        <APIProvider apiKey={apiKey} language="fr" region="ML">
          <GoogleMap
            defaultCenter={{ lat: centerLat, lng: centerLng }}
            defaultZoom={13}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Calcul et tracé du chemin via Google Maps Routes API */}
            <InnerGoogleRouteRenderer
              originLat={originLat}
              originLng={originLng}
              originLabel={originLabel}
              destLat={destLat}
              destLng={destLng}
              destName={destName}
              travelMode={travelMode}
              fallbackPolyline={fallbackPolyline}
              onRouteCalculated={onRouteCalculated}
              onStatusUpdate={setRouteStatus}
            />

            {/* Marqueur de départ (Position actuelle du DOV) */}
            <AdvancedMarker
              position={{ lat: originLat, lng: originLng }}
              title={`Départ DOV : ${originLabel}`}
              onClick={() => setSelectedMarker('origin')}
            >
              <Pin background="#0F172A" borderColor="#38BDF8" glyphColor="#38BDF8" scale={1.1} />
            </AdvancedMarker>

            {/* Marqueur d'arrivée (PDV sélectionné) */}
            <AdvancedMarker
              position={{ lat: destLat, lng: destLng }}
              title={`Destination PDV : ${destName}`}
              onClick={() => setSelectedMarker('destination')}
            >
              <Pin background="#15803D" borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={1.2} />
            </AdvancedMarker>

            {selectedMarker === 'origin' && (
              <InfoWindow
                position={{ lat: originLat, lng: originLng }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-slate-900 text-xs max-w-[220px]">
                  <div className="font-black text-[#008DA9] uppercase text-[10px]">Point de départ DOV</div>
                  <div className="font-bold mt-0.5">{originLabel}</div>
                  <div className="font-mono text-[10px] text-slate-600 mt-0.5">
                    {originLat.toFixed(5)}° N, {originLng.toFixed(5)}° O
                  </div>
                </div>
              </InfoWindow>
            )}

            {selectedMarker === 'destination' && (
              <InfoWindow
                position={{ lat: destLat, lng: destLng }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-slate-900 text-xs max-w-[240px] space-y-0.5">
                  <div className="font-black text-emerald-700 uppercase text-[10px]">
                    PDV à visiter {destCode ? `• ${destCode}` : ''}
                  </div>
                  <div className="font-extrabold text-sm leading-tight">{destName}</div>
                  {destNeighborhood && (
                    <div className="text-[11px] text-slate-700">Quartier {destNeighborhood}, Bamako</div>
                  )}
                  {destManager && (
                    <div className="text-[11px] text-slate-600">Gérant : {destManager}</div>
                  )}
                  {vendorCreator && (
                    <div className="text-[10px] font-semibold text-[#008DA9]">
                      Créé par : {vendorCreator}
                    </div>
                  )}
                  <div className="font-mono text-[10px] text-slate-500 pt-0.5">
                    {destLat.toFixed(5)}° N, {destLng.toFixed(5)}° O
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>
      </div>

      {/* Légende bas de carte */}
      <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-3 rounded-full bg-slate-900 border-2 border-sky-400 inline-block" />
            <span>Départ : {originLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-3 rounded-full bg-emerald-700 border-2 border-white inline-block" />
            <span>Arrivée PDV : {destName}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="w-5 h-1.5 rounded bg-[#008DA9] inline-block" />
            <span>Chemin tracé via Google Maps</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 font-bold text-[#008DA9] dark:text-cyan-400">
          <Navigation className="w-3 h-3" />
          <span>Mode : {travelMode === 'WALKING' ? 'Piéton' : 'Véhicule / Moto'}</span>
        </span>
      </div>
    </div>
  );
};
