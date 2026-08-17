import { createMemoryRepositories } from '../../data/memory/repositories';
import type { Repositories } from '../../data/repositories';
import { DEFAULT_NOTIFICATION_SETTINGS, type PermissionState } from '../../domain/notifications/plan';
import { SessionService } from '../sessionService';

import { NotificationService } from './notificationService';
import type { NotificationPlatform, ScheduledItem } from './reconcile';

const at = (iso: string): Date => new Date(iso);

function fakePlatform(): NotificationPlatform & { items: ScheduledItem[] } {
  const items: ScheduledItem[] = [];
  return {
    items,
    async getScheduled() {
      return [...items];
    },
    async schedule(n) {
      items.push({ id: `id-${n.key}`, key: n.key, hash: n.hash });
    },
    async cancel(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) items.splice(i, 1);
    },
  };
}

async function completeDay(repos: Repositories, now: Date): Promise<void> {
  const svc = new SessionService(repos);
  const today = await svc.startOrResumeToday(now);
  for (const questionId of today.session.questionIds) {
    await svc.recordAttempt({
      session: today.session,
      questionId,
      graded: { questionId, correct: true, selfAttested: false },
      selfGraded: false,
      finalCorrect: true,
      now,
    });
  }
  await svc.completeSession(today.session.id, now);
}

const build = (permission: PermissionState = 'granted') => {
  const repos = createMemoryRepositories();
  const platform = fakePlatform();
  const service = new NotificationService(repos, platform, async () => permission);
  return { repos, platform, service };
};

describe('settings', () => {
  it('defaults to a 7pm reminder with both kinds on', async () => {
    const { service } = build();
    expect(await service.settings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('round-trips, and re-syncs so a time change takes effect immediately', async () => {
    const { service, platform } = build();
    await service.saveSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, hour: 9 }, at('2026-08-16T14:00:00'));

    expect((await service.settings()).hour).toBe(9);
    expect(platform.items.length).toBeGreaterThan(0);
  });

  it('survives a corrupt settings blob', async () => {
    const { repos, service } = build();
    await repos.kv.set('notifications.settings', '{{{ not json');
    expect(await service.settings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });
});

describe('sync', () => {
  it('schedules nothing without permission', async () => {
    const { service, platform } = build('denied');
    await service.sync(at('2026-08-16T14:00:00'));
    expect(platform.items).toEqual([]);
  });

  it('schedules reminders once permission is granted', async () => {
    const { service, platform } = build('granted');
    await service.sync(at('2026-08-16T14:00:00'));
    expect(platform.items.some((i) => i.key.startsWith('daily_reminder:'))).toBe(true);
  });

  it('cancels today’s reminder once the day is completed', async () => {
    // The behaviour the whole design exists for: finishing the day must stop
    // the evening nudge, without anything cancelling it by hand.
    const { repos, service, platform } = build('granted');
    const now = at('2026-08-16T14:00:00');

    await service.sync(now);
    const todayKey = 'daily_reminder:2026-08-16';
    expect(platform.items.some((i) => i.key === todayKey)).toBe(true);

    await completeDay(repos, now);
    await service.sync(at('2026-08-16T14:30:00'));

    expect(platform.items.some((i) => i.key === todayKey)).toBe(false);
    // Tomorrow's is untouched.
    expect(platform.items.some((i) => i.key === 'daily_reminder:2026-08-17')).toBe(true);
  });

  it('does not warn about a streak the user does not have', async () => {
    const { service, platform } = build('granted');
    await service.sync(at('2026-08-16T14:00:00'));
    expect(platform.items.some((i) => i.key.startsWith('streak_risk:'))).toBe(false);
  });

  it('warns when a streak exists and today is unfinished', async () => {
    const { repos, service, platform } = build('granted');
    await completeDay(repos, at('2026-08-15T10:00:00'));

    await service.sync(at('2026-08-16T14:00:00'));
    expect(platform.items.some((i) => i.key === 'streak_risk:2026-08-16')).toBe(true);
  });

  it('is idempotent — syncing twice changes nothing', async () => {
    const { service, platform } = build('granted');
    await service.sync(at('2026-08-16T14:00:00'));
    const first = platform.items.map((i) => i.key).sort();

    await service.sync(at('2026-08-16T14:00:01'));
    expect(platform.items.map((i) => i.key).sort()).toEqual(first);
  });

  it('clears everything when reminders are switched off', async () => {
    const { service, platform } = build('granted');
    await service.sync(at('2026-08-16T14:00:00'));
    expect(platform.items.length).toBeGreaterThan(0);

    await service.saveSettings(
      { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false },
      at('2026-08-16T14:00:00'),
    );
    expect(platform.items).toEqual([]);
  });

  it('never throws, even when the platform is broken', async () => {
    // A notification failure must not be able to break a study session.
    const repos = createMemoryRepositories();
    const broken: NotificationPlatform = {
      async getScheduled() {
        throw new Error('platform exploded');
      },
      async schedule() {},
      async cancel() {},
    };
    const service = new NotificationService(repos, broken, async () => 'granted');
    await expect(service.sync(at('2026-08-16T14:00:00'))).resolves.toBeUndefined();
  });
});

describe('the soft ask', () => {
  it('is unanswered until recorded', async () => {
    const { service } = build();
    expect(await service.askRecord()).toBeUndefined();

    await service.recordAsk('no', at('2026-08-16T14:00:00'));
    expect((await service.askRecord())?.answer).toBe('no');
  });
});

describe('officials notification', () => {
  const officials = {
    availableVersion: '2026-09-01',
    bundledVersion: '2026-08-16',
    changeSummary: 'Your governor changed. Tap to review the new answers.',
  };

  it('is planned once and then suppressed', async () => {
    const { service, platform } = build('granted');

    await service.sync(at('2026-08-16T14:00:00'), officials);
    expect(platform.items.some((i) => i.key === 'officials_updated:2026-09-01')).toBe(true);

    await service.markOfficialsNotified('2026-09-01');
    await service.sync(at('2026-08-16T14:05:00'), officials);
    expect(platform.items.some((i) => i.key === 'officials_updated:2026-09-01')).toBe(false);
  });

  it('is not scheduled when the update changed nothing this user is graded on', async () => {
    const { service, platform } = build('granted');

    await service.sync(at('2026-08-16T14:00:00'), { ...officials, changeSummary: '' });
    expect(platform.items.some((i) => i.key === 'officials_updated:2026-09-01')).toBe(false);
  });
});
