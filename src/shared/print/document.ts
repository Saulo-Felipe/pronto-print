import { A4_PAGE, PHOTO_3X4, PRINT_LIMITS } from './constants';
import type {
  LocalImage,
  PrintDocument,
  PrintDocumentPage,
  PrintElement,
  PrintImage,
  PrintPage,
  PrintText,
} from '../types/print';
import { getRotatedSize, normalizeRotation } from './rotation';
import { FULL_IMAGE_CROP, getImageCrop } from './imageCrop';

export type ElementBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

const createId = (index: number) => `photo-${Date.now()}-${index}`;
const DEFAULT_IMAGE_SIZE_MM = 58;
const DEFAULT_TEXT = 'Digite seu texto';
const DEFAULT_TEXT_FONT_SIZE_PT = 28;
const DEFAULT_TEXT_WIDTH_MM = 78;

export const createEmptyPage = (page: PrintPage = A4_PAGE): PrintDocumentPage => ({
  id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  page,
  elements: [],
});

export const createEmptyDocument = (): PrintDocument => ({
  pages: [createEmptyPage()],
});

const createPageWithImages = (images: LocalImage[]): PrintDocumentPage => ({
  id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  page: A4_PAGE,
  elements: createImageElements(images, A4_PAGE),
});

const fitImage = (image: LocalImage, maxWidthMm: number, maxHeightMm: number) => {
  const safeWidth = Math.max(1, image.width);
  const safeHeight = Math.max(1, image.height);
  const scale = Math.min(maxWidthMm / safeWidth, maxHeightMm / safeHeight);

  return { widthMm: safeWidth * scale, heightMm: safeHeight * scale };
};

const createImageElements = (images: LocalImage[], page: PrintPage): PrintImage[] => {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(images.length)));
  const rowCount = Math.max(1, Math.ceil(images.length / columnCount));
  const availableWidthMm = page.widthMm - PRINT_LIMITS.marginMm * 2;
  const availableHeightMm = page.heightMm - PRINT_LIMITS.marginMm * 2;
  const cellWidthMm = availableWidthMm / columnCount;
  const cellHeightMm = availableHeightMm / rowCount;

  return images.map((image, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const size = fitImage(
      image,
      Math.min(DEFAULT_IMAGE_SIZE_MM, cellWidthMm - PRINT_LIMITS.gapMm),
      Math.min(DEFAULT_IMAGE_SIZE_MM, cellHeightMm - PRINT_LIMITS.gapMm),
    );

    const id = createId(index);

    return {
      kind: 'image' as const,
      id,
      sourceGroupId: id,
      sourceUri: image.uri,
      sourceWidth: image.width,
      sourceHeight: image.height,
      crop: { ...FULL_IMAGE_CROP },
      xMm: PRINT_LIMITS.marginMm + column * cellWidthMm + (cellWidthMm - size.widthMm) / 2,
      yMm: PRINT_LIMITS.marginMm + row * cellHeightMm + (cellHeightMm - size.heightMm) / 2,
      rotationDeg: 0,
      ...size,
    };
  });
};

export const createImageDocument = (images: LocalImage[]): PrintDocument => ({
  pages: [createPageWithImages(images)],
});

export const appendImagesToPage = (
  document: PrintDocumentPage,
  images: LocalImage[],
): PrintDocumentPage => ({
  ...document,
  elements: [...document.elements, ...createImageElements(images, document.page)],
});

export const bringElementToFront = (
  document: PrintDocumentPage,
  elementId: string,
): PrintDocumentPage => {
  const elementIndex = document.elements.findIndex(({ id }) => id === elementId);
  if (elementIndex < 0 || elementIndex === document.elements.length - 1) return document;

  const selectedElement = document.elements[elementIndex];

  return {
    ...document,
    elements: [
      ...document.elements.slice(0, elementIndex),
      ...document.elements.slice(elementIndex + 1),
      selectedElement,
    ],
  };
};

export const updateElementInPage = (
  document: PrintDocumentPage,
  changedElement: PrintElement,
  bringToFrontOnOverlap = false,
): PrintDocumentPage => {
  const elements = document.elements.map((element) =>
    element.id === changedElement.id ? changedElement : element,
  );
  const changedDocument = { ...document, elements };
  const overlapsAnotherElement = elements.some(
    (element) => element.id !== changedElement.id && elementsOverlap(changedElement, element),
  );

  return bringToFrontOnOverlap && overlapsAnotherElement
    ? bringElementToFront(changedDocument, changedElement.id)
    : changedDocument;
};

