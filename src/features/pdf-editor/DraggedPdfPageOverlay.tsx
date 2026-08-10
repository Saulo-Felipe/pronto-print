import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { colors, radii, shadows, spacing } from '../../shared/theme/tokens';
import type { PdfPage } from './pdfDocument';
import { PdfPagePreview } from './PdfPagePreview';

export type DraggedPageOverlayState = {
  height: number;
  outputPageNumber: number;
  page: PdfPage;
  startPointerX: number;
  startPointerY: number;
  width: number;
  x: number;
  y: number;
};

type DraggedPdfPageOverlayProps = {
  pointerX: SharedValue<number>;
  pointerY: SharedValue<number>;
  state: DraggedPageOverlayState;
};

export function DraggedPdfPageOverlay({
  pointerX,
  pointerY,
  state,
}: DraggedPdfPageOverlayProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pointerX.value - state.startPointerX },
      { translateY: pointerY.value - state.startPointerY },
      { scale: 1.015 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        { height: state.height, left: state.x, top: state.y, width: state.width },
        animatedStyle,
      ]}
    >
      <PdfPagePreview
        pageNumber={state.page.sourcePageIndex + 1}
        uri={state.page.sourceUri}
      />
      <View style={styles.footer}>
        <Text style={styles.pageNumber}>Página {state.outputPageNumber}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...shadows.paper,
    position: 'absolute',
    zIndex: 1000,
    elevation: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  footer: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  pageNumber: { color: colors.ink, fontSize: 12, fontWeight: '700' },
});
