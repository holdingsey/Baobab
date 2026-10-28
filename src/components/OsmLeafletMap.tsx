import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface OsmMarkerItem {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  title: string;
  subtitle?: string;
  status?: 'valide' | 'en_attente' | 'rejete' | 'capture';
  capturedAt?: string;
}

export interface OsmVendorMarkerItem {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  team?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speedKmh?: number;
  activityLabel?: string;
  recordedAt?: string;
  recordedOffline?: boolean;
  isPendingLocal?: boolean;
}

export interface OsmTrajectoryPoint {
  id: string;
  lat: number;
  lng: number;
  stepNumber: number;
  title: string;
  subtitle?: string;
  recordedAt: string;
  recordedOffline?: boolean;
  speedKmh?: number;
  colorHex?: string;
}

interface OsmLeafletMapProps {
  centerLat: number;
  centerLng: number;
  accuracy?: number;
  zoom?: number;
  heightClassName?: string;
  label?: string;
  sublabel?: string;
  markers?: OsmMarkerItem[];
  vendorMarkers?: OsmVendorMarkerItem[];
  trajectoryPoints?: OsmTrajectoryPoint[];
  trajectoryColor?: string;
  selectedId?: string;
  onSelectMarker?: (id: string) => void;
  onSelectVendor?: (vendorId: string) => void;
}

