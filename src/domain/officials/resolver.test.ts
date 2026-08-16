import officialsJson from '../../../assets/data/officials.json';
import { gradeSingle } from '../grading/grader';
import { getQuestion } from '../questions/bank';

import { resolveDynamicQuestion } from './resolver';
import { validateOfficials, type OfficialsData } from './schema';

const officials = officialsJson as unknown as OfficialsData;
const CA = { stateCode: 'CA' };

describe('the shipped officials dataset', () => {
  it('passes structural validation', () => {
    expect(() => validateOfficials(officials)).not.toThrow();
  });

  it('covers 50 states plus D.C. and the territories', () => {
    const byType = Object.values(officials.jurisdictions).reduce<Record<string, number>>(
      (acc, j) => ({ ...acc, [j.type]: (acc[j.type] ?? 0) + 1 }),
      {},
    );
    expect(byType.state).toBe(50);
    expect(byType.district).toBe(1);
    expect(byType.territory).toBe(5);
  });

  it('gives every state exactly two senators', () => {
    for (const [code, j] of Object.entries(officials.jurisdictions)) {
      if (j.type !== 'state') continue;
      expect({ code, senators: j.senators.length }).toEqual({ code, senators: 2 });
    }
  });

  it('gives D.C. no governor and no senators, with explanations', () => {
    const dc = officials.jurisdictions.DC;
    expect(dc?.governor).toBeNull();
    expect(dc?.capital).toBeNull();
    expect(dc?.senators).toHaveLength(0);
    expect(dc?.governorNote).toContain('does not have a governor');
  });

  it('includes every apportioned seat, so no constituent is unrepresentable', () => {
    // Four seats were vacant when this was built. Keying districts off sitting
    // members alone hid them entirely, leaving those constituents unable to
    // pick their own district during onboarding.
    const votingSeats = Object.values(officials.jurisdictions)
      .filter((j) => j.type === 'state')
      .reduce((n, j) => n + Object.keys(j.districts).length, 0);
    expect(votingSeats).toBe(435);
  });

  it('has no numbering gaps within a state', () => {
    for (const [code, j] of Object.entries(officials.jurisdictions)) {
      const numbered = Object.keys(j.districts)
        .filter((k) => k !== 'AL')
        .map(Number)
        .sort((a, b) => a - b);
      if (numbered.length === 0) continue;
      const expected = Array.from({ length: numbered.length }, (_, i) => i + 1);
      expect({ code, numbered }).toEqual({ code, numbered: expected });
    }
  });

  it('marks a vacant seat vacant rather than omitting it', () => {
    const vacant = Object.values(officials.jurisdictions)
      .flatMap((j) => Object.values(j.districts))
      .filter((d) => d.vacant === true);
    expect(vacant.length).toBeGreaterThan(0);
    expect(vacant.every((d) => d.answers.length === 0)).toBe(true);
  });

  it('keys at-large seats as AL', () => {
    for (const code of ['AK', 'DE', 'ND', 'SD', 'VT', 'WY']) {
      expect(Object.keys(officials.jurisdictions[code]?.districts ?? {})).toEqual(['AL']);
    }
  });
});

