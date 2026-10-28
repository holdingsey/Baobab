import React, { useState, useEffect } from 'react';
import { Printer, X, FileText, Store, User, Percent, Receipt, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';

export interface InvoiceItem {
  code: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface InvoiceData {
  id: string;
  number: string;
  type: 'facture' | 'recu' | 'mini_thermique';
  date: string;
  clientName: string;
  clientPhone?: string;
  items: InvoiceItem[];
  total: number;
  paymentMethod: string;
  cashierName: string;
  status: string;
  // Champs spécifiques : Facture au nom du vendeur avec le PDV acheteur & option TVA 18%
  vendorId?: string;
  vendorName?: string;
  vendorCode?: string;
  vendorTeam?: string;
  vendorPhone?: string;
  pdvName?: string;
  pdvCode?: string;
  pdvNeighborhood?: string;
  pdvManager?: string;
  pdvPhone?: string;
  saleId?: string;
  saleNumber?: string;
  saleTime?: string;
  thermalTicketNumber?: string;
  versementRef?: string;
  withTva?: boolean;
  subtotalHt?: number;
  tvaRate?: number;
  tvaAmount?: number;
  totalTtc?: number;
  readOnly?: boolean;
  isProofPreview?: boolean;
  rectificationReason?: string;
}

interface PrintableDocumentProps {
  document: InvoiceData;
  logoUrl?: string;
  currentRole?: string;
  onRequestRectification?: (doc: InvoiceData) => void;
  onClose: () => void;
}

export const PrintableDocument: React.FC<PrintableDocumentProps> = ({
  document,
  logoUrl = '/logo.png',
  currentRole,
  onRequestRectification,
  onClose,
}) => {
  const isFacture = document.type === 'facture';
  const isMiniThermique = document.type === 'mini_thermique';
  const isComptable = currentRole === 'Comptable';
  const isVendeur = currentRole === 'Vendeur';
  const canModifyTva = isFacture && isComptable && !document.readOnly;

  const [includeTva18, setIncludeTva18] = useState<boolean>(Boolean(document.withTva));

  useEffect(() => {
    setIncludeTva18(Boolean(document.withTva));
  }, [document.id, document.withTva]);

  const subtotalHt = Number(document.subtotalHt ?? document.total ?? 0);
  const tvaAmount = isFacture && includeTva18 ? Math.round(subtotalHt * 0.18) : 0;
  const finalTotal = isFacture ? subtotalHt + tvaAmount : Number(document.total || subtotalHt);

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const totalBoxes = (document.items || []).reduce((acc, it) => acc + Number(it.qty || 0), 0);
  const thermalNum =
    document.thermalTicketNumber ||
    (document.type === 'mini_thermique'
      ? document.number
      : String(document.saleNumber || document.number || '').replace(/^(VTE-|FAC-)/, 'TKT-THERM-'));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:static print:overflow-visible"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          isMiniThermique ? 'max-w-md' : 'max-w-3xl'
        } my-auto flex flex-col bg-white text-slate-900 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden print:max-h-none print:overflow-visible print:shadow-none print:w-full print:max-w-none print:rounded-none`}
      >
        {/* Modal Action Bar (Always visible at top, Hidden on Print) */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            {isMiniThermique ? (
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[#008DA9] shrink-0" />
            )}
            <span className="font-semibold text-xs sm:text-sm truncate">
              {isMiniThermique
                ? `Mini Facture Thermique • ${thermalNum}`
                : isFacture
                ? `Facture Vente PDV • ${document.number}`
                : `Reçu de Caisse / Versement • ${document.number}`}
            </span>
            {isFacture && isVendeur && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-300 border border-cyan-800">
                Lecture seule (Non modifiable)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Option d'ajout ou pas de la TVA 18% sur les factures : UNIQUEMENT pour le Comptable */}
            {canModifyTva && (
              <div className="inline-flex items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setIncludeTva18(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    !includeTva18
                      ? 'bg-[#008DA9] text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sans TVA (0%)
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeTva18(true)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                    includeTva18
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Percent className="w-3 h-3" />
                  <span>+ TVA 18%</span>
                </button>
              </div>
            )}

            {/* Bouton Demander une rectification pour le Vendeur s'il y a une erreur sur sa facture */}
            {isFacture && isVendeur && onRequestRectification && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestRectification(document);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Demander une rectification</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isMiniThermique ? 'Imprimer Ticket' : 'Imprimer / PDF'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Fermer"
              title="Fermer (Échap)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Fermer</span>
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        {isMiniThermique ? (
          /* =====================================================================
             FORMAT MINI FACTURE THERMIQUE (TICKET 80MM AUTO-GÉNÉRÉ PAR VENTE)
             Affichage entier avec fond blanc complet de haut en bas
             ===================================================================== */
          <div className="w-full p-4 sm:p-5 bg-slate-100 print:bg-white print:p-0">
            <div className="w-full max-w-[340px] mx-auto bg-white text-slate-950 p-4 sm:p-5 rounded-xl border border-slate-300 shadow-md print:shadow-none print:border-none font-mono text-[11px] leading-snug space-y-2.5">
              {document.isProofPreview && (
                <div className="p-2 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 font-sans text-[11px] font-bold text-center print:hidden">
                  PREUVE JOINTE À LA DEMANDE DE RECTIFICATION
                  {document.rectificationReason && (
                    <div className="font-normal text-[10px] mt-0.5">
                      Motif : « {document.rectificationReason} »
                    </div>
                  )}
                </div>
              )}

              {/* En-tête Ticket Thermique */}
              <div className="text-center border-b-2 border-dashed border-slate-400 pb-2.5 space-y-1">
                <div className="flex justify-center mb-1">
                  <BaobabLogo logoUrl={logoUrl} size={40} variant="invoice" />
                </div>
                <div className="text-sm font-black tracking-tight uppercase">
                  BAOBAB DISTRIBUTION
                </div>
                <div className="text-[10px] text-slate-600">
                  Zone Industrielle de Sotuba • Bamako, Mali
                </div>
                <div className="text-[10px] text-slate-600">
                  Tél: +223 20 22 45 88 • NIF: 084129532M
                </div>
                <div className="mt-1.5 inline-block px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                  MINI FACTURE THERMIQUE (80MM)
                </div>
              </div>

              {/* Métadonnées Vente & Ticket */}
              <div className="border-b border-dashed border-slate-300 pb-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">N° TICKET :</span>
                  <span className="font-bold">{thermalNum}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">N° VENTE :</span>
                  <span className="font-bold">{document.saleNumber || document.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">DATE &amp; HEURE :</span>
                  <span className="font-bold">
                    {document.date}
                    {document.saleTime && !document.date.includes(document.saleTime)
                      ? ` à ${document.saleTime}`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">VENDEUR :</span>
                  <span className="font-bold text-right">
                    {document.vendorName || document.cashierName}{' '}
                    {document.vendorCode ? `(${document.vendorCode})` : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">PDV CLIENT :</span>
                  <span className="font-bold text-right">
                    {document.pdvName || document.clientName}
                  </span>
                </div>
                {document.pdvNeighborhood && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">QUARTIER :</span>
                    <span className="font-semibold">{document.pdvNeighborhood}, Bamako</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">RÈGLEMENT :</span>
                  <span className="font-bold">{document.paymentMethod}</span>
                </div>
              </div>

              {/* Articles Livrés */}
              <div className="border-b-2 border-dashed border-slate-400 pb-2.5">
                <div className="grid grid-cols-12 font-bold text-[10px] border-b border-slate-300 pb-1 mb-1.5 uppercase">
                  <span className="col-span-6">ARTICLE</span>
                  <span className="col-span-2 text-center">QTÉ</span>
                  <span className="col-span-4 text-right">TOTAL</span>
                </div>
                <div className="space-y-1.5">
                  {document.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-start text-[11px]">
                      <div className="col-span-6 pr-1">
                        <div className="font-bold leading-tight">{it.name}</div>
                        <div className="text-[9px] text-slate-500">
                          {it.code} • {it.price.toLocaleString('fr-FR')} F/ctn
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-bold">{it.qty} ctn</div>
                      <div className="col-span-4 text-right font-bold">
                        {it.total.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Net Ticket Thermique */}
              <div className="border-b-2 border-dashed border-slate-400 pb-2.5 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>TOTAL CARTONS LIVRÉS :</span>
                  <span className="font-bold">{totalBoxes} carton(s)</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1">
                  <span>TOTAL NET PAYÉ :</span>
                  <span>{finalTotal.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>

              {/* Pied de Ticket & Mention Preuve */}
              <div className="text-center space-y-1.5 pt-1">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>GÉNÉRÉE AUTOMATIQUEMENT À LA VENTE</span>
                </div>
                <p className="text-[9px] text-slate-500 leading-tight">
                  Ce ticket thermique fait foi dans l&apos;historique des ventes du vendeur et peut être soumis comme preuve officielle en cas de demande de rectification de facture auprès de la Comptabilité.
                </p>
                <div className="pt-1 font-mono text-[10px] tracking-widest text-slate-400">
                  ||| |||| || ||||| ||| |||| |||
                </div>
                <div className="text-[9px] text-slate-400 font-bold">
                  {thermalNum}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* =====================================================================
             FORMAT FACTURE A4 OFFICIELLE (CRÉÉE PAR LE COMPTABLE) OU REÇU CAISSE
             ===================================================================== */
          <div className="w-full p-4 sm:p-6 md:p-8 print:p-4 print:overflow-visible bg-white text-slate-900">
            {/* Banner d'information pour le Vendeur (Lecture seule + Impression + Option de demande de rectification) */}
            {isFacture && isVendeur && (
              <div className="mb-4 p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
                <div className="flex items-start sm:items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#008DA9] shrink-0 mt-0.5 sm:mt-0" />
                  <span>
                    <strong>Facture créée par le Comptable :</strong> Vous pouvez consulter et <strong>imprimer</strong> cette facture librement. Vous ne pouvez pas la modifier. S&apos;il y a une erreur, cliquez sur <strong>« Demander une rectification »</strong> pour joindre votre mini facture thermique comme preuve.
                  </span>
                </div>
              </div>
            )}

            {/* Header with Baobab Logo */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 sm:pb-5 border-b-2 border-[#008DA9] gap-3 sm:gap-4">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 flex items-center justify-center bg-white p-1 rounded-lg border border-slate-100">
                  <BaobabLogo logoUrl={logoUrl} size={52} variant="invoice" />
                </div>
                <div>
                  <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-slate-900">
                    BAOBAB DISTRIBUTION
                  </h1>
                  <p className="text-[11px] sm:text-xs text-[#008DA9] font-semibold uppercase tracking-wider">
                    Négoce &amp; Distribution Agroalimentaire &bull; Mali
                  </p>
                  <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 leading-snug">
                    Zone Industrielle de Sotuba, Bamako - Mali<br />
                    Tél : +223 20 22 45 88 / +223 76 12 34 56 &bull; Email : contact@baobab-distribution.ml<br />
                    NIF : <strong>084129532M</strong> &bull; RCCM : <strong>MA.BKO.2018.B.4129</strong>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-auto text-left sm:text-right sm:self-start bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200 sm:min-w-[215px]">
                <div className="flex sm:justify-end items-center gap-1.5 mb-1 flex-wrap">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800">
                    {isFacture ? 'FACTURE PAR VENTE PDV' : 'REÇU DE CAISSE'}
                  </span>
                  {isFacture && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        includeTva18
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {includeTva18 ? 'TVA 18% Incluse' : 'Sans TVA (0%)'}
                    </span>
                  )}
                </div>
                <div className="text-sm sm:text-base font-black text-slate-900 break-all sm:break-normal">
                  {document.number}
                </div>
                {document.saleNumber && document.saleNumber !== document.number && (
                  <div className="text-[11px] font-mono font-bold text-[#008DA9]">
                    Réf. Vente : {document.saleNumber}
                  </div>
                )}
                <div className="text-[11px] sm:text-xs text-slate-500">
                  Date : {document.date}
                  {document.saleTime && !document.date.includes(document.saleTime) ? ` à ${document.saleTime}` : ''}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500">Règlement : {document.paymentMethod}</div>
                {document.versementRef && (
                  <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                    Versement : {document.versementRef}
                  </div>
                )}
              </div>
            </div>

            {/* Facture au nom du Vendeur avec le PDV Acheteur */}
            {isFacture ? (
              <div className="my-3.5 sm:my-4 space-y-2.5">
                <div className="px-3 py-1.5 rounded-lg bg-[#008DA9]/10 border border-[#008DA9]/25 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Facture officielle établie par le Comptable :</strong> Chaque vente réalisée par le vendeur auprès de son PDV acheteur constitue une facture à part.
                  </span>
                  <span className="font-bold text-[#008DA9]">
                    Statut : {document.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
                  {/* Colonne 1 : Au nom du Vendeur */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-[#008DA9] font-extrabold uppercase tracking-wider text-[10px]">
                      <User className="w-3.5 h-3.5" />
                      <span>Facture établie au nom du Vendeur</span>
                    </div>
                    <div className="font-black text-slate-900 text-xs sm:text-sm">
                      {document.vendorName || document.cashierName}
                    </div>
                    {document.vendorCode && (
                      <div className="font-mono text-[11px] font-bold text-[#008DA9]">
                        Code Vendeur : {document.vendorCode}
                      </div>
                    )}
                    {document.vendorTeam && (
                      <div className="text-slate-600 text-[11px]">Équipe : {document.vendorTeam}</div>
                    )}
                    {document.vendorPhone && (
                      <div className="text-slate-600 text-[11px]">Tél Vendeur : {document.vendorPhone}</div>
                    )}
                  </div>

                  {/* Colonne 2 : Avec le PDV Acheteur */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-extrabold uppercase tracking-wider text-[10px]">
                      <Store className="w-3.5 h-3.5" />
                      <span>PDV Acheteur (Point de Vente Client)</span>
                    </div>
                    <div className="font-black text-slate-900 text-xs sm:text-sm">
                      {document.pdvName || document.clientName}
                    </div>
                    {(document.pdvCode || document.pdvNeighborhood) && (
                      <div className="text-[11px] font-semibold text-slate-700">
                        {document.pdvCode ? `${document.pdvCode} • ` : ''}
                        {document.pdvNeighborhood ? `${document.pdvNeighborhood}, Bamako` : 'Bamako, Mali'}
                      </div>
                    )}
                    {document.pdvManager && (
                      <div className="text-slate-600 text-[11px]">Gérant PDV : {document.pdvManager}</div>
                    )}
                    {(document.pdvPhone || document.clientPhone) && (
                      <div className="text-slate-600 text-[11px]">
                        Tél PDV : {document.pdvPhone || document.clientPhone}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-3.5 sm:py-4 border-b border-slate-100 text-xs">
                <div>
                  <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    Vendeur déposant
                  </div>
                  <div className="font-bold text-slate-800 text-xs sm:text-sm mt-0.5">{document.clientName}</div>
                  {document.clientPhone && (
                    <div className="text-slate-600 mt-0.5">Tél : {document.clientPhone}</div>
                  )}
                  <div className="text-slate-500 mt-0.5">Bamako, République du Mali</div>
                </div>

                <div className="sm:text-right">
                  <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    Émis par l&apos;agent
                  </div>
                  <div className="font-semibold text-slate-800 mt-0.5">{document.cashierName}</div>
                  <div className="text-slate-500 mt-0.5">
                    Statut : <span className="text-emerald-700 font-bold">{document.status}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Line Items Table */}
            <div className="mt-3.5 sm:mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[460px] sm:min-w-0">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 sm:px-3">Réf.</th>
                    <th className="py-2 px-2.5 sm:px-3">Désignation Produit</th>
                    <th className="py-2 px-2.5 sm:px-3 text-right">Qté (Cartons)</th>
                    <th className="py-2 px-2.5 sm:px-3 text-right">Prix Unit. HT (FCFA)</th>
                    <th className="py-2 px-2.5 sm:px-3 text-right">Montant HT (FCFA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {document.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2.5 sm:px-3 font-mono text-[11px] text-slate-500">{item.code}</td>
                      <td className="py-2 px-2.5 sm:px-3 font-medium text-slate-800">{item.name}</td>
                      <td className="py-2 px-2.5 sm:px-3 text-right font-semibold">{item.qty}</td>
                      <td className="py-2 px-2.5 sm:px-3 text-right">{item.price.toLocaleString('fr-FR')}</td>
                      <td className="py-2 px-2.5 sm:px-3 text-right font-bold text-slate-900">
                        {item.total.toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="mt-4 sm:mt-5 pt-3.5 sm:pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
              <div className="text-[11px] sm:text-xs text-slate-500 max-w-sm space-y-1">
                <p className="font-semibold text-slate-700">Conditions de règlement &amp; Facturation :</p>
                <p>
                  Paiement en Francs CFA (FCFA / XOF).{' '}
                  {isFacture
                    ? includeTva18
                      ? 'Facture soumise à la TVA au taux légal de 18%.'
                      : 'Facture émise Hors Taxes / Sans TVA (0%).'
                    : 'Reçu de versement de caisse validé par la Comptabilité.'}
                </p>
              </div>

              <div className="w-full sm:w-72 space-y-1.5 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total HT :</span>
                  <span className="font-semibold">{subtotalHt.toLocaleString('fr-FR')} FCFA</span>
                </div>
                {isFacture && includeTva18 ? (
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>TVA (18%) :</span>
                    <span>+ {tvaAmount.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-slate-500">
                    <span>TVA (Sans TVA • 0%) :</span>
                    <span>0 FCFA</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1.5 flex justify-between font-extrabold text-sm text-[#008DA9]">
                  <span>{isFacture && includeTva18 ? 'TOTAL TTC (TVA 18%) :' : 'TOTAL NET :'}</span>
                  <span>{finalTotal.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
            </div>

            {/* Signatures & Stamp Zone */}
            <div className="mt-5 sm:mt-6 pt-4 border-t border-dashed border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-xs text-center">
              <div>
                <p className="text-slate-500 mb-6 sm:mb-7">
                  {isFacture ? 'Le PDV Acheteur (Client)' : 'Le Vendeur Déposant'}
                </p>
                <div className="border-b border-slate-300 w-32 mx-auto"></div>
              </div>
              <div>
                <p className="text-slate-500 mb-6 sm:mb-7">Le Vendeur ({document.vendorCode || 'Baobab'})</p>
                <div className="border-b border-slate-300 w-32 mx-auto"></div>
              </div>
              <div>
                <p className="text-slate-500 mb-6 sm:mb-7">Service Comptabilité &amp; Caisse</p>
                <div className="border-b border-slate-300 w-32 mx-auto"></div>
                <p className="text-[10px] text-[#008DA9] font-semibold mt-1">Cachet et signature certifiée</p>
              </div>
            </div>

            {/* Document Footer */}
            <div className="mt-4 sm:mt-5 text-center text-[10px] text-slate-400">
              Baobab Distribution Mali SARL &bull; Système certifié de gestion commerciale
            </div>
          </div>
        )}

        {/* Bottom Action Bar (Hidden on Print) */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-slate-50 border-t border-slate-200 print:hidden">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {isMiniThermique
              ? 'Mini facture thermique générée automatiquement à chaque vente et utilisable comme preuve de rectification'
              : isVendeur
              ? 'Consultation en lecture seule • Vous pouvez imprimer votre facture ou demander une rectification avec preuve thermique'
              : 'Seul le Comptable est habilité à créer ou rectifier une facture'}
          </span>
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Fermer
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white text-xs font-semibold transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              {isMiniThermique ? 'Imprimer Mini Facture Thermique' : 'Imprimer / PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


