import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfSummaryCard {
  label: string;
  value: string;
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  columns: string[];
  rows: (string | number)[][];
  summaryCards?: PdfSummaryCard[];
  roleLabel?: string;
  orientation?: 'portrait' | 'landscape';
  logoUrl?: string;
}

/**
 * Définition unique de mise en page A4 Portrait partagée entre l'aperçu HTML (PrintableDocument)
 * et le générateur PDF réel (exportOfficialInvoiceA4Pdf).
 */
export const A4_DOCUMENT_LAYOUT_SPEC = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 15,
  contentWidthMm: 180,
  header: {
    leftColPct: 60,
    gapPct: 2,
    rightColPct: 38,
    leftColMm: 108.0, // 60 % de 180 mm
    gapMm: 3.6, // 2 % de 180 mm
    rightColMm: 68.4, // 38 % de 180 mm
    logoSizeMm: 21.0,
    logoGapMm: 3.5,
    leftTextMaxMm: 83.5, // 108.0 - 21.0 - 3.5
  },
  parties: {
    cardWidthPct: 49,
    gapPct: 2,
    cardWidthMm: 88.2, // 49 % de 180 mm
    gapMm: 3.6, // 2 % de 180 mm
    cardPaddingXMm: 3.5,
    cardInnerWidthMm: 81.2, // 88.2 - 7.0
  },
  tableColumnsPct: {
    ref: 22,
    designation: 36,
    qty: 12,
    unitPrice: 15,
    totalHt: 15,
  },
  tableColumnsMm: {
    ref: 39.6, // 22 % de 180 mm
    designation: 64.8, // 36 % de 180 mm
    qty: 21.6, // 12 % de 180 mm
    unitPrice: 27.0, // 15 % de 180 mm
    totalHt: 27.0, // 15 % de 180 mm
  },
  companyInfo: {
    get name(): string {
      return getDynamicCompanySettings().company_name || 'BAOBAB DISTRIBUTION';
    },
    get activity(): string {
      return getDynamicCompanySettings().slogan || 'Négoce & distribution agroalimentaire';
    },
    get addressAndPhones(): string {
      const s = getDynamicCompanySettings();
      const addr = s.address || 'ZI Sotuba, Bamako, Mali';
      const ph = s.phone || '+223 20 22 45 88 / 76 12 34 56';
      return `${addr} • Tél : ${ph}`;
    },
    get email(): string {
      const em = getDynamicCompanySettings().email || 'contact@baobab-distribution.ml';
      return em.toLowerCase().startsWith('e-mail') ? em : `E-mail : ${em}`;
    },
    get nifRccm(): string {
      const s = getDynamicCompanySettings();
      const nif = s.nif || '084129532M';
      const rccm = s.rccm || 'MA.BKO.2018.B.4129';
      return `NIF : ${nif} • RCCM : ${rccm}`;
    },
  },
};

export function getDynamicCompanySettings(): Record<string, string> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('baobab_company_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
  }
  return {
    company_name: 'Baobab Distribution SARL',
    slogan: 'Négoce et Distribution Agroalimentaire',
    address: 'Zone Industrielle de Sotuba, Bamako - Mali',
    phone: '+223 20 22 45 88 / +223 76 12 34 56',
    email: 'contact@baobab-distribution.ml',
    nif: '084129532M',
    rccm: 'MA.BKO.2018.B.4129',
  };
}

let cachedLogoDataUrl: string | null = null;
let cachedNotoRegularBase64: string | null = null;
let cachedNotoBoldBase64: string | null = null;
let fontLoadPromise: Promise<void> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(buffer).toString('base64');
}

export async function ensurePdfFontsLoaded(): Promise<void> {
  // Environnement Node.js (tests / génération serveur)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      if (!cachedNotoRegularBase64 || !cachedNotoBoldBase64) {
        const regPath = path.resolve(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
        const boldPath = path.resolve(process.cwd(), 'public/fonts/NotoSans-Bold.ttf');
        if (fs.existsSync(regPath) && fs.existsSync(boldPath)) {
          cachedNotoRegularBase64 = fs.readFileSync(regPath).toString('base64');
          cachedNotoBoldBase64 = fs.readFileSync(boldPath).toString('base64');
        }
      }
      if (!cachedLogoDataUrl) {
        const logoPath = path.resolve(process.cwd(), 'public/logo.png');
        if (fs.existsSync(logoPath)) {
          cachedLogoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
        }
      }
    } catch {
      // Fallback
    }
    return;
  }

  if (cachedNotoRegularBase64 && cachedNotoBoldBase64) return;

  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      try {
        const [regRes, boldRes] = await Promise.all([
          fetch('/fonts/NotoSans-Regular.ttf'),
          fetch('/fonts/NotoSans-Bold.ttf'),
        ]);
        if (regRes.ok && boldRes.ok) {
          const [regBuf, boldBuf] = await Promise.all([
            regRes.arrayBuffer(),
            boldRes.arrayBuffer(),
          ]);
          cachedNotoRegularBase64 = arrayBufferToBase64(regBuf);
          cachedNotoBoldBase64 = arrayBufferToBase64(boldBuf);
        }
      } catch {
        // Ignore network errors and fallback gracefully
      }
    })();
  }
  await fontLoadPromise;
}

// Préchargement immédiat côté navigateur
if (typeof window !== 'undefined') {
  ensurePdfFontsLoaded();
}

function registerUnicodeFontOnDoc(doc: jsPDF): string {
  if (cachedNotoRegularBase64 && cachedNotoBoldBase64) {
    try {
      doc.addFileToVFS('NotoSans-Regular.ttf', cachedNotoRegularBase64);
      doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      doc.addFileToVFS('NotoSans-Bold.ttf', cachedNotoBoldBase64);
      doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
      doc.setFont('NotoSans', 'normal');
      return 'NotoSans';
    } catch {
      // Fallback
    }
  }
  doc.setFont('helvetica', 'normal');
  return 'helvetica';
}

function convertImageElementToDataUrl(img: HTMLImageElement): string | null {
  try {
    if (!img.complete || img.naturalWidth === 0) return null;
    const canvas = document.createElement('canvas');
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const dx = (size - w) / 2;
    const dy = (size - h) / 2;
    ctx.drawImage(img, dx, dy, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function preloadBaobabLogo(src = '/logo.png'): void {
  if (typeof window === 'undefined') return;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const dataUrl = convertImageElementToDataUrl(img);
      if (dataUrl) {
        cachedLogoDataUrl = dataUrl;
      }
    };
    img.src = src;
  } catch {
    // Ignore preload errors
  }
}

preloadBaobabLogo('/logo.png');

export function getBaobabLogoDataUrl(preferredLogoUrl?: string): string | null {
  if (typeof document !== 'undefined') {
    const domLogo = document.querySelector(
      'img[alt="Baobab Distribution Logo"]'
    ) as HTMLImageElement | null;
    if (domLogo && domLogo.complete && domLogo.naturalWidth > 0) {
      const fromDom = convertImageElementToDataUrl(domLogo);
      if (fromDom) {
        cachedLogoDataUrl = fromDom;
        return fromDom;
      }
    }
  }
  if (cachedLogoDataUrl) {
    return cachedLogoDataUrl;
  }
  if (preferredLogoUrl) {
    preloadBaobabLogo(preferredLogoUrl);
  }
  return null;
}

function drawPdfHeaderLogo(
  doc: jsPDF,
  x: number,
  y: number,
  boxSize: number,
  fontName: string,
  logoUrl?: string
): number {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, boxSize, boxSize, 2.5, 2.5, 'F');

  const logoDataUrl = getBaobabLogoDataUrl(logoUrl);
  if (logoDataUrl) {
    try {
      const pad = 1.6;
      doc.addImage(logoDataUrl, 'PNG', x + pad, y + pad, boxSize - pad * 2, boxSize - pad * 2);
      return x + boxSize + 4;
    } catch {
      // Fallback monogram
    }
  }

  doc.setTextColor(0, 141, 169);
  doc.setFont(fontName, 'bold');
  doc.setFontSize(13);
  doc.text('B', x + boxSize / 2, y + boxSize / 2 + 2, { align: 'center' });
  return x + boxSize + 4;
}

/**
 * Conserve tous les caractères accentués français (Unicode) et normalise uniquement
 * les espaces insécables (\u202F, \u00A0) générés par toLocaleString('fr-FR').
 */
export function sanitizePdfText(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const hasUnicodeFont = Boolean(cachedNotoRegularBase64 && cachedNotoBoldBase64);
  const base = String(val).replace(/[\u202F\u00A0]/g, ' ');
  if (hasUnicodeFont) {
    return base.trim();
  }
  return base
    .replace(/•/g, '-')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .trim();
}

