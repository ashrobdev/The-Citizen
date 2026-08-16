import { QUESTIONS, getQuestion } from '../questions/bank';

import { gradeMulti, segmentAnswers } from './multi';

const gradeQ = (id: number, input: string, mode: 'text' | 'voice' = 'text') => {
  const q = getQuestion(id);
  return gradeMulti(segmentAnswers(input), q.answers, q.requiredCount, { mode });
};

const gradeFields = (id: number, fields: string[]) => {
  const q = getQuestion(id);
  return gradeMulti(fields, q.answers, q.requiredCount);
};

describe('segmentAnswers', () => {
  it('splits on commas, semicolons and "and"', () => {
    expect(segmentAnswers('New York, New Jersey and Delaware')).toEqual([
      'New York',
      'New Jersey',
      'Delaware',
    ]);
  });

  it('keeps a single answer whole', () => {
    expect(segmentAnswers('freedom of speech')).toEqual(['freedom of speech']);
  });

  it('ignores empty fragments from trailing separators', () => {
    expect(segmentAnswers('Virginia, Georgia,')).toEqual(['Virginia', 'Georgia']);
  });
});

describe('Q81 — name five of the thirteen original states', () => {
  it('accepts five distinct states in one utterance', () => {
    const r = gradeQ(81, 'Virginia, New York, Georgia, Delaware and Rhode Island');
    expect(r.verdict).toBe('correct');
    expect(r.matchedCount).toBe(5);
  });

  it('accepts five states typed into separate fields', () => {
    const r = gradeFields(81, ['Virginia', 'New York', 'Georgia', 'Delaware', 'Rhode Island']);
    expect(r.verdict).toBe('correct');
  });

  it('does not let one state count five times', () => {
    // The whole point of consuming each answer once.
    const r = gradeFields(81, ['Virginia', 'Virginia', 'Virginia', 'Virginia', 'Virginia']);
    expect(r.verdict).not.toBe('correct');
    expect(r.matchedCount).toBe(1);
  });

  it('is near, not correct, at four of five', () => {
    const r = gradeQ(81, 'Virginia, New York, Georgia, Delaware');
    expect(r.verdict).toBe('near');
    expect(r.partialRatio).toBeCloseTo(0.8);
  });

  it('rejects states that were not among the original thirteen', () => {
    const r = gradeQ(81, 'California, Texas, Oregon, Florida and Ohio');
    expect(r.verdict).toBe('incorrect');
    expect(r.matchedCount).toBe(0);
    expect(r.unmatchedSegments).toHaveLength(5);
  });

  it('counts only the valid states in a mixed answer', () => {
    const r = gradeQ(81, 'Virginia, California, Georgia, Texas and Delaware');
    expect(r.matchedCount).toBe(3);
    expect(r.verdict).toBe('near');
    expect(r.unmatchedSegments).toEqual(['California', 'Texas']);
  });
});

describe('Q65 — three rights', () => {
  it('accepts three distinct rights', () => {
    const r = gradeQ(65, 'freedom of speech, freedom of religion, freedom of assembly');
    expect(r.verdict).toBe('correct');
    expect(r.matchedCount).toBe(3);
  });

  it('does not accept the same right three times', () => {
    const r = gradeFields(65, ['freedom of speech', 'freedom of speech', 'freedom of speech']);
    expect(r.matchedCount).toBe(1);
    expect(r.verdict).not.toBe('correct');
  });
});

describe('Q126 — three national holidays', () => {
  it('accepts three', () => {
    const r = gradeQ(126, 'Christmas, Thanksgiving and Labor Day');
    expect(r.verdict).toBe('correct');
  });

  it('rejects holidays that are not national', () => {
    const r = gradeQ(126, 'Halloween, Easter and Valentines Day');
    expect(r.verdict).toBe('incorrect');
  });
});

describe('Q48 — two Cabinet-level positions', () => {
  it('accepts two from the pool of twenty-two', () => {
    const r = gradeQ(48, 'Secretary of State and Secretary of Defense');
    expect(r.verdict).toBe('correct');
  });

  it('accepts the Attorney General, which has no "Secretary" prefix', () => {
    const r = gradeQ(48, 'Attorney General and Secretary of Labor');
    expect(r.verdict).toBe('correct');
  });
});

describe('every multi-answer question is satisfiable by its own answers', () => {
  it('grades the first N printed answers correct for each', () => {
    const failures: string[] = [];
    for (const q of QUESTIONS) {
      if (q.requiredCount <= 1) continue;
      const picks = q.answers.slice(0, q.requiredCount).map((a) => a.display);
      const r = gradeMulti(picks, q.answers, q.requiredCount);
      if (r.verdict !== 'correct') {
        failures.push(`Q${q.id} ${r.matchedCount}/${q.requiredCount} from ${picks.join(' | ')}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('grades any N answers correct, not just the first N', () => {
    const failures: string[] = [];
    for (const q of QUESTIONS) {
      if (q.requiredCount <= 1) continue;
      const picks = q.answers.slice(-q.requiredCount).map((a) => a.display);
      const r = gradeMulti(picks, q.answers, q.requiredCount);
      if (r.verdict !== 'correct') failures.push(`Q${q.id} tail picks -> ${r.verdict}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('result shape', () => {
  it('reports partial progress for the reveal card', () => {
    const r = gradeQ(81, 'Virginia and Georgia');
    expect(r.requiredCount).toBe(5);
    expect(r.matchedCount).toBe(2);
    expect(r.partialRatio).toBeCloseTo(0.4);
    expect(r.verdict).toBe('incorrect'); // below the halfway mark
  });

  it('handles empty input without throwing', () => {
    const r = gradeQ(81, '');
    expect(r.verdict).toBe('incorrect');
    expect(r.matchedCount).toBe(0);
  });
});
