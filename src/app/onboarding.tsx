import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

import { toDayKey } from '../domain/scheduling/dayKey';
import { OFFICIALS } from '../services/sessionService';
import { useSessionService } from '../ui/AppProvider';
import { Mascot } from '../ui/components/Mascot';
import { PressableScale } from '../ui/components/PressableScale';
import { Screen } from '../ui/components/Screen';
import { Stripes } from '../ui/components/Stripes';
import { Colors } from '../ui/theme/colors';
import { HIT_TARGET, Radius, Space, Type } from '../ui/theme/tokens';

/**
 * Asks where the user lives, which four of the 128 questions depend on.
 *
 * State first, then congressional district. The district is skippable: not
 * everyone knows theirs, and refusing to continue would be a worse experience
 * than grading Q29 a little loosely. Skipping accepts any representative from
 * the state.
 */
export default function Onboarding(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  const [step, setStep] = useState<'state' | 'district'>('state');
  const [stateCode, setStateCode] = useState<string | undefined>();
  const [filter, setFilter] = useState('');

  const jurisdictions = useMemo(
    () =>
      Object.entries(OFFICIALS.jurisdictions)
        .map(([code, j]) => ({ code, name: j.name, type: j.type }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length === 0) return jurisdictions;
    return jurisdictions.filter(
      (j) => j.name.toLowerCase().includes(q) || j.code.toLowerCase() === q,
    );
  }, [filter, jurisdictions]);

  const districts = useMemo(() => {
    if (!stateCode) return [];
    return Object.keys(OFFICIALS.jurisdictions[stateCode]?.districts ?? {}).sort((a, b) => {
      if (a === 'AL') return -1;
      if (b === 'AL') return 1;
      return Number(a) - Number(b);
    });
  }, [stateCode]);

  const finish = async (district?: string): Promise<void> => {
    if (!stateCode) return;
    await service.saveProfile({
      stateCode,
      programStartDay: toDayKey(new Date()),
      voiceEnabled: false,
      ...(district !== undefined ? { district } : {}),
    });
    router.replace('/');
  };

  if (step === 'state') {
    return (
      <Screen contentStyle={styles.container}>
        <Stack.Screen options={{ title: 'Welcome', headerBackVisible: false }} />
        <View style={styles.intro}>
          <Mascot pose="greeting" size="medium" />
          <Stripes width={90} />
          <Text style={[styles.title, { color: theme.text }]}>Where do you live?</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Four of the 128 questions ask about your own state — your senators, your
            representative, your governor and your state capital.
          </Text>
        </View>

        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Search states"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.search,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
          ]}
          autoCorrect={false}
          accessibilityLabel="Search states"
        />

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {filtered.map((j) => (
            <PressableScale
              key={j.code}
              onPress={() => {
                setStateCode(j.code);
                setStep('district');
              }}
              style={[styles.row, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.rowText, { color: theme.text }]}>{j.name}</Text>
              <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{j.code}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  const jurisdiction = stateCode ? OFFICIALS.jurisdictions[stateCode] : undefined;
  const atLargeOnly = districts.length === 1 && districts[0] === 'AL';

  return (
    <Screen contentStyle={styles.container}>
      <Stack.Screen options={{ title: jurisdiction?.name ?? 'District' }} />
      <View style={styles.intro}>
        <Text style={[styles.title, { color: theme.text }]}>
          {atLargeOnly ? 'One district' : 'Which district?'}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {atLargeOnly
            ? `${jurisdiction?.name} has a single at-large seat, so there is only one answer.`
            : 'This decides the answer to “Name your U.S. representative.” If you’re not sure, skip it — any representative from your state will be accepted.'}
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.districtGrid}>
        {districts.map((d) => (
          <PressableScale
            key={d}
            onPress={() => void finish(d)}
            style={[styles.district, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={d === 'AL' ? 'At-large district' : `District ${d}`}
          >
            <Text style={[styles.districtText, { color: theme.text }]}>
              {d === 'AL' ? 'At-large' : d}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>

      <PressableScale
        onPress={() => void finish()}
        style={[styles.skip, { borderColor: theme.border }]}
        accessibilityRole="button"
      >
        <Text style={[styles.skipText, { color: theme.accent }]}>I’m not sure — skip</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: Space.md },
  intro: { gap: Space.sm, alignItems: 'center', marginTop: Space.sm },
  title: { ...Type.title, textAlign: 'center' },
  body: { ...Type.bodySmall, textAlign: 'center' },
  search: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    fontSize: 16,
  },
  list: { flex: 1 },
  row: {
    borderBottomWidth: 1,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: HIT_TARGET,
  },
  rowText: Type.body,
  rowCode: { ...Type.bodySmall, fontWeight: '700' },
  districtGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  district: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    minWidth: 56,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  districtText: { ...Type.body, fontWeight: '600' },
  skip: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  skipText: { ...Type.body, fontWeight: '700' },
});
