import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

// Integration tests for `ImagesService` against a real, freshly-migrated
// SQLite database. Unlike every other spec in this repo, Prisma is not
// mocked here at all — this file exercises the real `PrismaService` (real
// `@prisma/adapter-better-sqlite3` adapter, real SQLite file, real
// migrations applied via the Prisma CLI) end to end.
//
// Two hazards this file is deliberately structured around:
//
// 1. `config.ts`'s `DATABASE_URL` (and `PrismaService`'s adapter
//    construction, which reads it) are evaluated once, at module-load time,
//    from `process.env.DATABASE_URL`. Setting the env var in a `beforeAll`
//    is too late if anything has already imported those modules — so this
//    file never statically imports `config.ts`, `prisma.service.ts`, or
//    `images.service.ts`. They're loaded dynamically via `import()`, only
//    after `process.env.DATABASE_URL` is pointed at this test's temp
//    database and `jest.resetModules()` has cleared any cached module
//    state, so the fresh copies pick up the right value. (Jest already
//    gives every test file its own module registry, so nothing here is
//    reachable from other spec files in the same run — `resetModules()`
//    is belt-and-braces, not load-bearing, and `DATABASE_URL` is restored
//    in `afterAll` regardless.)
// 2. `npx prisma migrate deploy` parses `DATABASE_URL` itself (independent
//    of `PrismaService`'s own adapter, which resolves a relative path
//    manually) and rejects a relative `file:./x` value with
//    `P1013: The provided database string is invalid` — it needs an
//    absolute path. The temp database path is built from `os.tmpdir()`, and
//    converted to forward slashes before being embedded in the `file:` URL
//    (a Windows absolute path like `file:C:\Users\...` isn't a valid `file:`
//    URL; `file:C:/Users/...` is, and works identically on POSIX).

const REPO_ROOT = path.resolve(__dirname, '..', '..');

type PrismaServiceType = import('../prisma/prisma.service').PrismaService;
type ImagesServiceType = import('./images.service').ImagesService;

