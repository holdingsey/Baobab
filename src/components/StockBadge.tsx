import React from 'react';

export type StockStatusType = 'surstock' | 'stock_bas' | 'rupture' | 'normal';

export interface StockBadgeProps {
  stock: number;
  threshold?: number;
  statusOverride?: StockStatusType;
  className?: string;
}

export const getStockStatusConfig = (stock: number, threshold = 80): {
  type: StockStatusType;
  label: string;
  bgColor: string;
  textColor: string;
} => {
  // Risque de rupture : rouge #B91C1C texte blanc
  if (stock <= Math.max(10, threshold * 0.4)) {
    return {
      type: 'rupture',
      label: 'Risque de rupture',
      bgColor: '#B91C1C',
      textColor: '#FFFFFF',
    };
  }
  // Stock bas : marron #92400E texte blanc
  if (stock <= threshold) {
    return {
      type: 'stock_bas',
      label: 'Stock bas',
      bgColor: '#92400E',
      textColor: '#FFFFFF',
    };
  }
  // Surstock : gris #E2E8F0 texte noir
  if (stock >= threshold * 8) {
    return {
      type: 'surstock',
      label: 'Surstock',
      bgColor: '#E2E8F0',
      textColor: '#000000',
    };
  }
  // Niveau normal : vert #15803D texte blanc
  return {
    type: 'normal',
    label: 'Niveau normal',
    bgColor: '#15803D',
    textColor: '#FFFFFF',
  };
};

export const StockBadge: React.FC<StockBadgeProps> = ({
  stock,
  threshold = 80,
  statusOverride,
  className = '',
}) => {
  const config = getStockStatusConfig(stock, threshold);

  let bg = config.bgColor;
  let text = config.textColor;
  let label = config.label;

  if (statusOverride) {
    switch (statusOverride) {
      case 'surstock':
        bg = '#E2E8F0';
        text = '#000000';
        label = 'Surstock';
        break;
      case 'stock_bas':
        bg = '#92400E';
        text = '#FFFFFF';
        label = 'Stock bas';
        break;
      case 'rupture':
        bg = '#B91C1C';
        text = '#FFFFFF';
        label = 'Risque de rupture';
        break;
      case 'normal':
        bg = '#15803D';
        text = '#FFFFFF';
        label = 'Niveau normal';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
};
