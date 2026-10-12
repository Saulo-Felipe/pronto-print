import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { clampElementPosition } from '../../shared/print/document';
import { getImageCrop } from '../../shared/print/imageCrop';
import {
  getPositionAfterResize,
  projectVectorToElementAxes,
} from '../../shared/print/rotation';
import { colors } from '../../shared/theme/tokens';
import type { PrintImage, PrintPage } from '../../shared/types/print';
import { HighQualityImage } from './HighQualityImage';
import { getCoverImageLayout } from './imageLayout';
import { RotationHandle } from './RotationHandle';

type PrintImageElementProps = {
  element: PrintImage;
  grouped?: boolean;
  page: PrintPage;
  pageWidth: number;
  pageHeight: number;
  selected: boolean;
  onChange: (element: PrintImage) => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onLongPress: () => void;
  onSelect: () => void;
  onTap: () => void;
};

type ResizeDirection = {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
};

type ResizeHandleProps = {
  accessibilityLabel: string;
  direction: ResizeDirection;
  element: PrintImage;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
  positionStyle: object;
  onChange: (element: PrintImage) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
};

const MIN_IMAGE_SIZE_MM = 10;
const LONG_PRESS_DELAY_MS = 500;
const MOVE_THRESHOLD_PX = 4;
// Mantém as alças utilizáveis sem encobrir uma foto 3×4 inteira na prévia.
const HANDLE_TOUCH_SIZE = 24;

export function PrintImageElement({
  element,
  grouped = false,
  page,
  pageWidth,
  pageHeight,
  selected,
  onChange,
  onDragEnd,
  onDragStart,
  onLongPress,
  onSelect,
  onTap,
}: PrintImageElementProps) {
  const [previewRevision, setPreviewRevision] = useState(0);
  const startPosition = useRef({ xMm: element.xMm, yMm: element.yMm });
  const moved = useRef(false);
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapAction = useRef(onTap);
  const latestProps = useRef({
    element,
    onChange,
    onDragEnd,
    onDragStart,
    onLongPress,
    onSelect,
    onTap,
    page,
    pageHeight,
    pageWidth,
  });

  latestProps.current = {
    element,
    onChange,
    onDragEnd,
    onDragStart,
    onLongPress,
    onSelect,
    onTap,
    page,
    pageHeight,
    pageWidth,
  };

  const panResponder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const cancelLongPress = () => {
    if (longPressTimer.current === null) return;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => cancelLongPress, []);

  if (!panResponder.current) {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: (event) => {
        event.stopPropagation();
        const { element: currentElement, onDragStart: startDrag, onSelect: select } =
          latestProps.current;

        moved.current = false;
        longPressTriggered.current = false;
        tapAction.current = latestProps.current.onTap;
        startPosition.current = { xMm: currentElement.xMm, yMm: currentElement.yMm };
        startDrag();
        select();
        cancelLongPress();
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressTriggered.current = true;
          latestProps.current.onLongPress();
        }, LONG_PRESS_DELAY_MS);
      },
      onPanResponderMove: (_, gesture) => {
        if (
          Math.abs(gesture.dx) > MOVE_THRESHOLD_PX ||
          Math.abs(gesture.dy) > MOVE_THRESHOLD_PX
        ) {
          moved.current = true;
          cancelLongPress();
        }
        const {
          element: currentElement,
          onChange: changeElement,
          page: currentPage,
          pageHeight: currentPageHeight,
          pageWidth: currentPageWidth,
        } = latestProps.current;
        const nextPosition = clampElementPosition(
          startPosition.current.xMm + (gesture.dx / currentPageWidth) * currentPage.widthMm,
          startPosition.current.yMm + (gesture.dy / currentPageHeight) * currentPage.heightMm,
          currentElement,
          currentPage,
        );

        changeElement({ ...currentElement, ...nextPosition });
      },
      onPanResponderRelease: () => {
        cancelLongPress();
        if (!moved.current && !longPressTriggered.current) tapAction.current();
        latestProps.current.onDragEnd();
      },
      onPanResponderTerminate: () => {
        cancelLongPress();
        moved.current = false;
        latestProps.current.onDragEnd();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }

  const startResize = () => {
    latestProps.current.onDragStart();
    latestProps.current.onSelect();
  };

  const endResize = () => {
    setPreviewRevision((currentRevision) => currentRevision + 1);
    latestProps.current.onDragEnd();
  };

  const rotateElement = (rotationDeg: number) => {
    const current = latestProps.current;
    const rotatedElement = { ...current.element, rotationDeg };
    const position = clampElementPosition(
      rotatedElement.xMm,
      rotatedElement.yMm,
      rotatedElement,
      current.page,
    );

    current.onChange({ ...rotatedElement, ...position });
  };
  const renderedWidth = (element.widthMm / page.widthMm) * pageWidth;
  const renderedHeight = (element.heightMm / page.heightMm) * pageHeight;

  return (
    <>
      <View
        style={[
          styles.container,
          {
            left: (element.xMm / page.widthMm) * pageWidth,
            top: (element.yMm / page.heightMm) * pageHeight,
            width: renderedWidth,
            height: renderedHeight,
            transform: [{ rotate: `${element.rotationDeg}deg` }],
          },
          selected && styles.selectedContainer,
        ]}
      >
        <View
          accessibilityActions={[
            { name: 'activate', label: 'Selecionar imagem' },
            { name: 'longpress', label: 'Iniciar seleção múltipla' },
            { name: 'deselect', label: 'Remover da seleção múltipla' },
          ]}
          accessibilityHint="Toque para selecionar, arraste para mover ou mantenha pressionado para selecionar vários"
          accessibilityLabel="Foto na folha"
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'longpress') onLongPress();
            if (nativeEvent.actionName === 'activate') onSelect();
            if (nativeEvent.actionName === 'deselect') onTap();
          }}
          onAccessibilityTap={onSelect}
          style={styles.imageInteractionArea}
          {...panResponder.current.panHandlers}
        >
          <HighQualityImage
            key={`${element.sourceUri}-${previewRevision}`}
            resizeMode="cover"
            source={{
              height: element.sourceHeight,
              uri: element.sourceUri,
              width: element.sourceWidth,
            }}
            style={getCoverImageLayout(element, renderedWidth, renderedHeight)}
          />
        </View>
        {selected && <View pointerEvents="none" style={styles.selected} />}
        {selected &&
          !grouped &&
          resizeHandles.map(({ accessibilityLabel, direction, positionStyle }) => (
            <ResizeHandle
              accessibilityLabel={accessibilityLabel}
              direction={direction}
              element={element}
              key={`${direction.horizontal}-${direction.vertical}`}
              onChange={onChange}
              onResizeEnd={endResize}
              onResizeStart={startResize}
              page={page}
              pageHeight={pageHeight}
              pageWidth={pageWidth}
              positionStyle={positionStyle}
            />
          ))}
      </View>
      {selected && !grouped && (
        <RotationHandle
          elementHeightMm={element.heightMm}
          elementWidthMm={element.widthMm}
          elementXMm={element.xMm}
          elementYMm={element.yMm}
          onRotate={rotateElement}
          onRotateEnd={endResize}
          onRotateStart={startResize}
          page={page}
          pageHeight={pageHeight}
          pageWidth={pageWidth}
          rotationDeg={element.rotationDeg}
        />
      )}
    </>
  );
}

