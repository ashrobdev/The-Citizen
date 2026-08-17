import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { NotificationSettings, PermissionState } from '../../domain/notifications/plan';
import {
  canAskAgain as canAskAgainAsync,
  getPermission,
  requestPermission,
} from '../../services/notifications/expoPlatform';
import type { NotificationService } from '../../services/notifications/notificationService';
import { HIT_TARGET, Radius, Space, Type } from '../theme/tokens';
import type { Theme } from '../theme/colors';

/**
 * Reminder controls.
 *
 * The time picker is a row of pills rather than a wheel: for a study reminder a
 * coarse grid is easier to hit than a spinner, and restricting the range to
 * 06:00–22:00 makes the DST non-existent-hour problem unreachable rather than
 * something to handle.
 */

const FIRST_HOUR = 6;
const LAST_HOUR = 22;

function timeSlots(): Array<{ hour: number; minute: number; label: string }> {
  const out: Array<{ hour: number; minute: number; label: string }> = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour++) {
    for (const minute of [0, 30]) {
      if (hour === LAST_HOUR && minute === 30) continue;
      const suffix = hour < 12 ? 'am' : 'pm';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      out.push({ hour, minute, label: `${display}:${minute === 0 ? '00' : '30'}${suffix}` });
    }
  }
  return out;
}

const SLOTS = timeSlots();

export function ReminderSettings({
  notifications,
  theme,
}: {
  notifications: NotificationService;
  theme: Theme;
}): React.ReactElement {
  const [settings, setSettings] = useState<NotificationSettings | undefined>();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [canAsk, setCanAsk] = useState(true);

  const load = useCallback(async () => {
    const [s, p, ask] = await Promise.all([
      notifications.settings(),
      getPermission(),
      canAskAgainAsync(),
    ]);
    setSettings(s);
    setPermission(p);
    setCanAsk(ask);
  }, [notifications]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return <View />;

  const update = async (patch: Partial<NotificationSettings>): Promise<void> => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await notifications.saveSettings(next);
  };

  const enable = async (): Promise<void> => {
    const result = await requestPermission();
    setPermission(result);
    setCanAsk(await canAskAgainAsync());
    await notifications.sync();
  };

  // Blocked in system settings: the app cannot re-prompt, so pretending it can
  // with an enabled button would just look broken.
  if (permission === 'denied' && !canAsk) {
    return (
      <View style={styles.block}>
        <Text style={[styles.status, { color: theme.textSecondary }]}>
          Reminders are turned off for this app in your device settings.
        </Text>
        <Pressable
          onPress={() => void Linking.openSettings()}
          style={[styles.button, { borderColor: theme.border }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.accent }]}>Open device settings</Text>
        </Pressable>
      </View>
    );
  }

  if (permission !== 'granted') {
    return (
      <View style={styles.block}>
        <Text style={[styles.status, { color: theme.textSecondary }]}>
          A reminder so a busy day doesn’t cost you your streak.
        </Text>
        <Pressable
          onPress={() => void enable()}
          style={[styles.button, { backgroundColor: theme.accent, borderColor: theme.accent }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.onAccent }]}>Turn on reminders</Text>
        </Pressable>
      </View>
    );
  }

  const active = settings.enabled && settings.dailyEnabled;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.text }]}>Daily reminder</Text>
        <Switch
          value={settings.enabled && settings.dailyEnabled}
          onValueChange={(v) => void update({ enabled: true, dailyEnabled: v })}
          accessibilityLabel="Daily reminder"
        />
      </View>

      {active ? (
        <>
          <Text style={[styles.status, { color: theme.textSecondary }]}>Remind me around</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slots}>
            {SLOTS.map((slot) => {
              const selected = slot.hour === settings.hour && slot.minute === settings.minute;
              return (
                <Pressable
                  key={slot.label}
                  onPress={() => void update({ hour: slot.hour, minute: slot.minute })}
                  style={[
                    styles.slot,
                    {
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected ? theme.accent : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Remind me at ${slot.label}`}
                >
                  <Text style={[styles.slotText, { color: selected ? theme.onAccent : theme.text }]}>
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            <Text style={[styles.label, { color: theme.text }]}>Warn me if my streak is at risk</Text>
            <Switch
              value={settings.riskEnabled}
              onValueChange={(v) => void update({ riskEnabled: v })}
              accessibilityLabel="Warn me if my streak is at risk"
            />
          </View>
          <Text style={[styles.footnote, { color: theme.textSecondary }]}>
            An evening nudge, and only on days you haven’t finished.
          </Text>
        </>
      ) : null}

      <Text style={[styles.footnote, { color: theme.textSecondary }]}>
        In Expo Go these arrive from “Expo Go” rather than The Citizen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md },
  label: { ...Type.body, flex: 1 },
  status: { ...Type.bodySmall },
  footnote: { ...Type.caption },
  slots: { gap: Space.sm, paddingVertical: Space.xs },
  slot: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.lg,
    minHeight: HIT_TARGET,
    justifyContent: 'center',
  },
  slotText: { ...Type.bodySmall, fontWeight: '700' },
  button: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
  },
  buttonText: { ...Type.button, fontSize: 14 },
});
