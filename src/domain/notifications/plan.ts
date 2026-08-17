import { DAY_START_HOUR } from '../scheduling/config';
import { addDays, fromDayKey, toDayKey } from '../scheduling/dayKey';
import type { DayKey } from '../scheduling/types';

/**
 * Decides which notifications should exist, given the current state.
 *
 * Pure — no Expo, no scheduling, no side effects — so every rule below is unit
 * tested on node. The platform layer's only job is to make reality match what
 * this returns.
 *
 * ## Why a rolling window rather than a repeating trigger
 *
 * A repeating daily trigger cannot skip an occurrence. Schedule "7pm every day"
 * and it fires at 7pm on a day the user finished at lunchtime, which teaches
 * people to ignore it. Instead this plans individual one-off notifications and
 * is re-run whenever state changes; finishing a day simply removes today's
 * entries from the plan, and reconciliation cancels them. "Never nags someone
 * who already finished" is therefore a property of a pure function rather than
 * a promise about bookkeeping.
 */

export type ReminderKind = 'daily_reminder' | 'streak_risk' | 'officials_updated';

export interface PlannedNotification {
  /** Stable identity, so re-planning is idempotent. */
  key: string;
  kind: ReminderKind;
  /** Epoch millis. */
  fireAt: number;
  title: string;
  body: string;
  /** Deep-link target for a tap. */
  route: string;
  /** Changes when copy or timing changes, so reconcile knows to reschedule. */
  hash: string;
}

export interface NotificationSettings {
  enabled: boolean;
  dailyEnabled: boolean;
  riskEnabled: boolean;
  /** 6–22; see the picker range note below. */
  hour: number;
  minute: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  dailyEnabled: true,
  riskEnabled: true,
  hour: 19,
  minute: 0,
};

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface NotificationInputs {
  now: number;
  permission: PermissionState;
  settings: NotificationSettings;
  /** Local days with a completed daily session. */
  completedDays: readonly DayKey[];
  streak: number;
  freezesHeld: number;
  officials?: {
    availableVersion?: string;
    notifiedVersion?: string;
    bundledVersion?: string;
    /**
     * Copy naming what changed in *this* user's answers, from
     * `describeChanges` in `domain/officials/diff`. Absent or empty means the
     * update touched nobody they are graded on, and nothing is scheduled.
     */
    changeSummary?: string;
  };
  horizonDays?: number;
}

/**
 * Fourteen days.
 *
 * Not the iOS cap of 64: in Expo Go that budget is shared with every other
 * project run on the device, so a modest window is a good neighbour. Fourteen
 * days of silence is also well past the point where the streak is gone.
 */
export const HORIZON_DAYS = 14;

/** Nothing is scheduled inside this window; it would fire while the user is looking at Settings. */
const MIN_LEAD_MS = 60_000;

/** Latest a streak nudge may fire. Past this it is an interruption, not a nudge. */
const RISK_LATEST_HOUR = 23;
const RISK_EARLIEST_HOUR = 21;

/**
 * The instant at a given wall-clock time belonging to `dayKey`'s window.
 *
 * The programme treats a day as running 04:00 → 04:00 (`DAY_START_HOUR`), so a
 * 1am session counts as the previous day. Reuses `fromDayKey`, which anchors at
 * midday and is therefore already safe across DST transitions.
 */