export function formatFcfaPdf(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `${sanitizePdfText(num.toLocaleString('fr-FR'))} FCFA`;
}

/**
 * Sépare proprement un libellé contenant un nom et une équipe (ex: "Moussa Traoré (BAO-VND-01) — Équipe...")
 * afin d'afficher le nom en gras sur la 1re ligne et l'équipe en dessous sur la 2e ligne.
 */
export function splitPartyNameAndTeam(
  rawName: string | undefined,
  explicitCode?: string,
  explicitTeam?: string
): { primaryName: string; secondaryTeam: string } {
  const cleanRaw = String(rawName || '').trim();
  let primaryName = cleanRaw || 'Baobab Distribution';
  let secondaryTeam = String(explicitTeam || '').trim();

  if (cleanRaw.includes(' — ')) {
    const [left, ...rest] = cleanRaw.split(' — ');
    primaryName = left.trim();
    const extractedRight = rest.join(' — ').trim();
    if (!secondaryTeam) {
      secondaryTeam = extractedRight;
    }
  } else if (cleanRaw.includes(' - ') && !secondaryTeam) {
    const [left, ...rest] = cleanRaw.split(' - ');
    primaryName = left.trim();
    secondaryTeam = rest.join(' - ').trim();
  }

  if (explicitCode && !primaryName.includes(explicitCode)) {
    primaryName = `${primaryName} (${explicitCode})`;
  }

  return { primaryName, secondaryTeam };
}

export interface ResolvedDocumentParties {
  docTitle: string;
  emitterHeading: string;
  emitterPrimaryBold: string;
  emitterTeamLine: string;
  emitterPhoneLine: string;
  emitterRefLine?: string;
  recipientHeading: string;
  recipientPrimaryBold: string;
  recipientTeamOrSubLine?: string;
  recipientAddressLine?: string;
  recipientContactLine?: string;
  recipientPhoneLine: string;
  recipientNineaLine?: string;
}

/**
 * Résout de manière unifiée les informations des cartes Émetteur et Destinataire
 * pour l'aperçu A4 et le PDF réel (Facture PDV, Reçu de versement, Reçu de caisse, Facture grossiste).
 */
export function resolveDocumentParties(invoice: any): ResolvedDocumentParties {
  const rawType = String(invoice?.type || 'facture').toLowerCase();
  const isReceipt = rawType === 'recu' || rawType === 'receipt';
  const isThermal = rawType === 'mini_thermique';
  const isBonCadeau = rawType === 'bon_cadeau';
  const isDemandeAchat = rawType === 'demande_achat';
  const isGrossiste = rawType === 'commande_gros' || rawType === 'facture_grossiste';

  const docTitle =
    invoice?.docTypeTitle ||
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
    invoice?.emitterTitle ||
    (isReceipt
      ? 'ÉMETTEUR / PARTIE VERSANTE'
      : isDemandeAchat
      ? 'ÉMETTEUR / MAGASIN BAOBAB'
      : 'ÉMETTEUR / AGENT BAOBAB');

  const recipientHeading =
    invoice?.recipientTitle ||
    (isReceipt
      ? 'DESTINATAIRE / CAISSE BAOBAB'
      : isDemandeAchat
      ? 'DESTINATAIRE / FOURNISSEUR'
      : 'DESTINATAIRE / CLIENT ACHETEUR');

  const rawVendorName =
    invoice?.vendor?.name ||
    invoice?.vendorName ||
    invoice?.cashierName ||
    'Dépôt Central Baobab Distribution';
  const rawVendorCode = invoice?.vendor?.code || invoice?.vendorCode || 'BAO';
  const rawVendorPhone = invoice?.vendor?.phone || invoice?.vendorPhone || '+223 20 22 45 88';
  const rawVendorTeam = invoice?.vendorTeam || 'Direction Commerciale Bamako';

  const rawClientName =
    invoice?.client?.name ||
    invoice?.pdvName ||
    invoice?.clientName ||
    'Client Partenaire Baobab';
  const rawClientAddress =
    invoice?.client?.address ||
    `${invoice?.pdvCode ? `${invoice.pdvCode} • ` : ''}${
      invoice?.pdvNeighborhood || 'Bamako, Mali'
    }`;
  const rawClientContact = invoice?.client?.contact || invoice?.pdvManager || '';
  const rawClientPhone =
    invoice?.client?.phone ||
    invoice?.pdvPhone ||
    invoice?.clientPhone ||
    '+223 76 00 00 00';
  const rawClientNinea = invoice?.client?.ninea || '';

  // Pour un reçu de versement où le vendeur + équipe ont été passés dans clientName
  if (isReceipt && !invoice?.vendorName && !invoice?.vendor?.name && String(rawClientName).includes('(')) {
    const splitVendor = splitPartyNameAndTeam(rawClientName, undefined, invoice?.vendorTeam);
    return {
      docTitle,
      emitterHeading,
      emitterPrimaryBold: splitVendor.primaryName,
      emitterTeamLine: splitVendor.secondaryTeam || 'Équipe Commerciale Bamako',
      emitterPhoneLine: `Tél : ${rawClientPhone}`,
      emitterRefLine:
        invoice?.saleNumber && invoice.saleNumber !== invoice.number
          ? `Réf. opération : ${invoice.saleNumber}`
          : undefined,
      recipientHeading,
      recipientPrimaryBold: rawVendorName,
      recipientTeamOrSubLine: 'Direction & Comptabilité — Caisse Centrale',
      recipientAddressLine: 'Localisation : ZI Sotuba, Bamako, Mali',
      recipientPhoneLine: `Tél : ${rawVendorPhone}`,
    };
  }

  const emitterSplit = splitPartyNameAndTeam(rawVendorName, rawVendorCode, rawVendorTeam);
  const recipientSplit = splitPartyNameAndTeam(rawClientName, undefined, undefined);

  return {
    docTitle,
    emitterHeading,
    emitterPrimaryBold: emitterSplit.primaryName,
    emitterTeamLine: emitterSplit.secondaryTeam || 'Direction Commerciale Bamako',
    emitterPhoneLine: `Tél : ${rawVendorPhone}`,
    emitterRefLine:
      invoice?.saleNumber && invoice.saleNumber !== invoice.number
        ? `Réf. opération : ${invoice.saleNumber}`
        : undefined,
    recipientHeading,
    recipientPrimaryBold: recipientSplit.primaryName,
    recipientTeamOrSubLine: recipientSplit.secondaryTeam || undefined,
    recipientAddressLine: rawClientAddress ? `Localisation : ${rawClientAddress}` : undefined,
    recipientContactLine: rawClientContact
      ? `Responsable / Gérant : ${rawClientContact}`
      : undefined,
    recipientPhoneLine: `Tél : ${rawClientPhone}`,
    recipientNineaLine: rawClientNinea ? `NIF : ${rawClientNinea}` : undefined,
  };
}

/**
 * Calcule la taille de police optimale pour qu'une chaîne tienne sur une seule ligne
 * dans la largeur disponible (sans coupure au milieu).
 */
function fitSingleLineFontSize(
  doc: jsPDF,
  fontName: string,
  fontStyle: 'normal' | 'bold',
  text: string,
  maxWidthMm: number,
  defaultFontSizePt: number,
  minFontSizePt = 5.5
): number {
  doc.setFont(fontName, fontStyle);
  let size = defaultFontSizePt;
  doc.setFontSize(size);
  while (size > minFontSizePt && doc.getTextWidth(text) > maxWidthMm) {
    size = Number((size - 0.35).toFixed(2));
    doc.setFontSize(size);
  }
  return size;
}

