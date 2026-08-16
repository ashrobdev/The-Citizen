import {
  buildRequiredTokens,
  buildVariants,
  extractNote,
  noteDeclaresMoreAnswers,
} from './variants';

describe('extractNote', () => {
  it('splits a bracketed editorial note off the answer', () => {
    const r = extractNote(
      'Liberty Island [Also acceptable are New Jersey, near New York City, and on the Hudson (River).]',
    );
    expect(r.matchable).toBe('Liberty Island');
    expect(r.note).toContain('Also acceptable');
  });

  it('leaves a plain answer untouched', () => {
    expect(extractNote('(U.S.) Constitution')).toEqual({ matchable: '(U.S.) Constitution' });
  });
});

describe('noteDeclaresMoreAnswers', () => {
  it('flags notes that announce further answers', () => {
    expect(noteDeclaresMoreAnswers('Also acceptable are New Jersey')).toBe(true);
  });

  it('ignores ordinary guidance notes', () => {
    expect(noteDeclaresMoreAnswers('District of Columbia residents should answer ...')).toBe(false);
    expect(noteDeclaresMoreAnswers(undefined)).toBe(false);
  });
});

describe('buildVariants', () => {
  it('makes a leading parenthetical optional', () => {
    const v = buildVariants('(U.S.) Constitution');
    expect(v).toContain('constitution');
    expect(v).toContain('us constitution');
  });

  it('handles an optional prefix phrase', () => {
    const v = buildVariants('(Battle of) Bunker Hill');
    expect(v).toContain('bunker hill');
    expect(v).toContain('battle of bunker hill');
  });

  it('handles an optional suffix', () => {
    // Variants keep stopwords, because the exact-match stage compares full
    // strings. Dropping "the" is the token-set stage's job, not this one.
    const v = buildVariants('The President (of the United States)');
    expect(v).toContain('the president');
    expect(v).toContain('the president of the us');
  });

  it('folds the word/digit pair to one variant', () => {
    // "Twenty-seven (27)" -> both halves normalize to "27", so the whole answer
    // collapses rather than producing a bogus "twenty seven 27" requirement.
    expect(buildVariants('Twenty-seven (27)')).toEqual(['27']);
    expect(buildVariants('Nine (9)')).toEqual(['9']);
    expect(buildVariants('Four hundred thirty-five (435)')).toEqual(['435']);
  });

  it('keeps an alternative name reachable', () => {
    const v = buildVariants('Boston Tea Party (Tea Act)');
    expect(v).toContain('boston tea party');
  });

  it('expands two independent parentheticals', () => {
    const v = buildVariants('(Because there were) 13 original colonies');
    expect(v).toContain('13 original colony');
    expect(v).toContain('because there were 13 original colony');
  });

  it('ignores the bracketed note entirely', () => {
    const v = buildVariants('Liberty Island [Also acceptable are New Jersey.]');
    expect(v).toEqual(['liberty island']);
  });

  it('returns sorted, deduped, non-empty forms', () => {
    const v = buildVariants('(U.S.) Constitution');
    expect(v).toEqual([...v].sort());
    expect(new Set(v).size).toBe(v.length);
    expect(v.every((s) => s.length > 0)).toBe(true);
  });
});

describe('buildRequiredTokens', () => {
  it('takes the irreducible core, not the long form', () => {
    expect(buildRequiredTokens('(Battle of) Bunker Hill')).toEqual(['bunker', 'hill']);
    expect(buildRequiredTokens('(U.S.) Constitution')).toEqual(['constitution']);
  });

  it('requires every part of a compound answer', () => {
    // Q16 — naming one branch must not pass.
    expect(buildRequiredTokens('Legislative, executive, and judicial')).toEqual([
      'legislative',
      'executive',
      'judicial',
    ]);
    // Q19
    expect(buildRequiredTokens('Senate and House (of Representatives)')).toEqual([
      'senate',
      'house',
    ]);
  });

  it('drops stopwords', () => {
    expect(buildRequiredTokens('The President (of the United States)')).toEqual(['president']);
  });
});
