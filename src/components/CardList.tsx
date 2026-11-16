import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/**
 * Définition d'un champ "libellé : valeur" affiché sur sa propre ligne dans la carte.
 * Compatible également avec la structure de colonne de DataTable pour faciliter les remplacements futurs.
 */
export interface CardListField<T> {
  key: string;
  /** Libellé affiché à gauche ("libellé : valeur"). */
  label?: React.ReactNode;
  header?: React.ReactNode;
  mobileLabel?: string;
  /** Fonction de rendu de la valeur pour la ligne. */
  value?: (row: T, index: number) => React.ReactNode;
  cell?: (row: T, index: number) => React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  mobileValue?: (row: T, index: number) => React.ReactNode;
  /** Indique qu'il s'agit d'un montant ou nombre à afficher en nowrap aligné à droite. */
  isAmount?: boolean;
  isNumeric?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Permet de masquer dynamiquement ou statiquement un champ sur la carte. */
  hidden?: boolean | ((row: T, index: number) => boolean);
  hideInMobileCard?: boolean;
  hideOnMobileCard?: boolean;
  /** Pied de colonne optionnel pour compatibilité avec les tableaux existants. */
  footer?: React.ReactNode;
}

/**
 * Définition d'un bouton d'action affiché en bas de la carte (hauteur minimale 48 px, libellé complet).
 */
export interface CardListAction<T> {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick: (row: T, index: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline';
  disabled?: boolean | ((row: T, index: number) => boolean);
  hidden?: boolean | ((row: T, index: number) => boolean);
  title?: string;
  className?: string;
}

/**
 * Option de tri prise en charge par le composant Liste de cartes.
 */
export interface CardListSortOption<T> {
  key: string;
  label: string;
  /** Extrait la valeur comparable (chaîne, nombre ou date) pour le tri. */
  getValue?: (row: T) => string | number | Date | null | undefined;
  /** Comparateur personnalisé optionnel. */
  compare?: (a: T, b: T) => number;
}

/**
 * Choix d'un filtre intégré au composant Liste de cartes.
 */
export interface CardListFilterChoice {
  value: string;
  label: string;
  count?: number;
}

/**
 * Configuration d'un filtre pris en charge par le composant Liste de cartes.
 */
export interface CardListFilterConfig<T> {
  key: string;
  label: string;
  options: CardListFilterChoice[];
  defaultValue?: string;
  /** Valeur contrôlée depuis le parent (optionnelle). */
  value?: string;
  /** Callback déclenché lors du changement de valeur (optionnel). */
  onChange?: (value: string) => void;
  /** Prédicat de filtrage appliqué côté composant lorsque la valeur n'est pas 'all' ou ''. */
  match?: (row: T, selectedValue: string) => boolean;
}

export interface CardListProps<T> {
  /** Données brutes ou pré-filtrées à afficher sous forme de cartes. */
  data: T[];
  /** Identifiant unique de chaque ligne/carte. */
  rowKey?: (row: T, index: number) => string | number;
  getRowKey?: (row: T, index: number) => string | number;
  keyExtractor?: (row: T, index: number) => string | number;

  /**
   * 1. Titre principal en haut de la carte (numéro, nom ou référence, police des codes, retour à la ligne autorisé).
   */
  title?: (row: T, index: number) => React.ReactNode;
  renderTitle?: (row: T, index: number) => React.ReactNode;
  mobileTitle?: (row: T, index: number) => React.ReactNode;

  /** Sous-titre optionnel affiché sous le titre principal. */
  subtitle?: (row: T, index: number) => React.ReactNode;
  renderSubtitle?: (row: T, index: number) => React.ReactNode;
  mobileSubtitle?: (row: T, index: number) => React.ReactNode;

  /**
   * 2. Badges de statut affichés sur leur propre ligne dédiée sous le titre principal.
   */
  badges?: (row: T, index: number) => React.ReactNode;
  renderBadges?: (row: T, index: number) => React.ReactNode;
  mobileBadge?: (row: T, index: number) => React.ReactNode;
  mobileStatusBadge?: (row: T, index: number) => React.ReactNode;

