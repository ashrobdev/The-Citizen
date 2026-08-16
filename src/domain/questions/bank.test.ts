import { normalize } from '../grading/normalize';
import { buildRequiredTokens, buildVariants } from '../grading/variants';

import {
  ALL_QUESTION_IDS,
  DYNAMIC_QUESTION_IDS,
  QUESTIONS,
  SENIOR_QUESTION_IDS,
  getQuestion,
} from './bank';

/**
 * Content integrity. This is the suite that catches a bad import — most
 * importantly the Q41 two-column extraction artifact, where a naive parse
 * yields empty answers that no other test would notice.
 */
describe('question bank integrity', () => {
  it('has exactly 128 questions with contiguous ids 1..128', () => {
    expect(QUESTIONS).toHaveLength(128);
    expect(ALL_QUESTION_IDS).toEqual(Array.from({ length: 128 }, (_, i) => i + 1));
  });

  it('has a non-empty prompt for every question', () => {
    for (const q of QUESTIONS) {
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.prompt).not.toMatch(/\*$/); // the senior marker is a flag, not text
    }
  });

  it('has no empty answer strings anywhere', () => {
    for (const q of QUESTIONS) {
      for (const a of q.answers) {
        expect(a.display.trim().length).toBeGreaterThan(0);
        expect(a.variants.length).toBeGreaterThan(0);
        expect(a.variants.every((v) => v.trim().length > 0)).toBe(true);
        expect(a.requiredTokens.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every static question at least one answer', () => {
    for (const q of QUESTIONS) {
      if (q.kind === 'static') expect(q.answers.length).toBeGreaterThan(0);
    }
  });

  it('leaves dynamic questions unanswered, to be resolved at runtime', () => {
    for (const q of QUESTIONS) {
      if (q.kind !== 'static') {
        expect(q.answers).toHaveLength(0);
        expect(q.dynamicRole).toBeDefined();
      }
    }
  });

  it('has unique, stable answer ids', () => {
    const all = QUESTIONS.flatMap((q) => q.answers.map((a) => a.id));
    expect(new Set(all).size).toBe(all.length);
    for (const q of QUESTIONS) {
      for (const a of q.answers) expect(a.id.startsWith(`${q.id}:`)).toBe(true);
    }
  });
});

describe('the specific hazards found in the source PDF', () => {
  it('Q41 has all six presidential powers (the two-column artifact)', () => {
    const q = getQuestion(41);
    expect(q.answers).toHaveLength(6);
    const displays = q.answers.map((a) => a.display);
    expect(displays).toEqual([
      'Signs bills into law',
      'Vetoes bills',
      'Enforces laws',
      'Commander in Chief (of the military)',
      'Chief diplomat',
      'Appoints federal judges',
    ]);
  });

  it('Q97 has its full prompt, reassembled across the line wrap', () => {
    const q = getQuestion(97);
    expect(q.prompt).toContain('all persons born or naturalized');
    expect(q.prompt).toContain('subject to the jurisdiction thereof');
    expect(q.prompt.endsWith('?')).toBe(true);
  });

  it('Q117 does not treat the bia.gov footnote as a tribe', () => {
    const displays = getQuestion(117).answers.map((a) => a.display);
    expect(displays.some((d) => d.includes('bia.gov'))).toBe(false);
    expect(displays.some((d) => d.includes('For a complete list'))).toBe(false);
    expect(displays).toContain('Cherokee');
    expect(displays).toContain('Navajo');
  });

  it('Q113 keeps the full King quotation, which wraps across two source lines', () => {
    const displays = getQuestion(113).answers.map((a) => a.display);
    const quote = displays.find((d) => d.includes('not be judged'));
    expect(quote).toBeDefined();
    // The wrap falls mid-phrase; truncating here would leave a nonsense answer.
    expect(quote).toContain('the content of their character');
  });

  it('Q120 includes the hand-curated answers from its bracketed note', () => {
    const displays = getQuestion(120).answers.map((a) => a.display);
    expect(displays).toContain('New Jersey');
    expect(displays).toContain('Near New York City');
    expect(displays).toContain('On the Hudson (River)');
  });
});

describe('classification', () => {
  it('flags exactly the 20 senior (65/20) questions', () => {
    expect(SENIOR_QUESTION_IDS).toEqual([
      2, 7, 12, 20, 30, 36, 38, 39, 44, 52, 61, 66, 74, 78, 86, 94, 113, 115, 121, 126,
    ]);
  });

  it('flags exactly the 8 dynamic questions with the right roles', () => {
    expect(DYNAMIC_QUESTION_IDS).toEqual([23, 29, 30, 38, 39, 57, 61, 62]);
    expect(getQuestion(30).dynamicRole).toBe('speaker');
    expect(getQuestion(38).dynamicRole).toBe('president');
    expect(getQuestion(39).dynamicRole).toBe('vicePresident');
    expect(getQuestion(57).dynamicRole).toBe('chiefJustice');
    expect(getQuestion(23).dynamicRole).toBe('senator');
    expect(getQuestion(29).dynamicRole).toBe('representative');
    expect(getQuestion(61).dynamicRole).toBe('governor');
    expect(getQuestion(62).dynamicRole).toBe('capital');
  });

  it('requires more than one answer for exactly the seven multi-answer questions', () => {
    const multi = QUESTIONS.filter((q) => q.requiredCount > 1).map((q) => [q.id, q.requiredCount]);
    expect(multi).toEqual([
      [10, 2],
      [48, 2],
      [65, 3],
      [67, 2],
      [69, 2],
      [81, 5],
      [126, 3],
    ]);
  });

  it('never asks for more answers than exist in the pool', () => {
    for (const q of QUESTIONS) {
      if (q.kind === 'static') expect(q.answers.length).toBeGreaterThanOrEqual(q.requiredCount);
    }
  });

  it('assigns every question to a section and subsection', () => {
    for (const q of QUESTIONS) {
      expect(['government', 'history', 'symbols']).toContain(q.section);
      expect(q.subsection.length).toBeGreaterThan(0);
    }
  });
});

describe('the compound answers must require every part', () => {
  it('Q16 requires all three branches', () => {
    const a = getQuestion(16).answers[0];
    expect(a?.requiredTokens).toEqual(['legislative', 'executive', 'judicial']);
  });

  it('Q19 requires both chambers', () => {
    const a = getQuestion(19).answers[0];
    expect(a?.requiredTokens).toEqual(['senate', 'house']);
  });
});

describe('variant invariants', () => {
  // Variants are pre-normalized at build time and compared against normalized
  // user input at runtime. If a variant is not already in normal form, that
  // comparison can never succeed and the answer becomes ungradeable.
  it('every stored variant is already in normal form', () => {
    for (const q of QUESTIONS) {
      for (const a of q.answers) {
        for (const v of a.variants) {
          expect({ id: a.id, v, normalized: normalize(v).text }).toEqual({
            id: a.id,
            v,
            normalized: v,
          });
        }
      }
    }
  });

  it('the committed bank matches a fresh rebuild, so it cannot drift', () => {
    for (const q of QUESTIONS) {
      for (const a of q.answers) {
        expect({ id: a.id, variants: a.variants }).toEqual({
          id: a.id,
          variants: buildVariants(a.display),
        });
        expect({ id: a.id, required: a.requiredTokens }).toEqual({
          id: a.id,
          required: buildRequiredTokens(a.display),
        });
      }
    }
  });

  it('every required token appears in at least one variant', () => {
    // Not "in the shortest variant": an alternative-name parenthetical can be
    // shorter than the base answer ("1929" for "The Great Crash (1929)") while
    // the required tokens describe the base. What matters is that containment
    // is satisfiable at all.
    for (const q of QUESTIONS) {
      for (const a of q.answers) {
        for (const t of a.requiredTokens) {
          const covered = a.variants.some((v) => v.split(' ').includes(t));
          expect({ id: a.id, token: t, covered }).toEqual({
            id: a.id,
            token: t,
            covered: true,
          });
        }
      }
    }
  });
});
