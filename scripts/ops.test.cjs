const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const Database = require("better-sqlite3");
const { resolveSqlitePath } = require("./lib/sqlite-path.ts");
const { planBackfill } = require("./lib/backfill-plan.ts");
const { migrateDatabase, backupDatabase, restoreDatabase, checkDatabase } = require("./db.ts");
const { publishVersionTag } = require("./release-version.cjs");
const { promotePair } = require("./release-images.cjs");

test("paired release checks both candidates before promotion and can retry a partial promotion", () => {
  const candidates = ["backend", "frontend"].map((name) => ({
    name,
    repository: name,
    reference: `${name}:sha-a`,
    tags: [`${name}:latest`],
  }));
  const calls = [];
  assert.throws(() =>
    promotePair(
      candidates,
      (reference) => (reference.startsWith("backend") ? "digest" : null),
      () => {},
      (tag) => calls.push(tag),
    ),
  );
  assert.deepEqual(calls, []);
  assert.throws(() =>
    promotePair(
      candidates,
      () => "digest",
      () => {},
      (tag) => {
        calls.push(tag);
        if (tag.startsWith("frontend")) throw new Error("Registry unavailable");
      },
    ),
  );
  const repeated = [];
  promotePair(
    candidates,
    () => "digest",
    () => {},
    (tag) => repeated.push(tag),
  );
  assert.deepEqual(repeated, ["backend:latest", "frontend:latest"]);
});

test("a mislabelled image blocks promotion and recording of the whole pair", () => {
  const candidates = ["backend", "frontend"].map((name) => ({
    name,
    repository: name,
    reference: `${name}:sha-a`,
    tags: [`${name}:latest`],
  }));
  const promoted = [];
  const recorded = [];
  // The frontend carries the wrong version label, as published 0.10.0 images
  // did. Neither alias may move, and no manifest may claim the pair shipped.
  assert.throws(
    () =>
      promotePair(
        candidates,
        () => "digest",
        (images) => recorded.push(images),
        (tag) => promoted.push(tag),
        (image) => {
          if (image.name === "frontend") throw new Error("frontend version is latest");
        },
      ),
    /frontend version is latest/,
  );
  assert.deepEqual(promoted, []);
  assert.deepEqual(recorded, []);
});

test("release retry repairs both images without moving an older version tag", () => {
  assert.equal(publishVersionTag("commit-a", null), true);
  assert.equal(publishVersionTag("commit-a", "commit-a"), true);
  assert.equal(publishVersionTag("commit-b", "commit-a"), false);
});

test("SQLite paths are identical for app, CLI, absolute file URLs and relative config", () => {
  const expected = path.resolve("prisma/dev.db");
  assert.equal(resolveSqlitePath("file:./dev.db"), expected);
  assert.equal(resolveSqlitePath(`file:${expected}`), expected);
  assert.equal(resolveSqlitePath(pathToFileURL(expected).href), expected);
  assert.throws(() => resolveSqlitePath("postgres://example/db"));
});

test("backfill refuses ambiguous names, aliases and already assigned CIDs", () => {
  const rows = [
    { id: "a", channelName: "duplicate", channelId: null, aliases: [] },
    { id: "b", channelName: "other", channelId: "2", aliases: [{ alias: "duplicate" }] },
    { id: "c", channelName: "new", channelId: null, aliases: [] },
    { id: "d", channelName: "already", channelId: null, aliases: [] },
  ];
  const result = planBackfill(
    rows,
    [
      { cid: "1", name: "duplicate" },
      { cid: "2", name: "already" },
      { cid: "3", name: "new" },
    ],
    (name) => name.toLowerCase(),
  );
  assert.deepEqual(result.updates, [{ id: "c", channelName: "new", channelId: "3" }]);
  assert.equal(result.conflicts.length, 2);
});

test("fresh migrations, SQLite backup and restore preserve real rows", {
  timeout: 30000,
}, async () => {
  const temporaryRoot = path.resolve(".tmp");
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "ops-test-"));
  const target = path.join(directory, "fresh.db");
  const backup = path.join(directory, "snapshot.db");
  try {
    migrateDatabase(target);
    let db = new Database(target);
    db.exec(
      "CREATE TABLE AuditRestoreProbe (value TEXT NOT NULL); INSERT INTO AuditRestoreProbe VALUES ('original');",
    );
    db.close();
    await backupDatabase(target, backup);
    db = new Database(target);
    db.exec("UPDATE AuditRestoreProbe SET value = 'changed';");
    db.close();
    const previous = await restoreDatabase(backup, target);
    assert.ok(previous && fs.existsSync(previous));
    checkDatabase(target);
    db = new Database(target, { readonly: true });
    assert.equal(db.prepare("SELECT value FROM AuditRestoreProbe").get().value, "original");
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ChannelImage'").get());
    db.close();
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(`${temporaryRoot}${path.sep}ops-test-`));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
