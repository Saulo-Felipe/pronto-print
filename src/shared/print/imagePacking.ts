import { A4_PAGE, PRINT_LIMITS } from './constants';
import {
  arrangeFittedImageSelectionCopies,
  arrangeImageSelectionCopies,
  getImageMultiplicationLimit,
} from './document';
import { getImageCrop } from './imageCrop';
import { normalizeRotation } from './rotation';
import type { PrintImage, PrintPage } from '../types/print';

type Rectangle = { x: number; y: number; width: number; height: number };
type Placement = Rectangle & { index: number; rotationDeg: number };
const EPSILON = 1e-8;

// Empacota as caixas das fotos; as áreas livres podem se sobrepor, as fotos não.
function pack(
  sources: PrintImage[],
  quantity: number,
  page: PrintPage,
  scale: number,
  gap: number,
  strategy: number,
): Placement[] {
  let free: Rectangle[] = [{
    x: 0, y: 0,
    width: page.widthMm - 2 * PRINT_LIMITS.marginMm + gap,
    height: page.heightMm - 2 * PRINT_LIMITS.marginMm + gap,
  }];
  const placements: Placement[] = [];
  for (let index = 0; index < quantity; index++) {
    const source = sources[index % sources.length];
    let best: (Placement & { score: number }) | undefined;
    for (const space of free) {
      for (const rotationDeg of [0, 90]) {
        const width = (rotationDeg === 0 ? source.widthMm : source.heightMm) * scale + gap;
        const height = (rotationDeg === 0 ? source.heightMm : source.widthMm) * scale + gap;
        if (width > space.width + EPSILON || height > space.height + EPSILON) continue;
        const remainingWidth = space.width - width;
        const remainingHeight = space.height - height;
        const score = strategy === 0
          ? Math.min(remainingWidth, remainingHeight)
          : strategy === 1
            ? space.width * space.height - width * height
            : space.y * page.widthMm + space.x + remainingHeight;
        if (!best || score < best.score) best = { x: space.x, y: space.y, width, height, index, rotationDeg, score };
      }
    }
    if (!best) break;
    const placed = best;
    placements.push(placed);
    const split: Rectangle[] = [];
    for (const space of free) {
      const right = space.x + space.width;
      const bottom = space.y + space.height;
      const placedRight = placed.x + placed.width;
      const placedBottom = placed.y + placed.height;
      if (placed.x >= right - EPSILON || placedRight <= space.x + EPSILON ||
          placed.y >= bottom - EPSILON || placedBottom <= space.y + EPSILON) {
        split.push(space);
        continue;
      }
      if (placed.x > space.x + EPSILON) split.push({ ...space, width: placed.x - space.x });
      if (placedRight < right - EPSILON) split.push({ ...space, x: placedRight, width: right - placedRight });
      if (placed.y > space.y + EPSILON) split.push({ ...space, height: placed.y - space.y });
      if (placedBottom < bottom - EPSILON) split.push({ ...space, y: placedBottom, height: bottom - placedBottom });
    }
    free = split.filter((space, i) => !split.some((other, j) =>
      i !== j && other.x <= space.x + EPSILON && other.y <= space.y + EPSILON &&
      other.x + other.width >= space.x + space.width - EPSILON &&
      other.y + other.height >= space.y + space.height - EPSILON &&
      (j < i || other.width * other.height > space.width * space.height + EPSILON),
    ));
  }
  return placements;
}

function bestPacking(sources: PrintImage[], quantity: number, page: PrintPage, scale: number, gap: number) {
  let best: Placement[] = [];
  for (let strategy = 0; strategy < 3; strategy++) {
    const result = pack(sources, quantity, page, scale, gap, strategy);
    if (result.length > best.length) best = result;
    if (best.length === quantity) break;
  }
  return best;
}

