import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  PlusCircle,
  Plus,
  Trash2,
  Edit2,
  ShieldAlert,
  Search,
  Filter,
  Download,
  ClipboardList,
  Check,
  PlayCircle,
  Clock,
  Send,
  Boxes,
  HelpCircle,
  Info,
  Gift
} from 'lucide-react';
import { StockBadge } from './StockBadge';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';

interface Product {
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

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'prod-caj',
    code: 'JUS-CAJ-12',
    name: 'Jus Cajoucy',
    gamme: 'Jus & Boissons',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9600,
    stock_depot: 850,
    threshold_depot: 100,
  },
  {
    id: 'prod-ben',
    code: 'MAY-BEN-12',
    name: 'Mayonnaise Bennor',
    gamme: 'Condiments & Sauces',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 14400,
    stock_depot: 720,
    threshold_depot: 80,
  },
  {
    id: 'prod-nor',
    code: 'EAU-NOR-06',
    name: 'Eau minérale Nora',
    gamme: 'Eaux Minérales',
    packaging: 'Pack de 6 x 1,5 L',
    units_per_box: 6,
    price_box: 2700,
    stock_depot: 1250,
    threshold_depot: 150,
  },
  {
    id: 'prod-saf',
    code: 'SAU-SAF-24',
    name: 'Sauce Piment Safie',
    gamme: 'Condiments & Sauces',
    packaging: 'Carton de 24',
    units_per_box: 24,
    price_box: 12000,
    stock_depot: 640,
    threshold_depot: 70,
  },
];

interface DepotMagasinViewProps {
  products: Product[];
  chargements: any[];
  receptions: any[];
  currentRole: string;
  currentUser: any;
  initialTab?: string;
  onNavigateTab?: (tab: string) => void;
  onRefreshData: () => void;
}