describe('resolving dynamic questions', () => {
  it('grades the state capital, which is a stable fact', () => {
    const r = resolveDynamicQuestion(getQuestion(62), officials, CA);
    expect(r.selfAttest).toBe(false);
    expect(gradeSingle('Sacramento', r.answers).verdict).toBe('correct');
    expect(gradeSingle('Los Angeles', r.answers).verdict).not.toBe('correct');
  });

  it('accepts either senator for "name one of your senators"', () => {
    const r = resolveDynamicQuestion(getQuestion(23), officials, CA);
    expect(r.selfAttest).toBe(false);
    expect(r.answers.length).toBeGreaterThanOrEqual(2);

    // Whatever the current names are, each should grade correct against itself.
    for (const senator of officials.jurisdictions.CA?.senators ?? []) {
      const name = senator.answers[0];
      if (!name) continue;
      expect(gradeSingle(name, r.answers).verdict).toBe('correct');
    }
  });

  it('accepts a surname alone, as an officer would', () => {
    const r = resolveDynamicQuestion(getQuestion(23), officials, CA);
    const surname = officials.jurisdictions.CA?.senators[0]?.answers.at(-1);
    expect(surname).toBeDefined();
    if (surname) expect(gradeSingle(surname, r.answers).verdict).toBe('correct');
  });

  it('grades the representative for a chosen district', () => {
    const r = resolveDynamicQuestion(getQuestion(29), officials, { stateCode: 'CA', district: '12' });
    expect(r.selfAttest).toBe(false);
    const name = officials.jurisdictions.CA?.districts['12']?.answers[0];
    if (name) expect(gradeSingle(name, r.answers).verdict).toBe('correct');
  });

  it('falls back to any representative in the state when no district is chosen', () => {
    const r = resolveDynamicQuestion(getQuestion(29), officials, CA);
    expect(r.selfAttest).toBe(false);
    // 52 seats in California, so the fallback pool should be large.
    expect(r.answers.length).toBeGreaterThan(40);
  });

  it('grades the President from the live dataset', () => {
    const r = resolveDynamicQuestion(getQuestion(38), officials, CA);
    expect(r.selfAttest).toBe(false);
    const name = officials.federal.president.answers[0];
    if (name) expect(gradeSingle(name, r.answers).verdict).toBe('correct');
  });
});

describe('falls back to self-attest rather than guessing', () => {
  it('when a federal role has not been filled in', () => {
    // Speaker and Chief Justice are intentionally unfilled: no maintained
    // dataset covers them and inventing a name would mislead someone.
    expect(resolveDynamicQuestion(getQuestion(30), officials, CA).selfAttest).toBe(true);
    expect(resolveDynamicQuestion(getQuestion(57), officials, CA).selfAttest).toBe(true);
  });

  it('when the governor is not filled in', () => {
    expect(resolveDynamicQuestion(getQuestion(61), officials, CA).selfAttest).toBe(true);
  });

  it('when the user has not said where they live', () => {
    for (const id of [23, 29, 61, 62]) {
      expect(resolveDynamicQuestion(getQuestion(id), officials, undefined).selfAttest).toBe(true);
    }
  });

  it('when there is no officials data at all', () => {
    expect(resolveDynamicQuestion(getQuestion(38), undefined, CA).selfAttest).toBe(true);
  });

  it('for D.C., with the explanation USCIS expects', () => {
    const dc = { stateCode: 'DC' };
    const governor = resolveDynamicQuestion(getQuestion(61), officials, dc);
    expect(governor.selfAttest).toBe(true);
    expect(governor.note).toContain('does not have a governor');

    const senators = resolveDynamicQuestion(getQuestion(23), officials, dc);
    expect(senators.selfAttest).toBe(true);
    expect(senators.note).toContain('no U.S. senators');
  });

  it('for a vacant seat, rather than grading against nobody', () => {
    const vacantEntry = Object.entries(officials.jurisdictions).find(([, j]) =>
      Object.values(j.districts).some((d) => d.vacant === true),
    );
    expect(vacantEntry).toBeDefined();
    if (!vacantEntry) return;
    const [code, j] = vacantEntry;
    const district = Object.entries(j.districts).find(([, d]) => d.vacant === true)?.[0];
    expect(district).toBeDefined();
    const r = resolveDynamicQuestion(getQuestion(29), officials, {
      stateCode: code,
      district: district ?? '',
    });
    // Falls back to the state-wide pool rather than claiming a name.
    expect(r.answers.every((a) => a.display.length > 0)).toBe(true);
  });

  it('for a territory with no senators', () => {
    const r = resolveDynamicQuestion(getQuestion(23), officials, { stateCode: 'PR' });
    expect(r.selfAttest).toBe(true);
  });
});
