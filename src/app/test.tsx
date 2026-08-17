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
  View,
  useColorScheme,
} from 'react-native';

import type { SessionRecord, UserProfile } from '../data/repositories';
import { isDecided, testOutcome } from '../domain/finaltest/spec';
import { FINAL_TEST_PASS_MARK } from '../domain/scheduling/config';
import { getQuestion } from '../domain/questions/bank';
import type { Question } from '../domain/questions/types';
import { gradeResponse, resolveQuestion, type GradedAnswer } from '../services/sessionService';
import { useSessionService } from '../ui/AppProvider';
import { AnswerInput } from '../ui/components/AnswerInput';
import { RevealCard } from '../ui/components/RevealCard';
import { SelfAttest } from '../ui/components/SelfAttest';
import { Mascot } from '../ui/components/Mascot';
import { Stripes } from '../ui/components/Stripes';
import { SpeakButton } from '../ui/components/SpeakButton';
import { Colors, type Theme } from '../ui/theme/colors';

type Phase =
  | { kind: 'intro' }
  | { kind: 'answering' }
  | { kind: 'revealed'; graded: GradedAnswer; finalCorrect: boolean }
  | { kind: 'self-attest'; graded: GradedAnswer }
  | { kind: 'result'; passed: boolean };

export default function FinalTest(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const [session, setSession] = useState<SessionRecord | undefined>();
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [inputs, setInputs] = useState<string[]>(['']);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [missed, setMissed] = useState<number[]>([]);
  const [focusPicks, setFocusPicks] = useState<string[]>([]);
  const [savedFocus, setSavedFocus] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | undefined>();

  const questionId = session?.questionIds[index];
  const question: Question | undefined =
    questionId === undefined ? undefined : getQuestion(questionId);

  useEffect(() => {
    if (!question) return;
    setInputs(Array.from({ length: question.requiredCount }, () => ''));
    setFocusPicks([]);

    let cancelled = false;
    void (async () => {
      const saved = await service.focusAnswersFor(question.id);
      if (!cancelled) setSavedFocus(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [question?.id, service]);

  const begin = useCallback(async () => {
    const created = await service.startFinalTest();
    setSession(created);
    setIndex(0);
    setCorrect(0);
    setWrong(0);
    setMissed([]);
    setPhase({ kind: 'answering' });
  }, [service]);

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
    setPhase(
      graded.selfAttested
        ? { kind: 'self-attest', graded }
        : { kind: 'revealed', graded, finalCorrect: graded.correct },
    );
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

      const nextCorrect = correct + (finalCorrect ? 1 : 0);
      const nextWrong = wrong + (finalCorrect ? 0 : 1);
      setCorrect(nextCorrect);
      setWrong(nextWrong);
      if (!finalCorrect) setMissed((m) => [...m, question.id]);

      // Stops the moment the outcome is decided, exactly as an officer would —
      // at twelve correct, or at nine wrong when a pass becomes impossible.
      if (isDecided(nextCorrect, nextWrong) || index + 1 >= session.questionIds.length) {
        await service.finishFinalTest(session.id);
        setPhase({ kind: 'result', passed: testOutcome(nextCorrect, nextWrong) === 'passed' });
        return;
      }

      setIndex(index + 1);
      setPhase({ kind: 'answering' });
    },
    [service, session, question, correct, wrong, index, focusPicks],
  );

  if (phase.kind === 'intro') {
    return <Intro theme={theme} onBegin={() => void begin()} />;
  }

  if (phase.kind === 'result') {
    return (
      <Result
        theme={theme}
        passed={phase.passed}
        correct={correct}
        missed={missed}
        onRetake={() => void begin()}
        onHome={() => router.replace('/')}
      />
    );
  }

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
      <Stack.Screen options={{ title: 'Final Test' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.score, { color: theme.textSecondary }]}>
          {correct} correct · need {FINAL_TEST_PASS_MARK} · {wrong} missed
        </Text>
        <Text style={[styles.number, { color: theme.textSecondary }]}>
          Question {question.id}
          {question.requiredCount > 1 ? ` · name ${question.requiredCount}` : ''}
        </Text>
        <Text style={[styles.prompt, { color: theme.text }]}>{question.prompt}</Text>
        <SpeakButton text={question.prompt} theme={theme} />

        {phase.kind === 'answering' ? (
          <AnswerInput
            question={question}
            inputs={inputs}
            onChange={setInputs}
            onSubmit={submit}
            submitLabel="Answer"
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

function Intro({ theme, onBegin }: { theme: Theme; onBegin: () => void }): React.ReactElement {
  return (
    <View style={[styles.centre, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Final Test' }} />
      <Mascot pose="pointing" size="medium" />
      <Stripes width={100} />
      <Text style={[styles.introTitle, { color: theme.text }]}>Final Test</Text>
      <Text style={[styles.introBody, { color: theme.textSecondary }]}>
        Up to 20 questions, exactly like the real interview. It ends the moment you
        reach {FINAL_TEST_PASS_MARK} correct — or once {FINAL_TEST_PASS_MARK} is out of reach.
      </Text>
      <Text style={[styles.introBody, { color: theme.textSecondary }]}>
        Take it as often as you like. It never affects your streak.
      </Text>
      <Pressable
        onPress={onBegin}
        style={[styles.button, styles.wide, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>Begin</Text>
      </Pressable>
    </View>
  );
}

function Result({
  theme,
  passed,
  correct,
  missed,
  onRetake,
  onHome,
}: {
  theme: Theme;
  passed: boolean;
  correct: number;
  missed: number[];
  onRetake: () => void;
  onHome: () => void;
}): React.ReactElement {
  return (
    <ScrollView
      contentContainerStyle={[styles.resultScroll, { backgroundColor: theme.background }]}
      style={{ backgroundColor: theme.background }}
    >
      <Stack.Screen options={{ title: passed ? 'Passed' : 'Not this time', headerBackVisible: false }} />

      {passed ? (
        <>
          <Mascot pose="cheering" size="large" />
          <Stripes width={130} />
          <Text style={[styles.resultTitle, { color: theme.success }]}>You passed</Text>
          <Text style={[styles.resultBody, { color: theme.text }]}>
            {correct} correct — that would pass the real civics test.
          </Text>
        </>
      ) : (
        <>
          <Mascot pose="encouraging" size="medium" />
          <Text style={[styles.resultTitle, { color: theme.text }]}>Not this time</Text>
          <Text style={[styles.resultBody, { color: theme.textSecondary }]}>
            {correct} correct. You need {FINAL_TEST_PASS_MARK}. These are the ones to review —
            they’ll come round sooner in your daily questions now.
          </Text>
        </>
      )}

      {missed.length > 0 ? (
        <View style={styles.missedList}>
          {missed.map((id) => (
            <View key={id} style={[styles.missedItem, { borderColor: theme.border }]}>
              <Text style={[styles.missedNum, { color: theme.accentAlt }]}>Q{id}</Text>
              <Text style={[styles.missedText, { color: theme.text }]}>
                {getQuestion(id).prompt}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={onRetake}
        style={[styles.button, styles.wide, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>Take it again</Text>
      </Pressable>
      <Pressable onPress={onHome} style={[styles.appeal, styles.wide, { borderColor: theme.border }]}>
        <Text style={[styles.appealText, { color: theme.accent }]}>Back to today</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  scroll: { padding: 22, gap: 12, paddingBottom: 60 },
  resultScroll: { padding: 24, gap: 12, alignItems: 'center', paddingBottom: 60, flexGrow: 1, justifyContent: 'center' },
  score: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  number: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  prompt: { fontSize: 23, fontWeight: '700', lineHeight: 30 },
  button: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  wide: { alignSelf: 'stretch', marginTop: 10 },
  appeal: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  appealText: { fontSize: 15, fontWeight: '700' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  introTitle: { fontSize: 30, fontWeight: '800' },
  introBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  resultTitle: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  resultBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  missedList: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  missedItem: { borderWidth: 1.5, borderRadius: 10, padding: 12, gap: 3 },
  missedNum: { fontSize: 12, fontWeight: '800' },
  missedText: { fontSize: 14, lineHeight: 20 },
});
