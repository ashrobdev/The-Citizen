import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Question } from '../../domain/questions/types';
import type { GradedAnswer } from '../../services/sessionService';
import type { Theme } from '../theme/colors';
import { layoutAnswers } from './revealLayout';

/**
 * What the user sees after answering. Shared by the daily session and the Final
 * Test so the two cannot drift — the focus-answer feature only works if picks
 * made in one place resurface in the other.
 *
 * On a wrong answer it shows every accepted answer. Where the user has already
 * chosen which ones to memorise, those lead under "Your answers" and the rest
 * collapse beneath — the whole point of asking them to choose.
 */
export function RevealCard({
  question,
  graded,
  finalCorrect,
  savedFocusIds,
  pendingPicks,
  onTogglePick,
  onAppeal,
  onNext,
  theme,
}: {
  question: Question;
  graded: GradedAnswer;
  finalCorrect: boolean;
  /** Picks the user made previously, loaded from storage. */
  savedFocusIds: readonly string[];
  /** Picks being made right now, before they are saved. */
  pendingPicks: readonly string[];
  onTogglePick: (answerId: string) => void;
  onAppeal: () => void;
  onNext: () => void;
  theme: Theme;
}): React.ReactElement {
  const selectable = question.answers.length > 1;
  const { saved, others, hasSaved } = layoutAnswers(question.answers, savedFocusIds);

  const renderAnswer = (answerId: string, display: string, starred: boolean) => (
    <Pressable
      key={answerId}
      onPress={selectable ? () => onTogglePick(answerId) : undefined}
      style={[
        styles.answer,
        {
          borderColor: starred ? theme.accent : theme.border,
          backgroundColor: starred ? theme.surface : 'transparent',
        },
      ]}
      accessibilityRole={selectable ? 'checkbox' : 'text'}
      {...(selectable ? { accessibilityState: { checked: starred } } : {})}
    >
      <Text style={[styles.answerText, { color: theme.text }]}>
        {starred ? '★  ' : ''}
        {display}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.block}>
      {/* Verdict is never colour alone — icon and word always accompany it. */}
      <Text
        style={[styles.verdict, { color: finalCorrect ? theme.success : theme.error }]}
        accessibilityLiveRegion="polite"
      >
        {finalCorrect ? '✓  Correct' : '✕  Not quite'}
      </Text>

      {graded.multi && !finalCorrect ? (
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {graded.multi.matchedCount} of {graded.multi.requiredCount} matched
        </Text>
      ) : null}

      {!finalCorrect ? (
        <>
          {hasSaved ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.accent }]}>Your answers</Text>
              <Text style={[styles.sub, { color: theme.textSecondary }]}>
                The ones you chose to remember.
              </Text>
              {saved.map((a) =>
                renderAnswer(a.id, a.display, true),
              )}
              {others.length > 0 ? (
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Other accepted answers
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {selectable ? 'Accepted answers' : 'Accepted answer'}
              </Text>
              {selectable ? (
                <Text style={[styles.sub, { color: theme.textSecondary }]}>
                  Tap the ones you want to remember. They’ll be shown first next time.
                </Text>
              ) : null}
            </>
          )}

          {others.map((a) => renderAnswer(a.id, a.display, pendingPicks.includes(a.id)))}

          <Pressable
            onPress={onAppeal}
            style={[styles.appeal, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.appealText, { color: theme.accent }]}>
              I actually got this right
            </Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        onPress={onNext}
        style={[styles.button, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Next</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 11, marginTop: 6 },
  verdict: { fontSize: 21, fontWeight: '800' },
  sub: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  answer: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  answerText: { fontSize: 15, lineHeight: 21 },
  appeal: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  appealText: { fontSize: 15, fontWeight: '700' },
  button: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