export const DepotMagasinView: React.FC<DepotMagasinViewProps> = ({
  products: propProducts,
  chargements,
  receptions,
  currentRole,
  currentUser,
  initialTab,
  onNavigateTab,
  onRefreshData,
}) => {
  // Local fallback products in case propProducts hasn't loaded yet
  const [fetchedProducts, setFetchedProducts] = useState<Product[]>([]);
  const products = useMemo<Product[]>(() => {
    const rawList =
      propProducts && propProducts.length > 0
        ? propProducts
        : fetchedProducts.length > 0
        ? fetchedProducts
        : FALLBACK_PRODUCTS;
    return rawList.map((p) => ({
      ...p,
      stock_depot: Number(p.stock_depot ?? 500),
      price_box: Number(p.price_box ?? 10000),
      units_per_box: Number(p.units_per_box ?? 12),
      threshold_depot: Number(p.threshold_depot ?? 50),
    }));
  }, [propProducts, fetchedProducts]);

  // Sync tab with initialTab prop or internal navigation
  const [activeTab, setActiveTab] = useState<'stock' | 'receptions' | 'lots' | 'chargements' | 'retours' | 'inventaire' | 'movements' | 'bons-a-remettre' | 'test'>(() => {
    if (initialTab === 'lots') return 'lots';
    if (initialTab === 'receptions') return 'receptions';
    if (initialTab === 'chargements' || initialTab === 'chargements-lecture' || initialTab === 'mon-chargement' || initialTab === 'mes-chargements') return 'chargements';
    if (initialTab === 'retours') return 'retours';
    if (initialTab === 'inventaire') return 'inventaire';
    if (initialTab === 'bons-a-remettre') return 'bons-a-remettre';
    return 'stock';
  });

  useEffect(() => {
    if (initialTab === 'lots') setActiveTab('lots');
    else if (initialTab === 'receptions') setActiveTab('receptions');
    else if (initialTab === 'chargements' || initialTab === 'chargements-lecture' || initialTab === 'mon-chargement' || initialTab === 'mes-chargements') setActiveTab('chargements');
    else if (initialTab === 'retours') setActiveTab('retours');
    else if (initialTab === 'inventaire') setActiveTab('inventaire');
    else if (initialTab === 'bons-a-remettre') setActiveTab('bons-a-remettre');
    else if (initialTab === 'stock-depot' || initialTab === 'stocks') setActiveTab('stock');
  }, [initialTab]);

  // Data states
  const [lots, setLots] = useState<any[]>([]);
  const [retoursList, setRetoursList] = useState<any[]>([]);
  const [movementsList, setMovementsList] = useState<any[]>([]);
  const [inventoriesList, setInventoriesList] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [bonsList, setBonsList] = useState<any[]>([]);
  const [fefoCatalog, setFefoCatalog] = useState<any[]>([]);
  const [bonActionMsg, setBonActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [replacingTarget, setReplacingTarget] = useState<{ bonId: string; oldProductId: string; oldName: string; maxAmount: number } | null>(null);
  const [newReplaceProductId, setNewReplaceProductId] = useState<string>('');
  const [newReplaceQty, setNewReplaceQty] = useState<number>(1);
  const [replaceReason, setReplaceReason] = useState<string>('Rupture de stock sur le lot demandé — remplacement proposé par le Magasinier');
  const [isProcessingBon, setIsProcessingBon] = useState<string | null>(null);
  const [bonTestSummary, setBonTestSummary] = useState<any | null>(null);
  const [testResults, setTestResults] = useState<{ success: boolean; message: string; steps: string[] } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Fetch lots, retours, movements, bons, and products
  const fetchAuxData = async () => {
    try {
      const [lRes, rRes, mRes, iRes, uRes, pRes, bRes] = await Promise.all([
        fetch('/api/lots').then(r => r.json()).catch(() => ({ lots: [] })),
        fetch('/api/retours').then(r => r.json()).catch(() => ({ retours: [] })),
        fetch('/api/stock-movements').then(r => r.json()).catch(() => ({ movements: [] })),
        fetch('/api/inventaires-vendeur').then(r => r.json()).catch(() => ({ inventories: [] })),
        fetch('/api/users').then(r => r.json()).catch(() => ({ users: [] })),
        fetch('/api/products').then(r => r.json()).catch(() => ({ products: [] })),
        fetch('/api/bons', {
          headers: {
            'x-user-role': currentRole,
            'x-user-id': currentUser?.id || '',
          },
        }).then(r => r.json()).catch(() => ({ bons: [], fefoCatalog: [] })),
      ]);

      if (lRes.lots) setLots(lRes.lots);
      if (rRes.retours) setRetoursList(rRes.retours);
      if (mRes.movements) setMovementsList(mRes.movements);
      if (iRes.inventories) setInventoriesList(iRes.inventories);
      if (uRes.users) setVendorsList(uRes.users.filter((u: any) => u.role === 'Vendeur'));
      if (pRes.products && pRes.products.length > 0) setFetchedProducts(pRes.products);
      if (bRes.bons) setBonsList(bRes.bons);
      if (bRes.fefoCatalog) setFefoCatalog(bRes.fefoCatalog);
    } catch (e) {
      console.warn('Error loading aux depot data:', e);
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, [chargements, receptions]);

  const handleConfirmBonRemise = async (bonId: string) => {
    setBonActionMsg(null);
    setIsProcessingBon(bonId);
    try {
      const res = await fetch(`/api/bons/${bonId}/remise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || 'Magasinier',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setBonActionMsg({ type: 'error', text: data.error || 'Erreur lors de la remise du bon cadeau.' });
      } else {
        setBonActionMsg({
          type: 'success',
          text: data.message || 'Remise effectuée : sortie de stock de type « Bon cadeau » enregistrée (FEFO).',
        });
        await fetchAuxData();
        onRefreshData();
      }
    } catch {
      setBonActionMsg({ type: 'error', text: 'Erreur réseau lors de la remise.' });
    } finally {
      setIsProcessingBon(null);
    }
  };

  const handleOpenReplaceModal = (bon: any, item: any) => {
    const candidate = fefoCatalog.find(p => p.id !== item.productId && p.available_fefo > 0) || fefoCatalog[0];
    setReplacingTarget({
      bonId: bon.id,
      oldProductId: item.productId,
      oldName: item.name,
      maxAmount: Number(bon.amount || 40000),
    });
    setNewReplaceProductId(candidate?.id || '');
    setNewReplaceQty(1);
    setReplaceReason(`Rupture sur ${item.name} — remplacement proposé en stock non périmé (FEFO)`);
  };

  const handleConfirmReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingTarget || !newReplaceProductId) return;
    setBonActionMsg(null);
    setIsProcessingBon(replacingTarget.bonId);
    try {
      const res = await fetch(`/api/bons/${replacingTarget.bonId}/remplacement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || 'Magasinier',
        },
        body: JSON.stringify({
          oldProductId: replacingTarget.oldProductId,
          newProductId: newReplaceProductId,
          qtyBoxes: newReplaceQty,
          reason: replaceReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBonActionMsg({ type: 'error', text: data.error || 'Erreur lors du remplacement.' });
      } else {
        setBonActionMsg({ type: 'success', text: data.message || 'Remplacement proposé enregistré.' });
        setReplacingTarget(null);
        await fetchAuxData();
        onRefreshData();
      }
    } catch {
      setBonActionMsg({ type: 'error', text: 'Erreur réseau lors du remplacement.' });
    } finally {
      setIsProcessingBon(null);
    }
  };

  const handleRunBonTestScenario = async () => {
    setBonActionMsg(null);
    setIsProcessingBon('test');
    try {
      const res = await fetch('/api/bons/test-panier-remise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || 'Magasinier',
        },
      });
      const data = await res.json();
      if (data.verification) {
        setBonTestSummary(data.verification);
        setBonActionMsg({
          type: 'success',
          text: `Test validé : Bon de ${data.verification.bon_amount.toLocaleString('fr-FR')} FCFA, panier de ${data.verification.basket_total.toLocaleString('fr-FR')} FCFA, remise effectuée (type "${data.verification.movement_type}"), stock Jus Cajoucy en baisse (${data.verification.stock_before} → ${data.verification.stock_after} cartons).`,
        });
        await fetchAuxData();
        onRefreshData();
      }
    } catch {
      setBonActionMsg({ type: 'error', text: 'Erreur lors du test panier & remise.' });
    } finally {
      setIsProcessingBon(null);
    }
  };

  // ----------------------------------------------------
  // 1. RÉCEPTIONS (Magasinier)
  // Lignes avec produit, cartons, numéro de lot et date de péremption obligatoires ; mouvement entrant (journal en ajout seul, jamais négatif)
  // ----------------------------------------------------
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [supplierName, setSupplierName] = useState('Usines Partenaires Agroalimentaires Mali');
  const [receptionLines, setReceptionLines] = useState<Array<{ productId: string; cartons: number; lotNumber: string; expiryDate: string }>>([
    { productId: products[0]?.id || '', cartons: 100, lotNumber: `LOT-${Date.now().toString().slice(-4)}`, expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0] }
  ]);
  const [receptionError, setReceptionError] = useState('');
  const [isSubmittingReception, setIsSubmittingReception] = useState(false);

  const addReceptionLine = () => {
    setReceptionLines(prev => [
      ...prev,
      { productId: products[0]?.id || '', cartons: 50, lotNumber: '', expiryDate: '' }
    ]);
  };

  const removeReceptionLine = (idx: number) => {
    if (receptionLines.length <= 1) return;
    setReceptionLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateReception = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceptionError('');

    // Validate each line
    for (let i = 0; i < receptionLines.length; i++) {
      const line = receptionLines[i];
      if (!line.productId) {
        setReceptionError(`Ligne ${i + 1} : Veuillez choisir un produit.`);
        return;
      }
      if (!line.cartons || line.cartons <= 0) {
        setReceptionError(`Ligne ${i + 1} : Le nombre de cartons doit être supérieur à 0.`);
        return;
      }
      if (!line.lotNumber.trim()) {
        setReceptionError(`Ligne ${i + 1} : Le numéro de lot est obligatoire.`);
        return;
      }
      if (!line.expiryDate.trim()) {
        setReceptionError(`Ligne ${i + 1} : La date de péremption est obligatoire.`);
        return;
      }
    }

    setIsSubmittingReception(true);
    try {
      const res = await fetch('/api/receptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          supplier_name: supplierName,
          lines: receptionLines
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setReceptionError(data.error || 'Erreur lors de la réception.');
      } else {
        setShowReceptionModal(false);
        setReceptionLines([{ productId: products[0]?.id || '', cartons: 100, lotNumber: '', expiryDate: '' }]);
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setReceptionError('Erreur de connexion serveur.');
    } finally {
      setIsSubmittingReception(false);
    }
  };

  // ----------------------------------------------------
  // 2. LOTS (Écran "Lots", statuts >90j vert, 30-90 marron, <30 rouge, périmé gris, filtres, CSV, sortie perte)
  // ----------------------------------------------------
  const [lotFilterProduct, setLotFilterProduct] = useState<string>('all');
  const [lotFilterStatus, setLotFilterStatus] = useState<string>('all'); // all, bon, attention, urgent, perime
  const [lotSearchTerm, setLotSearchTerm] = useState<string>('');

  // Loss / Casse / Péremption modal
  const [showLossModal, setShowLossModal] = useState(false);
  const [selectedLotForLoss, setSelectedLotForLoss] = useState<any>(null);
  const [lossQuantity, setLossQuantity] = useState<number>(1);
  const [lossMotif, setLossMotif] = useState<string>('Casse manipulation au déchargement');
  const [lossError, setLossError] = useState('');
  const [isSubmittingLoss, setIsSubmittingLoss] = useState(false);

  const filteredLots = useMemo(() => {
    return lots.filter(lot => {
      if (lotFilterProduct !== 'all' && lot.product_id !== lotFilterProduct) return false;
      if (lotFilterStatus !== 'all' && lot.shelf_life_status !== lotFilterStatus) return false;
      if (lotSearchTerm.trim()) {
        const q = lotSearchTerm.toLowerCase();
        const matchesNum = lot.lot_number?.toLowerCase().includes(q);
        const matchesProd = lot.product_name?.toLowerCase().includes(q);
        if (!matchesNum && !matchesProd) return false;
      }
      return true;
    });
  }, [lots, lotFilterProduct, lotFilterStatus, lotSearchTerm]);

  // CSV Export for Lots
  const handleExportLotsCSV = () => {
    const headers = ['N° Lot', 'Produit', 'Code', 'Cartons Restants', 'Cartons Initiaux', 'Date Péremption', 'Jours Restants', 'Statut Rayon'];
    const rows = filteredLots.map(l => [
      `"${l.lot_number}"`,
      `"${l.product_name}"`,
      `"${l.product_code}"`,
      l.quantity,
      l.initial_quantity || l.quantity,
      l.expiry_date,
      l.days_remaining,
      `"${l.shelf_life_label}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `lots_baobab_distribution_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenLossModal = (lot: any) => {
    setSelectedLotForLoss(lot);
    setLossQuantity(1);
    setLossMotif(lot.is_expired ? 'Péremption de lot constatée' : 'Casse manipulation au déchargement');
    setLossError('');
    setShowLossModal(true);
  };

  const handleConfirmLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotForLoss) return;
    setLossError('');

    if (lossQuantity <= 0 || lossQuantity > selectedLotForLoss.quantity) {
      setLossError(`Quantité invalide (doit être entre 1 et ${selectedLotForLoss.quantity} cartons).`);
      return;
    }
    if (!lossMotif.trim()) {
      setLossError('Le motif est obligatoire.');
      return;
    }

    setIsSubmittingLoss(true);
    try {
      const res = await fetch('/api/lots/exit-loss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          lot_id: selectedLotForLoss.id,
          quantity: lossQuantity,
          motif: lossMotif.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setLossError(data.error || 'Erreur lors de la sortie perte.');
      } else {
        setShowLossModal(false);
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setLossError('Erreur de connexion serveur.');
    } finally {
      setIsSubmittingLoss(false);
    }
  };

  // ----------------------------------------------------
  // 3. CHARGEMENT (Vendeur demande ligne par ligne & Magasinier valide/ajuste/rejette/confirme remise)
  // Règle stricte : "le Vendeur demande, multi-produits ligne par ligne (choisir, 'Valider ce choix', puis '+ Ajouter un produit' seulement après validation, pas de doublon, quantité plafonnée au stock dépôt, date souhaitée)."
  // ----------------------------------------------------
  const [showRequestLoadingModal, setShowRequestLoadingModal] = useState(false);
  const [desiredDate, setDesiredDate] = useState(new Date().toISOString().split('T')[0]);
  const [chargementSuccessMsg, setChargementSuccessMsg] = useState<string>('');
  
  // Line-by-line builder state
  const [validatedLines, setValidatedLines] = useState<Array<{ productId: string; code: string; name: string; requestedBoxes: number; unitPrice: number; total: number }>>([]);
  const [currentLineProductId, setCurrentLineProductId] = useState<string>('');
  const [currentLineQty, setCurrentLineQty] = useState<number>(10);
  const [lineBuilderError, setLineBuilderError] = useState<string>('');
  const [isAddingLine, setIsAddingLine] = useState<boolean>(true); // true while selecting/validating current line
  const [isSubmittingChargement, setIsSubmittingChargement] = useState(false);

  // Available products for current line (excluding duplicates!)
  const availableProductsForLine = useMemo(() => {
    const alreadyChosenIds = new Set(validatedLines.map(l => l.productId));
    return products.filter(p => !alreadyChosenIds.has(p.id) && p.stock_depot > 0);
  }, [products, validatedLines]);

  useEffect(() => {
    if (availableProductsForLine.length > 0) {
      const existsInAvailable = availableProductsForLine.some(p => p.id === currentLineProductId);
      if (!currentLineProductId || !existsInAvailable) {
        setCurrentLineProductId(availableProductsForLine[0].id);
        setCurrentLineQty(Math.min(10, availableProductsForLine[0].stock_depot));
      }
    }
  }, [availableProductsForLine, currentLineProductId]);

  const handleSelectProductForLine = (productId: string) => {
    setLineBuilderError('');
    setChargementSuccessMsg('');
    const p = availableProductsForLine.find(prod => prod.id === productId);
    if (!p) return;
    setIsAddingLine(true);
    setCurrentLineProductId(p.id);
    setCurrentLineQty(prev => Math.max(1, Math.min(prev || 10, p.stock_depot)));
  };

  // Step 1: "Valider ce choix"
  const handleValidateCurrentChoice = () => {
    setLineBuilderError('');
    setChargementSuccessMsg('');
    const p = products.find(prod => prod.id === currentLineProductId);
    if (!p) {
      setLineBuilderError('Veuillez sélectionner un produit dans la liste.');
      return;
    }
    if (validatedLines.some(l => l.productId === p.id)) {
      setLineBuilderError('Ce produit a déjà été ajouté à votre demande (pas de doublon).');
      return;
    }
    if (currentLineQty <= 0) {
      setLineBuilderError('La quantité doit être supérieure à 0.');
      return;
    }
    if (currentLineQty > p.stock_depot) {
      setLineBuilderError(`Quantité plafonnée au stock dépôt disponible (${p.stock_depot} cartons).`);
      return;
    }

    setValidatedLines(prev => [
      ...prev,
      {
        productId: p.id,
        code: p.code,
        name: p.name,
        requestedBoxes: currentLineQty,
        unitPrice: p.price_box,
        total: currentLineQty * p.price_box
      }
    ]);

    // Current choice validated! Next line can now be added via "+ Ajouter un produit"
    setIsAddingLine(false);
    setCurrentLineProductId('');
  };

  // Step 2: "+ Ajouter un produit" (seulement après validation)
  const handleStartNextLine = () => {
    setLineBuilderError('');
    if (availableProductsForLine.length === 0) {
      setLineBuilderError('Tous les produits disponibles ont déjà été ajoutés.');
      return;
    }
    setCurrentLineProductId(availableProductsForLine[0].id);
    setCurrentLineQty(Math.min(10, availableProductsForLine[0].stock_depot));
    setIsAddingLine(true);
  };

  const handleRemoveValidatedLine = (idx: number) => {
    setValidatedLines(prev => prev.filter((_, i) => i !== idx));
    setLineBuilderError('');
  };

  const handleSubmitChargementRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLineBuilderError('');
    setChargementSuccessMsg('');
    if (validatedLines.length === 0) {
      setLineBuilderError('Veuillez choisir un produit et cliquer sur "Valider ce choix" avant d\'envoyer la demande.');
      return;
    }
    if (!desiredDate) {
      setLineBuilderError('La date souhaitée est obligatoire.');
      return;
    }

    setIsSubmittingChargement(true);
    try {
      const res = await fetch('/api/chargements/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          vendor_id: currentUser.id,
          desired_date: desiredDate,
          items: validatedLines
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setLineBuilderError(data.error || 'Erreur lors de la soumission de la demande.');
      } else {
        setShowRequestLoadingModal(false);
        setValidatedLines([]);
        setIsAddingLine(true);
        setChargementSuccessMsg(`Demande de chargement ${data.chargement?.reference || ''} envoyée avec succès au Magasinier (Statut : Demandée).`);
        onRefreshData();
      }
    } catch {
      setLineBuilderError('Erreur de connexion serveur.');
    } finally {
      setIsSubmittingChargement(false);
    }
  };

  // Magasinier actions: Validate / Adjust / Reject / Confirm Remise
  const [rejectingChargementId, setRejectingChargementId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [adjustingChargement, setAdjustingChargement] = useState<any | null>(null);
  const [adjustedQuantities, setAdjustedQuantities] = useState<{ [productId: string]: number }>({});

  const handleMagasinierValidate = async (id: string) => {
    try {
      const res = await fetch(`/api/chargements/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole },
        body: JSON.stringify({ decision: 'validate' })
      });
      if (res.ok) onRefreshData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAdjustModal = (chg: any) => {
    setAdjustingChargement(chg);
    const initialAdj: { [key: string]: number } = {};
    for (const it of chg.items) {
      initialAdj[it.productId] = it.requestedBoxes;
    }
    setAdjustedQuantities(initialAdj);
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingChargement) return;

    const adjustedItems = adjustingChargement.items.map((it: any) => ({
      ...it,
      validatedBoxes: Number(adjustedQuantities[it.productId] ?? it.requestedBoxes)
    }));

    try {
      const res = await fetch(`/api/chargements/${adjustingChargement.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole },
        body: JSON.stringify({
          decision: 'adjust',
          adjustedItems
        })
      });
      if (res.ok) {
        setAdjustingChargement(null);
        onRefreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenRejectModal = (id: string) => {
    setRejectingChargementId(id);
    setRejectionReason('Stock central réservé pour réapprovisionnement prioritaire');
  };

  const handleSubmitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingChargementId || !rejectionReason.trim()) return;

    try {
      const res = await fetch(`/api/chargements/${rejectingChargementId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole },
        body: JSON.stringify({
          decision: 'reject',
          rejection_reason: rejectionReason.trim()
        })
      });
      if (res.ok) {
        setRejectingChargementId(null);
        onRefreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Remise Physique (Magasinier confirme la remise : stock dépôt - et vendeur +)
  const handleConfirmRemise = async (id: string) => {
    try {
      const res = await fetch(`/api/chargements/${id}/confirm-remise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onRefreshData();
        fetchAuxData();
      } else {
        alert(data.error || 'Erreur lors de la remise');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Annulation par le Vendeur (tant que "Demandée")
  const handleCancelChargement = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette demande de chargement ?')) return;
    try {
      const res = await fetch(`/api/chargements/${id}/cancel`, {
        method: 'DELETE',
        headers: { 'x-user-role': currentRole }
      });
      if (res.ok) onRefreshData();
    } catch (e) {
      console.error(e);
    }
  };

  // ----------------------------------------------------
  // 4. RETOURS (Vendeur rend l'invendu, le Magasinier confirme)
  // ----------------------------------------------------
  const [showRetourModal, setShowRetourModal] = useState(false);
  const [retourItems, setRetourItems] = useState<{ [productId: string]: number }>({});
  const [retourReason, setRetourReason] = useState('Invendus fin de tournée hebdomadaire');
  const [isSubmittingRetour, setIsSubmittingRetour] = useState(false);

  const handleDeclareRetour = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemsPayload = Object.entries(retourItems)
      .filter(([_, boxes]) => boxes > 0)
      .map(([pId, boxes]) => {
        const prod = products.find(p => p.id === pId);
        return {
          productId: pId,
          code: prod?.code || pId,
          name: prod?.name || pId,
          boxes: Number(boxes),
          unitPrice: prod?.price_box || 0
        };
      });

    if (itemsPayload.length === 0) {
      alert('Veuillez spécifier au moins un carton invendu à retourner.');
      return;
    }

    setIsSubmittingRetour(true);
    try {
      const res = await fetch('/api/retours/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole },
        body: JSON.stringify({
          vendor_id: currentUser.id,
          items: itemsPayload,
          reason: retourReason
        })
      });
      if (res.ok) {
        setShowRetourModal(false);
        setRetourItems({});
        onRefreshData();
        fetchAuxData();
      }
    } finally {
      setIsSubmittingRetour(false);
    }
  };

  const handleConfirmRetour = async (id: string) => {
    try {
      const res = await fetch(`/api/retours/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentRole }
      });
      const d = await res.json();
      if (res.ok && d.success) {
        onRefreshData();
        fetchAuxData();
      } else {
        alert(d.error || 'Erreur lors de la confirmation du retour.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ----------------------------------------------------
  // 5. ÉCARTS (Stock théorique = chargé - vendu - rendu comparé à l'inventaire vendeur ; écart en FCFA, notification Admin & Compta)
  // ----------------------------------------------------
  const [selectedVendorForInv, setSelectedVendorForInv] = useState<string>(vendorsList[0]?.id || 'usr-vnd-1');
  const [theoreticalStock, setTheoreticalStock] = useState<any[]>([]);
  const [physicalCountInput, setPhysicalCountInput] = useState<{ [productId: string]: number }>({});
  const [inventoryNotes, setInventoryNotes] = useState('Contrôle physique de fin de journée au dépôt central');
  const [isSubmittingInventory, setIsSubmittingInventory] = useState(false);
  const [lastInventoryResult, setLastInventoryResult] = useState<any | null>(null);

  useEffect(() => {
    if (currentRole === 'Vendeur' && currentUser?.id) {
      setSelectedVendorForInv(currentUser.id);
    } else if (vendorsList.length > 0 && !selectedVendorForInv) {
      setSelectedVendorForInv(vendorsList[0].id);
    }
  }, [vendorsList, selectedVendorForInv, currentRole, currentUser?.id]);

  // Fetch theoretical stock for selected vendor
  const fetchTheoretical = async (vId: string) => {
    if (!vId) return;
    try {
      const res = await fetch(`/api/inventaires-vendeur/theoretical/${vId}`);
      if (res.ok) {
        const d = await res.json();
        if (d.theoreticalStock) {
          setTheoreticalStock(d.theoreticalStock);
          const initialPhysical: { [k: string]: number } = {};
          d.theoreticalStock.forEach((it: any) => {
            initialPhysical[it.productId] = it.theoreticalQty; // default to theoretical count
          });
          setPhysicalCountInput(initialPhysical);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const targetVendorId = currentRole === 'Vendeur' && currentUser?.id ? currentUser.id : selectedVendorForInv;
    if (activeTab === 'inventaire' && targetVendorId) {
      fetchTheoretical(targetVendorId);
    }
  }, [activeTab, selectedVendorForInv, chargements, currentRole, currentUser?.id]);

  // Calculate live variances
  const liveVariance = useMemo(() => {
    let totalEcartBoxes = 0;
    let totalEcartFcfa = 0;

    const items = theoreticalStock.map(it => {
      const counted = Number(physicalCountInput[it.productId] ?? it.theoreticalQty);
      const diff = counted - it.theoreticalQty;
      const diffFcfa = diff * it.price_box;
      totalEcartBoxes += diff;
      totalEcartFcfa += diffFcfa;
      return {
        ...it,
        counted,
        diff,
        diffFcfa
      };
    });

    return { totalEcartBoxes, totalEcartFcfa, items };
  }, [theoreticalStock, physicalCountInput]);

  const handleSubmitVendorInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorForInv) return;

    setIsSubmittingInventory(true);
    try {
      const payload = theoreticalStock.map(it => ({
        productId: it.productId,
        countedQty: Number(physicalCountInput[it.productId] ?? it.theoreticalQty),
        theoreticalQty: it.theoreticalQty
      }));

      const res = await fetch('/api/inventaires-vendeur', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          vendor_id: selectedVendorForInv,
          counted_items: payload,
          notes: inventoryNotes
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastInventoryResult(data.inventory);
        fetchAuxData();
      } else {
        alert(data.error || 'Erreur lors de l\'enregistrement de l\'inventaire.');
      }
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  // ----------------------------------------------------
  // TEST SCENARIO RUNNER:
  // "Test : réception de 100 cartons, chargement de 20, vente de 5, retour de 3."
  // ----------------------------------------------------
  const handleRunIntegratedTest = async () => {
    setIsTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/tests/run-workflow-test', {
        method: 'POST',
        headers: { 'x-user-role': 'Administrateur' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResults({
          success: true,
          message: data.message,
          steps: data.steps
        });
        onRefreshData();
        fetchAuxData();
      } else {
        setTestResults({
          success: false,
          message: data.error || 'Échec du test de workflow.',
          steps: []
        });
      }
    } catch {
      setTestResults({
        success: false,
        message: 'Erreur réseau lors du test.',
        steps: []
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isMagasinier = currentRole === 'Magasinier';
  const isAdmin = currentRole === 'Administrateur';
  const isVendeur = currentRole === 'Vendeur';

  const visibleChargements = useMemo(() => {
    if (isVendeur && currentUser) {
      return chargements.filter(
        (c) => c.vendor_id === currentUser.id || c.vendor_code === currentUser.code
      );
    }
    return chargements;
  }, [chargements, isVendeur, currentUser]);

  const visibleRetours = useMemo(() => {
    if (isVendeur && currentUser) {
      return retoursList.filter(
        (r) => r.vendor_id === currentUser.id || r.vendor_code === currentUser.code
      );
    }
    return retoursList;
  }, [retoursList, isVendeur, currentUser]);

  const visibleInventories = useMemo(() => {
    if (isVendeur && currentUser) {
      return inventoriesList.filter(
        (inv) => inv.vendor_id === currentUser.id || inv.vendor_code === currentUser.code
      );
    }
    return inventoriesList;
  }, [inventoriesList, isVendeur, currentUser]);

  const handleExportActiveDepotTabPdf = (targetTab = activeTab) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const roleLabel = `Utilisateur : ${currentUser?.name || currentRole} (${currentRole})`;

    if (targetTab === 'stock') {
      const totalCartons = products.reduce((sum, p) => sum + Number(p.stock_depot || 0), 0);
      const totalValue = products.reduce((sum, p) => sum + Number(p.stock_depot || 0) * Number(p.price_box || 0), 0);
      exportTableToPdf({
        title: 'Inventaire du Stock - Depot Central Sotuba',
        subtitle: 'Etat physique des stocks et valorisation par produit (Objectif couverture 30-45 jours)',
        filename: `stock_depot_central_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [
          { label: 'Produits references', value: `${products.length} produits` },
          { label: 'Total cartons en stock', value: `${totalCartons} cartons` },
          { label: 'Valorisation totale', value: formatFcfaPdf(totalValue) },
        ],
        columns: [
          'Code Ref.',
          'Produit',
          'Gamme',
          'Conditionnement',
          'Prix Carton',
          'Stock Depot',
          'Seuil Alerte',
          'Valeur Stock (FCFA)',
        ],
        rows: products.map((p) => [
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
      return;
    }

    if (targetTab === 'lots') {
      const totalCartons = filteredLots.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
      exportTableToPdf({
        title: 'Tracabilite des Lots & Priorite FEFO - Depot Central',
        subtitle: 'Suivi des dates de peremption et des quantites disponibles par lot',
        filename: `lots_fefo_baobab_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [
          { label: 'Lots affiches', value: `${filteredLots.length} lots` },
          { label: 'Cartons disponibles', value: `${totalCartons} cartons` },
        ],
        columns: [
          'N° Lot',
          'Code Produit',
          'Designation Produit',
          'Date Peremption',
          'Delai Restant',
          'Statut Rayon',
          'Stock Dispo',
        ],
        rows: filteredLots.map((l) => [
          l.lot_number,
          l.product_code || '',
          l.product_name || '',
          l.expiry_date || '',
          l.days_remaining <= 0 ? 'Expire' : `${l.days_remaining} jours`,
          l.shelf_life_label || '',
          `${l.quantity || 0} ctn`,
        ]),
      });
      return;
    }

    if (targetTab === 'chargements') {
      const totalValue = visibleChargements.reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
      exportTableToPdf({
        title: isVendeur
          ? `Mes Chargements Camionnette - ${currentUser?.name || ''}`
          : 'Chargements Vendeurs (Depot-Vente)',
        subtitle: 'Historique et statut des chargements de stock camionnette',
        filename: `chargements_stocks_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [
          { label: 'Nombre de chargements', value: `${visibleChargements.length}` },
          { label: 'Valeur totale', value: formatFcfaPdf(totalValue) },
        ],
        columns: [
          'Reference',
          'Date & Souhaitee',
          'Vendeur (Code)',
          'Lignes de Produits',
          'Statut',
          'Valeur (FCFA)',
        ],
        rows: visibleChargements.map((c) => {
          const items = typeof c.items === 'string' ? JSON.parse(c.items) : c.items || [];
          const detail = items
            .map(
              (it: any) =>
                `${it.name}: ${
                  it.validatedBoxes !== undefined ? it.validatedBoxes : it.requestedBoxes || it.qtyBoxes || 0
                } ctn`
            )
            .join(', ');
          return [
            c.reference || c.id,
            `${c.date || ''} (Souh: ${c.desired_date || c.date || ''})`,
            `${c.vendor_name || ''} (${c.vendor_code || ''})`,
            detail,
            c.status === 'valide' ? 'Chargee' : c.status || 'Demandee',
            formatFcfaPdf(c.total_amount),
          ];
        }),
      });
      return;
    }

    if (targetTab === 'receptions') {
      exportTableToPdf({
        title: 'Receptions Fournisseurs - Entrees en Stock Depot',
        subtitle: 'Historique des livraisons usines et entrees de lots au depot central',
        filename: `receptions_fournisseurs_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [{ label: 'Total receptions', value: `${receptions.length} bons` }],
        columns: ['Reference', 'Date', 'Fournisseur', 'Detail des Lots Recus', 'Total Cartons'],
        rows: receptions.map((r) => {
          const items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items || [];
          const totalBoxes = items.reduce((acc: number, it: any) => acc + Number(it.cartons || it.qtyBoxes || 0), 0);
          const detail = items
            .map((it: any) => `${it.name || it.productName || 'Produit'} (${it.cartons || it.qtyBoxes || 0} ctn - Lot ${it.lotNumber || 'N/A'})`)
            .join(', ');
          return [
            r.reference || r.id,
            r.date || '',
            r.supplier_name || 'Fournisseur Agroalimentaire',
            detail,
            `${totalBoxes} ctn`,
          ];
        }),
      });
      return;
    }

    if (targetTab === 'retours') {
      exportTableToPdf({
        title: 'Retours Invendus Vendeurs - Reintegration Stock',
        subtitle: 'Suivi des retours de marchandises en fin de tournee',
        filename: `retours_invendus_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [{ label: 'Total retours', value: `${visibleRetours.length} declarations` }],
        columns: ['Reference', 'Date', 'Vendeur', 'Produits Retournes', 'Motif', 'Statut'],
        rows: visibleRetours.map((ret) => {
          const items = typeof ret.items === 'string' ? JSON.parse(ret.items) : ret.items || [];
          const detail = items.map((it: any) => `${it.name}: ${it.cartons || it.qtyBoxes || 0} ctn`).join(', ');
          return [
            ret.reference || ret.id,
            ret.date || '',
            `${ret.vendor_name || ''} (${ret.vendor_code || ''})`,
            detail,
            ret.reason || 'Fin de tournee',
            ret.status || 'Valide',
          ];
        }),
      });
      return;
    }

    if (targetTab === 'inventaire') {
      exportTableToPdf({
        title: 'Inventaires Vendeurs & Rapprochement des Ecarts',
        subtitle: 'Comparaison entre stock theorique camionnette et comptage physique',
        filename: `inventaires_ecarts_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [{ label: 'Inventaires enregistres', value: `${visibleInventories.length}` }],
        columns: ['Reference', 'Date', 'Vendeur', 'Ecart Total (Cartons)', 'Valeur Ecart (FCFA)', 'Statut'],
        rows: visibleInventories.map((inv) => [
          inv.reference || inv.id,
          inv.date || '',
          `${inv.vendor_name || ''} (${inv.vendor_code || ''})`,
          `${inv.total_discrepancy_boxes ?? 0} ctn`,
          formatFcfaPdf(inv.total_discrepancy_value ?? 0),
          inv.status || 'Cloture',
        ]),
      });
      return;
    }

    if (targetTab === 'bons-a-remettre') {
      exportTableToPdf({
        title: 'Bons Cadeaux Vendeurs a Remettre en Produits (FEFO)',
        subtitle: 'Suivi des recompenses semestrielles remises en cartons de marchandises',
        filename: `bons_cadeaux_stocks_${todayStr}.pdf`,
        roleLabel,
        summaryCards: [{ label: 'Total bons', value: `${bonsList.length}` }],
        columns: ['Ref. Bon', 'Semestre', 'Vendeur', 'Note /20', 'Plafond Bon', 'Valeur Remise', 'Statut'],
        rows: bonsList.map((b) => [
          b.id,
          b.semester || '',
          `${b.vendor_name || ''} (${b.vendor_code || ''})`,
          `${b.note_total}/20`,
          formatFcfaPdf(b.amount),
          formatFcfaPdf(b.delivered_total || b.basket_total || 0),
          b.status || '',
        ]),
      });
      return;
    }

    // Default / 'movements' tab
    exportTableToPdf({
      title: 'Journal Officiel des Mouvements de Stock (Ajout Seul)',
      subtitle: 'Historique complet et inalterable des entrees et sorties du depot central',
      filename: `journal_mouvements_stock_${todayStr}.pdf`,
      roleLabel,
      summaryCards: [{ label: 'Mouvements enregistres', value: `${movementsList.length} lignes` }],
      columns: ['Date & Heure', 'Type Mouvement', 'Produit', 'Lot', 'Quantite', 'Acteur / Reference', 'Motif'],
      rows: movementsList.map((m) => [
        (m.created_at || m.date || '').replace('T', ' ').slice(0, 16),
        m.movement_type || m.type || '',
        `${m.product_name || ''} (${m.product_code || ''})`,
        m.lot_number || '-',
        `${Number(m.quantity_change || m.quantity || 0) > 0 ? '+' : ''}${m.quantity_change || m.quantity || 0} ctn`,
        m.reference || m.performed_by || '-',
        m.reason || m.notes || '-',
      ]),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? `Mes Chargements & Retours (${currentUser?.name})`
                : 'Dépôt Central & Chaîne Logistique'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {isVendeur ? `${currentUser?.code} • Vendeur` : `Sotuba • ${currentRole}`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVendeur
              ? 'Suivi strictement personnel de vos demandes de chargement camionnette et de vos retours d’invendus.'
              : 'Chaîne agroalimentaire : Fournisseur → Dépôt central → Vendeurs (dépôt-vente) → Points de vente.'}
          </p>
        </div>

        {/* Action button based on role */}
        <div className="flex items-center gap-2 flex-wrap">
          {isMagasinier && (
            <>
              <button
                onClick={() => setShowReceptionModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Nouvelle Réception Fournisseur</span>
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('demandes-achat')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Demandes d&apos;achat (Validation Admin)</span>
                </button>
              )}
            </>
          )}

          {isVendeur && (
            <button
              onClick={() => {
                setShowRequestLoadingModal(true);
                setValidatedLines([]);
                setIsAddingLine(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Demander un Chargement</span>
            </button>
          )}

          {/* Test Runner Button (Admin / Magasinier only) */}
          {!isVendeur && (
            <button
              onClick={handleRunIntegratedTest}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
              title="Lancer le test : réception 100, chargement 20, vente 5, retour 3"
            >
              <PlayCircle className={`w-4 h-4 ${isTesting ? 'animate-spin text-teal-400' : 'text-teal-400'}`} />
              <span>{isTesting ? 'Test en cours...' : 'Test Cycle (100 -> 20 -> 5 -> 3)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleExportActiveDepotTabPdf()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exporter Tableau en PDF</span>
          </button>
        </div>
      </div>

      {/* Test Result Banner if executed */}
      {testResults && (
        <div className={`p-4 rounded-2xl border text-xs ${
          testResults.success
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
            : 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200'
        }`}>
          <div className="flex items-center justify-between font-bold text-sm mb-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {testResults.message}
            </span>
            <button onClick={() => setTestResults(null)} className="text-slate-400 hover:text-slate-600 font-mono text-sm">&times;</button>
          </div>
          <div className="space-y-1 font-mono text-[11px] bg-white/70 dark:bg-black/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
            {testResults.steps.map((st, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-emerald-600 font-black">&bull;</span>
                <span>{st}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub Tabs Navigation — Grille de boutons en rangées et colonnes sans débordement */}
      <div
        className={`grid ${
          isVendeur
            ? 'grid-cols-1 sm:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        } gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-4 text-xs`}
      >
        {!isVendeur && (
          <>
            <button
              onClick={() => setActiveTab('stock')}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
                activeTab === 'stock'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Package className="w-4 h-4 shrink-0" />
              <span className="leading-snug">Stock Dépôt Central (30-45j)</span>
            </button>

            <button
              onClick={() => setActiveTab('lots')}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
                activeTab === 'lots'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span className="leading-snug">Lots &amp; FEFO ({lots.length})</span>
            </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('chargements')}
          className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
            activeTab === 'chargements'
              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4 shrink-0" />
          <span className="leading-snug">
            {isVendeur
              ? `Mes Chargements (${visibleChargements.length})`
              : `Chargements Vendeurs (${visibleChargements.length})`}
          </span>
        </button>

        {!isVendeur && (
          <button
            onClick={() => setActiveTab('receptions')}
            className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
              activeTab === 'receptions'
                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 shrink-0" />
            <span className="leading-snug">Réceptions ({receptions.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('retours')}
          className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
            activeTab === 'retours'
              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span className="leading-snug">
            {isVendeur
              ? `Mes Retours Invendus (${visibleRetours.length})`
              : `Retours Invendus (${visibleRetours.length})`}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('inventaire')}
          className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
            activeTab === 'inventaire'
              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ClipboardList className="w-4 h-4 shrink-0" />
          <span className="leading-snug">
            {isVendeur ? 'Mon Inventaire & Écarts' : 'Inventaire Vendeur & Écarts'}
          </span>
        </button>

        {!isVendeur && (
          <>
            <button
              onClick={() => setActiveTab('bons-a-remettre')}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
                activeTab === 'bons-a-remettre'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Gift className="w-4 h-4 shrink-0" />
              <span className="leading-snug">
                Bons à remettre ({bonsList.filter(b => b.status === 'À préparer' || b.status === 'Remis' || b.status === 'Reçu').length})
              </span>
            </button>

            <button
              onClick={() => setActiveTab('movements')}
              className={`w-full px-3.5 py-2.5 rounded-xl font-bold transition flex items-center gap-2.5 text-left border cursor-pointer ${
                activeTab === 'movements'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span className="leading-snug">Journal de Stock (Ajout seul)</span>
            </button>
          </>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB: STOCK DÉPÔT CENTRAL */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <div key={p.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <div className="text-[10px] font-bold uppercase text-teal-600 dark:text-teal-400">{p.gamme}</div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">{p.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5">{p.packaging} &bull; {p.price_box.toLocaleString('fr-FR')} FCFA / ctn</div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Stock physique :</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      {p.stock_depot} <span className="text-xs font-bold text-teal-600">ctn</span>
                    </span>
                    <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-emerald-600 font-medium">
                  Couverture : ~{Math.round(p.stock_depot / 25)} jours d'autonomie (objectif 30-45j)
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Règle du Dépôt Central :</strong> Le stock dépôt central approvisionne les vendeurs en dépôt-vente. Les sorties respectent strictement l'ordre FEFO (First Expired, First Out) pour garantir la fraîcheur des produits agroalimentaires distribués au Mali. Tout lot périmé est automatiquement bloqué.
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: LOTS & FEFO */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'lots' && (
        <div className="space-y-4">
          {/* Controls: Filters + CSV Export + Sortie Perte */}
          <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Product filter */}
              <select
                value={lotFilterProduct}
                onChange={(e) => setLotFilterProduct(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="all">Tous les produits</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="N° de lot ou produit..."
                  value={lotSearchTerm}
                  onChange={(e) => setLotSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleExportActiveDepotTabPdf('lots')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
                <button
                  onClick={handleExportLotsCSV}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-600" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Status buttons in rows/columns */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl">
              <button
                onClick={() => setLotFilterStatus('all')}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  lotFilterStatus === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setLotFilterStatus('bon')}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  lotFilterStatus === 'bon' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                &gt; 90 j (Vert)
              </button>
              <button
                onClick={() => setLotFilterStatus('attention')}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  lotFilterStatus === 'attention' ? 'bg-amber-800 text-white shadow-xs' : 'text-amber-800 dark:text-amber-400'
                }`}
              >
                30-90 j (Marron)
              </button>
              <button
                onClick={() => setLotFilterStatus('urgent')}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  lotFilterStatus === 'urgent' ? 'bg-red-600 text-white shadow-xs' : 'text-red-600 dark:text-red-400'
                }`}
              >
                &lt; 30 j (Rouge)
              </button>
              <button
                onClick={() => setLotFilterStatus('perime')}
                className={`col-span-2 sm:col-span-1 px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  lotFilterStatus === 'perime' ? 'bg-slate-600 text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                Périmé (Gris)
              </button>
            </div>
          </div>

          {/* Mobile Cards for Lots (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {filteredLots.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucun lot ne correspond aux critères de filtre.
              </div>
            ) : (
              filteredLots.map((lot) => {
                let badgeClasses = '';
                if (lot.shelf_life_status === 'bon') {
                  badgeClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
                } else if (lot.shelf_life_status === 'attention') {
                  badgeClasses = 'bg-amber-100 text-[#92400E] border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
                } else if (lot.shelf_life_status === 'urgent') {
                  badgeClasses = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
                } else {
                  badgeClasses = 'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:text-slate-200';
                }

                return (
                  <div
                    key={lot.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {lot.lot_number}
                        </span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                          {lot.product_name} ({lot.product_code})
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClasses}`}>
                        {lot.shelf_life_label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Péremption &amp; Délai</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {lot.expiry_date} ({lot.days_remaining <= 0 ? 'Expiré' : `${lot.days_remaining} j`})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Stock Disponible</span>
                        <span className="font-black text-sm text-slate-900 dark:text-white">
                          {lot.quantity} <span className="text-[10px] text-teal-600">ctn</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {lot.is_expired ? 'Exclu (Bloqué vente)' : lot.quantity === 0 ? 'Épuisé' : 'Priorité FEFO'}
                      </span>
                      {lot.quantity > 0 && (
                        <button
                          onClick={() => handleOpenLossModal(lot)}
                          className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 text-[11px] font-bold transition"
                        >
                          Sortie Perte
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Tablet & Desktop Lots Table (>= 640px) */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">N° Lot &amp; Produit</th>
                    <th className="py-3 px-3 text-center">Péremption &amp; Délai</th>
                    <th className="py-3 px-3 text-center">Statut Rayon</th>
                    <th className="py-3 px-3 text-right">Stock Dispo</th>
                    <th className="py-3 px-3 text-center">Ordre FEFO</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Aucun lot ne correspond aux critères de filtre.
                      </td>
                    </tr>
                  ) : (
                    filteredLots.map((lot) => {
                      let badgeClasses = '';
                      if (lot.shelf_life_status === 'bon') {
                        badgeClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
                      } else if (lot.shelf_life_status === 'attention') {
                        badgeClasses = 'bg-amber-100 text-[#92400E] border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
                      } else if (lot.shelf_life_status === 'urgent') {
                        badgeClasses = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
                      } else {
                        badgeClasses = 'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:text-slate-200';
                      }

                      return (
                        <tr key={lot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">{lot.lot_number}</div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{lot.product_name}</div>
                            <div className="text-[10px] text-slate-400">{lot.product_code}</div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="font-mono font-medium text-slate-600 dark:text-slate-300">{lot.expiry_date}</div>
                            <div className="font-bold">
                              <span className={lot.days_remaining <= 0 ? 'text-slate-400' : lot.days_remaining < 30 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}>
                                {lot.days_remaining <= 0 ? 'Expiré' : `${lot.days_remaining} j`}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClasses}`}>
                              {lot.shelf_life_label}
                            </span>
                            {lot.is_expired && (
                              <div className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase mt-0.5">
                                Bloqué vente &amp; chargement
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                            {lot.quantity} <span className="text-[10px] font-bold text-teal-600">ctn</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {lot.is_expired ? (
                              <span className="text-[10px] text-slate-400 font-bold">Exclu</span>
                            ) : lot.quantity === 0 ? (
                              <span className="text-[10px] text-slate-400">Épuisé</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                                <span>Priorité FEFO</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {lot.quantity > 0 && (
                              <button
                                onClick={() => handleOpenLossModal(lot)}
                                className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 text-[11px] font-bold transition"
                                title="Sortie Perte / Casse / Péremption"
                              >
                                Sortie Perte
                              </button>
                            )}
                          </td>
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

      {/* ---------------------------------------------------- */}
      {/* TAB: CHARGEMENTS VENDEURS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'chargements' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200">
            <strong>Dépôt-Vente Baobab Distribution :</strong> Le vendeur demande son chargement ligne par ligne pour 3 à 7 jours d'autonomie. Le magasinier valide, ajuste ou rejette avec motif, puis confirme la remise physique (sortie FEFO automatique). <strong>Aucune facture</strong> n'est générée.
          </div>

          {chargementSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {chargementSuccessMsg}
              </span>
              <button onClick={() => setChargementSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800 font-mono text-sm">&times;</button>
            </div>
          )}

          {/* FORMULAIRE DIRECT DE DEMANDE DE CHARGEMENT POUR LE VENDEUR */}
          {isVendeur && (
            <div className="rounded-2xl border-2 border-[#008DA9]/30 dark:border-[#008DA9]/40 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#008DA9]" />
                    Nouvelle Demande de Chargement Camionnette (Dépôt-Vente)
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                    Sélectionnez un produit (via la liste déroulante ou en cliquant sur une fiche produit ci-dessous), indiquez le nombre de cartons, cliquez sur <strong>« Valider ce choix »</strong>, puis sur <strong>« + Ajouter un produit »</strong>.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#008DA9]/10 text-[#008DA9] dark:text-cyan-300 font-bold text-[11px] self-start sm:self-center">
                  {products.length} produits au catalogue
                </span>
              </div>

              {lineBuilderError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold text-xs border border-red-200 dark:border-red-800">
                  {lineBuilderError}
                </div>
              )}

              <form onSubmit={handleSubmitChargementRequest} className="space-y-5">
                {/* 1. Date souhaitée */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-200 font-bold mb-1">
                      Date d'enlèvement souhaitée au Dépôt Central (obligatoire)
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Autonomie recommandée : 3 à 7 jours de tournée commerciale
                    </span>
                  </div>
                  <div>
                    <input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>
                </div>

                {/* 2. Catalogue & Liste des Produits Disponibles (Cartes interactives + Liste déroulante) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                      Catalogue des Produits Disponibles au Dépôt ({availableProductsForLine.length} disponibles) :
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Cliquez sur un produit ou utilisez la liste déroulante
                    </span>
                  </div>

                  {/* Interactive visual product cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {products.map((prod) => {
                      const validatedItem = validatedLines.find((l) => l.productId === prod.id);
                      const isCurrentlySelected = isAddingLine && currentLineProductId === prod.id;
                      const isOut = prod.stock_depot <= 0;

                      return (
                        <div
                          key={prod.id}
                          onClick={() => {
                            if (!validatedItem && !isOut) {
                              handleSelectProductForLine(prod.id);
                            }
                          }}
                          className={`p-3.5 rounded-xl border transition-all text-left relative ${
                            validatedItem
                              ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800 opacity-90 cursor-default'
                              : isOut
                              ? 'border-slate-200 bg-slate-100 dark:bg-slate-800/40 opacity-50 cursor-not-allowed'
                              : isCurrentlySelected
                              ? 'border-2 border-[#008DA9] bg-[#008DA9]/5 dark:bg-[#008DA9]/15 shadow-xs cursor-pointer'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#008DA9] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008DA9] dark:text-cyan-400">
                              {prod.gamme}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                              {prod.code}
                            </span>
                          </div>
                          <div className="font-black text-sm text-slate-900 dark:text-white">
                            {prod.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {prod.packaging} &bull; <strong>{prod.price_box.toLocaleString('fr-FR')} FCFA</strong>/ctn
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Stock dépôt : <span className="text-[#008DA9] dark:text-cyan-400 font-black">{prod.stock_depot} ctn</span>
                            </span>
                            {validatedItem ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                Validé ({validatedItem.requestedBoxes} ctn)
                              </span>
                            ) : isCurrentlySelected ? (
                              <span className="px-2 py-0.5 rounded-full bg-[#008DA9] text-white text-[10px] font-bold">
                                Sélectionné
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-[#008DA9] underline">
                                Choisir
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Constructeur ligne par ligne : Liste déroulante + Quantité + "Valider ce choix" */}
                {isAddingLine ? (
                  <div className="p-4 rounded-xl border-2 border-dashed border-[#008DA9]/60 bg-[#008DA9]/5 dark:bg-slate-800/60 space-y-3">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between text-xs">
                      <span>Sélection du produit et de la quantité (Pas de doublon, quantité plafonnée au stock dépôt)</span>
                      <span className="text-[11px] text-[#008DA9] font-semibold">Étape : Choisir puis valider</span>
                    </div>

                    {availableProductsForLine.length === 0 ? (
                      <div className="text-slate-500 italic py-2 text-center">
                        Tous les produits du catalogue ont été ajoutés à votre demande.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        {/* Liste déroulante des produits */}
                        <div className="md:col-span-6">
                          <label className="block text-[11px] text-slate-700 dark:text-slate-300 font-bold mb-1">
                            Produit à charger (Liste déroulante)
                          </label>
                          <select
                            value={currentLineProductId}
                            onChange={(e) => handleSelectProductForLine(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs shadow-2xs"
                          >
                            {availableProductsForLine.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code}) — {p.packaging} — {p.price_box.toLocaleString('fr-FR')} FCFA/ctn — Stock dépôt : {p.stock_depot} cartons
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Quantité en cartons */}
                        <div className="md:col-span-3">
                          <label className="block text-[11px] text-slate-700 dark:text-slate-300 font-bold mb-1">
                            Cartons demandés (Max : {products.find((p) => p.id === currentLineProductId)?.stock_depot || 0} ctn)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max={products.find((p) => p.id === currentLineProductId)?.stock_depot || 1}
                              value={currentLineQty}
                              onChange={(e) => setCurrentLineQty(Number(e.target.value))}
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black text-xs text-center"
                            />
                          </div>
                        </div>

                        {/* Bouton Valider ce choix */}
                        <div className="md:col-span-3">
                          <button
                            type="button"
                            onClick={handleValidateCurrentChoice}
                            className="w-full py-2.5 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            <span>Valider ce choix</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Bouton "+ Ajouter un produit" activé uniquement après validation du choix précédent */
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleStartNextLine}
                      disabled={availableProductsForLine.length === 0}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-[#008DA9] text-[#008DA9] dark:text-cyan-300 hover:bg-[#008DA9]/5 font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {availableProductsForLine.length > 0
                          ? `+ Ajouter un produit (${availableProductsForLine.length} produit(s) restant(s) au catalogue)`
                          : 'Tous les produits du catalogue sont déjà sélectionnés'}
                      </span>
                    </button>
                  </div>
                )}

                {/* 4. Récapitulatif des lignes validées */}
                <div className="space-y-2">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>Lignes de produits validées dans cette demande ({validatedLines.length}) :</span>
                    {validatedLines.length > 0 && (
                      <span className="text-[#008DA9] dark:text-cyan-400 font-black text-sm">
                        Valeur totale : {validatedLines.reduce((s, it) => s + it.total, 0).toLocaleString('fr-FR')} FCFA
                      </span>
                    )}
                  </div>

                  {validatedLines.length === 0 ? (
                    <div className="py-3 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-400 text-center italic">
                      Aucun produit validé pour l'instant. Sélectionnez un produit ci-dessus puis cliquez sur « Valider ce choix ».
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {validatedLines.map((line, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white">{line.name}</span>
                              <span className="text-slate-500 text-[11px] ml-2">
                                ({line.code} &bull; <strong>{line.requestedBoxes} cartons</strong> &times; {line.unitPrice.toLocaleString('fr-FR')} FCFA)
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-black text-slate-900 dark:text-white">{line.total.toLocaleString('fr-FR')} FCFA</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveValidatedLine(idx)}
                              className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px]"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Bouton d'envoi de la demande */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingChargement || validatedLines.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition disabled:opacity-50"
                  >
                    {isSubmittingChargement
                      ? 'Transmission au Magasinier...'
                      : `Envoyer la demande de chargement (${validatedLines.reduce((s, l) => s + l.requestedBoxes, 0)} cartons)`}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Mobile Cards for Chargements (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {visibleChargements.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucun chargement enregistré.
              </div>
            ) : (
              visibleChargements.map((chg) => {
                let statusBadge = '';
                if (chg.status === 'Demandée') {
                  statusBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                } else if (chg.status === 'Validée') {
                  statusBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                } else if (chg.status === 'Partiellement validée') {
                  statusBadge = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300';
                } else if (chg.status === 'Rejetée') {
                  statusBadge = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
                } else if (chg.status === 'Chargée') {
                  statusBadge = 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-black';
                } else {
                  statusBadge = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
                }

                const isMyChargement = chg.vendor_id === currentUser.id;
                const canVendorCancel = isVendeur && isMyChargement && chg.status === 'Demandée';
                const canMagasinierReview = (isMagasinier || isAdmin) && chg.status === 'Demandée';
                const canMagasinierRemise = (isMagasinier || isAdmin) && (chg.status === 'Validée' || chg.status === 'Partiellement validée');

                return (
                  <div
                    key={chg.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {chg.reference}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {chg.date}
                          {chg.desired_date && (
                            <span className="text-teal-600 font-semibold ml-1.5">
                              • Souhaitée: {chg.desired_date}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadge}`}>
                        {chg.status}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {chg.vendor_name || 'Vendeur'} ({chg.vendor_code || ''})
                        </div>
                        <div className="text-[10px] text-slate-400">{chg.vendor_team || ''}</div>
                      </div>
                      <div className="text-right font-black text-sm text-slate-900 dark:text-white">
                        {chg.total_amount.toLocaleString('fr-FR')} FCFA
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(chg.items || []).map((it: any, idx: number) => {
                        const qty = it.validatedBoxes !== undefined ? it.validatedBoxes : (it.requestedBoxes || it.qtyBoxes);
                        return (
                          <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            {it.name}: <strong>{qty} ctn</strong>
                          </span>
                        );
                      })}
                    </div>

                    {chg.rejection_reason && (
                      <div className="text-[11px] text-red-600 font-bold">
                        Motif rejet : {chg.rejection_reason}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 flex-wrap">
                      {canMagasinierReview && (
                        <>
                          <button
                            onClick={() => handleMagasinierValidate(chg.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                          >
                            Valider
                          </button>
                          <button
                            onClick={() => handleOpenAdjustModal(chg)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs"
                          >
                            Ajuster
                          </button>
                          <button
                            onClick={() => handleOpenRejectModal(chg.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs"
                          >
                            Rejeter
                          </button>
                        </>
                      )}

                      {canMagasinierRemise && (
                        <button
                          onClick={() => handleConfirmRemise(chg.id)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Confirmer la remise</span>
                        </button>
                      )}

                      {canVendorCancel && (
                        <button
                          onClick={() => handleCancelChargement(chg.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs font-bold"
                        >
                          Annuler la demande
                        </button>
                      )}

                      {chg.status === 'Chargée' && (
                        <span className="text-[11px] text-teal-700 dark:text-teal-400 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Remis &bull; FEFO
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Tablet & Desktop Chargements Table (>= 640px) — Compact 5-column grouped layout */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">Réf. &amp; Dates</th>
                    <th className="py-3 px-3">Vendeur &amp; Équipe</th>
                    <th className="py-3 px-3">Lignes de Produits</th>
                    <th className="py-3 px-3 text-right">Valeur &amp; Statut</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleChargements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Aucun chargement enregistré.
                      </td>
                    </tr>
                  ) : (
                    visibleChargements.map((chg) => {
                      let statusBadge = '';
                      if (chg.status === 'Demandée') {
                        statusBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                      } else if (chg.status === 'Validée') {
                        statusBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                      } else if (chg.status === 'Partiellement validée') {
                        statusBadge = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300';
                      } else if (chg.status === 'Rejetée') {
                        statusBadge = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
                      } else if (chg.status === 'Chargée') {
                        statusBadge = 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-black';
                      } else {
                        statusBadge = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
                      }

                      const isMyChargement = chg.vendor_id === currentUser.id;
                      const canVendorCancel = isVendeur && isMyChargement && chg.status === 'Demandée';
                      const canMagasinierReview = (isMagasinier || isAdmin) && chg.status === 'Demandée';
                      const canMagasinierRemise = (isMagasinier || isAdmin) && (chg.status === 'Validée' || chg.status === 'Partiellement validée');

                      return (
                        <tr key={chg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">{chg.reference}</div>
                            <div className="text-[11px] text-slate-500">{chg.date}</div>
                            {chg.desired_date && (
                              <div className="text-[10px] text-teal-600 font-semibold">Souhaitée: {chg.desired_date}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            <div>{chg.vendor_name || 'Vendeur'} ({chg.vendor_code || ''})</div>
                            <div className="text-[10px] text-slate-400">{chg.vendor_team || ''}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-1">
                              {(chg.items || []).map((it: any, idx: number) => {
                                const qty = it.validatedBoxes !== undefined ? it.validatedBoxes : (it.requestedBoxes || it.qtyBoxes);
                                return (
                                  <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                    {it.name}: <strong>{qty} ctn</strong>
                                    {it.validatedBoxes !== undefined && it.requestedBoxes && it.validatedBoxes !== it.requestedBoxes && (
                                      <span className="text-[10px] text-amber-600 line-through ml-1">({it.requestedBoxes})</span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                            {chg.rejection_reason && (
                              <div className="text-[11px] text-red-600 font-bold mt-1">
                                Motif rejet : {chg.rejection_reason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="font-black text-slate-900 dark:text-white">
                              {chg.total_amount.toLocaleString('fr-FR')} FCFA
                            </div>
                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadge}`}>
                              {chg.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {canMagasinierReview && (
                                <>
                                  <button
                                    onClick={() => handleMagasinierValidate(chg.id)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs"
                                  >
                                    Valider
                                  </button>
                                  <button
                                    onClick={() => handleOpenAdjustModal(chg)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shadow-xs"
                                  >
                                    Ajuster
                                  </button>
                                  <button
                                    onClick={() => handleOpenRejectModal(chg.id)}
                                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] shadow-xs"
                                  >
                                    Rejeter
                                  </button>
                                </>
                              )}

                              {canMagasinierRemise && (
                                <button
                                  onClick={() => handleConfirmRemise(chg.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Confirmer la remise</span>
                                </button>
                              )}

                              {canVendorCancel && (
                                <button
                                  onClick={() => handleCancelChargement(chg.id)}
                                  className="px-2.5 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-[10px] font-bold"
                                >
                                  Annuler la demande
                                </button>
                              )}

                              {chg.status === 'Chargée' && (
                                <span className="text-[11px] text-teal-700 dark:text-teal-400 font-bold flex items-center justify-end gap-1">
                                  <Check className="w-3.5 h-3.5" /> Remis &bull; FEFO
                                </span>
                              )}
                            </div>
                          </td>
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

      {/* ---------------------------------------------------- */}
      {/* TAB: RÉCEPTIONS (Fournisseur -> Dépôt) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'receptions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Entrées de marchandises au dépôt central. Lignes avec produit, cartons, numéro de lot et date de péremption obligatoires.
            </p>
            {isMagasinier && (
              <button
                onClick={() => setShowReceptionModal(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs self-start sm:self-auto"
              >
                + Nouvelle réception
              </button>
            )}
          </div>

          {/* Mobile Cards for Réceptions (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {receptions.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucune réception enregistrée.
              </div>
            ) : (
              receptions.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{r.reference}</span>
                      <div className="text-[11px] text-slate-400">{r.date}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {r.total_boxes?.toLocaleString('fr-FR')} cartons
                    </span>
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{r.supplier_name}</div>
                  <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {(r.items || []).map((it: any, idx: number) => (
                      <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{it.name}:</strong> {it.boxes} cartons
                        {it.lot_number && (
                          <span className="block font-mono text-[10px] text-teal-600 dark:text-teal-400">
                            Lot: {it.lot_number} (Exp: {it.expiry_date})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">N° &amp; Date Réception</th>
                    <th className="py-3 px-3">Fournisseur Agroalimentaire</th>
                    <th className="py-3 px-3">Lignes &amp; Lots Enregistrés</th>
                    <th className="py-3 px-3 text-right">Total &amp; Destination</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {receptions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        Aucune réception enregistrée.
                      </td>
                    </tr>
                  ) : (
                    receptions.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">{r.reference}</div>
                          <div className="text-[11px] text-slate-500">{r.date}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {r.supplier_name}
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {(r.items || []).map((it: any, idx: number) => (
                              <div key={idx} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                                <span className="font-bold text-slate-900 dark:text-white">{it.name}:</span>
                                <span>{it.boxes} cartons</span>
                                {it.lot_number && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                                    Lot: {it.lot_number} (Exp: {it.expiry_date})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-black text-slate-900 dark:text-white">
                            {r.total_boxes?.toLocaleString('fr-FR')} cartons
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Dépôt Central Sotuba
                          </span>
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

      {/* ---------------------------------------------------- */}
      {/* TAB: RETOURS (Vendeur rend l'invendu, Magasinier confirme) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'retours' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Retour des invendus de tournée. Le vendeur déclare, le magasinier confirme la réintégration physique au stock dépôt.
            </p>
            {isVendeur && (
              <button
                onClick={() => setShowRetourModal(true)}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs self-start sm:self-auto"
              >
                + Déclarer un retour d'invendus
              </button>
            )}
          </div>

          {/* Mobile Cards for Retours (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {visibleRetours.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucun retour d'invendus pour l'instant.
              </div>
            ) : (
              visibleRetours.map((ret) => (
                <div
                  key={ret.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{ret.reference}</span>
                      <div className="text-[11px] text-slate-400">{ret.date} &bull; {ret.vendor_name || 'Vendeur'}</div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ret.status === 'confirme' || ret.status === 'valide'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {ret.status === 'confirme' || ret.status === 'valide' ? 'Confirmé' : 'En attente'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(ret.items || []).map((it: any, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {it.name}: <strong>{it.boxes || it.qtyBoxes} ctn</strong>
                      </span>
                    ))}
                  </div>
                  {ret.reason && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">{ret.reason}</div>
                  )}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    {(isMagasinier || isAdmin) && ret.status === 'en_attente' ? (
                      <button
                        onClick={() => handleConfirmRetour(ret.id)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                      >
                        Confirmer le retour
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {ret.confirmed_by ? `Validé par ${ret.confirmed_by}` : 'Clôturé'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">Réf. &amp; Date</th>
                    <th className="py-3 px-3">Vendeur</th>
                    <th className="py-3 px-3">Marchandises &amp; Motif</th>
                    <th className="py-3 px-3 text-center">Statut</th>
                    <th className="py-3 px-3 text-right">Confirmation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleRetours.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Aucun retour d'invendus pour l'instant.
                      </td>
                    </tr>
                  ) : (
                    visibleRetours.map((ret) => (
                      <tr key={ret.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">{ret.reference}</div>
                          <div className="text-[11px] text-slate-500">{ret.date}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {ret.vendor_name || 'Vendeur'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(ret.items || []).map((it: any, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                {it.name}: <strong>{it.boxes || it.qtyBoxes} ctn</strong>
                              </span>
                            ))}
                          </div>
                          {ret.reason && (
                            <div className="text-[11px] text-slate-500 mt-1">{ret.reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            ret.status === 'confirme' || ret.status === 'valide'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {ret.status === 'confirme' || ret.status === 'valide' ? 'Confirmé' : 'En attente'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {(isMagasinier || isAdmin) && ret.status === 'en_attente' ? (
                            <button
                              onClick={() => handleConfirmRetour(ret.id)}
                              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                            >
                              Confirmer le retour
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {ret.confirmed_by ? `Validé par ${ret.confirmed_by}` : 'Clôturé'}
                            </span>
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

      {/* ---------------------------------------------------- */}
      {/* TAB: INVENTAIRE VENDEUR & ÉCARTS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'inventaire' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200">
            <strong>Calcul de l'Écart d'Inventaire :</strong> Stock théorique = <code>Chargé - Vendu - Rendu</code>. Comparé à l'inventaire physique compté dans la camionnette par le Magasinier. Tout écart en FCFA est calculé atomiquement et notifié immédiatement à l'<strong>Administrateur</strong> et au <strong>Comptable</strong>.
          </div>

          {/* Form to perform physical count */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {isVendeur ? 'Vendeur concerné :' : 'Sélectionner le Vendeur :'}
                </span>
                {isVendeur ? (
                  <span className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-bold text-xs">
                    {currentUser?.name} ({currentUser?.code})
                  </span>
                ) : (
                  <select
                    value={selectedVendorForInv}
                    onChange={(e) => {
                      setSelectedVendorForInv(e.target.value);
                      fetchTheoretical(e.target.value);
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white text-xs"
                  >
                    {vendorsList.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.code}) - {v.team}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Live variance badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Bilan Écart constat :</span>
                <span className={`px-3 py-1 rounded-full font-black text-xs ${
                  liveVariance.totalEcartBoxes === 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                }`}>
                  {liveVariance.totalEcartBoxes > 0 ? `+${liveVariance.totalEcartBoxes}` : liveVariance.totalEcartBoxes} ctn &bull; {liveVariance.totalEcartFcfa.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            {/* Table comparing theoretical vs counted */}
            <form onSubmit={handleSubmitVendorInventory} className="space-y-4">
              {/* Mobile Cards (< 640px) */}
              <div className="space-y-3 sm:hidden">
                {liveVariance.items.map((it) => (
                  <div
                    key={it.productId}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{it.name}</div>
                        <div className="text-[10px] text-slate-400">{it.code} &bull; {it.price_box.toLocaleString('fr-FR')} FCFA/ctn</div>
                      </div>
                      <span className={`font-mono font-black ${it.diffFcfa === 0 ? 'text-slate-400' : it.diffFcfa < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {it.diff > 0 ? `+${it.diff}` : it.diff} ctn ({it.diffFcfa.toLocaleString('fr-FR')} FCFA)
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[9px] text-slate-400 block">Chargé</span>
                        <span className="font-mono font-bold">{it.chargedBoxes}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">Vendu</span>
                        <span className="font-mono font-bold text-emerald-600">{it.soldBoxes}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">Rendu</span>
                        <span className="font-mono font-bold text-amber-600">{it.returnedBoxes}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-teal-600 font-bold block">Théorique</span>
                        <span className="font-mono font-black text-teal-700 dark:text-teal-400">{it.theoreticalQty} ctn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-bold text-blue-700 dark:text-blue-400">Comptage Physique :</span>
                      <input
                        type="number"
                        min="0"
                        disabled={isVendeur}
                        value={physicalCountInput[it.productId] ?? it.theoreticalQty}
                        onChange={(e) =>
                          setPhysicalCountInput({
                            ...physicalCountInput,
                            [it.productId]: Number(e.target.value)
                          })
                        }
                        className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="py-2.5 px-2.5">Produit</th>
                      <th className="py-2.5 px-2.5 text-center">Chargé / Vendu / Rendu</th>
                      <th className="py-2.5 px-2.5 text-center font-bold text-teal-700">Stock Théorique</th>
                      <th className="py-2.5 px-2.5 text-center font-bold text-blue-700">Comptage Physique</th>
                      <th className="py-2.5 px-2.5 text-right">Écart (Cartons &amp; FCFA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {liveVariance.items.map((it) => (
                      <tr key={it.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-2.5 font-bold text-slate-900 dark:text-white">
                          {it.name}
                          <div className="text-[10px] text-slate-400 font-normal">{it.code} &bull; {it.price_box.toLocaleString('fr-FR')} FCFA/ctn</div>
                        </td>
                        <td className="py-3 px-2.5 text-center font-mono text-[11px]">
                          <span className="text-slate-700 dark:text-slate-300">{it.chargedBoxes}</span>
                          {' / '}
                          <span className="text-emerald-600 font-bold">{it.soldBoxes}</span>
                          {' / '}
                          <span className="text-amber-600">{it.returnedBoxes}</span> ctn
                        </td>
                        <td className="py-3 px-2.5 text-center font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20">
                          {it.theoreticalQty} ctn
                        </td>
                        <td className="py-3 px-2.5 text-center">
                          <input
                            type="number"
                            min="0"
                            disabled={isVendeur}
                            value={physicalCountInput[it.productId] ?? it.theoreticalQty}
                            onChange={(e) =>
                              setPhysicalCountInput({
                                ...physicalCountInput,
                                [it.productId]: Number(e.target.value)
                              })
                            }
                            className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                          />
                        </td>
                        <td className="py-3 px-2.5 text-right font-black font-mono">
                          <div className={it.diff === 0 ? 'text-slate-400' : it.diff < 0 ? 'text-red-600' : 'text-blue-600'}>
                            {it.diff > 0 ? `+${it.diff}` : it.diff} ctn
                          </div>
                          <div className={`text-[11px] ${it.diffFcfa === 0 ? 'text-slate-400' : it.diffFcfa < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                            {it.diffFcfa > 0 ? `+${it.diffFcfa.toLocaleString('fr-FR')}` : it.diffFcfa.toLocaleString('fr-FR')} FCFA
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <input
                  type="text"
                  disabled={isVendeur}
                  placeholder="Notes ou observations sur l'état de la camionnette..."
                  value={inventoryNotes}
                  onChange={(e) => setInventoryNotes(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60"
                />

                {(isMagasinier || isAdmin) && (
                  <button
                    type="submit"
                    disabled={isSubmittingInventory}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition shrink-0"
                  >
                    {isSubmittingInventory ? 'Transmission...' : 'Enregistrer et Notifier Admin & Compta'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Past inventories history */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {isVendeur ? 'Historique de Mes Inventaires' : 'Historique des Inventaires Vendeurs Réalisés'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleInventories.map((inv) => (
                <div key={inv.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{inv.reference}</span>
                    <span className="text-slate-400">{inv.date}</span>
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Vendeur : {inv.vendor_name} ({inv.vendor_code}) &bull; {inv.vendor_team}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Écart net constaté :</span>
                    <span className={`font-black ${
                      inv.total_ecart_boxes === 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {inv.total_ecart_boxes > 0 ? `+${inv.total_ecart_boxes}` : inv.total_ecart_boxes} ctn ({inv.total_ecart_fcfa?.toLocaleString('fr-FR')} FCFA)
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    "{inv.notes}" &bull; Notifié à l'Administrateur et au Comptable
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: JOURNAL DE STOCK (Entrées en ajout seul, jamais négatif) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200">
            <strong>Journal d'Audit des Mouvements de Stock :</strong> Règle d'or Baobab : les mouvements entrants sont enregistrés en <em>ajout seul</em> (quantité positive, jamais négative). Traçabilité stricte par numéro de lot et motif.
          </div>

          {/* Mobile Cards for Journal de Stock (< 640px) */}
          <div className="space-y-3 sm:hidden">
            {movementsList.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                Aucun mouvement enregistré dans le journal.
              </div>
            ) : (
              movementsList.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white capitalize">
                        {m.type?.replace(/_/g, ' ')}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {m.created_at?.replace('T', ' ').substring(0, 19)}
                      </div>
                    </div>
                    {m.direction === 'IN' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        + Entrée ({m.quantity} ctn)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        - Sortie ({m.quantity} ctn)
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {m.product_name} {m.lot_number && <span className="font-mono text-[10px] text-teal-600">(Lot: {m.lot_number})</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{m.motif || m.reference || '-'}</div>
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Valeur Marchande</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {m.value_fcfa?.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-3 px-3">Date &amp; Type</th>
                    <th className="py-3 px-3">Produit &amp; Lot</th>
                    <th className="py-3 px-3">Motif / Justification</th>
                    <th className="py-3 px-3 text-center">Direction</th>
                    <th className="py-3 px-3 text-right">Quantité &amp; Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movementsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Aucun mouvement enregistré dans le journal.
                      </td>
                    </tr>
                  ) : (
                    movementsList.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white capitalize">
                            {m.type === 'Bon cadeau' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                <Gift className="w-3 h-3" /> Bon cadeau
                              </span>
                            ) : (
                              m.type?.replace(/_/g, ' ')
                            )}
                          </div>
                          <div className="font-mono text-slate-500 text-[10px] mt-0.5">
                            {m.created_at?.replace('T', ' ').substring(0, 19)}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{m.product_name}</div>
                          {m.lot_number && (
                            <div className="font-mono text-[10px] text-teal-600">Lot: {m.lot_number}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {m.motif || m.reference || '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {m.direction === 'IN' ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              + Entrée (Ajout seul)
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                              - Sortie (FEFO)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-black text-slate-900 dark:text-white">
                            {m.direction === 'IN' ? `+${m.quantity}` : `-${m.quantity}`} ctn
                          </div>
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            {m.value_fcfa?.toLocaleString('fr-FR')} FCFA
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

      {/* ---------------------------------------------------- */}
      {/* TAB: BONS À REMETTRE (Magasinier / Administrateur) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'bons-a-remettre' && (
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <strong>Bons cadeaux à remettre (Magasinier) :</strong> Préparez les paniers composés par les vendeurs (produits en stock non périmés FEFO, valorisés au prix de vente, plafonnés à la valeur du bon). En cas de rupture, proposez un produit de remplacement. Confirmez <strong>« Remise effectuée »</strong> pour générer la sortie de stock de type <strong>« Bon cadeau »</strong>. <strong>Rien en espèces.</strong>
            </div>
            <button
              type="button"
              onClick={handleRunBonTestScenario}
              disabled={isProcessingBon === 'test'}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <PlayCircle className="w-4 h-4" />
              <span>{isProcessingBon === 'test' ? 'Test en cours...' : 'Test : bon 40 000, panier 38 400, remise, stock en baisse'}</span>
            </button>
          </div>

          {bonActionMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                bonActionMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              <span>{bonActionMsg.text}</span>
              <button onClick={() => setBonActionMsg(null)} className="ml-2 font-mono text-sm">&times;</button>
            </div>
          )}

          {bonTestSummary && (
            <div className="p-4 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">Bon Cadeau (16/20)</div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {Number(bonTestSummary.bon_amount).toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">Panier Validé (4 ctn Cajoucy)</div>
                <div className="text-base font-black text-[#008DA9] mt-0.5">
                  {Number(bonTestSummary.basket_total).toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">Sortie de Stock</div>
                <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Type « {bonTestSummary.movement_type} »
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">Stock Dépôt en baisse</div>
                <div className="text-base font-black text-amber-600 mt-0.5">
                  {bonTestSummary.stock_before} ctn &rarr; {bonTestSummary.stock_after} ctn (-{bonTestSummary.stock_decrease})
                </div>
              </div>
            </div>
          )}

          {bonsList.filter(b => b.revealed).length === 0 ? (
            <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
              Aucun bon cadeau révélé ou en attente de remise pour le moment.
            </div>
          ) : (
            <div className="space-y-4">
              {bonsList
                .filter(b => b.revealed)
                .map((bon) => {
                  const items = Array.isArray(bon.items) ? bon.items : [];
                  const basketTotal = Number(bon.basket_total || 0);
                  const deliveredTotal = Number(bon.delivered_total || 0);
                  const bonAmount = Number(bon.amount || 0);

                  return (
                    <div
                      key={bon.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                              {bon.id.toUpperCase()}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                              Semestre {bon.semester}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                bon.status === 'À préparer'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : bon.status === 'Remis'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                  : bon.status === 'Reçu'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              Statut : {bon.status}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              Rien en espèces
                            </span>
                          </div>
                          <div className="text-slate-500 mt-1">
                            Vendeur : <strong className="text-slate-800 dark:text-slate-200">{bon.vendor_name} ({bon.vendor_code})</strong> &bull; Note : <strong>{bon.note_total}/20</strong> &bull; Expiration : <span className="font-mono">{bon.expires_at}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Plafond Bon</div>
                            <div className="font-black text-sm text-slate-900 dark:text-white">
                              {bonAmount.toLocaleString('fr-FR')} FCFA
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-slate-400">
                              {deliveredTotal > 0 ? 'Valeur Remise' : 'Panier Demandé'}
                            </div>
                            <div className="font-black text-sm text-[#008DA9]">
                              {(deliveredTotal > 0 ? deliveredTotal : basketTotal).toLocaleString('fr-FR')} FCFA
                            </div>
                          </div>
                        </div>
                      </div>

                      {items.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-400 italic">
                          Le vendeur n'a pas encore envoyé sa demande de retrait (« Demander le retrait »).
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            Lignes du panier à remettre (FEFO non périmé) :
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            {items.map((it: any, idx: number) => {
                              const catProd = fefoCatalog.find(p => p.id === it.productId);
                              const availableFefo = catProd ? catProd.available_fefo : 0;
                              const isRupture = bon.status === 'À préparer' && availableFefo < Number(it.qtyBoxes || 0);

                              return (
                                <div key={idx} className="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-900 dark:text-white">{it.name}</span>
                                      <span className="font-mono text-[10px] text-slate-400">({it.code})</span>
                                      {it.replacedFrom && (
                                        <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                          Remplacement de {it.replacedFrom}
                                        </span>
                                      )}
                                      {isRupture && (
                                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-black">
                                          Rupture FEFO (Dispo: {availableFefo} ctn)
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {it.qtyBoxes} carton(s) &times; {Number(it.unitPrice || 0).toLocaleString('fr-FR')} FCFA = <strong>{Number(it.total || 0).toLocaleString('fr-FR')} FCFA</strong>
                                      {it.lotNumber && (
                                        <span className="ml-2 font-mono text-teal-600">• Lot FEFO : {it.lotNumber} (Exp: {it.expiryDate})</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {(bon.status === 'À préparer' || bon.status === 'Actif') && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenReplaceModal(bon, it)}
                                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold text-[11px] transition cursor-pointer"
                                      >
                                        Rupture : proposer un remplacement
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="text-[11px] text-slate-500">
                          {bon.status === 'Remis' && (
                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                              Remise effectuée par {bon.prepared_by || 'Magasinier'} le {bon.remis_at?.replace('T', ' ').slice(0, 16)}. En attente de confirmation par le vendeur.
                            </span>
                          )}
                          {bon.status === 'Reçu' && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              Réception confirmée par le vendeur le {bon.confirmed_reception_at?.replace('T', ' ').slice(0, 16)}.
                            </span>
                          )}
                        </div>

                        {bon.status === 'À préparer' && items.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleConfirmBonRemise(bon.id)}
                            disabled={isProcessingBon === bon.id}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {isProcessingBon === bon.id
                                ? 'Validation en cours...'
                                : 'Remise effectuée (Sortie de stock « Bon cadeau »)'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* MODAL REMPLACEMENT RUPTURE BON CADEAU */}
      {replacingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Rupture : Proposer un produit de remplacement (FEFO)
              </h3>
              <button onClick={() => setReplacingTarget(null)} className="text-slate-400 hover:text-slate-600 font-mono text-base">&times;</button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px]">
              Produit en rupture : <strong>{replacingTarget.oldName}</strong>. Choisissez un produit en stock non périmé (FEFO) dans la limite du plafond du bon ({replacingTarget.maxAmount.toLocaleString('fr-FR')} FCFA).
            </div>

            <form onSubmit={handleConfirmReplacement} className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                  Produit de remplacement (en stock non périmé FEFO)
                </label>
                <select
                  value={newReplaceProductId}
                  onChange={(e) => setNewReplaceProductId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  {fefoCatalog.filter(p => p.available_fefo > 0).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {Number(p.price_box).toLocaleString('fr-FR')} FCFA/ctn (Dispo FEFO: {p.available_fefo} ctn)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                  Nombre de cartons
                </label>
                <input
                  type="number"
                  min={1}
                  value={newReplaceQty}
                  onChange={(e) => setNewReplaceQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                  Motif du remplacement
                </label>
                <input
                  type="text"
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReplacingTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold cursor-pointer"
                >
                  Valider le remplacement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: NOUVELLE RÉCEPTION FOURNISSEUR (Magasinier) */}
      {/* Lignes avec produit, cartons, numéro de lot et date de péremption obligatoires */}
      {/* ---------------------------------------------------- */}
      {showReceptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-teal-600" />
                Réception Fournisseur (Entrée en Stock &amp; Traçabilité Lots)
              </h2>
              <button onClick={() => setShowReceptionModal(false)} className="text-slate-400 hover:text-slate-600 font-mono text-lg">&times;</button>
            </div>

            {receptionError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 font-semibold text-xs border border-red-200">
                {receptionError}
              </div>
            )}

            <form onSubmit={handleCreateReception} className="space-y-4">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Fournisseur Agroalimentaire</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                />
              </div>

              {/* Multi-line products */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Lignes de réception (Produit, Cartons, N° Lot et Date de péremption obligatoires) :
                  </span>
                  <button
                    type="button"
                    onClick={addReceptionLine}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter une ligne</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {receptionLines.map((line, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                        <span>Ligne {idx + 1}</span>
                        {receptionLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeReceptionLine(idx)}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold">Produit</label>
                          <select
                            value={line.productId}
                            onChange={(e) => {
                              const updated = [...receptionLines];
                              updated[idx].productId = e.target.value;
                              setReceptionLines(updated);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold">Cartons (positif)</label>
                          <input
                            type="number"
                            min="1"
                            value={line.cartons}
                            onChange={(e) => {
                              const updated = [...receptionLines];
                              updated[idx].cartons = Number(e.target.value);
                              setReceptionLines(updated);
                            }}
                            required
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold">N° de Lot (obligatoire)</label>
                          <input
                            type="text"
                            placeholder="ex: LOT-CAJ-2026-X"
                            value={line.lotNumber}
                            onChange={(e) => {
                              const updated = [...receptionLines];
                              updated[idx].lotNumber = e.target.value;
                              setReceptionLines(updated);
                            }}
                            required
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold">Péremption (obligatoire)</label>
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) => {
                              const updated = [...receptionLines];
                              updated[idx].expiryDate = e.target.value;
                              setReceptionLines(updated);
                            }}
                            required
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceptionModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReception}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"
                >
                  {isSubmittingReception ? 'Enregistrement...' : 'Valider la réception (Entrée en stock)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: DEMANDE DE CHARGEMENT PAR LE VENDEUR */}
      {/* Règle stricte : multi-produits ligne par ligne (choisir, "Valider ce choix", puis "+ Ajouter un produit" seulement après validation, pas de doublon, quantité plafonnée au stock dépôt, date souhaitée) */}
      {/* ---------------------------------------------------- */}
      {showRequestLoadingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#008DA9]" />
                Demande de Chargement Camionnette (Dépôt-Vente)
              </h2>
              <button onClick={() => setShowRequestLoadingModal(false)} className="text-slate-400 hover:text-slate-600 font-mono text-lg">&times;</button>
            </div>

            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 text-[11px]">
              <strong>Dépôt-Vente :</strong> Vous ne payez pas à l'avance. Aucune facture n'est émise. Vous recevrez les cartons après validation par le magasinier, puis vous verserez les recettes après vos ventes aux points de vente.
            </div>

            {lineBuilderError && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-700 font-semibold text-xs border border-red-200">
                {lineBuilderError}
              </div>
            )}

            <form onSubmit={handleSubmitChargementRequest} className="space-y-4">
              {/* Date souhaitée */}
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Date d'enlèvement souhaitée (obligatoire)</label>
                <input
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              {/* Interactive Product Catalog List */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Catalogue des produits disponibles au dépôt ({availableProductsForLine.length} disponibles) :</span>
                  <span className="text-[10px] text-slate-500">Cliquez sur un produit ou utilisez la liste déroulante</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {products.map((prod) => {
                    const validatedItem = validatedLines.find((l) => l.productId === prod.id);
                    const isCurrentlySelected = isAddingLine && currentLineProductId === prod.id;
                    const isOut = prod.stock_depot <= 0;

                    return (
                      <div
                        key={prod.id}
                        onClick={() => {
                          if (!validatedItem && !isOut) {
                            handleSelectProductForLine(prod.id);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all text-left ${
                          validatedItem
                            ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800 opacity-90 cursor-default'
                            : isOut
                            ? 'border-slate-200 bg-slate-100 dark:bg-slate-800/40 opacity-50 cursor-not-allowed'
                            : isCurrentlySelected
                            ? 'border-2 border-[#008DA9] bg-[#008DA9]/5 dark:bg-[#008DA9]/15 shadow-xs cursor-pointer'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#008DA9] cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-black text-slate-900 dark:text-white">{prod.name}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                            {prod.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {prod.gamme} &bull; {prod.packaging} &bull; <strong>{prod.price_box.toLocaleString('fr-FR')} FCFA</strong>/ctn
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Stock dépôt : <span className="text-[#008DA9] dark:text-cyan-400 font-black">{prod.stock_depot} ctn</span>
                          </span>
                          {validatedItem ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                              Validé ({validatedItem.requestedBoxes} ctn)
                            </span>
                          ) : isCurrentlySelected ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#008DA9] text-white text-[10px] font-bold">
                              Sélectionné
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-[#008DA9] underline">
                              Choisir
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Line builder: Choisir, "Valider ce choix", puis "+ Ajouter un produit" seulement après validation */}
              {isAddingLine ? (
                <div className="p-3.5 rounded-xl border border-dashed border-[#008DA9] bg-[#008DA9]/5 dark:bg-teal-950/20 space-y-3">
                  <div className="font-bold text-[#008DA9] dark:text-teal-300 flex items-center justify-between text-[11px]">
                    <span>Ajout d'une ligne de chargement (Pas de doublon, quantité plafonnée au stock dépôt)</span>
                  </div>

                  {availableProductsForLine.length === 0 ? (
                    <div className="text-slate-500 italic py-2 text-center">
                      Tous les produits du catalogue ont été ajoutés à la sélection.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Produit (Liste déroulante)</label>
                          <select
                            value={currentLineProductId}
                            onChange={(e) => handleSelectProductForLine(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                          >
                            {availableProductsForLine.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code}) — {p.price_box.toLocaleString('fr-FR')} FCFA/ctn — Stock: {p.stock_depot} ctn
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                            Cartons demandés (Max : {products.find(p => p.id === currentLineProductId)?.stock_depot || 0} ctn)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={products.find(p => p.id === currentLineProductId)?.stock_depot || 1}
                            value={currentLineQty}
                            onChange={(e) => setCurrentLineQty(Number(e.target.value))}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleValidateCurrentChoice}
                          className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition"
                        >
                          Valider ce choix
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Only AFTER validation of the current choice, "+ Ajouter un produit" is enabled */
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleStartNextLine}
                    disabled={availableProductsForLine.length === 0}
                    className="w-full py-2.5 rounded-xl border border-dashed border-[#008DA9] text-[#008DA9] dark:text-teal-300 hover:bg-[#008DA9]/5 dark:hover:bg-teal-950/40 font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Ajouter un produit</span>
                  </button>
                </div>
              )}

              {/* List of validated lines */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Produits validés dans cette demande ({validatedLines.length}) :</span>
                  {validatedLines.length > 0 && (
                    <span className="text-[#008DA9] font-black">
                      Total: {validatedLines.reduce((s, it) => s + it.total, 0).toLocaleString('fr-FR')} FCFA
                    </span>
                  )}
                </div>

                {validatedLines.length === 0 ? (
                  <div className="py-3 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 text-center italic">
                    Aucun produit validé pour l'instant. Choisissez ci-dessus puis cliquez sur "Valider ce choix".
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {validatedLines.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">{line.name}</span>
                            <span className="text-slate-500 text-[11px] ml-2">({line.requestedBoxes} cartons &bull; {line.unitPrice.toLocaleString('fr-FR')} FCFA/ctn)</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-900 dark:text-white">{line.total.toLocaleString('fr-FR')} FCFA</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveValidatedLine(idx)}
                            className="text-red-500 hover:text-red-700 font-bold text-xs"
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRequestLoadingModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 font-bold"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingChargement || validatedLines.length === 0}
                  className="px-4 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold disabled:opacity-50"
                >
                  {isSubmittingChargement ? 'Envoi...' : 'Envoyer la demande (Statut : Demandée)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 3: AJUSTER QUANTITÉS CHARGEMENT (Magasinier) */}
      {/* ---------------------------------------------------- */}
      {adjustingChargement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Ajuster les quantités du chargement ({adjustingChargement.reference})
            </h2>
            <p className="text-slate-500">
              Modifiez le nombre de cartons alloués pour chaque produit. Le statut passera automatiquement à <strong>Partiellement validée</strong>.
            </p>

            <form onSubmit={handleSubmitAdjustment} className="space-y-3">
              {adjustingChargement.items.map((it: any) => (
                <div key={it.productId} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{it.name}</div>
                    <div className="text-[10px] text-slate-400">Demandé: {it.requestedBoxes} cartons</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={adjustedQuantities[it.productId] ?? it.requestedBoxes}
                      onChange={(e) =>
                        setAdjustedQuantities({
                          ...adjustedQuantities,
                          [it.productId]: Number(e.target.value)
                        })
                      }
                      className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900"
                    />
                    <span className="text-slate-400">ctn</span>
                  </div>
                </div>
              ))}

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAdjustingChargement(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  Valider l'ajustement (Partiellement validée)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 4: REJETER CHARGEMENT AVEC MOTIF (Magasinier) */}
      {/* ---------------------------------------------------- */}
      {rejectingChargementId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold text-red-600 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeter la demande de chargement
            </h2>
            <p className="text-slate-500">
              Un motif obligatoire doit être précisé pour informer le vendeur de la raison du rejet.
            </p>

            <form onSubmit={handleSubmitRejection} className="space-y-3">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Motif obligatoire de rejet :</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                  placeholder="ex: Stock dépôt insuffisant, réservation pour tournée Bko-Sud..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setRejectingChargementId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  Confirmer le rejet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5: SORTIE PERTE / CASSE / PÉREMPTION */}
      {/* avec motif et valeur en FCFA */}
      {/* ---------------------------------------------------- */}
      {showLossModal && selectedLotForLoss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Sortie "Perte / Casse / Péremption"
            </h2>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1">
              <div>Lot : <strong className="font-mono text-slate-900 dark:text-white">{selectedLotForLoss.lot_number}</strong></div>
              <div>Produit : <strong className="text-slate-900 dark:text-white">{selectedLotForLoss.product_name}</strong></div>
              <div>Stock disponible dans ce lot : <strong className="text-teal-600">{selectedLotForLoss.quantity} cartons</strong></div>
              <div>Prix unitaire carton : <strong>{selectedLotForLoss.price_box?.toLocaleString('fr-FR')} FCFA</strong></div>
            </div>

            {lossError && (
              <div className="p-2.5 rounded-xl bg-red-50 text-red-700 font-semibold text-xs border border-red-200">
                {lossError}
              </div>
            )}

            <form onSubmit={handleConfirmLoss} className="space-y-3">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Nombre de cartons à sortir :</label>
                <input
                  type="number"
                  min="1"
                  max={selectedLotForLoss.quantity}
                  value={lossQuantity}
                  onChange={(e) => setLossQuantity(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Motif obligatoire de la sortie :</label>
                <input
                  type="text"
                  value={lossMotif}
                  onChange={(e) => setLossMotif(e.target.value)}
                  required
                  placeholder="ex: Casse manipulation, Dépassement date de péremption..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Calculated financial value */}
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-between">
                <span className="font-semibold text-red-900 dark:text-red-200">Valeur marchande constatée :</span>
                <span className="font-black text-sm text-red-700 dark:text-red-400">
                  {((lossQuantity || 0) * (selectedLotForLoss.price_box || 0)).toLocaleString('fr-FR')} FCFA
                </span>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowLossModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLoss}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  {isSubmittingLoss ? 'Sortie en cours...' : 'Valider la sortie de stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 6: DÉCLARATION RETOUR INVENDUS (Vendeur) */}
      {/* ---------------------------------------------------- */}
      {showRetourModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-teal-600" />
              Déclarer un retour d'invendus au Dépôt
            </h2>
            <p className="text-slate-500">
              Renseignez les cartons invendus ramenés dans votre camionnette. Le magasinier vérifiera les quantités et confirmera la réintégration au stock central.
            </p>

            <form onSubmit={handleDeclareRetour} className="space-y-4">
              <div className="space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200">Cartons invendus par produit :</div>
                {products.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        value={retourItems[p.id] || 0}
                        onChange={(e) =>
                          setRetourItems({
                            ...retourItems,
                            [p.id]: Number(e.target.value)
                          })
                        }
                        className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900"
                      />
                      <span className="text-slate-400">ctn</span>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Motif du retour :</label>
                <input
                  type="text"
                  value={retourReason}
                  onChange={(e) => setRetourReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowRetourModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRetour}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"
                >
                  {isSubmittingRetour ? 'Déclaration...' : 'Déclarer le retour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
