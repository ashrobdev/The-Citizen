import { QUESTIONS, getQuestion } from '../questions/bank';

import { gradeSingle } from './grader';
import { normalize } from './normalize';

const gradeQ = (id: number, input: string, mode: 'text' | 'voice' = 'text') =>
  gradeSingle(input, getQuestion(id).answers, { mode });

describe('the invariant that must never fail', () => {
  /**
   * If this breaks, the app marks a user wrong for typing the exact answer
   * USCIS printed. Everything else in the engine is negotiable; this is not.
   */
  it('grades every variant of every accepted answer correct, in both modes', () => {
    const failures: string[] = [];

    for (const q of QUESTIONS) {
      if (q.kind !== 'static') continue;
      for (const a of q.answers) {
        for (const v of a.variants) {
          for (const mode of ['text', 'voice'] as const) {
            const r = gradeSingle(v, q.answers, { mode });
            if (r.verdict !== 'correct') {
              failures.push(`Q${q.id} [${mode}] "${v}" -> ${r.verdict} (${r.stage})`);
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('grades the printed display text correct too', () => {
    const failures: string[] = [];
    for (const q of QUESTIONS) {
      if (q.kind !== 'static') continue;
      for (const a of q.answers) {
        // Strip the editorial note; a user would never say it aloud.
        const spoken = a.display.replace(/\[[^\]]*\]/g, '').trim();
        const r = gradeSingle(spoken, q.answers);
        if (r.verdict !== 'correct') {
          failures.push(`Q${q.id} "${spoken}" -> ${r.verdict} (${r.stage})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('accepts the ways people actually answer', () => {
  it.each([
    [2, '(U.S.) Constitution', 'the constitution'],
    [2, '(U.S.) Constitution', 'us constitution'],
    [2, '(U.S.) Constitution', 'the United States Constitution'],
    [7, 'Twenty-seven (27)', '27'],
    [7, 'Twenty-seven (27)', 'twenty seven'],
    [21, 'One hundred (100)', '100'],
    [21, 'One hundred (100)', 'one hundred'],
    [24, 'Four hundred thirty-five', '435'],
    [53, 'Nine (9)', 'nine'],
    [79, 'July 4, 1776', 'july 4 1776'],
    [119, 'Washington, D.C.', 'Washington DC'],
    [123, 'The Star-Spangled Banner', 'the star spangled banner'],
    [78, '(Thomas) Jefferson', 'Jefferson'],
    [78, '(Thomas) Jefferson', 'Thomas Jefferson'],
    [94, 'Abraham Lincoln answers', 'freed the slaves'],
    [52, 'Supreme Court', 'the supreme court'],
  ])('Q%i (%s) accepts "%s"', (id, _label, input) => {
    expect(gradeQ(id as number, input as string).verdict).toBe('correct');
  });

  it('tolerates padding around the answer', () => {
    expect(gradeQ(2, 'I think it is the US Constitution').verdict).toBe('correct');
    expect(gradeQ(52, 'the answer is the supreme court').verdict).toBe('correct');
  });

  it('tolerates a spoken answer with filler', () => {
    expect(gradeQ(2, 'um the constitution', 'voice').verdict).toBe('correct');
    expect(gradeQ(52, 'uh I think the supreme court', 'voice').verdict).toBe('correct');
  });

  it('tolerates ordinary typos', () => {
    expect(gradeQ(2, 'the consitution').verdict).toBe('correct');
    expect(gradeQ(52, 'supreme cuort').verdict).toBe('correct');
  });
});

describe('rejects wrong answers', () => {
  it.each([
    [2, 'the declaration of independence'],
    [2, 'the bill of rights'],
    [7, '12'],
    [21, '435'], // senators vs representatives
    [24, '100'],
    [53, 'five'],
    [78, 'Washington'],
    [119, 'New York'],
    [123, 'America the Beautiful'],
    [92, 'World War II'],
  ])('Q%i rejects "%s"', (id, input) => {
    expect(gradeQ(id as number, input as string).verdict).not.toBe('correct');
  });

  it('rejects empty and nonsense input', () => {
    for (const junk of ['', '   ', 'asdfgh', '???']) {
      expect(gradeQ(2, junk).verdict).not.toBe('correct');
    }
  });
});

describe('compound answers require every part', () => {
  it('Q16 rejects naming only one branch', () => {
    expect(gradeQ(16, 'legislative').verdict).not.toBe('correct');
    expect(gradeQ(16, 'executive').verdict).not.toBe('correct');
    expect(gradeQ(16, 'legislative and executive').verdict).not.toBe('correct');
  });

  it('Q16 accepts all three, in any order', () => {
    expect(gradeQ(16, 'legislative executive and judicial').verdict).toBe('correct');
    expect(gradeQ(16, 'judicial, legislative, executive').verdict).toBe('correct');
  });

  it('Q19 rejects naming only one chamber', () => {
    expect(gradeQ(19, 'the senate').verdict).not.toBe('correct');
    expect(gradeQ(19, 'house of representatives').verdict).not.toBe('correct');
  });

  it('Q19 accepts both chambers', () => {
    expect(gradeQ(19, 'the senate and the house').verdict).toBe('correct');
    expect(gradeQ(19, 'senate and house of representatives').verdict).toBe('correct');
  });
});

/**
 * Question pairs that legitimately accept each other's answer wording.
 *
 * Every entry needs a justification, because the easy way to make the
 * cross-contamination test pass is to keep adding exceptions until it means
 * nothing. These are cases where a USCIS officer would accept either phrasing.
 */
const SHARED_ANSWER_ALLOWLIST: ReadonlyArray<readonly [number, number, string]> = [
  // "Religious freedom" and "Freedom of religion" are the same right, printed
  // one way in the rights question and the other in the colonists question.
  [65, 73, 'religious freedom / freedom of religion are the same concept'],
  [73, 65, 'religious freedom / freedom of religion are the same concept'],
  // Both wars were entered "to support the Allied Powers"; USCIS puts the
  // country list in optional parentheses, so the shared stem is the answer and
  // the differing membership is volunteered detail.
  [101, 106, 'both answers are "to support the Allied Powers"'],
  [106, 101, 'both answers are "to support the Allied Powers"'],
];

const isAllowed = (target: number, other: number): boolean =>
  SHARED_ANSWER_ALLOWLIST.some(([a, b]) => a === target && b === other);

describe('cross-contamination', () => {
  /**
   * The guard against a matcher so loose it accepts anything. An answer to a
   * different question must not grade correct here, or the engine would be
   * telling users they know material they do not.
   */
  it('does not accept another question’s answer', () => {
    const statics = QUESTIONS.filter((q) => q.kind === 'static' && q.answers.length > 0);
    const failures: string[] = [];

    // Compare on sorted content tokens, not raw strings. Several questions
    // genuinely share an answer that differs only by a stopword — Q42 "Who is
    // Commander in Chief?" answers "The President (of the United States)" while
    // Q46 "The executive branch has many parts" answers "President (of the
    // United States)". Accepting either for both is correct, not a leak.
    const key = (v: string): string => [...normalize(v).tokens].sort().join(' ');

    for (const target of statics) {
      const own = new Set(target.answers.flatMap((a) => a.variants.map(key)));

      for (const other of statics) {
        if (other.id === target.id) continue;
        if (isAllowed(target.id, other.id)) continue;
        for (const a of other.answers) {
          for (const v of a.variants) {
            if (own.has(key(v))) continue;
            if (gradeSingle(v, target.answers).verdict === 'correct') {
              failures.push(`Q${target.id} wrongly accepted Q${other.id}'s "${v}"`);
            }
          }
        }
      }
    }

    // Reported in full rather than as a count, so any regression names itself.
    expect(failures).toEqual([]);
  });
});

describe('result shape', () => {
  it('reports an exact match when the input is already canonical', () => {
    const r = gradeQ(2, 'constitution');
    expect(r.stage).toBe('exact');
    expect(r.confidence).toBe(1);
  });

  it('reports the stage and a candidate for feedback', () => {
    // "the constitution" keeps its article, so it is not byte-identical to the
    // stored variant "constitution" — the token-set stage is what catches it.
    const r = gradeQ(2, 'the constitution');
    expect(r.verdict).toBe('correct');
    expect(r.stage).toBe('token-set');
    expect(r.matchedAnswerIds).toHaveLength(1);
    expect(r.engineVersion).toBe('1.0.0');
  });

  it('offers a best candidate even when incorrect, for the reveal card', () => {
    const r = gradeQ(2, 'the consttoosh');
    expect(r.verdict).not.toBe('correct');
    expect(r.bestCandidateId).toBeDefined();
  });
});
