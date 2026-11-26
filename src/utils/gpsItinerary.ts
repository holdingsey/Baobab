export interface RouteStepItem {
  stepNumber: number;
  instruction: string;
  distanceLabel: string;
  durationLabel: string;
  roadName?: string;
}

export interface ComputedGpsItinerary {
  originLat: number;
  originLng: number;
  originLabel: string;
  destLat: number;
  destLng: number;
  destLabel: string;
  distanceKm: number;
  durationVehicleMin: number;
  durationMotoMin: number;
  compassDirection: string;
  source: 'osrm_live' | 'bamako_road_engine';
  polyline: [number, number][];
  steps: RouteStepItem[];
  googleMapsUrl: string;
  osmDirectionsUrl: string;
  wazeUrl: string;
}

export interface DeparturePreset {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lng: number;
  neighborhood: string;
}

export const BAMAKO_DEPARTURE_PRESETS: DeparturePreset[] = [
  {
    id: 'depot_sotuba',
    label: 'Dépôt Central Baobab Distribution (Sotuba)',
    shortLabel: 'Dépôt Sotuba',
    lat: 12.660842,
    lng: -7.935218,
    neighborhood: 'Sotuba',
  },
  {
    id: 'direction_aci2000',
    label: 'Bureau Direction Ventes DOV (ACI 2000)',
    shortLabel: 'Direction ACI 2000',
    lat: 12.633128,
    lng: -8.026845,
    neighborhood: 'ACI 2000',
  },
  {
    id: 'antenne_badalabougou',
    label: 'Antenne Rive Droite (Badalabougou)',
    shortLabel: 'Badalabougou',
    lat: 12.617415,
    lng: -7.989632,
    neighborhood: 'Badalabougou',
  },
  {
    id: 'centre_bozola',
    label: 'Centre Commercial Bozola (Grand Marché)',
    shortLabel: 'Grand Marché Bozola',
    lat: 12.645804,
    lng: -7.994211,
    neighborhood: 'Bozola',
  },
];

export function computeHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

export function computeCompassDirection(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const angle = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  if (angle >= 337.5 || angle < 22.5) return 'Nord';
  if (angle >= 22.5 && angle < 67.5) return 'Nord-Est';
  if (angle >= 67.5 && angle < 112.5) return 'Est';
  if (angle >= 112.5 && angle < 157.5) return 'Sud-Est';
  if (angle >= 157.5 && angle < 202.5) return 'Sud';
  if (angle >= 202.5 && angle < 247.5) return 'Sud-Ouest';
  if (angle >= 247.5 && angle < 292.5) return 'Ouest';
  return 'Nord-Ouest';
}

function formatStepDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatStepDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  return `${min} min`;
}

function translateOsrmManeuver(step: any, idx: number, totalSteps: number, originLabel: string, destLabel: string): string {
  if (idx === 0) {
    const road = step?.name ? ` sur ${step.name}` : '';
    return `Quitter ${originLabel} et s'engager${road}`;
  }
  if (idx === totalSteps - 1) {
    return `Arrivée au point de vente : ${destLabel}`;
  }
  const type = step?.maneuver?.type || '';
  const modifier = step?.maneuver?.modifier || '';
  const roadName = step?.name ? ` sur ${step.name}` : ' sur la voie principale';

  const modFr =
    modifier.includes('left')
      ? 'à gauche'
      : modifier.includes('right')
      ? 'à droite'
      : modifier.includes('straight')
      ? 'tout droit'
      : '';

  if (type === 'turn') {
    return `Tourner ${modFr || 'à l’intersection'}${roadName}`;
  }
  if (type === 'roundabout' || type === 'rotary') {
    return `Prendre le rond-point et continuer${roadName}`;
  }
  if (type === 'merge' || type === 'on ramp') {
    return `Rejoindre l'axe principal${roadName}`;
  }
  if (type === 'fork') {
    return `Rester ${modFr || 'sur la voie'}${roadName}`;
  }
  return `Continuer ${modFr || 'tout droit'}${roadName}`;
}

