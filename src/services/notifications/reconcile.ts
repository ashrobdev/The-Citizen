import type { PlannedNotification } from '../../domain/notifications/plan';

/**
 * Makes the OS's scheduled notifications match the plan.
 *
 * Kept behind a port so the logic is testable on node without an Expo runtime —
 * `expoPlatform.ts` is the only file that touches `expo-notifications`.
 */

export interface ScheduledItem {
  /** The OS's identifier, needed to cancel. */
  id: string;
  /** Our stable key, carried in the notification's data payload. */
  key: string;
  /** Our content hash, so a copy or time change is detectable. */
  hash: string;
}

export interface NotificationPlatform {
  /** MUST return only notifications belonging to this app. See the note below. */
  getScheduled(): Promise<ScheduledItem[]>;
  schedule(notification: PlannedNotification): Promise<void>;
  cancel(id: string): Promise<void>;
}

export interface ReconcileResult {
  scheduled: number;
  cancelled: number;
  unchanged: number;
}

/**
 * Cancels what no longer belongs and schedules what is missing.
 *
 * Notifications are identified by a key carried in their own data payload
 * rather than by a list of ids we store. A stored list drifts the moment the OS
 * fires or drops one, and there is no way to notice.
 *
 * This is also why there is no "cancel everything" path: in Expo Go every
 * project shares one host app, so cancelling all scheduled notifications would
 * throw away other apps' work. `getScheduled` must filter to ours.
 */
export async function reconcile(
  platform: NotificationPlatform,
  planned: readonly PlannedNotification[],
): Promise<ReconcileResult> {
  const existing = await platform.getScheduled();
  const byKey = new Map(existing.map((item) => [item.key, item]));
  const plannedKeys = new Set(planned.map((p) => p.key));

  let cancelled = 0;
  let scheduled = 0;
  let unchanged = 0;

  // Anything no longer planned, or planned differently, goes.
  for (const item of existing) {
    const stillWanted = plannedKeys.has(item.key);
    const match = planned.find((p) => p.key === item.key);
    if (!stillWanted || match?.hash !== item.hash) {
      await platform.cancel(item.id);
      cancelled++;
    }
  }

  for (const p of planned) {
    const current = byKey.get(p.key);
    if (current !== undefined && current.hash === p.hash) {
      unchanged++;
      continue;
    }
    await platform.schedule(p);
    scheduled++;
  }

  return { scheduled, cancelled, unchanged };
}
