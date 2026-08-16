import { Stack } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors } from '@/ui/theme/colors';

/**
 * Placeholder shell. Replaced in Phase 1 by the Today screen once the content,
 * grading and scheduling layers exist — those get built and tested before any
 * real UI is written.
 */
export default function Today() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'The Citizen' }} />
      <Text style={[styles.title, { color: theme.text }]}>The Citizen</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        128 civics questions. Typed or spoken. Ninety days.
      </Text>
      <View style={[styles.rule, { backgroundColor: theme.accentAlt }]} />
      <Text style={[styles.note, { color: theme.textSecondary }]}>
        Phase 0 — project shell
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, textAlign: 'center' },
  rule: { width: 64, height: 4, borderRadius: 2, marginTop: 8 },
  note: { fontSize: 13, marginTop: 4 },
});
