import * as Speech from 'expo-speech';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';

import type { UserProfile } from '../../data/repositories';
import { OFFICIALS } from '../../services/sessionService';
import { bestEnglishVoice, refreshVoiceSelection, speakQuestion } from '../../services/narration';
import { useNotifications, useRepositories, useSessionService } from '../../ui/AppProvider';
import { PressableScale } from '../../ui/components/PressableScale';
import { ReminderSettings } from '../../ui/components/ReminderSettings';
import { Screen } from '../../ui/components/Screen';
import { HAPTICS_KEY, haptics } from '../../ui/haptics';
import { Colors, type Theme } from '../../ui/theme/colors';
import { HIT_TARGET, Radius, Space, Type } from '../../ui/theme/tokens';

const SAMPLE = 'What is the supreme law of the land?';

export default function Settings(): React.ReactElement {
  const service = useSessionService();
  const notifications = useNotifications();
  const repos = useRepositories();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [voice, setVoice] = useState<Speech.Voice | undefined>();
  const [loadingVoice, setLoadingVoice] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(haptics.isEnabled());

  const toggleHaptics = useCallback(
    (next: boolean) => {
      setHapticsOn(next);
      haptics.setEnabled(next);
      // Fire once on the way on, so the setting demonstrates itself.
      if (next) haptics.tap();
      void repos.kv.set(HAPTICS_KEY, next ? 'on' : 'off');
    },
    [repos],
  );

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
    <Screen scroll contentStyle={styles.scroll}>
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
          <PressableScale
            onPress={() => void speakQuestion(SAMPLE)}
            style={[styles.button, styles.flex, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.accent }]}>▶ Hear a sample</Text>
          </PressableScale>
          <PressableScale
            onPress={() => void loadVoice()}
            style={[styles.button, styles.flex, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.accent }]}>Re-check</Text>
          </PressableScale>
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Narration plays even when your phone is on silent, since you asked to hear it.
        </Text>
      </Section>

      <Section title="Reminders" theme={theme}>
        <ReminderSettings notifications={notifications} theme={theme} />
      </Section>

      <Section title="Haptics" theme={theme}>
        <View style={styles.toggleRow}>
          <Text style={[styles.value, styles.flex, { color: theme.text }]}>
            Vibration feedback
          </Text>
          <Switch
            value={hapticsOn}
            onValueChange={toggleHaptics}
            trackColor={{ true: theme.accent, false: theme.border }}
            accessibilityLabel="Vibration feedback"
          />
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          A tap on every button, and a short buzz when an answer is marked. Independent of
          Reduce Motion, which leaves haptics alone.
        </Text>
      </Section>

      <Section title="Officials data" theme={theme}>
        <Text style={[styles.value, { color: theme.text }]}>
          As of {OFFICIALS.dataVersion}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Senators, representatives, the President and the Vice President come from a
          maintained public dataset; governors, the Speaker and the Chief Justice come from
          Wikidata. Every change is reviewed by a human before it reaches the app.{'\n\n'}
          Officeholders change. USCIS is the authority — always confirm before your interview.
        </Text>
        <PressableScale
          onPress={() => void Linking.openURL('https://www.uscis.gov/citizenship/testupdates')}
          style={[styles.button, { borderColor: theme.border }]}
          accessibilityRole="link"
        >
          <Text style={[styles.buttonText, { color: theme.accent }]}>
            Open uscis.gov/citizenship/testupdates
          </Text>
        </PressableScale>
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
    </Screen>
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
  scroll: { gap: Space.md },
  section: { borderWidth: 1.5, borderRadius: Radius.lg, padding: Space.lg, gap: Space.sm },
  sectionTitle: Type.heading,
  value: { ...Type.body, fontWeight: '600' },
  hint: Type.bodySmall,
  row: { flexDirection: 'row', gap: Space.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  flex: { flex: 1 },
  button: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    minHeight: HIT_TARGET,
    justifyContent: 'center',
  },
  buttonText: { ...Type.bodySmall, fontWeight: '700', textAlign: 'center' },
});