export const OsmLeafletMap: React.FC<OsmLeafletMapProps> = ({
  centerLat,
  centerLng,
  accuracy = 5,
  zoom = 15,
  heightClassName = 'h-60',
  label = 'Position GPS Précise (PDV)',
  sublabel,
  markers,
  vendorMarkers,
  trajectoryPoints,
  trajectoryColor = '#008DA9',
  selectedId,
  onSelectMarker,
  onSelectVendor,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet Map with OpenStreetMap tile layer
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = group;

      setTimeout(() => {
        map.invalidateSize();
      }, 120);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  // Update markers, vendor positions, and route polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const createPinIcon = (colorHex: string, isSelected: boolean) => {
      const size = isSelected ? 34 : 26;
      return L.divIcon({
        className: 'custom-osm-pin',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${colorHex};
            border: 3px solid #ffffff;
            border-radius: 9999px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 900;
            font-size: 12px;
            transform: translate(-50%, -50%);
          ">
            <span style="width:8px;height:8px;border-radius:9999px;background:#ffffff;display:block;"></span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
    };

    const createVendorIcon = (v: OsmVendorMarkerItem, isSelected: boolean) => {
      const bg = v.isPendingLocal ? '#D97706' : '#0284C7';
      const border = isSelected ? '#FACC15' : '#FFFFFF';
      const shortCode = v.vendorCode.replace('BAO-', '');
      return L.divIcon({
        className: 'custom-osm-vendor-pin',
        html: `
          <div style="
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: auto;
          ">
            <div style="
              background: ${bg};
              color: #ffffff;
              border: 2.5px solid ${border};
              border-radius: 9999px;
              padding: 3px 8px;
              font-family: system-ui, sans-serif;
              font-size: 10px;
              font-weight: 900;
              white-space: nowrap;
              box-shadow: 0 6px 14px rgba(0,0,0,0.4);
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span style="width:7px;height:7px;border-radius:9999px;background:#38BDF8;display:inline-block;"></span>
              <span>${shortCode}</span>
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
    };

    const createStepIcon = (stepNumber: number, isStart: boolean, isEnd: boolean, isOffline: boolean) => {
      const bg = isEnd ? '#008DA9' : isStart ? '#0F172A' : isOffline ? '#D97706' : '#0D9488';
      const size = isEnd || isStart ? 28 : 24;
      return L.divIcon({
        className: 'custom-osm-step-pin',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${bg};
            border: 2.5px solid #ffffff;
            border-radius: 9999px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-family: monospace;
            font-weight: 900;
            font-size: 11px;
            transform: translate(-50%, -50%);
          ">
            ${stepNumber}
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
    };

    const hasCustomLayers =
      (markers && markers.length > 0) ||
      (vendorMarkers && vendorMarkers.length > 0) ||
      (trajectoryPoints && trajectoryPoints.length > 0);

    // 1. Draw trajectory polyline & numbered waypoints if present
    if (trajectoryPoints && trajectoryPoints.length > 0) {
      const latLngs: [number, number][] = trajectoryPoints.map((pt) => [pt.lat, pt.lng]);

      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: trajectoryColor,
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 6',
        }).addTo(group);
      }

      trajectoryPoints.forEach((pt, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === trajectoryPoints.length - 1;
        const stepMarker = L.marker([pt.lat, pt.lng], {
          icon: createStepIcon(pt.stepNumber, isStart, isEnd, Boolean(pt.recordedOffline)),
        }).addTo(group);

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 190px;">
            <div style="font-weight: 800; color: #0f172a;">Étape #${pt.stepNumber} — ${pt.title}</div>
            ${pt.subtitle ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">${pt.subtitle}</div>` : ''}
            <div style="margin-top: 4px; font-family: monospace; font-size: 11px; color: #008DA9; font-weight: 700;">
              GPS: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
              Horodatage : ${pt.recordedAt.replace('T', ' ').slice(0, 19)}
            </div>
            <div style="font-size: 10px; font-weight: 700; color: ${pt.recordedOffline ? '#D97706' : '#059669'}; margin-top: 2px;">
              ${pt.recordedOffline ? 'Enregistré hors-ligne puis synchronisé' : 'Enregistré en ligne (Direct GPS)'}
            </div>
          </div>
        `;
        stepMarker.bindPopup(popupHtml);
      });
    }

    // 2. Draw PDV markers if present
    if (markers && markers.length > 0) {
      markers.forEach((m) => {
        const isSelected = m.id === selectedId;
        const color =
          m.status === 'valide'
            ? '#15803D'
            : m.status === 'rejete'
            ? '#B91C1C'
            : m.status === 'en_attente'
            ? '#D97706'
            : '#008DA9';

        const marker = L.marker([m.lat, m.lng], {
          icon: createPinIcon(color, isSelected),
        }).addTo(group);

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 170px;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 2px;">${m.title}</div>
            ${m.subtitle ? `<div style="color: #475569; font-size: 11px;">${m.subtitle}</div>` : ''}
            <div style="margin-top: 4px; font-family: monospace; font-size: 11px; color: #008DA9; font-weight: 700;">
              GPS: ${m.lat.toFixed(6)}, ${m.lng.toFixed(6)}
            </div>
            ${m.accuracy ? `<div style="font-size: 10px; color: #64748b;">Précision : ±${m.accuracy.toFixed(1)} m</div>` : ''}
            ${m.capturedAt ? `<div style="font-size: 10px; color: #64748b;">Capturé : ${m.capturedAt}</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupHtml);

        if (onSelectMarker) {
          marker.on('click', () => onSelectMarker(m.id));
        }

        if (isSelected) {
          L.circle([m.lat, m.lng], {
            radius: Math.max(m.accuracy || 8, 8),
            color: '#008DA9',
            fillColor: '#008DA9',
            fillOpacity: 0.18,
            weight: 2,
          }).addTo(group);
        }
      });
    }

    // 3. Draw Live Vendor GPS Markers if present
    if (vendorMarkers && vendorMarkers.length > 0) {
      vendorMarkers.forEach((v) => {
        const isSelected = v.vendorId === selectedId;
        const vMarker = L.marker([v.lat, v.lng], {
          icon: createVendorIcon(v, isSelected),
        }).addTo(group);

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 195px;">
            <div style="font-weight: 900; color: #0284C7;">Vendeur : ${v.vendorName} (${v.vendorCode})</div>
            ${v.team ? `<div style="color: #475569; font-size: 11px;">${v.team}</div>` : ''}
            ${v.activityLabel ? `<div style="color: #0f172a; font-size: 11px; font-weight: 700; margin-top: 3px;">${v.activityLabel}</div>` : ''}
            <div style="margin-top: 4px; font-family: monospace; font-size: 11px; color: #008DA9; font-weight: 700;">
              Lat: ${v.lat.toFixed(6)}° N | Lng: ${v.lng.toFixed(6)}° O
            </div>
            <div style="font-size: 10px; color: #64748b;">
              Précision : ±${(v.accuracy || 4.0).toFixed(1)} m ${v.speedKmh ? `• Vitesse : ${v.speedKmh} km/h` : ''}
            </div>
            ${v.recordedAt ? `<div style="font-size: 10px; color: #64748b;">Horodatage : ${v.recordedAt.replace('T', ' ').slice(0, 19)}</div>` : ''}
            <div style="font-size: 10px; font-weight: 700; color: ${v.isPendingLocal ? '#D97706' : v.recordedOffline ? '#0D9488' : '#059669'}; margin-top: 2px;">
              ${
                v.isPendingLocal
                  ? 'En attente de synchro (Hors-ligne)'
                  : v.recordedOffline
                  ? 'Capturé hors-ligne • Synchronisé'
                  : 'Position GPS en direct (Synchronisée)'
              }
            </div>
          </div>
        `;
        vMarker.bindPopup(popupHtml);

        if (onSelectVendor) {
          vMarker.on('click', () => onSelectVendor(v.vendorId));
        }

        L.circle([v.lat, v.lng], {
          radius: Math.max(v.accuracy || 15, 15),
          color: v.isPendingLocal ? '#D97706' : '#0284C7',
          fillColor: v.isPendingLocal ? '#D97706' : '#0284C7',
          fillOpacity: 0.14,
          weight: 1.5,
        }).addTo(group);
      });
    }

    if (hasCustomLayers) {
      map.setView([centerLat, centerLng], zoom, { animate: true });
    } else {
      // Single precise GPS point mode
      L.circle([centerLat, centerLng], {
        radius: Math.max(accuracy, 6),
        color: '#008DA9',
        fillColor: '#008DA9',
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(group);

      const singleMarker = L.marker([centerLat, centerLng], {
        icon: createPinIcon('#008DA9', true),
      }).addTo(group);

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; min-width: 180px;">
          <div style="font-weight: 800; color: #0f172a;">${label}</div>
          ${sublabel ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">${sublabel}</div>` : ''}
          <div style="margin-top: 4px; font-family: monospace; font-size: 11px; color: #008DA9; font-weight: 700;">
            Lat: ${centerLat.toFixed(6)}° N<br/>Lng: ${centerLng.toFixed(6)}° O
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            Précision GPS : ±${accuracy.toFixed(1)} m (OpenStreetMap)
          </div>
        </div>
      `;
      singleMarker.bindPopup(popupHtml).openPopup();
      map.setView([centerLat, centerLng], zoom, { animate: true });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 80);
  }, [centerLat, centerLng, accuracy, zoom, label, sublabel, markers, vendorMarkers, trajectoryPoints, trajectoryColor, selectedId]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner bg-slate-100 dark:bg-slate-800">
      <div ref={mapContainerRef} className={`w-full ${heightClassName} z-0`} />
      <div className="bg-slate-900/90 text-white px-3 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-bold text-cyan-300">
          OSM Leaflet &bull; Lat: {centerLat.toFixed(6)} | Lng: {centerLng.toFixed(6)} (±{accuracy.toFixed(1)}m)
        </span>
        <span className="text-[10px] text-slate-300">OpenStreetMap Direct • Suivi GPS PDV &amp; Vendeurs</span>
      </div>
    </div>
  );
};
