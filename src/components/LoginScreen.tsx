import React, { useState } from 'react';
import { ShieldCheck, Package, CreditCard, ShoppingBag, ArrowRight, UserCheck, KeyRound, AlertCircle } from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';

export interface UserSession {
  id: string;
  code: string;
  name: string;
  email: string;
  role: 'Administrateur' | 'Magasinier' | 'Comptable' | 'Vendeur';
  phone?: string;
  team?: string;
  must_change_password?: number;
}

interface LoginScreenProps {
  onLogin: (user: UserSession) => void;
  logoUrl?: string;
  usersList: UserSession[];
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, logoUrl, usersList }) => {
  const [selectedUser, setSelectedUser] = useState<UserSession>(usersList[0] || {
    id: 'usr-adm',
    code: 'BAO-ADM',
    name: 'Amadou Touré',
    email: 'admin@baobab.ml',
    role: 'Administrateur',
    phone: '+223 76 01 23 45',
    team: 'Direction Générale',
    must_change_password: 0
  });

  const [emailInput, setEmailInput] = useState(selectedUser.email);
  const [passwordInput, setPasswordInput] = useState('••••••••');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectUser = (user: UserSession) => {
    setSelectedUser(user);
    setEmailInput(user.email);
    setErrorMsg(null);
  };

  const handleEmailChange = (value: string) => {
    setEmailInput(value);
    const matched = usersList.find(
      (u) => u.email.toLowerCase() === value.trim().toLowerCase() || u.code.toLowerCase() === value.trim().toLowerCase()
    );
    if (matched) {
      setSelectedUser(matched);
      setErrorMsg(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUser.must_change_password === 1) {
      setIsChangingPassword(true);
      return;
    }
    onLogin(selectedUser);
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMsg('Le nouveau mot de passe doit comporter au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }

    try {
      await fetch(`/api/users/${selectedUser.id}/change-password`, { method: 'PATCH' });
      const updated = { ...selectedUser, must_change_password: 0 };
      onLogin(updated);
    } catch {
      onLogin({ ...selectedUser, must_change_password: 0 });
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-gradient-to-b from-slate-50 via-[#1d94b2]/10 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 shadow-xl backdrop-blur-md p-8">
          
          {/* Logo Section */}
          <div className="flex flex-col items-center text-center">
            <div className="h-28 flex items-center justify-center">
              <BaobabLogo
                logoUrl={logoUrl}
                size={96}
                variant="login"
              />
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Baobab Distribution
            </h1>
          </div>

          {/* Modal if must_change_password === 1 */}
          {isChangingPassword ? (
            <form onSubmit={handlePasswordChangeSubmit} className="mt-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Mot de passe provisoire détecté.</strong>
                  <p className="mt-0.5">Par mesure de sécurité, veuillez définir votre mot de passe personnel pour continuer.</p>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1d94b2]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer à l'identique"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1d94b2]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#1d94b2] hover:bg-[#167a94] text-white font-semibold text-sm transition shadow-md flex items-center justify-center gap-2"
              >
                <span>Enregistrer et se connecter</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              {/* Formulaire en haut */}
              <form onSubmit={handleFormSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Adresse Email ({selectedUser.code})
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1d94b2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mot de Passe
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1d94b2]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#1d94b2] hover:bg-[#167a94] active:scale-[0.99] text-white font-semibold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Se connecter ({selectedUser.name})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Sélection des rôles / comptes en bas */}
              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 text-center">
                  Sélectionnez un rôle / compte pour vous connecter
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {usersList.map((user) => {
                    const isSelected = selectedUser.id === user.id;
                    let Icon = ShieldCheck;
                    if (user.role === 'Magasinier') Icon = Package;
                    if (user.role === 'Comptable') Icon = CreditCard;
                    if (user.role === 'Vendeur') Icon = ShoppingBag;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'border-[#1d94b2] bg-[#1d94b2]/10 dark:bg-[#1d94b2]/20 dark:border-[#38bdf8] text-[#0f5366] dark:text-sky-200 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              isSelected
                                ? 'bg-[#1d94b2] text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="overflow-hidden min-w-0">
                            <div className="text-xs font-bold truncate flex items-center gap-1.5">
                              <span>{user.name}</span>
                              <span className="font-mono text-[10px] text-[#1d94b2] dark:text-sky-300 bg-[#1d94b2]/15 dark:bg-sky-900/60 px-1 rounded">
                                {user.code}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {user.role} {user.team ? `• ${user.team}` : ''}
                            </div>
                          </div>
                        </div>

                        {user.must_change_password === 1 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                            MDP prov.
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-400">
            Baobab Distribution SARL &bull; Serveur Express &amp; Base SQLite &bull; Bamako
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Zone Industrielle de Sotuba &bull; Chaîne : Fournisseur &rarr; Dépôt Central &rarr; Vendeurs &rarr; Points de Vente
        </p>
      </div>
    </div>
  );
};
