import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Gift,
  Camera,
  Paperclip,
  FileText,
  Eye,
  Image as ImageIcon,
  Sparkles,
  Printer,
} from 'lucide-react';
import { StockBadge } from './StockBadge';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { exportTableToCsv } from '../utils/csvExport';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { DataTable } from './DataTable';
import { ExportViewButton } from './ExtractionsView';
import { InvoiceData } from './PrintableDocument';
import {
  FieldError,
  ConfirmDestructiveButton,
  FORM_FIELD_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FORM_LABEL_CLASS,
  FORM_ROW_CLASS,
  FORM_GROUP_CLASS,
} from './FormControls';

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
  onOpenDocument?: (doc: InvoiceData) => void;
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
  onOpenDocument,
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
    if (
      initialTab === 'chargements' ||
      initialTab === 'chargements-lecture' ||
      initialTab === 'demande-stock-vendeur' ||
      initialTab === 'mon-chargement' ||
      initialTab === 'mes-chargements'
    )
      return 'chargements';
    if (initialTab === 'retours') return 'retours';
    if (initialTab === 'inventaire') return 'inventaire';
    if (initialTab === 'bons-a-remettre') return 'bons-a-remettre';
    return 'stock';
  });

  useEffect(() => {
    if (initialTab === 'lots') setActiveTab('lots');
    else if (initialTab === 'receptions') setActiveTab('receptions');
    else if (
      initialTab === 'chargements' ||
      initialTab === 'chargements-lecture' ||
      initialTab === 'demande-stock-vendeur' ||
      initialTab === 'mon-chargement' ||
      initialTab === 'mes-chargements'
    )
      setActiveTab('chargements');
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
  const [depotInventoriesList, setDepotInventoriesList] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [bonsList, setBonsList] = useState<any[]>([]);
  const [fefoCatalog, setFefoCatalog] = useState<any[]>([]);
  const [bonActionMsg, setBonActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [replacingTarget, setReplacingTarget] = useState<{ bonId: string; oldProductId: string; oldName: string; maxAmount: number } | null>(null);
  const [newReplaceProductId, setNewReplaceProductId] = useState<string>('');
  const [newReplaceQty, setNewReplaceQty] = useState<number>(1);
  const [replaceReason, setReplaceReason] = useState<string>('Rupture de stock sur le lot demandé — remplacement proposé par le Gestionnaire de stock');
  const [isProcessingBon, setIsProcessingBon] = useState<string | null>(null);
  const [bonTestSummary, setBonTestSummary] = useState<any | null>(null);
  const [testResults, setTestResults] = useState<{ success: boolean; message: string; steps: string[] } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Fetch lots, retours, movements, bons, and products
  const fetchAuxData = async () => {
    try {
      const [lRes, rRes, mRes, iRes, diRes, uRes, pRes, bRes] = await Promise.all([
        fetch('/api/lots').then(r => r.json()).catch(() => ({ lots: [] })),
        fetch('/api/retours').then(r => r.json()).catch(() => ({ retours: [] })),
        fetch('/api/stock-movements').then(r => r.json()).catch(() => ({ movements: [] })),
        fetch('/api/inventaires-vendeur').then(r => r.json()).catch(() => ({ inventories: [] })),
        fetch('/api/inventaires-depot').then(r => r.json()).catch(() => ({ inventories: [] })),
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
      if (diRes.inventories) setDepotInventoriesList(diRes.inventories);
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
  // 1. RÉCEPTIONS (Gestionnaire de stock)
  // Lignes avec produit, cartons reçus, numéro de lot et date de péremption obligatoires ;
  // Pièce jointe photo du BL fournisseur (prise de photo caméra ou import) ;
  // Note optionnelle lorsque le stock demandé n'est pas reçu intégralement.
  // ----------------------------------------------------
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [supplierName, setSupplierName] = useState('Usines Partenaires Agroalimentaires Mali');
  const [blNumber, setBlNumber] = useState(`BL-FOURN-${new Date().toISOString().split('T')[0]}`);
  const [blPhoto, setBlPhoto] = useState<string>('');
  const [blFilename, setBlFilename] = useState<string>('');
  const [hasStockDiscrepancy, setHasStockDiscrepancy] = useState<boolean>(false);
  const [receptionNotes, setReceptionNotes] = useState<string>('');
  const [showBlCamera, setShowBlCamera] = useState<boolean>(false);
  const [blCameraError, setBlCameraError] = useState<string>('');
  const [viewingBlReception, setViewingBlReception] = useState<any | null>(null);
  const blVideoRef = useRef<HTMLVideoElement | null>(null);
  const blStreamRef = useRef<MediaStream | null>(null);
  const blCameraInputRef = useRef<HTMLInputElement | null>(null);
  const blFileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper pour déduire le trigramme normé du produit (ex: JUS-CAJ-12 -> CAJ)
  const getProductTrigram = (prodId?: string): string => {
    const catalog = products && products.length > 0 ? products : fetchedProducts;
    const prod = catalog.find((p) => p.id === prodId);
    if (!prod) return 'LOT';
    if (prod.code) {
      const parts = prod.code.split('-');
      if (parts.length >= 2 && parts[1].length >= 2) return parts[1].toUpperCase();
      if (parts[0] && parts[0].length >= 2) return parts[0].toUpperCase();
    }
    if (prod.name) {
      const words = prod.name.trim().split(/\s+/);
      const lastOrFirst = words[words.length - 1] || words[0];
      return lastOrFirst.slice(0, 3).toUpperCase();
    }
    return 'LOT';
  };

  // Génération automatique d'un numéro de lot normé (LOT-{TRIGRAMME}-{YYYYMMDD}-{SEQ})
  const generateAutoLotNumber = (
    prodId?: string,
    existingLines?: Array<{ lotNumber: string }>,
    targetDate?: string
  ): string => {
    const trigram = getProductTrigram(prodId);
    const dateVal = (targetDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const prefix = `LOT-${trigram}-${dateVal}-`;

    const existingSet = new Set<string>();
    (lots || []).forEach((l: any) => {
      if (l.lot_number) existingSet.add(String(l.lot_number).trim().toUpperCase());
    });
    (existingLines || receptionLines || []).forEach((line) => {
      if (line.lotNumber) existingSet.add(String(line.lotNumber).trim().toUpperCase());
    });

    let seq = 1;
    while (existingSet.has(`${prefix}${String(seq).padStart(2, '0')}`)) {
      seq++;
    }
    return `${prefix}${String(seq).padStart(2, '0')}`;
  };

  const [receptionLines, setReceptionLines] = useState<
    Array<{ productId: string; requestedCartons?: number; cartons: number; lotNumber: string; expiryDate: string }>
  >(() => {
    const defaultProdId = products[0]?.id || 'prod-caj';
    const trigram = 'CAJ';
    const dateVal = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return [
      {
        productId: defaultProdId,
        requestedCartons: 100,
        cartons: 100,
        lotNumber: `LOT-${trigram}-${dateVal}-01`,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      },
    ];
  });
  const [receptionError, setReceptionError] = useState('');
  const [isSubmittingReception, setIsSubmittingReception] = useState(false);

  // Ouverture du modal de réception avec numérotation de lot automatique réinitialisée
  const handleOpenReceptionModal = () => {
    setReceptionError('');
    setBlPhoto('');
    setBlFilename('');
    setHasStockDiscrepancy(false);
    setReceptionNotes('');
    const today = new Date().toISOString().split('T')[0];
    const catalog = products && products.length > 0 ? products : fetchedProducts;
    const defaultProdId = catalog[0]?.id || 'prod-caj';
    const autoLot = generateAutoLotNumber(defaultProdId, [], today);
    setReceptionLines([
      {
        productId: defaultProdId,
        requestedCartons: 100,
        cartons: 100,
        lotNumber: autoLot,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      },
    ]);
    setShowReceptionModal(true);
  };

  // Ajout d'une ligne avec attribution automatique d'un produit et d'un numéro de lot incrémenté
  const addReceptionLine = () => {
    const catalog = products && products.length > 0 ? products : fetchedProducts;
    const usedProdIds = new Set(receptionLines.map((l) => l.productId));
    const nextProd = catalog.find((p) => !usedProdIds.has(p.id)) || catalog[0];
    const nextProdId = nextProd?.id || 'prod-caj';
    const today = new Date().toISOString().split('T')[0];
    const autoLot = generateAutoLotNumber(nextProdId, receptionLines, today);

    setReceptionLines((prev) => [
      ...prev,
      {
        productId: nextProdId,
        requestedCartons: 50,
        cartons: 50,
        lotNumber: autoLot,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      },
    ]);
  };

  // Changement de produit sur une ligne : recalcul automatique du numéro de lot normé
  const handleProductChange = (lineIdx: number, newProdId: string) => {
    setReceptionLines((prev) => {
      const updated = [...prev];
      const otherLines = prev.filter((_, i) => i !== lineIdx);
      const newAutoLot = generateAutoLotNumber(newProdId, otherLines);
      updated[lineIdx] = {
        ...updated[lineIdx],
        productId: newProdId,
        lotNumber: newAutoLot,
      };
      return updated;
    });
  };

  // Régénérer le numéro de lot automatique d'une ligne spécifique
  const regenerateLineLot = (lineIdx: number) => {
    setReceptionLines((prev) => {
      const updated = [...prev];
      const line = updated[lineIdx];
      const otherLines = prev.filter((_, i) => i !== lineIdx);
      const trigram = getProductTrigram(line.productId);
      const dateVal = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const prefix = `LOT-${trigram}-${dateVal}-`;

      const existingSet = new Set<string>();
      (lots || []).forEach((l: any) => {
        if (l.lot_number) existingSet.add(String(l.lot_number).trim().toUpperCase());
      });
      otherLines.forEach((l) => {
        if (l.lotNumber) existingSet.add(String(l.lotNumber).trim().toUpperCase());
      });
      if (line.lotNumber) existingSet.add(String(line.lotNumber).trim().toUpperCase());

      let seq = 1;
      while (existingSet.has(`${prefix}${String(seq).padStart(2, '0')}`)) {
        seq++;
      }
      updated[lineIdx] = {
        ...line,
        lotNumber: `${prefix}${String(seq).padStart(2, '0')}`,
      };
      return updated;
    });
  };

  // Régénérer tous les numéros de lots de toutes les lignes
  const regenerateAllLots = () => {
    setReceptionLines((prev) => {
      const assigned: Array<{ lotNumber: string }> = [];
      return prev.map((line) => {
        const lotNumber = generateAutoLotNumber(line.productId, assigned);
        assigned.push({ lotNumber });
        return {
          ...line,
          lotNumber,
        };
      });
    });
  };

  const stopBlCamera = () => {
    if (blStreamRef.current) {
      blStreamRef.current.getTracks().forEach((t) => t.stop());
      blStreamRef.current = null;
    }
    setShowBlCamera(false);
  };

  const startBlCamera = async () => {
    setBlCameraError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      blCameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      blStreamRef.current = stream;
      setShowBlCamera(true);
      setTimeout(() => {
        if (blVideoRef.current) {
          blVideoRef.current.srcObject = stream;
          blVideoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch {
      blCameraInputRef.current?.click();
    }
  };

  const captureBlPhotoFromVideo = () => {
    const video = blVideoRef.current;
    if (!video) return;
    const w = video.videoWidth || 1024;
    const h = video.videoHeight || 768;
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      setBlPhoto(dataUrl);
      setBlFilename(`photo_bl_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`);
    }
    stopBlCamera();
  };

  const handleBlFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlCameraError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = typeof ev.target?.result === 'string' ? ev.target.result : '';
      if (!rawDataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setBlPhoto(compressed);
          setBlFilename(file.name || `photo_bl_${Date.now()}.jpg`);
        } else {
          setBlPhoto(rawDataUrl);
          setBlFilename(file.name || `photo_bl_${Date.now()}.jpg`);
        }
      };
      img.onerror = () => {
        setBlPhoto(rawDataUrl);
        setBlFilename(file.name || `photo_bl_${Date.now()}.jpg`);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeReceptionLine = (idx: number) => {
    if (receptionLines.length <= 1) return;
    setReceptionLines((prev) => prev.filter((_, i) => i !== idx));
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
        setReceptionError(`Ligne ${i + 1} : Le nombre de cartons reçus doit être supérieur à 0.`);
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
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || currentRole,
        },
        body: JSON.stringify({
          supplier_name: supplierName,
          lines: receptionLines,
          bl_number: blNumber.trim() || null,
          bl_photo: blPhoto || null,
          bl_filename: blFilename || null,
          notes: receptionNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setReceptionError(data.error || 'Erreur lors de la réception.');
      } else {
        stopBlCamera();
        setShowReceptionModal(false);
        setReceptionLines([
          {
            productId: products[0]?.id || '',
            requestedCartons: 100,
            cartons: 100,
            lotNumber: `LOT-${Date.now().toString().slice(-4)}`,
            expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
          },
        ]);
        setBlPhoto('');
        setBlFilename('');
        setReceptionNotes('');
        setHasStockDiscrepancy(false);
        setReceptionActionMsg({
          type: 'success',
          text: data.message || 'Stock reçu validé et réception enregistrée avec succès.',
        });
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setReceptionError('Erreur de connexion serveur.');
    } finally {
      setIsSubmittingReception(false);
    }
  };

  // Sales Admin (Contrôleur) actions on Receptions: Validate or Cancel/Reject
  const [receptionActionMsg, setReceptionActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validatingReceptionId, setValidatingReceptionId] = useState<string | null>(null);
  const [cancellingReception, setCancellingReception] = useState<any | null>(null);
  const [cancelReceptionReason, setCancelReceptionReason] = useState<string>('Écart de comptage constaté à la réception / Non-conformité lot');
  const [cancelReceptionError, setCancelReceptionError] = useState<string>('');
  const [isCancellingReception, setIsCancellingReception] = useState<boolean>(false);

  const handleValidateReception = async (id: string) => {
    setReceptionActionMsg(null);
    setValidatingReceptionId(id);
    try {
      const res = await fetch(`/api/receptions/${id}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || currentRole
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setReceptionActionMsg({ type: 'error', text: data.error || 'Erreur lors de la validation de la réception.' });
      } else {
        setReceptionActionMsg({
          type: 'success',
          text: data.message || 'Réception validée avec succès et intégrée au stock dépôt.'
        });
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setReceptionActionMsg({ type: 'error', text: 'Erreur réseau lors de la validation.' });
    } finally {
      setValidatingReceptionId(null);
    }
  };

  const handleOpenCancelReceptionModal = (rec: any) => {
    setCancellingReception(rec);
    setCancelReceptionReason(
      rec.status === 'en_attente'
        ? 'Écart constaté par le Contrôleur lors du pointage physique des lots reçus'
        : 'Annulation d\'approvisionnement après contrôle Sales Admin'
    );
    setCancelReceptionError('');
  };

  const handleSubmitCancelReception = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingReception) return;
    if (!cancelReceptionReason.trim()) {
      setCancelReceptionError('Veuillez saisir un motif d\'annulation obligatoire.');
      return;
    }
    setIsCancellingReception(true);
    setCancelReceptionError('');
    try {
      const res = await fetch(`/api/receptions/${cancellingReception.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || currentRole
        },
        body: JSON.stringify({ cancel_reason: cancelReceptionReason.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelReceptionError(data.error || 'Erreur lors de l\'annulation de la réception.');
      } else {
        setCancellingReception(null);
        setReceptionActionMsg({
          type: 'success',
          text: data.message || 'Approvisionnement / réception annulé(e) par le Contrôleur.'
        });
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setCancelReceptionError('Erreur réseau lors de l\'annulation.');
    } finally {
      setIsCancellingReception(false);
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
  const [selectedRequestVendorId, setSelectedRequestVendorId] = useState<string>('usr-vnd-1');
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
    if (currentLineProductId !== p.id) {
      setCurrentLineProductId(p.id);
      setCurrentLineQty(Math.min(10, p.stock_depot));
    }
  };

  // Step 1: "Valider" directement dans le bloc du produit sélectionné
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

    // Current choice validated! Next line can now be added via "+ Ajouter un produit" or by clicking another product
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
      setLineBuilderError('Veuillez sélectionner un produit, saisir la quantité et cliquer sur "Valider" avant d\'envoyer la demande.');
      return;
    }
    if (!desiredDate) {
      setLineBuilderError('La date souhaitée est obligatoire.');
      return;
    }

    const targetVendorId = currentRole === 'Vendeur' ? currentUser.id : selectedRequestVendorId;
    if (!targetVendorId) {
      setLineBuilderError('Veuillez sélectionner le vendeur bénéficiaire.');
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
          vendor_id: targetVendorId,
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
        setChargementSuccessMsg(
          data.message ||
            `Demande de chargement ${data.reference || data.chargement?.reference || ''} envoyée avec succès au Gestionnaire de stock (Statut : Demandée).`
        );
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

  // Annulation d'un approvisionnement / chargement par le Sales Admin (Contrôleur) ou Administrateur
  const [cancellingApproChargement, setCancellingApproChargement] = useState<any | null>(null);
  const [cancelApproReason, setCancelApproReason] = useState<string>('Annulation d\'approvisionnement suite au contrôle Sales Admin');
  const [cancelApproError, setCancelApproError] = useState<string>('');
  const [isSubmittingCancelAppro, setIsSubmittingCancelAppro] = useState<boolean>(false);

  const handleOpenCancelApproModal = (chg: any) => {
    setCancellingApproChargement(chg);
    setCancelApproReason('Annulation d\'approvisionnement suite au contrôle Sales Admin');
    setCancelApproError('');
  };

  const handleSubmitCancelAppro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingApproChargement) return;
    if (!cancelApproReason.trim()) {
      setCancelApproError('Le motif d\'annulation de l\'approvisionnement est obligatoire.');
      return;
    }
    setIsSubmittingCancelAppro(true);
    setCancelApproError('');
    try {
      const res = await fetch(`/api/chargements/${cancellingApproChargement.id}/cancel-appro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || currentRole
        },
        body: JSON.stringify({ cancel_reason: cancelApproReason.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelApproError(data.error || 'Erreur lors de l\'annulation de l\'approvisionnement.');
      } else {
        setCancellingApproChargement(null);
        setChargementSuccessMsg(data.message || 'Approvisionnement annulé avec succès.');
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setCancelApproError('Erreur réseau lors de l\'annulation.');
    } finally {
      setIsSubmittingCancelAppro(false);
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

  // Inventaire Physique Dépôt Central (Sales Admin / Contrôleur, Magasinier, Administrateur)
  const [inventoryMode, setInventoryMode] = useState<'vendeur' | 'depot'>('vendeur');
  const [depotPhysicalCountInput, setDepotPhysicalCountInput] = useState<{ [productId: string]: number }>({});
  const [depotInventoryNotes, setDepotInventoryNotes] = useState('Inventaire physique contradictoire du Dépôt Central Sotuba');
  const [applyDepotAdjustment, setApplyDepotAdjustment] = useState<boolean>(true);
  const [isSubmittingDepotInventory, setIsSubmittingDepotInventory] = useState<boolean>(false);
  const [depotInvFeedback, setDepotInvFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (products.length > 0) {
      setDepotPhysicalCountInput(prev => {
        const next = { ...prev };
        products.forEach(p => {
          if (next[p.id] === undefined) {
            next[p.id] = p.stock_depot;
          }
        });
        return next;
      });
    }
  }, [products]);

  const liveDepotVariance = useMemo(() => {
    let totalEcartBoxes = 0;
    let totalEcartFcfa = 0;
    const items = products.map(p => {
      const counted = Number(depotPhysicalCountInput[p.id] ?? p.stock_depot);
      const diff = counted - p.stock_depot;
      const diffFcfa = diff * p.price_box;
      totalEcartBoxes += diff;
      totalEcartFcfa += diffFcfa;
      return {
        ...p,
        theoreticalQty: p.stock_depot,
        counted,
        diff,
        diffFcfa
      };
    });
    return { totalEcartBoxes, totalEcartFcfa, items };
  }, [products, depotPhysicalCountInput]);

  const handleSubmitDepotInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepotInvFeedback(null);
    setIsSubmittingDepotInventory(true);
    try {
      const counted_items = products.map(p => ({
        productId: p.id,
        countedQty: Number(depotPhysicalCountInput[p.id] ?? p.stock_depot)
      }));
      const res = await fetch('/api/inventaires-depot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-name': currentUser?.name || currentRole
        },
        body: JSON.stringify({
          counted_items,
          notes: depotInventoryNotes,
          apply_adjustment: applyDepotAdjustment
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDepotInvFeedback({ type: 'error', text: data.error || 'Erreur lors de l\'inventaire dépôt.' });
      } else {
        setDepotInvFeedback({
          type: 'success',
          text: `Inventaire Dépôt ${data.inventory?.reference || ''} enregistré avec succès${applyDepotAdjustment ? ' (stock dépôt ajusté au comptage physique)' : ''}.`
        });
        onRefreshData();
        fetchAuxData();
      }
    } catch {
      setDepotInvFeedback({ type: 'error', text: 'Erreur réseau lors de l\'enregistrement de l\'inventaire dépôt.' });
    } finally {
      setIsSubmittingDepotInventory(false);
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

  const isAdmin = currentRole === 'Administrateur';
  const isMagasinier = currentRole === 'Gestionnaire de stock' || currentRole === 'Magasinier' || isAdmin;
  const isDirecteurOps = currentRole === 'Directeur des opérations de vente';
  const isSalesAdmin = currentRole === 'Sales Admin';
  const canControlStock = isSalesAdmin || isAdmin;
  const isVendeur = currentRole === 'Vendeur';
  const canRequestVendorStock = isVendeur || isDirecteurOps || isAdmin;

  const selectableVendors = useMemo(() => {
    if (vendorsList.length > 0) return vendorsList;
    return [
      { id: 'usr-vnd-1', code: 'BAO-VND-001', name: 'Oumar Konaté', team: 'Équipe Sotuba / Rive Gauche' },
      { id: 'usr-vnd-2', code: 'BAO-VND-002', name: 'Sékou Traoré', team: 'Équipe Badalabougou / Rive Droite' },
      { id: 'usr-vnd-3', code: 'BAO-VND-003', name: 'Bakary Sidibé', team: 'Équipe Centre Commercial / ACI' },
    ];
  }, [vendorsList]);

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

  const handleExportActiveDepotTabCsv = (targetTab = activeTab) => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (targetTab === 'stock') {
      exportTableToCsv({
        filename: `stock_depot_central_${todayStr}.csv`,
        columns: [
          'Code SKU',
          'Designation Produit',
          'Gamme',
          'Conditionnement',
          'Unites par Carton',
          'Prix Carton (FCFA)',
          'Stock Depot (Cartons)',
          'Stock Depot (Unites)',
          'Seuil Alerte (Cartons)',
          'Statut Stock',
          'Valeur Stock (FCFA)',
        ],
        rows: products.map((p) => {
          const stockCtn = Number(p.stock_depot || 0);
          const threshold = Number(p.threshold_depot || 0);
          const statusLabel =
            stockCtn <= 0 ? 'Rupture' : stockCtn <= threshold ? 'Stock Bas' : 'Normal';
          return [
            p.code,
            p.name,
            p.gamme,
            p.packaging,
            Number(p.units_per_box || 12),
            Number(p.price_box || 0),
            stockCtn,
            stockCtn * Number(p.units_per_box || 12),
            threshold,
            statusLabel,
            stockCtn * Number(p.price_box || 0),
          ];
        }),
      });
      return;
    }

    if (targetTab === 'lots') {
      exportTableToCsv({
        filename: `lots_fefo_baobab_${todayStr}.csv`,
        columns: [
          'N° Lot',
          'Code Produit',
          'Designation Produit',
          'Date Peremption',
          'Jours Restants',
          'Statut FEFO',
          'Stock Disponible (Cartons)',
        ],
        rows: filteredLots.map((l) => [
          l.lot_number,
          l.product_code || '',
          l.product_name || '',
          l.expiry_date || '',
          l.days_remaining ?? '',
          l.shelf_life_label || '',
          Number(l.quantity || 0),
        ]),
      });
      return;
    }

    if (targetTab === 'chargements') {
      exportTableToCsv({
        filename: `chargements_stocks_${todayStr}.csv`,
        columns: [
          'Reference Chargement',
          'Date Demande',
          'Date Souhaitee',
          'Nom Vendeur',
          'Code Vendeur',
          'Detail Produits (Cartons)',
          'Statut',
          'Valeur Totale (FCFA)',
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
            .join(' | ');
          return [
            c.reference || c.id,
            c.date || '',
            c.desired_date || c.date || '',
            c.vendor_name || '',
            c.vendor_code || '',
            detail,
            c.status === 'valide' ? 'Chargee' : c.status || 'Demandee',
            Number(c.total_amount || 0),
          ];
        }),
      });
      return;
    }

    if (targetTab === 'receptions') {
      exportTableToCsv({
        filename: `receptions_fournisseurs_${todayStr}.csv`,
        columns: [
          'Reference Reception',
          'Date',
          'Fournisseur',
          'Detail des Lots Recus',
          'Total Cartons',
          'Statut',
        ],
        rows: receptions.map((r) => {
          const items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items || [];
          const totalBoxes = items.reduce((acc: number, it: any) => acc + Number(it.cartons || it.qtyBoxes || 0), 0);
          const detail = items
            .map((it: any) => `${it.name || it.productName || 'Produit'} (${it.cartons || it.qtyBoxes || 0} ctn - Lot ${it.lotNumber || 'N/A'})`)
            .join(' | ');
          return [
            r.reference || r.id,
            r.date || '',
            r.supplier_name || 'Fournisseur Agroalimentaire',
            detail,
            totalBoxes,
            r.status || 'valide',
          ];
        }),
      });
      return;
    }

    if (targetTab === 'retours') {
      exportTableToCsv({
        filename: `retours_invendus_${todayStr}.csv`,
        columns: [
          'Reference Retour',
          'Date',
          'Nom Vendeur',
          'Code Vendeur',
          'Produits Retournes',
          'Motif',
          'Statut',
        ],
        rows: visibleRetours.map((ret) => {
          const items = typeof ret.items === 'string' ? JSON.parse(ret.items) : ret.items || [];
          const detail = items.map((it: any) => `${it.name}: ${it.cartons || it.qtyBoxes || 0} ctn`).join(' | ');
          return [
            ret.reference || ret.id,
            ret.date || '',
            ret.vendor_name || '',
            ret.vendor_code || '',
            detail,
            ret.reason || 'Fin de tournee',
            ret.status || 'Valide',
          ];
        }),
      });
      return;
    }

    if (targetTab === 'inventaire') {
      exportTableToCsv({
        filename: `inventaires_ecarts_${todayStr}.csv`,
        columns: [
          'Reference Inventaire',
          'Date',
          'Nom Vendeur',
          'Code Vendeur',
          'Ecart Total (Cartons)',
          'Valeur Ecart (FCFA)',
          'Statut',
        ],
        rows: visibleInventories.map((inv) => [
          inv.reference || inv.id,
          inv.date || '',
          inv.vendor_name || '',
          inv.vendor_code || '',
          Number(inv.total_discrepancy_boxes ?? 0),
          Number(inv.total_discrepancy_value ?? 0),
          inv.status || 'Cloture',
        ]),
      });
      return;
    }

    if (targetTab === 'bons-a-remettre') {
      exportTableToCsv({
        filename: `bons_cadeaux_stocks_${todayStr}.csv`,
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
        rows: bonsList.map((b) => [
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
      return;
    }

    exportTableToCsv({
      filename: `journal_mouvements_stock_${todayStr}.csv`,
      columns: [
        'Date & Heure',
        'Type Mouvement',
        'Code Produit',
        'Designation Produit',
        'Lot',
        'Quantite (Cartons)',
        'Acteur / Reference',
        'Motif',
      ],
      rows: movementsList.map((m) => [
        (m.created_at || m.date || '').replace('T', ' ').slice(0, 16),
        m.movement_type || m.type || '',
        m.product_code || '',
        m.product_name || '',
        m.lot_number || '-',
        Number(m.quantity_change || m.quantity || 0),
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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isVendeur
                ? `Mes Chargements & Retours (${currentUser?.name})`
                : 'Dépôt Central & Chaîne Logistique'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)]">
              {isVendeur
                ? 'Vendeur'
                : currentRole === 'Gestionnaire de stock' || currentRole === 'Magasinier'
                ? 'Magasinier'
                : currentRole}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isVendeur
                ? 'Suivi de vos chargements et retours.'
                : 'Dépôt : réceptions, chargements et lots.'}
            </p>
            <InfoTooltip
              text={
                isVendeur
                  ? 'Suivi strictement personnel de vos demandes de chargement camionnette et de vos retours d’invendus.'
                  : 'Chaîne agroalimentaire : Fournisseur → Dépôt central → Vendeurs (dépôt-vente) → Points de vente.'
              }
            />
          </div>
        </div>

        {/* Action button based on role */}
        <div className="flex items-center gap-2 flex-wrap">
          {isMagasinier && (
            <>
              <button
                onClick={handleOpenReceptionModal}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Nouvelle Réception Fournisseur</span>
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('demandes-achat')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                  <span>Demandes d&apos;achat (Validation Admin)</span>
                </button>
              )}
            </>
          )}

          {canRequestVendorStock && (
            <button
              onClick={() => {
                setShowRequestLoadingModal(true);
                setValidatedLines([]);
                setIsAddingLine(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>
                {isDirecteurOps || isAdmin ? 'Demander du stock pour un vendeur' : 'Demander un Chargement'}
              </span>
            </button>
          )}

          {/* Test Runner Button (Admin / Magasinier only) */}
          {!isVendeur && (
            <button
              onClick={handleRunIntegratedTest}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs transition cursor-pointer"
              title="Lancer le test : réception 100, chargement 20, vente 5, retour 3"
            >
              <PlayCircle className={`w-4 h-4 ${isTesting ? 'animate-spin text-[var(--marque-fonce)]' : 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'}`} />
              <span>{isTesting ? 'Test en cours...' : 'Test Cycle (100 -> 20 -> 5 -> 3)'}</span>
            </button>
          )}

          {!isVendeur && (
            <>
              <ExportViewButton
                currentUser={currentUser}
                jeu={
                  activeTab === 'lots'
                    ? 'lots'
                    : activeTab === 'receptions'
                    ? 'receptions'
                    : initialTab === 'demande-stock-vendeur'
                    ? 'demandes_stock_vendeur'
                    : activeTab === 'chargements'
                    ? 'chargements'
                    : activeTab === 'retours'
                    ? 'retours'
                    : activeTab === 'inventaire'
                    ? 'inventaires'
                    : activeTab === 'bons-a-remettre'
                    ? 'bons_a_remettre'
                    : activeTab === 'movements'
                    ? 'stock_et_mouvements'
                    : 'stock_depot'
                }
                label="Exporter"
              />

              <button
                type="button"
                onClick={() => handleExportActiveDepotTabPdf()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Exporter Tableau en PDF</span>
              </button>
            </>
          )}
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
                  ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
                  ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
              ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
              ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
              ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
                  ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
                  ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
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
          <DataTable<any>
            data={products}
            getRowKey={(p) => p.id}
            emptyMessage="Aucun produit dans le stock dépôt."
            mobileTitle={(p) => p.name}
            mobileSubtitle={(p) => `${p.code} • ${p.gamme}`}
            mobileStatusBadge={(p) => (
              <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />
            )}
            columns={[
              {
                key: 'name',
                label: 'Produit & Référence',
                hideOnMobileCard: true,
                render: (p) => (
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">{p.code}</div>
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux Dépôt</span>,
              },
              {
                key: 'gamme',
                label: 'Gamme',
                hideOnMobileCard: true,
                render: (p) => (
                  <span className="text-[11px] font-bold uppercase text-teal-600 dark:text-teal-400">
                    {p.gamme}
                  </span>
                ),
              },
              {
                key: 'packaging',
                label: 'Conditionnement',
                isSecondary: true,
                render: (p) => (
                  <span className="text-slate-600 dark:text-slate-300">{p.packaging}</span>
                ),
              },
              {
                key: 'price_box',
                label: 'Prix Carton',
                align: 'right',
                isNumeric: true,
                render: (p) => (
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {p.price_box.toLocaleString('fr-FR')} FCFA
                  </span>
                ),
              },
              {
                key: 'stock_depot',
                label: 'Stock Physique',
                align: 'right',
                isNumeric: true,
                render: (p) => (
                  <span className="font-black text-slate-900 dark:text-white">
                    {p.stock_depot} <span className="text-[10px] font-bold text-teal-600">ctn</span>
                  </span>
                ),
                footer: (
                  <span>
                    {products.reduce((acc, p) => acc + Number(p.stock_depot || 0), 0)} ctn
                  </span>
                ),
              },
              {
                key: 'autonomy',
                label: 'Couverture',
                isSecondary: true,
                align: 'center',
                render: (p) => (
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    ~{Math.round(p.stock_depot / 25)} j (obj. 30-45j)
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Statut Seuil',
                align: 'center',
                hideOnMobileCard: true,
                render: (p) => (
                  <StockBadge stock={p.stock_depot} threshold={p.threshold_depot} />
                ),
              },
            ]}
            totalsFooter={
              <>
                <span>
                  Références :{' '}
                  <strong className="text-slate-900 dark:text-white">{products.length}</strong>
                </span>
                <span>
                  Stock physique total :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {products.reduce((acc, p) => acc + Number(p.stock_depot || 0), 0)} cartons
                  </strong>
                </span>
                <span>
                  Valorisation Dépôt :{' '}
                  <strong className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {products
                      .reduce(
                        (acc, p) => acc + Number(p.stock_depot || 0) * Number(p.price_box || 0),
                        0
                      )
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />

          <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2">
            <span>
              <strong>Dépôt Central :</strong> Sorties en ordre FEFO, lots périmés bloqués.
            </span>
            <InfoTooltip text="Le stock dépôt central approvisionne les vendeurs en dépôt-vente. Les sorties respectent strictement l'ordre FEFO (First Expired, First Out) pour garantir la fraîcheur des produits agroalimentaires distribués au Mali. Tout lot périmé est automatiquement bloqué." />
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

              {!isVendeur && (
                <div className="flex items-center justify-end gap-2">
                  <ExportViewButton
                    currentUser={currentUser}
                    jeu="lots"
                    label="Exporter Lots"
                    filtres={{
                      q: lotSearchTerm,
                    }}
                  />
                  <button
                    onClick={() => handleExportActiveDepotTabPdf('lots')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </button>
                </div>
              )}
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

          {/* Lots & FEFO — Composant partagé DataTable */}
          <DataTable<any>
            data={filteredLots}
            getRowKey={(lot) => lot.id}
            emptyMessage="Aucun lot ne correspond aux critères de filtre."
            mobileTitle={(lot) => lot.lot_number}
            mobileSubtitle={(lot) => `${lot.product_name} (${lot.product_code})`}
            mobileStatusBadge={(lot) => {
              let badgeClasses = '';
              if (lot.shelf_life_status === 'bon') {
                badgeClasses =
                  'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
              } else if (lot.shelf_life_status === 'attention') {
                badgeClasses =
                  'bg-amber-100 text-[#92400E] border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
              } else if (lot.shelf_life_status === 'urgent') {
                badgeClasses =
                  'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
              } else {
                badgeClasses =
                  'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:text-slate-200';
              }
              return (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClasses}`}
                >
                  {lot.shelf_life_label}
                </span>
              );
            }}
            columns={[
              {
                key: 'lot_number',
                label: 'N° Lot & Produit',
                hideOnMobileCard: true,
                render: (lot) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {lot.lot_number}
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {lot.product_name}
                    </div>
                    <div className="text-[10px] text-slate-400">{lot.product_code}</div>
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux Lots</span>,
              },
              {
                key: 'expiry',
                label: 'Péremption & Délai',
                align: 'center',
                render: (lot) => (
                  <div>
                    <div className="font-mono font-medium text-slate-600 dark:text-slate-300">
                      {lot.expiry_date}
                    </div>
                    <div className="font-bold">
                      <span
                        className={
                          lot.days_remaining <= 0
                            ? 'text-slate-400'
                            : lot.days_remaining < 30
                            ? 'text-red-600'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {lot.days_remaining <= 0 ? 'Expiré' : `${lot.days_remaining} j`}
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'status',
                label: 'Statut Rayon',
                align: 'center',
                hideOnMobileCard: true,
                render: (lot) => {
                  let badgeClasses = '';
                  if (lot.shelf_life_status === 'bon') {
                    badgeClasses =
                      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
                  } else if (lot.shelf_life_status === 'attention') {
                    badgeClasses =
                      'bg-amber-100 text-[#92400E] border-amber-300 dark:bg-amber-950/80 dark:text-amber-300';
                  } else if (lot.shelf_life_status === 'urgent') {
                    badgeClasses =
                      'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300';
                  } else {
                    badgeClasses =
                      'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:text-slate-200';
                  }
                  return (
                    <div>
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClasses}`}
                      >
                        {lot.shelf_life_label}
                      </span>
                      {lot.is_expired && (
                        <div className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase mt-0.5">
                          Bloqué vente & chargement
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'quantity',
                label: 'Stock Dispo',
                align: 'right',
                isNumeric: true,
                render: (lot) => (
                  <span className="font-black text-slate-900 dark:text-white">
                    {lot.quantity} <span className="text-[10px] font-bold text-teal-600">ctn</span>
                  </span>
                ),
                footer: (
                  <span>
                    {filteredLots.reduce((acc, l) => acc + Number(l.quantity || 0), 0)} ctn
                  </span>
                ),
              },
              {
                key: 'fefo',
                label: 'Ordre FEFO',
                align: 'center',
                isSecondary: true,
                render: (lot) =>
                  lot.is_expired ? (
                    <span className="text-[10px] text-slate-400 font-bold">Exclu</span>
                  ) : lot.quantity === 0 ? (
                    <span className="text-[10px] text-slate-400">Épuisé</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                      <span>Priorité FEFO</span>
                    </span>
                  ),
              },
            ]}
            renderActions={(lot) =>
              lot.quantity > 0 ? (
                <button
                  type="button"
                  onClick={() => handleOpenLossModal(lot)}
                  className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 text-[11px] font-bold transition cursor-pointer"
                  title="Sortie Perte / Casse / Péremption"
                >
                  Sortie Perte
                </button>
              ) : null
            }
            totalsFooter={
              <>
                <span>
                  Nombre de lots :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {filteredLots.length}
                  </strong>
                </span>
                <span>
                  Stock total des lots :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {filteredLots.reduce((acc, l) => acc + Number(l.quantity || 0), 0)} cartons
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: CHARGEMENTS VENDEURS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'chargements' && (
        <div className="space-y-6">
          <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2">
            <span>
              <strong>Dépôt-Vente :</strong> Validation magasinier et sortie FEFO.
            </span>
            <InfoTooltip text="Le vendeur demande son chargement ligne par ligne pour 3 à 7 jours d'autonomie. Le magasinier valide, ajuste ou rejette avec motif, puis confirme la remise physique (sortie FEFO automatique). Aucune facture n'est générée." />
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

          {/* FORMULAIRE DIRECT DE DEMANDE DE CHARGEMENT (VENDEUR OU DIRECTEUR DES OPÉRATIONS DE VENTE) */}
          {canRequestVendorStock && (
            <div className="rounded-2xl border-2 border-[#008DA9]/30 dark:border-[#008DA9]/40 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-5 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#008DA9]" />
                    {isDirecteurOps || isAdmin
                      ? 'Demande de Stock Camionnette pour un Vendeur'
                      : 'Nouvelle Demande de Chargement Camionnette (Dépôt-Vente)'}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Sélectionnez les produits et saisissez les cartons demandés.
                    </p>
                    <InfoTooltip
                      text={
                        isDirecteurOps || isAdmin
                          ? 'Sélectionnez le vendeur bénéficiaire, choisissez les produits et cliquez sur « Valider » en bas de chaque produit.'
                          : 'Cliquez sur un produit ci-dessous pour saisir directement le nombre de cartons et cliquez sur « Valider » juste en bas du produit.'
                      }
                    />
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#008DA9]/10 text-[#008DA9] dark:text-cyan-300 font-bold text-[11px] self-start sm:self-center">
                  {products.length} produits au catalogue
                </span>
              </div>

              {lineBuilderError && <FieldError message={lineBuilderError} />}

              <form onSubmit={handleSubmitChargementRequest} className="space-y-5">
                {/* 1. Vendeur bénéficiaire (si Directeur des opérations de vente ou Admin) & Date souhaitée */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  {isDirecteurOps || isAdmin ? (
                    <div>
                      <label className="block text-slate-700 dark:text-slate-200 font-bold mb-1">
                        Vendeur bénéficiaire de la demande de stock (obligatoire)
                      </label>
                      <select
                        value={selectedRequestVendorId}
                        onChange={(e) => setSelectedRequestVendorId(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      >
                        {selectableVendors.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.code}) — {v.team || 'Équipe Vente'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-slate-700 dark:text-slate-200 font-bold mb-1">
                        Date d&apos;enlèvement souhaitée au Dépôt Central (obligatoire)
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Autonomie recommandée : 3 à 7 jours de tournée commerciale
                      </span>
                    </div>
                  )}
                  <div>
                    {(isDirecteurOps || isAdmin) && (
                      <label className="block text-slate-700 dark:text-slate-200 font-bold mb-1">
                        Date d&apos;enlèvement souhaitée au Dépôt Central (obligatoire)
                      </label>
                    )}
                    <input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>
                </div>

                {/* 2. Catalogue & Liste des Produits Disponibles (Quantité + Valider directement dans le produit sélectionné) */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                      Catalogue des Produits Disponibles au Dépôt ({availableProductsForLine.length} disponibles) :
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Touchez un produit pour indiquer la quantité et valider
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
                              ? 'border-2 border-[#008DA9] bg-[#008DA9]/5 dark:bg-[#008DA9]/15 shadow-sm'
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

                          {/* Quantité + Bouton "Valider" directement dans le bloc du produit sélectionné */}
                          {isCurrentlySelected && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-3 pt-2.5 border-t border-[#008DA9]/25 space-y-2.5"
                            >
                              <div>
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <label className="font-bold text-slate-700 dark:text-slate-200">
                                    Quantité (Max {prod.stock_depot} ctn) :
                                  </label>
                                  <span className="font-bold text-[#008DA9] dark:text-cyan-300">
                                    {(Math.max(0, Number(currentLineQty) || 0) * prod.price_box).toLocaleString('fr-FR')} FCFA
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCurrentLineQty((q) => Math.max(1, (Number(q) || 1) - 1))}
                                    className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center hover:bg-slate-100 active:scale-95 transition shrink-0 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max={prod.stock_depot}
                                    value={currentLineQty}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (Number.isNaN(val)) {
                                        setCurrentLineQty(0);
                                      } else {
                                        setCurrentLineQty(Math.min(prod.stock_depot, Math.max(0, val)));
                                      }
                                    }}
                                    className="w-full h-8 px-2 rounded-lg border-2 border-[#008DA9] bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-xs text-center focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setCurrentLineQty((q) => Math.min(prod.stock_depot, (Number(q) || 0) + 1))}
                                    className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center hover:bg-slate-100 active:scale-95 transition shrink-0 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={handleValidateCurrentChoice}
                                className="w-full py-2 px-3 rounded-xl bg-[#008DA9] hover:bg-[#00748C] active:scale-[0.99] text-white font-black text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-4 h-4 stroke-[2.5]" />
                                <span>Valider</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bouton "+ Ajouter un produit" activé après validation si d'autres produits sont disponibles */}
                {!isAddingLine && availableProductsForLine.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleStartNextLine}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-[#008DA9] text-[#008DA9] dark:text-cyan-300 hover:bg-[#008DA9]/5 font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        + Ajouter un produit ({availableProductsForLine.length} produit(s) restant(s) au catalogue)
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
                      Aucun produit validé pour l'instant. Sélectionnez un produit ci-dessus, saisissez la quantité puis cliquez sur « Valider ».
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
                            <ConfirmDestructiveButton
                              label="Retirer"
                              confirmLabel="Retirer ?"
                              onConfirm={() => handleRemoveValidatedLine(idx)}
                            />
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
                    className="h-[48px] px-5 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-bold text-sm shadow-sm transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingChargement
                      ? 'Transmission au Gestionnaire de stock...'
                      : `Envoyer la demande de chargement (${validatedLines.reduce((s, l) => s + l.requestedBoxes, 0)} cartons)`}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Chargements Vendeurs — Composant partagé DataTable */}
          <DataTable<any>
            data={visibleChargements}
            getRowKey={(chg) => chg.id}
            emptyMessage="Aucun chargement enregistré."
            mobileTitle={(chg) => chg.reference}
            mobileSubtitle={(chg) =>
              `${chg.date}${chg.desired_date ? ` • Souhaitée: ${chg.desired_date}` : ''}`
            }
            mobileStatusBadge={(chg) => {
              let statusBadge = '';
              if (chg.status === 'Demandée') {
                statusBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
              } else if (chg.status === 'Validée') {
                statusBadge =
                  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
              } else if (chg.status === 'Partiellement validée') {
                statusBadge = 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300';
              } else if (chg.status === 'Rejetée' || chg.status === 'Annulée') {
                statusBadge = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
              } else if (chg.status === 'Chargée') {
                statusBadge = 'bg-[#15803D] text-white font-black';
              } else {
                statusBadge = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
              }
              return (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadge}`}>
                  {chg.status}
                </span>
              );
            }}
            columns={[
              {
                key: 'ref',
                label: 'Réf. & Dates',
                hideOnMobileCard: true,
                render: (chg) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {chg.reference}
                    </div>
                    <div className="text-[11px] text-slate-500">{chg.date}</div>
                    {chg.desired_date && (
                      <div className="text-[10px] text-teal-600 font-semibold">
                        Souhaitée: {chg.desired_date}
                      </div>
                    )}
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux</span>,
              },
              {
                key: 'vendor',
                label: 'Vendeur & Équipe',
                render: (chg) => (
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    <div>
                      {chg.vendor_name || 'Vendeur'} ({chg.vendor_code || ''})
                    </div>
                    <div className="text-[10px] text-slate-400">{chg.vendor_team || ''}</div>
                  </div>
                ),
              },
              {
                key: 'items',
                label: 'Lignes de Produits',
                render: (chg) => (
                  <div>
                    <div className="flex flex-wrap gap-1">
                      {(chg.items || []).map((it: any, idx: number) => {
                        const qty =
                          it.validatedBoxes !== undefined
                            ? it.validatedBoxes
                            : it.requestedBoxes || it.qtyBoxes;
                        return (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            {it.name}: <strong>{qty} ctn</strong>
                            {it.validatedBoxes !== undefined &&
                              it.requestedBoxes &&
                              it.validatedBoxes !== it.requestedBoxes && (
                                <span className="text-[10px] text-amber-600 line-through ml-1">
                                  ({it.requestedBoxes})
                                </span>
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
                    {chg.cancel_reason && (
                      <div className="text-[11px] text-red-600 font-bold mt-1">
                        Motif annulation ({chg.cancelled_by || 'Contrôleur'}) : {chg.cancel_reason}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'total',
                label: 'Valeur & Statut',
                align: 'right',
                isNumeric: true,
                render: (chg) => {
                  let statusBadge = '';
                  if (chg.status === 'Demandée') {
                    statusBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                  } else if (chg.status === 'Validée') {
                    statusBadge =
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                  } else if (chg.status === 'Partiellement validée') {
                    statusBadge =
                      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300';
                  } else if (chg.status === 'Rejetée' || chg.status === 'Annulée') {
                    statusBadge = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
                  } else if (chg.status === 'Chargée') {
                    statusBadge = 'bg-[#15803D] text-white font-black';
                  } else {
                    statusBadge =
                      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
                  }
                  return (
                    <div>
                      <div
                        className={`font-black ${
                          chg.status === 'Annulée'
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {Number(chg.total_amount || 0).toLocaleString('fr-FR')} FCFA
                      </div>
                      <span
                        className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadge}`}
                      >
                        {chg.status}
                      </span>
                    </div>
                  );
                },
                footer: (
                  <span className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {visibleChargements
                      .filter((c) => c.status !== 'Annulée' && c.status !== 'Rejetée')
                      .reduce((acc, c) => acc + Number(c.total_amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
            ]}
            renderActions={(chg) => {
              const isMyChargement = chg.vendor_id === currentUser.id;
              const canVendorCancel =
                isVendeur && isMyChargement && chg.status === 'Demandée';
              const canMagasinierReview =
                (isMagasinier || isAdmin) && chg.status === 'Demandée';
              const canMagasinierRemise =
                (isMagasinier || isAdmin) &&
                (chg.status === 'Validée' || chg.status === 'Partiellement validée');
              const canControllerCancelAppro =
                canControlStock && chg.status !== 'Annulée' && chg.status !== 'Rejetée';

              return (
                <>
                  {canMagasinierReview && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMagasinierValidate(chg.id)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-[10px] shadow-xs cursor-pointer"
                      >
                        Valider
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAdjustModal(chg)}
                        className="px-2.5 py-1 rounded-lg bg-[#92400E] hover:bg-[#78350F] text-white font-bold text-[10px] shadow-xs cursor-pointer"
                      >
                        Ajuster
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(chg.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[10px] shadow-xs cursor-pointer"
                      >
                        Rejeter
                      </button>
                    </>
                  )}
                  {canMagasinierRemise && (
                    <button
                      type="button"
                      onClick={() => handleConfirmRemise(chg.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Confirmer la remise</span>
                    </button>
                  )}
                  {canVendorCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancelChargement(chg.id)}
                      className="px-2.5 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-[10px] font-bold cursor-pointer"
                    >
                      Annuler la demande
                    </button>
                  )}
                  {canControllerCancelAppro && (
                    <button
                      type="button"
                      onClick={() => handleOpenCancelApproModal(chg)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 text-[10px] font-bold transition cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Annuler approvisionnement</span>
                    </button>
                  )}
                  {chg.status === 'Chargée' && (
                    <span className="text-[11px] text-teal-700 dark:text-teal-400 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Remis • FEFO
                    </span>
                  )}
                </>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Chargements :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleChargements.length}
                  </strong>
                </span>
                <span>
                  Valeur active :{' '}
                  <strong className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {visibleChargements
                      .filter((c) => c.status !== 'Annulée' && c.status !== 'Rejetée')
                      .reduce((acc, c) => acc + Number(c.total_amount || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: RÉCEPTIONS (Fournisseur -> Dépôt) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'receptions' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span>
                <strong>Réceptions :</strong> Validation du stock reçu et photo du BL.
              </span>
              <InfoTooltip text="Le Gestionnaire de stock valide le stock reçu du fournisseur, joint la photo du Bon de Livraison (BL) et peut ajouter une note d'écart. Le Sales Admin (Contrôleur) valide ensuite la réception pour intégrer les cartons au stock dépôt central." />
            </div>
            {isMagasinier && (
              <button
                onClick={handleOpenReceptionModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>+ Réceptionner du stock (Photo BL)</span>
              </button>
            )}
          </div>

          {receptionActionMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                receptionActionMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              <span>{receptionActionMsg.text}</span>
              <button onClick={() => setReceptionActionMsg(null)} className="ml-2 font-mono text-sm">&times;</button>
            </div>
          )}

          {/* Réceptions — Composant partagé DataTable */}
          <DataTable<any>
            data={receptions}
            getRowKey={(r) => r.id}
            emptyMessage="Aucune réception enregistrée."
            mobileTitle={(r) => r.reference}
            mobileSubtitle={(r) => `${r.date} • ${r.supplier_name}`}
            mobileStatusBadge={(r) => {
              const isPending = r.status === 'en_attente';
              const isCancelled = r.status === 'annulee';
              return (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isPending
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : isCancelled
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {isPending
                    ? 'En attente Contrôleur'
                    : isCancelled
                    ? 'Annulée'
                    : 'Validée en stock'}
                </span>
              );
            }}
            columns={[
              {
                key: 'ref',
                label: 'N° Réception & BL',
                hideOnMobileCard: true,
                render: (r) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {r.reference}
                    </div>
                    <div className="text-[11px] text-slate-500">{r.date}</div>
                    {r.bl_number && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-mono text-[10px] font-bold">
                        <FileText className="w-3 h-3" />
                        {r.bl_number}
                      </span>
                    )}
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux</span>,
              },
              {
                key: 'supplier',
                label: 'Fournisseur & Gestionnaire',
                render: (r) => {
                  const isCancelled = r.status === 'annulee';
                  return (
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {r.supplier_name}
                      </div>
                      {r.submitted_by && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Soumis par : <strong>{r.submitted_by}</strong>
                        </div>
                      )}
                      {r.validated_by && !isCancelled && (
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                          Validé : <strong>{r.validated_by}</strong>
                        </div>
                      )}
                      {r.cancel_reason && (
                        <div className="text-[10px] text-red-600 font-bold mt-0.5">
                          Motif annulation ({r.cancelled_by || 'Contrôleur'}) : {r.cancel_reason}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'items',
                label: "Lignes Reçues, Lots & Note d'écart",
                render: (r) => (
                  <div className="space-y-1">
                    {(r.items || []).map((it: any, idx: number) => {
                      const reqBoxes = Number(it.requestedBoxes || 0);
                      const recBoxes = Number(it.boxes || 0);
                      const hasDiff = reqBoxes > 0 && reqBoxes !== recBoxes;
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"
                        >
                          <span className="font-bold text-slate-900 dark:text-white">
                            {it.name}:
                          </span>
                          <span className="font-bold">{recBoxes} cartons reçus</span>
                          {hasDiff && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[10px]">
                              Demandé: {reqBoxes} ctn (
                              {recBoxes - reqBoxes > 0
                                ? `+${recBoxes - reqBoxes}`
                                : recBoxes - reqBoxes}
                              )
                            </span>
                          )}
                          {it.lot_number && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                              Lot: {it.lot_number} (Exp: {it.expiry_date})
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {r.notes && (
                      <div className="mt-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
                        <strong className="font-bold text-amber-800 dark:text-amber-300">
                          Note Gestionnaire de stock :
                        </strong>{' '}
                        {r.notes}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'bl_status',
                label: 'Pièce Jointe BL & Statut',
                align: 'center',
                render: (r) => {
                  const isPending = r.status === 'en_attente';
                  const isCancelled = r.status === 'annulee';
                  return (
                    <div className="space-y-1.5">
                      <div>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isPending
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : isCancelled
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {isPending
                            ? 'En attente Contrôleur'
                            : isCancelled
                            ? 'Annulée'
                            : 'Validée en stock'}
                        </span>
                      </div>
                      {r.bl_photo ? (
                        <button
                          type="button"
                          onClick={() => setViewingBlReception(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#008DA9]/10 hover:bg-[#008DA9]/20 text-[#008DA9] dark:text-cyan-300 font-bold text-[10px] border border-[#008DA9]/30 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Voir Photo BL</span>
                        </button>
                      ) : (
                        <div className="text-[10px] text-slate-400">Sans photo BL</div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'total_boxes',
                label: 'Total Cartons',
                align: 'right',
                isNumeric: true,
                render: (r) => (
                  <span
                    className={`font-black ${
                      r.status === 'annulee'
                        ? 'line-through text-slate-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {r.total_boxes?.toLocaleString('fr-FR')} cartons
                  </span>
                ),
                footer: (
                  <span>
                    {receptions
                      .filter((r) => r.status !== 'annulee')
                      .reduce((acc, r) => acc + Number(r.total_boxes || 0), 0)}{' '}
                    cartons
                  </span>
                ),
              },
            ]}
            renderActions={(r) => {
              const isPending = r.status === 'en_attente';
              const isCancelled = r.status === 'annulee';
              if (canControlStock && !isCancelled) {
                return (
                  <>
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => handleValidateReception(r.id)}
                        disabled={validatingReceptionId === r.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-[10px] shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {validatingReceptionId === r.id
                            ? 'Validation...'
                            : 'Valider la réception'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenCancelReceptionModal(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 font-bold text-[10px] cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>
                        {isPending ? 'Rejeter' : 'Annuler approvisionnement'}
                      </span>
                    </button>
                  </>
                );
              }
              return (
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Dépôt Central Sotuba
                </span>
              );
            }}
            totalsFooter={
              <>
                <span>
                  Réceptions :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {receptions.length}
                  </strong>
                </span>
                <span>
                  Cartons réceptionnés :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {receptions
                      .filter((r) => r.status !== 'annulee')
                      .reduce((acc, r) => acc + Number(r.total_boxes || 0), 0)}{' '}
                    cartons
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: RETOURS (Vendeur rend l'invendu, Magasinier confirme) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'retours' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-slate-500">
                Déclaration et confirmation des retours d&apos;invendus.
              </p>
              <InfoTooltip text="Retour des invendus de tournée : le vendeur déclare ses cartons invendus, puis le magasinier confirme la réintégration physique au stock dépôt." />
            </div>
            {(isVendeur || isAdmin) && (
              <button
                onClick={() => setShowRetourModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs self-start sm:self-auto cursor-pointer"
              >
                + Déclarer un retour d'invendus
              </button>
            )}
          </div>

          {/* Retours d'invendus — Composant partagé DataTable */}
          <DataTable<any>
            data={visibleRetours}
            getRowKey={(ret) => ret.id}
            emptyMessage="Aucun retour d'invendus pour l'instant."
            mobileTitle={(ret) => ret.reference}
            mobileSubtitle={(ret) => `${ret.date} • ${ret.vendor_name || 'Vendeur'}`}
            mobileStatusBadge={(ret) => (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  ret.status === 'confirme' || ret.status === 'valide'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {ret.status === 'confirme' || ret.status === 'valide'
                  ? 'Confirmé'
                  : 'En attente'}
              </span>
            )}
            columns={[
              {
                key: 'ref',
                label: 'Réf. & Date',
                hideOnMobileCard: true,
                render: (ret) => (
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {ret.reference}
                    </div>
                    <div className="text-[11px] text-slate-500">{ret.date}</div>
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux Retours</span>,
              },
              {
                key: 'vendor',
                label: 'Vendeur',
                hideOnMobileCard: true,
                render: (ret) => (
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {ret.vendor_name || 'Vendeur'}
                  </span>
                ),
              },
              {
                key: 'items',
                label: 'Marchandises & Motif',
                render: (ret) => (
                  <div>
                    <div className="flex flex-wrap gap-1">
                      {(ret.items || []).map((it: any, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                        >
                          {it.name}: <strong>{it.boxes || it.qtyBoxes} ctn</strong>
                        </span>
                      ))}
                    </div>
                    {ret.reason && (
                      <div className="text-[11px] text-slate-500 mt-1">{ret.reason}</div>
                    )}
                  </div>
                ),
                footer: (
                  <span>
                    {visibleRetours.reduce(
                      (acc, r) =>
                        acc +
                        (r.items || []).reduce(
                          (sum: number, it: any) => sum + Number(it.boxes || it.qtyBoxes || 0),
                          0
                        ),
                      0
                    )}{' '}
                    ctn
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Statut',
                align: 'center',
                hideOnMobileCard: true,
                render: (ret) => (
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ret.status === 'confirme' || ret.status === 'valide'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {ret.status === 'confirme' || ret.status === 'valide'
                      ? 'Confirmé'
                      : 'En attente'}
                  </span>
                ),
              },
            ]}
            renderActions={(ret) =>
              (isMagasinier || isAdmin) && ret.status === 'en_attente' ? (
                <button
                  type="button"
                  onClick={() => handleConfirmRetour(ret.id)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  Confirmer le retour
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  {ret.confirmed_by ? `Validé par ${ret.confirmed_by}` : 'Clôturé'}
                </span>
              )
            }
            totalsFooter={
              <>
                <span>
                  Retours déclarés :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleRetours.length}
                  </strong>
                </span>
                <span>
                  Total cartons retournés :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {visibleRetours.reduce(
                      (acc, r) =>
                        acc +
                        (r.items || []).reduce(
                          (sum: number, it: any) => sum + Number(it.boxes || it.qtyBoxes || 0),
                          0
                        ),
                      0
                    )}{' '}
                    cartons
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: INVENTAIRE VENDEUR & DÉPÔT CENTRAL (Sales Admin / Contrôleur) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'inventaire' && (
        <div className="space-y-6">
          {!isVendeur && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setInventoryMode('vendeur')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  inventoryMode === 'vendeur'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                }`}
              >
                Inventaires Camionnettes Vendeurs ({visibleInventories.length})
              </button>
              <button
                type="button"
                onClick={() => setInventoryMode('depot')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  inventoryMode === 'depot'
                    ? 'bg-[var(--marque-fonce)] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                }`}
              >
                Inventaire Physique Dépôt Central ({depotInventoriesList.length})
              </button>
            </div>
          )}

          {(isVendeur || inventoryMode === 'vendeur') ? (
            <>
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2">
                <span>
                  <strong>Inventaire Vendeur :</strong> Stock théorique comparé au comptage.
                </span>
                <InfoTooltip text="Stock théorique = Chargé - Vendu - Rendu. Comparé à l'inventaire physique compté dans la camionnette. Tout écart en FCFA est calculé atomiquement et notifié immédiatement à l'Administrateur et au Comptable." />
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
                  {/* Inventaire Vendeur — Composant partagé DataTable */}
                  <DataTable<any>
                    data={liveVariance.items}
                    getRowKey={(it) => it.productId}
                    emptyMessage="Aucun produit pour cet inventaire."
                    mobileTitle={(it) => it.name}
                    mobileSubtitle={(it) =>
                      `${it.code} • ${it.price_box.toLocaleString('fr-FR')} FCFA/ctn`
                    }
                    mobileStatusBadge={(it) => (
                      <span
                        className={`font-mono text-[11px] font-black ${
                          it.diffFcfa === 0
                            ? 'text-slate-400'
                            : it.diffFcfa < 0
                            ? 'text-red-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {it.diff > 0 ? `+${it.diff}` : it.diff} ctn (
                        {it.diffFcfa.toLocaleString('fr-FR')} FCFA)
                      </span>
                    )}
                    columns={[
                      {
                        key: 'name',
                        label: 'Produit',
                        hideOnMobileCard: true,
                        render: (it) => (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {it.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {it.code} • {it.price_box.toLocaleString('fr-FR')} FCFA/ctn
                            </div>
                          </div>
                        ),
                        footer: <span className="uppercase text-[11px]">Bilan Écart</span>,
                      },
                      {
                        key: 'flows',
                        label: 'Chargé / Vendu / Rendu',
                        align: 'center',
                        isNumeric: true,
                        render: (it) => (
                          <span className="font-mono text-[11px]">
                            <span className="text-slate-700 dark:text-slate-300">
                              {it.chargedBoxes}
                            </span>
                            {' / '}
                            <span className="text-emerald-600 font-bold">{it.soldBoxes}</span>
                            {' / '}
                            <span className="text-amber-600">{it.returnedBoxes}</span> ctn
                          </span>
                        ),
                      },
                      {
                        key: 'theoretical',
                        label: 'Stock Théorique',
                        align: 'center',
                        isNumeric: true,
                        render: (it) => (
                          <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                            {it.theoreticalQty} ctn
                          </span>
                        ),
                      },
                      {
                        key: 'physical',
                        label: 'Comptage Physique',
                        align: 'center',
                        render: (it) => (
                          <input
                            type="number"
                            min="0"
                            disabled={isVendeur}
                            value={physicalCountInput[it.productId] ?? it.theoreticalQty}
                            onChange={(e) =>
                              setPhysicalCountInput({
                                ...physicalCountInput,
                                [it.productId]: Number(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                          />
                        ),
                      },
                      {
                        key: 'variance',
                        label: 'Écart (Cartons & FCFA)',
                        align: 'right',
                        isNumeric: true,
                        render: (it) => (
                          <div className="font-black font-mono">
                            <div
                              className={
                                it.diff === 0
                                  ? 'text-slate-400'
                                  : it.diff < 0
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }
                            >
                              {it.diff > 0 ? `+${it.diff}` : it.diff} ctn
                            </div>
                            <div
                              className={`text-[11px] ${
                                it.diffFcfa === 0
                                  ? 'text-slate-400'
                                  : it.diffFcfa < 0
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`}
                            >
                              {it.diffFcfa > 0
                                ? `+${it.diffFcfa.toLocaleString('fr-FR')}`
                                : it.diffFcfa.toLocaleString('fr-FR')}{' '}
                              FCFA
                            </div>
                          </div>
                        ),
                        footer: (
                          <span>
                            {liveVariance.totalEcartBoxes > 0
                              ? `+${liveVariance.totalEcartBoxes}`
                              : liveVariance.totalEcartBoxes}{' '}
                            ctn ({liveVariance.totalEcartFcfa.toLocaleString('fr-FR')} FCFA)
                          </span>
                        ),
                      },
                    ]}
                  />

                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <input
                      type="text"
                      disabled={isVendeur}
                      placeholder="Notes ou observations sur l'état de la camionnette..."
                      value={inventoryNotes}
                      onChange={(e) => setInventoryNotes(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60"
                    />

                    {(isMagasinier || isSalesAdmin || isAdmin) && (
                      <button
                        type="submit"
                        disabled={isSubmittingInventory}
                        className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-bold text-xs sm:text-sm shadow-sm transition shrink-0 cursor-pointer"
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
                        &ldquo;{inv.notes}&rdquo; &bull; Notifié à l&apos;Administrateur et au Comptable
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2">
                <span>
                  <strong>Inventaire Dépôt :</strong> Stock système comparé au comptage réel.
                </span>
                <InfoTooltip text="Le Sales Admin (Contrôleur) compare le stock théorique système du dépôt avec le comptage physique réel en entrepôt et peut appliquer l'ajustement directement." />
              </div>

              {depotInvFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    depotInvFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}
                >
                  <span>{depotInvFeedback.text}</span>
                  <button onClick={() => setDepotInvFeedback(null)} className="ml-2 font-mono text-sm">&times;</button>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      Saisie du Comptage Physique — Dépôt Central Sotuba
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Contrôleur : {currentUser?.name || currentRole} ({currentRole})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">Écart Dépôt constaté :</span>
                    <span className={`px-3 py-1 rounded-full font-black text-xs ${
                      liveDepotVariance.totalEcartBoxes === 0
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    }`}>
                      {liveDepotVariance.totalEcartBoxes > 0 ? `+${liveDepotVariance.totalEcartBoxes}` : liveDepotVariance.totalEcartBoxes} ctn &bull; {liveDepotVariance.totalEcartFcfa.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmitDepotInventory} className="space-y-4">
                  {/* Inventaire Dépôt Central — Composant partagé DataTable */}
                  <DataTable<any>
                    data={liveDepotVariance.items}
                    getRowKey={(it) => it.id}
                    emptyMessage="Aucun produit dans le dépôt."
                    mobileTitle={(it) => it.name}
                    mobileSubtitle={(it) => `${it.code} • ${it.gamme}`}
                    mobileStatusBadge={(it) => (
                      <span
                        className={`font-mono text-[11px] font-black ${
                          it.diffFcfa === 0
                            ? 'text-slate-400'
                            : it.diffFcfa < 0
                            ? 'text-red-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {it.diff > 0 ? `+${it.diff}` : it.diff} ctn (
                        {it.diffFcfa.toLocaleString('fr-FR')} FCFA)
                      </span>
                    )}
                    columns={[
                      {
                        key: 'name',
                        label: 'Produit & Gamme',
                        hideOnMobileCard: true,
                        render: (it) => (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {it.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {it.code} • {it.gamme}
                            </div>
                          </div>
                        ),
                        footer: <span className="uppercase text-[11px]">Écart Dépôt</span>,
                      },
                      {
                        key: 'price',
                        label: 'Prix Carton',
                        align: 'center',
                        isNumeric: true,
                        render: (it) => (
                          <span className="font-mono">
                            {it.price_box.toLocaleString('fr-FR')} FCFA
                          </span>
                        ),
                      },
                      {
                        key: 'theoretical',
                        label: 'Stock Système Dépôt',
                        align: 'center',
                        isNumeric: true,
                        render: (it) => (
                          <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                            {it.theoreticalQty} ctn
                          </span>
                        ),
                      },
                      {
                        key: 'physical',
                        label: 'Comptage Physique',
                        align: 'center',
                        render: (it) => (
                          <input
                            type="number"
                            min="0"
                            value={depotPhysicalCountInput[it.id] ?? it.theoreticalQty}
                            onChange={(e) =>
                              setDepotPhysicalCountInput({
                                ...depotPhysicalCountInput,
                                [it.id]: Number(e.target.value),
                              })
                            }
                            className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:ring-2 focus:ring-teal-500"
                          />
                        ),
                      },
                      {
                        key: 'variance',
                        label: 'Écart (Cartons & FCFA)',
                        align: 'right',
                        isNumeric: true,
                        render: (it) => (
                          <div className="font-black font-mono">
                            <div
                              className={
                                it.diff === 0
                                  ? 'text-slate-400'
                                  : it.diff < 0
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }
                            >
                              {it.diff > 0 ? `+${it.diff}` : it.diff} ctn
                            </div>
                            <div
                              className={`text-[11px] ${
                                it.diffFcfa === 0
                                  ? 'text-slate-400'
                                  : it.diffFcfa < 0
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`}
                            >
                              {it.diffFcfa > 0
                                ? `+${it.diffFcfa.toLocaleString('fr-FR')}`
                                : it.diffFcfa.toLocaleString('fr-FR')}{' '}
                              FCFA
                            </div>
                          </div>
                        ),
                        footer: (
                          <span>
                            {liveDepotVariance.totalEcartBoxes > 0
                              ? `+${liveDepotVariance.totalEcartBoxes}`
                              : liveDepotVariance.totalEcartBoxes}{' '}
                            ctn ({liveDepotVariance.totalEcartFcfa.toLocaleString('fr-FR')} FCFA)
                          </span>
                        ),
                      },
                    ]}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyDepotAdjustment}
                        onChange={(e) => setApplyDepotAdjustment(e.target.checked)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>Ajuster automatiquement le stock dépôt central sur les quantités physiques comptées</span>
                    </label>
                  </div>

                  <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <input
                      type="text"
                      placeholder="Observations d'inventaire dépôt (ex: Écart régularisé, contrôle contradictoire)..."
                      value={depotInventoryNotes}
                      onChange={(e) => setDepotInventoryNotes(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    {(isSalesAdmin || isMagasinier || isAdmin) && (
                      <button
                        type="submit"
                        disabled={isSubmittingDepotInventory}
                        className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-bold text-xs sm:text-sm shadow-sm transition shrink-0 cursor-pointer"
                      >
                        {isSubmittingDepotInventory ? 'Validation...' : 'Valider l\'Inventaire Dépôt'}
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Historique Inventaires Dépôt */}
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Historique des Inventaires Physiques du Dépôt Central ({depotInventoriesList.length})
                </h3>
                {depotInventoriesList.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
                    Aucun inventaire physique dépôt enregistré pour le moment.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {depotInventoriesList.map((dinv: any) => (
                      <div key={dinv.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{dinv.reference}</span>
                          <span className="text-slate-400">{dinv.date}</span>
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          Réalisé par : {dinv.performed_by} ({dinv.performed_role})
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-slate-500">Écart net dépôt :</span>
                          <span className={`font-black ${
                            dinv.total_ecart_boxes === 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {dinv.total_ecart_boxes > 0 ? `+${dinv.total_ecart_boxes}` : dinv.total_ecart_boxes} ctn ({dinv.total_ecart_fcfa?.toLocaleString('fr-FR')} FCFA)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 italic">
                          &ldquo;{dinv.notes}&rdquo; {dinv.applied_adjustment ? '• Stock ajusté' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: JOURNAL DE STOCK (Entrées en ajout seul, jamais négatif) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2">
            <span>
              <strong>Journal de Stock :</strong> Traçabilité par numéro de lot et motif.
            </span>
            <InfoTooltip text="Les mouvements entrants sont enregistrés en ajout seul (quantité positive, jamais négative) avec traçabilité stricte par numéro de lot et motif." />
          </div>

          {/* Journal de Stock / Audit — Composant partagé DataTable */}
          <DataTable<any>
            data={movementsList}
            getRowKey={(m) => m.id}
            emptyMessage="Aucun mouvement enregistré dans le journal."
            mobileTitle={(m) => m.type?.replace(/_/g, ' ')}
            mobileSubtitle={(m) => m.created_at?.replace('T', ' ').substring(0, 19)}
            mobileStatusBadge={(m) =>
              m.direction === 'IN' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  + Entrée ({m.quantity} ctn)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  - Sortie ({m.quantity} ctn)
                </span>
              )
            }
            columns={[
              {
                key: 'date_type',
                label: 'Date & Type',
                hideOnMobileCard: true,
                render: (m) => (
                  <div>
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
                  </div>
                ),
                footer: <span className="uppercase text-[11px]">Totaux Mouvements</span>,
              },
              {
                key: 'product',
                label: 'Produit & Lot',
                render: (m) => (
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {m.product_name}
                    </div>
                    {m.lot_number && (
                      <div className="font-mono text-[10px] text-teal-600">
                        Lot: {m.lot_number}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'motif',
                label: 'Motif / Justification',
                render: (m) => (
                  <span className="text-slate-600 dark:text-slate-300">
                    {m.motif || m.reference || '-'}
                  </span>
                ),
              },
              {
                key: 'direction',
                label: 'Direction',
                align: 'center',
                hideOnMobileCard: true,
                render: (m) =>
                  m.direction === 'IN' ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      + Entrée (Ajout seul)
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      - Sortie (FEFO)
                    </span>
                  ),
              },
              {
                key: 'value',
                label: 'Quantité & Valeur',
                align: 'right',
                isNumeric: true,
                render: (m) => (
                  <div className="font-mono">
                    <div className="font-black text-slate-900 dark:text-white">
                      {m.direction === 'IN' ? `+${m.quantity}` : `-${m.quantity}`} ctn
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {Number(m.value_fcfa || 0).toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                ),
                footer: (
                  <span>
                    {movementsList
                      .reduce((acc, m) => acc + Number(m.value_fcfa || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </span>
                ),
              },
            ]}
            totalsFooter={
              <>
                <span>
                  Mouvements tracés :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {movementsList.length}
                  </strong>
                </span>
                <span>
                  Volume total mouvementé :{' '}
                  <strong className="text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                    {movementsList
                      .reduce((acc, m) => acc + Number(m.value_fcfa || 0), 0)
                      .toLocaleString('fr-FR')}{' '}
                    FCFA
                  </strong>
                </span>
              </>
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB: BONS À REMETTRE (Magasinier / Administrateur) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'bons-a-remettre' && (
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span>
                <strong>Bons cadeaux :</strong> Préparation et remise des paniers FEFO.
              </span>
              <InfoTooltip text="Préparez les paniers composés par les vendeurs (produits en stock non périmés FEFO, valorisés au prix de vente, plafonnés à la valeur du bon). En cas de rupture, proposez un produit de remplacement. Confirmez « Remise effectuée » pour générer la sortie de stock de type « Bon cadeau ». Rien en espèces." />
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
                              Remise effectuée par {bon.prepared_by || 'Gestionnaire de stock'} le {bon.remis_at?.replace('T', ' ').slice(0, 16)}. En attente de confirmation par le vendeur.
                            </span>
                          )}
                          {bon.status === 'Reçu' && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              Réception confirmée par le vendeur le {bon.confirmed_reception_at?.replace('T', ' ').slice(0, 16)}.
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {onOpenDocument && (
                            <button
                              type="button"
                              onClick={() => {
                                const valTotal = deliveredTotal > 0 ? deliveredTotal : basketTotal || bonAmount;
                                onOpenDocument({
                                  id: bon.id,
                                  number: String(bon.id || 'BON').toUpperCase(),
                                  date: (bon.remis_at || bon.confirmed_reception_at || bon.expires_at || '').replace('T', ' ').slice(0, 16) || '2026-11-07',
                                  type: 'bon_cadeau',
                                  docTypeTitle: 'BON CADEAU REMIS (SORTIE FEFO)',
                                  emitterTitle: 'MAGASIN CENTRAL BAOBAB (PRÉPARATION FEFO)',
                                  recipientTitle: 'BÉNÉFICIAIRE DU BON CADEAU (VENDEUR)',
                                  vendorName: bon.prepared_by || currentUser?.name || 'Magasinier Baobab',
                                  vendorCode: currentUser?.code || 'BAO-MAG',
                                  vendorTeam: 'Dépôt Central & Logistique FEFO',
                                  clientName: `${bon.vendor_name} (${bon.vendor_code})`,
                                  pdvName: `${bon.vendor_name} (${bon.vendor_code})`,
                                  pdvNeighborhood: `Semestre ${bon.semester} • Note : ${bon.note_total}/20`,
                                  pdvManager: `Plafond Bon : ${bonAmount.toLocaleString('fr-FR')} FCFA (Rien en espèces)`,
                                  items:
                                    items.length > 0
                                      ? items.map((it: any, idx: number) => ({
                                          id: `${bon.id}-${idx}`,
                                          code: it.code || `CAD-0${idx + 1}`,
                                          description: `${it.name}${it.lotNumber ? ` (Lot FEFO: ${it.lotNumber})` : ''}`,
                                          quantity: Number(it.qtyBoxes || 1),
                                          unitPrice: Number(it.unitPrice || 0),
                                          total: Number(it.total || 0),
                                        }))
                                      : [
                                          {
                                            id: `${bon.id}-0`,
                                            code: String(bon.id || 'BON').toUpperCase(),
                                            description: `Dotation Bon Cadeau Semestre ${bon.semester} (Plafond ${bonAmount.toLocaleString('fr-FR')} FCFA)`,
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
                                  status: `Statut : ${bon.status}`,
                                  isAcquittee: bon.status === 'Remis' || bon.status === 'Reçu',
                                  sigLeftLabel: 'Le Bénéficiaire (Vendeur)',
                                  sigCenterLabel: 'Le Magasinier (Sortie FEFO)',
                                  sigRightLabel: 'Direction Commerciale (DOV)',
                                });
                              }}
                              className="inline-flex items-center gap-1.5 h-[48px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs shadow-xs transition cursor-pointer whitespace-nowrap"
                            >
                              <Printer className="w-4 h-4 shrink-0" />
                              <span className="whitespace-nowrap">Imprimer le bon</span>
                            </button>
                          )}

                          {bon.status === 'À préparer' && items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleConfirmBonRemise(bon.id)}
                              disabled={isProcessingBon === bon.id}
                              className="h-[48px] px-4 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-black text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span className="whitespace-nowrap">
                                {isProcessingBon === bon.id
                                  ? 'Validation en cours...'
                                  : 'Remise effectuée (Sortie de stock « Bon cadeau »)'}
                              </span>
                            </button>
                          )}
                        </div>
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
        <FormModal
          title="Rupture : Proposer un produit de remplacement (FEFO)"
          onClose={() => setReplacingTarget(null)}
          onSubmit={handleConfirmReplacement}
          submitLabel="Valider le remplacement"
          isDirty={Boolean(replaceReason.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px]">
              Produit en rupture : <strong>{replacingTarget.oldName}</strong>. Choisissez un produit en stock non périmé (FEFO) dans la limite du plafond du bon ({replacingTarget.maxAmount.toLocaleString('fr-FR')} FCFA).
            </div>

            <div className="space-y-3">
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
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: NOUVELLE RÉCEPTION FOURNISSEUR (Gestionnaire de stock) */}
      {/* Lignes avec produit, cartons reçus, numéro de lot et date de péremption obligatoires ; */}
      {/* Prise de photo du BL fournisseur en pièce jointe + Note optionnelle en cas d'écart avec le stock demandé */}
      {/* ---------------------------------------------------- */}
      {showReceptionModal && (
        <FormModal
          title="Réception de Stock Fournisseur (Gestionnaire de stock)"
          subtitle="Validez le stock reçu, prenez en photo le Bon de Livraison (BL) du fournisseur en pièce jointe, et notez en option tout écart avec le stock demandé."
          icon={<ArrowDownLeft className="w-5 h-5 text-teal-600" />}
          onClose={() => {
            stopBlCamera();
            setShowReceptionModal(false);
          }}
          onSubmit={handleCreateReception}
          submitLabel={
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmittingReception ? 'Validation en cours...' : 'Valider le stock reçu'}</span>
            </>
          }
          submitDisabled={isSubmittingReception}
          isDirty={Boolean(supplierName.trim() || blNumber.trim() || blPhoto || receptionNotes.trim())}
        >
          <div className="space-y-4 text-xs">
            {receptionError && <FieldError message={receptionError} />}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Fournisseur Agroalimentaire *
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    N° du Bon de Livraison (BL Fournisseur)
                  </label>
                  <input
                    type="text"
                    value={blNumber}
                    onChange={(e) => setBlNumber(e.target.value)}
                    placeholder="ex: BL-UPAM-2026-1029"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              {/* PIÈCE JOINTE : PHOTO DU BL DU FOURNISSEUR */}
              <div className="p-4 rounded-2xl border-2 border-dashed border-[#008DA9]/40 bg-[#008DA9]/5 dark:bg-slate-800/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-[#008DA9]" />
                      <span>Pièce jointe : Photo du Bon de Livraison (BL) du fournisseur</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Prenez directement la photo du BL papier remis par le fournisseur ou importez l&apos;image du BL.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Input caméra mobile direct (capture="environment") */}
                    <input
                      ref={blCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleBlFileSelected}
                      className="hidden"
                    />
                    {/* Input fichier image galerie / PC */}
                    <input
                      ref={blFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBlFileSelected}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={startBlCamera}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008DA9] hover:bg-[#00748C] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Prendre la photo du BL</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => blFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
                    >
                      <Paperclip className="w-4 h-4 text-[#008DA9]" />
                      <span>Joindre une image</span>
                    </button>
                  </div>
                </div>

                {blCameraError && (
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-800 text-[11px] border border-amber-200">
                    {blCameraError}
                  </div>
                )}

                {/* Flux Caméra en direct si activé */}
                {showBlCamera && (
                  <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-teal-300 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        Caméra active — Cadrez le Bon de Livraison (BL) du fournisseur
                      </span>
                      <button
                        type="button"
                        onClick={stopBlCamera}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Fermer caméra
                      </button>
                    </div>
                    <div className="relative rounded-xl overflow-hidden bg-black max-h-64 flex items-center justify-center">
                      <video
                        ref={blVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={captureBlPhotoFromVideo}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-black text-xs shadow-lg cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Capturer la photo du BL</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Aperçu de la photo du BL jointe */}
                {blPhoto && (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={blPhoto}
                        alt="Aperçu BL fournisseur"
                        className="w-20 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Photo du BL fournisseur jointe</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                          {blFilename || 'photo_bl_fournisseur.jpg'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startBlCamera}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                      >
                        Reprendre
                      </button>
                      <ConfirmDestructiveButton
                        label="Retirer"
                        confirmLabel="Retirer ?"
                        onConfirm={() => {
                          setBlPhoto('');
                          setBlFilename('');
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-line products avec numérotation de lot automatique */}
              <div className="space-y-3">
                {/* Bandeau d'information et d'action sur la numérotation de lot automatique */}
                <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-teal-900 dark:text-teal-200 text-xs">
                          Numérotation de lot automatique active
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-200 dark:bg-teal-900 text-teal-900 dark:text-teal-100">
                          Norme LOT-PRODUIT-DATE-SEQ
                        </span>
                      </div>
                      <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-0.5">
                        Chaque ligne reçoit automatiquement son numéro de lot unique incrémenté. Modifiable si le fournisseur fournit un numéro spécifique sur son BL.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={regenerateAllLots}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 font-bold text-[11px] hover:bg-teal-100 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
                      title="Régénérer automatiquement tous les numéros de lots"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Régénérer tous les lots</span>
                    </button>
                    <button
                      type="button"
                      onClick={addReceptionLine}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-[11px] transition cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter une ligne</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    Lignes de stock reçu à valider (Produit, Qté demandée, Qté reçue, N° Lot auto et Péremption) :
                  </span>
                </div>

                <div className="space-y-3">
                  {receptionLines.map((line, idx) => {
                    const reqQty = Number(line.requestedCartons || 0);
                    const recQty = Number(line.cartons || 0);
                    const diffQty = reqQty > 0 ? recQty - reqQty : 0;
                    return (
                      <div
                        key={idx}
                        className="p-3.5 sm:p-4 rounded-2xl border-2 border-teal-100 dark:border-teal-900/60 bg-white dark:bg-slate-800/90 shadow-xs space-y-3"
                      >
                        {/* En-tête de ligne : repère visuel, badge lot, indicateur d'écart */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-700/60 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-extrabold text-xs">
                              Ligne #{idx + 1}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-300 font-mono text-xs font-bold bg-teal-50/80 dark:bg-teal-950/80 px-2.5 py-0.5 rounded-lg border border-teal-200 dark:border-teal-800">
                              <Sparkles className="w-3 h-3 text-teal-600" />
                              <span>Lot auto : {line.lotNumber || 'En cours...'}</span>
                            </span>
                            {reqQty > 0 && diffQty !== 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px] font-bold">
                                Écart : {diffQty > 0 ? `+${diffQty}` : diffQty} cartons (sur {reqQty} demandés)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* RANGÉE 1 : Produit et Numéro de Lot normé */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-end">
                          <div>
                            <label className={FORM_LABEL_CLASS}>
                              Produit agroalimentaire *
                            </label>
                            <select
                              value={line.productId}
                              onChange={(e) => handleProductChange(idx, e.target.value)}
                              className={FORM_SELECT_CLASS}
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} — {p.packaging} ({p.code})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className={FORM_LABEL_CLASS}>
                              N° de Lot (Traçabilité) *
                            </label>
                            <input
                              type="text"
                              placeholder="ex: LOT-CAJ-20261030-01"
                              value={line.lotNumber}
                              onChange={(e) => {
                                const updated = [...receptionLines];
                                updated[idx].lotNumber = e.target.value;
                                setReceptionLines(updated);
                              }}
                              required
                              className={`${FORM_FIELD_CLASS} font-mono font-bold`}
                            />
                          </div>
                        </div>

                        {/* RANGÉE 2 : Quantités et Péremption */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-end">
                          <div>
                            <label className={FORM_LABEL_CLASS}>
                              Qté reçue à valider (Cartons) *
                            </label>
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
                              className={FORM_FIELD_CLASS}
                            />
                          </div>

                          <div>
                            <label className={FORM_LABEL_CLASS}>
                              Date de péremption (DLC) *
                            </label>
                            <input
                              type="date"
                              value={line.expiryDate}
                              onChange={(e) => {
                                const updated = [...receptionLines];
                                updated[idx].expiryDate = e.target.value;
                                setReceptionLines(updated);
                              }}
                              required
                              className={FORM_FIELD_CLASS}
                            />
                          </div>
                        </div>

                        {/* Actions sur une ligne séparée */}
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-700/80">
                          <button
                            type="button"
                            onClick={() => regenerateLineLot(idx)}
                            title="Régénérer automatiquement un nouveau numéro de lot pour ce produit"
                            className="h-[38px] px-3 rounded-lg border border-[#64748B] dark:border-[#94A3B8] bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Régénérer lot</span>
                          </button>
                          {receptionLines.length > 1 && (
                            <ConfirmDestructiveButton
                              label="Supprimer"
                              confirmLabel="Supprimer ?"
                              onConfirm={() => removeReceptionLine(idx)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* NOTE OPTIONNELLE EN CAS DE STOCK DEMANDÉ NON REÇU INTÉGRALEMENT */}
              <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 space-y-2.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasStockDiscrepancy || receptionNotes.trim().length > 0}
                      onChange={(e) => setHasStockDiscrepancy(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      Stock demandé non reçu intégralement ? Noter l&apos;écart ou une observation (Optionnel)
                    </span>
                  </label>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                    Optionnel
                  </span>
                </div>

                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
                  Lorsque vous ne recevez pas la totalité du stock demandé, vous validez la quantité effectivement reçue ci-dessus et vous avez la possibilité de le noter ci-dessous (facultatif) :
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Livraison partielle : quantité reçue inférieure au stock demandé (reliquat attendu)',
                    'Écart constaté entre le stock demandé et le BL du fournisseur',
                    'Cartons manquants au déchargement signalés au transporteur',
                  ].map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setHasStockDiscrepancy(true);
                        setReceptionNotes((prev) => (prev ? `${prev} — ${preset}` : preset));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 text-[10px] font-semibold transition cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={receptionNotes}
                  onChange={(e) => setReceptionNotes(e.target.value)}
                  placeholder="Note optionnelle (ex: 120 cartons reçus sur 150 demandés, reliquat de 30 cartons prévu demain)..."
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
            </div>
          </div>
        </FormModal>
      )}

      {/* MODAL D'APERÇU DE LA PHOTO DU BON DE LIVRAISON (BL FOURNISSEUR) */}
      {viewingBlReception && (
        <FormModal
          title={`Bon de Livraison • ${viewingBlReception.bl_number || viewingBlReception.reference}`}
          subtitle={`Fournisseur : ${viewingBlReception.supplier_name} • Réception : ${viewingBlReception.reference} (${viewingBlReception.date})`}
          icon={<ImageIcon className="w-5 h-5 text-[var(--marque-fonce)]" />}
          onClose={() => setViewingBlReception(null)}
          cancelLabel="Fermer"
          hideFooter={false}
          submitLabel="Fermer"
          onSubmit={() => setViewingBlReception(null)}
          footerContent={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <span className="text-[11px] text-slate-500">
                Soumis par : <strong>{viewingBlReception.submitted_by || 'Moussa Diarra (Gestionnaire de stock)'}</strong>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={viewingBlReception.bl_photo}
                  download={viewingBlReception.bl_filename || `BL_${viewingBlReception.reference}.jpg`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-12 rounded-xl bg-[var(--marque-fonce)] hover:opacity-90 text-white font-bold text-sm cursor-pointer w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le BL</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingBlReception(null)}
                  className="px-4 h-12 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Fermer
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {viewingBlReception.notes && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <strong className="block text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-0.5">
                  Note du Gestionnaire de stock à la réception :
                </strong>
                {viewingBlReception.notes}
              </div>
            )}

            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
              <img
                src={viewingBlReception.bl_photo}
                alt={`BL ${viewingBlReception.bl_number || viewingBlReception.reference}`}
                className="max-h-[60vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: DEMANDE DE CHARGEMENT PAR LE VENDEUR */}
      {/* Règle stricte : multi-produits ligne par ligne (choisir, "Valider ce choix", puis "+ Ajouter un produit" seulement après validation, pas de doublon, quantité plafonnée au stock dépôt, date souhaitée) */}
      {/* ---------------------------------------------------- */}
      {showRequestLoadingModal && (
        <FormModal
          title="Demande de Chargement Camionnette (Dépôt-Vente)"
          icon={<Truck className="w-5 h-5 text-[#008DA9]" />}
          onClose={() => setShowRequestLoadingModal(false)}
          onSubmit={handleSubmitChargementRequest}
          submitLabel={isSubmittingChargement ? 'Envoi...' : 'Envoyer la demande (Statut : Demandée)'}
          submitDisabled={isSubmittingChargement || validatedLines.length === 0}
          isDirty={validatedLines.length > 0}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 text-[11px]">
              <strong>Dépôt-Vente :</strong> Vous ne payez pas à l&apos;avance. Aucune facture n&apos;est émise. Vous recevrez les cartons après validation par le magasinier, puis vous verserez les recettes après vos ventes aux points de vente.
            </div>

            {lineBuilderError && <FieldError message={lineBuilderError} />}

            <div className="space-y-4">
              {isDirecteurOps && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-200 font-bold mb-1">
                    Vendeur bénéficiaire de la demande de stock (obligatoire)
                  </label>
                  <select
                    value={selectedRequestVendorId}
                    onChange={(e) => setSelectedRequestVendorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    {selectableVendors.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.code}) — {v.team || 'Équipe Vente'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date souhaitée */}
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Date d&apos;enlèvement souhaitée (obligatoire)</label>
                <input
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              {/* Interactive Product Catalog List (Quantité + Valider directement dans le bloc du produit sélectionné) */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                  <span>Catalogue des produits disponibles au dépôt ({availableProductsForLine.length} disponibles) :</span>
                  <span className="text-[10px] text-slate-500 text-right">Touchez un produit pour saisir la quantité et valider</span>
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
                            ? 'border-2 border-[#008DA9] bg-[#008DA9]/5 dark:bg-[#008DA9]/15 shadow-xs'
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

                        {/* Saisie directe de la quantité + bouton "Valider" juste en bas dans le bloc du produit sélectionné */}
                        {isCurrentlySelected && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 pt-2.5 border-t border-[#008DA9]/25 space-y-2.5"
                          >
                            <div>
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <label className="font-bold text-slate-700 dark:text-slate-200">
                                  Quantité en cartons (Max {prod.stock_depot}) :
                                </label>
                                <span className="font-black text-[#008DA9] dark:text-cyan-300">
                                  {(Math.max(0, Number(currentLineQty) || 0) * prod.price_box).toLocaleString('fr-FR')} FCFA
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setCurrentLineQty((q) => Math.max(1, (Number(q) || 1) - 1))}
                                  className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center hover:bg-slate-100 active:scale-95 transition shrink-0 cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={prod.stock_depot}
                                  value={currentLineQty}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (Number.isNaN(val)) {
                                      setCurrentLineQty(0);
                                    } else {
                                      setCurrentLineQty(Math.min(prod.stock_depot, Math.max(0, val)));
                                    }
                                  }}
                                  className="w-full h-9 px-3 rounded-lg border-2 border-[#008DA9] bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-sm text-center focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setCurrentLineQty((q) => Math.min(prod.stock_depot, (Number(q) || 0) + 1))}
                                  className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center hover:bg-slate-100 active:scale-95 transition shrink-0 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleValidateCurrentChoice}
                              className="w-full py-2.5 px-4 rounded-xl bg-[#008DA9] hover:bg-[#00748C] active:scale-[0.99] text-white font-black text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-4 h-4 stroke-[2.5]" />
                              <span>Valider</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* "+ Ajouter un produit" après validation si d'autres produits restent disponibles */}
              {!isAddingLine && availableProductsForLine.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleStartNextLine}
                    className="w-full py-2.5 rounded-xl border border-dashed border-[#008DA9] text-[#008DA9] dark:text-teal-300 hover:bg-[#008DA9]/5 dark:hover:bg-teal-950/40 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
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
                    Aucun produit validé pour l&apos;instant. Sélectionnez un produit ci-dessus, indiquez la quantité puis cliquez sur &quot;Valider&quot;.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validatedLines.map((line, idx) => (
                      <div key={idx} className="flex flex-col gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 dark:text-white">{line.name}</span>
                            <span className="text-slate-500 text-[11px] ml-2">({line.requestedBoxes} cartons &bull; {line.unitPrice.toLocaleString('fr-FR')} FCFA/ctn)</span>
                          </div>
                          <span className="font-black text-slate-900 dark:text-white shrink-0">{line.total.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-800/80">
                          <ConfirmDestructiveButton
                            label="Supprimer"
                            confirmLabel="Supprimer ?"
                            onConfirm={() => handleRemoveValidatedLine(idx)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 3: AJUSTER QUANTITÉS CHARGEMENT (Gestionnaire de stock) */}
      {/* ---------------------------------------------------- */}
      {adjustingChargement && (
        <FormModal
          title={`Ajuster les quantités du chargement (${adjustingChargement.reference})`}
          subtitle={
            <>
              Modifiez le nombre de cartons alloués pour chaque produit. Le statut passera automatiquement à <strong>Partiellement validée</strong>.
            </>
          }
          onClose={() => setAdjustingChargement(null)}
          onSubmit={handleSubmitAdjustment}
          submitLabel="Valider l'ajustement (Partiellement validée)"
        >
          <div className="space-y-3 text-xs">
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
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 4: REJETER CHARGEMENT AVEC MOTIF (Gestionnaire de stock) */}
      {/* ---------------------------------------------------- */}
      {rejectingChargementId && (
        <FormModal
          title="Rejeter la demande de chargement"
          subtitle="Un motif obligatoire doit être précisé pour informer le vendeur de la raison du rejet."
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          onClose={() => setRejectingChargementId(null)}
          onSubmit={handleSubmitRejection}
          submitLabel="Confirmer le rejet"
          isDirty={Boolean(rejectionReason.trim())}
        >
          <div className="space-y-3 text-xs">
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
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5: SORTIE PERTE / CASSE / PÉREMPTION */}
      {/* avec motif et valeur en FCFA */}
      {/* ---------------------------------------------------- */}
      {showLossModal && selectedLotForLoss && (
        <FormModal
          title='Sortie "Perte / Casse / Péremption"'
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          onClose={() => setShowLossModal(false)}
          onSubmit={handleConfirmLoss}
          submitLabel={isSubmittingLoss ? 'Sortie en cours...' : 'Valider la sortie de stock'}
          submitDisabled={isSubmittingLoss}
          isDirty={Boolean(lossMotif.trim())}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1">
              <div>Lot : <strong className="font-mono text-slate-900 dark:text-white">{selectedLotForLoss.lot_number}</strong></div>
              <div>Produit : <strong className="text-slate-900 dark:text-white">{selectedLotForLoss.product_name}</strong></div>
              <div>Stock disponible dans ce lot : <strong className="text-teal-600">{selectedLotForLoss.quantity} cartons</strong></div>
              <div>Prix unitaire carton : <strong>{selectedLotForLoss.price_box?.toLocaleString('fr-FR')} FCFA</strong></div>
            </div>

            {lossError && <FieldError message={lossError} />}

            <div className="space-y-3">
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
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 6: DÉCLARATION RETOUR INVENDUS (Vendeur) */}
      {/* ---------------------------------------------------- */}
      {showRetourModal && (
        <FormModal
          title="Déclarer un retour d'invendus au Dépôt"
          subtitle="Renseignez les cartons invendus ramenés dans votre camionnette. Le magasinier vérifiera les quantités et confirmera la réintégration au stock central."
          icon={<RotateCcw className="w-5 h-5 text-teal-600" />}
          onClose={() => setShowRetourModal(false)}
          onSubmit={handleDeclareRetour}
          submitLabel={isSubmittingRetour ? 'Déclaration...' : 'Déclarer le retour'}
          submitDisabled={isSubmittingRetour}
          isDirty={Boolean(retourReason.trim() || Object.values(retourItems).some((v) => Number(v) > 0))}
        >
          <div className={FORM_GROUP_CLASS}>
            <div className="space-y-2">
              <div className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">Cartons invendus par produit :</div>
              {products.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
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
                      className="w-24 h-12 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-center font-bold text-base text-slate-900 dark:text-white bg-white dark:bg-slate-900"
                    />
                    <span className="text-sm text-slate-400 font-medium">ctn</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className={FORM_LABEL_CLASS}>Motif du retour :</label>
              <input
                type="text"
                value={retourReason}
                onChange={(e) => setRetourReason(e.target.value)}
                required
                className={FORM_FIELD_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 7: ANNULER UN APPROVISIONNEMENT / CHARGEMENT (Sales Admin / Contrôleur) */}
      {/* ---------------------------------------------------- */}
      {cancellingApproChargement && (
        <FormModal
          title={`Annuler l'approvisionnement (${cancellingApproChargement.reference})`}
          subtitle={
            cancellingApproChargement.status === 'Chargée'
              ? 'Ce chargement a déjà été remis au vendeur. Son annulation réintégrera automatiquement les cartons au stock du Dépôt Central Sotuba.'
              : 'Cet approvisionnement sera annulé et ne pourra plus être chargé.'
          }
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          onClose={() => setCancellingApproChargement(null)}
          onSubmit={handleSubmitCancelAppro}
          submitLabel={isSubmittingCancelAppro ? 'Annulation...' : "Confirmer l'annulation"}
          submitDisabled={isSubmittingCancelAppro}
          isDirty={Boolean(cancelApproReason.trim())}
        >
          <div className={FORM_GROUP_CLASS}>
            {cancelApproError && <FieldError message={cancelApproError} />}

            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif obligatoire d&apos;annulation (Sales Admin / Contrôleur) :
              </label>
              <textarea
                rows={3}
                value={cancelApproReason}
                onChange={(e) => setCancelApproReason(e.target.value)}
                required
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 8: ANNULER / REJETER UNE RÉCEPTION DE STOCK (Sales Admin / Contrôleur) */}
      {/* ---------------------------------------------------- */}
      {cancellingReception && (
        <FormModal
          title={
            cancellingReception.status === 'en_attente'
              ? `Rejeter / Annuler la réception soumise (${cancellingReception.reference})`
              : `Annuler l'approvisionnement réceptionné (${cancellingReception.reference})`
          }
          subtitle={
            cancellingReception.status === 'en_attente'
              ? 'Cette réception soumise par le Gestionnaire de stock ne sera pas intégrée au stock dépôt.'
              : "L'annulation de cette réception déduira les cartons correspondants du stock dépôt central."
          }
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          onClose={() => setCancellingReception(null)}
          onSubmit={handleSubmitCancelReception}
          submitLabel={isCancellingReception ? 'Traitement...' : "Confirmer l'annulation"}
          submitDisabled={isCancellingReception}
          isDirty={Boolean(cancelReceptionReason.trim())}
        >
          <div className={FORM_GROUP_CLASS}>
            {cancelReceptionError && <FieldError message={cancelReceptionError} />}

            <div>
              <label className={FORM_LABEL_CLASS}>
                Motif obligatoire (Contrôleur) :
              </label>
              <textarea
                rows={3}
                value={cancelReceptionReason}
                onChange={(e) => setCancelReceptionReason(e.target.value)}
                required
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
};
