import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  User,
  Printer,
  PlusCircle,
  ShieldCheck,
  FileText,
  Receipt,
  Gift,
  Download,
  Store,
  Percent,
  Clock,
  X,
  AlertTriangle,
  Lock,
  ShoppingBag,
  Eye,
  Send,
} from 'lucide-react';
import { InvoiceData } from './PrintableDocument';
import { UserSession } from './LoginScreen';
import { buildMiniThermalReceiptDoc, getThermalTicketNumber } from './VentesView';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';

interface VendorBalance {
  vendorId: string;
  code: string;
  name: string;
  team: string;
  phone: string;
  totalSales: number;
  totalVersements: number;
  balanceDue: number;
  stockVanValue: number;
}

interface ComptaViewProps {
  balances: VendorBalance[];
  versements: any[];
  sales: any[];
  products?: any[];
  pdvs?: any[];
  currentRole: string;
  currentUser?: UserSession;
  initialTab?: string;
  externalRectificationSaleId?: string | null;
  onClearExternalRectification?: () => void;
  onNavigateTab?: (tab: string) => void;
  onOpenDocument: (doc: InvoiceData) => void;
  onRefreshData: () => void;
}

export const ComptaView: React.FC<ComptaViewProps> = ({
  balances,
  versements,
  sales,
  products = [],
  pdvs = [],
  currentRole,
  currentUser,
  initialTab,
  externalRectificationSaleId,
  onClearExternalRectification,
  onNavigateTab,
  onOpenDocument,
  onRefreshData,
}) => {
  const isComptable = currentRole === 'Comptable';
  const isAdmin = currentRole === 'Administrateur';
  const isVendeur = currentRole === 'Vendeur';

  const [activeTab, setActiveTab] = useState<'soldes' | 'versements' | 'factures' | 'bons-cadeaux'>(() => {
    if (initialTab === 'versements' || initialTab === 'versements-lecture' || initialTab === 'mes-versements' || initialTab === 'caisse') {
      return 'versements';
    }
    if ((initialTab === 'factures' || initialTab === 'mes-factures') && !isAdmin) {
      return 'factures';
    }
    if (initialTab === 'rapports') {
      return 'bons-cadeaux';
    }
    return 'soldes';
  });

  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'facture' | 'recu'>('all');
  const [bonsCadeaux, setBonsCadeaux] = useState<any[]>([]);

  const fetchBonsCadeaux = async () => {
    try {
      const res = await fetch('/api/bons', {
        headers: {
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
      });
      const data = await res.json();
      if (data.bons) {
        setBonsCadeaux(data.bons);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isVendeur) {
      fetchBonsCadeaux();
    }
  }, [currentRole, activeTab]);

  React.useEffect(() => {
    if (initialTab === 'versements' || initialTab === 'versements-lecture' || initialTab === 'mes-versements' || initialTab === 'caisse') {
      setActiveTab('versements');
    } else if ((initialTab === 'factures' || initialTab === 'mes-factures') && !isAdmin) {
      setActiveTab('factures');
    } else if (initialTab === 'rapports') {
      setActiveTab('bons-cadeaux');
    } else if (initialTab === 'soldes-vendeurs' || initialTab === 'mon-solde') {
      setActiveTab('soldes');
    }
  }, [initialTab, isAdmin]);

  const handleExportBonsCSV = () => {
    const headers = [
      'Référence Bon',
      'Semestre',
      'Code Vendeur',
      'Nom Vendeur',
      'Note /20',
      'Plafond Bon (FCFA)',
      'Panier Demandé (FCFA)',
      'Valeur Remise (FCFA)',
      'Statut',
      'Date Remise',
      'Règlement'
    ];
    const rows = bonsCadeaux.map((b) => [
      b.id,
      b.semester,
      b.vendor_code || '',
      `"${(b.vendor_name || '').replace(/"/g, '""')}"`,
      b.note_total,
      b.amount ?? 0,
      b.basket_total ?? 0,
      b.delivered_total ?? 0,
      b.status,
      b.remis_at || '',
      'Rien en espèces'
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rapport-bons-cadeaux-comptable-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Strict per-vendor data isolation when logged in as a Vendeur
  const visibleBalances = useMemo(() => {
    if (isVendeur && currentUser) {
      return balances.filter(
        (b) => b.vendorId === currentUser.id || b.code === currentUser.code
      );
    }
    return balances;
  }, [balances, isVendeur, currentUser]);

  const visibleVersements = useMemo(() => {
    if (isVendeur && currentUser) {
      return versements.filter(
        (v) => v.vendor_id === currentUser.id || v.vendor_code === currentUser.code
      );
    }
    return versements;
  }, [versements, isVendeur, currentUser]);

  const visibleSales = useMemo(() => {
    if (isVendeur && currentUser) {
      return sales.filter(
        (s) => s.vendor_id === currentUser.id || s.vendor_code === currentUser.code
      );
    }
    return sales;
  }, [sales, isVendeur, currentUser]);

  // État d'activation ou non de la TVA 18% par vente (Chaque vente réalisée par le vendeur auprès de son PDV constitue une facture à part)
  const [saleTvaMap, setSaleTvaMap] = useState<Record<string, boolean>>({});
  const [selectedVersementForInvoicing, setSelectedVersementForInvoicing] = useState<any | null>(null);
  const [generatingSaleId, setGeneratingSaleId] = useState<string | null>(null);

  const isTvaEnabledForSale = (sale: any): boolean => {
    if (sale?.id && saleTvaMap[sale.id] !== undefined) {
      return saleTvaMap[sale.id];
    }
    return Boolean(sale?.with_tva);
  };

  const toggleSaleTva = (saleId: string, nextVal: boolean) => {
    setSaleTvaMap((prev) => ({
      ...prev,
      [saleId]: nextVal,
    }));
  };

  const buildSaleInvoicePayload = (sale: any, withTva: boolean, versementRef?: string): InvoiceData => {
    const subtotalHt = Number(sale.total_amount || 0);
    const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
    const totalTtc = subtotalHt + tvaAmount;
    const invoiceNum = sale.invoice_number || String(sale.number || '').replace(/^VTE-/, 'FAC-');

    return {
      id: sale.id,
      number: invoiceNum,
      saleNumber: sale.number,
      saleTime: sale.sale_time || '10:30',
      type: 'facture',
      date: sale.date,
      clientName: `${sale.pdv_name} (${sale.pdv_neighborhood})`,
      clientPhone: sale.pdv_phone || '+223 76 00 00 00',
      vendorName: sale.vendor_name,
      vendorCode: sale.vendor_code,
      vendorTeam: sale.vendor_team,
      vendorPhone: sale.vendor_phone || '+223 75 44 22 11',
      pdvName: sale.pdv_name,
      pdvCode: sale.pdv_code,
      pdvNeighborhood: sale.pdv_neighborhood,
      pdvManager: sale.pdv_manager,
      pdvPhone: sale.pdv_phone || '+223 76 00 00 00',
      versementRef: versementRef || sale.versement_reference,
      withTva,
      subtotalHt,
      tvaRate: withTva ? 18 : 0,
      tvaAmount,
      totalTtc,
      items: (sale.items || []).map((it: any) => ({
        code: it.code,
        name: it.name,
        qty: it.qtyBoxes,
        price: it.unitPrice,
        total: it.total,
      })),
      total: totalTtc,
      paymentMethod: sale.payment_type || 'Comptant',
      cashierName: `${sale.vendor_name} (${sale.vendor_code})`,
      status: withTva ? 'Facturée TTC (TVA 18%)' : 'Facturée HT (Sans TVA)',
    };
  };

  const handleGenerateAndOpenSaleInvoice = async (sale: any, withTva: boolean, versementObj?: any) => {
    if (isComptable) {
      setGeneratingSaleId(sale.id);
      try {
        await fetch(`/api/sales/${sale.id}/generate-invoice`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
          },
          body: JSON.stringify({
            with_tva: withTva,
            versement_id: versementObj?.id || sale.versement_id || null,
          }),
        });
        onRefreshData();
      } catch {
        // fallback to local preview if offline
      } finally {
        setGeneratingSaleId(null);
      }
    }

    onOpenDocument(
      buildSaleInvoicePayload(sale, withTva, versementObj?.reference || sale.versement_reference)
    );
  };

  // Rectification requests state & modals
  const [rectifications, setRectifications] = useState<any[]>([]);
  const [rectificationModalSale, setRectificationModalSale] = useState<any | null>(null);
  const [selectedProofSaleId, setSelectedProofSaleId] = useState<string>('');
  const [rectificationReason, setRectificationReason] = useState<string>('');
  const [isSubmittingRectification, setIsSubmittingRectification] = useState(false);
  const [resolvingRectificationId, setResolvingRectificationId] = useState<string | null>(null);
  const [comptaFeedbackBanner, setComptaFeedbackBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Comptable: Create Invoice for Vendor modal state
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [createInvoiceMode, setCreateInvoiceMode] = useState<'existing_sale' | 'new_invoice'>('existing_sale');
  const [selectedSaleIdForNewInvoice, setSelectedSaleIdForNewInvoice] = useState<string>('');
  const [newInvoiceVendorId, setNewInvoiceVendorId] = useState<string>(balances[0]?.vendorId || '');
  const [newInvoicePdvId, setNewInvoicePdvId] = useState<string>(pdvs[0]?.id || '');
  const [newInvoiceProductId, setNewInvoiceProductId] = useState<string>(products[0]?.id || '');
  const [newInvoiceQtyBoxes, setNewInvoiceQtyBoxes] = useState<number>(10);
  const [newInvoiceWithTva, setNewInvoiceWithTva] = useState<boolean>(false);
  const [isCreatingInvoiceForVendor, setIsCreatingInvoiceForVendor] = useState<boolean>(false);

  const fetchRectifications = useCallback(async () => {
    try {
      const res = await fetch('/api/invoice-rectifications', {
        headers: {
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.rectifications) {
          setRectifications(d.rectifications);
        }
      }
    } catch {
      // ignore
    }
  }, [currentRole, currentUser?.id]);

  useEffect(() => {
    fetchRectifications();
  }, [fetchRectifications, sales]);

  // If externalRectificationSaleId is passed (e.g. from PrintableDocument "Demander une rectification" button)
  useEffect(() => {
    if (externalRectificationSaleId) {
      const foundSale = sales.find((s) => s.id === externalRectificationSaleId);
      if (foundSale) {
        setActiveTab('factures');
        setRectificationModalSale(foundSale);
        setSelectedProofSaleId(foundSale.id);
        setRectificationReason('');
      }
      onClearExternalRectification?.();
    }
  }, [externalRectificationSaleId, sales, onClearExternalRectification]);

  const openVendorRectificationModal = (saleObj: any) => {
    setRectificationModalSale(saleObj);
    setSelectedProofSaleId(saleObj.id);
    setRectificationReason('');
  };

  const selectedProofSaleObj = useMemo(() => {
    if (!selectedProofSaleId) return rectificationModalSale;
    return visibleSales.find((s) => s.id === selectedProofSaleId) || rectificationModalSale;
  }, [selectedProofSaleId, visibleSales, rectificationModalSale]);

  const handleSubmitVendorRectification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVendeur || !rectificationModalSale || !rectificationReason.trim()) return;

    setIsSubmittingRectification(true);
    try {
      const proofSale = selectedProofSaleObj || rectificationModalSale;
      const thermalDoc = buildMiniThermalReceiptDoc(proofSale);

      const res = await fetch('/api/invoice-rectifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({
          sale_id: rectificationModalSale.id,
          invoice_number:
            rectificationModalSale.invoice_number ||
            String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-'),
          vendor_id: currentUser?.id || rectificationModalSale.vendor_id,
          reason: rectificationReason.trim(),
          thermal_receipt: thermalDoc,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComptaFeedbackBanner({
          type: 'success',
          text: `Demande de rectification envoyée au Comptable avec votre Mini Facture Thermique (${thermalDoc.thermalTicketNumber}) en pièce jointe comme preuve officielle.`,
        });
        setRectificationModalSale(null);
        setRectificationReason('');
        await fetchRectifications();
        onRefreshData();
      } else {
        setComptaFeedbackBanner({
          type: 'error',
          text: data.error || "Erreur lors de l'envoi de la demande de rectification.",
        });
      }
    } catch {
      setComptaFeedbackBanner({
        type: 'error',
        text: "Erreur réseau lors de l'envoi de la demande de rectification.",
      });
    } finally {
      setIsSubmittingRectification(false);
    }
  };

  const handleComptableResolveRectification = async (
    rect: any,
    decision: 'rectifiee' | 'rejetee',
    withTvaOverride?: boolean
  ) => {
    if (!isComptable) return;
    setResolvingRectificationId(rect.id);
    try {
      const proofReceipt = rect.thermal_receipt || {};
      const updatedItems =
        decision === 'rectifiee' && Array.isArray(proofReceipt.items) && proofReceipt.items.length > 0
          ? proofReceipt.items.map((it: any) => ({
              code: it.code,
              name: it.name,
              qtyBoxes: Number(it.qty ?? it.qtyBoxes ?? 1),
              unitPrice: Number(it.price ?? it.unitPrice ?? 0),
              total: Number(it.total ?? 0),
            }))
          : undefined;

      const res = await fetch(`/api/invoice-rectifications/${rect.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          decision,
          with_tva: withTvaOverride !== undefined ? withTvaOverride : false,
          updated_items: updatedItems,
          comptable_note:
            decision === 'rectifiee'
              ? `Facture rectifiée conformément à la Mini Facture Thermique ${rect.thermal_ticket_number} soumise en preuve.`
              : 'Demande examinée et clôturée par le Comptable.',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComptaFeedbackBanner({
          type: 'success',
          text:
            decision === 'rectifiee'
              ? `La facture ${rect.invoice_number} de ${rect.vendor_name} a été rectifiée et une notification a été transmise au vendeur.`
              : `La demande de rectification sur ${rect.invoice_number} a été rejetée et le vendeur a été notifié.`,
        });
        await fetchRectifications();
        onRefreshData();
      }
    } finally {
      setResolvingRectificationId(null);
    }
  };

  const handleComptableCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComptable) return;
    setIsCreatingInvoiceForVendor(true);
    try {
      if (createInvoiceMode === 'existing_sale') {
        const saleObj = sales.find((s) => s.id === selectedSaleIdForNewInvoice);
        if (!saleObj) return;
        await handleGenerateAndOpenSaleInvoice(saleObj, newInvoiceWithTva);
        setShowCreateInvoiceModal(false);
        setComptaFeedbackBanner({
          type: 'success',
          text: `Facture créée avec succès pour le vendeur ${saleObj.vendor_name} (${saleObj.pdv_name}). Le vendeur peut désormais la consulter et l'imprimer dans son compte.`,
        });
      } else {
        const prod = products.find((p) => p.id === newInvoiceProductId) || products[0];
        const qty = Math.max(1, Number(newInvoiceQtyBoxes || 1));
        const unitPrice = Number(prod?.price_box || 18000);
        const res = await fetch('/api/invoices/create-for-vendor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
          },
          body: JSON.stringify({
            vendor_id: newInvoiceVendorId,
            pdv_id: newInvoicePdvId,
            with_tva: newInvoiceWithTva,
            payment_type: 'Comptant',
            items: [
              {
                productId: prod?.id || 'p1',
                code: prod?.code || 'BEN-01',
                name: prod?.name || 'Produit Baobab',
                qtyBoxes: qty,
                unitPrice,
                total: qty * unitPrice,
              },
            ],
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setShowCreateInvoiceModal(false);
          onRefreshData();
          setComptaFeedbackBanner({
            type: 'success',
            text: `Facture ${data.invoice_number} créée pour le vendeur ! Elle est immédiatement visible et imprimable (en lecture seule) dans le compte du vendeur.`,
          });
        }
      }
    } finally {
      setIsCreatingInvoiceForVendor(false);
    }
  };

  // Combined printable documents (Sales Invoices + Cash Remittance Receipts) filtered for current user
  // IMPORTANT: Le vendeur ne peut pas créer de factures. Il ne voit dans "Factures" que les factures créées par le Comptable (s.invoice_generated).
  const invoicedOrEditableSales = useMemo(() => {
    if (isVendeur) {
      return visibleSales.filter((s) => Boolean(s.invoice_generated));
    }
    return visibleSales;
  }, [visibleSales, isVendeur]);

  const printableDocuments = useMemo(() => {
    const saleDocs = invoicedOrEditableSales.map((s) => {
      // Le Vendeur ne peut pas modifier la TVA : il voit uniquement la configuration enregistrée par le Comptable
      const withTva = isVendeur
        ? Boolean(s.with_tva)
        : saleTvaMap[s.id] !== undefined
        ? saleTvaMap[s.id]
        : Boolean(s.with_tva);
      const subtotalHt = Number(s.total_amount || 0);
      const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
      const totalAmount = subtotalHt + tvaAmount;
      const invoiceNum = s.invoice_number || String(s.number || '').replace(/^VTE-/, 'FAC-');

      return {
        id: `doc-sale-${s.id}`,
        rawId: s.id,
        rawSale: s,
        docKind: 'facture' as const,
        number: invoiceNum,
        saleNumber: s.number,
        thermalTicketNumber: getThermalTicketNumber(s),
        date: s.date,
        saleTime: s.sale_time || '10:30',
        counterparty: `${s.pdv_name} (${s.pdv_neighborhood})`,
        pdvCode: s.pdv_code,
        pdvManager: s.pdv_manager,
        vendorLabel: `${s.vendor_name} (${s.vendor_code})`,
        vendorTeam: s.vendor_team,
        paymentMode: s.payment_type || 'Comptant',
        subtotalHt,
        withTva,
        tvaAmount,
        amount: totalAmount,
        invoiceGenerated: Boolean(s.invoice_generated),
        rectificationStatus: s.rectification_status || null,
        rectificationReason: s.rectification_reason || null,
        invoicePayload: buildSaleInvoicePayload(s, withTva, s.versement_reference),
      };
    });

    const versementDocs = visibleVersements.map((v) => ({
      id: `doc-vers-${v.id}`,
      rawId: v.id,
      rawSale: null as any,
      docKind: 'recu' as const,
      number: v.reference,
      saleNumber: undefined as string | undefined,
      thermalTicketNumber: undefined as string | undefined,
      date: v.date,
      saleTime: undefined as string | undefined,
      counterparty: `Caisse Centrale Baobab (${v.notes || 'Versement dépôt-vente'})`,
      pdvCode: undefined as string | undefined,
      pdvManager: undefined as string | undefined,
      vendorLabel: `${v.vendor_name} (${v.vendor_code})`,
      vendorTeam: v.vendor_team as string | undefined,
      paymentMode: v.payment_mode || 'Espèces',
      subtotalHt: Number(v.amount || 0),
      withTva: false,
      tvaAmount: 0,
      amount: Number(v.amount || 0),
      invoiceGenerated: true,
      rectificationStatus: null as string | null,
      rectificationReason: null as string | null,
      invoicePayload: {
        id: v.id,
        number: v.reference,
        type: 'recu' as const,
        date: v.date,
        clientName: `${v.vendor_name} (${v.vendor_code}) — ${v.vendor_team || 'Équipe Commerciale'}`,
        clientPhone: currentUser?.phone || '+223 75 44 22 11',
        items: [
          {
            code: v.reference,
            name: v.notes || 'Versement de caisse des ventes PDV (Dépôt-Vente)',
            qty: 1,
            price: Number(v.amount || 0),
            total: Number(v.amount || 0),
          },
        ],
        total: Number(v.amount || 0),
        paymentMethod: v.payment_mode || 'Espèces',
        cashierName: 'Service Comptabilité & Caisse Baobab',
        status: 'Validé en Caisse',
      } as InvoiceData,
    }));

    return [...saleDocs, ...versementDocs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [invoicedOrEditableSales, visibleVersements, currentUser?.phone, saleTvaMap, isVendeur]);

  const filteredPrintableDocs = useMemo(() => {
    if (docTypeFilter === 'all') return printableDocuments;
    return printableDocuments.filter((d) => d.docKind === docTypeFilter);
  }, [printableDocuments, docTypeFilter]);

  const [showVersementModal, setShowVersementModal] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(balances[0]?.vendorId || '');
  const [versementAmount, setVersementAmount] = useState<number>(50000);
  const [paymentMode, setPaymentMode] = useState('Espèces');
  const [notes, setNotes] = useState('Versement de caisse des ventes PDV');
  const [openInvoicingOnVersement, setOpenInvoicingOnVersement] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRecordVersement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComptable || !selectedVendorId || versementAmount <= 0) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/versements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          vendor_id: selectedVendorId,
          amount: versementAmount,
          payment_mode: paymentMode,
          notes,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setShowVersementModal(false);
        onRefreshData();
        if (openInvoicingOnVersement) {
          const vendorInfo = balances.find((b) => b.vendorId === selectedVendorId);
          setSelectedVersementForInvoicing(
            data.versement || {
              id: `vsm-${Date.now()}`,
              reference: 'Nouveau Versement',
              date: new Date().toISOString().split('T')[0],
              vendor_id: selectedVendorId,
              vendor_name: vendorInfo?.name || 'Vendeur',
              vendor_code: vendorInfo?.code || '',
              vendor_team: vendorInfo?.team || '',
              amount: versementAmount,
              payment_mode: paymentMode,
            }
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSalesAll = visibleBalances.reduce((sum, b) => sum + b.totalSales, 0);
  const totalVersementsAll = visibleBalances.reduce((sum, b) => sum + b.totalVersements, 0);
  const totalBalanceDueAll = visibleBalances.reduce((sum, b) => sum + b.balanceDue, 0);

  const handleExportComptaPdf = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const roleLabel = `Utilisateur : ${currentUser?.name || currentRole} (${currentRole})`;

    if (activeTab === 'soldes') {
      exportTableToPdf({
        title: 'Soldes Depot-Vente & Ventes par Vendeur',
        subtitle: 'Suivi comptable des ventes livrees aux PDV, versements encaisses et soldes restants dus',
        filename: `soldes_ventes_vendeurs_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [
          { label: 'Total Ventes PDV', value: formatFcfaPdf(totalSalesAll) },
          { label: 'Versements Encaisses', value: formatFcfaPdf(totalVersementsAll) },
          { label: 'Solde Restant Du', value: formatFcfaPdf(totalBalanceDueAll) },
        ],
        columns: [
          'Code Vendeur',
          'Nom & Contact',
          'Equipe',
          'Ventes Realisees',
          'Versements Valides',
          'Solde Restant Du',
          'Stock Camionnette',
        ],
        rows: visibleBalances.map((b) => [
          b.code,
          `${b.name} (${b.phone})`,
          b.team || 'Equipe Standard',
          formatFcfaPdf(b.totalSales),
          formatFcfaPdf(b.totalVersements),
          formatFcfaPdf(b.balanceDue),
          formatFcfaPdf(b.stockVanValue),
        ]),
      });
      return;
    }

    if (activeTab === 'versements') {
      const sumVers = visibleVersements.reduce((sum, v) => sum + Number(v.amount || 0), 0);
      exportTableToPdf({
        title: 'Journal Officiel des Versements de Caisse (Recettes des Ventes)',
        subtitle: 'Historique des encaissements valides par le Service Comptabilite',
        filename: `journal_versements_caisse_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [
          { label: 'Nombre de versements', value: `${visibleVersements.length}` },
          { label: 'Total encaisse', value: formatFcfaPdf(sumVers) },
        ],
        columns: ['Ref. Versement', 'Date', 'Vendeur & Equipe', 'Mode de Reglement', 'Notes / Motif', 'Montant (FCFA)'],
        rows: visibleVersements.map((v) => [
          v.reference || v.id,
          v.date || '',
          `${v.vendor_name || ''} (${v.vendor_code || ''}) - ${v.vendor_team || ''}`,
          v.payment_mode || 'Especes',
          v.notes || 'Versement de caisse des ventes PDV',
          formatFcfaPdf(v.amount),
        ]),
      });
      return;
    }

    if (activeTab === 'factures') {
      exportTableToPdf({
        title: 'Registre des Factures de Ventes & Recus de Caisse',
        subtitle: 'Documents comptables officiels',
        filename: `factures_recus_baobab_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [{ label: 'Documents affiches', value: `${filteredPrintableDocs.length}` }],
        columns: ['N° Document', 'Type', 'Date', 'Client PDV / Contrepartie', 'Vendeur', 'Mode', 'Montant TTC (FCFA)'],
        rows: filteredPrintableDocs.map((d) => [
          d.number,
          d.docKind === 'facture' ? 'Facture Vente' : 'Recu Caisse',
          d.date || '',
          d.counterparty,
          d.vendorLabel,
          d.paymentMode,
          formatFcfaPdf(d.amount),
        ]),
      });
      return;
    }

    // 'bons-cadeaux'
    exportTableToPdf({
      title: 'Rapport Comptable - Bons Cadeaux Vendeurs (Valeur Remise)',
      subtitle: 'Valorisation des sorties de stock en bons cadeaux semestriels (aucun decaissement especes)',
      filename: `rapport_bons_cadeaux_${todayStr}.pdf`,
      roleLabel,
      summaryCards: [{ label: 'Total bons cadeaux', value: `${bonsCadeaux.length}` }],
      columns: ['Reference Bon', 'Semestre', 'Vendeur', 'Note /20', 'Plafond Bon', 'Valeur Remise', 'Statut'],
      rows: bonsCadeaux.map((b) => [
        b.id,
        b.semester || '',
        `${b.vendor_name || ''} (${b.vendor_code || ''})`,
        `${b.note_total}/20`,
        formatFcfaPdf(b.amount),
        formatFcfaPdf(b.delivered_total || b.basket_total || 0),
        b.status || '',
      ]),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isAdmin
                ? 'Versements & Soldes Vendeurs (Lecture seule)'
                : isVendeur
                ? 'Mon Solde Dépôt-Vente, Mes Versements & Mes Factures'
                : 'Comptabilité, Caisse & Dépôt-Vente'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              {isAdmin
                ? 'Consultation Administrateur'
                : isVendeur && currentUser
                ? `Espace Personnel • ${currentUser.name} (${currentUser.code})`
                : 'Module Comptable • FCFA'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? "Consultation des versements et des soldes vendeurs. L'encaissement et la facturation sont strictement réservés au Comptable."
              : isVendeur
              ? "Consultez uniquement votre solde dépôt-vente personnel, votre journal de versements de caisse et vos propres factures et reçus imprimables."
              : "Suivi des soldes des vendeurs en dépôt-vente (ventes réalisées - versements reçus), encaissements et factures officielles."}
          </p>
        </div>

        {/* Uniquement le Comptable peut faire l'encaissement et créer des factures */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportComptaPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exporter Tableau en PDF</span>
          </button>

          {isComptable ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const uninvoiced = sales.find((s) => !s.invoice_generated) || sales[0];
                  setSelectedSaleIdForNewInvoice(uninvoiced?.id || '');
                  setShowCreateInvoiceModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-sm transition cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Créer Facture Vendeur</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVersementModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Encaisser un Versement Vendeur</span>
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('demandes-achat')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-[#008DA9]" />
                  <span>Demandes d&apos;achat</span>
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold">
              <Lock className="w-4 h-4 text-[#008DA9]" />
              <span>
                {isVendeur
                  ? `Consultation & Impression seule (${currentUser?.code || 'Vendeur'}) • Création de factures réservée au Comptable`
                  : 'Lecture seule • Encaissement et facturation réservés au Comptable'}
              </span>
            </div>
          )}
        </div>
      </div>

      {comptaFeedbackBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            comptaFeedbackBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : comptaFeedbackBanner.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800 text-cyan-900 dark:text-cyan-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {comptaFeedbackBanner.text}
          </span>
          <button
            type="button"
            onClick={() => setComptaFeedbackBanner(null)}
            className="text-sm font-mono px-2 py-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-bold uppercase text-slate-400">
            {isVendeur ? 'Mes Ventes Livrées aux PDV' : 'Total Ventes Livrées aux PDV'}
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {totalSalesAll.toLocaleString('fr-FR')} <span className="text-xs text-[#008DA9]">FCFA</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isVendeur
              ? `Cumul de vos livraisons (${currentUser?.name})`
              : 'Montant global des marchandises vendues'}
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-bold uppercase text-slate-400">
            {isVendeur ? 'Mes Versements Encaissés à la Caisse' : 'Versements Encaissés à la Caisse'}
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {totalVersementsAll.toLocaleString('fr-FR')} <span className="text-xs text-emerald-600">FCFA</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isVendeur
              ? 'Vos versements déjà validés par le Comptable'
              : 'Fonds déjà réceptionnés et validés par le Comptable'}
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-xs font-bold uppercase text-slate-400">
            {isVendeur ? 'Mon Solde Restant Dû' : 'Solde Restant Dû par les Vendeurs'}
          </span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {totalBalanceDueAll.toLocaleString('fr-FR')} <span className="text-xs text-amber-600">FCFA</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isVendeur
              ? 'Montant net restant à remettre à la caisse'
              : 'Ventes réalisées en cours de versement'}
          </p>
        </div>
      </div>

      {/* Sub Tabs — Grille de boutons en rangées et colonnes sans débordement */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isAdmin && !isVendeur ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-4`}>
        <button
          onClick={() => setActiveTab('soldes')}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
            activeTab === 'soldes'
              ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 shrink-0" />
            <span className="leading-snug">Soldes Dépôt-Vente par Vendeur</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
              activeTab === 'soldes'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {visibleBalances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('versements')}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
            activeTab === 'versements'
              ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="leading-snug">Journal des Versements de Caisse</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
              activeTab === 'versements'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {visibleVersements.length}
          </span>
        </button>

        {!isAdmin && (
          <button
            onClick={() => setActiveTab('factures')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
              activeTab === 'factures'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Printer className="w-4 h-4 shrink-0" />
              <span className="leading-snug">Factures &amp; Reçus Imprimables</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                activeTab === 'factures'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {printableDocuments.length}
            </span>
          </button>
        )}

        {!isVendeur && (
          <button
            onClick={() => setActiveTab('bons-cadeaux')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
              activeTab === 'bons-cadeaux'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Gift className="w-4 h-4 shrink-0" />
              <span className="leading-snug">Rapport « Bons cadeaux » (Valeur remise)</span>
            </span>
          </button>
        )}
      </div>

      {/* 1. Soldes Vendeurs (Dépôt-Vente) */}
      {activeTab === 'soldes' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <strong>Principe comptable du dépôt-vente :</strong>{' '}
              {isVendeur
                ? `Vous visualisez uniquement votre propre solde dépôt-vente (${currentUser?.name} • ${currentUser?.code}). Les soldes des autres vendeurs sont masqués.`
                : "Chaque vendeur charge son véhicule sans payer le stock à l'avance. À chaque livraison au point de vente, la vente est enregistrée à son crédit. Ses versements à la caisse réduisent son solde dû."}
            </div>
            {isVendeur && currentUser && (
              <span className="px-2.5 py-1 rounded-lg bg-[#008DA9]/10 text-[#008DA9] dark:text-cyan-300 font-bold shrink-0">
                Vendeur connecté : {currentUser.code}
              </span>
            )}
          </div>

          {/* Mobile & Tablet Cards (< 1024px) */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {visibleBalances.map((b) => (
              <div
                key={b.vendorId}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                        {b.code}
                      </span>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {b.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {b.team || 'Équipe Standard'} &bull; {b.phone}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Solde Restant Dû</div>
                    <div className="text-base font-black text-amber-600 dark:text-amber-400">
                      {b.balanceDue.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[10px] text-slate-400 font-semibold">Ventes Réalisées</div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {b.totalSales.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30">
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">Versements</div>
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {b.totalVersements.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[10px] text-slate-400 font-semibold">Stock Camionnette</div>
                    <div className="font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                      {b.stockVanValue.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>= 1024px) */}
          <div className="hidden lg:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">Code Vendeur</th>
                    <th className="py-3 px-3">Nom &amp; Contact</th>
                    <th className="py-3 px-3">Équipe</th>
                    <th className="py-3 px-3 text-right">Ventes Réalisées</th>
                    <th className="py-3 px-3 text-right">Versements Validés</th>
                    <th className="py-3 px-3 text-right">Solde Restant Dû</th>
                    <th className="py-3 px-3 text-right">Stock Camionnette (3-7j)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleBalances.map((b) => (
                    <tr key={b.vendorId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                        {b.code}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        <div>{b.name}</div>
                        <div className="text-[10px] text-slate-400">{b.phone}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">
                        {b.team || 'Équipe Standard'}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {b.totalSales.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {b.totalVersements.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-3 text-right font-black text-amber-600 dark:text-amber-400 text-sm whitespace-nowrap">
                        {b.balanceDue.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500 font-medium whitespace-nowrap">
                        {b.stockVanValue.toLocaleString('fr-FR')} FCFA
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Journal des Versements de Caisse */}
      {activeTab === 'versements' && (
        <div className="space-y-4">
          {isComptable && (
            <div className="p-4 rounded-2xl bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/80 text-xs text-slate-700 dark:text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-[#008DA9] dark:text-cyan-300">
                  Facturation par Vente PDV lors du Versement Vendeur :
                </strong>{' '}
                Lorsque le vendeur effectue un versement, vous pouvez générer la facture <strong>au nom du vendeur avec le PDV acheteur</strong> et choisir d&apos;ajouter ou non la <strong>TVA 18%</strong>. Chaque vente réalisée par le vendeur auprès de son PDV constitue une facture à part.
              </div>
              <span className="px-3 py-1 rounded-xl bg-[#008DA9] text-white font-bold text-[11px] shrink-0">
                1 Vente PDV = 1 Facture à part
              </span>
            </div>
          )}

          {isVendeur && currentUser && (
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
              <span>
                Historique exclusif des versements de caisse effectués par <strong>{currentUser.name} ({currentUser.code})</strong>.
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {visibleVersements.length} versement(s)
              </span>
            </div>
          )}

          {/* Mobile Cards View (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {visibleVersements.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucun versement de caisse enregistré pour ce compte.
              </div>
            ) : (
              visibleVersements.map((v) => {
                const vendorSalesForVersement = sales.filter(
                  (s) => s.vendor_id === v.vendor_id || s.vendor_code === v.vendor_code
                );
                return (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {v.reference}
                        </span>
                        <div className="text-[11px] text-slate-400">{v.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                          {v.amount.toLocaleString('fr-FR')} FCFA
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Validé
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {v.vendor_name} ({v.vendor_code})
                        </div>
                        <div className="text-[10px] text-teal-600 dark:text-teal-400">{v.vendor_team}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {v.payment_mode}
                      </span>
                    </div>

                    {v.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg break-words">
                        {v.notes}
                      </p>
                    )}

                    {!isAdmin && (
                      <div className="pt-2 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVersementForInvoicing(v)}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isComptable
                              ? `Factures PDV (${vendorSalesForVersement.length})`
                              : `Mes Factures (${vendorSalesForVersement.length})`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDocument({
                              id: v.id,
                              number: v.reference,
                              type: 'recu',
                              date: v.date,
                              clientName: `${v.vendor_name} (${v.vendor_code}) — ${v.vendor_team || 'Équipe Commerciale'}`,
                              clientPhone: currentUser?.phone || '+223 75 44 22 11',
                              items: [
                                {
                                  code: v.reference,
                                  name: v.notes || 'Versement de caisse des ventes PDV (Dépôt-Vente)',
                                  qty: 1,
                                  price: Number(v.amount || 0),
                                  total: Number(v.amount || 0),
                                },
                              ],
                              total: Number(v.amount || 0),
                              paymentMethod: v.payment_mode || 'Espèces',
                              cashierName: 'Service Comptabilité & Caisse Baobab',
                              status: 'Validé en Caisse',
                            })
                          }
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" />
                          <span>Reçu</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Tablet & Desktop Optimized Table (>= 640px) — Zero Horizontal Overflow */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-2.5 lg:px-4">Réf. &amp; Date</th>
                    <th className="py-3 px-2.5 lg:px-4">Vendeur &amp; Équipe</th>
                    <th className="py-3 px-2.5 lg:px-4">Règlement &amp; Motif</th>
                    <th className="py-3 px-2.5 lg:px-4 text-right">Montant Encaissé</th>
                    <th className="py-3 px-2.5 lg:px-4 text-center">Validation</th>
                    {!isAdmin && (
                      <th className="py-3 px-2.5 lg:px-4 text-center">
                        Factures PDV &amp; Reçu
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleVersements.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 6} className="py-8 text-center text-slate-400">
                        Aucun versement de caisse enregistré pour ce compte.
                      </td>
                    </tr>
                  ) : (
                    visibleVersements.map((v) => {
                      const vendorSalesForVersement = sales.filter(
                        (s) => s.vendor_id === v.vendor_id || s.vendor_code === v.vendor_code
                      );
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-2.5 lg:px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {v.reference}
                            </div>
                            <div className="text-[11px] text-slate-400">{v.date}</div>
                          </td>
                          <td className="py-3 px-2.5 lg:px-4 font-semibold text-slate-800 dark:text-slate-200">
                            <div className="leading-snug">
                              {v.vendor_name}{' '}
                              <span className="font-mono text-[11px] text-slate-500">({v.vendor_code})</span>
                            </div>
                            <div className="text-[10px] text-teal-600 dark:text-teal-400">{v.vendor_team}</div>
                          </td>
                          <td className="py-3 px-2.5 lg:px-4 max-w-[160px] lg:max-w-[260px]">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                              {v.payment_mode}
                            </span>
                            {v.notes && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 break-words whitespace-normal leading-snug">
                                {v.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2.5 lg:px-4 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {v.amount.toLocaleString('fr-FR')} FCFA
                          </td>
                          <td className="py-3 px-2.5 lg:px-4 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span className="hidden md:inline">Validé en Caisse</span>
                              <span className="md:hidden">Validé</span>
                            </span>
                          </td>
                          {!isAdmin && (
                            <td className="py-3 px-2.5 lg:px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedVersementForInvoicing(v)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer whitespace-nowrap"
                                >
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {isComptable
                                      ? `Factures PDV (${vendorSalesForVersement.length})`
                                      : `Mes Factures (${vendorSalesForVersement.length})`}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenDocument({
                                      id: v.id,
                                      number: v.reference,
                                      type: 'recu',
                                      date: v.date,
                                      clientName: `${v.vendor_name} (${v.vendor_code}) — ${v.vendor_team || 'Équipe Commerciale'}`,
                                      clientPhone: currentUser?.phone || '+223 75 44 22 11',
                                      items: [
                                        {
                                          code: v.reference,
                                          name: v.notes || 'Versement de caisse des ventes PDV (Dépôt-Vente)',
                                          qty: 1,
                                          price: Number(v.amount || 0),
                                          total: Number(v.amount || 0),
                                        },
                                      ],
                                      total: Number(v.amount || 0),
                                      paymentMethod: v.payment_mode || 'Espèces',
                                      cashierName: 'Service Comptabilité & Caisse Baobab',
                                      status: 'Validé en Caisse',
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                                >
                                  <Printer className="w-3.5 h-3.5 shrink-0" />
                                  <span>Reçu</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Factures & Reçus Imprimables (Seul le Comptable crée les factures ; le Vendeur consulte, imprime et peut demander une rectification avec Mini Facture Thermique en preuve) */}
      {!isAdmin && activeTab === 'factures' && (
        <div className="space-y-4">
          {/* Autorisation & Règles Banner */}
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#008DA9]" />
                <span>
                  {isVendeur
                    ? 'Vos Factures Officielles (Lecture seule & Impression • Créées par le Comptable)'
                    : 'Création & Gestion des Factures Vendeurs (Autorisation exclusive Comptable)'}
                </span>
              </div>
              <p>
                {isVendeur ? (
                  <>
                    <strong>Le vendeur ne peut pas créer ni modifier de factures</strong> : seul le Comptable y est autorisé. Vous pouvez <strong>voir et imprimer</strong> vos factures ci-dessous. S&apos;il y a une erreur sur une facture, cliquez sur <strong>« Demander une rectification »</strong> pour joindre votre <strong>Mini Facture Thermique automatique</strong> (issue de votre historique de ventes) comme preuve.
                  </>
                ) : (
                  <>
                    <strong>Seul le Comptable est autorisé à créer les factures</strong> au nom du vendeur avec le PDV acheteur (avec ou sans TVA 18%). Dès création, la facture apparaît dans le compte du vendeur en lecture seule.
                  </>
                )}
              </p>
            </div>
            {isComptable ? (
              <button
                type="button"
                onClick={() => {
                  const uninvoiced = sales.find((s) => !s.invoice_generated) || sales[0];
                  setSelectedSaleIdForNewInvoice(uninvoiced?.id || '');
                  setShowCreateInvoiceModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs shrink-0 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Créer une Facture pour un Vendeur</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-bold text-[11px] shrink-0 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Lecture seule • Non modifiable</span>
              </span>
            )}
          </div>

          {/* Section Demandes de Rectification (Comptable: traiter avec preuve thermique | Vendeur: suivi de ses demandes) */}
          {rectifications.length > 0 && (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>
                    {isComptable
                      ? `Demandes de Rectification des Vendeurs avec Preuve Mini Facture Thermique (${rectifications.length})`
                      : `Mes Demandes de Rectification de Factures transmises au Comptable (${rectifications.length})`}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                  Preuve : Mini Facture Thermique (80mm) jointe
                </span>
              </div>

              <div className="space-y-2.5">
                {rectifications.map((rect) => {
                  const isPending = rect.status === 'en_attente';
                  const isRectified = rect.status === 'rectifiee';
                  return (
                    <div
                      key={rect.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-slate-900 dark:text-white">
                            Facture : {rect.invoice_number}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-[#008DA9]">
                            Vente : {rect.sale_number}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-mono font-bold text-[10px]">
                            Preuve : {rect.thermal_ticket_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isPending
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : isRectified
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {isPending
                              ? 'En attente de rectification Comptable'
                              : isRectified
                              ? 'Facture Rectifiée'
                              : 'Demande Rejetée'}
                          </span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-300">
                          <strong>Vendeur :</strong> {rect.vendor_name} ({rect.vendor_code}) &bull;{' '}
                          <strong>PDV :</strong> {rect.pdv_name}
                        </div>
                        <div className="text-rose-700 dark:text-rose-300 font-semibold">
                          <strong>Motif d&apos;erreur signalé :</strong> « {rect.reason} »
                        </div>
                        {rect.comptable_note && (
                          <div className="text-emerald-700 dark:text-emerald-300 font-semibold">
                            <strong>Réponse Comptable :</strong> {rect.comptable_note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (rect.thermal_receipt && rect.thermal_receipt.type) {
                              onOpenDocument({
                                ...rect.thermal_receipt,
                                type: 'mini_thermique',
                                isProofPreview: true,
                              });
                            } else {
                              const saleForProof = sales.find((s) => s.id === rect.sale_id);
                              if (saleForProof) {
                                onOpenDocument({
                                  ...buildMiniThermalReceiptDoc(saleForProof),
                                  isProofPreview: true,
                                });
                              }
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs transition cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Voir Mini Facture Thermique (Preuve)</span>
                        </button>

                        {isComptable && isPending && (
                          <>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', false)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Rectifier Facture (HT)</span>
                            </button>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', true)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              <Percent className="w-3.5 h-3.5" />
                              <span>Rectifier (+ TVA 18%)</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {isVendeur && currentUser ? (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Factures créées pour vous par le Comptable (<strong>{invoicedOrEditableSales.length} facture(s)</strong>) et vos reçus de versement (<strong>{visibleVersements.length}</strong>).
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Factures individuelles par vente (au nom du vendeur avec le PDV acheteur, option TVA 18%) et reçus de caisse.
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setDocTypeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  docTypeFilter === 'all'
                    ? 'bg-[#008DA9] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                Tous ({printableDocuments.length})
              </button>
              <button
                type="button"
                onClick={() => setDocTypeFilter('facture')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  docTypeFilter === 'facture'
                    ? 'bg-[#008DA9] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {isVendeur
                    ? `Mes Factures créées par le Comptable (${invoicedOrEditableSales.length})`
                    : `Factures par Vente PDV (${invoicedOrEditableSales.length})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDocTypeFilter('recu')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  docTypeFilter === 'recu'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Reçus Versements ({visibleVersements.length})</span>
              </button>
            </div>
          </div>

          {/* Mobile Cards View (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {filteredPrintableDocs.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucune facture créée par le Comptable pour ce filtre.
              </div>
            ) : (
              filteredPrintableDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span>{doc.number}</span>
                        {doc.docKind === 'facture' && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              doc.invoiceGenerated
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {doc.invoiceGenerated ? 'Créée' : 'À générer'}
                          </span>
                        )}
                      </div>
                      {doc.saleNumber && (
                        <div className="font-mono text-[10px] text-[#008DA9]">Vente : {doc.saleNumber}</div>
                      )}
                      <div className="text-[11px] text-slate-400">
                        {doc.date} {doc.saleTime ? `à ${doc.saleTime}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900 dark:text-white">
                        {doc.amount.toLocaleString('fr-FR')} FCFA
                      </div>
                      <div className="text-[10px] text-slate-500">
                        HT : {doc.subtotalHt.toLocaleString('fr-FR')} FCFA
                      </div>
                      {doc.docKind === 'facture' && doc.withTva && (
                        <div className="text-[10px] font-bold text-amber-600">
                          TVA 18% : +{doc.tvaAmount.toLocaleString('fr-FR')} FCFA
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white">{doc.vendorLabel}</div>
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {doc.counterparty}
                    </div>
                    {doc.pdvManager && (
                      <div className="text-[10px] text-slate-400">
                        {doc.pdvCode ? `${doc.pdvCode} • ` : ''}Gérant : {doc.pdvManager}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      {doc.docKind === 'facture' && doc.rawSale ? (
                        isComptable ? (
                          <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => toggleSaleTva(doc.rawSale.id, false)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                !doc.withTva
                                  ? 'bg-[#008DA9] text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Sans TVA
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleSaleTva(doc.rawSale.id, true)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                doc.withTva
                                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              + TVA 18%
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              doc.withTva
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            <Lock className="w-3 h-3 opacity-70" />
                            <span>{doc.withTva ? 'TTC (TVA 18%)' : 'HT (Sans TVA)'}</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold">Reçu Caisse</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {doc.docKind === 'facture' && doc.rawSale ? (
                        isComptable ? (
                          <button
                            type="button"
                            disabled={generatingSaleId === doc.rawSale.id}
                            onClick={() => handleGenerateAndOpenSaleInvoice(doc.rawSale, doc.withTva)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>{doc.invoiceGenerated ? 'Modifier / Imprimer' : 'Créer Facture'}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenDocument(doc.invoicePayload)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Imprimer</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openVendorRectificationModal(doc.rawSale)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs cursor-pointer"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Rectifier</span>
                            </button>
                          </>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenDocument(doc.invoicePayload)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimer Reçu</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Tablet & Desktop Optimized Table (>= 640px) — Zero Horizontal Overflow */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-2.5 lg:px-4">N° Facture &amp; Date</th>
                    <th className="py-3 px-2.5 lg:px-4">Vendeur &amp; PDV Acheteur</th>
                    <th className="py-3 px-2.5 lg:px-4 text-center">Régime TVA 18%</th>
                    <th className="py-3 px-2.5 lg:px-4 text-right">Montant HT / Total</th>
                    <th className="py-3 px-2.5 lg:px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPrintableDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Aucune facture créée par le Comptable pour ce filtre.
                      </td>
                    </tr>
                  ) : (
                    filteredPrintableDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-2.5 lg:px-4">
                          <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{doc.number}</span>
                            {doc.docKind === 'facture' && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  doc.invoiceGenerated
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {doc.invoiceGenerated ? 'Créée' : 'À générer'}
                              </span>
                            )}
                          </div>
                          {doc.saleNumber && (
                            <div className="font-mono text-[10px] text-[#008DA9]">Vente : {doc.saleNumber}</div>
                          )}
                          <div className="text-[11px] text-slate-400">
                            {doc.date} {doc.saleTime ? `à ${doc.saleTime}` : ''}
                          </div>
                          {doc.rectificationStatus === 'en_attente' && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <AlertTriangle className="w-2.5 h-2.5" /> Rectification demandée
                            </span>
                          )}
                          {doc.rectificationStatus === 'rectifiee' && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Facture rectifiée
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2.5 lg:px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{doc.vendorLabel}</div>
                          <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                            {doc.counterparty}
                          </div>
                          {doc.pdvManager && (
                            <div className="text-[10px] text-slate-400">
                              {doc.pdvCode ? `${doc.pdvCode} • ` : ''}Gérant : {doc.pdvManager}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-center whitespace-nowrap">
                          {doc.docKind === 'facture' && doc.rawSale ? (
                            isComptable ? (
                              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                                <button
                                  type="button"
                                  onClick={() => toggleSaleTva(doc.rawSale.id, false)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                    !doc.withTva
                                      ? 'bg-[#008DA9] text-white shadow-xs'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  Sans TVA
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSaleTva(doc.rawSale.id, true)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                    doc.withTva
                                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  + TVA 18%
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                                  doc.withTva
                                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                <Lock className="w-3 h-3 opacity-70" />
                                <span>{doc.withTva ? 'TTC (TVA 18%)' : 'HT (Sans TVA)'}</span>
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold">Reçu Caisse</span>
                          )}
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-right whitespace-nowrap">
                          <div className="font-black text-slate-900 dark:text-white">
                            {doc.amount.toLocaleString('fr-FR')} FCFA
                          </div>
                          <div className="text-[10px] text-slate-500">
                            HT : {doc.subtotalHt.toLocaleString('fr-FR')} FCFA
                          </div>
                          {doc.docKind === 'facture' && doc.withTva && (
                            <div className="text-[10px] font-bold text-amber-600">
                              TVA 18% : +{doc.tvaAmount.toLocaleString('fr-FR')} FCFA
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-center">
                          {doc.docKind === 'facture' && doc.rawSale ? (
                            isComptable ? (
                              <button
                                type="button"
                                disabled={generatingSaleId === doc.rawSale.id}
                                onClick={() => handleGenerateAndOpenSaleInvoice(doc.rawSale, doc.withTva)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs cursor-pointer whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {doc.invoiceGenerated ? 'Modifier / Imprimer' : 'Créer Facture'}
                                </span>
                              </button>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => onOpenDocument(doc.invoicePayload)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs cursor-pointer whitespace-nowrap"
                                  title="Voir et imprimer la facture (Lecture seule)"
                                >
                                  <Printer className="w-3.5 h-3.5 shrink-0" />
                                  <span>Voir / Imprimer</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openVendorRectificationModal(doc.rawSale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs cursor-pointer whitespace-nowrap"
                                  title="Signaler une erreur sur la facture et soumettre la Mini Facture Thermique comme preuve"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Rectifier</span>
                                </button>
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenDocument(doc.invoicePayload)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              <Printer className="w-3.5 h-3.5 shrink-0" />
                              <span>Imprimer Reçu</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Rapport "Bons cadeaux" pour le Comptable (valeur remise) */}
      {!isVendeur && activeTab === 'bons-cadeaux' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <strong>Rapport Comptable « Bons cadeaux » (Valeur remise) :</strong> Suivi financier des bons cadeaux semestriels remis en marchandises (sortie de stock de type « Bon cadeau » au prix de vente). <strong>Rien en espèces</strong> n&apos;est versé aux vendeurs.
            </div>
            <button
              type="button"
              onClick={handleExportBonsCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-[10px] font-bold uppercase text-slate-400">Total Valeur Remise (Marchandises)</div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {bonsCadeaux
                  .reduce((sum, b) => sum + Number(b.delivered_total || 0), 0)
                  .toLocaleString('fr-FR')}{' '}
                FCFA
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Sorties de stock de type « Bon cadeau » confirmées
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-[10px] font-bold uppercase text-slate-400">Bons Remis / Reçus</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {bonsCadeaux.filter((b) => b.status === 'Remis' || b.status === 'Reçu').length} / {bonsCadeaux.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Paniers préparés et remis par le Magasinier
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-[10px] font-bold uppercase text-slate-400">Mode de Règlement</div>
              <div className="text-base font-black text-[#008DA9] mt-1">
                Rien en espèces (100 % Produits FEFO)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Valorisé au prix de vente carton, plafonné au bon
              </div>
            </div>
          </div>

          {/* Mobile Cards View (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {bonsCadeaux.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {b.id.toUpperCase()}
                    </span>
                    <span className="ml-2 font-bold text-teal-700 dark:text-teal-400">{b.semester}</span>
                    <div className="font-semibold text-slate-900 dark:text-white mt-1">
                      {b.vendor_name} <span className="font-mono text-[10px] text-slate-400">({b.vendor_code})</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {Number(b.delivered_total || 0).toLocaleString('fr-FR')} FCFA
                    </div>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.status === 'Remis' || b.status === 'Reçu'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : b.status === 'À préparer'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Note</span>
                    <strong className="text-slate-800 dark:text-slate-200">{b.note_total}/20</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Plafond</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {b.amount !== undefined ? `${Number(b.amount).toLocaleString('fr-FR')} F` : 'Non révélé'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Panier</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {Number(b.basket_total || 0).toLocaleString('fr-FR')} F
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tablet & Desktop Table (>= 640px) */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-2.5 lg:px-4">Réf. &amp; Semestre</th>
                    <th className="py-3 px-2.5 lg:px-4">Vendeur</th>
                    <th className="py-3 px-2.5 lg:px-4 text-center">Note /20</th>
                    <th className="py-3 px-2.5 lg:px-4 text-right">Plafond / Panier</th>
                    <th className="py-3 px-2.5 lg:px-4 text-right">Valeur Remise</th>
                    <th className="py-3 px-2.5 lg:px-4 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bonsCadeaux.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Aucun bon cadeau enregistré pour ce semestre.
                      </td>
                    </tr>
                  ) : (
                    bonsCadeaux.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-2.5 lg:px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {b.id.toUpperCase()}
                          </div>
                          <div className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                            {b.semester}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 font-semibold text-slate-900 dark:text-white">
                          <div>{b.vendor_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{b.vendor_code}</div>
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-center font-black text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {b.note_total}/20
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            Plafond : {b.amount !== undefined ? `${Number(b.amount).toLocaleString('fr-FR')} FCFA` : 'Non révélé'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Panier : {Number(b.basket_total || 0).toLocaleString('fr-FR')} FCFA
                          </div>
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                          {Number(b.delivered_total || 0).toLocaleString('fr-FR')} FCFA
                        </td>
                        <td className="py-3 px-2.5 lg:px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              b.status === 'Remis' || b.status === 'Reçu'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : b.status === 'À préparer'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {b.status}
                          </span>
                          <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                            Rien en espèces
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Encaisser un versement (Comptable uniquement) */}
      {isComptable && showVersementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              Enregistrement Versement Vendeur (Caisse)
            </h2>
            <form onSubmit={handleRecordVersement} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Vendeur concerné</label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {balances.map((b) => (
                    <option key={b.vendorId} value={b.vendorId}>
                      {b.code} - {b.name} (Solde dû : {b.balanceDue.toLocaleString('fr-FR')} FCFA)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Montant versé (FCFA)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={versementAmount}
                  onChange={(e) => setVersementAmount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-base font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Mode de règlement</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Espèces">Espèces (Billetage)</option>
                  <option value="Orange Money">Orange Money Mali</option>
                  <option value="Moov Money">Moov Money Mali</option>
                  <option value="Chèque BDM">Chèque Bancaire (BDM-SA)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Notes / Réf. Quittance</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openInvoicingOnVersement}
                  onChange={(e) => setOpenInvoicingOnVersement(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#008DA9] focus:ring-[#008DA9]"
                />
                <span className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                  <strong>Générer les factures par vente PDV :</strong> Ouvrir les ventes du vendeur après validation pour générer chaque facture <strong>au nom du vendeur avec le PDV acheteur</strong> (avec option d&apos;ajout ou non de la <strong>TVA 18%</strong>).
                </span>
              </label>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowVersementModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold cursor-pointer"
                >
                  Valider le versement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Génération des Factures par Vente PDV (Suite à un Versement du Vendeur) */}
      {selectedVersementForInvoicing && (
        <div
          onClick={() => setSelectedVersementForInvoicing(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="w-5 h-5 text-[#008DA9]" />
                  <h3 className="text-sm sm:text-base font-black">
                    Génération des Factures par Vente PDV • Versement {selectedVersementForInvoicing.reference}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#008DA9] text-white">
                    1 Vente PDV = 1 Facture à part
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Vendeur : <strong>{selectedVersementForInvoicing.vendor_name} ({selectedVersementForInvoicing.vendor_code})</strong> • Versement : <strong>{Number(selectedVersementForInvoicing.amount || 0).toLocaleString('fr-FR')} FCFA</strong> ({selectedVersementForInvoicing.date})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVersementForInvoicing(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
                <span>Fermer</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
              {(() => {
                const vendorSalesList = sales.filter(
                  (s) =>
                    s.vendor_id === selectedVersementForInvoicing.vendor_id ||
                    s.vendor_code === selectedVersementForInvoicing.vendor_code
                );

                const applyTvaToAllVendorSales = (enableTva: boolean) => {
                  const updates: Record<string, boolean> = {};
                  vendorSalesList.forEach((s) => {
                    updates[s.id] = enableTva;
                  });
                  setSaleTvaMap((prev) => ({ ...prev, ...updates }));
                };

                return (
                  <>
                    <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/70 text-xs text-slate-700 dark:text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <strong>Facturation au nom du vendeur avec le PDV acheteur :</strong> Chaque vente réalisée par <strong>{selectedVersementForInvoicing.vendor_name}</strong> auprès de son PDV constitue une facture à part. Choisissez d&apos;ajouter ou non la <strong>TVA 18%</strong> avant de générer la facture.
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => applyTvaToAllVendorSales(false)}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          Tout Sans TVA (0%)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTvaToAllVendorSales(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Percent className="w-3 h-3" />
                          <span>Tout + TVA 18%</span>
                        </button>
                      </div>
                    </div>

                    {vendorSalesList.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        Aucune vente PDV enregistrée pour ce vendeur.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-bold text-[10px]">
                                <th className="py-3 px-3.5">Facture / Vente</th>
                                <th className="py-3 px-3.5">Date &amp; Heure</th>
                                <th className="py-3 px-3.5">Au nom du Vendeur</th>
                                <th className="py-3 px-3.5">PDV Acheteur</th>
                                <th className="py-3 px-3.5 text-center">Option TVA 18%</th>
                                <th className="py-3 px-3.5 text-right">Montant HT</th>
                                <th className="py-3 px-3.5 text-right">Total Facture</th>
                                <th className="py-3 px-3.5 text-center">Facture à part</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {vendorSalesList.map((s) => {
                                const withTva = isTvaEnabledForSale(s);
                                const subtotalHt = Number(s.total_amount || 0);
                                const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
                                const totalTtc = subtotalHt + tvaAmount;
                                const invNumber = s.invoice_number || String(s.number || '').replace(/^VTE-/, 'FAC-');

                                return (
                                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                    <td className="py-3 px-3.5">
                                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                                        {invNumber}
                                      </div>
                                      <div className="font-mono text-[10px] text-[#008DA9]">
                                        Vente : {s.number}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">
                                      <div className="font-semibold">{s.date}</div>
                                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-[#008DA9]" />
                                        <span>{s.sale_time || '10:30'}</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3.5">
                                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                        <User className="w-3 h-3 text-[#008DA9]" />
                                        <span>{s.vendor_name}</span>
                                      </div>
                                      <div className="font-mono text-[10px] text-teal-600">
                                        {s.vendor_code}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3.5">
                                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                        <Store className="w-3 h-3 text-emerald-600" />
                                        <span>{s.pdv_name}</span>
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {s.pdv_code ? `${s.pdv_code} • ` : ''}{s.pdv_neighborhood}
                                        {s.pdv_manager ? ` • Gérant: ${s.pdv_manager}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3.5 text-center">
                                      {isComptable ? (
                                        <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                                          <button
                                            type="button"
                                            onClick={() => toggleSaleTva(s.id, false)}
                                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                              !withTva
                                                ? 'bg-[#008DA9] text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-300'
                                            }`}
                                          >
                                            Sans TVA (0%)
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleSaleTva(s.id, true)}
                                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                              withTva
                                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                                : 'text-slate-600 dark:text-slate-300'
                                            }`}
                                          >
                                            + TVA 18%
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                          <Lock className="w-3 h-3" />
                                          <span>{Boolean(s.with_tva) ? 'TTC (TVA 18%)' : 'HT (Sans TVA)'}</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3.5 text-right font-semibold text-slate-700 dark:text-slate-300">
                                      {subtotalHt.toLocaleString('fr-FR')} FCFA
                                    </td>
                                    <td className="py-3 px-3.5 text-right">
                                      <div className="font-black text-slate-900 dark:text-white">
                                        {totalTtc.toLocaleString('fr-FR')} FCFA
                                      </div>
                                      {withTva ? (
                                        <div className="text-[10px] font-bold text-amber-600">
                                          TVA 18% : +{tvaAmount.toLocaleString('fr-FR')} FCFA
                                        </div>
                                      ) : (
                                        <div className="text-[10px] text-slate-400">
                                          HT (Sans TVA)
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 px-3.5 text-center">
                                      {isComptable ? (
                                        <button
                                          type="button"
                                          disabled={generatingSaleId === s.id}
                                          onClick={() =>
                                            handleGenerateAndOpenSaleInvoice(
                                              s,
                                              withTva,
                                              selectedVersementForInvoicing
                                            )
                                          }
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
                                        >
                                          <Printer className="w-3.5 h-3.5" />
                                          <span>Générer la facture</span>
                                        </button>
                                      ) : s.invoice_generated ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onOpenDocument(
                                                buildSaleInvoicePayload(
                                                  s,
                                                  Boolean(s.with_tva),
                                                  selectedVersementForInvoicing.reference
                                                )
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs cursor-pointer"
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                            <span>Imprimer</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedVersementForInvoicing(null);
                                              openVendorRectificationModal(s);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] cursor-pointer"
                                          >
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Rectifier</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-slate-400">
                                          En attente du Comptable
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
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL VENDEUR: Demander une rectification avec Mini Facture Thermique automatique en preuve */}
      {isVendeur && rectificationModalSale && (
        <div
          onClick={() => setRectificationModalSale(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl my-auto flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm sm:text-base font-black">
                    Demande de Rectification de Facture • Preuve par Mini Facture Thermique (80mm)
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Facture concernée :{' '}
                    <strong>
                      {rectificationModalSale.invoice_number ||
                        String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-')}
                    </strong>{' '}
                    • Vendeur : <strong>{currentUser?.name} ({currentUser?.code})</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRectificationModalSale(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitVendorRectification}
              className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs"
            >
              {/* Left 7 cols: Form & Selection of Mini Facture Thermique from Sales History */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 leading-snug">
                  <strong>Règle de preuve par Mini Facture Thermique :</strong> Le vendeur ne pouvant pas modifier lui-même une facture créée par le Comptable, votre demande de rectification joint automatiquement la <strong>Mini Facture Thermique (`TKT-THERM-...`)</strong> générée dans votre historique de ventes comme <strong>preuve officielle</strong> dans la notification envoyée au Comptable.
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Facture du Comptable à rectifier
                  </div>
                  <div className="font-black text-sm text-slate-900 dark:text-white">
                    {rectificationModalSale.invoice_number ||
                      String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-')}{' '}
                    — {rectificationModalSale.pdv_name} ({rectificationModalSale.pdv_neighborhood})
                  </div>
                  <div className="text-slate-500">
                    Montant facturé :{' '}
                    <strong className="text-[#008DA9]">
                      {Number(rectificationModalSale.total_amount || 0).toLocaleString('fr-FR')} FCFA
                    </strong>{' '}
                    ({rectificationModalSale.with_tva ? 'Avec TVA 18%' : 'Sans TVA'})
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Sélectionnez la Mini Facture Thermique de votre historique de ventes à joindre comme preuve *
                  </label>
                  <select
                    value={selectedProofSaleId}
                    onChange={(e) => setSelectedProofSaleId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs"
                  >
                    {visibleSales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {getThermalTicketNumber(s)} • Vente {s.number} du {s.date} à {s.sale_time || '10:30'} — {s.pdv_name} ({Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Expliquez l&apos;erreur constatée sur la facture (Motif de la rectification) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={rectificationReason}
                    onChange={(e) => setRectificationReason(e.target.value)}
                    placeholder="Ex: Erreur sur le nombre de cartons facturés ou sur l'application de la TVA 18%. Voir la Mini Facture Thermique ci-jointe en preuve..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRectificationModalSale(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRectification}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {isSubmittingRectification
                        ? 'Envoi en cours...'
                        : 'Envoyer la Demande avec Mini Facture Thermique en Preuve'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Right 5 cols: Live Preview of the Auto-Generated Mini Facture Thermique (80mm) attached as Proof */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full max-w-[320px] rounded-xl bg-white p-4 border-2 border-dashed border-slate-300 font-mono text-[11px] text-slate-950 space-y-2.5 shadow-md">
                  <div className="text-center border-b border-dashed border-slate-300 pb-2">
                    <div className="text-xs font-black uppercase text-slate-950">BAOBAB DISTRIBUTION</div>
                    <div className="text-[9px] text-slate-600">Bennor &amp; Safie • Sotuba, Bamako</div>
                    <div className="mt-1 inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-[9px] font-black uppercase">
                      MINI FACTURE THERMIQUE (PREUVE)
                    </div>
                  </div>

                  {selectedProofSaleObj && (
                    <>
                      <div className="space-y-0.5 text-[10px] border-b border-dashed border-slate-300 pb-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">N° Ticket :</span>
                          <span className="font-black text-slate-950">{getThermalTicketNumber(selectedProofSaleObj)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">N° Vente :</span>
                          <span className="font-bold text-slate-950">{selectedProofSaleObj.number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Date &amp; Heure :</span>
                          <span className="font-bold text-slate-950">
                            {selectedProofSaleObj.date} à {selectedProofSaleObj.sale_time || '10:30'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Vendeur :</span>
                          <span className="font-bold text-slate-950">{selectedProofSaleObj.vendor_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">PDV Client :</span>
                          <span className="font-bold text-slate-950 truncate max-w-[160px]">{selectedProofSaleObj.pdv_name}</span>
                        </div>
                      </div>

                      <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                        <div className="text-[9px] font-black uppercase text-slate-500">
                          Articles livrés (Preuve de vente)
                        </div>
                        {(selectedProofSaleObj.items || []).map((it: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[10px]">
                            <span>
                              {it.qtyBoxes ?? it.qty}x {it.name}
                            </span>
                            <span className="font-bold">
                              {Number(it.total || 0).toLocaleString('fr-FR')} F
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-xs font-black pt-1">
                        <span>TOTAL VENTE CERTIFIÉ :</span>
                        <span className="text-[#008DA9]">
                          {Number(selectedProofSaleObj.total_amount || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL COMPTABLE: Créer une Facture pour un Vendeur */}
      {isComptable && showCreateInvoiceModal && (
        <div
          onClick={() => setShowCreateInvoiceModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#008DA9]" />
                <div>
                  <h3 className="text-sm sm:text-base font-black">
                    Créer une Facture Officielle pour un Vendeur
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Seul le Comptable est autorisé à créer les factures • Visible &amp; imprimable par le vendeur
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInvoiceModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleComptableCreateInvoiceSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateInvoiceMode('existing_sale')}
                  className={`py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                    createInvoiceMode === 'existing_sale'
                      ? 'bg-[#008DA9] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  À partir d&apos;une vente du vendeur
                </button>
                <button
                  type="button"
                  onClick={() => setCreateInvoiceMode('new_invoice')}
                  className={`py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                    createInvoiceMode === 'new_invoice'
                      ? 'bg-[#008DA9] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Nouvelle facture directe Vendeur + PDV
                </button>
              </div>

              {createInvoiceMode === 'existing_sale' ? (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Sélectionner la vente réalisée par le vendeur *
                  </label>
                  <select
                    required
                    value={selectedSaleIdForNewInvoice}
                    onChange={(e) => setSelectedSaleIdForNewInvoice(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                  >
                    {sales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.invoice_generated ? '[Facturée] ' : '[À facturer] '}
                        {s.number} • {s.vendor_name} ({s.vendor_code}) → {s.pdv_name} ({Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Vendeur titulaire de la facture *
                    </label>
                    <select
                      value={newInvoiceVendorId}
                      onChange={(e) => setNewInvoiceVendorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      {balances.map((b) => (
                        <option key={b.vendorId} value={b.vendorId}>
                          {b.code} — {b.name} ({b.team})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Point de Vente (PDV Acheteur) *
                    </label>
                    <select
                      value={newInvoicePdvId}
                      onChange={(e) => setNewInvoicePdvId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      {pdvs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.neighborhood}) — Gérant : {p.manager_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                        Produit facturé *
                      </label>
                      <select
                        value={newInvoiceProductId}
                        onChange={(e) => setNewInvoiceProductId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                      >
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.code} — {prod.name} ({Number(prod.price_box || 0).toLocaleString('fr-FR')} FCFA)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                        Cartons *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newInvoiceQtyBoxes}
                        onChange={(e) => setNewInvoiceQtyBoxes(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">Option TVA 18%</div>
                  <div className="text-[11px] text-slate-500">
                    Choisissez d&apos;ajouter ou non la TVA 18% sur cette facture vendeur
                  </div>
                </div>
                <div className="inline-flex items-center rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setNewInvoiceWithTva(false)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                      !newInvoiceWithTva ? 'bg-[#008DA9] text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Sans TVA (0%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewInvoiceWithTva(true)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                      newInvoiceWithTva ? 'bg-amber-500 text-slate-950' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    + TVA 18%
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInvoiceModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInvoiceForVendor}
                  className="px-5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isCreatingInvoiceForVendor ? 'Création...' : 'Créer la Facture & Notifier le Vendeur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

