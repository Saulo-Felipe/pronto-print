import {
  ClipOp,
  FontWeight,
  ImageFormat,
  Skia,
  TextAlign,
} from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { PrintDocument, PrintImage, PrintText } from '../types/print';
import { isHeavyTextFont } from './fonts';
import { getImageCrop } from './imageCrop';

export type PrintExportFormat = 'pdf' | 'png';

const MILLIMETERS_PER_INCH = 25.4;
const PDF_POINTS_PER_INCH = 72;
const PNG_DPI = 300;
const PDF_IMAGE_DPI = 300;
const PDF_IMAGE_COMPRESSION = 0.85;
const PNG_MIME_TYPE = 'image/png';
const PDF_MIME_TYPE = 'application/pdf';

export async function printDocument(document: PrintDocument) {
  const uri = await createPdf(document);
  await Print.printAsync({ uri });
}

export async function downloadDocument(
  document: PrintDocument,
  format: PrintExportFormat,
) {
  const uri = format === 'pdf' ? await createPdf(document) : await createPng(document);
  const sharingAvailable = await Sharing.isAvailableAsync();

  if (!sharingAvailable) {
    throw new Error('O salvamento de arquivos não está disponível neste dispositivo.');
  }

  await Sharing.shareAsync(uri, {
    dialogTitle: `Salvar documento em ${format.toUpperCase()}`,
    mimeType: format === 'pdf' ? PDF_MIME_TYPE : PNG_MIME_TYPE,
    UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.png',
  });
}

async function createPdf(document: PrintDocument) {
  const html = await createPrintHtml(document);
  const firstPage = document.pages[0];
  if (!firstPage) throw new Error('O documento não possui páginas para exportar.');
  const width = millimetersToPoints(firstPage.page.widthMm);
  const height = millimetersToPoints(firstPage.page.heightMm);
  const result = await Print.printToFileAsync({
    height,
    html,
    margins: { bottom: 0, left: 0, right: 0, top: 0 },
    width,
  });
  const file = createCacheFile('pdf');
  file.write(await new File(result.uri).bytes());

  return file.uri;
}