  /**
   * 3. Valeurs clés "libellé : valeur" (une par ligne), avec montants en nowrap alignés à droite.
   */
  fields?: CardListField<T>[];
  columns?: CardListField<T>[];

  /**
   * 4. Boutons d'action en bas de la carte (48 px, flex-wrap, libellés complets).
   */
  actions?: CardListAction<T>[] | ((row: T, index: number) => CardListAction<T>[]);
  renderActions?: (row: T, index: number) => React.ReactNode;
  mobileActions?: (row: T, index: number) => React.ReactNode;

  /** Contenu additionnel optionnel à l'intérieur de la carte (ex: barre de progression, détail dépliable). */
  renderExtraContent?: (row: T, index: number) => React.ReactNode;

  /** Classe CSS additionnelle pour une carte (ex: mise en évidence ou annulation). */
  cardClassName?: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string;

  /**
   * 5. Recherche intégrée :
   * Peut être pilotée en interne par le composant ou contrôlée par le parent.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  /** Clés de l'objet `T` à inspecter lors de la recherche locale. */
  searchKeys?: Array<keyof T | string>;
  /** Fonction personnalisée pour tester si une ligne correspond à la recherche. */
  searchPredicate?: (row: T, normalizedQuery: string) => boolean;

  /**
   * 6. Tri intégré :
   * Liste des critères de tri proposés dans la barre d'outils.
   */
  sortOptions?: CardListSortOption<T>[];
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void;

  /**
   * 7. Filtres intégrés :
   * Filtres déclaratifs et/ou zone libre pour filtres métiers additionnels.
   */
  filters?: CardListFilterConfig<T>[];
  filterSlot?: React.ReactNode;
  toolbarExtra?: React.ReactNode;

  /**
   * 8. Pagination par 20 par défaut :
   */
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;

  /** Message affiché lorsqu'aucune carte ne correspond aux critères. */
  emptyMessage?: React.ReactNode;

  /** Résumé / totaux affichés dans le pied de liste (ex: total cartons, total FCFA). */
  totalsFooter?: React.ReactNode;
  footer?: React.ReactNode;
}

function extractTextFromNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromNode).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractTextFromNode(props?.children);
  }
  return '';
}

function getActionVariantClasses(variant: CardListAction<unknown>['variant'] = 'secondary'): string {
  switch (variant) {
    case 'primary':
      return 'bg-[var(--marque-fonce)] hover:bg-[var(--marque-fonce-survol)] text-white border border-transparent shadow-2xs';
    case 'success':
      return 'bg-emerald-700 hover:bg-emerald-800 text-white border border-transparent shadow-2xs';
    case 'danger':
      return 'bg-rose-700 hover:bg-rose-800 text-white border border-transparent shadow-2xs';
    case 'outline':
      return 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] border border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)]';
    case 'secondary':
    default:
      return 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700';
  }
}

/**
 * Composant partagé "Liste de cartes" (CardList / ListeDeCartes) :
 * - Une carte par ligne de données :
 *   - Titre principal en haut (numéro, nom ou référence, police des codes, retour à la ligne autorisé)
 *   - Badges de statut sur leur propre ligne
 *   - Valeurs clés "libellé : valeur" (une par ligne)
 *   - Montants en nowrap alignés à droite
 *   - Boutons d'action en bas (48 px, flex-wrap, libellés complets)
 * - Disposition : 1 carte par ligne jusqu'à 1279 px, 2 cartes par ligne à partir de 1280 px (xl:grid-cols-2)
 * - Règles anti-coupure strictes : aucune hauteur fixe, aucun line-clamp, aucun overflow hidden sur du texte,
 *   aucune largeur fixe en px, box-sizing border-box, min-width 0 sur les enfants flex/grid, overflow-wrap anywhere.
 * - Pagination par 20, recherche, tri et filtres pris en charge, lisible en thèmes clair et sombre.
 */
