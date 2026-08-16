/**
 * WCAG contrast maths.
 *
 * Exists because a palette can look fine and still be unreadable: white on the
 * dark scheme's success green measured 1.93:1, and nobody noticed until it was
 * computed. `contrast.test.ts` asserts every text-on-surface pair in both
 * schemes, so that class of bug cannot come back quietly.
 */

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(clean.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (>=18.66pt bold or 24pt). */
export const AA_BODY = 4.5;
export const AA_LARGE = 3;

export function meetsAA(foreground: string, background: string, large = false): boolean {
  return contrastRatio(foreground, background) >= (large ? AA_LARGE : AA_BODY);
}
