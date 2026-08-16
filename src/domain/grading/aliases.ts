/**
 * Curated equivalences applied during normalization.
 *
 * Deliberately small. Every entry must be justified by something real — a form
 * that appears in the USCIS source text, or a transcript the app actually
 * recorded. Speculative entries are how a matcher quietly becomes too loose, so
 * the speech-to-text homophone section stays empty until Phase 4 produces real
 * voice data to mine.
 *
 * Multi-word keys are matched before single words, longest first.
 */

/** Phrase-level rewrites, applied to the token stream longest-match-first. */
export const PHRASE_ALIASES: Record<string, string> = {
  // The source prints both "(U.S.) Constitution" and "United States", and users
  // type either. Folding them removes a whole class of false negatives.
  'united states of america': 'us',
  'united states': 'us',
  'district of columbia': 'dc',
  'washington dc': 'dc',
};

/**
 * Single-token rewrites.
 *
 * "american" is deliberately NOT mapped to "us": it is an adjective, and
 * folding it would turn "Native Americans" into "native us" and the "American
 * Revolution" into the "us Revolution". "america" as a standalone noun is safe
 * because the tokenizer never produces it from "American".
 */
export const TOKEN_ALIASES: Record<string, string> = {
  usa: 'us',
  america: 'us',
};

/**
 * Words dropped before token-set comparison. Kept short on purpose: aggressive
 * stopword lists destroy short answers like "War of 1812".
 */
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'is', 'are', 'was',
  'were', 'be', 'for', 'that', 'it', 'its', 'as', 'by', 'at', 'from', 'with',
]);

/** Speech disfluencies and lead-ins, stripped in voice mode only. */
export const VOICE_FILLERS = new Set([
  'um', 'uh', 'er', 'ah', 'hmm', 'like', 'well', 'so', 'okay', 'ok',
  'i', 'think', 'guess', 'believe', 'answer', 'says', 'maybe', 'probably',
]);

/**
 * Words that carry no answer content, ignored when checking whether an input
 * introduced material the accepted answer does not have.
 *
 * This is what lets "I think it is the US Constitution" match while
 * "defend the US Constitution" — which is a different question's answer — does
 * not: "defend" is real content, "think" is not.
 */
export const LEAD_INS = new Set([
  'i', 'we', 'you', 'my', 'me', 'think', 'thought', 'guess', 'believe', 'know',
  'answer', 'answers', 'say', 'says', 'said', 'would', 'maybe', 'probably',
  'just', 'really', 'well', 'um', 'uh', 'like', 'okay', 'ok', 'so', 'yeah',
  'called', 'named', 'thing', 'one',
]);

/**
 * Singular words that merely end in "s". Stripping these changes their meaning.
 *
 * Ordinary plurals are NOT listed: normalization runs over the canonical answer
 * and the user's input alike, so stripping both sides is symmetric and harmless.
 * Only words where the trailing "s" is not a plural marker belong here.
 */
export const PLURAL_EXCEPTIONS = new Set([
  'us', 'congress', 'press', 'business', 'process', 'access', 'address',
  'illinois', 'texas', 'kansas', 'arkansas', 'massachusetts', 'adams',
  'jones', 'lewis', 'hopkins', 'christmas', 'veterans', 'happiness',
]);
