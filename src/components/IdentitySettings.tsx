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
  FileText
} from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { UserSession } from './LoginScreen';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

interface IdentitySettingsProps {
  currentRole: string;
  currentUser?: UserSession;
  logoUrl: string;
  onLogoUpdated: (newUrl: string) => void;
}

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
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <NotificationSettingsPanel currentUser={effectiveUser} />

        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 p-6 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-600 dark:text-amber-400 mb-3" />
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">
            Identité de l'entreprise : Accès restreint à l'Administrateur
          </h2>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto">
            La modification de l'identité visuelle et du logo officiel de Baobab Distribution nécessite le rôle <strong>Administrateur</strong>.
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
      {/* Réglages Notifications Système & Badge */}
      <NotificationSettingsPanel currentUser={effectiveUser} />

      {/* Header section */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Réglages &rsaquo; Identité de l'entreprise
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Gestion du logo officiel, des mentions légales et de la charte graphique de Baobab Distribution Mali.
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
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
              <FileCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Logo Actuel en Production
            </h2>
            <button
              onClick={handleResetDefault}
              disabled={isUploading}
              title="Restaurer le logo par défaut"
              className="text-xs font-medium text-slate-600 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-300 flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurer logo d'origine
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
                  {/* Notice the dark:bg-white/95 light background behind the logo ensuring 100% visibility */}
                  <BaobabLogo logoUrl={logoUrl} size={64} />
                </div>
                <span className="text-[10px] text-teal-400 mt-2">Fond clair automatique</span>
              </div>
            </div>
          </div>

          {/* Logo Rules reminder */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Info className="w-4 h-4 text-teal-600" />
              Spécifications techniques de Baobab Distribution :
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500 dark:text-slate-400">
              <li>Rendu avec <code>object-fit: contain</code> (sans aucune déformation).</li>
              <li>Affiché à 64 px sur la page de connexion.</li>
              <li>Affiché à 32 px sur l'en-tête (avec texte « Baobab » sur PC).</li>
              <li>En thème sombre, un fond protecteur clair maintient la visibilité du symbole noir.</li>
              <li>Si absent, l'application bascule automatiquement sur le texte de secours « Baobab ».</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Upload / Replace Logo Form */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Remplacer le Logo (Vérification Serveur)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Téléversez un nouveau logo officiel. Le serveur Express vérifie l'intégrité, le type MIME et les octets magiques.
            </p>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-950/30 flex flex-col items-center justify-center gap-3"
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
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                  Cliquez pour changer de fichier
                </span>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400">
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
                <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none transition shadow-sm"
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
          <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
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
