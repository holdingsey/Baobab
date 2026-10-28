import React, { useState } from 'react';
import { FileText, Printer, Search, Download, Filter, CheckCircle2, Eye } from 'lucide-react';
import { InvoiceData } from './PrintableDocument';

interface InvoicesViewProps {
  invoices: InvoiceData[];
  onOpenDocument: (doc: InvoiceData) => void;
  currentRole: string;
  currentUser?: { id: string; code: string; name: string };
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices,
  onOpenDocument,
  currentRole,
  currentUser,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'facture' | 'recu'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const visibleInvoices = React.useMemo(() => {
    if (currentRole === 'Vendeur' && currentUser) {
      return invoices.filter(
        (inv) =>
          inv.cashierName?.includes(currentUser.code) ||
          inv.cashierName?.includes(currentUser.name) ||
          inv.clientName?.includes(currentUser.code) ||
          inv.clientName?.includes(currentUser.name)
      );
    }
    return invoices;
  }, [invoices, currentRole, currentUser]);

  const filtered = visibleInvoices.filter((inv) => {
    const matchesType = filterType === 'all' || inv.type === filterType;
    const matchesSearch =
      inv.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Factures Commerciales &amp; Reçus de Caisse
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              Module Comptabilité
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Documents comptables imprimables avec le logo officiel Baobab Distribution et mentions légales de Bamako.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro, nom du client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Tous ({invoices.length})
          </button>
          <button
            onClick={() => setFilterType('facture')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
              filterType === 'facture'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Factures A4 ({invoices.filter((i) => i.type === 'facture').length})
          </button>
          <button
            onClick={() => setFilterType('recu')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
              filterType === 'recu'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Reçus de Caisse ({invoices.filter((i) => i.type === 'recu').length})
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                <th className="py-3 px-4">Numéro</th>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Émetteur / Agent</th>
                <th className="py-3 px-4">Mode de Règlement</th>
                <th className="py-3 px-4 text-right">Montant Total</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    {inv.number}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inv.type === 'facture'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {inv.type === 'facture' ? 'Facture A4' : 'Reçu Ticket'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">{inv.date}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    {inv.clientName}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">{inv.cashierName}</td>
                  <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-medium">
                    {inv.paymentMethod}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                    {inv.total.toLocaleString('fr-FR')} FCFA
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => onOpenDocument(inv)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900 font-semibold text-xs transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
