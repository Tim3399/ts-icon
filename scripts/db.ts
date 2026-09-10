import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { resolveSqlitePath, sqliteDatasourceUrl } from "./lib/sqlite-path";

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
function argument(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export function checkDatabase(databasePath: string): void {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    if (result.length !== 1 || result[0].integrity_check !== "ok") {
      throw new Error(`SQLite integrity check failed: ${JSON.stringify(result)}`);
    }
    const foreignKeys = db.pragma("foreign_key_check") as unknown[];
    if (foreignKeys.length) throw new Error("SQLite foreign key check failed.");
  } finally {
    db.close();
  }
}

export function migrateDatabase(databasePath: string): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  // Prisma's Windows CLI can fail before migrations if the SQLite file is absent.
  // Exclusive creation also guarantees we never truncate an existing database.
  try {
    fs.closeSync(fs.openSync(databasePath, "wx", 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const cli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: sqliteDatasourceUrl(`file:${databasePath}`) },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Migration failed (${result.status}).`);
  checkDatabase(databasePath);
}

export async function backupDatabase(source: string, destination: string): Promise<void> {
  if (path.resolve(source) === path.resolve(destination))
    throw new Error("Backup target equals source.");
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite backup: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    // SQLite's online backup API includes committed data that is still in WAL.
    await db.backup(destination);
  } finally {
    db.close();
  }
  fs.chmodSync(destination, 0o600);
  checkDatabase(destination);
}

export async function restoreDatabase(source: string, destination: string): Promise<string | null> {
  if (path.resolve(source) === path.resolve(destination))
    throw new Error("Restore source equals target.");
  checkDatabase(source);
  // Never discard journal/WAL files: they may contain uncheckpointed live data.
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (fs.existsSync(destination + suffix)) {
      throw new Error(`Stop both apps cleanly before restore; ${destination + suffix} exists.`);
    }
  }
  if (fs.existsSync(destination)) {
    const lock = new Database(destination, { fileMustExist: true, timeout: 1000 });
    try {
      lock.exec("BEGIN EXCLUSIVE; ROLLBACK;");
    } finally {
      lock.close();
    }
  }
  const staged = `${destination}.restore-${randomUUID()}`;
  await backupDatabase(source, staged);
  const existed = fs.existsSync(destination);
  const ownership = fs.statSync(existed ? destination : path.dirname(destination));
  fs.chmodSync(staged, existed ? ownership.mode & 0o777 : 0o600);
  if (process.platform !== "win32") fs.chownSync(staged, ownership.uid, ownership.gid);
  const previous = fs.existsSync(destination)
    ? `${destination}.before-restore-${timestamp()}`
    : null;
  try {
    if (previous) fs.renameSync(destination, previous);
    try {
      fs.renameSync(staged, destination);
    } catch (error) {
      if (previous) fs.renameSync(previous, destination);
      throw error;
    }
  } finally {
    if (fs.existsSync(staged)) fs.unlinkSync(staged);
  }
  checkDatabase(destination);
  return previous;
}

async function main(): Promise<void> {
  const command = args[0];
  const rawUrl = argument("--database") || process.env.DATABASE_URL || "file:./dev.db";
  const databasePath = resolveSqlitePath(rawUrl, projectRoot);
  console.log(`Database: ${databasePath}`);
  if (command === "migrate") {
    migrateDatabase(databasePath);
  } else if (command === "check") {
    checkDatabase(databasePath);
    console.log("SQLite integrity and foreign keys: ok");
  } else if (command === "backup") {
    const output = path.resolve(argument("--output") || `backups/ts-icon-${timestamp()}.db`);
    await backupDatabase(databasePath, output);
    console.log(`Verified backup: ${output}`);
  } else if (command === "restore") {
    const source = argument("--source");
    if (!source) throw new Error("restore requires --source <backup.db>.");
    const resolvedSource = path.resolve(source);
    checkDatabase(resolvedSource);
    console.log(`Restore source: ${resolvedSource}`);
    if (!args.includes("--apply")) {
      console.log(
        "Dry run: backup is valid; database unchanged. Stop both apps, then use --apply --offline.",
      );
      return;
    }
    if (!args.includes("--offline"))
      throw new Error("Restore requires --offline after stopping both apps.");
    const previous = await restoreDatabase(resolvedSource, databasePath);
    console.log(`Restore verified. Previous database retained at: ${previous || "(new target)"}`);
  } else if (command === "dry-run") {
    const temporaryRoot = path.join(projectRoot, ".tmp");
    fs.mkdirSync(temporaryRoot, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(temporaryRoot, "migration-check-"));
    const resolved = path.resolve(temporary);
    if (!resolved.startsWith(`${path.resolve(temporaryRoot)}${path.sep}migration-check-`)) {
      throw new Error("Unexpected temporary directory; refusing cleanup.");
    }
    const copy = path.join(temporary, "database.db");
    try {
      if (fs.existsSync(databasePath)) await backupDatabase(databasePath, copy);
      migrateDatabase(copy);
      console.log("Migrations and integrity verified against a disposable copy; source unchanged.");
    } finally {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  } else {
    throw new Error("Use migrate, check, backup, restore or dry-run. See docs/operations.md.");
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