export function exportTableToPdf({
  title,
  subtitle,
  filename,
  columns,
  rows,
  summaryCards = [],
  roleLabel,
  orientation = 'landscape',
  logoUrl,
}: PdfExportOptions): void {
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const fontName = registerUnicodeFontOnDoc(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  doc.setFillColor(0, 141, 169);
  doc.rect(0, 0, pageWidth, 26, 'F');

  const headerTextX = drawPdfHeaderLogo(doc, 14, 3, 20, fontName, logoUrl);

  doc.setTextColor(255, 255, 255);
  doc.setFont(fontName, 'bold');
  doc.setFontSize(15);
  doc.text('BAOBAB DISTRIBUTION MALI', headerTextX, 11);

  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.text(
    sanitizePdfText('Entrepôt Central Sotuba — Bamako, Mali | Rapport Officiel de Gestion'),
    headerTextX,
    17
  );

  if (roleLabel) {
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.text(sanitizePdfText(roleLabel), headerTextX, 22.5);
  }

  doc.setFont(fontName, 'bold');
  doc.setFontSize(9);
  doc.text(
    sanitizePdfText(`Export PDF : ${dateStr} à ${timeStr}`),
    pageWidth - 14,
    11,
    { align: 'right' }
  );
  doc.setFont(fontName, 'normal');
  doc.setFontSize(8);
  doc.text(`Total lignes : ${rows.length}`, pageWidth - 14, 17, {
    align: 'right',
  });

  let currentY = 34;
  doc.setTextColor(15, 23, 42);
  doc.setFont(fontName, 'bold');
  doc.setFontSize(13);
  doc.text(sanitizePdfText(title), 14, currentY);

  if (subtitle) {
    currentY += 5.5;
    doc.setTextColor(100, 116, 139);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.text(sanitizePdfText(subtitle), 14, currentY);
  }

  if (summaryCards.length > 0) {
    currentY += 5;
    const count = Math.min(summaryCards.length, 4);
    const gap = 4;
    const availableWidth = pageWidth - 28;
    const cardWidth = (availableWidth - gap * (count - 1)) / count;
    const cardHeight = 15;

    summaryCards.slice(0, 4).forEach((card, idx) => {
      const x = 14 + idx * (cardWidth + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setTextColor(100, 116, 139);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.text(sanitizePdfText(card.label).toUpperCase(), x + 3, currentY + 5.5);

      doc.setTextColor(0, 141, 169);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(10);
      doc.text(sanitizePdfText(card.value), x + 3, currentY + 11.8);
    });

    currentY += cardHeight + 5;
  } else {
    currentY += 5;
  }

  const cleanColumns = columns.map((c) => sanitizePdfText(c));
  const cleanRows = rows.map((row) => row.map((cell) => sanitizePdfText(cell)));

  autoTable(doc, {
    startY: currentY,
    head: [cleanColumns],
    body:
      cleanRows.length > 0
        ? cleanRows
        : [
            [
              {
                content: sanitizePdfText('Aucune donnée à afficher pour les filtres actuels.'),
                colSpan: cleanColumns.length,
                styles: { halign: 'center', fontStyle: 'italic' },
              } as any,
            ],
          ],
    theme: 'grid',
    styles: {
      font: fontName,
      fontSize: 8,
      cellPadding: 2.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      doc.setFont(fontName, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        sanitizePdfText(
          'Baobab Distribution Mali — Document officiel généré automatiquement pour partage et archivage.'
        ),
        14,
        pageHeight - 7
      );
    },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 7, {
      align: 'right',
    });
  }

  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  doc.save(safeFilename);
}

export function getExplicitDocumentPdfFilename(invoice: any): string {
  const rawNumber = String(invoice?.number || invoice?.saleNumber || 'DOC')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const docType = String(invoice?.type || 'facture').toLowerCase();
  if (
    docType === 'mini_thermique' ||
    docType === 'ticket' ||
    docType === 'ticket_thermique'
  ) {
    return `baobab_ticket_${rawNumber}.pdf`;
  }
  if (
    docType === 'recu' ||
    docType === 'recu_caisse' ||
    docType === 'recu_versement' ||
    docType === 'receipt'
  ) {
    return `baobab_recu_${rawNumber}.pdf`;
  }
  if (docType === 'bon_cadeau') {
    return `baobab_bon_${rawNumber}.pdf`;
  }
  if (docType === 'demande_achat') {
    return `baobab_demande_achat_${rawNumber}.pdf`;
  }
  if (docType === 'commande_gros' || docType === 'facture_grossiste') {
    return `baobab_facture_${rawNumber}.pdf`;
  }
  return `baobab_facture_${rawNumber}.pdf`;
}

const UNITS_FR = [
  '',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const TENS_FR = [
  '',
  'dix',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
];

function underThousandFr(n: number): string {
  if (n === 0) return '';
  if (n < 20) return UNITS_FR[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const rem = n % 10;
    if (ten === 7 || ten === 9) {
      const sub = 10 + rem;
      const conj = ten === 7 && rem === 1 ? ' et ' : '-';
      return `${TENS_FR[ten]}${conj}${UNITS_FR[sub]}`;
    }
    if (rem === 0) {
      return ten === 8 ? 'quatre-vingts' : TENS_FR[ten];
    }
    if (rem === 1 && ten !== 8) {
      return `${TENS_FR[ten]} et un`;
    }
    return `${TENS_FR[ten]}-${UNITS_FR[rem]}`;
  }
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  const hPrefix =
    hundred === 1
      ? 'cent'
      : `${UNITS_FR[hundred]} cent${rem === 0 ? 's' : ''}`;
  return rem === 0 ? hPrefix : `${hPrefix} ${underThousandFr(rem)}`;
}

export function numberToFrenchWords(amount: number): string {
  const n = Math.round(Math.max(0, Number(amount || 0)));
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) {
    parts.push(
      millions === 1
        ? 'un million'
        : `${underThousandFr(millions)} millions`
    );
  }
  if (thousands > 0) {
    parts.push(
      thousands === 1 ? 'mille' : `${underThousandFr(thousands)} mille`
    );
  }
  if (rest > 0) {
    parts.push(underThousandFr(rest));
  }
  return parts.join(' ');
}

export function buildOfficialInvoiceA4PdfDoc(
  invoice: any,
  withTvaParam?: boolean,
  numberInWords?: string,
  logoUrl?: string
): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fontName = registerUnicodeFontOnDoc(doc);

  // PALETTE STRICTE LIMITÉE AUX 2 COULEURS DU LOGO + BLANC
  const RGB_MARQUE: [number, number, number] = [0, 141, 169];
  const RGB_MARQUE_APLAT: [number, number, number] = [0, 107, 130];
  const RGB_MARQUE_8PCT: [number, number, number] = [235, 246, 248];
  const RGB_NOIR: [number, number, number] = [0, 0, 0];
  const RGB_BLANC: [number, number, number] = [255, 255, 255];

  const pageWidth = A4_DOCUMENT_LAYOUT_SPEC.pageWidthMm; // 210 mm
  const pageHeight = A4_DOCUMENT_LAYOUT_SPEC.pageHeightMm; // 297 mm
  const margin = A4_DOCUMENT_LAYOUT_SPEC.marginMm; // 15 mm
  const contentWidth = A4_DOCUMENT_LAYOUT_SPEC.contentWidthMm; // 180 mm

  const subtotalHt = Number(invoice.subtotal ?? invoice.subtotalHt ?? invoice.total ?? 0);
  const discountAmount = Number(invoice.discountAmount || 0);
  const wholesaleDiscountAmount = Number(
    invoice.wholesaleDiscountAmount ?? invoice.wholesale_discount_amount ?? 0
  );
  const buyerTypeDisplay = sanitizePdfText(invoice.buyerType || invoice.buyer_type || '');
  const netHt = Math.max(0, subtotalHt - discountAmount);
  const withTva =
    withTvaParam !== undefined
      ? withTvaParam
      : Boolean(
          invoice.withTva ||
            Number(invoice.taxRate || invoice.tvaRate || 0) > 0 ||
            Number(invoice.taxAmount || invoice.tvaAmount || 0) > 0
        );
  const isFacture =
    invoice.type === 'facture' ||
    invoice.type === 'invoice' ||
    invoice.type === 'facture_grossiste' ||
    invoice.type === 'commande_gros';
  const tvaAmount =
    Number(invoice.taxAmount ?? invoice.tvaAmount ?? 0) > 0
      ? Number(invoice.taxAmount ?? invoice.tvaAmount ?? 0)
      : isFacture && withTva
      ? Math.round(netHt * 0.18)
      : 0;
  const totalTtc = Number(invoice.totalTtc ?? invoice.total ?? netHt + tvaAmount);

  const invNumber = sanitizePdfText(invoice.number || 'DOC-BAOBAB');
  const dateStr = sanitizePdfText(invoice.date || '');
  const timeStr = sanitizePdfText(invoice.saleTime || '');
  const paymentMethod = sanitizePdfText(invoice.paymentMethod || 'Comptant');
  const statusStr = String(invoice.status || 'Validé');
  const statusLower = statusStr.toLowerCase();
  const isCancelled = statusLower.includes('annul') || statusLower.includes('rejet');
  const isAcquittee =
    !isCancelled &&
    (invoice.isAcquittee !== undefined
      ? Boolean(invoice.isAcquittee)
      : statusLower === 'paid' ||
        (!statusLower.includes('impay') &&
          !statusLower.includes('pending') &&
          !statusLower.includes('attente') &&
          !String(invoice.paymentMethod || '').toLowerCase().includes('attente') &&
          !String(invoice.paymentMethod || '').toLowerCase().includes('crédit') &&
          !String(invoice.paymentMethod || '').toLowerCase().includes('credit')));

  const resolvedParties = resolveDocumentParties(invoice);
  const docTypeLabel = sanitizePdfText(resolvedParties.docTitle);

  // ============================================================================
  // 1. EN-TÊTE SANS CHEVAUCHEMENT :
  //    Colonne gauche = 60 % (108.0 mm), Écart = 2 % (3.6 mm), Colonne droite = 38 % (68.4 mm)
  // ============================================================================
  const leftColW = A4_DOCUMENT_LAYOUT_SPEC.header.leftColMm; // 108.0 mm
  const headerGapW = A4_DOCUMENT_LAYOUT_SPEC.header.gapMm; // 3.6 mm
  const rightColW = A4_DOCUMENT_LAYOUT_SPEC.header.rightColMm; // 68.4 mm
  const logoSize = A4_DOCUMENT_LAYOUT_SPEC.header.logoSizeMm; // 21.0 mm
  const logoGap = A4_DOCUMENT_LAYOUT_SPEC.header.logoGapMm; // 3.5 mm
  const leftTextX = margin + logoSize + logoGap; // 15 + 21 + 3.5 = 39.5 mm
  const leftTextMaxW = leftColW - logoSize - logoGap; // 83.5 mm (se termine à 123.0 mm)
  const docBoxX = margin + leftColW + headerGapW; // 15 + 108.0 + 3.6 = 126.6 mm
  const docBoxInnerW = rightColW - 6.0; // 62.4 mm

  const drawCompactHeader = (): number => {
    const topY = margin;

    // Pré-calcul des lignes de la colonne gauche (contraintes à leftTextMaxW = 83.5 mm)
    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    const compNameLines: string[] = doc.splitTextToSize(
      sanitizePdfText(A4_DOCUMENT_LAYOUT_SPEC.companyInfo.name),
      leftTextMaxW
    );

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.2);
    const compActLines: string[] = doc.splitTextToSize(
      sanitizePdfText(A4_DOCUMENT_LAYOUT_SPEC.companyInfo.activity),
      leftTextMaxW
    );

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.6);
    const compAddrLines: string[] = doc.splitTextToSize(
      sanitizePdfText(A4_DOCUMENT_LAYOUT_SPEC.companyInfo.addressAndPhones),
      leftTextMaxW
    );
    const compEmailLines: string[] = doc.splitTextToSize(
      sanitizePdfText(A4_DOCUMENT_LAYOUT_SPEC.companyInfo.email),
      leftTextMaxW
    );

    doc.setFont(fontName, 'bold');
    doc.setFontSize(7.6);
    const compNifLines: string[] = doc.splitTextToSize(
      sanitizePdfText(A4_DOCUMENT_LAYOUT_SPEC.companyInfo.nifRccm),
      leftTextMaxW
    );

    const leftTotalLinesHeight =
      compNameLines.length * 3.8 +
      compActLines.length * 3.5 +
      compAddrLines.length * 3.3 +
      compEmailLines.length * 3.3 +
      compNifLines.length * 3.4 +
      2.0;

    // Pré-calcul des lignes du cadre de droite (38 % = 68.4 mm, intérieur 62.4 mm)
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    const titleLines: string[] = doc.splitTextToSize(docTypeLabel, docBoxInnerW);

    const rawDocNumText = `N° ${invNumber}`;
    const docNumFontSize = fitSingleLineFontSize(
      doc,
      fontName,
      'bold',
      rawDocNumText,
      docBoxInnerW,
      9.2,
      6.0
    );
    doc.setFont(fontName, 'bold');
    doc.setFontSize(docNumFontSize);
    const docNumLines: string[] = doc.splitTextToSize(rawDocNumText, docBoxInnerW);

    const fullDate =
      timeStr && !dateStr.includes(timeStr) ? `${dateStr} à ${timeStr}` : dateStr;
    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.8);
    const dateLines: string[] = doc.splitTextToSize(
      sanitizePdfText(`Date : ${fullDate}`),
      docBoxInnerW
    );
    const reglementLines: string[] = doc.splitTextToSize(
      sanitizePdfText(`Règlement : ${paymentMethod}`),
      docBoxInnerW
    );

    const rightBoxContentH =
      3.5 +
      titleLines.length * 3.7 +
      docNumLines.length * 3.8 +
      dateLines.length * 3.4 +
      reglementLines.length * 3.4 +
      2.5;

    const headerBoxH = Math.max(logoSize + 2, leftTotalLinesHeight, rightBoxContentH);

    // Fond blanc propre de l'en-tête
    doc.setFillColor(...RGB_BLANC);
    doc.rect(0, 0, pageWidth, topY + headerBoxH + 5, 'F');

    // Dessin du logo à gauche (colonne 60 %)
    doc.setDrawColor(...RGB_MARQUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, topY, logoSize, logoSize, 2, 2, 'D');
    const logoDataUrl = getBaobabLogoDataUrl(logoUrl);
    if (logoDataUrl) {
      try {
        doc.addImage(
          logoDataUrl,
          'PNG',
          margin + 1.0,
          topY + 1.0,
          logoSize - 2.0,
          logoSize - 2.0
        );
      } catch {
        doc.setFont(fontName, 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...RGB_MARQUE);
        doc.text('B', margin + logoSize / 2, topY + logoSize / 2 + 2, { align: 'center' });
      }
    } else {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...RGB_MARQUE);
      doc.text('B', margin + logoSize / 2, topY + logoSize / 2 + 2, { align: 'center' });
    }

    // Dessin du texte société à gauche (strictement borné à leftTextMaxW)
    let curLeftY = topY + 3.4;
    doc.setTextColor(...RGB_NOIR);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    compNameLines.forEach((line) => {
      doc.text(line, leftTextX, curLeftY);
      curLeftY += 3.8;
    });

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.2);
    compActLines.forEach((line) => {
      doc.text(line, leftTextX, curLeftY);
      curLeftY += 3.5;
    });

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.6);
    compAddrLines.forEach((line) => {
      doc.text(line, leftTextX, curLeftY);
      curLeftY += 3.3;
    });
    compEmailLines.forEach((line) => {
      doc.text(line, leftTextX, curLeftY);
      curLeftY += 3.3;
    });

    doc.setFont(fontName, 'bold');
    doc.setFontSize(7.6);
    compNifLines.forEach((line) => {
      doc.text(line, leftTextX, curLeftY);
      curLeftY += 3.4;
    });

    // Dessin du cadre document à droite (largeur fixe 38 % = 68.4 mm)
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.35);
    doc.roundedRect(docBoxX, topY, rightColW, headerBoxH, 1.5, 1.5, 'FD');

    const rightTextX = docBoxX + rightColW - 3.0;
    let curRightY = topY + 4.2;

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...RGB_MARQUE);
    titleLines.forEach((line) => {
      doc.text(line, rightTextX, curRightY, { align: 'right' });
      curRightY += 3.7;
    });

    doc.setFont(fontName, 'bold');
    doc.setFontSize(docNumFontSize);
    doc.setTextColor(...RGB_NOIR);
    docNumLines.forEach((line) => {
      doc.text(line, rightTextX, curRightY, { align: 'right' });
      curRightY += 3.8;
    });

    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...RGB_NOIR);
    dateLines.forEach((line) => {
      doc.text(line, rightTextX, curRightY, { align: 'right' });
      curRightY += 3.4;
    });
    reglementLines.forEach((line) => {
      doc.text(line, rightTextX, curRightY, { align: 'right' });
      curRightY += 3.4;
    });

    // Barre BLEUE (--marque) de 2 mm sous l'en-tête
    const barY = topY + headerBoxH + 2.0;
    doc.setFillColor(...RGB_MARQUE);
    doc.rect(margin, barY, contentWidth, 2.0, 'F');

    return barY + 4.5;
  };

  const partiesY = drawCompactHeader();

  // ============================================================================
  // 2. CARTES ÉMETTEUR ET DESTINATAIRE :
  //    Deux cartes de 49 % de largeur chacune (88.2 mm), écart 2 % (3.6 mm).
  //    Le nom (en gras) et l'équipe passent sur deux lignes distinctes, avec retour à la ligne.
  // ============================================================================
  const partyW = A4_DOCUMENT_LAYOUT_SPEC.parties.cardWidthMm; // 88.2 mm (49 %)
  const partyGap = A4_DOCUMENT_LAYOUT_SPEC.parties.gapMm; // 3.6 mm (2 %)
  const cardPadX = A4_DOCUMENT_LAYOUT_SPEC.parties.cardPaddingXMm; // 3.5 mm
  const cardInnerW = A4_DOCUMENT_LAYOUT_SPEC.parties.cardInnerWidthMm; // 81.2 mm
  const destX = margin + partyW + partyGap; // 15 + 88.2 + 3.6 = 106.8 mm

  interface WrappedPartyEntry {
    lines: string[];
    bold: boolean;
    fontSize: number;
    lineStep: number;
  }

  const buildWrappedCardEntries = (
    primaryBold: string,
    secondaryLines: Array<{ text?: string; bold?: boolean }>
  ): { entries: WrappedPartyEntry[]; totalHeight: number } => {
    const entries: WrappedPartyEntry[] = [];
    let height = 8.5; // espace sous le titre de la carte

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.0);
    const boldWrapped: string[] = doc.splitTextToSize(sanitizePdfText(primaryBold), cardInnerW);
    entries.push({
      lines: boldWrapped,
      bold: true,
      fontSize: 9.0,
      lineStep: 3.8,
    });
    height += boldWrapped.length * 3.8 + 0.6;

    secondaryLines.forEach((item) => {
      if (!item.text) return;
      const isBold = Boolean(item.bold);
      doc.setFont(fontName, isBold ? 'bold' : 'normal');
      doc.setFontSize(8.0);
      const wrapped: string[] = doc.splitTextToSize(sanitizePdfText(item.text), cardInnerW);
      entries.push({
        lines: wrapped,
        bold: isBold,
        fontSize: 8.0,
        lineStep: 3.5,
      });
      height += wrapped.length * 3.5 + 0.4;
    });

    return { entries, totalHeight: height + 2.2 };
  };

  const emitterCardData = buildWrappedCardEntries(resolvedParties.emitterPrimaryBold, [
    { text: resolvedParties.emitterTeamLine },
    { text: resolvedParties.emitterPhoneLine },
    { text: resolvedParties.emitterRefLine },
  ]);

  const recipientCardData = buildWrappedCardEntries(resolvedParties.recipientPrimaryBold, [
    { text: resolvedParties.recipientTeamOrSubLine },
    { text: resolvedParties.recipientAddressLine },
    { text: resolvedParties.recipientContactLine },
    {
      text: resolvedParties.recipientNineaLine
        ? `${resolvedParties.recipientPhoneLine}   •   ${resolvedParties.recipientNineaLine}`
        : resolvedParties.recipientPhoneLine,
    },
  ]);

  const partyH = Math.max(26, emitterCardData.totalHeight, recipientCardData.totalHeight);

  const drawPartyCard = (
    x: number,
    y: number,
    heading: string,
    entries: WrappedPartyEntry[]
  ) => {
    doc.setFillColor(...RGB_MARQUE_8PCT);
    doc.setDrawColor(...RGB_MARQUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, partyW, partyH, 1.5, 1.5, 'FD');
    doc.setFillColor(...RGB_MARQUE);
    doc.rect(x, y, 1.3, partyH, 'F');
    doc.setLineWidth(0.2);
    doc.line(x + 3, y + 6.2, x + partyW - 3, y + 6.2);

    doc.setFont(fontName, 'bold');
    const headingSize = fitSingleLineFontSize(
      doc,
      fontName,
      'bold',
      sanitizePdfText(heading),
      cardInnerW,
      7.5,
      6.0
    );
    doc.setFontSize(headingSize);
    doc.setTextColor(...RGB_NOIR);
    doc.text(sanitizePdfText(heading), x + cardPadX, y + 4.7);

    let curY = y + 10.2;
    entries.forEach((entry) => {
      doc.setFont(fontName, entry.bold ? 'bold' : 'normal');
      doc.setFontSize(entry.fontSize);
      doc.setTextColor(...RGB_NOIR);
      entry.lines.forEach((line) => {
        doc.text(line, x + cardPadX, curY);
        curY += entry.lineStep;
      });
      curY += 0.3;
    });
  };

  drawPartyCard(margin, partiesY, resolvedParties.emitterHeading, emitterCardData.entries);
  drawPartyCard(destX, partiesY, resolvedParties.recipientHeading, recipientCardData.entries);

  // ============================================================================
  // 3. TABLEAU À LARGEURS DÉFINIES :
  //    Réf. 22 % (39.6 mm), Désignation 36 % (64.8 mm), Quantité 12 % (21.6 mm),
  //    Prix unitaire HT 15 % (27.0 mm), Montant HT 15 % (27.0 mm).
  //    Réf. et Montants sur une seule ligne (police réduite si besoin), sans coupure.
  // ============================================================================
  const items =
    Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items
      : [
          {
            code: 'ART-01',
            name: 'Marchandises Baobab Distribution',
            qty: 1,
            price: subtotalHt,
            total: subtotalHt,
          },
        ];

  const tableHead = [
    [
      sanitizePdfText('Réf.'),
      sanitizePdfText('Désignation'),
      sanitizePdfText('Quantité'),
      sanitizePdfText('Prix unitaire HT'),
      sanitizePdfText('Montant HT'),
    ],
  ];

  const tableRows = items.map((it: any) => [
    sanitizePdfText(it.code || 'ART'),
    sanitizePdfText(it.description || it.name || 'Article'),
    sanitizePdfText(String(it.quantity ?? it.qty ?? 1)),
    formatFcfaPdf(it.unitPrice ?? it.price ?? 0),
    formatFcfaPdf(it.total ?? 0),
  ]);

  const colWidthsMm = [
    A4_DOCUMENT_LAYOUT_SPEC.tableColumnsMm.ref, // 39.6 mm (22 %)
    A4_DOCUMENT_LAYOUT_SPEC.tableColumnsMm.designation, // 64.8 mm (36 %)
    A4_DOCUMENT_LAYOUT_SPEC.tableColumnsMm.qty, // 21.6 mm (12 %)
    A4_DOCUMENT_LAYOUT_SPEC.tableColumnsMm.unitPrice, // 27.0 mm (15 %)
    A4_DOCUMENT_LAYOUT_SPEC.tableColumnsMm.totalHt, // 27.0 mm (15 %)
  ];

  autoTable(doc, {
    startY: partiesY + partyH + 4.5,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: fontName,
      fontSize: 8.8,
      cellPadding: 2.0,
      textColor: RGB_NOIR,
      fillColor: RGB_BLANC,
      lineColor: RGB_NOIR,
      lineWidth: 0.25,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      font: fontName,
      fillColor: RGB_MARQUE_APLAT,
      textColor: RGB_BLANC,
      fontStyle: 'bold',
      fontSize: 8.5,
      lineColor: RGB_NOIR,
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: RGB_MARQUE_8PCT,
    },
    columnStyles: {
      0: { cellWidth: colWidthsMm[0], halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: colWidthsMm[1], halign: 'left' },
      2: { cellWidth: colWidthsMm[2], halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: colWidthsMm[3], halign: 'right' },
      4: { cellWidth: colWidthsMm[4], halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      const colIdx = data.column.index;
      // En-têtes : s'assurer qu'aucun titre de colonne ne se coupe
      if (data.section === 'head') {
        if (colIdx >= 2) {
          data.cell.styles.halign = 'right';
        }
        const rawHead = String(data.cell.raw || '');
        const maxW = colWidthsMm[colIdx] - 4.2;
        const fitted = fitSingleLineFontSize(doc, fontName, 'bold', rawHead, maxW, 8.5, 6.2);
        data.cell.styles.fontSize = fitted;
      }

      // Corps : Réf. (col 0), Quantité (col 2), Prix unitaire HT (col 3), Montant HT (col 4) sur 1 seule ligne
      if (data.section === 'body' && (colIdx === 0 || colIdx === 2 || colIdx === 3 || colIdx === 4)) {
        const rawText = String(data.cell.raw || '');
        const isBold = colIdx === 0 || colIdx === 2 || colIdx === 4;
        const maxW = colWidthsMm[colIdx] - 4.4;
        const fitted = fitSingleLineFontSize(
          doc,
          fontName,
          isBold ? 'bold' : 'normal',
          rawText,
          maxW,
          8.8,
          5.2
        );
        data.cell.styles.fontSize = fitted;
      }
    },
    willDrawCell: (data) => {
      const colIdx = data.column.index;
      // Garantir une seule ligne stricte (nowrap) pour Réf., Quantité, Prix unitaire HT et Montant HT
      if (
        (data.section === 'body' || data.section === 'head') &&
        (colIdx === 0 || colIdx === 2 || colIdx === 3 || colIdx === 4)
      ) {
        if (Array.isArray(data.cell.text) && data.cell.text.length > 1) {
          const singleLine = String(data.cell.raw || data.cell.text.join(' '));
          data.cell.text = [singleLine];
          const maxW = colWidthsMm[colIdx] - 4.2;
          const fitted = fitSingleLineFontSize(
            doc,
            fontName,
            data.cell.styles.fontStyle === 'bold' ? 'bold' : 'normal',
            singleLine,
            maxW,
            data.cell.styles.fontSize || 8.5,
            5.0
          );
          data.cell.styles.fontSize = fitted;
          doc.setFontSize(fitted);
        }
      }
    },
    margin: {
      top: partiesY,
      left: margin,
      right: margin,
      bottom: tableRows.length > 9 ? 88 : 20,
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawCompactHeader();
      }
    },
  });

  let finalY = (doc as any).lastAutoTable?.finalY || 140;
  if (finalY + 73 > pageHeight - 15) {
    doc.addPage();
    finalY = drawCompactHeader();
  }

  // ============================================================================
  // 4. BLOC TOTAUX, RÈGLEMENTS, ARRÊTÉ EN TOUTES LETTRES & SIGNATURES
  // ============================================================================
  const summaryBoxW = 80;
  const summaryBoxX = pageWidth - margin - summaryBoxW;
  const summaryBoxY = finalY + 4.5;
  const extraDiscountRows = (discountAmount > 0 ? 1 : 0) + (wholesaleDiscountAmount > 0 ? 1 : 0);
  const summaryBoxH = 28 + extraDiscountRows * 5.5;
  const totalTtcBarH = 9;

  doc.setFillColor(...RGB_BLANC);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.35);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxW, summaryBoxH, 1.5, 1.5, 'FD');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(...RGB_NOIR);
  doc.text('Total HT :', summaryBoxX + 3, summaryBoxY + 5.8);
  doc.text(formatFcfaPdf(subtotalHt), summaryBoxX + summaryBoxW - 3, summaryBoxY + 5.8, {
    align: 'right',
  });

  let lineY = summaryBoxY + 11.5;
  if (wholesaleDiscountAmount > 0) {
    doc.setFont(fontName, 'bold');
    doc.text(
      sanitizePdfText('Remise grossiste :'),
      summaryBoxX + 3,
      lineY
    );
    doc.text(`- ${formatFcfaPdf(wholesaleDiscountAmount)}`, summaryBoxX + summaryBoxW - 3, lineY, {
      align: 'right',
    });
    lineY += 5.5;
  }
  if (discountAmount > 0) {
    doc.setFont(fontName, 'bold');
    doc.text(
      sanitizePdfText(`Remise (${invoice.discountPercent || 0} %) :`),
      summaryBoxX + 3,
      lineY
    );
    doc.text(`- ${formatFcfaPdf(discountAmount)}`, summaryBoxX + summaryBoxW - 3, lineY, {
      align: 'right',
    });
    lineY += 5.5;
  }

  if ((isFacture && withTva) || tvaAmount > 0) {
    doc.setFont(fontName, 'bold');
    doc.text('TVA (18 %) :', summaryBoxX + 3, lineY);
    doc.text(`+ ${formatFcfaPdf(tvaAmount)}`, summaryBoxX + summaryBoxW - 3, lineY, {
      align: 'right',
    });
  } else {
    doc.setFont(fontName, 'normal');
    doc.text('TVA (0 % — Sans TVA) :', summaryBoxX + 3, lineY);
    doc.text('0 FCFA', summaryBoxX + summaryBoxW - 3, lineY, { align: 'right' });
  }

  const ttcBarY = summaryBoxY + summaryBoxH - totalTtcBarH;
  doc.setFillColor(...RGB_MARQUE_APLAT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.35);
  doc.rect(summaryBoxX, ttcBarY, summaryBoxW, totalTtcBarH, 'FD');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(10.0);
  doc.setTextColor(...RGB_BLANC);
  doc.text('TOTAL TTC', summaryBoxX + 3, ttcBarY + 6.2);
  doc.text(formatFcfaPdf(totalTtc), summaryBoxX + summaryBoxW - 3, ttcBarY + 6.2, {
    align: 'right',
  });

  // Carte Règlements & Cachet Statut à gauche
  const leftBoxW = contentWidth - summaryBoxW - 4; // 96 mm
  const leftBoxInnerW = leftBoxW - 6; // 90 mm
  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, summaryBoxY, leftBoxW, summaryBoxH, 1.5, 1.5, 'FD');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...RGB_NOIR);
  doc.text(sanitizePdfText('RÈGLEMENTS & PAIEMENTS :'), margin + 3, summaryBoxY + 5);
  doc.setLineWidth(0.2);
  doc.line(margin + 3, summaryBoxY + 6.4, margin + leftBoxW - 3, summaryBoxY + 6.4);

  doc.setFont(fontName, 'normal');
  doc.setFontSize(8.0);
  const totalBoxes = (items || []).reduce(
    (acc: number, it: any) => acc + Number(it.quantity ?? it.qty ?? 0),
    0
  );
  const modeQtyLines: string[] = doc.splitTextToSize(
    sanitizePdfText(
      `Règlement : ${paymentMethod} • Quantité : ${totalBoxes} unité(s)/carton(s)${
        buyerTypeDisplay ? ` • Acheteur : ${buyerTypeDisplay}` : ''
      }`
    ),
    leftBoxInnerW
  );
  modeQtyLines.slice(0, 2).forEach((l, idx) => {
    doc.text(l, margin + 3, summaryBoxY + 10.8 + idx * 3.6);
  });

  if (invoice.versementRef || invoice.paymentRef) {
    const refVersLines: string[] = doc.splitTextToSize(
      sanitizePdfText(`Réf. versement : ${invoice.paymentRef || invoice.versementRef}`),
      leftBoxInnerW
    );
    doc.text(refVersLines[0], margin + 3, summaryBoxY + 16.2);
  }

  // Cachet statut par la forme
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...RGB_NOIR);
  doc.text('Cachet statut :', margin + 3, summaryBoxY + summaryBoxH - 4.2);

  const stampW = 38;
  const stampH = 7.8;
  const stampX = margin + leftBoxW - stampW - 3;
  const stampY = summaryBoxY + summaryBoxH - stampH - 2;

  if (isCancelled) {
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.5);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...RGB_NOIR);
    doc.text(sanitizePdfText('ANNULÉE'), stampX + stampW / 2, stampY + 5.3, { align: 'center' });
    doc.setLineWidth(0.55);
    doc.line(stampX + 1.5, stampY + stampH - 1.2, stampX + stampW - 1.5, stampY + 1.2);
  } else if (isAcquittee) {
    doc.setFillColor(...RGB_MARQUE_APLAT);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.4);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...RGB_BLANC);
    doc.text(sanitizePdfText('ACQUITTÉE'), stampX + stampW / 2, stampY + 5.5, {
      align: 'center',
      angle: 3,
    });
  } else {
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.5);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...RGB_NOIR);
    doc.text(sanitizePdfText('À PAYER'), stampX + stampW / 2, stampY + 5.3, { align: 'center' });
  }

  // Arrêté en toutes lettres (mesuré avec splitTextToSize dans contentWidth - 6)
  const wordsY = summaryBoxY + summaryBoxH + 3.5;
  const textWords = numberInWords
    ? `${sanitizePdfText(numberInWords).toUpperCase()} FRANCS CFA (XOF).`
    : `${sanitizePdfText(numberToFrenchWords(totalTtc)).toUpperCase()} FRANCS CFA (XOF).`;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.2);
  const wrappedWords: string[] = doc.splitTextToSize(textWords, contentWidth - 6);
  const wordsBoxH = Math.max(11, 6.2 + wrappedWords.length * 3.6);

  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, wordsY, contentWidth, wordsBoxH, 1.5, 1.5, 'FD');
  doc.setFont(fontName, 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...RGB_NOIR);
  doc.text(sanitizePdfText('Arrêté en toutes lettres :'), margin + 3, wordsY + 4.3);
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.2);
  wrappedWords.forEach((wLine, idx) => {
    doc.text(wLine, margin + 3, wordsY + 8.3 + idx * 3.6);
  });

  // Signatures (3 colonnes : cadres noirs sur fond blanc, texte noir contraint à chaque boîte)
  const sigY = wordsY + wordsBoxH + 3.5;
  const sigBoxW = (contentWidth - 8) / 3; // 57.33 mm
  const sigBoxH = 20;

  const vendorCode = invoice.vendor?.code || invoice.vendorCode || 'BAO';
  const sigLabels = [
    sanitizePdfText(invoice.sigLeftLabel || 'Le Destinataire / Client'),
    sanitizePdfText(invoice.sigCenterLabel || `L'Émetteur (${vendorCode})`),
    sanitizePdfText(invoice.sigRightLabel || 'Direction & Comptabilité'),
  ];

  sigLabels.forEach((lbl, idx) => {
    const sx = margin + idx * (sigBoxW + 4);
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.25);
    doc.roundedRect(sx, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'FD');
    doc.setFont(fontName, 'bold');
    const sigFontSize = fitSingleLineFontSize(doc, fontName, 'bold', lbl, sigBoxW - 4, 8.0, 6.2);
    doc.setFontSize(sigFontSize);
    doc.setTextColor(...RGB_NOIR);
    doc.text(lbl, sx + sigBoxW / 2, sigY + 5, { align: 'center' });
    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.5);
    doc.text('Signature et cachet', sx + sigBoxW / 2, sigY + sigBoxH - 3, { align: 'center' });
  });

  // Pied de page "Page X / Y" en noir sur toutes les pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...RGB_NOIR);
    const dynSettings = getDynamicCompanySettings();
    const footerCompany = dynSettings.company_name || 'Baobab Distribution SARL';
    const footerNif = dynSettings.nif || '084129532M';
    const footerRccm = dynSettings.rccm || 'MA.BKO.2018.B.4129';
    doc.text(
      sanitizePdfText(`${footerCompany} • NIF ${footerNif} • RCCM ${footerRccm}`),
      margin,
      pageHeight - 9.5
    );
    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 9.5, {
      align: 'right',
    });
  }

  const pdfFilename = getExplicitDocumentPdfFilename(invoice);
  return { doc, filename: pdfFilename };
}

