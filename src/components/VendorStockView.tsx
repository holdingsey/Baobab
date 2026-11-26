import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Package,
  Truck,
  PlusCircle,
  Plus,
  Check,
  CheckCircle2,
  AlertTriangle,
  Search,
  Layers,
  Calendar,
  Send,
  Trash2,
  Clock,
  XCircle,
  ArrowUpRight,
  ShoppingBag,
  Sparkles,
  Filter,
  Download
} from 'lucide-react';
import { exportTableToPdf, formatFcfaPdf } from '../utils/pdfExport';
import { exportTableToCsv } from '../utils/csvExport';
import { FormModal } from './FormModal';
import { InfoTooltip } from './InfoTooltip';
import { FieldError, ConfirmDestructiveButton } from './FormControls';
import { DataTable } from './DataTable';

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

interface VendorStockItem {
  productId: string;
  code: string;
  name: string;
  gamme: string;
  packaging: string;
  units_per_box: number;
  price_box: number;
  stock_depot: number;
  threshold_depot: number;
  chargedBoxes: number;
  soldBoxes: number;
  returnedBoxes: number;
  theoreticalQty: number;
  stockValue: number;
}

interface VendorStockViewProps {
  products: Product[];
  chargements: any[];
  sales: any[];
  currentUser: any;
  onRefreshData: () => void;
  onNavigateTab?: (tab: string) => void;
}

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'prod-caj-ananas',
    code: 'JUS-CAJ-ANA-12',
    name: 'Cajoucy Ananas',
    gamme: 'Jus Cajoucy',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9000,
    stock_depot: 220,
    threshold_depot: 40,
  },
  {
    id: 'prod-caj-cocktail',
    code: 'JUS-CAJ-COC-12',
    name: 'Cajoucy Cocktail',
    gamme: 'Jus Cajoucy',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9000,
    stock_depot: 195,
    threshold_depot: 40,
  },
  {
    id: 'prod-caj-mangue',
    code: 'JUS-CAJ-MAN-12',
    name: 'Cajoucy Mangue',
    gamme: 'Jus Cajoucy',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9000,
    stock_depot: 240,
    threshold_depot: 40,
  },
  {
    id: 'prod-caj-pomme',
    code: 'JUS-CAJ-POM-12',
    name: 'Cajoucy Pomme de Cajou',
    gamme: 'Jus Cajoucy',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9000,
    stock_depot: 180,
    threshold_depot: 40,
  },
  {
    id: 'prod-caj-orange',
    code: 'JUS-CAJ-ORA-12',
    name: 'Cajoucy Orange',
    gamme: 'Jus Cajoucy',
    packaging: 'Carton de 12',
    units_per_box: 12,
    price_box: 9000,
    stock_depot: 210,
    threshold_depot: 40,
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

export const VendorStockView: React.FC<VendorStockViewProps> = ({
  products: propProducts,
  chargements,
  sales,
  currentUser,
  onRefreshData,
  onNavigateTab,
}) => {
  const [serverStock, setServerStock] = useState<VendorStockItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal & Builder state for "Faire une demande de stock"
  const [showRequestModal, setShowRequestModal] = useState<boolean>(false);
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>('all');
  const [desiredDate, setDesiredDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [validatedLines, setValidatedLines] = useState<
    Array<{
      productId: string;
      code: string;
      name: string;
      gamme: string;
      requestedBoxes: number;
      unitPrice: number;
      total: number;
    }>
  >([]);
  const [currentLineProductId, setCurrentLineProductId] = useState<string>('');
  const [currentLineQty, setCurrentLineQty] = useState<number>(10);
  const [isAddingLine, setIsAddingLine] = useState<boolean>(true);
  const [requestError, setRequestError] = useState<string>('');
  const [requestSuccessMsg, setRequestSuccessMsg] = useState<string>('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);

  const catalogProducts = useMemo<Product[]>(() => {
    const raw = propProducts && propProducts.length > 0 ? propProducts : FALLBACK_PRODUCTS;
    return raw
      .filter((p: any) => Number(p.is_active ?? 1) === 1)
      .map((p) => ({
        ...p,
        gamme: p.gamme || 'Autres Produits',
        packaging: p.packaging || 'Carton',
        units_per_box: Number(p.units_per_box ?? 12),
        price_box: Number(p.price_box ?? 9000),
        stock_depot: Number(p.stock_depot ?? 200),
        threshold_depot: Number(p.threshold_depot ?? 40),
      }));
  }, [propProducts]);

  // Fetch accurate theoretical stock for current vendor from backend
  const fetchVendorStock = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/inventaires-vendeur/theoretical/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.theoreticalStock)) {
          setServerStock(data.theoreticalStock);
        }
      }
    } catch (err) {
      console.warn('Erreur lors du chargement du stock vendeur:', err);
    }
  };

  useEffect(() => {
    fetchVendorStock();
  }, [currentUser?.id, chargements, sales]);

  // Compute vendor stock items with fallback calculation if serverStock hasn't arrived yet
  const vendorStockItems = useMemo<VendorStockItem[]>(() => {
    if (serverStock.length > 0) {
      return serverStock.map((item) => {
        const catProd = catalogProducts.find((p) => p.id === item.productId);
        const qty = Number(item.theoreticalQty ?? 0);
        const price = Number(item.price_box ?? catProd?.price_box ?? 0);
        return {
          productId: item.productId,
          code: item.code || catProd?.code || '',
          name: item.name || catProd?.name || '',
          gamme: item.gamme || catProd?.gamme || 'Autres Produits',
          packaging: item.packaging || catProd?.packaging || 'Carton',
          units_per_box: Number(item.units_per_box ?? catProd?.units_per_box ?? 12),
          price_box: price,
          stock_depot: Number(item.stock_depot ?? catProd?.stock_depot ?? 0),
          threshold_depot: Number(item.threshold_depot ?? catProd?.threshold_depot ?? 50),
          chargedBoxes: Number(item.chargedBoxes ?? 0),
          soldBoxes: Number(item.soldBoxes ?? 0),
          returnedBoxes: Number(item.returnedBoxes ?? 0),
          theoreticalQty: qty,
          stockValue: qty * price,
        };
      });
    }

    // Client-side fallback calculation (active tour since 2026-10-24)
    const activeCycleStartDate = '2026-10-24';
    return catalogProducts.map((prod) => {
      const myChargements = chargements.filter(
        (c) =>
          c.vendor_id === currentUser?.id &&
          (c.status === 'Chargée' || c.status === 'valide') &&
          (c.date || '') >= activeCycleStartDate
      );

      let chargedBoxes = 0;
      for (const chg of myChargements) {
        const items = typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items || [];
        for (const it of items) {
          if (it.productId === prod.id) {
            chargedBoxes += Number(
              it.validatedBoxes !== undefined
                ? it.validatedBoxes
                : it.requestedBoxes || it.qtyBoxes || 0
            );
          }
        }
      }

      const mySales = sales.filter(
        (s) =>
          s.vendor_id === currentUser?.id &&
          s.status !== 'annulee' &&
          (s.date || '') >= activeCycleStartDate
      );
      let soldBoxes = 0;
      for (const s of mySales) {
        const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items || [];
        for (const it of items) {
          if (it.productId === prod.id) {
            soldBoxes += Number(it.qtyBoxes || 0);
          }
        }
      }

      const theoreticalQty = Math.max(0, chargedBoxes - soldBoxes);
      return {
        productId: prod.id,
        code: prod.code,
        name: prod.name,
        gamme: prod.gamme,
        packaging: prod.packaging,
        units_per_box: prod.units_per_box,
        price_box: prod.price_box,
        stock_depot: prod.stock_depot,
        threshold_depot: prod.threshold_depot,
        chargedBoxes,
        soldBoxes,
        returnedBoxes: 0,
        theoreticalQty,
        stockValue: theoreticalQty * prod.price_box,
      };
    });
  }, [serverStock, catalogProducts, chargements, sales, currentUser?.id]);

  // Dynamic list of all categories (gammes) with aggregated metrics
  const categoriesSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        gamme: string;
        productCount: number;
        totalCharged: number;
        totalSold: number;
        totalReturned: number;
        totalAvailableBoxes: number;
        totalAvailableUnits: number;
        totalStockValue: number;
        items: VendorStockItem[];
      }
    >();

    for (const item of vendorStockItems) {
      const cat = item.gamme || 'Autres Produits';
      if (!map.has(cat)) {
        map.set(cat, {
          gamme: cat,
          productCount: 0,
          totalCharged: 0,
          totalSold: 0,
          totalReturned: 0,
          totalAvailableBoxes: 0,
          totalAvailableUnits: 0,
          totalStockValue: 0,
          items: [],
        });
      }
      const entry = map.get(cat)!;
      entry.productCount += 1;
      entry.totalCharged += item.chargedBoxes;
      entry.totalSold += item.soldBoxes;
      entry.totalReturned += item.returnedBoxes;
      entry.totalAvailableBoxes += item.theoreticalQty;
      entry.totalAvailableUnits += item.theoreticalQty * item.units_per_box;
      entry.totalStockValue += item.stockValue;
      entry.items.push(item);
    }

    return Array.from(map.values()).sort((a, b) => a.gamme.localeCompare(b.gamme));
  }, [vendorStockItems]);

  // Filtered categories and items for display
  const filteredCategoryGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return categoriesSummary
      .filter((group) => selectedCategory === 'all' || group.gamme === selectedCategory)
      .map((group) => {
        const matchingItems = group.items.filter((it) => {
          if (!q) return true;
          return (
            it.name.toLowerCase().includes(q) ||
            it.code.toLowerCase().includes(q) ||
            it.gamme.toLowerCase().includes(q)
          );
        });
        return {
          ...group,
          items: matchingItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [categoriesSummary, selectedCategory, searchTerm]);

  // Global KPIs for vendor stock
  const globalTotals = useMemo(() => {
    return vendorStockItems.reduce(
      (acc, it) => {
        acc.availableBoxes += it.theoreticalQty;
        acc.availableUnits += it.theoreticalQty * it.units_per_box;
        acc.stockValue += it.stockValue;
        acc.chargedBoxes += it.chargedBoxes;
        acc.soldBoxes += it.soldBoxes;
        acc.returnedBoxes += it.returnedBoxes;
        return acc;
      },
      {
        availableBoxes: 0,
        availableUnits: 0,
        stockValue: 0,
        chargedBoxes: 0,
        soldBoxes: 0,
        returnedBoxes: 0,
      }
    );
  }, [vendorStockItems]);

  // Vendor's own stock requests (chargements)
  const myStockRequests = useMemo(() => {
    return chargements.filter((c) => c.vendor_id === currentUser?.id);
  }, [chargements, currentUser?.id]);

  const pendingRequestsCount = useMemo(() => {
    return myStockRequests.filter((c) => c.status === 'Demandée').length;
  }, [myStockRequests]);

  // Available products for the stock request builder (no duplicates, filtered by modal category if selected)
  const availableProductsForRequest = useMemo(() => {
    const alreadyChosenIds = new Set(validatedLines.map((l) => l.productId));
    return vendorStockItems.filter(
      (p) =>
        !alreadyChosenIds.has(p.productId) &&
        p.stock_depot > 0 &&
        (modalCategoryFilter === 'all' || p.gamme === modalCategoryFilter)
    );
  }, [vendorStockItems, validatedLines, modalCategoryFilter]);

  useEffect(() => {
    if (availableProductsForRequest.length > 0) {
      const exists = availableProductsForRequest.some((p) => p.productId === currentLineProductId);
      if (!currentLineProductId || !exists) {
        setCurrentLineProductId(availableProductsForRequest[0].productId);
        setCurrentLineQty(Math.min(10, availableProductsForRequest[0].stock_depot));
      }
    }
  }, [availableProductsForRequest, currentLineProductId]);

  // Open stock request modal (optionally pre-selecting a category or product)
  const handleOpenStockRequestModal = (options?: { category?: string; productId?: string }) => {
    setRequestError('');
    const cat = options?.category || 'all';
    setModalCategoryFilter(cat);
    setIsAddingLine(true);

    if (options?.productId) {
      const prod = vendorStockItems.find((p) => p.productId === options.productId);
      if (prod) {
        setCurrentLineProductId(prod.productId);
        setCurrentLineQty(Math.min(10, Math.max(1, prod.stock_depot)));
      }
    }
    setShowRequestModal(true);
  };

  const handleSelectProductInBuilder = (productId: string) => {
    setRequestError('');
    const prod = vendorStockItems.find((p) => p.productId === productId);
    if (!prod) return;
    setIsAddingLine(true);
    if (currentLineProductId !== prod.productId) {
      setCurrentLineProductId(prod.productId);
      setCurrentLineQty(Math.max(1, Math.min(10, prod.stock_depot)));
    }
  };

  const handleValidateProductChoice = () => {
    setRequestError('');
    const prod = vendorStockItems.find((p) => p.productId === currentLineProductId);
    if (!prod) {
      setRequestError('Veuillez sélectionner un produit à demander.');
      return;
    }
    if (validatedLines.some((l) => l.productId === prod.productId)) {
      setRequestError('Ce produit figure déjà dans votre demande de stock.');
      return;
    }
    if (currentLineQty <= 0) {
      setRequestError('La quantité demandée doit être supérieure à 0 carton.');
      return;
    }
    if (currentLineQty > prod.stock_depot) {
      setRequestError(
        `Quantité plafonnée au stock disponible au dépôt central (${prod.stock_depot} cartons).`
      );
      return;
    }

    setValidatedLines((prev) => [
      ...prev,
      {
        productId: prod.productId,
        code: prod.code,
        name: prod.name,
        gamme: prod.gamme,
        requestedBoxes: currentLineQty,
        unitPrice: prod.price_box,
        total: currentLineQty * prod.price_box,
      },
    ]);

    setIsAddingLine(false);
    setCurrentLineProductId('');
  };

  const handleStartNextProductLine = () => {
    setRequestError('');
    setModalCategoryFilter('all');
    const remaining = vendorStockItems.filter(
      (p) => !validatedLines.some((l) => l.productId === p.productId) && p.stock_depot > 0
    );
    if (remaining.length === 0) {
      setRequestError('Tous les produits du catalogue ont déjà été ajoutés à cette demande.');
      return;
    }
    setCurrentLineProductId(remaining[0].productId);
    setCurrentLineQty(Math.min(10, remaining[0].stock_depot));
    setIsAddingLine(true);
  };

  const handleRemoveValidatedLine = (idx: number) => {
    setValidatedLines((prev) => prev.filter((_, i) => i !== idx));
    setRequestError('');
  };

  const handleUpdateValidatedLineQty = (idx: number, rawQty: number) => {
    setValidatedLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const prod = vendorStockItems.find((p) => p.productId === line.productId);
        const maxDepot = prod ? prod.stock_depot : 9999;
        const cleanQty = Math.min(maxDepot, Math.max(1, Math.floor(Number(rawQty) || 1)));
        return {
          ...line,
          requestedBoxes: cleanQty,
          total: cleanQty * line.unitPrice,
        };
      })
    );
  };

  const handleSubmitStockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccessMsg('');

    if (validatedLines.length === 0) {
      setRequestError(
        'Veuillez sélectionner au moins un produit, saisir la quantité et cliquer sur "Valider" avant d\'envoyer votre demande de stock.'
      );
      return;
    }
    if (!desiredDate) {
      setRequestError('Veuillez préciser la date souhaitée pour votre chargement de stock.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const res = await fetch('/api/chargements/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          vendor_id: currentUser.id,
          desired_date: desiredDate,
          items: validatedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRequestError(data.error || 'Erreur lors de l\'envoi de la demande de stock.');
      } else {
        setShowRequestModal(false);
        setValidatedLines([]);
        setIsAddingLine(true);
        setRequestSuccessMsg(
          `Votre demande de stock ${data.chargement?.reference || ''} a été transmise avec succès au Magasinier (Statut : Demandée).`
        );
        onRefreshData();
        fetchVendorStock();
      }
    } catch {
      setRequestError('Erreur réseau lors de la soumission de la demande de stock.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleCancelStockRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/chargements/${id}/cancel`, {
        method: 'DELETE',
        headers: { 'x-user-role': currentUser.role },
      });
      if (res.ok) {
        onRefreshData();
        fetchVendorStock();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportVendorStockPdf = () => {
    const displayedItems = filteredCategoryGroups.flatMap((g) => g.items);
    const totalBoxes = displayedItems.reduce((sum, it) => sum + Number(it.theoreticalQty || 0), 0);
    const totalVal = displayedItems.reduce((sum, it) => sum + Number(it.stockValue || 0), 0);

    exportTableToPdf({
      title: `Mon Stock Camionnette par Categorie - ${currentUser?.name || ''} (${currentUser?.code || ''})`,
      subtitle: 'Etat detaille du stock disponible en depot-vente (Charge - Vendu - Retourne)',
      filename: `stock_vendeur_${currentUser?.code || 'baobab'}_${new Date().toISOString().split('T')[0]}.pdf`,
      roleLabel: `Vendeur : ${currentUser?.name || ''} (${currentUser?.code || ''})`,
      summaryCards: [
        { label: 'Produits affiches', value: `${displayedItems.length} produits` },
        { label: 'Total Charge', value: `${globalTotals.chargedBoxes} cartons` },
        { label: 'Total Vendu', value: `${globalTotals.soldBoxes} cartons` },
        { label: 'Stock Disponible', value: `${totalBoxes} ctn (${formatFcfaPdf(totalVal)})` },
      ],
      columns: [
        'Code Ref.',
        'Produit & Conditionnement',
        'Categorie (Gamme)',
        'Charge / Vendu / Ret.',
        'Stock Dispo (Cartons)',
        'Prix Carton',
        'Valeur Stock (FCFA)',
      ],
      rows: displayedItems.map((it) => [
        it.code,
        `${it.name} (${it.packaging})`,
        it.gamme,
        `${it.chargedBoxes} / ${it.soldBoxes} / ${it.returnedBoxes} ctn`,
        `${it.theoreticalQty} ctn (${it.theoreticalQty * it.units_per_box} u.)`,
        formatFcfaPdf(it.price_box),
        formatFcfaPdf(it.stockValue),
      ]),
    });
  };

  const handleExportVendorStockCsv = () => {
    const displayedItems = filteredCategoryGroups.flatMap((g) => g.items);
    exportTableToCsv({
      filename: `stock_vendeur_${currentUser?.code || 'baobab'}_${new Date().toISOString().split('T')[0]}.csv`,
      columns: [
        'Code SKU',
        'Designation Produit',
        'Conditionnement',
        'Categorie (Gamme)',
        'Cartons Charges',
        'Cartons Vendus',
        'Cartons Retournes',
        'Stock Disponible (Cartons)',
        'Stock Disponible (Unites)',
        'Prix Carton (FCFA)',
        'Valeur Stock (FCFA)',
      ],
      rows: displayedItems.map((it) => [
        it.code,
        it.name,
        it.packaging,
        it.gamme,
        it.chargedBoxes,
        it.soldBoxes,
        it.returnedBoxes,
        it.theoreticalQty,
        it.theoreticalQty * it.units_per_box,
        it.price_box,
        it.stockValue,
      ]),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header : Mon Stock par Catégorie + Bouton Mon chargement */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 min-w-0">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--marque-fonce)] text-white flex items-center justify-center shadow-sm shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-snug">
                Mon Stock par Catégorie
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-white shrink-0">
                Vendeur
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-snug">
              Stock camionnette par gamme et réapprovisionnement.
            </p>
            <InfoTooltip text="Consultez votre stock disponible en camionnette classé par catégorie (gamme) et effectuez vos demandes de réapprovisionnement." />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <button
            onClick={() => handleOpenStockRequestModal()}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] h-auto py-3 px-4 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer min-w-0"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Mon chargement</span>
          </button>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('nouvelle-vente')}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] h-auto py-3 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer min-w-0"
            >
              <ShoppingBag className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
              <span>Nouvelle vente</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Banner after submitting a stock request */}
      {requestSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold min-w-0 flex-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{requestSuccessMsg}</span>
          </div>
          <button
            onClick={() => setRequestSuccessMsg('')}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className="rounded-2xl p-5 text-white shadow-md relative h-auto"
          style={{ backgroundColor: '#008DA9' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/85">
              Stock Disponible Vendeur
            </span>
            <Boxes className="w-5 h-5 text-white/90 shrink-0" />
          </div>
          <p className="text-3xl font-black mt-2">
            {globalTotals.availableBoxes}{' '}
            <span className="text-base font-bold text-white/90">cartons</span>
          </p>
          <p className="text-xs text-white/85 mt-1 font-medium">
            Soit {globalTotals.availableUnits.toLocaleString('fr-FR')} unités prêtes à la vente
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs h-auto">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Valeur Totale de Mon Stock
            </span>
            <Sparkles className="w-5 h-5 text-teal-600 shrink-0" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            <span className="baobab-amount">
              {globalTotals.stockValue.toLocaleString('fr-FR')} FCFA
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Valorisation dépôt-vente dans la camionnette
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs h-auto">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Catégories (Gammes)
            </span>
            <Layers className="w-5 h-5 text-indigo-500 shrink-0" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {categoriesSummary.length}{' '}
            <span className="text-sm font-bold text-slate-500">catégories</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-snug">
            {categoriesSummary.map((c) => c.gamme).join(' • ')}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Flux Tournée &amp; Demandes
            </span>
            <Truck className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div>
              <span className="text-xs text-slate-400 block">Chargé</span>
              <span className="text-lg font-black text-slate-800 dark:text-slate-100">
                {globalTotals.chargedBoxes} ctn
              </span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <div>
              <span className="text-xs text-slate-400 block">Vendu</span>
              <span className="text-lg font-black text-emerald-600">
                {globalTotals.soldBoxes} ctn
              </span>
            </div>
            {pendingRequestsCount > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <div>
                  <span className="text-xs text-amber-500 font-bold block">En attente</span>
                  <span className="text-lg font-black text-amber-600">
                    {pendingRequestsCount} dem.
                  </span>
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Stock = Chargé ({globalTotals.chargedBoxes}) - Vendu ({globalTotals.soldBoxes}) - Rendu ({globalTotals.returnedBoxes})
          </p>
        </div>
      </div>

      {/* Category Filter Bar + Search — Grille de boutons en rangées et colonnes sans débordement */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-teal-600" />
            Filtrer par catégorie :
          </span>

          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un produit, code..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`w-full min-w-0 min-h-[48px] h-auto px-3 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
              selectedCategory === 'all'
                ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0 flex-1">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-normal [overflow-wrap:anywhere] leading-snug">Toutes les catégories</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {globalTotals.availableBoxes} ctn
            </span>
          </button>

          {categoriesSummary.map((cat) => {
            const isSelected = selectedCategory === cat.gamme;
            return (
              <button
                key={cat.gamme}
                onClick={() => setSelectedCategory(cat.gamme)}
                className={`w-full min-w-0 min-h-[48px] h-auto px-3 py-3 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer border text-left ${
                  isSelected
                    ? 'bg-[#008DA9] text-white border-[#008DA9] shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] leading-snug">{cat.gamme}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                  }`}
                >
                  {cat.totalAvailableBoxes} ctn
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STOCK DU VENDEUR GROUPÉ PAR CATÉGORIE */}
      <div className="space-y-6">
        {filteredCategoryGroups.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800">
            <Boxes className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Aucun produit trouvé dans cette catégorie.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchTerm('');
              }}
              className="mt-3 text-xs font-bold text-teal-600 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          filteredCategoryGroups.map((group) => (
            <div
              key={group.gamme}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs h-auto"
            >
              {/* Category Header Bar */}
              <div className="p-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0"
                    style={{ backgroundColor: '#008DA9' }}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                        Catégorie : {group.gamme}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300">
                        {group.items.length} {group.items.length > 1 ? 'produits' : 'produit'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Stock disponible dans cette catégorie :{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {group.totalAvailableBoxes} {group.totalAvailableBoxes > 1 ? 'cartons' : 'carton'}
                      </strong>{' '}
                      ({group.totalAvailableUnits.toLocaleString('fr-FR')} unités) &bull; Valeur :{' '}
                      <strong className="text-teal-600 dark:text-teal-400 baobab-amount">
                        {group.totalStockValue.toLocaleString('fr-FR')} FCFA
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => handleOpenStockRequestModal({ category: group.gamme })}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] h-auto px-3.5 py-3 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold text-xs transition cursor-pointer min-w-0"
                  >
                    <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Demander ({group.gamme})</span>
                  </button>
                </div>
              </div>

              <DataTable
                data={group.items}
                rowKey={(item) => item.productId}
                pageSize={20}
                emptyMessage="Aucun produit dans cette gamme."
                mobileTitle={(item) => (
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                      <span>{item.name}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {item.code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {item.packaging} ({item.units_per_box} u/ctn) &bull; Dépôt : {item.stock_depot} ctn
                    </div>
                  </div>
                )}
                mobileBadge={(item) => {
                  const isOut = item.theoreticalQty <= 0;
                  const isLow = item.theoreticalQty > 0 && item.theoreticalQty <= 5;
                  return (
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1 shrink-0 whitespace-nowrap ${
                        isOut
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                          : isLow
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                      }`}
                    >
                      {item.theoreticalQty} ctn
                    </span>
                  );
                }}
                mobileActions={(item) => (
                  <button
                    onClick={() =>
                      handleOpenStockRequestModal({
                        category: item.gamme,
                        productId: item.productId,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Demander</span>
                  </button>
                )}
                totalsFooter={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Total {group.gamme} :{' '}
                      {group.items.reduce((s, it) => s + Number(it.theoreticalQty || 0), 0)} cartons disponibles
                    </span>
                    <span className="whitespace-nowrap font-black text-[var(--marque-fonce)] dark:text-teal-300">
                      Valeur : {group.items.reduce((s, it) => s + Number(it.stockValue || 0), 0).toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                }
                columns={[
                  {
                    key: 'product',
                    header: 'Produit & Conditionnement',
                    hideOnMobileCard: true,
                    render: (item) => (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-teal-600 font-bold shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{item.name}</span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {item.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.packaging} ({item.units_per_box} u/ctn) &bull; Dépôt :{' '}
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {item.stock_depot} ctn
                            </span>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'movements',
                    header: 'Mouvements (Chg / Vnd / Ret)',
                    mobileLabel: 'Mouvements',
                    align: 'center',
                    render: (item) => (
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 text-[11px]">
                        <span className="font-semibold text-slate-600 dark:text-slate-300" title="Chargé">
                          Chg: <strong>{item.chargedBoxes}</strong>
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400" title="Vendu">
                          Vnd: <strong>{item.soldBoxes}</strong>
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400" title="Retourné">
                          Ret: <strong>{item.returnedBoxes}</strong>
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'available',
                    header: 'Mon Stock Disponible',
                    align: 'center',
                    isNumeric: true,
                    hideOnMobileCard: true,
                    render: (item) => {
                      const isOut = item.theoreticalQty <= 0;
                      const isLow = item.theoreticalQty > 0 && item.theoreticalQty <= 5;
                      return (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 whitespace-nowrap ${
                              isOut
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                                : isLow
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            }`}
                          >
                            {isOut ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : isLow ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {item.theoreticalQty} carton{item.theoreticalQty > 1 ? 's' : ''}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                            {item.theoreticalQty * item.units_per_box} unités
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'value',
                    header: 'Prix & Valeur Stock',
                    mobileLabel: 'Valeur stock',
                    align: 'right',
                    isNumeric: true,
                    render: (item) => (
                      <div className="whitespace-nowrap">
                        <div className="font-black text-slate-900 dark:text-white">
                          {item.stockValue.toLocaleString('fr-FR')} FCFA
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.price_box.toLocaleString('fr-FR')} FCFA / ctn
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: 'Action',
                    align: 'right',
                    hideOnMobileCard: true,
                    render: (item) => (
                      <button
                        onClick={() =>
                          handleOpenStockRequestModal({
                            category: item.gamme,
                            productId: item.productId,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Demander</span>
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          ))
        )}
      </div>

      {/* SECTION : MES DEMANDES DE STOCK RÉCENTES */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs h-auto">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
              <span>Suivi de Mes Demandes de Stock ({myStockRequests.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Retrouvez ici vos demandes de réapprovisionnement envoyées au Magasinier du dépôt central.
            </p>
          </div>
          <button
            onClick={() => handleOpenStockRequestModal()}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] h-auto px-4 py-3 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto min-w-0"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Mon chargement</span>
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {myStockRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aucune demande de stock enregistrée pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {myStockRequests.map((chg) => {
                const items =
                  typeof chg.items === 'string' ? JSON.parse(chg.items) : chg.items || [];
                const status = chg.status || 'Demandée';
                return (
                  <div
                    key={chg.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-xs sm:text-sm text-teal-700 dark:text-teal-400">
                          {chg.reference}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            status === 'Chargée' || status === 'valide'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : status === 'Validée'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              : status === 'Partiellement validée'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : status === 'Rejetée'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                          }`}
                        >
                          {status === 'valide' ? 'Chargée' : status}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Date souhaitée : {chg.desired_date || chg.date}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {items.map((it: any, idx: number) => {
                          const prod = catalogProducts.find((p) => p.id === it.productId);
                          const boxes =
                            it.validatedBoxes !== undefined
                              ? it.validatedBoxes
                              : it.requestedBoxes || it.qtyBoxes || 0;
                          return (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                            >
                              <strong className="text-teal-600 dark:text-teal-400">
                                {prod?.gamme ? `[${prod.gamme}] ` : ''}
                              </strong>
                              {it.name} : <strong>{boxes} ctn</strong>
                            </span>
                          );
                        })}
                      </div>

                      {chg.rejection_reason && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                          Motif du rejet : {chg.rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 block">Valeur estimée</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {Number(chg.total_amount || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>

                      {status === 'Demandée' && (
                        <ConfirmDestructiveButton
                          label="Annuler"
                          confirmLabel="Confirmer l'annulation ?"
                          onConfirm={() => handleCancelStockRequest(chg.id)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL : FAIRE UNE DEMANDE DE STOCK (PAR CATÉGORIE & MULTI-PRODUITS) */}
      {showRequestModal && (
        <FormModal
          title="Mon chargement"
          subtitle="Sélectionnez vos produits par catégorie, validez chaque ligne puis transmettez votre demande au Magasinier."
          icon={<Boxes className="w-5 h-5 text-teal-600" />}
          onClose={() => setShowRequestModal(false)}
          onSubmit={handleSubmitStockRequest}
          submitLabel={
            <>
              <Send className="w-4 h-4 shrink-0" />
              <span>
                {isSubmittingRequest
                  ? 'Envoi en cours...'
                  : 'Envoyer la demande'}
              </span>
            </>
          }
          submitDisabled={isSubmittingRequest || validatedLines.length === 0}
          isDirty={validatedLines.length > 0 || Boolean(currentLineProductId)}
        >
          <div className="space-y-4">
            {requestError && <FieldError message={requestError} />}

            {/* Desired Date & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Date souhaitée de chargement *
                </label>
                <input
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-[16px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Filtrer par catégorie (gamme)
                </label>
                <select
                  value={modalCategoryFilter}
                  onChange={(e) => setModalCategoryFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[16px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="all">Toutes les catégories ({categoriesSummary.length})</option>
                  {categoriesSummary.map((cat) => (
                    <option key={cat.gamme} value={cat.gamme}>
                      {cat.gamme}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-1.5">
                  {modalCategoryFilter === 'all'
                    ? `Mon stock : ${globalTotals.availableBoxes} ${
                        globalTotals.availableBoxes > 1 ? 'cartons disponibles' : 'carton disponible'
                      }`
                    : `Mon stock (${modalCategoryFilter}) : ${
                        categoriesSummary.find((c) => c.gamme === modalCategoryFilter)?.totalAvailableBoxes ?? 0
                      } ${
                        (categoriesSummary.find((c) => c.gamme === modalCategoryFilter)?.totalAvailableBoxes ?? 0) > 1
                          ? 'cartons disponibles'
                          : 'carton disponible'
                      }`}
                </p>
              </div>
            </div>

            {/* Validated lines list */}
            {validatedLines.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Produits validés dans votre demande ({validatedLines.length})
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl h-auto">
                  {validatedLines.map((line, idx) => {
                    const prod = vendorStockItems.find((p) => p.productId === line.productId);
                    const maxDepot = prod ? prod.stock_depot : 9999;
                    return (
                      <div
                        key={line.productId}
                        className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-bold text-[10px]">
                              {line.gamme}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {line.name}
                            </span>
                            <span className="font-mono text-slate-400">({line.code})</span>
                          </div>
                          <div className="text-slate-500 mt-1">
                            Quantité demandée :{' '}
                            <strong className="text-emerald-700 dark:text-emerald-400">
                              {line.requestedBoxes} {line.requestedBoxes > 1 ? 'cartons' : 'carton'}
                            </strong>{' '}
                            &times; {line.unitPrice.toLocaleString('fr-FR')} FCFA ={' '}
                            <strong className="text-slate-800 dark:text-slate-200 baobab-amount">
                              {line.total.toLocaleString('fr-FR')} FCFA
                            </strong>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateValidatedLineQty(idx, line.requestedBoxes - 1)}
                              className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={maxDepot}
                              value={line.requestedBoxes}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!Number.isNaN(val) && val >= 1) {
                                  handleUpdateValidatedLineQty(idx, val);
                                }
                              }}
                              aria-label={`Quantité cartons ${line.name}`}
                              className="w-20 min-w-[68px] h-8 px-1.5 rounded-lg border border-teal-600 bg-white dark:bg-slate-900 text-center font-mono font-black text-xs text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateValidatedLineQty(idx, line.requestedBoxes + 1)}
                              className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                            <span className="text-[11px] font-semibold text-slate-500">ctn</span>
                          </div>
                          <ConfirmDestructiveButton
                            label="Supprimer"
                            confirmLabel="Supprimer ?"
                            onConfirm={() => handleRemoveValidatedLine(idx)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Line Builder by Category */}
            {isAddingLine ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border-2 border-teal-500/40 space-y-4 h-auto">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between md:flex-wrap gap-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                    Sélectionner un produit
                  </p>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {availableProductsForRequest.length}{' '}
                    {availableProductsForRequest.length > 1
                      ? 'produits disponibles'
                      : 'produit disponible'}
                  </span>
                </div>

                {availableProductsForRequest.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Aucun autre produit disponible dans cette catégorie. Changez de catégorie ci-dessus.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 h-auto">
                    {availableProductsForRequest.map((p) => {
                      const isSelected = p.productId === currentLineProductId;
                      return (
                        <div
                          key={p.productId}
                          onClick={() => handleSelectProductInBuilder(p.productId)}
                          className={`text-left p-3 rounded-xl border transition flex flex-col justify-between gap-1.5 ${
                            isSelected
                              ? 'border-2 border-teal-600 bg-teal-50/90 dark:bg-teal-950/60 shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-teal-400 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300">
                              {p.gamme}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                isSelected
                                  ? 'bg-[var(--marque-fonce)] text-white'
                                  : 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] underline'
                              }`}
                            >
                              {isSelected ? 'Sélectionné' : 'Choisir'}
                            </span>
                          </div>

                          <p className="text-xs font-black text-slate-900 dark:text-white leading-tight break-words">
                            {p.name}
                          </p>

                          <div className="flex flex-col gap-0.5 text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-slate-600 dark:text-slate-300">
                              Mon stock :{' '}
                              <strong className="text-teal-700 dark:text-teal-400">
                                {p.theoreticalQty} ctn
                              </strong>
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              Dépôt : <strong>{p.stock_depot} ctn</strong>
                            </div>
                          </div>

                          {isSelected && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 pt-2.5 border-t border-teal-500/30 space-y-2.5"
                            >
                              <div>
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                  <label className="font-bold text-slate-700 dark:text-slate-200">
                                    Quantité (Max {p.stock_depot} ctn) :
                                  </label>
                                  <span className="font-black text-teal-700 dark:text-teal-300">
                                    {(Math.max(0, Number(currentLineQty) || 0) * p.price_box).toLocaleString('fr-FR')} FCFA
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
                                    inputMode="numeric"
                                    min={1}
                                    max={p.stock_depot}
                                    placeholder="Qté"
                                    value={currentLineQty === 0 ? '' : currentLineQty}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '') {
                                        setCurrentLineQty(0);
                                      } else {
                                        const val = parseInt(raw, 10);
                                        if (!Number.isNaN(val)) {
                                          setCurrentLineQty(Math.min(p.stock_depot, Math.max(0, val)));
                                        }
                                      }
                                    }}
                                    className="w-full min-w-[76px] h-10 px-2 text-base font-mono font-black text-center rounded-lg border-2 border-[var(--marque-fonce)] bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setCurrentLineQty((q) => Math.min(p.stock_depot, (Number(q) || 0) + 1))}
                                    className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center hover:bg-slate-100 active:scale-95 transition shrink-0 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={handleValidateProductChoice}
                                className="w-full h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] active:scale-[0.99] text-white font-black text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
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
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Ligne validée. Souhaitez-vous ajouter un autre produit ?
                </span>
                <button
                  type="button"
                  onClick={handleStartNextProductLine}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Ajouter un produit</span>
                </button>
              </div>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
};