async function createPrintHtml(document: PrintDocument) {
  const optimizedImages = new Map<string, string>();
  const pages: string[] = [];

  for (const documentPage of document.pages) {
    const elements: string[] = [];
    for (const element of documentPage.elements) {
      if (element.kind === 'text') {
        elements.push(createTextHtml(element));
        continue;
      }

      const optimization = createPdfImageOptimization(element);
      let source = optimizedImages.get(optimization.cacheKey);
      if (!source) {
        source = await createOptimizedImageDataUri(element, optimization);
        optimizedImages.set(optimization.cacheKey, source);
      }

      elements.push(
        `<img alt="" src="${source}" style="${createPositionStyle(element)}object-fit:fill;" />`,
      );
    }

    pages.push(`<main class="page">${elements.join('')}</main>`);
  }

  const firstPage = document.pages[0];
  if (!firstPage) throw new Error('O documento não possui páginas para exportar.');
  const { heightMm, widthMm } = firstPage.page;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: ${widthMm}mm; margin: 0; padding: 0; }
      body { background: #fff; }
      .page { position: relative; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .text { display: flex; align-items: center; overflow: hidden; white-space: pre-wrap; overflow-wrap: break-word; }
      .text > span { width: 100%; }
    </style>
  </head>
  <body>${pages.join('')}</body>
</html>`;
}

function createTextHtml(element: PrintText) {
  const fontFamily = {
    monospace: 'monospace',
    serif: 'serif',
    system: 'sans-serif',
    impact: "Impact,'Arial Narrow',sans-serif",
    black: "'Arial Black','Helvetica Neue',sans-serif",
    rounded: "'Arial Rounded MT Bold','Trebuchet MS',sans-serif",
  }[element.fontFamily];
  const fontWeight = isHeavyTextFont(element.fontFamily) ? 900 : element.fontWeight;
  const verticalAlignment = {
    bottom: 'flex-end',
    center: 'center',
    top: 'flex-start',
  }[element.verticalAlign];

  return `<div class="text" style="${createPositionStyle(element)}align-items:${verticalAlignment};color:${element.color};font-family:${fontFamily};font-size:${element.fontSizePt}pt;font-weight:${fontWeight};letter-spacing:${element.letterSpacingPt}pt;line-height:${element.lineHeightMultiplier};text-align:${element.textAlign};"><span>${escapeHtml(element.text)}</span></div>`;
}

function createPositionStyle(
  element: Pick<
    PrintImage | PrintText,
    'heightMm' | 'rotationDeg' | 'widthMm' | 'xMm' | 'yMm'
  >,
) {
  return `position:absolute;left:${element.xMm}mm;top:${element.yMm}mm;width:${element.widthMm}mm;height:${element.heightMm}mm;transform:rotate(${element.rotationDeg}deg);transform-origin:center center;`;
}

type PdfImageOptimization = {
  cacheKey: string;
  crop: { height: number; originX: number; originY: number; width: number };
  height: number;
  width: number;
};

function createPdfImageOptimization(element: PrintImage): PdfImageOptimization {
  const crop = createIntegerCrop(element);
  const requestedWidth = millimetersToPixels(element.widthMm, PDF_IMAGE_DPI);
  const requestedHeight = millimetersToPixels(element.heightMm, PDF_IMAGE_DPI);
  const scale = Math.min(1, requestedWidth / crop.width, requestedHeight / crop.height);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));

  return {
    cacheKey: [element.sourceUri, crop.originX, crop.originY, crop.width, crop.height, width, height].join(
      ':',
    ),
    crop,
    height,
    width,
  };
}

async function createOptimizedImageDataUri(
  element: PrintImage,
  optimization: PdfImageOptimization,
) {
  const output = getPdfImageOutput(element.sourceUri);
  const context = ImageManipulator.manipulate(element.sourceUri).crop(optimization.crop);
  if (
    optimization.width !== optimization.crop.width ||
    optimization.height !== optimization.crop.height
  ) {
    context.resize({ height: optimization.height, width: optimization.width });
  }

  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    base64: true,
    compress: PDF_IMAGE_COMPRESSION,
    format: output.format,
  });

  if (!result.base64) throw new Error('Não foi possível preparar uma das imagens para o PDF.');

  try {
    new File(result.uri).delete();
  } catch {
    // O sistema operacional também pode limpar arquivos temporários do cache.
  }

  return `data:${output.mimeType};base64,${result.base64}`;
}

function getPdfImageOutput(sourceUri: string) {
  const sourceType = new File(sourceUri).type.toLowerCase();
  const normalizedUri = sourceUri.toLowerCase();
  const mayHaveTransparency =
    sourceType.includes('png') ||
    sourceType.includes('webp') ||
    normalizedUri.includes('.png') ||
    normalizedUri.includes('.webp');

  return mayHaveTransparency
    ? { format: SaveFormat.PNG, mimeType: 'image/png' as const }
    : { format: SaveFormat.JPEG, mimeType: 'image/jpeg' as const };
}

async function createPng(document: PrintDocument) {
  if (document.pages.length !== 1) {
    throw new Error('A exportação em PNG está disponível apenas para documentos com uma página.');
  }

  const documentPage = document.pages[0];
  const pixelsPerMillimeter = PNG_DPI / MILLIMETERS_PER_INCH;
  const width = Math.round(documentPage.page.widthMm * pixelsPerMillimeter);
  const height = Math.round(documentPage.page.heightMm * pixelsPerMillimeter);
  const surface = Skia.Surface.MakeOffscreen(width, height);

  if (!surface) throw new Error('Não foi possível preparar a imagem para exportação.');

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#FFFFFF'));

  for (const element of documentPage.elements) {
    if (element.kind === 'image') {
      await drawImageElement(element, pixelsPerMillimeter, canvas);
    } else {
      drawTextElement(element, pixelsPerMillimeter, canvas);
    }
  }

  surface.flush();
  const image = surface.makeImageSnapshot();
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  const file = createCacheFile('png');
  file.write(bytes);

  return file.uri;
}

async function drawImageElement(
  element: PrintImage,
  scale: number,
  canvas: SkCanvas,
) {
  const bytes = await new File(element.sourceUri).bytes();
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('Uma das imagens da folha não pôde ser processada.');

  const destination = Skia.XYWHRect(
    element.xMm * scale,
    element.yMm * scale,
    element.widthMm * scale,
    element.heightMm * scale,
  );
  const source = createCropSourceRect(image.width(), image.height(), element);

  canvas.save();
  canvas.rotate(
    element.rotationDeg,
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
  );
  canvas.drawImageRect(image, source, destination, Skia.Paint());
  canvas.restore();
}

function drawTextElement(
  element: PrintText,
  scale: number,
  canvas: SkCanvas,
) {
  const x = element.xMm * scale;
  const y = element.yMm * scale;
  const width = element.widthMm * scale;
  const height = element.heightMm * scale;
  const fontFamilies = {
    monospace: ['monospace'],
    serif: ['serif'],
    system: ['sans-serif'],
    impact: ['Impact', 'sans-serif-condensed', 'sans-serif'],
    black: ['Arial Black', 'sans-serif-black', 'sans-serif'],
    rounded: ['Arial Rounded MT Bold', 'sans-serif'],
  }[element.fontFamily];
  const paragraph = Skia.ParagraphBuilder.Make({
    textAlign: getSkiaTextAlign(element.textAlign),
  })
    .pushStyle({
      color: Skia.Color(element.color),
      fontFamilies,
      fontSize: (element.fontSizePt / PDF_POINTS_PER_INCH) * PNG_DPI,
      letterSpacing: (element.letterSpacingPt / PDF_POINTS_PER_INCH) * PNG_DPI,
      fontStyle: {
        weight: isHeavyTextFont(element.fontFamily)
          ? FontWeight.Black
          : element.fontWeight === 'bold'
            ? FontWeight.Bold
            : FontWeight.Normal,
      },
      heightMultiplier: element.lineHeightMultiplier,
    })
    .addText(element.text)
    .build();

  paragraph.layout(width);
  const availableVerticalSpace = Math.max(0, height - paragraph.getHeight());
  const textY =
    y +
    {
      bottom: availableVerticalSpace,
      center: availableVerticalSpace / 2,
      top: 0,
    }[element.verticalAlign];
  canvas.save();
  canvas.rotate(element.rotationDeg, x + width / 2, y + height / 2);
  canvas.clipRect(Skia.XYWHRect(x, y, width, height), ClipOp.Intersect, true);
  paragraph.paint(canvas, x, textY);
  canvas.restore();
}

function createCropSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  element: PrintImage,
) {
  const crop = getImageCrop(element);

  return Skia.XYWHRect(
    crop.x * sourceWidth,
    crop.y * sourceHeight,
    crop.width * sourceWidth,
    crop.height * sourceHeight,
  );
}

function createIntegerCrop(element: PrintImage) {
  const source = createCropSourceRect(element.sourceWidth, element.sourceHeight, element);
  const width = Math.max(1, Math.min(element.sourceWidth, Math.round(source.width)));
  const height = Math.max(1, Math.min(element.sourceHeight, Math.round(source.height)));

  return {
    originX: Math.max(0, Math.min(element.sourceWidth - width, Math.round(source.x))),
    originY: Math.max(0, Math.min(element.sourceHeight - height, Math.round(source.y))),
    width,
    height,
  };
}

function getSkiaTextAlign(textAlign: PrintText['textAlign']) {
  const alignments: Record<PrintText['textAlign'], TextAlign> = {
    center: TextAlign.Center,
    left: TextAlign.Left,
    right: TextAlign.Right,
  };

  return alignments[textAlign];
}

function createCacheFile(extension: PrintExportFormat) {
  const file = new File(Paths.cache, `prontoprint-${Date.now()}.${extension}`);
  file.create({ overwrite: true });
  return file;
}

function millimetersToPoints(valueMm: number) {
  return (valueMm / MILLIMETERS_PER_INCH) * PDF_POINTS_PER_INCH;
}

function millimetersToPixels(valueMm: number, dpi: number) {
  return Math.max(1, Math.round((valueMm / MILLIMETERS_PER_INCH) * dpi));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
