import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DAILY_QUESTION_COUNT, PROGRAM_LENGTH_DAYS } from '../../domain/scheduling/config';
import type { StreakState } from '../../domain/scheduling/streak';
import { useSessionService } from '../../ui/AppProvider';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Mascot } from '../../ui/components/Mascot';
import { ProgressRing } from '../../ui/components/ProgressRing';
import { Screen } from '../../ui/components/Screen';
import { Colors } from '../../ui/theme/colors';
import { useReduceMotion } from '../../ui/theme/motion';
import { Radius, Space, Type } from '../../ui/theme/tokens';

interface TodayView {
  programDay: number;
  streak: StreakState;
  answered: number;
  total: number;
  complete: boolean;
}

export default function Today(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const reduce = useReduceMotion();
  const [state, setState] = useState<TodayView | undefined>();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const profile = await service.profile();
        if (cancelled) return;
        if (!profile) {
          // Four of the questions depend on where you live.
          router.replace('/onboarding');
          return;
        }
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
    }, [service, router]),
  );

  if (!state) {
    return (
      <Screen centred topInset>
        <ActivityIndicator color={theme.accent} />
      </Screen>
    );
  }

  const remaining = state.total - state.answered;
  const done = state.complete || remaining <= 0;
  const progress = state.total === 0 ? 0 : state.answered / state.total;
  // Spread rather than passing undefined: exactOptionalPropertyTypes treats an
  // explicit undefined as a type error, and omitting the prop is what we mean.
  const enter = reduce ? {} : { entering: FadeInDown.duration(320) };

  return (
    <Screen scroll topInset contentStyle={styles.content}>
      <Animated.View {...enter} style={styles.streakRow}>
        <Mascot pose={done ? 'thinking' : 'pointing'} size="small" />
        <View>
          <Text style={[styles.streakNumber, { color: theme.text }]}>
            {state.streak.current}
            <Text style={[styles.streakUnit, { color: theme.textSecondary }]}>
              {state.streak.current === 1 ? ' day' : ' days'}
            </Text>
          </Text>
          <Text style={[styles.streakLabel, { color: theme.textSecondary }]}>
            {state.streak.current === 0 ? 'Start a streak today' : 'in a row'}
          </Text>
        </View>
      </Animated.View>

      {state.streak.freezesHeld > 0 ? (
        <View style={[styles.freeze, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.freezeText, { color: theme.text }]}>
            ★ Freeze held — one missed day is covered
          </Text>
        </View>
      ) : null}

      <Animated.View {...enter} style={styles.ringWrap}>
        <ProgressRing progress={progress} theme={theme} size={186}>
          <Text style={[styles.ringCount, { color: theme.text }]}>
            {state.answered}
            <Text style={[styles.ringTotal, { color: theme.textSecondary }]}>/{state.total}</Text>
          </Text>
          <Text style={[styles.ringLabel, { color: theme.textSecondary }]}>
            {done ? 'all done' : 'answered'}
          </Text>
        </ProgressRing>
      </Animated.View>

      <Text style={[styles.day, { color: theme.textSecondary }]}>
        Day {state.programDay} of {PROGRAM_LENGTH_DAYS}
      </Text>

      {done ? (
        <Card theme={theme} style={styles.doneCard}>
          <Text style={[styles.doneTitle, { color: theme.success }]}>✓ Today is done</Text>
          <Text style={[styles.doneBody, { color: theme.textSecondary }]}>
            Come back tomorrow to keep the streak going.
          </Text>
        </Card>
      ) : (
        <Button
          label={
            state.answered === 0
              ? `Start today’s ${DAILY_QUESTION_COUNT}`
              : `Continue — ${remaining} to go`
          }
          onPress={() => router.push('/session')}
          theme={theme}
          style={styles.cta}
        />
      )}

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Answers are typed or spoken, never multiple choice.
      </Text>
      <Text style={[styles.disclosure, { color: theme.textSecondary }]}>
        Officials data as of {service.officialsDataVersion()} — always verify at
        uscis.gov/citizenship/testupdates
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: Space.md },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  streakNumber: { ...Type.display, fontSize: 52 },
  streakUnit: { ...Type.heading, fontWeight: '500' },
  streakLabel: { ...Type.bodySmall, marginTop: -Space.xs },
  freeze: { borderRadius: Radius.pill, paddingHorizontal: Space.md, paddingVertical: Space.xs },
  freezeText: { ...Type.caption, fontWeight: '700' },
  ringWrap: { marginTop: Space.xs },
  ringCount: { ...Type.display, fontSize: 46 },
  ringTotal: { ...Type.heading, fontWeight: '500' },
  ringLabel: { ...Type.caption, marginTop: -Space.xs },
  day: { ...Type.bodySmall },
  cta: { alignSelf: 'stretch', marginTop: Space.xs },
  doneCard: { alignSelf: 'stretch', alignItems: 'center', gap: Space.xs },
  doneTitle: { ...Type.heading },
  doneBody: { ...Type.bodySmall, textAlign: 'center' },
  hint: { ...Type.caption, textAlign: 'center', marginTop: Space.sm },
  disclosure: { ...Type.caption, fontSize: 11, textAlign: 'center', opacity: 0.75 },
});
