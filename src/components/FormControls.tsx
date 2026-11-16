import React, { useState } from 'react';
import { Banknote, Smartphone, Landmark, AlertCircle, Trash2 } from 'lucide-react';

export const FORM_FIELD_CLASS =
  'w-full max-w-full min-w-0 h-[48px] min-h-[48px] px-3.5 rounded-[12px] bg-white dark:bg-[#1E293B] opacity-100 border-[1.5px] border-[#64748B] dark:border-[#94A3B8] text-[#0F172A] dark:text-[#F8FAFC] text-[16px] leading-normal placeholder:text-[#475569] dark:placeholder:text-[#CBD5E1] focus:outline-none focus:ring-0 focus:border-[var(--marque-fonce)] dark:focus:border-[var(--marque-eclaircie)] transition-none';

export const FORM_SELECT_CLASS =
  'w-full max-w-full min-w-0 min-h-[48px] h-auto py-2.5 px-3.5 rounded-[12px] bg-white dark:bg-[#1E293B] opacity-100 border-[1.5px] border-[#64748B] dark:border-[#94A3B8] text-[#0F172A] dark:text-[#F8FAFC] text-[16px] leading-normal whitespace-normal [overflow-wrap:anywhere] focus:outline-none focus:ring-0 focus:border-[var(--marque-fonce)] dark:focus:border-[var(--marque-eclaircie)] transition-none';

export const FORM_TEXTAREA_CLASS =
  'w-full max-w-full min-w-0 min-h-[96px] px-3.5 py-3 rounded-[12px] bg-white dark:bg-[#1E293B] opacity-100 border-[1.5px] border-[#64748B] dark:border-[#94A3B8] text-[#0F172A] dark:text-[#F8FAFC] text-[16px] leading-normal placeholder:text-[#475569] dark:placeholder:text-[#CBD5E1] focus:outline-none focus:ring-0 focus:border-[var(--marque-fonce)] dark:focus:border-[var(--marque-eclaircie)] transition-none';

export const FORM_LABEL_CLASS =
  'block text-[14px] font-medium text-[#0F172A] dark:text-[#F8FAFC] mb-2';

export const FORM_GROUP_CLASS = 'space-y-5 min-w-0';

export const FORM_ROW_CLASS = 'grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 [&>*]:min-w-0';

export const FORM_ACTIONS_CLASS = 'flex flex-wrap items-center gap-3 w-full max-w-full min-w-0';

export const BTN_PRIMARY_CLASS =
  'min-h-[48px] h-auto py-3 px-5 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] active:bg-[#004A5A] text-[var(--marque-texte-sur-plein)] font-bold text-[15px] leading-snug whitespace-normal [overflow-wrap:anywhere] shadow-xs transition flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-w-0';

export const BTN_SECONDARY_CLASS =
  'min-h-[48px] h-auto py-3 px-4 rounded-[12px] bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#1E293B] dark:hover:bg-[#334155] text-[#0F172A] dark:text-[#F8FAFC] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] font-semibold text-[14px] leading-snug whitespace-normal [overflow-wrap:anywhere] transition flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-[var(--marque-fonce)] dark:[&_svg]:text-[var(--marque-eclaircie)] min-w-0';

export const BTN_DESTRUCTIVE_CLASS =
  'min-h-[48px] h-auto py-3 px-3.5 rounded-[12px] bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[13px] leading-snug whitespace-normal [overflow-wrap:anywhere] transition flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-w-0';

export interface PhoneFieldProps {
  value: string;
  onChange: (fullPhone: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
  id?: string;
  name?: string;
}

export const PhoneField: React.FC<PhoneFieldProps> = ({
  value,
  onChange,
  required = false,
  placeholder = '76 00 00 00',
  error,
  id,
  name,
}) => {
  const localNumber = (value || '').replace(/^\+?223\s*/, '');

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d\s]/g, '');
    const stripped = raw.replace(/^\+?223\s*/, '');
    onChange(stripped ? `+223 ${stripped}` : '+223 ');
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div
          className="h-[48px] min-h-[48px] px-3.5 rounded-[12px] bg-[#F1F5F9] dark:bg-[#1E293B] opacity-100 border-[1.5px] border-[#64748B] dark:border-[#94A3B8] text-[#0F172A] dark:text-[#F8FAFC] text-[16px] font-bold font-mono flex items-center justify-center shrink-0 select-none"
          aria-label="Indicatif Mali +223"
        >
          +223
        </div>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="numeric"
          pattern="[0-9 ]*"
          autoComplete="tel-national"
          required={required}
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className={`${FORM_FIELD_CLASS} flex-1 font-mono ${
            error ? 'border-[#B91C1C] dark:border-[#B91C1C]' : ''
          }`}
        />
      </div>
      {error && <FieldError message={error} />}
    </div>
  );
};

