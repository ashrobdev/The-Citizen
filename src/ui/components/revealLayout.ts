import type { AcceptedAnswer } from '../../domain/questions/types';

/**
 * How the reveal card orders accepted answers.
 *
 * Extracted from the component so it can be tested directly: this is the whole
 * payoff of asking the user to pick answers to memorise, and getting the
 * partition wrong would silently drop an answer from the list or show one
 * twice — neither of which a typecheck would catch.
 */
export interface RevealLayout {
  /** The user's own picks, shown first under "Your answers". */
  saved: AcceptedAnswer[];
  /** Everything else, shown below. */
  others: AcceptedAnswer[];
  /** True once the user has chosen picks for this question. */
  hasSaved: boolean;
}

export function layoutAnswers(
  answers: readonly AcceptedAnswer[],
  savedFocusIds: readonly string[],
): RevealLayout {
  const savedSet = new Set(savedFocusIds);
  const saved: AcceptedAnswer[] = [];
  const others: AcceptedAnswer[] = [];

  for (const answer of answers) {
    if (savedSet.has(answer.id)) saved.push(answer);
    else others.push(answer);
  }

  return { saved, others, hasSaved: saved.length > 0 };
}
