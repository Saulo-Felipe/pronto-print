import { getElementBounds, getElementsBounds } from './document';
import type { PrintElement, PrintPage } from '../types/print';

export type AlignmentGuides = {
  horizontalMm?: number;
  verticalMm?: number;
};

type AlignmentTolerance = {
  xMm: number;
  yMm: number;
};

type AlignmentResult = {
  elements: PrintElement[];
  guides: AlignmentGuides;
};

export function snapElementsToAlignment(
  movingElements: PrintElement[],
  otherElements: PrintElement[],
  page: PrintPage,
  tolerance: AlignmentTolerance,
): AlignmentResult {
  const movingBounds = getElementsBounds(movingElements);
  if (!movingBounds) return { elements: movingElements, guides: {} };

  const movingHorizontalAnchors = [
    movingBounds.left,
    (movingBounds.left + movingBounds.right) / 2,
    movingBounds.right,
  ];
  const movingVerticalAnchors = [
    movingBounds.top,
    (movingBounds.top + movingBounds.bottom) / 2,
    movingBounds.bottom,
  ];
  const horizontalTargets = [0, page.widthMm / 2, page.widthMm];
  const verticalTargets = [0, page.heightMm / 2, page.heightMm];

  for (const element of otherElements) {
    const bounds = getElementBounds(element);
    horizontalTargets.push(bounds.left, (bounds.left + bounds.right) / 2, bounds.right);
    verticalTargets.push(bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom);
  }

  const horizontalSnap = findClosestSnap(
    movingHorizontalAnchors,
    horizontalTargets,
    tolerance.xMm,
  );
  const verticalSnap = findClosestSnap(movingVerticalAnchors, verticalTargets, tolerance.yMm);
  const deltaX = horizontalSnap?.delta ?? 0;
  const deltaY = verticalSnap?.delta ?? 0;

  return {
    elements: movingElements.map((element) => ({
      ...element,
      xMm: element.xMm + deltaX,
      yMm: element.yMm + deltaY,
    })),
    guides: {
      horizontalMm: verticalSnap?.target,
      verticalMm: horizontalSnap?.target,
    },
  };
}

type Snap = {
  delta: number;
  target: number;
};

function findClosestSnap(movingAnchors: number[], targets: number[], tolerance: number) {
  let closest: Snap | undefined;

  for (const movingAnchor of movingAnchors) {
    for (const target of targets) {
      const delta = target - movingAnchor;
      if (Math.abs(delta) > tolerance) continue;
      if (closest && Math.abs(closest.delta) <= Math.abs(delta)) continue;
      closest = { delta, target };
    }
  }

  return closest;
}
