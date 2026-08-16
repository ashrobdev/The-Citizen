/**
 * Stars-and-stripes palette.
 *
 * Deliberately not pure #FF0000 / #0000FF — those are garish on screen and fail
 * contrast for body text. Old Glory Red sits at ~5.3:1 on white (WCAG AA) and
 * the navy at ~14:1, so both carry text safely.
 *
 * Correct/incorrect must never be signalled by colour alone; every use of
 * `success`/`error` pairs with an icon and a text label.
 */
export const Palette = {
  navy: '#10233F',
  blue: '#1B4FA0',
  red: '#B22234',
  cream: '#FBF8F3',
  ink: '#131417',
  white: '#FFFFFF',
} as const;

export const Colors = {
  light: {
    background: Palette.cream,
    surface: Palette.white,
    text: Palette.ink,
    textSecondary: '#5A5F6B',
    accent: Palette.blue,
    accentAlt: Palette.red,
    border: '#DFDAD1',
    success: '#1B6B3A',
    error: Palette.red,
  },
  dark: {
    background: Palette.navy,
    surface: '#17304F',
    text: '#F2F4F8',
    textSecondary: '#A8B4C6',
    accent: '#6E9BE0',
    accentAlt: '#E3596B',
    border: '#26436B',
    success: '#5FD08B',
    error: '#E3596B',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ColorToken = keyof typeof Colors.light;
