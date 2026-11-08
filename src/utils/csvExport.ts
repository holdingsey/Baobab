export interface CsvExportOptions {
  filename: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports tabular data to a UTF-8 CSV file with BOM (\uFEFF) and semicolon (;) delimiter
 * for seamless compatibility with Microsoft Excel / LibreOffice Calc in French locale.
 */
export function exportTableToCsv({ filename, columns, rows }: CsvExportOptions): void {
  const headerLine = columns.map(escapeCsvCell).join(';');
  const dataLines = rows.map(row => row.map(escapeCsvCell).join(';'));
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeFilename = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', safeFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
