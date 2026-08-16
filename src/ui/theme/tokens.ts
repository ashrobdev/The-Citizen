/**
 * Spacing, type and radius scales.
 *
 * The screens grew with ad-hoc numbers — 11 here, 13 there — which reads as
 * noise rather than rhythm. These are the only values any screen should use.
 */

/** 4pt base grid. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Type scale. Sizes step by roughly 1.25 so headings separate clearly from
 * body without a jump that looks accidental.
 */
export const Type = {
  display: { fontSize: 44, fontWeight: '800', letterSpacing: -1.2 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 21, fontWeight: '700', letterSpacing: -0.2 },
  question: { fontSize: 23, fontWeight: '700', lineHeight: 31 },
  body: { fontSize: 16, lineHeight: 23 },
  bodySmall: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12.5, lineHeight: 18 },
  /** Section eyebrows: uppercase, tracked out. */
  overline: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.1 },
  button: { fontSize: 16, fontWeight: '700' },
} as const;

/**
 * Minimum tappable size. Enforced on every interactive element rather than
 * left to whatever the padding happens to produce.
 */
export const HIT_TARGET = 44;

/** Soft elevation for cards. Kept subtle — this is a study app, not a game. */
export const Shadow = {
  card: {
    shadowColor: '#10233F',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
