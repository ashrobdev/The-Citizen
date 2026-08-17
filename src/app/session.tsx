import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
} from 'react-native';

import { getQuestion } from '../domain/questions/bank';
import type { Question, QuestionId } from '../domain/questions/types';
import type { SessionRecord, UserProfile } from '../data/repositories';
import { gradeResponse, resolveQuestion, type GradedAnswer } from '../services/sessionService';
import { useNotifications, useSessionService } from '../ui/AppProvider';
import { AnswerInput } from '../ui/components/AnswerInput';
import { RevealCard } from '../ui/components/RevealCard';
import { Screen } from '../ui/components/Screen';
import { SelfAttest } from '../ui/components/SelfAttest';
import { SpeakButton } from '../ui/components/SpeakButton';
import { haptics } from '../ui/haptics';
import { Colors } from '../ui/theme/colors';
import { Space, Type } from '../ui/theme/tokens';

type Phase =
  | { kind: 'answering' }
  /** Machine verdict shown; the user may still appeal. */
  | { kind: 'revealed'; graded: GradedAnswer; finalCorrect: boolean }
  /** Dynamic question — the engine cannot judge, so the user does. */
  | { kind: 'self-attest'; graded: GradedAnswer };

export default function Session(): React.ReactElement {
  const service = useSessionService();
  const notifications = useNotifications();
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
    // `getQuestion` returns the same object from the bank's Map for a given id,
    // so depending on the question is equivalent to depending on its id.
  }, [question, service]);

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
      // Warning, not error: "here is what it was", never "you failed".
      if (graded.correct) haptics.success();
      else haptics.warning();
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
        // Re-plan immediately: today's reminder and tonight's streak nudge must
        // stop the moment the day is done, not at the next app launch.
        await notifications.sync();
        router.replace('/summary');
        return;
      }
      setQueue(rest);
    },
    [service, notifications, session, question, queue, focusPicks, router],
  );

  if (!session || !question) {
    return (
      <Screen centred>
        <ActivityIndicator color={theme.accent} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: `${answeredCount + 1} of ${total}` }} />
      <Screen scroll contentStyle={styles.scroll}>
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
            submitLabel="Check"
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: Space.md },
  number: { ...Type.overline, textTransform: 'uppercase' },
  prompt: Type.question,
});
