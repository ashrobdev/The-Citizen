import {
  DEFAULT_NOTIFICATION_SETTINGS,
  officialsFireAt,
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
const KEY_OFFICIALS_PENDING = 'notifications.officialsPending';

export interface AskRecord {
  answeredAt: number;
  answer: 'yes' | 'no';
}

/** A relevant officials change, held until its notification has fired. */
interface PendingOfficials {
  availableVersion: string;
  bundledVersion?: string;
  changeSummary: string;
  /** Anchors the fire time, so re-planning never moves it. */
  firstSeenAt: number;
}

export interface OfficialsUpdate {
  availableVersion?: string;
  bundledVersion?: string;
  changeSummary?: string;
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

  private async pendingOfficials(): Promise<PendingOfficials | undefined> {
    const raw = await this.repos.kv.get(KEY_OFFICIALS_PENDING);
    if (raw === undefined || raw.length === 0) return undefined;
    try {
      return JSON.parse(raw) as PendingOfficials;
    } catch {
      return undefined;
    }
  }

  /**
   * Records a relevant officials change, or keeps the one already held.
   *
   * Held rather than recomputed because `firstSeenAt` anchors the fire time: a
   * fresh timestamp on every sync would push the notification forward forever.
   */
  private async retainOfficials(
    update: OfficialsUpdate | undefined,
    notifiedVersion: string | undefined,
    now: Date,
  ): Promise<PendingOfficials | undefined> {
    const held = await this.pendingOfficials();

    // No new information: keep whatever is outstanding. This is what stops an
    // unrelated sync — finishing a day, changing the reminder time — from
    // dropping the announcement out of the plan and cancelling it.
    if (
      update?.availableVersion === undefined ||
      update.changeSummary === undefined ||
      update.changeSummary.length === 0
    ) {
      return held;
    }

    if (held?.availableVersion === update.availableVersion) return held;

    // Already announced. Every foreground reports the same current version, so
    // without this the record would be rewritten on each one for a notification
    // the planner then discards.
    if (update.availableVersion === notifiedVersion) return held;

    const pending: PendingOfficials = {
      availableVersion: update.availableVersion,
      ...(update.bundledVersion !== undefined ? { bundledVersion: update.bundledVersion } : {}),
      changeSummary: update.changeSummary,
      firstSeenAt: now.getTime(),
    };
    await this.repos.kv.set(KEY_OFFICIALS_PENDING, JSON.stringify(pending));
    return pending;
  }

  /**
   * Reads current state, plans, and makes the OS match.
   *
   * Never throws. A notification failure must not be able to break a study
   * session, and every caller is on a path the user cares about far more than
   * this.
   */
  async sync(now: Date = new Date(), officials?: OfficialsUpdate): Promise<void> {
    try {
      const [settings, permission, completedDays, notifiedVersion] = await Promise.all([
        this.settings(),
        this.getPermission(),
        this.repos.sessions.completedDailyDayKeys(),
        this.repos.kv.get(KEY_OFFICIALS_NOTIFIED),
      ]);

      const streak = computeStreak(completedDays, toDayKey(now));
      const pending = await this.retainOfficials(officials, notifiedVersion, now);

      const planned = planNotifications({
        now: now.getTime(),
        permission,
        settings,
        completedDays,
        streak: streak.current,
        freezesHeld: streak.freezesHeld,
        ...(pending !== undefined
          ? {
              officials: {
                ...pending,
                ...(notifiedVersion !== undefined ? { notifiedVersion } : {}),
              },
            }
          : {}),
      });

      await reconcile(this.platform, planned);

      // Retired only once its moment has passed, which is the point: marking it
      // at schedule time was what let the next sync suppress it and cancel a
      // notification that had not yet arrived.
      if (pending !== undefined && officialsFireAt(pending.firstSeenAt, settings) <= now.getTime()) {
        await this.markOfficialsNotified(pending.availableVersion);
        await this.repos.kv.set(KEY_OFFICIALS_PENDING, '');
      }
    } catch {
      // Intentionally swallowed — see the doc comment.
    }
  }
}
