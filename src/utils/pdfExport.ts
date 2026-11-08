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

let cachedLogoDataUrl: string | null = null;

function convertImageElementToDataUrl(img: HTMLImageElement): string | null {
  try {
    if (!img.complete || img.naturalWidth === 0) return null;
    const canvas = document.createElement('canvas');
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fit image preserving aspect ratio centered on transparent canvas
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
    const domLogo = document.querySelector('img[alt="Baobab Distribution Logo"]') as HTMLImageElement | null;
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

/**
 * Dessine le logo Baobab dans un encadré blanc arrondi sur le bandeau d'en-tête PDF
 * et retourne la coordonnée X de départ pour le texte d'en-tête.
 */
function drawPdfHeaderLogo(
  doc: jsPDF,
  x: number,
  y: number,
  boxSize: number,
  logoUrl?: string
): number {
  // Fond blanc arrondi pour faire ressortir le logo sur le bandeau #008DA9
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, boxSize, boxSize, 2.5, 2.5, 'F');

  const logoDataUrl = getBaobabLogoDataUrl(logoUrl);
  if (logoDataUrl) {
    try {
      const pad = 1.6;
      doc.addImage(logoDataUrl, 'PNG', x + pad, y + pad, boxSize - pad * 2, boxSize - pad * 2);
      return x + boxSize + 4;
    } catch {
      // Fallback monogram if addImage fails
    }
  }

  // Fallback monogramme B si l'image n'est pas encore chargée
  doc.setTextColor(0, 141, 169);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('B', x + boxSize / 2, y + boxSize / 2 + 2, { align: 'center' });
  return x + boxSize + 4;
}

/**
 * Normalise le texte pour les polices standard PDF (Helvetica) qui ne gèrent pas
 * les espaces insécables (\u202F, \u00A0) générés par toLocaleString('fr-FR')
 * ni les puces typographiques spéciales.
 */
export function sanitizePdfText(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/•/g, '-')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .trim();
}