function buildBamakoFallbackRoute(
  originLat: number,
  originLng: number,
  originLabel: string,
  destLat: number,
  destLng: number,
  destName: string,
  destNeighborhood: string
): ComputedGpsItinerary {
  const straightKm = computeHaversineKm(originLat, originLng, destLat, destLng);
  const roadDistanceKm = Number(Math.max(0.25, straightKm * 1.28).toFixed(2));
  const durationVehicleMin = Math.max(2, Math.round((roadDistanceKm / 26) * 60));
  const durationMotoMin = Math.max(2, Math.round((roadDistanceKm / 34) * 60));
  const compassDirection = computeCompassDirection(originLat, originLng, destLat, destLng);

  // Detect if route crosses the Niger River in Bamako (roughly latitude ~12.625 - 12.640)
  const originRiveGauche = originLat >= 12.63;
  const destRiveGauche = destLat >= 12.63;
  const crossesRiver = originRiveGauche !== destRiveGauche;

  const polyline: [number, number][] = [[originLat, originLng]];
  const steps: RouteStepItem[] = [];

  if (crossesRiver) {
    // Choose closest bridge in Bamako: 3e Pont (Sotuba) vs Pont des Martyrs / Pont Roi Fahd
    const useThirdBridge = (originLng + destLng) / 2 > -7.955;
    const bridgeName = useThirdBridge ? '3e Pont de Bamako (Pont de l’Amitié Sino-Malienne)' : 'Pont Roi Fahd / Pont des Martyrs';
    const bridgeNorth: [number, number] = useThirdBridge ? [12.6465, -7.9348] : [12.6378, -7.9942];
    const bridgeSouth: [number, number] = useThirdBridge ? [12.6245, -7.9355] : [12.6218, -7.9912];

    const wp1 = originRiveGauche ? bridgeNorth : bridgeSouth;
    const wp2 = originRiveGauche ? bridgeSouth : bridgeNorth;

    const mid1: [number, number] = [
      Number((originLat * 0.55 + wp1[0] * 0.45).toFixed(6)),
      Number((originLng * 0.45 + wp1[1] * 0.55).toFixed(6)),
    ];
    const mid2: [number, number] = [
      Number((wp2[0] * 0.45 + destLat * 0.55).toFixed(6)),
      Number((wp2[1] * 0.55 + destLng * 0.45).toFixed(6)),
    ];

    polyline.push(mid1, wp1, wp2, mid2, [destLat, destLng]);

    const seg1Meters = roadDistanceKm * 1000 * 0.35;
    const seg2Meters = roadDistanceKm * 1000 * 0.25;
    const seg3Meters = roadDistanceKm * 1000 * 0.4;

    steps.push(
      {
        stepNumber: 1,
        instruction: `Départ depuis ${originLabel} en direction ${compassDirection}`,
        distanceLabel: formatStepDistance(seg1Meters * 0.5),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.2),
      },
      {
        stepNumber: 2,
        instruction: `Rejoindre l'axe principal vers le ${bridgeName}`,
        distanceLabel: formatStepDistance(seg1Meters * 0.5),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.2),
      },
      {
        stepNumber: 3,
        instruction: `Traverser le fleuve Niger par le ${bridgeName}`,
        distanceLabel: formatStepDistance(seg2Meters),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.25),
      },
      {
        stepNumber: 4,
        instruction: `Continuer vers le quartier ${destNeighborhood || 'du PDV'} et suivre l'avenue principale`,
        distanceLabel: formatStepDistance(seg3Meters),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.35),
      },
      {
        stepNumber: 5,
        instruction: `Arrivée pour visite physique au PDV « ${destName} » (${destNeighborhood})`,
        distanceLabel: '0 m',
        durationLabel: 'Arrivée',
      }
    );
  } else {
    // Same bank route with realistic street waypoints
    const wp1: [number, number] = [
      Number((originLat + (destLat - originLat) * 0.33 + 0.0012).toFixed(6)),
      Number((originLng + (destLng - originLng) * 0.28).toFixed(6)),
    ];
    const wp2: [number, number] = [
      Number((originLat + (destLat - originLat) * 0.72).toFixed(6)),
      Number((originLng + (destLng - originLng) * 0.68 - 0.001).toFixed(6)),
    ];
    polyline.push(wp1, wp2, [destLat, destLng]);

    const totalMeters = roadDistanceKm * 1000;
    steps.push(
      {
        stepNumber: 1,
        instruction: `Quitter ${originLabel} (cap ${compassDirection})`,
        distanceLabel: formatStepDistance(totalMeters * 0.3),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.3),
      },
      {
        stepNumber: 2,
        instruction: `Prendre l'axe principal en direction du quartier ${destNeighborhood || 'Bamako'}`,
        distanceLabel: formatStepDistance(totalMeters * 0.45),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.45),
      },
      {
        stepNumber: 3,
        instruction: `Entrer dans le secteur ${destNeighborhood} jusqu'aux coordonnées GPS ${destLat.toFixed(5)}, ${destLng.toFixed(5)}`,
        distanceLabel: formatStepDistance(totalMeters * 0.25),
        durationLabel: formatStepDuration((durationVehicleMin * 60) * 0.25),
      },
      {
        stepNumber: 4,
        instruction: `Arrivée au PDV « ${destName} » pour visite physique DOV`,
        distanceLabel: '0 m',
        durationLabel: 'Arrivée',
      }
    );
  }

  return {
    originLat,
    originLng,
    originLabel,
    destLat,
    destLng,
    destLabel: `${destName} (${destNeighborhood})`,
    distanceKm: roadDistanceKm,
    durationVehicleMin,
    durationMotoMin,
    compassDirection,
    source: 'bamako_road_engine',
    polyline,
    steps,
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`,
    osmDirectionsUrl: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${originLat}%2C${originLng}%3B${destLat}%2C${destLng}`,
    wazeUrl: `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`,
  };
}

