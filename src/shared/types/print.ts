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
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
};

export type PrintElement = PrintImage | PrintText;

export type PrintDocument = {
  page: PrintPage;
  elements: PrintElement[];
};
