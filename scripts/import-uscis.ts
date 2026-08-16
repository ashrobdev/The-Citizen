/**
 * Builds assets/data/questions.json from the committed USCIS source text.
 *
 * Run with:  npm run build:questions
 *
 * CI re-runs this and fails if the committed output differs, so the generated
 * bank can never silently drift from its source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildRequiredTokens,
  buildVariants,
  extractNote,
  noteDeclaresMoreAnswers,
} from '../src/domain/grading/variants';
import type {
  AcceptedAnswer,
  AnswerKind,
  DynamicRole,
  Question,
  QuestionBank,
  Section,
} from '../src/domain/questions/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'data/source/uscis-2025-m1778.txt');
const METADATA = path.join(ROOT, 'data/manual/question-metadata.json');
const OVERRIDES = path.join(ROOT, 'data/manual/answer-overrides.json');
const OUTPUT = path.join(ROOT, 'assets/data/questions.json');

const SECTION_OF: Record<string, Section> = {
  'AMERICAN GOVERNMENT': 'government',
  'AMERICAN HISTORY': 'history',
  'SYMBOLS AND HOLIDAYS': 'symbols',
};

interface Metadata {
  requiredCount: Record<string, number>;
  dynamic: Record<string, { kind: AnswerKind; role: DynamicRole }>;
}

interface Overrides {
  [id: string]: { note: string; extraAnswers: string[] } | undefined;
}

interface RawQuestion {
  id: number;
  section: Section;
  subsection: string;
  prompt: string;
  seniorExempt: boolean;
  answerLines: string[];
}

/** Turns "Freedom of speech" into a slug for a stable AnswerId. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Prose the parser deliberately discarded. Reported so a human can eyeball it. */
const ignoredLines: string[] = [];

function parseSource(text: string): RawQuestion[] {
  const lines = text
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .map((l) => l.replace(/\s+$/, ''));

  const questions: RawQuestion[] = [];
  let section: Section | undefined;
  let subsection = '';
  let current: RawQuestion | undefined;
  // 'prompt' while the question text may still wrap; 'answers' once bullets start.
  let phase: 'prompt' | 'answers' = 'prompt';

  const flush = (): void => {
    if (current) questions.push(current);
    current = undefined;
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) continue;

    if (t in SECTION_OF) {
      flush();
      section = SECTION_OF[t];
      continue;
    }

    const sub = /^([A-C]): (.+)$/.exec(t);
    if (sub) {
      flush();
      subsection = sub[2] ?? '';
      continue;
    }

    const q = /^(\d+)\. (.*)$/.exec(t);
    if (q) {
      flush();
      if (section === undefined) throw new Error(`Question ${q[1]} before any section heading`);
      let prompt = (q[2] ?? '').trim();
      const seniorExempt = prompt.endsWith('*');
      if (seniorExempt) prompt = prompt.replace(/\s*\*$/, '').trim();
      current = {
        id: Number(q[1]),
        section,
        subsection,
        prompt,
        seniorExempt,
        answerLines: [],
      };
      phase = 'prompt';
      continue;
    }

    if (!current) continue;

    if (t.startsWith('• ')) {
      phase = 'answers';
      current.answerLines.push(t.slice(2).trim());
      continue;
    }

    if (phase === 'prompt') {
      // Question text wrapped across lines (Q97).
      current.prompt = `${current.prompt} ${t}`.replace(/\s+/g, ' ').trim();
      const seniorExempt = current.prompt.endsWith('*');
      if (seniorExempt) {
        current.prompt = current.prompt.replace(/\s*\*$/, '').trim();
        current.seniorExempt = true;
      }
      continue;
    }

    // Either a wrapped answer bullet or standalone prose. The distinguishing
    // signal is capitalisation: every genuine continuation in the source starts
    // with a lowercase word (Q113's "of their character", and the bracketed
    // notes on Q23/Q29/Q62), while Q117's footnote "For a complete list of
    // tribes, please visit bia.gov." starts a new sentence.
    //
    // An unclosed "[" also forces continuation, so a note that happened to wrap
    // onto a capitalised word still gets joined.
    const last = current.answerLines[current.answerLines.length - 1];
    const startsLowercase = /^[a-z]/.test(t);
    const unclosedBracket =
      last !== undefined && (last.match(/\[/g)?.length ?? 0) > (last.match(/\]/g)?.length ?? 0);

    if (last !== undefined && (startsLowercase || unclosedBracket)) {
      current.answerLines[current.answerLines.length - 1] = `${last} ${t}`
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      ignoredLines.push(`Q${current.id}: ${t}`);
    }
  }

  flush();
  return questions;
}