export function instantForDayKey(dayKey: DayKey, hour: number, minute: number): number {
  const d = fromDayKey(dayKey);
  d.setHours(hour, minute, 0, 0);
  // An hour before 4am belongs to the following calendar date.
  if (hour < DAY_START_HOUR) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function hashOf(parts: readonly (string | number)[]): string {
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * How often to remind, by days from today.
 *
 * Every day for the first three, then every third day. Because day 0 is
 * re-planned every time the app opens, an active user gets a reminder daily; a
 * user who has stopped opening the app gets a decaying trickle rather than
 * fourteen identical nags.
 */
function shouldRemindOnOffset(offset: number): boolean {
  return offset <= 2 || offset % 3 === 0;
}

/**
 * When a streak nudge fires, in minutes past midnight, or null to skip it.
 *
 * Computed in minutes rather than whole hours: a 21:30 reminder puts the nudge
 * at 23:30, which is past the cutoff, but comparing only the hours rounds that
 * down to 23:00 and lets it through.
 */
function riskMinutesFor(settings: NotificationSettings): number | null {
  const reminderMinutes = settings.hour * 60 + settings.minute;
  const minutes = Math.max(RISK_EARLIEST_HOUR * 60, reminderMinutes + 120);
  // If the user's own reminder is already late evening, a second nudge shortly
  // after is noise rather than help.
  if (minutes > RISK_LATEST_HOUR * 60) return null;
  return minutes;
}

export function planNotifications(input: NotificationInputs): PlannedNotification[] {
  const { now, permission, settings, streak, freezesHeld } = input;
  const horizon = input.horizonDays ?? HORIZON_DAYS;

  if (!settings.enabled || permission !== 'granted') return [];

  const today = toDayKey(new Date(now));
  const completed = new Set(input.completedDays);
  const out: PlannedNotification[] = [];

  // ---- Daily reminders -------------------------------------------------
  if (settings.dailyEnabled) {
    for (let offset = 0; offset < horizon; offset++) {
      if (!shouldRemindOnOffset(offset)) continue;

      const day = addDays(today, offset);
      // Future days are incomplete by definition, so this only ever skips today.
      if (completed.has(day)) continue;

      const fireAt = instantForDayKey(day, settings.hour, settings.minute);
      if (fireAt <= now + MIN_LEAD_MS) continue;

      // Past the first few days the streak is almost certainly gone; promising
      // otherwise would be a lie, so the copy softens and stops mentioning it.
      const soon = offset <= 2;
      const title = soon ? 'Your questions are ready' : 'Still here when you are';
      const body = soon
        ? 'Twelve questions, about five minutes.'
        : 'No pressure — pick up wherever you left off.';

      out.push({
        key: `daily_reminder:${day}`,
        kind: 'daily_reminder',
        fireAt,
        title,
        body,
        route: soon ? '/session' : '/',
        hash: hashOf(['daily', fireAt, title, body]),
      });
    }
  }

  // ---- Streak at risk --------------------------------------------------
  //
  // Today only. Tomorrow's completion is unknowable, and a nudge scheduled for
  // a day the user finishes at breakfast is exactly the failure this design
  // exists to avoid.
  if (settings.riskEnabled && streak > 0 && !completed.has(today)) {
    const riskMinutes = riskMinutesFor(settings);
    if (riskMinutes !== null) {
      const fireAt = instantForDayKey(today, Math.floor(riskMinutes / 60), riskMinutes % 60);
      if (fireAt > now + MIN_LEAD_MS) {
        // A held freeze does not suppress the warning. Spending it should be a
        // choice, not something that happens to someone who simply forgot.
        const protectedByFreeze = freezesHeld > 0;
        const title = protectedByFreeze
          ? `Your ${streak}-day streak is covered`
          : `Your ${streak}-day streak ends tonight`;
        const body = protectedByFreeze
          ? "You're holding a freeze, so tonight won't break it — but it's nicer not to spend it."
          : 'Twelve questions is about five minutes.';

        out.push({
          key: `streak_risk:${today}`,
          kind: 'streak_risk',
          fireAt,
          title,
          body,
          route: '/session',
          hash: hashOf(['risk', fireAt, title, body]),
        });
      }
    }
  }

  // ---- Officials updated ----------------------------------------------
  //
  // Deferred to the next reminder slot: the app can only discover an update
  // while it is open, and a notification about something you are already
  // looking at is pointless.
  //
  // Gated on `changeSummary` rather than on the version alone. A refresh across
  // 435 House seats changes something most weeks, and almost none of it is
  // relevant to any one person — an alert that is usually noise gets muted,
  // taking the one that matters with it. The caller decides what is relevant by
  // diffing the answers this user would actually be graded against.
  const officials = input.officials;
  if (
    officials?.availableVersion !== undefined &&
    officials.changeSummary !== undefined &&
    officials.changeSummary.length > 0 &&
    officials.availableVersion !== officials.notifiedVersion &&
    (officials.bundledVersion === undefined ||
      officials.availableVersion > officials.bundledVersion)
  ) {
    const version = officials.availableVersion;
    const soonest = now + 30 * 60_000;
    const nextSlot = instantForDayKey(addDays(today, 1), settings.hour, settings.minute);
    const fireAt = Math.max(soonest, Math.min(nextSlot, soonest + 24 * 3_600_000));
    const title = 'Officeholder answers updated';
    // Names what changed, because now we know. The old copy hedged with "may
    // have changed" precisely because it fired on any version bump.
    const body = officials.changeSummary;

    out.push({
      key: `officials_updated:${version}`,
      kind: 'officials_updated',
      fireAt,
      title,
      body,
      route: '/settings',
      hash: hashOf(['officials', version, fireAt, body]),
    });
  }

  return out;
}