function ResizeHandle({
  accessibilityLabel,
  direction,
  element,
  page,
  pageHeight,
  pageWidth,
  positionStyle,
  onChange,
  onResizeEnd,
  onResizeStart,
}: ResizeHandleProps) {
  const startElement = useRef(element);
  const latestProps = useRef({
    direction,
    element,
    onChange,
    onResizeEnd,
    onResizeStart,
    page,
    pageHeight,
    pageWidth,
  });

  latestProps.current = {
    direction,
    element,
    onChange,
    onResizeEnd,
    onResizeStart,
    page,
    pageHeight,
    pageWidth,
  };

  const panResponder = useRef<ReturnType<typeof PanResponder.create> | null>(null);

  if (!panResponder.current) {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        event.stopPropagation();
        const { element: currentElement, onResizeStart: startResize } = latestProps.current;

        startElement.current = currentElement;
        startResize();
      },
      onPanResponderMove: (_, gesture) => {
        const {
          direction: currentDirection,
          onChange: changeElement,
          page: currentPage,
          pageHeight: currentPageHeight,
          pageWidth: currentPageWidth,
        } = latestProps.current;
        const initialElement = startElement.current;
        const pageDeltaXMm = (gesture.dx / currentPageWidth) * currentPage.widthMm;
        const pageDeltaYMm = (gesture.dy / currentPageHeight) * currentPage.heightMm;
        const localDelta = projectVectorToElementAxes(
          pageDeltaXMm,
          pageDeltaYMm,
          initialElement.rotationDeg,
        );
        const resizedElement = resizeElement(
          initialElement,
          currentPage,
          currentDirection,
          localDelta.x,
          localDelta.y,
        );
        const resizedPosition = getPositionAfterResize(
          initialElement,
          resizedElement.widthMm,
          resizedElement.heightMm,
          currentDirection,
        );
        const repositionedElement = { ...resizedElement, ...resizedPosition };
        const position = clampElementPosition(
          repositionedElement.xMm,
          repositionedElement.yMm,
          repositionedElement,
          currentPage,
        );

        changeElement({ ...repositionedElement, ...position });
      },
      onPanResponderRelease: (event) => {
        event.stopPropagation();
        latestProps.current.onResizeEnd();
      },
      onPanResponderTerminate: (event) => {
        event.stopPropagation();
        latestProps.current.onResizeEnd();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      pointerEvents="box-only"
      style={[styles.resizeHandle, positionStyle]}
      {...panResponder.current.panHandlers}
    >
      <View style={styles.resizeHandleIndicator} />
    </View>
  );
}

