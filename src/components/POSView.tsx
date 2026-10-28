import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle, UserCheck } from 'lucide-react';
import { ProductItem } from './StocksView';
import { InvoiceData } from './PrintableDocument';

interface POSViewProps {
  products: ProductItem[];
  currentRole: string;
  cashierName: string;
  onSaleCompleted: (newInvoice: InvoiceData) => void;
  onOpenDocument: (doc: InvoiceData) => void;
}

export const POSView: React.FC<POSViewProps> = ({
  products,
  currentRole,
  cashierName,
  onSaleCompleted,
  onOpenDocument,
}) => {
  const [cart, setCart] = useState<{ product: ProductItem; qty: number }[]>([]);
  const [clientName, setClientName] = useState('Client Comptant');
  const [clientPhone, setClientPhone] = useState('+223 ');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addToCart = (prod: ProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === prod.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product: prod, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: ProductItem; qty: number }[]
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== id));
  };

  const totalFCFA = cart.reduce(
    (sum, item) => sum + item.product.price * item.qty,
    0
  );

  const handleCheckout = async (type: 'recu' | 'facture') => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      const itemsPayload = cart.map((item) => ({
        code: item.product.code,
        name: item.product.name,
        qty: item.qty,
        price: item.product.price,
        total: item.product.price * item.qty,
      }));

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          clientName: clientName || 'Client Comptant',
          clientPhone: clientPhone || '',
          items: itemsPayload,
          paymentMethod,
          cashierName,
        }),
      });

      const data = await res.json();
      if (data.success && data.invoice) {
        onSaleCompleted(data.invoice);
        setCart([]);
        onOpenDocument(data.invoice);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Caisse &amp; Point de Vente (POS)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              Module Vendeur &bull; Mali
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Vente directe au comptoir avec émission immédiate de reçu de caisse ou facture avec logo officiel.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Product Catalog */}
        <div className="lg:col-span-2 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Produits Agroalimentaires Disponibles
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((prod) => (
              <div
                key={prod.id}
                onClick={() => addToCart(prod)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-500 dark:hover:border-teal-400 cursor-pointer transition shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                      {prod.code}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400">
                      {prod.category}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white leading-snug">
                    {prod.name}
                  </h3>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    {prod.price.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-teal-600">FCFA</span>
                  </span>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-600 dark:hover:text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Cart & Checkout */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col h-fit space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-teal-600" />
              Panier en cours ({cart.reduce((s, i) => s + i.qty, 0)})
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-rose-500 hover:text-rose-700 font-medium"
              >
                Vider
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Panier vide. Cliquez sur un produit à gauche pour l'ajouter.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="overflow-hidden min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {item.product.name}
                    </div>
                    <div className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                      {(item.product.price * item.qty).toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateQty(item.product.id, -1)}
                      className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.product.id, 1)}
                      className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 ml-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Client & Payment Info */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Nom du client</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Mode de règlement</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Espèces">Espèces (Comptant FCFA)</option>
                <option value="Orange Money">Orange Money Mali</option>
                <option value="Moov Money">Moov Money Mali</option>
                <option value="Virement BDM">Virement Bancaire (BDM / BOA)</option>
                <option value="Chèque">Chèque Bancaire</option>
              </select>
            </div>
          </div>

          {/* Total & Checkout buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs uppercase font-bold text-slate-500">Total à payer</span>
              <span className="text-xl font-black text-teal-700 dark:text-teal-400">
                {totalFCFA.toLocaleString('fr-FR')} FCFA
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={cart.length === 0 || isSubmitting}
                onClick={() => handleCheckout('recu')}
                className="py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reçu Caisse</span>
              </button>
              <button
                disabled={cart.length === 0 || isSubmitting}
                onClick={() => handleCheckout('facture')}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Facture A4</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
