import React from 'react';

export function formatCompactNumber(value: number): string {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    const formatted = (num / 1_000_000_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${formatted.replace(',0', '')} Md`;
  }
  if (abs >= 1_000_000) {
    const formatted = (num / 1_000_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${formatted.replace(',0', '')} M`;
  }
  return num.toLocaleString('fr-FR');
}

interface AdaptiveAmountProps {
  amount: number;
  unit?: string;
  unitClassName?: string;
  className?: string;
  compactThreshold?: number;
}

export const AdaptiveAmount: React.FC<AdaptiveAmountProps> = ({
  amount,
  unit = 'FCFA',
  unitClassName = 'text-[10px] font-bold',
  className = '',
  compactThreshold = 1_000_000,
}) => {
  const num = Number(amount) || 0;
  const fullFormatted = `${num.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`;
  const isCompact = Math.abs(num) >= compactThreshold;
  const displayValue = isCompact ? formatCompactNumber(num) : num.toLocaleString('fr-FR');

  return (
    <span
      className={`baobab-amount inline-flex items-baseline gap-1 whitespace-nowrap max-w-full ${className}`}
      title={fullFormatted}
    >
      <span>{displayValue}</span>
      {unit && <span className={unitClassName}>{unit}</span>}
    </span>
  );
};
