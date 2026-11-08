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
  exportOfficialInvoiceA4Pdf,
  getExplicitDocumentPdfFilename,
  numberToFrenchWords,
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
  saleNumber?: string;
  thermalTicketNumber?: string;
  saleTime?: string;
  date: string;
  dueDate?: string;
  type:
    | 'invoice'
    | 'receipt'
    | 'facture'
    | 'recu'
    | 'mini_thermique'
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
  document: docData,
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

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);

  // Échelle = (largeur de l'écran - 24) / 794
  const fitScale = useMemo(() => {
    const available = Math.max(280, viewportWidth - 24);
    const raw = available / A4_WIDTH_PX;
    return Math.min(1, Math.max(0.25, Number(raw.toFixed(4))));
  }, [viewportWidth]);

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
    return () => {
      window.document.body.style.overflow = prevOverflow;
      window.document.body.classList.remove('baobab-printing-doc');
    };
  }, [docData]);

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
      const maxPanX = Math.max(0, (A4_WIDTH_PX * activeScale - viewportWidth) / 2 + 120);
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
    const maxPanX = Math.max(0, (A4_WIDTH_PX * activeScale - viewportWidth) / 2 + 120);
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
      quantity: Number(it.quantity ?? it.qty ?? 1),
      unitPrice: Number(it.unitPrice ?? it.price ?? 0),
      total: Number(it.total ?? 0),
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
  const isReceipt = rawType === 'recu' || rawType === 'receipt';
  const isThermal = rawType === 'mini_thermique';
  const isBonCadeau = rawType === 'bon_cadeau';
  const isDemandeAchat = rawType === 'demande_achat';
  const isGrossiste = rawType === 'commande_gros' || rawType === 'facture_grossiste';
  const isInvoice = !isReceipt && !isBonCadeau && !isDemandeAchat;

  const docTitle =
    docData.docTypeTitle ||
    (isReceipt
      ? 'REÇU DE VERSEMENT'
      : isBonCadeau
      ? 'BON CADEAU REMIS (FEFO)'
      : isDemandeAchat
      ? "DEMANDE D'ACHAT FOURNISSEUR"
      : isGrossiste
      ? 'FACTURE GROSSISTE'
      : isThermal
      ? 'REÇU DE CAISSE'
      : 'FACTURE DE VENTE PDV');

  const emitterHeading =
    docData.emitterTitle ||
    (isReceipt
      ? 'PARTIE VERSANTE / VENDEUR'
      : isDemandeAchat
      ? 'DEMANDEUR / MAGASIN BAOBAB'
      : 'ÉMETTEUR / AGENT BAOBAB');

  const recipientHeading =
    docData.recipientTitle ||
    (isReceipt
      ? 'CAISSE CENTRALE BAOBAB'
      : isDemandeAchat
      ? 'FOURNISSEUR / DIRECTION ACHATS'
      : 'DESTINATAIRE / CLIENT ACHETEUR');

  const vendorName =
    docData.vendor?.name ||
    docData.vendorName ||
    docData.cashierName ||
    'Dépôt Central Baobab Distribution';
  const vendorCode = docData.vendor?.code || docData.vendorCode || 'BAO';
  const vendorPhone = docData.vendor?.phone || docData.vendorPhone || '+223 20 22 45 88';
  const vendorTeam = docData.vendorTeam || 'Direction Commerciale Bamako';

  const clientName =
    docData.client?.name ||
    docData.pdvName ||
    docData.clientName ||
    'Client Partenaire Baobab';
  const clientAddress =
    docData.client?.address ||
    `${docData.pdvCode ? `${docData.pdvCode} • ` : ''}${docData.pdvNeighborhood || 'Bamako, Mali'}`;
  const clientContact = docData.client?.contact || docData.pdvManager || '';
  const clientPhone =
    docData.client?.phone || docData.pdvPhone || docData.clientPhone || '+223 76 00 00 00';
  const clientNinea = docData.client?.ninea || '';

  const subtotalHt = Number(
    docData.subtotal ?? docData.subtotalHt ?? docData.total ?? 0
  );
  const discountAmount = Number(docData.discountAmount || 0);
  const discountPercent = Number(docData.discountPercent || 0);
  const netHt = Math.max(0, subtotalHt - discountAmount);
  const taxRate = Number(
    docData.taxRate ?? docData.tvaRate ?? (docData.withTva ? 18 : 0)
  );
  const taxAmount = Number(
    docData.taxAmount ??
      docData.tvaAmount ??
      (taxRate > 0 ? Math.round((netHt * taxRate) / 100) : 0)
  );
  const totalTtc = Number(docData.totalTtc ?? docData.total ?? netHt + taxAmount);

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

  const handleDownloadPdf = () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      exportOfficialInvoiceA4Pdf(
        docData,
        taxRate > 0 || taxAmount > 0,
        numberToFrenchWords(totalTtc),
        logoUrl
      );
    } finally {
      setTimeout(() => setIsExportingPdf(false), 400);
    }
  };

  const handleShare = async () => {
    const shareTitle = `${docTitle} N° ${docData.number}`;
    const shareText = `Baobab Distribution — ${docTitle} N° ${docData.number} (${totalTtc.toLocaleString('fr-FR')} FCFA) — ${getExplicitDocumentPdfFilename(docData)}`;
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

  const modalContent = (
    <div
      className="baobab-print-portal fixed inset-0 z-[9999] flex flex-col w-screen h-[100dvh] max-h-[100dvh] bg-[#525659] text-white overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu du document ${docData.number}`}
    >
      {/* BARRE D'ACTIONS fixe en haut, sur une ligne */}
      <header className="a4-preview-toolbar print:hidden shrink-0 h-14 sm:h-16 w-full bg-[#1E293B] border-b border-slate-700 px-2.5 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3 z-30 shadow-md">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <span
            className="font-mono font-bold text-xs sm:text-sm md:text-base text-white truncate"
            title={`${docTitle} — ${docData.number}`}
          >
            {docData.number}
          </span>
          <span className="hidden lg:inline-block text-xs text-slate-300 font-medium truncate">
            ({pages.length} {pages.length > 1 ? 'pages A4' : 'page A4'})
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {currentRole === 'Vendeur' && isInvoice && onRequestRectification && (
            <button
              type="button"
              onClick={() => onRequestRectification(docData)}
              title="Demander une rectification au Comptable"
              aria-label="Demander une rectification"
              className="h-10 sm:h-11 px-2.5 sm:px-3 rounded-lg bg-[#006B82] hover:bg-[#00586B] text-white font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline whitespace-nowrap">Rectification</span>
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
            title={`Télécharger PDF (${getExplicitDocumentPdfFilename(docData)})`}
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
                    {/* EN-TÊTE COMPACT (3 lignes max) + BLOC DOCUMENT À DROITE */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '61% 37%',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        paddingBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <img
                          src={logoUrl || '/logo.png'}
                          alt="Baobab Distribution Logo"
                          style={{
                            width: '44px',
                            height: '44px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            padding: '2px',
                            backgroundColor: COLOR_BLANC,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          {/* Ligne 1 : Nom & Activité */}
                          <div
                            style={{
                              fontSize: '11pt',
                              fontWeight: 900,
                              color: COLOR_NOIR,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            BAOBAB DISTRIBUTION — Négoce &amp; Distribution Agroalimentaire
                          </div>
                          {/* Ligne 2 : Adresse, téléphones, e-mail */}
                          <div
                            style={{
                              fontSize: '9.5pt',
                              color: COLOR_NOIR,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ZI Sotuba, Bamako, Mali • Tél : +223 20 22 45 88 / 76 12 34 56 • contact@baobab-distribution.ml
                          </div>
                          {/* Ligne 3 : NIF & RCCM */}
                          <div
                            style={{
                              fontSize: '9.5pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            NIF : 084129532M • RCCM : MA.BKO.2018.B.4129
                          </div>
                        </div>
                      </div>

                      {/* Bloc Document : Titre en BLEU (--marque), cadre noir, texte noir */}
                      <div
                        style={{
                          border: `1.5px solid ${COLOR_NOIR}`,
                          borderRadius: '6px',
                          padding: '7px 10px',
                          backgroundColor: COLOR_BLANC,
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10pt',
                            fontWeight: 900,
                            color: COLOR_MARQUE,
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {docTitle}
                        </div>
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11pt',
                            fontWeight: 900,
                            color: COLOR_NOIR,
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          N° {docData.number}
                        </div>
                        <div
                          style={{
                            fontSize: '9.5pt',
                            color: COLOR_NOIR,
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Date : <strong>{docData.date}</strong>
                          {docData.saleTime && !String(docData.date).includes(docData.saleTime)
                            ? ` à ${docData.saleTime}`
                            : ''}
                        </div>
                        <div
                          style={{
                            fontSize: '9.5pt',
                            color: COLOR_NOIR,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
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

                    {/* PARTIES (Émetteur, Destinataire) — Liserés en BLEU (--marque) et fond en bleu à 8 % */}
                    {page.pageNumber === 1 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '48.5% 48.5%',
                          justifyContent: 'space-between',
                          gap: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        {/* Carte Émetteur : liseré bleu + fond bleu 8 % */}
                        <div
                          style={{
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            borderLeft: `4px solid ${COLOR_MARQUE}`,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            backgroundColor: COLOR_MARQUE_8PCT,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '8.5pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              textTransform: 'uppercase',
                              borderBottom: `1px solid ${COLOR_MARQUE}`,
                              paddingBottom: '3px',
                              marginBottom: '5px',
                            }}
                          >
                            {emitterHeading}
                          </div>
                          <div style={{ fontSize: '10pt', color: COLOR_NOIR, lineHeight: 1.35 }}>
                            <div style={{ fontWeight: 800 }}>
                              {vendorName}{' '}
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5pt' }}>
                                ({vendorCode})
                              </span>
                            </div>
                            <div>{vendorTeam}</div>
                            <div>Tél : {vendorPhone}</div>
                            {docData.saleNumber && docData.saleNumber !== docData.number && (
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5pt' }}>
                                Réf. opération : {docData.saleNumber}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Carte Destinataire : liseré bleu + fond bleu 8 % */}
                        <div
                          style={{
                            border: `1.5px solid ${COLOR_MARQUE}`,
                            borderLeft: `4px solid ${COLOR_MARQUE}`,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            backgroundColor: COLOR_MARQUE_8PCT,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '8.5pt',
                              fontWeight: 800,
                              color: COLOR_NOIR,
                              textTransform: 'uppercase',
                              borderBottom: `1px solid ${COLOR_MARQUE}`,
                              paddingBottom: '3px',
                              marginBottom: '5px',
                            }}
                          >
                            {recipientHeading}
                          </div>
                          <div style={{ fontSize: '10pt', color: COLOR_NOIR, lineHeight: 1.35 }}>
                            <div style={{ fontWeight: 900, fontSize: '10.5pt' }}>
                              {clientName}
                            </div>
                            <div>{clientAddress}</div>
                            {clientContact && <div>Responsable / Gérant : {clientContact}</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                              <span>
                                Tél : <strong>{clientPhone}</strong>
                              </span>
                              {clientNinea && (
                                <span style={{ fontWeight: 700 }}>NIF : {clientNinea}</span>
                              )}
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
                          fontSize: '10pt',
                          color: COLOR_NOIR,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          <strong>Destinataire :</strong> {clientName}
                        </span>
                        <span>
                          <strong>Suite du document :</strong> N° {docData.number} (Page {page.pageNumber} / {page.totalPages})
                        </span>
                      </div>
                    )}

                    {/* TABLEAU DES LIGNES : En-tête en aplat bleu (#006B82, texte blanc), lignes alternées en bleu 8 % */}
                    {page.items.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            border: `1.5px solid ${COLOR_NOIR}`,
                            fontSize: '10.5pt',
                            color: COLOR_NOIR,
                          }}
                        >
                          <thead>
                            <tr
                              style={{
                                backgroundColor: COLOR_MARQUE_APLAT,
                                color: COLOR_BLANC,
                                borderBottom: `1.5px solid ${COLOR_NOIR}`,
                                fontSize: '10pt',
                                fontWeight: 800,
                              }}
                            >
                              <th
                                style={{
                                  width: '88px',
                                  textAlign: 'left',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                }}
                              >
                                Réf.
                              </th>
                              <th
                                style={{
                                  textAlign: 'left',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                }}
                              >
                                Désignation
                              </th>
                              <th
                                style={{
                                  width: '82px',
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Quantité
                              </th>
                              <th
                                style={{
                                  width: '132px',
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  borderRight: `1px solid ${COLOR_BLANC}`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Prix unitaire HT
                              </th>
                              <th
                                style={{
                                  width: '142px',
                                  textAlign: 'right',
                                  color: COLOR_BLANC,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Montant HT
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.items.map(({ item, globalIndex }, idx) => (
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
                                    fontSize: '10pt',
                                    borderRight: `1px solid ${COLOR_NOIR}`,
                                    whiteSpace: 'nowrap',
                                    color: COLOR_NOIR,
                                  }}
                                >
                                  {item.code}
                                </td>
                                <td
                                  style={{
                                    fontWeight: 600,
                                    borderRight: `1px solid ${COLOR_NOIR}`,
                                    whiteSpace: 'normal',
                                    wordBreak: 'normal',
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
                                    borderRight: `1px solid ${COLOR_NOIR}`,
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
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                    color: COLOR_NOIR,
                                  }}
                                >
                                  {item.total.toLocaleString('fr-FR')} FCFA
                                </td>
                              </tr>
                            ))}
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
                            fontSize: '10pt',
                            color: COLOR_NOIR,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>
                            Arrêté le présent document à la somme de :{' '}
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
                        Baobab Distribution SARL • NIF 084129532M • RCCM MA.BKO.2018.B.4129
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
