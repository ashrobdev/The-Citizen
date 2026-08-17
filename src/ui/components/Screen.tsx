import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout, Space } from '../theme/tokens';
import { Colors } from '../theme/colors';
import { useColorScheme } from 'react-native';

/**
 * The frame every screen sits in.
 *
 * Fixes safe-area handling in one place rather than nine: nothing in the app
 * honoured insets before, and every scroll used a magic `paddingBottom: 60`
 * standing in for the home indicator.
 *
 * Left and right insets are applied too, because app.json enables tablets and
 * landscape notches are real.
 */
export function Screen({
  children,
  scroll = false,
  centred = false,
  /** Set when the native header is hidden, so content clears the status bar. */
  topInset = false,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  centred?: boolean;
  topInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const padding = {
    paddingLeft: Layout.screenPadding + insets.left,
    paddingRight: Layout.screenPadding + insets.right,
    paddingTop: topInset ? insets.top + Space.md : Space.md,
    paddingBottom: Space.xxl + insets.bottom,
  };

  const inner: StyleProp<ViewStyle> = [
    styles.inner,
    centred && styles.centred,
    contentStyle,
  ];

  if (scroll) {
    return (
      <ScrollView
        style={[{ backgroundColor: theme.background }, style]}
        contentContainerStyle={[padding, centred && styles.grow, inner]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }, padding, inner, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  inner: { width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center' },
  centred: { alignItems: 'center', justifyContent: 'center' },
});
