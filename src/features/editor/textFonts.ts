import { Platform } from 'react-native';

import type { PrintText, PrintTextFontFamily } from '../../shared/types/print';

export function resolveEditorFontFamily(fontFamily: PrintTextFontFamily) {
  const platformFonts: Record<PrintTextFontFamily, { android: string; ios: string } | null> = {
    black: { android: 'sans-serif-black', ios: 'Arial Black' },
    impact: { android: 'sans-serif-condensed', ios: 'Impact' },
    monospace: { android: 'monospace', ios: 'Courier' },
    rounded: { android: 'sans-serif', ios: 'Arial Rounded MT Bold' },
    serif: { android: 'serif', ios: 'Times New Roman' },
    system: null,
  };
  const selectedFont = platformFonts[fontFamily];

  return selectedFont ? Platform.select(selectedFont) : undefined;
}

export function resolveEditorVerticalAlignment(
  verticalAlign: PrintText['verticalAlign'],
): 'flex-start' | 'center' | 'flex-end' {
  const alignments: Record<
    PrintText['verticalAlign'],
    'flex-start' | 'center' | 'flex-end'
  > = {
    bottom: 'flex-end',
    center: 'center',
    top: 'flex-start',
  };

  return alignments[verticalAlign];
}
