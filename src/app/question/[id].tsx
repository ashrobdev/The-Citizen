import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { ProgressService, type QuestionProgress } from '../../services/progressService';
import { resolveQuestion } from '../../services/sessionService';
import type { UserProfile } from '../../data/repositories';
import { useRepositories, useSessionService } from '../../ui/AppProvider';
import { SpeakButton } from '../../ui/components/SpeakButton';
import { Colors } from '../../ui/theme/colors';

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
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>No such question.</Text>
      </View>
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
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
    >
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
              <Pressable
                key={a.id}
                onPress={selectable ? () => void toggle(a.id) : undefined}
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
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, gap: 11, paddingBottom: 60 },
  prompt: { fontSize: 21, fontWeight: '700', lineHeight: 28 },
  stats: { fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  note: { fontSize: 13, lineHeight: 19 },
  noteBox: { borderWidth: 1.5, borderRadius: 10, padding: 13, marginTop: 6 },
  answer: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  answerText: { fontSize: 15, lineHeight: 21 },
});
