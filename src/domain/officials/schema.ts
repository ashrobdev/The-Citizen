/**
 * Officeholder data for the eight questions whose answers change with
 * elections, appointments, or where the user lives.
 *
 * Shipped bundled and refreshable from the repo, so an election does not
 * require an app-store release.
 *
 * Every `answers` list holds the accepted forms of one person's name —
 * official full name, first + last, and the surname alone, because USCIS
 * officers accept a surname. The resolver turns these into the same
 * AcceptedAnswer shape the static questions use, so dynamic questions inherit
 * the whole matching cascade rather than getting a weaker comparison.
 */

export interface OfficialEntry {
  /** Accepted spellings of the officeholder's name. Empty means unknown. */
  answers: string[];
  /** Seat exists but is currently unfilled. Degrades the question to self-attest. */
  vacant?: boolean;
}

export interface FederalOfficials {
  president: OfficialEntry;
  vicePresident: OfficialEntry;
  speakerOfTheHouse: OfficialEntry;
  chiefJustice: OfficialEntry;
}

export interface Jurisdiction {
  name: string;
  type: 'state' | 'district' | 'territory';
  /** Null for D.C., which is not a state and has no capital of its own. */
  capital: OfficialEntry | null;
  /** Null where the jurisdiction has no governor. */
  governor: OfficialEntry | null;
  /** Shown when `governor` is null, e.g. D.C. */
  governorNote?: string;
  /** Two for a state; empty for D.C. and the territories. */
  senators: OfficialEntry[];
  /** Shown when `senators` is empty. */
  senatorNote?: string;
  /** Keyed by district number, or "AL" for at-large. */
  districts: Record<string, OfficialEntry>;
  /** Shown for delegates and non-voting representation. */
  representationNote?: string;
}

export interface OfficialsData {
  /** Bumped when this file's SHAPE changes. Mismatched shape is ignored. */
  schemaVersion: number;
  /** Monotonic ISO date. Newer wins; the app never downgrades. */
  dataVersion: string;
  generatedAt: string;
  sources: { name: string; url?: string; retrievedAt?: string; reviewedOn?: string }[];
  federal: FederalOfficials;
  jurisdictions: Record<string, Jurisdiction>;
}

export const OFFICIALS_SCHEMA_VERSION = 1;

/** True when we have no name to grade against and must ask the user instead. */
export function isUnknown(entry: OfficialEntry | null | undefined): boolean {
  return entry === null || entry === undefined || entry.vacant === true || entry.answers.length === 0;
}

/**
 * Structural validation. Deliberately strict about the things that would
 * produce wrong grading rather than a crash: a jurisdiction missing, a
 * senator list of the wrong length, an entry that is present but empty.
 */
export function validateOfficials(data: unknown): asserts data is OfficialsData {
  const d = data as Partial<OfficialsData>;
  if (typeof d !== 'object' || d === null) throw new Error('officials: not an object');
  if (d.schemaVersion !== OFFICIALS_SCHEMA_VERSION) {
    throw new Error(`officials: unsupported schemaVersion ${String(d.schemaVersion)}`);
  }
  if (typeof d.dataVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dataVersion)) {
    throw new Error('officials: dataVersion must be an ISO date');
  }
  if (!d.federal) throw new Error('officials: missing federal block');
  for (const role of ['president', 'vicePresident', 'speakerOfTheHouse', 'chiefJustice'] as const) {
    const entry = d.federal[role];
    if (!entry || !Array.isArray(entry.answers)) {
      throw new Error(`officials: federal.${role} malformed`);
    }
  }
  if (!d.jurisdictions || Object.keys(d.jurisdictions).length === 0) {
    throw new Error('officials: no jurisdictions');
  }
  for (const [code, j] of Object.entries(d.jurisdictions)) {
    if (!j.name) throw new Error(`officials: ${code} missing name`);
    if (!Array.isArray(j.senators)) throw new Error(`officials: ${code} senators malformed`);
    if (j.type === 'state' && j.senators.length !== 2) {
      throw new Error(`officials: ${code} has ${j.senators.length} senators, expected 2`);
    }
    if (typeof j.districts !== 'object') throw new Error(`officials: ${code} districts malformed`);
  }
}
