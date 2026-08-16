import type { PlannedNotification } from '../../domain/notifications/plan';

import { reconcile, type NotificationPlatform, type ScheduledItem } from './reconcile';

function planned(over: Partial<PlannedNotification> = {}): PlannedNotification {
  return {
    key: 'daily_reminder:2026-08-16',
    kind: 'daily_reminder',
    fireAt: Date.now() + 3_600_000,
    title: 'Your questions are ready',
    body: 'Twelve questions, about five minutes.',
    route: '/session',
    hash: 'abc',
    ...over,
  };
}

/** Records what the platform was asked to do, so the calls can be asserted. */
function fakePlatform(initial: ScheduledItem[] = []): NotificationPlatform & {
  items: ScheduledItem[];
  scheduledKeys: string[];
  cancelledIds: string[];
} {
  const items = [...initial];
  const scheduledKeys: string[] = [];
  const cancelledIds: string[] = [];

  return {
    items,
    scheduledKeys,
    cancelledIds,
    async getScheduled() {
      return [...items];
    },
    async schedule(n) {
      scheduledKeys.push(n.key);
      items.push({ id: `id-${n.key}`, key: n.key, hash: n.hash });
    },
    async cancel(id) {
      cancelledIds.push(id);
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) items.splice(i, 1);
    },
  };
}

describe('reconcile', () => {
  it('schedules everything when nothing exists yet', async () => {
    const platform = fakePlatform();
    const result = await reconcile(platform, [planned(), planned({ key: 'streak_risk:2026-08-16', hash: 'xyz' })]);

    expect(result.scheduled).toBe(2);
    expect(result.cancelled).toBe(0);
    expect(platform.scheduledKeys).toEqual(['daily_reminder:2026-08-16', 'streak_risk:2026-08-16']);
  });

  it('does nothing when reality already matches the plan', async () => {
    // Idempotence: this runs on every app foreground, so a no-op must be a
    // genuine no-op rather than a cancel-and-reschedule churn.
    const p = planned();
    const platform = fakePlatform([{ id: 'id-1', key: p.key, hash: p.hash }]);

    const result = await reconcile(platform, [p]);

    expect(result).toEqual({ scheduled: 0, cancelled: 0, unchanged: 1 });
    expect(platform.cancelledIds).toEqual([]);
    expect(platform.scheduledKeys).toEqual([]);
  });

  it('cancels what is no longer planned', async () => {
    // This is how completing a day removes today's reminder: the planner stops
    // returning it, and reconcile notices.
    const platform = fakePlatform([
      { id: 'id-today', key: 'daily_reminder:2026-08-16', hash: 'abc' },
      { id: 'id-risk', key: 'streak_risk:2026-08-16', hash: 'xyz' },
    ]);

    const result = await reconcile(platform, []);

    expect(result.cancelled).toBe(2);
    expect(platform.cancelledIds).toEqual(['id-today', 'id-risk']);
  });

  it('reschedules when the copy or time changed', async () => {
    const platform = fakePlatform([{ id: 'id-1', key: 'daily_reminder:2026-08-16', hash: 'OLD' }]);

    const result = await reconcile(platform, [planned({ hash: 'NEW' })]);

    expect(result.cancelled).toBe(1);
    expect(result.scheduled).toBe(1);
    expect(platform.cancelledIds).toEqual(['id-1']);
  });

  it('handles a mixed plan in one pass', async () => {
    const keep = planned({ key: 'daily_reminder:2026-08-17', hash: 'keep' });
    const platform = fakePlatform([
      { id: 'id-keep', key: keep.key, hash: 'keep' },
      { id: 'id-stale', key: 'daily_reminder:2026-08-16', hash: 'stale' },
    ]);

    const result = await reconcile(platform, [keep, planned({ key: 'streak_risk:2026-08-17', hash: 'new' })]);

    expect(result).toEqual({ scheduled: 1, cancelled: 1, unchanged: 1 });
    expect(platform.cancelledIds).toEqual(['id-stale']);
    expect(platform.scheduledKeys).toEqual(['streak_risk:2026-08-17']);
  });

  it('converges — running twice leaves the second run a no-op', async () => {
    const platform = fakePlatform();
    const plan = [planned(), planned({ key: 'streak_risk:2026-08-16', hash: 'xyz' })];

    await reconcile(platform, plan);
    const second = await reconcile(platform, plan);

    expect(second).toEqual({ scheduled: 0, cancelled: 0, unchanged: 2 });
  });
});
