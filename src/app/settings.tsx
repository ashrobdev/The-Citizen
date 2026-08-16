import * as Speech from 'expo-speech';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import type { UserProfile } from '../data/repositories';
import { OFFICIALS } from '../services/sessionService';
import { bestEnglishVoice, refreshVoiceSelection, speakQuestion } from '../services/narration';
import { useSessionService } from '../ui/AppProvider';
import { Colors, type Theme } from '../ui/theme/colors';

const SAMPLE = 'What is the supreme law of the land?';

export default function Settings(): React.ReactElement {
  const service = useSessionService();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [voice, setVoice] = useState<Speech.Voice | undefined>();
  const [loadingVoice, setLoadingVoice] = useState(true);

  const loadVoice = useCallback(async () => {
    setLoadingVoice(true);
    // Clear the cache so a voice installed since launch is picked up without
    // needing to restart the app.
    refreshVoiceSelection();
    const identifier = await bestEnglishVoice();
    const all = await Speech.getAvailableVoicesAsync().catch(() => []);
    setVoice(all.find((v) => v.identifier === identifier));
    setLoadingVoice(false);
  }, []);

  useEffect(() => {
    void (async () => {
      setProfile(await service.profile());
      await loadVoice();
    })();
  }, [service, loadVoice]);

  const jurisdiction = profile ? OFFICIALS.jurisdictions[profile.stateCode] : undefined;
  const enhanced = voice?.quality === Speech.VoiceQuality.Enhanced;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Section title="Where you live" theme={theme}>
        <Text style={[styles.value, { color: theme.text }]}>
          {jurisdiction?.name ?? 'Not set'}
          {profile?.district !== undefined
            ? profile.district === 'AL'
              ? ' · at-large district'
              : ` · district ${profile.district}`
            : ''}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Decides the answers to your senators, representative, governor and state capital.
        </Text>
        <Link href="/onboarding" style={[styles.button, { borderColor: theme.border }]}>
          <Text style={[styles.buttonText, { color: theme.accent }]}>Change</Text>
        </Link>
      </Section>

      <Section title="Spoken questions" theme={theme}>
        <Text style={[styles.value, { color: theme.text }]}>
          {loadingVoice ? 'Checking…' : (voice?.name ?? 'System default')}
          {enhanced ? ' · Enhanced' : ''}
        </Text>

        {!enhanced && !loadingVoice ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            You’re on a basic voice. iOS ships far better ones free — install a Premium
            English voice and the app will use it automatically:{'\n\n'}
            Settings → Accessibility → Spoken Content → Voices → English{'\n\n'}
            Then come back here and tap Re-check.
          </Text>
        ) : (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Using the best English voice installed on this device.
          </Text>
        )}

        <View style={styles.row}>
          <Pressable
            onPress={() => void speakQuestion(SAMPLE)}
            style={[styles.button, styles.flex, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.accent }]}>▶ Hear a sample</Text>
          </Pressable>
          <Pressable
            onPress={() => void loadVoice()}
            style={[styles.button, styles.flex, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.accent }]}>Re-check</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Narration plays even when your phone is on silent, since you asked to hear it.
        </Text>
      </Section>

      <Section title="Officials data" theme={theme}>
        <Text style={[styles.value, { color: theme.text }]}>
          As of {OFFICIALS.dataVersion}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Senators, representatives, the President and the Vice President come from a
          maintained public dataset. The Speaker, the Chief Justice and state governors are
          not included, so those questions ask you to mark yourself.{'\n\n'}
          Officeholders change. USCIS is the authority — always confirm before your interview.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL('https://www.uscis.gov/citizenship/testupdates')}
          style={[styles.button, { borderColor: theme.border }]}
          accessibilityRole="link"
        >
          <Text style={[styles.buttonText, { color: theme.accent }]}>
            Open uscis.gov/citizenship/testupdates
          </Text>
        </Pressable>
      </Section>

      <Section title="About" theme={theme}>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Questions and answers are the USCIS 128-question civics test, 2025 version
          (M-1778).{'\n\n'}
          The Citizen is an independent study aid. It is not affiliated with, endorsed by, or
          connected to USCIS or any government agency, and passing the Final Test here is not
          a guarantee of anything.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={[styles.section, { borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 14, paddingBottom: 60 },
  section: { borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 9 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 9 },
  flex: { flex: 1 },
  button: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
