import type { PrintTextFontFamily } from '../types/print';

export const TEXT_FONT_OPTIONS = [
  { family: 'system', heavy: false, label: 'Padrão', sample: 'Texto padrão' },
  { family: 'impact', heavy: true, label: 'Impacto', sample: 'TÍTULO FORTE' },
  { family: 'black', heavy: true, label: 'Black', sample: 'TEXTO PESADO' },
  { family: 'rounded', heavy: true, label: 'Arredondada', sample: 'DESTAQUE SUAVE' },
] as const satisfies ReadonlyArray<{
  family: PrintTextFontFamily;
  heavy: boolean;
  label: string;
  sample: string;
}>;

export function isHeavyTextFont(fontFamily: PrintTextFontFamily) {
  return TEXT_FONT_OPTIONS.some(({ family, heavy }) => family === fontFamily && heavy);
}