function resizeElement(
  element: PrintImage,
  page: PrintPage,
  direction: ResizeDirection,
  deltaXMm: number,
  deltaYMm: number,
): PrintImage {
  if (direction.horizontal !== 0 && direction.vertical !== 0) {
    return resizeElementProportionally(element, page, direction, deltaXMm, deltaYMm);
  }

  if (direction.horizontal !== 0) {
    return cropElementHorizontally(element, page, direction.horizontal, deltaXMm);
  }

  return cropElementVertically(element, page, direction.vertical, deltaYMm);
}

function cropElementHorizontally(
  element: PrintImage,
  page: PrintPage,
  direction: -1 | 1,
  deltaXMm: number,
) {
  const crop = getImageCrop(element);
  const cropRight = crop.x + crop.width;
  const maximumCropScale =
    direction === -1
      ? cropRight / crop.width
      : (1 - crop.x) / crop.width;
  const maximumWidthFromCropMm = element.widthMm * maximumCropScale;
  let xMm = element.xMm;
  let widthMm = element.widthMm;

  if (direction === -1) {
    const rightMm = element.xMm + element.widthMm;
    xMm = clamp(element.xMm + deltaXMm, 0, rightMm - MIN_IMAGE_SIZE_MM);
    widthMm = rightMm - xMm;
    widthMm = Math.min(widthMm, maximumWidthFromCropMm);
    xMm = rightMm - widthMm;
  } else {
    widthMm = clamp(
      element.widthMm + deltaXMm,
      MIN_IMAGE_SIZE_MM,
      Math.min(page.widthMm - element.xMm, maximumWidthFromCropMm),
    );
  }

  const cropWidth = crop.width * (widthMm / element.widthMm);

  return {
    ...element,
    crop: {
      ...crop,
      width: cropWidth,
      x: direction === -1 ? cropRight - cropWidth : crop.x,
    },
    widthMm,
    xMm,
  };
}

function cropElementVertically(
  element: PrintImage,
  page: PrintPage,
  direction: -1 | 0 | 1,
  deltaYMm: number,
) {
  if (direction === 0) return element;

  const crop = getImageCrop(element);
  const cropBottom = crop.y + crop.height;
  const maximumCropScale =
    direction === -1
      ? cropBottom / crop.height
      : (1 - crop.y) / crop.height;
  const maximumHeightFromCropMm = element.heightMm * maximumCropScale;
  let yMm = element.yMm;
  let heightMm = element.heightMm;

  if (direction === -1) {
    const bottomMm = element.yMm + element.heightMm;
    yMm = clamp(element.yMm + deltaYMm, 0, bottomMm - MIN_IMAGE_SIZE_MM);
    heightMm = bottomMm - yMm;
    heightMm = Math.min(heightMm, maximumHeightFromCropMm);
    yMm = bottomMm - heightMm;
  } else {
    heightMm = clamp(
      element.heightMm + deltaYMm,
      MIN_IMAGE_SIZE_MM,
      Math.min(page.heightMm - element.yMm, maximumHeightFromCropMm),
    );
  }

  const cropHeight = crop.height * (heightMm / element.heightMm);

  return {
    ...element,
    crop: {
      ...crop,
      height: cropHeight,
      y: direction === -1 ? cropBottom - cropHeight : crop.y,
    },
    yMm,
    heightMm,
  };
}

