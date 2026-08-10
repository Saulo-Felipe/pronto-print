import { useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, Text, TextInput, View } from 'react-native';

import { clampElementPosition } from '../../shared/print/document';
import { isHeavyTextFont } from '../../shared/print/fonts';
import {
  getPositionAfterResize,
  projectVectorToElementAxes,
} from '../../shared/print/rotation';
import { colors } from '../../shared/theme/tokens';
import type { PrintPage, PrintText } from '../../shared/types/print';
import { RotationHandle } from './RotationHandle';
import { resolveEditorFontFamily } from './textFonts';

type PrintTextElementProps = {
  editing: boolean;
  element: PrintText;
  grouped?: boolean;
  multiSelectionEnabled?: boolean;
  onChange: (element: PrintText) => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onEdit: () => void;
  onEditingFocus: (inputHandle: number) => void;
  onFinishEditing: () => void;
  onLongPress: () => void;
  onSelect: () => void;
  onTap: () => void;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
  selected: boolean;
};

type ResizeDirection = {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
};

type ResizeHandleProps = {
  accessibilityLabel: string;
  direction: ResizeDirection;
  element: PrintText;
  onChange: (element: PrintText) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
  positionStyle: object;
};

const DOUBLE_TAP_DELAY_MS = 300;
const LONG_PRESS_DELAY_MS = 500;
const MOVE_THRESHOLD_PX = 4;
const POINTS_TO_MILLIMETERS = 25.4 / 72;
const MIN_TEXT_WIDTH_MM = 15;
const MIN_TEXT_HEIGHT_MM = 8;
const TEXT_HORIZONTAL_PADDING_MM = 3;
const TEXT_VERTICAL_PADDING_MM = 2;
const SIZE_CHANGE_THRESHOLD_MM = 0.1;
const HANDLE_TOUCH_SIZE = 24;

type MeasuredTextLine = {
  height: number;
  width: number;
  y: number;
};

