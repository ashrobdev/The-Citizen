import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { Theme } from '../theme/colors';

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
      void Speech.stop();
    };
  }, [text]);

  const toggle = (): void => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      // Slightly under normal pace: the audience is largely non-native English
      // speakers, and officers tend to speak deliberately.
      rate: 0.92,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <Pressable
      onPress={toggle}
      style={[styles.button, { borderColor: speaking ? theme.accent : theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop reading the question' : 'Read the question aloud'}
      hitSlop={8}
    >
      <Text style={[styles.label, { color: theme.accent }]}>
        {speaking ? '■  Stop' : '▶  Hear it'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '700' },
});