export async function calculateGpsItineraryToPdv(params: {
  originLat: number;
  originLng: number;
  originLabel: string;
  destLat: number;
  destLng: number;
  destName: string;
  destNeighborhood: string;
}): Promise<ComputedGpsItinerary> {
  const { originLat, originLng, originLabel, destLat, destLng, destName, destNeighborhood } = params;
  const fallback = buildBamakoFallbackRoute(
    originLat,
    originLng,
    originLabel,
    destLat,
    destLng,
    destName,
    destNeighborhood
  );

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fallback;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2400);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return fallback;
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) {
      return fallback;
    }

    const polyline: [number, number][] = route.geometry.coordinates.map((coord: [number, number]) => [
      Number(coord[1]),
      Number(coord[0]),
    ]);

    const distanceKm = Number(Math.max(0.1, Number(route.distance || 0) / 1000).toFixed(2));
    const durationVehicleMin = Math.max(1, Math.round(Number(route.duration || 120) / 60));
    const durationMotoMin = Math.max(1, Math.round(durationVehicleMin * 0.78));

    const rawSteps: any[] = route.legs?.[0]?.steps || [];
    const steps: RouteStepItem[] =
      rawSteps.length > 0
        ? rawSteps.slice(0, 10).map((st, idx, arr) => ({
            stepNumber: idx + 1,
            instruction: translateOsrmManeuver(st, idx, arr.length, originLabel, `${destName} (${destNeighborhood})`),
            distanceLabel: formatStepDistance(Number(st.distance || 0)),
            durationLabel: formatStepDuration(Number(st.duration || 0)),
            roadName: st.name || undefined,
          }))
        : fallback.steps;

    return {
      ...fallback,
      distanceKm,
      durationVehicleMin,
      durationMotoMin,
      source: 'osrm_live',
      polyline,
      steps,
    };
  } catch {
    clearTimeout(timeoutId);
    return fallback;
  }
}

export function resolveCurrentDovGpsPosition(
  defaultLat = 12.660842,
  defaultLng = -7.935218
): Promise<{ lat: number; lng: number; accuracy: number; isHardware: boolean }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ lat: defaultLat, lng: defaultLng, accuracy: 4.5, isHardware: false });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ lat: defaultLat, lng: defaultLng, accuracy: 4.5, isHardware: false });
      }
    }, 650);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number((pos.coords.accuracy || 4.0).toFixed(1)),
            isHardware: true,
          });
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ lat: defaultLat, lng: defaultLng, accuracy: 4.5, isHardware: false });
        }
      },
      { enableHighAccuracy: false, timeout: 600, maximumAge: 60000 }
    );
  });
}
