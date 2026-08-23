import type { ComponentType } from 'react';
import { Image, type ImageProps } from 'react-native';

type NativeImageProps = ImageProps & {
  // Suportado pelo componente nativo do RN 0.81, mas ausente em Image.d.ts.
  resizeMultiplier?: number;
};

const NativeImage = Image as unknown as ComponentType<NativeImageProps>;
const PREVIEW_RESIZE_MULTIPLIER = 3;

export function HighQualityImage(props: ImageProps) {
  return (
    <NativeImage
      {...props}
      resizeMethod="resize"
      resizeMultiplier={PREVIEW_RESIZE_MULTIPLIER}
    />
  );
}
