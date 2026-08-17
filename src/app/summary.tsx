import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme } from 'react-native';

import type { StreakState } from '../domain/scheduling/streak';
import { useNotifications, useSessionService } from '../ui/AppProvider';
import { Mascot } from '../ui/components/Mascot';
import { ReminderPrompt } from '../ui/components/ReminderPrompt';
import { Confetti } from '../ui/components/Confetti';
import { PressableScale } from '../ui/components/PressableScale';
import { Screen } from '../ui/components/Screen';
import { Stripes } from '../ui/components/Stripes';
import { haptics } from '../ui/haptics';
import { Colors } from '../ui/theme/colors';
import { Radius, Space, Type } from '../ui/theme/tokens';

export default function Summary(): React.ReactElement {
  const service = useSessionService();
  const notifications = useNotifications();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const [streak, setStreak] = useState<StreakState | undefined>();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await service.streak();
      if (cancelled) return;
      setStreak(s);
      // Confetti is reserved for milestones. Ninety identical bursts would make
      // the app a toy; a burst at seven days still means something.
      const milestone = s.current > 0 && s.current % 7 === 0;
      if (milestone) {
        haptics.celebrate();
        setCelebrate(true);
      } else {
        haptics.success();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  if (!streak) {
    return (
      <Screen centred>
        <ActivityIndicator color={theme.accent} />
      </Screen>
    );
  }

  const earnedFreeze = streak.freezesHeld > 0;

  return (
    <Screen centred contentStyle={styles.container}>
      <Stack.Screen options={{ title: 'Done', headerBackVisible: false }} />

      {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}
      <Mascot pose="cheering" size="large" />
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

      <ReminderPrompt
        notifications={notifications}
        theme={theme}
        onResolved={() => undefined}
      />

      <PressableScale
        onPress={() => router.replace('/')}
        style={[styles.button, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>Done</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: Space.sm },
  title: { ...Type.title, marginTop: Space.sm },
  // Off-scale deliberately: the streak count is the one piece of display type
  // in the app and Type.display is sized for headings, not a single numeral.
  streak: { fontSize: 76, fontWeight: '800', letterSpacing: -2 },
  unit: { ...Type.body, marginTop: -Space.sm },
  note: { ...Type.bodySmall, textAlign: 'center', marginTop: Space.xs },
  button: {
    paddingVertical: Space.lg,
    paddingHorizontal: Space.xxxl,
    borderRadius: Radius.lg,
    marginTop: Space.xl,
  },
  buttonText: Type.button,
});
