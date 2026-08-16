/**
 * Builds assets/data/officials.json.
 *
 * Run with:  npm run build:officials
 *
 * Senators, representatives, the President and the Vice President come from
 * unitedstates/congress-legislators, which is actively maintained. The Speaker,
 * the Chief Justice and the governors are not in any such dataset and are read
 * from data/manual/officeholders.yaml.
 *
 * Anything unknown is emitted as an empty entry, which makes the app ask the
 * user rather than grade them against a guess. That asymmetry is deliberate:
 * a missing answer is an inconvenience, a wrong one actively misleads someone
 * preparing for a naturalization interview.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import {
  OFFICIALS_SCHEMA_VERSION,
  validateOfficials,
  type Jurisdiction,
  type OfficialEntry,
  type OfficialsData,
} from '../src/domain/officials/schema';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'assets/data/officials.json');
const MANUAL = path.join(ROOT, 'data/manual/officeholders.yaml');
const STATIC = path.join(ROOT, 'data/static/jurisdictions.json');

const LEGISLATORS_URL =
  'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml';
const EXECUTIVE_URL =
  'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/executive.yaml';

const STALE_AFTER_DAYS = 120;

interface Term {
  type: string;
  start: string;
  end: string;
  state?: string;
  district?: number;
}

interface Person {
  name: { first?: string; last?: string; official_full?: string; nickname?: string };
  terms: Term[];
}

/**
 * Accepted spellings of one name.
 *
 * The surname alone is included because USCIS officers accept it — insisting on
 * a full legal name would fail people who would pass the real interview.
 */
function nameVariants(name: Person['name']): string[] {
  const out = new Set<string>();
  const first = name.first?.trim();
  const last = name.last?.trim();
  const full = name.official_full?.trim();
  const nickname = name.nickname?.trim();

  if (full) out.add(full);
  if (first && last) out.add(`${first} ${last}`);
  if (last) out.add(last);
  if (nickname && last) out.add(`${nickname} ${last}`);

  return [...out].filter((s) => s.length > 0);
}

const entry = (answers: string[]): OfficialEntry => ({ answers });
const EMPTY: OfficialEntry = { answers: [] };

async function fetchYaml<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return parseYaml(await res.text()) as T;
}

/** The term covering `on`, or undefined. */
function currentTerm(person: Person, on: Date, type?: string): Term | undefined {
  const iso = on.toISOString().slice(0, 10);
  return person.terms.find(
    (t) => (type === undefined || t.type === type) && t.start <= iso && iso < t.end,
  );
}

async function build(): Promise<OfficialsData> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const [legislators, executives] = await Promise.all([
    fetchYaml<Person[]>(LEGISLATORS_URL),
    fetchYaml<Person[]>(EXECUTIVE_URL),
  ]);

  const manual = parseYaml(fs.readFileSync(MANUAL, 'utf8')) as {
    reviewedOn?: string;
    federal?: { speakerOfTheHouse?: OfficialEntry; chiefJustice?: OfficialEntry };
    governors?: Record<string, string[]>;
  };

  const statics = JSON.parse(fs.readFileSync(STATIC, 'utf8')) as {
    states: Record<string, [string, string]>;
    district: Record<string, [string, string | null]>;
    territories: Record<string, [string, string]>;
    notes: Record<string, string>;
    apportionment: Record<string, number>;
  };

  // ---- Federal ----------------------------------------------------------
  const president = executives.find((p) => currentTerm(p, today, 'prez'));
  const vicePresident = executives.find((p) => currentTerm(p, today, 'viceprez'));

  const federal = {
    president: president ? entry(nameVariants(president.name)) : EMPTY,
    vicePresident: vicePresident ? entry(nameVariants(vicePresident.name)) : EMPTY,
    speakerOfTheHouse: entry(manual.federal?.speakerOfTheHouse?.answers ?? []),
    chiefJustice: entry(manual.federal?.chiefJustice?.answers ?? []),
  };

  // ---- Jurisdictions ----------------------------------------------------
  const jurisdictions: Record<string, Jurisdiction> = {};

  const addJurisdiction = (
    code: string,
    name: string,
    capital: string | null,
    type: Jurisdiction['type'],
  ): void => {
    const governorNames = manual.governors?.[code] ?? [];
    const j: Jurisdiction = {
      name,
      type,
      capital: capital === null ? null : entry([capital]),
      governor: type === 'district' ? null : entry(governorNames),
      senators: [],
      districts: {},
    };
    // Index access is `string | undefined` under exactOptionalPropertyTypes,
    // so assign only what actually exists.
    const setNote = (key: keyof Jurisdiction, value: string | undefined): void => {
      if (value !== undefined) Object.assign(j, { [key]: value });
    };
    if (type === 'district') {
      setNote('governorNote', statics.notes.dcGovernor);
      setNote('senatorNote', statics.notes.noSenators);
      setNote('representationNote', statics.notes.nonVotingRepresentation);
    }
    if (type === 'territory') {
      setNote('senatorNote', statics.notes.noSenators);
      setNote('representationNote', statics.notes.nonVotingRepresentation);
    }
    jurisdictions[code] = j;
  };

  for (const [code, [name, capital]] of Object.entries(statics.states)) {
    addJurisdiction(code, name, capital, 'state');
  }
  for (const [code, [name, capital]] of Object.entries(statics.district)) {
    addJurisdiction(code, name, capital, 'district');
  }
  for (const [code, [name, capital]] of Object.entries(statics.territories)) {
    addJurisdiction(code, name, capital, 'territory');
  }

  // The terms array holds a legislator's FULL history, so only the term
  // covering today tells us what they currently are.
  let senatorCount = 0;
  let repCount = 0;

  for (const person of legislators) {
    const term = currentTerm(person, today);
    if (!term?.state) continue;
    const j = jurisdictions[term.state];
    if (!j) continue;

    if (term.type === 'sen') {
      j.senators.push(entry(nameVariants(person.name)));
      senatorCount++;
    } else if (term.type === 'rep') {
      // district 0 means at-large.
      const key = term.district === 0 || term.district === undefined ? 'AL' : String(term.district);
      j.districts[key] = entry(nameVariants(person.name));
      repCount++;
    }
  }

  // Every apportioned seat must appear, not just the filled ones. Four seats
  // were vacant when this was written, and keying districts off sitting
  // members alone hid them from the picker — leaving those constituents unable
  // to select their own district. A vacant seat is emitted explicitly and
  // resolves to a self-attested question.
  let vacantSeats = 0;
  for (const [code, seats] of Object.entries(statics.apportionment)) {
    const j = jurisdictions[code];
    if (!j) continue;
    if (seats === 1) {
      if (!j.districts.AL) {
        j.districts.AL = { answers: [], vacant: true };
        vacantSeats++;
      }
      continue;
    }
    for (let n = 1; n <= seats; n++) {
      if (!j.districts[String(n)]) {
        j.districts[String(n)] = { answers: [], vacant: true };
        vacantSeats++;
      }
    }
  }

  // Sort senators for a stable diff between runs.
  for (const j of Object.values(jurisdictions)) {
    j.senators.sort((a, b) => (a.answers[0] ?? '').localeCompare(b.answers[0] ?? ''));
  }

  const sources: OfficialsData['sources'] = [
    { name: 'unitedstates/congress-legislators (legislators-current)', url: LEGISLATORS_URL, retrievedAt: todayIso },
    { name: 'unitedstates/congress-legislators (executive)', url: EXECUTIVE_URL, retrievedAt: todayIso },
    { name: 'data/manual/officeholders.yaml', reviewedOn: manual.reviewedOn ?? 'never' },
    { name: 'data/static/jurisdictions.json (capitals)' },
  ];

  const data: OfficialsData = {
    schemaVersion: OFFICIALS_SCHEMA_VERSION,
    dataVersion: todayIso,
    generatedAt: new Date().toISOString(),
    sources,
    federal,
    jurisdictions,
  };

  report({ senatorCount, repCount, vacantSeats, data, manual });
  return data;
}

