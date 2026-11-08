import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface FormModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: React.ReactNode;
  submitDisabled?: boolean;
  isDirty?: boolean;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
  hideFooter?: boolean;
  cancelLabel?: React.ReactNode;
}

function getFrenchValidationMessage(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string {
  const validity = field.validity;
  if (validity.valueMissing) {
    return 'Ce champ est obligatoire.';
  }
  if (validity.typeMismatch) {
    if (field instanceof HTMLInputElement && field.type === 'email') {
      return 'Veuillez saisir une adresse e-mail valide.';
    }
    return 'Le format saisi est invalide.';
  }
  if (validity.patternMismatch) {
    if (field instanceof HTMLInputElement && field.type === 'tel') {
      return 'Veuillez saisir uniquement des chiffres pour le numéro.';
    }
    return 'Le format saisi est invalide.';
  }
  if (validity.rangeUnderflow && field instanceof HTMLInputElement) {
    return `La valeur minimale autorisée est ${field.min}.`;
  }
  if (validity.rangeOverflow && field instanceof HTMLInputElement) {
    return `La valeur maximale autorisée est ${field.max}.`;
  }
  if (validity.tooShort && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    return `Veuillez saisir au moins ${field.minLength} caractères.`;
  }
  return 'Veuillez vérifier la saisie de ce champ.';
}

function clearFieldErrorDom(field: HTMLElement) {
  field.removeAttribute('aria-invalid');
  field.classList.remove('field-invalid-border');
  const container = field.closest('div');
  if (!container) return;
  const fieldName = field.getAttribute('name') || field.id || '';
  const existing = container.parentElement?.querySelector(
    `:scope > .js-field-error[data-for="${fieldName}"]`
  ) || container.querySelector(':scope > .js-field-error');
  if (existing) {
    existing.remove();
  }
}

function showFieldErrorDom(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  message: string
) {
  field.setAttribute('aria-invalid', 'true');
  field.classList.add('field-invalid-border');
  const targetWrapper =
    field.type === 'tel' && field.parentElement?.classList.contains('flex')
      ? field.parentElement.parentElement || field.parentElement
      : field.parentElement;
  if (!targetWrapper) return;

  let errEl = targetWrapper.querySelector(':scope > .js-field-error') as HTMLElement | null;
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className =
      'js-field-error mt-1.5 px-2.5 py-1 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[13px] font-semibold';
    errEl.setAttribute('role', 'alert');
    targetWrapper.appendChild(errEl);
  }
  errEl.textContent = message;
}