export function CardList<T>({
  data,
  rowKey,
  getRowKey: getRowKeyProp,
  keyExtractor,
  title,
  renderTitle,
  mobileTitle,
  subtitle,
  renderSubtitle,
  mobileSubtitle,
  badges,
  renderBadges,
  mobileBadge,
  mobileStatusBadge,
  fields,
  columns,
  actions,
  renderActions,
  mobileActions,
  renderExtraContent,
  cardClassName,
  rowClassName,
  searchable = false,
  searchPlaceholder = 'Rechercher par numéro, nom, référence…',
  searchQuery: controlledSearchQuery,
  onSearchChange,
  searchKeys,
  searchPredicate,
  sortOptions = [],
  defaultSortKey = '',
  defaultSortDirection = 'asc',
  sortKey: controlledSortKey,
  sortDirection: controlledSortDirection,
  onSortChange,
  filters = [],
  filterSlot,
  toolbarExtra,
  pageSize = 20,
  currentPage: controlledPage,
  onPageChange,
  emptyMessage = 'Aucun élément à afficher.',
  totalsFooter,
  footer,
}: CardListProps<T>) {
  // État local de recherche (si non contrôlé)
  const [internalSearch, setInternalSearch] = useState('');
  const activeSearchQuery =
    controlledSearchQuery !== undefined ? controlledSearchQuery : internalSearch;

  // État local de tri (si non contrôlé)
  const [internalSortKey, setInternalSortKey] = useState<string>(
    defaultSortKey || (sortOptions[0]?.key ?? '')
  );
  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>(
    defaultSortDirection
  );
  const activeSortKey = controlledSortKey !== undefined ? controlledSortKey : internalSortKey;
  const activeSortDirection =
    controlledSortDirection !== undefined ? controlledSortDirection : internalSortDirection;

  // État local des filtres déclaratifs (si non contrôlés individuellement)
  const [internalFilterValues, setInternalFilterValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    filters.forEach((f) => {
      initial[f.key] = f.defaultValue ?? 'all';
    });
    return initial;
  });

  // État local de pagination par 20 (si non contrôlé)
  const [internalPage, setInternalPage] = useState(1);
  const activePage = controlledPage !== undefined ? controlledPage : internalPage;

  const setPage = (nextPage: number | ((prev: number) => number)) => {
    const resolved = typeof nextPage === 'function' ? nextPage(activePage) : nextPage;
    if (onPageChange) {
      onPageChange(resolved);
    } else {
      setInternalPage(resolved);
    }
  };

  const resolveKey = rowKey || getRowKeyProp || keyExtractor || ((_: T, idx: number) => idx);
  const resolveTitle = title || renderTitle || mobileTitle;
  const resolveSubtitle = subtitle || renderSubtitle || mobileSubtitle;
  const resolveBadges = badges || renderBadges || mobileBadge || mobileStatusBadge;
  const resolveCustomActions = renderActions || mobileActions;
  const resolveCardClass = cardClassName || rowClassName;
  const resolvedFooter = totalsFooter !== undefined ? totalsFooter : footer;

  const effectiveFields = useMemo<CardListField<T>[]>(() => {
    const rawFields = fields || columns || [];
    return rawFields.filter(
      (f) => f.key !== 'actions' && !f.hideInMobileCard && !f.hideOnMobileCard
    );
  }, [fields, columns]);

  const handleSearchInput = (val: string) => {
    if (onSearchChange) {
      onSearchChange(val);
    } else {
      setInternalSearch(val);
    }
    setPage(1);
  };

  const handleFilterChange = (filterCfg: CardListFilterConfig<T>, nextVal: string) => {
    if (filterCfg.onChange) {
      filterCfg.onChange(nextVal);
    } else {
      setInternalFilterValues((prev) => ({
        ...prev,
        [filterCfg.key]: nextVal,
      }));
    }
    setPage(1);
  };

  const handleSortKeyChange = (nextKey: string) => {
    if (onSortChange) {
      onSortChange(nextKey, activeSortDirection);
    } else {
      setInternalSortKey(nextKey);
    }
    setPage(1);
  };

  const handleToggleSortDirection = () => {
    const nextDir: 'asc' | 'desc' = activeSortDirection === 'asc' ? 'desc' : 'asc';
    if (onSortChange) {
      onSortChange(activeSortKey, nextDir);
    } else {
      setInternalSortDirection(nextDir);
    }
    setPage(1);
  };

  const hasActiveDeclarativeFilters = useMemo(() => {
    return filters.some((f) => {
      const currentVal = f.value !== undefined ? f.value : (internalFilterValues[f.key] ?? 'all');
      const defVal = f.defaultValue ?? 'all';
      return currentVal !== defVal && currentVal !== 'all' && currentVal !== '';
    });
  }, [filters, internalFilterValues]);

  const resetAllFiltersAndSearch = () => {
    handleSearchInput('');
    filters.forEach((f) => {
      const defVal = f.defaultValue ?? 'all';
      if (f.onChange) {
        f.onChange(defVal);
      }
    });
    setInternalFilterValues(() => {
      const reset: Record<string, string> = {};
      filters.forEach((f) => {
        reset[f.key] = f.defaultValue ?? 'all';
      });
      return reset;
    });
    setPage(1);
  };

  // 1. Application de la recherche et des filtres déclaratifs
  const filteredData = useMemo(() => {
    let result = Array.isArray(data) ? [...data] : [];

    // Filtres déclaratifs (uniquement ceux dotés d'une fonction `match`)
    filters.forEach((f) => {
      const selectedVal = f.value !== undefined ? f.value : (internalFilterValues[f.key] ?? 'all');
      if (selectedVal && selectedVal !== 'all' && f.match) {
        result = result.filter((row) => f.match!(row, selectedVal));
      }
    });

    // Recherche textuelle (si non gérée exclusivement côté parent ou si searchPredicate/searchKeys/searchable actifs)
    const trimmedQuery = activeSearchQuery.trim().toLowerCase();
    if (trimmedQuery.length > 0 && !onSearchChange) {
      result = result.filter((row, idx) => {
        if (searchPredicate) {
          return searchPredicate(row, trimmedQuery);
        }
        if (searchKeys && searchKeys.length > 0) {
          return searchKeys.some((k) => {
            const rawVal = (row as Record<string, unknown>)?.[String(k)];
            return rawVal !== null &&
              rawVal !== undefined &&
              String(rawVal).toLowerCase().includes(trimmedQuery);
          });
        }
        // Recherche sur le titre + sous-titre + valeurs clés + propriétés primitives
        if (resolveTitle) {
          const titleTxt = extractTextFromNode(resolveTitle(row, idx)).toLowerCase();
          if (titleTxt.includes(trimmedQuery)) return true;
        }
        if (resolveSubtitle) {
          const subTxt = extractTextFromNode(resolveSubtitle(row, idx)).toLowerCase();
          if (subTxt.includes(trimmedQuery)) return true;
        }
        for (const field of effectiveFields) {
          const fn = field.value || field.mobileValue || field.cell || field.render;
          const node = fn
            ? fn(row, idx)
            : (row as Record<string, unknown>)?.[field.key] !== undefined
            ? String((row as Record<string, unknown>)[field.key])
            : null;
          if (extractTextFromNode(node).toLowerCase().includes(trimmedQuery)) {
            return true;
          }
        }
        if (row && typeof row === 'object') {
          return Object.values(row as Record<string, unknown>).some(
            (v) =>
              (typeof v === 'string' || typeof v === 'number') &&
              String(v).toLowerCase().includes(trimmedQuery)
          );
        }
        return false;
      });
    }

    return result;
  }, [
    data,
    filters,
    internalFilterValues,
    activeSearchQuery,
    onSearchChange,
    searchPredicate,
    searchKeys,
    resolveTitle,
    resolveSubtitle,
    effectiveFields,
  ]);

  // 2. Application du tri
  const sortedData = useMemo(() => {
    if (!activeSortKey || sortOptions.length === 0) return filteredData;
    const option = sortOptions.find((o) => o.key === activeSortKey);
    if (!option) return filteredData;

    const copy = [...filteredData];
    const dirMultiplier = activeSortDirection === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      if (option.compare) {
        return option.compare(a, b) * dirMultiplier;
      }
      const rawA = option.getValue
        ? option.getValue(a)
        : ((a as Record<string, unknown>)?.[option.key] as string | number | Date | null | undefined);
      const rawB = option.getValue
        ? option.getValue(b)
        : ((b as Record<string, unknown>)?.[option.key] as string | number | Date | null | undefined);

      if (rawA === null || rawA === undefined) return 1;
      if (rawB === null || rawB === undefined) return -1;

      if (typeof rawA === 'number' && typeof rawB === 'number') {
        return (rawA - rawB) * dirMultiplier;
      }
      if (rawA instanceof Date && rawB instanceof Date) {
        return (rawA.getTime() - rawB.getTime()) * dirMultiplier;
      }
      return (
        String(rawA).localeCompare(String(rawB), 'fr', { numeric: true, sensitivity: 'base' }) *
        dirMultiplier
      );
    });

    return copy;
  }, [filteredData, activeSortKey, activeSortDirection, sortOptions]);

  // 3. Pagination par 20
  const safePageSize = Math.max(1, pageSize || 20);
  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));

  useEffect(() => {
    if (activePage > totalPages) {
      setPage(totalPages);
    }
  }, [totalItems, totalPages, activePage]);

  const paginatedData = useMemo(() => {
    const start = (activePage - 1) * safePageSize;
    return sortedData.slice(start, start + safePageSize);
  }, [sortedData, activePage, safePageSize]);

  const startIndex = totalItems === 0 ? 0 : (activePage - 1) * safePageSize + 1;
  const endIndex = Math.min(activePage * safePageSize, totalItems);

  const showToolbar =
    searchable ||
     Boolean(onSearchChange) ||
    sortOptions.length > 0 ||
    filters.length > 0 ||
    Boolean(filterSlot) ||
    Boolean(toolbarExtra);

  return (
    <div className="w-full max-w-full min-w-0 box-border space-y-4">
      {/* BARRE D'OUTILS : RECHERCHE, FILTRES ET TRI */}
      {showToolbar && (
        <div className="w-full max-w-full min-w-0 box-border rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full max-w-full min-w-0 box-border">
            {/* Champ de recherche */}
            {(searchable || Boolean(onSearchChange)) && (
              <div className="relative flex-1 min-w-0 w-full box-border">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  type="search"
                  value={activeSearchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full max-w-full min-w-0 box-border pl-11 pr-10 min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none"
                />
                {activeSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSearchInput('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Sélecteur de tri */}
            {sortOptions.length > 0 && (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto min-w-0 box-border">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                  <ArrowUpDown className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span>Trier par :</span>
                </div>
                <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-0 w-full sm:w-auto">
                  <select
                    value={activeSortKey}
                    onChange={(e) => handleSortKeyChange(e.target.value)}
                    aria-label="Critère de tri"
                    className="w-full flex-1 sm:flex-initial min-w-0 max-w-full box-border min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold px-3"
                  >
                    {sortOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleToggleSortDirection}
                    aria-label={
                      activeSortDirection === 'asc'
                        ? 'Ordre croissant (cliquer pour décroissant)'
                        : 'Ordre décroissant (cliquer pour croissant)'
                    }
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold cursor-pointer transition shrink-0"
                  >
                    {activeSortDirection === 'asc' ? (
                      <>
                        <ArrowUp className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                        <span>Croissant</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                        <span>Décroissant</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Actions / outils supplémentaires dans la barre */}
            {toolbarExtra && (
              <div className="flex flex-wrap items-center gap-2 min-w-0 box-border">
                {toolbarExtra}
              </div>
            )}
          </div>

          {/* Filtres déclaratifs ou personnalisés */}
          {(filters.length > 0 || Boolean(filterSlot)) && (
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 w-full max-w-full min-w-0 box-border">
              {filters.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                  <Filter className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span>Filtres :</span>
                </div>
              )}

              {filters.map((filterCfg) => {
                const selectedVal =
                  filterCfg.value !== undefined
                    ? filterCfg.value
                    : (internalFilterValues[filterCfg.key] ?? filterCfg.defaultValue ?? 'all');

                return (
                  <div
                    key={filterCfg.key}
                    className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-0 flex-1 sm:flex-initial box-border"
                  >
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                      {filterCfg.label} :
                    </label>
                    <select
                      value={selectedVal}
                      onChange={(e) => handleFilterChange(filterCfg, e.target.value)}
                      aria-label={filterCfg.label}
                      className="min-w-0 max-w-full box-border min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold px-3"
                    >
                      {filterCfg.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.count !== undefined ? ` (${opt.count})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {filterSlot && (
                <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1 box-border">
                  {filterSlot}
                </div>
              )}

              {(hasActiveDeclarativeFilters || activeSearchQuery.trim().length > 0) && (
                <button
                  type="button"
                  onClick={resetAllFiltersAndSearch}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer transition ml-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* LISTE DE CARTES :
          - 1 carte par ligne jusqu'à 1279 px (grid-cols-1)
          - 2 cartes par ligne à partir de 1280 px (xl:grid-cols-2)
          - Aucune hauteur fixe, aucun line-clamp, aucun overflow hidden sur du texte, aucune largeur fixe en px
      */}
      {paginatedData.length === 0 ? (
        <div className="w-full max-w-full min-w-0 box-border rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full max-w-full min-w-0 box-border items-stretch">
          {paginatedData.map((row, idx) => {
            const globalIdx = (activePage - 1) * safePageSize + idx;
            const key = resolveKey(row, globalIdx);
            const extraCardClass = resolveCardClass ? resolveCardClass(row, globalIdx) : '';

            const titleNode = resolveTitle
              ? resolveTitle(row, globalIdx)
              : String((row as Record<string, unknown>)?.id ?? `#${globalIdx + 1}`);
            const subtitleNode = resolveSubtitle ? resolveSubtitle(row, globalIdx) : null;
            const badgeNode = resolveBadges ? resolveBadges(row, globalIdx) : null;

            const resolvedDeclarativeActions =
              typeof actions === 'function' ? actions(row, globalIdx) : actions || [];
            const visibleDeclarativeActions = resolvedDeclarativeActions.filter((act) =>
              typeof act.hidden === 'function' ? !act.hidden(row, globalIdx) : !act.hidden
            );
            const customActionsNode = resolveCustomActions
              ? resolveCustomActions(row, globalIdx)
              : null;

            const visibleFields = effectiveFields.filter((f) => {
              if (typeof f.hidden === 'function') return !f.hidden(row, globalIdx);
              return !f.hidden;
            });

            return (
              <article
                key={key}
                className={`w-full max-w-full min-w-0 h-auto box-border rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3.5 transition-colors ${extraCardClass}`}
              >
                {/* Partie supérieure et centrale de la carte */}
                <div className="w-full max-w-full min-w-0 box-border space-y-3">
                  {/* 1. TITRE PRINCIPAL EN HAUT (numéro, nom ou référence, police des codes, retour à la ligne autorisé) */}
                  <div className="w-full max-w-full min-w-0 box-border">
                    <div className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug whitespace-normal [overflow-wrap:anywhere] break-words min-w-0 max-w-full">
                      {titleNode}
                    </div>
                    {subtitleNode !== null &&
                      subtitleNode !== undefined &&
                      subtitleNode !== '' && (
                        <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400 leading-normal whitespace-normal [overflow-wrap:anywhere] break-words min-w-0 max-w-full">
                          {subtitleNode}
                        </div>
                      )}
                  </div>

                  {/* 2. BADGES DE STATUT SUR LEUR PROPRE LIGNE */}
                  {badgeNode !== null && badgeNode !== undefined && badgeNode !== false && (
                    <div className="w-full max-w-full min-w-0 box-border flex flex-wrap items-center gap-2 pt-0.5">
                      {badgeNode}
                    </div>
                  )}

                  {/* 3. VALEURS CLÉS "libellé : valeur" (UNE PAR LIGNE, MONTANTS EN NOWRAP ALIGNÉS À DROITE) */}
                  {visibleFields.length > 0 && (
                    <dl className="w-full max-w-full min-w-0 box-border pt-2.5 border-t border-slate-100 dark:border-slate-800/90 space-y-2 m-0">
                      {visibleFields.map((field) => {
                        const rawHeader =
                          field.mobileLabel !== undefined
                            ? field.mobileLabel
                            : field.label !== undefined
                            ? field.label
                            : field.header;

                        const renderFn =
                          field.value || field.mobileValue || field.cell || field.render;
                        const valNode = renderFn
                          ? renderFn(row, globalIdx)
                          : ((row as Record<string, unknown>)?.[field.key] as React.ReactNode);

                        if (valNode === null || valNode === undefined || valNode === '') {
                          return null;
                        }

                        const isAmountField = Boolean(
                          field.isAmount || field.isNumeric || field.align === 'right'
                        );

                        return (
                          <div
                            key={field.key}
                            className="w-full max-w-full min-w-0 box-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs sm:text-sm leading-relaxed"
                          >
                            {rawHeader !== undefined && rawHeader !== null && rawHeader !== '' && (
                              <dt className="text-slate-600 dark:text-slate-400 font-medium min-w-0 [overflow-wrap:anywhere]">
                                {rawHeader}
                                {typeof rawHeader === 'string' &&
                                !rawHeader.trim().endsWith(':')
                                  ? ' :'
                                  : ''}
                              </dt>
                            )}
                            <dd
                              className={
                                isAmountField
                                  ? 'font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap text-right ml-auto shrink-0 m-0'
                                  : 'font-semibold text-slate-900 dark:text-slate-100 min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere] break-words text-right ml-auto m-0'
                              }
                            >
                              {valNode}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}

                  {/* Contenu complémentaire éventuel */}
                  {renderExtraContent && (
                    <div className="w-full max-w-full min-w-0 box-border pt-2">
                      {renderExtraContent(row, globalIdx)}
                    </div>
                  )}
                </div>

                {/* 4. BOUTONS D'ACTION EN BAS (48 px, flex-wrap, libellés complets) */}
                {(visibleDeclarativeActions.length > 0 || Boolean(customActionsNode)) && (
                  <div className="w-full max-w-full min-w-0 box-border pt-3 border-t border-slate-100 dark:border-slate-800/90 flex flex-wrap items-center justify-end gap-2 [&_button]:min-h-[48px] [&_button]:px-3.5 [&_button]:py-2.5 [&_a]:min-h-[48px] [&_a]:px-3.5 [&_a]:py-2.5">
                    {visibleDeclarativeActions.map((act) => {
                      const isDisabled =
                        typeof act.disabled === 'function'
                          ? act.disabled(row, globalIdx)
                          : Boolean(act.disabled);
                      const variantClasses = getActionVariantClasses(act.variant);

                      return (
                        <button
                          key={act.key}
                          type="button"
                          disabled={isDisabled}
                          title={act.title}
                          onClick={(e) => act.onClick(row, globalIdx, e)}
                          className={`inline-flex items-center justify-center gap-2 min-h-[48px] h-auto px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm leading-snug cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition box-border min-w-0 ${variantClasses} ${
                            act.className || ''
                          }`}
                        >
                          {act.icon && <span className="shrink-0">{act.icon}</span>}
                          <span className="whitespace-normal [overflow-wrap:anywhere]">
                            {act.label}
                          </span>
                        </button>
                      );
                    })}
                    {customActionsNode}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* PIED DE LISTE : TOTAUX ET PAGINATION PAR 20 */}
      {(resolvedFooter || totalItems > 0) && (
        <div className="w-full max-w-full min-w-0 box-border rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm shadow-2xs">
          {/* Résumé du nombre de lignes + totaux */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0 box-border">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Total : <strong className="text-slate-900 dark:text-white">{totalItems}</strong>{' '}
              {totalItems > 1 ? 'lignes' : 'ligne'}
            </span>
            {resolvedFooter && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-800 dark:text-slate-200 font-semibold min-w-0">
                {resolvedFooter}
              </div>
            )}
          </div>

          {/* Contrôles de pagination par 20 (boutons 48 px) */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 flex-wrap min-w-0 box-border">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {startIndex}–{endIndex} sur {totalItems}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={activePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center justify-center gap-1 min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition box-border"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span>Précédent</span>
                </button>
                <span className="inline-flex items-center justify-center min-h-[48px] px-3.5 py-2 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-black text-xs box-border">
                  Page {activePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={activePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center justify-center gap-1 min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition box-border"
                  aria-label="Page suivante"
                >
                  <span>Suivant</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Alias francophone explicite pour le composant partagé "Liste de cartes". */
export const ListeDeCartes = CardList;

export default CardList;
