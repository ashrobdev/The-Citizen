import bundled from '../../assets/data/officials.json';
import {
  OFFICIALS_SCHEMA_VERSION,
  validateOfficials,
  type OfficialsData,
} from '../domain/officials/schema';
import type { KvRepository } from '../data/repositories';

/**
 * Keeps officeholder data current without an app-store release.
 *
 * The bundled copy always works offline and is the floor — a fetch can only
 * ever replace it with something strictly newer that passes validation.
 *
 * NOTE: this URL must be publicly readable. `raw.githubusercontent.com` serves
 * private repositories only with a token, and shipping a token in a mobile app
 * is not an option, so the repo (or at least this file) has to be public before
 * refreshing does anything. Until then the app quietly runs on bundled data,
 * which is exactly the intended failure mode.
 */
export const OFFICIALS_URL =
  'https://raw.githubusercontent.com/ashrobdev/The-Citizen/main/assets/data/officials.json';

const CACHE_KEY = 'officials.cached';
const LAST_CHECK_KEY = 'officials.lastCheck';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

export const BUNDLED_OFFICIALS = bundled as unknown as OfficialsData;

/** Newer of the two ISO dates wins; ties keep what we already have. */
function isNewer(candidate: string, current: string): boolean {
  return candidate > current;
}

export class OfficialsUpdater {
  constructor(private readonly kv: KvRepository) {}

  /**
   * The dataset to use: the cached copy when it is genuinely newer than the
   * bundled one, otherwise bundled.
   */
  async current(): Promise<OfficialsData> {
    const raw = await this.kv.get(CACHE_KEY);
    if (raw === undefined) return BUNDLED_OFFICIALS;

    try {
      const parsed: unknown = JSON.parse(raw);
      validateOfficials(parsed);
      return isNewer(parsed.dataVersion, BUNDLED_OFFICIALS.dataVersion)
        ? parsed
        : BUNDLED_OFFICIALS;
    } catch {
      // A corrupt cache must never break the app; fall back and clear it.
      await this.kv.set(CACHE_KEY, '');
      return BUNDLED_OFFICIALS;
    }
  }

  /**
   * Checks for newer data, at most once a day.
   *
   * Never throws and never blocks anything the user is doing: a failed refresh
   * is invisible, because the bundled data is already correct enough to study
   * from.
   */
  async refreshIfDue(now: Date = new Date()): Promise<{ updated: boolean; reason: string }> {
    const last = await this.kv.get(LAST_CHECK_KEY);
    if (last !== undefined && last.length > 0) {
      const elapsed = now.getTime() - Number(last);
      if (Number.isFinite(elapsed) && elapsed < CHECK_INTERVAL_MS) {
        return { updated: false, reason: 'checked recently' };
      }
    }
    await this.kv.set(LAST_CHECK_KEY, String(now.getTime()));
    return this.refreshNow();
  }

  /** Forced check, for the Settings screen. */
  async refreshNow(): Promise<{ updated: boolean; reason: string }> {
    let text: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(OFFICIALS_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { updated: false, reason: `server returned ${res.status}` };
      text = await res.text();
    } catch {
      return { updated: false, reason: 'could not reach the server' };
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(text);
      validateOfficials(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid';
      return { updated: false, reason: `rejected: ${message}` };
    }

    if (candidate.schemaVersion !== OFFICIALS_SCHEMA_VERSION) {
      // A newer shape than this build understands. Ignore it rather than
      // guessing — the app update that reads it will come later.
      return { updated: false, reason: 'needs a newer app version' };
    }

    const active = await this.current();
    if (!isNewer(candidate.dataVersion, active.dataVersion)) {
      return { updated: false, reason: 'already up to date' };
    }

    // Only written once it has parsed AND validated, so a half-downloaded or
    // malformed file can never replace working data.
    await this.kv.set(CACHE_KEY, text);
    return { updated: true, reason: `updated to ${candidate.dataVersion}` };
  }
}