export async function exportOfficialInvoiceA4Pdf(
  invoice: any,
  withTvaParam?: boolean,
  numberInWords?: string,
  logoUrl?: string
): Promise<void> {
  await ensurePdfFontsLoaded();
  const { doc, filename } = buildOfficialInvoiceA4PdfDoc(
    invoice,
    withTvaParam,
    numberInWords,
    logoUrl
  );
  doc.save(filename);
}

/**
 * Convertit le logo en image noir et blanc (niveaux de gris contrastés sur fond blanc)
 * pour le ticket thermique 80 mm.
 */
async function buildBlackAndWhiteLogoDataUrl(logoSrc?: string): Promise<{ dataUrl: string; aspect: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const srcToLoad =
    logoSrc && (logoSrc.startsWith('data:image/') || logoSrc.startsWith('/') || logoSrc.startsWith('http'))
      ? logoSrc
      : cachedLogoDataUrl || '/api/settings/logo-file';

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth || img.width || 240);
        const h = Math.max(1, img.naturalHeight || img.height || 100);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3] / 255;
          // Composite over white
          const rw = Math.round(r * a + 255 * (1 - a));
          const gw = Math.round(g * a + 255 * (1 - a));
          const bw = Math.round(b * a + 255 * (1 - a));
          let lum = Math.round(0.299 * rw + 0.587 * gw + 0.114 * bw);
          // Accentuer le contraste N&B pour imprimante thermique
          lum = lum > 220 ? 255 : Math.max(0, Math.round((lum - 35) * 0.85));
          data[i] = lum;
          data[i + 1] = lum;
          data[i + 2] = lum;
          data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          aspect: h / w,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = srcToLoad;
  });
}

