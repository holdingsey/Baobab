import React, { useState } from 'react';
import { Package, Layers, Shield, Edit3, Download, Plus } from 'lucide-react';
import { StockBadge } from './StockBadge';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { FORM_FIELD_CLASS, FORM_LABEL_CLASS, FORM_ROW_CLASS } from './FormControls';
import { CardList } from './CardList';
import { ExportViewButton } from './ExtractionsView';

interface ProductItem {
  id: string;
  code: string;
  name: string;
  gamme: string;
  packaging: string;
  units_per_box: number;
  price_box: number;
  stock_depot: number;
  threshold_depot: number;
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
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state for Nouveau produit / Modifier produit
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formGamme, setFormGamme] = useState('');
  const [formPackaging, setFormPackaging] = useState('Carton de 12 unités');
  const [formUnitsPerBox, setFormUnitsPerBox] = useState<number>(12);
  const [formPrice, setFormPrice] = useState<number>(10000);
  const [formStock, setFormStock] = useState<number>(100);
  const [formThreshold, setFormThreshold] = useState<number>(50);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = currentRole === 'Administrateur';

  const filtered = selectedGamme === 'Toutes'
    ? products
    : products.filter((p) => p.gamme === selectedGamme);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormCode(`BAO-PRD-${String(products.length + 1).padStart(3, '0')}`);
    setFormName('');
    setFormGamme(gammes[0] || 'Jus & Boissons Naturelles');
    setFormPackaging('Carton de 12 bouteilles');
    setFormUnitsPerBox(12);
    setFormPrice(12000);
    setFormStock(100);
    setFormThreshold(50);
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
    setFormStock(p.stock_depot);
    setFormThreshold(p.threshold_depot);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingProduct) {
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
          },
          body: JSON.stringify({
            name: formName.trim(),
            gamme: formGamme.trim(),
            packaging: formPackaging.trim(),
            units_per_box: Number(formUnitsPerBox),
            price_box: Number(formPrice),
            stock_depot: Number(formStock),
            threshold_depot: Number(formThreshold),
          }),
        });
        if (res.ok) {
          onRefreshProducts();
          setEditingProduct(null);
        }
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
          },
          body: JSON.stringify({
            code: formCode.trim(),
            name: formName.trim(),
            gamme: formGamme.trim(),
            packaging: formPackaging.trim(),
            units_per_box: Number(formUnitsPerBox),
            price_box: Number(formPrice),
            stock_depot: Number(formStock),
            threshold_depot: Number(formThreshold),
          }),
        });
        if (res.ok) {
          onRefreshProducts();
          setShowCreateModal(false);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCatalogPdf = () => {
    const totalStockBoxes = filtered.reduce((sum, p) => sum + Number(p.stock_depot || 0), 0);
    const totalValue = filtered.reduce((sum, p) => sum + Number(p.stock_depot || 0) * Number(p.price_box || 0), 0);

    exportTableToPdf({
      title: `Catalogue Produits & Stocks - Baobab Distribution (${selectedGamme})`,
      subtitle: 'Grille tarifaire officielle par carton et stock disponible au depot central',
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
        'Conditionnement',
        'Prix Carton (FCFA)',
        'Stock Depot',
        'Seuil Alerte',
        'Valeur Stock (FCFA)',
      ],
      rows: filtered.map((p) => [
        p.code,
        p.name,
        p.gamme,
        `${p.packaging} (${p.units_per_box} u/ctn)`,
        formatFcfaPdf(p.price_box),
        `${p.stock_depot} ctn`,
        `${p.threshold_depot} ctn`,
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
              Prix par carton &bull; FCFA
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Grille tarifaire par carton et stocks disponibles.
            </p>
            <InfoTooltip text="Gamme de distribution agroalimentaire unique pour le marché malien. Gammes lues dynamiquement depuis la base de données." />
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

      {/* Gamme Filter Tabs — Grille de boutons en rangées et colonnes sans débordement */}
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" /> Filtrer par gamme de produits :
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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
              {products.length}
            </span>
          </button>
          {gammes.map((g) => {
            const count = products.filter((p) => p.gamme === g).length;
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
                >
                  {count}
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
        searchPlaceholder="Rechercher par référence, nom du produit, gamme, conditionnement..."
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
            label: 'Prix carton (décroissant)',
            compare: (a, b) => Number(b.price_box || 0) - Number(a.price_box || 0),
          },
          {
            key: 'stock_desc',
            label: 'Stock dépôt (décroissant)',
            compare: (a, b) => Number(b.stock_depot || 0) - Number(a.stock_depot || 0),
          },
        ]}
        defaultSortKey="code_asc"
        emptyMessage="Aucun produit trouvé dans le catalogue."
        title={(prod) => (
          <div className="flex flex-wrap items-baseline justify-between gap-2 w-full min-w-0">
            <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white [overflow-wrap:anywhere]">
              {prod.name}
            </span>
            <span className="font-mono font-extrabold text-xs text-teal-600 dark:text-teal-400 [overflow-wrap:anywhere]">
              {prod.code}
            </span>
          </div>
        )}
        badges={(prod) => (
          <>
            <StockBadge stock={prod.stock_depot} threshold={prod.threshold_depot} />
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {prod.gamme}
            </span>
          </>
        )}
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
            key: 'stock_depot',
            label: 'Stock dépôt central',
            isAmount: true,
            render: (prod) => (
              <span className="font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                {prod.stock_depot.toLocaleString('fr-FR')} cartons (seuil : {prod.threshold_depot} ctn)
              </span>
            ),
          },
          {
            key: 'price_box',
            label: 'Prix vente / carton',
            isAmount: true,
            render: (prod) => (
              <span className="font-black text-base text-[#008DA9] dark:text-teal-400 whitespace-nowrap">
                {prod.price_box.toLocaleString('fr-FR')} FCFA
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
        renderActions={
          isAdmin
            ? (prod) => (
                <button
                  type="button"
                  onClick={() => startEdit(prod)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2 rounded-xl border border-[#64748B] dark:border-[#94A3B8] bg-[#F1F5F9] dark:bg-[#1E293B] hover:bg-[#E2E8F0] dark:hover:bg-[#334155] text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] transition cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
                  <span>Modifier le produit</span>
                </button>
              )
            : undefined
        }
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
          subtitle="Grille tarifaire par carton et stock au dépôt central Sotuba"
          icon={<Package className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProduct(null);
          }}
          onSubmit={handleSaveModal}
          submitLabel={
            isSaving
              ? 'Enregistrement...'
              : editingProduct
              ? 'Enregistrer les modifications'
              : 'Créer le produit'
          }
          submitDisabled={isSaving || !formName.trim()}
          isDirty={Boolean(formName.trim())}
        >
          <div className="flex flex-col gap-5">
            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>Code référence</label>
                <input
                  type="text"
                  required
                  value={formCode}
                  disabled={Boolean(editingProduct)}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Ex: BAO-PRD-012"
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
                  placeholder="Ex: Jus & Boissons Naturelles"
                  className={FORM_FIELD_CLASS}
                />
                <datalist id="catalog-gammes-list">
                  {gammes.map((g) => (
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
                placeholder="Ex: Nectar de Baobab Bio 1L"
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
                  placeholder="Ex: Carton de 12 bouteilles"
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
                <label className={FORM_LABEL_CLASS}>Prix par carton (FCFA)</label>
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
        </FormModal>
      )}
    </div>
  );
};
