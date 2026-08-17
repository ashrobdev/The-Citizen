import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { speakQuestion, stopNarration } from '../../services/narration';
import type { Theme } from '../theme/colors';
import { Radius, Space, Type } from '../theme/tokens';
import { PressableScale } from './PressableScale';

/**
 * Reads a question aloud.
 *
 * The real civics test is oral — an officer speaks the question and you answer
 * out loud. Hearing it rather than reading it is a meaningful part of the
 * rehearsal, and text-to-speech ships inside Expo Go, so this half of "voice
 * mode" needs no development build. Speech *recognition* still does.
 */
export function SpeakButton({
  text,
  theme,
}: {
  text: string;
  theme: Theme;
}): React.ReactElement {
  const [speaking, setSpeaking] = useState(false);

  // Stop narration when the question changes or the screen goes away —
  // otherwise the previous question keeps talking over the next one.
  useEffect(() => {
    return () => {
      void stopNarration();
    };
  }, [text]);

  const toggle = (): void => {
    if (speaking) {
      void stopNarration();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    void speakQuestion(text, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <PressableScale
      onPress={toggle}
      style={[styles.button, { borderColor: speaking ? theme.accent : theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop reading the question' : 'Read the question aloud'}
      hitSlop={8}
    >
      <Text style={[styles.label, { color: theme.accent }]}>
        {speaking ? '■  Stop' : '▶  Hear it'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  label: { ...Type.bodySmall, fontWeight: '700' },
});
