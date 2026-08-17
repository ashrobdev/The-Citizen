import { DYNAMIC_QUESTION_IDS, getQuestion } from '../questions/bank';
import type { DynamicRole, QuestionId } from '../questions/types';

import { resolveDynamicQuestion, type UserLocation } from './resolver';
import type { OfficialsData } from './schema';

/**
 * Answers whether an officials update changed anything *this* user would say.
 *
 * ## Why this exists
 *
 * A refresh across 435 House seats changes something most weeks, and almost
 * none of it is relevant to any one person. An alert that is usually noise gets
 * muted, which takes the one alert that matters with it. So the notification is
 * gated on this rather than on the dataset's version.
 *
 * ## Why it resolves rather than compares the schema
 *
 * The obvious implementation walks `OfficialsData` and compares senators,
 * governor and so on by hand. That is a second answer to "what would this user
 * be graded against?", sitting beside `resolveDynamicQuestion` and free to
 * drift from it — and a diff that disagrees with the grader is worse than none,
 * because it notifies about changes the user never sees and stays silent on
 * ones they do.
 *
 * Instead this resolves every dynamic question twice, against the old dataset
 * and the new one, and compares the results. Correctness is then inherited: the
 * thing being compared is literally what the user will be graded against,
 * including the vacancy and no-location fallbacks the resolver already encodes.
 */

export interface OfficialsChange {
  role: DynamicRole;
  /** Accepted display forms before the update; empty when it was self-attest. */
  before: readonly string[];
  /** Accepted display forms after the update; empty when it is now self-attest. */
  after: readonly string[];
}

/** Sorted so answer order can never masquerade as a change — either senator may come first. */
function displays(
  officials: OfficialsData | undefined,
  location: UserLocation | undefined,
  questionId: QuestionId,
): { answers: string[]; selfAttest: boolean } {
  const resolved = resolveDynamicQuestion(getQuestion(questionId), officials, location);
  return {
    answers: resolved.answers.map((a) => a.display).sort(),
    selfAttest: resolved.selfAttest,
  };
}

function sameAnswers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The roles whose answers changed for this user, or an empty array.
 *
 * Returns nothing when `before` is undefined: the first run has no previous
 * dataset to compare against, and announcing "your officials changed" to
 * someone who has never seen the old ones is meaningless.
 *
 * Federal roles are included deliberately. The original plan scoped this to the
 * user's senators, representative, governor and capital, but a new Speaker or
 * Chief Justice changes an answer *every* user has to know, and resolving the
 * whole dynamic set covers them at no extra cost. The noise this guards against
 * came from other people's districts, which location scoping already removes.
 */
export function diffUserAnswers(
  before: OfficialsData | undefined,
  after: OfficialsData,
  location: UserLocation | undefined,
): OfficialsChange[] {
  if (before === undefined) return [];

  const out: OfficialsChange[] = [];
  const seen = new Set<DynamicRole>();

  for (const id of DYNAMIC_QUESTION_IDS) {
    const role = getQuestion(id).dynamicRole;
    // One role can back several questions; report it once.
    if (role === undefined || seen.has(role)) continue;

    const was = displays(before, location, id);
    const now = displays(after, location, id);

    // A seat going vacant, or a name arriving for one that was unfilled, is a
    // change even though one side has no answers to compare.
    if (was.selfAttest === now.selfAttest && sameAnswers(was.answers, now.answers)) continue;

    seen.add(role);
    out.push({ role, before: was.answers, after: now.answers });
  }

  return out;
}

const ROLE_NOUNS: Record<DynamicRole, string> = {
  president: 'president',
  vicePresident: 'vice president',
  speaker: 'Speaker of the House',
  chiefJustice: 'Chief Justice',
  senator: 'senators',
  representative: 'representative',
  governor: 'governor',
  capital: 'state capital',
};

/**
 * Notification body naming what actually changed.
 *
 * The previous copy hedged — "your senators, representative or governor *may*
 * have changed" — because it fired on any version bump and genuinely did not
 * know. Now it does, so it says so.
 */
export function describeChanges(changes: readonly OfficialsChange[]): string {
  const nouns = changes.map((c) => ROLE_NOUNS[c.role]);
  if (nouns.length === 0) return '';
  const list =
    nouns.length === 1
      ? nouns[0]
      : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `Your ${list} changed. Tap to review the new answers.`;
}
