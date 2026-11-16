const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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

// Mirrors agent-team 0.4.2 set-version: every versionFiles entry is computed from the first reading of its
// file (LF text), then the results are written in sequence, so a second entry for one file overwrites the first.
function versionEntryText(entry, text, next) {
  if (entry.type === "regex") {
    const hits = [...text.matchAll(new RegExp(entry.pattern, "dgm"))];
    assert.equal(hits.length, 1, `${entry.path} pattern matches exactly once`);
    const [start, end] = hits[0].indices[1];
    return text.slice(0, start) + next + text.slice(end);
  }
  assert.equal(entry.type, "json");
  assert.equal(entry.key, "version");
  const old = JSON.parse(text).version;
  return text.replace(
    new RegExp(`("version"\\s*:\\s*)"${old.replace(/\./g, "\\.")}"`),
    `$1"${next}"`,
  );
}

function applyVersionFiles(dir, entries, next) {
  const computed = entries.map((entry) => {
    const text = fs.readFileSync(path.join(dir, entry.path), "utf8");
    return { entry, text: versionEntryText(entry, text, next) };
  });
  for (const { entry, text } of computed) fs.writeFileSync(path.join(dir, entry.path), text);
}

test("set-version raises all six version fields in both manifests and both lockfiles", () => {
  const root = path.join(__dirname, "..");
  const config = JSON.parse(fs.readFileSync(path.join(root, "team", "team.config.json"), "utf8"));
  const files = [
    "package.json",
    "package-lock.json",
    "webapp-banner-tool/package.json",
    "webapp-banner-tool/package-lock.json",
  ];
  const next = "99.0.0";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-icon-version-"));
  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(dir, file));
    }
    applyVersionFiles(dir, config.release.versionFiles, next);
    // npm sets the lockfile top-level version from the manifest, as the configured verify commands do
    const syncs = config.release.verify.filter((cmd) =>
      cmd.some((arg) => arg.includes("--package-lock-only")),
    );
    assert.equal(syncs.length, 2, "one lockfile sync per package");
    const quote = (arg) => (/^[\w@./:=,+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`);
    const before = Object.fromEntries(
      files.map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8")]),
    );
    for (const cmd of syncs) {
      const line = cmd.map(quote).join(" ");
      const result = spawnSync(line, { cwd: dir, shell: true, encoding: "utf8" });
      assert.equal(result.status, 0, `${line}: ${result.stdout}${result.stderr}`);
    }
    // the sync must touch nothing but the lockfile top-level version
    for (const file of files) {
      const after = fs.readFileSync(path.join(dir, file), "utf8");
      if (!file.endsWith("package-lock.json")) {
        assert.equal(after, before[file], `${file} is unchanged by the lockfile syncs`);
        continue;
      }
      const lock = JSON.parse(before[file]);
      lock.version = next;
      assert.deepEqual(JSON.parse(after), lock, `${file} changes only its top-level version`);
    }
    const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const fields = [
      read("package.json").version,
      read("package-lock.json").version,
      read("package-lock.json").packages[""].version,
      read("webapp-banner-tool/package.json").version,
      read("webapp-banner-tool/package-lock.json").version,
      read("webapp-banner-tool/package-lock.json").packages[""].version,
    ];
    assert.deepEqual(fields, Array(6).fill(next));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("setup skips the TeamSpeak credentials only in mock mode", () => {
  const { checkEnv } = require("./bootstrap.cjs");
  const base = { PUBLIC_BASE_URL: "http://localhost:3000", AUTH_DISABLED: "true" };
  assert.doesNotThrow(() =>
    checkEnv({ ...base, TS_MOCK_MODE: "true", TS_USERNAME: "", TS_USERPASSWORD: "" }),
  );
  assert.throws(
    () => checkEnv({ ...base, TS_USERPASSWORD: "x" }),
    /Set TS_USERNAME in \.env, then run setup again\./,
  );
  assert.throws(() => checkEnv({ ...base, TS_MOCK_MODE: "false" }), /Set TS_USERNAME in \.env/);
  assert.throws(
    () => checkEnv({ AUTH_DISABLED: "true", TS_MOCK_MODE: "true" }),
    /Set PUBLIC_BASE_URL in \.env/,
  );
});
