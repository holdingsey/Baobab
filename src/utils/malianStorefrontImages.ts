// Catalogue d'images réelles de devantures de boutiques (Bamako, Mali / Afrique de l'Ouest)
// Utilisé comme image de profil et photo de devanture pour tous les PDV (validés et non validés)

export const REAL_STOREFRONT_PHOTOS: string[] = [
  '/uploads/boutique-devanture-01.jpg',
  '/uploads/boutique-devanture-02.jpg',
  '/uploads/boutique-devanture-03.jpg',
  '/uploads/boutique-devanture-04.jpg',
  '/uploads/boutique-devanture-05.jpg',
  '/uploads/boutique-devanture-06.jpg',
  '/uploads/boutique-devanture-07.jpg',
  '/uploads/boutique-devanture-08.jpg',
  '/uploads/boutique-devanture-09.jpg',
  '/uploads/boutique-devanture-10.jpg',
  '/uploads/boutique-devanture-11.jpg',
  '/uploads/boutique-devanture-12.jpg',
  '/uploads/boutique-devanture-13.jpg',
  '/uploads/boutique-devanture-14.jpg',
  '/uploads/boutique-devanture-15.jpg',
  '/uploads/boutique-devanture-16.jpg',
];

export function getRealStorefrontPhotoForPdv(pdv: {
  id?: string;
  code?: string;
  name?: string;
  neighborhood?: string;
}): string {
  const idStr = String(pdv?.id || '');
  const match = idStr.match(/(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1) {
      const idx = (num - 1) % REAL_STOREFRONT_PHOTOS.length;
      return REAL_STOREFRONT_PHOTOS[idx];
    }
  }

  const seedStr = `${pdv?.code || ''}-${pdv?.name || ''}-${pdv?.neighborhood || ''}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return REAL_STOREFRONT_PHOTOS[hash % REAL_STOREFRONT_PHOTOS.length];
}

export function getPdvStorefrontImageUrl(pdv: any): string {
  if (!pdv) return REAL_STOREFRONT_PHOTOS[0];
  if (typeof pdv.photo_url === 'string' && pdv.photo_url.trim().length > 0) {
    const trimmed = pdv.photo_url.trim();
    // Si l'URL enregistrée était une ancienne illustration SVG, la remplacer par la vraie photo de devanture
    if (!trimmed.endsWith('.svg') && !trimmed.startsWith('data:image/svg+xml')) {
      return trimmed;
    }
  }
  return getRealStorefrontPhotoForPdv(pdv);
}