export function getPackedImageMultiplicationLimit(sources: PrintImage[], page: PrintPage = A4_PAGE) {
  if (!sources.length) return 0;
  const smallestArea = Math.min(...sources.map(source => source.widthMm * source.heightMm));
  if (!(smallestArea > 0)) return getImageMultiplicationLimit(sources, page);
  const availableArea = (page.widthMm - 2 * PRINT_LIMITS.marginMm) * (page.heightMm - 2 * PRINT_LIMITS.marginMm);
  const upperBound = Math.max(1, Math.floor(availableArea / smallestArea));
  return Math.max(getImageMultiplicationLimit(sources, page), bestPacking(sources, upperBound, page, 1, PRINT_LIMITS.gapMm).length);
}

export function arrangePackedImageCopies(
  sources: PrintImage[],
  requestedQuantity: number,
  page: PrintPage = A4_PAGE,
  automaticFit = false,
  seed = 1,
): PrintImage[] {
  if (!sources.length) return [];
  const normalized = Math.floor(requestedQuantity);
  const quantity = Math.min(
    Number.isSafeInteger(normalized) ? Math.max(1, normalized) : 1,
    automaticFit ? Infinity : getPackedImageMultiplicationLimit(sources, page),
  );
  const fallback = automaticFit
    ? arrangeFittedImageSelectionCopies(sources, quantity, page)
    : arrangeImageSelectionCopies(sources, quantity, page);
  const gap = automaticFit
    ? Math.min(PRINT_LIMITS.gapMm, Math.min(page.widthMm, page.heightMm) * 0.12 / Math.max(1, Math.ceil(Math.sqrt(quantity)) - 1))
    : PRINT_LIMITS.gapMm;
  let scale = 1;
  let placements = bestPacking(sources, quantity, page, scale, gap);
  if (automaticFit) {
    let lower = 0;
    let upper = Math.min(
      (page.widthMm - 2 * PRINT_LIMITS.marginMm) / Math.min(sources[0].widthMm, sources[0].heightMm),
      (page.heightMm - 2 * PRINT_LIMITS.marginMm) / Math.min(sources[0].widthMm, sources[0].heightMm),
    );
    for (let iteration = 0; iteration < 18; iteration++) {
      const candidateScale = (lower + upper) / 2;
      const candidate = bestPacking(sources, quantity, page, candidateScale, gap);
      if (candidate.length === quantity) {
        lower = candidateScale;
        placements = candidate;
      } else upper = candidateScale;
    }
    scale = lower;
  }
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const mirrorX = random() < 0.5;
  const mirrorY = random() < 0.5;
  const fallbackScale = fallback[0].widthMm / sources[0].widthMm;
  if (placements.length !== quantity || (automaticFit && scale < fallbackScale)) {
    return fallback.map((image, index) => ({
      ...image,
      id: `packed-${seed}-${index}`,
      xMm: mirrorX ? page.widthMm - image.xMm - image.widthMm : image.xMm,
      yMm: mirrorY ? page.heightMm - image.yMm - image.heightMm : image.yMm,
      rotationDeg: normalizeRotation(image.rotationDeg + (random() < 0.5 ? 180 : 0)),
    }));
  }
  return placements.map(placement => {
    const source = sources[placement.index % sources.length];
    const widthMm = source.widthMm * scale;
    const heightMm = source.heightMm * scale;
    const boxWidth = placement.width - gap;
    const boxHeight = placement.height - gap;
    const left = mirrorX ? page.widthMm - PRINT_LIMITS.marginMm - placement.x - boxWidth : PRINT_LIMITS.marginMm + placement.x;
    const top = mirrorY ? page.heightMm - PRINT_LIMITS.marginMm - placement.y - boxHeight : PRINT_LIMITS.marginMm + placement.y;
    return {
      ...source,
      id: `packed-${seed}-${placement.index}`,
      crop: { ...getImageCrop(source) },
      rotationDeg: placement.rotationDeg + (random() < 0.5 ? 180 : 0),
      widthMm, heightMm,
      xMm: left + (boxWidth - widthMm) / 2,
      yMm: top + (boxHeight - heightMm) / 2,
    };
  });
}
