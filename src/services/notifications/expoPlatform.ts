import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PermissionState } from '../../domain/notifications/plan';

import type { NotificationPlatform, ScheduledItem } from './reconcile';

/**
 * The only file that imports `expo-notifications`.
 *
 * Everything decision-shaped lives in `../../domain/notifications/plan.ts` and
 * `./reconcile.ts`, both of which run on plain node. This file is glue.
 *
 * There is deliberately NO barrel (`index.ts`) in this directory: re-exporting
 * this module alongside the tested ones would drag `expo-notifications` into
 * the node test run and break every domain test.
 */

/** Marks a notification as ours. See the warning on `getScheduled`. */
const APP_KEY = 'the-citizen';

/**
 * expo-notifications is a native module with no meaningful web implementation;
 * several of its methods throw rather than degrading. Web is a working target
 * here, so every entry point below returns a harmless empty result there.
 */
const SUPPORTED = Platform.OS !== 'web';

const CHANNEL_ID = 'reminders';

export function configureNotifications(): void {
  if (!SUPPORTED) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      // A study reminder does not need to make noise or decorate the icon.
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Android files notifications at the channel's importance, and the channel
  // must exist BEFORE the first schedule or reminders arrive silently.
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      vibrationPattern: [0, 250],
    });
  }
}

function toPermissionState(status: Notifications.PermissionStatus): PermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getPermission(): Promise<PermissionState> {
  if (!SUPPORTED) return 'denied';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return toPermissionState(status);
  } catch {
    return 'undetermined';
  }
}

export async function canAskAgain(): Promise<boolean> {
  if (!SUPPORTED) return false;
  try {
    const result = await Notifications.getPermissionsAsync();
    return result.canAskAgain !== false;
  } catch {
    return false;
  }
}

/**
 * Requests permission. Only ever call this from an explicit user action —
 * iOS shows the system prompt once, ever, and a dismissed prompt cannot be
 * recovered from inside the app.
 */
export async function requestPermission(): Promise<PermissionState> {
  if (!SUPPORTED) return 'denied';
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return toPermissionState(status);
  } catch {
    return 'denied';
  }
}

export function createExpoPlatform(): NotificationPlatform {
  return {
    /**
     * Returns only OUR scheduled notifications.
     *
     * This filter is load-bearing. In Expo Go every project shares one host
     * app, so an unfiltered list contains other people's notifications — which
     * is also why `cancelAllScheduledNotificationsAsync()` must never be called
     * anywhere in this codebase.
     */
    async getScheduled(): Promise<ScheduledItem[]> {
      if (!SUPPORTED) return [];
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const out: ScheduledItem[] = [];

      for (const request of all) {
        const data = request.content.data as
          | { appKey?: string; key?: string; hash?: string }
          | undefined;
        if (data?.appKey !== APP_KEY) continue;
        if (typeof data.key !== 'string' || typeof data.hash !== 'string') continue;
        out.push({ id: request.identifier, key: data.key, hash: data.hash });
      }

      return out;
    },

    async schedule(notification): Promise<void> {
      if (!SUPPORTED) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          sound: false,
          data: {
            appKey: APP_KEY,
            key: notification.key,
            hash: notification.hash,
            kind: notification.kind,
            route: notification.route,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notification.fireAt),
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
    },

    async cancel(id): Promise<void> {
      if (!SUPPORTED) return;
      await Notifications.cancelScheduledNotificationAsync(id);
    },
  };
}
