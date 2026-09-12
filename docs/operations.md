# Operation, recovery and release

## Configuration boundaries

Keep real values in git-ignored `.env` files. `.env.example` is for native development; `.env.docker.example` is for Compose. ServerQuery transport is explicitly `raw` or `ssh`; invalid ports, protocols and URLs fail startup. Use a dedicated ServerQuery account with the permissions needed for channel editing.

Production requires HTTPS OIDC and public image URLs. The TLS reverse proxy is operator-managed; the included nginx frontend listens on HTTP port 8080 inside Docker and is bound to host loopback port 8088 by default. Expose that port through your HTTPS proxy, register its origin/redirect URLs in Keycloak, and set `PUBLIC_BASE_URL` to the same externally reachable HTTPS origin.

`TRUSTED_PROXIES` is a comma-separated list of exact proxy IPs or CIDRs. Native direct access leaves it empty. Compose defaults to its frontend container's fixed IP, `172.30.20.10`. An additional external proxy must strip spoofed forwarding headers and forward the real client address; include that proxy's actual address in the backend trust chain as well. Never set a universal CIDR to make forwarding work. Direct backend traffic must not bypass the intended trusted edge.

The frontend edge returns 404 for `/metrics` and `/admin-api/metrics`. Scrape the backend from an explicitly permitted internal path, with the required admin authentication where applicable. `/health/live` indicates process response; `/health/ready` additionally verifies required database tables/columns. It intentionally does not call TeamSpeak on every probe.

## Backup

Native:

```sh
npm run db:backup -- --output backups/before-update.db
```

This uses SQLite's online backup API, including committed WAL data. Existing backup files are never overwritten. The result is checked with SQLite integrity and foreign-key checks. Copy verified backups to independent storage; keeping them only beside the live database does not protect against disk/host loss. Set retention according to your recovery needs and periodically perform the restore drill below.

Compose, while the applications are running:

```sh
docker compose run --rm --no-deps migrate npm run db:backup -- --output /data/before-update.db
```

This stores the backup in the data volume. To copy it out without manipulating the live DB:

```sh
docker compose create migrate
docker compose cp migrate:/data/before-update.db ./backups/before-update.db
```

Create the local `backups` directory first. The migration tool service overrides its normal command in these maintenance invocations; they do not trigger migration or application startup.

## Update and migration rehearsal

First build the new images, take a verified backup, then stop application writers before schema changes:

```sh
docker compose build
docker compose run --rm --no-deps migrate npm run db:backup -- --output /data/before-update.db
docker compose run --rm --no-deps migrate npm run db:dry-run
docker compose stop frontend local public
docker compose run --build --rm --no-deps migrate
docker compose up --build --wait
```

Use a new backup filename for each update. `--build` guarantees the migrator contains the checkout's current migrations. The migration service also runs as a prerequisite of `up`, so a fresh volume cannot be reported as application-ready without applying its schema. If migration or readiness fails, inspect logs and retain the backup; do not keep retrying writes against an uncertain schema.

For native operation, use `db:backup`, `db:dry-run`, stop the two APIs, then `db:migrate` and restart the newly built applications. `db:dry-run` operates only on a temporary copy and never modifies the source. Windows first-use migrations create the SQLite file with exclusive creation before invoking Prisma, without truncating an existing file.

## Restore and rollback

Stop **both** API processes before replacing a database. Frontend shutdown avoids users submitting changes during the maintenance window. Validation is the default:

```sh
npm run db:restore -- --source backups/before-update.db
npm run db:restore -- --source backups/before-update.db --apply --offline
```

For Compose, use a source path already present in the shared volume:

```sh
docker compose stop frontend local public
docker compose run --rm --no-deps migrate npm run db:restore -- --source /data/before-update.db --apply --offline
```

Restore refuses pending SQLite sidecars rather than discarding WAL/journal data. After a clean stop, inspect any remaining sidecars with SQLite tooling before proceeding. A lock check detects existing writers; `--offline` is your explicit assertion that the applications remain stopped throughout replacement.

The source is integrity-checked, restored via a staging file, and checked again. An existing target is retained as `*.before-restore-<timestamp>` and its permissions and owner are preserved. For a new database, the parent directory supplies the owner; the Compose data volume must therefore already belong to the application user (UID/GID 1000), as configured by the migration service. If replacement fails, the tool attempts to put the original target back. For an application rollback, restore the matching backup **and use the matching older backend/frontend images**. Starting newer code may legitimately reapply newer migrations.

The `test:ops` suite rehearses fresh migration, backup, changed rows and restoration in a disposable directory. The container smoke repeats migration/backup/restore on an isolated named volume and confirms that the restored PNG remains accessible through nginx. Neither test accesses an operator's database.

## Legacy channel identity

