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
  Pencil,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { InvoiceData, InvoiceItem } from './PrintableDocument';
import { UserSession } from './LoginScreen';
import { buildMiniThermalReceiptDoc, getThermalTicketNumber } from './VentesView';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { exportTableToCsv } from '../utils/csvExport';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { DataTable } from './DataTable';
import { ExportViewButton } from './ExtractionsView';
import {
  PaymentMethodSelector,
  FORM_FIELD_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FORM_LABEL_CLASS,
  FORM_ROW_CLASS,
  FORM_GROUP_CLASS,
} from './FormControls';

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
  const isAdmin = currentRole === 'Administrateur';
  const isComptable = currentRole === 'Comptable' || isAdmin;
  const isVendeur = currentRole === 'Vendeur';

  const [activeTab, setActiveTab] = useState<'soldes' | 'versements' | 'factures' | 'bons-cadeaux'>(() => {
    if (initialTab === 'versements' || initialTab === 'versements-lecture' || initialTab === 'mes-versements' || initialTab === 'caisse') {
      return 'versements';
    }
    if (initialTab === 'factures' || initialTab === 'mes-factures') {
      return 'factures';
    }
    if (initialTab === 'rapports') {
      return 'bons-cadeaux';
    }
    return 'soldes';
  });

  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'facture' | 'recu'>('all');
  const [facturesPage, setFacturesPage] = useState<number>(1);
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
    } else if (initialTab === 'factures' || initialTab === 'mes-factures') {
      setActiveTab('factures');
    } else if (initialTab === 'rapports') {
      setActiveTab('bons-cadeaux');
    } else if (initialTab === 'soldes-vendeurs' || initialTab === 'mon-solde') {
      setActiveTab('soldes');
    }
  }, [initialTab]);

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

    // Parse items safely whether string, array, or null
    let rawItems: any[] = [];
    if (typeof sale.items === 'string') {
      try {
        rawItems = JSON.parse(sale.items);
      } catch {
        rawItems = [];
      }
    } else if (Array.isArray(sale.items)) {
      rawItems = sale.items;
    }

    const items: InvoiceItem[] =
      rawItems.length > 0
        ? rawItems.map((it: any) => ({
            code: it.code || 'ART-GEN',
            name: it.name || 'Produit Baobab',
            qty: Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1),
            price: Number(it.unitPrice ?? it.price ?? 0),
            total: Number(
              it.total ??
                Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1) *
                  Number(it.unitPrice ?? it.price ?? 0)
            ),
          }))
        : [
            {
              code: 'PROD-DIST',
              name: `Vente de marchandises - ${sale.pdv_name || 'PDV Partenaire'}`,
              qty: 1,
              price: subtotalHt,
              total: subtotalHt,
            },
          ];

    return {
      id: sale.id,
      number: invoiceNum,
      saleNumber: sale.number,
      saleTime: sale.sale_time || '10:30',
      type: 'facture',
      date: sale.date,
      clientName: `${sale.pdv_name || 'PDV Client'} (${sale.pdv_neighborhood || 'Bamako'})`,
      clientPhone: sale.pdv_phone || '+223 76 00 00 00',
      vendorName: sale.vendor_name || 'Vendeur Baobab',
      vendorCode: sale.vendor_code || 'BAO-VND',
      vendorTeam: sale.vendor_team || 'Zone Commerciale Bamako',
      vendorPhone: sale.vendor_phone || '+223 75 44 22 11',
      pdvName: sale.pdv_name || 'PDV Client',
      pdvCode: sale.pdv_code || '',
      pdvNeighborhood: sale.pdv_neighborhood || 'Bamako',
      pdvManager: sale.pdv_manager || '',
      pdvPhone: sale.pdv_phone || '+223 76 00 00 00',
      versementRef: versementRef || sale.versement_reference,
      withTva,
      subtotalHt,
      tvaRate: withTva ? 18 : 0,
      tvaAmount,
      totalTtc,
      items,
      total: totalTtc,
      paymentMethod: sale.payment_type || 'Comptant (Versement)',
      cashierName: `${sale.vendor_name || 'Vendeur'} (${sale.vendor_code || 'BAO-VND'})`,
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
  const [invoicingModalView, setInvoicingModalView] = useState<'cards' | 'table'>('cards');

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

  const openInvoiceGenerationModalForSale = (saleObj: any, currentWithTva: boolean) => {
    if (!saleObj) return;
    setCreateInvoiceMode('existing_sale');
    setSelectedSaleIdForNewInvoice(saleObj.id);
    setNewInvoiceWithTva(Boolean(currentWithTva));
    setShowCreateInvoiceModal(true);
  };

  const handleComptableCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComptable) return;
    setIsCreatingInvoiceForVendor(true);
    try {
      if (createInvoiceMode === 'existing_sale') {
        const saleObj = sales.find((s) => s.id === selectedSaleIdForNewInvoice);
        if (!saleObj) return;
        toggleSaleTva(saleObj.id, newInvoiceWithTva);
        await handleGenerateAndOpenSaleInvoice(saleObj, newInvoiceWithTva);
        setShowCreateInvoiceModal(false);
        setComptaFeedbackBanner({
          type: 'success',
          text: `Facture générée/mise à jour avec succès pour le vendeur ${saleObj.vendor_name} (${saleObj.pdv_name}). Le vendeur peut désormais la consulter et l'imprimer dans son compte.`,
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

  const FACTURES_PAGE_SIZE = 20;
  const totalFacturesPages = Math.max(
    1,
    Math.ceil(filteredPrintableDocs.length / FACTURES_PAGE_SIZE)
  );
  const safeFacturesPage = Math.min(Math.max(1, facturesPage), totalFacturesPages);
  const paginatedPrintableDocs = useMemo(() => {
    const start = (safeFacturesPage - 1) * FACTURES_PAGE_SIZE;
    return filteredPrintableDocs.slice(start, start + FACTURES_PAGE_SIZE);
  }, [filteredPrintableDocs, safeFacturesPage]);

  useEffect(() => {
    setFacturesPage(1);
  }, [docTypeFilter]);

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

  const handleExportComptaCsv = (targetTab = activeTab) => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (targetTab === 'soldes') {
      exportTableToCsv({
        filename: `soldes_ventes_vendeurs_${todayStr}.csv`,
        columns: [
          'Code Vendeur',
          'Nom Vendeur',
          'Telephone',
          'Equipe',
          'Ventes Realisees (FCFA)',
          'Versements Valides (FCFA)',
          'Solde Restant Du (FCFA)',
          'Valeur Stock Camionnette (FCFA)',
        ],
        rows: visibleBalances.map((b) => [
          b.code,
          b.name,
          b.phone || '',
          b.team || 'Equipe Standard',
          Number(b.totalSales || 0),
          Number(b.totalVersements || 0),
          Number(b.balanceDue || 0),
          Number(b.stockVanValue || 0),
        ]),
      });
      return;
    }

    if (targetTab === 'versements') {
      exportTableToCsv({
        filename: `journal_versements_caisse_${todayStr}.csv`,
        columns: [
          'Reference Versement',
          'Date',
          'Nom Vendeur',
          'Code Vendeur',
          'Equipe',
          'Mode de Reglement',
          'Motif / Notes',
          'Statut Validation',
          'Montant Encaisse (FCFA)',
        ],
        rows: visibleVersements.map((v) => [
          v.reference || v.id,
          v.date || '',
          v.vendor_name || '',
          v.vendor_code || '',
          v.vendor_team || 'Equipe Commerciale',
          v.payment_mode || 'Especes',
          v.notes || 'Versement de caisse des ventes PDV',
          v.status === 'en_attente' ? 'En attente' : 'Valide en Caisse',
          Number(v.amount || 0),
        ]),
      });
      return;
    }

    if (targetTab === 'factures') {
      exportTableToCsv({
        filename: `factures_recus_baobab_${todayStr}.csv`,
        columns: [
          'N° Document',
          'Type Document',
          'N° Vente Liee',
          'Date',
          'Client PDV / Contrepartie',
          'Vendeur',
          'Mode de Reglement',
          'Montant HT (FCFA)',
          'TVA 18% (FCFA)',
          'Montant TTC (FCFA)',
        ],
        rows: filteredPrintableDocs.map((d) => [
          d.number,
          d.docKind === 'facture' ? 'Facture Vente' : 'Recu Caisse',
          d.saleNumber || '',
          d.date || '',
          d.counterparty || '',
          d.vendorLabel || '',
          d.paymentMode || '',
          Number(d.subtotalHt || 0),
          Number(d.tvaAmount || 0),
          Number(d.amount || 0),
        ]),
      });
      return;
    }

    exportTableToCsv({
      filename: `rapport_bons_cadeaux_${todayStr}.csv`,
      columns: [
        'Reference Bon',
        'Semestre',
        'Nom Vendeur',
        'Code Vendeur',
        'Note /20',
        'Plafond Bon (FCFA)',
        'Valeur Remise (FCFA)',
        'Statut',
      ],
      rows: bonsCadeaux.map((b) => [
        b.id,
        b.semester || '',
        b.vendor_name || '',
        b.vendor_code || '',
        b.note_total ?? '',
        Number(b.amount || 0),
        Number(b.delivered_total || b.basket_total || 0),
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
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isAdmin
                ? 'Comptabilité, Caisse, Versements & Factures'
                : isVendeur
                ? 'Mon Solde, Mes Versements & Mes Factures'
                : 'Comptabilité, Caisse & Dépôt-Vente'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-white">
              {isAdmin ? 'Administrateur' : isVendeur ? 'Vendeur' : 'Comptable'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isVendeur
                ? 'Votre solde, vos versements et vos factures.'
                : 'Caisse : versements, soldes et factures.'}
            </p>
            <InfoTooltip
              text={
                isAdmin
                  ? 'Suivi des soldes vendeurs en dépôt-vente, validation des encaissements, création et rectification des factures et reçus officiels.'
                  : isVendeur
                  ? 'Consultez uniquement votre solde dépôt-vente personnel, votre journal de versements de caisse et vos propres factures et reçus imprimables.'
                  : 'Suivi des soldes des vendeurs en dépôt-vente (ventes réalisées - versements reçus), encaissements et factures officielles.'
              }
            />
          </div>
        </div>

        {/* Uniquement le Comptable peut faire l'encaissement et créer des factures */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isVendeur && (
            <>
              <ExportViewButton
                currentUser={currentUser}
                jeu={
                  activeTab === 'soldes' || initialTab === 'soldes-vendeurs'
                    ? 'soldes_vendeurs'
                    : activeTab === 'factures'
                    ? 'factures'
                    : initialTab === 'caisse'
                    ? 'caisse'
                    : activeTab === 'bons-cadeaux'
                    ? 'bons_cadeaux'
                    : 'versements'
                }
                label="Exporter"
              />

              <button
                type="button"
                onClick={handleExportComptaPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-sm transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                <span>Exporter Tableau en PDF</span>
              </button>
            </>
          )}

          {isComptable ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const uninvoiced = sales.find((s) => !s.invoice_generated) || sales[0];
                  setSelectedSaleIdForNewInvoice(uninvoiced?.id || '');
                  setShowCreateInvoiceModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-sm transition cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                <span>Créer Facture Vendeur</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVersementModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-sm transition cursor-pointer"
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
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isVendeur ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-4`}>
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
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>
                <strong>Dépôt-vente :</strong> Solde = Ventes réalisées - Versements reçus.
              </span>
              <InfoTooltip
                text={
                  isVendeur
                    ? `Vous visualisez uniquement votre propre solde dépôt-vente (${currentUser?.name}). Les soldes des autres vendeurs sont masqués.`
                    : "Chaque vendeur charge son véhicule sans payer le stock à l'avance. À chaque livraison au point de vente, la vente est enregistrée à son crédit. Ses versements à la caisse réduisent son solde dû."
                }
              />
            </div>
            {isVendeur && currentUser && (
              <span className="px-2.5 py-1 rounded-lg bg-[var(--marque-fonce)] text-white font-bold shrink-0">
                Vendeur
              </span>
            )}
          </div>

          {/* Soldes Vendeurs — Composant partagé DataTable (7 colonnes => 1re colonne collante) */}
          <DataTable<VendorBalance>
            data={visibleBalances}
            getRowKey={(b) => b.vendorId}
            emptyMessage="Aucun vendeur trouvé."
            mobileTitle={(b) => `${b.name} (${b.code})`}
            mobileSubtitle={(b) => `${b.team || 'Équipe Standard'} • ${b.phone}`}
            mobileStatusBadge={(b) => (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  b.balanceDue > 0
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                }`}
              >
                {b.balanceDue > 0 ? 'Solde dû' : 'À jour'}
              </span>
            )}
            columns={[
              {
                key: 'code',
                label: 'Code Vendeur',
                hideOnMobileCard: true,
                render: (b) => (
                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                    {b.code}
                  </span>
                ),
                footer: <span className="uppercase text-[11px]">Totaux</span>,
              },
              {
                key: 'name',
                label: 'Nom & Contact',
                hideOnMobileCard: true,
                render: (b) => (
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{b.name}</div>
                    <div className="text-[10px] text-slate-400">{b.phone}</div>
                  </div>
                ),
              },
              {
                key: 'team',
                label: 'Équipe',
                isSecondary: true,
                hideOnMobileCard: true,
                render: (b) => (
                  <span className="text-slate-600 dark:text-slate-300 font-medium">
                    {b.team || 'Équipe Standard'}
                  </span>
                ),
              },
              {
                key: 'sales',
                label: 'Ventes Réalisées',
                align: 'right',
                isNumeric: true,
                render: (b) => (
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                    {b.totalSales.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span>
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalSales || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'versements',
                label: 'Versements Validés',
                align: 'right',
                isNumeric: true,
                render: (b) => (
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {b.totalVersements.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalVersements || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'balanceDue',
                label: 'Solde Restant Dû',
                align: 'right',
                isNumeric: true,
                render: (b) => (
                  <span className="font-black text-amber-600 dark:text-amber-400 text-sm">
                    {b.balanceDue.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span className="text-amber-600 dark:text-amber-400">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.balanceDue || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'stockVan',
                label: 'Stock Camionnette (3-7j)',
                align: 'right',
                isNumeric: true,
                isSecondary: true,
                render: (b) => (
                  <span className="text-slate-500 font-medium">
                    {b.stockVanValue.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span>
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.stockVanValue || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
            ]}
            totalsFooter={
              <>
                <span>
                  Vendeurs :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleBalances.length}
                  </strong>
                </span>
                <span>
                  Total Ventes :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalSales || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total Versements :{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalVersements || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total Solde Dû :{' '}
                  <strong className="text-amber-600 dark:text-amber-400">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.balanceDue || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* 2. Journal des Versements de Caisse */}
      {activeTab === 'versements' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">Journal des Versements de Caisse :</strong>{' '}
              {visibleVersements.length} versement(s) enregistré(s) pour un total de{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {visibleVersements.reduce((acc, v) => acc + Number(v.amount || 0), 0).toLocaleString('fr-FR')} FCFA
              </strong>
              .
            </div>
            {!isVendeur && (
              <div className="flex items-center gap-2 shrink-0">
                <ExportViewButton
                  currentUser={currentUser}
                  jeu="versements"
                  label="Exporter Versements"
                />
              </div>
            )}
          </div>

          {isComptable && (
            <div className="p-3.5 rounded-2xl bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/80 text-xs text-slate-700 dark:text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span>
                  <strong className="text-[#008DA9] dark:text-cyan-300">Facturation PDV :</strong> 1 vente PDV = 1 facture (avec ou sans TVA).
                </span>
                <InfoTooltip text="Lorsque le vendeur effectue un versement, vous pouvez générer la facture au nom du vendeur avec le PDV acheteur et choisir d'ajouter ou non la TVA 18%. Chaque vente réalisée par le vendeur auprès de son PDV constitue une facture à part." />
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

          {/* Journal des Versements — Composant partagé DataTable */}
          <DataTable<any>
            data={visibleVersements}
            getRowKey={(v) => v.id}
            emptyMessage="Aucun versement de caisse enregistré pour ce compte."
            mobileTitle={(v) => v.reference}
            mobileSubtitle={(v) => `${v.date} • ${v.vendor_name} (${v.vendor_code})`}
            mobileStatusBadge={() => (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="w-2.5 h-2.5" /> Validé
              </span>
            )}
            columns={[
              {
                key: 'ref',
                label: 'Réf. & Date',
                hideOnMobileCard: true,
                render: (v) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {v.reference}
                    </div>
                    <div className="text-[11px] text-slate-400">{v.date}</div>
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Total encaissé</span>,
              },
              {
                key: 'vendor',
                label: 'Vendeur & Équipe',
                render: (v) => (
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                      {v.vendor_name}{' '}
                      <span className="font-mono text-[11px] text-slate-500">
                        ({v.vendor_code})
                      </span>
                    </div>
                    <div className="text-[10px] text-teal-600 dark:text-teal-400">
                      {v.vendor_team}
                    </div>
                  </div>
                ),
              },
              {
                key: 'payment_mode',
                label: 'Mode de Règlement',
                render: (v) => (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                    {v.payment_mode}
                  </span>
                ),
              },
              {
                key: 'notes',
                label: 'Motif / Quittance',
                isSecondary: true,
                render: (v) => (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {v.notes || 'Versement de caisse'}
                  </span>
                ),
              },
              {
                key: 'amount',
                label: 'Montant Encaissé',
                align: 'right',
                isNumeric: true,
                render: (v) => (
                  <span className="font-black text-emerald-600 dark:text-emerald-400">
                    {Number(v.amount || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {visibleVersements
                      .reduce((acc, v) => acc + Number(v.amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Validation',
                align: 'center',
                hideOnMobileCard: true,
                render: () => (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Validé en Caisse</span>
                  </span>
                ),
              },
            ]}
            renderActions={(v) => {
              const vendorSalesForVersement = sales.filter(
                (s) => s.vendor_id === v.vendor_id || s.vendor_code === v.vendor_code
              );
              return (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedVersementForInvoicing(v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-[11px] shadow-xs transition cursor-pointer"
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
                            name:
                              v.notes ||
                              'Versement de caisse des ventes PDV (Dépôt-Vente)',
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[11px] cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span>Reçu</span>
                  </button>
                </>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Nombre de versements :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleVersements.length}
                  </strong>
                </span>
                <span>
                  Total encaissé :{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {visibleVersements
                      .reduce((acc, v) => acc + Number(v.amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* 3. Factures & Reçus Imprimables */}
      {activeTab === 'factures' && (
        <div className="space-y-4">
          {/* Autorisation & Règles Banner */}
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#008DA9] shrink-0" />
                <span>
                  {isVendeur
                    ? 'Vos Factures Officielles (Lecture seule & Impression)'
                    : 'Création & Gestion des Factures Vendeurs'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <p>
                  {isVendeur
                    ? 'Consultez, imprimez ou demandez une rectification.'
                    : 'Création des factures vendeurs avec ou sans TVA 18 %.'}
                </p>
                <InfoTooltip
                  text={
                    isVendeur
                      ? "Le vendeur ne peut pas créer ni modifier de factures : seul le Comptable y est autorisé. Vous pouvez voir et imprimer vos factures ci-dessous. S'il y a une erreur sur une facture, cliquez sur « Demander une rectification » pour joindre votre Mini Facture Thermique automatique comme preuve."
                      : 'Seul le Comptable est autorisé à créer les factures au nom du vendeur avec le PDV acheteur (avec ou sans TVA 18 %). Dès création, la facture apparaît dans le compte du vendeur en lecture seule.'
                  }
                />
              </div>
            </div>
            {isComptable ? (
              <button
                type="button"
                onClick={() => {
                  const uninvoiced = sales.find((s) => !s.invoice_generated) || sales[0];
                  setCreateInvoiceMode('existing_sale');
                  setSelectedSaleIdForNewInvoice(uninvoiced?.id || '');
                  setNewInvoiceWithTva(uninvoiced ? isTvaEnabledForSale(uninvoiced) : false);
                  setShowCreateInvoiceModal(true);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-5 rounded-[12px] bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm shadow-xs shrink-0 whitespace-nowrap cursor-pointer transition"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Générer la facture</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-bold text-[11px] shrink-0 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Lecture seule • Non modifiable</span>
              </span>
            )}
          </div>

          {/* Section Demandes de Rectification (Comptable: traiter avec preuve thermique | Vendeur: suivi de ses demandes) */}
          {rectifications.length > 0 && (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
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
                          <span className="font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                            Facture : {rect.invoice_number}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-[#008DA9] whitespace-nowrap">
                            Vente : {rect.sale_number}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 font-mono font-bold text-[10px] whitespace-nowrap">
                            Preuve : {rect.thermal_ticket_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${
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
                          className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          <Receipt className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">Voir Mini Facture Thermique (Preuve)</span>
                        </button>

                        {isComptable && isPending && (
                          <>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', false)}
                              className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span className="whitespace-nowrap">Rectifier Facture (HT)</span>
                            </button>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', true)}
                              className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <Percent className="w-4 h-4 shrink-0" />
                              <span className="whitespace-nowrap">Rectifier (+ TVA 18 %)</span>
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

          {/* Description + Onglets sur une seule ligne défilable horizontalement (compteurs en nombre seul) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {isVendeur && currentUser ? (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Factures créées pour vous par le Comptable (<strong>{invoicedOrEditableSales.length}</strong>) et vos reçus de versement (<strong>{visibleVersements.length}</strong>).
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Factures individuelles par vente (au nom du vendeur avec le PDV acheteur, option TVA 18 %) et reçus de caisse.
              </div>
            )}

            <div
              role="tablist"
              aria-label="Filtres Factures et Reçus"
              className="flex items-center gap-2 flex-nowrap overflow-x-auto max-w-full pb-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'all'}
                onClick={() => setDocTypeFilter('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  docTypeFilter === 'all'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span className="whitespace-nowrap">Tous ({printableDocuments.length})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'facture'}
                onClick={() => setDocTypeFilter('facture')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  docTypeFilter === 'facture'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  Factures par Vente PDV ({invoicedOrEditableSales.length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'recu'}
                onClick={() => setDocTypeFilter('recu')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  docTypeFilter === 'recu'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  Reçus Versements ({visibleVersements.length})
                </span>
              </button>
            </div>
          </div>

          {filteredPrintableDocs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucune facture ni reçu à afficher pour ce filtre.
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. TABLETTE PORTRAIT ET MOBILE (< 1024 px) : Cartes empilées pleine largeur */}
              <div className="lg:hidden space-y-3.5">
                {paginatedPrintableDocs.map((doc) => {
                  const isFacture = doc.docKind === 'facture';
                  const isPaid =
                    !isFacture ||
                    doc.invoiceGenerated ||
                    String(doc.paymentMode || '').toLowerCase().includes('comptant');

                  return (
                    <article
                      key={doc.id}
                      className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
                    >
                      {/* Ligne 1 : numéro de facture (sur UNE ligne, police des codes, taille réduite si besoin, jamais coupé) à gauche, date à droite */}
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap text-[clamp(11px,3.2vw,14px)] leading-tight">
                          {doc.number}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                          {doc.date}
                          {doc.saleTime ? ` • ${doc.saleTime}` : ''}
                        </span>
                      </div>

                      {/* Ligne 2 : vendeur (nom et code) puis PDV acheteur et gérant */}
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-slate-900 dark:text-white">
                          Vendeur : {doc.vendorLabel}
                        </div>
                        <div className="text-slate-700 dark:text-slate-300">
                          <span className="font-semibold">
                            {isFacture ? 'PDV acheteur :' : 'Contrepartie :'} {doc.counterparty}
                          </span>
                          {doc.pdvManager ? ` • Gérant : ${doc.pdvManager}` : ''}
                        </div>
                        {doc.saleNumber && (
                          <div className="font-mono text-[11px] text-[#008DA9]">
                            Vente : {doc.saleNumber}
                          </div>
                        )}
                      </div>

                      {/* Ligne 3 : badge de régime TVA ("Sans TVA" gris, "TVA 18 %" marron texte blanc) et montants : "HT", "TVA", "Total" chacun sur sa ligne, montant à droite en nowrap, Total en gras */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Régime TVA
                          </span>
                          {isFacture ? (
                            doc.withTva ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#92400E] text-white whitespace-nowrap">
                                TVA 18 %
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 whitespace-nowrap">
                                Sans TVA
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 whitespace-nowrap">
                              Sans TVA
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-400">HT</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {Number(doc.subtotalHt || 0).toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-400">TVA</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {Number(doc.tvaAmount || 0).toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-sm">
                            <span className="font-bold text-slate-900 dark:text-white">Total</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {Number(doc.amount || 0).toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ligne 4 : statut (Créée, Payée…) en badge */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Statut
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isFacture ? (
                            <>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
                                  doc.invoiceGenerated
                                    ? 'bg-[#15803D] text-white'
                                    : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {doc.invoiceGenerated ? 'Créée' : 'À générer'}
                              </span>
                              {isPaid && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 whitespace-nowrap">
                                  Payée
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#15803D] text-white whitespace-nowrap">
                              Payée • Reçu Caisse
                            </span>
                          )}

                          {doc.rectificationStatus === 'en_attente' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#92400E] text-white whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Rectification demandée</span>
                            </span>
                          )}
                          {doc.rectificationStatus === 'rectifiee' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#15803D] text-white whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>Rectifiée</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dernière ligne : boutons d'action côte à côte, libellé complet sur une seule ligne et icône, 48 px de haut, flex-wrap */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        {isFacture && doc.rawSale ? (
                          isComptable ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openInvoiceGenerationModalForSale(doc.rawSale, doc.withTva)
                                }
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                              >
                                <Pencil className="w-4 h-4 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                                <span className="whitespace-nowrap">Modifier</span>
                              </button>
                              <button
                                type="button"
                                disabled={generatingSaleId === doc.rawSale.id}
                                onClick={() =>
                                  handleGenerateAndOpenSaleInvoice(doc.rawSale, doc.withTva)
                                }
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                              >
                                <Printer className="w-4 h-4 shrink-0" />
                                <span className="whitespace-nowrap">Imprimer</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {isVendeur && (
                                <button
                                  type="button"
                                  onClick={() => openVendorRectificationModal(doc.rawSale)}
                                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                                >
                                  <Pencil className="w-4 h-4 shrink-0" />
                                  <span className="whitespace-nowrap">Modifier</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenDocument(doc.invoicePayload)}
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                              >
                                <Printer className="w-4 h-4 shrink-0" />
                                <span className="whitespace-nowrap">Imprimer</span>
                              </button>
                            </>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenDocument(doc.invoicePayload)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">Imprimer le reçu</span>
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* 2. TABLETTE EN PAYSAGE ET PC (>= 1024 px) : Tableau normal dans un conteneur à overflow-x auto */}
              <div className="hidden lg:block w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="w-full max-w-full overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-3.5 px-4 font-bold whitespace-nowrap min-w-[185px]">
                          N° Facture &amp; Date
                        </th>
                        <th className="py-3.5 px-4 font-bold whitespace-nowrap min-w-[240px]">
                          Vendeur &amp; PDV Acheteur
                        </th>
                        <th
                          className="py-3.5 px-4 font-bold text-center whitespace-nowrap min-w-[140px]"
                          style={{ minWidth: '140px' }}
                        >
                          Régime TVA
                        </th>
                        <th className="py-3.5 px-4 font-bold text-right whitespace-nowrap min-w-[195px]">
                          Montants (HT / TVA / Total)
                        </th>
                        <th
                          className="py-3.5 px-4 font-bold text-right whitespace-nowrap min-w-[220px]"
                          style={{ minWidth: '220px' }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedPrintableDocs.map((doc) => {
                        const isFacture = doc.docKind === 'facture';
                        const isPaid =
                          !isFacture ||
                          doc.invoiceGenerated ||
                          String(doc.paymentMode || '').toLowerCase().includes('comptant');

                        return (
                          <tr
                            key={doc.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            {/* Col 1 : N° Facture nowrap + Date + Statut */}
                            <td className="py-3.5 px-4 align-middle min-w-[185px]">
                              <div className="font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                {doc.number}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap mt-0.5">
                                {doc.date}
                                {doc.saleTime ? ` à ${doc.saleTime}` : ''}
                              </div>
                              {doc.saleNumber && (
                                <div className="font-mono text-[10px] text-[#008DA9] whitespace-nowrap">
                                  Vente : {doc.saleNumber}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                {isFacture ? (
                                  <>
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                                        doc.invoiceGenerated
                                          ? 'bg-[#15803D] text-white'
                                          : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {doc.invoiceGenerated ? 'Créée' : 'À générer'}
                                    </span>
                                    {isPaid && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 whitespace-nowrap">
                                        Payée
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#15803D] text-white whitespace-nowrap">
                                    Payée • Reçu Caisse
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Col 2 : Vendeur & PDV Acheteur */}
                            <td className="py-3.5 px-4 align-middle min-w-[240px]">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {doc.vendorLabel}
                              </div>
                              <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                                {doc.counterparty}
                              </div>
                              {doc.pdvManager && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {doc.pdvCode ? `${doc.pdvCode} • ` : ''}Gérant : {doc.pdvManager}
                                </div>
                              )}
                            </td>

                            {/* Col 3 : Régime TVA (140 px minimum) */}
                            <td
                              className="py-3.5 px-4 align-middle text-center min-w-[140px]"
                              style={{ minWidth: '140px' }}
                            >
                              {isFacture && doc.withTva ? (
                                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-[#92400E] text-white whitespace-nowrap">
                                  TVA 18 %
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  Sans TVA
                                </span>
                              )}
                            </td>

                            {/* Col 4 : Montants HT / TVA / Total (chacun sur sa ligne, montant à droite en nowrap, Total en gras) */}
                            <td className="py-3.5 px-4 align-middle min-w-[195px]">
                              <div className="space-y-1 max-w-[210px] ml-auto">
                                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                                  <span className="whitespace-nowrap">HT</span>
                                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                    {Number(doc.subtotalHt || 0).toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                                  <span className="whitespace-nowrap">TVA</span>
                                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                    {Number(doc.tvaAmount || 0).toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-900 dark:text-white pt-0.5 border-t border-slate-100 dark:border-slate-800">
                                  <span className="whitespace-nowrap">Total</span>
                                  <span className="font-mono font-bold whitespace-nowrap">
                                    {Number(doc.amount || 0).toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Col 5 : Actions (min-w 220px, boutons sur une ligne) */}
                            <td
                              className="py-3.5 px-4 align-middle text-right min-w-[220px]"
                              style={{ minWidth: '220px' }}
                            >
                              <div className="flex items-center justify-end gap-2 flex-nowrap whitespace-nowrap">
                                {isFacture && doc.rawSale ? (
                                  isComptable ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openInvoiceGenerationModalForSale(
                                            doc.rawSale,
                                            doc.withTva
                                          )
                                        }
                                        className="inline-flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition cursor-pointer whitespace-nowrap shrink-0"
                                      >
                                        <Pencil className="w-3.5 h-3.5 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                                        <span className="whitespace-nowrap">Modifier</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={generatingSaleId === doc.rawSale.id}
                                        onClick={() =>
                                          handleGenerateAndOpenSaleInvoice(
                                            doc.rawSale,
                                            doc.withTva
                                          )
                                        }
                                        className="inline-flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
                                      >
                                        <Printer className="w-3.5 h-3.5 shrink-0" />
                                        <span className="whitespace-nowrap">Imprimer</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {isVendeur && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openVendorRectificationModal(doc.rawSale)
                                          }
                                          className="inline-flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
                                        >
                                          <Pencil className="w-3.5 h-3.5 shrink-0" />
                                          <span className="whitespace-nowrap">Modifier</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => onOpenDocument(doc.invoicePayload)}
                                        className="inline-flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
                                      >
                                        <Printer className="w-3.5 h-3.5 shrink-0" />
                                        <span className="whitespace-nowrap">Imprimer</span>
                                      </button>
                                    </>
                                  )
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onOpenDocument(doc.invoicePayload)}
                                    className="inline-flex items-center gap-1.5 h-[40px] px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <Printer className="w-3.5 h-3.5 shrink-0" />
                                    <span className="whitespace-nowrap">Imprimer le reçu</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/90 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                      <tr>
                        <td colSpan={3} className="py-3 px-4 whitespace-nowrap">
                          Total ({filteredPrintableDocs.length} documents)
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="space-y-0.5 max-w-[210px] ml-auto">
                            <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                              <span>HT</span>
                              <span className="font-mono whitespace-nowrap">
                                {filteredPrintableDocs
                                  .reduce((acc, d) => acc + Number(d.subtotalHt || 0), 0)
                                  .toLocaleString('fr-FR')}{' '}
                                FCFA
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                              <span>TVA</span>
                              <span className="font-mono whitespace-nowrap">
                                {filteredPrintableDocs
                                  .reduce((acc, d) => acc + Number(d.tvaAmount || 0), 0)
                                  .toLocaleString('fr-FR')}{' '}
                                FCFA
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                              <span>Total</span>
                              <span className="font-mono whitespace-nowrap">
                                {filteredPrintableDocs
                                  .reduce((acc, d) => acc + Number(d.amount || 0), 0)
                                  .toLocaleString('fr-FR')}{' '}
                                FCFA
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Pied de totaux visible + Pagination par 20 */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="whitespace-nowrap">
                    Documents :{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {filteredPrintableDocs.length}
                    </strong>
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="whitespace-nowrap">
                      Total HT :{' '}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {filteredPrintableDocs
                          .reduce((acc, d) => acc + Number(d.subtotalHt || 0), 0)
                          .toLocaleString('fr-FR')}{' '}
                        FCFA
                      </strong>
                    </span>
                    <span className="whitespace-nowrap">
                      Total TVA :{' '}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {filteredPrintableDocs
                          .reduce((acc, d) => acc + Number(d.tvaAmount || 0), 0)
                          .toLocaleString('fr-FR')}{' '}
                        FCFA
                      </strong>
                    </span>
                    <span className="whitespace-nowrap">
                      Total TTC :{' '}
                      <strong className="font-mono text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                        {filteredPrintableDocs
                          .reduce((acc, d) => acc + Number(d.amount || 0), 0)
                          .toLocaleString('fr-FR')}{' '}
                        FCFA
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Affichage de{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {(safeFacturesPage - 1) * FACTURES_PAGE_SIZE + 1}
                    </strong>{' '}
                    à{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {Math.min(
                        safeFacturesPage * FACTURES_PAGE_SIZE,
                        filteredPrintableDocs.length
                      )}
                    </strong>{' '}
                    sur{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {filteredPrintableDocs.length}
                    </strong>{' '}
                    (Pagination par 20)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeFacturesPage <= 1}
                      onClick={() => setFacturesPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <ChevronLeft className="w-4 h-4 shrink-0" />
                      <span>Précédent</span>
                    </button>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap px-2">
                      Page {safeFacturesPage} / {totalFacturesPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeFacturesPage >= totalFacturesPages}
                      onClick={() =>
                        setFacturesPage((p) => Math.min(totalFacturesPages, p + 1))
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <span>Suivant</span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Rapport "Bons cadeaux" pour le Comptable (valeur remise) */}
      {!isVendeur && activeTab === 'bons-cadeaux' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span>
                <strong>Bons cadeaux :</strong> Suivi de la valeur remise en marchandises.
              </span>
              <InfoTooltip text="Suivi financier des bons cadeaux semestriels remis en marchandises (sortie de stock de type « Bon cadeau » au prix de vente). Rien en espèces n'est versé aux vendeurs." />
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

          {/* Bons cadeaux — Composant partagé DataTable */}
          <DataTable<any>
            data={bonsCadeaux}
            getRowKey={(b) => b.id}
            emptyMessage="Aucun bon cadeau enregistré pour ce semestre."
            mobileTitle={(b) => `${b.id.toUpperCase()} (${b.semester})`}
            mobileSubtitle={(b) => `${b.vendor_name} (${b.vendor_code})`}
            mobileStatusBadge={(b) => (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  b.status === 'Remis' || b.status === 'Reçu'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : b.status === 'À préparer'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {b.status}
              </span>
            )}
            columns={[
              {
                key: 'ref',
                label: 'Réf. & Semestre',
                hideOnMobileCard: true,
                render: (b) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {b.id.toUpperCase()}
                    </div>
                    <div className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                      {b.semester}
                    </div>
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux</span>,
              },
              {
                key: 'vendor',
                label: 'Vendeur',
                hideOnMobileCard: true,
                render: (b) => (
                  <div className="font-semibold text-slate-900 dark:text-white">
                    <div>{b.vendor_name}</div>
                    <div className="text-[10px] font-mono text-slate-400">{b.vendor_code}</div>
                  </div>
                ),
              },
              {
                key: 'note',
                label: 'Note /20',
                align: 'center',
                isNumeric: true,
                render: (b) => (
                  <span className="font-black text-slate-800 dark:text-slate-200">
                    {b.note_total}/20
                  </span>
                ),
              },
              {
                key: 'plafond',
                label: 'Plafond / Panier',
                align: 'right',
                isNumeric: true,
                render: (b) => (
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-300">
                      Plafond :{' '}
                      {b.amount !== undefined
                        ? `${Number(b.amount).toLocaleString('fr-FR')} FCFA`
                        : 'Non révélé'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Panier : {Number(b.basket_total || 0).toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                ),
                footer: (
                  <span>
                    {bonsCadeaux
                      .reduce((acc, b) => acc + Number(b.basket_total || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'delivered',
                label: 'Valeur Remise',
                align: 'right',
                isNumeric: true,
                render: (b) => (
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {Number(b.delivered_total || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
                footer: (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {bonsCadeaux
                      .reduce((acc, b) => acc + Number(b.delivered_total || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Statut',
                align: 'center',
                hideOnMobileCard: true,
                render: (b) => (
                  <div>
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
                  </div>
                ),
              },
            ]}
            renderActions={(b) => {
              const items = Array.isArray(b.items) ? b.items : [];
              const bonAmount = Number(b.amount || 0);
              const valTotal = Number(b.delivered_total || b.basket_total || bonAmount || 0);
              return (
                <button
                  type="button"
                  onClick={() =>
                    onOpenDocument({
                      id: b.id,
                      number: String(b.id || 'BON').toUpperCase(),
                      date:
                        String(b.remis_at || b.confirmed_reception_at || b.expires_at || '2026-11-07')
                          .replace('T', ' ')
                          .slice(0, 16),
                      type: 'bon_cadeau',
                      docTypeTitle: 'BON CADEAU REMIS (SORTIE FEFO)',
                      emitterTitle: 'MAGASIN CENTRAL BAOBAB (SORTIE FEFO)',
                      recipientTitle: 'BÉNÉFICIAIRE DU BON CADEAU (VENDEUR)',
                      vendorName: b.prepared_by || 'Magasin Central Baobab',
                      vendorCode: 'BAO-MAG',
                      vendorTeam: 'Dépôt Central & Comptabilité',
                      clientName: `${b.vendor_name} (${b.vendor_code})`,
                      pdvName: `${b.vendor_name} (${b.vendor_code})`,
                      pdvNeighborhood: `Semestre ${b.semester} • Note : ${b.note_total}/20`,
                      pdvManager: `Plafond Bon : ${bonAmount.toLocaleString('fr-FR')} FCFA (Rien en espèces)`,
                      items:
                        items.length > 0
                          ? items.map((it: any, idx: number) => ({
                              id: `${b.id}-${idx}`,
                              code: it.code || `CAD-0${idx + 1}`,
                              description: `${it.name}${it.lotNumber ? ` (Lot FEFO: ${it.lotNumber})` : ''}`,
                              quantity: Number(it.qtyBoxes || 1),
                              unitPrice: Number(it.unitPrice || 0),
                              total: Number(it.total || 0),
                            }))
                          : [
                              {
                                id: `${b.id}-0`,
                                code: String(b.id || 'BON').toUpperCase(),
                                description: `Dotation Bon Cadeau Semestre ${b.semester} (Plafond ${bonAmount.toLocaleString('fr-FR')} FCFA)`,
                                quantity: 1,
                                unitPrice: valTotal,
                                total: valTotal,
                              },
                            ],
                      subtotal: valTotal,
                      taxRate: 0,
                      taxAmount: 0,
                      total: valTotal,
                      paymentMethod: 'Bon cadeau en marchandises (0 FCFA espèces)',
                      status: `Statut : ${b.status}`,
                      isAcquittee: b.status === 'Remis' || b.status === 'Reçu',
                      sigLeftLabel: 'Le Bénéficiaire (Vendeur)',
                      sigCenterLabel: 'Le Magasinier (Sortie FEFO)',
                      sigRightLabel: 'Direction & Comptabilité',
                    })
                  }
                  className="inline-flex items-center gap-1.5 h-[48px] px-3.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Imprimer le bon</span>
                </button>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Bons cadeaux :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {bonsCadeaux.length}
                  </strong>
                </span>
                <span>
                  Valeur remise en marchandises :{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {bonsCadeaux
                      .reduce((sum, b) => sum + Number(b.delivered_total || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* Modal Encaisser un versement (Comptable uniquement) */}
      {isComptable && showVersementModal && (
        <FormModal
          title="Enregistrement Versement Vendeur (Caisse)"
          icon={<DollarSign className="w-5 h-5 text-teal-600" />}
          onClose={() => setShowVersementModal(false)}
          onSubmit={handleRecordVersement}
          submitLabel="Valider le versement"
          submitDisabled={isSubmitting}
          isDirty={Boolean(notes.trim())}
        >
          <div className={FORM_GROUP_CLASS}>
            <div>
              <label className={FORM_LABEL_CLASS}>Vendeur concerné</label>
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className={FORM_SELECT_CLASS}
              >
                {balances.map((b) => (
                  <option key={b.vendorId} value={b.vendorId}>
                    {b.code} - {b.name} (Solde dû : {b.balanceDue.toLocaleString('fr-FR')} FCFA)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Montant versé (FCFA)</label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={versementAmount}
                onChange={(e) => setVersementAmount(Number(e.target.value))}
                required
                className={FORM_FIELD_CLASS}
              />
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Mode de paiement
              </label>
              <PaymentMethodSelector
                value={paymentMode}
                onChange={setPaymentMode}
                especesValue="Espèces"
                mobileMoneyValue="Mobile Money"
                virementValue="Virement"
              />
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Notes / Réf. Quittance</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Quittance N°128 / Reçu versement BDM"
                className={FORM_FIELD_CLASS}
              />
            </div>

            <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 cursor-pointer">
              <input
                type="checkbox"
                checked={openInvoicingOnVersement}
                onChange={(e) => setOpenInvoicingOnVersement(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#008DA9] focus:ring-[#008DA9]"
              />
              <span className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">
                <strong>Générer les factures par vente PDV :</strong> Ouvrir les ventes du vendeur après validation pour générer chaque facture <strong>au nom du vendeur avec le PDV acheteur</strong> (avec option d&apos;ajout ou non de la <strong>TVA 18%</strong>).
              </span>
            </label>
          </div>
        </FormModal>
      )}

      {/* Modal de Génération des Factures par Vente PDV (Suite à un Versement du Vendeur) */}
      {selectedVersementForInvoicing && (
        <FormModal
          title={`Génération Factures • Versement ${selectedVersementForInvoicing.reference}`}
          subtitle={`Vendeur : ${selectedVersementForInvoicing.vendor_name} (${selectedVersementForInvoicing.vendor_code}) • Versement : ${Number(selectedVersementForInvoicing.amount || 0).toLocaleString('fr-FR')} FCFA`}
          icon={<FileText className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => setSelectedVersementForInvoicing(null)}
          submitLabel="Fermer"
          onSubmit={(e) => {
            e.preventDefault();
            setSelectedVersementForInvoicing(null);
          }}
        >
          <div className="space-y-4">
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
                      <>
                        {/* Sélecteur de vue : Cartes vs Tableau (Tablette/PC uniquement) */}
                        <div className="flex items-center justify-between gap-2 pb-1 flex-wrap">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Ventes PDV à facturer ({vendorSalesList.length}) :
                          </div>
                          <div className="hidden sm:inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => setInvoicingModalView('cards')}
                              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                                invoicingModalView === 'cards'
                                  ? 'bg-[#008DA9] text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Vue Cartes
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvoicingModalView('table')}
                              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                                invoicingModalView === 'table'
                                  ? 'bg-[#008DA9] text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Vue Tableau
                            </button>
                          </div>
                        </div>

                        {/* Ventes PDV rattachées au versement — Composant partagé DataTable */}
                        <DataTable<any>
                          data={vendorSalesList}
                          getRowKey={(s) => s.id}
                          emptyMessage="Aucune vente PDV rattachée à ce vendeur."
                          mobileTitle={(s) =>
                            s.invoice_number ||
                            String(s.number || '').replace(/^VTE-/, 'FAC-')
                          }
                          mobileSubtitle={(s) =>
                            `Vente : ${s.number} • ${s.date} à ${s.sale_time || '10:30'}`
                          }
                          mobileStatusBadge={() => (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#008DA9]/15 text-[#008DA9] border border-[#008DA9]/30">
                              Facture A4
                            </span>
                          )}
                          columns={[
                            {
                              key: 'invoice',
                              label: 'Facture / Vente',
                              hideOnMobileCard: true,
                              render: (s) => {
                                const invNumber =
                                  s.invoice_number ||
                                  String(s.number || '').replace(/^VTE-/, 'FAC-');
                                return (
                                  <div>
                                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                                      {invNumber}
                                    </div>
                                    <div className="font-mono text-[10px] text-[#008DA9]">
                                      Vente : {s.number}
                                    </div>
                                  </div>
                                );
                              },
                              footer: <span className="uppercase text-[11px]">Totaux</span>,
                            },
                            {
                              key: 'date',
                              label: 'Date & Heure',
                              isSecondary: true,
                              hideOnMobileCard: true,
                              render: (s) => (
                                <div className="text-slate-600 dark:text-slate-300">
                                  <div className="font-semibold">{s.date}</div>
                                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-[#008DA9]" />
                                    <span>{s.sale_time || '10:30'}</span>
                                  </div>
                                </div>
                              ),
                            },
                            {
                              key: 'vendor',
                              label: 'Au nom du Vendeur',
                              isSecondary: true,
                              render: (s) => (
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                    <User className="w-3 h-3 text-[#008DA9]" />
                                    <span>{s.vendor_name}</span>
                                  </div>
                                  <div className="font-mono text-[10px] text-teal-600">
                                    {s.vendor_code}
                                  </div>
                                </div>
                              ),
                            },
                            {
                              key: 'pdv',
                              label: 'PDV Acheteur',
                              render: (s) => (
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                    <Store className="w-3 h-3 text-emerald-600" />
                                    <span>{s.pdv_name}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {s.pdv_code ? `${s.pdv_code} • ` : ''}
                                    {s.pdv_neighborhood}
                                    {s.pdv_manager ? ` • Gérant: ${s.pdv_manager}` : ''}
                                  </div>
                                </div>
                              ),
                            },
                            {
                              key: 'tva',
                              label: 'Sélecteur TVA & Aperçu HT / TVA / TTC',
                              align: 'center',
                              render: (s) => {
                                const withTva = isTvaEnabledForSale(s);
                                const subtotalHt = Number(s.total_amount || 0);
                                const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
                                const totalTtc = subtotalHt + tvaAmount;
                                return (
                                  <div className="space-y-2 text-left min-w-[200px]">
                                    {isComptable ? (
                                      <div
                                        role="switch"
                                        aria-checked={withTva}
                                        className="w-full grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => toggleSaleTva(s.id, false)}
                                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                                            !withTva
                                              ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white shadow-xs'
                                              : 'text-slate-600 dark:text-slate-300'
                                          }`}
                                        >
                                          Sans TVA
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleSaleTva(s.id, true)}
                                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                                            withTva
                                              ? 'bg-[#92400E] text-white shadow-xs'
                                              : 'text-slate-600 dark:text-slate-300'
                                          }`}
                                        >
                                          + TVA 18 %
                                        </button>
                                      </div>
                                    ) : (
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
                                          withTva
                                            ? 'bg-[#92400E] text-white'
                                            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                                        }`}
                                      >
                                        {withTva ? 'TVA 18 %' : 'Sans TVA'}
                                      </span>
                                    )}
                                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-0.5 text-[11px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-500">HT</span>
                                        <span className="font-mono font-semibold whitespace-nowrap">
                                          {subtotalHt.toLocaleString('fr-FR')} FCFA
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-500">TVA</span>
                                        <span className="font-mono font-semibold whitespace-nowrap">
                                          {tvaAmount.toLocaleString('fr-FR')} FCFA
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-200/70 dark:border-slate-700/70 font-bold text-slate-900 dark:text-white">
                                        <span>TTC</span>
                                        <span className="font-mono font-bold whitespace-nowrap">
                                          {totalTtc.toLocaleString('fr-FR')} FCFA
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            },
                          ]}
                          renderActions={(s) => {
                            const withTva = isTvaEnabledForSale(s);
                            return isComptable ? (
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
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                              >
                                <Printer className="w-4 h-4 shrink-0" />
                                <span className="whitespace-nowrap">Générer la facture</span>
                              </button>
                            ) : s.invoice_generated ? (
                              <>
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
                                  className="inline-flex items-center gap-1.5 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs cursor-pointer whitespace-nowrap"
                                >
                                  <Printer className="w-4 h-4 shrink-0" />
                                  <span className="whitespace-nowrap">Imprimer</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVersementForInvoicing(null);
                                    openVendorRectificationModal(s);
                                  }}
                                  className="inline-flex items-center gap-1.5 h-[48px] min-h-[48px] px-4 rounded-[12px] bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                                >
                                  <Pencil className="w-4 h-4 shrink-0" />
                                  <span className="whitespace-nowrap">Modifier</span>
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                                En attente du Comptable
                              </span>
                            );
                          }}
                          totalsFooter={
                            <>
                              <span>
                                Ventes PDV :{' '}
                                <strong className="text-slate-900 dark:text-white">
                                  {vendorSalesList.length}
                                </strong>
                              </span>
                              <span>
                                Total HT :{' '}
                                <strong className="text-slate-900 dark:text-white">
                                  {vendorSalesList
                                    .reduce((acc, s) => acc + Number(s.total_amount || 0), 0)
                                    .toLocaleString('fr-FR')}{' '}
                                  FCFA
                                </strong>
                              </span>
                            </>
                          }
                        />
                    </>
                  )}
                  </>
                );
              })()}
          </div>
        </FormModal>
      )}

      {/* MODAL VENDEUR: Demander une rectification avec Mini Facture Thermique automatique en preuve */}
      {isVendeur && rectificationModalSale && (
        <FormModal
          title="Demande de Rectification de Facture • Preuve par Mini Facture Thermique (80mm)"
          subtitle={
            <>
              Facture concernée :{' '}
              <strong>
                {rectificationModalSale.invoice_number ||
                  String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-')}
              </strong>{' '}
              • Vendeur : <strong>{currentUser?.name} ({currentUser?.code})</strong>
            </>
          }
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          onClose={() => setRectificationModalSale(null)}
          onSubmit={handleSubmitVendorRectification}
          submitLabel={
            <>
              <Send className="w-4 h-4" />
              <span>
                {isSubmittingRectification
                  ? 'Envoi en cours...'
                  : 'Envoyer la Demande avec Mini Facture Thermique en Preuve'}
              </span>
            </>
          }
          submitDisabled={isSubmittingRectification}
          isDirty={Boolean(rectificationReason.trim())}
        >
          <div className="space-y-4 text-xs">
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
              <label className={FORM_LABEL_CLASS}>
                Sélectionnez la Mini Facture Thermique de votre historique de ventes à joindre comme preuve *
              </label>
              <select
                value={selectedProofSaleId}
                onChange={(e) => setSelectedProofSaleId(e.target.value)}
                className={`${FORM_SELECT_CLASS} font-mono font-bold text-xs`}
              >
                {visibleSales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getThermalTicketNumber(s)} • Vente {s.number} du {s.date} à {s.sale_time || '10:30'} — {s.pdv_name} ({Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Expliquez l&apos;erreur constatée sur la facture (Motif de la rectification) *
              </label>
              <textarea
                rows={4}
                required
                value={rectificationReason}
                onChange={(e) => setRectificationReason(e.target.value)}
                placeholder="Ex: Erreur sur le nombre de cartons facturés ou sur l'application de la TVA 18%. Voir la Mini Facture Thermique ci-jointe en preuve..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>

            {/* Live Preview of the Auto-Generated Mini Facture Thermique (80mm) attached as Proof */}
            <div className="flex flex-col items-center pt-2">
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
          </div>
        </FormModal>
      )}

      {/* MODAL COMPTABLE: Générer / Modifier une Facture pour un Vendeur */}
      {isComptable && showCreateInvoiceModal && (
        <FormModal
          title="Génération / Modification de Facture Vendeur"
          subtitle="Seul le Comptable est autorisé à créer ou modifier les factures • Visible & imprimable par le vendeur"
          icon={<FileText className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowCreateInvoiceModal(false)}
          onSubmit={handleComptableCreateInvoiceSubmit}
          hideFooter={true}
        >
          {(() => {
            const selectedSaleForPreview =
              createInvoiceMode === 'existing_sale'
                ? sales.find((s) => s.id === selectedSaleIdForNewInvoice) || sales[0]
                : null;
            const selectedProdForPreview =
              createInvoiceMode === 'new_invoice'
                ? products.find((p) => p.id === newInvoiceProductId) || products[0]
                : null;
            const previewHt =
              createInvoiceMode === 'existing_sale'
                ? Number(selectedSaleForPreview?.total_amount || 0)
                : Math.max(1, Number(newInvoiceQtyBoxes || 1)) *
                  Number(selectedProdForPreview?.price_box || 18000);
            const previewTva = newInvoiceWithTva ? Math.round(previewHt * 0.18) : 0;
            const previewTtc = previewHt + previewTva;

            return (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setCreateInvoiceMode('existing_sale')}
                    className={`py-2.5 px-3 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                      createInvoiceMode === 'existing_sale'
                        ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    À partir d&apos;une vente du vendeur
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateInvoiceMode('new_invoice')}
                    className={`py-2.5 px-3 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                      createInvoiceMode === 'new_invoice'
                        ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Nouvelle facture directe Vendeur + PDV
                  </button>
                </div>

                {createInvoiceMode === 'existing_sale' ? (
                  <div>
                    <label className={FORM_LABEL_CLASS}>
                      Sélectionner la vente réalisée par le vendeur *
                    </label>
                    <select
                      required
                      value={selectedSaleIdForNewInvoice}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedSaleIdForNewInvoice(nextId);
                        const nextSale = sales.find((s) => s.id === nextId);
                        if (nextSale) {
                          setNewInvoiceWithTva(isTvaEnabledForSale(nextSale));
                        }
                      }}
                      className={FORM_SELECT_CLASS}
                    >
                      {sales.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.invoice_generated ? '[Facturée] ' : '[À facturer] '}
                          {s.number} • {s.vendor_name} ({s.vendor_code}) → {s.pdv_name} (
                          {Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className={FORM_LABEL_CLASS}>
                        Vendeur titulaire de la facture *
                      </label>
                      <select
                        value={newInvoiceVendorId}
                        onChange={(e) => setNewInvoiceVendorId(e.target.value)}
                        className={FORM_SELECT_CLASS}
                      >
                        {balances.map((b) => (
                          <option key={b.vendorId} value={b.vendorId}>
                            {b.code} — {b.name} ({b.team})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={FORM_LABEL_CLASS}>
                        Point de Vente (PDV Acheteur) *
                      </label>
                      <select
                        value={newInvoicePdvId}
                        onChange={(e) => setNewInvoicePdvId(e.target.value)}
                        className={FORM_SELECT_CLASS}
                      >
                        {pdvs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.neighborhood}) — Gérant : {p.manager_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={FORM_ROW_CLASS}>
                      <div>
                        <label className={FORM_LABEL_CLASS}>Produit facturé *</label>
                        <select
                          value={newInvoiceProductId}
                          onChange={(e) => setNewInvoiceProductId(e.target.value)}
                          className={FORM_SELECT_CLASS}
                        >
                          {products.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.code} — {prod.name} (
                              {Number(prod.price_box || 0).toLocaleString('fr-FR')} FCFA)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={FORM_LABEL_CLASS}>Cartons *</label>
                        <input
                          type="number"
                          min="1"
                          value={newInvoiceQtyBoxes}
                          onChange={(e) => setNewInvoiceQtyBoxes(Number(e.target.value))}
                          className={FORM_FIELD_CLASS}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Sélecteur TVA ("Sans TVA" / "+ TVA 18 %") en interrupteur sur sa propre ligne + Aperçu HT, TVA, TTC */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      Régime de TVA de la facture
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Basculez l&apos;interrupteur pour appliquer ou non la TVA 18 % sur la facture.
                    </div>
                  </div>

                  {/* Interrupteur sur sa propre ligne */}
                  <div
                    role="switch"
                    aria-checked={newInvoiceWithTva}
                    aria-label="Sélecteur TVA (Sans TVA / + TVA 18 %)"
                    className="w-full grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => setNewInvoiceWithTva(false)}
                      className={`h-[44px] px-3 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
                        !newInvoiceWithTva
                          ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="whitespace-nowrap">Sans TVA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewInvoiceWithTva(true)}
                      className={`h-[44px] px-3 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
                        newInvoiceWithTva
                          ? 'bg-[#92400E] text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">+ TVA 18 %</span>
                    </button>
                  </div>

                  {/* Aperçu en direct HT, TVA, TTC */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400">HT</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {previewHt.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        TVA {newInvoiceWithTva ? '(18 %)' : '(0 %)'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {previewTva.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-sm">
                      <span className="font-bold text-slate-900 dark:text-white">TTC (Total)</span>
                      <span className="font-mono font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] whitespace-nowrap">
                        {previewTtc.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pied du modal : bouton principal "Générer la facture" vert, 48 px, pleine largeur sur mobile */}
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateInvoiceModal(false)}
                    className="h-[48px] min-h-[48px] px-4 rounded-[12px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingInvoiceForVendor}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[48px] min-h-[48px] px-5 rounded-[12px] bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">
                      {isCreatingInvoiceForVendor ? 'Génération...' : 'Générer la facture'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}
        </FormModal>
      )}
    </div>
  );
};

