import {
  DEFAULT_NOTIFICATION_SETTINGS,
  planNotifications,
  type NotificationSettings,
  type PermissionState,
} from '../../domain/notifications/plan';
import { toDayKey } from '../../domain/scheduling/dayKey';
import { computeStreak } from '../../domain/scheduling/streak';
import type { Repositories } from '../../data/repositories';

import { reconcile, type NotificationPlatform } from './reconcile';

/**
 * The single entry point for keeping notifications in step with app state.
 *
 * Deliberately takes the platform as a constructor argument rather than
 * importing `expo-notifications`, so the whole flow — settings, planning,
 * reconciliation — is testable on node with the in-memory repositories.
 */

const KEY_SETTINGS = 'notifications.settings';
const KEY_ASK = 'notifications.ask';
const KEY_OFFICIALS_NOTIFIED = 'notifications.officialsNotifiedVersion';

export interface AskRecord {
  answeredAt: number;
  answer: 'yes' | 'no';
}

export class NotificationService {
  constructor(
    private readonly repos: Repositories,
    private readonly platform: NotificationPlatform,
    private readonly getPermission: () => Promise<PermissionState>,
  ) {}

  async settings(): Promise<NotificationSettings> {
    const raw = await this.repos.kv.get(KEY_SETTINGS);
    if (raw === undefined) return DEFAULT_NOTIFICATION_SETTINGS;
    try {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(JSON.parse(raw) as NotificationSettings) };
    } catch {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  }

  async saveSettings(settings: NotificationSettings, now: Date = new Date()): Promise<void> {
    await this.repos.kv.set(KEY_SETTINGS, JSON.stringify(settings));
    await this.sync(now);
  }

  /** Whether the in-app soft ask has been answered, so it is shown only once. */
  async askRecord(): Promise<AskRecord | undefined> {
    const raw = await this.repos.kv.get(KEY_ASK);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as AskRecord;
    } catch {
      return undefined;
    }
  }

  async recordAsk(answer: 'yes' | 'no', now: Date = new Date()): Promise<void> {
    await this.repos.kv.set(KEY_ASK, JSON.stringify({ answeredAt: now.getTime(), answer }));
  }

  async markOfficialsNotified(version: string): Promise<void> {
    await this.repos.kv.set(KEY_OFFICIALS_NOTIFIED, version);
  }

  /**
   * Reads current state, plans, and makes the OS match.
   *
   * Never throws. A notification failure must not be able to break a study
   * session, and every caller is on a path the user cares about far more than
   * this.
   */
  async sync(
    now: Date = new Date(),
    officials?: { availableVersion?: string; bundledVersion?: string; changeSummary?: string },
  ): Promise<void> {
    try {
      const [settings, permission, completedDays, notifiedVersion] = await Promise.all([
        this.settings(),
        this.getPermission(),
        this.repos.sessions.completedDailyDayKeys(),
        this.repos.kv.get(KEY_OFFICIALS_NOTIFIED),
      ]);

      const streak = computeStreak(completedDays, toDayKey(now));

      const planned = planNotifications({
        now: now.getTime(),
        permission,
        settings,
        completedDays,
        streak: streak.current,
        freezesHeld: streak.freezesHeld,
        ...(officials !== undefined
          ? {
              officials: {
                ...officials,
                ...(notifiedVersion !== undefined ? { notifiedVersion } : {}),
              },
            }
          : {}),
      });

      await reconcile(this.platform, planned);
    } catch {
      // Intentionally swallowed — see the doc comment.
    }
  }
}
