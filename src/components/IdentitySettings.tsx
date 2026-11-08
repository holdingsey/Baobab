import React, { useState, useRef } from 'react';
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ShieldAlert,
  Info,
  Sun,
  Moon,
  Building2,
  FileText,
  Palette
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { UserSession } from './LoginScreen';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { InfoTooltip } from './InfoTooltip';
import { ExtractionPermissionsMatrix } from './ExtractionsView';
import { DatabaseBackupSection } from './DatabaseBackupSection';

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

interface IdentitySettingsProps {
  currentRole: string;
  currentUser?: UserSession;
  logoUrl: string;
  onLogoUpdated: (newUrl: string) => void;
}

const BrandPaletteSection: React.FC = () => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Palette extraite du logo officiel (Source unique)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            Codes hexadécimaux extraits de <code>/logo.png</code> : Bleu-turquoise <strong>#008DA9</strong> et Noir / Bleu nuit <strong>#000000</strong> (surface sombre <strong>#0F172A</strong>).
          </p>
        </div>
      </div>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-[var(--marque-texte-sur-plein)] shrink-0 self-start sm:self-center">
        Contraste WCAG ≥ 4,5:1 vérifié
      </span>
    </div>

    {/* Pastilles des variables CSS de marque */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {BRAND_LOGO_PALETTE.map((item) => (
        <div
          key={item.variable}
          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col justify-between gap-2.5"
        >
          <div className="flex items-start gap-3">
            {/* Pastille de couleur */}
            <div
              className="w-12 h-12 rounded-xl border border-slate-300 dark:border-slate-600 shadow-xs shrink-0 flex items-center justify-center font-mono text-[11px] font-extrabold select-all"
              style={{ backgroundColor: item.swatchBg, color: item.swatchText }}
              title={`${item.variable} : ${item.hex}`}
            >
              Aa
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-extrabold text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] break-words">
                {item.variable}
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug mt-0.5 break-words">
                {item.name}
              </div>
              <div className="mt-1 inline-flex items-center gap-1.5 flex-wrap">
                <code className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {item.hex}
                </code>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {item.rgb}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 space-y-1 text-[11px]">
            <div className="text-slate-600 dark:text-slate-300 leading-snug">{item.usage}</div>
            <div className="font-semibold text-slate-700 dark:text-slate-200">{item.contrast}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Rappel des couleurs d'état inchangées */}
    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Couleurs d&apos;état sémantiques inchangées (la couleur de marque n&apos;est jamais utilisée pour un état)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {STATUS_PALETTE_UNCHANGED.map((st) => (
          <div
            key={st.hex + st.label}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center gap-2.5"
          >
            <span
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-mono text-[10px] font-bold border border-black/10"
              style={{ backgroundColor: st.hex, color: st.textHex }}
            >
              Aa
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight break-words">
                {st.label}
              </div>
              <div className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {st.hex} • Texte {st.textHex}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const IdentitySettings: React.FC<IdentitySettingsProps> = ({
  currentRole,
  currentUser,
  logoUrl,
  onLogoUpdated,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size client-side (2 Mo max)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setFeedback({
        type: 'error',
        message: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(2)} Mo). La taille maximale est de 2 Mo.`,
      });
      setSelectedFile(null);
      setPreviewDataUrl(null);
      return;
    }

    // Check MIME type client-side
    const validMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validMimes.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
      setFeedback({
        type: 'error',
        message: 'Format non supporté. Veuillez sélectionner un fichier PNG, JPEG, WebP ou SVG.',
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

  const handleUploadSubmit = async () => {
    if (!selectedFile || !previewDataUrl) return;

    setIsUploading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64Data: previewDataUrl,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du logo');
      }

      setFeedback({
        type: 'success',
        message: `Logo vérifié côté serveur et mis à jour avec succès (Format: ${data.format}, Taille: ${(data.sizeBytes / 1024).toFixed(1)} Ko).`,
      });
      onLogoUpdated(data.logoUrl);
      setSelectedFile(null);
      setPreviewDataUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de téléversement';
      setFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetDefault = async () => {
    if (!confirm('Voulez-vous restaurer le logo officiel Baobab Distribution ?')) return;

    setIsUploading(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/settings/logo/reset', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation');
      }
      setFeedback({
        type: 'success',
        message: 'Logo officiel Baobab Distribution restauré avec succès.',
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
      setIsUploading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <BrandPaletteSection />
        <NotificationSettingsPanel currentUser={effectiveUser} />

        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 p-6 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-600 dark:text-amber-400 mb-3" />
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">
            Identité de l&apos;entreprise : Modification réservée à l&apos;Administrateur
          </h2>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto">
            La modification du fichier logo officiel de Baobab Distribution nécessite le rôle <strong>Administrateur</strong>.
          </p>
          <div className="mt-4 text-xs text-amber-800 dark:text-amber-400">
            Rôle actuel : <span className="font-semibold">{currentRole}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header section */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Réglages &rsaquo; Identité de l&apos;entreprise
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Logo officiel, palette extraite et charte de l&apos;entreprise.
              </p>
              <InfoTooltip text="Gestion du logo officiel, de la palette de marque extraite du logo et des mentions légales de Baobab Distribution Mali." />
            </div>
          </div>
        </div>
      </div>

      {/* Réglages > Droits d'extraction (Administrateur seul) : tableau rôle par jeu avec cases à cocher, modifications journalisées */}
      <ExtractionPermissionsMatrix currentUser={effectiveUser as any} />

      {/* Réglages > Sauvegarde (Administrateur seul) : export SQLite complet compressé, sauvegarde quotidienne 14j dans BACKUP_PATH, confirmation par mot de passe, audit */}
      <DatabaseBackupSection currentUser={effectiveUser} />

      {/* Aperçu des pastilles de couleur extraites du logo officiel */}
      <BrandPaletteSection />

      {/* Réglages Notifications Système & Badge */}
      <NotificationSettingsPanel currentUser={effectiveUser} />

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-[#15803D] text-white border-[#15803D]'
              : 'bg-[#B91C1C] text-white border-[#B91C1C]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-white mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-white mt-0.5" />
          )}
          <div className="text-sm font-medium">{feedback.message}</div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Current Logo & Theme Previews */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Logo Actuel en Production
            </h2>
            <button
              onClick={handleResetDefault}
              disabled={isUploading}
              title="Restaurer le logo par défaut"
              className="text-xs font-medium text-slate-600 hover:text-[var(--marque-fonce)] dark:text-slate-400 dark:hover:text-[var(--marque-eclaircie)] flex items-center gap-1 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Restaurer logo d&apos;origine
            </button>
          </div>

          {/* Dual Preview: Light vs Dark Theme */}
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Aperçu du contraste (Thème Clair et Sombre)
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Light mode box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600 mb-3">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  Mode Clair
                </div>
                <div className="h-20 flex items-center justify-center">
                  <BaobabLogo logoUrl={logoUrl} size={64} />
                </div>
                <span className="text-[10px] text-slate-500 mt-2">Affichage standard</span>
              </div>

              {/* Dark mode box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1 text-[11px] font-medium text-slate-300 mb-3">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  Mode Sombre
                </div>
                <div className="h-20 flex items-center justify-center">
                  <BaobabLogo logoUrl={logoUrl} size={64} />
                </div>
                <span className="text-[10px] text-[#38CAE6] mt-2">Fond clair automatique</span>
              </div>
            </div>
          </div>

          {/* Logo Rules reminder */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Info className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Spécifications techniques de Baobab Distribution :
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500 dark:text-slate-400">
              <li>Rendu avec <code>object-fit: contain</code> (sans aucune déformation).</li>
              <li>Affiché à 64 px sur la page de connexion.</li>
              <li>Affiché à 32 px sur l&apos;en-tête (avec texte « Baobab » sur PC).</li>
              <li>En thème sombre, un fond protecteur clair maintient la visibilité du symbole noir.</li>
              <li>Le fichier du logo lui-même n&apos;est jamais modifié.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Upload / Replace Logo Form */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Remplacer le Logo (Vérification Serveur)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Téléversez un nouveau logo officiel. Le serveur Express vérifie l&apos;intégrité, le type MIME et les octets magiques.
            </p>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[var(--marque-fonce)] dark:hover:border-[var(--marque-eclaircie)] rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-950/30 flex flex-col items-center justify-center gap-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
            />

            {previewDataUrl ? (
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 bg-white rounded-xl shadow-xs border border-slate-200 dark:border-slate-700">
                  <img
                    src={previewDataUrl}
                    alt="Aperçu avant envoi"
                    className="h-20 w-20 object-contain"
                  />
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {selectedFile?.name} ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(1)} Ko)
                </div>
                <span className="text-[11px] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] font-semibold">
                  Cliquez pour changer de fichier
                </span>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-full bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Cliquez pour sélectionner une image
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    ou glissez-déposez le fichier ici
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                  PNG, JPEG, WebP ou SVG &bull; 2 Mo maximum
                </div>
              </>
            )}
          </div>

          {/* Upload Action Button */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Validation stricte côté serveur Express
            </span>
            <button
              onClick={handleUploadSubmit}
              disabled={!selectedFile || isUploading}
              className="inline-flex items-center gap-2 h-[48px] px-5 rounded-[12px] font-bold text-sm text-[var(--marque-texte-sur-plein)] bg-[var(--marque-fonce)] hover:bg-[#00586B] disabled:opacity-50 disabled:pointer-events-none transition shadow-sm cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Vérification en cours...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Appliquer le logo
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Company Legal Identity Info (Bamako, Mali) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
          Mentions Légales &amp; Coordonnées (Sur les Factures et Reçus)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400 uppercase font-semibold">Raison Sociale</div>
            <div className="text-slate-800 dark:text-slate-200 font-medium mt-1">Baobab Distribution SARL</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400 uppercase font-semibold">Siège &amp; Entrepôt</div>
            <div className="text-slate-800 dark:text-slate-200 font-medium mt-1">Zone Industrielle Sotuba, Bamako (Mali)</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400 uppercase font-semibold">Identifiants Fiscaux</div>
            <div className="text-slate-800 dark:text-slate-200 font-medium mt-1">NIF : 084129532M &bull; RCCM : BKO.2018.B.4129</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400 uppercase font-semibold">Devise &amp; Territoire</div>
            <div className="text-slate-800 dark:text-slate-200 font-medium mt-1">Franc CFA (FCFA / XOF) &bull; République du Mali</div>
          </div>
        </div>
      </div>
    </div>
  );
};
