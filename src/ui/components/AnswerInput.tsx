import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Question } from '../../domain/questions/types';
import { PressableScale } from './PressableScale';
import { Radius, Space, Type } from '../theme/tokens';
import type { Theme } from '../theme/colors';

/**
 * The typed-answer field, shared by the daily session and the Final Test.
 *
 * These two screens each had their own copy, and had already drifted: the
 * session set `returnKeyType` on its fields and the test did not, so the
 * keyboard offered "next"/"done" in one place and neither in the other. The
 * submit label is the only difference that was ever intentional, so it is the
 * only one that survives as a prop.
 *
 * Calm by design — this is on screen while someone is trying to recall an
 * answer, so nothing here animates beyond the press feedback on the button.
 */
export function AnswerInput({
  question,
  inputs,
  onChange,
  onSubmit,
  submitLabel,
  theme,
}: {
  question: Question;
  inputs: readonly string[];
  onChange: (v: string[]) => void;
  onSubmit: () => void;
  /** "Check" during a daily session, "Answer" in the Final Test. */
  submitLabel: string;
  theme: Theme;
}): React.ReactElement {
  return (
    <View style={styles.block}>
      {inputs.map((value, i) => {
        const last = i === inputs.length - 1;
        return (
          <TextInput
            key={i}
            value={value}
            onChangeText={(t) => onChange(inputs.map((v, j) => (i === j ? t : v)))}
            placeholder={
              question.requiredCount > 1
                ? `Answer ${i + 1} of ${question.requiredCount}`
                : 'Your answer'
            }
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
            ]}
            // Mobile autocorrect fights proper nouns relentlessly and would
            // rewrite half the answers in this test.
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            returnKeyType={last ? 'done' : 'next'}
            onSubmitEditing={last ? onSubmit : undefined}
            accessibilityLabel={`Answer field ${i + 1}`}
          />
        );
      })}
      <PressableScale
        onPress={onSubmit}
        style={[styles.button, { backgroundColor: theme.accent }]}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
      >
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>{submitLabel}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md, marginTop: Space.xs },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    fontSize: 17,
  },
  button: { paddingVertical: Space.lg, borderRadius: Radius.md, alignItems: 'center' },
  buttonText: Type.button,
});