function elementsOverlap(first: PrintElement, second: PrintElement) {
  const firstBounds = getElementBounds(first);
  const secondBounds = getElementBounds(second);

  return (
    firstBounds.left < secondBounds.right &&
    firstBounds.right > secondBounds.left &&
    firstBounds.top < secondBounds.bottom &&
    firstBounds.bottom > secondBounds.top
  );
}

export function getElementBounds(element: PrintElement): ElementBounds {
  const rotatedSize = getRotatedSize(element.widthMm, element.heightMm, element.rotationDeg);
  const centerX = element.xMm + element.widthMm / 2;
  const centerY = element.yMm + element.heightMm / 2;

  return {
    left: centerX - rotatedSize.width / 2,
    right: centerX + rotatedSize.width / 2,
    top: centerY - rotatedSize.height / 2,
    bottom: centerY + rotatedSize.height / 2,
  };
}

export function getElementsBounds(elements: PrintElement[]): ElementBounds | null {
  if (elements.length === 0) return null;

  return elements.reduce<ElementBounds>((groupBounds, element) => {
    const bounds = getElementBounds(element);

    return {
      left: Math.min(groupBounds.left, bounds.left),
      right: Math.max(groupBounds.right, bounds.right),
      top: Math.min(groupBounds.top, bounds.top),
      bottom: Math.max(groupBounds.bottom, bounds.bottom),
    };
  }, getElementBounds(elements[0]));
}

export function translateElementsAsGroup(
  elements: PrintElement[],
  deltaXMm: number,
  deltaYMm: number,
  page: PrintPage,
) {
  return fitElementGroupWithinPage(
    elements.map((element) => ({
      ...element,
      xMm: element.xMm + deltaXMm,
      yMm: element.yMm + deltaYMm,
    })),
    page,
  );
}

export function scaleElementsAsGroup(
  elements: PrintElement[],
  requestedScale: number,
  anchor: { xMm: number; yMm: number },
  page: PrintPage,
) {
  const bounds = getElementsBounds(elements);
  if (!bounds) return elements;

  const groupWidth = Math.max(Number.EPSILON, bounds.right - bounds.left);
  const groupHeight = Math.max(Number.EPSILON, bounds.bottom - bounds.top);
  const maximumScale = Math.min(page.widthMm / groupWidth, page.heightMm / groupHeight);
  const scale = Math.min(maximumScale, Math.max(0.1, requestedScale));
  const scaledElements = elements.map((element) => {
    const centerX = element.xMm + element.widthMm / 2;
    const centerY = element.yMm + element.heightMm / 2;
    const widthMm = element.widthMm * scale;
    const heightMm = element.heightMm * scale;
    const scaledCenterX = anchor.xMm + (centerX - anchor.xMm) * scale;
    const scaledCenterY = anchor.yMm + (centerY - anchor.yMm) * scale;

    return {
      ...element,
      ...(element.kind === 'text' ? { autoSize: false } : {}),
      xMm: scaledCenterX - widthMm / 2,
      yMm: scaledCenterY - heightMm / 2,
      widthMm,
      heightMm,
    };
  });

  return fitElementGroupWithinPage(scaledElements, page);
}