export function formatFcfaPdf(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `${sanitizePdfText(num.toLocaleString('fr-FR'))} FCFA`;
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

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 1. Bandeau d'en-tête officiel Baobab Distribution (#008DA9) + Logo
  doc.setFillColor(0, 141, 169);
  doc.rect(0, 0, pageWidth, 26, 'F');

  const headerTextX = drawPdfHeaderLogo(doc, 14, 3, 20, logoUrl);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('BAOBAB DISTRIBUTION MALI', headerTextX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Entrepot Central Sotuba - Bamako, Mali | Rapport Officiel de Gestion', headerTextX, 17);

  if (roleLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(sanitizePdfText(roleLabel), headerTextX, 22.5);
  }

  // Date & Heure d'exportation à droite
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Export PDF : ${sanitizePdfText(dateStr)} a ${sanitizePdfText(timeStr)}`, pageWidth - 14, 11, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Total lignes : ${rows.length}`, pageWidth - 14, 17, {
    align: 'right',
  });

  // 2. Titre & Sous-titre du tableau
  let currentY = 34;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(sanitizePdfText(title), 14, currentY);

  if (subtitle) {
    currentY += 5.5;
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(sanitizePdfText(subtitle), 14, currentY);
  }

  // 3. Cartes de synthèse KPI (si présentes)
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
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(sanitizePdfText(card.label).toUpperCase(), x + 3, currentY + 5.5);

      doc.setTextColor(0, 141, 169);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(sanitizePdfText(card.value), x + 3, currentY + 11.8);
    });

    currentY += cardHeight + 5;
  } else {
    currentY += 5;
  }

  // 4. Tableau de données avec jspdf-autotable
  const cleanColumns = columns.map((c) => sanitizePdfText(c));
  const cleanRows = rows.map((row) => row.map((cell) => sanitizePdfText(cell)));

  autoTable(doc, {
    startY: currentY,
    head: [cleanColumns],
    body:
      cleanRows.length > 0
        ? cleanRows
        : [[{ content: 'Aucune donnee a afficher pour les filtres actuels.', colSpan: cleanColumns.length, styles: { halign: 'center', fontStyle: 'italic' } } as any]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
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
      // Pied de page officiel avec pagination
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Baobab Distribution Mali - Document officiel genere automatiquement pour partage et archivage.',
        14,
        pageHeight - 7
      );
    },
  });

  // Numérotation finale des pages (Page X / Y)
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold');
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
  if (docType === 'recu') {
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

/**
 * Exporte tout document imprimable Baobab Distribution (Facture PDV, Reçu de caisse/versement,
 * Facture/Bon de commande grossiste, Bon cadeau remis, Demande d'achat) au format A4 portrait strict
 * (210 x 297 mm, marges de 15 mm, fond blanc, texte noir, en-tête compact sur 3 lignes max,
 * en-tête de tableau répété, totaux/mentions/signatures en fin de document, pied de page Page X / Y).
 */
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
  const rest = n % 1_000;
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

export function exportOfficialInvoiceA4Pdf(
  invoice: any,
  withTvaParam?: boolean,
  numberInWords?: string,
  logoUrl?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // PALETTE STRICTE LIMITÉE AUX 2 COULEURS DU LOGO + BLANC
  // 1. Bleu-turquoise (--marque : #008DA9) -> filets, barre 2 mm, liserés cartes, titre
  const RGB_MARQUE: [number, number, number] = [0, 141, 169];
  // 2. Bleu assombri même teinte (--marque-fonce : #006B82, contraste 6.14:1 >= 4.5:1) -> aplats à texte blanc
  const RGB_MARQUE_APLAT: [number, number, number] = [0, 107, 130];
  // 3. Bleu à 8 % d'opacité sur fond blanc (#EBF6F8) -> lignes alternées et fond des cartes
  const RGB_MARQUE_8PCT: [number, number, number] = [235, 246, 248];
  // 4. Noir du logo (--marque-noir : #000000) -> texte courant, noms, montants, cadres, séparations, pied de page
  const RGB_NOIR: [number, number, number] = [0, 0, 0];
  // 5. Blanc (#FFFFFF)
  const RGB_BLANC: [number, number, number] = [255, 255, 255];

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15; // Marges strictes de 15 mm
  const contentWidth = pageWidth - margin * 2; // 180 mm

  const subtotalHt = Number(invoice.subtotal ?? invoice.subtotalHt ?? invoice.total ?? 0);
  const discountAmount = Number(invoice.discountAmount || 0);
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
  const saleRef = sanitizePdfText(invoice.saleNumber || '');
  const dateStr = sanitizePdfText(invoice.date || '');
  const timeStr = sanitizePdfText(invoice.saleTime || '');
  const paymentMethod = sanitizePdfText(invoice.paymentMethod || 'Comptant');
  const statusStr = String(invoice.status || 'Validé');
  const statusLower = statusStr.toLowerCase();
  const isCancelled =
    statusLower.includes('annul') || statusLower.includes('rejet');
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

  const docTypeLabel = sanitizePdfText(
    invoice.docTypeTitle ||
      (invoice.type === 'recu' || invoice.type === 'receipt'
        ? 'RECU DE VERSEMENT'
        : invoice.type === 'bon_cadeau'
        ? 'BON CADEAU REMIS (FEFO)'
        : invoice.type === 'demande_achat'
        ? "DEMANDE D'ACHAT FOURNISSEUR"
        : invoice.type === 'commande_gros' || invoice.type === 'facture_grossiste'
        ? 'FACTURE GROSSISTE'
        : invoice.type === 'mini_thermique'
        ? 'RECU DE CAISSE'
        : 'FACTURE DE VENTE PDV')
  );

  // Fonction d'en-tête compact (Logo + 3 lignes max à gauche, Bloc document à droite, barre bleue de 2 mm dessous)
  const drawCompactHeader = () => {
    doc.setFillColor(...RGB_BLANC);
    doc.rect(0, 0, pageWidth, 42, 'F');

    // Logo à gauche (16 x 16 mm) avec liseré bleu (--marque)
    doc.setDrawColor(...RGB_MARQUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, margin, 16, 16, 1.5, 1.5, 'D');
    const logoDataUrl = getBaobabLogoDataUrl(logoUrl);
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', margin + 1, margin + 1, 14, 14);
      } catch {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...RGB_MARQUE);
        doc.text('B', margin + 8, margin + 10, { align: 'center' });
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...RGB_MARQUE);
      doc.text('B', margin + 8, margin + 10, { align: 'center' });
    }

    const companyX = margin + 19;
    // Ligne 1 : Nom + Activité en noir (--marque-noir)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...RGB_NOIR);
    doc.text('BAOBAB DISTRIBUTION — Negoce & Distribution Agroalimentaire', companyX, margin + 4.5);

    // Ligne 2 : Adresse, téléphones, e-mail
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...RGB_NOIR);
    doc.text(
      'ZI Sotuba, Bamako, Mali • Tel: +223 20 22 45 88 / 76 12 34 56 • contact@baobab-distribution.ml',
      companyX,
      margin + 9.5
    );

    // Ligne 3 : NIF & RCCM
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...RGB_NOIR);
    doc.text('NIF : 084129532M   •   RCCM : MA.BKO.2018.B.4129', companyX, margin + 14.5);

    // Bloc document à droite : cadre noir, titre en BLEU (--marque)
    const docBoxW = 64;
    const docBoxX = pageWidth - margin - docBoxW;
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.35);
    doc.roundedRect(docBoxX, margin, docBoxW, 19.5, 1.5, 1.5, 'FD');

    // Titre en BLEU (--marque)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...RGB_MARQUE);
    doc.text(docTypeLabel, docBoxX + docBoxW - 3, margin + 4.5, { align: 'right' });

    // Numéro, date, règlement en NOIR (--marque-noir)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...RGB_NOIR);
    doc.text(`N° ${invNumber}`, docBoxX + docBoxW - 3, margin + 9.3, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const fullDate = timeStr && !dateStr.includes(timeStr) ? `${dateStr} a ${timeStr}` : dateStr;
    doc.text(`Date : ${fullDate}`, docBoxX + docBoxW - 3, margin + 13.8, { align: 'right' });
    doc.text(`Reglement : ${paymentMethod.slice(0, 28)}`, docBoxX + docBoxW - 3, margin + 17.8, {
      align: 'right',
    });

    // Barre BLEUE (--marque) de 2 mm sous l'en-tête
    doc.setFillColor(...RGB_MARQUE);
    doc.rect(margin, margin + 21, contentWidth, 2, 'F');
  };

  drawCompactHeader();

  // Bloc Parties : Émetteur (Gauche) & Destinataire (Droite) — Liserés BLEUS (--marque) et fond bleu 8 %
  const partiesY = margin + 25.5;
  const partyW = (contentWidth - 4) / 2;
  const partyH = 26;

  const vendorName = invoice.vendor?.name || invoice.vendorName || invoice.cashierName || 'Baobab Distribution';
  const vendorCode = invoice.vendor?.code || invoice.vendorCode || 'BAO';
  const vendorPhone = invoice.vendor?.phone || invoice.vendorPhone || '+223 20 22 45 88';
  const clientName = invoice.client?.name || invoice.pdvName || invoice.clientName || 'Client Partenaire';
  const clientAddress = invoice.client?.address || `${invoice.pdvCode || ''} ${invoice.pdvNeighborhood || 'Bamako, Mali'}`.trim();
  const clientContact = invoice.client?.contact || invoice.pdvManager || '';
  const clientPhone = invoice.client?.phone || invoice.pdvPhone || invoice.clientPhone || '+223 76 00 00 00';

  // Carte Émetteur : fond bleu 8 % + liseré bleu (--marque)
  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_MARQUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, partiesY, partyW, partyH, 1.5, 1.5, 'FD');
  doc.setFillColor(...RGB_MARQUE);
  doc.rect(margin, partiesY, 1.3, partyH, 'F');
  doc.setLineWidth(0.2);
  doc.line(margin + 3, partiesY + 6.2, margin + partyW - 3, partiesY + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RGB_NOIR);
  doc.text(
    sanitizePdfText(invoice.emitterTitle || 'EMETTEUR (AGENT / VENDEUR BAOBAB)'),
    margin + 3.5,
    partiesY + 4.8
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(vendorName), margin + 3.5, partiesY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    sanitizePdfText(
      `Code : ${vendorCode} • ${invoice.vendorTeam || 'Direction Commerciale Bamako'}`
    ),
    margin + 3.5,
    partiesY + 15.2
  );
  doc.text(sanitizePdfText(`Tel : ${vendorPhone}`), margin + 3.5, partiesY + 19.8);
  if (saleRef && saleRef !== invNumber) {
    doc.text(`Ref. operation : ${saleRef}`, margin + 3.5, partiesY + 24);
  }

  // Carte Destinataire : fond bleu 8 % + liseré bleu (--marque)
  const destX = margin + partyW + 4;
  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_MARQUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(destX, partiesY, partyW, partyH, 1.5, 1.5, 'FD');
  doc.setFillColor(...RGB_MARQUE);
  doc.rect(destX, partiesY, 1.3, partyH, 'F');
  doc.setLineWidth(0.2);
  doc.line(destX + 3, partiesY + 6.2, destX + partyW - 3, partiesY + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RGB_NOIR);
  doc.text(
    sanitizePdfText(invoice.recipientTitle || 'DESTINATAIRE (CLIENT / PDV ACHETEUR)'),
    destX + 3.5,
    partiesY + 4.8
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(clientName), destX + 3.5, partiesY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Localisation : ${sanitizePdfText(clientAddress)}`, destX + 3.5, partiesY + 15.2);
  if (clientContact) {
    doc.text(`Responsable / Gerant : ${sanitizePdfText(clientContact)}`, destX + 3.5, partiesY + 19.8);
  }
  doc.text(sanitizePdfText(`Tel : ${clientPhone}`), destX + 3.5, partiesY + 24);

  // Tableau des lignes : en-tête aplat bleu (#006B82) texte blanc, lignes alternées en bleu 8 % (#EBF6F8)
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

  const tableHead = [['Ref.', 'Designation', 'Quantite', 'Prix unitaire HT', 'Montant HT']];
  const tableRows = items.map((it: any) => [
    sanitizePdfText(it.code || 'ART'),
    sanitizePdfText(it.description || it.name || 'Article'),
    sanitizePdfText(String(it.quantity ?? it.qty ?? 1)),
    formatFcfaPdf(it.unitPrice ?? it.price ?? 0),
    formatFcfaPdf(it.total ?? 0),
  ]);

  autoTable(doc, {
    startY: partiesY + partyH + 5,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 2.5,
      textColor: RGB_NOIR,
      fillColor: RGB_BLANC,
      lineColor: RGB_NOIR,
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: RGB_MARQUE_APLAT,
      textColor: RGB_BLANC,
      fontStyle: 'bold',
      fontSize: 9.5,
      lineColor: RGB_NOIR,
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: RGB_MARQUE_8PCT,
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
    margin: { top: margin + 25.5, left: margin, right: margin, bottom: 24 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawCompactHeader();
      }
    },
  });

  let finalY = (doc as any).lastAutoTable?.finalY || 140;
  if (finalY + 78 > pageHeight - margin - 10) {
    doc.addPage();
    drawCompactHeader();
    finalY = margin + 26.5;
  }

  // Bloc Totaux (Droite) & Carte Règlements / Cachet Statut (Gauche)
  const summaryBoxW = 80;
  const summaryBoxX = pageWidth - margin - summaryBoxW;
  const summaryBoxY = finalY + 5;
  const summaryBoxH = discountAmount > 0 ? 33 : 28;
  const totalTtcBarH = 9;

  // Cadre extérieur du bloc Totaux (fond blanc, bordure noire)
  doc.setFillColor(...RGB_BLANC);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.35);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxW, summaryBoxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...RGB_NOIR);
  doc.text('Total HT :', summaryBoxX + 3, summaryBoxY + 5.8);
  doc.text(formatFcfaPdf(subtotalHt), summaryBoxX + summaryBoxW - 3, summaryBoxY + 5.8, {
    align: 'right',
  });

  let lineY = summaryBoxY + 11.5;
  if (discountAmount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Remise (${invoice.discountPercent || 0}%) :`,
      summaryBoxX + 3,
      lineY
    );
    doc.text(`- ${formatFcfaPdf(discountAmount)}`, summaryBoxX + summaryBoxW - 3, lineY, {
      align: 'right',
    });
    lineY += 5.5;
  }

  if ((isFacture && withTva) || tvaAmount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('TVA (18 %) :', summaryBoxX + 3, lineY);
    doc.text(`+ ${formatFcfaPdf(tvaAmount)}`, summaryBoxX + summaryBoxW - 3, lineY, {
      align: 'right',
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.text('TVA (0 % - Sans TVA) :', summaryBoxX + 3, lineY);
    doc.text('0 FCFA', summaryBoxX + summaryBoxW - 3, lineY, { align: 'right' });
  }

  // Ligne TOTAL TTC : aplat bleu assombri (#006B82) avec texte blanc (#FFFFFF) et bordure noire
  const ttcBarY = summaryBoxY + summaryBoxH - totalTtcBarH;
  doc.setFillColor(...RGB_MARQUE_APLAT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.35);
  doc.rect(summaryBoxX, ttcBarY, summaryBoxW, totalTtcBarH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...RGB_BLANC);
  doc.text('TOTAL TTC', summaryBoxX + 3, ttcBarY + 6.2);
  doc.text(formatFcfaPdf(totalTtc), summaryBoxX + summaryBoxW - 3, ttcBarY + 6.2, {
    align: 'right',
  });

  // Carte Règlements & Cachet Statut à gauche (fond bleu 8 %, bordure noire)
  const leftBoxW = contentWidth - summaryBoxW - 4;
  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, summaryBoxY, leftBoxW, summaryBoxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...RGB_NOIR);
  doc.text('REGLEMENTS & PAIEMENTS :', margin + 3, summaryBoxY + 5);
  doc.setLineWidth(0.2);
  doc.line(margin + 3, summaryBoxY + 6.4, margin + leftBoxW - 3, summaryBoxY + 6.4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const totalBoxes = (items || []).reduce(
    (acc: number, it: any) => acc + Number(it.quantity ?? it.qty ?? 0),
    0
  );
  doc.text(
    sanitizePdfText(`Mode : ${paymentMethod} • Qte : ${totalBoxes} unite(s)/carton(s)`),
    margin + 3,
    summaryBoxY + 11.2
  );
  if (invoice.versementRef || invoice.paymentRef) {
    doc.text(
      sanitizePdfText(`Ref. versement : ${invoice.paymentRef || invoice.versementRef}`),
      margin + 3,
      summaryBoxY + 15.8
    );
  }

  // 4. STATUTS PAR LA FORME, sans autre couleur, ne recouvrant aucun texte
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...RGB_NOIR);
  doc.text('Cachet statut :', margin + 3, summaryBoxY + summaryBoxH - 4.2);

  const stampW = 38;
  const stampH = 7.8;
  const stampX = margin + leftBoxW - stampW - 3;
  const stampY = summaryBoxY + summaryBoxH - stampH - 2;

  if (isCancelled) {
    // "ANNULÉE" en noir avec barre diagonale sur fond blanc
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.5);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RGB_NOIR);
    doc.text('ANNULEE', stampX + stampW / 2, stampY + 5.3, { align: 'center' });
    // Barre diagonale noire
    doc.setLineWidth(0.55);
    doc.line(stampX + 1.5, stampY + stampH - 1.2, stampX + stampW - 1.5, stampY + 1.2);
  } else if (isAcquittee) {
    // "ACQUITTÉE" en cachet plein bleu (#006B82) texte blanc, légèrement incliné
    doc.setFillColor(...RGB_MARQUE_APLAT);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.4);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RGB_BLANC);
    doc.text('ACQUITTEE', stampX + stampW / 2, stampY + 5.5, {
      align: 'center',
      angle: 3,
    });
  } else {
    // "À PAYER" en cachet à contour noir sur fond blanc
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.5);
    doc.roundedRect(stampX, stampY, stampW, stampH, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RGB_NOIR);
    doc.text('A PAYER', stampX + stampW / 2, stampY + 5.3, { align: 'center' });
  }

  // Arrêté en toutes lettres (fond bleu 8 %, bordure noire, texte noir)
  const wordsY = summaryBoxY + summaryBoxH + 4;
  doc.setFillColor(...RGB_MARQUE_8PCT);
  doc.setDrawColor(...RGB_NOIR);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, wordsY, contentWidth, 11, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...RGB_NOIR);
  doc.text('ARRETE EN TOUTES LETTRES :', margin + 3, wordsY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const textWords = numberInWords
    ? `${sanitizePdfText(numberInWords).toUpperCase()} FRANCS CFA (XOF).`
    : `${sanitizePdfText(numberToFrenchWords(totalTtc)).toUpperCase()} FRANCS CFA (XOF).`;
  doc.text(textWords.slice(0, 105), margin + 3, wordsY + 8.8);

  // Signatures (3 colonnes : cadres noirs sur fond blanc, texte noir)
  const sigY = wordsY + 14;
  const sigBoxW = (contentWidth - 8) / 3;
  const sigBoxH = 22;

  const sigLabels = [
    sanitizePdfText(invoice.sigLeftLabel || 'Le Destinataire / Client'),
    sanitizePdfText(invoice.sigCenterLabel || `L'Emetteur (${vendorCode})`),
    sanitizePdfText(invoice.sigRightLabel || 'Direction & Comptabilite'),
  ];

  sigLabels.forEach((lbl, idx) => {
    const sx = margin + idx * (sigBoxW + 4);
    doc.setFillColor(...RGB_BLANC);
    doc.setDrawColor(...RGB_NOIR);
    doc.setLineWidth(0.25);
    doc.roundedRect(sx, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RGB_NOIR);
    doc.text(lbl, sx + sigBoxW / 2, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...RGB_NOIR);
    doc.text(
      'Baobab Distribution Mali SARL • NIF 084129532M • RCCM MA.BKO.2018.B.4129',
      margin,
      pageHeight - 9.5
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 9.5, {
      align: 'right',
    });
  }

  const pdfFilename = getExplicitDocumentPdfFilename(invoice);
  doc.save(pdfFilename);
}


