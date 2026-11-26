import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Sun,
  Moon,
  Building2,
  Palette,
  Users,
  Lock,
  Bell,
  Database,
  FileSpreadsheet,
  Sliders,
  HardDriveDownload,
  ChevronRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  Edit3,
  Save,
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { UserSession } from './LoginScreen';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { InfoTooltip } from './InfoTooltip';
import { ExtractionPermissionsMatrix } from './ExtractionsView';
import { DatabaseBackupSection } from './DatabaseBackupSection';

interface SettingsUserItem {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  team?: string;
  active?: boolean;
}

interface SettingsProductItem {
  id: string;
  code?: string;
  name?: string;
  gamme?: string;
  price_box?: number;
  stock_depot?: number;
  threshold_depot?: number;
  units_per_box?: number;
}

export const BRAND_LOGO_PALETTE = [
  {
    variable: '--marque',
    name: 'Bleu-turquoise du logo (Dominante)',
    hex: '#008DA9',
    rgb: 'rgb(0, 141, 169)',
    swatchBg: '#008DA9',
    swatchText: '#FFFFFF',
    usage: 'Couleur source extraite du feuillage du logo officiel (/logo.png)',
    contrast: '3,88:1 sur blanc (utilisée pour graphiques, bordures et accents)',
  },
  {
    variable: '--marque-nuit',
    name: 'Noir / Bleu nuit du logo (Seconde dominante)',
    hex: '#000000',
    rgb: 'rgb(0, 0, 0) / #0F172A',
    swatchBg: '#000000',
    swatchText: '#FFFFFF',
    usage: 'Couleur extraite du tronc et de la courbe du logo officiel',
    contrast: '21:1 sur blanc • Surface sombre #0F172A (17,4:1)',
  },
  {
    variable: '--marque-fonce',
    name: 'Marque foncée (Boutons pleins & Texte clair)',
    hex: '#006B82',
    rgb: 'rgb(0, 107, 130)',
    swatchBg: '#006B82',
    swatchText: '#FFFFFF',
    usage: 'Boutons principaux pleins, pastille de rôle, onglets actifs et texte de marque en thème clair',
    contrast: '6,02:1 avec texte blanc #FFFFFF (≥ 4,5:1 WCAG AA)',
  },
  {
    variable: '--marque-clair',
    name: 'Marque claire (Fond discret 12 %)',
    hex: 'rgba(0, 141, 169, 0.12)',
    rgb: '#008DA9 à 12 % (#E0F1F5 sur blanc)',
    swatchBg: 'rgba(0, 141, 169, 0.12)',
    swatchText: '#006B82',
    usage: 'Fond discret de l’élément actif du menu, cartes sélectionnées et survols',
    contrast: '5,05:1 avec texte --marque-fonce #006B82',
  },
  {
    variable: '--marque-texte-sur-plein',
    name: 'Texte sur bouton plein',
    hex: '#FFFFFF',
    rgb: 'rgb(255, 255, 255)',
    swatchBg: '#006B82',
    swatchText: '#FFFFFF',
    usage: 'Texte et icônes affichés sur les boutons principaux et pastilles pleines (--marque-fonce)',
    contrast: '6,02:1 sur #006B82 (≥ 4,5:1 WCAG AA)',
  },
  {
    variable: '--marque-eclaircie',
    name: 'Marque éclaircie (Textes & Icônes en thème sombre)',
    hex: '#38CAE6',
    rgb: 'rgb(56, 202, 230)',
    swatchBg: '#0F172A',
    swatchText: '#38CAE6',
    usage: 'Textes, liens, anneaux de focus et icônes d’accent sur fond sombre (#0F172A / #1E293B)',
    contrast: '8,92:1 sur #0F172A et 7,04:1 sur #1E293B (≥ 4,5:1 WCAG AA)',
  },
] as const;

export const STATUS_PALETTE_UNCHANGED = [
  {
    label: 'Bulles de notification',
    hex: '#DC2626',
    textHex: '#FFFFFF',
    usage: 'Compteurs non lus (cloche, menu, actions)',
  },
  {
    label: 'Succès • Niveau normal • Payé • Chargée',
    hex: '#15803D',
    textHex: '#FFFFFF',
    usage: 'États validés, paiements soldés, stock normal',
  },
  {
    label: 'Attente & Stock bas',
    hex: '#92400E',
    textHex: '#FFFFFF',
    usage: 'En attente de validation, seuil de stock bas',
  },
  {
    label: 'Rejet & Rupture',
    hex: '#B91C1C',
    textHex: '#FFFFFF',
    usage: 'Rejets, ruptures de stock, erreurs et actions destructives',
  },
  {
    label: 'Neutre',
    hex: '#E2E8F0',
    textHex: '#0F172A',
    usage: 'Badges neutres, surstock, états archivés',
  },
] as const;

type SettingsSectionId =
  | 'societe'
  | 'utilisateurs'
  | 'securite_pin'
  | 'notifications'
  | 'donnees'
  | 'droits_extraction'
  | 'seuils_metier'
  | 'sauvegarde';

