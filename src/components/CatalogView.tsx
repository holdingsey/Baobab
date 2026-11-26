import React, { useState } from 'react';
import {
  Package,
  Layers,
  Shield,
  Edit3,
  Download,
  Plus,
  History,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
  EyeOff,
} from 'lucide-react';
import { StockBadge } from './StockBadge';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { FORM_FIELD_CLASS, FORM_LABEL_CLASS, FORM_ROW_CLASS } from './FormControls';
import { CardList } from './CardList';
import { ExportViewButton } from './ExtractionsView';

export interface ProductPriceHistoryEntry {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  old_price_box?: number | null;
  new_price_box: number;
  old_wholesale_price_box?: number | null;
  new_wholesale_price_box?: number | null;
  effective_date: string;
  changed_by: string;
  motif?: string | null;
  created_at: string;
}

export interface ProductItem {
  id: string;
  code: string;
  name: string;
  gamme: string;
  packaging: string;
  units_per_box: number;
  price_box: number;
  wholesale_price_box?: number | null;
  price_effective_date?: string | null;
  stock_depot: number;
  threshold_depot: number;
  is_active?: number;
  price_history?: ProductPriceHistoryEntry[];
}

interface CatalogViewProps {
  products: ProductItem[];
  gammes: string[]; // Dynamiquement lues dans la table produits, jamais en dur
  currentRole: string;
  onRefreshProducts: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  products,
  gammes,
  currentRole,
  onRefreshProducts,
}) => {
  const [selectedGamme, setSelectedGamme] = useState<string>('Toutes');
  const [showInactive, setShowInactive] = useState<boolean>(true);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<ProductItem | null>(null);
  const [reclassifyProduct, setReclassifyProduct] = useState<ProductItem | null>(null);

  // Form state for Nouveau produit / Modifier produit
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formGamme, setFormGamme] = useState('');
  const [formPackaging, setFormPackaging] = useState('Carton de 12');
  const [formUnitsPerBox, setFormUnitsPerBox] = useState<number>(12);
  const [formPrice, setFormPrice] = useState<number>(9000);
  const [formWholesalePrice, setFormWholesalePrice] = useState<string>('8500');
  const [formEffectiveDate, setFormEffectiveDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [formPriceMotif, setFormPriceMotif] = useState<string>('');
  const [formStock, setFormStock] = useState<number>(100);
  const [formThreshold, setFormThreshold] = useState<number>(40);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string>('');
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // State for Reclassement de stock
  const [reclassifyTargetId, setReclassifyTargetId] = useState<string>('');
  const [reclassifyQty, setReclassifyQty] = useState<number>(10);
  const [reclassifyMotif, setReclassifyMotif] = useState<string>('');
  const [reclassifyError, setReclassifyError] = useState<string>('');
  const [isReclassifying, setIsReclassifying] = useState<boolean>(false);

  const isAdmin = currentRole === 'Administrateur';

  // Gammes lues dynamiquement depuis la table des produits
  const dynamicGammes = Array.from(
    new Set(
      (gammes && gammes.length > 0 ? gammes : products.map((p) => p.gamme))
        .map((g) => String(g || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const filtered = products.filter((p) => {
    const matchesGamme = selectedGamme === 'Toutes' || p.gamme === selectedGamme;
    const isProdActive = Number(p.is_active ?? 1) === 1;
    const matchesStatus = showInactive ? true : isProdActive;
    return matchesGamme && matchesStatus;
  });

  const activeFlavorsForReclassify = products.filter(
    (p) => Number(p.is_active ?? 1) === 1 && (!reclassifyProduct || p.id !== reclassifyProduct.id)
  );

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormCode(`BAO-PRD-${String(products.length + 1).padStart(3, '0')}`);
    setFormName('');
    setFormGamme(dynamicGammes[0] || 'Jus Cajoucy');
    setFormPackaging('Carton de 12');
    setFormUnitsPerBox(12);
    setFormPrice(9000);
    setFormWholesalePrice('8500');
    setFormEffectiveDate(new Date().toISOString().split('T')[0]);
    setFormPriceMotif('Tarif initial catalogue');
    setFormStock(100);
    setFormThreshold(40);
    setFormIsActive(true);
    setFormError('');
    setShowCreateModal(true);
  };

  const startEdit = (p: ProductItem) => {
    setShowCreateModal(false);
    setEditingProduct(p);
    setFormCode(p.code);
    setFormName(p.name);
    setFormGamme(p.gamme);
    setFormPackaging(p.packaging);
    setFormUnitsPerBox(p.units_per_box);
    setFormPrice(p.price_box);
    setFormWholesalePrice(
      p.wholesale_price_box !== undefined && p.wholesale_price_box !== null
        ? String(p.wholesale_price_box)
        : ''
    );
    setFormEffectiveDate(p.price_effective_date || new Date().toISOString().split('T')[0]);
    setFormPriceMotif('');
    setFormStock(p.stock_depot);
    setFormThreshold(p.threshold_depot);
    setFormIsActive(Number(p.is_active ?? 1) === 1);
    setFormError('');
  };

  const openReclassifyModal = (p: ProductItem) => {
    const sameGammeActive = products.filter(
      (cand) => cand.id !== p.id && Number(cand.is_active ?? 1) === 1 && cand.gamme === p.gamme
    );
    const defaultTarget = sameGammeActive[0] || activeFlavorsForReclassify[0];
    setReclassifyProduct(p);
    setReclassifyTargetId(defaultTarget ? defaultTarget.id : '');
    setReclassifyQty(Math.max(1, Number(p.stock_depot || 0)));
    setReclassifyMotif(`Reclassement du stock de ${p.name} vers une saveur active Jus Cajoucy`);
    setReclassifyError('');
  };

  const parsedWholesale =
    formWholesalePrice.trim() !== '' ? Number(formWholesalePrice.trim()) : null;
  const wholesaleInvalid =
    parsedWholesale !== null &&
    (!Number.isFinite(parsedWholesale) || parsedWholesale <= 0 || parsedWholesale > Number(formPrice));

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (wholesaleInvalid) {
      setFormError(
        `Contrôle tarifaire : le prix grossiste (${Number(parsedWholesale || 0).toLocaleString('fr-FR')} FCFA) doit être inférieur ou égal au prix détaillant (${Number(formPrice).toLocaleString('fr-FR')} FCFA).`
      );
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        code: formCode.trim(),
        name: formName.trim(),
        gamme: formGamme.trim(),
        packaging: formPackaging.trim(),
        units_per_box: Number(formUnitsPerBox),
        price_box: Number(formPrice),
        wholesale_price_box: parsedWholesale,
        price_effective_date: formEffectiveDate,
        price_motif: formPriceMotif.trim() || undefined,
        stock_depot: Number(formStock),
        threshold_depot: Number(formThreshold),
        is_active: formIsActive ? 1 : 0,
      };

      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setFormError(data.error || 'Erreur lors de la sauvegarde du produit.');
        return;
      }

      onRefreshProducts();
      setEditingProduct(null);
      setShowCreateModal(false);
      setFeedbackBanner({
        type: 'success',
        text: data.message || 'Catalogue mis à jour avec succès.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReclassifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reclassifyProduct) return;
    setReclassifyError('');

    if (!reclassifyTargetId) {
      setReclassifyError('Veuillez sélectionner une saveur active de destination.');
      return;
    }
    if (!reclassifyMotif.trim() || reclassifyMotif.trim().length < 3) {
      setReclassifyError('Veuillez saisir un motif de reclassement (minimum 3 caractères).');
      return;
    }

    setIsReclassifying(true);
    try {
      const res = await fetch(`/api/products/${reclassifyProduct.id}/reclassify-stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          target_product_id: reclassifyTargetId,
          quantity: Number(reclassifyQty),
          motif: reclassifyMotif.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setReclassifyError(data.error || 'Erreur lors du reclassement de stock.');
        return;
      }
      onRefreshProducts();
      setReclassifyProduct(null);
      setFeedbackBanner({
        type: 'success',
        text: data.message || 'Stock reclassé avec succès.',
      });
    } finally {
      setIsReclassifying(false);
    }
  };

  const handleExportCatalogPdf = () => {
    const totalStockBoxes = filtered.reduce((sum, p) => sum + Number(p.stock_depot || 0), 0);
    const totalValue = filtered.reduce(
      (sum, p) => sum + Number(p.stock_depot || 0) * Number(p.price_box || 0),
      0
    );

    exportTableToPdf({
      title: `Catalogue Produits & Stocks - Baobab Distribution (${selectedGamme})`,
      subtitle: 'Grille tarifaire officielle (Detaillant & Grossiste) par carton et stock disponible au depot central',
      filename: `catalogue_stocks_baobab_${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: `Role : ${currentRole}`,
      summaryCards: [
        { label: 'Produits affiches', value: `${filtered.length} references` },
        { label: 'Gamme selectionnee', value: selectedGamme },
        { label: 'Stock total depot', value: `${totalStockBoxes} cartons` },
        { label: 'Valeur stock', value: formatFcfaPdf(totalValue) },
      ],
      columns: [
        'Code Ref.',
        'Designation Produit',
        'Gamme',
        'Statut',
        'Conditionnement',
        'Prix Detaillant',
        'Prix Grossiste',
        'Stock Depot',
        'Valeur Stock',
      ],
      rows: filtered.map((p) => [
        p.code,
        p.name,
        p.gamme,
        Number(p.is_active ?? 1) === 1 ? 'Actif' : 'Desactive',
        `${p.packaging} (${p.units_per_box} u/ctn)`,
        formatFcfaPdf(p.price_box),
        p.wholesale_price_box ? formatFcfaPdf(p.wholesale_price_box) : '-',
        `${p.stock_depot} ctn`,
        formatFcfaPdf(Number(p.stock_depot || 0) * Number(p.price_box || 0)),
      ]),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white break-words">
              Catalogue Produits &bull; Baobab Distribution
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              Prix Détaillant &amp; Grossiste &bull; FCFA
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Grille tarifaire par carton (détaillant et grossiste), historique des prix et stocks au dépôt central.
            </p>
            <InfoTooltip text="Les gammes sont lues dynamiquement dans la table des produits. Le prix grossiste est optionnel et contrôlé (inférieur ou égal au prix détaillant)." />
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 h-[44px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Nouveau produit</span>
            </button>
          )}

          <ExportViewButton
            currentUser={{
              id: isAdmin ? 'usr-adm' : currentRole === 'Gestionnaire grossiste' ? 'usr-grs' : 'usr-generic',
              code: isAdmin ? 'BAO-ADM' : currentRole === 'Gestionnaire grossiste' ? 'BAO-GRS' : 'BAO',
              name: currentRole,
              email: '',
              role: currentRole as any,
              phone: '',
            }}
            jeu="catalogue_et_prix"
            label="Exporter"
            filtres={{ gamme: selectedGamme !== 'Toutes' ? selectedGamme : '' }}
          />

          {currentRole !== 'Vendeur' && (
            <button
              type="button"
              onClick={handleExportCatalogPdf}
              className="inline-flex items-center gap-2 h-[44px] px-3.5 rounded-[12px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
              <span>Exporter Catalogue &amp; Stocks (PDF)</span>
            </button>
          )}

          {isAdmin && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--marque-clair)] border border-[#008DA9]/30 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] text-xs font-semibold">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Mode Gestion Administrateur</span>
            </div>
          )}
        </div>
      </div>

      {feedbackBanner && (
        <div
          className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border text-xs sm:text-sm font-semibold ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Gamme Filter Tabs — Lues dynamiquement depuis la table des produits */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" /> Filtrer par gamme de produits :
          </span>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-[var(--marque-fonce)] focus:ring-[var(--marque-fonce)]"
            />
            <span>Afficher aussi les anciens produits désactivés</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={() => setSelectedGamme('Toutes')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
              selectedGamme === 'Toutes'
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <span className="break-words leading-snug">Toutes les gammes</span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                selectedGamme === 'Toutes'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {products.filter((p) => (showInactive ? true : Number(p.is_active ?? 1) === 1)).length}
            </span>
          </button>
          {dynamicGammes.map((g) => {
            const activeCount = products.filter(
              (p) => p.gamme === g && Number(p.is_active ?? 1) === 1
            ).length;
            const totalCount = products.filter(
              (p) => p.gamme === g && (showInactive ? true : Number(p.is_active ?? 1) === 1)
            ).length;
            const isSelected = selectedGamme === g;
            return (
              <button
                key={g}
                onClick={() => setSelectedGamme(g)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
                  isSelected
                    ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <span className="break-words leading-snug">{g}</span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                  title={`${activeCount} actif(s) sur ${totalCount}`}
                >
                  {activeCount} actif{activeCount > 1 ? 's' : ''}
                  {showInactive && totalCount > activeCount ? ` (+${totalCount - activeCount} ancien)` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste de cartes partagée du Catalogue Officiel */}
      <CardList<ProductItem>
        data={filtered}
        rowKey={(prod) => prod.id}
        pageSize={20}
        searchable={true}
        searchPlaceholder="Rechercher par référence, saveur, nom du produit, gamme, conditionnement..."
        searchPredicate={(prod, q) =>
          [prod.code, prod.name, prod.gamme, prod.packaging]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        }
        sortOptions={[
          {
            key: 'code_asc',
            label: 'Référence (A → Z)',
            compare: (a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'fr'),
          },
          {
            key: 'name_asc',
            label: 'Désignation (A → Z)',
            compare: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'),
          },
          {
            key: 'price_desc',
            label: 'Prix détaillant (décroissant)',
            compare: (a, b) => Number(b.price_box || 0) - Number(a.price_box || 0),
          },
          {
            key: 'stock_desc',
            label: 'Stock dépôt (décroissant)',
            compare: (a, b) => Number(b.stock_depot || 0) - Number(a.stock_depot || 0),
          },
        ]}
        defaultSortKey="name_asc"
        emptyMessage="Aucun produit trouvé dans le catalogue."
        title={(prod) => {
          const isInactive = Number(prod.is_active ?? 1) === 0;
          return (
            <div className="flex flex-wrap items-baseline justify-between gap-2 w-full min-w-0">
              <span
                className={`font-extrabold text-sm sm:text-base [overflow-wrap:anywhere] ${
                  isInactive
                    ? 'text-slate-500 dark:text-slate-400 line-through'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {prod.name}
              </span>
              <span className="font-mono font-extrabold text-xs text-teal-600 dark:text-teal-400 [overflow-wrap:anywhere]">
                {prod.code}
              </span>
            </div>
          );
        }}
        badges={(prod) => {
          const isInactive = Number(prod.is_active ?? 1) === 0;
          return (
            <>
              {isInactive ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <EyeOff className="w-3 h-3 shrink-0" />
                  <span>Désactivé (Historique conservé)</span>
                </span>
              ) : (
                <StockBadge stock={prod.stock_depot} threshold={prod.threshold_depot} />
              )}
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {prod.gamme}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300">
                {prod.units_per_box} u / carton
              </span>
            </>
          );
        }}
        fields={[
          {
            key: 'code',
            label: 'Référence',
            render: (prod) => (
              <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                {prod.code}
              </span>
            ),
          },
          {
            key: 'name',
            label: 'Désignation du produit',
            render: (prod) => <strong className="text-slate-900 dark:text-white">{prod.name}</strong>,
          },
          {
            key: 'gamme',
            label: 'Gamme',
            render: (prod) => prod.gamme,
          },
          {
            key: 'packaging',
            label: 'Conditionnement',
            render: (prod) => `${prod.packaging} (${prod.units_per_box} unités / carton)`,
          },
          {
            key: 'price_box',
            label: 'Prix détaillant / carton',
            isAmount: true,
            render: (prod) => (
              <span className="font-black text-base text-[#008DA9] dark:text-teal-400 whitespace-nowrap">
                {Number(prod.price_box || 0).toLocaleString('fr-FR')} FCFA
              </span>
            ),
          },
          {
            key: 'wholesale_price_box',
            label: 'Prix grossiste / carton',
            isAmount: true,
            render: (prod) =>
              prod.wholesale_price_box !== undefined && prod.wholesale_price_box !== null ? (
                <span className="font-extrabold text-sm sm:text-base text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                  {Number(prod.wholesale_price_box).toLocaleString('fr-FR')} FCFA
                </span>
              ) : (
                <span className="text-xs italic text-slate-400">Non défini (optionnel)</span>
              ),
          },
          {
            key: 'stock_depot',
            label: 'Stock dépôt central',
            isAmount: true,
            render: (prod) => (
              <span className="font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                {Number(prod.stock_depot || 0).toLocaleString('fr-FR')} cartons (seuil : {prod.threshold_depot} ctn)
              </span>
            ),
          },
          {
            key: 'stock_value',
            label: 'Valorisation stock',
            isAmount: true,
            render: (prod) => (
              <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                {(Number(prod.stock_depot || 0) * Number(prod.price_box || 0)).toLocaleString('fr-FR')} FCFA
              </span>
            ),
          },
        ]}
        renderActions={(prod) => (
          <div className="flex flex-wrap items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => setHistoryProduct(prod)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Historique des prix ({prod.price_history?.length || 0})</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => startEdit(prod)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-xl border border-[#64748B] dark:border-[#94A3B8] bg-[#F1F5F9] dark:bg-[#1E293B] hover:bg-[#E2E8F0] dark:hover:bg-[#334155] text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                <span>Modifier</span>
              </button>
            )}

            {isAdmin && Number(prod.stock_depot || 0) > 0 && Number(prod.is_active ?? 1) === 0 && (
              <button
                type="button"
                onClick={() => openReclassifyModal(prod)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Reclasser le stock ({prod.stock_depot} ctn)</span>
              </button>
            )}
          </div>
        )}
        totalsFooter={
          <>
            <span>
              Stock total :{' '}
              <strong className="whitespace-nowrap">
                {filtered.reduce((acc, p) => acc + Number(p.stock_depot || 0), 0).toLocaleString('fr-FR')} cartons
              </strong>
            </span>
            <span>
              Valorisation stock :{' '}
              <strong className="text-teal-700 dark:text-teal-400 whitespace-nowrap">
                {filtered
                  .reduce((acc, p) => acc + Number(p.stock_depot || 0) * Number(p.price_box || 0), 0)
                  .toLocaleString('fr-FR')}{' '}
                FCFA
              </strong>
            </span>
          </>
        }
      />

      {/* Modal Nouveau produit / Modifier le produit */}
      {(showCreateModal || editingProduct) && (
        <FormModal
          title={editingProduct ? `Modifier le produit (${editingProduct.code})` : 'Nouveau produit'}
          subtitle="Grille tarifaire (Prix détaillant & Prix grossiste contrôlé) avec date d'effet et historique"
          icon={<Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProduct(null);
            setFormError('');
          }}
          onSubmit={handleSaveModal}
          submitLabel={
            isSaving
              ? 'Enregistrement...'
              : editingProduct
              ? 'Enregistrer les modifications'
              : 'Créer le produit'
          }
          submitDisabled={isSaving || !formName.trim() || wholesaleInvalid}
          isDirty={Boolean(formName.trim())}
        >
          <div className="flex flex-col gap-4">
            {formError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Code référence</label>
                <input
                  type="text"
                  required
                  value={formCode}
                  disabled={Boolean(editingProduct)}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Ex: JUS-CAJ-ANA-12"
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>Gamme de produit</label>
                <input
                  type="text"
                  required
                  list="catalog-gammes-list"
                  value={formGamme}
                  onChange={(e) => setFormGamme(e.target.value)}
                  placeholder="Ex: Jus Cajoucy"
                  className={FORM_FIELD_CLASS}
                />
                <datalist id="catalog-gammes-list">
                  {dynamicGammes.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Désignation du produit</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Cajoucy Ananas"
                className={FORM_FIELD_CLASS}
              />
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Conditionnement</label>
                <input
                  type="text"
                  required
                  value={formPackaging}
                  onChange={(e) => setFormPackaging(e.target.value)}
                  placeholder="Ex: Carton de 12"
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>Unités par carton</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formUnitsPerBox}
                  onChange={(e) => setFormUnitsPerBox(Number(e.target.value))}
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Prix détaillant par carton (FCFA) *</label>
                <input
                  type="number"
                  min="100"
                  required
                  value={formPrice}
                  onChange={(e) => setFormPrice(Number(e.target.value))}
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>Prix grossiste par carton (FCFA) — Optionnel</label>
                <input
                  type="number"
                  min="0"
                  max={formPrice}
                  value={formWholesalePrice}
                  onChange={(e) => setFormWholesalePrice(e.target.value)}
                  placeholder="Ex: 8500 (<= prix détaillant)"
                  className={FORM_FIELD_CLASS}
                />
                {wholesaleInvalid && (
                  <p className="mt-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                    Le prix grossiste doit être inférieur ou égal au prix détaillant ({Number(formPrice).toLocaleString('fr-FR')} FCFA).
                  </p>
                )}
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Date d&apos;effet du tarif</label>
                <input
                  type="date"
                  required
                  value={formEffectiveDate}
                  onChange={(e) => setFormEffectiveDate(e.target.value)}
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>Motif tarifaire (historique)</label>
                <input
                  type="text"
                  value={formPriceMotif}
                  onChange={(e) => setFormPriceMotif(e.target.value)}
                  placeholder="Ex: Révision tarifaire grossiste"
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Stock dépôt (cartons)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formStock}
                  onChange={(e) => setFormStock(Number(e.target.value))}
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>Seuil d&apos;alerte (cartons)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(Number(e.target.value))}
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="rounded border-slate-300 text-[var(--marque-fonce)] focus:ring-[var(--marque-fonce)]"
              />
              <span>
                Produit actif (visible dans les formulaires de vente, de chargement et de réception)
              </span>
            </label>
          </div>
        </FormModal>
      )}

      {/* Modal Historique des prix */}
      {historyProduct && (
        <FormModal
          title={`Historique des prix — ${historyProduct.name}`}
          subtitle={`Réf. ${historyProduct.code} • Gamme ${historyProduct.gamme}`}
          icon={<History className="w-5 h-5 text-teal-600 dark:text-teal-400" />}
          onClose={() => setHistoryProduct(null)}
          onSubmit={(e) => {
            e.preventDefault();
            setHistoryProduct(null);
          }}
          submitLabel="Fermer"
        >
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Prix détaillant actuel : </span>
                <strong className="text-[#008DA9] dark:text-teal-400">
                  {Number(historyProduct.price_box || 0).toLocaleString('fr-FR')} FCFA
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Prix grossiste actuel : </span>
                <strong className="text-indigo-700 dark:text-indigo-300">
                  {historyProduct.wholesale_price_box
                    ? `${Number(historyProduct.wholesale_price_box).toLocaleString('fr-FR')} FCFA`
                    : 'Non défini'}
                </strong>
              </div>
              {historyProduct.price_effective_date && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Date d&apos;effet : </span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {historyProduct.price_effective_date}
                  </strong>
                </div>
              )}
            </div>

            {(!historyProduct.price_history || historyProduct.price_history.length === 0) ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                Aucun changement de tarif enregistré pour ce produit.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {historyProduct.price_history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        Date d&apos;effet : {h.effective_date}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Par {h.changed_by}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900">
                        <span className="block text-[10px] uppercase font-bold text-slate-500">
                          Prix détaillant / carton
                        </span>
                        <span className="font-extrabold text-teal-700 dark:text-teal-300">
                          {h.old_price_box ? `${Number(h.old_price_box).toLocaleString('fr-FR')} → ` : ''}
                          {Number(h.new_price_box).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900">
                        <span className="block text-[10px] uppercase font-bold text-slate-500">
                          Prix grossiste / carton
                        </span>
                        <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
                          {h.old_wholesale_price_box
                            ? `${Number(h.old_wholesale_price_box).toLocaleString('fr-FR')} → `
                            : ''}
                          {h.new_wholesale_price_box
                            ? `${Number(h.new_wholesale_price_box).toLocaleString('fr-FR')} FCFA`
                            : 'Non défini'}
                        </span>
                      </div>
                    </div>
                    {h.motif && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                        <strong>Motif :</strong> {h.motif}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormModal>
      )}

      {/* Modal Reclassement motivé du stock vers une saveur active */}
      {reclassifyProduct && (
        <FormModal
          title={`Reclasser le stock — ${reclassifyProduct.name}`}
          subtitle={`Transférer le stock résiduel (${reclassifyProduct.stock_depot} cartons) vers une saveur active par un mouvement motivé`}
          icon={<ArrowRightLeft className="w-5 h-5 text-amber-600" />}
          onClose={() => {
            setReclassifyProduct(null);
            setReclassifyError('');
          }}
          onSubmit={handleReclassifySubmit}
          submitLabel={isReclassifying ? 'Reclassement en cours...' : 'Valider le reclassement motivé'}
          submitDisabled={
            isReclassifying ||
            !reclassifyTargetId ||
            reclassifyQty <= 0 ||
            reclassifyQty > Number(reclassifyProduct.stock_depot || 0) ||
            reclassifyMotif.trim().length < 3
          }
          isDirty={true}
        >
          <div className="flex flex-col gap-4">
            {reclassifyError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reclassifyError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
              Produit source : <strong>{reclassifyProduct.name}</strong> ({reclassifyProduct.code}) • Stock disponible :{' '}
              <strong>{reclassifyProduct.stock_depot} cartons</strong>. L&apos;historique des ventes, stocks et lots de ce produit reste intact.
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Saveur active de destination *</label>
              <select
                required
                value={reclassifyTargetId}
                onChange={(e) => setReclassifyTargetId(e.target.value)}
                className={FORM_FIELD_CLASS}
              >
                <option value="">-- Sélectionner une saveur Jus Cajoucy --</option>
                {activeFlavorsForReclassify.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.name} ({fl.code}) — Gamme {fl.gamme} • Stock actuel : {fl.stock_depot} ctn
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Quantité à reclasser (cartons, max {reclassifyProduct.stock_depot}) *
              </label>
              <input
                type="number"
                min="1"
                max={reclassifyProduct.stock_depot}
                required
                value={reclassifyQty}
                onChange={(e) => setReclassifyQty(Number(e.target.value))}
                className={FORM_FIELD_CLASS}
              />
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Motif obligatoire du mouvement de reclassement *</label>
              <textarea
                rows={3}
                required
                value={reclassifyMotif}
                onChange={(e) => setReclassifyMotif(e.target.value)}
                placeholder="Ex: Reclassement après inventaire physique par saveur au dépôt central Sotuba..."
                className={`${FORM_FIELD_CLASS} h-auto py-2.5`}
              />
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