export function PrintTextElement({
  editing,
  element,
  grouped = false,
  multiSelectionEnabled = false,
  onChange,
  onDragEnd,
  onDragStart,
  onEdit,
  onEditingFocus,
  onFinishEditing,
  onLongPress,
  onSelect,
  onTap,
  page,
  pageHeight,
  pageWidth,
  selected,
}: PrintTextElementProps) {
  const startPosition = useRef({ xMm: element.xMm, yMm: element.yMm });
  const moved = useRef(false);
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapAction = useRef(onTap);
  const lastTapTime = useRef(0);
  const latestProps = useRef({
    element,
    onChange,
    onDragEnd,
    onDragStart,
    onEdit,
    onLongPress,
    onSelect,
    onTap,
    multiSelectionEnabled,
    page,
    pageHeight,
    pageWidth,
  });

  latestProps.current = {
    element,
    onChange,
    onDragEnd,
    onDragStart,
    onEdit,
    onLongPress,
    onSelect,
    onTap,
    multiSelectionEnabled,
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
        const current = latestProps.current;
        moved.current = false;
        longPressTriggered.current = false;
        tapAction.current = latestProps.current.onTap;
        startPosition.current = {
          xMm: current.element.xMm,
          yMm: current.element.yMm,
        };
        current.onDragStart();
        current.onSelect();
        cancelLongPress();
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressTriggered.current = true;
          lastTapTime.current = 0;
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

        const current = latestProps.current;
        const position = clampElementPosition(
          startPosition.current.xMm + (gesture.dx / current.pageWidth) * current.page.widthMm,
          startPosition.current.yMm + (gesture.dy / current.pageHeight) * current.page.heightMm,
          current.element,
          current.page,
        );

        current.onChange({ ...current.element, ...position });
      },
      onPanResponderRelease: () => {
        cancelLongPress();
        const current = latestProps.current;
        if (!moved.current && !longPressTriggered.current) {
          tapAction.current();
          if (current.multiSelectionEnabled) {
            current.onDragEnd();
            return;
          }

          const now = Date.now();
          if (now - lastTapTime.current <= DOUBLE_TAP_DELAY_MS) {
            lastTapTime.current = 0;
            current.onEdit();
          } else {
            lastTapTime.current = now;
          }
        }
        current.onDragEnd();
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

  const fontSize =
    ((element.fontSizePt * POINTS_TO_MILLIMETERS) / page.heightMm) * pageHeight;
  const renderedTextStyle = {
    color: element.color,
    fontFamily: resolveEditorFontFamily(element.fontFamily),
    fontSize: Math.max(6, fontSize),
    fontWeight: isHeavyTextFont(element.fontFamily) ? '900' : element.fontWeight,
    lineHeight: Math.max(7, fontSize * 1.2),
    textAlign: element.textAlign,
  } as const;

  const fitContainerToText = (lines: MeasuredTextLine[]) => {
    if (lines.length === 0 || !element.autoSize) return;

    const current = latestProps.current;
    const contentHeightPx = Math.max(...lines.map((line) => line.y + line.height));
    const measuredHeightMm =
      (contentHeightPx / current.pageHeight) * current.page.heightMm + TEXT_VERTICAL_PADDING_MM;
    const heightMm = Math.min(current.page.heightMm, measuredHeightMm);
    const measuredWidthMm =
      lines.length === 1
        ? (lines[0].width / current.pageWidth) * current.page.widthMm +
          TEXT_HORIZONTAL_PADDING_MM
        : current.element.widthMm;
    const widthMm = Math.min(
      current.page.widthMm,
      Math.max(MIN_TEXT_WIDTH_MM, measuredWidthMm),
    );
    const sizeChanged =
      Math.abs(widthMm - current.element.widthMm) > SIZE_CHANGE_THRESHOLD_MM ||
      Math.abs(heightMm - current.element.heightMm) > SIZE_CHANGE_THRESHOLD_MM;

    if (!sizeChanged) return;

    const centerX = current.element.xMm + current.element.widthMm / 2;
    const centerY = current.element.yMm + current.element.heightMm / 2;
    const resizedElement = { ...current.element, widthMm, heightMm };
    const position = clampElementPosition(
      centerX - widthMm / 2,
      centerY - heightMm / 2,
      resizedElement,
      current.page,
    );

    current.onChange({ ...resizedElement, ...position });
  };

  const startResize = () => {
    latestProps.current.onDragStart();
    latestProps.current.onSelect();
  };

  const endResize = () => latestProps.current.onDragEnd();

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

  return (
    <>
      <View
        style={[
          styles.container,
          {
            left: (element.xMm / page.widthMm) * pageWidth,
            top: (element.yMm / page.heightMm) * pageHeight,
            width: (element.widthMm / page.widthMm) * pageWidth,
            height: (element.heightMm / page.heightMm) * pageHeight,
            transform: [{ rotate: `${element.rotationDeg}deg` }],
          },
          selected && styles.selected,
          selected && styles.selectedContainer,
        ]}
      >
        {editing ? (
          <TextInput
            accessibilityLabel="Editar texto na folha"
            autoFocus
            multiline
            onBlur={onFinishEditing}
            onChangeText={(text) => onChange({ ...element, text })}
            onFocus={({ nativeEvent }) => onEditingFocus(nativeEvent.target)}
            selectionColor={colors.blue}
            style={[styles.inlineTextInput, renderedTextStyle]}
            underlineColorAndroid="transparent"
            value={element.text}
          />
        ) : (
          <View
            accessibilityActions={[
              { name: 'activate', label: 'Editar conteúdo do texto' },
              { name: 'longpress', label: 'Iniciar seleção múltipla' },
              { name: 'deselect', label: 'Remover da seleção múltipla' },
            ]}
            accessibilityHint="Toque para selecionar, arraste para mover, mantenha pressionado para selecionar vários ou toque duas vezes para editar"
            accessibilityLabel={`Texto: ${element.text}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'activate') onEdit();
              if (nativeEvent.actionName === 'longpress') onLongPress();
              if (nativeEvent.actionName === 'deselect') onTap();
            }}
            onAccessibilityTap={onSelect}
            style={styles.interactionArea}
            {...panResponder.current.panHandlers}
          >
            <Text
              onTextLayout={({ nativeEvent }) => fitContainerToText(nativeEvent.lines)}
              style={renderedTextStyle}
            >
              {element.text}
            </Text>
          </View>
        )}
        {selected &&
          !grouped &&
          !editing &&
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
      {selected && !grouped && !editing && (
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
  onChange,
  onResizeEnd,
  onResizeStart,
  page,
  pageHeight,
  pageWidth,
  positionStyle,
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
        const current = latestProps.current;
        startElement.current = current.element;
        current.onResizeStart();
      },
      onPanResponderMove: (_, gesture) => {
        const current = latestProps.current;
        const initialElement = startElement.current;
        const pageDeltaXMm = (gesture.dx / current.pageWidth) * current.page.widthMm;
        const pageDeltaYMm = (gesture.dy / current.pageHeight) * current.page.heightMm;
        const localDelta = projectVectorToElementAxes(
          pageDeltaXMm,
          pageDeltaYMm,
          initialElement.rotationDeg,
        );
        const resizedElement = resizeTextElement(
          initialElement,
          current.page,
          current.direction,
          localDelta.x,
          localDelta.y,
        );
        const resizedPosition = getPositionAfterResize(
          initialElement,
          resizedElement.widthMm,
          resizedElement.heightMm,
          current.direction,
        );
        const repositionedElement = { ...resizedElement, ...resizedPosition };
        const position = clampElementPosition(
          repositionedElement.xMm,
          repositionedElement.yMm,
          repositionedElement,
          current.page,
        );

        current.onChange({ ...repositionedElement, ...position });
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

function resizeTextElement(
  element: PrintText,
  page: PrintPage,
  direction: ResizeDirection,
  deltaXMm: number,
  deltaYMm: number,
): PrintText {
  let { xMm, yMm, widthMm, heightMm } = element;

  if (direction.horizontal === -1) {
    const rightMm = element.xMm + element.widthMm;
    xMm = clamp(element.xMm + deltaXMm, 0, rightMm - MIN_TEXT_WIDTH_MM);
    widthMm = rightMm - xMm;
  } else if (direction.horizontal === 1) {
    widthMm = clamp(
      element.widthMm + deltaXMm,
      MIN_TEXT_WIDTH_MM,
      page.widthMm - element.xMm,
    );
  }

  if (direction.vertical === -1) {
    const bottomMm = element.yMm + element.heightMm;
    yMm = clamp(element.yMm + deltaYMm, 0, bottomMm - MIN_TEXT_HEIGHT_MM);
    heightMm = bottomMm - yMm;
  } else if (direction.vertical === 1) {
    heightMm = clamp(
      element.heightMm + deltaYMm,
      MIN_TEXT_HEIGHT_MM,
      page.heightMm - element.yMm,
    );
  }

  return { ...element, autoSize: false, xMm, yMm, widthMm, heightMm };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedContainer: { zIndex: 1 },
  selected: { borderWidth: 2, borderColor: colors.blue },
  interactionArea: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  inlineTextInput: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 2,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
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
