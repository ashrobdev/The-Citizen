import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getQuestion } from '../../domain/questions/bank';
import { ProgressService, type ProgressSummary, type Strength } from '../../services/progressService';
import { useRepositories } from '../../ui/AppProvider';
import { PressableScale } from '../../ui/components/PressableScale';
import { Screen } from '../../ui/components/Screen';
import { Colors, type Theme } from '../../ui/theme/colors';
import { HIT_TARGET, Radius, Space, Type } from '../../ui/theme/tokens';

const STRENGTH_LABEL: Record<Strength, string> = {
  mastered: 'Mastered',
  strong: 'Strong',
  learning: 'Learning',
  unseen: 'Not seen yet',
};

/** Strength is shown by fill AND label — never colour alone. */
function strengthColor(strength: Strength, theme: Theme): string {
  switch (strength) {
    case 'mastered':
      return theme.success;
    case 'strong':
      return theme.accent;
    case 'learning':
      return theme.accentAlt;
    case 'unseen':
      return 'transparent';
  }
}

export default function Progress(): React.ReactElement {
  const repos = useRepositories();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const [summary, setSummary] = useState<ProgressSummary | undefined>();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const s = await new ProgressService(repos).summary();
        if (!cancelled) setSummary(s);
      })();
      return () => {
        cancelled = true;
      };
    }, [repos]),
  );

  if (!summary) {
    return (
      <Screen centred>
        <ActivityIndicator color={theme.accent} />
      </Screen>
    );
  }

  const pct = Math.round((summary.mastered / summary.total) * 100);

  return (
    <Screen scroll contentStyle={styles.scroll}>
      <Stack.Screen options={{ title: 'Progress' }} />

      <Text style={[styles.headline, { color: theme.text }]}>
        {summary.mastered}
        <Text style={[styles.headlineUnit, { color: theme.textSecondary }]}>
          {' '}
          of {summary.total} mastered
        </Text>
      </Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        {pct}% · {Math.round(summary.accuracy * 100)}% lifetime accuracy
      </Text>

      <View style={styles.legend}>
        {(['mastered', 'strong', 'learning', 'unseen'] as const).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: strengthColor(s, theme), borderColor: theme.border },
              ]}
            />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              {STRENGTH_LABEL[s]}{' '}
              {s === 'mastered'
                ? summary.mastered
                : s === 'strong'
                  ? summary.strong
                  : s === 'learning'
                    ? summary.learning
                    : summary.unseen}
            </Text>
          </View>
        ))}
      </View>

      {/*
        All 128 at a glance. Tapping opens the question.

        Plain Pressable with an opacity callback rather than PressableScale:
        that would put 128 Reanimated shared values and animated styles in one
        scrolling view, which is a real cost for feedback nobody studies. The
        press is still visible.
      */}
      <View style={styles.grid}>
        {summary.perQuestion.map((p) => (
          <Pressable
            key={p.questionId}
            onPress={() => router.push(`/question/${p.questionId}`)}
            style={({ pressed }) => [
              styles.cell,
              {
                backgroundColor: strengthColor(p.strength, theme),
                borderColor: p.strength === 'unseen' ? theme.border : 'transparent',
                opacity: pressed ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Question ${p.questionId}, ${STRENGTH_LABEL[p.strength]}`}
          >
            <Text
              style={[
                styles.cellText,
                { color: p.strength === 'unseen' ? theme.textSecondary : theme.onAccent },
              ]}
            >
              {p.questionId}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>By section</Text>
      {(
        [
          ['government', 'American Government'],
          ['history', 'American History'],
          ['symbols', 'Symbols and Holidays'],
        ] as const
      ).map(([key, label]) => {
        const s = summary.bySection[key];
        return (
          <View key={key} style={styles.sectionRow}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>{label}</Text>
            <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>
              {s.mastered} / {s.total}
            </Text>
          </View>
        );
      })}

      {summary.weakest.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Worth revising</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            The ones you miss most. They already come round sooner in your daily questions.
          </Text>
          {summary.weakest.map((w) => (
            <PressableScale
              key={w.questionId}
              onPress={() => router.push(`/question/${w.questionId}`)}
              style={[styles.weakRow, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.weakNum, { color: theme.accentAlt }]}>Q{w.questionId}</Text>
              <Text style={[styles.weakText, { color: theme.text }]} numberOfLines={2}>
                {getQuestion(w.questionId).prompt}
              </Text>
              <Text style={[styles.weakScore, { color: theme.textSecondary }]}>
                {w.correct}/{w.asked}
              </Text>
            </PressableScale>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: Space.sm },
  headline: Type.title,
  headlineUnit: { ...Type.body, fontWeight: '500' },
  sub: Type.bodySmall,
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendText: Type.caption,
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, marginTop: Space.sm },
  // The grid is a dense overview, not a control surface — 128 cells at the 44pt
  // minimum would be four screens of scrolling. The same questions are reachable
  // at full size from "Worth revising" and from the daily session.
  cell: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { ...Type.heading, marginTop: Space.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Space.sm },
  sectionLabel: Type.body,
  sectionCount: { ...Type.body, fontWeight: '700' },
  weakRow: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    padding: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: HIT_TARGET,
  },
  weakNum: { ...Type.caption, fontWeight: '800', width: 38 },
  weakText: { ...Type.bodySmall, flex: 1 },
  weakScore: { ...Type.caption, fontWeight: '700' },
});
