import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { getQuestion } from '../../domain/questions/bank';
import { ProgressService, type ProgressSummary, type Strength } from '../../services/progressService';
import { useRepositories } from '../../ui/AppProvider';
import { Colors, type Theme } from '../../ui/theme/colors';

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
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const pct = Math.round((summary.mastered / summary.total) * 100);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
    >
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

      {/* All 128 at a glance. Tapping opens the question. */}
      <View style={styles.grid}>
        {summary.perQuestion.map((p) => (
          <Pressable
            key={p.questionId}
            onPress={() => router.push(`/question/${p.questionId}`)}
            style={[
              styles.cell,
              {
                backgroundColor: strengthColor(p.strength, theme),
                borderColor: p.strength === 'unseen' ? theme.border : 'transparent',
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
            <Pressable
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
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 10, paddingBottom: 60 },
  headline: { fontSize: 32, fontWeight: '800' },
  headlineUnit: { fontSize: 16, fontWeight: '500' },
  sub: { fontSize: 13, lineHeight: 18 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendText: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  cell: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 18 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  sectionLabel: { fontSize: 15 },
  sectionCount: { fontSize: 15, fontWeight: '700' },
  weakRow: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  weakNum: { fontSize: 12, fontWeight: '800', width: 38 },
  weakText: { fontSize: 14, flex: 1, lineHeight: 19 },
  weakScore: { fontSize: 12, fontWeight: '700' },
});
