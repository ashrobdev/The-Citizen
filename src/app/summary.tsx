import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { StreakState } from '../domain/scheduling/streak';
import { useSessionService } from '../ui/AppProvider';
import { Stripes } from '../ui/components/Stripes';
import { Colors } from '../ui/theme/colors';

export default function Summary(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const [streak, setStreak] = useState<StreakState | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await service.streak();
      if (!cancelled) setStreak(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  if (!streak) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const earnedFreeze = streak.freezesHeld > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Done', headerBackVisible: false }} />

      <Stripes width={110} />
      <Text style={[styles.title, { color: theme.text }]}>Day complete</Text>
      <Text style={[styles.streak, { color: theme.accentAlt }]}>{streak.current}</Text>
      <Text style={[styles.unit, { color: theme.textSecondary }]}>
        day{streak.current === 1 ? '' : 's'} in a row
      </Text>

      {streak.longest > streak.current ? (
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Your best is {streak.longest}.
        </Text>
      ) : null}

      {earnedFreeze ? (
        <Text style={[styles.note, { color: theme.accent }]}>
          ★ You’re holding a streak freeze — one missed day won’t break it.
        </Text>
      ) : null}

      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.button, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 25, fontWeight: '700', marginTop: 8 },
  streak: { fontSize: 76, fontWeight: '800', letterSpacing: -2 },
  unit: { fontSize: 16, marginTop: -8 },
  note: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  button: { paddingVertical: 15, paddingHorizontal: 44, borderRadius: 14, marginTop: 22 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
