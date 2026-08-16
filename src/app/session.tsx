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
import type { SessionRecord } from '../data/repositories';
import { gradeResponse, type GradedAnswer } from '../services/sessionService';
import { useSessionService } from '../ui/AppProvider';
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
  }, [question?.id]);

  const answeredCount = total - queue.length;

  const submit = useCallback(() => {
    if (!question) return;
    const joined = inputs.map((s) => s.trim()).filter((s) => s.length > 0).join(', ');
    if (joined.length === 0) return;

    const graded = gradeResponse(question, joined, 'text');
    if (graded.selfAttested) {
      setPhase({ kind: 'self-attest', graded });
    } else {
      setPhase({ kind: 'revealed', graded, finalCorrect: graded.correct });
    }
  }, [question, inputs]);

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
            onAnswer={(correct) => void advance(phase.graded, correct, true)}
          />
        ) : null}

        {phase.kind === 'revealed' ? (
          <Reveal
            question={question}
            graded={phase.graded}
            finalCorrect={phase.finalCorrect}
            focusPicks={focusPicks}
            onTogglePick={(id) =>
              setFocusPicks((prev) =>
                prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
              )
            }
            onAppeal={() => setPhase({ ...phase, finalCorrect: true })}
            onNext={() =>
              void advance(phase.graded, phase.finalCorrect, phase.finalCorrect !== phase.graded.correct)
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
  onAnswer,
}: {
  theme: Theme;
  onAnswer: (correct: boolean) => void;
}): React.ReactElement {
  return (
    <View style={styles.block}>
      <Text style={[styles.attestNote, { color: theme.textSecondary }]}>
        This answer depends on who currently holds the office, so it can’t be checked
        automatically yet. Verify it at uscis.gov/citizenship/testupdates.
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

function Reveal({
  question,
  graded,
  finalCorrect,
  focusPicks,
  onTogglePick,
  onAppeal,
  onNext,
  theme,
}: {
  question: Question;
  graded: GradedAnswer;
  finalCorrect: boolean;
  focusPicks: string[];
  onTogglePick: (id: string) => void;
  onAppeal: () => void;
  onNext: () => void;
  theme: Theme;
}): React.ReactElement {
  const multiple = question.answers.length > 1;

  return (
    <View style={styles.block}>
      {/* Never colour alone: icon and label always accompany the verdict. */}
      <Text
        style={[styles.verdict, { color: finalCorrect ? theme.success : theme.error }]}
        accessibilityLiveRegion="polite"
      >
        {finalCorrect ? '✓  Correct' : '✕  Not quite'}
      </Text>

      {graded.multi ? (
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {graded.multi.matchedCount} of {graded.multi.requiredCount} matched
        </Text>
      ) : null}

      {!finalCorrect ? (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {multiple ? 'Accepted answers' : 'Accepted answer'}
          </Text>
          {multiple ? (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              Tap the ones you want to remember. They’ll be shown first next time.
            </Text>
          ) : null}

          {question.answers.map((a) => {
            const picked = focusPicks.includes(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={multiple ? () => onTogglePick(a.id) : undefined}
                style={[
                  styles.answer,
                  {
                    borderColor: picked ? theme.accent : theme.border,
                    backgroundColor: picked ? theme.surface : 'transparent',
                  },
                ]}
                accessibilityRole={multiple ? 'checkbox' : 'text'}
                accessibilityState={multiple ? { checked: picked } : undefined}
              >
                <Text style={[styles.answerText, { color: theme.text }]}>
                  {picked ? '★  ' : ''}
                  {a.display}
                </Text>
              </Pressable>
            );
          })}

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
  verdict: { fontSize: 21, fontWeight: '800' },
  sub: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  answer: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  answerText: { fontSize: 15, lineHeight: 21 },
  appeal: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  appealText: { fontSize: 15, fontWeight: '700' },
  attestNote: { fontSize: 13, lineHeight: 19 },
  attestQuestion: { fontSize: 17, fontWeight: '700', marginTop: 2 },
});
