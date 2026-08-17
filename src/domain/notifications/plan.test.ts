import fc from 'fast-check';

import { DAY_START_HOUR } from '../scheduling/config';
import { toDayKey } from '../scheduling/dayKey';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  HORIZON_DAYS,
  instantForDayKey,
  planNotifications,
  type NotificationInputs,
} from './plan';

const at = (iso: string): number => new Date(iso).getTime();

/** Mid-afternoon on a Sunday, so "today" is unambiguous in local time. */
const NOW = at('2026-08-16T14:00:00');
const TODAY = toDayKey(new Date(NOW));

const base = (over: Partial<NotificationInputs> = {}): NotificationInputs => ({
  now: NOW,
  permission: 'granted',
  settings: DEFAULT_NOTIFICATION_SETTINGS,
  completedDays: [],
  streak: 0,
  freezesHeld: 0,
  ...over,
});

const kinds = (input: NotificationInputs) => planNotifications(input).map((n) => n.kind);
const keys = (input: NotificationInputs) => planNotifications(input).map((n) => n.key);

describe('instantForDayKey', () => {
  it('resolves a normal evening hour on the same date', () => {
    const t = new Date(instantForDayKey('2026-08-16', 19, 0));
    expect(t.getFullYear()).toBe(2026);
    expect(t.getDate()).toBe(16);
    expect(t.getHours()).toBe(19);
    expect(t.getMinutes()).toBe(0);
  });

  it('puts an hour before the 4am boundary on the FOLLOWING date', () => {
    // The programme's day runs 04:00 -> 04:00, so 1am "on the 16th" is really
    // the small hours of the 17th.
    expect(DAY_START_HOUR).toBe(4);
    const t = new Date(instantForDayKey('2026-08-16', 1, 30));
    expect(t.getDate()).toBe(17);
    expect(t.getHours()).toBe(1);
  });

  it('treats 4am itself as the start of its own day', () => {
    expect(new Date(instantForDayKey('2026-08-16', 4, 0)).getDate()).toBe(16);
  });

  it('survives DST transitions in both directions', () => {
    // US spring forward 2026-03-08, fall back 2026-11-01.
    expect(new Date(instantForDayKey('2026-03-08', 19, 0)).getHours()).toBe(19);
    expect(new Date(instantForDayKey('2026-11-01', 19, 0)).getHours()).toBe(19);
  });
});

describe('nothing is planned when it should not be', () => {
  it('when reminders are disabled', () => {
    expect(planNotifications(base({ settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false } }))).toEqual([]);
  });

  it('when permission is denied', () => {
    expect(planNotifications(base({ permission: 'denied' }))).toEqual([]);
  });

  it('when permission has not been asked for', () => {
    expect(planNotifications(base({ permission: 'undetermined' }))).toEqual([]);
  });

  it('never schedules into the past', () => {
    for (const n of planNotifications(base({ streak: 5 }))) {
      expect(n.fireAt).toBeGreaterThan(NOW);
    }
  });

  it('skips today when the reminder time has already passed', () => {
    // 8pm now, reminder set for 7pm — today's slot is gone.
    const evening = at('2026-08-16T20:00:00');
    const planned = keys(base({ now: evening }));
    expect(planned).not.toContain(`daily_reminder:${toDayKey(new Date(evening))}`);
  });
});

describe('daily reminders', () => {
  it('plans one for today when today is not done', () => {
    expect(keys(base())).toContain(`daily_reminder:${TODAY}`);
  });

  it('does NOT plan one for today once today is complete', () => {
    // The core mechanic: completing the day removes it from the plan, and
    // reconciliation cancels it. No imperative cancelling anywhere.
    const planned = keys(base({ completedDays: [TODAY] }));
    expect(planned).not.toContain(`daily_reminder:${TODAY}`);
    expect(planned.some((k) => k.startsWith('daily_reminder:'))).toBe(true);
  });

  it('tapers rather than nagging fourteen times', () => {
    const daily = planNotifications(base()).filter((n) => n.kind === 'daily_reminder');
    // Every day for the first three, then every third.
    expect(daily).toHaveLength(7);
  });

  it('drops streak language once the streak is certainly gone', () => {
    const daily = planNotifications(base()).filter((n) => n.kind === 'daily_reminder');
    const later = daily.at(-1);
    expect(later?.route).toBe('/');
    expect(later?.body).not.toMatch(/streak/i);
  });

  it('respects a custom reminder hour', () => {
    const morning = { ...DEFAULT_NOTIFICATION_SETTINGS, hour: 9, minute: 30 };
    const first = planNotifications(base({ settings: morning }))[0];
    // 9:30am today has passed at 2pm, so the first is tomorrow at 9:30.
    expect(new Date(first?.fireAt ?? 0).getHours()).toBe(9);
    expect(new Date(first?.fireAt ?? 0).getMinutes()).toBe(30);
  });

  it('plans none when the daily toggle is off', () => {
    const off = { ...DEFAULT_NOTIFICATION_SETTINGS, dailyEnabled: false };
    expect(kinds(base({ settings: off, streak: 3 }))).not.toContain('daily_reminder');
  });
});

