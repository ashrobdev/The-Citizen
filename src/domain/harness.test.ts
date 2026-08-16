import fc from 'fast-check';

/**
 * Proves the domain test project is wired up: TypeScript compiles, strict
 * settings apply, and fast-check runs. Deleted once real domain suites exist.
 */
describe('domain test harness', () => {
  it('runs typescript', () => {
    const answer: string = 'the citizen';
    expect(answer).toHaveLength(11);
  });

  it('runs fast-check property tests', () => {
    fc.assert(
      fc.property(fc.string(), (s) => s.trim().length <= s.length),
      { numRuns: 200 },
    );
  });
});
