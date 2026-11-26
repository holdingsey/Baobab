import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Building2,
  PlusCircle,
  Search,
  FileDown,
  Printer,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  CreditCard,
  Phone,
  MapPin,
  UserCheck,
  Percent,
  Edit3,
  AlertTriangle,
  ShoppingBag,
  X,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { InvoiceData } from './PrintableDocument';
import { exportTableToPdf } from '../utils/pdfExport';
import { AdaptiveAmount } from '../utils/formatAmount';
import { FormModal } from './FormModal';
import { InfoTooltip } from './InfoTooltip';
import { CardList } from './CardList';
import { ExportViewButton } from './ExtractionsView';
import {
  PhoneField,
  PaymentMethodSelector,
  ConfirmDestructiveButton,
  FORM_FIELD_CLASS,
  FORM_SELECT_CLASS,
  FORM_LABEL_CLASS,
  FORM_ROW_CLASS,
} from './FormControls';

interface GrossisteViewProps {
  currentUser: UserSession;
  products: any[];
  wholesaleClients: any[];
  wholesaleOrders: any[];
  initialTab?: string;
  onOpenDocument: (doc: InvoiceData) => void;
  onRefreshData: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const GrossisteView: React.FC<GrossisteViewProps> = ({
  currentUser,
  products,
  wholesaleClients,
  wholesaleOrders,
  initialTab = 'commandes-gros',
  onOpenDocument,
  onRefreshData,
}) => {
  const [subTab, setSubTab] = useState<'commandes-gros' | 'nouvelle-commande-gros' | 'clients-gros'>(() => {
    if (initialTab === 'clients-gros') return 'clients-gros';
    if (initialTab === 'nouvelle-commande-gros') return 'nouvelle-commande-gros';
    return 'commandes-gros';
  });

  useEffect(() => {
    if (initialTab === 'clients-gros') setSubTab('clients-gros');
    else if (initialTab === 'nouvelle-commande-gros') setSubTab('nouvelle-commande-gros');
    else if (initialTab === 'commandes-gros') setSubTab('commandes-gros');
  }, [initialTab]);

  // Filters for Orders
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderClientFilter, setOrderClientFilter] = useState<string>('ALL');

  // Filters for Clients
  const [clientSearch, setClientSearch] = useState('');
  const [clientCategoryFilter, setClientCategoryFilter] = useState<string>('ALL');

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Wholesale Order Form state
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [discountPercent, setDiscountPercent] = useState<number>(3);
  const [paymentMode, setPaymentMode] = useState<string>('Virement Bancaire');
  const [paymentStatus, setPaymentStatus] = useState<'paye' | 'en_attente_paiement'>('paye');
  const [deliveryStatus, setDeliveryStatus] = useState<'livree' | 'en_preparation'>('livree');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Client Modal state (Create / Edit)
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [clientPhone, setClientPhone] = useState('+223 ');
  const [clientEmail, setClientEmail] = useState('');
  const [neighborhood, setNeighborhood] = useState('Grand Marché Dabanani');
  const [city, setCity] = useState('Bamako');
  const [address, setAddress] = useState('');
  const [nif, setNif] = useState('');
  const [rccm, setRccm] = useState('');
  const [category, setCategory] = useState('Demi-grossiste');
  const [defaultDiscount, setDefaultDiscount] = useState<number>(3);
  const [clientNotes, setClientNotes] = useState('');
  const [submittingClient, setSubmittingClient] = useState(false);

  // Cancel Order Modal state
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Initialize selected client when wholesaleClients load
  useEffect(() => {
    if (!selectedClientId && wholesaleClients.length > 0) {
      const first = wholesaleClients[0];
      setSelectedClientId(first.id);
      setDiscountPercent(Number(first.default_discount_percent ?? 3));
    }
  }, [wholesaleClients, selectedClientId]);

  const handleSelectClientForOrder = (clientId: string) => {
    setSelectedClientId(clientId);
    const found = wholesaleClients.find((c) => c.id === clientId);
    if (found && found.default_discount_percent !== undefined) {
      setDiscountPercent(Number(found.default_discount_percent) || 0);
    }
  };