export function rotateElementsAsGroup(
  elements: PrintElement[],
  rotationDeltaDeg: number,
  page: PrintPage,
) {
  const bounds = getElementsBounds(elements);
  if (!bounds) return elements;

  const groupCenterX = (bounds.left + bounds.right) / 2;
  const groupCenterY = (bounds.top + bounds.bottom) / 2;
  const radians = (rotationDeltaDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatedElements = elements.map((element) => {
    const centerX = element.xMm + element.widthMm / 2;
    const centerY = element.yMm + element.heightMm / 2;
    const relativeX = centerX - groupCenterX;
    const relativeY = centerY - groupCenterY;
    const rotatedCenterX = groupCenterX + relativeX * cosine - relativeY * sine;
    const rotatedCenterY = groupCenterY + relativeX * sine + relativeY * cosine;

    return {
      ...element,
      rotationDeg: normalizeRotation(element.rotationDeg + rotationDeltaDeg),
      xMm: rotatedCenterX - element.widthMm / 2,
      yMm: rotatedCenterY - element.heightMm / 2,
    };
  });

  return fitElementGroupWithinPage(rotatedElements, page);
}

function fitElementGroupWithinPage(elements: PrintElement[], page: PrintPage) {
  const bounds = getElementsBounds(elements);
  if (!bounds) return elements;

  const groupWidth = bounds.right - bounds.left;
  const groupHeight = bounds.bottom - bounds.top;
  const deltaX =
    groupWidth > page.widthMm
      ? page.widthMm / 2 - (bounds.left + bounds.right) / 2
      : bounds.left < 0
        ? -bounds.left
        : bounds.right > page.widthMm
          ? page.widthMm - bounds.right
          : 0;
  const deltaY =
    groupHeight > page.heightMm
      ? page.heightMm / 2 - (bounds.top + bounds.bottom) / 2
      : bounds.top < 0
        ? -bounds.top
        : bounds.bottom > page.heightMm
          ? page.heightMm - bounds.bottom
          : 0;

  if (deltaX === 0 && deltaY === 0) return elements;

  return elements.map((element) => ({
    ...element,
    xMm: element.xMm + deltaX,
    yMm: element.yMm + deltaY,
  }));
}

export const createTextElement = (page: PrintPage, index: number): PrintText => ({
  kind: 'text',
  id: `text-${Date.now()}-${index}`,
  text: DEFAULT_TEXT,
  autoSize: true,
  fontSizePt: DEFAULT_TEXT_FONT_SIZE_PT,
  color: '#17243B',
  fontFamily: 'system',
  fontWeight: 'normal',
  textAlign: 'left',
  verticalAlign: 'center',
  lineHeightMultiplier: 1.2,
  letterSpacingPt: 0,
  rotationDeg: 0,
  xMm: (page.widthMm - DEFAULT_TEXT_WIDTH_MM) / 2,
  yMm: (page.heightMm - 26) / 2,
  widthMm: DEFAULT_TEXT_WIDTH_MM,
  heightMm: 26,
});

export const arrangeImageCopies = (
  source: PrintImage,
  requestedQuantity: number,
  page: PrintPage = A4_PAGE,
): PrintImage[] => arrangeImageSelectionCopies([source], requestedQuantity, page);

const getLargestRotatedImageSize = (sources: PrintImage[]) =>
  sources
    .map((source) => getRotatedSize(source.widthMm, source.heightMm, source.rotationDeg))
    .reduce(
      (largest, size) => ({
        width: Math.max(largest.width, size.width),
        height: Math.max(largest.height, size.height),
      }),
      { width: 0, height: 0 },
    );

const getFixedSizeGridCapacity = (sources: PrintImage[], page: PrintPage) => {
  const availableWidth = page.widthMm - PRINT_LIMITS.marginMm * 2;
  const availableHeight = page.heightMm - PRINT_LIMITS.marginMm * 2;
  const slotSize = getLargestRotatedImageSize(sources);
  const columns = Math.max(
    1,
    Math.floor((availableWidth + PRINT_LIMITS.gapMm) / (slotSize.width + PRINT_LIMITS.gapMm)),
  );
  const rows = Math.max(
    1,
    Math.floor((availableHeight + PRINT_LIMITS.gapMm) / (slotSize.height + PRINT_LIMITS.gapMm)),
  );

  return { columns, rows, slotSize };
};

export const getImageMultiplicationLimit = (
  sources: PrintImage[],
  page: PrintPage = A4_PAGE,
) => {
  if (sources.length === 0) return 0;

  const { columns, rows } = getFixedSizeGridCapacity(sources, page);
  return columns * rows;
};

export const arrangeImageSelectionCopies = (
  sources: PrintImage[],
  requestedQuantity: number,
  page: PrintPage = A4_PAGE,
): PrintImage[] => {
  if (sources.length === 0) return [];

  const normalizedQuantity = Math.floor(requestedQuantity);
  const { columns: maximumColumns, rows: maximumRows, slotSize } =
    getFixedSizeGridCapacity(sources, page);
  const maximumQuantity = maximumColumns * maximumRows;
  const quantity = Number.isSafeInteger(normalizedQuantity)
    ? Math.min(maximumQuantity, Math.max(1, normalizedQuantity))
    : 1;
  const pageAspectRatio = page.widthMm / page.heightMm;
  let layout = { columns: 1, rows: quantity, score: Number.POSITIVE_INFINITY };

  for (let columns = 1; columns <= Math.min(maximumColumns, quantity); columns += 1) {
    const rows = Math.ceil(quantity / columns);
    if (rows > maximumRows) continue;

    const gridWidth = columns * slotSize.width + (columns - 1) * PRINT_LIMITS.gapMm;
    const gridHeight = rows * slotSize.height + (rows - 1) * PRINT_LIMITS.gapMm;
    const score = Math.abs(gridWidth / gridHeight - pageAspectRatio);

    if (score < layout.score) layout = { columns, rows, score };
  }

  const { columns, rows } = layout;
  const gapMm = PRINT_LIMITS.gapMm;
  const groupHeight = rows * slotSize.height + (rows - 1) * gapMm;
  const startY = Math.max(PRINT_LIMITS.marginMm, (page.heightMm - groupHeight) / 2);

  return Array.from({ length: quantity }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, quantity - row * columns);
    const rowWidth = itemsInRow * slotSize.width + (itemsInRow - 1) * gapMm;
    const rowStartX = (page.widthMm - rowWidth) / 2;
    const slotX = rowStartX + column * (slotSize.width + gapMm);
    const slotY = startY + row * (slotSize.height + gapMm);
    const source = sources[index % sources.length];

    return {
      kind: 'image',
      id: createId(index),
      sourceGroupId: source.sourceGroupId,
      sourceUri: source.sourceUri,
      sourceWidth: source.sourceWidth,
      sourceHeight: source.sourceHeight,
      crop: { ...getImageCrop(source) },
      rotationDeg: source.rotationDeg,
      xMm: slotX + (slotSize.width - source.widthMm) / 2,
      yMm: slotY + (slotSize.height - source.heightMm) / 2,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
    };
  });
};

