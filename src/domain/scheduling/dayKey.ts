import { DAY_START_HOUR } from './config';
import type { DayKey } from './types';

/**
 * Local calendar day handling for streaks.
 *
 * Deliberately string-based (`YYYY-MM-DD`) rather than Date arithmetic: this
 * has to survive timezone changes and DST without a stored streak silently
 * shifting, and comparing date strings is exact where comparing timestamps is
 * not.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * The day a moment belongs to, honouring the 4am cutoff so a late-night
 * session counts as the previous day.
 */
export function toDayKey(date: Date): DayKey {
  const shifted = new Date(date.getTime());
  shifted.setHours(shifted.getHours() - DAY_START_HOUR);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** Parses a DayKey to a local Date at midday, safely away from DST boundaries. */
export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(key: DayKey, days: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Whole days from `a` to `b`. Computed at midday on both sides so a DST
 * transition cannot round a 23- or 25-hour day to the wrong integer.
 */
export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = fromDayKey(b).getTime() - fromDayKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d, 12);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}
