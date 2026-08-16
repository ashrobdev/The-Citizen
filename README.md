# The Citizen

Preparation for the USCIS naturalization civics test, built around the way the test
actually works.

The real interview is **oral and open-ended**: an officer asks up to 20 of the 128 civics
questions and you must produce the answer aloud. Multiple-choice apps train recognition,
which is the wrong skill. Here every question is answered by **typing or speaking** — never
by picking from a list.

- **12 questions a day, 90 days.** Spaced repetition tracks how often each question was
  asked and answered correctly, so mastered material fades and weak material returns.
- **Streaks**, with one earnable freeze so a single missed day doesn't erase weeks.
- **Final Test** — 20 questions, repeatable, ending the moment 12 are correct, exactly as a
  real officer would stop. Never affects your streak.
- **Wrong answers show every accepted answer**, and you choose which ones you intend to
  memorise. Those picks are remembered and surfaced whenever you miss that question again.

Content follows USCIS **M-1778 (09/25)** — the 128-question 2025 version — verbatim.

## Status

Phase 0: project shell. See the build plan for what lands next.

## Requirements

Node 22 (pinned in `.nvmrc`). Expo SDK 57.

## Getting started

```bash
npm install
npm start
```

Scan the QR code with Expo Go. Everything through Phase 3 runs in Expo Go with no native
build; voice input arrives in Phase 4 and needs a development build.

## Checks

```bash
npm run typecheck   # tsc, strict + noUncheckedIndexedAccess
npm test            # domain suites (grading, scheduling) — pure TS, no RN
npm run lint
```

`src/domain` contains **no React and no React Native imports**. Grading and scheduling are
pure functions over plain data, so they test fast and can be reused server-side later.

## A note on accuracy

Some answers change with elections and appointments. The app carries an officials dataset
with a visible "data as of" date and links to the authority. Always confirm current
officeholders at **uscis.gov/citizenship/testupdates**.

Not affiliated with or endorsed by USCIS or any government agency.
