import { createMemoryRepositories } from '../data/memory/repositories';
import type { KvRepository } from '../data/repositories';

import { BUNDLED_OFFICIALS, OfficialsUpdater } from './officialsUpdater';

const bump = (dataVersion: string): string =>
  JSON.stringify({ ...BUNDLED_OFFICIALS, dataVersion });

function mockFetch(handler: () => Promise<Response> | Response): void {
  (globalThis as { fetch: unknown }).fetch = handler as unknown as typeof fetch;
}

const ok = (body: string): Response =>
  ({ ok: true, status: 200, text: async () => body }) as Response;

describe('OfficialsUpdater', () => {
  let kv: KvRepository;
  let updater: OfficialsUpdater;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    kv = createMemoryRepositories().kv;
    updater = new OfficialsUpdater(kv);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('uses bundled data before anything is cached', async () => {
    expect((await updater.current()).dataVersion).toBe(BUNDLED_OFFICIALS.dataVersion);
  });

  it('accepts genuinely newer data', async () => {
    mockFetch(() => ok(bump('2099-01-01')));
    const r = await updater.refreshNow();
    expect(r.updated).toBe(true);
    expect((await updater.current()).dataVersion).toBe('2099-01-01');
  });

  it('never downgrades to older data', async () => {
    mockFetch(() => ok(bump('1999-01-01')));
    const r = await updater.refreshNow();
    expect(r.updated).toBe(false);
    expect((await updater.current()).dataVersion).toBe(BUNDLED_OFFICIALS.dataVersion);
  });

  it('ignores identical data', async () => {
    mockFetch(() => ok(bump(BUNDLED_OFFICIALS.dataVersion)));
    expect((await updater.refreshNow()).reason).toBe('already up to date');
  });

  it('rejects a payload that fails validation, keeping what works', async () => {
    // A half-written file, or a source that changed shape. Either way it must
    // never replace data someone is studying from.
    mockFetch(() => ok(JSON.stringify({ schemaVersion: 1, dataVersion: '2099-01-01' })));
    const r = await updater.refreshNow();
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('rejected');
    expect((await updater.current()).dataVersion).toBe(BUNDLED_OFFICIALS.dataVersion);
  });

  it('rejects malformed JSON', async () => {
    mockFetch(() => ok('{not json'));
    expect((await updater.refreshNow()).updated).toBe(false);
  });

  it('ignores a schema newer than this build understands', async () => {
    const future = JSON.stringify({
      ...BUNDLED_OFFICIALS,
      schemaVersion: 99,
      dataVersion: '2099-01-01',
    });
    mockFetch(() => ok(future));
    const r = await updater.refreshNow();
    expect(r.updated).toBe(false);
    // Validation catches the version before the app has to reason about shape.
    expect(r.reason).toMatch(/rejected|newer app/);
  });

  it('survives the network being unreachable', async () => {
    mockFetch(() => {
      throw new Error('offline');
    });
    const r = await updater.refreshNow();
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('could not reach');
    expect((await updater.current()).dataVersion).toBe(BUNDLED_OFFICIALS.dataVersion);
  });

  it('survives an error response', async () => {
    mockFetch(() => ({ ok: false, status: 404, text: async () => '' }) as Response);
    expect((await updater.refreshNow()).reason).toContain('404');
  });

  it('falls back when the cache is corrupt, and clears it', async () => {
    await kv.set('officials.cached', '{{{ broken');
    expect((await updater.current()).dataVersion).toBe(BUNDLED_OFFICIALS.dataVersion);
    expect(await kv.get('officials.cached')).toBeUndefined();
  });
});

describe('refresh throttling', () => {
  it('checks at most once a day', async () => {
    const kv = createMemoryRepositories().kv;
    const updater = new OfficialsUpdater(kv);
    let calls = 0;
    (globalThis as { fetch: unknown }).fetch = (async () => {
      calls++;
      return ok(bump(BUNDLED_OFFICIALS.dataVersion));
    }) as unknown as typeof fetch;

    const monday = new Date('2026-08-17T09:00:00Z');
    await updater.refreshIfDue(monday);
    await updater.refreshIfDue(new Date('2026-08-17T15:00:00Z'));
    expect(calls).toBe(1);

    await updater.refreshIfDue(new Date('2026-08-18T10:00:00Z'));
    expect(calls).toBe(2);
  });
});
