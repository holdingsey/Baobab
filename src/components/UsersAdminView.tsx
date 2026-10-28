import React, { useState } from 'react';
import { UserCheck, Shield, PlusCircle, Users, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { UserSession } from './LoginScreen';

interface UsersAdminViewProps {
  users: UserSession[];
  currentRole: string;
  onRefreshUsers: () => void;
}

export const UsersAdminView: React.FC<UsersAdminViewProps> = ({
  users,
  currentRole,
  onRefreshUsers,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+223 ');
  const [role, setRole] = useState<'Magasinier' | 'Comptable' | 'Vendeur'>('Vendeur');
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
          team: role === 'Vendeur' ? team : undefined,
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
            La création et la gestion des comptes utilisateurs (Magasiniers, Comptables, Vendeurs) est strictement réservée à l'Administrateur principal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Gestion des Utilisateurs &amp; Rôles
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              Administrateur Unique (BAO-ADM)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Création centralisée des comptes autorisés. Attribution automatique des codes officiels et mot de passe provisoire.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Créer un Nouveau Compte</span>
        </button>
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

      {/* Mobile Cards View (< 640px) */}
      <div className="space-y-3 sm:hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                  {u.code}
                </span>
                <div className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  {u.name}
                </div>
              </div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  u.role === 'Administrateur'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                    : u.role === 'Magasinier'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : u.role === 'Comptable'
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                }`}
              >
                {u.role}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              <div>Équipe : <strong>{u.team || '—'}</strong></div>
              <div>Email : <strong>{u.email}</strong> &bull; Tél : <strong>{u.phone || '—'}</strong></div>
            </div>
            <div className="pt-1 flex justify-end">
              {u.must_change_password === 1 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <KeyRound className="w-3 h-3" /> Mot de passe provisoire
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" /> Actif
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet & Desktop Users Table (>= 640px) */}
      <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold text-[10px]">
                <th className="py-3 px-2.5 lg:px-4">Code &amp; Utilisateur</th>
                <th className="py-3 px-2.5 lg:px-4">Rôle &amp; Équipe</th>
                <th className="py-3 px-2.5 lg:px-4">Contact (Email / Tél)</th>
                <th className="py-3 px-2.5 lg:px-4 text-center">Sécurité MDP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-2.5 lg:px-4">
                    <div className="font-mono font-bold text-teal-600 dark:text-teal-400">
                      {u.code}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {u.name}
                    </div>
                  </td>
                  <td className="py-3 px-2.5 lg:px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        u.role === 'Administrateur'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : u.role === 'Magasinier'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : u.role === 'Comptable'
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                      }`}
                    >
                      {u.role}
                    </span>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-1">
                      {u.team || '—'}
                    </div>
                  </td>
                  <td className="py-3 px-2.5 lg:px-4">
                    <div className="text-slate-700 dark:text-slate-200 font-medium">{u.email}</div>
                    <div className="text-[11px] text-slate-500">{u.phone || '—'}</div>
                  </td>
                  <td className="py-3 px-2.5 lg:px-4 text-center whitespace-nowrap">
                    {u.must_change_password === 1 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                        <KeyRound className="w-3 h-3" /> Mot de passe provisoire
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> Actif
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Créer un compte */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-teal-600" />
              Création d'un Nouveau Compte (Admin Seul)
            </h2>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Rôle Métier</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="Vendeur">Vendeur (Génère code BAO-VND-00X)</option>
                  <option value="Magasinier">Magasinier (Génère code BAO-MAG)</option>
                  <option value="Comptable">Comptable (Génère code BAO-CPT)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Note : Un seul Administrateur principal est autorisé dans Baobab Distribution.
                </p>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Nom Complet</label>
                <input
                  type="text"
                  placeholder="Ex: Salif Traoré"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Email Professionnel</label>
                <input
                  type="email"
                  placeholder="Ex: salif.traore@baobab.ml"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {role === 'Vendeur' && (
                <div>
                  <label className="block text-slate-500 mb-1 font-bold text-teal-700 dark:text-teal-300">
                    Champ libre "Équipe" sur le Vendeur
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Équipe Sotuba, Équipe Rive Droite, Équipe Centre..."
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-500">
                &bull; Un <strong>mot de passe provisoire</strong> sera généré et devra être changé obligatoirement à la première connexion de l'utilisateur.
              </div>

              <div className="pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"
                >
                  Créer le compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