interface SettingsSectionMeta {
  id: SettingsSectionId;
  title: string;
  shortHelp: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: 'societe',
    title: 'Société',
    shortHelp: 'Nom, NIF, RCCM, coordonnées, devise et logo.',
    tooltip:
      'Modifiez librement la raison sociale, le NIF, le RCCM, l’adresse, le téléphone, l’e-mail, la devise et le logo officiel affichés sur toutes les factures A4 et tickets thermiques 80 mm.',
    icon: Building2,
  },
  {
    id: 'utilisateurs',
    title: 'Utilisateurs',
    shortHelp: 'Création, modification et suppression des comptes.',
    tooltip:
      'Modifiez le nom, le code, le rôle, le téléphone, l’e-mail, l’équipe ou le mot de passe de n’importe quel utilisateur, ou créez un nouveau compte.',
    icon: Users,
  },
  {
    id: 'securite_pin',
    title: 'Sécurité (PIN)',
    shortHelp: 'Code PIN à 4 chiffres, verrouillage et session.',
    tooltip:
      'Modifiez le code PIN à 4 chiffres d’un compte ainsi que le nombre maximal de tentatives et la durée de verrouillage.',
    icon: Lock,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    shortHelp: 'Alertes système, pastille d’icône et rappels.',
    tooltip:
      'Activez ou désactivez les notifications en temps réel et choisissez les catégories d’alertes souhaitées.',
    icon: Bell,
  },
  {
    id: 'donnees',
    title: 'Données (démo et vidage)',
    shortHelp: 'Synchronisation, restauration démo et vidage.',
    tooltip:
      'Actualisez les données, restaurez les paramètres de démonstration par défaut ou videz les opérations de test.',
    icon: Database,
  },
  {
    id: 'droits_extraction',
    title: "Droits d'extraction",
    shortHelp: 'Autorisations d’export CSV, Excel et PDF par rôle.',
    tooltip:
      'Cochez ou décochez librement les autorisations d’extraction par rôle et par jeu de données.',
    icon: FileSpreadsheet,
  },
  {
    id: 'seuils_metier',
    title: 'Seuils et paramètres métier',
    shortHelp: 'Seuils stock, alertes FEFO, TVA et prix catalogue.',
    tooltip:
      'Modifiez les seuils d’alerte FEFO, la TVA, les plafonds d’inventaire ainsi que les seuils de stock bas et prix carton de chaque produit.',
    icon: Sliders,
  },
  {
    id: 'sauvegarde',
    title: 'Sauvegarde',
    shortHelp: 'Export SQLite (.db.gz) et sauvegardes quotidiennes 14j.',
    tooltip:
      'Créez une sauvegarde immédiate ou téléchargez l’export complet compressé de la base SQLite (.db.gz).',
    icon: HardDriveDownload,
  },
];

const AVAILABLE_ROLES = [
  'Administrateur',
  'Directeur des opérations de vente',
  'Sales Admin',
  'Gestionnaire grossiste',
  'Gestionnaire de stock',
  'Facturation',
  'Vendeur',
] as const;

interface IdentitySettingsProps {
  currentRole: string;
  currentUser?: UserSession;
  logoUrl: string;
  onLogoUpdated: (newUrl: string) => void;
  users?: SettingsUserItem[];
  products?: SettingsProductItem[];
  onRefreshData?: () => void;
}