After applying the channel-identity migration, `npm run backfill:channel-ids` reads current TeamSpeak channels and prints a plan. It requires the new image-ID/alias schema; for a rehearsal, restore the backup to a separate test database and migrate that copy first. It does not update rows by default. Ambiguous normalized names, ambiguous aliases and already-owned CIDs are reported as conflicts. Unmatched rows remain intact.

After reviewing the plan, `npm run backfill:channel-ids -- --apply` creates a verified backup and updates only unambiguous rows by internal image ID. Run this in a maintenance window so channel changes/uploads cannot race the assignment. Existing channel IDs are not reassigned. Resolve conflicts manually using the CID-based image workflow; never select an arbitrary duplicate name just to finish a migration.

## Paired releases

GitHub Actions requires `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM` and `VITE_KEYCLOAK_CLIENT_ID` repository variables. Until all three are configured, CI runs every check, records a configuration notice in the job summary and skips image publication. After configuring them, push or rerun the workflow. Nonempty but invalid settings fail release validation before tagging or publishing. Optional role variables must match the backend roles. The release frontend uses same-origin API paths. These variables are public browser configuration, not secrets. Changing them after a candidate has been published requires a new build/commit; existing SHA candidates are reused on retries.

Release order:

1. Windows/Linux app checks, browser workflows and real container smoke must pass.
2. Validate production frontend configuration before any publication.
3. Reserve the package version for the exact commit. An existing tag at this commit is a retry, while a version belonging to an older commit is never moved.
4. Build/push both SHA candidates, reusing candidates already published by a partial attempt.
5. Record both immutable image digests in `release-images.json`, then promote aliases only after both candidates exist.

Registry tag promotion across two images is not atomic. Deploy the backend/frontend digest pair from a single **successful** release artifact; this is the coherent deployment unit. `latest`/`main` tags are convenience aliases and may temporarily differ if a promotion fails. Rerun the failed release to repair aliases and finish the pair. No workflow deploys to a host automatically.

### OCI version labels

The infrastructure deployment verification for 0.10.0 (commit `583cae1e269b18e145851a53e55881e3c6d8e602`) reported `org.opencontainers.image.version=latest` on both published images, despite the correct package version and source revision. The user accepted this metadata exception for that deployment. Runtime health and unchanged database/TeamSpeak content were verified; infrastructure evidence is recorded in `stacks/ts-icon/README.md` in the b825-server-infrastructure repository.

The cause was `docker/metadata-action` deriving the version label from the highest-priority tag, which is the `latest` alias. Corrected in 0.11.0: both image builds now pass an explicit `org.opencontainers.image.version` from the resolved product version, and `scripts/release-images.cjs promote` re-reads the version and revision labels from each resolved digest and aborts before recording the manifest or moving any alias if either disagrees with the release. A mislabelled image therefore fails the release instead of becoming `latest`.

The 0.10.0 tags, digests and SHA candidates are preserved as published; the correction ships as a new version rather than replacing those artifacts. Verify the labels on the first 0.11.0 pair, since the label wiring itself only takes effect in a real publishing run.

## Dependencies and formatting

The lockfiles are committed and CI uses `npm ci`. The final checks on 2026-09-09 reported zero advisories for both complete npm dependency graphs and both production graphs. The backend remains on Nest 11 and Prisma 7; the frontend uses Router 7 and Vite 7. Major upgrades without a concrete need are avoided.

Two scoped overrides close advisories in Prisma CLI dependencies: `@prisma/config > deepmerge-ts` is 8.0.2 and `prisma > mysql2` is 3.24.4. The deepmerge override crosses a major boundary, so Prisma generate, actual migrations and restore are checked explicitly. Remove these overrides when Prisma selects patched versions itself. The application does not use the bundled MySQL driver. The runtime image removes development declarations from its copied manifest before `npm ci --omit=dev --omit=peer` against the committed lockfile, then asserts that the optional Prisma CLI peer is absent. This avoids npm retaining that CLI through its development declaration; native optional packages for image processing remain installed.

An additional scoped override selects Multer 2.3.0 for `@nestjs/platform-express`, whose 11.2.3 release otherwise pins Multer 2.2.0. The direct dependency alone does not replace that nested upload parser. Successful upload, size-limit rejection and unexpected-field rejection are checked through a real Nest HTTP endpoint. The frontend's Vitest family is patched to 4.1.11.

`npm run format` follows the project formatting profile: Biome 2.5.7 for JS/TS/JSX/TSX/JSON/CSS, Prettier 3.9.6 for Markdown/YAML/HTML, two spaces, 100 columns and LF. Both formatter versions are pinned exactly. Biome additionally uses double quotes and required semicolons. ESLint checks correctness independently. `.gitattributes` and `.editorconfig` keep Windows and Linux formatting consistent.
