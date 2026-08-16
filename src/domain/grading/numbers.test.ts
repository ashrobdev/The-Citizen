import { canonicalizeNumbers } from './numbers';

const run = (s: string): string => canonicalizeNumbers(s.split(' ')).join(' ');

describe('canonicalizeNumbers', () => {
  describe('the forms USCIS actually prints', () => {
    it.each([
      ['twenty seven', '27'], // Q7  "Twenty-seven (27)"
      ['27', '27'],
      ['one hundred', '100'], // Q21 "One hundred (100)"
      ['100', '100'],
      ['four hundred thirty five', '435'], // Q24 "Four hundred thirty-five (435)"
      ['435', '435'],
      ['nine', '9'], // Q53 "Nine (9)"
      ['six', '6'], // Q22 "Six (6) years"
      ['two', '2'], // Q27 "Two (2)"
      ['fifty', '50'], // Q122 "50 states"
      ['thirteen', '13'], // Q121 "13 original colonies"
    ])('%s -> %s', (input, expected) => {
      expect(run(input)).toBe(expected);
    });
  });

  describe('years', () => {
    it.each([
      ['seventeen seventy six', '1776'], // Q79 "July 4, 1776"
      ['1776', '1776'],
      ['nineteen twenty', '1920'], // Q102 "1920"
      ['nineteen twenty nine', '1929'], // Q104 "1929"
      ['eighteen seventy', '1870'], // Q98 "1870"
    ])('%s -> %s', (input, expected) => {
      expect(run(input)).toBe(expected);
    });

    it('does not treat a genuine hundred phrase as a year', () => {
      expect(run('nineteen hundred')).toBe('1900');
    });
  });

  describe('ordinals', () => {
    it.each([
      ['third president', '3 president'], // Q87
      ['sixteenth president', '16 president'], // Q94
      ['16th president', '16 president'],
      ['first secretary of the treasury', '1 secretary of the treasury'], // Q89
      ['22nd amendment', '22 amendment'], // Q37
      ['14th amendment', '14 amendment'], // Q97
    ])('%s -> %s', (input, expected) => {
      expect(run(input)).toBe(expected);
    });
  });

  it('leaves non-numeric text alone', () => {
    expect(run('the constitution')).toBe('the constitution');
    expect(run('freedom of speech')).toBe('freedom of speech');
  });

  it('handles "and" inside a number without swallowing a trailing conjunction', () => {
    expect(run('one hundred and five')).toBe('105');
    expect(run('two and the courts')).toBe('2 and the courts');
  });

  it('is idempotent', () => {
    const inputs = [
      'twenty seven',
      'seventeen seventy six',
      'four hundred thirty five',
      'sixteenth president',
      'the constitution',
    ];
    for (const input of inputs) {
      expect(run(run(input))).toBe(run(input));
    }
  });
});
