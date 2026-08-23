export type LocalImage = {
  uri: string;
  width: number;
  height: number;
};

export type PrintPage = {
  widthMm: number;
  heightMm: number;
  orientation: 'portrait' | 'landscape';
};

export type PrintImage = {
  kind: 'image';
  id: string;
  sourceGroupId: string;
  sourceUri: string;
  sourceWidth: number;
  sourceHeight: number;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
};

export type PrintTextFontFamily =
  | 'system'
  | 'serif'
  | 'monospace'
  | 'impact'
  | 'black'
  | 'rounded';

export type PrintText = {
  kind: 'text';
  id: string;
  text: string;
  autoSize: boolean;
  fontSizePt: number;
  color: string;
  fontFamily: PrintTextFontFamily;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'center' | 'bottom';
  lineHeightMultiplier: number;
  letterSpacingPt: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
};

export type PrintElement = PrintImage | PrintText;

export type PrintDocumentPage = {
  id: string;
  page: PrintPage;
  elements: PrintElement[];
};

export type PrintDocument = {
  pages: PrintDocumentPage[];
};
