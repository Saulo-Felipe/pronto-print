import type { PrintImage } from '../types/print';

export const FULL_IMAGE_CROP: PrintImage['crop'] = {
  height: 1,
  width: 1,
  x: 0,
  y: 0,
};

export function getImageCrop(image: Pick<PrintImage, 'crop'>): PrintImage['crop'] {
  return image.crop ?? FULL_IMAGE_CROP;
}
