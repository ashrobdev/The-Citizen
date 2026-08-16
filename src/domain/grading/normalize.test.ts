import fc from 'fast-check';

import { normalize } from './normalize';

const text = (s: string, mode: 'text' | 'voice' = 'text'): string => normalize(s, mode).text;
const tokens = (s: string, mode: 'text' | 'voice' = 'text'): string[] => normalize(s, mode).tokens;

describe('normalize', () => {
  describe('the "(U.S.) Constitution" family', () => {
    it.each([
      'U.S. Constitution',
      'us constitution',
      'the U.S. Constitution',
      'United States Constitution',
      'the constitution of the United States',
    ])('%s reduces to constitution-bearing tokens', (input) => {
      expect(tokens(input)).toContain('constitution');
    });

    it('folds the dotted, spaced and plain forms together', () => {
      expect(text('U.S. Constitution')).toBe(text('us constitution'));
      expect(text('United States Constitution')).toBe(text('us constitution'));
    });

    it('collapses spaced initialisms only in voice mode', () => {
      expect(text('u s constitution', 'voice')).toBe(text('us constitution', 'voice'));
    });
  });

  describe('punctuation, case and whitespace are irrelevant', () => {
    it.each([
      ['The Star-Spangled Banner', 'the star spangled banner'],
      ['  freedom   of  SPEECH ', 'freedom of speech'],
      ['“We the People”', 'we the people'],
      ["a state's rights", 'a state right'],
    ])('%s ~ %s', (a, b) => {
      expect(text(a)).toBe(text(b));
    });
  });

  describe('numbers fold to digits', () => {
    it.each([
      ['Twenty-seven (27)', 'twenty seven 27'],
      ['Four hundred thirty-five (435)', 'four hundred thirty five 435'],
    ])('%s', (printed, spelled) => {
      // Both halves of the USCIS "word (digit)" form reduce to the same digits.
      expect(text(printed)).toBe(text(spelled));
    });

    it('matches a bare digit answer against its spelled form', () => {
      expect(text('twenty seven')).toBe(text('27'));
      expect(text('nine')).toBe(text('9'));
    });
  });

  describe('voice filler removal', () => {
    it('strips lead-ins that speech recognizers capture', () => {
      // `text` keeps stopwords for exact matching, so the residual "the ... is"
      // survives there. The token set is the layer that has to survive a
      // rambling spoken answer, and it does.
      expect(tokens('um I think the answer is the constitution', 'voice')).toEqual(
        tokens('the constitution', 'voice'),
      );
    });

    it('leaves filler words alone in text mode', () => {
      expect(text('i think')).not.toBe('');
    });
  });

  describe('plural handling', () => {
    it('folds ordinary plurals', () => {
      expect(text('rights')).toBe(text('right'));
      expect(text('colonies')).toBe(text('colony'));
    });

    it('does not mangle singular words ending in s', () => {
      expect(tokens('Congress')).toEqual(['congress']);
      expect(tokens('Massachusetts')).toEqual(['massachusetts']);
      // "us" must never become "u"
      expect(tokens('U.S.')).toEqual(['us']);
    });
  });

  describe('stopwords', () => {
    it('are kept in text but dropped from tokens', () => {
      const n = normalize('the rule of law');
      expect(n.text).toBe('the rule of law');
      expect(n.tokens).toEqual(['rule', 'law']);
    });
  });

  describe('properties', () => {
    it('is idempotent', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          const once = normalize(s).text;
          expect(normalize(once).text).toBe(once);
        }),
        { numRuns: 500 },
      );
    });

    it('never throws and always returns trimmed, single-spaced text', () => {
      fc.assert(
        fc.property(fc.string(), fc.constantFrom<'text' | 'voice'>('text', 'voice'), (s, mode) => {
          const out = normalize(s, mode).text;
          expect(out).toBe(out.trim());
          expect(out).not.toMatch(/\s{2,}/);
        }),
        { numRuns: 500 },
      );
    });

    it('is insensitive to surrounding whitespace and case', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          expect(normalize(`  ${s.toUpperCase()}  `).text).toBe(normalize(s.toLowerCase()).text);
        }),
        { numRuns: 300 },
      );
    });
  });
});