function resizeElementProportionally(
  element: PrintImage,
  page: PrintPage,
  direction: ResizeDirection,
  deltaXMm: number,
  deltaYMm: number,
): PrintImage {
  const { horizontal, vertical } = direction;
  const diagonalSquared = element.widthMm ** 2 + element.heightMm ** 2;
  const scaleDelta =
    (horizontal * deltaXMm * element.widthMm +
      vertical * deltaYMm * element.heightMm) /
    diagonalSquared;
  const minimumScale = Math.max(
    MIN_IMAGE_SIZE_MM / element.widthMm,
    MIN_IMAGE_SIZE_MM / element.heightMm,
  );
  const maximumWidthMm =
    horizontal === -1 ? element.xMm + element.widthMm : page.widthMm - element.xMm;
  const maximumHeightMm =
    vertical === -1 ? element.yMm + element.heightMm : page.heightMm - element.yMm;
  const maximumScale = Math.min(
    maximumWidthMm / element.widthMm,
    maximumHeightMm / element.heightMm,
  );
  const scale = clamp(1 + scaleDelta, minimumScale, maximumScale);
  const widthMm = element.widthMm * scale;
  const heightMm = element.heightMm * scale;

  return {
    ...element,
    xMm: horizontal === -1 ? element.xMm + element.widthMm - widthMm : element.xMm,
    yMm: vertical === -1 ? element.yMm + element.heightMm - heightMm : element.yMm,
    widthMm,
    heightMm,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  container: { position: 'absolute' },
  selectedContainer: { zIndex: 1 },
  selected: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: colors.blue,
  },
  imageInteractionArea: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  resizeHandle: {
    position: 'absolute',
    zIndex: 2,
    width: HANDLE_TOUCH_SIZE,
    height: HANDLE_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleIndicator: {
    width: 11,
    height: 11,
    borderWidth: 2,
    borderColor: colors.blue,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  topLeftHandle: { left: -HANDLE_TOUCH_SIZE / 2, top: -HANDLE_TOUCH_SIZE / 2 },
  topHandle: { left: '50%', top: -HANDLE_TOUCH_SIZE / 2, marginLeft: -HANDLE_TOUCH_SIZE / 2 },
  topRightHandle: { right: -HANDLE_TOUCH_SIZE / 2, top: -HANDLE_TOUCH_SIZE / 2 },
  rightHandle: { right: -HANDLE_TOUCH_SIZE / 2, top: '50%', marginTop: -HANDLE_TOUCH_SIZE / 2 },
  bottomRightHandle: { right: -HANDLE_TOUCH_SIZE / 2, bottom: -HANDLE_TOUCH_SIZE / 2 },
  bottomHandle: {
    left: '50%',
    bottom: -HANDLE_TOUCH_SIZE / 2,
    marginLeft: -HANDLE_TOUCH_SIZE / 2,
  },
  bottomLeftHandle: { left: -HANDLE_TOUCH_SIZE / 2, bottom: -HANDLE_TOUCH_SIZE / 2 },
  leftHandle: { left: -HANDLE_TOUCH_SIZE / 2, top: '50%', marginTop: -HANDLE_TOUCH_SIZE / 2 },
});

const resizeHandles: Array<{
  accessibilityLabel: string;
  direction: ResizeDirection;
  positionStyle: object;
}> = [
  {
    accessibilityLabel: 'Redimensionar pelo canto superior esquerdo',
    direction: { horizontal: -1, vertical: -1 },
    positionStyle: styles.topLeftHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pela lateral superior',
    direction: { horizontal: 0, vertical: -1 },
    positionStyle: styles.topHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pelo canto superior direito',
    direction: { horizontal: 1, vertical: -1 },
    positionStyle: styles.topRightHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pela lateral direita',
    direction: { horizontal: 1, vertical: 0 },
    positionStyle: styles.rightHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pelo canto inferior direito',
    direction: { horizontal: 1, vertical: 1 },
    positionStyle: styles.bottomRightHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pela lateral inferior',
    direction: { horizontal: 0, vertical: 1 },
    positionStyle: styles.bottomHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pelo canto inferior esquerdo',
    direction: { horizontal: -1, vertical: 1 },
    positionStyle: styles.bottomLeftHandle,
  },
  {
    accessibilityLabel: 'Redimensionar pela lateral esquerda',
    direction: { horizontal: -1, vertical: 0 },
    positionStyle: styles.leftHandle,
  },
];
