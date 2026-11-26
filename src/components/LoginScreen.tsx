import React, { useState } from 'react';
import { ShieldCheck, Package, CreditCard, ShoppingBag, ArrowRight, UserCheck, KeyRound, AlertCircle, ClipboardCheck, Briefcase } from 'lucide-react';
import { BaobabLogo } from './BaobabLogo';
import { FieldError, FORM_FIELD_CLASS } from './FormControls';

export interface UserSession {
  id: string;
  code: string;
  name: string;
  email: string;
  role: 'Administrateur' | 'Directeur des opérations de vente' | 'Sales Admin' | 'Gestionnaire grossiste' | 'Gestionnaire de stock' | 'Magasinier' | 'Facturation' | 'Comptable' | 'Vendeur';
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
  const [passwordInput, setPasswordInput] = useState('1234');
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
    if (!/^\d{4}$/.test(newPassword)) {
      setErrorMsg('Le code PIN doit comporter exactement 4 chiffres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Les codes PIN ne correspondent pas.');
      return;
    }

    try {
      await fetch(`/api/users/${selectedUser.id}/change-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
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
                  <strong>Code PIN provisoire détecté.</strong>
                  <p className="mt-0.5">Par mesure de sécurité, veuillez définir votre code PIN personnel à 4 chiffres pour continuer.</p>
                </div>
              </div>

              {errorMsg && <FieldError message={errorMsg} />}

              <div>
                <label className="block text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC] mb-[8px]">
                  Nouveau code PIN (4 chiffres)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••• (4 chiffres)"
                  required
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC] mb-[8px]">
                  Confirmer le code PIN (4 chiffres)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••• (4 chiffres)"
                  required
                  className={FORM_FIELD_CLASS}
                />
              </div>

              <button
                type="submit"
                className="w-full h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] text-[var(--marque-texte-sur-plein)] font-bold text-[16px] transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Enregistrer et se connecter</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              {/* Formulaire en haut */}
              <form onSubmit={handleFormSubmit} className="mt-6 space-y-[20px]">
                <div>
                  <label className="block text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC] mb-[8px]">
                    Adresse Email ({selectedUser.code})
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    required
                    className={FORM_FIELD_CLASS}
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC] mb-[8px]">
                    Code PIN (4 chiffres)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    required
                    className={FORM_FIELD_CLASS}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 h-[48px] px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] active:scale-[0.99] text-[var(--marque-texte-sur-plein)] font-bold text-[16px] transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
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
                    if (user.role === 'Directeur des opérations de vente') Icon = Briefcase;
                    if (user.role === 'Sales Admin') Icon = ClipboardCheck;
                    if (user.role === 'Gestionnaire grossiste') Icon = Package;
                    if (user.role === 'Gestionnaire de stock' || user.role === 'Magasinier') Icon = Package;
                    if (user.role === 'Facturation' || user.role === 'Comptable') Icon = CreditCard;
                    if (user.role === 'Vendeur') Icon = ShoppingBag;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'border-[var(--marque-fonce)] bg-[var(--marque-clair)] dark:border-[var(--marque-eclaircie)] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              isSelected
                                ? 'bg-[var(--marque-fonce)] text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold flex flex-wrap items-center gap-1.5">
                              <span>{user.name}</span>
                              <span className="font-mono text-[10px] text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)] bg-[var(--marque-clair)] px-1 rounded">
                                {user.code}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                              {user.role === 'Sales Admin'
                                ? 'Sales Admin (Contrôleur)'
                                : /directeur|op[eé]ration|dov/i.test(user.role || '')
                                ? 'Directeur des opérations de vente (DOV)'
                                : /grossiste/i.test(user.role || '') || user.code?.startsWith('BAO-GRS')
                                ? 'Gestionnaire grossiste'
                                : user.role === 'Magasinier'
                                ? 'Gestionnaire de stock'
                                : user.role === 'Comptable'
                                ? 'Facturation'
                                : user.role} {user.role !== 'Vendeur' && user.team ? `• ${user.team}` : ''}
                            </div>
                          </div>
                        </div>

                        {user.must_change_password === 1 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#92400E] text-white shrink-0">
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
