import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { HIT_TARGET, Radius, Space, Type } from '../theme/tokens';
import type { Theme } from '../theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';

/**
 * One button, so every screen presses the same.
 *
 * Before this, each screen rolled its own Pressable with slightly different
 * padding and radius, which is exactly the sort of drift nobody notices
 * individually and everybody feels in aggregate.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  theme,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  theme: Theme;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}): React.ReactElement {
  const filled = variant !== 'secondary';
  const background =
    variant === 'primary'
      ? theme.accent
      : variant === 'success'
        ? theme.success
        : variant === 'danger'
          ? theme.error
          : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: filled ? background : 'transparent',
          borderColor: filled ? 'transparent' : theme.border,
          borderWidth: filled ? 0 : 1.5,
          // Press feedback by opacity rather than a colour change, so it reads
          // the same in both themes.
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: filled ? '#FFFFFF' : theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_TARGET,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...Type.button, textAlign: 'center' },
});
