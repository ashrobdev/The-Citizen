import { Colors, type ColorScheme } from './colors';
import { AA_BODY, AA_LARGE, contrastRatio } from './contrast';

const SCHEMES: ColorScheme[] = ['light', 'dark'];

/** Rounded so failure messages read as ratios rather than float noise. */
const ratio = (a: string, b: string): number => Math.round(contrastRatio(a, b) * 100) / 100;

describe('contrast maths', () => {
  it('agrees with known WCAG values', () => {
    expect(ratio('#FFFFFF', '#000000')).toBe(21);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  it('is symmetric', () => {
    expect(ratio('#1B4FA0', '#FBF8F3')).toBe(ratio('#FBF8F3', '#1B4FA0'));
  });
});

describe.each(SCHEMES)('%s palette meets WCAG AA', (scheme) => {
  const c = Colors[scheme];

  it.each([
    ['text on background', c.text, c.background],
    ['text on surface', c.text, c.surface],
    ['text on surfaceMuted', c.text, c.surfaceMuted],
    ['textSecondary on background', c.textSecondary, c.background],
    ['textSecondary on surface', c.textSecondary, c.surface],
  ])('%s', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  /**
   * The bug this file was written for. Seven screens hardcoded '#FFFFFF' as the
   * label on filled buttons and the 128 progress cells. In the dark scheme the
   * accents are LIGHT, so white-on-success measured 1.93:1.
   */
  it.each([
    ['onAccent on accent', c.onAccent, c.accent],
    ['onAccent on accentAlt', c.onAccent, c.accentAlt],
    ['onAccent on success', c.onAccent, c.success],
    ['onAccent on error', c.onAccent, c.error],
  ])('%s', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each([
    ['text on accentSoft', c.text, c.accentSoft],
    ['text on successSoft', c.text, c.successSoft],
    ['text on errorSoft', c.text, c.errorSoft],
  ])('%s', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accent and success are distinguishable from the background as fills', () => {
    for (const fill of [c.accent, c.accentAlt, c.success, c.error]) {
      expect(ratio(fill, c.background)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe('the regression that prompted this file', () => {
  it('white on the dark success green would fail, which is why onAccent exists', () => {
    expect(ratio('#FFFFFF', Colors.dark.success)).toBeLessThan(AA_LARGE);
    expect(ratio(Colors.dark.onAccent, Colors.dark.success)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
