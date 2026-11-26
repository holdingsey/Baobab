import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  A4_DOCUMENT_LAYOUT_SPEC,
  exportOfficialInvoiceA4Pdf,
  exportThermalTicket80mmPdf,
  getExplicitDocumentPdfFilename,
  numberToFrenchWords,
  resolveDocumentParties,
} from '../utils/pdfExport';

/**
 * PALETTE STRICTE EXTRAITE DU LOGO BAOBAB DISTRIBUTION (/public/logo.png) :
 * 1. Bleu-turquoise du logo (--marque) : #008DA9 (filets, barre 2 mm, liserés cartes, titre du document)
 * 2. Bleu assombri même teinte 192° (--marque-fonce) : #006B82 (contraste 6.14:1 >= 4.5:1 pour aplats à texte blanc : en-tête tableau, TOTAL TTC, cachet ACQUITTÉE)
 * 3. Bleu à 8 % d'opacité (--marque-8pct) : rgba(0, 141, 169, 0.08) (fond des lignes alternées et des cartes)
 * 4. Noir du logo (--marque-noir) : #000000 (texte courant, noms, montants, cadres, séparations, pied de page, cachets À PAYER / ANNULÉE)
 * 5. Blanc : #FFFFFF (fond de la feuille et texte sur aplat bleu ou noir)
 */
const COLOR_MARQUE = '#008DA9';
const COLOR_MARQUE_APLAT = '#006B82';
const COLOR_MARQUE_8PCT = 'rgba(0, 141, 169, 0.08)';
const COLOR_NOIR = '#000000';
const COLOR_BLANC = '#FFFFFF';

export interface InvoiceItem {
  id?: string;
  code: string;
  description?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  unitPrice?: number;
  price?: number;
  total: number;
}

export interface InvoiceData {
  id: string;
  number: string;
  saleId?: string;
  saleNumber?: string;
  ticketNumber?: string;
  thermalTicketNumber?: string;
  invoiceNumber?: string;
  saleTime?: string;
  rawDate?: string;
  date: string;
  dueDate?: string;
  type:
    | 'invoice'
    | 'receipt'
    | 'facture'
    | 'recu'
    | 'recu_caisse'
    | 'recu_versement'
    | 'mini_thermique'
    | 'ticket'
    | 'ticket_thermique'
    | 'bon_cadeau'
    | 'demande_achat'
    | 'commande_gros'
    | 'facture_grossiste';
  docTypeTitle?: string;
  emitterTitle?: string;
  recipientTitle?: string;
  client?: {
    name: string;
    address: string;
    ninea?: string;
    phone?: string;
    contact?: string;
    zone?: string;
  };
  vendor?: {
    name: string;
    code: string;
    phone?: string;
  };
  vendorId?: string;
  clientName?: string;
  clientPhone?: string;
  vendorName?: string;
  vendorCode?: string;
  vendorTeam?: string;
  vendorPhone?: string;
  pdvName?: string;
  pdvCode?: string;
  pdvNeighborhood?: string;
  pdvManager?: string;
  pdvPhone?: string;
  versementRef?: string;
  cashierName?: string;
  isProofPreview?: boolean;
  withTva?: boolean;
  subtotal?: number;
  subtotalHt?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
  tvaRate?: number;
  taxAmount?: number;
  tvaAmount?: number;
  totalTtc?: number;
  total: number;
  amountPaid?: number;
  paymentMethod?: string;
  paymentRef?: string;
  status: string;
  buyerType?: string | null;
  buyer_type?: string | null;
  wholesaleDiscountAmount?: number;
  wholesale_discount_amount?: number;
  cajoucyBoxesCount?: number;
  cajoucy_boxes_count?: number;
  isAcquittee?: boolean;
  notes?: string;
  sigLeftLabel?: string;
  sigCenterLabel?: string;
  sigRightLabel?: string;
  items: InvoiceItem[];
  [key: string]: any;
}

export interface PrintableDocumentProps {
  document: InvoiceData | null;
  logoUrl?: string;
  currentRole?: string;
  onClose: () => void;
  onRequestRectification?: (doc: InvoiceData) => void;
}

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const THERMAL_WIDTH_PX = 302; // 80 mm à 96 dpi
const THERMAL_LOGO_WIDTH_PX = 151; // 40 mm à 96 dpi

interface NormalizedLineItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PageSlice {
  pageNumber: number;
  totalPages: number;
  items: { item: NormalizedLineItem; globalIndex: number }[];
  isLastPage: boolean;
}