export const IdentitySettings: React.FC<IdentitySettingsProps> = ({
  currentRole,
  currentUser,
  logoUrl,
  onLogoUpdated,
  users = [],
  products = [],
  onRefreshData,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('societe');
  const [mobileSectionOpen, setMobileSectionOpen] = useState<boolean>(false);

  // 1. États de la section Société (modifiables et persistés dans SQLite)
  const [companyName, setCompanyName] = useState('Baobab Distribution SARL');
  const [slogan, setSlogan] = useState('Négoce et Distribution Agroalimentaire');
  const [nif, setNif] = useState('084129532M');
  const [rccm, setRccm] = useState('MA.BKO.2018.B.4129');
  const [address, setAddress] = useState('Zone Industrielle de Sotuba, Bamako - Mali');
  const [city, setCity] = useState('Bamako');
  const [country, setCountry] = useState('République du Mali');
  const [phone, setPhone] = useState('+223 20 22 45 88 / +223 76 12 34 56');
  const [email, setEmail] = useState('contact@baobab-distribution.ml');
  const [currency, setCurrency] = useState('FCFA (XOF)');
  const [timezone, setTimezone] = useState('Africa/Bamako');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isSavingSociete, setIsSavingSociete] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2. États de la section Utilisateurs (création, édition, suppression)
  const [editingUserId, setEditingUserId] = useState<string>('NEW');
  const [uName, setUName] = useState('');
  const [uCode, setUCode] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('+223 ');
  const [uRole, setURole] = useState<string>('Vendeur');
  const [uTeam, setUTeam] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [usersFeedback, setUsersFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 3. États de la section Sécurité (PIN à 4 chiffres)
  const [pinTargetUserId, setPinTargetUserId] = useState<string>(currentUser?.id || 'usr-adm');
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinDigits, setPinDigits] = useState('4');
  const [pinMaxAttempts, setPinMaxAttempts] = useState('5');
  const [pinLockoutMinutes, setPinLockoutMinutes] = useState('15');
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState('12');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 5. États de la section Données (démo et vidage)
  const [dataActionMode, setDataActionMode] = useState<'refresh' | 'reset_defaults' | 'clear_transactions'>('refresh');
  const [isRunningDataAction, setIsRunningDataAction] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 7. États de la section Seuils et paramètres métier
  const [fefoCriticalDays, setFefoCriticalDays] = useState('30');
  const [fefoWarningDays, setFefoWarningDays] = useState('90');
  const [defaultLowStockThreshold, setDefaultLowStockThreshold] = useState('25');
  const [tvaRate, setTvaRate] = useState('18');
  const [maxInventoryGapBoxes, setMaxInventoryGapBoxes] = useState('5');
  const [thermalWidthMm, setThermalWidthMm] = useState('80');
  const [editableProducts, setEditableProducts] = useState<SettingsProductItem[]>([]);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);
  const [thresholdsFeedback, setThresholdsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = currentRole === 'Administrateur';
  const effectiveUser: UserSession = currentUser || {
    id: isAdmin ? 'usr-adm' : 'usr-generic',
    code: 'BAO',
    name: currentRole,
    email: '',
    role: currentRole as UserSession['role'],
    phone: '',
    team: '',
  };

  // Charger les paramètres depuis la base de données (/api/settings)
  useEffect(() => {
    let mounted = true;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data?.settings) return;
        const s = data.settings as Record<string, string>;
        if (s.company_name) setCompanyName(s.company_name);
        if (s.slogan) setSlogan(s.slogan);
        if (s.nif) setNif(s.nif);
        if (s.rccm) setRccm(s.rccm);
        if (s.address) setAddress(s.address);
        if (s.city) setCity(s.city);
        if (s.country) setCountry(s.country);
        if (s.phone) setPhone(s.phone);
        if (s.email) setEmail(s.email);
        if (s.currency) setCurrency(s.currency);
        if (s.timezone) setTimezone(s.timezone);
        if (s.fefo_critical_days) setFefoCriticalDays(s.fefo_critical_days);
        if (s.fefo_warning_days) setFefoWarningDays(s.fefo_warning_days);
        if (s.low_stock_threshold) setDefaultLowStockThreshold(s.low_stock_threshold);
        if (s.tva_rate) setTvaRate(s.tva_rate);
        if (s.max_inventory_gap_boxes) setMaxInventoryGapBoxes(s.max_inventory_gap_boxes);
        if (s.thermal_width_mm) setThermalWidthMm(s.thermal_width_mm);
        setPinDigits('4');
        if (s.pin_max_attempts) setPinMaxAttempts(s.pin_max_attempts);
        if (s.pin_lockout_minutes) setPinLockoutMinutes(s.pin_lockout_minutes);
        if (s.session_timeout_hours) setSessionTimeoutHours(s.session_timeout_hours);
        try {
          localStorage.setItem('baobab_company_settings', JSON.stringify(s));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Synchroniser la liste des produits éditables dans Seuils & paramètres métier
  useEffect(() => {
    setEditableProducts(
      products.map((p) => ({
        id: p.id,
        code: p.code || '',
        name: p.name || '',
        gamme: p.gamme || '',
        price_box: Number(p.price_box ?? 10000),
        stock_depot: Number(p.stock_depot ?? 0),
        threshold_depot: Number(p.threshold_depot ?? 25),
        units_per_box: Number(p.units_per_box ?? 12),
      }))
    );
  }, [products]);

  // Sélectionner un utilisateur à modifier
  const handleSelectUserToEdit = (u: SettingsUserItem | 'NEW') => {
    setUsersFeedback(null);
    if (u === 'NEW') {
      setEditingUserId('NEW');
      setUName('');
      setUCode('');
      setUEmail('');
      setUPhone('+223 ');
      setURole('Vendeur');
      setUTeam('');
      setUPassword('');
      return;
    }
    setEditingUserId(u.id);
    setUName(u.name || '');
    setUCode(u.code || '');
    setUEmail(u.email || '');
    setUPhone(u.phone || '+223 ');
    setURole(u.role || 'Vendeur');
    setUTeam(u.role === 'Vendeur' ? '' : u.team || '');
    setUPassword('');
  };

  // Initialiser le premier utilisateur par défaut quand la liste arrive
  useEffect(() => {
    if (users.length > 0 && editingUserId === 'NEW' && !uName) {
      const first = users[0];
      if (first) {
        setEditingUserId(first.id);
        setUName(first.name || '');
        setUCode(first.code || '');
        setUEmail(first.email || '');
        setUPhone(first.phone || '+223 ');
        setURole(first.role || 'Administrateur');
        setUTeam(first.team || '');
      }
    }
  }, [users, editingUserId, uName]);

  const currentSectionMeta =
    SETTINGS_SECTIONS.find((s) => s.id === activeSection) || SETTINGS_SECTIONS[0];

  const handleSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    setMobileSectionOpen(true);
    setFeedback(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setFeedback({
        type: 'error',
        message: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(2)} Mo). Max 2 Mo.`,
      });
      setSelectedFile(null);
      setPreviewDataUrl(null);
      return;
    }

    const validMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validMimes.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
      setFeedback({
        type: 'error',
        message: 'Format non supporté (PNG, JPEG, WebP ou SVG requis).',
      });
      setSelectedFile(null);
      setPreviewDataUrl(null);
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Sauvegarder toutes les informations de la société + logo éventuel
  const handleSaveSociete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSociete(true);
    setFeedback(null);

    try {
      // 1. Sauvegarder les champs de la société (nom, NIF, RCCM, adresse, téléphone, email, devise...)
      const settingsPayload = {
        company_name: companyName.trim() || 'Baobab Distribution SARL',
        slogan: slogan.trim(),
        nif: nif.trim(),
        rccm: rccm.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
        currency: currency.trim(),
        timezone: timezone.trim(),
      };

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({ settings: settingsPayload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde des informations de la société');
      }

      if (data.settings) {
        try {
          localStorage.setItem('baobab_company_settings', JSON.stringify(data.settings));
        } catch {
          // ignore
        }
      }

      // 2. Si un nouveau fichier logo a été sélectionné, l'envoyer également
      if (selectedFile && previewDataUrl) {
        const logoRes = await fetch('/api/settings/logo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'Administrateur',
          },
          body: JSON.stringify({
            base64Data: previewDataUrl,
            filename: selectedFile.name,
            mimeType: selectedFile.type,
          }),
        });
        const logoData = await logoRes.json();
        if (!logoRes.ok || !logoData.success) {
          throw new Error(logoData.error || 'Erreur lors du téléversement du logo');
        }
        onLogoUpdated(logoData.logoUrl);
        setSelectedFile(null);
        setPreviewDataUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      onRefreshData?.();
      setFeedback({
        type: 'success',
        message: `Société « ${settingsPayload.company_name} » (NIF : ${settingsPayload.nif} • RCCM : ${settingsPayload.rccm}) enregistrée avec succès.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsSavingSociete(false);
    }
  };

  const handleResetDefaultLogo = async () => {
    setIsSavingSociete(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/settings/logo/reset', {
        method: 'POST',
        headers: { 'x-user-role': 'Administrateur' },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation');
      }
      setFeedback({
        type: 'success',
        message: 'Logo officiel Baobab Distribution restauré.',
      });
      onLogoUpdated(data.logoUrl);
      setSelectedFile(null);
      setPreviewDataUrl(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsSavingSociete(false);
    }
  };

  // Sauvegarder ou créer un utilisateur
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsersFeedback(null);
    if (!uName.trim()) {
      setUsersFeedback({ type: 'error', message: 'Le nom de l’utilisateur est obligatoire.' });
      return;
    }
    if (uPassword.trim() && !/^\d{4}$/.test(uPassword.trim())) {
      setUsersFeedback({
        type: 'error',
        message: 'Le code PIN doit être composé d’exactement 4 chiffres (ex : 1234).',
      });
      return;
    }

    setIsSavingUser(true);
    try {
      if (editingUserId === 'NEW') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'Administrateur',
          },
          body: JSON.stringify({
            name: uName.trim(),
            email: uEmail.trim() || `${uName.trim().toLowerCase().replace(/\s+/g, '.')}@baobab.ml`,
            phone: uPhone.trim(),
            role: uRole,
            team: uTeam.trim(),
            password: uPassword.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erreur lors de la création du compte');
        }
        setUsersFeedback({ type: 'success', message: data.message || 'Nouvel utilisateur créé.' });
        if (data.user) {
          setEditingUserId(data.user.id);
          setUCode(data.user.code || '');
        }
        setUPassword('');
        onRefreshData?.();
      } else {
        const res = await fetch(`/api/users/${encodeURIComponent(editingUserId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'Administrateur',
          },
          body: JSON.stringify({
            name: uName.trim(),
            code: uCode.trim(),
            email: uEmail.trim(),
            phone: uPhone.trim(),
            role: uRole,
            team: uTeam.trim(),
            password: uPassword.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erreur lors de la modification');
        }
        setUsersFeedback({ type: 'success', message: data.message || 'Utilisateur modifié avec succès.' });
        setUPassword('');
        onRefreshData?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setUsersFeedback({ type: 'error', message: msg });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setUsersFeedback(null);
    setIsSavingUser(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { 'x-user-role': 'Administrateur' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossible de supprimer ce compte');
      }
      setUsersFeedback({ type: 'success', message: data.message || 'Compte supprimé.' });
      handleSelectUserToEdit('NEW');
      onRefreshData?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setUsersFeedback({ type: 'error', message: msg });
    } finally {
      setIsSavingUser(false);
    }
  };

  // Sauvegarder la sécurité PIN et le code PIN utilisateur (strictement 4 chiffres)
  const handlePinSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback(null);

    if (pinCurrent && !/^\d{4}$/.test(pinCurrent)) {
      setPinFeedback({
        type: 'error',
        message: 'Le code PIN actuel doit comporter exactement 4 chiffres.',
      });
      return;
    }

    if (pinNew) {
      if (!/^\d{4}$/.test(pinNew)) {
        setPinFeedback({
          type: 'error',
          message: 'Le nouveau code PIN doit comporter exactement 4 chiffres (ex : 1234).',
        });
        return;
      }
      if (pinNew !== pinConfirm) {
        setPinFeedback({
          type: 'error',
          message: 'La confirmation du nouveau code PIN à 4 chiffres ne correspond pas.',
        });
        return;
      }
    }

    setIsSavingPin(true);
    try {
      // 1. Sauvegarder les règles de sécurité dans settings (PIN fixé à 4 chiffres)
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            pin_digits: '4',
            pin_max_attempts: pinMaxAttempts,
            pin_lockout_minutes: pinLockoutMinutes,
            session_timeout_hours: sessionTimeoutHours,
          },
        }),
      });

      // 2. Si un nouveau PIN à 4 chiffres a été saisi, mettre à jour le compte sélectionné
      if (pinNew) {
        const targetId = pinTargetUserId || effectiveUser.id;
        const pwdRes = await fetch(`/api/users/${encodeURIComponent(targetId)}/change-password`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: pinNew }),
        });
        const pwdData = await pwdRes.json();
        if (!pwdRes.ok || !pwdData.success) {
          throw new Error(pwdData.error || 'Erreur lors de la mise à jour du PIN');
        }
      }

      setPinDigits('4');
      setPinCurrent('');
      setPinNew('');
      setPinConfirm('');
      setPinFeedback({
        type: 'success',
        message: pinNew
          ? 'Code PIN à 4 chiffres mis à jour et règles de sécurité enregistrées.'
          : `Règles de sécurité enregistrées (PIN à 4 chiffres, ${pinMaxAttempts} essais max, blocage ${pinLockoutMinutes} min).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setPinFeedback({ type: 'error', message: msg });
    } finally {
      setIsSavingPin(false);
    }
  };

  // Exécuter l'action de la section Données (démo et vidage)
  const handleRunDataAction = async () => {
    setDataFeedback(null);
    setIsRunningDataAction(true);
    try {
      const res = await fetch('/api/settings/data/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: dataActionMode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l’opération sur les données');
      }
      onRefreshData?.();
      setDataFeedback({
        type: 'success',
        message: data.message || 'Opération effectuée avec succès.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setDataFeedback({ type: 'error', message: msg });
    } finally {
      setIsRunningDataAction(false);
    }
  };

  // Sauvegarder les seuils métier globaux + seuils et prix de chaque produit
  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setThresholdsFeedback(null);
    setIsSavingThresholds(true);
    try {
      const res = await fetch('/api/settings/thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            fefo_critical_days: fefoCriticalDays,
            fefo_warning_days: fefoWarningDays,
            low_stock_threshold: defaultLowStockThreshold,
            tva_rate: tvaRate,
            max_inventory_gap_boxes: maxInventoryGapBoxes,
            thermal_width_mm: thermalWidthMm,
          },
          products: editableProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde des seuils');
      }
      onRefreshData?.();
      setThresholdsFeedback({
        type: 'success',
        message: `Seuils métier et paramètres catalogue enregistrés (FEFO ${fefoCriticalDays}j/${fefoWarningDays}j, Stock bas ${defaultLowStockThreshold} cartons, TVA ${tvaRate} %).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setThresholdsFeedback({ type: 'error', message: msg });
    } finally {
      setIsSavingThresholds(false);
    }
  };

  const renderSectionContent = (sectionId: SettingsSectionId) => {
    switch (sectionId) {
      case 'societe':
        return (
          <form onSubmit={handleSaveSociete} className="space-y-5">
            {feedback && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-sm font-medium ${
                  feedback.type === 'success'
                    ? 'bg-[#15803D] text-white border-[#15803D]'
                    : 'bg-[#B91C1C] text-white border-[#B91C1C]'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Formulaire complet de modification de la société (Nom, NIF, RCCM, Adresse, Téléphone, Email, Devise...) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Nom de la société / Raison sociale
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Baobab Distribution SARL"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Activité / Slogan
                </label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Ex: Négoce et Distribution Agroalimentaire"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  NIF (Numéro d&apos;Identification Fiscale)
                </label>
                <input
                  type="text"
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder="Ex: 084129532M"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  RCCM (Registre du Commerce)
                </label>
                <input
                  type="text"
                  value={rccm}
                  onChange={(e) => setRccm(e.target.value)}
                  placeholder="Ex: MA.BKO.2018.B.4129"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Adresse du siège &amp; entrepôt
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Zone Industrielle de Sotuba, Bamako - Mali"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Téléphone(s)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: +223 20 22 45 88 / +223 76 12 34 56"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ex: contact@baobab-distribution.ml"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Ville &amp; Pays
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ville"
                    className="w-full h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Pays"
                    className="w-full h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Devise officielle
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="Ex: FCFA (XOF)"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
            </div>

            {/* Aperçu du logo Clair / Sombre et téléversement */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-[#15803D]" />
                    Logo actif (Clair &amp; Sombre)
                  </span>
                  <button
                    type="button"
                    onClick={handleResetDefaultLogo}
                    disabled={isSavingSociete}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Logo par défaut
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col items-center justify-center">
                    <span className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                      <Sun className="w-3 h-3 text-amber-500" /> Clair
                    </span>
                    <BaobabLogo logoUrl={previewDataUrl || logoUrl} size={48} />
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-col items-center justify-center">
                    <span className="text-[11px] font-medium text-slate-300 mb-1.5 flex items-center gap-1">
                      <Moon className="w-3 h-3 text-indigo-400" /> Sombre
                    </span>
                    <BaobabLogo logoUrl={previewDataUrl || logoUrl} size={48} />
                  </div>
                </div>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#15803D] rounded-xl p-4 text-center cursor-pointer transition bg-slate-50/40 dark:bg-slate-950/30 flex flex-col items-center justify-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {previewDataUrl ? (
                  <>
                    <img
                      src={previewDataUrl}
                      alt="Aperçu nouveau logo"
                      className="h-14 w-14 object-contain bg-white rounded-lg p-1 border border-slate-200"
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 break-all">
                      {selectedFile?.name}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-[#15803D]" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Changer le fichier logo
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      PNG, JPEG, WebP, SVG (max 2 Mo)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Palette compacte */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Palette className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
                <span>Palette officielle &amp; états sémantiques</span>
                <InfoTooltip text="Couleurs extraites du logo officiel (/logo.png) avec contraste WCAG AA >= 4,5:1 vérifié." />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {BRAND_LOGO_PALETTE.map((item) => (
                  <div
                    key={item.variable}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-2.5 min-w-0"
                  >
                    <span
                      className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center font-mono text-[10px] font-bold border border-black/10"
                      style={{ backgroundColor: item.swatchBg, color: item.swatchText }}
                    >
                      Aa
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] font-bold text-slate-900 dark:text-white leading-snug">
                        {item.hex}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {item.variable}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bouton principal vert en bas de la section */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="submit"
                disabled={isSavingSociete}
                className="inline-flex items-center justify-center gap-2 min-h-[48px] h-auto py-3 px-5 rounded-xl font-bold text-sm bg-[#15803D] hover:bg-[#166534] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingSociete ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Enregistrer les informations de la société</span>
                  </>
                )}
              </button>
            </div>
          </form>
        );

      case 'utilisateurs':
        return (
          <form onSubmit={handleSaveUser} className="space-y-4">
            {usersFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  usersFeedback.type === 'success'
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#B91C1C] text-white'
                }`}
              >
                {usersFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{usersFeedback.message}</span>
              </div>
            )}

            {/* Sélecteur de compte à modifier ou bouton Nouveau compte */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                {users.map((u) => {
                  const selected = editingUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUserToEdit(u)}
                      className={`h-[40px] px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                        selected
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#15803D]'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>{u.name}</span>
                      <span className="font-mono opacity-80">({u.code})</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handleSelectUserToEdit('NEW')}
                className={`h-[40px] px-3.5 rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5 border ${
                  editingUserId === 'NEW'
                    ? 'bg-[#15803D] text-white border-[#15803D]'
                    : 'bg-white dark:bg-slate-900 text-[#15803D] dark:text-emerald-400 border-[#15803D]'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau compte</span>
              </button>
            </div>

            {/* Formulaire d'édition / création d'utilisateur */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  placeholder="Ex: Amadou Touré"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Code matricule
                </label>
                <input
                  type="text"
                  value={uCode}
                  onChange={(e) => setUCode(e.target.value)}
                  placeholder={editingUserId === 'NEW' ? 'Généré automatiquement (ou saisir)' : 'Ex: BAO-ADM'}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Rôle dans l&apos;application
                </label>
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Téléphone
                </label>
                <input
                  type="text"
                  value={uPhone}
                  onChange={(e) => setUPhone(e.target.value)}
                  placeholder="Ex: +223 76 01 23 45"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  placeholder="Ex: utilisateur@baobab.ml"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              {uRole !== 'Vendeur' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Service / Département
                  </label>
                  <input
                    type="text"
                    value={uTeam}
                    onChange={(e) => setUTeam(e.target.value)}
                    placeholder="Ex: Direction Générale / Dépôt Central"
                    className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {editingUserId === 'NEW'
                    ? 'Code PIN initial à 4 chiffres (optionnel)'
                    : 'Nouveau code PIN à 4 chiffres (laisser vide pour conserver l’actuel)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••• (4 chiffres)"
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              {editingUserId !== 'NEW' && uRole !== 'Administrateur' ? (
                <button
                  type="button"
                  onClick={() => handleDeleteUser(editingUserId)}
                  disabled={isSavingUser}
                  className="inline-flex items-center justify-center gap-2 h-[48px] px-4 rounded-xl font-bold text-sm bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-[#B91C1C] dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Supprimer ce compte</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={isSavingUser}
                className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-xl font-bold text-sm bg-[#15803D] hover:bg-[#166534] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingUser ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>
                      {editingUserId === 'NEW'
                        ? 'Créer le nouvel utilisateur'
                        : 'Enregistrer les modifications utilisateur'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        );

      case 'securite_pin':
        return (
          <form onSubmit={handlePinSave} className="space-y-4">
            {pinFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  pinFeedback.type === 'success'
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#B91C1C] text-white'
                }`}
              >
                {pinFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{pinFeedback.message}</span>
              </div>
            )}

            {/* Paramètres globaux de sécurité PIN (4 chiffres) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Format du code PIN
                </label>
                <input
                  type="text"
                  value={`${pinDigits} chiffres`}
                  readOnly
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-[16px] font-mono font-bold text-[#15803D] dark:text-emerald-400 focus:outline-none transition-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Essais max avant blocage
                </label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={pinMaxAttempts}
                  onChange={(e) => setPinMaxAttempts(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Verrouillage (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={pinLockoutMinutes}
                  onChange={(e) => setPinLockoutMinutes(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expiration session (heures)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={sessionTimeoutHours}
                  onChange={(e) => setSessionTimeoutHours(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
            </div>

            {/* Modification du code PIN à 4 chiffres d'un compte */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Compte utilisateur concerné
                </label>
                <select
                  value={pinTargetUserId}
                  onChange={(e) => setPinTargetUserId(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code} — {u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIN actuel (4 chiffres)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nouveau PIN (4 chiffres)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Confirmer le PIN (4 chiffres)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none transition-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={isSavingPin}
                className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-xl font-bold text-sm bg-[#15803D] hover:bg-[#166534] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>
                  {isSavingPin ? 'Enregistrement...' : 'Enregistrer la sécurité et le code PIN'}
                </span>
              </button>
            </div>
          </form>
        );

      case 'notifications':
        return <NotificationSettingsPanel currentUser={effectiveUser} hideHeader />;

      case 'donnees':
        return (
          <div className="space-y-4">
            {dataFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  dataFeedback.type === 'success'
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#B91C1C] text-white'
                }`}
              >
                {dataFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{dataFeedback.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-slate-500 dark:text-slate-400">Moteur de données</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  SQLite local persistant
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-slate-500 dark:text-slate-400">Références catalogue</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {products.length || 9} produits actifs
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-slate-500 dark:text-slate-400">Comptes utilisateurs</div>
                <div className="text-sm font-bold text-[#15803D] dark:text-emerald-400 mt-0.5">
                  {users.length} comptes enregistrés
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Opération à exécuter sur la base de données
              </label>
              <select
                value={dataActionMode}
                onChange={(e) => setDataActionMode(e.target.value as any)}
                className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
              >
                <option value="refresh">
                  Synchroniser et rafraîchir toutes les données locales
                </option>
                <option value="reset_defaults">
                  Restaurer les paramètres société et seuils de démonstration par défaut
                </option>
                <option value="clear_transactions">
                  Vider toutes les opérations de test (ventes, versements, chargements, réceptions)
                </option>
              </select>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleRunDataAction}
                disabled={isRunningDataAction}
                className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-xl font-bold text-sm bg-[#15803D] hover:bg-[#166534] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRunningDataAction ? 'animate-spin' : ''}`} />
                <span>
                  {isRunningDataAction ? 'Exécution...' : 'Appliquer l’action sur les données'}
                </span>
              </button>
            </div>
          </div>
        );

      case 'droits_extraction':
        return <ExtractionPermissionsMatrix currentUser={effectiveUser as any} hideHeader />;

      case 'seuils_metier':
        return (
          <form onSubmit={handleSaveThresholds} className="space-y-4">
            {thresholdsFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  thresholdsFeedback.type === 'success'
                    ? 'bg-[#15803D] text-white'
                    : 'bg-[#B91C1C] text-white'
                }`}
              >
                {thresholdsFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{thresholdsFeedback.message}</span>
              </div>
            )}

            {/* Paramètres métier globaux */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Seuil critique FEFO (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={fefoCriticalDays}
                  onChange={(e) => setFefoCriticalDays(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Surveillance FEFO (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={fefoWarningDays}
                  onChange={(e) => setFefoWarningDays(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Seuil stock bas par défaut (cartons)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={defaultLowStockThreshold}
                  onChange={(e) => setDefaultLowStockThreshold(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Taux de TVA standard (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={tvaRate}
                  onChange={(e) => setTvaRate(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Plafond écart inventaire (cartons)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={maxInventoryGapBoxes}
                  onChange={(e) => setMaxInventoryGapBoxes(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Largeur ticket thermique (mm)
                </label>
                <input
                  type="number"
                  min={58}
                  max={110}
                  value={thermalWidthMm}
                  onChange={(e) => setThermalWidthMm(e.target.value)}
                  className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                />
              </div>
            </div>

            {/* Modification directe des seuils de stock dépôt et prix carton par produit */}
            {editableProducts.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>Seuils d&apos;alerte stock et prix carton par produit</span>
                  <InfoTooltip text="Modifiez directement le seuil d'alerte dépôt (en cartons) et le prix par carton (FCFA) de chaque référence du catalogue." />
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {editableProducts.map((prd, idx) => (
                    <div
                      key={prd.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {prd.code}
                        </div>
                        <input
                          type="text"
                          value={prd.name || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableProducts((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                            );
                          }}
                          className="w-full h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-bold text-slate-900 dark:text-white mt-0.5 focus:outline-none transition-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                          Seuil stock bas (cartons)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={prd.threshold_depot ?? 25}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditableProducts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, threshold_depot: val } : item
                              )
                            );
                          }}
                          className="w-full h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                          Prix carton (FCFA)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={prd.price_box ?? 10000}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditableProducts((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, price_box: val } : item))
                            );
                          }}
                          className="w-full h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[16px] font-mono font-bold text-slate-900 dark:text-white focus:outline-none transition-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={isSavingThresholds}
                className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-xl font-bold text-sm bg-[#15803D] hover:bg-[#166534] text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isSavingThresholds
                    ? 'Enregistrement...'
                    : 'Enregistrer les seuils et paramètres métier'}
                </span>
              </button>
            </div>
          </form>
        );

      case 'sauvegarde':
        return <DatabaseBackupSection currentUser={effectiveUser} hideHeader />;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* En-tête épuré de la page Réglages */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Réglages
            </h1>
            <InfoTooltip text="Configuration complète de l'application : Société (nom, NIF, RCCM, coordonnées, logo), Utilisateurs, Sécurité (PIN), Notifications, Données, Droits d'extraction, Seuils métier et Sauvegarde." />
          </div>
          <p className="text-[14px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">
            {companyName} • NIF : {nif} • RCCM : {rccm}
          </p>
        </div>
      </div>

      {/* VUE MOBILE & TABLETTE (< 1024px) : Liste de cartes OU une section par écran avec retour */}
      <div className="lg:hidden">
        {!mobileSectionOpen ? (
          <div className="space-y-3" data-testid="settings-mobile-section-list">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.id}
                  onClick={() => handleSelectSection(section.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectSection(section.id);
                    }
                  }}
                  className="w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#15803D] dark:hover:border-emerald-500 p-4 shadow-xs transition flex items-center justify-between gap-3 cursor-pointer h-auto"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                          {section.title}
                        </h2>
                        <span onClick={(e) => e.stopPropagation()}>
                          <InfoTooltip text={section.tooltip} />
                        </span>
                      </div>
                      <p className="text-[14px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">
                        {section.shortHelp}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4" data-testid="settings-mobile-section-detail">
            {/* Bouton Retour (une section par écran avec retour) */}
            <button
              type="button"
              onClick={() => setMobileSectionOpen(false)}
              className="inline-flex items-center gap-2 min-h-[48px] h-auto py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Retour aux réglages</span>
            </button>

            {/* Carte de la section active */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-5 h-auto">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                    {currentSectionMeta.title}
                  </h2>
                  <InfoTooltip text={currentSectionMeta.tooltip} />
                </div>
                <p className="text-[14px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">
                  {currentSectionMeta.shortHelp}
                </p>
              </div>

              {renderSectionContent(activeSection)}
            </div>
          </div>
        )}
      </div>

      {/* VUE PC (>= 1024px) : Liste à gauche et contenu de la seule section ouverte à droite */}
      <div className="hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        {/* Colonne gauche : liste des 8 sections en cartes */}
        <div className="space-y-2.5" role="tablist" aria-label="Sections des réglages">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isSelected = activeSection === section.id;
            return (
              <div
                key={section.id}
                role="tab"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveSection(section.id);
                  }
                }}
                className={`w-full text-left rounded-2xl border p-3.5 transition flex items-center justify-between gap-3 cursor-pointer h-auto ${
                  isSelected
                    ? 'border-[#15803D] bg-[#15803D]/8 dark:bg-[#15803D]/15 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      isSelected
                        ? 'bg-[#15803D] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                        {section.title}
                      </h2>
                      <span onClick={(e) => e.stopPropagation()}>
                        <InfoTooltip text={section.tooltip} />
                      </span>
                    </div>
                    <p className="text-[14px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">
                      {section.shortHelp}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isSelected ? 'text-[#15803D] translate-x-0.5' : 'text-slate-400'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Colonne droite : contenu de la seule section ouverte */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5 min-w-0 h-auto">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                {currentSectionMeta.title}
              </h2>
              <InfoTooltip text={currentSectionMeta.tooltip} />
            </div>
            <p className="text-[14px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5">
              {currentSectionMeta.shortHelp}
            </p>
          </div>

          {renderSectionContent(activeSection)}
        </div>
      </div>
    </div>
  );
};
