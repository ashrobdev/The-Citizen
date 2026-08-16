import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { getQuestion } from '../domain/questions/bank';
import type { Question, QuestionId } from '../domain/questions/types';
import type { SessionRecord, UserProfile } from '../data/repositories';
import { gradeResponse, resolveQuestion, type GradedAnswer } from '../services/sessionService';
import { useSessionService } from '../ui/AppProvider';
import { RevealCard } from '../ui/components/RevealCard';
import { Colors, type Theme } from '../ui/theme/colors';

type Phase =
  | { kind: 'answering' }
  /** Machine verdict shown; the user may still appeal. */
  | { kind: 'revealed'; graded: GradedAnswer; finalCorrect: boolean }
  /** Dynamic question — the engine cannot judge, so the user does. */
  | { kind: 'self-attest'; graded: GradedAnswer };

export default function Session(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const [session, setSession] = useState<SessionRecord | undefined>();
  const [queue, setQueue] = useState<QuestionId[]>([]);
  const [inputs, setInputs] = useState<string[]>(['']);
  const [phase, setPhase] = useState<Phase>({ kind: 'answering' });
  const [focusPicks, setFocusPicks] = useState<string[]>([]);
  const [savedFocus, setSavedFocus] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = await service.startOrResumeToday();
      if (cancelled) return;
      const answered = new Set(today.answeredQuestionIds);
      const remaining = today.session.questionIds.filter((id) => !answered.has(id));
      setSession(today.session);
      setTotal(today.session.questionIds.length);
      setQueue(remaining);
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  const currentId = queue[0];
  const question: Question | undefined = currentId === undefined ? undefined : getQuestion(currentId);

  // Multi-answer questions get one field per required answer.
  useEffect(() => {
    if (!question) return;
    setInputs(Array.from({ length: question.requiredCount }, () => ''));
    setPhase({ kind: 'answering' });
    setFocusPicks([]);

    // Load any answers this user previously chose to memorise, so a repeat
    // miss leads with their own picks rather than the full list again.
    let cancelled = false;
    void (async () => {
      const saved = await service.focusAnswersFor(question.id);
      if (!cancelled) setSavedFocus(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [question?.id, service]);

  const answeredCount = total - queue.length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await service.profile();
      if (!cancelled) setProfile(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  const submit = useCallback(() => {
    if (!question) return;
    const joined = inputs.map((s) => s.trim()).filter((s) => s.length > 0).join(', ');
    if (joined.length === 0) return;

    const graded = gradeResponse(question, resolveQuestion(question, profile), joined, 'text');
    if (graded.selfAttested) {
      setPhase({ kind: 'self-attest', graded });
    } else {
      setPhase({ kind: 'revealed', graded, finalCorrect: graded.correct });
    }
  }, [question, inputs, profile]);

  const advance = useCallback(
    async (graded: GradedAnswer, finalCorrect: boolean, selfGraded: boolean) => {
      if (!session || !question) return;

      await service.recordAttempt({
        session,
        questionId: question.id,
        graded,
        selfGraded,
        finalCorrect,
      });

      if (focusPicks.length > 0) {
        await service.setFocusAnswers(question.id, focusPicks);
      }

      const rest = queue.slice(1);
      if (rest.length === 0) {
        await service.completeSession(session.id);
        router.replace('/summary');
        return;
      }
      setQueue(rest);
    },
    [service, session, question, queue, focusPicks, router],
  );

  if (!session || !question) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: `${answeredCount + 1} of ${total}` }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.number, { color: theme.textSecondary }]}>
          Question {question.id}
          {question.requiredCount > 1 ? ` · name ${question.requiredCount}` : ''}
        </Text>
        <Text style={[styles.prompt, { color: theme.text }]}>{question.prompt}</Text>

        {phase.kind === 'answering' ? (
          <AnswerFields
            question={question}
            inputs={inputs}
            onChange={setInputs}
            onSubmit={submit}
            theme={theme}
          />
        ) : null}

        {phase.kind === 'self-attest' ? (
          <SelfAttest
            theme={theme}
            note={phase.graded.note}
            onAnswer={(correct) => void advance(phase.graded, correct, true)}
          />
        ) : null}

        {phase.kind === 'revealed' ? (
          <RevealCard
            question={question}
            graded={phase.graded}
            finalCorrect={phase.finalCorrect}
            savedFocusIds={savedFocus}
            pendingPicks={focusPicks}
            onTogglePick={(id) =>
              setFocusPicks((prev) =>
                prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
              )
            }
            onAppeal={() => setPhase({ ...phase, finalCorrect: true })}
            onNext={() =>
              void advance(
                phase.graded,
                phase.finalCorrect,
                phase.finalCorrect !== phase.graded.correct,
              )
            }
            theme={theme}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AnswerFields({
  question,
  inputs,
  onChange,
  onSubmit,
  theme,
}: {
  question: Question;
  inputs: string[];
  onChange: (v: string[]) => void;
  onSubmit: () => void;
  theme: Theme;
}): React.ReactElement {
  return (
    <View style={styles.block}>
      {inputs.map((value, i) => (
        <TextInput
          key={i}
          value={value}
          onChangeText={(t) => onChange(inputs.map((v, j) => (i === j ? t : v)))}
          placeholder={question.requiredCount > 1 ? `Answer ${i + 1} of ${question.requiredCount}` : 'Your answer'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          // Mobile autocorrect fights proper nouns relentlessly and would
          // rewrite half the answers in this test.
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          returnKeyType={i === inputs.length - 1 ? 'done' : 'next'}
          onSubmitEditing={i === inputs.length - 1 ? onSubmit : undefined}
          accessibilityLabel={`Answer field ${i + 1}`}
        />
      ))}
      <Pressable
        onPress={onSubmit}
        style={[styles.button, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Check</Text>
      </Pressable>
    </View>
  );
}

function SelfAttest({
  theme,
  note,
  onAnswer,
}: {
  theme: Theme;
  note: string | undefined;
  onAnswer: (correct: boolean) => void;
}): React.ReactElement {
  return (
    <View style={styles.block}>
      <Text style={[styles.attestNote, { color: theme.textSecondary }]}>
        {note ??
          'This answer depends on who currently holds the office, and we don’t have a verified name for it. Check uscis.gov/citizenship/testupdates.'}
      </Text>
      <Text style={[styles.attestQuestion, { color: theme.text }]}>Did you get it right?</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onAnswer(true)}
          style={[styles.button, styles.flex, { backgroundColor: theme.success }]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>✓ Yes</Text>
        </Pressable>
        <Pressable
          onPress={() => onAnswer(false)}
          style={[styles.button, styles.flex, { backgroundColor: theme.error }]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>✕ No</Text>
        </Pressable>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 22, gap: 14, paddingBottom: 60 },
  number: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  prompt: { fontSize: 23, fontWeight: '700', lineHeight: 30 },
  block: { gap: 11, marginTop: 6 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 17 },
  button: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  attestNote: { fontSize: 13, lineHeight: 19 },
  attestQuestion: { fontSize: 17, fontWeight: '700', marginTop: 2 },
});
