export interface OfflineSaleRecord {
  id: string;
  number: string;
  date: string;
  sale_time?: string;
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  vendor_team?: string;
  pdv_id: string;
  pdv_name: string;
  pdv_neighborhood: string;
  pdv_phone?: string;
  items: Array<{
    productId: string;
    code: string;
    name: string;
    qtyBoxes: number;
    unitPrice: number;
    total: number;
  }>;
  total_amount: number;
  payment_type: string;
  latitude?: number;
  longitude?: number;
  recorded_offline: number;
  offline_recorded_at: string;
  status: string;
}

export interface OfflineGpsRecord {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  vendor_code?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed_kmh: number;
  activity_label: string;
  pdv_id?: string | null;
  recorded_offline: number;
  recorded_at: string;
  date: string;
}

const OFFLINE_SALES_KEY = 'baobab_offline_sales_queue_v1';
const OFFLINE_GPS_KEY = 'baobab_offline_gps_queue_v1';
const SIMULATED_OFFLINE_KEY = 'baobab_simulated_offline_v1';
const LAST_SYNC_INFO_KEY = 'baobab_last_sync_info_v1';

export function isSimulatedOffline(): boolean {
  try {
    return localStorage.getItem(SIMULATED_OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSimulatedOffline(offline: boolean): void {
  try {
    localStorage.setItem(SIMULATED_OFFLINE_KEY, offline ? '1' : '0');
    window.dispatchEvent(new CustomEvent('baobab-network-change', { detail: { offline } }));
    if (!offline) {
      window.dispatchEvent(new Event('online'));
    }
  } catch {
    // ignore storage errors
  }
}

export function isAppOnline(): boolean {
  if (isSimulatedOffline()) return false;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function getOfflineSalesQueue(): OfflineSaleRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SALES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSale(sale: OfflineSaleRecord): OfflineSaleRecord[] {
  try {
    const current = getOfflineSalesQueue();
    const updated = [sale, ...current.filter((s) => s.id !== sale.id)];
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('baobab-queue-updated'));
    return updated;
  } catch {
    return [];
  }
}

export function clearOfflineSalesQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_SALES_KEY);
    window.dispatchEvent(new CustomEvent('baobab-queue-updated'));
  } catch {
    // ignore
  }
}

export function getOfflineGpsQueue(): OfflineGpsRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_GPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineGpsPosition(pos: OfflineGpsRecord): OfflineGpsRecord[] {
  try {
    const current = getOfflineGpsQueue();
    const updated = [...current, pos];
    localStorage.setItem(OFFLINE_GPS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('baobab-queue-updated'));
    return updated;
  } catch {
    return [];
  }
}

export function clearOfflineGpsQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_GPS_KEY);
    window.dispatchEvent(new CustomEvent('baobab-queue-updated'));
  } catch {
    // ignore
  }
}

export interface SyncResultSummary {
  syncedAt: string;
  syncedSalesCount: number;
  syncedGpsCount: number;
  message: string;
}

export function getLastSyncInfo(): SyncResultSummary | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let isSyncInProgress = false;

export async function syncPendingOfflineData(userRole = 'Vendeur'): Promise<SyncResultSummary | null> {
  if (!isAppOnline() || isSyncInProgress) return null;

  const pendingSales = getOfflineSalesQueue();
  const pendingGps = getOfflineGpsQueue();

  if (pendingSales.length === 0 && pendingGps.length === 0) {
    return null;
  }

  isSyncInProgress = true;
  try {
    const res = await fetch('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
      },
      body: JSON.stringify({
        offlineSales: pendingSales,
        offlineGpsPositions: pendingGps,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data && data.success) {
      clearOfflineSalesQueue();
      clearOfflineGpsQueue();
      const summary: SyncResultSummary = {
        syncedAt: new Date().toISOString(),
        syncedSalesCount: Number(data.syncedSalesCount ?? pendingSales.length),
        syncedGpsCount: Number(data.syncedGpsCount ?? pendingGps.length),
        message:
          data.message ||
          `Synchronisation réussie : ${pendingSales.length} vente(s) et ${pendingGps.length} position(s) GPS synchronisées.`,
      };
      localStorage.setItem(LAST_SYNC_INFO_KEY, JSON.stringify(summary));
      window.dispatchEvent(new CustomEvent('baobab-sync-completed', { detail: summary }));
      return summary;
    }
    return null;
  } catch {
    return null;
  } finally {
    isSyncInProgress = false;
  }
}