function report(ctx: {
  senatorCount: number;
  repCount: number;
  vacantSeats: number;
  data: OfficialsData;
  manual: { reviewedOn?: string };
}): void {
  const { senatorCount, repCount, data } = ctx;
  const states = Object.values(data.jurisdictions).filter((j) => j.type === 'state');

  console.log(`  senators:        ${senatorCount}`);
  console.log(`  representatives: ${repCount}`);
  console.log(`  vacant seats:    ${ctx.vacantSeats}`);
  console.log(`  jurisdictions:   ${Object.keys(data.jurisdictions).length}`);

  // Every apportioned seat should now be present exactly once.
  const votingSeats = Object.entries(data.jurisdictions)
    .filter(([, j]) => j.type === 'state')
    .reduce((n, [, j]) => n + Object.keys(j.districts).length, 0);
  if (votingSeats !== 435) {
    console.warn(`  ! expected 435 voting seats, built ${votingSeats}`);
  } else {
    console.log('  voting seats:    435 (matches apportionment)');
  }

  // Coverage assertions that would otherwise fail silently at runtime.
  if (senatorCount !== 100) {
    console.warn(`  ! expected 100 senators, found ${senatorCount} — check for vacancies`);
  }
  const badStates = states.filter((j) => j.senators.length !== 2).map((j) => j.name);
  if (badStates.length > 0) console.warn(`  ! states without 2 senators: ${badStates.join(', ')}`);

  const unknown: string[] = [];
  if (data.federal.president.answers.length === 0) unknown.push('President');
  if (data.federal.vicePresident.answers.length === 0) unknown.push('Vice President');
  if (data.federal.speakerOfTheHouse.answers.length === 0) unknown.push('Speaker');
  if (data.federal.chiefJustice.answers.length === 0) unknown.push('Chief Justice');

  const noGovernor = states.filter((j) => (j.governor?.answers.length ?? 0) === 0).length;

  if (unknown.length > 0) {
    console.log(`\n  Not filled in (asked as self-attest): ${unknown.join(', ')}`);
  }
  if (noGovernor > 0) {
    console.log(`  Governors not filled in: ${noGovernor} of ${states.length}`);
  }
  if (unknown.length > 0 || noGovernor > 0) {
    console.log('  -> add them to data/manual/officeholders.yaml after checking uscis.gov.');
  }

  const reviewed = ctx.manual.reviewedOn;
  if (reviewed) {
    const age = Math.floor((Date.now() - new Date(reviewed).getTime()) / 86_400_000);
    if (age > STALE_AFTER_DAYS) {
      console.warn(`\n  ! officeholders.yaml last reviewed ${age} days ago (limit ${STALE_AFTER_DAYS})`);
    }
  }
}

async function main(): Promise<void> {
  const data = await build();
  validateOfficials(data);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, OUTPUT)} (dataVersion ${data.dataVersion})`);
}

void main();
