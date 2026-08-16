/**
 * Stars-and-stripes palette.
 *
 * Deliberately not pure #FF0000 / #0000FF — those are garish on screen and fail
 * contrast for body text. Old Glory Red sits at ~5.3:1 on white and the navy at
 * ~14:1, so both carry text safely.
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
    /** Slightly inset rows, pressed states. */
    surfaceMuted: '#F2EEE7',
    text: Palette.ink,
    textSecondary: '#5A5F6B',
    accent: Palette.blue,
    accentAlt: Palette.red,
    /**
     * Text and glyphs sitting ON accent/success/error fills.
     *
     * This exists because seven screens hardcoded '#FFFFFF' here. That is fine
     * in light mode and badly wrong in dark, where the accents are LIGHT
     * colours — white on the dark success green measured 1.93:1, across all 128
     * cells of the progress grid.
     */
    onAccent: Palette.white,
    /** 10–12% tints for calm backgrounds behind a verdict or highlight. */
    accentSoft: '#E7EDF7',
    successSoft: '#E4F0E8',
    errorSoft: '#F7E7E9',
    border: '#DFDAD1',
    success: '#1B6B3A',
    error: Palette.red,
    overlay: 'rgba(16, 35, 63, 0.45)',
  },
  dark: {
    background: Palette.navy,
    surface: '#17304F',
    surfaceMuted: '#1D3A5E',
    text: '#F2F4F8',
    textSecondary: '#A8B4C6',
    accent: '#6E9BE0',
    accentAlt: '#E3596B',
    success: '#5FD08B',
    error: '#E3596B',
    /** Dark ink on the light accents, which is what actually reads there. */
    onAccent: '#0C1A2E',
    accentSoft: '#1E3A5C',
    successSoft: '#1B3D2C',
    errorSoft: '#3D1F26',
    border: '#26436B',
    overlay: 'rgba(4, 10, 20, 0.6)',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ColorToken = keyof typeof Colors.light;

/**
 * A resolved palette. Structural rather than `typeof Colors.light`, which would
 * pin the literal light-mode hex values and reject the dark palette.
 */
export type Theme = { readonly [K in ColorToken]: string };
