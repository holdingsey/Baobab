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

  // 1. Bandeau d'en-tête officiel Baobab Distribution (#008DA9)
  doc.setFillColor(0, 141, 169);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('BAOBAB DISTRIBUTION MALI', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Entrepot Central Sotuba - Bamako, Mali | Rapport Officiel de Gestion', 14, 17);

  if (roleLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(sanitizePdfText(roleLabel), 14, 22.5);
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
