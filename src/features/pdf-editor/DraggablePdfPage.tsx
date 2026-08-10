import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { colors, radii, spacing } from '../../shared/theme/tokens';
import type { PdfPage } from './pdfDocument';
import { PdfPagePreview } from './PdfPagePreview';

type DraggablePdfPageProps = {
  fileId: string;
  outputPageNumber: number;
  page: PdfPage;
  onDragEnd: () => void;
  onDragStart: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onDragMove: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onDrop: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onRegister: (pageId: string, fileId: string, node: View | null) => void;
  onRemove: () => void;
};

export function DraggablePdfPage({
  fileId,
  outputPageNumber,
  page,
  onDragEnd,
  onDragStart,
  onDragMove,
  onDrop,
  onRegister,
  onRemove,
}: DraggablePdfPageProps) {
  const dragging = useSharedValue(false);
  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(250)
        .runOnJS(true)
        .onStart(({ absoluteX, absoluteY }) => {
          dragging.value = true;
          onDragStart(page.id, absoluteX, absoluteY);
        })
        .onUpdate(({ absoluteX, absoluteY }) => {
          onDragMove(page.id, absoluteX, absoluteY);
        })
        .onEnd(({ absoluteX, absoluteY }) => {
          onDrop(page.id, absoluteX, absoluteY);
        })
        .onFinalize(() => {
          dragging.value = false;
          onDragEnd();
        }),
    [
      dragging,
      onDragEnd,
      onDragMove,
      onDragStart,
      onDrop,
      page.id,
    ],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: dragging.value ? 0.12 : 1,
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <View collapsable={false} ref={(node) => onRegister(page.id, fileId, node)}>
        <Animated.View style={[styles.page, animatedStyle]}>
          <PdfPagePreview pageNumber={page.sourcePageIndex + 1} uri={page.sourceUri} />
          <View style={styles.footer}>
            <Text style={styles.pageNumber}>Página {outputPageNumber}</Text>
            {page.sourceFileId !== fileId && (
              <Text numberOfLines={1} style={styles.sourceName}>{page.sourceFileName}</Text>
            )}
          </View>
          <Pressable
            accessibilityLabel={`Excluir página ${outputPageNumber} do PDF final`}
            hitSlop={6}
            onPress={onRemove}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.surface} name="trash-can-outline" size={18} />
          </Pressable>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  footer: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pageNumber: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  sourceName: { marginTop: 1, color: colors.muted, fontSize: 9 },
  deleteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.danger,
  },
  pressed: { opacity: 0.55 },
});
