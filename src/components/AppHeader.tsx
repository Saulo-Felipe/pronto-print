import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../shared/theme/tokens';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  actionLabel?: string;
  dark?: boolean;
  onBack?: () => void;
  onAction?: () => void;
};

export function AppHeader({
  title,
  subtitle,
  backLabel = 'Voltar',
  actionLabel,
  dark = false,
  onBack,
  onAction,
}: AppHeaderProps) {
  const foreground = dark ? colors.surface : colors.ink;

  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      <View style={styles.side}>
        {onBack && (
          <Pressable
            accessibilityLabel={backLabel}
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={foreground} name="chevron-left" size={28} />
          </Pressable>
        )}
      </View>

      <View style={styles.titleGroup}>
        <Text numberOfLines={1} style={[styles.title, { color: foreground }]}>
          {title}
        </Text>
        {subtitle && <Text style={[styles.subtitle, dark && styles.subtitleDark]}>{subtitle}</Text>}
      </View>

      <View style={[styles.side, styles.sideEnd]}>
        {actionLabel && onAction && (
          <Pressable hitSlop={8} onPress={onAction} style={styles.textButton}>
            <Text style={[styles.action, dark && styles.actionDark]}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  containerDark: {
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.cropBackground,
  },
  side: { width: 76, alignItems: 'flex-start' },
  sideEnd: { alignItems: 'flex-end' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  titleGroup: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800' },
  subtitle: { marginTop: 1, color: colors.muted, fontSize: 12 },
  subtitleDark: { color: colors.cropInstruction },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  action: { color: colors.blue, fontWeight: '700', fontSize: 14 },
  actionDark: { color: colors.surface },
});
