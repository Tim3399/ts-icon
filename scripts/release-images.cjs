const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function docker(args, optional = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000, windowsHide: true });
  if (result.status !== 0 || result.error) {
    if (
      optional &&
      /not found|manifest unknown|MANIFEST_UNKNOWN|NAME_UNKNOWN/i.test(result.stderr || "")
    )
      return null;
    throw new Error(result.error?.message || result.stderr || "Docker registry operation failed");
  }
  return result.stdout.trim();
}

function readDigest(reference, optional = false) {
  const output = docker(
    ["buildx", "imagetools", "inspect", reference, "--format", "{{json .Manifest}}"],
    optional,
  );
  if (output === null) return null;
  const digest = JSON.parse(output).digest;
  if (!/^sha256:[a-f0-9]{64}$/.test(digest))
    throw new Error("Registry returned no valid image digest");
  return digest;
}

// Resolve the complete pair BEFORE touching any public alias. Injection makes
// the partial-publication/retry contract testable without writing to a registry.
function promotePair(candidates, resolve, record, promote) {
  const images = candidates.map((candidate) => {
    const digest = resolve(candidate.reference);
    if (!digest) throw new Error(`Missing candidate: ${candidate.reference}`);
    return { ...candidate, digest, immutable: `${candidate.repository}@${digest}` };
  });
  record(images);
  for (const image of images) for (const tag of image.tags) promote(tag, image.immutable);
  return images;
}

function main() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "")
  ) {
    throw new Error("Registry release operations run only in GitHub Actions.");
  }
  const owner = process.env.GITHUB_REPOSITORY_OWNER.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(owner)) throw new Error("Invalid registry owner");
  const candidates = ["backend", "frontend"].map((name) => {
    const repository = `ghcr.io/${owner}/ts-icon-${name}`;
    const reference = `${repository}:sha-${process.env.GITHUB_SHA}`;
    const tags = (process.env[`${name.toUpperCase()}_TAGS`] || "").split(/\r?\n/).filter(Boolean);
    if (tags.some((tag) => !tag.startsWith(`${repository}:`)))
      throw new Error("Unexpected release alias");
    return { name, repository, reference, tags };
  });
  if (process.argv[2] === "inspect") {
    for (const candidate of candidates) {
      const digest = readDigest(candidate.reference, true);
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${candidate.name}_candidate=${candidate.reference}\n${candidate.name}_exists=${digest !== null}\n`,
      );
    }
  } else if (process.argv[2] === "promote") {
    promotePair(
      candidates,
      readDigest,
      (images) => {
        fs.mkdirSync(".tmp", { recursive: true });
        const manifest = {
          commit: process.env.GITHUB_SHA,
          version: process.env.RELEASE_VERSION,
          images: Object.fromEntries(images.map((image) => [image.name, image.immutable])),
        };
        fs.writeFileSync(".tmp/release-images.json", `${JSON.stringify(manifest, null, 2)}\n`);
      },
      (tag, immutable) => {
        docker(["buildx", "imagetools", "create", "--tag", tag, immutable]);
      },
    );
  } else throw new Error("Use inspect or promote.");
}

module.exports = { promotePair };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
