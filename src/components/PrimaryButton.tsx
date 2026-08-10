import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '../shared/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type PrimaryButtonProps = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  variant?: 'primary' | 'secondary';
  onPress: () => void;
};

export function PrimaryButton({
  label,
  loading = false,
  disabled = false,
  icon = 'chevron-right',
  iconPosition = 'right',
  variant = 'primary',
  onPress,
}: PrimaryButtonProps) {
  const secondary = variant === 'secondary';
  const foreground = secondary ? colors.blue : colors.surface;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        pressed && (secondary ? styles.pressedSecondary : styles.pressedPrimary),
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {iconPosition === 'left' && (
            <MaterialCommunityIcons color={foreground} name={icon} size={22} />
          )}
          <Text style={[styles.label, secondary && styles.labelSecondary]}>{label}</Text>
          {iconPosition === 'right' && (
            <MaterialCommunityIcons color={foreground} name={icon} size={22} />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.blue,
  },
  buttonSecondary: { backgroundColor: colors.blueSoft },
  label: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  labelSecondary: { color: colors.blue },
  pressedPrimary: { backgroundColor: colors.blueDark, transform: [{ scale: 0.99 }] },
  pressedSecondary: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
