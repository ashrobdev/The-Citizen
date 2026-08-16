import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { DAILY_QUESTION_COUNT, PROGRAM_LENGTH_DAYS } from '../domain/scheduling/config';
import type { StreakState } from '../domain/scheduling/streak';
import { useSessionService } from '../ui/AppProvider';
import { Colors } from '../ui/theme/colors';
import { Stripes } from '../ui/components/Stripes';

interface View_ {
  programDay: number;
  streak: StreakState;
  answered: number;
  total: number;
  complete: boolean;
}

export default function Today(): React.ReactElement {
  const service = useSessionService();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const [state, setState] = useState<View_ | undefined>();

  // Reloads whenever the screen regains focus, so finishing a session updates
  // the streak and progress without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const today = await service.startOrResumeToday();
        if (cancelled) return;
        setState({
          programDay: today.programDay,
          streak: today.streak,
          answered: new Set(today.answeredQuestionIds).size,
          total: today.session.questionIds.length,
          complete: today.isComplete,
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [service]),
  );

  if (!state) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const remaining = state.total - state.answered;
  const done = state.complete || remaining <= 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'The Citizen' }} />

      <View style={styles.header}>
        <Text style={[styles.streak, { color: theme.text }]}>
          {state.streak.current}
          <Text style={[styles.streakUnit, { color: theme.textSecondary }]}>
            {state.streak.current === 1 ? ' day streak' : ' day streak'}
          </Text>
        </Text>
        {state.streak.freezesHeld > 0 ? (
          <Text style={[styles.freeze, { color: theme.accent }]}>
            ★ 1 freeze held — one missed day is covered
          </Text>
        ) : null}
        <Stripes />
      </View>

      <Text style={[styles.day, { color: theme.textSecondary }]}>
        Day {state.programDay} of {PROGRAM_LENGTH_DAYS}
      </Text>

      <View style={styles.dots}>
        {Array.from({ length: state.total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < state.answered ? theme.accentAlt : 'transparent',
                borderColor: i < state.answered ? theme.accentAlt : theme.border,
              },
            ]}
          />
        ))}
      </View>

      {done ? (
        <>
          <Text style={[styles.doneTitle, { color: theme.success }]}>Today is done</Text>
          <Text style={[styles.doneBody, { color: theme.textSecondary }]}>
            Come back tomorrow to keep the streak going.
          </Text>
        </>
      ) : (
        <Link href="/session" style={[styles.cta, { backgroundColor: theme.accent }]}>
          <Text style={styles.ctaText}>
            {state.answered === 0
              ? `Start today’s ${DAILY_QUESTION_COUNT}`
              : `Continue — ${remaining} to go`}
          </Text>
        </Link>
      )}

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Answers are typed, never multiple choice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  header: { alignItems: 'center', gap: 6 },
  streak: { fontSize: 56, fontWeight: '800', letterSpacing: -1 },
  streakUnit: { fontSize: 17, fontWeight: '500', letterSpacing: 0 },
  freeze: { fontSize: 13, fontWeight: '600' },
  day: { fontSize: 15 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', maxWidth: 260 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5 },
  cta: { paddingVertical: 15, paddingHorizontal: 30, borderRadius: 14, marginTop: 6 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  doneTitle: { fontSize: 21, fontWeight: '700', marginTop: 6 },
  doneBody: { fontSize: 14, textAlign: 'center' },
  hint: { fontSize: 12, marginTop: 8, textAlign: 'center' },
});
