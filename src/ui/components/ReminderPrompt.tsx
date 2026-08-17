import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { requestPermission } from '../../services/notifications/expoPlatform';
import type { NotificationService } from '../../services/notifications/notificationService';
import { Button } from './Button';
import { Radius, Space, Type } from '../theme/tokens';
import type { Theme } from '../theme/colors';

/**
 * The in-app ask for notification permission.
 *
 * Shown on the summary screen after a completed day, never during onboarding.
 * iOS shows its system prompt ONCE, ever — spending that on a stranger who has
 * not yet finished anything is how apps end up permanently denied. Here the
 * user has just built a streak and has something concrete to protect.
 *
 * "Not now" records the answer without touching the system prompt, so it can be
 * offered again later from Settings. Only "Yes" reaches iOS.
 */
export function ReminderPrompt({
  notifications,
  theme,
  onResolved,
}: {
  notifications: NotificationService;
  theme: Theme;
  onResolved: () => void;
}): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const asked = await notifications.askRecord();
      if (!cancelled) setVisible(asked === undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [notifications]);

  if (!visible) return null;

  const accept = async (): Promise<void> => {
    setVisible(false);
    await notifications.recordAsk('yes');
    await requestPermission();
    // Sync regardless of the answer: if permission was refused the plan is
    // empty, which is the correct outcome rather than an error.
    await notifications.sync();
    onResolved();
  };

  const decline = async (): Promise<void> => {
    setVisible(false);
    await notifications.recordAsk('no');
    onResolved();
  };

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.title, { color: theme.text }]}>Want a nudge tomorrow?</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        A reminder at 7:00pm so your streak survives a busy day. Nothing else, and you can
        turn it off any time.
      </Text>
      <View style={styles.row}>
        <Button
          label="Yes, remind me"
          onPress={() => void accept()}
          theme={theme}
          style={styles.grow}
        />
        <Button
          label="Not now"
          variant="secondary"
          onPress={() => void decline()}
          theme={theme}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.sm,
    alignSelf: 'stretch',
    marginTop: Space.lg,
  },
  title: { ...Type.heading },
  body: { ...Type.bodySmall },
  row: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
  grow: { flex: 1 },
});