type FittedGridLayout = {
  columns: number;
  rows: number;
  gapMm: number;
  scale: number;
  slotWidthMm: number;
  slotHeightMm: number;
};

const getAdaptiveGridGap = (
  columns: number,
  rows: number,
  availableWidthMm: number,
  availableHeightMm: number,
) => {
  const horizontalGap =
    columns > 1 ? (availableWidthMm * 0.12) / (columns - 1) : PRINT_LIMITS.gapMm;
  const verticalGap =
    rows > 1 ? (availableHeightMm * 0.12) / (rows - 1) : PRINT_LIMITS.gapMm;

  return Math.min(PRINT_LIMITS.gapMm, horizontalGap, verticalGap);
};

const getFittedGridLayout = (
  sources: PrintImage[],
  quantity: number,
  page: PrintPage,
): FittedGridLayout => {
  const availableWidthMm = page.widthMm - PRINT_LIMITS.marginMm * 2;
  const availableHeightMm = page.heightMm - PRINT_LIMITS.marginMm * 2;
  const sourceSlot = getLargestRotatedImageSize(sources);
  const idealColumns = Math.sqrt(
    (quantity * availableWidthMm * sourceSlot.height) /
      (availableHeightMm * sourceSlot.width),
  );
  const candidateColumns = new Set<number>([1, quantity]);

  for (let offset = -4; offset <= 4; offset += 1) {
    candidateColumns.add(Math.max(1, Math.min(quantity, Math.round(idealColumns) + offset)));
  }

  let bestLayout: FittedGridLayout | null = null;

  candidateColumns.forEach((columns) => {
    const rows = Math.ceil(quantity / columns);
    const gapMm = getAdaptiveGridGap(
      columns,
      rows,
      availableWidthMm,
      availableHeightMm,
    );
    const cellWidthMm = (availableWidthMm - (columns - 1) * gapMm) / columns;
    const cellHeightMm = (availableHeightMm - (rows - 1) * gapMm) / rows;
    const scale = Math.min(cellWidthMm / sourceSlot.width, cellHeightMm / sourceSlot.height);

    if (!bestLayout || scale > bestLayout.scale) {
      bestLayout = {
        columns,
        rows,
        gapMm,
        scale,
        slotWidthMm: sourceSlot.width * scale,
        slotHeightMm: sourceSlot.height * scale,
      };
    }
  });

  return bestLayout!;
};

export const arrangeFittedImageSelectionCopies = (
  sources: PrintImage[],
  requestedQuantity: number,
  page: PrintPage = A4_PAGE,
): PrintImage[] => {
  if (sources.length === 0) return [];

  const normalizedQuantity = Math.floor(requestedQuantity);
  const quantity = Number.isSafeInteger(normalizedQuantity)
    ? Math.max(1, normalizedQuantity)
    : 1;
  const { columns, rows, gapMm, scale, slotWidthMm, slotHeightMm } =
    getFittedGridLayout(sources, quantity, page);
  const groupHeightMm = rows * slotHeightMm + (rows - 1) * gapMm;
  const startYMm = (page.heightMm - groupHeightMm) / 2;

  return Array.from({ length: quantity }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, quantity - row * columns);
    const rowWidthMm = itemsInRow * slotWidthMm + (itemsInRow - 1) * gapMm;
    const rowStartXMm = (page.widthMm - rowWidthMm) / 2;
    const slotCenterXMm = rowStartXMm + column * (slotWidthMm + gapMm) + slotWidthMm / 2;
    const slotCenterYMm = startYMm + row * (slotHeightMm + gapMm) + slotHeightMm / 2;
    const source = sources[index % sources.length];
    const widthMm = source.widthMm * scale;
    const heightMm = source.heightMm * scale;

    return {
      kind: 'image',
      id: createId(index),
      sourceGroupId: source.sourceGroupId,
      sourceUri: source.sourceUri,
      sourceWidth: source.sourceWidth,
      sourceHeight: source.sourceHeight,
      crop: { ...getImageCrop(source) },
      rotationDeg: source.rotationDeg,
      xMm: slotCenterXMm - widthMm / 2,
      yMm: slotCenterYMm - heightMm / 2,
      widthMm,
      heightMm,
    };
  });
};

