import React, { useState } from 'react';
import { Sprout } from 'lucide-react';

export interface BaobabLogoProps {
  /**
   * Pre-configured sizing variants matching specifications:
   * - 'login': 64px
   * - 'header': 32px
   * - 'sidebar': ~40px
   * - 'invoice': ~56px
   * - 'receipt': ~48px
   * - 'splash': ~72px
   */
  variant?: 'login' | 'header' | 'sidebar' | 'invoice' | 'receipt' | 'splash' | 'custom';
  size?: number; // custom explicit size in pixels
  showTextOnPC?: boolean; // display "Baobab" next to it on PC screens (used in header)
  className?: string;
  logoUrl?: string; // override URL from settings / identity
}

export const BaobabLogo: React.FC<BaobabLogoProps> = ({
  variant = 'custom',
  size,
  showTextOnPC = false,
  className = '',
  logoUrl = '/logo.png',
}) => {
  const [hasError, setHasError] = useState(false);

  // Compute dimensions based on requirements
  let pxSize = 32;
  if (size) {
    pxSize = size;
  } else {
    switch (variant) {
      case 'login':
        pxSize = 96; // 96 px on login
        break;
      case 'header':
        pxSize = 32; // strictly 32 px on header
        break;
      case 'sidebar':
        pxSize = 40;
        break;
      case 'invoice':
        pxSize = 60;
        break;
      case 'receipt':
        pxSize = 48;
        break;
      case 'splash':
        pxSize = 144;
        break;
      default:
        pxSize = 32;
    }
  }

  // Primary image source fallback order: logoUrl -> /logo.png -> /public/assets/aistudio/logo-symbole_7c51c64a.png
  const src = logoUrl || '/logo.png';

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* 
        Logo Image Container:
        - object-fit contain without distortion
        - In dark theme: adds a light crisp background (dark:bg-white/95 dark:p-1 dark:rounded-lg) 
          so the dark/black elements of the Baobab logo remain perfectly visible against dark backgrounds.
      */}
      {!hasError ? (
        <div
          className={`relative shrink-0 flex items-center justify-center transition-all duration-200 ${
            variant === 'splash'
              ? 'bg-transparent'
              : 'dark:bg-white/95 dark:p-1 dark:rounded-xl dark:shadow-xs'
          }`}
          style={{ width: `${pxSize}px`, height: `${pxSize}px` }}
        >
          <img
            src={src}
            alt="Baobab Distribution Logo"
            onError={() => setHasError(true)}
            className="w-full h-full object-contain select-none"
            style={{
              maxHeight: `${pxSize}px`,
              maxWidth: `${pxSize}px`,
              objectFit: 'contain',
            }}
          />
        </div>
      ) : (
        /* Fallback if file is absent or fails to load: displays stylized "Baobab" text */
        <div
          className="shrink-0 flex items-center justify-center rounded-xl bg-[#1d94b2]/10 dark:bg-sky-950/60 border border-[#1d94b2]/30 dark:border-sky-800 px-2 py-1 text-[#1d94b2] dark:text-sky-300 font-extrabold tracking-tight"
          style={{ minHeight: `${pxSize}px` }}
          title="Fichier logo absent - affichage du texte Baobab"
        >
          <Sprout className="w-4 h-4 mr-1 text-[#1d94b2] dark:text-sky-400" />
          <span style={{ fontSize: `${Math.max(12, Math.floor(pxSize * 0.4))}px` }}>
            Baobab
          </span>
        </div>
      )}

      {/* When showTextOnPC is enabled (e.g. in Header): display "Baobab" next to it on Tablet & PC */}
      {showTextOnPC && (
        <div className="hidden md:flex flex-col whitespace-nowrap">
          <span className="font-bold text-base lg:text-lg leading-tight tracking-tight text-slate-900 dark:text-white">
            Baobab
          </span>
          <span className="text-[9px] lg:text-[10px] uppercase font-semibold tracking-wider text-[#1d94b2] dark:text-sky-400 -mt-0.5">
            Distribution
          </span>
        </div>
      )}
    </div>
  );
};
