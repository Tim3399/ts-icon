const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function publishVersionTag(head, taggedCommit) {
  return taggedCommit === null || taggedCommit === head;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout.trim();
}

function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REF !== "refs/heads/main" ||
    !process.env.GITHUB_OUTPUT
  ) {
    throw new Error("Release tagging runs only in the main-branch GitHub Actions release job.");
  }
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const frontendVersion = JSON.parse(
    fs.readFileSync("webapp-banner-tool/package.json", "utf8"),
  ).version;
  if (version !== frontendVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Both manifests must have the same valid release version.");
  }
  const head = git(["rev-parse", "HEAD"]);
  const tag = `v${version}`;
  const existing = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{}`], {
    encoding: "utf8",
  });
  const taggedCommit = existing.status === 0 ? existing.stdout.trim() : null;
  const publishVersion = publishVersionTag(head, taggedCommit);
  if (taggedCommit === null) {
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);
    // Reserve this version for this exact commit. A retry sees the same tag and
    // republishes BOTH images, repairing a failed or interrupted first attempt.
    git(["tag", tag]);
    git(["push", "origin", `refs/tags/${tag}`]);
  }
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\npublish_version=${publishVersion}\nregistry_owner=${process.env.GITHUB_REPOSITORY_OWNER.toLowerCase()}\n`,
  );
}

module.exports = { publishVersionTag };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
