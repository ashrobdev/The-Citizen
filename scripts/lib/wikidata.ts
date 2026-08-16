/**
 * Officeholders that congress-legislators does not cover: the 50 state
 * governors, the Speaker of the House and the Chief Justice.
 *
 * Wikidata is crowd-maintained, which is both why it has this data at all and
 * why it must not be trusted blindly. Two guards:
 *
 *  - statements are frequently left open when someone leaves office, so where
 *    a jurisdiction has several "current" officeholders we take the one with
 *    the latest start date. Six states had stale statements when this was
 *    written.
 *  - nothing reaches the app without a human seeing it. The refresh workflow
 *    opens a pull request rather than pushing, precisely because this source
 *    can be edited by anyone.
 *
 * Anything that cannot be resolved cleanly is returned empty, which keeps the
 * question self-attested rather than graded against a guess.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';

// Wikidata asks for a descriptive agent; an anonymous one may be throttled.
const USER_AGENT = 'TheCitizen/0.1 (civics study app; https://github.com/ashrobdev/The-Citizen)';

/** Q-ids verified via the entity search API rather than recalled. */
const SPEAKER = 'Q912994'; // Speaker of the United States House of Representatives
const CHIEF_JUSTICE = 'Q11147'; // Chief Justice of the United States
const US_STATE = 'Q35657'; // state of the United States

interface Binding {
  [key: string]: { value: string } | undefined;
}

async function sparql(query: string): Promise<Binding[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return json.results?.bindings ?? [];
}

/**
 * Collapses duplicate "current" officeholders to the one that started most
 * recently. An entry with no start date loses to one that has one.
 */
function latestPerKey(
  rows: Binding[],
  keyField: string,
  nameField: string,
  startField = 'start',
): Map<string, string> {
  const best = new Map<string, { name: string; start: string }>();

  for (const row of rows) {
    const key = row[keyField]?.value;
    const name = row[nameField]?.value;
    if (key === undefined || name === undefined || name.trim().length < 3) continue;
    // Wikidata sometimes yields a bare Q-id as a label when none exists.
    if (/^Q\d+$/.test(name)) continue;

    const start = row[startField]?.value ?? '';
    const current = best.get(key);
    if (current === undefined || start > current.start) best.set(key, { name, start });
  }

  return new Map([...best].map(([k, v]) => [k, v.name]));
}

/** Current governor of each U.S. state, keyed by state name. */
export async function fetchGovernors(): Promise<Map<string, string>> {
  const rows = await sparql(`
    SELECT ?stateLabel ?govLabel ?start WHERE {
      ?state wdt:P31 wd:${US_STATE} .
      ?state p:P6 ?st .
      ?st ps:P6 ?gov .
      FILTER NOT EXISTS { ?st pq:P582 ?end }
      OPTIONAL { ?st pq:P580 ?start }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `);
  return latestPerKey(rows, 'stateLabel', 'govLabel');
}

export interface FederalRoles {
  speakerOfTheHouse: string | undefined;
  chiefJustice: string | undefined;
}

/** Current Speaker and Chief Justice. */
export async function fetchFederalRoles(): Promise<FederalRoles> {
  const rows = await sparql(`
    SELECT ?role ?whoLabel ?start WHERE {
      VALUES ?role { wd:${SPEAKER} wd:${CHIEF_JUSTICE} }
      ?who p:P39 ?st . ?st ps:P39 ?role .
      FILTER NOT EXISTS { ?st pq:P582 ?end }
      OPTIONAL { ?st pq:P580 ?start }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `);

  const byRole = latestPerKey(rows, 'role', 'whoLabel');
  const find = (qid: string): string | undefined => {
    for (const [uri, name] of byRole) if (uri.endsWith(`/${qid}`)) return name;
    return undefined;
  };

  return { speakerOfTheHouse: find(SPEAKER), chiefJustice: find(CHIEF_JUSTICE) };
}

/**
 * Accepted spellings of a person's name.
 *
 * Mirrors the congress-legislators handling: full name plus surname alone,
 * because USCIS officers accept a surname. Suffixes are stripped so "Jr." does
 * not become the thing the user has to say.
 */
export function nameVariants(full: string): string[] {
  const cleaned = full.replace(/\s+/g, ' ').trim();
  const withoutSuffix = cleaned.replace(/,?\s+(Jr\.?|Sr\.?|I{1,3}|IV)$/i, '').trim();
  const parts = withoutSuffix.split(' ').filter((p) => p.length > 0);
  const surname = parts.at(-1);

  const out = new Set<string>([cleaned, withoutSuffix]);
  if (surname !== undefined && surname.length > 2) out.add(surname);
  if (parts.length > 2) {
    const first = parts[0];
    if (first !== undefined && surname !== undefined) out.add(`${first} ${surname}`);
  }

  return [...out].filter((s) => s.length > 0);
}
