import { StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadow, Space } from '../theme/tokens';
import type { Theme } from '../theme/colors';

/**
 * A raised surface.
 *
 * The shadow is light-mode only: `Shadow.card` is a navy shadow, which is
 * invisible against a navy background. Dark mode carries the same separation
 * with a border and a lifted surface colour instead.
 */
export function Card({
  children,
  theme,
  style,
}: {
  children: React.ReactNode;
  theme: Theme;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const dark = useColorScheme() === 'dark';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        dark ? styles.darkBorder : Shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Space.lg, borderWidth: StyleSheet.hairlineWidth },
  darkBorder: { borderWidth: 1 },
});
