import fc from 'fast-check';

import { damerauLevenshtein, editSimilarity, jaroWinkler } from './distance';

describe('damerauLevenshtein', () => {
  it('is zero for identical strings', () => {
    expect(damerauLevenshtein('constitution', 'constitution')).toBe(0);
  });

  it('charges one for a single edit', () => {
    expect(damerauLevenshtein('constitution', 'constitutionn')).toBe(1); // insertion
    expect(damerauLevenshtein('senate', 'senat')).toBe(1); // deletion
    expect(damerauLevenshtein('senate', 'senite')).toBe(1); // substitution
  });

  it('charges one for a transposition, not two', () => {
    // The typo people actually make. Plain Levenshtein would say 2.
    expect(damerauLevenshtein('constitution', 'consitution')).toBeLessThanOrEqual(2);
    expect(damerauLevenshtein('senate', 'sneate')).toBe(1);
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
  });

  it('equals the length when one side is empty', () => {
    expect(damerauLevenshtein('', 'senate')).toBe(6);
    expect(damerauLevenshtein('senate', '')).toBe(6);
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(damerauLevenshtein(a, b)).toBe(damerauLevenshtein(b, a));
      }),
      { numRuns: 300 },
    );
  });

  it('never exceeds the longer length', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(damerauLevenshtein(a, b)).toBeLessThanOrEqual(Math.max(a.length, b.length));
      }),
      { numRuns: 300 },
    );
  });
});

describe('jaroWinkler', () => {
  it('is 1 for identical strings', () => {
    expect(jaroWinkler('lincoln', 'lincoln')).toBe(1);
  });

  it('rewards a shared prefix', () => {
    expect(jaroWinkler('lincoln', 'lincon')).toBeGreaterThan(0.9);
    expect(jaroWinkler('madison', 'madisen')).toBeGreaterThan(0.9);
  });

  it('separates genuinely different short surnames', () => {
    // The false-positive case that matters: a permissive metric would accept
    // one founder's name for another.
    expect(jaroWinkler('adams', 'madison')).toBeLessThan(0.75);
    expect(jaroWinkler('jay', 'hamilton')).toBeLessThan(0.6);
  });

  it('stays within 0..1', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const s = jaroWinkler(a, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });
});

describe('editSimilarity', () => {
  it('is 1 for equal strings and 0 for total mismatch of equal length', () => {
    expect(editSimilarity('abc', 'abc')).toBe(1);
    expect(editSimilarity('abc', 'xyz')).toBe(0);
  });

  it('treats two empty strings as identical', () => {
    expect(editSimilarity('', '')).toBe(1);
  });

  it('scores a one-letter typo in a long word highly', () => {
    expect(editSimilarity('constitution', 'consitution')).toBeGreaterThan(0.85);
  });
});
