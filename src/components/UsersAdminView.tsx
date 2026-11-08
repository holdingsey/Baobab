import React, { useState } from 'react';
import { UserCheck, Shield, PlusCircle, Users, KeyRound, AlertTriangle, CheckCircle2, LogIn } from 'lucide-react';
import { UserSession } from './LoginScreen';
import { InfoTooltip } from './InfoTooltip';
import { FormModal } from './FormModal';
import { PhoneField, FORM_FIELD_CLASS } from './FormControls';
import { DataTable, DataTableColumn } from './DataTable';
import { ExportViewButton } from './ExtractionsView';

interface UsersAdminViewProps {
  users: UserSession[];
  currentRole: string;
  currentUserId?: string;
  onRefreshUsers: () => void;
  onSwitchUser?: (user: UserSession) => void;
}

export const UsersAdminView: React.FC<UsersAdminViewProps> = ({
  users,
  currentRole,
  currentUserId,
  onRefreshUsers,
  onSwitchUser,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+223 ');
  const [role, setRole] = useState<'Directeur des opérations de vente' | 'Sales Admin' | 'Gestionnaire grossiste' | 'Gestionnaire de stock' | 'Magasinier' | 'Comptable' | 'Vendeur'>('Vendeur');
  const [team, setTeam] = useState('Équipe Sotuba / Rive Gauche');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = currentRole === 'Administrateur';

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          role,
          team:
            role === 'Vendeur'
              ? team
              : role === 'Directeur des opérations de vente'
              ? 'Direction des Opérations de Vente'
              : role === 'Sales Admin'
              ? 'Contrôle & Inventaires'
              : role === 'Gestionnaire grossiste'
              ? 'Département Ventes en Gros & Grands Comptes'
              : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la création');
      }

      setFeedback({
        type: 'success',
        message: data.message,
      });
      setShowCreateModal(false);
      setName('');
      setEmail('');
      onRefreshUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 p-6 text-center">
          <Shield className="w-12 h-12 mx-auto text-amber-600 mb-3" />
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">
            Accès réservé à l'Administrateur Unique
          </h2>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto">
            La création et la gestion des comptes utilisateurs (Gestionnaires de stock, Comptables, Vendeurs, DOV, Sales Admin) est strictement réservée à l'Administrateur principal.
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter === 'ALL') return true;
    if (roleFilter === 'Gestionnaire de stock') {
      return u.role === 'Gestionnaire de stock' || u.role === 'Magasinier';
    }
    return u.role === roleFilter;
  });

  const vendorsCount = users.filter((u) => u.role === 'Vendeur').length;
  const controlOpsCount = users.filter(
    (u) => u.role === 'Directeur des opérations de vente' || u.role === 'Sales Admin' || u.role === 'Administrateur'
  ).length;
  const stockComptaCount = users.filter(
    (u) => u.role === 'Gestionnaire de stock' || u.role === 'Magasinier' || u.role === 'Comptable'
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Gestion des Utilisateurs et des Rôles
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--marque-fonce)] text-white">
              Administrateur
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Gestion des comptes utilisateurs et des rôles.
            </p>
            <InfoTooltip text="Gérez les profils utilisateurs de l'application, consultez leurs rôles ou créez un nouveau compte collaborateur." />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ExportViewButton
            currentUser={{
              id: currentUserId || 'usr-adm',
              code: 'BAO-ADM',
              name: 'Administrateur',
              email: 'admin@baobab.ml',
              role: currentRole as any,
              phone: '',
            }}
            jeu="utilisateurs"
            label="Exporter Utilisateurs"
            filtres={{ role: roleFilter !== 'ALL' ? roleFilter : '' }}
          />
          <ExportViewButton
            currentUser={{
              id: currentUserId || 'usr-adm',
              code: 'BAO-ADM',
              name: 'Administrateur',
              email: 'admin@baobab.ml',
              role: currentRole as any,
              phone: '',
            }}
            jeu="audit"
            label="Exporter Audit"
          />
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Créer un Nouveau Compte</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards for All Accounts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total des Comptes</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {users.length} <span className="text-xs font-bold text-teal-600">comptes actifs</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Comptes enregistrés</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Direction &amp; Contrôle</span>
          <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
            {controlOpsCount} <span className="text-xs font-bold">profils</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Admin, DOV &amp; Sales Admin</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Stock &amp; Comptabilité</span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stockComptaCount} <span className="text-xs font-bold">profils</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Gestionnaire de stock &amp; Comptable</span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Équipes Vendeurs</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {vendorsCount} <span className="text-xs font-bold">vendeurs</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Dépôt-vente Bamako</span>
        </div>
      </div>

      {/* Role Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'ALL', label: `Tous les comptes (${users.length})` },
          { id: 'Administrateur', label: 'Administrateur' },
          { id: 'Directeur des opérations de vente', label: 'Directeur des opérations de vente (DOV)' },
          { id: 'Sales Admin', label: 'Sales Admin (Contrôleur)' },
          { id: 'Gestionnaire grossiste', label: 'Gestionnaire grossiste' },
          { id: 'Gestionnaire de stock', label: 'Gestionnaire de stock' },
          { id: 'Comptable', label: 'Comptable' },
          { id: 'Vendeur', label: `Vendeurs (${vendorsCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRoleFilter(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
              roleFilter === tab.id
                ? 'bg-[var(--marque-fonce)] text-white border-[var(--marque-fonce)] shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="text-xs font-semibold">{feedback.message}</span>
        </div>
      )}

      {/* Tableau partagé des utilisateurs */}
      <DataTable<UserSession>
        data={filteredUsers}
        rowKey={(u) => u.id}
        mobileTitle={(u) => (
          <span>
            <span className="font-mono text-teal-600 dark:text-teal-400 mr-1.5">{u.code}</span>
            {u.name}
          </span>
        )}
        mobileBadge={(u) => (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              u.role === 'Administrateur'
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                : u.role === 'Directeur des opérations de vente'
                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                : u.role === 'Sales Admin'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : u.role === 'Gestionnaire de stock' || u.role === 'Magasinier'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : u.role === 'Comptable'
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
            }`}
          >
            {u.role === 'Sales Admin' ? 'Sales Admin (Contrôleur)' : u.role === 'Magasinier' ? 'Gestionnaire de stock' : u.role}
          </span>
        )}
        columns={[
          {
            key: 'user',
            header: 'Code & Utilisateur',
            hideInMobileCard: true,
            cell: (u) => (
              <div>
                <div className="font-mono font-bold text-teal-600 dark:text-teal-400">{u.code}</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{u.name}</div>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Rôle & Équipe',
            mobileLabel: 'Équipe',
            mobileValue: (u) => u.team || '—',
            cell: (u) => (
              <div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    u.role === 'Administrateur'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      : u.role === 'Directeur des opérations de vente'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                      : u.role === 'Sales Admin'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : u.role === 'Gestionnaire de stock' || u.role === 'Magasinier'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : u.role === 'Comptable'
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                  }`}
                >
                  {u.role === 'Sales Admin' ? 'Sales Admin (Contrôleur)' : u.role === 'Magasinier' ? 'Gestionnaire de stock' : u.role}
                </span>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-1">
                  {u.team || '—'}
                </div>
              </div>
            ),
          },
          {
            key: 'contact',
            header: 'Contact (Email / Tél)',
            mobileLabel: 'Contact',
            secondary: true,
            mobileValue: (u) => `${u.email} • ${u.phone || '—'}`,
            cell: (u) => (
              <div>
                <div className="text-slate-700 dark:text-slate-200 font-medium">{u.email}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{u.phone || '—'}</div>
              </div>
            ),
          },
          {
            key: 'security',
            header: 'Sécurité MDP',
            mobileLabel: 'Sécurité MDP',
            align: 'center',
            secondary: true,
            cell: (u) =>
              u.must_change_password === 1 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <KeyRound className="w-3 h-3" /> Mot de passe provisoire
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" /> Actif
                </span>
              ),
          },
          {
            key: 'actions',
            header: 'Accès Direct Admin',
            align: 'right',
            hideInMobileCard: true,
            cell: (u) => {
              const isCurrent = u.id === currentUserId;
              if (!onSwitchUser) return null;
              return (
                <button
                  type="button"
                  onClick={() => onSwitchUser(u)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                    isCurrent
                      ? 'bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'
                      : 'bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white shadow-xs'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{isCurrent ? 'Compte actif' : 'Accéder au compte'}</span>
                </button>
              );
            },
          },
        ]}
        mobileActions={(u) => {
          const isCurrent = u.id === currentUserId;
          if (!onSwitchUser) return null;
          return (
            <button
              type="button"
              onClick={() => onSwitchUser(u)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                isCurrent
                  ? 'bg-[var(--marque-clair)] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'
                  : 'bg-[var(--marque-fonce)] hover:bg-[#00586B] text-white shadow-xs'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isCurrent ? 'Session active' : 'Accéder au compte'}</span>
            </button>
          );
        }}
        totalsFooter={
          <>
            <span>
              Vendeurs : <strong>{filteredUsers.filter((u) => u.role === 'Vendeur').length}</strong>
            </span>
            <span>
              Comptes actifs : <strong>{filteredUsers.filter((u) => !u.must_change_password).length}</strong>
            </span>
          </>
        }
      />

      {/* Modal Créer un compte */}
      {showCreateModal && (
        <FormModal
          title="Nouvel utilisateur"
          icon={<PlusCircle className="w-5 h-5 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]" />}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateUser}
          submitLabel="Créer le compte"
          submitDisabled={isSubmitting}
          isDirty={Boolean(name.trim() || email.trim() || (phone.trim() && phone.trim() !== '+223'))}
        >
          <div>
            <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
              Rôle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className={FORM_FIELD_CLASS}
            >
              <option value="Vendeur">Vendeur</option>
              <option value="Directeur des opérations de vente">Directeur des opérations de vente (DOV)</option>
              <option value="Sales Admin">Sales Admin / Contrôleur</option>
              <option value="Gestionnaire grossiste">Gestionnaire grossiste</option>
              <option value="Gestionnaire de stock">Gestionnaire de stock</option>
              <option value="Comptable">Comptable</option>
            </select>
            {(role as string) === 'Administrateur' && (
              <p className="text-[14px] text-slate-900 dark:text-white mt-2">
                Un seul Administrateur est autorisé.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
              Nom complet
            </label>
            <input
              type="text"
              placeholder="Ex: Salif Traoré"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={FORM_FIELD_CLASS}
            />
          </div>

          <div>
            <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
              E-mail (optionnel)
            </label>
            <input
              type="email"
              placeholder="Ex: salif.traore@baobab.ml"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={FORM_FIELD_CLASS}
            />
          </div>

          <div>
            <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
              Téléphone
            </label>
            <PhoneField
              value={phone}
              onChange={setPhone}
              placeholder="76 01 23 45"
            />
          </div>

          {role === 'Vendeur' && (
            <div>
              <label className="block text-[14px] font-medium text-slate-900 dark:text-white mb-2">
                Équipe (optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex: Équipe Sotuba, Équipe Rive Droite, Équipe Centre..."
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                required
                className={FORM_FIELD_CLASS}
              />
            </div>
          )}

          <p className="text-[14px] text-slate-900 dark:text-white">
            Un mot de passe provisoire sera généré (à changer à la première connexion).
          </p>
        </FormModal>
      )}
    </div>
  );
};
