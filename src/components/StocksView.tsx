import React, { useState } from 'react';
import { Package, Search, AlertTriangle, ArrowUpDown, Filter, ShieldCheck, Check, Download } from 'lucide-react';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';

export interface ProductItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  threshold: number;
}

interface StocksViewProps {
  products: ProductItem[];
  currentRole: string;
}

export const StocksView: React.FC<StocksViewProps> = ({ products, currentRole }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');

  const categories = ['Tous', 'Céréales', 'Huiles', 'Sucres', 'Pâtes & Farines', 'Produits Locaux'];

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Tous' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleExportStocksPdf = () => {
    const totalUnits = filtered.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const totalValue = filtered.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.price || 0), 0);

    exportTableToPdf({
      title: 'Inventaire des Stocks & Entrepot Sotuba',
      subtitle: `Categorie : ${selectedCategory}`,
      filename: `inventaire_stocks_${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: `Role : ${currentRole}`,
      summaryCards: [
        { label: 'Articles affiches', value: `${filtered.length}` },
        { label: 'Quantite totale', value: `${totalUnits}` },
        { label: 'Valeur totale', value: formatFcfaPdf(totalValue) },
      ],
      columns: ['Code Ref.', 'Designation', 'Categorie', 'Prix Unitaire', 'Quantite Stock', 'Unite', 'Statut Stock'],
      rows: filtered.map((prod) => [
        prod.code,
        prod.name,
        prod.category,
        formatFcfaPdf(prod.price),
        prod.stock,
        prod.unit,
        prod.stock <= prod.threshold ? `Seuil d'alerte (${prod.threshold})` : 'Stock Conforme',
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
              Gestion des Stocks &amp; Entrepôt
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Module Magasinier
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Inventaire des denrées agroalimentaires stockées à l'entrepôt Sotuba (Bamako, Mali).
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportStocksPdf}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Exporter en PDF</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par référence, désignation (riz, mil, huile, sucre)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                <th className="py-3 px-4">Code Réf.</th>
                <th className="py-3 px-4">Désignation</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4 text-right">Prix Unitaire</th>
                <th className="py-3 px-4 text-center">Quantité en Stock</th>
                <th className="py-3 px-4 text-center">Unité</th>
                <th className="py-3 px-4 text-center">Statut Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((prod) => {
                const isLowStock = prod.stock <= prod.threshold;
                return (
                  <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {prod.code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {prod.name}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                        {prod.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900 dark:text-white">
                      {prod.price.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-sm">
                      <span className={isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}>
                        {prod.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center uppercase text-slate-400 text-[10px]">
                      {prod.unit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3" />
                          Seuil d'alerte ({prod.threshold})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <Check className="w-3 h-3" />
                          Stock Conforme
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