/**
 * Génère le PDF réel du TICKET THERMIQUE 80 mm (largeur 80 mm, hauteur dynamique selon le contenu,
 * marges de 3 mm, fond blanc, texte noir, police à chiffres de largeur constante, logo N&B 40 mm).
 */
export async function buildThermalTicket80mmPdfDoc(
  ticket: any,
  logoUrl?: string
): Promise<{ doc: jsPDF; filename: string }> {
  await ensurePdfFontsLoaded();
  const bwLogo = await buildBlackAndWhiteLogoDataUrl(logoUrl);

  const pageWidth = 80; // 80 mm
  const margin = 3; // 3 mm
  const contentWidth = pageWidth - margin * 2; // 74 mm
  const centerX = pageWidth / 2;

  const rawItems = Array.isArray(ticket?.items) ? ticket.items : [];
  const items = rawItems.map((it: any) => {
    const qty = Number(it.quantity ?? it.qty ?? it.qtyBoxes ?? 1);
    const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
    const total = Number(it.total ?? qty * unitPrice);
    const name = String(it.description || it.name || 'Article Baobab').trim();
    const code = String(it.code || '').trim();
    return {
      designation: code && !name.includes(code) ? `${name} (${code})` : name,
      qty,
      unitPrice,
      total,
    };
  });

  const computedHt = items.reduce((s: number, it: any) => s + it.total, 0);
  const subtotalHt = Number(ticket?.subtotal ?? ticket?.subtotalHt ?? computedHt ?? 0);
  const wholesaleDiscountAmount = Number(
    ticket?.wholesaleDiscountAmount ?? ticket?.wholesale_discount_amount ?? 0
  );
  const buyerTypeDisplay = String(ticket?.buyerType || ticket?.buyer_type || '').trim();
  const withTva =
    ticket?.withTva !== undefined
      ? Boolean(ticket.withTva)
      : Number(ticket?.taxRate ?? ticket?.tvaRate ?? 0) > 0 ||
        Number(ticket?.taxAmount ?? ticket?.tvaAmount ?? 0) > 0;
  const tvaRate = withTva ? Number(ticket?.taxRate ?? ticket?.tvaRate ?? 18) : 0;
  const tvaAmount = withTva
    ? Number(ticket?.taxAmount ?? ticket?.tvaAmount ?? Math.round(subtotalHt * (tvaRate / 100)))
    : 0;
  const totalTtc = Number(ticket?.totalTtc ?? ticket?.total ?? subtotalHt + tvaAmount);

  const ticketNumber = String(
    ticket?.thermalTicketNumber ||
      ticket?.ticketNumber ||
      (String(ticket?.number || '').startsWith('TKT-')
        ? ticket.number
        : String(ticket?.saleNumber || ticket?.number || 'TKT-THERM-2026').replace(/^VTE-/, 'TKT-THERM-'))
  );
  const saleNumber = String(
    ticket?.saleNumber ||
      (String(ticket?.number || '').startsWith('VTE-')
        ? ticket.number
        : ticketNumber.replace(/^TKT-THERM-/, 'VTE-'))
  );
  const rawDateStr = String(ticket?.rawDate || ticket?.date || new Date().toISOString().slice(0, 10));
  const saleTimeStr = String(ticket?.saleTime || '10:30');
  const dateTimeDisplay = rawDateStr.includes('à') || rawDateStr.includes(':')
    ? rawDateStr
    : `${rawDateStr} à ${saleTimeStr}`;

  const vendorName = String(ticket?.vendor?.name || ticket?.vendorName || ticket?.cashierName || 'Oumar Konaté');
  const vendorCode = String(ticket?.vendor?.code || ticket?.vendorCode || 'BAO-V01');
  const vendorDisplay = vendorName.includes(vendorCode) ? vendorName : `${vendorName} (${vendorCode})`;
  const pdvDisplay = String(
    ticket?.pdvName
      ? `${ticket.pdvName}${ticket.pdvNeighborhood ? ` (${ticket.pdvNeighborhood})` : ''}`
      : ticket?.client?.name || ticket?.clientName || 'Point de vente PDV'
  );
  const paymentMethod = String(ticket?.paymentMethod || 'Comptant');
  const payLower = paymentMethod.toLowerCase();
  const isAcquittee =
    ticket?.isAcquittee !== undefined
      ? Boolean(ticket.isAcquittee)
      : !payLower.includes('crédit') &&
        !payLower.includes('credit') &&
        !payLower.includes('attente') &&
        !String(ticket?.status || '').toLowerCase().includes('payer');
  const mentionStatut = isAcquittee ? 'ACQUITTÉ' : 'À PAYER';
  const amountWords = `${numberToFrenchWords(totalTtc)} FRANCS CFA`;

  const formatTicketNum = (val: number) =>
    Math.round(Number(val || 0))
      .toLocaleString('fr-FR')
      .replace(/[\u202F\u00A0]/g, ' ');

  // Mesure préalable de la hauteur nécessaire avec un document temporaire
  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 220] });
  const fontName = registerUnicodeFontOnDoc(measureDoc);
  measureDoc.setFont(fontName, 'normal');

  const logoWidthMm = 40; // 40 mm
  const logoHeightMm = bwLogo ? Math.min(20, Math.max(10, Math.round(logoWidthMm * bwLogo.aspect * 10) / 10)) : 12;

  measureDoc.setFontSize(7.5);
  const pdvLines = measureDoc.splitTextToSize(sanitizePdfText(`PDV : ${pdvDisplay}`), contentWidth);
  const vendorLines = measureDoc.splitTextToSize(sanitizePdfText(`Vendeur : ${vendorDisplay}`), contentWidth);
  const wordsLines = measureDoc.splitTextToSize(
    sanitizePdfText(`Arrêté le présent ticket à la somme de : ${amountWords}.`),
    contentWidth
  );

  let itemsHeightMm = 0;
  items.forEach((it: any) => {
    measureDoc.setFont(fontName, 'bold');
    measureDoc.setFontSize(7.8);
    const desigLines = measureDoc.splitTextToSize(sanitizePdfText(it.designation), contentWidth);
    itemsHeightMm += desigLines.length * 3.4 + 4.4;
  });

  const estimatedHeightMm = Math.max(
    135,
    margin +
      logoHeightMm +
      24 + // Société, adresse, tél, NIF
      10 + // Titre TICKET DE VENTE
      16 + // N° ticket, N° vente, Date/heure
      vendorLines.length * 3.5 +
      pdvLines.length * 3.5 +
      (buyerTypeDisplay ? 3.8 : 0) +
      6 + // Séparateur + en-tête colonnes
      itemsHeightMm +
      (wholesaleDiscountAmount > 0 ? 4.0 : 0) +
      (withTva ? 18 : 14) + // Totaux HT, TVA, TTC
      15 + // Mode de règlement + mention ACQUITTÉ / À PAYER
      wordsLines.length * 3.3 +
      18 + // Merci + pied NIF/RCCM
      margin
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, estimatedHeightMm],
  });
  const activeFont = registerUnicodeFontOnDoc(doc);

  // Fond blanc intégral, texte noir
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, estimatedHeightMm, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  let y = margin + 1;

  // 1. Logo Baobab en noir et blanc (40 mm de large, centré)
  if (bwLogo?.dataUrl) {
    try {
      doc.addImage(bwLogo.dataUrl, 'PNG', (pageWidth - logoWidthMm) / 2, y, logoWidthMm, logoHeightMm);
      y += logoHeightMm + 3.5;
    } catch {
      y += 2;
    }
  } else {
    doc.setLineWidth(0.35);
    doc.rect((pageWidth - 40) / 2, y, 40, 9);
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.5);
    doc.text('BAOBAB', centerX, y + 6, { align: 'center' });
    y += 12.5;
  }

  // 2. Nom, adresse, téléphone, NIF (centrés)
  const dynTicketSettings = getDynamicCompanySettings();
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(dynTicketSettings.company_name || A4_DOCUMENT_LAYOUT_SPEC.companyInfo.name), centerX, y, { align: 'center' });
  y += 3.8;

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.2);
  doc.text(sanitizePdfText(dynTicketSettings.slogan || A4_DOCUMENT_LAYOUT_SPEC.companyInfo.activity), centerX, y, { align: 'center' });
  y += 3.4;
  doc.text(sanitizePdfText(dynTicketSettings.address || 'Zone Industrielle de Sotuba, Bamako — Mali'), centerX, y, { align: 'center' });
  y += 3.4;
  doc.text(sanitizePdfText(`Tél : ${dynTicketSettings.phone || '+223 20 22 45 88 / +223 76 12 34 56'}`), centerX, y, { align: 'center' });
  y += 3.4;
  doc.setFont(activeFont, 'bold');
  doc.text(sanitizePdfText(`NIF : ${dynTicketSettings.nif || '084129532M'}`), centerX, y, { align: 'center' });
  y += 3.2;

  // Séparateur
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4.2;

  // 3. Titre "TICKET DE VENTE"
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.5);
  doc.text('TICKET DE VENTE', centerX, y, { align: 'center' });
  y += 2.2;
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.8;

  // 4. Métadonnées : N° du ticket, N° de vente, date et heure, vendeur (code), PDV
  doc.setFontSize(7.5);
  const drawMetaRow = (label: string, val: string, boldVal = true) => {
    doc.setFont(activeFont, 'normal');
    doc.text(sanitizePdfText(label), margin, y);
    doc.setFont(activeFont, boldVal ? 'bold' : 'normal');
    doc.text(sanitizePdfText(val), pageWidth - margin, y, { align: 'right' });
    y += 3.6;
  };

  drawMetaRow('N° Ticket :', ticketNumber, true);
  drawMetaRow('N° Vente :', saleNumber, true);
  drawMetaRow('Date & Heure :', dateTimeDisplay, false);

  doc.setFont(activeFont, 'bold');
  vendorLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 3.4;
  });
  pdvLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 3.4;
  });
  if (buyerTypeDisplay) {
    drawMetaRow("Type d'acheteur :", buyerTypeDisplay, true);
  }

  y += 0.8;
  // Ligne de séparation
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.4;

  // En-tête des lignes
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.2);
  doc.text(sanitizePdfText('DÉSIGNATION / QTÉ x PRIX'), margin, y);
  doc.text(sanitizePdfText('MONTANT'), pageWidth - margin, y, { align: 'right' });
  y += 1.8;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.4;

  // 5. Lignes : désignation, quantité x prix, montant (retour à la ligne autorisé, jamais coupé)
  items.forEach((it: any) => {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    const desigLines = doc.splitTextToSize(sanitizePdfText(it.designation), contentWidth);
    desigLines.forEach((dl: string) => {
      doc.text(dl, margin, y);
      y += 3.3;
    });

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.4);
    const qtyPriceStr = `${it.qty} x ${formatTicketNum(it.unitPrice)} FCFA`;
    const lineTotalStr = `${formatTicketNum(it.total)} FCFA`;
    doc.text(sanitizePdfText(qtyPriceStr), margin + 1.5, y);
    doc.setFont(activeFont, 'bold');
    doc.text(sanitizePdfText(lineTotalStr), pageWidth - margin, y, { align: 'right' });
    y += 4.0;
  });

  // Ligne de séparation
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.8;

  // 6. Remise grossiste si appliquée, Total HT, TVA 18 % si appliquée, TOTAL TTC en gras
  if (wholesaleDiscountAmount > 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.text('Remise grossiste :', margin, y);
    doc.setFont(activeFont, 'bold');
    doc.text(sanitizePdfText(`- ${formatTicketNum(wholesaleDiscountAmount)} FCFA`), pageWidth - margin, y, {
      align: 'right',
    });
    y += 3.8;
  }

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.8);
  doc.text('Total HT :', margin, y);
  doc.setFont(activeFont, 'bold');
  doc.text(sanitizePdfText(`${formatTicketNum(subtotalHt)} FCFA`), pageWidth - margin, y, {
    align: 'right',
  });
  y += 3.8;

  if (withTva) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.text(`TVA ${tvaRate} % :`, margin, y);
    doc.setFont(activeFont, 'bold');
    doc.text(sanitizePdfText(`${formatTicketNum(tvaAmount)} FCFA`), pageWidth - margin, y, {
      align: 'right',
    });
    y += 3.8;
  }

  doc.setLineWidth(0.25);
  doc.line(margin, y - 1.8, pageWidth - margin, y - 1.8);
  y += 1.2;

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.2);
  doc.text('TOTAL TTC :', margin, y);
  doc.text(sanitizePdfText(`${formatTicketNum(totalTtc)} FCFA`), pageWidth - margin, y, {
    align: 'right',
  });
  y += 4.2;

  // 7. Mode de règlement, mention "ACQUITTÉ" ou "À PAYER"
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.5);
  doc.text(sanitizePdfText('Mode de règlement :'), margin, y);
  doc.setFont(activeFont, 'bold');
  doc.text(sanitizePdfText(paymentMethod), pageWidth - margin, y, { align: 'right' });
  y += 4.0;

  // Cadre noir et blanc pour la mention ACQUITTÉ ou À PAYER
  doc.setLineWidth(0.4);
  doc.rect(margin + 10, y - 2.6, contentWidth - 20, 5.6);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.5);
  doc.text(sanitizePdfText(mentionStatut), centerX, y + 1.2, { align: 'center' });
  y += 5.5;

  // 8. Montant en lettres
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.8);
  wordsLines.forEach((wl: string) => {
    doc.text(wl, centerX, y, { align: 'center' });
    y += 3.1;
  });
  y += 1.5;

  // Ligne de séparation finale
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.6;

  // 9. "Merci de votre confiance" + pied avec NIF et RCCM
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.0);
  doc.text('Merci de votre confiance', centerX, y, { align: 'center' });
  y += 3.6;

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.6);
  doc.text(
    sanitizePdfText(`NIF : ${dynTicketSettings.nif || '084129532M'} • RCCM : ${dynTicketSettings.rccm || 'MA.BKO.2018.B.4129'}`),
    centerX,
    y,
    { align: 'center' }
  );

  const filename = getExplicitDocumentPdfFilename({
    ...ticket,
    type: 'mini_thermique',
    number: ticketNumber,
  });

  return { doc, filename };
}

export async function exportThermalTicket80mmPdf(
  ticket: any,
  logoUrl?: string
): Promise<void> {
  const { doc, filename } = await buildThermalTicket80mmPdfDoc(ticket, logoUrl);
  doc.save(filename);
}