function toAcceptedAnswer(questionId: number, display: string, seen: Set<string>): AcceptedAnswer {
  const { note } = extractNote(display);
  let slug = slugify(extractNote(display).matchable);
  if (slug.length === 0) slug = 'answer';
  let unique = slug;
  let n = 2;
  while (seen.has(unique)) unique = `${slug}-${n++}`;
  seen.add(unique);

  const answer: AcceptedAnswer = {
    id: `${questionId}:${unique}`,
    display,
    variants: buildVariants(display),
    requiredTokens: buildRequiredTokens(display),
  };
  if (note !== undefined) answer.note = note;
  return answer;
}

function build(): QuestionBank {
  const sourceText = fs.readFileSync(SOURCE, 'utf8');
  const metadata = JSON.parse(fs.readFileSync(METADATA, 'utf8')) as Metadata;
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) as Overrides;

  const raw = parseSource(sourceText);
  const questions: Question[] = [];

  for (const r of raw) {
    const dyn = metadata.dynamic[String(r.id)];
    const kind: AnswerKind = dyn?.kind ?? 'static';
    const requiredCount = metadata.requiredCount[String(r.id)] ?? 1;
    const override = overrides[String(r.id)];

    const displays = [...r.answerLines];
    if (override) {
      for (const extra of override.extraAnswers) displays.push(extra);
    }

    // Refuse to guess at notes that announce more acceptable answers.
    for (const d of r.answerLines) {
      const { note } = extractNote(d);
      if (noteDeclaresMoreAnswers(note) && kind === 'static' && !override) {
        throw new Error(
          `Q${r.id}: answer note declares further acceptable answers but there is no ` +
            `entry in data/manual/answer-overrides.json.\n  note: ${note}\n` +
            `  Add the extra answers by hand — they must not be machine-parsed.`,
        );
      }
    }

    const seen = new Set<string>();
    const answers =
      kind === 'static' ? displays.map((d) => toAcceptedAnswer(r.id, d, seen)) : [];

    const question: Question = {
      id: r.id,
      section: r.section,
      subsection: r.subsection,
      prompt: r.prompt,
      kind,
      requiredCount,
      answers,
      seniorExempt: r.seniorExempt,
      sourceRaw: r.answerLines.join('\n'),
    };
    if (dyn) question.dynamicRole = dyn.role;

    questions.push(question);
  }

  questions.sort((a, b) => a.id - b.id);

  return {
    source: 'USCIS M-1778 (09/25) — 128 Civics Questions and Answers (2025 version)',
    generatedAt: '2026-08-16',
    questions,
  };
}

function main(): void {
  const bank = build();

  // Fail loudly rather than emitting a subtly wrong bank.
  if (bank.questions.length !== 128) {
    throw new Error(`Expected 128 questions, parsed ${bank.questions.length}`);
  }
  for (let i = 0; i < 128; i++) {
    const q = bank.questions[i];
    if (q?.id !== i + 1) throw new Error(`Question ids are not contiguous at index ${i}`);
    if (q.kind === 'static' && q.answers.length === 0) {
      throw new Error(`Q${q.id} has no answers`);
    }
    for (const a of q.answers) {
      if (a.variants.length === 0) throw new Error(`Q${q.id} answer "${a.display}" has no variants`);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(bank, null, 2)}\n`);

  const senior = bank.questions.filter((q) => q.seniorExempt).length;
  const dynamic = bank.questions.filter((q) => q.kind !== 'static').length;
  const multi = bank.questions.filter((q) => q.requiredCount > 1).length;
  const answers = bank.questions.reduce((n, q) => n + q.answers.length, 0);

  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  questions: ${bank.questions.length}`);
  console.log(`  answers:   ${answers}`);
  console.log(`  senior:    ${senior}`);
  console.log(`  dynamic:   ${dynamic}`);
  console.log(`  multi:     ${multi}`);

  if (ignoredLines.length > 0) {
    console.log(`\n  discarded prose (${ignoredLines.length}) — verify none is an answer:`);
    for (const l of ignoredLines) console.log(`    ${l}`);
  }
}

main();