describe('ImagesService (integration: real SQLite + real Prisma migrations)', () => {
  let dbPath: string;
  let prisma: PrismaServiceType;
  let service: ImagesServiceType;

  beforeAll(async () => {
    const unique = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    dbPath = path.join(os.tmpdir(), `ts-icon-images-integration-${unique}.db`);
    const dbUrl = `file:${dbPath.split(path.sep).join('/')}`;

    // Run the real migration(s) from prisma/migrations against the temp
    // file via the actual Prisma CLI, not a hand-rolled schema push.
    execSync('npx prisma migrate deploy', {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });

    // Don't just trust the zero exit code above — open the resulting file
    // directly and confirm the expected table actually exists.
    const verifyDb = new Database(dbPath, { readonly: true });
    try {
      const tables = verifyDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ChannelImage'",
        )
        .all();
      expect(tables).toHaveLength(1);
    } finally {
      verifyDb.close();
    }

    // Only now, with the migration confirmed applied, point the process env
    // at the temp DB and force a fresh module evaluation of `config.ts` /
    // `prisma.service.ts` / `images.service.ts` so their module-level
    // `DATABASE_URL` constant reads this test's value.
    process.env.DATABASE_URL = dbUrl;
    jest.resetModules();

    const { PrismaService } = await import('../prisma/prisma.service');
    const { ImagesService } = await import('./images.service');

    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new ImagesService(prisma);
  }, 30000);

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    delete process.env.DATABASE_URL;

    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const candidate = dbPath + suffix;
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    }
  });

  it('saves a new image and fetches it back with the right buffer and mimeType', async () => {
    const buffer = Buffer.from('fake-png-bytes-one');
    await service.saveImage('news', buffer, 'image/png');

    const fetched = await service.getImage('news');

    expect(fetched).not.toBeNull();
    expect(fetched?.mimeType).toBe('image/png');
    expect(Buffer.compare(fetched?.image ?? Buffer.alloc(0), buffer)).toBe(0);
  });

  it('upserts on save for the same channel name instead of creating a duplicate row', async () => {
    const first = Buffer.from('first-version');
    const second = Buffer.from('second-version-is-longer');

    await service.saveImage('upsert-channel', first, 'image/png');
    await service.saveImage('upsert-channel', second, 'image/jpeg');

    const fetched = await service.getImage('upsert-channel');
    expect(fetched?.mimeType).toBe('image/jpeg');
    expect(Buffer.compare(fetched?.image ?? Buffer.alloc(0), second)).toBe(0);

    const options = await service.listOptions();
    const matches = options.filter((o) => o.channelName === 'upsert-channel');
    expect(matches).toHaveLength(1);
  });

  it('returns null for a channel that was never saved', async () => {
    const fetched = await service.getImage('never-saved-channel');
    expect(fetched).toBeNull();
  });

  it('listOptions reflects multiple distinct saved channels correctly', async () => {
    await service.saveImage('channel-a', Buffer.from('a'), 'image/png');
    await service.saveImage('channel-b', Buffer.from('b'), 'image/webp');

    const options = await service.listOptions();
    const names = options.map((o) => o.channelName);

    expect(names).toEqual(expect.arrayContaining(['channel-a', 'channel-b']));
    // Each channel appears exactly once, regardless of how many other rows
    // earlier tests in this file may have already created.
    expect(names.filter((n) => n === 'channel-a')).toHaveLength(1);
    expect(names.filter((n) => n === 'channel-b')).toHaveLength(1);

    const channelA = options.find((o) => o.channelName === 'channel-a');
    const channelB = options.find((o) => o.channelName === 'channel-b');
    expect(channelA?.mimeType).toBe('image/png');
    expect(channelB?.mimeType).toBe('image/webp');
  });

  it('saves a new row with a channelId when one is given', async () => {
    await service.saveImage(
      'with-id',
      Buffer.from('v1'),
      'image/png',
      'ts-cid-1',
    );

    const row = await service.findByChannelId('ts-cid-1');
    expect(row).toEqual({ channelName: 'with-id' });

    const fetched = await service.getImage('with-id');
    expect(fetched?.mimeType).toBe('image/png');
  });

  it('saving again with the same channelId but a changed channelName updates the same row (rename), not a second one', async () => {
    await service.saveImage(
      'old-name',
      Buffer.from('v1'),
      'image/png',
      'ts-cid-rename',
    );
    await service.saveImage(
      'new-name',
      Buffer.from('v2'),
      'image/jpeg',
      'ts-cid-rename',
    );

    // The row now lives under the new channelName; the old one is gone.
    const renamed = await service.getImage('new-name');
    expect(renamed?.mimeType).toBe('image/jpeg');
    expect(
      Buffer.compare(renamed?.image ?? Buffer.alloc(0), Buffer.from('v2')),
    ).toBe(0);

    const stale = await service.getImage('old-name');
    expect(stale).toBeNull();

    const byId = await service.findByChannelId('ts-cid-rename');
    expect(byId).toEqual({ channelName: 'new-name' });

    // Exactly one row exists for this channelId across the whole table, not
    // one row per name it has ever been saved under.
    const options = await service.listOptions();
    const matchingNames = options.filter(
      (o) => o.channelName === 'old-name' || o.channelName === 'new-name',
    );
    expect(matchingNames).toHaveLength(1);
  });

  it('channelNameInUse reflects rows saved without a channelId too', async () => {
    expect(await service.channelNameInUse('not-yet-saved')).toBe(false);
    await service.saveImage('now-saved', Buffer.from('x'), 'image/png');
    expect(await service.channelNameInUse('now-saved')).toBe(true);
  });

  it('persists size, content hash, createdAt, updatedAt, and lastEditorSubject on save', async () => {
    const buffer = Buffer.from('metadata-test-bytes');
    const before = Date.now();

    await service.saveImage(
      'metadata-channel',
      buffer,
      'image/png',
      undefined,
      'editor-sub-123',
    );

    const row = await prisma.channelImage.findUnique({
      where: { channelName: 'metadata-channel' },
    });
    expect(row).not.toBeNull();
    expect(row?.size).toBe(buffer.length);
    expect(row?.contentHash).toBe(
      crypto.createHash('sha256').update(buffer).digest('hex'),
    );
    expect(row?.lastEditorSubject).toBe('editor-sub-123');
    // SQLite's DATETIME columns only have second-level precision, so allow
    // a little slack rather than asserting an exact millisecond match.
    expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 2000);
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(before - 2000);

    // The service's own getImage() surfaces the same hash it just persisted.
    const fetched = await service.getImage('metadata-channel');
    expect(fetched?.contentHash).toBe(row?.contentHash);
  });

  it('updates updatedAt on a re-save while createdAt stays the same', async () => {
    await service.saveImage(
      'resave-metadata-channel',
      Buffer.from('v1'),
      'image/png',
    );
    const first = await prisma.channelImage.findUnique({
      where: { channelName: 'resave-metadata-channel' },
    });

    // SQLite DATETIME has only second-level resolution, so without a real
    // gap a fast re-save could land in the same second and look unchanged.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await service.saveImage(
      'resave-metadata-channel',
      Buffer.from('v2-is-longer'),
      'image/png',
    );
    const second = await prisma.channelImage.findUnique({
      where: { channelName: 'resave-metadata-channel' },
    });

    expect(second?.createdAt.getTime()).toBe(first?.createdAt.getTime());
    expect(second!.updatedAt.getTime()).toBeGreaterThan(
      first!.updatedAt.getTime(),
    );
    // The content hash/size are recomputed from the new bytes too, not left
    // stale from the first save.
    expect(second?.size).toBe(Buffer.from('v2-is-longer').length);
    expect(second?.contentHash).not.toBe(first?.contentHash);
  }, 10000);

  it('leaves an existing lastEditorSubject untouched when a later save omits it', async () => {
    await service.saveImage(
      'editor-preserved-channel',
      Buffer.from('v1'),
      'image/png',
      undefined,
      'editor-sub-original',
    );
    await service.saveImage(
      'editor-preserved-channel',
      Buffer.from('v2'),
      'image/png',
    );

    const row = await prisma.channelImage.findUnique({
      where: { channelName: 'editor-preserved-channel' },
    });
    expect(row?.lastEditorSubject).toBe('editor-sub-original');
  });

  it('computes a content hash on the fly for a legacy row with the empty placeholder hash, without persisting it', async () => {
    // Simulates a row backfilled by the migration itself (size known,
    // content hash left as '' since SQLite has no builtin SHA-256).
    const buffer = Buffer.from('legacy-pre-migration-bytes');
    await prisma.channelImage.create({
      data: {
        channelName: 'legacy-hash-channel',
        image: new Uint8Array(buffer),
        mimeType: 'image/png',
        size: buffer.length,
        contentHash: '',
      },
    });

    const expectedHash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
    const fetched = await service.getImage('legacy-hash-channel');
    expect(fetched?.contentHash).toBe(expectedHash);

    // The DB row itself is left alone — only an actual save corrects it.
    const rowAfterRead = await prisma.channelImage.findUnique({
      where: { channelName: 'legacy-hash-channel' },
    });
    expect(rowAfterRead?.contentHash).toBe('');
  });

  it('deletes an existing image and reports it was deleted', async () => {
    await service.saveImage(
      'delete-me',
      Buffer.from('bytes-to-delete'),
      'image/png',
    );

    await expect(service.deleteImage('delete-me')).resolves.toBe(true);
    await expect(service.getImage('delete-me')).resolves.toBeNull();
  });

  it('reports false when deleting a channel with no stored image', async () => {
    await expect(service.deleteImage('never-existed')).resolves.toBe(false);
  });
});
