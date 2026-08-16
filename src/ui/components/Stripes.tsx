import { StyleSheet, View, useColorScheme } from 'react-native';

import { Colors } from '../theme/colors';

/**
 * Thirteen stripes, for the thirteen original colonies.
 *
 * Decorative only — marked hidden from assistive technology, and never placed
 * behind body text, where the alternating bands would wreck legibility.
 */
export function Stripes({ width = 88 }: { width?: number }): React.ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <View
      style={[styles.row, { width }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: 13 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stripe,
            { backgroundColor: i % 2 === 0 ? theme.accentAlt : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'column', height: 14, borderRadius: 2, overflow: 'hidden' },
  stripe: { flex: 1 },
});
