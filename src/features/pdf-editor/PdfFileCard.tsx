import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import { colors, radii, shadows, spacing } from '../../shared/theme/tokens';
import { DraggablePdfPage } from './DraggablePdfPage';
import { formatFileSize, type PdfFile } from './pdfDocument';

export type PdfDropPreview = {
  targetPageId: string | null;
  insertAfterTarget: boolean;
};

type PdfFileCardProps = {
  file: PdfFile;
  order: number;
  firstOutputPageNumber: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRestorePages: boolean;
  dropPreview: PdfDropPreview | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRemovePage: (pageId: string) => void;
  onRestorePages: () => void;
  onDragEnd: () => void;
  onDragMove: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onDragStart: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onDropPage: (pageId: string, absoluteX: number, absoluteY: number) => void;
  onRegisterFile: (fileId: string, node: View | null) => void;
  onRegisterPage: (pageId: string, fileId: string, node: View | null) => void;
};

export function PdfFileCard({
  file,
  order,
  firstOutputPageNumber,
  canMoveUp,
  canMoveDown,
  canRestorePages,
  dropPreview,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRemovePage,
  onRestorePages,
  onDragEnd,
  onDragMove,
  onDragStart,
  onDropPage,
  onRegisterFile,
  onRegisterPage,
}: PdfFileCardProps) {
  const renderDropPlaceholder = (key: string) => (
    <Animated.View
      entering={FadeIn.duration(100)}
      exiting={FadeOut.duration(80)}
      key={key}
      layout={LinearTransition.duration(140)}
      style={styles.pageColumn}
    >
      <View style={styles.dropPlaceholder}>
        <MaterialCommunityIcons color={colors.blue} name="arrow-down-bold" size={24} />
        <Text style={styles.dropPlaceholderText}>Solte a página aqui</Text>
      </View>
    </Animated.View>
  );

  return (
    <View collapsable={false} ref={(node) => onRegisterFile(file.id, node)}>
      <Animated.View layout={LinearTransition.duration(170)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.order}>
          <Text style={styles.orderText}>{order}</Text>
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>{file.name}</Text>
          <Text style={styles.meta}>
            {file.pages.length} {file.pages.length === 1 ? 'página' : 'páginas'} neste bloco ·{' '}
            {formatFileSize(file.size)}
          </Text>
        </View>
        <View style={styles.actions}>
          <IconAction
            disabled={!canMoveUp}
            icon="arrow-up"
            label={`Mover ${file.name} para cima`}
            onPress={onMoveUp}
          />
          <IconAction
            disabled={!canMoveDown}
            icon="arrow-down"
            label={`Mover ${file.name} para baixo`}
            onPress={onMoveDown}
          />
          <IconAction
            danger
            icon="trash-can-outline"
            label={`Remover ${file.name}`}
            onPress={onRemove}
          />
        </View>
      </View>

      {file.pages.length > 0 || dropPreview ? (
        <Animated.View layout={LinearTransition.duration(170)} style={styles.pages}>
          {file.pages.map((page, includedPagePosition) => {
            const outputPageNumber = firstOutputPageNumber + includedPagePosition;
            const showPlaceholderBefore =
              dropPreview?.targetPageId === page.id && !dropPreview.insertAfterTarget;
            const showPlaceholderAfter =
              dropPreview?.targetPageId === page.id && dropPreview.insertAfterTarget;

            return (
              <Fragment key={page.id}>
                {showPlaceholderBefore && renderDropPlaceholder(`before-${page.id}`)}
                <Animated.View
                  layout={LinearTransition.duration(140)}
                  style={styles.pageColumn}
                >
                  <DraggablePdfPage
                    fileId={file.id}
                    onDragEnd={onDragEnd}
                    onDragMove={onDragMove}
                    onDragStart={onDragStart}
                    onDrop={onDropPage}
                    onRegister={onRegisterPage}
                    onRemove={() => onRemovePage(page.id)}
                    outputPageNumber={outputPageNumber}
                    page={page}
                  />
                </Animated.View>
                {showPlaceholderAfter && renderDropPlaceholder(`after-${page.id}`)}
              </Fragment>
            );
          })}
          {dropPreview?.targetPageId === null && renderDropPlaceholder('at-end')}
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(90)}
          exiting={FadeOut.duration(80)}
          layout={LinearTransition.duration(170)}
          style={styles.noPages}
        >
          <Text style={styles.noPagesText}>Este bloco está sem páginas.</Text>
          {canRestorePages ? (
            <Pressable onPress={onRestorePages} style={styles.restoreButton}>
              <Text style={styles.restoreButtonText}>Restaurar páginas excluídas</Text>
            </Pressable>
          ) : (
            <Text style={styles.emptyDropHint}>Arraste uma página para este espaço.</Text>
          )}
        </Animated.View>
      )}
      </Animated.View>
    </View>
  );
}

type IconActionProps = {
  icon: 'arrow-up' | 'arrow-down' | 'trash-can-outline';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
};

function IconAction({ icon, label, onPress, disabled = false, danger = false }: IconActionProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons color={danger ? colors.danger : colors.muted} name={icon} size={19} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  order: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
  },
  orderText: { color: colors.blue, fontSize: 13, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0, marginHorizontal: spacing.sm },
  name: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  meta: { marginTop: 2, color: colors.muted, fontSize: 11 },
  actions: { flexDirection: 'row' },
  iconAction: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.25 },
  pressed: { opacity: 0.55 },
  pages: {
    marginTop: spacing.md,
    marginHorizontal: -spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  pageColumn: { width: '50%', padding: spacing.xs },
  dropPlaceholder: {
    width: '100%',
    aspectRatio: 210 / 340,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.blue,
    borderRadius: radii.sm,
    backgroundColor: colors.blueSoft,
  },
  dropPlaceholderText: {
    paddingHorizontal: spacing.sm,
    color: colors.blue,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  noPages: {
    marginTop: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSoft,
  },
  noPagesText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  restoreButton: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  restoreButtonText: { color: colors.blue, fontSize: 13, fontWeight: '800' },
  emptyDropHint: { marginTop: spacing.sm, color: colors.muted, fontSize: 12 },
});
