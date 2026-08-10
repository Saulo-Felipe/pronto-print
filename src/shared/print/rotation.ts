const DEGREES_IN_CIRCLE = 360;

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function normalizeRotation(degrees: number) {
  return ((degrees % DEGREES_IN_CIRCLE) + DEGREES_IN_CIRCLE) % DEGREES_IN_CIRCLE;
}

export function getRotatedSize(width: number, height: number, rotationDeg: number) {
  const radians = degreesToRadians(rotationDeg);
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));

  return {
    width: width * cosine + height * sine,
    height: width * sine + height * cosine,
  };
}

export function projectVectorToElementAxes(
  x: number,
  y: number,
  rotationDeg: number,
) {
  const radians = degreesToRadians(rotationDeg);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: x * cosine + y * sine,
    y: -x * sine + y * cosine,
  };
}

export function getPositionAfterResize(
  element: {
    heightMm: number;
    rotationDeg: number;
    widthMm: number;
    xMm: number;
    yMm: number;
  },
  resizedWidthMm: number,
  resizedHeightMm: number,
  direction: { horizontal: -1 | 0 | 1; vertical: -1 | 0 | 1 },
) {
  const localCenterShiftX =
    (direction.horizontal * (resizedWidthMm - element.widthMm)) / 2;
  const localCenterShiftY =
    (direction.vertical * (resizedHeightMm - element.heightMm)) / 2;
  const radians = degreesToRadians(element.rotationDeg);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const pageCenterShiftX = localCenterShiftX * cosine - localCenterShiftY * sine;
  const pageCenterShiftY = localCenterShiftX * sine + localCenterShiftY * cosine;
  const centerX = element.xMm + element.widthMm / 2 + pageCenterShiftX;
  const centerY = element.yMm + element.heightMm / 2 + pageCenterShiftY;

  return {
    xMm: centerX - resizedWidthMm / 2,
    yMm: centerY - resizedHeightMm / 2,
  };
}
