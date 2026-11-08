import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { FormModal } from './FormModal';

export interface DataTableColumn<T> {
  key: string;
  header?: React.ReactNode;
  label?: React.ReactNode;
  cell?: (row: T, index: number) => React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  /** Value shown in the mobile card ("libellé : valeur") and in the "Détails" modal. Defaults to cell(row, index) if omitted. */
  mobileValue?: (row: T, index: number) => React.ReactNode;
  /** Label shown in mobile card and "Détails" modal. Defaults to stringified header if omitted. */
  mobileLabel?: string;
  /** Hide this column inside the mobile stacked card body (e.g., if already used as title, status badge, or actions). */
  hideInMobileCard?: boolean;
  hideOnMobileCard?: boolean;
  /** Secondary column hidden between 768px and 1023px (< 1024px) and shown in the "Détails" modal. */
  secondary?: boolean;
  isSecondary?: boolean;
  /** Right-aligned numeric/amount column (`white-space: nowrap`, `text-right`). */
  isNumeric?: boolean;
  /** Center-aligned column. */
  align?: 'left' | 'center' | 'right';
  /** Footer cell content for this column. */
  footer?: React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey?: (row: T, index: number) => string | number;
  getRowKey?: (row: T, index: number) => string | number;
  keyExtractor?: (row: T, index: number) => string | number;
  /** Mobile card top title (left). */
  mobileTitle: (row: T, index: number) => React.ReactNode;
  /** Optional subtitle under mobileTitle. */
  mobileSubtitle?: (row: T, index: number) => React.ReactNode;
  /** Mobile card status badge (top right). */
  mobileBadge?: (row: T, index: number) => React.ReactNode;
  mobileStatusBadge?: (row: T, index: number) => React.ReactNode;
  /** Mobile card bottom actions row. */
  mobileActions?: (row: T, index: number) => React.ReactNode;
  /** Row actions rendered in mobile card bottom AND in an Actions column on desktop/tablet. */
  renderActions?: (row: T, index: number) => React.ReactNode;
  /** Custom row className (e.g. cancelled or highlighted rows). */
  rowClassName?: (row: T, index: number) => string;
  /** Empty state message when data is empty. */
  emptyMessage?: React.ReactNode;
  /** Items per page (defaults to 20 per specification). */
  pageSize?: number;
  /** Summary totals bar displayed in the visible footer. */
  totalsFooter?: React.ReactNode;
  footer?: React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  getRowKey: getRowKeyProp,
  keyExtractor,
  mobileTitle,
  mobileSubtitle,
  mobileBadge,
  mobileStatusBadge,
  mobileActions,
  renderActions,
  rowClassName,
  emptyMessage = 'Aucun élément à afficher.',
  pageSize = 20,
  totalsFooter,
  footer,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [detailRow, setDetailRow] = useState<{ row: T; index: number } | null>(null);

  const getRowKey = rowKey || getRowKeyProp || keyExtractor || ((_: T, idx: number) => idx);
  const getMobileBadge = mobileBadge || mobileStatusBadge;
  const getMobileActions = mobileActions || renderActions;
  const resolvedTotalsFooter = totalsFooter !== undefined ? totalsFooter : footer;
  const getColHeader = (col: DataTableColumn<T>) =>
    col.header !== undefined ? col.header : col.label;
  const getColCell = (col: DataTableColumn<T>, row: T, idx: number) => {
    const fn = col.cell || col.render;
    return fn ? fn(row, idx) : null;
  };
  const isColSecondary = (col: DataTableColumn<T>) => Boolean(col.secondary || col.isSecondary);
  const isColHiddenOnMobile = (col: DataTableColumn<T>) =>
    Boolean(col.hideInMobileCard || col.hideOnMobileCard);

