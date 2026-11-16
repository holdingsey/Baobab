import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Download,
  Lock,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileArchive,
  KeyRound,
  History,
} from 'lucide-react';
import { UserSession } from './LoginScreen';
import { ensureUserAuthToken } from '../utils/pushNotifications';
import { DataTable, DataTableColumn } from './DataTable';
import { CardList } from './CardList';
import { FormModal } from './FormModal';
import { InfoTooltip } from './InfoTooltip';

interface BackupFileEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  type: 'quotidienne' | 'manuelle';
  sha256: string;
}

interface BackupAuditEntry {
  id: number;
  timestamp: string;
  user_name: string;
  action: string;
  entity: string;
  details: string;
}

interface BackupListResponse {
  backupPath: string;
  retentionDays: number;
  passwordsHashed: boolean;
  hashAlgorithm: string;
  engine: string;
  compression: string;
  backups: BackupFileEntry[];
  auditLogs: BackupAuditEntry[];
}

interface DatabaseBackupSectionProps {
  currentUser: UserSession;
  hideHeader?: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} Ko`;
  const mb = kb / 1024;
  return `${mb.toFixed(2).replace('.', ',')} Mo`;
}

function formatDateTimeFr(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export const DatabaseBackupSection: React.FC<DatabaseBackupSectionProps> = ({ currentUser, hideHeader = false }) => {
  const [data, setData] = useState<BackupListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal de confirmation par mot de passe
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<{
    mode: 'export_full' | 'create_snapshot' | 'download_file';
    filename?: string;
    label: string;
  } | null>(null);
  const [password, setPassword] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isAdmin = currentUser?.role === 'Administrateur';

  const fetchBackups = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const token = await ensureUserAuthToken(currentUser.id, currentUser.role);
      const res = await fetch('/api/sauvegardes', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Erreur HTTP ${res.status}`);
      }
      const json: BackupListResponse = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement des sauvegardes.');
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.role, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchBackups();
    }
  }, [isAdmin, fetchBackups]);

  // Strictement réservé à l'Administrateur : aucun rendu pour les autres rôles
  if (!isAdmin) {
    return null;
  }

  const openPasswordModal = (
    mode: 'export_full' | 'create_snapshot' | 'download_file',
    label: string,
    filename?: string
  ) => {
    setPendingAction({ mode, filename, label });
    setPassword('');
    setModalError(null);
    setFeedback(null);
    setModalOpen(true);
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAction) return;

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setModalError('Veuillez saisir votre mot de passe Administrateur pour confirmer cette opération.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const token = await ensureUserAuthToken(currentUser.id, currentUser.role);
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      if (pendingAction.mode === 'create_snapshot') {
        const res = await fetch('/api/sauvegardes/creer', {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: trimmedPassword }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || `Erreur HTTP ${res.status}`);
        }

        setModalOpen(false);
        setPassword('');
        setFeedback({
          type: 'success',
          message:
            payload.message ||
            `Sauvegarde SQLite compressée créée avec succès (${payload.backup?.filename || ''}).`,
        });
        await fetchBackups();
        return;
      }

      if (pendingAction.mode === 'export_full') {
        const res = await fetch('/api/sauvegardes/exporter', {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: trimmedPassword }),
        });

        if (!res.ok) {
          const errPayload = await res.json().catch(() => ({}));
          throw new Error(errPayload.error || `Erreur HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const headerFilename = res.headers.get('X-Backup-Filename');
        const downloadName =
          headerFilename ||
          `baobab_sauvegarde_${new Date().toISOString().slice(0, 10)}.db.gz`;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setModalOpen(false);
        setPassword('');
        setFeedback({
          type: 'success',
          message: `Export complet de la base SQLite compressée téléchargé (${downloadName} • ${formatBytes(blob.size)}). Mots de passe vérifiés et hachés.`,
        });
        await fetchBackups();
        return;
      }

      if (pendingAction.mode === 'download_file' && pendingAction.filename) {
        const res = await fetch(
          `/api/sauvegardes/telecharger/${encodeURIComponent(pendingAction.filename)}`,
          {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: trimmedPassword }),
          }
        );

        if (!res.ok) {
          const errPayload = await res.json().catch(() => ({}));
          throw new Error(errPayload.error || `Erreur HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pendingAction.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setModalOpen(false);
        setPassword('');
        setFeedback({
          type: 'success',
          message: `Archive de sauvegarde « ${pendingAction.filename} » téléchargée avec succès (${formatBytes(blob.size)}).`,
        });
        await fetchBackups();
      }
    } catch (err: unknown) {
      setModalError(
        err instanceof Error ? err.message : 'Erreur lors de la vérification du mot de passe.'
      );
      fetchBackups();
    } finally {
      setSubmitting(false);
    }
  };

  const renderBackupTypeBadge = (type: BackupFileEntry['type']) =>
    type === 'quotidienne' ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--marque-fonce)] text-white">
        Quotidienne (Auto 14j)
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#15803D] text-white">
        Export Admin (Manuel)
      </span>
    );

  const backupColumns: DataTableColumn<BackupFileEntry>[] = [
    {
      key: 'filename',
      header: 'Fichier de sauvegarde (.db.gz)',
      hideInMobileCard: true,
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileArchive className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0" />
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white break-all">
            {row.filename}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideInMobileCard: true,
      render: (row) => renderBackupTypeBadge(row.type),
    },
    {
      key: 'createdAt',
      header: 'Créée le',
      render: (row) => (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {formatDateTimeFr(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Conservation (14 jours)',
      secondary: true,
      render: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          Jusqu&apos;au {formatDateTimeFr(row.expiresAt)}
        </span>
      ),
    },
    {
      key: 'sizeBytes',
      header: 'Taille Gzip',
      isNumeric: true,
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
          {formatBytes(row.sizeBytes)}
        </span>
      ),
    },
    {
      key: 'sha256',
      header: 'Empreinte SHA-256',
      secondary: true,
      render: (row) => (
        <code
          className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          title={`SHA-256 : ${row.sha256}`}
        >
          {row.sha256.slice(0, 12)}…
        </code>
      ),
    },
  ];

  const renderAuditBadge = (action: string) => {
    const isError = action.includes('ECHEC') || action.includes('REFUSE');
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white ${
          isError ? 'bg-[#B91C1C]' : 'bg-[#15803D]'
        }`}
      >
        {action}
      </span>
    );
  };

  const auditColumns: DataTableColumn<BackupAuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Date & Heure',
      render: (row) => (
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
          {formatDateTimeFr(row.timestamp)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action auditée',
      hideInMobileCard: true,
      render: (row) => renderAuditBadge(row.action),
    },
    {
      key: 'user_name',
      header: 'Opérateur',
      render: (row) => (
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {row.user_name}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Détails & Paramètres',
      render: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-300 break-words">
          {row.details}
        </span>
      ),
    },
  ];

  return (
    <section
      id="section-sauvegarde-admin"
      className={
        hideHeader
          ? 'space-y-5'
          : 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs space-y-5'
      }
    >
      {/* En-tête de la section Sauvegarde */}
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-snug">
                  Sauvegarde
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#15803D] text-white">
                  <Lock className="w-3 h-3" />
                  Admin
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-snug">
                  Archives SQLite compressées (.db.gz) et rétention 14 jours.
                </p>
                <InfoTooltip text="Export complet via l'API Backup SQLite natif, archive compressée Gzip (.db.gz), sauvegarde quotidienne automatique conservée 14 jours dans BACKUP_PATH, mots de passe hachés (scrypt) et journal d'audit intégral." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cartes de garanties techniques compactes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Dossier
            </span>
            <InfoTooltip text={`Stockage serveur isolé (${data?.backups?.length ?? 0} archive(s) active(s))`} />
          </div>
          <div className="font-mono text-xs font-extrabold text-slate-900 dark:text-white break-all">
            {data?.backupPath || './data/backups'}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Rétention
            </span>
            <InfoTooltip text="Rotation et purge automatique des archives quotidiennes au-delà de 14 jours." />
          </div>
          <div className="text-xs font-extrabold text-slate-900 dark:text-white">
            Conservation {data?.retentionDays ?? 14} jours
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#15803D]" />
              Hachage
            </span>
            <InfoTooltip text="Aucun mot de passe en clair dans la base ou dans les archives exportées." />
          </div>
          <div className="text-xs font-extrabold text-[#15803D] dark:text-emerald-400">
            100 % hachés ({data?.hashAlgorithm || 'scrypt'})
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-0.5">
          <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
              Sécurité
            </span>
            <InfoTooltip text="Toute opération de sauvegarde ou de téléchargement requiert le mot de passe Administrateur et est tracée dans l'audit." />
          </div>
          <div className="text-xs font-extrabold text-slate-900 dark:text-white">
            Mot de passe requis
          </div>
        </div>
      </div>

      {/* Message de retour d'action */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-[#15803D] text-white border-[#15803D]'
              : 'bg-[#B91C1C] text-white border-[#B91C1C]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="text-xs sm:text-sm font-semibold break-words">{feedback.message}</div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl border bg-[#B91C1C] text-white border-[#B91C1C] flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-semibold break-words">{error}</div>
        </div>
      )}

      {/* Liste des sauvegardes disponibles dans BACKUP_PATH */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <FileArchive className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Archives disponibles ({data?.backups?.length ?? 0})
            </h3>
            <InfoTooltip text="Le téléchargement d'une archive requiert la confirmation du mot de passe Administrateur." />
          </div>
        </div>

        <DataTable<BackupFileEntry>
          columns={backupColumns}
          data={data?.backups || []}
          rowKey={(row) => row.filename}
          mobileTitle={(row) => (
            <span className="font-mono text-xs font-bold break-all">{row.filename}</span>
          )}
          mobileBadge={(row) => renderBackupTypeBadge(row.type)}
          emptyMessage="Aucune sauvegarde présente dans BACKUP_PATH."
          renderActions={(row) => (
            <button
              type="button"
              onClick={() =>
                openPasswordModal(
                  'download_file',
                  `Télécharger l'archive ${row.filename}`,
                  row.filename
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#15803D] hover:bg-[#166534] transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger (.db.gz)
            </button>
          )}
          totalsFooter={
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
              <span>Archives conservées (≤ 14j) : {data?.backups?.length ?? 0}</span>
              <span>
                Volume cumulé :{' '}
                {formatBytes(
                  (data?.backups || []).reduce((acc, item) => acc + (item.sizeBytes || 0), 0)
                )}
              </span>
            </div>
          }
        />
      </div>

      {/* Journal d'audit des opérations de sauvegarde */}
      <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <History className="w-4 h-4 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Journal d&apos;audit des sauvegardes
          </h3>
          <InfoTooltip text="Créations, exports, téléchargements, sauvegardes quotidiennes, purges 14 jours et refus 403." />
        </div>

        <CardList<BackupAuditEntry>
          data={data?.auditLogs || []}
          rowKey={(row) => String(row.id)}
          pageSize={20}
          emptyMessage="Aucune entrée d'audit de sauvegarde enregistrée."
          searchable
          searchPlaceholder="Rechercher par action, opérateur ou détail..."
          searchPredicate={(row, q) =>
            String(row.action || '').toLowerCase().includes(q) ||
            String(row.user_name || '').toLowerCase().includes(q) ||
            String(row.details || '').toLowerCase().includes(q)
          }
          renderTitle={(row) => (
            <span className="font-mono font-bold text-slate-900 dark:text-white break-words">
              #{row.id} &bull; {row.action}
            </span>
          )}
          renderSubtitle={(row) => (
            <span className="font-mono text-xs text-slate-500 whitespace-nowrap">
              {formatDateTimeFr(row.timestamp)}
            </span>
          )}
          renderBadges={(row) => renderAuditBadge(row.action)}
          fields={[
            {
              key: 'user_name',
              label: 'Opérateur',
              render: (row) => (
                <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                  {row.user_name}
                </span>
              ),
            },
            {
              key: 'details',
              label: 'Détails & Paramètres',
              render: (row) => (
                <span className="text-slate-600 dark:text-slate-300 break-words">
                  {row.details}
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* Boutons principaux verts en bas de la section */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={fetchBackups}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>

        <button
          type="button"
          onClick={() =>
            openPasswordModal(
              'create_snapshot',
              'Créer une sauvegarde SQLite compressée dans BACKUP_PATH'
            )
          }
          className="inline-flex items-center justify-center gap-2 h-[48px] px-4 rounded-xl border border-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300 font-bold text-xs sm:text-sm transition cursor-pointer"
        >
          <HardDrive className="w-4 h-4" />
          Sauvegarder maintenant
        </button>

        <button
          type="button"
          onClick={() =>
            openPasswordModal(
              'export_full',
              'Exporter et télécharger la base complète (.db.gz)'
            )
          }
          className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-xl font-bold text-xs sm:text-sm text-white bg-[#15803D] hover:bg-[#166534] transition shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Exporter la base complète (.db.gz)
        </button>
      </div>

      {/* Modal de confirmation par mot de passe Administrateur */}
      {modalOpen && (
        <FormModal
          onClose={() => {
            if (!submitting) {
              setModalOpen(false);
              setPassword('');
              setModalError(null);
            }
          }}
          title="Confirmation par mot de passe Administrateur"
          subtitle={
            pendingAction?.label ||
            'Saisissez votre mot de passe Administrateur pour autoriser la sauvegarde SQLite.'
          }
          hideFooter={true}
        >
          <form onSubmit={handleConfirmAction} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                Sécurité de la sauvegarde complète SQLite
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Cette opération utilise l&apos;API Backup native de SQLite à chaud, vérifie que tous les mots de passe de la table <code>users</code> sont hachés (<code>scrypt</code>), compresse le fichier au format <code>.db.gz</code> et inscrit l&apos;opération dans le journal d&apos;audit.
              </p>
            </div>

            {modalError && (
              <div className="p-3.5 rounded-xl bg-[#B91C1C] text-white text-xs font-bold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-backup-password"
                className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Mot de passe Administrateur ({currentUser.name}) *
              </label>
              <input
                id="admin-backup-password"
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Saisissez votre mot de passe Administrateur..."
                className="w-full h-[48px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--marque-fonce)]"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Toute tentative avec un mot de passe erroné est bloquée (403) et inscrite au journal d&apos;audit.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setModalOpen(false);
                  setPassword('');
                  setModalError(null);
                }}
                className="h-[48px] px-4 rounded-[12px] border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 h-[48px] px-5 rounded-[12px] font-bold text-sm text-white bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 transition cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Vérification &amp; Compression...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Confirmer et exécuter
                  </>
                )}
              </button>
            </div>
          </form>
        </FormModal>
      )}
    </section>
  );
};
