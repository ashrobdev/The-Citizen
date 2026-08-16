import { buildRequiredTokens, buildVariants } from '../grading/variants';
import type { AcceptedAnswer, DynamicRole, Question } from '../questions/types';

import { isUnknown, type OfficialEntry, type OfficialsData } from './schema';

/**
 * Turns officials data into the same AcceptedAnswer shape static questions use.
 *
 * That equivalence is the point: dynamic questions then run through the whole
 * matching cascade — normalization, fuzzy, the containment guards — rather than
 * getting a weaker string comparison bolted on the side.
 */

export interface ResolvedQuestion {
  /** Answers to grade against. Empty means the question cannot be graded. */
  answers: AcceptedAnswer[];
  /** True when the app must ask the user instead of grading. */
  selfAttest: boolean;
  /** Explanation shown to the user, e.g. D.C. having no governor. */
  note?: string;
}

export interface UserLocation {
  /** USPS code, e.g. "CA". */
  stateCode: string;
  /** District number as a string, or "AL" for at-large. */
  district?: string;
}

function toAnswers(questionId: number, entries: readonly OfficialEntry[]): AcceptedAnswer[] {
  const out: AcceptedAnswer[] = [];
  const seen = new Set<string>();

  entries.forEach((e, entryIndex) => {
    e.answers.forEach((display, i) => {
      const variants = buildVariants(display);
      if (variants.length === 0) return;
      // Longer forms first so the fullest name wins an exact match.
      const id = `${questionId}:official-${entryIndex}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, display, variants, requiredTokens: buildRequiredTokens(display) });
    });
  });

  return out;
}

/**
 * Resolves one dynamic question for a given user.
 *
 * Returns `selfAttest` whenever there is no name to grade against — an
 * unfilled role, a vacant seat, or a user who has not told us where they live.
 * The app then asks "did you get it right?" and points at uscis.gov, which is
 * honest. Grading against a guess would not be.
 */
export function resolveDynamicQuestion(
  question: Question,
  officials: OfficialsData | undefined,
  location: UserLocation | undefined,
): ResolvedQuestion {
  const role: DynamicRole | undefined = question.dynamicRole;
  if (!role || !officials) return { selfAttest: true, answers: [] };

  const jurisdiction = location ? officials.jurisdictions[location.stateCode] : undefined;

  const attest = (note?: string): ResolvedQuestion =>
    note === undefined ? { selfAttest: true, answers: [] } : { selfAttest: true, answers: [], note };

  switch (role) {
    case 'president':
    case 'vicePresident':
    case 'speaker':
    case 'chiefJustice': {
      const key =
        role === 'speaker'
          ? 'speakerOfTheHouse'
          : role === 'chiefJustice'
            ? 'chiefJustice'
            : role;
      const held = officials.federal[key];
      if (isUnknown(held)) return attest();
      return { selfAttest: false, answers: toAnswers(question.id, [held]) };
    }

    case 'capital': {
      if (!jurisdiction) return attest();
      if (jurisdiction.capital === null) {
        // D.C. is not a state; "D.C. is not a state and has no capital" is the
        // expected answer, which is prose rather than a name to match.
        return attest(jurisdiction.governorNote ?? 'This jurisdiction has no state capital.');
      }
      if (isUnknown(jurisdiction.capital)) return attest();
      return { selfAttest: false, answers: toAnswers(question.id, [jurisdiction.capital]) };
    }

    case 'governor': {
      if (!jurisdiction) return attest();
      if (jurisdiction.governor === null) return attest(jurisdiction.governorNote);
      if (isUnknown(jurisdiction.governor)) return attest();
      return { selfAttest: false, answers: toAnswers(question.id, [jurisdiction.governor]) };
    }

    case 'senator': {
      if (!jurisdiction) return attest();
      if (jurisdiction.senators.length === 0) return attest(jurisdiction.senatorNote);
      // Either senator is a correct answer to "name one of your senators".
      return { selfAttest: false, answers: toAnswers(question.id, jurisdiction.senators) };
    }

    case 'representative': {
      if (!jurisdiction) return attest();
      const districts = jurisdiction.districts;

      if (location?.district !== undefined) {
        const rep = districts[location.district];
        if (rep && !isUnknown(rep)) {
          return { selfAttest: false, answers: toAnswers(question.id, [rep]) };
        }
      }

      // No district chosen: accept any representative from the jurisdiction
      // rather than refusing to grade. Less precise than the real interview,
      // but it never wrongly tells someone they are mistaken.
      const all = Object.values(districts).filter((r) => !isUnknown(r));
      if (all.length === 0) return attest(jurisdiction.representationNote);
      return {
        selfAttest: false,
        answers: toAnswers(question.id, all),
        ...(jurisdiction.representationNote !== undefined
          ? { note: jurisdiction.representationNote }
          : {}),
      };
    }
  }
}