describe('streak at risk', () => {
  it('warns when there is a streak and today is unfinished', () => {
    expect(kinds(base({ streak: 9 }))).toContain('streak_risk');
  });

  it('says nothing when the streak is zero', () => {
    // Nobody needs warning about losing nothing.
    expect(kinds(base({ streak: 0 }))).not.toContain('streak_risk');
  });

  it('says nothing once today is complete', () => {
    expect(kinds(base({ streak: 9, completedDays: [TODAY] }))).not.toContain('streak_risk');
  });

  it('is planned for today only, never for future days', () => {
    const risks = planNotifications(base({ streak: 9 })).filter((n) => n.kind === 'streak_risk');
    expect(risks).toHaveLength(1);
    expect(risks[0]?.key).toBe(`streak_risk:${TODAY}`);
  });

  it('fires at 9pm for a 7pm reminder', () => {
    const risk = planNotifications(base({ streak: 4 })).find((n) => n.kind === 'streak_risk');
    expect(new Date(risk?.fireAt ?? 0).getHours()).toBe(21);
  });

  it('is suppressed when the user already set a late reminder', () => {
    // A 21:30 reminder IS the evening nudge; a second one at 23:30 is noise.
    const late = { ...DEFAULT_NOTIFICATION_SETTINGS, hour: 21, minute: 30 };
    expect(kinds(base({ settings: late, streak: 6 }))).not.toContain('streak_risk');
  });

  it('softens the wording when a freeze is held, but still warns', () => {
    const withFreeze = planNotifications(base({ streak: 9, freezesHeld: 1 })).find(
      (n) => n.kind === 'streak_risk',
    );
    expect(withFreeze).toBeDefined();
    expect(withFreeze?.body).toMatch(/freeze/i);

    const without = planNotifications(base({ streak: 9, freezesHeld: 0 })).find(
      (n) => n.kind === 'streak_risk',
    );
    expect(without?.body).not.toMatch(/freeze/i);
  });
});

describe('officials updated', () => {
  const officials = {
    availableVersion: '2026-09-01',
    bundledVersion: '2026-08-16',
    changeSummary: 'Your governor changed. Tap to review the new answers.',
  };

  it('is planned once when newer data changes this user’s answers', () => {
    expect(kinds(base({ officials }))).toContain('officials_updated');
  });

  it('is not planned again once notified', () => {
    const notified = { ...officials, notifiedVersion: '2026-09-01' };
    expect(kinds(base({ officials: notified }))).not.toContain('officials_updated');
  });

  it('is not planned for the data the app shipped with', () => {
    const sameAsBundled = { ...officials, availableVersion: '2026-08-16' };
    expect(kinds(base({ officials: sameAsBundled }))).not.toContain('officials_updated');
  });

  // The point of the gate: 435 House seats churn constantly, and an alert that
  // is usually irrelevant gets muted, taking the relevant one with it.
  it('is silent when the update touched nobody this user is graded on', () => {
    const irrelevant = { ...officials, changeSummary: '' };
    expect(kinds(base({ officials: irrelevant }))).not.toContain('officials_updated');
  });

  it('is silent when the caller supplied no diff at all', () => {
    const { changeSummary: _omitted, ...noSummary } = officials;
    expect(kinds(base({ officials: noSummary }))).not.toContain('officials_updated');
  });

  it('names what changed rather than hedging', () => {
    const n = planNotifications(base({ officials })).find((x) => x.kind === 'officials_updated');
    expect(n?.body).toBe(officials.changeSummary);
    expect(n?.body).not.toMatch(/may have changed/i);
  });

  it('is deferred rather than firing while the user is in the app', () => {
    const n = planNotifications(base({ officials })).find((x) => x.kind === 'officials_updated');
    expect(n?.fireAt).toBeGreaterThan(NOW + 25 * 60_000);
  });
});

describe('properties', () => {
  it('produces unique keys', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 6, max: 22 }),
        (streak, freezesHeld, hour) => {
          const planned = planNotifications(
            base({ streak, freezesHeld, settings: { ...DEFAULT_NOTIFICATION_SETTINGS, hour } }),
          );
          expect(new Set(planned.map((n) => n.key)).size).toBe(planned.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is pure — identical inputs give byte-identical output', () => {
    // This is what makes reconciliation safe: "cancel anything whose hash
    // differs" only works if the same state always plans the same thing.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 6, max: 22 }), (streak, hour) => {
        const input = base({ streak, settings: { ...DEFAULT_NOTIFICATION_SETTINGS, hour } });
        expect(planNotifications(input)).toEqual(planNotifications(input));
      }),
      { numRuns: 200 },
    );
  });

  it('never plans more than the horizon allows', () => {
    const planned = planNotifications(
      base({ streak: 5, officials: { availableVersion: '2099-01-01', bundledVersion: '2026-08-16' } }),
    );
    expect(planned.length).toBeLessThanOrEqual(HORIZON_DAYS + 2);
  });
});
