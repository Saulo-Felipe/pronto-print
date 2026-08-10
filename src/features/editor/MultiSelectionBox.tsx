import { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import {
  getElementsBounds,
  rotateElementsAsGroup,
  scaleElementsAsGroup,
} from '../../shared/print/document';
import { colors } from '../../shared/theme/tokens';
import type { PrintElement, PrintPage } from '../../shared/types/print';
import { RotationHandle } from './RotationHandle';

type ResizeDirection = {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
};

type MultiSelectionBoxProps = {
  elements: PrintElement[];
  onChange: (elements: PrintElement[]) => void;
  onTransformEnd: () => void;
  onTransformStart: () => void;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
};

type GroupResizeHandleProps = MultiSelectionBoxProps & {
  direction: ResizeDirection;
  position: { x: number; y: number };
};

const HANDLE_TOUCH_SIZE = 44;

export function MultiSelectionBox({
  elements,
  onChange,
  onTransformEnd,
  onTransformStart,
  page,
  pageHeight,
  pageWidth,
}: MultiSelectionBoxProps) {
  const bounds = getElementsBounds(elements);
  const transformStartElements = useRef(elements);
  if (!bounds) return null;

  const left = (bounds.left / page.widthMm) * pageWidth;
  const top = (bounds.top / page.heightMm) * pageHeight;
  const width = ((bounds.right - bounds.left) / page.widthMm) * pageWidth;
  const height = ((bounds.bottom - bounds.top) / page.heightMm) * pageHeight;
  const startTransform = () => {
    transformStartElements.current = elements;
    onTransformStart();
  };

  return (
    <>
      <View
        accessibilityLabel={`${elements.length} ${elements.length === 1 ? 'elemento selecionado' : 'elementos selecionados'}`}
        pointerEvents="none"
        style={[styles.selectionBox, { height, left, top, width }]}
      >
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>Seleção múltipla · {elements.length}</Text>
        </View>
      </View>

      {resizeDirections.map((direction) => (
        <GroupResizeHandle
          direction={direction}
          elements={elements}
          key={`${direction.horizontal}-${direction.vertical}`}
          onChange={onChange}
          onTransformEnd={onTransformEnd}
          onTransformStart={onTransformStart}
          page={page}
          pageHeight={pageHeight}
          pageWidth={pageWidth}
          position={{
            x: left + ((direction.horizontal + 1) / 2) * width,
            y: top + ((direction.vertical + 1) / 2) * height,
          }}
        />
      ))}

      <RotationHandle
        elementHeightMm={bounds.bottom - bounds.top}
        elementWidthMm={bounds.right - bounds.left}
        elementXMm={bounds.left}
        elementYMm={bounds.top}
        onRotate={(rotationDeltaDeg) =>
          onChange(
            rotateElementsAsGroup(
              transformStartElements.current,
              rotationDeltaDeg,
              page,
            ),
          )
        }
        onRotateEnd={onTransformEnd}
        onRotateStart={startTransform}
        page={page}
        pageHeight={pageHeight}
        pageWidth={pageWidth}
        rotationDeg={0}
      />
    </>
  );
}

function GroupResizeHandle({
  direction,
  elements,
  onChange,
  onTransformEnd,
  onTransformStart,
  page,
  pageHeight,
  pageWidth,
  position,
}: GroupResizeHandleProps) {
  const startElements = useRef(elements);
  const startBounds = useRef(getElementsBounds(elements));
  const latestProps = useRef({
    direction,
    elements,
    onChange,
    onTransformEnd,
    onTransformStart,
    page,
    pageHeight,
    pageWidth,
  });

  latestProps.current = {
    direction,
    elements,
    onChange,
    onTransformEnd,
    onTransformStart,
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
        const current = latestProps.current;
        startElements.current = current.elements;
        startBounds.current = getElementsBounds(current.elements);
        current.onTransformStart();
      },
      onPanResponderMove: (_, gesture) => {
        const current = latestProps.current;
        const bounds = startBounds.current;
        if (!bounds) return;

        const widthMm = Math.max(Number.EPSILON, bounds.right - bounds.left);
        const heightMm = Math.max(Number.EPSILON, bounds.bottom - bounds.top);
        const deltaXMm = (gesture.dx / current.pageWidth) * current.page.widthMm;
        const deltaYMm = (gesture.dy / current.pageHeight) * current.page.heightMm;
        const { horizontal, vertical } = current.direction;
        const scaleDelta =
          horizontal !== 0 && vertical !== 0
            ? (horizontal * deltaXMm * widthMm + vertical * deltaYMm * heightMm) /
              (widthMm ** 2 + heightMm ** 2)
            : horizontal !== 0
              ? (horizontal * deltaXMm) / widthMm
              : (vertical * deltaYMm) / heightMm;
        const anchor = {
          xMm:
            horizontal === -1
              ? bounds.right
              : horizontal === 1
                ? bounds.left
                : (bounds.left + bounds.right) / 2,
          yMm:
            vertical === -1
              ? bounds.bottom
              : vertical === 1
                ? bounds.top
                : (bounds.top + bounds.bottom) / 2,
        };

        current.onChange(
          scaleElementsAsGroup(startElements.current, 1 + scaleDelta, anchor, current.page),
        );
      },
      onPanResponderRelease: (event) => {
        event.stopPropagation();
        latestProps.current.onTransformEnd();
      },
      onPanResponderTerminate: (event) => {
        event.stopPropagation();
        latestProps.current.onTransformEnd();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }

  return (
    <View
      accessibilityHint="Arraste para redimensionar todos os elementos selecionados"
      accessibilityLabel="Redimensionar seleção múltipla"
      accessibilityRole="adjustable"
      pointerEvents="box-only"
      style={[
        styles.resizeHandle,
        {
          left: position.x - HANDLE_TOUCH_SIZE / 2,
          top: position.y - HANDLE_TOUCH_SIZE / 2,
        },
      ]}
      {...panResponder.current.panHandlers}
    >
      <View style={styles.resizeHandleIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  selectionBox: {
    position: 'absolute',
    zIndex: 4,
    borderWidth: 2,
    borderColor: colors.blue,
    borderStyle: 'dashed',
  },
  modeBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.blue,
  },
  modeBadgeText: { color: colors.surface, fontSize: 9, fontWeight: '800' },
  resizeHandle: {
    position: 'absolute',
    zIndex: 5,
    width: HANDLE_TOUCH_SIZE,
    height: HANDLE_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleIndicator: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: colors.blue,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
});

const resizeDirections: ResizeDirection[] = [
  { horizontal: -1, vertical: -1 },
  { horizontal: 0, vertical: -1 },
  { horizontal: 1, vertical: -1 },
  { horizontal: 1, vertical: 0 },
  { horizontal: 1, vertical: 1 },
  { horizontal: 0, vertical: 1 },
  { horizontal: -1, vertical: 1 },
  { horizontal: -1, vertical: 0 },
];
