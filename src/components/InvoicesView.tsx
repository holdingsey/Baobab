import React, { useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { InvoiceData } from './PrintableDocument';
import { CardList } from './CardList';

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
      (inv.clientName || inv.client?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
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

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterType === 'all'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Tous ({visibleInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('facture')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterType === 'facture'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Factures A4 ({visibleInvoices.filter((i) => i.type === 'facture').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('recu')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterType === 'recu'
                ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Reçus de Caisse ({visibleInvoices.filter((i) => i.type === 'recu').length})
          </button>
        </div>
      </div>

      {/* Liste de cartes */}
      <CardList<InvoiceData>
        data={filtered}
        rowKey={(inv) => inv.id}
        pageSize={20}
        emptyMessage="Aucun document comptable trouvé."
        title={(inv) => (
          <div className="flex items-start justify-between gap-3 w-full min-w-0">
            <span className="font-mono font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere] min-w-0">
              {inv.number}
            </span>
            <span className="font-sans text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
              {inv.date}
            </span>
          </div>
        )}
        badges={(inv) => {
          const isTicket =
            inv.type === 'mini_thermique' ||
            inv.type === 'ticket' ||
            inv.type === 'ticket_thermique' ||
            String(inv.number || '').toUpperCase().startsWith('TKT-');
          const isFacture = inv.type === 'facture' && !isTicket;
          return (
            <>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                  isTicket
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                    : isFacture
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {isTicket ? 'Ticket 80 mm' : isFacture ? 'Facture A4' : 'Reçu de Caisse'}
              </span>
              {inv.status && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {inv.status}
                </span>
              )}
            </>
          );
        }}
        fields={[
          {
            key: 'client',
            label: 'Client',
            value: (inv) => inv.clientName || inv.client?.name || '—',
          },
          {
            key: 'cashier',
            label: 'Émetteur / Agent',
            value: (inv) => inv.cashierName || inv.vendorName || '—',
          },
          {
            key: 'paymentMethod',
            label: 'Mode de règlement',
            value: (inv) => inv.paymentMethod || 'Espèces',
          },
          {
            key: 'total',
            label: 'Montant total',
            isAmount: true,
            value: (inv) => (
              <span className="font-mono font-black text-sm text-slate-900 dark:text-white whitespace-nowrap">
                {Number(inv.total || 0).toLocaleString('fr-FR')} FCFA
              </span>
            ),
          },
        ]}
        renderActions={(inv) => {
          const isTicket =
            inv.type === 'mini_thermique' ||
            inv.type === 'ticket' ||
            inv.type === 'ticket_thermique' ||
            String(inv.number || '').toUpperCase().startsWith('TKT-');
          const isFacture = inv.type === 'facture' && !isTicket;
          return (
            <button
              type="button"
              onClick={() =>
                onOpenDocument({
                  ...inv,
                  type: isTicket ? 'mini_thermique' : isFacture ? 'facture' : 'recu_caisse',
                  docTypeTitle: isTicket
                    ? 'TICKET DE VENTE'
                    : isFacture
                    ? 'FACTURE DE VENTE PDV'
                    : 'REÇU DE CAISSE',
                })
              }
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>
                {isTicket ? 'Ticket' : isFacture ? 'Facture' : 'Imprimer le reçu'}
              </span>
            </button>
          );
        }}
      />
    </div>
  );
};

