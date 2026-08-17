import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { getQuestion } from '../../domain/questions/bank';
import { ProgressService, type QuestionProgress } from '../../services/progressService';
import { resolveQuestion } from '../../services/sessionService';
import type { UserProfile } from '../../data/repositories';
import { useRepositories, useSessionService } from '../../ui/AppProvider';
import { PressableScale } from '../../ui/components/PressableScale';
import { Screen } from '../../ui/components/Screen';
import { SpeakButton } from '../../ui/components/SpeakButton';
import { Colors } from '../../ui/theme/colors';
import { HIT_TARGET, Radius, Space, Type } from '../../ui/theme/tokens';

/**
 * One question in full: the prompt, every accepted answer, the user's chosen
 * focus answers, and how they have done on it.
 *
 * Reachable from the progress grid. Focus picks are editable here rather than
 * only in the heat of a session, which is when people actually want to change
 * their mind about what to memorise.
 */
export default function QuestionDetail(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = useRepositories();
  const service = useSessionService();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const questionId = Number(id);
  const [progress, setProgress] = useState<QuestionProgress | undefined>();
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [detail, p] = await Promise.all([
        new ProgressService(repos).detail(questionId),
        service.profile(),
      ]);
      if (cancelled) return;
      setProgress(detail.progress);
      setFocusIds(detail.focusAnswerIds);
      setProfile(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId, repos, service]);

  if (!Number.isInteger(questionId) || questionId < 1 || questionId > 128) {
    return (
      <Screen centred>
        <Text style={{ color: theme.text }}>No such question.</Text>
      </Screen>
    );
  }

  const question = getQuestion(questionId);
  const resolved = resolveQuestion(question, profile);

  const toggle = async (answerId: string): Promise<void> => {
    const next = focusIds.includes(answerId)
      ? focusIds.filter((f) => f !== answerId)
      : [...focusIds, answerId];
    setFocusIds(next);
    await service.setFocusAnswers(questionId, next);
  };

  const answers = resolved.answers;
  const selectable = answers.length > 1;

  return (
    <Screen scroll contentStyle={styles.scroll}>
      <Stack.Screen options={{ title: `Question ${questionId}` }} />

      <Text style={[styles.prompt, { color: theme.text }]}>{question.prompt}</Text>
      <SpeakButton text={question.prompt} theme={theme} />

      {progress ? (
        <Text style={[styles.stats, { color: theme.textSecondary }]}>
          {progress.asked === 0
            ? 'Not seen yet'
            : `Answered ${progress.correct} of ${progress.asked} correctly`}
        </Text>
      ) : (
        <ActivityIndicator color={theme.accent} />
      )}

      {resolved.selfAttest ? (
        <View style={[styles.noteBox, { borderColor: theme.border }]}>
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            {resolved.note ??
              'This answer depends on who currently holds the office. Check uscis.gov/citizenship/testupdates.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {question.requiredCount > 1
              ? `Accepted answers — name ${question.requiredCount}`
              : answers.length > 1
                ? 'Accepted answers'
                : 'Accepted answer'}
          </Text>
          {selectable ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              Star the ones you want to remember. They lead the list when you miss this question.
            </Text>
          ) : null}

          {answers.map((a) => {
            const starred = focusIds.includes(a.id);
            return (
              <PressableScale
                key={a.id}
                onPress={selectable ? () => void toggle(a.id) : undefined}
                // A single accepted answer is not a control: without this it
                // still scaled and ticked under the finger with nothing to do.
                disabled={!selectable}
                haptic={selectable}
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
                  {a.display}
                </Text>
              </PressableScale>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: Space.md },
  prompt: Type.heading,
  stats: Type.bodySmall,
  sectionTitle: { ...Type.body, fontWeight: '700', marginTop: Space.sm },
  note: Type.bodySmall,
  noteBox: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    padding: Space.md,
    marginTop: Space.xs,
  },
  answer: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    minHeight: HIT_TARGET,
    justifyContent: 'center',
  },
  answerText: Type.body,
});
