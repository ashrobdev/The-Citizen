/**
 * The 128 USCIS civics questions (M-1778, 09/25).
 *
 * This content is an immutable, app-versioned asset — never a database table.
 * SQLite holds only user state, which removes a whole category of sync problems.
 */

export type QuestionId = number; // 1..128, the canonical USCIS numbering

/**
 * Stable identifier for one accepted answer, `${questionId}:${slug}`.
 *
 * Deliberately NOT an array index: focus-answer picks are persisted against
 * these, and indexes shift whenever content is corrected, which would silently
 * repoint a user's saved choices at the wrong answers.
 */
export type AnswerId = string;

export type Section = 'government' | 'history' | 'symbols';

export type AnswerKind =
  /** Fixed fact. The overwhelming majority. */
  | 'static'
  /** Q30, Q38, Q39, Q57 — changes with election or appointment. */
  | 'dynamic_federal'
  /** Q23, Q61, Q62 — depends on the user's state. */
  | 'dynamic_state'
  /** Q29 — depends on the user's congressional district. */
  | 'dynamic_district';

export interface AcceptedAnswer {
  id: AnswerId;
  /** Exactly as printed by USCIS, including parentheses. Shown to the user. */
  display: string;
  /** Normalized forms generated at build time from `display`. */
  variants: string[];
  /** Content tokens that must all be present for a containment match. */
  requiredTokens: string[];
  /** USCIS editorial note in square brackets, kept out of matchable text. */
  note?: string;
}

export interface Question {
  id: QuestionId;
  section: Section;
  subsection: string;
  prompt: string;
  kind: AnswerKind;
  /** Distinct answers the user must supply. 1 for most; 2, 3 or 5 for seven questions. */
  requiredCount: number;
  /**
   * All accepted answers. Empty for `dynamic_*` questions, which are resolved at
   * runtime from the officials dataset.
   */
  answers: AcceptedAnswer[];
  /** One of the 20 asterisked questions for the 65/20 exemption. */
  seniorExempt: boolean;
  /** Which officials-dataset role resolves this question, for `dynamic_*` kinds. */
  dynamicRole?: DynamicRole;
  /** Verbatim USCIS answer block, retained for auditing. */
  sourceRaw: string;
}

export type DynamicRole =
  | 'president'
  | 'vicePresident'
  | 'speaker'
  | 'chiefJustice'
  | 'senator'
  | 'representative'
  | 'governor'
  | 'capital';

export interface QuestionBank {
  /** USCIS document version this bank was built from. */
  source: string;
  generatedAt: string;
  questions: Question[];
}
