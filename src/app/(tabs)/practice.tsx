import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { FINAL_TEST_LENGTH, FINAL_TEST_PASS_MARK } from '../../domain/scheduling/config';
import { useSessionService } from '../../ui/AppProvider';
import { Card } from '../../ui/components/Card';
import { Mascot } from '../../ui/components/Mascot';
import { PressableScale } from '../../ui/components/PressableScale';
import { Screen } from '../../ui/components/Screen';
import { Colors } from '../../ui/theme/colors';
import { Radius, Space, Type } from '../../ui/theme/tokens';

/**
 * Practice — everything that is not the daily twelve.
 *
 * Currently the Final Test alone. It exists as a tab so the test is not buried
 * behind a link on the home screen, and so future drill modes have somewhere
 * obvious to live.
 */
export default function Practice(): React.ReactElement {
  const service = useSessionService();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const [taken, setTaken] = useState<number | undefined>();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const n = await service.finalTestsTaken();
        if (!cancelled) setTaken(n);
      })();
      return () => {
        cancelled = true;
      };
    }, [service]),
  );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Mascot pose="pointing" size="medium" />
        <Text style={[styles.title, { color: theme.text }]}>Practice</Text>
      </View>

      <PressableScale onPress={() => router.push('/test')} accessibilityRole="button">
        <Card theme={theme} style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Final Test</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Up to {FINAL_TEST_LENGTH} questions, exactly like the real interview. It ends the
            moment you reach {FINAL_TEST_PASS_MARK} correct.
          </Text>
          <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.pillText, { color: theme.text }]}>
              {taken === undefined
                ? ' '
                : taken === 0
                  ? 'Not taken yet'
                  : `Taken ${taken} ${taken === 1 ? 'time' : 'times'}`}
            </Text>
          </View>
        </Card>
      </PressableScale>

      <Text style={[styles.footnote, { color: theme.textSecondary }]}>
        The Final Test never affects your streak, so take it as often as you like.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Space.sm, marginBottom: Space.lg },
  title: { ...Type.title },
  card: { gap: Space.sm },
  cardTitle: { ...Type.heading },
  cardBody: { ...Type.bodySmall },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    marginTop: Space.xs,
  },
  pillText: { ...Type.caption, fontWeight: '700' },
  footnote: { ...Type.caption, marginTop: Space.lg, textAlign: 'center' },
});