  // KPI calculations
  const activeOrders = useMemo(
    () => wholesaleOrders.filter((o) => o.delivery_status !== 'annulee'),
    [wholesaleOrders]
  );
  const totalWholesaleCA = useMemo(
    () => activeOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
    [activeOrders]
  );
  const totalWholesaleBoxes = useMemo(
    () => activeOrders.reduce((sum, o) => sum + (Number(o.total_boxes) || 0), 0),
    [activeOrders]
  );
  const pendingDeliveryCount = useMemo(
    () => activeOrders.filter((o) => o.delivery_status === 'en_preparation').length,
    [activeOrders]
  );
  const pendingPaymentOrders = useMemo(
    () => activeOrders.filter((o) => o.payment_status === 'en_attente_paiement'),
    [activeOrders]
  );
  const pendingPaymentAmount = useMemo(
    () => pendingPaymentOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
    [pendingPaymentOrders]
  );

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return wholesaleOrders.filter((o) => {
      if (orderClientFilter !== 'ALL' && o.client_id !== orderClientFilter) return false;
      if (orderStatusFilter === 'en_preparation' && o.delivery_status !== 'en_preparation') return false;
      if (orderStatusFilter === 'livree' && o.delivery_status !== 'livree') return false;
      if (orderStatusFilter === 'en_attente_paiement' && o.payment_status !== 'en_attente_paiement') return false;
      if (orderStatusFilter === 'paye' && o.payment_status !== 'paye') return false;
      if (orderStatusFilter === 'annulee' && o.delivery_status !== 'annulee') return false;

      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const matchRef = String(o.reference || '').toLowerCase().includes(q);
        const matchClient = String(o.client_name || '').toLowerCase().includes(q);
        const matchCode = String(o.client_code || '').toLowerCase().includes(q);
        const matchArea = String(o.client_neighborhood || '').toLowerCase().includes(q);
        return matchRef || matchClient || matchCode || matchArea;
      }
      return true;
    });
  }, [wholesaleOrders, orderClientFilter, orderStatusFilter, orderSearch]);

  // Filtered Clients
  const filteredClients = useMemo(() => {
    return wholesaleClients.filter((c) => {
      if (clientCategoryFilter !== 'ALL' && c.category !== clientCategoryFilter) return false;
      if (clientSearch.trim()) {
        const q = clientSearch.toLowerCase();
        return (
          String(c.company_name || '').toLowerCase().includes(q) ||
          String(c.code || '').toLowerCase().includes(q) ||
          String(c.manager_name || '').toLowerCase().includes(q) ||
          String(c.neighborhood || '').toLowerCase().includes(q) ||
          String(c.city || '').toLowerCase().includes(q) ||
          String(c.phone || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [wholesaleClients, clientCategoryFilter, clientSearch]);

  // Order creation basket computation (utilise le prix grossiste du produit s'il est défini, sinon le prix détaillant)
  const orderLines = useMemo(() => {
    return products
      .filter((p) => Number(p.is_active ?? 1) === 1)
      .map((p) => {
        const qty = Math.max(0, Number(quantities[p.id] || 0));
        const unitPrice = Number(p.wholesale_price_box ?? p.price_box ?? 0);
        return {
          productId: p.id,
          code: p.code,
          name: p.name,
          packaging: p.packaging,
          stockDepot: Number(p.stock_depot || 0),
          qtyBoxes: qty,
          unitPrice,
          total: qty * unitPrice,
        };
      })
      .filter((l) => l.qtyBoxes > 0);
  }, [products, quantities]);

  const basketTotalBoxes = orderLines.reduce((acc, l) => acc + l.qtyBoxes, 0);
  const basketSubtotalHt = orderLines.reduce((acc, l) => acc + l.total, 0);
  const basketDiscountAmount = Math.round((basketSubtotalHt * (Number(discountPercent) || 0)) / 100);
  const basketTotalNet = Math.max(0, basketSubtotalHt - basketDiscountAmount);

  const handleOpenPrintableOrder = (order: any) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotalHt = Number(order.subtotal_ht || order.total_amount || 0);
    const totalNet = Number(order.total_amount || 0);
    const discountPct = Number(order.discount_percent || 0);
    const discountAmt = Number(order.discount_amount || Math.max(0, subtotalHt - totalNet));
    const isPaid = order.payment_status === 'paye';
    const docData: InvoiceData = {
      id: String(order.id || order.reference),
      number: order.reference,
      date: order.date,
      type: 'invoice',
      docTypeTitle: isPaid ? 'FACTURE GROSSISTE' : 'BON DE COMMANDE GROSSISTE',
      emitterTitle: 'ÉMETTEUR / SERVICE GROSSISTE BAOBAB',
      recipientTitle: 'DESTINATAIRE / CLIENT GROSSISTE',
      client: {
        name: `${order.client_name} (${order.client_code})`,
        address: `${order.client_neighborhood || 'Dakar'}${order.client_city ? `, ${order.client_city}` : ''}`,
        phone: order.client_phone || '+221 77 000 00 00',
        contact: order.client_manager || 'Direction Achats',
        ninea: order.client_ninea || undefined,
      },
      vendor: {
        name: order.created_by || currentUser.name,
        code: order.created_by_code || currentUser.code || 'BAO-GRS',
        phone: '+221 33 800 00 00',
      },
      items: items.map((it: any, idx: number) => ({
        id: `${order.id}-${idx}`,
        code: it.code || `ART-${idx + 1}`,
        description: it.name || it.description || 'Article Grossiste',
        quantity: Number(it.qtyBoxes ?? it.quantity ?? it.qty ?? 0),
        unitPrice: Number(it.unitPrice ?? it.price ?? 0),
        total: Number(it.total ?? 0),
      })),
      subtotal: subtotalHt,
      discountPercent: discountPct > 0 ? discountPct : undefined,
      discountAmount: discountAmt > 0 ? discountAmt : undefined,
      taxRate: 0,
      taxAmount: 0,
      total: totalNet,
      amountPaid: isPaid ? totalNet : 0,
      paymentMethod: order.payment_mode || 'Virement / Chèque',
      status: isPaid ? 'paid' : 'pending',
      isAcquittee: isPaid,
      notes: order.notes || undefined,
      sigLeftLabel: 'Gestionnaire Grossiste',
      sigCenterLabel: 'Magasinier / Livraison',
      sigRightLabel: 'Client Grossiste (Cachet)',
    };
    onOpenDocument(docData);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setFeedback({ type: 'error', message: 'Veuillez sélectionner un client en gros.' });
      return;
    }
    if (orderLines.length === 0) {
      setFeedback({ type: 'error', message: 'Veuillez saisir au moins une quantité de cartons à commander.' });
      return;
    }

    setSubmittingOrder(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          client_id: selectedClientId,
          date: orderDate,
          items: orderLines,
          discount_percent: discountPercent,
          payment_mode: paymentMode,
          payment_status: paymentStatus,
          delivery_status: deliveryStatus,
          notes: orderNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la création de la commande en gros.');
      }

      setFeedback({ type: 'success', message: data.message });
      setQuantities({});
      setOrderNotes('');
      onRefreshData();
      setSubTab('commandes-gros');
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur lors de la validation.',
      });
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    updates: { delivery_status?: string; payment_status?: string }
  ) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/wholesale/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur de mise à jour');
      }
      setFeedback({ type: 'success', message: data.message });
      onRefreshData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur de mise à jour',
      });
    }
  };

  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    setSubmittingCancel(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/wholesale/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          reason: cancelReason || 'Annulation de commande en gros',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'annulation");
      }
      setFeedback({ type: 'success', message: data.message });
      setCancellingOrder(null);
      setCancelReason('');
      onRefreshData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "Erreur lors de l'annulation",
      });
    } finally {
      setSubmittingCancel(false);
    }
  };

  const openCreateClientModal = () => {
    setEditingClient(null);
    setCompanyName('');
    setManagerName('');
    setClientPhone('+223 ');
    setClientEmail('');
    setNeighborhood('Grand Marché Dabanani');
    setCity('Bamako');
    setAddress('');
    setNif('');
    setRccm('');
    setCategory('Demi-grossiste');
    setDefaultDiscount(3);
    setClientNotes('');
    setShowClientModal(true);
  };

  const openEditClientModal = (client: any) => {
    setEditingClient(client);
    setCompanyName(client.company_name || '');
    setManagerName(client.manager_name || '');
    setClientPhone(client.phone || '+223 ');
    setClientEmail(client.email || '');
    setNeighborhood(client.neighborhood || '');
    setCity(client.city || 'Bamako');
    setAddress(client.address || '');
    setNif(client.nif || '');
    setRccm(client.rccm || '');
    setCategory(client.category || 'Demi-grossiste');
    setDefaultDiscount(Number(client.default_discount_percent ?? 0));
    setClientNotes(client.notes || '');
    setShowClientModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingClient(true);
    setFeedback(null);

    try {
      const url = editingClient ? `/api/wholesale/clients/${editingClient.id}` : '/api/wholesale/clients';
      const method = editingClient ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id,
        },
        body: JSON.stringify({
          company_name: companyName,
          manager_name: managerName,
          phone: clientPhone,
          email: clientEmail,
          neighborhood,
          city,
          address,
          nif,
          rccm,
          category,
          default_discount_percent: defaultDiscount,
          notes: clientNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur sauvegarde client en gros');
      }

      setFeedback({ type: 'success', message: data.message });
      setShowClientModal(false);
      onRefreshData();
      if (data.client?.id) {
        setSelectedClientId(data.client.id);
        setDiscountPercent(Number(data.client.default_discount_percent || 0));
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur sauvegarde client en gros',
      });
    } finally {
      setSubmittingClient(false);
    }
  };

  const handleExportOrdersPdf = () => {
    exportTableToPdf({
      title: 'ÉTAT DES COMMANDES EN GROS — BAOBAB DISTRIBUTION',
      subtitle: `Gestionnaire grossiste : ${currentUser.name} (${currentUser.code}) • ${filteredOrders.length} commande(s)`,
      filename: `commandes-en-gros-baobab-${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: currentUser.role,
      orientation: 'landscape',
      summaryCards: [
        { label: 'Commandes actives', value: `${activeOrders.length}` },
        { label: 'Volume total (Cartons)', value: `${totalWholesaleBoxes.toLocaleString('fr-FR')} cartons` },
        { label: "Chiffre d'affaires Gros", value: `${totalWholesaleCA.toLocaleString('fr-FR')} FCFA` },
        { label: 'Clients en gros', value: `${wholesaleClients.length} clients` },
      ],
      columns: ['N° Commande', 'Date', 'Client en Gros', 'Quartier / Ville', 'Cartons', 'Remise', 'Montant Net (FCFA)', 'Paiement', 'Livraison'],
      rows: filteredOrders.map((o) => [
        o.reference,
        `${o.date}${o.order_time ? ` ${o.order_time}` : ''}`,
        `${o.client_name} (${o.client_code})`,
        `${o.client_neighborhood || ''} (${o.client_city || 'Bamako'})`,
        `${o.total_boxes} ctn`,
        `${o.discount_percent || 0}%`,
        `${Number(o.total_amount || 0).toLocaleString('fr-FR')} FCFA`,
        `${o.payment_mode} (${o.payment_status === 'paye' ? 'Payé' : o.payment_status === 'annulee' ? 'Annulé' : 'En attente'})`,
        o.delivery_status === 'livree' ? 'Livrée' : o.delivery_status === 'annulee' ? 'Annulée' : 'En préparation',
      ]),
    });
  };

  const handleExportClientsPdf = () => {
    exportTableToPdf({
      title: 'RÉPERTOIRE DES CLIENTS EN GROS — BAOBAB DISTRIBUTION',
      subtitle: `Gestionnaire grossiste : ${currentUser.name} (${currentUser.code}) • ${filteredClients.length} client(s) en gros`,
      filename: `clients-en-gros-baobab-${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: currentUser.role,
      orientation: 'landscape',
      summaryCards: [
        { label: 'Total Clients en Gros', value: `${wholesaleClients.length}` },
        { label: 'Volume Commandé', value: `${totalWholesaleBoxes.toLocaleString('fr-FR')} cartons` },
        { label: 'CA Cumulé Gros', value: `${totalWholesaleCA.toLocaleString('fr-FR')} FCFA` },
      ],
      columns: ['Code', 'Société / Établissement', 'Gérant', 'Téléphone', 'Catégorie', 'Quartier / Ville', 'Remise', 'Commandes', 'CA Cumulé (FCFA)'],
      rows: filteredClients.map((c) => [
        c.code,
        c.company_name,
        c.manager_name,
        c.phone,
        c.category,
        `${c.neighborhood} (${c.city})`,
        `${c.default_discount_percent || 0}%`,
        `${c.orders_count || 0} cmd (${c.total_boxes_ordered || 0} ctn)`,
        `${Number(c.total_ca_fcfa || 0).toLocaleString('fr-FR')} FCFA`,
      ]),
    });
  };

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {/* Top Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-white">
              {currentUser.role === 'Administrateur' ? 'Administrateur' : 'Gestionnaire grossiste'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white break-words">
            Gestion des Commandes en Gros &amp; Clients en Gros
          </h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Suivi des commandes et clients en gros.
            </p>
            <InfoTooltip text="Pilotez toutes les commandes en gros (grossistes, demi-grossistes, supermarchés), suivez les livraisons et gérez le répertoire de vos clients en gros." />
          </div>
        </div>

        {/* Navigation Pills between the 3 sub-views */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('commandes-gros')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer border ${
              subTab === 'commandes-gros'
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Commandes en gros ({wholesaleOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('nouvelle-commande-gros')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer border ${
              subTab === 'nouvelle-commande-gros'
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-sm'
                : 'bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] border-[#008DA9]/30 hover:bg-[#008DA9]/20'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Nouvelle commande en gros</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('clients-gros')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer border ${
              subTab === 'clients-gros'
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Liste des clients en gros ({wholesaleClients.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => setSubTab('commandes-gros')}
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-[#008DA9] transition"
        >
          <span className="text-xs font-bold uppercase text-slate-400">Chiffre d&apos;Affaires Gros</span>
          <div className="text-xl sm:text-2xl font-black text-[#008DA9] dark:text-teal-400 mt-1">
            <AdaptiveAmount amount={totalWholesaleCA} unit="FCFA" unitClassName="text-xs font-bold" />
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">
            {activeOrders.length} commandes en gros actives
          </span>
        </div>

        <div
          onClick={() => setSubTab('commandes-gros')}
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-[#008DA9] transition"
        >
          <span className="text-xs font-bold uppercase text-slate-400">Volume Total Vendu en Gros</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            <AdaptiveAmount amount={totalWholesaleBoxes} unit="cartons" unitClassName="text-xs font-bold text-emerald-600" />
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">
            {pendingDeliveryCount > 0 ? `${pendingDeliveryCount} commande(s) en préparation` : 'Toutes livrées au dépôt'}
          </span>
        </div>

        <div
          onClick={() => setSubTab('clients-gros')}
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs cursor-pointer hover:border-[#008DA9] transition"
        >
          <span className="text-xs font-bold uppercase text-slate-400">Clients en Gros Actifs</span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            <AdaptiveAmount amount={wholesaleClients.length} unit="comptes grossistes" unitClassName="text-xs font-bold" />
          </div>
          <span className="text-xs text-teal-600 font-semibold mt-0.5 block">
            Bamako &amp; Régions (Ségou, Sikasso) &rarr;
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-bold uppercase text-slate-400">Règlements en Attente</span>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            <AdaptiveAmount amount={pendingPaymentAmount} unit="FCFA" unitClassName="text-xs font-bold" />
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">
            {pendingPaymentOrders.length} commande(s) à encaisser
          </span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 1 : COMMANDES EN GROS
         ===================================================================== */}
      {subTab === 'commandes-gros' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Rechercher par N° commande (CMD-GROS...), client en gros, code ou quartier..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#008DA9]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={orderClientFilter}
                  onChange={(e) => setOrderClientFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">Tous les clients en gros ({wholesaleClients.length})</option>
                  {wholesaleClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name} ({c.code})
                    </option>
                  ))}
                </select>

                <ExportViewButton
                  currentUser={currentUser as any}
                  jeu="commandes_en_gros"
                  label="Exporter"
                  filtres={{
                    client_id: orderClientFilter !== 'ALL' ? orderClientFilter : '',
                    status: orderStatusFilter !== 'ALL' ? orderStatusFilter : '',
                    q: orderSearch,
                  }}
                />

                <button
                  type="button"
                  onClick={handleExportOrdersPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Exporter PDF</span>
                </button>
              </div>
            </div>

            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[
                { id: 'ALL', label: `Toutes (${wholesaleOrders.length})` },
                { id: 'livree', label: 'Livrées' },
                { id: 'en_preparation', label: `En préparation (${pendingDeliveryCount})` },
                { id: 'paye', label: 'Payées' },
                { id: 'en_attente_paiement', label: `Attente paiement (${pendingPaymentOrders.length})` },
                { id: 'annulee', label: 'Annulées' },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    orderStatusFilter === st.id
                      ? 'bg-[#008DA9] text-white border-[#008DA9]'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <CardList<any>
            data={filteredOrders}
            rowKey={(o) => o.id}
            pageSize={20}
            searchable={false}
            sortOptions={[
              {
                key: 'date_desc',
                label: 'Date (plus récentes)',
                compare: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
              },
              {
                key: 'amount_desc',
                label: 'Montant net (décroissant)',
                compare: (a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0),
              },
              {
                key: 'boxes_desc',
                label: 'Cartons (décroissant)',
                compare: (a, b) => Number(b.total_boxes || 0) - Number(a.total_boxes || 0),
              },
            ]}
            defaultSortKey="date_desc"
            emptyMessage="Aucune commande en gros ne correspond aux critères sélectionnés."
            cardClassName={(o) =>
              o.delivery_status === 'annulee'
                ? 'opacity-70 bg-rose-50/20 dark:bg-rose-950/10'
                : ''
            }
            title={(o) => (
              <div className="flex flex-wrap items-baseline justify-between gap-2 w-full min-w-0">
                <span className="font-mono font-extrabold text-sm sm:text-base text-[#008DA9] dark:text-teal-400 [overflow-wrap:anywhere]">
                  {o.reference}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
                  {o.date} {o.order_time ? `à ${o.order_time}` : ''}
                </span>
              </div>
            )}
            subtitle={(o) => (
              <span className="font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                {o.client_name} ({o.client_code}) &bull; {o.client_neighborhood} ({o.client_city || 'Bamako'})
              </span>
            )}
            badges={(o) => (
              <>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    o.delivery_status === 'livree'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : o.delivery_status === 'annulee'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {o.delivery_status === 'livree' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : o.delivery_status === 'annulee' ? (
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {o.delivery_status === 'livree'
                      ? 'Livrée'
                      : o.delivery_status === 'annulee'
                      ? 'Annulée'
                      : 'En préparation'}
                  </span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    o.payment_status === 'paye'
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                      : o.payment_status === 'annulee'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {o.payment_status === 'paye'
                    ? 'Payé'
                    : o.payment_status === 'annulee'
                    ? 'Annulé'
                    : 'Attente paiement'}
                </span>
              </>
            )}
            fields={[
              {
                key: 'client',
                label: 'Client en gros',
                render: (o) => (
                  <span className="[overflow-wrap:anywhere]">
                    <strong className="text-slate-900 dark:text-white">{o.client_name}</strong>{' '}
                    <span className="font-mono text-xs text-slate-500">({o.client_code})</span>
                  </span>
                ),
              },
              {
                key: 'quartier',
                label: 'Quartier / Ville',
                render: (o) => `${o.client_neighborhood} (${o.client_city || 'Bamako'})`,
              },
              {
                key: 'items',
                label: 'Détail cartons (SKUs)',
                render: (o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  return (
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {o.total_boxes} carton{Number(o.total_boxes) > 1 ? 's' : ''}
                      </div>
                      {items.map((it: any, idx: number) => (
                        <div
                          key={idx}
                          className="text-xs text-slate-700 dark:text-slate-300 [overflow-wrap:anywhere]"
                        >
                          &bull; {it.name} :{' '}
                          <strong className="font-extrabold text-slate-900 dark:text-white">
                            {it.qtyBoxes} carton{Number(it.qtyBoxes) > 1 ? 's' : ''}
                          </strong>
                        </div>
                      ))}
                    </div>
                  );
                },
              },
              {
                key: 'remise',
                label: 'Remise commerciale',
                render: (o) =>
                  Number(o.discount_percent) > 0 ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      -{o.discount_percent} % (-{Number(o.discount_amount || 0).toLocaleString('fr-FR')} FCFA)
                    </span>
                  ) : (
                    <span className="text-slate-500">Tarif standard</span>
                  ),
              },
              {
                key: 'reglement',
                label: 'Mode de règlement',
                render: (o) => o.payment_mode,
              },
              {
                key: 'notes',
                label: 'Notes',
                hidden: (o) => !o.notes,
                render: (o) => <span className="italic text-slate-600 dark:text-slate-300">{o.notes}</span>,
              },
              {
                key: 'net_amount',
                label: 'Net à payer',
                isAmount: true,
                render: (o) => (
                  <span className="font-black text-base text-[#008DA9] dark:text-teal-400 whitespace-nowrap">
                    {Number(o.total_amount || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(o) => {
              const isCancelled = o.delivery_status === 'annulee';
              return (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenPrintableOrder(o)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-[#008DA9] shrink-0" />
                    <span>Facture / BL Gros</span>
                  </button>

                  {!isCancelled && o.delivery_status === 'en_preparation' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(o.id, { delivery_status: 'livree' })}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs cursor-pointer"
                    >
                      <Truck className="w-4 h-4 shrink-0" />
                      <span>Valider Livraison</span>
                    </button>
                  )}

                  {!isCancelled && o.payment_status === 'en_attente_paiement' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(o.id, { payment_status: 'paye' })}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>Marquer Payée</span>
                    </button>
                  )}

                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingOrder(o);
                        setCancelReason('');
                      }}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>Annuler</span>
                    </button>
                  )}
                </>
              );
            }}
            totalsFooter={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Total commandes ({filteredOrders.length}) :{' '}
                  {filteredOrders
                    .filter((o) => o.delivery_status !== 'annulee')
                    .reduce((s, o) => s + Number(o.total_boxes || 0), 0)}{' '}
                  cartons
                </span>
                <span className="whitespace-nowrap font-black text-[var(--marque-fonce)] dark:text-teal-300">
                  Montant net :{' '}
                  {filteredOrders
                    .filter((o) => o.delivery_status !== 'annulee')
                    .reduce((s, o) => s + Number(o.total_amount || 0), 0)
                    .toLocaleString('fr-FR')}{' '}
                  FCFA
                </span>
              </div>
            }
          />
        </div>
      )}

      {/* =====================================================================
          TAB 2 : NOUVELLE COMMANDE EN GROS
         ===================================================================== */}
      {subTab === 'nouvelle-commande-gros' && (
        <form
          onSubmit={handleCreateOrder}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start"
        >
          {/* Left 2 Columns: Client selection & Product quantities */}
          <div className="lg:col-span-2 space-y-5">
            {/* Step 1: Select Wholesale Client */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#008DA9]" />
                    <span>1. Sélection du Client en Gros</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Choisissez le client grossiste / demi-grossiste ou créez une nouvelle fiche client.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openCreateClientModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 text-[#008DA9] dark:text-teal-300 font-bold text-xs border border-teal-200 dark:border-teal-800 cursor-pointer shrink-0"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Nouveau Client en Gros</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Client en Gros (Société / Établissement) *
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => handleSelectClientForOrder(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                  >
                    {wholesaleClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} ({c.code}) — {c.category} [{c.neighborhood}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    Date de commande *
                  </label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Select Bulk Quantities per SKU */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-[#008DA9]" />
                  <span>2. Quantités en Gros par Produit (Cartons)</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Saisissez le nombre de cartons ou utilisez les boutons rapides (+10, +25, +50, +100 cartons).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {products
                  .filter((p) => Number(p.is_active ?? 1) === 1)
                  .map((p) => {
                    const currentQty = Number(quantities[p.id] || 0);
                    const effectivePrice = Number(p.wholesale_price_box ?? p.price_box ?? 0);
                    const lineTotal = currentQty * effectivePrice;
                    return (
                      <div
                        key={p.id}
                        className={`p-4 rounded-2xl border transition ${
                          currentQty > 0
                            ? 'border-[#008DA9] bg-teal-50/30 dark:bg-teal-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#008DA9] dark:text-teal-400">
                              {p.code}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              {p.gamme}
                            </span>
                          </div>
                          <div className="font-extrabold text-sm text-slate-900 dark:text-white break-words">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {p.packaging} &bull;{' '}
                            <strong className="text-indigo-700 dark:text-indigo-300">
                              {effectivePrice.toLocaleString('fr-FR')} FCFA / carton
                            </strong>
                            {p.wholesale_price_box ? (
                              <span className="ml-1 text-[10px] text-slate-400">
                                (Tarif grossiste • Détaillant : {Number(p.price_box).toLocaleString('fr-FR')} F)
                              </span>
                            ) : null}
                          </div>
                        <div className="pt-1 flex flex-col gap-0.5 text-xs">
                          <div className="text-slate-600 dark:text-slate-300">
                            Stock disponible : <strong className="text-teal-700 dark:text-teal-400">{p.stock_depot} ctn</strong>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            Dépôt central : <strong>{p.stock_depot} ctn</strong>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setQuantities((prev) => ({
                                ...prev,
                                [p.id]: Math.max(0, (Number(prev[p.id]) || 0) - 1),
                              }))
                            }
                            disabled={currentQty <= 0}
                            className="w-9 h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center disabled:opacity-40 cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={currentQty === 0 ? '' : currentQty}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value || '0', 10) || 0);
                              setQuantities((prev) => ({ ...prev, [p.id]: val }));
                            }}
                            placeholder="0 carton"
                            className="w-28 min-w-[88px] h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base font-mono font-black text-slate-900 dark:text-white text-center"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQuantities((prev) => ({
                                ...prev,
                                [p.id]: (Number(prev[p.id]) || 0) + 1,
                              }))
                            }
                            className="w-9 h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {[10, 25, 50, 100].map((step) => (
                            <button
                              key={step}
                              type="button"
                              onClick={() =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [p.id]: (Number(prev[p.id]) || 0) + step,
                                }))
                              }
                              className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-[#008DA9] dark:text-teal-300 cursor-pointer"
                            >
                              +{step}
                            </button>
                          ))}
                          {currentQty > 0 && (
                            <ConfirmDestructiveButton
                              label="RAZ"
                              confirmLabel="Confirmer RAZ ?"
                              onConfirm={() => setQuantities((prev) => ({ ...prev, [p.id]: 0 }))}
                            />
                          )}
                        </div>
                      </div>

                      {currentQty > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-teal-200/60 dark:border-teal-900/50 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Sous-total ligne ({currentQty} cartons) :
                          </span>
                          <span className="font-black text-[#008DA9] dark:text-teal-300">
                            {lineTotal.toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Summary, Discount, Payment & Submit */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 lg:sticky lg:top-20">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
              3. Conditions Grossiste &amp; Validation
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Remise commerciale Grossiste (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    className="w-28 min-w-[84px] px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-black text-base text-slate-900 dark:text-white text-center"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[0, 2, 3, 5, 8].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer border ${
                          discountPercent === pct
                            ? 'bg-[#008DA9] text-white border-[#008DA9]'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mode de règlement
                  </label>
                  <PaymentMethodSelector
                    value={paymentMode}
                    onChange={setPaymentMode}
                    especesValue="Espèces"
                    mobileMoneyValue="Orange Money"
                    virementValue="Virement Bancaire"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Statut du paiement
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  >
                    <option value="paye">Payé / Règlement reçu</option>
                    <option value="en_attente_paiement">En attente de paiement (Échéance)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Statut de livraison (Dépôt Central)
                  </label>
                  <select
                    value={deliveryStatus}
                    onChange={(e) => setDeliveryStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  >
                    <option value="livree">Livrée / Enlevée immédiatement (Déduit du stock)</option>
                    <option value="en_preparation">En préparation au dépôt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Observation / Instructions d&apos;expédition (optionnel)
                </label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ex: Enlèvement camion 10T au dépôt Sotuba, livraison Halles de Bamako..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Totals Breakdown Box */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Volume total :</span>
                <strong className="text-slate-900 dark:text-white">{basketTotalBoxes} cartons</strong>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Montant Brut HT :</span>
                <strong className="text-slate-900 dark:text-white">
                  {basketSubtotalHt.toLocaleString('fr-FR')} FCFA
                </strong>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Remise Grossiste ({discountPercent}%) :</span>
                <strong>-{basketDiscountAmount.toLocaleString('fr-FR')} FCFA</strong>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                <span className="font-extrabold uppercase text-slate-700 dark:text-slate-200">
                  Net à Payer :
                </span>
                <span className="text-lg font-black text-[#008DA9] dark:text-teal-400">
                  {basketTotalNet.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingOrder || basketTotalBoxes === 0}
              className="w-full min-h-[48px] h-auto py-3 px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] disabled:opacity-50 text-white font-bold text-[16px] shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {submittingOrder
                  ? 'Enregistrement...'
                  : 'Valider la commande'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          TAB 3 : LISTE DES CLIENTS EN GROS
         ===================================================================== */}
      {subTab === 'clients-gros' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Rechercher un client en gros (nom société, code GRS-..., gérant, quartier, téléphone)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#008DA9]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreateClientModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Ajouter un Client en Gros</span>
                </button>

                <ExportViewButton
                  currentUser={currentUser as any}
                  jeu="clients_en_gros"
                  label="Exporter"
                  filtres={{ q: clientSearch }}
                />

                <button
                  type="button"
                  onClick={handleExportClientsPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Exporter PDF Clients</span>
                </button>
              </div>
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {['ALL', 'Grossiste Régional', 'Demi-grossiste', 'Supermarché / Centrale', 'Institution / Horeca'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setClientCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      clientCategoryFilter === cat
                        ? 'bg-[#008DA9] text-white border-[#008DA9]'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cat === 'ALL' ? `Toutes les catégories (${wholesaleClients.length})` : cat}
                  </button>
                )
              )}
            </div>
          </div>

          <CardList<any>
            data={filteredClients}
            rowKey={(client) => client.id}
            pageSize={20}
            searchable={false}
            sortOptions={[
              {
                key: 'ca_desc',
                label: 'CA cumulé (décroissant)',
                compare: (a, b) => Number(b.total_ca_fcfa || 0) - Number(a.total_ca_fcfa || 0),
              },
              {
                key: 'name_asc',
                label: 'Société (A → Z)',
                compare: (a, b) => String(a.company_name || '').localeCompare(String(b.company_name || ''), 'fr'),
              },
              {
                key: 'orders_desc',
                label: 'Commandes (décroissant)',
                compare: (a, b) => Number(b.orders_count || 0) - Number(a.orders_count || 0),
              },
            ]}
            defaultSortKey="ca_desc"
            emptyMessage="Aucun client en gros trouvé pour ces critères."
            title={(client) => (
              <div className="flex flex-wrap items-baseline justify-between gap-2 w-full min-w-0">
                <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                  {client.company_name}
                </span>
                <span className="font-mono font-extrabold text-xs text-[#008DA9] dark:text-teal-400 [overflow-wrap:anywhere]">
                  {client.code}
                </span>
              </div>
            )}
            badges={(client) => (
              <>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  {client.category}
                </span>
                {Number(client.default_discount_percent) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <Percent className="w-3 h-3 shrink-0" />
                    <span>Remise {client.default_discount_percent} %</span>
                  </span>
                )}
              </>
            )}
            fields={[
              {
                key: 'code',
                label: 'Code client',
                render: (client) => <span className="font-mono font-bold">{client.code}</span>,
              },
              {
                key: 'company',
                label: 'Société',
                render: (client) => <strong className="text-slate-900 dark:text-white">{client.company_name}</strong>,
              },
              {
                key: 'manager',
                label: 'Gérant',
                render: (client) => client.manager_name,
              },
              {
                key: 'phone',
                label: 'Téléphone',
                render: (client) => <span className="font-mono">{client.phone}</span>,
              },
              {
                key: 'location',
                label: 'Quartier / Ville',
                render: (client) => `${client.neighborhood} (${client.city || 'Bamako'})`,
              },
              {
                key: 'address',
                label: 'Adresse',
                hidden: (client) => !client.address,
                render: (client) => client.address,
              },
              {
                key: 'nif',
                label: 'NIF',
                hidden: (client) => !client.nif,
                render: (client) => <span className="font-mono">{client.nif}</span>,
              },
              {
                key: 'rccm',
                label: 'RCCM',
                hidden: (client) => !client.rccm,
                render: (client) => <span className="font-mono">{client.rccm}</span>,
              },
              {
                key: 'notes',
                label: 'Notes',
                hidden: (client) => !client.notes,
                render: (client) => <span className="italic text-slate-600 dark:text-slate-300">{client.notes}</span>,
              },
              {
                key: 'orders',
                label: 'Commandes passées',
                isAmount: true,
                render: (client) => (
                  <span className="font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                    {client.orders_count || 0} cmd ({client.total_boxes_ordered || 0} cartons)
                  </span>
                ),
              },
              {
                key: 'ca_cumule',
                label: 'CA cumulé',
                isAmount: true,
                render: (client) => (
                  <span className="font-black text-base text-[#008DA9] dark:text-teal-400 whitespace-nowrap">
                    {Number(client.total_ca_fcfa || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(client) => (
              <>
                <button
                  type="button"
                  onClick={() => openEditClientModal(client)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 shrink-0" />
                  <span>Modifier</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSelectClientForOrder(client.id);
                    setSubTab('nouvelle-commande-gros');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>Commander</span>
                </button>
              </>
            )}
            totalsFooter={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Total clients en gros ({filteredClients.length})</span>
                <span className="whitespace-nowrap font-black text-[var(--marque-fonce)] dark:text-teal-300">
                  CA cumulé :{' '}
                  {filteredClients
                    .reduce((s, c) => s + Number(c.total_ca_fcfa || 0), 0)
                    .toLocaleString('fr-FR')}{' '}
                  FCFA
                </span>
              </div>
            }
          />
        </div>
      )}

      {/* =====================================================================
          MODAL : AJOUTER / MODIFIER UN CLIENT EN GROS
         ===================================================================== */}
      {showClientModal && (
        <FormModal
          title={editingClient ? `Modifier ${editingClient.company_name}` : 'Nouveau Client en Gros'}
          icon={<Building2 className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowClientModal(false)}
          onSubmit={handleSaveClient}
          submitLabel={submittingClient ? 'Enregistrement...' : editingClient ? 'Enregistrer les modifications' : 'Créer le Client en Gros'}
          submitDisabled={submittingClient}
          isDirty={Boolean(companyName.trim() || managerName.trim() || neighborhood.trim() || nif.trim() || rccm.trim() || clientNotes.trim())}
        >
          <div className="flex flex-col gap-5">
            <div>
              <label className={FORM_LABEL_CLASS}>
                Nom de la Société / Établissement Grossiste *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Établissements Kéïta & Frères Demi-Gros"
                className={FORM_FIELD_CLASS}
              />
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  Nom du Gérant / Responsable *
                </label>
                <input
                  type="text"
                  required
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Ex: Modibo Kéïta"
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Téléphone *
                </label>
                <PhoneField
                  required
                  value={clientPhone}
                  onChange={setClientPhone}
                  placeholder="76 00 00 00"
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  Catégorie de Client en Gros
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={FORM_SELECT_CLASS}
                >
                  <option value="Grossiste Régional">Grossiste Régional</option>
                  <option value="Demi-grossiste">Demi-grossiste</option>
                  <option value="Supermarché / Centrale">Supermarché / Centrale</option>
                  <option value="Institution / Horeca">Institution / Horeca</option>
                </select>
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Remise habituelle (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={defaultDiscount}
                  onChange={(e) => setDefaultDiscount(Number(e.target.value) || 0)}
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  Quartier / Zone Commerciale *
                </label>
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Ex: Grand Marché Dabanani, Halles de Bamako..."
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  Ville
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bamako, Ségou, Sikasso, Kayes..."
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div className={FORM_ROW_CLASS}>
              <div>
                <label className={FORM_LABEL_CLASS}>
                  NIF (Optionnel)
                </label>
                <input
                  type="text"
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder="Ex: 084129000M"
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLASS}>
                  RCCM (Optionnel)
                </label>
                <input
                  type="text"
                  value={rccm}
                  onChange={(e) => setRccm(e.target.value)}
                  placeholder="Ex: MA.BKO.2022.B.1234"
                  className={FORM_FIELD_CLASS}
                />
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Adresse complète / Notes
              </label>
              <input
                type="text"
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="Conditions de livraison, horaires d'enlèvement..."
                className={FORM_FIELD_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* =====================================================================
          MODAL : ANNULER UNE COMMANDE EN GROS
         ===================================================================== */}
      {cancellingOrder && (
        <FormModal
          title={`Annuler la commande ${cancellingOrder.reference}`}
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
          onClose={() => setCancellingOrder(null)}
          onSubmit={handleConfirmCancelOrder}
          submitLabel={submittingCancel ? 'Annulation...' : 'Confirmer l’annulation'}
          submitDisabled={submittingCancel}
          isDirty={Boolean(cancelReason.trim())}
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-300">
              Client : <strong>{cancellingOrder.client_name}</strong> ({cancellingOrder.total_boxes} cartons —{' '}
              {Number(cancellingOrder.total_amount).toLocaleString('fr-FR')} FCFA).
              {cancellingOrder.delivery_status === 'livree' &&
                ' Les cartons seront automatiquement réintégrés dans le stock du Dépôt Central.'}
            </p>
            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif d&apos;annulation *
              </label>
              <input
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Modification des quantités demandée par le grossiste"
                className={FORM_FIELD_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