export const togglePageOrientation = (document: PrintDocumentPage): PrintDocumentPage => {
  const orientation = document.page.orientation === 'portrait' ? 'landscape' : 'portrait';
  const page: PrintPage = {
    widthMm: orientation === 'portrait' ? A4_PAGE.widthMm : A4_PAGE.heightMm,
    heightMm: orientation === 'portrait' ? A4_PAGE.heightMm : A4_PAGE.widthMm,
    orientation,
  };

  return {
    ...document,
    page,
    elements: document.elements.map((element) => fitElementWithinPage(element, page)),
  };
};

const fitElementWithinPage = (element: PrintElement, page: PrintPage): PrintElement => {
  const fittedElement =
    element.kind === 'image'
      ? fitPrintImageWithinPage(element, page)
      : {
          ...element,
          widthMm: Math.min(element.widthMm, page.widthMm),
          heightMm: Math.min(element.heightMm, page.heightMm),
        };
  const position = clampElementPosition(
    fittedElement.xMm,
    fittedElement.yMm,
    fittedElement,
    page,
  );

  return { ...fittedElement, ...position };
};

const fitPrintImageWithinPage = (image: PrintImage, page: PrintPage): PrintImage => {
  const scale = Math.min(1, page.widthMm / image.widthMm, page.heightMm / image.heightMm);

  return {
    ...image,
    widthMm: image.widthMm * scale,
    heightMm: image.heightMm * scale,
  };
};

export const applyPhotoCrop = (
  document: PrintDocumentPage,
  elementId: string,
  croppedImage: LocalImage,
  sourceGroupId = elementId,
): PrintDocumentPage => ({
  ...document,
  elements: document.elements.map((element) => {
    if (element.id !== elementId || element.kind !== 'image') return element;

    const centerX = element.xMm + element.widthMm / 2;
    const centerY = element.yMm + element.heightMm / 2;
    const resizedElement = {
      ...element,
      sourceGroupId,
      sourceUri: croppedImage.uri,
      sourceWidth: croppedImage.width,
      sourceHeight: croppedImage.height,
      crop: { ...FULL_IMAGE_CROP },
      widthMm: PHOTO_3X4.widthMm,
      heightMm: PHOTO_3X4.heightMm,
    };
    const position = clampElementPosition(
      centerX - PHOTO_3X4.widthMm / 2,
      centerY - PHOTO_3X4.heightMm / 2,
      resizedElement,
      document.page,
    );

    return { ...resizedElement, ...position };
  }),
});

export function clampElementPosition(
  xMm: number,
  yMm: number,
  element: Pick<PrintElement, 'widthMm' | 'heightMm'> & { rotationDeg?: number },
  page: PrintPage = A4_PAGE,
): Pick<PrintElement, 'xMm' | 'yMm'> {
  const rotatedSize = getRotatedSize(
    element.widthMm,
    element.heightMm,
    element.rotationDeg ?? 0,
  );
  const minimumCenterX = Math.max(element.widthMm, rotatedSize.width) / 2;
  const maximumCenterX = page.widthMm - minimumCenterX;
  const minimumCenterY = Math.max(element.heightMm, rotatedSize.height) / 2;
  const maximumCenterY = page.heightMm - minimumCenterY;
  const centerX = xMm + element.widthMm / 2;
  const centerY = yMm + element.heightMm / 2;
  const constrainedCenterX =
    minimumCenterX > maximumCenterX
      ? page.widthMm / 2
      : Math.min(maximumCenterX, Math.max(minimumCenterX, centerX));
  const constrainedCenterY =
    minimumCenterY > maximumCenterY
      ? page.heightMm / 2
      : Math.min(maximumCenterY, Math.max(minimumCenterY, centerY));

  return {
    xMm: constrainedCenterX - element.widthMm / 2,
    yMm: constrainedCenterY - element.heightMm / 2,
  };
}