export interface PaymentMethodSelectorProps {
  value: string;
  onChange: (method: string) => void;
  especesValue?: string;
  mobileMoneyValue?: string;
  virementValue?: string;
}

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  value,
  onChange,
  especesValue = 'Espèces',
  mobileMoneyValue = 'Mobile Money',
  virementValue = 'Virement',
}) => {
  const normalized = (value || '').toLowerCase();
  const isEspeces =
    normalized.includes('esp') || normalized.includes('comptant') || normalized === '';
  const isMobileMoney =
    normalized.includes('mobile') ||
    normalized.includes('orange') ||
    normalized.includes('moov') ||
    normalized.includes('wave');
  const isVirement =
    !isEspeces &&
    !isMobileMoney &&
    (normalized.includes('virement') ||
      normalized.includes('chèque') ||
      normalized.includes('cheque') ||
      normalized.includes('bdm'));

  const options = [
    {
      key: 'especes',
      label: 'Espèces',
      targetValue: especesValue,
      active: isEspeces,
      Icon: Banknote,
    },
    {
      key: 'mobile_money',
      label: 'Mobile Money',
      targetValue: mobileMoneyValue,
      active: isMobileMoney,
      Icon: Smartphone,
    },
    {
      key: 'virement',
      label: 'Virement',
      targetValue: virementValue,
      active: isVirement,
      Icon: Landmark,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 min-w-0" role="radiogroup" aria-label="Mode de paiement">
      {options.map(({ key, label, targetValue, active, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(targetValue)}
          className={`w-full min-h-[80px] h-auto py-3 px-2 rounded-[12px] flex flex-col items-center justify-center gap-1.5 text-center transition cursor-pointer select-none opacity-100 min-w-0 focus-visible:outline-none ${
            active
              ? 'bg-[var(--marque-clair)] border-2 border-[var(--marque-fonce)] dark:border-[var(--marque-eclaircie)] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs ring-2 ring-[#006B82]/30 dark:ring-[#38CAE6]/30'
              : 'bg-white dark:bg-[#1E293B] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[var(--marque-fonce)] dark:hover:border-[var(--marque-eclaircie)]'
          }`}
        >
          <Icon
            className={`w-5 h-5 shrink-0 ${
              active
                ? 'text-[var(--marque-fonce)] dark:text-[var(--marque-eclaircie)]'
                : 'text-[#334155] dark:text-[#CBD5E1]'
            }`}
          />
          <span className="text-[12px] sm:text-[13px] font-bold leading-tight whitespace-normal [overflow-wrap:anywhere] max-w-full">{label}</span>
        </button>
      ))}
    </div>
  );
};

export const FieldError: React.FC<{ message?: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-1.5 px-2.5 py-1.5 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[13px] font-semibold flex items-start gap-1.5 w-full max-w-full break-words"
    >
      <AlertCircle className="w-4 h-4 shrink-0 text-[#B91C1C] mt-0.5" />
      <span className="flex-1 break-words leading-snug">{message}</span>
    </p>
  );
};

export interface ConfirmDestructiveButtonProps {
  onConfirm: () => void;
  label?: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  iconOnly?: boolean;
}

export const ConfirmDestructiveButton: React.FC<ConfirmDestructiveButtonProps> = ({
  onConfirm,
  label = 'Supprimer',
  confirmLabel = 'Confirmer ?',
  disabled = false,
  className = '',
  title,
  iconOnly = false,
}) => {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="h-[38px] px-3 rounded-[10px] bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-[12px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-[38px] px-2.5 rounded-[10px] bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] border border-[#64748B] dark:border-[#94A3B8] font-semibold text-[12px] cursor-pointer"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={title || (typeof label === 'string' ? label : undefined)}
      aria-label={typeof label === 'string' ? label : undefined}
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className={`${BTN_DESTRUCTIVE_CLASS} ${iconOnly ? 'px-2.5' : ''} ${className}`}
    >
      {iconOnly ? <Trash2 className="w-4 h-4 text-white" /> : label}
    </button>
  );
};
