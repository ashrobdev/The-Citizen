import { computeStreak } from './streak';
import type { DayKey } from './types';

/** Consecutive days starting from a base, for readable fixtures. */
function run(start: DayKey, count: number): DayKey[] {
  const out: DayKey[] = [];
  const [y, m, d] = start.split('-').map(Number);
  for (let i = 0; i < count; i++) {
    const date = new Date(y ?? 0, (m ?? 1) - 1, (d ?? 1) + i, 12);
    const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
    out.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
  }
  return out;
}

describe('computeStreak', () => {
  it('is zero with no completed days', () => {
    expect(computeStreak([], '2026-08-16').current).toBe(0);
  });

  it('counts consecutive days', () => {
    const days = run('2026-08-10', 5);
    expect(computeStreak(days, '2026-08-14').current).toBe(5);
  });

  it('survives being checked on the day after the last completion', () => {
    // Not yet studied today — the streak is intact, not broken.
    const days = run('2026-08-10', 5);
    expect(computeStreak(days, '2026-08-15').current).toBe(5);
  });

  it('resets after a missed day when no freeze is held', () => {
    const days = run('2026-08-10', 3); // 10,11,12 — only 3 days, no freeze earned
    expect(computeStreak(days, '2026-08-16').current).toBe(0);
  });

  it('ignores duplicate and future days', () => {
    const days = [...run('2026-08-10', 3), '2026-08-10', '2026-12-25'];
    expect(computeStreak(days, '2026-08-12').current).toBe(3);
  });

  it('tracks the longest streak permanently', () => {
    const days = [...run('2026-06-01', 10), ...run('2026-07-01', 2)];
    const s = computeStreak(days, '2026-07-02');
    expect(s.longest).toBe(10);
    expect(s.current).toBe(2);
  });
});

describe('streak freezes', () => {
  it('earns one at a full 7-day streak', () => {
    expect(computeStreak(run('2026-08-01', 7), '2026-08-07').freezesHeld).toBe(1);
  });

  it('does not earn one before day 7', () => {
    expect(computeStreak(run('2026-08-01', 6), '2026-08-06').freezesHeld).toBe(0);
  });

  it('never holds more than one, even at 14 and 21 days', () => {
    expect(computeStreak(run('2026-08-01', 14), '2026-08-14').freezesHeld).toBe(1);
    expect(computeStreak(run('2026-08-01', 21), '2026-08-21').freezesHeld).toBe(1);
  });

  it('spends the freeze to cover a missed day, preserving but not incrementing', () => {
    // 9 days, miss the 10th, study the 11th.
    const days = [...run('2026-08-01', 9), '2026-08-11'];
    const s = computeStreak(days, '2026-08-11');
    // 9 through the gap, then +1 for the completed day = 10, not 11.
    expect(s.current).toBe(10);
    expect(s.freezesHeld).toBe(0);
    expect(s.frozenDays).toEqual(['2026-08-10']);
  });

  it('resets on two consecutive missed days, spending the freeze on neither', () => {
    // One freeze cannot cover a two-day gap.
    const days = [...run('2026-08-01', 9), '2026-08-12'];
    expect(computeStreak(days, '2026-08-12').current).toBe(1);
  });

  it('spends the freeze on a gap between the last day and today', () => {
    const days = run('2026-08-01', 7); // ends 08-07, one freeze held
    const s = computeStreak(days, '2026-08-09'); // missed 08-08
    expect(s.current).toBe(7);
    expect(s.freezesHeld).toBe(0);
  });

  it('breaks when the gap to today exceeds what one freeze covers', () => {
    const days = run('2026-08-01', 7);
    expect(computeStreak(days, '2026-08-11').current).toBe(0);
  });

  it('re-earns a freeze after spending one and reaching the next milestone', () => {
    // 7 days (earn), miss one, then enough days to cross the next milestone.
    const days = [...run('2026-08-01', 7), ...run('2026-08-09', 7)];
    const s = computeStreak(days, '2026-08-15');
    expect(s.current).toBe(14);
    expect(s.freezesHeld).toBe(1);
  });
});

describe('calendar edge cases', () => {
  it('handles a month boundary', () => {
    const days = run('2026-01-29', 5); // crosses into February
    expect(computeStreak(days, '2026-02-02').current).toBe(5);
  });

  it('handles a leap day', () => {
    const days = run('2028-02-27', 4); // 27, 28, 29, Mar 1
    expect(days).toContain('2028-02-29');
    expect(computeStreak(days, '2028-03-01').current).toBe(4);
  });

  it('handles a year boundary', () => {
    const days = run('2026-12-30', 4);
    expect(computeStreak(days, '2027-01-02').current).toBe(4);
  });

  it('counts DST transition days as single days', () => {
    // US spring forward 2026-03-08 (23-hour day) and fall back 2026-11-01.
    expect(computeStreak(run('2026-03-06', 5), '2026-03-10').current).toBe(5);
    expect(computeStreak(run('2026-10-30', 5), '2026-11-03').current).toBe(5);
  });
});