export const PrintableDocument: React.FC<PrintableDocumentProps> = ({
  document: docDataProp,
  logoUrl = '/logo.png',
  currentRole,
  onClose,
  onRequestRectification,
}) => {
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [customZoom, setCustomZoom] = useState<number | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [syncedTicketDoc, setSyncedTicketDoc] = useState<InvoiceData | null>(null);

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);

  const docData = syncedTicketDoc || docDataProp;

  const isThermalTicket = useMemo(() => {
    if (!docData) return false;
    const t = String(docData.type || '').toLowerCase();
    // Le Vendeur ne consulte jamais de facture A4 : uniquement le ticket thermique 80 mm (hors reçu de versement et bon cadeau)
    if (
      currentRole === 'Vendeur' &&
      (t === 'facture' || t === 'invoice' || t === 'facture_grossiste' || t === 'commande_gros')
    ) {
      return true;
    }
    if (
      t === 'facture' ||
      t === 'invoice' ||
      t === 'facture_grossiste' ||
      t === 'commande_gros' ||
      t === 'recu' ||
      t === 'recu_caisse' ||
      t === 'recu_versement' ||
      t === 'receipt' ||
      t === 'bon_cadeau' ||
      t === 'demande_achat'
    ) {
      return false;
    }
    const docNum = String(docData.number || '').toUpperCase();
    return (
      t === 'mini_thermique' ||
      t === 'ticket' ||
      t === 'ticket_thermique' ||
      docNum.startsWith('TKT-THERM-')
    );
  }, [docData, currentRole]);

  // Si un ticket thermique est ouvert, synchroniser avec /api/sales/:id/ticket pour garantir que
  // le numéro TKT-THERM-... existe en base (génération à la demande pour les anciennes ventes)
  // et lit exactement le même enregistrement de vente que la facture (lignes, montants, TVA).
  useEffect(() => {
    setSyncedTicketDoc(null);
    if (!docDataProp) return;
    const rawT = String(docDataProp.type || '').toLowerCase();
    if (
      rawT === 'facture' ||
      rawT === 'invoice' ||
      rawT === 'facture_grossiste' ||
      rawT === 'commande_gros' ||
      rawT === 'recu' ||
      rawT === 'recu_caisse' ||
      rawT === 'recu_versement' ||
      rawT === 'receipt' ||
      rawT === 'bon_cadeau' ||
      rawT === 'demande_achat'
    ) {
      return;
    }
    const isTicket =
      rawT === 'mini_thermique' ||
      rawT === 'ticket' ||
      rawT === 'ticket_thermique' ||
      String(docDataProp.number || '').toUpperCase().startsWith('TKT-THERM-');
    if (!isTicket || docDataProp.isProofPreview) return;

    const targetId =
      docDataProp.saleId ||
      String(docDataProp.id || '').replace(/^therm-/, '') ||
      docDataProp.saleNumber ||
      docDataProp.number;
    if (!targetId || String(targetId).includes('OFF')) return;

    let cancelled = false;
    fetch(`/api/sales/${encodeURIComponent(String(targetId))}/ticket`, {
      headers: {
        'x-user-role': currentRole || '',
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && data?.ticket) {
          setSyncedTicketDoc(data.ticket);
        }
      })
      .catch(() => {
        // Mode hors-ligne : conserver les données locales du ticket
      });

    return () => {
      cancelled = true;
    };
  }, [docDataProp, currentRole]);

  const baseSheetWidthPx = isThermalTicket ? THERMAL_WIDTH_PX : A4_WIDTH_PX;

  // Échelle : pour A4 = (largeur écran - 24) / 794 ; pour Ticket 80 mm = (largeur écran - 24) / 302 (plafonné à 1)
  const fitScale = useMemo(() => {
    const available = Math.max(260, viewportWidth - 24);
    const raw = available / baseSheetWidthPx;
    return Math.min(1, Math.max(0.25, Number(raw.toFixed(4))));
  }, [viewportWidth, baseSheetWidthPx]);

  const activeScale = customZoom !== null ? customZoom : fitScale;
  const isZoomedBeyondFit = activeScale > fitScale + 0.02;

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!docData) return;
    const prevOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    window.document.body.classList.add('baobab-printing-doc');
    if (isThermalTicket) {
      window.document.body.classList.add('baobab-printing-thermal-80mm');
    } else {
      window.document.body.classList.remove('baobab-printing-thermal-80mm');
    }
    return () => {
      window.document.body.style.overflow = prevOverflow;
      window.document.body.classList.remove('baobab-printing-doc');
      window.document.body.classList.remove('baobab-printing-thermal-80mm');
    };
  }, [docData, isThermalTicket]);

  useEffect(() => {
    if (!isZoomedBeyondFit) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [isZoomedBeyondFit]);

  const handleZoomIn = useCallback(() => {
    setCustomZoom((prev) => {
      const base = prev !== null ? prev : fitScale;
      return Math.min(3.0, Number((base + 0.25).toFixed(2)));
    });
  }, [fitScale]);

  const handleZoomOut = useCallback(() => {
    setCustomZoom((prev) => {
      const base = prev !== null ? prev : fitScale;
      const next = Number((base - 0.25).toFixed(2));
      if (next <= fitScale) {
        setPanOffset({ x: 0, y: 0 });
        return null;
      }
      return Math.max(0.25, next);
    });
  }, [fitScale]);

  const handleResetFit = useCallback(() => {
    setCustomZoom(null);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleToggleDoubleTap = useCallback(() => {
    if (customZoom !== null && Math.abs(customZoom - 1.0) < 0.05) {
      setCustomZoom(null);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setCustomZoom(1.0);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [customZoom]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = activeScale;
      setIsDragging(false);
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 280) {
        e.preventDefault();
        handleToggleDoubleTap();
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;

      if (isZoomedBeyondFit) {
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: panOffset.x,
          panY: panOffset.y,
        };
        setIsDragging(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchStartDistRef.current > 0) {
        const ratio = dist / pinchStartDistRef.current;
        const nextScale = Math.min(
          3.0,
          Math.max(fitScale, Number((pinchStartScaleRef.current * ratio).toFixed(2)))
        );
        setCustomZoom(nextScale);
      }
      return;
    }

    if (e.touches.length === 1 && isDragging && dragStartRef.current && isZoomedBeyondFit) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      const maxPanX = Math.max(0, (baseSheetWidthPx * activeScale - viewportWidth) / 2 + 120);
      const maxPanY = 300;
      setPanOffset({
        x: Math.max(-maxPanX, Math.min(maxPanX, dragStartRef.current.panX + dx)),
        y: Math.max(-maxPanY, Math.min(maxPanY, dragStartRef.current.panY + dy)),
      });
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomedBeyondFit) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !isZoomedBeyondFit) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const maxPanX = Math.max(0, (baseSheetWidthPx * activeScale - viewportWidth) / 2 + 120);
    const maxPanY = 300;
    setPanOffset({
      x: Math.max(-maxPanX, Math.min(maxPanX, dragStartRef.current.panX + dx)),
      y: Math.max(-maxPanY, Math.min(maxPanY, dragStartRef.current.panY + dy)),
    });
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const normalizedItems = useMemo<NormalizedLineItem[]>(() => {
    if (!docData || !Array.isArray(docData.items)) return [];
    return docData.items.map((it, idx) => ({
      id: it.id || `${docData.id || 'doc'}-${idx + 1}`,
      code: it.code || `ART-${String(idx + 1).padStart(2, '0')}`,
      description: it.description || it.name || 'Marchandise Baobab Distribution',
      quantity: Number(it.quantity ?? it.qty ?? (it as any).qtyBoxes ?? 1),
      unitPrice: Number(it.unitPrice ?? it.price ?? 0),
      total: Number(
        it.total ??
          Number(it.quantity ?? it.qty ?? (it as any).qtyBoxes ?? 1) *
            Number(it.unitPrice ?? it.price ?? 0)
      ),
    }));
  }, [docData]);

  const pages = useMemo<PageSlice[]>(() => {
    if (!docData) return [];
    const indexedItems = normalizedItems.map((item, idx) => ({
      item,
      globalIndex: idx + 1,
    }));

    const MAX_ROWS_SINGLE_PAGE = 9;
    const MAX_ROWS_FULL_INTERMEDIATE_PAGE = 14;
    const MAX_ROWS_LAST_PAGE_WITH_FOOTER = 9;

    if (indexedItems.length <= MAX_ROWS_SINGLE_PAGE) {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          items: indexedItems,
          isLastPage: true,
        },
      ];
    }

    const slices: Omit<PageSlice, 'totalPages'>[] = [];
    let cursor = 0;
    let pageNum = 1;

    while (cursor < indexedItems.length) {
      const remaining = indexedItems.length - cursor;
      if (remaining <= MAX_ROWS_LAST_PAGE_WITH_FOOTER) {
        slices.push({
          pageNumber: pageNum,
          items: indexedItems.slice(cursor),
          isLastPage: true,
        });
        cursor = indexedItems.length;
      } else if (remaining <= MAX_ROWS_FULL_INTERMEDIATE_PAGE) {
        slices.push({
          pageNumber: pageNum,
          items: indexedItems.slice(cursor),
          isLastPage: false,
        });
        pageNum += 1;
        slices.push({
          pageNumber: pageNum,
          items: [],
          isLastPage: true,
        });
        cursor = indexedItems.length;
      } else {
        slices.push({
          pageNumber: pageNum,
          items: indexedItems.slice(cursor, cursor + MAX_ROWS_FULL_INTERMEDIATE_PAGE),
          isLastPage: false,
        });
        cursor += MAX_ROWS_FULL_INTERMEDIATE_PAGE;
        pageNum += 1;
      }
    }

    const total = slices.length;
    return slices.map((s) => ({ ...s, totalPages: total }));
  }, [docData, normalizedItems]);

  if (!docData) return null;

  const rawType = String(docData.type || 'facture').toLowerCase();
  const isReceipt =
    rawType === 'recu' ||
    rawType === 'recu_caisse' ||
    rawType === 'recu_versement' ||
    rawType === 'receipt';
  const isBonCadeau = rawType === 'bon_cadeau';
  const isDemandeAchat = rawType === 'demande_achat';
  const isInvoice = !isThermalTicket && !isReceipt && !isBonCadeau && !isDemandeAchat;

  const resolvedParties = resolveDocumentParties(docData);
  const docTitle = isThermalTicket ? 'TICKET DE VENTE' : resolvedParties.docTitle;
  const vendorCode = docData.vendor?.code || docData.vendorCode || 'BAO';

  const thermalTicketNo = isThermalTicket
    ? String(
        docData.thermalTicketNumber ||
          docData.ticketNumber ||
          (String(docData.number || '').toUpperCase().startsWith('TKT-')
            ? docData.number
            : String(docData.saleNumber || docData.number || 'TKT-THERM-2026').replace(
                /^VTE-/i,
                'TKT-THERM-'
              ))
      )
    : '';
  const displayDocNumber = isThermalTicket ? thermalTicketNo : docData.number;
  const docNumLen = String(displayDocNumber || '').length;
  const docNumPt = docNumLen > 32 ? '7.5pt' : docNumLen > 24 ? '8.5pt' : docNumLen > 18 ? '9.5pt' : '10.5pt';

  const computedItemsHt = normalizedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const subtotalHt = Number(
    docData.subtotal ?? docData.subtotalHt ?? (computedItemsHt > 0 ? computedItemsHt : docData.total ?? 0)
  );
  const discountAmount = Number(docData.discountAmount || 0);
  const discountPercent = Number(docData.discountPercent || 0);
  const wholesaleDiscountAmount = Number(
    docData.wholesaleDiscountAmount ?? docData.wholesale_discount_amount ?? 0
  );
  const buyerTypeDisplay = String(docData.buyerType || docData.buyer_type || '').trim();
  const netHt = Math.max(0, subtotalHt - discountAmount);
  const taxRate = Number(
    docData.taxRate ?? docData.tvaRate ?? (docData.withTva ? 18 : 0)
  );
  const taxAmount = Number(
    docData.taxAmount ??
      docData.tvaAmount ??
      (taxRate > 0 ? Math.round((netHt * taxRate) / 100) : 0)
  );
  const totalTtc = Number(docData.totalTtc ?? (taxAmount > 0 ? netHt + taxAmount : docData.total ?? netHt));

  const statusStr = String(docData.status || 'Validé');
  const statusLower = statusStr.toLowerCase();
  const isCancelled =
    statusLower.includes('annul') || statusLower.includes('rejet');
  const isAcquittee =
    !isCancelled &&
    (docData.isAcquittee !== undefined
      ? Boolean(docData.isAcquittee)
      : statusLower === 'paid' ||
        (!statusLower.includes('impay') &&
          !statusLower.includes('pending') &&
          !statusLower.includes('attente') &&
          !statusLower.includes('payer') &&
          !String(docData.paymentMethod || '').toLowerCase().includes('attente') &&
          !String(docData.paymentMethod || '').toLowerCase().includes('crédit') &&
          !String(docData.paymentMethod || '').toLowerCase().includes('credit')));

  const amountPaidVal =
    docData.amountPaid !== undefined
      ? docData.amountPaid
      : isAcquittee
      ? totalTtc
      : 0;
  const resteAPayer = isCancelled ? 0 : Math.max(0, totalTtc - amountPaidVal);
  const totalQty = normalizedItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      if (isThermalTicket) {
        await exportThermalTicket80mmPdf(
          {
            ...docData,
            type: 'mini_thermique',
            number: thermalTicketNo,
            thermalTicketNumber: thermalTicketNo,
            subtotalHt,
            withTva: taxRate > 0 || taxAmount > 0,
            tvaRate: taxRate,
            tvaAmount: taxAmount,
            totalTtc,
            total: totalTtc,
            isAcquittee,
          },
          logoUrl
        );
      } else {
        await exportOfficialInvoiceA4Pdf(
          docData,
          taxRate > 0 || taxAmount > 0,
          numberToFrenchWords(totalTtc),
          logoUrl
        );
      }
    } finally {
      setTimeout(() => setIsExportingPdf(false), 400);
    }
  };

  const handleShare = async () => {
    const shareTitle = `${docTitle} N° ${displayDocNumber}`;
    const shareText = `Baobab Distribution — ${docTitle} N° ${displayDocNumber} (${totalTtc.toLocaleString('fr-FR')} FCFA) — ${getExplicitDocumentPdfFilename({
      ...docData,
      type: isThermalTicket ? 'mini_thermique' : docData.type,
      number: displayDocNumber,
    })}`;
    const shareUrl = window.location.href;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} - ${shareUrl}`);
      setShareToast('Lien copié dans le presse-papiers');
      setTimeout(() => setShareToast(null), 2800);
    } catch {
      setShareToast('Référence copiée');
      setTimeout(() => setShareToast(null), 2800);
    }
  };

  const scaledWidthPx = Math.round(A4_WIDTH_PX * activeScale);
  const scaledHeightPx = Math.round(A4_HEIGHT_PX * activeScale);
  const scaledThermalWidthPx = Math.round(THERMAL_WIDTH_PX * activeScale);

  const thermalSaleNumber = String(
    docData.saleNumber ||
      (String(docData.number || '').toUpperCase().startsWith('VTE-')
        ? docData.number
        : thermalTicketNo.replace(/^TKT-THERM-/i, 'VTE-'))
  );
  const thermalDateTimeStr = (() => {
    const d = String(docData.rawDate || docData.date || '');
    const t = String(docData.saleTime || '');
    if (d.includes('à') || d.includes(':')) return d;
    return t ? `${d} à ${t}` : d;
  })();
  const thermalVendorDisplay = (() => {
    const vName = String(
      docData.vendor?.name || docData.vendorName || docData.cashierName || 'Oumar Konaté'
    );
    const vCode = String(docData.vendor?.code || docData.vendorCode || 'BAO-V01');
    return vName.includes(vCode) ? vName : `${vName} (${vCode})`;
  })();
  const thermalPdvDisplay = String(
    docData.pdvName
      ? `${docData.pdvName}${docData.pdvNeighborhood ? ` (${docData.pdvNeighborhood})` : ''}`
      : docData.client?.name || docData.clientName || 'Point de vente PDV'
  );

  const modalContent = (
    <div
      className="baobab-print-portal fixed inset-0 z-[9999] flex flex-col w-screen h-[100dvh] max-h-[100dvh] bg-[#525659] text-white overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu du document ${displayDocNumber}`}
    >
      {/* Règle d'impression dédiée au Ticket Thermique 80 mm (@page size 80mm auto, marges 3 mm) */}
      {isThermalTicket && (
        <style>{`
          @media print {
            @page {
              size: 80mm auto;
              margin: 3mm;
            }
            html,
            body,
            body.baobab-printing-thermal-80mm,
            .baobab-print-portal,
            .a4-scroll-viewport,
            .a4-pan-surface,
            .thermal-ticket-stack,
            .thermal-scale-wrapper {
              width: 80mm !important;
              min-width: 80mm !important;
              max-width: 80mm !important;
              height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #FFFFFF !important;
              color: #000000 !important;
              overflow: visible !important;
              transform: none !important;
              display: block !important;
            }
            .thermal-ticket-sheet {
              width: 74mm !important;
              min-width: 74mm !important;
              max-width: 74mm !important;
              height: auto !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #FFFFFF !important;
              color: #000000 !important;
              box-shadow: none !important;
              border: none !important;
              transform: none !important;
            }
          }
        `}</style>
      )}

      {/* BARRE D'ACTIONS fixe en haut, sur une ligne */}
      <header className="a4-preview-toolbar print:hidden shrink-0 h-14 sm:h-16 w-full bg-[#1E293B] border-b border-slate-700 px-2.5 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3 z-30 shadow-md">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <span
            className="font-mono font-bold text-xs sm:text-sm md:text-base text-white"
            title={`${docTitle} — ${displayDocNumber}`}
          >
            {displayDocNumber}
          </span>
          <span className="hidden lg:inline-block text-xs text-slate-300 font-medium">
            {isThermalTicket
              ? '(Ticket thermique 80 mm)'
              : `(${pages.length} ${pages.length > 1 ? 'pages A4' : 'page A4'})`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isInvoice && onRequestRectification && !docData.isProofPreview && (
            <button
              type="button"
              onClick={() => onRequestRectification(docData)}
              title="Rectifier ou demander une rectification de cette facture"
              aria-label="Rectifier la facture"
              className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-lg bg-[#006B82] hover:bg-[#00586B] text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline whitespace-nowrap">
                {currentRole === 'Vendeur' ? 'Demander rectification' : 'Rectifier / Modifier'}
              </span>
              <span className="inline md:hidden whitespace-nowrap">Rectifier</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            title="Imprimer"
            aria-label="Imprimer"
            className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Imprimer</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            title={`Télécharger PDF (${getExplicitDocumentPdfFilename({
              ...docData,
              type: isThermalTicket ? 'mini_thermique' : docData.type,
              number: displayDocNumber,
            })})`}
            aria-label="Télécharger PDF"
            className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-lg bg-[#006B82] hover:bg-[#00586B] text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Télécharger PDF</span>
            <span className="inline sm:hidden whitespace-nowrap">PDF</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            title="Partager"
            aria-label="Partager"
            className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          >
            {shareToast ? (
              <Check className="w-4 h-4 text-white shrink-0" />
            ) : (
              <Share2 className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden md:inline whitespace-nowrap">Partager</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            className="h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-lg bg-black hover:bg-slate-900 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer border border-slate-600"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Fermer</span>
          </button>
        </div>
      </header>

      {shareToast && (
        <div className="print:hidden fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-black text-white border border-[#008DA9] px-4 py-2 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-[#008DA9] shrink-0" />
          <span>{shareToast}</span>
        </div>
      )}

      {/* ZONE DE DÉFILEMENT VERTICAL UNIQUE */}
      <div
        className="a4-scroll-viewport flex-1 w-full overflow-y-auto overflow-x-hidden py-3 sm:py-6 px-3 flex flex-col items-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleToggleDoubleTap}
        style={{
          touchAction: isZoomedBeyondFit ? 'none' : 'pan-y',
          cursor: isZoomedBeyondFit ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <div
          className="a4-pan-surface flex flex-col items-center"
          style={{
            transform:
              panOffset.x !== 0 || panOffset.y !== 0
                ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`
                : undefined,
            transition: isDragging ? 'none' : 'transform 150ms ease-out',
          }}
        >
          {isThermalTicket ? (
            /* MODÈLE 1 : TICKET THERMIQUE 80 MM (302 px de large, hauteur selon le contenu, fond blanc, texte noir, police à chiffres de largeur constante, centré) */
            <div className="thermal-ticket-stack flex flex-col items-center pb-20">
              <div
                className="thermal-scale-wrapper relative shrink-0 flex justify-center"
                style={{
                  width: `${scaledThermalWidthPx}px`,
                }}
              >
                <div
                  className="thermal-ticket-sheet shadow-[0_8px_30px_rgba(0,0,0,0.45)] select-text"
                  style={{
                    width: `${THERMAL_WIDTH_PX}px`,
                    minWidth: `${THERMAL_WIDTH_PX}px`,
                    maxWidth: `${THERMAL_WIDTH_PX}px`,
                    height: 'auto',
                    padding: '3mm',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    boxSizing: 'border-box',
                    transform: activeScale !== 1 ? `scale(${activeScale})` : undefined,
                    transformOrigin: 'top center',
                    fontFamily:
                      '"IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '11px',
                    lineHeight: 1.35,
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {/* En-tête centré : logo Baobab en noir et blanc (40 mm = 151 px), nom, adresse, téléphone, NIF */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      paddingBottom: '6px',
                    }}
                  >
                    <img
                      src={logoUrl || '/logo.png'}
                      alt="Logo Baobab Distribution Noir et Blanc"
                      style={{
                        width: `${THERMAL_LOGO_WIDTH_PX}px`,
                        maxWidth: '40mm',
                        height: 'auto',
                        objectFit: 'contain',
                        filter: 'grayscale(100%) contrast(150%)',
                        WebkitFilter: 'grayscale(100%) contrast(150%)',
                        marginBottom: '6px',
                        display: 'block',
                      }}
                    />
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: '13px',
                        letterSpacing: '0.02em',
                        color: '#000000',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.name}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#000000',
                        marginTop: '1px',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.addressAndPhones}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: '#000000',
                        marginTop: '1px',
                      }}
                    >
                      {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.nifRccm}
                    </div>
                  </div>

                  {/* Titre "TICKET DE VENTE" */}
                  <div
                    style={{
                      borderTop: '1.5px solid #000000',
                      borderBottom: '1.5px solid #000000',
                      padding: '4px 0',
                      margin: '4px 0 6px 0',
                      textAlign: 'center',
                      fontWeight: 900,
                      fontSize: '13px',
                      letterSpacing: '0.04em',
                      color: '#000000',
                    }}
                  >
                    TICKET DE VENTE
                  </div>

                  {/* N° du ticket, N° de vente, date et heure, vendeur (code), PDV */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      fontSize: '10.5px',
                      color: '#000000',
                      paddingBottom: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>N° du ticket :</span>
                      <span
                        style={{
                          fontWeight: 900,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {thermalTicketNo}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>N° de vente :</span>
                      <span
                        style={{
                          fontWeight: 800,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {thermalSaleNumber}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>Date et heure :</span>
                      <span
                        style={{
                          fontWeight: 700,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {thermalDateTimeStr}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>Vendeur :</span>
                      <span
                        style={{
                          fontWeight: 800,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {thermalVendorDisplay}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>PDV :</span>
                      <span
                        style={{
                          fontWeight: 800,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {thermalPdvDisplay}
                      </span>
                    </div>
                    {buyerTypeDisplay && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontWeight: 600, flexShrink: 0 }}>Type d&apos;acheteur :</span>
                        <span
                          style={{
                            fontWeight: 800,
                            textAlign: 'right',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {buyerTypeDisplay}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ligne de séparation */}
                  <div
                    style={{
                      borderTop: '1.5px dashed #000000',
                      margin: '4px 0',
                    }}
                  />

                  {/* En-tête des lignes d'articles */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      fontWeight: 900,
                      borderBottom: '1px solid #000000',
                      paddingBottom: '3px',
                      marginBottom: '5px',
                      color: '#000000',
                    }}
                  >
                    <span>DÉSIGNATION / QTÉ x PRIX</span>
                    <span>MONTANT</span>
                  </div>

                  {/* Lignes : désignation, quantité x prix, montant (retour à la ligne autorisé, jamais coupé) */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      paddingBottom: '6px',
                    }}
                  >
                    {normalizedItems.map((it) => (
                      <div
                        key={it.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                          color: '#000000',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '11px',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'normal',
                          }}
                        >
                          {it.description}
                          {it.code && !it.description.includes(it.code) ? ` (${it.code})` : ''}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: '8px',
                            fontSize: '10.5px',
                          }}
                        >
                          <span style={{ fontWeight: 600, whiteSpace: 'normal' }}>
                            {it.quantity} &times; {it.unitPrice.toLocaleString('fr-FR')} FCFA
                          </span>
                          <span
                            style={{
                              fontWeight: 900,
                              whiteSpace: 'nowrap',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {it.total.toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ligne de séparation */}
                  <div
                    style={{
                      borderTop: '1.5px dashed #000000',
                      margin: '4px 0 6px 0',
                    }}
                  />

                  {/* Total HT, TVA 18 % si appliquée, TOTAL TTC en gras */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      fontSize: '11px',
                      color: '#000000',
                    }}
                  >
                    {wholesaleDiscountAmount > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Remise grossiste :</span>
                        <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                          - {wholesaleDiscountAmount.toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Total HT :</span>
                      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {netHt.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>

                    {(taxRate > 0 || taxAmount > 0) && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>TVA {taxRate || 18} % :</span>
                        <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {taxAmount.toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        borderTop: '1.5px solid #000000',
                        borderBottom: '1.5px solid #000000',
                        padding: '4px 0',
                        marginTop: '2px',
                        fontSize: '13px',
                        fontWeight: 900,
                      }}
                    >
                      <span>TOTAL TTC :</span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {totalTtc.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                  </div>

                  {/* Mode de règlement, mention "ACQUITTÉ" ou "À PAYER" */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      marginTop: '6px',
                      fontSize: '10.5px',
                      color: '#000000',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Mode de règlement :</span>
                      <span
                        style={{
                          fontWeight: 800,
                          textAlign: 'right',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {docData.paymentMethod || 'Comptant'}
                      </span>
                    </div>

                    <div
                      style={{
                        border: '2px solid #000000',
                        padding: '4px 8px',
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: '12px',
                        letterSpacing: '0.06em',
                        margin: '2px auto',
                        width: '100%',
                        color: '#000000',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      {isAcquittee ? 'ACQUITTÉ' : 'À PAYER'}
                    </div>
                  </div>

                  {/* Montant en lettres */}
                  <div
                    style={{
                      marginTop: '6px',
                      paddingTop: '5px',
                      borderTop: '1px dashed #000000',
                      fontSize: '10px',
                      textAlign: 'center',
                      color: '#000000',
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    Arrêté le présent ticket à la somme de :{' '}
                    <strong style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                      {numberToFrenchWords(totalTtc)} Francs CFA
                    </strong>
                    .
                  </div>

                  {/* "Merci de votre confiance" & pied avec NIF et RCCM */}
                  <div
                    style={{
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1.5px solid #000000',
                      textAlign: 'center',
                      color: '#000000',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: '11.5px',
                        marginBottom: '3px',
                      }}
                    >
                      Merci de votre confiance
                    </div>
                    <div
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.nifRccm}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* MODÈLE 2 : FEUILLE A4 PORTRAIT (Factures FAC-..., Reçus de caisse REC-..., Reçus de versement VSM-..., Bons cadeaux) */
            <div className="a4-pages-stack flex flex-col items-center gap-4 sm:gap-6 pb-20">
              {pages.map((page) => (
                <div
                  key={page.pageNumber}
                  className="a4-scale-wrapper relative shrink-0"
                  style={{
                    width: `${scaledWidthPx}px`,
                    height: `${scaledHeightPx}px`,
                  }}
                >
                  {/* FEUILLE A4 PORTRAIT : 210 x 297 mm (794 x 1123 px à 96 dpi), fond blanc #FFFFFF, texte noir #000000, marges 15 mm */}
                  <div
                    className="a4-page-sheet shadow-[0_8px_30px_rgba(0,0,0,0.45)] flex flex-col justify-between select-text"
                    style={{
                      width: `${A4_WIDTH_PX}px`,
                      height: `${A4_HEIGHT_PX}px`,
                      padding: '15mm',
                    backgroundColor: COLOR_BLANC,
                    color: COLOR_NOIR,
                    transform: `scale(${activeScale})`,
                    transformOrigin: 'top left',
                    fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                    fontSize: '10.5pt',
                    lineHeight: 1.35,
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {/* HAUT ET MILIEU DE LA FEUILLE A4 */}
                  <div className="flex flex-col">
                    {/* 1. EN-TÊTE SANS CHEVAUCHEMENT : Colonne gauche 60 %, Colonne droite 38 %, écart 2 % */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `${A4_DOCUMENT_LAYOUT_SPEC.header.leftColPct}% ${A4_DOCUMENT_LAYOUT_SPEC.header.rightColPct}%`,
                        justifyContent: 'space-between',
                        alignItems: 'stretch',
                        paddingBottom: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          minWidth: 0,
                          maxWidth: '100%',
                        }}
                      >
                        <img
                          src={logoUrl || '/logo.png'}
                          alt="Baobab Distribution Logo"
                          style={{
                            width: '74px',
                            height: '74px',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            padding: '3px',
                            backgroundColor: COLOR_BLANC,
                            flexShrink: 0,
                          }}
                        />
                        <div
                          style={{
                            minWidth: 0,
                            maxWidth: '100%',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {/* Nom de la société */}
                          <div
                            style={{
                              fontSize: '10pt',
                              fontWeight: 900,
                              color: COLOR_NOIR,
                              lineHeight: 1.2,
                            }}
                          >
                            {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.name}
                          </div>
                          {/* Activité sur sa propre ligne */}
                          <div
                            style={{
                              fontSize: '8.8pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              marginTop: '1.5px',
                              lineHeight: 1.2,
                            }}
                          >
                            {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.activity}
                          </div>
                          {/* Adresse & téléphones */}
                          <div
                            style={{
                              fontSize: '8pt',
                              color: COLOR_NOIR,
                              marginTop: '2px',
                              lineHeight: 1.25,
                            }}
                          >
                            {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.addressAndPhones}
                          </div>
                          {/* E-mail */}
                          <div
                            style={{
                              fontSize: '8pt',
                              color: COLOR_NOIR,
                              marginTop: '1px',
                              lineHeight: 1.2,
                            }}
                          >
                            {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.email}
                          </div>
                          {/* NIF & RCCM */}
                          <div
                            style={{
                              fontSize: '8pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              marginTop: '1.5px',
                              lineHeight: 1.2,
                            }}
                          >
                            {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.nifRccm}
                          </div>
                        </div>
                      </div>

                      {/* Cadre Document à droite (38 % max, aucun débordement) */}
                      <div
                        style={{
                          border: `1.5px solid ${COLOR_NOIR}`,
                          borderRadius: '6px',
                          padding: '7px 9px',
                          backgroundColor: COLOR_BLANC,
                          textAlign: 'right',
                          minWidth: 0,
                          maxWidth: '100%',
                          overflowWrap: 'anywhere',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9.2pt',
                            fontWeight: 900,
                            color: COLOR_MARQUE,
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            lineHeight: 1.2,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {docTitle}
                        </div>
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: docNumPt,
                            fontWeight: 900,
                            color: COLOR_NOIR,
                            marginTop: '2px',
                            lineHeight: 1.2,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          N° {docData.number}
                        </div>
                        <div
                          style={{
                            fontSize: '8.5pt',
                            color: COLOR_NOIR,
                            marginTop: '2px',
                            lineHeight: 1.2,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          Date : <strong>{docData.date}</strong>
                          {docData.saleTime && !String(docData.date).includes(docData.saleTime)
                            ? ` à ${docData.saleTime}`
                            : ''}
                        </div>
                        <div
                          style={{
                            fontSize: '8.5pt',
                            color: COLOR_NOIR,
                            marginTop: '1px',
                            lineHeight: 1.2,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          Règlement : <strong>{docData.paymentMethod || 'Comptant'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* BARRE BLEUE (--marque) DE 2 MM SOUS L'EN-TÊTE */}
                    <div
                      style={{
                        width: '100%',
                        height: '2mm',
                        backgroundColor: COLOR_MARQUE,
                        marginBottom: '12px',
                      }}
                    />

                    {/* 2. CARTES ÉMETTEUR ET DESTINATAIRE : 49 % chacune, écart 2 %, texte contraint avec retour à la ligne */}
                    {page.pageNumber === 1 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `${A4_DOCUMENT_LAYOUT_SPEC.parties.cardWidthPct}% ${A4_DOCUMENT_LAYOUT_SPEC.parties.cardWidthPct}%`,
                          justifyContent: 'space-between',
                          marginBottom: '12px',
                        }}
                      >
                        {/* Carte Émetteur */}
                        <div
                          style={{
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            borderLeft: `4px solid ${COLOR_MARQUE}`,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            backgroundColor: COLOR_MARQUE_8PCT,
                            minWidth: 0,
                            maxWidth: '100%',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '8pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              textTransform: 'uppercase',
                              borderBottom: `1px solid ${COLOR_MARQUE}`,
                              paddingBottom: '3px',
                              marginBottom: '5px',
                            }}
                          >
                            {resolvedParties.emitterHeading}
                          </div>
                          <div style={{ fontSize: '9.5pt', color: COLOR_NOIR, lineHeight: 1.35 }}>
                            {/* Ligne 1 : Nom en gras */}
                            <div style={{ fontWeight: 800 }}>
                              {resolvedParties.emitterPrimaryBold}
                            </div>
                            {/* Ligne 2 : Équipe en dessous */}
                            <div>{resolvedParties.emitterTeamLine}</div>
                            <div>{resolvedParties.emitterPhoneLine}</div>
                            {resolvedParties.emitterRefLine && (
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9pt' }}>
                                {resolvedParties.emitterRefLine}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Carte Destinataire */}
                        <div
                          style={{
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            borderLeft: `4px solid ${COLOR_MARQUE}`,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            backgroundColor: COLOR_MARQUE_8PCT,
                            minWidth: 0,
                            maxWidth: '100%',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '8pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              textTransform: 'uppercase',
                              borderBottom: `1px solid ${COLOR_MARQUE}`,
                              paddingBottom: '3px',
                              marginBottom: '5px',
                            }}
                          >
                            {resolvedParties.recipientHeading}
                          </div>
                          <div style={{ fontSize: '9.5pt', color: COLOR_NOIR, lineHeight: 1.35 }}>
                            {/* Ligne 1 : Nom en gras */}
                            <div style={{ fontWeight: 900 }}>
                              {resolvedParties.recipientPrimaryBold}
                            </div>
                            {/* Ligne 2 : Équipe / Sous-titre en dessous si présent */}
                            {resolvedParties.recipientTeamOrSubLine && (
                              <div>{resolvedParties.recipientTeamOrSubLine}</div>
                            )}
                            {resolvedParties.recipientAddressLine && (
                              <div>{resolvedParties.recipientAddressLine}</div>
                            )}
                            {resolvedParties.recipientContactLine && (
                              <div>{resolvedParties.recipientContactLine}</div>
                            )}
                            <div>
                              {resolvedParties.recipientPhoneLine}
                              {resolvedParties.recipientNineaLine
                                ? ` • ${resolvedParties.recipientNineaLine}`
                                : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          border: `1.5px solid ${COLOR_MARQUE}`,
                          borderRadius: '4px',
                          padding: '5px 10px',
                          marginBottom: '10px',
                          backgroundColor: COLOR_MARQUE_8PCT,
                          fontSize: '9.5pt',
                          color: COLOR_NOIR,
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          <strong>Destinataire :</strong> {resolvedParties.recipientPrimaryBold}
                        </span>
                        <span style={{ whiteSpace: 'nowrap' }}>
                          <strong>Suite :</strong> N° {docData.number} (Page {page.pageNumber} / {page.totalPages})
                        </span>
                      </div>
                    )}

                    {/* 3. TABLEAU DES LIGNES : Réf. 22 %, Désignation 36 %, Quantité 12 %, Prix unitaire HT 15 %, Montant HT 15 % */}
                    {page.items.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <table
                          style={{
                            width: '100%',
                            tableLayout: 'fixed',
                            borderCollapse: 'collapse',
                            border: `1.5px solid ${COLOR_NOIR}`,
                            fontSize: '9.5pt',
                            color: COLOR_NOIR,
                          }}
                        >
                          <colgroup>
                            <col style={{ width: `${A4_DOCUMENT_LAYOUT_SPEC.tableColumnsPct.ref}%` }} />
                            <col style={{ width: `${A4_DOCUMENT_LAYOUT_SPEC.tableColumnsPct.designation}%` }} />
                            <col style={{ width: `${A4_DOCUMENT_LAYOUT_SPEC.tableColumnsPct.qty}%` }} />
                            <col style={{ width: `${A4_DOCUMENT_LAYOUT_SPEC.tableColumnsPct.unitPrice}%` }} />
                            <col style={{ width: `${A4_DOCUMENT_LAYOUT_SPEC.tableColumnsPct.totalHt}%` }} />
                          </colgroup>
                          <thead>
                            <tr
                              style={{
                                backgroundColor: COLOR_MARQUE_APLAT,
                                color: COLOR_BLANC,
                                borderBottom: `1.5px solid ${COLOR_NOIR}`,
                                fontSize: '9pt',
                                fontWeight: 800,
                              }}
                            >
                              <th
                                style={{
                                  textAlign: 'left',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  padding: '5px 6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Réf.
                              </th>
                              <th
                                style={{
                                  textAlign: 'left',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  padding: '5px 6px',
                                }}
                              >
                                Désignation
                              </th>
                              <th
                                style={{
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  padding: '5px 6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Quantité
                              </th>
                              <th
                                style={{
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  padding: '5px 6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Prix unitaire HT
                              </th>
                              <th
                                style={{
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  padding: '5px 6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Montant HT
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.items.map(({ item, globalIndex }, idx) => {
                              const codeLen = String(item.code || '').length;
                              const refFontPt =
                                codeLen > 24 ? '7pt' : codeLen > 18 ? '8pt' : '9pt';
                              return (
                                <tr
                                  key={`${item.id}-${globalIndex}`}
                                  style={{
                                    backgroundColor: idx % 2 === 0 ? COLOR_BLANC : COLOR_MARQUE_8PCT,
                                    borderBottom: `1px solid ${COLOR_NOIR}`,
                                    color: COLOR_NOIR,
                                  }}
                                >
                                  <td
                                    style={{
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 700,
                                      fontSize: refFontPt,
                                      borderRight: `1px solid ${COLOR_NOIR}`,
                                      padding: '5px 6px',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      color: COLOR_NOIR,
                                    }}
                                  >
                                    {item.code}
                                  </td>
                                  <td
                                    style={{
                                      fontWeight: 600,
                                      borderRight: `1px solid ${COLOR_NOIR}`,
                                      padding: '5px 6px',
                                      whiteSpace: 'normal',
                                      overflowWrap: 'anywhere',
                                      wordBreak: 'break-word',
                                      color: COLOR_NOIR,
                                    }}
                                  >
                                    {item.description}
                                  </td>
                                  <td
                                    style={{
                                      textAlign: 'right',
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 800,
                                      borderRight: `1px solid ${COLOR_NOIR}`,
                                      padding: '5px 6px',
                                      whiteSpace: 'nowrap',
                                      color: COLOR_NOIR,
                                    }}
                                  >
                                    {item.quantity}
                                  </td>
                                  <td
                                    style={{
                                      textAlign: 'right',
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontSize: '8.8pt',
                                      borderRight: `1px solid ${COLOR_NOIR}`,
                                      padding: '5px 6px',
                                      whiteSpace: 'nowrap',
                                      color: COLOR_NOIR,
                                    }}
                                  >
                                    {item.unitPrice.toLocaleString('fr-FR')} FCFA
                                  </td>
                                  <td
                                    style={{
                                      textAlign: 'right',
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontSize: '8.8pt',
                                      fontWeight: 800,
                                      padding: '5px 6px',
                                      whiteSpace: 'nowrap',
                                      color: COLOR_NOIR,
                                    }}
                                  >
                                    {item.total.toLocaleString('fr-FR')} FCFA
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!page.isLastPage && (
                      <div
                        style={{
                          padding: '8px 12px',
                          backgroundColor: COLOR_MARQUE_8PCT,
                          border: `1px dashed ${COLOR_NOIR}`,
                          borderRadius: '4px',
                          textAlign: 'right',
                          fontSize: '10pt',
                          fontWeight: 700,
                          color: COLOR_NOIR,
                        }}
                      >
                        Suite des lignes et totaux en page {page.pageNumber + 1} / {page.totalPages} →
                      </div>
                    )}

                    {/* DERNIÈRE PAGE : RÈGLEMENTS + CACHET STATUT PAR LA FORME & TOTAUX (TOTAL TTC EN APLAT BLEU TEXTE BLANC) */}
                    {page.isLastPage && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '52% 46%',
                            justifyContent: 'space-between',
                            alignItems: 'stretch',
                          }}
                        >
                          {/* Carte Règlements & Cachet Statut (fond bleu 8 %, bordure noire) */}
                          <div
                            style={{
                              border: `1px solid ${COLOR_NOIR}`,
                              borderRadius: '6px',
                              padding: '8px 10px',
                              backgroundColor: COLOR_MARQUE_8PCT,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              fontSize: '10pt',
                              color: COLOR_NOIR,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: '8.5pt',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  borderBottom: `1px solid ${COLOR_NOIR}`,
                                  paddingBottom: '3px',
                                  marginBottom: '6px',
                                }}
                              >
                                Règlements &amp; Paiements
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span>Mode de règlement :</span>
                                <strong>{docData.paymentMethod || 'Comptant'}</strong>
                              </div>
                              {buyerTypeDisplay && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                  <span>Type d&apos;acheteur :</span>
                                  <strong>{buyerTypeDisplay}</strong>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span>Quantité totale :</span>
                                <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  {totalQty} unité(s) / carton(s)
                                </strong>
                              </div>
                              {(docData.paymentRef || docData.versementRef) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                  <span>Réf. versement :</span>
                                  <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                    {docData.paymentRef || docData.versementRef}
                                  </strong>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Montant réglé / Reste :</span>
                                <strong style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                                  {amountPaidVal.toLocaleString('fr-FR')} / {resteAPayer.toLocaleString('fr-FR')} FCFA
                                </strong>
                              </div>
                            </div>

                            {/* 4. STATUTS PAR LA FORME, sans autre couleur, ne recouvrant aucun texte */}
                            <div
                              style={{
                                marginTop: '10px',
                                paddingTop: '8px',
                                borderTop: `1px dashed ${COLOR_NOIR}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                minHeight: '36px',
                              }}
                            >
                              <span style={{ fontSize: '9.5pt', fontWeight: 700, color: COLOR_NOIR }}>
                                Cachet statut :
                              </span>

                              {isCancelled ? (
                                /* "ANNULÉE" en noir avec barre diagonale sur fond blanc */
                                <span
                                  style={{
                                    position: 'relative',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: `2px solid ${COLOR_NOIR}`,
                                    backgroundColor: COLOR_BLANC,
                                    color: COLOR_NOIR,
                                    padding: '3px 14px',
                                    borderRadius: '4px',
                                    fontWeight: 900,
                                    fontSize: '10pt',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <span>ANNULÉE</span>
                                  <svg
                                    viewBox="0 0 100 30"
                                    preserveAspectRatio="none"
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      width: '100%',
                                      height: '100%',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    <line
                                      x1="2"
                                      y1="28"
                                      x2="98"
                                      y2="2"
                                      stroke={COLOR_NOIR}
                                      strokeWidth="2.5"
                                    />
                                  </svg>
                                </span>
                              ) : isAcquittee ? (
                                /* "ACQUITTÉE" en cachet plein bleu texte blanc, légèrement incliné */
                                <span
                                  style={{
                                    display: 'inline-block',
                                    backgroundColor: COLOR_MARQUE_APLAT,
                                    color: COLOR_BLANC,
                                    border: `1.5px solid ${COLOR_NOIR}`,
                                    padding: '3px 14px',
                                    borderRadius: '4px',
                                    fontWeight: 900,
                                    fontSize: '10pt',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    transform: 'rotate(-4deg)',
                                  }}
                                >
                                  ACQUITTÉE
                                </span>
                              ) : (
                                /* "À PAYER" en cachet à contour noir sur fond blanc */
                                <span
                                  style={{
                                    display: 'inline-block',
                                    border: `2px solid ${COLOR_NOIR}`,
                                    backgroundColor: COLOR_BLANC,
                                    color: COLOR_NOIR,
                                    padding: '3px 14px',
                                    borderRadius: '4px',
                                    fontWeight: 900,
                                    fontSize: '10pt',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  À PAYER
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Totaux : cadres noirs, ligne TOTAL TTC en aplat bleu (#006B82) texte blanc */}
                          <div
                            style={{
                              border: `1.5px solid ${COLOR_NOIR}`,
                              borderRadius: '6px',
                              overflow: 'hidden',
                              backgroundColor: COLOR_BLANC,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              fontSize: '10.5pt',
                              color: COLOR_NOIR,
                            }}
                          >
                            <div style={{ padding: '8px 10px' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  paddingBottom: '5px',
                                  borderBottom: `1px solid ${COLOR_NOIR}`,
                                }}
                              >
                                <span style={{ fontWeight: 700 }}>Total HT</span>
                                <span
                                  style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {subtotalHt.toLocaleString('fr-FR')} FCFA
                                </span>
                              </div>

                              {wholesaleDiscountAmount > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '5px 0',
                                    borderBottom: `1px solid ${COLOR_NOIR}`,
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    Remise grossiste
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 800,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    - {wholesaleDiscountAmount.toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                              )}

                              {discountAmount > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '5px 0',
                                    borderBottom: `1px solid ${COLOR_NOIR}`,
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    Remise{discountPercent > 0 ? ` (${discountPercent} %)` : ''}
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 800,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    - {discountAmount.toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                              )}

                              {taxRate > 0 || taxAmount > 0 ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '5px 0',
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    TVA ({taxRate || 18} %)
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 800,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    + {taxAmount.toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '5px 0',
                                    fontSize: '9.5pt',
                                  }}
                                >
                                  <span>TVA (0 % — Sans TVA)</span>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                                    0 FCFA
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Ligne TOTAL TTC : aplat bleu (#006B82) texte blanc (#FFFFFF) */}
                            <div
                              style={{
                                borderTop: `1.5px solid ${COLOR_NOIR}`,
                                backgroundColor: COLOR_MARQUE_APLAT,
                                color: COLOR_BLANC,
                                padding: '8px 10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span style={{ fontWeight: 900, fontSize: '10.5pt', color: COLOR_BLANC }}>
                                TOTAL TTC
                              </span>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 900,
                                  fontSize: '12pt',
                                  whiteSpace: 'nowrap',
                                  color: COLOR_BLANC,
                                }}
                              >
                                {totalTtc.toLocaleString('fr-FR')} FCFA
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Arrêté en toutes lettres (fond bleu 8 %, bordure noire, texte noir) */}
                        <div
                          style={{
                            border: `1px solid ${COLOR_NOIR}`,
                            backgroundColor: COLOR_MARQUE_8PCT,
                            borderRadius: '5px',
                            padding: '6px 10px',
                            fontSize: '9.5pt',
                            color: COLOR_NOIR,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>
                            Arrêté en toutes lettres :{' '}
                          </span>
                          <strong style={{ textTransform: 'uppercase' }}>
                            {numberToFrenchWords(totalTtc)} FRANCS CFA (XOF)
                          </strong>
                        </div>

                        {docData.notes && (
                          <div
                            style={{
                              fontSize: '9.5pt',
                              color: COLOR_NOIR,
                              backgroundColor: COLOR_BLANC,
                              padding: '4px 8px',
                              border: `1px solid ${COLOR_NOIR}`,
                              borderRadius: '4px',
                            }}
                          >
                            <strong>Note :</strong> {docData.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* BAS DE LA FEUILLE A4 : SIGNATURES + PIED "Page X / Y" (noir sur blanc) */}
                  <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                    {page.isLastPage && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '32% 32% 32%',
                          justifyContent: 'space-between',
                          marginBottom: '10px',
                        }}
                      >
                        <div
                          style={{
                            border: `1px solid ${COLOR_NOIR}`,
                            borderRadius: '5px',
                            padding: '6px 8px',
                            height: '66px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            textAlign: 'center',
                            backgroundColor: COLOR_BLANC,
                            color: COLOR_NOIR,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '8.5pt',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {docData.sigLeftLabel || 'Le Destinataire / Client'}
                          </span>
                          <span style={{ fontSize: '8pt' }}>Signature &amp; Cachet</span>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${COLOR_NOIR}`,
                            borderRadius: '5px',
                            padding: '6px 8px',
                            height: '66px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            textAlign: 'center',
                            backgroundColor: COLOR_BLANC,
                            color: COLOR_NOIR,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '8.5pt',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {docData.sigCenterLabel || `L'Émetteur (${vendorCode})`}
                          </span>
                          <span style={{ fontSize: '8pt' }}>Signature &amp; Date</span>
                        </div>

                        <div
                          style={{
                            border: `1px solid ${COLOR_NOIR}`,
                            borderRadius: '5px',
                            padding: '6px 8px',
                            height: '66px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            textAlign: 'center',
                            backgroundColor: COLOR_BLANC,
                            color: COLOR_NOIR,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '8.5pt',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {docData.sigRightLabel || 'Direction & Comptabilité'}
                          </span>
                          <span style={{ fontSize: '8pt' }}>Visa &amp; Cachet</span>
                        </div>
                      </div>
                    )}

                    {/* Pied de page "Page X / Y" en noir */}
                    <div
                      style={{
                        borderTop: `1px solid ${COLOR_NOIR}`,
                        paddingTop: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '9.5pt',
                        color: COLOR_NOIR,
                      }}
                    >
                      <span>
                        {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.name} • {A4_DOCUMENT_LAYOUT_SPEC.companyInfo.nifRccm}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 800,
                        }}
                      >
                        Page {page.pageNumber} / {page.totalPages}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* BOUTONS + / - / "Page entière" (48 px) */}
      <div className="a4-preview-floating-controls print:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-[#0F172A]/95 backdrop-blur-md border border-slate-700 px-2.5 py-1.5 rounded-xl shadow-2xl">
        <button
          type="button"
          onClick={handleZoomOut}
          title="Réduire le zoom (-)"
          aria-label="Réduire le zoom"
          className="h-12 w-12 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
        >
          <ZoomOut className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleResetFit}
          title="Ajuster à la page entière"
          aria-label="Page entière"
          className={`h-12 px-3.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            customZoom === null
              ? 'bg-[#006B82] text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
        >
          <Maximize2 className="w-4 h-4 shrink-0" />
          <span>Page entière ({Math.round(activeScale * 100)} %)</span>
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={activeScale >= 3.0}
          title="Augmenter le zoom (+ jusqu'à 300 %)"
          aria-label="Augmenter le zoom"
          className="h-12 w-12 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-40 text-white font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return typeof window !== 'undefined'
    ? createPortal(modalContent, window.document.body)
    : modalContent;
};
