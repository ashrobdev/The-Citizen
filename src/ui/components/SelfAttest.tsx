import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from './PressableScale';
import { Radius, Space, Type } from '../theme/tokens';
import type { Theme } from '../theme/colors';

const FALLBACK_NOTE =
  'This answer depends on who currently holds the office, and we don’t have a verified name for it. Check uscis.gov/citizenship/testupdates.';

/**
 * Asks the user to mark their own answer when the engine cannot.
 *
 * Shown for dynamic questions with no verified officeholder to grade against —
 * a vacant seat, an unfilled role, or a user who has not said where they live.
 * Grading against a guess would be worse than admitting we do not know.
 *
 * Was duplicated between the daily session and the Final Test; the wording had
 * already diverged slightly between the two copies.
 */
export function SelfAttest({
  note,
  onAnswer,
  theme,
}: {
  note: string | undefined;
  onAnswer: (correct: boolean) => void;
  theme: Theme;
}): React.ReactElement {
  return (
    <View style={styles.block}>
      <Text style={[styles.note, { color: theme.textSecondary }]}>{note ?? FALLBACK_NOTE}</Text>
      <Text style={[styles.question, { color: theme.text }]}>Did you get it right?</Text>
      <View style={styles.row}>
        <PressableScale
          onPress={() => onAnswer(true)}
          style={[styles.button, styles.flex, { backgroundColor: theme.success }]}
          accessibilityRole="button"
          accessibilityLabel="Yes, I got it right"
        >
          <Text style={[styles.buttonText, { color: theme.onAccent }]}>✓ Yes</Text>
        </PressableScale>
        <PressableScale
          onPress={() => onAnswer(false)}
          style={[styles.button, styles.flex, { backgroundColor: theme.error }]}
          accessibilityRole="button"
          accessibilityLabel="No, I got it wrong"
        >
          <Text style={[styles.buttonText, { color: theme.onAccent }]}>✕ No</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md, marginTop: Space.xs },
  note: Type.bodySmall,
  question: { ...Type.heading, marginTop: Space.xs },
  row: { flexDirection: 'row', gap: Space.sm },
  flex: { flex: 1 },
  button: { paddingVertical: Space.lg, borderRadius: Radius.md, alignItems: 'center' },
  buttonText: Type.button,
});
