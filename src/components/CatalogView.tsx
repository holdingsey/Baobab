import React, { useState } from 'react';
import { Package, Tag, Layers, CheckCircle2, Shield, Edit3, Save, X, Download } from 'lucide-react';
import { StockBadge } from './StockBadge';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = currentRole === 'Administrateur';

  const filtered = selectedGamme === 'Toutes'
    ? products
    : products.filter((p) => p.gamme === selectedGamme);

  const startEdit = (p: ProductItem) => {
    setEditingId(p.id);
    setEditPrice(p.price_box);
    setEditStock(p.stock_depot);
  };

  const handleSave = async (id: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          price_box: Number(editPrice),
          stock_depot: Number(editStock),
        }),
      });
      if (res.ok) {
        onRefreshProducts();
        setEditingId(null);
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
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Catalogue Produits &bull; Baobab Distribution
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              Prix par carton &bull; FCFA
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gamme de distribution agroalimentaire unique pour le marché malien. Gammes lues dynamiquement depuis la base de données.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportCatalogPdf}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exporter Catalogue &amp; Stocks (PDF)</span>
          </button>

          {isAdmin && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold">
              <Shield className="w-4 h-4" />
              <span>Mode Gestion Administrateur</span>
            </div>
          )}
        </div>
      </div>

      {/* Gamme Filter Tabs — Grille de boutons en rangées et colonnes sans débordement */}
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#008DA9]" /> Filtrer par gamme de produits :
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <button
            onClick={() => setSelectedGamme('Toutes')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
              selectedGamme === 'Toutes'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <span className="truncate">Toutes les gammes</span>
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
                    ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <span className="truncate">{g}</span>
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

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {filtered.map((prod) => {
          const isEditing = editingId === prod.id;
          return (
            <div
              key={prod.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-teal-500 transition"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold">
                    {prod.code}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                    {prod.gamme}
                  </span>
                </div>

                <h3 className="mt-3 text-lg font-black text-slate-900 dark:text-white leading-snug">
                  {prod.name}
                </h3>
                <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-teal-600" />
                  <span>Conditionnement : <strong>{prod.packaging}</strong></span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  ({prod.units_per_box} unités par carton)
                </div>
              </div>

              {/* Price & Stock Section */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Prix Carton (FCFA)</label>
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Stock Dépôt (cartons)</label>
                      <input
                        type="number"
                        value={editStock}
                        onChange={(e) => setEditStock(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleSave(prod.id)}
                        disabled={isSaving}
                        className="flex-1 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" /> Enregistrer
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs uppercase font-bold text-slate-400">Prix vente</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {prod.price_box.toLocaleString('fr-FR')}{' '}
                        <span className="text-xs font-bold text-teal-600">FCFA</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-50 dark:border-slate-800/60">
                      <span className="text-slate-500">Stock Dépôt :</span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">
                          {prod.stock_depot.toLocaleString('fr-FR')} ctn
                        </span>
                        <StockBadge stock={prod.stock_depot} threshold={prod.threshold_depot} />
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => startEdit(prod)}
                        className="w-full mt-2 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                        <span>Modifier tarif / stock</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
