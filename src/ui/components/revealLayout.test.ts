import { getQuestion } from '../../domain/questions/bank';

import { layoutAnswers } from './revealLayout';

describe('layoutAnswers', () => {
  const q81 = getQuestion(81); // 13 original states — the showcase for focus picks

  it('shows the plain list before the user has chosen anything', () => {
    const layout = layoutAnswers(q81.answers, []);
    expect(layout.hasSaved).toBe(false);
    expect(layout.saved).toEqual([]);
    expect(layout.others).toHaveLength(q81.answers.length);
  });

  it('lifts the user’s picks out, in the question’s own order', () => {
    const picks = [q81.answers[2], q81.answers[5], q81.answers[9]].map((a) => a?.id ?? '');
    const layout = layoutAnswers(q81.answers, picks);

    expect(layout.hasSaved).toBe(true);
    expect(layout.saved.map((a) => a.id)).toEqual(picks);
    expect(layout.others).toHaveLength(q81.answers.length - 3);
  });

  it('never loses or duplicates an answer', () => {
    // The failure that would be invisible: a partition bug dropping an accepted
    // answer, so the user never sees one of the things they could have said.
    for (const count of [0, 1, 5, q81.answers.length]) {
      const picks = q81.answers.slice(0, count).map((a) => a.id);
      const layout = layoutAnswers(q81.answers, picks);

      const combined = [...layout.saved, ...layout.others].map((a) => a.id).sort();
      expect(combined).toEqual(q81.answers.map((a) => a.id).sort());
      expect(new Set(combined).size).toBe(q81.answers.length);
    }
  });

  it('ignores stale ids that no longer exist in the bank', () => {
    // Content corrections can retire an answer id; the card must not break.
    const layout = layoutAnswers(q81.answers, ['81:no-such-answer']);
    expect(layout.hasSaved).toBe(false);
    expect(layout.others).toHaveLength(q81.answers.length);
  });

  it('handles a single-answer question', () => {
    const q2 = getQuestion(2);
    const layout = layoutAnswers(q2.answers, [q2.answers[0]?.id ?? '']);
    expect(layout.saved).toHaveLength(1);
    expect(layout.others).toHaveLength(0);
  });
});
