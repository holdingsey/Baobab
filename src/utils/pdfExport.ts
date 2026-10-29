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

/**
 * Exporte une Facture de Vente PDV officielle au format A4 portrait strict (210 x 297 mm)
 * avec le logo Baobab Distribution et toutes les informations requises : entête, vendeur,
 * client PDV, articles, montants, montant en lettres et les 3 zones de signature.
 */
export function exportOfficialInvoiceA4Pdf(
  invoice: any,
  withTva: boolean,
  numberInWords?: string,
  logoUrl?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;

  const subtotalHt = Number(invoice.subtotalHt ?? invoice.total ?? 0);
  const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
  const totalTtc = subtotalHt + tvaAmount;
  const invNumber = sanitizePdfText(invoice.number);
  const saleRef = sanitizePdfText(invoice.saleNumber || invoice.number);
  const dateStr = sanitizePdfText(invoice.date);
  const timeStr = sanitizePdfText(invoice.saleTime || '10:30');
  const versementRef = sanitizePdfText(invoice.versementRef || '');

  // 1. Bandeau supérieur officiel Baobab (#008DA9) + Logo
  doc.setFillColor(0, 141, 169);
  doc.rect(0, 0, pageWidth, 28, 'F');

  const headerTextX = drawPdfHeaderLogo(doc, marginX, 3.5, 21, logoUrl);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('BAOBAB DISTRIBUTION MALI SARL', headerTextX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text('Zone Industrielle de Sotuba, Bamako - Mali | Tel: +223 20 22 45 88 / +223 76 12 34 56', headerTextX, 17);
  doc.text('NIF : 084129532M  |  RCCM : MA.BKO.2018.B.4129  |  contact@baobab-distribution.ml', headerTextX, 22.5);

  // 2. Bloc En-tête Facture (Droite)
  const metaBoxX = 115;
  const metaBoxY = 32;
  const metaBoxWidth = pageWidth - metaBoxX - marginX;
  const metaBoxHeight = 30;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(metaBoxX, metaBoxY, metaBoxWidth, metaBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 141, 169);
  doc.text('FACTURE DE VENTE PDV (A4)', metaBoxX + 4, metaBoxY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(invNumber, metaBoxX + 4, metaBoxY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Ref. Vente : ${saleRef}`, metaBoxX + 4, metaBoxY + 17);
  doc.text(`Date & Heure : ${dateStr} a ${timeStr}`, metaBoxX + 4, metaBoxY + 21.5);
  if (versementRef) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(`Versement : ${versementRef}`, metaBoxX + 4, metaBoxY + 26);
  }

  // Régime TVA Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  if (withTva) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(pageWidth - marginX - 32, metaBoxY + 3, 30, 5.5, 1, 1, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.text('TVA 18% INCLUSE', pageWidth - marginX - 17, metaBoxY + 7, { align: 'center' });
  } else {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(pageWidth - marginX - 32, metaBoxY + 3, 30, 5.5, 1, 1, 'FD');
    doc.setTextColor(71, 85, 105);
    doc.text('SANS TVA (0%)', pageWidth - marginX - 17, metaBoxY + 7, { align: 'center' });
  }

  // Titre principal gauche
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('FACTURE COMMERCIALE OFFICIELLE', marginX, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Etablie suite au versement et validee par le service Comptabilite', marginX, 48);

  // 3. Les deux blocs : Vendeur & PDV Acheteur
  const blockY = 66;
  const blockW = (pageWidth - marginX * 2 - 6) / 2;
  const blockH = 34;

  // Bloc Vendeur
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(0, 141, 169);
  doc.roundedRect(marginX, blockY, blockW, blockH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 141, 169);
  doc.text('AU NOM DU VENDEUR (AGENT BAOBAB)', marginX + 4, blockY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(invoice.vendorName || invoice.cashierName || 'Vendeur Baobab'), marginX + 4, blockY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Code Vendeur : ${sanitizePdfText(invoice.vendorCode || 'BAO-VND')}`, marginX + 4, blockY + 17);
  doc.text(`Equipe / Secteur : ${sanitizePdfText(invoice.vendorTeam || 'Zone Bamako')}`, marginX + 4, blockY + 22);
  doc.text(`Tel : ${sanitizePdfText(invoice.vendorPhone || '+223 75 44 22 11')}`, marginX + 4, blockY + 27);

  // Bloc PDV Acheteur
  const pdvX = marginX + blockW + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(pdvX, blockY, blockW, blockH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(16, 185, 129);
  doc.text('PDV ACHETEUR (POINT DE VENTE CLIENT)', pdvX + 4, blockY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(invoice.pdvName || invoice.clientName || 'PDV Client'), pdvX + 4, blockY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const locStr = `${sanitizePdfText(invoice.pdvCode || '')} ${sanitizePdfText(invoice.pdvNeighborhood || 'Bamako')}`.trim();
  doc.text(`Localisation : ${locStr || 'Bamako, Mali'}`, pdvX + 4, blockY + 17);
  if (invoice.pdvManager) {
    doc.text(`Gerant PDV : ${sanitizePdfText(invoice.pdvManager)}`, pdvX + 4, blockY + 22);
  }
  doc.text(`Tel PDV : ${sanitizePdfText(invoice.pdvPhone || invoice.clientPhone || '+223 76 00 00 00')}`, pdvX + 4, blockY + 27);

  // 4. Tableau des articles
  const items = Array.isArray(invoice.items) && invoice.items.length > 0
    ? invoice.items
    : [{ code: 'ART-GEN', name: 'Articles alimentaires Baobab', qty: 1, price: subtotalHt, total: subtotalHt }];

  const tableHead = [['Ref.', 'Designation Produit', 'Qte (Cartons)', 'Prix Unit. HT', 'Total HT']];
  const tableRows = items.map((it: any) => [
    sanitizePdfText(it.code || 'ART'),
    sanitizePdfText(it.name || 'Produit'),
    sanitizePdfText(String(it.qty ?? 1)),
    formatFcfaPdf(it.price || 0),
    formatFcfaPdf(it.total || 0),
  ]);

  autoTable(doc, {
    startY: blockY + blockH + 6,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 160;

  // 5. Récapitulatif financier
  const summaryBoxW = 75;
  const summaryBoxX = pageWidth - marginX - summaryBoxW;
  const summaryBoxY = finalY + 5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxW, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Sous-total HT :', summaryBoxX + 4, summaryBoxY + 6);
  doc.text(formatFcfaPdf(subtotalHt), summaryBoxX + summaryBoxW - 4, summaryBoxY + 6, { align: 'right' });

  if (withTva) {
    doc.setTextColor(180, 83, 9);
    doc.text('TVA (18%) :', summaryBoxX + 4, summaryBoxY + 12);
    doc.text(`+ ${formatFcfaPdf(tvaAmount)}`, summaryBoxX + summaryBoxW - 4, summaryBoxY + 12, { align: 'right' });
  } else {
    doc.text('TVA (0% / Sans TVA) :', summaryBoxX + 4, summaryBoxY + 12);
    doc.text('0 FCFA', summaryBoxX + summaryBoxW - 4, summaryBoxY + 12, { align: 'right' });
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(summaryBoxX + 2, summaryBoxY + 16, summaryBoxX + summaryBoxW - 2, summaryBoxY + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 141, 169);
  doc.text(withTva ? 'TOTAL TTC :' : 'TOTAL NET :', summaryBoxX + 4, summaryBoxY + 23);
  doc.text(formatFcfaPdf(totalTtc), summaryBoxX + summaryBoxW - 4, summaryBoxY + 23, { align: 'right' });

  // Mentions de règlement à gauche
  const reglementX = marginX;
  const reglementY = summaryBoxY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('CONDITIONS DE REGLEMENT :', reglementX, reglementY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Paiement effectue en Francs CFA (XOF). Facture certifiee conforme.', reglementX, reglementY + 10);
  doc.text(withTva ? 'Operation soumise a la TVA au taux legal de 18%.' : 'Operation declaree hors taxe / sans TVA.', reglementX, reglementY + 14);

  const totalBoxes = (items || []).reduce((acc: number, it: any) => acc + Number(it.qty || 0), 0);
  if (totalBoxes > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 141, 169);
    doc.text(`Volume total des marchandises : ${totalBoxes} carton(s)`, reglementX, reglementY + 20);
  }

  // 6. Montant en toutes lettres
  const wordsY = summaryBoxY + 33;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, wordsY, pageWidth - marginX * 2, 11, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('MONTANT ARRETE EN TOUTES LETTRES :', marginX + 3, wordsY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const textWords = numberInWords
    ? `Arretee la presente facture a la somme de : ${sanitizePdfText(numberInWords)} Francs CFA.`
    : `Arretee la presente facture a la somme de : ${formatFcfaPdf(totalTtc)}.`;
  doc.text(textWords, marginX + 3, wordsY + 8.5);

  // 7. Zone des 3 Signatures officielles
  const sigY = wordsY + 16;
  const sigBoxW = (pageWidth - marginX * 2 - 10) / 3;
  const sigBoxH = 26;

  // Sig 1 : PDV Acheteur
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Le PDV Acheteur (Client)', marginX + sigBoxW / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Nom et Signature', marginX + sigBoxW / 2, sigY + sigBoxH - 3, { align: 'center' });

  // Sig 2 : Vendeur
  const sig2X = marginX + sigBoxW + 5;
  doc.roundedRect(sig2X, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Le Vendeur Baobab', sig2X + sigBoxW / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(sanitizePdfText(invoice.vendorCode || 'Signature'), sig2X + sigBoxW / 2, sigY + sigBoxH - 3, { align: 'center' });

  // Sig 3 : Comptabilité
  const sig3X = sig2X + sigBoxW + 5;
  doc.roundedRect(sig3X, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 141, 169);
  doc.text('Service Comptabilite & Caisse', sig3X + sigBoxW / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Cachet certifie et Visa', sig3X + sigBoxW / 2, sigY + sigBoxH - 3, { align: 'center' });

  // 8. Pied de page certifié
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Baobab Distribution Mali SARL - Document officiel de vente genere au format standard A4 (210 x 297 mm).', pageWidth / 2, pageHeight - 6, {
    align: 'center',
  });

  const pdfFilename = `Facture_${sanitizePdfText(invoice.number || 'Vente')}.pdf`;
  doc.save(pdfFilename);
}