  const effectiveColumns = useMemo<DataTableColumn<T>[]>(() => {
    if (renderActions && !columns.some((c) => c.key === 'actions')) {
      return [
        ...columns,
        {
          key: 'actions',
          header: 'Actions',
          align: 'right',
          hideInMobileCard: true,
          cell: (row: T, idx: number) => renderActions(row, idx),
        },
      ];
    }
    return columns;
  }, [columns, renderActions]);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalItems, totalPages, currentPage]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  const isStickyFirstCol = effectiveColumns.length > 6;
  const hasSecondaryColumns = useMemo(
    () => effectiveColumns.some((col) => isColSecondary(col)),
    [effectiveColumns]
  );
  const hasColumnFooters = useMemo(
    () => effectiveColumns.some((col) => col.footer !== undefined),
    [effectiveColumns]
  );

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="w-full max-w-full min-w-0 space-y-3">
      {/* 1. MOBILE (< 768px) : CARTES EMPILÉES */}
      <div className="md:hidden space-y-3 w-full max-w-full min-w-0">
        {paginatedData.length === 0 ? (
          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
            {emptyMessage}
          </div>
        ) : (
          paginatedData.map((row, idx) => {
            const globalIdx = (currentPage - 1) * pageSize + idx;
            const key = getRowKey(row, globalIdx);
            const extraRowClass = rowClassName ? rowClassName(row, globalIdx) : '';
            const cardFields = effectiveColumns.filter((c) => !isColHiddenOnMobile(c));

            return (
              <div
                key={`mob-${key}`}
                className={`p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 text-xs w-full max-w-full min-w-0 ${extraRowClass}`}
              >
                {/* En-tête de la carte : Titre principal en haut + Badge de statut */}
                <div className="flex items-start justify-between gap-2.5 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 dark:text-white text-sm leading-snug break-words">
                      {mobileTitle(row, globalIdx)}
                    </div>
                    {mobileSubtitle && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                        {mobileSubtitle(row, globalIdx)}
                      </div>
                    )}
                  </div>
                  {getMobileBadge && (
                    <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                      {getMobileBadge(row, globalIdx)}
                    </div>
                  )}
                </div>

                {/* Valeurs clés sous forme "libellé : valeur" */}
                {cardFields.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5 min-w-0">
                    {cardFields.map((col) => {
                      const colHeader = getColHeader(col);
                      const label =
                        col.mobileLabel !== undefined
                          ? col.mobileLabel
                          : typeof colHeader === 'string'
                          ? colHeader
                          : '';
                      const val = col.mobileValue
                        ? col.mobileValue(row, globalIdx)
                        : getColCell(col, row, globalIdx);
                      if (val === null || val === undefined || val === '') return null;

                      return (
                        <div
                          key={col.key}
                          className="flex items-baseline justify-between gap-3 text-xs min-w-0 flex-wrap"
                        >
                          {label && (
                            <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                              {label} :
                            </span>
                          )}
                          <div
                            className={`text-slate-900 dark:text-slate-100 font-semibold min-w-0 ${
                              col.isNumeric
                                ? 'whitespace-nowrap font-mono ml-auto text-right'
                                : 'break-words text-right ml-auto'
                            }`}
                          >
                            {val}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions en bas */}
                {getMobileActions && (
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 flex-wrap w-full max-w-full">
                    {getMobileActions(row, globalIdx)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 2. TABLETTE ET PC (>= 768px) : TABLEAU DANS CONTENEUR OVERFLOW-X AUTO */}
      <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden w-full max-w-full min-w-0">
        <div className="overflow-x-auto max-h-[72vh] overflow-y-auto w-full max-w-full">
          <table className="w-full min-w-[720px] text-xs text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[11px] border-b border-slate-200 dark:border-slate-700 shadow-2xs">
              <tr>
                {effectiveColumns.map((col, colIdx) => {
                  const isFirstSticky = isStickyFirstCol && colIdx === 0;
                  const isActionsCol = col.key === 'actions';
                  const alignClass =
                    col.align === 'right' || col.isNumeric || isActionsCol
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                  const visibilityClass = isColSecondary(col) ? 'hidden lg:table-cell' : '';
                  const stickyClass = isFirstSticky
                    ? 'sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)]'
                    : '';
                  const minWidthClass = isActionsCol
                    ? 'min-w-[200px]'
                    : col.isNumeric
                    ? 'min-w-[120px]'
                    : colIdx === 0
                    ? 'min-w-[140px]'
                    : 'min-w-[140px]';

                  return (
                    <th
                      key={col.key}
                      className={`py-3.5 px-3.5 ${alignClass} ${visibilityClass} ${stickyClass} ${minWidthClass} whitespace-nowrap`}
                    >
                      {getColHeader(col)}
                    </th>
                  );
                })}
                {hasSecondaryColumns && (
                  <th className="py-3.5 px-3.5 text-center lg:hidden whitespace-nowrap">
                    Détails
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={effectiveColumns.length + (hasSecondaryColumns ? 1 : 0)}
                    className="py-10 px-4 text-center text-slate-400"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx;
                  const key = getRowKey(row, globalIdx);
                  const extraRowClass = rowClassName ? rowClassName(row, globalIdx) : '';

                  return (
                    <tr
                      key={key}
                      className={`group hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition ${extraRowClass}`}
                    >
                      {effectiveColumns.map((col, colIdx) => {
                        const isFirstSticky = isStickyFirstCol && colIdx === 0;
                        const isActionsCol = col.key === 'actions';
                        const alignClass =
                          col.align === 'right' || col.isNumeric || isActionsCol
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left';
                        const visibilityClass = isColSecondary(col) ? 'hidden lg:table-cell' : '';
                        const nowrapClass =
                          col.isNumeric || isActionsCol ? 'whitespace-nowrap' : ' whitespace-normal';
                        const minWidthClass = isActionsCol
                          ? 'min-w-[200px]'
                          : col.isNumeric
                          ? 'min-w-[120px]'
                          : 'min-w-[140px]';
                        const stickyClass = isFirstSticky
                          ? 'sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-[1px_0_0_0_rgba(241,245,249,1)] dark:shadow-[1px_0_0_0_rgba(30,41,59,1)]'
                          : '';

                        return (
                          <td
                            key={col.key}
                            className={`py-3.5 px-3.5 align-middle ${alignClass} ${visibilityClass} ${nowrapClass} ${minWidthClass} ${stickyClass}`}
                          >
                            {isActionsCol ? (
                              <div className="inline-flex items-center justify-end gap-2 flex-nowrap whitespace-nowrap">
                                {getColCell(col, row, globalIdx)}
                              </div>
                            ) : (
                              getColCell(col, row, globalIdx)
                            )}
                          </td>
                        );
                      })}

                      {hasSecondaryColumns && (
                        <td className="py-3.5 px-3.5 text-center align-middle lg:hidden whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailRow({ row, index: globalIdx })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] bg-[var(--marque-clair)] hover:opacity-90 font-bold text-[11px] cursor-pointer transition whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            <span>Détails</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {hasColumnFooters && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 border-t-2 border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                <tr>
                  {effectiveColumns.map((col, colIdx) => {
                    const isFirstSticky = isStickyFirstCol && colIdx === 0;
                    const alignClass =
                      col.align === 'right' || col.isNumeric
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                    const visibilityClass = isColSecondary(col) ? 'hidden lg:table-cell' : '';
                    const nowrapClass = col.isNumeric ? 'whitespace-nowrap' : 'whitespace-normal';
                    const stickyClass = isFirstSticky
                      ? 'sticky left-0 z-30 bg-slate-100 dark:bg-slate-800'
                      : '';

                    return (
                      <td
                        key={col.key}
                        className={`py-3.5 px-3.5 ${alignClass} ${visibilityClass} ${nowrapClass} ${stickyClass}`}
                      >
                        {col.footer}
                      </td>
                    );
                  })}
                  {hasSecondaryColumns && <td className="py-3.5 px-3.5 lg:hidden" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 3. PIED DE TOTAUX VISIBLE & PAGINATION PAR 20 */}
      {(resolvedTotalsFooter || totalItems > 0) && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs w-full max-w-full min-w-0 shadow-2xs">
          {/* Pied de totaux visible */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Total : <strong className="text-slate-900 dark:text-white">{totalItems}</strong>{' '}
              {totalItems > 1 ? 'lignes' : 'ligne'}
            </span>
            {resolvedTotalsFooter && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-800 dark:text-slate-200 font-semibold">
                {resolvedTotalsFooter}
              </div>
            )}
          </div>

          {/* Pagination par 20 */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 flex-wrap">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {startIndex}–{endIndex} sur {totalItems}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline ml-0.5">Préc.</span>
                </button>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-black text-xs whitespace-nowrap">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  aria-label="Page suivante"
                >
                  <span className="hidden sm:inline mr-0.5">Suiv.</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modale "Détails" pour les colonnes secondaires sur Tablette (768px - 1023px) */}
      {detailRow && (
        <FormModal
          title={mobileTitle(detailRow.row, detailRow.index)}
          subtitle={mobileSubtitle ? mobileSubtitle(detailRow.row, detailRow.index) : 'Détails complets de la ligne'}
          onClose={() => setDetailRow(null)}
          cancelLabel="Fermer"
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setDetailRow(null);
          }}
        >
          <div className="space-y-3 text-xs">
            {getMobileBadge && (
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 font-semibold">Statut :</span>
                <div>{getMobileBadge(detailRow.row, detailRow.index)}</div>
              </div>
            )}
            {columns.map((col) => {
              const colHeader = getColHeader(col);
              const label =
                col.mobileLabel !== undefined
                  ? col.mobileLabel
                  : typeof colHeader === 'string'
                  ? colHeader
                  : col.key;
              const val = col.mobileValue
                ? col.mobileValue(detailRow.row, detailRow.index)
                : getColCell(col, detailRow.row, detailRow.index);
              return (
                <div
                  key={col.key}
                  className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 py-2 border-b border-slate-100 dark:border-slate-800"
                >
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">{label} :</span>
                  <div
                    className={`text-slate-900 dark:text-white font-bold ${
                      col.isNumeric ? 'whitespace-nowrap font-mono' : 'break-words'
                    }`}
                  >
                    {val}
                  </div>
                </div>
              );
            })}
            {getMobileActions && (
              <div className="pt-3 flex items-center justify-end gap-2 flex-wrap">
                {getMobileActions(detailRow.row, detailRow.index)}
              </div>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
}
