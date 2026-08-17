import officialsJson from '../../../assets/data/officials.json';

import { describeChanges, diffUserAnswers } from './diff';
import type { OfficialsData } from './schema';

/**
 * Built by mutating the shipped dataset rather than a hand-written fixture, so
 * these tests exercise the real shape — including the vacancies and the
 * jurisdictions with no governor that the resolver has fallbacks for.
 */
const BASE = officialsJson as unknown as OfficialsData;

function clone(): OfficialsData {
  return JSON.parse(JSON.stringify(BASE)) as OfficialsData;
}

type Location = { stateCode: string; district?: string } | undefined;

const CA: Location = { stateCode: 'CA', district: '12' };

// Location is required rather than defaulted: passing `undefined` to a
// defaulted parameter selects the default, which quietly ran the two
// "no location set" cases as California and made them pass for the wrong reason.
function roles(
  before: OfficialsData | undefined,
  after: OfficialsData,
  location: Location,
): string[] {
  return diffUserAnswers(before, after, location)
    .map((c) => c.role)
    .sort();
}

describe('diffUserAnswers', () => {
  it('reports nothing when the data is unchanged', () => {
    expect(roles(BASE, clone(), CA)).toEqual([]);
  });

  it('reports nothing on a version bump that touched no officeholder', () => {
    const after = clone();
    after.dataVersion = '2099-01-01';
    after.generatedAt = '2099-01-01T00:00:00Z';
    expect(roles(BASE, after, CA)).toEqual([]);
  });

  it('reports nothing on the first run, when there is no previous dataset', () => {
    const after = clone();
    after.federal.president.answers = ['Someone Else'];
    expect(roles(undefined, after, CA)).toEqual([]);
  });

  it("detects a change to the user's own senator", () => {
    const after = clone();
    after.jurisdictions.CA!.senators[0] = { answers: ['Jane Newcomer', 'Newcomer'] };
    expect(roles(BASE, after, CA)).toEqual(['senator']);
  });

  it("ignores a senator change in somebody else's state", () => {
    const after = clone();
    after.jurisdictions.TX!.senators[0] = { answers: ['Jane Newcomer', 'Newcomer'] };
    expect(roles(BASE, after, CA)).toEqual([]);
  });

  it("detects a change to the user's own district representative", () => {
    const after = clone();
    after.jurisdictions.CA!.districts['12'] = { answers: ['Rep Newcomer', 'Newcomer'] };
    expect(roles(BASE, after, CA)).toEqual(['representative']);
  });

  it('ignores a change to another district in the same state', () => {
    const after = clone();
    after.jurisdictions.CA!.districts['30'] = { answers: ['Rep Newcomer', 'Newcomer'] };
    expect(roles(BASE, after, CA)).toEqual([]);
  });

  it('detects a governor change', () => {
    const after = clone();
    after.jurisdictions.CA!.governor = { answers: ['Gov Newcomer', 'Newcomer'] };
    expect(roles(BASE, after, CA)).toEqual(['governor']);
  });

  it('detects a capital change', () => {
    const after = clone();
    after.jurisdictions.CA!.capital = { answers: ['New Sacramento'] };
    expect(roles(BASE, after, CA)).toEqual(['capital']);
  });

  it('detects federal changes, which affect every user', () => {
    const after = clone();
    after.federal.speakerOfTheHouse = { answers: ['New Speaker', 'Speaker'] };
    expect(roles(BASE, after, CA)).toEqual(['speaker']);
  });

  it('treats a seat going vacant as a change', () => {
    const after = clone();
    after.jurisdictions.CA!.senators[0] = { answers: [], vacant: true };
    expect(roles(BASE, after, CA)).toEqual(['senator']);
  });

  it('treats a vacant seat being filled as a change', () => {
    const before = clone();
    before.jurisdictions.CA!.governor = { answers: [], vacant: true };
    const after = clone();
    expect(roles(before, after, CA)).toEqual(['governor']);
  });

  it('does not treat reordering the senators as a change', () => {
    const after = clone();
    const senators = after.jurisdictions.CA!.senators;
    after.jurisdictions.CA!.senators = [senators[1]!, senators[0]!];
    expect(roles(BASE, after, CA)).toEqual([]);
  });

  it('reports several roles at once', () => {
    const after = clone();
    after.jurisdictions.CA!.governor = { answers: ['Gov Newcomer'] };
    after.federal.president = { answers: ['New President'] };
    expect(roles(BASE, after, CA)).toEqual(['governor', 'president']);
  });

  it('still reports federal changes for a user who has set no location', () => {
    const after = clone();
    after.federal.president = { answers: ['New President'] };
    expect(roles(BASE, after, undefined)).toEqual(['president']);
  });

  it('reports no state-level change for a user who has set no location', () => {
    const after = clone();
    after.jurisdictions.CA!.governor = { answers: ['Gov Newcomer'] };
    expect(roles(BASE, after, undefined)).toEqual([]);
  });

  it('falls back to any representative in the state when no district is chosen', () => {
    // The resolver accepts any of the state's representatives in this case, so
    // a change to any one of them genuinely changes what would be graded.
    const after = clone();
    after.jurisdictions.CA!.districts['30'] = { answers: ['Rep Newcomer'] };
    expect(roles(BASE, after, { stateCode: 'CA' })).toEqual(['representative']);
  });

  it('carries the before and after names, for copy and for debugging', () => {
    const after = clone();
    after.jurisdictions.CA!.governor = { answers: ['Gov Newcomer', 'Newcomer'] };
    const [change] = diffUserAnswers(BASE, after, CA);
    expect(change?.role).toBe('governor');
    expect(change?.after).toContain('Gov Newcomer');
    expect(change?.before).not.toContain('Gov Newcomer');
  });
});

describe('describeChanges', () => {
  it('names a single changed role', () => {
    expect(describeChanges([{ role: 'governor', before: [], after: [] }])).toBe(
      'Your governor changed. Tap to review the new answers.',
    );
  });

  it('joins several roles readably', () => {
    expect(
      describeChanges([
        { role: 'senator', before: [], after: [] },
        { role: 'governor', before: [], after: [] },
      ]),
    ).toBe('Your senators and governor changed. Tap to review the new answers.');
  });

  it('is empty when nothing changed, so no notification can be built from it', () => {
    expect(describeChanges([])).toBe('');
  });
});
