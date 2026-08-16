import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { toDayKey } from '../domain/scheduling/dayKey';
import { OFFICIALS } from '../services/sessionService';
import { useSessionService } from '../ui/AppProvider';
import { Stripes } from '../ui/components/Stripes';
import { Colors } from '../ui/theme/colors';

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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Welcome', headerBackVisible: false }} />
        <View style={styles.intro}>
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
            <Pressable
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
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  const jurisdiction = stateCode ? OFFICIALS.jurisdictions[stateCode] : undefined;
  const atLargeOnly = districts.length === 1 && districts[0] === 'AL';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
          <Pressable
            key={d}
            onPress={() => void finish(d)}
            style={[styles.district, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={d === 'AL' ? 'At-large district' : `District ${d}`}
          >
            <Text style={[styles.districtText, { color: theme.text }]}>
              {d === 'AL' ? 'At-large' : d}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        onPress={() => void finish()}
        style={[styles.skip, { borderColor: theme.border }]}
        accessibilityRole="button"
      >
        <Text style={[styles.skipText, { color: theme.accent }]}>I’m not sure — skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  intro: { gap: 8, alignItems: 'center', marginTop: 8 },
  title: { fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  search: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: { flex: 1 },
  row: {
    borderBottomWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowText: { fontSize: 16 },
  rowCode: { fontSize: 13, fontWeight: '700' },
  districtGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  district: {
    borderWidth: 1.5,
    borderRadius: 10,
    minWidth: 56,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  districtText: { fontSize: 16, fontWeight: '600' },
  skip: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  skipText: { fontSize: 15, fontWeight: '700' },
});
