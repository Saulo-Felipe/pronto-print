import type { ImageStyle } from 'react-native';

import type { PrintImage } from '../../shared/types/print';
import { getImageCrop } from '../../shared/print/imageCrop';

export function getCoverImageLayout(
  image: PrintImage,
  containerWidth: number,
  containerHeight: number,
): ImageStyle {
  const crop = getImageCrop(image);

  return {
    height: containerHeight / crop.height,
    left: -(crop.x * containerWidth) / crop.width,
    position: 'absolute',
    top: -(crop.y * containerHeight) / crop.height,
    width: containerWidth / crop.width,
  };
}