export const FormModal: React.FC<FormModalProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  onSubmit,
  submitLabel = 'Enregistrer',
  submitDisabled = false,
  isDirty,
  children,
  footerContent,
  hideFooter = false,
  cancelLabel = 'Annuler',
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialValuesRef = useRef<Map<Element, string>>(new Map());
  const hasUserEditedRef = useRef(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Snapshot initial field values on mount
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const map = new Map<Element, string>();
    const fields = bodyEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    );
    fields.forEach((field) => {
      if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        map.set(field, String(field.checked));
      } else {
        map.set(field, field.value);
      }
    });
    initialValuesRef.current = map;
  }, []);

  const checkHasFilledFields = useCallback((): boolean => {
    if (typeof isDirty === 'boolean' && isDirty) {
      return true;
    }
    const bodyEl = bodyRef.current;
    if (!bodyEl) return hasUserEditedRef.current;

    const fields = bodyEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    );
    for (const field of Array.from(fields)) {
      const initialVal = initialValuesRef.current.get(field);
      if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        if (initialVal !== undefined && String(field.checked) !== initialVal) {
          return true;
        }
        continue;
      }
      const currentVal = (field.value || '').trim();
      if (initialVal !== undefined) {
        if (field.value !== initialVal && currentVal !== '') {
          return true;
        }
      } else if (currentVal !== '') {
        return true;
      }
      if (
        (field instanceof HTMLTextAreaElement ||
          (field instanceof HTMLInputElement &&
            (field.type === 'text' ||
              field.type === 'email' ||
              field.type === 'tel' ||
              field.type === 'search'))) &&
        currentVal !== '' &&
        currentVal !== '+223' &&
        initialVal === ''
      ) {
        return true;
      }
    }
    return hasUserEditedRef.current;
  }, [isDirty]);

  const handleRequestClose = useCallback(() => {
    if (checkHasFilledFields()) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [checkHasFilledFields, onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showConfirmClose) {
          setShowConfirmClose(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRequestClose, showConfirmClose]);

  // Keep active field visible when mobile keyboard opens / resizes viewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleViewportResize = () => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        bodyRef.current &&
        bodyRef.current.contains(activeEl) &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')
      ) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, []);

  const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  const handleBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      if (target.type === 'hidden' || target.type === 'file') return;
      if (!target.checkValidity()) {
        showFieldErrorDom(target, getFrenchValidationMessage(target));
      } else {
        clearFieldErrorDom(target);
      }
    }
  };

  const handleInputCapture = (e: React.FormEvent<HTMLDivElement>) => {
    hasUserEditedRef.current = true;
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      if (target.checkValidity()) {
        clearFieldErrorDom(target);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const bodyEl = bodyRef.current;
    if (bodyEl) {
      const fields = bodyEl.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('input, textarea, select');
      let firstInvalid: HTMLElement | null = null;
      fields.forEach((field) => {
        if (field instanceof HTMLInputElement && (field.type === 'hidden' || field.type === 'file')) {
          return;
        }
        if (!field.checkValidity()) {
          showFieldErrorDom(field, getFrenchValidationMessage(field));
          if (!firstInvalid) firstInvalid = field;
        } else {
          clearFieldErrorDom(field);
        }
      });
      if (firstInvalid) {
        e.preventDefault();
        (firstInvalid as HTMLElement).focus();
        (firstInvalid as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    if (onSubmit) {
      onSubmit(e);
    } else {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      onClick={handleRequestClose}
      className="fixed inset-0 z-[100] bg-black/60 flex items-stretch justify-center md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        noValidate
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleFormSubmit}
        className="relative flex flex-col w-full h-[100dvh] max-h-[100dvh] md:h-auto md:max-h-[90dvh] md:max-w-[640px] bg-white dark:bg-[#0F172A] opacity-100 rounded-none md:rounded-2xl shadow-2xl md:border md:border-[#64748B] dark:md:border-[#94A3B8] overflow-hidden"
      >
        {/* En-tête fixe */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
          <div className="flex items-start md:items-center gap-2.5 min-w-0 flex-1">
            {icon && <div className="shrink-0 mt-0.5 md:mt-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] break-words leading-snug">
                {title}
              </h2>
              {subtitle && (
                <div className="text-xs text-[#475569] dark:text-[#CBD5E1] break-words leading-snug mt-0.5">
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            className="shrink-0 h-[40px] px-4 rounded-[12px] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] hover:bg-[#E2E8F0] dark:hover:bg-[#334155] font-semibold text-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marque-fonce)] dark:focus-visible:ring-[var(--marque-eclaircie)]"
          >
            {cancelLabel}
          </button>
        </div>

        {/* Corps défilant */}
        <div
          ref={bodyRef}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
          onChangeCapture={handleInputCapture}
          onInputCapture={handleInputCapture}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-6 py-5 space-y-5 text-sm bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC]"
        >
          {children}
        </div>

        {/* Pied fixe avec zone sûre */}
        {!hideFooter && (
          <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-4 md:px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {footerContent ? (
              footerContent
            ) : (
              <button
                type="submit"
                disabled={submitDisabled}
                className="w-full h-[48px] min-h-[48px] py-2.5 px-4 rounded-[12px] bg-[var(--marque-fonce)] hover:bg-[#00586B] active:bg-[#004A5A] text-[var(--marque-texte-sur-plein)] font-bold text-sm leading-tight text-center break-words shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marque-fonce)] dark:focus-visible:ring-[var(--marque-eclaircie)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitLabel}
              </button>
            )}
          </div>
        )}

        {/* Confirmation de fermeture si des champs sont remplis */}
        {showConfirmClose && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0F172A] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] p-5 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                Abandonner les modifications ?
              </h3>
              <p className="text-sm text-[#334155] dark:text-[#E2E8F0]">
                Des champs ont été remplis dans ce formulaire. Voulez-vous vraiment fermer et perdre votre saisie ?
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmClose(false)}
                  className="h-[44px] px-4 rounded-[12px] border-[1.5px] border-[#64748B] dark:border-[#94A3B8] bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] font-semibold text-sm hover:bg-[#E2E8F0] dark:hover:bg-[#334155] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marque-fonce)] dark:focus-visible:ring-[var(--marque-eclaircie)]"
                >
                  Continuer la saisie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmClose(false);
                    onClose();
                  }}
                  className="h-[44px] px-4 rounded-[12px] bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]"
                >
                  Abandonner
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
