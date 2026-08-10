export const A4_PAGE = Object.freeze({
  widthMm: 210,
  heightMm: 297,
  orientation: 'portrait' as const,
});

export const PHOTO_3X4 = Object.freeze({
  widthMm: 30,
  heightMm: 40,
});

export const PRINT_LIMITS = Object.freeze({
  maxImagesPerDocument: 30,
  gapMm: 4,
  marginMm: 5,
});
