import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { degreesToRadians, normalizeRotation } from '../../shared/print/rotation';
import { colors } from '../../shared/theme/tokens';
import type { PrintPage } from '../../shared/types/print';

type RotationHandleProps = {
  elementHeightMm: number;
  elementWidthMm: number;
  elementXMm: number;
  elementYMm: number;
  onRotate: (rotationDeg: number) => void;
  onRotateEnd: () => void;
  onRotateStart: () => void;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
  rotationDeg: number;
};

type RotationStart = {
  rotationDeg: number;
  vectorX: number;
  vectorY: number;
};

const HANDLE_TOUCH_SIZE = 44;
const HANDLE_DISTANCE_PX = 36;
const ACCESSIBILITY_ROTATION_STEP_DEG = 15;

export function RotationHandle({
  elementHeightMm,
  elementWidthMm,
  elementXMm,
  elementYMm,
  onRotate,
  onRotateEnd,
  onRotateStart,
  page,
  pageHeight,
  pageWidth,
  rotationDeg,
}: RotationHandleProps) {
  const rotationStart = useRef<RotationStart>({ rotationDeg, vectorX: 0, vectorY: 1 });
  const latestProps = useRef({
    elementHeightMm,
    elementWidthMm,
    elementXMm,
    elementYMm,
    onRotate,
    onRotateEnd,
    onRotateStart,
    page,
    pageHeight,
    pageWidth,
    rotationDeg,
  });

  latestProps.current = {
    elementHeightMm,
    elementWidthMm,
    elementXMm,
    elementYMm,
    onRotate,
    onRotateEnd,
    onRotateStart,
    page,
    pageHeight,
    pageWidth,
    rotationDeg,
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
        const radians = degreesToRadians(current.rotationDeg);
        const elementHeightPx =
          (current.elementHeightMm / current.page.heightMm) * current.pageHeight;
        const distanceFromCenter = elementHeightPx / 2 + HANDLE_DISTANCE_PX;

        rotationStart.current = {
          rotationDeg: current.rotationDeg,
          vectorX: -Math.sin(radians) * distanceFromCenter,
          vectorY: Math.cos(radians) * distanceFromCenter,
        };
        current.onRotateStart();
      },
      onPanResponderMove: (_, gesture) => {
        const start = rotationStart.current;
        const startAngle = Math.atan2(start.vectorY, start.vectorX);
        const currentAngle = Math.atan2(
          start.vectorY + gesture.dy,
          start.vectorX + gesture.dx,
        );
        const rotationDelta = ((currentAngle - startAngle) * 180) / Math.PI;

        latestProps.current.onRotate(
          Math.round(normalizeRotation(start.rotationDeg + rotationDelta)),
        );
      },
      onPanResponderRelease: (event) => {
        event.stopPropagation();
        latestProps.current.onRotateEnd();
      },
      onPanResponderTerminate: (event) => {
        event.stopPropagation();
        latestProps.current.onRotateEnd();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }

  const adjustRotation = (delta: number) => {
    const current = latestProps.current;
    current.onRotateStart();
    current.onRotate(normalizeRotation(current.rotationDeg + delta));
    current.onRotateEnd();
  };

  const radians = degreesToRadians(rotationDeg);
  const directionX = -Math.sin(radians);
  const directionY = Math.cos(radians);
  const elementCenterX = ((elementXMm + elementWidthMm / 2) / page.widthMm) * pageWidth;
  const elementCenterY = ((elementYMm + elementHeightMm / 2) / page.heightMm) * pageHeight;
  const elementHeightPx = (elementHeightMm / page.heightMm) * pageHeight;
  const connectorCenterDistance = elementHeightPx / 2 + HANDLE_DISTANCE_PX / 2;
  const handleCenterDistance = elementHeightPx / 2 + HANDLE_DISTANCE_PX;
  const connectorStyle = {
    left: elementCenterX + directionX * connectorCenterDistance,
    top: elementCenterY + directionY * connectorCenterDistance - HANDLE_DISTANCE_PX / 2,
    transform: [{ rotate: `${rotationDeg}deg` }],
  } as const;
  const handleStyle = {
    left: elementCenterX + directionX * handleCenterDistance - HANDLE_TOUCH_SIZE / 2,
    top: elementCenterY + directionY * handleCenterDistance - HANDLE_TOUCH_SIZE / 2,
  };

  return (
    <>
      <View pointerEvents="none" style={[styles.connector, connectorStyle]} />
      <View
        accessibilityActions={[
          { name: 'increment', label: 'Girar 15 graus para a direita' },
          { name: 'decrement', label: 'Girar 15 graus para a esquerda' },
        ]}
        accessibilityHint="Arraste ao redor do elemento para girar"
        accessibilityLabel={`Rotação: ${Math.round(rotationDeg)} graus`}
        accessibilityRole="adjustable"
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') {
            adjustRotation(ACCESSIBILITY_ROTATION_STEP_DEG);
          } else if (nativeEvent.actionName === 'decrement') {
            adjustRotation(-ACCESSIBILITY_ROTATION_STEP_DEG);
          }
        }}
        pointerEvents="box-only"
        style={[styles.handle, handleStyle]}
        {...panResponder.current.panHandlers}
      >
        <View style={styles.indicator}>
          <MaterialCommunityIcons color={colors.blue} name="rotate-right" size={18} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  connector: {
    position: 'absolute',
    zIndex: 2,
    width: 1,
    height: HANDLE_DISTANCE_PX,
    backgroundColor: colors.blue,
  },
  handle: {
    position: 'absolute',
    zIndex: 3,
    width: HANDLE_TOUCH_SIZE,
    height: HANDLE_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.blue,
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
});
