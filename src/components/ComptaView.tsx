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
import { CardList } from './CardList';
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
  const isComptable =
    currentRole === 'Comptable' ||
    currentRole === 'Directeur des opérations de vente' ||
    currentRole === 'Sales Admin' ||
    isAdmin;
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
      vendorTeam: sale.vendor_team || '',
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
  const [rectificationItems, setRectificationItems] = useState<
    Array<{ productId?: string; code: string; name: string; qtyBoxes: number; unitPrice: number; total: number }>
  >([]);
  const [rectificationWithTva, setRectificationWithTva] = useState<boolean>(false);
  const [isSubmittingRectification, setIsSubmittingRectification] = useState(false);
  const [resolvingRectificationId, setResolvingRectificationId] = useState<string | null>(null);
  const [comptaFeedbackBanner, setComptaFeedbackBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [invoicingModalView, setInvoicingModalView] = useState<'cards' | 'table'>('cards');

  // Comptable: Create / Modify Invoice for Vendor modal state
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [createInvoiceMode, setCreateInvoiceMode] = useState<'existing_sale' | 'new_invoice'>('existing_sale');
  const [selectedSaleIdForNewInvoice, setSelectedSaleIdForNewInvoice] = useState<string>('');
  const [editSalePdvId, setEditSalePdvId] = useState<string>('');
  const [editSalePaymentType, setEditSalePaymentType] = useState<string>('Comptant');
  const [editSaleItems, setEditSaleItems] = useState<
    Array<{ productId?: string; code: string; name: string; qtyBoxes: number; unitPrice: number; total: number }>
  >([]);
  const [newInvoiceVendorId, setNewInvoiceVendorId] = useState<string>(balances[0]?.vendorId || '');
  const [newInvoicePdvId, setNewInvoicePdvId] = useState<string>(pdvs[0]?.id || '');
  const [newInvoiceProductId, setNewInvoiceProductId] = useState<string>(products[0]?.id || '');
  const [newInvoiceQtyBoxes, setNewInvoiceQtyBoxes] = useState<number>(10);
  const [newInvoiceWithTva, setNewInvoiceWithTva] = useState<boolean>(false);
  const [isCreatingInvoiceForVendor, setIsCreatingInvoiceForVendor] = useState<boolean>(false);

  const normalizeSaleItemsForEdit = useCallback(
    (saleObj: any) => {
      let raw: any[] = [];
      if (typeof saleObj?.items === 'string') {
        try {
          raw = JSON.parse(saleObj.items);
        } catch {
          raw = [];
        }
      } else if (Array.isArray(saleObj?.items)) {
        raw = saleObj.items;
      }
      if (raw.length > 0) {
        return raw.map((it: any) => {
          const qtyBoxes = Math.max(1, Number(it.qtyBoxes ?? it.qty ?? it.quantity ?? 1));
          const unitPrice = Number(it.unitPrice ?? it.price ?? 18000);
          return {
            productId: it.productId || it.product_id,
            code: it.code || 'BEN-01',
            name: it.name || 'Produit Baobab',
            qtyBoxes,
            unitPrice,
            total: qtyBoxes * unitPrice,
          };
        });
      }
      const fallbackProd = products[0];
      const fallbackPrice = Number(saleObj?.total_amount || fallbackProd?.price_box || 18000);
      return [
        {
          productId: fallbackProd?.id || 'p1',
          code: fallbackProd?.code || 'BEN-01',
          name: fallbackProd?.name || 'Produit Baobab',
          qtyBoxes: 1,
          unitPrice: fallbackPrice,
          total: fallbackPrice,
        },
      ];
    },
    [products]
  );

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

  const openVendorRectificationModal = useCallback(
    (saleObj: any) => {
      if (!saleObj) return;
      setRectificationModalSale(saleObj);
      setSelectedProofSaleId(saleObj.id);
      setRectificationItems(normalizeSaleItemsForEdit(saleObj));
      setRectificationWithTva(Boolean(saleObj.with_tva));
      setRectificationReason('');
    },
    [normalizeSaleItemsForEdit]
  );

  // If externalRectificationSaleId is passed (e.g. from PrintableDocument "Rectification" button)
  useEffect(() => {
    if (externalRectificationSaleId) {
      const cleanId = String(externalRectificationSaleId).replace(/^doc-sale-/, '');
      const foundSale = sales.find(
        (s) =>
          s.id === cleanId ||
          s.number === cleanId ||
          s.invoice_number === cleanId
      );
      if (foundSale) {
        setActiveTab('factures');
        openVendorRectificationModal(foundSale);
      }
      onClearExternalRectification?.();
    }
  }, [externalRectificationSaleId, sales, onClearExternalRectification, openVendorRectificationModal]);

  const selectedProofSaleObj = useMemo(() => {
    if (!selectedProofSaleId) return rectificationModalSale;
    return visibleSales.find((s) => s.id === selectedProofSaleId) || rectificationModalSale;
  }, [selectedProofSaleId, visibleSales, rectificationModalSale]);

  const handleSubmitVendorRectification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rectificationModalSale || !rectificationReason.trim()) return;

    setIsSubmittingRectification(true);
    try {
      const proofSale = selectedProofSaleObj || rectificationModalSale;
      const cleanedItems =
        rectificationItems.length > 0
          ? rectificationItems.map((it) => ({
              productId: it.productId,
              code: it.code,
              name: it.name,
              qtyBoxes: Math.max(1, Number(it.qtyBoxes || 1)),
              unitPrice: Number(it.unitPrice || 0),
              total: Math.max(1, Number(it.qtyBoxes || 1)) * Number(it.unitPrice || 0),
            }))
          : normalizeSaleItemsForEdit(proofSale);
      const editedSubtotalHt = cleanedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
      const baseThermalDoc = buildMiniThermalReceiptDoc({
        ...proofSale,
        items: cleanedItems,
        total_amount: editedSubtotalHt,
        with_tva: rectificationWithTva,
      });
      const thermalDoc = {
        ...baseThermalDoc,
        withTva: rectificationWithTva,
        subtotalHt: editedSubtotalHt,
        tvaAmount: rectificationWithTva ? Math.round(editedSubtotalHt * 0.18) : 0,
        totalTtc:
          editedSubtotalHt + (rectificationWithTva ? Math.round(editedSubtotalHt * 0.18) : 0),
        total:
          editedSubtotalHt + (rectificationWithTva ? Math.round(editedSubtotalHt * 0.18) : 0),
        items: cleanedItems.map((it) => ({
          code: it.code,
          name: it.name,
          qty: it.qtyBoxes,
          qtyBoxes: it.qtyBoxes,
          price: it.unitPrice,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
      };

      const res = await fetch('/api/invoice-rectifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({
          sale_id: rectificationModalSale.id,
          proof_sale_id: selectedProofSaleId || rectificationModalSale.id,
          invoice_number:
            rectificationModalSale.invoice_number ||
            String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-'),
          vendor_id: rectificationModalSale.vendor_id || currentUser?.id,
          reason: rectificationReason.trim(),
          requested_items: cleanedItems,
          requested_with_tva: rectificationWithTva,
          thermal_receipt: thermalDoc,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComptaFeedbackBanner({
          type: 'success',
          text: `Demande de rectification enregistrée avec la Mini Facture Thermique (${thermalDoc.thermalTicketNumber}) en preuve officielle.`,
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

      const resolvedWithTva =
        withTvaOverride !== undefined
          ? withTvaOverride
          : proofReceipt.withTva !== undefined
          ? Boolean(proofReceipt.withTva)
          : false;

      const res = await fetch(`/api/invoice-rectifications/${rect.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({
          decision,
          with_tva: resolvedWithTva,
          updated_items: updatedItems,
          comptable_note:
            decision === 'rectifiee'
              ? `Facture rectifiée conformément à la Mini Facture Thermique ${rect.thermal_ticket_number} soumise en preuve.`
              : 'Demande examinée et rejetée.',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComptaFeedbackBanner({
          type: 'success',
          text:
            decision === 'rectifiee'
              ? `La facture ${rect.invoice_number} de ${rect.vendor_name} a été rectifiée (${resolvedWithTva ? 'TVA 18 %' : 'Sans TVA'}) et mise à jour.`
              : `La demande de rectification sur ${rect.invoice_number} a été rejetée.`,
        });
        await fetchRectifications();
        onRefreshData();
      } else {
        setComptaFeedbackBanner({
          type: 'error',
          text: data.error || 'Erreur lors du traitement de la demande de rectification.',
        });
      }
    } catch {
      setComptaFeedbackBanner({
        type: 'error',
        text: 'Erreur réseau lors du traitement de la rectification.',
      });
    } finally {
      setResolvingRectificationId(null);
    }
  };

  const openInvoiceGenerationModalForSale = (
    saleObj: any,
    currentWithTva: boolean,
    overrideItems?: Array<{ productId?: string; code: string; name: string; qtyBoxes: number; unitPrice: number; total: number }>
  ) => {
    if (!saleObj) return;
    setCreateInvoiceMode('existing_sale');
    setSelectedSaleIdForNewInvoice(saleObj.id);
    setEditSalePdvId(saleObj.pdv_id || pdvs[0]?.id || '');
    setEditSalePaymentType(saleObj.payment_type || 'Comptant');
    setEditSaleItems(
      overrideItems && overrideItems.length > 0
        ? overrideItems
        : normalizeSaleItemsForEdit(saleObj)
    );
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

        const cleanedItems =
          editSaleItems.length > 0
            ? editSaleItems.map((it) => ({
                productId: it.productId,
                code: it.code,
                name: it.name,
                qtyBoxes: Math.max(1, Number(it.qtyBoxes || 1)),
                unitPrice: Number(it.unitPrice || 0),
                total: Math.max(1, Number(it.qtyBoxes || 1)) * Number(it.unitPrice || 0),
              }))
            : normalizeSaleItemsForEdit(saleObj);
        const newSubtotalHt = cleanedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
        const targetPdv = pdvs.find((p) => p.id === editSalePdvId);

        const res = await fetch(`/api/sales/${saleObj.id}/generate-invoice`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': currentRole,
            'x-user-id': currentUser?.id || '',
          },
          body: JSON.stringify({
            with_tva: newInvoiceWithTva,
            pdv_id: editSalePdvId || saleObj.pdv_id,
            payment_type: editSalePaymentType || saleObj.payment_type || 'Comptant',
            updated_items: cleanedItems,
            versement_id: saleObj.versement_id || null,
          }),
        });

        const updatedSaleForPreview = {
          ...saleObj,
          pdv_id: editSalePdvId || saleObj.pdv_id,
          pdv_name: targetPdv?.name || saleObj.pdv_name,
          pdv_neighborhood: targetPdv?.neighborhood || saleObj.pdv_neighborhood,
          pdv_manager: targetPdv?.manager_name || saleObj.pdv_manager,
          pdv_phone: targetPdv?.phone || saleObj.pdv_phone,
          payment_type: editSalePaymentType || saleObj.payment_type || 'Comptant',
          items: cleanedItems,
          total_amount: newSubtotalHt,
          with_tva: newInvoiceWithTva ? 1 : 0,
          invoice_generated: 1,
        };

        if (res.ok) {
          await fetchRectifications();
          onRefreshData();
        }

        setShowCreateInvoiceModal(false);
        onOpenDocument(
          buildSaleInvoicePayload(
            updatedSaleForPreview,
            newInvoiceWithTva,
            saleObj.versement_reference
          )
        );
        setComptaFeedbackBanner({
          type: 'success',
          text: `Facture générée / rectifiée avec succès pour ${saleObj.vendor_name} (${updatedSaleForPreview.pdv_name}).`,
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
            'x-user-id': currentUser?.id || '',
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
            text: `Facture ${data.invoice_number} créée pour le vendeur ! Elle est immédiatement visible et imprimable dans le compte du vendeur.`,
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
        type: 'recu_versement' as const,
        docTypeTitle: 'REÇU DE VERSEMENT',
        date: v.date,
        clientName: `${v.vendor_name} (${v.vendor_code})`,
        clientPhone: currentUser?.phone || '+223 75 44 22 11',
        vendorName: v.vendor_name,
        vendorCode: v.vendor_code,
        vendorTeam: '',
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
        isAcquittee: true,
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
          'Ventes Realisees',
          'Versements Valides',
          'Solde Restant Du',
          'Stock Camionnette',
        ],
        rows: visibleBalances.map((b) => [
          b.code,
          `${b.name} (${b.phone})`,
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
        columns: ['Ref. Versement', 'Date', 'Vendeur', 'Mode de Reglement', 'Notes / Motif', 'Montant (FCFA)'],
        rows: visibleVersements.map((v) => [
          v.reference || v.id,
          v.date || '',
          `${v.vendor_name || ''} (${v.vendor_code || ''})`,
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
          'Ventes Realisees (FCFA)',
          'Versements Valides (FCFA)',
          'Solde Restant Du (FCFA)',
          'Valeur Stock Camionnette (FCFA)',
        ],
        rows: visibleBalances.map((b) => [
          b.code,
          b.name,
          b.phone || '',
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

          {/* Soldes Vendeurs — Composant partagé Liste de cartes */}
          <CardList<VendorBalance>
            data={visibleBalances}
            rowKey={(b) => b.vendorId}
            pageSize={20}
            searchable={true}
            searchPlaceholder="Rechercher un vendeur par nom, code, équipe, téléphone…"
            sortOptions={[
              { key: 'balanceDue', label: 'Solde restant dû', getValue: (b) => Number(b.balanceDue || 0) },
              { key: 'totalSales', label: 'Ventes réalisées', getValue: (b) => Number(b.totalSales || 0) },
              { key: 'totalVersements', label: 'Versements validés', getValue: (b) => Number(b.totalVersements || 0) },
              { key: 'name', label: 'Nom du vendeur', getValue: (b) => b.name || '' },
              { key: 'code', label: 'Code vendeur', getValue: (b) => b.code || '' },
            ]}
            defaultSortKey="balanceDue"
            defaultSortDirection="desc"
            emptyMessage="Aucun vendeur trouvé."
            title={(b) => (
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <span className="font-mono font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere] min-w-0">
                  {b.name} ({b.code})
                </span>
                <span className="font-mono text-xs font-bold text-[#008DA9] dark:text-teal-400 whitespace-nowrap shrink-0">
                  {b.code}
                </span>
              </div>
            )}
            badges={(b) => (
              <>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                    b.balanceDue > 0
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                  }`}
                >
                  {b.balanceDue > 0 ? 'Solde dû' : 'À jour'}
                </span>
              </>
            )}
            fields={[
              {
                key: 'code',
                label: 'Code vendeur',
                value: (b) => (
                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                    {b.code}
                  </span>
                ),
              },
              {
                key: 'name',
                label: 'Nom du vendeur',
                value: (b) => b.name,
              },
              {
                key: 'phone',
                label: 'Téléphone',
                value: (b) => b.phone || '—',
              },
              {
                key: 'sales',
                label: 'Ventes réalisées',
                isAmount: true,
                value: (b) => (
                  <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {b.totalSales.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'versements',
                label: 'Versements validés',
                isAmount: true,
                value: (b) => (
                  <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {b.totalVersements.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'balanceDue',
                label: 'Solde restant dû',
                isAmount: true,
                value: (b) => (
                  <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm whitespace-nowrap">
                    {b.balanceDue.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'stockVan',
                label: 'Stock camionnette (3-7j)',
                isAmount: true,
                value: (b) => (
                  <span className="font-mono text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                    {b.stockVanValue.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(b) =>
              isComptable ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVendorId(b.vendorId);
                    setShowVersementModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>Encaisser un versement</span>
                </button>
              ) : null
            }
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
                  <strong className="font-mono text-slate-900 dark:text-white baobab-amount">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalSales || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total Versements :{' '}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400 baobab-amount">
                    {visibleBalances
                      .reduce((acc, b) => acc + Number(b.totalVersements || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total Solde Dû :{' '}
                  <strong className="font-mono text-amber-600 dark:text-amber-400 baobab-amount">
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

          {/* Journal des Versements — Composant partagé Liste de cartes */}
          <CardList<any>
            data={visibleVersements}
            rowKey={(v) => v.id}
            pageSize={20}
            searchable={true}
            searchPlaceholder="Rechercher par référence, vendeur, code, mode de règlement, motif…"
            sortOptions={[
              { key: 'date', label: 'Date de versement', getValue: (v) => v.date || '' },
              { key: 'amount', label: 'Montant encaissé', getValue: (v) => Number(v.amount || 0) },
              { key: 'reference', label: 'Référence', getValue: (v) => v.reference || '' },
              { key: 'vendor_name', label: 'Vendeur', getValue: (v) => v.vendor_name || '' },
            ]}
            defaultSortKey="date"
            defaultSortDirection="desc"
            emptyMessage="Aucun versement de caisse enregistré pour ce compte."
            title={(v) => (
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <span className="font-mono font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere] min-w-0">
                  {v.reference}
                </span>
                <span className="font-sans text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                  {v.date}
                </span>
              </div>
            )}
            badges={(v) => (
              <>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Validé en Caisse</span>
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {v.payment_mode || 'Espèces'}
                </span>
              </>
            )}
            fields={[
              {
                key: 'vendor',
                label: 'Vendeur',
                value: (v) => (
                  <span>
                    {v.vendor_name}{' '}
                    <span className="font-mono text-xs text-slate-500">({v.vendor_code})</span>
                  </span>
                ),
              },
              {
                key: 'payment_mode',
                label: 'Mode de règlement',
                value: (v) => v.payment_mode || 'Espèces',
              },
              {
                key: 'notes',
                label: 'Motif / Quittance',
                value: (v) => v.notes || 'Versement de caisse',
              },
              {
                key: 'amount',
                label: 'Montant encaissé',
                isAmount: true,
                value: (v) => (
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                    {Number(v.amount || 0).toLocaleString('fr-FR')} FCFA
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
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
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
                        type: 'recu_versement',
                        docTypeTitle: 'REÇU DE VERSEMENT',
                        date: v.date,
                        clientName: `${v.vendor_name} (${v.vendor_code})`,
                        clientPhone: currentUser?.phone || '+223 75 44 22 11',
                        vendorName: v.vendor_name,
                        vendorCode: v.vendor_code,
                        vendorTeam: '',
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
                        isAcquittee: true,
                        status: 'Validé en Caisse',
                      })
                    }
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs cursor-pointer"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span>Imprimer le reçu</span>
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
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400 baobab-amount">
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
                  if (uninvoiced) {
                    openInvoiceGenerationModalForSale(uninvoiced, isTvaEnabledForSale(uninvoiced));
                  } else {
                    setCreateInvoiceMode('new_invoice');
                    setShowCreateInvoiceModal(true);
                  }
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] h-auto py-3 px-5 rounded-[12px] bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm shadow-xs shrink-0 cursor-pointer transition"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>Générer la facture</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-bold text-[11px] shrink-0 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Lecture seule • Non modifiable</span>
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
                          className="inline-flex items-center gap-1.5 min-h-[48px] h-auto py-3 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition cursor-pointer"
                        >
                          <Receipt className="w-4 h-4 shrink-0" />
                          <span>Voir Mini Facture Thermique (Preuve)</span>
                        </button>

                        {isComptable && isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const saleForRect = sales.find((s) => s.id === rect.sale_id);
                                if (saleForRect) {
                                  const proofItems = Array.isArray(rect.thermal_receipt?.items)
                                    ? rect.thermal_receipt.items.map((it: any) => ({
                                        code: it.code || 'BEN-01',
                                        name: it.name || 'Produit Baobab',
                                        qtyBoxes: Math.max(1, Number(it.qty ?? it.qtyBoxes ?? 1)),
                                        unitPrice: Number(it.price ?? it.unitPrice ?? 18000),
                                        total:
                                          Math.max(1, Number(it.qty ?? it.qtyBoxes ?? 1)) *
                                          Number(it.price ?? it.unitPrice ?? 18000),
                                      }))
                                    : undefined;
                                  openInvoiceGenerationModalForSale(
                                    saleForRect,
                                    rect.thermal_receipt?.withTva !== undefined
                                      ? Boolean(rect.thermal_receipt.withTva)
                                      : Boolean(saleForRect.with_tva),
                                    proofItems
                                  );
                                }
                              }}
                              className="inline-flex items-center gap-1.5 min-h-[48px] h-auto py-3 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer"
                            >
                              <Pencil className="w-4 h-4 shrink-0 text-[var(--marque-fonce)]" />
                              <span>Modifier &amp; Rectifier</span>
                            </button>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', false)}
                              className="inline-flex items-center gap-1.5 min-h-[48px] h-auto py-3 px-3.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Rectifier (Sans TVA)</span>
                            </button>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rectifiee', true)}
                              className="inline-flex items-center gap-1.5 min-h-[48px] h-auto py-3 px-3.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              <Percent className="w-4 h-4 shrink-0" />
                              <span>Rectifier (+ TVA 18 %)</span>
                            </button>
                            <button
                              type="button"
                              disabled={resolvingRectificationId === rect.id}
                              onClick={() => handleComptableResolveRectification(rect, 'rejetee')}
                              className="inline-flex items-center gap-1.5 min-h-[48px] h-auto py-3 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              <X className="w-4 h-4 shrink-0" />
                              <span>Rejeter</span>
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

          {/* Description + Onglets (compteurs en nombre seul) */}
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
              className="flex items-center gap-2 flex-wrap max-w-full pb-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'all'}
                onClick={() => setDocTypeFilter('all')}
                className={`min-h-[48px] h-auto px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  docTypeFilter === 'all'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>Tous ({printableDocuments.length})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'facture'}
                onClick={() => setDocTypeFilter('facture')}
                className={`min-h-[48px] h-auto px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  docTypeFilter === 'facture'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Factures par Vente PDV ({invoicedOrEditableSales.length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={docTypeFilter === 'recu'}
                onClick={() => setDocTypeFilter('recu')}
                className={`min-h-[48px] h-auto px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  docTypeFilter === 'recu'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Reçus Versements ({visibleVersements.length})
                </span>
              </button>
            </div>
          </div>

          {/* Factures & Reçus Imprimables — Composant partagé Liste de cartes */}
          <CardList<any>
            data={filteredPrintableDocs}
            rowKey={(doc) => doc.id}
            pageSize={20}
            searchable={true}
            searchPlaceholder="Rechercher par N° facture/reçu, N° vente, vendeur, PDV acheteur, gérant…"
            sortOptions={[
              {
                key: 'date',
                label: 'Date du document',
                getValue: (doc) => `${doc.date || ''} ${doc.saleTime || ''}`,
              },
              {
                key: 'amount',
                label: 'Montant Total',
                getValue: (doc) => Number(doc.amount || 0),
              },
              {
                key: 'number',
                label: 'N° de document',
                getValue: (doc) => doc.number || '',
              },
            ]}
            defaultSortKey="date"
            defaultSortDirection="desc"
            emptyMessage="Aucune facture ni reçu à afficher pour ce filtre."
            title={(doc) => (
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <span className="font-mono font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere] min-w-0">
                  {doc.number}
                </span>
                <span className="font-sans text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                  {doc.date}
                  {doc.saleTime ? ` • ${doc.saleTime}` : ''}
                </span>
              </div>
            )}
            badges={(doc) => {
              const isFacture = doc.docKind === 'facture';
              const isPaid =
                !isFacture ||
                doc.invoiceGenerated ||
                String(doc.paymentMode || '').toLowerCase().includes('comptant');
              return (
                <>
                  {isFacture ? (
                    <>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          doc.invoiceGenerated
                            ? 'bg-[#15803D] text-white'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {doc.invoiceGenerated ? 'Créée' : 'À générer'}
                      </span>
                      {isPaid && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Payée
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#15803D] text-white">
                      Payée • Reçu Caisse
                    </span>
                  )}

                  {isFacture && doc.withTva ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#92400E] text-white">
                      TVA 18 %
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                      Sans TVA
                    </span>
                  )}

                  {doc.rectificationStatus === 'en_attente' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#92400E] text-white">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Rectification demandée</span>
                    </span>
                  )}
                  {doc.rectificationStatus === 'rectifiee' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#15803D] text-white">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>Rectifiée</span>
                    </span>
                  )}
                </>
              );
            }}
            fields={[
              {
                key: 'vendor',
                label: 'Vendeur',
                value: (doc) => doc.vendorLabel,
              },
              {
                key: 'counterparty',
                label: 'PDV acheteur / Contrepartie',
                value: (doc) => doc.counterparty,
              },
              {
                key: 'pdvManager',
                label: 'Gérant PDV',
                hidden: (doc) => !doc.pdvManager,
                value: (doc) => (
                  <span>
                    {doc.pdvCode ? `${doc.pdvCode} • ` : ''}
                    {doc.pdvManager}
                  </span>
                ),
              },
              {
                key: 'saleNumber',
                label: 'N° de vente',
                hidden: (doc) => !doc.saleNumber,
                value: (doc) => (
                  <span className="font-mono text-[#008DA9] dark:text-teal-400">
                    {doc.saleNumber}
                  </span>
                ),
              },
              {
                key: 'paymentMode',
                label: 'Règlement',
                value: (doc) => doc.paymentMode || 'Comptant',
              },
              {
                key: 'tvaRegime',
                label: 'Régime TVA',
                value: (doc) =>
                  doc.docKind === 'facture' && doc.withTva ? 'TVA 18 %' : 'Sans TVA',
              },
              {
                key: 'subtotalHt',
                label: 'HT',
                isAmount: true,
                value: (doc) => (
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {Number(doc.subtotalHt || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'tvaAmount',
                label: 'TVA',
                isAmount: true,
                value: (doc) => (
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {Number(doc.tvaAmount || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'amount',
                label: 'Total',
                isAmount: true,
                value: (doc) => (
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-white whitespace-nowrap">
                    {Number(doc.amount || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(doc) => {
              const isFacture = doc.docKind === 'facture';
              return isFacture && doc.rawSale ? (
                isComptable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openInvoiceGenerationModalForSale(doc.rawSale, doc.withTva)}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 shrink-0 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openVendorRectificationModal(doc.rawSale)}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Rectifier</span>
                    </button>
                  <button
                    type="button"
                    disabled={generatingSaleId === doc.rawSale.id}
                    onClick={() => handleGenerateAndOpenSaleInvoice(doc.rawSale, doc.withTva)}
                    className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Facture</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenDocument(
                        buildMiniThermalReceiptDoc({
                          ...doc.rawSale,
                          with_tva: doc.withTva ? 1 : 0,
                          subtotal_ht: doc.subtotalHt,
                          tva_rate: doc.withTva ? 18 : 0,
                          tva_amount: doc.tvaAmount,
                          total_ttc: doc.amount,
                        })
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition cursor-pointer"
                  >
                    <Receipt className="w-4 h-4 shrink-0" />
                    <span>Ticket</span>
                  </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openVendorRectificationModal(doc.rawSale)}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 shrink-0" />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.invoicePayload)}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Facture</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDocument(
                          buildMiniThermalReceiptDoc({
                            ...doc.rawSale,
                            with_tva: doc.withTva ? 1 : 0,
                            subtotal_ht: doc.subtotalHt,
                            tva_rate: doc.withTva ? 18 : 0,
                            tva_amount: doc.tvaAmount,
                            total_ttc: doc.amount,
                          })
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-xs transition cursor-pointer"
                    >
                      <Receipt className="w-4 h-4 shrink-0" />
                      <span>Ticket</span>
                    </button>
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc.invoicePayload)}
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Imprimer le reçu</span>
                </button>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Total HT :{' '}
                  <strong className="font-mono text-slate-900 dark:text-white baobab-amount">
                    {filteredPrintableDocs
                      .reduce((acc, d) => acc + Number(d.subtotalHt || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total TVA :{' '}
                  <strong className="font-mono text-slate-900 dark:text-white baobab-amount">
                    {filteredPrintableDocs
                      .reduce((acc, d) => acc + Number(d.tvaAmount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
                <span>
                  Total TTC :{' '}
                  <strong className="font-mono text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] baobab-amount">
                    {filteredPrintableDocs
                      .reduce((acc, d) => acc + Number(d.amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
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

          {/* Bons cadeaux — Composant partagé Liste de cartes */}
          <CardList<any>
            data={bonsCadeaux}
            rowKey={(b) => b.id}
            pageSize={20}
            searchable={true}
            searchPlaceholder="Rechercher par référence, semestre, vendeur, statut..."
            searchPredicate={(b, q) =>
              [b.id, b.semester, b.vendor_name, b.vendor_code, b.status]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(q)
            }
            sortOptions={[
              {
                key: 'delivered_desc',
                label: 'Valeur remise (décroissant)',
                compare: (a, b) => Number(b.delivered_total || 0) - Number(a.delivered_total || 0),
              },
              {
                key: 'note_desc',
                label: 'Note /20 (décroissant)',
                compare: (a, b) => Number(b.note_total || 0) - Number(a.note_total || 0),
              },
              {
                key: 'vendor_asc',
                label: 'Vendeur (A → Z)',
                compare: (a, b) => String(a.vendor_name || '').localeCompare(String(b.vendor_name || ''), 'fr'),
              },
            ]}
            defaultSortKey="delivered_desc"
            emptyMessage="Aucun bon cadeau enregistré pour ce semestre."
            title={(b) => (
              <div className="flex flex-wrap items-baseline justify-between gap-2 w-full min-w-0">
                <span className="font-mono font-extrabold text-sm sm:text-base text-slate-900 dark:text-white [overflow-wrap:anywhere]">
                  {String(b.id || '').toUpperCase()}
                </span>
                <span className="text-xs font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                  Semestre {b.semester}
                </span>
              </div>
            )}
            subtitle={(b) => (
              <span className="font-bold text-slate-800 dark:text-slate-200 [overflow-wrap:anywhere]">
                {b.vendor_name} ({b.vendor_code})
              </span>
            )}
            badges={(b) => (
              <>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    b.status === 'Remis' || b.status === 'Reçu'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : b.status === 'À préparer'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {b.status}
                </span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-50 text-[#008DA9] dark:bg-teal-950/60 dark:text-teal-300">
                  Note : {b.note_total} / 20
                </span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Rien en espèces (100 % FEFO)
                </span>
              </>
            )}
            fields={[
              {
                key: 'vendor',
                label: 'Vendeur bénéficiaire',
                render: (b) => (
                  <span className="[overflow-wrap:anywhere]">
                    <strong className="text-slate-900 dark:text-white">{b.vendor_name}</strong>{' '}
                    <span className="font-mono text-xs text-slate-500">({b.vendor_code})</span>
                  </span>
                ),
              },
              {
                key: 'semester',
                label: 'Semestre',
                render: (b) => b.semester,
              },
              {
                key: 'note',
                label: 'Note semestrielle',
                isAmount: true,
                render: (b) => (
                  <span className="font-black text-slate-900 dark:text-white whitespace-nowrap">
                    {b.note_total} / 20
                  </span>
                ),
              },
              {
                key: 'plafond',
                label: 'Plafond du bon',
                isAmount: true,
                render: (b) => (
                  <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {b.amount !== undefined
                      ? `${Number(b.amount).toLocaleString('fr-FR')} FCFA`
                      : 'Non révélé'}
                  </span>
                ),
              },
              {
                key: 'panier',
                label: 'Montant du panier',
                isAmount: true,
                render: (b) => (
                  <span className="font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {Number(b.basket_total || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'delivered',
                label: 'Valeur remise en marchandises',
                isAmount: true,
                render: (b) => (
                  <span className="font-black text-base text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {Number(b.delivered_total || 0).toLocaleString('fr-FR')} FCFA
                  </span>
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
                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Imprimer le bon</span>
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
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 pb-1">
                          Ventes PDV à facturer ({vendorSalesList.length}) :
                        </div>

                        {/* Ventes PDV rattachées au versement — Composant partagé Liste de cartes */}
                        <CardList<any>
                          data={vendorSalesList}
                          rowKey={(s) => s.id}
                          pageSize={20}
                          emptyMessage="Aucune vente PDV rattachée à ce vendeur."
                          title={(s) => (
                            <div className="flex items-start justify-between gap-3 w-full min-w-0">
                              <span className="font-mono font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere] min-w-0">
                                {s.invoice_number ||
                                  String(s.number || '').replace(/^VTE-/, 'FAC-')}
                              </span>
                              <span className="font-sans text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                                {s.date} • {s.sale_time || '10:30'}
                              </span>
                            </div>
                          )}
                          badges={(s) => {
                            const withTva = isTvaEnabledForSale(s);
                            return (
                              <>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#008DA9]/15 text-[#008DA9] border border-[#008DA9]/30">
                                  Facture A4
                                </span>
                                {withTva ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#92400E] text-white">
                                    TVA 18 %
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                                    Sans TVA
                                  </span>
                                )}
                              </>
                            );
                          }}
                          fields={[
                            {
                              key: 'saleNumber',
                              label: 'N° de vente',
                              value: (s) => (
                                <span className="font-mono text-[#008DA9] dark:text-teal-400">
                                  {s.number}
                                </span>
                              ),
                            },
                            {
                              key: 'vendor',
                              label: 'Au nom du Vendeur',
                              value: (s) => `${s.vendor_name} (${s.vendor_code})`,
                            },
                            {
                              key: 'pdv',
                              label: 'PDV Acheteur',
                              value: (s) =>
                                `${s.pdv_name}${s.pdv_neighborhood ? ` (${s.pdv_neighborhood})` : ''}${
                                  s.pdv_manager ? ` • Gérant : ${s.pdv_manager}` : ''
                                }`,
                            },
                            {
                              key: 'tvaSelector',
                              label: 'Sélecteur TVA',
                              hidden: () => !isComptable,
                              value: (s) => {
                                const withTva = isTvaEnabledForSale(s);
                                return (
                                  <div
                                    role="switch"
                                    aria-checked={withTva}
                                    className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleSaleTva(s.id, false)}
                                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
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
                                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                        withTva
                                          ? 'bg-[#92400E] text-white shadow-xs'
                                          : 'text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      + TVA 18 %
                                    </button>
                                  </div>
                                );
                              },
                            },
                            {
                              key: 'subtotalHt',
                              label: 'HT',
                              isAmount: true,
                              value: (s) => (
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA
                                </span>
                              ),
                            },
                            {
                              key: 'tvaAmount',
                              label: 'TVA',
                              isAmount: true,
                              value: (s) => {
                                const withTva = isTvaEnabledForSale(s);
                                const subtotalHt = Number(s.total_amount || 0);
                                const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
                                return (
                                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                    {tvaAmount.toLocaleString('fr-FR')} FCFA
                                  </span>
                                );
                              },
                            },
                            {
                              key: 'totalTtc',
                              label: 'TTC',
                              isAmount: true,
                              value: (s) => {
                                const withTva = isTvaEnabledForSale(s);
                                const subtotalHt = Number(s.total_amount || 0);
                                const tvaAmount = withTva ? Math.round(subtotalHt * 0.18) : 0;
                                const totalTtc = subtotalHt + tvaAmount;
                                return (
                                  <span className="font-mono font-black text-sm text-slate-900 dark:text-white whitespace-nowrap">
                                    {totalTtc.toLocaleString('fr-FR')} FCFA
                                  </span>
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
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                              >
                                <Printer className="w-4 h-4 shrink-0" />
                                <span>Générer la facture</span>
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
                                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs cursor-pointer"
                                >
                                  <Printer className="w-4 h-4 shrink-0" />
                                  <span>Imprimer</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedVersementForInvoicing(null);
                                    openVendorRectificationModal(s);
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-xs cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4 shrink-0" />
                                  <span>Modifier</span>
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">
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
                                <strong className="font-mono text-slate-900 dark:text-white baobab-amount">
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

      {/* MODAL DE RECTIFICATION DE FACTURE (Accessible à tous les rôles avec ajustement des cartons et de la TVA + preuve thermique 80mm) */}
      {rectificationModalSale && (
        <FormModal
          title="Rectification de Facture • Preuve par Mini Facture Thermique (80mm)"
          subtitle={
            <>
              Facture concernée :{' '}
              <strong>
                {rectificationModalSale.invoice_number ||
                  String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-')}
              </strong>{' '}
              • Vendeur :{' '}
              <strong>
                {rectificationModalSale.vendor_name || currentUser?.name} (
                {rectificationModalSale.vendor_code || currentUser?.code})
              </strong>
            </>
          }
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          onClose={() => setRectificationModalSale(null)}
          onSubmit={handleSubmitVendorRectification}
          submitLabel={
            <>
              <Send className="w-4 h-4 shrink-0" />
              <span>
                {isSubmittingRectification
                  ? 'Envoi en cours...'
                  : 'Envoyer la Demande de Rectification'}
              </span>
            </>
          }
          submitDisabled={isSubmittingRectification}
          isDirty={Boolean(rectificationReason.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 leading-snug">
              <strong>Procédure officielle de rectification :</strong> Indiquez les quantités exactes de cartons livrés, le régime TVA souhaité et le motif de rectification. La <strong>Mini Facture Thermique (`TKT-THERM-...`)</strong> ci-dessous est jointe automatiquement comme preuve officielle.
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Facture actuelle à rectifier
              </div>
              <div className="font-black text-sm text-slate-900 dark:text-white">
                {rectificationModalSale.invoice_number ||
                  String(rectificationModalSale.number || '').replace(/^VTE-/, 'FAC-')}{' '}
                — {rectificationModalSale.pdv_name} ({rectificationModalSale.pdv_neighborhood})
              </div>
              <div className="text-slate-500">
                Montant initial :{' '}
                <strong className="text-[#008DA9]">
                  {Number(rectificationModalSale.total_amount || 0).toLocaleString('fr-FR')} FCFA HT
                </strong>{' '}
                ({rectificationModalSale.with_tva ? 'Avec TVA 18 %' : 'Sans TVA'})
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Sélectionnez la vente / Mini Facture Thermique de référence *
              </label>
              <select
                value={selectedProofSaleId}
                onChange={(e) => {
                  const nextSaleId = e.target.value;
                  setSelectedProofSaleId(nextSaleId);
                  const found = visibleSales.find((s) => s.id === nextSaleId);
                  if (found) {
                    setRectificationItems(normalizeSaleItemsForEdit(found));
                    setRectificationWithTva(Boolean(found.with_tva));
                  }
                }}
                className={`${FORM_SELECT_CLASS} font-mono font-bold text-xs`}
              >
                {visibleSales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getThermalTicketNumber(s)} • Vente {s.number} du {s.date} à {s.sale_time || '10:30'} — {s.pdv_name} ({Number(s.total_amount || 0).toLocaleString('fr-FR')} FCFA)
                  </option>
                ))}
              </select>
            </div>

            {/* Éditeur des quantités corrigées (Cartons) et du régime TVA */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-slate-900 dark:text-white">
                  Quantités rectifiées (Cartons) sur le ticket de preuve
                </span>
                {products.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultProd = products[0];
                      const unitPrice = Number(defaultProd?.price_box || 18000);
                      setRectificationItems((prev) => [
                        ...prev,
                        {
                          productId: defaultProd?.id,
                          code: defaultProd?.code || 'BEN-01',
                          name: defaultProd?.name || 'Produit Baobab',
                          qtyBoxes: 1,
                          unitPrice,
                          total: unitPrice,
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-[#008DA9]" />
                    <span>Ajouter une ligne</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {rectificationItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700"
                  >
                    <div className="w-full min-w-0">
                      {products.length > 0 ? (
                        <select
                          value={item.code}
                          onChange={(e) => {
                            const prod = products.find((p) => p.code === e.target.value);
                            if (!prod) return;
                            const unitPrice = Number(prod.price_box || 18000);
                            setRectificationItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      productId: prod.id,
                                      code: prod.code,
                                      name: prod.name,
                                      unitPrice,
                                      total: it.qtyBoxes * unitPrice,
                                    }
                                  : it
                              )
                            );
                          }}
                          className="w-full px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.code}>
                              {p.code} — {p.name} ({Number(p.price_box || 0).toLocaleString('fr-FR')} F)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="font-bold text-slate-900 dark:text-white leading-snug">
                          {item.code} — {item.name}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setRectificationItems((prev) =>
                              prev.map((it, i) => {
                                if (i !== idx) return it;
                                const nextQty = Math.max(1, it.qtyBoxes - 1);
                                return { ...it, qtyBoxes: nextQty, total: nextQty * it.unitPrice };
                              })
                            )
                          }
                          className="h-[44px] w-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-base cursor-pointer shrink-0 flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={item.qtyBoxes}
                          onChange={(e) => {
                            const nextQty = Math.max(1, Number(e.target.value || 1));
                            setRectificationItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? { ...it, qtyBoxes: nextQty, total: nextQty * it.unitPrice }
                                  : it
                              )
                            );
                          }}
                          className="w-24 min-w-[76px] h-[44px] px-2 text-center font-mono font-extrabold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-base"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRectificationItems((prev) =>
                              prev.map((it, i) => {
                                if (i !== idx) return it;
                                const nextQty = it.qtyBoxes + 1;
                                return { ...it, qtyBoxes: nextQty, total: nextQty * it.unitPrice };
                              })
                            )
                          }
                          className="h-[44px] w-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-base cursor-pointer shrink-0 flex items-center justify-center"
                        >
                          +
                        </button>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1">
                          ctn
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2 ml-auto">
                        <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                          {Number(item.total || 0).toLocaleString('fr-FR')} F
                        </span>
                        {rectificationItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setRectificationItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Retirer la ligne"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sélecteur TVA souhaité pour la rectification */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Régime TVA demandé après rectification
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setRectificationWithTva(false)}
                    className={`h-[38px] rounded-lg font-bold text-xs transition cursor-pointer ${
                      !rectificationWithTva
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Sans TVA
                  </button>
                  <button
                    type="button"
                    onClick={() => setRectificationWithTva(true)}
                    className={`h-[38px] rounded-lg font-bold text-xs transition cursor-pointer ${
                      rectificationWithTva
                        ? 'bg-[#92400E] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    + TVA 18 %
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>
                Expliquez l&apos;erreur constatée sur la facture (Motif de la rectification) *
              </label>
              <textarea
                rows={3}
                required
                value={rectificationReason}
                onChange={(e) => setRectificationReason(e.target.value)}
                placeholder="Ex: Erreur sur le nombre de cartons facturés ou sur l'application de la TVA 18%. Voir la Mini Facture Thermique ci-jointe en preuve..."
                className={FORM_TEXTAREA_CLASS}
              />
            </div>

            {/* Live Preview of the Auto-Generated Mini Facture Thermique (80mm) attached as Proof */}
            <div className="flex flex-col items-center pt-1">
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
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-600 shrink-0">PDV Client :</span>
                        <span className="font-bold text-slate-950 text-right">{selectedProofSaleObj.pdv_name}</span>
                      </div>
                    </div>

                    <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                      <div className="text-[9px] font-black uppercase text-slate-500">
                        Articles rectifiés (Preuve de vente)
                      </div>
                      {rectificationItems.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[10px]">
                          <span>
                            {it.qtyBoxes}x {it.name}
                          </span>
                          <span className="font-bold">
                            {Number(it.total || 0).toLocaleString('fr-FR')} F
                          </span>
                        </div>
                      ))}
                    </div>

                    {(() => {
                      const proofHt = rectificationItems.reduce(
                        (s, it) => s + Number(it.total || 0),
                        0
                      );
                      const proofTva = rectificationWithTva ? Math.round(proofHt * 0.18) : 0;
                      const proofTtc = proofHt + proofTva;
                      return (
                        <div className="space-y-0.5 pt-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span>TOTAL HT :</span>
                            <span className="font-bold">{proofHt.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          {rectificationWithTva && (
                            <div className="flex justify-between items-center text-[10px]">
                              <span>TVA (18 %) :</span>
                              <span className="font-bold">{proofTva.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-xs font-black pt-0.5">
                            <span>TOTAL CERTIFIÉ :</span>
                            <span className="text-[#008DA9]">
                              {proofTtc.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </FormModal>
      )}

      {/* MODAL COMPTABLE / DIRECTION: Générer / Modifier / Rectifier une Facture pour un Vendeur */}
      {isComptable && showCreateInvoiceModal && (
        <FormModal
          title="Génération / Modification de Facture Vendeur"
          subtitle="Modifiez les quantités (cartons), le PDV acheteur ou le régime TVA • Mise à jour immédiate de la facture"
          icon={<FileText className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowCreateInvoiceModal(false)}
          onSubmit={handleComptableCreateInvoiceSubmit}
          submitLabel={isCreatingInvoiceForVendor ? 'Enregistrement...' : 'Générer la facture'}
          submitDisabled={isCreatingInvoiceForVendor}
        >
          {(() => {
            const selectedProdForPreview =
              createInvoiceMode === 'new_invoice'
                ? products.find((p) => p.id === newInvoiceProductId) || products[0]
                : null;
            const previewHt =
              createInvoiceMode === 'existing_sale'
                ? editSaleItems.reduce((sum, it) => sum + Number(it.total || 0), 0)
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
                    className={`min-h-[48px] h-auto py-3 px-3 rounded-lg font-bold transition cursor-pointer min-w-0 ${
                      createInvoiceMode === 'existing_sale'
                        ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Modifier / Facturer une vente existante
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateInvoiceMode('new_invoice')}
                    className={`min-h-[48px] h-auto py-3 px-3 rounded-lg font-bold transition cursor-pointer min-w-0 ${
                      createInvoiceMode === 'new_invoice'
                        ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Nouvelle facture directe Vendeur + PDV
                  </button>
                </div>

                {createInvoiceMode === 'existing_sale' ? (
                  <div className="space-y-4">
                    <div>
                      <label className={FORM_LABEL_CLASS}>
                        Sélectionner la vente / facture du vendeur *
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
                            setEditSalePdvId(nextSale.pdv_id || pdvs[0]?.id || '');
                            setEditSalePaymentType(nextSale.payment_type || 'Comptant');
                            setEditSaleItems(normalizeSaleItemsForEdit(nextSale));
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

                    <div className={FORM_ROW_CLASS}>
                      <div>
                        <label className={FORM_LABEL_CLASS}>PDV Acheteur *</label>
                        <select
                          value={editSalePdvId}
                          onChange={(e) => setEditSalePdvId(e.target.value)}
                          className={FORM_SELECT_CLASS}
                        >
                          {pdvs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.neighborhood}) — Gérant : {p.manager_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={FORM_LABEL_CLASS}>Mode de règlement *</label>
                        <select
                          value={editSalePaymentType}
                          onChange={(e) => setEditSalePaymentType(e.target.value)}
                          className={FORM_SELECT_CLASS}
                        >
                          <option value="Comptant">Comptant (Espèces)</option>
                          <option value="Mobile Money">Mobile Money</option>
                          <option value="Virement">Virement / Chèque</option>
                          <option value="Crédit PDV">Crédit PDV (À payer)</option>
                        </select>
                      </div>
                    </div>

                    {/* Éditeur des lignes d'articles de la facture */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Articles &amp; Quantités (Cartons) facturés
                        </span>
                        {products.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const defaultProd = products[0];
                              const unitPrice = Number(defaultProd?.price_box || 18000);
                              setEditSaleItems((prev) => [
                                ...prev,
                                {
                                  productId: defaultProd?.id,
                                  code: defaultProd?.code || 'BEN-01',
                                  name: defaultProd?.name || 'Produit Baobab',
                                  qtyBoxes: 1,
                                  unitPrice,
                                  total: unitPrice,
                                },
                              ]);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 text-slate-800 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5 text-[#008DA9]" />
                            <span>Ajouter un produit</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {editSaleItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex flex-col gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                          >
                            <div className="w-full min-w-0">
                              {products.length > 0 ? (
                                <select
                                  value={item.code}
                                  onChange={(e) => {
                                    const prod = products.find((p) => p.code === e.target.value);
                                    if (!prod) return;
                                    const unitPrice = Number(prod.price_box || 18000);
                                    setEditSaleItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? {
                                              ...it,
                                              productId: prod.id,
                                              code: prod.code,
                                              name: prod.name,
                                              unitPrice,
                                              total: it.qtyBoxes * unitPrice,
                                            }
                                          : it
                                      )
                                    );
                                  }}
                                  className="w-full px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                                >
                                  {products.map((p) => (
                                    <option key={p.id} value={p.code}>
                                      {p.code} — {p.name} ({Number(p.price_box || 0).toLocaleString('fr-FR')} F)
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="font-bold text-slate-900 dark:text-white leading-snug">
                                  {item.code} — {item.name}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditSaleItems((prev) =>
                                      prev.map((it, i) => {
                                        if (i !== idx) return it;
                                        const nextQty = Math.max(1, it.qtyBoxes - 1);
                                        return {
                                          ...it,
                                          qtyBoxes: nextQty,
                                          total: nextQty * it.unitPrice,
                                        };
                                      })
                                    )
                                  }
                                  className="h-[44px] w-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-black text-base cursor-pointer shrink-0 flex items-center justify-center"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={item.qtyBoxes}
                                  onChange={(e) => {
                                    const nextQty = Math.max(1, Number(e.target.value || 1));
                                    setEditSaleItems((prev) =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? {
                                              ...it,
                                              qtyBoxes: nextQty,
                                              total: nextQty * it.unitPrice,
                                            }
                                          : it
                                      )
                                    );
                                  }}
                                  className="w-24 min-w-[76px] h-[44px] px-2 text-center font-mono font-extrabold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-base"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditSaleItems((prev) =>
                                      prev.map((it, i) => {
                                        if (i !== idx) return it;
                                        const nextQty = it.qtyBoxes + 1;
                                        return {
                                          ...it,
                                          qtyBoxes: nextQty,
                                          total: nextQty * it.unitPrice,
                                        };
                                      })
                                    )
                                  }
                                  className="h-[44px] w-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-black text-base cursor-pointer shrink-0 flex items-center justify-center"
                                >
                                  +
                                </button>
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1">
                                  ctn
                                </span>
                              </div>

                              <div className="flex items-center justify-end gap-2 ml-auto">
                                <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                                  {Number(item.total || 0).toLocaleString('fr-FR')} F
                                </span>
                                {editSaleItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditSaleItems((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                    title="Supprimer la ligne"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
                            {b.code} — {b.name}
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
                      className={`min-h-[48px] h-auto px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        !newInvoiceWithTva
                          ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>Sans TVA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewInvoiceWithTva(true)}
                      className={`min-h-[48px] h-auto px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        newInvoiceWithTva
                          ? 'bg-[#92400E] text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5 shrink-0" />
                      <span>+ TVA 18 %</span>
                    </button>
                  </div>

                  {/* Aperçu en direct HT, TVA, TTC */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400">HT</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white baobab-amount">
                        {previewHt.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        TVA {newInvoiceWithTva ? '(18 %)' : '(0 %)'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white baobab-amount">
                        {previewTva.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-sm">
                      <span className="font-bold text-slate-900 dark:text-white">TTC (Total)</span>
                      <span className="font-mono font-bold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] baobab-amount">
                        {previewTtc.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </FormModal>
      )}
    </div>
  );
};

